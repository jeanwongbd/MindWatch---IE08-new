import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOKEN_KEY, USER, callsTo, loadApp, stubBackend, tap, type Routes } from "./test/accountsHelpers";
import { utcOffsetMinutes } from "./checkinWords";
import type { Summary } from "./summary";

// 12:00 on 15 January 2026 on the phone's own clock.
const TODAY = "2026-01-15";

const EMPTY: Summary = {
  today: TODAY,
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
  body_check: null,
};

// The four stages the plan names, as the server would describe them.
const DAY_1: Summary = {
  ...EMPTY,
  count: 1,
  progress: { done: 1, goal: 30 },
  today_checkin: { stress: 6, word: "Tired" },
  streak: { current: 1, best: 1, status: "building" },
};
const DAY_3: Summary = {
  ...EMPTY,
  count: 3,
  progress: { done: 3, goal: 30 },
  today_checkin: { stress: 5, word: null },
  usual: { value: 4.3, based_on: 3 },
  recent_7d: { value: 4.3, based_on: 3, days: 7 },
  today_vs_usual: { label: "about" },
  streak: { current: 3, best: 3, status: "building" },
};
const DAY_12: Summary = {
  ...EMPTY,
  count: 12,
  progress: { done: 12, goal: 30 },
  today_checkin: { stress: 9, word: "Tired" },
  usual: { value: 3.5, based_on: 12 },
  recent_7d: { value: 4.4, based_on: 7, days: 7 },
  today_vs_usual: { label: "higher" },
  recent_words: [
    { word: "Tired", count: 4 },
    { word: "Calm", count: 2 },
    { word: "Sad", count: 1 },
  ],
  streak: { current: 12, best: 12, status: "building" },
};
const DAY_30: Summary = {
  ...DAY_12,
  count: 30,
  progress: { done: 30, goal: 30 },
  usual: { value: 5, based_on: 30 },
  today_vs_usual: { label: "lower" },
};

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

async function openHome(summary: Summary | "network-error", routes: Routes = {}) {
  localStorage.setItem(TOKEN_KEY, "saved-token");
  const spy = stubBackend({
    "GET /auth/me": { body: USER },
    "GET /me/summary": summary === "network-error" ? "network-error" : { body: summary },
    ...routes,
  });
  await loadApp();
  await screen.findByText(USER.email);
  return spy;
}

const text = () => document.body.textContent ?? "";

describe("Home, by how many check-ins there are", () => {
  it("before any check-in: a welcome and a way to start", async () => {
    await openHome(EMPTY);
    expect(await screen.findByText("0 of 30 check-ins")).toBeTruthy();
    expect(text()).toMatch(/Your first check-in sets your starting point/);
    expect(screen.getByText("You haven't checked in today.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Check in today" })).toBeTruthy();
    expect(text()).not.toMatch(/Your usual/);
  });

  it("day 1: today's check-in, no averages yet", async () => {
    await openHome(DAY_1);
    expect(await screen.findByText("1 of 30 check-ins")).toBeTruthy();
    expect(screen.getByText("Today: 6 out of 10 · Tired")).toBeTruthy();
    expect(text()).toMatch(/Check in for a few more days to see what's usual for you/);
    expect(text()).not.toMatch(/Your usual/);
    expect(text()).not.toMatch(/Last 7 days/);
    expect(screen.getByRole("button", { name: "Change today's check-in" })).toBeTruthy();
  });

  it("day 3: the usual level, the last 7 days and how today compares", async () => {
    await openHome(DAY_3);
    expect(await screen.findByText("3 of 30 check-ins")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Your usual" }).textContent).toMatch(/4\.3.*out of 10.*from 3 check-ins/);
    expect(screen.getByRole("group", { name: "Last 7 days" }).textContent).toMatch(/4\.3.*out of 10.*from 3 check-ins/);
    expect(screen.getByText("About your usual")).toBeTruthy();
    expect(text()).not.toMatch(/a few more days/);
  });

  it("day 12: a higher-than-usual day and the words of the week", async () => {
    await openHome(DAY_12);
    expect(await screen.findByText("12 of 30 check-ins")).toBeTruthy();
    expect(screen.getByText("Higher than your usual")).toBeTruthy();
    const words = within(screen.getByRole("list", { name: "Your words this week" })).getAllByRole("listitem");
    expect(words.map((li) => li.textContent)).toEqual(["Tired (4)", "Calm (2)", "Sad"]);
  });

  it("day 30: the goal is reached, still no estimate", async () => {
    await openHome(DAY_30);
    expect(await screen.findByText("30 of 30 check-ins")).toBeTruthy();
    expect(text()).toMatch(/You've done 30 check-ins/);
    expect(screen.getByText("Lower than your usual")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("30");
  });

  it("no_estimate_before_ready: no screen state ever mentions an estimate or a prediction", async () => {
    for (const summary of [EMPTY, DAY_1, DAY_3, DAY_12, DAY_30]) {
      await openHome(summary);
      await screen.findByText(`${summary.progress.done} of 30 check-ins`);
      expect(text()).not.toMatch(/estimat|predict|forecast|model|diagnos/i);
      cleanup();
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("says plainly when the last 7 days do not have enough check-ins", async () => {
    await openHome({ ...DAY_3, recent_7d: null });
    await screen.findByText("3 of 30 check-ins");
    expect(text()).toMatch(/Last 7 days.*not enough check-ins this week yet \(it needs 3\)/);
  });

  it("never claims a cause", async () => {
    await openHome(DAY_12);
    await screen.findByText("12 of 30 check-ins");
    expect(text()).not.toMatch(/because|caused by|due to|reason/i);
  });
});

describe("Home and the server", () => {
  it("asks for the summary with the phone's own time-zone offset", async () => {
    const spy = await openHome(DAY_1);
    await screen.findByText("1 of 30 check-ins");
    const [url, init] = callsTo(spy, "GET /me/summary")[0];
    expect(String(url)).toContain(`utc_offset_minutes=${utcOffsetMinutes()}`);
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer saved-token");
  });

  it("shows an error with a way to try again, and the buttons still work", async () => {
    await openHome("network-error");
    expect((await screen.findByRole("alert")).textContent).toMatch(/Cannot connect/);
    expect(screen.getByRole("button", { name: "Check in today" })).toBeTruthy();
    stubBackend({ "GET /auth/me": { body: USER }, "GET /me/summary": { body: DAY_3 } });
    tap("Try again");
    expect(await screen.findByText("3 of 30 check-ins")).toBeTruthy();
  });

  it("refreshes after a check-in", async () => {
    const spy = await openHome(EMPTY, { [`GET /me/checkins/${TODAY}`]: { status: 404, body: {} } });
    await screen.findByText("0 of 30 check-ins");
    tap("Check in today");
    await screen.findByRole("heading", { name: "Daily check-in" });
    tap("Back");
    await screen.findByText("0 of 30 check-ins");
    await waitFor(() => expect(callsTo(spy, "GET /me/summary")).toHaveLength(2));
  });

  it("an expired session returns to sign-in", async () => {
    localStorage.setItem(TOKEN_KEY, "saved-token");
    stubBackend({ "GET /auth/me": { body: USER }, "GET /me/summary": { status: 401, body: { detail: "expired" } } });
    await loadApp();
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});

describe("personal Trends", () => {
  const rows = [
    { date: "2026-01-15", stress: 6, word: "Tired", updated_at: "x" },
    { date: "2026-01-13", stress: 3, word: null, updated_at: "x" },
    { date: "2026-01-10", stress: 8, word: "Anxious", updated_at: "x" },
    { date: "2025-11-01", stress: 1, word: "Calm", updated_at: "x" }, // older than 30 days
  ];

  async function openTrends(checkins = rows, summary: Summary = DAY_3) {
    const spy = await openHome(summary, { "GET /me/checkins": { body: { checkins } } });
    await screen.findByText(`${summary.progress.done} of 30 check-ins`);
    tap("See your trends");
    await screen.findByRole("heading", { name: "Your trends" });
    await waitFor(() => expect(screen.queryByText(/Loading your check-ins/)).toBeNull());
    return spy;
  }

  it("lists the last 30 days, newest first, and leaves older check-ins out", async () => {
    await openTrends();
    const items = within(screen.getByRole("list", { name: "Your check-ins, newest first" })).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      "2026-01-156 out of 10 · Tired",
      "2026-01-133 out of 10",
      "2026-01-108 out of 10 · Anxious",
    ]);
    expect(text()).toMatch(/The last 30 days: 3 check-ins/);
    expect(text()).not.toMatch(/2025-11-01/);
  });

  it("draws one bar for each check-in, and leaves the missed days blank", async () => {
    await openTrends();
    const chart = screen.getByRole("img");
    expect(chart.querySelectorAll("[title]")).toHaveLength(3);
    expect(chart.querySelectorAll(".bg-border")).toHaveLength(27); // the 27 days with no check-in
  });

  it("describes the chart in words, including the usual level", async () => {
    await openTrends();
    const label = screen.getByRole("img").getAttribute("aria-label") ?? "";
    expect(label).toMatch(/over the last 30 days, 3 check-ins, your usual is 4\.3/);
    expect(text()).toMatch(/dashed line: your usual \(4\.3\)/);
  });

  it("asks for enough check-ins to cover 30 days", async () => {
    const spy = await openTrends();
    const urls = callsTo(spy, "GET /me/checkins").map(([url]) => String(url));
    expect(urls.some((u) => u.includes("limit=60"))).toBe(true);
  });

  it("says so when there is nothing to show yet", async () => {
    await openTrends([], EMPTY);
    expect(text()).toMatch(/No check-ins in the last 30 days yet/);
    expect(screen.queryByRole("list", { name: "Your check-ins, newest first" })).toBeNull();
  });

  it("shows an error if the check-ins cannot be loaded, and goes back to Home", async () => {
    await openHome(DAY_3, { "GET /me/checkins": "network-error" });
    await screen.findByText("3 of 30 check-ins");
    tap("See your trends");
    expect((await screen.findByRole("alert")).textContent).toMatch(/Cannot connect/);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("3 of 30 check-ins")).toBeTruthy();
  });

  it("no_estimate_before_ready: Trends shows no estimate or prediction either", async () => {
    await openTrends();
    expect(text()).not.toMatch(/estimat|predict|forecast|model|diagnos/i);
  });
});
