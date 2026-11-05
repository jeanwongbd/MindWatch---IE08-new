import sqlite3
import tempfile
import unittest
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.auth import start_session
from backend.journal import MAX_JOURNAL_CHARS
from backend.main import create_app
from backend.models import User
from backend.scripts.seed_demo_user import seed
from backend.settings import Settings
from backend.tests.test_auth import CODE, PASSWORD, signup_body

NOW = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)
ENTRY_KEYS = {"id", "date", "text", "created_at", "updated_at"}


class Journal(unittest.TestCase):
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

    def write(self, who, text="hello", offset=0):
        return self.client.post("/me/journal", json={"text": text, "utc_offset_minutes": offset}, headers=who)

    def rows(self, sql):
        with closing(sqlite3.connect(self.db_path)) as conn:
            return conn.execute(sql).fetchall()

    def test_write_and_list_newest_first(self):
        first = self.write(self.alice, "  first  ")
        self.assertEqual(first.status_code, 201)
        self.assertEqual(set(first.json()), ENTRY_KEYS)
        self.assertEqual(first.json()["text"], "first")
        self.now += timedelta(minutes=5)
        second = self.write(self.alice, "second")
        listed = self.client.get("/me/journal", headers=self.alice)
        self.assertEqual(listed.status_code, 200)
        body = listed.json()
        self.assertEqual(set(body), {"entries"})
        self.assertEqual([e["text"] for e in body["entries"]], ["second", "first"])
        self.assertEqual(body["entries"][0], second.json())
        self.assertEqual(set(body["entries"][0]), ENTRY_KEYS)
        limited = self.client.get("/me/journal?limit=1", headers=self.alice).json()["entries"]
        self.assertEqual([e["text"] for e in limited], ["second"])
        self.assertEqual(self.client.get("/me/journal?limit=201", headers=self.alice).status_code, 422)

    def test_date_uses_the_phone_local_day(self):
        self.now = datetime(2026, 1, 1, 20, 0, tzinfo=timezone.utc)
        self.assertEqual(self.write(self.alice, "a", offset=480).json()["date"], "2026-01-02")
        self.assertEqual(self.write(self.alice, "b", offset=0).json()["date"], "2026-01-01")
        self.assertEqual(self.write(self.alice, "c", offset=-300).json()["date"], "2026-01-01")
        bad = self.client.post("/me/journal", json={"text": "x", "utc_offset_minutes": 900}, headers=self.alice)
        self.assertEqual(bad.status_code, 422)

    def test_edit_keeps_date_and_changes_text(self):
        entry = self.write(self.alice, "before", offset=0).json()
        self.now += timedelta(days=1)
        edited = self.client.put(f"/me/journal/{entry['id']}", json={"text": " after "}, headers=self.alice)
        self.assertEqual(edited.status_code, 200)
        body = edited.json()
        self.assertEqual(set(body), ENTRY_KEYS)
        self.assertEqual((body["text"], body["date"]), ("after", entry["date"]))
        self.assertEqual(body["created_at"], entry["created_at"])
        self.assertNotEqual(body["updated_at"], entry["updated_at"])
        blank = self.client.put(f"/me/journal/{entry['id']}", json={"text": " "}, headers=self.alice)
        self.assertEqual(blank.status_code, 422)

    def test_delete_removes_entry(self):
        entry = self.write(self.alice).json()
        self.assertEqual(self.client.delete(f"/me/journal/{entry['id']}", headers=self.alice).status_code, 204)
        self.assertEqual(self.client.get("/me/journal", headers=self.alice).json(), {"entries": []})
        self.assertEqual(self.client.delete(f"/me/journal/{entry['id']}", headers=self.alice).status_code, 404)

    def test_user_a_cannot_read_user_b(self):
        self.write(self.alice, "alice note")
        self.write(self.bob, "bob note")
        listed = self.client.get("/me/journal", headers=self.alice).json()["entries"]
        self.assertEqual([e["text"] for e in listed], ["alice note"])

    def test_user_a_cannot_edit_or_delete_user_b(self):
        entry = self.write(self.bob, "bob note").json()
        url = f"/me/journal/{entry['id']}"
        self.assertEqual(self.client.put(url, json={"text": "hacked"}, headers=self.alice).status_code, 404)
        self.assertEqual(self.client.delete(url, headers=self.alice).status_code, 404)
        unknown = "/me/journal/not-a-real-id"
        self.assertEqual(self.client.put(unknown, json={"text": "x"}, headers=self.alice).status_code, 404)
        self.assertEqual(self.client.delete(unknown, headers=self.alice).status_code, 404)
        self.assertEqual(self.client.get("/me/journal", headers=self.bob).json()["entries"], [entry])

    def test_empty_text_rejected(self):
        for text in ("", "   \n\t "):
            self.assertEqual(self.write(self.alice, text).status_code, 422)
        self.assertEqual(self.rows("select count(*) from journal_entries"), [(0,)])

    def test_text_over_limit_rejected(self):
        self.assertEqual(self.write(self.alice, "a" * (MAX_JOURNAL_CHARS + 1)).status_code, 422)
        # Whitespace around the text does not count toward the limit.
        ok = self.write(self.alice, "  " + "a" * MAX_JOURNAL_CHARS + "  ")
        self.assertEqual(ok.status_code, 201)
        self.assertEqual(len(ok.json()["text"]), MAX_JOURNAL_CHARS)
        url = f"/me/journal/{ok.json()['id']}"
        over = self.client.put(url, json={"text": "b" * (MAX_JOURNAL_CHARS + 1)}, headers=self.alice)
        self.assertEqual(over.status_code, 422)

    def test_text_is_never_logged(self):
        secret = "my-very-private-thought-9731"
        with self.assertLogs("mindwatch", level="DEBUG") as logs:
            entry = self.write(self.alice, secret).json()
            self.client.put(f"/me/journal/{entry['id']}", json={"text": secret + " edited"}, headers=self.alice)
            self.client.delete(f"/me/journal/{entry['id']}", headers=self.alice)
        output = "\n".join(logs.output)
        self.assertNotIn("my-very-private", output)
        for word in ("saved", "updated", "deleted"):
            self.assertIn(f"journal entry {word} user_id=", output)

    def test_export_includes_journal(self):
        self.write(self.alice, "one")
        self.now += timedelta(minutes=1)
        self.write(self.alice, "two")
        self.write(self.bob, "not alice")
        exported = self.client.get("/me/export", headers=self.alice).json()
        self.assertEqual([j["text"] for j in exported["journal"]], ["one", "two"])
        self.assertEqual(set(exported["journal"][0]), ENTRY_KEYS)

    def test_delete_account_removes_journal(self):
        self.write(self.alice, "one")
        self.write(self.bob, "keep")
        response = self.client.post("/me/delete", json={"password": PASSWORD}, headers=self.alice)
        self.assertEqual(response.status_code, 204)
        self.assertEqual(self.rows("select text from journal_entries"), [("keep",)])

    def test_sample_copy_can_write_journal(self):
        seed(self.app.state.engine, NOW.date())
        visit = self.client.post("/auth/sample").json()
        headers = {"Authorization": f"Bearer {visit['token']}"}
        self.assertEqual(self.client.get("/me/journal", headers=headers).json(), {"entries": []})
        self.assertEqual(self.write(headers, "mine").status_code, 201)
        # Removing the copy removes its journal too.
        self.assertEqual(self.client.post("/me/delete", json={}, headers=headers).status_code, 204)
        self.assertEqual(self.rows("select count(*) from journal_entries"), [(0,)])

    def test_template_cannot_write_journal(self):
        template_id = seed(self.app.state.engine, NOW.date())
        with Session(self.app.state.engine) as db:
            token = start_session(db, db.get(User, template_id), NOW, days=1)["token"]
        headers = {"Authorization": f"Bearer {token}"}
        self.assertEqual(self.client.get("/me/journal", headers=headers).status_code, 200)
        self.assertEqual(self.write(headers).status_code, 403)
        self.assertEqual(self.rows("select count(*) from journal_entries"), [(0,)])

    def test_requires_sign_in(self):
        entry = self.write(self.alice).json()
        url = f"/me/journal/{entry['id']}"
        self.assertEqual(self.client.get("/me/journal").status_code, 401)
        body = {"text": "x", "utc_offset_minutes": 0}
        self.assertEqual(self.client.post("/me/journal", json=body).status_code, 401)
        self.assertEqual(self.client.put(url, json={"text": "x"}).status_code, 401)
        self.assertEqual(self.client.delete(url).status_code, 401)


if __name__ == "__main__":
    unittest.main()
