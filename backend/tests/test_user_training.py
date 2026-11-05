import random
import sqlite3
import tempfile
import unittest
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient

from backend.main import create_app
from backend.settings import Settings
from backend.tests.test_auth import CODE, signup_body

START = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)
PASSWORD = "correct horse battery"


def clean_signal(i):
    """Stress follows steps exactly, so a model should beat the recent average."""
    high = i % 2 == 1
    return {"stress": 8 if high else 2, "steps": 12000 if high else 2000, "sleep": 400 + (i % 3) * 10, "hr": 80 if high else 62}


def noise(rng):
    return {
        "stress": rng.randint(0, 10),
        "steps": rng.randint(1000, 15000),
        "sleep": rng.randint(300, 540),
        "hr": rng.uniform(55, 90),
    }


class PerUserTraining(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db_path = Path(self.tmp.name) / "app.db"
        settings = Settings(database_url=f"sqlite:///{self.db_path.as_posix()}", invite_codes=(CODE,))
        self.app = create_app(state_path=Path(self.tmp.name) / "state.json", settings=settings)
        self.now = START
        self.app.state.clock = lambda: self.now
        context = TestClient(self.app)
        self.client = context.__enter__()
        self.addCleanup(context.__exit__, None, None, None)
        self.alice = self.new_user("alice@example.com")
        self.bob = self.new_user("bob@example.com")

    def new_user(self, email):
        response = self.client.post("/auth/signup", json=signup_body(email=email))
        self.assertEqual(response.status_code, 201)
        return {"Authorization": f"Bearer {response.json()['token']}"}

    def day(self, who, i, values, watch=True):
        """Day i: the watch data goes in, then the check-in."""
        self.now = START + timedelta(days=i)
        date = self.now.date().isoformat()
        if watch:
            sent = {"date": date, "steps": values["steps"], "sleep_minutes": values["sleep"], "heart_rate_avg": values["hr"]}
            response = self.client.put("/me/measurements", json={"utc_offset_minutes": 0, "days": [sent]}, headers=who)
            self.assertEqual(response.status_code, 200)
        return self.client.put(
            f"/me/checkins/{date}", json={"stress": values["stress"], "utc_offset_minutes": 0}, headers=who
        )

    def fill(self, who, count, make, watch=True):
        last = None
        for i in range(count):
            last = self.day(who, i, make(i), watch)
            self.assertEqual(last.status_code, 201)
        return last

    def models(self):
        with closing(sqlite3.connect(self.db_path)) as conn:
            return conn.execute("select user_id, status, reason, trained_on, params from user_models").fetchall()

    def test_no_training_before_30(self):
        self.fill(self.alice, 29, clean_signal)
        self.assertEqual(self.models(), [])

    def test_training_runs_at_30_and_then_every_7(self):
        self.fill(self.alice, 30, clean_signal)
        self.assertEqual([(m[1], m[3]) for m in self.models()], [("ready", 30)])
        # A login lasts 30 days, so sign in again once the test clock has moved past that.
        self.now = START + timedelta(days=30)
        login = self.client.post("/auth/login", json={"email": "alice@example.com", "password": PASSWORD})
        self.assertEqual(login.status_code, 200)
        again = {"Authorization": f"Bearer {login.json()['token']}"}
        for i in range(30, 36):
            self.assertEqual(self.day(again, i, clean_signal(i)).status_code, 201)
        self.assertEqual(self.models()[0][3], 30)  # 31 to 36 do not retrain
        self.day(again, 36, clean_signal(36))
        self.assertEqual(self.models()[0][3], 37)

    def test_failed_training_keeps_checkin(self):
        self.fill(self.alice, 29, clean_signal)
        with mock.patch("backend.checkins.user_model.train", side_effect=RuntimeError("boom")):
            response = self.day(self.alice, 29, clean_signal(29))
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["stress"], clean_signal(29)["stress"])
        listed = self.client.get("/me/checkins?limit=366", headers=self.alice).json()["checkins"]
        self.assertEqual(len(listed), 30)
        self.assertEqual(self.models(), [])

    def test_a_failed_save_of_the_model_keeps_checkin(self):
        self.fill(self.alice, 29, clean_signal)
        with mock.patch("backend.checkins.UserModel", side_effect=RuntimeError("db down")):
            response = self.day(self.alice, 29, clean_signal(29))
        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.models(), [])

    def test_weak_model_shows_not_ready(self):
        rng = random.Random(1)
        self.fill(self.alice, 30, lambda i: noise(rng))
        ((_, status, reason, trained_on, params),) = self.models()
        self.assertEqual((status, reason, trained_on, params), ("not_ready", "no_reliable_pattern", 30, None))

    def test_no_watch_means_not_ready_for_lack_of_data(self):
        rng = random.Random(2)
        self.fill(self.alice, 30, lambda i: noise(rng), watch=False)
        ((_, status, reason, _, params),) = self.models()
        self.assertEqual((status, reason, params), ("not_ready", "not_enough_watch_data", None))

    def test_users_never_share_models(self):
        self.fill(self.alice, 30, clean_signal)
        alice_id = self.models()[0][0]
        rng = random.Random(3)
        self.fill(self.bob, 30, lambda i: noise(rng))
        rows = {m[0]: m for m in self.models()}
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[alice_id][1], "ready")
        other = [m for uid, m in rows.items() if uid != alice_id][0]
        self.assertEqual(other[1], "not_ready")
        self.assertIsNone(other[4])

    def test_deleting_the_account_removes_the_model(self):
        self.fill(self.alice, 30, clean_signal)
        self.assertEqual(len(self.models()), 1)
        response = self.client.post("/me/delete", json={"password": PASSWORD}, headers=self.alice)
        self.assertEqual(response.status_code, 204)
        self.assertEqual(self.models(), [])


if __name__ == "__main__":
    unittest.main()
