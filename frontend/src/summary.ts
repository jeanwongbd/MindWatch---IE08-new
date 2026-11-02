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
