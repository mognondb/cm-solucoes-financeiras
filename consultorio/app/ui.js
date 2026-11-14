/* Utilitários de interface do aplicativo do consultório: HTML seguro por padrão, formatação pt-BR, diálogos e avisos. */

/* ---------------------------------------------------------------- HTML seguro
   html`...` escapa TODO valor interpolado, exceto fragmentos criados por html`` ou raw(). Listas de fragmentos são juntadas. */
class Cru { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Cru(String(s ?? ''));
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const um = (v) => (v instanceof Cru ? v.s : Array.isArray(v) ? v.map(um).join('') : v === false || v == null ? '' : esc(v));
export function html(partes, ...vals) {
  let o = partes[0];
  vals.forEach((v, i) => { o += um(v) + partes[i + 1]; });
  return new Cru(o);
}
export const montar = (el, conteudo) => { el.innerHTML = conteudo instanceof Cru ? conteudo.s : esc(conteudo); return el; };
export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => Array.from(raiz.querySelectorAll(sel));

/* ---------------------------------------------------------------- dinheiro e números (valores em CENTAVOS) */
const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNum = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const brl = (c) => fmtBRL.format((Number(c) || 0) / 100).replace(/ /g, ' ');
export const num2 = (c) => fmtNum.format((Number(c) || 0) / 100);
/** "1.234,56", "210", "R$ 210,5" → centavos (inteiro) ou null. */
export function lerReais(txt) {
  if (txt == null) return null;
  let s = String(txt).replace(/[^\d,.-]/g, '').trim();
  if (s === '' || s === '-') return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  else if (/^\d{1,3}\.\d{3}$/.test(s)) s = s.replace('.', ''); // 1.500 = mil e quinhentos
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/* ---------------------------------------------------------------- datas (texto AAAA-MM-DD; sem fuso: são datas do calendário) */
export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
export const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const p2 = (n) => String(n).padStart(2, '0');
export const isoDe = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const dataDe = (iso) => { const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number); return new Date(a, m - 1, d); };
export const somarDias = (iso, n) => { const d = dataDe(iso); d.setDate(d.getDate() + n); return isoDe(d); };
export const somarMeses = (iso, n) => { const d = dataDe(iso); const dia = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); d.setDate(Math.min(dia, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return isoDe(d); };
export const diaSemana = (iso) => dataDe(iso).getDay();
export const inicioSemana = (iso) => somarDias(iso, -diaSemana(iso)); // domingo
export const inicioMes = (iso) => iso.slice(0, 7) + '-01';
export const fimMes = (iso) => { const d = dataDe(iso); return isoDe(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };
export const dataBR = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
export const dataCurta = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
export const dataLonga = (iso) => { const d = dataDe(iso); return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`; };
export const mesAno = (iso) => { const d = dataDe(iso); return `${MESES[d.getMonth()]} de ${d.getFullYear()}`; };
export const hhmm = (dt) => String(dt).slice(11, 16);
export const diasEntre = (a, b) => Math.round((dataDe(b) - dataDe(a)) / 86400000);
export const lerDataBR = (txt) => { const m = String(txt || '').trim().match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/); if (!m) return null; let a = m[3] ? Number(m[3]) : new Date().getFullYear(); if (a < 100) a += 2000; const d = new Date(a, Number(m[2]) - 1, Number(m[1])); return d.getMonth() === Number(m[2]) - 1 ? isoDe(d) : null; };

/* ---------------------------------------------------------------- texto */
/* Primeiro nome para saudações, pulando títulos ("Dra. Helena Prado" → "Helena"; "Dra." sozinho fica como está). */
export const primeiroNome = (n) => {
  const partes = String(n || '').trim().split(/\s+/).filter(Boolean);
  const titulo = /^(dr|dra|dr\.|dra\.|prof|prof\.|profa|profa\.|psic|psic\.|psi|psi\.|sr|sr\.|sra|sra\.)$/i;
  while (partes.length > 1 && titulo.test(partes[0])) partes.shift();
  return partes[0] || '';
};
export const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const soDigitos = (s) => String(s || '').replace(/\D+/g, '');
export function fmtCPF(s) { const d = soDigitos(s); return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : (s || ''); }
export function fmtTel(s) { const d = soDigitos(s); return d.length === 11 ? d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3') : d.length === 10 ? d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3') : (s || ''); }
/** Link do WhatsApp com mensagem pronta (telefone brasileiro). */
export function linkWhats(tel, msg) { let d = soDigitos(tel); if (!d) return ''; if (d.length <= 11) d = '55' + d; return `https://wa.me/${d}?text=${encodeURIComponent(msg || '')}`; }
export const preencher = (modelo, v) => String(modelo).replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? ''));

/* ---------------------------------------------------------------- avisos */
let toastEl;
export function aviso(msg, tipo = 'ok', ms = 3800) {
  if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toasts'; toastEl.setAttribute('role', 'status'); toastEl.setAttribute('aria-live', 'polite'); document.body.appendChild(toastEl); }
  const t = document.createElement('div'); t.className = 'toast toast-' + tipo; t.textContent = msg; toastEl.appendChild(t);
  setTimeout(() => { t.classList.add('saindo'); setTimeout(() => t.remove(), 300); }, ms);
}

/* ---------------------------------------------------------------- diálogos
   abrirModal({ titulo, corpo, acoes, largo }) → { fechar, el }. Fecha com ESC e clique fora; devolve o <dialog> para ligar eventos. */
export function abrirModal({ titulo, corpo, acoes = [], largo = false, aoFechar }) {
  const dlg = document.createElement('dialog'); dlg.className = 'modal' + (largo ? ' modal-largo' : '');
  montar(dlg, html`<form method="dialog" class="modal-caixa" novalidate>
    <header class="modal-topo"><h2>${titulo}</h2><button type="button" class="modal-x" data-fechar aria-label="Fechar">×</button></header>
    <div class="modal-corpo">${corpo}</div>
    ${acoes.length ? html`<footer class="modal-acoes">${acoes.map((a) => html`<button type="${a.submit ? 'submit' : 'button'}" class="btn ${a.classe || 'btn-sec'}" data-acao="${a.id}" ${a.desligado ? raw('disabled') : ''}>${a.rotulo}</button>`)}</footer>` : ''}
  </form>`);
  document.body.appendChild(dlg);
  // Enter dentro de um campo aciona a ação principal (em vez de fechar o diálogo, que é o padrão de <form method="dialog">).
  dlg.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); const pri = dlg.querySelector('[data-acao].btn-pri'); if (pri && !pri.disabled) pri.click(); });
  const fechar = () => { try { dlg.close(); } catch { /* já fechado */ } };
  dlg.addEventListener('close', () => { dlg.remove(); aoFechar && aoFechar(); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-fechar]')) fechar(); });
  dlg.showModal();
  const primeiro = dlg.querySelector('[autofocus], input:not([type=hidden]):not([disabled]), select, textarea'); if (primeiro) primeiro.focus();
  return { el: dlg, fechar };
}
export function confirmar(mensagem, { titulo = 'Confirmar', ok = 'Confirmar', perigo = false } = {}) {
  return new Promise((res) => {
    let resolvido = false; const fim = (v) => { if (!resolvido) { resolvido = true; res(v); } };
    const m = abrirModal({ titulo, corpo: html`<p>${mensagem}</p>`, acoes: [{ id: 'nao', rotulo: 'Cancelar' }, { id: 'sim', rotulo: ok, classe: perigo ? 'btn-perigo' : 'btn-pri' }], aoFechar: () => fim(false) });
    m.el.addEventListener('click', (e) => { const b = e.target.closest('[data-acao]'); if (!b) return; fim(b.dataset.acao === 'sim'); m.fechar(); });
  });
}

/* ---------------------------------------------------------------- campos de formulário */
export const campo = ({ id, rotulo, tipo = 'text', valor = '', obrig = false, ajuda = '', extra = '', opcoes = null, placeholder = '', classe = '' }) => html`
  <div class="campo ${classe}"><label for="${id}">${rotulo}${obrig ? raw(' <span class="obrig" aria-hidden="true">*</span>') : ''}</label>
  ${opcoes ? html`<select id="${id}" name="${id}" ${raw(extra)}>${opcoes.map(([v, t]) => html`<option value="${v}" ${String(v) === String(valor) ? raw('selected') : ''}>${t}</option>`)}</select>`
    : tipo === 'textarea' ? html`<textarea id="${id}" name="${id}" rows="3" ${raw(extra)} placeholder="${placeholder}">${valor}</textarea>`
      : html`<input id="${id}" name="${id}" type="${tipo}" value="${valor}" ${obrig ? raw('required') : ''} placeholder="${placeholder}" ${raw(extra)}>`}
  ${ajuda ? html`<small class="ajuda">${ajuda}</small>` : ''}</div>`;
/** Campo de valor em reais (o formulário devolve texto; converta com lerReais). */
export const campoDinheiro = ({ id, rotulo, valor = 0, obrig = false, ajuda = '', placeholder = '0,00' }) => html`<div class="campo"><label for="${id}">${rotulo}${obrig ? raw(' <span class="obrig" aria-hidden="true">*</span>') : ''}</label><div class="dinheiro"><span>R$</span><input id="${id}" name="${id}" inputmode="decimal" value="${valor ? num2(valor) : ''}" placeholder="${placeholder}"></div>${ajuda ? html`<small class="ajuda">${ajuda}</small>` : ''}</div>`;
export function dadosForm(form) { const o = {}; new FormData(form).forEach((v, k) => { o[k] = typeof v === 'string' ? v.trim() : v; }); form.querySelectorAll('input[type=checkbox]').forEach((c) => { o[c.name] = c.checked; }); return o; }
export const opcoesDe = (lista, vazio) => (vazio ? [['', vazio]] : []).concat(lista.map((x) => [x.id, x.nome]));
export const selo = (texto, tom = 'neutro') => html`<span class="selo selo-${tom}">${texto}</span>`;
export function vazio(titulo, texto, acaoHtml = '') { return html`<div class="vazio"><h3>${titulo}</h3><p>${texto}</p>${acaoHtml}</div>`; }
export function esqueleto() { return html`<div class="carregando" role="status">Carregando…</div>`; }
