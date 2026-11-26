// Myra V38 — Équipe et accès : création d'un compte employé et nouveau mot de passe, depuis l'application.
// Réservé au propriétaire et aux administrateurs actifs (contrôle fait ici, avec le jeton de la personne connectée).
//  { action: 'create', email, password, full_name, role }  → compte confirmé, fiche active avec le rôle choisi
//  { action: 'reset_password', user_id, password }          → nouveau mot de passe provisoire
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const ROLES = ['admin', 'manager', 'sales', 'stock_manager', 'accountant', 'employee'];
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
    if (password.length < 8) return json({ error: 'Le mot de passe provisoire doit contenir au moins 8 caractères.' }, 400);

    if (input.action === 'create') {
      const email = String(input.email || '').trim().toLowerCase();
      const full_name = String(input.full_name || '').trim().slice(0, 120);
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
      await admin.from('profiles').upsert({ id: data.user.id, email, full_name, role, is_active: true, updated_at: new Date().toISOString() });
      return json({ id: data.user.id, email, full_name, role });
    }

    if (input.action === 'reset_password') {
      const id = String(input.user_id || '');
      if (!id || id === me.id) return json({ error: 'Changez votre propre mot de passe depuis Mon profil.' }, 400);
      const { data: t } = await admin.from('profiles').select('role').eq('id', id).maybeSingle();
      if (!t) return json({ error: 'Membre introuvable.' }, 404);
      if (me.role !== 'owner' && ['owner', 'admin'].includes(t.role)) return json({ error: 'Seul le propriétaire peut changer ce mot de passe.' }, 403);
      const { error } = await admin.auth.admin.updateUserById(id, { password });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: 'Action inconnue' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
