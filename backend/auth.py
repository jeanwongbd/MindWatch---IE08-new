"""Accounts: sign up, log in, log out, and who-am-I.

The user is always taken from the session token, never from a request body or URL.
Logs carry user IDs only, never emails, passwords or tokens.
"""
import hashlib
import hmac
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from email_validator import EmailNotValidError, validate_email
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field, StrictInt
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.calibration import CONSENT_VERSIONS, QUESTIONS_VERSION, InvalidAnswers, validate_answers
from backend.models import (
    CalibrationAnswers,
    Checkin,
    Consent,
    DailyMeasurement,
    JournalEntry,
    LoginFailure,
    User,
    UserModel,
    UserSession,
)

LOGGER = logging.getLogger("mindwatch")

SESSION_DAYS = 30
MIN_PASSWORD = 10
MAX_PASSWORD = 128
MAX_FAILURES = 5
LOCKOUT = timedelta(minutes=15)
# Each visitor to the sample gets a private copy that lasts a day. This caps how many can exist at once.
MAX_SAMPLE_COPIES = 50
SAMPLE_COPY_DAYS = 1
SAMPLE_EMAIL_DOMAIN = "mindwatch.example.com"
# A copy has no password. Same marker the seeded template uses: it is not a valid hash, so nothing matches it.
NO_PASSWORD = "!"
# The starting-point answers given to a copy so the app treats it like someone who wears a watch.
SAMPLE_ANSWERS = {
    "usual_stress": 5,
    "sleep_hours": "7_8",
    "sleep_quality": "good",
    "activity": "lightly_active",
    "wears_watch": "yes",
    "stress_time": "evening",
}

router = APIRouter(prefix="/auth", tags=["auth"])
_hasher = PasswordHasher()
_dummy_hash: Optional[str] = None


class ConsentIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: str
    agreed: bool
    adult_confirmed: bool


class SignupIn(BaseModel):
    email: str
    password: str
    invite_code: str
    # Both are required: no account is created without recorded consent and starting-point answers.
    consent: ConsentIn
    calibration: Dict[str, Any]


class SampleIn(BaseModel):
    # The phone's offset from UTC in minutes. It decides which day is "yesterday" for the copy.
    utc_offset_minutes: StrictInt = Field(0, ge=-720, le=840)


class LoginIn(BaseModel):
    email: str
    password: str


def as_utc(value: datetime) -> datetime:
    """SQLite hands back naive times; treat them as UTC."""
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def normalize_email(raw: str) -> str:
    return validate_email(raw.strip(), check_deliverability=False).normalized.lower()


def get_db(request: Request):
    engine = request.app.state.engine
    if engine is None:
        raise HTTPException(503, "Accounts are not available right now.")
    with Session(engine) as db:
        yield db


def now(request: Request) -> datetime:
    return request.app.state.clock()


def is_sample_copy(user: User) -> bool:
    return user.sample_expires_at is not None


def user_payload(user: User) -> dict:
    """The user as the API shows it. Both the seeded template and private copies count as sample."""
    expires = user.sample_expires_at
    return {
        "id": user.id,
        "email": user.email,
        "is_sample": bool(user.is_sample) or expires is not None,
        "sample_expires_at": as_utc(expires).isoformat() if expires is not None else None,
    }


def delete_user_data(db: Session, user_id: str, email: str) -> None:
    """Remove every row about one person. The caller commits.

    Each table is cleared by name, not left to the database cascade, so that every row goes
    on any database. The user row is last because the others point at it.
    """
    for model in (Checkin, DailyMeasurement, JournalEntry, UserModel, CalibrationAnswers, Consent, UserSession):
        db.execute(delete(model).where(model.user_id == user_id))
    db.execute(delete(LoginFailure).where(LoginFailure.email == email))
    db.execute(delete(User).where(User.id == user_id))


def start_session(db: Session, user: User, current: datetime, days: int = SESSION_DAYS) -> dict:
    token = secrets.token_urlsafe(32)
    expires = current + timedelta(days=days)
    db.add(
        UserSession(
            id=str(uuid.uuid4()),
            user_id=user.id,
            token_hash=hash_token(token),
            created_at=current,
            expires_at=expires,
        )
    )
    db.commit()
    return {
        "token": token,
        "expires_at": expires.isoformat(),
        "user": user_payload(user),
    }


def bearer_token(request: Request) -> Optional[str]:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    return token.strip() if scheme.lower() == "bearer" and token.strip() else None


def current_session(request: Request, db: Session = Depends(get_db)) -> UserSession:
    """Dependency for any route that needs a logged-in user."""
    token = bearer_token(request)
    if token is None:
        raise HTTPException(401, "Not signed in.")
    row = db.scalar(select(UserSession).where(UserSession.token_hash == hash_token(token)))
    if row is None:
        raise HTTPException(401, "Not signed in.")
    if as_utc(row.expires_at) <= now(request):
        db.delete(row)
        db.commit()
        raise HTTPException(401, "Session expired. Please sign in again.")
    return row


def current_user(
    request: Request, session: UserSession = Depends(current_session), db: Session = Depends(get_db)
) -> User:
    user = db.get(User, session.user_id)
    if user is None:
        raise HTTPException(401, "Not signed in.")
    # A sample copy stops working once its day is up, even if clean-up has not removed it yet.
    if user.sample_expires_at is not None and as_utc(user.sample_expires_at) <= now(request):
        raise HTTPException(401, "Session expired. Please sign in again.")
    # Only the seeded template is read-only; copies are normal accounts. Checking here covers every route that uses this dependency.
    if user.is_sample and request.method not in ("GET", "HEAD", "OPTIONS"):
        raise HTTPException(403, "The sample account is read-only.")
    return user


def invite_code_valid(request: Request, code: str) -> bool:
    valid = False
    for allowed in request.app.state.invite_codes:
        # Compare every code, in constant time, so timing reveals nothing.
        if hmac.compare_digest(code.encode(), allowed.encode()):
            valid = True
    return valid


@router.post("/signup", status_code=201)
def signup(body: SignupIn, request: Request, db: Session = Depends(get_db)):
    if not invite_code_valid(request, body.invite_code):
        raise HTTPException(403, "Invalid invite code.")
    consent = body.consent
    if not (consent.agreed and consent.adult_confirmed):
        raise HTTPException(422, "You need to agree and confirm you are 18 or over to create an account.")
    if consent.version not in CONSENT_VERSIONS:
        raise HTTPException(422, "That consent wording is out of date. Please reload the app.")
    try:
        email = normalize_email(body.email)
    except EmailNotValidError:
        raise HTTPException(422, "Enter a valid email address.")
    if not MIN_PASSWORD <= len(body.password) <= MAX_PASSWORD:
        raise HTTPException(422, f"Password must be {MIN_PASSWORD} to {MAX_PASSWORD} characters.")
    try:
        answers = validate_answers(body.calibration)
    except InvalidAnswers:
        # Not echoed back: these are health-related answers.
        raise HTTPException(422, "Some starting-point answers are missing or not valid.")
    if db.scalar(select(User.id).where(User.email == email)) is not None:
        raise HTTPException(409, "That email is already registered.")

    current = now(request)
    user = User(
        id=str(uuid.uuid4()),
        email=email,
        password_hash=_hasher.hash(body.password),
        created_at=current,
    )
    # The account, the consent and the answers are saved together or not at all. The user row is
    # sent first, since the other two point at it, and a duplicate email shows up right here.
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "That email is already registered.")
    db.add(
        Consent(
            id=str(uuid.uuid4()),
            user_id=user.id,
            version=consent.version,
            adult_confirmed=True,
            agreed_at=current,
        )
    )
    db.add(
        CalibrationAnswers(
            user_id=user.id, questions_version=QUESTIONS_VERSION, answers=answers, created_at=current
        )
    )
    db.commit()
    LOGGER.info("account created user_id=%s", user.id)
    return start_session(db, user, current)


def _recent_failures(db: Session, email: str, current: datetime):
    since = current - LOCKOUT
    return db.execute(
        select(func.count(), func.max(LoginFailure.failed_at)).where(
            LoginFailure.email == email, LoginFailure.failed_at > since
        )
    ).one()


def _raise_if_locked(db: Session, email: str, current: datetime) -> None:
    count, latest = _recent_failures(db, email, current)
    if count >= MAX_FAILURES:
        retry_after = max(1, int((as_utc(latest) + LOCKOUT - current).total_seconds()))
        raise HTTPException(
            429, "Too many failed attempts. Try again later.", headers={"Retry-After": str(retry_after)}
        )


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def require_password(db: Session, user: User, password: str, current: datetime) -> None:
    """Check the signed-in person's password again before something that cannot be undone.

    It shares the login lockout, so a stolen session cannot be used to guess the password here.
    """
    _raise_if_locked(db, user.email, current)
    try:
        _hasher.verify(user.password_hash, password)
    except (VerificationError, InvalidHashError):
        db.add(LoginFailure(email=user.email, failed_at=current))
        db.commit()
        # 403, not 401: the person is signed in. A 401 would look like an expired session.
        raise HTTPException(403, "That password is not right.")
    db.execute(delete(LoginFailure).where(LoginFailure.email == user.email))
    db.commit()


@router.post("/login")
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    global _dummy_hash
    current = now(request)
    generic = HTTPException(401, "Wrong email or password.")
    try:
        email = normalize_email(body.email)
    except EmailNotValidError:
        raise generic

    _raise_if_locked(db, email, current)

    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        # Hash anyway so an unknown email takes about as long as a wrong password.
        if _dummy_hash is None:
            _dummy_hash = _hasher.hash("not-a-real-password")
        stored = _dummy_hash
    else:
        stored = user.password_hash
    try:
        _hasher.verify(stored, body.password)
        ok = user is not None
    except (VerificationError, InvalidHashError):
        ok = False

    if not ok:
        db.add(LoginFailure(email=email, failed_at=current))
        db.commit()
        raise generic

    db.execute(delete(LoginFailure).where(LoginFailure.email == email))
    db.commit()
    LOGGER.info("login user_id=%s", user.id)
    return start_session(db, user, current)


@router.post("/sample")
def start_sample(request: Request, body: Optional[SampleIn] = None, db: Session = Depends(get_db)):
    """Give the visitor a private copy of the sample account, with a session that lasts one day.

    The copy's 30 check-ins end on the visitor's local yesterday, so a check-in today makes 31.
    """
    from backend.checkins import local_today, train_user_model  # checkins imports this module

    template = db.scalar(select(User).where(User.is_sample.is_(True)))
    if template is None:
        raise HTTPException(404, "The sample account is not set up.")
    current = now(request)

    copies = db.scalars(select(User).where(User.sample_expires_at.is_not(None))).all()
    live = 0
    for old in copies:
        if as_utc(old.sample_expires_at) <= current:
            delete_user_data(db, old.id, old.email)
            LOGGER.info("sample copy removed user_id=%s", old.id)
        else:
            live += 1
    db.commit()
    if live >= MAX_SAMPLE_COPIES:
        raise HTTPException(429, "Too many people are trying the sample right now. Please try again later.")

    offset = body.utc_offset_minutes if body is not None else 0
    yesterday = local_today(current, offset) - timedelta(days=1)
    user = User(
        id=str(uuid.uuid4()),
        email=f"sample-{secrets.token_hex(8)}@{SAMPLE_EMAIL_DOMAIN}",
        password_hash=NO_PASSWORD,
        created_at=current,
        sample_expires_at=current + timedelta(days=SAMPLE_COPY_DAYS),
    )
    db.add(user)
    db.flush()

    source = db.scalars(select(Checkin).where(Checkin.user_id == template.id).order_by(Checkin.date)).all()
    new_day = {}
    first = yesterday - timedelta(days=len(source) - 1)
    for i, row in enumerate(source):
        new_day[row.date] = first + timedelta(days=i)
        db.add(
            Checkin(
                id=str(uuid.uuid4()),
                user_id=user.id,
                date=new_day[row.date],
                stress=row.stress,
                word=row.word,
                sleep_hours=row.sleep_hours,
                sleep_quality=row.sleep_quality,
                activity=row.activity,
                created_at=current,
                updated_at=current,
            )
        )
    for m in db.scalars(select(DailyMeasurement).where(DailyMeasurement.user_id == template.id)).all():
        if m.date in new_day:
            db.add(
                DailyMeasurement(
                    id=str(uuid.uuid4()),
                    user_id=user.id,
                    date=new_day[m.date],
                    steps=m.steps,
                    sleep_minutes=m.sleep_minutes,
                    heart_rate_avg=m.heart_rate_avg,
                    created_at=current,
                    updated_at=current,
                )
            )
    template_answers = db.get(CalibrationAnswers, template.id)
    if template_answers is not None:
        version, answers = template_answers.questions_version, dict(template_answers.answers)
    else:
        version, answers = QUESTIONS_VERSION, validate_answers(dict(SAMPLE_ANSWERS))
    db.add(CalibrationAnswers(user_id=user.id, questions_version=version, answers=answers, created_at=current))
    db.commit()
    train_user_model(db, user, current)
    LOGGER.info("sample copy created user_id=%s", user.id)
    return start_session(db, user, current, days=SAMPLE_COPY_DAYS)


@router.post("/logout", status_code=204)
def logout(session: UserSession = Depends(current_session), db: Session = Depends(get_db)):
    user_id = session.user_id
    db.delete(session)
    db.commit()
    LOGGER.info("logout user_id=%s", user_id)
    return Response(status_code=204)


@router.get("/me")
def me(user: User = Depends(current_user)):
    return user_payload(user)


class PasswordChangeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current_password: str
    new_password: str


@router.post("/password", status_code=204)
def change_password(
    body: PasswordChangeIn,
    request: Request,
    session: UserSession = Depends(current_session),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Change the password. Every other signed-in device is signed out; this one stays signed in."""
    if is_sample_copy(user):
        raise HTTPException(400, "Sample accounts have no password.")
    require_password(db, user, body.current_password, now(request))
    if not MIN_PASSWORD <= len(body.new_password) <= MAX_PASSWORD:
        raise HTTPException(422, f"Password must be {MIN_PASSWORD} to {MAX_PASSWORD} characters.")
    if body.new_password == body.current_password:
        raise HTTPException(422, "Choose a password you have not used just now.")
    user.password_hash = _hasher.hash(body.new_password)
    db.execute(delete(UserSession).where(UserSession.user_id == user.id, UserSession.id != session.id))
    db.commit()
    LOGGER.info("password changed user_id=%s", user.id)
    return Response(status_code=204)
