import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOKEN_KEY, callsTo, loadApp, stubBackend, tap, type Routes } from "./test/accountsHelpers";
import type { Summary } from "./summary";

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
  it("opens from the Welcome screen and says it is sample data", async () => {
    const routes: Routes = {
      "POST /auth/sample": { body: SAMPLE_SESSION },
      "GET /me/summary": { body: SUMMARY },
    };
    stubBackend(routes);
    await loadApp();
    tap("Look at a sample account");
    expect(await screen.findByText(/Sample data\./)).toBeTruthy();
    expect(localStorage.getItem(TOKEN_KEY)).toBe("sample-token");
    await screen.findByText(/Your usual: 1.2 out of 10/);
  });

  it("hides everything that would change something", async () => {
    stubBackend({
      "POST /auth/sample": { body: SAMPLE_SESSION },
      "GET /me/summary": { body: SUMMARY },
    });
    await loadApp();
    tap("Look at a sample account");
    await screen.findByText(/Your usual: 1.2 out of 10/);
    for (const name of [/Check in today/, /Change today's check-in/, "Reminders", "Account"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(screen.getByRole("button", { name: "See your trends" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });

  it("does not set up reminders for the sample", async () => {
    const spy = stubBackend({
      "POST /auth/sample": { body: SAMPLE_SESSION },
      "GET /me/summary": { body: SUMMARY },
    });
    await loadApp();
    tap("Look at a sample account");
    await screen.findByText(/Your usual: 1.2 out of 10/);
    expect(callsTo(spy, "GET /me/summary").length).toBe(1);
    expect(screen.queryByText(/reminder/i)).toBeNull();
  });

  it("shows a message and stays on Welcome when the sample is not set up", async () => {
    stubBackend({ "POST /auth/sample": { status: 404, body: { detail: "The sample account is not set up." } } });
    await loadApp();
    tap("Look at a sample account");
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/not set up/));
    expect(screen.getByRole("button", { name: "Get started" })).toBeTruthy();
  });

  it("is not offered when accounts are off", async () => {
    await loadApp(false);
    expect(screen.queryByRole("button", { name: "Look at a sample account" })).toBeNull();
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
    expect(screen.queryByText(/Sample data\./)).toBeNull();
    expect(screen.getByRole("button", { name: /Change today's check-in/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Account" })).toBeTruthy();
  });
});
