"""Runtime settings, read from environment variables when asked for.

Read on call rather than at import, so tests can change the environment.
"""
import os
from dataclasses import dataclass
from typing import Optional, Tuple

# Browsers allowed to call the API: the deployed site, the Android app
# (Capacitor serves it from http://localhost, or https://localhost) and local dev servers.
DEFAULT_CORS_ORIGINS: Tuple[str, ...] = (
    "https://mindwatch-frontend.onrender.com",
    "http://localhost",
    "https://localhost",
    "http://localhost:5173",
    "http://localhost:8443",
)


@dataclass(frozen=True)
class Settings:
    database_url: Optional[str] = None
    cors_origins: Tuple[str, ...] = DEFAULT_CORS_ORIGINS
    # Codes that allow signing up. Set INVITE_CODES in Render; never put a real one in code.
    invite_codes: Tuple[str, ...] = ()


def _split(value: str) -> Tuple[str, ...]:
    return tuple(part.strip().rstrip("/") for part in value.split(",") if part.strip())


def get_settings() -> Settings:
    cors = os.getenv("CORS_ORIGINS", "")
    if cors.strip():
        origins = _split(cors)
    else:
        origins = DEFAULT_CORS_ORIGINS
        frontend = os.getenv("FRONTEND_URL", "").strip().rstrip("/")
        if frontend and frontend not in origins:
            origins = origins + (frontend,)
    return Settings(
        database_url=os.getenv("DATABASE_URL", "").strip() or None,
        cors_origins=origins,
        invite_codes=tuple(
            code.strip() for code in os.getenv("INVITE_CODES", "").split(",") if code.strip()
        ),
    )
