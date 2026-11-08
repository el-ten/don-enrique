import { store } from '../store.js';
import { h, section, kv, emptyState, seg, button, chip } from '../ui.js';
import { icon } from '../icons.js';
import * as R from '../rules.js';
import * as F from '../forms.js';
import { cargaCard, searchBox, pageHead, detailHead, estadoChip, card, statBox } from './shared.js';
import { cargaButtons } from './actions.js';
import { fmtDate, fmtKg, relDay, norm, isBlank, fmtDateShort } from '../util.js';
import { selectFilter } from './labores.js';

const st = { seg: null, q: '', camp: '' };

export function render({ params, go, book }) {
  if (params[0]) return detail({ id: params[0], go, book });
  return list({ go, book });
}

function list({ go, book }) {
  const enCarga = R.cargasEnCurso(book);
  const pend = R.cargasPendientesTicket(book);
  const segv = st.seg || (enCarga.length ? 'carga' : pend.length ? 'ticket' : 'historial');
  const sorted = [...book.cargas].sort((a, b) => (b['Fecha'] || '').localeCompare(a['Fecha'] || ''));
  const pick = () => {
    let rows = segv === 'carga' ? enCarga : segv === 'ticket' ? pend : sorted;
    rows = [...rows].sort((a, b) => (b['Fecha'] || '').localeCompare(a['Fecha'] || ''));
    if (st.camp) rows = rows.filter((c) => c['Campaña'] === st.camp);
    if (st.q) { const q = norm(st.q); rows = rows.filter((c) => norm([c['Camión / patente'], c['Cultivo'], c['Destino'], c['Campo / cliente'], c['Lote'], c['Número ticket']].join(' ')).includes(q)); }
    return rows;
  };
  const listEl = h('div', { class: 'list' });
  const draw = () => {
    if (segv === 'movs') {
      const movs = [...book.movs].reverse().slice(0, 80);
      listEl.replaceChildren(...(movs.length ? movs.map((m) => movCard(m, book, go)) : [card([emptyState('unload', 'Sin movimientos', 'Las descargas y entradas a silo aparecen acá.')])]));
      return;
    }
    const rows = pick();
    const empty = segv === 'carga' ? ['truck', 'No hay camiones cargando', 'Abrí una carga nueva cuando llegue el camión.'] : segv === 'ticket' ? ['ticket', 'No hay tickets pendientes', 'Todas las cargas despachadas tienen su ticket.'] : ['truck', 'Sin cargas', 'Todavía no hay cargas para mostrar.'];
    listEl.replaceChildren(...(rows.length ? rows.slice(0, 150).map((c) => cargaCard(c, book, () => go(`cosecha/${encodeURIComponent(c['ID carga'])}`))) : [card([emptyState(...empty)])]));
  };
  draw();
  const camps = [...new Set(book.cargas.map((c) => c['Campaña']).filter(Boolean))].sort().reverse();
  return {
    node: h('div', { class: 'page' },
      pageHead('Cosecha', 'Camiones, descargas y tickets'),
      seg([
        { value: 'carga', label: 'En carga', count: enCarga.length },
        { value: 'ticket', label: 'Tickets', count: pend.length },
        { value: 'historial', label: 'Historial', count: book.cargas.length },
        { value: 'movs', label: 'Descargas' },
      ], segv, (v) => { st.seg = v; store.emit(); }),
      segv !== 'movs' ? searchBox(st.q, (v) => { st.q = v; draw(); }, 'Buscar patente, cultivo, destino…') : null,
      segv === 'historial' ? h('div', { class: 'filters' }, selectFilter('Campaña', camps, st.camp, (v) => { st.camp = v; store.emit(); })) : null,
      listEl),
    fab: { label: 'Nueva carga', ic: 'plus', onClick: () => F.cargaForm(book) },
  };
}

function movCard(m, book, go) {
  const carga = m['ID carga'] ? book.cargas.find((c) => c['ID carga'] === m['ID carga']) : null;
  const silo = m['ID silo'] ? book.silos.find((s) => s['ID silo'] === m['ID silo']) : null;
  const click = carga ? () => go(`cosecha/${encodeURIComponent(carga['ID carga'])}`) : silo ? () => go(`silos/${encodeURIComponent(silo['ID silo'])}`) : null;
  return card([
    h('div', { class: 'row-top' },
      h('span', { class: 'crop crop-silo' }, icon(m['Tipo de movimiento'] === 'Despacho de stock' ? 'truck' : 'unload', 22)),
      h('div', { class: 'grow' },
        h('div', { class: 'title-line' }, h('b', { class: 'ct' }, m['Monotolva utilizada'] || m['Tipo de movimiento']), h('span', { class: 'lit' }, fmtKg(m['Kg asignados']))),
        h('div', { class: 'sub' }, `${m['Tipo de movimiento']}${carga ? ' · ' + carga['Camión / patente'] : ''}${silo ? ' · ' + silo['Nombre silo'] : ''}`))),
    h('div', { class: 'meta' }, h('span', null, icon('calendar', 15), relDay(m['Fecha'])), m['Cultivo'] ? h('span', null, icon('wheat', 15), m['Cultivo']) : null, m['Campo / cliente'] ? h('span', null, icon('map', 15), m['Campo / cliente'] + (m['Lote'] ? ' — ' + m['Lote'] : '')) : null, m._pending ? chip('Sin subir', 'warn', 'cloud') : null),
  ], { onClick: click });
}

function detail({ id, go, book }) {
  const c = book.cargas.find((x) => x['ID carga'] === id);
  const backTo = () => go('cosecha');
  if (!c) return { node: h('div', { class: 'page' }, detailHead({ title: 'Carga', onBack: backTo }), card([emptyState('truck', 'No encontré esa carga', 'Puede que todavía no se haya sincronizado.')])) };
  const cv = R.cargaView(c, book);
  const ctl = { 'Dentro de tolerancia': 'ok', 'Revisar diferencia': 'err', 'Pendiente de ticket': 'warn' }[cv.control];
  const lab = c['ID labor vinculada'] ? book.labores.find((l) => l['ID labor'] === c['ID labor vinculada']) : null;
  const prod = c['ID producción vinculada'] ? book.prod.find((p) => p['ID producción'] === c['ID producción vinculada']) : null;
  return {
    node: h('div', { class: 'page' },
      detailHead({ title: c['Camión / patente'] || 'Carga', sub: `${c['Cultivo']} → ${c['Destino']} · ${fmtDate(c['Fecha'])}`, ic: 'truck', crop: c['Cultivo'], chips: [estadoChip(c['Estado carga']), c._pending ? chip('Sin subir', 'warn', 'cloud') : null], onBack: backTo }),
      h('div', { class: 'stats three' }, statBox('Kg cargados', fmtKg(cv.kgRec)), statBox('Ticket', cv.tieneTicket ? fmtKg(c['Peso ticket kg']) : '—'), statBox('Diferencia', cv.diff === null ? '—' : `${cv.diff > 0 ? '+' : ''}${fmtKg(cv.diff)}`, ctl)),
      h('div', { class: `control control-${ctl}` }, icon(cv.control === 'Dentro de tolerancia' ? 'checkcircle' : cv.control === 'Revisar diferencia' ? 'alert' : 'hourglass', 20), h('b', null, cv.control), cv.control === 'Revisar diferencia' ? h('span', null, `Supera los ${R.TOL_KG} kg de tolerancia`) : null),
      cargaButtons(c, { size: 'lg', full: true }),
      section('Descargas', cv.movs.length ? cv.movs.map((m) => card([
        h('div', { class: 'row-top' }, h('span', { class: 'crop crop-silo' }, icon('unload', 22)), h('div', { class: 'grow' }, h('div', { class: 'title-line' }, h('b', { class: 'ct' }, m['Monotolva utilizada'] || 'Descarga'), h('span', { class: 'lit' }, fmtKg(m['Kg asignados']))), h('div', { class: 'sub' }, `${fmtDateShort(m['Fecha'])}${m['ID silo'] ? ' · ' + ((book.silos.find((s) => s['ID silo'] === m['ID silo']) || {})['Nombre silo'] || m['ID silo']) : ''}${m['Observaciones'] ? ' · ' + m['Observaciones'] : ''}`)))])) : card([emptyState('unload', 'Sin descargas todavía', 'Usá "Agregar descarga" cada vez que la tolva descarga en el camión.')])),
      section('Datos de la carga', card([
        kv('Campaña', c['Campaña']), kv('Unidad', c['Unidad']), kv('Campo / cliente', c['Campo / cliente']), kv('Lote', c['Lote']),
        kv('Labor', lab ? R.laborTitle(lab) : c['ID labor vinculada']), kv('Producción', prod ? R.prodName(prod) : ''), kv('¿Suma a la producción?', c['Computa producción']),
        kv('Documento / origen', c['Documento / origen']), kv('Número de ticket', c['Número ticket']), kv('Observaciones', c['Observaciones']),
      ])),
      lab ? h('div', { class: 'btn-col' }, button({ label: 'Ver la labor de cosecha', ic: 'tractor', tone: 'ghost', block: true, onClick: () => go(`labores/${encodeURIComponent(lab['ID labor'])}`) })) : null),
  };
}
