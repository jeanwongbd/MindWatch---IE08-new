import { useEffect, useState } from "react";
import TodayScreen from "./screens/TodayScreen";
import CheckInScreen from "./screens/CheckInScreen";
import WhyScreen from "./screens/WhyScreen";
import TrendsScreen from "./screens/TrendsScreen";
import { C } from "./theme";
import { DEV_MODE } from "./config";
import { api, type DemoConfig, type DemoRecord, type Mode } from "./api";

const SCREENS = ["Today", "Check-in", "Measurements used", "Trends"] as const;
type Screen = (typeof SCREENS)[number];

export default function DemoApp() {
  const [active, setActive] = useState<Screen>("Today");
  const [config, setConfig] = useState<DemoConfig | null>(null);
  const [mode, setMode] = useState<Mode>("historical_replay");
  const [date, setDate] = useState("");
  const [scenario, setScenario] = useState("aligned_low");
  const [data, setData] = useState<DemoRecord | null>(null);
  const [trends, setTrends] = useState<DemoRecord[]>([]);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let live = true;
    setError("");
    api<DemoConfig>("/demo/config")
      .then((c) => {
        if (live) {
          setConfig(c);
          setDate((d) => d || c.default_date);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [revision]);

  useEffect(() => {
    if (!config || !date) return;
    let live = true;
    setData(null);
    setTrends([]);
    setError("");
    setLoading(true);
    const query = new URLSearchParams({ mode, date, scenario });
    Promise.all([
      api<DemoRecord>(`/today?${query}`),
      mode === "historical_replay"
        ? api<{ records: DemoRecord[] }>("/trends")
        : Promise.resolve({ records: [] }),
    ])
      .then(([record, history]) => {
        if (live) {
          setData(record);
          setTrends(history.records);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [config, date, mode, scenario, revision]);

  async function reset() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ default_date: string }>("/demo/reset", {
        method: "POST",
      });
      setMode("historical_replay");
      setDate(result.default_date);
      setScenario("aligned_low");
      setActive("Today");
      setNotice("Biometrics reset. Original values restored.");
      setRevision((r) => r + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const content: Record<Screen, React.ReactNode> = {
    Today: data ? (
      <TodayScreen
        data={data}
        onCheckIn={() => setActive("Check-in")}
        onWhy={() => setActive("Measurements used")}
      />
    ) : null,
    "Check-in": data ? (
      <CheckInScreen
        key={`${mode}/${date}/${scenario}`}
        data={data}
        onReturn={() => setActive("Today")}
        onDone={() => {
          setNotice("Check-in saved.");
          setRevision((r) => r + 1);
          setActive("Today");
        }}
      />
    ) : null,
    "Measurements used": data ? <WhyScreen data={data} /> : null,
    Trends: data ? <TrendsScreen data={data} records={trends} /> : null,
  };

  return (
    <div
      style={{ fontFamily: "var(--font-body)" }}
      className="min-h-screen bg-page flex items-center justify-center p-3"
    >
      {/* Phone shell */}
      <div className="relative w-full max-w-[420px] h-[min(900px,96dvh)] min-h-[580px] bg-background rounded-[36px] overflow-hidden border border-border shadow-[0_0_80px_rgba(0,0,0,0.12)] flex flex-col">
        {/* Status bar */}
        <div className="flex items-center justify-between px-6 pt-3 pb-1 flex-shrink-0">
          <span
            style={{ fontFamily: "var(--font-mono)" }}
            className="text-[11px] text-muted"
          >
            9:41
          </span>
          <div className="w-20 h-5 bg-surface rounded-full" />
          <div className="flex gap-1.5 items-center">
            <div className="w-3.5 h-2 rounded-sm bg-accent-calm" />
            <span
              style={{ fontFamily: "var(--font-mono)" }}
              className="text-[10px] text-muted"
            >
              87%
            </span>
          </div>
        </div>

        {/* Control Header */}
        <header className="px-5 pt-2 pb-3 border-b border-border bg-header/70 backdrop-blur space-y-2.5 flex-shrink-0">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm tracking-wide text-ink">
              MindWatch
            </span>
            <button
              disabled={busy}
              onClick={reset}
              className="text-xs text-accent-calm hover:underline disabled:opacity-50"
            >
              {busy ? "Resetting…" : "Reset"}
            </button>
          </div>

          <div className={`grid gap-2 ${DEV_MODE ? "grid-cols-2" : "grid-cols-1"}`}>
            {DEV_MODE && (
            <div>
              <span className="block text-[9px] uppercase tracking-wider text-muted mb-0.5">
                Mode
              </span>
              <select
                aria-label="Mode"
                value={mode}
                onChange={(e) => {
                  setNotice("");
                  setMode(e.target.value as Mode);
                }}
                className="w-full bg-input text-ink border border-border rounded-lg px-2 py-1.5 text-xs outline-none focus:border-accent-pulse"
              >
                <option value="historical_replay">Historical replay</option>
                <option value="synthetic_scenario">Synthetic scenario</option>
              </select>
            </div>
            )}

            <div>
              {mode === "historical_replay" ? (
                <>
                  <span className="block text-[9px] uppercase tracking-wider text-muted mb-0.5">
                    Date
                  </span>
                  <select
                    aria-label="Replay date"
                    className="w-full bg-input text-ink border border-border rounded-lg px-2 py-1.5 text-xs outline-none focus:border-accent-pulse"
                    value={date}
                    onChange={(e) => {
                      setNotice("");
                      setDate(e.target.value);
                    }}
                  >
                    {config?.replay_dates.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  <span className="block text-[9px] uppercase tracking-wider text-muted mb-0.5">
                    Scenario
                  </span>
                  <select
                    aria-label="Scenario"
                    className="w-full bg-input text-ink border border-border rounded-lg px-2 py-1.5 text-xs outline-none focus:border-accent-pulse"
                    value={scenario}
                    onChange={(e) => setScenario(e.target.value)}
                  >
                    {config?.scenarios.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
          </div>

          {notice && (
            <p
              role="status"
              className="text-[11px] text-accent-calm font-mono bg-accent-calm/10 px-2 py-1 rounded"
            >
              {notice}
            </p>
          )}
        </header>

        {/* Screen content area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {error ? (
            <div role="alert" className="p-6 text-sm text-accent-stress space-y-3 font-mono">
              <p>{error}</p>
              <button
                className="px-4 py-2 bg-accent-calm text-background font-semibold text-xs rounded-lg"
                onClick={() => setRevision((r) => r + 1)}
              >
                Retry connection
              </button>
            </div>
          ) : loading || !data ? (
            <div className="flex items-center justify-center h-48 text-muted text-xs font-mono">
              Loading biometrics…
            </div>
          ) : (
            content[active]
          )}
        </div>

        {/* Bottom nav bar */}
        <nav
          aria-label="Screens"
          className="flex-shrink-0 border-t border-border bg-background pb-5"
        >
          <div className="flex">
            {SCREENS.map((s) => (
              <button
                key={s}
                onClick={() => setActive(s)}
                aria-current={active === s ? "page" : undefined}
                className={`flex-1 py-3 text-center transition-colors ${
                  active === s
                    ? "text-ink"
                    : "text-muted hover:text-ink"
                }`}
              >
                <NavIcon name={s} active={active === s} />
                <span
                  style={{ fontFamily: "var(--font-mono)" }}
                  className={`block text-[9px] mt-1 tracking-wider uppercase truncate px-1 ${
                    active === s ? "text-ink" : "text-dim"
                  }`}
                >
                  {s === "Measurements used" ? "Why?" : s}
                </span>
              </button>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}

function NavIcon({ name, active }: { name: Screen; active: boolean }) {
  // SVG presentation attributes don't resolve var(), so paint via CSS properties.
  const color = active ? C.ink : C.dim;
  const stroke = { stroke: color, fill: "none" as const };
  const icons: Record<Screen, React.ReactNode> = {
    Today: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" className="mx-auto">
        <circle cx="10" cy="10" r="7" style={stroke} strokeWidth="1.5" />
        <circle cx="10" cy="10" r="2.5" style={{ fill: color }} />
      </svg>
    ),
    "Check-in": (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" className="mx-auto">
        <rect x="3" y="3" width="14" height="14" rx="3" style={stroke} strokeWidth="1.5" />
        <path d="M7 10h6M10 7v6" style={stroke} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    "Measurements used": (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" className="mx-auto">
        <circle cx="10" cy="10" r="7" style={stroke} strokeWidth="1.5" />
        <path
          d="M10 13.5v-.5M10 6.5c0 0 2 .5 2 2.5s-2 2-2 3"
          style={stroke}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
    Trends: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" className="mx-auto">
        <path
          d="M3 14l4-4 3 2 4-5 3 2"
          style={stroke}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  };
  return <>{icons[name]}</>;
}