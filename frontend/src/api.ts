/** Base URL of the FastAPI backend.
 *
 *  The Android emulator reaches the host machine at the 10.0.2.2 alias rather
 *  than localhost, so resolve per platform instead of hardcoding one. Set
 *  VITE_API_BASE_URL to override, which a real device needs (the host's LAN
 *  IP, not 10.0.2.2) along with any deployed backend.
 */
function resolveApiBaseUrl(): string {
  const override = import.meta.env.VITE_API_BASE_URL;
  if (override) return override.replace(/\/$/, "");

  const capacitor = (globalThis as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  const host = capacitor?.getPlatform?.() === "android" ? "10.0.2.2" : "localhost";
  return `http://${host}:8000`;
}

export const API_BASE_URL = resolveApiBaseUrl();

export type Mode = "historical_replay" | "synthetic_scenario";

export interface DemoRecord {
  user_id: string;
  date: string | null;
  mode: Mode;
  source_label: string;
  scenario_label?: string;
  reported_stress: {
    value: number;
    scale_max: number;
    normalized_0_100: number;
    source: string;
    context_tags?: string[];
  };
  original_reported_stress?: number;
  wearable_estimate: {
    value: number | null;
    scale_max: number;
    status: string;
    method: string;
  };
  comparison: {
    state: string | null;
    label: string;
    description: string;
  };
  measurements: Record<string, number | null>;
  contributors?: {
    feature: string;
    direction: string;
    description: string;
  }[];
  imputed_features: string[];
  limitation: string;
}

export interface DemoConfig {
  profile_id: string;
  default_date: string;
  replay_dates: string[];
  scenarios: { id: string; label: string }[];
  limitation: string;
}

/** Error from api(). `status` is the HTTP status, and is undefined when no response came back. */
export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// A sleeping Render server can take about a minute to wake up.
const TIMEOUT_MS = 70000;
// After this long, screens are told the server is probably waking up.
const SLOW_AFTER_MS = 4000;

let slowRequests = 0;
const slowListeners = new Set<() => void>();

/** True while any request has been waiting longer than SLOW_AFTER_MS. */
export function isServerSlow(): boolean {
  return slowRequests > 0;
}

export function subscribeServerSlow(listener: () => void): () => void {
  slowListeners.add(listener);
  return () => {
    slowListeners.delete(listener);
  };
}

function changeSlowRequests(delta: number) {
  slowRequests += delta;
  slowListeners.forEach((listener) => listener());
}

async function send(path: string, options?: RequestInit): Promise<Response> {
  return fetch(API_BASE_URL + path, {
    ...options,
    signal: options?.signal ?? AbortSignal.timeout(TIMEOUT_MS),
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  let slow = false;
  const timer = setTimeout(() => {
    slow = true;
    changeSlowRequests(1);
  }, SLOW_AFTER_MS);
  try {
    let response: Response;
    try {
      response = await send(path, options);
    } catch (error) {
      // Only reads are retried. A POST is never re-sent automatically, since it may have been saved.
      const isRead = (options?.method ?? "GET").toUpperCase() === "GET";
      if (!(isRead && error instanceof TypeError)) throw error;
      response = await send(path, options);
    }
    if (!response.ok) {
      throw new ApiError(`Request failed (${response.status}). Please retry.`, response.status);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof TypeError || (error instanceof DOMException && error.name === "TimeoutError")) {
      throw new ApiError("Cannot connect to MindWatch. Start the backend and try again.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (slow) changeSlowRequests(-1);
  }
}

export const number = (v: number | null | undefined) =>
  v == null ? "Unavailable" : Number.isInteger(v) ? String(v) : v.toFixed(1);