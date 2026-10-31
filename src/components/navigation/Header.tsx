 'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { SourceControl } from './SourceControl';
import { Search, Upload } from 'lucide-react';
export function Header({onSearch}:{onSearch?:(query:string)=>void}) {
 const input=useRef<HTMLInputElement>(null);
 const [error,setError]=useState('');
 useEffect(()=>{const failure=(e:Event)=>setError((e as CustomEvent<string>).detail);const shortcut=(e:KeyboardEvent)=>{if(onSearch&&(e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();input.current?.focus();}};window.addEventListener('aegisyn-api-error',failure);window.addEventListener('keydown',shortcut);return()=>{window.removeEventListener('aegisyn-api-error',failure);window.removeEventListener('keydown',shortcut);};},[onSearch]);
 return <><header className="app-header">{onSearch?<div className="header-search"><Search size={15}/><input ref={input} aria-label="Search observations" name="search" autoComplete="off" spellCheck={false} type="search" placeholder="Search IP, protocol, or attack type…" onChange={e=>onSearch(e.target.value)}/><kbd>Ctrl K</kbd></div>:<span aria-hidden="true"/>}<div className="header-actions"><SourceControl/><Link href="/datasets" className="header-upload" aria-label="Upload dataset"><Upload size={14} aria-hidden="true"/>Upload dataset</Link></div></header>{error&&<div className="api-error" role="alert">{error}<button onClick={()=>window.location.reload()}>Retry</button></div>}</>;
}
