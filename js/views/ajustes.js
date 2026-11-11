import { store } from '../store.js';
import { sync, isSyncing } from '../sync.js';
import { api, resetDemo, ServerError } from '../api.js';
import { h, section, kv, button, toast, confirmDialog, seg, chip, emptyState } from '../ui.js';
import { icon } from '../icons.js';
import { parseCode, validUrl, VERSION } from '../connect.js';
import { TABLES } from '../schema.js';
import { card, pageHead } from './shared.js';

function ago(iso) {
  if (!iso) return 'todavía no';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return 'recién';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return `hace ${Math.round(s / 86400)} días`;
}

function describeOp(op) {
  const T = TABLES[op.tk];
  const nombre = T ? T.label : op.tk;
  if (op.t === 'append') {
    const r = op.rec;
    const det = r['Contraparte'] || r['Camión / patente'] || r['Tarea'] || r['Tipo servicio'] || r['Nombre silo'] || r['Tipo movimiento'] || r['Tipo de movimiento'] || r['Campo'] || '';
    return `Nuevo en ${nombre}${det ? ': ' + det : ''}`;
  }
  return `Cambio en ${nombre} (${Object.keys(op.set).slice(0, 3).join(', ')}${Object.keys(op.set).length > 3 ? '…' : ''})`;
}

async function connect(code, url, token) {
  let cfg = parseCode(code);
  if (!cfg && url) cfg = { url: url.trim(), token: (token || '').trim() };
  if (!cfg || !cfg.url || !cfg.token) { toast('El código no es válido. Copialo de nuevo, completo.', 'warn', 4000); return false; }
  if (!validUrl(cfg.url)) { toast('La dirección no parece de Apps Script', 'warn', 4000); return false; }
  try {
    await api.ping({ url: cfg.url, token: cfg.token }); // se prueba antes de guardar nada
  } catch (e) {
    toast(e instanceof ServerError && e.code === 'auth' ? 'La clave del código es incorrecta. Pedí uno nuevo.' : `No pude conectar: ${e.message}`, 'err', 5000);
    return false;
  }
  await store.setConfig({ mode: 'live', url: cfg.url, token: cfg.token });
  toast('Conectado. Bajando los datos…', 'ok');
  const r = await sync();
  if (r.ok) toast('Listo: datos al día');
  return true;
}
export { connect };

export function render({ go, book }) {
  const mode = store.config.mode;
  const pend = store.ops.filter((o) => !o.failed);
  const fails = store.failed();
  const standalone = window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let theme = 'auto'; try { theme = localStorage.getItem('de-theme') || 'auto'; } catch {}

  const codeInp = h('textarea', { class: 'input mono', rows: 3, placeholder: 'DE1.…', 'aria-label': 'Código de conexión', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
  const urlInp = h('input', { class: 'input', type: 'url', placeholder: 'https://script.google.com/macros/s/…/exec', autocapitalize: 'off', autocorrect: 'off' });
  const tokInp = h('input', { class: 'input', type: 'password', placeholder: 'Clave', autocapitalize: 'off', autocorrect: 'off' });

  const estado = card([
    h('div', { class: 'conn-row' },
      h('span', { class: `dot dot-${mode === 'live' ? (store.online ? 'ok' : 'off') : mode === 'demo' ? 'demo' : 'off'}` }),
      h('div', { class: 'grow' }, h('b', null, mode === 'live' ? 'Conectada a tu planilla' : mode === 'demo' ? 'Modo demo (datos de ejemplo)' : 'Sin conectar'),
        h('div', { class: 'sub' }, `${store.online ? 'Con señal' : 'Sin señal'} · última sincronización ${ago(store.sync.lastSync)}`))),
    store.sync.error ? h('div', { class: 'note note-warn' }, icon('alert', 18), h('span', null, store.sync.error)) : null,
    store.sync.fileError ? h('div', { class: 'note note-warn' }, icon('alert', 18), h('span', null, `No se pudo subir un archivo de factura a Drive: ${store.sync.fileError}`)) : null,
    ...((store.snapshot && store.snapshot.avisos) || []).map((a) => h('div', { class: 'note note-warn' }, icon('alert', 18), h('span', null, `La planilla avisó: ${a}`))),
    h('div', { class: 'btn-col' }, button({ label: isSyncing() ? 'Sincronizando…' : 'Sincronizar ahora', ic: 'refresh', tone: 'primary', size: 'lg', block: true, disabled: isSyncing() || !store.online, onClick: async () => { const r = await sync(); toast(r.ok ? 'Todo al día' : r.error, r.ok ? 'ok' : 'warn', 3500); } })),
    h('p', { class: 'hint' }, 'En el iPhone la app no puede subir cambios sola cuando está cerrada: abrila con señal y se sincroniza.'),
  ]);

  const pendientes = (pend.length || fails.length) ? section(`Cambios sin subir (${pend.length + fails.length})`, card([
    ...pend.map((o) => h('div', { class: 'op' }, icon('cloud', 18), h('span', null, describeOp(o)))),
    ...fails.map((o) => h('div', { class: 'op failed' }, icon('alert', 18), h('div', { class: 'grow' }, h('span', null, describeOp(o)), h('small', null, o.error || 'Error')), h('button', { class: 'link', type: 'button', onclick: async () => { if (await confirmDialog({ title: 'Descartar cambio', message: 'Este cambio no se va a guardar en la planilla. ¿Descartarlo?', confirmLabel: 'Descartar', tone: 'danger' })) { await store.discard(o.id); toast('Cambio descartado'); } } }, 'Descartar'))),
    fails.length ? button({ label: 'Reintentar los que fallaron', ic: 'refresh', tone: 'soft', block: true, onClick: async () => { await store.retryFailed(); sync(); } }) : null,
  ])) : null;

  const conexion = section(mode === 'live' ? 'Conexión con la planilla' : 'Conectar con tu planilla', card([
    h('p', { class: 'prose' }, mode === 'live' ? 'Ya está conectada. Si cambiaste el código en Apps Script, pegá el nuevo acá.' : 'Pegá el código de conexión que te pasó Claude. Se hace una sola vez en este celular.'),
    codeInp,
    h('details', { class: 'adv' }, h('summary', null, 'Ingresar dirección y clave por separado'), h('div', { class: 'field' }, h('label', { class: 'f-label' }, 'Dirección'), urlInp), h('div', { class: 'field' }, h('label', { class: 'f-label' }, 'Clave'), tokInp)),
    h('div', { class: 'btn-col' }, button({ label: 'Conectar', ic: 'key', tone: 'primary', block: true, onClick: async () => { const ok = await connect(codeInp.value, urlInp.value, tokInp.value); if (ok) { codeInp.value = ''; tokInp.value = ''; } } })),
    mode === 'live' ? h('div', { class: 'btn-col' }, button({ label: 'Probar con datos de ejemplo', tone: 'ghost', block: true, onClick: async () => { await store.setConfig({ mode: 'demo' }); resetDemo(); await sync(); toast('Modo demo'); go('home'); } })) : null,
    mode === 'demo' ? h('div', { class: 'btn-col' }, button({ label: 'Reiniciar datos de ejemplo', tone: 'ghost', block: true, onClick: async () => { await store.setKV('mock:demo', null); resetDemo(); store.snapshot = null; store.ops = store.ops.filter(() => false); await sync(); toast('Datos de ejemplo reiniciados'); } })) : null,
  ]));

  const instalar = section('Instalar en el iPhone', card([
    standalone ? h('div', { class: 'note note-ok' }, icon('checkcircle', 18), h('span', null, 'Ya estás usando la app instalada.')) : null,
    h('ol', { class: 'steps' },
      h('li', null, 'Abrí esta página en ', h('b', null, 'Safari'), ' (no en otro navegador).'),
      h('li', null, 'Tocá el botón ', h('b', null, 'Compartir'), ' ', icon('share', 16), ' de abajo.'),
      h('li', null, 'Elegí ', h('b', null, '"Añadir a pantalla de inicio"'), ' y tocá ', h('b', null, 'Añadir'), '.'),
      h('li', null, 'Abrí la app desde el ícono nuevo y pegá el código de conexión ', h('b', null, 'ahí'), ': la app instalada guarda sus datos aparte de Safari.')),
  ]));

  const apariencia = section('Apariencia', seg([{ value: 'auto', label: 'Automático' }, { value: 'light', label: 'Claro' }, { value: 'dark', label: 'Oscuro' }], theme, (v) => { try { localStorage.setItem('de-theme', v); } catch {} window.__applyTheme(); store.emit(); }));

  const acerca = section('Acerca de', card([
    kv('Versión', VERSION), kv('Datos guardados en el celular', store.persistent ? 'Sí' : 'No (modo privado)'),
    kv('Registros', `${book.labores.length} labores · ${book.cargas.length} cargas · ${book.movs.length} movimientos`),
    kv('Tiempo de lectura', store.snapshot ? new Date(store.snapshot.at).toLocaleString('es-AR') : '—'),
  ]));

  return { node: h('div', { class: 'page' }, pageHead('Ajustes', 'Conexión y sincronización'), estado, pendientes, conexion, instalar, apariencia, acerca) };
}
