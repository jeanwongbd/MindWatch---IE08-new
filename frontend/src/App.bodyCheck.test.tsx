import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOKEN_KEY, USER, loadApp, stubBackend, tap } from "./test/accountsHelpers";
import type { BodyCheck, Summary } from "./summary";

const BASE: Summary = {
  today: "2026-01-15",
  count: 12,
  progress: { done: 12, goal: 30 },
  today_checkin: { stress: 2, word: "Calm" },
  usual: { value: 5, based_on: 12 },
  recent_7d: { value: 3, based_on: 7, days: 7 },
  today_vs_usual: { label: "lower" },
  recent_words: [],
  recent_energy: [],
  streak: { current: 3, best: 3, status: "building" },
  support_suggested: false,
  why: { ready: true, have: 12, need: 7, today: "lower", week: "lower" },
  expected: null,
  estimate: null,
  body_check: null,
};

const DAYS = ["2026-01-14", "2026-01-15"];
const SHORT_WATCH = { minutes: 270, manual: null, short: true, known: true };
const OK_WATCH = { minutes: 425, manual: null, short: false, known: true };

const SHORT_SLEEP: BodyCheck = { state: "body_signal_feel_ok", days: DAYS, stress: [2, 3], sleep: [SHORT_WATCH, SHORT_WATCH], heart: null, signals: ["short_sleep"] };
const HEART: BodyCheck = {
  state: "body_signal_feel_ok",
  days: DAYS,
  stress: [2, 3],
  sleep: [OK_WATCH, OK_WATCH],
  heart: { usual: 70, values: [82, 84], high: [true, true] },
  signals: ["high_heart_rate"],
};
const BOTH: BodyCheck = { ...SHORT_SLEEP, state: "both", stress: [8, 9] };
const REVERSE_SLEEP_ONLY: BodyCheck = { state: "feel_stressed_body_usual", days: DAYS, stress: [8, 9], sleep: [OK_WATCH, OK_WATCH], heart: null, signals: [] };

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

async function openHome(body_check: BodyCheck | null) {
  localStorage.setItem(TOKEN_KEY, "saved-token");
  stubBackend({ "GET /auth/me": { body: USER }, "GET /me/summary": { body: { ...BASE, body_check } } });
  await loadApp();
  await screen.findByText(USER.email);
}

const card = () => screen.getByRole("group", { name: "How you feel vs your body" });

describe("the body check card on Home", () => {
  it("body_card_hidden_when_null", async () => {
    await openHome(null);
    await screen.findByText("Your usual");
    expect(screen.queryByRole("group", { name: "How you feel vs your body" })).toBeNull();
  });

  it("body_card_short_sleep_message", async () => {
    await openHome(SHORT_SLEEP);
    await screen.findByRole("group", { name: "How you feel vs your body" });
    expect(card().textContent).toMatch(/You've slept under 5 hours for 2 nights, and you've said you feel okay/);
    expect(within(card()).queryByRole("button", { name: "Need support?" })).toBeNull();
  });

  it("body_card_heart_message", async () => {
    await openHome(HEART);
    await screen.findByRole("group", { name: "How you feel vs your body" });
    expect(card().textContent).toMatch(/Your heart rate has been higher than your usual for 2 days, and you've said you feel okay/);
  });

  it("body_card_both_mentions_support", async () => {
    await openHome(BOTH);
    await screen.findByRole("group", { name: "How you feel vs your body" });
    expect(card().textContent).toMatch(/talk to someone/);
    expect(within(card()).getByRole("button", { name: "Need support?" })).toBeTruthy();
  });

  it("body_card_reverse_case_mentions_only_known_measures", async () => {
    await openHome(REVERSE_SLEEP_ONLY);
    await screen.findByRole("group", { name: "How you feel vs your body" });
    expect(card().textContent).toMatch(/Your sleep looks like your usual/);
    expect(card().textContent).not.toMatch(/heart rate/i);
    expect(within(card()).getByRole("button", { name: "Need support?" })).toBeTruthy();
  });

  it("body_card_opens_why", async () => {
    await openHome(SHORT_SLEEP);
    await screen.findByRole("group", { name: "How you feel vs your body" });
    tap("See details");
    expect(await screen.findByRole("heading", { name: "Why?" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "How you feel vs your body" })).toBeTruthy();
  });
});

describe("the body check section on the Why tab", () => {
  async function openWhy(body_check: BodyCheck) {
    await openHome(body_check);
    tap("Why?");
    return screen.findByRole("heading", { name: "How you feel vs your body" });
  }

  it("why_lists_both_days_with_sleep_and_heart", async () => {
    await openWhy(HEART);
    const list = screen.getByRole("list", { name: "The 2 days compared" });
    const t = list.textContent ?? "";
    expect(t).toMatch(/Wed 14 Jan/);
    expect(t).toMatch(/Thu 15 Jan/);
    expect(t).toMatch(/Stress: 2 out of 10/);
    expect(t).toMatch(/Stress: 3 out of 10/);
    expect(t).toMatch(/7 hours 5 minutes/);
    expect(t).toMatch(/82 beats a minute on average, your usual is 70/);
    expect(t).toMatch(/84 beats a minute on average, your usual is 70/);
  });

  it("why_shows_manual_sleep_answer", async () => {
    await openWhy({
      ...BOTH,
      sleep: [
        { minutes: null, manual: "under_5", short: true, known: true },
        { minutes: null, manual: null, short: false, known: false },
      ],
    });
    const t = screen.getByRole("list", { name: "The 2 days compared" }).textContent ?? "";
    expect(t).toMatch(/Sleep: under 5 hours/);
    expect(t).toMatch(/Sleep: not recorded/);
    expect(screen.getByRole("button", { name: "Need support?" })).toBeTruthy();
  });
});
