"""Owner-only: load the read-only sample account with 30 real check-ins from study participant 5.

    python -m backend.scripts.seed_demo_user

Running it again replaces the sample's data, so it never doubles up. It goes through the same
training code as real users, so the model status is whatever that rule decides.

What is loaded, and what is not:
- The first 30 valid check-ins of participant 5, in date order. The study scores stress 0-100; the
  app uses 0-10, so each score is divided by 10 and rounded.
- Steps only. The study has no heart rate, and its sleep figures are a score and deep-sleep
  minutes, not total sleep time, so those stay "not available" rather than being passed off as
  something else.
- The dates are moved so the last check-in is `today`, keeping the real gaps between days. The
  streak therefore goes stale as days pass; run the script again to refresh it.

The sample has no usable password, so nobody can sign in to it by password. The study data is
credited to its authors and is shown as sample data, never as a real user.
"""
import argparse
import sys
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional

import pandas as pd
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from backend.checkins import train_user_model
from backend.db import make_engine
from backend.models import Checkin, DailyMeasurement, User, UserModel, UserSession
from backend.settings import get_settings

SAMPLE_EMAIL = "sample-account@mindwatch.example.com"
PARTICIPANT = 5
CHECKINS = 30
DATA_PATH = Path(__file__).resolve().parents[2] / "data" / "processed" / "daily_model_v2.csv"
# Not a valid password hash, so a password can never match it.
NO_PASSWORD = "!"


def study_rows(path: Path = DATA_PATH, participant: int = PARTICIPANT) -> List[dict]:
    """The first CHECKINS valid check-ins of one participant, as app-scale rows."""
    frame = pd.read_csv(path)
    person = frame[frame["participant_id"] == participant].copy()
    person["date"] = pd.to_datetime(person["date"]).dt.date
    person = person[pd.to_numeric(person["stress"], errors="coerce").between(0, 100)]
    person = person.sort_values("date").drop_duplicates("date", keep="last").head(CHECKINS)
    rows = []
    for _, r in person.iterrows():
        steps = r["daily_steps"]
        rows.append(
            {
                "date": r["date"],
                "stress": min(10, max(0, int(r["stress"] / 10 + 0.5))),
                "steps": None if pd.isna(steps) else min(200000, int(steps)),
            }
        )
    return rows


def seed(engine, today: date, rows: Optional[List[dict]] = None) -> str:
    """Create or refresh the sample account so its last check-in is `today`. Returns its user ID."""
    rows = study_rows() if rows is None else rows
    if len(rows) != CHECKINS:
        raise ValueError(f"Expected {CHECKINS} check-ins, found {len(rows)}")
    shift = today - rows[-1]["date"]
    current = datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc) + timedelta(hours=12)
    with Session(engine) as db:
        user = db.scalar(select(User).where(User.email == SAMPLE_EMAIL))
        if user is None:
            user = User(id=str(uuid.uuid4()), email=SAMPLE_EMAIL, password_hash=NO_PASSWORD, created_at=current)
            db.add(user)
        user.password_hash = NO_PASSWORD
        user.is_sample = True
        db.flush()
        for model in (Checkin, DailyMeasurement, UserModel, UserSession):
            db.execute(delete(model).where(model.user_id == user.id))
        for r in rows:
            day = r["date"] + shift
            db.add(
                Checkin(
                    id=str(uuid.uuid4()),
                    user_id=user.id,
                    date=day,
                    stress=r["stress"],
                    created_at=current,
                    updated_at=current,
                )
            )
            if r["steps"] is not None:
                db.add(
                    DailyMeasurement(
                        id=str(uuid.uuid4()),
                        user_id=user.id,
                        date=day,
                        steps=r["steps"],
                        created_at=current,
                        updated_at=current,
                    )
                )
        db.commit()
        # The same training step real check-ins use. It logs and carries on if it fails.
        train_user_model(db, user, current)
        return user.id


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Load the read-only sample account (owner only).")
    parser.add_argument("--today", type=date.fromisoformat, default=None, help="the date the last check-in lands on")
    args = parser.parse_args(argv)
    settings = get_settings()
    if not settings.database_url:
        print("DATABASE_URL is not set.", file=sys.stderr)
        return 1
    engine = make_engine(settings.database_url)
    try:
        user_id = seed(engine, args.today or datetime.now(timezone.utc).date())
    finally:
        engine.dispose()
    print(f"Sample account ready (user {user_id}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
