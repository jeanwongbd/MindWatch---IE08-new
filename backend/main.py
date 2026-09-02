from fastapi import FastAPI, Query #Query allows backend to read, double-check, and use the extra filter settings (?month=08)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field #BaseModel blocks wrong data type input by frontend
from typing import List, Optional #blocks data value that dont meet requirement. If frontend forget to send, we use the default value.

app = FastAPI(
    title="MindWatch API",
    description="Backend service for physiological load and stress mismatch monitoring.",
    version="1.0.0"
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

class CheckInRequest(BaseModel): #blueprint of frontend response
    user_id: str
    stress: int = Field(..., ge=0, le=10, description="Self-reported stress 0-10")
    context: List[str] = []
    notes: Optional[str] = None


def classify_mismatch(physio_load: int, reported_stress: int):
    # standard thresholds: Physio (0-100, threshold 50), Reported (0-10, threshold 5)
    is_high_physio = physio_load >= 50
    is_high_stress = reported_stress >= 5

    if not is_high_physio and not is_high_stress:
        return {
            "state": "balanced",
            "label": "Balanced",
            "description": "Your body biometrics and stress check-in are both at calm, normal levels."
        }
    elif is_high_physio and is_high_stress:
        return {
            "state": "aligned_high_load",
            "label": "Aligned High Load",
            "description": "Both your body signals and your self-report indicate elevated strain."
        }
    elif is_high_physio and not is_high_stress:
        return {
            "state": "high_body_low_perceived",
            "label": "Body Under Load",
            "description": "Your body appears less recovered than usual, although you feel relatively calm."
        }
    else:
        return {
            "state": "low_body_high_perceived",
            "label": "Perceived Stress Mismatch",
            "description": "You reported feeling stressed, but your physical recovery signals remain stable."
        }


@app.get("/health") #to check if backend running
def health_check():
    return {"status": "online", "version": "1.0.0"}


@app.get("/profiles/{user_id}/today")
def get_today_profile(
    user_id: str,
    mock_physio: int = Query(72, ge=0, le=100, description="Test value for physiological load"),
    mock_stress: int = Query(3, ge=0, le=10, description="Default value if no check-in logged")
):
    # Use the submitted stress if available for this user, otherwise use mock_stress
    active_stress = latest_checkins.get(user_id, {}).get("stress", mock_stress)

    mismatch_result = classify_mismatch(physio_load=mock_physio, reported_stress=active_stress)
    physio_category = "high" if mock_physio >= 50 else "low"

    return {
        "user_id": user_id,
        "date": "2026-08-25",
        "reported_stress": {
            "value": active_stress,
            "scale_max": 10
        },
        "physiological_load": {
            "value": mock_physio,
            "category": physio_category
        },
        "mismatch": mismatch_result,
        "confidence": {
            "level": "moderate"
        },
        "contributors": [
            {
                "feature": "sleep",
                "direction": "negative",
                "description": "1.3 hours below your usual sleep"
            },
            {
                "feature": "hrv",
                "direction": "negative",
                "description": "14% below your usual HRV"
            }
        ]
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
            {"date": "2026-08-25", "physiological_load": 72, "reported_stress": 3}
        ]
    }


@app.post("/checkins")
def submit_checkin(payload: CheckInRequest):
    # Save the submitted check-in to memory using model_dump() (or .dict())
    latest_checkins[payload.user_id] = payload.model_dump()
    return {
        "success": True,
        "message": "Check-in successfully recorded",
        "data": payload
    }