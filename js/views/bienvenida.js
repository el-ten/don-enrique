import { store } from '../store.js';
import { sync } from '../sync.js';
import { resetDemo } from '../api.js';
import { h, button, toast } from '../ui.js';
import { icon } from '../icons.js';
import { connect } from './ajustes.js';

export function render({ go }) {
  const codeInp = h('textarea', { class: 'input mono', rows: 3, placeholder: 'DE1.…', 'aria-label': 'Código de conexión', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
  const panel = h('div', { class: 'connect-panel', hidden: true },
    h('p', null, 'Pegá el código de conexión que te pasó Claude.'),
    codeInp,
    button({ label: 'Conectar', ic: 'key', tone: 'primary', size: 'lg', block: true, onClick: async () => { if (await connect(codeInp.value)) go('home'); } }));
  const node = h('div', { class: 'welcome-page' },
    h('div', { class: 'w-hero' },
      h('div', { class: 'w-sun' }),
      h('div', { class: 'w-logo' }, icon('wheat', 44)),
      h('h1', null, 'Don Enrique'),
      h('p', null, 'Tu campo, tus labores y tus camiones, en el celular. Funciona aunque no haya señal.')),
    h('div', { class: 'w-body' },
      button({ label: 'Conectar con mi planilla', ic: 'cloud', tone: 'primary', size: 'lg', block: true, onClick: () => { panel.hidden = !panel.hidden; if (!panel.hidden) codeInp.focus(); } }),
      panel,
      button({ label: 'Probar con datos de ejemplo', ic: 'sparkle', tone: 'ghost', size: 'lg', block: true, onClick: async () => { await store.setConfig({ mode: 'demo' }); resetDemo(); await sync(); toast('Modo demo: nada de esto toca tu planilla'); go('home'); } }),
      h('p', { class: 'w-note' }, 'Los datos de ejemplo son inventados. No se mezclan con tu planilla real.')));
  return { node };
}
