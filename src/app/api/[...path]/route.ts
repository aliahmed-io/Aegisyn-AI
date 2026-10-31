import type { NextRequest } from 'next/server';
type Context={params:Promise<{path:string[]}>};
async function proxy(request:NextRequest,context:Context){
 const origin=new URL(process.env.AEGISYN_API_ORIGIN||'http://127.0.0.1:8000');
 if(origin.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(origin.hostname))return Response.json({detail:'The analysis service must run on this machine.'},{status:503});
 const {path}=await context.params;
 const url=new URL('/api/'+path.map(encodeURIComponent).join('/'),origin);url.search=request.nextUrl.search;
 try{
  let body:ArrayBuffer|undefined;
  if(request.method!=='GET'&&request.method!=='HEAD'&&request.body){
   const reader=request.body.getReader();const chunks:Uint8Array[]=[];let total=0;
   while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>26*1024*1024){await reader.cancel();return Response.json({detail:'The maximum upload size is 25 MB.'},{status:413});}chunks.push(value);}
   body=new ArrayBuffer(total);const bytes=new Uint8Array(body);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  }
  const headers=new Headers();for(const name of ['content-type','accept']){const value=request.headers.get(name);if(value)headers.set(name,value);}
  const response=await fetch(url,{method:request.method,headers,body,cache:'no-store',signal:AbortSignal.any([request.signal,AbortSignal.timeout(120000)])});
  const resultHeaders=new Headers(response.headers);for(const name of ['connection','keep-alive','transfer-encoding','content-encoding','content-length'])resultHeaders.delete(name);resultHeaders.set('Cache-Control','no-store');
  return new Response(response.body,{status:response.status,headers:resultHeaders});
 }catch{return Response.json({detail:'Analysis service unavailable. Run npm run dev to start both services together.'},{status:503});}
}
export const GET=proxy;
export const POST=proxy;
export const PATCH=proxy;
