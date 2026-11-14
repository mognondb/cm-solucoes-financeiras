/* Importar cadastros (pacientes, fornecedores, categorias) de uma planilha: escolher o arquivo → ligar as colunas → conferir → importar.
   O arquivo é lido no navegador; o servidor só confere e grava depois da confirmação (nada é gravado na conferência). */
import { api } from '../api.js';
import { somenteLeitura, carregarBase } from '../estado.js';
import { html, raw, montar, $, selo } from '../ui.js';
import { lerArquivo, detectarCabecalho, ligarColunas, montarLinhas, baixarModelo, letraColuna } from '../planilha.js';

const TIPOS = {
  pacientes: { rotulo: 'Pacientes', singular: 'paciente', plural: 'pacientes', modelo: 'modelo-pacientes.csv', destino: '#/pacientes', verDestino: 'Ver pacientes',
    intro: 'Cadastro administrativo: nome, contato, responsável financeiro e como cada um paga. Só o nome é obrigatório. Não coloque informações clínicas.' },
  fornecedores: { rotulo: 'Fornecedores', singular: 'fornecedor', plural: 'fornecedores', modelo: 'modelo-fornecedores.csv', destino: '#/fornecedores', verDestino: 'Ver fornecedores',
    intro: 'Quem o consultório paga: aluguel, contador, materiais, sistemas. O nome é obrigatório; a categoria padrão (opcional) já vem preenchida quando você lançar uma despesa dele.' },
  categorias: { rotulo: 'Categorias', singular: 'categoria', plural: 'categorias', modelo: 'modelo-categorias.csv', destino: '#/config/categorias', verDestino: 'Ver categorias',
    intro: 'Categorias de receita e de despesa usadas nos relatórios. Informe o tipo (receita ou despesa) e o nome; para despesas, se é fixa ou variável e se costuma entrar no livro-caixa.' },
};
const novoEstado = (tipo) => ({ tipo, passo: 'arquivo', campos: null, limite: 2000, leitura: null, aba: 0, cab: 0, mapa: {}, padroes: {}, duplicados: 'ignorar', previa: null, enviadas: null, filtro: 'todas', ocupado: false, final: null, erro: '' });
let est = novoEstado('pacientes');
let raiz = null;

export async function abrir(el, resto, consulta) {
  raiz = el; el.onclick = clique; el.onchange = mudou;
  const t = consulta && consulta.get('tipo');
  est = novoEstado(t && TIPOS[t] ? t : est.tipo); // cada vez que a pessoa entra na tela, o assistente começa do zero
  if (!est.campos) { try { await carregarCampos(); } catch (e) { montar(el, html`<div class="cartao vazio"><h3>Não foi possível carregar</h3><p>${e.message}</p></div>`); return; } }
  desenhar();
}
async function carregarCampos() { const r = await api.get('importar/campos/' + est.tipo); est.campos = r.campos; est.limite = r.limite; }

function desenhar() {
  const passo = { arquivo: passoArquivo, mapear: passoMapear, previa: passoPrevia, feito: passoFeito }[est.passo];
  montar(raiz, html`<div class="cabeca"><div><h1>Importar cadastros</h1><p>Traga de uma planilha o que você já tem, sem digitar tudo de novo.</p></div></div>
    <div class="abas" role="tablist">${Object.entries(TIPOS).map(([k, v]) => html`<button role="tab" aria-selected="${k === est.tipo}" data-tipo="${k}">${v.rotulo}</button>`)}</div>${passo()}`);
}
const erroForm = (msg) => { const x = $('#erro-imp', raiz); if (x) { x.textContent = msg; x.hidden = !msg; } };

/* ------------------------------------------------------------------ 1. escolher o arquivo */
function passoArquivo() {
  const T = TIPOS[est.tipo];
  if (somenteLeitura()) return html`<div class="cartao">${raw('<p class="suave" style="margin:0">Seu período de teste terminou: a plataforma está somente para leitura e não é possível importar.</p>')}</div>`;
  return html`<div class="cartao"><div class="cartao-t"><h3>Importar ${T.rotulo.toLowerCase()}</h3></div>
    <p class="suave" style="margin-top:0">${T.intro}</p>
    <ol class="suave" style="padding-left:20px;margin:0 0 14px"><li>Baixe o modelo, preencha e salve. Se já tem uma planilha sua, pode usá-la: as colunas são reconhecidas pelo nome.</li><li>Escolha o arquivo (Excel .xlsx ou CSV).</li><li>Confira o que será importado e confirme.</li></ol>
    <div class="pac-acoes" style="margin:0 0 8px"><button class="btn btn-sec" data-modelo>Baixar modelo de planilha</button>
      <label class="btn btn-pri" style="cursor:pointer">Escolher arquivo<input type="file" id="arq-imp" accept=".csv,.xlsx,.txt,text/csv" hidden></label></div>
    <p class="erro-form" id="erro-imp" role="alert" ${est.erro ? '' : raw('hidden')}>${est.erro}</p>
    <p class="suave peq" style="margin:10px 0">O arquivo é lido no seu navegador. Nada é gravado antes da conferência. Até ${est.limite.toLocaleString('pt-BR')} linhas por vez.</p>
    <details><summary class="suave peq" style="cursor:pointer">Quais colunas o sistema reconhece?</summary>
      <ul class="suave peq" style="margin:8px 0 0">${est.campos.map((c) => html`<li><strong>${c.rotulo}</strong>${c.obrigatorio ? ' (obrigatório)' : ''}${c.dica ? ` — ${c.dica}` : ''}</li>`)}</ul></details></div>`;
}

async function escolherArquivo(file) {
  if (!file) return;
  est.erro = ''; erroForm('');
  try { est.leitura = await lerArquivo(file); } catch (e) { est.erro = e.message || 'Não foi possível ler o arquivo.'; erroForm(est.erro); return; }
  est.aba = 0; est.padroes = {}; est.duplicados = 'ignorar'; preparar(); est.passo = 'mapear'; desenhar();
}
function preparar() {
  const linhas = est.leitura.abas[est.aba].linhas;
  est.cab = detectarCabecalho(linhas, est.campos); est.mapa = ligarColunas(linhas[est.cab] || [], est.campos);
}

/* ------------------------------------------------------------------ 2. ligar as colunas */
const preenchida = (v) => v !== null && v !== undefined && String(v).trim() !== '';
function faltando() { return est.campos.filter((c) => c.obrigatorio && (est.mapa[c.chave] === null || est.mapa[c.chave] === undefined) && !est.padroes[c.chave]); }
function exemploDe(col) {
  if (col === null || col === undefined) return '';
  const linhas = est.leitura.abas[est.aba].linhas; for (let i = est.cab + 1; i < linhas.length; i++) { const v = linhas[i][col]; if (preenchida(v)) return String(v).slice(0, 40); }
  return '';
}
function passoMapear() {
  const aba = est.leitura.abas[est.aba]; const linhas = aba.linhas; const cab = linhas[est.cab] || []; const dados = linhas.slice(est.cab + 1);
  const nCols = Math.max(cab.length, ...linhas.slice(est.cab, est.cab + 8).map((l) => l.length)); const cols = Array.from({ length: nCols }, (_, i) => i);
  const nome = (i) => (preenchida(cab[i]) ? String(cab[i]).slice(0, 40) : '(sem título)');
  const maxCab = Math.min(10, linhas.length - 1);
  return html`<div class="cartao"><div class="cartao-t"><h3>Ligue as colunas</h3></div>
    <p class="suave" style="margin-top:0"><strong>${est.leitura.arquivo}</strong> · ${dados.length.toLocaleString('pt-BR')} linha${dados.length === 1 ? '' : 's'} com dados. As colunas foram reconhecidas pelo nome: confira e ajuste se precisar.</p>
    <div class="grade-2" style="margin-bottom:6px">
      ${est.leitura.abas.length > 1 ? html`<div class="campo"><label for="imp-aba">Aba da planilha</label><select id="imp-aba" data-aba>${est.leitura.abas.map((a, i) => html`<option value="${i}" ${i === est.aba ? raw('selected') : ''}>${a.nome} (${a.linhas.length} linhas)</option>`)}</select></div>` : ''}
      <div class="campo"><label for="imp-cab">Linha do cabeçalho</label><select id="imp-cab" data-cab>${Array.from({ length: maxCab }, (_, i) => html`<option value="${i}" ${i === est.cab ? raw('selected') : ''}>Linha ${i + 1}</option>`)}</select></div></div>
    <div class="rolagem"><table class="tabela"><thead><tr><th>Campo do sistema</th><th>Coluna da planilha</th><th>Exemplo</th></tr></thead><tbody>
      ${est.campos.map((c) => html`<tr><td><strong>${c.rotulo}</strong>${c.obrigatorio ? html` <span class="obrig" aria-hidden="true">*</span>` : ''}</td>
        <td><select data-campo="${c.chave}" aria-label="Coluna para ${c.rotulo}"><option value="">— não importar —</option>${cols.map((i) => html`<option value="${i}" ${est.mapa[c.chave] === i ? raw('selected') : ''}>${letraColuna(i)} · ${nome(i)}</option>`)}</select></td>
        <td class="suave peq" data-exemplo="${c.chave}">${exemploDe(est.mapa[c.chave])}</td></tr>`)}
    </tbody></table></div>
    ${est.tipo === 'categorias' ? html`<div class="campo" style="margin-top:12px"><label for="imp-tipo">Tipo padrão (usado quando a linha não informa o tipo)</label><select id="imp-tipo" data-padrao="tipo"><option value="">Nenhum: a linha precisa informar</option><option value="despesa" ${est.padroes.tipo === 'despesa' ? raw('selected') : ''}>Despesa</option><option value="receita" ${est.padroes.tipo === 'receita' ? raw('selected') : ''}>Receita</option></select></div>` : ''}
    <fieldset class="campo" style="border:0;padding:0;margin:14px 0 4px"><legend style="font-weight:600;font-size:.9rem;margin-bottom:6px">Quem já está cadastrado</legend>
      <label class="marca"><input type="radio" name="dup" value="ignorar" ${est.duplicados === 'ignorar' ? raw('checked') : ''}><span><strong>Ignorar</strong> (recomendado): não mexe no que já existe.</span></label>
      <label class="marca"><input type="radio" name="dup" value="atualizar" ${est.duplicados === 'atualizar' ? raw('checked') : ''}><span><strong>Atualizar</strong> o cadastro existente com os dados da planilha (só os campos preenchidos; nada é apagado).</span></label></fieldset>
    <details style="margin:10px 0"><summary class="suave peq" style="cursor:pointer">Ver as primeiras linhas do arquivo</summary><div class="rolagem"><table class="tabela" style="margin-top:6px"><tbody>${linhas.slice(0, est.cab + 5).map((l, i) => html`<tr style="${i === est.cab ? 'font-weight:600;background:var(--creme)' : ''}"><td class="suave peq">${i + 1}</td>${cols.map((c) => html`<td class="peq">${preenchida(l[c]) ? String(l[c]).slice(0, 30) : ''}</td>`)}</tr>`)}</tbody></table></div></details>
    <p class="erro-form" id="erro-imp" role="alert" ${est.erro ? '' : raw('hidden')}>${est.erro}</p>
    <p class="faixa-aten" id="aviso-falta" style="border-radius:10px;padding:8px 12px;margin:0 0 8px;font-size:.88rem" ${faltando().length ? '' : raw('hidden')}>${avisoFalta()}</p>
    <div class="pac-acoes"><button class="btn btn-sec" data-voltar-arquivo>Trocar o arquivo</button><button class="btn btn-pri" data-conferir ${faltando().length || est.ocupado ? raw('disabled') : ''}>${est.ocupado ? 'Conferindo…' : 'Conferir os dados'}</button></div></div>`;
}
const avisoFalta = () => { const f = faltando(); return f.length ? `Ligue ${f.length === 1 ? 'a coluna obrigatória' : 'as colunas obrigatórias'}: ${f.map((c) => c.rotulo).join(', ')}.` : ''; };
/** Atualiza só o que depende do mapa (exemplos, aviso e botão), sem redesenhar a tela (para não perder o foco do select). */
function atualizarMapa() {
  est.campos.forEach((c) => { const td = raiz.querySelector(`[data-exemplo="${c.chave}"]`); if (td) td.textContent = exemploDe(est.mapa[c.chave]); });
  const f = faltando(); const av = $('#aviso-falta', raiz); if (av) { av.textContent = avisoFalta(); av.hidden = !f.length; }
  const b = raiz.querySelector('[data-conferir]'); if (b) b.disabled = f.length > 0 || est.ocupado;
}

async function conferir() {
  const linhas = montarLinhas(est.leitura.abas[est.aba].linhas, est.cab, est.mapa, est.padroes);
  est.erro = '';
  if (!linhas.length) { est.erro = 'Não encontrei linhas com dados abaixo do cabeçalho.'; erroForm(est.erro); return; }
  if (linhas.length > est.limite) { est.erro = `A planilha tem ${linhas.length.toLocaleString('pt-BR')} linhas e o limite é ${est.limite.toLocaleString('pt-BR')} por importação. Divida o arquivo em partes.`; erroForm(est.erro); return; }
  est.ocupado = true; const b = raiz.querySelector('[data-conferir]'); if (b) { b.disabled = true; b.textContent = 'Conferindo…'; }
  try {
    est.previa = await api.post('importar/' + est.tipo, { linhas, aplicar: false, duplicados: est.duplicados }); est.enviadas = linhas;
    est.filtro = est.previa.resumo.erros ? 'problemas' : 'todas'; est.passo = 'previa';
  } catch (e) { est.erro = e.message; }
  est.ocupado = false; desenhar();
}

/* ------------------------------------------------------------------ 3. conferir o que vai acontecer */
const SITUACAO = { novo: ['Novo', 'ok'], atualizar: ['Atualizar', 'info'], ignorado: ['Ignorado', 'neutro'], erro: ['Problema', 'ruim'] };
function passoPrevia() {
  const T = TIPOS[est.tipo]; const r = est.previa.resumo; const itens = est.previa.itens;
  const filtros = [['todas', 'Todas', itens.length], ['novo', 'Novos', r.novos], ['atualizar', 'Atualizar', r.atualizados], ['ignorado', 'Ignorados', r.ignorados], ['problemas', 'Com problema', r.erros]].filter(([k, , n]) => k === 'todas' || n > 0);
  const visiveis = itens.filter((i) => est.filtro === 'todas' || (est.filtro === 'problemas' ? i.situacao === 'erro' : i.situacao === est.filtro));
  const mostrar = visiveis.slice(0, 300); const aplicaveis = r.novos + r.atualizados;
  return html`<div class="cartao"><div class="cartao-t"><h3>Confira antes de importar</h3></div>
    <div class="kpis"><div class="kpi ok"><span>Novos</span><strong>${r.novos}</strong></div><div class="kpi"><span>Atualizar</span><strong>${r.atualizados}</strong></div><div class="kpi"><span>Ignorados</span><strong>${r.ignorados}</strong><small class="suave">Já cadastrados, repetidos ou vazios</small></div><div class="kpi ${r.erros ? 'alerta' : ''}"><span>Com problema</span><strong>${r.erros}</strong>${r.erros ? html`<small class="suave">Não serão importados</small>` : ''}</div></div>
    <div class="chips" role="group" aria-label="Filtrar linhas" style="margin-bottom:12px">${filtros.map(([k, t, n]) => html`<button type="button" class="chip" aria-pressed="${k === est.filtro}" data-filtro="${k}">${t} (${n})</button>`)}</div>
    <div class="rolagem"><table class="tabela"><thead><tr><th>Linha</th><th>${T.rotulo.slice(0, -1) === 'Categoria' ? 'Categoria' : 'Nome'}</th><th>Situação</th><th>Observação</th></tr></thead><tbody>
      ${mostrar.map((i) => html`<tr><td class="suave">${i.linha}</td><td>${i.rotulo || html`<span class="suave">—</span>`}</td><td>${selo(SITUACAO[i.situacao][0], SITUACAO[i.situacao][1])}</td><td class="peq">${i.mensagem || ''}${i.avisos.map((a) => html`<br><span style="color:var(--atencao)">${a}</span>`)}</td></tr>`)}
    </tbody></table></div>
    ${visiveis.length > mostrar.length ? html`<p class="suave peq" style="margin:8px 0 0">Mostrando ${mostrar.length} de ${visiveis.length} linhas deste filtro.</p>` : ''}
    ${r.erros ? html`<p class="suave peq" style="margin:10px 0 0">As linhas com problema não serão importadas. Corrija a planilha e importe de novo: o que já entrou será ignorado.</p>` : ''}
    <p class="erro-form" id="erro-imp" role="alert" ${est.erro ? '' : raw('hidden')}>${est.erro}</p>
    <div class="pac-acoes" style="margin-top:14px"><button class="btn btn-sec" data-voltar-mapear>Voltar e ajustar</button>
      <button class="btn btn-pri" data-importar ${aplicaveis && !est.ocupado ? '' : raw('disabled')}>${est.ocupado ? 'Importando…' : aplicaveis ? `Importar ${aplicaveis} ${aplicaveis === 1 ? T.singular : T.plural}` : 'Nada para importar'}</button></div></div>`;
}
async function importar() {
  est.erro = ''; est.ocupado = true; const b = raiz.querySelector('[data-importar]'); if (b) { b.disabled = true; b.textContent = 'Importando…'; }
  try {
    est.final = await api.post('importar/' + est.tipo, { linhas: est.enviadas, aplicar: true, duplicados: est.duplicados });
    try { await carregarBase(['categorias', 'fornecedores']); } catch { /* as listas recarregam ao abrir as telas */ }
    est.passo = 'feito';
  } catch (e) { est.erro = e.message; }
  est.ocupado = false; desenhar();
}

/* ------------------------------------------------------------------ 4. pronto */
function passoFeito() {
  const T = TIPOS[est.tipo]; const r = est.final.resumo;
  return html`<div class="cartao"><div class="vazio"><h3>Importação concluída</h3>
    <p><strong>${r.novos}</strong> ${r.novos === 1 ? T.singular : T.plural} ${r.novos === 1 ? 'novo' : 'novos'}${r.atualizados ? html`, <strong>${r.atualizados}</strong> ${r.atualizados === 1 ? 'atualizado' : 'atualizados'}` : ''}.
      ${r.ignorados ? html` ${r.ignorados} ignorado${r.ignorados === 1 ? '' : 's'}.` : ''}${r.erros ? html` ${r.erros} com problema (não importado${r.erros === 1 ? '' : 's'}).` : ''}</p>
    <div class="pac-acoes" style="justify-content:center"><a class="btn btn-pri" href="${T.destino}">${T.verDestino}</a><button class="btn btn-sec" data-outro>Importar outro arquivo</button></div></div></div>`;
}

/* ------------------------------------------------------------------ eventos */
async function clique(e) {
  const t = e.target;
  const aba = t.closest('[data-tipo]');
  if (aba) { const k = aba.dataset.tipo; if (k !== est.tipo) { est = novoEstado(k); history.replaceState(null, '', '#/importar?tipo=' + k); try { await carregarCampos(); } catch (er) { est.erro = er.message; } desenhar(); } return; }
  if (t.closest('[data-modelo]')) return baixarModelo(TIPOS[est.tipo].modelo, est.campos);
  if (t.closest('[data-voltar-arquivo]')) { est.passo = 'arquivo'; est.leitura = null; est.erro = ''; return desenhar(); }
  if (t.closest('[data-conferir]')) return conferir();
  if (t.closest('[data-voltar-mapear]')) { est.passo = 'mapear'; est.erro = ''; return desenhar(); }
  if (t.closest('[data-importar]')) return importar();
  if (t.closest('[data-outro]')) { const k = est.tipo; est = novoEstado(k); try { await carregarCampos(); } catch { /* segue */ } return desenhar(); }
  const f = t.closest('[data-filtro]'); if (f) { est.filtro = f.dataset.filtro; return desenhar(); }
}
function mudou(e) {
  const t = e.target;
  if (t.id === 'arq-imp') { const file = t.files && t.files[0]; t.value = ''; return escolherArquivo(file); }
  if (t.matches('select[data-campo]')) { est.mapa[t.dataset.campo] = t.value === '' ? null : Number(t.value); return atualizarMapa(); }
  if (t.matches('select[data-padrao]')) { est.padroes[t.dataset.padrao] = t.value; return atualizarMapa(); }
  if (t.matches('select[data-aba]')) { est.aba = Number(t.value); preparar(); return desenhar(); }
  if (t.matches('select[data-cab]')) { est.cab = Number(t.value); est.mapa = ligarColunas(est.leitura.abas[est.aba].linhas[est.cab] || [], est.campos); return desenhar(); }
  if (t.matches('input[name="dup"]')) { est.duplicados = t.value; }
}
