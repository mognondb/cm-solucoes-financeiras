/* Contas e cartões: bancos, carteira, plataformas de pagamento e cartão de crédito, com saldo, fatura, extrato e transferências. */
import { api } from '../api.js';
import { App, carregarBase, somenteLeitura } from '../estado.js';
import { html, raw, montar, $, abrirModal, confirmar, aviso, campo, campoDinheiro, dadosForm, lerReais, brl, selo, vazio, dataBR } from '../ui.js';

const TIPOS = { banco: 'Conta bancária', carteira: 'Dinheiro / carteira', cartao: 'Cartão de crédito', plataforma: 'Plataforma de pagamento' };
let raiz = null; let dados = null;

export async function abrir(el) {
  raiz = el; el.onclick = clique; await carregar();
}
async function carregar() {
  try { dados = await api.get('contas-fin'); App.cache.contas = dados.itens; } catch (e) { montar(raiz, html`<div class="cartao vazio"><h3>Não foi possível carregar</h3><p>${e.message}</p></div>`); return; }
  desenhar();
}

function cartaoConta(c) {
  const pode = !somenteLeitura(); const cartao = c.tipo === 'cartao'; const f = c.fatura; const divida = Math.max(0, -c.saldo);
  return html`<div class="cartao conta ${c.ativo ? '' : 'inativa'}"><div class="cartao-t"><div><h3 style="margin:0">${c.nome}</h3><span class="suave peq">${TIPOS[c.tipo]}${c.banco ? ` · ${c.banco}` : ''}</span></div>${c.ativo ? '' : selo('Inativa')}</div>
    ${cartao ? html`<div class="kpis" style="grid-template-columns:repeat(2,1fr);margin:6px 0 10px"><div class="kpi ${divida > 0 ? 'alerta' : ''}"><span>Dívida no cartão</span><strong>${brl(divida)}</strong></div>${c.limite ? html`<div class="kpi"><span>Limite disponível</span><strong>${brl(Math.max(0, c.limite - divida))}</strong></div>` : ''}</div>
        ${f ? html`<p class="peq" style="margin:0 0 8px">${f.fechada > 0 ? html`Fatura fechada: <strong>${brl(f.fechada)}</strong> (vence em ${dataBR(f.vencimentoFechada)}). ` : ''}Fatura aberta: <strong>${brl(f.aberta)}</strong> (fecha em ${dataBR(f.fechamentoEm)}, vence em ${dataBR(f.vencimentoAberta)}).</p>` : html`<p class="suave peq">Informe o dia de fechamento e de vencimento para ver as faturas.</p>`}`
      : html`<p style="margin:4px 0 12px"><span class="suave peq">Saldo</span><br><strong class="num" style="font-size:1.5rem;font-family:'Fraunces',serif;${c.saldo < 0 ? 'color:var(--perigo)' : ''}">${brl(c.saldo)}</strong></p>`}
    <div class="pac-acoes" style="margin-top:0"><button class="btn btn-sec btn-peq" data-extrato="${c.id}">Extrato</button>
      ${pode && c.ativo ? html`${cartao ? html`<button class="btn btn-pri btn-peq" data-fatura="${c.id}">Pagar fatura</button>` : html`<button class="btn btn-sec btn-peq" data-transferir="${c.id}">Transferir</button>`}<button class="btn btn-ghost btn-peq" data-editar="${c.id}">Editar</button>` : pode ? html`<button class="btn btn-ghost btn-peq" data-editar="${c.id}">Editar</button>` : ''}</div></div>`;
}

function desenhar() {
  const pode = !somenteLeitura(); const ativas = dados.itens.filter((c) => c.ativo); const inativas = dados.itens.filter((c) => !c.ativo);
  montar(raiz, html`<div class="cabeca"><div><h1>Contas e cartões</h1><p>Onde está o dinheiro do consultório e o que está no cartão.</p></div>${pode ? html`<div class="pac-acoes" style="margin:0"><button class="btn btn-sec" data-transferir>Transferir</button><button class="btn btn-pri" data-nova>Nova conta</button></div>` : ''}</div>
    <div class="kpis" style="grid-template-columns:repeat(2,1fr)"><div class="kpi ${dados.saldoCaixa < 0 ? 'alerta' : 'ok'}"><span>Dinheiro disponível</span><strong>${brl(dados.saldoCaixa)}</strong><small class="suave">Bancos, dinheiro e plataformas</small></div>
      <div class="kpi ${dados.dividaCartoes > 0 ? 'alerta' : ''}"><span>Dívida nos cartões</span><strong>${brl(dados.dividaCartoes)}</strong><small class="suave">Compras ainda não pagas</small></div></div>
    <div class="cols">${ativas.map(cartaoConta)}</div>
    ${inativas.length ? html`<h3 style="margin-top:20px">Contas inativas</h3><div class="cols">${inativas.map(cartaoConta)}</div>` : ''}
    <p class="suave peq">O saldo é calculado: saldo inicial mais o que entrou, menos o que saiu, desde a data do saldo inicial. Compras no cartão aparecem como dívida; ao pagar a fatura, o dinheiro sai do banco e a dívida cai.</p>`);
}

/* ---------------------------------------------------------------- formulários */
function formConta(c) {
  const m = abrirModal({ titulo: c ? 'Editar conta' : 'Nova conta', corpo: html`<div><p class="erro-form" role="alert" hidden></p>
    ${c ? '' : campo({ id: 'tipo', rotulo: 'Tipo', valor: 'banco', opcoes: Object.entries(TIPOS) })}
    ${campo({ id: 'nome', rotulo: 'Nome', valor: c ? c.nome : '', obrig: true, placeholder: 'Ex.: Banco Azul, Nubank, Pix da maquininha' })}${campo({ id: 'banco', rotulo: 'Banco / instituição (opcional)', valor: c ? c.banco || '' : '' })}
    <div class="grade-2">${campoDinheiro({ id: 'saldoInicial', rotulo: (c && c.tipo === 'cartao') || (!c) ? 'Saldo inicial (cartão: dívida em negativo)' : 'Saldo inicial', valor: c ? c.saldoInicial : 0, ajuda: 'O saldo hoje, ao começar a usar o sistema.' })}${campo({ id: 'dataSaldo', rotulo: 'Data do saldo inicial', tipo: 'date', valor: c ? c.dataSaldo : App.hoje, extra: `max="${App.hoje}"`, ajuda: 'Só movimentos depois dessa data contam.' })}</div>
    <div id="bloco-cartao" hidden><div class="grade-2">${campoDinheiro({ id: 'limite', rotulo: 'Limite do cartão', valor: c ? c.limite || 0 : 0 })}${campo({ id: 'contaPagamentoId', rotulo: 'Fatura paga pela conta', valor: c ? c.contaPagamentoId || '' : '', opcoes: [['', 'Escolher depois'], ...(dados.itens.filter((x) => x.tipo !== 'cartao' && x.ativo)).map((x) => [x.id, x.nome])] })}</div>
      <div class="grade-2">${campo({ id: 'diaFechamento', rotulo: 'Dia de fechamento da fatura', tipo: 'number', valor: c ? c.diaFechamento || '' : '', extra: 'min="1" max="31"' })}${campo({ id: 'diaVencimento', rotulo: 'Dia de vencimento da fatura', tipo: 'number', valor: c ? c.diaVencimento || '' : '', extra: 'min="1" max="31"' })}</div></div>
    ${c ? html`<label class="marca"><input type="checkbox" name="ativo" ${c.ativo ? raw('checked') : ''}><span>Conta ativa</span></label>` : ''}</div>`,
    acoes: [{ id: 'cancelar', rotulo: 'Cancelar' }, { id: 'salvar', rotulo: 'Salvar', classe: 'btn-pri' }] });
  const form = $('form', m.el); const alternar = () => { const tipo = c ? c.tipo : form.elements.tipo.value; $('#bloco-cartao', form).hidden = tipo !== 'cartao'; }; if (form.elements.tipo) form.elements.tipo.addEventListener('change', alternar); alternar();
  m.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-acao]'); if (!b) return; if (b.dataset.acao === 'cancelar') return m.fechar();
    const d = dadosForm(form); const falha = (msg) => { const x = $('.erro-form', form); x.textContent = msg; x.hidden = false; b.disabled = false; }; b.disabled = true;
    const neg = /^\s*-/.test(d.saldoInicial || ''); const sIni = lerReais(String(d.saldoInicial || '').replace('-', '')); const saldoInicial = sIni === null ? 0 : (neg ? -sIni : sIni);
    const corpo = { nome: d.nome, banco: d.banco, saldoInicial, dataSaldo: d.dataSaldo || App.hoje };
    if (!c) corpo.tipo = d.tipo;
    if ((c ? c.tipo : d.tipo) === 'cartao') { corpo.limite = lerReais(d.limite) ?? null; corpo.diaFechamento = d.diaFechamento ? Number(d.diaFechamento) : null; corpo.diaVencimento = d.diaVencimento ? Number(d.diaVencimento) : null; corpo.contaPagamentoId = d.contaPagamentoId ? Number(d.contaPagamentoId) : null; }
    if (c) corpo.ativo = d.ativo !== false;
    try { if (c) await api.put('contas-fin/' + c.id, corpo); else await api.post('contas-fin', corpo); m.fechar(); aviso('Conta salva.'); carregar(); } catch (er) { falha(er.message); }
  });
}

function formTransferencia({ origemId, destinoId, valor, obs, titulo } = {}) {
  const contas = dados.itens.filter((c) => c.ativo);
  const m = abrirModal({ titulo: titulo || 'Transferir entre contas', corpo: html`<div><p class="erro-form" role="alert" hidden></p>
    <div class="grade-2">${campo({ id: 'origemId', rotulo: 'Sai de', valor: origemId || (contas[0] ? contas[0].id : ''), opcoes: contas.map((c) => [c.id, c.nome]) })}${campo({ id: 'destinoId', rotulo: 'Entra em', valor: destinoId || (contas[1] ? contas[1].id : ''), opcoes: contas.map((c) => [c.id, c.nome + (c.tipo === 'cartao' ? ' (cartão)' : '')]) })}</div>
    <div class="grade-2">${campoDinheiro({ id: 'valor', rotulo: 'Valor', valor: valor || 0, obrig: true })}${campo({ id: 'data', rotulo: 'Data', tipo: 'date', valor: App.hoje, extra: `max="${App.hoje}"` })}</div>${campo({ id: 'obs', rotulo: 'Observação', valor: obs || '', extra: 'maxlength="200"' })}</div>`,
    acoes: [{ id: 'cancelar', rotulo: 'Cancelar' }, { id: 'salvar', rotulo: 'Transferir', classe: 'btn-pri' }] });
  const form = $('form', m.el);
  m.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-acao]'); if (!b) return; if (b.dataset.acao === 'cancelar') return m.fechar();
    const d = dadosForm(form); const falha = (msg) => { const x = $('.erro-form', form); x.textContent = msg; x.hidden = false; b.disabled = false; }; b.disabled = true;
    const v = lerReais(d.valor); if (!v || v <= 0) return falha('Informe o valor.');
    try { await api.post('transferencias', { origemId: Number(d.origemId), destinoId: Number(d.destinoId), valor: v, data: d.data || App.hoje, obs: d.obs }); m.fechar(); aviso('Transferência registrada.'); carregar(); } catch (er) { falha(er.message); }
  });
}

async function extrato(c) {
  let r; try { r = await api.get(`contas-fin/${c.id}/movimentos?limite=100`); } catch { return; }
  abrirModal({ titulo: `Extrato · ${c.nome}`, largo: true, corpo: html`<div>${r.itens.length ? html`<ul class="lista">${r.itens.map((x) => html`<li class="linha"><div class="rc-data"><b>${dataBR(x.data).slice(0, 5)}</b><small>${x.data.slice(0, 4)}</small></div><div class="corpo"><span class="tit">${x.descricao}</span><span class="sub">${x.quem || (x.origem === 'transferencia' ? 'Transferência' : x.tipo === 'receber' ? 'Recebimento' : 'Pagamento')}</span></div><strong class="num ${x.valor < 0 ? 'ruim' : 'bom'}">${brl(x.valor)}</strong>${x.origem === 'transferencia' ? html`<button class="btn btn-ghost btn-peq" data-apagar-transf="${x.id}" style="color:var(--perigo)">Desfazer</button>` : ''}</li>`)}</ul>` : vazio('Sem movimentos', 'Pagamentos recebidos, contas pagas e transferências desta conta aparecem aqui.')}</div>`, acoes: [] })
    .el.addEventListener('click', async (e) => {
      const d = e.target.closest('[data-apagar-transf]'); if (!d) return;
      if (!(await confirmar('Desfazer esta transferência? Os saldos das duas contas voltam ao que eram.', { titulo: 'Desfazer transferência', ok: 'Desfazer', perigo: true }))) return;
      try { await api.del('transferencias/' + d.dataset.apagarTransf); aviso('Transferência desfeita.'); document.querySelector('dialog[open]')?.close(); carregar(); } catch (er) { aviso(er.message, 'erro'); }
    });
}

async function clique(e) {
  const t = e.target;
  if (t.closest('[data-nova]')) return formConta(null);
  const ed = t.closest('[data-editar]'); if (ed) return formConta(dados.itens.find((c) => c.id === Number(ed.dataset.editar)));
  const tr = t.closest('[data-transferir]'); if (tr) return formTransferencia({ origemId: tr.dataset.transferir ? Number(tr.dataset.transferir) : undefined });
  const ft = t.closest('[data-fatura]');
  if (ft) {
    const c = dados.itens.find((x) => x.id === Number(ft.dataset.fatura)); const f = c.fatura; const devida = Math.max(0, -c.saldo);
    return formTransferencia({ titulo: `Pagar fatura · ${c.nome}`, origemId: c.contaPagamentoId || undefined, destinoId: c.id, valor: f && f.fechada > 0 ? f.fechada : devida, obs: 'Pagamento da fatura' });
  }
  const ex = t.closest('[data-extrato]'); if (ex) return extrato(dados.itens.find((c) => c.id === Number(ex.dataset.extrato)));
}
