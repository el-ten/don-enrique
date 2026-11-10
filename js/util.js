// Utilidades de fechas, números y formato (es-AR).

export const pad = (n) => String(n).padStart(2, '0');

export function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function nowTime(d = new Date()) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function nowDT(d = new Date()) {
  return `${todayStr(d)} ${nowTime(d)}:${pad(d.getSeconds())}`;
}

const DAY = 86400000;
const EPOCH = Date.UTC(1899, 11, 30);

export function isBlank(v) {
  return v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v));
}

// ---- lectura de lo que viene de la planilla ----
export function parseDate(v) {
  if (isBlank(v)) return '';
  if (typeof v === 'number') {
    const d = new Date(EPOCH + Math.floor(v) * DAY);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  return '';
}

export function parseTime(v) {
  if (isBlank(v)) return '';
  if (typeof v === 'number') {
    const frac = v - Math.floor(v);
    const mins = Math.round(frac * 1440) % 1440;
    return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
  }
  const m = String(v).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*$/);
  if (m) return `${pad(m[1])}:${m[2]}`;
  return '';
}

// Duración → horas (decimal).
export function parseDur(v) {
  if (isBlank(v)) return null;
  if (typeof v === 'number') return v * 24;
  const m = String(v).trim().match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
  if (m) return Number(m[1]) + Number(m[2]) / 60 + Number(m[3] || 0) / 3600;
  return null;
}

export function parseDT(v) {
  if (isBlank(v)) return '';
  if (typeof v === 'number') {
    const date = parseDate(v);
    const t = parseTime(v);
    return `${date} ${t}:00`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return `${m[1]}-${m[2]}-${m[3]} ${pad(m[4])}:${m[5]}:${m[6] || '00'}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])} ${pad(m[4])}:${m[5]}:${m[6] || '00'}`;
  return '';
}

export function parseNum(v) {
  if (isBlank(v)) return null;
  if (typeof v === 'number') return v;
  const s = String(v).trim().replace(/[^\d,.\-]/g, '');
  if (!s) return null;
  // "1.234,5" → 1234.5 ; "31.000" → 31000 (punto de miles) ; "10,5" → 10.5
  let t = s;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// ---- aritmética de fechas ----
export function dtToMs(dt) { // 'YYYY-MM-DD HH:mm:ss' (hora local)
  const m = String(dt).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return NaN;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)).getTime();
}
export function dateTimeToMs(date, time) {
  if (!date || !time) return NaN;
  return dtToMs(`${date} ${time}:00`);
}

// ---- formato de pantalla ----
const nf0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

export const fmt0 = (n) => (isBlank(n) ? '—' : nf0.format(n));
export const fmt1 = (n) => (isBlank(n) ? '—' : nf1.format(n));
export const fmt2 = (n) => (isBlank(n) ? '—' : nf2.format(n));
export const fmtKg = (n) => (isBlank(n) ? '—' : `${nf0.format(Math.round(n))} kg`);
export const fmtHa = (n) => (isBlank(n) ? '—' : `${nf2.format(n)} ha`);
export const fmtL = (n) => (isBlank(n) ? '—' : `${nf0.format(Math.round(n))} L`);
export const fmtSigned = (n, unit = '') => (isBlank(n) ? '—' : `${n > 0 ? '+' : ''}${nf0.format(Math.round(n))}${unit}`);

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function fmtDate(s, withYear = true) {
  if (!s) return '—';
  const [y, m, d] = s.split('-').map(Number);
  return `${d} ${MESES[m - 1]}${withYear ? ' ' + y : ''}`;
}
export function fmtDateShort(s) {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}
export function relDay(s) {
  if (!s) return '';
  const t = todayStr();
  if (s === t) return 'Hoy';
  const d = new Date(); d.setDate(d.getDate() - 1);
  if (s === todayStr(d)) return 'Ayer';
  return fmtDate(s, s.slice(0, 4) !== t.slice(0, 4));
}
export function fmtDur(h) {
  if (isBlank(h)) return '—';
  const mins = Math.round(h * 60);
  const hh = Math.floor(mins / 60), mm = mins % 60;
  if (hh === 0) return `${mm} min`;
  return mm ? `${hh} h ${pad(mm)} min` : `${hh} h`;
}
export function fmtTime(t) { return t || '—'; }

export function uid8() {
  const a = new Uint8Array(4);
  (globalThis.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => (a[i] = Math.floor(Math.random() * 256)));
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function norm(s) { return String(s ?? '').trim().toLowerCase(); }

export function unique(arr) { return [...new Set(arr)]; }
export function sortEs(arr) { return [...arr].sort((a, b) => String(a).localeCompare(String(b), 'es')); }

// "a, b, c" → ['a','b','c']
export function splitList(s) {
  if (isBlank(s)) return [];
  return String(s).split(',').map((x) => x.trim()).filter(Boolean);
}
export const joinList = (a) => (a || []).join(', ');

// Campaña sugerida: año agrícola julio–junio (por defecto de AppSheet: constante "2026/27").
export function campaignFor(dateStr = todayStr()) {
  const [y, m] = dateStr.split('-').map(Number);
  const start = m >= 7 ? y : y - 1;
  return `${start}/${String(start + 1).slice(-2)}`;
}

// Números escritos a mano en un formulario (es-AR): "20.050" = 20050, "22,5" = 22,5, "22.5" = 22,5.
export function parseInputNumber(text) {
  let t = String(text ?? '').trim().replace(/\s+/g, '');
  if (t === '') return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}
export function formatInputNumber(x) {
  if (x === null || x === undefined || x === '' || Number.isNaN(Number(x))) return '';
  const n = Number(x);
  if (Number.isInteger(n) && Math.abs(n) >= 10000) return String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.').replace(/^/, n < 0 ? '-' : '');
  return String(n).replace('.', ',');
}
export const fmtUsd = (n) => (isBlank(n) ? '—' : `USD ${nf2.format(n)}`);
