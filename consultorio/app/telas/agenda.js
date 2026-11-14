/* Agenda: dia, semana e mês. Marcar sessões (com repetição semanal ou quinzenal), bloquear horários, remarcar,
   confirmar presença, marcar realizada ou falta e chamar o paciente pelo WhatsApp. */
import { api, qs } from '../api.js';
import { App, carregarBase, servicoPorId, profissionalPorId, somenteLeitura } from '../estado.js';
import { html, raw, montar, $, $$, abrirModal, confirmar, aviso, campo, campoDinheiro, dadosForm, lerReais, brl, selo, DIAS, DIAS_CURTOS, MESES, dataBR, dataLonga, dataDe, isoDe, somarDias, somarMeses, inicioMes, fimMes, diaSemana, hhmm, linkWhats, preencher, primeiroNome } from '../ui.js';

const PX_HORA = 56;
const SESSAO = { agendada: ['Agendada', 'neutro'], confirmada: ['Confirmada', 'info'], realizada: ['Realizada', 'ok'], falta: ['Faltou', 'ruim'], falta_justificada: ['Falta justificada', 'aten'], cancelada: ['Cancelada', 'neutro'] };
const FREQ = { semanal: 'Toda semana', quinzenal: 'A cada 15 dias' };
const est = { vista: null, data: null, prof: '' };
let itens = []; let seq = 0; let raiz = null;

const celular = () => window.innerWidth < 700;
const lerPref = () => { try { return localStorage.getItem('psi_agenda_vista'); } catch { return null; } };
const gravarPref = (v) => { try { localStorage.setItem('psi_agenda_vista', v); } catch { /* sem armazenamento: tudo bem */ } };
const segunda = (iso) => somarDias(iso, -((diaSemana(iso) + 6) % 7));            // semana de segunda a domingo
const minutos = (dt) => { const [h, m] = String(dt).slice(11, 16).split(':').map(Number); return h * 60 + m; };
const nomeCurto = (a) => (a.tipo === 'bloqueio' ? (a.titulo || 'Bloqueado') : (a.pac.apelido || a.pac.nome));
const vistaAtual = () => (celular() && est.vista === 'semana' ? 'dia' : est.vista);

export async function abrir(el, args, consulta) {
  await carregarBase(['servicos']);
  raiz = el;
  est.vista = est.vista || lerPref() || (celular() ? 'dia' : 'semana'); if (!['dia', 'semana', 'mes'].includes(est.vista)) est.vista = 'semana';
  est.data = est.data || App.hoje;
  const pacId = consulta && consulta.get('paciente');
  if (pacId) history.replaceState(null, '', '#/agenda');
  await carregar();
  if (pacId && !somenteLeitura()) formSessao({ pacienteId: Number(pacId), data: est.data });
  let eraCelular = celular(); // o teclado do celular também dispara "resize": só redesenha ao cruzar o limite celular/computador
  const redimensionou = () => { if (celular() !== eraCelular) { eraCelular = celular(); desenhar(); } };
  window.addEventListener('resize', redimensionou);
  return () => window.removeEventListener('resize', redimensionou);
}

/* ================================================================= dados */
function periodo() {
  const v = vistaAtual();
  if (v === 'mes') { const ini = segunda(inicioMes(est.data)); const fim = somarDias(segunda(fimMes(est.data)), 6); return { de: ini, ate: fim }; }
  const ini = segunda(est.data); return { de: ini, ate: somarDias(ini, 6) };
}
async function carregar() {
  const minha = ++seq; const { de, ate } = periodo();
  if (!raiz.querySelector('.ag-corpo')) montar(raiz, html`<div class="carregando">Carregando…</div>`);
  try {
    const r = await api.get('agenda' + qs({ de, ate, profissional: est.prof }));
    if (minha !== seq) return; itens = r.itens;
  } catch (e) { if (minha === seq) montar(raiz, html`<div class="cartao vazio"><h3>Não foi possível carregar a agenda</h3><p>${e.message}</p><button class="btn btn-sec" id="ag-tentar">Tentar de novo</button></div>`); const b = $('#ag-tentar', raiz); if (b) b.onclick = carregar; return; }
  desenhar();
}

/* ================================================================= tela */
function tituloPeriodo() {
  const v = vistaAtual();
  if (v === 'dia') return dataLonga(est.data);
  if (v === 'mes') { const d = dataDe(est.data); return `${MESES[d.getMonth()]} de ${d.getFullYear()}`; }
  const a = dataDe(segunda(est.data)); const b = dataDe(somarDias(segunda(est.data), 6));
  return a.getMonth() === b.getMonth() ? `${a.getDate()} a ${b.getDate()} de ${MESES[a.getMonth()]}` : `${a.getDate()} de ${MESES[a.getMonth()].slice(0, 3)} a ${b.getDate()} de ${MESES[b.getMonth()].slice(0, 3)}`;
}

function desenhar() {
  if (!raiz || !raiz.isConnected) return;
  const v = vistaAtual(); const profs = (App.eu.profissionais || []).filter((p) => p.ativo); const pode = !somenteLeitura();
  montar(raiz, html`<div class="cabeca"><div><h1>Agenda</h1><p id="ag-titulo" aria-live="polite">${tituloPeriodo()}</p></div>${pode ? html`<button class="btn btn-pri" data-nova>Nova sessão</button>` : ''}</div>
    <div class="ag-barra"><div class="ag-nav"><button class="btn btn-sec btn-peq" data-hoje>Hoje</button><button class="btn btn-sec btn-peq" data-passo="-1" aria-label="Anterior">‹</button><button class="btn btn-sec btn-peq" data-passo="1" aria-label="Próximo">›</button></div>
      <div class="chips" role="group" aria-label="Modo de visualização">${[['dia', 'Dia'], ...(celular() ? [] : [['semana', 'Semana']]), ['mes', 'Mês']].map(([k, t]) => html`<button type="button" class="chip" data-vista="${k}" aria-pressed="${v === k}">${t}</button>`)}</div>
      ${profs.length > 1 ? html`<div class="campo"><label class="sr" for="ag-prof">Profissional</label><select id="ag-prof"><option value="">Todas as profissionais</option>${profs.map((p) => html`<option value="${p.id}" ${String(p.id) === String(est.prof) ? raw('selected') : ''}>${p.nome}</option>`)}</select></div>` : ''}</div>
    <div class="ag-corpo">${v === 'mes' ? mes() : v === 'dia' ? dia() : semana()}</div>`);
  const grade = $('.ag-rolagem', raiz); if (grade) { const h0 = Number(grade.dataset.h0); const agora = new Date(); const alvo = est.data === App.hoje ? (agora.getHours() - 1 - h0) * PX_HORA : Math.max(0, (Math.min(...itens.filter((a) => a.inicio.slice(0, 10) === est.data).map((a) => minutos(a.inicio)), 8 * 60) / 60 - h0 - 0.5) * PX_HORA); grade.scrollTop = Math.max(0, alvo); }
}

/** Posiciona as sessões de um dia lado a lado quando se sobrepõem. */
function faixas(lista) {
  const ord = [...lista].sort((a, b) => a.inicio.localeCompare(b.inicio) || b.fim.localeCompare(a.fim)); const saida = []; let grupo = []; let fimGrupo = -1;
  const fechar = () => { const cols = grupo.reduce((m, g) => Math.max(m, g.col + 1), 1); grupo.forEach((g) => saida.push({ ...g, cols })); grupo = []; };
  for (const a of ord) {
    const ini = minutos(a.inicio); const fim = minutos(a.fim);
    if (ini >= fimGrupo && grupo.length) { fechar(); fimGrupo = -1; }
    const ocupadas = grupo.filter((g) => minutos(g.a.fim) > ini).map((g) => g.col); let col = 0; while (ocupadas.includes(col)) col++;
    grupo.push({ a, col }); fimGrupo = Math.max(fimGrupo, fim);
  }
  if (grupo.length) fechar();
  return saida;
}

function grade(diasMostrados, { cabecalho = true } = {}) {
  const cfg = App.eu.config; let h0 = cfg.hora_ini; let h1 = cfg.hora_fim;
  const visiveis = itens.filter((a) => diasMostrados.includes(a.inicio.slice(0, 10)));
  visiveis.forEach((a) => { h0 = Math.min(h0, Math.floor(minutos(a.inicio) / 60)); h1 = Math.max(h1, Math.ceil(minutos(a.fim) / 60)); });
  const horas = Array.from({ length: h1 - h0 }, (_, i) => h0 + i); const alturaTotal = (h1 - h0) * PX_HORA;
  const agora = new Date(); const minAgora = agora.getHours() * 60 + agora.getMinutes();
  return html`<div class="ag-grade cartao">${cabecalho ? html`<div class="ag-cab" style="--n:${diasMostrados.length}"><span></span>${diasMostrados.map((d) => html`<button type="button" class="ag-dia ${d === App.hoje ? 'hoje' : ''}" data-ir="${d}"><span>${DIAS_CURTOS[dataDe(d).getDay()]}</span><strong>${dataDe(d).getDate()}</strong></button>`)}</div>` : ''}
    <div class="ag-rolagem" data-h0="${h0}"><div class="ag-miolo" style="--n:${diasMostrados.length};height:${alturaTotal}px">
      <div class="ag-horas">${horas.map((h) => html`<span style="top:${(h - h0) * PX_HORA}px">${String(h).padStart(2, '0')}:00</span>`)}</div>
      ${diasMostrados.map((d) => html`<div class="ag-col ${d === App.hoje ? 'hoje' : ''}" data-dia="${d}" data-h0="${h0}" style="background-size:100% ${PX_HORA}px">
        ${d === App.hoje && minAgora >= h0 * 60 && minAgora <= h1 * 60 ? html`<i class="ag-agora" style="top:${(minAgora - h0 * 60) * PX_HORA / 60}px"></i>` : ''}
        ${faixas(visiveis.filter((a) => a.inicio.slice(0, 10) === d)).map(({ a, col, cols }) => {
          const top = (minutos(a.inicio) - h0 * 60) * PX_HORA / 60; const alt = Math.max((minutos(a.fim) - minutos(a.inicio)) * PX_HORA / 60, 24);
          const cor = (App.eu.profissionais || []).length > 1 && a.profissionalId ? (profissionalPorId(a.profissionalId) || {}).cor : '';
          return html`<button type="button" class="ag-ev ag-${a.tipo === 'bloqueio' ? 'bloqueio' : a.status}" data-id="${a.id}" style="top:${top}px;height:${alt}px;left:calc(${col * 100 / cols}% + 2px);width:calc(${100 / cols}% - 4px);${cor ? `border-left-color:${cor}` : ''}" aria-label="${hhmm(a.inicio)}, ${nomeCurto(a)}, ${a.tipo === 'bloqueio' ? 'horário bloqueado' : SESSAO[a.status][0]}">
            <b>${hhmm(a.inicio)}</b> ${nomeCurto(a)}${a.modalidade === 'online' && a.tipo === 'sessao' ? raw(' <small>· online</small>') : ''}${a.serieId ? raw(' <small>↻</small>') : ''}</button>`;
        })}</div>`)}
    </div></div></div>`;
}

function semana() {
  const ini = segunda(est.data); const todos = Array.from({ length: 7 }, (_, i) => somarDias(ini, i));
  const mostrar = todos.filter((d) => App.eu.config.dias_semana.includes(dataDe(d).getDay()) || itens.some((a) => a.inicio.slice(0, 10) === d));
  return grade(mostrar.length ? mostrar : todos.slice(0, 5));
}
function dia() {
  const ini = segunda(est.data); const todos = Array.from({ length: 7 }, (_, i) => somarDias(ini, i));
  const tira = html`<div class="ag-tira">${todos.map((d) => { const n = itens.filter((a) => a.inicio.slice(0, 10) === d && a.tipo === 'sessao' && a.status !== 'cancelada').length;
    return html`<button type="button" class="${d === est.data ? 'ativo' : ''} ${d === App.hoje ? 'hoje' : ''}" data-ir="${d}" aria-label="${dataLonga(d)}${n ? `, ${n} sessões` : ''}"><span>${DIAS_CURTOS[dataDe(d).getDay()]}</span><strong>${dataDe(d).getDate()}</strong><i>${n ? n : ''}</i></button>`; })}</div>`;
  const doDia = itens.filter((a) => a.inicio.slice(0, 10) === est.data);
  return html`${tira}${grade([est.data], { cabecalho: false })}${doDia.length ? '' : html`<p class="suave centro" style="margin-top:14px">Nenhuma sessão neste dia.</p>`}`;
}
function mes() {
  const ini = segunda(inicioMes(est.data)); const fim = somarDias(segunda(fimMes(est.data)), 6); const mesAtual = est.data.slice(0, 7); const dias = [];
  for (let d = ini; d <= fim; d = somarDias(d, 1)) dias.push(d);
  return html`<div class="ag-mes cartao"><div class="ag-mes-cab">${['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((n) => html`<span>${n}</span>`)}</div>
    <div class="ag-mes-grade">${dias.map((d) => { const doDia = itens.filter((a) => a.inicio.slice(0, 10) === d && a.status !== 'cancelada'); const sess = doDia.filter((a) => a.tipo === 'sessao');
      return html`<button type="button" class="ag-cel ${d.slice(0, 7) !== mesAtual ? 'fora' : ''} ${d === App.hoje ? 'hoje' : ''}" data-ir="${d}" data-abrir-dia aria-label="${dataLonga(d)}, ${sess.length} sessões"><b>${dataDe(d).getDate()}</b>
        <span class="ag-chips">${sess.slice(0, 3).map((a) => html`<em>${hhmm(a.inicio)} ${nomeCurto(a)}</em>`)}${sess.length > 3 ? html`<em class="mais">+${sess.length - 3}</em>` : ''}</span>${sess.length ? html`<i class="ag-conta">${sess.length}</i>` : ''}</button>`; })}</div></div>`;
}

/* ================================================================= interação */
async function mudarVista(v) { est.vista = v; gravarPref(v); await carregar(); }
async function ir(iso, vista) { est.data = iso; if (vista) { est.vista = vista; gravarPref(vista); } await carregar(); }
function passo(n) {
  const v = vistaAtual();
  est.data = v === 'mes' ? somarMeses(inicioMes(est.data), n) : somarDias(est.data, v === 'dia' ? n : 7 * n);
  return carregar();
}

document.addEventListener('click', delegado);
function delegado(e) {
  if (!raiz || !raiz.isConnected || !raiz.contains(e.target)) return;
  const t = e.target;
  if (t.closest('[data-nova]')) return formSessao({ data: est.data });
  if (t.closest('[data-hoje]')) return ir(App.hoje);
  const p = t.closest('[data-passo]'); if (p) return passo(Number(p.dataset.passo));
  const vs = t.closest('[data-vista]'); if (vs) return mudarVista(vs.dataset.vista);
  const goDia = t.closest('[data-ir]'); if (goDia) return ir(goDia.dataset.ir, vistaAtual() === 'mes' || (vistaAtual() === 'semana') ? 'dia' : null);
  const ev = t.closest('.ag-ev'); if (ev) return detalhe(itens.find((a) => a.id === Number(ev.dataset.id)));
  const col = t.closest('.ag-col'); if (col && !somenteLeitura()) {
    const y = e.clientY - col.getBoundingClientRect().top; const min = Math.floor(((Number(col.dataset.h0) * 60 + y * 60 / PX_HORA)) / 15) * 15;
    formSessao({ data: col.dataset.dia, hora: `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}` });
  }
}
document.addEventListener('change', (e) => { if (raiz && raiz.isConnected && e.target.id === 'ag-prof') { est.prof = e.target.value; carregar(); } });

/* ================================================================= janela da sessão */
function textoCobranca(a) {
  if (a.tipo === 'bloqueio') return 'Horário bloqueado: ninguém é agendado aqui.';
  if (!a.cobrar) return a.pac.modalidade === 'mensal' ? 'Coberta pela mensalidade.' : 'Sem cobrança.';
  return a.valor ? `${brl(a.valor)} · gera cobrança quando for realizada.` : 'Valor não definido.';
}
function mensagemConfirmacao(a) {
  const resp = a.pac.respTelefone && (a.pac.respNome || a.pac.tipo === 'infantil'); const tel = resp ? a.pac.respTelefone : a.pac.telefone;
  const nome = resp && a.pac.respNome ? a.pac.respNome : (a.pac.apelido || a.pac.nome); const prof = profissionalPorId(a.profissionalId);
  const d = dataDe(a.inicio.slice(0, 10));
  const msg = preencher(App.eu.config.msg_confirmacao, { nome: primeiroNome(nome), dia: `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`, hora: hhmm(a.inicio), profissional: prof ? prof.nome : (App.eu.conta.nome || '') });
  return linkWhats(tel, msg);
}

function detalhe(a) {
  if (!a) return;
  const pode = !somenteLeitura(); const bloq = a.tipo === 'bloqueio';
  const wa = !bloq ? mensagemConfirmacao(a) : '';
  const m = abrirModal({ titulo: bloq ? 'Horário bloqueado' : nomeCurto(a), corpo: html`
    <p style="margin:0 0 6px"><strong>${dataLonga(a.inicio.slice(0, 10))}</strong>, ${hhmm(a.inicio)} às ${hhmm(a.fim)} ${a.modalidade === 'online' && !bloq ? '· online' : ''}</p>
    ${bloq ? html`<p class="suave">${a.titulo || ''}</p>` : html`<p style="margin:0 0 6px">${selo(...SESSAO[a.status])} ${a.serieId ? html`<span class="suave peq">↻ ${FREQ[a.frequencia] || 'Repete'}</span>` : ''}</p>`}
    <p class="suave peq" style="margin:0 0 10px">${textoCobranca(a)}</p>${a.obs ? html`<p class="peq" style="white-space:pre-wrap">${a.obs}</p>` : ''}
    ${!bloq && pode ? html`<div class="chips" role="group" aria-label="Situação da sessão" style="margin:12px 0">${Object.entries(SESSAO).map(([k, [t]]) => html`<button type="button" class="chip" data-st="${k}" aria-pressed="${a.status === k}">${t}</button>`)}</div>` : ''}
    <div class="pac-acoes">${wa ? html`<a class="btn btn-sec btn-peq" href="${wa}" target="_blank" rel="noopener">Confirmar pelo WhatsApp</a>` : ''}
      ${!bloq ? html`<a class="btn btn-sec btn-peq" href="#/pacientes/${a.pacienteId}" data-fechar>Ver paciente</a>` : ''}
      ${pode ? html`<button class="btn btn-sec btn-peq" data-editar>Remarcar / editar</button><button class="btn btn-ghost btn-peq" data-apagar style="color:var(--perigo)">Apagar</button>` : ''}</div>`, acoes: [] });
  m.el.addEventListener('click', async (e) => {
    const st = e.target.closest('[data-st]'); if (st) { m.fechar(); return mudarStatus(a, st.dataset.st); }
    if (e.target.closest('[data-editar]')) { m.fechar(); return formSessao({ editar: a }); }
    if (e.target.closest('[data-apagar]')) { m.fechar(); return apagar(a); }
    if (e.target.closest('a[href^="#/"]')) m.fechar();
  });
}

/** Pergunta se a mudança vale só para a sessão ou também para as próximas da série. */
function perguntarEscopo(titulo, texto) {
  return new Promise((res) => {
    let r = null;
    const m = abrirModal({ titulo, corpo: html`<p>${texto}</p>`, acoes: [{ id: 'cancelar', rotulo: 'Voltar' }, { id: 'este', rotulo: 'Só esta sessão', classe: 'btn-sec' }, { id: 'seguintes', rotulo: 'Esta e as próximas', classe: 'btn-pri' }], aoFechar: () => res(r) });
    m.el.addEventListener('click', (e) => { const b = e.target.closest('[data-acao]'); if (!b) return; r = b.dataset.acao === 'cancelar' ? null : b.dataset.acao; m.fechar(); });
  });
}

async function mudarStatus(a, status) {
  if (a.status === status) return;
  let escopo = 'este';
  if (status === 'cancelada' && a.serieId) { escopo = await perguntarEscopo('Cancelar sessão fixa', 'Esta sessão faz parte de um horário fixo. Cancelar só esta ou também as próximas?'); if (!escopo) return; }
  try { await api.post(`agenda/${a.id}/status`, { status, escopo }); aviso(`Sessão marcada como ${SESSAO[status][0].toLowerCase()}.`); await carregar(); } catch (er) { aviso(er.message, 'erro'); }
}
async function apagar(a) {
  let escopo = 'este';
  if (a.serieId) { escopo = await perguntarEscopo('Apagar sessão fixa', 'Apagar só esta sessão ou também as próximas do horário fixo?'); if (!escopo) return; }
  else if (!(await confirmar(a.tipo === 'bloqueio' ? 'Apagar este bloqueio de horário?' : 'Apagar esta sessão da agenda?', { titulo: 'Apagar', ok: 'Apagar', perigo: true }))) return;
  try { await api.del(`agenda/${a.id}` + qs({ escopo })); aviso('Apagado.'); await carregar(); } catch (er) { aviso(er.message, 'erro'); }
}

/* ================================================================= formulário */
async function formSessao({ data, hora, pacienteId, editar }) {
  const a = editar || null; let pacientes = [];
  if (!a || a.tipo === 'sessao') { try { pacientes = (await api.get('pacientes?status=todos')).itens.filter((p) => p.status !== 'arquivado'); } catch (e) { aviso(e.message, 'erro'); return; } }
  if (!a && !pacientes.length) { aviso('Cadastre um paciente antes de marcar uma sessão.', 'erro'); location.hash = '#/pacientes'; return; }
  const profs = (App.eu.profissionais || []).filter((p) => p.ativo || (a && p.id === a.profissionalId));
  const cfg = App.eu.config; const v = a ? { data: a.inicio.slice(0, 10), hora: hhmm(a.inicio), dur: (minutos(a.fim) - minutos(a.inicio)) } : { data: data || App.hoje, hora: hora || '09:00', dur: cfg.duracao_padrao };
  const padraoDe = (p) => { const s = servicoPorId(p.servicoId); const dur = s ? s.duracaoMin : cfg.duracao_padrao; return p.modalidade === 'mensal' ? { valor: 0, cobrar: false, dur } : { valor: p.valorSessao || (s ? s.valor : 0), cobrar: true, dur }; };
  const ini = a ? a : null; const pacIni = a ? null : (pacientes.find((p) => p.id === pacienteId) || null);

  const m = abrirModal({ titulo: a ? (a.tipo === 'bloqueio' ? 'Editar bloqueio' : 'Remarcar / editar sessão') : 'Nova sessão', largo: true, corpo: html`<div id="ag-form"><p class="erro-form" role="alert" hidden></p>
    ${!a ? html`<div class="chips" role="group" aria-label="O que marcar" style="margin-bottom:14px"><button type="button" class="chip" data-tipo="sessao" aria-pressed="true">Sessão com paciente</button><button type="button" class="chip" data-tipo="bloqueio" aria-pressed="false">Bloquear horário</button></div>` : ''}
    <input type="hidden" name="tipo" value="${a ? a.tipo : 'sessao'}">
    <div data-so="sessao">${a ? html`<p style="margin:0 0 12px"><strong>${a.pac ? a.pac.nome : ''}</strong></p>` : campo({ id: 'pacienteId', rotulo: 'Paciente', obrig: true, valor: pacIni ? pacIni.id : '', opcoes: [['', 'Escolha o paciente'], ...pacientes.map((p) => [p.id, p.nome + (p.status !== 'ativo' ? ` (${p.status === 'pausado' ? 'em pausa' : 'alta'})` : '')])] })}</div>
    <div data-so="bloqueio" hidden>${campo({ id: 'titulo', rotulo: 'Motivo do bloqueio', valor: a && a.tipo === 'bloqueio' ? a.titulo || '' : '', placeholder: 'Ex.: almoço, reunião, folga' })}</div>
    <div class="grade-3">${campo({ id: 'data', rotulo: 'Dia', tipo: 'date', valor: v.data, obrig: true })}${campo({ id: 'hora', rotulo: 'Hora', tipo: 'time', valor: v.hora, obrig: true, extra: 'step="300"' })}${campo({ id: 'duracaoMin', rotulo: 'Duração (min)', tipo: 'number', valor: v.dur, extra: 'min="10" max="600" step="5"' })}</div>
    <div data-so="sessao"><div class="grade-2">${campo({ id: 'modalidade', rotulo: 'Modalidade', valor: a ? a.modalidade : 'presencial', opcoes: [['presencial', 'Presencial'], ['online', 'Online']] })}${campoDinheiro({ id: 'valor', rotulo: 'Valor desta sessão', valor: a ? a.valor : (pacIni ? padraoDe(pacIni).valor : 0) })}</div>
      <label class="marca" style="margin-bottom:12px"><input type="checkbox" name="cobrar" ${(a ? a.cobrar : pacIni ? padraoDe(pacIni).cobrar : true) ? raw('checked') : ''}><span>Cobrar esta sessão <small class="suave" id="ag-cobrar-dica"></small></span></label></div>
    ${profs.length > 1 ? campo({ id: 'profissionalId', rotulo: 'Profissional', valor: a ? a.profissionalId || '' : (pacIni && pacIni.profissionalId) || (profs[0] && profs[0].id), opcoes: profs.map((p) => [p.id, p.nome]) }) : ''}
    ${a && a.serieId ? html`<fieldset class="campo" style="border:1px solid var(--linha);border-radius:12px;padding:10px 14px"><legend class="peq forte">Esta sessão é de um horário fixo</legend><label class="marca"><input type="radio" name="escopo" value="este" checked><span>Mudar só esta sessão</span></label><label class="marca"><input type="radio" name="escopo" value="seguintes"><span>Mudar esta e as próximas (o horário fixo também muda)</span></label></fieldset>` : ''}
    ${!a ? html`<div class="grade-2">${campo({ id: 'repetir', rotulo: 'Repetir', valor: '', opcoes: [['', 'Não repete'], ['semanal', 'Toda semana'], ['quinzenal', 'A cada 15 dias']] })}<div data-so="repetir" hidden>${campo({ id: 'ate', rotulo: 'Até (opcional)', tipo: 'date', ajuda: 'Em branco = continua até você encerrar.' })}</div></div>` : ''}
    ${campo({ id: 'obs', rotulo: 'Observação (administrativa)', valor: a ? a.obs || '' : '', extra: 'maxlength="255"' })}</div>`,
    acoes: [{ id: 'cancelar', rotulo: 'Cancelar' }, { id: 'salvar', rotulo: a ? 'Salvar' : 'Marcar', classe: 'btn-pri' }] });

  const form = $('form', m.el); const el = (n) => form.elements[n]; const erro = (msg) => { const e = $('.erro-form', form); e.textContent = msg; e.hidden = false; e.scrollIntoView({ block: 'nearest' }); };
  const tipoAtual = () => el('tipo').value;
  const alternar = () => { $$('[data-so]', form).forEach((d) => { const k = d.dataset.so; d.hidden = k === 'repetir' ? !(el('repetir') && el('repetir').value) : k !== tipoAtual(); }); $$('[data-tipo]', form).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tipo === tipoAtual()))); };
  const dica = () => { const d = $('#ag-cobrar-dica', form); const p = pacientes.find((x) => x.id === Number(el('pacienteId') && el('pacienteId').value)); d.textContent = p && p.modalidade === 'mensal' ? '(este paciente paga mensalidade: já está coberta)' : ''; };
  form.addEventListener('click', (e) => { const b = e.target.closest('[data-tipo]'); if (b) { el('tipo').value = b.dataset.tipo; alternar(); } });
  if (el('repetir')) el('repetir').addEventListener('change', alternar);
  if (el('pacienteId')) el('pacienteId').addEventListener('change', () => {
    const p = pacientes.find((x) => x.id === Number(el('pacienteId').value)); dica(); if (!p) return;
    const d = padraoDe(p); el('valor').value = d.valor ? (d.valor / 100).toFixed(2).replace('.', ',') : ''; el('cobrar').checked = d.cobrar; el('duracaoMin').value = d.dur;
    if (el('profissionalId') && p.profissionalId) el('profissionalId').value = p.profissionalId;
  });
  alternar(); dica();

  const salvar = async (ignorarConflitos = false) => {
    const d = dadosForm(form); const bloq = d.tipo === 'bloqueio'; const corpo = { inicio: `${d.data} ${d.hora}`, duracaoMin: Number(d.duracaoMin) || undefined, obs: d.obs };
    if (bloq) corpo.titulo = d.titulo; else { corpo.modalidade = d.modalidade; corpo.cobrar = d.cobrar; if (d.valor !== '') corpo.valor = lerReais(d.valor) ?? 0; }
    if (d.profissionalId) corpo.profissionalId = Number(d.profissionalId);
    if (ignorarConflitos) corpo.ignorarConflitos = true;
    const btn = $('[data-acao="salvar"]', m.el); btn.disabled = true; $('.erro-form', form).hidden = true;
    try {
      if (a) { corpo.escopo = d.escopo || 'este'; await api.put('agenda/' + a.id, corpo); aviso('Sessão atualizada.'); }
      else {
        corpo.tipo = d.tipo; if (!bloq) corpo.pacienteId = d.pacienteId ? Number(d.pacienteId) : null;
        if (d.repetir) corpo.recorrencia = { frequencia: d.repetir, ate: d.ate || null };
        const r = await api.post('agenda', corpo); aviso(r.serieId ? `Horário fixo criado (${r.criados} sessões já na agenda).` : bloq ? 'Horário bloqueado.' : 'Sessão marcada.');
      }
      m.fechar(); est.data = d.data; await carregar();
    } catch (er) {
      if (er.status === 409 && er.dados && er.dados.conflitos) {
        const lista = er.dados.conflitos.slice(0, 3).map((c) => `${dataBR(c.inicio.slice(0, 10))} ${hhmm(c.inicio)}: ${c.quem}`).join('; ');
        if (await confirmar(`Já existe algo nesse horário (${lista}${er.dados.conflitos.length > 3 ? '…' : ''}). Marcar mesmo assim?`, { titulo: 'Horário ocupado', ok: 'Marcar mesmo assim' })) return salvar(true);
      } else erro(er.message);
    } finally { btn.disabled = false; }
  };
  m.el.addEventListener('click', (e) => { const b = e.target.closest('[data-acao="cancelar"], [data-acao="salvar"]'); if (!b) return; if (b.dataset.acao === 'cancelar') m.fechar(); else salvar(); });
}
