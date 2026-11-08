// Simulador de la planilla: lo usa el "modo demo" dentro de la app y el servidor de pruebas.
// Imita lo que hace Code.gs (Apps Script): devuelve celdas como las muestra la planilla
// (fechas dd/MM/yyyy, horas HH:mm, duraciones H:MM) y escribe de forma idempotente.
import { TABLES, TABLE_KEYS, CONFIG_SHEET, DEFAULT_LISTS, kindOf } from './schema.js';
import { pad, todayStr } from './util.js';

function toCell(kind, v) {
  if (v === null || v === undefined || v === '') return '';
  switch (kind) {
    case 'date': { const [y, m, d] = String(v).slice(0, 10).split('-'); return `${d}/${m}/${y}`; }
    case 'time': return String(v).slice(0, 5);
    case 'dur': { const mins = Math.round(Number(v) * 60); return `${Math.floor(mins / 60)}:${pad(mins % 60)}`; }
    case 'dt': { const s = String(v); const [d, t] = s.split(/[ T]/); const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y} ${t}`; }
    case 'num': return Number(v);
    default: return v;
  }
}

export function createMock(initial) {
  const state = initial || emptyState();
  const done = new Set(state.done || []);
  state.done = [...done];

  function read() {
    const sheets = {};
    for (const tk of TABLE_KEYS) {
      const T = TABLES[tk];
      const s = state.sheets[T.sheet];
      sheets[T.sheet] = { headers: s.headers, rows: s.rows };
    }
    return { ok: true, serverTime: new Date().toISOString(), sheets, config: state.config };
  }

  function write(ops) {
    const results = [];
    for (const op of ops) {
      try {
        if (done.has(op.id)) { results.push({ id: op.id, ok: true, dup: true }); continue; }
        const T = TABLES[op.tk];
        if (!T) throw new Error('Tabla desconocida: ' + op.tk);
        const s = state.sheets[T.sheet];
        const keyIdx = s.headers.indexOf(T.key);
        if (op.t === 'append') {
          const k = op.rec[T.key];
          if (k === undefined || k === '') throw new Error('Falta el ID');
          if (s.rows.some((r) => String(r[keyIdx]) === String(k))) { done.add(op.id); results.push({ id: op.id, ok: true, dup: true }); continue; }
          const row = s.headers.map((h) => {
            if (!h || T.formulaCols.includes(h) || !(h in op.rec)) return '';
            return toCell(kindOf(op.tk, h), op.rec[h]);
          });
          s.rows.push(row);
        } else if (op.t === 'update') {
          const row = s.rows.find((r) => String(r[keyIdx]) === String(op.key));
          if (!row) throw new Error('No existe el registro ' + op.key);
          for (const [h, v] of Object.entries(op.set)) {
            const i = s.headers.indexOf(h);
            if (i < 0) throw new Error('Columna desconocida: ' + h);
            if (T.formulaCols.includes(h)) throw new Error('Columna calculada: ' + h);
            row[i] = toCell(kindOf(op.tk, h), v);
          }
        } else throw new Error('Operación desconocida');
        done.add(op.id);
        results.push({ id: op.id, ok: true });
      } catch (e) {
        results.push({ id: op.id, ok: false, error: String(e.message || e) });
      }
    }
    state.done = [...done].slice(-500);
    return { ok: true, results, serverTime: new Date().toISOString() };
  }

  return { state, read, write, handle: (body) => handle(body) };

  function handle(body) {
    if (!body || typeof body !== 'object') return { ok: false, error: 'Pedido inválido' };
    if (body.action === 'ping') return { ok: true, pong: true, serverTime: new Date().toISOString() };
    if (body.action === 'read') return read();
    if (body.action === 'write') return write(body.ops || []);
    return { ok: false, error: 'Acción desconocida' };
  }
}

function emptyState() {
  const sheets = {};
  for (const tk of TABLE_KEYS) sheets[TABLES[tk].sheet] = { headers: [...TABLES[tk].headers], rows: [] };
  return { sheets, config: { headers: [], rows: [] }, done: [] };
}

function configFromLists(lists) {
  const headers = Object.keys(lists);
  const n = Math.max(...headers.map((h) => lists[h].length));
  const rows = [];
  for (let i = 0; i < n; i++) rows.push(headers.map((h) => lists[h][i] ?? ''));
  return { headers, rows };
}

function put(state, tk, rec) {
  const T = TABLES[tk];
  const s = state.sheets[T.sheet];
  s.rows.push(s.headers.map((h) => (h && h in rec ? toCell(kindOf(tk, h), rec[h]) : '')));
}

const dayOffset = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return todayStr(d); };

// Datos de ejemplo 100 % ficticios (para probar la app sin tocar la planilla real).
export function demoSeed() {
  const st = emptyState();
  st.config = configFromLists({
    ...DEFAULT_LISTS,
    Cultivos: ['Trigo', 'Centeno', 'Soja', 'Maíz', 'Otro'],
    Operadores: ['Juan', 'Pedro', 'Marcos', 'Laura', 'Otro'],
  });
  const lotes = [
    ['demo0001', 'CP-SH', 'SH', 'La Esperanza', 'Lote 1', 24, 'Propio'],
    ['demo0002', 'CP-SH', 'SH', 'La Esperanza', 'Lote 2', 31, 'Propio'],
    ['demo0003', 'CA-SH', 'SH', 'Don Ramón', 'Loma', 18, 'Arrendado'],
    ['demo0004', 'CA-SH', 'SH', 'Don Ramón', 'Bajo', 22, 'Arrendado'],
    ['demo0005', 'SER', '', 'Los Ceibos', 'Frente', 40, ''],
  ];
  for (const [id, un, resp, campo, lote, ha, ten] of lotes) {
    put(st, 'lotes', { 'ID lote': id, 'Unidad': un, 'Responsable': resp, 'Campo': campo, 'Lote físico': lote, 'Ha físicas': ha, 'Tenencia': ten, 'Estado dato': 'Confirmado' });
  }
  const act = [
    ['TRA-01', 'Tractor', 'Tractor A', 'Marca X 240'], ['TRA-02', 'Tractor', 'Tractor B', 'Marca Y 150'],
    ['COS-01', 'Cosechadora', 'Cosechadora', 'Marca Z 1550'], ['SEM-01', 'Sembradora', 'Sembradora 47', ''],
    ['CAB-01', 'Cabezal', 'Plataforma 25 pies', ''], ['PUL-01', 'Pulverizadora', 'Pulverizadora', ''],
    ['TOL-01', 'Tolva', 'Comofra', ''], ['TOL-02', 'Tolva', 'Ombú', ''],
    ['ACO-01', 'Acoplado', 'Acoplado con sinfín', ''], ['ESP-01', 'Fertilizadora', 'Fertilizadora', ''],
    ['TAN-01', 'Tanque de combustible', 'Tanque fijo', ''], ['TAN-02', 'Tanque de combustible', 'Tanque móvil', ''],
  ];
  for (const [id, cat, nom, mod] of act) {
    put(st, 'activos', { 'ID activo': id, 'Categoría': cat, 'Nombre corto': nom, 'Marca / modelo': mod, 'Capacidad': nom === 'Tanque fijo' ? 3000 : nom === 'Tanque móvil' ? 2000 : null, 'Estado dato': 'Confirmado' });
  }
  // labores
  put(st, 'labores', { 'ID labor': 'demolab1', 'Campaña': '2026/27', 'Fecha inicio': dayOffset(-12), 'Fecha fin': dayOffset(-12), 'Unidad': 'CP-SH', 'Campo / cliente': 'La Esperanza', 'Lote': 'Lote 1', 'Tarea': 'Siembra', 'Cultivo': 'Maíz', 'Ha realizadas': 24, 'Hora inicio': '08:30', 'Hora fin': '17:10', 'Pausas / demoras h': 0.75, 'Máquina principal': 'Tractor B', 'Implemento / equipo': 'Sembradora 47', 'Operadores principales': 'Juan', 'Estado labor': 'Terminado', 'Estado dato': 'Confirmado', 'ID lote vinculado': 'demo0001' });
  put(st, 'labores', { 'ID labor': 'demolab2', 'Campaña': '2026/27', 'Fecha inicio': dayOffset(-10), 'Fecha fin': dayOffset(-9), 'Unidad': 'CP-SH', 'Campo / cliente': 'La Esperanza', 'Lote': 'Lote 2', 'Tarea': 'Siembra', 'Cultivo': 'Maíz', 'Ha realizadas': 31, 'Hora inicio': '09:00', 'Hora fin': '12:30', 'Pausas / demoras h': 1.5, 'Máquina principal': 'Tractor B', 'Implemento / equipo': 'Sembradora 47', 'Operadores principales': 'Juan, Pedro', 'Estado labor': 'Terminado', 'Estado dato': 'Confirmado', 'ID lote vinculado': 'demo0002' });
  put(st, 'labores', { 'ID labor': 'demolab3', 'Campaña': '2025/26', 'Fecha inicio': dayOffset(-300), 'Fecha fin': dayOffset(-298), 'Unidad': 'CA-SH', 'Campo / cliente': 'Don Ramón', 'Lote': 'Loma', 'Tarea': 'Cosecha', 'Cultivo': 'Trigo', 'Ha realizadas': 18, 'Hora inicio': '10:00', 'Hora fin': '18:00', 'Pausas / demoras h': 1, 'Máquina principal': 'Cosechadora', 'Implemento / equipo': 'Plataforma 25 pies', 'Operadores principales': 'Marcos', 'Estado labor': 'Terminado', 'Estado dato': 'Confirmado', 'ID lote vinculado': 'demo0003' });
  // producción + cargas + movimientos
  put(st, 'prod', { 'ID producción': 'demoprd1', 'Campaña': '2025/26', 'Fecha inicio cosecha': dayOffset(-300), 'Fecha fin cosecha': dayOffset(-298), 'Unidad': 'CA-SH', 'Campo / cliente': 'Don Ramón', 'Lote / condición': 'Loma', 'Cultivo': 'Trigo', 'Tipo / época': 'Sin distinguir', 'Ha cosechadas': 18, 'ID labor vinculada': 'demolab3', 'Estado dato': 'Confirmado' });
  put(st, 'cargas', { 'ID carga': 'democar1', 'Campaña': '2025/26', 'Fecha': dayOffset(-299), 'Camión / patente': 'AB123CD', 'Cultivo': 'Trigo', 'Destino': 'AFA', 'Estado carga': 'Conciliado', 'Peso ticket kg': 30040, 'Número ticket': '0001-123', 'Unidad': 'CA-SH', 'Campo / cliente': 'Don Ramón', 'Lote': 'Loma', 'ID labor vinculada': 'demolab3', 'ID producción vinculada': 'demoprd1', 'Computa producción': 'Sí' });
  put(st, 'movs', { 'ID movimiento': 'demomov1', 'ID carga': 'democar1', 'Campaña': '2025/26', 'Fecha': dayOffset(-299), 'Unidad': 'CA-SH', 'Campo / cliente': 'Don Ramón', 'Lote': 'Loma', 'Cultivo': 'Trigo', 'Tipo de movimiento': 'Cosecha a camión', 'Monotolva utilizada': 'Comofra', 'Equipo / recipiente': 'Camión', 'Kg asignados': 15000, 'Destino / ubicación': 'AFA', 'ID labor vinculada': 'demolab3', 'ID producción vinculada': 'demoprd1', 'Computa producción': 'Sí' });
  put(st, 'movs', { 'ID movimiento': 'demomov2', 'ID carga': 'democar1', 'Campaña': '2025/26', 'Fecha': dayOffset(-299), 'Unidad': 'CA-SH', 'Campo / cliente': 'Don Ramón', 'Lote': 'Loma', 'Cultivo': 'Trigo', 'Tipo de movimiento': 'Cosecha a camión', 'Monotolva utilizada': 'Ombú', 'Equipo / recipiente': 'Camión', 'Kg asignados': 15000, 'Destino / ubicación': 'AFA', 'ID labor vinculada': 'demolab3', 'ID producción vinculada': 'demoprd1', 'Computa producción': 'Sí' });
  // algo en marcha, para que el modo demo muestre cómo se ve el trabajo del día
  const t0 = new Date(Date.now() - 95 * 60000);
  const two = (n) => String(n).padStart(2, '0');
  const hoy = `${t0.getFullYear()}-${two(t0.getMonth() + 1)}-${two(t0.getDate())}`;
  put(st, 'labores', { 'ID labor': 'demolab4', 'Campaña': '2025/26', 'Fecha inicio': hoy, 'Unidad': 'CA-SH', 'Campo / cliente': 'Don Ramón', 'Lote': 'Bajo', 'Tarea': 'Cosecha', 'Cultivo': 'Trigo', 'Hora inicio': `${two(t0.getHours())}:${two(t0.getMinutes())}`, 'Máquina principal': 'Cosechadora', 'Implemento / equipo': 'Plataforma 25 pies', 'Operadores principales': 'Marcos', 'Estado labor': 'En curso', 'Estado dato': 'Confirmado', 'ID lote vinculado': 'demo0004' });
  put(st, 'cargas', { 'ID carga': 'democar2', 'Campaña': '2025/26', 'Fecha': hoy, 'Camión / patente': 'XY987ZT', 'Cultivo': 'Trigo', 'Destino': 'AFA', 'Estado carga': 'En carga', 'Unidad': 'CA-SH', 'Campo / cliente': 'Don Ramón', 'Lote': 'Bajo', 'ID labor vinculada': 'demolab4', 'Computa producción': 'Sí' });
  put(st, 'movs', { 'ID movimiento': 'demomov3', 'ID carga': 'democar2', 'Campaña': '2025/26', 'Fecha': hoy, 'Unidad': 'CA-SH', 'Campo / cliente': 'Don Ramón', 'Lote': 'Bajo', 'Cultivo': 'Trigo', 'Tipo de movimiento': 'Cosecha a camión', 'Monotolva utilizada': 'Ombú', 'Equipo / recipiente': 'Camión', 'Kg asignados': 12000, 'Destino / ubicación': 'AFA', 'ID labor vinculada': 'demolab4', 'Computa producción': 'Sí' });
  // silos
  put(st, 'silos', { 'ID silo': 'SILO-01', 'Nombre silo': 'Silo 1', 'Tipo': 'Silo de chapa', 'Capacidad kg': 60000, 'Estado': 'Activo', 'Estado dato': 'Confirmado' });
  put(st, 'silos', { 'ID silo': 'SILO-02', 'Nombre silo': 'Silo 2', 'Tipo': 'Silo de chapa', 'Capacidad kg': 40000, 'Estado': 'Activo', 'Estado dato': 'Confirmado' });
  put(st, 'silos', { 'ID silo': 'SILOB-01', 'Nombre silo': 'Silobolsa 1', 'Tipo': 'Silobolsa', 'Capacidad kg': 200000, 'Estado': 'Activo', 'Estado dato': 'Estimado' });
  // combustible
  put(st, 'comb', { 'ID movimiento combustible': 'democb1', 'Campaña': '2026/27', 'Fecha': dayOffset(-20), 'Tipo movimiento': 'Compra / ingreso', 'Producto': 'Gasoil', 'Litros': 3000, 'Destino': 'Tanque fijo', 'Unidad económica': 'SH general', 'Responsable': 'Juan', 'Documento / origen': 'Remito', 'Estado dato': 'Confirmado' });
  put(st, 'comb', { 'ID movimiento combustible': 'democb2', 'Campaña': '2026/27', 'Fecha': dayOffset(-12), 'Tipo movimiento': 'Carga a maquinaria', 'Producto': 'Gasoil', 'Litros': 140, 'Origen': 'Tanque fijo', 'Destino': 'Tractor B', 'Activo abastecido': 'Tractor B', 'ID labor vinculada': 'demolab1', 'Unidad económica': 'CP-SH', 'Campo / cliente': 'La Esperanza', 'Lote': 'Lote 1', 'Responsable': 'Juan', 'Documento / origen': 'Registro operativo', 'Estado dato': 'Confirmado', 'Computa consumo labor': 'Sí' });
  put(st, 'comb', { 'ID movimiento combustible': 'democb3', 'Campaña': '2026/27', 'Fecha': dayOffset(-8), 'Tipo movimiento': 'Transferencia interna', 'Producto': 'Gasoil', 'Litros': 500, 'Origen': 'Tanque fijo', 'Destino': 'Tanque móvil', 'Unidad económica': 'SH general', 'Responsable': 'Pedro', 'Documento / origen': 'Registro operativo', 'Estado dato': 'Confirmado' });
  return st;
}
