import { store } from '../store.js';
import { h, section, kv, emptyState, seg, button, chip } from '../ui.js';
import { icon } from '../icons.js';
import * as R from '../rules.js';
import * as F from '../forms.js';
import { combCard, searchBox, pageHead, detailHead, datoChip, card, statBox } from './shared.js';
import { fmtL, fmtSigned, fmtDate, norm, isBlank, fmt0 } from '../util.js';

const st = { seg: 'todos', q: '' };
const SEGS = {
  todos: () => true,
  ingresos: (m) => ['Compra / ingreso', 'Stock inicial', 'Devolución', 'Ajuste positivo'].includes(m['Tipo movimiento']),
  cargas: (m) => m['Tipo movimiento'] === 'Carga a maquinaria',
  otros: (m) => ['Transferencia interna', 'Salida a tercero', 'Ajuste negativo'].includes(m['Tipo movimiento']),
};

export function render({ params, go, book }) {
  if (params[0]) return detail({ id: params[0], go, book });
  return list({ go, book });
}

function list({ go, book }) {
  const r = R.combustibleResumen(book);
  const est = book.labores.reduce((a, l) => a + (l['Combustible estimado L'] || 0), 0);
  const rows = () => [...book.comb].filter(SEGS[st.seg]).filter((m) => {
    if (!st.q) return true; const q = norm(st.q);
    return norm([m['Tipo movimiento'], m['Origen'], m['Destino'], m['Activo abastecido'], m['Responsable'], m['Campo / cliente'], m['Lote']].join(' ')).includes(q);
  }).sort((a, b) => ((b['Fecha'] || '') + (b['Hora'] || '')).localeCompare((a['Fecha'] || '') + (a['Hora'] || '')));
  const listEl = h('div', { class: 'list' });
  const draw = () => {
    const rs = rows();
    listEl.replaceChildren(...(rs.length ? rs.slice(0, 150).map((m) => combCard(m, () => go(`combustible/${encodeURIComponent(m['ID movimiento combustible'])}`))) : [card([emptyState('fuel', 'Sin movimientos', 'Cargá el primero con el botón de abajo.')])]));
  };
  draw();
  const tank = (name, l, cap) => {
    const pct = cap ? Math.max(0, Math.min(100, Math.round((l / cap) * 100))) : null;
    return h('div', { class: 'tank big' }, h('div', { class: 'tank-top' }, h('span', null, name), h('b', null, fmtL(l))), h('div', { class: `gauge${l < 0 ? ' neg' : ''}` }, h('i', { style: { width: (pct || 0) + '%' } }), h('span', null, pct === null ? 'Capacidad sin cargar' : `${pct}% de ${fmt0(cap)} L`)));
  };
  return {
    node: h('div', { class: 'page' },
      pageHead('Combustible', 'Tanques y movimientos'),
      card([tank('Tanque fijo', r.fijo, r.capFijo), tank('Tanque móvil', r.movil, r.capMovil), h('div', { class: 'stats three' }, statBox('Stock general', fmtL(r.general)), statBox('Comprado', fmtL(r.comprado)), statBox('Cargado a máquinas', fmtL(r.cargado)))]),
      est > 0 ? h('div', { class: 'note note-info' }, icon('info', 18), h('span', null, `Consumo estimado según labores: ${fmtL(est)}. Diferencia con lo cargado: ${fmtSigned(r.cargado - est, ' L')}.`)) : null,
      seg([{ value: 'todos', label: 'Todos' }, { value: 'ingresos', label: 'Ingresos' }, { value: 'cargas', label: 'Cargas' }, { value: 'otros', label: 'Otros' }], st.seg, (v) => { st.seg = v; store.emit(); }),
      searchBox(st.q, (v) => { st.q = v; draw(); }, 'Buscar equipo, responsable, lote…'),
      listEl),
    fab: { label: 'Nuevo movimiento', ic: 'plus', onClick: () => F.combustibleForm(book) },
  };
}

function detail({ id, go, book }) {
  const m = book.comb.find((x) => x['ID movimiento combustible'] === id);
  const backTo = () => go('combustible');
  if (!m) return { node: h('div', { class: 'page' }, detailHead({ title: 'Movimiento', onBack: backTo }), card([emptyState('fuel', 'No encontré ese movimiento', 'Puede que todavía no se haya sincronizado.')])) };
  const lab = m['ID labor vinculada'] ? book.labores.find((l) => l['ID labor'] === m['ID labor vinculada']) : null;
  const fijo = R.impactoTanque(m, 'Tanque fijo'), movil = R.impactoTanque(m, 'Tanque móvil'), gen = R.impactoGeneral(m);
  return {
    node: h('div', { class: 'page' },
      detailHead({ title: `${m['Tipo movimiento']} · ${fmtL(m['Litros'])}`, sub: `${fmtDate(m['Fecha'])}${m['Hora'] ? ' · ' + m['Hora'] : ''}`, ic: 'fuel', crop: '', chips: [datoChip(m['Estado dato']), m._pending ? chip('Sin subir', 'warn', 'cloud') : null], onBack: backTo }),
      h('div', { class: 'stats three' }, statBox('Tanque fijo', fmtSigned(fijo, ' L')), statBox('Tanque móvil', fmtSigned(movil, ' L')), statBox('Stock general', fmtSigned(gen, ' L'))),
      section('Detalle', card([
        kv('Producto', m['Producto']), kv('Sale de', m['Origen']), kv('Entra a', m['Destino']), kv('Equipo abastecido', m['Activo abastecido']),
        kv('Labor', lab ? R.laborTitle(lab) : m['ID labor vinculada']), kv('¿Es consumo de la labor?', m['Computa consumo labor']),
        kv('Unidad económica', m['Unidad económica']), kv('Campo / cliente', m['Campo / cliente']), kv('Lote', m['Lote']),
        kv('Responsable', m['Responsable']), kv('Horómetro / km', m['Horómetro / kilometraje']), kv('Documento', m['Documento / origen']), kv('Campaña', m['Campaña']),
      ])),
      m['Observaciones'] ? section('Observaciones', card([h('p', { class: 'prose' }, m['Observaciones'])])) : null,
      h('div', { class: 'btn-col' },
        lab ? button({ label: 'Ver la labor', ic: 'tractor', tone: 'soft', block: true, onClick: () => go(`labores/${encodeURIComponent(lab['ID labor'])}`) }) : null,
        button({ label: 'Editar movimiento', ic: 'edit', tone: 'ghost', block: true, onClick: () => F.combustibleForm(book, m) }))),
  };
}
