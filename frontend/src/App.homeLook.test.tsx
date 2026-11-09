import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOKEN_KEY, USER, loadApp, stubBackend, type Routes } from "./test/accountsHelpers";
import { energyChip } from "./chips";
import type { Summary } from "./summary";

const SUMMARY: Summary = {
  today: "2026-01-15",
  count: 12,
  progress: { done: 12, goal: 30 },
  today_checkin: { stress: 6, word: "Tired" },
  usual: { value: 4.3, based_on: 12 },
  recent_7d: { value: 5, based_on: 5, days: 7 },
  today_vs_usual: { label: "higher" },
  recent_words: [{ word: "Tired", count: 3 }],
  recent_energy: [{ tag: "Exams", count: 2 }],
  streak: { current: 12, best: 14, status: "building" },
  support_suggested: false,
  why: { ready: false, have: 0, need: 7, today: null, week: null },
  expected: null,
  estimate: null,
  body_check: null,
};

// 2026-01-15 is a Thursday. The window is Fri 9 Jan to Thu 15 Jan; Sat 10 and Mon 12 have no check-in.
const CHECKINS = [
  { date: "2026-01-15", stress: 6, word: "Tired", energy: [], updated_at: "" },
  { date: "2026-01-14", stress: 3, word: null, energy: [], updated_at: "" },
  { date: "2026-01-13", stress: 8, word: null, energy: [], updated_at: "" },
  { date: "2026-01-11", stress: 2, word: null, energy: [], updated_at: "" },
  { date: "2026-01-09", stress: 5, word: null, energy: [], updated_at: "" },
];

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 0, 15, 12, 0, 0));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function openHome(extra: Routes = { "GET /me/checkins": { body: { checkins: CHECKINS } } }) {
  localStorage.setItem(TOKEN_KEY, "saved-token");
  stubBackend({ "GET /auth/me": { body: USER }, "GET /me/summary": { body: SUMMARY }, ...extra });
  await loadApp();
  await screen.findByText("12 of 30 check-ins");
}

describe("the Home look", () => {
  it("home_shows_streak_flame_badge: a pill named for the current streak", async () => {
    await openHome();
    const badge = screen.getByRole("img", { name: /12-day streak/ });
    expect(badge.getAttribute("style")).toContain("var(--c-flame)");
    expect(badge.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("home_shows_big_streak_number: the number and its label", async () => {
    await openHome();
    const hero = within(screen.getByRole("group", { name: "Your streak" }));
    expect(hero.getByText("12")).toBeTruthy();
    expect(hero.getByText("day streak")).toBeTruthy();
    expect(hero.getByText("Best: 14 days")).toBeTruthy();
  });

  it("home_progress_bar_has_values", async () => {
    await openHome();
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("12");
    expect(bar.getAttribute("aria-valuemax")).toBe("30");
  });

  it("home_chart_lists_last_7_days: every day by name, with no check-in said plainly", async () => {
    await openHome();
    const chart = await screen.findByRole("img", { name: /Stress over the last 7 days/ });
    const label = chart.getAttribute("aria-label") ?? "";
    for (const day of ["Fri", "Sat", "Sun", "Mon", "Tue", "Wed", "Thu"]) expect(label).toContain(day);
    expect(label).toContain("Thu 6");
    expect(label).toContain("Sat no check-in");
    expect(label).toContain("Mon no check-in");
    expect(chart.querySelectorAll(".bg-accent-pulse")).toHaveLength(5);
    expect(chart.querySelectorAll(".bg-surface-raised")).toHaveLength(2);
  });

  it("home_chart_hidden_when_checkins_fail: the rest of Home still shows", async () => {
    await openHome({ "GET /me/checkins": "network-error" });
    expect(screen.queryByRole("img", { name: /Stress over the last 7 days/ })).toBeNull();
    expect(screen.getByRole("progressbar")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change today's check-in" })).toBeTruthy();
  });

  it("home_chips_use_tag_colours: an energy chip carries its own colours", async () => {
    await openHome();
    const chip = within(screen.getByRole("list", { name: "What took your energy this week" })).getByText("Exams (2)");
    const { background, color } = energyChip("Exams");
    expect(chip.style.background).not.toBe("");
    const probe = document.createElement("div");
    probe.style.background = background;
    probe.style.color = color;
    expect(chip.style.background).toBe(probe.style.background);
    expect(chip.style.color).toBe(probe.style.color);
  });

  it("home_keeps_all_buttons", async () => {
    await openHome();
    for (const name of [
      "Change today's check-in",
      "See your trends",
      "Why?",
      "Reminders",
      "Journal",
      "Account",
      "Sign out",
      "Need support?",
    ]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
  });
});
