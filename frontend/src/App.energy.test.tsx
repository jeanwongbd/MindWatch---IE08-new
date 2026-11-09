import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOKEN_KEY, USER, callsTo, loadApp, stubBackend, tap, type Routes } from "./test/accountsHelpers";
import { ENERGY, utcOffsetMinutes } from "./checkinWords";
import type { Summary } from "./summary";

// 12:00 on 15 January 2026 on the phone's own clock.
const TODAY = "2026-01-15";
const YESTERDAY = "2026-01-14";
const NOT_FOUND = { status: 404, body: { detail: "No check-in for that day." } };

const SUMMARY: Summary = {
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
  expected: null,
  estimate: null,
  body_check: null,
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

async function openCheckIn(routes: Routes = {}) {
  localStorage.setItem(TOKEN_KEY, "saved-token");
  const spy = stubBackend({
    "GET /auth/me": { body: USER },
    [`GET /me/checkins/${TODAY}`]: NOT_FOUND,
    [`GET /me/checkins/${YESTERDAY}`]: NOT_FOUND,
    ...routes,
  });
  await loadApp();
  await screen.findByText(USER.email);
  tap("Check in today");
  await screen.findByRole("heading", { name: "Daily check-in" });
  await waitFor(() => expect(screen.getByRole("button", { name: "6" }).hasAttribute("disabled")).toBe(false));
  return spy;
}

const putBody = (spy: ReturnType<typeof stubBackend>) => {
  const [, init] = callsTo(spy, `PUT /me/checkins/${TODAY}`)[0];
  return JSON.parse(init!.body as string);
};
const pressed = (name: string) => screen.getByRole("button", { name }).getAttribute("aria-pressed");
const PUT_OK = { [`PUT /me/checkins/${TODAY}`]: { status: 201, body: {} } };

describe("energy tags on the daily check-in", () => {
  it("energy_tags_are_optional", async () => {
    const spy = await openCheckIn(PUT_OK);
    expect(screen.getByRole("heading", { name: "What took your energy today?" })).toBeTruthy();
    expect(screen.getByText("Optional. Pick any that apply.")).toBeTruthy();
    tap("4");
    tap("Save check-in");
    await screen.findByText(/Saved\./);
    expect(putBody(spy)).toEqual({ stress: 4, word: null, energy: [], utc_offset_minutes: utcOffsetMinutes() });
  });

  it("energy_tags_toggle_and_send_in_payload", async () => {
    const spy = await openCheckIn(PUT_OK);
    const group = screen.getByRole("group", { name: "What took your energy today" });
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual([...ENERGY]);
    tap("Exams");
    tap("Money");
    tap("Sleep");
    tap("Money");
    expect(pressed("Exams")).toBe("true");
    expect(pressed("Money")).toBe("false");
    tap("5");
    tap("Save check-in");
    await screen.findByText(/Saved\./);
    expect(putBody(spy).energy).toEqual(["Exams", "Sleep"]);
  });

  it("energy_tags_load_when_editing", async () => {
    const spy = await openCheckIn({
      [`GET /me/checkins/${TODAY}`]: { body: { date: TODAY, stress: 3, word: null, energy: ["Family", "Health"] } },
      ...PUT_OK,
    });
    await waitFor(() => expect(pressed("Family")).toBe("true"));
    expect(pressed("Health")).toBe("true");
    expect(pressed("Exams")).toBe("false");
    tap("Health");
    tap("Save check-in");
    await screen.findByText(/Saved\./);
    expect(putBody(spy).energy).toEqual(["Family"]);
  });
});

describe("energy on Home", () => {
  async function openHome(summary: Summary) {
    localStorage.setItem(TOKEN_KEY, "saved-token");
    stubBackend({ "GET /auth/me": { body: USER }, "GET /me/summary": { body: summary } });
    await loadApp();
    await screen.findByText(USER.email);
  }

  it("home_shows_energy_this_week", async () => {
    await openHome({
      ...SUMMARY,
      count: 3,
      recent_energy: [
        { tag: "Exams", count: 3 },
        { tag: "Sleep", count: 1 },
      ],
    });
    await screen.findByText("What took your energy this week");
    const list = screen.getByRole("list", { name: "What took your energy this week" });
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Exams (3)", "Sleep (1)"]);
  });

  it("home_hides_energy_when_none", async () => {
    await openHome({ ...SUMMARY, count: 1, recent_words: [{ word: "Calm", count: 1 }] });
    await screen.findByText("Your words this week");
    expect(screen.queryByText("What took your energy this week")).toBeNull();
  });
});
