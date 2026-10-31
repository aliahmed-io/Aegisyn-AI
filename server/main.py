"""Local flow analysis API. All observations originate from uploaded CSVs and inference."""
import io
import hashlib
from contextlib import contextmanager, asynccontextmanager
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

import joblib
import numpy as np
import pandas as pd
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from server.database import get_connection, init_db
from server.suricata import EveStore
from ml.train_models import ALL_FEATURES, FEATURE_NUMERIC

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get('AEGISYN_DATA_DIR', ROOT / 'data')).resolve()
DATA_DIR.mkdir(parents=True, exist_ok=True)
MODELS_DIR = ROOT / 'models'
REPORTS_DIR = ROOT / 'reports'
MODEL_NAMES = ('random_forest', 'logistic_regression', 'hist_gradient_boosting')
sensor = EveStore(get_connection, os.environ.get('AEGISYN_EVE_PATH', DATA_DIR / 'eve.json'))
@asynccontextmanager
async def lifespan(app):
    sensor.start()
    try: yield
    finally: sensor.stop()
app = FastAPI(title='Aegisyn AI', version='1.0', lifespan=lifespan)
@contextmanager
def database():
    conn = get_connection()
    try:
        with conn:
            yield conn
    finally:
        conn.close()

init_db()
with database() as conn:
    conn.execute('CREATE TABLE IF NOT EXISTS analysis_errors (job_id TEXT PRIMARY KEY, message TEXT NOT NULL)')


def now():
    return datetime.now(timezone.utc).isoformat()


def latest_job():
    with database() as conn:
        row = conn.execute("SELECT j.*, d.name AS dataset_name FROM analysis_jobs j JOIN datasets d ON d.id=j.dataset_id WHERE j.status='completed' AND j.id != 'job-unsw-default' ORDER BY j.completed_at DESC LIMIT 1").fetchone()
    return dict(row) if row else None


def active_id():
    job = latest_job()
    return job['id'] if job else ''


def model_for(name):
    if name not in MODEL_NAMES:
        raise HTTPException(400, 'Unknown model')
    path = MODELS_DIR / f'{name}.joblib'
    if not path.exists():
        raise HTTPException(503, 'Model artifact is unavailable. Train the model before analysis.')
    return joblib.load(path)


def severity(prob):
    return 'critical' if prob >= .85 else 'high' if prob >= .65 else 'medium' if prob >= .4 else 'low'


def read_flows(contents):
    try:
        df = pd.read_csv(io.BytesIO(contents))
    except Exception:
        raise HTTPException(400, 'The file must be a readable CSV.')
    df = df.rename(columns={a:b for a,b in {'smean':'smeansz','dmean':'dmeansz','srcip':'src_ip','dstip':'dst_ip','dport':'port'}.items() if a in df and b not in df})
    if len(df) == 0 or len(df) > 100000:
        raise HTTPException(400, 'Upload between 1 and 100,000 flow records.')
    missing = sorted(set(ALL_FEATURES) - set(df.columns))
    if missing:
        raise HTTPException(400, 'Missing required model features: ' + ', '.join(missing))
    for column in FEATURE_NUMERIC:
        values = pd.to_numeric(df[column], errors='coerce')
        if not np.isfinite(values).all() or (values < 0).any():
            raise HTTPException(400, f'{column} must contain finite, nonnegative numbers.')
        df[column] = values
    for column in ('proto', 'service', 'state'):
        if df[column].isna().any():
            raise HTTPException(400, f'{column} cannot contain missing values.')
        df[column] = df[column].astype(str)
    if 'port' in df and (pd.to_numeric(df['port'], errors='coerce').isna().any() or not pd.to_numeric(df['port']).between(0, 65535).all()):
        raise HTTPException(400, 'Ports must be between 0 and 65535.')
    if 'label' in df and not df['label'].isin([0, 1]).all():
        raise HTTPException(400, 'Optional label values must be 0 or 1.')
    df['proto'] = df['proto'].str.upper()
    return df


def dataset_json(r):
    return dict(isDemo=r['id'].startswith('demo-'), id=r['id'], name=r['name'], filename=r['filename'], uploadedAt=r['uploaded_at'], totalRecords=r['total_records'], benignCount=r['benign_count'], maliciousCount=r['malicious_count'], sizeBytes=r['size_bytes'], columns=json.loads(r['columns_json']), missingValues=json.loads(r['missing_values_json']), classBalanceRatio=r['class_balance_ratio'])


@app.get('/api/health')
def health():
    return {'service':'aegisyn-core','instanceId':os.environ.get('AEGISYN_INSTANCE_ID',hashlib.sha256(str(ROOT).lower().encode()).hexdigest()[:16]),'status': 'healthy', 'models_available': [n for n in MODEL_NAMES if (MODELS_DIR / f'{n}.joblib').exists()], 'requiredFeatures': ALL_FEATURES, 'modelProvenance': 'Bundled models were trained on generated demonstration data. Their performance is not validated on real network traffic.'}


@app.get('/api/datasets')
def datasets():
    with database() as conn:
        rows = conn.execute("SELECT * FROM datasets WHERE id != 'ds-unsw-nb15-default' ORDER BY uploaded_at DESC").fetchall()
    return [dataset_json(r) for r in rows]


@app.post('/api/datasets/upload')
async def upload(file: UploadFile = File(...)):
    if not (file.filename or '').lower().endswith('.csv'):
        raise HTTPException(400, 'Choose a .csv file.')
    contents = await file.read(25 * 1024 * 1024 + 1)
    if len(contents) > 25 * 1024 * 1024:
        raise HTTPException(413, 'The maximum upload size is 25 MB.')
    return store_dataset(contents, file.filename)


def store_dataset(contents, filename, demo=False):
    df = read_flows(contents)
    dataset_id = ('demo-' if demo else 'ds-') + uuid.uuid4().hex
    # Store only under a generated filename; never use the uploaded name as a path.
    stored_name = dataset_id + '.csv'
    (DATA_DIR / stored_name).write_bytes(contents)
    name = (filename or 'Flow data.csv').replace('\\', '/').split('/')[-1][:160]
    malicious = int(df['label'].sum()) if 'label' in df else 0
    with database() as conn:
        conn.execute('INSERT INTO datasets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', (dataset_id, name, stored_name, now(), len(df), len(df)-malicious if 'label' in df else 0, malicious, len(contents), json.dumps(list(df.columns)), json.dumps({c:int(df[c].isna().sum()) for c in df.columns}), malicious/len(df)))
        row = conn.execute('SELECT * FROM datasets WHERE id=?', (dataset_id,)).fetchone()
    return dataset_json(row)

@app.get('/api/datasets/demo')
def demo_info():
    path = ROOT / 'fixtures' / 'demo-flows.csv'
    return {'available':path.exists(), 'name':'Compact generated demo flows', 'totalRecords':len(pd.read_csv(path)) if path.exists() else 0}


@app.post('/api/datasets/demo')
def load_demo():
    path = ROOT / 'fixtures' / 'demo-flows.csv'
    if not path.exists():
        raise HTTPException(404,'The bundled demo CSV is not available. Upload your own dataset instead.')
    with database() as conn:
        existing=conn.execute("SELECT * FROM datasets WHERE id LIKE 'demo-%' AND name='Compact generated demo flows.csv' ORDER BY uploaded_at DESC LIMIT 1").fetchone()
    if existing:
        return dataset_json(existing)
    return store_dataset(path.read_bytes(), 'Compact generated demo flows.csv', demo=True)



class AnalysisRequest(BaseModel):
    datasetId: str
    modelName: Literal['random_forest', 'logistic_regression', 'hist_gradient_boosting'] = 'random_forest'


def infer(job_id, filename, model_name):
    try:
        df = read_flows((DATA_DIR / filename).read_bytes())
        model = model_for(model_name)
        probabilities = model.predict_proba(df[ALL_FEATURES])[:, list(model.classes_).index(1)]
        events, incidents = [], []
        for idx, row in df.iterrows():
            prob = float(probabilities[idx])
            malicious = prob >= .5
            band = severity(prob)
            record_id = f'{job_id}:{idx+1}'
            def text(key):
                value = row.get(key)
                return str(value) if pd.notna(value) else ''
            src, dst, proto = text('src_ip'), text('dst_ip'), str(row['proto']).upper()
            timestamp = text('timestamp') or None
            # Ground-truth attack_cat is not a classifier prediction.
            category = 'Malicious flow' if malicious else 'Benign'
            record_features = {key: float(row[key]) for key in FEATURE_NUMERIC}
            events.append((record_id, job_id, idx+1, timestamp, src, dst, proto if proto in ('TCP','UDP','ICMP') else 'OTHER', int(row.get('port',0)) if pd.notna(row.get('port',0)) else 0, text('service'), float(row['dur']), int(row['sbytes']), int(row['dbytes']), int(row['spkts']+row['dpkts']), int(malicious), prob, band, category, text('country'), (idx * 137.508) % 360, .2 + ((idx*31)%75)/100, prob**1.5, '[]'))
            if malicious:
                incidents.append(('INC-'+record_id, timestamp or '', category, category, src, dst, events[-1][6], events[-1][7], band, round(prob*100), prob, 'New', '', text('country'), None, json.dumps(record_features)))
        with database() as conn:
            conn.executemany('INSERT INTO sonar_events VALUES ('+','.join(['?']*22)+')', events)
            conn.executemany('INSERT INTO incidents VALUES ('+','.join(['?']*16)+')', incidents)
            conn.execute("UPDATE analysis_jobs SET status='completed', progress=1, processed_records=?, malicious_count=?, benign_count=?, completed_at=? WHERE id=?", (len(df), len(incidents), len(df)-len(incidents), now(), job_id))
    except Exception as exc:
        with database() as conn:
            conn.execute("UPDATE analysis_jobs SET status='failed',completed_at=? WHERE id=?", (now(),job_id))
            conn.execute('INSERT OR REPLACE INTO analysis_errors VALUES (?, ?)', (job_id, str(exc)[:500]))


@app.post('/api/analysis/start')
def start(req: AnalysisRequest, tasks: BackgroundTasks):
    with database() as conn:
        row = conn.execute("SELECT * FROM datasets WHERE id=? AND id != 'ds-unsw-nb15-default'", (req.datasetId,)).fetchone()
        if not row:
            raise HTTPException(404, 'Upload a dataset before starting analysis.')
        if not (MODELS_DIR / f'{req.modelName}.joblib').exists():
            raise HTTPException(503, 'Model is unavailable.')
        job_id = 'job-' + uuid.uuid4().hex
        conn.execute('INSERT INTO analysis_jobs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', (job_id,req.datasetId,req.modelName,'processing',0,row['total_records'],0,0,0,now(),None))
    tasks.add_task(infer, job_id, row['filename'], req.modelName)
    return {'jobId':job_id,'status':'processing'}


@app.get('/api/analysis/latest')
def latest():
    return latest_job()


@app.get('/api/analysis/{job_id}/status')
def status(job_id: str):
    with database() as conn:
        row = conn.execute('SELECT * FROM analysis_jobs WHERE id=?', (job_id,)).fetchone()
        error = conn.execute('SELECT message FROM analysis_errors WHERE job_id=?', (job_id,)).fetchone()
    if not row:
        raise HTTPException(404, 'Analysis not found.')
    return {'id':row['id'],'status':row['status'],'progress':row['progress'],'totalRecords':row['total_records'],'processedRecords':row['processed_records'],'error':error[0] if error else None}


@app.get('/api/sonar/{analysis_id}/events')
def sonar(analysis_id: str, limit: int = Query(400,ge=1,le=2000), offset: int = Query(0,ge=0), source: Literal['analysis','suricata']='analysis'):
    if source=='suricata': return sensor.events(limit,offset)
    if analysis_id == 'latest':
        analysis_id = active_id()
    if analysis_id == 'job-unsw-default':
        return []
    with database() as conn:
        rows = conn.execute('SELECT * FROM sonar_events WHERE analysis_id=? ORDER BY record_index LIMIT ? OFFSET ?', (analysis_id,limit,offset)).fetchall()
    keys = {'id':'id','recordIndex':'record_index','timestamp':'timestamp','sourceIp':'src_ip','destinationIp':'dst_ip','protocol':'protocol','port':'port','service':'service','flowDuration':'flow_duration','sourceBytes':'source_bytes','destinationBytes':'destination_bytes','totalPackets':'total_packets','maliciousProbability':'malicious_probability','severity':'severity','attackCategory':'attack_category','country':'country','angle':'angle','radius':'radius','elevation':'elevation'}
    return [{**{k:r[v] for k,v in keys.items()},'predictedMalicious':bool(r['predicted_malicious']),'contributingFeatures':[]} for r in rows]


@app.get('/api/incidents')
def incidents(source: Literal['analysis','suricata']='analysis'):
    if source=='suricata': return sensor.incidents()
    with database() as conn:
        rows = conn.execute("SELECT * FROM incidents WHERE id IN (SELECT 'INC-' || id FROM sonar_events WHERE analysis_id=?) ORDER BY probability DESC", (active_id(),)).fetchall()
    keys={'id':'id','timestamp':'timestamp','title':'title','attackType':'attack_type','sourceIp':'source_ip','destinationIp':'destination_ip','protocol':'protocol','port':'port','severity':'severity','riskScore':'risk_score','probability':'probability','status':'status','analystNotes':'analyst_notes','country':'country'}
    return [{**{k:r[v] for k,v in keys.items()},'features':json.loads(r['features_json'])} for r in rows]


class IncidentPatch(BaseModel):
    status: Literal['New','Investigating','Reviewed','Dismissed']
    analystNotes: str = Field(default='',max_length=10000)


@app.patch('/api/incidents/{incident_id}')
def patch_incident(incident_id: str, req: IncidentPatch):
    if incident_id.startswith('INC-SURI-'):
        with sensor.db() as conn:
            result=conn.execute("UPDATE sensor_events SET status=?,notes=? WHERE id=? AND event_type='alert'",(req.status,req.analystNotes,incident_id[4:]))
            if result.rowcount==0: raise HTTPException(404,'Sensor alert not found.')
        return {'id':incident_id,'status':req.status,'analystNotes':req.analystNotes}
    with database() as conn:
        result=conn.execute('UPDATE incidents SET status=?,analyst_notes=? WHERE id=?',(req.status,req.analystNotes,incident_id))
        if result.rowcount == 0:
            raise HTTPException(404,'Incident not found.')
    return {'id':incident_id,'status':req.status,'analystNotes':req.analystNotes}


@app.get('/api/analytics/overview')
def overview(source: Literal['analysis','suricata']='analysis'):
    if source=='suricata': return sensor.overview()
    job = latest_job()
    if not job:
        return dict(totalFlows=0,threatsDetected=0,threatPercentage=0,uniqueIps=0,activeAttacks=0,benignCount=0,suspiciousCount=0,maliciousCount=0,activeModelId='')
    with database() as conn:
        rows = conn.execute('SELECT * FROM sonar_events WHERE analysis_id=?',(job['id'],)).fetchall()
        ips = {r[k] for r in rows for k in ('src_ip','dst_ip') if r[k]}
        active = conn.execute("SELECT count(*) FROM incidents WHERE id IN (SELECT 'INC-' || id FROM sonar_events WHERE analysis_id=?) AND status IN ('New','Investigating')",(job['id'],)).fetchone()[0]
    return dict(isDemo=job['dataset_id'].startswith('demo-'),datasetName=job['dataset_name'],totalFlows=len(rows),threatsDetected=job['malicious_count'],threatPercentage=job['malicious_count']/max(len(rows),1)*100,uniqueIps=len(ips),activeAttacks=active,benignCount=job['benign_count'],suspiciousCount=sum(r['severity']=='medium' for r in rows),maliciousCount=job['malicious_count'],activeModelId=job['model_name'])


@app.get('/api/models/metrics')
def model_metrics(model_id: str='random_forest'):
    if model_id not in MODEL_NAMES:
        raise HTTPException(404,'Model not found.')
    path=MODELS_DIR/'metrics.json'
    data=json.loads(path.read_text()) if path.exists() else {}
    if model_id not in data:
        raise HTTPException(404,'Evaluation metrics unavailable.')
    return {**data[model_id], 'provenance':'Evaluation on generated demonstration data; not validated on real network traffic.'}


@app.get('/api/reports/predictions.csv')
def predictions_csv():
    job=latest_job()
    if not job:
        raise HTTPException(409,'Run an analysis before exporting predictions.')
    with database() as conn:
        df=pd.read_sql_query('SELECT record_index,timestamp,src_ip,dst_ip,protocol,port,predicted_malicious,malicious_probability,severity FROM sonar_events WHERE analysis_id=? ORDER BY record_index',conn,params=(job['id'],))
    # Prevent spreadsheet formulas in user-supplied textual fields.
    for col in df.select_dtypes(include=['object']).columns:
        df[col]=df[col].map(lambda v: "'"+v if isinstance(v,str) and v.startswith(('=','+','-','@','\t','\r','\n')) else v)
    return StreamingResponse(iter([df.to_csv(index=False)]),media_type='text/csv',headers={'Content-Disposition':f'attachment; filename="aegisyn-{job["id"]}.csv"'})


@app.get('/api/suricata/status')
def sensor_status():
    return sensor.status()


@app.post('/api/suricata/import')
async def sensor_import(file: UploadFile = File(...)):
    if Path(file.filename or '').suffix.lower() not in ('.json','.jsonl','.log'):
        raise HTTPException(400,'Choose a Suricata EVE .json, .jsonl, or .log file.')
    contents=await file.read(25*1024*1024+1)
    if len(contents)>25*1024*1024: raise HTTPException(413,'The maximum upload size is 25 MB.')
    try: return sensor.import_bytes(contents)
    except ValueError as exc: raise HTTPException(400,str(exc))


@app.get('/api/suricata/export.csv')
def sensor_export():
    with sensor.db() as conn:
        df=pd.read_sql_query('SELECT timestamp,event_type,source_ip,destination_ip,protocol,port,flow_id,signature,category,priority,severity,status,notes,ingested_at FROM sensor_events ORDER BY sequence',conn)
    for col in df.select_dtypes(include=['object']).columns:
        df[col]=df[col].map(lambda v: "'"+v if isinstance(v,str) and v.startswith(('=','+','-','@','\t','\r','\n')) else v)
    return StreamingResponse(iter([df.to_csv(index=False)]),media_type='text/csv',headers={'Content-Disposition':'attachment; filename="aegisyn-suricata.csv"'})
