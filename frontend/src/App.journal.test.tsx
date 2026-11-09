import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOKEN_KEY, USER, callsTo, fill, loadApp, stubBackend, tap, type Routes } from "./test/accountsHelpers";
import { utcOffsetMinutes } from "./checkinWords";
import type { Summary } from "./summary";

const BASE: Summary = {
  today: "2026-01-15",
  count: 5,
  progress: { done: 5, goal: 30 },
  today_checkin: { stress: 4, word: "Calm" },
  usual: null,
  recent_7d: null,
  today_vs_usual: null,
  recent_words: [],
  recent_energy: [],
  streak: { current: 5, best: 5, status: "building" },
  support_suggested: false,
  why: { ready: false, have: 0, need: 7, today: null, week: null },
  expected: null,
  estimate: null,
  body_check: null,
};

const entry = (id: string, date: string, text: string) => ({
  id,
  date,
  text,
  created_at: `${date}T10:00:00+00:00`,
  updated_at: `${date}T10:00:00+00:00`,
});

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();
});

async function openJournal(entries: unknown[] = [], routes: Routes = {}) {
  localStorage.setItem(TOKEN_KEY, "saved-token");
  const spy = stubBackend({
    "GET /auth/me": { body: USER },
    "GET /me/summary": { body: BASE },
    "GET /me/journal": { body: { entries } },
    ...routes,
  });
  await loadApp();
  await screen.findByText("5 of 30 check-ins");
  tap("Journal");
  await screen.findByRole("heading", { name: "Journal" });
  await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
  return spy;
}

const box = () => screen.getByLabelText("Write about your day") as HTMLTextAreaElement;
const saveButton = () => screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
const text = () => document.body.textContent ?? "";

describe("Journal", () => {
  it("journal_opens_from_home", async () => {
    await openJournal();
    expect(box()).toBeTruthy();
    tap("Back to Home");
    expect(await screen.findByText("5 of 30 check-ins")).toBeTruthy();
  });

  it("journal_saves_entry_with_utc_offset", async () => {
    const spy = await openJournal([], {
      "POST /me/journal": { status: 201, body: entry("e1", "2026-01-15", "A calm day") },
    });
    fill("Write about your day", "A calm day");
    fireEvent.click(saveButton());
    await screen.findByText("A calm day");
    const sent = JSON.parse(callsTo(spy, "POST /me/journal")[0][1]!.body as string);
    expect(sent).toEqual({ text: "A calm day", utc_offset_minutes: utcOffsetMinutes() });
    expect(box().value).toBe("");
  });

  it("journal_lists_newest_first", async () => {
    await openJournal([entry("b", "2026-01-15", "Newer note"), entry("a", "2026-01-10", "Older note")]);
    expect(text().indexOf("Newer note")).toBeGreaterThan(-1);
    expect(text().indexOf("Newer note")).toBeLessThan(text().indexOf("Older note"));
  });

  it("journal_keeps_line_breaks_as_text", async () => {
    await openJournal([entry("a", "2026-01-15", "line one\n<b>hi</b>")]);
    expect(document.querySelector("b")).toBeNull();
    const p = screen.getByText(/<b>hi<\/b>/);
    expect(p.textContent).toBe("line one\n<b>hi</b>");
    expect(p.style.whiteSpace).toBe("pre-wrap");
  });

  it("journal_edit_saves_changes", async () => {
    const spy = await openJournal([entry("a", "2026-01-15", "Before")], {
      "PUT /me/journal/a": { body: entry("a", "2026-01-15", "After") },
    });
    tap("Edit");
    fireEvent.change(screen.getByLabelText("Edit entry"), { target: { value: "After" } });
    tap("Save changes");
    await screen.findByText("After");
    expect(JSON.parse(callsTo(spy, "PUT /me/journal/a")[0][1]!.body as string)).toEqual({ text: "After" });
    expect(screen.queryByText("Before")).toBeNull();
  });

  it("journal_delete_asks_first", async () => {
    const spy = await openJournal([entry("a", "2026-01-15", "Gone soon")], {
      "DELETE /me/journal/a": { status: 204 },
    });
    tap("Delete");
    expect(screen.getByText("Delete this entry?")).toBeTruthy();
    expect(callsTo(spy, "DELETE /me/journal/a")).toHaveLength(0);
    tap("Cancel");
    expect(screen.getByText("Gone soon")).toBeTruthy();
    tap("Delete");
    tap("Delete");
    await waitFor(() => expect(screen.queryByText("Gone soon")).toBeNull());
    expect(callsTo(spy, "DELETE /me/journal/a")).toHaveLength(1);
  });

  it("journal_save_disabled_when_empty_or_too_long", async () => {
    await openJournal();
    expect(saveButton().disabled).toBe(true);
    fill("Write about your day", "   ");
    expect(saveButton().disabled).toBe(true);
    fill("Write about your day", "x".repeat(2000));
    expect(saveButton().disabled).toBe(false);
    expect(text()).toContain("2000 / 2000");
    fill("Write about your day", "x".repeat(2001));
    expect(saveButton().disabled).toBe(true);
  });

  it("journal_failed_save_keeps_text", async () => {
    await openJournal([], { "POST /me/journal": { status: 500, body: { detail: "boom" } } });
    fill("Write about your day", "Keep me");
    fireEvent.click(saveButton());
    await screen.findByRole("alert");
    expect(box().value).toBe("Keep me");
  });

  it("journal_shows_dictation_tip", async () => {
    await openJournal();
    expect(text()).toContain("Prefer to talk? Tap the microphone on your phone's keyboard and speak.");
  });

  it("journal_links_to_support", async () => {
    await openJournal();
    expect(text()).toContain("If writing brings up something hard, support is available.");
    tap("Need support?");
    expect(await screen.findByRole("heading", { name: "Support" })).toBeTruthy();
    tap("Back");
    expect(await screen.findByRole("heading", { name: "Journal" })).toBeTruthy();
  });
});
