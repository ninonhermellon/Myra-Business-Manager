/* Myra V30 — 7. Espace client en ligne · 8. Avis après livraison · 9. Parrainage */
(() => {
  const X = window.MyraX, { EXT, A, esc, money, num, fdate, today, iso, addDays, daysBetween } = X;
  X.menu('RELATION CLIENT', [['portal_links', 'Espace client en ligne', 'fa-link'], ['reviews', 'Avis clients', 'fa-star'], ['referrals', 'Parrainage', 'fa-people-arrows']], 2);
  const siteUrl = path => new URL(path, location.href.split('#')[0]).href;
  const wa = (phone, text) => { const n = X.waNumber(phone); return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`; };
  const stars = r => '★★★★★'.slice(0, Math.round(r)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(r));
  async function copy(text) { try { await navigator.clipboard.writeText(text); A().toast('Lien copié.'); } catch (_) { prompt('Copiez ce lien :', text); } }

  /* « Parrainé par » dans la fiche client (après migration V30) */
  X.whenReady(app => X.addField(app, 'customers', ['referred_by', 'Parrainé par', 'relation-customer'], 'Identité'));

  /* ---------- 7. Espace client en ligne ---------- */
  EXT.pages.portal_links = {
    title: 'Espace client en ligne',
    async render(host, app) {
      X.loading(host);
      let customers, links;
      try { [customers, links] = await Promise.all([X.load('customers', 'id,full_name,phone,company_name', 'full_name', true), X.load('customer_portal_links', '*', 'created_at', false)]); } catch (e) { return X.errorPanel(host, e); }
      const active = new Map(); links.filter(l => !l.revoked && new Date(l.expires_at) > new Date()).forEach(l => { if (!active.has(l.customer_id)) active.set(l.customer_id, l); });
      host.innerHTML = X.head('Espace client en ligne', 'Chaque client reçoit un lien personnel pour consulter ses factures, ce qu’il reste à payer et ses points fidélité — sans mot de passe.')
        + X.kpis([['fa-link', 'Liens actifs', String(active.size), `sur ${customers.length} client(s)`, 'k-green'], ['fa-eye', 'Consultés', String([...active.values()].filter(l => l.last_seen_at).length), 'au moins une fois', 'k-blue']])
        + `<div class="panel ext-form"><label class="search-wrap"><i class="fa-solid fa-magnifying-glass"></i><input id="plSearch" class="search-input" placeholder="Rechercher un client…" autocomplete="off"></label></div>`
        + X.table(['Client', 'Lien', 'Dernière visite', 'Actions'], customers.map(c => { const l = active.get(c.id); return `<tr data-name="${esc((c.full_name + ' ' + (c.company_name || '')).toLowerCase())}"><td data-role="title">${esc(c.full_name)}${c.company_name ? ` <small class="muted">· ${esc(c.company_name)}</small>` : ''}</td><td data-role="meta">${l ? `<span class="tone ok">Actif jusqu’au ${fdate(l.expires_at)}</span>` : '<span class="tone neutral">Aucun</span>'}</td><td data-role="meta">${l?.last_seen_at ? fdate(l.last_seen_at) : '—'}</td><td data-role="meta" class="ext-actions"><button type="button" class="btn primary sm" data-send="${esc(c.id)}"><i class="fa-brands fa-whatsapp"></i> ${l ? 'Renvoyer' : 'Envoyer'} le lien</button>${l ? `<button type="button" class="btn light sm" data-copy="${esc(l.token)}"><i class="fa-solid fa-copy"></i></button><button type="button" class="btn light sm" data-revoke="${esc(l.id)}" title="Désactiver le lien"><i class="fa-solid fa-ban"></i></button>` : ''}</td></tr>`; }), 'Aucun client.');
      host.querySelector('#plSearch').oninput = e => { const q = e.target.value.trim().toLowerCase(); host.querySelectorAll('tr[data-name]').forEach(tr => { tr.style.display = !q || tr.dataset.name.includes(q) ? '' : 'none'; }); };
      host.querySelectorAll('[data-send]').forEach(b => b.onclick = async () => {
        const c = customers.find(x => x.id === b.dataset.send); let l = active.get(c.id);
        if (!l) { const { data, error } = await app.sb.from('customer_portal_links').insert({ customer_id: c.id }).select('*').single(); if (error) return app.toast(X.explain(error), true); l = data; }
        const url = siteUrl('client.html?t=' + l.token);
        window.open(wa(c.phone, `Bonjour ${c.full_name.split(' ')[0]}, voici votre espace client Les Saveurs de Myra : vos factures, ce qu’il reste à payer et vos points fidélité.\n${url}`), '_blank', 'noopener');
        EXT.pages.portal_links.render(host, app);
      });
      host.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => copy(siteUrl('client.html?t=' + b.dataset.copy)));
      host.querySelectorAll('[data-revoke]').forEach(b => b.onclick = async () => { if (!confirm('Désactiver ce lien ? Le client ne pourra plus l’ouvrir (vous pourrez lui en envoyer un nouveau).')) return; const { error } = await app.sb.from('customer_portal_links').update({ revoked: true }).eq('id', b.dataset.revoke); if (error) return app.toast(X.explain(error), true); app.toast('Lien désactivé.'); EXT.pages.portal_links.render(host, app); });
    }
  };

  /* ---------- 8. Avis clients ---------- */
  EXT.pages.reviews = {
    title: 'Avis clients',
    async render(host, app) {
      X.loading(host);
      let reviews, ratings, sales, customers, orders;
      try {
        [reviews, customers] = await Promise.all([X.load('order_reviews', '*', 'requested_at', false), X.load('customers', 'id,full_name,phone', 'full_name', true)]);
        const since = iso(addDays(new Date(), -30));
        const [r, s, o] = await Promise.all([app.sb.from('product_ratings').select('*').order('average', { ascending: false }), app.fetchAll(() => app.sb.from('sales').select('id,sale_number,sale_date,total,customer_id,status').gte('sale_date', since).in('status', ['confirmed', 'partially_paid', 'paid'])), app.fetchAll(() => app.sb.from('customer_orders').select('id,order_number,order_date,total,customer_id,status').eq('status', 'delivered').gte('order_date', since))]);
        if (r.error) throw r.error; if (s.error) throw s.error; if (o.error) throw o.error; ratings = r.data || []; sales = s.data; orders = o.data;
      } catch (e) { return X.errorPanel(host, e); }
      const cmap = new Map(customers.map(c => [c.id, c]));
      const done = reviews.filter(r => r.rating); const avg = done.length ? done.reduce((n, r) => n + r.rating, 0) / done.length : 0;
      const asked = new Set(reviews.map(r => r.sale_id || r.order_id));
      const candidates = [...orders.map(o => ({ kind: 'order', id: o.id, ref: o.order_number, date: o.order_date, total: o.total, customer_id: o.customer_id })), ...sales.map(s => ({ kind: 'sale', id: s.id, ref: s.sale_number, date: s.sale_date, total: s.total, customer_id: s.customer_id }))]
        .filter(x => x.customer_id && X.waNumber(cmap.get(x.customer_id)?.phone) && !asked.has(x.id)).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 30);
      host.innerHTML = X.head('Avis clients', 'Après une livraison, envoyez un lien : le client note sa commande de 1 à 5 étoiles en 10 secondes.')
        + X.kpis([['fa-star', 'Note moyenne', done.length ? `${avg.toFixed(1)} / 5` : '—', done.length ? stars(avg) : 'Pas encore d’avis', 'k-amber'], ['fa-comment-dots', 'Avis reçus', String(done.length), `${reviews.length} demande(s) envoyée(s)`, 'k-green'], ['fa-reply', 'Taux de réponse', reviews.length ? Math.round(done.length / reviews.length * 100) + ' %' : '—', 'des demandes', 'k-blue']])
        + (ratings.length ? `<section class="card"><div class="card-head"><h3>Note par produit</h3></div>${ratings.map(r => `<div class="m-row"><span class="m-txt"><b>${esc(r.name)}</b><small>${r.reviews} avis</small></span><span class="tone ${r.average >= 4 ? 'ok' : r.average >= 3 ? 'warn' : 'bad'}">${stars(r.average)} ${num(r.average)}</span></div>`).join('')}</section>` : '')
        + `<section class="card"><div class="card-head"><h3>Demander un avis</h3><span>${candidates.length} vente(s) récente(s)</span></div>${candidates.length ? candidates.map(x => `<div class="m-row"><span class="m-txt"><b>${esc(cmap.get(x.customer_id)?.full_name || 'Client')}</b><small>${esc(x.ref)} · ${fdate(x.date)} · ${money(x.total)}</small></span><button type="button" class="btn light sm" data-ask="${x.kind}:${esc(x.id)}"><i class="fa-brands fa-whatsapp"></i> Demander</button></div>`).join('') : '<p class="muted">Toutes les ventes et livraisons des 30 derniers jours ont déjà reçu une demande (ou leur client n’a pas de téléphone).</p>'}</section>`
        + X.table(['Client', 'Note', 'Commentaire', 'Date'], done.map(r => `<tr><td data-role="title">${esc(cmap.get(r.customer_id)?.full_name || 'Client')}</td><td data-role="meta"><span class="tone ${r.rating >= 4 ? 'ok' : r.rating >= 3 ? 'warn' : 'bad'}">${stars(r.rating)}</span></td><td data-role="meta">${esc(r.comment || '—')}</td><td data-role="meta">${fdate(r.submitted_at)}</td></tr>`), 'Aucun avis reçu pour le moment.');
      host.querySelectorAll('[data-ask]').forEach(b => b.onclick = async () => {
        const [kind, id] = b.dataset.ask.split(':'); const x = candidates.find(c => c.id === id); const c = cmap.get(x.customer_id);
        const { data, error } = await app.sb.from('order_reviews').insert({ [kind === 'order' ? 'order_id' : 'sale_id']: id, customer_id: x.customer_id }).select('token').single();
        if (error) return app.toast(X.explain(error), true);
        window.open(wa(c.phone, `Bonjour ${c.full_name.split(' ')[0]}, merci pour votre commande ${x.ref} ! Votre avis nous aide beaucoup : notez-la en 10 secondes ici 👉 ${siteUrl('avis.html?t=' + data.token)}`), '_blank', 'noopener');
        b.closest('.m-row').remove();
      });
    }
  };

  /* ---------- 9. Parrainage ---------- */
  EXT.pages.referrals = {
    title: 'Parrainage',
    async render(host, app) {
      X.loading(host);
      let customers, rewards, sales;
      try {
        [customers, rewards] = await Promise.all([X.load('customers', 'id,full_name,phone,referred_by,created_at', 'full_name', true), X.load('referral_rewards', '*', 'created_at', false)]);
        const s = await app.fetchAll(() => app.sb.from('sales').select('customer_id,status').in('status', ['confirmed', 'partially_paid', 'paid'])); if (s.error) throw s.error; sales = s.data;
      } catch (e) { return X.errorPanel(host, e); }
      const bought = new Set(sales.map(s => s.customer_id)); const rewarded = new Set(rewards.map(r => r.referee_id)); const cmap = new Map(customers.map(c => [c.id, c]));
      const referees = customers.filter(c => c.referred_by && cmap.has(c.referred_by));
      const byParrain = new Map(); referees.forEach(f => { const list = byParrain.get(f.referred_by) || []; list.push(f); byParrain.set(f.referred_by, list); });
      const pending = referees.filter(f => bought.has(f.id) && !rewarded.has(f.id));
      host.innerHTML = X.head('Parrainage', 'Un client qui vous amène un nouveau client est récompensé par un bon cadeau dès le premier achat du filleul. Le parrain se renseigne dans la fiche du nouveau client (« Parrainé par »).')
        + X.kpis([['fa-people-arrows', 'Filleuls', String(referees.length), `${byParrain.size} parrain(s)`, 'k-green'], ['fa-cart-shopping', 'Filleuls clients', String(referees.filter(f => bought.has(f.id)).length), 'ont déjà acheté', 'k-blue'], ['fa-gift', 'À récompenser', String(pending.length), 'premier achat fait, pas encore de bon', 'k-amber'], ['fa-hand-holding-heart', 'Récompenses données', money(rewards.reduce((n, r) => n + Number(r.amount), 0)), `${rewards.length} bon(s)`, 'k-pink']])
        + (pending.length ? `<section class="card"><div class="card-head"><h3>À récompenser</h3></div>${pending.map(f => { const p = cmap.get(f.referred_by); return `<div class="m-row"><span class="m-txt"><b>${esc(p.full_name)}</b><small>a parrainé ${esc(f.full_name)}, qui a déjà acheté</small></span><button type="button" class="btn primary sm" data-reward="${esc(f.id)}"><i class="fa-solid fa-gift"></i> Offrir un bon</button></div>`; }).join('')}</section>` : '')
        + X.table(['Parrain', 'Filleuls', 'Ont acheté', 'Bons reçus'], [...byParrain.entries()].sort((a, b) => b[1].length - a[1].length).map(([pid, list]) => `<tr><td data-role="title">${esc(cmap.get(pid).full_name)}</td><td data-role="meta">${list.map(f => esc(f.full_name)).join(', ')}</td><td data-role="meta">${list.filter(f => bought.has(f.id)).length}</td><td data-role="amount">${money(rewards.filter(r => r.referrer_id === pid).reduce((n, r) => n + Number(r.amount), 0))}</td></tr>`), 'Aucun parrainage pour l’instant. Renseignez « Parrainé par » dans la fiche d’un nouveau client.');
      host.querySelectorAll('[data-reward]').forEach(b => b.onclick = () => {
        const f = cmap.get(b.dataset.reward), p = cmap.get(f.referred_by);
        const m = X.modal('Récompenser ' + p.full_name, `<p>Pour avoir parrainé <b>${esc(f.full_name)}</b>.</p><label class="field">Montant du bon cadeau (FCFA)<input name="amount" type="number" min="500" step="500" value="2000" required></label>`, `<button type="button" class="btn light" data-close>Annuler</button><button class="btn primary" type="submit">Créer le bon et l’envoyer</button>`, { form: true });
        m.el.addEventListener('submit', async e => {
          e.preventDefault(); const amount = Number(m.el.elements.amount.value);
          const code = 'PARR-' + Array.from(crypto.getRandomValues(new Uint8Array(6)), x => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[x % 32]).join('').replace(/(.{3})(.{3})/, '$1-$2');
          const g = await app.sb.from('gift_cards').insert({ code, initial_amount: amount, balance: amount, customer_id: p.id, buyer_name: 'Parrainage', expires_at: iso(addDays(new Date(), 180)), status: 'active', notes: 'Parrainage de ' + f.full_name }).select('id').single();
          if (g.error) return app.toast(X.explain(g.error), true);
          const r = await app.sb.from('referral_rewards').insert({ referrer_id: p.id, referee_id: f.id, gift_card_id: g.data.id, amount });
          if (r.error) return app.toast(X.explain(r.error), true);
          m.close(); window.open(wa(p.phone, `Bonjour ${p.full_name.split(' ')[0]}, merci d’avoir recommandé Les Saveurs de Myra à ${f.full_name} ! 🎁 Voici un bon cadeau de ${money(amount)} : code ${code}, valable 6 mois.`), '_blank', 'noopener');
          app.toast('Bon cadeau créé.'); EXT.pages.referrals.render(host, app);
        });
      });
    }
  };
})();
