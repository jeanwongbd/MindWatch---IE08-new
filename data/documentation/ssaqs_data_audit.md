# SSAQS Data Audit
 
## Participant Information
 
Total Participants: TBD
 
Participants with Fitbit Data: TBD
 
Participants without Fitbit Data: TBD
 
---
 
## Files Identified
 
### Root Files
 
- users-courses.csv
- course-details.csv
 
### Participant Files
 
- daily_questions.csv
- hrv.csv
- sleep.csv
- steps.csv
- stress.csv
- activity_level.csv
- oxygen.csv
 
---
 
## Timestamp Formats
 
daily_questions.csv
- Unix timestamp
 
hrv.csv
- Timestamp format: TBD
 
sleep.csv
- Timestamp format: TBD
 
steps.csv
- Timestamp format: TBD
 
stress.csv
- Timestamp format: TBD
 
---
 
## Stress Variable
 
Source:
- daily_questions.csv
 
Range:
- 0-100
 
Question:
- "What was your average stress level during the day?"
 
Frequency:
- Once per day
 
---
 
## Fitbit Proprietary Variables
 
### STRESS_SCORE
 
Source:
- stress.csv
 
Range:
- 1-100
 
Notes:
- Higher score indicates fewer physiological signs of stress.
- Remove rows where CALCULATION_FAILED = TRUE.
 
---
 
## Missing Data
 
| Variable | Missing % |
|----------|----------|
| Stress | TBD |
| HRV | TBD |
| Sleep | TBD |
| Steps | TBD |
| Fitbit Stress | TBD |
 
---
 
## Day Overlap Check
 
Questions:
 
- Do wearable days overlap with questionnaire days?
- How many participant-days contain both stress and wearable data?
- Can data be aligned to participant × day?
 
Status:
- TBD
