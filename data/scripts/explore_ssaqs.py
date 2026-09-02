import os
import pandas as pd
 
# ============================================
# CONFIGURATION
# ============================================
 
DATASET_PATH = "data/raw/SSAQS"
 
# ============================================
# HELPER FUNCTION
# ============================================
 
def inspect_file(file_path):
print("\n" + "=" * 60)
print(f"FILE: {os.path.basename(file_path)}")
print("=" * 60)
 
try:
df = pd.read_csv(file_path)
 
print("\nShape:")
print(df.shape)
 
print("\nColumns:")
print(df.columns.tolist())
 
print("\nData Types:")
print(df.dtypes)
 
print("\nMissing Values:")
print(df.isnull().sum())
 
print("\nFirst 5 Rows:")
print(df.head())
 
# Detect timestamp columns
timestamp_cols = [
col for col in df.columns
if "time" in col.lower()
or "timestamp" in col.lower()
or "date" in col.lower()
]
 
print("\nTimestamp Columns:")
if timestamp_cols:
for col in timestamp_cols:
print("-", col)
else:
print("None detected")
 
# Useful stats for numeric columns
numeric_cols = df.select_dtypes(include="number").columns
 
if len(numeric_cols) > 0:
print("\nNumeric Summary:")
print(df[numeric_cols].describe())
 
except Exception as e:
print(f"ERROR: {e}")
 
 
# ============================================
# START AUDIT
# ============================================
 
print("=" * 60)
print("SSAQS DATASET AUDIT")
print("=" * 60)
 
# ============================================
# ROOT FILES
# ============================================
 
root_files = [
f for f in os.listdir(DATASET_PATH)
if f.endswith(".csv")
]
 
print("\nRoot CSV Files:")
for f in root_files:
print("-", f)
 
# ============================================
# PARTICIPANT FOLDERS
# ============================================
 
participant_folders = []
 
for item in os.listdir(DATASET_PATH):
full_path = os.path.join(DATASET_PATH, item)
 
if os.path.isdir(full_path):
participant_folders.append(item)
 
print("\nTotal Participant Folders:",
len(participant_folders))
 
# ============================================
# WEARABLE PARTICIPANTS
# ============================================
 
participants_without_fitbit = []
 
for participant in participant_folders:
 
participant_path = os.path.join(
DATASET_PATH,
participant
)
 
csv_files = [
f for f in os.listdir(participant_path)
if f.endswith(".csv")
]
 
if csv_files == ["daily_questions.csv"]:
participants_without_fitbit.append(
participant
)
 
print("\nParticipants without Fitbit data:")
print(participants_without_fitbit)
 
print(
"\nParticipants with Fitbit data:",
len(participant_folders)
- len(participants_without_fitbit)
)
 
# ============================================
# AUDIT ROOT FILES
# ============================================
 
print("\n")
print("=" * 60)
print("ROOT FILE AUDIT")
print("=" * 60)
 
for file in root_files:
 
inspect_file(
os.path.join(DATASET_PATH, file)
)
 
# ============================================
# AUDIT PARTICIPANT 1
# ============================================
 
print("\n")
print("=" * 60)
print("PARTICIPANT SAMPLE AUDIT")
print("=" * 60)
 
if len(participant_folders) > 0:
 
sample_participant = sorted(
participant_folders,
key=lambda x: int(x)
)[0]
 
print(
"Using participant:",
sample_participant
)
 
participant_path = os.path.join(
DATASET_PATH,
sample_participant
)
 
participant_files = [
f for f in os.listdir(participant_path)
if f.endswith(".csv")
]
 
for file in participant_files:
 
inspect_file(
os.path.join(
participant_path,
file
)
)
 
# ============================================
# SPECIAL CHECKS
# ============================================
 
print("\n")
print("=" * 60)
print("SPECIAL CHECKS")
print("=" * 60)
 
daily_questions_file = os.path.join(
DATASET_PATH,
sample_participant,
"daily_questions.csv"
)
 
if os.path.exists(daily_questions_file):
 
daily = pd.read_csv(
daily_questions_file
)
 
if "stress" in daily.columns:
 
print("\nStress Range:")
print(
daily["stress"].min(),
"to",
daily["stress"].max()
)
 
if "anxiety" in daily.columns:
 
print("\nAnxiety Range:")
print(
daily["anxiety"].min(),
"to",
daily["anxiety"].max()
)
 
# Fitbit stress file
 
stress_file = os.path.join(
DATASET_PATH,
sample_participant,
"stress.csv"
)
 
if os.path.exists(stress_file):
 
fitbit_stress = pd.read_csv(
stress_file
)
 
print("\nFitbit Stress Columns:")
print(
fitbit_stress.columns.tolist()
)
 
calc_cols = [
col
for col in fitbit_stress.columns
if "failed" in col.lower()
]
 
if calc_cols:
 
col = calc_cols[0]
 
failed_count = (
fitbit_stress[col]
.astype(str)
.str.upper()
.eq("TRUE")
.sum()
)
 
print(
"\nCALCULATION_FAILED rows:",
failed_count
)
 
print("\n" + "=" * 60)
print("AUDIT COMPLETE")
print("=" * 60)
