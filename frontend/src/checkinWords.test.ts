import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ENERGY, WORDS, dayBefore, localDate, utcOffsetMinutes } from "./checkinWords";

// The server decides which words are allowed. Tests run from the frontend folder (npm test, and CI).
const backend = JSON.parse(readFileSync(resolve(process.cwd(), "../backend/checkin_words.json"), "utf8"));

describe("words match the backend", () => {
  it("same twelve words in the same order", () => {
    expect([...WORDS]).toEqual(backend.words);
    expect(WORDS).toHaveLength(12);
  });

  it("same ten energy tags in the same order", () => {
    expect([...ENERGY]).toEqual(backend.energy);
    expect(ENERGY).toHaveLength(10);
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

describe("the phone's offset from UTC", () => {
  // getTimezoneOffset() counts minutes *behind* UTC, so the sign is flipped.
  const phoneAt = (behindUtc: number) => ({ getTimezoneOffset: () => behindUtc }) as Date;

  it("is positive east of UTC and negative west of it", () => {
    expect(utcOffsetMinutes(phoneAt(-480))).toBe(480); // Singapore
    expect(utcOffsetMinutes(phoneAt(300))).toBe(-300); // New York in winter
    expect(utcOffsetMinutes(phoneAt(-330))).toBe(330); // India
    expect(utcOffsetMinutes(phoneAt(-840))).toBe(840); // the furthest east
    expect(utcOffsetMinutes(phoneAt(720))).toBe(-720); // the furthest west
  });

  it("is a plain 0 on UTC, never negative zero", () => {
    // Negative zero passes a loose check and then fails a strict one, as it did in CI (which runs in UTC).
    expect(Object.is(utcOffsetMinutes(phoneAt(0)), 0)).toBe(true);
    expect(Object.is(utcOffsetMinutes(phoneAt(-0)), 0)).toBe(true);
  });
});
