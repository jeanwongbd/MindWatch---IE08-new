import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from backend.main import create_app


class Contributors(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.app = create_app(state_path=Path(self.tmp.name) / "checkins.json")
        self.client = TestClient(self.app)
        self.demo = self.app.state.demo

    def contributors(self, date):
        rows = self.client.get("/today", params={"date": date}).json()["contributors"]
        return {row["feature"]: row for row in rows}

    def test_date_with_no_data_makes_no_claims(self):
        rows = self.contributors("2025-04-16")
        self.assertEqual(rows["sleep"]["direction"], "neutral")
        self.assertEqual(rows["sleep"]["description"], "No sleep score for this date")
        self.assertEqual(rows["hrv"]["direction"], "neutral")
        self.assertEqual(rows["hrv"]["description"], "Not enough HRV data for this date")

    def test_low_values_use_real_units(self):
        rows = self.contributors("2025-04-21")
        self.assertEqual(rows["sleep"]["direction"], "negative")
        self.assertEqual(rows["sleep"]["description"], "Sleep score 72 / 100")
        self.assertEqual(rows["hrv"]["direction"], "negative")
        self.assertEqual(rows["hrv"]["description"], "9.9 ms below your earlier average")

    def test_high_values_are_positive(self):
        measurements = self.demo.records["2025-04-21"]["measurements"]
        measurements["overall_score"] = 80.0
        measurements["avg_rmssd"] = 200.0
        rows = self.contributors("2025-04-21")
        self.assertEqual(rows["sleep"]["direction"], "positive")
        self.assertEqual(rows["sleep"]["description"], "Sleep score 80 / 100")
        self.assertEqual(rows["hrv"]["direction"], "positive")
        self.assertIn("ms above your earlier average", rows["hrv"]["description"])

    def test_every_replay_date_has_sleep_then_hrv(self):
        for date in self.demo.metadata["replay_dates"]:
            rows = self.client.get("/today", params={"date": date}).json()["contributors"]
            self.assertEqual([row["feature"] for row in rows], ["sleep", "hrv"])

    def test_synthetic_scenarios_make_no_claims(self):
        for scenario in self.demo.scenarios:
            rows = self.client.get(
                "/today",
                params={"mode": "synthetic_scenario", "scenario": scenario},
            ).json()["contributors"]
            self.assertEqual({row["direction"] for row in rows}, {"neutral"})


if __name__ == "__main__":
    unittest.main()
