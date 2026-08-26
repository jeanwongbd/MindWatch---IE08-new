import { useState } from "react";

interface Props {
  onCheckIn: () => void;
  onWhy: () => void;
}

function stressColor(v: number) {
  if (v <= 3) return "#4fb89a";
  if (v <= 6) return "#e8a23a";
  return "#e85d3a";
}

function loadColor(v: number) {
  if (v <= 3) return "#4fb89a";
  if (v <= 6) return "#e8a23a";
  return "#e85d3a";
}

function loadLabel(v: number) {
  if (v <= 3) return "Lower than usual";
  if (v <= 6) return "Around baseline";
  return "Higher than usual";
}

function stressLabel(v: number) {
  if (v <= 3) return "Low stress";
  if (v <= 6) return "Moderate";
  return "High stress";
}

export default function TodayScreen({ onCheckIn, onWhy }: Props) {
  const [stress, setStress] = useState(3);
  const [load, setLoad] = useState(7);

  const mismatch = load - stress > 2;

  return (
    <div className="px-6 py-4 space-y-5">
      {/* Header */}
      <div className="flex items-baseline justify-between">
        <div>
          <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-[0.2em] uppercase text-[#888880]">
            Tuesday, Aug 26
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
          <input
            type="range"
            min={0}
            max={10}
            value={stress}
            onChange={(e) => setStress(Number(e.target.value))}
            className="w-full h-1 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, ${stressColor(stress)} ${stress * 10}%, #2a2a2a ${stress * 10}%)`,
              accentColor: stressColor(stress),
            }}
          />
          <div className="flex justify-between">
            <span style={{ fontFamily: "var(--font-mono)" }} className="text-[9px] text-[#555550]">0</span>
            <span style={{ fontFamily: "var(--font-mono)" }} className="text-[9px] text-[#555550]">10</span>
          </div>
        </div>

        {/* MY BODY */}
        <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-4 space-y-3">
          <p style={{ fontFamily: "var(--font-mono)" }} className="text-[9px] tracking-[0.2em] uppercase text-[#888880]">
            My body
          </p>
          <div className="flex items-end gap-1">
            <span
              style={{ fontFamily: "var(--font-display)", lineHeight: 1, color: loadColor(load) }}
              className="text-[48px] font-light transition-colors duration-200"
            >
              {load}
            </span>
            <span style={{ fontFamily: "var(--font-display)" }} className="text-lg text-[#888880] mb-1.5">
              /10
            </span>
          </div>
          <p style={{ fontFamily: "var(--font-mono)", color: loadColor(load) }} className="text-[10px] transition-colors duration-200">
            {loadLabel(load)}
          </p>
          <input
            type="range"
            min={0}
            max={10}
            value={load}
            onChange={(e) => setLoad(Number(e.target.value))}
            className="w-full h-1 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, ${loadColor(load)} ${load * 10}%, #2a2a2a ${load * 10}%)`,
              accentColor: loadColor(load),
            }}
          />
          <div className="flex justify-between">
            <span style={{ fontFamily: "var(--font-mono)" }} className="text-[9px] text-[#555550]">0</span>
            <span style={{ fontFamily: "var(--font-mono)" }} className="text-[9px] text-[#555550]">10</span>
          </div>
        </div>
      </div>

      {/* Mismatch banner — reactive */}
      {mismatch && (
        <div className="bg-[#1a1208] border border-[#e8a23a]/30 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-[#e8a23a] flex-shrink-0" />
            <div>
              <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-[0.15em] uppercase text-[#e8a23a] mb-1">
                Mismatch detected
              </p>
              <p className="text-[13px] text-[#f2f0ec] leading-snug">
                Your body is showing higher load than your reported stress suggests.
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

      {/* Biometric signals */}
      <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl divide-y divide-[#2a2a2a]">
        <BiometricRow label="Resting HR" value="68" unit="bpm" delta="+5" deltaColor="text-[#e8a23a]" />
        <BiometricRow label="HRV" value="31" unit="ms" delta="−14%" deltaColor="text-[#e85d3a]" />
        <BiometricRow label="Sleep" value="5.9" unit="h" delta="−1.3h" deltaColor="text-[#e85d3a]" />
        <BiometricRow label="Respiratory" value="15.2" unit="rpm" delta="Baseline" deltaColor="text-[#4fb89a]" />
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

function BiometricRow({
  label, value, unit, delta, deltaColor,
}: {
  label: string; value: string; unit: string; delta: string; deltaColor: string;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span style={{ fontFamily: "var(--font-mono)" }} className="text-[11px] text-[#888880] tracking-wide">
        {label}
      </span>
      <div className="flex items-baseline gap-2">
        <span className="text-[15px] text-[#f2f0ec] font-medium">{value}</span>
        <span style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-[#555550]">{unit}</span>
        <span style={{ fontFamily: "var(--font-mono)" }} className={`text-[10px] ${deltaColor}`}>{delta}</span>
      </div>
    </div>
  );
}
