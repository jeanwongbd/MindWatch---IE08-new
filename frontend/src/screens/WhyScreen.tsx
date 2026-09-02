interface Props {
  onBack: () => void;
}

const FACTORS = [
  {
    icon: "🌙",
    label: "Sleep",
    detail: "1.3 h below your usual amount",
    value: "5.9 h",
    usual: "7.2 h",
    severity: "high" as const,
    description:
      "Short sleep raises cortisol and suppresses HRV recovery overnight, elevating your body load score.",
  },
  {
    icon: "💓",
    label: "HRV",
    detail: "14% below your usual level",
    value: "31 ms",
    usual: "36 ms",
    severity: "high" as const,
    description:
      "Low HRV is a direct indicator of autonomic stress. Your nervous system is working harder than baseline.",
  },
  {
    icon: "🌡️",
    label: "Resting HR",
    detail: "5 bpm above your usual",
    value: "68 bpm",
    usual: "63 bpm",
    severity: "moderate" as const,
    description:
      "Elevated resting HR often follows poor sleep or background physiological stress.",
  },
];

const severityColor = {
  high: "#e85d3a",
  moderate: "#e8a23a",
  low: "#4fb89a",
};

export default function WhyScreen({ onBack }: Props) {
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
          Why your body may be showing higher load
        </h1>
      </div>

      {/* Summary chip */}
      <div className="flex items-center gap-2 bg-[#1f1f1f] border border-[#2a2a2a] rounded-full px-4 py-2 w-fit">
        <div className="w-2 h-2 rounded-full bg-[#e8a23a]" />
        <span style={{ fontFamily: "var(--font-mono)" }} className="text-[11px] text-[#e8a23a]">
          3 signals contributing
        </span>
      </div>

      {/* Factor cards */}
      <div className="space-y-3">
        {FACTORS.map((f) => (
          <div
            key={f.label}
            className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-4 space-y-3"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-lg">{f.icon}</span>
                <div>
                  <p className="text-[14px] font-medium text-[#f2f0ec]">{f.label}</p>
                  <p
                    style={{ fontFamily: "var(--font-mono)", color: severityColor[f.severity] }}
                    className="text-[10px] mt-0.5"
                  >
                    {f.detail}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p
                  style={{ fontFamily: "var(--font-display)", color: severityColor[f.severity] }}
                  className="text-[22px] font-light leading-none"
                >
                  {f.value}
                </p>
                <p style={{ fontFamily: "var(--font-mono)" }} className="text-[9px] text-[#555550] mt-0.5">
                  usual {f.usual}
                </p>
              </div>
            </div>

            {/* Deviation bar */}
            <div className="relative h-1 bg-[#2a2a2a] rounded-full overflow-hidden">
              <div
                className="absolute left-0 top-0 h-full rounded-full transition-all"
                style={{
                  width: f.severity === "high" ? "70%" : "45%",
                  background: severityColor[f.severity],
                }}
              />
              {/* Usual marker */}
              <div
                className="absolute top-0 w-px h-full bg-[#555550]"
                style={{ left: f.severity === "high" ? "50%" : "37%" }}
              />
            </div>

            <p className="text-[12px] text-[#888880] leading-relaxed">{f.description}</p>
          </div>
        ))}
      </div>

      {/* Footer note */}
      <div className="border-t border-[#2a2a2a] pt-4">
        <p className="text-[11px] text-[#555550] leading-relaxed">
          Body load is computed from HRV, resting HR, respiratory rate, skin temperature, and sleep quality. It reflects physiological burden, not emotional state.
        </p>
      </div>
    </div>
  );
}
