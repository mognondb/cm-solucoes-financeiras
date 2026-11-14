/* Fluxo de caixa: quanto entrou e saiu no mês, o que ainda está previsto e como o saldo deve andar nos próximos 60 dias. */
import { api } from '../api.js';
import { App } from '../estado.js';
import { html, raw, montar, $, brl, selo, vazio, dataBR, dataCurta, dataDe, somarMeses, inicioMes, mesAno, DIAS_CURTOS } from '../ui.js';
import { detalheLancamento } from '../financeiro.js';

let raiz = null; let mes = null;

export async function abrir(el) {
  raiz = el; mes = mes || App.hoje.slice(0, 7);
  el.onclick = clique; await carregar();
}
async function carregar() {
  let d; try { d = await api.get('caixa?mes=' + mes); } catch (e) { montar(raiz, html`<div class="cartao vazio"><h3>Não foi possível carregar</h3><p>${e.message}</p></div>`); return; }
  desenhar(d);
}

/** Linha do saldo projetado: vermelha onde fica negativo. SVG simples, sem biblioteca. */
function grafico(proj) {
  const W = 760; const H = 220; const pad = { l: 8, r: 8, t: 14, b: 22 };
  const vals = proj.map((p) => p.saldo); const min = Math.min(0, ...vals); const max = Math.max(0, ...vals); const span = (max - min) || 1;
  const x = (i) => pad.l + (W - pad.l - pad.r) * i / (proj.length - 1); const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - (v - min) / span);
  const pts = proj.map((p, i) => `${x(i).toFixed(1)},${y(p.saldo).toFixed(1)}`).join(' '); const zero = y(0).toFixed(1);
  const area = `${x(0).toFixed(1)},${zero} ${pts} ${x(proj.length - 1).toFixed(1)},${zero}`;
  const marcas = [0, 15, 30, 45, 60].map((i) => html`<text x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === 60 ? 'end' : 'middle'}" class="cx-eixo">${dataCurta(proj[i].data)}</text>`);
  return html`<svg viewBox="0 0 ${W} ${H}" class="cx-grafico" role="img" aria-label="Saldo projetado dos próximos 60 dias">
    ${min < 0 ? html`<rect x="${pad.l}" y="${zero}" width="${W - pad.l - pad.r}" height="${(H - pad.b - Number(zero)).toFixed(1)}" fill="#f8e6e0"></rect>` : ''}
    <line x1="${pad.l}" x2="${W - pad.r}" y1="${zero}" y2="${zero}" stroke="#cfc8b8" stroke-dasharray="3 3"></line>
    <polygon points="${area}" fill="#5f6f52" opacity=".12"></polygon><polyline points="${pts}" fill="none" stroke="#3f4c39" stroke-width="2.2" stroke-linejoin="round"></polyline>${marcas}</svg>`;
}

function desenhar(d) {
  const t = d.totais; const entradas = t.entradas; const saidas = t.saidas; const resultado = entradas - saidas; const prevEnt = t.previstoEntradas; const prevSai = t.previstoSaidas;
  const menor = d.menorSaldo; const ehMesAtual = d.mes === App.hoje.slice(0, 7); const negativo = menor.saldo < 0;
  const semanas = []; for (let i = 0; i < d.dias.length; i += 7) { const f = d.dias.slice(i, i + 7); semanas.push({ de: f[0].data, ate: f[f.length - 1].data, e: f.reduce((a, x) => a + x.entradas, 0), s: f.reduce((a, x) => a + x.saidas, 0), pe: f.reduce((a, x) => a + x.previstoEntradas, 0), ps: f.reduce((a, x) => a + x.previstoSaidas, 0) }); }
  montar(raiz, html`<div class="cabeca"><div><h1>Fluxo de caixa</h1><p>O que entrou, o que saiu e o que ainda está por vir.</p></div>
      <div class="ag-nav"><button class="btn btn-sec btn-peq" data-mes="-1" aria-label="Mês anterior">‹</button><strong style="align-self:center;min-width:150px;text-align:center">${mesAno(d.mes + '-01')}</strong><button class="btn btn-sec btn-peq" data-mes="1" aria-label="Próximo mês">›</button>${ehMesAtual ? '' : html`<button class="btn btn-ghost btn-peq" data-hoje>Hoje</button>`}</div></div>
    <div class="kpis">
      <div class="kpi ${d.saldoCaixa < 0 ? 'alerta' : ''}"><span>Saldo em caixa hoje</span><strong>${brl(d.saldoCaixa)}</strong><small class="suave">${d.dividaCartoes ? `Cartões: ${brl(d.dividaCartoes)} a pagar` : 'Bancos, dinheiro e plataformas'}</small></div>
      <div class="kpi ok"><span>Entradas do mês</span><strong>${brl(entradas)}</strong><small class="suave">${prevEnt ? `+ ${brl(prevEnt)} previstos` : 'Realizadas'}</small></div>
      <div class="kpi"><span>Saídas do mês</span><strong>${brl(saidas)}</strong><small class="suave">${prevSai ? `+ ${brl(prevSai)} previstas` : 'Realizadas'}${t.gastoCartao ? ` · ${brl(t.gastoCartao)} no cartão` : ''}</small></div>
      <div class="kpi ${resultado < 0 ? 'alerta' : 'ok'}"><span>Resultado do mês</span><strong>${brl(resultado)}</strong><small class="suave">Previsto com o que falta: ${brl(resultado + prevEnt - prevSai)}</small></div></div>
    <div class="cartao"><div class="cartao-t"><h3>Saldo projetado: próximos 60 dias</h3>${negativo ? selo(`Fica negativo em ${dataBR(menor.data)}`, 'ruim') : selo('Sem saldo negativo à vista', 'ok')}</div>
      ${grafico(d.projecao)}<p class="suave peq" style="margin:6px 0 0">Menor saldo previsto: <strong class="${negativo ? 'ruim' : ''}">${brl(menor.saldo)}</strong> em ${dataBR(menor.data)}. A projeção conta o que está em aberto no vencimento; contas atrasadas a pagar entram hoje, e valores atrasados a receber ficam de fora (incerteza).</p></div>
    <div class="cols"><div class="cartao"><div class="cartao-t"><h3>Próximos 14 dias</h3></div>
      ${d.proximos.length ? html`<ul class="lista">${d.proximos.map((p) => html`<li class="linha ${p.lancamentoId ? 'linha-link' : ''}" ${p.lancamentoId ? raw(`data-lanc="${p.lancamentoId}" tabindex="0" role="button"`) : ''}><div class="rc-data"><b>${dataCurta(p.data)}</b><small>${DIAS_CURTOS[dataDe(p.data).getDay()]}</small></div><div class="corpo"><span class="tit">${p.descricao}</span><span class="sub">${p.quem || (p.tipo === 'receber' ? 'A receber' : p.tipo === 'fatura' ? 'Cartão de crédito' : 'A pagar')}${p.atrasado ? ' · atrasada' : ''}</span></div><strong class="num ${p.tipo === 'receber' ? 'bom' : 'ruim'}">${p.tipo === 'receber' ? '+' : '−'} ${brl(p.valor)}</strong></li>`)}</ul>` : vazio('Nada previsto', 'Não há contas a receber nem a pagar vencendo nos próximos 14 dias.')}</div>
      <div class="cartao"><div class="cartao-t"><h3>Semana a semana</h3></div><div class="rolagem"><table class="tabela"><thead><tr><th>Período</th><th class="dir">Entrou</th><th class="dir">Saiu</th><th class="dir">Previsto</th></tr></thead><tbody>${semanas.map((s) => html`<tr><td>${dataCurta(s.de)} a ${dataCurta(s.ate)}</td><td class="dir num bom">${s.e ? brl(s.e) : '—'}</td><td class="dir num ruim">${s.s ? brl(s.s) : '—'}</td><td class="dir num suave">${s.pe || s.ps ? `${s.pe ? '+' + brl(s.pe) : ''}${s.pe && s.ps ? ' ' : ''}${s.ps ? '−' + brl(s.ps) : ''}` : '—'}</td></tr>`)}</tbody></table></div></div></div>`);
}

async function clique(e) {
  const m = e.target.closest('[data-mes]'); if (m) { mes = somarMeses(mes + '-01', Number(m.dataset.mes)).slice(0, 7); return carregar(); }
  if (e.target.closest('[data-hoje]')) { mes = App.hoje.slice(0, 7); return carregar(); }
  const l = e.target.closest('[data-lanc]'); if (l) detalheLancamento(Number(l.dataset.lanc), carregar);
}
