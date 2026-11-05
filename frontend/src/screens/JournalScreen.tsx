import { useEffect, useState } from "react";
import { api } from "../api";
import { utcOffsetMinutes } from "../checkinWords";
import AuthFrame, { friendlyError, inputClass, linkButtonClass, primaryButtonClass } from "./AuthFrame";

export const JOURNAL_MAX = 2000;

interface Entry {
  id: string;
  date: string;
  text: string;
  created_at: string;
  updated_at: string;
}

// The only place that knows the shape of the list reply: {"entries": [...]} (a bare list also works).
async function fetchEntries(): Promise<Entry[]> {
  const reply = await api<Entry[] | { entries: Entry[] }>("/me/journal?limit=50");
  return Array.isArray(reply) ? reply : (reply.entries ?? []);
}

function dayText(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

const secondaryButtonClass = "px-3 py-1.5 bg-surface border border-border text-ink rounded-xl text-xs hover:opacity-90 disabled:opacity-50";

interface Props {
  onBack: () => void;
  onSupport: () => void;
}

/** A private journal. Typing or dictating on the phone keyboard both end up as plain text. */
export default function JournalScreen({ onBack, onSupport }: Props) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [entryError, setEntryError] = useState("");

  useEffect(() => {
    let live = true;
    fetchEntries()
      .then((list) => {
        if (live) setEntries(list);
      })
      .catch((e) => {
        if (live) setError(friendlyError(e));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  const valid = (t: string) => t.trim().length > 0 && t.length <= JOURNAL_MAX;

  async function save() {
    if (!valid(text)) return;
    setSaving(true);
    setError("");
    try {
      const entry = await api<Entry>("/me/journal", {
        method: "POST",
        body: JSON.stringify({ text, utc_offset_minutes: utcOffsetMinutes() }),
      });
      setEntries((list) => [entry, ...list]);
      setText("");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(id: string) {
    if (!valid(editText)) return;
    setBusy(true);
    setEntryError("");
    try {
      const updated = await api<Entry>(`/me/journal/${id}`, { method: "PUT", body: JSON.stringify({ text: editText }) });
      setEntries((list) => list.map((e) => (e.id === id ? updated : e)));
      setEditingId(null);
    } catch (e) {
      setEntryError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setEntryError("");
    try {
      await api(`/me/journal/${id}`, { method: "DELETE" });
      setEntries((list) => list.filter((e) => e.id !== id));
      setDeletingId(null);
    } catch (e) {
      setEntryError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame title="Journal">
      <div>
        <label htmlFor="journal-text" className="block text-sm text-ink mb-1.5">
          Write about your day
        </label>
        <textarea
          id="journal-text"
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className={inputClass}
        />
        <p className={`text-[11px] text-right mt-1 ${text.length > JOURNAL_MAX ? "text-accent-stress" : "text-dim"}`}>
          {text.length} / {JOURNAL_MAX}
        </p>
        <p className="text-xs text-muted mt-1">Prefer to talk? Tap the microphone on your phone's keyboard and speak.</p>
      </div>
      {error && (
        <p role="alert" className="text-xs text-accent-stress text-center">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={save}
        disabled={!valid(text) || saving}
        className={primaryButtonClass}
        style={{ fontWeight: 500 }}
      >
        {saving ? "Saving…" : "Save"}
      </button>

      <div className="space-y-3">
        <h2 className="text-base text-ink text-center">Past entries</h2>
        {loading && (
          <p role="status" className="text-xs text-muted text-center font-mono">
            Loading…
          </p>
        )}
        {!loading && entries.length === 0 && <p className="text-xs text-muted text-center">No entries yet.</p>}
        {entryError && (
          <p role="alert" className="text-xs text-accent-stress text-center">
            {entryError}
          </p>
        )}
        <ul className="space-y-3">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-2xl border border-border p-4 space-y-2">
              <p className="text-xs text-muted">{dayText(entry.date)}</p>
              {editingId === entry.id ? (
                <div className="space-y-2">
                  <textarea
                    aria-label="Edit entry"
                    rows={5}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className={inputClass}
                  />
                  <p className={`text-[11px] text-right ${editText.length > JOURNAL_MAX ? "text-accent-stress" : "text-dim"}`}>
                    {editText.length} / {JOURNAL_MAX}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => saveEdit(entry.id)}
                      disabled={!valid(editText) || busy}
                      className={secondaryButtonClass}
                    >
                      Save changes
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} disabled={busy} className={secondaryButtonClass}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-ink" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                    {entry.text}
                  </p>
                  {deletingId === entry.id ? (
                    <div className="space-y-2">
                      <p className="text-xs text-ink">Delete this entry?</p>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => remove(entry.id)} disabled={busy} className={secondaryButtonClass}>
                          Delete
                        </button>
                        <button type="button" onClick={() => setDeletingId(null)} disabled={busy} className={secondaryButtonClass}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(entry.id);
                          setEditText(entry.text);
                          setDeletingId(null);
                          setEntryError("");
                        }}
                        className={secondaryButtonClass}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeletingId(entry.id);
                          setEditingId(null);
                          setEntryError("");
                        }}
                        className={secondaryButtonClass}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-muted text-center">
        If writing brings up something hard, support is available.{" "}
        <button type="button" onClick={onSupport} className={linkButtonClass}>
          Need support?
        </button>
      </p>
      <div>
        <button type="button" onClick={onBack} className={linkButtonClass}>
          Back to Home
        </button>
      </div>
    </AuthFrame>
  );
}
