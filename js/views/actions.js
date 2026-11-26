// Acciones de los botones (pausar, reanudar, finalizar, cerrar carga…), compartidas entre pantallas.
import { store } from '../store.js';
import { h, button, toast, confirmDialog } from '../ui.js';
import * as R from '../rules.js';
import * as F from '../forms.js';
import { icon } from '../icons.js';
import { section } from '../ui.js';
import { card } from './shared.js';
import { fmtKg, relDay } from '../util.js';

export function laborButtons(l, { size = 'md' } = {}) {
  const out = [];
  if (R.canPause(l)) out.push(button({ label: 'Pausar', ic: 'pause', tone: 'soft', size, onClick: async () => { await store.enqueue(R.labOpsPausar(l)); toast('Labor pausada'); } }));
  if (R.canResume(l)) out.push(button({ label: 'Reanudar', ic: 'play', tone: 'primary', size, onClick: async () => { await store.enqueue(R.labOpsReanudar(l)); toast('Labor reanudada'); } }));
  if (R.canFinish(l)) out.push(button({ label: 'Finalizar', ic: 'flag', tone: 'primary', size, onClick: () => F.finalizarForm(l) }));
  else if (R.isOpen(l)) out.push(button({ label: 'Finalizar', ic: 'flag', tone: 'ghost', size, onClick: () => toast('Primero reanudá la labor para poder finalizarla', 'info') }));
  return out.length ? h('div', { class: 'btn-row' }, out) : null;
}

export function cargaButtons(c, { size = 'md', full = false } = {}) {
  const cv = R.cargaView(c, store.book);
  const out = [];
  if (cv.canAddDescarga) out.push(button({ label: 'Agregar descarga', ic: 'unload', tone: 'primary', size, onClick: () => F.descargaForm(c) }));
  if (cv.canCerrar) out.push(button({
    label: 'Cerrar carga', ic: 'truck', tone: 'soft', size,
    onClick: async () => {
      if (await confirmDialog({ title: 'Cerrar carga', message: '¿Cerrar la carga y marcarla como despachada? El ticket se podrá registrar después.', confirmLabel: 'Cerrar carga' })) {
        await store.enqueue(R.cargaOpsCerrar(c)); toast('Carga despachada');
      }
    },
  }));
  if (cv.canTicket) out.push(button({ label: cv.tieneTicket ? 'Editar ticket' : 'Cargar ticket', ic: 'ticket', tone: cv.tieneTicket ? 'soft' : 'primary', size, onClick: () => F.ticketForm(c) }));
  if (full && cv.canReabrir) out.push(button({
    label: 'Reabrir', ic: 'undo', tone: 'ghost', size,
    onClick: async () => {
      if (await confirmDialog({ title: 'Reabrir carga', message: 'Vuelve a estado "En carga" y se podrán agregar descargas.', confirmLabel: 'Reabrir' })) {
        await store.enqueue(R.cargaOpsReabrir(c)); toast('Carga reabierta');
      }
    },
  }));
  return out.length ? h('div', { class: 'btn-row' }, out) : null;
}

// Grano que quedó en la monotolva sin pasar todavía a un camión (se muestra en Inicio y en Cosecha). "Ya se usó" lo saca de la lista
// sin cargar descarga; lo normal es que pase solo al agregar la descarga del camión.
export function remanenteBloque(book) {
  const rems = R.remanentes(book);
  if (!rems.length) return null;
  return section('Grano en la monotolva', rems.map((m) => card([
    h('div', { class: 'row-top' },
      h('span', { class: 'crop crop-silo' }, icon('unload', 22)),
      h('div', { class: 'grow' },
        h('div', { class: 'title-line' }, h('b', { class: 'ct' }, R.remanenteLugar(m) || 'Sin lote'), h('span', { class: 'lit' }, fmtKg(m['Kg asignados']))),
        h('div', { class: 'sub' }, `${m['Monotolva utilizada'] || 'Monotolva'} · ${m['Cultivo'] || ''} · quedó ${relDay(m['Fecha'])} · todavía sin camión`))),
    h('p', { class: 'prose' }, 'Se reparte solo cuando agregues la descarga de un camión.'),
    h('div', { class: 'btn-col' }, button({
      label: 'Ya se usó', ic: 'check', tone: 'ghost', block: true,
      onClick: async () => {
        if (await confirmDialog({ title: 'Sacar de la monotolva', message: `${fmtKg(m['Kg asignados'])} de ${R.remanenteLugar(m)}: dejan de figurar como grano en la monotolva. No se borra nada ni se suma a la producción.`, confirmLabel: 'Ya se usó' })) {
          await store.enqueue(R.opsRemanenteCerrar(m)); toast('Listo, ya no figura en la monotolva');
        }
      },
    })),
  ])));
}
