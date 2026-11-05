import unittest
from datetime import date, timedelta

from ml.src import user_model


def rows(count, make, with_watch=True):
    start = date(2026, 1, 1)
    out = []
    for i in range(count):
        stress, steps, hr = make(i)
        out.append({
            "date": start + timedelta(days=i),
            "stress": stress,
            "steps": steps if with_watch else None,
            "sleep_minutes": 420 + i % 3 if with_watch else None,
            "heart_rate_avg": hr if with_watch else None,
        })
    return out


def clean(i):
    return (8, 12000, 80) if i % 2 else (2, 2000, 62)


class UserModelTests(unittest.TestCase):
    def test_due_at_30_then_every_7(self):
        due = [n for n in range(1, 60) if user_model.due_for_training(n)]
        self.assertEqual(due, [30, 37, 44, 51, 58])

    def test_too_few_checkins(self):
        self.assertEqual(user_model.train(rows(29, clean))["reason"], "too_few_checkins")

    def test_clean_signal_is_ready_and_predicts_well(self):
        result = user_model.train(rows(30, clean))
        self.assertEqual(result["status"], "ready")
        high = {"steps": 12000, "sleep_minutes": 420, "heart_rate_avg": 80}
        self.assertGreater(user_model.predict(result["params"], high), 6)

    def test_missing_watch_data_is_not_ready(self):
        result = user_model.train(rows(30, clean, with_watch=False))
        self.assertEqual((result["status"], result["reason"]), ("not_ready", "not_enough_watch_data"))
        self.assertIsNone(result["params"])

    def test_estimate_stays_between_0_and_10(self):
        result = user_model.train(rows(30, clean))
        extreme = {"steps": 10**6, "sleep_minutes": 0, "heart_rate_avg": 250}
        self.assertTrue(0 <= user_model.predict(result["params"], extreme) <= 10)

    def test_predict_needs_a_reading(self):
        result = user_model.train(rows(30, clean))
        with self.assertRaises(ValueError):
            user_model.predict(result["params"], {})


if __name__ == "__main__":
    unittest.main()
