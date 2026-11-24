/* Myra V29 — Assistant d'activation des nouveaux modules (exécution du script SQL dans Supabase) */
(() => {
  const X = window.MyraX, { EXT, A, esc } = X;
  const TABLES = [
    ['product_lots', 'Lots & dates limites'], ['complaints', 'Réclamations'], ['customer_prices', 'Prix négociés'], ['volume_prices', 'Prix par quantité'],
    ['recurring_orders', 'Commandes récurrentes'], ['payment_schedules', 'Échéancier'], ['customer_credit', 'Crédit clients'], ['catering_events', 'Événements traiteur'],
    ['gift_cards', 'Bons cadeaux'], ['gift_card_transactions', 'Historique des bons'], ['sales_targets', 'Objectifs des vendeuses'], ['employees', 'Employés'],
    ['attendance', 'Présences'], ['salary_advances', 'Avances'], ['stock_locations', 'Lieux'], ['location_stock', 'Stock par lieu'], ['stock_transfers', 'Transferts'],
    ['inventory_sessions', 'Inventaires'], ['inventory_lines', 'Lignes d’inventaire'], ['recurring_expenses', 'Charges fixes'], ['expense_budgets', 'Budgets'], ['message_campaigns', 'Messages']
  ];
  const ready = (() => { try { return localStorage.getItem('myra_v29_ready') === '1'; } catch (_) { return false; } })();
  if (!ready) X.menu('MON ESPACE', [['activation', 'Activer les modules', 'fa-wand-magic-sparkles']]);

  const projectRef = () => { try { return new URL(window.MYRA_CONFIG.SUPABASE_URL).hostname.split('.')[0]; } catch (_) { return ''; } };

  async function check(app) {
    const res = await Promise.all(TABLES.map(async ([t, label]) => {
      const { error } = await app.sb.from(t).select('*', { head: true, count: 'exact' }).limit(1);
      return { t, label, ok: !error, missing: !!error && X.isMissing(error), msg: error?.message || '' };
    }));
    const cols = await app.sb.from('customers').select('credit_limit,birth_date').limit(1);
    res.push({ t: 'customers', label: 'Nouveaux champs client (plafond, anniversaire)', ok: !cols.error, missing: !!cols.error, msg: cols.error?.message || '' });
    return res;
  }

  EXT.pages.activation = {
    title: 'Activer les modules',
    async render(host, app) {
      const ref = projectRef(), role = app.state.profile?.role;
      host.innerHTML = X.head('Activer les nouveaux modules', 'À faire une seule fois, par la personne qui gère le compte Supabase. Rien n’est supprimé.')
        + `<section class="card act-steps">
            <ol class="act-list">
              <li><b>Copiez le script</b><p class="muted">Le script crée les tables des 16 nouveaux modules.</p><button type="button" class="btn primary" id="actCopy"><i class="fa-solid fa-copy"></i> Copier le script SQL</button><small class="muted" id="actCopied"></small></li>
              <li><b>Ouvrez l’éditeur SQL de Supabase</b><p class="muted">Connectez-vous à Supabase si on vous le demande.</p><a class="btn light" target="_blank" rel="noopener" href="https://supabase.com/dashboard/project/${esc(ref)}/sql/new"><i class="fa-solid fa-arrow-up-right-from-square"></i> Ouvrir Supabase › SQL Editor</a></li>
              <li><b>Collez, puis cliquez sur « Run »</b><p class="muted">Ordinateur : Ctrl + V (Cmd + V sur Mac). Téléphone : appui long › Coller. Attendez la fin : en bas, une liste de <b>21 tables</b> doit apparaître avec <code>true</code>. Si un message d’erreur rouge s’affiche, copiez-le et envoyez-le.</p></li>
              <li><b>Revenez ici et vérifiez</b><p class="muted"></p><button type="button" class="btn primary" id="actCheck"><i class="fa-solid fa-circle-check"></i> Vérifier l’activation</button></li>
            </ol>
            ${role && role !== 'owner' ? '<p class="act-warn"><i class="fa-solid fa-triangle-exclamation"></i> Cette étape est normalement faite par le propriétaire du compte.</p>' : ''}
            <textarea id="actSql" class="act-sql" readonly hidden aria-label="Script SQL"></textarea>
          </section><div id="actResult"></div>`;
      let sql = '';
      const getSql = async () => { if (sql) return sql; const r = await fetch('supabase/myra_v29_extensions.sql', { cache: 'no-store' }); if (!r.ok) throw new Error('Script introuvable sur le site (' + r.status + ').'); sql = await r.text(); return sql; };
      host.querySelector('#actCopy').onclick = async () => {
        const out = host.querySelector('#actCopied');
        try {
          const text = await getSql();
          try { await navigator.clipboard.writeText(text); out.textContent = `Script copié (${text.split('\n').length} lignes). Passez à l’étape 2.`; }
          catch (_) { const ta = host.querySelector('#actSql'); ta.hidden = false; ta.value = text; ta.focus(); ta.select(); out.textContent = 'Copie automatique bloquée : le script est sélectionné ci-dessous, copiez-le (Ctrl + C ou appui long › Copier).'; }
        } catch (e) { out.textContent = e.message; }
      };
      host.querySelector('#actCheck').onclick = async () => {
        const box = host.querySelector('#actResult'); X.loading(box, 'Vérification des tables…');
        const res = await check(app); const okAll = res.every(r => r.ok);
        box.innerHTML = `<section class="card"><div class="card-head"><h3>${okAll ? '✅ Tous les modules sont activés' : `${res.filter(r => !r.ok).length} élément(s) manquant(s)`}</h3><span>${res.filter(r => r.ok).length}/${res.length}</span></div>
          ${okAll ? '<p>Rechargement de l’application dans un instant…</p>' : `<p class="muted">${res.every(r => !r.ok) ? 'Aucune table n’existe encore : le script n’a pas été exécuté, ou il s’est arrêté sur une erreur (dans ce cas rien n’a été modifié). Refaites les étapes 1 à 3.' : 'Le script semble incomplet : relancez-le en entier (il peut être exécuté plusieurs fois sans danger).'}</p>`}
          <div class="act-grid">${res.map(r => `<span class="tone ${r.ok ? 'ok' : 'bad'}" title="${esc(r.msg)}">${r.ok ? '✓' : '✗'} ${esc(r.label)}</span>`).join('')}</div>
          ${res.some(r => !r.ok && !r.missing) ? `<p class="muted">Détail : ${esc(res.find(r => !r.ok && !r.missing).msg)}</p>` : ''}</section>`;
        if (okAll) { try { localStorage.setItem('myra_v29_ready', '1'); } catch (_) {} setTimeout(() => { location.hash = '#/dashboard'; location.reload(); }, 1500); }
      };
    }
  };
})();
