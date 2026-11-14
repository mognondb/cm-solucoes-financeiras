/* Relatórios: resultado do mês (o que entrou, o que saiu, o que sobrou) e apoio ao carnê-leão (rendimentos de pessoas físicas por pagador
   e despesas que podem entrar no livro-caixa). Regime de caixa: conta o que foi recebido e pago no mês. Não calcula imposto. */
import { api } from '../api.js';
import { App } from '../estado.js';
import { html, montar, brl, selo, vazio, fmtCPF, somarMeses, mesAno } from '../ui.js';

const est = { aba: 'resultado', mes: null };
let raiz = null;

export async function abrir(el) {
  raiz = el; est.mes = est.mes || App.hoje.slice(0, 7); el.onclick = clique; await carregar();
}
async function carregar() {
  const rota = est.aba === 'resultado' ? 'relatorios/resultado' : 'relatorios/carne-leao';
  try { const d = await api.get(`${rota}?mes=${est.mes}`); desenhar(d); } catch (e) { montar(raiz, html`<div class="cartao vazio"><h3>Não foi possível carregar</h3><p>${e.message}</p></div>`); }
}

/** CSV que o Excel abre direto: separador ";", vírgula decimal e BOM para os acentos. */
function baixarCsv(nome, cabecalho, linhas) {
  const esc = (v) => { const s = String(v ?? ''); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const corpo = [cabecalho, ...linhas].map((l) => l.map(esc).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + corpo], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const reais = (c) => (c / 100).toFixed(2).replace('.', ',');
const variacao = (atual, ant) => (ant ? `${atual >= ant ? '▲' : '▼'} ${Math.abs(Math.round(((atual - ant) / Math.abs(ant)) * 100))}% sobre o mês anterior` : 'Sem mês anterior para comparar');

function barras(itens, total, cor) {
  if (!itens.length) return html`<p class="suave" style="margin:0">Nada neste mês.</p>`;
  return html`<ul class="lista">${itens.map((i) => html`<li class="linha" style="display:block"><div style="display:flex;justify-content:space-between;gap:10px"><span class="tit" style="white-space:normal">${i.nome}${i.grupo === 'fixa' ? html` <span class="selo selo-neutro">fixa</span>` : ''}${i.dedutivel ? html` <span class="selo selo-info">livro-caixa</span>` : ''}</span><strong class="num">${brl(i.valor)}</strong></div>
    <div class="rl-barra"><i style="width:${total ? Math.max(2, Math.round((i.valor / total) * 100)) : 0}%;background:${cor}"></i></div><span class="suave peq">${total ? Math.round((i.valor / total) * 100) : 0}% do total</span></li>`)}</ul>`;
}

function desenhar(d) {
  const nav = html`<div class="ag-nav"><button class="btn btn-sec btn-peq" data-mes="-1" aria-label="Mês anterior">‹</button><strong style="align-self:center;min-width:150px;text-align:center">${mesAno(est.mes + '-01')}</strong><button class="btn btn-sec btn-peq" data-mes="1" aria-label="Próximo mês">›</button></div>`;
  montar(raiz, html`<div class="cabeca"><div><h1>Relatórios</h1><p>Para saber como o consultório está e organizar a declaração.</p></div>${nav}</div>
    <div class="abas" role="tablist"><button role="tab" aria-selected="${est.aba === 'resultado'}" data-aba="resultado">Resultado do mês</button><button role="tab" aria-selected="${est.aba === 'carne'}" data-aba="carne">Apoio ao carnê-leão</button></div>
    ${est.aba === 'resultado' ? resultado(d) : carne(d)}`);
}

function resultado(d) {
  const t = d.totais; const a = d.anterior;
  return html`<div class="kpis"><div class="kpi ok"><span>Recebido no mês</span><strong>${brl(t.receitas)}</strong><small class="suave">${variacao(t.receitas, a.receitas)}</small></div>
      <div class="kpi"><span>Pago no mês</span><strong>${brl(t.despesas)}</strong><small class="suave">Fixas ${brl(t.despesasFixas)} · variáveis ${brl(t.despesasVariaveis)}</small></div>
      <div class="kpi ${t.resultado < 0 ? 'alerta' : 'ok'}"><span>Resultado</span><strong>${brl(t.resultado)}</strong><small class="suave">${t.receitas ? `${Math.round((t.resultado / t.receitas) * 100)}% do que entrou` : 'Sem recebimentos'}</small></div>
      <div class="kpi"><span>Sessões realizadas</span><strong>${t.sessoesRealizadas}</strong><small class="suave">${t.ticketMedio ? `Ticket médio ${brl(t.ticketMedio)}` : 'Sem sessões'}</small></div></div>
    <div class="cols"><div class="cartao"><div class="cartao-t"><h3>De onde veio o dinheiro</h3></div>${barras(d.receitas, t.receitas, 'var(--ok)')}</div>
      <div class="cartao"><div class="cartao-t"><h3>Para onde foi</h3></div>${barras(d.despesas, t.despesas, 'var(--atencao)')}</div></div>
    <div class="cartao"><div class="cartao-t"><h3>Quem mais pagou no mês</h3></div>${d.topPacientes.length ? html`<ul class="lista">${d.topPacientes.map((p) => html`<li class="linha"><div class="corpo"><span class="tit"><a href="#/pacientes/${p.id}" style="text-decoration:none">${p.nome}</a></span></div><strong class="num">${brl(p.valor)}</strong></li>`)}</ul>` : html`<p class="suave" style="margin:0">Sem recebimentos de pacientes neste mês.</p>`}</div>
    <div class="pac-acoes"><button class="btn btn-sec btn-peq" data-csv-resultado>Baixar CSV</button><button class="btn btn-ghost btn-peq" data-imprimir>Imprimir</button></div>
    <p class="suave peq" style="margin:10px 4px">Regime de caixa: conta o que foi efetivamente recebido e pago no mês (compras no cartão contam no dia da compra). Cobranças em aberto aparecem em "A receber" e "A pagar".</p>`;
}

function carne(d) {
  const t = d.totais;
  return html`<div class="faixa faixa-aten" style="border-radius:12px;margin-bottom:14px;text-align:left;padding:12px 16px">${d.aviso}</div>
    <div class="kpis"><div class="kpi ok"><span>Rendimentos de pessoas físicas</span><strong>${brl(t.rendimentosPF)}</strong><small class="suave">${d.rendimentosPF.length} pagador${d.rendimentosPF.length === 1 ? '' : 'es'}</small></div>
      <div class="kpi"><span>Recebido sem paciente</span><strong>${brl(t.semPaciente)}</strong><small class="suave">Informe o pagador ao declarar</small></div>
      <div class="kpi"><span>Despesas do livro-caixa</span><strong>${brl(t.deducoes)}</strong><small class="suave">Categorias marcadas como dedutíveis</small></div>
      <div class="kpi"><span>Base estimada</span><strong>${brl(t.baseEstimada)}</strong><small class="suave">Rendimentos − despesas</small></div></div>
    ${t.semCpf ? html`<div class="cartao" style="border-color:var(--atencao)"><p style="margin:0"><strong>${brl(t.semCpf)}</strong> recebidos de pessoas sem CPF cadastrado. O carnê-leão exige o CPF do pagador: complete na ficha do paciente.</p></div>` : ''}
    <div class="cartao"><div class="cartao-t"><h3>Rendimentos por pagador</h3></div>${d.rendimentosPF.length ? html`<div class="rolagem"><table class="tabela"><thead><tr><th>Pagador</th><th>CPF</th><th class="dir">Pagamentos</th><th class="dir">Valor</th></tr></thead><tbody>${d.rendimentosPF.map((p) => html`<tr><td>${p.pagador}</td><td>${p.cpf ? fmtCPF(p.cpf) : html`<span class="ruim">não informado</span>`}</td><td class="dir num">${p.pagamentos}</td><td class="dir num">${brl(p.valor)}</td></tr>`)}</tbody></table></div>` : html`<p class="suave" style="margin:0">Nenhum recebimento de pessoa física neste mês.</p>`}
      ${t.convenio ? html`<p class="suave peq" style="margin:10px 0 0">Fora desta lista: ${brl(t.convenio)} recebidos de convênios e empresas (retenção na fonte).</p>` : ''}</div>
    <div class="cartao"><div class="cartao-t"><h3>Despesas que podem entrar no livro-caixa</h3></div>${d.deducoes.length ? html`<ul class="lista">${d.deducoes.map((x) => html`<li class="linha"><div class="corpo"><span class="tit">${x.nome}</span></div><strong class="num">${brl(x.valor)}</strong></li>`)}</ul>` : html`<p class="suave" style="margin:0">Nenhuma despesa dedutível paga neste mês. Marque as categorias em Configurações → Categorias.</p>`}</div>
    <div class="pac-acoes"><button class="btn btn-sec btn-peq" data-csv-carne>Baixar CSV</button><button class="btn btn-ghost btn-peq" data-imprimir>Imprimir</button></div>`;
}

let dadosAtuais = null;
async function clique(e) {
  const t = e.target;
  const aba = t.closest('[data-aba]'); if (aba) { est.aba = aba.dataset.aba; return carregar(); }
  const mes = t.closest('[data-mes]'); if (mes) { est.mes = somarMeses(est.mes + '-01', Number(mes.dataset.mes)).slice(0, 7); return carregar(); }
  if (t.closest('[data-imprimir]')) return window.print();
  if (t.closest('[data-csv-resultado]')) {
    const d = await api.get(`relatorios/resultado?mes=${est.mes}`);
    baixarCsv(`resultado-${est.mes}.csv`, ['Tipo', 'Categoria', 'Grupo', 'Valor (R$)'], [...d.receitas.map((x) => ['Receita', x.nome, '', reais(x.valor)]), ...d.despesas.map((x) => ['Despesa', x.nome, x.grupo === 'fixa' ? 'fixa' : 'variável', reais(x.valor)]), ['Resultado', '', '', reais(d.totais.resultado)]]);
  }
  if (t.closest('[data-csv-carne]')) {
    const d = await api.get(`relatorios/carne-leao?mes=${est.mes}`);
    baixarCsv(`carne-leao-${est.mes}.csv`, ['Tipo', 'Pagador / categoria', 'CPF', 'Pagamentos', 'Valor (R$)'], [...d.rendimentosPF.map((x) => ['Rendimento PF', x.pagador, x.cpf ? fmtCPF(x.cpf) : '', x.pagamentos, reais(x.valor)]), ...(d.totais.semPaciente ? [['Rendimento sem paciente', '', '', '', reais(d.totais.semPaciente)]] : []), ...d.deducoes.map((x) => ['Livro-caixa', x.nome, '', '', reais(x.valor)]), ['Base estimada', '', '', '', reais(d.totais.baseEstimada)]]);
  }
}
