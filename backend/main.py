from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field #BaseModel blocks wrong data type input by frontend
from typing import List, Optional #blocks data value that dont meet requirement. If frontend forget to send, we use the default value.

app = FastAPI( #creates fastapi instance
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

class CheckInRequest(BaseModel): #blueprint of frontend response
    user_id: str
    stress: int = Field(..., ge=0, le=10, description="Self-reported stress 0-10")
    context: List[str] = []
    notes: Optional[str] = None

@app.get("/health") #to check if backend running
def health_check():
    return {"status": "online", "version": "1.0.0"}

@app.get("/profiles/{user_id}/today")
def get_today_profile(user_id: str):
    return {
        "user_id": user_id,
        "date": "2026-08-25",
        "reported_stress": {
            "value": 3,
            "scale_max": 10
        },
        "physiological_load": {
            "value": 72,
            "category": "high"
        },
        "mismatch": {
            "state": "high_body_low_perceived",
            "label": "Body under load"
        },
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
def get_timeline(user_id: str, month: Optional[str] = None, year: Optional[str] = None):
    
    all_data = [
        {"date": "2026-07-15", "physiological_load": 30, "reported_stress": 2}, # July
        {"date": "2026-08-21", "physiological_load": 40, "reported_stress": 4}, # August
        {"date": "2026-08-22", "physiological_load": 55, "reported_stress": 5}, # August
        {"date": "2026-08-23", "physiological_load": 80, "reported_stress": 3}, # August
    ]
    
    filtered_data = all_data
    
    if year and month:
        target_prefix = f"{year}-{month}" 
        filtered_data = [d for d in all_data if d["date"].startswith(target_prefix)]
        
    return {
        "user_id": user_id,
        "timeline": filtered_data
    }

@app.post("/checkins")
def submit_checkin(payload: CheckInRequest):
    return {
        "success": True,
        "message": "Check-in successfully recorded",
        "data": payload
    }