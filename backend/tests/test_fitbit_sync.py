import unittest
from unittest import mock

import requests
from fastapi.testclient import TestClient

import backend.main as backend_main


def google_response(status_code, body=None):
    response = mock.Mock()
    response.status_code = status_code
    response.json.return_value = body if body is not None else {}
    return response


def heart_rate_body(value):
    return {"bucket": [{"dataset": [{"point": [{"value": [{"fpVal": value}]}]}]}]}


class FitbitSync(unittest.TestCase):
    def setUp(self):
        self.saved = dict(backend_main.live_fitbit_cache)
        self.addCleanup(self.restore_cache)
        backend_main.live_fitbit_cache.update(
            access_token="test-token",
            last_sync=None,
            latest_hr=None,
            body_load=None,
            status="connected",
        )
        self.client = TestClient(backend_main.create_app())

    def restore_cache(self):
        backend_main.live_fitbit_cache.clear()
        backend_main.live_fitbit_cache.update(self.saved)

    def sync_with(self, **post_behaviour):
        with mock.patch.object(backend_main.requests, "post", **post_behaviour):
            return self.client.get("/api/fitbit/sync-live")

    def assert_cache_unchanged(self):
        self.assertIsNone(backend_main.live_fitbit_cache["latest_hr"])
        self.assertIsNone(backend_main.live_fitbit_cache["body_load"])
        self.assertIsNone(backend_main.live_fitbit_cache["last_sync"])

    def test_real_reading_is_returned(self):
        result = self.sync_with(return_value=google_response(200, heart_rate_body(71.0)))
        self.assertEqual(result.status_code, 200)
        body = result.json()
        self.assertEqual(body["status"], "success")
        self.assertEqual(body["latest_heart_rate"], 71.0)
        self.assertEqual(body["body_load"], 31.2)

    def test_empty_google_data_returns_no_number(self):
        result = self.sync_with(return_value=google_response(200, {"bucket": []}))
        self.assertEqual(result.status_code, 200)
        body = result.json()
        self.assertEqual(body["status"], "no_data")
        self.assertIsNone(body["latest_heart_rate"])
        self.assertIsNone(body["body_load"])
        self.assert_cache_unchanged()

    def test_expired_login_clears_token(self):
        result = self.sync_with(return_value=google_response(401))
        self.assertEqual(result.status_code, 401)
        self.assertIsNone(backend_main.live_fitbit_cache["access_token"])
        self.assertEqual(backend_main.live_fitbit_cache["status"], "disconnected")
        self.assert_cache_unchanged()

    def test_google_error_returns_502(self):
        result = self.sync_with(return_value=google_response(500))
        self.assertEqual(result.status_code, 502)
        self.assert_cache_unchanged()

    def test_unreadable_google_response_returns_502(self):
        response = google_response(200)
        response.json.side_effect = ValueError("bad json")
        result = self.sync_with(return_value=response)
        self.assertEqual(result.status_code, 502)
        self.assert_cache_unchanged()

    def test_network_failure_returns_502(self):
        result = self.sync_with(side_effect=requests.ConnectionError("down"))
        self.assertEqual(result.status_code, 502)
        self.assert_cache_unchanged()

    def test_status_has_no_made_up_values_before_sync(self):
        body = self.client.get("/api/fitbit/status").json()
        self.assertIsNone(body["latest_hr"])
        self.assertIsNone(body["body_load"])


if __name__ == "__main__":
    unittest.main()
