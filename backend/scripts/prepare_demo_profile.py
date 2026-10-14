"""Run from repository root: python -m backend.scripts.prepare_demo_profile."""
import hashlib
import json
from pathlib import Path
import numpy as np
import pandas as pd
import sklearn
import joblib
from ml.src.personalized_model import FEATURES, RAW_FEATURES, ALPHA, calibration_status, train_personalized_model, save_personal_model
ROOT = Path(__file__).resolve().parents[2]
LIMITATION = ('Provisional retrospective SSAQS daily replay. Source timing remains unresolved; some full-day measurements may occur after check-in. This is not a validated real-time prediction system.')
def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, allow_nan=False) + '\n')
def main():
    source = ROOT / 'data/processed/daily_model_v2.csv'
    data = pd.read_csv(source)
    data['date'] = pd.to_datetime(data['date'], errors='coerce').dt.normalize()
    person = data.loc[data.participant_id == 5].copy()
    if person.date.isna().any() or person.date.duplicated().any():
        raise ValueError('Participant 5 has invalid or duplicate dates; inspect source.')
    person = person.sort_values('date').reset_index(drop=True)
    for col in RAW_FEATURES + ['stress']:
        person[col] = pd.to_numeric(person[col], errors='coerce').replace([np.inf, -np.inf], np.nan)
    invalid_labels = int((person.stress.notna() & ~person.stress.between(0,100)).sum())
    split = 60
    while split < len(person):
        calibration = person.iloc[:split]
        status = calibration_status(calibration)
        if status['can_train']:
            try:
                trained = train_personalized_model(calibration)
                break
            except ValueError:
                pass
        split += 1
    else:
        raise ValueError('Participant 5 cannot support calibration and later replay.')
    replay = person.iloc[split:].loc[lambda d: d.stress.between(0,100)].head(10)
    if len(replay) < 5:
        raise ValueError('Need at least five later labelled replay dates.')
    records = []
    for _, row in replay.iterrows():
        prior = person.loc[person.date < row.date, 'avg_rmssd'].dropna().tolist()
        records.append({'participant_id':5,'date':row.date.strftime('%Y-%m-%d'),'stress':float(row.stress),'measurements':{c:None if pd.isna(row[c]) else float(row[c]) for c in RAW_FEATURES},'hrv_history':prior})
    save_personal_model(trained, ROOT / 'backend/models/demo_personal_model.joblib')
    write_json(ROOT / 'backend/demo/historical_profile.json', records)
    metadata = {'profile_id':'demo_p05','participant_id':5,'source_dataset':str(source.relative_to(ROOT)),'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'calibration_start':person.iloc[0].date.strftime('%Y-%m-%d'),'calibration_end':calibration.iloc[-1].date.strftime('%Y-%m-%d'),'calibration_rows':split,'valid_training_samples':trained['training_samples'],'invalid_stress_records':invalid_labels,'default_date':next(r['date'] for r in records if all(v is not None for v in r['measurements'].values())),'replay_dates':[r['date'] for r in records],'features':FEATURES,'stress_scale':[0,100],'model_type':'personalized_ridge_v2','ridge_alpha':ALPHA,'limitation':LIMITATION,'versions':{'pandas':pd.__version__,'numpy':np.__version__,'scikit-learn':sklearn.__version__,'joblib':joblib.__version__}}
    write_json(ROOT / 'backend/demo/profile_metadata.json', metadata)
    print(json.dumps(metadata, indent=2))
if __name__ == '__main__':
    main()
