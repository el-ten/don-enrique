// Conversión de lo que llega de la planilla a datos tipados, y aplicación local
// de los cambios pendientes ("cola") sobre la última copia leída.
import { TABLES, TABLE_KEYS, DEFAULT_LISTS, kindOf } from './schema.js';
import { parseDate, parseTime, parseDur, parseDT, parseNum, isBlank } from './util.js';

export function parseCell(kind, v) {
  switch (kind) {
    case 'date': return parseDate(v);
    case 'time': return parseTime(v);
    case 'dur': return parseDur(v);
    case 'dt': return parseDT(v);
    case 'num': return parseNum(v);
    default:
      if (isBlank(v)) return '';
      return typeof v === 'string' ? v.trim() : String(v);
  }
}

// raw: { headers:[...], rows:[[...]] }  →  { headers, rows:[{col:valor}] }
export function normalizeTable(tkey, raw) {
  const T = TABLES[tkey];
  const headers = (raw.headers || []).map((h) => String(h ?? '').trim());
  const rows = [];
  for (const r of raw.rows || []) {
    const o = {};
    headers.forEach((h, i) => {
      if (!h) return;
      o[h] = parseCell(kindOf(tkey, h), r[i]);
    });
    if (isBlank(o[T.key])) continue;
    rows.push(o);
  }
  return { headers: headers.filter(Boolean), rows };
}

// Listas de 01_CONFIGURACION: { 'Tareas': ['Siembra', ...], ... }
export function normalizeConfig(raw) {
  const out = {};
  const headers = (raw.headers || []).map((h) => String(h ?? '').trim());
  headers.forEach((h, i) => {
    if (!h) return;
    const vals = [];
    for (const r of raw.rows || []) {
      const v = r[i];
      if (!isBlank(v)) vals.push(String(v).trim());
    }
    out[h] = [...new Set([...(out[h] || []), ...vals])];
  });
  return out;
}

export function normalizeRead(payload) {
  const tables = {};
  for (const tk of TABLE_KEYS) {
    const raw = payload.sheets && payload.sheets[TABLES[tk].sheet];
    if (raw) tables[tk] = normalizeTable(tk, raw);
  }
  const cfg = payload.config ? normalizeConfig(payload.config) : {};
  return { tables, cfg, serverTime: payload.serverTime || null };
}

// ---- cambios pendientes ----
export function applyOp(tables, op) {
  const T = TABLES[op.tk];
  const rows = tables[op.tk];
  if (!T || !rows) return;
  const keyCol = T.key;
  if (op.t === 'append') {
    const k = op.rec[keyCol];
    const ex = rows.find((r) => r[keyCol] === k);
    if (ex) Object.assign(ex, op.rec);
    else rows.push({ ...emptyRow(op.tk), ...op.rec, _pending: true });
  } else if (op.t === 'update') {
    const ex = rows.find((r) => r[keyCol] === op.key);
    if (ex) { Object.assign(ex, op.set); ex._pending = true; }
  }
}

export function emptyRow(tk) {
  const o = {};
  for (const h of TABLES[tk].headers) {
    if (!h) continue;
    const k = kindOf(tk, h);
    o[h] = k === 'num' || k === 'dur' ? null : '';
  }
  return o;
}

// Copia de trabajo: última lectura + cambios pendientes (en orden).
export function buildBook(snapshot, ops) {
  const tables = {};
  for (const tk of TABLE_KEYS) {
    const src = (snapshot && snapshot.tables && snapshot.tables[tk]) ? snapshot.tables[tk].rows : [];
    tables[tk] = src.map((r) => ({ ...r }));
  }
  for (const op of ops || []) applyOp(tables, op);
  const cfg = { ...DEFAULT_LISTS };
  const sc = (snapshot && snapshot.cfg) || {};
  for (const k of Object.keys(sc)) if (sc[k] && sc[k].length) cfg[k] = sc[k];
  const book = { ...tables, tables, cfg };
  return book;
}

// Valor para enviar al servidor (tipado, sin símbolos).
export function wireValue(kind, v) {
  if (v === null || v === undefined) return '';
  if (kind === 'num' || kind === 'dur') return v === '' ? '' : Number(v);
  return v;
}
export function toWire(tk, rec) {
  const o = {};
  for (const [h, v] of Object.entries(rec)) {
    if (h.startsWith('_')) continue;
    o[h] = wireValue(kindOf(tk, h), v);
  }
  return o;
}
