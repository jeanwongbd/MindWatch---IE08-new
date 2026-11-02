import unittest
from unittest import mock
from urllib.parse import parse_qs, urlparse

import requests
from fastapi.testclient import TestClient

import backend.main as backend_main


class FitbitOAuth(unittest.TestCase):
    def setUp(self):
        self.saved = dict(backend_main.live_fitbit_cache)
        self.addCleanup(self.restore_cache)
        secret = mock.patch.object(backend_main, "GOOGLE_CLIENT_SECRET", "test-value")
        secret.start()
        self.addCleanup(secret.stop)
        backend_main.live_fitbit_cache.update(
            access_token=None,
            oauth_state="known-state",
            status="disconnected",
        )
        self.client = TestClient(backend_main.create_app(), follow_redirects=False)

    def restore_cache(self):
        backend_main.live_fitbit_cache.clear()
        backend_main.live_fitbit_cache.update(self.saved)

    def token_response(self):
        response = mock.Mock()
        response.status_code = 200
        response.json.return_value = {"access_token": "test-token"}
        return response

    def test_login_stores_the_state_it_sends(self):
        result = self.client.get("/api/fitbit/login")
        self.assertEqual(result.status_code, 307)
        query = parse_qs(urlparse(result.headers["location"]).query)
        self.assertEqual(query["state"][0], backend_main.live_fitbit_cache["oauth_state"])

    def test_matching_state_connects(self):
        with mock.patch.object(
            backend_main.requests, "post", return_value=self.token_response()
        ) as post:
            result = self.client.get(
                "/api/fitbit/callback", params={"code": "abc", "state": "known-state"}
            )
        self.assertEqual(result.status_code, 307)
        self.assertTrue(result.headers["location"].endswith("/?synced=true"))
        self.assertEqual(backend_main.live_fitbit_cache["access_token"], "test-token")
        self.assertIsNone(backend_main.live_fitbit_cache["oauth_state"])
        self.assertEqual(post.call_args.kwargs["timeout"], 10)

    def test_wrong_state_is_rejected(self):
        with mock.patch.object(backend_main.requests, "post") as post:
            result = self.client.get(
                "/api/fitbit/callback", params={"code": "abc", "state": "other"}
            )
        self.assertEqual(result.status_code, 400)
        post.assert_not_called()
        self.assertIsNone(backend_main.live_fitbit_cache["access_token"])

    def test_missing_state_is_rejected(self):
        result = self.client.get("/api/fitbit/callback", params={"code": "abc"})
        self.assertEqual(result.status_code, 400)

    def test_state_cannot_be_reused(self):
        with mock.patch.object(
            backend_main.requests, "post", return_value=self.token_response()
        ):
            params = {"code": "abc", "state": "known-state"}
            self.client.get("/api/fitbit/callback", params=params)
            second = self.client.get("/api/fitbit/callback", params=params)
        self.assertEqual(second.status_code, 400)

    def test_deny_returns_to_the_app(self):
        result = self.client.get("/api/fitbit/callback", params={"error": "access_denied"})
        self.assertEqual(result.status_code, 307)
        self.assertTrue(result.headers["location"].endswith("/?sync_error=denied"))

    def test_token_network_failure_returns_502(self):
        with mock.patch.object(
            backend_main.requests, "post", side_effect=requests.ConnectionError("down")
        ):
            result = self.client.get(
                "/api/fitbit/callback", params={"code": "abc", "state": "known-state"}
            )
        self.assertEqual(result.status_code, 502)

    def test_cors_does_not_allow_credentials(self):
        origin = "https://mindwatch-frontend.onrender.com"
        result = self.client.get("/health", headers={"Origin": origin})
        self.assertEqual(result.headers.get("access-control-allow-origin"), origin)
        self.assertIsNone(result.headers.get("access-control-allow-credentials"))


if __name__ == "__main__":
    unittest.main()
