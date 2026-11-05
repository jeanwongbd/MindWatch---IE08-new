"""Account control: download my data, and delete my account.

Both work only on the signed-in user's own data. Deleting needs the password again, shares the login
lockout, and removes every row about the person at once.
"""
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.auth import as_utc, current_user, delete_user_data, get_db, is_sample_copy, now, require_password
from backend.models import (
    CalibrationAnswers,
    Checkin,
    Consent,
    DailyMeasurement,
    JournalEntry,
    User,
)

LOGGER = logging.getLogger("mindwatch")

router = APIRouter(prefix="/me", tags=["account"])


class DeleteIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Required for everyone except a sample copy, which has no password.
    password: Optional[str] = None


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
    measurements = db.scalars(
        select(DailyMeasurement).where(DailyMeasurement.user_id == user.id).order_by(DailyMeasurement.date)
    ).all()
    journal = db.scalars(
        select(JournalEntry).where(JournalEntry.user_id == user.id).order_by(JournalEntry.created_at, JournalEntry.id)
    ).all()
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
            {
                "date": c.date.isoformat(),
                "stress": c.stress,
                "word": c.word,
                "sleep_hours": c.sleep_hours,
                "sleep_quality": c.sleep_quality,
                "activity": c.activity,
                "saved_at": _when(c.updated_at),
            }
            for c in checkins
        ],
        "watch_data": [
            {
                "date": m.date.isoformat(),
                "steps": m.steps,
                "sleep_minutes": m.sleep_minutes,
                "heart_rate_avg": m.heart_rate_avg,
                "saved_at": _when(m.updated_at),
            }
            for m in measurements
        ],
        "journal": [
            {
                "id": j.id,
                "date": j.date.isoformat(),
                "text": j.text,
                "created_at": _when(j.created_at),
                "updated_at": _when(j.updated_at),
            }
            for j in journal
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
    # A sample copy has no password, so it is the one kind of account that skips the check.
    if not is_sample_copy(user):
        if body.password is None:
            raise HTTPException(422, "Enter your password to delete your account.")
        require_password(db, user, body.password, now(request))
    user_id = user.id
    delete_user_data(db, user_id, user.email)
    db.commit()
    LOGGER.info("account deleted user_id=%s", user_id)
    return Response(status_code=204)
