import { store } from '../store.js';
import { h, section, kv, emptyState, seg, button, chip } from '../ui.js';
import { icon } from '../icons.js';
import * as R from '../rules.js';
import * as F from '../forms.js';
import { laborCard, searchBox, pageHead, detailHead, estadoChip, datoChip, card, combCard, cargaCard, statBox } from './shared.js';
import { laborButtons } from './actions.js';
import { fmtDate, fmtHa, fmtDur, fmt2, fmtL, fmtKg, norm, unique, sortEs, isBlank } from '../util.js';

const st = { seg: null, q: '', camp: '', tarea: '' };

export function render({ params, go, book }) {
  if (params[0] === 'nueva') { setTimeout(() => F.laborForm(book), 0); return list({ go, book }); }
  if (params[0]) return detail({ id: params[0], go, book });
  return list({ go, book });
}

function list({ go, book }) {
  const abiertas = R.laboresAbiertas(book);
  const segv = st.seg || (abiertas.length ? 'abiertas' : 'todas');
  let rows = R.recientes(book);
  if (segv === 'abiertas') rows = rows.filter(R.isOpen);
  if (st.camp) rows = rows.filter((l) => l['Campaña'] === st.camp);
  if (st.tarea) rows = rows.filter((l) => l['Tarea'] === st.tarea);
  if (st.q) { const q = norm(st.q); rows = rows.filter((l) => norm([l['Tarea'], l['Cultivo'], l['Campo / cliente'], l['Lote'], l['Operadores principales'], l['Máquina principal'], l['ID labor']].join(' ')).includes(q)); }
  const listEl = h('div', { class: 'list' });
  const draw = () => {
    listEl.replaceChildren(...(rows.length ? rows.slice(0, 150).map((l) => laborCard(l, () => go(`labores/${encodeURIComponent(l['ID labor'])}`))) : [card([emptyState('tractor', segv === 'abiertas' ? 'No hay labores abiertas' : 'No se encontraron labores', segv === 'abiertas' ? 'Cuando inicies una, va a aparecer acá.' : 'Probá con otros filtros.')])]));
  };
  draw();
  const camps = sortEs(unique(book.labores.map((l) => l['Campaña']).filter(Boolean))).reverse();
  const tareas = sortEs(unique(book.labores.map((l) => l['Tarea']).filter(Boolean)));
  const rerender = () => go('labores') || null;
  return {
    node: h('div', { class: 'page' },
      pageHead('Labores', `${book.labores.length} registradas · ${abiertas.length} abiertas`),
      seg([{ value: 'abiertas', label: 'Abiertas', count: abiertas.length }, { value: 'todas', label: 'Todas', count: book.labores.length }], segv, (v) => { st.seg = v; store.emit(); }),
      searchBox(st.q, (v) => { st.q = v; rows = filterRows(book, segv); draw(); }, 'Buscar labor, lote, operador…'),
      h('div', { class: 'filters' },
        selectFilter('Campaña', camps, st.camp, (v) => { st.camp = v; store.emit(); }),
        selectFilter('Tarea', tareas, st.tarea, (v) => { st.tarea = v; store.emit(); })),
      listEl,
      h('div', { class: 'center' }, button({ label: 'Cargar una labor ya terminada', tone: 'ghost', ic: 'note', onClick: () => F.laborForm(book, { mode: 'manual' }) }))),
    fab: { label: 'Iniciar labor', ic: 'plus', onClick: () => F.laborForm(book) },
  };
}

function filterRows(book, segv) {
  let rows = R.recientes(book);
  if (segv === 'abiertas') rows = rows.filter(R.isOpen);
  if (st.camp) rows = rows.filter((l) => l['Campaña'] === st.camp);
  if (st.tarea) rows = rows.filter((l) => l['Tarea'] === st.tarea);
  if (st.q) { const q = norm(st.q); rows = rows.filter((l) => norm([l['Tarea'], l['Cultivo'], l['Campo / cliente'], l['Lote'], l['Operadores principales'], l['Máquina principal'], l['ID labor']].join(' ')).includes(q)); }
  return rows;
}

export function selectFilter(label, options, value, onChange) {
  return h('label', { class: 'filter' }, h('span', null, label),
    h('select', { class: 'input select sm', onchange: (e) => { const val = e.target.value; e.target.blur(); onChange(val); } }, h('option', { value: '' }, 'Todas'), options.map((o) => h('option', { value: o, selected: o === value }, o))));
}

function detail({ id, go, book }) {
  const l = book.labores.find((x) => x['ID labor'] === id);
  const backTo = () => go('labores');
  if (!l) return { node: h('div', { class: 'page' }, detailHead({ title: 'Labor', onBack: backTo }), card([emptyState('tractor', 'No encontré esa labor', 'Puede que todavía no se haya sincronizado.')])) };
  const hrs = R.laborHoras(l);
  const rend = R.laborRend(l);
  const combs = book.comb.filter((m) => m['ID labor vinculada'] === l['ID labor']);
  const cargas = book.cargas.filter((c) => c['ID labor vinculada'] === l['ID labor']);
  const prodLabor = l['Tarea'] === 'Cosecha' ? R.produccionDeLabor(book, l) : null;
  const pv = prodLabor ? R.prodView(prodLabor, book) : null;
  const fuelL = combs.reduce((a, m) => a + (m['Computa consumo labor'] === 'Sí' ? (m['Litros'] || 0) : 0), 0);
  return {
    node: h('div', { class: 'page' },
      detailHead({ title: l['Tarea'] + (l['Cultivo'] ? ' · ' + l['Cultivo'] : ''), sub: R.laborPlace(l), ic: l['Tarea'] === 'Cosecha' ? 'wheat' : 'tractor', crop: l['Cultivo'], chips: [estadoChip(R.estadoVista(l)), datoChip(l['Estado dato']), l._pending ? chip('Sin subir', 'warn', 'cloud') : null], onBack: backTo }),
      R.isOpen(l) ? h('div', { class: 'live-card flat' }, h('div', { class: 'live-time' }, icon('clock', 18), h('b', null, fmtDur(hrs)), h('span', null, R.isPaused(l) ? 'trabajadas (en pausa)' : 'trabajadas'), l['Hora inicio'] ? h('em', null, `desde ${fmtDate(l['Fecha inicio'], false)} ${l['Hora inicio']}`) : null), laborButtons(l, { size: 'lg' })) : null,
      section('Información general', card([
        kv('Campaña', l['Campaña']), kv('Lote', R.laborPlace(l)), kv('Unidad', l['Unidad']), kv('Cultivo', l['Cultivo']), kv('Variedad / híbrido', l['Variedad / híbrido']),
        kv('Inicio', l['Fecha inicio'] ? `${fmtDate(l['Fecha inicio'])}${l['Hora inicio'] ? ' · ' + l['Hora inicio'] : ''}` : ''),
        kv('Fin', l['Fecha fin'] ? `${fmtDate(l['Fecha fin'])}${l['Hora fin'] ? ' · ' + l['Hora fin'] : ''}` : ''),
      ])),
      section('Maquinaria y operadores', card([
        kv('Máquina principal', l['Máquina principal']), kv('Implemento / equipo', l['Implemento / equipo']), kv('Operadores principales', l['Operadores principales']),
        kv('Equipos de apoyo', l['Equipos de apoyo']), kv('Operadores de apoyo', l['Operadores de apoyo']),
      ])),
      section('Resultados', card([
        kv('Hectáreas realizadas', isBlank(l['Ha realizadas']) ? '' : fmtHa(l['Ha realizadas']), { strong: true }),
        kv('Pausas y demoras', isBlank(l['Pausas / demoras h']) ? '' : fmtDur(l['Pausas / demoras h'])),
        kv('Horas efectivas', hrs === null ? '' : fmtDur(hrs)),
        kv('Rendimiento', rend === null ? '' : `${fmt2(rend)} ha/h`),
        kv('Combustible de la labor', fuelL ? fmtL(fuelL) : ''),
        l['Tarea'] === 'Cosecha' ? kv('Kg cosechados (descargas)', fmtKg(book.movs.filter((m) => m['ID labor vinculada'] === l['ID labor'] && R.computaApp(m) === 'Sí').reduce((a, m) => a + (m['Kg asignados'] || 0), 0))) : null,
      ])),
      prodLabor ? section('Producción del lote', card([
        h('div', { class: 'stats three flat' }, statBox('Kilos', fmtKg(pv.kgFinal).replace(/\s*kg$/, '')), statBox('Camiones', pv.camiones || '—'), statBox('Rinde qq/ha', pv.rinde === null ? '—' : fmt2(pv.rinde))),
        kv('Producción', R.prodName(prodLabor)),
        h('div', { class: 'btn-col' }, button({ label: 'Ver la producción', ic: 'seedling', tone: 'soft', block: true, onClick: () => go(`produccion/${encodeURIComponent(prodLabor['ID producción'])}`) }))])) : l['Tarea'] === 'Cosecha' && R.laborEsCosechaDeLote(l) ? section('Producción del lote', card([h('p', { class: 'prose' }, 'Todavía no tiene producción: se crea sola al abrir el primer camión o al editar la labor.')])) : null,
      l['Novedades'] ? section('Novedades', card([h('p', { class: 'prose' }, l['Novedades'])])) : null,
      combs.length ? section('Combustible vinculado', combs.map((m) => combCard(m, () => go(`combustible/${encodeURIComponent(m['ID movimiento combustible'])}`)))) : null,
      cargas.length ? section('Camiones de esta labor', cargas.map((c) => cargaCard(c, book, () => go(`cosecha/${encodeURIComponent(c['ID carga'])}`)))) : null,
      h('div', { class: 'btn-col' },
        button({ label: 'Cargar combustible a esta labor', ic: 'fuel', tone: 'soft', block: true, onClick: () => F.combustibleForm(book, null, { 'Tipo movimiento': 'Carga a maquinaria', 'ID labor vinculada': l['ID labor'], 'Activo abastecido': l['Máquina principal'] || '', Destino: l['Máquina principal'] || '', 'Unidad económica': l['Unidad'], 'Campo / cliente': l['Campo / cliente'], Lote: l['Lote'], 'Computa consumo labor': 'Pendiente' }) }),
        button({ label: 'Editar labor', ic: 'edit', tone: 'ghost', block: true, onClick: () => F.laborForm(book, { mode: 'editar', labor: l }) }))),
  };
}
