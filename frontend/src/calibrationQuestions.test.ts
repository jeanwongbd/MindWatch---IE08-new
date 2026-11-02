import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { QUESTIONS, QUESTIONS_VERSION, firstUnanswered, isComplete } from "./calibrationQuestions";
import { CONSENT_VERSION } from "./consentText";
import { clearAnswers, loadAnswers, saveAnswers } from "./onboarding";

// Tests run from the frontend folder (npm test, and CI). The server decides which answers are allowed. These tests keep the screens in step with it.
const backend = JSON.parse(
  readFileSync(resolve(process.cwd(), "../backend/calibration_questions.json"), "utf8"),
);

afterEach(() => {
  clearAnswers();
  localStorage.clear();
});

describe("questions match the backend", () => {
  it("same questions, in the same order, with the same kinds", () => {
    expect(QUESTIONS.map((q) => [q.id, q.kind])).toEqual(
      backend.questions.map((q: { id: string; kind: string }) => [q.id, q.kind]),
    );
  });

  it("same allowed answers", () => {
    for (const expected of backend.questions) {
      const question = QUESTIONS.find((q) => q.id === expected.id)!;
      if (question.kind === "scale") {
        expect([question.min, question.max]).toEqual([expected.min, expected.max]);
      } else {
        expect(question.options.map((o) => o.value)).toEqual(expected.options);
      }
    }
  });

  it("same question and consent versions", () => {
    expect(QUESTIONS_VERSION).toBe(backend.questions_version);
    expect(backend.consent_versions).toContain(CONSENT_VERSION);
  });
});

describe("saved answers", () => {
  it("round-trip and report completeness", () => {
    const answers = { usual_stress: 3, sleep_hours: "7_8", sleep_quality: "good", activity: "very_active", wears_watch: "no", stress_time: "night" };
    expect(isComplete({})).toBe(false);
    expect(firstUnanswered({})).toBe(0);
    saveAnswers(answers);
    expect(loadAnswers()).toEqual(answers);
    expect(isComplete(loadAnswers())).toBe(true);
  });

  it("survive unreadable storage text by starting empty", () => {
    localStorage.setItem("mindwatch.onboarding", "{not json");
    expect(loadAnswers()).toEqual({});
  });
});
