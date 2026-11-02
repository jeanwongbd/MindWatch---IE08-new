import tempfile
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient

from backend.main import create_app
from backend.settings import Settings
from backend.summary import build_summary
from backend.tests.test_auth import CODE, signup_body

# "Today" in all of these is 1 February 2026 (12:00 UTC).
TODAY_DATE = date(2026, 2, 1)
NOON = datetime(2026, 2, 1, 12, 0, tzinfo=timezone.utc)


def row(days_ago, stress, word=None):
    return SimpleNamespace(date=TODAY_DATE - timedelta(days=days_ago), stress=stress, word=word)


class SummaryRule(unittest.TestCase):
    """The arithmetic on its own, with no server."""

    def test_nothing_yet(self):
        s = build_summary([], TODAY_DATE)
        self.assertEqual((s["count"], s["usual"], s["recent_7d"], s["today_vs_usual"]), (0, None, None, None))
        self.assertEqual(s["progress"], {"done": 0, "goal": 30})
        self.assertIsNone(s["today_checkin"])
        self.assertEqual(s["recent_words"], [])

    def test_averages_need_three_check_ins(self):
        self.assertIsNone(build_summary([row(0, 4), row(1, 6)], TODAY_DATE)["usual"])
        usual = build_summary([row(0, 4), row(1, 6), row(2, 5)], TODAY_DATE)["usual"]
        self.assertEqual(usual, {"value": 5.0, "based_on": 3})

    def test_recent_level_only_counts_the_last_seven_days(self):
        rows = [row(0, 2), row(3, 4), row(6, 6), row(7, 10), row(30, 10)]  # the last two are outside
        recent = build_summary(rows, TODAY_DATE)["recent_7d"]
        self.assertEqual(recent, {"value": 4.0, "based_on": 3, "days": 7})
        usual = build_summary(rows, TODAY_DATE)["usual"]
        self.assertEqual(usual["based_on"], 5)

    def test_recent_level_needs_three_check_ins_in_the_window(self):
        rows = [row(0, 2), row(1, 4), row(20, 6), row(25, 6)]
        self.assertIsNone(build_summary(rows, TODAY_DATE)["recent_7d"])

    def test_today_compared_with_usual(self):
        base = [row(1, 4), row(2, 4), row(3, 4), row(4, 4)]
        cases = [(8, "higher"), (6, "higher"), (5, "about"), (4, "about"), (3, "about"), (2, "lower"), (0, "lower")]
        for stress, expected in cases:
            s = build_summary(base + [row(0, stress)], TODAY_DATE)
            self.assertEqual(s["today_vs_usual"], {"label": expected}, stress)

    def test_no_comparison_without_a_check_in_today(self):
        s = build_summary([row(1, 4), row(2, 4), row(3, 4)], TODAY_DATE)
        self.assertIsNotNone(s["usual"])
        self.assertIsNone(s["today_vs_usual"])
        self.assertIsNone(s["today_checkin"])

    def test_missed_days_do_not_count_against_anyone(self):
        s = build_summary([row(0, 3), row(10, 5), row(20, 7)], TODAY_DATE)
        self.assertEqual(s["usual"], {"value": 5.0, "based_on": 3})
        self.assertEqual(s["progress"]["done"], 3)

    def test_words_are_the_last_seven_days_most_common_first(self):
        rows = [
            row(0, 3, "Tired"), row(1, 3, "Calm"), row(2, 3, "Calm"), row(3, 3, "Tired"),
            row(4, 3, "Sad"), row(5, 3, None), row(20, 3, "Lonely"),
        ]
        words = build_summary(rows, TODAY_DATE)["recent_words"]
        # Tired and Calm are tied on two; Tired was used more recently. Lonely is too old.
        self.assertEqual(words, [{"word": "Tired", "count": 2}, {"word": "Calm", "count": 2}, {"word": "Sad", "count": 1}])

    def test_progress_stops_at_the_goal(self):
        s = build_summary([row(i, 5) for i in range(40)], TODAY_DATE)
        self.assertEqual(s["progress"], {"done": 30, "goal": 30})
        self.assertEqual(s["count"], 40)

    def test_no_estimate_before_ready(self):
        for n in range(0, 41):
            s = build_summary([row(i, i % 11, "Calm") for i in range(n)], TODAY_DATE)
            self.assertIn("estimate", s)
            self.assertIsNone(s["estimate"], f"{n} check-ins")


class SummaryRoute(unittest.TestCase):
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
        self.alice = self.new_user("alice@example.com")
        self.bob = self.new_user("bob@example.com")

    def new_user(self, email):
        response = self.client.post("/auth/signup", json=signup_body(email=email))
        self.assertEqual(response.status_code, 201)
        return {"Authorization": f"Bearer {response.json()['token']}"}

    def check_in_every_day(self, who, days, stress=lambda i: 4, word=lambda i: None):
        """Check in once a day for `days` days, ending today, then leave the clock on today."""
        for i in range(days):
            self.now = NOON - timedelta(days=days - 1 - i)
            day = self.now.date().isoformat()
            body = {"stress": stress(i), "word": word(i), "utc_offset_minutes": 0}
            response = self.client.put(f"/me/checkins/{day}", json=body, headers=who)
            self.assertEqual(response.status_code, 201, day)
        self.now = NOON

    def summary(self, who, offset=0):
        response = self.client.get("/me/summary", params={"utc_offset_minutes": offset}, headers=who)
        self.assertEqual(response.status_code, 200)
        return response.json()

    # --- the four stages the plan names -----------------------------------
    def test_day_1(self):
        self.check_in_every_day(self.alice, 1, stress=lambda i: 6, word=lambda i: "Tired")
        s = self.summary(self.alice)
        self.assertEqual(s["count"], 1)
        self.assertEqual(s["progress"], {"done": 1, "goal": 30})
        self.assertEqual(s["today_checkin"], {"stress": 6, "word": "Tired"})
        self.assertIsNone(s["usual"])
        self.assertIsNone(s["recent_7d"])
        self.assertIsNone(s["today_vs_usual"])

    def test_day_3(self):
        self.check_in_every_day(self.alice, 3, stress=lambda i: [4, 4, 5][i])
        s = self.summary(self.alice)
        self.assertEqual(s["count"], 3)
        self.assertEqual(s["usual"], {"value": 4.3, "based_on": 3})
        self.assertEqual(s["recent_7d"], {"value": 4.3, "based_on": 3, "days": 7})
        self.assertEqual(s["today_vs_usual"], {"label": "about"})

    def test_day_12(self):
        self.check_in_every_day(self.alice, 12, stress=lambda i: 3 if i < 11 else 9, word=lambda i: "Calm" if i < 8 else "Tired")
        s = self.summary(self.alice)
        self.assertEqual(s["count"], 12)
        self.assertEqual(s["progress"], {"done": 12, "goal": 30})
        self.assertEqual(s["usual"]["based_on"], 12)
        self.assertEqual(s["recent_7d"]["based_on"], 7)
        self.assertEqual(s["today_vs_usual"], {"label": "higher"})
        self.assertEqual(s["recent_words"][0], {"word": "Tired", "count": 4})

    def test_day_30(self):
        self.check_in_every_day(self.alice, 30, stress=lambda i: 5)
        s = self.summary(self.alice)
        self.assertEqual(s["count"], 30)
        self.assertEqual(s["progress"], {"done": 30, "goal": 30})
        self.assertEqual(s["usual"], {"value": 5.0, "based_on": 30})
        self.assertEqual(s["today_vs_usual"], {"label": "about"})
        self.assertIsNone(s["estimate"])  # no model exists yet, so nothing is estimated

    def test_no_estimate_before_ready(self):
        self.check_in_every_day(self.bob, 1)
        self.check_in_every_day(self.alice, 30)
        self.assertIsNone(self.summary(self.alice)["estimate"])
        self.assertIsNone(self.summary(self.bob)["estimate"])

    # --- whose data, who may ask ------------------------------------------
    def test_a_summary_only_counts_the_users_own_check_ins(self):
        self.check_in_every_day(self.alice, 4, stress=lambda i: 2)
        self.check_in_every_day(self.bob, 6, stress=lambda i: 9, word=lambda i: "Sad")
        a, b = self.summary(self.alice), self.summary(self.bob)
        self.assertEqual((a["count"], a["usual"]["value"], a["recent_words"]), (4, 2.0, []))
        self.assertEqual((b["count"], b["usual"]["value"]), (6, 9.0))

    def test_login_is_required(self):
        response = self.client.get("/me/summary", params={"utc_offset_minutes": 0})
        self.assertEqual(response.status_code, 401)
        made_up = {"Authorization": "Bearer made-up"}
        self.assertEqual(self.client.get("/me/summary", params={"utc_offset_minutes": 0}, headers=made_up).status_code, 401)

    def test_the_offset_is_required_and_must_be_possible(self):
        self.assertEqual(self.client.get("/me/summary", headers=self.alice).status_code, 422)
        for bad in (841, -721):
            self.assertEqual(
                self.client.get("/me/summary", params={"utc_offset_minutes": bad}, headers=self.alice).status_code, 422
            )

    def test_the_phones_time_zone_decides_what_today_is(self):
        self.check_in_every_day(self.alice, 1, stress=lambda i: 6)
        self.now = datetime(2026, 2, 1, 20, 0, tzinfo=timezone.utc)  # already 2 Feb in Singapore
        self.assertEqual(self.summary(self.alice, offset=0)["today"], "2026-02-01")
        singapore = self.summary(self.alice, offset=480)
        self.assertEqual(singapore["today"], "2026-02-02")
        self.assertIsNone(singapore["today_checkin"])  # 2 Feb has no check-in yet there

    def test_the_summary_does_not_change_when_asked_twice(self):
        self.check_in_every_day(self.alice, 5)
        self.assertEqual(self.summary(self.alice), self.summary(self.alice))

    def test_no_database_means_accounts_are_off(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        app = create_app(state_path=Path(tmp.name) / "s.json", settings=Settings())
        with TestClient(app) as client:
            self.assertEqual(client.get("/me/summary", params={"utc_offset_minutes": 0}).status_code, 503)


if __name__ == "__main__":
    unittest.main()
