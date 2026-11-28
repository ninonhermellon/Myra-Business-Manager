// LSM Business Manager V41 — Paiement MTN MoMo validé automatiquement (API MoMo « Collection » : Request to Pay).
// Le client choisit « MTN MoMo » dans la boutique, reçoit une demande de paiement sur son téléphone et la valide avec son code :
// la commande passe automatiquement à « payée ». Nécessite le contrat MoMo API de MTN Congo et les secrets
// (Supabase › Edge Functions › Secrets) : MOMO_SUBSCRIPTION_KEY, MOMO_API_USER, MOMO_API_KEY,
// MOMO_TARGET_ENV (ex. « mtncongo », fourni par MTN), MOMO_BASE_URL (ex. https://proxy.momoapi.mtn.com), MOMO_CURRENCY (XAF).
// Sans ces secrets, la boutique garde le paiement au code marchand avec référence à vérifier.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, PUT, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
const KEY = Deno.env.get('MOMO_SUBSCRIPTION_KEY') || '', USER = Deno.env.get('MOMO_API_USER') || '', API_KEY = Deno.env.get('MOMO_API_KEY') || '';
const ENV = Deno.env.get('MOMO_TARGET_ENV') || 'mtncongo', BASE = (Deno.env.get('MOMO_BASE_URL') || 'https://proxy.momoapi.mtn.com').replace(/\/$/, '');
const CUR = Deno.env.get('MOMO_CURRENCY') || 'XAF';
const configured = () => !!(KEY && USER && API_KEY);
const digits = (p: string) => String(p || '').replace(/\D/g, '');
const msisdn = (p: string) => { let d = digits(p); if (d.startsWith('00')) d = d.slice(2); if (d.length === 9 && d.startsWith('0')) d = '242' + d; return d; };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let tok: { v: string; exp: number } | null = null;
async function token() {
  if (tok && tok.exp > Date.now() + 60000) return tok.v;
  const r = await fetch(`${BASE}/collection/token/`, { method: 'POST', headers: { Authorization: 'Basic ' + btoa(`${USER}:${API_KEY}`), 'Ocp-Apim-Subscription-Key': KEY } });
  if (!r.ok) throw new Error('Connexion à MTN MoMo impossible (' + r.status + ')');
  const j = await r.json(); tok = { v: j.access_token, exp: Date.now() + Number(j.expires_in || 3600) * 1000 }; return tok.v;
}
async function notify(title: string, body: string, tag: string) {
  try {
    await admin.from('app_notifications').insert({ kind: 'payments', title, body, url: './#/commandes', tag });
    const { data: c } = await admin.from('push_config').select('function_url,hook_secret').limit(1).maybeSingle();
    if (c?.function_url) await fetch(c.function_url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-myra-hook': c.hook_secret }, body: JSON.stringify({ action: 'event', kind: 'payments', title, body, url: './#/commandes', tag }) });
  } catch (_) { /* la notification ne doit jamais bloquer le paiement */ }
}
async function refresh(ref: string) {
  const { data: m } = await admin.from('momo_requests').select('*').eq('id', ref).maybeSingle();
  if (!m) return { status: 'UNKNOWN' };
  if (m.status !== 'PENDING') return { status: m.status, reason: m.reason };
  const r = await fetch(`${BASE}/collection/v1_0/requesttopay/${ref}`, { headers: { Authorization: 'Bearer ' + await token(), 'X-Target-Environment': ENV, 'Ocp-Apim-Subscription-Key': KEY } });
  if (!r.ok) return { status: 'PENDING' };
  const j = await r.json(); const st = String(j.status || 'PENDING').toUpperCase();
  if (st === 'PENDING') return { status: 'PENDING' };
  await admin.from('momo_requests').update({ status: st, reason: j.reason?.code || j.reason || null, financial_transaction_id: j.financialTransactionId || null, updated_at: new Date().toISOString() }).eq('id', ref);
  if (st === 'SUCCESSFUL') {
    const { data: o } = await admin.from('customer_orders').select('id,order_number,total,notes,payment_status').eq('id', m.order_id).maybeSingle();
    if (o && o.payment_status !== 'paid') {
      await admin.from('customer_orders').update({ payment_status: 'paid', payment_method: 'mtn_momo', payment_reference: j.financialTransactionId || ref, payment_verified_at: new Date().toISOString(),
        notes: [o.notes, `Paiement MTN MoMo validé automatiquement ✔ (transaction ${j.financialTransactionId || ref})`].filter(Boolean).join('\n'), updated_at: new Date().toISOString() }).eq('id', o.id);
      await notify('💰 Paiement MTN MoMo reçu', `${o.order_number} · ${m.amount} FCFA · validé automatiquement`, 'momo-' + o.id);
    }
  }
  return { status: st, reason: j.reason?.code || j.reason || null };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  let input: Record<string, unknown> = {}; try { input = await req.json(); } catch { input = {}; }
  try {
    // Rappel de MTN (callback) : on ne fait pas confiance au contenu, on revérifie auprès de MTN
    const cbRef = String(input.referenceId || new URL(req.url).searchParams.get('ref') || '');
    if (!input.action && UUID.test(cbRef)) { if (configured()) await refresh(cbRef); return json({ ok: true }); }
    if (input.action === 'config') return json({ configured: configured(), environment: ENV, currency: CUR });
    if (!configured()) return json({ error: 'Le paiement MoMo automatique n’est pas encore activé : payez au code marchand.' }, 503);

    if (input.action === 'request') {
      const number = String(input.order_number || '').trim().toUpperCase(); const payer = msisdn(String(input.payer || input.phone || ''));
      if (!/^WEB-\d{8}-[A-Z0-9]{6}$/.test(number)) return json({ error: 'Commande introuvable.' }, 400);
      if (payer.length < 11) return json({ error: 'Numéro MTN MoMo invalide (ex. 06 123 45 67).' }, 400);
      const { data: o } = await admin.from('customer_orders').select('id,order_number,total,payment_status,payment_method,created_at,customers(phone)').eq('order_number', number).maybeSingle();
      const ophone = digits((o as unknown as { customers: { phone: string } | null })?.customers?.phone || '');
      if (!o || digits(String(input.phone || '')).slice(-8) !== ophone.slice(-8)) return json({ error: 'Commande introuvable.' }, 404);
      if (o.payment_status === 'paid') return json({ status: 'SUCCESSFUL' });
      if (Date.now() - new Date(o.created_at).getTime() > 48 * 3600e3) return json({ error: 'Commande trop ancienne : contactez-nous sur WhatsApp.' }, 400);
      const { count } = await admin.from('momo_requests').select('id', { count: 'exact', head: true }).eq('order_id', o.id).gte('created_at', new Date(Date.now() - 600000).toISOString());
      if ((count || 0) >= 3) return json({ error: 'Trop de demandes : patientez quelques minutes.' }, 429);
      const ref = crypto.randomUUID(); const amount = Math.round(Number(o.total));
      const r = await fetch(`${BASE}/collection/v1_0/requesttopay`, { method: 'POST', headers: { Authorization: 'Bearer ' + await token(), 'X-Reference-Id': ref, 'X-Target-Environment': ENV, 'Ocp-Apim-Subscription-Key': KEY, 'Content-Type': 'application/json',
          'X-Callback-Url': `${Deno.env.get('SUPABASE_URL')}/functions/v1/myra-momo?ref=${ref}` },
        body: JSON.stringify({ amount: String(amount), currency: CUR, externalId: o.order_number, payer: { partyIdType: 'MSISDN', partyId: payer }, payerMessage: `Commande ${o.order_number}`, payeeNote: 'Les saveurs de Myra' }) });
      if (r.status !== 202) { const t = await r.text(); console.error('requesttopay', r.status, t.slice(0, 300)); return json({ error: 'MTN MoMo n’a pas accepté la demande. Vérifiez le numéro ou payez au code marchand.' }, 502); }
      await admin.from('momo_requests').insert({ id: ref, order_id: o.id, amount, currency: CUR, payer });
      await admin.from('customer_orders').update({ payment_method: 'mtn_momo', payer_phone: payer, payment_status: o.payment_status === 'refused' ? 'to_verify' : o.payment_status, updated_at: new Date().toISOString() }).eq('id', o.id);
      return json({ reference: ref, status: 'PENDING' });
    }
    if (input.action === 'status') {
      const ref = String(input.reference || ''); if (!UUID.test(ref)) return json({ error: 'Référence invalide' }, 400);
      return json(await refresh(ref));
    }
    return json({ error: 'Action inconnue' }, 400);
  } catch (e) { console.error(e); return json({ error: String((e as Error).message || e) }, 500); }
});
