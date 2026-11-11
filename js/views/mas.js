// "Más": silos, producción, campos y lotes, equipos.
import { store } from '../store.js';
import { h, section, kv, emptyState, button, chip } from '../ui.js';
import { icon } from '../icons.js';
import * as R from '../rules.js';
import * as F from '../forms.js';
import { siloCard, prodCard, searchBox, pageHead, detailHead, estadoChip, datoChip, card, statBox, laborCard, cropBadge } from './shared.js';
import { fmtKg, fmtDate, fmtDateShort, fmtHa, fmt2, fmt0, norm, isBlank, unique, sortEs, relDay } from '../util.js';
import { selectFilter } from './labores.js';

export function render(ctx) {
  const { route, params } = ctx;
  if (route === 'silos') return params[0] ? siloDetail(ctx) : silosList(ctx);
  if (route === 'produccion') return params[0] ? prodDetail(ctx) : prodList(ctx);
  if (route === 'lotes') return params[0] ? loteDetail(ctx) : lotesList(ctx);
  if (route === 'equipos') return params[0] ? equipoDetail(ctx) : equiposList(ctx);
  return menu(ctx);
}

function menu({ go, book }) {
  const stock = book.silos.reduce((a, s) => a + R.siloView(s, book).stock, 0);
  const tile = (ic, name, sub, to, tone) => h('button', { type: 'button', class: `tile tile-${tone}`, onclick: () => go(to) }, h('span', { class: 'tile-ic' }, icon(ic, 28)), h('b', null, name), h('small', null, sub));
  return {
    node: h('div', { class: 'page' },
      pageHead('Más', 'Todo lo demás de la SH'),
      h('div', { class: 'tiles' },
        tile('silo', 'Silos', `${fmtKg(stock)} en stock`, 'silos', 'gold'),
        tile('seedling', 'Producción', `${book.prod.length} ${book.prod.length === 1 ? 'registro' : 'registros'}`, 'produccion', 'green'),
        tile('map', 'Campos y lotes', `${book.lotes.length} lotes`, 'lotes', 'earth'),
        tile('coin', 'Servicios', book.hasServ ? servSub(book) : 'Tarifas y resumen', 'servicios', 'gold'),
        tile('ticket', 'Facturas', book.hasDocs ? factSub(book) : 'Emitidas y recibidas', 'facturas', 'blue'),
        tile('tractor', 'Equipos', `${book.activos.length} equipos`, 'equipos', 'blue'),
        tile('gear', 'Ajustes', 'Conexión y sincronización', 'ajustes', 'slate'))),
  };
}

// Texto del botón de Servicios: cuántos servicios esperan tarifa.
function servSub(book) {
  const sin = book.serv.filter(R.servicioSinTarifa).length;
  return sin ? `${sin} sin tarifa` : `${book.serv.length} ${book.serv.length === 1 ? 'servicio' : 'servicios'}`;
}

// Texto del botón de Facturas: cuántas hay sin pagar o sin cobrar.
function factSub(book) {
  const sin = book.docs.filter((d) => !R.docPagado(d)).length;
  return sin ? `${sin} ${sin === 1 ? 'pendiente' : 'pendientes'}` : `${book.docs.length} ${book.docs.length === 1 ? 'factura' : 'facturas'}`;
}

// ---------------------------------------------------------------- SILOS
function silosList({ go, book }) {
  const stock = book.silos.reduce((a, s) => a + R.siloView(s, book).stock, 0);
  return {
    node: h('div', { class: 'page' },
      detailHead({ title: 'Silos', sub: `Stock total ${fmtKg(stock)}`, ic: 'silo', crop: '', onBack: () => go('mas') }),
      book.silos.length ? book.silos.map((s) => siloCard(s, book, () => go(`silos/${encodeURIComponent(s['ID silo'])}`))) : card([emptyState('silo', 'Sin silos', 'Creá el primero.')]),
      h('div', { class: 'btn-col' }, button({ label: 'Nuevo silo', ic: 'plus', tone: 'soft', block: true, onClick: () => F.siloForm(book) }))),
  };
}
function siloDetail({ params, go, book }) {
  const s = book.silos.find((x) => x['ID silo'] === params[0]);
  const backTo = () => go('silos');
  if (!s) return { node: h('div', { class: 'page' }, detailHead({ title: 'Silo', onBack: backTo }), card([emptyState('silo', 'No encontré ese silo', '')])) };
  const sv = R.siloView(s, book);
  const movs = [...sv.movs].sort((a, b) => (b['Fecha'] || '').localeCompare(a['Fecha'] || ''));
  const pct = sv.pct === null ? null : Math.max(0, Math.min(100, sv.pct));
  return {
    node: h('div', { class: 'page' },
      detailHead({ title: s['Nombre silo'], sub: `${s['Tipo']} · ${sv.cultivo}`, ic: 'silo', crop: '', chips: [estadoChip(s['Estado']), datoChip(s['Estado dato'])], onBack: backTo }),
      card([h('div', { class: 'big-num center' }, fmtKg(sv.stock)), pct !== null ? h('div', { class: 'gauge' }, h('i', { style: { width: pct + '%' } }), h('span', null, `${sv.pct}% de ${fmtKg(s['Capacidad kg'])}`)) : h('p', { class: 'muted center' }, 'Cargá la capacidad para ver el % de llenado.'),
        h('div', { class: 'stats' }, statBox('Entradas', fmtKg(sv.entradas)), statBox('Salidas', fmtKg(sv.salidas)))]),
      h('div', { class: 'btn-row' }, button({ label: 'Cargar al silo', ic: 'unload', tone: 'primary', size: 'lg', onClick: () => F.entradaSiloForm(s) }), button({ label: 'Despachar', ic: 'truck', tone: 'soft', size: 'lg', onClick: () => F.salidaSiloForm(s) })),
      section('Movimientos', movs.length ? movs.map((m) => {
        const out = m['Tipo de movimiento'] === 'Despacho de stock';
        const prod = m['ID producción vinculada'] ? book.prod.find((p) => p['ID producción'] === m['ID producción vinculada']) : null;
        return card([h('div', { class: 'row-top' }, h('span', { class: `crop crop-fuel-${out ? 'out' : 'in'}` }, icon(out ? 'truck' : 'unload', 22)), h('div', { class: 'grow' }, h('div', { class: 'title-line' }, h('b', { class: 'ct' }, out ? 'Salida' : 'Entrada'), h('span', { class: `lit lit-${out ? 'out' : 'in'}` }, `${out ? '−' : '+'}${fmtKg(m['Kg asignados'])}`)), h('div', { class: 'sub' }, `${fmtDateShort(m['Fecha'])}${prod ? ' · ' + R.prodName(prod) : m['Cultivo'] ? ' · ' + m['Cultivo'] + (m['Campo / cliente'] ? ' · ' + m['Campo / cliente'] : '') : ''}${m['Destino / ubicación'] && out ? ' → ' + m['Destino / ubicación'] : ''}`)))]);
      }) : card([emptyState('silo', 'Sin movimientos', 'Registrá una entrada para empezar.')])),
      h('div', { class: 'btn-col' }, button({ label: 'Editar silo', ic: 'edit', tone: 'ghost', block: true, onClick: () => F.siloForm(book, s) }))),
  };
}

// ---------------------------------------------------------------- PRODUCCIÓN
const pst = { camp: '', q: '' };
function prodList({ go, book }) {
  const camps = sortEs(unique(book.prod.map((p) => p['Campaña']).filter(Boolean))).reverse();
  const rows = () => [...book.prod].filter((p) => (!pst.camp || p['Campaña'] === pst.camp) && (!pst.q || norm([p['Cultivo'], p['Campo / cliente'], p['Lote / condición']].join(' ')).includes(norm(pst.q)))).sort((a, b) => (b['Fecha inicio cosecha'] || '').localeCompare(a['Fecha inicio cosecha'] || ''));
  const listEl = h('div', { class: 'list' });
  const draw = () => { const rs = rows(); listEl.replaceChildren(...(rs.length ? rs.map((p) => prodCard(p, book, () => go(`produccion/${encodeURIComponent(p['ID producción'])}`))) : [card([emptyState('seedling', 'Sin producciones', 'Creá una por cada lote cosechado.')])])); };
  draw();
  // resumen por cultivo del filtro actual
  const totals = {};
  for (const p of rows()) { const pv = R.prodView(p, book); const t = (totals[p['Cultivo']] ||= { kg: 0, ha: 0 }); t.kg += pv.kgFinal; t.ha += p['Ha cosechadas'] || 0; }
  return {
    node: h('div', { class: 'page' },
      detailHead({ title: 'Producción', sub: `${book.prod.length} ${book.prod.length === 1 ? 'registro' : 'registros'}`, ic: 'seedling', crop: '', onBack: () => go('mas') }),
      Object.keys(totals).length ? h('div', { class: 'totals' }, Object.entries(totals).map(([c, t]) => h('div', { class: `total crop-${R.cropColor(c)}` }, h('small', null, c), h('b', null, fmtKg(t.kg)), h('span', null, t.ha > 0 && t.kg > 0 ? `${fmt2(Math.round(t.kg / t.ha) / 100)} qq/ha` : '—')))) : null,
      searchBox(pst.q, (v) => { pst.q = v; draw(); }, 'Buscar cultivo, campo, lote…'),
      h('div', { class: 'filters' }, selectFilter('Campaña', camps, pst.camp, (v) => { pst.camp = v; store.emit(); })),
      listEl),
    fab: { label: 'Nueva producción', ic: 'plus', onClick: () => F.prodForm(book) },
  };
}
function prodDetail({ params, go, book }) {
  const p = book.prod.find((x) => x['ID producción'] === params[0]);
  const backTo = () => go('produccion');
  if (!p) return { node: h('div', { class: 'page' }, detailHead({ title: 'Producción', onBack: backTo }), card([emptyState('seedling', 'No encontré esa producción', '')])) };
  const pv = R.prodView(p, book);
  const lab = p['ID labor vinculada'] ? book.labores.find((l) => l['ID labor'] === p['ID labor vinculada']) : null;
  return {
    node: h('div', { class: 'page' },
      detailHead({ title: `${p['Cultivo']} · ${p['Campo / cliente']}`, sub: `${p['Lote / condición']} · ${p['Campaña']}`, ic: 'seedling', crop: p['Cultivo'], chips: [datoChip(p['Estado dato']), p._pending ? chip('Sin subir', 'warn', 'cloud') : null], onBack: backTo }),
      h('div', { class: 'stats three' }, statBox('Kg finales', fmtKg(pv.kgFinal)), statBox('Camiones', pv.camiones || '—'), statBox('Rinde', pv.rinde === null ? '—' : `${fmt2(pv.rinde)} qq/ha`)),
      h('div', { class: 'note note-info' }, icon('info', 18), h('span', null, pv.origen)),
      section('Control', card([kv('Kg cosechados (descargas)', fmtKg(pv.kgCos)), kv('Kg con ticket conciliado', fmtKg(pv.kgOk)), kv('Kg a revisar', pv.kgRev ? fmtKg(pv.kgRev) : ''), kv('Kg directo a silo', pv.kgSilo ? fmtKg(pv.kgSilo) : '')])),
      section('Datos de la producción', card([kv('Hectáreas cosechadas', isBlank(p['Ha cosechadas']) ? '' : fmtHa(p['Ha cosechadas'])), kv('Inicio', fmtDate(p['Fecha inicio cosecha'])), kv('Fin', fmtDate(p['Fecha fin cosecha'])), kv('Unidad', p['Unidad']), kv('Tipo / época', p['Tipo / época']), kv('Dato manual', isBlank(p['Producción kg']) ? '' : fmtKg(p['Producción kg'])), kv('Observaciones', p['Observaciones'])])),
      pv.movs.length ? section(`Descargas (${pv.movs.length})`, pv.movs.slice().sort((a, b) => (b['Fecha'] || '').localeCompare(a['Fecha'] || '')).map((m) => card([h('div', { class: 'row-top' }, h('span', { class: 'crop crop-silo' }, icon('unload', 22)), h('div', { class: 'grow' }, h('div', { class: 'title-line' }, h('b', { class: 'ct' }, m['Monotolva utilizada'] || m['Tipo de movimiento']), h('span', { class: 'lit' }, fmtKg(m['Kg asignados']))), h('div', { class: 'sub' }, `${fmtDateShort(m['Fecha'])} · ${m['Tipo de movimiento']}`)))], { onClick: m['ID carga'] ? () => go(`cosecha/${encodeURIComponent(m['ID carga'])}`) : null }))) : null,
      h('div', { class: 'btn-col' },
        lab ? button({ label: 'Ver la labor de cosecha', ic: 'tractor', tone: 'soft', block: true, onClick: () => go(`labores/${encodeURIComponent(lab['ID labor'])}`) }) : null,
        button({ label: 'Editar producción', ic: 'edit', tone: 'ghost', block: true, onClick: () => F.prodForm(book, p) }))),
  };
}

// ---------------------------------------------------------------- CAMPOS Y LOTES
const lst = { q: '', unidad: '' };
function lotesList({ go, book }) {
  const rows = () => [...book.lotes].filter((l) => (!lst.unidad || l['Unidad'] === lst.unidad) && (!lst.q || norm([l['Campo'], l['Lote físico'], l['Unidad']].join(' ')).includes(norm(lst.q)))).sort((a, b) => `${a['Campo']} ${a['Lote físico']}`.localeCompare(`${b['Campo']} ${b['Lote físico']}`, 'es'));
  const listEl = h('div', { class: 'list' });
  const draw = () => {
    const rs = rows();
    const total = rs.reduce((a, l) => a + (l['Ha físicas'] || 0), 0);
    listEl.replaceChildren(h('p', { class: 'muted small' }, `${rs.length} lotes · ${fmtHa(total)}`), ...rs.map((l) => card([h('div', { class: 'row-top' }, h('span', { class: 'crop crop-earth' }, icon('map', 22)), h('div', { class: 'grow' }, h('div', { class: 'title-line' }, h('b', { class: 'ct' }, l['Campo']), chip(l['Unidad'], 'info')), h('div', { class: 'sub' }, l['Lote físico'])), h('b', { class: 'big-num sm' }, fmtHa(l['Ha físicas'])))], { onClick: () => go(`lotes/${encodeURIComponent(l['ID lote'])}`) })));
  };
  draw();
  return {
    node: h('div', { class: 'page' },
      detailHead({ title: 'Campos y lotes', sub: `${book.lotes.length} lotes`, ic: 'map', crop: '', onBack: () => go('mas') }),
      searchBox(lst.q, (v) => { lst.q = v; draw(); }, 'Buscar campo o lote…'),
      h('div', { class: 'filters' }, selectFilter('Unidad', sortEs(unique(book.lotes.map((l) => l['Unidad']))), lst.unidad, (v) => { lst.unidad = v; store.emit(); })),
      listEl),
    fab: { label: 'Nuevo lote', ic: 'plus', onClick: () => F.loteForm(book) },
  };
}
function loteDetail({ params, go, book }) {
  const l = book.lotes.find((x) => x['ID lote'] === params[0]);
  const backTo = () => go('lotes');
  if (!l) return { node: h('div', { class: 'page' }, detailHead({ title: 'Lote', onBack: backTo }), card([emptyState('map', 'No encontré ese lote', '')])) };
  const labs = R.recientes(book).filter((x) => x['ID lote vinculado'] === l['ID lote']).slice(0, 8);
  return {
    node: h('div', { class: 'page' },
      detailHead({ title: l['Campo'], sub: l['Lote físico'], ic: 'map', crop: '', chips: [chip(l['Unidad'], 'info'), datoChip(l['Estado dato'])], onBack: backTo }),
      section('Identificación', card([kv('Hectáreas físicas', fmtHa(l['Ha físicas']), { strong: true }), kv('Responsable', l['Responsable']), kv('Tenencia', l['Tenencia'])])),
      ['CA-SH', 'CA-DA'].includes(l['Unidad']) ? section('Arrendamiento', card([kv('Tipo de alquiler', l['Tipo de alquiler']), kv('Valor', isBlank(l['Valor alquiler']) ? '' : fmt2(l['Valor alquiler'])), kv('Referencia', l['Referencia'])])) : null,
      l['Observaciones'] ? section('Observaciones', card([h('p', { class: 'prose' }, l['Observaciones'])])) : null,
      labs.length ? section('Últimas labores en este lote', labs.map((x) => laborCard(x, () => go(`labores/${encodeURIComponent(x['ID labor'])}`)))) : null,
      h('div', { class: 'btn-col' }, button({ label: 'Editar lote', ic: 'edit', tone: 'ghost', block: true, onClick: () => F.loteForm(book, l) }))),
  };
}

// ---------------------------------------------------------------- EQUIPOS
const est = { q: '' };
function equiposList({ go, book }) {
  const rows = () => book.activos.filter((a) => !est.q || norm([a['Nombre corto'], a['Categoría'], a['Marca / modelo']].join(' ')).includes(norm(est.q)));
  const listEl = h('div', { class: 'list' });
  const draw = () => {
    const rs = rows();
    const groups = {};
    for (const a of rs) (groups[a['Categoría'] || 'Otros'] ||= []).push(a);
    listEl.replaceChildren(...Object.keys(groups).sort((a, b) => a.localeCompare(b, 'es')).flatMap((cat) => [h('h3', { class: 'group-title' }, cat), ...groups[cat].map((a) => card([h('div', { class: 'row-top' }, h('span', { class: 'crop crop-blue' }, icon(a['Categoría'] === 'Tanque de combustible' ? 'fuel' : a['Categoría'] === 'Vehículo' ? 'truck' : 'tractor', 22)), h('div', { class: 'grow' }, h('div', { class: 'title-line' }, h('b', { class: 'ct' }, a['Nombre corto']), datoChip(a['Estado dato'])), h('div', { class: 'sub' }, a['Marca / modelo'] || a['Uso principal'] || '')), !isBlank(a['Horómetro']) ? h('b', { class: 'big-num sm' }, `${fmt0(a['Horómetro'])} hs`) : null)], { onClick: () => go(`equipos/${encodeURIComponent(a['ID activo'])}`) }))]));
  };
  draw();
  return { node: h('div', { class: 'page' }, detailHead({ title: 'Equipos', sub: `${book.activos.length} equipos`, ic: 'tractor', crop: '', onBack: () => go('mas') }), searchBox(est.q, (v) => { est.q = v; draw(); }, 'Buscar equipo…'), listEl) };
}
function equipoDetail({ params, go, book }) {
  const a = book.activos.find((x) => x['ID activo'] === params[0]);
  const backTo = () => go('equipos');
  if (!a) return { node: h('div', { class: 'page' }, detailHead({ title: 'Equipo', onBack: backTo }), card([emptyState('tractor', 'No encontré ese equipo', '')])) };
  const labs = R.recientes(book).filter((x) => [x['Máquina principal'], x['Implemento / equipo']].includes(a['Nombre corto'])).slice(0, 6);
  return {
    node: h('div', { class: 'page' },
      detailHead({ title: a['Nombre corto'], sub: `${a['Categoría']}${a['Marca / modelo'] ? ' · ' + a['Marca / modelo'] : ''}`, ic: 'tractor', crop: '', chips: [datoChip(a['Estado dato'])], onBack: backTo }),
      section('Datos', card([kv('Horómetro', isBlank(a['Horómetro']) ? '' : `${fmt0(a['Horómetro'])} hs${a['Tipo de horas'] ? ' (' + a['Tipo de horas'] + ')' : ''}`, { strong: true }), kv('Año', a['Año']), kv('Capacidad', isBlank(a['Capacidad']) ? '' : `${fmt0(a['Capacidad'])} ${a['Unidad capacidad'] || ''}`), kv('Propiedad', a['Propiedad']), kv('Responsable habitual', a['Responsable habitual']), kv('Uso principal', a['Uso principal']), kv('Equipo asociado', a['Activo asociado']), kv('Seguro', a['Seguro'])])),
      a['Observaciones'] ? section('Observaciones', card([h('p', { class: 'prose' }, a['Observaciones'])])) : null,
      labs.length ? section('Últimas labores', labs.map((x) => laborCard(x, () => go(`labores/${encodeURIComponent(x['ID labor'])}`)))) : null,
      h('div', { class: 'btn-col' }, button({ label: 'Editar datos', ic: 'edit', tone: 'ghost', block: true, onClick: () => F.activoForm(book, a) }))),
  };
}
