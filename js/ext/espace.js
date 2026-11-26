/* Myra V36 — Mon espace : menu de l'avatar, profil enrichi (activité, sécurité, préférences), page Paramètres */
(() => {
  const X = window.MyraX, { EXT, A, esc, money, fdate } = X;
  const ROLES = { owner: 'Propriétaire', super_admin: 'Super administrateur', admin: 'Administrateur', manager: 'Gérant·e', sales: 'Vente', accountant: 'Comptabilité', stock_manager: 'Gestion de stock', employee: 'Employé·e' };
  const roleLabel = r => ROLES[r] || r || 'Utilisateur';
  const VERSION = 'V36';
  const pref = () => { try { return { theme: 'light', size: 'md', ...JSON.parse(localStorage.getItem('myra_display') || '{}') }; } catch (_) { return { theme: 'light', size: 'md' }; } };
  function applyTheme(theme) {
    const p = { ...pref(), theme }; try { localStorage.setItem('myra_display', JSON.stringify(p)); } catch (_) {}
    const dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('theme-dark', dark);
  }
  const canAdmin = () => ['owner', 'super_admin', 'admin'].includes(A()?.state?.profile?.role);

  /* ---------- Menu de l'avatar ---------- */
  let menuEl = null;
  function closeMenu() { menuEl?.remove(); menuEl = null; document.getElementById('topAvatar')?.setAttribute('aria-expanded', 'false'); }
  function openMenu(btn) {
    const app = A(); const p = app.state.profile || {}, u = app.state.user || {}; const name = p.full_name || u.email || 'Utilisateur';
    const unread = window.MyraNotif ? window.MyraNotif.state.items.filter(n => !n.read).length : 0; const th = pref().theme;
    const avatar = p.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="">` : esc(app.initials(name));
    const item = (go, ico, label, sub, extra = '') => `<button type="button" role="menuitem" data-go="${go}"><span class="am-ico"><i class="fa-solid ${ico}" aria-hidden="true"></i></span><span class="am-txt"><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</span>${extra}</button>`;
    menuEl = document.createElement('div'); menuEl.className = 'am-menu'; menuEl.setAttribute('role', 'menu'); menuEl.setAttribute('aria-label', 'Mon compte');
    menuEl.innerHTML = `<div class="am-head"><span class="am-av">${avatar}</span><span><b>${esc(name)}</b><small>${esc(u.email || p.email || '')}</small><em>${esc(roleLabel(p.role))}</em></span></div>
      <div class="am-theme" role="group" aria-label="Thème">${[['light', 'fa-sun', 'Clair'], ['dark', 'fa-moon', 'Sombre'], ['auto', 'fa-circle-half-stroke', 'Auto']].map(([v, i, l]) => `<button type="button" data-theme="${v}" class="${th === v ? 'on' : ''}" aria-pressed="${th === v}"><i class="fa-solid ${i}" aria-hidden="true"></i> ${l}</button>`).join('')}</div>
      <div class="am-group">${item('profile', 'fa-user', 'Mon profil', 'Informations, photo, sécurité')}${item('settings', 'fa-gear', 'Paramètres', 'Entreprise, boutique, données')}${item('notifications', 'fa-bell', 'Notifications', 'Historique et alertes', unread ? `<span class="am-count">${unread > 99 ? '99+' : unread}</span>` : '')}${item('display', 'fa-text-height', 'Affichage', 'Thème et taille du texte')}</div>
      <div class="am-group">${item('shop', 'fa-store', 'Boutique en ligne', 'Lien, QR code, commandes')}${item('__shop', 'fa-arrow-up-right-from-square', 'Voir ma boutique', 'Comme vos clients')}${item('__help', 'fa-keyboard', 'Aide et raccourcis', 'Recherche rapide : Ctrl K')}</div>
      <div class="am-group">${item('__logout', 'fa-arrow-right-from-bracket', 'Déconnexion', 'Fermer la session sur cet appareil')}</div>
      <div class="am-foot">Myra Business Manager · ${VERSION}</div>`;
    document.body.appendChild(menuEl);
    const r = btn.getBoundingClientRect(); menuEl.style.top = (r.bottom + 10) + 'px'; menuEl.style.right = Math.max(12, innerWidth - r.right) + 'px';
    btn.setAttribute('aria-expanded', 'true');
    menuEl.querySelectorAll('[data-theme]').forEach(b => b.onclick = () => { applyTheme(b.dataset.theme); closeMenu(); openMenu(btn); });
    menuEl.querySelectorAll('[data-go]').forEach(b => b.onclick = () => {
      const g = b.dataset.go; closeMenu();
      if (g === '__logout') return app.logout();
      if (g === '__shop') return window.open(new URL('boutique.html', location.href.split('#')[0]).href, '_blank', 'noopener');
      if (g === '__help') return help();
      app.navigate(g);
    });
    menuEl.querySelector('button')?.focus();
  }
  function help() {
    X.modal('Aide et raccourcis', `<div class="am-help">${[['Ctrl K', 'Recherche rapide : clients, ventes, produits, pages'], ['G puis D', 'Tableau de bord'], ['G puis V', 'Ventes'], ['G puis C', 'Clients'], ['G puis O', 'Commandes'], ['Échap', 'Fermer une fenêtre']].map(([k, t]) => `<div class="m-row"><span class="m-txt"><b>${esc(t)}</b></span><kbd>${esc(k)}</kbd></div>`).join('')}</div><p class="muted" style="margin-top:12px">Besoin d’aide ? Les notices de chaque version sont dans le dossier du projet (fichiers NOTES-V…).</p>`, '<button type="button" class="btn primary" data-close>Compris</button>');
  }
  document.addEventListener('click', e => {
    const btn = e.target.closest('#topAvatar');
    if (btn) { e.preventDefault(); e.stopImmediatePropagation(); menuEl ? closeMenu() : openMenu(btn); return; }
    if (menuEl && !e.target.closest('.am-menu')) closeMenu();
  }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && menuEl) { closeMenu(); document.getElementById('topAvatar')?.focus(); } });
  window.addEventListener('myra:navigate', closeMenu); window.addEventListener('resize', closeMenu);

  /* ---------- Profil enrichi ---------- */
  X.on('profile', async host => {
    const app = A(); const u = app.state.user || {}, p = app.state.profile || {};
    const wrap = document.createElement('div'); wrap.className = 'pf-more';
    const m0 = new Date(); m0.setDate(1); m0.setHours(0, 0, 0, 0); const since = m0.toISOString();
    wrap.innerHTML = `<section class="card"><div class="card-head"><h3>Mon activité ce mois-ci</h3><span class="muted">${esc(m0.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }))}</span></div><div class="pf-kpis" id="pfKpis"><div class="loading"><i class="fa-solid fa-circle-notch fa-spin"></i></div></div></section>
      <div class="pf-grid">
        <section class="card"><div class="card-head"><h3><i class="fa-solid fa-shield-halved"></i> Sécurité</h3></div>
          <div class="m-row"><span class="m-txt"><b>Dernière connexion</b><small>${u.last_sign_in_at ? esc(new Date(u.last_sign_in_at).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })) : '—'}</small></span></div>
          <div class="m-row"><span class="m-txt"><b>Compte créé le</b><small>${p.created_at || u.created_at ? fdate(p.created_at || u.created_at) : '—'}</small></span></div>
          <form id="pfPw" class="pf-pw"><b>Changer mon mot de passe</b><div class="form-grid"><label class="field">Nouveau mot de passe<input name="pw" type="password" autocomplete="new-password" minlength="8" required></label><label class="field">Confirmer<input name="pw2" type="password" autocomplete="new-password" minlength="8" required></label></div><p class="muted small">8 caractères minimum, avec des lettres et des chiffres.</p><div class="actions"><button class="btn primary" type="submit"><i class="fa-solid fa-key"></i> Mettre à jour</button></div></form>
          <div class="m-row"><span class="m-txt"><b>Déconnecter tous mes appareils</b><small>Utile en cas de perte d’un téléphone</small></span><button type="button" class="btn light sm" id="pfGlobal"><i class="fa-solid fa-right-from-bracket"></i> Tout déconnecter</button></div>
        </section>
        <section class="card"><div class="card-head"><h3><i class="fa-solid fa-sliders"></i> Préférences</h3></div>
          <div class="m-row"><span class="m-txt"><b>Thème</b><small>Sur cet appareil</small></span><div class="am-theme pf-seg">${[['light', 'Clair'], ['dark', 'Sombre'], ['auto', 'Auto']].map(([v, l]) => `<button type="button" data-th="${v}" class="${pref().theme === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
          <button type="button" class="m-row" data-pgo2="display"><span class="m-ico i-green"><i class="fa-solid fa-text-height"></i></span><span class="m-txt"><b>Taille du texte</b><small>Normale, grande ou très grande</small></span><i class="fa-solid fa-chevron-right m-chev"></i></button>
          <button type="button" class="m-row" data-pgo2="notifications"><span class="m-ico i-amber"><i class="fa-solid fa-bell"></i></span><span class="m-txt"><b>Notifications</b><small>Historique, alertes sur ce téléphone ou cet ordinateur</small></span><i class="fa-solid fa-chevron-right m-chev"></i></button>
          <button type="button" class="m-row" data-pgo2="settings"><span class="m-ico i-blue"><i class="fa-solid fa-gear"></i></span><span class="m-txt"><b>Paramètres de l’application</b><small>Entreprise, boutique, données, sauvegarde</small></span><i class="fa-solid fa-chevron-right m-chev"></i></button>
        </section>
      </div>`;
    host.appendChild(wrap);
    wrap.querySelectorAll('[data-pgo2]').forEach(b => b.onclick = () => app.navigate(b.dataset.pgo2));
    wrap.querySelectorAll('[data-th]').forEach(b => b.onclick = () => { applyTheme(b.dataset.th); wrap.querySelectorAll('[data-th]').forEach(x => x.classList.toggle('on', x === b)); });
    wrap.querySelector('#pfPw').onsubmit = async e => {
      e.preventDefault(); const f = e.target;
      if (f.pw.value !== f.pw2.value) return app.toast('Les deux mots de passe ne sont pas identiques.', true);
      if (f.pw.value.length < 8 || !/\d/.test(f.pw.value) || !/[a-z]/i.test(f.pw.value)) return app.toast('Choisissez au moins 8 caractères avec des lettres et des chiffres.', true);
      const { error } = await app.sb.auth.updateUser({ password: f.pw.value });
      if (error) return app.toast('Mot de passe non modifié : ' + X.explain(error), true); f.reset(); app.toast('Mot de passe mis à jour.');
    };
    wrap.querySelector('#pfGlobal').onclick = async () => { if (!confirm('Déconnecter ce compte sur TOUS les appareils (y compris celui-ci) ?')) return; await app.sb.auth.signOut({ scope: 'global' }).catch(() => {}); app.logout(); };
    try {
      const [s, o, pay] = await Promise.all([
        app.sb.from('sales').select('total,status').eq('created_by', u.id).gte('created_at', since),
        app.sb.from('customer_orders').select('total').eq('created_by', u.id).gte('created_at', since),
        app.sb.from('payments').select('amount,direction').eq('received_by', u.id).gte('created_at', since)]);
      const ok = (s.data || []).filter(x => !['draft', 'cancelled'].includes(x.status));
      const cash = (pay.data || []).filter(x => x.direction !== 'outgoing').reduce((n, x) => n + Number(x.amount || 0), 0);
      wrap.querySelector('#pfKpis').innerHTML = X.kpis([['fa-cash-register', 'Mes ventes', String(ok.length), money(ok.reduce((n, x) => n + Number(x.total || 0), 0)), 'k-green'],
        ['fa-bag-shopping', 'Commandes saisies', String((o.data || []).length), money((o.data || []).reduce((n, x) => n + Number(x.total || 0), 0)), 'k-blue'],
        ['fa-money-bill-wave', 'Encaissements', money(cash), 'reçus par moi', 'k-amber']]);
    } catch (_) { wrap.querySelector('#pfKpis').innerHTML = '<p class="muted">Activité indisponible hors connexion.</p>'; }
  });

  /* ---------- Paramètres ---------- */
  EXT.pages.settings = {
    title: 'Paramètres',
    async render(host, app) {
      X.loading(host);
      let c = null; try { ({ data: c } = await app.sb.from('company_settings').select('*').limit(1).maybeSingle()); } catch (_) {}
      const cs = c || {}; const ref = (() => { try { return new URL(window.MYRA_CONFIG.SUPABASE_URL).hostname.split('.')[0]; } catch (_) { return ''; } })();
      const swVer = await caches?.keys?.().then(k => (k.find(x => x.startsWith('myra-manager-shell-')) || '').replace('myra-manager-shell-', '')).catch(() => '') || '—';
      const tile = (go, ico, cls, t, d) => `<button type="button" class="st-tile" data-go="${go}"><span class="m-ico ${cls}"><i class="fa-solid ${ico}"></i></span><span><b>${t}</b><small>${d}</small></span></button>`;
      const field = (k, l, type = 'text', full = false) => `<label class="field ${full ? 'full-span' : ''}">${l}<input name="${k}" type="${type}" value="${esc(cs[k] ?? '')}" ${canAdmin() ? '' : 'disabled'}></label>`;
      host.innerHTML = X.head('Paramètres', 'Tout ce qui règle l’application : votre entreprise, la boutique, les notifications, les données et la sauvegarde.')
        + `<nav class="st-nav" aria-label="Rubriques">${[['st-ent', 'Entreprise'], ['st-mod', 'Modules'], ['st-data', 'Données'], ['st-app', 'Application']].map(([id, l]) => `<a href="#${id}" data-anchor="${id}">${l}</a>`).join('')}</nav>`
        + `<section class="card" id="st-ent"><div class="card-head"><h3><i class="fa-solid fa-building"></i> Entreprise et documents</h3>${canAdmin() ? '' : '<span class="muted">Lecture seule (réservé à la direction)</span>'}</div>
            <form id="stCompany"><div class="form-grid">${field('company_name', 'Nom de l’entreprise', 'text', true)}${field('phone', 'Téléphone', 'tel')}${field('email', 'E-mail', 'email')}${field('address', 'Adresse', 'text', true)}${field('logo_url', 'Adresse du logo (facultatif)', 'url', true)}${field('currency_label', 'Monnaie affichée')}${field('currency', 'Code monnaie')}${field('invoice_prefix', 'Préfixe des factures')}${field('quote_prefix', 'Préfixe des devis')}${field('sale_prefix', 'Préfixe des ventes')}${field('purchase_prefix', 'Préfixe des achats')}</div>
            <p class="muted small">Ces informations apparaissent sur les factures, devis, bons et sur la boutique en ligne.</p>${canAdmin() ? '<div class="actions"><button class="btn primary" type="submit"><i class="fa-solid fa-floppy-disk"></i> Enregistrer</button></div>' : ''}</form></section>`
        + `<section class="card" id="st-mod"><div class="card-head"><h3><i class="fa-solid fa-puzzle-piece"></i> Modules et réglages</h3></div><div class="st-tiles">
            ${tile('shop', 'fa-store', 'i-green', 'Boutique en ligne', 'Textes, image d’accueil, réseaux, ouverture')}
            ${tile('notifications', 'fa-bell', 'i-amber', 'Notifications', 'Historique et alertes par appareil')}
            ${tile('display', 'fa-circle-half-stroke', 'i-blue', 'Affichage', 'Mode sombre, taille du texte')}
            ${tile('marketing', 'fa-bullhorn', 'i-red', 'Promotions et fidélité', 'Codes promo, campagnes')}
            ${tile('team', 'fa-ranking-star', 'i-green', 'Équipe', 'Ventes et commissions')}
            ${tile('employees', 'fa-id-badge', 'i-blue', 'Employés', 'Fiches, salaires')}
            ${tile('stock_locations', 'fa-location-dot', 'i-amber', 'Lieux de stock', 'Boutique, entrepôt, marchés')}
            ${tile('product_categories', 'fa-tags', 'i-green', 'Catégories', 'Rangement du catalogue')}
            ${tile('sync_center', 'fa-rotate', 'i-blue', 'Synchronisation', 'Opérations hors connexion')}
            ${tile('__loyverse', 'fa-plug', 'i-red', 'Connecteur Loyverse', 'Tester la connexion')}
          </div></section>`
        + `<section class="card" id="st-data"><div class="card-head"><h3><i class="fa-solid fa-database"></i> Données et sauvegarde</h3></div>
            <div class="m-row"><span class="m-txt"><b>Sauvegarde complète (JSON)</b><small>Clients, produits, ventes, paiements, commandes, dépenses : à garder sur une clé USB ou un drive</small></span><button type="button" class="btn light sm" id="stBackup"><i class="fa-solid fa-download"></i> Télécharger</button></div>
            <div class="m-row"><span class="m-txt"><b>Liste des clients (Excel / CSV)</b><small>Nom, téléphone, adresse</small></span><button type="button" class="btn light sm" data-csv="customers"><i class="fa-solid fa-file-csv"></i> CSV</button></div>
            <div class="m-row"><span class="m-txt"><b>Catalogue (Excel / CSV)</b><small>Produits, prix, stock</small></span><button type="button" class="btn light sm" data-csv="products"><i class="fa-solid fa-file-csv"></i> CSV</button></div>
          </section>`
        + `<section class="card" id="st-app"><div class="card-head"><h3><i class="fa-solid fa-mobile-screen"></i> Application</h3></div>
            <div class="m-row"><span class="m-txt"><b>Version</b><small>Myra Business Manager ${VERSION} · cache ${esc(swVer)}</small></span><button type="button" class="btn light sm" id="stUpdate"><i class="fa-solid fa-arrows-rotate"></i> Rechercher une mise à jour</button></div>
            <div class="m-row"><span class="m-txt"><b>Connexion</b><small>${navigator.onLine ? 'En ligne' : 'Hors connexion'} · base ${esc(ref)}</small></span></div>
            <div class="m-row"><span class="m-txt"><b>Application installée</b><small>${matchMedia('(display-mode: standalone)').matches ? 'Oui, ouverte depuis l’icône' : 'Non : utilisez « Installer » ou « Ajouter à l’écran d’accueil »'}</small></span></div>
            <div class="m-row"><span class="m-txt"><b>Vider les données locales</b><small>Efface le cache de cet appareil (pas vos données en ligne). Reconnexion nécessaire.</small></span><button type="button" class="btn light sm" id="stClear"><i class="fa-solid fa-broom"></i> Vider</button></div>
          </section>`;
      host.querySelectorAll('[data-anchor]').forEach(a => a.onclick = e => { e.preventDefault(); host.querySelector('#' + a.dataset.anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
      host.querySelectorAll('.st-tile').forEach(b => b.onclick = () => b.dataset.go === '__loyverse' ? window.open('loyverse.html', '_blank', 'noopener') : app.navigate(b.dataset.go));
      host.querySelector('#stCompany').onsubmit = async e => {
        e.preventDefault(); if (!canAdmin()) return;
        const row = Object.fromEntries(new FormData(e.target)); Object.keys(row).forEach(k => { row[k] = String(row[k]).trim() || null; }); row.updated_at = new Date().toISOString();
        if (!row.company_name) return app.toast('Le nom de l’entreprise est obligatoire.', true);
        const q = cs.id ? app.sb.from('company_settings').update(row).eq('id', cs.id) : app.sb.from('company_settings').insert(row);
        const { error } = await q; if (error) return app.toast(X.explain(error), true); app.toast('Informations de l’entreprise enregistrées.');
      };
      host.querySelector('#stBackup').onclick = async e => {
        const b = e.currentTarget; b.disabled = true; b.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Préparation…';
        const tables = ['customers', 'products', 'product_categories', 'sales', 'sale_items', 'payments', 'customer_orders', 'customer_order_items', 'expenses', 'company_settings'];
        const out = { app: 'Myra Business Manager', version: VERSION, exported_at: new Date().toISOString(), tables: {} };
        for (const t of tables) { const r = await app.fetchAll(() => app.sb.from(t).select('*').order('created_at'), 50000).catch(e => ({ error: e })); out.tables[t] = r.error ? { erreur: X.explain(r.error) } : r.data; }
        const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' }));
        const a = Object.assign(document.createElement('a'), { href: url, download: `myra-sauvegarde-${new Date().toISOString().slice(0, 10)}.json` }); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
        b.disabled = false; b.innerHTML = '<i class="fa-solid fa-download"></i> Télécharger'; app.toast('Sauvegarde téléchargée.');
      };
      host.querySelectorAll('[data-csv]').forEach(b => b.onclick = async () => { const t = b.dataset.csv; const r = await app.fetchAll(() => app.sb.from(t).select('*').order('created_at'), 50000); if (r.error) return app.toast(X.explain(r.error), true); app.exportCsv(t, r.data || []); });
      host.querySelector('#stUpdate').onclick = async () => { const r = await navigator.serviceWorker?.getRegistration(); if (!r) return app.toast('Mise à jour : rechargez la page.'); await r.update(); app.toast(r.installing || r.waiting ? 'Nouvelle version téléchargée : rechargement…' : 'Vous avez la dernière version.'); if (r.installing || r.waiting) setTimeout(() => location.reload(), 1500); };
      host.querySelector('#stClear').onclick = async () => { if (!confirm('Vider les données locales de cet appareil ? Vous devrez vous reconnecter.')) return; try { (await caches.keys()).forEach(k => caches.delete(k)); } catch (_) {} try { localStorage.clear(); sessionStorage.clear(); } catch (_) {} location.reload(); };
    }
  };
})();
