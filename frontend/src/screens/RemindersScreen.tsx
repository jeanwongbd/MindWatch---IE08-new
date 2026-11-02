import { useState } from "react";
import { isNativeApp } from "../platform";
import { DENIED_MESSAGE, FAILED_MESSAGE, WEB_MESSAGE, formatTime, loadPrefs } from "../reminders";
import { reminders } from "../remindersService";
import AuthFrame, { inputClass, linkButtonClass } from "./AuthFrame";

interface Props {
  userId: string;
  onBack: () => void;
}

/** Turn the daily reminder on or off and choose its time. */
export default function RemindersScreen({ userId, onBack }: Props) {
  const [prefs, setPrefs] = useState(() => loadPrefs(userId));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const native = isNativeApp();

  async function toggle(on: boolean) {
    setBusy(true);
    setMessage("");
    try {
      if (on) {
        const result = await reminders.enable(userId, prefs.time);
        if (result === "denied") setMessage(DENIED_MESSAGE);
        else if (result === "web") setMessage(WEB_MESSAGE);
      } else {
        await reminders.disable(userId);
        setMessage("The daily reminder is off.");
      }
    } catch {
      setMessage(FAILED_MESSAGE);
    } finally {
      setPrefs(loadPrefs(userId));
      setBusy(false);
    }
  }

  async function changeTime(time: string) {
    if (!time) return; // the field is cleared while typing
    setPrefs({ ...prefs, time });
    try {
      await reminders.setTime(userId, time);
      if (prefs.enabled) setMessage(`Reminder time set to ${formatTime(time)}.`);
    } catch {
      setMessage(FAILED_MESSAGE);
    }
  }

  return (
    <AuthFrame title="Reminders">
      <label className="flex items-center justify-between gap-3 text-sm text-ink">
        <span>Daily reminder</span>
        <input
          type="checkbox"
          role="switch"
          checked={prefs.enabled}
          disabled={busy}
          onChange={(e) => toggle(e.target.checked)}
          className="h-5 w-5"
        />
      </label>

      <div>
        <label htmlFor="reminder-time" className="block text-xs text-muted mb-1">
          Reminder time
        </label>
        <input
          id="reminder-time"
          type="time"
          value={prefs.time}
          onChange={(e) => changeTime(e.target.value)}
          className={inputClass}
        />
      </div>

      <p className="text-xs text-muted">
        {native
          ? "We'll send a short reminder at this time if you haven't checked in that day. It may arrive a little late, and it never includes any health details."
          : WEB_MESSAGE}
      </p>

      {message && (
        <p role="status" className="text-xs text-ink">
          {message}
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
