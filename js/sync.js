// Sincronización: sube la cola de cambios y baja la última copia de la planilla.
import { store } from './store.js';
import { api, NetworkError } from './api.js';
import { normalizeRead } from './model.js';

let running = null;
let timer = null;

export function isSyncing() { return !!running; }

export function sync({ pull = true } = {}) {
  if (!store.config.mode) return Promise.resolve({ ok: false, skipped: 'sin configurar' });
  if (running) return running;
  running = (async () => {
    store.sync.state = 'syncing'; store.sync.error = null; store.emit();
    try {
      // 1) subir cambios
      const ops = store.ops.filter((o) => !o.failed);
      if (ops.length) {
        const res = await api.write(ops);
        const okIds = [];
        for (const r of res.results || []) {
          if (r.ok) okIds.push(r.id);
          else await store.markFailed(r.id, r.error || 'Error');
        }
        await store.removeOps(okIds);
      }
      // 2) bajar la planilla
      if (pull) {
        const raw = await api.read();
        const norm = normalizeRead(raw);
        await store.saveSnapshot({ at: new Date().toISOString(), tables: norm.tables, cfg: norm.cfg, serverTime: norm.serverTime });
      }
      store.sync.state = 'idle'; store.sync.offline = false; store.online = true;
      store.rebuild();
      return { ok: true };
    } catch (e) {
      store.sync.state = 'error';
      store.sync.error = e instanceof NetworkError ? 'Sin conexión: los cambios quedan guardados en el celular.' : String(e.message || e);
      store.sync.offline = e instanceof NetworkError;
      if (e instanceof NetworkError) store.online = false;
      store.emit();
      return { ok: false, error: store.sync.error, offline: e instanceof NetworkError };
    } finally {
      running = null;
    }
  })();
  return running;
}

// Pide una sincronización en breve (junta varios cambios seguidos).
// No se confía en navigator.onLine (en el iPhone miente a veces): se intenta y, si falla, queda "sin señal".
export function syncSoon(ms = 600) {
  clearTimeout(timer);
  timer = setTimeout(() => { sync(); }, ms);
}

export function startAutoSync() {
  store.afterEnqueue = () => syncSoon();
  window.addEventListener('online', () => { store.online = true; store.emit(); sync(); });
  window.addEventListener('offline', () => { store.online = false; store.emit(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(); });
  window.addEventListener('pageshow', () => { sync(); });
  // Reintento: cada 20 s si hay cambios esperando, cada 90 s si no.
  let last = 0;
  setInterval(() => {
    if (document.visibilityState !== 'visible' || running) return;
    const wait = store.pending() > 0 ? 20000 : 90000;
    if (Date.now() - last >= wait - 500) { last = Date.now(); sync(); }
  }, 5000);
}
