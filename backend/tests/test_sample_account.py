import sqlite3
import tempfile
import unittest
from contextlib import closing
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from fastapi.testclient import TestClient

from backend.auth import MAX_SAMPLE_COPIES, SAMPLE_SHORT_NIGHTS
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

    def copy_session(self, offset=None):
        response = self.client.post("/auth/sample", json=None if offset is None else {"utc_offset_minutes": offset})
        self.assertEqual(response.status_code, 200)
        return response.json()

    def summary(self, headers, offset=0):
        return self.client.get(f"/me/summary?utc_offset_minutes={offset}", headers=headers).json()

    def put_checkin(self, headers, day, stress=6):
        body = {"stress": stress, "word": None, "utc_offset_minutes": 0}
        return self.client.put(f"/me/checkins/{day}", json=body, headers=headers)

    def test_each_visit_gets_its_own_copy(self):
        template_id = self.seed()
        first, second = self.copy_session(), self.copy_session()
        self.assertNotEqual(first["user"]["id"], second["user"]["id"])
        self.assertNotIn(template_id, (first["user"]["id"], second["user"]["id"]))
        self.assertNotEqual(first["token"], second["token"])
        for visit in (first, second):
            user = visit["user"]
            self.assertTrue(user["is_sample"])
            self.assertRegex(user["email"], r"^sample-[0-9a-f]+@mindwatch\.example\.com$")
            self.assertEqual(user["sample_expires_at"], (NOON + timedelta(days=1)).isoformat())
            self.assertEqual(visit["expires_at"], (NOON + timedelta(days=1)).isoformat())
        self.assertEqual(self.rows("select count(*) from users where is_sample = 1"), [(1,)])
        self.assertEqual(self.rows("select count(*) from users where sample_expires_at is not null"), [(2,)])
        # Copies hold no password, so the password login cannot reach them.
        login = self.client.post("/auth/login", json={"email": first["user"]["email"], "password": PASSWORD})
        self.assertEqual(login.status_code, 401)
        me = self.client.get("/auth/me", headers={"Authorization": f"Bearer {first['token']}"}).json()
        self.assertEqual(me, first["user"])

    def test_sample_without_body_still_works(self):
        self.seed()
        for kwargs in ({}, {"json": {}}, {"content": b""}):
            self.assertEqual(self.client.post("/auth/sample", **kwargs).status_code, 200)
        self.assertEqual(self.client.post("/auth/sample", json={"utc_offset_minutes": 900}).status_code, 422)

    def test_copies_cannot_see_each_other(self):
        self.seed()
        a, b = self.copy_session(), self.copy_session()
        ha, hb = ({"Authorization": f"Bearer {v['token']}"} for v in (a, b))
        yesterday = (TODAY - timedelta(days=1)).isoformat()
        before = self.client.get("/me/checkins?limit=366", headers=hb).json()
        self.assertEqual(self.put_checkin(ha, TODAY.isoformat(), 9).status_code, 201)
        self.assertEqual(self.put_checkin(ha, yesterday, 0).status_code, 200)
        self.assertEqual(self.client.get("/me/checkins?limit=366", headers=hb).json(), before)
        self.assertEqual(self.client.get(f"/me/checkins/{TODAY}", headers=hb).status_code, 404)
        self.assertEqual(self.summary(hb)["count"], CHECKINS)
        self.assertEqual(self.summary(ha)["count"], CHECKINS + 1)

    def test_copy_has_30_day_streak_ending_yesterday(self):
        self.seed()
        headers = {"Authorization": f"Bearer {self.copy_session()['token']}"}
        summary = self.summary(headers)
        self.assertEqual(summary["streak"]["current"], 30)
        self.assertEqual(summary["streak"]["status"], "waiting")
        self.assertIsNone(summary["today_checkin"])
        self.assertEqual(summary["count"], CHECKINS)
        days = [c["date"] for c in self.client.get("/me/checkins?limit=366", headers=headers).json()["checkins"]]
        self.assertEqual(len(days), CHECKINS)
        self.assertEqual(max(days), (TODAY - timedelta(days=1)).isoformat())
        self.assertEqual(min(days), (TODAY - timedelta(days=30)).isoformat())

    def test_checkin_today_makes_the_streak_31(self):
        self.seed()
        headers = {"Authorization": f"Bearer {self.copy_session()['token']}"}
        self.assertEqual(self.put_checkin(headers, TODAY.isoformat()).status_code, 201)
        summary = self.summary(headers)
        self.assertEqual((summary["streak"]["current"], summary["streak"]["status"]), (31, "building"))

    def test_copy_keeps_the_study_values_in_order(self):
        self.seed()
        template = self.rows("select stress from checkins where user_id in (select id from users where is_sample = 1) order by date")
        self.copy_session()
        copy = self.rows("select stress from checkins where user_id in (select id from users where sample_expires_at is not null) order by date")
        self.assertEqual(copy, template)
        steps_of = lambda who: self.rows(
            f"select steps from daily_measurements where steps is not null and user_id in (select id from users where {who}) order by date"
        )
        self.assertEqual(steps_of("sample_expires_at is not null"), steps_of("is_sample = 1"))

    def test_copy_shows_the_body_check(self):
        self.seed()
        headers = {"Authorization": f"Bearer {self.copy_session()['token']}"}
        check = self.summary(headers)["body_check"]
        self.assertEqual(check["state"], "body_signal_feel_ok")
        self.assertEqual(check["signals"], ["short_sleep"])
        self.assertEqual(check["days"], [(TODAY - timedelta(days=d)).isoformat() for d in (2, 1)])
        self.assertEqual([s["minutes"] for s in check["sleep"]], list(SAMPLE_SHORT_NIGHTS))
        # Only the copy gets the made-up nights; the seeded template keeps the study's data.
        self.assertEqual(
            self.rows("select count(*) from daily_measurements where sleep_minutes is not null and user_id in (select id from users where is_sample = 1)"),
            [(0,)],
        )

    def test_utc_offset_decides_yesterday(self):
        self.seed()
        # 12:00 UTC on Jan 15 is already Jan 16 at +14:00 (840), so yesterday there is Jan 15.
        for offset, last in ((0, date(2026, 1, 14)), (840, date(2026, 1, 15)), (-720, date(2026, 1, 14))):
            visit = self.copy_session(offset)
            headers = {"Authorization": f"Bearer {visit['token']}"}
            days = [c["date"] for c in self.client.get("/me/checkins?limit=366", headers=headers).json()["checkins"]]
            self.assertEqual(max(days), last.isoformat())
            self.assertEqual(self.summary(headers, offset)["streak"]["current"], 30)

    def test_copy_changes_never_touch_the_template(self):
        template_id = self.seed()
        template_rows = self.rows("select date, stress from checkins where user_id in (select id from users where is_sample = 1) order by date")
        visit = self.copy_session()
        headers = {"Authorization": f"Bearer {visit['token']}"}
        self.assertEqual(self.put_checkin(headers, TODAY.isoformat(), 10).status_code, 201)
        measurement = {"utc_offset_minutes": 0, "days": [{"date": TODAY.isoformat(), "steps": 5}]}
        self.assertEqual(self.client.put("/me/measurements", json=measurement, headers=headers).status_code, 200)
        self.assertEqual(self.client.post("/me/delete", json={}, headers=headers).status_code, 204)
        after = self.rows("select date, stress from checkins where user_id in (select id from users where is_sample = 1) order by date")
        self.assertEqual(after, template_rows)
        self.assertEqual(self.rows(f"select count(*) from users where id = '{template_id}'"), [(1,)])
        self.assertEqual(self.rows("select count(*) from user_models"), [(1,)])

    def test_template_is_still_read_only(self):
        template_id = self.seed()
        # Nobody gets a session on the template any more, so make one directly to prove the lock holds.
        from sqlalchemy.orm import Session
        from backend.auth import start_session
        from backend.models import User

        with Session(self.app.state.engine) as db:
            token = start_session(db, db.get(User, template_id), NOON, days=1)["token"]
        headers = {"Authorization": f"Bearer {token}"}
        me = self.client.get("/auth/me", headers=headers).json()
        self.assertEqual((me["is_sample"], me["sample_expires_at"]), (True, None))
        self.assertEqual(self.client.get("/me/checkins", headers=headers).status_code, 200)
        self.assertEqual(self.put_checkin(headers, TODAY.isoformat(), 9).status_code, 403)
        measurement = {"utc_offset_minutes": 0, "days": [{"date": TODAY.isoformat(), "steps": 5}]}
        self.assertEqual(self.client.put("/me/measurements", json=measurement, headers=headers).status_code, 403)
        self.assertEqual(self.client.post("/me/delete", json={"password": "x"}, headers=headers).status_code, 403)
        change = {"current_password": "x", "new_password": "a brand new password"}
        self.assertEqual(self.client.post("/auth/password", json=change, headers=headers).status_code, 403)
        self.assertEqual(self.rows("select count(*) from users where is_sample = 1"), [(1,)])

    def test_copy_can_be_deleted_without_a_password(self):
        self.seed()
        visit = self.copy_session()
        headers = {"Authorization": f"Bearer {visit['token']}"}
        self.assertEqual(self.client.get("/me/export", headers=headers).status_code, 200)
        change = {"current_password": "x", "new_password": "a brand new password"}
        changed = self.client.post("/auth/password", json=change, headers=headers)
        self.assertEqual(changed.status_code, 400)
        self.assertIn("no password", changed.json()["detail"])
        self.assertEqual(self.client.post("/me/delete", json={}, headers=headers).status_code, 204)
        uid = visit["user"]["id"]
        for table in ("users", "checkins", "daily_measurements", "user_models", "calibration_answers", "sessions"):
            column = "id" if table == "users" else "user_id"
            self.assertEqual(self.rows(f"select count(*) from {table} where {column} = '{uid}'"), [(0,)], table)
        self.assertEqual(self.client.get("/auth/me", headers=headers).status_code, 401)

    def test_real_users_still_need_their_password_to_delete(self):
        self.seed()
        token = self.client.post("/auth/signup", json=signup_body(email="bob@example.com")).json()["token"]
        headers = {"Authorization": f"Bearer {token}"}
        self.assertEqual(self.client.post("/me/delete", json={}, headers=headers).status_code, 422)
        self.assertEqual(self.client.post("/me/delete", json={"password": "wrong"}, headers=headers).status_code, 403)
        self.assertEqual(self.client.post("/me/delete", json={"password": PASSWORD}, headers=headers).status_code, 204)

    def test_expired_copy_stops_working(self):
        self.seed()
        visit = self.copy_session()
        headers = {"Authorization": f"Bearer {visit['token']}"}
        self.now = NOON + timedelta(hours=23)
        self.assertEqual(self.client.get("/auth/me", headers=headers).status_code, 200)
        self.now = NOON + timedelta(days=1)
        self.assertEqual(self.client.get("/auth/me", headers=headers).status_code, 401)
        self.assertEqual(self.client.get("/me/checkins", headers=headers).status_code, 401)

    def test_expired_copies_are_removed(self):
        self.seed()
        old = self.copy_session()
        self.now = NOON + timedelta(days=1, minutes=1)
        fresh = self.copy_session()
        old_id = old["user"]["id"]
        for table in ("users", "checkins", "daily_measurements", "user_models", "calibration_answers", "sessions"):
            column = "id" if table == "users" else "user_id"
            self.assertEqual(self.rows(f"select count(*) from {table} where {column} = '{old_id}'"), [(0,)], table)
        self.assertEqual(self.rows("select count(*) from users where sample_expires_at is not null"), [(1,)])
        self.assertEqual(self.rows(f"select count(*) from checkins where user_id = '{fresh['user']['id']}'"), [(CHECKINS,)])
        self.assertEqual(self.rows("select count(*) from users where is_sample = 1"), [(1,)])

    def test_copy_limit_returns_429(self):
        self.seed()
        for _ in range(MAX_SAMPLE_COPIES):
            self.copy_session()
        full = self.client.post("/auth/sample")
        self.assertEqual(full.status_code, 429)
        self.assertEqual(full.json()["detail"], "Too many people are trying the sample right now. Please try again later.")
        self.assertEqual(self.rows("select count(*) from users where sample_expires_at is not null"), [(MAX_SAMPLE_COPIES,)])
        # Once the day is up, the old copies are cleared and a new visitor gets in.
        self.now = NOON + timedelta(days=1)
        self.assertEqual(self.client.post("/auth/sample").status_code, 200)
        self.assertEqual(self.rows("select count(*) from users where sample_expires_at is not null"), [(1,)])

    def test_demo_runs_real_pipeline(self):
        self.seed()
        headers = {"Authorization": f"Bearer {self.copy_session()['token']}"}
        summary = self.summary(headers)
        self.assertEqual((summary["count"], summary["progress"]), (CHECKINS, {"done": CHECKINS, "goal": 30}))
        self.assertIsNone(summary["estimate"])
        # Training ran through the same code real check-ins use. Steps alone are not enough to fit.
        self.assertEqual(
            self.rows(
                "select status, reason, trained_on from user_models where user_id in "
                "(select id from users where sample_expires_at is not null)"
            ),
            [("not_ready", "not_enough_watch_data", CHECKINS)],
        )

    def test_why_and_model_are_ready_in_a_copy(self):
        self.seed()
        headers = {"Authorization": f"Bearer {self.copy_session()['token']}"}
        why = self.summary(headers)["why"]
        self.assertTrue(why["ready"])
        self.assertGreaterEqual(why["have"], why["need"])
        models = self.rows(
            "select trained_on from user_models where user_id in (select id from users where sample_expires_at is not null)"
        )
        self.assertEqual(models, [(CHECKINS,)])
        setup = self.client.get("/me/checkins/setup", headers=headers).json()
        self.assertEqual(setup, {"asks_sleep_activity": False, "wears_watch": True})

    def test_nobody_can_sign_in_to_the_sample_by_password_or_take_its_email(self):
        self.seed()
        for password in (PASSWORD, "", "!"):
            response = self.client.post("/auth/login", json={"email": SAMPLE_EMAIL, "password": password})
            self.assertEqual(response.status_code, 401)
        signup = self.client.post("/auth/signup", json=signup_body(email=SAMPLE_EMAIL))
        self.assertEqual(signup.status_code, 409)

    def test_the_sample_session_lasts_one_day(self):
        self.seed()
        visit = self.copy_session()
        headers = {"Authorization": f"Bearer {visit['token']}"}
        self.assertEqual(visit["expires_at"], (NOON + timedelta(days=1)).isoformat())
        self.now = NOON + timedelta(days=2)
        self.assertEqual(self.client.get("/auth/me", headers=headers).status_code, 401)

    def test_real_users_are_unaffected(self):
        self.seed()
        response = self.client.post("/auth/signup", json=signup_body(email="alice@example.com"))
        self.assertEqual(response.status_code, 201)
        self.assertFalse(response.json()["user"]["is_sample"])
        self.assertIsNone(response.json()["user"]["sample_expires_at"])
        headers = {"Authorization": f"Bearer {response.json()['token']}"}
        body = {"stress": 4, "word": None, "utc_offset_minutes": 0}
        self.assertEqual(self.client.put(f"/me/checkins/{TODAY}", json=body, headers=headers).status_code, 201)
        mine = self.client.get("/me/checkins", headers=headers).json()["checkins"]
        self.assertEqual(len(mine), 1)


if __name__ == "__main__":
    unittest.main()
