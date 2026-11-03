import { useState, type FormEvent } from "react";
import { api, type AuthUser } from "../api";
import { isNativeApp } from "../platform";
import AuthFrame, { friendlyError, inputClass, linkButtonClass, primaryButtonClass } from "./AuthFrame";

const MIN_PASSWORD = 10;

interface Props {
  user: AuthUser;
  onBack: () => void;
  onSupport: () => void;
  /** Called after the account and all its data have been deleted. */
  onDeleted: () => void;
}

const section = "rounded-2xl border border-border p-4 space-y-3";
const outlineButton =
  "w-full py-3 border border-border text-ink rounded-2xl text-sm hover:opacity-90 disabled:opacity-50";

function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setDone("");
    if (next.length < MIN_PASSWORD) return setError(`The new password must be at least ${MIN_PASSWORD} characters.`);
    if (next !== again) return setError("The two new passwords don't match.");
    if (next === current) return setError("Choose a password you haven't used just now.");
    setBusy(true);
    try {
      await api("/auth/password", {
        method: "POST",
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      setCurrent("");
      setNext("");
      setAgain("");
      setDone("Password changed. Your other devices have been signed out.");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={section} aria-label="Change password">
      <h2 className="text-sm text-ink">Change password</h2>
      <div>
        <label htmlFor="pw-current" className="block text-xs text-muted mb-1">
          Current password
        </label>
        <input id="pw-current" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label htmlFor="pw-new" className="block text-xs text-muted mb-1">
          New password
        </label>
        <input id="pw-new" type="password" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} className={inputClass} />
        <p className="text-[11px] text-dim mt-1">At least {MIN_PASSWORD} characters.</p>
      </div>
      <div>
        <label htmlFor="pw-again" className="block text-xs text-muted mb-1">
          New password again
        </label>
        <input id="pw-again" type="password" autoComplete="new-password" required value={again} onChange={(e) => setAgain(e.target.value)} className={inputClass} />
      </div>
      {error && (
        <p role="alert" className="text-xs text-accent-stress">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="text-xs text-accent-calm">
          {done}
        </p>
      )}
      <button type="submit" disabled={busy} className={primaryButtonClass}>
        {busy ? "Changing…" : "Change password"}
      </button>
    </form>
  );
}

function DownloadMyData() {
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const native = isNativeApp();

  async function show() {
    setBusy(true);
    setError("");
    setNote("");
    try {
      setText(JSON.stringify(await api<unknown>("/me/export"), null, 2));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  function saveAsFile() {
    if (text === null) return;
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "mindwatch-my-data.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setNote("Saved as mindwatch-my-data.json.");
  }

  async function copy() {
    if (text === null) return;
    try {
      await navigator.clipboard.writeText(text);
      setNote("Copied. You can paste it into a note or an email to keep it.");
    } catch {
      setNote("Couldn't copy it. You can select the text above and copy it by hand.");
    }
  }

  return (
    <div className={section} role="group" aria-label="Download my data">
      <h2 className="text-sm text-ink">Download my data</h2>
      <p className="text-xs text-muted">
        See everything MindWatch has stored about you: your account, your agreement, your starting-point answers
        and your check-ins. It never includes your password.
      </p>
      {text === null ? (
        <button type="button" onClick={show} disabled={busy} className={outlineButton}>
          {busy ? "Loading…" : "Show my data"}
        </button>
      ) : (
        <>
          <pre
            aria-label="Your data"
            className="max-h-56 overflow-auto rounded-xl bg-input p-3 text-[11px] text-ink whitespace-pre-wrap break-words"
          >
            {text}
          </pre>
          {native ? (
            // The Android app cannot save a file from a web page (it ignores the download and saves
            // nothing), so it only offers Copy, and says how to keep the data.
            <>
              <p className="text-xs text-muted">Tap Copy, then paste it into a note or an email to keep it.</p>
              <button type="button" onClick={copy} className={outlineButton}>
                Copy
              </button>
            </>
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={saveAsFile} className={outlineButton}>
                Save as file
              </button>
              <button type="button" onClick={copy} className={outlineButton}>
                Copy
              </button>
            </div>
          )}
          <button type="button" onClick={() => setText(null)} className={linkButtonClass}>
            Hide
          </button>
        </>
      )}
      {note && (
        <p role="status" className="text-xs text-accent-calm">
          {note}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-accent-stress">
          {error}
        </p>
      )}
    </div>
  );
}

function DeleteAccount({ onDeleted }: { onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/me/delete", { method: "POST", body: JSON.stringify({ password }) });
      onDeleted();
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <div className={section} role="group" aria-label="Delete my account">
        <h2 className="text-sm text-ink">Delete my account</h2>
        <p className="text-xs text-muted">Remove your account and everything stored about you.</p>
        <button type="button" onClick={() => setConfirming(true)} className={outlineButton}>
          Delete my account
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={`${section} border-accent-stress`} aria-label="Confirm deleting my account">
      <h2 className="text-sm text-ink">Delete my account?</h2>
      <p className="text-sm text-ink">This permanently deletes your account and every check-in. This can't be undone.</p>
      <div>
        <label htmlFor="delete-password" className="block text-xs text-muted mb-1">
          Type your password to confirm
        </label>
        <input id="delete-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
      </div>
      {error && (
        <p role="alert" className="text-xs text-accent-stress">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="w-full py-3 bg-accent-stress text-white rounded-2xl text-sm disabled:opacity-50"
        style={{ fontWeight: 500 }}
      >
        {busy ? "Deleting…" : "Delete everything"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setConfirming(false);
          setPassword("");
          setError("");
        }}
        className={outlineButton}
      >
        Cancel
      </button>
    </form>
  );
}

/** Account control: change the password, see your data, delete your account. */
export default function AccountScreen({ user, onBack, onSupport, onDeleted }: Props) {
  return (
    <AuthFrame title="Account">
      <p className="text-xs text-muted text-center">
        Signed in as <span className="text-ink">{user.email}</span>
      </p>
      <ChangePassword />
      <DownloadMyData />
      <DeleteAccount onDeleted={onDeleted} />
      <div className="flex justify-between">
        <button type="button" onClick={onSupport} className={linkButtonClass}>
          Need support?
        </button>
        <button type="button" onClick={onBack} className={linkButtonClass}>
          Back
        </button>
      </div>
    </AuthFrame>
  );
}
