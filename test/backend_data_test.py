"""Regression checks using an isolated database, never the user's datasets."""
import asyncio
import io
import tempfile
import unittest
from pathlib import Path
import numpy as np
import pandas as pd
from fastapi import BackgroundTasks, HTTPException, UploadFile
import server.database as database
from server import main

class DataFlowTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=main.ROOT / 'test', prefix='backend-test-')
        self.old_db, self.old_data = database.DB_PATH, main.DATA_DIR
        database.DB_PATH = str(Path(self.temp.name) / 'test.db')
        main.DATA_DIR = Path(self.temp.name)
        database.init_db()
        with main.database() as conn:
            conn.execute('CREATE TABLE analysis_errors (job_id TEXT PRIMARY KEY,message TEXT NOT NULL)')
        self.frame = pd.read_csv(main.ROOT / 'data/unsw_nb15_sample.csv').head(12)

    def tearDown(self):
        database.DB_PATH, main.DATA_DIR = self.old_db, self.old_data
        self.assertTrue(Path(self.temp.name).resolve().is_relative_to(main.ROOT / 'test'))
        self.temp.cleanup()

    def upload(self, frame=None, filename='flows.csv'):
        content=(self.frame if frame is None else frame).to_csv(index=False).encode()
        return asyncio.run(main.upload(UploadFile(filename=filename,file=io.BytesIO(content))))

    def analyze(self, ds):
        tasks=BackgroundTasks()
        result=main.start(main.AnalysisRequest(datasetId=ds['id']),tasks)
        asyncio.run(tasks())
        return result['jobId']

    def test_empty_database_has_no_fake_statistics(self):
        self.assertEqual(main.overview()['totalFlows'],0)
        self.assertEqual(main.overview()['threatsDetected'],0)
        self.assertEqual(main.sonar('latest',limit=100,offset=0),[])
        with self.assertRaises(HTTPException): main.predictions_csv()

    def test_inference_matches_model_and_survives_reanalysis(self):
        ds=self.upload()
        job=self.analyze(ds)
        self.assertEqual(main.status(job)['status'],'completed')
        events=main.sonar('latest',limit=100,offset=0)
        df=main.read_flows(self.frame.to_csv(index=False).encode())
        model=main.model_for('random_forest')
        expected=model.predict_proba(df[main.ALL_FEATURES])[:,list(model.classes_).index(1)]
        np.testing.assert_allclose([e['maliciousProbability'] for e in events],expected)
        self.assertEqual(main.overview()['totalFlows'],len(df))
        second=self.analyze(ds)
        self.assertEqual(main.status(second)['status'],'completed')
        self.assertEqual(main.overview()['totalFlows'],len(df),'Latest analysis must not double-count prior jobs')
        self.assertNotEqual(main.sonar('latest',limit=100,offset=0)[0]['id'],events[0]['id'])

    def test_reject_missing_features_and_invalid_numbers(self):
        with self.assertRaises(HTTPException): self.upload(self.frame.drop(columns=['sbytes']))
        invalid=self.frame.copy();invalid['sbytes']=invalid['sbytes'].astype(float);invalid.loc[0,'sbytes']=float('inf')
        with self.assertRaises(HTTPException): self.upload(invalid)

    def test_upload_name_cannot_escape_data_directory(self):
        ds=self.upload(filename='../../escape.csv')
        self.assertEqual(ds['name'],'escape.csv')
        self.assertTrue((main.DATA_DIR/ds['filename']).exists())
        self.assertEqual(len(list(main.DATA_DIR.glob('*.csv'))),1)

    def test_labels_do_not_drive_predictions_or_invent_network_fields(self):
        frame=self.frame.drop(columns=[c for c in ['src_ip','dst_ip','timestamp','country','attack_cat'] if c in self.frame])
        ds=self.upload(frame);self.analyze(ds)
        events=main.sonar('latest',limit=100,offset=0)
        self.assertEqual(events[0]['sourceIp'],'')
        self.assertIsNone(events[0]['timestamp'])
        self.assertEqual(events[0]['country'],'')
        self.assertEqual(events[0]['contributingFeatures'],[])
        frame['label']=1-frame['label'];other=self.upload(frame);self.analyze(other)
        again=main.sonar('latest',limit=100,offset=0)
        self.assertEqual([e['maliciousProbability'] for e in events],[e['maliciousProbability'] for e in again])

    def test_demo_is_visible_explicit_and_runs_actual_inference(self):
        self.assertTrue(main.demo_info()['available'])
        self.assertEqual(main.overview()['totalFlows'],0)
        ds=main.load_demo()
        self.assertTrue(ds['isDemo'])
        self.assertEqual(main.load_demo()['id'],ds['id'])
        self.assertEqual(len(main.datasets()),1)
        job=self.analyze(ds)
        self.assertEqual(main.status(job)['status'],'completed')
        summary=main.overview()
        self.assertTrue(summary['isDemo'])
        self.assertEqual(summary['totalFlows'],64)
        self.assertEqual(summary['threatsDetected'],40)
        events=main.sonar('latest',limit=100,offset=0)
        self.assertEqual({level:sum(e['severity']==level for e in events) for level in ['low','medium','high','critical']},{'low':24,'medium':16,'high':12,'critical':12})
        self.assertEqual(summary['totalFlows'],ds['totalRecords'])

if __name__=='__main__': unittest.main()
