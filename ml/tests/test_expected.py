import unittest
from types import SimpleNamespace

from ml.src.expected import day_inputs, expected_stress


def day(stress, **inputs):
    return {"stress": stress, **inputs}


def varied(n=10):
    """Days where more steps means more stress."""
    return [day(2 + (i % 5), steps=1000 * (i % 5), heart_rate=60 + (i % 3)) for i in range(n)]


class ExpectedStressTests(unittest.TestCase):
    def test_no_history_uses_starting_answer(self):
        r = expected_stress([], {"steps": 5000}, 4)
        self.assertEqual(r, {"value": 4.0, "inputs": [], "days_used": 0})

    def test_no_history_no_prior_is_none(self):
        self.assertIsNone(expected_stress([], {}, None))

    def test_prior_counts_as_three_days(self):
        r = expected_stress([day(2), day(2)], {}, 8)
        self.assertEqual(r["value"], round((4 + 24) / 5, 1))
        self.assertEqual(expected_stress([day(2), day(4)], {}, None)["value"], 3.0)

    def test_one_day_history_has_no_slopes(self):
        r = expected_stress([day(4, steps=1000)], {"steps": 99999}, 4)
        self.assertEqual(r, {"value": 4.0, "inputs": [], "days_used": 1})

    def test_uses_only_inputs_with_two_values(self):
        history = varied() + [day(5, sleep_quality=3)]
        r = expected_stress(history, {"steps": 4000, "sleep_quality": 0, "heart_rate": 62}, None)
        self.assertNotIn("sleep_quality", r["inputs"])
        self.assertIn("steps", r["inputs"])
        same = [day(i % 4 + 1, steps=500 + 0 * i) for i in range(6)]
        self.assertEqual(expected_stress(same, {"steps": 9000}, None)["inputs"], [])

    def test_watch_sleep_wins_over_answer(self):
        m = SimpleNamespace(sleep_minutes=360, steps=None, heart_rate_avg=None)
        c = SimpleNamespace(sleep_hours="8_9", sleep_quality=None, activity=None)
        self.assertEqual(day_inputs(m, c)["sleep_hours"], 6.0)
        self.assertEqual(day_inputs(None, c)["sleep_hours"], 8.5)
        self.assertIsNone(day_inputs(None, None)["sleep_hours"])

    def test_answers_map_to_numbers(self):
        hours = {"under_5": 4.5, "5_6": 5.5, "6_7": 6.5, "7_8": 7.5, "8_9": 8.5, "over_9": 9.5}
        for key, value in hours.items():
            self.assertEqual(day_inputs(None, SimpleNamespace(sleep_hours=key))["sleep_hours"], value)
        for i, key in enumerate(["poor", "fair", "good", "great"]):
            self.assertEqual(day_inputs(None, SimpleNamespace(sleep_quality=key))["sleep_quality"], i)
        for i, key in enumerate(["mostly_sitting", "lightly_active", "moderately_active", "very_active"]):
            self.assertEqual(day_inputs(None, SimpleNamespace(activity=key))["activity"], i)

    def test_missing_today_input_counts_as_median(self):
        base = expected_stress(varied(), {}, None)
        self.assertEqual(base["inputs"], [])
        self.assertEqual(base["value"], round(sum(d["stress"] for d in varied()) / 10, 1))
        only_steps = expected_stress(varied(), {"steps": 4000}, None)
        self.assertEqual(only_steps["inputs"], ["steps"])

    def test_inputs_follow_table_order_and_move_the_guess(self):
        low = expected_stress(varied(), {"steps": 0, "heart_rate": 60}, None)
        high = expected_stress(varied(), {"steps": 4000, "heart_rate": 62}, None)
        self.assertGreater(high["value"], low["value"])
        self.assertEqual(high["inputs"], ["steps", "heart_rate"])
        self.assertEqual(high["days_used"], 10)

    def test_clipped_to_0_10(self):
        history = [day(10 if i % 2 else 0, steps=1000 * (i % 2)) for i in range(20)]
        self.assertEqual(expected_stress(history, {"steps": 10**7}, None)["value"], 10.0)
        self.assertEqual(expected_stress(history, {"steps": -(10**7)}, None)["value"], 0.0)

    def test_rounded_to_one_decimal(self):
        r = expected_stress(varied(7), {"steps": 1234, "heart_rate": 61}, 3)
        self.assertEqual(r["value"], round(r["value"], 1))


if __name__ == "__main__":
    unittest.main()
