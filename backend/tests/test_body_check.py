import unittest
from datetime import timedelta
from types import SimpleNamespace

from backend.body_check import build_body_check
from backend.summary import build_summary
from backend.tests import test_summary
from backend.tests.test_summary import NOON, TODAY_DATE


def ci(days_ago, stress, sleep_hours=None):
    return SimpleNamespace(date=TODAY_DATE - timedelta(days=days_ago), stress=stress, sleep_hours=sleep_hours)


def ms(days_ago, sleep=None, heart=None):
    return SimpleNamespace(date=TODAY_DATE - timedelta(days=days_ago), sleep_minutes=sleep, heart_rate_avg=heart)


def baseline(first_days_ago=2, count=7, value=60.0):
    return [ms(first_days_ago + i, heart=value) for i in range(count)]


class BodyCheckRule(unittest.TestCase):
    def test_short_sleep_two_days_feel_ok(self):
        r = build_body_check([ci(1, 2), ci(0, 3)], [ms(1, sleep=240), ms(0, sleep=280)], TODAY_DATE)
        self.assertEqual(r["state"], "body_signal_feel_ok")
        self.assertEqual(r["signals"], ["short_sleep"])
        self.assertEqual(r["days"], ["2026-01-31", "2026-02-01"])
        self.assertEqual(r["stress"], [2, 3])
        self.assertIsNone(r["heart"])

    def test_one_short_night_is_not_a_pattern(self):
        self.assertIsNone(build_body_check([ci(1, 2), ci(0, 2)], [ms(1, sleep=240), ms(0, sleep=480)], TODAY_DATE))

    def test_short_sleep_from_manual_answer(self):
        r = build_body_check([ci(1, 2, "under_5"), ci(0, 2, "under_5")], [], TODAY_DATE)
        self.assertEqual(r["signals"], ["short_sleep"])
        self.assertEqual(r["sleep"][0], {"minutes": None, "manual": "under_5", "short": True, "known": True})

    def test_watch_minutes_win_over_manual_answer(self):
        r = build_body_check([ci(1, 2, "under_5"), ci(0, 2, "under_5")], [ms(1, sleep=480), ms(0, sleep=480)], TODAY_DATE)
        self.assertIsNone(r)  # watch says fine sleep, so no pattern, and the feeling is okay
        r = build_body_check([ci(1, 8, "7_8"), ci(0, 8, "7_8")], [ms(1, sleep=200), ms(0, sleep=200)], TODAY_DATE)
        self.assertEqual(r["state"], "both")

    def test_exactly_300_minutes_is_not_short(self):
        r = build_body_check([ci(1, 8), ci(0, 8)], [ms(1, sleep=300), ms(0, sleep=300)], TODAY_DATE)
        self.assertEqual(r["state"], "feel_stressed_body_usual")
        self.assertEqual(r["signals"], [])
        self.assertFalse(r["sleep"][0]["short"])

    def test_high_heart_rate_needs_7_days_of_baseline(self):
        mine = [ms(1, heart=80), ms(0, heart=80)]
        self.assertIsNone(build_body_check([ci(1, 2), ci(0, 2)], mine + baseline(count=6), TODAY_DATE))
        r = build_body_check([ci(1, 2), ci(0, 2)], mine + baseline(count=7), TODAY_DATE)
        self.assertEqual(r["signals"], ["high_heart_rate"])
        self.assertEqual(r["heart"], {"usual": 60.0, "values": [80, 80], "high": [True, True]})

    def test_high_heart_rate_two_days_feel_ok(self):
        r = build_body_check([ci(1, 1), ci(0, 3)], [ms(1, heart=70), ms(0, heart=75)] + baseline(), TODAY_DATE)
        self.assertEqual(r["state"], "body_signal_feel_ok")
        self.assertEqual(r["heart"]["high"], [True, True])

    def test_heart_rate_9_above_usual_is_not_high(self):
        r = build_body_check([ci(1, 8), ci(0, 8)], [ms(1, heart=69), ms(0, heart=69)] + baseline(), TODAY_DATE)
        self.assertEqual(r["heart"]["high"], [False, False])
        self.assertEqual(r["signals"], [])
        self.assertEqual(r["state"], "feel_stressed_body_usual")

    def test_both_state_when_stressed_with_signals(self):
        r = build_body_check(
            [ci(1, 8), ci(0, 9)], [ms(1, sleep=200, heart=75), ms(0, sleep=250, heart=72)] + baseline(), TODAY_DATE
        )
        self.assertEqual(r["state"], "both")
        self.assertEqual(r["signals"], ["short_sleep", "high_heart_rate"])

    def test_feel_stressed_body_usual_needs_comparable_data(self):
        self.assertIsNone(build_body_check([ci(1, 8), ci(0, 8)], [], TODAY_DATE))
        # Sleep known on one day only, heart baseline missing: not comparable.
        self.assertIsNone(build_body_check([ci(1, 8, "7_8"), ci(0, 8)], [], TODAY_DATE))
        # Heart baseline present with values on both days: comparable.
        r = build_body_check([ci(1, 8), ci(0, 8)], [ms(1, heart=60), ms(0, heart=62)] + baseline(), TODAY_DATE)
        self.assertEqual(r["state"], "feel_stressed_body_usual")

    def test_no_body_data_and_stressed_gives_null(self):
        self.assertIsNone(build_body_check([ci(1, 9), ci(0, 9)], [], TODAY_DATE))

    def test_window_ends_yesterday_when_no_checkin_today(self):
        r = build_body_check([ci(2, 2), ci(1, 2)], [ms(2, sleep=100), ms(1, sleep=100)], TODAY_DATE)
        self.assertEqual(r["days"], ["2026-01-30", "2026-01-31"])
        # Today has a check-in but yesterday does not: no pair, even though older days pair up.
        self.assertIsNone(build_body_check([ci(0, 2), ci(2, 2), ci(3, 2)], [ms(2, sleep=100), ms(3, sleep=100)], TODAY_DATE))

    def test_gap_day_breaks_the_window(self):
        self.assertIsNone(build_body_check([ci(2, 2), ci(0, 2)], [ms(2, sleep=100), ms(0, sleep=100)], TODAY_DATE))

    def test_middle_stress_gives_null(self):
        self.assertIsNone(build_body_check([ci(1, 5), ci(0, 5)], [ms(1, sleep=100), ms(0, sleep=100)], TODAY_DATE))
        self.assertIsNone(build_body_check([ci(1, 2), ci(0, 8)], [ms(1, sleep=100), ms(0, sleep=100)], TODAY_DATE))


class BodyCheckRoute(test_summary.SummaryRoute):
    # Reuses the server setup of SummaryRoute; its own tests are not repeated here.
    def send_sleep(self, who, minutes_by_days_ago):
        days = [
            {"date": (NOON - timedelta(days=n)).date().isoformat(), "sleep_minutes": m}
            for n, m in minutes_by_days_ago.items()
        ]
        response = self.client.put("/me/measurements", json={"utc_offset_minutes": 0, "days": days}, headers=who)
        self.assertEqual(response.status_code, 200)

    def test_summary_includes_body_check(self):
        self.check_in_every_day(self.alice, 2, stress=lambda i: 2)
        self.send_sleep(self.alice, {1: 240, 0: 200})
        s = self.summary(self.alice)
        self.assertEqual(s["body_check"]["state"], "body_signal_feel_ok")
        self.assertEqual(s["body_check"]["signals"], ["short_sleep"])
        self.assertEqual(s["body_check"]["sleep"][0]["minutes"], 240)

    def test_user_a_measurements_never_affect_user_b(self):
        self.check_in_every_day(self.alice, 2, stress=lambda i: 2)
        self.check_in_every_day(self.bob, 2, stress=lambda i: 2)
        self.send_sleep(self.alice, {1: 240, 0: 200})
        self.assertIsNone(self.summary(self.bob)["body_check"])
        self.assertIsNotNone(self.summary(self.alice)["body_check"])

    def test_existing_summary_callers_still_work(self):
        self.assertIsNone(build_summary([], TODAY_DATE)["body_check"])


# Keep the inherited SummaryRoute tests from running a second time under this class.
for _name in [n for n in dir(test_summary.SummaryRoute) if n.startswith("test_")]:
    setattr(BodyCheckRoute, _name, None) if _name not in BodyCheckRoute.__dict__ else None

if __name__ == "__main__":
    unittest.main()
