/* Myra Business Manager — UI Kit (chargé avant app.js)
   Remplace les fenêtres natives confirm()/prompt() par des dialogues accessibles,
   fournit des formulaires modaux validés et des notifications (toasts) enrichies. */
(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

  /* ---------- Toasts ---------- */
  const ICONS = { success: 'fa-circle-check', error: 'fa-circle-exclamation', info: 'fa-circle-info', warn: 'fa-triangle-exclamation' };
  function toast(msg, error = false, opts = {}) {
    const type = opts.type || (error ? 'error' : 'success');
    let root = document.getElementById('toastRoot');
    if (!root) { root = document.createElement('div'); root.id = 'toastRoot'; root.className = 'toast-root'; root.setAttribute('aria-live', 'polite'); document.body.append(root); }
    const text = String(msg ?? '');
    for (const t of root.querySelectorAll('.toast')) if (t.dataset.msg === text) t.remove();
    while (root.children.length >= 4) root.firstElementChild.remove();
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.dataset.msg = text;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    const duration = opts.duration || (type === 'error' ? 7000 : 4200);
    el.style.setProperty('--toast-time', duration + 'ms');
    el.innerHTML = `<i class="fa-solid ${ICONS[type] || ICONS.info} toast-ico" aria-hidden="true"></i><span class="toast-msg">${esc(text)}</span>${opts.action ? `<button type="button" class="toast-action">${esc(opts.action.label)}</button>` : ''}<button type="button" class="toast-close" aria-label="Fermer la notification"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button><span class="toast-bar" aria-hidden="true"></span>`;
    let timer;
    const close = () => { clearTimeout(timer); el.classList.add('leaving'); setTimeout(() => el.remove(), 180); };
    el.querySelector('.toast-close').onclick = close;
    if (opts.action) el.querySelector('.toast-action').onclick = () => { close(); opts.action.onClick?.(); };
    el.addEventListener('mouseenter', () => { clearTimeout(timer); el.classList.add('paused'); });
    el.addEventListener('mouseleave', () => { el.classList.remove('paused'); timer = setTimeout(close, 1800); });
    root.append(el);
    timer = setTimeout(close, duration);
    return close;
  }

  /* ---------- Dialogues ---------- */
  let dialogRoot;
  function getRoot() {
    if (!dialogRoot) { dialogRoot = document.createElement('div'); dialogRoot.id = 'dialogRoot'; document.body.append(dialogRoot); }
    return dialogRoot;
  }

  function openDialog({ title, icon = 'fa-circle-question', tone = 'neutral', body = '', confirmText = 'Confirmer', cancelText = 'Annuler', wide = false, form = false, hideCancel = false }) {
    return new Promise(resolve => {
      const previous = document.activeElement;
      const wrap = document.createElement('div');
      wrap.className = 'dlg-backdrop';
      const id = 'dlg' + Math.random().toString(36).slice(2, 8);
      const tag = form ? 'form' : 'div';
      wrap.innerHTML = `<${tag} class="dlg ${tone} ${wide ? 'wide' : ''}" role="${tone === 'danger' ? 'alertdialog' : 'dialog'}" aria-modal="true" aria-labelledby="${id}t" ${form ? 'novalidate' : ''}>
        <div class="dlg-head"><span class="dlg-ico"><i class="fa-solid ${icon}" aria-hidden="true"></i></span><h3 id="${id}t">${esc(title)}</h3><button type="button" class="dlg-x" aria-label="Fermer"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>
        <div class="dlg-body">${body}</div>
        <div class="dlg-foot">${hideCancel ? '' : `<button type="button" class="btn light" data-dlg="cancel">${esc(cancelText)}</button>`}<button type="${form ? 'submit' : 'button'}" class="btn ${tone === 'danger' ? 'danger-solid' : 'primary'}" data-dlg="ok">${esc(confirmText)}</button></div>
      </${tag}>`;
      getRoot().append(wrap);
      document.body.classList.add('has-dialog');
      const dlg = wrap.firstElementChild;
      let done = false;
      const finish = value => {
        if (done) return; done = true;
        document.removeEventListener('keydown', onKey, true);
        wrap.classList.add('leaving');
        setTimeout(() => { wrap.remove(); if (!getRoot().children.length) document.body.classList.remove('has-dialog'); }, 140);
        try { previous?.focus?.(); } catch (_) { }
        resolve(value);
      };
      const onKey = e => {
        if (getRoot().lastElementChild !== wrap) return;
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(null); }
        else if (e.key === 'Tab') {
          const items = [...dlg.querySelectorAll(FOCUSABLE)].filter(x => x.offsetParent !== null);
          if (!items.length) return;
          const first = items[0], last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      };
      document.addEventListener('keydown', onKey, true);
      wrap.addEventListener('mousedown', e => { if (e.target === wrap) finish(null); });
      dlg.querySelector('.dlg-x').onclick = () => finish(null);
      dlg.querySelector('[data-dlg=cancel]')?.addEventListener('click', () => finish(null));
      setTimeout(() => {
        const target = dlg.querySelector('[data-autofocus]') || dlg.querySelector('input:not([type=hidden]),select,textarea') || dlg.querySelector('[data-dlg=ok]');
        target?.focus?.(); if (target?.select && target.tagName === 'INPUT') target.select();
      }, 30);
      dlg._finish = finish;
      wrap._dlg = dlg;
    });
  }

  /** Remplace confirm() : retourne Promise<boolean>. */
  function confirmDialog(message, opts = {}) {
    const danger = opts.danger ?? /supprim|annul|définitiv|irréversible/i.test(message);
    const p = openDialog({
      title: opts.title || (danger ? 'Action sensible' : 'Confirmation'),
      icon: opts.icon || (danger ? 'fa-triangle-exclamation' : 'fa-circle-question'),
      tone: danger ? 'danger' : 'neutral',
      body: `<p class="dlg-text">${esc(message)}</p>`,
      confirmText: opts.confirmText || (danger ? 'Oui, continuer' : 'Confirmer'),
      cancelText: opts.cancelText || 'Annuler'
    });
    const root = getRoot(); const wrap = root.lastElementChild;
    wrap.querySelector('[data-dlg=ok]').onclick = () => wrap._dlg._finish(true);
    if (danger) wrap.querySelector('[data-dlg=cancel]')?.setAttribute('data-autofocus', '');
    setTimeout(() => { if (danger) wrap.querySelector('[data-dlg=cancel]')?.focus(); else wrap.querySelector('[data-dlg=ok]')?.focus(); }, 40);
    return p.then(v => v === true);
  }

  /* ---------- Formulaire modal générique ---------- */
  function fieldHtml(f, v) {
    const id = 'f_' + f.name;
    const val = v ?? f.value ?? '';
    const req = f.required ? ' required' : '';
    let ctl;
    if (f.type === 'select') ctl = `<select id="${id}" name="${f.name}"${req}>${(f.options || []).map(([ov, ol]) => `<option value="${esc(ov)}" ${String(val) === String(ov) ? 'selected' : ''}>${esc(ol)}</option>`).join('')}</select>`;
    else if (f.type === 'textarea') ctl = `<textarea id="${id}" name="${f.name}" rows="3" placeholder="${esc(f.placeholder || '')}"${req}>${esc(val)}</textarea>`;
    else ctl = `<input id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${esc(val)}" placeholder="${esc(f.placeholder || '')}"${f.min != null ? ` min="${f.min}"` : ''}${f.max != null ? ` max="${f.max}"` : ''}${f.step ? ` step="${f.step}"` : ''}${f.inputmode ? ` inputmode="${f.inputmode}"` : ''}${f.maxlength ? ` maxlength="${f.maxlength}"` : ''}${req} autocomplete="off">`;
    return `<label class="field ${f.full ? 'full-span' : ''}" for="${id}"><span>${esc(f.label)}${f.required ? ' <em class="req" aria-hidden="true">*</em>' : ''}</span>${ctl}${f.hint ? `<small class="field-hint">${esc(f.hint)}</small>` : ''}<small class="field-error" role="alert" hidden></small></label>`;
  }

  /** Retourne Promise<object|null>. fields: [{name,label,type,options,required,hint,min,max,full,value,validate}] */
  function formDialog({ title, icon = 'fa-pen-to-square', fields, values = {}, submitText = 'Enregistrer', description = '', validate }) {
    const body = `${description ? `<p class="dlg-text muted-text">${esc(description)}</p>` : ''}<div class="form-grid dlg-grid">${fields.map(f => fieldHtml(f, values[f.name])).join('')}</div>`;
    const p = openDialog({ title, icon, body, confirmText: submitText, wide: true, form: true });
    const wrap = getRoot().lastElementChild; const dlg = wrap._dlg;
    const setErr = (name, msg) => {
      const el = dlg.elements[name]; if (!el) return;
      const holder = el.closest('.field'); const err = holder.querySelector('.field-error');
      err.textContent = msg || ''; err.hidden = !msg; holder.classList.toggle('has-error', !!msg);
      el.setAttribute('aria-invalid', msg ? 'true' : 'false');
    };
    dlg.addEventListener('input', e => { if (e.target.name) setErr(e.target.name, ''); });
    dlg.addEventListener('submit', e => {
      e.preventDefault();
      const data = {}; let firstBad = null;
      for (const f of fields) {
        const el = dlg.elements[f.name]; let raw = (el.value ?? '').trim(); let msg = '';
        if (f.required && raw === '') msg = 'Ce champ est obligatoire.';
        else if (raw !== '' && f.type === 'number') {
          const n = Number(raw.replace(',', '.'));
          if (!Number.isFinite(n)) msg = 'Saisissez un nombre valide.';
          else if (f.min != null && n < f.min) msg = `La valeur minimale est ${f.min}.`;
          else if (f.max != null && n > f.max) msg = `La valeur maximale est ${f.max}.`;
          else raw = n;
        }
        if (!msg && f.validate) msg = f.validate(raw, data) || '';
        setErr(f.name, msg);
        if (msg && !firstBad) firstBad = el;
        data[f.name] = raw === '' ? null : raw;
      }
      if (!firstBad && validate) { const g = validate(data); if (g) { toast(g, true); return; } }
      if (firstBad) { firstBad.focus(); return; }
      dlg._finish(data);
    });
    return p;
  }

  /** Remplace prompt() : Promise<string|null>. */
  function promptDialog(message, opts = {}) {
    return formDialog({
      title: opts.title || 'Saisie requise', icon: opts.icon || 'fa-keyboard',
      fields: [{ name: 'value', label: message, type: opts.type || 'text', value: opts.value ?? '', required: !!opts.required, hint: opts.hint, min: opts.min, step: opts.step, full: true, placeholder: opts.placeholder }],
      submitText: opts.confirmText || 'Valider'
    }).then(r => r === null ? null : String(r.value ?? ''));
  }

  window.MyraUI = { toast, confirm: confirmDialog, prompt: promptDialog, form: formDialog, dialog: openDialog, esc };
})();
