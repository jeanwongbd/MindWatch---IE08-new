# SSAQS Dataset Overview

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
