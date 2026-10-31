import { createServer } from 'node:net';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
export function instanceId(directory){return createHash('sha256').update(resolve(directory).toLowerCase()).digest('hex').slice(0,16);}
export async function availablePort(preferred,host='127.0.0.1'){
 for(let port=preferred;port<Math.min(preferred+200,65536);port++){
  // Desktop port forwarding can expose a live HTTP service even when a local bind probe succeeds.
  // Treat any HTTP response, including 404, as occupied.
  const httpBusy=await fetch(`http://${host}:${port}/api/health`,{signal:AbortSignal.timeout(1200)}).then(()=>true).catch(()=>false);
  if(httpBusy)continue;
  const free=await new Promise((resolve,reject)=>{const server=createServer();server.once('error',error=>{if(['EADDRINUSE','EACCES'].includes(error.code))resolve(false);else reject(error);});server.listen(port,host,()=>server.close(()=>resolve(true)));});
  if(free)return port;
 }
 throw new Error(`No available port near ${preferred}.`);
}
export async function serviceMatches(url,service,id){try{const response=await fetch(url,{signal:AbortSignal.timeout(6000)});if(!response.ok)return false;const data=await response.json();return data.service===service&&data.instanceId===id;}catch{return false;}}
export async function savedRuntime(file){try{const data=JSON.parse(await readFile(file,'utf8'));if(![data.webPort,data.apiPort].every(p=>Number.isInteger(p)&&p>0&&p<=65535))return null;return data;}catch{return null;}}
