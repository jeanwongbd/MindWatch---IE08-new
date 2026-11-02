import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

from fastapi.testclient import TestClient

from backend.calibration import InvalidAnswers, QUESTIONS, validate_answers
from backend.main import create_app
from backend.settings import Settings
from backend.tests.test_auth import ANSWERS, CODE, CONSENT, EMAIL, PASSWORD, signup_body


class SignupConsentAndAnswers(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db_path = Path(self.tmp.name) / "app.db"
        settings = Settings(database_url=f"sqlite:///{self.db_path.as_posix()}", invite_codes=(CODE,))
        app = create_app(state_path=Path(self.tmp.name) / "c.json", settings=settings)
        self.now = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)
        app.state.clock = lambda: self.now
        context = TestClient(app)
        self.client = context.__enter__()
        self.addCleanup(context.__exit__, None, None, None)

    def signup(self, **changes):
        return self.client.post("/auth/signup", json={**signup_body(), **changes})

    def count(self, table):
        with closing(sqlite3.connect(self.db_path)) as conn:
            return conn.execute(f"select count(*) from {table}").fetchone()[0]

    def assert_nothing_created(self):
        for table in ("users", "consents", "calibration_answers", "sessions"):
            self.assertEqual(self.count(table), 0, table)

    # --- consent -----------------------------------------------------------
    def test_cannot_finish_without_consent(self):
        for consent in (
            {**CONSENT, "agreed": False},
            {**CONSENT, "adult_confirmed": False},
            {**CONSENT, "agreed": False, "adult_confirmed": False},
        ):
            self.assertEqual(self.signup(consent=consent).status_code, 422, consent)
        self.assert_nothing_created()

    def test_signup_without_a_consent_field_is_refused(self):
        body = signup_body()
        del body["consent"]
        self.assertEqual(self.client.post("/auth/signup", json=body).status_code, 422)
        self.assert_nothing_created()

    def test_unknown_consent_version_refused(self):
        self.assertEqual(self.signup(consent={**CONSENT, "version": "v99"}).status_code, 422)
        self.assert_nothing_created()

    def test_consent_cannot_carry_extra_fields(self):
        self.assertEqual(self.signup(consent={**CONSENT, "agreed_at": "2000-01-01"}).status_code, 422)

    # --- answers -----------------------------------------------------------
    def test_answers_saved_with_account(self):
        response = self.signup()
        self.assertEqual(response.status_code, 201)
        user_id = response.json()["user"]["id"]
        with closing(sqlite3.connect(self.db_path)) as conn:
            version, adult, agreed_at, consent_user = conn.execute(
                "select version, adult_confirmed, agreed_at, user_id from consents"
            ).fetchone()
            answers, questions_version, answers_user = conn.execute(
                "select answers, questions_version, user_id from calibration_answers"
            ).fetchone()
        self.assertEqual((consent_user, answers_user), (user_id, user_id))
        self.assertEqual(version, "v0-draft")
        self.assertTrue(adult)
        self.assertTrue(agreed_at.startswith("2026-01-01 12:00"))  # the server's clock, not the phone's
        self.assertEqual(json.loads(answers), ANSWERS)
        self.assertEqual(questions_version, "v1")

    def test_bad_answers_refused_and_nothing_created(self):
        bad = [
            {**ANSWERS, "sleep_hours": "twelve"},
            {**ANSWERS, "usual_stress": 11},
            {**ANSWERS, "usual_stress": -1},
            {**ANSWERS, "usual_stress": 4.5},
            {**ANSWERS, "usual_stress": True},
            {**ANSWERS, "usual_stress": "4"},
            {**ANSWERS, "wears_watch": "I wear a Fitbit Inspire 2"},  # no free text
            {**ANSWERS, "extra_question": "yes"},
            {k: v for k, v in ANSWERS.items() if k != "activity"},
            {},
        ]
        for answers in bad:
            self.assertEqual(self.signup(calibration=answers).status_code, 422, answers)
        self.assert_nothing_created()

    def test_error_does_not_echo_the_answers(self):
        response = self.signup(calibration={**ANSWERS, "wears_watch": "secret-health-detail"})
        self.assertNotIn("secret-health-detail", response.text)

    def test_duplicate_email_saves_no_extra_rows(self):
        self.assertEqual(self.signup().status_code, 201)
        self.assertEqual(self.signup().status_code, 409)
        self.assertEqual((self.count("users"), self.count("consents"), self.count("calibration_answers")), (1, 1, 1))

    def test_invite_code_is_still_checked_first(self):
        response = self.signup(invite_code="wrong", consent={**CONSENT, "agreed": False})
        self.assertEqual(response.status_code, 403)


class QuestionList(unittest.TestCase):
    def test_every_question_has_an_allowed_answer(self):
        self.assertEqual(len(QUESTIONS), 6)
        validate_answers(ANSWERS)

    def test_validation_raises_for_a_bad_answer(self):
        with self.assertRaises(InvalidAnswers):
            validate_answers({**ANSWERS, "activity": "flying"})


if __name__ == "__main__":
    unittest.main()
