"""A rough guess of how stressed a person would be today, from their own past days.

It is worked out fresh each time from one person's own history, so nothing is stored and nothing
is shared between people. The guess starts from their usual level (leaning on the starting answer
at first) and adjusts for how today's sleep, steps and heart rate differ from their own past days.
The adjustment is a small ridge regression done by hand with numpy, like _fit in user_model.py.
"""
import numpy as np

INPUTS = ("sleep_hours", "steps", "heart_rate", "sleep_quality", "activity")
ALPHA = 10.0
PRIOR_WEIGHT = 3  # the starting answer counts as this many past days

SLEEP_HOURS_MIDPOINT = {"under_5": 4.5, "5_6": 5.5, "6_7": 6.5, "7_8": 7.5, "8_9": 8.5, "over_9": 9.5}
SLEEP_QUALITY = {"poor": 0, "fair": 1, "good": 2, "great": 3}
ACTIVITY = {"mostly_sitting": 0, "lightly_active": 1, "moderately_active": 2, "very_active": 3}


def day_inputs(measurement=None, checkin=None):
    """One day's inputs, built the same way for every day. A missing input is None.

    `measurement` has sleep_minutes, steps and heart_rate_avg; `checkin` has sleep_hours,
    sleep_quality and activity (the by-hand answers). Either can be None.
    """
    def get(obj, name):
        return getattr(obj, name, None) if obj is not None else None

    minutes = get(measurement, "sleep_minutes")
    sleep = minutes / 60 if minutes is not None else SLEEP_HOURS_MIDPOINT.get(get(checkin, "sleep_hours"))
    return {
        "sleep_hours": sleep,
        "steps": get(measurement, "steps"),
        "heart_rate": get(measurement, "heart_rate_avg"),
        "sleep_quality": SLEEP_QUALITY.get(get(checkin, "sleep_quality")),
        "activity": ACTIVITY.get(get(checkin, "activity")),
    }


def expected_stress(history, today_inputs, prior):
    """Guess today's stress (0-10). Returns {"value", "inputs", "days_used"} or None if no basis."""
    n = len(history)
    stress = np.array([float(day["stress"]) for day in history])
    if n and prior is not None:
        intercept = (stress.sum() + PRIOR_WEIGHT * float(prior)) / (n + PRIOR_WEIGHT)
    elif n:
        intercept = float(stress.mean())
    elif prior is not None:
        intercept = float(prior)
    else:
        return None

    value = intercept
    used = []
    if n >= 2:
        usable = []
        for name in INPUTS:
            seen = [float(day[name]) for day in history if day.get(name) is not None]
            if len(seen) >= 2 and len(set(seen)) > 1:
                usable.append(name)
        if usable:
            X = np.array(
                [[np.nan if day.get(name) is None else float(day[name]) for name in usable] for day in history]
            )
            medians = np.nanmedian(X, axis=0)
            X = np.where(np.isnan(X), medians, X)
            means = X.mean(axis=0)
            scales = X.std(axis=0)
            scales = np.where(scales == 0, 1.0, scales)
            Z = (X - means) / scales
            coefs = np.linalg.solve(Z.T @ Z + ALPHA * np.eye(len(usable)), Z.T @ (stress - stress.mean()))
            for name, mean, scale, coef in zip(usable, means, scales, coefs):
                today = today_inputs.get(name)
                if today is None or coef == 0:
                    continue  # a missing value adds nothing
                value += float(coef) * (float(today) - mean) / scale
                used.append(name)

    return {"value": round(float(np.clip(value, 0, 10)), 1), "inputs": used, "days_used": n}
