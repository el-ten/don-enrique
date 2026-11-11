// Facturas emitidas y recibidas: resumen, lista con buscador y filtros, ficha con el archivo original y el resumen en PDF.
import { store } from '../store.js';
import { h, section, kv, emptyState, button, chip, seg, toast, openSheet } from '../ui.js';
import { icon } from '../icons.js';
import * as R from '../rules.js';
import * as F from '../forms.js';
import { card, searchBox, detailHead, datoChip, statBox } from './shared.js';
import { fmtDate, isBlank, unique, sortEs, todayStr } from '../util.js';
import { selectFilter } from './labores.js';
import { archivoDeDoc, entregarArchivo, abrirArchivo, elegirArchivo, tieneArchivo, ArchivoError } from '../files.js';
import { NetworkError } from '../api.js';
import { resumenFacturaPdf } from '../pdf.js';

const st = { camp: '', q: '', seg: 'todas', pago: '' };

export function render(ctx) {
  const { params, go, book } = ctx;
  if (params[0] === 'nueva') { setTimeout(() => cargarFactura(go), 0); return list({ go, book }); }
  return params[0] ? detail({ id: params[0], go, book }) : list({ go, book });
}

const m0 = (n, mon) => `${mon === 'USD' ? 'USD ' : '$ '}${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Math.round(n))}`;
const montos = (obj) => ['ARS', 'USD'].filter((m) => Math.abs(obj[m]) > 0.004).map((m) => m0(obj[m], m));
const nroTexto = (d) => [d['Tipo comprobante'], R.comprobanteTexto(d)].filter(Boolean).join(' ') || 'Sin número';

// mensaje claro para el error que sea
const msgError = (e, que = 'hacerlo') => {
  if (e instanceof NetworkError) return `Sin señal: ${que} necesita conexión porque el archivo todavía no está en este celular.`;
  return String((e && e.message) || e || 'No se pudo');
};

// ---- carga ----
// Primero se elige la foto o el PDF (o se sigue sin archivo) y después se completan los datos.
export function cargarFactura(go, { sentido = '' } = {}) {
  const onCreated = (id) => go(`facturas/${encodeURIComponent(id)}`);
  const live = () => store.book;
  const elegir = async (camara) => {
    try {
      const a = await elegirArchivo({ camara });
      if (!a) return;
      sh.close();
      F.facturaForm(live(), null, { archivo: a, sentido, onCreated });
    } catch (e) { toast(e instanceof ArchivoError ? e.message : msgError(e), 'warn', 5000); }
  };
  const sh = openSheet({
    title: 'Cargar factura',
    body: h('div', { class: 'btn-col' },
      h('p', { class: 'prose' }, 'Sacale una foto a la factura o elegí el PDF. Después completás los datos (todavía no se leen solos).'),
      button({ label: 'Sacar foto', ic: 'camera', tone: 'primary', size: 'lg', block: true, onClick: () => elegir(true) }),
      button({ label: 'Elegir foto o PDF', ic: 'file', tone: 'soft', size: 'lg', block: true, onClick: () => elegir(false) }),
      button({ label: 'Cargar sin archivo', ic: 'edit', tone: 'ghost', block: true, onClick: () => { sh.close(); F.facturaForm(live(), null, { sentido, onCreated }); } })),
  });
}

// ---- tarjeta ----
function docCard(d, onClick) {
  const emitida = d['Sentido'] === 'Emitida';
  const signo = R.docSigno(d);
  const venc = R.docVencida(d);
  return card([
    h('div', { class: 'row-top' },
      h('span', { class: `crop ${emitida ? 'crop-fuel-in' : 'crop-blue'}` }, icon('ticket', 22)),
      h('div', { class: 'grow' },
        h('div', { class: 'title-line' }, h('b', { class: 'ct' }, R.docTitulo(d)), h('span', { class: 'big-num sm' }, `${signo < 0 ? '−' : ''}${R.fmtMonto(d['Total'], R.docMoneda(d))}`)),
        h('div', { class: 'sub' }, `${nroTexto(d)}${d['Descripción'] ? ' · ' + d['Descripción'] : ''}`))),
    h('div', { class: 'meta' },
      h('span', null, icon('calendar', 15), d['Fecha'] ? fmtDate(d['Fecha']) : 'Sin fecha'),
      chip(emitida ? 'Emitida' : 'Recibida', emitida ? 'ok' : 'info'),
      R.docPagado(d) ? chip(R.docEstadoTexto(d), 'ok', 'check') : (venc ? chip('Vencida', 'err', 'alert') : chip('Pendiente', 'warn')),
      tieneArchivo(d) ? h('span', { class: 'muted' }, icon('file', 15)) : null,
      d._pending ? chip('Sin subir', 'warn', 'cloud') : null),
  ], { onClick });
}

// ---- lista y resumen ----
function list({ go, book }) {
  const back = () => go('mas');
  if (!book.hasDocs) {
    return { node: h('div', { class: 'page' }, detailHead({ title: 'Facturas', sub: 'Emitidas y recibidas', ic: 'ticket', crop: '', onBack: back }),
      card([emptyState('ticket', 'Todavía no está conectada la hoja de facturas', 'Falta actualizar el script de Google y crear la hoja 19_DOCUMENTOS. Cuando esté, acá vas a cargar y buscar tus facturas.')])) };
  }
  const camps = sortEs(unique(book.docs.map((d) => d['Campaña']).filter(Boolean))).reverse();
  if (st.camp && !camps.includes(st.camp)) st.camp = '';
  const delCamp = R.docsFiltrados(book, { camp: st.camp });
  const res = R.docsResumen(delCamp);
  const pendRec = delCamp.filter((d) => d['Sentido'] !== 'Emitida' && !R.docPagado(d)).length;
  const pendEmi = delCamp.filter((d) => d['Sentido'] === 'Emitida' && !R.docPagado(d)).length;
  const nRec = delCamp.filter((d) => d['Sentido'] !== 'Emitida').length, nEmi = delCamp.length - nRec;
  const rows = () => R.docsFiltrados(book, { camp: st.camp, sentido: st.seg === 'recibidas' ? 'Recibida' : st.seg === 'emitidas' ? 'Emitida' : '', pago: st.pago, q: st.q });
  const listEl = h('div', { class: 'list' });
  const draw = () => {
    const rs = rows();
    listEl.replaceChildren(...(rs.length
      ? rs.slice(0, 200).map((d) => docCard(d, () => go(`facturas/${encodeURIComponent(d['ID documento'])}`)))
      : [card([emptyState('ticket', book.docs.length ? 'No se encontraron facturas' : 'Todavía no cargaste facturas', book.docs.length ? 'Probá con otros filtros o con otra palabra.' : 'Tocá "Cargar factura" para sacar una foto o elegir un PDF.')])]));
  };
  draw();
  const caja = (cls, tit, obj, sub) => { const ms = montos(obj); return h('div', { class: `total ${cls}` }, h('small', null, tit), ms.length ? ms.map((t) => h('b', null, t)) : h('b', null, '—'), h('span', null, sub)); };
  const pl = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  const pagar = { ARS: res.ARS.pagar, USD: res.USD.pagar }, cobrar = { ARS: res.ARS.cobrar, USD: res.USD.cobrar };
  return {
    node: h('div', { class: 'page' },
      detailHead({ title: 'Facturas', sub: `${st.camp ? 'Campaña ' + st.camp : 'Todas las campañas'} · ${pl(delCamp.length, 'comprobante', 'comprobantes')}`, ic: 'ticket', crop: '', onBack: back }),
      h('div', { class: 'totals' },
        caja(pendRec ? 'crop-warn' : 'crop-blue', 'Para pagar', pagar, pendRec ? pl(pendRec, 'factura sin pagar', 'facturas sin pagar') : 'todo pagado'),
        caja(pendEmi ? 'crop-silo' : 'crop-blue', 'Para cobrar', cobrar, pendEmi ? pl(pendEmi, 'factura sin cobrar', 'facturas sin cobrar') : 'todo cobrado'),
        caja('crop-earth', 'Recibidas', { ARS: res.ARS.recibido, USD: res.USD.recibido }, pl(nRec, 'factura', 'facturas')),
        caja('crop-soja', 'Emitidas', { ARS: res.ARS.emitido, USD: res.USD.emitido }, pl(nEmi, 'factura', 'facturas'))),
      res.vencidas ? h('div', { class: 'note note-warn' }, icon('alert', 18), h('span', null, `${pl(res.vencidas, 'factura vencida', 'facturas vencidas')} sin pagar.`)) : null,
      seg([{ value: 'todas', label: 'Todas', count: delCamp.length }, { value: 'recibidas', label: 'Recibidas', count: nRec }, { value: 'emitidas', label: 'Emitidas', count: nEmi }], st.seg, (v) => { st.seg = v; store.emit(); }),
      searchBox(st.q, (v) => { st.q = v; draw(); }, 'Buscar proveedor, cliente, número…'),
      h('div', { class: 'filters fit' },
        selectFilter('Campaña', camps, st.camp, (v) => { st.camp = v; store.emit(); }),
        h('label', { class: 'filter' }, h('span', null, 'Estado'),
          h('select', { class: 'input select sm', onchange: (e) => { st.pago = e.target.value; e.target.blur(); store.emit(); } },
            [['', 'Todas'], ['pendientes', 'Pendientes'], ['pagadas', 'Pagadas / cobradas']].map(([v, l]) => h('option', { value: v, selected: v === st.pago }, l))))),
      listEl),
    fab: { label: 'Cargar factura', ic: 'plus', onClick: () => cargarFactura(go) },
  };
}

// ---- acciones sobre el archivo ----
// Copia en memoria del archivo de cada factura. En el iPhone, "compartir" y "abrir" solo funcionan si se llaman enseguida del toque,
// sin esperas en el medio: por eso el archivo se deja listo en memoria apenas se abre la ficha (si ya está en el celular).
const memo = new Map();
const delMemo = async (d) => {
  const id = d['ID documento'];
  if (memo.has(id)) return memo.get(id);
  const a = await archivoDeDoc(d);
  if (a) memo.set(id, a);
  return a;
};
function precargar(d) {
  if (memo.has(d['ID documento']) || !tieneArchivo(d)) return;
  store.getFile(d['ID documento']).then((f) => { if (f && f.buf && !memo.has(d['ID documento'])) memo.set(d['ID documento'], { name: f.name, mime: f.mime, buf: f.buf, size: f.size, w: f.w, h: f.h, local: true, subido: !!f.uploaded }); }).catch(() => {});
}
async function conCarga(ev, fn) {
  const b = ev && ev.currentTarget;
  if (b) b.classList.add('busy');
  try { await fn(); } finally { if (b) b.classList.remove('busy'); }
}

async function descargarOriginal(d) {
  try {
    const a = memo.get(d['ID documento']) || await delMemo(d);
    if (!a) { toast('Esta factura no tiene archivo', 'warn'); return; }
    const r = await entregarArchivo(a);
    if (r === 'tocar') toast('Listo. Tocá de nuevo para guardarlo.', 'info', 5000);
    else if (r === 'descargado') toast('Descargada');
  } catch (e) { toast(msgError(e, 'bajarla'), 'err', 5000); }
}

async function verFactura(d) {
  try {
    const a = memo.get(d['ID documento']) || await delMemo(d);
    if (!a) { toast('Esta factura no tiene archivo', 'warn'); return; }
    if (a.mime === 'application/pdf') {
      if (!abrirArchivo(a)) toast('Tocá de nuevo para abrirla.', 'info', 4000);
      return;
    }
    const url = URL.createObjectURL(new Blob([a.buf], { type: a.mime }));
    openSheet({
      title: R.docTitulo(d), full: true,
      body: h('div', { class: 'viewer' }, h('img', { src: url, alt: `Factura de ${R.docTitulo(d)}` })),
      footer: button({ label: 'Descargar factura original', ic: 'download', tone: 'primary', size: 'lg', block: true, onClick: () => descargarOriginal(d) }),
      onClose: () => URL.revokeObjectURL(url),
    });
  } catch (e) { toast(msgError(e, 'verla'), 'err', 5000); }
}

async function descargarResumen(d) {
  try {
    let a = null;
    try { a = memo.get(d['ID documento']) || await delMemo(d); } catch { a = null; } // sin señal ni copia local: el resumen sale igual, sin la foto
    const imagen = a && a.mime === 'image/jpeg' ? { buf: a.buf } : null;
    const bytes = resumenFacturaPdf(d, { imagen, archivoNombre: a ? a.name : '' });
    const name = R.nombreArchivoDoc(d, 'pdf').replace(/\.pdf$/, ' - resumen.pdf');
    const r = await entregarArchivo({ name, mime: 'application/pdf', buf: bytes.buffer });
    if (r === 'tocar') toast('Listo. Tocá de nuevo para guardarlo.', 'info', 5000);
    else if (r === 'descargado') toast('Resumen descargado');
  } catch (e) { toast(msgError(e), 'err', 5000); }
}

async function adjuntar(d, camara) {
  try {
    const a = await elegirArchivo({ camara });
    if (!a) return;
    const nombre = R.nombreArchivoDoc(d, a.mime === 'application/pdf' ? 'pdf' : 'jpg');
    memo.delete(d['ID documento']);
    await store.putFile({ docId: d['ID documento'], name: nombre, mime: a.mime, size: a.size, buf: a.buf, w: a.w, h: a.h, uploaded: false, replace: !isBlank(d['ID archivo']) });
    await store.enqueue([{ t: 'update', tk: 'docs', key: d['ID documento'], set: { 'Archivo': nombre } }]);
    toast('Archivo adjuntado');
  } catch (e) { toast(e instanceof ArchivoError ? e.message : msgError(e), 'warn', 5000); }
}

// ---- detalle ----
function detail({ id, go, book }) {
  const back = () => go('facturas');
  const d = (book.docs || []).find((x) => x['ID documento'] === id);
  if (!d) return { node: h('div', { class: 'page' }, detailHead({ title: 'Factura', onBack: back }), card([emptyState('ticket', 'No encontré esa factura', 'Puede que todavía no se haya sincronizado.')])) };
  precargar(d);
  const emitida = d['Sentido'] === 'Emitida';
  const mon = R.docMoneda(d);
  const signo = R.docSigno(d);
  const pagado = R.docPagado(d);
  const venc = R.docVencida(d);
  const conArchivo = tieneArchivo(d);
  const sinSubir = conArchivo && isBlank(d['ID archivo']); // el archivo está en el celular y todavía no llegó a Drive
  const serv = d['ID servicio vinculado'] ? (book.serv || []).find((x) => x['ID servicio'] === d['ID servicio vinculado']) : null;
  const ok = R.importesCierran({ neto: d['Neto gravado'], iva: d['IVA'], otros: d['Otros impuestos'], total: d['Total'] });
  const marcar = async () => {
    const set = { 'Estado de pago': 'Pagada', 'Fecha de pago': todayStr() };
    if (!isBlank(d['Vencimiento'])) set['Vencimiento'] = '';
    await store.enqueue([{ t: 'update', tk: 'docs', key: d['ID documento'], set }]);
    toast(emitida ? 'Marcada como cobrada' : 'Marcada como pagada');
  };
  return {
    node: h('div', { class: 'page' },
      detailHead({ title: R.docTitulo(d), sub: `${nroTexto(d)}${d['Fecha'] ? ' · ' + fmtDate(d['Fecha']) : ''}`, ic: 'ticket', crop: '', chips: [chip(emitida ? 'Emitida' : 'Recibida', emitida ? 'ok' : 'info'), pagado ? chip(R.docEstadoTexto(d), 'ok', 'check') : (venc ? chip('Vencida', 'err', 'alert') : chip('Pendiente', 'warn')), datoChip(d['Estado dato']), d._pending ? chip('Sin subir', 'warn', 'cloud') : null], onBack: back }),
      h('div', { class: 'stats money' }, statBox('Total', `${signo < 0 ? '−' : ''}${R.fmtMonto(d['Total'], mon)}`), statBox('Neto', isBlank(d['Neto gravado']) ? '—' : R.fmtMonto(d['Neto gravado'], mon)), statBox('IVA', isBlank(d['IVA']) ? '—' : R.fmtMonto(d['IVA'], mon))),
      ok === false ? h('div', { class: 'note note-warn' }, icon('alert', 18), h('span', null, 'Neto + IVA + otros impuestos no da el total. Conviene revisar los importes.')) : null,
      sinSubir && !store.sync.fileError ? h('div', { class: 'note note-info' }, icon('cloud', 18), h('span', null, 'El archivo está guardado en este celular y se sube a Drive en la próxima sincronización.')) : null,
      sinSubir && store.sync.fileError ? h('div', { class: 'note note-warn' }, icon('alert', 18), h('span', null, `No se pudo subir el archivo a Drive: ${store.sync.fileError}`)) : null,
      section('Descargas', h('div', { class: 'btn-col' },
        conArchivo
          ? button({ label: 'Descargar factura original', ic: 'download', tone: 'primary', size: 'lg', block: true, onClick: (ev) => conCarga(ev, () => descargarOriginal(d)) })
          : h('div', { class: 'note note-info' }, icon('info', 18), h('span', null, 'Esta factura no tiene foto ni PDF adjunto.')),
        button({ label: 'Descargar resumen (PDF)', ic: 'file', tone: 'soft', size: 'lg', block: true, onClick: (ev) => conCarga(ev, () => descargarResumen(d)) }),
        conArchivo ? button({ label: 'Ver factura', ic: 'eye', tone: 'ghost', block: true, onClick: (ev) => conCarga(ev, () => verFactura(d)) }) : null,
        !conArchivo ? h('div', { class: 'btn-row' }, button({ label: 'Sacar foto', ic: 'camera', tone: 'ghost', onClick: () => adjuntar(d, true) }), button({ label: 'Adjuntar foto o PDF', ic: 'file', tone: 'ghost', onClick: () => adjuntar(d, false) })) : null)),
      !pagado ? h('div', { class: 'btn-col' }, button({ label: emitida ? 'Marcar como cobrada' : 'Marcar como pagada', ic: 'checkcircle', tone: 'info', size: 'lg', block: true, onClick: marcar })) : null,
      section('Importes', card([
        kv('Neto gravado', isBlank(d['Neto gravado']) ? '' : R.fmtMonto(d['Neto gravado'], mon)),
        kv('IVA', isBlank(d['IVA']) ? '' : R.fmtMonto(d['IVA'], mon)),
        kv('Otros impuestos', isBlank(d['Otros impuestos']) || Number(d['Otros impuestos']) === 0 ? '' : R.fmtMonto(d['Otros impuestos'], mon)),
        kv(signo < 0 ? 'Total (nota de crédito)' : 'Total', R.fmtMonto(d['Total'], mon), { strong: true }),
        mon === 'USD' ? kv('Tipo de cambio', isBlank(d['Tipo de cambio']) ? '' : String(d['Tipo de cambio']).replace('.', ',')) : null,
      ])),
      section('Pago', card([
        kv('Estado', R.docEstadoTexto(d), { strong: true }),
        kv('Fecha de pago', d['Fecha de pago'] ? fmtDate(d['Fecha de pago']) : ''),
        kv('Vence el', !pagado && d['Vencimiento'] ? fmtDate(d['Vencimiento']) : ''),
      ])),
      section('Datos de la factura', card([
        kv(emitida ? 'Cliente' : 'Proveedor', d['Contraparte']), kv('CUIT', d['CUIT contraparte'] ? R.formatCuit(d['CUIT contraparte']) : ''),
        kv('Comprobante', nroTexto(d)), kv('Fecha', d['Fecha'] ? fmtDate(d['Fecha']) : ''), kv('Campaña', d['Campaña']),
        kv('Descripción', d['Descripción']), kv('CAE', d['CAE']), kv('Imputada a', d['Unidad imputada']),
        kv('Observaciones', d['Observaciones']), kv('Código', d['ID documento']),
      ])),
      serv ? section('Servicio vinculado', card([h('div', { class: 'row-top' }, h('span', { class: 'crop crop-silo' }, icon('coin', 22)), h('div', { class: 'grow' }, h('div', { class: 'title-line' }, h('b', { class: 'ct' }, `${serv['Tipo servicio'] || 'Servicio'} · ${serv['Cliente'] || 'Sin cliente'}`), h('span', { class: 'camp' }, serv['Campaña'])), h('div', { class: 'sub' }, serv['Campo / lote'] || serv['ID servicio'])))], { onClick: () => go(`servicios/${encodeURIComponent(serv['ID servicio'])}`) })) : null,
      h('div', { class: 'btn-col' }, button({ label: 'Editar factura', ic: 'edit', tone: 'ghost', block: true, onClick: () => F.facturaForm(book, d) }))),
  };
}
