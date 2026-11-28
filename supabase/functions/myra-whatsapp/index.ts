// LSM Business Manager V41 — Reçu automatique par l'API WhatsApp Business (Meta Cloud API).
// Appelée par la base après chaque encaissement quand Paramètres › Reçus = « automatique ».
// Nécessite les secrets (Supabase › Edge Functions › Secrets) : WHATSAPP_TOKEN, WHATSAPP_PHONE_ID,
// WHATSAPP_TEMPLATE (modèle approuvé par Meta, 4 variables : prénom, n° de vente, total, lien du reçu), WHATSAPP_LANG (fr).
// Sans ces secrets : rien n'est envoyé, l'application propose l'envoi manuel (bouton « Reçu WhatsApp »).
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const SITE = 'https://lessaveursdemyra.vercel.app';
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-myra-hook', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
const TOKEN = Deno.env.get('WHATSAPP_TOKEN') || '', PHONE_ID = Deno.env.get('WHATSAPP_PHONE_ID') || '';
const TEMPLATE = Deno.env.get('WHATSAPP_TEMPLATE') || 'recu_achat', LANG = Deno.env.get('WHATSAPP_LANG') || 'fr';
const configured = () => !!(TOKEN && PHONE_ID);
const msisdn = (p: string) => { let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('00')) d = d.slice(2); if (d.length === 9 && d.startsWith('0')) d = '242' + d; return d.length >= 11 ? d : ''; };
const fcfa = (n: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Number(n || 0)).replace(/\u202f/g, ' ') + ' FCFA';
function same(a: string, b: string) { if (!a || !b || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  let input: Record<string, unknown> = {}; try { input = await req.json(); } catch { return json({ error: 'Requête invalide' }, 400); }
  try {
    if (input.action === 'config') return json({ configured: configured(), template: TEMPLATE });
    if (input.action !== 'receipt') return json({ error: 'Action inconnue' }, 400);
    const { data: cfg } = await admin.from('push_config').select('hook_secret').limit(1).maybeSingle();
    if (!same(req.headers.get('x-myra-hook') || '', cfg?.hook_secret || '')) return json({ error: 'Non autorisé' }, 401);
    const saleId = String(input.sale_id || '');
    const { data: s } = await admin.from('sales').select('id,sale_number,total,amount_paid,receipt_token,customer_id,customers(full_name,phone)').eq('id', saleId).maybeSingle();
    if (!s) return json({ error: 'Vente introuvable' }, 404);
    const c = (s as unknown as { customers: { full_name: string; phone: string } | null }).customers;
    const to = msisdn(c?.phone || '');
    const log = (status: string, error: string | null = null, id: string | null = null) => admin.from('whatsapp_messages').insert({ sale_id: s.id, phone: to || null, status, error, message_id: id });
    if (!to) { await log('skipped', 'Client sans numéro'); return json({ sent: false, reason: 'no_phone' }); }
    if (!configured()) { await log('not_configured'); return json({ sent: false, reason: 'not_configured' }); }
    const { data: recent } = await admin.from('whatsapp_messages').select('id').eq('sale_id', s.id).eq('status', 'sent').gte('created_at', new Date(Date.now() - 120000).toISOString()).limit(1);
    if (recent?.length) return json({ sent: false, reason: 'duplicate' });
    const link = `${SITE}/recu.html?t=${s.receipt_token}`;
    const r = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'template', template: { name: TEMPLATE, language: { code: LANG },
        components: [{ type: 'body', parameters: [{ type: 'text', text: (c?.full_name || 'cher client').split(' ')[0] }, { type: 'text', text: s.sale_number }, { type: 'text', text: fcfa(Number(s.total)) }, { type: 'text', text: link }] }] } }) });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) { await log('error', String(out?.error?.message || r.status).slice(0, 300)); return json({ sent: false, error: out?.error?.message || r.status }, 502); }
    await log('sent', null, out?.messages?.[0]?.id || null);
    return json({ sent: true });
  } catch (e) { console.error(e); return json({ error: String((e as Error).message || e) }, 500); }
});
