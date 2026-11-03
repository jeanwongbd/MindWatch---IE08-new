import { api } from "./api";
import { utcOffsetMinutes } from "./checkinWords";

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
}

export interface SavedCheckin {
  date: string;
  stress: number;
  word: string | null;
  updated_at: string;
}

export const fetchSummary = () => api<Summary>(`/me/summary?utc_offset_minutes=${utcOffsetMinutes()}`);

export const fetchCheckins = (limit = 60) => api<{ checkins: SavedCheckin[] }>(`/me/checkins?limit=${limit}`);
