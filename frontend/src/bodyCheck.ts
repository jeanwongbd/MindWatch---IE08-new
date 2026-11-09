import type { BodyCheck } from "./summary";

/** All the wording for "How you feel vs your body". Calm, never a cause, never a diagnosis. */
export const BODY_CHECK_TITLE = "How you feel vs your body";

export interface BodyCheckMessage {
  headline: string;
  body: string;
  /** True when the card should point to support. */
  support: boolean;
}

const SLEEP_ANSWERS: Record<string, string> = {
  under_5: "under 5 hours",
  "5_6": "5 to 6 hours",
  "6_7": "6 to 7 hours",
  "7_8": "7 to 8 hours",
  "8_9": "8 to 9 hours",
  over_9: "over 9 hours",
};

/** One day's sleep in plain words: the watch's hours and minutes, the check-in answer, or "not recorded". */
export function sleepText(day: BodyCheck["sleep"][number]): string {
  if (day.minutes !== null) {
    const h = Math.floor(day.minutes / 60);
    const m = Math.round(day.minutes % 60);
    return `${h} ${h === 1 ? "hour" : "hours"} ${m} ${m === 1 ? "minute" : "minutes"}`;
  }
  if (day.manual) return SLEEP_ANSWERS[day.manual] ?? "not recorded";
  return "not recorded";
}

/** Heart rate against usual, e.g. "82 beats a minute on average, your usual is 70". Null when not recorded. */
export function heartText(check: BodyCheck, index: number): string | null {
  const heart = check.heart;
  const value = heart?.values[index];
  if (!heart || value === null || value === undefined) return null;
  return `${Math.round(value)} beats a minute on average, your usual is ${Math.round(heart.usual)}`;
}

export function bodyCheckMessage(check: BodyCheck): BodyCheckMessage {
  const short = check.signals.includes("short_sleep");
  const high = check.signals.includes("high_heart_rate");

  if (check.state === "body_signal_feel_ok") {
    if (short && high) {
      return {
        headline: BODY_CHECK_TITLE,
        body:
          "You've slept under 5 hours for 2 nights and your heart rate has been higher than your usual for 2 days, and you've said you feel okay. It may be worth taking things a little easier today.",
        support: false,
      };
    }
    if (high) {
      return {
        headline: BODY_CHECK_TITLE,
        body:
          "Your heart rate has been higher than your usual for 2 days, and you've said you feel okay. It may be worth taking things a little easier today.",
        support: false,
      };
    }
    return {
      headline: BODY_CHECK_TITLE,
      body:
        "You've slept under 5 hours for 2 nights, and you've said you feel okay. Short sleep can catch up with you, so be kind to yourself today.",
      support: false,
    };
  }

  if (check.state === "both") {
    const what =
      short && high
        ? "your sleep has been short and your heart rate has been higher than usual too"
        : high
          ? "your heart rate has been higher than usual too"
          : "your sleep has been short too";
    return {
      headline: BODY_CHECK_TITLE,
      body: `You've said you feel stressed, and ${what}. It might help to talk to someone.`,
      support: true,
    };
  }

  // feel_stressed_body_usual: mention only the measures that were actually known.
  const sleepKnown = check.sleep.length > 0 && check.sleep.every((d) => d.known);
  const heartKnown = !!check.heart && check.heart.values.length > 0 && check.heart.values.every((v) => v !== null);
  const measures =
    sleepKnown && heartKnown ? "Your sleep and heart rate look" : heartKnown ? "Your heart rate looks" : "Your sleep looks";
  return {
    headline: BODY_CHECK_TITLE,
    body: `${measures} like your usual, even though you've said you feel stressed. Stress doesn't always show in the body. If it keeps up, support is here.`,
    support: true,
  };
}
