import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REMINDER_BODY } from "./reminders";
import { TOKEN_KEY, USER, loadApp, stubBackend, tap, type Routes } from "./test/accountsHelpers";
import type { Summary } from "./summary";

// A stand-in for the phone's notification system.
const phone = vi.hoisted(() => ({
  state: { permission: "prompt" as "granted" | "denied" | "prompt" },
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  createChannel: vi.fn(),
  schedule: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock("@capacitor/local-notifications", () => ({ LocalNotifications: phone }));

const PREFS_KEY = `mindwatch.reminders.${USER.id}`;
const ALL_IDS = Array.from({ length: 14 }, (_, i) => 4100 + i);
const TODAY = "2026-01-15";

const BASE: Summary = {
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
};
const FIRST_DAY: Summary = {
  ...BASE,
  count: 1,
  progress: { done: 1, goal: 30 },
  today_checkin: { stress: 9, word: "Anxious" },
  streak: { current: 1, best: 1, status: "building" },
};
const NOT_YET_TODAY: Summary = { ...FIRST_DAY, today_checkin: null, streak: { current: 1, best: 1, status: "waiting" } };

const onPhone = () => {
  (globalThis as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true };
};

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 0, 15, 12, 0, 0)); // noon, so 8:00 pm is still to come
  phone.state.permission = "prompt";
  phone.checkPermissions.mockImplementation(async () => ({ display: phone.state.permission }));
  phone.requestPermissions.mockImplementation(async () => {
    if (phone.state.permission === "prompt") phone.state.permission = "granted";
    return { display: phone.state.permission };
  });
  phone.createChannel.mockResolvedValue(undefined);
  phone.schedule.mockResolvedValue({});
  phone.cancel.mockResolvedValue(undefined);
  onPhone();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();
  delete (globalThis as { Capacitor?: unknown }).Capacitor;
});

async function openHome(summary: Summary, routes: Routes = {}) {
  localStorage.setItem(TOKEN_KEY, "saved-token");
  const spy = stubBackend({ "GET /auth/me": { body: USER }, "GET /me/summary": { body: summary }, ...routes });
  await loadApp();
  await screen.findByText(`${summary.progress.done} of 30 check-ins`);
  return spy;
}

const text = () => document.body.textContent ?? "";
const idsOf = (calls: { notifications: { id: number }[] }[]) => calls.flatMap((c) => c.notifications.map((n) => n.id));
const lastSchedule = () => phone.schedule.mock.calls.at(-1)![0] as { notifications: Record<string, any>[] };

describe("the offer after the first check-in", () => {
  it("asks_after_first_checkin: not before any check-in, then once after the first", async () => {
    await openHome(BASE);
    expect(screen.queryByRole("group", { name: "Daily reminder" })).toBeNull();
    cleanup();
    vi.resetModules();

    await openHome(FIRST_DAY);
    const offer = screen.getByRole("group", { name: "Daily reminder" });
    expect(within(offer).getByText("Want a daily reminder?")).toBeTruthy();
    expect(offer.textContent).toMatch(/8:00 pm/);
    expect(offer.textContent).toMatch(/never includes any health details/);
  });

  it("'Not now' ends the offer for good, even after reopening the app", async () => {
    await openHome(FIRST_DAY);
    tap("Not now");
    expect(screen.queryByRole("group", { name: "Daily reminder" })).toBeNull();
    expect(JSON.parse(localStorage.getItem(PREFS_KEY)!)).toMatchObject({ asked: true, enabled: false });
    cleanup();
    vi.resetModules();
    await openHome(FIRST_DAY);
    expect(screen.queryByRole("group", { name: "Daily reminder" })).toBeNull();
    expect(phone.schedule).not.toHaveBeenCalled();
    expect(phone.requestPermissions).not.toHaveBeenCalled();
  });

  it("'Yes' asks the phone's permission, schedules the reminders and confirms", async () => {
    await openHome(NOT_YET_TODAY);
    tap("Yes, remind me");
    expect(await screen.findByText("Done. We'll remind you at 8:00 pm if you haven't checked in.")).toBeTruthy();
    expect(phone.requestPermissions).toHaveBeenCalledTimes(1);
    expect(phone.createChannel).toHaveBeenCalledTimes(1);
    expect(idsOf(phone.schedule.mock.calls.map((c) => c[0]))).toEqual(ALL_IDS);
    expect(screen.queryByText("Want a daily reminder?")).toBeNull();
  });

  it("says so kindly when the phone's permission is refused, and schedules nothing", async () => {
    phone.state.permission = "denied";
    await openHome(NOT_YET_TODAY);
    tap("Yes, remind me");
    expect(await screen.findByText(/Notifications are turned off for MindWatch/)).toBeTruthy();
    expect(text()).toMatch(/turn them on in your phone's settings/);
    expect(phone.schedule).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(PREFS_KEY)!)).toMatchObject({ enabled: false, asked: true });
  });
});

describe("the reminders themselves", () => {
  async function enabledHome(summary: Summary, routes: Routes = {}) {
    phone.state.permission = "granted";
    localStorage.setItem(PREFS_KEY, JSON.stringify({ enabled: true, time: "20:00", asked: true }));
    const spy = await openHome(summary, routes);
    await waitFor(() => expect(phone.schedule).toHaveBeenCalled());
    return spy;
  }

  it("opening Home schedules the next 14 days when today is still to do", async () => {
    await enabledHome(NOT_YET_TODAY);
    expect(idsOf(phone.schedule.mock.calls.map((c) => c[0]))).toEqual(ALL_IDS);
  });

  it("skips_today_when_done: today's reminder is left out once today's check-in is done", async () => {
    await enabledHome(FIRST_DAY);
    const ids = idsOf(phone.schedule.mock.calls.map((c) => c[0]));
    expect(ids).toHaveLength(13);
    expect(ids).not.toContain(4100);
  });

  it("saving today's check-in cancels today's reminder and keeps the rest", async () => {
    await enabledHome(NOT_YET_TODAY, {
      [`GET /me/checkins/${TODAY}`]: { status: 404, body: {} },
      [`PUT /me/checkins/${TODAY}`]: { status: 201, body: {} },
    });
    phone.schedule.mockClear();
    tap("Check in today");
    await screen.findByRole("heading", { name: "Daily check-in" });
    await waitFor(() => expect(screen.getByRole("button", { name: "6" }).hasAttribute("disabled")).toBe(false));
    tap("6");
    tap("Save check-in");
    await screen.findByText(/Saved\./);
    await waitFor(() => expect(phone.schedule).toHaveBeenCalled());
    const ids = idsOf(phone.schedule.mock.calls.map((c) => c[0]));
    expect(ids).toHaveLength(13);
    expect(ids).not.toContain(4100);
  });

  it("text_has_no_health_data: even with a stress score and a word saved, the reminder says only the fixed words", async () => {
    await enabledHome(NOT_YET_TODAY);
    for (const n of lastSchedule().notifications) {
      expect(n.title).toBe("MindWatch");
      expect(n.body).toBe(REMINDER_BODY);
      expect(`${n.title} ${n.body}`).not.toMatch(/Anxious|stress|streak|\d/); // the saved 9 and word never appear
      expect(Object.keys(n).sort()).toEqual(["body", "channelId", "id", "isExactNotification", "schedule", "title"]);
    }
  });

  it("uses inexact alarms, so Android never opens 'Alarms & reminders'", async () => {
    await enabledHome(NOT_YET_TODAY);
    for (const n of lastSchedule().notifications) {
      expect(n.isExactNotification).toBe(false);
      expect(n.schedule.allowWhileIdle).toBe(true);
    }
  });

  it("does nothing when reminders are off", async () => {
    phone.state.permission = "granted";
    localStorage.setItem(PREFS_KEY, JSON.stringify({ enabled: false, time: "20:00", asked: true }));
    await openHome(NOT_YET_TODAY);
    expect(phone.schedule).not.toHaveBeenCalled();
    expect(phone.cancel).not.toHaveBeenCalled();
  });
});

describe("the Reminders screen", () => {
  async function openReminders(prefs: object | null = { enabled: true, time: "20:00", asked: true }) {
    phone.state.permission = "granted";
    if (prefs) localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    await openHome(NOT_YET_TODAY);
    phone.schedule.mockClear();
    phone.cancel.mockClear();
    tap("Reminders");
    await screen.findByRole("heading", { name: "Reminders" });
  }

  it("shows the switch and the time, and that it never carries health details", async () => {
    await openReminders();
    expect((screen.getByRole("switch", { name: "Daily reminder" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Reminder time") as HTMLInputElement).value).toBe("20:00");
    expect(text()).toMatch(/never includes any health details/);
    expect(text()).toMatch(/may arrive a little late/);
  });

  it("off_cancels_all: switching off cancels all 14 reminders and says so", async () => {
    await openReminders();
    fireEvent.click(screen.getByRole("switch", { name: "Daily reminder" }));
    expect(await screen.findByText("The daily reminder is off.")).toBeTruthy();
    await waitFor(() => expect(phone.cancel).toHaveBeenCalled());
    expect(idsOf(phone.cancel.mock.calls.map((c) => c[0]))).toEqual(ALL_IDS);
    expect(phone.schedule).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(PREFS_KEY)!).enabled).toBe(false);
  });

  it("switching back on schedules them again", async () => {
    await openReminders({ enabled: false, time: "20:00", asked: true });
    fireEvent.click(screen.getByRole("switch", { name: "Daily reminder" }));
    await waitFor(() => expect(phone.schedule).toHaveBeenCalled());
    expect(idsOf(phone.schedule.mock.calls.map((c) => c[0]))).toEqual(ALL_IDS);
  });

  it("changing the time moves every reminder to the new time", async () => {
    await openReminders();
    fireEvent.change(screen.getByLabelText("Reminder time"), { target: { value: "18:30" } });
    await waitFor(() => expect(phone.schedule).toHaveBeenCalled());
    for (const n of lastSchedule().notifications) {
      const at: Date = n.schedule.at;
      expect([at.getHours(), at.getMinutes()]).toEqual([18, 30]);
    }
    expect(await screen.findByText("Reminder time set to 6:30 pm.")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(PREFS_KEY)!).time).toBe("18:30");
  });

  it("goes back to Home", async () => {
    await openReminders();
    tap("Back");
    expect(await screen.findByText("1 of 30 check-ins")).toBeTruthy();
  });
});

describe("signing out", () => {
  it("cancels every reminder, and keeps the person's choices for next time", async () => {
    phone.state.permission = "granted";
    localStorage.setItem(PREFS_KEY, JSON.stringify({ enabled: true, time: "19:00", asked: true }));
    await openHome(NOT_YET_TODAY, { "POST /auth/logout": { status: 204 } });
    await waitFor(() => expect(phone.schedule).toHaveBeenCalled());
    phone.cancel.mockClear();
    tap("Sign out");
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(idsOf(phone.cancel.mock.calls.map((c) => c[0]))).toEqual(ALL_IDS);
    expect(JSON.parse(localStorage.getItem(PREFS_KEY)!)).toMatchObject({ enabled: true, time: "19:00" });
  });

  it("an expired session cancels them too", async () => {
    phone.state.permission = "granted";
    localStorage.setItem(PREFS_KEY, JSON.stringify({ enabled: true, time: "20:00", asked: true }));
    await openHome(NOT_YET_TODAY, { "GET /me/checkins": { body: { checkins: [] } } });
    await waitFor(() => expect(phone.schedule).toHaveBeenCalled());
    // Home has loaded; from now on the server says the session has expired.
    stubBackend({
      "GET /auth/me": { body: USER },
      "GET /me/summary": { body: NOT_YET_TODAY },
      "GET /me/checkins": { status: 401, body: { detail: "expired" } },
    });
    phone.cancel.mockClear();
    tap("See your trends");
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();
    await waitFor(() => expect(phone.cancel).toHaveBeenCalled());
    expect(idsOf(phone.cancel.mock.calls.map((c) => c[0]))).toEqual(ALL_IDS);
  });
});

describe("on the website, where there are no phone notifications", () => {
  beforeEach(() => {
    delete (globalThis as { Capacitor?: unknown }).Capacitor;
  });

  it("'Yes' explains, keeps the choice, and never touches the phone's notifications", async () => {
    await openHome(NOT_YET_TODAY);
    tap("Yes, remind me");
    expect(await screen.findByText(/Reminders arrive as phone notifications in the Android app/)).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(PREFS_KEY)!)).toMatchObject({ enabled: true, asked: true });
    for (const fn of [phone.checkPermissions, phone.requestPermissions, phone.createChannel, phone.schedule, phone.cancel]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it("shows an in-app prompt once the time has passed with no check-in today", async () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ enabled: true, time: "11:00", asked: true })); // noon is after 11:00
    await openHome(NOT_YET_TODAY);
    expect(screen.getByText("Time for your MindWatch check-in.")).toBeTruthy();
    expect(phone.schedule).not.toHaveBeenCalled();
  });

  it("shows no prompt before the time, once today is done, or when reminders are off", async () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ enabled: true, time: "20:00", asked: true }));
    await openHome(NOT_YET_TODAY); // 8:00 pm has not come yet
    expect(screen.queryByText("Time for your MindWatch check-in.")).toBeNull();
    cleanup();
    vi.resetModules();

    localStorage.setItem(PREFS_KEY, JSON.stringify({ enabled: true, time: "11:00", asked: true }));
    await openHome(FIRST_DAY); // today is done
    expect(screen.queryByText("Time for your MindWatch check-in.")).toBeNull();
    cleanup();
    vi.resetModules();

    localStorage.setItem(PREFS_KEY, JSON.stringify({ enabled: false, time: "11:00", asked: true }));
    await openHome(NOT_YET_TODAY); // reminders are off
    expect(screen.queryByText("Time for your MindWatch check-in.")).toBeNull();
  });

  it("the Reminders screen explains the website case", async () => {
    await openHome(NOT_YET_TODAY);
    tap("Reminders");
    await screen.findByRole("heading", { name: "Reminders" });
    expect(text()).toMatch(/Reminders arrive as phone notifications in the Android app/);
  });
});
