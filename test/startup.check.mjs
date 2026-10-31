import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { availablePort,instanceId,serviceMatches } from '../scripts/runtime.mjs';
import { createServer as createHttpServer } from 'node:http';
test('occupied ports are skipped automatically',async()=>{const busy=createServer(socket=>socket.destroy());await new Promise(r=>busy.listen(0,'127.0.0.1',r));try{const port=busy.address().port;const free=await availablePort(port);assert.notEqual(free,port);assert.ok(free>port);}finally{await new Promise(r=>busy.close(r));}});
test('service discovery rejects a different project or service',async()=>{const server=createHttpServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({service:'aegisyn-core',instanceId:'project-a'}));});await new Promise(r=>server.listen(0,'127.0.0.1',r));try{const url=`http://127.0.0.1:${server.address().port}`;assert.equal(await serviceMatches(url,'aegisyn-core','project-a'),true);assert.equal(await serviceMatches(url,'aegisyn-core','project-b'),false);assert.equal(await serviceMatches(url,'aegisyn-web','project-a'),false);}finally{await new Promise(r=>server.close(r));}});
test('workspace identity is stable and distinguishes projects',()=>{assert.equal(instanceId('.'),instanceId('.'));assert.notEqual(instanceId('.'),instanceId('../other-project'));});

test('forwarded HTTP ports are skipped even when a local bind would succeed',async()=>{const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));const original=globalThis.fetch;globalThis.fetch=async(url,options)=>String(url).includes(`:${port}/`)?new Response('{}',{status:404}):original(url,options);try{assert.notEqual(await availablePort(port),port);}finally{globalThis.fetch=original;}});
