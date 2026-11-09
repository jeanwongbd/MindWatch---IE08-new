import { useEffect, useState } from "react";
import { BODY_CHECK_TITLE, bodyCheckMessage, heartText, sleepText } from "../bodyCheck";
import { fetchSummary, type Summary } from "../summary";
import AuthFrame, { friendlyError, linkButtonClass } from "./AuthFrame";

interface Props {
  onBack: () => void;
  onSupport?: () => void;
}

const TODAY = {
  higher: "Today is higher than your usual.",
  about: "Today is about your usual.",
  lower: "Today is lower than your usual.",
} as const;

const WEEK = {
  higher: "This past week is higher than your usual.",
  about: "This past week is about your usual.",
  lower: "This past week is lower than your usual.",
} as const;

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const local = new Date(y, m - 1, d);
  return `${DAY_NAMES[local.getDay()]} ${d} ${MONTH_NAMES[m - 1]}`;
}

const card = "rounded-2xl border border-border p-4 space-y-1.5";

/**
 * The signed-in person's Why tab. It describes how today and this week sit against their own usual,
 * and never says what might be behind it. Separate from the demo's Why screen.
 */
export default function PersonalWhyScreen({ onBack, onSupport }: Props) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    fetchSummary()
      .then((s) => {
        if (live) setSummary(s);
      })
      .catch((e) => {
        if (live) setError(friendlyError(e));
      });
    return () => {
      live = false;
    };
  }, []);

  const why = summary?.why;

  return (
    <AuthFrame title="Why?">
      {error && (
        <p role="alert" className="text-xs text-accent-stress text-center">
          {error}
        </p>
      )}
      {!error && summary === null && (
        <p role="status" className="text-xs text-muted text-center font-mono">
          Loading…
        </p>
      )}

      {why && !why.ready && (
        <div className={card}>
          <p className="text-sm text-ink">Check in on {why.need} different days and this page will fill in.</p>
          <p className="text-xs text-muted">
            {Math.min(why.have, why.need)} of {why.need} so far.
          </p>
        </div>
      )}

      {summary && why?.ready && (
        <>
          <div className={card}>
            <h2 className="text-xs text-muted uppercase tracking-wide font-mono">How you compare with your usual</h2>
            <p className="text-sm text-ink">
              {why.today ? TODAY[why.today] : "You haven't checked in today yet, so there is nothing to compare."}
            </p>
            {why.week && <p className="text-sm text-ink">{WEEK[why.week]}</p>}
            {summary.usual && (
              <p className="text-xs text-muted">Your usual is {summary.usual.value} out of 10.</p>
            )}
          </div>

          {summary.recent_words.length > 0 && (
            <div className={card}>
              <h2 className="text-xs text-muted uppercase tracking-wide font-mono">Words you chose this week</h2>
              <ul aria-label="Words you chose this week" className="text-sm text-ink space-y-1">
                {summary.recent_words.map((w) => (
                  <li key={w.word}>
                    {w.word}
                    {w.count > 1 ? ` (${w.count} days)` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {summary?.body_check && (
        <div className={card}>
          <h2 className="text-xs text-muted uppercase tracking-wide font-mono">{BODY_CHECK_TITLE}</h2>
          <ul aria-label="The 2 days compared" className="text-sm text-ink space-y-2">
            {summary.body_check.days.map((date, i) => {
              const check = summary.body_check!;
              const heart = heartText(check, i);
              return (
                <li key={date}>
                  <span className="text-muted">{dayLabel(date)}</span>
                  <br />
                  Stress: {check.stress[i]} out of 10
                  <br />
                  Sleep: {sleepText(check.sleep[i])}
                  {check.heart && (
                    <>
                      <br />
                      Heart rate: {heart ?? "not recorded"}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-sm text-ink">{bodyCheckMessage(summary.body_check).body}</p>
          {bodyCheckMessage(summary.body_check).support && onSupport && (
            <button type="button" onClick={onSupport} className={linkButtonClass}>
              Need support?
            </button>
          )}
        </div>
      )}

      {summary && (
        <p className="text-[11px] text-dim leading-relaxed">
          This page describes your own pattern. It can't tell you what is behind a change, and it isn't medical
          advice.
        </p>
      )}

      <div>
        <button type="button" onClick={onBack} className={linkButtonClass}>
          Back
        </button>
      </div>
    </AuthFrame>
  );
}
