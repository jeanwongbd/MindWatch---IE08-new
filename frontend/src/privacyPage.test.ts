import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Reads the real files so the page cannot silently drift from the app.
const root = process.cwd();
const page = readFileSync(resolve(root, "public/privacy.html"), "utf-8");
const config = JSON.parse(readFileSync(resolve(root, "android/healthfitness.config.json"), "utf-8"));

describe("privacy page", () => {
  it("is the https URL the Health Connect permission screen links to", () => {
    expect(config.privacyPolicyUrl.startsWith("https://")).toBe(true);
    expect(config.privacyPolicyUrl.endsWith("/privacy.html")).toBe(true);
  });

  it("has no scripts", () => {
    expect(page.toLowerCase()).not.toContain("<script");
  });

  it("has the title", () => {
    expect(page).toContain("<title>MindWatch privacy</title>");
  });

  it.each([
    "email",
    "Argon2",
    "18 or over",
    "starting-point answers",
    "stress from 0 to 10",
    "word of the day",
    "sleep hours",
    "sleep quality",
    "activity",
    "steps",
    "sleep minutes",
    "average heart rate",
    "personal model",
    "Reminder settings",
    "journal entries you choose to write",
    "never written to logs",
    "never used by the model",
    "location",
    "contacts",
    "advertising IDs",
    "Heart rate variability",
    "resting heart rate",
    "Render",
    "Neon",
    "Health Connect",
    "download all your data",
    "delete your account",
    "Garcia-Ceja",
    "Support page",
    "Last updated: 5 November 2026",
  ])("mentions %s", (item) => {
    expect(page.toLowerCase()).toContain(item.toLowerCase());
  });
});
