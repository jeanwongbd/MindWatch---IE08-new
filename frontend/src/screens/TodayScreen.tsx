import { useState, useEffect } from "react";
import { type DemoRecord, number } from "../api";

interface Props {
  data?: DemoRecord;
  onCheckIn: () => void;
  onWhy: () => void;
}

const API_BASE_URL = "http://localhost:8000";

function stressColor(v: number) {
  if (v <= 3) return "#4fb89a";
  if (v <= 6) return "#e8a23a";
  return "#e85d3a";
}

function loadColor(v: number) {
  if (v < 50) return "#4fb89a";
  return "#e85d3a";
}

function stressLabel(v: number) {
  if (v <= 3) return "Low stress";
  if (v <= 6) return "Moderate";
  return "High stress";
}

export default function TodayScreen({ data: initialData, onCheckIn, onWhy }: Props) {
  const [data, setData] = useState<any>(initialData || null);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);

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
        if (!res.ok) return fetch(`${API_BASE_URL}/profiles/p01/today`).then((r) => r.json());
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

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-[#888880] font-mono text-xs">
        Loading today's biometric profile...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 text-sm text-[#e85d3a] font-mono">
        Could not connect to FastAPI server at {API_BASE_URL}. Is Uvicorn running?
      </div>
    );
  }

  const stressVal = data.reported_stress?.value ?? 0;
  const stressScale = data.reported_stress?.scale_max ?? 10;
  const normalizedStress = stressScale === 10 ? stressVal : Math.round(stressVal / 10);

  const estimate = data.wearable_estimate || {};
  const loadVal = estimate.value ?? data.physiological_load?.value ?? 50;

  const comparison = data.comparison || data.mismatch || {
    label: "Comparison ready",
    description: "Evaluating balance between perceived stress and physical load.",
    state: "balanced"
  };

  const isMismatch =
    comparison.state === "estimate_high_reported_low" ||
    comparison.state === "estimate_low_reported_high" ||
    comparison.state === "high_body_low_perceived" ||
    (comparison.state && comparison.state.includes("mismatch"));

  const contributors = data.contributors || [
    { feature: "sleep", description: "Short sleep suppresses autonomic recovery" },
    { feature: "hrv", description: "Elevated sympathetic load detected" }
  ];

  return (
    <div className="px-6 py-4 space-y-5">
      {/* Header */}
      <div className="flex items-baseline justify-between">
        <div>
          <p
            style={{ fontFamily: "var(--font-mono)" }}
            className="text-[10px] tracking-[0.2em] uppercase text-[#888880]"
          >
            {data.date || data.source_label || "2026-08-25"}
          </p>
          <h1
            style={{ fontFamily: "var(--font-display)" }}
            className="text-2xl font-light text-[#f2f0ec] mt-0.5"
          >
            Good morning
          </h1>
        </div>
        <div className="w-8 h-8 rounded-full bg-[#1f1f1f] border border-[#2a2a2a] flex items-center justify-center text-[10px] text-[#888880] font-mono">
          {data.user_id ? data.user_id.slice(-3).toUpperCase() : "DEM"}
        </div>
      </div>

      {/* Two input cards */}
      <div className="grid grid-cols-2 gap-3">
        {/* HOW I FEEL */}
        <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-4 space-y-3">
          <p
            style={{ fontFamily: "var(--font-mono)" }}
            className="text-[9px] tracking-[0.2em] uppercase text-[#888880]"
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
              className="text-lg text-[#888880] mb-1.5"
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
            <p className="text-[9px] text-[#555550] mt-0.5 truncate">
              {data.reported_stress?.source === "demo_checkin"
                ? "Demo check-in override"
                : data.mode === "synthetic_scenario"
                ? "Synthetic scenario"
                : "Historical SSAQS response"}
            </p>
          </div>
        </div>

        {/* MY BODY (LOAD) */}
        <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-4 space-y-3">
          <p
            style={{ fontFamily: "var(--font-mono)" }}
            className="text-[9px] tracking-[0.2em] uppercase text-[#888880]"
          >
            My body (Load)
          </p>
          <div className="flex items-end gap-1">
            <span
              style={{
                fontFamily: "var(--font-display)",
                lineHeight: 1,
                color: loadColor(Number(loadVal)),
              }}
              className="text-[48px] font-light transition-colors duration-200"
            >
              {estimate.value == null && data.physiological_load?.value == null
                ? "--"
                : typeof number === "function"
                ? number(loadVal)
                : Math.round(loadVal)}
            </span>
            <span
              style={{ fontFamily: "var(--font-display)" }}
              className="text-lg text-[#888880] mb-1.5"
            >
              /100
            </span>
          </div>
          <div>
            <p
              style={{
                fontFamily: "var(--font-mono)",
                color: loadColor(Number(loadVal)),
              }}
              className="text-[10px] transition-colors duration-200"
            >
              {loadVal >= 50 ? "Higher than usual" : "Around baseline"}
            </p>
            <p className="text-[9px] text-[#555550] mt-0.5 truncate">
              {estimate.method === "synthetic_fixture"
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
            ? "bg-[#1a1208] border-[#e8a23a]/30"
            : "bg-[#161616] border-[#2a2a2a]"
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${
              isMismatch ? "bg-[#e8a23a]" : "bg-[#4fb89a]"
            }`}
          />
          <div>
            <p
              style={{ fontFamily: "var(--font-mono)" }}
              className={`text-[10px] tracking-[0.15em] uppercase mb-1 ${
                isMismatch ? "text-[#e8a23a]" : "text-[#4fb89a]"
              }`}
            >
              {comparison.label || "Stress Comparison"}
            </p>
            <p className="text-[13px] text-[#f2f0ec] leading-snug">
              {comparison.description}
            </p>
            <button
              onClick={onWhy}
              style={{ fontFamily: "var(--font-mono)" }}
              className="text-[11px] text-[#e8a23a] mt-2 underline underline-offset-2 hover:text-[#f2c47a] transition-colors inline-block"
            >
              See biometric breakdown →
            </button>
          </div>
        </div>
      </div>

      {/* Dynamic Biometric Contributors from API */}
      <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl divide-y divide-[#2a2a2a]">
        {contributors.map((c: any, idx: number) => (
          <div
            key={idx}
            className="flex items-center justify-between px-4 py-3"
          >
            <span
              style={{ fontFamily: "var(--font-mono)" }}
              className="text-[11px] text-[#888880] uppercase tracking-wide"
            >
              {c.feature}
            </span>
            <span
              style={{ fontFamily: "var(--font-mono)" }}
              className="text-[11px] text-[#e85d3a]"
            >
              {c.description}
            </span>
          </div>
        ))}
      </div>

      {/* CTA Button */}
      {data.mode === "synthetic_scenario" ? (
        <p className="text-center text-[11px] font-mono text-[#888880]">
          Synthetic scenarios are read-only fixtures.
        </p>
      ) : (
        <button
          onClick={onCheckIn}
          className="w-full py-3.5 bg-[#f2f0ec] text-[#0d0d0d] rounded-2xl hover:opacity-90 active:opacity-80 transition-opacity"
          style={{ fontFamily: "var(--font-body)", fontWeight: 500 }}
        >
          {data.reported_stress?.source === "demo_checkin" ? "Edit today's check-in" : "Log today's stress"}
        </button>
      )}

      {/* Disclaimer / Model limitations */}
      {data.limitation && (
        <p className="text-[10px] text-[#555550] leading-relaxed text-center px-2">
          {data.limitation}
        </p>
      )}
    </div>
  );
}