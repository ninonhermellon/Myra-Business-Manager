/* LSM Business Manager V39 — Clôture de caisse du soir et Résumé du jour */
(() => {
  const X = window.MyraX, { EXT, A, esc, money, today } = X;
  const METHODS = [['cash', 'Espèces', 'fa-money-bill-wave'], ['mtn_momo', 'MTN MoMo', 'fa-mobile-screen'], ['airtel_money', 'Airtel Money', 'fa-mobile-screen-button'], ['bank_transfer', 'Virement', 'fa-building-columns'], ['card', 'Carte', 'fa-credit-card'], ['other', 'Autre', 'fa-ellipsis']];
  const mLabel = k => (METHODS.find(m => m[0] === k) || [k, k === 'delivery_cash' ? 'Encaissé en livraison' : k])[1];
  const isLead = () => ['owner', 'admin', 'manager', 'accountant'].includes(A()?.state?.profile?.role);
  const sign = n => (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n));
  const dlabel = d => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  X.menu('SUIVI FINANCIER', [['cash_closing', 'Clôture de caisse', 'fa-cash-register'], ['daily_summary', 'Résumé du jour', 'fa-chart-simple']]);

  EXT.pages.cash_closing = {
    title: 'Clôture de caisse',
    async render(host, app) {
      let date = today();
      host.innerHTML = X.head('Clôture de caisse', 'Chaque soir, comptez votre caisse : l’application compare avec les ventes encaissées et signale les écarts.', `<input type="date" id="ccDate" value="${date}" max="${date}" aria-label="Date de la caisse">`)
        + '<div id="ccMine"></div>' + (isLead() ? '<section class="card"><div class="card-head"><h3><i class="fa-solid fa-users"></i> Caisses de l’équipe</h3><span class="muted" id="ccTeamHint"></span></div><div id="ccTeam"></div></section>' : '');
      const mine = host.querySelector('#ccMine');
      async function loadMine() {
        X.loading(mine);
        const { data, error } = await app.sb.rpc('get_cash_expected', { p_date: date, p_user: null });
        if (error) return X.errorPanel(mine, error);
        const exp = data.methods || {}; const dc = Number(data.delivery_cash || 0); const cl = data.closing;
        const keys = [...new Set(['cash', 'mtn_momo', 'airtel_money', ...Object.keys(exp)])];
        const expTotal = Object.values(exp).reduce((n, v) => n + Number(v), 0) + dc;
        const counted = cl?.counted || {};
        mine.innerHTML = `<section class="card"><div class="card-head"><h3><i class="fa-solid fa-cash-register"></i> Ma caisse · ${esc(dlabel(date))}</h3>${cl ? `<span class="tm-state ${cl.status === 'validated' ? 'on' : 'off'}">${cl.status === 'validated' ? 'Validée par la direction' : 'Envoyée · à valider'}</span>` : ''}</div>
          <div class="cc-grid">
            <div class="cc-col"><h4>Ce que l’application attend</h4>${keys.map(k => `<div class="cc-line"><span><i class="fa-solid ${(METHODS.find(m => m[0] === k) || [, , 'fa-circle'])[2]}"></i> ${esc(mLabel(k))}</span><b>${money(exp[k] || 0)}</b></div>`).join('')}
              ${dc ? `<div class="cc-line"><span><i class="fa-solid fa-motorcycle"></i> Encaissé en livraison</span><b>${money(dc)}</b></div>` : ''}
              <div class="cc-line total"><span>Total attendu</span><b>${money(expTotal)}</b></div><p class="muted small">${data.sales_count} vente(s) confirmée(s) · paiements que vous avez encaissés ce jour-là.</p></div>
            <form class="cc-col" id="ccForm"><h4>Ce que vous avez compté</h4>${keys.map(k => `<label class="cc-line"><span>${esc(mLabel(k))}</span><input type="number" min="0" step="5" inputmode="numeric" name="${k}" value="${counted[k] ?? ''}" placeholder="0" ${cl?.status === 'validated' ? 'disabled' : ''}></label>`).join('')}
              <div class="cc-line total"><span>Total compté</span><b id="ccCounted">—</b></div>
              <div class="cc-diff" id="ccDiff"></div>
              <label class="field">Remarque (facultatif)<input name="notes" maxlength="500" value="${esc(cl?.notes || '')}" placeholder="Ex. : billet abîmé, monnaie rendue en trop…" ${cl?.status === 'validated' ? 'disabled' : ''}></label>
              <div class="actions">${cl ? '<button type="button" class="btn light" id="ccPrint"><i class="fa-solid fa-print"></i> Ticket de clôture</button>' : ''}${cl?.status === 'validated' ? '' : `<button class="btn primary" type="submit"><i class="fa-solid fa-lock"></i> ${cl ? 'Mettre à jour la clôture' : 'Clôturer ma caisse'}</button>`}</div></form>
          </div></section>`;
        const f = mine.querySelector('#ccForm');
        const upd = () => { const c = keys.reduce((n, k) => n + Number(f.elements[k].value || 0), 0); const d = c - expTotal; mine.querySelector('#ccCounted').textContent = money(c);
          mine.querySelector('#ccDiff').className = 'cc-diff ' + (Math.abs(d) < 1 ? 'ok' : d < 0 ? 'bad' : 'warn');
          mine.querySelector('#ccDiff').innerHTML = Math.abs(d) < 1 ? '<i class="fa-solid fa-circle-check"></i> Caisse juste' : `<i class="fa-solid fa-triangle-exclamation"></i> Écart : <b>${sign(d)}</b> ${d < 0 ? '(il manque de l’argent)' : '(il y a plus que prévu)'}`; };
        f.addEventListener('input', upd); upd();
        f.onsubmit = async e => {
          e.preventDefault(); const p = {}; keys.forEach(k => { p[k] = Number(f.elements[k].value || 0); });
          const { data: r, error: err } = await app.sb.rpc('close_cash', { p_date: date, p_counted: p, p_notes: f.elements.notes.value });
          if (err) return app.toast(X.explain(err), true);
          app.toast(Math.abs(r.difference) < 1 ? 'Caisse clôturée : elle est juste.' : `Caisse clôturée avec un écart de ${sign(Number(r.difference))}. La direction est prévenue.`);
          loadMine(); loadTeam();
        };
        mine.querySelector('#ccPrint')?.addEventListener('click', () => printTicket(cl, app.state.profile?.full_name));
      }
      function printTicket(c, name) {
        const keys = [...new Set([...Object.keys(c.expected || {}), ...Object.keys(c.counted || {})])].filter(k => Number(c.expected?.[k] || 0) || Number(c.counted?.[k] || 0));
        X.printDoc({ title: 'Clôture de caisse', kicker: 'Ticket de clôture', subtitle: dlabel(c.closing_date), blocks: [['Caissier·ère', name || ''], ['Ventes', String(c.sales_count)], ['État', c.status === 'validated' ? 'Validée' : 'À valider'], ['Remarque', c.notes || '']],
          sections: [{ title: 'Détail par mode de paiement', table: { head: ['Mode', 'Attendu', 'Compté', 'Écart'], align: ['', 'r', 'r', 'r'], rows: keys.map(k => [mLabel(k), money(c.expected?.[k] || 0), money(c.counted?.[k] || 0), sign(Number(c.counted?.[k] || 0) - Number(c.expected?.[k] || 0))]), foot: ['Total', money(c.expected_total), money(c.counted_total), sign(Number(c.difference))] } }],
          pill: Math.abs(c.difference) < 1 ? 'Caisse juste' : 'Écart ' + sign(Number(c.difference)), signatures: ['Caissier·ère', 'Responsable'] });
      }
      async function loadTeam() {
        const box = host.querySelector('#ccTeam'); if (!box) return;
        const { data, error } = await app.sb.from('cash_closings').select('*').gte('closing_date', new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)).order('closing_date', { ascending: false }).limit(200);
        if (error) return X.errorPanel(box, error);
        const { data: people } = await app.sb.rpc('get_team_members').then(r => r, () => ({ data: [] }));
        const nm = id => (people || []).find(p => p.id === id)?.full_name || (id === app.state.user?.id ? app.state.profile?.full_name : 'Membre');
        const todo = (data || []).filter(c => c.status === 'submitted').length;
        host.querySelector('#ccTeamHint').textContent = todo ? `${todo} à valider` : '30 derniers jours';
        box.innerHTML = (data || []).length ? `<div class="table-wrap"><table class="cards-m"><thead><tr><th>Date</th><th>Personne</th><th>Attendu</th><th>Compté</th><th>Écart</th><th>État</th><th></th></tr></thead><tbody>${data.map(c => `<tr><td data-label="Date">${new Date(c.closing_date + 'T12:00:00').toLocaleDateString('fr-FR')}</td><td data-label="Personne">${esc(nm(c.user_id))}</td><td data-label="Attendu">${money(c.expected_total)}</td><td data-label="Compté">${money(c.counted_total)}</td><td data-label="Écart"><b class="${Math.abs(c.difference) < 1 ? 'txt-ok' : c.difference < 0 ? 'txt-bad' : 'txt-warn'}">${Math.abs(c.difference) < 1 ? 'Juste' : sign(Number(c.difference))}</b>${c.notes ? `<br><small class="muted">${esc(c.notes)}</small>` : ''}</td><td data-label="État">${c.status === 'validated' ? '<span class="tm-state on">Validée</span>' : '<span class="tm-state off">À valider</span>'}</td><td>${c.status === 'submitted' && c.user_id !== app.state.user?.id ? `<button type="button" class="btn primary sm" data-val="${c.id}">Valider</button>` : ''} <button type="button" class="btn light sm" data-tk="${c.id}" aria-label="Ticket"><i class="fa-solid fa-print"></i></button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Aucune clôture sur les 30 derniers jours.</p>';
        box.querySelectorAll('[data-val]').forEach(b => b.onclick = async () => { const { error: e } = await app.sb.rpc('validate_cash_closing', { p_id: b.dataset.val }); if (e) return app.toast(X.explain(e), true); app.toast('Clôture validée.'); loadTeam(); });
        box.querySelectorAll('[data-tk]').forEach(b => b.onclick = () => { const c = data.find(x => x.id === b.dataset.tk); printTicket(c, nm(c.user_id)); });
      }
      host.querySelector('#ccDate').onchange = e => { date = e.target.value || today(); loadMine(); };
      loadMine(); loadTeam();
    }
  };

  EXT.pages.daily_summary = {
    title: 'Résumé du jour',
    async render(host, app) {
      let date = today();
      host.innerHTML = X.head('Résumé du jour', 'L’essentiel de la journée. Il vous est aussi envoyé automatiquement à 18 h (du lundi au samedi) en notification.', `<input type="date" id="dsDate" value="${date}" max="${date}" aria-label="Jour"><button type="button" class="btn light" id="dsPrint"><i class="fa-solid fa-print"></i> Imprimer</button><button type="button" class="btn primary" id="dsWa"><i class="fa-brands fa-whatsapp"></i> Envoyer</button>`)
        + '<div id="dsBody"></div>';
      const body = host.querySelector('#dsBody'); let d = null;
      const text = () => {
        if (!d) return '';
        const L = [`📊 Résumé du ${dlabel(d.date)} — Les saveurs de Myra`, `Chiffre d’affaires : ${money(d.revenue)} (${d.sales_count} vente(s))`, `Encaissé : ${money(d.cash_in)}` + (Object.keys(d.by_method || {}).length ? ' (' + Object.entries(d.by_method).map(([k, v]) => mLabel(k) + ' ' + money(v)).join(', ') + ')' : '')];
        if ((d.by_seller || []).length) L.push('Par vendeur : ' + d.by_seller.map(s => `${s.name} ${money(s.total)}`).join(', '));
        L.push(`Commandes reçues : ${d.orders_new} (dont ${d.orders_web} en ligne) · à livrer demain : ${d.to_deliver_tomorrow}` + (d.to_deliver_late ? ` · en retard : ${d.to_deliver_late}` : ''));
        if (d.payments_to_verify) L.push(`Paiements Mobile Money à vérifier : ${d.payments_to_verify}`);
        if ((d.out_of_stock || []).length) L.push('Ruptures : ' + d.out_of_stock.join(', '));
        if ((d.low_stock || []).length) L.push('Stock bas : ' + d.low_stock.join(', '));
        if (Number(d.unpaid_total)) L.push(`Impayés clients : ${money(d.unpaid_total)} (${d.unpaid_count} vente(s))`);
        if (Number(d.expenses)) L.push(`Dépenses du jour : ${money(d.expenses)}`);
        if ((d.cash_closings || []).length) L.push('Caisses : ' + d.cash_closings.map(c => `${c.name} ${Math.abs(c.difference) < 1 ? 'juste' : 'écart ' + sign(Number(c.difference))}`).join(', '));
        return L.join('\n');
      };
      async function load() {
        X.loading(body);
        const { data, error } = await app.sb.rpc('get_daily_summary', { p_date: date });
        if (error) return X.errorPanel(body, error);
        d = data;
        const list = (arr, empty) => (arr || []).length ? `<ul class="ds-list">${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : `<p class="muted">${empty}</p>`;
        body.innerHTML = X.kpis([['fa-sack-dollar', 'Chiffre d’affaires', money(d.revenue), `${d.sales_count} vente(s)`, 'k-green'], ['fa-wallet', 'Encaissé', money(d.cash_in), 'tous modes confondus', 'k-blue'], ['fa-truck-fast', 'À livrer demain', d.to_deliver_tomorrow, d.to_deliver_late ? `${d.to_deliver_late} en retard` : 'aucun retard', 'k-amber'], ['fa-hand-holding-dollar', 'Impayés', money(d.unpaid_total), `${d.unpaid_count} vente(s)`, 'k-pink']])
          + `<div class="ds-grid">
            <section class="card"><div class="card-head"><h3><i class="fa-solid fa-ranking-star"></i> Ventes par vendeur</h3></div>${(d.by_seller || []).length ? d.by_seller.map(s => `<div class="cc-line"><span>${esc(s.name)} <small class="muted">· ${s.count} vente(s)</small></span><b>${money(s.total)}</b></div>`).join('') : '<p class="muted">Aucune vente ce jour-là.</p>'}
              <h4 class="pm-sub">Produits les plus vendus</h4>${list((d.top_products || []).map(p => `${p.name} × ${Number(p.quantity)}`), 'Aucun.')}</section>
            <section class="card"><div class="card-head"><h3><i class="fa-solid fa-wallet"></i> Encaissements</h3></div>${Object.keys(d.by_method || {}).length ? Object.entries(d.by_method).map(([k, v]) => `<div class="cc-line"><span>${esc(mLabel(k))}</span><b>${money(v)}</b></div>`).join('') : '<p class="muted">Aucun encaissement.</p>'}
              <div class="cc-line"><span>Dépenses du jour</span><b>${money(d.expenses)}</b></div>
              <h4 class="pm-sub">Clôtures de caisse</h4>${(d.cash_closings || []).length ? d.cash_closings.map(c => `<div class="cc-line"><span>${esc(c.name)}</span><b class="${Math.abs(c.difference) < 1 ? 'txt-ok' : 'txt-bad'}">${Math.abs(c.difference) < 1 ? 'Juste' : sign(Number(c.difference))}</b></div>`).join('') : '<p class="muted">Aucune caisse clôturée.</p>'}</section>
            <section class="card"><div class="card-head"><h3><i class="fa-solid fa-clipboard-list"></i> Commandes</h3></div>
              <div class="cc-line"><span>Reçues</span><b>${d.orders_new}</b></div><div class="cc-line"><span>dont boutique en ligne</span><b>${d.orders_web}</b></div><div class="cc-line"><span>Paiements MoMo à vérifier</span><b>${d.payments_to_verify}</b></div><div class="cc-line"><span>Paniers non finalisés</span><b>${d.carts_open}</b></div></section>
            <section class="card"><div class="card-head"><h3><i class="fa-solid fa-boxes-stacked"></i> Stock</h3></div><h4 class="pm-sub">Ruptures</h4>${list(d.out_of_stock, 'Aucune rupture.')}<h4 class="pm-sub">Stock bas</h4>${list(d.low_stock, 'Rien à signaler.')}</section>
          </div>`;
      }
      host.querySelector('#dsDate').onchange = e => { date = e.target.value || today(); load(); };
      host.querySelector('#dsWa').onclick = () => d && window.open('https://wa.me/?text=' + encodeURIComponent(text()), '_blank', 'noopener');
      host.querySelector('#dsPrint').onclick = () => d && X.printDoc({ title: 'Résumé du jour', kicker: 'Rapport quotidien', subtitle: dlabel(d.date), blocks: [['Chiffre d’affaires', money(d.revenue)], ['Ventes', String(d.sales_count)], ['Encaissé', money(d.cash_in)], ['À livrer demain', String(d.to_deliver_tomorrow)], ['Impayés', money(d.unpaid_total)]],
        sections: [{ title: 'Ventes par vendeur', table: { head: ['Vendeur', 'Ventes', 'Montant'], align: ['', 'r', 'r'], rows: (d.by_seller || []).map(s => [s.name, String(s.count), money(s.total)]) } }, { title: 'Stock', table: { head: ['Ruptures', 'Stock bas'], rows: [[(d.out_of_stock || []).join(', ') || '—', (d.low_stock || []).join(', ') || '—']] } }] });
      load();
    }
  };
})();
