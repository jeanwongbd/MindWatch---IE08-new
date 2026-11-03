import contextlib
import io
import os
import sqlite3
import tempfile
import unittest
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient

from backend.db import make_engine
from backend.main import create_app
from backend.scripts.reset_password import InvalidPassword, main, reset_password
from backend.settings import Settings
from backend.tests.test_auth import CODE, PASSWORD, signup_body

EMAIL = "forgetful@example.com"
NEW_PASSWORD = "a brand new password"


class ResetPassword(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db_path = Path(self.tmp.name) / "app.db"
        self.url = f"sqlite:///{self.db_path.as_posix()}"
        # Create the database and the account, then close the app so the script has the file to itself.
        settings = Settings(database_url=self.url, invite_codes=(CODE,))
        app = create_app(state_path=Path(self.tmp.name) / "s.json", settings=settings)
        self.now = datetime(2026, 1, 15, 12, 0, tzinfo=timezone.utc)
        app.state.clock = lambda: self.now
        with TestClient(app) as client:
            response = client.post("/auth/signup", json=signup_body(email=EMAIL))
            self.assertEqual(response.status_code, 201)
            self.user_id = response.json()["user"]["id"]
            self.old_token = response.json()["token"]
            for _ in range(5):  # lock the account out, as someone who forgot their password would
                client.post("/auth/login", json={"email": EMAIL, "password": "forgotten!!"})
            self.assertEqual(client.post("/auth/login", json={"email": EMAIL, "password": PASSWORD}).status_code, 429)

    def engine(self):
        engine = make_engine(self.url)
        self.addCleanup(engine.dispose)  # Windows will not delete a database file that is still open
        return engine

    def sign_in(self, password):
        """Start the app again on the same database and try to sign in."""
        settings = Settings(database_url=self.url, invite_codes=(CODE,))
        app = create_app(state_path=Path(self.tmp.name) / "s.json", settings=settings)
        app.state.clock = lambda: self.now
        with TestClient(app) as client:
            return client.post("/auth/login", json={"email": EMAIL, "password": password}), client

    def count(self, table, where="", args=()):
        with closing(sqlite3.connect(self.db_path)) as conn:
            return conn.execute(f"select count(*) from {table} {where}", args).fetchone()[0]

    # --- the function ------------------------------------------------------
    def test_a_reset_sets_the_new_password_and_the_old_one_stops_working(self):
        self.assertEqual(reset_password(self.engine(), EMAIL, NEW_PASSWORD), self.user_id)
        self.assertEqual(self.sign_in(PASSWORD)[0].status_code, 401)
        self.assertEqual(self.sign_in(NEW_PASSWORD)[0].status_code, 200)

    def test_a_reset_signs_the_person_out_everywhere(self):
        reset_password(self.engine(), EMAIL, NEW_PASSWORD)
        self.assertEqual(self.count("sessions", "where user_id = ?", (self.user_id,)), 0)
        settings = Settings(database_url=self.url, invite_codes=(CODE,))
        app = create_app(state_path=Path(self.tmp.name) / "s.json", settings=settings)
        app.state.clock = lambda: self.now
        with TestClient(app) as client:  # the check runs while the app is still running
            old = {"Authorization": f"Bearer {self.old_token}"}
            self.assertEqual(client.get("/auth/me", headers=old).status_code, 401)

    def test_a_reset_clears_the_lockout(self):
        reset_password(self.engine(), EMAIL, NEW_PASSWORD)
        self.assertEqual(self.count("login_failures", "where email = ?", (EMAIL,)), 0)
        self.assertEqual(self.sign_in(NEW_PASSWORD)[0].status_code, 200)  # not 429

    def test_the_password_is_stored_scrambled(self):
        reset_password(self.engine(), EMAIL, NEW_PASSWORD)
        with closing(sqlite3.connect(self.db_path)) as conn:
            (stored,) = conn.execute("select password_hash from users").fetchone()
        self.assertTrue(stored.startswith("$argon2id$"))
        self.assertNotIn(NEW_PASSWORD, stored)

    def test_the_email_is_matched_whatever_its_case(self):
        self.assertEqual(reset_password(self.engine(), "  Forgetful@Example.COM ", NEW_PASSWORD), self.user_id)

    def test_no_such_account_changes_nothing(self):
        self.assertIsNone(reset_password(self.engine(), "nobody@example.com", NEW_PASSWORD))
        self.assertEqual(self.sign_in(PASSWORD)[0].status_code, 429)  # still locked: nothing was touched

    def test_a_password_that_is_too_short_or_long_is_refused(self):
        for bad in ("short", "x" * 129):
            with self.assertRaises(InvalidPassword):
                reset_password(self.engine(), EMAIL, bad)
        self.assertEqual(self.count("login_failures", "where email = ?", (EMAIL,)), 5)

    # --- the command -------------------------------------------------------
    def run_main(self, email=EMAIL, passwords=(NEW_PASSWORD, NEW_PASSWORD), database_url=None):
        env = {"DATABASE_URL": self.url if database_url is None else database_url}
        out, err = io.StringIO(), io.StringIO()
        with mock.patch.dict(os.environ, env), mock.patch("getpass.getpass", side_effect=list(passwords)):
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                code = main([email])
        return code, out.getvalue(), err.getvalue()

    def test_the_command_resets_the_password_and_prints_only_an_id(self):
        code, out, err = self.run_main()
        self.assertEqual(code, 0)
        self.assertIn(self.user_id, out)
        for secret in (EMAIL, NEW_PASSWORD, PASSWORD):
            self.assertNotIn(secret, out + err)
        self.assertEqual(self.sign_in(NEW_PASSWORD)[0].status_code, 200)

    def test_the_command_asks_twice_and_changes_nothing_if_they_differ(self):
        code, out, err = self.run_main(passwords=(NEW_PASSWORD, "something else entirely"))
        self.assertEqual(code, 1)
        self.assertIn("did not match", err)
        self.assertEqual(self.sign_in(PASSWORD)[0].status_code, 429)

    def test_the_command_reads_the_password_at_a_prompt_never_from_the_command_line(self):
        with mock.patch.dict(os.environ, {"DATABASE_URL": self.url}), mock.patch("getpass.getpass", side_effect=[NEW_PASSWORD] * 2) as prompt:
            with contextlib.redirect_stdout(io.StringIO()):
                main([EMAIL])
        self.assertEqual(prompt.call_count, 2)
        with self.assertRaises(SystemExit):  # a password given as an argument is not accepted
            with contextlib.redirect_stderr(io.StringIO()):
                main([EMAIL, NEW_PASSWORD])

    def test_the_command_refuses_a_short_password_and_an_unknown_email(self):
        code, _, err = self.run_main(passwords=("short", "short"))
        self.assertEqual(code, 1)
        self.assertIn("Nothing was changed", err)
        code, _, err = self.run_main(email="nobody@example.com")
        self.assertEqual(code, 1)
        self.assertIn("no account", err)
        self.assertNotIn("nobody@example.com", err)

    def test_the_command_does_nothing_without_a_database_address(self):
        code, _, err = self.run_main(database_url="")
        self.assertEqual(code, 2)
        self.assertIn("DATABASE_URL", err)

    def test_a_database_problem_is_reported_without_the_address(self):
        bad = f"sqlite:///{(Path(self.tmp.name) / 'missing' / 'x.db').as_posix()}"
        code, out, err = self.run_main(database_url=bad)
        self.assertEqual(code, 1)
        self.assertNotIn("missing", out + err)  # the path (like a real address) is never echoed


if __name__ == "__main__":
    unittest.main()
