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
      let s, orders, products, promos = null;
      try {
        const r = await app.sb.from('shop_settings').select('*').maybeSingle(); if (r.error) throw r.error; s = r.data || { is_open: true };
        const o = await app.fetchAll(() => app.sb.from('customer_orders').select('id,order_number,order_date,total,status,customer_whatsapp,delivery_zone,delivery_address,customers(full_name,phone)').eq('source', 'web').order('created_at', { ascending: false }), 2000); if (o.error) throw o.error; orders = o.data || [];
        products = await X.load('products', 'id,name,sale_price,is_active,image_url,description', 'name', true);
        try { const pr = await app.sb.from('promo_campaigns').select('id,name,code,discount_type,discount_value,is_active,ends_at,show_on_shop').order('created_at', { ascending: false }); promos = pr.error ? null : pr.data || []; } catch (_) { promos = null; }
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
            <label class="field">Numéro WhatsApp de la boutique<input name="whatsapp" type="tel" value="${esc(s.whatsapp || '')}" placeholder="Par défaut : téléphone de l’entreprise"></label>
            <label class="field full-span">Bandeau d’annonce (haut de page)<input name="announcement" maxlength="140" value="${esc(s.announcement || '')}" placeholder="Ex. : Livraison offerte dès 20 000 FCFA ce week-end"></label>
            <label class="field full-span">Horaires<input name="hours" maxlength="120" value="${esc(s.hours || '')}" placeholder="Ex. : Du lundi au samedi, 8 h – 19 h"></label>
            <div class="field full-span"><span>Image d’accueil (facultatif)</span><div class="shop-hero-row">${s.hero_image_url ? `<img src="${esc(s.hero_image_url)}" alt="Image d’accueil actuelle">` : '<span class="muted">Par défaut : les photos de vos produits.</span>'}<label class="btn light sm"><i class="fa-solid fa-image"></i> Choisir une photo<input type="file" id="heroFile" accept="image/png,image/jpeg,image/webp" hidden></label>${s.hero_image_url ? '<button type="button" class="btn light sm" id="heroDel"><i class="fa-solid fa-trash-can"></i> Retirer</button>' : ''}</div><input type="hidden" name="hero_image_url" value="${esc(s.hero_image_url || '')}"></div>
            <label class="field">Page Facebook<input name="facebook_url" type="url" value="${esc(s.facebook_url || '')}" placeholder="https://facebook.com/…"></label>
            <label class="field">Compte Instagram<input name="instagram_url" type="url" value="${esc(s.instagram_url || '')}" placeholder="https://instagram.com/…"></label>
            <label class="field">Compte TikTok<input name="tiktok_url" type="url" value="${esc(s.tiktok_url || '')}" placeholder="https://tiktok.com/@…"></label>
            <h4 class="full-span pm-sub"><i class="fa-solid fa-mobile-screen"></i> Paiement en ligne (Mobile Money)</h4>
            <label class="field">Code marchand MTN MoMo<input name="momo_code" inputmode="numeric" maxlength="20" value="${esc(s.momo_code || '')}" placeholder="Ex. : 245950"></label>
            <label class="field">Nom affiché au client (compte MoMo)<input name="momo_name" maxlength="80" value="${esc(s.momo_name || '')}"></label>
            <label class="field">Numéro MTN MoMo (transfert)<input name="momo_number" type="tel" maxlength="20" value="${esc(s.momo_number || '')}"></label>
            <label class="field">Code marchand Airtel Money<input name="airtel_code" maxlength="20" value="${esc(s.airtel_code || '')}" placeholder="Vide = non proposé"></label>
            <label class="field full-span">Consigne supplémentaire (facultatif)<input name="momo_instructions" maxlength="300" value="${esc(s.momo_instructions || '')}" placeholder="Ex. : indiquez votre nom dans le motif du paiement"></label>
            <label class="field is-check full-span"><span class="fl">Accepter le paiement à la livraison</span><input type="checkbox" name="accept_cash_on_delivery" ${s.accept_cash_on_delivery !== false ? 'checked' : ''}></label>
            <p class="muted small full-span">Le client paie au code marchand puis saisit la référence reçue par SMS : vous la vérifiez dans <b>Livraisons</b> (ou la fiche commande) avant de livrer. Frais par quartier : <b>Zones de livraison</b>.</p></div>
            <div class="actions" style="margin-top:12px"><button type="submit" class="btn primary"><i class="fa-solid fa-floppy-disk"></i> Enregistrer</button></div></form></section>`
        + (promos ? `<section class="card"><div class="card-head"><h3>Promotions sur la boutique</h3><span class="muted">Les promotions cochées s’affichent en bannière (avec compte à rebours si elles ont une date de fin)</span></div>${promos.length ? promos.map(pr => `<label class="m-row shop-promo"><span class="m-txt"><b>${esc(pr.name)} · <code>${esc(pr.code || '')}</code></b><small>${pr.discount_type === 'percent' ? '− ' + Number(pr.discount_value) + ' %' : '− ' + money(pr.discount_value)}${pr.ends_at ? ' · jusqu’au ' + fdate(pr.ends_at) : ''}${pr.is_active ? '' : ' · inactive'}</small></span><input type="checkbox" class="switch" data-promo="${esc(pr.id)}" ${pr.show_on_shop ? 'checked' : ''} ${pr.is_active ? '' : 'disabled'}></label>`).join('') : '<p class="muted">Aucune promotion. Créez-en une dans Marketing & fidélisation.</p>'}</section>` : '')
        + `<h3 style="margin:18px 0 8px">Commandes reçues en ligne</h3>`
        + X.table(['N° commande', 'Client', 'Livraison', 'Total', 'Statut', ''], orders.slice(0, 50).map(o => {
          const n = X.waNumber(o.customer_whatsapp || o.customers?.phone);
          return `<tr><td data-role="title"><b>${esc(o.order_number)}</b><br><small class="muted">${fdate(o.order_date)}</small></td><td data-role="meta">${esc(o.customers?.full_name || '—')}<br><small class="muted">${esc(o.customers?.phone || '')}</small></td><td data-role="meta">${esc(o.delivery_zone || o.delivery_address || '—')}</td><td data-role="meta"><b>${money(o.total)}</b></td><td data-role="meta">${app.status(o.status)}</td><td>${n ? `<a class="btn light sm" target="_blank" rel="noopener" href="https://wa.me/${n}?text=${encodeURIComponent(`Bonjour ${(o.customers?.full_name || '').split(' ')[0]}, nous avons bien reçu votre commande ${o.order_number} (${money(o.total)}). `)}"><i class="fa-brands fa-whatsapp"></i> Répondre</a>` : ''}</td></tr>`;
        }), 'Aucune commande en ligne pour le moment. Partagez le lien de votre boutique !')
        + `<p class="muted" style="margin-top:8px">Les commandes en ligne arrivent en <b>Brouillon</b> dans <b>Commandes</b> : appelez le client, ajoutez les frais de livraison si besoin, puis confirmez.</p>`;
      host.querySelector('#shopCopy').onclick = () => copy(url);
      host.querySelector('#shopPrint').onclick = () => X.printDoc({ title: 'Boutique en ligne', kicker: 'Commandez en ligne', subtitle: 'Scannez ce code avec votre téléphone',
        sections: [{ html: `<div style="text-align:center;padding:10px 0"><div style="width:250px;margin:0 auto">${X.qrSvg(url, 8)}</div><p style="color:#7b807d;font-size:13px;margin:12px 0 0;word-break:break-all">${esc(url)}</p></div>` }],
        pill: 'Livraison à Brazzaville', status: ['Commande en 1 minute · confirmation par téléphone', 'ok'] });
      host.querySelectorAll('[data-promo]').forEach(c => c.onchange = async () => {
        const { error } = await app.sb.from('promo_campaigns').update({ show_on_shop: c.checked, updated_at: new Date().toISOString() }).eq('id', c.dataset.promo);
        if (error) { c.checked = !c.checked; return app.toast(X.explain(error), true); } app.toast(c.checked ? 'Promotion affichée sur la boutique.' : 'Promotion retirée de la boutique.');
      });
      host.querySelector('#heroDel')?.addEventListener('click', () => { host.querySelector('[name=hero_image_url]').value = ''; host.querySelector('#shopForm').requestSubmit(); });
      host.querySelector('#heroFile')?.addEventListener('change', async e => {
        const file = e.target.files?.[0]; if (!file) return;
        if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) return app.toast('Choisissez une image PNG, JPG ou WEBP de 5 Mo maximum.', true);
        const path = `${app.state.user.id}/boutique-accueil-${Date.now()}.${file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'}`;
        const { error } = await app.sb.storage.from('myra-products').upload(path, file, { upsert: true, contentType: file.type, cacheControl: '86400' });
        if (error) return app.toast('Envoi impossible : ' + X.explain(error), true);
        host.querySelector('[name=hero_image_url]').value = app.sb.storage.from('myra-products').getPublicUrl(path).data.publicUrl;
        host.querySelector('#shopForm').requestSubmit();
      });
      host.querySelector('#shopForm').onsubmit = async e => {
        e.preventDefault(); const f = e.target;
        const row = { id: true, is_open: f.is_open.checked, headline: f.headline.value.trim() || 'Le secret de nos marmites', intro: f.intro.value.trim() || ' ', delivery_info: f.delivery_info.value.trim() || ' ', min_order: Math.max(0, Number(f.min_order.value) || 0), whatsapp: f.whatsapp.value.trim() || null, announcement: f.announcement.value.trim() || null, hours: f.hours.value.trim() || null, hero_image_url: f.hero_image_url.value || null,
          facebook_url: f.facebook_url.value.trim() || null, instagram_url: f.instagram_url.value.trim() || null, tiktok_url: f.tiktok_url.value.trim() || null, momo_code: f.momo_code.value.trim() || null, momo_name: f.momo_name.value.trim() || null, momo_number: f.momo_number.value.trim() || null, airtel_code: f.airtel_code.value.trim() || null, momo_instructions: f.momo_instructions.value.trim() || null, accept_cash_on_delivery: f.accept_cash_on_delivery.checked, updated_at: new Date().toISOString() };
        if ([row.facebook_url, row.instagram_url, row.tiktok_url].some(u => u && !/^https:\/\//.test(u))) return app.toast('Les liens des réseaux sociaux doivent commencer par https://', true);
        const { error } = await app.sb.from('shop_settings').upsert(row, { onConflict: 'id' }); if (error) return app.toast(X.explain(error), true);
        app.toast('Boutique mise à jour.'); EXT.pages.shop.render(host, app);
      };
    }
  };
})();
