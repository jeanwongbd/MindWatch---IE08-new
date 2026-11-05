import { useEffect, useState } from "react";
import type { AuthUser } from "../api";
import { fetchSummary, type Summary } from "../summary";
import { reminders } from "../remindersService";
import { ReminderOffer, WebReminderBanner } from "./ReminderPrompts";
import WatchCard from "./WatchCard";
import AuthFrame, { friendlyError, linkButtonClass, primaryButtonClass } from "./AuthFrame";

interface Props {
  user: AuthUser;
  onCheckIn: () => void;
  onTrends: () => void;
  onWhy: () => void;
  onReminders: () => void;
  onWatch: () => void;
  onAccount: () => void;
  onJournal: () => void;
  onSupport: () => void;
  onSignOut: () => void;
}

const COMPARISON = {
  higher: "Higher than your usual",
  about: "About your usual",
  lower: "Lower than your usual",
} as const;

/** One sentence for where the person is, from how many check-ins they have. */
function stageMessage(count: number, goal: number): string {
  if (count === 0) return "Welcome. Your first check-in sets your starting point.";
  if (count < 3) return "Check in for a few more days to see what's usual for you.";
  if (count >= goal) return `You've done ${goal} check-ins. Your usual levels now draw on all of them.`;
  return "";
}

const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

/** The streak, in kind words. A missed day is never framed as a loss: the count of check-ins stays. */
function streakText(summary: Summary): { main: string; best: string | null } | null {
  const { current, best, status } = summary.streak;
  if (status === "building") return { main: `${current}-day streak`, best: `Best: ${days(best)}` };
  if (status === "waiting") {
    return { main: `Your ${current}-day streak continues if you check in today.`, best: `Best: ${days(best)}` };
  }
  if (summary.count === 0) return null;
  const n = summary.count;
  return {
    main: `Start again today. Your ${n} check-in${n === 1 ? "" : "s"} still count${n === 1 ? "s" : ""}.`,
    best: best >= 2 ? `Your best streak so far: ${days(best)}.` : null,
  };
}

const secondaryButtonClass =
  "w-full py-3.5 border border-border text-ink rounded-2xl hover:opacity-90 active:opacity-80 transition-opacity";

/** The signed-in Home. Plain descriptions of the person's own check-ins, never a cause or a prediction. */
export default function HomeScreen({ user, onCheckIn, onTrends, onWhy, onReminders, onWatch, onAccount, onJournal, onSupport, onSignOut }: Props) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setError("");
    fetchSummary()
      .then((s) => {
        if (!live) return;
        setSummary(s);
        // Keep the phone's reminders in step: today's is skipped once today's check-in is done.
        reminders.setTodayDone(s.today_checkin !== null);
        reminders.sync(user.id).catch(() => {});
      })
      .catch((e) => {
        if (live) setError(friendlyError(e));
      });
    return () => {
      live = false;
    };
  }, [attempt]);

  return (
    <AuthFrame title="Home">
      {user.is_sample ? (
        <p role="status" className="text-xs text-ink text-center rounded-2xl border border-border p-3">
          Sample account. These 30 days are real check-ins from one study participant, moved so they end yesterday.
          Anything you change is private to you, and this copy is deleted after a day.
        </p>
      ) : (
        <p className="text-xs text-muted text-center">
          Signed in as <span className="text-ink">{user.email}</span>
        </p>
      )}

      {error && (
        <div className="space-y-2 text-center">
          <p role="alert" className="text-xs text-accent-stress">
            {error}
          </p>
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className={linkButtonClass}>
            Try again
          </button>
        </div>
      )}
      {!error && !summary && (
        <p role="status" className="text-xs text-muted text-center font-mono">
          Loading your summary…
        </p>
      )}

      {summary && (
        <div className="space-y-4">
          <div>
            <p className="text-sm text-ink text-center">
              {summary.progress.done} of {summary.progress.goal} check-ins
            </p>
            <div
              role="progressbar"
              aria-label="Check-ins so far"
              aria-valuemin={0}
              aria-valuemax={summary.progress.goal}
              aria-valuenow={summary.progress.done}
              className="h-1.5 bg-border rounded mt-1.5"
            >
              <div
                className="h-1.5 bg-ink rounded"
                style={{ width: `${(summary.progress.done / summary.progress.goal) * 100}%` }}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-border p-4 text-center">
            {summary.today_checkin ? (
              <p className="text-sm text-ink">
                Today: {summary.today_checkin.stress} out of 10
                {summary.today_checkin.word ? ` · ${summary.today_checkin.word}` : ""}
              </p>
            ) : (
              <p className="text-sm text-muted">You haven't checked in today.</p>
            )}
          </div>

          {streakText(summary) && (
            <div role="group" aria-label="Your streak" className="rounded-2xl border border-border p-4 text-center space-y-1">
              <p className="text-sm text-ink">{streakText(summary)!.main}</p>
              {streakText(summary)!.best && <p className="text-xs text-muted">{streakText(summary)!.best}</p>}
            </div>
          )}

          {summary.support_suggested && (
            <div role="group" aria-label="Support suggestion" className="rounded-2xl border border-border p-4 text-center space-y-3">
              <p className="text-sm text-ink">
                These last few days have been hard. You're not alone, and there are people you can talk to.
              </p>
              <button type="button" onClick={onSupport} className={secondaryButtonClass} style={{ fontWeight: 500 }}>
                See support options
              </button>
            </div>
          )}

          <WatchCard userId={user.id} onOpen={onWatch} isSample={!!user.is_sample} />

          <WebReminderBanner userId={user.id} todayDone={summary.today_checkin !== null} />
          {summary.count >= 1 && <ReminderOffer userId={user.id} />}

          {stageMessage(summary.count, summary.progress.goal) && (
            <p className="text-xs text-muted text-center">{stageMessage(summary.count, summary.progress.goal)}</p>
          )}

          {summary.usual && (
            <div className="rounded-2xl border border-border p-4 space-y-1.5 text-sm text-ink">
              <p>
                Your usual: {summary.usual.value} out of 10
                <span className="block text-xs text-muted">(from {summary.usual.based_on} check-ins)</span>
              </p>
              {summary.recent_7d ? (
                <p>
                  Last 7 days: {summary.recent_7d.value} out of 10
                  <span className="block text-xs text-muted">(from {summary.recent_7d.based_on} check-ins)</span>
                </p>
              ) : (
                <p className="text-xs text-muted">Last 7 days: not enough check-ins this week yet (it needs 3).</p>
              )}
              {summary.today_vs_usual && (
                <p className="pt-1.5 border-t border-border">{COMPARISON[summary.today_vs_usual.label]}</p>
              )}
            </div>
          )}

          {summary.recent_words.length > 0 && (
            <div className="text-center">
              <p className="text-xs text-muted mb-1.5">Your words this week</p>
              <ul className="flex flex-wrap gap-2 justify-center" aria-label="Your words this week">
                {summary.recent_words.map((w) => (
                  <li key={w.word} className="px-3 py-1 rounded-full border border-border text-sm text-ink">
                    {w.word}
                    {w.count > 1 ? ` (${w.count})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {summary.recent_energy?.length > 0 && (
            <div className="text-center">
              <p className="text-xs text-muted mb-1.5">What took your energy this week</p>
              <ul className="flex flex-wrap gap-2 justify-center" aria-label="What took your energy this week">
                {summary.recent_energy.map((e) => (
                  <li key={e.tag} className="px-3 py-1 rounded-full border border-border text-sm text-ink">
                    {e.tag} ({e.count})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <button onClick={onCheckIn} className={primaryButtonClass} style={{ fontWeight: 500 }}>
        {summary?.today_checkin ? "Change today's check-in" : "Check in today"}
      </button>
      <button onClick={onTrends} className={secondaryButtonClass} style={{ fontWeight: 500 }}>
        See your trends
      </button>
      <button onClick={onWhy} className={secondaryButtonClass} style={{ fontWeight: 500 }}>
        Why?
      </button>
      <button onClick={onReminders} className={secondaryButtonClass} style={{ fontWeight: 500 }}>
        Reminders
      </button>
      <button onClick={onJournal} className={secondaryButtonClass} style={{ fontWeight: 500 }}>
        Journal
      </button>
      <button onClick={onAccount} className={secondaryButtonClass} style={{ fontWeight: 500 }}>
        Account
      </button>
      <button onClick={onSignOut} className={secondaryButtonClass} style={{ fontWeight: 500 }}>
        Sign out
      </button>
      <div className="text-center">
        <button type="button" onClick={onSupport} className={linkButtonClass}>
          Need support?
        </button>
      </div>
    </AuthFrame>
  );
}
