import { isNativeApp } from "./platform";

/**
 * Daily check-in reminders, scheduled on the phone with local notifications. No server is involved.
 *
 * - A reminder is scheduled for each of the next 14 days, so they stop on their own if the app is
 *   not opened again.
 * - Today's is skipped if today's check-in is done or the time has already passed.
 * - The text is fixed and neutral because it can show on a lock screen: no stress, word, streak or
 *   count, ever.
 * - Reminders are inexact (Android may deliver them a little late), so no exact-alarm permission is used.
 */
export const REMINDER_TITLE = "MindWatch";
export const REMINDER_BODY = "Time for your MindWatch check-in.";
export const DAYS_AHEAD = 14;
export const DEFAULT_TIME = "20:00";
export const CHANNEL_ID = "daily-checkin";
// Our notification ids are ID_BASE .. ID_BASE + DAYS_AHEAD - 1, so we can cancel exactly ours.
const ID_BASE = 4100;
const ALL_IDS = Array.from({ length: DAYS_AHEAD }, (_, i) => ID_BASE + i);

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isValidTime = (time: string) => TIME_PATTERN.test(time);

/** "20:00" as it reads on the clock, for example "8:00 pm". */
export function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

// --- what the person chose, kept on this device, one set per account ----------------------------

export interface ReminderPrefs {
  enabled: boolean;
  time: string;
  /** Whether the offer after the first check-in has been answered (yes or not now). */
  asked: boolean;
}

const DEFAULT_PREFS: ReminderPrefs = { enabled: false, time: DEFAULT_TIME, asked: false };
const prefsKey = (userId: string) => `mindwatch.reminders.${userId}`;
const memory = new Map<string, ReminderPrefs>();

export function loadPrefs(userId: string): ReminderPrefs {
  let raw: unknown;
  try {
    const saved = localStorage.getItem(prefsKey(userId));
    raw = saved ? JSON.parse(saved) : undefined;
  } catch {
    // Storage is blocked or damaged: fall back to this session's copy, then the defaults.
    raw = memory.get(userId);
  }
  const saved = (raw ?? {}) as Partial<ReminderPrefs>;
  return {
    enabled: saved.enabled === true,
    time: typeof saved.time === "string" && isValidTime(saved.time) ? saved.time : DEFAULT_TIME,
    asked: saved.asked === true,
  };
}

export function savePrefs(userId: string, prefs: ReminderPrefs): void {
  memory.set(userId, prefs);
  try {
    localStorage.setItem(prefsKey(userId), JSON.stringify(prefs));
  } catch {
    // Blocked storage: the choice lasts until the page closes.
  }
}

export { DEFAULT_PREFS };

// --- the plan: which reminders should exist right now --------------------------------------------

export interface PlannedReminder {
  id: number;
  at: Date;
}

/** The reminders to schedule, soonest first: at most one a day for the next 14 days. */
export function planReminders(opts: { now: Date; time: string; todayDone: boolean }): PlannedReminder[] {
  const [hour, minute] = opts.time.split(":").map(Number);
  const planned: PlannedReminder[] = [];
  for (let i = 0; i < DAYS_AHEAD; i++) {
    if (i === 0 && opts.todayDone) continue;
    const at = new Date(opts.now.getFullYear(), opts.now.getMonth(), opts.now.getDate() + i, hour, minute, 0, 0);
    if (at.getTime() <= opts.now.getTime()) continue; // a time that has already passed
    planned.push({ id: ID_BASE + i, at });
  }
  return planned;
}

// --- the service: talks to the phone's notification system ---------------------------------------

type PermissionState = "granted" | "denied" | "prompt" | "prompt-with-rationale";

/** The parts of the Capacitor plugin we use. The real plugin fits this, and so does a test double. */
export interface Notifier {
  checkPermissions(): Promise<{ display: PermissionState }>;
  requestPermissions(): Promise<{ display: PermissionState }>;
  createChannel(channel: { id: string; name: string; description: string; importance: 1 | 2 | 3 | 4 | 5 }): Promise<void>;
  schedule(options: { notifications: object[] }): Promise<unknown>;
  cancel(options: { notifications: { id: number }[] }): Promise<void>;
}

export type EnableResult = "enabled" | "denied" | "web";

export function createReminderService(notifier: Notifier, clock: () => Date = () => new Date()) {
  // Whether today's check-in is done, as last reported by Home or the check-in screen.
  let todayDone = false;

  async function cancelAll(): Promise<void> {
    if (!isNativeApp()) return;
    await notifier.cancel({ notifications: ALL_IDS.map((id) => ({ id })) });
  }

  /** Make the phone's schedule match the saved choice. Safe to call as often as needed. */
  async function sync(userId: string): Promise<"scheduled" | "off" | "denied" | "web"> {
    const prefs = loadPrefs(userId);
    if (!isNativeApp()) return "web";
    if (!prefs.enabled) return "off";
    const permission = await notifier.checkPermissions();
    if (permission.display !== "granted") return "denied";
    await cancelAll(); // replace whatever was scheduled before
    const planned = planReminders({ now: clock(), time: prefs.time, todayDone });
    if (planned.length > 0) {
      await notifier.schedule({
        notifications: planned.map((p) => ({
          id: p.id,
          title: REMINDER_TITLE,
          body: REMINDER_BODY,
          channelId: CHANNEL_ID,
          schedule: { at: p.at, allowWhileIdle: true },
          // Inexact on purpose: the plugin otherwise sends people to the "Alarms & reminders" settings.
          isExactNotification: false,
        })),
      });
    }
    return "scheduled";
  }

  async function enable(userId: string, time?: string): Promise<EnableResult> {
    const prefs = loadPrefs(userId);
    const chosen = time && isValidTime(time) ? time : prefs.time;
    if (!isNativeApp()) {
      // The website cannot send notifications. The choice is kept so Home can show a prompt instead.
      savePrefs(userId, { enabled: true, time: chosen, asked: true });
      return "web";
    }
    let permission = await notifier.checkPermissions();
    if (permission.display !== "granted") permission = await notifier.requestPermissions();
    if (permission.display !== "granted") {
      savePrefs(userId, { enabled: false, time: chosen, asked: true });
      return "denied";
    }
    await notifier.createChannel({
      id: CHANNEL_ID,
      name: "Daily check-in reminder",
      description: "A reminder to check in. It never includes any health details.",
      importance: 3,
    });
    savePrefs(userId, { enabled: true, time: chosen, asked: true });
    await sync(userId);
    return "enabled";
  }

  async function disable(userId: string): Promise<void> {
    savePrefs(userId, { ...loadPrefs(userId), enabled: false, asked: true });
    await cancelAll();
  }

  async function setTime(userId: string, time: string): Promise<void> {
    if (!isValidTime(time)) return;
    savePrefs(userId, { ...loadPrefs(userId), time });
    await sync(userId);
  }

  /** The person said no to the offer. It is not asked again. */
  function decline(userId: string): void {
    savePrefs(userId, { ...loadPrefs(userId), asked: true });
  }

  function setTodayDone(done: boolean): void {
    todayDone = done;
  }

  return { sync, enable, disable, setTime, decline, cancelAll, setTodayDone };
}

// What the person is told when something does not go to plan. Kept here so every screen says the same.
export const DENIED_MESSAGE =
  "Notifications are turned off for MindWatch. You can turn them on in your phone's settings.";
export const WEB_MESSAGE =
  "Reminders arrive as phone notifications in the Android app. On the website you'll see a prompt on Home instead.";
export const FAILED_MESSAGE = "Couldn't set up the reminder just now. You can try again from Reminders.";

/** Forget this person's saved reminder choices on this phone, for example after their account is deleted. */
export function clearPrefs(userId: string): void {
  memory.delete(userId);
  try {
    localStorage.removeItem(prefsKey(userId));
  } catch {
    // Nothing stored to clear.
  }
}
