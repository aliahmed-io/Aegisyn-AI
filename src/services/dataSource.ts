'use client';
import { useEffect, useRef, useSyncExternalStore } from 'react';
export type DataSource='analysis'|'suricata';
export function getDataSource():DataSource {try{return localStorage.getItem('aegisyn-source')==='suricata'?'suricata':'analysis';}catch{return 'analysis';}}
export function chooseDataSource(source:DataSource){localStorage.setItem('aegisyn-source',source);window.dispatchEvent(new Event('aegisyn-source-change'));}
function subscribe(callback:()=>void){window.addEventListener('aegisyn-source-change',callback);return()=>window.removeEventListener('aegisyn-source-change',callback);}
export function useDataSource(){return useSyncExternalStore(subscribe,getDataSource,()=> 'analysis' as DataSource);}
export function useSourceRefresh(refresh:()=>void){const latest=useRef(refresh);useEffect(()=>{latest.current=refresh;},[refresh]);useEffect(()=>{const handler=()=>latest.current();window.addEventListener('aegisyn-source-change',handler);window.addEventListener('aegisyn-sensor-update',handler);return()=>{window.removeEventListener('aegisyn-source-change',handler);window.removeEventListener('aegisyn-sensor-update',handler);};},[]);}
