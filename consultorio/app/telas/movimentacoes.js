/* Movimentações bancárias: o que entrou e saiu das contas, dia a dia, num formato compacto parecido com o extrato do banco.
   Cada dia se abre para mostrar os movimentos; no alto ficam o saldo, o resumo do mês e o que ainda não foi conciliado com o extrato importado.
   Dá para olhar uma conta só ou todas juntas (cartão de crédito fica de fora do total: a dívida aparece à parte). */
import { api } from '../api.js';
import { App } from '../estado.js';
import { html, raw, montar, $, $$, brl, selo, vazio, dataBR, dataCurta, dataDe, somarMeses, mesAno, DIAS_CURTOS } from '../ui.js';
import { detalheLancamento } from '../financeiro.js';

const est = { conta: 'todas', mes: null, soPendencia: false, abertos: new Set() };
let raiz = null; let dados = null;

export async function abrir(el, resto, consulta) {
  raiz = el; el.onclick = clique; el.onkeydown = tecla; el.onchange = mudou;
  const conta = consulta && consulta.get('conta'); const mes = consulta && consulta.get('mes');
  if (conta && (conta === 'todas' || /^\d+$/.test(conta))) { est.conta = conta === 'todas' ? 'todas' : Number(conta); est.abertos = new Set(); }
  if (mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) { est.mes = mes; est.abertos = new Set(); }
  est.mes = est.mes || App.hoje.slice(0, 7);
  await carregar();
}

async function carregar() {
  const parametros = `mes=${est.mes}&conta=${est.conta}`;
  let d; try { d = await api.get('movimentacoes?' + parametros); } catch (e) {
    if (est.conta !== 'todas' && /não encontrad|inválid/i.test(e.message)) { est.conta = 'todas'; return carregar(); }   // conta que não existe mais: volta para "todas"
    montar(raiz, html`<div class="cartao vazio"><h3>Não foi possível carregar</h3><p>${e.message}</p></div>`); return;
  }
  dados = d; desenhar();
}

const sinal = (v) => `${v < 0 ? '−' : '+'}${brl(Math.abs(v))}`;
const mais = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const diaSemana = (iso) => DIAS_CURTOS[dataDe(iso).getDay()];

function linhaMovimento(m, todas) {
  const ico = m.interna ? '⇄' : m.tipo === 'receber' ? '↘' : m.tipo === 'pagar' ? '↗' : m.valor > 0 ? '↘' : '↗';
  const detalhes = [m.quem, m.categoria, todas || m.interna ? m.conta : null].filter(Boolean).join(' · ');
  const clicavel = m.lancamentoId ? ` data-lanc="${Number(m.lancamentoId)}" tabindex="0" role="button"` : '';
  return html`<li class="mv-mov ${m.lancamentoId ? 'linha-link' : ''}${m.foraDoSaldo ? ' mv-fora' : ''}"${raw(clicavel)}><span class="mv-ico ${m.interna ? '' : m.valor > 0 ? 'bom' : 'ruim'}" aria-hidden="true">${ico}</span>
    <span class="corpo"><span class="tit">${m.descricao}</span>${detalhes ? html`<span class="sub">${detalhes}</span>` : ''}</span>
    <span class="dir"><strong class="num ${m.interna ? '' : m.valor > 0 ? 'bom' : 'ruim'}">${m.interna ? brl(m.valor) : sinal(m.valor)}</strong>${m.conciliado ? selo('Conciliado', 'ok') : ''}${m.foraDoSaldo ? html`<span class="selo selo-neutro" title="Anterior à data do saldo inicial desta conta: aparece aqui, mas não entra no saldo">Fora do saldo</span>` : ''}</span></li>`;
}

function detalheDia(d, todas) {
  const nc = d.naoConciliado;
  return html`<div class="mv-det" id="mv-det-${d.data}" ${est.abertos.has(d.data) ? '' : raw('hidden')}>
    ${d.saldoInicial.length ? html`<ul class="mv-movs mv-inicial">${d.saldoInicial.map((i) => html`<li class="mv-mov"><span class="mv-ico" aria-hidden="true">◎</span><span class="corpo"><span class="tit">Saldo inicial${todas ? ` · ${i.conta}` : ''}</span><span class="sub">De onde o saldo desta conta parte (não é entrada nem saída)</span></span><span class="dir"><strong class="num">${brl(i.valor)}</strong></span></li>`)}</ul>` : ''}
    ${d.movimentos.length ? html`<ul class="mv-movs">${d.movimentos.map((m) => linhaMovimento(m, todas))}</ul>` : d.saldoInicial.length ? '' : html`<p class="suave peq" style="margin:4px 0 8px">Nenhum pagamento ou recebimento registrado neste dia.</p>`}
    ${d.pendentes.length ? html`<div class="mv-pend"><div class="mv-pend-t"><strong>Ainda não conciliado no extrato</strong><span class="suave peq">${mais(nc.qtd, 'linha', 'linhas')} · entradas ${brl(nc.entradas)} · saídas ${brl(nc.saidas)}</span></div>
      <ul class="mv-movs">${d.pendentes.map((p) => html`<li class="mv-mov"><span class="mv-ico aten" aria-hidden="true">?</span><span class="corpo"><span class="tit">${p.descricao}</span>${todas ? html`<span class="sub">${p.conta}</span>` : ''}</span>
        <span class="dir"><strong class="num ${p.valor > 0 ? 'bom' : 'ruim'}">${sinal(p.valor)}</strong><a class="btn btn-ghost btn-peq" href="#/extrato?conta=${p.contaId}">Conciliar</a></span></li>`)}</ul></div>` : ''}</div>`;
}

function linhaDia(d, todas) {
  const aberto = est.abertos.has(d.data); const nc = d.naoConciliado; const n = d.movimentos.length;
  return html`<li class="mv-dia" data-dia="${d.data}"><button type="button" class="mv-cab" data-dia-btn="${d.data}" aria-expanded="${aberto ? 'true' : 'false'}" aria-controls="mv-det-${d.data}">
      <span class="mv-seta" aria-hidden="true">›</span>
      <span class="mv-data"><strong>${diaSemana(d.data)}, ${dataCurta(d.data)}</strong><small class="suave">${n ? mais(n, 'movimento', 'movimentos') : d.saldoInicial.length ? 'saldo inicial da conta' : 'sem movimentos'}</small></span>
      <span class="mv-nums"><span class="mv-num mv-e ${d.entradas ? 'bom' : 'suave'}" data-r="Entradas">${d.entradas ? '+' + brl(d.entradas) : '—'}</span><span class="mv-num mv-s ${d.saidas ? 'ruim' : 'suave'}" data-r="Saídas">${d.saidas ? '−' + brl(d.saidas) : '—'}</span>
        <span class="mv-num mv-nc ${nc.qtd ? '' : 'suave'}" data-r="Não conciliado">${nc.qtd ? html`<span class="selo selo-aten" title="Entradas ${brl(nc.entradas)} · saídas ${brl(nc.saidas)}">${nc.qtd} · ${brl(nc.total)}</span>` : html`<span class="suave">—</span>`}</span></span>
      <span class="mv-num mv-saldo ${d.saldoFim !== null && d.saldoFim < 0 ? 'ruim' : ''}" data-r="Saldo no fim do dia">${d.saldoFim === null ? html`<span class="suave" title="Antes da data do saldo inicial a conta ainda não tinha saldo">—</span>` : brl(d.saldoFim)}${d.saldoParcial ? html`<span class="mv-parcial" title="Não inclui uma conta que ainda não tinha saldo inicial neste dia">*</span>` : ''}</span></button>${detalheDia(d, todas)}</li>`;
}

function desenhar() {
  const d = dados; const todas = d.conta === null; const conta = d.contas.find((c) => c.id === d.conta); const t = d.totais; const nc = d.naoConciliado; const p = d.pendentes;
  const cartao = !!conta && conta.tipo === 'cartao'; const noEscopo = todas ? d.contas.filter((c) => c.ativo && c.tipo !== 'cartao') : [];
  const visiveis = est.soPendencia ? d.dias.filter((x) => x.naoConciliado.qtd > 0) : d.dias;
  const atual = est.mes === App.hoje.slice(0, 7);
  const outrosMeses = p.porMes.filter((x) => x.mes !== d.mes);
  const lista = d.contas;
  montar(raiz, html`<div class="cabeca"><div><h1>Movimentações bancárias</h1><p>O que entrou e saiu das contas, dia a dia, e o que ainda falta conciliar com o extrato.</p></div>
      <div class="ag-nav"><button class="btn btn-sec btn-peq" data-mes="-1" aria-label="Mês anterior">‹</button><strong style="align-self:center;min-width:150px;text-align:center">${mesAno(d.mes + '-01')}</strong><button class="btn btn-sec btn-peq" data-mes="1" aria-label="Próximo mês" ${atual ? raw('disabled') : ''}>›</button></div></div>
    ${lista.length ? '' : html`<div class="cartao">${vazio('Nenhuma conta cadastrada', 'Cadastre uma conta em "Contas e cartões" para acompanhar as movimentações.', html`<a class="btn btn-pri" href="#/contas">Abrir contas</a>`)}</div>`}
    ${lista.length ? html`
    <div class="filtros"><div class="campo"><label class="sr" for="mv-conta">Conta</label><select id="mv-conta">
        <option value="todas" ${todas ? raw('selected') : ''}>Todas as contas</option>
        ${lista.map((c) => html`<option value="${c.id}" ${c.id === d.conta ? raw('selected') : ''}>${c.nome}${c.tipo === 'cartao' ? ' (cartão)' : ''}${c.ativo ? '' : ' (inativa)'}</option>`)}</select></div>
      <div class="chips" role="group" aria-label="Filtro dos dias"><button type="button" class="chip" data-so-pendencia aria-pressed="${est.soPendencia ? 'true' : 'false'}">Só dias com pendência${nc.dias ? ` · ${nc.dias}` : ''}</button></div>
      <div class="mv-expandir"><button type="button" class="btn btn-ghost btn-peq" data-abrir-todos>Abrir todos</button><button type="button" class="btn btn-ghost btn-peq" data-fechar-todos>Fechar todos</button></div></div>
    <div class="kpis">
      <div class="kpi ${d.saldo < 0 && !cartao ? 'alerta' : ''}"><span>${cartao ? 'Saldo do cartão' : todas ? 'Saldo total hoje' : 'Saldo da conta hoje'}</span><strong>${brl(d.saldo)}</strong>
        <small class="suave">${cartao ? 'Negativo é o que você deve no cartão' : todas ? `Soma de ${mais(noEscopo.length, 'conta', 'contas')}${d.cartoesForaDoTotal ? ` · cartões à parte: ${brl(d.dividaCartoes)} a pagar` : ''}` : `${conta.banco ? conta.banco + ' · ' : ''}saldo inicial de ${brl(conta.saldoInicial)} em ${dataBR(conta.dataSaldo)}`}</small></div>
      <div class="kpi ok"><span>Entradas do mês</span><strong>${brl(t.entradas)}</strong><small class="suave">Saldo no início do mês: ${brl(d.saldoAbertura)}</small></div>
      <div class="kpi"><span>Saídas do mês</span><strong>${brl(t.saidas)}</strong><small class="suave">${t.liquido === 0 ? 'Entrou e saiu o mesmo valor' : t.liquido > 0 ? `Sobraram ${brl(t.liquido)}` : `Faltaram ${brl(-t.liquido)}`}</small></div>
      <div class="kpi ${nc.qtd ? 'alerta' : 'ok'}"><span>Não conciliado no mês</span><strong>${brl(nc.total)}</strong><small class="suave">${nc.qtd ? `${mais(nc.qtd, 'linha', 'linhas')} em ${mais(nc.dias, 'dia', 'dias')} · entradas ${brl(nc.entradas)} · saídas ${brl(nc.saidas)}` : 'Nada pendente neste mês'}</small></div></div>
    ${p.foraDoMes.qtd ? html`<div class="faixa faixa-aten mv-aviso" role="status"><div><strong>${mais(p.foraDoMes.qtd, 'linha pendente', 'linhas pendentes')} em outros meses</strong> (${brl(p.foraDoMes.total)}). Ir para:
        ${outrosMeses.map((x) => html` <button type="button" class="chip" data-ir-mes="${x.mes}">${mesAno(x.mes + '-01').replace(/ de /, '/')} · ${x.qtd}</button>`)}</div></div>` : ''}
    ${d.foraDoSaldo.qtd ? html`<div class="faixa faixa-info mv-aviso" role="status"><div><strong>${mais(d.foraDoSaldo.qtd, 'movimento deste mês é anterior', 'movimentos deste mês são anteriores')} à data do saldo inicial</strong> de ${d.foraDoSaldo.contas.map((c) => `${c.nome} (${dataBR(c.dataSaldo)})`).join(', ')}.
        Eles aparecem aqui, mas não entram no saldo. Para contá-los, em <a class="link" href="#/contas">Contas e cartões</a> coloque a data do saldo inicial no começo do período e o saldo que a conta tinha naquele dia.</div></div>` : ''}
    ${d.truncado ? html`<div class="faixa faixa-aten mv-aviso" role="status">Este mês tem muitos registros: mostrando os primeiros ${3000}. Use uma conta específica para ver o restante.</div>` : ''}
    <div class="cartao mv"><div class="mv-cols" aria-hidden="true"><span></span><span>Dia</span><span class="mv-e">Entradas</span><span class="mv-s">Saídas</span><span class="mv-saldo">Saldo no fim do dia</span><span class="mv-nc">Não conciliado</span></div>
      ${visiveis.length ? html`<ul class="mv-lista" id="mv-lista">${visiveis.map((x) => linhaDia(x, todas))}</ul>`
        : est.soPendencia ? html`<div class="vazio"><h3>Nenhum dia com pendência neste mês</h3><p>Tudo o que veio do extrato já foi conciliado ou ignorado.</p></div>`
        : html`<div class="vazio"><h3>Nada movimentado em ${mesAno(d.mes + '-01')}</h3><p>${todas ? 'Nenhuma das contas teve pagamento, recebimento ou transferência' : 'Esta conta não teve pagamento, recebimento ou transferência'} neste mês. Use as setas para ver outro mês.</p></div>`}</div>
    <p class="suave peq" style="margin:12px 4px">${todas ? 'Transferência entre as suas próprias contas aparece no dia, mas não conta como entrada nem saída. ' : ''}"Não conciliado" são as linhas do extrato importado que ainda não foram ligadas a um pagamento nem ignoradas, na data da linha. O saldo ao fim do dia é calculado a partir do saldo de hoje; antes da data do saldo inicial a conta ainda não tem saldo (—), e os movimentos desse período aparecem marcados "Fora do saldo".</p>` : ''}`);
}

/* ---------------------------------------------------------------- interação */
function alternarDia(data, abrir) {
  const li = $(`[data-dia="${data}"]`, raiz); if (!li) return; const b = $('[data-dia-btn]', li); const det = $('.mv-det', li);
  const agora = abrir === undefined ? det.hidden : abrir; det.hidden = !agora; b.setAttribute('aria-expanded', String(agora));
  if (agora) est.abertos.add(data); else est.abertos.delete(data);
}
function clique(e) {
  const mes = e.target.closest('[data-mes]');
  if (mes) { if (mes.disabled) return; est.mes = somarMeses(est.mes + '-01', Number(mes.dataset.mes)).slice(0, 7); est.abertos = new Set(); carregar(); return; }
  const ir = e.target.closest('[data-ir-mes]'); if (ir) { est.mes = ir.dataset.irMes; est.abertos = new Set(); carregar(); return; }
  const dia = e.target.closest('[data-dia-btn]'); if (dia) { alternarDia(dia.dataset.diaBtn); return; }
  if (e.target.closest('[data-abrir-todos]')) { $$('[data-dia]', raiz).forEach((li) => alternarDia(li.dataset.dia, true)); return; }
  if (e.target.closest('[data-fechar-todos]')) { $$('[data-dia]', raiz).forEach((li) => alternarDia(li.dataset.dia, false)); return; }
  if (e.target.closest('[data-so-pendencia]')) { est.soPendencia = !est.soPendencia; desenhar(); return; }
  const l = e.target.closest('[data-lanc]'); if (l && !e.target.closest('a,button')) detalheLancamento(Number(l.dataset.lanc), () => carregar());
}
function tecla(e) {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('li[data-lanc]')) { e.preventDefault(); detalheLancamento(Number(e.target.dataset.lanc), () => carregar()); }
}
function mudou(e) {
  if (e.target.id === 'mv-conta') { est.conta = e.target.value === 'todas' ? 'todas' : Number(e.target.value); est.abertos = new Set(); carregar(); }
}
