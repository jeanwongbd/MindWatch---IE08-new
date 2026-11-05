import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TOKEN_KEY,
  USER,
  callsTo,
  loadApp,
  stubBackend,
  tap,
  type Routes,
} from "./test/accountsHelpers";
import { utcOffsetMinutes } from "./checkinWords";

// 12:00 on 15 January 2026 on the phone's own clock.
const TODAY = "2026-01-15";
const YESTERDAY = "2026-01-14";
const NOT_FOUND = { status: 404, body: { detail: "No check-in for that day." } };

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

/** Signed in, on the check-in screen. */
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

const putBody = (spy: ReturnType<typeof stubBackend>, day = TODAY) => {
  const [, init] = callsTo(spy, `PUT /me/checkins/${day}`)[0];
  return JSON.parse(init!.body as string);
};
const pressed = (name: string) => screen.getByRole("button", { name }).getAttribute("aria-pressed");

describe("the signed-in daily check-in", () => {
  it("saves a stress number and a word for today", async () => {
    const spy = await openCheckIn({ [`PUT /me/checkins/${TODAY}`]: { status: 201, body: {} } });
    tap("6");
    tap("Tired");
    tap("Save check-in");
    expect(await screen.findByText(/Saved\. You can change it until the day ends\./)).toBeTruthy();
    expect(putBody(spy)).toEqual({ stress: 6, word: "Tired", energy: [], utc_offset_minutes: utcOffsetMinutes() });
    const [url, init] = callsTo(spy, `PUT /me/checkins/${TODAY}`)[0];
    expect(String(url)).toMatch(/\/me\/checkins\/2026-01-15$/);
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer saved-token");
  });

  it("cannot be saved until a stress number is chosen, and the word is optional", async () => {
    const spy = await openCheckIn({ [`PUT /me/checkins/${TODAY}`]: { status: 201, body: {} } });
    expect(screen.getByRole("button", { name: "Save check-in" }).hasAttribute("disabled")).toBe(true);
    tap("2");
    expect(screen.getByRole("button", { name: "Save check-in" }).hasAttribute("disabled")).toBe(false);
    tap("Save check-in");
    await screen.findByText(/Saved\./);
    expect(putBody(spy).word).toBeNull();
  });

  it("shows what is already saved and lets the word be changed", async () => {
    const spy = await openCheckIn({
      [`GET /me/checkins/${TODAY}`]: { body: { date: TODAY, stress: 3, word: "Calm" } },
      [`PUT /me/checkins/${TODAY}`]: { status: 200, body: {} },
    });
    await waitFor(() => expect(pressed("Calm")).toBe("true"));
    expect(pressed("3")).toBe("true");
    tap("Hopeful");
    expect(pressed("Hopeful")).toBe("true");
    expect(pressed("Calm")).toBe("false");
    tap("Save check-in");
    await screen.findByText(/Saved\./);
    expect(putBody(spy)).toMatchObject({ stress: 3, word: "Hopeful" });
  });

  it("tapping the chosen word again clears it", async () => {
    const spy = await openCheckIn({ [`PUT /me/checkins/${TODAY}`]: { status: 201, body: {} } });
    tap("4");
    tap("Sad");
    tap("Sad");
    expect(pressed("Sad")).toBe("false");
    tap("Save check-in");
    await screen.findByText(/Saved\./);
    expect(putBody(spy).word).toBeNull();
  });

  it("can check in for yesterday, using yesterday's date", async () => {
    const spy = await openCheckIn({ [`PUT /me/checkins/${YESTERDAY}`]: { status: 201, body: {} } });
    tap("Yesterday");
    await waitFor(() => expect(callsTo(spy, `GET /me/checkins/${YESTERDAY}`).length).toBe(1));
    tap("8");
    tap("Save check-in");
    await screen.findByText(/Saved\./);
    expect(callsTo(spy, `PUT /me/checkins/${YESTERDAY}`).length).toBe(1);
    expect(callsTo(spy, `PUT /me/checkins/${TODAY}`).length).toBe(0);
    expect(putBody(spy, YESTERDAY).stress).toBe(8);
  });

  it("switching the day clears the chosen answers so one day's answers are not saved on another", async () => {
    await openCheckIn({
      [`GET /me/checkins/${TODAY}`]: { body: { date: TODAY, stress: 9, word: "Anxious" } },
    });
    await waitFor(() => expect(pressed("Anxious")).toBe("true"));
    tap("Yesterday");
    await waitFor(() => expect(pressed("Anxious")).toBe("false"));
    expect(screen.getByRole("button", { name: "Save check-in" }).hasAttribute("disabled")).toBe(true);
  });

  it("shows the server's message when the day is refused", async () => {
    await openCheckIn({
      [`PUT /me/checkins/${TODAY}`]: {
        status: 422,
        body: { detail: "You can only check in for today or yesterday." },
      },
    });
    tap("5");
    tap("Save check-in");
    expect((await screen.findByRole("alert")).textContent).toBe("You can only check in for today or yesterday.");
    expect(screen.queryByText(/Saved\./)).toBeNull();
  });

  it("offers fixed choices only: no text box for notes", async () => {
    await openCheckIn();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("goes back to Home", async () => {
    await openCheckIn();
    tap("Back");
    expect(await screen.findByText(USER.email)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Check in today" })).toBeTruthy();
  });

  it("an expired session on save returns to sign-in", async () => {
    await openCheckIn({ [`PUT /me/checkins/${TODAY}`]: { status: 401, body: { detail: "Session expired." } } });
    tap("5");
    fireEvent.click(screen.getByRole("button", { name: "Save check-in" }));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});
