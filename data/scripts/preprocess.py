import os
import pandas as pd
 
DATASET_PATH = "data/raw"
 
participants = []
 
for item in os.listdir(DATASET_PATH):
    path = os.path.join(DATASET_PATH, item)
    if os.path.isdir(path):
        participants.append(item)
 
print(participants)
 
all_daily_questions = []
 
for participant in participants:
    path = f"data/raw/{participant}/daily_questions.csv"
    if os.path.exists(path):
        df = pd.read_csv(path)
        df["participant_id"] = participant
        all_daily_questions.append(df)
 
daily_questions = pd.concat(
    all_daily_questions,
    ignore_index=True
)
 
print(daily_questions.head())
 
print(daily_questions.isnull().sum())
 
daily_questions = daily_questions.drop_duplicates()
 
print(daily_questions.columns)
 
daily_questions["date"] = pd.to_datetime(
    daily_questions["timeStampStop"],
    unit="s"
).dt.date

 
daily_questions.to_csv(
    "data/processed/cleaned_daily_questions.csv",
    index=False
)
 
print("Saved cleaned_daily_questions.csv")
