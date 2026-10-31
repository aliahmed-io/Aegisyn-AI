import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const state=JSON.parse(await readFile('.aegisyn/runtime.json','utf8'));const base=`http://127.0.0.1:${state.webPort}`;
const b=await chromium.launch({channel:'chrome'});let page;
try{const context=await b.newContext({viewport:{width:1440,height:1000}});const p=await context.newPage();page=p;const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.route('**/api/**',async route=>{const u=new URL(route.request().url());u.port='18151';try{const response=await route.fetch({url:u.toString(),timeout:120000,maxRetries:2});await route.fulfill({response});}catch{await route.abort().catch(()=>{});}});
await p.goto(base,{waitUntil:'networkidle'});await p.getByRole('button',{name:'Pause illustration'}).click();await p.getByRole('button',{name:'Resume illustration'}).waitFor();
await p.getByRole('link',{name:'Explore with demo data',exact:true}).click();await p.getByRole('button',{name:'Use demo dataset',exact:true}).click();
await p.getByRole('button',{name:'Analyze dataset',exact:true}).click();console.log('Running model on the restored demo…');await p.getByRole('status').filter({hasText:'Analysis completed'}).waitFor({timeout:180000});
await p.getByRole('link',{name:'View dashboard'}).click();await p.waitForFunction(()=>document.querySelector('.metric-card strong')?.textContent==='64');await p.getByText('Generated demo data • model inference',{exact:true}).waitFor();console.log('Demo restored and visibly labeled; compact dataset has 64 inferred records.');
await p.waitForTimeout(3500);await p.getByRole('button',{name:'Inspect observation',exact:false}).click();const dialog=p.getByRole('dialog',{name:'Observation investigation'});await dialog.waitFor();
for(let i=0;i<15;i++){await p.keyboard.press('Tab');assert.ok(await dialog.evaluate(d=>d.contains(document.activeElement)),'Focus must stay inside the dialog');}await p.keyboard.press('Escape');assert.equal(await dialog.count(),0);
await p.goto(base+'/incidents');await p.getByRole('button',{name:'Triage',exact:true}).first().click();await p.getByRole('dialog',{name:'Triage incident'}).waitFor();await p.keyboard.press('Escape');assert.equal(await p.getByRole('dialog').count(),0);
await p.goto(base+'/overview');await p.waitForTimeout(1000);await p.screenshot({path:'reports/overview-demo-desktop.png'});
console.log('PASS: landing controls, demo loading, actual model inference, dashboard provenance, drawer focus containment and Escape, incident modal, no runtime errors.');assert.deepEqual(errors,[]);
}catch(e){console.error('FLOW FAILURE:',e);throw e;}finally{await page?.unrouteAll({behavior:'ignoreErrors'});await b.close();}
