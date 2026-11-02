import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

export const TOKEN_KEY = "mindwatch.session";
export const DRAFT_KEY = "mindwatch.onboarding";
export const USER = { id: "u-1", email: "student@example.com" };
export const SESSION = { token: "new-token", expires_at: "2026-02-01T00:00:00+00:00", user: USER };

/** The answers the helpers below tap, in question order. */
export const TAPPED_ANSWERS = {
  usual_stress: 4,
  sleep_hours: "6_7",
  sleep_quality: "fair",
  activity: "lightly_active",
  wears_watch: "yes",
  stress_time: "evening",
};
const TAPS = ["4", "6 to 7", "Fair", "Lightly active", "Yes", "Evening"];

export type Reply = { status?: number; body?: unknown; headers?: Record<string, string> } | "network-error";
export type Routes = Record<string, Reply>;

const keyOf = (url: unknown, init?: RequestInit) =>
  `${(init?.method ?? "GET").toUpperCase()} ${String(url).replace(/^https?:\/\/[^/]+/, "").split("?")[0]}`;

/** Answers by "METHOD /path". Anything not listed is a 404, so surprises show up as failures. */
export function stubBackend(routes: Routes) {
  const spy = vi.fn(async (url: string, init?: RequestInit) => {
    const reply = routes[keyOf(url, init)];
    if (reply === "network-error") throw new TypeError("Failed to fetch");
    if (!reply) return new Response("{}", { status: 404 });
    const status = reply.status ?? 200;
    const body = status === 204 ? null : JSON.stringify(reply.body ?? {});
    return new Response(body, { status, headers: reply.headers });
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

export function callsTo(spy: ReturnType<typeof stubBackend>, key: string) {
  return spy.mock.calls.filter(([url, init]) => keyOf(url, init) === key);
}

export async function loadApp(accountsOn = true) {
  if (accountsOn) vi.stubEnv("VITE_ACCOUNTS_ENABLED", "true");
  const { default: App } = await import("../App");
  return render(<App />);
}

export function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

export function tap(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}

/** Answers the first `count` questions (all six by default), pressing Next after each. */
export function answerQuestions(count = TAPS.length) {
  for (let i = 0; i < count; i++) {
    tap(TAPS[i]);
    tap(i === TAPS.length - 1 ? "Continue" : "Next");
  }
}

export function agreeToConsent() {
  fireEvent.click(screen.getByLabelText("I am 18 or over."));
  fireEvent.click(screen.getByLabelText("I have read this and agree."));
  tap("Continue");
}

/** From the Welcome screen to the account form: questions, then consent. */
export function reachAccountForm() {
  tap("Get started");
  answerQuestions();
  agreeToConsent();
}
