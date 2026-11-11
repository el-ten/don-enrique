// Generador mínimo de PDF (sin librerías): texto con Helvetica, rectángulos, líneas y fotos JPEG.
// Lo usa el resumen de cada factura. Solo hace lo que ese resumen necesita.
import { isBlank } from './util.js';
import * as R from './rules.js';

// ---- texto: codificación WinAnsi y anchos de la Helvetica estándar (por 1000 unidades) ----
const W_REG = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const W_BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];
const WIN = { '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f };

function winAnsi(str) {
  let out = '';
  for (const ch of String(str ?? '')) {
    const c = ch.codePointAt(0);
    if (c >= 32 && c < 127) out += ch;
    else if (c >= 0xa0 && c < 256) out += String.fromCharCode(c);
    else if (WIN[ch]) out += String.fromCharCode(WIN[ch]);
    else if (c === 9 || c === 10) out += ' ';
    else out += '?';
  }
  return out;
}
const esc = (s) => s.replace(/[\\()]/g, (m) => '\\' + m);
function ancho(str, size, bold) {
  const t = bold ? W_BOLD : W_REG;
  let w = 0;
  for (const ch of String(str ?? '')) {
    const base = ch.normalize('NFD')[0];
    const c = base.charCodeAt(0);
    w += c >= 32 && c < 127 ? t[c - 32] : 556;
  }
  return (w * size) / 1000;
}
function partir(str, size, bold, maxW) {
  const out = [];
  for (const parrafo of String(str ?? '').split(/\r?\n/)) {
    let linea = '';
    for (const pal of parrafo.split(/\s+/).filter(Boolean)) {
      let p = pal;
      while (ancho(p, size, bold) > maxW) { // palabra más larga que la línea: se corta
        let n = p.length; while (n > 1 && ancho(p.slice(0, n), size, bold) > maxW) n--;
        if (linea) { out.push(linea); linea = ''; }
        out.push(p.slice(0, n)); p = p.slice(n);
      }
      const prueba = linea ? `${linea} ${p}` : p;
      if (ancho(prueba, size, bold) <= maxW) linea = prueba; else { out.push(linea); linea = p; }
    }
    out.push(linea);
  }
  while (out.length > 1 && out[out.length - 1] === '') out.pop();
  return out;
}

const n2 = (n) => String(Math.round(n * 100) / 100);
const bytesDe = (s) => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; };

// Tamaño en píxeles de un JPEG (lee el encabezado SOF).
export function jpegSize(u8) {
  let i = 2;
  while (i + 9 < u8.length) {
    if (u8[i] !== 0xff) { i++; continue; }
    const m = u8[i + 1];
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    const len = (u8[i + 2] << 8) | u8[i + 3];
    if ((m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf)) return { h: (u8[i + 5] << 8) | u8[i + 6], w: (u8[i + 7] << 8) | u8[i + 8], comps: u8[i + 9] };
    i += 2 + len;
  }
  throw new Error('JPEG inválido');
}

export function crearPdf({ titulo = '', autor = 'Don Enrique' } = {}) {
  const pages = [];
  const imgs = [];
  const api = {
    addImage(jpeg) {
      const u8 = new Uint8Array(jpeg);
      const { w, h, comps } = jpegSize(u8);
      imgs.push({ u8, w, h, comps });
      return { name: `Im${imgs.length}`, w, h };
    },
    addPage(w = 595.28, h = 841.89) {
      const ops = [];
      const usa = new Set();
      const col = (c, op) => `${c.map(n2).join(' ')} ${op}`;
      const p = {
        w, h, ops,
        ancho, partir,
        rect(x, y, rw, rh, { fill = null, stroke = null, lw = 0.6 } = {}) {
          if (fill) ops.push(`${col(fill, 'rg')} ${n2(x)} ${n2(y)} ${n2(rw)} ${n2(rh)} re f`);
          if (stroke) ops.push(`${col(stroke, 'RG')} ${n2(lw)} w ${n2(x)} ${n2(y)} ${n2(rw)} ${n2(rh)} re S`);
        },
        line(x1, y1, x2, y2, { color = [0.8, 0.8, 0.8], lw = 0.6 } = {}) { ops.push(`${col(color, 'RG')} ${n2(lw)} w ${n2(x1)} ${n2(y1)} m ${n2(x2)} ${n2(y2)} l S`); },
        text(x, y, str, { size = 10, bold = false, color = [0, 0, 0], align = 'left' } = {}) {
          const s = String(str ?? '');
          const wd = ancho(s, size, bold);
          const px = align === 'right' ? x - wd : align === 'center' ? x - wd / 2 : x;
          ops.push(`BT /${bold ? 'F2' : 'F1'} ${n2(size)} Tf ${col(color, 'rg')} ${n2(px)} ${n2(y)} Td (${esc(winAnsi(s))}) Tj ET`);
          return wd;
        },
        // escribe un texto en varias líneas; devuelve la y donde quedó la última
        parrafo(x, y, str, { size = 10, bold = false, color = [0, 0, 0], maxW = 300, lead = 1.35 } = {}) {
          const ls = partir(str, size, bold, maxW);
          ls.forEach((l, i) => p.text(x, y - i * size * lead, l, { size, bold, color }));
          return y - (ls.length - 1) * size * lead;
        },
        image(im, x, y, iw, ih) { usa.add(im.name); ops.push(`q ${n2(iw)} 0 0 ${n2(ih)} ${n2(x)} ${n2(y)} cm /${im.name} Do Q`); },
        usa,
      };
      pages.push(p);
      return p;
    },
    build() {
      const out = []; let len = 0; const offs = [];
      const push = (u) => { out.push(u); len += u.length; };
      const str = (s) => push(bytesDe(s));
      const obj = (n, ...partes) => { offs[n] = len; str(`${n} 0 obj\n`); partes.forEach((x) => (typeof x === 'string' ? str(x) : push(x))); str('\nendobj\n'); };
      const primeraImg = 5, primeraPag = primeraImg + imgs.length;
      const total = primeraPag + pages.length * 2;
      const hoy = new Date();
      const fecha = `D:${hoy.getFullYear()}${String(hoy.getMonth() + 1).padStart(2, '0')}${String(hoy.getDate()).padStart(2, '0')}${String(hoy.getHours()).padStart(2, '0')}${String(hoy.getMinutes()).padStart(2, '0')}00`;
      str('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
      obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
      obj(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${primeraPag + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`);
      obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
      obj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
      imgs.forEach((im, i) => obj(primeraImg + i, `<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace ${im.comps === 1 ? '/DeviceGray' : '/DeviceRGB'} /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.u8.length} >>\nstream\n`, im.u8, '\nendstream'));
      pages.forEach((p, i) => {
        const pn = primeraPag + i * 2, cn = pn + 1;
        const xo = [...p.usa].map((nm) => `/${nm} ${primeraImg + Number(nm.slice(2)) - 1} 0 R`).join(' ');
        obj(pn, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n2(p.w)} ${n2(p.h)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xo ? ` /XObject << ${xo} >>` : ''} >> /Contents ${cn} 0 R >>`);
        const cont = bytesDe(p.ops.join('\n'));
        obj(cn, `<< /Length ${cont.length} >>\nstream\n`, cont, '\nendstream');
      });
      const info = total;
      obj(info, `<< /Title (${esc(winAnsi(titulo))}) /Creator (${esc(winAnsi(autor))}) /Producer (${esc(winAnsi(autor))}) /CreationDate (${fecha}) >>`);
      const xref = len;
      str(`xref\n0 ${info + 1}\n0000000000 65535 f \n`);
      for (let n = 1; n <= info; n++) str(`${String(offs[n]).padStart(10, '0')} 00000 n \n`);
      str(`trailer\n<< /Size ${info + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
      const res = new Uint8Array(len); let o = 0;
      for (const u of out) { res.set(u, o); o += u.length; }
      return res;
    },
  };
  return api;
}

// ---- el resumen de una factura ----
const VERDE = [0.086, 0.341, 0.247], TINTA = [0.11, 0.16, 0.13], GRIS = [0.42, 0.46, 0.42], LINEA = [0.86, 0.83, 0.75], FONDO = [0.975, 0.955, 0.91];
const f2 = (s) => { if (!s) return ''; const [y, m, d] = String(s).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };

// d: fila de 19_DOCUMENTOS. imagen: { buf (JPEG) } para agregar la foto original en una segunda hoja. Devuelve Uint8Array (el PDF).
export function resumenFacturaPdf(d, { imagen = null, generado = new Date(), archivoNombre = '' } = {}) {
  const pdf = crearPdf({ titulo: `Resumen ${d['ID documento'] || ''}`.trim() });
  const p = pdf.addPage();
  const W = p.w, H = p.h, M = 42, CW = W - 2 * M;
  const emitida = d['Sentido'] === 'Emitida';
  const mon = R.docMoneda(d);

  p.rect(0, H - 92, W, 92, { fill: VERDE });
  p.text(M, H - 44, 'Resumen de comprobante', { size: 20, bold: true, color: [1, 1, 1] });
  p.text(M, H - 64, 'Don Enrique · Gestión de campo', { size: 10, color: [0.86, 0.92, 0.86] });
  p.text(W - M, H - 44, emitida ? 'FACTURA EMITIDA' : 'FACTURA RECIBIDA', { size: 11, bold: true, color: [1, 1, 1], align: 'right' });
  p.text(W - M, H - 64, d['ID documento'] || '', { size: 10, color: [0.86, 0.92, 0.86], align: 'right' });

  let y = H - 92 - 36;
  p.text(M, y, emitida ? 'CLIENTE' : 'PROVEEDOR', { size: 8, bold: true, color: GRIS });
  y -= 20;
  y = p.parrafo(M, y, R.docTitulo(d), { size: 18, bold: true, color: TINTA, maxW: CW, lead: 1.2 });
  if (!isBlank(d['CUIT contraparte'])) { y -= 16; p.text(M, y, `CUIT ${R.formatCuit(d['CUIT contraparte'])}`, { size: 10.5, color: GRIS }); }
  y -= 26;

  // datos del comprobante en una grilla de tres columnas
  const celdas = [
    ['Tipo', d['Tipo comprobante']], ['Número', R.comprobanteTexto(d)], ['Fecha', f2(d['Fecha'])],
    ['Vencimiento', f2(d['Vencimiento'])], ['Campaña', d['Campaña']], ['Moneda', mon === 'USD' ? `Dólares${d['Tipo de cambio'] ? ` (cambio ${d['Tipo de cambio']})` : ''}` : 'Pesos'],
  ];
  const cw = CW / 3;
  celdas.forEach(([lab, val], i) => {
    const cx = M + (i % 3) * cw, cy = y - Math.floor(i / 3) * 40;
    p.text(cx, cy, lab.toUpperCase(), { size: 7.5, bold: true, color: GRIS });
    p.text(cx, cy - 15, isBlank(val) ? '—' : String(val), { size: 11.5, bold: true, color: TINTA });
  });
  y -= 92;

  // importes
  const filas = [['Neto gravado', d['Neto gravado']], ['IVA', d['IVA']], ['Otros impuestos', d['Otros impuestos']]].filter(([, v]) => !isBlank(v) && Number(v) !== 0);
  const altoCaja = 30 + filas.length * 22 + 38;
  p.rect(M, y - altoCaja + 14, CW, altoCaja, { fill: FONDO, stroke: LINEA });
  let yy = y - 10;
  p.text(M + 14, yy, 'IMPORTES', { size: 8, bold: true, color: GRIS });
  yy -= 24;
  for (const [lab, v] of filas) { p.text(M + 14, yy, lab, { size: 11, color: TINTA }); p.text(W - M - 14, yy, R.fmtMonto(v, mon), { size: 11, color: TINTA, align: 'right' }); yy -= 22; }
  p.line(M + 14, yy + 14, W - M - 14, yy + 14, { color: LINEA });
  yy -= 6;
  p.text(M + 14, yy, R.docSigno(d) < 0 ? 'TOTAL (nota de crédito)' : 'TOTAL', { size: 13, bold: true, color: VERDE });
  p.text(W - M - 14, yy, R.fmtMonto(d['Total'], mon), { size: 16, bold: true, color: VERDE, align: 'right' });
  y = y - altoCaja + 14 - 30;

  // pago
  const pagado = R.docPagado(d);
  const estado = R.docEstadoTexto(d);
  p.text(M, y, 'ESTADO', { size: 8, bold: true, color: GRIS });
  y -= 17;
  const txtPago = pagado ? `${estado}${d['Fecha de pago'] ? ' el ' + f2(d['Fecha de pago']) : ''}` : `Pendiente${d['Vencimiento'] ? ' · vence el ' + f2(d['Vencimiento']) : ''}${R.docVencida(d) ? ' (vencida)' : ''}`;
  p.text(M, y, txtPago, { size: 12, bold: true, color: pagado ? VERDE : [0.72, 0.43, 0] });
  y -= 30;

  // otros datos
  const extra = [['Descripción', d['Descripción']], ['CAE', d['CAE']], ['Imputada a', d['Unidad imputada']], ['Servicio vinculado', d['ID servicio vinculado']], ['Observaciones', d['Observaciones']], ['Archivo original', archivoNombre || d['Archivo']]].filter(([, v]) => !isBlank(v));
  if (extra.length) {
    p.line(M, y + 12, W - M, y + 12, { color: LINEA });
    y -= 6;
    for (const [lab, v] of extra) {
      p.text(M, y, lab, { size: 9.5, color: GRIS });
      const fin = p.parrafo(M + 118, y, String(v), { size: 10.5, color: TINTA, maxW: CW - 118 });
      y = fin - 21;
    }
  }

  const pie = 'Este resumen es informativo: lo armó la app con los datos cargados. El comprobante válido es el original (factura electrónica de ARCA o el papel).';
  p.line(M, 66, W - M, 66, { color: LINEA });
  p.parrafo(M, 52, pie, { size: 8, color: GRIS, maxW: CW });
  const g = generado;
  p.text(M, 30, `Generado el ${String(g.getDate()).padStart(2, '0')}/${String(g.getMonth() + 1).padStart(2, '0')}/${g.getFullYear()} ${String(g.getHours()).padStart(2, '0')}:${String(g.getMinutes()).padStart(2, '0')}`, { size: 8, color: GRIS });

  if (imagen && imagen.buf) {
    const im = pdf.addImage(imagen.buf);
    const p2 = pdf.addPage();
    p2.rect(0, p2.h - 54, p2.w, 54, { fill: VERDE });
    p2.text(M, p2.h - 33, 'Comprobante original', { size: 14, bold: true, color: [1, 1, 1] });
    p2.text(p2.w - M, p2.h - 33, d['ID documento'] || '', { size: 10, color: [0.86, 0.92, 0.86], align: 'right' });
    const maxW = p2.w - 2 * M, maxH = p2.h - 54 - 2 * M;
    const k = Math.min(maxW / im.w, maxH / im.h);
    const iw = im.w * k, ih = im.h * k;
    p2.image(im, (p2.w - iw) / 2, p2.h - 54 - M - ih, iw, ih);
  }
  return pdf.build();
}
