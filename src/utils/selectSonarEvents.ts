import type { SonarEvent } from '../types/threat';
import { hashString } from './sonarCoordinates';
/** Stable pseudo-random sample: retain rare bands without imposing equal quotas. */
export function selectSonarEvents(events:SonarEvent[],limit=40):SonarEvent[]{
 const cap=Number.isFinite(limit)?Math.max(0,Math.floor(limit)):40;
 const ranked=[...events].sort((a,b)=>(hashString(a.id+'-sample')>>>0)-(hashString(b.id+'-sample')>>>0)||a.id.localeCompare(b.id));
 const selected:SonarEvent[]=[];
 // One representative of each available band, followed by an unweighted sample.
 for(const severity of ['low','medium','high','critical']){const event=ranked.find(e=>e.severity===severity);if(event&&selected.length<cap)selected.push(event);}
 for(const event of ranked){if(selected.length>=cap)break;if(!selected.includes(event))selected.push(event);}
 return selected.sort((a,b)=>a.recordIndex-b.recordIndex);
}
