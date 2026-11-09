"""How you feel vs what your body shows: a simple, rule-based comparison for Home.

It looks at the two most recent consecutive days that both have a check-in and sets the person's
stress answers beside their sleep and heart-rate data. It describes a pattern only. It never names a
cause, never diagnoses, and the prediction model does not use it.
"""
from datetime import date, timedelta
from statistics import median
from typing import Dict, Iterable, List, Optional

SHORT_SLEEP_MINUTES = 300  # fewer minutes than this is a short night
PATTERN_DAYS = 2  # the pattern must show on this many days in a row
HEART_BASELINE_DAYS = 7  # earlier days with a heart-rate value needed to know what is usual
HEART_ABOVE_USUAL = 10  # beats a minute above usual before a day counts as high
FEEL_OK_MAX = 3  # stress at or below this is feeling okay
FEEL_STRESSED_MIN = 7  # stress at or above this is feeling stressed


def _window(checkin_days: set, today: date) -> Optional[List[date]]:
    end = today if today in checkin_days else today - timedelta(days=1)
    days = [end - timedelta(days=PATTERN_DAYS - 1 - i) for i in range(PATTERN_DAYS)]
    return days if all(d in checkin_days for d in days) else None


def build_body_check(checkins: Iterable, measurements: Iterable, today: date) -> Optional[Dict]:
    by_checkin = {c.date: c for c in checkins}
    by_measure = {m.date: m for m in measurements}
    days = _window(set(by_checkin), today)
    if days is None:
        return None

    stress = [by_checkin[d].stress for d in days]
    sleep = []
    for d in days:
        m = by_measure.get(d)
        minutes = m.sleep_minutes if m is not None else None
        manual = getattr(by_checkin[d], "sleep_hours", None)
        short = (minutes < SHORT_SLEEP_MINUTES) if minutes is not None else manual == "under_5"
        sleep.append({"minutes": minutes, "manual": manual, "short": bool(short), "known": minutes is not None or manual is not None})

    earlier = [m.heart_rate_avg for d, m in by_measure.items() if d < days[0] and m.heart_rate_avg is not None]
    heart = None
    if len(earlier) >= HEART_BASELINE_DAYS:
        usual = median(earlier)
        values = [(by_measure[d].heart_rate_avg if d in by_measure else None) for d in days]
        high = [v is not None and v >= usual + HEART_ABOVE_USUAL for v in values]
        heart = {"usual": usual, "values": values, "high": high}

    signals = []
    if all(s["short"] for s in sleep):
        signals.append("short_sleep")
    if heart is not None and all(heart["high"]):
        signals.append("high_heart_rate")

    feel_ok = all(s <= FEEL_OK_MAX for s in stress)
    stressed = all(s >= FEEL_STRESSED_MIN for s in stress)
    if signals and feel_ok:
        state = "body_signal_feel_ok"
    elif signals and stressed:
        state = "both"
    elif not signals and stressed and (
        all(s["known"] for s in sleep) or (heart is not None and all(v is not None for v in heart["values"]))
    ):
        state = "feel_stressed_body_usual"
    else:
        return None

    return {"state": state, "days": [d.isoformat() for d in days], "stress": stress, "sleep": sleep, "heart": heart, "signals": signals}
