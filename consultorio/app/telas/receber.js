/* A receber: o que está em aberto, o que está atrasado, o que já entrou e quem está devendo (com cobrança pelo WhatsApp e promessas). */
import { api, qs } from '../api.js';
import { App, somenteLeitura } from '../estado.js';
import { html, raw, montar, $, brl, selo, vazio, dataBR, dataCurta, dataDe, diasEntre, somarDias, somarMeses, inicioMes, fimMes, mesAno, DIAS_CURTOS } from '../ui.js';
import { seloLancamento, abrirPagamento, detalheLancamento, abrirLancamento, abrirContato, cobrarWhatsApp, CANAL_NOME } from '../financeiro.js';

const ABAS = [['aberto', 'Em aberto'], ['atrasado', 'Em atraso'], ['devedores', 'Quem deve'], ['quitado', 'Recebidos'], ['cancelado', 'Cancelados']];
const est = { aba: 'aberto', busca: '', periodo: 'todos', mes: null };
let raiz = null; let seq = 0;

export async function abrir(el, args, consulta) {
  raiz = el; est.mes = est.mes || inicioMes(App.hoje);
  const a = consulta && consulta.get('aba'); if (a && ABAS.some(([k]) => k === a)) { est.aba = a; history.replaceState(null, '', '#/receber'); }
  el.onclick = clique; el.oninput = digitou; el.onchange = mudou;
  el.onkeydown = (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('li[data-id]')) { e.preventDefault(); detalheLancamento(Number(e.target.dataset.id), carregar); } };
  await carregar();
}

const periodoDatas = () => {
  const h = App.hoje;
  switch (est.periodo) {
    case 'hoje': return { de: h, ate: h };
    case '7': return { de: h, ate: somarDias(h, 7) };
    case 'mes': return { de: inicioMes(h), ate: fimMes(h) };
    case 'proximo': { const p = somarMeses(inicioMes(h), 1); return { de: p, ate: fimMes(p) }; }
    default: return {};
  }
};

async function carregar() {
  const minha = ++seq;
  if (!raiz.querySelector('.rc-lista')) montar(raiz, html`<div class="carregando">Carregando…</div>`);
  try {
    const pedidoLista = est.aba === 'devedores' ? api.get('receber/inadimplencia')
      : api.get('lancamentos' + qs({ tipo: 'receber', situacao: est.aba, busca: est.busca, ...(est.aba === 'aberto' ? periodoDatas() : {}), ...(est.aba === 'quitado' ? { pagoDe: est.mes, pagoAte: fimMes(est.mes) } : {}) }));
    const [resumo, lista] = await Promise.all([api.get('receber/resumo'), pedidoLista]);
    if (minha !== seq) return; desenhar(resumo, lista);
  } catch (e) { if (minha === seq) montar(raiz, html`<div class="cartao vazio"><h3>Não foi possível carregar</h3><p>${e.message}</p></div>`); }
}

function desenhar(r, lista) {
  const pode = !somenteLeitura();
  const foco = document.activeElement && document.activeElement.id === 'rc-busca' ? document.activeElement.selectionStart : null;
  montar(raiz, html`<div class="cabeca"><div><h1>A receber</h1><p>Cobranças geradas pela agenda, mensalidades e lançamentos manuais.</p></div>${pode ? html`<button class="btn btn-pri" data-novo>Nova cobrança</button>` : ''}</div>
    <div class="kpis">
      <div class="kpi ${r.atrasado > 0 ? 'alerta' : ''}"><span>Em atraso</span><strong>${brl(r.atrasado)}</strong><small class="suave">${r.atrasadoQtd ? `${r.atrasadoQtd} cobrança${r.atrasadoQtd === 1 ? '' : 's'} · ${r.pacientesEmAtraso} pessoa${r.pacientesEmAtraso === 1 ? '' : 's'}` : 'Tudo em dia'}</small></div>
      <div class="kpi"><span>Vence nos próximos 7 dias</span><strong>${brl(r.venceHoje + r.vence7dias)}</strong><small class="suave">${r.venceHoje ? `${brl(r.venceHoje)} vence hoje` : 'Nada vence hoje'}</small></div>
      <div class="kpi"><span>Previsto no mês</span><strong>${brl(r.previstoMes)}</strong><small class="suave">${mesAno(App.hoje)}</small></div>
      <div class="kpi ok"><span>Recebido no mês</span><strong>${brl(r.recebidoMes)}</strong><small class="suave">Mês passado: ${brl(r.recebidoMesAnterior)}</small></div></div>
    <div class="abas" role="tablist">${ABAS.map(([k, t]) => html`<button role="tab" aria-selected="${est.aba === k}" data-aba="${k}">${t}${k === 'atrasado' && r.atrasadoQtd ? html` <span class="selo selo-ruim" style="margin-left:4px">${r.atrasadoQtd}</span>` : ''}</button>`)}</div>
    ${est.aba === 'devedores' ? devedores(r, lista) : lancamentos(lista)}`);
  if (foco !== null) { const i = $('#rc-busca', raiz); if (i) { i.focus(); i.setSelectionRange(foco, foco); } }
}

function lancamentos(lista) {
  const pode = !somenteLeitura(); const itens = lista.itens;
  const filtros = html`<div class="filtros"><div class="campo busca"><label class="sr" for="rc-busca">Buscar</label><input id="rc-busca" type="search" placeholder="Buscar por paciente ou descrição" autocomplete="off" value="${est.busca}"></div>
    ${est.aba === 'aberto' ? html`<div class="campo"><label class="sr" for="rc-periodo">Vencimento</label><select id="rc-periodo">${[['todos', 'Qualquer vencimento'], ['hoje', 'Vence hoje'], ['7', 'Próximos 7 dias'], ['mes', 'Este mês'], ['proximo', 'Mês que vem']].map(([k, t]) => html`<option value="${k}" ${est.periodo === k ? raw('selected') : ''}>${t}</option>`)}</select></div>` : ''}
    ${est.aba === 'quitado' ? html`<div class="ag-nav"><button class="btn btn-sec btn-peq" data-mes="-1" aria-label="Mês anterior">‹</button><strong style="align-self:center;min-width:130px;text-align:center">${mesAno(est.mes)}</strong><button class="btn btn-sec btn-peq" data-mes="1" aria-label="Próximo mês">›</button></div>` : ''}</div>`;
  const vazioMsg = { aberto: ['Nada em aberto', 'Quando uma sessão for realizada ou uma mensalidade vencer, a cobrança aparece aqui.'], atrasado: ['Nenhum pagamento em atraso', 'Tudo em dia por aqui.'], quitado: ['Nenhum recebimento neste mês', 'Os pagamentos registrados aparecem aqui.'], cancelado: ['Nenhuma cobrança cancelada', ''] }[est.aba];
  if (!itens.length) return html`${filtros}<div class="cartao rc-lista">${vazio(est.busca ? 'Nada encontrado' : vazioMsg[0], est.busca ? 'Tente outra parte do nome.' : vazioMsg[1])}</div>`;
  const total = est.aba === 'quitado' ? itens.reduce((a, l) => a + l.pago, 0) : lista.totais.restante;
  return html`${filtros}<div class="cartao rc-lista" style="padding:6px 14px"><ul class="lista">${itens.map((l) => { const d = dataDe(l.vencimento); return html`<li class="linha linha-link" data-id="${l.id}" tabindex="0" role="button" aria-label="${l.descricao}">
      <div class="rc-data"><b>${dataCurta(l.vencimento)}</b><small>${DIAS_CURTOS[d.getDay()]}</small></div>
      <div class="corpo"><span class="tit">${l.descricao}</span><span class="sub">${l.paciente ? l.paciente.nome : l.contraparte || 'Sem paciente'}${l.categoria ? ` · ${l.categoria}` : ''}${l.situacao === 'aberto' && l.pago > 0 ? ` · já pagou ${brl(l.pago)} de ${brl(l.valor)}` : ''}</span></div>
      <span class="dir"><strong class="num">${brl(est.aba === 'quitado' ? l.pago : l.restante || l.valor)}</strong>${selo(...seloLancamento(l))}</span>
      ${pode && l.situacao === 'aberto' ? html`<button class="btn btn-sec btn-peq" data-receber="${l.id}">Receber</button>` : ''}</li>`; })}</ul></div>
    <p class="suave peq" style="margin:10px 4px">${est.aba === 'quitado' ? 'Recebido no período' : 'Total em aberto'}: <strong>${brl(total)}</strong> · ${itens.length} lançamento${itens.length === 1 ? '' : 's'}${lista.cortou ? ' (mostrando os primeiros; refine a busca)' : ''}</p>`;
}

function quando(c) {
  if (!c) return 'Ainda sem contato';
  const dias = diasEntre(String(c.em).slice(0, 10), App.hoje);
  return `${CANAL_NOME[c.canal] || 'Contato'} ${dias <= 0 ? 'hoje' : dias === 1 ? 'ontem' : `há ${dias} dias`}`;
}
function devedores(r, lista) {
  const pode = !somenteLeitura(); const f = r.faixas;
  const faixa = (t, v) => html`<div class="kpi ${v > 0 ? 'alerta' : ''}" style="padding:10px 12px"><span>${t}</span><strong style="font-size:1.1rem">${brl(v)}</strong></div>`;
  if (!lista.itens.length) return html`<div class="cartao rc-lista">${vazio('Ninguém está devendo', 'Quando uma cobrança passar do vencimento, a pessoa aparece aqui com o tempo de atraso e o último contato.')}</div>`;
  return html`<div class="kpis" style="margin-bottom:14px">${faixa('Até 7 dias', f.ate7)}${faixa('8 a 30 dias', f.ate30)}${faixa('31 a 60 dias', f.ate60)}${faixa('Mais de 60 dias', f.mais60)}</div>
    <div class="rc-lista">${lista.itens.map((p) => html`<div class="cartao rc-devedor"><div class="pac-topo"><span class="avatar">${(p.nome || '?').slice(0, 1).toUpperCase()}</span>
      <div class="corpo"><strong>${p.nome}</strong><div class="suave peq">${p.qtd} cobrança${p.qtd === 1 ? '' : 's'} · a mais antiga venceu há ${p.diasAtraso} dia${p.diasAtraso === 1 ? '' : 's'}${p.descricoes.length ? ` · ${p.descricoes.slice(0, 2).join(', ')}` : ''}</div>
        <div style="margin-top:4px">${selo(quando(p.ultimaCobranca), p.ultimaCobranca ? 'info' : 'neutro')} ${p.promessaVigente ? selo(`Prometeu pagar até ${dataBR(p.promessaEm)}`, 'ok') : p.promessaEm ? selo(`Promessa de ${dataBR(p.promessaEm)} não cumprida`, 'ruim') : ''}</div></div>
      <div class="dir"><strong class="num ruim" style="font-size:1.15rem">${brl(p.vencido)}</strong></div></div>
      ${p.pacienteId ? html`<div class="pac-acoes">${pode ? html`<button class="btn btn-pri btn-peq" data-zap-pac="${p.pacienteId}">Cobrar no WhatsApp</button><button class="btn btn-sec btn-peq" data-contato-pac="${p.pacienteId}" data-nome="${p.nome}">Registrar contato</button>` : ''}<a class="btn btn-ghost btn-peq" href="#/pacientes/${p.pacienteId}">Ver ficha</a></div>` : html`<p class="suave peq" style="margin:8px 0 0">Lançamento sem paciente vinculado: abra em "Em atraso" para ver os detalhes.</p>`}</div>`)}</div>
    <p class="suave peq" style="margin:10px 4px">Total em atraso: <strong>${brl(lista.total)}</strong></p>`;
}

/* ---------------------------------------------------------------- interação */
let temporizador = null;
function digitou(e) { if (e.target.id !== 'rc-busca') return; est.busca = e.target.value.trim(); clearTimeout(temporizador); temporizador = setTimeout(carregar, 250); }
function mudou(e) { if (e.target.id === 'rc-periodo') { est.periodo = e.target.value; carregar(); } }
async function clique(e) {
  const t = e.target;
  const aba = t.closest('[data-aba]'); if (aba) { est.aba = aba.dataset.aba; est.busca = ''; return carregar(); }
  if (t.closest('[data-novo]')) return abrirLancamento({ tipo: 'receber' }, carregar);
  const mes = t.closest('[data-mes]'); if (mes) { est.mes = somarMeses(est.mes, Number(mes.dataset.mes)); return carregar(); }
  const rec = t.closest('[data-receber]'); if (rec) { e.stopPropagation(); const l = await detalheItem(Number(rec.dataset.receber)); if (l) abrirPagamento(l, carregar); return; }
  const zap = t.closest('[data-zap-pac]');
  if (zap) {
    const id = Number(zap.dataset.zapPac);
    try { const [pac, atrasados] = await Promise.all([api.get('pacientes/' + id), api.get('lancamentos' + qs({ situacao: 'atrasado', paciente: id }))]); cobrarWhatsApp({ ...pac.paciente }, atrasados.itens, carregar); } catch (er) { /* aviso já mostrado pela API */ }
    return;
  }
  const ct = t.closest('[data-contato-pac]'); if (ct) return abrirContato(Number(ct.dataset.contatoPac), ct.dataset.nome, carregar);
  const li = t.closest('li[data-id]'); if (li) detalheLancamento(Number(li.dataset.id), carregar);
}
async function detalheItem(id) { try { return (await api.get('lancamentos/' + id)).item; } catch { return null; } }
