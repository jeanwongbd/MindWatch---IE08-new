import os

DATASET_PATH = "data/raw/SSAQS"

participants = []

for item in os.listdir(DATASET_PATH):

path = os.path.join(DATASET_PATH, item)

if os.path.isdir(path):
participants.append(item)

print(participants)
