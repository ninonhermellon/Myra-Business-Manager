/* LSM Business Manager V41 — Planning de production : quoi produire, quelles matières acheter, lots et commandes fournisseurs préparés */
(() => {
  const X = window.MyraX, { EXT, A, esc, money, num } = X;
  X.menu('CATALOGUE & STOCK', [['production_plan', 'Planning de production', 'fa-calendar-check']]);

  EXT.pages.production_plan = {
    title: 'Planning de production',
    async render(host, app) {
      host.innerHTML = X.head('Planning de production', 'À partir des commandes à venir, des ventes habituelles et du stock minimum : ce qu’il faut produire et les matières premières à acheter.', '<select id="ppDays" aria-label="Horizon"><option value="3">3 jours</option><option value="7" selected>7 jours</option><option value="14">14 jours</option><option value="30">30 jours</option></select><button type="button" class="btn light" id="ppPrint"><i class="fa-solid fa-print"></i> Imprimer / Partager</button>') + '<div id="ppBody"></div>';
      const body = host.querySelector('#ppBody'); let plan = null;
      async function load() {
        X.loading(body);
        const { data, error } = await app.sb.rpc('get_production_plan', { p_days: Number(host.querySelector('#ppDays').value) });
        if (error) return X.errorPanel(body, error);
        plan = data; const todo = (data.products || []).filter(p => p.to_produce > 0); const buy = (data.materials || []).filter(m => m.to_buy > 0);
        body.innerHTML = X.kpis([['fa-industry', 'À produire', todo.length, 'produit(s) sur ' + data.days + ' jours', 'k-amber'], ['fa-clipboard-list', 'Commandes à servir', num((data.products || []).reduce((n, p) => n + Number(p.orders), 0)), 'unités commandées', 'k-blue'], ['fa-cart-flatbed', 'Matières à acheter', buy.length, 'pour suivre le planning', 'k-pink'], ['fa-coins', 'Budget d’achat', money(buy.reduce((n, m) => n + Number(m.to_buy) * Number(m.unit_cost || 0), 0)), 'au coût moyen', 'k-green']])
          + `<section class="card"><div class="card-head"><h3><i class="fa-solid fa-industry"></i> Production conseillée</h3>${todo.length ? '<button type="button" class="btn primary sm" id="ppBatches"><i class="fa-solid fa-play"></i> Créer les lots</button>' : ''}</div>
            <div class="table-wrap"><table class="cards-m"><thead><tr><th>Produit</th><th>Stock</th><th>Commandes</th><th>Ventes prévues</th><th>Stock mini</th><th>Déjà lancé</th><th>À produire</th></tr></thead><tbody>${(data.products || []).map(p => `<tr class="${p.to_produce > 0 ? '' : 'pp-ok'}" data-id="${p.id}"><td data-label="Produit"><b>${esc(p.name)}</b>${p.has_recipe ? '' : '<br><small class="muted">sans recette</small>'}</td><td data-label="Stock">${num(p.stock)}</td><td data-label="Commandes">${num(p.orders)}</td><td data-label="Ventes prévues">${num(p.forecast)} <small class="muted">(${num(p.avg_daily)}/j)</small></td><td data-label="Stock mini">${num(p.min_stock)}</td><td data-label="Déjà lancé">${num(p.planned)}</td><td data-label="À produire"><input type="number" min="0" step="1" class="co-in" data-qty value="${Number(p.to_produce)}" aria-label="Quantité à produire ${esc(p.name)}"></td></tr>`).join('')}</tbody></table></div>
            <p class="muted small">À produire = commandes + ventes prévues (moyenne des 30 derniers jours) + stock minimum − stock − lots déjà lancés. Vous pouvez ajuster les quantités avant de créer les lots.</p></section>
          <section class="card"><div class="card-head"><h3><i class="fa-solid fa-cart-flatbed"></i> Matières premières à acheter</h3>${buy.length ? '<button type="button" class="btn primary sm" id="ppPO"><i class="fa-solid fa-file-invoice"></i> Préparer les bons de commande</button>' : ''}</div>
            ${(data.materials || []).length ? `<div class="table-wrap"><table class="cards-m"><thead><tr><th>Matière</th><th>Besoin</th><th>En stock</th><th>À acheter</th><th>Fournisseur</th><th>Coût estimé</th></tr></thead><tbody>${data.materials.map(m => `<tr data-mid="${m.id}"><td data-label="Matière"><b>${esc(m.name)}</b></td><td data-label="Besoin">${num(m.required)} ${esc(m.unit || '')}</td><td data-label="En stock">${num(m.stock)} ${esc(m.unit || '')}</td><td data-label="À acheter"><input type="number" min="0" step="any" class="co-in" data-buy value="${Number(m.to_buy)}" aria-label="À acheter ${esc(m.name)}"> ${esc(m.unit || '')}</td><td data-label="Fournisseur">${esc(m.supplier || '— à choisir —')}</td><td data-label="Coût estimé">${money(Number(m.to_buy) * Number(m.unit_cost || 0))}</td></tr>`).join('')}</tbody></table></div>`
              : '<p class="muted">Aucune matière nécessaire : ajoutez des recettes à vos produits (menu Production › Recettes) pour calculer les besoins automatiquement.</p>'}</section>`;
        body.querySelector('#ppBatches')?.addEventListener('click', async () => {
          const items = [...body.querySelectorAll('tr[data-id]')].map(tr => ({ product_id: tr.dataset.id, quantity: Number(tr.querySelector('[data-qty]').value || 0) })).filter(i => i.quantity > 0);
          if (!items.length) return app.toast('Aucune quantité à produire.', true);
          const { data: n, error: e } = await app.sb.rpc('create_production_batches', { p_items: items }); if (e) return app.toast(X.explain(e), true);
          app.toast(`${n} lot(s) de production créé(s) « planifiés ». Suivez-les dans Production.`); load();
        });
        body.querySelector('#ppPO')?.addEventListener('click', async () => {
          const items = [...body.querySelectorAll('tr[data-mid]')].map(tr => ({ raw_material_id: tr.dataset.mid, quantity: Number(tr.querySelector('[data-buy]').value || 0) })).filter(i => i.quantity > 0);
          if (!items.length) return app.toast('Aucune matière à acheter.', true);
          const { data: nums, error: e } = await app.sb.rpc('create_purchase_orders_from_plan', { p_items: items }); if (e) return app.toast(X.explain(e), true);
          app.toast(`${nums.length} bon(s) de commande préparé(s) en brouillon : ${nums.join(', ')}.`);
        });
      }
      host.querySelector('#ppDays').onchange = load;
      host.querySelector('#ppPrint').onclick = () => plan && X.printDoc({ title: 'Planning de production', kicker: 'Planning', subtitle: `Prochains ${plan.days} jours · ${new Date().toLocaleDateString('fr-FR')}`, wide: true,
        sections: [{ title: 'À produire', table: { head: ['Produit', 'Stock', 'Commandes', 'Prévu', 'À produire'], align: ['', 'r', 'r', 'r', 'r'], rows: (plan.products || []).filter(p => p.to_produce > 0).map(p => [p.name, num(p.stock), num(p.orders), num(p.forecast), num(p.to_produce)]) } },
          { title: 'Matières à acheter', table: { head: ['Matière', 'Besoin', 'Stock', 'À acheter', 'Fournisseur'], align: ['', 'r', 'r', 'r', ''], rows: (plan.materials || []).filter(m => m.to_buy > 0).map(m => [m.name, num(m.required) + ' ' + (m.unit || ''), num(m.stock), num(m.to_buy) + ' ' + (m.unit || ''), m.supplier || '—']) } }] });
      load();
    }
  };
})();
