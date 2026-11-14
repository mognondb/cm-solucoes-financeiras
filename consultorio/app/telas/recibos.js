/* Recibos: emitir (dos pagamentos já registrados ou avulso), baixar o PDF e cancelar. A numeração é sequencial e nunca se repete. */
import { api, qs } from '../api.js';
import { App, somenteLeitura } from '../estado.js';
import { html, raw, montar, $, $$, abrirModal, confirmar, aviso, campo, campoDinheiro, dadosForm, lerReais, brl, selo, vazio, dataBR, fmtCPF } from '../ui.js';
import { emitirRecibo, FORMA_NOME } from '../financeiro.js';
import { baixarReciboPdf } from '../recibo-pdf.js';

const est = { paciente: '', busca: '' };
let raiz = null; let lista = [];

export async function abrir(el) {
  raiz = el; el.onclick = clique; el.onchange = mudou; await carregar();
}
async function carregar() {
  try { lista = (await api.get('recibos' + qs({ paciente: est.paciente }))).itens; } catch (e) { montar(raiz, html`<div class="cartao vazio"><h3>Não foi possível carregar</h3><p>${e.message}</p></div>`); return; }
  desenhar();
}
const num = (n) => String(n).padStart(4, '0');

function desenhar() {
  const pode = !somenteLeitura(); const ativos = lista.filter((r) => !r.cancelado); const total = ativos.reduce((a, r) => a + r.valor, 0);
  montar(raiz, html`<div class="cabeca"><div><h1>Recibos</h1><p>Recibos numerados em PDF, para entregar ao paciente ou ao responsável.</p></div>${pode ? html`<button class="btn btn-pri" data-novo>Emitir recibo</button>` : ''}</div>
    ${lista.length ? html`<div class="cartao" style="padding:6px 14px"><ul class="lista">${lista.map((r) => html`<li class="linha ${r.cancelado ? 'inativa' : ''}"><div class="rc-data"><b>Nº ${num(r.numero)}</b><small>${dataBR(r.data).slice(0, 5)}/${r.data.slice(2, 4)}</small></div>
      <div class="corpo"><span class="tit" style="${r.cancelado ? 'text-decoration:line-through' : ''}">${r.pagadorNome}</span><span class="sub">${r.referencia}${r.cancelado ? ` · cancelado${r.canceladoMotivo ? `: ${r.canceladoMotivo}` : ''}` : ''}</span></div>
      <span class="dir"><strong class="num">${brl(r.valor)}</strong>${r.cancelado ? selo('Cancelado', 'ruim') : ''}</span>
      <span class="acoes-rapidas" style="flex:none"><button class="btn btn-sec btn-peq" data-pdf="${r.id}">PDF</button>${pode && !r.cancelado ? html`<button class="btn btn-ghost btn-peq" data-cancelar="${r.id}" style="color:var(--perigo)">Cancelar</button>` : ''}</span></li>`)}</ul></div>
      <p class="suave peq" style="margin:10px 4px">${ativos.length} recibo${ativos.length === 1 ? '' : 's'} válido${ativos.length === 1 ? '' : 's'} · ${brl(total)}. Recibos cancelados mantêm o número, para a sequência não ter buracos.</p>`
      : html`<div class="cartao">${vazio('Nenhum recibo emitido', 'Emita o primeiro a partir dos pagamentos que você já registrou ou crie um recibo avulso.', pode ? html`<button class="btn btn-pri" data-novo>Emitir recibo</button>` : '')}</div>`}
    <p class="suave peq" style="margin:12px 4px">Confira se o CPF/CNPJ e o CRP do consultório estão preenchidos em Configurações: eles aparecem no recibo. Os dados do emitente ficam guardados no momento da emissão e não mudam depois.</p>`);
}

async function formulario() {
  let pacientes = []; try { pacientes = (await api.get('pacientes?status=todos')).itens.filter((p) => p.status !== 'arquivado'); } catch (e) { aviso(e.message, 'erro'); return; }
  const m = abrirModal({ titulo: 'Emitir recibo', largo: true, corpo: html`<div><p class="erro-form" role="alert" hidden></p>
    <div class="chips" role="group" aria-label="Tipo de recibo" style="margin-bottom:14px"><button type="button" class="chip" data-modo="pagamentos" aria-pressed="true">De pagamentos registrados</button><button type="button" class="chip" data-modo="avulso" aria-pressed="false">Avulso</button></div>
    <input type="hidden" name="modo" value="pagamentos">
    <div data-so="pagamentos">${campo({ id: 'pacienteId', rotulo: 'Paciente', valor: '', opcoes: [['', 'Escolha o paciente'], ...pacientes.map((p) => [p.id, p.nome])] })}<div id="rb-lista"><p class="suave peq">Escolha o paciente para ver os pagamentos que ainda não têm recibo.</p></div></div>
    <div data-so="avulso" hidden><div class="grade-2">${campoDinheiro({ id: 'valor', rotulo: 'Valor', valor: 0, obrig: true })}${campo({ id: 'data', rotulo: 'Data do pagamento', tipo: 'date', valor: App.hoje, extra: `max="${App.hoje}"` })}</div>
      ${campo({ id: 'referencia', rotulo: 'Referente a', placeholder: 'Ex.: avaliação psicológica, palestra, supervisão', obrig: true })}
      <div class="grade-2">${campo({ id: 'pagadorNome', rotulo: 'Pagador (se não for o paciente)', placeholder: 'Nome ou empresa' })}${campo({ id: 'pagadorCpf', rotulo: 'CPF/CNPJ do pagador' })}</div>
      ${campo({ id: 'pacienteAvulso', rotulo: 'Paciente (opcional)', valor: '', opcoes: [['', 'Sem paciente'], ...pacientes.map((p) => [p.id, p.nome])] })}</div></div>`,
    acoes: [{ id: 'cancelar', rotulo: 'Cancelar' }, { id: 'ok', rotulo: 'Emitir e baixar PDF', classe: 'btn-pri' }] });
  const form = $('form', m.el); const modo = () => form.elements.modo.value;
  const alternar = () => { $$('[data-so]', form).forEach((d) => { d.hidden = d.dataset.so !== modo(); }); $$('[data-modo]', form).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.modo === modo()))); };
  let pend = [];
  const mostrarPendentes = async () => {
    const id = Number(form.elements.pacienteId.value); const alvo = $('#rb-lista', form); if (!id) { alvo.innerHTML = '<p class="suave peq">Escolha o paciente para ver os pagamentos que ainda não têm recibo.</p>'; pend = []; return; }
    try { pend = (await api.get('recibos/pendentes?paciente=' + id)).itens; } catch (e) { alvo.textContent = e.message; return; }
    montar(alvo, pend.length ? html`<p class="suave peq" style="margin:0 0 6px">Marque os pagamentos que entram neste recibo:</p><ul class="lista">${pend.map((b) => html`<li class="linha"><label class="marca" style="flex:1"><input type="checkbox" data-baixa="${b.baixaId}" checked><span><strong>${brl(b.valor)}</strong> · ${dataBR(b.data)}${b.forma ? ` · ${FORMA_NOME[b.forma] || b.forma}` : ''}<br><span class="suave peq">${b.descricao}</span></span></label></li>`)}</ul>` : html`<p class="suave peq">Este paciente não tem pagamentos sem recibo. Use "Avulso" para emitir mesmo assim.</p>`);
  };
  form.addEventListener('click', (e) => { const b = e.target.closest('[data-modo]'); if (b) { form.elements.modo.value = b.dataset.modo; alternar(); } });
  form.elements.pacienteId.addEventListener('change', mostrarPendentes);
  m.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-acao]'); if (!b) return; if (b.dataset.acao === 'cancelar') return m.fechar();
    const d = dadosForm(form); const falha = (msg) => { const x = $('.erro-form', form); x.textContent = msg; x.hidden = false; b.disabled = false; }; b.disabled = true; $('.erro-form', form).hidden = true;
    let corpo;
    if (modo() === 'pagamentos') { const ids = $$('[data-baixa]:checked', form).map((x) => Number(x.dataset.baixa)); if (!d.pacienteId) return falha('Escolha o paciente.'); if (!ids.length) return falha('Marque ao menos um pagamento.'); corpo = { pacienteId: Number(d.pacienteId), baixaIds: ids }; }
    else { const v = lerReais(d.valor); if (!v || v <= 0) return falha('Informe o valor.'); if (!d.referencia) return falha('Informe a que se refere o recibo.'); corpo = { valor: v, data: d.data || App.hoje, referencia: d.referencia, pagadorNome: d.pagadorNome || undefined, pagadorCpf: d.pagadorCpf || undefined, pacienteId: d.pacienteAvulso ? Number(d.pacienteAvulso) : undefined }; if (!corpo.pacienteId && !corpo.pagadorNome) return falha('Informe o paciente ou o nome de quem pagou.'); }
    const rec = await emitirRecibo(corpo); if (rec) { m.fechar(); carregar(); } else b.disabled = false;
  });
}

function mudou() { /* sem filtros por enquanto */ }
async function clique(e) {
  const t = e.target;
  if (t.closest('[data-novo]')) return formulario();
  const pdf = t.closest('[data-pdf]'); if (pdf) { try { const r = lista.find((x) => x.id === Number(pdf.dataset.pdf)); await baixarReciboPdf(r); } catch (er) { aviso(er.message, 'erro'); } return; }
  const can = t.closest('[data-cancelar]');
  if (can) {
    const r = lista.find((x) => x.id === Number(can.dataset.cancelar));
    if (!(await confirmar(`Cancelar o recibo nº ${num(r.numero)}? O número continua registrado como cancelado e os pagamentos dele poderão receber um novo recibo.`, { titulo: 'Cancelar recibo', ok: 'Cancelar recibo', perigo: true }))) return;
    try { await api.post(`recibos/${r.id}/cancelar`, { motivo: 'Cancelado pelo emitente' }); aviso('Recibo cancelado.'); carregar(); } catch (er) { aviso(er.message, 'erro'); }
  }
}
