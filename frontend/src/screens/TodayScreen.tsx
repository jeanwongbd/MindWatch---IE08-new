import { useState, useEffect } from "react";

interface Props {
  onCheckIn: () => void;
  onWhy: () => void;
}

interface TodayProfileResponse {
  user_id: string;
  date: string;
  reported_stress: {
    value: number;
    scale_max: number;
  };
  physiological_load: {
    value: number;
    category: string;
  };
  mismatch: {
    state: string;
    label: string;
    description: string;
  };
  confidence: {
    level: string;
  };
  contributors: Array<{
    feature: string;
    direction: string;
    description: string;
  }>;
}

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

export default function TodayScreen({ onCheckIn, onWhy }: Props) {
  const [data, setData] = useState<TodayProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch backend today profile on component mount
  useEffect(() => {
    fetch("http://localhost:8000/profiles/demo01/today")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to reach MindWatch API");
        return res.json();
      })
      .then((json: TodayProfileResponse) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-[#888880]">
        Loading today's biometric profile...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 text-sm text-[#e85d3a]">
        Could not connect to FastAPI server at localhost:8000. Is Uvicorn running?
      </div>
    );
  }

  const stress = data.reported_stress.value;
  const load = data.physiological_load.value;
  const isMismatch = data.mismatch.state.includes("mismatch") || data.mismatch.state === "high_body_low_perceived";

  return (
    <div className="px-6 py-4 space-y-5">
      {/* Header */}
      <div className="flex items-baseline justify-between">
        <div>
          <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-[0.2em] uppercase text-[#888880]">
            {data.date}
          </p>
          <h1 style={{ fontFamily: "var(--font-display)" }} className="text-2xl font-light text-[#f2f0ec] mt-0.5">
            Good morning
          </h1>
        </div>
        <div className="w-8 h-8 rounded-full bg-[#1f1f1f] border border-[#2a2a2a]" />
      </div>

      {/* Two input cards */}
      <div className="grid grid-cols-2 gap-3">
        {/* HOW I FEEL */}
        <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-4 space-y-3">
          <p style={{ fontFamily: "var(--font-mono)" }} className="text-[9px] tracking-[0.2em] uppercase text-[#888880]">
            How I feel
          </p>
          <div className="flex items-end gap-1">
            <span
              style={{ fontFamily: "var(--font-display)", lineHeight: 1, color: stressColor(stress) }}
              className="text-[48px] font-light transition-colors duration-200"
            >
              {stress}
            </span>
            <span style={{ fontFamily: "var(--font-display)" }} className="text-lg text-[#888880] mb-1.5">
              /10
            </span>
          </div>
          <p style={{ fontFamily: "var(--font-mono)", color: stressColor(stress) }} className="text-[10px] transition-colors duration-200">
            {stressLabel(stress)}
          </p>
        </div>

        {/* MY BODY */}
        <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-4 space-y-3">
          <p style={{ fontFamily: "var(--font-mono)" }} className="text-[9px] tracking-[0.2em] uppercase text-[#888880]">
            My body (Load)
          </p>
          <div className="flex items-end gap-1">
            <span
              style={{ fontFamily: "var(--font-display)", lineHeight: 1, color: loadColor(load) }}
              className="text-[48px] font-light transition-colors duration-200"
            >
              {load}
            </span>
            <span style={{ fontFamily: "var(--font-display)" }} className="text-lg text-[#888880] mb-1.5">
              /100
            </span>
          </div>
          <p style={{ fontFamily: "var(--font-mono)", color: loadColor(load) }} className="text-[10px] transition-colors duration-200">
            {data.physiological_load.category === "high" ? "Higher than usual" : "Around baseline"}
          </p>
        </div>
      </div>

      {/* Mismatch banner — dynamic from FastAPI backend */}
      {isMismatch && (
        <div className="bg-[#1a1208] border border-[#e8a23a]/30 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-[#e8a23a] flex-shrink-0" />
            <div>
              <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-[0.15em] uppercase text-[#e8a23a] mb-1">
                {data.mismatch.label}
              </p>
              <p className="text-[13px] text-[#f2f0ec] leading-snug">
                {data.mismatch.description}
              </p>
              <button
                onClick={onWhy}
                style={{ fontFamily: "var(--font-mono)" }}
                className="text-[11px] text-[#e8a23a] mt-2 underline underline-offset-2 hover:text-[#f2c47a] transition-colors"
              >
                See why →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Biometric Contributors from API */}
      <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl divide-y divide-[#2a2a2a]">
        {data.contributors.map((c, idx) => (
          <div key={idx} className="flex items-center justify-between px-4 py-3">
            <span style={{ fontFamily: "var(--font-mono)" }} className="text-[11px] text-[#888880] uppercase tracking-wide">
              {c.feature}
            </span>
            <span style={{ fontFamily: "var(--font-mono)" }} className="text-[11px] text-[#e85d3a]">
              {c.description}
            </span>
          </div>
        ))}
      </div>

      {/* CTA */}
      <button
        onClick={onCheckIn}
        className="w-full py-3.5 bg-[#f2f0ec] text-[#0d0d0d] rounded-2xl hover:opacity-90 active:opacity-80 transition-opacity"
        style={{ fontFamily: "var(--font-body)", fontWeight: 500 }}
      >
        Log today's stress
      </button>
    </div>
  );
}