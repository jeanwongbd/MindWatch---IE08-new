"""Daily watch data (steps, sleep, heart rate) read from Health Connect on the phone.

Every route works on the signed-in user's own rows and nothing else: the user comes from the
session, and no route or body takes a user ID. Sending a day again replaces that day, so a resend
never makes a duplicate. A value that is missing stays empty ("not available"), never zero.
"""
import logging
import uuid
from datetime import date, datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field, StrictInt
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.auth import as_utc, current_user, get_db, now
from backend.checkins import local_today
from backend.models import DailyMeasurement, User

LOGGER = logging.getLogger("mindwatch")

router = APIRouter(prefix="/me/measurements", tags=["measurements"])

MAX_DAYS = 8  # the phone sends the last 7 days plus today, at most
WINDOW_DAYS = 7  # how far back a day may be, counted from the phone's today


class DayIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    date: date
    steps: Optional[StrictInt] = Field(None, ge=0, le=200000)
    # Total sleep for the day, in minutes.
    sleep_minutes: Optional[StrictInt] = Field(None, ge=0, le=1440)
    # The day's average heart rate, in beats per minute.
    heart_rate_avg: Optional[float] = Field(None, ge=20, le=250, allow_inf_nan=False)

    def is_empty(self) -> bool:
        return self.steps is None and self.sleep_minutes is None and self.heart_rate_avg is None


class MeasurementsIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # The phone's offset from UTC in minutes. It decides what "today" means.
    utc_offset_minutes: int = Field(..., ge=-720, le=840)
    days: List[DayIn] = Field(..., max_length=MAX_DAYS)


def serialize(row: DailyMeasurement) -> dict:
    return {
        "date": row.date.isoformat(),
        "steps": row.steps,
        "sleep_minutes": row.sleep_minutes,
        "heart_rate_avg": row.heart_rate_avg,
        "updated_at": as_utc(row.updated_at).isoformat(),
    }


def _save(db: Session, user: User, days: List[DayIn], current: datetime) -> int:
    saved = 0
    existing = {
        row.date: row
        for row in db.scalars(
            select(DailyMeasurement).where(
                DailyMeasurement.user_id == user.id, DailyMeasurement.date.in_([d.date for d in days])
            )
        )
    }
    for day in days:
        row = existing.get(day.date)
        if row is None:
            if day.is_empty():
                continue  # nothing recorded and nothing stored: no row to make
            row = DailyMeasurement(
                id=str(uuid.uuid4()), user_id=user.id, date=day.date, created_at=current, updated_at=current
            )
            db.add(row)
        row.steps = day.steps
        row.sleep_minutes = day.sleep_minutes
        row.heart_rate_avg = day.heart_rate_avg
        row.updated_at = current
        saved += 1
    db.commit()
    return saved


@router.put("")
def save_measurements(
    body: MeasurementsIn,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Store the phone's last few days of watch data for the signed-in person, replacing any resend."""
    current = now(request)
    today = local_today(current, body.utc_offset_minutes)
    seen = set()
    for day in body.days:
        if day.date in seen:
            raise HTTPException(422, "Each day can only be sent once.")
        seen.add(day.date)
        if not today - timedelta(days=WINDOW_DAYS) <= day.date <= today:
            raise HTTPException(422, "Only the last week can be sent.")
    try:
        saved = _save(db, user, body.days, current)
    except IntegrityError:
        # A second request for the same day got in first. Try once more, as an edit.
        db.rollback()
        saved = _save(db, user, body.days, current)
    LOGGER.info("measurements saved user_id=%s days=%d", user.id, saved)
    return {"saved": saved}


@router.get("")
def list_measurements(
    limit: int = Query(14, ge=1, le=366),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    rows = db.scalars(
        select(DailyMeasurement)
        .where(DailyMeasurement.user_id == user.id)
        .order_by(DailyMeasurement.date.desc())
        .limit(limit)
    ).all()
    return {"measurements": [serialize(row) for row in rows]}
