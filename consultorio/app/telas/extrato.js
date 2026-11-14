/* Extrato bancário: importa o arquivo do banco (OFX, CSV ou Excel), lido aqui no navegador, e concilia cada linha com um pagamento
   que você já tinha lançado, cria o lançamento que faltava, marca como transferência entre suas contas ou ignora.
   Para volume: busca, seleção de várias linhas, agrupamento por favorecido, ações em massa e apagar uma importação inteira. */
import { api } from '../api.js';
import { App, carregarBase, somenteLeitura } from '../estado.js';
import { html, raw, montar, $, abrirModal, confirmar, aviso, campo, dadosForm, brl, selo, vazio, dataBR, semAcento } from '../ui.js';
import { combo, definirCombo } from '../combo.js';
import { comboCategoria, comboFornecedor, ligarSeletores } from '../financeiro.js';

const est = { conta: null, situacao: 'pendente', busca: '', agrupar: false, sel: new Set() };
let raiz = null; let dados = null; let importacoes = []; let contas = []; let pacientes = null;

export async function abrir(el) {
  raiz = el; el.onclick = clique; el.onchange = mudou; el.oninput = digitou;
  await carregarBase(['contas', 'categorias', 'fornecedores']); contas = App.cache.contas.filter((c) => c.ativo);
  if (!contas.length) { montar(el, html`<div class="cartao">${vazio('Nenhuma conta cadastrada', 'Cadastre uma conta em "Contas e cartões" para importar o extrato dela.', html`<a class="btn btn-pri" href="#/contas">Abrir contas</a>`)}</div>`); return; }
  if (!est.conta || !contas.some((c) => c.id === est.conta)) est.conta = (contas.find((c) => c.tipo === 'banco') || contas[0]).id;
  est.sel = new Set(); est.busca = '';
  await carregar();
}

async function carregar() {
  try {
    const [d, imp] = await Promise.all([api.get(`extrato-itens?contaFin=${est.conta}&situacao=${est.situacao}&limite=1000`), api.get(`extratos?contaFin=${est.conta}`)]);
    dados = d; importacoes = imp.itens;
  } catch (e) { montar(raiz, html`<div class="cartao vazio"><h3>Não foi possível carregar</h3><p>${e.message}</p></div>`); return; }
  const ids = new Set(dados.itens.map((i) => i.id)); est.sel = new Set([...est.sel].filter((id) => ids.has(id)));
  desenhar();
}
async function garantirPacientes() {
  if (pacientes) return pacientes;
  try { pacientes = (await api.get('pacientes?status=todos')).itens.filter((p) => p.status !== 'arquivado'); } catch { pacientes = []; }
  return pacientes;
}

/* ---------------------------------------------------------------- leitura do arquivo (no navegador) */
function carregarLeitor() {
  if (window.CMDiag && window.CMDiag.importar) return Promise.resolve(window.CMDiag.importar);
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = '/assets/js/diagnostico-importar.js?v=2'; s.onload = () => (window.CMDiag && window.CMDiag.importar ? res(window.CMDiag.importar) : rej(new Error('Leitor indisponível.'))); s.onerror = () => rej(new Error('Não foi possível carregar o leitor de extratos.')); document.head.appendChild(s); });
}
async function lerArquivo(arquivo) {
  try {
    const leitor = await carregarLeitor(); const lido = await leitor.lerArquivo(arquivo.name, await arquivo.arrayBuffer());
    const trans = lido.transacoes.map((t) => ({ data: t.data, valor: Math.round(t.valor * 100), descricao: t.desc, id: t.id || '' })).filter((t) => t.valor !== 0);
    if (!trans.length) { aviso('Não encontrei lançamentos neste arquivo.', 'erro'); return; }
    confirmarImportacao(arquivo.name, trans);
  } catch (e) { aviso(e.amigavel || /grande|vazio|PDF|Excel|encontrei/.test(e.message) ? e.message : 'Não consegui ler este arquivo. Baixe o extrato em OFX, CSV ou Excel (.xlsx) no site do banco.', 'erro', 7000); }
}
function confirmarImportacao(nome, trans) {
  const datas = trans.map((t) => t.data).sort(); const entradas = trans.filter((t) => t.valor > 0).reduce((a, t) => a + t.valor, 0); const saidas = trans.filter((t) => t.valor < 0).reduce((a, t) => a - t.valor, 0);
  const m = abrirModal({ titulo: 'Importar extrato', corpo: html`<div><p class="erro-form" role="alert" hidden></p><p style="margin:0 0 10px"><strong>${nome}</strong><br><span class="suave">${trans.length} lançamentos · de ${dataBR(datas[0])} a ${dataBR(datas[datas.length - 1])}</span></p>
    <div class="kpis" style="grid-template-columns:repeat(2,1fr)"><div class="kpi ok"><span>Entradas</span><strong>${brl(entradas)}</strong></div><div class="kpi"><span>Saídas</span><strong>${brl(saidas)}</strong></div></div>
    ${campo({ id: 'contaFinId', rotulo: 'Este extrato é de qual conta?', valor: est.conta, opcoes: contas.map((c) => [c.id, c.nome + (c.tipo === 'cartao' ? ' (cartão)' : '')]) })}
    <p class="suave peq">O arquivo foi lido no seu navegador. Só estas linhas (data, valor e descrição) são guardadas na sua conta, e as que já foram importadas antes são ignoradas. Se importar o arquivo errado, dá para apagar a importação inteira depois.</p></div>`, acoes: [{ id: 'cancelar', rotulo: 'Cancelar' }, { id: 'ok', rotulo: 'Importar', classe: 'btn-pri' }] });
  const form = $('form', m.el);
  m.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-acao]'); if (!b) return; if (b.dataset.acao === 'cancelar') return m.fechar();
    b.disabled = true; const conta = Number(dadosForm(form).contaFinId);
    try {
      let novos = 0; let dup = 0; const ordenadas = [...trans].sort((a, c) => a.data.localeCompare(c.data)); let lote = [];
      const enviar = async () => { if (!lote.length) return; const r = await api.post('extratos', { contaFinId: conta, arquivo: nome, itens: lote }); novos += r.novos; dup += r.duplicados; lote = []; };
      for (let i = 0; i < ordenadas.length; i++) { lote.push(ordenadas[i]); const ultimo = i === ordenadas.length - 1; if (lote.length >= 4500 && (ultimo || ordenadas[i + 1].data !== ordenadas[i].data)) await enviar(); }
      await enviar(); m.fechar(); est.conta = conta; est.situacao = 'pendente'; est.sel = new Set();
      aviso(novos ? `${novos} lançamento${novos === 1 ? '' : 's'} importado${novos === 1 ? '' : 's'}${dup ? ` (${dup} já existia${dup === 1 ? '' : 'm'})` : ''}.` : 'Nada novo: todas as linhas já tinham sido importadas.'); carregar();
    } catch (er) { const x = $('.erro-form', form); x.textContent = er.message; x.hidden = false; b.disabled = false; }
  });
}

/* ---------------------------------------------------------------- tela */
const comCategoria = (i) => i.situacao === 'pendente' && i.categoriaSugerida && i.categoriaSugerida.categoriaId !== null;
const temParExato = (i) => i.sugestoes.some((s) => s.restante === Math.abs(i.valor));   // com par em aberto, o certo é conciliar, não lançar outra despesa
const elegivelParaLote = (i) => comCategoria(i) && i.categoriaSugerida.confianca === 'alta' && !temParExato(i);
const TOM_CONFIANCA = { alta: 'ok', media: 'info', baixa: 'neutro' }; const ROTULO_CONFIANCA = { alta: 'Alta confiança', media: 'Confiança média', baixa: 'Confiança baixa' };
const achar = (id) => dados.itens.find((x) => x.id === Number(id));
const saldoDe = (lista) => lista.reduce((a, i) => a + i.valor, 0);
const mais = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/** Linhas que passam pela busca (descrição, valor, categoria, fornecedor ou paciente). */
function visiveis() {
  const q = semAcento(est.busca).split(/\s+/).filter(Boolean); if (!q.length) return dados.itens;
  return dados.itens.filter((i) => {
    const abs = Math.abs(i.valor); const alvo = semAcento([i.descricao, brl(abs), (abs / 100).toFixed(2).replace('.', ','), String(abs / 100), i.categoriaSugerida && i.categoriaSugerida.categoria, i.fornecedorSugerido && i.fornecedorSugerido.nome,
      i.lancamento && i.lancamento.categoria, i.lancamento && i.lancamento.contraparte, i.lancamento && i.lancamento.paciente].filter(Boolean).join(' '));
    return q.every((p) => alvo.includes(p));
  });
}

function desenhar() {
  const pode = !somenteLeitura(); const c = dados.contagem || {}; const itens = dados.itens; const conta = contas.find((x) => x.id === est.conta);
  const pend = est.situacao === 'pendente' ? itens : []; const entradas = pend.filter((i) => i.valor > 0).reduce((a, i) => a + i.valor, 0); const saidas = pend.filter((i) => i.valor < 0).reduce((a, i) => a - i.valor, 0);
  const faceis = pend.filter((i) => i.sugestoes[0] && i.sugestoes[0].restante === Math.abs(i.valor) && i.sugestoes[0].score >= 70);
  const lote = pend.filter(elegivelParaLote); const medias = pend.filter((i) => comCategoria(i) && i.categoriaSugerida.confianca === 'media' && !temParExato(i)).length;
  montar(raiz, html`<div class="cabeca"><div><h1>Extrato bancário</h1><p>Traga o extrato do banco e confirme o que já foi pago ou recebido.</p></div>${pode ? html`<button class="btn btn-pri" data-importar>Importar extrato</button><input type="file" id="ex-arquivo" accept=".ofx,.csv,.xlsx,.txt" hidden>` : ''}</div>
    <div class="filtros"><div class="campo"><label class="sr" for="ex-conta">Conta</label><select id="ex-conta">${contas.map((x) => html`<option value="${x.id}" ${x.id === est.conta ? raw('selected') : ''}>${x.nome}${x.tipo === 'cartao' ? ' (cartão)' : ''}</option>`)}</select></div>
      <div class="chips" role="group" aria-label="Situação das linhas">${[['pendente', 'Pendentes'], ['conciliado', 'Conciliadas'], ['ignorado', 'Ignoradas']].map(([k, t]) => html`<button type="button" class="chip" data-sit="${k}" aria-pressed="${est.situacao === k}">${t}${c[k] ? ` · ${c[k]}` : ''}</button>`)}</div>
      <div class="campo busca"><label class="sr" for="ex-busca">Buscar nas linhas</label><input id="ex-busca" type="search" placeholder="Buscar por descrição, valor, categoria ou fornecedor" value="${est.busca}" autocomplete="off"></div></div>
    ${est.situacao === 'pendente' && itens.length ? html`<div class="kpis" style="grid-template-columns:repeat(3,1fr)"><div class="kpi"><span>Linhas para tratar</span><strong>${itens.length}</strong></div><div class="kpi ok"><span>Entradas pendentes</span><strong>${brl(entradas)}</strong></div><div class="kpi"><span>Saídas pendentes</span><strong>${brl(saidas)}</strong></div></div>` : ''}
    ${pode && faceis.length ? html`<div class="cartao" style="border-color:var(--ok)"><div class="cartao-t"><div><h3 style="margin:0">${faceis.length} linha${faceis.length === 1 ? '' : 's'} com par certo</h3><span class="suave peq">O valor é igual ao de uma cobrança ou conta em aberto e o nome ou a data batem.</span></div><button class="btn btn-pri btn-peq" data-todos>Conciliar ${faceis.length === 1 ? 'esta' : 'todas'}</button></div></div>` : ''}
    ${pode && lote.length ? html`<div class="cartao" style="border-color:var(--info)" data-cartao-lote><div class="cartao-t"><div><h3 style="margin:0">${lote.length} linha${lote.length === 1 ? '' : 's'} com categoria sugerida de alta confiança</h3><span class="suave peq">Pelo fornecedor cadastrado, pelo paciente ou pelo que você já classificou antes. Confira na lista e lance de uma vez${medias ? ` (mais ${medias} de confiança média para conferir)` : ''}.</span></div><button class="btn btn-pri btn-peq" data-lote>Lançar ${lote.length}</button></div></div>` : ''}
    ${importacoes.length ? html`<details class="cartao ex-imp" data-importacoes ${raw(est.impAberto ? 'open' : '')}><summary>Importações desta conta <span class="suave">· ${importacoes.length}</span></summary>
      <p class="suave peq" style="margin:8px 0 4px">Importou o arquivo errado? Apague a importação: as linhas somem e o que foi conciliado a partir delas é desfeito. Dá para importar o arquivo certo depois.</p>
      <ul class="lista">${importacoes.map((e) => html`<li class="linha" data-imp="${e.id}"><div class="corpo"><span class="tit">${e.arquivo || 'Importação sem nome'}</span>
        <span class="sub">${e.periodoIni ? `${dataBR(e.periodoIni)} a ${dataBR(e.periodoFim)} · ` : ''}${mais(e.qtd, 'linha', 'linhas')} · importada em ${dataBR((e.criadoEm || '').slice(0, 10))}${e.novos < e.qtd ? ` · ${e.qtd - e.novos} já existiam` : ''}</span>
        <span class="sub">${e.pendentes} pendente${e.pendentes === 1 ? '' : 's'} · ${e.conciliadas} conciliada${e.conciliadas === 1 ? '' : 's'} · ${e.ignoradas} ignorada${e.ignoradas === 1 ? '' : 's'}</span></div>
        ${pode ? html`<button class="btn btn-ghost btn-peq btn-perigo-txt" data-apagar-imp="${e.id}">Apagar importação</button>` : ''}</li>`)}</ul></details>` : ''}
    <div id="ex-area">${area(pode, conta)}</div>
    <p class="suave peq" style="margin:12px 4px">Conciliar registra o pagamento na data do extrato e na conta escolhida, sem contar o mesmo dinheiro duas vezes. Dá para desfazer a qualquer momento.</p>`);
}

function area(pode, conta = contas.find((x) => x.id === est.conta)) {
  const c = dados.contagem || {}; const itens = dados.itens; const vis = visiveis(); const todosMarcados = vis.length > 0 && vis.every((i) => est.sel.has(i.id));
  if (!itens.length) return html`<div class="cartao">${vazio(est.situacao === 'pendente' ? (c.conciliado || c.ignorado ? 'Tudo tratado' : 'Nenhuma linha importada') : 'Nada aqui', est.situacao === 'pendente' ? (c.conciliado || c.ignorado ? 'Todas as linhas deste extrato já foram conciliadas ou ignoradas.' : `Importe o extrato de ${conta ? conta.nome : 'uma conta'} (OFX, CSV ou Excel) para começar.`) : '')}</div>`;
  const sel = vis.filter((i) => est.sel.has(i.id)).length;
  return html`<div class="ex-ferramentas">${pode ? html`<label class="marca"><input type="checkbox" id="ex-sel-todos" ${raw(todosMarcados ? 'checked' : '')}><span>Selecionar ${est.busca ? 'as encontradas' : 'todas'} (${vis.length})</span></label>` : ''}
      ${est.situacao === 'pendente' ? html`<label class="marca"><input type="checkbox" id="ex-agrupar" ${raw(est.agrupar ? 'checked' : '')}><span>Agrupar por favorecido</span></label>` : ''}
      ${est.busca ? html`<span class="suave peq">${vis.length} de ${itens.length} linhas</span>` : ''}</div>
    ${vis.length ? html`<div class="cartao" style="padding:6px 14px"><ul class="lista">${est.agrupar && est.situacao === 'pendente' ? grupos(vis, pode) : vis.map((i) => linha(i, pode))}</ul></div>` : html`<div class="cartao">${vazio('Nenhuma linha encontrada', 'Tente outra palavra ou limpe a busca.')}</div>`}
    ${pode && sel ? barra(vis.filter((i) => est.sel.has(i.id))) : ''}`;
}
const atualizarArea = () => { const a = $('#ex-area', raiz); if (a) montar(a, area(!somenteLeitura())); };

function barra(sel) {
  const entradas = sel.filter((i) => i.valor > 0).length; const s = saldoDe(sel);
  return html`<div class="ex-barra" role="region" aria-label="Ações para as linhas selecionadas"><strong data-barra-n>${mais(sel.length, 'linha selecionada', 'linhas selecionadas')}</strong><span class="suave-claro">${entradas ? `${entradas} entrada${entradas === 1 ? '' : 's'} · ` : ''}saldo ${s >= 0 ? '+' : '−'} ${brl(Math.abs(s))}</span>
    <span class="ex-barra-acoes">${est.situacao === 'pendente' ? html`<button class="btn btn-pri btn-peq" data-lote-lancar>Lançar…</button><button class="btn btn-sec btn-peq" data-lote-sug>Usar sugestões</button><button class="btn btn-sec btn-peq" data-lote-ignorar>Ignorar</button>`
      : est.situacao === 'conciliado' ? html`<button class="btn btn-pri btn-peq" data-lote-alterar>Mudar categoria ou fornecedor…</button><button class="btn btn-sec btn-peq" data-lote-desfazer>Desfazer conciliação</button>`
        : html`<button class="btn btn-pri btn-peq" data-lote-desfazer>Voltar para pendentes</button>`}<button class="btn btn-ghost btn-peq" data-lote-limpar>Limpar</button></span></div>`;
}

/** Agrupa as pendentes pelo favorecido: os grupos com 2 ou mais linhas primeiro, as avulsas por último. */
function grupos(vis, pode) {
  const mapa = new Map();
  vis.forEach((i) => { const k = i.grupo ? i.grupo.chave : ''; if (!mapa.has(k)) mapa.set(k, { chave: k, nome: '', itens: [] }); mapa.get(k).itens.push(i); });
  mapa.forEach((g) => { g.nome = g.itens.map((i) => (i.grupo ? i.grupo.nome : '')).filter(Boolean).sort((x, y) => x.length - y.length)[0] || ''; });   // o nome mais curto é o mais geral ("Marcenaria Ze", não "Marcenaria Ze Orcamento")
  const lista = [...mapa.values()]; const fortes = lista.filter((g) => g.chave && g.itens.length > 1).sort((a, b) => b.itens.length - a.itens.length || a.nome.localeCompare(b.nome));
  const avulsas = lista.filter((g) => !g.chave || g.itens.length === 1).flatMap((g) => g.itens);
  const cab = (g) => html`<li class="grupo-cab" data-grupo="${g.chave}">${pode ? html`<input type="checkbox" class="ex-sel" data-sel-grupo="${g.chave}" aria-label="Selecionar o grupo ${g.nome}" ${raw(g.itens.every((i) => est.sel.has(i.id)) ? 'checked' : '')}>` : ''}
    <div class="corpo"><strong>${g.nome || 'Sem favorecido identificado'}</strong><span class="sub">${mais(g.itens.length, 'linha', 'linhas')} · saldo ${saldoDe(g.itens) >= 0 ? '+' : '−'} ${brl(Math.abs(saldoDe(g.itens)))}</span></div>
    ${pode ? html`<button class="btn btn-sec btn-peq" data-classificar-grupo="${g.chave}">Classificar o grupo…</button>` : ''}</li>`;
  return html`${fortes.map((g) => html`${cab(g)}${g.itens.map((i) => linha(i, pode))}`)}${avulsas.length ? html`<li class="grupo-cab grupo-avulsas"><div class="corpo"><strong>Avulsas</strong><span class="sub">${mais(avulsas.length, 'linha', 'linhas')} sem outras parecidas</span></div></li>${avulsas.map((i) => linha(i, pode))}` : ''}`;
}

function sugestoesDaLinha(i) {
  const s = i.categoriaSugerida; const f = i.fornecedorSugerido; if (!s && !f && !i.acaoSugerida) return '';
  const motivo = s ? s.motivo : f ? f.motivo : '';
  return html`<span class="sub sug-cat" data-sug="${i.id}">${s && s.categoria ? selo('Sugestão: ' + s.categoria, TOM_CONFIANCA[s.confianca]) : ''}
    ${f ? selo('Fornecedor: ' + f.nome + (f.origem === 'novo' ? ' (novo)' : ''), f.origem === 'novo' ? 'neutro' : TOM_CONFIANCA[f.confianca]) : ''}${i.acaoSugerida === 'transferencia' ? selo('Parece transferência entre contas', 'info') : ''}
    ${motivo ? html`<span class="suave peq">${motivo}</span>` : ''}</span>`;
}

function linha(i, pode) {
  const entrada = i.valor > 0; const [dd, mm, aa] = dataBR(i.data).split('/'); const pend = i.situacao === 'pendente'; const l = i.lancamento && i.lancamento.id ? i.lancamento : null;
  return html`<li class="linha ex" data-item="${i.id}">${pode ? html`<input type="checkbox" class="ex-sel" data-sel="${i.id}" aria-label="Selecionar ${i.descricao}" ${raw(est.sel.has(i.id) ? 'checked' : '')}>` : ''}<div class="rc-data"><b>${dd}/${mm}</b><small>${aa}</small></div>
    <div class="corpo"><span class="tit" title="${i.descricao}">${i.descricao}</span>${pend ? sugestoesDaLinha(i) : ''}${i.situacao === 'conciliado' ? html`<span class="sub">${i.transferenciaId ? 'Transferência entre contas'
      : l ? html`Lançada como <strong>${l.categoria || 'sem categoria'}</strong>${l.contraparte ? ` · ${l.contraparte}` : ''}${l.paciente ? ` · ${l.paciente}` : ''}${l.criadoPelaImportacao ? '' : ' (conta que já existia)'}` : 'Conciliada com um lançamento'}</span>` : ''}</div>
    <strong class="num ${entrada ? 'bom' : 'ruim'}">${entrada ? '+' : '−'} ${brl(Math.abs(i.valor))}</strong>
    ${pend && pode ? html`<span class="acoes-rapidas">${i.sugestoes.map((s) => html`<button class="btn ${s.restante === Math.abs(i.valor) ? 'btn-pri' : 'btn-sec'} btn-peq" data-conciliar="${i.id}" data-lanc="${s.lancamentoId}" title="${s.descricao}">Conciliar com ${s.quem || s.descricao} · ${brl(s.restante)}</button>`)}
      ${i.acaoSugerida === 'transferencia' ? html`<button class="btn btn-pri btn-peq" data-transf="${i.id}">Transferência entre contas</button>` : ''}
      ${comCategoria(i) && !temParExato(i) && i.acaoSugerida !== 'transferencia' ? html`<button class="btn ${i.categoriaSugerida.confianca === 'alta' ? 'btn-pri' : 'btn-sec'} btn-peq" data-lancar-sug="${i.id}" title="${ROTULO_CONFIANCA[i.categoriaSugerida.confianca]}: ${i.categoriaSugerida.motivo}">Lançar como ${i.categoriaSugerida.categoria}</button>` : ''}<button class="btn btn-sec btn-peq" data-lancar="${i.id}">Lançar</button><button class="btn btn-ghost btn-peq" data-buscar="${i.id}">Conciliar com outra conta…</button>${i.acaoSugerida === 'transferencia' ? '' : html`<button class="btn btn-ghost btn-peq" data-transf="${i.id}">Transferência</button>`}<button class="btn btn-ghost btn-peq" data-ignorar="${i.id}">Ignorar</button></span>`
      : !pend ? html`${selo(i.situacao === 'conciliado' ? 'Conciliada' : 'Ignorada', i.situacao === 'conciliado' ? 'ok' : 'neutro')}${pode ? html`${i.situacao === 'conciliado' && l ? html`<button class="btn btn-ghost btn-peq" data-alterar="${i.id}">Mudar categoria</button>` : ''}<button class="btn btn-ghost btn-peq" data-desfazer="${i.id}">Desfazer</button>` : ''}` : ''}</li>`;
}

/* ---------------------------------------------------------------- ações */
async function agir(rota, corpo, msg) { try { await api.post(rota, corpo || {}); if (msg) aviso(msg); await carregar(); return true; } catch (er) { aviso(er.message, 'erro', 6000); return false; } }
const erroNoForm = (form, b, msg) => { const x = $('.erro-form', form); x.textContent = msg; x.hidden = false; if (b) b.disabled = false; };

/** Mostra a caixa "Cadastrar como fornecedor" só quando o nome digitado ainda não está no cadastro. */
function ligarCadastroFornecedor(form) {
  const campoForn = form.elements.contraparte; const caixa = $('[data-cad-forn]', form); if (!campoForn || !caixa) return;
  const conhecido = () => (App.cache.fornecedores || []).some((f) => semAcento(f.nome).trim() === semAcento(campoForn.value).trim());
  const atualizar = () => { const t = campoForn.value.trim(); caixa.hidden = !t || conhecido(); if (!caixa.hidden) $('[data-nome]', caixa).textContent = t; };
  campoForn.addEventListener('input', atualizar); campoForn.addEventListener('change', atualizar); atualizar();
}
const caixaCadastrar = () => html`<label class="marca" data-cad-forn hidden><input type="checkbox" name="cadastrar" checked><span>Cadastrar «<b data-nome></b>» como fornecedor (a categoria escolhida vira o padrão dele)</span></label>`;

/** Lançar uma linha: categoria e fornecedor/paciente com busca, e a opção de estender às linhas parecidas. */
async function formLancar(i) {
  const entrada = i.valor > 0; const sug = i.situacao === 'pendente' ? i.categoriaSugerida : null; const fs = !entrada ? i.fornecedorSugerido : null;
  if (entrada) await garantirPacientes();
  const parecidas = i.grupo ? dados.itens.filter((x) => x.id !== i.id && x.situacao === 'pendente' && (x.valor > 0) === entrada && x.grupo && x.grupo.chave === i.grupo.chave) : [];
  const m = abrirModal({ titulo: entrada ? 'Lançar como receita' : 'Lançar como despesa', largo: true, corpo: html`<div><p class="erro-form" role="alert" hidden></p><p class="suave peq" style="margin-top:0">${dataBR(i.data)} · <strong>${entrada ? '+' : '−'} ${brl(Math.abs(i.valor))}</strong> · ${i.descricao}</p>
    ${campo({ id: 'descricao', rotulo: 'Descrição', valor: i.descricao.slice(0, 150), obrig: true })}
    <div class="grade-2">${comboCategoria({ tipo: entrada ? 'receita' : 'despesa', valor: sug && sug.categoriaId ? sug.categoriaId : '' })}
      ${entrada ? combo({ id: 'pacienteId', rotulo: 'Paciente (opcional)', valor: sug && sug.pacienteId ? sug.pacienteId : '', vazio: 'Sem paciente', opcoes: pacientes.map((p) => [p.id, p.nome]) })
        : comboFornecedor({ valor: fs ? fs.nome : sug && sug.contraparte ? sug.contraparte : '' })}</div>
    ${sug || fs ? html`<p class="suave peq" data-hint-sug style="margin:-4px 0 10px">${sug ? selo(ROTULO_CONFIANCA[sug.confianca], TOM_CONFIANCA[sug.confianca]) : ''} ${sug && sug.categoria ? 'Categoria sugerida pela descrição.' : ''} ${sug ? sug.motivo : ''} ${fs && (!sug || fs.motivo !== sug.motivo) ? fs.motivo : ''}</p>` : ''}
    ${entrada ? '' : caixaCadastrar()}
    ${parecidas.length ? html`<label class="marca" style="margin-top:6px"><input type="checkbox" name="parecidas"><span>Fazer o mesmo com as <strong>${parecidas.length}</strong> linha${parecidas.length === 1 ? '' : 's'} parecida${parecidas.length === 1 ? '' : 's'} ("${i.grupo.nome}", saldo ${saldoDe(parecidas) >= 0 ? '+' : '−'} ${brl(Math.abs(saldoDe(parecidas)))})</span></label>` : ''}</div>`,
    acoes: [{ id: 'cancelar', rotulo: 'Cancelar' }, { id: 'ok', rotulo: 'Lançar', classe: 'btn-pri' }] });
  const form = $('form', m.el); ligarSeletores(m.el); ligarCadastroFornecedor(form);
  m.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-acao]'); if (!b) return; if (b.dataset.acao === 'cancelar') return m.fechar(); const d = dadosForm(form); b.disabled = true;
    const catId = d.categoriaId ? Number(d.categoriaId) : null; const contra = !entrada && d.contraparte ? d.contraparte : undefined; const cad = !entrada && !!d.contraparte && d.cadastrar === true && !(form.querySelector('[data-cad-forn]') || {}).hidden;
    try {
      await api.post(`extrato-itens/${i.id}/lancar`, { descricao: d.descricao, categoriaId: catId, contraparte: contra, criarFornecedor: cad || undefined, pacienteId: entrada && d.pacienteId ? Number(d.pacienteId) : undefined });
      let extra = 0;
      if (d.parecidas) { const r = await api.post('extrato-itens/lote', { ids: parecidas.map((x) => x.id), acao: 'lancar', categoriaId: catId, contraparte: contra, pacienteId: entrada && d.pacienteId ? Number(d.pacienteId) : undefined }); extra = r.feitas; }
      m.fechar(); aviso(extra ? `Lançamento criado e mais ${mais(extra, 'linha parecida lançada', 'linhas parecidas lançadas')}.` : 'Lançamento criado e conciliado.'); carregar();
    } catch (er) { erroNoForm(form, b, er.message); }
  });
}

/** Ação em massa: lançar (ou mudar categoria/fornecedor) várias linhas de uma vez. */
async function formLote(ids, modo) {
  const itens = ids.map(achar).filter(Boolean); if (!itens.length) return;
  const ent = itens.filter((i) => i.valor > 0); const sai = itens.filter((i) => i.valor < 0); const alterar = modo === 'alterar';
  if (ent.length) await garantirPacientes();
  const resumo = html`<p class="suave peq" style="margin-top:0"><strong>${mais(itens.length, 'linha', 'linhas')}</strong>${ent.length ? ` · ${mais(ent.length, 'entrada', 'entradas')} (+ ${brl(saldoDe(ent))})` : ''}${sai.length ? ` · ${mais(sai.length, 'saída', 'saídas')} (− ${brl(Math.abs(saldoDe(sai)))})` : ''}</p>`;
  const m = abrirModal({ titulo: alterar ? 'Mudar categoria ou fornecedor' : 'Lançar as linhas selecionadas', largo: true, corpo: html`<div><p class="erro-form" role="alert" hidden></p>${resumo}
    ${sai.length ? html`<h4 style="margin:6px 0 8px">${ent.length ? 'Saídas' : 'Despesas'}</h4><div class="grade-2">${comboCategoria({ id: 'categoriaSaida', rotulo: 'Categoria', tipo: 'despesa', ajuda: alterar ? 'Em branco: não muda.' : 'Em branco: cada linha usa a sugestão, quando houver.' })}${comboFornecedor({ ajuda: alterar ? 'Em branco: não muda.' : 'O mesmo para todas as saídas.' })}</div>${caixaCadastrar()}` : ''}
    ${ent.length ? html`<h4 style="margin:10px 0 8px">${sai.length ? 'Entradas' : 'Receitas'}</h4><div class="grade-2">${comboCategoria({ id: 'categoriaEntrada', rotulo: 'Categoria', tipo: 'receita', ajuda: alterar ? 'Em branco: não muda.' : 'Em branco: cada linha usa a sugestão, quando houver.' })}${combo({ id: 'pacienteId', rotulo: 'Paciente (opcional)', vazio: alterar ? 'Não mudar' : 'Sem paciente', opcoes: pacientes.map((p) => [p.id, p.nome]), ajuda: 'Só use se todas as entradas forem da mesma pessoa.' })}</div>` : ''}
    ${alterar ? '' : html`<label class="marca" style="margin-top:8px"><input type="checkbox" name="usarSug" checked><span>Onde eu deixar em branco, usar a sugestão de cada linha (categoria, fornecedor e paciente). Linhas sem sugestão e sem categoria escolhida ficam pendentes.</span></label>`}
    <details style="margin-top:10px"><summary class="suave peq">Ver as linhas</summary><ul class="lista ex-resumo-lote">${itens.slice(0, 40).map((i) => html`<li class="linha"><div class="corpo"><span class="tit" title="${i.descricao}">${i.descricao}</span></div><span class="num ${i.valor > 0 ? 'bom' : 'ruim'}">${i.valor > 0 ? '+' : '−'} ${brl(Math.abs(i.valor))}</span></li>`)}${itens.length > 40 ? html`<li class="suave peq">e mais ${itens.length - 40}…</li>` : ''}</ul></details></div>`,
    acoes: [{ id: 'cancelar', rotulo: 'Cancelar' }, { id: 'ok', rotulo: alterar ? 'Aplicar a ' + mais(itens.length, 'linha', 'linhas') : 'Lançar ' + mais(itens.length, 'linha', 'linhas'), classe: 'btn-pri' }] });
  const form = $('form', m.el); ligarSeletores(m.el); ligarCadastroFornecedor(form);
  m.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-acao]'); if (!b) return; if (b.dataset.acao === 'cancelar') return m.fechar(); const d = dadosForm(form); b.disabled = true; $('.erro-form', form).hidden = true;
    const usar = !alterar && d.usarSug === true; const cad = d.cadastrar === true && !(form.querySelector('[data-cad-forn]') || {}).hidden && !!d.contraparte; let feitas = 0; let puladas = 0;
    const chamar = async (lista, catId, extra) => {
      if (!lista.length) return; const corpo = { ids: lista.map((x) => x.id), acao: alterar ? 'alterar' : 'lancar', ...extra };
      if (catId) corpo.categoriaId = Number(catId); else if (!alterar && !usar) corpo.categoriaId = null; if (usar) corpo.usarSugestoes = true;
      const r = await api.post('extrato-itens/lote', corpo); feitas += r.feitas; puladas += r.puladas;
    };
    try {
      if (alterar && !d.categoriaSaida && !d.categoriaEntrada && !d.contraparte && !d.pacienteId) throw new Error('Escolha o que mudar: a categoria, o fornecedor ou o paciente.');
      await chamar(sai, d.categoriaSaida, { ...(d.contraparte ? { contraparte: d.contraparte, criarFornecedor: cad || undefined } : {}) });
      await chamar(ent, d.categoriaEntrada, { ...(d.pacienteId ? { pacienteId: Number(d.pacienteId) } : {}) });
      m.fechar(); est.sel = new Set();
      aviso(`${mais(feitas, alterar ? 'linha alterada' : 'linha lançada', alterar ? 'linhas alteradas' : 'linhas lançadas')}${puladas ? `; ${puladas} ficou${puladas === 1 ? '' : 'ram'} como estava${puladas === 1 ? '' : 'm'} (sem categoria sugerida ou de outro tipo)` : ''}.`, feitas ? 'ok' : 'erro', 6000); carregar();
    } catch (er) { erroNoForm(form, b, er.message); }
  });
}

/** Conciliar com uma conta em aberto escolhida à mão: busca por nome, descrição ou valor. */
async function formConciliar(i) {
  const tipo = i.valor > 0 ? 'receber' : 'pagar'; const abs = Math.abs(i.valor); let timer = null; let lista = [];
  const m = abrirModal({ titulo: tipo === 'receber' ? 'Conciliar com uma cobrança' : 'Conciliar com uma conta a pagar', largo: true, corpo: html`<div><p class="erro-form" role="alert" hidden></p>
    <p class="suave peq" style="margin-top:0">${dataBR(i.data)} · <strong>${tipo === 'receber' ? '+' : '−'} ${brl(abs)}</strong> · ${i.descricao}</p>
    <div class="campo"><label for="cc-busca">Buscar</label><input id="cc-busca" type="search" placeholder="Nome ${tipo === 'receber' ? 'do paciente' : 'do fornecedor'}, descrição ou valor" autocomplete="off"></div>
    <div id="cc-lista" aria-live="polite"><p class="suave">Carregando…</p></div></div>`, acoes: [{ id: 'cancelar', rotulo: 'Fechar' }] });
  const form = $('form', m.el); const caixa = $('#cc-lista', m.el); const campoBusca = $('#cc-busca', m.el);
  const somenteNumero = (q) => /^[\d.,\s]+$/.test(q) && /\d/.test(q);
  const desenharResultado = () => {
    const q = campoBusca.value.trim(); let itens = lista;
    if (somenteNumero(q)) { const alvo = q.replace(/\./g, '').replace(/\s/g, '').replace(',', '.'); itens = itens.filter((l) => (l.restante / 100).toFixed(2).startsWith(Number(alvo).toFixed(2)) || String(l.restante / 100).startsWith(alvo) || (l.restante / 100).toFixed(2).replace('.', ',').includes(q.replace(/\s/g, ''))); }
    const cabem = itens.filter((l) => l.restante >= abs); const maiores = itens.length - cabem.length;
    const ordenados = cabem.sort((a, b) => (a.restante === abs ? 0 : 1) - (b.restante === abs ? 0 : 1) || Math.abs(new Date(a.vencimento) - new Date(i.data)) - Math.abs(new Date(b.vencimento) - new Date(i.data)));
    montar(caixa, ordenados.length ? html`<ul class="lista cc-lista">${ordenados.slice(0, 60).map((l) => html`<li class="linha"><div class="corpo"><span class="tit">${(l.paciente && l.paciente.nome) || l.contraparte || l.descricao}</span><span class="sub">${l.descricao}${l.categoria ? ` · ${l.categoria}` : ''} · vence em ${dataBR(l.vencimento)}${l.estado === 'atrasado' ? ' (atrasada)' : ''}</span></div>
        <span class="dir"><strong class="num">${brl(l.restante)}</strong>${l.restante === abs ? selo('Valor igual', 'ok') : selo('Sobra ' + brl(l.restante - abs), 'info')}</span><button class="btn ${l.restante === abs ? 'btn-pri' : 'btn-sec'} btn-peq" data-cc="${l.id}">Conciliar</button></li>`)}</ul>
      ${ordenados.length > 60 ? html`<p class="suave peq">Mostrando 60 de ${ordenados.length}: refine a busca.</p>` : ''}`
      : html`<p class="suave">Nenhuma ${tipo === 'receber' ? 'cobrança' : 'conta'} em aberto encontrada${q ? ' para essa busca' : ''}.</p>`);
    if (maiores > 0) caixa.insertAdjacentHTML('beforeend', `<p class="suave peq">${maiores} conta${maiores === 1 ? '' : 's'} com saldo menor que ${abs === 0 ? '' : 'esta linha'} não ${maiores === 1 ? 'aparece' : 'aparecem'}: use "Lançar" para criar um lançamento novo.</p>`);
  };
  const buscar = async () => {
    const q = campoBusca.value.trim(); const servidor = q && !somenteNumero(q) ? `&busca=${encodeURIComponent(q)}` : '';
    try { lista = (await api.get(`lancamentos?tipo=${tipo}&situacao=aberto&limite=500${servidor}`)).itens; desenharResultado(); } catch (er) { erroNoForm(form, null, er.message); }
  };
  campoBusca.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(buscar, 250); });
  m.el.addEventListener('click', async (e) => {
    const cc = e.target.closest('[data-cc]');
    if (cc) { cc.disabled = true; try { await api.post(`extrato-itens/${i.id}/conciliar`, { lancamentoId: Number(cc.dataset.cc) }); m.fechar(); aviso('Conciliado.'); carregar(); } catch (er) { erroNoForm(form, cc, er.message); } return; }
    const b = e.target.closest('[data-acao]'); if (b && b.dataset.acao === 'cancelar') m.fechar();
  });
  buscar();
}

function formTransferencia(i) {
  const outras = contas.filter((c) => c.id !== i.contaFinId); const sai = i.valor < 0;
  const padrao = /FATURA|CART[AÃ]O|CARTAO/i.test(i.descricao) ? (outras.find((c) => c.tipo === 'cartao') || outras[0]) : outras[0];   // "PAGAMENTO FATURA" → o cartão
  const m = abrirModal({ titulo: 'Transferência entre contas', corpo: html`<div><p class="erro-form" role="alert" hidden></p><p class="suave peq" style="margin-top:0">${dataBR(i.data)} · <strong>${sai ? '−' : '+'} ${brl(Math.abs(i.valor))}</strong> · ${i.descricao}</p>
    ${campo({ id: 'contaId', rotulo: sai ? 'O dinheiro foi para qual conta?' : 'O dinheiro veio de qual conta?', valor: padrao ? padrao.id : '', opcoes: outras.map((c) => [c.id, c.nome + (c.tipo === 'cartao' ? ' (cartão: pagamento de fatura)' : '')]) })}
    <p class="suave peq">Se o outro extrato também tem esta linha, ignore-a lá para não contar duas vezes.</p></div>`, acoes: [{ id: 'cancelar', rotulo: 'Cancelar' }, { id: 'ok', rotulo: 'Registrar transferência', classe: 'btn-pri' }] });
  const form = $('form', m.el);
  m.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-acao]'); if (!b) return; if (b.dataset.acao === 'cancelar') return m.fechar(); b.disabled = true;
    try { await api.post(`extrato-itens/${i.id}/transferencia`, { contaId: Number(dadosForm(form).contaId) }); m.fechar(); aviso('Transferência registrada.'); carregar(); } catch (er) { erroNoForm(form, b, er.message); }
  });
}

async function apagarImportacao(id) {
  const e = importacoes.find((x) => x.id === Number(id)); if (!e) return;
  const nome = e.arquivo || 'sem nome';
  const texto = `Apagar a importação «${nome}»? Serão removidas ${mais(e.linhasAtuais, 'linha', 'linhas')} deste extrato`
    + `${e.conciliadas ? `; ${e.conciliadas === 1 ? 'a 1 conciliada tem' : `as ${e.conciliadas} conciliadas têm`} os pagamentos registrados e os lançamentos criados por ela desfeitos (as contas que já existiam voltam a ficar em aberto)` : ''}.`
    + `${e.novos < e.qtd ? ' As linhas que já existiam em importações anteriores não são afetadas.' : ''} Depois dá para importar o arquivo certo.`;
  if (!(await confirmar(texto, { titulo: 'Apagar importação', ok: 'Apagar importação', perigo: true }))) return;
  try {
    const r = await api.del('extratos/' + e.id); est.impAberto = importacoes.length > 1;
    aviso(`Importação apagada: ${mais(r.linhas, 'linha removida', 'linhas removidas')}${r.desfeitas ? `, ${mais(r.desfeitas, 'conciliação desfeita', 'conciliações desfeitas')}` : ''}.`, 'ok', 6000);
  } catch (er) { aviso(er.message, 'erro', 9000); }
  await carregar();
}

/* ---------------------------------------------------------------- eventos */
function digitou(e) {
  if (e.target.id !== 'ex-busca') return; est.busca = e.target.value; atualizarArea();
}
function mudou(e) {
  const t = e.target;
  if (t.id === 'ex-conta') { est.conta = Number(t.value); est.situacao = 'pendente'; est.sel = new Set(); est.busca = ''; return carregar(); }
  if (t.id === 'ex-arquivo' && t.files[0]) { const f = t.files[0]; t.value = ''; return lerArquivo(f); }
  if (t.id === 'ex-sel-todos') { visiveis().forEach((i) => (t.checked ? est.sel.add(i.id) : est.sel.delete(i.id))); return atualizarArea(); }
  if (t.id === 'ex-agrupar') { est.agrupar = t.checked; return atualizarArea(); }
  if (t.dataset && t.dataset.sel) { const id = Number(t.dataset.sel); if (t.checked) est.sel.add(id); else est.sel.delete(id); return atualizarArea(); }
  if (t.dataset && t.dataset.selGrupo !== undefined) { visiveis().filter((i) => (i.grupo ? i.grupo.chave : '') === t.dataset.selGrupo).forEach((i) => (t.checked ? est.sel.add(i.id) : est.sel.delete(i.id))); return atualizarArea(); }
}
const selecionados = () => visiveis().filter((i) => est.sel.has(i.id));
async function clique(e) {
  const t = e.target;
  if (t.closest('[data-importar]')) return $('#ex-arquivo', raiz).click();
  const sit = t.closest('[data-sit]'); if (sit) { est.situacao = sit.dataset.sit; est.sel = new Set(); return carregar(); }
  const det = t.closest('[data-importacoes] > summary'); if (det) { est.impAberto = !det.parentElement.open; }
  const apg = t.closest('[data-apagar-imp]'); if (apg) return apagarImportacao(apg.dataset.apagarImp);
  const conc = t.closest('[data-conciliar]'); if (conc) return agir(`extrato-itens/${conc.dataset.conciliar}/conciliar`, { lancamentoId: Number(conc.dataset.lanc) }, 'Conciliado.');
  const sg = t.closest('[data-lancar-sug]');
  if (sg) { const i = achar(sg.dataset.lancarSug); const s = i.categoriaSugerida; const f = i.fornecedorSugerido; const entrada = i.valor > 0; sg.disabled = true;
    const contra = !entrada ? (s.contraparte || (f && f.origem !== 'novo' ? f.nome : undefined)) : undefined;
    return agir(`extrato-itens/${i.id}/lancar`, { descricao: i.descricao.slice(0, 150), categoriaId: s.categoriaId, contraparte: contra, pacienteId: entrada && s.pacienteId ? s.pacienteId : undefined }, `Lançado em ${s.categoria}.`); }
  if (t.closest('[data-lote]')) {
    const alvo = dados.itens.filter(elegivelParaLote); const total = alvo.reduce((a, i) => a + i.valor, 0);
    if (!(await confirmar(`Lançar ${alvo.length} linha${alvo.length === 1 ? '' : 's'} (saldo ${total >= 0 ? '+' : '−'} ${brl(Math.abs(total))}) já com a categoria sugerida? Cada uma vira um lançamento pago na data do extrato, e dá para desfazer linha a linha.`, { titulo: 'Lançar com a categoria sugerida', ok: 'Lançar' }))) return;
    try { const r = await api.post('extrato-itens/lancar-sugeridas', { ids: alvo.map((i) => i.id), minimo: 'alta' }); aviso(`${r.lancadas} linha${r.lancadas === 1 ? '' : 's'} lançada${r.lancadas === 1 ? '' : 's'}${r.puladas ? `, ${r.puladas} ficou${r.puladas === 1 ? '' : 'ram'} para você conferir` : ''}.`); } catch (er) { aviso(er.message, 'erro', 6000); }
    return carregar();
  }
  const lan = t.closest('[data-lancar]'); if (lan) return formLancar(achar(lan.dataset.lancar));
  const bus = t.closest('[data-buscar]'); if (bus) return formConciliar(achar(bus.dataset.buscar));
  const tr = t.closest('[data-transf]'); if (tr) return formTransferencia(achar(tr.dataset.transf));
  const ig = t.closest('[data-ignorar]'); if (ig) return agir(`extrato-itens/${ig.dataset.ignorar}/ignorar`, {}, 'Linha ignorada.');
  const des = t.closest('[data-desfazer]'); if (des) return agir(`extrato-itens/${des.dataset.desfazer}/desfazer`, {}, 'Desfeito: a linha voltou a ficar pendente.');
  const alt = t.closest('[data-alterar]'); if (alt) return formLote([Number(alt.dataset.alterar)], 'alterar');
  const cg = t.closest('[data-classificar-grupo]');
  if (cg) { const ids = visiveis().filter((i) => (i.grupo ? i.grupo.chave : '') === cg.dataset.classificarGrupo).map((i) => i.id); ids.forEach((id) => est.sel.add(id)); atualizarArea(); return formLote(ids, 'lancar'); }
  /* ---- barra de ações em massa ---- */
  if (t.closest('[data-lote-limpar]')) { est.sel = new Set(); return atualizarArea(); }
  if (t.closest('[data-lote-lancar]')) return formLote(selecionados().map((i) => i.id), 'lancar');
  if (t.closest('[data-lote-alterar]')) return formLote(selecionados().map((i) => i.id), 'alterar');
  const emMassa = async (acao, texto, titulo, ok, extra = {}) => {
    const ids = selecionados().map((i) => i.id); if (!ids.length) return;
    if (!(await confirmar(texto(ids.length), { titulo, ok, perigo: acao === 'desfazer' }))) return;
    try { const r = await api.post('extrato-itens/lote', { ids, acao, ...extra }); est.sel = new Set(); const mot = Object.entries(r.motivos || {}).map(([k, v]) => `${v} ${k}`).join(', ');
      aviso(`${r.feitas} feita${r.feitas === 1 ? '' : 's'}${r.puladas ? `; ${r.puladas} ficou${r.puladas === 1 ? '' : 'ram'} como estava${r.puladas === 1 ? '' : 'm'}${mot ? ` (${mot})` : ''}` : ''}.`, r.feitas ? 'ok' : 'erro', 7000); } catch (er) { aviso(er.message, 'erro', 7000); }
    return carregar();
  };
  if (t.closest('[data-lote-ignorar]')) return emMassa('ignorar', (n) => `Ignorar ${mais(n, 'linha', 'linhas')}? Elas saem da lista de pendentes e ficam em "Ignoradas" (dá para voltar atrás).`, 'Ignorar linhas', 'Ignorar');
  if (t.closest('[data-lote-sug]')) return emMassa('lancar', (n) => `Lançar ${mais(n, 'linha', 'linhas')} com a categoria e o fornecedor sugeridos? As que não têm sugestão ficam pendentes. Fornecedores novos sugeridos também serão cadastrados.`, 'Usar as sugestões', 'Lançar', { usarSugestoes: true, criarFornecedor: true });
  if (t.closest('[data-lote-desfazer]')) return emMassa('desfazer', (n) => est.situacao === 'ignorado' ? `Voltar ${mais(n, 'linha', 'linhas')} para pendentes?` : `Desfazer a conciliação de ${mais(n, 'linha', 'linhas')}? Os pagamentos registrados e os lançamentos criados por elas serão removidos, e as linhas voltam a ficar pendentes. Linhas com recibo emitido não são desfeitas.`, est.situacao === 'ignorado' ? 'Voltar para pendentes' : 'Desfazer conciliações', est.situacao === 'ignorado' ? 'Voltar' : 'Desfazer');
  if (t.closest('[data-todos]')) {
    const faceis = dados.itens.filter((i) => i.situacao === 'pendente' && i.sugestoes[0] && i.sugestoes[0].restante === Math.abs(i.valor) && i.sugestoes[0].score >= 70);
    if (!(await confirmar(`Conciliar ${faceis.length} linha${faceis.length === 1 ? '' : 's'} com o lançamento sugerido (mesmo valor e nome/data compatíveis)?`, { titulo: 'Conciliar sugestões', ok: 'Conciliar' }))) return;
    let feitas = 0; for (const i of faceis) { try { await api.post(`extrato-itens/${i.id}/conciliar`, { lancamentoId: i.sugestoes[0].lancamentoId }); feitas++; } catch { /* segue com as próximas */ } }
    aviso(`${feitas} de ${faceis.length} conciliadas.`); carregar();
  }
}
