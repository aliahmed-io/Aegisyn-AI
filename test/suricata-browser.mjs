import { chromium, request } from 'playwright';
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import assert from 'node:assert/strict';
import AxeBuilder from '@axe-core/playwright';
const runtime=JSON.parse(await readFile('.aegisyn/runtime.json','utf8'));
const base=`http://127.0.0.1:${runtime.webPort}`;
const api=await request.newContext({baseURL:'http://127.0.0.1:18153'});
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await context.route('**/api/**',async route=>{try{const req=route.request();const url=new URL(req.url());const response=await api.fetch(url.pathname+url.search,{method:req.method(),headers:req.headers(),data:req.postDataBuffer()??undefined});await route.fulfill({response});}catch{await route.abort().catch(()=>{});}});
const event=(kind,priority,second)=>({timestamp:`2026-10-31T12:00:${String(second).padStart(2,'0')}Z`,event_type:kind,flow_id:812345+second,src_ip:'192.0.2.10',dest_ip:'198.51.100.5',dest_port:443,proto:'TCP',...(kind==='alert'?{alert:{signature:'Browser fixture alert '+second,category:'Test fixture',severity:priority}}:{})});
const count=async n=>{await page.waitForFunction(n=>document.querySelector('.metric-card strong')?.textContent===String(n),n,{timeout:20000});};
try{
 await page.goto(base+'/datasets');
 await page.getByLabel('Import Suricata EVE log').setInputFiles({name:'eve.json',mimeType:'application/json',buffer:Buffer.from([event('alert',1,1),event('flow',null,2)].map(JSON.stringify).join('\n'))});
 await page.getByText(/Imported 2 records/).waitFor();assert.equal(await page.getByLabel('Data source').inputValue(),'suricata');
 await page.goto(base+'/overview');await count(2);assert.equal(await page.locator('.metric-card strong').nth(1).textContent(),'1');
 const status=await (await api.get('/api/suricata/status')).json();const path=resolve(status.watchPath);assert.ok(path.startsWith(resolve('test')+sep+'browser-backend-'));
 await writeFile(path,JSON.stringify(event('alert',2,3))+'\n');await count(3);
 await appendFile(path,JSON.stringify(event('alert',2,3))+'\n');await page.waitForTimeout(2500);await count(3);
 await writeFile(path,JSON.stringify(event('alert',3,4))+'\n');await count(4);
 const events=await (await api.get('/api/sonar/latest/events?source=suricata')).json();assert.ok(events.every(e=>e.maliciousProbability===null));assert.deepEqual(new Set(events.filter(e=>e.eventType==='alert').map(e=>e.severity)),new Set(['low','medium','high']));assert.equal(events[0].sourceBytes,null);
 const incidents=await (await api.get('/api/incidents?source=suricata')).json();
 await page.locator('.sonar-accessible-picker select').selectOption(incidents[0].id.slice(4));
 const drawer=page.getByRole('dialog',{name:'Observation investigation'});await drawer.getByText('Suricata sensor finding',{exact:true}).waitFor();assert.equal(await drawer.getByText('Malicious probability',{exact:true}).count(),0);
 await drawer.getByLabel('Analyst notes').fill('Browser test note');await drawer.getByRole('button',{name:'Save Analyst Notes'}).click();await drawer.getByText('Notes saved',{exact:true}).waitFor();await drawer.getByLabel('Close investigation').click();
 const csv=await (await api.get('/api/suricata/export.csv')).text();assert.ok(csv.includes('Browser test note'));assert.ok(!csv.includes('malicious_probability'));
 await page.getByLabel('Data source').selectOption('analysis');await count(0);await page.getByLabel('Data source').selectOption('suricata');await count(4);
 for(const path of ['/overview','/datasets','/incidents','/traffic-analytics','/reports']){await page.goto(base+path);await page.waitForTimeout(400);const scan=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.deepEqual(scan.violations.map(v=>v.id),[],path+' accessibility');await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),path+' mobile overflow');await page.setViewportSize({width:1440,height:1000});}
 assert.deepEqual(errors,[]);console.log('PASS: import, automatic append, deduplication, truncation, source isolation, real priorities, absent ML scores, notes, CSV, mobile layouts, no browser errors.');
}finally{await context.unrouteAll({behavior:'ignoreErrors'});await browser.close();await api.dispose();}
