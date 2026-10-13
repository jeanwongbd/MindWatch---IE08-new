from pathlib import Path
from typing import (
    List,
    Optional,
)  # blocks data value that dont meet requirement. If frontend forget to send, we use the default value.

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
# Load Pre-trained Machine Learning Models (V1 Fallback & V2 Template)
# ---------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
V1_MODEL_PATH = BASE_DIR / "models" / "stress_monitoring_multimodal_v1.joblib"
V2_MODEL_PATH = BASE_DIR / "models" / "mindwatch_v2.joblib"

# Load fallback model
v1_model = joblib.load(V1_MODEL_PATH) if V1_MODEL_PATH.exists() else None

# Load V2 package/template
v2_package = None
if V2_MODEL_PATH.exists():
  try:
    loaded = joblib.load(V2_MODEL_PATH)
    v2_package = (
        loaded.get("model_template", loaded)
        if isinstance(loaded, dict)
        else loaded
    )
  except Exception as e:
    print(f"Warning loading V2 model: {e}")

app = FastAPI(
    title="MindWatch API",
    description=(
        "Backend service for physiological load and stress mismatch"
        " monitoring."
    ),
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage for user data
latest_checkins = {}
latest_wearables = {}
user_hrv_history = {}  # Tracks past HRV values per user for baseline deviation


class CheckInRequest(BaseModel):  # blueprint of frontend response
  user_id: str
  stress: int = Field(
      ..., ge=0, le=10, description="Self-reported stress 0-10"
  )
  context: List[str] = []
  notes: Optional[str] = None


class WearableSyncPayload(BaseModel):  # incoming sync from phone's Health Connect
  daily_steps: Optional[float] = None
  overall_score: Optional[float] = None  # Fitbit sleep score
  deep_sleep_in_minutes: Optional[float] = None
  avg_rmssd: Optional[float] = None  # Nocturnal HRV (rMSSD)
  participant_historical_mean: Optional[float] = 50.0


def calculate_v2_load(
    user_id: str,
    avg_rmssd: Optional[float],
    overall_score: Optional[float],
    daily_steps: Optional[float],
) -> float:
  """Calculates physiological load using V2 HRV deviation logic."""
  history = user_hrv_history.get(user_id, [])

  # Compute deviation from individual baseline if history exists
  if len(history) >= 7 and avg_rmssd is not None:
    hrv_deviation = float(avg_rmssd - np.mean(history))
  else:
    hrv_deviation = np.nan

  # Feature dataframe matching Yifan's V2 specification
  X_today = pd.DataFrame([{
      "avg_rmssd": avg_rmssd,
      "overall_score": overall_score,
      "daily_steps": daily_steps,
      "avg_rmssd_dev": hrv_deviation,
  }])

  # If V2 pipeline is available, run inference
  if v2_package is not None and hasattr(v2_package, "predict"):
    try:
      pred = v2_package.predict(X_today)[0]
      return float(np.clip(pred, 0, 100))
    except Exception:
      pass

  # Fallback: estimate from V1 model if V2 is untrained for single user
  if v1_model is not None:
    X_v1 = pd.DataFrame([{
        "participant_historical_mean": 50.0,
        "daily_steps": daily_steps,
        "overall_score": overall_score,
        "deep_sleep_in_minutes": 60.0,
        "avg_rmssd": avg_rmssd,
    }]).replace({None: np.nan})
    pred = v1_model.predict(X_v1)[0]
    return float(np.clip(pred, 0, 100))

  return 50.0


def classify_mismatch(physio_load: int, reported_stress: int):
  # standard thresholds: Physio (0-100, threshold 50), Reported (0-10, threshold 5)
  is_high_physio = physio_load >= 50
  is_high_stress = reported_stress >= 5

  if not is_high_physio and not is_high_stress:
    return {
        "state": "balanced",
        "label": "Balanced",
        "description": (
            "Your body biometrics and stress check-in are both at calm, normal"
            " levels."
        ),
    }
  elif is_high_physio and is_high_stress:
    return {
        "state": "aligned_high_load",
        "label": "Aligned High Load",
        "description": (
            "Both your body signals and your self-report indicate elevated"
            " strain."
        ),
    }
  elif is_high_physio and not is_high_stress:
    return {
        "state": "high_body_low_perceived",
        "label": "Body Under Load",
        "description": (
            "Your body appears less recovered than usual, although you feel"
            " relatively calm."
        ),
    }
  else:
    return {
        "state": "low_body_high_perceived",
        "label": "Perceived Stress Mismatch",
        "description": (
            "You reported feeling stressed, but your physical recovery signals"
            " remain stable."
        ),
    }


@app.get("/health")  # to check if backend running
def health_check():
  return {"status": "online", "version": "2.0.0"}


@app.post("/profiles/{user_id}/sync")
def sync_wearable(user_id: str, payload: WearableSyncPayload):
  # 1. Update rolling HRV history for the user
  if payload.avg_rmssd is not None:
    if user_id not in user_hrv_history:
      user_hrv_history[user_id] = []
    user_hrv_history[user_id].append(payload.avg_rmssd)

  # 2. Run inference using V2 personalized pipeline
  calculated_load = calculate_v2_load(
      user_id=user_id,
      avg_rmssd=payload.avg_rmssd,
      overall_score=payload.overall_score,
      daily_steps=payload.daily_steps,
  )

  # 3. Store the latest calculation for this profile
  latest_wearables[user_id] = {
      "physiological_load": round(calculated_load),
      "raw_metrics": payload.model_dump(),
      "calibration_status": (
          "active"
          if len(user_hrv_history.get(user_id, [])) >= 7
          else "warming_up"
      ),
  }

  return {
      "success": True,
      "user_id": user_id,
      "physiological_load": round(calculated_load),
      "calibration_status": latest_wearables[user_id]["calibration_status"],
      "message": "Wearable biometrics synced and processed via V2 model",
  }


@app.get("/profiles/{user_id}/today")
def get_today_profile(
    user_id: str,
    mock_physio: int = Query(
        72, ge=0, le=100, description="Test value for physiological load"
    ),
    mock_stress: int = Query(
        3, ge=0, le=10, description="Default value if no check-in logged"
    ),
):
  active_physio = latest_wearables.get(user_id, {}).get(
      "physiological_load", mock_physio
  )
  active_stress = latest_checkins.get(user_id, {}).get("stress", mock_stress)

  mismatch_result = classify_mismatch(
      physio_load=active_physio, reported_stress=active_stress
  )
  physio_category = "high" if active_physio >= 50 else "low"

  return {
      "user_id": user_id,
      "date": "2026-08-25",
      "reported_stress": {"value": active_stress, "scale_max": 10},
      "physiological_load": {
          "value": active_physio,
          "category": physio_category,
      },
      "mismatch": mismatch_result,
      "confidence": {"level": "moderate"},
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
          {
              "date": "2026-08-21",
              "physiological_load": 40,
              "reported_stress": 4,
          },
          {
              "date": "2026-08-22",
              "physiological_load": 55,
              "reported_stress": 5,
          },
          {
              "date": "2026-08-23",
              "physiological_load": 80,
              "reported_stress": 3,
          },
          {
              "date": "2026-08-24",
              "physiological_load": 65,
              "reported_stress": 7,
          },
          {
              "date": "2026-08-25",
              "physiological_load": 72,
              "reported_stress": 3,
          },
      ],
  }


@app.post("/checkins")
def submit_checkin(payload: CheckInRequest):
  latest_checkins[payload.user_id] = payload.model_dump()
  return {
      "success": True,
      "message": "Check-in successfully recorded",
      "data": payload,
  }