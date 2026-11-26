/* Myra V30 — 10. Rapport mensuel · 11. Objectifs de l'entreprise · 12. Comparaison des lieux de vente */
(() => {
  const X = window.MyraX, { EXT, A, esc, money, num, fdate, today, iso, monthStart, addDays, daysBetween } = X;
  X.menu('PILOTAGE', [['report', 'Rapport du mois', 'fa-file-lines'], ['goals', 'Objectifs', 'fa-bullseye'], ['sales_by_location', 'Ventes par lieu', 'fa-store']]);
  const mStart = d => iso(new Date(new Date(d).getFullYear(), new Date(d).getMonth(), 1));
  const mNext = d => iso(new Date(new Date(d).getFullYear(), new Date(d).getMonth() + 1, 1));
  const mPrev = d => iso(new Date(new Date(d).getFullYear(), new Date(d).getMonth() - 1, 1));
  const mLabel = d => new Date(d).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const pct = (a, b) => b ? Math.round((a - b) / b * 100) : null;
  const delta = (a, b) => { const p = pct(a, b); return p == null ? '' : `<span class="tone ${p >= 0 ? 'ok' : 'bad'}">${p >= 0 ? '+' : ''}${p} %</span>`; };
  const monthOptions = sel => Array.from({ length: 12 }, (_, i) => { const d = new Date(); const m = iso(new Date(d.getFullYear(), d.getMonth() - i, 1)); return `<option value="${m}" ${m === sel ? 'selected' : ''}>${mLabel(m)}</option>`; }).join('');
  const VALID = ['confirmed', 'partially_paid', 'paid'];

  /* ---------- 10. Rapport du mois ---------- */
  async function monthData(app, month) {
    const from = mPrev(month), to = mNext(month);
    const [sales, items, pays, exps, custs, prods] = await Promise.all([
      app.fetchAll(() => app.sb.from('sales').select('id,sale_date,status,customer_id,total,amount_paid,location_id').gte('sale_date', from).lt('sale_date', to).in('status', VALID)),
      app.fetchAll(() => app.sb.from('sale_items').select('product_id,quantity,line_total,sales!inner(sale_date,status)').gte('sales.sale_date', month).lt('sales.sale_date', to).in('sales.status', VALID)),
      app.fetchAll(() => app.sb.from('payments').select('amount,direction,payment_date').gte('payment_date', from).lt('payment_date', to)),
      app.fetchAll(() => app.sb.from('expenses').select('amount,expense_date,description').gte('expense_date', from).lt('expense_date', to)),
      app.fetchAll(() => app.sb.from('customers').select('id,full_name,phone,created_at')),
      app.fetchAll(() => app.sb.from('products').select('id,name,cost_price,sale_price'))
    ]);
    for (const r of [sales, items, pays, exps, custs, prods]) if (r.error) throw r.error;
    const inM = (d, m) => d >= m && d < mNext(m);
    const S = m => { const s = sales.data.filter(x => inM(x.sale_date, m)); const ca = s.reduce((n, x) => n + Number(x.total), 0); const p = pays.data.filter(x => x.direction === 'incoming' && inM(x.payment_date, m)).reduce((n, x) => n + Number(x.amount), 0); const e = exps.data.filter(x => x.expense_date && inM(x.expense_date, m)).reduce((n, x) => n + Number(x.amount), 0); const nc = custs.data.filter(c => c.created_at && inM(c.created_at, m)).length; return { count: s.length, ca, cashIn: p, expenses: e, avg: s.length ? ca / s.length : 0, newCustomers: nc, buyers: new Set(s.map(x => x.customer_id).filter(Boolean)).size }; };
    const pm = new Map(prods.data.map(p => [p.id, p])); const agg = {};
    items.data.forEach(i => { const a = agg[i.product_id] = agg[i.product_id] || { q: 0, ca: 0, cost: 0, known: true }; const p = pm.get(i.product_id); a.q += Number(i.quantity); a.ca += Number(i.line_total); if (p?.cost_price > 0) a.cost += Number(p.cost_price) * Number(i.quantity); else a.known = false; });
    const top = Object.entries(agg).map(([id, a]) => ({ name: pm.get(id)?.name || 'Produit', ...a, margin: a.known ? a.ca - a.cost : null })).sort((a, b) => b.ca - a.ca);
    const cust = {}; sales.data.filter(x => inM(x.sale_date, month) && x.customer_id).forEach(x => { cust[x.customer_id] = (cust[x.customer_id] || 0) + Number(x.total); });
    const cmap = new Map(custs.data.map(c => [c.id, c]));
    const topCust = Object.entries(cust).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, v]) => ({ name: cmap.get(id)?.full_name || 'Client', v }));
    const dues = {}; sales.data.filter(x => ['confirmed', 'partially_paid'].includes(x.status) && x.customer_id && Number(x.total) > Number(x.amount_paid)).forEach(x => { dues[x.customer_id] = (dues[x.customer_id] || 0) + Number(x.total) - Number(x.amount_paid); });
    const knownMargin = top.filter(t => t.margin != null);
    return { cur: S(month), prev: S(from), top, topCust, dues: Object.entries(dues).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, v]) => ({ name: cmap.get(id)?.full_name, v })), margin: knownMargin.reduce((n, t) => n + t.margin, 0), marginCoverage: top.length ? knownMargin.length / top.length : 0 };
  }
  EXT.pages.report = {
    title: 'Rapport du mois',
    async render(host, app, month = mPrev(monthStart())) {
      X.loading(host, 'Préparation du rapport…');
      let d; try { d = await monthData(app, month); } catch (e) { return X.errorPanel(host, e); }
      const c = d.cur, p = d.prev; let aiText = '';
      const body = () => `${X.kpis([['fa-sack-dollar', 'Chiffre d’affaires', money(c.ca), `${delta(c.ca, p.ca)} vs ${mLabel(mPrev(month))}`, 'k-green'], ['fa-money-bill-wave', 'Encaissé', money(c.cashIn), delta(c.cashIn, p.cashIn), 'k-blue'], ['fa-receipt', 'Ventes', String(c.count), `panier moyen ${money(c.avg)}`, 'k-amber'], ['fa-user-plus', 'Nouveaux clients', String(c.newCustomers), `${c.buyers} client(s) ont acheté`, 'k-pink']])}
        ${X.kpis([['fa-wallet', 'Dépenses', money(c.expenses), delta(c.expenses, p.expenses), 'k-amber'], ['fa-scale-balanced', 'Encaissé − dépenses', money(c.cashIn - c.expenses), 'résultat de trésorerie', c.cashIn - c.expenses >= 0 ? 'k-green' : 'k-pink'], ['fa-chart-pie', 'Marge sur les produits', d.marginCoverage ? money(d.margin) : '—', d.marginCoverage < 1 ? `coût de revient connu pour ${Math.round(d.marginCoverage * 100)} % des produits vendus` : 'prix de vente − coût de revient', 'k-blue']])}
        <div class="ext-cards"><section class="card"><div class="card-head"><h3>Produits du mois</h3></div>${d.top.slice(0, 8).map(t => `<div class="m-row"><span class="m-txt"><b>${esc(t.name)}</b><small>${num(t.q)} vendus${t.margin != null ? ` · marge ${money(t.margin)}` : ''}</small></span><b>${money(t.ca)}</b></div>`).join('') || '<p class="muted">Aucune vente.</p>'}</section>
        <section class="card"><div class="card-head"><h3>Meilleurs clients</h3></div>${d.topCust.map(t => `<div class="m-row"><span class="m-txt"><b>${esc(t.name)}</b></span><b>${money(t.v)}</b></div>`).join('') || '<p class="muted">—</p>'}</section>
        <section class="card"><div class="card-head"><h3>À relancer</h3></div>${d.dues.map(t => `<div class="m-row"><span class="m-txt"><b>${esc(t.name)}</b><small>reste à payer</small></span><b>${money(t.v)}</b></div>`).join('') || '<p class="muted">Aucun impayé.</p>'}</section></div>
        <section class="card" id="rpAi">${aiText ? `<div class="card-head"><h3>Analyse de l’assistant</h3></div><p style="white-space:pre-line">${esc(aiText)}</p>` : ''}</section>`;
      const draw = () => {
        host.innerHTML = X.head('Rapport du mois', 'Le bilan d’un mois en une page, comparé au mois précédent. À imprimer ou enregistrer en PDF pour votre comptable.', `<select class="ext-month" id="rpMonth" aria-label="Mois">${monthOptions(month)}</select><button class="btn light" type="button" id="rpAiBtn"><i class="fa-solid fa-wand-magic-sparkles"></i> Analyse de l’assistant</button><button class="btn primary" type="button" id="rpPrint"><i class="fa-solid fa-print"></i> PDF</button>`)
          + `<h3 class="ext-title">${esc(mLabel(month))}</h3>` + body();
        host.querySelector('#rpMonth').onchange = e => EXT.pages.report.render(host, app, e.target.value);
        host.querySelector('#rpPrint').onclick = () => X.printDoc({ title: 'Rapport ' + mLabel(month), kicker: 'Rapport du mois', subtitle: mLabel(month),
          sections: [
            { title: 'Chiffres clés', table: { head: ['Indicateur', mLabel(month), mLabel(mPrev(month))], align: ['', 'r', 'r'], rows: [['Chiffre d’affaires', money(c.ca), money(p.ca)], ['Encaissé', money(c.cashIn), money(p.cashIn)], ['Nombre de ventes', String(c.count), String(p.count)], ['Panier moyen', money(c.avg), money(p.avg)], ['Nouveaux clients', String(c.newCustomers), String(p.newCustomers)], ['Dépenses', money(c.expenses), money(p.expenses)], ['Encaissé − dépenses', money(c.cashIn - c.expenses), money(p.cashIn - p.expenses)]] } },
            { title: 'Produits', table: { head: ['Produit', 'Quantité', 'Chiffre', 'Marge'], align: ['', 'r', 'r', 'r'], rows: d.top.map(t => [t.name, num(t.q), money(t.ca), t.margin != null ? money(t.margin) : '—']) } },
            { title: 'Meilleurs clients', rows: d.topCust.map(t => [t.name, money(t.v)]) },
            ...(aiText ? [{ title: 'Analyse', text: aiText }] : [])],
          pill: 'Chiffre d’affaires · ' + money(c.ca), status: [c.ca >= p.ca ? 'En hausse par rapport au mois précédent' : 'En baisse par rapport au mois précédent', c.ca >= p.ca ? 'ok' : 'warn'] });
        host.querySelector('#rpAiBtn').onclick = async () => {
          const box = host.querySelector('#rpAi'); box.innerHTML = '<p class="muted"><i class="fa-solid fa-circle-notch fa-spin"></i> L’assistant rédige l’analyse…</p>';
          const ctx = { mois: mLabel(month), mois_precedent: mLabel(mPrev(month)), ce_mois: c, mois_precedent_chiffres: p, produits: d.top.slice(0, 15), meilleurs_clients: d.topCust, impayes: d.dues };
          const { data, error } = await app.sb.functions.invoke('myra-assistant', { body: { question: 'Rédige une analyse courte (6 à 8 lignes) de ce mois pour la gérante : ce qui va bien, ce qui baisse, et 2 ou 3 actions concrètes pour le mois prochain.', context: ctx } });
          if (error || data?.error) { box.innerHTML = `<p class="muted">${esc(data?.error || 'Assistant indisponible pour le moment.')}</p>`; return; }
          aiText = data.answer || ''; box.innerHTML = `<div class="card-head"><h3>Analyse de l’assistant</h3></div><p style="white-space:pre-line">${esc(aiText)}</p>`;
        };
      };
      draw();
    }
  };
  /* Du 1er au 5 du mois : rappel que le rapport du mois précédent est prêt */
  X.on('dashboard', slot => {
    if (!slot || new Date().getDate() > 5) return;
    const el = document.createElement('button'); el.type = 'button'; el.className = 'ext-alert info';
    el.innerHTML = `<i class="fa-solid fa-file-lines" aria-hidden="true"></i><span><b>Le rapport de ${esc(mLabel(mPrev(monthStart())))} est prêt</b><small>Bilan, comparaison et analyse de l’assistant</small></span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i>`;
    el.onclick = () => A().navigate('report'); slot.append(el);
  });

  /* ---------- 11. Objectifs ---------- */
  async function goalProgress(app, month) {
    const [g, s, c] = await Promise.all([app.sb.from('business_goals').select('*').eq('month', month).maybeSingle(), app.fetchAll(() => app.sb.from('sales').select('total').gte('sale_date', month).lt('sale_date', mNext(month)).in('status', VALID)), app.sb.from('customers').select('id', { count: 'exact', head: true }).gte('created_at', month).lt('created_at', mNext(month))]);
    if (g.error) throw g.error;
    return { goal: g.data, ca: (s.data || []).reduce((n, x) => n + Number(x.total), 0), newCustomers: c.count || 0 };
  }
  const bar = (v, t) => { const p = t ? Math.min(100, Math.round(v / t * 100)) : 0; return `<span class="ext-bar big ${p >= 100 ? 'ok' : ''}"><i style="width:${p}%"></i></span><small>${t ? p + ' %' : 'pas d’objectif'}</small>`; };
  EXT.pages.goals = {
    title: 'Objectifs',
    async render(host, app, month = monthStart()) {
      X.loading(host);
      let g; try { g = await goalProgress(app, month); } catch (e) { return X.errorPanel(host, e); }
      const t = g.goal || {}; const day = new Date().getDate(), days = new Date(new Date(month).getFullYear(), new Date(month).getMonth() + 1, 0).getDate();
      const isCur = month === monthStart(); const expected = isCur && t.sales_target ? t.sales_target * day / days : null;
      host.innerHTML = X.head('Objectifs', 'Fixez le chiffre d’affaires et le nombre de nouveaux clients visés pour le mois ; la progression s’affiche sur le tableau de bord.', `<select class="ext-month" id="glMonth" aria-label="Mois">${Array.from({ length: 6 }, (_, i) => { const d = new Date(); const m = iso(new Date(d.getFullYear(), d.getMonth() + 1 - i, 1)); return `<option value="${m}" ${m === month ? 'selected' : ''}>${mLabel(m)}</option>`; }).join('')}</select>`)
        + `<form class="card ext-form" id="glForm"><div class="form-grid"><label class="field">Chiffre d’affaires visé (FCFA)<input name="sales_target" type="number" min="0" step="10000" value="${esc(t.sales_target || '')}"></label><label class="field">Nouveaux clients visés<input name="new_customers_target" type="number" min="0" value="${esc(t.new_customers_target || '')}"></label><label class="field full-span">Note<input name="notes" value="${esc(t.notes || '')}" placeholder="Ex. fête des mères, lancement du bissap"></label></div><div class="actions" style="margin-top:12px"><button class="btn primary" type="submit">Enregistrer l’objectif</button></div></form>`
        + `<div class="ext-cards"><section class="card"><div class="card-head"><h3>Chiffre d’affaires</h3></div><div class="ext-big">${money(g.ca)}</div><small class="muted">sur ${money(t.sales_target || 0)}${expected ? ` · à ce jour il faudrait ${money(expected)}` : ''}</small><div class="ext-goal">${bar(g.ca, t.sales_target)}</div></section><section class="card"><div class="card-head"><h3>Nouveaux clients</h3></div><div class="ext-big">${g.newCustomers}</div><small class="muted">sur ${t.new_customers_target || 0}</small><div class="ext-goal">${bar(g.newCustomers, t.new_customers_target)}</div></section></div>`;
      host.querySelector('#glMonth').onchange = e => EXT.pages.goals.render(host, app, e.target.value);
      host.querySelector('#glForm').addEventListener('submit', async e => { e.preventDefault(); const f = e.target.elements; const { error } = await app.sb.from('business_goals').upsert({ month, sales_target: Number(f.sales_target.value) || 0, new_customers_target: Number(f.new_customers_target.value) || 0, notes: f.notes.value || null }, { onConflict: 'month' }); if (error) return app.toast(X.explain(error), true); app.toast('Objectif enregistré.'); EXT.pages.goals.render(host, app, month); });
    }
  };
  X.on('dashboard', async slot => {
    if (!slot) return;
    try {
      const g = await goalProgress(A(), monthStart()); if (!g.goal?.sales_target) return;
      const p = Math.min(100, Math.round(g.ca / g.goal.sales_target * 100));
      const el = document.createElement('button'); el.type = 'button'; el.className = 'ext-alert goal';
      el.innerHTML = `<i class="fa-solid fa-bullseye" aria-hidden="true"></i><span><b>Objectif du mois : ${p} %</b><small>${money(g.ca)} sur ${money(g.goal.sales_target)}${g.goal.new_customers_target ? ` · ${g.newCustomers}/${g.goal.new_customers_target} nouveaux clients` : ''}</small><span class="ext-bar big ${p >= 100 ? 'ok' : ''}"><i style="width:${p}%"></i></span></span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i>`;
      el.onclick = () => A().navigate('goals'); slot.prepend(el);
    } catch (_) { /* module non activé */ }
  });

  /* ---------- 12. Lieu de vente : choix dans la vente + comparaison ---------- */
  X.on('saleForm', async ctx => {
    if (!X.isReady()) return;
    let locs = []; try { locs = (await X.load('stock_locations', 'id,name,is_active', 'name', true)).filter(l => l.is_active); } catch (_) { return; }
    if (!locs.length) return;
    let saved = ''; try { saved = localStorage.getItem('myra_sale_location') || ''; } catch (_) {}
    const wrap = document.createElement('label'); wrap.className = 'field';
    wrap.innerHTML = `Lieu de vente<select name="location_id"><option value="">Non précisé</option>${locs.map(l => `<option value="${X.esc(l.id)}" ${l.id === saved ? 'selected' : ''}>${X.esc(l.name)}</option>`).join('')}</select>`;
    ctx.form.elements.sale_date.closest('label').after(wrap);
    wrap.querySelector('select').addEventListener('change', e => { try { localStorage.setItem('myra_sale_location', e.target.value); } catch (_) {} });
  });
  X.on('saleDraftCreated', async (ctx, sale) => {
    const loc = ctx.form.elements.location_id?.value; if (!loc) return;
    const { error } = await A().sb.from('sales').update({ location_id: loc }).eq('id', sale.sale_id);
    if (error) A().toast('Lieu de vente non enregistré : ' + error.message, true);
  });
  EXT.pages.sales_by_location = {
    title: 'Ventes par lieu',
    async render(host, app) {
      X.loading(host);
      const from = iso(new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1));
      let locs, sales;
      try { locs = await X.load('stock_locations', 'id,name', 'name', true); const r = await app.fetchAll(() => app.sb.from('sales').select('total,sale_date,location_id').gte('sale_date', from).in('status', VALID)); if (r.error) throw r.error; sales = r.data; } catch (e) { return X.errorPanel(host, e); }
      const months = Array.from({ length: 6 }, (_, i) => iso(new Date(new Date().getFullYear(), new Date().getMonth() - 5 + i, 1)));
      const cols = [...locs.map(l => [l.id, l.name]), ['', 'Non précisé']];
      const sum = (lid, m) => sales.filter(s => (s.location_id || '') === lid && s.sale_date >= m && s.sale_date < mNext(m)).reduce((n, s) => n + Number(s.total), 0);
      const cur = months[5], curTotal = cols.reduce((n, [id]) => n + sum(id, cur), 0);
      host.innerHTML = X.head('Ventes par lieu', 'Comparez ce que rapporte chaque lieu (boutique, marché…). Le lieu se choisit dans le formulaire de vente et reste mémorisé sur chaque appareil.', `<button class="btn light" type="button" id="slLocs"><i class="fa-solid fa-location-dot"></i> Gérer les lieux</button>`)
        + `<section class="card"><div class="card-head"><h3>${esc(mLabel(cur))}</h3><span>${money(curTotal)}</span></div>${cols.map(([id, name]) => { const v = sum(id, cur); const p = curTotal ? Math.round(v / curTotal * 100) : 0; return `<div class="m-row"><span class="m-txt"><b>${esc(name)}</b><span class="ext-bar big"><i style="width:${p}%"></i></span></span><b>${money(v)}</b><small class="muted">&nbsp;${p} %</small></div>`; }).join('')}</section>`
        + X.table(['Lieu', ...months.map(m => new Date(m).toLocaleDateString('fr-FR', { month: 'short' }))], cols.map(([id, name]) => `<tr><td data-role="title">${esc(name)}</td>${months.map(m => `<td data-role="meta" class="r" data-label="${new Date(m).toLocaleDateString('fr-FR', { month: 'short' })}">${money(sum(id, m))}</td>`).join('')}</tr>`)).replace('ext-table', 'ext-table ext-matrix');
      host.querySelector('#slLocs').onclick = () => app.navigate('stock_locations');
    }
  };
})();
