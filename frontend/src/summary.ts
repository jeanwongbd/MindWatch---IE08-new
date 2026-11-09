import { api } from "./api";
import { utcOffsetMinutes } from "./checkinWords";

/** The two-day comparison of how the person says they feel and what their body data shows. */
export interface BodyCheck {
  state: "body_signal_feel_ok" | "feel_stressed_body_usual" | "both";
  /** The 2 consecutive days looked at, oldest first. */
  days: string[];
  stress: number[];
  sleep: { minutes: number | null; manual: string | null; short: boolean; known: boolean }[];
  heart: { usual: number; values: (number | null)[]; high: boolean[] } | null;
  signals: ("short_sleep" | "high_heart_rate")[];
}

/** What /me/summary returns. Every number is the signed-in person's own. */
export interface Summary {
  today: string;
  count: number;
  progress: { done: number; goal: number };
  today_checkin: { stress: number; word: string | null } | null;
  usual: { value: number; based_on: number } | null;
  recent_7d: { value: number; based_on: number; days: number } | null;
  today_vs_usual: { label: "higher" | "about" | "lower" } | null;
  recent_words: { word: string; count: number }[];
  /** The tags picked most often this week, most first (at most 5). Plain counts, no cause implied. */
  recent_energy: { tag: string; count: number }[];
  /** Consecutive days with a check-in. "waiting" means today has no check-in yet but yesterday does. */
  streak: { current: number; best: number; status: "building" | "waiting" | "none" };
  /** True when the most recent check-ins have all been very high, so Home points to support. */
  support_suggested: boolean;
  /** What the Why tab may say. Only a pattern against the person's own usual, never a cause. */
  why: {
    ready: boolean;
    have: number;
    need: number;
    today: "higher" | "about" | "lower" | null;
    week: "higher" | "about" | "lower" | null;
  };
  /** Always null until a personal model has been trained and tested. */
  estimate: null;
  /** How the person feels against what their body shows over 2 days, or null when there is nothing to say. */
  body_check: BodyCheck | null;
}

export interface SavedCheckin {
  date: string;
  stress: number;
  word: string | null;
  energy: string[];
  updated_at: string;
}

export const fetchSummary = () => api<Summary>(`/me/summary?utc_offset_minutes=${utcOffsetMinutes()}`);

export const fetchCheckins = (limit = 60) => api<{ checkins: SavedCheckin[] }>(`/me/checkins?limit=${limit}`);
