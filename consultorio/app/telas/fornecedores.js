/* Fornecedores: quem o consultório paga. O que foi lançado em "A pagar" com o nome do fornecedor aparece aqui, com quanto já foi pago e quanto falta. */
import { api, qs } from '../api.js';
import { App, somenteLeitura, carregarBase, categoriasDe } from '../estado.js';
import { html, raw, montar, $, abrirModal, confirmar, aviso, campo, dadosForm, brl, selo, vazio, dataBR, fmtCPF, fmtTel } from '../ui.js';
import { abrirLancamento } from '../financeiro.js';

const est = { busca: '', arquivados: false };
let raiz = null; let lista = [];

export async function abrir(el) {
  raiz = el; el.onclick = clique; el.oninput = digitou; el.onkeydown = (e) => { const li = e.key === 'Enter' && e.target.closest && e.target.closest('li[data-id]'); if (li) ficha(Number(li.dataset.id)); };
  await carregarBase(['categorias']); await carregar(true);
}
async function carregar(primeira = false) {
  try { lista = (await api.get('fornecedores' + qs({ ativos: est.arquivados ? '0' : '1', busca: est.busca }))).itens; }
  catch (e) { montar(raiz, html`<div class="cartao vazio"><h3>Não foi possível carregar</h3><p>${e.message}</p></div>`); return; }
  if (primeira) desenhar(); else desenharLista();
}
const nomeCategoria = (id) => (App.cache.categorias.find((c) => c.id === id) || {}).nome || '';

function desenhar() {
  const pode = !somenteLeitura();
  montar(raiz, html`<div class="cabeca"><div><h1>Fornecedores</h1><p>Quem o consultório paga. As despesas lançadas com o nome do fornecedor aparecem aqui.</p></div>
      <div class="pac-acoes" style="margin:0">${pode ? html`<a class="btn btn-sec" href="#/importar?tipo=fornecedores">Importar planilha</a><button class="btn btn-pri" data-novo>Novo fornecedor</button>` : ''}</div></div>
    <div class="filtros"><div class="campo busca"><label class="sr" for="fn-busca">Buscar</label><input id="fn-busca" type="search" placeholder="Buscar por nome, CPF/CNPJ ou e-mail" autocomplete="off" value="${est.busca}"></div>
      <button type="button" class="chip" aria-pressed="${est.arquivados}" data-arquivados>Mostrar arquivados</button></div>
    <div id="fn-lista"></div>`);
  desenharLista();
}
function desenharLista() {
  const pode = !somenteLeitura(); const alvo = $('#fn-lista', raiz); if (!alvo) return;
  if (!lista.length) { montar(alvo, html`<div class="cartao">${est.busca || est.arquivados ? vazio('Nenhum fornecedor encontrado', 'Tente outra busca.') : vazio('Nenhum fornecedor ainda', 'Cadastre quem você paga ou importe de uma planilha. Ao lançar uma despesa, é só escolher o nome.', pode ? html`<div class="pac-acoes" style="justify-content:center"><button class="btn btn-pri" data-novo>Cadastrar fornecedor</button><a class="btn btn-sec" href="#/importar?tipo=fornecedores">Importar planilha</a></div>` : '')}</div>`); return; }
  const aberto = lista.reduce((a, f) => a + f.emAberto, 0);
  montar(alvo, html`<div class="cartao" style="padding:6px 14px"><ul class="lista">${lista.map((f) => html`<li class="linha ${f.ativo ? '' : 'inativa'}" data-id="${f.id}" tabindex="0" role="button">
      <div class="corpo"><span class="tit">${f.nome}${f.ativo ? '' : selo('Arquivado', 'neutro')}</span><span class="sub">${[f.documento ? fmtCPF(f.documento) : '', f.telefone ? fmtTel(f.telefone) : '', f.categoriaId ? nomeCategoria(f.categoriaId) : ''].filter(Boolean).join(' · ') || 'Sem dados de contato'}</span></div>
      <span class="dir">${f.emAberto > 0 ? html`<strong class="num">${brl(f.emAberto)}</strong><small class="suave">em aberto</small>` : f.lancamentos ? html`<span class="suave peq">${f.lancamentos} despesa${f.lancamentos === 1 ? '' : 's'}</span>` : ''}</span></li>`)}</ul></div>
    <p class="suave peq" style="margin:10px 4px">${lista.length} fornecedor${lista.length === 1 ? '' : 'es'}${aberto > 0 ? ` · ${brl(aberto)} em aberto` : ''}</p>`);
}

/* ------------------------------------------------------------------ ficha */
async function ficha(id) {
  let f; try { f = (await api.get('fornecedores/' + id)).item; } catch (e) { aviso(e.message, 'erro'); return; }
  const pode = !somenteLeitura(); const cat = f.categoriaId ? nomeCategoria(f.categoriaId) : '';
  const m = abrirModal({ titulo: f.nome, largo: true, corpo: html`<div>
    <dl class="detalhes">${f.documento ? html`<dt>CPF/CNPJ</dt><dd>${fmtCPF(f.documento)}</dd>` : ''}${f.telefone ? html`<dt>Telefone</dt><dd>${fmtTel(f.telefone)}</dd>` : ''}${f.email ? html`<dt>E-mail</dt><dd>${f.email}</dd>` : ''}${cat ? html`<dt>Categoria padrão</dt><dd>${cat}</dd>` : ''}${f.obs ? html`<dt>Observações</dt><dd>${f.obs}</dd>` : ''}</dl>
    <div class="kpis" style="margin:12px 0"><div class="kpi"><span>Despesas</span><strong>${f.lancamentos}</strong></div><div class="kpi"><span>Total lançado</span><strong>${brl(f.total)}</strong></div><div class="kpi ok"><span>Já pago</span><strong>${brl(f.pago)}</strong></div><div class="kpi ${f.emAberto ? 'alerta' : ''}"><span>Em aberto</span><strong>${brl(f.emAberto)}</strong></div></div>
    <h4 style="margin:10px 0 6px">Últimas despesas</h4>
    ${f.recentes.length ? html`<ul class="lista">${f.recentes.map((l) => html`<li class="linha"><div class="corpo"><span class="tit">${l.descricao}</span><span class="sub">Vence em ${dataBR(l.vencimento)}</span></div><span class="dir"><strong class="num">${brl(l.valor)}</strong> ${l.situacao === 'quitado' ? selo('Pago', 'ok') : l.pago > 0 ? selo('Parcial', 'aten') : selo('Em aberto', 'info')}</span></li>`)}</ul>` : html`<p class="suave peq">Nenhuma despesa lançada com este nome ainda.</p>`}</div>`,
    acoes: pode ? [{ id: 'apagar', rotulo: 'Apagar', classe: 'btn-ghost' }, { id: f.ativo ? 'arquivar' : 'reativar', rotulo: f.ativo ? 'Arquivar' : 'Reativar' }, { id: 'despesa', rotulo: 'Nova despesa' }, { id: 'editar', rotulo: 'Editar', classe: 'btn-pri' }] : [{ id: 'fechar', rotulo: 'Fechar' }] });
  m.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-acao]'); if (!b) return; const ac = b.dataset.acao;
    if (ac === 'fechar') return m.fechar();
    if (ac === 'editar') { m.fechar(); return formulario(f); }
    if (ac === 'despesa') { m.fechar(); return abrirLancamento({ tipo: 'pagar', contraparte: f.nome, categoriaId: f.categoriaId || '' }, () => carregar(true)); }
    if (ac === 'arquivar' || ac === 'reativar') { try { await api.put('fornecedores/' + f.id, corpoDe(f, { ativo: ac === 'reativar' })); m.fechar(); aviso(ac === 'arquivar' ? 'Fornecedor arquivado.' : 'Fornecedor reativado.'); await carregarBase(['fornecedores']); carregar(true); } catch (er) { aviso(er.message, 'erro'); } return; }
    if (ac === 'apagar') {
      if (!(await confirmar(`Apagar o fornecedor ${f.nome}? Só é possível se ele nunca teve despesas.`, { titulo: 'Apagar fornecedor', ok: 'Apagar', perigo: true }))) return;
      try { await api.del('fornecedores/' + f.id); m.fechar(); aviso('Fornecedor apagado.'); await carregarBase(['fornecedores']); carregar(true); } catch (er) { aviso(er.message, 'erro'); }
    }
  });
}
const corpoDe = (f, mudar = {}) => ({ nome: f.nome, documento: f.documento, email: f.email, telefone: f.telefone, categoriaId: f.categoriaId, obs: f.obs, ativo: f.ativo, ...mudar });

/* ------------------------------------------------------------------ cadastro / edição */
function formulario(f = null) {
  const cats = categoriasDe('despesa');
  const m = abrirModal({ titulo: f ? 'Editar fornecedor' : 'Novo fornecedor', largo: true, corpo: html`<div><p class="erro-form" role="alert" hidden></p>
    ${campo({ id: 'nome', rotulo: 'Nome do fornecedor', valor: f ? f.nome : '', obrig: true, extra: 'maxlength="120"', ajuda: 'É o nome que aparece nas despesas.' })}
    <div class="grade-2">${campo({ id: 'documento', rotulo: 'CPF / CNPJ', valor: f && f.documento ? fmtCPF(f.documento) : '' })}${campo({ id: 'telefone', rotulo: 'Telefone', valor: f && f.telefone ? fmtTel(f.telefone) : '', extra: 'inputmode="tel"' })}</div>
    <div class="grade-2">${campo({ id: 'email', rotulo: 'E-mail', tipo: 'email', valor: f ? f.email || '' : '' })}${campo({ id: 'categoriaId', rotulo: 'Categoria padrão da despesa', valor: f ? f.categoriaId || '' : '', opcoes: [['', 'Sem categoria'], ...cats.map((c) => [c.id, c.nome])], ajuda: 'Já vem preenchida ao lançar uma despesa dele.' })}</div>
    ${campo({ id: 'obs', rotulo: 'Observações', tipo: 'textarea', valor: f ? f.obs || '' : '', extra: 'maxlength="300"' })}</div>`,
    acoes: [{ id: 'cancelar', rotulo: 'Cancelar' }, { id: 'ok', rotulo: 'Salvar', classe: 'btn-pri' }] });
  const form = $('form', m.el);
  m.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-acao]'); if (!b) return; if (b.dataset.acao === 'cancelar') return m.fechar();
    const d = dadosForm(form); const falha = (msg) => { const x = $('.erro-form', form); x.textContent = msg; x.hidden = false; b.disabled = false; }; b.disabled = true; $('.erro-form', form).hidden = true;
    if (!d.nome) return falha('Informe o nome do fornecedor.');
    const corpo = { nome: d.nome, documento: d.documento || null, email: d.email || null, telefone: d.telefone || null, categoriaId: d.categoriaId ? Number(d.categoriaId) : null, obs: d.obs || null, ativo: f ? f.ativo : true };
    try { if (f) await api.put('fornecedores/' + f.id, corpo); else await api.post('fornecedores', corpo); m.fechar(); aviso('Fornecedor salvo.'); await carregarBase(['fornecedores']); carregar(true); } catch (er) { falha(er.message); }
  });
}

/* ------------------------------------------------------------------ eventos */
let temporizador = null;
function digitou(e) { if (e.target.id !== 'fn-busca') return; est.busca = e.target.value.trim(); clearTimeout(temporizador); temporizador = setTimeout(() => carregar(false), 250); }
function clique(e) {
  const t = e.target;
  if (t.closest('[data-novo]')) return formulario();
  if (t.closest('[data-arquivados]')) { est.arquivados = !est.arquivados; return carregar(true); }
  const li = t.closest('li[data-id]'); if (li) return ficha(Number(li.dataset.id));
}
