/* Extrato bancário: importa o arquivo do banco (OFX, CSV ou Excel), lido aqui no navegador, e concilia cada linha com um pagamento
   que você já tinha lançado, cria o lançamento que faltava, marca como transferência entre suas contas ou ignora. */
import { api } from '../api.js';
import { App, carregarBase, categoriasDe, somenteLeitura } from '../estado.js';
import { html, raw, montar, $, abrirModal, confirmar, aviso, campo, dadosForm, brl, selo, vazio, dataBR } from '../ui.js';

const est = { conta: null, situacao: 'pendente' };
let raiz = null; let dados = null; let contas = [];

export async function abrir(el) {
  raiz = el; el.onclick = clique; el.onchange = mudou;
  await carregarBase(['contas', 'categorias']); contas = App.cache.contas.filter((c) => c.ativo);
  if (!contas.length) { montar(el, html`<div class="cartao">${vazio('Nenhuma conta cadastrada', 'Cadastre uma conta em "Contas e cartões" para importar o extrato dela.', html`<a class="btn btn-pri" href="#/contas">Abrir contas</a>`)}</div>`); return; }
  if (!est.conta || !contas.some((c) => c.id === est.conta)) est.conta = (contas.find((c) => c.tipo === 'banco') || contas[0]).id;
  await carregar();
}

async function carregar() {
  try { dados = await api.get(`extrato-itens?contaFin=${est.conta}&situacao=${est.situacao}`); } catch (e) { montar(raiz, html`<div class="cartao vazio"><h3>Não foi possível carregar</h3><p>${e.message}</p></div>`); return; }
  desenhar();
}

/* ---------------------------------------------------------------- leitura do arquivo (no navegador) */
function carregarLeitor() {
  if (window.CMDiag && window.CMDiag.importar) return Promise.resolve(window.CMDiag.importar);
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = '/assets/js/diagnostico-importar.js?v=1'; s.onload = () => (window.CMDiag && window.CMDiag.importar ? res(window.CMDiag.importar) : rej(new Error('Leitor indisponível.'))); s.onerror = () => rej(new Error('Não foi possível carregar o leitor de extratos.')); document.head.appendChild(s); });
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
    <p class="suave peq">O arquivo foi lido no seu navegador. Só estas linhas (data, valor e descrição) são guardadas na sua conta, e as que já foram importadas antes são ignoradas.</p></div>`, acoes: [{ id: 'cancelar', rotulo: 'Cancelar' }, { id: 'ok', rotulo: 'Importar', classe: 'btn-pri' }] });
  const form = $('form', m.el);
  m.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-acao]'); if (!b) return; if (b.dataset.acao === 'cancelar') return m.fechar();
    b.disabled = true; const conta = Number(dadosForm(form).contaFinId);
    try {
      let novos = 0; let dup = 0; const ordenadas = [...trans].sort((a, c) => a.data.localeCompare(c.data)); let lote = [];
      const enviar = async () => { if (!lote.length) return; const r = await api.post('extratos', { contaFinId: conta, arquivo: nome, itens: lote }); novos += r.novos; dup += r.duplicados; lote = []; };
      for (let i = 0; i < ordenadas.length; i++) { lote.push(ordenadas[i]); const ultimo = i === ordenadas.length - 1; if (lote.length >= 4500 && (ultimo || ordenadas[i + 1].data !== ordenadas[i].data)) await enviar(); }
      await enviar(); m.fechar(); est.conta = conta; est.situacao = 'pendente';
      aviso(novos ? `${novos} lançamento${novos === 1 ? '' : 's'} importado${novos === 1 ? '' : 's'}${dup ? ` (${dup} já existia${dup === 1 ? '' : 'm'})` : ''}.` : 'Nada novo: todas as linhas já tinham sido importadas.'); carregar();
    } catch (er) { const x = $('.erro-form', form); x.textContent = er.message; x.hidden = false; b.disabled = false; }
  });
}

/* ---------------------------------------------------------------- tela */
function desenhar() {
  const pode = !somenteLeitura(); const c = dados.contagem || {}; const itens = dados.itens; const conta = contas.find((x) => x.id === est.conta);
  const pend = est.situacao === 'pendente' ? itens : []; const entradas = pend.filter((i) => i.valor > 0).reduce((a, i) => a + i.valor, 0); const saidas = pend.filter((i) => i.valor < 0).reduce((a, i) => a - i.valor, 0);
  const faceis = pend.filter((i) => i.sugestoes[0] && i.sugestoes[0].restante === Math.abs(i.valor) && i.sugestoes[0].score >= 70);
  montar(raiz, html`<div class="cabeca"><div><h1>Extrato bancário</h1><p>Traga o extrato do banco e confirme o que já foi pago ou recebido.</p></div>${pode ? html`<button class="btn btn-pri" data-importar>Importar extrato</button><input type="file" id="ex-arquivo" accept=".ofx,.csv,.xlsx,.txt" hidden>` : ''}</div>
    <div class="filtros"><div class="campo"><label class="sr" for="ex-conta">Conta</label><select id="ex-conta">${contas.map((x) => html`<option value="${x.id}" ${x.id === est.conta ? raw('selected') : ''}>${x.nome}${x.tipo === 'cartao' ? ' (cartão)' : ''}</option>`)}</select></div>
      <div class="chips" role="group" aria-label="Situação das linhas">${[['pendente', 'Pendentes'], ['conciliado', 'Conciliadas'], ['ignorado', 'Ignoradas']].map(([k, t]) => html`<button type="button" class="chip" data-sit="${k}" aria-pressed="${est.situacao === k}">${t}${c[k] ? ` · ${c[k]}` : ''}</button>`)}</div></div>
    ${est.situacao === 'pendente' && itens.length ? html`<div class="kpis" style="grid-template-columns:repeat(3,1fr)"><div class="kpi"><span>Linhas para tratar</span><strong>${itens.length}</strong></div><div class="kpi ok"><span>Entradas pendentes</span><strong>${brl(entradas)}</strong></div><div class="kpi"><span>Saídas pendentes</span><strong>${brl(saidas)}</strong></div></div>` : ''}
    ${pode && faceis.length ? html`<div class="cartao" style="border-color:var(--ok)"><div class="cartao-t"><div><h3 style="margin:0">${faceis.length} linha${faceis.length === 1 ? '' : 's'} com par certo</h3><span class="suave peq">O valor é igual ao de uma cobrança ou conta em aberto e o nome ou a data batem.</span></div><button class="btn btn-pri btn-peq" data-todos>Conciliar ${faceis.length === 1 ? 'esta' : 'todas'}</button></div></div>` : ''}
    ${itens.length ? html`<div class="cartao" style="padding:6px 14px"><ul class="lista">${itens.map((i) => linha(i, pode))}</ul></div>` : html`<div class="cartao">${vazio(est.situacao === 'pendente' ? (c.conciliado || c.ignorado ? 'Tudo tratado' : 'Nenhuma linha importada') : 'Nada aqui', est.situacao === 'pendente' ? (c.conciliado || c.ignorado ? 'Todas as linhas deste extrato já foram conciliadas ou ignoradas.' : `Importe o extrato de ${conta ? conta.nome : 'uma conta'} (OFX, CSV ou Excel) para começar.`) : '')}</div>`}
    <p class="suave peq" style="margin:12px 4px">Conciliar registra o pagamento na data do extrato e na conta escolhida, sem contar o mesmo dinheiro duas vezes. Dá para desfazer a qualquer momento.</p>`);
}

function linha(i, pode) {
  const entrada = i.valor > 0; const [dd, mm, aa] = dataBR(i.data).split('/');
  return html`<li class="linha ex" data-item="${i.id}"><div class="rc-data"><b>${dd}/${mm}</b><small>${aa}</small></div>
    <div class="corpo"><span class="tit" title="${i.descricao}">${i.descricao}</span>${i.situacao === 'conciliado' ? html`<span class="sub">${i.transferenciaId ? 'Transferência entre contas' : 'Conciliada com um lançamento'}</span>` : ''}</div>
    <strong class="num ${entrada ? 'bom' : 'ruim'}">${entrada ? '+' : '−'} ${brl(Math.abs(i.valor))}</strong>
    ${i.situacao === 'pendente' && pode ? html`<span class="acoes-rapidas">${i.sugestoes.map((s) => html`<button class="btn ${s.restante === Math.abs(i.valor) ? 'btn-pri' : 'btn-sec'} btn-peq" data-conciliar="${i.id}" data-lanc="${s.lancamentoId}" title="${s.descricao}">Conciliar com ${s.quem || s.descricao} · ${brl(s.restante)}</button>`)}
      <button class="btn btn-sec btn-peq" data-lancar="${i.id}">Lançar</button><button class="btn btn-ghost btn-peq" data-transf="${i.id}">Transferência</button><button class="btn btn-ghost btn-peq" data-ignorar="${i.id}">Ignorar</button></span>`
      : i.situacao !== 'pendente' ? html`${selo(i.situacao === 'conciliado' ? 'Conciliada' : 'Ignorada', i.situacao === 'conciliado' ? 'ok' : 'neutro')}${pode ? html`<button class="btn btn-ghost btn-peq" data-desfazer="${i.id}">Desfazer</button>` : ''}` : ''}</li>`;
}

/* ---------------------------------------------------------------- ações */
const achar = (id) => dados.itens.find((x) => x.id === Number(id));
async function agir(rota, corpo, msg) { try { await api.post(rota, corpo || {}); if (msg) aviso(msg); await carregar(); return true; } catch (er) { aviso(er.message, 'erro', 6000); return false; } }

function formLancar(i) {
  const entrada = i.valor > 0; const cats = categoriasDe(entrada ? 'receita' : 'despesa');
  const m = abrirModal({ titulo: entrada ? 'Lançar como receita' : 'Lançar como despesa', corpo: html`<div><p class="erro-form" role="alert" hidden></p><p class="suave peq" style="margin-top:0">${dataBR(i.data)} · <strong>${entrada ? '+' : '−'} ${brl(Math.abs(i.valor))}</strong> · ${i.descricao}</p>
    ${campo({ id: 'descricao', rotulo: 'Descrição', valor: i.descricao.slice(0, 150), obrig: true })}${campo({ id: 'categoriaId', rotulo: 'Categoria', valor: '', opcoes: [['', 'Sem categoria'], ...cats.map((c) => [c.id, c.nome])] })}
    ${entrada ? '' : campo({ id: 'contraparte', rotulo: 'Fornecedor (opcional)' })}</div>`, acoes: [{ id: 'cancelar', rotulo: 'Cancelar' }, { id: 'ok', rotulo: 'Lançar', classe: 'btn-pri' }] });
  const form = $('form', m.el);
  m.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-acao]'); if (!b) return; if (b.dataset.acao === 'cancelar') return m.fechar(); const d = dadosForm(form); b.disabled = true;
    try { await api.post(`extrato-itens/${i.id}/lancar`, { descricao: d.descricao, categoriaId: d.categoriaId ? Number(d.categoriaId) : null, contraparte: d.contraparte }); m.fechar(); aviso('Lançamento criado e conciliado.'); carregar(); } catch (er) { const x = $('.erro-form', form); x.textContent = er.message; x.hidden = false; b.disabled = false; }
  });
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
    try { await api.post(`extrato-itens/${i.id}/transferencia`, { contaId: Number(dadosForm(form).contaId) }); m.fechar(); aviso('Transferência registrada.'); carregar(); } catch (er) { const x = $('.erro-form', form); x.textContent = er.message; x.hidden = false; b.disabled = false; }
  });
}

function mudou(e) {
  if (e.target.id === 'ex-conta') { est.conta = Number(e.target.value); est.situacao = 'pendente'; carregar(); }
  if (e.target.id === 'ex-arquivo' && e.target.files[0]) { const f = e.target.files[0]; e.target.value = ''; lerArquivo(f); }
}
async function clique(e) {
  const t = e.target;
  if (t.closest('[data-importar]')) return $('#ex-arquivo', raiz).click();
  const sit = t.closest('[data-sit]'); if (sit) { est.situacao = sit.dataset.sit; return carregar(); }
  const conc = t.closest('[data-conciliar]'); if (conc) return agir(`extrato-itens/${conc.dataset.conciliar}/conciliar`, { lancamentoId: Number(conc.dataset.lanc) }, 'Conciliado.');
  const lan = t.closest('[data-lancar]'); if (lan) return formLancar(achar(lan.dataset.lancar));
  const tr = t.closest('[data-transf]'); if (tr) return formTransferencia(achar(tr.dataset.transf));
  const ig = t.closest('[data-ignorar]'); if (ig) return agir(`extrato-itens/${ig.dataset.ignorar}/ignorar`, {}, 'Linha ignorada.');
  const des = t.closest('[data-desfazer]'); if (des) return agir(`extrato-itens/${des.dataset.desfazer}/desfazer`, {}, 'Desfeito: a linha voltou a ficar pendente.');
  if (t.closest('[data-todos]')) {
    const faceis = dados.itens.filter((i) => i.situacao === 'pendente' && i.sugestoes[0] && i.sugestoes[0].restante === Math.abs(i.valor) && i.sugestoes[0].score >= 70);
    if (!(await confirmar(`Conciliar ${faceis.length} linha${faceis.length === 1 ? '' : 's'} com o lançamento sugerido (mesmo valor e nome/data compatíveis)?`, { titulo: 'Conciliar sugestões', ok: 'Conciliar' }))) return;
    let feitas = 0; for (const i of faceis) { try { await api.post(`extrato-itens/${i.id}/conciliar`, { lancamentoId: i.sugestoes[0].lancamentoId }); feitas++; } catch { /* segue com as próximas */ } }
    aviso(`${feitas} de ${faceis.length} conciliadas.`); carregar();
  }
}
