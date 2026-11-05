import { useState } from "react";
import { loadWatchPrefs, saveWatchPrefs } from "../watch";
import { watchService } from "../watchService";
import AuthFrame, { friendlyError, linkButtonClass, primaryButtonClass } from "./AuthFrame";

interface Props {
  userId: string;
  onBack: () => void;
}

const outline =
  "w-full py-3 bg-surface border border-border text-ink rounded-2xl text-sm hover:opacity-90 disabled:opacity-50";

/** Connect or disconnect the watch data. Reads steps, sleep and heart rate, and nothing else. */
export default function WatchScreen({ userId, onBack }: Props) {
  const [connected, setConnected] = useState(() => loadWatchPrefs(userId).connected);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function connect() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      // Reading first proves Health Connect allows it, before anything is switched on.
      await watchService.read();
      saveWatchPrefs(userId, { connected: true });
      setConnected(true);
      setMessage("Connected. Your watch data will be added when you open the app.");
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? `${e.message} Check that Health Connect is installed and that you allowed MindWatch.`
          : friendlyError(e),
      );
    } finally {
      setBusy(false);
    }
  }

  function disconnect() {
    saveWatchPrefs(userId, { connected: false });
    setConnected(false);
    setError("");
    setMessage(
      "Disconnected. Nothing more will be read. What was already added stays in your account until you delete it, and you can remove MindWatch's access in Health Connect.",
    );
  }

  return (
    <AuthFrame title="Your watch data">
      <p className="text-xs text-muted">
        MindWatch can read three things from Health Connect on this phone, which your watch fills in: your steps,
        your sleep and your heart rate. It only reads them, only when you open the app, and adds them to your own
        account. It never changes them. This is not medical advice.
      </p>
      {connected ? (
        <button type="button" onClick={disconnect} className={outline}>
          Disconnect
        </button>
      ) : (
        <button type="button" onClick={connect} disabled={busy} className={primaryButtonClass}>
          {busy ? "Connecting…" : "Connect"}
        </button>
      )}
      {message && (
        <p role="status" className="text-xs text-accent-calm">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-accent-stress">
          {error}
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
