from pathlib import Path

import joblib
import numpy as np
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent.parent

MODEL_PATH = (
    PROJECT_ROOT
    / "models"
    / "stress_predictor_multimodal_v1.joblib"
)

model = joblib.load(MODEL_PATH)

def predict_next_day_stress(
    current_stress,
    participant_historical_mean,
    daily_steps=None,
    overall_score=None,
    deep_sleep_in_minutes=None,
    avg_rmssd=None
):
    input_data = pd.DataFrame({
        "current_stress": [current_stress],
        "participant_historical_mean": [
            participant_historical_mean
        ],
        "daily_steps": [daily_steps],
        "overall_score": [overall_score],
        "deep_sleep_in_minutes": [
            deep_sleep_in_minutes
        ],
        "avg_rmssd": [avg_rmssd]
    })

    input_data = input_data.replace({None: np.nan})

    prediction = model.predict(input_data)[0]

    prediction = np.clip(prediction, 0, 100)

    return float(prediction)

def predict_from_user_history(
    current_stress,
    stress_history,
    daily_steps=None,
    overall_score=None,
    deep_sleep_in_minutes=None,
    avg_rmssd=None
):
    if stress_history:
        participant_historical_mean = float(
            np.mean(stress_history)
        )
    else:
        participant_historical_mean = None

    return predict_next_day_stress(
        current_stress=current_stress,
        participant_historical_mean=participant_historical_mean,
        daily_steps=daily_steps,
        overall_score=overall_score,
        deep_sleep_in_minutes=deep_sleep_in_minutes,
        avg_rmssd=avg_rmssd
    )