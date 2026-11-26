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
    async render(host, app, opts = {}) {
      X.loading(host);
      const CRIT = [['product', 'Produit', 'fa-jar'], ['shop', 'Boutique', 'fa-store'], ['service', 'Service', 'fa-handshake'], ['delivery', 'Livraison', 'fa-motorcycle'], ['after_sales', 'SAV', 'fa-headset']];
      let reviews, previews = [], ratings, sales, customers, orders, products;
      try {
        [reviews, customers, products] = await Promise.all([X.load('order_reviews', '*', 'requested_at', false), X.load('customers', 'id,full_name,phone', 'full_name', true), X.load('products', 'id,name', 'name', true)]);
        const since = iso(addDays(new Date(), -60));
        const [r, s, o, pr] = await Promise.all([app.sb.from('product_ratings').select('*').order('average', { ascending: false }),
          app.fetchAll(() => app.sb.from('sales').select('id,sale_number,sale_date,total,customer_id,status').gte('sale_date', since).in('status', ['confirmed', 'partially_paid', 'paid'])),
          app.fetchAll(() => app.sb.from('customer_orders').select('id,order_number,order_date,total,customer_id,status').in('status', ['delivered', 'converted']).gte('order_date', since)),
          app.sb.from('product_reviews').select('*').order('created_at', { ascending: false }).limit(500)]);
        if (r.error) throw r.error; if (s.error) throw s.error; if (o.error) throw o.error;
        ratings = r.data || []; sales = s.data; orders = o.data; previews = pr.error ? [] : (pr.data || []);
      } catch (e) { return X.errorPanel(host, e); }
      const cmap = new Map(customers.map(c => [c.id, c])), pmap = new Map(products.map(p => [p.id, p]));
      const refOf = r => (orders.find(o => o.id === r.order_id) || {}).order_number || (sales.find(s => s.id === r.sale_id) || {}).sale_number || 'Commande';
      // Tous les avis, des deux sources, au même format
      const all = [...reviews.filter(r => r.rating).map(r => ({ src: 'order', id: r.id, name: cmap.get(r.customer_id)?.full_name || 'Client', phone: cmap.get(r.customer_id)?.phone, rating: r.rating, product: r.rating_product, shop: r.rating_shop, service: r.rating_service, delivery: r.rating_delivery, after_sales: r.rating_after_sales, comment: r.comment, date: r.submitted_at, verified: true, label: refOf(r) })),
        ...previews.map(r => ({ src: 'shop', id: r.id, name: r.author_name, phone: cmap.get(r.customer_id)?.phone || r.phone_digits, rating: r.rating, product: r.rating_product, shop: r.rating_shop, service: r.rating_service, delivery: r.rating_delivery, after_sales: r.rating_after_sales, comment: r.comment, date: r.created_at, verified: r.verified, label: pmap.get(r.product_id)?.name || 'Produit', status: r.status, reply: r.reply }))]
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));
      const visible = all.filter(a => a.status !== 'hidden');
      const avg = visible.length ? visible.reduce((n, r) => n + r.rating, 0) / visible.length : 0;
      const crit = CRIT.map(([k, l, i]) => { const v = visible.map(r => r[k]).filter(Boolean); return { k, l, i, n: v.length, avg: v.length ? v.reduce((n, x) => n + x, 0) / v.length : null }; });
      const weakest = crit.filter(c => c.n >= 2).sort((a, b) => a.avg - b.avg)[0];
      const pending = reviews.filter(r => !r.submitted_at);
      const due = pending.filter(r => (Date.now() - new Date(r.reminded_at || r.requested_at)) > 2 * 864e5 && (r.reminder_count || 0) < 3 && X.waNumber(cmap.get(r.customer_id)?.phone));
      const asked = new Set(reviews.map(r => r.sale_id || r.order_id));
      const candidates = [...orders.map(o => ({ kind: 'order', id: o.id, ref: o.order_number, date: o.order_date, total: o.total, customer_id: o.customer_id })), ...sales.map(s => ({ kind: 'sale', id: s.id, ref: s.sale_number, date: s.sale_date, total: s.total, customer_id: s.customer_id }))]
        .filter(x => x.customer_id && X.waNumber(cmap.get(x.customer_id)?.phone) && !asked.has(x.id)).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 40);
      const tone = v => v >= 4 ? 'ok' : v >= 3 ? 'warn' : 'bad';
      const f = opts.filter || 'all';
      const shown = all.filter(a => f === 'all' ? a.status !== 'hidden' : f === 'shop' ? a.src === 'shop' && a.status !== 'hidden' : f === 'order' ? a.src === 'order' : f === 'low' ? a.rating <= 3 && a.status !== 'hidden' : a.status === 'hidden');
      const respRate = reviews.length ? Math.round(reviews.filter(r => r.submitted_at).length / reviews.length * 100) : 0;

      host.innerHTML = X.head('Avis clients', 'Notes sur 5 étoiles : produit, boutique, service, livraison et SAV. Demandez, relancez, répondez : chaque avis aide à améliorer nos produits et notre service.')
        + X.kpis([['fa-star', 'Note globale', visible.length ? `${avg.toFixed(1)} / 5` : '—', visible.length ? stars(avg) : 'Pas encore d’avis', 'k-amber'],
          ['fa-comment-dots', 'Avis reçus', String(visible.length), `${previews.filter(p => p.status !== 'hidden').length} depuis la boutique · ${reviews.filter(r => r.rating).length} après commande`, 'k-green'],
          ['fa-reply', 'Taux de réponse', reviews.length ? respRate + ' %' : '—', `${reviews.length} demande(s) envoyée(s)`, 'k-blue'],
          ['fa-bell', 'À relancer', String(due.length), `${pending.length} demande(s) sans réponse`, due.length ? 'k-amber' : 'k-green']])
        + `<section class="card"><div class="card-head"><h3>Notes par critère</h3>${weakest && weakest.avg < 4.5 ? `<span class="tone warn"><i class="fa-solid fa-lightbulb"></i> Point à améliorer : ${esc(weakest.l)}</span>` : ''}</div>
            <div class="av-crit">${crit.map(c => `<div class="av-c"><span class="av-ico"><i class="fa-solid ${c.i}"></i></span><b>${c.l}</b><div class="av-bar"><i class="${c.avg ? tone(c.avg) : ''}" style="width:${c.avg ? c.avg / 5 * 100 : 0}%"></i></div><span class="av-v">${c.avg ? c.avg.toFixed(1) : '—'}</span><small>${c.n} avis</small></div>`).join('')}</div></section>`
        + (due.length ? `<section class="card"><div class="card-head"><h3><i class="fa-solid fa-bell"></i> Relancer les clients</h3><button type="button" class="btn primary sm" id="avRemindAll"><i class="fa-brands fa-whatsapp"></i> Relancer les ${due.length}</button></div>
            <p class="muted" style="margin:0 0 6px">Demandes sans réponse depuis plus de 2 jours (3 relances maximum par client, pour ne pas déranger).</p>
            ${due.map(r => { const c = cmap.get(r.customer_id); return `<div class="m-row" data-due="${esc(r.id)}"><span class="m-txt"><b>${esc(c?.full_name || 'Client')}</b><small>${esc(refOf(r))} · demandé le ${fdate(r.requested_at)}${r.reminder_count ? ` · ${r.reminder_count} relance(s), la dernière le ${fdate(r.reminded_at)}` : ''}</small></span><button type="button" class="btn light sm" data-remind="${esc(r.id)}"><i class="fa-brands fa-whatsapp"></i> Relancer</button></div>`; }).join('')}</section>` : '')
        + `<section class="card"><div class="card-head"><h3>Demander un avis</h3><span>${candidates.length} vente(s) / livraison(s) des 60 derniers jours</span></div>${candidates.length ? candidates.map((x, i) => `<div class="m-row ${i >= 8 ? 'av-more' : ''}"><span class="m-txt"><b>${esc(cmap.get(x.customer_id)?.full_name || 'Client')}</b><small>${esc(x.ref)} · ${fdate(x.date)} · ${money(x.total)}</small></span><button type="button" class="btn light sm" data-ask="${x.kind}:${esc(x.id)}"><i class="fa-brands fa-whatsapp"></i> Demander</button></div>`).join('') + (candidates.length > 8 ? `<button type="button" class="btn light sm" id="avShowMore" style="margin-top:8px">Afficher les ${candidates.length - 8} autres</button>` : '') : '<p class="muted">Toutes les ventes et livraisons récentes ont déjà reçu une demande (ou leur client n’a pas de téléphone).</p>'}</section>`
        + (ratings.length ? `<section class="card"><div class="card-head"><h3>Note par produit</h3></div>${ratings.map(r => `<div class="m-row"><span class="m-txt"><b>${esc(r.name)}</b><small>${r.reviews} avis</small></span><span class="tone ${tone(r.average)}">${stars(r.average)} ${num(r.average)}</span></div>`).join('')}</section>` : '')
        + `<section class="card"><div class="card-head"><h3>Tous les avis</h3><select id="avFilter" class="ext-month" aria-label="Filtrer les avis">${[['all', 'Tous'], ['shop', 'Depuis la boutique'], ['order', 'Après commande'], ['low', '3 étoiles ou moins'], ['hidden', 'Masqués']].map(([v, l]) => `<option value="${v}" ${f === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
            ${shown.length ? shown.map(a => `<div class="av-item ${a.rating <= 2 ? 'low' : ''} ${a.status === 'hidden' ? 'off' : ''}">
              <div class="av-top"><span class="av-av">${esc((a.name || '?').slice(0, 1).toUpperCase())}</span><span class="av-who"><b>${esc(a.name)}</b><small>${a.src === 'shop' ? '<i class="fa-solid fa-store"></i> Boutique' : '<i class="fa-solid fa-receipt"></i> Après commande'} · ${esc(a.label)} · ${fdate(a.date)}${a.verified ? ' · <span class="tone ok">Achat vérifié</span>' : ''}</small></span><span class="tone ${tone(a.rating)}">${stars(a.rating)}</span></div>
              ${a.comment ? `<p class="av-com">${esc(a.comment)}</p>` : ''}
              <div class="av-tags">${CRIT.filter(([k]) => a[k]).map(([k, l]) => `<span>${l} ${'★'.repeat(a[k])}</span>`).join('')}</div>
              ${a.reply ? `<div class="av-reply"><b>Votre réponse</b>${esc(a.reply)}</div>` : ''}
              <div class="av-acts">${a.phone && X.waNumber(a.phone) ? `<a class="btn light sm" target="_blank" rel="noopener" href="${esc(wa(a.phone, `Bonjour ${String(a.name).split(' ')[0]}, merci pour votre avis sur ${a.label}. ${a.rating <= 3 ? 'Nous sommes désolés que tout n’ait pas été parfait : pouvez-vous nous en dire plus ? Nous voulons arranger cela.' : 'Cela nous fait très plaisir !'}`))}"><i class="fa-brands fa-whatsapp"></i> ${a.rating <= 3 ? 'Contacter' : 'Remercier'}</a>` : ''}
                ${a.src === 'shop' ? `<button type="button" class="btn light sm" data-reply="${esc(a.id)}"><i class="fa-solid fa-reply"></i> ${a.reply ? 'Modifier la réponse' : 'Répondre'}</button><button type="button" class="btn light sm" data-hide="${esc(a.id)}" data-st="${a.status === 'hidden' ? 'published' : 'hidden'}"><i class="fa-solid ${a.status === 'hidden' ? 'fa-eye' : 'fa-eye-slash'}"></i> ${a.status === 'hidden' ? 'Republier' : 'Masquer'}</button>` : ''}</div></div>`).join('') : '<p class="muted">Aucun avis dans cette sélection.</p>'}</section>`;

      const rerender = (o = {}) => EXT.pages.reviews.render(host, app, { filter: f, ...o });
      host.querySelector('#avShowMore')?.addEventListener('click', e => { host.querySelectorAll('.av-more').forEach(x => x.classList.remove('av-more')); e.currentTarget.remove(); });
      host.querySelector('#avFilter').onchange = e => rerender({ filter: e.target.value });
      const link = t => siteUrl('avis.html?t=' + t);
      async function remind(r) {
        const c = cmap.get(r.customer_id);
        window.open(wa(c.phone, `Bonjour ${c.full_name.split(' ')[0]} 👋 Petit rappel : votre avis sur votre commande ${refOf(r)} nous aiderait beaucoup à améliorer nos produits et notre service. 5 étoiles à toucher, 30 secondes : ${link(r.token)} Merci !`), '_blank', 'noopener');
        const { error } = await app.sb.from('order_reviews').update({ reminded_at: new Date().toISOString(), reminder_count: (r.reminder_count || 0) + 1 }).eq('id', r.id);
        if (error) app.toast(X.explain(error), true);
        host.querySelector(`[data-due="${r.id}"]`)?.remove();
      }
      host.querySelectorAll('[data-remind]').forEach(b => b.onclick = () => remind(due.find(r => r.id === b.dataset.remind)));
      host.querySelector('#avRemindAll')?.addEventListener('click', e => {
        const next = due.find(r => host.querySelector(`[data-due="${r.id}"]`)); if (!next) return rerender();
        remind(next); const left = due.filter(r => host.querySelector(`[data-due="${r.id}"]`)).length;
        e.currentTarget.innerHTML = left ? `<i class="fa-brands fa-whatsapp"></i> Relancer le suivant (${left})` : '<i class="fa-solid fa-check"></i> Terminé';
      });
      host.querySelectorAll('[data-ask]').forEach(b => b.onclick = async () => {
        const [kind, id] = b.dataset.ask.split(':'); const x = candidates.find(c => c.id === id); const c = cmap.get(x.customer_id);
        const { data, error } = await app.sb.from('order_reviews').insert({ [kind === 'order' ? 'order_id' : 'sale_id']: id, customer_id: x.customer_id }).select('token').single();
        if (error) return app.toast(X.explain(error), true);
        window.open(wa(c.phone, `Bonjour ${c.full_name.split(' ')[0]}, merci pour votre commande ${x.ref} ! Votre avis nous aide à améliorer nos produits et notre service : notez le produit, la livraison et le service en 30 secondes ici 👉 ${link(data.token)}`), '_blank', 'noopener');
        b.closest('.m-row').remove();
      });
      host.querySelectorAll('[data-hide]').forEach(b => b.onclick = async () => {
        const { error } = await app.sb.from('product_reviews').update({ status: b.dataset.st }).eq('id', b.dataset.hide);
        if (error) return app.toast(X.explain(error), true); app.toast(b.dataset.st === 'hidden' ? 'Avis masqué sur la boutique.' : 'Avis republié.'); rerender();
      });
      host.querySelectorAll('[data-reply]').forEach(b => b.onclick = () => {
        const a = all.find(x => x.id === b.dataset.reply);
        const m = X.modal('Répondre à ' + a.name, `<p class="muted">Votre réponse s’affiche sous l’avis, sur la boutique.</p><blockquote class="av-q">${stars(a.rating)} ${esc(a.comment || '')}</blockquote><label class="field">Réponse<textarea id="avReply" rows="4" maxlength="1000">${esc(a.reply || '')}</textarea></label>`, '<button type="button" class="btn light" data-close>Annuler</button><button type="button" class="btn primary" id="avReplyOk">Publier la réponse</button>');
        m.el.querySelector('#avReplyOk').onclick = async () => {
          const txt = m.el.querySelector('#avReply').value.trim();
          const { error } = await app.sb.from('product_reviews').update({ reply: txt || null, replied_at: txt ? new Date().toISOString() : null }).eq('id', a.id);
          if (error) return app.toast(X.explain(error), true); m.close(); app.toast('Réponse publiée.'); rerender();
        };
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
