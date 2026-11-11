// Pantalla de inicio: lo que está pasando ahora y accesos rápidos.
import { store } from '../store.js';
import { h, section, emptyState, toast, pickOne, button } from '../ui.js';
import { icon } from '../icons.js';
import * as R from '../rules.js';
import * as F from '../forms.js';
import { laborCard, cargaCard, cropBadge, estadoChip, siloCard, statBox, card } from './shared.js';
import { laborButtons, cargaButtons } from './actions.js';
import { fmtKg, fmtL, fmtDur, fmtHa, fmtDate, relDay, fmt0, todayStr } from '../util.js';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function greeting() {
  const hr = new Date().getHours();
  return hr < 6 ? 'Buenas noches' : hr < 13 ? 'Buen día' : hr < 20 ? 'Buenas tardes' : 'Buenas noches';
}

function installNudge() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  let dismissed = false;
  try { dismissed = localStorage.getItem('de-install-dismissed') === '1'; } catch {}
  if (!ios || standalone || dismissed) return null;
  const el = h('div', { class: 'nudge' },
    icon('share', 22),
    h('div', { class: 'grow' }, h('b', null, 'Instalá la app en tu iPhone'), h('p', null, 'Tocá Compartir y después "Añadir a pantalla de inicio". Así abre a pantalla completa y anda sin señal.')),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Ocultar', onclick: () => { try { localStorage.setItem('de-install-dismissed', '1'); } catch {} el.remove(); } }, icon('close', 18)));
  return el;
}

export function render({ go, book }) {
  const now = new Date();
  const abiertas = R.laboresAbiertas(book);
  const cargas = R.cargasEnCurso(book);
  const pend = R.cargasPendientesTicket(book);
  const comb = R.combustibleResumen(book);
  const lastLabs = R.recientes(book).slice(0, 5);
  const silos = book.silos.filter((s) => s['Estado'] !== 'Inactivo');
  const stockTotal = silos.reduce((a, s) => a + R.siloView(s, book).stock, 0);

  const hero = h('div', { class: 'hero' },
    h('div', { class: 'hero-art', 'aria-hidden': 'true' }, furrows()),
    h('p', { class: 'eyebrow' }, `${DIAS[now.getDay()]} ${now.getDate()} de ${MESES[now.getMonth()]}`),
    h('h1', null, greeting(), '.'),
    h('div', { class: 'hero-stats' },
      h('button', { type: 'button', class: 'hs', onclick: () => go('labores') }, h('b', null, abiertas.length), h('span', null, abiertas.length === 1 ? 'labor abierta' : 'labores abiertas')),
      h('button', { type: 'button', class: 'hs', onclick: () => go('cosecha') }, h('b', null, cargas.length), h('span', null, cargas.length === 1 ? 'camión cargando' : 'camiones cargando')),
      h('button', { type: 'button', class: 'hs', onclick: () => go('cosecha') }, h('b', null, pend.length), h('span', null, pend.length === 1 ? 'ticket pendiente' : 'tickets pendientes'))));

  const quick = h('div', { class: 'quick' },
    quickBtn('tractor', 'Iniciar labor', () => F.laborForm(book)),
    quickBtn('truck', 'Nueva carga', () => F.cargaForm(book)),
    quickBtn('fuel', 'Cargar combustible', () => F.combustibleForm(book)),
    quickBtn('silo', 'Entrada a silo', async () => {
      const opts = F.siloOptions(book);
      if (!opts.length) { toast('Todavía no hay silos cargados', 'info'); return; }
      const id = opts.length === 1 ? opts[0].value : await pickOne({ title: '¿A qué silo entra?', options: opts });
      if (id) F.entradaSiloForm(book.silos.find((s) => s['ID silo'] === id));
    }));

  const marcha = [];
  for (const l of abiertas) marcha.push(h('div', { class: 'live-card' },
    h('div', { class: 'row-top', onclick: () => go(`labores/${encodeURIComponent(l['ID labor'])}`), role: 'button', tabindex: '0' },
      cropBadge(l['Cultivo'], l['Tarea'] === 'Cosecha' ? 'wheat' : 'tractor'),
      h('div', { class: 'grow' }, h('div', { class: 'title-line' }, h('b', { class: 'ct' }, `${l['Tarea']}${l['Cultivo'] ? ' · ' + l['Cultivo'] : ''}`), estadoChip(R.estadoVista(l))), h('div', { class: 'sub' }, R.laborPlace(l))),
      icon('right', 20)),
    h('div', { class: 'live-time' }, icon('clock', 18), h('b', null, fmtDur(R.laborHoras(l))), h('span', null, R.isPaused(l) ? 'trabajadas (en pausa)' : 'trabajadas'), l['Hora inicio'] ? h('em', null, `desde ${relDay(l['Fecha inicio'])} ${l['Hora inicio']}`) : null),
    laborButtons(l)));
  for (const c of cargas) marcha.push(h('div', { class: 'live-card' }, cargaCard(c, book, () => go(`cosecha/${encodeURIComponent(c['ID carga'])}`)), cargaButtons(c)));

  const tanques = h('div', { class: 'card tap-card', onclick: () => go('combustible'), role: 'button', tabindex: '0' },
    h('div', { class: 'tank-row' },
      tank('Tanque fijo', comb.fijo, comb.capFijo),
      tank('Tanque móvil', comb.movil, comb.capMovil)),
    h('div', { class: 'meta' }, h('span', null, icon('drop', 15), `Stock general ${fmtL(comb.general)}`)));

  return {
    node: h('div', { class: 'page' },
      hero,
      installNudge(),
      quick,
      section('En marcha', marcha.length ? marcha : card([emptyState('tractor', 'Nada en marcha', 'No hay labores ni camiones abiertos ahora.')])),
      pend.length ? section('Tickets pendientes', h('button', { type: 'button', class: 'card tap row-flex', onclick: () => go('cosecha') }, h('span', { class: 'crop crop-warn' }, icon('ticket', 22)), h('div', { class: 'grow' }, h('b', null, `${pend.length} ${pend.length === 1 ? 'camión espera' : 'camiones esperan'} el ticket`), h('div', { class: 'sub' }, 'Cargá el ticket para conciliar los kilos')), icon('right', 20))) : null,
      section('Combustible', tanques),
      silos.length ? section('Silos', h('div', { class: 'card tap-card', onclick: () => go('silos'), role: 'button', tabindex: '0' }, h('div', { class: 'row-top' }, h('span', { class: 'crop crop-silo' }, icon('silo', 24)), h('div', { class: 'grow' }, h('b', { class: 'ct' }, 'Stock en silos'), h('div', { class: 'sub' }, `${silos.length} ${silos.length === 1 ? 'silo activo' : 'silos activos'}`)), h('div', { class: 'big-num' }, fmtKg(stockTotal))))) : null,
      section('Últimas labores', lastLabs.length ? lastLabs.map((l) => laborCard(l, () => go(`labores/${encodeURIComponent(l['ID labor'])}`))) : card([emptyState('tractor', 'Todavía no hay labores', 'Iniciá la primera con el botón de arriba.')]),
        lastLabs.length ? h('div', { class: 'center' }, button({ label: `Ver todas (${book.labores.length})`, tone: 'ghost', onClick: () => go('labores') })) : null),
    ),
    fab: { label: 'Iniciar labor', ic: 'plus', onClick: () => F.laborForm(book) },
  };
}

function quickBtn(ic, label, onClick) {
  return h('button', { type: 'button', class: 'q', onclick: onClick }, h('span', { class: 'q-ic' }, icon(ic, 26)), h('span', null, label));
}
function tank(name, litros, cap) {
  const pct = cap ? Math.max(0, Math.min(100, Math.round((litros / cap) * 100))) : null;
  return h('div', { class: 'tank' },
    h('div', { class: 'tank-top' }, h('span', null, name), h('b', null, fmtL(litros))),
    h('div', { class: `gauge slim${litros < 0 ? ' neg' : ''}`, role: 'img', 'aria-label': pct === null ? name : `${name} ${pct}%` }, h('i', { style: { width: (pct === null ? 0 : pct) + '%' } })),
    h('small', null, cap ? `${pct}% de ${fmt0(cap)} L` : 'Capacidad sin cargar'));
}

function furrows() {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  // El dibujo tiene tamaño fijo (400 x 190 px) y queda pegado a la derecha: el horizonte (y = 96) no depende del ancho de la pantalla,
  // así el saludo siempre queda arriba de la línea. Todo lo que sale del sol se va apagando antes de llegar a un borde o a los números:
  // los rayos se desvanecen hacia abajo (terminan en y = 140, los números empiezan en y ≈ 151) y el horizonte se desvanece hacia los costados.
  s.setAttribute('viewBox', '0 0 400 190');
  const rays = [-64, -32, 0, 32, 64].map((dx) => `M322 96 L${322 + dx} 140`).join('');
  s.innerHTML = '<defs><linearGradient id="hsun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7cf6b"/><stop offset="1" stop-color="#e3921d"/></linearGradient>' +
    '<linearGradient id="hsoil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0c3324" stop-opacity=".6"/><stop offset="1" stop-color="#0c3324" stop-opacity="0"/></linearGradient>' +
    '<linearGradient id="hray" gradientUnits="userSpaceOnUse" x1="0" y1="96" x2="0" y2="140"><stop offset="0" stop-color="#f6efdc" stop-opacity=".6"/><stop offset="1" stop-color="#f6efdc" stop-opacity="0"/></linearGradient>' +
    '<linearGradient id="hline" gradientUnits="userSpaceOnUse" x1="-400" y1="0" x2="400" y2="0"><stop offset="0" stop-color="#f6efdc" stop-opacity="0"/><stop offset=".6" stop-color="#f6efdc" stop-opacity=".2"/><stop offset=".9" stop-color="#f6efdc" stop-opacity=".5"/><stop offset="1" stop-color="#f6efdc" stop-opacity="0"/></linearGradient></defs>' +
    '<rect x="-2000" y="96" width="4400" height="94" fill="url(#hsoil)"/>' +
    '<path d="M292 96A30 30 0 0 1 352 96Z" fill="url(#hsun)" opacity=".95"/>' +
    `<path d="${rays}" fill="none" stroke="url(#hray)" stroke-width="1.4" stroke-linecap="round"/>` +
    '<path d="M-400 96H400" stroke="url(#hline)" stroke-width="1.2" fill="none"/>';
  return s;
}
