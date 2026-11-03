import json
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
from backend.tests.test_auth import CODE, PASSWORD, signup_body

NOON = datetime(2026, 1, 15, 12, 0, tzinfo=timezone.utc)
TODAY = "2026-01-15"
YESTERDAY = "2026-01-14"
NEW_PASSWORD = "a brand new password"


class AccountCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db_path = Path(self.tmp.name) / "app.db"
        settings = Settings(database_url=f"sqlite:///{self.db_path.as_posix()}", invite_codes=(CODE,))
        self.app = create_app(state_path=Path(self.tmp.name) / "s.json", settings=settings)
        self.now = NOON
        self.app.state.clock = lambda: self.now
        context = TestClient(self.app)
        self.client = context.__enter__()
        self.addCleanup(context.__exit__, None, None, None)

    def signup(self, email):
        response = self.client.post("/auth/signup", json=signup_body(email=email))
        self.assertEqual(response.status_code, 201)
        body = response.json()
        return {"headers": {"Authorization": f"Bearer {body['token']}"}, "id": body["user"]["id"], "email": email}

    def login(self, email, password=PASSWORD):
        return self.client.post("/auth/login", json={"email": email, "password": password})

    def token_of(self, email, password=PASSWORD):
        response = self.login(email, password)
        self.assertEqual(response.status_code, 200)
        return {"Authorization": f"Bearer {response.json()['token']}"}

    def check_in(self, who, day=TODAY, stress=5, word=None):
        body = {"stress": stress, "word": word, "utc_offset_minutes": 0}
        self.assertIn(self.client.put(f"/me/checkins/{day}", json=body, headers=who["headers"]).status_code, (200, 201))

    def delete_account(self, who, password=PASSWORD):
        return self.client.post("/me/delete", json={"password": password}, headers=who["headers"])

    def count(self, table, where="", args=()):
        with closing(sqlite3.connect(self.db_path)) as conn:
            return conn.execute(f"select count(*) from {table} {where}", args).fetchone()[0]

    def tables(self):
        with closing(sqlite3.connect(self.db_path)) as conn:
            rows = conn.execute("select name from sqlite_master where type = 'table'").fetchall()
        return [name for (name,) in rows if name != "alembic_version"]

    def everything_mentioning(self, *needles):
        """Every table and column holding any of these values, found by scanning the whole database."""
        found = []
        with closing(sqlite3.connect(self.db_path)) as conn:
            for table in self.tables():
                columns = [c[1] for c in conn.execute(f"pragma table_info({table})").fetchall()]
                for row in conn.execute(f"select * from {table}").fetchall():
                    for column, value in zip(columns, row):
                        if any(n in str(value) for n in needles):
                            found.append(f"{table}.{column}")
        return found


class DeleteAccount(AccountCase):
    def test_delete_removes_every_user_row(self):
        alice, bob = self.signup("alice@example.com"), self.signup("bob@example.com")
        for who in (alice, bob):
            self.check_in(who, TODAY, 6, "Tired")
            self.check_in(who, YESTERDAY, 4, "Calm")
            self.token_of(who["email"])  # a second session
        self.login(alice["email"], "not the password!!")  # a failed sign-in is recorded too
        self.assertGreater(self.count("login_failures", "where email = ?", (alice["email"],)), 0)
        self.assertEqual(self.everything_mentioning(alice["id"], alice["email"]).count("checkins.user_id"), 2)

        self.assertEqual(self.delete_account(alice).status_code, 204)

        # Not one row, in any table, mentions Alice any more: by ID or by email.
        self.assertEqual(self.everything_mentioning(alice["id"], alice["email"]), [])
        for table in ("users", "sessions", "consents", "calibration_answers", "checkins"):
            self.assertEqual(self.count(table, "where " + ("id" if table == "users" else "user_id") + " = ?", (alice["id"],)), 0, table)
        self.assertEqual(self.count("login_failures", "where email = ?", (alice["email"],)), 0)

    def test_deleting_one_person_leaves_everyone_else_untouched(self):
        alice, bob = self.signup("alice@example.com"), self.signup("bob@example.com")
        self.check_in(alice)
        self.check_in(bob, TODAY, 9, "Sad")
        before = self.everything_mentioning(bob["id"])
        self.delete_account(alice)
        self.assertEqual(self.everything_mentioning(bob["id"]), before)
        self.assertEqual(self.client.get("/auth/me", headers=bob["headers"]).status_code, 200)
        self.assertEqual(self.client.get(f"/me/checkins/{TODAY}", headers=bob["headers"]).json()["stress"], 9)

    def test_deleted_user_cannot_log_in(self):
        alice = self.signup("alice@example.com")
        other_device = self.token_of(alice["email"])
        self.delete_account(alice)
        gone = self.login(alice["email"])
        self.assertEqual(gone.status_code, 401)
        # The reply is the same as for an email that never existed, so it reveals nothing.
        never = self.login("never.existed@example.com")
        self.assertEqual((gone.status_code, gone.json()), (never.status_code, never.json()))
        for headers in (alice["headers"], other_device):
            self.assertEqual(self.client.get("/auth/me", headers=headers).status_code, 401)
            self.assertEqual(self.client.get("/me/summary", params={"utc_offset_minutes": 0}, headers=headers).status_code, 401)
            self.assertEqual(self.client.get("/me/export", headers=headers).status_code, 401)

    def test_the_same_email_can_start_again_with_nothing_carried_over(self):
        alice = self.signup("alice@example.com")
        self.check_in(alice, TODAY, 8, "Anxious")
        self.delete_account(alice)
        again = self.signup("alice@example.com")
        self.assertNotEqual(again["id"], alice["id"])
        self.assertEqual(self.client.get("/me/checkins", headers=again["headers"]).json(), {"checkins": []})
        self.assertEqual(self.everything_mentioning(alice["id"], "Anxious"), [])

    def test_a_wrong_password_deletes_nothing(self):
        alice = self.signup("alice@example.com")
        self.check_in(alice)
        response = self.delete_account(alice, "not the password!!")
        self.assertEqual(response.status_code, 403)  # not 401: that would look like an expired session
        self.assertEqual(self.count("users", "where id = ?", (alice["id"],)), 1)
        self.assertEqual(self.count("checkins", "where user_id = ?", (alice["id"],)), 1)
        self.assertEqual(self.client.get("/auth/me", headers=alice["headers"]).status_code, 200)

    def test_deleting_needs_a_password_and_a_login_and_nothing_extra(self):
        alice = self.signup("alice@example.com")
        self.assertEqual(self.client.post("/me/delete", json={}, headers=alice["headers"]).status_code, 422)
        self.assertEqual(
            self.client.post("/me/delete", json={"password": PASSWORD, "user_id": "someone-else"}, headers=alice["headers"]).status_code,
            422,
        )
        self.assertEqual(self.client.post("/me/delete", json={"password": PASSWORD}).status_code, 401)
        self.assertEqual(self.count("users"), 1)

    def test_guessing_the_password_through_delete_is_slowed_like_a_login(self):
        alice = self.signup("alice@example.com")
        for _ in range(5):
            self.assertEqual(self.delete_account(alice, "wrong wrong wrong").status_code, 403)
        locked = self.delete_account(alice)  # even the right password is refused while locked
        self.assertEqual(locked.status_code, 429)
        self.assertGreater(int(locked.headers["Retry-After"]), 0)
        self.assertEqual(self.count("users"), 1)
        self.assertEqual(self.login(alice["email"]).status_code, 429)  # the same lockout covers sign-in
        self.now += timedelta(minutes=16)
        self.assertEqual(self.delete_account(alice).status_code, 204)

    def test_failed_sign_in_records_go_even_if_the_password_check_leaves_them(self):
        # The password check normally clears these as it succeeds. Deleting must not depend on that:
        # take that step away and the records must still go.
        alice = self.signup("alice@example.com")
        self.login(alice["email"], "not the password!!")
        self.login(alice["email"], "not the password!!")
        self.assertEqual(self.count("login_failures", "where email = ?", (alice["email"],)), 2)
        with mock.patch("backend.account.require_password", lambda *args, **kwargs: None):
            self.assertEqual(self.delete_account(alice).status_code, 204)
        self.assertEqual(self.count("login_failures", "where email = ?", (alice["email"],)), 0)
        self.assertEqual(self.everything_mentioning(alice["id"], alice["email"]), [])

    def test_the_log_holds_an_id_and_nothing_personal(self):
        alice = self.signup("alice@example.com")
        with self.assertLogs("mindwatch", level="INFO") as logs:
            self.delete_account(alice)
        text = "\n".join(logs.output)
        self.assertIn(f"account deleted user_id={alice['id']}", text)
        self.assertNotIn("alice@example.com", text)
        self.assertNotIn(PASSWORD, text)


class ExportMyData(AccountCase):
    def test_export_has_only_own_data(self):
        alice, bob = self.signup("alice@example.com"), self.signup("bob@example.com")
        self.check_in(alice, TODAY, 3, "Calm")
        self.check_in(alice, YESTERDAY, 7, None)
        self.check_in(bob, TODAY, 9, "Lonely")
        self.check_in(bob, YESTERDAY, 8, "Sad")

        response = self.client.get("/me/export", headers=alice["headers"])
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["account"]["id"], alice["id"])
        self.assertEqual(data["account"]["email"], "alice@example.com")
        self.assertEqual([(c["date"], c["stress"], c["word"]) for c in data["check_ins"]], [(YESTERDAY, 7, None), (TODAY, 3, "Calm")])
        self.assertEqual(data["consent"]["version"], "v0-draft")
        self.assertEqual(data["starting_point_answers"]["answers"]["sleep_hours"], "6_7")
        # Nothing about Bob, anywhere in what Alice downloads.
        for secret in (bob["id"], "bob@example.com", "Lonely", "Sad"):
            self.assertNotIn(secret, response.text)

    def test_export_leaves_out_passwords_and_security_records(self):
        alice = self.signup("alice@example.com")
        self.token_of(alice["email"])
        self.login(alice["email"], "not the password!!")
        text = self.client.get("/me/export", headers=alice["headers"]).text
        for private in ("argon2", "password", "token", "sessions", "login_failures", "failed_at"):
            self.assertNotIn(private, text.lower(), private)
        self.assertEqual(
            sorted(json.loads(text)), ["account", "check_ins", "consent", "exported_at", "starting_point_answers"]
        )

    def test_export_is_a_download_and_works_with_no_check_ins(self):
        alice = self.signup("alice@example.com")
        response = self.client.get("/me/export", headers=alice["headers"])
        self.assertIn("attachment", response.headers["content-disposition"])
        self.assertIn(".json", response.headers["content-disposition"])
        self.assertEqual(response.json()["check_ins"], [])

    def test_export_needs_a_login(self):
        self.assertEqual(self.client.get("/me/export").status_code, 401)
        self.assertEqual(self.client.get("/me/export", headers={"Authorization": "Bearer made-up"}).status_code, 401)

    def test_export_matches_what_the_summary_counts(self):
        alice = self.signup("alice@example.com")
        for n in range(5):
            self.check_in(alice, TODAY if n == 0 else YESTERDAY, n)
        summary = self.client.get("/me/summary", params={"utc_offset_minutes": 0}, headers=alice["headers"]).json()
        self.assertEqual(len(self.client.get("/me/export", headers=alice["headers"]).json()["check_ins"]), summary["count"])


class ChangePassword(AccountCase):
    def change(self, who, current=PASSWORD, new=NEW_PASSWORD):
        return self.client.post("/auth/password", json={"current_password": current, "new_password": new}, headers=who["headers"])

    def test_password_change_ends_other_sessions(self):
        alice = self.signup("alice@example.com")
        second = self.token_of(alice["email"])
        third = self.token_of(alice["email"])
        self.assertEqual(self.change({"headers": second}).status_code, 204)
        # The device that changed it stays signed in. Every other device is signed out.
        self.assertEqual(self.client.get("/auth/me", headers=second).status_code, 200)
        self.assertEqual(self.client.get("/auth/me", headers=alice["headers"]).status_code, 401)
        self.assertEqual(self.client.get("/auth/me", headers=third).status_code, 401)
        self.assertEqual(self.count("sessions", "where user_id = ?", (alice["id"],)), 1)

    def test_the_new_password_works_and_the_old_one_does_not(self):
        alice = self.signup("alice@example.com")
        self.change(alice)
        self.assertEqual(self.login(alice["email"], PASSWORD).status_code, 401)
        self.assertEqual(self.login(alice["email"], NEW_PASSWORD).status_code, 200)

    def test_a_wrong_current_password_changes_nothing(self):
        alice = self.signup("alice@example.com")
        other = self.token_of(alice["email"])
        self.assertEqual(self.change(alice, current="not the password!!").status_code, 403)
        self.assertEqual(self.login(alice["email"], PASSWORD).status_code, 200)
        self.assertEqual(self.client.get("/auth/me", headers=other).status_code, 200)  # no one was signed out

    def test_a_weak_or_unchanged_new_password_is_refused(self):
        alice = self.signup("alice@example.com")
        for bad in ("short", "x" * 129, PASSWORD):
            self.assertEqual(self.change(alice, new=bad).status_code, 422, bad[:12])
        self.assertEqual(self.login(alice["email"], PASSWORD).status_code, 200)

    def test_guessing_the_current_password_here_is_slowed_like_a_login(self):
        alice = self.signup("alice@example.com")
        for _ in range(5):
            self.assertEqual(self.change(alice, current="wrong wrong wrong").status_code, 403)
        self.assertEqual(self.change(alice).status_code, 429)

    def test_the_new_password_is_stored_scrambled_and_never_logged(self):
        alice = self.signup("alice@example.com")
        with self.assertLogs("mindwatch", level="INFO") as logs:
            self.change(alice)
        self.assertNotIn(NEW_PASSWORD, "\n".join(logs.output))
        self.assertEqual(self.everything_mentioning(NEW_PASSWORD, PASSWORD), [])
        with closing(sqlite3.connect(self.db_path)) as conn:
            (stored,) = conn.execute("select password_hash from users").fetchone()
        self.assertTrue(stored.startswith("$argon2id$"))

    def test_changing_a_password_needs_a_login_and_nothing_extra(self):
        body = {"current_password": PASSWORD, "new_password": NEW_PASSWORD}
        self.assertEqual(self.client.post("/auth/password", json=body).status_code, 401)
        alice = self.signup("alice@example.com")
        self.assertEqual(
            self.client.post("/auth/password", json={**body, "email": "someone@else.com"}, headers=alice["headers"]).status_code, 422
        )


if __name__ == "__main__":
    unittest.main()
