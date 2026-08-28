import pandas as pd
 
users = pd.read_csv("users-courses.csv");
 
print(users.head());
print(users.info());
print(users.shape);

df = pd.read_csv("daily_questions.csv");
 
print(df.isnull().sum());

Missing Values
 
stress: 0;
anxiety: 3;
timestamp: 0;

print(df["stress"].min());
print(df["stress"].max());

Stress Range:
0-100

print(df.columns);
print(df.head());

