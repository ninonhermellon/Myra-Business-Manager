import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type,x-myra-webhook-secret','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'};
const out=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:cors});
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return out({error:'Method not allowed'},405);
 const secret=Deno.env.get('LOYVERSE_WEBHOOK_SECRET');
 const supplied=new URL(req.url).searchParams.get('secret');
 if(!secret || supplied!==secret)return out({error:'Unauthorized'},401);
 const raw=await req.text(); if(raw.length>1024*1024)return out({error:'Payload too large'},413);
 let p:any;try{p=JSON.parse(raw)}catch{return out({error:'Invalid JSON'},400)}
 const allowed=['inventory_levels.update','items.update','customers.update','receipts.update','shifts.create'];
 if(!allowed.includes(p.type))return out({received:true,ignored:true,reason:'Unsupported event'});
 const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 const db=createClient(url,key);
 const eventKey=`${p.merchant_id||'unknown'}:${p.type}:${p.created_at||''}:${await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)).then(x=>Array.from(new Uint8Array(x)).map(b=>b.toString(16).padStart(2,'0')).join(''))}`;
 const {error}=await db.from('loyverse_event_inbox').upsert({event_key:eventKey,event_type:p.type,merchant_id:p.merchant_id||null,payload:p,status:'received'},{onConflict:'event_key',ignoreDuplicates:true});
 if(error)return out({error:'Inbox persistence failed'},500);
 // ACK seulement après persistance. Le traitement métier est volontairement différé.
 return out({received:true,queued:true});
});
