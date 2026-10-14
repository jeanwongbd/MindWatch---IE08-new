import { useEffect, useState } from "react";
import TodayScreen from "./screens/TodayScreen";
import CheckInScreen from "./screens/CheckInScreen";
import WhyScreen from "./screens/WhyScreen";
import TrendsScreen from "./screens/TrendsScreen";
import {api, type DemoConfig, type DemoRecord, type Mode} from "./api";
const SCREENS = ["Today", "Check-in", "Measurements used", "Trends"] as const;
type Screen = (typeof SCREENS)[number];
export default function App() {
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
    api<DemoConfig>("/demo/config").then(c => {if (live) {setConfig(c); setDate(d => d || c.default_date);}}).catch(e => {if(live) setError(e.message);});
    return () => {live = false;};
  }, [revision]);
  useEffect(() => {
    if (!config || !date) return;
    let live = true;
    setData(null); setTrends([]); setError(""); setLoading(true);
    const query = new URLSearchParams({mode, date, scenario});
    Promise.all([api<DemoRecord>(`/today?${query}`), mode === "historical_replay" ? api<{records: DemoRecord[]}>("/trends") : Promise.resolve({records: []})])
      .then(([record, history]) => {if(live) {setData(record); setTrends(history.records);}})
      .catch(e => {if(live) setError(e.message);}).finally(() => {if(live) setLoading(false);});
    return () => {live = false;};
  }, [config, date, mode, scenario, revision]);
  async function reset() {
    setBusy(true); setError("");
    try {const result = await api<{default_date:string}>("/demo/reset", {method:"POST"}); setMode("historical_replay"); setDate(result.default_date); setScenario("aligned_low"); setActive("Today"); setNotice("Demo reset. Original historical values restored."); setRevision(r => r+1);}
    catch(e) {setError((e as Error).message);} finally {setBusy(false);}
  }
  const content = data && {
    Today: <TodayScreen data={data} onCheckIn={() => setActive("Check-in")} onWhy={() => setActive("Measurements used")} />,
    "Check-in": <CheckInScreen key={`${mode}/${date}/${scenario}`} data={data} onDone={() => {setNotice("Demo check-in saved."); setRevision(r=>r+1); setActive("Today");}} />,
    "Measurements used": <WhyScreen data={data} />,
    Trends: <TrendsScreen data={data} records={trends} />,
  };
  return <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center p-3">
    <div className="relative w-full max-w-[420px] h-[min(900px,96dvh)] min-h-[540px] rounded-[32px] overflow-hidden border border-[#2a2a2a] shadow-2xl flex flex-col">
      <header className="px-5 pt-5 pb-3 border-b border-[#2a2a2a] space-y-3">
        <div className="flex items-center justify-between"><span className="font-semibold text-lg">MindWatch</span><button disabled={busy} onClick={reset} className="text-xs text-[#4fb89a]">{busy ? "Resetting…" : "Reset demo"}</button></div>
        <label className="block text-xs text-[#888880]">Mode<select aria-label="Mode" value={mode} onChange={e=>{setNotice("");setMode(e.target.value as Mode);}} className="demo-select"><option value="historical_replay">Historical replay</option><option value="synthetic_scenario">Synthetic scenario</option></select></label>
        {config && (mode === "historical_replay" ? <label className="block text-xs text-[#888880]">Replay date<select aria-label="Replay date" className="demo-select" value={date} onChange={e=>{setNotice("");setDate(e.target.value);}}>{config.replay_dates.map(d=><option key={d}>{d}</option>)}</select></label> : <label className="block text-xs text-[#888880]">Scenario<select aria-label="Scenario" className="demo-select" value={scenario} onChange={e=>setScenario(e.target.value)}>{config.scenarios.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select></label>)}
      </header>
      <main className="flex-1 overflow-y-auto p-5 space-y-4">
        <p className="text-xs uppercase tracking-wide text-[#a78bfa]">{mode === "historical_replay" ? `Historical SSAQS replay · ${date}` : "Synthetic scenario · Fixed fixture"}</p>
        {notice && <p role="status" className="text-sm text-[#4fb89a]">{notice}</p>}
        {error ? <div role="alert" className="text-sm text-[#e85d3a]"><p>{error}</p><button className="demo-button mt-3" onClick={()=>setRevision(r=>r+1)}>Retry connection</button></div> : loading || !content ? <p role="status">Loading demo…</p> : content[active]}
      </main>
      <nav aria-label="Screens" className="flex border-t border-[#2a2a2a] bg-[#161616]">{SCREENS.map(s=><button key={s} onClick={()=>setActive(s)} aria-current={active === s ? "page" : undefined} className={`flex-1 px-1 py-4 text-[11px] ${active===s ? "text-[#4fb89a]" : "text-[#888880]"}`}>{s}</button>)}</nav>
    </div>
  </div>;
}
