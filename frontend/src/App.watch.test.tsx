import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOKEN_KEY, USER, callsTo, loadApp, stubBackend, tap, type Routes } from "./test/accountsHelpers";
import { utcOffsetMinutes } from "./checkinWords";
import type { Summary } from "./summary";

// A stand-in for the phone's Health Connect.
const plugin = vi.hoisted(() => ({
  requestHealthPermissions: vi.fn(),
  getData: vi.fn(),
  openHealthConnect: vi.fn(),
}));
vi.mock("@capacitor/health-fitness", () => ({ HealthFitness: plugin }));

const WATCH_KEY = `mindwatch.watch.${USER.id}`;

const BASE: Summary = {
  today: "2026-11-04",
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
  estimate: null,
  body_check: null,
};

const block = (values: unknown[]) => {
  const start = new Date(2026, 10, 3).getTime() / 1000;
  return JSON.stringify({ resultDataPoints: [], results: [{ block: 0, startDate: start, endDate: start + 86400, values }] });
};
const REPLIES: Record<string, string> = { STEPS: block([8357]), SLEEP: block([435]), HEART_RATE: block([68]) };

const WITH_WATCH = { "GET /me/checkins/setup": { body: { asks_sleep_activity: false, wears_watch: true } } };
const NO_WATCH = { "GET /me/checkins/setup": { body: { asks_sleep_activity: true, wears_watch: false } } };
const day = (over = {}) => ({
  date: "2026-11-03",
  steps: 8357,
  sleep_minutes: 435,
  heart_rate_avg: 68,
  updated_at: "2026-11-04T01:00:00+00:00",
  ...over,
});
const saved = (...days: object[]) => ({ "GET /me/measurements": { body: { measurements: days } } });
const SENDS = { "PUT /me/measurements": { body: { saved: 1 } } };

beforeEach(() => {
  localStorage.clear();
  (globalThis as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true };
  plugin.requestHealthPermissions.mockResolvedValue(undefined);
  plugin.getData.mockImplementation(async ({ parameters }: { parameters: string }) => ({
    results: REPLIES[JSON.parse(parameters).Variable],
  }));
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

async function openHome(routes: Routes = {}, summary: Summary = BASE) {
  localStorage.setItem(TOKEN_KEY, "saved-token");
  const spy = stubBackend({ "GET /auth/me": { body: USER }, "GET /me/summary": { body: summary }, ...routes });
  await loadApp();
  await screen.findByText(`${summary.progress.done} of 30 check-ins`);
  return spy;
}

const openConnect = async () => fireEvent.click(await screen.findByRole("button", { name: "Connect your watch data" }));
const connect = () => localStorage.setItem(WATCH_KEY, JSON.stringify({ connected: true }));
const text = () => document.body.textContent ?? "";
const card = () => screen.getByRole("group", { name: "Your watch data" });
const putBody = (spy: ReturnType<typeof stubBackend>) => JSON.parse(callsTo(spy, "PUT /me/measurements")[0][1]!.body as string);

describe("who is offered the watch data", () => {
  it("the website never reads the watch, even for people with saved data", async () => {
    delete (globalThis as { Capacitor?: unknown }).Capacitor;
    connect();
    await openHome({ ...WITH_WATCH, ...saved(day()) });
    await screen.findByText(/Synced from the MindWatch Android app\./);
    expect(plugin.getData).not.toHaveBeenCalled();
    expect(plugin.requestHealthPermissions).not.toHaveBeenCalled();
  });

  it("people who said they have no watch are not offered it, and nothing is read", async () => {
    connect();
    await openHome({ ...NO_WATCH, ...saved(day()) });
    await waitFor(() => expect(plugin.getData).not.toHaveBeenCalled());
    expect(screen.queryByRole("group", { name: "Your watch data" })).toBeNull();
  });

  it("if the server can't say, nothing is shown", async () => {
    connect();
    await openHome({ "GET /me/checkins/setup": { status: 500, body: { detail: "oops" } } });
    expect(screen.queryByRole("group", { name: "Your watch data" })).toBeNull();
    expect(plugin.getData).not.toHaveBeenCalled();
  });

  it("people with a watch are offered it, and nothing is read until they say yes", async () => {
    const spy = await openHome({ ...WITH_WATCH });
    expect(await screen.findByRole("button", { name: "Connect your watch data" })).toBeTruthy();
    expect(plugin.requestHealthPermissions).not.toHaveBeenCalled();
    expect(plugin.getData).not.toHaveBeenCalled();
    expect(callsTo(spy, "PUT /me/measurements")).toHaveLength(0);
  });
});

describe("connecting", () => {
  it("asks Health Connect, then switches on, and remembers it", async () => {
    await openHome({ ...WITH_WATCH, ...saved(day()), ...SENDS });
    await openConnect();
    await screen.findByRole("heading", { name: "Your watch data" });
    expect(text()).toMatch(/steps, your sleep and your heart rate/);
    tap("Connect");
    expect(await screen.findByText(/Connected\. Your watch data will be added when you open the app\./)).toBeTruthy();
    expect(plugin.requestHealthPermissions).toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(WATCH_KEY)!)).toEqual({ connected: true });
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeTruthy();
  });

  it("if Health Connect says no, it stays off and says what to check", async () => {
    plugin.requestHealthPermissions.mockRejectedValue(new Error("Permission was not granted."));
    await openHome({ ...WITH_WATCH });
    await openConnect();
    tap("Connect");
    expect((await screen.findByRole("alert")).textContent).toMatch(/Permission was not granted\..*Health Connect is installed/);
    expect(localStorage.getItem(WATCH_KEY)).toBeNull();
    expect(plugin.getData).not.toHaveBeenCalled();
  });

  it("disconnecting stops everything", async () => {
    connect();
    await openHome({ ...WITH_WATCH, ...saved(day()), ...SENDS });
    fireEvent.click(await screen.findByRole("button", { name: "Manage" }));
    tap("Disconnect");
    expect(await screen.findByText(/Disconnected\. Nothing more will be read\./)).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(WATCH_KEY)!)).toEqual({ connected: false });
    plugin.getData.mockClear();
    tap("Back");
    await screen.findByText("5 of 30 check-ins");
    expect(await screen.findByRole("button", { name: "Connect your watch data" })).toBeTruthy();
    expect(plugin.getData).not.toHaveBeenCalled();
  });
});

describe("the watch data on Home", () => {
  it("sends the last days to the person's own account when Home opens, and shows the latest", async () => {
    connect();
    const spy = await openHome({ ...WITH_WATCH, ...saved(day()), ...SENDS });
    await waitFor(() => expect(callsTo(spy, "PUT /me/measurements")).toHaveLength(1));
    expect(putBody(spy)).toEqual({
      utc_offset_minutes: utcOffsetMinutes(),
      days: [{ date: "2026-11-03", steps: 8357, sleep_minutes: 435, heart_rate_avg: 68 }],
    });
    // The request names no user: the server knows who it is from the sign-in.
    expect(JSON.stringify(putBody(spy))).not.toMatch(/user|email|u-1/);
    const [, init] = callsTo(spy, "PUT /me/measurements")[0];
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer saved-token");
    await waitFor(() => expect(card().textContent).toMatch(/Steps: 8,357/));
    expect(card().textContent).toMatch(/Sleep: 7 h 15 min/);
    expect(card().textContent).toMatch(/Heart rate: 68 beats a minute on average/);
    expect(card().textContent).toMatch(/Tue, 3 Nov|Tue 3 Nov|3 Nov/);
  });

  it("missing_watch_data_shows_not_available: a missing value says so, and is never shown as zero", async () => {
    connect();
    await openHome({ ...WITH_WATCH, ...saved(day({ sleep_minutes: null, heart_rate_avg: null })), ...SENDS });
    await waitFor(() => expect(card().textContent).toMatch(/Steps: 8,357/));
    expect(card().textContent).toMatch(/Sleep: not available/);
    expect(card().textContent).toMatch(/Heart rate: not available/);
    expect(card().textContent).not.toMatch(/Sleep: 0|Heart rate: 0|0 min/);
  });

  it("shows the newest day that has anything, skipping empty ones", async () => {
    connect();
    const empty = day({ date: "2026-11-04", steps: null, sleep_minutes: null, heart_rate_avg: null });
    await openHome({ ...WITH_WATCH, ...saved(empty, day()), ...SENDS });
    await waitFor(() => expect(card().textContent).toMatch(/Steps: 8,357/));
  });

  it("with nothing recorded yet it says so kindly", async () => {
    connect();
    plugin.getData.mockResolvedValue({ results: JSON.stringify({ results: [] }) });
    const spy = await openHome({ ...WITH_WATCH, ...saved(), ...SENDS });
    expect(await screen.findByText(/No watch data yet\. Open the Fitbit app so your watch can sync/)).toBeTruthy();
    expect(callsTo(spy, "PUT /me/measurements")).toHaveLength(0); // nothing to send
  });

  it("does not resend each time Home is opened within a few minutes", async () => {
    connect();
    const spy = await openHome({ ...WITH_WATCH, ...saved(day()), ...SENDS });
    await waitFor(() => expect(callsTo(spy, "PUT /me/measurements")).toHaveLength(1));
    tap("Why?");
    await screen.findByRole("heading", { name: "Why?" });
    tap("Back");
    await screen.findByText("5 of 30 check-ins");
    await waitFor(() => expect(card().textContent).toMatch(/Steps: 8,357/));
    expect(callsTo(spy, "PUT /me/measurements")).toHaveLength(1);
    expect(plugin.getData).toHaveBeenCalledTimes(3); // one read of each, once
  });

  it("never states a cause", async () => {
    connect();
    await openHome({ ...WITH_WATCH, ...saved(day()), ...SENDS });
    await waitFor(() => expect(card().textContent).toMatch(/Steps/));
    expect(text()).not.toMatch(/because|caused|due to|reason|leads to|triggered/i);
  });
});

describe("sync_failure_keeps_checkin", () => {
  it("if reading the watch fails, Home says so calmly and everything else carries on", async () => {
    connect();
    plugin.getData.mockRejectedValue(new Error("Health Connect is not responding"));
    const spy = await openHome({ ...WITH_WATCH, ...saved(day()) });
    expect(await screen.findByText(/Couldn't read your watch data just now\. Your check-ins aren't affected\./)).toBeTruthy();
    expect(callsTo(spy, "PUT /me/measurements")).toHaveLength(0); // a failed read sends nothing at all
    // What was already saved is still shown, and the check-in button still works.
    await waitFor(() => expect(card().textContent).toMatch(/Steps: 8,357/));
    expect(screen.getByText("5 of 30 check-ins")).toBeTruthy();
    tap("Change today's check-in");
    expect(await screen.findByRole("heading", { name: "Daily check-in" })).toBeTruthy();
  });

  it("if the server rejects the send, the check-in screen and saving are not touched", async () => {
    connect();
    const spy = await openHome(
      {
        ...WITH_WATCH,
        ...saved(),
        "PUT /me/measurements": { status: 500, body: { detail: "oops" } },
        "GET /me/checkins/2026-11-04": { body: { date: "2026-11-04", stress: 4, word: "Calm" } },
        "PUT /me/checkins/2026-11-04": { status: 200, body: {} },
      },
      BASE,
    );
    expect(await screen.findByText(/Couldn't read your watch data just now/)).toBeTruthy();
    expect(callsTo(spy, "PUT /me/measurements")).toHaveLength(1);
    tap("Change today's check-in");
    await screen.findByRole("heading", { name: "Daily check-in" });
    expect(screen.getByRole("button", { name: "Save check-in" })).toBeTruthy();
  });

  it("the check-in screen itself never reads the watch", async () => {
    connect();
    await openHome({ ...WITH_WATCH, ...saved(day()), ...SENDS });
    await waitFor(() => expect(plugin.getData).toHaveBeenCalledTimes(3));
    plugin.getData.mockClear();
    plugin.requestHealthPermissions.mockClear();
    tap("Change today's check-in");
    await screen.findByRole("heading", { name: "Daily check-in" });
    expect(plugin.getData).not.toHaveBeenCalled();
    expect(plugin.requestHealthPermissions).not.toHaveBeenCalled();
  });
});

describe("the watch card on the website", () => {
  const web = () => delete (globalThis as { Capacitor?: unknown }).Capacitor;

  it("web_shows_saved_watch_data", async () => {
    web();
    const spy = await openHome({ ...WITH_WATCH, ...saved(day()) });
    await waitFor(() => expect(card().textContent).toMatch(/Steps: 8,357/));
    expect(card().textContent).toMatch(/Sleep: 7 h 15 min/);
    expect(card().textContent).toMatch(/Heart rate: 68 beats a minute on average/);
    expect(card().textContent).toMatch(/3 Nov/);
    expect(card().textContent).toMatch(/Synced from the MindWatch Android app\./);
    expect(callsTo(spy, "PUT /me/measurements")).toHaveLength(0);
  });

  it("web_sample_says_its_watch_data_is_from_the_study", async () => {
    web();
    await openHome({ ...WITH_WATCH, ...saved(day()), "GET /auth/me": { body: { ...USER, is_sample: true } } });
    await waitFor(() => expect(card().textContent).toMatch(/Sample data from the study\./));
    expect(card().textContent).not.toMatch(/Android app/);
  });

  it("web_never_offers_connect", async () => {
    web();
    await openHome({ ...WITH_WATCH, ...saved(day()) });
    await waitFor(() => expect(card().textContent).toMatch(/Steps/));
    expect(text()).not.toMatch(/Connect your watch data|Checking your watch|Couldn't read your watch/);
    expect(screen.queryByRole("button", { name: "Manage" })).toBeNull();
    web();
    cleanup();
    await openHome({ ...WITH_WATCH, ...saved() });
    expect(screen.queryByRole("button", { name: "Connect your watch data" })).toBeNull();
  });

  it("web_hides_card_without_data", async () => {
    web();
    const empty = day({ steps: null, sleep_minutes: null, heart_rate_avg: null });
    const spy = await openHome({ ...WITH_WATCH, ...saved(empty) });
    await waitFor(() => expect(callsTo(spy, "GET /me/measurements")).toHaveLength(1));
    expect(screen.queryByRole("group", { name: "Your watch data" })).toBeNull();
  });

  it("web_hides_card_for_non_watch_users", async () => {
    web();
    const spy = await openHome({ ...NO_WATCH, ...saved(day()) });
    await waitFor(() => expect(callsTo(spy, "GET /me/checkins/setup")).toHaveLength(1));
    expect(callsTo(spy, "GET /me/measurements")).toHaveLength(0);
    expect(screen.queryByRole("group", { name: "Your watch data" })).toBeNull();
  });

  it("web_never_calls_the_plugin", async () => {
    web();
    connect();
    await openHome({ ...WITH_WATCH, ...saved(day()) });
    await waitFor(() => expect(card().textContent).toMatch(/Steps/));
    expect(plugin.getData).not.toHaveBeenCalled();
    expect(plugin.requestHealthPermissions).not.toHaveBeenCalled();
    expect(plugin.openHealthConnect).not.toHaveBeenCalled();
  });

  it("native_behaviour_unchanged", async () => {
    const spy = await openHome({ ...WITH_WATCH });
    expect(await screen.findByRole("button", { name: "Connect your watch data" })).toBeTruthy();
    expect(text()).not.toMatch(/Synced from the MindWatch Android app/);
    expect(callsTo(spy, "GET /me/measurements")).toHaveLength(0);
  });
});
