"""Daily check-ins, one per person per day.

Every route works on the signed-in user's own check-ins and nothing else: the user comes from
the session, and no route takes a user ID. The demo check-in (/checkin) is separate and untouched.
"""
import json
import logging
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field, StrictInt
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.auth import as_utc, current_user, get_db, now
from backend.models import Checkin, User

LOGGER = logging.getLogger("mindwatch")

# The word of the day comes from this fixed list. A frontend test keeps the screen in step with it.
WORDS = tuple(json.loads((Path(__file__).resolve().parent / "checkin_words.json").read_text("utf-8"))["words"])

router = APIRouter(prefix="/me/checkins", tags=["checkins"])


class CheckinIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    stress: StrictInt = Field(..., ge=0, le=10)
    word: Optional[str] = None
    # The phone's offset from UTC in minutes (Singapore is +480). It decides what "today" means.
    utc_offset_minutes: int = Field(..., ge=-720, le=840)


def serialize(row: Checkin) -> dict:
    return {
        "date": row.date.isoformat(),
        "stress": row.stress,
        "word": row.word,
        "updated_at": as_utc(row.updated_at).isoformat(),
    }


def local_today(current: datetime, utc_offset_minutes: int) -> date:
    return (current + timedelta(minutes=utc_offset_minutes)).date()


def own_checkin(db: Session, user: User, day: date) -> Optional[Checkin]:
    return db.scalar(select(Checkin).where(Checkin.user_id == user.id, Checkin.date == day))


@router.put("/{day}")
def save_checkin(
    day: date,
    body: CheckinIn,
    request: Request,
    response: Response,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Create the check-in for `day`, or change it. Only the phone's today or yesterday is allowed."""
    current = now(request)
    today = local_today(current, body.utc_offset_minutes)
    if day not in (today, today - timedelta(days=1)):
        raise HTTPException(422, "You can only check in for today or yesterday.")
    if body.word is not None and body.word not in WORDS:
        raise HTTPException(422, "Pick a word from the list.")

    row = own_checkin(db, user, day)
    created = row is None
    if created:
        row = Checkin(
            id=str(uuid.uuid4()),
            user_id=user.id,
            date=day,
            stress=body.stress,
            word=body.word,
            created_at=current,
            updated_at=current,
        )
        db.add(row)
        try:
            db.commit()
        except IntegrityError:
            # A second request for the same day got in first. Treat this one as the edit.
            db.rollback()
            row = own_checkin(db, user, day)
            if row is None:
                raise
            created = False
    if not created:
        row.stress = body.stress
        row.word = body.word
        row.updated_at = current
        db.commit()
    response.status_code = 201 if created else 200
    LOGGER.info("check-in %s user_id=%s", "saved" if created else "updated", user.id)
    return serialize(row)


@router.get("")
def list_checkins(
    limit: int = Query(60, ge=1, le=366),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    rows = db.scalars(
        select(Checkin).where(Checkin.user_id == user.id).order_by(Checkin.date.desc()).limit(limit)
    ).all()
    return {"checkins": [serialize(row) for row in rows]}


@router.get("/{day}")
def get_checkin(day: date, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = own_checkin(db, user, day)
    if row is None:
        raise HTTPException(404, "No check-in for that day.")
    return serialize(row)
