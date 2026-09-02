# SSAQS Data Dictionary

| Variable | Source File | Unit | Frequency | Missing % | Use |
|-----------|-----------|------|-----------|-----------|------|
| Self-Reported Stress | daily_questions.csv | 0-100 | Daily | TBD | Target |
| Self-Reported Anxiety | daily_questions.csv | 0-100 | Daily | TBD | Context |
| HRV (RMSSD) | hrv.csv | ms | 5-minute intervals | TBD | Yes |
| Sleep Score | sleep.csv | 0-100 | Daily | TBD | Yes |
| Deep Sleep Duration | sleep.csv | minutes | Daily | TBD | Yes |
| Steps | steps.csv | count | Second-level records | TBD | Yes |
| Fitbit Stress Score | stress.csv | 1-100 | Daily | TBD | Baseline Competitor |
| Activity Level | activity_level.csv | category | ~1 minute | TBD | Optional |
| Blood Oxygen Saturation (SpO₂) | oxygen.csv | % | During sleep | TBD | Optional |

---

## Notes

### Target Variable

Self-Reported Stress (`daily_questions.csv`)
- Range: 0–100
- Collected once daily
- Questionnaire typically sent between 20:00–22:00

### Primary Wearable Features

- HRV (RMSSD)
- Sleep Score
- Deep Sleep Duration
- Steps
- Fitbit Stress Score

### Potentially Optional Features

- Activity Level
- Oxygen Saturation

These variables may be evaluated during exploratory analysis before inclusion in the final model.
