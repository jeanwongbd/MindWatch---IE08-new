import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHANNEL_ID,
  DEFAULT_TIME,
  REMINDER_BODY,
  REMINDER_TITLE,
  createReminderService,
  formatTime,
  isValidTime,
  loadPrefs,
  planReminders,
  savePrefs,
  type Notifier,
} from "./reminders";

const local = (y: number, m: number, d: number, h = 0, min = 0, s = 0, ms = 0) => new Date(y, m - 1, d, h, min, s, ms);
const NOON = local(2026, 1, 15, 12, 0); // 15 January 2026, 12:00 on the phone's clock
const ALL_IDS = Array.from({ length: 14 }, (_, i) => 4100 + i);

beforeEach(() => localStorage.clear());
afterEach(() => {
  localStorage.clear();
  delete (globalThis as { Capacitor?: unknown }).Capacitor;
});

describe("which reminders are planned", () => {
  it("is one a day for the next 14 days, at the chosen time", () => {
    const plan = planReminders({ now: NOON, time: "20:00", todayDone: false });
    expect(plan).toHaveLength(14);
    expect(plan[0].at).toEqual(local(2026, 1, 15, 20, 0));
    expect(plan[13].at).toEqual(local(2026, 1, 28, 20, 0));
    for (const p of plan) expect([p.at.getHours(), p.at.getMinutes(), p.at.getSeconds()]).toEqual([20, 0, 0]);
  });

  it("never plans more than 14, so reminders stop if the app is not opened again", () => {
    for (const todayDone of [false, true]) {
      expect(planReminders({ now: NOON, time: "20:00", todayDone }).length).toBeLessThanOrEqual(14);
    }
    const last = planReminders({ now: NOON, time: "20:00", todayDone: false }).at(-1)!;
    expect(last.at.getTime() - NOON.getTime()).toBeLessThan(14 * 24 * 3600 * 1000);
  });

  it("skips_today_when_done", () => {
    const plan = planReminders({ now: NOON, time: "20:00", todayDone: true });
    expect(plan).toHaveLength(13);
    expect(plan[0].at).toEqual(local(2026, 1, 16, 20, 0));
    expect(plan.map((p) => p.id)).not.toContain(4100);
  });

  it("skips today when the time has already passed, even if today is not done", () => {
    const plan = planReminders({ now: local(2026, 1, 15, 21, 0), time: "20:00", todayDone: false });
    expect(plan).toHaveLength(13);
    expect(plan[0].at).toEqual(local(2026, 1, 16, 20, 0));
  });

  it("skips today when it is exactly the reminder time", () => {
    expect(planReminders({ now: local(2026, 1, 15, 20, 0), time: "20:00", todayDone: false })).toHaveLength(13);
    expect(planReminders({ now: local(2026, 1, 15, 19, 59, 59), time: "20:00", todayDone: false })).toHaveLength(14);
  });

  it("uses a different time when asked", () => {
    const plan = planReminders({ now: NOON, time: "07:30", todayDone: false });
    expect(plan[0].at).toEqual(local(2026, 1, 16, 7, 30)); // 7:30 this morning has passed
    expect(plan).toHaveLength(13);
  });

  it("gives every reminder its own stable id, from 4100", () => {
    const ids = planReminders({ now: NOON, time: "20:00", todayDone: false }).map((p) => p.id);
    expect(ids).toEqual(ALL_IDS);
    expect(new Set(ids).size).toBe(14);
  });

  it("carries on across a month and a year end", () => {
    const plan = planReminders({ now: local(2025, 12, 25, 9, 0), time: "20:00", todayDone: false });
    expect(plan[0].at).toEqual(local(2025, 12, 25, 20, 0));
    expect(plan[7].at).toEqual(local(2026, 1, 1, 20, 0));
    expect(plan[13].at).toEqual(local(2026, 1, 7, 20, 0));
  });
});

describe("times", () => {
  it("reads 24-hour times as a clock does", () => {
    expect(formatTime("20:00")).toBe("8:00 pm");
    expect(formatTime("09:30")).toBe("9:30 am");
    expect(formatTime("00:05")).toBe("12:05 am");
    expect(formatTime("12:00")).toBe("12:00 pm");
    expect(formatTime("23:59")).toBe("11:59 pm");
  });

  it("accepts only real times", () => {
    for (const good of ["00:00", "08:05", "20:00", "23:59"]) expect(isValidTime(good)).toBe(true);
    for (const bad of ["", "24:00", "8:00", "20:60", "20-00", "abc", "20:00:00"]) expect(isValidTime(bad)).toBe(false);
  });
});

describe("what is remembered on the phone", () => {
  it("defaults to off, 8:00 pm and not yet asked", () => {
    expect(loadPrefs("u1")).toEqual({ enabled: false, time: "20:00", asked: false });
    expect(DEFAULT_TIME).toBe("20:00");
  });

  it("is kept per account", () => {
    savePrefs("u1", { enabled: true, time: "07:15", asked: true });
    expect(loadPrefs("u1")).toEqual({ enabled: true, time: "07:15", asked: true });
    expect(loadPrefs("u2")).toEqual({ enabled: false, time: "20:00", asked: false });
  });

  it("ignores damaged or impossible saved values", () => {
    localStorage.setItem("mindwatch.reminders.u3", JSON.stringify({ enabled: "yes", time: "99:99", asked: 1 }));
    expect(loadPrefs("u3")).toEqual({ enabled: false, time: "20:00", asked: false });
    localStorage.setItem("mindwatch.reminders.u4", "{not json");
    expect(loadPrefs("u4")).toEqual({ enabled: false, time: "20:00", asked: false });
  });
});

function fakePhone(permission: "granted" | "denied" | "prompt" = "granted") {
  // Like the real phone: asking while undecided lets the person grant it, and the answer then sticks.
  let current: "granted" | "denied" | "prompt" = permission;
  const notifier = {
    checkPermissions: vi.fn(async () => ({ display: current })),
    requestPermissions: vi.fn(async () => {
      if (current === "prompt") current = "granted";
      return { display: current };
    }),
    createChannel: vi.fn(async () => {}),
    schedule: vi.fn(async (_options: { notifications: object[] }) => ({})),
    cancel: vi.fn(async (_options: { notifications: { id: number }[] }) => {}),
  };
  return notifier as typeof notifier & Notifier;
}

const onPhone = () => {
  (globalThis as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true };
};

describe("the reminder service on the phone", () => {
  beforeEach(onPhone);

  const scheduled = (phone: ReturnType<typeof fakePhone>) =>
    phone.schedule.mock.calls.flatMap(([options]) => options.notifications as Record<string, unknown>[]);

  it("turns on: asks permission, makes the channel, schedules 14 reminders", async () => {
    const phone = fakePhone("prompt");
    const service = createReminderService(phone, () => NOON);
    expect(await service.enable("u1")).toBe("enabled");
    expect(phone.requestPermissions).toHaveBeenCalledTimes(1);
    expect(phone.createChannel).toHaveBeenCalledWith(expect.objectContaining({ id: CHANNEL_ID }));
    expect(scheduled(phone)).toHaveLength(14);
    expect(loadPrefs("u1")).toEqual({ enabled: true, time: "20:00", asked: true });
  });

  it("does not ask again when permission is already granted", async () => {
    const phone = fakePhone("granted");
    await createReminderService(phone, () => NOON).enable("u1");
    expect(phone.requestPermissions).not.toHaveBeenCalled();
  });

  it("text_has_no_health_data: every reminder says only the fixed neutral words", async () => {
    const phone = fakePhone();
    await createReminderService(phone, () => NOON).enable("u1");
    const notifications = scheduled(phone);
    expect(notifications.length).toBeGreaterThan(0);
    for (const n of notifications) {
      expect(n.title).toBe(REMINDER_TITLE);
      expect(n.body).toBe(REMINDER_BODY);
      expect(`${n.title} ${n.body}`).not.toMatch(/\d/); // no numbers: no score, streak or count
      expect(`${n.title} ${n.body}`).not.toMatch(/stress|score|streak|mood|anxious|sad|lonely|tired|word|usual|higher|lower/i);
      // Nothing else that could carry data: no extra payload, no longer text, no attachments.
      expect(Object.keys(n).sort()).toEqual(["body", "channelId", "id", "isExactNotification", "schedule", "title"]);
    }
    expect(REMINDER_BODY).toBe("Time for your MindWatch check-in.");
  });

  it("is inexact, so Android never sends the person to 'Alarms & reminders'", async () => {
    const phone = fakePhone();
    await createReminderService(phone, () => NOON).enable("u1");
    for (const n of scheduled(phone)) {
      expect(n.isExactNotification).toBe(false);
      expect((n.schedule as { allowWhileIdle: boolean }).allowWhileIdle).toBe(true);
    }
  });

  it("off_cancels_all: turning it off cancels every reminder and stops scheduling", async () => {
    const phone = fakePhone();
    const service = createReminderService(phone, () => NOON);
    await service.enable("u1");
    phone.cancel.mockClear();
    await service.disable("u1");
    expect(phone.cancel).toHaveBeenCalledTimes(1);
    expect(phone.cancel.mock.calls[0][0].notifications.map((n: { id: number }) => n.id)).toEqual(ALL_IDS);
    expect(loadPrefs("u1").enabled).toBe(false);
    phone.schedule.mockClear();
    expect(await service.sync("u1")).toBe("off");
    expect(phone.schedule).not.toHaveBeenCalled();
  });

  it("replaces what was scheduled before, so nothing doubles up", async () => {
    const phone = fakePhone();
    const service = createReminderService(phone, () => NOON);
    await service.enable("u1");
    phone.cancel.mockClear();
    phone.schedule.mockClear();
    await service.sync("u1");
    expect(phone.cancel.mock.invocationCallOrder[0]).toBeLessThan(phone.schedule.mock.invocationCallOrder[0]);
  });

  it("skips today's reminder once today's check-in is done, and keeps the other 13", async () => {
    const phone = fakePhone();
    const service = createReminderService(phone, () => NOON);
    await service.enable("u1");
    expect(scheduled(phone).map((n) => n.id)).toContain(4100);
    phone.schedule.mockClear();
    service.setTodayDone(true);
    await service.sync("u1");
    const ids = scheduled(phone).map((n) => n.id);
    expect(ids).toHaveLength(13);
    expect(ids).not.toContain(4100);
  });

  it("moves the reminders when the time changes, and ignores an impossible time", async () => {
    const phone = fakePhone();
    const service = createReminderService(phone, () => NOON);
    await service.enable("u1");
    phone.schedule.mockClear();
    await service.setTime("u1", "18:30");
    const first = scheduled(phone)[0].schedule as { at: Date };
    expect([first.at.getHours(), first.at.getMinutes()]).toEqual([18, 30]);
    expect(loadPrefs("u1").time).toBe("18:30");
    phone.schedule.mockClear();
    await service.setTime("u1", "25:99");
    expect(phone.schedule).not.toHaveBeenCalled();
    expect(loadPrefs("u1").time).toBe("18:30");
  });

  it("when permission is refused: nothing scheduled, and it says so", async () => {
    const phone = fakePhone("denied");
    const service = createReminderService(phone, () => NOON);
    expect(await service.enable("u1")).toBe("denied");
    expect(phone.schedule).not.toHaveBeenCalled();
    expect(loadPrefs("u1")).toEqual({ enabled: false, time: "20:00", asked: true });
  });

  it("does not schedule if permission is taken away later", async () => {
    const phone = fakePhone();
    const service = createReminderService(phone, () => NOON);
    await service.enable("u1");
    phone.schedule.mockClear();
    phone.checkPermissions.mockResolvedValue({ display: "denied" });
    expect(await service.sync("u1")).toBe("denied");
    expect(phone.schedule).not.toHaveBeenCalled();
  });

  it("cancelAll cancels exactly its own 14 ids", async () => {
    const phone = fakePhone();
    await createReminderService(phone, () => NOON).cancelAll();
    expect(phone.cancel.mock.calls[0][0].notifications.map((n: { id: number }) => n.id)).toEqual(ALL_IDS);
  });

  it("does not offer again once answered, and declining keeps it off", async () => {
    const phone = fakePhone();
    const service = createReminderService(phone, () => NOON);
    service.decline("u1");
    expect(loadPrefs("u1")).toEqual({ enabled: false, time: "20:00", asked: true });
    expect(await service.sync("u1")).toBe("off");
    expect(phone.schedule).not.toHaveBeenCalled();
  });
});

describe("the reminder service on the website", () => {
  it("never touches the phone's notifications", async () => {
    const phone = fakePhone();
    const service = createReminderService(phone, () => NOON);
    expect(await service.enable("u1")).toBe("web");
    expect(await service.sync("u1")).toBe("web");
    await service.disable("u1");
    await service.cancelAll();
    await service.setTime("u1", "19:00");
    for (const fn of Object.values(phone)) expect(fn).not.toHaveBeenCalled();
  });

  it("still remembers the choice, so Home can show an in-app prompt", async () => {
    const service = createReminderService(fakePhone(), () => NOON);
    await service.enable("u1", "19:00");
    expect(loadPrefs("u1")).toEqual({ enabled: true, time: "19:00", asked: true });
  });
});
