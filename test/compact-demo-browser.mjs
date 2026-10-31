import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const state=JSON.parse(await readFile('.aegisyn/runtime.json','utf8'));const base=`http://127.0.0.1:${state.webPort}`;
const b=await chromium.launch({channel:'chrome',headless:true});
try{const context=await b.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base,{waitUntil:'networkidle'});await p.getByRole('button',{name:'Pause illustration'}).click();await p.screenshot({path:'docs/images/landing.png'});
 await p.goto(base+'/overview',{waitUntil:'networkidle'});await p.getByText('40 signals',{exact:true}).waitFor();
 assert.equal(await p.locator('.sonar-panel').getByRole('button',{name:/^(Pause|Resume|Reset|[.0-9]+x)$/}).count(),0);const cards=await p.locator('.metric-card strong').allTextContents();assert.equal(cards[0],'64');assert.equal(cards[1],'40');
 const counts=await p.locator('.sonar-severity-legend > div > span:last-child').allTextContents();assert.notDeepEqual(counts,['10','10','10','10']);assert.equal(counts.reduce((s,n)=>s+Number(n),0),40);assert.ok(counts.every(n=>Number(n)>0));console.log('Visible severity counts:',counts);
 for(const [index,level] of ['low','medium','high','critical'].entries()){await p.getByRole('button',{name:new RegExp('^'+level+'$','i')}).click();assert.equal(await p.locator('.sonar-accessible-picker option').count(),Number(counts[index])+1);}await p.getByRole('button',{name:'ALL',exact:true}).click();
 await p.screenshot({path:'docs/images/overview.png'});
 await p.setViewportSize({width:390,height:844});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:'reports/compact-overview-mobile.png',fullPage:true});await p.setViewportSize({width:1440,height:1000});
 await p.goto(base+'/datasets',{waitUntil:'networkidle'});await p.getByRole('button',{name:'Use demo dataset',exact:true}).waitFor();await p.screenshot({path:'docs/images/datasets.png'});
 assert.deepEqual(errors,[]);console.log('PASS: 40 flagged flows; 40 immediate signals with uneven severity counts and no playback controls; all four severity filters; mobile width; 3 README screenshots; no runtime errors.');
}finally{await b.close();}
