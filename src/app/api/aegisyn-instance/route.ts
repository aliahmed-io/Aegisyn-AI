import { createHash } from 'node:crypto';
export async function GET(){
 const instanceId=process.env.AEGISYN_INSTANCE_ID||createHash('sha256').update(process.cwd().toLowerCase()).digest('hex').slice(0,16);
 return Response.json({service:'aegisyn-web',instanceId},{headers:{'Cache-Control':'no-store'}});
}
