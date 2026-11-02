import os
import sqlite3
import tempfile
import unittest
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient

from backend.main import create_app
from backend.settings import Settings, get_settings

CODE = "test-invite-code"
EMAIL = "Student@Example.com"
PASSWORD = "correct horse battery"


class Accounts(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db_path = Path(self.tmp.name) / "app.db"
        settings = Settings(
            database_url=f"sqlite:///{self.db_path.as_posix()}", invite_codes=(CODE, "second-code")
        )
        self.app = create_app(state_path=Path(self.tmp.name) / "checkins.json", settings=settings)
        # Tests move this clock to check expiry and lockouts.
        self.now = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)
        self.app.state.clock = lambda: self.now
        context = TestClient(self.app)
        self.client = context.__enter__()
        self.addCleanup(context.__exit__, None, None, None)

    def signup(self, email=EMAIL, password=PASSWORD, code=CODE):
        return self.client.post(
            "/auth/signup", json={"email": email, "password": password, "invite_code": code}
        )

    def login(self, email=EMAIL, password=PASSWORD):
        return self.client.post("/auth/login", json={"email": email, "password": password})

    def auth(self, token):
        return {"Authorization": f"Bearer {token}"}

    def rows(self, sql):
        with closing(sqlite3.connect(self.db_path)) as conn:
            return conn.execute(sql).fetchall()

    # --- sign up -----------------------------------------------------------
    def test_signup_needs_invite_code(self):
        self.assertEqual(self.signup(code="wrong").status_code, 403)
        self.assertEqual(self.signup(code="").status_code, 403)
        missing = self.client.post("/auth/signup", json={"email": EMAIL, "password": PASSWORD})
        self.assertEqual(missing.status_code, 422)
        self.assertEqual(self.rows("select count(*) from users"), [(0,)])

    def test_signup_with_invite_code_works_and_returns_a_session(self):
        response = self.signup()
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["user"]["email"], EMAIL.lower())
        me = self.client.get("/auth/me", headers=self.auth(body["token"]))
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()["id"], body["user"]["id"])

    def test_either_invite_code_works(self):
        self.assertEqual(self.signup(code="second-code").status_code, 201)

    def test_bad_email_and_short_password_rejected(self):
        self.assertEqual(self.signup(email="not-an-email").status_code, 422)
        self.assertEqual(self.signup(password="short").status_code, 422)
        self.assertEqual(self.signup(password="x" * 129).status_code, 422)
        self.assertEqual(self.rows("select count(*) from users"), [(0,)])

    def test_duplicate_email_rejected_whatever_its_case(self):
        self.assertEqual(self.signup().status_code, 201)
        self.assertEqual(self.signup(email=EMAIL.upper()).status_code, 409)
        self.assertEqual(self.rows("select count(*) from users"), [(1,)])

    # --- passwords and tokens ----------------------------------------------
    def test_password_never_stored_plain(self):
        self.signup()
        (stored,) = self.rows("select password_hash from users")[0]
        self.assertTrue(stored.startswith("$argon2id$"))
        self.assertNotIn(PASSWORD, stored)
        everything = repr(self.rows("select * from users") + self.rows("select * from sessions"))
        self.assertNotIn(PASSWORD, everything)

    def test_token_stored_hashed_only(self):
        token = self.signup().json()["token"]
        self.assertNotIn(token, repr(self.rows("select * from sessions")))
        (stored,) = self.rows("select token_hash from sessions")[0]
        self.assertEqual(len(stored), 64)

    def test_logs_never_contain_secrets(self):
        with self.assertLogs("mindwatch", level="INFO") as logs:
            token = self.signup().json()["token"]
            self.login(password="wrong password!!")
            self.login()
        text = "\n".join(logs.output)
        for secret in (PASSWORD, "wrong password!!", EMAIL, EMAIL.lower(), token):
            self.assertNotIn(secret, text)
        self.assertIn("user_id=", text)

    # --- logging in --------------------------------------------------------
    def test_login_works_and_ignores_email_case(self):
        self.signup()
        response = self.login(email=EMAIL.upper())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user"]["email"], EMAIL.lower())

    def test_wrong_password_rejected(self):
        self.signup()
        self.assertEqual(self.login(password="not the password").status_code, 401)

    def test_unknown_email_looks_the_same_as_wrong_password(self):
        self.signup()
        wrong = self.login(password="not the password")
        unknown = self.login(email="nobody@example.com")
        self.assertEqual(unknown.status_code, wrong.status_code)
        self.assertEqual(unknown.json(), wrong.json())

    def test_repeated_failed_logins_slowed(self):
        self.signup()
        for _ in range(5):
            self.assertEqual(self.login(password="bad password!!").status_code, 401)
        locked = self.login()  # even the right password is refused while locked
        self.assertEqual(locked.status_code, 429)
        self.assertGreater(int(locked.headers["Retry-After"]), 0)
        self.now += timedelta(minutes=16)
        self.assertEqual(self.login().status_code, 200)

    def test_lockout_is_per_email_and_unknown_emails_are_counted(self):
        self.signup()
        for _ in range(5):
            self.login(email="ghost@example.com", password="bad password!!")
        self.assertEqual(self.login(email="ghost@example.com").status_code, 429)
        self.assertEqual(self.login().status_code, 200)

    def test_a_good_login_clears_earlier_failures(self):
        self.signup()
        for _ in range(4):
            self.login(password="bad password!!")
        self.assertEqual(self.login().status_code, 200)
        for _ in range(4):
            self.assertEqual(self.login(password="bad password!!").status_code, 401)

    # --- sessions ----------------------------------------------------------
    def test_logout_ends_session(self):
        token = self.signup().json()["token"]
        self.assertEqual(self.client.post("/auth/logout", headers=self.auth(token)).status_code, 204)
        self.assertEqual(self.client.get("/auth/me", headers=self.auth(token)).status_code, 401)
        self.assertEqual(self.rows("select count(*) from sessions"), [(0,)])

    def test_logout_only_ends_that_session(self):
        first = self.signup().json()["token"]
        second = self.login().json()["token"]
        self.client.post("/auth/logout", headers=self.auth(first))
        self.assertEqual(self.client.get("/auth/me", headers=self.auth(second)).status_code, 200)

    def test_expired_session_rejected(self):
        token = self.signup().json()["token"]
        self.now += timedelta(days=29)
        self.assertEqual(self.client.get("/auth/me", headers=self.auth(token)).status_code, 200)
        self.now += timedelta(days=2)
        self.assertEqual(self.client.get("/auth/me", headers=self.auth(token)).status_code, 401)

    def test_missing_or_made_up_token_rejected(self):
        self.assertEqual(self.client.get("/auth/me").status_code, 401)
        self.assertEqual(self.client.get("/auth/me", headers=self.auth("made-up")).status_code, 401)
        self.assertEqual(
            self.client.get("/auth/me", headers={"Authorization": "Basic abc"}).status_code, 401
        )

    def test_user_comes_from_the_session_not_the_request(self):
        alice = self.signup(email="alice@example.com").json()
        bob = self.signup(email="bob@example.com").json()
        me = self.client.get(
            "/auth/me",
            headers=self.auth(alice["token"]),
            params={"user_id": bob["user"]["id"]},
        )
        self.assertEqual(me.json()["id"], alice["user"]["id"])

    # --- browsers and the Android app -------------------------------------
    def test_authorization_header_allowed_from_android_origin(self):
        response = self.client.options(
            "/auth/me",
            headers={
                "Origin": "http://localhost",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("authorization", response.headers["access-control-allow-headers"].lower())


class WithoutDatabase(unittest.TestCase):
    def test_accounts_off_and_demo_unaffected(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        app = create_app(state_path=Path(tmp.name) / "c.json", settings=Settings(invite_codes=(CODE,)))
        with TestClient(app) as client:
            signup = client.post(
                "/auth/signup", json={"email": EMAIL, "password": PASSWORD, "invite_code": CODE}
            )
            self.assertEqual(signup.status_code, 503)
            self.assertEqual(client.get("/auth/me").status_code, 503)
            self.assertEqual(client.get("/health").json()["status"], "online")
            date = client.get("/demo/config").json()["default_date"]
            self.assertEqual(client.get("/today", params={"date": date}).status_code, 200)


class InviteCodeSettings(unittest.TestCase):
    def test_invite_codes_come_from_the_environment(self):
        with mock.patch.dict(os.environ, {"INVITE_CODES": " a-code , b-code ,"}):
            self.assertEqual(get_settings().invite_codes, ("a-code", "b-code"))
        with mock.patch.dict(os.environ, {"INVITE_CODES": ""}):
            self.assertEqual(get_settings().invite_codes, ())

    def test_no_invite_codes_means_nobody_can_sign_up(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        url = f"sqlite:///{(Path(tmp.name) / 'a.db').as_posix()}"
        app = create_app(state_path=Path(tmp.name) / "c.json", settings=Settings(database_url=url))
        with TestClient(app) as client:
            response = client.post(
                "/auth/signup", json={"email": EMAIL, "password": PASSWORD, "invite_code": ""}
            )
            self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()
