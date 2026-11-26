// Myra V33 — Envoi des notifications push (Web Push, clés VAPID créées automatiquement au 1er appel).
// Appels acceptés :
//  - par la base (déclencheurs) avec l'en-tête secret x-myra-hook : { action: 'event', kind, title, body, url, tag, actor }
//  - par un membre de l'équipe connecté (jeton Supabase) : { action: 'public_key' } ou { action: 'test', endpoint? }
// Déployée sans vérification JWT automatique : chaque action fait son propre contrôle.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Qui reçoit quoi (en plus du choix fait sur chaque appareil)
const ALL = ['owner', 'super_admin', 'admin', 'manager', 'accountant', 'sales', 'stock_manager', 'employee'];
const ROLES: Record<string, string[]> = {
  orders: ALL,
  sales: ['owner', 'super_admin', 'admin', 'manager', 'accountant', 'sales'],
  payments: ['owner', 'super_admin', 'admin', 'manager', 'accountant'],
  reviews: ['owner', 'super_admin', 'admin', 'manager', 'sales'],
  stock: ['owner', 'super_admin', 'admin', 'manager', 'stock_manager'],
  test: ALL,
};

type Cfg = { hook_secret: string; vapid_public: string; vapid_private: string };
let cached: Cfg | null = null;
async function config(): Promise<Cfg> {
  if (cached) return cached;
  let { data, error } = await admin.from('push_config').select('hook_secret,vapid_public,vapid_private').eq('id', true).maybeSingle();
  if (error || !data) throw new Error('Configuration des notifications absente (migration V33 non appliquée).');
  if (!data.vapid_public || !data.vapid_private) {
    const k = webpush.generateVAPIDKeys();
    await admin.from('push_config').update({ vapid_public: k.publicKey, vapid_private: k.privateKey, updated_at: new Date().toISOString() }).eq('id', true).is('vapid_public', null);
    ({ data } = await admin.from('push_config').select('hook_secret,vapid_public,vapid_private').eq('id', true).single());
  }
  cached = data as Cfg;
  webpush.setVapidDetails(SUPABASE_URL, cached.vapid_public, cached.vapid_private);
  return cached;
}

function sameSecret(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0;
}

type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string; failures: number };
async function deliver(subs: Sub[], payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  const res = await Promise.all(subs.map(async s => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 24 * 3600, urgency: 'high' });
      await admin.from('push_subscriptions').update({ failures: 0, last_success_at: new Date().toISOString() }).eq('id', s.id);
      return 'ok';
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode ?? 0;
      if (code === 404 || code === 410 || s.failures >= 9) { await admin.from('push_subscriptions').delete().eq('id', s.id); return 'removed'; }
      await admin.from('push_subscriptions').update({ failures: s.failures + 1 }).eq('id', s.id);
      console.error('push', code, String((e as Error).message || e).slice(0, 200));
      return 'failed:' + code;
    }
  }));
  return { sent: res.filter(r => r === 'ok').length, removed: res.filter(r => r === 'removed').length, failed: res.filter(r => r.startsWith('failed')).length, details: res };
}

async function staffFromToken(req: Request) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  if (!data?.user) return null;
  const { data: p } = await admin.from('profiles').select('id,role,is_active,full_name').eq('id', data.user.id).maybeSingle();
  if (!p || p.is_active === false || !p.role) return null;
  return p as { id: string; role: string; full_name: string | null };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);
  let input: Record<string, unknown>;
  try { input = await req.json(); } catch { return json({ error: 'Requête invalide' }, 400); }
  try {
    const cfg = await config();

    if (input.action === 'event') {
      if (!sameSecret(req.headers.get('x-myra-hook') || '', cfg.hook_secret)) return json({ error: 'Non autorisé' }, 401);
      const kind = String(input.kind || '');
      if (!ROLES[kind]) return json({ error: 'Type inconnu' }, 400);
      const { data: subs } = await admin.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth,failures,prefs');
      const list = (subs || []).filter(s => s.prefs?.[kind] !== false && s.user_id !== input.actor);
      if (!list.length) return json({ sent: 0 });
      const { data: profiles } = await admin.from('profiles').select('id,role,is_active').in('id', [...new Set(list.map(s => s.user_id))]);
      const ok = new Map((profiles || []).filter(p => p.is_active !== false && ROLES[kind].includes(p.role)).map(p => [p.id, true]));
      const targets = list.filter(s => ok.has(s.user_id));
      if (!targets.length) return json({ sent: 0 });
      const r = await deliver(targets, { title: String(input.title || 'Myra').slice(0, 120), body: String(input.body || '').slice(0, 400), url: String(input.url || './'), tag: String(input.tag || kind), kind });
      return json(r);
    }

    const staff = await staffFromToken(req);
    if (!staff) return json({ error: 'Connexion requise' }, 401);

    if (input.action === 'public_key') return json({ publicKey: cfg.vapid_public });

    if (input.action === 'test') {
      let q = admin.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth,failures').eq('user_id', staff.id);
      if (typeof input.endpoint === 'string') q = q.eq('endpoint', input.endpoint);
      const { data: subs } = await q;
      if (!subs?.length) return json({ error: 'Aucun appareil abonné pour ce compte.' }, 404);
      const r = await deliver(subs as Sub[], { title: '🔔 Notifications activées', body: `Bonjour ${(staff.full_name || '').split(' ')[0] || ''} ! Vous serez prévenu(e) des commandes, ventes, paiements, avis et ruptures de stock.`.replace('  ', ' '), url: './', tag: 'test', kind: 'test' });
      return json(r);
    }

    return json({ error: 'Action inconnue' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
