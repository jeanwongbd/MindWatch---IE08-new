/** The word-of-the-day choices. backend/checkin_words.json must match; a test compares the two.
 *  Words are picked from this list, never typed. */
export const WORDS = [
  "Calm",
  "Okay",
  "Content",
  "Hopeful",
  "Focused",
  "Tired",
  "Restless",
  "Anxious",
  "Overwhelmed",
  "Frustrated",
  "Sad",
  "Lonely",
] as const;

/** The "what took your energy" tags. backend/checkin_words.json (key "energy") must match; a test compares the two. */
export const ENERGY = [
  "Exams",
  "Deadlines",
  "Lectures",
  "Group work",
  "Sleep",
  "Social",
  "Family",
  "Money",
  "Health",
  "Other",
] as const;

const two = (n: number) => String(n).padStart(2, "0");

/** The phone's own calendar date, as YYYY-MM-DD. */
export function localDate(when: Date = new Date()): string {
  return `${when.getFullYear()}-${two(when.getMonth() + 1)}-${two(when.getDate())}`;
}

/** The calendar day before a YYYY-MM-DD date. */
export function dayBefore(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return localDate(new Date(year, month - 1, day - 1));
}

/** Minutes ahead of UTC on this phone (Singapore is 480). The server uses it to know what "today" is. */
export function utcOffsetMinutes(when: Date = new Date()): number {
  // "|| 0" turns negative zero (what -0 gives on a phone set to UTC) into a plain 0.
  return -when.getTimezoneOffset() || 0;
}
