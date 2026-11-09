import { expectedLines } from "../expected";
import { useEffect, useState } from "react";
import type { AuthUser } from "../api";
import { fetchCheckins, fetchSummary, type SavedCheckin, type Summary } from "../summary";
import { BODY_CHECK_TITLE, bodyCheckMessage } from "../bodyCheck";
import { WORD_CHIP, chipClass, energyChip } from "../chips";
import { reminders } from "../remindersService";
import { ReminderOffer, WebReminderBanner } from "./ReminderPrompts";
import WatchCard from "./WatchCard";
import AuthFrame, { friendlyError, linkButtonClass } from "./AuthFrame";

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
  "w-full py-3.5 border border-border text-ink rounded-full hover:opacity-90 active:opacity-80 transition-opacity";
const primaryPillClass =
  "w-full py-3.5 bg-inverse text-on-inverse rounded-full hover:opacity-90 active:opacity-80 transition-opacity";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseLocal(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dateLabel(date: string): string {
  const d = parseLocal(date);
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The seven local dates ending at `today`, oldest first, each with that day's stress (or null). */
function lastSevenDays(today: string, checkins: SavedCheckin[]) {
  const base = parseLocal(today);
  const out: { date: string; label: string; stress: number | null }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i);
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    out.push({ date, label: DAY_NAMES[d.getDay()], stress: checkins.find((c) => c.date === date)?.stress ?? null });
  }
  return out;
}

function FlameIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-1-6 1-10z" />
    </svg>
  );
}

/** The signed-in Home. Plain descriptions of the person's own check-ins, never a cause or a prediction. */
export default function HomeScreen({ user, onCheckIn, onTrends, onWhy, onReminders, onWatch, onAccount, onJournal, onSupport, onSignOut }: Props) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [recent, setRecent] = useState<SavedCheckin[] | null>(null);

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

  // The chart's data. If this request fails, the chart is simply left out.
  useEffect(() => {
    if (!summary) return;
    let live = true;
    setRecent(null);
    fetchCheckins(7)
      .then((r) => {
        if (live) setRecent(r.checkins);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [summary]);

  const streak = summary ? streakText(summary) : null;
  const week = summary && recent ? lastSevenDays(summary.today, recent) : null;

  return (
    <AuthFrame title="Home">
      {user.is_sample ? (
        <p role="status" className="text-xs text-ink text-center rounded-2xl border border-border p-3">
          Sample account. These 30 days are real check-ins from one study participant, moved so they end yesterday.
          The last two nights' sleep is made up, so you can see how the app compares your feelings with your sleep.
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
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted">{dateLabel(summary.today)}</p>
            {summary.streak.current > 0 && (
              <span
                role="img"
                aria-label={`${summary.streak.current}-day streak`}
                className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm"
                style={{ background: "var(--c-flame)", color: "var(--c-on-flame)", fontWeight: 600 }}
              >
                <FlameIcon />
                <span aria-hidden="true">{summary.streak.current}</span>
              </span>
            )}
          </div>

          {streak && (
            <div role="group" aria-label="Your streak" className="space-y-1">
              <p className="flex items-baseline gap-2">
                <span className="text-ink" style={{ fontSize: 48, lineHeight: 1, fontWeight: 600 }}>
                  {summary.streak.current}
                </span>
                <span className="text-sm text-muted">day streak</span>
              </p>
              {summary.streak.status !== "building" && <p className="text-sm text-ink">{streak.main}</p>}
              {streak.best && <p className="text-xs text-muted">{streak.best}</p>}
            </div>
          )}

          <div>
            <p className="text-sm text-ink">
              {summary.progress.done} of {summary.progress.goal} check-ins
            </p>
            <div
              role="progressbar"
              aria-label="Check-ins so far"
              aria-valuemin={0}
              aria-valuemax={summary.progress.goal}
              aria-valuenow={summary.progress.done}
              className="h-2 bg-surface rounded-full mt-1.5"
            >
              <div
                className="h-2 bg-accent-pulse rounded-full"
                style={{ width: `${Math.min(100, (summary.progress.done / summary.progress.goal) * 100)}%` }}
              />
            </div>
          </div>

          {week && (
            <div
              role="img"
              aria-label={`Stress over the last 7 days: ${week.map((d) => `${d.label} ${d.stress ?? "no check-in"}`).join(", ")}`}
              className="bg-surface rounded-2xl p-4"
            >
              <div className="flex items-end justify-between gap-2 h-20" aria-hidden="true">
                {week.map((d) => (
                  <div key={d.date} className="flex-1 flex flex-col justify-end h-full">
                    <div
                      className={`w-full rounded-md ${d.stress === null ? "bg-surface-raised" : "bg-accent-pulse"}`}
                      style={{ height: d.stress === null ? "8%" : `${Math.max(8, d.stress * 10)}%` }}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-between gap-2 mt-1.5" aria-hidden="true">
                {week.map((d) => (
                  <span key={d.date} className="flex-1 text-center text-xs text-muted">
                    {d.label.slice(0, 1)}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-2xl bg-surface p-4 text-center">
            {summary.today_checkin ? (
              <p className="text-sm text-ink">
                Today: {summary.today_checkin.stress} out of 10
                {summary.today_checkin.word ? ` · ${summary.today_checkin.word}` : ""}
              </p>
            ) : (
              <p className="text-sm text-muted">You haven't checked in today.</p>
            )}
          </div>

          {summary.usual && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <div role="group" aria-label="Your usual" className="rounded-2xl bg-surface p-4">
                  <p className="text-xs text-muted">Your usual</p>
                  <p className="text-ink" style={{ fontSize: 32, lineHeight: 1.1, fontWeight: 600 }}>
                    {summary.usual.value}
                    <span className="text-sm text-muted" style={{ fontWeight: 400 }}> out of 10</span>
                  </p>
                  <p className="text-xs text-muted">from {summary.usual.based_on} check-ins</p>
                </div>
                <div role="group" aria-label="Last 7 days" className="rounded-2xl bg-surface p-4">
                  <p className="text-xs text-muted">Last 7 days</p>
                  {summary.recent_7d ? (
                    <>
                      <p className="text-ink" style={{ fontSize: 32, lineHeight: 1.1, fontWeight: 600 }}>
                        {summary.recent_7d.value}
                        <span className="text-sm text-muted" style={{ fontWeight: 400 }}> out of 10</span>
                      </p>
                      <p className="text-xs text-muted">from {summary.recent_7d.based_on} check-ins</p>
                    </>
                  ) : (
                    <p className="text-xs text-muted mt-1">not enough check-ins this week yet (it needs 3).</p>
                  )}
                </div>
              </div>
              {!summary.expected && summary.today_vs_usual && (
                <p className="text-sm text-ink text-center">{COMPARISON[summary.today_vs_usual.label]}</p>
              )}
            </div>
          )}

          {summary.expected && (
            <div role="group" aria-label="What we'd expect today" className="rounded-2xl bg-surface p-4 space-y-1">
              {expectedLines(summary.expected).map((line) => (
                <p key={line} className="text-sm text-ink text-center">
                  {line}
                </p>
              ))}
            </div>
          )}

          {summary.body_check && (
            <div role="group" aria-label={BODY_CHECK_TITLE} className="rounded-2xl bg-surface p-4 space-y-2">
              <p className="text-xs text-accent-load" style={{ fontWeight: 600 }}>
                {BODY_CHECK_TITLE}
              </p>
              <p className="text-sm text-ink">{bodyCheckMessage(summary.body_check).body}</p>
              <div className="flex gap-4">
                <button type="button" onClick={onWhy} className={linkButtonClass}>
                  See details
                </button>
                {bodyCheckMessage(summary.body_check).support && (
                  <button type="button" onClick={onSupport} className={linkButtonClass}>
                    Need support?
                  </button>
                )}
              </div>
            </div>
          )}

          {summary.recent_words.length > 0 && (
            <div>
              <p className="text-xs text-muted mb-1.5">Your words this week</p>
              <ul className="flex flex-wrap gap-2" aria-label="Your words this week">
                {summary.recent_words.map((w) => (
                  <li key={w.word} className={chipClass} style={WORD_CHIP}>
                    {w.word}
                    {w.count > 1 ? ` (${w.count})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {summary.recent_energy?.length > 0 && (
            <div>
              <p className="text-xs text-muted mb-1.5">What took your energy this week</p>
              <ul className="flex flex-wrap gap-2" aria-label="What took your energy this week">
                {summary.recent_energy.map((e) => (
                  <li key={e.tag} className={chipClass} style={energyChip(e.tag)}>
                    {e.tag} ({e.count})
                  </li>
                ))}
              </ul>
            </div>
          )}

          {summary.support_suggested && (
            <div role="group" aria-label="Support suggestion" className="rounded-2xl bg-surface p-4 text-center space-y-3">
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
        </div>
      )}

      <button onClick={onCheckIn} className={primaryPillClass} style={{ fontWeight: 500 }}>
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
