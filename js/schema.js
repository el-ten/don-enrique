// Estructura de la planilla SH_GESTION_APP_TEST (la misma que usa AppSheet).
// Este archivo es compartido por la app, el simulador y el generador de Code.gs.
// kinds: date | time | dur (horas) | dt (fecha y hora) | num | text (por defecto)

export const TABLES = {
  lotes: {
    sheet: '02_CAMPOS_LOTES', key: 'ID lote', label: 'Campos y lotes',
    headers: ['ID lote', 'Unidad', 'Responsable', 'Campo', 'Lote físico', 'Ha físicas', 'Tenencia', 'Tipo de alquiler', 'Valor alquiler', 'Referencia', 'Estado dato', 'Observaciones'],
    kinds: { 'Ha físicas': 'num', 'Valor alquiler': 'num' },
    formulaCols: [],
  },
  activos: {
    sheet: '03_ACTIVOS', key: 'ID activo', label: 'Equipos',
    headers: ['ID activo', 'Categoría', 'Nombre corto', 'Marca / modelo', 'Año', 'Horómetro', 'Tipo de horas', 'Capacidad', 'Unidad capacidad', 'Propiedad', 'Responsable habitual', 'Uso principal', 'Activo asociado', 'Seguro', 'Estado dato', 'Observaciones'],
    kinds: { 'Horómetro': 'num', 'Capacidad': 'num' },
    formulaCols: [],
  },
  labores: {
    sheet: '05_LABORES', key: 'ID labor', label: 'Labores',
    headers: ['ID labor', 'Campaña', 'Fecha inicio', 'Fecha fin', 'Unidad', 'Campo / cliente', 'Lote', 'Tarea', 'Cultivo', 'Variedad / híbrido', 'Ha realizadas', 'Hora inicio', 'Hora fin', 'Pausas / demoras h', 'Horas efectivas', 'Ha por hora', 'Máquina principal', 'Implemento / equipo', 'Operadores principales', 'Equipos de apoyo', 'Operadores de apoyo', 'Coeficiente combustible L/ha', 'Combustible estimado L', 'Kg cosechados vinculados', 'Estado labor', 'Estado dato', 'Novedades', 'ID lote vinculado', 'Inicio pausa actual'],
    kinds: { 'Fecha inicio': 'date', 'Fecha fin': 'date', 'Ha realizadas': 'num', 'Hora inicio': 'time', 'Hora fin': 'time', 'Pausas / demoras h': 'dur', 'Horas efectivas': 'dur', 'Ha por hora': 'num', 'Coeficiente combustible L/ha': 'num', 'Combustible estimado L': 'num', 'Kg cosechados vinculados': 'num', 'Inicio pausa actual': 'dt' },
    formulaCols: ['Horas efectivas', 'Ha por hora', 'Combustible estimado L', 'Kg cosechados vinculados'],
  },
  prod: {
    sheet: '06_PRODUCCION', key: 'ID producción', label: 'Producción',
    headers: ['ID producción', 'Campaña', 'Fecha inicio cosecha', 'Fecha fin cosecha', 'Unidad', 'Campo / cliente', 'Lote / condición', 'Cultivo', 'Tipo / época', 'Ha cosechadas', 'Producción kg', 'Rinde qq/ha', 'ID labor vinculada', 'Estado dato', '', 'Observaciones'],
    kinds: { 'Fecha inicio cosecha': 'date', 'Fecha fin cosecha': 'date', 'Ha cosechadas': 'num', 'Producción kg': 'num', 'Rinde qq/ha': 'num' },
    formulaCols: ['Rinde qq/ha'],
  },
  movs: {
    sheet: '07_MOVIMIENTOS_COSECHA', key: 'ID movimiento', label: 'Movimientos de cosecha',
    headers: ['ID movimiento', 'ID carga', 'Campaña', 'Fecha', 'Unidad', 'Campo / cliente', 'Lote', 'Cultivo', 'Tipo de movimiento', 'Monotolva utilizada', 'Equipo / recipiente', 'Kg asignados', 'Destino / ubicación', 'ID labor vinculada', 'ID producción vinculada', 'Computa producción', 'Estado conciliación', 'Documento / origen', 'Observaciones', 'ID silo'],
    kinds: { 'Fecha': 'date', 'Kg asignados': 'num' },
    formulaCols: ['Estado conciliación'],
  },
  cargas: {
    sheet: '08_CARGAS_CAMIONES', key: 'ID carga', label: 'Cargas de camiones',
    headers: ['ID carga', 'Campaña', 'Fecha', 'Camión / patente', 'Cultivo', 'Destino', 'Estado carga', 'Peso ticket kg', 'Número ticket', 'Observaciones', 'Unidad', 'Campo / cliente', 'Lote', 'ID labor vinculada', 'ID producción vinculada', 'Computa producción', 'Documento / origen'],
    kinds: { 'Fecha': 'date', 'Peso ticket kg': 'num' },
    formulaCols: [],
  },
  comb: {
    sheet: '12_COMBUSTIBLE', key: 'ID movimiento combustible', label: 'Combustible',
    headers: ['ID movimiento combustible', 'Campaña', 'Fecha', 'Hora', 'Tipo movimiento', 'Producto', 'Litros', 'Origen', 'Destino', 'Unidad económica', 'Campo / cliente', 'Lote', 'Activo abastecido', 'ID labor vinculada', 'ID gasto vinculado', 'Responsable', 'Horómetro / kilometraje', 'Documento / origen', 'Estado dato', 'Observaciones', 'Computa consumo labor', 'Impacto stock general L'],
    kinds: { 'Fecha': 'date', 'Hora': 'time', 'Litros': 'num', 'Impacto stock general L': 'num' },
    formulaCols: ['Impacto stock general L'],
  },
  silos: {
    sheet: '18_SILOS', key: 'ID silo', label: 'Silos',
    headers: ['ID silo', 'Nombre silo', 'Tipo', 'Capacidad kg', 'Estado', 'Estado dato', 'Observaciones'],
    kinds: { 'Capacidad kg': 'num' },
    formulaCols: [],
  },
  // Servicios a terceros. La app carga una fila sola cuando termina una labor de servicio (ver servicioDeLabor en rules.js).
  // Las columnas W en adelante de esa hoja son tableros de control, no forman parte de la tabla.
  serv: {
    sheet: '09_SERVICIOS', key: 'ID servicio', label: 'Servicios',
    headers: ['ID servicio', 'Campaña', 'Fecha inicio', 'Fecha fin', 'Cliente', 'Campo / lote', 'Cultivo', 'Tipo servicio', 'Ha del servicio', 'Tipo tarifa', 'Tarifa', 'Moneda / cereal', 'Producción base kg', 'Ingreso bruto USD', 'Ingreso bruto cereal kg', 'Entidad comercial informada', 'ID labor vinculada', 'ID producción vinculada', 'Estado servicio', 'Estado dato', 'Observaciones'],
    kinds: { 'Fecha inicio': 'date', 'Fecha fin': 'date', 'Ha del servicio': 'num', 'Tarifa': 'num', 'Producción base kg': 'num', 'Ingreso bruto USD': 'num', 'Ingreso bruto cereal kg': 'num' },
    formulaCols: ['Ingreso bruto USD', 'Ingreso bruto cereal kg'],
  },
};

// Hoja de listas (catálogos). Se lee completa (primeras 21 filas).
export const CONFIG_SHEET = '01_CONFIGURACION';
export const CONFIG_ROWS = 21;

export const TABLE_KEYS = Object.keys(TABLES);

export function kindOf(tkey, col) {
  return (TABLES[tkey].kinds || {})[col] || 'text';
}

// Valores por defecto de listas si la planilla todavía no se leyó (primer uso sin conexión).
export const DEFAULT_LISTS = {
  Campañas: ['2024/25', '2025/26', '2026/27'],
  Unidades: ['CP-SH', 'CA-SH', 'CA-DA', 'SER', 'ADM-TERC', 'MANT', 'TRAS', 'OTRO'],
  Tareas: ['Siembra', 'Cosecha', 'Pulverización', 'Fertilización', 'Traslado', 'Mantenimiento', 'Carga de combustible', 'Entrega de cereal', 'Venta de cereal', 'Compra de insumos', 'Otra'],
  Cultivos: ['Trigo', 'Centeno', 'Soja', 'Maíz', 'Otro'],
  Operadores: ['Operador 1', 'Operador 2', 'Operador 3', 'Otro'], // genérico a propósito: los nombres reales vienen de la planilla (01_CONFIGURACION) al conectar
  'Estado dato': ['Confirmado', 'Reconstruido', 'Estimado', 'Pendiente'],
  'Estado labor': ['Planificado', 'En curso', 'Terminado', 'Suspendido', 'Reprogramado', 'Cancelado'],
  'Unidad imputada gasto': ['SH general', 'CP-SH', 'CA-SH', 'CA-DA', 'SER', 'ADM-TERC', 'Compartido', 'Pendiente'],
  'Tipo / época': ['Primera', 'Segunda', 'Consolidado', 'Sin distinguir', 'Otro'],
  'Tipo de movimiento': ['Cosecha a camión', 'Cosecha a silo', 'Cosecha a silobolsa', 'Cosecha a acoplado', 'Cosecha a monotolva', 'Traslado interno', 'Despacho de stock', 'Corrección'],
  'Equipo o recipiente': ['Camión', 'Comofra', 'Ombú', 'Gimetal', 'Apache', 'Acoplados rojos', 'Acoplado con sinfín 8 t', 'Acoplado con sinfín 12 t', 'Silo de chapa', 'Silobolsa', 'Otro'],
  'Monotolva utilizada': ['Comofra', 'Ombú', 'Ambas', 'No identificado'],
  'Tipo movimiento combustible': ['Stock inicial', 'Compra / ingreso', 'Transferencia interna', 'Carga a maquinaria', 'Devolución', 'Salida a tercero', 'Ajuste positivo', 'Ajuste negativo'],
  'Producto combustible': ['Gasoil', 'Nafta', 'AdBlue', 'Otro'],
  'Tipo documento gasto': ['Factura A', 'Factura B', 'Factura C', 'Nota de crédito', 'Nota de débito', 'Recibo', 'Ticket', 'Remito', 'Compra sin comprobante', 'Presupuesto / compromiso', 'Registro operativo'],
  'Tipo servicio': ['Siembra', 'Cosecha', 'Pulverización', 'Fertilización', 'Otro'],
  'Tipo tarifa servicio': ['USD/ha', '% producción', 'Importe fijo', 'Sin definir'],
  'Entidad comercial': ['SH', 'David', 'Pendiente'],
};

// Reglas de validación ESTRICTAS de la planilla real (revisadas el 08/11/2026). Si se escribe en una celda un valor
// que no está en su lista, Google rechaza el cambio ("infringen las reglas de validación de datos").
//   cfg  = lista de 01_CONFIGURACION (se lee de la planilla)      lit = lista fija de la planilla
//   skip = filas del principio de la lista que la planilla NO acepta (05_LABORES acepta Campañas desde la 2.ª fila)
// Se usa en el simulador de pruebas para que cualquier opción de la app fuera de lista se detecte antes de llegar al campo.
const S_DATO = { cfg: 'Estado dato' };
const S_CAMP = { cfg: 'Campañas' };
export const STRICT = {
  lotes: { 'Unidad': { cfg: 'Unidades' }, 'Responsable': { lit: ['SH', 'David'] }, 'Tenencia': { lit: ['Propio', 'Arrendado'] }, 'Tipo de alquiler': { lit: ['No aplica', 'qq/ha', '% producción'] }, 'Referencia': { lit: ['Soja', 'No aplica'] }, 'Estado dato': S_DATO },
  labores: { 'Campaña': { cfg: 'Campañas', skip: 1 }, 'Unidad': { cfg: 'Unidades' }, 'Tarea': { cfg: 'Tareas' }, 'Cultivo': { cfg: 'Cultivos' }, 'Estado labor': { cfg: 'Estado labor' }, 'Estado dato': S_DATO },
  prod: { 'Campaña': S_CAMP, 'Unidad': { cfg: 'Unidades' }, 'Cultivo': { cfg: 'Cultivos' }, 'Tipo / época': { cfg: 'Tipo / época' }, 'Estado dato': S_DATO },
  movs: { 'Campaña': S_CAMP, 'Unidad': { cfg: 'Unidades' }, 'Cultivo': { cfg: 'Cultivos' }, 'Tipo de movimiento': { cfg: 'Tipo de movimiento' }, 'Monotolva utilizada': { cfg: 'Monotolva utilizada' }, 'Equipo / recipiente': { cfg: 'Equipo o recipiente' }, 'Computa producción': { lit: ['Sí', 'No'] } },
  comb: { 'Campaña': S_CAMP, 'Tipo movimiento': { cfg: 'Tipo movimiento combustible' }, 'Producto': { cfg: 'Producto combustible' }, 'Unidad económica': { cfg: 'Unidad imputada gasto' }, 'Responsable': { cfg: 'Operadores' }, 'Documento / origen': { cfg: 'Tipo documento gasto' }, 'Estado dato': S_DATO, 'Computa consumo labor': { lit: ['Sí', 'No', 'Pendiente por verificar'] } },
  // 09_SERVICIOS (revisado el 09/11/2026): Estado servicio usa la misma lista que Estado labor
  serv: { 'Campaña': S_CAMP, 'Cultivo': { cfg: 'Cultivos' }, 'Tipo servicio': { cfg: 'Tipo servicio' }, 'Tipo tarifa': { cfg: 'Tipo tarifa servicio' }, 'Moneda / cereal': { lit: ['Maíz', 'Soja', 'Trigo', 'USD'] }, 'Entidad comercial informada': { cfg: 'Entidad comercial' }, 'Estado servicio': { cfg: 'Estado labor' }, 'Estado dato': S_DATO },
};

// Devuelve el texto del error (el mismo tipo de mensaje que da Google) o null si el valor es aceptable.
export function strictError(tk, header, value, lists) {
  const r = (STRICT[tk] || {})[header];
  if (!r || value === '' || value === null || value === undefined) return null;
  const allowed = r.lit || ((lists && lists[r.cfg]) || []).slice(r.skip || 0);
  if (!allowed.length || allowed.includes(String(value))) return null;
  return `Los datos introducidos (${header}: "${value}") infringen las reglas de validación de datos definidas en esa celda.`;
}
