import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from server.suricata import EveStore
ROOT=Path(__file__).resolve().parent.parent

class EveTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(dir=ROOT/'test',prefix='sensor-test-')
        self.root=Path(self.temp.name)
        def connect():
            db=sqlite3.connect(self.root/'sensor.db');db.row_factory=sqlite3.Row;return db
        self.connect=connect
        self.store=EveStore(connect,self.root/'eve.json');self.store.initialize()
    def tearDown(self):
        self.store.stop();assert self.root.resolve().is_relative_to(ROOT/'test');self.temp.cleanup()
    def event(self,kind='alert',priority=1,stamp='2026-10-31T12:00:00Z'):
        record={'timestamp':stamp,'event_type':kind,'flow_id':812345,'src_ip':'192.0.2.10','dest_ip':'198.51.100.5','dest_port':443,'proto':'TCP','flow':{'bytes_toserver':100,'bytes_toclient':200,'pkts_toserver':2,'pkts_toclient':3,'age':4}}
        if kind=='alert':record['alert']={'signature':'Test fixture alert','category':'Fixture activity','severity':priority}
        return json.dumps(record).encode()
    def test_actual_fields_priorities_and_absent_ml_scores(self):
        content=b'\n'.join([self.event(priority=p,stamp=f'2026-10-31T12:00:0{p}Z') for p in (1,2,3)]+[self.event('flow')])
        self.assertEqual(self.store.import_bytes(content)['inserted'],4)
        events=self.store.events();self.assertTrue(all(e['maliciousProbability'] is None for e in events))
        self.assertEqual({e['sensorPriority']:e['severity'] for e in events if e['eventType']=='alert'},{1:'high',2:'medium',3:'low'})
        self.assertEqual(events[0]['totalPackets'],5)
        self.assertEqual(self.store.overview()['threatsDetected'],3)
    def test_duplicate_import_does_not_duplicate_incidents(self):
        self.store.import_bytes(self.event());again=self.store.import_bytes(self.event())
        self.assertEqual(again['duplicates'],1);self.assertEqual(len(self.store.incidents()),1)
        self.assertIsNone(self.store.incidents()[0]['probability'])
    def test_partial_lines_and_cursor_survive_restart(self):
        line=self.event();self.store.path.write_bytes(line[:30]);self.store.poll_once();self.assertEqual(self.store.status()['records'],0)
        with self.store.path.open('ab') as file:file.write(line[30:]+b'\n')
        self.assertEqual(self.store.poll_once(),1)
        restarted=EveStore(self.connect,self.store.path);restarted.initialize();self.assertEqual(restarted.poll_once(),0)
        with self.store.path.open('ab') as file:file.write(self.event('flow')+b'\n')
        self.assertEqual(restarted.poll_once(),1)
    def test_rotation_and_truncation_do_not_lose_new_records(self):
        self.store.path.write_bytes(self.event()+b'\n');self.store.poll_once()
        self.store.path.rename(self.root/'old-eve.json')
        self.store.path.write_bytes(self.event('flow')+b'\n');self.assertEqual(self.store.poll_once(),1)
        self.store.path.write_bytes(self.event(priority=2)+b'\n');self.assertEqual(self.store.poll_once(),1)
        self.assertEqual(self.store.status()['records'],3)
    def test_invalid_upload_is_atomic_and_watcher_recovers(self):
        with self.assertRaises(ValueError):self.store.import_bytes(self.event()+b'\nnot-json')
        self.assertEqual(self.store.status()['records'],0)
        self.store.path.write_bytes(b'not-json\n'+self.event()+b'\n');self.assertEqual(self.store.poll_once(),1)
        self.assertEqual(self.store.status()['invalidLines'],1)
    def test_waiting_for_missing_file_is_not_connected(self):
        self.assertFalse(self.store.status()['fileAvailable']);self.assertFalse(self.store.status()['watching'])

if __name__=='__main__':unittest.main()
