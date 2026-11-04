import type { HealthFitnessPlugin } from "@capacitor/health-fitness";
import { api } from "./api";
import { localDate, utcOffsetMinutes } from "./checkinWords";
import { isNativeApp } from "./platform";

/**
 * Watch data (steps, sleep, heart rate) read from Health Connect on the phone and sent to the
 * person's own account. Read only, and only when the app is opened. Anything missing stays empty
 * ("not available"), never zero. A failed read or send is reported and never touches check-ins.
 */

export interface WatchDay {
  date: string;
  steps: number | null;
  sleep_minutes: number | null;
  heart_rate_avg: number | null;
}

export interface SavedWatchDay extends WatchDay {
  updated_at: string;
}

export const READ_DAYS = 7; // today and the 7 days before it are read; the server accepts the same window
const CALL_TIMEOUT_SECONDS = 30;

// The plugin says to ask for permission before any other call, and its reads hang in a fresh
// launch until it has run once. So the permission step always runs first (it is quick once granted).
const PERMISSIONS = ["STEPS", "SLEEP", "HEART_RATE"];

/** The plugin's dates have no milliseconds. */
export const pluginDate = (d: Date) => d.toISOString().split(".")[0] + "Z";

/** A number if there is a real, non-zero reading, otherwise null. Zero is treated as "not recorded". */
function reading(values: unknown): number | null {
  if (!Array.isArray(values)) return null;
  for (const v of values) {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    if (Number.isFinite(n)) return n !== 0 ? n : null;
  }
  return null;
}

interface Block {
  startDate?: unknown;
  values?: unknown;
}

/**
 * One reply, as {date: number}. The reply is {"results":[{"startDate":seconds,"values":[...]}, ...]},
 * one block per day, with "values" empty on a day with nothing. The day is the phone's own date at
 * the middle of the block (start plus 12 hours), which is the right day whether the plugin cuts days
 * at local or at UTC midnight.
 */
export function readingsByDay(reply: string | undefined): Map<string, number> {
  const out = new Map<string, number>();
  if (!reply) return out;
  let parsed: unknown;
  try {
    parsed = JSON.parse(reply);
  } catch {
    return out;
  }
  const blocks = Array.isArray(parsed) ? parsed : (parsed as { results?: unknown })?.results;
  if (!Array.isArray(blocks)) return out;
  for (const block of blocks as Block[]) {
    if (!block || typeof block.startDate !== "number") continue;
    const value = reading(block.values);
    if (value === null) continue;
    out.set(localDate(new Date((block.startDate + 12 * 3600) * 1000)), value);
  }
  return out;
}

/** The days that have at least one reading, oldest first. Whole numbers for steps and sleep. */
export function daysFromReplies(replies: { steps?: string; sleep?: string; heart?: string }): WatchDay[] {
  const steps = readingsByDay(replies.steps);
  const sleep = readingsByDay(replies.sleep);
  const heart = readingsByDay(replies.heart);
  const dates = new Set([...steps.keys(), ...sleep.keys(), ...heart.keys()]);
  return [...dates].sort().map((date) => ({
    date,
    steps: steps.has(date) ? Math.round(steps.get(date)!) : null,
    sleep_minutes: sleep.has(date) ? Math.round(sleep.get(date)!) : null,
    heart_rate_avg: heart.has(date) ? Math.round(heart.get(date)! * 10) / 10 : null,
  }));
}

/** Gives up after CALL_TIMEOUT_SECONDS: the plugin can wait forever on a stuck call. */
function withTimeout<T>(call: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Health Connect did not answer. Please try again.")),
      CALL_TIMEOUT_SECONDS * 1000,
    );
    call.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

type Plugin = Pick<HealthFitnessPlugin, "requestHealthPermissions" | "getData">;

// --- what the person chose, kept on this device, one set per account ----------------------------

export interface WatchPrefs {
  connected: boolean;
}

const prefsKey = (userId: string) => `mindwatch.watch.${userId}`;
const memory = new Map<string, WatchPrefs>();

export function loadWatchPrefs(userId: string): WatchPrefs {
  try {
    const saved = localStorage.getItem(prefsKey(userId));
    return { connected: (saved ? JSON.parse(saved) : {}).connected === true };
  } catch {
    return memory.get(userId) ?? { connected: false };
  }
}

export function saveWatchPrefs(userId: string, prefs: WatchPrefs): void {
  memory.set(userId, prefs);
  try {
    localStorage.setItem(prefsKey(userId), JSON.stringify(prefs));
  } catch {
    // Storage is blocked: this session's copy still works.
  }
}

export function clearWatchPrefs(userId: string): void {
  memory.delete(userId);
  try {
    localStorage.removeItem(prefsKey(userId));
  } catch {
    // Nothing to clear.
  }
}

// --- reading and sending -------------------------------------------------------------------------

export function createWatchService(plugin: Plugin) {
  async function askPermission(): Promise<void> {
    const off = JSON.stringify({ IsActive: false, AccessType: "READ" });
    await withTimeout(
      plugin.requestHealthPermissions({
        customPermissions: JSON.stringify(PERMISSIONS.map((Variable) => ({ Variable, AccessType: "READ" }))),
        allVariables: off,
        fitnessVariables: off,
        healthVariables: off,
        profileVariables: off,
        workoutVariables: off,
      }),
    );
  }

  /**
   * Ask for permission if needed, then read the last days. All three reads must succeed: a partial
   * set would overwrite stored days with blanks, so on any failure nothing is returned at all.
   */
  async function read(now: Date = new Date()): Promise<WatchDay[]> {
    if (!isNativeApp()) throw new Error("Watch data is only available in the Android app.");
    await askPermission();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - READ_DAYS);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const query = (Variable: string, OperationType: "SUM" | "AVERAGE") =>
      withTimeout(
        plugin.getData({
          parameters: JSON.stringify({
            Variable,
            StartDate: pluginDate(start),
            EndDate: pluginDate(end),
            TimeUnit: "DAY",
            OperationType,
            TimeUnitLength: 1,
            AdvancedQueryReturnType: "ALL_DATA",
            AdvancedQueryResultType: "RAW_DATA",
          }),
        }),
      ).then((r) => r.results);
    const [steps, sleep, heart] = await Promise.all([
      query("STEPS", "SUM"),
      query("SLEEP", "SUM"),
      query("HEART_RATE", "AVERAGE"),
    ]);
    return daysFromReplies({ steps, sleep, heart });
  }

  /** Read the watch data and send it to the signed-in person's account. Returns how many days were sent. */
  async function sync(): Promise<number> {
    const days = await read();
    if (days.length === 0) return 0;
    await api("/me/measurements", {
      method: "PUT",
      body: JSON.stringify({ utc_offset_minutes: utcOffsetMinutes(), days }),
    });
    return days.length;
  }

  return { read, sync };
}

export const fetchWatchDays = (limit = 14) => api<{ measurements: SavedWatchDay[] }>(`/me/measurements?limit=${limit}`);
