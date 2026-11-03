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
from pydantic import BaseModel, ConfigDict
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.calibration import CONSENT_VERSIONS, QUESTIONS_VERSION, InvalidAnswers, validate_answers
from backend.models import CalibrationAnswers, Consent, LoginFailure, User, UserSession

LOGGER = logging.getLogger("mindwatch")

SESSION_DAYS = 30
MIN_PASSWORD = 10
MAX_PASSWORD = 128
MAX_FAILURES = 5
LOCKOUT = timedelta(minutes=15)

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


def start_session(db: Session, user: User, current: datetime) -> dict:
    token = secrets.token_urlsafe(32)
    expires = current + timedelta(days=SESSION_DAYS)
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
        "user": {"id": user.id, "email": user.email},
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


def current_user(session: UserSession = Depends(current_session), db: Session = Depends(get_db)) -> User:
    user = db.get(User, session.user_id)
    if user is None:
        raise HTTPException(401, "Not signed in.")
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


@router.post("/logout", status_code=204)
def logout(session: UserSession = Depends(current_session), db: Session = Depends(get_db)):
    user_id = session.user_id
    db.delete(session)
    db.commit()
    LOGGER.info("logout user_id=%s", user_id)
    return Response(status_code=204)


@router.get("/me")
def me(user: User = Depends(current_user)):
    return {"id": user.id, "email": user.email}


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
