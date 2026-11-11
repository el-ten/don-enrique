// Formularios de la app (misma lógica de campos visibles / obligatorios que AppSheet).
import { store } from './store.js';
import { openForm, confirmDialog, toast } from './ui.js';
import * as R from './rules.js';
import { todayStr, nowTime, isBlank, splitList, joinList, unique, sortEs, fmtKg, fmtDate, fmt2, norm, campaignFor } from './util.js';
import { emptyRow } from './model.js';
import { TABLES } from './schema.js';

const compact = (rec) => Object.fromEntries(Object.entries(rec).filter(([, v]) => !(v === '' || v === null || v === undefined)));
const L = (book, k) => book.cfg[k] || [];
const SI_NO = ['Sí', 'No'];

export function lotOptions(book) {
  return [...book.lotes]
    .sort((a, b) => `${a['Campo']} ${a['Lote físico']}`.localeCompare(`${b['Campo']} ${b['Lote físico']}`, 'es'))
    .map((l) => ({ value: l['ID lote'], label: R.lotLabel(l), sub: `${l['Unidad']}${l['Ha físicas'] ? ' · ' + l['Ha físicas'] + ' ha' : ''}` }));
}
// Opción "Agregar lote nuevo" del selector de lotes: abre el formulario de lote y devuelve el ID del lote creado
// (o undefined si se cerró sin guardar), para que el selector lo deje elegido.
export function loteAdd(book) {
  return {
    label: 'Agregar lote nuevo',
    run: (texto) => new Promise((resolve) => {
      let creado;
      // Unidad sin valor por defecto: define a qué unidad se imputan los costos, así que se elige a propósito.
      loteForm(store.book || book, null, { prefill: { 'Unidad': '', ...(texto ? { 'Lote físico': texto } : {}) }, onCreated: (id) => { creado = id; }, onClose: () => resolve(creado) });
    }),
  };
}
export function laborOptions(book, { onlyCosecha = false } = {}) {
  return [...book.labores].filter((l) => !onlyCosecha || l['Tarea'] === 'Cosecha')
    .sort((a, b) => (b['Fecha inicio'] + (b['Hora inicio'] || '')).localeCompare(a['Fecha inicio'] + (a['Hora inicio'] || '')))
    .map((l) => ({ value: l['ID labor'], label: R.laborTitle(l), sub: `${fmtDate(l['Fecha inicio'])} · ${l['Estado labor']}` }));
}
export function prodOptions(book) {
  return [...book.prod].sort((a, b) => (b['Fecha inicio cosecha'] || '').localeCompare(a['Fecha inicio cosecha'] || ''))
    .map((p) => ({ value: p['ID producción'], label: R.prodName(p), sub: fmtDate(p['Fecha inicio cosecha']) }));
}
export function siloOptions(book, { active = true } = {}) {
  return book.silos.filter((s) => !active || s['Estado'] !== 'Inactivo').map((s) => ({ value: s['ID silo'], label: s['Nombre silo'] || s['ID silo'], sub: s['Tipo'] }));
}
const campOpts = (book) => unique(L(book, 'Campañas')).filter(Boolean);
// 05_LABORES solo acepta las campañas desde la 2.ª fila de la lista de la planilla (ver STRICT en schema.js)
const campOptsLabor = (book) => campOpts(book).slice(1);
const estadoDato = (book) => L(book, 'Estado dato');

// ===================================================================== LABORES
export function laborForm(book, { mode = 'curso', labor = null } = {}) {
  const live = () => store.book || book;
  const edit = mode === 'editar';
  const manual = mode === 'manual' || edit;
  const v0 = labor ? {
    ...labor,
    'Operadores principales': splitList(labor['Operadores principales']),
    'Equipos de apoyo': splitList(labor['Equipos de apoyo']),
    'Operadores de apoyo': splitList(labor['Operadores de apoyo']),
  } : { 'Campaña': R.suggestCampaign({ tarea: '', cultivo: '' }), 'Estado dato': 'Confirmado', 'Fecha inicio': todayStr(), 'Hora inicio': nowTime(), 'Estado labor': 'En curso' };
  if (mode === 'manual') { v0['Estado labor'] = 'Terminado'; v0['Fecha fin'] = todayStr(); v0['Hora fin'] = nowTime(); }
  if (labor) v0._camp = true;
  const isT = (...t) => (v) => t.includes(v['Tarea']);
  const reqCampo = (v) => R.TAREAS_CAMPO.includes(v['Tarea']);
  const machineTasks = ['Siembra', 'Cosecha', 'Pulverización', 'Fertilización', 'Traslado', 'Mantenimiento', 'Carga de combustible', 'Entrega de cereal'];
  const sugCamp = (v, set) => { if (!v._camp) set('Campaña', R.suggestCampaign({ tarea: v['Tarea'], cultivo: v['Cultivo'], fecha: v['Fecha inicio'] })); };

  const fields = [
    { name: 'Tarea', label: 'Tarea', type: 'chips', options: L(book, 'Tareas'), required: true, onChange: (v, set) => { sugCamp(v, set); } },
    { name: 'ID lote vinculado', label: 'Lote', type: 'ref', options: () => lotOptions(live()), add: loteAdd(book), required: reqCampo, show: (v) => !!v['ID lote vinculado'] || ['Siembra', 'Cosecha', 'Pulverización', 'Fertilización', 'Traslado', 'Entrega de cereal', 'Otra'].includes(v['Tarea']), placeholder: 'Elegir campo y lote…' },
    { name: 'Cultivo', label: 'Cultivo', type: 'chips', options: L(book, 'Cultivos'), required: reqCampo, show: (v) => !!v['Cultivo'] || ['Siembra', 'Cosecha', 'Pulverización', 'Fertilización', 'Entrega de cereal', 'Venta de cereal'].includes(v['Tarea']), onChange: (v, set) => sugCamp(v, set) },
    { name: 'Variedad / híbrido', label: 'Variedad / híbrido', type: 'text', show: isT('Siembra', 'Cosecha'), placeholder: 'Opcional' },
    { name: 'Máquina principal', label: 'Máquina principal', type: 'select', options: () => R.machineOptions(book), required: reqCampo, show: isT(...machineTasks) },
    { name: 'Implemento / equipo', label: 'Implemento / equipo', type: 'select', options: (v) => R.implementOptions(book, v['Tarea']), required: reqCampo, show: isT('Siembra', 'Cosecha', 'Pulverización', 'Fertilización', 'Mantenimiento', 'Traslado') },
    { name: 'Operadores principales', label: 'Operadores principales', type: 'multi', options: () => L(book, 'Operadores'), required: isT(...machineTasks), show: (v) => (v['Operadores principales'] || []).length > 0 || machineTasks.includes(v['Tarea']) },
    { name: 'Equipos de apoyo', label: 'Equipos de apoyo', type: 'multi', options: () => R.supportEquipOptions(book), show: isT('Siembra', 'Cosecha', 'Pulverización', 'Fertilización', 'Traslado', 'Carga de combustible', 'Entrega de cereal') },
    { name: 'Operadores de apoyo', label: 'Operadores de apoyo', type: 'multi', options: () => L(book, 'Operadores'), show: (v) => (v['Operadores de apoyo'] || []).length > 0 || machineTasks.includes(v['Tarea']) },
    { type: 'section', label: 'Datos de la campaña' },
    { name: 'Campaña', label: 'Campaña', type: 'select', options: () => campOptsLabor(book), required: true, onChange: (v, set, nv) => { set('_camp', true); } },
  ];
  if (manual) {
    fields.push(
      { type: 'section', label: 'Fechas y resultados' },
      { name: 'Fecha inicio', label: 'Fecha de inicio', type: 'date', required: true },
      { name: 'Hora inicio', label: 'Hora de inicio', type: 'time', required: true },
      { name: 'Fecha fin', label: 'Fecha de fin', type: 'date' },
      { name: 'Hora fin', label: 'Hora de fin', type: 'time' },
      { name: 'Pausas / demoras h', label: 'Pausas y demoras', type: 'dur', hint: 'Tiempo total parado, en horas y minutos (ej. 1:30)' },
      { name: 'Ha realizadas', label: 'Hectáreas realizadas', type: 'number', unit: 'ha', valid: (v, x) => (x < 0 ? 'No puede ser negativo' : null) },
      { name: 'Estado labor', label: 'Estado de la labor', type: 'select', options: () => L(book, 'Estado labor'), required: true },
      { name: 'Estado dato', label: 'Estado del dato', type: 'chips', options: () => estadoDato(book), required: true },
    );
    if (edit) fields.push({ name: 'Coeficiente combustible L/ha', label: 'Coeficiente de combustible', type: 'number', unit: 'L/ha' });
  }
  fields.push({ name: 'Novedades', label: 'Novedades', type: 'textarea', required: (v) => v['Tarea'] === 'Otra', placeholder: 'Roturas, observaciones, lo que haya pasado…' });

  return openForm({
    title: edit ? 'Editar labor' : mode === 'manual' ? 'Cargar labor terminada' : 'Iniciar labor',
    subtitle: edit ? null : mode === 'manual' ? 'Para registrar un trabajo que ya se hizo.' : 'Se registra con la fecha y hora de ahora. Después podés pausarla y finalizarla.',
    submitLabel: edit ? 'Guardar cambios' : mode === 'manual' ? 'Guardar labor' : 'Iniciar ahora',
    fields, values: v0,
    onSubmit: async (v) => {
      const lote = v['ID lote vinculado'] ? live().lotes.find((l) => l['ID lote'] === v['ID lote vinculado']) : null;
      const open = R.ESTADOS_ABIERTOS.includes(v['Estado labor']);
      const busy = open ? R.machineBusy(book, v['Máquina principal'], labor && labor['ID labor']) : null;
      if (busy && !(await confirmDialog({ title: 'La máquina ya está en uso', message: `${v['Máquina principal']} tiene abierta la labor "${R.laborTitle(busy)}" del ${fmtDate(busy['Fecha inicio'])}. ¿Querés iniciar esta igual?`, confirmLabel: 'Iniciar igual' }))) return false;
      const base = {
        'Campaña': v['Campaña'], 'Tarea': v['Tarea'], 'Cultivo': v['Cultivo'] || '', 'Variedad / híbrido': v['Variedad / híbrido'] || '',
        'Máquina principal': v['Máquina principal'] || '', 'Implemento / equipo': v['Implemento / equipo'] || '',
        'Operadores principales': joinList(v['Operadores principales']), 'Equipos de apoyo': joinList(v['Equipos de apoyo']),
        'Operadores de apoyo': joinList(v['Operadores de apoyo']), 'Novedades': v['Novedades'] || '',
        'ID lote vinculado': v['ID lote vinculado'] || '',
        ...(lote ? { 'Unidad': lote['Unidad'], 'Campo / cliente': lote['Campo'], 'Lote': lote['Lote físico'] } : {}),
      };
      if (manual) Object.assign(base, {
        'Fecha inicio': v['Fecha inicio'], 'Hora inicio': v['Hora inicio'], 'Fecha fin': v['Fecha fin'] || '', 'Hora fin': v['Hora fin'] || '',
        'Pausas / demoras h': isBlank(v['Pausas / demoras h']) ? null : v['Pausas / demoras h'], 'Ha realizadas': isBlank(v['Ha realizadas']) ? null : v['Ha realizadas'],
        'Estado labor': v['Estado labor'], 'Estado dato': v['Estado dato'],
        ...(edit ? { 'Coeficiente combustible L/ha': isBlank(v['Coeficiente combustible L/ha']) ? null : v['Coeficiente combustible L/ha'] } : {}),
      });
      if (edit) {
        const set = {};
        for (const [k, val] of Object.entries(base)) {
          const old = labor[k];
          if ((isBlank(old) && isBlank(val)) || old === val) continue;
          set[k] = val;
        }
        if (!Object.keys(set).length) { toast('No hubo cambios', 'info'); return; }
        // si con este cambio la labor pasa a "Terminado" y es de servicio, también se carga en la hoja de servicios
        const serv = labor['Estado labor'] !== 'Terminado' && set['Estado labor'] === 'Terminado' ? R.opsServicio(live(), { ...labor, ...set }) : [];
        await store.enqueue([{ t: 'update', tk: 'labores', key: labor['ID labor'], set }, ...serv]);
        toast(serv.length ? `Cambios guardados y ${serv[0].t === 'update' ? 'labor sumada a su servicio' : 'servicio cargado'}` : 'Cambios guardados');
      } else {
        const rec = compact({
          'ID labor': R.nuevoId(live(), 'labores', base), ...base,
          ...(manual ? {} : { 'Fecha inicio': todayStr(), 'Hora inicio': nowTime(), 'Estado labor': 'En curso', 'Estado dato': 'Confirmado' }),
        });
        const full = { ...emptyRow('labores'), ...rec };
        const serv = manual ? R.opsServicio(live(), full) : [];
        await store.enqueue([{ t: 'append', tk: 'labores', rec: full }, ...serv]);
        toast(manual ? (serv.length ? `Labor guardada y ${serv[0].t === 'update' ? 'sumada a su servicio' : 'servicio cargado'}` : 'Labor guardada') : 'Labor iniciada');
      }
    },
  });
}

export function finalizarForm(labor) {
  return openForm({
    title: 'Finalizar labor', subtitle: `${R.laborTitle(labor)}`,
    submitLabel: 'Finalizar labor', tone: 'primary',
    fields: [{ name: 'ha', label: 'Hectáreas realizadas', type: 'number', unit: 'ha', required: true, valid: (v, x) => (x <= 0 ? 'Tiene que ser mayor a 0' : null), hint: 'Se guarda la fecha y hora de fin de ahora.' }],
    values: { ha: labor['Ha realizadas'] || null },
    onSubmit: async (v) => {
      const ops = R.labOpsFinalizar(labor, v.ha);
      // labor de servicio: se carga sola en la hoja de servicios (R.opsServicio devuelve [] si no corresponde)
      const serv = R.opsServicio(store.book, { ...labor, ...ops[0].set });
      await store.enqueue([...ops, ...serv]);
      toast(serv.length ? `Labor finalizada y ${serv[0].t === 'update' ? 'sumada a su servicio' : 'cargada en Servicios'}` : 'Labor finalizada');
    },
  });
}

// ===================================================================== CARGAS DE CAMIONES
export function cargaForm(book) {
  const cos = laborOptions(book, { onlyCosecha: true });
  const defLab = cos[0] ? cos[0].value : '';
  const lab0 = defLab ? book.labores.find((l) => l['ID labor'] === defLab) : null;
  const plates = unique(book.cargas.slice().reverse().map((c) => c['Camión / patente']).filter(Boolean)).slice(0, 6);
  const destinos = unique(['AFA', 'ACA', 'Otro acopio', ...book.cargas.map((c) => c['Destino']).filter(Boolean)]);
  return openForm({
    title: 'Nueva carga de camión', subtitle: 'Abrí la carga, sumale las descargas y cerrala cuando el camión sale.',
    submitLabel: 'Abrir carga',
    fields: [
      { name: 'Camión / patente', label: 'Camión / patente', type: 'text', upper: true, required: true, suggest: () => plates, placeholder: 'Ej. AB123CD' },
      { name: 'Cultivo', label: 'Cultivo', type: 'chips', options: ['Trigo', 'Soja', 'Maíz', 'Centeno'], required: true },
      { name: 'Destino', label: 'Destino', type: 'select', options: destinos, required: true },
      { name: 'Fecha', label: 'Fecha', type: 'date', required: true },
      { name: 'Campaña', label: 'Campaña', type: 'select', options: () => campOpts(book), required: true },
      { name: 'Observaciones', label: 'Observaciones', type: 'textarea', rows: 2 },
      { type: 'section', label: 'Origen del cereal' },
      { name: 'ID labor vinculada', label: 'Labor de cosecha', type: 'ref', options: () => cos, empty: 'No hay labores de cosecha cargadas', onChange: (v, set, nv) => { const l = book.labores.find((x) => x['ID labor'] === nv); if (l) { if (l['Cultivo']) set('Cultivo', l['Cultivo']); if (l['Campaña']) set('Campaña', l['Campaña']); } } },
      { name: 'ID producción vinculada', label: 'Producción', type: 'ref', options: () => prodOptions(book), hint: 'Opcional: si no la elegís, se vincula por campaña, cultivo, campo y lote.' },
      { name: 'Computa producción', label: '¿Suma a la producción?', type: 'chips', options: SI_NO },
      { name: 'Documento / origen', label: 'Documento / origen', type: 'select', options: ['Cosecha directa del lote', 'Carta de porte', 'Remito', 'Ticket de balanza', 'Traslado entre silos', 'Otro'] },
    ],
    values: { 'Fecha': todayStr(), 'Campaña': lab0 && lab0['Campaña'] ? lab0['Campaña'] : R.suggestCampaign({ tarea: 'Cosecha', cultivo: lab0 ? lab0['Cultivo'] : '' }), 'Cultivo': lab0 && lab0['Cultivo'] ? lab0['Cultivo'] : 'Trigo', 'ID labor vinculada': defLab, 'Computa producción': 'Sí', 'Destino': destinos[0] },
    onSubmit: async (v) => {
      const rec = compact(R.cargaNewRec(book, v));
      await store.enqueue([{ t: 'append', tk: 'cargas', rec: { ...emptyRow('cargas'), ...rec } }]);
      toast('Carga abierta');
    },
  });
}

export function descargaForm(carga) {
  const book = store.book;
  const monos = L(book, 'Monotolva utilizada');
  const cv = R.cargaView(carga, book);
  return openForm({
    title: 'Agregar descarga', subtitle: `${carga['Camión / patente']} · ${carga['Cultivo']} → ${carga['Destino']} · hoy lleva ${fmtKg(cv.kgRec)}`,
    submitLabel: 'Guardar descarga',
    fields: [
      { name: 'Kg asignados', label: 'Kilos descargados', type: 'number', unit: 'kg', required: true, valid: (v, x) => (x <= 0 ? 'Tiene que ser mayor a 0' : null), hint: (v) => (v['Kg asignados'] ? `Total de la carga: ${fmtKg(cv.kgRec + Number(v['Kg asignados']))}` : '') },
      { name: 'Monotolva utilizada', label: 'Monotolva utilizada', type: 'chips', options: monos },
      { name: 'ID silo', label: 'Silo (si también va a un silo)', type: 'select', options: () => siloOptions(book), hint: 'Opcional' },
      { name: 'Observaciones', label: 'Observaciones', type: 'textarea', rows: 2 },
    ],
    values: {},
    onSubmit: async (v) => {
      const fresh = store.book.cargas.find((c) => c['ID carga'] === carga['ID carga']);
      if (!fresh || fresh['Estado carga'] !== 'En carga') { toast('La carga ya no está abierta', 'warn'); return false; }
      await store.enqueue([{ t: 'append', tk: 'movs', rec: compact(descRec(fresh, v)) }]);
      toast('Descarga guardada');
    },
  });
}
const descRec = (c, v) => ({ ...emptyRow('movs'), ...R.descargaNewRec(c, v) });

export function ticketForm(carga) {
  const book = store.book;
  const cv = R.cargaView(carga, book);
  return openForm({
    title: 'Cargar ticket', subtitle: `${carga['Camión / patente']} · ${carga['Cultivo']} → ${carga['Destino']} · cargados ${fmtKg(cv.kgRec)}`,
    submitLabel: 'Guardar ticket',
    fields: [
      { name: 'peso', label: 'Peso del ticket', type: 'number', unit: 'kg', required: true, valid: (v, x) => (x <= 0 ? 'Tiene que ser mayor a 0' : null) },
      { name: 'numero', label: 'Número de ticket', type: 'text' },
      { type: 'note', tone: 'info', ic: 'scale', text: (v) => isBlank(v.peso) ? `Se concilia solo si la diferencia es de hasta ${R.TOL_KG} kg.` : (Math.abs(v.peso - cv.kgRec) <= R.TOL_KG ? `Diferencia ${fmtKg(v.peso - cv.kgRec)}: dentro de la tolerancia, queda Conciliado.` : `Diferencia ${fmtKg(v.peso - cv.kgRec)}: supera ${R.TOL_KG} kg, queda para revisar.`) , show: () => true },
      { name: 'obs', label: 'Observaciones', type: 'textarea', rows: 2 },
    ],
    values: { peso: carga['Peso ticket kg'], numero: carga['Número ticket'] || '', obs: carga['Observaciones'] || '' },
    onSubmit: async (v) => {
      const fresh = store.book.cargas.find((c) => c['ID carga'] === carga['ID carga']);
      await store.enqueue(R.cargaOpsTicket(fresh, store.book, { peso: v.peso, numero: v.numero, obs: v.obs !== (carga['Observaciones'] || '') ? v.obs : '' }));
      toast('Ticket guardado');
    },
  });
}

// ===================================================================== SILOS
export function siloForm(book, silo = null) {
  return openForm({
    title: silo ? 'Editar silo' : 'Nuevo silo', submitLabel: silo ? 'Guardar cambios' : 'Crear silo',
    fields: [
      { name: 'Nombre silo', label: 'Nombre', type: 'text', required: true },
      { name: 'Tipo', label: 'Tipo', type: 'chips', options: ['Silo de chapa', 'Silobolsa'], required: true },
      { name: 'Capacidad kg', label: 'Capacidad', type: 'number', unit: 'kg', hint: 'Sirve para calcular el % de llenado.' },
      { name: 'Estado', label: 'Estado', type: 'chips', options: ['Activo', 'Inactivo'], required: true },
      { name: 'Estado dato', label: 'Estado del dato', type: 'chips', options: () => estadoDato(book) },
      { name: 'Observaciones', label: 'Observaciones', type: 'textarea', rows: 2 },
    ],
    values: silo ? { ...silo } : { 'Tipo': 'Silo de chapa', 'Estado': 'Activo', 'Estado dato': 'Confirmado' },
    onSubmit: async (v) => {
      const data = { 'Nombre silo': v['Nombre silo'], 'Tipo': v['Tipo'], 'Capacidad kg': isBlank(v['Capacidad kg']) ? null : v['Capacidad kg'], 'Estado': v['Estado'], 'Estado dato': v['Estado dato'] || '', 'Observaciones': v['Observaciones'] || '' };
      if (silo) {
        const set = diff(silo, data);
        if (!Object.keys(set).length) return;
        await store.enqueue([{ t: 'update', tk: 'silos', key: silo['ID silo'], set }]);
      } else {
        await store.enqueue([{ t: 'append', tk: 'silos', rec: { ...emptyRow('silos'), 'ID silo': R.nuevoId(store.book || book, 'silos'), ...compact(data) } }]);
      }
      toast('Silo guardado');
    },
  });
}

export function entradaSiloForm(silo) {
  const book = store.book;
  const hasProd = (v) => !!v['ID producción vinculada'];
  return openForm({
    title: 'Entrada a silo', subtitle: `${silo['Nombre silo']} · ${silo['Tipo']}`, submitLabel: 'Guardar entrada',
    fields: [
      { name: 'Fecha', label: 'Fecha', type: 'date', required: true },
      { name: 'Kg asignados', label: 'Kilos que entran', type: 'number', unit: 'kg', required: true, valid: (v, x) => (x <= 0 ? 'Tiene que ser mayor a 0' : null) },
      { name: 'ID producción vinculada', label: 'Producción (lote cosechado)', type: 'ref', options: () => prodOptions(book), hint: 'Si la elegís, los kilos se suman a esa producción.' },
      { name: 'Campaña', label: 'Campaña', type: 'select', options: () => campOpts(book), show: (v) => !hasProd(v) },
      { name: 'Campo / cliente', label: 'Campo / cliente', type: 'select', options: () => sortEs(unique(book.lotes.map((l) => l['Campo']))), show: (v) => !hasProd(v) },
      { name: 'Lote', label: 'Lote', type: 'select', options: (v) => sortEs(unique(book.lotes.filter((l) => !v['Campo / cliente'] || l['Campo'] === v['Campo / cliente']).map((l) => l['Lote físico']))), show: (v) => !hasProd(v) },
      { name: 'Cultivo', label: 'Cultivo', type: 'chips', options: () => L(book, 'Cultivos'), show: (v) => !hasProd(v) },
      { name: 'Documento / origen', label: 'Documento / origen', type: 'select', options: ['Cosecha directa del lote', 'Carta de porte', 'Remito', 'Ticket de balanza', 'Traslado entre silos', 'Otro'] },
      { name: 'Observaciones', label: 'Observaciones', type: 'textarea', rows: 2 },
    ],
    values: { 'Fecha': todayStr(), 'Campaña': R.suggestCampaign({ tarea: 'Cosecha', cultivo: '' }) },
    onSubmit: async (v) => {
      await store.enqueue([{ t: 'append', tk: 'movs', rec: compact({ ...emptyRow('movs'), ...R.entradaSiloRec(silo, store.book, v) }) }]);
      toast('Entrada guardada');
    },
  });
}

export function salidaSiloForm(silo) {
  const book = store.book;
  const sv = R.siloView(silo, book);
  return openForm({
    title: 'Salida de silo', subtitle: `${silo['Nombre silo']} · stock actual ${fmtKg(sv.stock)}`, submitLabel: 'Guardar salida',
    fields: [
      { name: 'Fecha', label: 'Fecha', type: 'date', required: true },
      { name: 'Kg asignados', label: 'Kilos que salen', type: 'number', unit: 'kg', required: true, valid: (v, x) => (x <= 0 ? 'Tiene que ser mayor a 0' : null), hint: (v) => (v['Kg asignados'] ? `Quedan ${fmtKg(sv.stock - Number(v['Kg asignados']))}` : '') },
      { name: 'Destino / ubicación', label: 'Destino', type: 'text', suggest: () => unique(book.movs.filter((m) => m['Tipo de movimiento'] === 'Despacho de stock').map((m) => m['Destino / ubicación'])).slice(0, 5) },
      { name: 'Documento / origen', label: 'Documento / origen', type: 'select', options: ['Carta de porte', 'Remito', 'Ticket de balanza', 'Traslado entre silos', 'Otro'] },
      { name: 'Observaciones', label: 'Observaciones', type: 'textarea', rows: 2 },
    ],
    values: { 'Fecha': todayStr() },
    onSubmit: async (v) => {
      if (Number(v['Kg asignados']) > sv.stock && !(await confirmDialog({ title: 'Sale más de lo que hay', message: `El stock calculado es ${fmtKg(sv.stock)} y estás sacando ${fmtKg(v['Kg asignados'])}. ¿Guardar igual?`, confirmLabel: 'Guardar igual' }))) return false;
      await store.enqueue([{ t: 'append', tk: 'movs', rec: compact({ ...emptyRow('movs'), ...R.salidaSiloRec(silo, v) }) }]);
      toast('Salida guardada');
    },
  });
}

// ===================================================================== PRODUCCIÓN
export function prodForm(book, prod = null) {
  const edit = !!prod;
  return openForm({
    title: edit ? 'Editar producción' : 'Nueva producción', submitLabel: edit ? 'Guardar cambios' : 'Crear producción',
    subtitle: 'Un registro por lote cosechado. Los kilos se calculan solos con las descargas.',
    fields: [
      { name: 'ID lote', label: 'Lote', type: 'ref', options: () => lotOptions(store.book || book), add: loteAdd(book), placeholder: 'Elegir campo y lote…', hint: 'Completa unidad, campo y lote.', onChange: (v, set, nv) => { const l = (store.book || book).lotes.find((x) => x['ID lote'] === nv); if (l) { set('Unidad', l['Unidad']); set('Campo / cliente', l['Campo']); set('Lote / condición', l['Lote físico']); if (isBlank(v['Ha cosechadas']) && l['Ha físicas']) set('Ha cosechadas', l['Ha físicas']); } } },
      { name: 'Campo / cliente', label: 'Campo / cliente', type: 'text', required: true },
      { name: 'Lote / condición', label: 'Lote / condición', type: 'text', required: true },
      { name: 'Unidad', label: 'Unidad', type: 'select', options: () => L(book, 'Unidades'), required: true },
      { name: 'Cultivo', label: 'Cultivo', type: 'chips', options: ['Trigo', 'Maíz', 'Soja', 'Centeno'], required: true },
      { name: 'Campaña', label: 'Campaña', type: 'select', options: () => campOpts(book), required: true },
      { name: 'Tipo / época', label: 'Tipo / época', type: 'select', options: () => L(book, 'Tipo / época') },
      { name: 'Ha cosechadas', label: 'Hectáreas cosechadas', type: 'number', unit: 'ha', required: true },
      { name: 'Fecha inicio cosecha', label: 'Inicio de cosecha', type: 'date', required: true },
      { name: 'Fecha fin cosecha', label: 'Fin de cosecha', type: 'date', required: true },
      { name: 'ID labor vinculada', label: 'Labor de cosecha', type: 'ref', options: () => laborOptions(book, { onlyCosecha: true }) },
      { type: 'section', label: 'Dato manual (opcional)' },
      { name: 'Producción kg', label: 'Producción total', type: 'number', unit: 'kg', hint: 'Dejalo vacío para usar la suma de las descargas.' },
      { name: 'Estado dato', label: 'Estado del dato', type: 'chips', options: () => estadoDato(book) },
      { name: 'Observaciones', label: 'Observaciones', type: 'textarea', rows: 2 },
    ],
    values: prod ? { ...prod } : { 'Campaña': R.suggestCampaign({ tarea: 'Cosecha', cultivo: 'Soja' }), 'Fecha inicio cosecha': todayStr(), 'Fecha fin cosecha': todayStr(), 'Tipo / época': 'Sin distinguir', 'Estado dato': 'Confirmado' },
    onSubmit: async (v) => {
      const data = { 'Campaña': v['Campaña'], 'Fecha inicio cosecha': v['Fecha inicio cosecha'], 'Fecha fin cosecha': v['Fecha fin cosecha'], 'Unidad': v['Unidad'], 'Campo / cliente': v['Campo / cliente'], 'Lote / condición': v['Lote / condición'], 'Cultivo': v['Cultivo'], 'Tipo / época': v['Tipo / época'] || '', 'Ha cosechadas': isBlank(v['Ha cosechadas']) ? null : v['Ha cosechadas'], 'Producción kg': isBlank(v['Producción kg']) ? null : v['Producción kg'], 'ID labor vinculada': v['ID labor vinculada'] || '', 'Estado dato': v['Estado dato'] || '', 'Observaciones': v['Observaciones'] || '' };
      if (edit) {
        const set = diff(prod, data);
        if (!Object.keys(set).length) return;
        await store.enqueue([{ t: 'update', tk: 'prod', key: prod['ID producción'], set }]);
      } else {
        await store.enqueue([{ t: 'append', tk: 'prod', rec: { ...emptyRow('prod'), 'ID producción': R.nuevoId(store.book || book, 'prod', data), ...compact(data) } }]);
      }
      toast('Producción guardada');
    },
  });
}

// ===================================================================== SERVICIOS (tarifa)
// Carga o corrige la tarifa de un servicio. El ingreso lo calcula la planilla con sus fórmulas; la app muestra el mismo
// resultado al instante (R.ingresoServicio).
export function servicioForm(book, s) {
  const live = () => store.book || book;
  const esCosecha = s['Tipo servicio'] === 'Cosecha';
  const kgSug = R.kgProduccionServicio(live(), s);
  const prods = R.produccionesDeServicio(live(), s);
  const tipoIs = (...t) => (v) => t.includes(v['Tipo tarifa']);
  const tipo0 = isBlank(s['Tipo tarifa']) ? 'Sin definir' : s['Tipo tarifa'];
  const v0 = {
    'Tipo tarifa': tipo0, 'Moneda / cereal': s['Moneda / cereal'] || '', 'Producción base kg': s['Producción base kg'],
    'ID producción vinculada': s['ID producción vinculada'] || '', 'Entidad comercial informada': s['Entidad comercial informada'] || 'Pendiente',
    'Observaciones': s['Observaciones'] || '', tarUsdHa: null, tarPct: null, tarFijo: null,
  };
  const campo = { 'USD/ha': 'tarUsdHa', '% producción': 'tarPct', 'Importe fijo': 'tarFijo' }[tipo0];
  if (campo) v0[campo] = s['Tarifa'];
  // Un servicio de cosecha a porcentaje ya trae los kilos y la producción del lote si la app los encuentra.
  if (tipo0 === '% producción' && esCosecha) {
    if (isBlank(v0['Producción base kg']) && kgSug > 0) v0['Producción base kg'] = kgSug;
    if (!v0['ID producción vinculada'] && prods.length === 1) v0['ID producción vinculada'] = prods[0]['ID producción'];
  }
  const prodOpts = () => {
    const opts = prodOptions(live());
    const cur = s['ID producción vinculada'];
    return cur && !opts.some((o) => o.value === cur) ? [{ value: cur, label: cur }, ...opts] : opts; // varias producciones juntas ("A, B")
  };
  const merged = (v) => ({ ...s, 'Tipo tarifa': v['Tipo tarifa'], 'Tarifa': R.tarifaDeForm(v), 'Moneda / cereal': v['Tipo tarifa'] === 'USD/ha' ? 'USD' : v['Moneda / cereal'], 'Producción base kg': v['Producción base kg'] });
  const ingresoTxt = (v) => { const i = R.ingresoServicio(merged(v)); return i.usd !== null ? `USD ${fmt2(i.usd)}` : i.kg !== null ? `${fmtKg(i.kg)} de ${String(i.cereal).toLowerCase()}` : ''; };
  const lugar = [s['Cliente'], s['Campo / lote']].filter(Boolean).join(' — ');

  return openForm({
    title: 'Tarifa del servicio', submitLabel: 'Guardar tarifa',
    subtitle: `${s['Tipo servicio']} · ${lugar || 'Sin cliente'}${isBlank(s['Ha del servicio']) ? '' : ` · ${fmt2(s['Ha del servicio'])} ha`}`,
    fields: [
      { name: 'Tipo tarifa', label: 'Cómo se cobra', type: 'chips', options: R.TIPOS_TARIFA, required: true, onChange: (v, set, nv) => {
        if (nv === 'USD/ha') set('Moneda / cereal', 'USD');
        else if (nv === '% producción') {
          if (!R.CEREALES_SERVICIO.includes(v['Moneda / cereal'])) set('Moneda / cereal', R.CEREALES_SERVICIO.includes(s['Cultivo']) ? s['Cultivo'] : '');
          if (esCosecha) {
            if (isBlank(v['Producción base kg']) && kgSug > 0) set('Producción base kg', kgSug);
            if (!v['ID producción vinculada'] && prods.length === 1) set('ID producción vinculada', prods[0]['ID producción']);
          }
        } else if (nv === 'Importe fijo' && isBlank(v['Moneda / cereal'])) set('Moneda / cereal', 'USD');
      } },
      { name: 'Moneda / cereal', label: 'Se cobra en', type: 'chips', options: (v) => (v['Tipo tarifa'] === '% producción' ? R.CEREALES_SERVICIO : R.MONEDAS_SERVICIO), show: tipoIs('% producción', 'Importe fijo'), required: true },
      { name: 'tarUsdHa', label: 'Tarifa por hectárea', type: 'number', unit: 'USD/ha', show: tipoIs('USD/ha'), required: true, valid: (v, x) => (x <= 0 ? 'Tiene que ser mayor a 0' : null) },
      { name: 'tarPct', label: 'Porcentaje de la producción', type: 'number', unit: '%', show: tipoIs('% producción'), required: true, valid: (v, x) => (x <= 0 ? 'Tiene que ser mayor a 0' : x > 100 ? 'No puede pasar de 100' : null) },
      { name: 'tarFijo', label: 'Importe total del servicio', type: 'number', show: tipoIs('Importe fijo'), required: true, valid: (v, x) => (x <= 0 ? 'Tiene que ser mayor a 0' : null), hint: (v) => (v['Moneda / cereal'] === 'USD' ? 'En dólares, por todo el servicio.' : v['Moneda / cereal'] ? `En kilos de ${v['Moneda / cereal'].toLowerCase()}, por todo el servicio.` : 'Elegí primero en qué se cobra.') },
      { name: 'Producción base kg', label: 'Kilos de producción', type: 'number', unit: 'kg', show: tipoIs('% producción'), hint: 'Sobre estos kilos se calcula el porcentaje. Sin este dato no se calcula el ingreso.', valid: (v, x) => (x <= 0 ? 'Tiene que ser mayor a 0' : null) },
      { name: 'ID producción vinculada', label: 'Producción de ese lote', type: 'ref', options: prodOpts, show: (v) => esCosecha && v['Tipo tarifa'] === '% producción', placeholder: 'Opcional', onChange: (v, set, nv) => {
        const p = nv ? live().prod.find((x) => x['ID producción'] === nv) : null;
        const kg = p ? Math.round(R.prodView(p, live()).kgFinal) : 0;
        if (kg > 0) set('Producción base kg', kg);
      }, hint: 'Al elegirla se completan los kilos con lo cosechado.' },
      { type: 'note', tone: 'info', ic: 'coin', text: (v) => `Ingreso: ${ingresoTxt(v)}`, show: (v) => v['Tipo tarifa'] !== 'Sin definir' && !!ingresoTxt(v) },
      { type: 'note', tone: 'warn', ic: 'alert', text: 'Falta el dato para calcular el ingreso.', show: (v) => v['Tipo tarifa'] !== 'Sin definir' && !isBlank(R.tarifaDeForm(v)) && !ingresoTxt(v) },
      { type: 'section', label: 'Facturación' },
      { name: 'Entidad comercial informada', label: 'Quién factura', type: 'chips', options: () => L(book, 'Entidad comercial') },
      { name: 'Observaciones', label: 'Observaciones', type: 'textarea', rows: 3 },
    ],
    values: v0,
    onSubmit: async (v) => {
      const fresh = (live().serv || []).find((x) => x['ID servicio'] === s['ID servicio']) || s;
      const set = R.servicioTarifaSet(fresh, v);
      if (!Object.keys(set).length) { toast('No hubo cambios', 'info'); return; }
      await store.enqueue([{ t: 'update', tk: 'serv', key: s['ID servicio'], set }]);
      toast('Tarifa guardada');
    },
  });
}

// ===================================================================== COMBUSTIBLE
export function combustibleForm(book, mov = null, preset = {}) {
  const edit = !!mov;
  const carga = (v) => v['Tipo movimiento'] === 'Carga a maquinaria';
  const needOrigen = (v) => ['Carga a maquinaria', 'Transferencia interna', 'Salida a tercero', 'Ajuste negativo'].includes(v['Tipo movimiento']);
  const needDestino = (v) => ['Carga a maquinaria', 'Transferencia interna', 'Compra / ingreso', 'Devolución', 'Stock inicial', 'Ajuste positivo'].includes(v['Tipo movimiento']);
  const tanques = ['Tanque fijo', 'Tanque móvil'];
  const assets = sortEs(unique(book.activos.filter((a) => ['Tractor', 'Cosechadora', 'Vehículo', 'Tanque de combustible'].includes(a['Categoría'])).map((a) => a['Nombre corto']).filter(Boolean)));
  const fromLab = (v, set, nv) => { const l = book.labores.find((x) => x['ID labor'] === nv); if (l) { set('Unidad económica', l['Unidad']); set('Campo / cliente', l['Campo / cliente']); set('Lote', l['Lote']); } };
  const v0 = mov ? { ...mov } : { 'Campaña': R.suggestCampaign({}), 'Fecha': todayStr(), 'Hora': nowTime(), 'Producto': 'Gasoil', 'Estado dato': 'Confirmado', 'Documento / origen': 'Registro operativo', ...preset };
  return openForm({
    title: edit ? 'Editar movimiento' : 'Movimiento de combustible', submitLabel: edit ? 'Guardar cambios' : 'Guardar movimiento',
    fields: [
      { name: 'Tipo movimiento', label: 'Tipo de movimiento', type: 'select', options: () => L(book, 'Tipo movimiento combustible'), required: true, onChange: (v, set) => { if (v['Tipo movimiento'] === 'Carga a maquinaria') { if (v['Activo abastecido']) set('Destino', v['Activo abastecido']); } else if (assets.includes(v['Destino'])) set('Destino', ''); } },
      { name: 'Litros', label: 'Litros', type: 'number', unit: 'L', required: true, valid: (v, x) => (x <= 0 ? 'Tiene que ser mayor a 0' : null) },
      { name: 'Producto', label: 'Producto', type: 'chips', options: () => L(book, 'Producto combustible'), required: true },
      { name: 'Origen', label: 'Sale del tanque', type: 'chips', options: tanques, show: (v) => !!v['Origen'] || needOrigen(v), required: needOrigen },
      { name: 'Activo abastecido', label: 'Equipo que se carga', type: 'select', options: assets, show: (v) => !!v['Activo abastecido'] || carga(v), required: carga, onChange: (v, set, nv) => { if (carga(v)) set('Destino', nv); } },
      { name: 'Destino', label: 'Entra al tanque', type: 'chips', options: (v) => (v['Tipo movimiento'] === 'Transferencia interna' ? tanques.filter((t) => t !== v['Origen']) : tanques), show: (v) => !carga(v) && (!!v['Destino'] || needDestino(v)), required: (v) => needDestino(v) && !carga(v) },
      { name: 'ID labor vinculada', label: 'Labor vinculada', type: 'ref', options: () => laborOptions(book), show: (v) => !!v['ID labor vinculada'] || carga(v), required: (v) => carga(v) && v['Computa consumo labor'] === 'Sí', onChange: fromLab, placeholder: 'Opcional' },
      { name: 'Computa consumo labor', label: '¿Es el consumo de esa labor?', type: 'chips', options: ['Sí', 'No', 'Pendiente por verificar'], show: (v) => !!v['Computa consumo labor'] || carga(v), required: carga, hint: 'Elegí "No" si fue una carga de tanque y no el consumo exacto de la labor.' },
      { type: 'note', tone: 'info', ic: 'fuel', text: (v) => impactoTexto(v), show: (v) => !isBlank(v['Litros']) && !!v['Tipo movimiento'] },
      { type: 'section', label: 'Datos adicionales' },
      { name: 'Fecha', label: 'Fecha', type: 'date', required: true },
      { name: 'Hora', label: 'Hora', type: 'time' },
      { name: 'Campaña', label: 'Campaña', type: 'select', options: () => campOpts(book), required: true },
      { name: 'Responsable', label: 'Responsable', type: 'select', options: () => L(book, 'Operadores') },
      { name: 'Horómetro / kilometraje', label: 'Horómetro / kilometraje', type: 'text', inputmode: 'decimal' },
      { name: 'Unidad económica', label: 'Unidad económica', type: 'select', options: () => L(book, 'Unidad imputada gasto') },
      { name: 'Campo / cliente', label: 'Campo / cliente', type: 'select', options: () => sortEs(unique(book.lotes.map((l) => l['Campo']))) },
      { name: 'Lote', label: 'Lote', type: 'select', options: (v) => sortEs(unique(book.lotes.filter((l) => !v['Campo / cliente'] || l['Campo'] === v['Campo / cliente']).map((l) => l['Lote físico']))) },
      { name: 'Documento / origen', label: 'Documento / origen', type: 'select', options: () => L(book, 'Tipo documento gasto') },
      { name: 'Estado dato', label: 'Estado del dato', type: 'chips', options: () => estadoDato(book) },
      { name: 'Observaciones', label: 'Observaciones', type: 'textarea', rows: 2 },
    ],
    values: v0,
    onSubmit: async (v) => {
      const rec = R.combRecipe(store.book || book, v);
      if (edit) {
        const { 'ID movimiento combustible': _id, ...rest } = rec;
        const set = diff(mov, rest);
        if (!Object.keys(set).length) return;
        await store.enqueue([{ t: 'update', tk: 'comb', key: mov['ID movimiento combustible'], set }]);
      } else {
        await store.enqueue([{ t: 'append', tk: 'comb', rec: { ...emptyRow('comb'), ...compact(rec) } }]);
      }
      toast('Movimiento guardado');
    },
  });
}
function impactoTexto(v) {
  const m = { 'Tipo movimiento': v['Tipo movimiento'], Litros: Number(v['Litros']), Origen: v['Origen'], Destino: v['Tipo movimiento'] === 'Carga a maquinaria' ? v['Origen'] && '' : v['Destino'] };
  const probe = { ...m, Destino: v['Destino'] };
  const f = R.impactoTanque(probe, 'Tanque fijo');
  const mo = R.impactoTanque(probe, 'Tanque móvil');
  const g = R.impactoGeneral(m);
  const s = (n) => `${n > 0 ? '+' : ''}${Math.round(n)} L`;
  return `Efecto: tanque fijo ${s(f)} · tanque móvil ${s(mo)} · stock general ${s(g)}`;
}

// ===================================================================== CAMPOS Y EQUIPOS
export function loteForm(book, lote = null, { prefill = {}, onCreated = null, onClose = null } = {}) {
  const arr = (v) => ['CA-SH', 'CA-DA'].includes(v['Unidad']);
  return openForm({
    title: lote ? 'Editar lote' : 'Nuevo campo / lote', submitLabel: lote ? 'Guardar cambios' : 'Crear lote',
    fields: [
      { name: 'Unidad', label: 'Unidad', type: 'select', options: () => L(book, 'Unidades'), required: true },
      { name: 'Campo', label: 'Campo', type: 'text', required: true, suggest: () => sortEs(unique((store.book || book).lotes.map((l) => l['Campo']))).slice(0, 8) },
      { name: 'Lote físico', label: 'Lote', type: 'text', required: true },
      { name: 'Ha físicas', label: 'Hectáreas', type: 'number', unit: 'ha', required: true },
      { name: 'Responsable', label: 'Responsable', type: 'chips', options: ['SH', 'David'] },
      { name: 'Tenencia', label: 'Tenencia', type: 'chips', options: ['Propio', 'Arrendado'] },
      { name: 'Tipo de alquiler', label: 'Tipo de alquiler', type: 'chips', options: ['No aplica', 'qq/ha', '% producción'], show: arr },
      { name: 'Valor alquiler', label: 'Valor del alquiler', type: 'number', show: arr },
      { name: 'Referencia', label: 'Referencia', type: 'chips', options: ['Soja', 'No aplica'], show: arr },
      { name: 'Estado dato', label: 'Estado del dato', type: 'chips', options: () => estadoDato(book) },
      { name: 'Observaciones', label: 'Observaciones', type: 'textarea', rows: 2 },
    ],
    values: lote ? { ...lote } : { 'Unidad': 'SER', 'Estado dato': 'Confirmado', ...prefill },
    onClose,
    onSubmit: async (v) => {
      const keys = ['Unidad', 'Responsable', 'Campo', 'Lote físico', 'Ha físicas', 'Tenencia', 'Tipo de alquiler', 'Valor alquiler', 'Referencia', 'Estado dato', 'Observaciones'];
      const data = Object.fromEntries(keys.map((k) => [k, isBlank(v[k]) ? (k === 'Ha físicas' || k === 'Valor alquiler' ? null : '') : v[k]]));
      if (lote) {
        const set = diff(lote, data);
        if (!Object.keys(set).length) return;
        const ops = [{ t: 'update', tk: 'lotes', key: lote['ID lote'], set }];
        // Si cambió el nombre del campo o del lote, se ofrece actualizarlo también en las labores de ese lote.
        const ren = ('Campo' in set || 'Lote físico' in set) ? R.laboresARenombrar((store.book || book).labores, lote, data) : [];
        if (ren.length) {
          const si = await confirmDialog({
            title: 'Actualizar también las labores',
            message: `Este lote tiene ${ren.length} ${ren.length === 1 ? 'labor cargada' : 'labores cargadas'} con el nombre anterior. ¿Cambiarles el nombre a «${data['Campo']} · ${data['Lote físico']}»?`,
            confirmLabel: 'Sí, actualizar', cancelLabel: 'Solo el lote',
          });
          if (si) ops.push(...ren.map((r) => ({ t: 'update', tk: 'labores', key: r.key, set: r.set })));
        }
        await store.enqueue(ops);
      } else {
        const id = R.nuevoId(store.book || book, 'lotes', data);
        await store.enqueue([{ t: 'append', tk: 'lotes', rec: { ...emptyRow('lotes'), 'ID lote': id, ...compact(data) } }]);
        if (onCreated) onCreated(id);
      }
      toast('Lote guardado');
    },
  });
}

export function activoForm(book, a) {
  return openForm({
    title: `Editar ${a['Nombre corto']}`, submitLabel: 'Guardar cambios',
    fields: [
      { name: 'Horómetro', label: 'Horómetro', type: 'number', unit: 'hs', hint: 'Horas de motor actuales.' },
      { name: 'Responsable habitual', label: 'Responsable habitual', type: 'text' },
      { name: 'Estado dato', label: 'Estado del dato', type: 'chips', options: () => estadoDato(book) },
      { name: 'Observaciones', label: 'Observaciones', type: 'textarea', rows: 3 },
    ],
    values: { ...a },
    onSubmit: async (v) => {
      const set = diff(a, { 'Horómetro': isBlank(v['Horómetro']) ? null : v['Horómetro'], 'Responsable habitual': v['Responsable habitual'] || '', 'Estado dato': v['Estado dato'] || '', 'Observaciones': v['Observaciones'] || '' });
      if (!Object.keys(set).length) return;
      await store.enqueue([{ t: 'update', tk: 'activos', key: a['ID activo'], set }]);
      toast('Equipo actualizado');
    },
  });
}

// ===================================================================== FACTURAS Y COMPROBANTES
// Alta o edición de una factura (emitida o recibida). El archivo (foto o PDF) se guarda primero en el celular y se sube a Drive
// en la sincronización (ver sync.js); en la planilla queda la fila con su nombre.
// opciones: archivo = foto o PDF ya elegido (viene de la pantalla "Cargar factura"); onCreated(id) = qué hacer al guardar una nueva.
export function facturaForm(book, doc = null, { archivo = null, sentido = '', onCreated = null } = {}) {
  const live = () => store.book || book;
  const nuevo = !doc;
  let campManual = false;
  const extDe = (a) => (a.mime === 'application/pdf' ? 'pdf' : 'jpg');
  const contrapartes = (v) => {
    const sent = v['Sentido'] === 'Emitida' ? 'Emitida' : 'Recibida';
    const delSentido = [...(live().docs || [])].filter((d) => d['Sentido'] === sent).sort((a, b) => (b['Fecha'] || '').localeCompare(a['Fecha'] || '')).map((d) => d['Contraparte']);
    const clientes = sent === 'Emitida' ? (live().serv || []).map((x) => x['Cliente']) : [];
    return unique([...delSentido, ...clientes].filter(Boolean)).slice(0, 6);
  };
  const v0 = nuevo
    ? { 'Sentido': sentido || 'Recibida', 'Fecha': todayStr(), 'Campaña': campaignFor(todayStr()), 'Moneda': 'ARS', 'Estado de pago': 'Pendiente', 'Estado dato': 'Confirmado', 'Archivo': archivo || null, alicuota: '' }
    : { ...doc, 'Moneda': doc['Moneda'] || 'ARS', 'Estado de pago': doc['Estado de pago'] || 'Pendiente', 'Archivo': tieneArchivoDoc(doc) ? { existing: true, pending: isBlank(doc['ID archivo']), kind: /\.pdf$/i.test(doc['Archivo'] || '') ? 'pdf' : 'image', name: doc['Archivo'] || 'Archivo' } : null, alicuota: '' };
  const imp = (v) => ({ neto: v['Neto gravado'], iva: v['IVA'], otros: v['Otros impuestos'], total: v['Total'] });
  const suma = (v) => (Number(v['Neto gravado']) || 0) + (Number(v['IVA']) || 0) + (Number(v['Otros impuestos']) || 0);
  const ivaDesdeTotal = (v, set) => { const r = R.calcularIva({ total: v['Total'], otros: v['Otros impuestos'], alicuota: v.alicuota }, 'total'); if (r) { set('Neto gravado', r.neto); set('IVA', r.iva); } };
  const mon = (v) => (v['Moneda'] === 'USD' ? 'USD' : 'ARS');
  const servOpts = () => (live().serv || []).map((x) => ({ value: x['ID servicio'], label: `${x['Tipo servicio'] || 'Servicio'} · ${x['Cliente'] || 'Sin cliente'}`, sub: `${x['Campo / lote'] || ''}${x['Campo / lote'] ? ' · ' : ''}${x['ID servicio']}` }));

  return openForm({
    title: nuevo ? 'Cargar factura' : 'Editar factura', submitLabel: nuevo ? 'Guardar factura' : 'Guardar cambios',
    fields: [
      { name: 'Archivo', label: 'Foto o PDF de la factura', type: 'file', hint: 'Se guarda en tu Drive y la podés volver a bajar cuando quieras. Es opcional.' },
      { name: 'Sentido', label: 'Tipo', type: 'chips', options: [{ value: 'Recibida', label: 'Recibida (compra)' }, { value: 'Emitida', label: 'Emitida (venta)' }], required: true, hint: (v) => (v['Sentido'] === 'Emitida' ? 'Una factura que hiciste vos a un cliente.' : 'Una factura que te hizo un proveedor.') },
      { name: 'Contraparte', label: 'Proveedor', type: 'text', required: true, show: (v) => v['Sentido'] !== 'Emitida', suggest: contrapartes, onChange: (v, set, nv) => autoCuit(v, set, nv) },
      { name: 'Contraparte', label: 'Cliente', type: 'text', required: true, show: (v) => v['Sentido'] === 'Emitida', suggest: contrapartes, onChange: (v, set, nv) => autoCuit(v, set, nv) },
      { name: 'CUIT contraparte', label: 'CUIT', type: 'text', placeholder: '30-12345678-9', hint: 'Opcional. Se acomoda solo con los guiones.', valid: (v, x) => (R.cuitValido(x) ? null : 'El CUIT no es válido: revisá los 11 números'), onChange: (v, set, nv) => { if (R.cuitValido(nv)) set('CUIT contraparte', R.formatCuit(nv)); } },
      { name: 'Tipo comprobante', label: 'Tipo de comprobante', type: 'select', options: R.TIPOS_COMPROBANTE, placeholder: 'Elegir…' },
      { name: 'Fecha', label: 'Fecha de la factura', type: 'date', required: true, onChange: (v, set, nv) => { if (!campManual && nv) set('Campaña', campaignFor(nv)); } },
      { name: 'Punto de venta', label: 'Punto de venta', type: 'text', placeholder: '0003', maxlength: 8, hint: 'Los primeros números del comprobante (ej. 0003-00001234).', valid: (v, x) => (/^\d{1,5}$/.test(String(x).trim()) ? null : 'Solo números'), onChange: (v, set, nv) => { if (/^\d{1,5}$/.test(String(nv).trim())) set('Punto de venta', R.formatPV(nv)); } },
      { name: 'N.º comprobante', label: 'Número de comprobante', type: 'text', placeholder: '00001234', maxlength: 12, valid: (v, x) => (/^\d{1,8}$/.test(String(x).trim()) ? null : 'Solo números'), onChange: (v, set, nv) => { if (/^\d{1,8}$/.test(String(nv).trim())) set('N.º comprobante', R.formatNroComp(nv)); } },
      { type: 'section', label: 'Importes' },
      { name: 'Moneda', label: 'Moneda', type: 'chips', options: [{ value: 'ARS', label: 'Pesos' }, { value: 'USD', label: 'Dólares' }], required: true },
      { name: 'Tipo de cambio', label: 'Tipo de cambio', type: 'number', unit: 'ARS/USD', show: (v) => v['Moneda'] === 'USD', hint: 'Opcional: el que figura en la factura.' },
      { name: 'Total', label: 'Importe total', type: 'number', required: true, valid: (v, x) => (x <= 0 ? 'Tiene que ser mayor a 0' : null), onChange: (v, set) => ivaDesdeTotal(v, set), hint: 'Lo que dice la factura al final, con IVA incluido.' },
      { name: 'alicuota', label: 'IVA (para completar neto e IVA solos)', type: 'chips', options: R.ALICUOTAS_IVA, onChange: (v, set) => ivaDesdeTotal(v, set) },
      { name: 'Neto gravado', label: 'Neto gravado', type: 'number' },
      { name: 'IVA', label: 'IVA', type: 'number' },
      { name: 'Otros impuestos', label: 'Otros impuestos (percepciones, etc.)', type: 'number', onChange: (v, set) => ivaDesdeTotal(v, set) },
      { type: 'note', tone: 'warn', ic: 'alert', text: (v) => `Neto + IVA + otros impuestos da ${R.fmtMonto(suma(v), mon(v))} y el total es ${R.fmtMonto(v['Total'], mon(v))}.`, show: (v) => R.importesCierran(imp(v)) === false },
      { type: 'section', label: 'Pago' },
      { name: 'Estado de pago', label: 'Estado', type: 'chips', required: true, options: (v) => [{ value: 'Pendiente', label: 'Pendiente' }, { value: 'Pagada', label: v['Sentido'] === 'Emitida' ? 'Cobrada' : 'Pagada' }], onChange: (v, set, nv) => { if (nv === 'Pagada' && isBlank(v['Fecha de pago'])) set('Fecha de pago', todayStr()); } },
      { name: 'Fecha de pago', label: 'Fecha de pago', type: 'date', show: (v) => v['Estado de pago'] === 'Pagada' },
      { name: 'Vencimiento', label: 'Vence el', type: 'date', show: (v) => v['Estado de pago'] !== 'Pagada' },
      { type: 'section', label: 'Más datos' },
      { name: 'Descripción', label: 'Qué es (descripción)', type: 'text', placeholder: 'Ej. Gasoil, semilla, servicio de siembra…' },
      { name: 'Unidad imputada', label: 'Imputar a', type: 'select', options: () => L(book, 'Unidad imputada gasto'), placeholder: 'Sin definir' },
      { name: 'ID servicio vinculado', label: 'Servicio vinculado', type: 'ref', options: servOpts, show: (v) => v['Sentido'] === 'Emitida' && (live().serv || []).length > 0, placeholder: 'Opcional' },
      { name: 'CAE', label: 'CAE', type: 'text', placeholder: 'Opcional', maxlength: 20, valid: (v, x) => (/^\d{10,16}$/.test(String(x).replace(/\s/g, '')) ? null : 'El CAE tiene entre 10 y 16 números') },
      { name: 'Campaña', label: 'Campaña', type: 'select', options: () => campOpts(book), onChange: (v, set, nv) => { campManual = true; } },
      { name: 'Estado dato', label: 'Estado del dato', type: 'chips', options: () => estadoDato(book) },
      { name: 'Observaciones', label: 'Observaciones', type: 'textarea', rows: 2 },
    ],
    values: v0,
    onSubmit: async (v) => {
      const arch = v['Archivo'] && !v['Archivo'].existing ? v['Archivo'] : null; // archivo nuevo (si lo hay)
      const keys = ['Sentido', 'Campaña', 'Fecha', 'Tipo comprobante', 'Punto de venta', 'N.º comprobante', 'Contraparte', 'CUIT contraparte', 'Descripción', 'Neto gravado', 'IVA', 'Otros impuestos', 'Total', 'Moneda', 'Tipo de cambio', 'Vencimiento', 'Estado de pago', 'Fecha de pago', 'CAE', 'Unidad imputada', 'ID servicio vinculado', 'Estado dato', 'Observaciones'];
      const NUM = ['Neto gravado', 'IVA', 'Otros impuestos', 'Total', 'Tipo de cambio'];
      const data = Object.fromEntries(keys.map((k) => [k, isBlank(v[k]) ? (NUM.includes(k) ? null : '') : (typeof v[k] === 'string' ? v[k].trim() : v[k])]));
      if (data['CUIT contraparte']) data['CUIT contraparte'] = R.formatCuit(data['CUIT contraparte']);
      if (data['Punto de venta']) data['Punto de venta'] = R.formatPV(data['Punto de venta']);
      if (data['N.º comprobante']) data['N.º comprobante'] = R.formatNroComp(data['N.º comprobante']);
      if (data['Estado de pago'] === 'Pagada') data['Vencimiento'] = ''; else data['Fecha de pago'] = '';
      if (data['Moneda'] !== 'USD') data['Tipo de cambio'] = null;
      if (data['Sentido'] !== 'Emitida') data['ID servicio vinculado'] = '';

      // avisos que no bloquean: se pregunta antes de guardar
      const dup = R.docDuplicado(live(), data, doc ? doc['ID documento'] : '');
      if (dup) {
        const si = await confirmDialog({ title: 'Parece repetida', message: `Ya hay una factura igual cargada (${dup['ID documento']} · ${dup['Contraparte'] || 'sin nombre'} · ${R.fmtMonto(dup['Total'], R.docMoneda(dup))}). ¿Cargarla igual?`, confirmLabel: 'Cargarla igual', cancelLabel: 'Volver' });
        if (!si) return false;
      }
      if (R.importesCierran({ neto: data['Neto gravado'], iva: data['IVA'], otros: data['Otros impuestos'], total: data['Total'] }) === false) {
        const si = await confirmDialog({ title: 'Los importes no cierran', message: `Neto + IVA + otros impuestos da ${R.fmtMonto(suma(data2(data)), mon(data))} y el total es ${R.fmtMonto(data['Total'], mon(data))}. ¿Guardar igual?`, confirmLabel: 'Guardar igual', cancelLabel: 'Revisar' });
        if (!si) return false;
      }

      if (doc) {
        const set = diff(doc, data);
        let guardado = null;
        if (arch) {
          const nombre = R.nombreArchivoDoc({ ...doc, 'Contraparte': data['Contraparte'] }, extDe(arch));
          guardado = { docId: doc['ID documento'], name: nombre, mime: arch.mime, size: arch.size, buf: arch.buf, w: arch.w, h: arch.h, uploaded: false, replace: tieneArchivoDoc(doc) && !isBlank(doc['ID archivo']) };
          if (nombre !== doc['Archivo']) set['Archivo'] = nombre;
        }
        if (!Object.keys(set).length && !guardado) { toast('No hubo cambios', 'info'); return; }
        if (guardado) await store.putFile(guardado);
        if (Object.keys(set).length) await store.enqueue([{ t: 'update', tk: 'docs', key: doc['ID documento'], set }]);
        else if (store.afterEnqueue) store.afterEnqueue(); // solo cambió el archivo: se pide la sincronización igual
        toast('Factura actualizada');
      } else {
        const id = R.nuevoId(live(), 'docs', data);
        const rec = { ...emptyRow('docs'), 'ID documento': id, ...compact(data) };
        if (arch) {
          const nombre = R.nombreArchivoDoc({ 'ID documento': id, 'Contraparte': data['Contraparte'] }, extDe(arch));
          rec['Archivo'] = nombre;
          await store.putFile({ docId: id, name: nombre, mime: arch.mime, size: arch.size, buf: arch.buf, w: arch.w, h: arch.h, uploaded: false });
        }
        await store.enqueue([{ t: 'append', tk: 'docs', rec }]);
        toast('Factura guardada');
        if (onCreated) onCreated(id);
      }
    },
  });

  function autoCuit(v, set, nv) {
    if (!nv || !isBlank(v['CUIT contraparte'])) return;
    const prev = (live().docs || []).find((d) => norm(d['Contraparte']) === norm(nv) && !isBlank(d['CUIT contraparte']));
    if (prev) set('CUIT contraparte', prev['CUIT contraparte']);
  }
  function data2(d) { return { 'Neto gravado': d['Neto gravado'], 'IVA': d['IVA'], 'Otros impuestos': d['Otros impuestos'] }; }
}
const tieneArchivoDoc = (d) => !isBlank(d['ID archivo']) || !isBlank(d['Archivo']);

function diff(old, data) {
  const set = {};
  for (const [k, val] of Object.entries(data)) {
    const o = old[k];
    if ((isBlank(o) && isBlank(val)) || o === val) continue;
    set[k] = val;
  }
  return set;
}
