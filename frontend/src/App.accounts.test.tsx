import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN_KEY = "mindwatch.session";
const USER = { id: "u-1", email: "student@example.com" };
const SESSION = { token: "new-token", expires_at: "2026-02-01T00:00:00+00:00", user: USER };

type Reply = { status?: number; body?: unknown; headers?: Record<string, string> } | "network-error";
type Routes = Record<string, Reply>;

/** Answers by "METHOD /path". Anything not listed is a 404, so surprises show up as failures. */
function stubBackend(routes: Routes) {
  const spy = vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "").split("?")[0];
    const reply = routes[`${(init?.method ?? "GET").toUpperCase()} ${path}`];
    if (reply === "network-error") throw new TypeError("Failed to fetch");
    if (!reply) return new Response("{}", { status: 404 });
    const status = reply.status ?? 200;
    const body = status === 204 ? null : JSON.stringify(reply.body ?? {});
    return new Response(body, { status, headers: reply.headers });
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

function callsTo(spy: ReturnType<typeof stubBackend>, key: string) {
  return spy.mock.calls.filter(([url, init]) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "").split("?")[0];
    return `${(init?.method ?? "GET").toUpperCase()} ${path}` === key;
  });
}

async function loadApp(accountsOn = true) {
  if (accountsOn) vi.stubEnv("VITE_ACCOUNTS_ENABLED", "true");
  const { default: App } = await import("./App");
  render(<App />);
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

beforeEach(() => localStorage.clear());

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("account buttons", () => {
  it("are hidden unless accounts are switched on", async () => {
    stubBackend({});
    await loadApp(false);
    expect(screen.getByRole("button", { name: "View demo" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Create account" })).toBeNull();
  });

  it("ignore a saved token when accounts are off", async () => {
    localStorage.setItem(TOKEN_KEY, "old");
    const spy = stubBackend({});
    await loadApp(false);
    expect(screen.getByRole("button", { name: "View demo" })).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("creating an account", () => {
  it("create_account_then_home", async () => {
    const spy = stubBackend({ "POST /auth/signup": { status: 201, body: SESSION } });
    await loadApp();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    fill("Email", USER.email);
    fill("Password", "a long password 1");
    fill("Invite code", "local-code");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText(USER.email)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(localStorage.getItem(TOKEN_KEY)).toBe("new-token");

    const [url, init] = callsTo(spy, "POST /auth/signup")[0];
    expect(String(url)).not.toContain(USER.email); // nothing personal in the address
    expect(JSON.parse(init!.body as string)).toEqual({
      email: USER.email,
      password: "a long password 1",
      invite_code: "local-code",
    });
  });

  it("refuses a short password without calling the server", async () => {
    const spy = stubBackend({});
    await loadApp();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    fill("Email", USER.email);
    fill("Password", "short");
    fill("Invite code", "local-code");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/at least 10 characters/);
    expect(spy).not.toHaveBeenCalled();
  });

  it("shows the server's message for a bad invite code", async () => {
    stubBackend({ "POST /auth/signup": { status: 403, body: { detail: "Invalid invite code." } } });
    await loadApp();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    fill("Email", USER.email);
    fill("Password", "a long password 1");
    fill("Invite code", "wrong");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Invalid invite code.");
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});

describe("signing in", () => {
  async function openSignIn() {
    await loadApp();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  }

  it("goes to Home and keeps the session", async () => {
    stubBackend({ "POST /auth/login": { body: SESSION } });
    await openSignIn();
    fill("Email", USER.email);
    fill("Password", "a long password 1");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText(USER.email)).toBeTruthy();
    expect(localStorage.getItem(TOKEN_KEY)).toBe("new-token");
  });

  it("shows a wrong-password message", async () => {
    stubBackend({ "POST /auth/login": { status: 401, body: { detail: "Wrong email or password." } } });
    await openSignIn();
    fill("Email", USER.email);
    fill("Password", "not the password");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Wrong email or password.");
    expect(screen.queryByText("Your session expired. Please sign in again.")).toBeNull();
  });

  it("shows how long to wait after too many failed attempts", async () => {
    stubBackend({
      "POST /auth/login": {
        status: 429,
        body: { detail: "Too many failed attempts. Try again later." },
        headers: { "Retry-After": "600" },
      },
    });
    await openSignIn();
    fill("Email", USER.email);
    fill("Password", "whatever it is");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Too many failed attempts. Try again in about 10 minutes.",
    );
  });
});

describe("staying signed in", () => {
  it("stays_signed_in_after_reload", async () => {
    localStorage.setItem(TOKEN_KEY, "saved-token");
    const spy = stubBackend({ "GET /auth/me": { body: USER } });
    await loadApp();
    expect(await screen.findByText(USER.email)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
    const [, init] = callsTo(spy, "GET /auth/me")[0];
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer saved-token");
    expect(localStorage.getItem(TOKEN_KEY)).toBe("saved-token");
  });

  it("expired_session_returns_to_sign_in", async () => {
    localStorage.setItem(TOKEN_KEY, "expired-token");
    stubBackend({ "GET /auth/me": { status: 401, body: { detail: "Session expired. Please sign in again." } } });
    await loadApp();
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByText("Your session expired. Please sign in again.")).toBeTruthy();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("a network failure keeps the token and offers a retry instead of signing out", async () => {
    localStorage.setItem(TOKEN_KEY, "saved-token");
    stubBackend({ "GET /auth/me": "network-error" });
    await loadApp();
    expect((await screen.findByRole("alert")).textContent).toMatch(/Cannot connect/);
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Sign in" })).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBe("saved-token");
  });

  it("retry signs in once the server answers", async () => {
    localStorage.setItem(TOKEN_KEY, "saved-token");
    stubBackend({ "GET /auth/me": "network-error" });
    await loadApp();
    await screen.findByRole("button", { name: "Retry" });
    stubBackend({ "GET /auth/me": { body: USER } });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(USER.email)).toBeTruthy();
  });
});

describe("signing out", () => {
  async function signedInApp(routes: Routes) {
    localStorage.setItem(TOKEN_KEY, "saved-token");
    const spy = stubBackend({ "GET /auth/me": { body: USER }, ...routes });
    await loadApp();
    await screen.findByText(USER.email);
    return spy;
  }

  it("ends the session on the server and forgets it here", async () => {
    const spy = await signedInApp({ "POST /auth/logout": { status: 204 } });
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("button", { name: "View demo" })).toBeTruthy();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    const [, init] = callsTo(spy, "POST /auth/logout")[0];
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer saved-token");
  });

  it("forgets the session here even if the server cannot be reached", async () => {
    await signedInApp({ "POST /auth/logout": "network-error" });
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(localStorage.getItem(TOKEN_KEY)).toBeNull());
    expect(await screen.findByRole("button", { name: "View demo" })).toBeTruthy();
  });

  it("a rejected logout does not show the expired-session message", async () => {
    await signedInApp({ "POST /auth/logout": { status: 401, body: { detail: "Not signed in." } } });
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("button", { name: "View demo" })).toBeTruthy();
    expect(screen.queryByText("Your session expired. Please sign in again.")).toBeNull();
  });
});
