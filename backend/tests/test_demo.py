"""Focused acceptance checks: python -m unittest backend.tests.test_demo -v."""
import copy
import hashlib
import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient
from backend.main import create_app, comparison, BASE
from ml.src.personalized_model import estimate_stress

class Acceptance(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.state = Path(self.tmp.name)/'checkins.json'
        self.app = create_app(state_path=self.state)
        self.client = TestClient(self.app)
        self.demo = self.app.state.demo
        self.date = self.demo.metadata['default_date']
    def tearDown(self):
        self.tmp.cleanup()
    def test_four_states_and_boundaries(self):
        for estimate, stress, expected in [(25,20,'aligned_low'),(75,80,'aligned_high'),(75,20,'estimate_high_reported_low'),(25,80,'estimate_low_reported_high'),(50,50,'aligned_high'),(49.9,50,'estimate_low_reported_high')]:
            self.assertEqual(comparison(estimate, stress)['state'],expected)
        self.assertIsNone(comparison(None,40)['state'])
    def test_provenance_and_separation(self):
        self.assertTrue(self.client.get('/health').json()['model_ready'])
        self.assertEqual(self.demo.metadata['valid_training_samples'],53)
        for date, r in self.demo.records.items():
            self.assertGreater(date,self.demo.metadata['calibration_end'])
            response = self.client.get('/today',params={'date':date}).json()
            m=r['measurements']
            if any(v is not None for v in m.values()):
                expected=estimate_stress(self.demo.trained,**m,hrv_history=r['hrv_history'])
                self.assertAlmostEqual(response['wearable_estimate']['value'],expected)
            self.assertEqual(response['measurements']['avg_rmssd'],m['avg_rmssd'])
        self.assertEqual(self.client.get('/today?date=1900-01-01').status_code,404)
    def test_checkin_persistence_reset_and_stable_estimate(self):
        model_path=BASE/'models/demo_personal_model.joblib'
        before_hash=hashlib.sha256(model_path.read_bytes()).hexdigest()
        before=self.client.get('/today',params={'date':self.date}).json()
        result=self.client.post('/checkin',json={'date':self.date,'stress':8,'context_tags':['Study']})
        self.assertEqual(result.status_code,200)
        after=result.json()['record']
        self.assertEqual(after['reported_stress']['normalized_0_100'],80)
        self.assertEqual(after['wearable_estimate'],before['wearable_estimate'])
        self.assertEqual(after['original_reported_stress'],before['original_reported_stress'])
        self.assertEqual(next(r for r in self.client.get('/trends').json()['records'] if r['date']==self.date),after)
        restarted=TestClient(create_app(state_path=self.state))
        self.assertEqual(restarted.get('/today',params={'date':self.date}).json(),after)
        self.assertEqual(restarted.post('/demo/reset').status_code,200)
        self.assertEqual(restarted.get('/today',params={'date':self.date}).json(),before)
        self.assertEqual(hashlib.sha256(model_path.read_bytes()).hexdigest(),before_hash)
    def test_scenarios_and_isolation(self):
        original=self.client.get('/trends').json()
        expected=['aligned_low','aligned_high','estimate_high_reported_low','estimate_low_reported_high',None]
        for scenario,state in zip(self.demo.scenarios,expected):
            r=self.client.get('/today',params={'mode':'synthetic_scenario','scenario':scenario}).json()
            self.assertEqual(r['comparison']['state'],state)
            self.assertEqual(r['wearable_estimate']['method'],'synthetic_fixture')
            self.assertEqual(r['source_label'],'Synthetic scenario')
        self.assertEqual(self.client.get('/trends').json(),original)
    def test_invalid_inputs(self):
        for value in [-1,11,2.5,'5',True,None]:
            self.assertEqual(self.client.post('/checkin',json={'date':self.date,'stress':value}).status_code,422)
    def test_missing_model_and_missing_measurements(self):
        client=TestClient(create_app(model_path=Path(self.tmp.name)/'absent.joblib',state_path=self.state))
        self.assertFalse(client.get('/health').json()['model_ready'])
        r=client.get('/today',params={'date':self.date}).json()
        self.assertEqual(r['wearable_estimate']['status'],'model_unavailable')
        self.assertIsNone(r['wearable_estimate']['value'])
        self.assertIsNone(r['comparison']['state'])
        saved=copy.deepcopy(self.demo.records[self.date])
        self.demo.records[self.date]['measurements']={k:None for k in saved['measurements']}
        r=self.client.get('/today',params={'date':self.date}).json()
        self.assertEqual(r['wearable_estimate']['status'],'insufficient_data')
        self.assertIsNone(r['wearable_estimate']['value'])
    def test_imputation_is_visible(self):
        r=self.demo.records[self.date]
        r['measurements']['overall_score']=None
        result=self.client.get('/today',params={'date':self.date}).json()
        self.assertEqual(result['wearable_estimate']['status'],'ready')
        self.assertIsNone(result['measurements']['overall_score'])
        self.assertIn('overall_score',result['imputed_features'])
    def test_corrupt_saved_state(self):
        self.state.write_text('invalid json')
        client=TestClient(create_app(state_path=self.state))
        self.assertFalse(client.get('/health').json()['state_ready'])
        self.assertEqual(client.post('/checkin',json={'date':self.date,'stress':4}).status_code,503)
        self.assertEqual(client.post('/demo/reset').status_code,200)
        self.assertTrue(client.get('/health').json()['state_ready'])
if __name__=='__main__':
    unittest.main()
