import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOKEN_KEY, USER, loadApp, stubBackend, tap } from "./test/accountsHelpers";
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
  expected: null,
  estimate: null,
  body_check: null,
};

const CHECKED_IN: Summary = {
  ...BASE,
  count: 12,
  today_checkin: { stress: 6, word: null },
  usual: { value: 3, based_on: 12 },
  today_vs_usual: { label: "higher" },
  expected: { value: 3, inputs: ["sleep_hours", "steps", "heart_rate"], days_used: 11, today_stress: 6, label: "higher" },
  why: { ready: true, have: 12, need: 7, today: "higher", week: null },
};

const DAY_2: Summary = {
  ...BASE,
  count: 2,
  expected: { value: 4, inputs: [], days_used: 1, today_stress: null, label: null },
};

const LINE_1 = "You said 6. From your sleep, steps and heart rate, we'd expect about 3.";
const LINE_2 = "Today is higher than expected.";

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
  await screen.findByText(USER.email);
}

async function openWhy(summary: Summary) {
  await openHome(summary);
  tap("Why?");
  await screen.findByRole("heading", { name: "Why?" });
}

describe("expected stress on screen", () => {
  it("home_shows_owner_sentence", async () => {
    await openHome(CHECKED_IN);
    const card = await screen.findByRole("group", { name: "What we'd expect today" });
    expect(within(card).getByText(LINE_1)).toBeTruthy();
    expect(within(card).getByText(LINE_2)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Higher than your usual/);
  });

  it("before_checkin_prompt", async () => {
    await openHome(DAY_2);
    expect(await screen.findByText("From your check-ins so far, we'd expect about 4 today. Check in to see how you compare.")).toBeTruthy();
  });

  it("null_falls_back_to_usual_sentence", async () => {
    await openHome({ ...CHECKED_IN, expected: null });
    expect(await screen.findByText("Higher than your usual")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "What we'd expect today" })).toBeNull();
  });

  it("why_shows_expected_from_day_1", async () => {
    await openWhy({ ...DAY_2, expected: { value: 4, inputs: [], days_used: 0, today_stress: null, label: null } });
    expect(await screen.findByText("How today compares with what we'd expect")).toBeTruthy();
    expect(screen.getByText("From your starting answers, we'd expect about 4 today. Check in to see how you compare.")).toBeTruthy();
    expect(screen.getByText(/Check in on 7 different days/)).toBeTruthy(); // the rest is still held back
  });

  it("why_keeps_the_week_line", async () => {
    await openWhy({ ...CHECKED_IN, why: { ready: true, have: 12, need: 7, today: "higher", week: "lower" } });
    expect(await screen.findByText("This past week is lower than your usual.")).toBeTruthy();
  });

  it("home_and_why_use_same_wording", async () => {
    await openHome(CHECKED_IN);
    const card = await screen.findByRole("group", { name: "What we'd expect today" });
    const home = Array.from(card.querySelectorAll("p")).map((p) => p.textContent);
    cleanup();
    vi.resetModules();
    await openWhy(CHECKED_IN);
    await screen.findByText("How today compares with what we'd expect");
    for (const line of home) expect(screen.getByText(line!)).toBeTruthy();
    expect(home).toEqual([LINE_1, LINE_2]);
  });
});
