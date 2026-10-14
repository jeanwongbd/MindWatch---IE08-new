import {number, type DemoRecord} from "../api";
interface Props {data: DemoRecord; onCheckIn:()=>void; onWhy:()=>void}
export default function TodayScreen({data, onCheckIn, onWhy}: Props) {
  const estimate = data.wearable_estimate;
  return <div className="space-y-4">
    <h1 className="demo-title">Your stress comparison</h1>
    <div className="demo-card"><p className="text-sm text-[#888880]">Wearable-based stress estimate</p><p className="demo-value text-[#e8a23a]">{estimate.value == null ? "Not enough data" : `${number(estimate.value)} / 100`}</p><p className="text-xs text-[#888880]">{estimate.method === "synthetic_fixture" ? "Fixed synthetic fixture" : "Saved personal Ridge model"} · {estimate.status.replace(/_/g, " ")}</p></div>
    <div className="demo-card"><p className="text-sm text-[#888880]">Reported stress</p><p className="demo-value text-[#4fb89a]">{number(data.reported_stress.value)} / {data.reported_stress.scale_max}</p><p className="text-xs text-[#888880]">{data.reported_stress.source === "demo_checkin" ? `Demo check-in · ${number(data.reported_stress.normalized_0_100)} / 100 for comparison` : data.mode === "synthetic_scenario" ? "Fixed synthetic fixture" : "Original historical SSAQS response"}</p></div>
    <section className="demo-card"><h2 className="font-semibold">Comparison · {data.comparison.label}</h2><p className="text-sm mt-2">{data.comparison.description}</p><p className="text-xs text-[#888880] mt-3">Threshold: 50 / 100. This is a demonstration convention, not a validated clinical threshold.</p></section>
    {data.mode === "historical_replay" && <button className="demo-button w-full" onClick={onCheckIn}>Add demo check-in</button>}
    <button className="text-sm text-[#a78bfa]" onClick={onWhy}>View measurements used →</button>
    <p className="text-xs text-[#888880] leading-relaxed">{data.limitation}</p>
  </div>;
}
