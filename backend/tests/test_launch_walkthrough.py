"""One walk through the whole account flow, the way a new person would use it.

It runs on SQLite every time. If MINDWATCH_TEST_DATABASE_URL points at an empty Neon *test* branch,
the same walk also runs on Postgres, starting from migration 0001. It must never be pointed at the
live database: the test creates users and leaves them behind.
"""
import os
import tempfile
import unittest
from datetime import date, datetime, timezone
from pathlib import Path

from fastapi.testclient import TestClient

from backend.main import create_app
from backend.scripts.seed_demo_user import seed
from backend.settings import Settings
from backend.tests.test_auth import CODE, PASSWORD, signup_body

NOON = datetime(2026, 1, 15, 12, 0, tzinfo=timezone.utc)
TODAY = "2026-01-15"
POSTGRES_URL = os.getenv("MINDWATCH_TEST_DATABASE_URL", "").strip()


class Walkthrough:
    """The checks. Subclasses say which database to use."""

    def database_url(self):
        raise NotImplementedError

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        settings = Settings(database_url=self.database_url(), invite_codes=(CODE,))
        self.app = create_app(state_path=Path(self.tmp.name) / "state.json", settings=settings)
        self.app.state.clock = lambda: NOON
        context = TestClient(self.app)
        self.client = context.__enter__()
        self.addCleanup(context.__exit__, None, None, None)
        # Postgres keeps users between runs, so every run uses emails nobody used before.
        self.tag = os.urandom(4).hex()

    def email(self, name):
        return f"{name}-{self.tag}@example.com"

    def headers(self, token):
        return {"Authorization": f"Bearer {token}"}

    def checkin(self, token, stress, word=None):
        body = {"stress": stress, "word": word, "utc_offset_minutes": 0}
        return self.client.put(f"/me/checkins/{TODAY}", json=body, headers=self.headers(token))

    def test_the_database_is_ready(self):
        self.assertEqual(self.client.get("/health").json()["database"], "ready")

    def test_signup_check_in_sign_out_and_sign_in(self):
        email = self.email("alice")
        signup = self.client.post("/auth/signup", json=signup_body(email=email))
        self.assertEqual(signup.status_code, 201)
        token = signup.json()["token"]
        self.assertEqual(self.client.get("/auth/me", headers=self.headers(token)).json()["email"], email)

        self.assertEqual(self.checkin(token, 6, "Tired").status_code, 201)
        summary = self.client.get("/me/summary?utc_offset_minutes=0", headers=self.headers(token)).json()
        self.assertEqual((summary["count"], summary["today_checkin"]["stress"]), (1, 6))

        self.assertEqual(self.client.post("/auth/logout", headers=self.headers(token)).status_code, 204)
        self.assertEqual(self.client.get("/auth/me", headers=self.headers(token)).status_code, 401)

        login = self.client.post("/auth/login", json={"email": email, "password": PASSWORD})
        self.assertEqual(login.status_code, 200)
        again = login.json()["token"]
        listed = self.client.get("/me/checkins", headers=self.headers(again)).json()["checkins"]
        self.assertEqual([(c["date"], c["stress"], c["word"]) for c in listed], [(TODAY, 6, "Tired")])

    def test_two_people_never_see_each_others_data(self):
        alice = self.client.post("/auth/signup", json=signup_body(email=self.email("alice"))).json()["token"]
        bob = self.client.post("/auth/signup", json=signup_body(email=self.email("bob"))).json()["token"]
        self.checkin(alice, 2, "Calm")
        self.checkin(bob, 9, "Sad")

        for token, stress in ((alice, 2), (bob, 9)):
            listed = self.client.get("/me/checkins", headers=self.headers(token)).json()["checkins"]
            self.assertEqual([c["stress"] for c in listed], [stress])
            export = self.client.get("/me/export", headers=self.headers(token)).json()
            self.assertEqual([c["stress"] for c in export["check_ins"]], [stress])

        self.assertEqual(self.client.get("/me/checkins", headers={}).status_code, 401)

    def test_a_wrong_password_and_a_missing_invite_code_are_refused(self):
        email = self.email("carol")
        self.assertEqual(
            self.client.post("/auth/signup", json=signup_body(email=email, code="wrong")).status_code, 403
        )
        self.client.post("/auth/signup", json=signup_body(email=email))
        bad = self.client.post("/auth/login", json={"email": email, "password": "not the password"})
        self.assertEqual(bad.status_code, 401)

    def test_deleting_an_account_removes_it(self):
        email = self.email("dave")
        token = self.client.post("/auth/signup", json=signup_body(email=email)).json()["token"]
        self.checkin(token, 5)
        deleted = self.client.post("/me/delete", json={"password": PASSWORD}, headers=self.headers(token))
        self.assertEqual(deleted.status_code, 204)
        login = self.client.post("/auth/login", json={"email": email, "password": PASSWORD})
        self.assertEqual(login.status_code, 401)

    def test_the_sample_account_can_be_read_but_not_changed(self):
        seed(self.app.state.engine, date(2026, 1, 15))
        sample = self.client.post("/auth/sample").json()["token"]
        self.assertEqual(self.client.get("/me/checkins", headers=self.headers(sample)).status_code, 200)
        self.assertEqual(self.checkin(sample, 9).status_code, 403)


class OnSqlite(Walkthrough, unittest.TestCase):
    def database_url(self):
        return f"sqlite:///{(Path(self.tmp.name) / 'app.db').as_posix()}"


@unittest.skipUnless(POSTGRES_URL, "set MINDWATCH_TEST_DATABASE_URL to an empty Neon test branch to run on Postgres")
class OnPostgres(Walkthrough, unittest.TestCase):
    def database_url(self):
        return POSTGRES_URL


if __name__ == "__main__":
    unittest.main()
