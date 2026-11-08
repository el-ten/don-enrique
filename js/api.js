// Comunicación con la planilla: por Apps Script (modo real) o con el simulador interno (modo demo).
import { createMock, demoSeed } from './mock.js';
import { store } from './store.js';
import { toWire } from './model.js';

export class NetworkError extends Error {}
export class ServerError extends Error { constructor(msg, code) { super(msg); this.code = code; } }

let demo = null;
async function demoServer() {
  if (!demo) {
    const saved = await store.getKV('mock:demo');
    demo = createMock(saved || demoSeed());
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
    if (body.action === 'write') await store.setKV('mock:demo', m.state);
    await wait(120);
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
    throw new NetworkError(e && e.name === 'AbortError' ? 'Tardó demasiado en responder' : 'Sin conexión');
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
  else { o.key = op.key; o.set = toWire(op.tk, op.set); }
  return o;
}

export const api = {
  ping: (override) => call({ action: 'ping' }, 12000, override),
  read: () => call({ action: 'read' }, 40000),
  write: (ops) => call({ action: 'write', ops: ops.map(toWireOp) }, 45000),
};
