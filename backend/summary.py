"""A personal summary for Home: the person's usual level, their recent level, and how today compares.

Worked out from the signed-in user's own check-ins each time it is asked for, so there is no extra
table. It never claims a cause, and it never gives an estimate: "estimate" is always null until a
personal model has been trained and tested, in a later task.
"""
from collections import Counter
from datetime import date, timedelta
from statistics import mean
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.auth import current_user, get_db, now
from backend.checkins import local_today
from backend.models import Checkin, User

router = APIRouter(prefix="/me", tags=["summary"])

GOAL = 30  # check-ins in the first stretch
MIN_FOR_AVERAGES = 3  # fewer than this and an average says nothing
RECENT_DAYS = 7
COMPARE_THRESHOLD = 1.5  # points on the 0 to 10 scale before today counts as higher or lower
WORDS_SHOWN = 5


def _round(value: float) -> float:
    return round(value, 1)


def build_summary(rows: List[Checkin], today: date) -> Dict:
    count = len(rows)
    today_row = next((r for r in rows if r.date == today), None)

    usual_raw: Optional[float] = mean(r.stress for r in rows) if count >= MIN_FOR_AVERAGES else None
    usual = {"value": _round(usual_raw), "based_on": count} if usual_raw is not None else None

    window_start = today - timedelta(days=RECENT_DAYS - 1)
    recent = [r for r in rows if window_start <= r.date <= today]
    recent_7d = (
        {"value": _round(mean(r.stress for r in recent)), "based_on": len(recent), "days": RECENT_DAYS}
        if len(recent) >= MIN_FOR_AVERAGES
        else None
    )

    today_vs_usual = None
    if today_row is not None and usual_raw is not None:
        diff = today_row.stress - usual_raw
        label = "higher" if diff >= COMPARE_THRESHOLD else "lower" if diff <= -COMPARE_THRESHOLD else "about"
        today_vs_usual = {"label": label}

    # The words used in the last 7 days: most often first, then the most recently used.
    counts = Counter(r.word for r in recent if r.word)
    latest = {}
    for r in recent:
        if r.word and (r.word not in latest or r.date > latest[r.word]):
            latest[r.word] = r.date
    ranked = sorted(counts, key=lambda w: (-counts[w], -latest[w].toordinal(), w))
    recent_words = [{"word": w, "count": counts[w]} for w in ranked[:WORDS_SHOWN]]

    return {
        "today": today.isoformat(),
        "count": count,
        "progress": {"done": min(count, GOAL), "goal": GOAL},
        "today_checkin": {"stress": today_row.stress, "word": today_row.word} if today_row else None,
        "usual": usual,
        "recent_7d": recent_7d,
        "today_vs_usual": today_vs_usual,
        "recent_words": recent_words,
        "estimate": None,
    }


@router.get("/summary")
def summary(
    request: Request,
    utc_offset_minutes: int = Query(..., ge=-720, le=840),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    rows = list(db.scalars(select(Checkin).where(Checkin.user_id == user.id)).all())
    return build_summary(rows, local_today(now(request), utc_offset_minutes))
