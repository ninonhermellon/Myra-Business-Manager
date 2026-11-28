/* LSM Business Manager V41 — Trésorerie complète, bénéfice réel du mois, sauvegardes automatiques */
(() => {
  const X = window.MyraX, { EXT, A, esc, money } = X;
  const TYPE = { cash: ['Espèces', 'fa-money-bill-wave', 'i-green'], mobile_money: ['Mobile Money', 'fa-mobile-screen', 'i-amber'], bank: ['Banque', 'fa-building-columns', 'i-blue'] };
  const SRC = { payment: 'Encaissement de vente', expense: 'Dépense', payment_out: 'Paiement fournisseur', refund: 'Remboursement client', contribution: 'Apport', withdrawal: 'Retrait', transfer: 'Transfert', adjustment: 'Rapprochement', sale: 'Vente' };
  const role = () => A()?.state?.profile?.role;
  const canMove = () => ['owner', 'admin', 'accountant'].includes(role());
  const isBoss = () => ['owner', 'admin'].includes(role());
  const sign = n => (n < 0 ? '− ' : '') + money(Math.abs(n));
  const monthName = m => new Date(m + '-15').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  X.menu('SUIVI FINANCIER', [['treasury', 'Trésorerie', 'fa-vault'], ['profit', 'Bénéfice réel', 'fa-chart-pie']]);
  X.menu('ADMINISTRATION', [['backups', 'Sauvegardes', 'fa-cloud-arrow-up']]);

  /* ---------- Trésorerie ---------- */
  EXT.pages.treasury = {
    title: 'Trésorerie',
    async render(host, app) {
      const st = { account: '', days: 30, type: '' };
      host.innerHTML = X.head('Trésorerie', 'Vos comptes (espèces, MTN MoMo, banque), les apports, retraits, transferts et le rapprochement avec l’argent réellement présent.',
        (canMove() ? '<button type="button" class="btn light" id="trMove"><i class="fa-solid fa-right-left"></i> Apport, retrait, transfert</button>' : '') + (isBoss() ? '<button type="button" class="btn primary" id="trNew"><i class="fa-solid fa-plus"></i> Nouveau compte</button>' : ''))
        + '<div id="trKpis"></div><div class="tr-accounts" id="trAccounts"></div>'
        + `<section class="card"><div class="card-head"><h3><i class="fa-solid fa-list"></i> Mouvements</h3><button type="button" class="btn light sm" id="trCsv"><i class="fa-solid fa-file-csv"></i> CSV</button></div>
            <div class="tm-tools"><select id="trAcc" aria-label="Compte"><option value="">Tous les comptes</option></select>
            <select id="trDays" aria-label="Période"><option value="7">7 jours</option><option value="30" selected>30 jours</option><option value="90">90 jours</option><option value="365">12 mois</option></select>
            <select id="trType" aria-label="Type"><option value="">Tous les types</option>${Object.entries(SRC).filter(([k]) => k !== 'sale').map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></div>
            <div id="trList"></div></section>`;
      let accounts = [], tx = [];
      async function loadAccounts() {
        const { data, error } = await app.sb.from('cash_accounts').select('*').order('created_at');
        if (error) return X.errorPanel(host.querySelector('#trAccounts'), error);
        accounts = data || []; const act = accounts.filter(a => a.is_active);
        const total = act.reduce((n, a) => n + Number(a.current_balance || 0), 0);
        host.querySelector('#trKpis').innerHTML = X.kpis([['fa-vault', 'Trésorerie totale', sign(total), act.length + ' compte(s) actif(s)', total < 0 ? 'k-pink' : 'k-green'],
          ...act.slice(0, 3).map(a => [(TYPE[a.account_type] || TYPE.cash)[1], a.name, sign(Number(a.current_balance)), (TYPE[a.account_type] || TYPE.cash)[0], Number(a.current_balance) < 0 ? 'k-pink' : 'k-blue'])]);
        host.querySelector('#trAccounts').innerHTML = accounts.map(a => { const t = TYPE[a.account_type] || TYPE.cash; const bal = Number(a.current_balance || 0);
          return `<article class="card tr-acc ${a.is_active ? '' : 'off'}" data-id="${a.id}"><div class="tr-acc-h"><span class="m-ico ${t[2]}"><i class="fa-solid ${t[1]}"></i></span><span><b>${esc(a.name)}</b><small>${esc(t[0])}${a.provider ? ' · ' + esc(a.provider) : ''}</small></span>${a.is_active ? '' : '<span class="tm-state off">Inactif</span>'}</div>
            <p class="tr-bal ${bal < 0 ? 'neg' : ''}">${sign(bal)}</p>${bal < 0 ? '<p class="muted small">Solde négatif : enregistrez un apport ou faites un rapprochement.</p>' : ''}
            <div class="actions">${a.is_active && canMove() ? `<button type="button" class="btn light sm" data-act="contribution">Apport</button><button type="button" class="btn light sm" data-act="withdrawal">Retrait</button><button type="button" class="btn light sm" data-act="transfer">Transfert</button><button type="button" class="btn primary sm" data-act="reconcile">Rapprocher</button>` : ''}${isBoss() ? `<button type="button" class="btn light sm" data-toggle>${a.is_active ? 'Désactiver' : 'Activer'}</button>` : ''}</div></article>`; }).join('');
        const sel = host.querySelector('#trAcc'); const cur = sel.value; sel.innerHTML = '<option value="">Tous les comptes</option>' + accounts.map(a => `<option value="${a.id}" ${a.id === cur ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
        host.querySelectorAll('.tr-acc').forEach(el => { const a = accounts.find(x => x.id === el.dataset.id);
          el.querySelectorAll('[data-act]').forEach(b => b.onclick = () => b.dataset.act === 'reconcile' ? reconcile(a) : move(b.dataset.act, a));
          el.querySelector('[data-toggle]')?.addEventListener('click', async () => { const { error } = await app.sb.from('cash_accounts').update({ is_active: !a.is_active }).eq('id', a.id); if (error) return app.toast(X.explain(error), true); app.toast(a.is_active ? 'Compte désactivé.' : 'Compte activé : les paiements de ce type y arriveront désormais.'); loadAccounts(); });
        });
      }
      async function loadTx() {
        const box = host.querySelector('#trList'); X.loading(box);
        let q = app.sb.from('cash_transactions').select('*').gte('transaction_date', new Date(Date.now() - st.days * 864e5).toISOString()).order('transaction_date', { ascending: false }).limit(500);
        if (st.account) q = q.eq('cash_account_id', st.account); if (st.type) q = q.eq('source_type', st.type);
        const { data, error } = await q; if (error) return X.errorPanel(box, error);
        tx = data || []; const inn = tx.filter(t => t.direction === 'in').reduce((n, t) => n + Number(t.amount), 0), out = tx.filter(t => t.direction === 'out').reduce((n, t) => n + Number(t.amount), 0);
        box.innerHTML = `<div class="tr-sum"><span class="txt-ok">Entrées ${money(inn)}</span><span class="txt-bad">Sorties ${money(out)}</span><b>Solde de la période ${sign(inn - out)}</b></div>`
          + (tx.length ? tx.map(t => { const a = accounts.find(x => x.id === t.cash_account_id); const cancel = isBoss() && ['contribution', 'withdrawal', 'transfer', 'adjustment'].includes(t.source_type);
            return `<div class="ac-row"><span class="ac-ico ${t.direction === 'in' ? 'ok' : 'bad'}"><i class="fa-solid ${t.direction === 'in' ? 'fa-arrow-down' : 'fa-arrow-up'}"></i></span><div class="ac-body"><div><b>${esc(SRC[t.source_type] || t.source_type || 'Mouvement')}</b> · ${esc(a?.name || '')}</div><small class="muted">${esc(t.description || '')}</small></div>
              <span class="tr-amt ${t.direction === 'in' ? 'txt-ok' : 'txt-bad'}">${t.direction === 'in' ? '+' : '−'} ${money(t.amount)}</span><time>${new Date(t.transaction_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</time>${cancel ? `<button type="button" class="btn light sm" data-cancel="${t.source_id}" title="Annuler ce mouvement" aria-label="Annuler"><i class="fa-solid fa-rotate-left"></i></button>` : ''}</div>`; }).join('')
            : '<p class="muted">Aucun mouvement sur cette période.</p>');
        box.querySelectorAll('[data-cancel]').forEach(b => b.onclick = async () => { if (!confirm('Annuler ce mouvement ? Les soldes seront corrigés.')) return; const { error: e } = await app.sb.rpc('cancel_cash_movement', { p_source: b.dataset.cancel }); if (e) return app.toast(X.explain(e), true); app.toast('Mouvement annulé.'); refresh(); });
      }
      function move(kind, acc) {
        const act = accounts.filter(a => a.is_active); const opts = sel => act.map(a => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)} (${sign(Number(a.current_balance))})</option>`).join('');
        const T = { contribution: ['Apport', 'Argent que vous mettez dans l’activité (fonds de départ, apport personnel…)'], withdrawal: ['Retrait', 'Argent que vous sortez pour vous (rémunération du propriétaire, prélèvement…)'], transfer: ['Transfert', 'Déplacer de l’argent d’un compte à l’autre (ex. dépôt des espèces sur MoMo)'] };
        const m = X.modal('Mouvement de trésorerie', `<div class="form-grid"><label class="field full-span">Opération<select name="kind">${Object.entries(T).map(([k, v]) => `<option value="${k}" ${k === kind ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></label>
            <p class="muted small full-span" id="mvHelp"></p>
            <label class="field">Compte<select name="account">${opts(acc?.id)}</select></label><label class="field" id="mvTo">Vers le compte<select name="to">${opts(act.find(a => a.id !== acc?.id)?.id)}</select></label>
            <label class="field">Montant (FCFA)<input name="amount" type="number" min="1" step="1" required inputmode="numeric"></label><label class="field">Date<input name="date" type="date" value="${X.today()}" max="${X.today()}"></label>
            <label class="field full-span">Motif<input name="note" maxlength="200" placeholder="Ex. : fonds de caisse de départ"></label></div>`, '<button type="button" class="btn light" data-close>Annuler</button><button class="btn primary" type="submit">Enregistrer</button>', { form: true });
        const f = m.el.elements; const sync = () => { m.el.querySelector('#mvHelp').textContent = T[f.kind.value][1]; m.el.querySelector('#mvTo').hidden = f.kind.value !== 'transfer'; }; f.kind.onchange = sync; sync();
        m.el.onsubmit = async e => { e.preventDefault();
          const { error } = await app.sb.rpc('cash_movement', { p_kind: f.kind.value, p_account: f.account.value, p_amount: Number(f.amount.value), p_note: f.note.value || null, p_to_account: f.kind.value === 'transfer' ? f.to.value : null, p_date: f.date.value ? new Date(f.date.value + 'T12:00:00').toISOString() : null });
          if (error) return app.toast(X.explain(error), true); m.close(); app.toast(T[f.kind.value][0] + ' enregistré.'); refresh(); };
      }
      function reconcile(a) {
        const m = X.modal('Rapprochement · ' + a.name, `<p>Solde dans l’application : <b>${sign(Number(a.current_balance))}</b></p><label class="field">${a.account_type === 'mobile_money' ? 'Solde affiché par MTN (relevé ou *105#)' : a.account_type === 'bank' ? 'Solde du relevé bancaire' : 'Argent compté dans la caisse'} (FCFA)<input name="actual" type="number" step="1" required inputmode="numeric"></label>
          <label class="field">Remarque<input name="note" maxlength="300" placeholder="Ex. : comptage du soir, relevé MTN du 28/11"></label><p class="muted small" id="rcDiff"></p>`, '<button type="button" class="btn light" data-close>Annuler</button><button class="btn primary" type="submit">Mettre le solde à jour</button>', { form: true, sub: 'L’écart est enregistré comme ajustement, visible dans les mouvements.' });
        m.el.elements.actual.oninput = e => { const d = Number(e.target.value || 0) - Number(a.current_balance); m.el.querySelector('#rcDiff').textContent = e.target.value === '' ? '' : Math.abs(d) < 1 ? 'Le solde correspond : aucun écart.' : `Écart : ${d > 0 ? '+' : '−'} ${money(Math.abs(d))}`; };
        m.el.onsubmit = async e => { e.preventDefault(); const { data, error } = await app.sb.rpc('reconcile_cash_account', { p_account: a.id, p_actual: Number(m.el.elements.actual.value), p_note: m.el.elements.note.value || null });
          if (error) return app.toast(X.explain(error), true); m.close(); app.toast(Math.abs(Number(data.difference)) < 1 ? 'Rapprochement : aucun écart.' : `Solde corrigé (écart ${sign(Number(data.difference))}).`); refresh(); };
      }
      host.querySelector('#trNew')?.addEventListener('click', () => {
        const m = X.modal('Nouveau compte', `<div class="form-grid"><label class="field full-span">Nom<input name="name" required maxlength="80" placeholder="Ex. : Caisse marché Total"></label><label class="field">Type<select name="type"><option value="cash">Espèces</option><option value="mobile_money">Mobile Money</option><option value="bank">Banque</option></select></label><label class="field">Opérateur / banque<input name="provider" maxlength="60" placeholder="MTN, Airtel, BGFI…"></label></div>`, '<button type="button" class="btn light" data-close>Annuler</button><button class="btn primary" type="submit">Créer</button>', { form: true });
        m.el.onsubmit = async e => { e.preventDefault(); const f = m.el.elements; const { error } = await app.sb.from('cash_accounts').insert({ name: f.name.value.trim(), account_type: f.type.value, provider: f.provider.value.trim() || null, opening_balance: 0, current_balance: 0, is_active: true }); if (error) return app.toast(X.explain(error), true); m.close(); app.toast('Compte créé. Utilisez « Apport » pour y mettre son solde de départ.'); refresh(); };
      });
      host.querySelector('#trMove')?.addEventListener('click', () => move('contribution', accounts.find(a => a.is_active)));
      host.querySelector('#trAcc').onchange = e => { st.account = e.target.value; loadTx(); };
      host.querySelector('#trDays').onchange = e => { st.days = +e.target.value; loadTx(); };
      host.querySelector('#trType').onchange = e => { st.type = e.target.value; loadTx(); };
      host.querySelector('#trCsv').onclick = () => app.exportCsv('tresorerie', tx.map(t => ({ date: t.transaction_date, compte: accounts.find(a => a.id === t.cash_account_id)?.name, sens: t.direction === 'in' ? 'entrée' : 'sortie', montant: t.amount, type: SRC[t.source_type] || t.source_type, libelle: t.description })));
      const refresh = async () => { await loadAccounts(); loadTx(); };
      refresh();
    }
  };

  /* ---------- Bénéfice réel ---------- */
  EXT.pages.profit = {
    title: 'Bénéfice réel',
    async render(host, app) {
      host.innerHTML = X.head('Bénéfice réel', 'Ce que l’activité vous rapporte vraiment : ventes − retours − coût des produits vendus − dépenses.', '<select id="pfMonths" aria-label="Période"><option value="6">6 mois</option><option value="12" selected>12 mois</option><option value="24">24 mois</option></select><button type="button" class="btn light" id="pfPrint"><i class="fa-solid fa-file-pdf"></i> PDF / Partager</button>') + '<div id="pfBody"></div>';
      const body = host.querySelector('#pfBody'); let rep = null, sel = null;
      const calc = m => { const exp = Object.values(m.expenses || {}).reduce((n, v) => n + Number(v), 0); const net_rev = Number(m.revenue) - Number(m.returns); const gross = net_rev - Number(m.cogs); return { ...m, exp, net_rev, gross, net: gross - exp, pct: net_rev ? (gross - exp) / net_rev * 100 : 0 }; };
      async function load() {
        X.loading(body);
        const { data, error } = await app.sb.rpc('get_profit_report', { p_months: Number(host.querySelector('#pfMonths').value) });
        if (error) return X.errorPanel(body, error);
        rep = data; const months = (data.months || []).map(calc); sel = sel && months.find(m => m.month === sel.month) || months[months.length - 1];
        const max = Math.max(1, ...months.map(m => Math.max(m.net_rev, Math.abs(m.net))));
        const W = 640, H = 220, bw = Math.max(8, Math.min(34, (W - 40) / months.length / 2.4)), step = (W - 40) / Math.max(1, months.length), base = 170, k = 150 / max;
        const chart = `<svg viewBox="0 0 ${W} ${H}" class="pf-chart" role="img" aria-label="Ventes et bénéfice par mois"><line x1="20" x2="${W - 10}" y1="${base}" y2="${base}" class="gl"/>${months.map((m, i) => { const x = 30 + i * step; const hr = m.net_rev * k, hn = Math.abs(m.net) * k;
            return `<g class="pf-m ${m.month === sel?.month ? 'on' : ''}" data-m="${m.month}"><rect x="${x}" y="${base - hr}" width="${bw}" height="${hr}" class="r-rev" rx="3"><title>Ventes ${money(m.net_rev)}</title></rect><rect x="${x + bw + 2}" y="${m.net >= 0 ? base - hn : base}" width="${bw}" height="${hn}" class="${m.net >= 0 ? 'r-net' : 'r-loss'}" rx="3"><title>Bénéfice ${sign(m.net)}</title></rect><text x="${x + bw}" y="${H - 22}" text-anchor="middle" class="gt">${new Date(m.month + '-15').toLocaleDateString('fr-FR', { month: 'short' })}</text></g>`; }).join('')}</svg>
          <div class="pf-legend"><span><i class="r-rev"></i> Ventes nettes</span><span><i class="r-net"></i> Bénéfice</span><span><i class="r-loss"></i> Perte</span></div>`;
        const s = sel;
        body.innerHTML = X.kpis([['fa-sack-dollar', 'Ventes nettes · ' + monthName(s.month), money(s.net_rev), s.sales_count + ' vente(s)' + (Number(s.returns) ? ' · retours ' + money(s.returns) : ''), 'k-blue'],
            ['fa-boxes-stacked', 'Coût des produits vendus', money(s.cogs), data.cost_method === 'cogs' ? 'recettes / prix d’achat' : 'coûts non renseignés', 'k-amber'],
            ['fa-receipt', 'Dépenses', money(s.exp), Object.keys(s.expenses || {}).length + ' catégorie(s)', 'k-pink'],
            ['fa-chart-pie', 'Bénéfice net', sign(s.net), s.net_rev ? Math.round(s.pct) + ' % des ventes' : '—', s.net >= 0 ? 'k-green' : 'k-pink']])
          + `<section class="card"><div class="card-head"><h3><i class="fa-solid fa-chart-column"></i> Mois par mois</h3><span class="muted">Touchez un mois pour le détail</span></div>${chart}</section>
          <div class="ds-grid"><section class="card"><div class="card-head"><h3>Compte de résultat · ${esc(monthName(s.month))}</h3></div>
            <div class="cc-line"><span>Ventes</span><b>${money(s.revenue)}</b></div><div class="cc-line"><span>− Retours clients</span><b>${money(s.returns)}</b></div>
            <div class="cc-line"><span>− Coût des produits vendus</span><b>${money(s.cogs)}</b></div><div class="cc-line total"><span>= Marge brute</span><b>${sign(s.gross)}</b></div>
            ${Object.entries(s.expenses || {}).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<div class="cc-line"><span>− ${esc(c)}</span><b>${money(v)}</b></div>`).join('') || '<div class="cc-line"><span>− Dépenses</span><b>0 FCFA</b></div>'}
            <div class="cc-line total"><span>= Bénéfice net</span><b class="${s.net >= 0 ? 'txt-ok' : 'txt-bad'}">${sign(s.net)}</b></div>
            ${data.cost_method === 'cogs' && Number(s.stock_purchases) ? `<p class="muted small">Achats de matières premières du mois (${money(s.stock_purchases)}) : non déduits ici, car déjà comptés dans le coût des produits vendus.</p>` : ''}
            ${data.cost_method === 'cash' ? '<p class="muted small">Aucun coût de produit n’est renseigné : les achats de matières sont comptés dans les dépenses. Renseignez prix d’achat ou recettes (menu Rentabilité) pour un calcul plus juste.</p>' : ''}</section>
            <section class="card"><div class="card-head"><h3><i class="fa-solid fa-trophy"></i> Produits qui rapportent le plus</h3><span class="muted">3 derniers mois</span></div>${(data.top_products || []).map(p => `<div class="cc-line"><span>${esc(p.name)} <small class="muted">· ${Number(p.quantity)} vendus</small></span><b class="${p.profit >= 0 ? 'txt-ok' : 'txt-bad'}">${sign(Number(p.profit))}</b></div>`).join('') || '<p class="muted">Pas encore de ventes.</p>'}</section></div>
          <section class="card"><div class="table-wrap"><table class="cards-m"><thead><tr><th>Mois</th><th>Ventes nettes</th><th>Coût produits</th><th>Marge brute</th><th>Dépenses</th><th>Bénéfice net</th><th>Marge</th></tr></thead><tbody>${months.slice().reverse().map(m => `<tr><td data-label="Mois">${esc(monthName(m.month))}</td><td data-label="Ventes nettes">${money(m.net_rev)}</td><td data-label="Coût produits">${money(m.cogs)}</td><td data-label="Marge brute">${sign(m.gross)}</td><td data-label="Dépenses">${money(m.exp)}</td><td data-label="Bénéfice net"><b class="${m.net >= 0 ? 'txt-ok' : 'txt-bad'}">${sign(m.net)}</b></td><td data-label="Marge">${m.net_rev ? Math.round(m.pct) + ' %' : '—'}</td></tr>`).join('')}</tbody></table></div></section>`;
        body.querySelectorAll('.pf-m').forEach(g => g.addEventListener('click', () => { sel = months.find(m => m.month === g.dataset.m); load(); }));
        host.querySelector('#pfPrint').onclick = () => X.printDoc({ title: 'Bénéfice réel', kicker: 'Compte de résultat', subtitle: monthName(s.month), wide: true,
          blocks: [['Ventes nettes', money(s.net_rev)], ['Coût des produits vendus', money(s.cogs)], ['Marge brute', sign(s.gross)], ['Dépenses', money(s.exp)], ['Bénéfice net', sign(s.net)]],
          sections: [{ title: 'Mois par mois', table: { head: ['Mois', 'Ventes nettes', 'Coût produits', 'Dépenses', 'Bénéfice net'], align: ['', 'r', 'r', 'r', 'r'], rows: months.map(m => [monthName(m.month), money(m.net_rev), money(m.cogs), money(m.exp), sign(m.net)]) } },
            { title: 'Dépenses de ' + monthName(s.month), table: { head: ['Catégorie', 'Montant'], align: ['', 'r'], rows: Object.entries(s.expenses || {}).map(([c, v]) => [c, money(v)]) } }],
          pill: 'Bénéfice net · ' + sign(s.net) });
      }
      host.querySelector('#pfMonths').onchange = load;
      load();
    }
  };

  /* ---------- Sauvegardes ---------- */
  EXT.pages.backups = {
    title: 'Sauvegardes',
    async render(host, app) {
      if (!isBoss()) { host.innerHTML = X.head('Sauvegardes', 'Réservé au propriétaire et aux administrateurs.'); return; }
      host.innerHTML = X.head('Sauvegardes', 'Une copie complète de vos données est faite automatiquement chaque nuit (vers 2 h) et gardée 30 jours.', '<button type="button" class="btn primary" id="bkNow"><i class="fa-solid fa-cloud-arrow-up"></i> Sauvegarder maintenant</button>') + '<section class="card"><div id="bkList"></div></section>'
        + '<section class="card"><div class="card-head"><h3><i class="fa-solid fa-circle-info"></i> En cas de problème</h3></div><p class="muted">« Télécharger » enregistre la sauvegarde sur votre appareil (à garder sur une clé USB ou un drive). « Restaurer » (propriétaire uniquement) remet les lignes d’une table telles qu’elles étaient ce jour-là : ce qui a été supprimé revient, ce qui a été modifié reprend son ancienne valeur, et rien n’est effacé. Une sauvegarde de l’état actuel est faite juste avant, par sécurité.</p></section>';
      const box = host.querySelector('#bkList');
      const size = b => b > 1e6 ? (b / 1e6).toFixed(1) + ' Mo' : Math.max(1, Math.round(b / 1e3)) + ' Ko';
      async function load() {
        X.loading(box);
        const { data, error } = await app.sb.rpc('list_backups'); if (error) return X.errorPanel(box, error);
        box.innerHTML = (data || []).length ? data.map(b => { const rows = Object.values(b.counts || {}).reduce((n, v) => n + Number(v), 0);
          return `<div class="m-row" data-id="${b.id}"><span class="m-ico ${b.kind === 'auto' ? 'i-green' : 'i-blue'}"><i class="fa-solid ${b.kind === 'auto' ? 'fa-moon' : 'fa-hand-pointer'}"></i></span><span class="m-txt"><b>${new Date(b.created_at).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</b><small>${b.kind === 'auto' ? 'Automatique' : 'Manuelle'} · ${rows.toLocaleString('fr-FR')} enregistrements · ${size(b.size_bytes)} · ${b.counts?.sales ?? 0} ventes, ${b.counts?.customers ?? 0} clients</small></span>
            <button type="button" class="btn light sm" data-dl><i class="fa-solid fa-download"></i> Télécharger</button>${role() === 'owner' ? '<button type="button" class="btn light sm" data-restore><i class="fa-solid fa-clock-rotate-left"></i> Restaurer</button>' : ''}</div>`; }).join('')
          : '<p class="muted">Aucune sauvegarde pour le moment : la première sera faite cette nuit, ou maintenant avec le bouton ci-dessus.</p>';
        box.querySelectorAll('[data-id]').forEach(el => { const b = data.find(x => x.id === el.dataset.id);
          el.querySelector('[data-dl]').onclick = async e => { const btn = e.currentTarget; btn.disabled = true; const { data: full, error: er } = await app.sb.rpc('get_backup', { p_id: b.id }); btn.disabled = false; if (er) return app.toast(X.explain(er), true);
            const url = URL.createObjectURL(new Blob([JSON.stringify(full)], { type: 'application/json' })); const a = Object.assign(document.createElement('a'), { href: url, download: `lsm-sauvegarde-${b.created_at.slice(0, 10)}.json` }); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); };
          el.querySelector('[data-restore]')?.addEventListener('click', () => {
            const T = { customers: 'Clients', products: 'Produits', sales: 'Ventes', sale_items: 'Lignes de vente', payments: 'Paiements', expenses: 'Dépenses', customer_orders: 'Commandes', customer_order_items: 'Lignes de commande', suppliers: 'Fournisseurs', raw_materials: 'Matières premières', recipes: 'Recettes', promo_campaigns: 'Promotions', delivery_zones: 'Zones de livraison', company_settings: 'Entreprise', shop_settings: 'Boutique' };
            const m = X.modal('Restaurer depuis la sauvegarde', `<p>Sauvegarde du <b>${new Date(b.created_at).toLocaleString('fr-FR')}</b>.</p><label class="field">Que voulez-vous remettre ?<select name="t">${Object.entries(T).map(([k, l]) => `<option value="${k}">${l} (${b.counts?.[k] ?? 0})</option>`).join('')}</select></label><p class="muted small">Les lignes supprimées depuis reviennent et les lignes modifiées reprennent leur valeur de ce jour-là. Rien n’est effacé.</p>`, '<button type="button" class="btn light" data-close>Annuler</button><button class="btn primary" type="submit">Restaurer</button>', { form: true });
            m.el.onsubmit = async e => { e.preventDefault(); if (!confirm('Confirmer la restauration ?')) return; const { data: n, error: er } = await app.sb.rpc('restore_backup_table', { p_id: b.id, p_table: m.el.elements.t.value }); if (er) return app.toast(X.explain(er), true); m.close(); app.toast(`${n} ligne(s) restaurée(s).`); load(); };
          });
        });
      }
      host.querySelector('#bkNow').onclick = async e => { const b = e.currentTarget; b.disabled = true; const { error } = await app.sb.rpc('run_backup_now'); b.disabled = false; if (error) return app.toast(X.explain(error), true); app.toast('Sauvegarde faite.'); load(); };
      load();
    }
  };
})();
