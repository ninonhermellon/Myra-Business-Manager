/* Myra V30 — 5. Mise à jour en direct entre appareils · 6. Thème clair / sombre et taille du texte */
(() => {
  const X = window.MyraX, { EXT, A, esc, money } = X;

  /* ---------- 6. Affichage (préférence propre à chaque appareil) ---------- */
  const PREF = 'myra_display';
  const read = () => { try { return JSON.parse(localStorage.getItem(PREF) || '{}'); } catch (_) { return {}; } };
  const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function apply(p = read()) {
    const dark = p.theme === 'dark' || (p.theme === 'auto' && media?.matches);
    const root = document.documentElement;
    root.classList.toggle('theme-dark', !!dark);
    root.classList.remove('text-lg', 'text-xl'); if (p.size === 'lg' || p.size === 'xl') root.classList.add('text-' + p.size);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#111814' : '#0d4426');
  }
  apply(); media?.addEventListener?.('change', () => apply());
  X.menu('MON ESPACE', [['display', 'Affichage', 'fa-circle-half-stroke']]);
  EXT.pages.display = {
    title: 'Affichage',
    render(host) {
      const p = { theme: 'light', size: 'md', ...read() };
      const seg = (name, opts) => `<div class="seg att-seg" role="group">${opts.map(([v, l, i]) => `<button type="button" data-${name}="${v}" class="${p[name] === v ? 'on' : ''}" aria-pressed="${p[name] === v}"><i class="fa-solid ${i}"></i> ${l}</button>`).join('')}</div>`;
      host.innerHTML = X.head('Affichage', 'Ces réglages ne concernent que cet appareil.')
        + `<section class="card ext-form"><h3>Thème</h3><p class="muted">Le mode sombre repose les yeux le soir ; le mode clair se lit mieux en plein soleil.</p>${seg('theme', [['light', 'Clair', 'fa-sun'], ['dark', 'Sombre', 'fa-moon'], ['auto', 'Comme le téléphone', 'fa-circle-half-stroke']])}</section>`
        + `<section class="card ext-form"><h3>Taille du texte</h3><p class="muted">Agrandit tout l’affichage (textes, boutons, tableaux).</p>${seg('size', [['md', 'Normale', 'fa-font'], ['lg', 'Grande', 'fa-font'], ['xl', 'Très grande', 'fa-font']])}</section>`;
      host.querySelectorAll('[data-theme],[data-size]').forEach(b => b.onclick = () => {
        const k = b.dataset.theme ? 'theme' : 'size'; p[k] = b.dataset[k];
        try { localStorage.setItem(PREF, JSON.stringify(p)); } catch (_) {}
        apply(p); EXT.pages.display.render(host);
      });
    }
  };

  /* ---------- 5. Temps réel : ventes, commandes et paiements faits sur un autre appareil ---------- */
  let channel = null, timer = null;
  const REFRESH = { sales: ['sales', 'dashboard', 'report', 'credit'], customer_orders: ['commandes', 'dashboard'], payments: ['payments', 'dashboard', 'finances', 'credit'] };
  function refresh(table) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const app = A(), page = app.state.page;
      if (document.querySelector('#modalRoot .modal')) return; // ne jamais interrompre une saisie en cours
      if (page === 'dashboard') return app.refreshDashboard();
      if ((REFRESH[table] || []).includes(page)) app.navigate(page, { silent: true, replace: true });
    }, 800);
  }
  function start() {
    const app = A(); if (channel || !app?.sb?.channel || !app.state.user) return;
    channel = app.sb.channel('myra-direct')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sales' }, ({ new: s }) => { if (s.created_by && s.created_by !== app.state.user?.id) app.toast(`Nouvelle vente enregistrée sur un autre appareil${s.total ? ' : ' + money(s.total) : ''}.`); refresh('sales'); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sales' }, () => refresh('sales'))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'customer_orders' }, ({ new: o }) => { if (o.created_by !== app.state.user?.id) app.toast(o.source === 'web' ? `🛒 Nouvelle commande en ligne${o.order_number ? ' ' + o.order_number : ''} : à confirmer dans Commandes.` : `Nouvelle commande${o.order_number ? ' ' + o.order_number : ''}.`); refresh('customer_orders'); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'customer_orders' }, () => refresh('customer_orders'))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'payments' }, () => refresh('payments'))
      .subscribe(status => { const dot = document.getElementById('connectionDot'); if (dot) dot.title = status === 'SUBSCRIBED' ? 'Connecté en direct' : ''; document.documentElement.classList.toggle('live-on', status === 'SUBSCRIBED'); });
  }
  window.addEventListener('myra:navigate', () => setTimeout(start, 1500));
  window.addEventListener('online', () => { if (channel) { A().sb.removeChannel(channel); channel = null; } setTimeout(start, 1000); });
})();
