import { useState } from "react";

const CONTEXT_TAGS = [
  "Exam",
  "Deadline",
  "Presentation",
  "Group work",
  "Exercise",
  "Caffeine",
  "Illness",
  "Other",
];

interface Props {
  onDone: () => void;
}

export default function CheckInScreen({ onDone }: Props) {
  const [stress, setStress] = useState(3);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(tag: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(tag) ? next.delete(tag) : next.add(tag);
      return next;
    });
  }

  const stressColor =
    stress <= 3 ? "#4fb89a" : stress <= 6 ? "#e8a23a" : "#e85d3a";
  const stressLabel =
    stress <= 3 ? "Low" : stress <= 6 ? "Moderate" : stress <= 8 ? "High" : "Very high";

  return (
    <div className="px-6 py-4 space-y-6">
      {/* Header */}
      <div>
        <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-[0.2em] uppercase text-[#888880]">
          Daily check-in
        </p>
        <h1 style={{ fontFamily: "var(--font-display)" }} className="text-2xl font-light text-[#f2f0ec] mt-0.5">
          How stressed do you feel?
        </h1>
      </div>

      {/* Big number */}
      <div className="flex items-center justify-center py-2">
        <div className="text-center">
          <span
            style={{ fontFamily: "var(--font-display)", lineHeight: 1, color: stressColor }}
            className="text-[88px] font-light transition-colors duration-300"
          >
            {stress}
          </span>
          <span style={{ fontFamily: "var(--font-display)" }} className="text-3xl text-[#888880]">
            /10
          </span>
          <p
            style={{ fontFamily: "var(--font-mono)", color: stressColor }}
            className="text-[11px] tracking-[0.2em] uppercase mt-1 transition-colors duration-300"
          >
            {stressLabel}
          </p>
        </div>
      </div>

      {/* Slider */}
      <div className="space-y-2">
        <div className="relative">
          <input
            type="range"
            min={0}
            max={10}
            value={stress}
            onChange={(e) => setStress(Number(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, ${stressColor} ${stress * 10}%, #2a2a2a ${stress * 10}%)`,
              accentColor: stressColor,
            }}
          />
        </div>
        <div className="flex justify-between">
          <span style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-[#555550]">
            0
          </span>
          <span style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-[#555550]">
            10
          </span>
        </div>
      </div>

      {/* Context tags */}
      <div className="space-y-3">
        <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-[0.2em] uppercase text-[#888880]">
          Optional context
        </p>
        <div className="flex flex-wrap gap-2">
          {CONTEXT_TAGS.map((tag) => {
            const on = selected.has(tag);
            return (
              <button
                key={tag}
                onClick={() => toggle(tag)}
                className={`px-3 py-1.5 rounded-full text-[12px] border transition-all duration-150 ${
                  on
                    ? "bg-[#f2f0ec] border-[#f2f0ec] text-[#0d0d0d]"
                    : "bg-transparent border-[#2a2a2a] text-[#888880] hover:border-[#555550] hover:text-[#f2f0ec]"
                }`}
                style={{ fontFamily: "var(--font-body)" }}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body status reminder */}
      <div className="bg-[#1a1208] border border-[#e8a23a]/20 rounded-xl px-4 py-3 flex items-center gap-3">
        <div className="w-1 h-8 rounded-full bg-[#e8a23a] flex-shrink-0" />
        <p className="text-[12px] text-[#888880] leading-snug">
          Your body is showing load{" "}
          <span className="text-[#e8a23a]">higher than usual</span> today.
        </p>
      </div>

      {/* Submit */}
      <button
        onClick={onDone}
        className="w-full py-3.5 bg-[#f2f0ec] text-[#0d0d0d] rounded-2xl hover:opacity-90 active:opacity-80 transition-opacity"
        style={{ fontFamily: "var(--font-body)", fontWeight: 500 }}
      >
        Save check-in
      </button>
    </div>
  );
}
