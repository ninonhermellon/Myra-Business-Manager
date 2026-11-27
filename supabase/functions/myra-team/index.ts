// Myra V38 — Équipe et accès : création d'un compte employé et nouveau mot de passe, depuis l'application.
// Réservé au propriétaire et aux administrateurs actifs (contrôle fait ici, avec le jeton de la personne connectée).
//  { action: 'create', email, password, full_name, role }  → compte confirmé, fiche active avec le rôle choisi
//  { action: 'reset_password', user_id, password }          → nouveau mot de passe provisoire
//  { action: 'update', user_id, email?, full_name?, phone? } → fiche et e-mail de connexion
//  { action: 'delete', user_id }                            → suppression (seulement sans historique)
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const ROLES = ['admin', 'manager', 'sales', 'stock_manager', 'accountant', 'employee', 'driver'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);
  let input: Record<string, unknown>;
  try { input = await req.json(); } catch { return json({ error: 'Requête invalide' }, 400); }
  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: who } = token ? await admin.auth.getUser(token) : { data: null };
    if (!who?.user) return json({ error: 'Connexion requise' }, 401);
    const { data: me } = await admin.from('profiles').select('id,role,is_active').eq('id', who.user.id).maybeSingle();
    if (!me || !me.is_active || !['owner', 'admin'].includes(me.role)) return json({ error: 'Réservé au propriétaire et aux administrateurs.' }, 403);
    const password = String(input.password || '');
    const needsPw = input.action === 'create' || input.action === 'reset_password';
    if (needsPw && password.length < 8) return json({ error: 'Le mot de passe provisoire doit contenir au moins 8 caractères.' }, 400);
    const target = async (id: string) => {
      if (!id || id === me.id) return { err: json({ error: 'Utilisez « Mon profil » pour votre propre compte.' }, 400) };
      const { data: t } = await admin.from('profiles').select('id,role,full_name').eq('id', id).maybeSingle();
      if (!t) return { err: json({ error: 'Membre introuvable.' }, 404) };
      if (me.role !== 'owner' && ['owner', 'admin'].includes(t.role)) return { err: json({ error: 'Seul le propriétaire peut modifier ce compte.' }, 403) };
      return { t };
    };

    if (input.action === 'update') {
      const { t, err } = await target(String(input.user_id || '')); if (err) return err;
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof input.full_name === 'string') { const n = input.full_name.trim().slice(0, 120); if (n.length < 2) return json({ error: 'Le nom est obligatoire.' }, 400); patch.full_name = n; }
      if (typeof input.phone === 'string') patch.phone = input.phone.trim().slice(0, 30) || null;
      if (typeof input.email === 'string' && input.email.trim()) {
        const email = input.email.trim().toLowerCase();
        if (!EMAIL.test(email)) return json({ error: 'Adresse e-mail invalide.' }, 400);
        const { error } = await admin.auth.admin.updateUserById(t!.id, { email, email_confirm: true });
        if (error) { const dup = /already|registered|exists/i.test(error.message); return json({ error: dup ? 'Cette adresse e-mail est déjà utilisée.' : error.message }, dup ? 409 : 400); }
        patch.email = email;
      }
      await admin.from('profiles').update(patch).eq('id', t!.id);
      return json({ ok: true });
    }

    if (input.action === 'delete') {
      const { t, err } = await target(String(input.user_id || '')); if (err) return err;
      if (t!.role === 'owner') return json({ error: 'Un propriétaire ne peut pas être supprimé.' }, 403);
      const checks: [string, string][] = [['sales', 'created_by'], ['payments', 'received_by'], ['customer_orders', 'created_by'], ['customer_orders', 'driver_id'], ['expenses', 'created_by'], ['cash_closings', 'user_id'], ['promo_campaigns', 'created_by'], ['product_movements', 'created_by']];
      for (const [tbl, col] of checks) {
        const { count } = await admin.from(tbl).select('id', { count: 'exact', head: true }).eq(col, t!.id);
        if (count) return json({ error: `${t!.full_name || 'Ce membre'} a déjà un historique (ventes, paiements, commandes…). Désactivez son compte plutôt que de le supprimer : l’historique reste intact.`, has_history: true }, 409);
      }
      const { error } = await admin.auth.admin.deleteUser(t!.id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (input.action === 'create') {
      const email = String(input.email || '').trim().toLowerCase();
      const full_name = String(input.full_name || '').trim().slice(0, 120);
      const phone = String(input.phone || '').trim().slice(0, 30) || null;
      const role = String(input.role || 'employee');
      if (!EMAIL.test(email)) return json({ error: 'Adresse e-mail invalide.' }, 400);
      if (!full_name) return json({ error: 'Le nom est obligatoire.' }, 400);
      if (!ROLES.includes(role)) return json({ error: 'Rôle inconnu.' }, 400);
      if (role === 'admin' && me.role !== 'owner') return json({ error: 'Seul le propriétaire peut nommer un administrateur.' }, 403);
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name }, app_metadata: { myra_role: role, myra_active: true } });
      if (error) {
        const dup = /already|registered|exists/i.test(error.message);
        return json({ error: dup ? 'Un compte existe déjà avec cette adresse e-mail.' : error.message }, dup ? 409 : 400);
      }
      // Sécurité : la fiche est normalement créée par le déclencheur V38 ; on la complète au besoin.
      await admin.from('profiles').upsert({ id: data.user.id, email, full_name, phone, role, is_active: true, updated_at: new Date().toISOString() });
      return json({ id: data.user.id, email, full_name, role });
    }

    if (input.action === 'reset_password') {
      const { t, err } = await target(String(input.user_id || '')); if (err) return err;
      const { error } = await admin.auth.admin.updateUserById(t!.id, { password });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: 'Action inconnue' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
