/* Myra V29 — 9. Ventes par vendeuse & commissions · 10. Employés, présences, avances, paie */
(() => {
  const X = window.MyraX, { EXT, A, esc, money, num, fdate, today, monthStart, iso } = X;

  Object.assign(EXT.relations, { 'relation-employee': ['employees', 'id,full_name', 'full_name'] });
  Object.assign(EXT.labels, { present: 'Présent', late: 'En retard', absent: 'Absent', leave: 'Congé', half: 'Demi-journée' });
  Object.assign(EXT.statusLabels, { present: 'Présent', late: 'En retard', absent: 'Absent', leave: 'Congé', half: 'Demi-journée' });
  EXT.moneyKeys.push('monthly_salary', 'target_amount');

  EXT.config.employees = {
    title: 'Employés', desc: 'Toute l’équipe, y compris les personnes sans compte dans l’application (cuisine, livraison…).', table: 'employees',
    search: ['full_name', 'phone', 'job_title'],
    fields: [['full_name', 'Nom complet', 'text', true], ['phone', 'Téléphone', 'tel'], ['job_title', 'Poste', 'text'], ['monthly_salary', 'Salaire mensuel (FCFA)', 'number'], ['hired_at', 'Date d’embauche', 'date'], ['is_active', 'En poste', 'checkbox'], ['notes', 'Notes', 'textarea']]
  };
  EXT.listViews.employees = { cols: ['full_name', 'job_title', 'phone', 'monthly_salary', 'is_active'], title: 'full_name', amount: 'monthly_salary' };
  EXT.config.attendance = {
    title: 'Présences', desc: 'Historique du pointage.', table: 'attendance', search: ['status', 'notes'],
    fields: [['employee_id', 'Employé', 'relation-employee', true], ['work_date', 'Date', 'date', true], ['status', 'Statut', 'select', ['present', 'late', 'absent', 'leave', 'half'], true], ['check_in', 'Arrivée', 'time'], ['check_out', 'Départ', 'time'], ['notes', 'Notes', 'textarea']]
  };
  EXT.listViews.attendance = { cols: ['work_date', 'employee_id', 'status', 'check_in', 'check_out'], title: 'employee_id' };
  EXT.config.salary_advances = {
    title: 'Avances sur salaire', desc: 'Avances accordées, déduites automatiquement de la paie du mois.', table: 'salary_advances', search: ['reason'],
    fields: [['employee_id', 'Employé', 'relation-employee', true], ['advance_date', 'Date', 'date', true], ['amount', 'Montant (FCFA)', 'number', true], ['reason', 'Motif', 'text']]
  };
  EXT.listViews.salary_advances = { cols: ['advance_date', 'employee_id', 'reason', 'amount'], title: 'employee_id', amount: 'amount' };
  X.menu('ÉQUIPE', [['team', 'Ventes & commissions', 'fa-ranking-star'], ['payroll', 'Pointage & paie', 'fa-user-clock'], ['employees', 'Employés', 'fa-id-badge'], ['salary_advances', 'Avances', 'fa-money-bill-wave'], ['attendance', 'Historique présences', 'fa-list-check']], 4);

  const monthOptions = sel => { const out = []; const d = new Date(); for (let i = 0; i < 12; i++) { const m = new Date(d.getFullYear(), d.getMonth() - i, 1); const v = iso(m); out.push(`<option value="${v}" ${v === sel ? 'selected' : ''}>${m.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</option>`); } return out.join(''); };
  const monthEnd = m => { const d = new Date(m); return iso(new Date(d.getFullYear(), d.getMonth() + 1, 1)); };

  /* ---------- 9. Ventes par vendeuse, objectifs et commissions ---------- */
  EXT.pages.team = {
    title: 'Ventes & commissions',
    async render(host, app, month = monthStart()) {
      X.loading(host);
      const team = await app.sb.rpc('get_team_members');
      const restricted = !!team.error; const members = restricted ? [{ id: app.state.user.id, full_name: app.state.profile?.full_name || 'Moi', role: app.state.profile?.role }] : (team.data || []).filter(m => m.is_active !== false);
      if (team.error && /does not exist|Could not find|PGRST202/i.test(team.error.message)) return X.errorPanel(host, team.error);
      const salesRes = await app.fetchAll(() => app.sb.from('sales').select('id,total,amount_paid,status,created_by,sale_date').gte('sale_date', month).lt('sale_date', monthEnd(month)).not('status', 'in', '(draft,cancelled)'));
      if (salesRes.error) return X.errorPanel(host, salesRes.error);
      let targets = []; if (!restricted) { const t = await app.sb.from('sales_targets').select('*').eq('month', month); targets = t.data || []; }
      const stats = members.map(m => { const mine = salesRes.data.filter(s => s.created_by === m.id); const total = mine.reduce((n, s) => n + Number(s.total), 0); const t = targets.find(x => x.profile_id === m.id); return { ...m, count: mine.length, total, paid: mine.reduce((n, s) => n + Number(s.amount_paid), 0), target: t ? Number(t.target_amount) : 0, rate: t ? Number(t.commission_rate) : 0 }; }).sort((a, b) => b.total - a.total);
      const grand = stats.reduce((n, s) => n + s.total, 0), comm = stats.reduce((n, s) => n + s.total * s.rate / 100, 0);
      host.innerHTML = X.head('Ventes & commissions', restricted ? 'Vos ventes du mois. Les objectifs de l’équipe sont visibles par la direction.' : 'Ventes confirmées par personne, objectifs du mois et commissions calculées.', `<select class="ext-month" id="tmMonth" aria-label="Mois">${monthOptions(month)}</select>`)
        + X.kpis([['fa-sack-dollar', 'Ventes du mois', money(grand), `${salesRes.data.length} vente(s)`, 'k-green'], ['fa-percent', 'Commissions', money(comm), 'selon les taux définis', 'k-amber'], ['fa-user-group', 'Vendeuses actives', String(stats.filter(s => s.count).length), `sur ${stats.length}`, 'k-blue']])
        + `<div class="ext-cards">${stats.map((s, i) => { const pct = s.target ? Math.min(100, Math.round(s.total / s.target * 100)) : null; return `<article class="card ext-person"><div class="card-head"><h3><span class="rank">${i + 1}</span> ${esc(s.full_name || 'Sans nom')}</h3>${restricted ? '' : `<button type="button" class="round-btn" data-target="${esc(s.id)}" aria-label="Objectif et commission" title="Objectif et commission"><i class="fa-solid fa-bullseye"></i></button>`}</div><div class="ext-big">${money(s.total)}</div><small class="muted">${s.count} vente(s) · encaissé ${money(s.paid)}</small>${pct != null ? `<div class="ext-goal"><span class="ext-bar ${pct >= 100 ? 'ok' : ''}"><i style="width:${pct}%"></i></span><small>${pct} % de l’objectif (${money(s.target)})</small></div>` : '<small class="muted">Aucun objectif défini</small>'}${s.rate ? `<div class="ext-comm">Commission ${num(s.rate)} % : <b>${money(s.total * s.rate / 100)}</b></div>` : ''}</article>`; }).join('')}</div>`
        + (restricted ? '' : '<p class="muted">Les ventes sont attribuées à la personne connectée au moment de la vente.</p>');
      host.querySelector('#tmMonth').onchange = e => EXT.pages.team.render(host, app, e.target.value);
      host.querySelectorAll('[data-target]').forEach(b => b.onclick = () => {
        const s = stats.find(x => x.id === b.dataset.target);
        const m = X.modal('Objectif de ' + (s.full_name || ''), `<div class="form-grid"><label class="field">Objectif de ventes (FCFA)<input name="target" type="number" min="0" step="1000" value="${s.target || ''}"></label><label class="field">Commission (% des ventes)<input name="rate" type="number" min="0" max="100" step="0.5" value="${s.rate || ''}"></label></div>`, `<button type="button" class="btn light" data-close>Annuler</button><button class="btn primary" type="submit">Enregistrer</button>`, { form: true, sub: new Date(month).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) });
        m.el.addEventListener('submit', async e => { e.preventDefault(); const { error } = await app.sb.from('sales_targets').upsert({ profile_id: s.id, month, target_amount: Number(m.el.elements.target.value) || 0, commission_rate: Number(m.el.elements.rate.value) || 0 }, { onConflict: 'profile_id,month' }); if (error) return app.toast(X.explain(error), true); m.close(); app.toast('Objectif enregistré.'); EXT.pages.team.render(host, app, month); });
      });
    }
  };

  /* ---------- 10. Pointage du jour + paie du mois ---------- */
  EXT.pages.payroll = {
    title: 'Pointage & paie',
    async render(host, app, month = monthStart()) {
      X.loading(host);
      let emps, att, adv;
      try {
        emps = (await X.load('employees', '*', 'full_name', true)).filter(e => e.is_active);
        const [a, v] = await Promise.all([app.fetchAll(() => app.sb.from('attendance').select('*').gte('work_date', month).lt('work_date', monthEnd(month))), app.fetchAll(() => app.sb.from('salary_advances').select('*').gte('advance_date', month).lt('advance_date', monthEnd(month)))]);
        if (a.error) throw a.error; if (v.error) throw v.error; att = a.data; adv = v.data;
      } catch (e) { return X.errorPanel(host, e); }
      const todayAtt = new Map(att.filter(a => a.work_date === today()).map(a => [a.employee_id, a]));
      const rows = emps.map(e => { const mine = att.filter(a => a.employee_id === e.id); const c = k => mine.filter(a => a.status === k).length; const advances = adv.filter(a => a.employee_id === e.id).reduce((n, a) => n + Number(a.amount), 0); return { e, present: c('present') + c('late') + c('half') / 2, late: c('late'), absent: c('absent'), leave: c('leave'), advances, net: Number(e.monthly_salary) - advances }; });
      const isCurrent = month === monthStart();
      host.innerHTML = X.head('Pointage & paie', 'Pointez l’équipe chaque jour en un geste ; la paie du mois déduit les avances.', `<select class="ext-month" id="pyMonth" aria-label="Mois">${monthOptions(month)}</select><button class="btn light" type="button" id="pyPrint"><i class="fa-solid fa-print"></i> Imprimer la paie</button><button class="btn primary" type="button" id="pyAdv"><i class="fa-solid fa-plus"></i> Avance</button>`)
        + (isCurrent ? `<section class="card"><div class="card-head"><h3>Pointage du ${fdate(new Date())}</h3><span>${todayAtt.size}/${emps.length} pointé(s)</span></div>${emps.length ? `<div class="ext-att">${emps.map(e => { const cur = todayAtt.get(e.id)?.status; return `<div class="att-row"><b>${esc(e.full_name)}</b><small class="muted">${esc(e.job_title || '')}</small><div class="seg att-seg" role="group" aria-label="Présence de ${esc(e.full_name)}">${['present', 'late', 'absent', 'leave'].map(s => `<button type="button" class="${cur === s ? 'on' : ''}" data-emp="${esc(e.id)}" data-st="${s}" aria-pressed="${cur === s}">${EXT.labels[s]}</button>`).join('')}</div></div>`; }).join('')}</div>` : '<p class="muted">Ajoutez d’abord vos employés (menu Équipe › Employés).</p>'}</section>` : '')
        + X.table(['Employé', 'Salaire', 'Jours travaillés', 'Retards', 'Absences', 'Avances', 'Net à payer'], rows.map(r => `<tr><td data-role="title">${esc(r.e.full_name)}</td><td data-role="meta">${money(r.e.monthly_salary)}</td><td data-role="meta">${num(r.present)} j</td><td data-role="meta">${r.late}</td><td data-role="meta">${r.absent}${r.leave ? ` (+${r.leave} congé)` : ''}</td><td data-role="meta">${money(r.advances)}</td><td data-role="amount">${money(r.net)}</td></tr>`), 'Aucun employé actif.');
      host.querySelector('#pyMonth').onchange = e => EXT.pages.payroll.render(host, app, e.target.value);
      host.querySelector('#pyAdv').onclick = () => app.openForm('salary_advances', { advance_date: today() });
      host.querySelectorAll('[data-emp]').forEach(b => b.onclick = async () => {
        const now = new Date().toTimeString().slice(0, 5); const st = b.dataset.st;
        const { error } = await app.sb.from('attendance').upsert({ employee_id: b.dataset.emp, work_date: today(), status: st, check_in: ['present', 'late'].includes(st) ? now : null }, { onConflict: 'employee_id,work_date' });
        if (error) return app.toast(X.explain(error), true);
        b.parentElement.querySelectorAll('button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
      });
      host.querySelector('#pyPrint').onclick = () => X.printDoc({ title: 'Paie ' + month, kicker: 'État de paie', subtitle: new Date(month).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }), wide: true,
        sections: [{ title: rows.length + ' employé(s)', table: { head: ['Employé', 'Poste', 'Salaire', 'Jours', 'Absences', 'Avances', 'Net à payer', 'Signature'], align: ['', '', 'r', 'r', 'r', 'r', 'r', ''], rows: rows.map(r => [r.e.full_name, r.e.job_title || '', money(r.e.monthly_salary), num(r.present), String(r.absent), money(r.advances), money(r.net), '']), foot: ['Total', '', '', '', '', '', money(rows.reduce((n, r) => n + r.net, 0)), ''] } }],
        pill: 'Total net · ' + money(rows.reduce((n, r) => n + r.net, 0)), signatures: ['Le responsable', 'Visa comptabilité'] });
    }
  };
})();
