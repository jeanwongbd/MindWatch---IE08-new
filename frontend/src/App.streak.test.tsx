import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOKEN_KEY, USER, loadApp, stubBackend } from "./test/accountsHelpers";
import type { Summary } from "./summary";

const BASE: Summary = {
  today: "2026-01-15",
  count: 0,
  progress: { done: 0, goal: 30 },
  today_checkin: null,
  usual: null,
  recent_7d: null,
  today_vs_usual: null,
  recent_words: [],
  recent_energy: [],
  streak: { current: 0, best: 0, status: "none" },
  support_suggested: false,
  why: { ready: false, have: 0, need: 7, today: null, week: null },
  estimate: null,
};

const summaryWith = (count: number, streak: Summary["streak"], extra: Partial<Summary> = {}): Summary => ({
  ...BASE,
  count,
  progress: { done: Math.min(count, 30), goal: 30 },
  streak,
  ...extra,
});

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 0, 15, 12, 0, 0));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function openHome(summary: Summary) {
  localStorage.setItem(TOKEN_KEY, "saved-token");
  stubBackend({ "GET /auth/me": { body: USER }, "GET /me/summary": { body: summary } });
  await loadApp();
  await screen.findByText(`${summary.progress.done} of 30 check-ins`);
}

const streakBox = () => screen.getByRole("group", { name: "Your streak" });
const text = () => document.body.textContent ?? "";

describe("the streak on Home", () => {
  it("streak_counts_consecutive_days: shows the current and best streak", async () => {
    await openHome(summaryWith(14, { current: 5, best: 9, status: "building" }));
    const box = within(streakBox());
    expect(box.getByText("5-day streak")).toBeTruthy();
    expect(box.getByText("Best: 9 days")).toBeTruthy();
  });

  it("uses the singular for one day", async () => {
    await openHome(summaryWith(1, { current: 1, best: 1, status: "building" }));
    const box = within(streakBox());
    expect(box.getByText("1-day streak")).toBeTruthy();
    expect(box.getByText("Best: 1 day")).toBeTruthy();
  });

  it("late_checkin_keeps_streak: while today is still open, the streak is shown as continuing", async () => {
    await openHome(summaryWith(5, { current: 5, best: 9, status: "waiting" }));
    const box = within(streakBox());
    expect(box.getByText("Your 5-day streak continues if you check in today.")).toBeTruthy();
    expect(box.getByText("Best: 9 days")).toBeTruthy();
    expect(text()).not.toMatch(/Start again/);
  });

  it("missed_day_resets_streak: the kind message, with the check-in count that still stands", async () => {
    await openHome(summaryWith(12, { current: 0, best: 9, status: "none" }));
    const box = within(streakBox());
    expect(box.getByText("Start again today. Your 12 check-ins still count.")).toBeTruthy();
    expect(box.getByText("Your best streak so far: 9 days.")).toBeTruthy();
  });

  it("missed_day_keeps_30_count: the progress count is untouched when the streak is none", async () => {
    await openHome(summaryWith(12, { current: 0, best: 4, status: "none" }));
    expect(screen.getByText("12 of 30 check-ins")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("12");
  });

  it("best_streak_kept: the best streak is still shown after the current one ends", async () => {
    await openHome(summaryWith(8, { current: 0, best: 6, status: "none" }));
    expect(within(streakBox()).getByText("Your best streak so far: 6 days.")).toBeTruthy();
  });

  it("uses the singular for a single check-in and leaves out a best of 1", async () => {
    await openHome(summaryWith(1, { current: 0, best: 1, status: "none" }));
    const box = within(streakBox());
    expect(box.getByText("Start again today. Your 1 check-in still counts.")).toBeTruthy();
    expect(text()).not.toMatch(/best streak so far/);
  });

  it("shows nothing about streaks before the first check-in", async () => {
    await openHome(BASE);
    expect(screen.queryByRole("group", { name: "Your streak" })).toBeNull();
    expect(text()).not.toMatch(/streak/i);
  });

  it("never words a missed day as a loss, and never mentions a score or an estimate", async () => {
    const states: Summary[] = [
      summaryWith(5, { current: 5, best: 9, status: "building" }),
      summaryWith(5, { current: 5, best: 9, status: "waiting" }),
      summaryWith(12, { current: 0, best: 9, status: "none" }),
      summaryWith(1, { current: 0, best: 1, status: "none" }),
    ];
    for (const state of states) {
      await openHome(state);
      expect(text()).not.toMatch(/\blost\b|\blose\b|broke|broken|\bfail|behind|missed|streak ended|reset|shame|guilt/i);
      expect(text()).not.toMatch(/estimat|predict|forecast|diagnos/i);
      cleanup();
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
