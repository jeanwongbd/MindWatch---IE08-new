import { useState, useEffect } from "react";
import { C } from "../theme";
import { api } from "../api";

interface TimelinePoint {
  date: string;
  day?: string;
  physiological_load: number;
  reported_stress: number;
  stress: number;
  load: number;
}

const W = 300;
const H = 110;
const PAD = { left: 20, right: 10, top: 8, bottom: 4 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

function isMismatch(d: TimelinePoint) {
  return d.load - d.stress > 2;
}

export default function TrendsScreen() {
  const [data, setData] = useState<TimelinePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => {
    fetch(api("/profiles/demo01/timeline"))
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load timeline");
        return res.json();
      })
      .then((json) => {
        const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const formatted = json.timeline.map((item: any) => {
          const dt = new Date(item.date);
          const dayName = isNaN(dt.getTime()) ? item.date.slice(-2) : weekdays[dt.getUTCDay()];
          return {
            ...item,
            day: dayName,
            stress: item.reported_stress,
            // Normalize backend's 0-100 physio load to 0-10 for chart scale
            load: Math.round(item.physiological_load / 10),
          };
        });
        setData(formatted);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  function toX(i: number) {
    if (data.length <= 1) return PAD.left;
    return PAD.left + (i / (data.length - 1)) * PLOT_W;
  }

  function toY(v: number) {
    return PAD.top + PLOT_H - (v / 10) * PLOT_H;
  }

  function polyline(key: "stress" | "load") {
    return data.map((d, i) => `${toX(i)},${toY(d[key])}`).join(" ");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-muted font-mono text-xs">
        Loading biometric trends...
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="p-6 text-sm text-accent-stress font-mono">
        No timeline data available.
      </div>
    );
  }

  const mismatchCount = data.filter(isMismatch).length;

  return (
    <div className="px-6 py-4 space-y-5">
      {/* Header */}
      <div>
        <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-[0.2em] uppercase text-muted">
          Past {data.length} recorded days
        </p>
        <h1 style={{ fontFamily: "var(--font-display)" }} className="text-2xl font-light text-ink mt-0.5">
          Trends
        </h1>
      </div>

      {/* Legend */}
      <div className="flex gap-4">
        <LegendDot color={C.calm} label="Perceived stress" />
        <LegendDot color={C.load} label="Body load" />
        <LegendDot color={C.stress} label="Mismatch" dot />
      </div>

      {/* Chart */}
      <div className="bg-surface border border-border rounded-2xl p-4">
        <div className="flex gap-3">
          <div className="flex flex-col justify-between" style={{ height: H }}>
            {[10, 7, 5, 2, 0].map((v) => (
              <span key={v} style={{ fontFamily: "var(--font-mono)" }} className="text-[9px] text-dim leading-none">
                {v}
              </span>
            ))}
          </div>

          {/* SVG presentation attributes don't resolve var(), so paint via CSS properties. */}
          <svg width={W} height={H} className="overflow-visible">
            {/* Grid lines */}
            {[2, 5, 7, 10].map((v) => (
              <line
                key={v}
                x1={PAD.left}
                x2={W - PAD.right}
                y1={toY(v)}
                y2={toY(v)}
                style={{ stroke: C.border }}
                strokeWidth="0.5"
              />
            ))}

            {/* Mismatch zones */}
            {data.map((d, i) =>
              isMismatch(d) ? (
                <rect
                  key={i}
                  x={toX(i) - 14}
                  y={PAD.top}
                  width={28}
                  height={PLOT_H}
                  style={{ fill: C.stress, fillOpacity: 0.09 }}
                  rx={3}
                />
              ) : null
            )}

            {/* Body load line */}
            <polyline
              points={polyline("load")}
              style={{ fill: "none", stroke: C.load }}
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* Stress line */}
            <polyline
              points={polyline("stress")}
              style={{ fill: "none", stroke: C.calm }}
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray="4 2"
            />

            {/* Data points + hover */}
            {data.map((d, i) => (
              <g key={i}>
                <circle cx={toX(i)} cy={toY(d.load)} r={3} style={{ fill: C.load }} />
                <circle cx={toX(i)} cy={toY(d.stress)} r={3} style={{ fill: C.calm }} />
                {isMismatch(d) && (
                  <circle
                    cx={toX(i)}
                    cy={toY((d.load + d.stress) / 2)}
                    r={4}
                    style={{ fill: C.stress, fillOpacity: 0.7 }}
                  />
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
                      style={{ stroke: C.dim }}
                      strokeWidth="0.5"
                    />
                    <rect
                      x={toX(i) - 22}
                      y={PAD.top - 2}
                      width={44}
                      height={32}
                      rx={4}
                      style={{ fill: C.background, stroke: C.border }}
                      strokeWidth="0.5"
                    />
                    <text
                      x={toX(i)}
                      y={PAD.top + 11}
                      textAnchor="middle"
                      style={{ fill: C.calm }}
                      fontSize={9}
                      fontFamily="DM Mono"
                    >
                      S {d.stress}
                    </text>
                    <text
                      x={toX(i)}
                      y={PAD.top + 23}
                      textAnchor="middle"
                      style={{ fill: C.load }}
                      fontSize={9}
                      fontFamily="DM Mono"
                    >
                      L {d.load}
                    </text>
                  </g>
                )}
              </g>
            ))}

            {/* X-axis labels */}
            {data.map((d, i) => (
              <text
                key={i}
                x={toX(i)}
                y={H + 12}
                textAnchor="middle"
                style={{ fill: C.dim }}
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
          color={C.stress}
          title={`${mismatchCount} mismatch days detected`}
          body="Discrepancies indicate days where your physical recovery markers were under stress while perceived levels remained low."
        />
        <InsightCard
          icon="📈"
          color={C.calm}
          title="Live synchronization active"
          body="All trend plots reflect recorded endpoint inputs directly from the MindWatch API."
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
      <span style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-muted">
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
    <div className="bg-surface border border-border rounded-xl p-3.5 flex gap-3">
      <span className="text-base flex-shrink-0">{icon}</span>
      <div>
        <p className="text-[13px] font-medium" style={{ color }}>
          {title}
        </p>
        <p className="text-[12px] text-muted leading-relaxed mt-0.5">{body}</p>
      </div>
    </div>
  );
}
