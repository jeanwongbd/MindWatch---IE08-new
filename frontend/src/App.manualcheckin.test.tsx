import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOKEN_KEY, USER, callsTo, loadApp, stubBackend, tap, type Routes } from "./test/accountsHelpers";
import { utcOffsetMinutes } from "./checkinWords";
import { CONSENT_PARAGRAPHS } from "./consentText";

const TODAY = "2026-01-15";
const YESTERDAY = "2026-01-14";
const NOT_FOUND = { status: 404, body: { detail: "No check-in for that day." } };
const ASKS = { "GET /me/checkins/setup": { body: { asks_sleep_activity: true } } };

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
    [`PUT /me/checkins/${TODAY}`]: { status: 201, body: {} },
    [`PUT /me/checkins/${YESTERDAY}`]: { status: 201, body: {} },
    ...routes,
  });
  await loadApp();
  await screen.findByText(USER.email);
  tap("Check in today");
  await screen.findByRole("heading", { name: "Daily check-in" });
  await waitFor(() => expect(screen.getByRole("button", { name: "6" }).hasAttribute("disabled")).toBe(false));
  return spy;
}

const putBody = (spy: ReturnType<typeof stubBackend>, day = TODAY) => {
  const [, init] = callsTo(spy, `PUT /me/checkins/${day}`)[0];
  return JSON.parse(init!.body as string);
};
const text = () => document.body.textContent ?? "";
const pressed = (name: string) => screen.getByRole("button", { name }).getAttribute("aria-pressed");

describe("sleep and activity in the check-in, for people with no smart watch", () => {
  it("people with a watch are not asked, and their check-in is sent exactly as before", async () => {
    const spy = await openCheckIn({ "GET /me/checkins/setup": { body: { asks_sleep_activity: false } } });
    expect(text()).not.toMatch(/How many hours did you sleep/);
    expect(screen.queryByRole("group", { name: "Activity" })).toBeNull();
    tap("5");
    tap("Save check-in");
    await screen.findByText(/Saved\./);
    expect(putBody(spy)).toEqual({ stress: 5, word: null, utc_offset_minutes: utcOffsetMinutes() });
  });

  it("people with no watch are asked all three, as optional questions", async () => {
    await openCheckIn(ASKS);
    expect(await screen.findByText("How many hours did you sleep last night?")).toBeTruthy();
    expect(screen.getByText("How was your sleep?")).toBeTruthy();
    expect(screen.getByText("How active were you today?")).toBeTruthy();
    expect(screen.getAllByText("Optional. Tap again to clear it.").length).toBe(4); // the word, then these three
  });

  it("saves the three answers with the check-in", async () => {
    const spy = await openCheckIn(ASKS);
    await screen.findByText("How was your sleep?");
    tap("5");
    tap("6 to 7");
    tap("Fair");
    tap("Lightly active");
    tap("Save check-in");
    await screen.findByText(/Saved\./);
    expect(putBody(spy)).toEqual({
      stress: 5,
      word: null,
      sleep_hours: "6_7",
      sleep_quality: "fair",
      activity: "lightly_active",
      utc_offset_minutes: utcOffsetMinutes(),
    });
  });

  it("the questions never block a check-in, and tapping an answer again clears it", async () => {
    const spy = await openCheckIn(ASKS);
    await screen.findByText("How was your sleep?");
    tap("3");
    tap("Good");
    expect(pressed("Good")).toBe("true");
    tap("Good");
    expect(pressed("Good")).toBe("false");
    tap("Save check-in");
    await screen.findByText(/Saved\./);
    expect(putBody(spy)).toMatchObject({ stress: 3, sleep_hours: null, sleep_quality: null, activity: null });
  });

  it("shows what was already saved, so it can be changed", async () => {
    await openCheckIn({
      ...ASKS,
      [`GET /me/checkins/${TODAY}`]: {
        body: { date: TODAY, stress: 4, word: null, sleep_hours: "8_9", sleep_quality: "great", activity: "very_active" },
      },
    });
    await waitFor(() => expect(pressed("8 to 9")).toBe("true"));
    expect(pressed("Great")).toBe("true");
    expect(pressed("Very active")).toBe("true");
  });

  it("for yesterday the questions say yesterday, and yesterday's answers are separate", async () => {
    const spy = await openCheckIn(ASKS);
    await screen.findByText("How was your sleep?");
    tap("6 to 7");
    tap("Yesterday");
    expect(await screen.findByText("How active were you yesterday?")).toBeTruthy();
    expect(screen.getByText("How many hours did you sleep the night before last?")).toBeTruthy();
    await waitFor(() => expect(pressed("6 to 7")).toBe("false"));
    tap("4");
    tap("Save check-in");
    await screen.findByText(/Saved\./);
    expect(putBody(spy, YESTERDAY)).toMatchObject({ stress: 4, sleep_hours: null });
  });

  it("if the server can't say, the questions are left out and a check-in still saves", async () => {
    const spy = await openCheckIn({ "GET /me/checkins/setup": { status: 500, body: { detail: "oops" } } });
    expect(text()).not.toMatch(/How was your sleep/);
    tap("5");
    tap("Save check-in");
    await screen.findByText(/Saved\./);
    expect(putBody(spy)).toEqual({ stress: 5, word: null, utc_offset_minutes: utcOffsetMinutes() });
  });
});

describe("the consent wording", () => {
  it("tells people their own sleep and activity answers are stored", () => {
    const stored = CONSENT_PARAGRAPHS.find((p) => p.startsWith("We will store"));
    expect(stored).toMatch(/if you have no smart watch, your own answers about your sleep and activity/);
    expect(stored).toMatch(/if you connect a watch, your sleep, steps and heart readings/);
  });
});
