import { describe, expect, it } from "vitest";
import { bodyCheckMessage } from "./bodyCheck";
import type { BodyCheck } from "./summary";

const SHORT = { minutes: 240, manual: null, short: true, known: true };
const OK = { minutes: 420, manual: null, short: false, known: true };
const HEART = (high: boolean): NonNullable<BodyCheck["heart"]> => ({ usual: 70, values: [82, 83], high: [high, high] });

const CASES: BodyCheck[] = [
  { state: "body_signal_feel_ok", days: ["2026-01-14", "2026-01-15"], stress: [2, 3], sleep: [SHORT, SHORT], heart: null, signals: ["short_sleep"] },
  { state: "body_signal_feel_ok", days: ["2026-01-14", "2026-01-15"], stress: [2, 3], sleep: [OK, OK], heart: HEART(true), signals: ["high_heart_rate"] },
  { state: "body_signal_feel_ok", days: ["2026-01-14", "2026-01-15"], stress: [2, 3], sleep: [SHORT, SHORT], heart: HEART(true), signals: ["short_sleep", "high_heart_rate"] },
  { state: "both", days: ["2026-01-14", "2026-01-15"], stress: [8, 9], sleep: [SHORT, SHORT], heart: null, signals: ["short_sleep"] },
  { state: "both", days: ["2026-01-14", "2026-01-15"], stress: [8, 9], sleep: [OK, OK], heart: HEART(true), signals: ["high_heart_rate"] },
  { state: "both", days: ["2026-01-14", "2026-01-15"], stress: [8, 9], sleep: [SHORT, SHORT], heart: HEART(true), signals: ["short_sleep", "high_heart_rate"] },
  { state: "feel_stressed_body_usual", days: ["2026-01-14", "2026-01-15"], stress: [8, 9], sleep: [OK, OK], heart: HEART(false), signals: [] },
  { state: "feel_stressed_body_usual", days: ["2026-01-14", "2026-01-15"], stress: [8, 9], sleep: [OK, OK], heart: null, signals: [] },
  { state: "feel_stressed_body_usual", days: ["2026-01-14", "2026-01-15"], stress: [8, 9], sleep: [{ minutes: null, manual: null, short: false, known: false }, OK], heart: HEART(false), signals: [] },
];

describe("body check wording", () => {
  it("wording_never_claims_cause", () => {
    for (const c of CASES) {
      const m = bodyCheckMessage(c);
      const all = `${m.headline} ${m.body}`.toLowerCase();
      for (const bad of ["because", "caused", "means you", "something is wrong", "you're fine", "diagnos"]) {
        expect(all).not.toContain(bad);
      }
    }
  });

  it("only points to support when stressed", () => {
    expect(CASES.map((c) => bodyCheckMessage(c).support)).toEqual([false, false, false, true, true, true, true, true, true]);
  });

  it("the reverse case names only the measures that were known", () => {
    expect(bodyCheckMessage(CASES[6]).body).toMatch(/^Your sleep and heart rate look like your usual/);
    expect(bodyCheckMessage(CASES[7]).body).toMatch(/^Your sleep looks like your usual/);
    expect(bodyCheckMessage(CASES[8]).body).toMatch(/^Your heart rate looks like your usual/);
  });
});
