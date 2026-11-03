import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import text

from backend.checkins import WORDS
from backend.main import create_app
from backend.settings import Settings
from backend.tests.test_auth import ANSWERS, CODE, signup_body

# 12:00 UTC on 1 January 2026. Everything below is worked out from this moment.
NOW = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)
TODAY = "2026-01-01"
YESTERDAY = "2025-12-31"
PASSWORD = "correct horse battery"


class DailyCheckins(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db_path = Path(self.tmp.name) / "app.db"
        settings = Settings(database_url=f"sqlite:///{self.db_path.as_posix()}", invite_codes=(CODE,))
        self.app = create_app(state_path=Path(self.tmp.name) / "state.json", settings=settings)
        self.now = NOW
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

    def save(self, who, day=TODAY, stress=5, word=None, offset=0, **extra):
        body = {"stress": stress, "word": word, "utc_offset_minutes": offset, **extra}
        return self.client.put(f"/me/checkins/{day}", json=body, headers=who)

    def rows(self, sql):
        with closing(sqlite3.connect(self.db_path)) as conn:
            return conn.execute(sql).fetchall()

    # --- who can see and change what ---------------------------------------
    def test_user_a_cannot_read_user_b(self):
        self.save(self.alice, TODAY, stress=2, word="Calm")
        self.save(self.bob, TODAY, stress=9, word="Sad")
        self.save(self.bob, YESTERDAY, stress=8, word="Lonely")

        listed = self.client.get("/me/checkins", headers=self.alice).json()["checkins"]
        self.assertEqual([(c["date"], c["stress"], c["word"]) for c in listed], [(TODAY, 2, "Calm")])

        # A day that only Bob has is simply not there for Alice.
        self.assertEqual(self.client.get(f"/me/checkins/{YESTERDAY}", headers=self.alice).status_code, 404)
        own = self.client.get(f"/me/checkins/{TODAY}", headers=self.alice).json()
        self.assertEqual((own["stress"], own["word"]), (2, "Calm"))

    def test_user_a_cannot_change_user_b(self):
        self.save(self.bob, TODAY, stress=9, word="Sad")
        # Alice saves the same date. That creates Alice's own check-in and leaves Bob's alone.
        self.assertEqual(self.save(self.alice, TODAY, stress=1, word="Calm").status_code, 201)
        bob = self.client.get(f"/me/checkins/{TODAY}", headers=self.bob).json()
        self.assertEqual((bob["stress"], bob["word"]), (9, "Sad"))
        self.assertEqual(self.rows("select count(*) from checkins"), [(2,)])

    def test_a_user_id_in_the_request_is_refused(self):
        response = self.save(self.alice, TODAY, user_id="someone-else")
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.rows("select count(*) from checkins"), [(0,)])

    def test_login_is_required_everywhere(self):
        body = {"stress": 5, "word": None, "utc_offset_minutes": 0}
        self.assertEqual(self.client.put(f"/me/checkins/{TODAY}", json=body).status_code, 401)
        self.assertEqual(self.client.get("/me/checkins").status_code, 401)
        self.assertEqual(self.client.get(f"/me/checkins/{TODAY}").status_code, 401)
        made_up = {"Authorization": "Bearer made-up"}
        self.assertEqual(self.client.get("/me/checkins", headers=made_up).status_code, 401)

    def test_an_expired_session_is_refused(self):
        self.now += timedelta(days=31)
        self.assertEqual(self.client.get("/me/checkins", headers=self.alice).status_code, 401)

    # --- one per day -------------------------------------------------------
    def test_one_checkin_per_day(self):
        self.assertEqual(self.save(self.alice, TODAY, stress=3).status_code, 201)
        self.assertEqual(self.save(self.alice, TODAY, stress=7).status_code, 200)
        self.assertEqual(self.rows("select count(*) from checkins"), [(1,)])
        self.assertEqual(self.client.get(f"/me/checkins/{TODAY}", headers=self.alice).json()["stress"], 7)

    def test_the_database_itself_refuses_a_second_row_for_a_day(self):
        self.save(self.alice, TODAY)
        from sqlalchemy.exc import IntegrityError

        with self.assertRaises(IntegrityError):
            with self.app.state.engine.begin() as conn:
                conn.execute(
                    text(
                        "insert into checkins (id, user_id, date, stress, created_at, updated_at) "
                        "select 'dup', user_id, date, 1, created_at, updated_at from checkins limit 1"
                    )
                )

    def test_listing_is_newest_first_and_limited(self):
        self.save(self.alice, YESTERDAY, stress=1)
        self.save(self.alice, TODAY, stress=2)
        listed = self.client.get("/me/checkins", headers=self.alice).json()["checkins"]
        self.assertEqual([c["date"] for c in listed], [TODAY, YESTERDAY])
        one = self.client.get("/me/checkins", params={"limit": 1}, headers=self.alice).json()["checkins"]
        self.assertEqual([c["date"] for c in one], [TODAY])
        self.assertEqual(self.client.get("/me/checkins", params={"limit": 0}, headers=self.alice).status_code, 422)

    # --- which dates are allowed -------------------------------------------
    def test_old_dates_rejected(self):
        for day in ("2025-12-30", "2025-01-01", "2026-01-02", "2099-01-01", "not-a-date", "2026-13-40"):
            self.assertEqual(self.save(self.alice, day).status_code, 422, day)
        self.assertEqual(self.rows("select count(*) from checkins"), [(0,)])

    def test_today_and_yesterday_are_accepted_so_a_late_checkin_counts(self):
        self.assertEqual(self.save(self.alice, TODAY).status_code, 201)
        self.assertEqual(self.save(self.alice, YESTERDAY).status_code, 201)

    def test_a_day_that_has_ended_cannot_be_edited_any_more(self):
        self.save(self.alice, YESTERDAY, stress=4)
        self.now += timedelta(days=1)  # yesterday is now two days ago
        self.assertEqual(self.save(self.alice, YESTERDAY, stress=9).status_code, 422)
        kept = self.client.get(f"/me/checkins/{YESTERDAY}", headers=self.alice).json()
        self.assertEqual(kept["stress"], 4)

    def test_the_phones_time_zone_decides_what_today_is(self):
        # 20:00 UTC on 1 January is already 2 January in Singapore (+8).
        self.now = datetime(2026, 1, 1, 20, 0, tzinfo=timezone.utc)
        self.assertEqual(self.save(self.alice, "2026-01-02", offset=480).status_code, 201)
        self.assertEqual(self.save(self.alice, "2026-01-02", offset=0).status_code, 422)
        # In UTC-8 it is still the afternoon of 1 January, so 2 January has not started.
        self.assertEqual(self.save(self.alice, "2026-01-02", offset=-480).status_code, 422)
        self.assertEqual(self.save(self.alice, "2026-01-01", offset=-480).status_code, 201)

    def test_impossible_offsets_are_refused(self):
        self.assertEqual(self.save(self.alice, TODAY, offset=841).status_code, 422)
        self.assertEqual(self.save(self.alice, TODAY, offset=-721).status_code, 422)
        self.assertEqual(self.save(self.alice, TODAY, offset=840).status_code, 201)

    # --- the word of the day ----------------------------------------------
    def test_word_must_be_from_list(self):
        for bad in ("Happy", "calm", "CALM", "", "Calm and happy", "<script>", "I feel awful today"):
            self.assertEqual(self.save(self.alice, TODAY, word=bad).status_code, 422, bad)
        self.assertEqual(self.rows("select count(*) from checkins"), [(0,)])

    def test_every_word_on_the_list_is_accepted_and_the_word_is_optional(self):
        self.assertEqual(len(WORDS), 12)
        self.assertEqual(len(set(WORDS)), 12)
        for word in WORDS:
            self.assertIn(self.save(self.alice, TODAY, word=word).status_code, (200, 201), word)
        self.assertEqual(self.save(self.alice, TODAY, word=None).status_code, 200)
        self.assertIsNone(self.client.get(f"/me/checkins/{TODAY}", headers=self.alice).json()["word"])

    def test_word_can_be_changed_same_day(self):
        self.save(self.alice, TODAY, stress=5, word="Tired")
        self.save(self.alice, TODAY, stress=5, word="Hopeful")
        self.assertEqual(self.client.get(f"/me/checkins/{TODAY}", headers=self.alice).json()["word"], "Hopeful")
        self.assertEqual(self.rows("select count(*) from checkins"), [(1,)])

    # --- the stress number -------------------------------------------------
    def test_stress_must_be_a_whole_number_from_0_to_10(self):
        for bad in (-1, 11, 4.5, "4", True, None, 1000):
            self.assertEqual(self.save(self.alice, TODAY, stress=bad).status_code, 422, repr(bad))
        for good in (0, 10):
            self.assertIn(self.save(self.alice, TODAY, stress=good).status_code, (200, 201))
        self.assertEqual(self.rows("select count(*) from checkins"), [(1,)])

    # --- housekeeping ------------------------------------------------------
    def test_deleting_a_user_removes_their_checkins(self):
        self.save(self.alice, TODAY)
        self.save(self.bob, TODAY)
        alice_id = self.client.get("/auth/me", headers=self.alice).json()["id"]
        with self.app.state.engine.begin() as conn:
            conn.execute(text("delete from users where id = :id"), {"id": alice_id})
        self.assertEqual(self.rows("select count(*) from checkins"), [(1,)])

    def test_logs_hold_ids_only(self):
        with self.assertLogs("mindwatch", level="INFO") as logs:
            self.save(self.alice, TODAY, stress=7, word="Overwhelmed")
        text_out = "\n".join(logs.output)
        self.assertIn("user_id=", text_out)
        self.assertNotIn("Overwhelmed", text_out)
        self.assertNotIn(TODAY, text_out)


class DemoCheckinUnchanged(unittest.TestCase):
    """The demo check-in needs no login and no database, and must not touch the new table."""

    def test_demo_checkin_unchanged(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        db_path = Path(tmp.name) / "app.db"
        state = Path(tmp.name) / "state.json"
        settings = Settings(database_url=f"sqlite:///{db_path.as_posix()}", invite_codes=(CODE,))
        app = create_app(state_path=state, settings=settings)
        with TestClient(app) as client:
            date = client.get("/demo/config").json()["default_date"]
            response = client.post("/checkin", json={"date": date, "stress": 6})
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.json()["saved"])
            self.assertEqual(client.get("/today", params={"date": date}).json()["reported_stress"]["value"], 6)
        saved = json.loads(state.read_text("utf-8"))
        self.assertTrue(saved)  # the demo's own JSON file recorded it
        with closing(sqlite3.connect(db_path)) as conn:
            self.assertEqual(conn.execute("select count(*) from checkins").fetchone(), (0,))

    def test_demo_checkin_works_with_no_database_at_all(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        app = create_app(state_path=Path(tmp.name) / "state.json", settings=Settings())
        with TestClient(app) as client:
            date = client.get("/demo/config").json()["default_date"]
            self.assertEqual(client.post("/checkin", json={"date": date, "stress": 3}).status_code, 200)
            self.assertEqual(client.get("/me/checkins").status_code, 503)  # accounts are off, demo is not


class ByHandSleepAndActivity(unittest.TestCase):
    """People with no smart watch can also answer sleep and activity questions with their check-in."""

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
        self.watch = self.new_user("watch@example.com", "yes")
        self.nowatch = self.new_user("nowatch@example.com", "no")

    def new_user(self, email, wears_watch):
        body = signup_body(email=email, calibration={**ANSWERS, "wears_watch": wears_watch})
        response = self.client.post("/auth/signup", json=body)
        self.assertEqual(response.status_code, 201)
        return {"Authorization": f"Bearer {response.json()['token']}"}

    def save(self, who, day=TODAY, **fields):
        return self.client.put(f"/me/checkins/{day}", json={"stress": 4, "utc_offset_minutes": 0, **fields}, headers=who)

    def rows(self, sql):
        with closing(sqlite3.connect(self.db_path)) as conn:
            return conn.execute(sql).fetchall()

    def asks(self, who):
        response = self.client.get("/me/checkins/setup", headers=who)
        self.assertEqual(response.status_code, 200)
        return response.json()["asks_sleep_activity"]

    def test_only_people_with_no_smart_watch_are_asked(self):
        self.assertIs(self.asks(self.nowatch), True)
        self.assertIs(self.asks(self.watch), False)

    def test_setup_needs_a_login(self):
        self.assertEqual(self.client.get("/me/checkins/setup").status_code, 401)

    def test_a_check_in_saves_with_the_three_answers_and_reads_back(self):
        answers = {"sleep_hours": "6_7", "sleep_quality": "fair", "activity": "lightly_active"}
        self.assertEqual(self.save(self.nowatch, **answers).status_code, 201)
        saved = self.client.get(f"/me/checkins/{TODAY}", headers=self.nowatch).json()
        self.assertEqual({k: saved[k] for k in answers}, answers)
        listed = self.client.get("/me/checkins", headers=self.nowatch).json()["checkins"][0]
        self.assertEqual({k: listed[k] for k in answers}, answers)

    def test_the_answers_are_optional_and_never_block_a_check_in(self):
        self.assertEqual(self.save(self.nowatch).status_code, 201)
        saved = self.client.get(f"/me/checkins/{TODAY}", headers=self.nowatch).json()
        self.assertEqual((saved["sleep_hours"], saved["sleep_quality"], saved["activity"]), (None, None, None))
        self.assertEqual(self.save(self.nowatch, sleep_hours="7_8").status_code, 200)  # some answered, some not

    def test_changing_a_check_in_replaces_the_answers(self):
        self.save(self.nowatch, sleep_hours="under_5", sleep_quality="poor", activity="very_active")
        self.save(self.nowatch, sleep_hours="8_9")
        saved = self.client.get(f"/me/checkins/{TODAY}", headers=self.nowatch).json()
        self.assertEqual((saved["sleep_hours"], saved["sleep_quality"], saved["activity"]), ("8_9", None, None))

    def test_only_the_fixed_options_are_accepted(self):
        for field, value in (("sleep_hours", "lots"), ("sleep_quality", "7_8"), ("activity", "ran a marathon, felt awful")):
            self.assertEqual(self.save(self.nowatch, **{field: value}).status_code, 422, field)
        self.assertEqual(self.client.get("/me/checkins", headers=self.nowatch).json(), {"checkins": []})

    def test_they_are_private_to_each_person(self):
        self.save(self.nowatch, sleep_hours="under_5", sleep_quality="poor", activity="mostly_sitting")
        self.save(self.watch)
        mine = self.client.get(f"/me/checkins/{TODAY}", headers=self.watch).json()
        self.assertEqual((mine["sleep_hours"], mine["sleep_quality"], mine["activity"]), (None, None, None))

    def test_the_download_includes_them_and_deleting_the_account_removes_them(self):
        self.save(self.nowatch, sleep_hours="6_7", sleep_quality="good", activity="moderately_active")
        data = self.client.get("/me/export", headers=self.nowatch).json()["check_ins"][0]
        self.assertEqual((data["sleep_hours"], data["sleep_quality"], data["activity"]), ("6_7", "good", "moderately_active"))
        response = self.client.post("/me/delete", json={"password": PASSWORD}, headers=self.nowatch)
        self.assertEqual(response.status_code, 204)
        self.assertEqual(self.rows("select count(*) from checkins"), [(0,)])


if __name__ == "__main__":
    unittest.main()
