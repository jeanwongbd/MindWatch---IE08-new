import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOKEN_KEY, callsTo, loadApp, stubBackend, tap, type Routes } from "./test/accountsHelpers";
import type { Summary } from "./summary";
import { utcOffsetMinutes } from "./checkinWords";

const TRY = "Try a 30-day sample account";

const SAMPLE_USER = { id: "s-1", email: "sample-account@mindwatch.example.com", is_sample: true };
const SAMPLE_SESSION = { token: "sample-token", expires_at: "2026-01-16T00:00:00+00:00", user: SAMPLE_USER };

const SUMMARY: Summary = {
  today: "2026-01-15",
  count: 30,
  progress: { done: 30, goal: 30 },
  today_checkin: { stress: 1, word: null },
  usual: { value: 1.2, based_on: 30 },
  recent_7d: { value: 1.4, based_on: 7, days: 7 },
  today_vs_usual: { label: "about" },
  recent_words: [],
  streak: { current: 5, best: 9, status: "building" },
  support_suggested: false,
  why: { ready: false, have: 0, need: 7, today: null, week: null },
  estimate: null,
};

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("sample account", () => {
  it("opens from the Welcome screen as a sample account", async () => {
    stubBackend({
      "POST /auth/sample": { body: SAMPLE_SESSION },
      "GET /me/summary": { body: SUMMARY },
    });
    await loadApp();
    tap(TRY);
    expect(await screen.findByText(/Sample account\./)).toBeTruthy();
    expect(localStorage.getItem(TOKEN_KEY)).toBe("sample-token");
    await screen.findByText(/Your usual: 1.2 out of 10/);
  });

  it("sample_sends_utc_offset", async () => {
    const spy = stubBackend({
      "POST /auth/sample": { body: SAMPLE_SESSION },
      "GET /me/summary": { body: SUMMARY },
    });
    await loadApp();
    tap(TRY);
    await screen.findByText(/Your usual: 1.2 out of 10/);
    const [, init] = callsTo(spy, "POST /auth/sample")[0];
    expect(JSON.parse(String(init?.body))).toEqual({ utc_offset_minutes: utcOffsetMinutes() });
  });

  it("sample_shows_every_feature", async () => {
    stubBackend({
      "POST /auth/sample": { body: SAMPLE_SESSION },
      "GET /me/summary": { body: SUMMARY },
    });
    await loadApp();
    tap(TRY);
    await screen.findByText(/Your usual: 1.2 out of 10/);
    expect(screen.getByRole("button", { name: /Change today's check-in/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reminders" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Account" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "See your trends" })).toBeTruthy();
  });

  it("sample_banner_says_private_copy", async () => {
    stubBackend({
      "POST /auth/sample": { body: SAMPLE_SESSION },
      "GET /me/summary": { body: SUMMARY },
    });
    await loadApp();
    tap(TRY);
    const banner = await screen.findByText(/Sample account\./);
    expect(banner.textContent).toMatch(/private to you/);
    expect(banner.textContent).toMatch(/deleted after a day/);
    expect(screen.queryByText(/Signed in as/)).toBeNull();
  });

  it("sample_delete_needs_no_password", async () => {
    const spy = stubBackend({
      "POST /auth/sample": { body: SAMPLE_SESSION },
      "GET /me/summary": { body: SUMMARY },
      "POST /me/delete": { status: 204 },
    });
    await loadApp();
    tap(TRY);
    await screen.findByText(/Your usual: 1.2 out of 10/);
    tap("Account");
    tap("Delete my account");
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    tap("Delete everything");
    await waitFor(() => expect(callsTo(spy, "POST /me/delete").length).toBe(1));
    const [, init] = callsTo(spy, "POST /me/delete")[0];
    expect(JSON.parse(String(init?.body))).toEqual({});
    await screen.findByText(/have been deleted/);
  });

  it("sample_password_change_hidden", async () => {
    stubBackend({
      "POST /auth/sample": { body: SAMPLE_SESSION },
      "GET /me/summary": { body: SUMMARY },
    });
    await loadApp();
    tap(TRY);
    await screen.findByText(/Your usual: 1.2 out of 10/);
    tap("Account");
    expect(screen.getByText("Sample accounts have no password.")).toBeTruthy();
    expect(screen.queryByRole("form", { name: "Change password" })).toBeNull();
    expect(screen.queryByLabelText("Current password")).toBeNull();
  });

  it("normal_account_still_needs_password_to_delete", async () => {
    localStorage.setItem(TOKEN_KEY, "t");
    const spy = stubBackend({
      "GET /auth/me": { body: { id: "u-1", email: "student@example.com" } },
      "GET /me/summary": { body: SUMMARY },
      "POST /me/delete": { status: 204 },
    });
    await loadApp();
    await screen.findByText(/Your usual: 1.2 out of 10/);
    tap("Account");
    expect(screen.getByRole("form", { name: "Change password" })).toBeTruthy();
    tap("Delete my account");
    fireEvent.change(screen.getByLabelText("Type your password to confirm"), { target: { value: "hunter2hunter2" } });
    tap("Delete everything");
    await waitFor(() => expect(callsTo(spy, "POST /me/delete").length).toBe(1));
    const [, init] = callsTo(spy, "POST /me/delete")[0];
    expect(JSON.parse(String(init?.body))).toEqual({ password: "hunter2hunter2" });
  });

  it("shows a message and stays on Welcome when the sample is not set up", async () => {
    stubBackend({ "POST /auth/sample": { status: 404, body: { detail: "The sample account is not set up." } } });
    await loadApp();
    tap(TRY);
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/not set up/));
    expect(screen.getByRole("button", { name: "Get started" })).toBeTruthy();
  });

  it("sample_429_shows_message", async () => {
    stubBackend({ "POST /auth/sample": { status: 429, body: { detail: "Lots of people are trying the sample. Try again soon." } } });
    await loadApp();
    tap(TRY);
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Lots of people/));
    expect(screen.getByRole("button", { name: "Get started" })).toBeTruthy();
  });

  it("is not offered when accounts are off", async () => {
    await loadApp(false);
    expect(screen.queryByRole("button", { name: TRY })).toBeNull();
  });

  it("a normal account still sees its actions and no sample banner", async () => {
    stubBackend({
      "POST /auth/login": {
        body: { token: "t", expires_at: "2026-02-01T00:00:00+00:00", user: { id: "u-1", email: "student@example.com" } },
      },
      "GET /me/summary": { body: SUMMARY },
    });
    localStorage.setItem(TOKEN_KEY, "t");
    stubBackend({
      "GET /auth/me": { body: { id: "u-1", email: "student@example.com" } },
      "GET /me/summary": { body: SUMMARY },
    });
    await loadApp();
    await screen.findByText(/Your usual: 1.2 out of 10/);
    expect(screen.queryByText(/Sample account\./)).toBeNull();
    expect(screen.getByRole("button", { name: /Change today's check-in/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Account" })).toBeTruthy();
  });
});
