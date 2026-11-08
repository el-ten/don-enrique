// Tarjetas y piezas comunes a varias pantallas.
import { h, chip } from '../ui.js';
import { icon } from '../icons.js';
import * as R from '../rules.js';
import { fmtDate, fmtHa, fmtKg, fmtL, fmtDur, relDay, fmt0, fmt2, isBlank, fmtSigned } from '../util.js';

export function cropBadge(cultivo, ic = 'wheat') {
  return h('span', { class: `crop crop-${R.cropColor(cultivo)}`, title: cultivo || '' }, icon(ic, 22));
}

export function estadoChip(estado) {
  const tone = {
    'En curso': 'live', 'En carga': 'live', Pausada: 'warn', Terminado: 'done', Conciliado: 'ok', Despachado: 'info',
    'Revisar diferencia': 'err', Cancelado: 'err', Suspendido: 'warn', Planificado: 'info', Reprogramado: 'info', Activo: 'ok', Inactivo: 'neutral',
    Confirmado: 'ok', Reconstruido: 'info', Estimado: 'warn', Pendiente: 'warn',
  }[estado] || 'neutral';
  return chip(estado, tone);
}
export function datoChip(estado) {
  if (!estado || estado === 'Confirmado') return null;
  return chip(estado, { Reconstruido: 'info', Estimado: 'warn', Pendiente: 'warn' }[estado] || 'neutral');
}

export function card(children, { onClick, cls = '' } = {}) {
  const el = h(onClick ? 'button' : 'div', { class: `card${onClick ? ' tap' : ''} ${cls}`.trim(), type: onClick ? 'button' : undefined, onclick: onClick }, children);
  return el;
}

export function laborCard(l, onClick) {
  const open = R.isOpen(l);
  const hrs = R.laborHoras(l);
  const ops = l['Operadores principales'];
  return card([
    h('div', { class: 'row-top' },
      cropBadge(l['Cultivo'], l['Tarea'] === 'Cosecha' ? 'wheat' : 'tractor'),
      h('div', { class: 'grow' },
        h('div', { class: 'title-line' }, h('b', { class: 'ct' }, `${l['Tarea']}${l['Cultivo'] ? ' · ' + l['Cultivo'] : ''}`), estadoChip(R.estadoVista(l))),
        h('div', { class: 'sub' }, R.laborPlace(l)))),
    h('div', { class: 'meta' },
      h('span', null, icon('calendar', 15), relDay(l['Fecha inicio'])),
      !isBlank(l['Ha realizadas']) ? h('span', null, icon('map', 15), fmtHa(l['Ha realizadas'])) : null,
      hrs !== null ? h('span', null, icon('clock', 15), fmtDur(hrs)) : null,
      ops ? h('span', null, icon('user', 15), ops) : null,
      l._pending ? chip('Sin subir', 'warn', 'cloud') : null),
  ], { onClick });
}

export function cargaCard(c, book, onClick) {
  const cv = R.cargaView(c, book);
  return card([
    h('div', { class: 'row-top' },
      cropBadge(c['Cultivo'], 'truck'),
      h('div', { class: 'grow' },
        h('div', { class: 'title-line' }, h('b', { class: 'ct' }, c['Camión / patente'] || 'Sin patente'), estadoChip(c['Estado carga'])),
        h('div', { class: 'sub' }, `${c['Cultivo']} → ${c['Destino']}${c['Campo / cliente'] ? ' · ' + c['Campo / cliente'] : ''}${c['Lote'] ? ' — ' + c['Lote'] : ''}`))),
    h('div', { class: 'meta' },
      h('span', null, icon('calendar', 15), relDay(c['Fecha'])),
      h('span', null, icon('unload', 15), `${cv.descargas} ${cv.descargas === 1 ? 'descarga' : 'descargas'}`),
      h('span', { class: 'strong' }, icon('scale', 15), fmtKg(cv.kgRec)),
      cv.tieneTicket ? h('span', { class: cv.control === 'Revisar diferencia' ? 'bad' : 'good' }, icon('ticket', 15), `Ticket ${fmtKg(c['Peso ticket kg'])}`) : (c['Estado carga'] !== 'En carga' ? h('span', { class: 'warnx' }, icon('ticket', 15), 'Falta ticket') : null),
      c._pending ? chip('Sin subir', 'warn', 'cloud') : null),
  ], { onClick });
}

export function siloCard(s, book, onClick) {
  const sv = R.siloView(s, book);
  const pct = sv.pct === null ? null : Math.max(0, Math.min(100, sv.pct));
  return card([
    h('div', { class: 'row-top' },
      h('span', { class: 'crop crop-silo' }, icon('silo', 24)),
      h('div', { class: 'grow' },
        h('div', { class: 'title-line' }, h('b', { class: 'ct' }, s['Nombre silo'] || s['ID silo']), s['Estado'] === 'Inactivo' ? chip('Inactivo', 'neutral') : null),
        h('div', { class: 'sub' }, `${s['Tipo'] || ''} · ${sv.cultivo}`)),
      h('div', { class: 'big-num' }, fmtKg(sv.stock))),
    pct !== null ? h('div', { class: 'gauge', role: 'img', 'aria-label': `${pct}% lleno` }, h('i', { style: { width: pct + '%' } }), h('span', null, `${sv.pct}% lleno`)) : h('div', { class: 'meta' }, h('span', { class: 'muted' }, 'Sin capacidad cargada')),
  ], { onClick });
}

export function prodCard(p, book, onClick) {
  const pv = R.prodView(p, book);
  return card([
    h('div', { class: 'row-top' },
      cropBadge(p['Cultivo'], 'seedling'),
      h('div', { class: 'grow' },
        h('div', { class: 'title-line' }, h('b', { class: 'ct' }, `${p['Cultivo']} · ${p['Campo / cliente']}`), h('span', { class: 'camp' }, p['Campaña'])),
        h('div', { class: 'sub' }, `${p['Lote / condición']}${isBlank(p['Ha cosechadas']) ? '' : ' · ' + fmt2(p['Ha cosechadas']) + ' ha'}`))),
    h('div', { class: 'meta' },
      h('span', { class: 'strong' }, icon('scale', 15), fmtKg(pv.kgFinal)),
      pv.camiones ? h('span', null, icon('truck', 15), `${pv.camiones} ${pv.camiones === 1 ? 'camión' : 'camiones'}`) : null,
      pv.rinde !== null ? h('span', null, icon('chart', 15), `${fmt2(pv.rinde)} qq/ha`) : null,
      datoChip(p['Estado dato'])),
  ], { onClick });
}

export function combCard(m, onClick) {
  const imp = R.impactoGeneral(m);
  const tone = ['Compra / ingreso', 'Stock inicial', 'Devolución', 'Ajuste positivo'].includes(m['Tipo movimiento']) ? 'in' : m['Tipo movimiento'] === 'Transferencia interna' ? 'mid' : 'out';
  const via = m['Origen'] && m['Destino'] ? `${m['Origen']} → ${m['Destino']}` : m['Origen'] ? `Desde ${m['Origen']}` : m['Destino'] ? `Hacia ${m['Destino']}` : '';
  return card([
    h('div', { class: 'row-top' },
      h('span', { class: `crop crop-fuel-${tone}` }, icon('fuel', 22)),
      h('div', { class: 'grow' },
        h('div', { class: 'title-line' }, h('b', { class: 'ct' }, m['Tipo movimiento']), h('span', { class: `lit lit-${tone}` }, fmtL(m['Litros']))),
        h('div', { class: 'sub' }, via || 'Origen y destino pendientes'))),
    h('div', { class: 'meta' },
      h('span', null, icon('calendar', 15), relDay(m['Fecha']) + (m['Hora'] ? ' ' + m['Hora'] : '')),
      m['Responsable'] ? h('span', null, icon('user', 15), m['Responsable']) : null,
      m['Campo / cliente'] ? h('span', null, icon('map', 15), `${m['Campo / cliente']}${m['Lote'] ? ' — ' + m['Lote'] : ''}`) : null,
      datoChip(m['Estado dato']),
      m._pending ? chip('Sin subir', 'warn', 'cloud') : null),
  ], { onClick });
}

export function searchBox(value, onInput, placeholder = 'Buscar…') {
  const inp = h('input', { class: 'input search', type: 'search', placeholder, value, 'aria-label': placeholder, autocomplete: 'off', oninput: (e) => onInput(e.target.value) });
  return h('div', { class: 'searchbox' }, icon('search', 18), inp);
}

export function pageHead(title, sub, right) {
  return h('div', { class: 'page-head' }, h('div', null, h('h1', null, title), sub ? h('p', null, sub) : null), right || null);
}

export function detailHead({ title, sub, ic, crop, chips = [], onBack }) {
  return h('div', { class: 'detail-head' },
    h('button', { class: 'icon-btn light', type: 'button', onclick: onBack, 'aria-label': 'Volver' }, icon('left', 24)),
    h('div', { class: 'dh-main' }, crop ? cropBadge(crop, ic) : null, h('div', null, h('h1', null, title), sub ? h('p', null, sub) : null)),
    chips.length ? h('div', { class: 'dh-chips' }, chips) : null);
}

export function statBox(label, value, tone = '') { return h('div', { class: `stat ${tone}` }, h('span', null, label), h('b', null, value)); }
