"""Single-process local historical replay and isolated synthetic fixtures."""
import json
import logging
import math
import os
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from ml.src.personalized_model import load_personal_model, estimate_stress, MIN_HRV_HISTORY

BASE = Path(__file__).resolve().parent
LOGGER = logging.getLogger(__name__)


def comparison(estimate, reported):
    if estimate is None or reported is None:
        return {'state': None, 'label': 'Not enough data', 'description': 'A comparison needs both values.'}
    if estimate < 50 and reported < 50:
        state, label, description = 'aligned_low', 'Both below threshold', 'Both values are below the demo threshold.'
    elif estimate >= 50 and reported >= 50:
        state, label, description = 'aligned_high', 'Both at or above threshold', 'Both values are at or above the demo threshold.'
    elif estimate >= 50:
        state, label, description = 'estimate_high_reported_low', 'Estimate higher, reported lower', 'Your reported stress is lower than the wearable-based estimate.'
    else:
        state, label, description = 'estimate_low_reported_high', 'Reported higher, estimate lower', 'Your reported stress is higher than the wearable-based estimate.'
    return {'state': state, 'label': label, 'description': description}


class Demo:
    def __init__(self, model_path=None, state_path=None):
        self.metadata = json.loads((BASE / 'demo/profile_metadata.json').read_text())
        self.records = {r['date']: r for r in json.loads((BASE / 'demo/historical_profile.json').read_text())}
        self.scenarios = {r['id']: r for r in json.loads((BASE / 'demo/demo_scenarios.json').read_text())}
        self.profile = self.metadata['profile_id']
        self.state_path = Path(state_path or os.getenv('MINDWATCH_STATE_PATH', str(BASE / 'runtime/demo_checkins.json')))
        self.lock = threading.Lock()
        self.overrides = {}
        self.state_error = None
        if self.state_path.exists():
            try:
                stored = json.loads(self.state_path.read_text())
                if not isinstance(stored, dict):
                    raise ValueError('Expected object')
                for key, item in stored.items():
                    if not isinstance(item, dict) or item.get('profile_id') != self.profile or item.get('date') not in self.records or type(item.get('stress')) is not int or not 0 <= item['stress'] <= 10 or key != self.key(item['date']):
                        raise ValueError('Invalid saved check-in')
                self.overrides = stored
            except (ValueError, OSError) as exc:
                self.state_error = str(exc)
        self.trained = None
        self.model_error = None
        try:
            self.trained = load_personal_model(Path(model_path or os.getenv('MINDWATCH_MODEL_PATH', str(BASE / 'models/demo_personal_model.joblib'))))
            # Confirm that the saved artifact is fitted, rather than a template.
            from sklearn.utils.validation import check_is_fitted
            check_is_fitted(self.trained['model'][-1])
        except Exception as exc:
            self.model_error = str(exc)
            LOGGER.warning('Demo model unavailable: %s', exc)

    def key(self, date):
        return f'{self.profile}/{date}'

    def persist(self, updated):
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        fd, name = tempfile.mkstemp(dir=self.state_path.parent, prefix='checkins-', suffix='.tmp')
        try:
            with os.fdopen(fd, 'w') as stream:
                json.dump(updated, stream, indent=2, allow_nan=False)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(name, self.state_path)
        finally:
            if os.path.exists(name):
                os.unlink(name)
        self.overrides = updated
        self.state_error = None

    def response(self, mode='historical_replay', date=None, scenario=None):
        if mode == 'synthetic_scenario':
            if scenario not in self.scenarios:
                raise HTTPException(404, 'Unknown synthetic scenario')
            item = self.scenarios[scenario]
            value, reported = item['estimate'], item['stress']
            return {'user_id': self.profile, 'date': None, 'mode': mode, 'scenario_id': scenario,
                    'source_label': 'Synthetic scenario', 'scenario_label': item['label'],
                    'reported_stress': {'value': reported, 'scale_max':100, 'normalized_0_100':reported, 'source':'synthetic_fixture'},
                    'wearable_estimate': {'value':value, 'scale_max':100, 'status':'ready' if value is not None else 'insufficient_data', 'method':'synthetic_fixture'},
                    'comparison':comparison(value, reported), 'measurements':{}, 'imputed_features':[],
                    'limitation':'Fixed interface fixtures. These values were not generated by Ridge.'}
        date = date or self.metadata['default_date']
        if date not in self.records:
            raise HTTPException(404, 'Unknown replay date')
        record = self.records[date]
        inputs = dict(record['measurements'])
        history = record['hrv_history']
        deviation = inputs['avg_rmssd'] - sum(history)/len(history) if len(history) >= MIN_HRV_HISTORY and inputs['avg_rmssd'] is not None else None
        missing = [k for k,v in {**inputs, 'avg_rmssd_dev':deviation}.items() if v is None]
        status, value = 'ready', None
        if self.trained is None:
            status = 'model_unavailable'
        elif all(v is None for v in inputs.values()):
            status = 'insufficient_data'
        else:
            try:
                value = estimate_stress(self.trained, **inputs, hrv_history=history)
                if not math.isfinite(value):
                    raise ValueError('Non-finite prediction')
            except Exception:
                LOGGER.exception('Historical inference failed for %s', date)
                value, status = None, 'inference_error'
        with self.lock:
            override = self.overrides.get(self.key(date))
        reported = {'value': record['stress'], 'scale_max':100, 'normalized_0_100':record['stress'], 'source':'historical_ssaqs'}
        if override:
            reported = {'value':override['stress'], 'scale_max':10, 'normalized_0_100':override['stress']*10, 'source':'demo_checkin', 'context_tags':override.get('context_tags',[]), 'submitted_at':override['submitted_at']}
        return {'user_id':self.profile, 'date':date, 'mode':mode, 'source_label':'Historical SSAQS replay',
                'reported_stress':reported, 'original_reported_stress':record['stress'],
                'wearable_estimate':{'value':value, 'scale_max':100, 'status':status, 'method':'personalized_ridge_v2'},
                'comparison':comparison(value, reported['normalized_0_100']),
                'measurements':{**inputs, 'avg_rmssd_dev':deviation},
                'imputed_features':missing if status == 'ready' else [], 'limitation':self.metadata['limitation']}


class CheckIn(BaseModel):
    date: str
    stress: int = Field(strict=True, ge=0, le=10)
    context_tags: list[str] = Field(default_factory=list, max_length=10)


def create_app(model_path=None, state_path=None):
    demo = Demo(model_path, state_path)
    app = FastAPI(title='MindWatch local demo')
    app.state.demo = demo
    app.add_middleware(CORSMiddleware, allow_origins=['http://localhost:8443','http://127.0.0.1:8443','http://localhost:5173','http://127.0.0.1:5173'], allow_methods=['GET','POST'], allow_headers=['Content-Type'])

    @app.get('/health')
    def health():
        return {'status':'online','model_ready':demo.trained is not None,'model_status':'ready' if demo.trained is not None else 'model_unavailable','state_ready':demo.state_error is None,'state_error':demo.state_error}

    @app.get('/demo/config')
    def config():
        return {**demo.metadata, 'scenarios':[{'id':r['id'],'label':r['label']} for r in demo.scenarios.values()]}

    @app.get('/today')
    def today(mode: Literal['historical_replay','synthetic_scenario']='historical_replay', date: str|None=None, scenario: str|None=None):
        return demo.response(mode, date, scenario)

    @app.get('/trends')
    def trends():
        return {'mode':'historical_replay','source_label':'Historical SSAQS replay','records':[demo.response(date=date) for date in demo.metadata['replay_dates']]}

    @app.post('/checkin')
    def checkin(item: CheckIn):
        if item.date not in demo.records:
            raise HTTPException(404, 'Unknown replay date')
        if any(len(tag)>80 for tag in item.context_tags):
            raise HTTPException(422, 'Context tag too long')
        with demo.lock:
            if demo.state_error:
                raise HTTPException(503, 'Saved state is unreadable; use Reset demo to restore it.')
            updated = {**demo.overrides, demo.key(item.date):{'profile_id':demo.profile, **item.model_dump(), 'submitted_at':datetime.now(timezone.utc).isoformat()}}
            try:
                demo.persist(updated)
            except OSError:
                raise HTTPException(503, 'Could not save check-in')
        return {'saved':True, 'record':demo.response(date=item.date)}

    @app.post('/demo/reset')
    def reset():
        with demo.lock:
            try:
                demo.persist({})
            except OSError:
                raise HTTPException(503, 'Could not reset demo')
        return {'reset':True,'default_date':demo.metadata['default_date']}

    return app


app = create_app()
