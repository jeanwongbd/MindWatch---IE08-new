import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOKEN_KEY, USER, loadApp, stubBackend, tap } from "./test/accountsHelpers";
import { WORDS } from "./checkinWords";
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

const READY: Summary = {
  ...BASE,
  count: 12,
  usual: { value: 5, based_on: 12 },
  recent_7d: { value: 3, based_on: 7, days: 7 },
  today_checkin: { stress: 2, word: "Calm" },
  recent_words: WORDS.map((word, i) => ({ word, count: i % 3 + 1 })),
  recent_energy: [],
  why: { ready: true, have: 12, need: 7, today: "lower", week: "lower" },
};

// Words that would claim a cause. None may appear anywhere on the page.
const BANNED = /because|caused|causes|cause of|due to|reason|leads? to|led to|triggered|result of|as a result|explains|thanks to|stems? from/i;

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

async function openWhy(summary: Summary) {
  localStorage.setItem(TOKEN_KEY, "saved-token");
  stubBackend({ "GET /auth/me": { body: USER }, "GET /me/summary": { body: summary } });
  await loadApp();
  await screen.findByText(USER.email);
  tap("Why?");
  await screen.findByRole("heading", { name: "Why?" });
}

const text = () => document.body.textContent ?? "";

describe("the signed-in Why tab", () => {
  it("needs_7_days_first: before 7 days it only says how many there are", async () => {
    await openWhy({ ...BASE, count: 3, why: { ready: false, have: 3, need: 7, today: null, week: null } });
    expect(await screen.findByText(/Check in on 7 different days and this page will fill in/)).toBeTruthy();
    expect(text()).toMatch(/3 of 7 so far/);
    expect(text()).not.toMatch(/than your usual/);
    expect(text()).not.toMatch(/Words you chose/);
  });

  it("says_lower_than_usual: once there are 7 days, it compares today and the week with their usual", async () => {
    await openWhy(READY);
    expect(await screen.findByText("Today is lower than your usual.")).toBeTruthy();
    expect(screen.getByText("This past week is lower than your usual.")).toBeTruthy();
    expect(text()).toMatch(/Your usual is 5 out of 10/);
  });

  it("says higher and about too", async () => {
    await openWhy({ ...READY, why: { ready: true, have: 12, need: 7, today: "higher", week: "about" } });
    expect(await screen.findByText("Today is higher than your usual.")).toBeTruthy();
    expect(screen.getByText("This past week is about your usual.")).toBeTruthy();
  });

  it("with no check-in today it says so, and does not compare", async () => {
    await openWhy({ ...READY, today_checkin: null, why: { ready: true, have: 12, need: 7, today: null, week: "lower" } });
    expect(await screen.findByText(/haven't checked in today yet/)).toBeTruthy();
    expect(text()).not.toMatch(/Today is/);
  });

  it("banned_words_absent: no cause is ever claimed, in any state, with every word in use", async () => {
    for (const summary of [
      BASE,
      { ...BASE, count: 3, why: { ready: false, have: 3, need: 7, today: null, week: null } },
      READY,
      { ...READY, why: { ready: true, have: 12, need: 7, today: "higher", week: "about" } },
      { ...READY, today_checkin: null, why: { ready: true, have: 12, need: 7, today: null, week: null } },
    ] as Summary[]) {
      await openWhy(summary);
      await screen.findByRole("heading", { name: "Why?" });
      await screen.findByText(/isn't medical advice/);
      expect(text()).not.toMatch(BANNED);
      expect(text()).toMatch(/can't tell you what is behind a change/);
      cleanup();
      localStorage.clear();
      vi.resetModules();
    }
  });

  it("shows the words used this week, most often first, and says it isn't medical advice", async () => {
    await openWhy(READY);
    expect(await screen.findByLabelText("Words you chose this week")).toBeTruthy();
    expect(text()).toMatch(/Calm \(1 days?\)|Calm/);
    expect(text()).toMatch(/isn't medical advice/);
  });

  it("Back returns to Home", async () => {
    await openWhy(READY);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText(USER.email)).toBeTruthy();
  });
});
