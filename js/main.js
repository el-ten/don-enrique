// Arranque de la app: base local, rutas, barra superior/inferior y estado de sincronización.
import { store } from './store.js';
import { sync, startAutoSync } from './sync.js';
import { h, $, toast } from './ui.js';
import { icon } from './icons.js';
import * as home from './views/home.js';
import * as labores from './views/labores.js';
import * as cosecha from './views/cosecha.js';
import * as combustible from './views/combustible.js';
import * as mas from './views/mas.js';
import * as servicios from './views/servicios.js';
import * as facturas from './views/facturas.js';
import * as ajustes from './views/ajustes.js';
import * as bienvenida from './views/bienvenida.js';

const routes = {
  home, labores, cosecha, combustible, mas, ajustes,
  silos: mas, produccion: mas, lotes: mas, equipos: mas, servicios, facturas,
};
const TAB_OF = { home: 'home', labores: 'labores', cosecha: 'cosecha', combustible: 'combustible' };
const TABS = [
  { id: 'home', label: 'Inicio', ic: 'home' },
  { id: 'labores', label: 'Labores', ic: 'tractor' },
  { id: 'cosecha', label: 'Cosecha', ic: 'truck' },
  { id: 'combustible', label: 'Combustible', ic: 'fuel' },
  { id: 'mas', label: 'Más', ic: 'grid' },
];

let viewEl, tabbarEl, syncEl, fabEl, titleEl;

// Cápsula de la pestaña activa: se desliza de una pestaña a la otra
let glider = null;
function placeGlider(instant) {
  if (!glider) return;
  const on = tabbarEl.querySelector('button[aria-current="true"]');
  if (!on || !on.offsetWidth) { glider.classList.add('off'); return; }
  const jump = instant || glider.classList.contains('off') || !glider.dataset.placed;
  if (jump) glider.classList.add('jump');
  glider.style.setProperty('--gx', (on.offsetLeft - 4) + 'px');
  glider.style.setProperty('--gw', (on.offsetWidth + 8) + 'px');
  glider.classList.remove('off');
  glider.dataset.placed = '1';
  if (jump) { void glider.offsetWidth; glider.classList.remove('jump'); }
}
let current = { name: 'home', params: [] };
let pendingRender = false;

// Lugar donde quedó cada pantalla al salir (por ruta), para volver exactamente ahí: una lista larga a la que hubo que scrollear, al
// entrar a una ficha y volver atrás, queda donde estaba. Navegar "hacia adelante" (pestañas, tocar una tarjeta) siempre arranca arriba.
const scrollGuardado = new Map();
let rutaActual = '';
let nav = { propia: false, volver: false }; // propia = el cambio de pantalla lo pidió go(); volver = go() de una flecha "Volver"
const claveDe = (r) => `${r.name}/${r.params.join('/')}`;
// `volver: true` = flecha "Volver" de una ficha: va a la pantalla padre y la deja donde se había quedado.
export function go(path, { volver = false } = {}) {
  const hash = '#/' + path.replace(/^#?\/?/, '');
  if (hash === location.hash) return; // misma pantalla: no hay cambio de ruta, así que no se deja ninguna marca pendiente
  nav = { propia: true, volver };
  location.hash = hash;
  setTimeout(() => { nav = { propia: false, volver: false }; }, 300); // por si el navegador no avisó el cambio (ej. misma ruta escrita distinto)
}
// Atrás del historial (botón atrás del celular, gesto, o `back`): vuelve a la pantalla anterior en el mismo lugar.
export function back(fallback = 'home') { if (history.length > 1 && document.referrer !== undefined) history.back(); else go(typeof fallback === 'string' ? fallback : 'home', { volver: true }); }
window.__go = go;
// El navegador no debe mover el scroll por su cuenta al cambiar de ruta: lo maneja la app (arriba o donde se había quedado).
try { history.scrollRestoration = 'manual'; } catch {}

function parseHash() {
  const parts = (location.hash.replace(/^#\/?/, '') || 'home').split('/').filter(Boolean);
  return { name: parts[0] || 'home', params: parts.slice(1).map(decodeURIComponent) };
}

// resetScroll: arriba de todo. aY (número): a ese lugar. Sin ninguno de los dos: se queda donde estaba el scroll.
function renderNow(resetScroll = false, aY = null) {
  if (!store.config.mode) { renderWelcome(); return; }
  document.body.classList.remove('welcome');
  const { name, params } = current;
  const mod = routes[name] || home;
  const y = window.scrollY;
  const out = mod.render({ route: name, params, go, back, store, book: store.book }) || {};
  viewEl.replaceChildren(out.node || '');
  viewEl.dataset.route = name;
  // pestaña activa
  const tab = TAB_OF[name] || 'mas';
  tabbarEl.querySelectorAll('button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.tab === tab)));
  placeGlider();
  // botón flotante
  fabEl.replaceChildren();
  if (out.fab) {
    fabEl.append(h('button', { class: 'fab', type: 'button', onclick: out.fab.onClick, 'aria-label': out.fab.label }, icon(out.fab.ic || 'plus', 24), h('span', null, out.fab.label)));
  }
  document.body.classList.toggle('has-fab', !!out.fab);
  if (aY !== null) window.scrollTo(0, aY); else if (resetScroll) window.scrollTo(0, 0); else window.scrollTo(0, y);
  renderSync();
}

function renderWelcome() {
  document.body.classList.add('welcome');
  viewEl.replaceChildren(bienvenida.render({ go }).node);
  fabEl.replaceChildren();
}

function safeRender() {
  const a = document.activeElement;
  if (a && viewEl.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) { pendingRender = true; return; }
  renderNow();
}

function renderSync() {
  const pend = store.pending();
  const fails = store.failed().length;
  let tone = 'ok', text = 'Al día', ic = 'check';
  const offline = !store.online || (store.sync.state === 'error' && store.sync.offline);
  if (offline) { tone = 'off'; text = pend ? `Sin señal · ${pend}` : 'Sin señal'; ic = 'cloudoff'; }
  else if (store.sync.state === 'syncing') { tone = 'busy'; text = 'Sincronizando…'; ic = 'refresh'; }
  else if (fails) { tone = 'err'; text = `${fails} con error`; ic = 'alert'; }
  else if (store.sync.state === 'error' && pend) { tone = 'warn'; text = `${pend} sin subir`; ic = 'cloud'; }
  else if (store.sync.state === 'error') { tone = 'err'; text = 'Error al sincronizar'; ic = 'alert'; }
  else if (pend) { tone = 'warn'; text = `${pend} sin subir`; ic = 'cloud'; }
  else if (store.config.mode === 'demo') { tone = 'demo'; text = 'Modo demo'; ic = 'sparkle'; }
  syncEl.className = `sync-pill sync-${tone}`;
  syncEl.replaceChildren(icon(ic, 16, tone === 'busy' ? 'spin' : ''), h('span', null, text));
  syncEl.hidden = !store.config.mode;
  syncEl.setAttribute('aria-label', `Estado de sincronización: ${text}`);
}

// `volverAlLugar`: la pantalla a la que se llega ya se vio antes (volver atrás) → se deja donde quedó; si no, arranca arriba.
function route(volverAlLugar = false) {
  // se guarda dónde quedó la pantalla que se deja (el navegador no mueve el scroll: ver scrollRestoration)
  if (rutaActual) scrollGuardado.set(rutaActual, window.scrollY);
  current = parseHash();
  rutaActual = claveDe(current);
  const y = volverAlLugar ? scrollGuardado.get(rutaActual) : undefined;
  renderNow(y === undefined, y === undefined ? null : y);
}

function applyTheme() {
  let t = 'auto';
  try { t = localStorage.getItem('de-theme') || 'auto'; } catch {}
  document.documentElement.dataset.theme = t === 'auto' ? '' : t;
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  const m = document.querySelector('meta[name="theme-color"]:not([media])');
  if (m) m.setAttribute('content', dark ? '#123b2c' : '#16573f');
}
window.__applyTheme = applyTheme;

async function boot() {
  applyTheme();
  viewEl = $('#view'); tabbarEl = $('#tabbar'); syncEl = $('#sync'); fabEl = $('#fab-slot'); titleEl = $('#brand-title');
  tabbarEl.append(...TABS.map((t) => h('button', { type: 'button', 'data-tab': t.id, onclick: () => go(t.id) }, icon(t.ic, 24), h('span', null, t.label))));
  glider = h('span', { class: 'tab-glider off', 'aria-hidden': 'true' });
  tabbarEl.prepend(glider);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => placeGlider(true)).observe(tabbarEl);
  syncEl.addEventListener('click', () => go('ajustes'));
  await store.init();
  store.subscribe(() => { renderSync(); safeRender(); });
  document.addEventListener('focusout', () => { if (pendingRender) setTimeout(() => { if (!document.activeElement || !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) { pendingRender = false; renderNow(); } }, 60); });
  window.addEventListener('hashchange', () => {
    // Cambio pedido por go(): arranca arriba, salvo la flecha "Volver". Cualquier otro (atrás del celular, gesto): vuelve al lugar.
    const alLugar = nav.propia ? nav.volver : true;
    nav = { propia: false, volver: false };
    route(alLugar);
  });
  route(false);
  startAutoSync();
  if (store.config.mode === 'live') sync({ quiet: true });
  else if (store.config.mode === 'demo' && !store.snapshot) sync();
  // reloj de la pantalla (tiempos de labores abiertas)
  setInterval(() => { if (document.visibilityState === 'visible' && !document.body.classList.contains('noscroll')) safeRender(); }, 30000);
  registerSW();
}

function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const ask = (sw) => {
      toast('Hay una versión nueva. Tocá acá para actualizar.', 'info', 12000);
      const t = $('#toast');
      t.onclick = () => { sw.postMessage('SKIP_WAITING'); };
    };
    if (reg.waiting && navigator.serviceWorker.controller) ask(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      sw && sw.addEventListener('statechange', () => { if (sw.state === 'installed' && navigator.serviceWorker.controller) ask(sw); });
    });
    setInterval(() => reg.update().catch(() => {}), 3600000);
  }).catch((e) => console.warn('SW', e));
  // Recarga solo cuando una versión nueva toma el control (no en la primera instalación).
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!hadController || reloaded) return; reloaded = true; location.reload(); });
}

boot();
