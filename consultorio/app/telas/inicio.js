/* Início: o painel da rotina. O que acontece hoje (com botões para registrar cada sessão), o que ficou por registrar,
   quanto está atrasado e quem está devendo. Os primeiros passos aparecem só enquanto faltar configurar algo. */
import { api } from '../api.js';
import { App, somenteLeitura } from '../estado.js';
import { html, montar, brl, selo, primeiroNome, dataLonga, dataBR, dataCurta, hhmm, diasEntre, DIAS_CURTOS, dataDe } from '../ui.js';
import { mudarSituacaoSessao, cobrarWhatsApp, linkConfirmacao, CANAL_NOME } from '../financeiro.js';

const SESSAO = { agendada: ['Agendada', 'neutro'], confirmada: ['Confirmada', 'info'], realizada: ['Realizada', 'ok'], falta: ['Faltou', 'ruim'], falta_justificada: ['Falta justificada', 'aten'], cancelada: ['Cancelada', 'neutro'] };
let raiz = null; let dados = null;

export async function abrir(el) {
  raiz = el; await carregar();
  el.onclick = clique;
}

async function carregar() {
  try { dados = await api.get('inicio'); } catch (e) { montar(raiz, html`<div class="cartao vazio"><h3>Não foi possível carregar o painel</h3><p>${e.message}</p></div>`); return; }
  desenhar();
}

const nomeDe = (a) => a.pac.apelido || a.pac.nome;
const jaComecou = (a) => { const n = new Date(); const agora = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')} ${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`; return a.inicio.slice(0, 16) <= agora; };
const quando = (dt) => { const n = diasEntre(App.hoje, dt.slice(0, 10)); return `${n === 0 ? 'Hoje' : n === 1 ? 'Amanhã' : n === -1 ? 'Ontem' : `${DIAS_CURTOS[dataDe(dt.slice(0, 10)).getDay()]} ${dataCurta(dt.slice(0, 10))}`}, ${hhmm(dt)}`; };

function acoes(a) {
  if (somenteLeitura()) return '';
  if (a.status === 'agendada' || a.status === 'confirmada') {
    const wa = linkConfirmacao(a);
    return jaComecou(a)
      ? html`<span class="acoes-rapidas"><button class="btn btn-pri btn-peq" data-st="realizada" data-id="${a.id}">Realizada</button><button class="btn btn-sec btn-peq" data-st="falta" data-id="${a.id}">Faltou</button><button class="btn btn-ghost btn-peq" data-st="falta_justificada" data-id="${a.id}">Falta justificada</button></span>`
      : html`<span class="acoes-rapidas">${a.status === 'agendada' ? html`<button class="btn btn-sec btn-peq" data-st="confirmada" data-id="${a.id}">Confirmou</button>` : ''}${wa ? html`<a class="btn btn-ghost btn-peq" href="${wa}" target="_blank" rel="noopener">Pedir confirmação</a>` : ''}</span>`;
  }
  return '';
}
const linhaSessao = (a, comData = false) => html`<li class="linha hj"><span class="hj-hora">${hhmm(a.inicio)}</span><div class="corpo"><span class="tit"><a href="#/pacientes/${a.pacienteId}" style="text-decoration:none">${nomeDe(a)}</a></span>
  <span class="sub">${comData ? `${quando(a.inicio).split(',')[0]} · ` : ''}${a.modalidade === 'online' ? 'Online' : 'Presencial'}${a.cobrar ? (a.valor ? ` · ${brl(a.valor)}` : ' · sem valor definido') : a.pac.modalidade === 'mensal' ? ' · mensalidade' : ' · sem cobrança'}</span></div>
  ${a.status === 'agendada' ? '' : selo(...SESSAO[a.status])}${acoes(a)}</li>`;

function desenhar() {
  const d = dados; const f = d.financeiro; const c = App.eu.conta; const servicos = App.cache.servicos || [];
  const passos = [
    ['Complete os dados do consultório', 'CPF/CNPJ e CRP aparecem nos recibos.', !!(c.documento && c.crp), '#/config/consultorio'],
    ['Defina o valor dos seus atendimentos', 'Assim cada paciente já nasce com o valor certo.', servicos.some((s) => s.valor > 0), '#/config/atendimentos'],
    ['Cadastre seu primeiro paciente', 'Nome, contato e como ele paga.', d.pacientesAtivos > 0, '#/pacientes'],
    ['Agende a primeira sessão', 'A agenda gera as cobranças sozinha.', d.hoje.length + d.proximas.length + d.aRegistrar.length > 0, '#/agenda'],
  ];
  const faltam = passos.filter((p) => !p[2]).length;
  montar(raiz, html`<div class="cabeca"><div><h1>Olá, ${primeiroNome(App.eu.usuario.nome)}!</h1><p>${dataLonga(App.hoje)}</p></div><a class="btn btn-pri" href="#/agenda">Abrir a agenda</a></div>
    ${faltam ? html`<div class="cartao"><div class="cartao-t"><h2>Primeiros passos</h2><span class="suave peq">${4 - faltam} de 4</span></div>
      <ol class="passos">${passos.map(([t, desc, ok, link], i) => html`<li class="${ok ? 'passo-ok' : ''}"><span class="passo-n">${ok ? '✓' : i + 1}</span><div style="flex:1"><span class="tit forte">${t}</span><br><span class="suave peq">${desc}</span></div>${ok ? '' : html`<a class="btn btn-sec btn-peq" href="${link}">Abrir</a>`}</li>`)}</ol></div>` : ''}
    <div class="kpis">
      <a class="kpi ${f.atrasado > 0 ? 'alerta' : ''}" href="#/receber?aba=devedores" style="text-decoration:none;color:inherit"><span>Em atraso</span><strong>${brl(f.atrasado)}</strong><small class="suave">${f.atrasadoQtd ? `${d.totalInadimplentes} pessoa${d.totalInadimplentes === 1 ? '' : 's'} devendo` : 'Tudo em dia'}</small></a>
      <a class="kpi" href="#/receber" style="text-decoration:none;color:inherit"><span>A receber em 7 dias</span><strong>${brl(f.venceHoje + f.vence7dias)}</strong><small class="suave">${f.venceHoje ? `${brl(f.venceHoje)} vence hoje` : ''}</small></a>
      <a class="kpi ok" href="#/receber?aba=quitado" style="text-decoration:none;color:inherit"><span>Recebido no mês</span><strong>${brl(f.recebidoMes)}</strong><small class="suave">Mês passado: ${brl(f.recebidoMesAnterior)}</small></a>
      <a class="kpi" href="#/pacientes" style="text-decoration:none;color:inherit"><span>Pacientes ativos</span><strong>${d.pacientesAtivos}</strong></a></div>
    <div class="cols"><div>
      ${d.aRegistrar.length ? html`<div class="cartao" style="border-color:var(--atencao)"><div class="cartao-t"><h3>Sessões para registrar</h3><span class="selo selo-aten">${d.aRegistrar.length}</span></div>
        <p class="suave peq" style="margin-top:0">Estas sessões já passaram e ainda estão como "agendada". Registrar gera a cobrança.</p>
        <ul class="lista">${d.aRegistrar.slice(0, 8).map((a) => linhaSessao(a, true))}</ul>${d.aRegistrar.length > 8 ? html`<p class="suave peq" style="margin:8px 0 0">E mais ${d.aRegistrar.length - 8} na agenda.</p>` : ''}</div>` : ''}
      <div class="cartao"><div class="cartao-t"><h3>Hoje</h3><span class="suave peq">${d.hoje.length} ${d.hoje.length === 1 ? 'sessão' : 'sessões'}</span></div>
        ${d.hoje.length ? html`<ul class="lista">${d.hoje.map((a) => linhaSessao(a))}</ul>` : html`<p class="suave" style="margin:0">Nenhuma sessão hoje.</p>`}</div>
    </div><div>
      <div class="cartao"><div class="cartao-t"><h3>Quem deve</h3>${d.totalInadimplentes ? html`<a class="link" href="#/receber?aba=devedores">Ver todos (${d.totalInadimplentes})</a>` : ''}</div>
        ${d.inadimplentes.length ? html`<ul class="lista">${d.inadimplentes.map((p) => html`<li class="linha"><div class="corpo"><span class="tit">${p.nome}</span><span class="sub">${p.diasAtraso} dia${p.diasAtraso === 1 ? '' : 's'} de atraso${p.ultimaCobranca ? ` · ${CANAL_NOME[p.ultimaCobranca.canal] || 'contato'} registrado` : ' · sem contato'}${p.promessaVigente ? ` · prometeu até ${dataBR(p.promessaEm)}` : ''}</span></div>
          <span class="dir"><strong class="num ruim">${brl(p.vencido)}</strong>${p.pacienteId && !somenteLeitura() ? html`<button class="btn btn-sec btn-peq" data-zap="${p.pacienteId}">Cobrar</button>` : ''}</span></li>`)}</ul>` : html`<p class="suave" style="margin:0">Ninguém em atraso.</p>`}</div>
      <div class="cartao"><div class="cartao-t"><h3>Próximas sessões</h3></div>
        ${d.proximas.length ? html`<ul class="lista">${d.proximas.map((a) => html`<li class="linha"><div class="corpo"><span class="tit">${nomeDe(a)}</span><span class="sub">${quando(a.inicio)}</span></div>${a.status === 'confirmada' ? selo('Confirmada', 'info') : ''}</li>`)}</ul>` : html`<p class="suave" style="margin:0">Nenhuma sessão marcada. <a href="#/agenda">Abrir a agenda</a></p>`}</div>
    </div></div>`);
}

async function clique(e) {
  const st = e.target.closest('[data-st]');
  if (st) { st.disabled = true; if (await mudarSituacaoSessao(Number(st.dataset.id), st.dataset.st)) await carregar(); else st.disabled = false; return; }
  const zap = e.target.closest('[data-zap]');
  if (zap) {
    const id = Number(zap.dataset.zap);
    try { const [pac, atrasados] = await Promise.all([api.get('pacientes/' + id), api.get(`lancamentos?situacao=atrasado&paciente=${id}`)]); await cobrarWhatsApp({ ...pac.paciente }, atrasados.itens, carregar); } catch { /* aviso já mostrado */ }
  }
}
