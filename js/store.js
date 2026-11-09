// Base local (IndexedDB): configuración, última copia de la planilla y cola de cambios pendientes.
import { buildBook } from './model.js';
import { uid8 } from './util.js';

let db = null;
const mem = { kv: new Map(), outbox: new Map() }; // respaldo si IndexedDB no está disponible

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('sin IndexedDB'));
    const r = indexedDB.open('de-main', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      if (!d.objectStoreNames.contains('outbox')) d.createObjectStore('outbox', { keyPath: 'id' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
const tx = (store, mode, fn) => new Promise((resolve, reject) => {
  if (!db) return resolve(fn(null));
  const t = db.transaction(store, mode);
  const s = t.objectStore(store);
  let out;
  try { out = fn(s); } catch (e) { return reject(e); }
  t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
  t.onerror = () => reject(t.error);
  t.onabort = () => reject(t.error);
});

async function kvGet(k) {
  if (!db) return mem.kv.get(k);
  return new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
}
async function kvSet(k, v) {
  if (!db) { mem.kv.set(k, v); return; }
  await tx('kv', 'readwrite', (s) => s.put(v, k));
}
async function outboxAll() {
  if (!db) return [...mem.outbox.values()];
  return new Promise((res, rej) => { const q = db.transaction('outbox').objectStore('outbox').getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
}
async function outboxPut(op) {
  if (!db) { mem.outbox.set(op.id, op); return; }
  await tx('outbox', 'readwrite', (s) => s.put(op));
}
async function outboxDelete(id) {
  if (!db) { mem.outbox.delete(id); return; }
  await tx('outbox', 'readwrite', (s) => s.delete(id));
}

let seq = 0;

export const store = {
  config: { mode: null, url: '', token: '' }, // mode: null | 'demo' | 'live'
  snapshot: null,          // { at, tables, cfg, serverTime }
  ops: [],                 // cola de cambios (de la modalidad actual)
  book: buildBook(null, []),
  online: typeof navigator === 'undefined' || navigator.onLine !== false,
  sync: { state: 'idle', lastSync: null, error: null, offline: false }, // idle | syncing | error
  listeners: new Set(),
  persistent: false,

  async init() {
    try { db = await openDB(); this.persistent = true; } catch { db = null; }
    const cfg = await kvGet('config');
    if (cfg) this.config = { ...this.config, ...cfg };
    await this.loadMode();
    this.rebuild();
  },

  async loadMode() {
    const m = this.config.mode;
    this.snapshot = m ? (await kvGet(`snap:${m}`)) || null : null;
    this.ops = m ? (await outboxAll()).filter((o) => o.mode === m).sort((a, b) => a.seq - b.seq) : [];
    seq = this.ops.reduce((x, o) => Math.max(x, o.seq), 0);
    const meta = m ? await kvGet(`meta:${m}`) : null;
    this.sync.lastSync = meta ? meta.lastSync : null;
  },

  async setConfig(patch) {
    const modeChanged = patch.mode !== undefined && patch.mode !== this.config.mode;
    this.config = { ...this.config, ...patch };
    await kvSet('config', this.config);
    if (modeChanged) await this.loadMode();
    this.rebuild();
  },

  async saveSnapshot(snap) {
    this.snapshot = snap;
    if (this.config.mode) await kvSet(`snap:${this.config.mode}`, snap);
    this.sync.lastSync = new Date().toISOString();
    if (this.config.mode) await kvSet(`meta:${this.config.mode}`, { lastSync: this.sync.lastSync });
    this.rebuild();
  },

  // La planilla se consultó y no cambió nada: solo se anota la hora, sin redibujar la pantalla.
  async touchSync() {
    this.sync.lastSync = new Date().toISOString();
    if (this.config.mode) await kvSet(`meta:${this.config.mode}`, { lastSync: this.sync.lastSync });
  },

  rebuild() {
    this.book = buildBook(this.snapshot, this.ops.filter((o) => !o.failed));
    this.emit();
  },

  // Agrega cambios a la cola (con id propio para que el servidor no los duplique).
  async enqueue(specs) {
    const mode = this.config.mode;
    for (const s of specs) {
      const op = { id: `${Date.now().toString(36)}-${uid8()}`, seq: ++seq, mode, ts: new Date().toISOString(), ...s };
      this.ops.push(op);
      await outboxPut(op);
    }
    this.rebuild();
    if (this.afterEnqueue) this.afterEnqueue();
  },

  async removeOps(ids) {
    const set = new Set(ids);
    this.ops = this.ops.filter((o) => !set.has(o.id));
    for (const id of ids) await outboxDelete(id);
  },
  async markFailed(id, error) {
    const op = this.ops.find((o) => o.id === id);
    if (!op) return;
    op.failed = true; op.error = error;
    await outboxPut(op);
  },
  async retryFailed() {
    for (const op of this.ops) if (op.failed) { op.failed = false; op.error = ''; await outboxPut(op); }
    this.rebuild();
  },
  async discard(id) {
    await this.removeOps([id]);
    this.rebuild();
  },

  pending() { return this.ops.filter((o) => !o.failed).length; },
  failed() { return this.ops.filter((o) => o.failed); },

  async getKV(k) { return kvGet(k); },
  async setKV(k, v) { return kvSet(k, v); },

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  emit() { for (const fn of this.listeners) { try { fn(); } catch (e) { console.error(e); } } },
};
