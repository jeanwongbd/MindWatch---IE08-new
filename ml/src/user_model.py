"""Per-user stress model, trained from one person's own check-ins and watch data.

The model is a ridge regression done by hand with numpy, so everything it learns is a handful of
plain numbers that can sit in a database row. Nothing is pickled or loaded from a file.

The rule for showing an estimate is the one tested in ml/src/backtest.py: hold back the last
HOLD_BACK check-ins, train on the rest, and call the model ready only if it beats the average of
the previous BASELINE_DAYS check-ins on those held-back days by at least MARGIN. Stress here is the
app's 0-10 scale, so MARGIN is the back-test's 4 points out of 100 divided by 10.
"""
import numpy as np

FEATURES = ("steps", "sleep_minutes", "heart_rate_avg")
FIRST_TRAINING = 30
RETRAIN_EVERY = 7
HOLD_BACK = 10
BASELINE_DAYS = 7
MARGIN = 0.4
MIN_TRAIN_ROWS = 10
MIN_HOLD_ROWS = 5
ALPHA = 100.0


def due_for_training(checkin_count):
    """Train at 30 check-ins, then after every 7 more (37, 44, ...)."""
    return checkin_count >= FIRST_TRAINING and (checkin_count - FIRST_TRAINING) % RETRAIN_EVERY == 0


def _matrix(rows):
    return np.array(
        [[np.nan if row.get(name) is None else float(row[name]) for name in FEATURES] for row in rows],
        dtype=float,
    ).reshape(len(rows), len(FEATURES))


def _usable(rows):
    """Rows the app could estimate for: at least one watch reading."""
    return [row for row in rows if any(row.get(name) is not None for name in FEATURES)]


def _fit(rows):
    """Median-fill, standardise and fit ridge. Returns plain numbers, or None if it cannot."""
    X = _matrix(rows)
    y = np.array([float(row["stress"]) for row in rows])
    if len(rows) < MIN_TRAIN_ROWS or np.isnan(X).all(axis=0).any():
        return None
    medians = np.nanmedian(X, axis=0)
    X = np.where(np.isnan(X), medians, X)
    means = X.mean(axis=0)
    scales = X.std(axis=0)
    scales = np.where(scales == 0, 1.0, scales)
    Z = (X - means) / scales
    intercept = float(y.mean())
    coefs = np.linalg.solve(Z.T @ Z + ALPHA * np.eye(Z.shape[1]), Z.T @ (y - intercept))
    return {
        "features": list(FEATURES),
        "medians": medians.tolist(),
        "means": means.tolist(),
        "scales": scales.tolist(),
        "coefs": coefs.tolist(),
        "intercept": intercept,
    }


def predict(params, row):
    """Estimate for one day (0-10), from the stored numbers. Needs at least one reading."""
    x = _matrix([row])[0]
    if np.isnan(x).all():
        raise ValueError("No measurements for this day")
    x = np.where(np.isnan(x), np.array(params["medians"]), x)
    z = (x - np.array(params["means"])) / np.array(params["scales"])
    return float(np.clip(params["intercept"] + z @ np.array(params["coefs"]), 0, 10))


def _baselines(rows):
    """For each day, the mean stress of the previous BASELINE_DAYS check-ins (None for the first)."""
    out = []
    for i in range(len(rows)):
        previous = [row["stress"] for row in rows[max(0, i - BASELINE_DAYS):i]]
        out.append(sum(previous) / len(previous) if previous else None)
    return out


def train(rows):
    """Decide whether this person's model is ready, using only their own rows.

    `rows` are dicts with date, stress (0-10) and the FEATURES (None when missing). Returns a dict
    with `status` ("ready" or "not_ready"), a plain-words `reason`, the held-back errors and, only
    when ready, the model `params`.
    """
    rows = sorted(rows, key=lambda row: row["date"])
    if len(rows) < FIRST_TRAINING:
        return {"status": "not_ready", "reason": "too_few_checkins", "params": None}
    baselines = _baselines(rows)
    for row, baseline in zip(rows, baselines):
        row["_baseline"] = baseline
    train_rows = _usable(rows[:-HOLD_BACK])
    hold_rows = [row for row in _usable(rows[-HOLD_BACK:]) if row["_baseline"] is not None]
    params = _fit(train_rows)
    if params is None or len(hold_rows) < MIN_HOLD_ROWS:
        return {"status": "not_ready", "reason": "not_enough_watch_data", "params": None}
    actual = np.array([row["stress"] for row in hold_rows], dtype=float)
    guesses = np.array([predict(params, row) for row in hold_rows])
    baseline = np.array([row["_baseline"] for row in hold_rows], dtype=float)
    model_error = float(np.mean(np.abs(guesses - actual)))
    average_error = float(np.mean(np.abs(baseline - actual)))
    result = {
        "holdout_days": len(hold_rows),
        "model_error": model_error,
        "average_error": average_error,
    }
    if average_error - model_error < MARGIN:
        return {"status": "not_ready", "reason": "no_reliable_pattern", "params": None, **result}
    # It passed on held-back days, so refit on every usable day to use in the app.
    final = _fit(_usable(rows))
    if final is None:
        return {"status": "not_ready", "reason": "not_enough_watch_data", "params": None, **result}
    return {"status": "ready", "reason": "beats_recent_average", "params": final, **result}
