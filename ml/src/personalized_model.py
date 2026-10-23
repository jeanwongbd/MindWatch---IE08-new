from pathlib import Path
import joblib
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.pipeline import make_pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import Ridge

FEATURES = [
    "avg_rmssd",
    "overall_score",
    "daily_steps",
    "avg_rmssd_dev",
]
RAW_FEATURES = FEATURES[:3]
TARGET = "stress"
ALPHA = 100
MIN_SAMPLES = 30
RECOMMENDED_SAMPLES = 60
MIN_HRV_HISTORY = 7


def _template():
    return make_pipeline(
        SimpleImputer(strategy="median"),
        StandardScaler(),
        Ridge(alpha=ALPHA),
    )


def _prepare_history(history):
    data = pd.DataFrame(history).copy()
    required = ["date"] + RAW_FEATURES
    missing = [c for c in required if c not in data.columns]
    if missing:
        raise ValueError(f"Missing columns: {missing}")
    data["date"] = pd.to_datetime(
        data["date"], errors="coerce"
    ).dt.normalize()
    for col in RAW_FEATURES:
        data[col] = pd.to_numeric(data[col], errors="coerce")
    data = data.dropna(subset=["date"])
    data = data.sort_values("date")
    data = data.drop_duplicates("date", keep="last")
    return data.reset_index(drop=True)


def calibration_status(history):
    data = _prepare_history(history)
    if TARGET not in data.columns:
        raise ValueError("Missing stress training labels")
    data[TARGET] = pd.to_numeric(
        data[TARGET], errors="coerce"
    )
    valid = (
        data[TARGET].between(0, 100)
        & data[RAW_FEATURES].notna().any(axis=1)
    )
    count = int(valid.sum())
    if count < MIN_SAMPLES:
        status = "collecting"
    elif count < RECOMMENDED_SAMPLES:
        status = "initial_ready"
    else:
        status = "recommended_ready"
    return {
        "status": status,
        "valid_samples": count,
        "can_train": count >= MIN_SAMPLES,
        "remaining_to_60": max(0, RECOMMENDED_SAMPLES - count),
    }


def train_personalized_model(history, template=None):
    status = calibration_status(history)
    if not status["can_train"]:
        raise ValueError(
            f"Need at least {MIN_SAMPLES} valid records; "
            f"found {status['valid_samples']}"
        )
    data = _prepare_history(history)
    data[TARGET] = pd.to_numeric(
        data[TARGET], errors="coerce"
    )
    # Physiological history only; never uses stress labels.
    past_hrv = (
        data["avg_rmssd"]
        .shift(1)
        .expanding(min_periods=MIN_HRV_HISTORY)
        .mean()
    )
    data["avg_rmssd_dev"] = data["avg_rmssd"] - past_hrv
    valid = (
        data[TARGET].between(0, 100)
        & data[RAW_FEATURES].notna().any(axis=1)
    )
    fit_data = data.loc[valid].copy()
    X = fit_data[FEATURES]
    y = fit_data[TARGET]
    
    # All four model features must have some observed values
    missing = [c for c in FEATURES if X[c].notna().sum() == 0]
    if missing:
        raise ValueError(f"No valid observations for: {missing}")
    model = clone(template) if template is not None else _template()
    model.fit(X, y)
    return {
        "model": model,
        "features": FEATURES.copy(),
        "training_samples": len(fit_data),
        "calibration_status": status["status"],
        "last_calibration_date": data["date"].max().isoformat(),
        "target_variation": float(y.std(ddof=0)),
    }


def estimate_stress(
    trained_user,
    avg_rmssd,
    overall_score,
    daily_steps,
    hrv_history,
):
    history = pd.to_numeric(
        pd.Series(list(hrv_history), dtype="object"),
        errors="coerce",
    )
    current_hrv = pd.to_numeric(
        pd.Series([avg_rmssd]), errors="coerce"
    ).iloc[0]
    if history.notna().sum() >= MIN_HRV_HISTORY and pd.notna(current_hrv):
        deviation = float(current_hrv - history.mean())
    else:
        deviation = np.nan
    X_today = pd.DataFrame([{
        "avg_rmssd": avg_rmssd,
        "overall_score": overall_score,
        "daily_steps": daily_steps,
        "avg_rmssd_dev": deviation,
    }])
    for col in FEATURES:
        X_today[col] = pd.to_numeric(
            X_today[col], errors="coerce"
        )
    if X_today[RAW_FEATURES].notna().sum(axis=1).iloc[0] == 0:
        raise ValueError("No physiological measurements provided")
    X_today = X_today[trained_user["features"]]
    estimate = trained_user["model"].predict(X_today)[0]
    return float(np.clip(estimate, 0, 100))


def save_personal_model(trained_user, path):
    """Persist an already-calibrated user's model."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(trained_user, path)


def load_personal_model(path):
    return joblib.load(path)


def load_shared_template(path):
    package = joblib.load(path)
    return package["model_template"]