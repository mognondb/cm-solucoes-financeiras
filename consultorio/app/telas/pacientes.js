/* Pacientes: lista com busca e filtros, ficha com a situação financeira e formulário de cadastro.
   Só dados administrativos e financeiros: nada clínico (os campos de texto avisam). */
import { api, qs } from '../api.js';
import { App, carregarBase, servicoPorId, profissionalPorId, somenteLeitura } from '../estado.js';
import { html, raw, montar, $, $$, abrirModal, confirmar, aviso, campo, campoDinheiro, dadosForm, lerReais, brl, selo, vazio, fmtCPF, fmtTel, dataBR, dataCurta, dataDe, hhmm, diasEntre, linkWhats, preencher, primeiroNome, DIAS, DIAS_CURTOS } from '../ui.js';

const STATUS = { ativo: 'Ativo', pausado: 'Em pausa', alta: 'Alta', arquivado: 'Arquivado' };
const TIPOS = [['individual', 'Individual'], ['casal', 'Casal'], ['familia', 'Família'], ['infantil', 'Criança ou adolescente'], ['grupo', 'Grupo']];
const MODALIDADES = [['sessao', 'Por sessão'], ['mensal', 'Mensalidade'], ['convenio', 'Convênio / plano de saúde']];
const FORMAS = [['', 'Sem preferência'], ['pix', 'PIX'], ['dinheiro', 'Dinheiro'], ['debito', 'Cartão de débito'], ['credito', 'Cartão de crédito'], ['transferencia', 'Transferência bancária'], ['boleto', 'Boleto'], ['convenio', 'Convênio'], ['debito_automatico', 'Débito automático'], ['outro', 'Outro']];
const FORMA_NOME = Object.fromEntries(FORMAS.filter(([k]) => k));
const SESSAO = { agendada: ['Agendada', 'neutro'], confirmada: ['Confirmada', 'info'], realizada: ['Realizada', 'ok'], falta: ['Faltou', 'ruim'], falta_justificada: ['Falta justificada', 'aten'], cancelada: ['Cancelada', 'neutro'] };

/* Os filtros ficam guardados para a lista voltar do jeito que estava depois de abrir uma ficha. */
const filtro = { status: 'ativo', busca: '', atraso: false };

export async function abrir(el, args) {
  await carregarBase(['servicos']);
  if (args[0]) return ficha(el, Number(args[0]));
  return lista(el);
}

const inicial = (n) => (String(n || '?').trim().slice(0, 1) || '?').toUpperCase();
const corDe = (p) => (profissionalPorId(p.profissionalId) || {}).cor || '';
const avatar = (p) => { const cor = (App.eu.profissionais || []).length > 1 ? corDe(p) : ''; return html`<span class="avatar" style="${cor ? `background:${cor};color:#fff` : ''}">${inicial(p.nome)}</span>`; };
const rotuloNome = (p) => (p.apelido ? `${p.nome} (${p.apelido})` : p.nome);

/** "Hoje, 10:00", "Amanhã, 10:00", "seg 17/11, 10:00". */
function quando(dt) {
  if (!dt) return '';
  const d = String(dt).slice(0, 10); const n = diasEntre(App.hoje, d);
  const dia = n === 0 ? 'Hoje' : n === 1 ? 'Amanhã' : n === -1 ? 'Ontem' : `${DIAS_CURTOS[dataDe(d).getDay()]} ${dataCurta(d)}`;
  return `${dia}, ${hhmm(dt)}`;
}

function resumoCobranca(p) {
  if (p.modalidade === 'mensal') return `Mensalidade ${brl(p.valorMensal)}${p.diaVencimento ? ` · vence dia ${p.diaVencimento}` : ''}`;
  if (p.modalidade === 'convenio') return `${p.convenioNome || 'Convênio'}${p.valorSessao ? ` · ${brl(p.valorSessao)} por sessão` : ''}`;
  const s = servicoPorId(p.servicoId); const v = p.valorSessao || (s && s.valor) || 0;
  return v ? `${brl(v)} por sessão` : 'Valor da sessão não definido';
}

/* ================================================================= lista */
async function lista(el) {
  const podeEditar = !somenteLeitura();
  montar(el, html`<div class="cabeca"><div><h1>Pacientes</h1><p id="pac-sub">&nbsp;</p></div>${podeEditar ? html`<button class="btn btn-pri" id="pac-novo">Novo paciente</button>` : ''}</div>
    <div class="filtros"><div class="campo busca"><label class="sr" for="pac-busca">Buscar paciente</label><input id="pac-busca" type="search" placeholder="Buscar por nome, telefone ou CPF" autocomplete="off" value="${filtro.busca}"></div></div>
    <div class="chips" id="pac-chips" role="group" aria-label="Filtrar por situação" style="margin-bottom:14px"></div>
    <div id="pac-lista"><div class="carregando">Carregando…</div></div>`);
  let seq = 0; let ultimo = { contagem: {} };

  const desenharChips = () => {
    const c = ultimo.contagem || {};
    $('#pac-chips', el).innerHTML = [...Object.keys(STATUS).map((k) => `<button type="button" class="chip" data-st="${k}" aria-pressed="${!filtro.atraso && filtro.status === k}">${STATUS[k]}${c[k] ? ` · ${Number(c[k])}` : ''}</button>`),
      `<button type="button" class="chip" data-atraso="1" aria-pressed="${filtro.atraso}">Em atraso</button>`].join('');
  };
  const carregar = async () => {
    const minha = ++seq;
    try {
      const r = await api.get('pacientes' + qs({ status: filtro.atraso ? 'ativo' : filtro.status, busca: filtro.busca, inadimplentes: filtro.atraso ? 1 : '' }));
      if (minha !== seq) return; // chegou uma resposta mais nova (digitação rápida)
      ultimo = r; desenharChips(); desenharLista(r.itens);
      const total = Object.values(r.contagem || {}).reduce((a, b) => a + Number(b), 0);
      $('#pac-sub', el).textContent = total ? `${Number((r.contagem || {}).ativo || 0)} em acompanhamento` : 'Cadastre quem você atende para organizar agenda e cobranças.';
    } catch (e) { if (minha === seq) $('#pac-lista', el).innerHTML = `<div class="cartao vazio"><h3>Não foi possível carregar</h3><p>${e.message}</p></div>`; }
  };
  const desenharLista = (itens) => {
    const alvo = $('#pac-lista', el);
    const total = Object.values(ultimo.contagem || {}).reduce((a, b) => a + Number(b), 0);
    if (!itens.length) {
      montar(alvo, total === 0
        ? html`<div class="cartao">${vazio('Nenhum paciente ainda', 'Cadastre o primeiro para começar a agendar sessões e acompanhar os pagamentos.', podeEditar ? html`<button class="btn btn-pri" data-novo>Cadastrar paciente</button>` : '')}</div>`
        : html`<div class="cartao">${vazio(filtro.busca ? 'Ninguém encontrado' : filtro.atraso ? 'Nenhum pagamento em atraso' : 'Nenhum paciente nesta situação', filtro.busca ? 'Confira a grafia ou tente só parte do nome.' : filtro.atraso ? 'Tudo em dia por aqui.' : 'Use os filtros acima para ver os outros.')}</div>`);
      return;
    }
    montar(alvo, html`<div class="cartao" style="padding:6px 14px"><ul class="lista">${itens.map((p) => html`<li class="linha linha-link" data-id="${p.id}" tabindex="0" role="link" aria-label="Abrir ${p.nome}">
      ${avatar(p)}<div class="corpo"><span class="tit">${rotuloNome(p)}</span><span class="sub">${p.proxima ? `Próxima: ${quando(p.proxima)}` : p.status === 'ativo' ? 'Sem sessão marcada' : STATUS[p.status]} · ${resumoCobranca(p)}</span></div>
      <span class="dir">${p.vencido > 0 ? selo(`Em atraso ${brl(p.vencido)}`, 'ruim') : p.aberto > 0 ? selo(`A receber ${brl(p.aberto)}`, 'aten') : ''}${p.status !== 'ativo' && p.status !== 'arquivado' ? selo(STATUS[p.status], 'neutro') : ''}</span></li>`)}</ul></div>`);
  };

  const novo = () => formulario(null, () => carregar());
  $('#pac-novo', el)?.addEventListener('click', novo);
  el.onclick = (e) => {
    if (e.target.closest('[data-novo]')) return novo();
    const st = e.target.closest('[data-st]'); if (st) { filtro.status = st.dataset.st; filtro.atraso = false; return carregar(); }
    if (e.target.closest('[data-atraso]')) { filtro.atraso = !filtro.atraso; return carregar(); }
    const li = e.target.closest('li[data-id]'); if (li) location.hash = '#/pacientes/' + li.dataset.id;
  };
  el.onkeydown = (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('li[data-id]')) { e.preventDefault(); location.hash = '#/pacientes/' + e.target.dataset.id; } };
  let t; $('#pac-busca', el).addEventListener('input', (e) => { filtro.busca = e.target.value.trim(); clearTimeout(t); t = setTimeout(carregar, 250); });
  await carregar();
}

/* ================================================================= ficha */
async function ficha(el, id) {
  montar(el, html`<div class="carregando">Carregando…</div>`);
  let r;
  try { r = await api.get('pacientes/' + id); } catch (e) {
    montar(el, html`<a class="voltar" href="#/pacientes">← Pacientes</a><div class="cartao vazio"><h3>Paciente não encontrado</h3><p>${e.message}</p></div>`); return;
  }
  const p = r.paciente; const f = r.financeiro; const podeEditar = !somenteLeitura();
  const prof = profissionalPorId(p.profissionalId); const servico = servicoPorId(p.servicoId);
  const contato = p.respTelefone && (p.tipo === 'infantil' || p.respNome) ? p.respTelefone : p.telefone;
  const zap = linkWhats(p.telefone || p.respTelefone, '');
  const restante = (l) => l.valor - l.pago;
  const atrasado = (l) => l.vencimento < App.hoje;
  const diasAtraso = (l) => diasEntre(l.vencimento, App.hoje);

  montar(el, html`<a class="voltar" href="#/pacientes">← Pacientes</a>
    <div class="cartao"><div class="pac-topo">${avatar(p)}<div class="corpo"><h1>${rotuloNome(p)}</h1>
      <p class="suave" style="margin:2px 0 0">${(TIPOS.find(([k]) => k === p.tipo) || [])[1]} ${selo(STATUS[p.status], p.status === 'ativo' ? 'ok' : 'neutro')}${p.desde ? ` · desde ${dataBR(p.desde)}` : ''}${prof && (App.eu.profissionais || []).length > 1 ? ` · ${prof.nome}` : ''}</p></div></div>
      <div class="pac-acoes">${zap ? html`<a class="btn btn-sec btn-peq" href="${zap}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        ${podeEditar ? html`<button class="btn btn-sec btn-peq" data-editar>Editar cadastro</button>
          <a class="btn btn-pri btn-peq" href="#/agenda?paciente=${p.id}">Agendar sessão</a>` : ''}</div></div>
    <div class="kpis" style="margin-top:16px">
      <div class="kpi ${f.vencido > 0 ? 'alerta' : ''}"><span>Em atraso</span><strong>${brl(f.vencido)}</strong></div>
      <div class="kpi"><span>A receber (total)</span><strong>${brl(f.aberto)}</strong></div>
      <div class="kpi ok"><span>Já recebido</span><strong>${brl(f.recebido)}</strong></div>
      <div class="kpi"><span>Sessões realizadas</span><strong>${f.sessoesRealizadas}</strong></div></div>
    <div class="cols">
      <div>
        <div class="cartao"><div class="cartao-t"><h3>Em aberto</h3>${r.abertos.length && contato ? html`<button class="btn btn-sec btn-peq" data-cobrar>Cobrar no WhatsApp</button>` : ''}</div>
          ${r.abertos.length ? html`<ul class="lista">${r.abertos.map((l) => html`<li class="linha"><div class="corpo"><span class="tit">${l.descricao}</span><span class="sub">Vence em ${dataBR(l.vencimento)}${l.pago ? ` · já pagou ${brl(l.pago)}` : ''}</span></div>
            <span class="dir"><strong class="num">${brl(restante(l))}</strong>${atrasado(l) ? selo(`${diasAtraso(l)} dia${diasAtraso(l) === 1 ? '' : 's'} de atraso`, 'ruim') : ''}</span></li>`)}</ul>` : html`<p class="suave">Nada em aberto. Quando uma sessão for realizada, a cobrança aparece aqui.</p>`}</div>
        <div class="cartao"><div class="cartao-t"><h3>Próximas sessões</h3></div>
          ${(r.series || []).length ? html`<p class="peq" style="margin:0 0 8px">${(r.series).map((s) => html`<span class="selo selo-info" style="margin-right:6px">↻ ${s.frequencia === 'quinzenal' ? 'A cada 15 dias, ' : 'Toda '}${DIAS[s.diaSemana]} às ${s.hora}</span>`)}</p>` : ''}
          ${r.proximas.length ? html`<ul class="lista">${r.proximas.map((a) => html`<li class="linha"><div class="corpo"><span class="tit">${quando(a.inicio)}</span><span class="sub">${a.modalidade === 'online' ? 'Online' : 'Presencial'}${a.valor ? ` · ${brl(a.valor)}` : ''}</span></div>${selo(...SESSAO[a.status] || [a.status])}</li>`)}</ul>` : html`<p class="suave">Nenhuma sessão marcada.</p>`}</div>
        <div class="cartao"><div class="cartao-t"><h3>Histórico</h3></div>
          ${r.historico.length ? html`<ul class="lista">${r.historico.map((a) => html`<li class="linha"><div class="corpo"><span class="tit">${dataBR(a.inicio.slice(0, 10))} · ${hhmm(a.inicio)}</span></div>${selo(...SESSAO[a.status] || [a.status])}</li>`)}</ul>` : html`<p class="suave">Ainda sem sessões anteriores.</p>`}</div>
      </div>
      <div>
        <div class="cartao"><h3>Como paga</h3><dl class="detalhes">
          <dt>Forma de cobrança</dt><dd>${(MODALIDADES.find(([k]) => k === p.modalidade) || [])[1]}</dd>
          <dt>Valor</dt><dd>${resumoCobranca(p)}</dd>
          ${p.modalidade === 'convenio' ? html`<dt>Prazo do convênio</dt><dd>${p.convenioPrazoDias} dias</dd>` : p.modalidade === 'sessao' ? html`<dt>Prazo de pagamento</dt><dd>${p.prazoDias ? `${p.prazoDias} dia${p.prazoDias === 1 ? '' : 's'} após a sessão` : 'No dia da sessão'}</dd>` : ''}
          ${p.formaPagamento ? html`<dt>Forma preferida</dt><dd>${FORMA_NOME[p.formaPagamento] || p.formaPagamento}</dd>` : ''}
          ${servico ? html`<dt>Tipo de atendimento</dt><dd>${servico.nome}</dd>` : ''}</dl></div>
        <div class="cartao"><h3>Contato</h3><dl class="detalhes">
          <dt>Telefone</dt><dd>${fmtTel(p.telefone) || '—'}</dd><dt>E-mail</dt><dd>${p.email || '—'}</dd><dt>CPF</dt><dd>${fmtCPF(p.cpf) || '—'}</dd>
          ${p.nascimento ? html`<dt>Nascimento</dt><dd>${dataBR(p.nascimento)}</dd>` : ''}</dl>
          ${p.respNome || p.respTelefone || p.respCpf ? html`<h4 style="margin:18px 0 0">Responsável financeiro</h4><dl class="detalhes"><dt>Nome</dt><dd>${p.respNome || '—'}</dd><dt>Telefone</dt><dd>${fmtTel(p.respTelefone) || '—'}</dd><dt>CPF</dt><dd>${fmtCPF(p.respCpf) || '—'}</dd></dl>` : ''}
          ${p.obs ? html`<h4 style="margin:18px 0 4px">Observações</h4><p style="white-space:pre-wrap;margin:0">${p.obs}</p>` : ''}</div>
        ${podeEditar ? html`<div class="cartao"><h3>Situação do cadastro</h3><p class="suave peq">Quem está em pausa, de alta ou arquivado sai da lista principal, mas o histórico e as cobranças continuam guardados.</p>
          <div class="pac-acoes" style="margin-top:0">${p.status === 'ativo' ? html`<button class="btn btn-sec btn-peq" data-st="pausado">Pausar</button><button class="btn btn-sec btn-peq" data-st="alta">Dar alta</button><button class="btn btn-sec btn-peq" data-st="arquivado">Arquivar</button>` : html`<button class="btn btn-pri btn-peq" data-st="ativo">Reativar</button>${p.status !== 'arquivado' ? html`<button class="btn btn-sec btn-peq" data-st="arquivado">Arquivar</button>` : ''}`}
            <button class="btn btn-ghost btn-peq" data-apagar style="color:var(--perigo)">Apagar cadastro</button></div></div>` : ''}
      </div></div>`);

  el.onclick = async (e) => {
    if (e.target.closest('[data-editar]')) return formulario(p, () => ficha(el, id));
    const st = e.target.closest('[data-st]');
    if (st) { try { await api.post(`pacientes/${id}/status`, { status: st.dataset.st }); aviso('Situação atualizada.'); await ficha(el, id); } catch (er) { aviso(er.message, 'erro'); } return; }
    if (e.target.closest('[data-apagar]')) {
      if (!(await confirmar(`Apagar o cadastro de ${p.nome}? Isso não pode ser desfeito. (Só é possível se nunca houve agenda nem cobrança; senão, arquive.)`, { titulo: 'Apagar cadastro', ok: 'Apagar', perigo: true }))) return;
      try { await api.del('pacientes/' + id); aviso('Cadastro apagado.'); location.hash = '#/pacientes'; } catch (er) { aviso(er.message, 'erro'); }
      return;
    }
    if (e.target.closest('[data-cobrar]')) cobrarPorWhats(p, r.abertos);
  };
}

/** Abre o WhatsApp com a mensagem de cobrança já preenchida (editável nas configurações). */
function cobrarPorWhats(p, abertos) {
  const venc = abertos.filter((l) => l.vencimento < App.hoje); const base = venc.length ? venc : abertos;
  const total = base.reduce((a, l) => a + (l.valor - l.pago), 0);
  const maisAntiga = base.map((l) => l.vencimento).sort()[0];
  const paraResp = p.respTelefone && (p.respNome || p.tipo === 'infantil');
  const tel = paraResp ? p.respTelefone : p.telefone; const nome = paraResp && p.respNome ? p.respNome : (p.apelido || p.nome);
  const prof = profissionalPorId(p.profissionalId);
  const msg = preencher(App.eu.config.msg_cobranca, { nome: primeiroNome(nome), descricao: base.length === 1 ? base[0].descricao : `${base.length} atendimentos`, valor: brl(total), vencimento: dataBR(maisAntiga), profissional: prof ? prof.nome : (App.eu.conta.nome || '') });
  const url = linkWhats(tel, msg);
  if (!url) { aviso('Este paciente não tem telefone cadastrado.', 'erro'); return; }
  window.open(url, '_blank', 'noopener');
}

/* ================================================================= formulário */
function formulario(p, depois) {
  const edit = !!p; const profs = (App.eu.profissionais || []).filter((x) => x.ativo || (p && x.id === p.profissionalId)); const servicos = App.cache.servicos.filter((s) => s.ativo || (p && s.id === p.servicoId));
  const v = p || { tipo: 'individual', modalidade: 'sessao', valorSessao: 0, valorMensal: 0, prazoDias: App.eu.config.prazo_padrao_dias || 0, status: 'ativo', convenioPrazoDias: 30 };
  const respAberto = !!(p && (p.respNome || p.respTelefone || p.respCpf)) || v.tipo === 'infantil';
  const m = abrirModal({ titulo: edit ? 'Editar paciente' : 'Novo paciente', largo: true, corpo: html`<div id="pac-form"><p class="erro-form" role="alert" hidden></p>
    <div class="grade-2">${campo({ id: 'nome', rotulo: 'Nome completo', valor: v.nome || '', obrig: true })}${campo({ id: 'apelido', rotulo: 'Como prefere ser chamado(a)', valor: v.apelido || '', placeholder: 'Opcional' })}</div>
    <div class="grade-3">${campo({ id: 'tipo', rotulo: 'Tipo de atendimento', valor: v.tipo, opcoes: TIPOS })}${campo({ id: 'telefone', rotulo: 'Telefone / WhatsApp', tipo: 'tel', valor: fmtTel(v.telefone), placeholder: '(48) 99999-9999' })}${campo({ id: 'email', rotulo: 'E-mail', tipo: 'email', valor: v.email || '' })}</div>
    <div class="grade-3">${campo({ id: 'cpf', rotulo: 'CPF', valor: fmtCPF(v.cpf), ajuda: 'Necessário para emitir recibo no nome do paciente.' })}${campo({ id: 'nascimento', rotulo: 'Data de nascimento', tipo: 'date', valor: v.nascimento || '' })}${campo({ id: 'desde', rotulo: 'Início do atendimento', tipo: 'date', valor: v.desde || '' })}</div>
    <details class="bloco" id="bloco-resp" ${respAberto ? raw('open') : ''}><summary>Responsável financeiro (quem paga, quando não é o paciente)</summary>
      <div class="grade-3">${campo({ id: 'respNome', rotulo: 'Nome', valor: v.respNome || '' })}${campo({ id: 'respTelefone', rotulo: 'Telefone', tipo: 'tel', valor: fmtTel(v.respTelefone) })}${campo({ id: 'respCpf', rotulo: 'CPF', valor: fmtCPF(v.respCpf), ajuda: 'O recibo sai neste CPF.' })}</div></details>
    <h3 style="margin-top:6px">Como este paciente paga</h3>
    <div class="grade-2">${campo({ id: 'modalidade', rotulo: 'Forma de cobrança', valor: v.modalidade, opcoes: MODALIDADES })}${campo({ id: 'servicoId', rotulo: 'Tipo de atendimento padrão', valor: v.servicoId || '', opcoes: [['', 'Sem tipo definido'], ...servicos.map((s) => [s.id, `${s.nome}${s.valor ? ` · ${brl(s.valor)}` : ''}`])] })}</div>
    <div data-modal="sessao"><div class="grade-2">${campoDinheiro({ id: 'valorSessao', rotulo: 'Valor da sessão', valor: v.valorSessao, ajuda: 'Deixe em branco para usar o valor do tipo de atendimento.' })}${campo({ id: 'prazoDias', rotulo: 'Prazo de pagamento (dias após a sessão)', tipo: 'number', valor: v.prazoDias ?? 0, extra: 'min="0" max="365"', ajuda: '0 = vence no dia da sessão.' })}</div></div>
    <div data-modal="mensal"><div class="grade-2">${campoDinheiro({ id: 'valorMensal', rotulo: 'Valor da mensalidade', valor: v.valorMensal, obrig: true })}${campo({ id: 'diaVencimento', rotulo: 'Dia do vencimento', tipo: 'number', valor: v.diaVencimento || '', obrig: true, extra: 'min="1" max="31"' })}</div></div>
    <div data-modal="convenio"><div class="grade-3">${campo({ id: 'convenioNome', rotulo: 'Convênio', valor: v.convenioNome || '', obrig: true, placeholder: 'Ex.: Unimed' })}${campoDinheiro({ id: 'valorSessaoConv', rotulo: 'Valor por sessão', valor: v.valorSessao })}${campo({ id: 'convenioPrazoDias', rotulo: 'Prazo de repasse (dias)', tipo: 'number', valor: v.convenioPrazoDias ?? 30, extra: 'min="0" max="365"' })}</div></div>
    <div class="grade-2">${campo({ id: 'formaPagamento', rotulo: 'Forma de pagamento preferida', valor: v.formaPagamento || '', opcoes: FORMAS })}${profs.length > 1 ? campo({ id: 'profissionalId', rotulo: 'Profissional', valor: v.profissionalId || '', opcoes: [['', 'Sem profissional definida'], ...profs.map((x) => [x.id, x.nome])] }) : ''}</div>
    ${edit ? campo({ id: 'status', rotulo: 'Situação do cadastro', valor: v.status, opcoes: Object.entries(STATUS) }) : ''}
    <p class="aviso-clinico"><strong>Atenção:</strong> use as observações só para o que é administrativo (ex.: "prefere horário de manhã"). Não registre queixas, diagnósticos nem conteúdo de sessões: esta plataforma não é um prontuário.</p>
    ${campo({ id: 'obs', rotulo: 'Observações administrativas', tipo: 'textarea', valor: v.obs || '' })}</div>`,
    acoes: [{ id: 'cancelar', rotulo: 'Cancelar' }, { id: 'salvar', rotulo: 'Salvar', classe: 'btn-pri' }] });

  const form = $('form', m.el); // o <form> é o do próprio modal (formulários não se aninham)
  const modal = () => form.elements.modalidade.value;
  const alternar = () => { $$('[data-modal]', form).forEach((d) => { d.hidden = d.dataset.modal !== modal(); }); };
  form.elements.modalidade.addEventListener('change', alternar); alternar();
  form.elements.tipo.addEventListener('change', () => { if (form.elements.tipo.value === 'infantil') $('#bloco-resp', form).open = true; });
  const erro = (msg) => { const e = $('.erro-form', form); e.textContent = msg; e.hidden = false; e.scrollIntoView({ block: 'nearest' }); };

  const salvar = async (confirmarDuplicado = false) => {
    const d = dadosForm(form); const mod = d.modalidade;
    const corpo = {
      nome: d.nome, apelido: d.apelido, tipo: d.tipo, telefone: d.telefone, email: d.email, cpf: d.cpf, nascimento: d.nascimento, desde: d.desde,
      respNome: d.respNome, respTelefone: d.respTelefone, respCpf: d.respCpf, modalidade: mod, servicoId: d.servicoId ? Number(d.servicoId) : null,
      valorSessao: lerReais(mod === 'convenio' ? d.valorSessaoConv : d.valorSessao) ?? 0, valorMensal: lerReais(d.valorMensal) ?? 0,
      diaVencimento: d.diaVencimento ? Number(d.diaVencimento) : null, prazoDias: d.prazoDias === '' || d.prazoDias == null ? 0 : Number(d.prazoDias),
      convenioNome: d.convenioNome, convenioPrazoDias: d.convenioPrazoDias === '' || d.convenioPrazoDias == null ? null : Number(d.convenioPrazoDias),
      formaPagamento: d.formaPagamento || null, profissionalId: d.profissionalId ? Number(d.profissionalId) : (p ? p.profissionalId : null), status: edit ? d.status : 'ativo', obs: d.obs,
    };
    if (confirmarDuplicado) corpo.confirmarDuplicado = true;
    const btn = $('[data-acao="salvar"]', m.el); btn.disabled = true; $('.erro-form', form).hidden = true;
    try {
      let id = p && p.id;
      if (edit) await api.put('pacientes/' + p.id, corpo); else id = (await api.post('pacientes', corpo)).id;
      m.fechar(); aviso(edit ? 'Cadastro atualizado.' : 'Paciente cadastrado.');
      if (!edit) location.hash = '#/pacientes/' + id; else depois && depois();
    } catch (er) {
      if (er.status === 409 && er.dados && er.dados.duplicado) {
        if (await confirmar(`${er.message}`, { titulo: 'Nome repetido', ok: 'Cadastrar mesmo assim' })) return salvar(true);
      } else erro(er.message);
    } finally { btn.disabled = false; }
  };
  m.el.addEventListener('click', (e) => { const b = e.target.closest('[data-acao]'); if (!b) return; if (b.dataset.acao === 'cancelar') m.fechar(); else if (b.dataset.acao === 'salvar') salvar(); });
}
