/* Cliente da API do consultório: cookies de sessão (HttpOnly) + token CSRF em todo pedido que altera dados. */
let csrf = '';
export const definirCsrf = (t) => { csrf = t || ''; };
export class ErroApi extends Error { constructor(msg, status, dados) { super(msg); this.status = status; this.dados = dados || {}; } }
const ouvintes = {};
export const aoOcorrer = (evento, fn) => { (ouvintes[evento] = ouvintes[evento] || []).push(fn); };
const emitir = (evento, d) => (ouvintes[evento] || []).forEach((f) => f(d));

async function chamar(metodo, rota, corpo, opcoes = {}) {
  const cab = { Accept: 'application/json' };
  if (corpo !== undefined) cab['Content-Type'] = 'application/json';
  if (metodo !== 'GET' && csrf) cab['X-CSRF-Token'] = csrf;
  let r;
  try { r = await fetch('/consultorio/api/' + rota, { method: metodo, headers: cab, body: corpo === undefined ? undefined : JSON.stringify(corpo), credentials: 'same-origin', cache: 'no-store' }); }
  catch { throw new ErroApi('Não foi possível conectar ao servidor. Verifique sua internet.', 0); }
  let dados = {}; try { dados = await r.json(); } catch { /* corpo vazio */ }
  if (dados && typeof dados.csrf === 'string') csrf = dados.csrf;
  if (!r.ok) {
    if (r.status === 401 && !opcoes.silencioso) emitir('sessao-expirou', dados);
    if (r.status === 403 && dados.restrito) emitir('restrito', dados);
    if (r.status === 402) emitir('assinatura', dados);
    throw new ErroApi(dados.message || 'Algo deu errado. Tente de novo.', r.status, dados);
  }
  return dados;
}
export const api = {
  get: (rota, o) => chamar('GET', rota, undefined, o),
  post: (rota, corpo = {}, o) => chamar('POST', rota, corpo, o),
  put: (rota, corpo = {}, o) => chamar('PUT', rota, corpo, o),
  del: (rota, o) => chamar('DELETE', rota, undefined, o),
};
export const qs = (obj) => { const p = new URLSearchParams(); Object.entries(obj || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, v); }); const s = p.toString(); return s ? '?' + s : ''; };
