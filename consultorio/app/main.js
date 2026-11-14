/* Portal CLINCM: ponto de entrada. Decide a primeira tela (acesso restrito, entrar, aplicativo), monta a casca e troca as telas. */
import { api, aoOcorrer, definirCsrf } from './api.js';
import { App, defineEu, carregarBase } from './estado.js';
import { html, raw, montar, $, $$, abrirModal, aviso, esc } from './ui.js';
import { icone } from './icones.js';
import * as acesso from './telas/acesso.js';

const raiz = document.getElementById('app');
const NAV = [
  { itens: [['inicio', 'Início'], ['agenda', 'Agenda'], ['pacientes', 'Pacientes'], ['pacotes', 'Pacotes de sessões']] },
  { titulo: 'Financeiro', itens: [['receber', 'A receber'], ['pagar', 'A pagar'], ['caixa', 'Fluxo de caixa'], ['contas', 'Contas e cartões'], ['movimentacoes', 'Movimentações bancárias'], ['extrato', 'Extrato bancário']] },
  { titulo: 'Documentos', itens: [['recibos', 'Recibos'], ['relatorios', 'Relatórios']] },
  { titulo: 'Cadastros', itens: [['fornecedores', 'Fornecedores'], ['importar', 'Importar planilha']] },
  { itens: [['config', 'Configurações']] },
];
const NAV_INF = ['inicio', 'agenda', 'pacientes', 'receber'];
const ROTULO = Object.fromEntries(NAV.flatMap((g) => g.itens));
/* Telas já construídas (cada uma é um módulo em telas/). As demais mostram "Em construção" sem fazer pedido ao servidor;
   ao construir uma tela, acrescente-a aqui. Se uma tela listada falhar ao carregar, o erro aparece de verdade (não vira "em construção"). */
const PRONTAS = new Set(['inicio', 'config', 'pacientes', 'agenda', 'receber', 'pagar', 'contas', 'caixa', 'extrato', 'recibos', 'relatorios', 'fornecedores', 'importar', 'pacotes', 'movimentacoes']);
const PUBLICAS = new Set(['entrar', 'cadastro', 'esqueci', 'redefinir', 'verificar']);
let limpar = null;
let casca = false;
const CHAVE_MENU = 'clincm_menu_recolhido';
const menuRecolhido = () => { try { return localStorage.getItem(CHAVE_MENU) === '1'; } catch { return false; } };
const lembrarMenu = (v) => { try { localStorage.setItem(CHAVE_MENU, v ? '1' : '0'); } catch { /* sem armazenamento: vale só nesta visita */ } };

/* "#/pacientes/12?busca=x" → { seg: 'pacientes', resto: ['12'], consulta: URLSearchParams } */
const rota = () => {
  const [caminho, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const partes = caminho.split('/');
  return { seg: partes[0] || '', resto: partes.slice(1).filter((x) => x !== ''), consulta: new URLSearchParams(query) };
};

async function iniciar() {
  aoOcorrer('sessao-expirou', () => { if (App.eu) { App.eu = null; casca = false; aviso('Sua sessão terminou. Entre de novo.', 'aviso'); location.hash = '#/entrar'; } });
  aoOcorrer('restrito', () => { App.eu = null; casca = false; acesso.restrito(raiz); });
  aoOcorrer('assinatura', async () => { try { defineEu(await api.get('auth/eu')); faixas(); } catch { /* segue */ } });
  window.addEventListener('hashchange', rotear);
  try { App.estado = await api.get('estado'); } catch (e) {
    montar(raiz, html`<div class="acesso"><div class="acesso-caixa cartao"><h1>Sem conexão</h1><p>${e.message}</p><button class="btn btn-pri" onclick="location.reload()">Tentar de novo</button></div></div>`);
    return;
  }
  if (!App.estado.liberado) return acesso.restrito(raiz);
  try {
    const eu = await api.get('auth/eu');
    if (eu.logado) { defineEu(eu); definirCsrf(eu.csrf); await carregarBase(); }
  } catch (e) { if (e.dados?.restrito) return acesso.restrito(raiz); }
  rotear();
}

let navegacao = 0;
async function rotear() {
  const { seg, resto } = rota();
  if (seg === 'verificar') return acesso.verificar(raiz, resto[0]);
  if (!App.eu) {
    if (!PUBLICAS.has(seg)) { location.replace('#/entrar'); return; }
    casca = false;
    if (limpar) limpar();
    limpar = null;
    return acesso.mostrar(raiz, seg, resto);
  }
  if (PUBLICAS.has(seg) || seg === '') { location.replace('#/inicio'); return; }
  if (!casca) montarCasca();
  atualizarNavegacao(seg);
  /* Cada navegação ganha um "#conteudo" novo: uma tela que ainda esperava o servidor quando a pessoa trocou de página termina escrevendo num elemento
     que já saiu da página, em vez de sobrescrever (ou quebrar) a tela atual. */
  const minha = ++navegacao;
  const antigo = $('#conteudo'); const alvo = antigo.cloneNode(false); antigo.replaceWith(alvo);
  if (limpar) limpar();
  limpar = null;
  montar(alvo, html`<div class="carregando">Carregando…</div>`);
  if (!PRONTAS.has(seg)) {
    montar(alvo, html`<div class="cabeca"><div><h1>${ROTULO[seg] || 'Página'}</h1></div></div><div class="cartao vazio"><h3>Em construção</h3><p>Esta parte da plataforma ainda está sendo desenvolvida.</p></div>`);
    window.scrollTo(0, 0);
    return;
  }
  try {
    const mod = await import(`./telas/${seg}.js`);
    const r = rota(); const aoSair = await mod.abrir(alvo, r.resto, r.consulta);
    if (minha !== navegacao) { if (typeof aoSair === 'function') aoSair(); return; }   // a pessoa já foi para outra página: desfaz o que esta tela deixou ligado
    if (typeof aoSair === 'function') limpar = aoSair;
  } catch (e) {
    console.error(e);
    if (minha !== navegacao) return;
    montar(alvo, html`<div class="cartao vazio"><h3>Não foi possível abrir esta página</h3><p>${e.message || 'Erro inesperado.'}</p><button class="btn btn-sec" onclick="location.reload()">Recarregar</button></div>`);
  }
  window.scrollTo(0, 0);
}

function montarCasca() {
  casca = true;
  const p = App.eu.usuario;
  const link = (k, t) => `<a href="#/${k}" data-nav="${k}" title="${esc(t)}">${icone(k)}<span>${esc(t)}</span></a>`;
  const lateral = NAV.map((g) => `${g.titulo ? `<h6>${esc(g.titulo)}</h6>` : ''}${g.itens.map(([k, t]) => link(k, t)).join('')}`).join('');
  const inferior = NAV_INF.map((k) => link(k, ROTULO[k])).join('') + `<button type="button" data-mais>${icone('mais')}<span>Mais</span></button>`;
  const min = menuRecolhido();
  raiz.innerHTML = `<div class="app ${min ? 'menu-min' : ''}">
    <aside class="lateral" aria-label="Menu"><div class="lateral-topo"><div class="marca-app"><small>Portal</small>CLINCM</div>
      <button type="button" class="lateral-recolher" data-recolher aria-expanded="${!min}" aria-label="${min ? 'Expandir o menu' : 'Recolher o menu'}" title="${min ? 'Expandir o menu' : 'Recolher o menu'}">${icone('voltar', 18)}</button></div>${lateral}
      <div class="rodape"><span class="rodape-txt"><strong>${esc(p.nome)}</strong>${esc(App.eu.conta.nome)}<br></span><button type="button" class="link" data-sair title="Sair">${icone('sair', 18)}<span class="rot">Sair</span></button></div></aside>
    <div class="coluna"><header class="topo"><div class="marca-app"><small>Portal</small>CLINCM</div></header>
      <div id="faixas"></div><main class="principal" id="conteudo" tabindex="-1"></main></div>
    <nav class="nav-inf" aria-label="Menu principal">${inferior}</nav></div>`;
  raiz.onclick = aoClicar;
  faixas();
}

function aoClicar(e) {
  const rec = e.target.closest('[data-recolher]');
  if (rec) {
    const app = rec.closest('.app'); const min = !app.classList.contains('menu-min'); app.classList.toggle('menu-min', min); lembrarMenu(min);
    rec.setAttribute('aria-expanded', String(!min)); rec.setAttribute('aria-label', min ? 'Expandir o menu' : 'Recolher o menu'); rec.title = min ? 'Expandir o menu' : 'Recolher o menu'; return;
  }
  if (e.target.closest('[data-sair]')) return sair();
  if (e.target.closest('[data-mais]')) return maisFolha();
  const rv = e.target.closest('[data-reenviar-verif]');
  if (rv) { rv.disabled = true; api.post('auth/reenviar-verificacao').then(() => aviso('Enviamos um novo link para o seu e-mail.')).catch((er) => aviso(er.message, 'erro')); }
}

function maisFolha() {
  const restantes = NAV.flatMap((g) => g.itens).filter(([k]) => !NAV_INF.includes(k));
  const m = abrirModal({
    titulo: 'Mais',
    corpo: html`<nav class="mais-folha">${restantes.map(([k, t]) => html`<a href="#/${k}" data-fechar>${raw(icone(k))}<span>${t}</span></a>`)}<a href="#" data-sair-mais>${raw(icone('sair'))}<span>Sair</span></a></nav>`,
  });
  m.el.addEventListener('click', (e) => { if (e.target.closest('[data-sair-mais]')) { e.preventDefault(); m.fechar(); sair(); } });
}

async function sair() {
  try { await api.post('auth/sair'); } catch { /* sai mesmo assim */ }
  App.eu = null; App.cache = {}; definirCsrf(''); casca = false;
  location.hash = '#/entrar';
}

function atualizarNavegacao(seg) {
  $$('[data-nav]').forEach((a) => {
    const on = a.dataset.nav === seg;
    a.classList.toggle('ativo', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.title = (ROTULO[seg] ? ROTULO[seg] + ' · ' : '') + 'Portal CLINCM';
}

/** Avisos no topo: modo restrito, teste grátis, e-mail por confirmar. */
export function faixas() {
  const el = $('#faixas');
  if (!el || !App.eu) return;
  const pl = App.eu.plano;
  const f = [];
  if (App.estado?.acesso === 'restrito') f.push(html`<div class="faixa faixa-restrito">Modo restrito: só a equipe da CM enxerga esta plataforma por enquanto.</div>`);
  if (pl.plano === 'expirado') f.push(html`<div class="faixa faixa-ruim">Seu teste grátis terminou. Você ainda vê e exporta seus dados, mas não é possível registrar novidades.</div>`);
  else if (pl.plano === 'suspenso') f.push(html`<div class="faixa faixa-ruim">Esta conta está suspensa.</div>`);
  else if (pl.plano === 'teste' && pl.diasRestantes != null) f.push(html`<div class="faixa faixa-info">Teste grátis: ${pl.diasRestantes <= 1 ? 'último dia' : 'faltam ' + pl.diasRestantes + ' dias'}.</div>`);
  if (!App.eu.usuario.verificado) f.push(html`<div class="faixa faixa-aten">Confirme seu e-mail pelo link que enviamos. <button type="button" class="link" data-reenviar-verif>Reenviar</button></div>`);
  montar(el, html`${f}`);
}

iniciar();
