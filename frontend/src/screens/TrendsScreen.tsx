import {number,type DemoRecord} from "../api";
export default function TrendsScreen({data,records}:{data:DemoRecord;records:DemoRecord[]}) {
  if(data.mode === "synthetic_scenario") return <div className="space-y-3"><h1 className="demo-title">Trends</h1><p>Synthetic scenario selected. Fixtures are excluded from historical trends.</p></div>;
  const width=330,height=160,left=30,top=12,plot=125;
  const x=(i:number)=>left+i*(width-left-10)/Math.max(1,records.length-1);
  const y=(v:number)=>top+(100-v)/100*plot;
  function segments(values:(number|null)[]) {const result:string[]=[];let points:string[]=[];values.forEach((v,i)=>{if(v===null){if(points.length)result.push(points.join(" "));points=[];}else points.push(`${x(i)},${y(v)}`);});if(points.length)result.push(points.join(" "));return result;}
  const series=[{color:"#e8a23a",label:"Wearable estimate",values:records.map(r=>r.wearable_estimate.value)},{color:"#4fb89a",label:"Reported stress",values:records.map(r=>r.reported_stress.normalized_0_100)}];
  return <div className="space-y-4"><h1 className="demo-title">Historical trends</h1><p className="text-xs text-[#888880]">Historical replay · Both series use 0–100. Missing estimates are gaps.</p>
    <svg role="img" aria-label="Historical wearable estimates and reported stress, on a zero to one hundred scale" viewBox={`0 0 ${width} ${height}`} className="w-full">{[0,50,100].map(v=><g key={v}><line x1={left} x2={width-10} y1={y(v)} y2={y(v)} stroke="#333" strokeDasharray={v===50?"4 4":undefined}/><text x="0" y={y(v)+4} fill="#888880" fontSize="10">{v}</text></g>)}{series.map(s=><g key={s.label}>{segments(s.values).map((points,i)=><polyline key={i} points={points} fill="none" stroke={s.color} strokeWidth="2"/>)}{s.values.map((v,i)=>v===null?null:<circle key={i} cx={x(i)} cy={y(v)} r="3" fill={s.color}><title>{records[i].date}: {s.label} {number(v)}</title></circle>)}</g>)}</svg>
    <div className="flex gap-4 text-xs"><span className="text-[#e8a23a]">● Wearable estimate</span><span className="text-[#4fb89a]">● Reported stress</span></div>
    <p className="text-xs text-[#888880]">{records[0]?.date} to {records.at(-1)?.date}</p>
    {records.map(r=><div key={r.date} className={`demo-card ${r.date===data.date?"border-[#a78bfa]":""}`}><h2 className="text-sm font-semibold">{r.date}{r.date===data.date?" · Selected":""}</h2><p className="text-sm mt-2"><span className="text-[#e8a23a]">Estimate {number(r.wearable_estimate.value)}</span> · <span className="text-[#4fb89a]">Reported {number(r.reported_stress.normalized_0_100)}</span></p><p className="text-xs text-[#888880] mt-2">{r.reported_stress.source==="demo_checkin"?`Demo check-in override · Original: ${number(r.original_reported_stress)} / 100`:"Original historical response"}</p><p className="text-xs mt-2">{r.comparison.label}</p></div>)}
  </div>;
}
