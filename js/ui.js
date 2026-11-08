// Piezas de interfaz: elementos, avisos, hojas inferiores, selector y motor de formularios.
import { icon } from './icons.js';
import { isBlank, parseInputNumber, formatInputNumber } from './util.js';

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'selected' || k === 'disabled' || k === 'hidden' || k === 'required') el[k] = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}
function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}
export const $ = (sel, root = document) => root.querySelector(sel);

export function chip(text, tone = 'neutral', ic) {
  return h('span', { class: `chip chip-${tone}` }, ic ? icon(ic, 14) : null, text);
}

export function button({ label, ic, tone = 'primary', onClick, size = 'md', block = false, disabled = false, attrs = {} }) {
  return h('button', { class: `btn btn-${tone} btn-${size}${block ? ' btn-block' : ''}`, type: 'button', onclick: onClick, disabled, ...attrs }, ic ? icon(ic, size === 'lg' ? 22 : 20) : null, h('span', null, label));
}

// ---------------------------------------------------------------- avisos
let toastTimer;
export function toast(msg, tone = 'ok', ms = 2600) {
  let t = $('#toast');
  if (!t) { t = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(t); }
  t.className = `toast toast-${tone} show`;
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// ---------------------------------------------------------------- hojas
const stack = [];
export function openSheet({ title, body, footer, full = false, onClose, id }) {
  const overlay = h('div', { class: `overlay${full ? ' overlay-full' : ''}` });
  const panel = h('div', { class: `sheet${full ? ' sheet-full' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title || '' });
  const close = (result) => {
    if (overlay.dataset.closed) return;
    overlay.dataset.closed = '1';
    overlay.classList.remove('in');
    setTimeout(() => overlay.remove(), 220);
    const i = stack.indexOf(api);
    if (i >= 0) stack.splice(i, 1);
    document.body.classList.toggle('noscroll', stack.length > 0);
    if (onClose) onClose(result);
  };
  const head = h('div', { class: 'sheet-head' },
    full ? h('button', { class: 'icon-btn', type: 'button', onclick: () => close(), 'aria-label': 'Cerrar' }, icon('left', 24)) : null,
    h('h2', null, title || ''),
    full ? null : h('button', { class: 'icon-btn', type: 'button', onclick: () => close(), 'aria-label': 'Cerrar' }, icon('close', 22)));
  const bodyEl = h('div', { class: 'sheet-body' }, body);
  panel.append(head, bodyEl);
  if (footer) panel.append(h('div', { class: 'sheet-foot' }, footer));
  overlay.append(panel);
  if (!full) overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.body.append(overlay);
  document.body.classList.add('noscroll');
  requestAnimationFrame(() => overlay.classList.add('in'));
  const api = { close, el: panel, body: bodyEl, setBody(n) { bodyEl.replaceChildren(n); } };
  stack.push(api);
  return api;
}
export function topSheet() { return stack[stack.length - 1]; }

export function confirmDialog({ title, message, confirmLabel = 'Aceptar', cancelLabel = 'Cancelar', tone = 'primary' }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; sh.close(); resolve(v); };
    const sh = openSheet({
      title, body: h('p', { class: 'confirm-msg' }, message),
      footer: h('div', { class: 'row-2' }, button({ label: cancelLabel, tone: 'ghost', onClick: () => finish(false) }), button({ label: confirmLabel, tone, onClick: () => finish(true) })),
      onClose: () => { if (!done) { done = true; resolve(false); } },
    });
  });
}

// Selector con búsqueda para listas largas (lotes, labores, producciones…).
export function pickOne({ title, options, value, allowClear = false, searchable = true, empty = 'No hay opciones', add = null }) {
  return new Promise((resolve) => {
    let picked = false;
    const q = h('input', { class: 'input', type: 'search', placeholder: 'Buscar…', 'aria-label': 'Buscar', autocomplete: 'off' });
    const list = h('div', { class: 'pick-list' });
    const draw = () => {
      const t = q.value.trim().toLowerCase();
      list.replaceChildren();
      const items = options.filter((o) => !t || `${o.label} ${o.sub || ''}`.toLowerCase().includes(t));
      if (!items.length) list.append(h('p', { class: 'muted pad' }, empty));
      for (const o of items) {
        list.append(h('button', { type: 'button', class: `pick-item${o.value === value ? ' sel' : ''}`, onclick: () => { picked = true; sh.close(); resolve(o.value); } },
          h('span', { class: 'pick-main' }, h('b', null, o.label), o.sub ? h('small', null, o.sub) : null),
          o.value === value ? icon('check', 20) : null));
      }
    };
    q.addEventListener('input', draw);
    const addBtn = add ? h('button', { class: 'pick-item add', type: 'button', onclick: async () => { const r = await add.run(q.value.trim()); if (r) { picked = true; sh.close(); resolve(r); } } }, h('span', { class: 'pick-main' }, h('b', null, add.label)), icon('plus', 20)) : null;
    const body = h('div', null, searchable && options.length > 6 ? h('div', { class: 'pick-search' }, q) : null, addBtn, allowClear && value ? h('button', { class: 'pick-item clear', type: 'button', onclick: () => { picked = true; sh.close(); resolve(''); } }, h('span', { class: 'pick-main' }, h('b', null, 'Quitar selección'))) : null, list);
    const sh = openSheet({ title, body, onClose: () => { if (!picked) resolve(undefined); } });
    draw();
  });
}

// ---------------------------------------------------------------- formularios
// fields: [{ name, label, type, options, show(v), required(v)|bool, valid(v), default, hint, unit, onChange(v, set) ... }]
export function openForm({ title, subtitle, fields, values = {}, submitLabel = 'Guardar', onSubmit, tone = 'primary', onClose }) {
  const v = { ...values };
  const errors = {};
  const form = h('form', { class: 'form', novalidate: true, autocomplete: 'off' });
  let sheet;
  const setValue = (k, val) => { v[k] = val; };
  // Los campos de escritura (texto, número, hora…) se crean una sola vez y se reutilizan en cada redibujo:
  // si se rehicieran, al tocar el campo siguiente el teclado se cerraba y había que volver a tocar.
  const STABLE = new Set(['textarea', 'number', 'dur', 'date', 'time', 'text', undefined]);
  const stable = {};
  const wraps = {};
  const fmtDur = (x) => (isBlank(x) ? '' : `${Math.floor(Math.round(x * 60) / 60)}:${String(Math.round(x * 60) % 60).padStart(2, '0')}`);
  const wantText = (f) => {
    const x = v[f.name];
    if (f.type === 'number') return formatInputNumber(x);
    if (f.type === 'dur') return fmtDur(x);
    return x || '';
  };

  const isShown = (f) => (f.show ? !!f.show(v) : true);
  const isReq = (f) => (typeof f.required === 'function' ? !!f.required(v) : !!f.required);

  function fieldEl(f) {
    const err = errors[f.name];
    const req = isReq(f);
    const label = h('label', { class: 'f-label', for: `f_${f.name}` }, f.label, req ? h('i', { class: 'req', title: 'Obligatorio' }, '*') : null);
    let control;
    const val = v[f.name];
    // deferred: el cambio viene de un campo de escritura que acaba de perder el foco. Si se redibujara en ese
    // instante, el botón que la persona está tocando (ej. un chip o "Elegir…") se reemplaza antes de terminar el toque
    // y el toque se pierde. Por eso el redibujo espera a que termine el toque (o 450 ms si no hubo ninguno).
    const change = (nv, rerender = true, deferred = false) => {
      v[f.name] = nv;
      delete errors[f.name];
      if (f.onChange) f.onChange(v, setValue, nv);
      if (rerender) (deferred ? redrawLater() : redraw());
    };
    switch (f.type) {
      case 'textarea':
        control = h('textarea', { id: `f_${f.name}`, class: 'input', rows: f.rows || 3, placeholder: f.placeholder || '', onchange: (e) => change(e.target.value, false), oninput: (e) => { v[f.name] = e.target.value; } }, val || '');
        break;
      case 'number':
        control = h('div', { class: 'input-wrap' },
          h('input', { id: `f_${f.name}`, class: 'input', type: 'text', inputmode: 'decimal', placeholder: f.placeholder || '', value: formatInputNumber(val), onchange: (e) => { const n = parseInputNumber(e.target.value); if (Number.isNaN(n)) { e.target.value = ''; change(null, true, true); } else change(n, true, true); }, onfocus: (e) => e.target.select() }),
          f.unit ? h('span', { class: 'unit' }, f.unit) : null);
        break;
      case 'dur': {
        const fmtD = (h) => (isBlank(h) ? '' : `${Math.floor(Math.round(h * 60) / 60)}:${String(Math.round(h * 60) % 60).padStart(2, '0')}`);
        control = h('div', { class: 'input-wrap' },
          h('input', { id: `f_${f.name}`, class: 'input', type: 'text', inputmode: 'numeric', placeholder: 'h:mm', value: fmtD(val), onchange: (e) => {
            const t = e.target.value.trim();
            let hrs = null;
            const m = t.match(/^(\d+):(\d{1,2})$/);
            if (m) hrs = Number(m[1]) + Number(m[2]) / 60;
            else if (t && !Number.isNaN(Number(t.replace(',', '.')))) hrs = Number(t.replace(',', '.'));
            change(hrs, true, true);
          } }),
          h('span', { class: 'unit' }, 'h:mm'));
        break;
      }
      case 'date':
      case 'time':
        control = h('input', { id: `f_${f.name}`, class: 'input', type: f.type, value: val || '', onchange: (e) => change(e.target.value, true, true) });
        break;
      case 'select': {
        const opts = (typeof f.options === 'function' ? f.options(v) : f.options || []).map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
        const sel = h('select', { id: `f_${f.name}`, class: 'input select', onchange: (e) => change(e.target.value) },
          h('option', { value: '' }, f.placeholder || 'Elegir…'),
          opts.map((o) => h('option', { value: o.value, selected: o.value === val }, o.label)));
        if (val && !opts.some((o) => o.value === val)) sel.append(h('option', { value: val, selected: true }, val));
        control = h('div', { class: 'select-wrap' }, sel, icon('down', 18));
        break;
      }
      case 'chips': {
        const opts = (typeof f.options === 'function' ? f.options(v) : f.options || []).map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
        control = h('div', { class: 'chips', role: 'radiogroup' }, opts.map((o) => h('button', { type: 'button', class: `opt${o.value === val ? ' on' : ''}`, role: 'radio', 'aria-checked': String(o.value === val), onclick: () => change(o.value === val && !req ? '' : o.value) }, o.label)));
        break;
      }
      case 'multi': {
        const opts = (typeof f.options === 'function' ? f.options(v) : f.options || []).map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
        const cur = Array.isArray(val) ? val : [];
        control = h('div', { class: 'chips wrap' }, opts.length ? opts.map((o) => h('button', { type: 'button', class: `opt${cur.includes(o.value) ? ' on' : ''}`, 'aria-pressed': String(cur.includes(o.value)), onclick: () => change(cur.includes(o.value) ? cur.filter((x) => x !== o.value) : [...cur, o.value]) }, cur.includes(o.value) ? icon('check', 16) : null, o.label)) : h('span', { class: 'muted' }, 'No hay opciones cargadas'));
        break;
      }
      case 'ref': {
        const opts = typeof f.options === 'function' ? f.options(v) : f.options || [];
        const cur = opts.find((o) => o.value === val);
        control = h('button', { id: `f_${f.name}`, type: 'button', class: `input ref-btn${cur ? '' : ' empty'}`, onclick: async () => {
          const r = await pickOne({ title: f.label, options: opts, value: val, allowClear: !req, empty: f.empty, add: f.add });
          if (r !== undefined) change(r);
        } }, h('span', { class: 'ref-text' }, cur ? h('b', null, cur.label) : (f.placeholder || 'Elegir…'), cur && cur.sub ? h('small', null, cur.sub) : null), icon('right', 18));
        break;
      }
      case 'readonly':
        control = h('div', { class: 'input readonly' }, f.format ? f.format(v) : String(val ?? '—'));
        break;
      default: {
        const inp = h('input', { id: `f_${f.name}`, class: 'input', type: 'text', placeholder: f.placeholder || '', autocapitalize: f.upper ? 'characters' : 'sentences', value: val || '', maxlength: f.maxlength, onchange: (e) => change(f.upper ? e.target.value.toUpperCase() : e.target.value, !!f.suggest, true), oninput: (e) => { v[f.name] = e.target.value; } });
        const sug = f.suggest ? f.suggest(v).filter(Boolean) : [];
        control = sug.length ? h('div', null, inp, h('div', { class: 'chips wrap sug' }, sug.map((sv) => h('button', { type: 'button', class: `opt sm${sv === val ? ' on' : ''}`, onclick: () => change(sv) }, sv)))) : inp;
      }
    }
    const hintText = f.hint ? (typeof f.hint === 'function' ? f.hint(v) : f.hint) : '';
    if (!STABLE.has(f.type)) {
      return h('div', { class: `field${err ? ' has-error' : ''}`, 'data-field': f.name }, label, control, hintText ? h('small', { class: 'hint' }, hintText) : null, err ? h('small', { class: 'err' }, err) : null);
    }
    // campo estable: se reutiliza el control y solo se actualizan etiqueta, ayuda y error
    const prev = stable[f.name];
    if (prev) {
      const inp = prev.matches('input,textarea') ? prev : prev.querySelector('input,textarea');
      if (inp && document.activeElement !== inp) { const want = wantText(f); if (inp.value !== want) inp.value = want; }
      const oldSug = prev.querySelector ? prev.querySelector('.sug') : null;
      const newSug = control.querySelector ? control.querySelector('.sug') : null;
      if (oldSug && newSug) oldSug.replaceWith(newSug); else if (newSug && !oldSug) prev.append(newSug); else if (oldSug && !newSug) oldSug.remove();
      control = prev;
    } else stable[f.name] = control;
    let w = wraps[f.name];
    if (!w) {
      w = wraps[f.name] = { root: h('div', { class: 'field', 'data-field': f.name }), label: h('label', { class: 'f-label' }), hint: h('small', { class: 'hint' }), err: h('small', { class: 'err' }) };
      w.root.append(w.label, control, w.hint, w.err);
    }
    w.root.className = `field${err ? ' has-error' : ''}`;
    w.label.setAttribute('for', `f_${f.name}`);
    w.label.replaceChildren(...label.childNodes);
    w.hint.textContent = hintText || ''; w.hint.hidden = !hintText;
    w.err.textContent = err || ''; w.err.hidden = !err;
    return w.root;
  }

  let cancelPending = null;
  function redrawLater() {
    if (cancelPending) return;
    const onClick = () => setTimeout(() => redraw(), 0); // después de que corran los manejadores del toque
    const timer = setTimeout(() => redraw(), 450);
    document.addEventListener('click', onClick, true);
    cancelPending = () => { clearTimeout(timer); document.removeEventListener('click', onClick, true); cancelPending = null; };
  }

  function redraw() {
    if (cancelPending) cancelPending();
    const sc = sheet && sheet.body ? sheet.body.scrollTop : 0;
    const nodes = [];
    if (subtitle) nodes.push(h('p', { class: 'form-sub' }, subtitle));
    for (const f of fields) {
      if (!isShown(f)) continue;
      if (f.type === 'section') { nodes.push(h('h3', { class: 'f-section' }, f.label)); continue; }
      if (f.type === 'note') { nodes.push(h('div', { class: `note note-${f.tone || 'info'}` }, icon(f.ic || 'info', 18), h('span', null, typeof f.text === 'function' ? f.text(v) : f.text))); continue; }
      nodes.push(fieldEl(f));
    }
    // se acomoda sin sacar de la pantalla los campos que no cambiaron (así no se pierde el foco ni el teclado)
    const keep = new Set(nodes);
    for (const n of [...form.childNodes]) if (!keep.has(n)) n.remove();
    nodes.forEach((n, i) => { if (form.childNodes[i] !== n) form.insertBefore(n, form.childNodes[i] || null); });
    if (sheet && sheet.body) sheet.body.scrollTop = sc;
  }

  async function submit() {
    for (const k of Object.keys(errors)) delete errors[k];
    let first = null;
    for (const f of fields) {
      if (!isShown(f) || f.type === 'section' || f.type === 'note' || f.type === 'readonly') continue;
      const val = v[f.name];
      let msg = null;
      const empty = Array.isArray(val) ? val.length === 0 : isBlank(val) || (typeof val === 'string' && !val.trim());
      if (isReq(f) && empty) msg = 'Completá este dato';
      else if (!empty && f.valid) msg = f.valid(v, val) || null;
      if (msg) { errors[f.name] = msg; if (!first) first = f.name; }
    }
    if (first) {
      redraw();
      const el = form.querySelector(`[data-field="${first}"]`);
      if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      toast('Revisá los datos marcados', 'warn');
      return;
    }
    submitBtn.disabled = true;
    submitBtn.classList.add('busy');
    try {
      const r = await onSubmit(v);
      if (r === false) return;
      sheet.close();
    } catch (e) {
      console.error(e);
      toast(String(e.message || e), 'err', 4000);
    } finally { submitBtn.disabled = false; submitBtn.classList.remove('busy'); }
  }

  const submitBtn = button({ label: submitLabel, tone, size: 'lg', block: true, onClick: submit });
  // aplicar valores por defecto dependientes
  for (const f of fields) if (f.onChange && f.runOnOpen) f.onChange(v, setValue, v[f.name]);
  sheet = openSheet({ title, full: true, body: form, footer: submitBtn, onClose });
  redraw();
  setTimeout(() => { const sb = sheet.body; if (sb) sb.scrollTop = 0; }, 0);
  return sheet;
}

// ---------------------------------------------------------------- partes comunes de pantallas
export function section(title, ...children) {
  return h('section', { class: 'sec' }, title ? h('h3', { class: 'sec-title' }, title) : null, ...children);
}
export function kv(label, value, { strong = false } = {}) {
  if (value === undefined || value === null || value === '') return null;
  return h('div', { class: 'kv' }, h('span', { class: 'k' }, label), h('span', { class: `v${strong ? ' strong' : ''}` }, value));
}
export function emptyState(ic, title, text, action) {
  return h('div', { class: 'empty' }, h('div', { class: 'empty-ic' }, icon(ic, 34)), h('h3', null, title), text ? h('p', null, text) : null, action || null);
}
export function seg(options, value, onPick) {
  return h('div', { class: 'seg', role: 'tablist' }, options.map((o) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(o.value === value), class: o.value === value ? 'on' : '', onclick: () => onPick(o.value) }, o.label, o.count !== undefined ? h('em', null, o.count) : null)));
}
export function backBar(title, { onBack, right } = {}) {
  return h('div', { class: 'backbar' }, h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Volver', onclick: onBack || (() => history.back()) }, icon('left', 24)), h('h1', null, title), right || null);
}
