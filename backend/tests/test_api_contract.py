"""Pins the response field names the frontend reads.

If a field is renamed or removed in backend/main.py, one of these tests fails.
Keep the lists in step with frontend/src/api.ts and frontend/src/test/fixtures.ts.
"""
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from backend.main import create_app

RECORD_KEYS = {
    "user_id", "date", "mode", "source_label", "reported_stress",
    "wearable_estimate", "comparison", "measurements", "imputed_features",
    "limitation", "contributors",
}
REPORTED_STRESS_KEYS = {"value", "scale_max", "normalized_0_100", "source"}
WEARABLE_ESTIMATE_KEYS = {"value", "scale_max", "status", "method"}
COMPARISON_KEYS = {"state", "label", "description"}
CONFIG_KEYS = {"profile_id", "default_date", "replay_dates", "scenarios", "limitation"}
HEALTH_KEYS = {"status", "model_ready", "state_ready", "state_error", "fitbit_authenticated"}
FITBIT_STATUS_KEYS = {"latest_hr", "body_load"}


class ApiContract(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        app = create_app(state_path=Path(self.tmp.name) / "checkins.json")
        self.client = TestClient(app)
        self.date = app.state.demo.metadata["default_date"]

    def assert_has(self, body, keys, where):
        missing = keys - set(body)
        self.assertFalse(missing, f"{where} is missing {sorted(missing)}")

    def assert_record(self, record, where):
        self.assert_has(record, RECORD_KEYS, where)
        self.assert_has(record["reported_stress"], REPORTED_STRESS_KEYS, f"{where}.reported_stress")
        self.assert_has(record["wearable_estimate"], WEARABLE_ESTIMATE_KEYS, f"{where}.wearable_estimate")
        self.assert_has(record["comparison"], COMPARISON_KEYS, f"{where}.comparison")

    def test_health(self):
        self.assert_has(self.client.get("/health").json(), HEALTH_KEYS, "/health")

    def test_demo_config(self):
        body = self.client.get("/demo/config").json()
        self.assert_has(body, CONFIG_KEYS, "/demo/config")
        for scenario in body["scenarios"]:
            self.assert_has(scenario, {"id", "label"}, "/demo/config scenarios")

    def test_today(self):
        response = self.client.get("/today", params={"date": self.date})
        self.assertEqual(response.status_code, 200)
        self.assert_record(response.json(), "/today")

    def test_trends(self):
        body = self.client.get("/trends").json()
        self.assert_has(body, {"mode", "source_label", "records", "timeline"}, "/trends")
        self.assertTrue(body["records"])
        for record in body["records"]:
            self.assert_record(record, "/trends record")
        for point in body["timeline"]:
            self.assert_has(point, {"date", "physiological_load", "reported_stress"}, "/trends timeline")

    def test_checkin(self):
        response = self.client.post("/checkin", json={"date": self.date, "stress": 4})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assert_has(body, {"saved", "record"}, "/checkin")
        self.assert_record(body["record"], "/checkin record")

    def test_fitbit_status(self):
        self.assert_has(self.client.get("/api/fitbit/status").json(), FITBIT_STATUS_KEYS, "/api/fitbit/status")


if __name__ == "__main__":
    unittest.main()
