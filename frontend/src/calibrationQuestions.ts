/** The "set your starting point" questions. backend/calibration_questions.json must match;
 *  a test compares the two. Every answer is picked from fixed options, never typed. */
export interface ChoiceOption {
  value: string;
  label: string;
}

export type Question =
  | { id: string; kind: "scale"; prompt: string; min: number; max: number; lowLabel: string; highLabel: string }
  | { id: string; kind: "choice"; prompt: string; options: ChoiceOption[] };

export type Answers = Record<string, string | number>;

export const QUESTIONS_VERSION = "v1";

export const QUESTIONS: Question[] = [
  {
    id: "usual_stress",
    kind: "scale",
    prompt: "On a typical day lately, how stressed do you feel?",
    min: 0,
    max: 10,
    lowLabel: "0 = not stressed",
    highLabel: "10 = extremely stressed",
  },
  {
    id: "sleep_hours",
    kind: "choice",
    prompt: "How many hours do you usually sleep?",
    options: [
      { value: "under_5", label: "Under 5" },
      { value: "5_6", label: "5 to 6" },
      { value: "6_7", label: "6 to 7" },
      { value: "7_8", label: "7 to 8" },
      { value: "8_9", label: "8 to 9" },
      { value: "over_9", label: "Over 9" },
    ],
  },
  {
    id: "sleep_quality",
    kind: "choice",
    prompt: "How would you rate your usual sleep?",
    options: [
      { value: "poor", label: "Poor" },
      { value: "fair", label: "Fair" },
      { value: "good", label: "Good" },
      { value: "great", label: "Great" },
    ],
  },
  {
    id: "activity",
    kind: "choice",
    prompt: "How active are you on a typical day?",
    options: [
      { value: "mostly_sitting", label: "Mostly sitting" },
      { value: "lightly_active", label: "Lightly active" },
      { value: "moderately_active", label: "Moderately active" },
      { value: "very_active", label: "Very active" },
    ],
  },
  {
    id: "wears_watch",
    kind: "choice",
    prompt: "Do you wear a fitness watch or band?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ],
  },
  {
    id: "stress_time",
    kind: "choice",
    prompt: "When do you usually feel most stressed?",
    options: [
      { value: "morning", label: "Morning" },
      { value: "afternoon", label: "Afternoon" },
      { value: "evening", label: "Evening" },
      { value: "night", label: "Night" },
      { value: "varies", label: "It varies" },
    ],
  },
];

export function isAllowedAnswer(question: Question, value: unknown): boolean {
  if (question.kind === "scale") {
    return Number.isInteger(value) && (value as number) >= question.min && (value as number) <= question.max;
  }
  return typeof value === "string" && question.options.some((option) => option.value === value);
}

export function isComplete(answers: Answers): boolean {
  return QUESTIONS.every((q) => isAllowedAnswer(q, answers[q.id]));
}

/** Index of the first unanswered question, or 0 when everything is answered. */
export function firstUnanswered(answers: Answers): number {
  const index = QUESTIONS.findIndex((q) => !isAllowedAnswer(q, answers[q.id]));
  return index === -1 ? 0 : index;
}
