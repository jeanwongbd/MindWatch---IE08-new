import {useState} from "react";
import {api, type DemoRecord} from "../api";
export default function CheckInScreen({data,onDone}:{data:DemoRecord;onDone:()=>void}) {
  const [stress,setStress] = useState(data.reported_stress.source === "demo_checkin" ? data.reported_stress.value : 5);
  const [tags,setTags] = useState<string[]>(data.reported_stress.context_tags || []);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  if(data.mode === "synthetic_scenario") return <div className="space-y-3"><h1 className="demo-title">Reported stress</h1><p>Synthetic scenarios are read-only fixtures.</p><p>{data.reported_stress.value} / 100</p></div>;
  async function save() {
    setBusy(true);setError("");
    try {await api("/checkin",{method:"POST",body:JSON.stringify({date:data.date,stress,context_tags:tags})});onDone();}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <form onSubmit={e=>{e.preventDefault();void save();}} className="space-y-5">
    <h1 className="demo-title">Demo check-in</h1><p className="text-sm text-[#888880]">For historical date {data.date}. This changes your comparison, while the saved model estimate stays fixed.</p>
    <label className="block">Reported stress: <strong>{stress} / 10</strong><input aria-label="Reported stress" type="range" min="0" max="10" step="1" value={stress} onChange={e=>setStress(Number(e.target.value))} className="w-full mt-4 accent-[#4fb89a]" /></label>
    <fieldset><legend className="text-sm mb-3">Optional context tags</legend><div className="flex flex-wrap gap-2">{["Study","Deadlines","Sleep","Exercise","Social"].map(tag=><label key={tag} className="text-sm rounded-lg border border-[#444] p-2"><input type="checkbox" checked={tags.includes(tag)} onChange={()=>setTags(v=>v.includes(tag)?v.filter(t=>t!==tag):[...v,tag])} /> {tag}</label>)}</div></fieldset>
    {error && <p role="alert" className="text-[#e85d3a] text-sm">{error}</p>}
    <button type="submit" disabled={busy} className="demo-button w-full">{busy ? "Saving…" : "Save demo check-in"}</button>
  </form>;
}
