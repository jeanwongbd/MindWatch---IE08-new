import { useState } from "react";
import { QUESTIONS, type Answers } from "../calibrationQuestions";
import AuthFrame, { linkButtonClass, primaryButtonClass } from "./AuthFrame";

interface Props {
  answers: Answers;
  initialStep: number;
  onChange: (answers: Answers) => void;
  onDone: () => void;
  onBack: () => void;
}

const choiceClass = (selected: boolean) =>
  `w-full text-left px-4 py-3 rounded-2xl border text-sm transition-colors ${
    selected ? "border-inverse bg-inverse text-on-inverse" : "border-border bg-input text-ink hover:border-ink"
  }`;

export default function CalibrationScreen({ answers, initialStep, onChange, onDone, onBack }: Props) {
  const [step, setStep] = useState(Math.min(Math.max(initialStep, 0), QUESTIONS.length - 1));
  const question = QUESTIONS[step];
  const current = answers[question.id];
  const last = step === QUESTIONS.length - 1;

  function pick(value: string | number) {
    onChange({ ...answers, [question.id]: value });
  }

  return (
    <AuthFrame title="Set your starting point">
      <div>
        <p className="text-[11px] text-muted font-mono text-center">
          Question {step + 1} of {QUESTIONS.length}
        </p>
        <div className="h-1 bg-border rounded mt-1.5" aria-hidden="true">
          <div
            className="h-1 bg-inverse rounded transition-all"
            style={{ width: `${((step + 1) / QUESTIONS.length) * 100}%` }}
          />
        </div>
      </div>

      <h2 className="text-base text-ink text-center">{question.prompt}</h2>

      {question.kind === "scale" ? (
        <div>
          <div className="grid grid-cols-6 gap-2">
            {Array.from({ length: question.max - question.min + 1 }, (_, i) => question.min + i).map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={current === n}
                onClick={() => pick(n)}
                className={`py-2.5 rounded-xl border text-sm ${
                  current === n ? "border-inverse bg-inverse text-on-inverse" : "border-border bg-input text-ink"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-dim mt-2">
            <span>{question.lowLabel}</span>
            <span>{question.highLabel}</span>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {question.options.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={current === option.value}
              onClick={() => pick(option.value)}
              className={choiceClass(current === option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        disabled={current === undefined}
        onClick={() => (last ? onDone() : setStep(step + 1))}
        className={primaryButtonClass}
        style={{ fontWeight: 500 }}
      >
        {last ? "Continue" : "Next"}
      </button>
      <div className="flex justify-between items-center">
        <button type="button" onClick={() => (step === 0 ? onBack() : setStep(step - 1))} className={linkButtonClass}>
          Back
        </button>
        <p className="text-[10px] text-dim">Your answers stay on this device until you create your account.</p>
      </div>
    </AuthFrame>
  );
}
