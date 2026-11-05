"""Private journal: free-text entries, written by and visible to the signed-in user only.

The user always comes from the session. The text is never logged, and nothing else in the app
(the model, the summary, the Why) reads it.
"""
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.auth import as_utc, current_user, get_db, now
from backend.checkins import local_today
from backend.models import JournalEntry, User

LOGGER = logging.getLogger("mindwatch")

MAX_JOURNAL_CHARS = 2000

router = APIRouter(prefix="/me/journal", tags=["journal"])


def _clean(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("Write something first.")
    if len(value) > MAX_JOURNAL_CHARS:
        raise ValueError(f"Keep it under {MAX_JOURNAL_CHARS} characters.")
    return value


class JournalIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str
    # The phone's offset from UTC in minutes. It decides which day the entry belongs to.
    utc_offset_minutes: int = Field(..., ge=-720, le=840)

    _check_text = field_validator("text")(_clean)


class JournalEdit(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str

    _check_text = field_validator("text")(_clean)


def serialize(row: JournalEntry) -> dict:
    return {
        "id": row.id,
        "date": row.date.isoformat(),
        "text": row.text,
        "created_at": as_utc(row.created_at).isoformat(),
        "updated_at": as_utc(row.updated_at).isoformat(),
    }


def own_entry(db: Session, user: User, entry_id: str) -> JournalEntry:
    row = db.scalar(select(JournalEntry).where(JournalEntry.id == entry_id, JournalEntry.user_id == user.id))
    if row is None:
        raise HTTPException(404, "No such journal entry.")
    return row


@router.get("")
def list_entries(
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    rows = db.scalars(
        select(JournalEntry)
        .where(JournalEntry.user_id == user.id)
        .order_by(JournalEntry.created_at.desc(), JournalEntry.id.desc())
        .limit(limit)
    ).all()
    return {"entries": [serialize(row) for row in rows]}


@router.post("", status_code=201)
def create_entry(
    body: JournalIn,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    current = now(request)
    row = JournalEntry(
        id=str(uuid.uuid4()),
        user_id=user.id,
        date=local_today(current, body.utc_offset_minutes),
        text=body.text,
        created_at=current,
        updated_at=current,
    )
    db.add(row)
    db.commit()
    LOGGER.info("journal entry saved user_id=%s", user.id)
    return serialize(row)


@router.put("/{entry_id}")
def edit_entry(
    entry_id: str,
    body: JournalEdit,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    row = own_entry(db, user, entry_id)
    row.text = body.text
    row.updated_at = now(request)
    db.commit()
    LOGGER.info("journal entry updated user_id=%s", user.id)
    return serialize(row)


@router.delete("/{entry_id}", status_code=204)
def delete_entry(entry_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = own_entry(db, user, entry_id)
    db.delete(row)
    db.commit()
    LOGGER.info("journal entry deleted user_id=%s", user.id)
    return Response(status_code=204)
