/* Seletor com busca: no lugar da lista fechada (<select>), um campo onde se digita para filtrar (sem diferenciar acento nem maiúscula),
   escolhe com o mouse ou com ↑ ↓ Enter, e pode criar o que não existe. Duas formas:
     • lista (padrão): o valor é o id da opção; fica num campo oculto <input type="hidden" id="..." name="...">, então dadosForm() continua funcionando;
     • livre ({ livre: true }): o valor é o próprio texto (ex.: fornecedor); as opções são só sugestões e o campo <input id="..." name="..."> é o visível.
   Use combo({...}) dentro de html`` e chame ligarCombos(elementoRaiz) uma vez por tela/diálogo. */
import { html, raw, esc, aviso } from './ui.js';

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function combo({ id, rotulo, valor = '', opcoes = [], livre = false, vazio = '', placeholder = '', obrig = false, ajuda = '', criar = '', classe = '', extra = '', dataset = {} }) {
  const lista = opcoes.map((o) => (Array.isArray(o) ? { v: String(o[0]), t: String(o[1]), s: o[2] ? String(o[2]) : '' } : o));
  const atual = livre ? String(valor ?? '') : (lista.find((o) => o.v === String(valor ?? '')) || { t: '' }).t;
  const dica = placeholder || (vazio ? `${vazio} (digite para buscar)` : 'Digite para buscar…');
  const idTxt = livre ? id : id + '-txt';
  return html`<div class="campo combo ${classe}" data-combo="${id}" data-livre="${livre ? '1' : ''}" data-vazio="${vazio}" data-criar="${criar}" ${raw(Object.entries(dataset).map(([k, v]) => ` data-${k}="${esc(v)}"`).join(''))} data-opcoes="${JSON.stringify(lista)}">
    <label for="${idTxt}">${rotulo}${obrig ? html` <span class="obrig" aria-hidden="true">*</span>` : ''}</label>
    <div class="combo-caixa">
      <input class="combo-txt" id="${idTxt}" ${livre ? html`name="${id}"` : ''} type="text" role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="${id}-lista" autocomplete="off" spellcheck="false" placeholder="${dica}" value="${atual}" ${raw(extra)}>
      ${livre ? '' : html`<input type="hidden" id="${id}" name="${id}" value="${String(valor ?? '')}">`}
      <button type="button" class="combo-seta" tabindex="-1" aria-label="Mostrar opções">▾</button>
      <ul class="combo-lista" id="${id}-lista" role="listbox" hidden></ul>
    </div>
    ${ajuda ? html`<small class="ajuda">${ajuda}</small>` : ''}</div>`;
}

/* ---------------------------------------------------------------- comportamento */
const ligados = new WeakSet();
const estado = new WeakMap(); // .combo → { ops, ativo, aberto, criadores }

function dados(c) {
  let e = estado.get(c);
  if (!e) { let ops = []; try { ops = JSON.parse(c.dataset.opcoes || '[]'); } catch { ops = []; } e = { ops, ativo: -1, aberto: false, vistos: [] }; estado.set(c, e); }
  return e;
}
const txt = (c) => c.querySelector('.combo-txt');
const oculto = (c) => c.querySelector('input[type=hidden]');
const livre = (c) => c.dataset.livre === '1';

/** Troca as opções de um seletor já desenhado (ex.: depois de criar uma categoria). */
export function definirOpcoes(c, ops) { dados(c).ops = ops.map((o) => (Array.isArray(o) ? { v: String(o[0]), t: String(o[1]), s: o[2] ? String(o[2]) : '' } : o)); }
const acharCombo = (raiz, id) => raiz.querySelector(`.combo[data-combo="${id}"]`);
/** Escolhe um valor por código (sem abrir a lista). Devolve false se a opção não existe (no modo lista). */
export function definirCombo(raiz, id, valor) {
  const c = acharCombo(raiz, id); if (!c) return false; const e = dados(c);
  if (livre(c)) { txt(c).value = String(valor ?? ''); return true; }
  const o = e.ops.find((x) => x.v === String(valor ?? '')); if (valor !== '' && valor != null && !o) return false;
  oculto(c).value = o ? o.v : ''; txt(c).value = o ? o.t : ''; return true;
}
export const valorCombo = (raiz, id) => { const c = acharCombo(raiz, id); if (!c) return ''; return livre(c) ? txt(c).value.trim() : oculto(c).value; };
export const temOpcaoCombo = (raiz, id, valor) => { const c = acharCombo(raiz, id); return !!c && dados(c).ops.some((o) => o.v === String(valor)); };

function filtrar(c, termo) {
  const e = dados(c); const palavras = norm(termo).split(' ').filter(Boolean);
  if (!palavras.length) return e.ops.slice(0, 80);
  const pontos = [];
  e.ops.forEach((o, i) => {
    const alvo = norm(o.t + ' ' + o.s); if (!palavras.every((p) => alvo.includes(p))) return;
    const nome = norm(o.t); const rank = nome.startsWith(palavras[0]) ? 0 : nome.split(' ').some((w) => w.startsWith(palavras[0])) ? 1 : 2; pontos.push([rank, i, o]);
  });
  return pontos.sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, 80).map((p) => p[2]);
}

function posicionar(c) {
  const ul = c.querySelector('.combo-lista'); const r = txt(c).getBoundingClientRect(); const abaixo = window.innerHeight - r.bottom; const acima = r.top;
  ul.style.position = 'fixed'; ul.style.left = r.left + 'px'; ul.style.width = r.width + 'px'; ul.style.right = 'auto';
  if (abaixo < 200 && acima > abaixo) { ul.style.top = 'auto'; ul.style.bottom = (window.innerHeight - r.top + 2) + 'px'; ul.style.maxHeight = Math.min(260, acima - 12) + 'px'; }
  else { ul.style.bottom = 'auto'; ul.style.top = (r.bottom + 2) + 'px'; ul.style.maxHeight = Math.max(120, Math.min(260, abaixo - 12)) + 'px'; }
}

function desenharLista(c, termo, { todas = false } = {}) {
  const e = dados(c); const ul = c.querySelector('.combo-lista'); const t = todas ? '' : termo; const itens = filtrar(c, t); const digitado = termo.trim();
  const exato = digitado && e.ops.some((o) => norm(o.t) === norm(digitado)); const linhas = [];
  if (!livre(c) && c.dataset.vazio && !norm(t)) linhas.push({ v: '', t: c.dataset.vazio, vazio: true });
  itens.forEach((o) => linhas.push(o));
  if (c.dataset.criar && digitado && !exato) linhas.push({ v: '__criar__', t: digitado, criar: true });
  else if (livre(c) && digitado && !exato && !itens.length) linhas.push({ v: '__usar__', t: digitado, usar: true });
  e.vistos = linhas; e.ativo = digitado && linhas.length && !linhas[0].vazio ? 0 : -1;
  const atualV = livre(c) ? '' : oculto(c).value;
  ul.innerHTML = linhas.length ? linhas.map((o, i) => `<li role="option" id="${esc(c.dataset.combo)}-o${i}" data-i="${i}" class="${o.vazio ? 'combo-vazio' : ''}${o.criar || o.usar ? ' combo-criar' : ''}" aria-selected="${!o.criar && !o.usar && o.v === atualV && !o.vazio ? 'true' : 'false'}">${o.criar ? `➕ ${esc(c.dataset.criar)} «${esc(o.t)}»` : o.usar ? `Usar «${esc(o.t)}» <small>(novo)</small>` : esc(o.t)}${o.s ? ` <small>${esc(o.s)}</small>` : ''}</li>`).join('')
    : '<li class="combo-nada" aria-disabled="true">Nada encontrado</li>';
  marcarAtivo(c);
}
function marcarAtivo(c) {
  const e = dados(c); const ul = c.querySelector('.combo-lista'); const i = txt(c);
  ul.querySelectorAll('li').forEach((li) => li.classList.toggle('ativo', Number(li.dataset.i) === e.ativo));
  const li = e.ativo >= 0 ? ul.querySelector(`li[data-i="${e.ativo}"]`) : null;
  if (li) { i.setAttribute('aria-activedescendant', li.id); li.scrollIntoView({ block: 'nearest' }); } else i.removeAttribute('aria-activedescendant');
}
function abrir(c, { todas = true } = {}) {
  const e = dados(c); const ul = c.querySelector('.combo-lista');
  desenharLista(c, txt(c).value, { todas }); ul.hidden = false; e.aberto = true; txt(c).setAttribute('aria-expanded', 'true'); posicionar(c);
}
function fechar(c) {
  const e = dados(c); if (!e.aberto) return; e.aberto = false; c.querySelector('.combo-lista').hidden = true; txt(c).setAttribute('aria-expanded', 'false'); txt(c).removeAttribute('aria-activedescendant');
}
function avisar(c) { const alvo = livre(c) ? txt(c) : oculto(c); alvo.dispatchEvent(new Event('change', { bubbles: true })); }

async function escolher(c, i, criadores) {
  const e = dados(c); const o = e.vistos[i]; if (!o) return;
  if (o.criar) {
    const fn = criadores && (criadores[c.dataset.combo] || (c.dataset.tipoCat && criadores['*'])); let novo = null;
    if (fn) { try { novo = await fn(o.t, c.dataset); } catch (er) { aviso(er.message, 'erro', 5000); return; } }
    if (!novo) return; e.ops.push({ v: String(novo.valor), t: novo.texto, s: '' }); oculto(c).value = String(novo.valor); txt(c).value = novo.texto;
  } else if (o.usar) { txt(c).value = o.t; }
  else if (livre(c)) { txt(c).value = o.t; }
  else { oculto(c).value = o.v; txt(c).value = o.vazio ? '' : o.t; }
  fechar(c); avisar(c);
}
/** Ao sair do campo: texto igual a uma opção vale como escolha; vazio limpa; qualquer outro texto volta ao que estava escolhido. */
function confirmar(c) {
  if (livre(c)) return; const e = dados(c); const t = txt(c).value.trim(); const h = oculto(c);
  if (!t) { if (h.value !== '') { h.value = ''; avisar(c); } return; }
  const o = e.ops.find((x) => norm(x.t) === norm(t));
  if (o) { if (h.value !== o.v) { h.value = o.v; avisar(c); } txt(c).value = o.t; return; }
  const cur = e.ops.find((x) => x.v === h.value); txt(c).value = cur ? cur.t : '';
}

/** Liga a delegação de eventos de todos os seletores dentro de `raiz`. criadores: { idDoCampo: async (texto) => ({ valor, texto }) } para a opção "Criar". */
export function ligarCombos(raiz, criadores = {}) {
  if (ligados.has(raiz)) { raiz.__criadores = criadores; return; } ligados.add(raiz); raiz.__criadores = criadores;
  const dele = (el) => (el && el.closest ? el.closest('.combo') : null);
  raiz.addEventListener('focusin', (ev) => { const c = dele(ev.target); if (c && ev.target.classList.contains('combo-txt')) { ev.target.select(); abrir(c); } });
  raiz.addEventListener('input', (ev) => { const c = dele(ev.target); if (c && ev.target.classList.contains('combo-txt')) { abrir(c, { todas: false }); } });
  raiz.addEventListener('mousedown', (ev) => {
    const li = ev.target.closest && ev.target.closest('.combo-lista li[data-i]'); const c = dele(ev.target);
    if (li && c) { ev.preventDefault(); escolher(c, Number(li.dataset.i), raiz.__criadores); return; }
    if (c && ev.target.closest('.combo-seta')) { ev.preventDefault(); const e = dados(c); if (e.aberto) fechar(c); else { txt(c).focus(); abrir(c); } }
  });
  raiz.addEventListener('keydown', (ev) => {
    const c = dele(ev.target); if (!c || !ev.target.classList.contains('combo-txt')) return; const e = dados(c);
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); if (!e.aberto) { abrir(c); return; } const n = e.vistos.length; if (!n) return; e.ativo = ev.key === 'ArrowDown' ? (e.ativo + 1) % n : (e.ativo - 1 + n) % n; marcarAtivo(c); }
    else if (ev.key === 'Enter') { if (e.aberto && e.ativo >= 0) { ev.preventDefault(); ev.stopPropagation(); escolher(c, e.ativo, raiz.__criadores); } else if (e.aberto) fechar(c); }
    else if (ev.key === 'Escape') { if (e.aberto) { ev.preventDefault(); ev.stopPropagation(); fechar(c); confirmar(c); } }
    else if (ev.key === 'Tab') { if (e.aberto && e.ativo >= 0 && norm(txt(c).value)) escolher(c, e.ativo, raiz.__criadores); else fechar(c); }
  }, true);
  raiz.addEventListener('click', (ev) => { const c = dele(ev.target); if (c && ev.target.classList.contains('combo-txt') && !dados(c).aberto) abrir(c); });
  raiz.addEventListener('focusout', (ev) => {
    const c = dele(ev.target); if (!c || !ev.target.classList.contains('combo-txt')) return;
    // foco indo para outro campo: confirma já (outros campos reagem à mudança); foco indo para lugar nenhum (clique fora): espera um instante
    if (ev.relatedTarget && !c.contains(ev.relatedTarget)) { fechar(c); confirmar(c); return; }
    setTimeout(() => { if (!c.contains(document.activeElement)) { fechar(c); confirmar(c); } }, 120);
  });
  // fecha ao rolar/redimensionar fora (a lista usa posição fixa)
  window.addEventListener('resize', () => raiz.querySelectorAll('.combo').forEach((c) => { if (dados(c).aberto) posicionar(c); }));
  raiz.addEventListener('scroll', () => raiz.querySelectorAll('.combo').forEach((c) => { if (dados(c).aberto) posicionar(c); }), true);
}
