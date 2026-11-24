// Banc d'essai visuel : sert l'app, simule Supabase avec des données de démo, capture les écrans.
// Usage : node tests/e2e/screens.js . tests/e2e/output   (PAGES=sales,lots… pour limiter les écrans)
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium, devices } = require('playwright');
const [, , appArg, outArg, ...only] = process.argv; const appDir = path.resolve(appArg || '.'), outDir = path.resolve(outArg || 'tests/e2e/output');
fs.mkdirSync(outDir, { recursive: true });

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const srv = http.createServer((q, r) => {
  let f = path.join(appDir, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  if (!f.startsWith(appDir) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});

// ---------- Données de démonstration ----------
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const USER = { id: uid(1), email: 'myra@example.com', aud: 'authenticated', role: 'authenticated' };
const PROFILE = { id: USER.id, full_name: 'Myra Mabiala', role: 'owner', is_active: true, email: USER.email, phone: '+242 06 600 00 00' };
const day = d => new Date(Date.now() - d * 864e5).toISOString();
const names = ['Grâce Nkounkou', 'Prisca Mabiala', 'Jean-Didier Massamba', 'Hôtel Le Méridien Brazza', 'Christelle Ngouabi', 'Restaurant Mami Wata', 'Arsène Okemba', 'Divine Moukoko', 'Ruth Bouanga', 'Supermarché Casino Poto-Poto', 'Fabrice Loemba', 'Nadège Itoua'];
const customers = names.map((n, i) => ({ id: uid(100 + i), full_name: n, company_name: i % 3 === 0 ? 'SARL ' + n.split(' ')[0] : null, phone: '06 ' + (500 + i * 7) + ' ' + (10 + i) + ' ' + (20 + i), email: i % 2 ? n.toLowerCase().replace(/[^a-z]/g, '') + '@mail.cg' : null, address: ['Poto-Poto', 'Bacongo', 'Moungali', 'Ouenzé', 'Talangaï'][i % 5] + ', Brazzaville', created_at: day(90 - i * 5) }));
const prodNames = [['Saka-saka au poisson salé', 'Pot 500 g', 4500], ['Pondu épicé', 'Pot 500 g', 4000], ['Piment Myra extra-fort', 'Bocal 250 g', 2500], ['Moambé de poulet', 'Barquette 1 kg', 7500], ['Jus de gingembre', 'Bouteille 1 L', 2000], ['Bissap hibiscus', 'Bouteille 1 L', 1800], ['Poisson fumé mbessi', 'Sachet 300 g', 6000], ['Chikwangue artisanale', 'Lot de 5', 3000], ['Sauce arachide', 'Pot 500 g', 3500], ['Beignets (mikate)', 'Sachet de 20', 1500]];
const categories = [{ id: uid(50), name: 'Plats cuisinés', description: 'Plats traditionnels prêts à réchauffer' }, { id: uid(51), name: 'Condiments', description: 'Piments et sauces' }, { id: uid(52), name: 'Boissons', description: 'Jus naturels' }];
const products = prodNames.map(([n, u, p], i) => ({ id: uid(200 + i), name: n, unit: u, sku: 'MYR-' + String(i + 1).padStart(3, '0'), sale_price: p, stock_quantity: [42, 3, 18, 0, 65, 27, 6, 12, 33, 80][i], min_stock: 5, is_active: true, category_id: categories[i % 3].id, image_url: null, created_at: day(120 - i) }));
const statuses = ['paid', 'paid', 'partially_paid', 'confirmed', 'paid', 'draft', 'paid', 'cancelled', 'paid', 'partially_paid'];
const sales = Array.from({ length: 46 }, (_, i) => { const total = [12500, 45000, 8000, 150000, 23500, 7500, 61000, 9000, 33000, 18500][i % 10] + i * 500; const st = statuses[i % 10]; return { id: uid(300 + i), sale_number: 'VTE-2026' + String(1123 - i).padStart(4, '0') + '-' + (1000 + i), customer_id: customers[i % customers.length].id, customers: { full_name: customers[i % customers.length].full_name, company_name: customers[i % customers.length].company_name, phone: customers[i % customers.length].phone }, sale_date: day(i * 1.7), created_at: day(i * 1.7), status: st, subtotal: total, discount: 0, total, amount_paid: st === 'paid' ? total : st === 'partially_paid' ? Math.round(total / 2) : 0, notes: null }; });
const payments = sales.filter(s => s.amount_paid > 0).map((s, i) => ({ id: uid(500 + i), sale_id: s.id, amount: s.amount_paid, payment_method: ['cash', 'mtn_momo', 'airtel_money', 'bank_transfer'][i % 4], direction: 'incoming', payment_date: s.sale_date, created_at: s.sale_date, reference: 'REF' + (8000 + i) }));
const expenses = Array.from({ length: 9 }, (_, i) => ({ id: uid(600 + i), expense_number: 'DEP-' + (100 + i), expense_date: day(i * 3), created_at: day(i * 3), description: ['Achat de poisson', 'Gaz de cuisine', 'Emballages', 'Transport', 'Électricité'][i % 5], amount: [35000, 12000, 18000, 7500, 22000][i % 5], payment_method: 'cash', payee: 'Marché Total' }));
const cash_accounts = [{ id: uid(700), name: 'Caisse principale', account_type: 'cash', provider: null, opening_balance: 50000, current_balance: 412500, is_active: true, created_at: day(200) }, { id: uid(701), name: 'MTN Mobile Money', account_type: 'mobile_money', provider: 'MTN', opening_balance: 0, current_balance: 238000, is_active: true, created_at: day(200) }, { id: uid(702), name: 'Airtel Money', account_type: 'mobile_money', provider: 'Airtel', opening_balance: 0, current_balance: 91500, is_active: true, created_at: day(200) }];
const customer_orders = Array.from({ length: 8 }, (_, i) => ({ id: uid(800 + i), order_number: 'CMD-' + (2400 + i), customer_id: customers[i].id, customers: { full_name: customers[i].full_name, phone: customers[i].phone }, order_date: day(i), created_at: day(i), status: ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled', 'pending', 'confirmed'][i], subtotal: 20000 + i * 3500, discount: 0, delivery_fee: 1500, total: 21500 + i * 3500, delivery_zone: ['Poto-Poto', 'Bacongo', 'Moungali'][i % 3], delivery_address: 'Rue ' + (10 + i), requested_delivery_at: day(-1 - i), notes: null }));
const loyalty_accounts = customers.map((c, i) => ({ customer_id: c.id, points_balance: [12, 340, 55, 610, 8, 140, 0, 220, 75, 900, 30, 5][i], lifetime_points_earned: [12, 340, 55, 610, 8, 140, 0, 220, 75, 900, 30, 5][i] }));
const promo_campaigns = [{ id: uid(900), code: 'BIENVENUE10', name: 'Bienvenue', discount_type: 'percent', discount_value: 10, min_order_amount: 5000, max_uses: 100, uses_count: 23, is_active: true, starts_at: day(30), ends_at: day(-30), created_at: day(30) }, { id: uid(901), code: 'NOEL2026', name: 'Fêtes de fin d’année', discount_type: 'fixed', discount_value: 2000, min_order_amount: 15000, max_uses: 50, uses_count: 0, is_active: false, starts_at: day(-20), ends_at: day(-50), created_at: day(2) }];
const company_settings = [{ id: uid(950), company_name: 'Les Saveurs de Myra', currency: 'XAF', currency_label: 'FCFA', phone: '+242 06 600 00 00', email: 'contact@saveursdemyra.cg', address: 'Avenue de la Paix, Poto-Poto, Brazzaville', logo_url: null, invoice_prefix: 'FAC', quote_prefix: 'DEV', sale_prefix: 'VTE', purchase_prefix: 'ACH', created_at: day(300) }];
const sale_items = sales.flatMap((s, i) => [0, 1].map(k => ({ id: uid(2000 + i * 2 + k), sale_id: s.id, product_id: products[(i + k) % 10].id, quantity: 1 + k, unit_price: products[(i + k) % 10].sale_price, discount: 0, line_total: products[(i + k) % 10].sale_price * (1 + k), products: { name: products[(i + k) % 10].name, unit: products[(i + k) % 10].unit } })));
const DB = { customers, products, product_categories: categories, sales, payments, expenses, cash_accounts, customer_orders, loyalty_accounts, promo_campaigns, company_settings, profiles: [PROFILE], sale_items, customer_order_items: [], suppliers: [], raw_materials: [], raw_material_categories: [], product_movements: [], raw_material_movements: [], production_batches: [], recipes: [], quotes: [], purchase_orders: [], purchase_order_items: [], cash_transactions: [], loyalty_transactions: [] };


// ---------- Données V29 ----------
const nowIso = () => new Date().toISOString();
customers.forEach((c, i) => { c.price_tier = i % 4 === 3 ? 'wholesale' : 'retail'; c.credit_limit = i === 4 ? 100000 : null; c.payment_terms_days = 30; c.birth_date = i === 1 ? new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10).replace(/^\d{4}/, '1990') : null; });
products.forEach((p, i) => { p.barcode = '61300000000' + i; p.wholesale_price = Math.round(p.sale_price * 0.85); });
sales.forEach((s, i) => { s.created_by = i % 3 === 0 ? uid(2) : USER.id; });
const PROFILES = [PROFILE, { id: uid(2), full_name: 'Grâce Vendeuse', role: 'sales', is_active: true }];
const lots = products.slice(0, 6).map((p, i) => ({ id: uid(3000 + i), product_id: p.id, lot_number: 'LOT-202611' + (10 + i) + '-01', production_date: day(20 - i), expiry_date: new Date(Date.now() + (i * 6 - 3) * 864e5).toISOString().slice(0, 10), quantity_initial: 50, quantity_remaining: i === 5 ? 0 : 20 - i, created_at: day(20 - i) }));
const employees = ['Mama Nzaba (cuisinière)', 'Ruth (vendeuse)', 'Junior (livreur)'].map((n, i) => ({ id: uid(4000 + i), full_name: n.split(' (')[0], job_title: n.split('(')[1].replace(')', ''), phone: '06 400 00 0' + i, monthly_salary: [120000, 90000, 80000][i], is_active: true, created_at: day(100) }));
Object.assign(DB, {
  profiles: PROFILES, product_lots: lots,
  complaints: [{ id: uid(5000), customer_id: customers[0].id, product_id: products[1].id, category: 'damaged', description: 'Pot fissuré à la livraison', resolution: 'replacement', resolution_amount: 0, status: 'open', created_at: day(2) }],
  customer_prices: [{ id: uid(5100), customer_id: customers[3].id, product_id: products[0].id, price: 3900, created_at: day(10) }],
  volume_prices: [{ id: uid(5200), product_id: products[0].id, min_quantity: 10, price: 4000, created_at: day(10) }],
  recurring_orders: [{ id: uid(5300), customer_id: customers[3].id, label: 'Livraison du lundi', frequency: 'weekly', next_date: new Date().toISOString().slice(0, 10), items: [{ product_id: products[0].id, quantity: 20 }, { product_id: products[2].id, quantity: 5 }], delivery_fee: 1500, is_active: true, created_at: day(30) }],
  payment_schedules: [{ id: uid(5400), sale_id: sales[2].id, due_date: day(-5).slice(0, 10), amount: 4500, is_paid: false, created_at: day(3) }],
  catering_events: [{ id: uid(5500), customer_id: customers[4].id, title: 'Mariage Ngouabi', event_type: 'wedding', event_date: new Date(Date.now() + 9 * 864e5).toISOString(), location: 'Salle Mafoua', guests: 150, price_per_guest: 6500, extra_fees: 50000, total_amount: 1025000, deposit_amount: 300000, deposit_paid: 150000, status: 'confirmed', menu: 'Saka-saka, poulet moambé, poisson braisé', created_at: day(15) }, { id: uid(5501), customer_id: customers[0].id, title: 'Séminaire SARL Grâce', event_type: 'corporate', event_date: new Date(Date.now() + 20 * 864e5).toISOString(), guests: 40, price_per_guest: 5000, extra_fees: 0, total_amount: 200000, deposit_amount: 50000, deposit_paid: 0, status: 'quote', created_at: day(4) }],
  gift_cards: [{ id: uid(5600), code: 'MYRA-ABC-123', initial_amount: 10000, balance: 6000, buyer_name: 'Prisca', expires_at: day(-90).slice(0, 10), status: 'active', created_at: day(20) }],
  gift_card_transactions: [], sales_targets: [{ id: uid(5700), profile_id: USER.id, month: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10), target_amount: 500000, commission_rate: 3 }],
  employees, attendance: [{ id: uid(5800), employee_id: employees[0].id, work_date: new Date().toISOString().slice(0, 10), status: 'present', check_in: '07:45' }],
  salary_advances: [{ id: uid(5900), employee_id: employees[1].id, advance_date: new Date().toISOString().slice(0, 10), amount: 15000, reason: 'Transport', created_at: nowIso() }],
  stock_locations: [{ id: uid(6000), name: 'Cuisine', kind: 'kitchen', is_active: true, created_at: day(50) }, { id: uid(6001), name: 'Boutique Poto-Poto', kind: 'shop', is_active: true, created_at: day(50) }],
  location_stock: [{ location_id: uid(6001), product_id: products[0].id, quantity: 12 }, { location_id: uid(6000), product_id: products[0].id, quantity: 20 }],
  stock_transfers: [{ id: uid(6100), from_location_id: uid(6000), to_location_id: uid(6001), product_id: products[0].id, quantity: 12, created_at: day(1) }],
  inventory_sessions: [], inventory_lines: [],
  recurring_expenses: [{ id: uid(6200), label: 'Loyer de la cuisine', amount: 150000, day_of_month: 1, payment_method: 'cash', payee: 'Propriétaire', is_active: true, created_at: day(60) }, { id: uid(6201), label: 'Électricité (E2C)', amount: 35000, day_of_month: 28, payment_method: 'mtn_momo', is_active: true, created_at: day(60) }],
  expense_budgets: [{ id: uid(6300), month: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10), amount: 400000 }],
  message_campaigns: []
});
customers[2].referred_by = customers[0].id; customers[5].referred_by = customers[0].id; customers[7].referred_by = customers[3].id;
sales.forEach((x, i) => { x.location_id = i % 3 === 0 ? uid(6001) : i % 3 === 1 ? uid(6000) : null; });
products.forEach((p, i) => { p.cost_price = i < 6 ? Math.round(p.sale_price * 0.55) : null; });
customers.forEach((c, i) => { c.created_at = i < 3 ? new Date().toISOString() : c.created_at; });
const TOK = 'a'.repeat(64);
Object.assign(DB, {
  customer_portal_links: [{ id: uid(7000), customer_id: customers[0].id, token: TOK, expires_at: new Date(Date.now() + 300 * 864e5).toISOString(), revoked: false, last_seen_at: day(1), created_at: day(10) }],
  order_reviews: [{ id: uid(7100), sale_id: sales[1].id, customer_id: sales[1].customer_id, token: 'b'.repeat(64), rating: 5, comment: 'Délicieux, livraison rapide !', requested_at: day(4), submitted_at: day(3) }, { id: uid(7101), sale_id: sales[4].id, customer_id: sales[4].customer_id, token: 'c'.repeat(64), rating: null, requested_at: day(2) }],
  referral_rewards: [], business_goals: [{ id: uid(7200), month: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10), sales_target: 900000, new_customers_target: 5 }],
  product_ratings: [{ product_id: products[0].id, name: products[0].name, average: 4.7, reviews: 6 }, { product_id: products[2].id, name: products[2].name, average: 3.5, reviews: 2 }]
});
const credit = () => customers.map(c => { const mine = sales.filter(s => s.customer_id === c.id && ['confirmed', 'partially_paid'].includes(s.status)); return { customer_id: c.id, full_name: c.full_name, phone: c.phone, credit_limit: c.credit_limit, payment_terms_days: c.payment_terms_days, outstanding: mine.reduce((n, s) => n + s.total - s.amount_paid, 0), oldest_unpaid_at: mine.map(s => s.sale_date).sort()[0] || null, unpaid_sales: mine.length }; });
const REQLOG = [];
function cmp(rv, op, val) {
  if (op === 'is') return val === 'null' ? rv == null : val === 'true' ? rv === true : rv === false;
  if (op === 'in') { const set = val.replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/"/g, '')); return set.includes(String(rv)); }
  const n = typeof rv === 'number' && !isNaN(+val); const a = n ? rv : String(rv ?? ''), b = n ? +val : val;
  return op === 'eq' ? String(rv) === val : op === 'neq' ? String(rv) !== val : op === 'gt' ? a > b : op === 'gte' ? a >= b : op === 'lt' ? a < b : op === 'lte' ? a <= b : true;
}
function filterRows(rows, u) {
  for (const [k, v] of u.searchParams) {
    if (['select', 'order', 'limit', 'offset', 'or', 'on_conflict', 'columns'].includes(k)) continue;
    const m = /^(not\.)?(eq|neq|gt|gte|lt|lte|in|is)\.(.*)$/.exec(v); if (!m) continue;
    const [, neg, op, val] = m;
    rows = rows.filter(r => { const rv = k.includes('.') ? k.split('.').reduce((o, p) => o?.[p], r) : r[k]; const ok = cmp(rv, op, val); return neg ? !ok : ok; });
  }
  return rows;
}
function tableRows(table, u) {
  if (process.env.NO_V29 && ['product_lots','complaints','customer_prices','volume_prices','recurring_orders','payment_schedules','catering_events','gift_cards','gift_card_transactions','sales_targets','employees','attendance','salary_advances','stock_locations','location_stock','stock_transfers','inventory_sessions','inventory_lines','recurring_expenses','expense_budgets','message_campaigns','customer_credit'].includes(table)) return null;
  if (table === 'customer_credit') return credit();
  let rows = DB[table]; if (!rows) return null; rows = rows.slice();
  const sel = u.searchParams.get('select') || '';
  if (table === 'sale_items' && /sales!inner/.test(sel)) rows = rows.map(r => ({ ...r, sales: sales.find(s => s.id === r.sale_id) })).filter(r => r.sales);
  if (table === 'customer_orders' && /customers\(/.test(sel)) rows = rows.map(r => ({ ...r, customers: customers.find(c => c.id === r.customer_id) }));
  return rows;
}
function query(table, u, single, method = 'GET', body = null, prefer = '') {
  REQLOG.push(method + ' ' + table);
  let rows = tableRows(table, u);
  if (rows == null) return { status: 404, body: { code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache` } };
  if (method === 'POST') {
    const DEF = { customer_portal_links: { token: 'd'.repeat(64), revoked: false, expires_at: new Date(Date.now() + 365 * 864e5).toISOString() }, order_reviews: { token: 'e'.repeat(64) }, inventory_sessions: { status: 'open' }, gift_cards: { status: 'active' }, recurring_orders: { is_active: true }, complaints: { status: 'open' } };
    const list = (Array.isArray(body) ? body : [body]).map(r => ({ id: r.id || require('crypto').randomUUID(), created_at: nowIso(), ...(DEF[table] || {}), ...r }));
    const conflict = (u.searchParams.get('on_conflict') || '').split(',').filter(Boolean);
    const out = list.map(r => { const ex = conflict.length && DB[table].find(x => conflict.every(k => String(x[k]) === String(r[k]))); if (ex) { Object.assign(ex, r, { id: ex.id }); return ex; } DB[table].push(r); return r; });
    return { status: 201, body: single ? out[0] : out };
  }
  { const ord = (u.searchParams.get('order') || '').split(',').filter(Boolean).map(o => o.split('.')[0]); const sample = (DB[table] || [])[0];
    const bad = sample && ord.find(c => !(c in sample) && !['created_at'].includes(c)); if (method === 'GET' && bad) return { status: 400, body: { code: '42703', message: `column ${table}.${bad} does not exist` } }; }
  rows = filterRows(rows, u);
  if (method === 'PATCH') { rows.forEach(r => Object.assign(DB[table].find(x => x === r || x.id === r.id) || r, body)); return { status: 200, body: single ? rows[0] : rows }; }
  if (method === 'DELETE') { DB[table] = DB[table].filter(x => !rows.some(r => r.id === x.id)); return { status: 200, body: [] }; }
  if (table === 'sales' && single && rows[0]) rows[0] = { ...rows[0], customers: customers.find(c => c.id === rows[0].customer_id), sale_items: sale_items.filter(x => x.sale_id === rows[0].id) };
  const off = +u.searchParams.get('offset') || 0, lim = u.searchParams.get('limit');
  if (lim) rows = rows.slice(off, off + +lim);
  return { status: 200, body: single ? (rows[0] || null) : rows };
}
function rpc(name, args) {
  REQLOG.push('RPC ' + name);
  const R = {
    generate_due_recurring_orders: () => 1, get_team_members: () => PROFILES,
    redeem_gift_card: () => { const g = DB.gift_cards.find(x => x.code === String(args.p_code).toUpperCase()); if (!g || g.balance < args.p_amount) return { error: 'Solde insuffisant' }; g.balance -= args.p_amount; return g.balance; },
    transfer_stock: () => require('crypto').randomUUID(), apply_inventory: () => DB.inventory_lines.length, resolve_price: () => 4000,
    get_customer_portal: () => args.p_token === TOK ? { company: { name: 'Les Saveurs de Myra', phone: '06 600 00 00', address: 'Poto-Poto, Brazzaville', currency: 'FCFA' }, customer: { name: customers[0].full_name }, points: 340, outstanding: 23500, sales: sales.filter(x => x.customer_id === customers[0].id && x.status !== 'draft').slice(0, 4).map(x => ({ number: x.sale_number, date: x.sale_date, status: x.status, total: x.total, paid: x.amount_paid, discount: 0, shipping: 0, items: sale_items.filter(i => i.sale_id === x.id).map(i => ({ name: i.products.name, unit: i.products.unit, quantity: i.quantity, price: i.unit_price, total: i.line_total })) })) } : { error: 'Lien invalide ou expiré' },
    get_review_request: () => { const r = DB.order_reviews.find(x => x.token === args.p_token); return r ? { company: 'Les Saveurs de Myra', customer: 'Grâce', reference: 'VTE-20261120-1003', items: ['Saka-saka au poisson salé', 'Bissap hibiscus'], submitted: !!r.submitted_at, rating: r.rating } : { error: 'Lien invalide' }; },
    submit_review: () => { const r = DB.order_reviews.find(x => x.token === args.p_token && !x.submitted_at); if (!r) return { error: 'Ce lien a déjà été utilisé' }; r.rating = args.p_rating; r.comment = args.p_comment; r.submitted_at = nowIso(); return true; },
    confirm_sale: () => null, register_sale_payment: () => ({ amount: args.p_amount })
  };
  if (!R[name]) return { status: 200, body: null };
  const v = R[name](); if (v && v.error) return { status: 400, body: { message: v.error } }; return { status: 200, body: v };
}
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 3600;
const SESSION = { access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: USER.id, exp, role: 'authenticated' })}.x`, refresh_token: 'rt', token_type: 'bearer', expires_in: 3600, expires_at: exp, user: USER };

async function setup(ctx, loggedIn = true) {
  await ctx.addInitScript(([s, u, p, loggedIn]) => {
    if (!loggedIn) { localStorage.clear(); return; }
    localStorage.setItem('sb-fvpvfmlmszcoyhjlgago-auth-token', JSON.stringify(s));
    localStorage.setItem('myra_bm_last_authenticated_user_v1', JSON.stringify({ id: u.id, email: u.email }));
    localStorage.setItem('myra_bm_offline_cache_v1', JSON.stringify({ ['profile:' + u.id]: p }));
  }, [SESSION, USER, PROFILE, loggedIn]);
  await ctx.route(/supabase\.co/, route => {
    const req = route.request(), u = new URL(req.url());
    if (u.pathname.startsWith('/auth/v1/')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(u.pathname.includes('user') ? USER : SESSION) });
    if (u.pathname.startsWith('/functions/v1/')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer: 'Réponse de test de l’assistant : ce mois-ci, le saka-saka est votre meilleure vente.' }) });
    const r = /\/rest\/v1\/rpc\/([a-z_]+)/.exec(u.pathname);
    if (r) { const out = rpc(r[1], JSON.parse(req.postData() || '{}')); return route.fulfill({ status: out.status, contentType: 'application/json', body: JSON.stringify(out.body) }); }
    const m = /\/rest\/v1\/([a-z_]+)/.exec(u.pathname);
    if (m) { const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object'); let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch (_) {} const out = query(m[1], u, single, req.method(), body, req.headers()['prefer'] || ''); return route.fulfill({ status: out.status, contentType: 'application/json', body: JSON.stringify(out.body) }); }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com/, route => route.continue().catch(() => route.abort()));
}

const PAGES = process.env.PAGES ? process.env.PAGES.split(',') : ['login', 'dashboard', 'sales', 'commandes', 'customers', 'marketing', 'products', 'product_categories', 'finances', 'profile', 'company_settings', 'sync_center', 'modal_sale', 'new_sale', 'menu'];
const VIEWS = { desktop: { viewport: { width: 1440, height: 900 } }, mobile: { ...devices['iPhone 13'] } };

srv.listen(0, async () => {
  const port = srv.address().port, base = `http://localhost:${port}/`;
  const b = await chromium.launch();
  for (const [vname, vopts] of Object.entries(VIEWS)) {
    for (const pg of PAGES.filter(p => !only.length || only.includes(p))) {
      if (pg === 'menu' && vname === 'desktop') continue;
      const ctx = await b.newContext({ ...vopts, serviceWorkers: 'block', deviceScaleFactor: 1 });
      await setup(ctx, pg !== 'login');
      const page = await ctx.newPage(); const errs = [];
      page.on('pageerror', e => errs.push(e.message));
      await page.goto(base); await page.waitForTimeout(1200);
      if (!['login', 'modal_sale', 'new_sale', 'menu', 'dashboard'].includes(pg)) { await page.evaluate(p => window.MyraApp.navigate(p), pg); await page.waitForTimeout(1200); }
      if (pg === 'modal_sale') { await page.evaluate(() => window.MyraApp.navigate('sales')); await page.waitForTimeout(1000); await page.evaluate(id => window.MyraApp.openSaleDetail(id), uid(300)); await page.waitForTimeout(1000); }
      if (pg === 'new_sale') { await page.evaluate(() => window.MyraApp.navigate('sales')); await page.waitForTimeout(1000); await page.evaluate(() => window.MyraApp.openSaleWorkflow()); await page.waitForTimeout(1000); }
      if (pg === 'menu') { await page.click('#bnMenu').catch(() => {}); await page.waitForTimeout(600); }
      const file = path.join(outDir, `${vname}-${pg}.png`);
      await page.screenshot({ path: file.replace('.png', '-top.png') });
      if (!['modal_sale', 'new_sale', 'menu'].includes(pg)) { const H = await page.evaluate(() => document.documentElement.scrollHeight); const vp = page.viewportSize(); await page.setViewportSize({ width: vp.width, height: Math.min(H, 6000) }); await page.waitForTimeout(300); await page.screenshot({ path: file }); await page.setViewportSize(vp); }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const fails = await page.evaluate(() => [...document.querySelectorAll('.ext-error, .panel h3')].map(e => e.textContent).filter(t => /indisponible|Impossible/i.test(t)));
      console.log(vname.padEnd(8), pg.padEnd(20), 'débordement:', overflow, errs.length ? 'ERREURS: ' + errs.join(' | ') : '', fails.length ? 'PANNEAUX: ' + fails.join(' | ') : '');
      await ctx.close();
    }
  }
  await b.close(); srv.close();
});
