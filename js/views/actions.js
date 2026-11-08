// Acciones de los botones (pausar, reanudar, finalizar, cerrar carga…), compartidas entre pantallas.
import { store } from '../store.js';
import { h, button, toast, confirmDialog } from '../ui.js';
import * as R from '../rules.js';
import * as F from '../forms.js';

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
