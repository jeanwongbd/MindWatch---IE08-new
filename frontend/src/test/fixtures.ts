import type { DemoRecord } from "../api";

// Field names must match the real backend response. backend/tests/test_api_contract.py
// checks the backend side of the same names.
export const record: DemoRecord = {
  user_id: "demo_p05",
  date: "2025-04-21",
  mode: "historical_replay",
  source_label: "Historical SSAQS replay",
  reported_stress: { value: 5, scale_max: 10, normalized_0_100: 50, source: "study" },
  wearable_estimate: { value: 42.5, scale_max: 100, status: "ok", method: "test" },
  comparison: { state: "aligned_low", label: "Aligned", description: "Estimate and report agree." },
  measurements: { avg_rmssd: 40 },
  imputed_features: [],
  limitation: "Test limitation text.",
};
