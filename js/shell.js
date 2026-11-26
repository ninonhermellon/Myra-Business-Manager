/* Myra Business Manager — couche d'expérience (chargée après app.js)
   Palette de commandes, création rapide, notifications, navigation mobile,
   routage par URL, états de chargement, accessibilité des modales. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const App = () => window.MyraApp;
  const UI = window.MyraUI || {};
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { } }
  };
  const isTyping = el => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  const plural = (n, a, b) => n > 1 ? b : a;

  /* ---------- Densité d'affichage ---------- */
  const applyDensity = () => document.documentElement.classList.toggle('compact', !!store.get('myra_compact', false));
  applyDensity();

  /* ---------- Connexion : mot de passe, Verr. Maj. ---------- */
  const pw = $('#password');
  $('#togglePw')?.addEventListener('click', e => {
    const show = pw.type === 'password'; pw.type = show ? 'text' : 'password';
    e.currentTarget.setAttribute('aria-pressed', String(show));
    e.currentTarget.setAttribute('aria-label', show ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
    e.currentTarget.innerHTML = `<i class="fa-regular ${show ? 'fa-eye-slash' : 'fa-eye'}" aria-hidden="true"></i>`;
    pw.focus();
  });
  const caps = e => { const on = e.getModifierState && e.getModifierState('CapsLock'); $('#capsHint')?.classList.toggle('hidden', !on); };
  pw?.addEventListener('keydown', caps); pw?.addEventListener('keyup', caps);
  pw?.addEventListener('blur', () => $('#capsHint')?.classList.add('hidden'));
  try { const last = localStorage.getItem('myra_last_email'); if (last && $('#email') && !$('#email').value) { $('#email').value = last; setTimeout(() => pw?.focus(), 50); } } catch (_) { }
  $('#loginForm')?.addEventListener('submit', () => { try { localStorage.setItem('myra_last_email', ($('#email').value || '').trim()); } catch (_) { } });

  /* ---------- Popovers ---------- */
  const popovers = [];
  function popover(btn, panel, onOpen) {
    const api = {
      btn, panel,
      open() { popovers.forEach(p => p !== api && p.close()); onOpen?.(); panel.classList.remove('hidden'); btn.setAttribute('aria-expanded', 'true'); },
      close() { panel.classList.add('hidden'); btn.setAttribute('aria-expanded', 'false'); },
      toggle() { panel.classList.contains('hidden') ? api.open() : api.close(); }
    };
    btn.addEventListener('click', e => { e.stopPropagation(); api.toggle(); });
    panel.addEventListener('click', e => e.stopPropagation());
    popovers.push(api); return api;
  }
  document.addEventListener('click', () => popovers.forEach(p => p.close()));

  /* ---------- Création rapide ---------- */
  const quickItems = () => {
    const A = App();
    return [
      ['fa-receipt', 'Nouvelle vente', 'Facture multi-articles', () => A.openSaleWorkflow()],
      ['fa-bag-shopping', 'Nouvelle commande client', 'Suivi jusqu’à la livraison', () => A.openOrderWorkflow()],
      ['fa-money-bill-transfer', 'Enregistrer un paiement', 'Encaissement ou décaissement', () => A.openPaymentWorkflow()],
      ['fa-user-plus', 'Nouveau client', 'Fiche et fidélité', () => A.openForm('customers')],
      ['fa-box', 'Nouveau produit', 'Catalogue et stock', () => A.openForm('products')],
      ['fa-truck-ramp-box', 'Approvisionnement', 'Commande fournisseur', () => A.openPurchaseWorkflow()],
      ['fa-wallet', 'Nouvelle dépense', 'Charge ou sortie d’argent', () => A.openForm('expenses')]
    ];
  };
  const qcBtn = $('#quickCreateBtn'), qcMenu = $('#quickCreateMenu');
  let qc;
  if (qcBtn && qcMenu) {
    qc = popover(qcBtn, qcMenu, () => {
      qcMenu.innerHTML = quickItems().map(([ico, t, sub], i) => `<button type="button" role="menuitem" data-qc="${i}"><span class="pi"><i class="fa-solid ${ico}" aria-hidden="true"></i></span><span><b>${esc(t)}</b><small>${esc(sub)}</small></span></button>`).join('');
    });
    qcMenu.addEventListener('click', e => {
      const b = e.target.closest('[data-qc]'); if (!b) return;
      qc.close(); quickItems()[Number(b.dataset.qc)][3]();
    });
  }

  /* ---------- Notifications ---------- */
  const get = (...keys) => { for (const k of keys) { const v = App()?.readOffline(k); if (Array.isArray(v) && v.length) return v; } return []; };
  async function computeAlerts() {
    const A = App(); const out = [];
    if (!A) return out;
    if (!navigator.onLine) out.push({ tone: 'warn', icon: 'fa-wifi', title: 'Mode hors connexion', text: 'Vous consultez les dernières données enregistrées sur cet appareil.' });
    const low = get('dashboard:products', 'table:products').filter(x => x.is_active !== false && Number(x.stock_quantity || 0) <= Number(x.min_stock || 0));
    if (low.length) out.push({ tone: 'warn', icon: 'fa-boxes-stacked', title: `${low.length} ${plural(low.length, 'produit', 'produits')} en stock bas`, text: low.slice(0, 3).map(x => x.name).join(', ') + (low.length > 3 ? '…' : ''), go: 'products' });
    const late = get('dashboard:sales').filter(x => ['confirmed', 'partially_paid'].includes(x.status) && Number(x.total || 0) > Number(x.amount_paid || 0) && (Date.now() - new Date(x.sale_date || x.created_at)) > 30 * 864e5);
    if (late.length) out.push({ tone: 'danger', icon: 'fa-hand-holding-dollar', title: `${late.length} ${plural(late.length, 'créance', 'créances')} de plus de 30 jours`, text: A.money(late.reduce((a, x) => a + Number(x.total || 0) - Number(x.amount_paid || 0), 0)) + ' à recouvrer', go: 'sales' });
    const prep = get('dashboard:customer_orders').filter(o => ['confirmed', 'processing'].includes(o.status));
    if (prep.length) out.push({ tone: 'info', icon: 'fa-bag-shopping', title: `${prep.length} ${plural(prep.length, 'commande', 'commandes')} à préparer`, text: 'Confirmées ou en préparation.', go: 'commandes' });
    const queued = await A.outboxAll().catch(() => []);
    if (queued.length) out.push({ tone: 'info', icon: 'fa-rotate', title: `${queued.length} ${plural(queued.length, 'opération', 'opérations')} en attente de synchronisation`, text: 'Ouvrez le centre de synchronisation.', go: 'sync_center' });
    return out;
  }
  /* La cloche affiche le centre de notifications (js/ext/notifcenter.js) : le compteur = notifications NON LUES.
     Les alertes permanentes (stock bas, créances…) sont rangées dans l'onglet « À traiter ». */
  const bellBtn = $('#bellBtn'), bellPanel = $('#bellPanel');
  async function renderBell() { const alerts = await computeAlerts(); window.MyraNotif?.setAlerts(alerts); return alerts; }
  if (bellBtn && bellPanel) {
    bellPanel.classList.add('nc-pop');
    const bp = popover(bellBtn, bellPanel, () => { window.MyraNotif?.panel(bellPanel, () => bp.close()); renderBell(); window.MyraNotif?.load(); });
  }
  setInterval(() => { if (!$('#appView')?.classList.contains('hidden')) renderBell(); }, 60000);
  window.addEventListener('online', renderBell); window.addEventListener('offline', renderBell);

  /* ---------- Palette de commandes ---------- */
  const pal = document.createElement('div');
  pal.className = 'pal-backdrop hidden'; pal.id = 'palette';
  pal.innerHTML = `<div class="pal" role="dialog" aria-modal="true" aria-label="Recherche rapide"><div class="pal-input"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input id="palInput" type="text" placeholder="Rechercher un client, une vente, un produit ou une page…" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="palList" aria-autocomplete="list"><kbd>Échap</kbd></div><div class="pal-list" id="palList" role="listbox" aria-label="Résultats"></div><div class="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> naviguer</span><span><kbd>↵</kbd> ouvrir</span><span class="pal-hide-sm"><kbd>G</kbd> puis <kbd>D</kbd> <kbd>V</kbd> <kbd>C</kbd> <kbd>O</kbd> accès direct</span></div></div>`;
  document.body.append(pal);
  const palInput = $('#palInput'), palList = $('#palList');
  let palItems = [], palActive = 0, palPrev = null;
  const recents = () => store.get('myra_recent_pages', []);
  const goSearch = async (page, q) => { await App().navigate(page); const el = $('#tableSearch'); if (el) { el.value = q; el.dispatchEvent(new Event('input', { bubbles: true })); } };
  function buildPalette(q) {
    const A = App(); if (!A) return [];
    const t = norm(q).split(/\s+/).filter(Boolean);
    const match = (label, extra = '') => { if (!t.length) return 3; const l = norm(label), all = l + ' ' + norm(extra); if (!t.every(x => all.includes(x))) return -1; return l.startsWith(t[0]) ? 0 : l.includes(t[0]) ? 1 : 2; };
    const out = [];
    const push = (group, arr, limit) => { arr.filter(x => x.score >= 0).sort((a, b) => a.score - b.score).slice(0, limit).forEach(x => out.push({ ...x, group })); };
    const actions = quickItems().map(([ico, label, sub, run]) => ({ icon: ico, label, sub: 'Action rapide · ' + sub, run, score: match(label, 'creer ajouter nouveau ' + sub) }));
    actions.push({ icon: 'fa-table-columns', label: store.get('myra_compact', false) ? 'Affichage confortable' : 'Affichage compact', sub: 'Préférence · densité des tableaux', run: () => { store.set('myra_compact', !store.get('myra_compact', false)); applyDensity(); UI.toast?.('Affichage mis à jour.'); }, score: match('affichage compact confortable densite') });
    push('Actions', actions, q ? 4 : 5);
    if (!q) {
      const rec = recents().filter(id => A.isPage(id)).slice(0, 4).map(id => ({ icon: 'fa-clock-rotate-left', label: A.pageTitle(id), sub: 'Consulté récemment', run: () => A.navigate(id), score: 0 }));
      push('Récents', rec, 4);
    }
    const pages = A.groups.flatMap(g => g.items.map(([id, label, ico]) => ({ icon: ico, label, sub: g.label, run: () => A.navigate(id), score: match(label, g.label + ' ' + id) })));
    push('Pages', pages, q ? 6 : 30);
    if (q) {
      const customers = get('table:customers', 'dashboard:customers').map(c => ({ icon: 'fa-user', label: c.full_name || 'Client', sub: [c.company_name, c.phone].filter(Boolean).join(' · ') || 'Client', run: () => A.openCustomerDetail(c.id), score: match(c.full_name, [c.company_name, c.phone, c.email].join(' ')) }));
      push('Clients', customers, 5);
      const custMap = new Map(get('table:customers', 'dashboard:customers').map(c => [c.id, c.full_name]));
      const seen = new Set(); const salesRows = [...get('table:sales'), ...get('dashboard:sales')].filter(s => !seen.has(s.id) && seen.add(s.id));
      push('Ventes', salesRows.map(s => ({ icon: 'fa-receipt', label: s.sale_number || 'Vente', sub: `${custMap.get(s.customer_id) || 'Client comptant'} · ${A.money(s.total)}`, run: () => A.openSaleDetail(s.id), score: match(s.sale_number, (custMap.get(s.customer_id) || '') + ' ' + (s.status || '')) })), 5);
      const prods = get('table:products', 'dashboard:products').map(p => ({ icon: 'fa-box', label: p.name || 'Produit', sub: `Stock : ${Number(p.stock_quantity || 0)}`, run: () => goSearch('products', p.name || ''), score: match(p.name, p.sku || '') }));
      push('Produits', prods, 5);
    }
    return out;
  }
  function drawPalette() {
    palItems = buildPalette(palInput.value.trim());
    if (palActive >= palItems.length) palActive = Math.max(0, palItems.length - 1);
    if (!palItems.length) { palList.innerHTML = `<div class="empty small"><span class="empty-ico"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i></span><b>Aucun résultat</b><p>Essayez un nom de client, un numéro de vente ou un produit.</p></div>`; palInput.removeAttribute('aria-activedescendant'); return; }
    let last = '';
    palList.innerHTML = palItems.map((it, i) => { const h = it.group !== last ? `<div class="pal-group" role="presentation">${esc(it.group)}</div>` : ''; last = it.group; return `${h}<button type="button" role="option" id="po${i}" class="pal-item ${i === palActive ? 'active' : ''}" data-i="${i}" aria-selected="${i === palActive}"><span class="pi"><i class="fa-solid ${it.icon}" aria-hidden="true"></i></span><span class="pal-t"><b>${esc(it.label)}</b><small>${esc(it.sub || '')}</small></span><i class="fa-solid fa-turn-down-left pal-enter" aria-hidden="true"></i></button>`; }).join('');
    palInput.setAttribute('aria-activedescendant', 'po' + palActive);
  }
  function setActive(i) { palActive = (i + palItems.length) % Math.max(1, palItems.length); $$('.pal-item', palList).forEach((el, k) => { el.classList.toggle('active', k === palActive); el.setAttribute('aria-selected', String(k === palActive)); }); $('#po' + palActive)?.scrollIntoView({ block: 'nearest' }); palInput.setAttribute('aria-activedescendant', 'po' + palActive); }
  function openPalette() { if ($('#appView')?.classList.contains('hidden') || !App()) return; popovers.forEach(p => p.close()); palPrev = document.activeElement; pal.classList.remove('hidden'); document.body.classList.add('has-dialog'); palInput.value = ''; palActive = 0; drawPalette(); palInput.focus(); }
  function closePalette() { if (pal.classList.contains('hidden')) return; pal.classList.add('hidden'); document.body.classList.remove('has-dialog'); try { palPrev?.focus?.(); } catch (_) { } }
  function runPalette(i) { const it = palItems[i]; if (!it) return; pal.classList.add('hidden'); document.body.classList.remove('has-dialog'); setTimeout(() => it.run(), 10); }
  palInput.addEventListener('input', () => { palActive = 0; drawPalette(); });
  palInput.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(palActive + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(palActive - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); runPalette(palActive); }
    else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
    else if (e.key === 'Tab') { e.preventDefault(); }
  });
  palList.addEventListener('click', e => { const b = e.target.closest('.pal-item'); if (b) runPalette(Number(b.dataset.i)); });
  palList.addEventListener('mousemove', e => { const b = e.target.closest('.pal-item'); if (b && Number(b.dataset.i) !== palActive) setActive(Number(b.dataset.i)); });
  pal.addEventListener('mousedown', e => { if (e.target === pal) closePalette(); });
  $('#openPalette')?.addEventListener('click', openPalette);

  /* ---------- Raccourcis clavier ---------- */
  let gPending = 0;
  document.addEventListener('keydown', e => {
    if ($('#appView')?.classList.contains('hidden')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); pal.classList.contains('hidden') ? openPalette() : closePalette(); return; }
    if (e.key === 'Escape') { popovers.forEach(p => p.close()); $('#sidebar')?.classList.remove('open'); return; }
    if (isTyping(e.target) || mod || e.altKey || document.body.classList.contains('has-dialog')) return;
    if (e.key === '/') { e.preventDefault(); openPalette(); return; }
    if (gPending && Date.now() - gPending < 1200) {
      const map = { d: 'dashboard', v: 'sales', c: 'customers', o: 'commandes', s: 'products', f: 'finances', p: 'payments', m: 'marketing' };
      const page = map[e.key.toLowerCase()]; gPending = 0;
      if (page) { e.preventDefault(); App().navigate(page); } return;
    }
    if (e.key.toLowerCase() === 'g') { gPending = Date.now(); return; }
    if (e.key.toLowerCase() === 'n') { const b = $('#addBtn') || $('#newOrder') || $('#dashNewSale'); if (b) { e.preventDefault(); b.click(); } }
  });

  /* ---------- Historique / URL ---------- */
  window.addEventListener('popstate', () => {
    const A = App(); if (!A?.state.user) return;
    const p = decodeURIComponent((location.hash || '').replace(/^#\/?/, ''));
    A.navigate(A.isPage(p) ? p : 'dashboard', { silent: true });
  });
  window.addEventListener('myra:navigate', e => {
    const page = e.detail.page;
    const r = recents().filter(x => x !== page); if (page !== 'dashboard') r.unshift(page); store.set('myra_recent_pages', r.slice(0, 6));
    $$('#bottomNav [data-bn]').forEach(b => b.classList.toggle('active', b.dataset.bn === page));
    $('#bnMenu')?.classList.toggle('active', !['dashboard', 'sales', 'customers'].includes(page));
    setTimeout(renderBell, 1800);
    popovers.forEach(p => p.close());
    const content = $('#pageContent'); if (content) content.setAttribute('aria-busy', 'true');
  });

  /* ---------- Navigation mobile ---------- */
  const sidebar = $('#sidebar');
  const syncNav = () => { const open = sidebar.classList.contains('open'); document.body.classList.toggle('nav-open', open); $('#menuToggle')?.setAttribute('aria-expanded', String(open)); };
  if (sidebar) {
    new MutationObserver(syncNav).observe(sidebar, { attributes: true, attributeFilter: ['class'] });
    $('#scrim')?.addEventListener('click', () => sidebar.classList.remove('open'));
    let sx = null;
    sidebar.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
    sidebar.addEventListener('touchend', e => { if (sx !== null && e.changedTouches[0].clientX - sx < -60) sidebar.classList.remove('open'); sx = null; }, { passive: true });
  }
  $$('#bottomNav [data-bn]').forEach(b => b.addEventListener('click', () => App().navigate(b.dataset.bn)));
  $('#bnMenu')?.addEventListener('click', () => sidebar.classList.toggle('open'));
  $('#bnPlus')?.addEventListener('click', e => { e.stopPropagation(); qc?.toggle(); });
  const appView = $('#appView');
  const syncAppView = () => { $('#bottomNav')?.classList.toggle('hidden', appView.classList.contains('hidden')); document.body.classList.toggle('in-app', !appView.classList.contains('hidden')); };
  if (appView) { new MutationObserver(syncAppView).observe(appView, { attributes: true, attributeFilter: ['class'] }); syncAppView(); }

  /* ---------- Squelettes de chargement ---------- */
  const skel = page => {
    const kpi = n => `<div class="sk-kpis">${Array.from({ length: n }, () => '<div class="sk-card"><i class="sk w40"></i><i class="sk w70 lg"></i><i class="sk w55"></i></div>').join('')}</div>`;
    const rows = n => Array.from({ length: n }, () => '<div class="sk-row"><i class="sk w15"></i><i class="sk w30"></i><i class="sk w20"></i><i class="sk w15"></i></div>').join('');
    if (page === 'dashboard') return `<div class="skeleton-wrap" aria-hidden="true"><div class="sk-head"><i class="sk w30 lg"></i><i class="sk w50"></i></div>${kpi(4)}<div class="sk-grid"><div class="sk-panel tall"><i class="sk w30"></i><i class="sk block"></i></div><div class="sk-panel tall"><i class="sk w40"></i>${rows(4)}</div></div></div>`;
    return `<div class="skeleton-wrap" aria-hidden="true"><div class="sk-head"><i class="sk w30 lg"></i><i class="sk w50"></i></div><div class="sk-panel"><i class="sk w25"></i>${rows(7)}</div></div>`;
  };
  const content = $('#pageContent');
  if (content) {
    new MutationObserver(() => {
      const first = content.firstElementChild;
      if (first && content.children.length === 1 && first.classList.contains('loading')) {
        content.setAttribute('aria-busy', 'true');
        content.innerHTML = skel(App()?.state.page);
      } else if (first && !first.classList.contains('skeleton-wrap')) {
        content.removeAttribute('aria-busy');
      }
      a11yIcons(content);
    }).observe(content, { childList: true });
  }

  /* ---------- Accessibilité des boutons-icônes ---------- */
  function a11yIcons(root) {
    $$('button[title]:not([aria-label]), a[title]:not([aria-label])', root).forEach(el => el.setAttribute('aria-label', el.getAttribute('title')));
    $$('.icon-action:not([aria-label]):not([title])', root).forEach(el => { if (el.id === 'closeModal') el.setAttribute('aria-label', 'Fermer'); });
  }

  /* ---------- Modales existantes : focus, Échap, protection des saisies ---------- */
  const modalRoot = $('#modalRoot');
  if (modalRoot) {
    let opener = null, dirty = false;
    const closeModal = async force => {
      if (!modalRoot.firstElementChild) return;
      if (!force && dirty && UI.confirm) { const ok = await UI.confirm('Vous avez des modifications non enregistrées. Fermer quand même ?', { title: 'Abandonner la saisie ?', confirmText: 'Fermer sans enregistrer', cancelText: 'Continuer la saisie', danger: true }); if (!ok) return; }
      modalRoot.innerHTML = '';
    };
    new MutationObserver(() => {
      const has = !!modalRoot.firstElementChild;
      document.body.classList.toggle('modal-open', has);
      if (has) {
        const m = $('.modal', modalRoot);
        if (m && !m.hasAttribute('role')) {
          m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
          const h = $('h3, h2', m); if (h) { h.id = h.id || 'modalTitle'; m.setAttribute('aria-labelledby', h.id); }
          dirty = false; opener = document.activeElement;
          a11yIcons(modalRoot);
          setTimeout(() => { const f = $('input:not([type=hidden]):not([disabled]),select,textarea', m); (f || $('button', m))?.focus?.(); }, 40);
        }
      } else { dirty = false; try { opener?.focus?.(); } catch (_) { } opener = null; }
    }).observe(modalRoot, { childList: true });
    modalRoot.addEventListener('input', e => { if (e.target.closest('form')) dirty = true; });
    modalRoot.addEventListener('submit', () => { dirty = false; }, true);
    modalRoot.addEventListener('mousedown', e => { if (e.target.classList.contains('modal-backdrop')) closeModal(false); });
    modalRoot.addEventListener('click', e => {
      if (e.target.closest('#closeModal,#cancelModal')) { if (dirty) { e.stopImmediatePropagation(); closeModal(false); } }
    }, true);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && modalRoot.firstElementChild && !document.body.classList.contains('has-dialog')) { e.preventDefault(); closeModal(false); }
      if (e.key === 'Tab' && modalRoot.firstElementChild && !document.body.classList.contains('has-dialog')) {
        const m = $('.modal', modalRoot); if (!m) return;
        const items = $$('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled])', m).filter(x => x.offsetParent !== null);
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  /* ---------- Menu latéral réductible (rail d'icônes) ---------- */
  const brand = $('.sidebar .brand');
  if (brand) {
    const rb = document.createElement('button');
    rb.type = 'button'; rb.id = 'railToggle'; rb.className = 'rail-toggle'; rb.setAttribute('aria-label', 'Réduire ou agrandir le menu');
    rb.innerHTML = '<i class="fa-solid fa-angles-left" aria-hidden="true"></i>';
    brand.append(rb);
    const applyRail = () => { const on = !!store.get('myra_rail', false); document.body.classList.toggle('rail', on); rb.setAttribute('aria-pressed', String(on)); };
    rb.addEventListener('click', () => { store.set('myra_rail', !store.get('myra_rail', false)); applyRail(); });
    applyRail();
  }

  /* ---------- Premier rendu ---------- */
  setTimeout(renderBell, 2500);
})();
