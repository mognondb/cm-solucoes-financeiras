/* A pagar: contas em aberto e atrasadas, o que já foi pago e as despesas fixas (que viram contas a pagar sozinhas todo mês). */
import { api, qs } from '../api.js';
import { App, carregarBase, categoriasDe, somenteLeitura } from '../estado.js';
import { html, raw, montar, $, abrirModal, confirmar, aviso, campo, campoDinheiro, dadosForm, lerReais, brl, selo, vazio, dataBR, dataCurta, dataDe, somarDias, somarMeses, inicioMes, fimMes, mesAno, DIAS_CURTOS, MESES } from '../ui.js';
import { seloLancamento, abrirPagamento, detalheLancamento, abrirLancamento, datalistFornecedores, ligarFornecedorACategoria } from '../financeiro.js';

const ABAS = [['aberto', 'Em aberto'], ['atrasado', 'Atrasadas'], ['quitado', 'Pagas'], ['fixas', 'Despesas fixas'], ['cancelado', 'Canceladas']];
const est = { aba: 'aberto', busca: '', periodo: 'todos', mes: null };
let raiz = null; let seq = 0;

export async function abrir(el) {
  raiz = el; est.mes = est.mes || inicioMes(App.hoje);
  el.onclick = clique; el.oninput = digitou; el.onchange = mudou;
  el.onkeydown = (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('li[data-id]')) { e.preventDefault(); detalheLancamento(Number(e.target.dataset.id), carregar); } };
  await carregar();
}

const periodoDatas = () => {
  const h = App.hoje;
  switch (est.periodo) { case 'hoje': return { de: h, ate: h }; case '7': return { de: h, ate: somarDias(h, 7) }; case 'mes': return { de: inicioMes(h), ate: fimMes(h) }; case 'proximo': { const p = somarMeses(inicioMes(h), 1); return { de: p, ate: fimMes(p) }; } default: return {}; }
};

async function carregar() {
  const minha = ++seq;
  if (!raiz.querySelector('.rc-lista')) montar(raiz, html`<div class="carregando">Carregando…</div>`);
  try {
    const pedido = est.aba === 'fixas' ? api.get('recorrentes')
      : api.get('lancamentos' + qs({ tipo: 'pagar', situacao: est.aba, busca: est.busca, ...(est.aba === 'aberto' ? periodoDatas() : {}), ...(est.aba === 'quitado' ? { pagoDe: est.mes, pagoAte: fimMes(est.mes) } : {}) }));
    const [resumo, lista] = await Promise.all([api.get('pagar/resumo'), pedido]);
    if (minha !== seq) return; desenhar(resumo, lista);
  } catch (e) { if (minha === seq) montar(raiz, html`<div class="cartao vazio"><h3>Não foi possível carregar</h3><p>${e.message}</p></div>`); }
}

function desenhar(r, lista) {
  const pode = !somenteLeitura(); const foco = document.activeElement && document.activeElement.id === 'pg-busca' ? document.activeElement.selectionStart : null;
  montar(raiz, html`<div class="cabeca"><div><h1>A pagar</h1><p>Contas do consultório: aluguel, internet, supervisão, impostos e o que mais vencer.</p></div>${pode ? html`<button class="btn btn-pri" data-novo>Nova conta a pagar</button>` : ''}</div>
    <div class="kpis">
      <div class="kpi ${r.atrasado > 0 ? 'alerta' : ''}"><span>Atrasado</span><strong>${brl(r.atrasado)}</strong><small class="suave">${r.atrasadoQtd ? `${r.atrasadoQtd} conta${r.atrasadoQtd === 1 ? '' : 's'}` : 'Nada atrasado'}</small></div>
      <div class="kpi"><span>Vence nos próximos 7 dias</span><strong>${brl(r.venceHoje + r.vence7dias)}</strong><small class="suave">${r.venceHoje ? `${brl(r.venceHoje)} vence hoje` : 'Nada vence hoje'}</small></div>
      <div class="kpi"><span>Previsto no mês</span><strong>${brl(r.previstoMes)}</strong><small class="suave">${mesAno(App.hoje)}</small></div>
      <div class="kpi"><span>Pago no mês</span><strong>${brl(r.recebidoMes)}</strong><small class="suave">Mês passado: ${brl(r.recebidoMesAnterior)}</small></div></div>
    <div class="abas" role="tablist">${ABAS.map(([k, t]) => html`<button role="tab" aria-selected="${est.aba === k}" data-aba="${k}">${t}${k === 'atrasado' && r.atrasadoQtd ? html` <span class="selo selo-ruim" style="margin-left:4px">${r.atrasadoQtd}</span>` : ''}</button>`)}</div>
    ${est.aba === 'fixas' ? fixas(lista) : lancamentos(lista)}`);
  if (foco !== null) { const i = $('#pg-busca', raiz); if (i) { i.focus(); i.setSelectionRange(foco, foco); } }
}

function lancamentos(lista) {
  const pode = !somenteLeitura(); const itens = lista.itens;
  const filtros = html`<div class="filtros"><div class="campo busca"><label class="sr" for="pg-busca">Buscar</label><input id="pg-busca" type="search" placeholder="Buscar por descrição ou fornecedor" autocomplete="off" value="${est.busca}"></div>
    ${est.aba === 'aberto' ? html`<div class="campo"><label class="sr" for="pg-periodo">Vencimento</label><select id="pg-periodo">${[['todos', 'Qualquer vencimento'], ['hoje', 'Vence hoje'], ['7', 'Próximos 7 dias'], ['mes', 'Este mês'], ['proximo', 'Mês que vem']].map(([k, t]) => html`<option value="${k}" ${est.periodo === k ? raw('selected') : ''}>${t}</option>`)}</select></div>` : ''}
    ${est.aba === 'quitado' ? html`<div class="ag-nav"><button class="btn btn-sec btn-peq" data-mes="-1" aria-label="Mês anterior">‹</button><strong style="align-self:center;min-width:130px;text-align:center">${mesAno(est.mes)}</strong><button class="btn btn-sec btn-peq" data-mes="1" aria-label="Próximo mês">›</button></div>` : ''}</div>`;
  const vazioMsg = { aberto: ['Nenhuma conta em aberto', 'Cadastre uma conta a pagar ou crie uma despesa fixa para ela nascer todo mês.'], atrasado: ['Nenhuma conta atrasada', 'Tudo em dia.'], quitado: ['Nenhum pagamento neste mês', ''], cancelado: ['Nenhuma conta cancelada', ''] }[est.aba];
  if (!itens.length) return html`${filtros}<div class="cartao rc-lista">${vazio(est.busca ? 'Nada encontrado' : vazioMsg[0], est.busca ? 'Tente outra parte do nome.' : vazioMsg[1])}</div>`;
  const total = est.aba === 'quitado' ? itens.reduce((a, l) => a + l.pago, 0) : lista.totais.restante;
  return html`${filtros}<div class="cartao rc-lista" style="padding:6px 14px"><ul class="lista">${itens.map((l) => { const d = dataDe(l.vencimento); return html`<li class="linha linha-link" data-id="${l.id}" tabindex="0" role="button" aria-label="${l.descricao}">
      <div class="rc-data"><b>${dataCurta(l.vencimento)}</b><small>${DIAS_CURTOS[d.getDay()]}</small></div>
      <div class="corpo"><span class="tit">${l.descricao}</span><span class="sub">${l.contraparte || 'Sem fornecedor'}${l.categoria ? ` · ${l.categoria}` : ''}${l.origem === 'recorrente' ? ' · despesa fixa' : ''}${l.parcelas ? ` · ${l.parcela}/${l.parcelas}` : ''}${l.situacao === 'aberto' && l.pago > 0 ? ` · já pagou ${brl(l.pago)} de ${brl(l.valor)}` : ''}</span></div>
      <span class="dir"><strong class="num">${brl(est.aba === 'quitado' ? l.pago : l.restante || l.valor)}</strong>${selo(...seloLancamento(l))}</span>
      ${pode && l.situacao === 'aberto' ? html`<button class="btn btn-sec btn-peq" data-pagar="${l.id}">Pagar</button>` : ''}</li>`; })}</ul></div>
    <p class="suave peq" style="margin:10px 4px">${est.aba === 'quitado' ? 'Pago no período' : 'Total em aberto'}: <strong>${brl(total)}</strong> · ${itens.length} conta${itens.length === 1 ? '' : 's'}${lista.cortou ? ' (mostrando as primeiras; refine a busca)' : ''}</p>`;
}

function fixas(lista) {
  const pode = !somenteLeitura(); const itens = lista.itens;
  return html`<p class="suave">Despesas que se repetem. A conta a pagar do mês atual e do próximo nasce sozinha, no dia do vencimento. Se o valor mudar (conta de luz, por exemplo), edite a conta do mês; para mudar daqui em diante, edite a despesa fixa.</p>
    <div class="cartao rc-lista" style="padding:6px 14px">${pode ? html`<div class="cartao-t" style="padding:8px 0"><h3>Despesas fixas</h3><button class="btn btn-sec btn-peq" data-nova-fixa>Nova despesa fixa</button></div>` : ''}
    ${itens.length ? html`<ul class="lista">${itens.map((g) => html`<li class="linha"><div class="corpo"><span class="tit" style="${g.ativa ? '' : 'color:#999'}">${g.descricao}</span><span class="sub">${brl(g.valor)} · ${g.frequencia === 'anual' ? `todo ano, dia ${g.dia} de ${MESES[g.mes - 1]}` : `todo mês, dia ${g.dia}`}${g.contraparte ? ` · ${g.contraparte}` : ''}</span></div>${g.ativa ? '' : selo('Pausada')}
      ${pode ? html`<button class="btn btn-ghost btn-peq" data-editar-fixa="${g.id}">Editar</button>` : ''}</li>`)}</ul>` : html`${vazio('Nenhuma despesa fixa', 'Cadastre aluguel, internet, software, anuidade do CRP e o que mais se repete.')}`}</div>`;
}

/* ---------------------------------------------------------------- formulário da despesa fixa */
async function formFixa(g) {
  await carregarBase(['categorias', 'fornecedores']); const cats = categoriasDe('despesa');
  const m = abrirModal({ titulo: g ? 'Editar despesa fixa' : 'Nova despesa fixa', largo: true, corpo: html`<div><p class="erro-form" role="alert" hidden></p>
    ${campo({ id: 'descricao', rotulo: 'Descrição', valor: g ? g.descricao : '', obrig: true, placeholder: 'Ex.: aluguel da sala, internet' })}
    <div class="grade-3">${campoDinheiro({ id: 'valor', rotulo: 'Valor', valor: g ? g.valor : 0, obrig: true })}${campo({ id: 'frequencia', rotulo: 'Repete', valor: g ? g.frequencia : 'mensal', opcoes: [['mensal', 'Todo mês'], ['anual', 'Todo ano']] })}${campo({ id: 'dia', rotulo: 'Dia do vencimento', tipo: 'number', valor: g ? g.dia : '', obrig: true, extra: 'min="1" max="31"' })}</div>
    <div id="bloco-mes" hidden>${campo({ id: 'mes', rotulo: 'Mês do vencimento', valor: g && g.mes ? g.mes : 1, opcoes: MESES.map((n, i) => [i + 1, n]) })}</div>
    <div class="grade-2">${campo({ id: 'categoriaId', rotulo: 'Categoria', valor: g ? g.categoriaId || '' : '', opcoes: [['', 'Sem categoria'], ...cats.map((c) => [c.id, c.nome])] })}${campo({ id: 'contraparte', rotulo: 'Fornecedor (opcional)', valor: g ? g.contraparte || '' : '', extra: 'list="dl-fornecedores" autocomplete="off" maxlength="120"' })}${datalistFornecedores()}</div>
    <div class="grade-2">${campo({ id: 'inicio', rotulo: 'Começa em', tipo: 'date', valor: g ? g.inicio : App.hoje })}${campo({ id: 'fim', rotulo: 'Termina em (opcional)', tipo: 'date', valor: g ? g.fim || '' : '' })}</div>
    ${g ? html`<label class="marca"><input type="checkbox" name="ativa" ${g.ativa ? raw('checked') : ''}><span>Ativa (gera as contas dos próximos meses)</span></label>` : ''}</div>`,
    acoes: [...(g ? [{ id: 'apagar', rotulo: 'Apagar', classe: 'btn-perigo' }] : []), { id: 'cancelar', rotulo: 'Cancelar' }, { id: 'salvar', rotulo: 'Salvar', classe: 'btn-pri' }] });
  const form = $('form', m.el); ligarFornecedorACategoria(form); const alternar = () => { $('#bloco-mes', form).hidden = form.elements.frequencia.value !== 'anual'; }; form.elements.frequencia.addEventListener('change', alternar); alternar();
  m.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-acao]'); if (!b) return; const ac = b.dataset.acao; if (ac === 'cancelar') return m.fechar();
    const falha = (msg) => { const x = $('.erro-form', form); x.textContent = msg; x.hidden = false; b.disabled = false; };
    if (ac === 'apagar') { if (!(await confirmar('Apagar esta despesa fixa? As contas já geradas continuam; só deixam de nascer novas.', { titulo: 'Apagar despesa fixa', ok: 'Apagar', perigo: true }))) return; try { await api.del('recorrentes/' + g.id); m.fechar(); aviso('Despesa fixa apagada.'); carregar(); } catch (er) { falha(er.message); } return; }
    const d = dadosForm(form); const valor = lerReais(d.valor); b.disabled = true; if (!valor || valor <= 0) return falha('Informe o valor.');
    const corpo = { descricao: d.descricao, valor, frequencia: d.frequencia, dia: Number(d.dia) || null, mes: d.frequencia === 'anual' ? Number(d.mes) : null, categoriaId: d.categoriaId ? Number(d.categoriaId) : null, contraparte: d.contraparte, inicio: d.inicio || App.hoje, fim: d.fim || null };
    if (g) corpo.ativa = d.ativa !== false;
    try { if (g) await api.put('recorrentes/' + g.id, corpo); else await api.post('recorrentes', corpo); m.fechar(); aviso('Despesa fixa salva.'); carregar(); } catch (er) { falha(er.message); }
  });
}

/* ---------------------------------------------------------------- interação */
let temporizador = null;
function digitou(e) { if (e.target.id !== 'pg-busca') return; est.busca = e.target.value.trim(); clearTimeout(temporizador); temporizador = setTimeout(carregar, 250); }
function mudou(e) { if (e.target.id === 'pg-periodo') { est.periodo = e.target.value; carregar(); } }
async function clique(e) {
  const t = e.target;
  const aba = t.closest('[data-aba]'); if (aba) { est.aba = aba.dataset.aba; est.busca = ''; return carregar(); }
  if (t.closest('[data-novo]')) return abrirLancamento({ tipo: 'pagar' }, carregar);
  if (t.closest('[data-nova-fixa]')) return formFixa(null);
  const ef = t.closest('[data-editar-fixa]'); if (ef) { try { const g = (await api.get('recorrentes')).itens.find((x) => x.id === Number(ef.dataset.editarFixa)); if (g) formFixa(g); } catch { /* aviso já mostrado */ } return; }
  const mes = t.closest('[data-mes]'); if (mes) { est.mes = somarMeses(est.mes, Number(mes.dataset.mes)); return carregar(); }
  const pg = t.closest('[data-pagar]'); if (pg) { e.stopPropagation(); try { abrirPagamento((await api.get('lancamentos/' + pg.dataset.pagar)).item, carregar); } catch { /* aviso já mostrado */ } return; }
  const li = t.closest('li[data-id]'); if (li) detalheLancamento(Number(li.dataset.id), carregar);
}
