// Reglas de negocio: réplica de lo que hace AppSheet (fórmulas virtuales y acciones).
import { isBlank, norm, dtToMs, dateTimeToMs, todayStr, nowTime, nowDT, uid8, unique, splitList, campaignFor } from './util.js';
import { emptyRow } from './model.js';

export const TOL_KG = 100;
// OJO: la planilla solo acepta los estados de 01_CONFIGURACION (columna "Estado labor"), que no incluye "Pausada".
// Una labor pausada sigue "En curso" y se reconoce por tener "Inicio pausa actual" cargado (así lo hace AppSheet).
export const ESTADOS_ABIERTOS = ['En curso'];
export const TIPOS_ENTRADA = ['Cosecha a camión', 'Cosecha a silo', 'Cosecha a silobolsa'];
export const TIPOS_ENTRADA_DIRECTA = ['Cosecha a silo', 'Cosecha a silobolsa'];
export const TAREAS_CAMPO = ['Siembra', 'Cosecha', 'Pulverización', 'Fertilización'];

const sum = (arr, f) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);
const byKey = (rows, key) => Object.fromEntries(rows.map((r) => [r[key], r]));

// ------------------------------------------------------------------ LABORES
export function isOpen(l) { return ESTADOS_ABIERTOS.includes(l['Estado labor']); }
export function isPaused(l) { return isOpen(l) && !!l['Inicio pausa actual']; }
// Lo que se muestra en pantalla (la planilla no tiene un estado "Pausada").
export function estadoVista(l) { return isPaused(l) ? 'Pausada' : l['Estado labor']; }

export function laborTitle(l) {
  const campo = l['Campo / cliente'] || 'Sin campo';
  const lote = l['Lote'] ? ` — ${l['Lote']}` : '';
  return `${l['Tarea']} · ${campo}${lote}`;
}
export function laborPlace(l) {
  return [l['Campo / cliente'], l['Lote']].filter(Boolean).join(' — ') || 'Sin lote';
}

// Horas efectivas = (fin − inicio) − pausas. Si está abierta, hasta "ahora" y sin contar la pausa en curso.
// Si está terminada se calcula como la planilla (ver abajo).
export function laborHoras(l, nowMs = Date.now()) {
  const ini = dateTimeToMs(l['Fecha inicio'], l['Hora inicio']);
  if (Number.isNaN(ini)) return null;
  const pausas = l['Pausas / demoras h'] || 0;
  let fin = dateTimeToMs(l['Fecha fin'], l['Hora fin']);
  let extra = 0;
  if (Number.isNaN(fin)) {
    if (!isOpen(l)) return null;
    fin = nowMs;
    if (isPaused(l)) extra = Math.max(0, (nowMs - dtToMs(l['Inicio pausa actual'])) / 3600000);
  }
  let h;
  if (extra === 0 && !isOpen(l) && !Number.isNaN(dateTimeToMs(l['Fecha fin'], l['Hora fin']))) {
    // Labor terminada: igual que la columna "Horas efectivas" de la planilla, que cuenta solo la hora del día
    // (MOD(hora fin − hora inicio; 1)) y no los días entre medio.
    const mins = (t) => { const [a, b] = String(t).split(':'); return Number(a) * 60 + Number(b || 0); };
    const d = ((mins(l['Hora fin']) - mins(l['Hora inicio'])) % 1440 + 1440) % 1440;
    h = d / 60 - pausas;
  } else h = (fin - ini) / 3600000 - pausas - extra;
  return h >= 0 ? h : 0;
}
export function laborRend(l, nowMs) {
  const h = laborHoras(l, nowMs);
  const ha = l['Ha realizadas'];
  if (isBlank(ha) || h === null || h <= 0) return null;
  return ha / h;
}

export function labOpsPausar(l) {
  return [{ t: 'update', tk: 'labores', key: l['ID labor'], set: { 'Inicio pausa actual': nowDT() } }];
}
export function labOpsReanudar(l, nowMs = Date.now()) {
  const ini = l['Inicio pausa actual'] ? dtToMs(l['Inicio pausa actual']) : nowMs;
  const dur = Math.max(0, (nowMs - ini) / 3600000);
  const total = (l['Pausas / demoras h'] || 0) + dur;
  return [{ t: 'update', tk: 'labores', key: l['ID labor'], set: { 'Pausas / demoras h': total, 'Inicio pausa actual': '' } }];
}
export function labOpsFinalizar(l, ha) {
  return [{ t: 'update', tk: 'labores', key: l['ID labor'], set: { 'Estado labor': 'Terminado', 'Fecha fin': todayStr(), 'Hora fin': nowTime(), 'Ha realizadas': Number(ha) } }];
}
export function canPause(l) { return l['Estado labor'] === 'En curso' && !l['Inicio pausa actual']; }
export function canResume(l) { return isPaused(l); }
export function canFinish(l) { return l['Estado labor'] === 'En curso' && !l['Inicio pausa actual']; }

export function machineBusy(book, machine, exceptId) {
  if (!machine) return null;
  return book.labores.find((x) => x['Máquina principal'] === machine && isOpen(x) && x['ID labor'] !== exceptId) || null;
}

export function lotLabel(lote) {
  return `${lote['Campo']} — ${lote['Lote físico']}`;
}

// Campaña sugerida. Trigo/centeno cosechado en año X → campaña X-1/X (regla de la SH); resto, año agrícola jul–jun.
export function suggestCampaign({ tarea, cultivo, fecha = todayStr() }) {
  const year = Number(fecha.slice(0, 4));
  if (tarea === 'Cosecha' && (cultivo === 'Trigo' || cultivo === 'Centeno')) return `${year - 1}/${String(year).slice(-2)}`;
  return campaignFor(fecha);
}

// Opciones de equipos según tarea (igual que AppSheet).
export function machineOptions(book) {
  return nombres(book.activos.filter((a) => ['Tractor', 'Cosechadora'].includes(a['Categoría'])));
}
export function implementOptions(book, tarea) {
  const cat = { Siembra: ['Sembradora'], Cosecha: ['Cabezal'], 'Pulverización': ['Pulverizadora'], 'Fertilización': ['Fertilizadora'] }[tarea];
  const todos = ['Sembradora', 'Cabezal', 'Pulverizadora', 'Fertilizadora'];
  return nombres(book.activos.filter((a) => (cat ? cat.includes(a['Categoría']) : todos.includes(a['Categoría']))));
}
export function supportEquipOptions(book) {
  return nombres(book.activos.filter((a) => ['Tractor', 'Tolva', 'Acoplado', 'Acoplados'].includes(a['Categoría']) || (a['Categoría'] === 'Tanque de combustible' && a['Nombre corto'] === 'Tanque móvil')));
}
function nombres(rows) {
  return [...new Set(rows.map((a) => a['Nombre corto']).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
}

// ------------------------------------------------------------------ MOVIMIENTOS / CARGAS
export function computaApp(m) {
  if (!isBlank(m['Computa producción'])) return m['Computa producción'];
  return TIPOS_ENTRADA.includes(m['Tipo de movimiento']) ? 'Sí' : 'No';
}
export function movCultivo(m, prodById) {
  if (!isBlank(m['Cultivo'])) return m['Cultivo'];
  const p = prodById && prodById[m['ID producción vinculada']];
  return p ? p['Cultivo'] : '';
}

export function movsDeCarga(book, id) { return book.movs.filter((m) => m['ID carga'] === id); }

export function cargaView(c, book) {
  const movs = movsDeCarga(book, c['ID carga']);
  const kgRec = sum(movs, (m) => m['Kg asignados']);
  const peso = c['Peso ticket kg'];
  const tieneTicket = !isBlank(peso) && peso > 0;
  const diff = tieneTicket ? peso - kgRec : null;
  const control = !tieneTicket ? 'Pendiente de ticket' : Math.abs(diff) <= TOL_KG ? 'Dentro de tolerancia' : 'Revisar diferencia';
  const estado = c['Estado carga'];
  return {
    movs, kgRec, diff, control, tieneTicket,
    descargas: movs.length,
    canAddDescarga: estado === 'En carga',
    canCerrar: estado === 'En carga' && kgRec > 0,
    canTicket: estado !== 'En carga',
    canReabrir: estado !== 'En carga',
  };
}

export function cargaOpsCerrar(c) {
  return [{ t: 'update', tk: 'cargas', key: c['ID carga'], set: { 'Estado carga': 'Despachado' } }];
}
export function cargaOpsReabrir(c) {
  return [{ t: 'update', tk: 'cargas', key: c['ID carga'], set: { 'Estado carga': 'En carga' } }];
}
// Cargar ticket + conciliación automática (|dif| ≤ 100 kg → Conciliado; si no, Revisar diferencia).
export function cargaOpsTicket(c, book, { peso, numero, obs }) {
  const kgRec = sum(movsDeCarga(book, c['ID carga']), (m) => m['Kg asignados']);
  const set = { 'Peso ticket kg': Number(peso), 'Número ticket': numero || '' };
  if (!isBlank(obs)) set['Observaciones'] = obs;
  if (['Despachado', 'Conciliado', 'Revisar diferencia'].includes(c['Estado carga']) && kgRec > 0) {
    set['Estado carga'] = Math.abs(Number(peso) - kgRec) <= TOL_KG ? 'Conciliado' : 'Revisar diferencia';
  }
  return [{ t: 'update', tk: 'cargas', key: c['ID carga'], set }];
}

export function cargaNewRec(book, v) {
  const lab = v['ID labor vinculada'] ? book.labores.find((l) => l['ID labor'] === v['ID labor vinculada']) : null;
  return {
    'ID carga': uid8(), 'Campaña': v['Campaña'], 'Fecha': v['Fecha'], 'Camión / patente': (v['Camión / patente'] || '').trim().replace(/\s+/g, ' ').toUpperCase(),
    'Cultivo': v['Cultivo'], 'Destino': v['Destino'], 'Estado carga': 'En carga', 'Peso ticket kg': null, 'Número ticket': '',
    'Observaciones': v['Observaciones'] || '',
    'Unidad': lab ? lab['Unidad'] : '', 'Campo / cliente': lab ? lab['Campo / cliente'] : '', 'Lote': lab ? lab['Lote'] : '',
    'ID labor vinculada': v['ID labor vinculada'] || '', 'ID producción vinculada': v['ID producción vinculada'] || '',
    'Computa producción': v['Computa producción'] || 'Sí', 'Documento / origen': v['Documento / origen'] || '',
  };
}

export function descargaNewRec(c, v) {
  return {
    'ID movimiento': uid8(), 'ID carga': c['ID carga'], 'Campaña': c['Campaña'], 'Fecha': v['Fecha'] || todayStr(),
    'Unidad': c['Unidad'] || '', 'Campo / cliente': c['Campo / cliente'] || '', 'Lote': c['Lote'] || '', 'Cultivo': c['Cultivo'],
    'Tipo de movimiento': 'Cosecha a camión', 'Monotolva utilizada': v['Monotolva utilizada'] || '', 'Equipo / recipiente': 'Camión',
    'Kg asignados': Number(v['Kg asignados']), 'Destino / ubicación': c['Destino'] || '',
    'ID labor vinculada': c['ID labor vinculada'] || '', 'ID producción vinculada': c['ID producción vinculada'] || '',
    'Computa producción': c['Computa producción'] || '', 'Documento / origen': c['Documento / origen'] || '',
    'Observaciones': v['Observaciones'] || '', 'ID silo': v['ID silo'] || '',
  };
}

// ------------------------------------------------------------------ SILOS
export function siloView(s, book) {
  const prodById = byKey(book.prod, 'ID producción');
  const mine = book.movs.filter((m) => m['ID silo'] === s['ID silo']);
  const entradas = sum(mine.filter((m) => TIPOS_ENTRADA.includes(m['Tipo de movimiento'])), (m) => m['Kg asignados']);
  const salidas = sum(mine.filter((m) => m['Tipo de movimiento'] === 'Despacho de stock'), (m) => m['Kg asignados']);
  const stock = entradas - salidas;
  const cultivos = unique(mine.filter((m) => TIPOS_ENTRADA.includes(m['Tipo de movimiento'])).map((m) => movCultivo(m, prodById)).filter(Boolean));
  const cultivo = stock <= 0 ? 'Vacío' : cultivos.length ? cultivos.join(', ') : 'Sin cultivo indicado';
  const cap = s['Capacidad kg'];
  const pct = cap && cap > 0 ? Math.round((stock * 100) / cap) : null;
  return { entradas, salidas, stock, cultivo, pct, movs: mine };
}

export function entradaSiloRec(silo, book, v) {
  const prod = v['ID producción vinculada'] ? book.prod.find((p) => p['ID producción'] === v['ID producción vinculada']) : null;
  const tipo = silo['Tipo'] === 'Silobolsa' ? 'Cosecha a silobolsa' : 'Cosecha a silo';
  return {
    'ID movimiento': uid8(), 'ID carga': '', 'Campaña': prod ? prod['Campaña'] : v['Campaña'] || '', 'Fecha': v['Fecha'],
    'Unidad': prod ? prod['Unidad'] : '', 'Campo / cliente': prod ? prod['Campo / cliente'] : v['Campo / cliente'] || '',
    'Lote': prod ? prod['Lote / condición'] : v['Lote'] || '', 'Cultivo': prod ? prod['Cultivo'] : v['Cultivo'] || '',
    'Tipo de movimiento': tipo, 'Monotolva utilizada': '', 'Equipo / recipiente': silo['Tipo'] || '', 'Kg asignados': Number(v['Kg asignados']),
    'Destino / ubicación': silo['Nombre silo'] || '', 'ID labor vinculada': prod ? prod['ID labor vinculada'] || '' : '',
    'ID producción vinculada': v['ID producción vinculada'] || '', 'Computa producción': '', 'Documento / origen': v['Documento / origen'] || '',
    'Observaciones': v['Observaciones'] || '', 'ID silo': silo['ID silo'],
  };
}
export function salidaSiloRec(silo, v) {
  return {
    'ID movimiento': uid8(), 'ID carga': '', 'Campaña': campaignFor(v['Fecha']), 'Fecha': v['Fecha'], 'Unidad': '', 'Campo / cliente': '', 'Lote': '', 'Cultivo': '',
    'Tipo de movimiento': 'Despacho de stock', 'Monotolva utilizada': '', 'Equipo / recipiente': silo['Tipo'] || '', 'Kg asignados': Number(v['Kg asignados']),
    'Destino / ubicación': v['Destino / ubicación'] || '', 'ID labor vinculada': '', 'ID producción vinculada': '', 'Computa producción': '',
    'Documento / origen': v['Documento / origen'] || '', 'Observaciones': v['Observaciones'] || '', 'ID silo': silo['ID silo'],
  };
}

// ------------------------------------------------------------------ PRODUCCIÓN
function matchesProd(m, p) {
  if (computaApp(m) !== 'Sí') return false;
  if (m['ID producción vinculada'] === p['ID producción']) return true;
  return isBlank(m['ID producción vinculada']) && !isBlank(m['Campo / cliente']) && !isBlank(m['Lote']) &&
    norm(m['Campaña']) === norm(p['Campaña']) && norm(m['Cultivo']) === norm(p['Cultivo']) &&
    norm(m['Campo / cliente']) === norm(p['Campo / cliente']) && norm(m['Lote']) === norm(p['Lote / condición']);
}

export function prodView(p, book) {
  const cargasById = byKey(book.cargas, 'ID carga');
  const movs = book.movs.filter((m) => matchesProd(m, p));
  const control = (m) => (m['ID carga'] && cargasById[m['ID carga']] ? cargaView(cargasById[m['ID carga']], book).control : '');
  const kgCos = sum(movs, (m) => m['Kg asignados']);
  const camiones = unique(movs.map((m) => m['ID carga']).filter(Boolean)).length;
  const kgOk = sum(movs.filter((m) => control(m) === 'Dentro de tolerancia'), (m) => m['Kg asignados']);
  const kgRev = sum(movs.filter((m) => control(m) === 'Revisar diferencia'), (m) => m['Kg asignados']);
  const kgSilo = sum(movs.filter((m) => !m['ID carga'] && TIPOS_ENTRADA_DIRECTA.includes(m['Tipo de movimiento'])), (m) => m['Kg asignados']);
  const manual = p['Producción kg'];
  const kgFinal = !isBlank(manual) && manual > 0 ? manual : kgCos;
  const ha = p['Ha cosechadas'];
  const rinde = !isBlank(ha) && ha > 0 && kgFinal > 0 ? Math.round(kgFinal / ha) / 100 : null;
  const origen = !isBlank(manual) && manual > 0 ? 'Dato manual confirmado' : kgCos > 0 ? 'Automático desde descargas' : 'Sin descargas todavía';
  return { movs, kgCos, camiones, kgOk, kgRev, kgSilo, kgFinal, rinde, origen };
}
export function prodName(p) {
  return `${p['Cultivo']} ${p['Campaña']} · ${p['Campo / cliente']} — ${p['Lote / condición']}${isBlank(p['Ha cosechadas']) ? '' : ` · ${p['Ha cosechadas']} ha`}`;
}

// ------------------------------------------------------------------ COMBUSTIBLE
const ENTRAN = ['Compra / ingreso', 'Stock inicial', 'Devolución', 'Ajuste positivo'];
const SALEN = ['Carga a maquinaria', 'Salida a tercero', 'Ajuste negativo'];
const IN_DEST = ['Compra / ingreso', 'Stock inicial', 'Devolución', 'Ajuste positivo', 'Transferencia interna'];
const OUT_ORIG = ['Carga a maquinaria', 'Salida a tercero', 'Ajuste negativo', 'Transferencia interna'];

export function impactoGeneral(m) {
  const l = m['Litros'];
  if (isBlank(l)) return 0;
  if (ENTRAN.includes(m['Tipo movimiento'])) return l;
  if (SALEN.includes(m['Tipo movimiento'])) return -l;
  return 0;
}
export function impactoTanque(m, tanque) {
  const l = m['Litros'] || 0;
  return (m['Destino'] === tanque && IN_DEST.includes(m['Tipo movimiento']) ? l : 0) - (m['Origen'] === tanque && OUT_ORIG.includes(m['Tipo movimiento']) ? l : 0);
}
export function combustibleResumen(book) {
  const fijo = sum(book.comb, (m) => impactoTanque(m, 'Tanque fijo'));
  const movil = sum(book.comb, (m) => impactoTanque(m, 'Tanque móvil'));
  const general = sum(book.comb, impactoGeneral);
  const comprado = sum(book.comb.filter((m) => m['Tipo movimiento'] === 'Compra / ingreso'), (m) => m['Litros']);
  const cargado = sum(book.comb.filter((m) => m['Tipo movimiento'] === 'Carga a maquinaria'), (m) => m['Litros']);
  const capFijo = (book.activos.find((a) => a['Nombre corto'] === 'Tanque fijo') || {})['Capacidad'] || null;
  const capMovil = (book.activos.find((a) => a['Nombre corto'] === 'Tanque móvil') || {})['Capacidad'] || null;
  return { fijo, movil, general, comprado, cargado, capFijo, capMovil };
}
export function combRecipe(book, v) {
  const lab = v['ID labor vinculada'] ? book.labores.find((l) => l['ID labor'] === v['ID labor vinculada']) : null;
  return {
    'ID movimiento combustible': uid8(), 'Campaña': v['Campaña'], 'Fecha': v['Fecha'], 'Hora': v['Hora'] || '', 'Tipo movimiento': v['Tipo movimiento'],
    'Producto': v['Producto'], 'Litros': Number(v['Litros']), 'Origen': v['Origen'] || '', 'Destino': v['Destino'] || '',
    'Unidad económica': v['Unidad económica'] || (lab ? lab['Unidad'] : ''), 'Campo / cliente': v['Campo / cliente'] || (lab ? lab['Campo / cliente'] : ''),
    'Lote': v['Lote'] || (lab ? lab['Lote'] : ''), 'Activo abastecido': v['Activo abastecido'] || '', 'ID labor vinculada': v['ID labor vinculada'] || '',
    'ID gasto vinculado': v['ID gasto vinculado'] || '', 'Responsable': v['Responsable'] || '', 'Horómetro / kilometraje': v['Horómetro / kilometraje'] ?? '',
    'Documento / origen': v['Documento / origen'] || '', 'Estado dato': v['Estado dato'] || 'Confirmado', 'Observaciones': v['Observaciones'] || '',
    'Computa consumo labor': v['Computa consumo labor'] || '',
  };
}

// ------------------------------------------------------------------ INICIO
export function recientes(book) {
  const labs = [...book.labores].sort((a, b) => (b['Fecha inicio'] + (b['Hora inicio'] || '')).localeCompare(a['Fecha inicio'] + (a['Hora inicio'] || '')));
  return labs;
}
export function laboresAbiertas(book) { return book.labores.filter(isOpen); }
export function cargasEnCurso(book) { return book.cargas.filter((c) => c['Estado carga'] === 'En carga'); }
export function cargasPendientesTicket(book) { return book.cargas.filter((c) => ['Despachado', 'Revisar diferencia'].includes(c['Estado carga'])); }

export function cropColor(c) {
  return { Trigo: 'trigo', Soja: 'soja', Maíz: 'maiz', Centeno: 'centeno' }[c] || 'otro';
}

// Al cambiar el nombre de un campo o de un lote, las labores vinculadas a ese lote (por ID lote) que todavía tienen el
// nombre anterior pasan a tener el nuevo. Si una labor ya tenía un nombre distinto (porque alguien lo corrigió a mano),
// no se toca. `nuevo` = datos del lote ya editado ('Campo', 'Lote físico').
export function laboresARenombrar(labores, lote, nuevo) {
  const out = [];
  for (const l of labores) {
    if (!lote['ID lote'] || l['ID lote vinculado'] !== lote['ID lote']) continue;
    const set = {};
    if (nuevo['Campo'] !== lote['Campo'] && norm(l['Campo / cliente']) === norm(lote['Campo']) && l['Campo / cliente'] !== nuevo['Campo']) set['Campo / cliente'] = nuevo['Campo'];
    if (nuevo['Lote físico'] !== lote['Lote físico'] && norm(l['Lote']) === norm(lote['Lote físico']) && l['Lote'] !== nuevo['Lote físico']) set['Lote'] = nuevo['Lote físico'];
    if (Object.keys(set).length) out.push({ key: l['ID labor'], set });
  }
  return out;
}

// ------------------------------------------------------------------ SERVICIOS (hoja 09_SERVICIOS)
// Una labor de servicio es una labor de la unidad SER (servicios a terceros) de siembra, cosecha, pulverización o
// fertilización, que son los "Tipo servicio" que reconoce la planilla. Al terminarla, la app carga sola una fila en
// 09_SERVICIOS con lo que ya se sabe (cliente, lote, cultivo, hectáreas, fechas) y deja pendiente lo comercial
// (tarifa y entidad que factura), igual que las filas que ya tiene la planilla en esa situación.
export const TAREAS_SERVICIO = ['Siembra', 'Cosecha', 'Pulverización', 'Fertilización'];
export function laborEsServicio(l) { return l['Unidad'] === 'SER' && TAREAS_SERVICIO.includes(l['Tarea']); }
export function servicioDeLabor(book, id) {
  return (book.serv || []).find((s) => splitList(s['ID labor vinculada']).includes(id)) || null;
}
// Servicio ya cargado al que se suma esta labor: misma campaña, mismo cliente, mismo lote, mismo cultivo y mismo tipo
// (por ejemplo, un lote que se sembró en dos tandas es UN servicio con la suma de las hectáreas). Sin lote o sin
// cliente no se agrupa, porque no hay forma de saber si es el mismo trabajo. No se suma a servicios cancelados.
export function servicioParaAgrupar(book, l) {
  if (isBlank(l['Lote']) || isBlank(l['Campo / cliente'])) return null;
  const hay = (book.serv || []).filter((s) =>
    norm(s['Campaña']) === norm(l['Campaña']) && norm(s['Cliente']) === norm(l['Campo / cliente']) &&
    norm(s['Campo / lote']) === norm(l['Lote']) && norm(s['Cultivo']) === norm(l['Cultivo']) &&
    norm(s['Tipo servicio']) === norm(l['Tarea']) && (isBlank(s['Estado servicio']) || s['Estado servicio'] === 'Terminado'));
  return hay.length ? hay[hay.length - 1] : null;
}
// Cambio que suma una labor terminada a un servicio que ya existe: hectáreas, fechas y labores vinculadas.
// La tarifa, la entidad y lo demás de ese servicio no se tocan (el ingreso se recalcula solo con las hectáreas nuevas).
export function opsSumarAServicio(s, l) {
  const ha = (Number(s['Ha del servicio']) || 0) + (Number(l['Ha realizadas']) || 0);
  const ini = [s['Fecha inicio'], l['Fecha inicio']].filter(Boolean).sort()[0];
  const fin = [s['Fecha fin'], l['Fecha fin'] || l['Fecha inicio']].filter(Boolean).sort().pop();
  const nuevo = { 'Ha del servicio': ha || null, 'Fecha inicio': ini, 'Fecha fin': fin, 'ID labor vinculada': [...splitList(s['ID labor vinculada']), l['ID labor']].join(', ') };
  const set = {};
  for (const [k, v] of Object.entries(nuevo)) if (v !== undefined && v !== null && v !== '' && v !== s[k]) set[k] = v;
  return [{ t: 'update', tk: 'serv', key: s['ID servicio'], set }];
}

// Devuelve el cambio que carga el servicio de una labor recién terminada (o [] si no corresponde):
// no es de servicio, no está terminada, ya tiene su servicio, o la planilla todavía no tiene la hoja conectada
// (book.hasServ: el script de Google se actualizó y la app ya leyó la hoja de servicios al menos una vez).
// Si ya hay un servicio del mismo lote, cultivo y campaña, la labor se suma a ese en lugar de crear otro.
export function opsServicio(book, l) {
  if (!book || !book.hasServ || !l || !l['ID labor']) return [];
  if (l['Estado labor'] !== 'Terminado' || !laborEsServicio(l)) return [];
  if (servicioDeLabor(book, l['ID labor'])) return [];
  const grupo = servicioParaAgrupar(book, l);
  if (grupo) return opsSumarAServicio(grupo, l);
  const nov = String(l['Novedades'] || '').trim();
  const datos = {
    'ID servicio': `SER-${uid8()}`,
    'Campaña': l['Campaña'], 'Fecha inicio': l['Fecha inicio'], 'Fecha fin': l['Fecha fin'] || '',
    'Cliente': l['Campo / cliente'] || '', 'Campo / lote': l['Lote'] || '', 'Cultivo': l['Cultivo'] || '', 'Tipo servicio': l['Tarea'],
    'Ha del servicio': isBlank(l['Ha realizadas']) ? null : Number(l['Ha realizadas']),
    'Tipo tarifa': 'Sin definir', 'Entidad comercial informada': 'Pendiente',
    'ID labor vinculada': l['ID labor'], 'Estado servicio': 'Terminado', 'Estado dato': l['Estado dato'] || 'Confirmado',
    'Observaciones': `Cargado automáticamente al terminar la labor. Tarifa y entidad comercial pendientes de definir.${nov ? ` Novedades de la labor: ${nov}` : ''}`,
  };
  const rec = { ...emptyRow('serv'), ...Object.fromEntries(Object.entries(datos).filter(([, v]) => !(v === '' || v === null || v === undefined))) };
  return [{ t: 'append', tk: 'serv', rec }];
}

// ------------------------------------------------------------------ SERVICIOS: tarifas, ingresos y resumen
export const TIPOS_TARIFA = ['USD/ha', '% producción', 'Importe fijo', 'Sin definir'];
export const MONEDAS_SERVICIO = ['USD', 'Maíz', 'Soja', 'Trigo'];
export const CEREALES_SERVICIO = ['Maíz', 'Soja', 'Trigo'];
const numOrNull = (v) => (isBlank(v) ? null : Number(v));

export function servicioSinTarifa(s) { return isBlank(s['Tipo tarifa']) || s['Tipo tarifa'] === 'Sin definir'; }

// Ingreso del servicio. Hace las mismas cuentas que las fórmulas de la planilla (columnas "Ingreso bruto USD" e
// "Ingreso bruto cereal kg") para que se vea al instante, sin esperar a que la hoja se recalcule:
//   USD/ha        → hectáreas × tarifa, en dólares
//   % producción  → kilos de producción base × porcentaje ÷ 100, en kilos del cereal
//   Importe fijo  → la tarifa es el total del servicio: en dólares o en kilos de cereal, según lo que se haya elegido
export function ingresoServicio(s) {
  const t = s['Tipo tarifa'], k = numOrNull(s['Tarifa']), ha = numOrNull(s['Ha del servicio']), base = numOrNull(s['Producción base kg']), mon = s['Moneda / cereal'];
  const nada = { usd: null, kg: null, cereal: '' };
  if (k === null) return nada;
  if (t === 'USD/ha' && ha !== null) return { usd: ha * k, kg: null, cereal: '' };
  if (t === '% producción' && base !== null) return { usd: null, kg: base * k / 100, cereal: mon || s['Cultivo'] || '' };
  if (t === 'Importe fijo' && !isBlank(mon)) return mon === 'USD' ? { usd: k, kg: null, cereal: '' } : { usd: null, kg: k, cereal: mon };
  return nada;
}

export function serviciosDe(book, camp) { return (book.serv || []).filter((s) => !camp || s['Campaña'] === camp); }

// Resumen de una lista de servicios (los mismos totales que el tablero de campaña de la planilla).
// El cereal se separa por especie: sumar kilos de maíz con kilos de soja no tiene sentido.
export function serviciosResumen(list) {
  const r = { n: list.length, ha: 0, usd: 0, cereal: {}, sinTarifa: 0, conTarifa: 0, pendDato: 0 };
  for (const s of list) {
    r.ha += Number(s['Ha del servicio']) || 0;
    if (servicioSinTarifa(s)) r.sinTarifa++; else r.conTarifa++;
    if (s['Estado dato'] === 'Pendiente') r.pendDato++;
    const i = ingresoServicio(s);
    if (i.usd !== null) r.usd += i.usd;
    if (i.kg !== null) { const c = i.cereal || 'Cereal'; r.cereal[c] = (r.cereal[c] || 0) + i.kg; }
  }
  return r;
}

// Cobros que la hoja de facturación tiene registrados para un servicio. "Confirmados" son los que cuenta el tablero.
export function cobrosDeServicio(book, id) { return (book.fact || []).filter((f) => f['ID servicio'] === id); }
export function cobrosConfirmados(list) {
  const ok = list.filter((f) => f['Tipo movimiento'] === 'Cobro recibido' && f['Estado movimiento'] === 'Confirmado');
  return { usd: sum(ok, (f) => f['Importe imputado USD']), kg: sum(ok, (f) => f['Cereal imputado kg']), n: ok.length };
}

// Producciones de un servicio de cosecha: las vinculadas a mano o, si no hay, las del mismo cliente, lote, cultivo y campaña.
export function produccionesDeServicio(book, s) {
  const ids = splitList(s['ID producción vinculada']);
  const prods = book.prod || [];
  const vinc = ids.map((id) => prods.find((p) => p['ID producción'] === id)).filter(Boolean);
  if (vinc.length) return vinc;
  if (s['Tipo servicio'] !== 'Cosecha' || isBlank(s['Cliente']) || isBlank(s['Campo / lote'])) return [];
  return prods.filter((p) => norm(p['Campaña']) === norm(s['Campaña']) && norm(p['Cultivo']) === norm(s['Cultivo']) && norm(p['Campo / cliente']) === norm(s['Cliente']) && norm(p['Lote / condición']) === norm(s['Campo / lote']));
}
// Kilos de producción para un servicio "% producción" (0 si todavía no hay descargas).
export function kgProduccionServicio(book, s) {
  return Math.round(sum(produccionesDeServicio(book, s), (p) => prodView(p, book).kgFinal));
}

// Valor que va a la columna "Tarifa" según el tipo elegido en el formulario (el formulario tiene un campo por tipo).
export function tarifaDeForm(v) {
  return { 'USD/ha': v.tarUsdHa, '% producción': v.tarPct, 'Importe fijo': v.tarFijo }[v['Tipo tarifa']] ?? null;
}

const OBS_AUTO = /\s*Tarifa y entidad comercial pendientes de definir\./;
const mismo = (a, b) => (isBlank(a) && isBlank(b)) || a === b;
// Cambios que guarda el formulario de tarifa, solo en lo que difiere de lo ya cargado. `v` trae los valores del formulario.
export function servicioTarifaSet(s, v) {
  const tipo = v['Tipo tarifa'] || s['Tipo tarifa'] || 'Sin definir';
  const nuevo = { 'Tipo tarifa': tipo, 'Entidad comercial informada': v['Entidad comercial informada'] || s['Entidad comercial informada'] || '' };
  if (tipo === 'Sin definir') nuevo['Tarifa'] = null;
  else {
    nuevo['Tarifa'] = numOrNull(tarifaDeForm({ ...v, 'Tipo tarifa': tipo }));
    nuevo['Moneda / cereal'] = tipo === 'USD/ha' ? 'USD' : (v['Moneda / cereal'] || '');
    if (tipo === '% producción') {
      nuevo['Producción base kg'] = numOrNull(v['Producción base kg']);
      if (!isBlank(v['ID producción vinculada'])) nuevo['ID producción vinculada'] = v['ID producción vinculada'];
    }
  }
  // El texto que deja la carga automática ("tarifa y entidad pendientes") sobra cuando ya están las dos cosas.
  let obs = v['Observaciones'] ?? s['Observaciones'] ?? '';
  if (obs === (s['Observaciones'] || '') && tipo !== 'Sin definir' && nuevo['Entidad comercial informada'] && nuevo['Entidad comercial informada'] !== 'Pendiente') obs = obs.replace(OBS_AUTO, '').trim();
  nuevo['Observaciones'] = obs;
  const set = {};
  for (const [k, val] of Object.entries(nuevo)) if (!mismo(s[k], val)) set[k] = val === undefined ? '' : val;
  return set;
}
