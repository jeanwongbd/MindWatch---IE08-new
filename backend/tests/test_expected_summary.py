import tempfile
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient

from backend.main import create_app
from backend.scripts.seed_demo_user import seed
from backend.settings import Settings
from backend.summary import build_summary
from backend.tests.test_auth import CODE, signup_body
from backend.tests.test_summary import TODAY_DATE

NOON = datetime(2026, 2, 1, 12, 0, tzinfo=timezone.utc)


def row(days_ago, stress):
    return SimpleNamespace(date=TODAY_DATE - timedelta(days=days_ago), stress=stress, word=None, energy=None)


class ExpectedRule(unittest.TestCase):
    def test_summary_has_expected_from_day_1(self):
        s = build_summary([row(0, 6)], TODAY_DATE, [], 4)
        self.assertEqual(s["expected"]["value"], 4.0)
        self.assertEqual(s["expected"]["days_used"], 0)
        self.assertFalse(s["why"]["ready"])  # the rest of the Why page is still held back
        self.assertIsNone(build_summary([], TODAY_DATE, [], None)["expected"])

    def test_label_compares_today_with_expected(self):
        history = [row(i, 4) for i in range(1, 6)]
        cases = [(8, "higher"), (6, "higher"), (5, "about"), (4, "about"), (3, "about"), (2, "lower"), (0, "lower")]
        for stress, label in cases:
            e = build_summary(history + [row(0, stress)], TODAY_DATE, [], None)["expected"]
            self.assertEqual((e["value"], e["today_stress"], e["label"]), (4.0, stress, label))

    def test_no_checkin_today_has_null_label(self):
        e = build_summary([row(i, 4) for i in range(1, 6)], TODAY_DATE, [], None)["expected"]
        self.assertIsNone(e["label"])
        self.assertIsNone(e["today_stress"])
        self.assertEqual(e["days_used"], 5)

    def test_why_today_uses_expected_once_ready(self):
        rows = [row(i, 4) for i in range(1, 8)] + [row(0, 9)]
        s = build_summary(rows, TODAY_DATE, [], None)
        self.assertEqual(s["why"]["today"], "higher")
        self.assertEqual(s["today_vs_usual"]["label"], "higher")  # kept for now


class ExpectedRoute(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        db = Path(self.tmp.name) / "app.db"
        settings = Settings(database_url=f"sqlite:///{db.as_posix()}", invite_codes=(CODE,))
        self.app = create_app(state_path=Path(self.tmp.name) / "s.json", settings=settings)
        self.now = NOON
        self.app.state.clock = lambda: self.now
        context = TestClient(self.app)
        self.client = context.__enter__()
        self.addCleanup(context.__exit__, None, None, None)

    def new_user(self, email):
        response = self.client.post("/auth/signup", json=signup_body(email=email))
        self.assertEqual(response.status_code, 201)
        return {"Authorization": f"Bearer {response.json()['token']}"}

    def summary(self, who):
        return self.client.get("/me/summary", params={"utc_offset_minutes": 0}, headers=who).json()

    def test_new_account_gets_starting_answer_guess(self):
        e = self.summary(self.new_user("a@example.com"))["expected"]
        self.assertEqual(e, {"value": 4.0, "inputs": [], "days_used": 0, "today_stress": None, "label": None})

    def test_user_a_data_never_used_for_user_b(self):
        alice, bob = self.new_user("alice@example.com"), self.new_user("bob@example.com")
        days = [{"date": (NOON - timedelta(days=i)).date().isoformat(), "steps": 1000 * (i % 5),
                 "sleep_minutes": 400, "heart_rate_avg": 60 + i} for i in range(1, 8)]
        self.assertEqual(self.client.put("/me/measurements", json={"utc_offset_minutes": 0, "days": days}, headers=alice).status_code, 200)
        for i in range(1, 8):
            self.now = NOON - timedelta(days=i)  # check in on the day itself
            day = self.now.date().isoformat()
            body = {"stress": 9, "word": None, "utc_offset_minutes": 0}
            self.assertEqual(self.client.put(f"/me/checkins/{day}", json=body, headers=alice).status_code, 201)
        self.now = NOON
        self.assertGreater(self.summary(alice)["expected"]["value"], 7)
        self.assertEqual(self.summary(bob)["expected"]["value"], 4.0)
        self.assertEqual(self.summary(bob)["expected"]["days_used"], 0)

    def test_sample_copy_gets_a_guess(self):
        seed(self.app.state.engine, NOON.date())
        token = self.client.post("/auth/sample").json()["token"]
        e = self.summary({"Authorization": f"Bearer {token}"})["expected"]
        self.assertIsNotNone(e)
        self.assertGreater(e["days_used"], 0)
        self.assertGreaterEqual(e["value"], 0)


if __name__ == "__main__":
    unittest.main()
