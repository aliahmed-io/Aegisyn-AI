import { getDataSource } from './dataSource';
import { SonarEvent, IncidentRecord, ModelMetrics, ThreatOverviewMetrics, DatasetSummary } from '@/types/threat';
export const DEFAULT_OVERVIEW_METRICS: ThreatOverviewMetrics = {totalFlows:0,threatsDetected:0,threatPercentage:0,uniqueIps:0,activeAttacks:0,benignCount:0,suspiciousCount:0,maliciousCount:0,activeModelId:''};
export const DEFAULT_INCIDENTS: IncidentRecord[] = [];
export async function request<T>(path:string, options?:RequestInit):Promise<T> {
 const response=await fetch(`/api${path}`,{...options,cache:'no-store',signal:AbortSignal.timeout(30000)});
 if(!response.ok){let message='Analysis service unavailable. Start the backend and try again.';try{const data=await response.json();if(typeof data.detail==='string')message=data.detail;}catch{}throw new Error(message);}
 return response.json();
}
async function read<T>(path:string,empty:T):Promise<T>{try{return await request<T>(path);}catch(error){window.dispatchEvent(new CustomEvent('aegisyn-api-error',{detail:error instanceof Error?error.message:'Unable to load analysis data.'}));return empty;}}
export function fetchOverviewMetrics(){return read('/analytics/overview?source='+getDataSource(),DEFAULT_OVERVIEW_METRICS);}
export function fetchIncidents(){return read<IncidentRecord[]>('/incidents?source='+getDataSource(),[]);}
export function fetchSonarEvents(analysisId='latest'){return read<SonarEvent[]>(`/sonar/${encodeURIComponent(analysisId)}/events?limit=2000&source=${getDataSource()}`,[]);}
export function fetchModelMetrics(modelId='random_forest'){return read<ModelMetrics|null>(`/models/metrics?model_id=${encodeURIComponent(modelId)}`,null);}
export async function updateIncidentStatus(id:string,status:string,analystNotes=''){try{await request(`/incidents/${encodeURIComponent(id)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,analystNotes})});return true;}catch(error){window.dispatchEvent(new CustomEvent('aegisyn-api-error',{detail:error instanceof Error?error.message:'Unable to save incident.'}));return false;}}
export function fetchDatasets(){return request<DatasetSummary[]>('/datasets');}
