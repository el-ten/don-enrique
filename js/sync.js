// Sincronización: sube la cola de cambios y baja la última copia de la planilla.
import { store } from './store.js';
import { api, NetworkError, ServerError } from './api.js';
import { normalizeRead, buildBook } from './model.js';
import { opsReconciliarProduccion } from './rules.js';

let running = null;
let timer = null;

const firma = (snap) => (snap ? JSON.stringify([snap.tables, snap.cfg, snap.avisos]) : '');
function sameData(a, b) { return !!a && firma(a) === firma(b); }

export function isSyncing() { return !!running; }

// Las producciones que creó la app muestran en la planilla los kilos de sus camiones: después de bajar la planilla se compara y, si
// no coinciden, se encola la corrección (se sube en la próxima sincronización). No es crítico: si algo falla, no frena nada.
async function copiarKilosDeProduccion() {
  try {
    if (!store.snapshot) return;
    const ops = opsReconciliarProduccion(buildBook(store.snapshot, []))
      .filter((o) => !store.ops.some((x) => x.tk === 'prod' && x.key === o.key));
    if (ops.length) await store.enqueue(ops);
  } catch { /* se reintenta en la próxima sincronización */ }
}

// Al abrir la app el iPhone a veces falla el primer pedido porque la conexión todavía no despertó, y un segundo después anda.
// Si el pedido falla enseguida y el teléfono no dice que está sin red, se reintenta solo un par de veces antes de mostrar "Sin señal".
// Si el teléfono avisa que no hay red, o si el pedido tardó demasiado, no se espera de más: se muestra "Sin señal" de una.
export const reintentos = { esperas: [1500, 4000] };
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
async function conReintentos(fn) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      const sinRed = typeof navigator !== 'undefined' && navigator.onLine === false;
      if (!(e instanceof NetworkError) || e.timeout || sinRed || i >= reintentos.esperas.length) throw e;
      await dormir(reintentos.esperas[i]);
    }
  }
}

// Sube a Drive los archivos pendientes. Un archivo espera a que su factura ya esté en la planilla. Si el servidor rechaza uno
// (por ejemplo, falta autorizar Drive en el script), no frena el resto de la sincronización: queda el aviso y se reintenta.
async function subirArchivos() {
  let pend = [];
  try { pend = await store.pendingFiles(); } catch { return; }
  if (!pend.length) { store.sync.fileError = null; return; }
  const esperando = new Set(store.ops.filter((o) => o.tk === 'docs' && o.t === 'append' && o.rec).map((o) => o.rec['ID documento']));
  let err = null;
  for (const f of pend) {
    if (esperando.has(f.docId)) continue;
    try {
      await api.upload(f);
      await store.markFileUploaded(f.docId);
    } catch (e) {
      if (e instanceof NetworkError) throw e;
      err = e instanceof ServerError ? e.message : String((e && e.message) || e);
    }
  }
  store.sync.fileError = err;
}

// quiet: sincronización automática de fondo. Si no hay nada para subir, no cambia el botón de arriba ni redibuja la pantalla
//        (solo se nota si la planilla trajo datos nuevos o si hay un problema).
// minAge: no repetir si ya se sincronizó hace menos de estos milisegundos y no hay nada pendiente.
export function sync({ pull = true, quiet = false, minAge = 0 } = {}) {
  if (!store.config.mode) return Promise.resolve({ ok: false, skipped: 'sin configurar' });
  if (running) return running;
  if (minAge && !store.pending() && store.sync.state === 'idle' && store.sync.lastSync && Date.now() - new Date(store.sync.lastSync).getTime() < minAge) return Promise.resolve({ ok: true, skipped: 'reciente' });
  running = (async () => {
    const silent = quiet && !store.pending() && store.sync.state === 'idle' && store.online;
    if (!silent) { store.sync.state = 'syncing'; store.sync.error = null; store.emit(); }
    try {
      await conReintentos(async () => {
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
        // 1b) subir los archivos de las facturas (foto o PDF) que ya tienen su fila en la planilla
        await subirArchivos();
        // 2) bajar la planilla
        if (pull) {
          const raw = await api.read();
          const norm = normalizeRead(raw);
          const snap = { at: new Date().toISOString(), tables: norm.tables, cfg: norm.cfg, serverTime: norm.serverTime, avisos: norm.avisos };
          if (silent && sameData(store.snapshot, snap)) await store.touchSync(); // sin novedades: no se redibuja nada
          else await store.saveSnapshot(snap);
        }
      });
      store.sync.state = 'idle'; store.sync.offline = false; store.online = true;
      if (!silent) store.rebuild();
      if (pull) await copiarKilosDeProduccion();
      return { ok: true };
    } catch (e) {
      // En segundo plano y sin nada pendiente, un fallo que no sea de señal no asusta con un cartel: se reintenta solo.
      if (silent && !(e instanceof NetworkError)) return { ok: false, error: String(e.message || e), silent: true };
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
  // Al volver a la app: se actualiza en silencio (y no se repite si se sincronizó hace menos de 1 minuto).
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync({ quiet: true, minAge: 60000 }); });
  window.addEventListener('pageshow', () => { sync({ quiet: true, minAge: 60000 }); });
  // Reintento: cada 20 s si hay cambios esperando, y cada 5 minutos (en silencio) para traer lo que cargaron otros.
  let last = 0;
  setInterval(() => {
    if (document.visibilityState !== 'visible' || running) return;
    const wait = store.pending() > 0 ? 20000 : 300000;
    if (Date.now() - last >= wait - 500) { last = Date.now(); sync({ quiet: true }); }
  }, 5000);
}
