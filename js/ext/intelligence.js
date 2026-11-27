/* Myra V29 — 12. Assistant · 13. Prévisions · 14. Scan & inventaire · 15. Dépenses récurrentes & budget · 16. Messages groupés */
(() => {
  const X = window.MyraX, { EXT, A, esc, money, num, fdate, today, monthStart, iso, addDays, daysBetween } = X;

  X.menu('PILOTAGE', [['assistant', 'Assistant', 'fa-wand-magic-sparkles'], ['forecast', 'Prévisions', 'fa-chart-line'], ['budget', 'Budget & charges fixes', 'fa-scale-balanced'], ['messages', 'Messages clients', 'fa-comments']], 5);
  Object.assign(EXT.statusLabels, { applied: 'Appliqué' });

  /* ---------- Données de ventes communes (180 jours) ---------- */
  async function salesData(days = 180) {
    const app = A(), since = iso(addDays(new Date(), -days));
    const [items, sales, products, customers] = await Promise.all([
      app.fetchAll(() => app.sb.from('sale_items').select('product_id,quantity,line_total,sales!inner(sale_date,status,customer_id)').gte('sales.sale_date', since).not('sales.status', 'in', '(draft,cancelled)')),
      app.fetchAll(() => app.sb.from('sales').select('id,sale_date,status,customer_id,total,amount_paid').not('status', 'in', '(draft,cancelled)')),
      app.fetchAll(() => app.sb.from('products').select('id,name,unit,sale_price,stock_quantity,min_stock,is_active')),
      app.fetchAll(() => app.sb.from('customers').select('id,full_name,phone,company_name'))
    ]);
    for (const r of [items, sales, products, customers]) if (r.error) throw r.error;
    return { items: items.data, sales: sales.data, products: products.data, customers: customers.data, since };
  }
  const weekIndex = d => Math.floor(daysBetween(d, today()) / 7); // 0 = 7 derniers jours

  /* ---------- 12. Assistant ---------- */
  const QUICK = [
    ['top', 'Mes meilleures ventes du mois', 'fa-trophy'],
    ['inactive', 'Clients qui ne commandent plus (60 j)', 'fa-user-clock'],
    ['restock', 'Produits à réapprovisionner', 'fa-boxes-stacked'],
    ['trend', 'Ce mois-ci par rapport au mois dernier', 'fa-chart-line'],
    ['debts', 'Qui me doit le plus d’argent ?', 'fa-sack-dollar']
  ];
  function quickAnswer(kind, d) {
    const pmap = new Map(d.products.map(p => [p.id, p])), cmap = new Map(d.customers.map(c => [c.id, c]));
    const ms = monthStart(), prevMs = iso(new Date(new Date(ms).getFullYear(), new Date(ms).getMonth() - 1, 1));
    if (kind === 'top') {
      const agg = {}; d.items.filter(i => i.sales.sale_date >= ms).forEach(i => { const a = agg[i.product_id] = agg[i.product_id] || { q: 0, ca: 0 }; a.q += Number(i.quantity); a.ca += Number(i.line_total); });
      const top = Object.entries(agg).sort((a, b) => b[1].ca - a[1].ca).slice(0, 5);
      return top.length ? `<p>Ce mois-ci, vos produits qui rapportent le plus :</p><ol>${top.map(([id, a]) => `<li><b>${esc(pmap.get(id)?.name || 'Produit')}</b> — ${money(a.ca)} (${num(a.q)} vendus)</li>`).join('')}</ol>` : '<p>Aucune vente confirmée ce mois-ci pour le moment.</p>';
    }
    if (kind === 'inactive') {
      const last = {}; d.sales.forEach(s => { if (s.customer_id && (!last[s.customer_id] || s.sale_date > last[s.customer_id])) last[s.customer_id] = s.sale_date; });
      const list = Object.entries(last).filter(([, dt]) => daysBetween(dt, today()) > 60).sort((a, b) => a[1].localeCompare(b[1])).slice(0, 15);
      return list.length ? `<p>${list.length} client(s) n’ont rien acheté depuis plus de 60 jours :</p><ul>${list.map(([id, dt]) => `<li><b>${esc(cmap.get(id)?.full_name || 'Client')}</b> — dernier achat le ${fdate(dt)} (${daysBetween(dt, today())} j)</li>`).join('')}</ul><p>Conseil : envoyez-leur un message personnalisé depuis <a href="#/messages">Messages clients</a>.</p>` : '<p>Tous vos clients ont acheté au cours des 60 derniers jours. 👏</p>';
    }
    if (kind === 'restock') {
      const list = d.products.filter(p => p.is_active !== false && Number(p.stock_quantity) <= Number(p.min_stock || 0)).sort((a, b) => a.stock_quantity - b.stock_quantity);
      return list.length ? `<p>À produire ou racheter en priorité :</p><ul>${list.map(p => `<li><b>${esc(p.name)}</b> — ${num(p.stock_quantity)} en stock (alerte à ${num(p.min_stock)})</li>`).join('')}</ul>` : '<p>Aucun produit sous son seuil d’alerte.</p>';
    }
    if (kind === 'trend') {
      const sum = (a, b) => d.sales.filter(s => s.sale_date >= a && s.sale_date < b).reduce((n, s) => n + Number(s.total), 0);
      const dayN = new Date().getDate(); const prevSame = iso(new Date(new Date(prevMs).getFullYear(), new Date(prevMs).getMonth(), dayN + 1));
      const cur = sum(ms, '9999'), prev = sum(prevMs, prevSame); const pct = prev ? Math.round((cur - prev) / prev * 100) : null;
      return `<p>Du 1er au ${dayN} : <b>${money(cur)}</b> de ventes ce mois-ci, contre <b>${money(prev)}</b> sur la même période du mois dernier${pct != null ? ` (<b>${pct > 0 ? '+' : ''}${pct} %</b>)` : ''}.</p>`;
    }
    if (kind === 'debts') {
      const agg = {}; d.sales.forEach(s => { const due = Number(s.total) - Number(s.amount_paid); if (s.customer_id && due > 0) agg[s.customer_id] = (agg[s.customer_id] || 0) + due; });
      const list = Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 8);
      return list.length ? `<ol>${list.map(([id, v]) => `<li><b>${esc(cmap.get(id)?.full_name || 'Client')}</b> — ${money(v)}</li>`).join('')}</ol><p>Relancez-les depuis <a href="#/credit">Crédit clients</a>.</p>` : '<p>Personne ne vous doit d’argent. 👍</p>';
    }
    return '';
  }
  function contextFor(d) {
    const pmap = new Map(d.products.map(p => [p.id, p.name])), cmap = new Map(d.customers.map(c => [c.id, c.full_name]));
    const byMonth = {}; d.sales.forEach(s => { const m = s.sale_date.slice(0, 7); byMonth[m] = (byMonth[m] || 0) + Number(s.total); });
    const prod = {}; d.items.forEach(i => { const m = i.sales.sale_date.slice(0, 7); const k = pmap.get(i.product_id) || i.product_id; const p = prod[k] = prod[k] || {}; p[m] = p[m] || { quantite: 0, chiffre_affaires: 0 }; p[m].quantite += Number(i.quantity); p[m].chiffre_affaires += Number(i.line_total); });
    const cust = {}; d.sales.forEach(s => { if (!s.customer_id) return; const c = cust[s.customer_id] = cust[s.customer_id] || { nom: cmap.get(s.customer_id), achats: 0, total: 0, reste_a_payer: 0, dernier_achat: '' }; c.achats++; c.total += Number(s.total); c.reste_a_payer += Number(s.total) - Number(s.amount_paid); if (s.sale_date > c.dernier_achat) c.dernier_achat = s.sale_date.slice(0, 10); });
    return { date_du_jour: today(), devise: 'FCFA', ventes_par_mois: byMonth, ventes_par_produit_et_mois_180j: prod, clients: Object.values(cust).sort((a, b) => b.total - a.total).slice(0, 300), produits: d.products.map(p => ({ nom: p.name, prix: Number(p.sale_price), stock: Number(p.stock_quantity), seuil_alerte: Number(p.min_stock || 0), actif: p.is_active !== false })) };
  }
  EXT.pages.assistant = {
    title: 'Assistant',
    async render(host, app) {
      host.innerHTML = X.head('Assistant', 'Posez une question sur vos ventes, clients et stocks. Les réponses rapides sont calculées sur l’appareil ; les questions libres utilisent l’IA (Claude).')
        + `<section class="card ext-chat"><div class="chips-quick">${QUICK.map(([k, l, i]) => `<button type="button" class="chip-q" data-q="${k}"><i class="fa-solid ${i}"></i> ${esc(l)}</button>`).join('')}</div><div class="chat-log" id="chatLog" aria-live="polite"><div class="msg bot"><p>Bonjour ${esc(app.state.profile?.full_name?.split(' ')[0] || '')} ! Choisissez une question rapide ou écrivez la vôtre, par exemple : « Combien de saka-saka ai-je vendu ce mois ? »</p></div></div><form class="chat-form" id="chatForm"><input name="q" placeholder="Votre question…" autocomplete="off" maxlength="500" aria-label="Votre question"><button class="btn primary" type="submit" aria-label="Envoyer"><i class="fa-solid fa-paper-plane"></i></button></form></section>`;
      const log = host.querySelector('#chatLog'); let data = null;
      const add = (who, html) => { const el = document.createElement('div'); el.className = 'msg ' + who; el.innerHTML = html; log.append(el); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return el; };
      const ensure = async () => { if (!data) data = await salesData(); return data; };
      log.addEventListener('click', e => { const a = e.target.closest('a[href^="#/"]'); if (a) { e.preventDefault(); app.navigate(a.getAttribute('href').slice(2)); } });
      host.querySelectorAll('[data-q]').forEach(b => b.onclick = async () => { add('me', `<p>${esc(b.textContent.trim())}</p>`); const w = add('bot', '<p class="muted">Calcul…</p>'); try { w.innerHTML = quickAnswer(b.dataset.q, await ensure()); } catch (e) { w.innerHTML = `<p>${esc(X.explain(e))}</p>`; } });
      host.querySelector('#chatForm').addEventListener('submit', async e => {
        e.preventDefault(); const q = e.target.elements.q.value.trim(); if (!q) return; e.target.elements.q.value = '';
        add('me', `<p>${esc(q)}</p>`); const w = add('bot', '<p class="muted"><i class="fa-solid fa-circle-notch fa-spin"></i> Réflexion…</p>');
        if (!navigator.onLine) { w.innerHTML = '<p>L’assistant a besoin d’Internet. Les réponses rapides ci-dessus fonctionnent avec les dernières données chargées.</p>'; return; }
        try {
          const ctx = contextFor(await ensure());
          const { data: res, error } = await app.sb.functions.invoke('myra-assistant', { body: { question: q, context: ctx } });
          if (error) { const status = error.context?.status; w.innerHTML = status === 404 || /Failed to send|not found/i.test(error.message) ? '<p>L’assistant IA n’est pas encore installé sur le serveur. Voir <b>NOTES-V29.md › Assistant</b> (2 commandes à lancer une fois). Les réponses rapides fonctionnent déjà.</p>' : `<p>${esc((await error.context?.json?.().catch(() => null))?.error || error.message)}</p>`; return; }
          w.innerHTML = `<p>${esc(res.answer || res.error || '').replace(/\n/g, '<br>')}</p>`;
        } catch (err) { w.innerHTML = `<p>${esc(X.explain(err))}</p>`; }
      });
    }
  };

  /* ---------- 13. Prévisions de production ---------- */
  EXT.pages.forecast = {
    title: 'Prévisions',
    async render(host) {
      X.loading(host, 'Analyse de l’historique des ventes…');
      let d; try { d = await salesData(84); } catch (e) { return X.errorPanel(host, e); }
      const weeks = 12, byProd = {};
      d.items.forEach(i => { const w = weekIndex(i.sales.sale_date); if (w < 0 || w >= weeks) return; (byProd[i.product_id] = byProd[i.product_id] || Array(weeks).fill(0))[w] += Number(i.quantity); });
      const rows = d.products.filter(p => p.is_active !== false).map(p => {
        const h = byProd[p.id] || Array(weeks).fill(0); // h[0] = semaine la plus récente
        const w4 = [4, 3, 2, 1], recent = h.slice(0, 4).reduce((n, v, i) => n + v * w4[i], 0) / 10;
        const older = h.slice(4, 8).reduce((n, v) => n + v, 0) / 4, trend = older ? Math.max(-0.5, Math.min(0.5, (h.slice(0, 4).reduce((n, v) => n + v, 0) / 4 - older) / older)) : 0;
        const forecast = Math.max(0, recent * (1 + trend / 2)); const toMake = Math.max(0, Math.ceil(forecast * 1.15 - Number(p.stock_quantity)));
        return { p, h, forecast, trend, toMake, cover: forecast ? Number(p.stock_quantity) / forecast : Infinity };
      }).sort((a, b) => b.toMake - a.toMake || b.forecast - a.forecast);
      const spark = h => { const r = [...h].reverse(), mx = Math.max(1, ...r); return `<span class="spark">${r.map(v => `<i style="height:${Math.max(6, Math.round(v / mx * 100))}%" title="${num(v)}"></i>`).join('')}</span>`; };
      host.innerHTML = X.head('Prévisions', 'Estimation des ventes de la semaine prochaine (12 dernières semaines, les plus récentes comptent davantage) et quantités à produire, marge de sécurité de 15 % incluse.', `<button class="btn light" type="button" id="fcPrint"><i class="fa-solid fa-print"></i> Plan de production</button>`)
        + X.kpis([['fa-industry', 'Produits à fabriquer', String(rows.filter(r => r.toMake > 0).length), 'pour couvrir la semaine prochaine', 'k-amber'], ['fa-chart-line', 'Ventes prévues', num(Math.round(rows.reduce((n, r) => n + r.forecast, 0))) + ' unités', 'semaine prochaine', 'k-green']])
        + X.table(['Produit', '12 semaines', 'Prévu / semaine', 'Tendance', 'Stock', 'Couverture', 'À produire'], rows.map(r => `<tr><td data-role="title">${esc(r.p.name)}</td><td data-role="meta">${spark(r.h)}</td><td data-role="meta">${num(Math.round(r.forecast * 10) / 10)}</td><td data-role="meta">${r.trend > 0.05 ? '<span class="tone ok">↗ hausse</span>' : r.trend < -0.05 ? '<span class="tone warn">↘ baisse</span>' : '<span class="tone neutral">stable</span>'}</td><td data-role="meta">${num(r.p.stock_quantity)}</td><td data-role="meta">${r.cover === Infinity ? '—' : r.cover < 1 ? `<span class="tone bad">${Math.round(r.cover * 7)} j</span>` : `${Math.round(r.cover * 7)} j`}</td><td data-role="amount">${r.toMake ? `<b>${num(r.toMake)}</b>` : '—'}</td></tr>`), 'Pas encore assez de ventes pour prévoir.')
        + '<p class="muted">Estimation indicative : ajustez selon les commandes déjà reçues, les fêtes et les événements traiteur.</p>';
      host.querySelector('#fcPrint').onclick = () => { const todo = rows.filter(r => r.toMake > 0); X.printDoc({ title: 'Plan de production', kicker: 'Plan de production', subtitle: 'Semaine du ' + fdate(new Date()),
        sections: [{ title: todo.length + ' produit(s) à fabriquer', table: { head: ['Produit', 'Prévu', 'Stock', 'À produire', 'Fait'], align: ['', 'r', 'r', 'r', 'c'], rows: todo.map(r => [r.p.name, num(Math.round(r.forecast)), num(r.p.stock_quantity), num(r.toMake), '☐']), empty: 'Rien à produire cette semaine.' } }],
        status: [todo.length ? 'Estimation indicative : ajustez selon les commandes reçues' : 'Stock suffisant pour la semaine', todo.length ? 'warn' : 'ok'] }); };
    }
  };

  /* ---------- 14. Scan : vente rapide + inventaire ---------- */
  let scanCatalog = null;
  async function catalog() { if (scanCatalog) return scanCatalog; const app = A(); const r = await app.fetchAll(() => app.sb.from('products').select('id,name,sku,barcode,stock_quantity,is_active')); scanCatalog = r.error ? (await app.fetchAll(() => app.sb.from('products').select('id,name,sku,stock_quantity,is_active'))).data || [] : r.data; return scanCatalog; }
  async function lookup(code) {
    const prods = await catalog(); const hit = X.findProduct(prods, code);
    if (hit?.lotNumber) { const { data } = await A().sb.from('product_lots').select('product_id').eq('lot_number', hit.lotNumber).maybeSingle(); return prods.find(p => p.id === data?.product_id) || null; }
    return hit;
  }
  X.on('saleForm', ctx => {
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn light'; btn.innerHTML = '<i class="fa-solid fa-barcode"></i> Scanner';
    ctx.form.querySelector('#addSaleItem').before(btn);
    btn.onclick = async () => {
      const code = await X.scan('Scanner un produit'); if (!code) return;
      const p = await lookup(code); if (!p) return A().toast('Code inconnu : ' + code + '. Renseignez le code-barres dans la fiche produit.', true);
      let row = [...ctx.rows.querySelectorAll('.sale-item-row')].find(r => r.querySelector('.item-product').value === p.id);
      if (row) { const q = row.querySelector('.item-qty'); q.value = Number(q.value || 0) + 1; q.dispatchEvent(new Event('input', { bubbles: true })); }
      else { row = [...ctx.rows.querySelectorAll('.sale-item-row')].find(r => !r.querySelector('.item-product').value); if (!row) { ctx.addItem(); row = ctx.rows.lastElementChild; } const sel = row.querySelector('.item-product'); sel.value = p.id; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      A().toast(`${p.name} ajouté.`);
    };
  });
  EXT.pages.inventory = {
    title: 'Inventaire (scan)',
    async render(host, app) {
      X.loading(host);
      let sessions, products;
      try { [sessions, products] = await Promise.all([X.load('inventory_sessions', '*', 'created_at', false), catalog()]); } catch (e) { return X.errorPanel(host, e); }
      let open = sessions.find(s => s.status === 'open');
      if (!open) {
        host.innerHTML = X.head('Inventaire (scan)', 'Comptez le stock réel en scannant les produits, puis appliquez les écarts en un clic.', `<button class="btn primary" type="button" id="invNew"><i class="fa-solid fa-play"></i> Commencer un inventaire</button>`)
          + X.table(['Inventaire', 'Date', 'Statut'], sessions.map(s => `<tr><td data-role="title">${esc(s.label)}</td><td data-role="meta">${fdate(s.created_at)}</td><td data-role="meta">${app.status(s.status)}</td></tr>`), 'Aucun inventaire réalisé.');
        host.querySelector('#invNew').onclick = async () => { const { error } = await app.sb.from('inventory_sessions').insert({ label: 'Inventaire du ' + fdate(new Date()) }); if (error) return app.toast(X.explain(error), true); EXT.pages.inventory.render(host, app); };
        return;
      }
      const { data: lines, error } = await app.sb.from('inventory_lines').select('*').eq('session_id', open.id).order('created_at', { ascending: false }); if (error) return X.errorPanel(host, error);
      const pmap = new Map(products.map(p => [p.id, p])); const diffs = lines.filter(l => Number(l.counted_quantity) !== Number(pmap.get(l.product_id)?.stock_quantity));
      host.innerHTML = X.head(open.label, `${lines.length} produit(s) compté(s) sur ${products.filter(p => p.is_active !== false).length}. Scannez, saisissez la quantité réelle, puis appliquez.`, `<button class="btn light" type="button" id="invCancel">Annuler l’inventaire</button><button class="btn light" type="button" id="invManual"><i class="fa-solid fa-keyboard"></i> Saisie manuelle</button><button class="btn primary" type="button" id="invScan"><i class="fa-solid fa-barcode"></i> Scanner</button>`)
        + X.table(['Produit', 'Stock théorique', 'Compté', 'Écart'], lines.map(l => { const p = pmap.get(l.product_id); const d = Number(l.counted_quantity) - Number(p?.stock_quantity || 0); return `<tr data-line="${esc(l.product_id)}" class="ext-click"><td data-role="title">${esc(p?.name || '?')}</td><td data-role="meta">${num(p?.stock_quantity)}</td><td data-role="meta">${num(l.counted_quantity)}</td><td data-role="amount">${d === 0 ? '<span class="tone ok">0</span>' : `<span class="tone ${d < 0 ? 'bad' : 'warn'}">${d > 0 ? '+' : ''}${num(d)}</span>`}</td></tr>`; }), 'Scannez un premier produit.')
        + `<div class="actions ext-apply"><button class="btn primary" type="button" id="invApply" ${lines.length ? '' : 'disabled'}><i class="fa-solid fa-check"></i> Appliquer ${diffs.length} écart(s) au stock</button></div>`;
      const count = (p, current) => {
        const m = X.modal(p.name, `<p class="muted">Stock théorique : ${num(p.stock_quantity)}</p><label class="field">Quantité comptée<input name="q" type="number" min="0" step="0.001" inputmode="decimal" value="${current ?? ''}" required autofocus></label>`, `<button type="button" class="btn light" data-close>Annuler</button><button class="btn primary" type="submit">Enregistrer</button>`, { form: true });
        setTimeout(() => m.el.elements.q.focus(), 50);
        m.el.addEventListener('submit', async e => { e.preventDefault(); const { error } = await app.sb.from('inventory_lines').upsert({ session_id: open.id, product_id: p.id, counted_quantity: Number(m.el.elements.q.value), expected_quantity: Number(p.stock_quantity) }, { onConflict: 'session_id,product_id' }); if (error) return app.toast(X.explain(error), true); m.close(); EXT.pages.inventory.render(host, app); });
      };
      host.querySelector('#invScan').onclick = async () => { const code = await X.scan('Scanner pour l’inventaire'); if (!code) return; const p = await lookup(code); if (!p) return app.toast('Code inconnu : ' + code, true); count(p, lines.find(l => l.product_id === p.id)?.counted_quantity); };
      host.querySelector('#invManual').onclick = () => { const m = X.modal('Choisir un produit', `<label class="field">Produit<select name="p">${products.filter(p => p.is_active !== false).map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label>`, `<button type="button" class="btn light" data-close>Annuler</button><button class="btn primary" type="submit">Continuer</button>`, { form: true }); m.el.addEventListener('submit', e => { e.preventDefault(); const p = pmap.get(m.el.elements.p.value); m.close(); count(p, lines.find(l => l.product_id === p.id)?.counted_quantity); }); };
      host.querySelectorAll('[data-line]').forEach(tr => tr.onclick = () => { const p = pmap.get(tr.dataset.line); count(p, lines.find(l => l.product_id === p.id)?.counted_quantity); });
      host.querySelector('#invCancel').onclick = async () => { if (!confirm('Annuler cet inventaire ? Les comptages seront conservés dans l’historique mais pas appliqués.')) return; await app.sb.from('inventory_sessions').update({ status: 'cancelled' }).eq('id', open.id); EXT.pages.inventory.render(host, app); };
      host.querySelector('#invApply').onclick = async () => { if (!confirm(`Appliquer ${diffs.length} écart(s) ? Le stock de ces produits sera remplacé par la quantité comptée.`)) return; const { data, error } = await app.sb.rpc('apply_inventory', { p_session_id: open.id }); if (error) return app.toast(X.explain(error), true); scanCatalog = null; app.toast(`Inventaire appliqué : ${data} produit(s) corrigé(s).`); EXT.pages.inventory.render(host, app); };
    }
  };

  /* ---------- 15. Dépenses récurrentes & budget ---------- */
  EXT.config.recurring_expenses = {
    title: 'Charges fixes', desc: 'Loyer, électricité, gaz, salaires… créées automatiquement chaque mois.', table: 'recurring_expenses', search: ['label', 'payee'],
    fields: [['label', 'Libellé', 'text', true], ['amount', 'Montant (FCFA)', 'number', true], ['day_of_month', 'Jour du mois (1 à 28)', 'number', true], ['payment_method', 'Mode de paiement', 'select', ['cash', 'mtn_momo', 'airtel_money', 'bank_transfer', 'card', 'other']], ['payee', 'Bénéficiaire', 'text'], ['is_active', 'Active', 'checkbox'], ['notes', 'Notes', 'textarea']]
  };
  EXT.listViews.recurring_expenses = { cols: ['label', 'day_of_month', 'payee', 'is_active', 'amount'], title: 'label', amount: 'amount' };
  EXT.pages.budget = {
    title: 'Budget & charges fixes',
    async render(host, app) {
      X.loading(host);
      const ms = monthStart(), next = iso(new Date(new Date(ms).getFullYear(), new Date(ms).getMonth() + 1, 1)), day = new Date().getDate();
      let rec, budget, exp;
      try {
        rec = await X.load('recurring_expenses', '*', 'day_of_month', true);
        const [b, e] = await Promise.all([app.sb.from('expense_budgets').select('*').eq('month', ms).maybeSingle(), app.fetchAll(() => app.sb.from('expenses').select('id,amount,expense_date,description').gte('expense_date', ms).lt('expense_date', next))]);
        if (e.error) throw e.error; budget = b.data; exp = e.data;
      } catch (err) { return X.errorPanel(host, err); }
      const spent = exp.reduce((n, x) => n + Number(x.amount), 0), fixed = rec.filter(r => r.is_active).reduce((n, r) => n + Number(r.amount), 0);
      const due = rec.filter(r => r.is_active && (!r.last_generated_month || r.last_generated_month < ms) && r.day_of_month <= day);
      const target = budget ? Number(budget.amount) : 0, pct = target ? Math.round(spent / target * 100) : null;
      host.innerHTML = X.head('Budget & charges fixes', 'Fixez un budget mensuel et laissez l’application créer les dépenses qui reviennent chaque mois.', `<button class="btn light" type="button" id="bdSet"><i class="fa-solid fa-bullseye"></i> Budget du mois</button><button class="btn light" type="button" id="bdGen" ${due.length ? '' : 'disabled'}><i class="fa-solid fa-bolt"></i> Créer les dépenses dues (${due.length})</button><button class="btn primary" type="button" id="bdAdd"><i class="fa-solid fa-plus"></i> Charge fixe</button>`)
        + X.kpis([['fa-wallet', 'Dépensé ce mois', money(spent), `${exp.length} dépense(s)`, 'k-amber'], ['fa-bullseye', 'Budget du mois', target ? money(target) : 'Non défini', pct != null ? `${pct} % utilisé` : 'Cliquez sur « Budget du mois »', pct != null && pct > 100 ? 'k-pink' : 'k-green'], ['fa-repeat', 'Charges fixes / mois', money(fixed), `${rec.filter(r => r.is_active).length} active(s)`, 'k-blue'], ['fa-piggy-bank', 'Reste disponible', target ? money(target - spent) : '—', 'budget moins dépenses', 'k-green']])
        + (pct != null ? `<div class="card ext-budgetbar"><span class="ext-bar big ${pct > 100 ? 'bad' : pct > 85 ? 'warn' : 'ok'}"><i style="width:${Math.min(100, pct)}%"></i></span><small>${pct > 100 ? 'Budget dépassé de ' + money(spent - target) : 'Il reste ' + money(target - spent) + ' pour ce mois'}</small></div>` : '')
        + X.table(['Charge fixe', 'Jour', 'Montant', 'Ce mois-ci'], rec.map(r => `<tr data-id="${esc(r.id)}" class="ext-click"><td data-role="title">${esc(r.label)}${r.is_active ? '' : ' <small class="muted">(arrêtée)</small>'}</td><td data-role="meta">le ${r.day_of_month}</td><td data-role="amount">${money(r.amount)}</td><td data-role="meta">${r.last_generated_month && r.last_generated_month >= ms ? '<span class="tone ok">Créée</span>' : r.day_of_month <= day ? '<span class="tone warn">À créer</span>' : `<span class="tone neutral">le ${r.day_of_month}</span>`}</td></tr>`), 'Ajoutez vos charges fixes : loyer, électricité, gaz…');
      app.state.cache.recurring_expenses = rec;
      host.querySelector('#bdAdd').onclick = () => app.openForm('recurring_expenses', { day_of_month: 1, is_active: true, payment_method: 'cash' });
      host.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => app.openRecordDetail('recurring_expenses', tr.dataset.id, rec));
      host.querySelector('#bdSet').onclick = () => { const m = X.modal('Budget du mois', `<label class="field">Budget total des dépenses (FCFA)<input name="a" type="number" min="0" step="1000" value="${target || ''}" required></label>`, `<button type="button" class="btn light" data-close>Annuler</button><button class="btn primary" type="submit">Enregistrer</button>`, { form: true, sub: new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) }); m.el.addEventListener('submit', async e => { e.preventDefault(); const { error } = await app.sb.from('expense_budgets').upsert({ month: ms, amount: Number(m.el.elements.a.value) }, { onConflict: 'month' }); if (error) return app.toast(X.explain(error), true); m.close(); EXT.pages.budget.render(host, app); }); };
      host.querySelector('#bdGen').onclick = async () => {
        let ok = 0;
        for (const r of due) {
          const dt = iso(new Date(new Date(ms).getFullYear(), new Date(ms).getMonth(), r.day_of_month));
          const { error } = await app.sb.from('expenses').insert({ expense_number: `DEP-${ms.slice(0, 7).replace('-', '')}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`, expense_date: dt, description: r.label, amount: r.amount, payment_method: r.payment_method, payee: r.payee, notes: 'Charge fixe mensuelle' });
          if (error) { app.toast(`« ${r.label} » non créée : ${error.message}`, true); continue; }
          await app.sb.from('recurring_expenses').update({ last_generated_month: ms }).eq('id', r.id); ok++;
        }
        app.toast(`${ok} dépense(s) créée(s) dans Finances › Dépenses.`); EXT.pages.budget.render(host, app);
      };
    }
  };

  /* ---------- 16. Messages groupés (WhatsApp) ---------- */
  EXT.pages.messages = {
    title: 'Messages clients',
    async render(host, app) {
      X.loading(host);
      let d; try { d = await salesData(365); } catch (e) { return X.errorPanel(host, e); }
      let extra = []; const ext = await app.fetchAll(() => app.sb.from('customers').select('id,birth_date,price_tier')); if (!ext.error) extra = ext.data;
      const xmap = new Map(extra.map(c => [c.id, c])); const last = {}, paid = {};
      d.sales.forEach(s => { if (!s.customer_id) return; if (!last[s.customer_id] || s.sale_date > last[s.customer_id]) last[s.customer_id] = s.sale_date; paid[s.customer_id] = (paid[s.customer_id] || 0) + Number(s.amount_paid); });
      const withPhone = d.customers.filter(c => X.waNumber(c.phone));
      const bdaySoon = c => { const b = xmap.get(c.id)?.birth_date; if (!b) return false; const now = new Date(); for (let i = 0; i < 7; i++) { const x = addDays(now, i); if (x.getMonth() === new Date(b).getMonth() && x.getDate() === new Date(b).getDate()) return true; } return false; };
      const AUD = {
        all: ['Tous les clients avec un téléphone', withPhone],
        birthday: ['Anniversaires des 7 prochains jours', withPhone.filter(bdaySoon)],
        inactive: ['Clients sans achat depuis 60 jours', withPhone.filter(c => last[c.id] && daysBetween(last[c.id], today()) > 60)],
        best: ['20 meilleurs clients', [...withPhone].filter(c => paid[c.id]).sort((a, b) => paid[b.id] - paid[a.id]).slice(0, 20)],
        pro: ['Clients professionnels', withPhone.filter(c => xmap.get(c.id)?.price_tier === 'wholesale' || c.company_name)]
      };
      const TPL = { all: 'Bonjour {prenom} ! Les saveurs de Myra vous présentent leur nouveauté : … Commandez dès maintenant par retour de message. 🍲', birthday: 'Joyeux anniversaire {prenom} ! 🎉 Toute l’équipe des Saveurs de Myra vous offre -10 % sur votre prochaine commande cette semaine.', inactive: 'Bonjour {prenom}, vous nous manquez ! Pour votre retour, profitez de -10 % avec le code BIENVENUE10. Les saveurs de Myra', best: 'Bonjour {prenom}, merci pour votre fidélité ! En avant-première, découvrez … Les saveurs de Myra', pro: 'Bonjour {prenom}, Les saveurs de Myra vous proposent leurs tarifs professionnels pour … N’hésitez pas à nous répondre.' };
      host.innerHTML = X.head('Messages clients', 'Préparez un message personnalisé et envoyez-le un par un sur WhatsApp (WhatsApp n’autorise pas l’envoi automatique en masse sans service payant).')
        + `<section class="card ext-msg"><div class="form-grid"><label class="field">Destinataires<select id="msgAud">${Object.entries(AUD).map(([k, [l, list]]) => `<option value="${k}">${esc(l)} (${list.length})</option>`).join('')}</select></label><label class="field">Titre de la campagne<input id="msgTitle" value="Message du ${fdate(new Date())}"></label><label class="field full-span">Message <small class="muted">— {prenom} et {nom} sont remplacés automatiquement</small><textarea id="msgTpl" rows="4"></textarea></label></div><div class="actions"><button class="btn primary" type="button" id="msgGo"><i class="fa-brands fa-whatsapp"></i> Préparer l’envoi</button></div></section><div id="msgList"></div>`;
      const aud = host.querySelector('#msgAud'), tpl = host.querySelector('#msgTpl'); const setTpl = () => { tpl.value = TPL[aud.value]; }; aud.onchange = setTpl; setTpl();
      host.querySelector('#msgGo').onclick = async () => {
        const list = AUD[aud.value][1]; if (!list.length) return app.toast('Aucun destinataire dans ce groupe.', true);
        app.sb.from('message_campaigns').insert({ title: host.querySelector('#msgTitle').value, audience: AUD[aud.value][0], template: tpl.value, recipients: list.length }).then(() => {});
        const text = c => tpl.value.replaceAll('{prenom}', (c.full_name || '').split(' ')[0]).replaceAll('{nom}', c.full_name || '');
        host.querySelector('#msgList').innerHTML = `<div class="card"><div class="card-head"><h3>${list.length} message(s) à envoyer</h3><span id="msgDone">0 envoyé</span></div>${list.map(c => `<div class="m-row msg-row"><span class="m-txt"><b>${esc(c.full_name)}</b><small>${esc(text(c))}</small></span><a class="btn light sm" target="_blank" rel="noopener" href="https://wa.me/${X.waNumber(c.phone)}?text=${encodeURIComponent(text(c))}"><i class="fa-brands fa-whatsapp"></i> Envoyer</a></div>`).join('')}</div>`;
        let n = 0; host.querySelectorAll('#msgList a').forEach(a => a.addEventListener('click', () => { if (a.classList.contains('sent')) return; a.classList.add('sent'); a.innerHTML = '<i class="fa-solid fa-check"></i> Envoyé'; host.querySelector('#msgDone').textContent = `${++n} envoyé(s)`; }));
      };
    }
  };
  /* Tableau de bord : anniversaires de la semaine */
  X.on('dashboard', async slot => {
    if (!slot) return;
    const app = A(); const { data } = await app.sb.from('customers').select('full_name,birth_date').not('birth_date', 'is', null); if (!data?.length) return;
    const now = new Date(); const soon = data.filter(c => { for (let i = 0; i < 7; i++) { const x = addDays(now, i), b = new Date(c.birth_date); if (x.getMonth() === b.getMonth() && x.getDate() === b.getDate()) return true; } return false; });
    if (!soon.length) return;
    const el = document.createElement('button'); el.type = 'button'; el.className = 'ext-alert info';
    el.innerHTML = `<i class="fa-solid fa-cake-candles" aria-hidden="true"></i><span><b>${soon.length} anniversaire${soon.length > 1 ? 's' : ''} cette semaine</b><small>${esc(soon.slice(0, 3).map(c => c.full_name).join(', '))}${soon.length > 3 ? '…' : ''}</small></span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i>`;
    el.onclick = () => app.navigate('messages'); slot.append(el);
  });
})();
