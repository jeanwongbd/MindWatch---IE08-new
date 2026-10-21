import { number, type DemoRecord } from "../api";

interface Props {
  data: DemoRecord;
  records: DemoRecord[];
}

export default function TrendsScreen({ data, records = [] }: Props) {
  if (data.mode === "synthetic_scenario") {
    return (
      <div className="px-6 py-6 space-y-4">
        <div>
          <p
            style={{ fontFamily: "var(--font-mono)" }}
            className="text-[10px] tracking-[0.2em] uppercase text-[#888880]"
          >
            Biometric History
          </p>
          <h1
            style={{ fontFamily: "var(--font-display)" }}
            className="demo-title text-2xl font-light text-[#f2f0ec] mt-0.5"
          >
            Trends
          </h1>
        </div>
        <div className="demo-card bg-[#161616] border border-[#2a2a2a] rounded-2xl p-4">
          <p className="text-sm text-[#888880] leading-relaxed">
            Synthetic scenario selected. Fixtures are excluded from historical trends.
          </p>
        </div>
      </div>
    );
  }

  const width = 330;
  const height = 160;
  const left = 30;
  const top = 12;
  const plot = 125;

  const x = (i: number) => left + (i * (width - left - 10)) / Math.max(1, records.length - 1);
  const y = (v: number) => top + ((100 - v) / 100) * plot;

  // Split polylines around nulls so missing data creates clean visual gaps
  function segments(values: (number | null)[]) {
    const result: string[] = [];
    let points: string[] = [];
    values.forEach((v, i) => {
      if (v === null) {
        if (points.length) result.push(points.join(" "));
        points = [];
      } else {
        points.push(`${x(i)},${y(v)}`);
      }
    });
    if (points.length) result.push(points.join(" "));
    return result;
  }

  const series = [
    {
      color: "#e8a23a",
      label: "Wearable estimate",
      values: records.map((r) => r.wearable_estimate?.value ?? null),
    },
    {
      color: "#4fb89a",
      label: "Reported stress",
      values: records.map((r) => r.reported_stress?.normalized_0_100 ?? 0),
    },
  ];

  return (
    <div className="px-6 py-4 space-y-5">
      {/* Header */}
      <div>
        <p
          style={{ fontFamily: "var(--font-mono)" }}
          className="text-[10px] tracking-[0.2em] uppercase text-[#888880]"
        >
          {records[0]?.date} to {records.at(-1)?.date}
        </p>
        <h1
          style={{ fontFamily: "var(--font-display)" }}
          className="demo-title text-2xl font-light text-[#f2f0ec] mt-0.5"
        >
          Historical trends
        </h1>
        <p className="text-[11px] text-[#888880] font-mono mt-1">
          Historical replay · Both series use 0–100. Missing estimates are gaps.
        </p>
      </div>

      {/* SVG Chart Container */}
      <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-3.5 space-y-3">
        <svg
          role="img"
          aria-label="Historical wearable estimates and reported stress, on a zero to one hundred scale"
          viewBox={`0 0 ${width} ${height}`}
          className="w-full overflow-visible"
        >
          {/* Reference grid lines: 0, 50 (threshold), 100 */}
          {[0, 50, 100].map((v) => (
            <g key={v}>
              <line
                x1={left}
                x2={width - 10}
                y1={y(v)}
                y2={y(v)}
                stroke="#2a2a2a"
                strokeDasharray={v === 50 ? "4 4" : undefined}
                strokeWidth={v === 50 ? "1" : "0.5"}
              />
              <text
                x="4"
                y={y(v) + 3}
                fill="#888880"
                fontSize="9"
                fontFamily="var(--font-mono)"
              >
                {v}
              </text>
            </g>
          ))}

          {/* Polyline series and data points */}
          {series.map((s) => (
            <g key={s.label}>
              {segments(s.values).map((points, i) => (
                <polyline
                  key={i}
                  points={points}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              {s.values.map((v, i) =>
                v === null ? null : (
                  <circle
                    key={i}
                    cx={x(i)}
                    cy={y(v)}
                    r="3.5"
                    fill={s.color}
                    stroke="#161616"
                    strokeWidth="1"
                  >
                    <title>
                      {records[i]?.date}: {s.label} {number(v)}
                    </title>
                  </circle>
                )
              )}
            </g>
          ))}
        </svg>

        {/* Legend */}
        <div className="flex gap-4 text-xs font-mono pt-1 border-t border-[#222]">
          <span className="text-[#e8a23a] flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#e8a23a]" />
            Wearable estimate
          </span>
          <span className="text-[#4fb89a] flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#4fb89a]" />
            Reported stress
          </span>
        </div>
      </div>

      {/* Itemized Day Records */}
      <div className="space-y-3">
        <p
          style={{ fontFamily: "var(--font-mono)" }}
          className="text-[10px] tracking-[0.15em] uppercase text-[#888880]"
        >
          Daily log history
        </p>
        {records.map((r) => {
          const isSelected = r.date === data.date;
          return (
            <div
              key={r.date}
              className={`demo-card bg-[#161616] border rounded-2xl p-4 transition-colors ${
                isSelected ? "border-[#a78bfa] bg-[#1a1824]" : "border-[#2a2a2a]"
              }`}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#f2f0ec]">
                  {r.date}
                  {isSelected && (
                    <span className="ml-2 text-[10px] font-mono text-[#a78bfa] uppercase">
                      · Selected
                    </span>
                  )}
                </h2>
                <span className="text-[11px] font-mono text-[#888880]">
                  {r.comparison?.label}
                </span>
              </div>

              <p className="text-sm mt-2 font-mono">
                <span className="text-[#e8a23a]">
                  Estimate {number(r.wearable_estimate?.value)}
                </span>
                {" · "}
                <span className="text-[#4fb89a]">
                  Reported {number(r.reported_stress?.normalized_0_100)}
                </span>
              </p>

              <p className="text-xs text-[#888880] mt-1.5">
                {r.reported_stress?.source === "demo_checkin"
                  ? `Demo check-in override · Original: ${number(
                      r.original_reported_stress
                    )} / 100`
                  : "Original historical response"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}