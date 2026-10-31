import { describe,it,expect } from 'vitest';
import { selectSonarEvents } from '../src/utils/selectSonarEvents';
import type { SonarEvent } from '../src/types/threat';
const event=(i:number,severity:SonarEvent['severity'])=>({id:String(i),recordIndex:i,severity,maliciousProbability:.72} as SonarEvent);
describe('readable sonar sampling',()=>{
 it('caps a large observation set at 40 without losing rare severity levels',()=>{const events=[...Array.from({length:2000},(_,i)=>event(i,'low')),event(2000,'medium'),event(2001,'high'),event(2002,'critical')];const selected=selectSonarEvents(events);expect(selected).toHaveLength(40);expect(new Set(selected.map(e=>e.severity)).size).toBe(4);expect(new Set(selected.map(e=>e.id)).size).toBe(40);});
 it('uses an uneven stable sample and preserves the original probabilities',()=>{const events=(['low','medium','high','critical'] as const).flatMap((s,j)=>Array.from({length:20},(_,i)=>event(j*20+i,s)));const selected=selectSonarEvents(events);expect(new Set(selected.map(e=>e.severity)).size).toBe(4);expect(['low','medium','high','critical'].map(band=>selected.filter(e=>e.severity===band).length)).not.toEqual([10,10,10,10]);expect(selected.every(e=>events.includes(e)&&e.maliciousProbability===.72)).toBe(true);expect(selectSonarEvents(events)).toEqual(selected);});
 it('does not invent bands or records when fewer observations exist',()=>{const events=[event(1,'low'),event(2,'critical')];expect(selectSonarEvents(events)).toEqual(events);expect(selectSonarEvents(events,0)).toEqual([]);});
});
