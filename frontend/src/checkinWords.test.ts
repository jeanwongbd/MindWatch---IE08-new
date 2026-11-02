import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { WORDS, dayBefore, localDate } from "./checkinWords";

// The server decides which words are allowed. Tests run from the frontend folder (npm test, and CI).
const backend = JSON.parse(readFileSync(resolve(process.cwd(), "../backend/checkin_words.json"), "utf8"));

describe("words match the backend", () => {
  it("same twelve words in the same order", () => {
    expect([...WORDS]).toEqual(backend.words);
    expect(WORDS).toHaveLength(12);
  });
});

describe("local dates", () => {
  it("formats the phone's own calendar date", () => {
    expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(localDate(new Date(2026, 11, 31, 0, 0))).toBe("2026-12-31");
  });

  it("finds the day before, across months, years and leap days", () => {
    expect(dayBefore("2026-01-15")).toBe("2026-01-14");
    expect(dayBefore("2026-01-01")).toBe("2025-12-31");
    expect(dayBefore("2026-03-01")).toBe("2026-02-28");
    expect(dayBefore("2024-03-01")).toBe("2024-02-29");
  });
});
