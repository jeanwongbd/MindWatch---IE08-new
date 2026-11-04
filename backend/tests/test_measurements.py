import sqlite3
import tempfile
import unittest
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

from fastapi.testclient import TestClient

from backend.main import create_app
from backend.settings import Settings
from backend.tests.test_auth import CODE, signup_body

# 12:00 UTC on 15 January 2026. "Today" in all of these is 15 January on a phone set to UTC.
NOW = datetime(2026, 1, 15, 12, 0, tzinfo=timezone.utc)


def day(date, steps=None, sleep=None, hr=None):
    return {"date": date, "steps": steps, "sleep_minutes": sleep, "heart_rate_avg": hr}


class WatchMeasurements(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db_path = Path(self.tmp.name) / "app.db"
        settings = Settings(database_url=f"sqlite:///{self.db_path.as_posix()}", invite_codes=(CODE,))
        self.app = create_app(state_path=Path(self.tmp.name) / "state.json", settings=settings)
        self.app.state.clock = lambda: NOW
        context = TestClient(self.app)
        self.client = context.__enter__()
        self.addCleanup(context.__exit__, None, None, None)
        self.alice = self.new_user("alice@example.com")
        self.bob = self.new_user("bob@example.com")

    def new_user(self, email):
        response = self.client.post("/auth/signup", json=signup_body(email=email))
        self.assertEqual(response.status_code, 201)
        return {"Authorization": f"Bearer {response.json()['token']}", "id": response.json()["user"]["id"]}

    def headers(self, who):
        return {"Authorization": who["Authorization"]}

    def send(self, who, days, offset=0, **extra):
        body = {"utc_offset_minutes": offset, "days": days, **extra}
        return self.client.put("/me/measurements", json=body, headers=self.headers(who))

    def listed(self, who):
        return self.client.get("/me/measurements", headers=self.headers(who)).json()["measurements"]

    def count(self, where="", args=()):
        with closing(sqlite3.connect(self.db_path)) as conn:
            return conn.execute(f"select count(*) from daily_measurements {where}", args).fetchone()[0]

    # --- saving and reading --------------------------------------------------
    def test_saves_days_and_reads_them_back_newest_first(self):
        response = self.send(self.alice, [day("2026-01-14", 8000, 435, 68.5), day("2026-01-15", 120, None, 79.0)])
        self.assertEqual((response.status_code, response.json()), (200, {"saved": 2}))
        rows = self.listed(self.alice)
        self.assertEqual(
            [(r["date"], r["steps"], r["sleep_minutes"], r["heart_rate_avg"]) for r in rows],
            [("2026-01-15", 120, None, 79.0), ("2026-01-14", 8000, 435, 68.5)],
        )

    def test_missing_watch_data_is_stored_as_empty_not_zero(self):
        self.send(self.alice, [day("2026-01-15", steps=300)])
        row = self.listed(self.alice)[0]
        self.assertEqual(row["steps"], 300)
        self.assertIsNone(row["sleep_minutes"])  # "not available", never 0
        self.assertIsNone(row["heart_rate_avg"])

    def test_a_day_with_nothing_recorded_makes_no_row(self):
        response = self.send(self.alice, [day("2026-01-14"), day("2026-01-15", steps=5)])
        self.assertEqual(response.json(), {"saved": 1})
        self.assertEqual([r["date"] for r in self.listed(self.alice)], ["2026-01-15"])

    def test_nothing_to_send_is_fine(self):
        self.assertEqual(self.send(self.alice, []).json(), {"saved": 0})

    # --- resending ----------------------------------------------------------
    def test_resend_does_not_duplicate(self):
        for _ in range(3):
            self.assertEqual(self.send(self.alice, [day("2026-01-15", 5000, 420, 70.0)]).status_code, 200)
        self.assertEqual(self.count("where user_id = ?", (self.alice["id"],)), 1)

    def test_a_resend_replaces_the_day_with_the_new_values(self):
        self.send(self.alice, [day("2026-01-15", steps=100, sleep=300, hr=60.0)])
        self.send(self.alice, [day("2026-01-15", steps=4000)])  # the watch has since synced more steps
        row = self.listed(self.alice)[0]
        self.assertEqual((row["steps"], row["sleep_minutes"], row["heart_rate_avg"]), (4000, None, None))
        self.assertEqual(self.count(), 1)

    # --- who it belongs to --------------------------------------------------
    def test_user_a_cannot_send_as_user_b(self):
        # The body cannot name a user, whatever it says.
        for extra in ({"user_id": self.bob["id"]}, {"email": "bob@example.com"}):
            self.assertEqual(self.send(self.alice, [day("2026-01-15", 1)], **extra).status_code, 422, extra)
        entry = {**day("2026-01-15", 1), "user_id": self.bob["id"]}
        self.assertEqual(self.send(self.alice, [entry]).status_code, 422)
        # Alice's own request lands on Alice only.
        self.assertEqual(self.send(self.alice, [day("2026-01-15", 777, 400, 66.0)]).status_code, 200)
        self.assertEqual(self.count("where user_id = ?", (self.bob["id"],)), 0)
        self.assertEqual(self.listed(self.bob), [])
        self.assertEqual(self.count("where user_id = ?", (self.alice["id"],)), 1)

    def test_each_person_has_their_own_row_for_the_same_day(self):
        self.send(self.alice, [day("2026-01-15", 100, 400, 60.0)])
        self.send(self.bob, [day("2026-01-15", 9000, 500, 90.0)])
        self.assertEqual(self.listed(self.alice)[0]["steps"], 100)
        self.assertEqual(self.listed(self.bob)[0]["steps"], 9000)
        self.assertEqual(self.count(), 2)

    def test_it_needs_a_login(self):
        self.assertEqual(self.client.put("/me/measurements", json={"utc_offset_minutes": 0, "days": []}).status_code, 401)
        self.assertEqual(self.client.get("/me/measurements").status_code, 401)

    # --- what is accepted ----------------------------------------------------
    def test_only_the_last_week_by_the_phones_own_date(self):
        self.assertEqual(self.send(self.alice, [day("2026-01-08", 1)]).status_code, 200)  # 7 days back
        self.assertEqual(self.send(self.alice, [day("2026-01-07", 1)]).status_code, 422)  # 8 days back
        self.assertEqual(self.send(self.alice, [day("2026-01-16", 1)]).status_code, 422)  # tomorrow
        # A phone 14 hours ahead of UTC is already on the 16th at 12:00 UTC (and one at +8h is not).
        self.assertEqual(self.send(self.alice, [day("2026-01-16", 1)], offset=840).status_code, 200)
        self.assertEqual(self.send(self.alice, [day("2026-01-16", 1)], offset=480).status_code, 422)

    def test_values_are_range_checked(self):
        bad = [
            day("2026-01-15", steps=-1),
            day("2026-01-15", steps=200001),
            day("2026-01-15", sleep=1441),
            day("2026-01-15", sleep=-5),
            day("2026-01-15", hr=19.9),
            day("2026-01-15", hr=250.1),
        ]
        for entry in bad:
            self.assertEqual(self.send(self.alice, [entry]).status_code, 422, entry)
        self.assertEqual(self.count(), 0)

    def test_only_whole_numbers_for_steps_and_sleep(self):
        for entry in (day("2026-01-15", steps=1.5), day("2026-01-15", sleep=7.25), day("2026-01-15", steps="5000")):
            self.assertEqual(self.send(self.alice, [entry]).status_code, 422, entry)

    def test_the_same_day_twice_in_one_request_is_refused(self):
        self.assertEqual(self.send(self.alice, [day("2026-01-15", 1), day("2026-01-15", 2)]).status_code, 422)

    def test_too_many_days_is_refused(self):
        days = [day(f"2026-01-{8 + i:02d}", 1) for i in range(8)]  # 8 and 9 and 10 ... 15: eight days is the limit
        self.assertEqual(self.send(self.alice, days).status_code, 200)
        self.assertEqual(self.send(self.alice, days + [day("2026-01-07", 1)]).status_code, 422)

    def test_unknown_fields_are_refused(self):
        self.assertEqual(self.send(self.alice, [{**day("2026-01-15", 1), "resting_hr": 50}]).status_code, 422)

    def test_one_bad_day_saves_nothing(self):
        response = self.send(self.alice, [day("2026-01-15", 5), day("2026-01-14", steps=-3)])
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.count(), 0)

    # --- check-ins are never affected ---------------------------------------
    def test_sync_failure_keeps_checkin(self):
        check_in = {"stress": 6, "word": "Calm", "utc_offset_minutes": 0}
        self.assertEqual(self.client.put("/me/checkins/2026-01-15", json=check_in, headers=self.headers(self.alice)).status_code, 201)
        # A rejected sync...
        self.assertEqual(self.send(self.alice, [day("2026-01-15", steps=-1)]).status_code, 422)
        # ...leaves the check-in exactly as it was, and check-ins still save.
        saved = self.client.get("/me/checkins/2026-01-15", headers=self.headers(self.alice)).json()
        self.assertEqual((saved["stress"], saved["word"]), (6, "Calm"))
        again = {**check_in, "stress": 3}
        self.assertEqual(self.client.put("/me/checkins/2026-01-15", json=again, headers=self.headers(self.alice)).status_code, 200)

    def test_the_summary_does_not_use_watch_data(self):
        self.send(self.alice, [day("2026-01-15", 5000, 420, 70.0)])
        summary = self.client.get("/me/summary?utc_offset_minutes=0", headers=self.headers(self.alice)).json()
        self.assertEqual(summary["count"], 0)
        self.assertIsNone(summary["estimate"])


if __name__ == "__main__":
    unittest.main()
