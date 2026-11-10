// Servicios a terceros: resumen de la campaña, lista y detalle con su tarifa (hoja 09_SERVICIOS).
import { store } from '../store.js';
import { h, section, kv, emptyState, button, chip, seg } from '../ui.js';
import { icon } from '../icons.js';
import * as R from '../rules.js';
import * as F from '../forms.js';
import { card, searchBox, detailHead, estadoChip, datoChip, statBox, cropBadge, laborCard } from './shared.js';
import { fmtDate, fmtHa, fmt2, fmtKg, fmtUsd, relDay, norm, isBlank, unique, sortEs, splitList, campaignFor, todayStr } from '../util.js';
import { selectFilter } from './labores.js';

const st = { camp: undefined, q: '', seg: 'todos' }; // camp undefined = todavía no se eligió: se usa la campaña actual

export function render(ctx) {
  const { params, go, book } = ctx;
  return params[0] ? detail({ id: params[0], go, book }) : list({ go, book });
}

// ---- textos ----
export function tarifaTexto(s) {
  if (R.servicioSinTarifa(s)) return 'Sin tarifa';
  const k = fmt2(s['Tarifa']);
  if (s['Tipo tarifa'] === 'USD/ha') return `USD ${k} por ha`;
  if (s['Tipo tarifa'] === '% producción') return `${k} % de la producción`;
  if (s['Tipo tarifa'] === 'Importe fijo') return s['Moneda / cereal'] === 'USD' ? `Importe fijo · USD ${k}` : `Importe fijo · ${fmtKg(s['Tarifa'])} de ${String(s['Moneda / cereal'] || '').toLowerCase()}`;
  return s['Tipo tarifa'];
}
export function ingresoTexto(s) {
  const i = R.ingresoServicio(s);
  if (i.usd !== null) return fmtUsd(i.usd);
  if (i.kg !== null) return `${fmtKg(i.kg)}${i.cereal ? ' de ' + String(i.cereal).toLowerCase() : ''}`;
  return '';
}
const lugar = (s) => [s['Cliente'], s['Campo / lote']].filter(Boolean).join(' — ') || 'Sin cliente';

function servCard(s, onClick) {
  const sin = R.servicioSinTarifa(s);
  const ing = ingresoTexto(s);
  return card([
    h('div', { class: 'row-top' },
      cropBadge(s['Cultivo'], s['Tipo servicio'] === 'Cosecha' ? 'wheat' : 'tractor'),
      h('div', { class: 'grow' },
        h('div', { class: 'title-line' }, h('b', { class: 'ct' }, `${s['Tipo servicio'] || 'Servicio'}${s['Cultivo'] ? ' · ' + s['Cultivo'] : ''}`), h('span', { class: 'camp' }, s['Campaña'])),
        h('div', { class: 'sub' }, lugar(s)))),
    h('div', { class: 'meta' },
      h('span', null, icon('calendar', 15), relDay(s['Fecha fin'] || s['Fecha inicio'])),
      !isBlank(s['Ha del servicio']) ? h('span', null, icon('map', 15), fmtHa(s['Ha del servicio'])) : null,
      sin ? chip('Sin tarifa', 'warn') : h('span', null, icon('coin', 15), tarifaTexto(s)),
      ing ? h('span', { class: 'strong' }, ing) : null,
      datoChip(s['Estado dato']),
      s._pending ? chip('Sin subir', 'warn', 'cloud') : null),
  ], { onClick });
}

// ---- lista y resumen ----
function list({ go, book }) {
  const back = () => go('mas');
  if (!book.hasServ) {
    return { node: h('div', { class: 'page' }, detailHead({ title: 'Servicios', sub: 'Trabajos para terceros', ic: 'coin', crop: '', onBack: back }),
      card([emptyState('coin', 'Todavía no está conectada la hoja de servicios', 'Falta actualizar el script de Google. Cuando esté, acá vas a ver los servicios, las tarifas y el resumen.')])) };
  }
  const camps = sortEs(unique(book.serv.map((s) => s['Campaña']).filter(Boolean))).reverse();
  if (st.camp === undefined) { const hoy = campaignFor(todayStr()); st.camp = camps.includes(hoy) ? hoy : (camps[0] || ''); }
  const base = R.serviciosDe(book, st.camp);
  const res = R.serviciosResumen(base);
  const rows = () => base
    .filter((s) => (st.seg === 'sin' ? R.servicioSinTarifa(s) : st.seg === 'con' ? !R.servicioSinTarifa(s) : true))
    .filter((s) => !st.q || norm([s['Cliente'], s['Campo / lote'], s['Cultivo'], s['Tipo servicio'], s['ID servicio']].join(' ')).includes(norm(st.q)))
    .sort((a, b) => (b['Fecha fin'] || b['Fecha inicio'] || '').localeCompare(a['Fecha fin'] || a['Fecha inicio'] || ''));
  const listEl = h('div', { class: 'list' });
  const draw = () => {
    const rs = rows();
    listEl.replaceChildren(...(rs.length
      ? rs.slice(0, 200).map((s) => servCard(s, () => go(`servicios/${encodeURIComponent(s['ID servicio'])}`)))
      : [card([emptyState('coin', st.seg === 'sin' ? 'No hay servicios sin tarifa' : 'Sin servicios', st.seg === 'sin' ? 'Todos los servicios de esta campaña tienen tarifa.' : 'Los servicios se cargan solos al terminar una labor de servicio.')])]));
  };
  draw();
  const cereales = Object.entries(res.cereal).sort((a, b) => b[1] - a[1]);
  return {
    node: h('div', { class: 'page' },
      detailHead({ title: 'Servicios', sub: `${st.camp ? 'Campaña ' + st.camp : 'Todas las campañas'} · ${res.n} ${res.n === 1 ? 'servicio' : 'servicios'}`, ic: 'coin', crop: '', onBack: back }),
      h('div', { class: 'totals' },
        h('div', { class: 'total crop-earth' }, h('small', null, 'Hectáreas'), h('b', null, fmtHa(res.ha)), h('span', null, `${res.n} ${res.n === 1 ? 'servicio' : 'servicios'}`)),
        h('div', { class: 'total crop-silo' }, h('small', null, 'Valorizado en USD'), h('b', null, fmtUsd(res.usd)), h('span', null, 'tarifa en dólares')),
        h('div', { class: 'total crop-soja' }, h('small', null, 'Valorizado en cereal'),
          cereales.length ? cereales.map(([c, kg]) => h('b', null, `${fmtKg(kg)} ${c.toLowerCase()}`)) : h('b', null, '—'), h('span', null, 'en kilos, por especie')),
        h('div', { class: `total ${res.sinTarifa ? 'crop-warn' : 'crop-blue'}` }, h('small', null, 'Sin tarifa'), h('b', null, String(res.sinTarifa)), h('span', null, res.sinTarifa ? 'falta cargarla' : 'todo valorizado'))),
      seg([{ value: 'todos', label: 'Todos', count: base.length }, { value: 'sin', label: 'Sin tarifa', count: res.sinTarifa }, { value: 'con', label: 'Con tarifa', count: res.conTarifa }], st.seg, (v) => { st.seg = v; store.emit(); }),
      searchBox(st.q, (v) => { st.q = v; draw(); }, 'Buscar cliente, lote, cultivo…'),
      h('div', { class: 'filters' }, selectFilter('Campaña', camps, st.camp, (v) => { st.camp = v; store.emit(); })),
      listEl),
  };
}

// ---- detalle ----
function detail({ id, go, book }) {
  const back = () => go('servicios');
  const s = (book.serv || []).find((x) => x['ID servicio'] === id);
  if (!s) return { node: h('div', { class: 'page' }, detailHead({ title: 'Servicio', onBack: back }), card([emptyState('coin', 'No encontré ese servicio', 'Puede que todavía no se haya sincronizado.')])) };
  const sin = R.servicioSinTarifa(s);
  const i = R.ingresoServicio(s);
  const ing = ingresoTexto(s);
  const labs = splitList(s['ID labor vinculada']).map((x) => book.labores.find((l) => l['ID labor'] === x)).filter(Boolean);
  const prods = R.produccionesDeServicio(book, s);
  const cobros = book.hasFact ? R.cobrosDeServicio(book, s['ID servicio']) : null;
  const cc = cobros ? R.cobrosConfirmados(cobros) : null;
  const editar = () => F.servicioForm(book, s);
  return {
    node: h('div', { class: 'page' },
      detailHead({ title: `${s['Tipo servicio'] || 'Servicio'} · ${s['Cliente'] || 'Sin cliente'}`, sub: `${[s['Campo / lote'], s['Cultivo']].filter(Boolean).join(' · ') || '—'} · ${s['Campaña']}`, ic: s['Tipo servicio'] === 'Cosecha' ? 'wheat' : 'tractor', crop: s['Cultivo'], chips: [estadoChip(s['Estado servicio']), datoChip(s['Estado dato']), s._pending ? chip('Sin subir', 'warn', 'cloud') : null], onBack: back }),
      h('div', { class: 'stats three' }, statBox('Hectáreas', isBlank(s['Ha del servicio']) ? '—' : fmtHa(s['Ha del servicio'])), statBox('Tarifa', sin ? 'Sin definir' : tarifaTexto(s), sin ? 'warn' : ''), statBox('Ingreso', ing || '—')),
      sin ? h('div', { class: 'note note-warn' }, icon('alert', 18), h('span', null, 'Falta cargar la tarifa de este servicio.')) : (!ing ? h('div', { class: 'note note-warn' }, icon('alert', 18), h('span', null, s['Tipo tarifa'] === '% producción' ? 'Falta la producción para calcular los kilos que corresponden.' : 'Falta un dato para calcular el ingreso.')) : null),
      h('div', { class: 'btn-col' }, button({ label: sin ? 'Cargar tarifa' : 'Editar tarifa', ic: sin ? 'coin' : 'edit', tone: sin ? 'primary' : 'soft', size: sin ? 'lg' : 'md', block: true, onClick: editar })),
      section('Tarifa', card([
        kv('Cómo se cobra', sin ? 'Sin definir' : s['Tipo tarifa']),
        kv('Tarifa', sin ? '' : tarifaTexto(s)),
        kv('Se cobra en', s['Moneda / cereal']),
        kv('Producción base', isBlank(s['Producción base kg']) ? '' : fmtKg(s['Producción base kg'])),
        kv('Ingreso', ing, { strong: true }),
        kv('Quién factura', s['Entidad comercial informada']),
      ])),
      cobros ? section('Cobros registrados', cobros.length ? [
        card([kv('Cobrado y confirmado', cc.n ? [cc.usd ? fmtUsd(cc.usd) : '', cc.kg ? fmtKg(cc.kg) : ''].filter(Boolean).join(' · ') || 'Sin importe cargado' : 'Nada confirmado todavía', { strong: true })]),
        ...cobros.map((f) => card([h('div', { class: 'row-top' }, h('span', { class: 'crop crop-silo' }, icon('coin', 22)), h('div', { class: 'grow' },
          h('div', { class: 'title-line' }, h('b', { class: 'ct' }, f['Tipo movimiento'] || 'Movimiento'), estadoChip(f['Estado movimiento'] === 'Confirmado' ? 'Confirmado' : f['Estado movimiento'])),
          h('div', { class: 'sub' }, [!isBlank(f['Importe imputado USD']) ? fmtUsd(f['Importe imputado USD']) : '', !isBlank(f['Cereal imputado kg']) ? fmtKg(f['Cereal imputado kg']) : '', f['Fecha'] ? fmtDate(f['Fecha']) : 'Sin fecha', f['Entidad que facturó / cobró'] ? 'Recibe: ' + f['Entidad que facturó / cobró'] : ''].filter(Boolean).join(' · ')))) ])),
      ] : card([h('p', { class: 'muted' }, 'Todavía no hay cobros cargados para este servicio.')])) : null,
      section('Datos del servicio', card([
        kv('Cliente', s['Cliente']), kv('Lote', s['Campo / lote']), kv('Cultivo', s['Cultivo']), kv('Tipo de servicio', s['Tipo servicio']),
        kv('Inicio', s['Fecha inicio'] ? fmtDate(s['Fecha inicio']) : ''), kv('Fin', s['Fecha fin'] ? fmtDate(s['Fecha fin']) : ''),
        kv('Producción', prods.length ? prods.map(R.prodName).join(' · ') : s['ID producción vinculada']),
        kv('Observaciones', s['Observaciones']),
      ])),
      labs.length ? section(labs.length === 1 ? 'Labor' : `Labores (${labs.length})`, labs.map((l) => laborCard(l, () => go(`labores/${encodeURIComponent(l['ID labor'])}`)))) : null),
  };
}
