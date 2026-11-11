// Comunicación con la planilla: por Apps Script (modo real) o con el simulador interno (modo demo).
import { createMock, demoSeed } from './mock.js';
import { store } from './store.js';
import { toWire, cleanLegacySet } from './model.js';

export class NetworkError extends Error {}
export class ServerError extends Error { constructor(msg, code) { super(msg); this.code = code; } }

let demo = null;
async function demoServer() {
  if (!demo) {
    const saved = await store.getKV('mock:demo');
    demo = createMock(saved || demoSeed({ servicios: true, facturas: true }));
  }
  return demo;
}
export function resetDemo() { demo = null; }

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(body, timeoutMs = 25000, override = null) {
  const cfg = override ? { mode: 'live', ...override } : store.config;
  if (cfg.mode === 'demo') {
    const m = await demoServer();
    const out = m.handle(JSON.parse(JSON.stringify(body)));
    if (body.action === 'write' || body.action === 'upload') await store.setKV('mock:demo', m.state);
    await wait(120);
    if (out && out.ok === false) throw new ServerError(out.error || 'Error del servidor', out.code || 'server'); // igual que con la planilla real
    return out;
  }
  if (!cfg.url) throw new ServerError('Falta la dirección de conexión', 'config');
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...body, token: cfg.token }),
      redirect: 'follow',
      cache: 'no-store',
      signal: ctl.signal,
    });
  } catch (e) {
    const err = new NetworkError(e && e.name === 'AbortError' ? 'Tardó demasiado en responder' : 'Sin conexión');
    err.timeout = !!(e && e.name === 'AbortError'); // si fue por demora (y no porque el pedido falló enseguida) no conviene reintentar
    throw err;
  } finally { clearTimeout(t); }
  if (!res.ok) throw new ServerError(`El servidor respondió ${res.status}`, 'http');
  const txt = await res.text();
  let json;
  try { json = JSON.parse(txt); } catch { throw new ServerError('La respuesta no es válida: revisá la dirección de conexión', 'parse'); }
  if (json && json.ok === false) throw new ServerError(json.error || 'Error del servidor', json.code || 'server');
  return json;
}

export function toWireOp(op) {
  const o = { id: op.id, t: op.t, tk: op.tk };
  if (op.t === 'append') o.rec = toWire(op.tk, op.rec);
  else { o.key = op.key; o.set = toWire(op.tk, cleanLegacySet(op.set)); }
  return o;
}

// base64 de un ArrayBuffer (por tramos, para no reventar la pila con archivos grandes)
export function bufToBase64(buf) {
  const u8 = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
export function base64ToBuf(b64) {
  const s = atob(b64);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8.buffer;
}

export const api = {
  ping: (override) => call({ action: 'ping' }, 12000, override),
  read: () => call({ action: 'read' }, 40000),
  write: (ops) => call({ action: 'write', ops: ops.map(toWireOp) }, 45000),
  // Los archivos de las facturas van aparte de los cambios de la planilla: pesan más y no tienen que frenar a los demás.
  upload: (f) => call({ action: 'upload', docId: f.docId, name: f.name, mime: f.mime, replace: !!f.replace, data: bufToBase64(f.buf) }, 120000),
  getFile: async (docId) => {
    const r = await call({ action: 'getfile', docId }, 120000);
    return { name: r.name, mime: r.mime, buf: base64ToBuf(r.data) };
  },
};
