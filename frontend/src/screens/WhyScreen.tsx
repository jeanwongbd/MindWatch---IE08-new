import { useState, useEffect } from "react";

interface Props {
  onBack: () => void;
}

interface Contributor {
  feature: string;
  direction: string;
  description: string;
}

interface TodayData {
  mismatch: {
    label: string;
    description: string;
  };
  contributors: Contributor[];
}

const severityColor = {
  high: "#e85d3a",
  moderate: "#e8a23a",
  low: "#4fb89a",
};

const FEATURE_METADATA: Record<string, { icon: string; label: string; description: string }> = {
  sleep: {
    icon: "🌙",
    label: "Sleep Duration",
    description: "Short sleep raises cortisol and suppresses autonomic recovery overnight.",
  },
  hrv: {
    icon: "💓",
    label: "Heart Rate Variability",
    description: "Low HRV indicates elevated sympathetic tone and lower physiological resilience.",
  },
  resting_hr: {
    icon: "🌡️",
    label: "Resting HR",
    description: "Elevated resting heart rate typically reflects incomplete recovery or systemic strain.",
  },
};

export default function WhyScreen({ onBack }: Props) {
  const [data, setData] = useState<TodayData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("http://localhost:8000/profiles/demo01/today")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load contributor breakdown");
        return res.json();
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-[#888880] font-mono text-xs">
        Loading contributor breakdown...
      </div>
    );
  }

  const contributors = data?.contributors || [];

  return (
    <div className="px-6 py-4 space-y-5">
      {/* Header */}
      <div>
        <button
          onClick={onBack}
          style={{ fontFamily: "var(--font-mono)" }}
          className="text-[11px] text-[#888880] hover:text-[#f2f0ec] transition-colors mb-3 flex items-center gap-1"
        >
          ← Back
        </button>
        <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-[0.2em] uppercase text-[#888880]">
          Body analysis
        </p>
        <h1 style={{ fontFamily: "var(--font-display)" }} className="text-2xl font-light text-[#f2f0ec] mt-0.5 leading-snug">
          {data?.mismatch.label || "Physiological Breakdown"}
        </h1>
        <p className="text-xs text-[#888880] mt-1">
          {data?.mismatch.description}
        </p>
      </div>

      {/* Summary chip */}
      <div className="flex items-center gap-2 bg-[#1f1f1f] border border-[#2a2a2a] rounded-full px-4 py-2 w-fit">
        <div className="w-2 h-2 rounded-full bg-[#e8a23a]" />
        <span style={{ fontFamily: "var(--font-mono)" }} className="text-[11px] text-[#e8a23a]">
          {contributors.length} key biometric drivers
        </span>
      </div>

      {/* Dynamic Factor cards */}
      <div className="space-y-3">
        {contributors.map((f) => {
          const meta = FEATURE_METADATA[f.feature.toLowerCase()] || {
            icon: "⚡",
            label: f.feature.toUpperCase(),
            description: "Biometric deviation from personal rolling baseline.",
          };

          return (
            <div
              key={f.feature}
              className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-4 space-y-3"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">{meta.icon}</span>
                  <div>
                    <p className="text-[14px] font-medium text-[#f2f0ec]">{meta.label}</p>
                    <p
                      style={{ fontFamily: "var(--font-mono)", color: severityColor.high }}
                      className="text-[10px] mt-0.5"
                    >
                      {f.description}
                    </p>
                  </div>
                </div>
              </div>

              {/* Deviation visual */}
              <div className="relative h-1 bg-[#2a2a2a] rounded-full overflow-hidden">
                <div
                  className="absolute left-0 top-0 h-full rounded-full"
                  style={{
                    width: "75%",
                    background: severityColor.high,
                  }}
                />
              </div>

              <p className="text-[12px] text-[#888880] leading-relaxed">{meta.description}</p>
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      <div className="border-t border-[#2a2a2a] pt-4">
        <p className="text-[11px] text-[#555550] leading-relaxed">
          Body load is computed from HRV, resting HR, respiratory rate, and sleep metrics. It reflects physiological burden, not emotional state.
        </p>
      </div>
    </div>
  );
}