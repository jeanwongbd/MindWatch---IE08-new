"""Account control: download my data, and delete my account.

Both work only on the signed-in user's own data. Deleting needs the password again, shares the login
lockout, and removes every row about the person at once.
"""
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from backend.auth import as_utc, current_user, get_db, now, require_password
from backend.models import CalibrationAnswers, Checkin, Consent, LoginFailure, User, UserSession

LOGGER = logging.getLogger("mindwatch")

router = APIRouter(prefix="/me", tags=["account"])


class DeleteIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    password: str


def _when(value: datetime) -> str:
    return as_utc(value).isoformat()


@router.get("/export")
def export_my_data(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Everything stored about the signed-in person, and nothing about anyone else.

    It leaves out the password (even the scrambled form), sessions and login records: those are
    security data, not the person's own information.
    """
    consent = db.scalar(select(Consent).where(Consent.user_id == user.id))
    answers = db.scalar(select(CalibrationAnswers).where(CalibrationAnswers.user_id == user.id))
    checkins = db.scalars(select(Checkin).where(Checkin.user_id == user.id).order_by(Checkin.date)).all()
    body = {
        "exported_at": _when(now(request)),
        "account": {"id": user.id, "email": user.email, "created_at": _when(user.created_at)},
        "consent": (
            {
                "version": consent.version,
                "adult_confirmed": consent.adult_confirmed,
                "agreed_at": _when(consent.agreed_at),
            }
            if consent
            else None
        ),
        "starting_point_answers": (
            {
                "questions_version": answers.questions_version,
                "answers": answers.answers,
                "saved_at": _when(answers.created_at),
            }
            if answers
            else None
        ),
        "check_ins": [
            {"date": c.date.isoformat(), "stress": c.stress, "word": c.word, "saved_at": _when(c.updated_at)}
            for c in checkins
        ],
    }
    return JSONResponse(body, headers={"Content-Disposition": 'attachment; filename="mindwatch-my-data.json"'})


@router.post("/delete", status_code=204)
def delete_my_account(
    body: DeleteIn,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Delete the account and all of the person's data, immediately. It cannot be undone."""
    require_password(db, user, body.password, now(request))
    user_id, email = user.id, user.email
    # Each table is cleared by name, not left to the database cascade, so that every row goes
    # on any database. The user row is last because the others point at it.
    for model in (Checkin, CalibrationAnswers, Consent, UserSession):
        db.execute(delete(model).where(model.user_id == user_id))
    db.execute(delete(LoginFailure).where(LoginFailure.email == email))
    db.execute(delete(User).where(User.id == user_id))
    db.commit()
    LOGGER.info("account deleted user_id=%s", user_id)
    return Response(status_code=204)
