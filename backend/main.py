from pathlib import Path
from typing import List, Optional  # blocks data value that dont meet requirement. If frontend forget to send, we use the default value.

from fastapi import (  # Query allows backend to read, double-check, and use the extra filter settings (?month=08)
    FastAPI,
    Query,
)
from fastapi.middleware.cors import CORSMiddleware
import joblib
import numpy as np
import pandas as pd
from pydantic import (  # BaseModel blocks wrong data type input by frontend
    BaseModel,
    Field,
)

# ---------------------------------------------------------
# Load Yifan's Pre-trained Machine Learning Models
# ---------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
MONITOR_MODEL_PATH = BASE_DIR / "models" / "stress_monitoring_multimodal_v1.joblib"
PREDICTOR_MODEL_PATH = BASE_DIR / "models" / "stress_predictor_multimodal_v1.joblib"

# Load models safely into memory at backend startup
monitor_model = joblib.load(MONITOR_MODEL_PATH)
predictor_model = joblib.load(PREDICTOR_MODEL_PATH)


def estimate_current_stress(
    participant_historical_mean: Optional[float] = 50.0,
    daily_steps: Optional[float] = None,
    overall_score: Optional[float] = None,
    deep_sleep_in_minutes: Optional[float] = None,
    avg_rmssd: Optional[float] = None,
) -> float:
    input_data = pd.DataFrame({
        "participant_historical_mean": [participant_historical_mean],
        "daily_steps": [daily_steps],
        "overall_score": [overall_score],
        "deep_sleep_in_minutes": [deep_sleep_in_minutes],
        "avg_rmssd": [avg_rmssd],
    })

    input_data = input_data.replace({None: np.nan})
    estimation = monitor_model.predict(input_data)[0]
    estimation = np.clip(estimation, 0, 100)
    return float(estimation)


app = FastAPI(
    title="MindWatch API",
    description="Backend service for physiological load and stress mismatch monitoring.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory dictionary to hold submitted user check-ins
latest_checkins = {}

# In-memory dictionary to hold real-time wearable readings per user
latest_wearables = {}


class CheckInRequest(BaseModel):  # blueprint of frontend response
    user_id: str
    stress: int = Field(..., ge=0, le=10, description="Self-reported stress 0-10")
    context: List[str] = []
    notes: Optional[str] = None


class WearableSyncPayload(BaseModel):  # incoming sync from phone's Health Connect
    participant_historical_mean: Optional[float] = 50.0
    daily_steps: Optional[float] = None
    overall_score: Optional[float] = None  # Fitbit sleep score
    deep_sleep_in_minutes: Optional[float] = None
    avg_rmssd: Optional[float] = None  # Nocturnal HRV (rMSSD)


def classify_mismatch(physio_load: int, reported_stress: int):
    # standard thresholds: Physio (0-100, threshold 50), Reported (0-10, threshold 5)
    is_high_physio = physio_load >= 50
    is_high_stress = reported_stress >= 5

    if not is_high_physio and not is_high_stress:
        return {
            "state": "balanced",
            "label": "Balanced",
            "description": "Your body biometrics and stress check-in are both at calm, normal levels.",
        }
    elif is_high_physio and is_high_stress:
        return {
            "state": "aligned_high_load",
            "label": "Aligned High Load",
            "description": "Both your body signals and your self-report indicate elevated strain.",
        }
    elif is_high_physio and not is_high_stress:
        return {
            "state": "high_body_low_perceived",
            "label": "Body Under Load",
            "description": "Your body appears less recovered than usual, although you feel relatively calm.",
        }
    else:
        return {
            "state": "low_body_high_perceived",
            "label": "Perceived Stress Mismatch",
            "description": "You reported feeling stressed, but your physical recovery signals remain stable.",
        }


@app.get("/health")  # to check if backend running
def health_check():
    return {"status": "online", "version": "1.0.0"}


@app.post("/profiles/{user_id}/sync")
def sync_wearable(user_id: str, payload: WearableSyncPayload):
    # 1. Run inference through Yifan's trained pipeline
    calculated_load = estimate_current_stress(
        participant_historical_mean=payload.participant_historical_mean,
        daily_steps=payload.daily_steps,
        overall_score=payload.overall_score,
        deep_sleep_in_minutes=payload.deep_sleep_in_minutes,
        avg_rmssd=payload.avg_rmssd,
    )

    # 2. Store the latest calculation for this profile
    latest_wearables[user_id] = {
        "physiological_load": round(calculated_load),
        "raw_metrics": payload.model_dump(),
    }

    return {
        "success": True,
        "user_id": user_id,
        "physiological_load": round(calculated_load),
        "message": "Wearable biometrics synced and processed successfully",
    }


@app.get("/profiles/{user_id}/today")
def get_today_profile(
    user_id: str,
    mock_physio: int = Query(72, ge=0, le=100, description="Test value for physiological load"),
    mock_stress: int = Query(3, ge=0, le=10, description="Default value if no check-in logged"),
):
    # Use real ML physiological load if the user has synced wearable data; otherwise fall back to mock_physio
    active_physio = latest_wearables.get(user_id, {}).get("physiological_load", mock_physio)

    # Use the submitted stress if available for this user, otherwise use mock_stress
    active_stress = latest_checkins.get(user_id, {}).get("stress", mock_stress)

    mismatch_result = classify_mismatch(physio_load=active_physio, reported_stress=active_stress)
    physio_category = "high" if active_physio >= 50 else "low"

    return {
        "user_id": user_id,
        "date": "2026-08-25",
        "reported_stress": {
            "value": active_stress,
            "scale_max": 10,
        },
        "physiological_load": {
            "value": active_physio,
            "category": physio_category,
        },
        "mismatch": mismatch_result,
        "confidence": {
            "level": "moderate",
        },
        "contributors": [
            {
                "feature": "sleep",
                "direction": "negative",
                "description": "1.3 hours below your usual sleep",
            },
            {
                "feature": "hrv",
                "direction": "negative",
                "description": "14% below your usual HRV",
            },
        ],
    }


@app.get("/profiles/{user_id}/timeline")
def get_timeline(user_id: str):
    return {
        "user_id": user_id,
        "timeline": [
            {"date": "2026-08-21", "physiological_load": 40, "reported_stress": 4},
            {"date": "2026-08-22", "physiological_load": 55, "reported_stress": 5},
            {"date": "2026-08-23", "physiological_load": 80, "reported_stress": 3},
            {"date": "2026-08-24", "physiological_load": 65, "reported_stress": 7},
            {"date": "2026-08-25", "physiological_load": 72, "reported_stress": 3},
        ],
    }


@app.post("/checkins")
def submit_checkin(payload: CheckInRequest):
    # Save the submitted check-in to memory using model_dump() (or .dict())
    latest_checkins[payload.user_id] = payload.model_dump()
    return {
        "success": True,
        "message": "Check-in successfully recorded",
        "data": payload,
    }