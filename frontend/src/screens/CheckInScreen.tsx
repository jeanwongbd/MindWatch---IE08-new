import { useState } from "react";
import { api, type DemoRecord } from "../api";

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
  data?: DemoRecord;
  onDone: () => void;
}

export default function CheckInScreen({ data, onDone }: Props) {
  // Read-only synthetic scenario mode
  if (data?.mode === "synthetic_scenario") {
    return (
      <div className="px-6 py-6 space-y-4">
        <div>
          <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-[0.2em] uppercase text-[#888880]">
            Demo Fixture
          </p>
          <h1 style={{ fontFamily: "var(--font-display)" }} className="text-2xl font-light text-[#f2f0ec] mt-1">
            Reported Stress
          </h1>
        </div>
        <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-5 space-y-2">
          <p className="text-sm text-[#888880]">
            Synthetic scenarios are read-only fixtures.
          </p>
          <p style={{ fontFamily: "var(--font-display)" }} className="text-3xl text-[#4fb89a]">
            {data.reported_stress?.value ?? 0} <span className="text-sm text-[#888880]">/ 10</span>
          </p>
        </div>
        <button
          onClick={onDone}
          className="w-full py-3.5 bg-[#1f1f1f] text-[#f2f0ec] border border-[#2a2a2a] rounded-xl hover:border-[#555550] transition-colors"
          style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}
        >
          ← Return to Dashboard
        </button>
      </div>
    );
  }

  const initialStress =
    data?.reported_stress?.source === "demo_checkin"
      ? data.reported_stress.value
      : (data?.reported_stress?.value ?? 3);

  const [stress, setStress] = useState<number>(initialStress);
  const [tags, setTags] = useState<string[]>(data?.reported_stress?.context_tags || []);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function toggle(tag: string) {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  async function handleSave(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg(null);

    const payload = {
      date: data?.date,
      user_id: "p01",
      stress,
      context_tags: tags,
      context: tags,
    };

    try {
      if (typeof api === "function") {
        await api("/checkin", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      } else {
        const response = await fetch("http://localhost:8000/checkins", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error(`Server returned ${response.status}`);
      }
      onDone();
    } catch (err: any) {
      console.error("Failed to submit check-in:", err);
      setErrorMsg(err.message || "Failed to connect to backend.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const stressColor =
    stress <= 3 ? "#4fb89a" : stress <= 6 ? "#e8a23a" : "#e85d3a";
  const stressLabel =
    stress <= 3 ? "Low" : stress <= 6 ? "Moderate" : stress <= 8 ? "High" : "Very high";

  return (
    <form onSubmit={handleSave} className="px-6 py-4 space-y-6">
      {/* Header */}
      <div>
        <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-[0.2em] uppercase text-[#888880]">
          {data?.date ? `Check-in for ${data.date}` : "Daily check-in"}
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
            const on = tags.includes(tag);
            return (
              <button
                type="button"
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

      {/* Error notification */}
      {errorMsg && (
        <p className="text-xs text-[#e85d3a] text-center font-mono">
          {errorMsg}
        </p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full py-3.5 bg-[#f2f0ec] text-[#0d0d0d] rounded-2xl hover:opacity-90 active:opacity-80 transition-opacity disabled:opacity-50"
        style={{ fontFamily: "var(--font-body)", fontWeight: 500 }}
      >
        {isSubmitting ? "Saving..." : data?.date ? "Save demo check-in" : "Save check-in"}
      </button>
    </form>
  );
}