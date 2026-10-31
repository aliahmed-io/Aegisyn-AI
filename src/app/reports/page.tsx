'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/navigation/Sidebar';
import { Header } from '@/components/navigation/Header';
import { request } from '@/services/api';
import { useDataSource,useSourceRefresh } from '@/services/dataSource';
import type { SensorStatus } from '@/components/navigation/SourceControl';
export default function ReportsPage(){
 const source=useDataSource();const [job,setJob]=useState<{dataset_name:string;model_name:string;total_records:number;malicious_count:number;completed_at:string}|null>(null);const [sensor,setSensor]=useState<SensorStatus|null>(null);const [error,setError]=useState('');
 useEffect(()=>{request<typeof job>('/analysis/latest').then(setJob).catch(e=>setError(e.message));request<SensorStatus>('/suricata/status').then(setSensor).catch(e=>setError(e.message));},[]);
 useSourceRefresh(()=>{void request<SensorStatus>('/suricata/status').then(setSensor).catch(e=>setError(e.message));});
 return <div className="app-shell"><Sidebar/><div className="app-content"><Header/><main id="main-content" tabIndex={-1} className="workspace-page"><h1>Export observations</h1><p>{source==='suricata'?'Download actual sensor records, their signatures, and investigation notes. No ML scores are assigned to these records.':'Download persisted model predictions for every record in the latest completed analysis.'}</p>{error&&<p role="alert" className="message-error">{error}</p>}
 {source==='suricata'?<section className="workspace-panel"><h2>Suricata EVE records</h2><p>{sensor?.records.toLocaleString()||'0'} stored sensor records. {sensor?.lastIngested?'Last ingested '+new Date(sensor.lastIngested).toLocaleString():''}</p>{sensor?.records?<a className="action-link" href="/api/suricata/export.csv" download>Download sensor records CSV</a>:<Link href="/datasets#suricata" className="action-link">Connect Suricata</Link>}</section>:<section className="workspace-panel">{job?<><h2>{job.dataset_name}</h2><dl className="report-details"><dt>Model</dt><dd>{job.model_name.replaceAll('_',' ')}</dd><dt>Analyzed records</dt><dd>{job.total_records.toLocaleString()}</dd><dt>Flagged records</dt><dd>{job.malicious_count.toLocaleString()}</dd><dt>Completed</dt><dd>{new Date(job.completed_at).toLocaleString()}</dd></dl><a className="action-link" href="/api/reports/predictions.csv" download>Download predictions CSV</a><p>Includes original network attributes where available, model probability, classification, and severity for each analyzed record.</p></>:<><h2>No completed analysis</h2><p>Upload a dataset and run inference before exporting predictions.</p><Link href="/datasets" className="action-link">Open datasets</Link></>}</section>}</main></div></div>;
}
