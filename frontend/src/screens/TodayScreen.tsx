import { useEffect, useState } from "react";
import { type DemoRecord, number } from "../api";
import { C } from "../theme";

interface Props {
  data?: DemoRecord;
  onCheckIn: () => void;
  onWhy: () => void;
}

const API_BASE_URL = "https://mindwatch-ie08.onrender.com";

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

export default function TodayScreen({
  data: initialData,
  onCheckIn,
  onWhy,
}: Props) {
  const [data, setData] = useState<any>(initialData || null);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);

  // Live telemetry state from Fitbit / Google Fitness API
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [liveTelemetry, setLiveTelemetry] = useState<{
    heartRate: number;
    bodyLoad: number;
    syncedAt: string;
  } | null>(null);

  // If data is passed as a prop from parent, synchronize it
  useEffect(() => {
    if (initialData) {
      setData(initialData);
      setLoading(false);
    }
  }, [initialData]);

  // Fallback fetch if not provided via props
  useEffect(() => {
    if (initialData) return;

    fetch(`${API_BASE_URL}/today`)
      .then((res) => {
        if (!res.ok)
          return fetch(`${API_BASE_URL}/profiles/p01/today`).then((r) =>
            r.json(),
          );
        return res.json();
      })
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
      const res = await fetch(`${API_BASE_URL}/api/fitbit/sync-live`);

      if (res.status === 401) {
        // Not authenticated yet, redirect to Google OAuth flow
        window.location.href = `${API_BASE_URL}/api/fitbit/login`;
        return;
      }

      const json = await res.json();
      if (json.status === "success") {
        setLiveTelemetry({
          heartRate: json.latest_heart_rate,
          bodyLoad: json.body_load,
          syncedAt: json.synced_at,
        });
      }
    } catch (err: any) {
      console.error("Live sync failed:", err);
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
        Could not connect to FastAPI server at {API_BASE_URL}. Is Render
        running?
      </div>
    );
  }

  const stressVal = data.reported_stress?.value ?? 0;
  const stressScale = data.reported_stress?.scale_max ?? 10;
  const normalizedStress =
    stressScale === 10 ? stressVal : Math.round(stressVal / 10);

  const estimate = data.wearable_estimate || {};
  // Use live wearable score if user synced, otherwise fallback to model estimate
  const currentLoad = liveTelemetry
    ? liveTelemetry.bodyLoad
    : (estimate.value ?? data.physiological_load?.value ?? 50);

  const comparison = data.comparison ||
    data.mismatch || {
      label: "Comparison ready",
      description:
        "Evaluating balance between perceived stress and physical load.",
      state: "balanced",
    };

  const isMismatch =
    comparison.state === "estimate_high_reported_low" ||
    comparison.state === "estimate_low_reported_high" ||
    comparison.state === "high_body_low_perceived" ||
    (comparison.state && comparison.state.includes("mismatch"));

  const contributors = liveTelemetry
    ? [
        {
          feature: "heart rate",
          description: `Live sensor: ${liveTelemetry.heartRate} bpm`,
        },
        {
          feature: "sync time",
          description: new Date(liveTelemetry.syncedAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
      ]
    : data.contributors || [
        {
          feature: "sleep",
          description: "Short sleep suppresses autonomic recovery",
        },
        { feature: "hrv", description: "Elevated sympathetic load detected" },
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
                color: loadColor(Number(currentLoad)),
              }}
              className="text-[48px] font-light transition-colors duration-200"
            >
              {estimate.value == null &&
              data.physiological_load?.value == null &&
              !liveTelemetry
                ? "--"
                : typeof number === "function"
                  ? number(currentLoad)
                  : Math.round(currentLoad)}
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
                color: loadColor(Number(currentLoad)),
              }}
              className="text-[10px] transition-colors duration-200"
            >
              {currentLoad >= 50 ? "Higher than usual" : "Around baseline"}
            </p>
            <p className="text-[9px] text-dim mt-0.5 truncate">
              {liveTelemetry
                ? `Live: ${liveTelemetry.heartRate} bpm`
                : estimate.method === "synthetic_fixture"
                  ? "Synthetic fixture"
                  : "Ridge V2 Personal model"}
            </p>
          </div>
        </div>
      </div>

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
              {comparison.label || "Stress Comparison"}
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

      {/* Dynamic Biometric Contributors from API */}
      <div className="bg-surface border border-border rounded-2xl divide-y divide-border">
        {contributors.map((c: any, idx: number) => (
          <div
            key={idx}
            className="flex items-center justify-between px-4 py-3"
          >
            <span
              style={{ fontFamily: "var(--font-mono)" }}
              className="text-[11px] text-muted uppercase tracking-wide"
            >
              {c.feature}
            </span>
            <span
              style={{ fontFamily: "var(--font-mono)" }}
              className="text-[11px] text-accent-stress"
            >
              {c.description}
            </span>
          </div>
        ))}
      </div>

      {/* Live Wearable Sync Trigger */}
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
