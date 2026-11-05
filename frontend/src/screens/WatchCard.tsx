import { useEffect, useState } from "react";
import { api } from "../api";
import { isNativeApp } from "../platform";
import { fetchWatchDays, loadWatchPrefs, type SavedWatchDay } from "../watch";
import { watchService } from "../watchService";
import { linkButtonClass } from "./AuthFrame";

const SYNC_EVERY_MINUTES = 10;
// When each person's watch data was last sent from this phone, so opening Home again does not resend.
const lastSent = new Map<string, number>();

const NOT_AVAILABLE = "not available";

/** 435 minutes as "7 h 15 min". */
export function sleepText(minutes: number | null): string {
  if (minutes === null) return NOT_AVAILABLE;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export const stepsText = (steps: number | null) => (steps === null ? NOT_AVAILABLE : steps.toLocaleString("en-US"));
export const heartText = (bpm: number | null) => (bpm === null ? NOT_AVAILABLE : `${bpm} beats a minute on average`);

function dayText(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

const hasData = (d: SavedWatchDay) => d.steps !== null || d.sleep_minutes !== null || d.heart_rate_avg !== null;

type Eligible = "checking" | "yes" | "no";

interface Props {
  userId: string;
  onOpen: () => void;
  /** A sample copy: its saved watch data came from the study, not from a phone. */
  isSample?: boolean;
}

/**
 * The watch data on Home. Shown only in the Android app and only to people who said they have a
 * watch. It states plain facts, never a cause, and never gets in the way of a check-in: if the sync
 * fails it says so and nothing else changes.
 */
export default function WatchCard({ userId, onOpen, isSample = false }: Props) {
  const native = isNativeApp();
  const [eligible, setEligible] = useState<Eligible>(native ? "checking" : "no");
  const [days, setDays] = useState<SavedWatchDay[] | null>(null);
  const [status, setStatus] = useState<"idle" | "syncing" | "failed">("idle");
  const connected = loadWatchPrefs(userId).connected;

  useEffect(() => {
    if (!native) return;
    let live = true;
    api<{ wears_watch?: boolean }>("/me/checkins/setup")
      .then((setup) => {
        if (live) setEligible(setup.wears_watch === true ? "yes" : "no");
      })
      .catch(() => {
        if (live) setEligible("no");
      });
    return () => {
      live = false;
    };
  }, [native]);

  // On the website the card is read-only: it only shows what the phone already saved.
  useEffect(() => {
    if (native) return;
    let live = true;
    api<{ wears_watch?: boolean }>("/me/checkins/setup")
      .then((setup) => (setup.wears_watch === true ? fetchWatchDays() : null))
      .then((r) => {
        if (live && r) setDays(r.measurements);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [native]);

  useEffect(() => {
    if (eligible !== "yes" || !connected) return;
    let live = true;
    const recently = Date.now() - (lastSent.get(userId) ?? 0) < SYNC_EVERY_MINUTES * 60_000;
    const show = () =>
      fetchWatchDays()
        .then((r) => {
          if (live) setDays(r.measurements);
        })
        .catch(() => {});
    if (recently) {
      show();
      return () => {
        live = false;
      };
    }
    setStatus("syncing");
    watchService
      .sync()
      .then(() => {
        lastSent.set(userId, Date.now());
        if (live) setStatus("idle");
      })
      .catch(() => {
        if (live) setStatus("failed");
      })
      // Whatever happened to the sync, show what is already saved.
      .finally(show);
    return () => {
      live = false;
    };
  }, [eligible, connected, userId]);

  if (!native) {
    const saved = days?.find(hasData);
    if (!saved) return null;
    return (
      <div role="group" aria-label="Your watch data" className="rounded-2xl border border-border p-4 space-y-1.5 text-sm text-ink">
        <p className="text-xs text-muted">Your watch data, {dayText(saved.date)}</p>
        <p>Steps: {stepsText(saved.steps)}</p>
        <p>Sleep: {sleepText(saved.sleep_minutes)}</p>
        <p>Heart rate: {heartText(saved.heart_rate_avg)}</p>
        <p className="text-xs text-muted">
          {isSample ? "Sample data from the study." : "Synced from the MindWatch Android app."}
        </p>
      </div>
    );
  }

  if (eligible !== "yes") return null;

  if (!connected) {
    return (
      <div role="group" aria-label="Your watch data" className="rounded-2xl border border-border p-4 text-center space-y-3">
        <p className="text-sm text-ink">Your watch can add steps, sleep and heart rate to your account.</p>
        <button type="button" onClick={onOpen} className={linkButtonClass}>
          Connect your watch data
        </button>
      </div>
    );
  }

  const latest = days?.find(hasData);

  return (
    <div role="group" aria-label="Your watch data" className="rounded-2xl border border-border p-4 space-y-1.5 text-sm text-ink">
      <p className="text-xs text-muted">
        Your watch data{latest ? `, ${dayText(latest.date)}` : ""}
      </p>
      {latest ? (
        <>
          <p>Steps: {stepsText(latest.steps)}</p>
          <p>Sleep: {sleepText(latest.sleep_minutes)}</p>
          <p>Heart rate: {heartText(latest.heart_rate_avg)}</p>
        </>
      ) : (
        days !== null && (
          <p className="text-muted">
            No watch data yet. Open the Fitbit app so your watch can sync, then come back.
          </p>
        )
      )}
      {status === "syncing" && (
        <p role="status" className="text-xs text-muted">
          Checking your watch…
        </p>
      )}
      {status === "failed" && (
        <p role="status" className="text-xs text-muted">
          Couldn't read your watch data just now. Your check-ins aren't affected.
        </p>
      )}
      <button type="button" onClick={onOpen} className={linkButtonClass}>
        Manage
      </button>
    </div>
  );
}
