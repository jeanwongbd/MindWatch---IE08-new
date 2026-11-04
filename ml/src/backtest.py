"""Back-test of the "show an estimate or not" rule on the study data.

Each study participant is treated as a MindWatch user:

1. Take their first 30 check-ins.
2. Decide using only those 30: train on the first 20, and unlock the
   estimate if the model beats the 7-day average by MARGIN points on the
   last 10 (the held-back days).
3. Grade the decision on the days after check-in 30, which the rule never
   saw: retrain on all 30 and compare with the 7-day average.

Stress is on the study's 0-100 scale. Run from the repo root:

    python -m ml.src.backtest
"""
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

from ml.src.personalized_model import (
    FEATURES,
    RAW_FEATURES,
    TARGET,
    _template,
)

DATA_PATH = (
    Path(__file__).resolve().parents[2]
    / "data"
    / "processed"
    / "daily_model_v2.csv"
)

CHECKINS = 30
HOLD_BACK = 10
MARGIN = 4.0
BASELINE_DAYS = 7
MIN_TRAIN_ROWS = 10
MIN_HOLD_ROWS = 5
MIN_LATER_ROWS = 14
SWEEP = [1.0, 2.0, 3.0, 4.0, 5.0]


def prepare(person):
    """Valid check-ins in date order, with the HRV-deviation feature."""
    data = person[["date", TARGET] + RAW_FEATURES].copy()
    data["date"] = pd.to_datetime(data["date"]).dt.normalize()
    for col in [TARGET] + RAW_FEATURES:
        data[col] = pd.to_numeric(data[col], errors="coerce")
    data = data[data[TARGET].between(0, 100)]
    data = data.sort_values("date").drop_duplicates("date", keep="last")
    data = data.reset_index(drop=True)
    past_hrv = (
        data["avg_rmssd"].shift(1).expanding(min_periods=7).mean()
    )
    data["avg_rmssd_dev"] = data["avg_rmssd"] - past_hrv
    # Mean of the previous BASELINE_DAYS check-ins; known before the day.
    data["baseline"] = (
        data[TARGET].shift(1).rolling(BASELINE_DAYS, min_periods=1).mean()
    )
    return data


def usable(rows):
    """Rows the app could actually estimate: some watch/step reading."""
    return rows[rows[RAW_FEATURES].notna().any(axis=1)]


def compare(train, test):
    """Mean errors of the model and the 7-day average on `test`.

    Returns None if there is nothing to fit or to score.
    """
    train, test = usable(train), usable(test)
    test = test.dropna(subset=["baseline"])
    if len(train) < MIN_TRAIN_ROWS or test.empty:
        return None
    if any(train[c].notna().sum() == 0 for c in RAW_FEATURES):
        return None  # the app refuses to train without all three
    model = _template()
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        model.fit(train[FEATURES], train[TARGET])
        guess = np.clip(model.predict(test[FEATURES]), 0, 100)
    return {
        "days": len(test),
        "model_error": float(np.mean(np.abs(guess - test[TARGET]))),
        "average_error": float(
            np.mean(np.abs(test["baseline"] - test[TARGET]))
        ),
    }


def evaluate(person, margin=MARGIN):
    data = prepare(person)
    if len(data) < CHECKINS:
        return {"outcome": "too_few_checkins", "checkins": len(data)}
    first = data.iloc[:CHECKINS]
    later = data.iloc[CHECKINS:]
    inner = compare(first.iloc[:-HOLD_BACK], first.iloc[-HOLD_BACK:])
    if inner is None or inner["days"] < MIN_HOLD_ROWS:
        return {"outcome": "no_decision", "checkins": len(data)}
    gain = inner["average_error"] - inner["model_error"]
    unlocked = gain >= margin
    result = {
        "outcome": "unlocked" if unlocked else "locked",
        "checkins": len(data),
        "decision_gain": gain,
    }
    final = compare(first, later)
    if final is None or final["days"] < MIN_LATER_ROWS:
        result["graded"] = False
        return result
    result["graded"] = True
    result["later_days"] = final["days"]
    result["later_gain"] = final["average_error"] - final["model_error"]
    return result


def run(path=DATA_PATH, margin=MARGIN):
    frame = pd.read_csv(path)
    rows = []
    for pid, person in frame.groupby("participant_id"):
        rows.append({"participant": int(pid), **evaluate(person, margin)})
    return pd.DataFrame(rows)


def summarise(results):
    eligible = results[results["outcome"] != "too_few_checkins"]
    unlocked = results[results["outcome"] == "unlocked"]
    graded_unlocked = unlocked[unlocked["graded"] == True]  # noqa: E712
    locked = results[results["outcome"] == "locked"]
    graded_locked = locked[locked["graded"] == True]  # noqa: E712
    wrong = graded_unlocked[graded_unlocked["later_gain"] <= 0]
    missed = graded_locked[graded_locked["later_gain"] > 0]
    return {
        "participants": len(results),
        "eligible": len(eligible),
        "unlocked": len(unlocked),
        "unlocked_graded": len(graded_unlocked),
        "unlocked_better": len(graded_unlocked) - len(wrong),
        "wrong_calls": len(wrong),
        "locked_graded": len(graded_locked),
        "missed": len(missed),
        "mean_later_gain_unlocked": (
            float(graded_unlocked["later_gain"].mean())
            if len(graded_unlocked) else None
        ),
    }


def report(results, margin=MARGIN):
    s = summarise(results)
    lines = [
        "MindWatch model-rule back-test (stress 0-100, error = mean "
        "absolute error)",
        f"Rule: unlock if model beats the {BASELINE_DAYS}-day average by "
        f">= {margin} points on the last {HOLD_BACK} of the first "
        f"{CHECKINS} check-ins.",
        "",
        "participant  outcome            decision_gain  later_days  "
        "later_gain",
    ]
    for _, r in results.iterrows():
        gain = r.get("decision_gain")
        later = r.get("later_gain")
        lines.append(
            f"{r['participant']:>11}  {r['outcome']:<17}  "
            f"{'' if pd.isna(gain) else format(gain, '+.2f'):>13}  "
            f"{'' if pd.isna(r.get('later_days')) else int(r['later_days']):>10}  "
            f"{'' if pd.isna(later) else format(later, '+.2f'):>10}"
        )
    lines += [
        "",
        f"Unlock rate: {s['unlocked']} of {s['eligible']} students with "
        f"{CHECKINS}+ check-ins ({s['participants']} in the data)",
        f"Unlocked and graded on later days: {s['unlocked_graded']}; "
        f"better than the 7-day average: {s['unlocked_better']}",
        f"Wrong calls (unlocked but not better later): {s['wrong_calls']}",
        f"Locked and graded: {s['locked_graded']}; would have been better "
        f"(missed): {s['missed']}",
    ]
    if s["mean_later_gain_unlocked"] is not None:
        lines.append(
            "Mean later gain of unlocked models: "
            f"{s['mean_later_gain_unlocked']:+.2f} points"
        )
    lines += ["", "Margin sweep (points)  unlocked  wrong_calls  missed"]
    sweep = []
    for m in SWEEP:
        t = summarise(run(margin=m))
        sweep.append(t)
        lines.append(
            f"{m:>21}  {t['unlocked']:>8}  {t['wrong_calls']:>11}  "
            f"{t['missed']:>6}"
        )
    unlocking = [t for t in sweep if t["unlocked"] > 0]
    if unlocking and all(t["wrong_calls"] == t["unlocked"] for t in unlocking):
        lines.append(
            "The rule could not tell better models from worse ones at any "
            "margin that unlocked anyone."
        )
    if s["unlocked"] == 0:
        lines.append("Result: no estimates unlocked, so no wrong calls")
    elif s["wrong_calls"] == 0:
        lines.append(
            f"Result: {s['unlocked']} unlocked, no wrong calls"
        )
    else:
        lines.append(
            "Result: FAIL - the rule lets misleading estimates through"
        )
    return "\n".join(lines)


if __name__ == "__main__":
    print(report(run()))
