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

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  try {
    const response = await fetch(API_BASE_URL + path, {
      ...options,
      signal: options?.signal ?? AbortSignal.timeout(10000),
      headers: { "Content-Type": "application/json", ...options?.headers },
    });
    if (!response.ok) throw new Error(`Request failed (${response.status}). Please retry.`);
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof TypeError || (error instanceof DOMException && error.name === "TimeoutError")) {
      throw new Error("Cannot connect to MindWatch. Start the backend and try again.");
    }
    throw error;
  }
}

export const number = (v: number | null | undefined) =>
  v == null ? "Unavailable" : Number.isInteger(v) ? String(v) : v.toFixed(1);