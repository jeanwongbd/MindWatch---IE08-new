"""Database connection and migrations. The app must work without a database."""
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine

MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"


def normalize_database_url(url: str) -> str:
    """Hosts give postgres:// or postgresql://; SQLAlchemy needs the psycopg driver named."""
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


def make_engine(url: str) -> Engine:
    return create_engine(normalize_database_url(url), pool_pre_ping=True)


def run_migrations(url: str) -> None:
    """Bring the database up to the latest revision. Safe to run repeatedly."""
    config = Config()
    config.set_main_option("script_location", str(MIGRATIONS_DIR))
    # Passed as an attribute, not an option, because a password can contain "%".
    config.attributes["database_url"] = normalize_database_url(url)
    command.upgrade(config, "head")
