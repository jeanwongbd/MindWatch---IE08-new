import { useState } from "react";

const DAYS = [
  { day: "Mon", stress: 4, load: 5 },
  { day: "Tue", stress: 6, load: 6 },
  { day: "Wed", stress: 7, load: 8 },
  { day: "Thu", stress: 3, load: 7 },
  { day: "Fri", stress: 5, load: 5 },
  { day: "Sat", stress: 2, load: 4 },
  { day: "Sun", stress: 3, load: 7 },
];

// Mismatch = load - stress > 2
function isMismatch(d: (typeof DAYS)[0]) {
  return d.load - d.stress > 2;
}

const W = 300;
const H = 110;
const PAD = { left: 20, right: 10, top: 8, bottom: 4 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

function toX(i: number) {
  return PAD.left + (i / (DAYS.length - 1)) * PLOT_W;
}
function toY(v: number) {
  return PAD.top + PLOT_H - (v / 10) * PLOT_H;
}
function polyline(key: "stress" | "load") {
  return DAYS.map((d, i) => `${toX(i)},${toY(d[key])}`).join(" ");
}

export default function TrendsScreen() {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div className="px-6 py-4 space-y-5">
      {/* Header */}
      <div>
        <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-[0.2em] uppercase text-[#888880]">
          Past 7 days
        </p>
        <h1 style={{ fontFamily: "var(--font-display)" }} className="text-2xl font-light text-[#f2f0ec] mt-0.5">
          Trends
        </h1>
      </div>

      {/* Legend */}
      <div className="flex gap-4">
        <LegendDot color="#4fb89a" label="Perceived stress" />
        <LegendDot color="#e8a23a" label="Body load" />
        <LegendDot color="#e85d3a" label="Mismatch" dot />
      </div>

      {/* Chart */}
      <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-4">
        {/* Y-axis labels */}
        <div className="flex gap-3">
          <div className="flex flex-col justify-between" style={{ height: H }}>
            {[10, 7, 5, 2, 0].map((v) => (
              <span key={v} style={{ fontFamily: "var(--font-mono)" }} className="text-[9px] text-[#555550] leading-none">
                {v}
              </span>
            ))}
          </div>

          <svg width={W} height={H} className="overflow-visible">
            {/* Grid lines */}
            {[2, 5, 7, 10].map((v) => (
              <line
                key={v}
                x1={PAD.left}
                x2={W - PAD.right}
                y1={toY(v)}
                y2={toY(v)}
                stroke="#2a2a2a"
                strokeWidth="0.5"
              />
            ))}

            {/* Mismatch zones */}
            {DAYS.map((d, i) =>
              isMismatch(d) ? (
                <rect
                  key={i}
                  x={toX(i) - 14}
                  y={PAD.top}
                  width={28}
                  height={PLOT_H}
                  fill="#e85d3a"
                  fillOpacity={0.06}
                  rx={3}
                />
              ) : null
            )}

            {/* Body load line */}
            <polyline
              points={polyline("load")}
              fill="none"
              stroke="#e8a23a"
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* Stress line */}
            <polyline
              points={polyline("stress")}
              fill="none"
              stroke="#4fb89a"
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray="4 2"
            />

            {/* Data points + hover */}
            {DAYS.map((d, i) => (
              <g key={i}>
                <circle cx={toX(i)} cy={toY(d.load)} r={3} fill="#e8a23a" />
                <circle cx={toX(i)} cy={toY(d.stress)} r={3} fill="#4fb89a" />
                {isMismatch(d) && (
                  <circle cx={toX(i)} cy={toY((d.load + d.stress) / 2)} r={4} fill="#e85d3a" fillOpacity={0.7} />
                )}
                {/* Invisible hover target */}
                <rect
                  x={toX(i) - 14}
                  y={PAD.top}
                  width={28}
                  height={PLOT_H}
                  fill="transparent"
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  className="cursor-pointer"
                />
                {/* Hover tooltip */}
                {hovered === i && (
                  <g>
                    <line
                      x1={toX(i)}
                      x2={toX(i)}
                      y1={PAD.top}
                      y2={H - PAD.bottom}
                      stroke="#555550"
                      strokeWidth="0.5"
                    />
                    <rect
                      x={toX(i) - 22}
                      y={PAD.top - 2}
                      width={44}
                      height={32}
                      rx={4}
                      fill="#1f1f1f"
                      stroke="#2a2a2a"
                      strokeWidth="0.5"
                    />
                    <text x={toX(i)} y={PAD.top + 11} textAnchor="middle" fill="#4fb89a" fontSize={9} fontFamily="DM Mono">
                      S {d.stress}
                    </text>
                    <text x={toX(i)} y={PAD.top + 23} textAnchor="middle" fill="#e8a23a" fontSize={9} fontFamily="DM Mono">
                      L {d.load}
                    </text>
                  </g>
                )}
              </g>
            ))}

            {/* X-axis labels */}
            {DAYS.map((d, i) => (
              <text
                key={i}
                x={toX(i)}
                y={H + 12}
                textAnchor="middle"
                fill="#555550"
                fontSize={9}
                fontFamily="DM Mono"
              >
                {d.day}
              </text>
            ))}
          </svg>
        </div>
      </div>

      {/* Insight cards */}
      <div className="space-y-2">
        <InsightCard
          icon="⚠️"
          color="#e85d3a"
          title="3 mismatch days this week"
          body="Thu and Sun show body load significantly above perceived stress. Sleep quality was lowest on those nights."
        />
        <InsightCard
          icon="📉"
          color="#e8a23a"
          title="HRV trending down"
          body="Your HRV has dropped 18% over the past 4 days. Consider a lighter schedule tomorrow."
        />
        <InsightCard
          icon="✓"
          color="#4fb89a"
          title="Sat recovery day worked"
          body="Saturday's low stress and low body load correlates with 7.4 h sleep and no logged stressors."
        />
      </div>
    </div>
  );
}

function LegendDot({ color, label, dot }: { color: string; label: string; dot?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      {dot ? (
        <div className="w-2 h-2 rounded-full" style={{ background: color, opacity: 0.7 }} />
      ) : (
        <div className="w-4 h-px rounded-full" style={{ background: color }} />
      )}
      <span style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-[#888880]">
        {label}
      </span>
    </div>
  );
}

function InsightCard({
  icon,
  color,
  title,
  body,
}: {
  icon: string;
  color: string;
  title: string;
  body: string;
}) {
  return (
    <div className="bg-[#161616] border border-[#2a2a2a] rounded-xl p-3.5 flex gap-3">
      <span className="text-base flex-shrink-0">{icon}</span>
      <div>
        <p className="text-[13px] font-medium" style={{ color }}>
          {title}
        </p>
        <p className="text-[12px] text-[#888880] leading-relaxed mt-0.5">{body}</p>
      </div>
    </div>
  );
}
