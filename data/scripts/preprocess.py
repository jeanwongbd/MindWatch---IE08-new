# ============================================
# STEP 1: IMPORT LIBRARIES
# ============================================
 
import os
import pandas as pd
 
# ============================================
# STEP 2: FIND PARTICIPANTS
# ============================================
 
DATASET_PATH = "data/raw"
 
participants = []
 
for item in os.listdir(DATASET_PATH):
  path = os.path.join(DATASET_PATH, item)
 
if os.path.isdir(path):
  participants.append(item)
 
print(participants)
 
# ============================================
# STEP 3: LOOP THROUGH PARTICIPANTS
# ============================================
 
for participant in participants:
  daily_questions_path = (f"data/raw/SSAQS/{participant}/daily_questions.csv")
 
print(daily_questions_path)
 
# ============================================
# STEP 4 & 5: LOAD AND COMBINE DAILY QUESTIONS
# ============================================
 
all_daily_questions = []
 
for participant in participants:
  path = (f"data/raw/SSAQS/{participant}/daily_questions.csv")
 
if os.path.exists(path):
  df = pd.read_csv(path)
 
df["participant_id"] = participant
 
all_daily_questions.append(df)
 
daily_questions = pd.concat(all_daily_questions, ignore_index=True)
 
print(daily_questions.head())
 
# ============================================
# STEP 6: CLEAN
# ============================================
 
print(daily_questions.isnull().sum())
 
daily_questions = daily_questions.drop_duplicates()
 
# convert timestamp to date
 
daily_questions["date"] = pd.to_datetime(daily_questions["timeStampStop"], unit="s").dt.date
 
# ============================================
# STEP 7: SAVE
# ============================================
 
daily_questions.to_csv("data/processed/cleaned_daily_questions.csv", index=False)
 
print("Saved cleaned_daily_questions.csv")
