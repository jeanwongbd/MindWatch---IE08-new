import unittest

import numpy as np
import pandas as pd

from ml.src import backtest


def person(days, stress=None, steps=None, hrv=None, sleep=None):
    rng = np.random.default_rng(0)
    return pd.DataFrame({
        "date": pd.date_range("2025-01-01", periods=days),
        "stress": stress if stress is not None else rng.integers(0, 60, days),
        "avg_rmssd": hrv if hrv is not None else rng.normal(60, 5, days),
        "overall_score": sleep if sleep is not None else rng.normal(80, 5, days),
        "daily_steps": steps if steps is not None else rng.normal(5000, 500, days),
    })


class BacktestTests(unittest.TestCase):
    def test_too_few_checkins_is_skipped(self):
        self.assertEqual(
            backtest.evaluate(person(29))["outcome"], "too_few_checkins"
        )

    def test_baseline_uses_only_earlier_days(self):
        stress = [10.0] * 7 + [90.0]
        data = backtest.prepare(person(8, stress=stress))
        self.assertTrue(np.isnan(data["baseline"].iloc[0]))
        self.assertEqual(data["baseline"].iloc[7], 10.0)
        self.assertEqual(data["baseline"].iloc[1], 10.0)

    def test_no_watch_data_means_no_decision(self):
        data = person(60)
        data[["avg_rmssd", "overall_score", "daily_steps"]] = np.nan
        self.assertEqual(backtest.evaluate(data)["outcome"], "no_decision")

    def test_strong_signal_unlocks_and_grades_well(self):
        # Stress is a clean function of steps, so the model should win.
        steps = np.tile([1000.0, 9000.0], 40)
        stress = steps / 100.0
        result = backtest.evaluate(person(80, stress=stress, steps=steps))
        self.assertEqual(result["outcome"], "unlocked")
        self.assertTrue(result["graded"])
        self.assertGreater(result["later_gain"], 0)

    def test_noise_does_not_unlock_at_a_huge_margin(self):
        result = backtest.evaluate(person(80), margin=1000)
        self.assertEqual(result["outcome"], "locked")

    def test_too_few_later_days_is_not_graded(self):
        steps = np.tile([1000.0, 9000.0], 20)[:35]
        result = backtest.evaluate(
            person(35, stress=steps / 100.0, steps=steps)
        )
        self.assertFalse(result["graded"])

    def test_summary_counts_wrong_calls(self):
        results = pd.DataFrame([
            {"participant": 1, "outcome": "unlocked", "graded": True,
             "later_gain": -2.0},
            {"participant": 2, "outcome": "unlocked", "graded": True,
             "later_gain": 3.0},
            {"participant": 3, "outcome": "locked", "graded": True,
             "later_gain": 1.0},
            {"participant": 4, "outcome": "too_few_checkins"},
        ])
        s = backtest.summarise(results)
        self.assertEqual(s["wrong_calls"], 1)
        self.assertEqual(s["missed"], 1)
        self.assertEqual(s["eligible"], 3)

    def test_report_is_repeatable(self):
        self.assertEqual(
            backtest.report(backtest.run()), backtest.report(backtest.run())
        )


if __name__ == "__main__":
    unittest.main()
