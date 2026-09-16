import { useState } from "react";
import TodayScreen from "./screens/TodayScreen";
import CheckInScreen from "./screens/CheckInScreen";
import WhyScreen from "./screens/WhyScreen";
import TrendsScreen from "./screens/TrendsScreen";

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
      className="h-screen bg-[#0d0d0d] flex items-center justify-center p-4 overflow-hidden"
    >
      {/* Phone shell */}
      <div className="relative w-[375px] h-[812px] bg-[#0d0d0d] rounded-[44px] overflow-hidden border border-[#2a2a2a] shadow-[0_0_80px_rgba(0,0,0,0.8)] flex flex-col">
        {/* Status bar */}
        <div className="flex items-center justify-between px-7 pt-4 pb-2 flex-shrink-0">
          <span style={{ fontFamily: "var(--font-mono)" }} className="text-[11px] text-[#888880]">
            9:41
          </span>
          <div className="w-24 h-6 bg-[#161616] rounded-full" />
          <div className="flex gap-1 items-center">
            <div className="w-4 h-2.5 rounded-sm bg-[#4fb89a]" />
            <span style={{ fontFamily: "var(--font-mono)" }} className="text-[11px] text-[#888880]">
              87%
            </span>
          </div>
        </div>

        {/* Screen content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {content[active]}
        </div>

        {/* Bottom nav */}
        <div className="flex-shrink-0 border-t border-[#2a2a2a] bg-[#0d0d0d] pb-6">
          <div className="flex">
            {SCREENS.map((s) => (
              <button
                key={s}
                onClick={() => setActive(s)}
                className={`flex-1 py-3 text-center transition-colors ${
                  active === s
                    ? "text-[#f2f0ec]"
                    : "text-[#888880] hover:text-[#f2f0ec]"
                }`}
              >
                <NavIcon name={s} active={active === s} />
                <span
                  style={{ fontFamily: "var(--font-mono)" }}
                  className={`block text-[9px] mt-0.5 tracking-wider uppercase ${
                    active === s ? "text-[#f2f0ec]" : "text-[#555550]"
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
                ? "bg-[#f2f0ec] text-[#0d0d0d]"
                : "bg-[#1f1f1f] text-[#888880] hover:text-[#f2f0ec]"
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
  const color = active ? "#f2f0ec" : "#555550";
  const icons: Record<Screen, React.ReactNode> = {
    Today: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="mx-auto">
        <circle cx="10" cy="10" r="7" stroke={color} strokeWidth="1.5" />
        <circle cx="10" cy="10" r="2.5" fill={color} />
      </svg>
    ),
    "Check-in": (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="mx-auto">
        <rect x="3" y="3" width="14" height="14" rx="3" stroke={color} strokeWidth="1.5" />
        <path d="M7 10h6M10 7v6" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    "Why?": (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="mx-auto">
        <circle cx="10" cy="10" r="7" stroke={color} strokeWidth="1.5" />
        <path d="M10 13.5v-.5M10 6.5c0 0 2 .5 2 2.5s-2 2-2 3" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    Trends: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="mx-auto">
        <path d="M3 14l4-4 3 2 4-5 3 2" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  };
  return <>{icons[name]}</>;
}
