import type { Summary } from "./summary";

export type Expected = NonNullable<Summary["expected"]>;

const NAMES: [string, string][] = [
  ["sleep_hours", "sleep"],
  ["steps", "steps"],
  ["heart_rate", "heart rate"],
];

function joinNames(names: string[]): string {
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The "From your ..." phrase, built from the inputs the guess actually used. */
export function expectedPhrase(e: Pick<Expected, "inputs" | "days_used">): string {
  const watch = NAMES.filter(([key]) => e.inputs.includes(key)).map(([, name]) => name);
  if (watch.length > 0) return `From your ${joinNames(watch)}`;
  if (e.inputs.length > 0) return "From your sleep and activity answers";
  return e.days_used > 0 ? "From your check-ins so far" : "From your starting answers";
}

/** A whole number if it ends in .0, otherwise one decimal. */
function shown(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

const COMPARE = {
  higher: "Today is higher than expected.",
  about: "Today is about what we'd expect.",
  lower: "Today is lower than expected.",
} as const;

/** The lines Home and the Why tab both show. One place, so the two can never differ. */
export function expectedLines(e: Expected): string[] {
  const phrase = expectedPhrase(e);
  if (e.today_stress === null || e.label === null) {
    return [`${phrase}, we'd expect about ${shown(e.value)} today. Check in to see how you compare.`];
  }
  return [`You said ${e.today_stress}. ${phrase}, we'd expect about ${shown(e.value)}.`, COMPARE[e.label]];
}
