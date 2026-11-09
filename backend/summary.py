"""A personal summary for Home: the person's usual level, their recent level, and how today compares.

Worked out from the signed-in user's own check-ins each time it is asked for, so there is no extra
table. It never claims a cause, and it never gives an estimate from a trained model: "estimate" is always null until a
personal model has been trained and tested, in a later task.
"""
from collections import Counter
from datetime import date, timedelta
from statistics import mean
from typing import Dict, List, Optional, Set

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.auth import current_user, get_db, now
from backend.checkins import local_today
from backend.body_check import build_body_check
from backend.models import CalibrationAnswers, Checkin, DailyMeasurement, User
from ml.src.expected import day_inputs, expected_stress

router = APIRouter(prefix="/me", tags=["summary"])

GOAL = 30  # check-ins in the first stretch
MIN_FOR_AVERAGES = 3  # fewer than this and an average says nothing
RECENT_DAYS = 7
COMPARE_THRESHOLD = 1.5  # points on the 0 to 10 scale before today counts as higher or lower
WORDS_SHOWN = 5
ENERGY_SHOWN = 5
# Home shows a calm "there are people you can talk to" message when the person's most recent
# check-ins, all within the last week, are each this high. It points to help and never diagnoses.
SUPPORT_CHECKINS = 3
SUPPORT_STRESS = 8
# The Why tab says nothing about a pattern until the person has checked in on this many different days.
WHY_MIN_DAYS = 7


def _round(value: float) -> float:
    return round(value, 1)


def streaks(days: Set[date], today: date) -> Dict:
    """Consecutive days with a check-in, whatever the stress score.

    The current streak runs back from today. If today has no check-in yet but yesterday does, it is
    still going (status "waiting"): a day is not missed until it has ended. A late check-in for
    yesterday counts, because this works from the check-in dates. The best streak is the longest run
    ever, so a missed day never lowers it. Dates after today (from a time-zone change) are ignored
    for the current streak.
    """
    one_day = timedelta(days=1)
    cursor = today if today in days else (today - one_day if (today - one_day) in days else None)
    current = 0
    while cursor is not None and cursor in days:
        current += 1
        cursor -= one_day
    status = "building" if today in days else ("waiting" if current > 0 else "none")

    best = run = 0
    previous: Optional[date] = None
    for day in sorted(days):
        run = run + 1 if previous is not None and day - previous == one_day else 1
        best = max(best, run)
        previous = day
    return {"current": current, "best": best, "status": status}


def _compare(value: float, usual: float) -> str:
    diff = value - usual
    return "higher" if diff >= COMPARE_THRESHOLD else "lower" if diff <= -COMPARE_THRESHOLD else "about"


def build_expected(rows: List[Checkin], today: date, measurements: List[DailyMeasurement], prior: Optional[float]) -> Optional[Dict]:
    """A rough guess for today from this person's own past days (see ml/src/expected.py).

    Past days are every check-in day before today. It is worked out on the spot and never stored.
    """
    by_measure = {m.date: m for m in measurements}
    today_row = next((r for r in rows if r.date == today), None)
    history = [
        {"stress": r.stress, **day_inputs(by_measure.get(r.date), r)} for r in rows if r.date < today
    ]
    guess = expected_stress(history, day_inputs(by_measure.get(today), today_row), prior)
    if guess is None:
        return None
    today_stress = today_row.stress if today_row is not None else None
    return {
        **guess,
        "today_stress": today_stress,
        "label": _compare(today_stress, guess["value"]) if today_stress is not None else None,
    }


def build_why(rows: List[Checkin], today: date, usual_raw: Optional[float], today_row, recent: List[Checkin], expected: Optional[Dict] = None) -> Dict:
    """What the Why tab may say: how today sits against what we'd expect, and this week against the person's own usual.

    It describes a pattern and never gives a cause. Until WHY_MIN_DAYS different days have a
    check-in, it only reports how many there are.
    """
    have = len({r.date for r in rows})
    if have < WHY_MIN_DAYS or usual_raw is None:
        return {"ready": False, "have": have, "need": WHY_MIN_DAYS, "today": None, "week": None}
    week = _compare(mean(r.stress for r in recent), usual_raw) if len(recent) >= MIN_FOR_AVERAGES else None
    return {
        "ready": True,
        "have": have,
        "need": WHY_MIN_DAYS,
        "today": expected["label"] if expected is not None else (_compare(today_row.stress, usual_raw) if today_row is not None else None),
        "week": week,
    }


def build_summary(
    rows: List[Checkin],
    today: date,
    measurements: Optional[List[DailyMeasurement]] = None,
    usual_stress: Optional[float] = None,
) -> Dict:
    expected = build_expected(rows, today, measurements or [], usual_stress)
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

    newest = sorted(recent, key=lambda r: r.date, reverse=True)[:SUPPORT_CHECKINS]
    support_suggested = len(newest) == SUPPORT_CHECKINS and all(r.stress >= SUPPORT_STRESS for r in newest)

    today_vs_usual = None
    if today_row is not None and usual_raw is not None:
        today_vs_usual = {"label": _compare(today_row.stress, usual_raw)}

    # The words used in the last 7 days: most often first, then the most recently used.
    counts = Counter(r.word for r in recent if r.word)
    latest = {}
    for r in recent:
        if r.word and (r.word not in latest or r.date > latest[r.word]):
            latest[r.word] = r.date
    ranked = sorted(counts, key=lambda w: (-counts[w], -latest[w].toordinal(), w))
    recent_words = [{"word": w, "count": counts[w]} for w in ranked[:WORDS_SHOWN]]

    # Energy tags over the same window, ranked the same way as the words.
    e_counts = Counter(t for r in recent for t in (r.energy or []))
    e_latest = {}
    for r in recent:
        for t in r.energy or []:
            if t not in e_latest or r.date > e_latest[t]:
                e_latest[t] = r.date
    e_ranked = sorted(e_counts, key=lambda t: (-e_counts[t], -e_latest[t].toordinal(), t))
    recent_energy = [{"tag": t, "count": e_counts[t]} for t in e_ranked[:ENERGY_SHOWN]]

    return {
        "today": today.isoformat(),
        "count": count,
        "progress": {"done": min(count, GOAL), "goal": GOAL},
        "today_checkin": {"stress": today_row.stress, "word": today_row.word} if today_row else None,
        "usual": usual,
        "recent_7d": recent_7d,
        "today_vs_usual": today_vs_usual,
        "recent_words": recent_words,
        "recent_energy": recent_energy,
        "streak": streaks({r.date for r in rows}, today),
        "support_suggested": support_suggested,
        "expected": expected,
        "why": build_why(rows, today, usual_raw, today_row, recent, expected),
        "body_check": build_body_check(rows, measurements or [], today),
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
    measurements = list(db.scalars(select(DailyMeasurement).where(DailyMeasurement.user_id == user.id)).all())
    starting = db.get(CalibrationAnswers, user.id)
    prior = starting.answers.get("usual_stress") if starting is not None else None
    return build_summary(rows, local_today(now(request), utc_offset_minutes), measurements, prior)
