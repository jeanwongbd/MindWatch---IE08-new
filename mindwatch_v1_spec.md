# MindWatch V1 Specification (MW-001)

| Field | Frozen V1 decision |
| --- | --- |
| Status | Ready for five-person review |
| Version | 1.0 - 2026-08-26 |
| Owner | Magdalene; all team members review |
| Product goal | Help a university student compare perceived stress with physiological load relative to their own baseline, then explain agreement or mismatch without making medical claims. |
| Main dataset | SSAQS |
| Main application | React Native mobile app with a FastAPI backend |

## 1. Product contract

MindWatch V1 takes a student's historical wearable measurements and a brief self-reported stress check-in. It estimates **physiological load relative to that student's personal baseline**, keeps **reported stress** as a separate dimension, classifies their agreement or mismatch, and explains which measurements differed most from normal.

MindWatch does **not** detect mental stress, diagnose anxiety, or claim that a wearable feature caused a person's feelings.

### Frozen terminology

- Use **physiological load** or **body load**, never "physiological stress."
- Use **reported stress** or **perceived stress**, never "mental stress detected by MindWatch."
- Use uncertainty language such as **estimate**, **may**, **relative to your usual level**, and **not enough data**.

## 2. Inputs and timing

The canonical analytical unit is one `participant_id` x one **participant-local calendar date** x one check-in. Only information available at or before `timeStampStart` may be used for a same-day result. Full-day steps or activity recorded after the check-in must not leak into that result.

The supplied files for one student establish this V1 input contract:

| Source file | V1 fields | Role | Decision |
| --- | --- | --- | --- |
| `daily_questions.csv` | `timeStampStart`, `timeZoneOffset`, `stress` | Primary target/check-in | Required. Preserve the continuous 0-100 SSAQS value. `anxiety` is out of core V1. |
| `hrv.csv` | `timestamp`, `rmssd`, `coverage` | Recovery signal | Core. Aggregate valid pre-check-in RMSSD; retain coverage for quality checks. LF/HF remain exploratory. |
| `sleep.csv` | `timestamp`, `overall_score`, `deep_sleep_in_minutes` | Recovery signal | Core. No total sleep-duration field is present in this sample, so V1 must not require it. |
| `steps.csv` | `timestamp`, `steps` | Activity context | Supporting. Sum only observations available before the check-in. |
| `activity_level.csv` | `timestamp`, `level` | Activity context | Supporting. Derive sedentary, light, moderate, and very-active minutes before the check-in. |
| `stress.csv` | `DATE`, `STRESS_SCORE`, `CALCULATION_FAILED` | Proprietary comparator | Optional benchmark only; never the target. Treat failed calculations and their zero values as missing. |
| `oxygen.csv` | `timestamp`, `value` | Research-only candidate | Excluded from the core V1 load score until its semantics and quality are audited. |

`participant_id` is not present in any supplied CSV and must be injected from the source folder, manifest, or import metadata. All `Z` timestamps are UTC. The questionnaire's per-record `timeZoneOffset` must be retained when deriving local dates. HRV timestamps are timezone-naive in the sample and must not be silently assumed to be UTC; MW-101 must document their interpretation before final alignment.

### Sample-data reality check

- 121 daily questionnaires span 2025-02-19 to 2025-06-22; reported stress ranges from 4 to 66, with median 24.
- Activity and steps cover 106 UTC dates; HRV covers 45; oxygen 70; sleep 31.
- Fitbit stress has 28 rows but only 18 valid scores; all 10 failed rows contain zero and must be excluded.
- Using provisional UTC-date matching, only 30 questionnaire dates contain HRV, sleep, and steps together; 24 also contain a Fitbit stress row.
- Resting heart rate is absent from the supplied files and is therefore optional, not a guaranteed V1 input.

These counts describe one sample student, not the full SSAQS cohort. MW-101 and MW-102 own the cohort-wide audit and final alignment policy.

## 3. Stress scale and prototype load rule

### Reported stress

- The modelling target remains continuous.
- SSAQS: store the raw value with `scale_max: 100`.
- Mobile check-in: accept 0-10 with `scale_max: 10`.
- For comparisons, calculate `normalized_0_100 = value / scale_max * 100`.
- For the V1 display state only, **high reported stress** is `normalized_0_100 >= 50`; otherwise it is low. This threshold does not replace the continuous ML target and must be sensitivity-tested in MW-201 because the sample has only 7 of 121 values at or above 50.

### Transparent physiological-load prototype

The integration prototype may use a versioned rule (`transparent_demo_v0`) before a validated model exists:

1. For each usable metric, calculate a z-score against the student's previous 7 valid observations; do not use future observations. Omit a metric when its baseline standard deviation is zero.
2. Reverse the direction of HRV RMSSD, sleep score, and deep-sleep minutes so that lower-than-usual recovery produces positive load.
3. Average the available signed z-scores and map them to a bounded 0-100 display score: `clip(50 + 25 * mean_signed_z, 0, 100)`.
4. Classify physiological load as high at `score >= 60`; otherwise classify it as low.
5. Require at least 7 previous observations and both core source families (HRV and sleep). Otherwise return `insufficient_data` and do not emit a mismatch state.

Steps and activity may appear as context or contributors but are not directional core-load inputs in this first rule. MW-202 may revise the feature calculation and Yifan's model may replace the rule, but both must preserve the response schema below. This score is an explanatory prototype index, not a medical measure.

## 4. Agreement and mismatch states

| Physiological load | Reported stress | API state | User-facing interpretation |
| --- | --- | --- | --- |
| Low | Low | `balanced` | Your body signals and check-in both look relatively calm today. |
| High | High | `aligned_high_load` | Your body signals and check-in both suggest a higher-load day. |
| High | Low | `high_body_low_perceived` | Your body appears under higher load even though you feel relatively calm. |
| Low | High | `low_body_high_perceived` | You report high stress even though your available body signals look closer to usual. |

`insufficient_data` is a quality state, not a fifth mismatch state. In that case, show: **"Not enough wearable data today. We need sufficient HRV and sleep information before comparing your body signals with your check-in."**

## 5. Stable API contract

V1 endpoints:

- `GET /health`
- `GET /profiles/{id}/today`
- `GET /profiles/{id}/timeline`
- `POST /checkins`

Example `GET /profiles/sample_student_01/today` response. It uses the supplied student's 2025-05-07 measurements with provisional raw-date alignment as an integration fixture; the load score is produced by the transparent prototype rule and is not a validated clinical result.

```json
{
  "participant_id": "sample_student_01",
  "date": "2025-05-07",
  "reported_stress": {
    "value": 18,
    "scale_max": 100,
    "normalized_0_100": 18,
    "category": "low",
    "source": "ssaqs"
  },
  "physiological_load": {
    "value": 85,
    "category": "high",
    "basis": "personal_baseline",
    "method_version": "transparent_demo_v0"
  },
  "mismatch": {
    "state": "high_body_low_perceived",
    "label": "Body under higher load"
  },
  "confidence": {
    "level": "moderate",
    "reason": "HRV and sleep were available with sufficient prior observations."
  },
  "contributors": [
    {
      "feature": "hrv_rmssd",
      "direction": "negative",
      "difference": -18.1,
      "unit": "percent_from_prior_mean",
      "description": "HRV was about 18% below your previous 7 valid observations."
    },
    {
      "feature": "deep_sleep",
      "direction": "negative",
      "difference": -35,
      "unit": "minutes_from_prior_mean",
      "description": "Deep sleep was about 35 minutes below your previous 7 valid observations."
    }
  ],
  "data_quality": {
    "state": "sufficient",
    "available_core_sources": ["hrv", "sleep"],
    "excluded_sources": ["oxygen", "fitbit_stress_score"]
  }
}
```

`POST /checkins` accepts:

```json
{
  "participant_id": "sample_student_01",
  "stress": {
    "value": 7,
    "scale_max": 10
  },
  "context": ["deadline", "group_work"]
}
```

Context tags are optional and may include `exam`, `deadline`, `presentation`, `group_work`, `exercise`, `caffeine`, `illness`, and `other`.

## 6. Core mobile flow

1. **Today** - two distinct cards: "How I feel" and "How my body is responding," followed by the plain-English state.
2. **Check-in** - 0-10 perceived-stress input plus optional context tags.
3. **Why?** - rank transparent deviations from the personal baseline; describe association or deviation, never causation.
4. **Trends** - show body load and reported stress together over time, with sleep and HRV available as detail.

The two dimensions must remain visually separate. A single combined "stress score" must not be the primary interface.

## 7. V1 success criteria

The first integrated prototype is successful when it can:

- trace one real SSAQS student-day from raw files to a participant-day record without using post-check-in information;
- produce personal-baseline features and either a physiological-load result or an honest `insufficient_data` state;
- preserve reported stress as a separate, continuous value;
- return the stable JSON contract through FastAPI;
- let a user complete a 0-10 check-in in React Native;
- display one of the four agreement/mismatch states and at least one non-causal contributor explanation;
- show a short historical trend; and
- avoid medical, diagnostic, or causal claims.

## 8. Out of scope for core V1

- Anxiety prediction or diagnosis
- WESAD integration, except as a stretch task
- SHAP as a dependency; feature deviations come first
- Model hyperparameter optimisation or a large algorithm comparison
- Production authentication, cloud deployment, or publication
- Treating Fitbit `STRESS_SCORE` as ground truth
- Using oxygen until its field meaning and quality are verified

## 9. Review sign-off

Reviewers should confirm the product target, terminology, data contract, API schema, four states, screens, and success criteria before checking their name.

- [ ] Magdalene
- [ ] Bang Kai
- [ ] Yifan
- [ ] Jacob
- [ ] Jean

After all five reviews, change `Status` to **Frozen for V1**. Subsequent changes require a pull request that names the affected downstream contract.

## Source basis

- `Actionables(2).pdf`, MW-001 and the Week 1-2 task board
- `Project Deliverables(3).pdf`, MindWatch V1 definition and one-page specification requirements
- Supplied one-student CSV samples: `daily_questions(1).csv`, `hrv(1).csv`, `sleep(1).csv`, `steps(1).csv`, `activity_level(1).csv`, `stress(1).csv`, and `oxygen(1).csv`
