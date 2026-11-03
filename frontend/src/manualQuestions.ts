import { QUESTIONS, type ChoiceOption } from "./calibrationQuestions";

export type ManualId = "sleep_hours" | "sleep_quality" | "activity";

const optionsOf = (id: ManualId): ChoiceOption[] => {
  const question = QUESTIONS.find((q) => q.id === id);
  if (!question || question.kind !== "choice") throw new Error(`Missing choice question: ${id}`);
  return question.options;
};

/**
 * The sleep and activity questions in the daily check-in, asked only of people with no smart watch.
 * The options are the same fixed ones as the starting-point questions, so the server accepts them.
 * Optional: a check-in never needs them.
 */
export const MANUAL_QUESTIONS: {
  id: ManualId;
  group: string;
  prompt: (which: "today" | "yesterday") => string;
  options: ChoiceOption[];
}[] = [
  {
    id: "sleep_hours",
    group: "Hours of sleep",
    // Last night leads into today; the night before last leads into yesterday.
    prompt: (which) => `How many hours did you sleep ${which === "today" ? "last night" : "the night before last"}?`,
    options: optionsOf("sleep_hours"),
  },
  {
    id: "sleep_quality",
    group: "Sleep quality",
    prompt: () => "How was your sleep?",
    options: optionsOf("sleep_quality"),
  },
  {
    id: "activity",
    group: "Activity",
    prompt: (which) => `How active were you ${which}?`,
    options: optionsOf("activity"),
  },
];
