export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");

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