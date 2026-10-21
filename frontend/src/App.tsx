import { useState } from "react";
import TodayScreen from "./screens/TodayScreen";
import CheckInScreen from "./screens/CheckInScreen";
import WhyScreen from "./screens/WhyScreen";
import TrendsScreen from "./screens/TrendsScreen";
import { C } from "./theme";

const SCREENS = ["Today", "Check-in", "Why?", "Trends"] as const;
type Screen = (typeof SCREENS)[number];

export default function App() {
  const [active, setActive] = useState<Screen>("Today");

  const content: Record<Screen, React.ReactNode> = {
    Today: <TodayScreen onCheckIn={() => setActive("Check-in")} onWhy={() => setActive("Why?")} />,
    "Check-in": <CheckInScreen onDone={() => setActive("Today")} />,
    "Why?": <WhyScreen onBack={() => setActive("Today")} />,
    Trends: <TrendsScreen />,
  };

  return (
    <div
      style={{ fontFamily: "var(--font-body)" }}
      className="h-screen bg-page flex items-center justify-center p-4 overflow-hidden"
    >
      {/* Phone shell */}
      <div className="relative w-[375px] h-[812px] bg-background rounded-[44px] overflow-hidden border border-border shadow-[0_0_80px_rgba(0,0,0,0.12)] flex flex-col">
        {/* Status bar */}
        <div className="flex items-center justify-between px-7 pt-4 pb-2 flex-shrink-0">
          <span style={{ fontFamily: "var(--font-mono)" }} className="text-[11px] text-muted">
            9:41
          </span>
          <div className="w-24 h-6 bg-surface-raised rounded-full" />
          <div className="flex gap-1 items-center">
            <div className="w-4 h-2.5 rounded-sm bg-accent-calm" />
            <span style={{ fontFamily: "var(--font-mono)" }} className="text-[11px] text-muted">
              87%
            </span>
          </div>
        </div>

        {/* Screen content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {content[active]}
        </div>

        {/* Bottom nav */}
        <div className="flex-shrink-0 border-t border-border bg-background pb-6">
          <div className="flex">
            {SCREENS.map((s) => (
              <button
                key={s}
                onClick={() => setActive(s)}
                className={`flex-1 py-3 text-center transition-colors ${
                  active === s ? "text-ink" : "text-muted hover:text-ink"
                }`}
              >
                <NavIcon name={s} active={active === s} />
                <span
                  style={{ fontFamily: "var(--font-mono)" }}
                  className={`block text-[9px] mt-0.5 tracking-wider uppercase ${
                    active === s ? "text-ink" : "text-dim"
                  }`}
                >
                  {s}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Screen label outside phone */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
        {SCREENS.map((s) => (
          <button
            key={s}
            onClick={() => setActive(s)}
            className={`px-3 py-1 rounded-full text-xs transition-colors ${
              active === s
                ? "bg-inverse text-on-inverse"
                : "bg-surface-raised text-muted hover:text-ink"
            }`}
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function NavIcon({ name, active }: { name: Screen; active: boolean }) {
  // SVG presentation attributes don't resolve var(), so paint via CSS properties.
  const color = active ? C.ink : C.dim;
  const stroke = { stroke: color };
  const fill = { fill: color };
  const icons: Record<Screen, React.ReactNode> = {
    Today: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="mx-auto">
        <circle cx="10" cy="10" r="7" style={stroke} strokeWidth="1.5" fill="none" />
        <circle cx="10" cy="10" r="2.5" style={fill} />
      </svg>
    ),
    "Check-in": (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="mx-auto">
        <rect x="3" y="3" width="14" height="14" rx="3" style={stroke} strokeWidth="1.5" fill="none" />
        <path d="M7 10h6M10 7v6" style={stroke} strokeWidth="1.5" strokeLinecap="round" fill="none" />
      </svg>
    ),
    "Why?": (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="mx-auto">
        <circle cx="10" cy="10" r="7" style={stroke} strokeWidth="1.5" fill="none" />
        <path
          d="M10 13.5v-.5M10 6.5c0 0 2 .5 2 2.5s-2 2-2 3"
          style={stroke}
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    ),
    Trends: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="mx-auto">
        <path
          d="M3 14l4-4 3 2 4-5 3 2"
          style={stroke}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    ),
  };
  return <>{icons[name]}</>;
}
