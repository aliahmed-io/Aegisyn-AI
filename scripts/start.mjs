import { spawn } from 'node:child_process';
import { existsSync,openSync,writeFileSync,closeSync } from 'node:fs';
import { mkdir,writeFile,unlink,readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { availablePort, instanceId, savedRuntime, serviceMatches } from './runtime.mjs';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const id=instanceId(root);
const mode=process.argv.includes('--production')?'production':'development';
const shouldOpen=!process.argv.includes('--no-open');
const stateDirectory=resolve(root,'.aegisyn');
const stateFile=resolve(stateDirectory,'runtime.json');
const lockFile=resolve(stateDirectory,'startup.lock');
let lockOwned=false;
const children=[];
let stopping=false;
function child(command,args,env={},persistent=true){
 const proc=spawn(command,args,{cwd:root,env:{...process.env,...env},stdio:'inherit',windowsHide:true});
 children.push(proc);proc.on('error',error=>{console.error(`Could not start ${command}: ${error.message}`);void stop(1);});
 proc.on('exit',(code)=>{if(!stopping&&persistent){console.error(`A local service stopped (${code??'signal'}). Run npm run dev to restart.`);void stop(code===0?0:1);}});
 return proc;
}
function openBrowser(url){
 if(!shouldOpen)return;
 const [command,args]=process.platform==='win32'?['rundll32.exe',['url.dll,FileProtocolHandler',url]]:process.platform==='darwin'?['open',[url]]:['xdg-open',[url]];
 const proc=spawn(command,args,{stdio:'ignore',detached:true,windowsHide:true});proc.on('error',()=>console.log(`Open ${url} in your browser.`));proc.unref();
}
async function stop(code=0){
 if(stopping)return;stopping=true;
 for(const proc of children){if(proc.exitCode!==null||proc.signalCode!==null||!proc.pid)continue;
  if(process.platform==='win32'){await new Promise(done=>{const kill=spawn('taskkill.exe',['/pid',String(proc.pid),'/t','/f'],{stdio:'ignore',windowsHide:true});kill.once('exit',done);kill.once('error',done);});}else proc.kill('SIGTERM');
 }
 const current=await savedRuntime(stateFile);if(current?.ownerPid===process.pid)await unlink(stateFile).catch(()=>{});
 if(lockOwned)await unlink(lockFile).catch(()=>{});
 process.exit(code);
}
async function ready(url,service){
 const deadline=Date.now()+120000;
 while(Date.now()<deadline){if(await serviceMatches(url,service,id))return;await delay(600);}
 throw new Error(`The ${service} service did not become ready. See its output above.`);
}
process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop());
async function main(){
 await mkdir(stateDirectory,{recursive:true});
 let waitingMessage=false;
 const deadline=Date.now()+180000;
 while(Date.now()<deadline){
  const previous=await savedRuntime(stateFile);
  if(previous?.mode===mode){
   const [webReady,apiReady]=await Promise.all([
    serviceMatches(`http://127.0.0.1:${previous.webPort}/api/aegisyn-instance`,'aegisyn-web',id),
    serviceMatches(`http://127.0.0.1:${previous.apiPort}/api/health`,'aegisyn-core',id)
   ]);
   if(webReady&&apiReady){const url=`http://127.0.0.1:${previous.webPort}`;console.log(`Aegisyn is already running: ${url}`);openBrowser(url);return;}
   if(Number.isInteger(previous.ownerPid)&&previous.ownerPid>0){let ownerAlive=true;try{process.kill(previous.ownerPid,0);}catch(e){ownerAlive=e.code==='EPERM';}if(ownerAlive){if(!waitingMessage){console.log('Aegisyn is refreshing. Waiting for the existing launcher…');waitingMessage=true;}await delay(1000);continue;}}
  }
  try{const file=openSync(lockFile,'wx');writeFileSync(file,JSON.stringify({ownerPid:process.pid}));closeSync(file);lockOwned=true;break;}
  catch(error){if(error.code!=='EEXIST')throw error;
   let owner;try{owner=JSON.parse(await readFile(lockFile,'utf8')).ownerPid;}catch{owner=null;}
   if(Number.isInteger(owner)&&owner>0){let alive=true;try{process.kill(owner,0);}catch(e){alive=e.code==='EPERM';}if(!alive){await unlink(lockFile).catch(()=>{});continue;}}
   if(!waitingMessage){console.log('Aegisyn is already starting. Waiting for its working address…');waitingMessage=true;}
   await delay(1000);
  }
 }
 if(!lockOwned)throw new Error('An existing launcher has not become ready. Close its terminal and run npm run dev again.');
  const webPort=await availablePort(3002);
  const apiPort=await availablePort(18152);
  const pythonCandidates=process.platform==='win32'?['venv/Scripts/python.exe','.venv/Scripts/python.exe']:['venv/bin/python','.venv/bin/python'];
  const python=pythonCandidates.map(p=>resolve(root,p)).find(existsSync);
  if(!python)throw new Error('Create a Python environment first: python -m venv venv, then install requirements.txt in that environment.');
  const shared={AEGISYN_INSTANCE_ID:id};
  console.log(`Starting Aegisyn. Website port: ${webPort}; analysis port: ${apiPort}.`);
  child(python,['-m','uvicorn','server.main:app','--host','127.0.0.1','--port',String(apiPort)],shared);
  await ready(`http://127.0.0.1:${apiPort}/api/health`,'aegisyn-core');
  const next=resolve(root,'node_modules/next/dist/bin/next');
  if(!existsSync(next))throw new Error('Website dependencies are missing. Run npm install first.');
  const env={...shared,AEGISYN_API_ORIGIN:`http://127.0.0.1:${apiPort}`};
  if(mode==='production'&&!existsSync(resolve(root,'.next/BUILD_ID'))){console.log('Preparing the first production build…');const build=child(process.execPath,[next,'build','--webpack'],env,false);await new Promise((resolve,reject)=>{build.once('exit',code=>code===0?resolve():reject(new Error('The production build failed. See the output above.')));build.once('error',reject);});}
  child(process.execPath,[next,mode==='production'?'start':'dev',...(mode==='development'?['--webpack']:[]),'--hostname','127.0.0.1','--port',String(webPort)],env);
  await ready(`http://127.0.0.1:${webPort}/api/aegisyn-instance`,'aegisyn-web');
  await mkdir(stateDirectory,{recursive:true});
  await writeFile(stateFile,JSON.stringify({mode,ownerPid:process.pid,webPort,apiPort,instanceId:id},null,2));
  const url=`http://127.0.0.1:${webPort}`;
  console.log(`\nAegisyn is ready: ${url}\nPorts are connected automatically. Press Ctrl+C to stop both services.\n`);
  openBrowser(url);
}
main().catch(async error=>{console.error(`\nStartup failed: ${error.message}`);await stop(1);});
