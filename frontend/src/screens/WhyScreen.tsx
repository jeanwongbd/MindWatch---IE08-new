import {number, type DemoRecord} from "../api";
const FIELDS = [{id:"avg_rmssd",label:"HRV RMSSD",unit:"ms"},{id:"overall_score",label:"Sleep score",unit:"/ 100"},{id:"daily_steps",label:"Recorded steps",unit:"steps"},{id:"avg_rmssd_dev",label:"Difference from earlier HRV mean",unit:"ms"}];
export default function WhyScreen({data}:{data:DemoRecord}) {
  return <div className="space-y-4"><h1 className="demo-title">Measurements used</h1>
    {data.mode === "synthetic_scenario" ? <p>Fixed synthetic outputs have no measured inputs. Ridge was not used for this scenario.</p> : <>
      <p className="text-sm text-[#888880]">Actual source inputs for {data.date}. These inputs do not establish causes of stress.</p>
      {FIELDS.map(f=><div key={f.id} className="demo-card"><h2 className="text-sm text-[#888880]">{f.label}</h2><p className="text-xl mt-2">{number(data.measurements[f.id])}{data.measurements[f.id] != null && ` ${f.unit}`}</p>{data.imputed_features.includes(f.id) && <p className="text-xs mt-2 text-[#e8a23a]">The model filled this missing input using the calibration median. It is not a measured value.</p>}</div>)}
      <p className="text-xs text-[#888880]">HRV deviation uses only earlier dated HRV measurements.</p>
    </>}
    <p className="text-xs text-[#888880] leading-relaxed">{data.limitation}</p>
  </div>;
}
