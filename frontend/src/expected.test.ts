import { describe, expect, it } from "vitest";
import { expectedLines, expectedPhrase } from "./expected";

const base = { value: 3, inputs: [] as string[], days_used: 12, today_stress: 6, label: "higher" as const };

describe("expected wording", () => {
  it("owner_sentence_exact", () => {
    const e = { ...base, inputs: ["sleep_hours", "steps", "heart_rate"] };
    expect(expectedLines(e)).toEqual([
      "You said 6. From your sleep, steps and heart rate, we'd expect about 3.",
      "Today is higher than expected.",
    ]);
  });

  it("phrase_names_only_used_inputs", () => {
    expect(expectedPhrase({ inputs: ["sleep_hours", "steps"], days_used: 5 })).toBe("From your sleep and steps");
    expect(expectedPhrase({ inputs: ["heart_rate"], days_used: 5 })).toBe("From your heart rate");
    expect(expectedPhrase({ inputs: ["steps", "heart_rate", "activity"], days_used: 5 })).toBe("From your steps and heart rate");
  });

  it("answers_only_phrase", () => {
    expect(expectedPhrase({ inputs: ["sleep_quality", "activity"], days_used: 5 })).toBe("From your sleep and activity answers");
  });

  it("check_ins_so_far_phrase", () => {
    expect(expectedPhrase({ inputs: [], days_used: 4 })).toBe("From your check-ins so far");
  });

  it("starting_answers_phrase", () => {
    expect(expectedPhrase({ inputs: [], days_used: 0 })).toBe("From your starting answers");
  });

  it("before_checkin_prompt", () => {
    const e = { ...base, value: 3.4, today_stress: null, label: null };
    expect(expectedLines(e)).toEqual(["From your check-ins so far, we'd expect about 3.4 today. Check in to see how you compare."]);
  });

  it("about_and_lower_sentences", () => {
    expect(expectedLines({ ...base, today_stress: 3, label: "about" })[1]).toBe("Today is about what we'd expect.");
    expect(expectedLines({ ...base, today_stress: 1, label: "lower" })[1]).toBe("Today is lower than expected.");
  });
});
