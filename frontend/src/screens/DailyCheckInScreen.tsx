import { useEffect, useState } from "react";
import { ApiError, api } from "../api";
import { WORDS, dayBefore, localDate, utcOffsetMinutes } from "../checkinWords";
import { reminders } from "../remindersService";
import AuthFrame, { friendlyError, linkButtonClass, primaryButtonClass } from "./AuthFrame";

interface SavedCheckin {
  date: string;
  stress: number;
  word: string | null;
}

type Which = "today" | "yesterday";

const dayFor = (which: Which) => (which === "today" ? localDate() : dayBefore(localDate()));

const chip = (selected: boolean) =>
  `px-3 py-2 rounded-full border text-sm ${
    selected ? "border-ink bg-ink text-background" : "border-border bg-input text-ink"
  }`;

interface Props {
  userId: string;
  onBack: () => void;
}

/** The signed-in daily check-in: a stress number and an optional word. Separate from the demo's. */
export default function DailyCheckInScreen({ userId, onBack }: Props) {
  const [which, setWhich] = useState<Which>("today");
  const [stress, setStress] = useState<number | null>(null);
  const [word, setWord] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Show what was already saved for the chosen day, so it can be changed.
  useEffect(() => {
    let live = true;
    setLoading(true);
    setStress(null);
    setWord(null);
    setMessage("");
    setError("");
    api<SavedCheckin>(`/me/checkins/${dayFor(which)}`)
      .then((saved) => {
        if (!live) return;
        setStress(saved.stress);
        setWord(saved.word);
      })
      .catch((e) => {
        // 404 just means nothing is saved for that day yet.
        if (live && !(e instanceof ApiError && e.status === 404)) setError(friendlyError(e));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [which]);

  async function save() {
    if (stress === null) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await api(`/me/checkins/${dayFor(which)}`, {
        method: "PUT",
        body: JSON.stringify({ stress, word, utc_offset_minutes: utcOffsetMinutes() }),
      });
      setMessage("Saved. You can change it until the day ends.");
      if (which === "today") {
        // Today is done, so today's reminder is not needed.
        reminders.setTodayDone(true);
        reminders.sync(userId).catch(() => {});
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthFrame title="Daily check-in">
      <div className="flex gap-2 justify-center" role="group" aria-label="Which day">
        {(["today", "yesterday"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={which === option}
            onClick={() => setWhich(option)}
            className={chip(which === option)}
          >
            {option === "today" ? "Today" : "Yesterday"}
          </button>
        ))}
      </div>

      <h2 className="text-base text-ink text-center">How stressed do you feel?</h2>
      <div>
        <div className="grid grid-cols-6 gap-2" role="group" aria-label="Stress, 0 to 10">
          {Array.from({ length: 11 }, (_, n) => n).map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={stress === n}
              onClick={() => setStress(n)}
              disabled={loading}
              className={`py-2.5 rounded-xl border text-sm ${
                stress === n ? "border-ink bg-ink text-background" : "border-border bg-input text-ink"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-dim mt-2">
          <span>0 = not stressed</span>
          <span>10 = extremely stressed</span>
        </div>
      </div>

      <div>
        <h2 className="text-base text-ink text-center">Pick a word for the day</h2>
        <p className="text-[11px] text-dim text-center mb-2">Optional. Tap again to clear it.</p>
        <div className="flex flex-wrap gap-2 justify-center" role="group" aria-label="Word of the day">
          {WORDS.map((w) => (
            <button
              key={w}
              type="button"
              aria-pressed={word === w}
              onClick={() => setWord(word === w ? null : w)}
              disabled={loading}
              className={chip(word === w)}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-xs text-accent-stress text-center">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-xs text-accent-calm text-center">
          {message}
        </p>
      )}
      <button
        type="button"
        onClick={save}
        disabled={stress === null || saving || loading}
        className={primaryButtonClass}
        style={{ fontWeight: 500 }}
      >
        {saving ? "Saving…" : "Save check-in"}
      </button>
      <div>
        <button type="button" onClick={onBack} className={linkButtonClass}>
          Back
        </button>
      </div>
    </AuthFrame>
  );
}
