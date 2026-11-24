/* Myra V31 — Boutique en ligne : réglages, lien à partager, commandes reçues */
(() => {
  const X = window.MyraX, { EXT, A, esc, money, fdate } = X;
  X.menu('RELATION CLIENT', [['shop', 'Boutique en ligne', 'fa-store']], 2);
  const shopUrl = () => new URL('boutique.html', location.href.split('#')[0]).href;
  async function copy(text) { try { await navigator.clipboard.writeText(text); A().toast('Lien copié.'); } catch (_) { prompt('Copiez ce lien :', text); } }

  EXT.pages.shop = {
    title: 'Boutique en ligne',
    async render(host, app) {
      X.loading(host);
      let s, orders, products;
      try {
        const r = await app.sb.from('shop_settings').select('*').maybeSingle(); if (r.error) throw r.error; s = r.data || { is_open: true };
        const o = await app.fetchAll(() => app.sb.from('customer_orders').select('id,order_number,order_date,total,status,customer_whatsapp,delivery_zone,delivery_address,customers(full_name,phone)').eq('source', 'web').order('created_at', { ascending: false }), 2000); if (o.error) throw o.error; orders = o.data || [];
        products = await X.load('products', 'id,name,sale_price,is_active,image_url,description', 'name', true);
      } catch (e) {
        if (X.isMissing(e) || /source|shop_settings/.test(String(e?.message || ''))) {
          host.innerHTML = X.head('Boutique en ligne', 'Une page de commande pour vos clients, sans accès à votre espace de gestion.')
            + `<div class="panel ext-error"><h3><i class="fa-solid fa-puzzle-piece" aria-hidden="true"></i> Boutique pas encore activée</h3><p class="muted">Exécutez une seule fois le script <code>supabase/myra_v31_boutique.sql</code> dans Supabase › SQL Editor, puis revenez ici.</p></div>`;
          return;
        }
        return X.errorPanel(host, e);
      }
      const url = shopUrl();
      const month = new Date().toISOString().slice(0, 7);
      const mOrders = orders.filter(o => String(o.order_date || '').startsWith(month) && o.status !== 'cancelled');
      const todo = orders.filter(o => o.status === 'draft');
      const visible = products.filter(p => p.is_active !== false && Number(p.sale_price) > 0);
      const noPhoto = visible.filter(p => !p.image_url).length, noDesc = visible.filter(p => !p.description).length;
      const wa = `https://wa.me/?text=${encodeURIComponent(`Commandez nos produits faits maison en ligne 🍲\n${url}`)}`;
      host.innerHTML = X.head('Boutique en ligne', 'La page de commande de vos clients. Ils voient vos produits et commandent ; ils n’ont jamais accès à votre espace de gestion.',
        `<a class="btn primary" href="${esc(url)}" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i> Ouvrir la boutique</a>`)
        + X.kpis([['fa-bag-shopping', 'À traiter', String(todo.length), 'commande(s) en brouillon', todo.length ? 'k-amber' : 'k-green'],
          ['fa-calendar', 'Ce mois-ci', String(mOrders.length), money(mOrders.reduce((n, o) => n + Number(o.total || 0), 0)), 'k-green'],
          ['fa-store', 'Produits en vitrine', String(visible.length), noPhoto ? `${noPhoto} sans photo` : 'tous avec photo', noPhoto ? 'k-amber' : 'k-blue']])
        + `<section class="card"><div class="card-head"><h3>Partager la boutique</h3><span class="tone ${s.is_open ? 'ok' : 'bad'}">${s.is_open ? 'Ouverte' : 'Fermée'}</span></div>
            <div class="shop-share"><div class="shop-qr">${X.qrSvg(url, 4)}</div><div>
              <p class="muted" style="margin-top:0">Lien à mettre dans votre statut WhatsApp, sur Facebook, Instagram, ou à imprimer (QR code) sur vos emballages.</p>
              <p><code style="word-break:break-all">${esc(url)}</code></p>
              <div class="actions" style="flex-wrap:wrap"><button type="button" class="btn light" id="shopCopy"><i class="fa-solid fa-copy"></i> Copier le lien</button>
              <a class="btn light" href="${esc(wa)}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> Partager sur WhatsApp</a>
              <button type="button" class="btn light" id="shopPrint"><i class="fa-solid fa-print"></i> Imprimer l’affiche</button></div></div></div></section>`
        + (noPhoto || noDesc ? `<div class="panel ext-alert"><i class="fa-solid fa-lightbulb" aria-hidden="true"></i> Conseil : une photo et une courte description font vendre. ${noPhoto ? `${noPhoto} produit(s) sans photo` : ''}${noPhoto && noDesc ? ' · ' : ''}${noDesc ? `${noDesc} sans description` : ''} (Catalogue › Produits).</div>` : '')
        + `<section class="card"><div class="card-head"><h3>Réglages</h3><span class="muted">Fermée (congés…) : les clients peuvent seulement vous écrire sur WhatsApp</span></div><form id="shopForm"><div class="form-grid">
            <label class="field is-check"><span class="fl">Boutique ouverte aux commandes</span><input type="checkbox" name="is_open" ${s.is_open ? 'checked' : ''}></label>
            <label class="field full-span">Titre principal<input name="headline" maxlength="80" value="${esc(s.headline || '')}"></label>
            <label class="field full-span">Présentation<textarea name="intro" rows="2" maxlength="300">${esc(s.intro || '')}</textarea></label>
            <label class="field full-span">Informations de livraison<textarea name="delivery_info" rows="2" maxlength="300">${esc(s.delivery_info || '')}</textarea></label>
            <label class="field">Minimum de commande (FCFA)<input name="min_order" type="number" min="0" step="500" value="${Number(s.min_order || 0)}"></label>
            <label class="field">Numéro WhatsApp de la boutique<input name="whatsapp" type="tel" value="${esc(s.whatsapp || '')}" placeholder="Par défaut : téléphone de l’entreprise"></label></div>
            <div class="actions" style="margin-top:12px"><button type="submit" class="btn primary"><i class="fa-solid fa-floppy-disk"></i> Enregistrer</button></div></form></section>`
        + `<h3 style="margin:18px 0 8px">Commandes reçues en ligne</h3>`
        + X.table(['N° commande', 'Client', 'Livraison', 'Total', 'Statut', ''], orders.slice(0, 50).map(o => {
          const n = X.waNumber(o.customer_whatsapp || o.customers?.phone);
          return `<tr><td data-role="title"><b>${esc(o.order_number)}</b><br><small class="muted">${fdate(o.order_date)}</small></td><td data-role="meta">${esc(o.customers?.full_name || '—')}<br><small class="muted">${esc(o.customers?.phone || '')}</small></td><td data-role="meta">${esc(o.delivery_zone || o.delivery_address || '—')}</td><td data-role="meta"><b>${money(o.total)}</b></td><td data-role="meta">${app.status(o.status)}</td><td>${n ? `<a class="btn light sm" target="_blank" rel="noopener" href="https://wa.me/${n}?text=${encodeURIComponent(`Bonjour ${(o.customers?.full_name || '').split(' ')[0]}, nous avons bien reçu votre commande ${o.order_number} (${money(o.total)}). `)}"><i class="fa-brands fa-whatsapp"></i> Répondre</a>` : ''}</td></tr>`;
        }), 'Aucune commande en ligne pour le moment. Partagez le lien de votre boutique !')
        + `<p class="muted" style="margin-top:8px">Les commandes en ligne arrivent en <b>Brouillon</b> dans <b>Commandes</b> : appelez le client, ajoutez les frais de livraison si besoin, puis confirmez.</p>`;
      host.querySelector('#shopCopy').onclick = () => copy(url);
      host.querySelector('#shopPrint').onclick = () => X.printHtml('Boutique en ligne', `<div style="text-align:center;font-family:sans-serif;padding:30px"><img src="${esc(new URL('assets/logo-les-saveurs-de-myra.png', location.href).href)}" style="width:140px"><h1 style="color:#0d4426;font-size:34px;margin:16px 0 4px">Commandez en ligne</h1><p style="font-size:18px">Scannez ce code avec votre téléphone</p><div style="width:280px;margin:16px auto">${X.qrSvg(url, 8)}</div><p style="font-size:15px;color:#555">${esc(url)}</p></div>`);
      host.querySelector('#shopForm').onsubmit = async e => {
        e.preventDefault(); const f = e.target;
        const row = { id: true, is_open: f.is_open.checked, headline: f.headline.value.trim() || 'Le secret de nos marmites', intro: f.intro.value.trim() || ' ', delivery_info: f.delivery_info.value.trim() || ' ', min_order: Math.max(0, Number(f.min_order.value) || 0), whatsapp: f.whatsapp.value.trim() || null, updated_at: new Date().toISOString() };
        const { error } = await app.sb.from('shop_settings').upsert(row, { onConflict: 'id' }); if (error) return app.toast(X.explain(error), true);
        app.toast('Boutique mise à jour.'); EXT.pages.shop.render(host, app);
      };
    }
  };
})();
