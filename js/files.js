// Archivos de las facturas: preparar la foto o el PDF que elige la persona, y entregarlo (ver, compartir, descargar).
// No usa ninguna librería: la foto se achica con un <canvas> y el PDF se guarda tal cual.
import { api } from './api.js';
import { store } from './store.js';

export const MAX_PDF_BYTES = 8 * 1024 * 1024;
export const LADO_MAX = 2000;       // lado mayor de la foto, en píxeles (alcanza para leer letra chica de una factura)
export const CALIDAD_JPEG = 0.82;

const extDe = (name) => { const m = /\.([A-Za-z0-9]{2,5})$/.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; };
const sinExt = (name) => String(name || 'factura').replace(/\.[A-Za-z0-9]{2,5}$/, '');
export const mb = (bytes) => `${(bytes / 1048576).toFixed(1).replace('.', ',')} MB`;

export class ArchivoError extends Error {}

function esPdf(file, head) {
  return file.type === 'application/pdf' || extDe(file.name) === 'pdf' || (head && head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46);
}

async function decodificar(file) {
  if (typeof createImageBitmap === 'function') {
    try { const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); return { src: bmp, w: bmp.width, h: bmp.height, close: () => bmp.close && bmp.close() }; } catch { /* se prueba con <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('img')); i.src = url; });
    return { src: img, w: img.naturalWidth, h: img.naturalHeight, close: () => {} };
  } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
}

// File (de <input type="file">) → { kind:'image'|'pdf', name, mime, size, buf, w?, h? }. Lanza ArchivoError con un texto para mostrar.
export async function prepararArchivo(file) {
  if (!file) throw new ArchivoError('No se eligió ningún archivo');
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  if (esPdf(file, head)) {
    if (file.size > MAX_PDF_BYTES) throw new ArchivoError(`Ese PDF pesa ${mb(file.size)} y el máximo es ${mb(MAX_PDF_BYTES)}. Probá sacándole una foto a la factura.`);
    if (!(head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46)) throw new ArchivoError('Ese archivo no parece un PDF válido');
    return { kind: 'pdf', name: sinExt(file.name) + '.pdf', mime: 'application/pdf', size: file.size, buf: await file.arrayBuffer() };
  }
  if (!/^image\//.test(file.type) && !/^(jpe?g|png|heic|heif|webp)$/.test(extDe(file.name))) throw new ArchivoError('Solo se pueden cargar fotos o PDF');
  let dec;
  try { dec = await decodificar(file); } catch { throw new ArchivoError('No pude leer esa imagen. Probá con otra foto o con un PDF.'); }
  try {
    const esc = Math.min(1, LADO_MAX / Math.max(dec.w, dec.h));
    const w = Math.max(1, Math.round(dec.w * esc)), h = Math.max(1, Math.round(dec.h * esc));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); // los PNG con fondo transparente quedan sobre blanco
    ctx.drawImage(dec.src, 0, 0, w, h);
    const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', CALIDAD_JPEG));
    if (!blob) throw new Error('canvas');
    return { kind: 'image', name: sinExt(file.name) + '.jpg', mime: 'image/jpeg', size: blob.size, buf: await blob.arrayBuffer(), w, h };
  } catch { throw new ArchivoError('No pude preparar esa imagen. Probá con otra foto o con un PDF.'); }
  finally { dec.close(); }
}

// Abre el selector del sistema (cámara o archivos) y devuelve el archivo ya preparado (o null si se canceló).
export function elegirArchivo({ camara = false } = {}) {
  return new Promise((resolve, reject) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = camara ? 'image/*' : 'image/*,application/pdf';
    if (camara) inp.setAttribute('capture', 'environment');
    inp.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    let hecho = false;
    const fin = (fn) => { if (hecho) return; hecho = true; inp.remove(); fn(); };
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0];
      if (!f) return fin(() => resolve(null));
      try { const r = await prepararArchivo(f); fin(() => resolve(r)); } catch (e) { fin(() => reject(e)); }
    });
    inp.addEventListener('cancel', () => fin(() => resolve(null)));
    document.body.append(inp);
    inp.click();
  });
}

// ---- guardar / abrir ----
const esCelular = () => /iPad|iPhone|iPod|Android/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Entrega el archivo: en el celular abre la hoja de compartir del sistema (ahí se elige "Guardar en Archivos", WhatsApp, mail…);
// en la computadora lo descarga. Devuelve 'compartido' | 'descargado' | 'cancelado' | 'tocar' (el sistema pide volver a tocar el botón).
export async function entregarArchivo({ name, mime, buf }) {
  const blob = new Blob([buf], { type: mime });
  const file = new File([blob], name, { type: mime });
  if (esCelular() && navigator.canShare && navigator.share) {
    let puede = false;
    try { puede = navigator.canShare({ files: [file] }); } catch { puede = false; }
    if (puede) {
      try { await navigator.share({ files: [file], title: name }); return 'compartido'; } catch (e) {
        if (e && e.name === 'AbortError') return 'cancelado';
        if (e && e.name === 'NotAllowedError') return 'tocar'; // pasó mucho tiempo desde el toque: el archivo ya quedó en el celular, el segundo toque es inmediato
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return 'descargado';
}

// Abre el archivo para mirarlo (el PDF en una pestaña nueva del visor del sistema). Devuelve false si el navegador bloqueó la ventana.
export function abrirArchivo({ mime, buf }) {
  const url = URL.createObjectURL(new Blob([buf], { type: mime }));
  const w = window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 120000);
  return !!w;
}

// ---- el archivo de una factura: primero la copia guardada en el celular; si no está, se baja de Drive ----
export async function archivoDeDoc(doc) {
  const id = doc['ID documento'];
  const local = await store.getFile(id);
  if (local && local.buf) return { name: local.name, mime: local.mime, buf: local.buf, size: local.size, w: local.w, h: local.h, local: true, subido: !!local.uploaded };
  if (isBlankId(doc['ID archivo'])) return null;
  const r = await api.getFile(id); // lanza error si no hay señal o si el script no lo encuentra
  const rec = { docId: id, name: r.name || `${id}.pdf`, mime: r.mime, size: r.buf.byteLength, buf: r.buf, uploaded: true };
  await store.putFile(rec); // queda como copia para la próxima vez (y para verlo sin señal)
  return { ...rec, local: false, subido: true };
}
const isBlankId = (x) => x === undefined || x === null || String(x).trim() === '';
export const tieneArchivo = (doc) => !isBlankId(doc['ID archivo']) || !isBlankId(doc['Archivo']);
