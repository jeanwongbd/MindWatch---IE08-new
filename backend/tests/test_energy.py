import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from fastapi.testclient import TestClient

from backend.checkins import ENERGY
from backend.main import create_app
from backend.settings import Settings
from backend.tests.test_auth import CODE, signup_body
from backend.tests.test_checkins import TODAY, YESTERDAY

NOW = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)
EXPECTED = ["Exams", "Deadlines", "Lectures", "Group work", "Sleep", "Social", "Family", "Money", "Health", "Other"]


class EnergyTags(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        settings = Settings(database_url=f"sqlite:///{(Path(self.tmp.name) / 'app.db').as_posix()}", invite_codes=(CODE,))
        self.app = create_app(state_path=Path(self.tmp.name) / "state.json", settings=settings)
        self.app.state.clock = lambda: NOW
        context = TestClient(self.app)
        self.client = context.__enter__()
        self.addCleanup(context.__exit__, None, None, None)
        self.alice = self.new_user("alice@example.com")
        self.bob = self.new_user("bob@example.com")

    def new_user(self, email):
        response = self.client.post("/auth/signup", json=signup_body(email=email))
        self.assertEqual(response.status_code, 201)
        return {"Authorization": f"Bearer {response.json()['token']}"}

    def save(self, who, day=TODAY, **extra):
        body = {"stress": 5, "word": None, "utc_offset_minutes": 0, **extra}
        return self.client.put(f"/me/checkins/{day}", json=body, headers=who)

    def get(self, who, day=TODAY):
        return self.client.get(f"/me/checkins/{day}", headers=who).json()

    def test_energy_saved_and_returned(self):
        r = self.save(self.alice, energy=["Exams", "Sleep"])
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()["energy"], ["Exams", "Sleep"])
        self.assertEqual(self.get(self.alice)["energy"], ["Exams", "Sleep"])
        listed = self.client.get("/me/checkins", headers=self.alice).json()["checkins"]
        self.assertEqual(listed[0]["energy"], ["Exams", "Sleep"])

    def test_energy_is_optional(self):
        r = self.save(self.alice)
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()["energy"], [])
        self.assertEqual(self.get(self.alice)["energy"], [])
        self.assertEqual(self.save(self.alice, energy=[]).status_code, 200)

    def test_energy_must_be_from_list(self):
        self.assertEqual(self.save(self.alice, energy=["Aliens"]).status_code, 422)
        self.assertEqual(self.save(self.alice, energy=["exams"]).status_code, 422)
        self.assertEqual(self.save(self.alice, energy="Exams").status_code, 422)
        self.assertEqual(self.client.get(f"/me/checkins/{TODAY}", headers=self.alice).status_code, 404)

    def test_energy_rejects_duplicates(self):
        self.assertEqual(self.save(self.alice, energy=["Exams", "Exams"]).status_code, 422)

    def test_energy_stored_in_list_order(self):
        r = self.save(self.alice, energy=["Other", "Money", "Exams"])
        self.assertEqual(r.json()["energy"], ["Exams", "Money", "Other"])
        self.assertEqual(self.get(self.alice)["energy"], ["Exams", "Money", "Other"])

    def test_energy_replaced_on_change(self):
        self.save(self.alice, energy=["Exams", "Sleep"])
        self.assertEqual(self.save(self.alice, energy=["Family"]).json()["energy"], ["Family"])
        self.assertEqual(self.save(self.alice).json()["energy"], [])
        self.assertEqual(self.get(self.alice)["energy"], [])

    def test_summary_counts_recent_energy(self):
        summary = lambda: self.client.get("/me/summary", params={"utc_offset_minutes": 0}, headers=self.alice).json()
        self.assertEqual(summary()["recent_energy"], [])
        self.save(self.alice, YESTERDAY, energy=["Exams", "Sleep"])
        self.save(self.alice, TODAY, energy=["Sleep", "Money"])
        self.assertEqual(
            summary()["recent_energy"],
            [{"tag": "Sleep", "count": 2}, {"tag": "Money", "count": 1}, {"tag": "Exams", "count": 1}],
        )
        self.save(self.alice, TODAY, energy=ENERGY[:6])
        shown = summary()["recent_energy"]
        self.assertEqual(len(shown), 5)
        self.assertEqual(shown[:2], [{"tag": "Exams", "count": 2}, {"tag": "Sleep", "count": 2}])

    def test_export_includes_energy(self):
        self.save(self.alice, energy=["Deadlines"])
        self.save(self.alice, YESTERDAY)
        data = self.client.get("/me/export", headers=self.alice).json()
        self.assertEqual([c["energy"] for c in data["check_ins"]], [[], ["Deadlines"]])

    def test_user_a_cannot_see_user_b_energy(self):
        self.save(self.bob, energy=["Family"])
        self.assertEqual(self.client.get("/me/checkins", headers=self.alice).json()["checkins"], [])
        self.assertEqual(self.client.get(f"/me/checkins/{TODAY}", headers=self.alice).status_code, 404)
        self.assertEqual(
            self.client.get("/me/summary", params={"utc_offset_minutes": 0}, headers=self.alice).json()["recent_energy"], []
        )
        self.assertNotIn("Family", json.dumps(self.client.get("/me/export", headers=self.alice).json()))

    def test_energy_list_matches_json(self):
        self.assertEqual(list(ENERGY), EXPECTED)
        raw = json.loads((Path(__file__).resolve().parents[1] / "checkin_words.json").read_text("utf-8"))
        self.assertEqual(raw["energy"], EXPECTED)
        self.assertEqual(len(raw["words"]), 12)


if __name__ == "__main__":
    unittest.main()
