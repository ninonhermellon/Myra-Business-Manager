import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' };
const json = (body: unknown, status=200) => new Response(JSON.stringify(body), {status, headers:cors});
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok',{headers:cors});
  if (req.method !== 'POST') return json({error:'Method not allowed'},405);
  const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return json({error:'Authentification requise'},401);
  const userClient = createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const {data:{user},error:userErr}=await userClient.auth.getUser();
  if(userErr || !user) return json({error:'Session invalide'},401);
  const admin=createClient(url,service);
  const {data:profile}=await admin.from('profiles').select('role').eq('id',user.id).maybeSingle();
  if(!profile || !['owner','admin','super_admin'].includes(profile.role)) return json({error:'Accès administrateur requis'},403);
  const token=Deno.env.get('LOYVERSE_ACCESS_TOKEN');
  if(!token) return json({error:'Secret LOYVERSE_ACCESS_TOKEN non configuré côté serveur'},503);
  let body:any; try{body=await req.json()}catch{return json({error:'JSON invalide'},400)}
  if(body.action!=='test_connection') return json({error:'Action non autorisée. Le connecteur est en mode test sécurisé.'},400);
  const r=await fetch('https://api.loyverse.com/v1.0/merchant',{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}});
  const text=await r.text(); let data:any; try{data=JSON.parse(text)}catch{data={raw:text.slice(0,500)}}
  if(!r.ok) return json({ok:false,status:r.status,error:data?.message||data?.error||'Échec API Loyverse'},502);
  return json({ok:true,merchant:data,checked_at:new Date().toISOString()});
});
