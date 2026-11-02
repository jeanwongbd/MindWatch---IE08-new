import { useEffect, useState } from "react";
import { SYNC_ENABLED } from "../config";
import { API_BASE_URL, ApiError, api, type DemoRecord, number } from "../api";
import { C } from "../theme";

interface Props {
  data?: DemoRecord;
  onCheckIn: () => void;
  onWhy: () => void;
}

function stressColor(v: number) {
  if (v <= 3) return C.calm;
  if (v <= 6) return C.load;
  return C.stress;
}

function loadColor(v: number) {
  if (v < 50) return C.calm;
  return C.stress;
}

function stressLabel(v: number) {
  if (v <= 3) return "Low stress";
  if (v <= 6) return "Moderate";
  return "High stress";
}

function contributorClass(direction: string) {
  if (direction === "negative") return "text-accent-stress";
  if (direction === "positive") return "text-accent-calm";
  return "text-muted";
}

export default function TodayScreen({
  data: initialData,
  onCheckIn,
  onWhy,
}: Props) {
  const [data, setData] = useState<any>(initialData || null);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);

  // Live telemetry state from Fitbit sync
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [liveTelemetry, setLiveTelemetry] = useState<{
    heartRate: number;
    bodyLoad: number;
    syncedAt: string;
  } | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("sync_error")) return;
    setSyncMessage("Google sign-in was cancelled.");
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  // Synchronize incoming props
  useEffect(() => {
    if (initialData) {
      setData(initialData);
      setLoading(false);
    }
  }, [initialData]);

  // Fallback fetch if not provided via props
  useEffect(() => {
    if (initialData) return;

    api<any>("/today")
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message);
        setLoading(false);
      });
  }, [initialData]);

  const handleLiveSync = async () => {
    try {
      setIsSyncing(true);
      setSyncMessage(null);
      const json = await api<any>("/api/fitbit/sync-live");
      if (json?.status === "success") {
        setLiveTelemetry({
          heartRate: json.latest_heart_rate,
          bodyLoad: json.body_load,
          syncedAt: json.synced_at,
        });
        return;
      }

      setLiveTelemetry(null);
      setSyncMessage("No recent heart rate data from your watch.");
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = `${API_BASE_URL}/api/fitbit/login`;
        return;
      }
      console.error("Live sync failed:", err);
      setLiveTelemetry(null);
      setSyncMessage(
        err instanceof ApiError && err.status
          ? "Couldn't reach Google. Please try again."
          : "Couldn't sync right now. Please try again.",
      );
    } finally {
      setIsSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-muted font-mono text-xs">
        Loading today's biometric profile...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 text-sm text-accent-stress font-mono">
        Could not connect to FastAPI server at {API_BASE_URL}.
      </div>
    );
  }

  const stressVal = data.reported_stress?.value ?? 0;
  const stressScale = data.reported_stress?.scale_max ?? 10;
  const normalizedStress =
    stressScale === 10 ? stressVal : Math.round(stressVal / 10);

  const estimate = data.wearable_estimate || {};

  // Calculate active load value (live sync override or model baseline)
  const currentLoad = liveTelemetry
    ? liveTelemetry.bodyLoad
    : (estimate.value ?? null);

  // Comparison logic: Compare normalized self-report (0-100) vs physiological load
  const perceivedHundred = normalizedStress * 10;
  const diff = currentLoad == null ? 0 : currentLoad - perceivedHundred;

  let comparison = {
    label: "SCORES TALLY WITH BIOMETRICS",
    description:
      "Your reported stress matches your body's physiological indicators.",
    state: "balanced",
  };

  if (!liveTelemetry && (data.comparison || data.mismatch)) {
    // Not synced: show the backend's own comparison unchanged
    comparison = data.comparison || data.mismatch;
  } else if (diff > 20) {
    comparison = {
      label: "REPORTED LOWER, LOAD HIGHER",
      description:
        "Your body is showing signs of acute sympathetic load beyond what you self-reported.",
      state: "estimate_high_reported_low",
    };
  } else if (diff < -20) {
    comparison = {
      label: "REPORTED HIGHER, LOAD LOWER",
      description:
        "Your perceived mental stress is higher than your wearable physiological indicators.",
      state: "estimate_low_reported_high",
    };
  }

  const isMismatch =
    comparison.state === "estimate_high_reported_low" ||
    comparison.state === "estimate_low_reported_high";

  // Backend contributors, plus the live reading when one exists
  const contributors = [
    ...(data.contributors ?? []),
    ...(liveTelemetry
      ? [
          {
            feature: "live pulse",
            direction: "neutral",
            description: `${liveTelemetry.heartRate} bpm (${liveTelemetry.bodyLoad >= 50 ? "Elevated load" : "Below load threshold"})`,
          },
        ]
      : []),
  ];

  return (
    <div className="px-6 py-4 space-y-5">
      {/* Header */}
      <div className="flex items-baseline justify-between">
        <div>
          <p
            style={{ fontFamily: "var(--font-mono)" }}
            className="text-[10px] tracking-[0.2em] uppercase text-muted"
          >
            {liveTelemetry
              ? "LIVE WEARABLE TELEMETRY"
              : data.date || data.source_label || "2026-08-25"}
          </p>
          <h1
            style={{ fontFamily: "var(--font-display)" }}
            className="text-2xl font-light text-ink mt-0.5"
          >
            Good morning
          </h1>
        </div>
        <div className="w-8 h-8 rounded-full bg-surface-raised border border-border flex items-center justify-center text-[10px] text-muted font-mono">
          {data.user_id ? data.user_id.slice(-3).toUpperCase() : "DEM"}
        </div>
      </div>

      {/* Two input cards */}
      <div className="grid grid-cols-2 gap-3">
        {/* HOW I FEEL */}
        <div className="bg-surface border border-border rounded-2xl p-4 space-y-3">
          <p
            style={{ fontFamily: "var(--font-mono)" }}
            className="text-[9px] tracking-[0.2em] uppercase text-muted"
          >
            How I feel
          </p>
          <div className="flex items-end gap-1">
            <span
              style={{
                fontFamily: "var(--font-display)",
                lineHeight: 1,
                color: stressColor(normalizedStress),
              }}
              className="text-[48px] font-light transition-colors duration-200"
            >
              {typeof number === "function" ? number(stressVal) : stressVal}
            </span>
            <span
              style={{ fontFamily: "var(--font-display)" }}
              className="text-lg text-muted mb-1.5"
            >
              /{stressScale}
            </span>
          </div>
          <div>
            <p
              style={{
                fontFamily: "var(--font-mono)",
                color: stressColor(normalizedStress),
              }}
              className="text-[10px] transition-colors duration-200"
            >
              {stressLabel(normalizedStress)}
            </p>
            <p className="text-[9px] text-dim mt-0.5 truncate">
              {data.reported_stress?.source === "demo_checkin"
                ? "Demo check-in override"
                : data.mode === "synthetic_scenario"
                  ? "Synthetic scenario"
                  : "Historical SSAQS response"}
            </p>
          </div>
        </div>

        {/* MY BODY (LOAD) */}
        <div className="bg-surface border border-border rounded-2xl p-4 space-y-3">
          <p
            style={{ fontFamily: "var(--font-mono)" }}
            className="text-[9px] tracking-[0.2em] uppercase text-muted"
          >
            My body (Load)
          </p>
          <div className="flex items-end gap-1">
            <span
              style={{
                fontFamily: "var(--font-display)",
                lineHeight: 1,
                color: currentLoad == null ? C.dim : loadColor(Number(currentLoad)),
              }}
              className="text-[48px] font-light transition-colors duration-200"
            >
              {currentLoad == null ? "--" : number(currentLoad)}
            </span>
            <span
              style={{ fontFamily: "var(--font-display)" }}
              className="text-lg text-muted mb-1.5"
            >
              /100
            </span>
          </div>
          <div>
            <p
              style={{
                fontFamily: "var(--font-mono)",
                color: currentLoad == null ? C.dim : loadColor(Number(currentLoad)),
              }}
              className="text-[10px] transition-colors duration-200"
            >
              {currentLoad == null
                ? "Not enough data"
                : currentLoad >= 50
                  ? "At or above 50"
                  : "Below 50"}
            </p>
            <p className="text-[9px] text-dim mt-0.5 truncate">
              {liveTelemetry
                ? `Live: ${liveTelemetry.heartRate} bpm`
                : currentLoad == null
                  ? "No estimate"
                  : estimate.method === "synthetic_fixture"
                    ? "Synthetic fixture"
                    : "Ridge V2 Personal model"}
            </p>
          </div>
        </div>
      </div>

      {!liveTelemetry && currentLoad != null && data.imputed_features?.length > 0 && (
        <p className="text-[11px] text-accent-load text-center">
          This estimate used filled-in values for {data.imputed_features.length} of 4 inputs.
        </p>
      )}

      {/* Comparison / Mismatch Banner */}
      <div
        className={`rounded-2xl p-4 border transition-colors ${
          isMismatch
            ? "bg-alert-surface border-accent-load/30"
            : "bg-surface border-border"
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${
              isMismatch ? "bg-accent-load" : "bg-accent-calm"
            }`}
          />
          <div>
            <p
              style={{ fontFamily: "var(--font-mono)" }}
              className={`text-[10px] tracking-[0.15em] uppercase mb-1 ${
                isMismatch ? "text-accent-load" : "text-accent-calm"
              }`}
            >
              {comparison.label}
            </p>
            <p className="text-[13px] text-ink leading-snug">
              {comparison.description}
            </p>
            <button
              onClick={onWhy}
              style={{ fontFamily: "var(--font-mono)" }}
              className="text-[11px] text-accent-load mt-2 underline underline-offset-2 hover:text-accent-load transition-colors inline-block"
            >
              See biometric breakdown →
            </button>
          </div>
        </div>
      </div>

      {/* Dynamic Biometric Contributors (Multi-Modal: Sleep + Pulse) */}
      <div className="bg-surface border border-border rounded-2xl divide-y divide-border">
        {contributors.map((c: any, idx: number) => (
          <div
            key={idx}
            className="flex items-center justify-between gap-3 px-4 py-3"
          >
            <span
              style={{ fontFamily: "var(--font-mono)" }}
              className="text-[11px] text-muted uppercase tracking-wide"
            >
              {c.feature}
            </span>
            <span
              style={{ fontFamily: "var(--font-mono)" }}
              className={`text-[11px] text-right ${contributorClass(c.direction)}`}
            >
              {c.description}
            </span>
          </div>
        ))}
      </div>

      {/* Live Wearable Sync Trigger */}
      {SYNC_ENABLED && data.mode !== "synthetic_scenario" && (
      <>
      <button
        onClick={handleLiveSync}
        disabled={isSyncing}
        className="w-full py-3.5 bg-accent-load text-white rounded-2xl hover:opacity-90 active:opacity-80 transition-opacity flex items-center justify-center gap-2"
        style={{ fontFamily: "var(--font-body)", fontWeight: 500 }}
      >
        {isSyncing ? (
          <span>Syncing from Fitbit...</span>
        ) : (
          <span>⚡ Sync Live Watch</span>
        )}
      </button>
      {syncMessage && (
        <p role="status" className="text-center text-[11px] font-mono text-muted">
          {syncMessage}
        </p>
      )}
      </>
      )}

      {/* CTA Button */}
      {data.mode === "synthetic_scenario" ? (
        <p className="text-center text-[11px] font-mono text-muted">
          Synthetic scenarios are read-only fixtures.
        </p>
      ) : (
        <button
          onClick={onCheckIn}
          className="w-full py-3.5 bg-ink text-background rounded-2xl hover:opacity-90 active:opacity-80 transition-opacity"
          style={{ fontFamily: "var(--font-body)", fontWeight: 500 }}
        >
          {data.reported_stress?.source === "demo_checkin"
            ? "Edit today's check-in"
            : "Log today's stress"}
        </button>
      )}

      {/* Disclaimer / Model limitations */}
      {data.limitation && (
        <p className="text-[10px] text-dim leading-relaxed text-center px-2">
          {data.limitation}
        </p>
      )}
    </div>
  );
}
