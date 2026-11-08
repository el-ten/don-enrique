// Código de conexión: "DE1." + base64url({u: dirección, t: clave}). Se pega una sola vez en el celular.
export const VERSION = '1.0.0';

const b64u = {
  enc: (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)))),
};

export function makeCode(url, token) { return 'DE1.' + b64u.enc(JSON.stringify({ u: url, t: token })); }

export function parseCode(text) {
  const s = String(text || '').trim().replace(/\s+/g, '');
  if (!s.startsWith('DE1.')) return null;
  try {
    const o = JSON.parse(b64u.dec(s.slice(4)));
    if (o && typeof o.u === 'string' && typeof o.t === 'string' && /^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)[:\/])/.test(o.u)) return { url: o.u, token: o.t };
  } catch { /* código inválido */ }
  return null;
}

export function validUrl(u) { return /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(u) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(u); }
