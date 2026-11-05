import { useState } from "react";
import { isNativeApp } from "../platform";
import {
  DENIED_MESSAGE,
  FAILED_MESSAGE,
  REMINDER_BODY,
  WEB_MESSAGE,
  formatTime,
  loadPrefs,
} from "../reminders";
import { reminders } from "../remindersService";

const card = "rounded-2xl border border-border p-4 text-center space-y-3";

/** The one-time offer shown after the first check-in. Answering it, either way, ends the offer. */
export function ReminderOffer({ userId }: { userId: string }) {
  const [prefs, setPrefs] = useState(() => loadPrefs(userId));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function yes() {
    setBusy(true);
    try {
      const result = await reminders.enable(userId);
      const saved = loadPrefs(userId);
      setPrefs(saved);
      setMessage(
        result === "denied"
          ? DENIED_MESSAGE
          : result === "web"
            ? WEB_MESSAGE
            : `Done. We'll remind you at ${formatTime(saved.time)} if you haven't checked in.`,
      );
    } catch {
      setMessage(FAILED_MESSAGE);
    } finally {
      setBusy(false);
    }
  }

  function notNow() {
    reminders.decline(userId);
    setPrefs(loadPrefs(userId));
  }

  if (message) {
    return (
      <p role="status" className={`${card} text-sm text-ink`}>
        {message}
      </p>
    );
  }
  if (prefs.asked) return null; // already answered, now or on an earlier visit

  return (
    <div role="group" aria-label="Daily reminder" className={card}>
      <p className="text-sm text-ink">Want a daily reminder?</p>
      <p className="text-xs text-muted">
        We'll send one at {formatTime(prefs.time)} if you haven't checked in. It never includes any health
        details.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={yes}
          disabled={busy}
          className="flex-1 py-2.5 bg-inverse text-on-inverse rounded-2xl text-sm disabled:opacity-50"
        >
          Yes, remind me
        </button>
        <button
          type="button"
          onClick={notNow}
          disabled={busy}
          className="flex-1 py-2.5 border border-border text-ink rounded-2xl text-sm"
        >
          Not now
        </button>
      </div>
    </div>
  );
}

/** On the website, which cannot send notifications, a prompt on Home stands in for the reminder. */
export function WebReminderBanner({ userId, todayDone }: { userId: string; todayDone: boolean }) {
  if (isNativeApp() || todayDone) return null;
  const prefs = loadPrefs(userId);
  if (!prefs.enabled) return null;
  const now = new Date();
  const clock = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  if (clock < prefs.time) return null;
  return (
    <p role="status" className={`${card} text-sm text-ink`}>
      {REMINDER_BODY}
    </p>
  );
}
