import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOKEN_KEY, USER, callsTo, fill, loadApp, stubBackend, tap, type Routes } from "./test/accountsHelpers";
import type { Summary } from "./summary";

// A stand-in for the phone's notification system, to check reminders are cancelled on deletion.
const phone = vi.hoisted(() => ({
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  createChannel: vi.fn(),
  schedule: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock("@capacitor/local-notifications", () => ({ LocalNotifications: phone }));

const PREFS_KEY = `mindwatch.reminders.${USER.id}`;
const WATCH_KEY = `mindwatch.watch.${USER.id}`;
const DRAFT_KEY = "mindwatch.onboarding";
const ALL_IDS = Array.from({ length: 14 }, (_, i) => 4100 + i);

const BASE: Summary = {
  today: "2026-01-15",
  count: 5,
  progress: { done: 5, goal: 30 },
  today_checkin: { stress: 4, word: "Calm" },
  usual: null,
  recent_7d: null,
  today_vs_usual: null,
  recent_words: [],
  recent_energy: [],
  streak: { current: 5, best: 5, status: "building" },
  support_suggested: false,
  why: { ready: false, have: 0, need: 7, today: null, week: null },
  expected: null,
  estimate: null,
  body_check: null,
};

const EXPORT = {
  exported_at: "2026-01-15T12:00:00+00:00",
  account: { id: USER.id, email: USER.email, created_at: "2026-01-01T00:00:00+00:00" },
  consent: { version: "v0-draft", adult_confirmed: true, agreed_at: "2026-01-01T00:00:00+00:00" },
  starting_point_answers: null,
  check_ins: [{ date: "2026-01-15", stress: 4, word: "Calm", saved_at: "2026-01-15T11:00:00+00:00" }],
};

beforeEach(() => {
  localStorage.clear();
  phone.checkPermissions.mockResolvedValue({ display: "granted" });
  phone.requestPermissions.mockResolvedValue({ display: "granted" });
  phone.createChannel.mockResolvedValue(undefined);
  phone.schedule.mockResolvedValue({});
  phone.cancel.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();
  delete (globalThis as { Capacitor?: unknown }).Capacitor;
});

async function openHome(summary: Summary = BASE, routes: Routes = {}) {
  localStorage.setItem(TOKEN_KEY, "saved-token");
  const spy = stubBackend({ "GET /auth/me": { body: USER }, "GET /me/summary": { body: summary }, ...routes });
  await loadApp();
  await screen.findByText(`${summary.progress.done} of 30 check-ins`);
  return spy;
}

async function openAccount(routes: Routes = {}, summary: Summary = BASE) {
  const spy = await openHome(summary, routes);
  tap("Account");
  await screen.findByRole("heading", { name: "Account" });
  return spy;
}

const text = () => document.body.textContent ?? "";
const body = (spy: ReturnType<typeof stubBackend>, key: string) => JSON.parse(callsTo(spy, key)[0][1]!.body as string);

describe("Support from every starting point", () => {
  it("Home always has a way to Support, and Back returns to Home", async () => {
    await openHome();
    tap("Need support?");
    expect(await screen.findByRole("heading", { name: "Support" })).toBeTruthy();
    tap("Back");
    expect(await screen.findByText("5 of 30 check-ins")).toBeTruthy();
  });

  it("the Account screen links to Support, and Back returns to Account", async () => {
    await openAccount();
    tap("Need support?");
    expect(await screen.findByRole("heading", { name: "Support" })).toBeTruthy();
    tap("Back");
    expect(await screen.findByRole("heading", { name: "Account" })).toBeTruthy();
  });

  it("the Welcome screen offers Support before anyone signs in, and Back returns there", async () => {
    stubBackend({});
    await loadApp();
    tap("Need support?");
    expect(await screen.findByRole("heading", { name: "Support" })).toBeTruthy();
    expect(text()).toMatch(/National Mindline/);
    tap("Back");
    expect(screen.getByRole("button", { name: "Get started" })).toBeTruthy();
  });

  it("is not added to the plain demo Welcome screen when accounts are off", async () => {
    stubBackend({});
    await loadApp(false);
    expect(screen.queryByRole("button", { name: "Need support?" })).toBeNull();
  });
});

describe("the calm message on Home", () => {
  it("appears when support is suggested, kindly and without diagnosing", async () => {
    await openHome({ ...BASE, support_suggested: true });
    const box = screen.getByRole("group", { name: "Support suggestion" });
    expect(within(box).getByText(/These last few days have been hard\. You're not alone, and there are people you can talk to\./)).toBeTruthy();
    expect(box.textContent).not.toMatch(/diagnos|disorder|depress|illness|condition|you should|you must|treatment/i);
    fireEvent.click(within(box).getByRole("button", { name: "See support options" }));
    expect(await screen.findByRole("heading", { name: "Support" })).toBeTruthy();
  });

  it("does not appear otherwise", async () => {
    await openHome({ ...BASE, support_suggested: false });
    expect(screen.queryByRole("group", { name: "Support suggestion" })).toBeNull();
    expect(text()).not.toMatch(/hard\. You're not alone/);
  });
});

describe("changing the password", () => {
  async function openChange(routes: Routes = {}) {
    const spy = await openAccount({ "POST /auth/password": { status: 204 }, ...routes });
    return spy;
  }
  const fillForm = (current = "old password 123", next = "a brand new password", again = next) => {
    fill("Current password", current);
    fill("New password", next);
    fill("New password again", again);
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
  };

  it("sends both passwords, says other devices were signed out, and clears the form", async () => {
    const spy = await openChange();
    fillForm();
    expect(await screen.findByText("Password changed. Your other devices have been signed out.")).toBeTruthy();
    expect(body(spy, "POST /auth/password")).toEqual({
      current_password: "old password 123",
      new_password: "a brand new password",
    });
    expect((screen.getByLabelText("Current password") as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("heading", { name: "Account" })).toBeTruthy(); // still signed in
    expect(localStorage.getItem(TOKEN_KEY)).toBe("saved-token");
  });

  it("refuses a short, mismatched or unchanged password without calling the server", async () => {
    const spy = await openChange();
    fillForm("old password 123", "short", "short");
    expect((await screen.findByRole("alert")).textContent).toMatch(/at least 10 characters/);
    fillForm("old password 123", "a brand new password", "a different password");
    expect((await screen.findByRole("alert")).textContent).toMatch(/don't match/);
    fillForm("same password 123", "same password 123");
    expect((await screen.findByRole("alert")).textContent).toMatch(/haven't used just now/);
    expect(callsTo(spy, "POST /auth/password")).toHaveLength(0);
  });

  it("a wrong current password shows the message and does NOT sign the person out", async () => {
    await openChange({ "POST /auth/password": { status: 403, body: { detail: "That password is not right." } } });
    fillForm();
    expect((await screen.findByRole("alert")).textContent).toBe("That password is not right.");
    expect(screen.getByRole("heading", { name: "Account" })).toBeTruthy();
    expect(localStorage.getItem(TOKEN_KEY)).toBe("saved-token");
  });

  it("says how long to wait after too many wrong passwords", async () => {
    await openChange({
      "POST /auth/password": { status: 429, body: { detail: "Too many." }, headers: { "Retry-After": "300" } },
    });
    fillForm();
    expect((await screen.findByRole("alert")).textContent).toBe("Too many failed attempts. Try again in about 5 minutes.");
  });
});

describe("downloading my data", () => {
  it("shows exactly what the server sends, and never asks for anything else", async () => {
    const spy = await openAccount({ "GET /me/export": { body: EXPORT } });
    tap("Show my data");
    const shown = (await screen.findByLabelText("Your data")).textContent!;
    expect(JSON.parse(shown)).toEqual(EXPORT);
    expect(shown).not.toMatch(/password|argon|token/i);
    expect(callsTo(spy, "GET /me/export")).toHaveLength(1);
  });

  it("can be hidden again", async () => {
    await openAccount({ "GET /me/export": { body: EXPORT } });
    tap("Show my data");
    await screen.findByLabelText("Your data");
    tap("Hide");
    expect(screen.queryByLabelText("Your data")).toBeNull();
    expect(screen.getByRole("button", { name: "Show my data" })).toBeTruthy();
  });

  it("Copy puts the same text on the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await openAccount({ "GET /me/export": { body: EXPORT } });
    tap("Show my data");
    const shown = (await screen.findByLabelText("Your data")).textContent!;
    tap("Copy");
    expect(await screen.findByText(/Copied\./)).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith(shown);
  });

  it("says so, kindly, if copying is not possible", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("no")) },
      configurable: true,
    });
    await openAccount({ "GET /me/export": { body: EXPORT } });
    tap("Show my data");
    await screen.findByLabelText("Your data");
    tap("Copy");
    expect(await screen.findByText(/Couldn't copy it/)).toBeTruthy();
  });

  it("Save as file downloads a .json file holding the same text", async () => {
    const created: Blob[] = [];
    // jsdom has no object URLs. Provide only these two, and put things back afterwards.
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    URL.createObjectURL = vi.fn((blob: Blob) => {
      created.push(blob);
      return "blob:test";
    });
    URL.revokeObjectURL = vi.fn();
    const clicked: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.download);
    });
    await openAccount({ "GET /me/export": { body: EXPORT } });
    tap("Show my data");
    const shown = (await screen.findByLabelText("Your data")).textContent!;
    tap("Save as file");
    expect(clicked).toEqual(["mindwatch-my-data.json"]);
    expect(await created[0].text()).toBe(shown);
    expect(created[0].type).toBe("application/json");
    click.mockRestore();
    URL.createObjectURL = original.create;
    URL.revokeObjectURL = original.revoke;
  });

  it("the website offers Save as file and Copy", async () => {
    await openAccount({ "GET /me/export": { body: EXPORT } });
    tap("Show my data");
    await screen.findByLabelText("Your data");
    expect(screen.getByRole("button", { name: "Save as file" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
  });

  it("the Android app offers only Copy, because it cannot save a file, and says how to keep the data", async () => {
    // On a real Android phone, tapping a "Save as file" button showed "Saved" but saved nothing.
    (globalThis as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true };
    await openAccount({ "GET /me/export": { body: EXPORT } });
    tap("Show my data");
    await screen.findByLabelText("Your data");
    expect(screen.queryByRole("button", { name: "Save as file" })).toBeNull();
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
    expect(text()).toMatch(/Tap Copy, then paste it into a note or an email to keep it\./);
  });

  it("shows an error if the data cannot be loaded", async () => {
    await openAccount({ "GET /me/export": "network-error" });
    tap("Show my data");
    expect((await screen.findByRole("alert")).textContent).toMatch(/Cannot connect/);
  });
});

describe("deleting my account", () => {
  async function openDelete(routes: Routes = {}) {
    const spy = await openAccount({ "POST /me/delete": { status: 204 }, ...routes });
    tap("Delete my account");
    await screen.findByRole("form", { name: "Confirm deleting my account" });
    return spy;
  }

  it("asks first, says it cannot be undone, and Cancel backs out without calling the server", async () => {
    const spy = await openDelete();
    expect(text()).toMatch(/This permanently deletes your account and every check-in\. This can't be undone\./);
    tap("Cancel");
    expect(screen.queryByRole("form", { name: "Confirm deleting my account" })).toBeNull();
    expect(screen.getByRole("button", { name: "Delete my account" })).toBeTruthy();
    expect(callsTo(spy, "POST /me/delete")).toHaveLength(0);
  });

  it("needs the password to confirm", async () => {
    const spy = await openDelete();
    const input = screen.getByLabelText("Type your password to confirm") as HTMLInputElement;
    expect(input.required).toBe(true);
    expect(input.type).toBe("password");
    expect(callsTo(spy, "POST /me/delete")).toHaveLength(0);
  });

  it("deletes, goes back to the start, and tells the person it is done", async () => {
    const spy = await openDelete();
    fill("Type your password to confirm", "the right password 1");
    tap("Delete everything");
    expect(await screen.findByText("Your account and data have been deleted.")).toBeTruthy();
    expect(body(spy, "POST /me/delete")).toEqual({ password: "the right password 1" });
    expect(screen.getByRole("button", { name: "Get started" })).toBeTruthy(); // they can start again
    expect(text()).not.toMatch(USER.email);
  });

  it("forgets everything about the person on this device", async () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ enabled: true, time: "20:00", asked: true }));
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ usual_stress: 4 }));
    localStorage.setItem(WATCH_KEY, JSON.stringify({ connected: true }));
    (globalThis as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true };
    await openDelete();
    phone.cancel.mockClear();
    fill("Type your password to confirm", "the right password 1");
    tap("Delete everything");
    await screen.findByText("Your account and data have been deleted.");
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(PREFS_KEY)).toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(localStorage.getItem(WATCH_KEY)).toBeNull();
    // Every scheduled reminder is cancelled, so none can fire for a person who no longer has an account.
    expect(phone.cancel.mock.calls.flatMap((c) => c[0].notifications.map((n: { id: number }) => n.id))).toEqual(ALL_IDS);
  });

  it("a wrong password shows the message, deletes nothing here and does not sign the person out", async () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ enabled: true, time: "20:00", asked: true }));
    await openDelete({ "POST /me/delete": { status: 403, body: { detail: "That password is not right." } } });
    fill("Type your password to confirm", "not the password");
    tap("Delete everything");
    expect((await screen.findByRole("alert")).textContent).toBe("That password is not right.");
    expect(screen.getByRole("form", { name: "Confirm deleting my account" })).toBeTruthy();
    expect(localStorage.getItem(TOKEN_KEY)).toBe("saved-token");
    expect(localStorage.getItem(PREFS_KEY)).not.toBeNull();
    expect(screen.queryByText("Your account and data have been deleted.")).toBeNull();
  });

  it("says how long to wait after too many wrong passwords", async () => {
    await openDelete({
      "POST /me/delete": { status: 429, body: { detail: "Too many." }, headers: { "Retry-After": "600" } },
    });
    fill("Type your password to confirm", "not the password");
    tap("Delete everything");
    expect((await screen.findByRole("alert")).textContent).toBe("Too many failed attempts. Try again in about 10 minutes.");
  });

  it("if the server cannot be reached, nothing is forgotten and the person is told", async () => {
    await openDelete({ "POST /me/delete": "network-error" });
    fill("Type your password to confirm", "the right password 1");
    tap("Delete everything");
    expect((await screen.findByRole("alert")).textContent).toMatch(/Cannot connect/);
    expect(localStorage.getItem(TOKEN_KEY)).toBe("saved-token");
    expect(screen.queryByText("Your account and data have been deleted.")).toBeNull();
    await waitFor(() => expect(screen.getByRole("button", { name: "Delete everything" }).hasAttribute("disabled")).toBe(false));
  });
});

describe("the Account screen in general", () => {
  it("shows who is signed in, and goes back to Home", async () => {
    await openAccount();
    expect(text()).toMatch(USER.email);
    tap("Back");
    expect(await screen.findByText("5 of 30 check-ins")).toBeTruthy();
  });

  it("an expired session returns to sign-in", async () => {
    await openAccount({ "GET /me/export": { status: 401, body: { detail: "expired" } } });
    tap("Show my data");
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});
