import { useEffect, useState } from "react";
import { dayBefore, localDate } from "../checkinWords";
import { fetchCheckins, fetchSummary, type SavedCheckin, type Summary } from "../summary";
import AuthFrame, { friendlyError, linkButtonClass } from "./AuthFrame";

const DAYS = 30;

/** The last `DAYS` calendar days ending today, oldest first. */
function lastDays(): string[] {
  const days: string[] = [];
  let day = localDate();
  for (let i = 0; i < DAYS; i++) {
    days.unshift(day);
    day = dayBefore(day);
  }
  return days;
}

interface Props {
  onBack: () => void;
}

/** The signed-in person's own last 30 days. Separate from the demo's Trends screen. */
export default function PersonalTrendsScreen({ onBack }: Props) {
  const [checkins, setCheckins] = useState<SavedCheckin[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    Promise.all([fetchCheckins(60), fetchSummary()])
      .then(([list, s]) => {
        if (!live) return;
        setCheckins(list.checkins);
        setSummary(s);
      })
      .catch((e) => {
        if (live) setError(friendlyError(e));
      });
    return () => {
      live = false;
    };
  }, []);

  const days = lastDays();
  const byDate = new Map((checkins ?? []).map((c) => [c.date, c]));
  const inWindow = days.map((d) => byDate.get(d)).filter((c): c is SavedCheckin => c !== undefined);
  const usual = summary?.usual?.value ?? null;

  return (
    <AuthFrame title="Your trends">
      {error && (
        <p role="alert" className="text-xs text-accent-stress text-center">
          {error}
        </p>
      )}
      {!error && checkins === null && (
        <p role="status" className="text-xs text-muted text-center font-mono">
          Loading your check-ins…
        </p>
      )}

      {checkins !== null && (
        <>
          <p className="text-xs text-muted text-center">
            The last {DAYS} days: {inWindow.length} check-in{inWindow.length === 1 ? "" : "s"}. Days you missed are
            left blank.
          </p>

          <div
            role="img"
            aria-label={`Stress out of 10 over the last ${DAYS} days, ${inWindow.length} check-ins${
              usual !== null ? `, your usual is ${usual}` : ""
            }. The list below has the same numbers.`}
            className="relative h-32 flex items-end gap-px border-b border-border"
          >
            {usual !== null && (
              <div
                aria-hidden="true"
                className="absolute left-0 right-0 border-t border-dashed border-muted"
                style={{ bottom: `${usual * 10}%` }}
              />
            )}
            {days.map((d) => {
              const c = byDate.get(d);
              return (
                <div key={d} aria-hidden="true" className="flex-1 h-full flex items-end">
                  {c ? (
                    <div
                      className="w-full bg-ink rounded-t-sm"
                      style={{ height: `${Math.max(c.stress * 10, 3)}%` }}
                      title={`${d}: ${c.stress} out of 10`}
                    />
                  ) : (
                    <div className="w-full h-px bg-border" />
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-dim">
            <span>{days[0]}</span>
            {usual !== null && <span>dashed line: your usual ({usual})</span>}
            <span>{days[days.length - 1]}</span>
          </div>

          {inWindow.length === 0 ? (
            <p className="text-sm text-muted text-center">No check-ins in the last {DAYS} days yet.</p>
          ) : (
            <ul aria-label="Your check-ins, newest first" className="space-y-1.5 text-sm text-ink">
              {[...inWindow].reverse().map((c) => (
                <li key={c.date} className="flex justify-between border-b border-border pb-1.5">
                  <span>{c.date}</span>
                  <span>
                    {c.stress} out of 10{c.word ? ` · ${c.word}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <div>
        <button type="button" onClick={onBack} className={linkButtonClass}>
          Back
        </button>
      </div>
    </AuthFrame>
  );
}
