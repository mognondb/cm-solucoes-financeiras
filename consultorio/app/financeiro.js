/* Peças financeiras usadas em mais de uma tela (Início, A receber, ficha do paciente): receber um pagamento, ver e editar um lançamento,
   registrar um contato de cobrança e chamar o paciente pelo WhatsApp com a mensagem já preenchida. */
import { api } from './api.js';
import { App, carregarBase, categoriasDe, profissionalPorId, somenteLeitura } from './estado.js';
import { html, raw, montar, $, abrirModal, confirmar, aviso, campo, campoDinheiro, dadosForm, lerReais, brl, selo, dataBR, hhmm, linkWhats, preencher, primeiroNome, dataDe, DIAS, MESES } from './ui.js';

export const FORMAS = [['', 'Não informar'], ['pix', 'PIX'], ['dinheiro', 'Dinheiro'], ['debito', 'Cartão de débito'], ['credito', 'Cartão de crédito'], ['transferencia', 'Transferência bancária'], ['boleto', 'Boleto'], ['convenio', 'Convênio'], ['debito_automatico', 'Débito automático'], ['outro', 'Outro']];
export const FORMA_NOME = Object.fromEntries(FORMAS.filter(([k]) => k));
const CANAIS = [['whatsapp', 'WhatsApp'], ['telefone', 'Ligação'], ['email', 'E-mail'], ['pessoalmente', 'Pessoalmente'], ['outro', 'Outro']];
export const CANAL_NOME = Object.fromEntries(CANAIS);

/** Texto e cor do selo de um lançamento, conforme o estado calculado pelo servidor. */
export function seloLancamento(l) {
  switch (l.estado) {
    case 'atrasado': return [`${l.atraso} dia${l.atraso === 1 ? '' : 's'} de atraso`, 'ruim'];
    case 'hoje': return ['Vence hoje', 'aten'];
    case 'parcial': return [`Parcial · falta ${brl(l.restante)}`, 'aten'];
    case 'quitado': return ['Pago', 'ok'];
    case 'cancelado': return ['Cancelado', 'neutro'];
    default: return ['A vencer', 'neutro'];
  }
}

/** Mensagem do que o servidor fez com a cobrança ao mudar a situação de uma sessão. */
export function avisoCobranca(r) {
  const c = (r && r.cobranca) || {};
  if (c.acao === 'criada') aviso(`Cobrança de ${brl(c.valor)} gerada (vence em ${dataBR(c.vencimento)}).`);
  else if (c.acao === 'atualizada' || c.acao === 'reaberta') aviso('Cobrança desta sessão atualizada.');
  else if (c.acao === 'cancelada') aviso('A cobrança desta sessão foi cancelada.');
  else if (c.acao === 'mantida') aviso('Esta cobrança já tem pagamento e foi mantida como estava.');
  else if (c.acao === 'sem_valor') aviso('Sessão registrada, mas sem valor definido: nenhuma cobrança foi gerada. Defina o valor no cadastro do paciente.', 'erro', 7000);
  else aviso('Situação da sessão atualizada.');
}

/** Muda a situação de uma sessão e avisa o que aconteceu com a cobrança. Devolve a resposta (ou null se falhou). */
export async function mudarSituacaoSessao(id, status, escopo = 'este') {
  try { const r = await api.post(`agenda/${id}/status`, { status, escopo }); avisoCobranca(r); return r; } catch (er) { aviso(er.message, 'erro'); return null; }
}

/* ================================================================= WhatsApp e contatos */
/** Quem recebe a cobrança (o responsável financeiro, quando há) e a mensagem pronta. */
export function mensagemCobranca(pac, itens) {
  const venc = itens.filter((l) => l.vencimento < App.hoje); const base = venc.length ? venc : itens;
  const total = base.reduce((a, l) => a + (l.restante ?? l.valor - (l.pago || 0)), 0); const maisAntiga = base.map((l) => l.vencimento).sort()[0];
  const paraResp = pac.respTelefone && (pac.respNome || pac.tipo === 'infantil'); const tel = paraResp ? pac.respTelefone : pac.telefone;
  const nome = paraResp && pac.respNome ? pac.respNome : (pac.apelido || pac.nome); const prof = profissionalPorId(pac.profissionalId) || (App.eu.profissionais || [])[0];
  const msg = preencher(App.eu.config.msg_cobranca, { nome: primeiroNome(nome), descricao: base.length === 1 ? base[0].descricao : `${base.length} atendimentos`, valor: brl(total), vencimento: dataBR(maisAntiga), profissional: prof ? prof.nome : (App.eu.conta.nome || '') });
  return { url: linkWhats(tel, msg), total };
}
/** Abre o WhatsApp e registra que o paciente foi cobrado (assim o "último contato" fica visível). */
export async function cobrarWhatsApp(pac, itens, depois) {
  const { url } = mensagemCobranca(pac, itens);
  if (!url) { aviso('Este paciente não tem telefone cadastrado.', 'erro'); return; }
  window.open(url, '_blank', 'noopener');
  if (somenteLeitura()) return;
  try { await api.post(`pacientes/${pac.id ?? pac.pacienteId}/cobrancas`, { canal: 'whatsapp', obs: 'Mensagem de cobrança aberta no WhatsApp' }); if (depois) depois(); } catch { /* o registro é um extra: não atrapalha a cobrança */ }
}

/** Link do WhatsApp pedindo a confirmação de uma sessão (mensagem editável em Configurações). */
export function linkConfirmacao(a) {
  if (!a.pac) return '';
  const resp = a.pac.respTelefone && (a.pac.respNome || a.pac.tipo === 'infantil'); const tel = resp ? a.pac.respTelefone : a.pac.telefone;
  const nome = resp && a.pac.respNome ? a.pac.respNome : (a.pac.apelido || a.pac.nome); const prof = profissionalPorId(a.profissionalId) || (App.eu.profissionais || [])[0];
  const d = dataDe(a.inicio.slice(0, 10));
  return linkWhats(tel, preencher(App.eu.config.msg_confirmacao, { nome: primeiroNome(nome), dia: `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`, hora: hhmm(a.inicio), profissional: prof ? prof.nome : (App.eu.conta.nome || '') }));
}

export function abrirContato(pacienteId, nome, depois, lancamentoId = null) {
  const m = abrirModal({ titulo: 'Registrar contato', corpo: html`<div><p class="erro-form" role="alert" hidden></p><p class="suave peq">Anote como você cobrou ${nome}. Se houver promessa de pagamento, informe a data: ela aparece na lista de quem deve.</p>
    ${campo({ id: 'canal', rotulo: 'Como foi o contato', valor: 'whatsapp', opcoes: CANAIS })}${campo({ id: 'obs', rotulo: 'Observação', placeholder: 'Ex.: disse que paga na sexta' })}${campo({ id: 'promessaEm', rotulo: 'Prometeu pagar até (opcional)', tipo: 'date' })}</div>`,
    acoes: [{ id: 'cancelar', rotulo: 'Cancelar' }, { id: 'salvar', rotulo: 'Registrar', classe: 'btn-pri' }] });
  const form = $('form', m.el);
  m.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-acao]'); if (!b) return; if (b.dataset.acao === 'cancelar') return m.fechar();
    const d = dadosForm(form); b.disabled = true;
    try { await api.post(`pacientes/${pacienteId}/cobrancas`, { canal: d.canal, obs: d.obs, promessaEm: d.promessaEm || null, lancamentoId }); m.fechar(); aviso('Contato registrado.'); if (depois) depois(); } catch (er) { const x = $('.erro-form', form); x.textContent = er.message; x.hidden = false; b.disabled = false; }
  });
}

/* ================================================================= pagamento */
export async function abrirPagamento(l, depois) {
  await carregarBase(['contas']); const contas = App.cache.contas.filter((c) => c.ativo && c.tipo !== 'cartao');
  const forma = (l.paciente && l.paciente.forma) || '';
  const m = abrirModal({ titulo: 'Registrar pagamento', corpo: html`<div><p class="erro-form" role="alert" hidden></p>
    <p style="margin:0 0 12px"><strong>${l.descricao}</strong>${l.paciente ? html`<br><span class="suave">${l.paciente.nome}</span>` : l.contraparte ? html`<br><span class="suave">${l.contraparte}</span>` : ''}<br><span class="suave peq">Saldo em aberto: ${brl(l.restante)}${l.pago ? ` (já pago ${brl(l.pago)})` : ''}</span></p>
    <div class="grade-2">${campoDinheiro({ id: 'valor', rotulo: 'Valor recebido', valor: l.restante, obrig: true, ajuda: 'Pode ser menos que o saldo: fica o restante em aberto.' })}${campo({ id: 'data', rotulo: 'Data do pagamento', tipo: 'date', valor: App.hoje, obrig: true, extra: `max="${App.hoje}"` })}</div>
    <div class="grade-2">${campo({ id: 'forma', rotulo: 'Forma de pagamento', valor: forma, opcoes: FORMAS })}${campo({ id: 'contaFinId', rotulo: 'Entrou em', valor: contas[0] ? contas[0].id : '', opcoes: contas.map((c) => [c.id, c.nome]) })}</div>
    ${campo({ id: 'obs', rotulo: 'Observação', extra: 'maxlength="200"' })}</div>`, acoes: [{ id: 'cancelar', rotulo: 'Cancelar' }, { id: 'salvar', rotulo: 'Registrar pagamento', classe: 'btn-pri' }] });
  const form = $('form', m.el);
  m.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-acao]'); if (!b) return; if (b.dataset.acao === 'cancelar') return m.fechar();
    const d = dadosForm(form); const v = lerReais(d.valor); b.disabled = true;
    const falha = (msg) => { const x = $('.erro-form', form); x.textContent = msg; x.hidden = false; b.disabled = false; };
    if (!v || v <= 0) return falha('Informe o valor recebido.');
    try {
      const r = await api.post(`lancamentos/${l.id}/baixas`, { valor: v, data: d.data, forma: d.forma || null, contaFinId: d.contaFinId ? Number(d.contaFinId) : null, obs: d.obs });
      m.fechar(); aviso(r.situacao === 'quitado' ? 'Pagamento registrado. Cobrança quitada.' : `Pagamento registrado. Ainda faltam ${brl(r.restante)}.`); if (depois) depois();
    } catch (er) { falha(er.message); }
  });
}

/* ================================================================= detalhe do lançamento */
const ORIGEM = { manual: 'Lançamento manual', sessao: 'Gerada pela sessão', mensalidade: 'Mensalidade automática', convenio: 'Gerada pela sessão (convênio)', recorrente: 'Despesa fixa', importacao: 'Importada do extrato' };
export async function detalheLancamento(id, depois) {
  let r; try { r = await api.get('lancamentos/' + id); } catch (e) { aviso(e.message, 'erro'); return; }
  const l = r.item; const pode = !somenteLeitura(); const pagar = l.tipo === 'pagar';
  const m = abrirModal({ titulo: l.descricao, largo: true, corpo: html`<div>
    <p style="margin:0 0 8px">${selo(...seloLancamento(l))} <span class="suave peq">${ORIGEM[l.origem] || ''}${l.sessaoEm ? ` de ${dataBR(l.sessaoEm.slice(0, 10))} às ${hhmm(l.sessaoEm)}` : ''}${l.parcelas ? ` · parcela ${l.parcela}/${l.parcelas}` : ''}</span></p>
    <div class="kpis" style="grid-template-columns:repeat(3,1fr);margin:10px 0"><div class="kpi"><span>Valor</span><strong>${brl(l.valor)}</strong></div><div class="kpi ok"><span>${pagar ? 'Pago' : 'Recebido'}</span><strong>${brl(l.pago)}</strong></div><div class="kpi ${l.estado === 'atrasado' ? 'alerta' : ''}"><span>Falta</span><strong>${brl(l.restante)}</strong></div></div>
    <dl class="detalhes"><dt>Vencimento</dt><dd>${dataBR(l.vencimento)}</dd><dt>Competência</dt><dd>${dataBR(l.competencia)}</dd>
      ${l.paciente ? html`<dt>Paciente</dt><dd><a href="#/pacientes/${l.paciente.id}" data-fechar>${l.paciente.nome}</a></dd>` : ''}${l.contraparte ? html`<dt>${pagar ? 'Fornecedor' : 'Contraparte'}</dt><dd>${l.contraparte}</dd>` : ''}
      ${l.categoria ? html`<dt>Categoria</dt><dd>${l.categoria}</dd>` : ''}${l.canceladoMotivo ? html`<dt>Motivo do cancelamento</dt><dd>${l.canceladoMotivo}</dd>` : ''}</dl>
    ${l.obs ? html`<p class="peq" style="white-space:pre-wrap;margin-top:10px">${l.obs}</p>` : ''}
    <h4 style="margin:16px 0 6px">${pagar ? 'Pagamentos feitos' : 'Pagamentos recebidos'}</h4>
    ${r.baixas.length ? html`<ul class="lista">${r.baixas.map((b) => html`<li class="linha"><div class="corpo"><span class="tit">${brl(b.valor)} · ${dataBR(b.data)}</span><span class="sub">${FORMA_NOME[b.forma] || 'Forma não informada'}${b.conta ? ` · ${b.conta}` : ''}${b.obs ? ` · ${b.obs}` : ''}</span></div>${pode ? html`<button class="btn btn-ghost btn-peq" data-estornar="${b.id}" style="color:var(--perigo)">Estornar</button>` : ''}</li>`)}</ul>` : html`<p class="suave peq">Nenhum pagamento ainda.</p>`}
    ${r.cobrancas.length ? html`<h4 style="margin:16px 0 6px">Contatos de cobrança</h4><ul class="lista">${r.cobrancas.map((c) => html`<li class="linha"><div class="corpo"><span class="tit">${CANAL_NOME[c.canal] || c.canal} · ${dataBR(String(c.criado_em).slice(0, 10))}</span><span class="sub">${c.obs || ''}${c.promessa_em ? ` · prometeu pagar até ${dataBR(c.promessa_em)}` : ''}</span></div></li>`)}</ul>` : ''}
    ${pode ? html`<div class="pac-acoes" style="margin-top:16px">
      ${l.situacao === 'aberto' ? html`<button class="btn btn-pri btn-peq" data-pagar>${pagar ? 'Registrar pagamento' : 'Receber'}</button>` : ''}
      ${l.situacao !== 'cancelado' ? html`<button class="btn btn-sec btn-peq" data-editar>Editar</button>` : ''}
      ${l.situacao === 'aberto' && l.paciente && !pagar ? html`<button class="btn btn-sec btn-peq" data-zap>Cobrar no WhatsApp</button><button class="btn btn-sec btn-peq" data-contato>Registrar contato</button>` : ''}
      ${l.situacao === 'aberto' && !l.pago ? html`<button class="btn btn-ghost btn-peq" data-cancelar style="color:var(--perigo)">Cancelar cobrança</button>` : ''}
      ${l.situacao === 'cancelado' ? html`<button class="btn btn-sec btn-peq" data-reabrir>Reabrir</button>` : ''}</div>` : ''}</div>`, acoes: [] });
  const fecharERecarregar = () => { m.fechar(); if (depois) depois(); };
  m.el.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('a[href^="#/"]')) return m.fechar();
    if (t.closest('[data-pagar]')) { m.fechar(); return abrirPagamento(l, depois); }
    if (t.closest('[data-editar]')) { m.fechar(); return abrirLancamento({ editar: l }, depois); }
    if (t.closest('[data-zap]')) return cobrarWhatsApp({ ...l.paciente, id: l.paciente.id }, [l], depois);
    if (t.closest('[data-contato]')) { m.fechar(); return abrirContato(l.paciente.id, l.paciente.nome, depois, l.id); }
    const est = t.closest('[data-estornar]');
    if (est) { if (!(await confirmar('Estornar este pagamento? O valor volta a ficar em aberto.', { titulo: 'Estornar pagamento', ok: 'Estornar', perigo: true }))) return; try { await api.del('baixas/' + est.dataset.estornar); aviso('Pagamento estornado.'); fecharERecarregar(); } catch (er) { aviso(er.message, 'erro'); } return; }
    if (t.closest('[data-cancelar]')) {
      const motivo = await perguntarMotivo(); if (motivo === null) return;
      try { await api.post(`lancamentos/${l.id}/cancelar`, { motivo }); aviso('Cobrança cancelada.'); fecharERecarregar(); } catch (er) { aviso(er.message, 'erro'); } return;
    }
    if (t.closest('[data-reabrir]')) { try { await api.post(`lancamentos/${l.id}/reabrir`, {}); aviso('Cobrança reaberta.'); fecharERecarregar(); } catch (er) { aviso(er.message, 'erro'); } }
  });
}
function perguntarMotivo() {
  return new Promise((res) => {
    let r = null; const m = abrirModal({ titulo: 'Cancelar cobrança', corpo: html`<div><p class="suave peq">A cobrança deixa de contar como a receber, mas continua registrada. Use quando o valor foi perdoado ou lançado por engano.</p>${campo({ id: 'motivo', rotulo: 'Motivo (opcional)', placeholder: 'Ex.: combinado em consulta' })}</div>`, acoes: [{ id: 'cancelar', rotulo: 'Voltar' }, { id: 'ok', rotulo: 'Cancelar cobrança', classe: 'btn-perigo' }], aoFechar: () => res(r) });
    m.el.addEventListener('click', (e) => { const b = e.target.closest('[data-acao]'); if (!b) return; if (b.dataset.acao === 'ok') r = $('#motivo', m.el).value.trim(); m.fechar(); });
  });
}

/* ================================================================= novo / editar lançamento */
export async function abrirLancamento({ editar, tipo = 'receber', pacienteId } = {}, depois) {
  const l = editar || null; const t = l ? l.tipo : tipo; const receber = t === 'receber';
  await carregarBase(['categorias', 'contas']); let pacientes = [];
  if (receber) { try { pacientes = (await api.get('pacientes?status=todos')).itens.filter((p) => p.status !== 'arquivado'); } catch (e) { aviso(e.message, 'erro'); return; } }
  const cats = categoriasDe(receber ? 'receita' : 'despesa'); const contas = App.cache.contas.filter((c) => c.ativo && c.tipo !== 'cartao');
  const m = abrirModal({ titulo: l ? 'Editar lançamento' : receber ? 'Nova cobrança' : 'Nova conta a pagar', largo: true, corpo: html`<div><p class="erro-form" role="alert" hidden></p>
    ${campo({ id: 'descricao', rotulo: 'Descrição', valor: l ? l.descricao : '', obrig: true, placeholder: receber ? 'Ex.: Avaliação psicológica, palestra, aluguel de sala' : 'Ex.: aluguel, internet, supervisão', extra: 'maxlength="150"' })}
    <div class="grade-3">${campoDinheiro({ id: 'valor', rotulo: l ? 'Valor' : 'Valor total', valor: l ? l.valor : 0, obrig: true })}${campo({ id: 'vencimento', rotulo: 'Vencimento', tipo: 'date', valor: l ? l.vencimento : App.hoje, obrig: true })}
      ${l ? '' : campo({ id: 'parcelas', rotulo: 'Parcelas', tipo: 'number', valor: 1, extra: 'min="1" max="60"', ajuda: 'Mensais, com o valor dividido.' })}</div>
    <div class="grade-2">${receber ? campo({ id: 'pacienteId', rotulo: 'Paciente (opcional)', valor: l ? l.pacienteId || '' : pacienteId || '', opcoes: [['', 'Sem paciente'], ...pacientes.map((p) => [p.id, p.nome])] }) : campo({ id: 'contraparte', rotulo: 'Fornecedor (opcional)', valor: l ? l.contraparte || '' : '' })}
      ${campo({ id: 'categoriaId', rotulo: 'Categoria', valor: l ? l.categoriaId || '' : '', opcoes: [['', 'Sem categoria'], ...cats.map((c) => [c.id, c.nome])] })}</div>
    ${receber && l ? campo({ id: 'contraparte', rotulo: 'Contraparte (ex.: convênio)', valor: l.contraparte || '' }) : ''}
    ${l ? '' : html`<label class="marca" style="margin-bottom:10px"><input type="checkbox" name="jaPago" id="jaPago"><span>${receber ? 'Já recebi' : 'Já paguei'} (registrar o pagamento agora)</span></label>
      <div id="bloco-pago" hidden><div class="grade-3">${campo({ id: 'dataPago', rotulo: 'Data', tipo: 'date', valor: App.hoje, extra: `max="${App.hoje}"` })}${campo({ id: 'formaPago', rotulo: 'Forma', valor: '', opcoes: FORMAS })}${campo({ id: 'contaPago', rotulo: receber ? 'Entrou em' : 'Saiu de', valor: contas[0] ? contas[0].id : '', opcoes: contas.map((c) => [c.id, c.nome]) })}</div></div>`}
    ${campo({ id: 'obs', rotulo: 'Observação', tipo: 'textarea', valor: l ? l.obs || '' : '', extra: 'maxlength="300"' })}</div>`,
    acoes: [{ id: 'cancelar', rotulo: 'Cancelar' }, { id: 'salvar', rotulo: l ? 'Salvar' : 'Lançar', classe: 'btn-pri' }] });
  const form = $('form', m.el);
  const pago = form.elements.jaPago; if (pago) pago.addEventListener('change', () => { $('#bloco-pago', form).hidden = !pago.checked; if (pago.checked && form.elements.parcelas) form.elements.parcelas.value = 1; });
  m.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-acao]'); if (!b) return; if (b.dataset.acao === 'cancelar') return m.fechar();
    const d = dadosForm(form); const falha = (msg) => { const x = $('.erro-form', form); x.textContent = msg; x.hidden = false; b.disabled = false; }; b.disabled = true;
    const valor = lerReais(d.valor); if (!valor || valor <= 0) return falha('Informe o valor.');
    const corpo = { descricao: d.descricao, valor, vencimento: d.vencimento, categoriaId: d.categoriaId ? Number(d.categoriaId) : null, contraparte: d.contraparte, obs: d.obs };
    if (receber) corpo.pacienteId = d.pacienteId ? Number(d.pacienteId) : null;
    try {
      if (l) await api.put('lancamentos/' + l.id, corpo);
      else {
        corpo.tipo = t; corpo.parcelas = Number(d.parcelas) || 1;
        if (d.jaPago) { if (corpo.parcelas > 1) return falha('Para parcelar, registre o pagamento de cada parcela depois.'); corpo.quitar = { data: d.dataPago || App.hoje, forma: d.formaPago || null, contaFinId: d.contaPago ? Number(d.contaPago) : null }; }
        await api.post('lancamentos', corpo);
      }
      m.fechar(); aviso(l ? 'Lançamento atualizado.' : corpo.parcelas > 1 ? `${corpo.parcelas} parcelas lançadas.` : 'Lançamento criado.'); if (depois) depois();
    } catch (er) { falha(er.message); }
  });
}
