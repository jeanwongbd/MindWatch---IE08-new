import sqlite3
import tempfile
import unittest
from contextlib import closing
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from fastapi.testclient import TestClient

from backend.main import create_app
from backend.scripts.seed_demo_user import CHECKINS, SAMPLE_EMAIL, seed, study_rows
from backend.settings import Settings
from backend.tests.test_auth import CODE, PASSWORD, signup_body

NOON = datetime(2026, 1, 15, 12, 0, tzinfo=timezone.utc)
TODAY = date(2026, 1, 15)


class SampleAccount(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db_path = Path(self.tmp.name) / "app.db"
        settings = Settings(database_url=f"sqlite:///{self.db_path.as_posix()}", invite_codes=(CODE,))
        self.app = create_app(state_path=Path(self.tmp.name) / "state.json", settings=settings)
        self.now = NOON
        self.app.state.clock = lambda: self.now
        context = TestClient(self.app)
        self.client = context.__enter__()
        self.addCleanup(context.__exit__, None, None, None)

    def seed(self):
        return seed(self.app.state.engine, TODAY)

    def sample_headers(self):
        response = self.client.post("/auth/sample")
        self.assertEqual(response.status_code, 200)
        return {"Authorization": f"Bearer {response.json()['token']}"}

    def rows(self, sql):
        with closing(sqlite3.connect(self.db_path)) as conn:
            return conn.execute(sql).fetchall()

    def test_study_rows_are_thirty_whole_numbers_from_0_to_10(self):
        rows = study_rows()
        self.assertEqual(len(rows), CHECKINS)
        self.assertTrue(all(isinstance(r["stress"], int) and 0 <= r["stress"] <= 10 for r in rows))
        self.assertEqual([r["date"] for r in rows], sorted(r["date"] for r in rows))

    def test_seed_is_repeatable(self):
        first_id = self.seed()
        snapshot = self.rows("select date, stress from checkins order by date")
        self.assertEqual(len(snapshot), CHECKINS)
        self.assertEqual(self.seed(), first_id)
        self.assertEqual(self.rows("select date, stress from checkins order by date"), snapshot)
        self.assertEqual(self.rows("select count(*) from users where is_sample = 1"), [(1,)])
        self.assertEqual(self.rows("select count(*) from user_models"), [(1,)])
        self.assertEqual(snapshot[-1][0], TODAY.isoformat())

    def test_sample_is_not_set_up_until_seeded(self):
        self.assertEqual(self.client.post("/auth/sample").status_code, 404)

    def test_demo_user_is_read_only(self):
        self.seed()
        headers = self.sample_headers()
        self.assertEqual(self.client.get("/auth/me", headers=headers).json()["is_sample"], True)
        self.assertEqual(self.client.get("/me/checkins", headers=headers).status_code, 200)
        self.assertEqual(self.client.get("/me/export", headers=headers).status_code, 200)
        body = {"stress": 9, "word": None, "utc_offset_minutes": 0}
        before = self.rows("select count(*) from checkins")
        self.assertEqual(self.client.put(f"/me/checkins/{TODAY}", json=body, headers=headers).status_code, 403)
        measurement = {"utc_offset_minutes": 0, "days": [{"date": TODAY.isoformat(), "steps": 5}]}
        self.assertEqual(self.client.put("/me/measurements", json=measurement, headers=headers).status_code, 403)
        self.assertEqual(self.client.post("/me/delete", json={"password": "x"}, headers=headers).status_code, 403)
        change = {"current_password": "x", "new_password": "a brand new password"}
        self.assertEqual(self.client.post("/auth/password", json=change, headers=headers).status_code, 403)
        self.assertEqual(self.rows("select count(*) from checkins"), before)
        self.assertEqual(self.rows("select count(*) from users where is_sample = 1"), [(1,)])

    def test_demo_runs_real_pipeline(self):
        self.seed()
        headers = self.sample_headers()
        summary = self.client.get("/me/summary?utc_offset_minutes=0", headers=headers).json()
        self.assertEqual((summary["count"], summary["progress"]), (CHECKINS, {"done": CHECKINS, "goal": 30}))
        self.assertIsNone(summary["estimate"])
        # Training ran through the same code real check-ins use. Steps alone are not enough to fit.
        self.assertEqual(
            self.rows("select status, reason, trained_on from user_models"),
            [("not_ready", "not_enough_watch_data", CHECKINS)],
        )

    def test_nobody_can_sign_in_to_the_sample_by_password_or_take_its_email(self):
        self.seed()
        for password in (PASSWORD, "", "!"):
            response = self.client.post("/auth/login", json={"email": SAMPLE_EMAIL, "password": password})
            self.assertEqual(response.status_code, 401)
        signup = self.client.post("/auth/signup", json=signup_body(email=SAMPLE_EMAIL))
        self.assertEqual(signup.status_code, 409)

    def test_the_sample_session_lasts_one_day(self):
        self.seed()
        headers = self.sample_headers()
        self.now = NOON + timedelta(days=2)
        self.assertEqual(self.client.get("/auth/me", headers=headers).status_code, 401)

    def test_real_users_are_unaffected(self):
        self.seed()
        response = self.client.post("/auth/signup", json=signup_body(email="alice@example.com"))
        self.assertEqual(response.status_code, 201)
        self.assertFalse(response.json()["user"]["is_sample"])
        headers = {"Authorization": f"Bearer {response.json()['token']}"}
        body = {"stress": 4, "word": None, "utc_offset_minutes": 0}
        self.assertEqual(self.client.put(f"/me/checkins/{TODAY}", json=body, headers=headers).status_code, 201)
        mine = self.client.get("/me/checkins", headers=headers).json()["checkins"]
        self.assertEqual(len(mine), 1)


if __name__ == "__main__":
    unittest.main()
