// LSM Business Manager V41 — Flux catalogue pour Facebook, Instagram et WhatsApp Business (Meta Commerce Manager).
// Public et en lecture seule : il ne lit que le catalogue déjà visible sur la boutique (fonction get_public_catalog).
// Adresse à donner à Meta : https://lessaveursdemyra.vercel.app/catalogue-facebook.csv (mise à jour planifiée, ex. chaque jour).
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const SITE = 'https://lessaveursdemyra.vercel.app';
const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
const csv = (v: unknown) => { const s = String(v ?? '').replace(/\r?\n/g, ' ').trim(); return /[",;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Méthode non autorisée', { status: 405 });
  const { data, error } = await sb.rpc('get_public_catalog');
  if (error || !data) return new Response('Catalogue indisponible', { status: 503 });
  const brand = data.company?.name || 'Les saveurs de Myra';
  const cats = new Map((data.categories || []).map((c: { id: string; name: string }) => [c.id, c.name]));
  const head = ['id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link', 'brand', 'product_type', 'google_product_category', 'quantity_to_sell_on_facebook'];
  const rows = (data.products || []).map((p: Record<string, unknown>) => {
    const desc = String(p.description || '') || (Array.isArray(p.bundle) ? 'Coffret : ' + (p.bundle as { quantity: number; name: string }[]).map(i => `${i.quantity} × ${i.name}`).join(', ') : `${p.name} — fait maison à Brazzaville par ${brand}.`);
    const img = String(p.image || '').startsWith('http') ? String(p.image) : p.image ? SITE + '/' + String(p.image).replace(/^\//, '') : SITE + '/assets/og/og-square.jpg';
    return [p.id, String(p.name).slice(0, 150), desc.slice(0, 5000), p.available ? 'in stock' : 'available for order', 'new', `${Math.round(Number(p.price))} XAF`,
      `${SITE}/boutique.html?p=${p.id}`, img, brand, cats.get(p.category_id as string) || (Array.isArray(p.bundle) ? 'Coffrets' : 'Produits'), 'Food, Beverages & Tobacco > Food Items', p.available ? 50 : 0].map(csv).join(',');
  });
  const body = '﻿' + head.join(',') + '\n' + rows.join('\n') + '\n';
  return new Response(req.method === 'HEAD' ? null : body, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'public, max-age=900', 'Access-Control-Allow-Origin': '*', 'Content-Disposition': 'inline; filename="catalogue-les-saveurs-de-myra.csv"' } });
});
