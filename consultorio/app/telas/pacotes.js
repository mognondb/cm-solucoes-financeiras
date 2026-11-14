/* Pacotes de sessões: o que foi vendido, quanto falta realizar e quanto foi recebido adiantado. */
import { api } from '../api.js';
import { somenteLeitura } from '../estado.js';
import { html, montar, $, brl, selo, vazio, dataBR, semAcento } from '../ui.js';
import { venderPacote, abrirPacote, barraPacote, textoSaldo, SELO_PACOTE } from '../pacotes.js';

const est = { filtro: 'ativos', busca: '' };
let raiz = null; let dados = null;

export async function abrir(el) {
  raiz = el; el.onclick = clique; el.oninput = digitou; el.onkeydown = (e) => { const li = e.key === 'Enter' && e.target.closest && e.target.closest('li[data-pacote]'); if (li) abrirPacote(Number(li.dataset.pacote), recarregar); };
  await carregar();
}
async function carregar() {
  try { dados = await api.get('pacotes?situacao=todos'); } catch (e) { montar(raiz, html`<div class="cartao vazio"><h3>Não foi possível carregar</h3><p>${e.message}</p></div>`); return; }
  desenhar();
}
const recarregar = () => carregar();
const DO_FILTRO = { ativos: (p) => p.situacao === 'ativo' || p.situacao === 'vencido', concluido: (p) => p.situacao === 'concluido', encerrado: (p) => p.situacao === 'encerrado', todos: () => true };

function desenhar() {
  const pode = !somenteLeitura(); const t = dados.totais;
  montar(raiz, html`<div class="cabeca"><div><h1>Pacotes de sessões</h1><p>O paciente paga várias sessões de uma vez e elas vão sendo marcadas e realizadas sem nova cobrança.</p></div>${pode ? html`<button class="btn btn-pri" data-vender>Vender pacote</button>` : ''}</div>
    <div class="kpis"><div class="kpi"><span>Pacotes ativos</span><strong>${t.ativos}</strong></div><div class="kpi"><span>Sessões a realizar</span><strong>${t.sessoesARealizar}</strong></div>
      <div class="kpi ok"><span>Recebido adiantado</span><strong>${brl(t.adiantado)}</strong><small class="suave">pago e ainda não realizado</small></div><div class="kpi ${t.aReceber ? 'alerta' : ''}"><span>A receber dos pacotes</span><strong>${brl(t.aReceber)}</strong></div></div>
    <div class="filtros"><div class="chips" role="group" aria-label="Situação">${[['ativos', 'Ativos'], ['concluido', 'Concluídos'], ['encerrado', 'Encerrados'], ['todos', 'Todos']].map(([k, r]) => html`<button type="button" class="chip" data-filtro="${k}" aria-pressed="${est.filtro === k}">${r}</button>`)}</div>
      <div class="campo busca"><label class="sr" for="pk-busca">Buscar</label><input id="pk-busca" type="search" placeholder="Buscar por paciente ou nome do pacote" autocomplete="off" value="${est.busca}"></div></div>
    <div id="pk-lista"></div>`);
  lista();
}
function lista() {
  const alvo = $('#pk-lista', raiz); if (!alvo) return; const q = semAcento(est.busca).split(/\s+/).filter(Boolean);
  const itens = dados.itens.filter(DO_FILTRO[est.filtro]).filter((p) => { const a = semAcento(`${p.paciente} ${p.nome}`); return q.every((x) => a.includes(x)); });
  if (!itens.length) { montar(alvo, html`<div class="cartao">${dados.itens.length ? vazio('Nenhum pacote aqui', est.busca ? 'Tente outra busca.' : 'Mude o filtro para ver os outros pacotes.') : vazio('Nenhum pacote vendido ainda', 'Use "Vender pacote" quando um paciente pagar várias sessões de uma vez. As sessões marcadas com o pacote não geram nova cobrança.')}</div>`); return; }
  montar(alvo, html`<div class="cartao" style="padding:6px 14px"><ul class="lista">${itens.map((p) => html`<li class="linha linha-link pk-linha" data-pacote="${p.id}" tabindex="0" role="button"><div class="corpo"><span class="tit">${p.paciente} · ${p.nome}</span><span class="sub">${textoSaldo(p)}${p.validade ? ` · até ${dataBR(p.validade)}` : ''}</span>${barraPacote(p)}</div>
    <span class="dir"><strong class="num">${brl(p.valorTotal)}</strong>${selo(...SELO_PACOTE[p.situacao])}${p.aReceber ? selo(`a receber ${brl(p.aReceber)}`, 'aten') : ''}</span></li>`)}</ul></div>`);
}
function digitou(e) { if (e.target.id === 'pk-busca') { est.busca = e.target.value; lista(); } }
function clique(e) {
  const t = e.target;
  if (t.closest('[data-vender]')) return venderPacote({ depois: recarregar });
  const f = t.closest('[data-filtro]'); if (f) { est.filtro = f.dataset.filtro; return desenhar(); }
  const li = t.closest('li[data-pacote]'); if (li) return abrirPacote(Number(li.dataset.pacote), recarregar);
}
