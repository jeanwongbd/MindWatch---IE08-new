import os
import sqlite3
from contextlib import closing
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient

from backend.db import normalize_database_url, run_migrations
from backend.main import create_app
from backend.settings import DEFAULT_CORS_ORIGINS, Settings, get_settings


class SettingsAndDatabase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)

    def client(self, **settings):
        app = create_app(state_path=self.dir / "checkins.json", settings=Settings(**settings))
        # The context manager runs app startup, where migrations happen.
        return TestClient(app)

    def sqlite_url(self, name="app.db"):
        return f"sqlite:///{(self.dir / name).as_posix()}"

    def test_app_starts_without_database(self):
        with self.client() as client:
            body = client.get("/health").json()
        self.assertEqual(body["status"], "online")
        self.assertEqual(body["database"], "not_configured")

    def test_demo_works_without_database(self):
        with self.client() as client:
            date = client.get("/demo/config").json()["default_date"]
            self.assertEqual(client.get("/today", params={"date": date}).status_code, 200)
            self.assertEqual(client.get("/trends").status_code, 200)
            self.assertEqual(client.post("/checkin", json={"date": date, "stress": 4}).status_code, 200)

    def test_demo_works_when_database_is_unreachable(self):
        bad_url = f"sqlite:///{(self.dir / 'missing_folder' / 'app.db').as_posix()}"
        with self.client(database_url=bad_url) as client:
            self.assertEqual(client.get("/health").json()["database"], "unavailable")
            date = client.get("/demo/config").json()["default_date"]
            self.assertEqual(client.get("/today", params={"date": date}).status_code, 200)

    def test_migrations_run_on_empty_database(self):
        url = self.sqlite_url()
        with self.client(database_url=url) as client:
            self.assertEqual(client.get("/health").json()["database"], "ready")
        with closing(sqlite3.connect(self.dir / "app.db")) as conn:
            version = conn.execute("select version_num from alembic_version").fetchone()
        self.assertEqual(version, ("0011",))

    def test_migrations_can_run_twice(self):
        url = self.sqlite_url()
        run_migrations(url)
        run_migrations(url)

    def test_android_origin_allowed(self):
        with self.client() as client:
            for origin in ("http://localhost", "https://localhost"):
                response = client.options(
                    "/checkin",
                    headers={
                        "Origin": origin,
                        "Access-Control-Request-Method": "POST",
                        "Access-Control-Request-Headers": "content-type",
                    },
                )
                self.assertEqual(response.status_code, 200, origin)
                self.assertEqual(response.headers.get("access-control-allow-origin"), origin)

    def test_unknown_origin_not_allowed(self):
        with self.client() as client:
            response = client.options(
                "/checkin",
                headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"},
            )
        self.assertNotIn("access-control-allow-origin", response.headers)

    def test_settings_read_from_environment(self):
        with mock.patch.dict(os.environ, {"DATABASE_URL": "", "CORS_ORIGINS": "", "FRONTEND_URL": ""}):
            self.assertIsNone(get_settings().database_url)
            self.assertEqual(get_settings().cors_origins, DEFAULT_CORS_ORIGINS)
        env = {"DATABASE_URL": "postgres://u:p@h/db", "CORS_ORIGINS": "https://a.example/, https://b.example"}
        with mock.patch.dict(os.environ, env):
            settings = get_settings()
        self.assertEqual(settings.database_url, "postgres://u:p@h/db")
        self.assertEqual(settings.cors_origins, ("https://a.example", "https://b.example"))
        with mock.patch.dict(os.environ, {"CORS_ORIGINS": "", "FRONTEND_URL": "https://site.example/"}):
            self.assertIn("https://site.example", get_settings().cors_origins)

    def test_database_url_gets_the_psycopg_driver(self):
        self.assertEqual(normalize_database_url("postgres://u:p@h/db"), "postgresql+psycopg://u:p@h/db")
        self.assertEqual(normalize_database_url("postgresql://u:p@h/db"), "postgresql+psycopg://u:p@h/db")
        self.assertEqual(normalize_database_url("sqlite:///x.db"), "sqlite:///x.db")


if __name__ == "__main__":
    unittest.main()
