"""Database connection and migrations. The app must work without a database."""
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine

MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"


def normalize_database_url(url: str) -> str:
    """Hosts give postgres:// or postgresql://; SQLAlchemy needs the psycopg driver named."""
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


def make_engine(url: str) -> Engine:
    engine = create_engine(normalize_database_url(url), pool_pre_ping=True)
    if engine.dialect.name == "sqlite":
        # SQLite ignores foreign keys unless asked. Turn them on so tests behave like Postgres.
        @event.listens_for(engine, "connect")
        def _enforce_foreign_keys(dbapi_connection, _record):
            dbapi_connection.execute("PRAGMA foreign_keys=ON")

    return engine


def run_migrations(url: str) -> None:
    """Bring the database up to the latest revision. Safe to run repeatedly."""
    config = Config()
    config.set_main_option("script_location", str(MIGRATIONS_DIR))
    # Passed as an attribute, not an option, because a password can contain "%".
    config.attributes["database_url"] = normalize_database_url(url)
    command.upgrade(config, "head")
