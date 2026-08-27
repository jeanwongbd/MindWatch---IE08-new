# SSAQS Dataset Overview

# Dataset Description
SSAQS is a multimodal dataset collected from university students during a single academic semester.

The dataset combines:
- Daily self-reported stress levels
- Daily self-reported anxiety levels
- Wearable sensor data collected using Fitbit Inspire 3 devices

Available measurements include:
- Heart Rate Variability (HRV)
- Sleep metrics
- Physical activity
- Step count
- Blood oxygen saturation (SpO2)
- Fitbit Stress Score

The dataset was collected from undergraduate students from two universities in Mexico. Self-reported stress and anxiety scores are recorded on a scale from 0 to 100.


## Dataset Structure
 
The SSAQS dataset contains:

- users-courses.csv
- course-details.csv
- Participant folders (one folder per participant)

Each participant folder contains wearable and questionnaire data collected throughout the study period.
Each participant folder may contain:

- activity_level.csv
- daily_questions.csv
- hrv.csv
- oxygen.csv
- sleep.csv
- steps.csv
- stress.csv

Note:
Some participants only contain daily_questions.csv because Fitbit data was not provided.

# Root-Level Files

## users-courses.csv

### Purpose

Maps each participant to their corresponding university and course. 【1-20a486】

### Columns

| Column | Description |
|----------|-------------|
| user_id | Unique participant identifier |
| university | University identifier |
| course | Course identifier |

---
## course-details.csv

### Purpose

Stores metadata about each course represented in the dataset. 【1-20a486】

### Columns

| Column | Description |
|----------|-------------|
| idCourse | Course identifier |
| undergraduate | Indicates undergraduate (1) or graduate (0) course |
| startDate | Course start date |
| endDate | Course end date |
| semester | Academic semester |
| Monday-Friday | Indicates teaching days |
| startTime | Course start time |
| endTime | Course end time |

---

# Participant-Level Files

Each participant folder may contain the following files. Some participants only contain questionnaire data because Fitbit data was not provided. 【1-20a486】

---

## daily_questions.csv

### Purpose

Contains daily self-reported stress and anxiety levels. This is the primary subjective mental health measurement in the dataset. 【1-20a486】

### Key Variables

| Column | Description |
|----------|-------------|
| timeStampScheduled | Scheduled questionnaire time |
| timeStampSent | Time questionnaire was sent |
| timeStampStart | Time participant started questionnaire |
| timeStampStop | Time participant completed questionnaire |
| stress | Daily self-reported stress level (0–100) |
| anxiety | Daily self-reported anxiety level (0–100) |

### Notes

- Questionnaires were typically delivered between 20:00 and 22:00.
- Stress and anxiety scores range from 0 to 100.
- This file will likely provide the target variable for MindWatch. 【1-20a486】

---

## hrv.csv

### Purpose

Contains heart rate variability measurements recorded during sleep. 【1-20a486】

### Key Variables

| Column | Description |
|----------|-------------|
| timestamp | Measurement timestamp |
| rmssd | Heart Rate Variability (RMSSD) |
| coverage | HRV measurement coverage |
| low_frequency | Low-frequency HRV component |
| high_frequency | High-frequency HRV component |

### Notes

- Data recorded approximately every 5 minutes.
- RMSSD is expected to be an important physiological feature for stress analysis. 【1-20a486】

---

## sleep.csv

### Purpose

Contains daily sleep-related measurements. 【1-20a486】

### Key Variables

| Column | Description |
|----------|-------------|
| timestamp | Sleep record date |
| overall_score | Fitbit Sleep Score |
| deep_sleep_n_minutes | Minutes spent in deep sleep |

### Notes

- Sleep score ranges from 0 to 100.
- Higher values generally indicate better sleep quality. 【1-20a486】

---

## steps.csv

### Purpose

Contains step count information. 【1-20a486】

### Key Variables

| Column | Description |
|----------|-------------|
| timestamp | Measurement timestamp |
| steps | Number of recorded steps |

### Notes

- Granularity is approximately one second.
- Daily aggregation will likely be required during preprocessing. 【1-20a486】
---

## stress.csv

### Purpose

Contains Fitbit-generated stress scores. 【1-20a486】

### Key Variables

| Column | Description |
|----------|-------------|
| DATE | Date of score calculation |
| UPDATED_AT | Most recent update timestamp |
| STRESS_SCORE | Fitbit stress score |
| CALCULATION_FAILED | Indicates failed calculation |

### Notes

- Values range from 1 to 100.
- Higher scores indicate fewer physiological signs of stress.
- Rows with CALCULATION_FAILED = TRUE should be excluded during preprocessing. 【1-20a486】

---

## activity_level.csv

### Purpose

Contains activity intensity levels throughout the day. 【1-20a486】

### Key Variables

| Column | Description |
|----------|-------------|
| timestamp | Activity timestamp |
| level | Activity intensity category |

### Possible Categories

- SEDENTARY
- LIGHTLY_ACTIVE
- MODERATELY_ACTIVE
- VERY_ACTIVE【1-20a486】

---

## oxygen.csv

### Purpose

Contains blood oxygen saturation (SpO₂) measurements captured during sleep. 【1-20a486】

### Key Variables

| Column | Description |
|----------|-------------|
| timestamp | Measurement timestamp |
| value | Estimated blood oxygen saturation |

### Notes

- Values outside expected physiological ranges may need further filtering during preprocessing. 【1-20a486】

---

# Data Alignment Goal

The objective of preprocessing is to transform the raw participant-level files into a single participant-day dataset suitable for downstream feature engineering and modelling.

Target structure:

| Column |
|----------|
| participant_id |
| date |
| self_report_stress |
| self_report_anxiety |
| hrv |
| sleep_score |
| deep_sleep_minutes |
| steps |
| fitbit_stress_score |

This aligned daily dataset will be used by subsequent feature engineering and modelling stages of the MindWatch pipeline.

---

# Planned Deliverables

The following outputs will be produced during the data preprocessing phase:

1. dataset_overview.md
2. data_dictionary.md
3. data_quality_report.md
4. daily_aligned_v0.csv
5. preprocessing scripts

These deliverables aim to make the SSAQS dataset understandable, reproducible, and usable for the rest of the MindWatch development team.
