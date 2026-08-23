from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import pandas as pd
import io

app = FastAPI(
    title="MindWatch API",
    description="Backend service for wearable physiological load and stress mismatch monitoring.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CheckInRequest(BaseModel):
    user_id: str
    perceived_stress: int  # 0 to 10
    tags: List[str]
    notes: Optional[str] = None

@app.get("/")
def read_root():
    return {"status": "online", "system": "MindWatch Backend API"}

@app.post("/api/data/check-in")
def submit_check_in(checkin: CheckInRequest):
    return {
        "status": "success",
        "message": "Check-in recorded",
        "data": checkin
    }

@app.post("/api/data/upload-wearable")
async def upload_wearable_csv(file: UploadFile = File(...)):
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV format.")
    
    contents = await file.read()
    df = pd.read_csv(io.StringIO(contents.decode('utf-8')))
    
    return {
        "status": "success",
        "filename": file.filename,
        "rows_processed": len(df),
        "columns_found": list(df.columns)
    }

@app.get("/api/dashboard/mismatch-matrix/{user_id}")
def get_mismatch_status(user_id: str):
    return {
        "user_id": user_id,
        "quadrant": "Psychological Pressure",
        "physiological_load": "Low",
        "perceived_stress": "High",
        "baseline_z_score_hrv": -0.15,
        "contributing_factors": ["Exam deadline tagged", "Sedentary posture detected"]
    }