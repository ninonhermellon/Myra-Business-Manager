/* LSM Business Manager V39 — Administration : Utilisateurs (créer, modifier, supprimer), droits par rôle, journal d'activité,
   et application des droits dans l'interface (menu filtré, boutons de suppression, coûts). */
(() => {
  const X = window.MyraX, { EXT, A, esc, money } = X;
  const ROLES = { owner: 'Propriétaire', admin: 'Administrateur', manager: 'Gérant·e', sales: 'Vente', stock_manager: 'Gestion de stock', accountant: 'Comptabilité', employee: 'Employé·e', driver: 'Livreur·se' };
  const ROLE_HELP = { owner: 'Tous les droits', admin: 'Tout, sauf toucher au propriétaire', manager: 'Gère ventes, stock, clients, équipe au quotidien', sales: 'Ventes, clients, commandes', stock_manager: 'Produits, stock, achats', accountant: 'Paiements, dépenses, rapports', employee: 'Accès de base', driver: 'Ses livraisons uniquement' };
  const roleLabel = r => ROLES[r] || r || '—';
  const isBoss = () => ['owner', 'admin'].includes(A()?.state?.profile?.role);
  const fdt = d => d ? new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'jamais';
  const tempPw = () => { const c = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'; const a = new Uint32Array(10); crypto.getRandomValues(a); return Array.from(a, x => c[x % c.length]).join(''); };

  X.menu('ADMINISTRATION', [['users', 'Utilisateurs', 'fa-users-gear'], ['permissions', 'Droits par rôle', 'fa-user-lock'], ['activity', 'Journal d’activité', 'fa-clock-rotate-left']]);

  /* ---------- Droits de la personne connectée ---------- */
  const ALWAYS = ['profile', 'notifications', 'display'];
  const ADMIN_ONLY = ['users', 'permissions', 'activity', 'activation'];
  const navIds = () => new Set((A()?.groups || []).flatMap(g => g.items.map(i => i[0])));
  window.MyraPerm = {
    data: null,
    async load(user, offline) {
      const key = 'myra_perm_' + (user?.id || '');
      if (!offline && navigator.onLine) {
        const { data, error } = await A().sb.rpc('get_my_permissions');
        if (!error && data) { this.data = data; try { localStorage.setItem(key, JSON.stringify(data)); } catch (_) {} }
      }
      if (!this.data) { try { this.data = JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) {} }
      this.apply();
    },
    all() { const r = A()?.state?.profile?.role; return ['owner', 'admin', 'super_admin'].includes(r) || !!this.data?.all; },
    page(id) {
      if (this.all()) return true;
      if (ADMIN_ONLY.includes(id)) return false;
      if (ALWAYS.includes(id) || !this.data) return true;
      if (!navIds().has(id)) return true;               // sous-pages (fiches, formulaires) : protégées par la base
      return (this.data.pages || []).includes(id);
    },
    can(k) { return this.all() || !!this.data?.[k]; },
    apply() {
      document.body.classList.toggle('perm-no-delete', !this.can('can_delete'));
      document.body.classList.toggle('perm-no-costs', !this.can('see_costs'));
    }
  };

  /* ---------- Liste de l'équipe (page Utilisateurs + Paramètres) ---------- */
  async function invokeTeam(app, body) {
    const { data, error } = await app.sb.functions.invoke('myra-team', { body });
    if (error) { let m = error.message, extra = {}; try { extra = await error.context.json(); m = extra.error || m; } catch (_) {} const e = new Error(m); e.info = extra; throw e; }
    if (data?.error) { const e = new Error(data.error); e.info = data; throw e; } return data;
  }
  function shareAccess(app, name, email, pw) {
    const url = location.origin + location.pathname;
    const msg = `Bonjour ${String(name).split(' ')[0]}, votre accès à LSM Business Manager est prêt.\nAdresse : ${url}\nE-mail : ${email}\nMot de passe provisoire : ${pw}\nChangez-le dès la première connexion (Mon profil › Sécurité).`;
    const m = X.modal('Accès à transmettre', `<p>Transmettez ces informations à <b>${esc(name)}</b> (en main propre ou par WhatsApp). Le mot de passe ne sera plus affiché ensuite.</p><pre class="tm-cred">${esc(msg)}</pre>`, '<button type="button" class="btn light" id="tmCopy"><i class="fa-solid fa-copy"></i> Copier</button><button type="button" class="btn primary" id="tmWa"><i class="fa-brands fa-whatsapp"></i> WhatsApp</button>');
    m.el.querySelector('#tmCopy').onclick = async () => { try { await navigator.clipboard.writeText(msg); app.toast('Copié.'); } catch (_) { app.toast('Copie impossible : sélectionnez le texte.', true); } };
    m.el.querySelector('#tmWa').onclick = () => window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank', 'noopener');
  }

  X.teamList = async function teamList(root, app, opts = {}) {
    if (!root) return;
    const box = root.querySelector('#tmList'); const meId = app.state.user?.id; const meRole = app.state.profile?.role;
    const st = { q: '', status: '', role: '' };
    const roleOpts = cur => Object.keys(ROLES).filter(r => meRole === 'owner' || !['owner', 'admin'].includes(r) || r === cur).map(r => `<option value="${r}" ${r === cur ? 'selected' : ''}>${esc(roleLabel(r))}</option>`).join('');
    let rows = [];
    const stateOf = r => r.is_active ? 'on' : r.last_sign_in_at ? 'off' : 'wait';
    function draw() {
      const q = st.q.toLowerCase();
      const list = rows.filter(r => (!q || `${r.full_name} ${r.email} ${r.phone || ''}`.toLowerCase().includes(q)) && (!st.status || stateOf(r) === st.status) && (!st.role || r.role === st.role));
      const pending = rows.filter(r => stateOf(r) === 'wait').length;
      const kp = root.querySelector('#tmKpis');
      if (kp) kp.innerHTML = X.kpis([['fa-users', 'Comptes', rows.length, 'au total', 'k-green'], ['fa-circle-check', 'Actifs', rows.filter(r => r.is_active).length, 'peuvent se connecter', 'k-blue'], ['fa-hourglass-half', 'En attente', pending, 'à activer', 'k-amber'], ['fa-ban', 'Désactivés', rows.filter(r => stateOf(r) === 'off').length, 'sans accès', 'k-pink']]);
      box.innerHTML = (pending ? `<div class="tm-alert"><i class="fa-solid fa-hourglass-half"></i> ${pending} compte${pending > 1 ? 's' : ''} en attente d’activation : choisissez le rôle puis « Activer ».</div>` : '')
        + (list.length ? list.map(r => {
          const me = r.id === meId; const locked = me || (meRole !== 'owner' && ['owner', 'admin'].includes(r.role));
          const av = r.avatar_url ? `<img src="${esc(r.avatar_url)}" alt="">` : esc(app.initials(r.full_name || r.email || '?'));
          const s = stateOf(r);
          return `<div class="tm-row ${s === 'wait' ? 'pending' : ''}" data-id="${r.id}">
            <span class="tm-av">${av}</span>
            <span class="tm-who"><b>${esc(r.full_name || '—')}${me ? ' <em>(vous)</em>' : ''}</b><small>${esc(r.email || '')}${r.phone ? ' · ' + esc(r.phone) : ''}</small><small>Dernière connexion : ${esc(fdt(r.last_sign_in_at))}</small></span>
            <span class="tm-ctl">${locked ? `<span class="tm-role">${esc(roleLabel(r.role))}</span>` : `<select data-role aria-label="Rôle de ${esc(r.full_name || '')}" title="${esc(ROLE_HELP[r.role] || '')}">${roleOpts(r.role)}</select>`}
              <span class="tm-state ${r.is_active ? 'on' : 'off'}">${r.is_active ? 'Actif' : s === 'off' ? 'Désactivé' : 'En attente'}</span>
              ${locked ? '' : `<button type="button" class="btn ${r.is_active ? 'light' : 'primary'} sm" data-active="${r.is_active ? 0 : 1}">${r.is_active ? 'Désactiver' : 'Activer'}</button>
                <button type="button" class="btn light sm" data-edit title="Modifier la fiche" aria-label="Modifier ${esc(r.full_name || '')}"><i class="fa-solid fa-pen"></i></button>
                <button type="button" class="btn light sm" data-pw title="Nouveau mot de passe provisoire" aria-label="Nouveau mot de passe"><i class="fa-solid fa-key"></i></button>
                ${r.role === 'owner' ? '' : `<button type="button" class="btn light sm tm-del" data-del title="Supprimer le compte" aria-label="Supprimer ${esc(r.full_name || '')}"><i class="fa-solid fa-trash"></i></button>`}`}</span>
          </div>`;
        }).join('') : '<p class="muted" style="padding:14px 0">Aucun compte ne correspond.</p>')
        + (opts.compact ? `<div class="actions" style="margin-top:10px"><button type="button" class="btn light sm" data-go-users><i class="fa-solid fa-users-gear"></i> Ouvrir la gestion complète des utilisateurs</button></div>` : '');
      box.querySelector('[data-go-users]')?.addEventListener('click', () => app.navigate('users'));
      box.querySelectorAll('.tm-row').forEach(row => {
        const r = rows.find(x => x.id === row.dataset.id); const sel = row.querySelector('[data-role]');
        const save = async (role, active, okMsg) => {
          const { error } = await app.sb.rpc('set_team_member', { p_user: r.id, p_role: role, p_active: active, p_name: null });
          if (error) { app.toast(X.explain(error), true); return load(); }
          app.toast(okMsg); load();
        };
        if (sel) sel.onchange = () => save(sel.value, r.is_active, `${r.full_name} : ${roleLabel(sel.value)}.`);
        const act = row.querySelector('[data-active]');
        if (act) act.onclick = () => { const on = act.dataset.active === '1'; if (!on && !confirm(`Désactiver ${r.full_name} ? Il ne pourra plus se connecter.`)) return; save(sel ? sel.value : r.role, on, on ? `${r.full_name} peut maintenant se connecter.` : `${r.full_name} est désactivé.`); };
        row.querySelector('[data-pw]')?.addEventListener('click', async () => {
          if (!confirm(`Créer un nouveau mot de passe provisoire pour ${r.full_name} ?`)) return;
          const p = tempPw(); try { await invokeTeam(app, { action: 'reset_password', user_id: r.id, password: p }); shareAccess(app, r.full_name || '', r.email || '', p); } catch (e) { app.toast(e.message, true); }
        });
        row.querySelector('[data-edit]')?.addEventListener('click', () => edit(r));
        row.querySelector('[data-del]')?.addEventListener('click', () => del(r));
      });
    }
    async function load() {
      const { data, error } = await app.sb.rpc('get_team_accounts');
      if (error) { box.innerHTML = `<p class="muted">${esc(X.explain(error))}</p>`; return; }
      rows = data || []; draw();
    }
    function edit(r) {
      const m = X.modal('Modifier ' + (r.full_name || 'le membre'), `<div class="form-grid">
          <label class="field full-span">Nom complet<input name="full_name" required minlength="2" maxlength="120" value="${esc(r.full_name || '')}"></label>
          <label class="field">E-mail de connexion<input name="email" type="email" required value="${esc(r.email || '')}"></label>
          <label class="field">Téléphone<input name="phone" type="tel" value="${esc(r.phone || '')}" placeholder="+242 06 …"></label></div>
          <p class="muted small">Le rôle et l’activation se changent directement dans la liste. Un changement d’e-mail prend effet à la prochaine connexion.</p>`,
        '<button type="button" class="btn light" data-close>Annuler</button><button class="btn primary" type="submit"><i class="fa-solid fa-floppy-disk"></i> Enregistrer</button>', { form: true });
      m.el.onsubmit = async e => {
        e.preventDefault(); const f = Object.fromEntries(new FormData(m.el)); const b = m.el.querySelector('[type=submit]'); b.disabled = true;
        const body = { action: 'update', user_id: r.id, full_name: f.full_name, phone: f.phone };
        if (f.email.trim().toLowerCase() !== String(r.email || '').toLowerCase()) body.email = f.email;
        try { await invokeTeam(app, body); m.close(); app.toast('Fiche enregistrée.'); load(); } catch (err) { b.disabled = false; app.toast(err.message, true); }
      };
    }
    async function del(r) {
      if (!confirm(`Supprimer définitivement le compte de ${r.full_name} ?\nCette action est irréversible.`)) return;
      try { await invokeTeam(app, { action: 'delete', user_id: r.id }); app.toast(`Compte de ${r.full_name} supprimé.`); load(); }
      catch (e) {
        if (e.info?.has_history) {
          const m = X.modal('Suppression impossible', `<p>${esc(e.message)}</p>`, `<button type="button" class="btn light" data-close>Fermer</button>${r.is_active ? '<button type="button" class="btn primary" id="tmOff"><i class="fa-solid fa-ban"></i> Désactiver le compte</button>' : ''}`);
          m.el.querySelector('#tmOff')?.addEventListener('click', async () => { m.close(); const { error } = await app.sb.rpc('set_team_member', { p_user: r.id, p_role: r.role, p_active: false, p_name: null }); if (error) return app.toast(X.explain(error), true); app.toast(`${r.full_name} est désactivé.`); load(); });
        } else app.toast(e.message, true);
      }
    }
    root.querySelector('#tmAdd')?.addEventListener('click', () => {
      const m = X.modal('Ajouter un membre de l’équipe', `<div class="form-grid">
          <label class="field full-span">Nom complet<input name="full_name" required maxlength="120" autocomplete="off"></label>
          <label class="field">E-mail de connexion<input name="email" type="email" required autocomplete="off"></label>
          <label class="field">Téléphone<input name="phone" type="tel" autocomplete="off" placeholder="+242 06 …"></label>
          <label class="field">Rôle<select name="role">${roleOpts('sales').replace(/<option value="owner"[^>]*>[^<]*<\/option>/, '')}</select></label>
          <label class="field">Mot de passe provisoire<input name="password" required minlength="8" value="${tempPw()}" autocomplete="off"></label></div>
          <p class="muted small" id="tmHelp">${esc(ROLE_HELP.sales)}</p>`, '<button type="button" class="btn light" data-close>Annuler</button><button class="btn primary" type="submit"><i class="fa-solid fa-user-plus"></i> Créer le compte</button>', { form: true, sub: 'Le compte est actif tout de suite, sans e-mail de confirmation.' });
      m.el.querySelector('[name=role]').onchange = e => { m.el.querySelector('#tmHelp').textContent = ROLE_HELP[e.target.value] || ''; };
      m.el.onsubmit = async e => {
        e.preventDefault(); const f = Object.fromEntries(new FormData(m.el)); const b = m.el.querySelector('[type=submit]'); b.disabled = true;
        try { await invokeTeam(app, { action: 'create', ...f }); m.close(); app.toast(`Compte de ${f.full_name} créé.`); shareAccess(app, f.full_name, f.email.trim().toLowerCase(), f.password); load(); }
        catch (err) { b.disabled = false; app.toast(err.message, true); }
      };
    });
    root.querySelector('#tmSearch')?.addEventListener('input', e => { st.q = e.target.value; draw(); });
    root.querySelector('#tmStatus')?.addEventListener('change', e => { st.status = e.target.value; draw(); });
    root.querySelector('#tmRole')?.addEventListener('change', e => { st.role = e.target.value; draw(); });
    await load();
  };

  EXT.pages.users = {
    title: 'Utilisateurs',
    async render(host, app) {
      if (!isBoss()) { host.innerHTML = X.head('Utilisateurs', 'Réservé au propriétaire et aux administrateurs.'); return; }
      host.innerHTML = X.head('Utilisateurs', 'Les comptes des employés de l’entreprise : créer, modifier, activer, désactiver ou supprimer.', '<button type="button" class="btn primary" id="tmAdd"><i class="fa-solid fa-user-plus"></i> Ajouter un membre</button>')
        + '<div id="tmKpis"></div>'
        + `<section class="card"><div class="tm-tools"><label class="search-wrap"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input class="search-input" id="tmSearch" type="search" placeholder="Nom, e-mail, téléphone…" aria-label="Rechercher un membre"></label>
            <select id="tmStatus" aria-label="État"><option value="">Tous les états</option><option value="on">Actifs</option><option value="wait">En attente</option><option value="off">Désactivés</option></select>
            <select id="tmRole" aria-label="Rôle"><option value="">Tous les rôles</option>${Object.keys(ROLES).map(r => `<option value="${r}">${esc(roleLabel(r))}</option>`).join('')}</select></div>
            <div id="tmList"><div class="loading"><i class="fa-solid fa-circle-notch fa-spin"></i></div></div></section>`
        + `<section class="card"><div class="card-head"><h3><i class="fa-solid fa-circle-info"></i> Les rôles</h3><button type="button" class="btn light sm" id="tmPerm"><i class="fa-solid fa-user-lock"></i> Régler les droits</button></div><div class="tm-roles">${Object.keys(ROLES).map(r => `<div><b>${esc(roleLabel(r))}</b><small>${esc(ROLE_HELP[r])}</small></div>`).join('')}</div></section>`;
      host.querySelector('#tmPerm').onclick = () => app.navigate('permissions');
      await X.teamList(host, app);
    }
  };

  /* ---------- Droits par rôle ---------- */
  EXT.pages.permissions = {
    title: 'Droits par rôle',
    async render(host, app) {
      if (!isBoss()) { host.innerHTML = X.head('Droits par rôle', 'Réservé au propriétaire et aux administrateurs.'); return; }
      X.loading(host);
      const { data, error } = await app.sb.from('role_permissions').select('*');
      if (error) return X.errorPanel(host, error);
      const byRole = Object.fromEntries((data || []).map(r => [r.role, r]));
      const groups = app.groups.map(g => ({ label: g.label, items: g.items.filter(([id]) => !ADMIN_ONLY.includes(id) && !ALWAYS.includes(id)) })).filter(g => g.items.length);
      const roles = ['manager', 'sales', 'stock_manager', 'accountant', 'employee', 'driver'];
      host.innerHTML = X.head('Droits par rôle', 'Choisissez ce que chaque rôle voit dans le menu et ce qu’il peut faire. Le propriétaire et les administrateurs ont toujours tous les droits.')
        + `<div class="pm-tabs" role="tablist">${roles.map((r, i) => `<button type="button" role="tab" class="${i ? '' : 'on'}" data-tab="${r}" aria-selected="${!i}">${esc(roleLabel(r))}</button>`).join('')}</div>`
        + roles.map((r, i) => { const p = byRole[r] || { pages: [], can_delete: false, see_costs: false, max_discount_pct: 0 };
          return `<form class="card pm-role ${i ? 'hidden' : ''}" data-role="${r}"><div class="card-head"><h3>${esc(roleLabel(r))}</h3><span class="muted">${esc(ROLE_HELP[r])}</span></div>
            <div class="pm-opts"><label class="pm-sw"><input type="checkbox" class="switch" name="can_delete" ${p.can_delete ? 'checked' : ''}><span><b>Peut supprimer</b><small>clients, produits, commandes, dépenses…</small></span></label>
              <label class="pm-sw"><input type="checkbox" class="switch" name="see_costs" ${p.see_costs ? 'checked' : ''}><span><b>Voit les coûts et les marges</b><small>prix d’achat, rentabilité</small></span></label>
              <label class="pm-sw"><span><b>Remise maximale</b><small>sur une vente, hors code promo</small></span><span class="pm-pct"><input type="number" name="max_discount_pct" min="0" max="100" step="1" value="${Number(p.max_discount_pct || 0)}"> %</span></label></div>
            <h4 class="pm-sub">Pages visibles <button type="button" class="btn light sm" data-all>Tout cocher</button> <button type="button" class="btn light sm" data-none>Tout décocher</button></h4>
            <div class="pm-groups">${groups.map(g => `<fieldset><legend>${esc(g.label)}</legend>${g.items.map(([id, label, ico]) => `<label><input type="checkbox" name="page" value="${id}" ${(p.pages || []).includes(id) ? 'checked' : ''}><i class="fa-solid ${ico}" aria-hidden="true"></i> ${esc(label)}</label>`).join('')}</fieldset>`).join('')}</div>
            <div class="actions"><button class="btn primary" type="submit"><i class="fa-solid fa-floppy-disk"></i> Enregistrer les droits « ${esc(roleLabel(r))} »</button></div></form>`; }).join('')
        + '<p class="muted small">Les suppressions et la remise maximale sont aussi contrôlées par le serveur : même en contournant l’écran, l’opération est refusée.</p>';
      host.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => {
        host.querySelectorAll('[data-tab]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', String(x === b)); });
        host.querySelectorAll('.pm-role').forEach(f => f.classList.toggle('hidden', f.dataset.role !== b.dataset.tab));
      });
      host.querySelectorAll('.pm-role').forEach(f => {
        f.querySelector('[data-all]').onclick = () => f.querySelectorAll('[name=page]').forEach(c => { c.checked = true; });
        f.querySelector('[data-none]').onclick = () => f.querySelectorAll('[name=page]').forEach(c => { c.checked = false; });
        f.onsubmit = async e => {
          e.preventDefault();
          const pages = [...f.querySelectorAll('[name=page]:checked')].map(c => c.value).concat(ALWAYS);
          const { error } = await app.sb.rpc('set_role_permissions', { p_role: f.dataset.role, p_pages: pages, p_can_delete: f.elements.can_delete.checked, p_see_costs: f.elements.see_costs.checked, p_max_discount: Number(f.elements.max_discount_pct.value || 0) });
          if (error) return app.toast(X.explain(error), true);
          app.toast(`Droits « ${roleLabel(f.dataset.role)} » enregistrés. Ils s’appliquent à la prochaine ouverture de l’application.`);
        };
      });
    }
  };

  /* ---------- Journal d'activité ---------- */
  const TABLES = { sales: 'Vente', payments: 'Paiement', customer_orders: 'Commande', products: 'Produit', customers: 'Client', expenses: 'Dépense', profiles: 'Utilisateur', promo_campaigns: 'Promotion', role_permissions: 'Droits', cash_accounts: 'Caisse', gift_cards: 'Bon cadeau', purchase_orders: 'Achat', suppliers: 'Fournisseur' };
  const ACTIONS = { insert: ['Création', 'fa-plus', 'ok'], update: ['Modification', 'fa-pen', 'info'], delete: ['Suppression', 'fa-trash', 'bad'] };
  const FIELD = { status: 'Statut', total: 'Total', amount: 'Montant', discount: 'Remise', sale_price: 'Prix de vente', cost_price: 'Prix d’achat', role: 'Rôle', is_active: 'Actif', full_name: 'Nom', phone: 'Téléphone', name: 'Nom', payment_method: 'Mode de paiement', payment_status: 'Paiement', driver_id: 'Livreur', delivery_driver: 'Livreur', min_stock: 'Stock minimum', notes: 'Notes', address: 'Adresse', pages: 'Pages', can_delete: 'Peut supprimer', max_discount_pct: 'Remise max.' };
  const val = v => v === null || v === undefined ? '—' : typeof v === 'boolean' ? (v ? 'oui' : 'non') : Array.isArray(v) ? v.length + ' élément(s)' : typeof v === 'object' ? '…' : String(v).length > 60 ? String(v).slice(0, 60) + '…' : String(v);
  EXT.pages.activity = {
    title: 'Journal d’activité',
    async render(host, app) {
      if (!isBoss()) { host.innerHTML = X.head('Journal d’activité', 'Réservé au propriétaire et aux administrateurs.'); return; }
      const st = { days: 7, user: '', table: '', action: '', q: '' }; let rows = [];
      host.innerHTML = X.head('Journal d’activité', 'Qui a fait quoi et quand : ventes, paiements, commandes, prix, stock, utilisateurs… Conservé 400 jours, impossible à modifier.', '<button type="button" class="btn light" id="acCsv"><i class="fa-solid fa-file-csv"></i> CSV</button>')
        + `<section class="card"><div class="tm-tools">
            <select id="acDays" aria-label="Période"><option value="1">Aujourd’hui</option><option value="7" selected>7 derniers jours</option><option value="30">30 derniers jours</option><option value="90">90 derniers jours</option></select>
            <select id="acUser" aria-label="Personne"><option value="">Toute l’équipe</option></select>
            <select id="acTable" aria-label="Type"><option value="">Tous les types</option>${Object.entries(TABLES).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>
            <select id="acAction" aria-label="Action"><option value="">Toutes les actions</option>${Object.entries(ACTIONS).map(([k, l]) => `<option value="${k}">${l[0]}</option>`).join('')}</select>
            <label class="search-wrap"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input class="search-input" id="acSearch" type="search" placeholder="N° de vente, client, produit…" aria-label="Rechercher"></label></div>
            <div id="acList"><div class="loading"><i class="fa-solid fa-circle-notch fa-spin"></i></div></div></section>`;
      const list = host.querySelector('#acList');
      async function load() {
        list.innerHTML = '<div class="loading"><i class="fa-solid fa-circle-notch fa-spin"></i></div>';
        let q = app.sb.from('audit_logs').select('id,created_at,user_id,user_name,action,table_name,record_id,summary,details').gte('created_at', new Date(Date.now() - st.days * 864e5).toISOString()).order('created_at', { ascending: false }).limit(1000);
        if (st.table) q = q.eq('table_name', st.table); if (st.action) q = q.eq('action', st.action); if (st.user) q = q.eq('user_name', st.user);
        const { data, error } = await q; if (error) { list.innerHTML = `<p class="muted">${esc(X.explain(error))}</p>`; return; }
        rows = data || [];
        const users = [...new Set(rows.map(r => r.user_name).filter(Boolean))].sort();
        const us = host.querySelector('#acUser'); const cur = us.value; us.innerHTML = '<option value="">Toute l’équipe</option>' + users.map(u => `<option ${u === cur ? 'selected' : ''}>${esc(u)}</option>`).join('');
        draw();
      }
      function draw() {
        const q = st.q.toLowerCase(); const items = rows.filter(r => !q || `${r.summary} ${r.user_name} ${JSON.stringify(r.details || {})}`.toLowerCase().includes(q));
        if (!items.length) { list.innerHTML = '<div class="empty"><span class="empty-ico"><i class="fa-solid fa-clock-rotate-left"></i></span><b>Aucune activité sur cette période</b></div>'; return; }
        let day = '';
        list.innerHTML = items.slice(0, 500).map(r => {
          const a = ACTIONS[r.action] || [r.action, 'fa-circle', 'info']; const d = new Date(r.created_at); const dl = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
          const head = dl !== day ? `<h4 class="ac-day">${esc(dl)}</h4>` : ''; day = dl;
          const ch = r.action === 'update' && r.details ? Object.entries(r.details).slice(0, 6).map(([k, v]) => `<li><b>${esc(FIELD[k] || k)}</b> : ${esc(val(v?.avant))} → ${esc(val(v?.['après']))}</li>`).join('') : '';
          const info = r.action === 'insert' && r.details ? Object.entries(r.details).map(([k, v]) => `${esc(FIELD[k] || k)} : ${esc(['total', 'amount', 'discount', 'sale_price'].includes(k) ? money(v) : val(v))}`).join(' · ') : '';
          return `${head}<div class="ac-row"><span class="ac-ico ${a[2]}"><i class="fa-solid ${a[1]}" aria-hidden="true"></i></span><div class="ac-body"><div><b>${esc(r.user_name || 'Système')}</b> · ${esc(a[0].toLowerCase())} ${esc((TABLES[r.table_name] || r.table_name).toLowerCase())} <b>${esc(r.summary || '')}</b></div>${ch ? `<ul class="ac-ch">${ch}</ul>` : ''}${info ? `<small class="muted">${info}</small>` : ''}</div><time datetime="${esc(r.created_at)}">${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</time></div>`;
        }).join('') + (items.length > 500 ? '<p class="muted small">Affichage limité aux 500 plus récentes : affinez avec les filtres.</p>' : '');
      }
      host.querySelector('#acDays').onchange = e => { st.days = +e.target.value; load(); };
      host.querySelector('#acUser').onchange = e => { st.user = e.target.value; load(); };
      host.querySelector('#acTable').onchange = e => { st.table = e.target.value; load(); };
      host.querySelector('#acAction').onchange = e => { st.action = e.target.value; load(); };
      host.querySelector('#acSearch').oninput = e => { st.q = e.target.value; draw(); };
      host.querySelector('#acCsv').onclick = () => app.exportCsv('journal-activite', rows.map(r => ({ date: r.created_at, personne: r.user_name, action: (ACTIONS[r.action] || [r.action])[0], type: TABLES[r.table_name] || r.table_name, element: r.summary, details: JSON.stringify(r.details || {}) })));
      load();
    }
  };
})();
