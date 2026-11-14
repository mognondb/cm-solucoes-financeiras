/* Pacotes de sessões pré-pagas: vender o pacote (recebido à vista ou a receber), ver o saldo e as sessões ligadas, e chegar à agenda para marcar as sessões
   sem nova cobrança. Usado na ficha do paciente, na tela Pacotes e na agenda. */
import { api } from './api.js';
import { App, carregarBase, servicoPorId, somenteLeitura } from './estado.js';
import { html, raw, montar, $, abrirModal, confirmar, aviso, campo, campoDinheiro, dadosForm, lerReais, brl, num2, selo, dataBR, dataLonga, hhmm } from './ui.js';
import { combo, ligarCombos } from './combo.js';
import { FORMAS, detalheLancamento } from './financeiro.js';

export const SELO_PACOTE = { ativo: ['Ativo', 'ok'], concluido: ['Concluído', 'neutro'], encerrado: ['Encerrado', 'neutro'], vencido: ['Vencido', 'aten'] };
const SESSAO = { agendada: ['Agendada', 'neutro'], confirmada: ['Confirmada', 'info'], realizada: ['Realizada', 'ok'], falta: ['Faltou', 'ruim'], falta_justificada: ['Falta justificada', 'aten'], cancelada: ['Cancelada', 'neutro'] };
const s = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/** Barra de progresso: realizadas (escuro), agendadas (claro) e o que ainda está livre. */
export const barraPacote = (p) => html`<div class="pk-barra" role="img" aria-label="${p.usadas} de ${p.qtd} sessões realizadas, ${p.agendadas} agendadas"><i class="pk-usadas" style="width:${Math.min(100, (p.usadas / p.qtd) * 100)}%"></i><i class="pk-agendadas" style="width:${Math.min(100 - Math.min(100, (p.usadas / p.qtd) * 100), (p.agendadas / p.qtd) * 100)}%"></i></div>`;
export const textoSaldo = (p) => `${s(p.usadas, 'sessão realizada', 'sessões realizadas')} de ${p.qtd}${p.agendadas ? ` · ${s(p.agendadas, 'agendada', 'agendadas')}` : ''}${p.livres ? ` · ${s(p.livres, 'livre para marcar', 'livres para marcar')}` : ''}`;
/** Leva à agenda já com o pacote escolhido para marcar as sessões. */
export const irParaAgenda = (p) => { location.hash = `#/agenda?paciente=${p.pacienteId}&pacote=${p.id}`; };

/** Pacotes de um paciente (todos, para o histórico). Falha em silêncio: a ficha continua abrindo. */
export async function pacotesDoPaciente(pacienteId, so = '') {
  try { return (await api.get(`pacotes?paciente=${pacienteId}${so ? '&situacao=' + so : ''}`)).itens; } catch { return []; }
}

/* ================================================================= vender o pacote */
export async function venderPacote({ pacienteId = null, depois } = {}) {
  await carregarBase(['servicos', 'contas']); let pacientes = [];
  try { pacientes = (await api.get('pacientes?status=todos')).itens.filter((p) => p.status !== 'arquivado'); } catch (e) { aviso(e.message, 'erro'); return; }
  if (!pacientes.length) { aviso('Cadastre um paciente antes de vender um pacote.', 'erro'); location.hash = '#/pacientes'; return; }
  const contas = App.cache.contas.filter((c) => c.ativo && c.tipo !== 'cartao'); const servicos = App.cache.servicos.filter((x) => x.ativo);
  const ini = pacientes.find((p) => p.id === pacienteId) || null; let tocouValor = false;
  const m = abrirModal({ titulo: 'Vender pacote de sessões', largo: true, corpo: html`<div><p class="erro-form" role="alert" hidden></p>
    ${combo({ id: 'pacienteId', rotulo: 'Paciente', obrig: true, valor: ini ? ini.id : '', vazio: 'Escolha o paciente', opcoes: pacientes.map((p) => [p.id, p.nome]) })}
    <div class="grade-3">${campo({ id: 'qtdSessoes', rotulo: 'Quantidade de sessões', tipo: 'number', valor: 10, obrig: true, extra: 'min="1" max="60"' })}${campoDinheiro({ id: 'valorTotal', rotulo: 'Valor total do pacote', obrig: true })}
      ${campo({ id: 'servicoId', rotulo: 'Tipo de atendimento', valor: '', opcoes: [['', 'O padrão do paciente'], ...servicos.map((x) => [x.id, x.nome])] })}</div>
    <p class="suave peq" id="pk-conta" style="margin:-6px 0 12px" aria-live="polite"></p>
    ${campo({ id: 'nome', rotulo: 'Nome do pacote (opcional)', placeholder: 'Ex.: Pacote de 10 sessões', extra: 'maxlength="120"' })}
    <fieldset style="border:0;padding:0;margin:4px 0 8px;min-width:0"><legend style="font-weight:600;font-size:.9rem;margin-bottom:6px">Pagamento</legend>
      <label class="marca"><input type="radio" name="quando" value="recebido" checked><span><strong>Já recebi</strong> (à vista)</span></label>
      <div data-q="recebido" class="grade-3">${campo({ id: 'dataRecebido', rotulo: 'Data do recebimento', tipo: 'date', valor: App.hoje, extra: `max="${App.hoje}"` })}${campo({ id: 'forma', rotulo: 'Forma', valor: '', opcoes: FORMAS })}${campo({ id: 'contaFinId', rotulo: 'Entrou em', valor: contas[0] ? contas[0].id : '', opcoes: contas.map((c) => [c.id, c.nome]) })}</div>
      <label class="marca"><input type="radio" name="quando" value="receber"><span><strong>Vai pagar depois</strong> (fica a receber, em uma ou mais parcelas)</span></label>
      <div data-q="receber" class="grade-2" hidden>${campo({ id: 'vencimento', rotulo: 'Primeiro vencimento', tipo: 'date', valor: App.hoje })}${campo({ id: 'parcelas', rotulo: 'Parcelas', tipo: 'number', valor: 1, extra: 'min="1" max="12"' })}</div></fieldset>
    <div class="grade-2">${campo({ id: 'validade', rotulo: 'Válido até (opcional)', tipo: 'date', ajuda: 'Depois dessa data não dá para marcar sessões com o pacote.' })}${campo({ id: 'obs', rotulo: 'Observação (administrativa)', extra: 'maxlength="300"' })}</div></div>`,
    acoes: [{ id: 'cancelar', rotulo: 'Cancelar' }, { id: 'ok', rotulo: 'Vender pacote', classe: 'btn-pri' }] });
  const form = $('form', m.el); ligarCombos(m.el); const el = (n) => form.elements[n]; const erro = (msg) => { const x = $('.erro-form', form); x.textContent = msg; x.hidden = false; x.scrollIntoView({ block: 'nearest' }); };
  const paciente = () => pacientes.find((p) => p.id === Number(el('pacienteId').value)) || null;
  const valorAvulso = () => { const p = paciente(); const sv = servicoPorId(Number(el('servicoId').value) || (p && p.servicoId)); return (p && p.valorSessao) || (sv && sv.valor) || 0; };
  const atualizar = () => {
    const q = Math.max(1, Number(el('qtdSessoes').value) || 0); const avulso = valorAvulso() * q;
    if (!tocouValor && avulso) el('valorTotal').value = num2(avulso);
    const total = lerReais(el('valorTotal').value) || 0; const unit = total ? Math.round(total / q) : 0;
    $('#pk-conta', form).textContent = total ? `= ${brl(unit)} por sessão${avulso > total ? ` · o valor avulso de ${q} sessões seria ${brl(avulso)}: desconto de ${brl(avulso - total)} (${Math.round(((avulso - total) / avulso) * 100)}%)` : ''}.` : '';
  };
  el('valorTotal').addEventListener('input', () => { tocouValor = true; atualizar(); });
  ['qtdSessoes', 'servicoId'].forEach((n) => el(n).addEventListener('input', atualizar)); el('servicoId').addEventListener('change', atualizar);
  el('pacienteId').addEventListener('change', atualizar);
  form.addEventListener('change', (e) => { if (e.target.name === 'quando') mostrarQuando(form, e.target.value); });
  const mostrarQuando = (f, v) => { f.querySelectorAll('[data-q]').forEach((d) => { d.hidden = d.dataset.q !== v; }); };
  atualizar();
  m.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-acao]'); if (!b) return; if (b.dataset.acao === 'cancelar') return m.fechar();
    const d = dadosForm(form); $('.erro-form', form).hidden = true;
    const total = lerReais(d.valorTotal); if (!d.pacienteId) return erro('Escolha o paciente.'); if (!total || total <= 0) return erro('Informe o valor total do pacote.');
    const corpo = { pacienteId: Number(d.pacienteId), qtdSessoes: Number(d.qtdSessoes), valorTotal: total, nome: d.nome || undefined, servicoId: d.servicoId ? Number(d.servicoId) : undefined, validade: d.validade || undefined, obs: d.obs || undefined };
    if (d.quando === 'recebido') corpo.recebido = { data: d.dataRecebido || App.hoje, forma: d.forma || null, contaFinId: d.contaFinId ? Number(d.contaFinId) : undefined };
    else { corpo.vencimento = d.vencimento || App.hoje; corpo.parcelas = Number(d.parcelas) || 1; }
    b.disabled = true;
    try {
      const r = await api.post('pacotes', corpo); m.fechar(); if (depois) depois(r.item);
      proximoPasso(r.item);
    } catch (er) { erro(er.message); b.disabled = false; }
  });
}
/** Depois de vender: o passo natural é marcar as sessões. */
function proximoPasso(p) {
  const x = abrirModal({ titulo: 'Pacote registrado', corpo: html`<p style="margin:0 0 8px"><strong>${p.nome}</strong> · ${p.paciente}</p>
    <p class="suave" style="margin:0 0 14px">${p.pago ? `${brl(p.pago)} recebido.` : `${brl(p.aReceber)} a receber.`} O pacote tem ${s(p.qtd, 'sessão', 'sessões')} (${brl(p.valorSessao)} cada) e nenhuma delas gera nova cobrança.</p>
    <p style="margin:0">Quer marcar as sessões agora? Escolha o dia e o horário da primeira e o sistema marca as ${p.qtd} de uma vez, todas ligadas a este pacote.</p>`,
    acoes: [{ id: 'depois', rotulo: 'Marcar depois' }, { id: 'agendar', rotulo: `Marcar as ${p.qtd} sessões`, classe: 'btn-pri' }] });
  x.el.addEventListener('click', (e) => { const b = e.target.closest('[data-acao]'); if (!b) return; x.fechar(); if (b.dataset.acao === 'agendar') irParaAgenda(p); });
}

/* ================================================================= ver / ajustar um pacote */
export async function abrirPacote(id, depois) {
  let r; try { r = await api.get('pacotes/' + id); } catch (e) { aviso(e.message, 'erro'); return; }
  const p = r.item; const pode = !somenteLeitura();
  const m = abrirModal({ titulo: p.nome, largo: true, corpo: html`<div>
    <p style="margin:0 0 8px"><a href="#/pacientes/${p.pacienteId}" data-fechar><strong>${p.paciente}</strong></a> ${selo(...SELO_PACOTE[p.situacao])}${p.validade ? html` <span class="suave peq">· válido até ${dataBR(p.validade)}</span>` : ''}</p>
    ${barraPacote(p)}<p class="suave peq" style="margin:6px 0 12px">${textoSaldo(p)}.</p>
    <div class="kpis" style="grid-template-columns:repeat(3,1fr)"><div class="kpi"><span>Valor do pacote</span><strong>${brl(p.valorTotal)}</strong><small class="suave">${brl(p.valorSessao)} por sessão</small></div><div class="kpi ok"><span>Já recebido</span><strong>${brl(p.pago)}</strong></div><div class="kpi ${p.aReceber ? 'alerta' : ''}"><span>A receber</span><strong>${brl(p.aReceber)}</strong></div></div>
    ${p.adiantado ? html`<p class="suave peq" style="margin:-6px 0 12px">Recebido adiantado, ainda a realizar: <strong>${brl(p.adiantado)}</strong>.</p>` : ''}
    <h4 style="margin:6px 0 6px">Pagamento</h4><ul class="lista">${r.lancamentos.map((l) => html`<li class="linha linha-link" data-lanc="${l.id}" tabindex="0" role="button"><div class="corpo"><span class="tit">${l.descricao}</span><span class="sub">${l.situacao === 'quitado' ? `Recebido${l.ultimaBaixa ? ` em ${dataBR(l.ultimaBaixa)}` : ''}` : l.situacao === 'cancelado' ? 'Cancelada' : `Vence em ${dataBR(l.vencimento)}${l.pago ? ` · recebido ${brl(l.pago)}` : ''}`}</span></div><strong class="num">${brl(l.valor)}</strong></li>`)}</ul>
    <h4 style="margin:14px 0 6px">Sessões deste pacote (${r.sessoes.length})</h4>
    ${r.sessoes.length ? html`<ul class="lista pk-sessoes">${r.sessoes.map((x) => html`<li class="linha"><div class="corpo"><span class="tit">${dataLonga(x.inicio.slice(0, 10))}, ${hhmm(x.inicio)}</span></div>${selo(...(SESSAO[x.status] || [x.status, 'neutro']))}</li>`)}</ul>` : html`<p class="suave">Nenhuma sessão marcada ainda.</p>`}
    ${p.obs ? html`<p class="peq" style="white-space:pre-wrap;margin-top:12px">${p.obs}</p>` : ''}
    ${p.faltasContam ? html`<p class="suave peq" style="margin-top:10px">Pela sua política (Configurações), faltas cobradas também usam uma sessão do pacote.</p>` : html`<p class="suave peq" style="margin-top:10px">Faltas não usam sessão do pacote (a vaga volta). Dá para mudar a política em Configurações.</p>`}
    ${pode ? html`<div class="pac-acoes" style="margin-top:14px">${p.livres > 0 ? html`<button class="btn btn-pri btn-peq" data-agendar>Marcar sessões (${p.livres} livre${p.livres === 1 ? '' : 's'})</button>` : ''}<button class="btn btn-sec btn-peq" data-editar>Editar</button>
      ${p.situacao === 'encerrado' ? html`<button class="btn btn-sec btn-peq" data-reabrir>Reabrir</button>` : html`<button class="btn btn-ghost btn-peq" data-encerrar style="color:var(--perigo)">Encerrar pacote</button>`}${!r.sessoes.length ? html`<button class="btn btn-ghost btn-peq" data-apagar style="color:var(--perigo)">Apagar</button>` : ''}</div>` : ''}</div>`, acoes: [] });
  const fim = () => { m.fechar(); if (depois) depois(); };
  const abrirLanc = (lid) => { m.fechar(); detalheLancamento(lid, () => abrirPacote(id, depois)); };
  m.el.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('li[data-lanc]')) { e.preventDefault(); abrirLanc(Number(e.target.dataset.lanc)); } });
  m.el.addEventListener('click', async (e) => {
    const lc = e.target.closest('[data-lanc]'); if (lc) return abrirLanc(Number(lc.dataset.lanc));
    if (e.target.closest('a[href^="#/"]')) return m.fechar();
    if (e.target.closest('[data-agendar]')) { m.fechar(); return irParaAgenda(p); }
    if (e.target.closest('[data-editar]')) { m.fechar(); return editarPacote(p, () => { if (depois) depois(); abrirPacote(id, depois); }); }
    if (e.target.closest('[data-reabrir]')) { try { await api.post(`pacotes/${id}/reabrir`, {}); aviso('Pacote reaberto.'); fim(); } catch (er) { aviso(er.message, 'erro'); } return; }
    if (e.target.closest('[data-encerrar]')) {
      if (!(await confirmar(`Encerrar «${p.nome}»? Ele deixa de receber sessões. ${p.agendadas ? `As ${s(p.agendadas, 'sessão agendada', 'sessões agendadas')} que ainda não aconteceram voltam a ser cobradas como sessões comuns. ` : ''}As já realizadas continuam ligadas ao pacote. ${p.restam ? `Ficam ${s(p.restam, 'sessão sem usar', 'sessões sem usar')} (${brl(p.adiantado)} recebido adiantado): se for devolver, registre o estorno em "A receber".` : ''}`, { titulo: 'Encerrar pacote', ok: 'Encerrar', perigo: true }))) return;
      try { const x = await api.post(`pacotes/${id}/encerrar`, {}); aviso(x.soltas ? `Pacote encerrado. ${s(x.soltas, 'sessão voltou', 'sessões voltaram')} a ser cobrada${x.soltas === 1 ? '' : 's'} normalmente.` : 'Pacote encerrado.'); fim(); } catch (er) { aviso(er.message, 'erro'); } return;
    }
    if (e.target.closest('[data-apagar]')) {
      if (!(await confirmar('Apagar este pacote? Só é possível se foi lançado por engano: sem sessões e sem recebimento registrado. A cobrança dele também é removida.', { titulo: 'Apagar pacote', ok: 'Apagar', perigo: true }))) return;
      try { await api.del('pacotes/' + id); aviso('Pacote apagado.'); fim(); } catch (er) { aviso(er.message, 'erro'); }
    }
  });
}

function editarPacote(p, depois) {
  const m = abrirModal({ titulo: 'Editar pacote', corpo: html`<div><p class="erro-form" role="alert" hidden></p>
    ${campo({ id: 'nome', rotulo: 'Nome', valor: p.nome, obrig: true, extra: 'maxlength="120"' })}
    <div class="grade-2">${campo({ id: 'qtdSessoes', rotulo: 'Quantidade de sessões', tipo: 'number', valor: p.qtd, extra: `min="${Math.max(1, p.usadas + p.agendadas)}" max="60"`, ajuda: `Não pode ficar abaixo de ${p.usadas + p.agendadas} (realizadas + agendadas).` })}${campo({ id: 'validade', rotulo: 'Válido até', tipo: 'date', valor: p.validade || '' })}</div>
    ${campo({ id: 'obs', rotulo: 'Observação', tipo: 'textarea', valor: p.obs || '', extra: 'maxlength="300"' })}
    <p class="suave peq">O valor do pacote não muda aqui: se precisar, ajuste a cobrança dele (em "A receber").</p></div>`, acoes: [{ id: 'cancelar', rotulo: 'Cancelar' }, { id: 'ok', rotulo: 'Salvar', classe: 'btn-pri' }] });
  const form = $('form', m.el);
  m.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-acao]'); if (!b) return; if (b.dataset.acao === 'cancelar') return m.fechar(); const d = dadosForm(form); b.disabled = true;
    try { await api.put('pacotes/' + p.id, { nome: d.nome, qtdSessoes: Number(d.qtdSessoes), validade: d.validade || null, obs: d.obs || null }); m.fechar(); aviso('Pacote atualizado.'); depois(); }
    catch (er) { const x = $('.erro-form', form); x.textContent = er.message; x.hidden = false; b.disabled = false; }
  });
}
