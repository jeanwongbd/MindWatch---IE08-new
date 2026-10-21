import { number, type DemoRecord } from "../api";

interface Props {
  data: DemoRecord;
  onBack?: () => void;
}

const FIELDS = [
  { id: "avg_rmssd", label: "HRV RMSSD", unit: "ms", icon: "💓" },
  { id: "overall_score", label: "Sleep score", unit: "/ 100", icon: "🌙" },
  { id: "daily_steps", label: "Recorded steps", unit: "steps", icon: "👟" },
  { id: "avg_rmssd_dev", label: "Difference from earlier HRV mean", unit: "ms", icon: "📊" },
];

export default function WhyScreen({ data, onBack }: Props) {
  return (
    <div className="px-6 py-4 space-y-5">
      {/* Header */}
      <div>
        {onBack && (
          <button
            onClick={onBack}
            style={{ fontFamily: "var(--font-mono)" }}
            className="text-[11px] text-muted hover:text-ink transition-colors mb-2 flex items-center gap-1"
          >
            ← Back
          </button>
        )}
        <p
          style={{ fontFamily: "var(--font-mono)" }}
          className="text-[10px] tracking-[0.2em] uppercase text-muted"
        >
          Biometric inputs
        </p>
        <h1
          style={{ fontFamily: "var(--font-display)" }}
          className="demo-title text-2xl font-light text-ink mt-0.5 leading-snug"
        >
          Measurements used
        </h1>
      </div>

      {data.mode === "synthetic_scenario" ? (
        <div className="demo-card bg-surface border border-border rounded-2xl p-4">
          <p className="text-sm text-ink">
            Fixed synthetic outputs have no measured inputs. Ridge was not used for this scenario.
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted font-mono">
            Actual source inputs for {data.date}. These inputs do not establish causes of stress.
          </p>

          <div className="space-y-3">
            {FIELDS.map((f) => {
              const val = data.measurements ? data.measurements[f.id] : null;
              const isImputed = data.imputed_features && data.imputed_features.includes(f.id);

              return (
                <div
                  key={f.id}
                  className="demo-card bg-surface border border-border rounded-2xl p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{f.icon}</span>
                      <h2 className="text-xs text-muted uppercase tracking-wide font-mono">
                        {f.label}
                      </h2>
                    </div>
                    {isImputed && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-accent-load/10 text-accent-load border border-accent-load/20">
                        Median Imputed
                      </span>
                    )}
                  </div>

                  <div className="flex items-baseline gap-1.5">
                    <p
                      style={{ fontFamily: "var(--font-display)" }}
                      className="demo-value text-2xl font-light text-ink"
                    >
                      {number(val)}
                    </p>
                    {val != null && (
                      <span className="text-xs text-muted font-mono">
                        {f.unit}
                      </span>
                    )}
                  </div>

                  {isImputed && (
                    <p className="text-xs text-accent-load mt-1 bg-alert-surface p-2 rounded-lg border border-accent-load/20">
                      The model filled this missing input using the calibration median. It is not a measured value.
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-muted font-mono">
            HRV deviation uses only earlier dated HRV measurements.
          </p>
        </>
      )}

      {/* Limitations footer */}
      {data.limitation && (
        <div className="border-t border-border pt-3">
          <p className="text-[10px] text-dim leading-relaxed">
            {data.limitation}
          </p>
        </div>
      )}
    </div>
  );
}