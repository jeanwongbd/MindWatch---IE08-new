import json
import logging
import math
import os
import tempfile
import threading
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Optional, Literal

import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field, StrictInt
from requests_oauthlib import OAuth2Session
import numpy as np

from backend.auth import router as auth_router
from backend.db import make_engine, run_migrations
from backend.settings import get_settings

logging.basicConfig(level=logging.INFO)
LOGGER = logging.getLogger("mindwatch")

BASE_DIR = Path(__file__).resolve().parent
BASE = BASE_DIR
MODELS_DIR = BASE_DIR / "models"
DEMO_DIR = BASE_DIR / "demo"

DEMO_MODEL_PATH = MODELS_DIR / "demo_personal_model.joblib"
MIN_HRV_HISTORY = 7

# ---------------------------------------------------------------------------
# Google Fitness / Fitbit OAuth Configuration
# ---------------------------------------------------------------------------
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
REDIRECT_URI = os.getenv("FITBIT_REDIRECT_URI", "https://mindwatch-ie08.onrender.com/api/fitbit/callback")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://mindwatch-frontend.onrender.com")

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"

SCOPES = [
    "https://www.googleapis.com/auth/fitness.heart_rate.read",
    "https://www.googleapis.com/auth/fitness.sleep.read",
    "https://www.googleapis.com/auth/fitness.activity.read",
]

live_fitbit_cache = {
    "access_token": None,
    "last_sync": None,
    "latest_hr": None,
    "sleep_minutes": 420,
    "body_load": None,
    "status": "disconnected",
    "oauth_state": None,
}


def require_google_secret():
    if not GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=503,
            detail="Google OAuth is not configured. Set the GOOGLE_CLIENT_SECRET environment variable.",
        )


def comparison(estimate, reported):
    if estimate is None or reported is None:
        return {
            "state": None,
            "label": "Not enough data",
            "description": "A comparison needs both values.",
        }
    if estimate < 50 and reported < 50:
        state, label, description = (
            "aligned_low",
            "Both below threshold",
            "Both values are below the demo threshold.",
        )
    elif estimate >= 50 and reported >= 50:
        state, label, description = (
            "aligned_high",
            "Both at or above threshold",
            "Both values are at or above the demo threshold.",
        )
    elif estimate >= 50:
        state, label, description = (
            "estimate_high_reported_low",
            "Estimate higher, reported lower",
            "Your reported stress is lower than the wearable-based estimate.",
        )
    else:
        state, label, description = (
            "estimate_low_reported_high",
            "Reported higher, estimate lower",
            "Your reported stress is higher than the wearable-based estimate.",
        )
    return {"state": state, "label": label, "description": description}


# ---------------------------------------------------------------------------
# Replay & Fixture Engine
# ---------------------------------------------------------------------------
class Demo:
    def __init__(self, model_path=None, state_path=None):
        self.metadata = {
            "profile_id": "demo_p05",
            "default_date": "2025-04-21",
            "replay_dates": [
                "2025-04-16",
                "2025-04-17",
                "2025-04-18",
                "2025-04-19",
                "2025-04-20",
                "2025-04-21",
                "2025-04-22",
                "2025-04-23",
                "2025-04-24",
                "2025-04-25",
            ],
            "limitation": "Provisional retrospective SSAQS daily replay.",
        }
        self.records = {}
        self.scenarios = {}

        meta_file = DEMO_DIR / "profile_metadata.json"
        if meta_file.exists():
            try:
                self.metadata = json.loads(meta_file.read_text())
            except Exception as e:
                LOGGER.warning("Could not read profile_metadata.json: %s", e)

        hist_file = DEMO_DIR / "historical_profile.json"
        if hist_file.exists():
            try:
                self.records = {
                    r["date"]: r for r in json.loads(hist_file.read_text())
                }
            except Exception as e:
                LOGGER.warning("Could not read historical_profile.json: %s", e)

        scen_file = DEMO_DIR / "demo_scenarios.json"
        if scen_file.exists():
            try:
                self.scenarios = {
                    r["id"]: r for r in json.loads(scen_file.read_text())
                }
            except Exception as e:
                LOGGER.warning("Could not read demo_scenarios.json: %s", e)

        self.profile = self.metadata.get("profile_id", "demo_p05")
        self.state_path = Path(
            state_path
            or os.getenv(
                "MINDWATCH_STATE_PATH",
                str(BASE_DIR / "runtime/demo_checkins.json"),
            )
        )
        self.lock = threading.Lock()
        self.overrides = {}
        self.state_error = None

        if self.state_path.exists():
            try:
                stored = json.loads(self.state_path.read_text())
                if isinstance(stored, dict):
                    self.overrides = stored
            except Exception as exc:
                self.state_error = str(exc)

        self.trained = None
        self.model_error = None
        target_model = Path(
            model_path
            if model_path is not None
            else os.getenv("MINDWATCH_MODEL_PATH", str(DEMO_MODEL_PATH))
        )

        try:
            from ml.src.personalized_model import load_personal_model

            if target_model.exists():
                self.trained = load_personal_model(target_model)
            else:
                self.model_error = "Model file not found"
        except Exception as exc:
            self.model_error = str(exc)

    def key(self, date: str) -> str:
        return f"{self.profile}/{date}"

    def persist(self, updated: dict):
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        fd, name = tempfile.mkstemp(
            dir=self.state_path.parent, prefix="checkins-", suffix=".tmp"
        )
        try:
            with os.fdopen(fd, "w") as stream:
                json.dump(updated, stream, indent=2, allow_nan=False)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(name, self.state_path)
        finally:
            if os.path.exists(name):
                try:
                    os.unlink(name)
                except OSError:
                    pass
        self.overrides = updated
        self.state_error = None

    def response(
        self,
        mode: str = "historical_replay",
        date: Optional[str] = None,
        scenario: Optional[str] = None,
    ):
        if mode == "synthetic_scenario":
            if scenario not in self.scenarios:
                raise HTTPException(404, "Unknown synthetic scenario")
            item = self.scenarios[scenario]
            value, reported = item.get("estimate"), item.get("stress", 50)
            comparison_info = comparison(value, reported)
            return {
                "user_id": self.profile,
                "date": None,
                "mode": mode,
                "scenario_id": scenario,
                "source_label": "Synthetic scenario",
                "scenario_label": item.get("label", "Synthetic Scenario"),
                "reported_stress": {
                    "value": reported,
                    "scale_max": 100,
                    "normalized_0_100": reported,
                    "source": "synthetic_fixture",
                },
                "physiological_load": {
                    "value": value if value is not None else 50,
                    "category": "high" if (value or 0) >= 50 else "low",
                },
                "wearable_estimate": {
                    "value": value,
                    "scale_max": 100,
                    "status": "ready"
                    if value is not None
                    else "insufficient_data",
                    "method": "synthetic_fixture",
                },
                "mismatch": comparison_info,
                "comparison": comparison_info,
                "contributors": [
                    {
                        "feature": "sleep",
                        "direction": "neutral",
                        "description": "Synthetic scenario: no measured sleep data",
                    },
                    {
                        "feature": "hrv",
                        "direction": "neutral",
                        "description": "Synthetic scenario: no measured HRV data",
                    },
                ],
                "measurements": {},
                "imputed_features": [],
                "limitation": "Fixed interface fixtures. These values were not generated by Ridge.",
            }

        date = date or self.metadata.get("default_date", "2025-04-21")
        if date not in self.records:
            raise HTTPException(404, "Unknown replay date")

        record = self.records[date]
        inputs = dict(record.get("measurements", {}))
        history = record.get("hrv_history", [])
        avg_rmssd = inputs.get("avg_rmssd")
        deviation = (
            (avg_rmssd - sum(history) / len(history))
            if (len(history) >= MIN_HRV_HISTORY and avg_rmssd is not None)
            else None
        )

        value = None
        imputed_features = []

        if self.trained is None:
            status = "model_unavailable"
        elif all(v is None for v in inputs.values()):
            status = "insufficient_data"
        else:
            try:
                from ml.src.personalized_model import estimate_stress

                value = estimate_stress(
                    self.trained, **inputs, hrv_history=history
                )
                if value is None or not math.isfinite(value):
                    status = "insufficient_data"
                    value = None
                else:
                    status = "ready"
                    features_expected = self.trained.get(
                        "features",
                        [
                            "avg_rmssd",
                            "overall_score",
                            "daily_steps",
                            "avg_rmssd_dev",
                        ],
                    )
                    full_meas = {**inputs, "avg_rmssd_dev": deviation}
                    imputed_features = [
                        f for f in features_expected if full_meas.get(f) is None
                    ]
            except Exception:
                value = None
                status = "insufficient_data"

        wearable_val = float(value) if value is not None else None
        load_val = int(round(wearable_val)) if wearable_val is not None else 50

        with self.lock:
            override = self.overrides.get(self.key(date))

        raw_stress = record.get("stress", 30)
        reported = {
            "value": round(raw_stress / 10),
            "scale_max": 10,
            "normalized_0_100": raw_stress,
            "source": "historical_ssaqs",
            "context_tags": [],
        }

        if override:
            override_val = override["stress"]
            reported = {
                "value": override_val,
                "scale_max": 10,
                "normalized_0_100": override_val * 10,
                "source": "demo_checkin",
                "context_tags": override.get("context_tags", []),
                "submitted_at": override.get("submitted_at"),
            }

        comparison_info = comparison(wearable_val, reported["normalized_0_100"])

        overall_score = inputs.get("overall_score")
        if overall_score is None:
            sleep_contributor = {
                "feature": "sleep",
                "direction": "neutral",
                "description": "No sleep score for this date",
            }
        else:
            sleep_contributor = {
                "feature": "sleep",
                "direction": "negative" if overall_score < 75 else "positive",
                "description": f"Sleep score {overall_score:.0f} / 100",
            }

        if deviation is None:
            hrv_contributor = {
                "feature": "hrv",
                "direction": "neutral",
                "description": "Not enough HRV data for this date",
            }
        else:
            position = "below" if deviation < 0 else "above"
            hrv_contributor = {
                "feature": "hrv",
                "direction": "negative" if deviation < 0 else "positive",
                "description": f"{abs(deviation):.1f} ms {position} your earlier average",
            }

        contributors = [sleep_contributor, hrv_contributor]

        return {
            "user_id": self.profile,
            "date": date,
            "mode": mode,
            "source_label": "Historical SSAQS replay",
            "reported_stress": reported,
            "original_reported_stress": record.get("stress"),
            "physiological_load": {
                "value": load_val,
                "category": "high" if load_val >= 50 else "low",
            },
            "wearable_estimate": {
                "value": wearable_val,
                "scale_max": 100,
                "status": status,
                "method": "personalized_ridge_v2",
            },
            "mismatch": comparison_info,
            "comparison": comparison_info,
            "contributors": contributors,
            "measurements": {**inputs, "avg_rmssd_dev": deviation},
            "imputed_features": imputed_features,
            "limitation": self.metadata.get(
                "limitation", "Calibrated against personal baseline."
            ),
        }


# ---------------------------------------------------------------------------
# App Factory & Routes
# ---------------------------------------------------------------------------
class CheckInItem(BaseModel):
    date: str
    user_id: Optional[str] = "demo_p05"
    stress: StrictInt = Field(..., ge=0, le=10)
    context_tags: List[str] = Field(default_factory=list)
    context: List[str] = Field(default_factory=list)
    notes: Optional[str] = None

    class Config:
        extra = "forbid"


def create_app(model_path=None, state_path=None, settings=None):
    settings = settings or get_settings()
    demo = Demo(model_path=model_path, state_path=state_path)

    @asynccontextmanager
    async def lifespan(app):
        # The demo never needs the database, so a database problem must not stop startup.
        if settings.database_url:
            try:
                run_migrations(settings.database_url)
                app.state.engine = make_engine(settings.database_url)
                app.state.database_status = "ready"
            except Exception as e:
                # Log the type only: the message can contain the connection string.
                LOGGER.error("Database unavailable (%s). The demo still works.", type(e).__name__)
                app.state.database_status = "unavailable"
        yield
        if app.state.engine is not None:
            app.state.engine.dispose()

    app = FastAPI(title="MindWatch Unified API", version="2.5.0", lifespan=lifespan)
    app.state.demo = demo
    app.state.database_status = "unavailable" if settings.database_url else "not_configured"
    # Accounts need these. engine stays None, and the auth routes answer 503, without a database.
    app.state.engine = None
    app.state.clock = lambda: datetime.now(timezone.utc)
    app.state.invite_codes = settings.invite_codes
    app.include_router(auth_router)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health():
        return {
            "status": "online",
            "model_ready": demo.trained is not None,
            "state_ready": demo.state_error is None,
            "state_error": demo.state_error,
            "fitbit_authenticated": live_fitbit_cache.get("access_token") is not None,
            "database": app.state.database_status,
        }

    # -----------------------------------------------------------------------
    # Live Fitbit / Google Fitness OAuth & Sync Endpoints
    # -----------------------------------------------------------------------
    @app.get("/api/fitbit/login")
    def fitbit_login():
        """Initiates the Google Fitness OAuth 2.0 handshake."""
        require_google_secret()
        oauth = OAuth2Session(GOOGLE_CLIENT_ID, redirect_uri=REDIRECT_URI, scope=SCOPES)
        authorization_url, state = oauth.authorization_url(
            AUTH_URL,
            access_type="offline",
            prompt="consent"
        )
        live_fitbit_cache["oauth_state"] = state
        return RedirectResponse(authorization_url)

    @app.get("/api/fitbit/callback")
    def fitbit_callback(
        code: Optional[str] = None,
        state: Optional[str] = None,
        error: Optional[str] = None,
    ):
        """Swaps code for access token upon user approval."""
        expected_state = live_fitbit_cache.get("oauth_state")
        live_fitbit_cache["oauth_state"] = None

        if error:
            return RedirectResponse(f"{FRONTEND_URL}/?sync_error=denied")

        if not code or not state or state != expected_state:
            raise HTTPException(
                status_code=400,
                detail="Invalid sign-in response. Start again from the app.",
            )

        require_google_secret()
        payload = {
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": REDIRECT_URI,
        }
        try:
            res = requests.post(TOKEN_URL, data=payload, timeout=10)
        except requests.RequestException as e:
            LOGGER.error("Could not reach Google token endpoint: %s", type(e).__name__)
            raise HTTPException(status_code=502, detail="Could not reach Google.")
        if res.status_code != 200:
            raise HTTPException(status_code=400, detail=f"Token exchange failed: {res.text}")

        tokens = res.json()
        live_fitbit_cache["access_token"] = tokens.get("access_token")
        live_fitbit_cache["status"] = "connected"
        live_fitbit_cache["last_sync"] = datetime.now(timezone.utc).isoformat()

        return RedirectResponse(f"{FRONTEND_URL}/?synced=true")

    @app.get("/api/fitbit/sync-live")
    def fitbit_sync_live():
        """Pulls recent HR points from Google Fitness. Never substitutes made-up readings."""

        token = live_fitbit_cache.get("access_token")
        if not token:
            raise HTTPException(
                status_code=401, 
                detail="Fitbit / Google account not authenticated. Visit /api/fitbit/login first."
            )

        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        now_ns = int(time.time() * 1e9)
        start_ns = int((time.time() - 24 * 3600) * 1e9)

        hr_body = {
            "aggregateBy": [{"dataTypeName": "com.google.heart_rate.bpm"}],
            "bucketByTime": {"durationMillis": 60000},
            "startTimeNanos": start_ns,
            "endTimeNanos": now_ns,
        }

        try:
            hr_res = requests.post(
                "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate",
                headers=headers,
                json=hr_body,
                timeout=10,
            )
        except requests.RequestException as e:
            LOGGER.error("Could not fetch live heart rate: %s", e)
            raise HTTPException(status_code=502, detail="Could not reach Google Fitness.")

        if hr_res.status_code == 401:
            live_fitbit_cache["access_token"] = None
            live_fitbit_cache["status"] = "disconnected"
            raise HTTPException(
                status_code=401,
                detail="Google login expired. Visit /api/fitbit/login to reconnect.",
            )

        if hr_res.status_code != 200:
            LOGGER.error("Google Fitness returned status %s", hr_res.status_code)
            raise HTTPException(status_code=502, detail="Google Fitness request failed.")

        try:
            buckets = hr_res.json().get("bucket", [])
        except ValueError:
            LOGGER.error("Google Fitness returned an unreadable response")
            raise HTTPException(status_code=502, detail="Google Fitness request failed.")

        latest_hr = None
        for bucket in reversed(buckets):
            for ds in bucket.get("dataset", []):
                for point in ds.get("point", []):
                    values = point.get("value", [])
                    if values:
                        val = values[0].get("fpVal") or values[0].get("intVal")
                        if val is not None:
                            latest_hr = round(float(val), 1)
                            break
                if latest_hr is not None:
                    break
            if latest_hr is not None:
                break

        if latest_hr is None:
            return {
                "status": "no_data",
                "synced_at": None,
                "latest_heart_rate": None,
                "body_load": None,
                "source": "Google Fitness / Fitbit Live Telemetry",
            }

        load_score = round(min(100.0, max(8.0, (latest_hr - 60.0) * 1.75 + 12.0)), 1)

        live_fitbit_cache["latest_hr"] = latest_hr
        live_fitbit_cache["body_load"] = load_score
        live_fitbit_cache["last_sync"] = datetime.now(timezone.utc).isoformat()

        return {
            "status": "success",
            "synced_at": live_fitbit_cache["last_sync"],
            "latest_heart_rate": latest_hr,
            "body_load": load_score,
            "source": "Google Fitness / Fitbit Live Telemetry",
        }
    @app.get("/api/fitbit/status")
    def fitbit_status():
        """Provides frontend status indicators."""
        return {
            "authenticated": live_fitbit_cache.get("access_token") is not None,
            "last_sync": live_fitbit_cache.get("last_sync"),
            "latest_hr": live_fitbit_cache.get("latest_hr"),
            "body_load": live_fitbit_cache.get("body_load"),
        }

    # -----------------------------------------------------------------------
    # Core Demo Endpoints
    # -----------------------------------------------------------------------
    @app.get("/demo/config")
    def config():
        return {
            **demo.metadata,
            "scenarios": [
                {"id": r["id"], "label": r.get("label", r["id"])}
                for r in demo.scenarios.values()
            ],
        }

    @app.get("/today")
    def today(
        mode: Literal["historical_replay", "synthetic_scenario"] = "historical_replay",
        date: Optional[str] = None,
        scenario: Optional[str] = None,
    ):
        return demo.response(mode=mode, date=date, scenario=scenario)

    @app.get("/trends")
    def trends():
        replay_dates = demo.metadata.get(
            "replay_dates", sorted(list(demo.records.keys()))
        )
        records = [demo.response(date=d) for d in replay_dates]
        return {
            "mode": "historical_replay",
            "source_label": "Historical SSAQS replay",
            "records": records,
            "timeline": [
                {
                    "date": r["date"],
                    "physiological_load": r["physiological_load"]["value"],
                    "reported_stress": r["reported_stress"]["value"],
                }
                for r in records
            ],
        }

    @app.post("/checkin")
    @app.post("/checkins")
    def checkin(item: CheckInItem):
        target_date = item.date
        if target_date not in demo.records:
            raise HTTPException(404, "Unknown replay date")

        tags = item.context_tags or item.context
        if any(len(tag) > 80 for tag in tags):
            raise HTTPException(422, "Context tag too long")

        with demo.lock:
            if demo.state_error:
                raise HTTPException(
                    503,
                    "Saved state is unreadable; use Reset demo to restore it.",
                )
            updated = {
                **demo.overrides,
                demo.key(target_date): {
                    "profile_id": demo.profile,
                    "date": target_date,
                    "stress": item.stress,
                    "context_tags": tags,
                    "submitted_at": datetime.now(timezone.utc).isoformat(),
                },
            }
            try:
                demo.persist(updated)
            except OSError:
                raise HTTPException(503, "Could not save check-in")

        return {"saved": True, "record": demo.response(date=target_date)}

    @app.post("/demo/reset")
    def reset():
        with demo.lock:
            try:
                demo.persist({})
            except OSError:
                raise HTTPException(503, "Could not reset demo")
        return {
            "reset": True,
            "default_date": demo.metadata.get("default_date", "2025-04-21"),
        }

    @app.get("/profiles/{user_id}/today")
    def profile_today(user_id: str, date: Optional[str] = None):
        return demo.response(date=date)

    @app.get("/profiles/{user_id}/timeline")
    def profile_timeline(user_id: str):
        return trends()

    return app


app = create_app()