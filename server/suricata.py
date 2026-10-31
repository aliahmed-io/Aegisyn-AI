"""Suricata EVE ingestion. Sensor findings never pass through the ML classifier."""
import hashlib
import json
import math
import ipaddress
import threading
from datetime import datetime, timezone
from pathlib import Path
from contextlib import contextmanager

MAX_LINE=1024*1024

def number(value,default=0):
    if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or value<0:
        return default
    return value

class EveStore:
    def __init__(self,connect,path):
        self.connect=connect
        self.path=Path(path).resolve()
        self.stop_event=threading.Event()
        self.thread=None
        self.error=None
        self.last_read=None
        self.invalid_lines=0

    @contextmanager
    def db(self):
        conn=self.connect()
        try:
            with conn: yield conn
        finally: conn.close()

    def initialize(self):
        with self.db() as db:
            db.execute('CREATE TABLE IF NOT EXISTS sensor_events (sequence INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,event_type TEXT NOT NULL,timestamp TEXT,source_ip TEXT,destination_ip TEXT,protocol TEXT,port INTEGER,flow_id TEXT,signature TEXT,category TEXT,priority INTEGER,severity TEXT,flow_duration REAL,source_bytes INTEGER,destination_bytes INTEGER,total_packets INTEGER,ingested_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT \'New\',notes TEXT NOT NULL DEFAULT \'\')')
            db.execute('CREATE TABLE IF NOT EXISTS sensor_cursors (path TEXT PRIMARY KEY,identity TEXT NOT NULL,offset INTEGER NOT NULL,prefix_length INTEGER NOT NULL,prefix_hash TEXT NOT NULL)')

    def normalize(self,record):
        if not isinstance(record,dict): raise ValueError('Each EVE record must be an object.')
        kind=record.get('event_type')
        if kind not in ('alert','flow'): return None
        flow=record.get('flow') or {}
        alert=record.get('alert') or {}
        if not isinstance(flow,dict) or not isinstance(alert,dict): raise ValueError('Invalid flow or alert object.')
        timestamp=record.get('timestamp')
        if timestamp is not None:
            if not isinstance(timestamp,str) or len(timestamp)>80: raise ValueError('Invalid timestamp.')
            try: datetime.fromisoformat(timestamp.replace('Z','+00:00'))
            except ValueError: raise ValueError('Invalid timestamp.')
        def text(value,max_length=500):
            if value is None:return ''
            if not isinstance(value,(str,int)):raise ValueError('Invalid textual field.')
            return str(value)[:max_length]
        for field in ('src_ip','dest_ip'):
            try: ipaddress.ip_address(record.get(field,''))
            except ValueError: raise ValueError(f'{field} must be a valid IP address.')
        if timestamp is None: raise ValueError('EVE timestamp is required.')
        if kind=='alert' and (not isinstance(alert.get('signature'),str) or not alert['signature'].strip()): raise ValueError('Alert signature is required.')
        priority=alert.get('severity') if kind=='alert' else None
        if priority is not None and (type(priority) is not int or priority not in (1,2,3,4)):
            raise ValueError('Alert severity must be a Suricata priority from 1 to 4.')
        if kind=='alert' and priority is None: raise ValueError('Alert severity is required.')
        if 'dest_port' in record and (type(record['dest_port']) is not int or not 0<=record['dest_port']<=65535): raise ValueError('Invalid destination port.')
        band={1:'high',2:'medium',3:'low',4:'low'}.get(priority,'low')
        duration=flow.get('age')
        if duration is None and flow.get('start') and flow.get('end'):
            try: duration=max(0,(datetime.fromisoformat(flow['end'].replace('Z','+00:00'))-datetime.fromisoformat(flow['start'].replace('Z','+00:00'))).total_seconds())
            except (ValueError,TypeError):duration=None
        canonical=json.dumps(record,sort_keys=True,separators=(',',':'),ensure_ascii=True,allow_nan=False)
        identifier='SURI-'+hashlib.sha256(canonical.encode()).hexdigest()[:32]
        proto=text(record.get('proto'),20).upper()
        return (identifier,kind,timestamp,text(record.get('src_ip'),80),text(record.get('dest_ip'),80),proto if proto in ('TCP','UDP','ICMP') else 'OTHER',int(number(record.get('dest_port'))),text(record.get('flow_id'),80),text(alert.get('signature')),text(alert.get('category')),priority,band,number(duration,None),number(flow.get('bytes_toserver'),None),number(flow.get('bytes_toclient'),None),(int(number(flow['pkts_toserver'])+number(flow['pkts_toclient'])) if 'pkts_toserver' in flow and 'pkts_toclient' in flow else None),datetime.now(timezone.utc).isoformat())

    def parse(self,lines,strict=False):
        rows=[];invalid=0;ignored=0
        for index,line in enumerate(lines,1):
            if not line.strip():continue
            try:
                if len(line)>MAX_LINE:raise ValueError('Record exceeds 1 MB.')
                record=json.loads(line,parse_constant=lambda _: (_ for _ in ()).throw(ValueError('Nonfinite JSON number.')))
                row=self.normalize(record)
                if row:rows.append(row)
                else:ignored+=1
            except (ValueError,TypeError,OverflowError,RecursionError) as exc:
                if strict:raise ValueError(f'Line {index}: {exc}')
                invalid+=1
        return rows,invalid,ignored

    def insert(self,db,rows):
        before=db.total_changes
        db.executemany('INSERT OR IGNORE INTO sensor_events (id,event_type,timestamp,source_ip,destination_ip,protocol,port,flow_id,signature,category,priority,severity,flow_duration,source_bytes,destination_bytes,total_packets,ingested_at) VALUES ('+','.join(['?']*17)+')',rows)
        return db.total_changes-before

    def import_bytes(self,contents):
        rows,invalid,ignored=self.parse(contents.splitlines(),strict=True)
        if not rows:raise ValueError('No supported EVE alert or flow records were found.')
        with self.db() as db:inserted=self.insert(db,rows)
        return {'inserted':inserted,'duplicates':len(rows)-inserted,'ignored':ignored,'invalid':invalid}

    def poll_once(self):
        if not self.path.is_file():
            self.error=None
            return 0
        stat=self.path.stat();identity=f'{stat.st_dev}:{stat.st_ino}'
        with self.db() as db:
            cursor=db.execute('SELECT * FROM sensor_cursors WHERE path=?',(str(self.path),)).fetchone()
            offset=cursor['offset'] if cursor else 0
            with self.path.open('rb') as file:
                if cursor:
                    prefix=file.read(cursor['prefix_length'])
                    if cursor['identity']!=identity or stat.st_size<offset or hashlib.sha256(prefix).hexdigest()!=cursor['prefix_hash']:offset=0
                file.seek(offset);block=file.read(MAX_LINE)
                boundary=block.rfind(b'\n')
                if boundary<0:
                    if len(block)>=MAX_LINE:
                        self.invalid_lines+=1
                        offset+=len(block)
                    else:return 0  # A partially written line is not an event yet.
                    rows=[]
                else:
                    complete=block[:boundary+1];offset+=boundary+1
                    rows,invalid,_=self.parse(complete.splitlines());self.invalid_lines+=invalid
                file.seek(0);prefix=file.read(min(128,offset))
            inserted=self.insert(db,rows)
            db.execute('INSERT OR REPLACE INTO sensor_cursors VALUES (?,?,?,?,?)',(str(self.path),identity,offset,len(prefix),hashlib.sha256(prefix).hexdigest()))
        self.last_read=datetime.now(timezone.utc).isoformat();self.error=None
        return inserted

    def start(self):
        self.initialize();self.stop_event.clear()
        def worker():
            while not self.stop_event.is_set():
                try:self.poll_once()
                except Exception as exc:self.error=f'Cannot read the configured EVE log: {type(exc).__name__}'
                self.stop_event.wait(1)
        self.thread=threading.Thread(target=worker,name='aegisyn-eve',daemon=True);self.thread.start()

    def stop(self):
        self.stop_event.set()
        if self.thread:self.thread.join(timeout=3)

    def status(self):
        with self.db() as db:
            row=db.execute('SELECT count(*) AS total,coalesce(max(sequence),0) AS revision,max(ingested_at) AS last_ingested FROM sensor_events').fetchone()
        return {'watchPath':str(self.path),'fileAvailable':self.path.is_file(),'watching':bool(self.thread and self.thread.is_alive() and self.path.is_file() and not self.error),'error':self.error,'lastRead':self.last_read,'lastIngested':row['last_ingested'],'records':row['total'],'revision':row['revision'],'invalidLines':self.invalid_lines}

    def events(self,limit=2000,offset=0):
        with self.db() as db:rows=db.execute('SELECT * FROM sensor_events ORDER BY sequence DESC LIMIT ? OFFSET ?',(limit,offset)).fetchall()
        return [{'id':r['id'],'recordIndex':r['sequence'],'timestamp':r['timestamp'],'sourceIp':r['source_ip'],'destinationIp':r['destination_ip'],'protocol':r['protocol'],'port':r['port'],'flowDuration':r['flow_duration'],'sourceBytes':r['source_bytes'],'destinationBytes':r['destination_bytes'],'totalPackets':r['total_packets'],'predictedMalicious':r['event_type']=='alert','maliciousProbability':None,'severity':r['severity'],'attackCategory':r['signature'] or ('Suricata alert' if r['event_type']=='alert' else 'Observed flow'),'country':'','angle':int(r['id'][-6:],16)%360,'radius':.5,'elevation':{'low':.12,'medium':.5,'high':.85}[r['severity']],'contributingFeatures':[],'detectionSource':'suricata','sensorPriority':r['priority'],'sensorCategory':r['category'],'flowId':r['flow_id'],'eventType':r['event_type']} for r in rows]

    def incidents(self):
        with self.db() as db:rows=db.execute("SELECT * FROM sensor_events WHERE event_type='alert' ORDER BY coalesce(priority,9),sequence DESC").fetchall()
        return [{'id':'INC-'+r['id'],'timestamp':r['timestamp'] or '','title':r['signature'] or 'Suricata alert','attackType':r['signature'] or 'Suricata alert','sourceIp':r['source_ip'],'destinationIp':r['destination_ip'],'protocol':r['protocol'],'port':r['port'],'severity':r['severity'],'riskScore':None,'probability':None,'status':r['status'],'analystNotes':r['notes'],'country':'','features':{'sensorPriority':r['priority'],'category':r['category'],'flowId':r['flow_id']},'detectionSource':'suricata'} for r in rows]

    def overview(self):
        with self.db() as db:
            row=db.execute("SELECT count(*) total,sum(event_type='alert') alerts,sum(event_type='alert' AND status IN ('New','Investigating')) active,sum(severity='medium') medium FROM sensor_events").fetchone()
            ips=db.execute("SELECT count(*) FROM (SELECT source_ip ip FROM sensor_events WHERE source_ip!='' UNION SELECT destination_ip ip FROM sensor_events WHERE destination_ip!='')").fetchone()[0]
        total=row['total'];alerts=row['alerts'] or 0
        return {'totalFlows':total,'threatsDetected':alerts,'threatPercentage':alerts/max(total,1)*100,'uniqueIps':ips,'activeAttacks':row['active'] or 0,'benignCount':total-alerts,'suspiciousCount':row['medium'] or 0,'maliciousCount':alerts,'activeModelId':'suricata','datasetName':'Suricata EVE records','isDemo':False,'dataSource':'suricata'}
