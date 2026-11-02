"""The "set your starting point" questions, and the check that answers are allowed ones.

The list lives in calibration_questions.json. A frontend test compares it with the screens,
so the two cannot drift apart. Answers are only ever picked from fixed options, never typed.
"""
import json
from pathlib import Path
from typing import Any, Dict

_DATA = json.loads((Path(__file__).resolve().parent / "calibration_questions.json").read_text("utf-8"))

QUESTIONS_VERSION: str = _DATA["questions_version"]
CONSENT_VERSIONS = frozenset(_DATA["consent_versions"])
QUESTIONS: Dict[str, Dict[str, Any]] = {q["id"]: q for q in _DATA["questions"]}


class InvalidAnswers(ValueError):
    pass


def validate_answers(answers: Dict[str, Any]) -> Dict[str, Any]:
    """Return the answers if every question has exactly one allowed answer, else raise."""
    if set(answers) != set(QUESTIONS):
        raise InvalidAnswers("answers must cover exactly the listed questions")
    for key, question in QUESTIONS.items():
        value = answers[key]
        if question["kind"] == "scale":
            ok = isinstance(value, int) and not isinstance(value, bool)
            ok = ok and question["min"] <= value <= question["max"]
        else:
            ok = isinstance(value, str) and value in question["options"]
        if not ok:
            raise InvalidAnswers(f"not an allowed answer to {key}")
    return dict(answers)
