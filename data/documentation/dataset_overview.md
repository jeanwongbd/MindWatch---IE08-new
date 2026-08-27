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

## users-courses.csv

Purpose:
Maps each participant to their university and course.

Columns:
- userid
- unversity
- course
