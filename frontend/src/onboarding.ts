import { QUESTIONS, isAllowedAnswer, type Answers } from "./calibrationQuestions";

/** Starting-point answers are kept on this device until the account is created.
 *  Nothing here is ever sent to the server. */
const KEY = "mindwatch.onboarding";
let memory: Answers = {};

export function loadAnswers(): Answers {
  let raw: unknown = memory;
  try {
    const saved = localStorage.getItem(KEY);
    raw = saved ? JSON.parse(saved) : {};
  } catch {
    // Storage is blocked or the saved text is damaged; fall back to this session only.
  }
  const answers: Answers = {};
  for (const question of QUESTIONS) {
    const value = (raw as Record<string, unknown>)?.[question.id];
    if (isAllowedAnswer(question, value)) answers[question.id] = value as string | number;
  }
  return answers;
}

export function saveAnswers(answers: Answers): void {
  memory = answers;
  try {
    localStorage.setItem(KEY, JSON.stringify(answers));
  } catch {
    // Blocked storage: the answers live in memory until the page closes.
  }
}

export function clearAnswers(): void {
  memory = {};
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing stored to clear.
  }
}
