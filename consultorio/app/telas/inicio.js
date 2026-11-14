/* Início: saudação e primeiros passos. (Vira o painel do dia — sessões de hoje, contas a receber e a pagar — conforme os módulos chegam.) */
import { api } from '../api.js';
import { App } from '../estado.js';
import { html, montar, primeiroNome, dataLonga } from '../ui.js';

export async function abrir(el) {
  const c = App.eu.conta; const servicos = App.cache.servicos || [];
  let temPaciente = false;
  try { temPaciente = (await api.get('pacientes?status=todos')).itens.length > 0; } catch { /* o painel funciona sem isso */ }
  const passos = [
    ['Complete os dados do consultório', 'CPF/CNPJ e CRP aparecem nos recibos.', !!(c.documento && c.crp), '#/config/consultorio', 'Abrir'],
    ['Defina o valor dos seus atendimentos', 'Assim cada paciente já nasce com o valor certo.', servicos.some((s) => s.valor > 0), '#/config/atendimentos', 'Abrir'],
    ['Cadastre seu primeiro paciente', 'Nome, contato e como ele paga.', temPaciente, '#/pacientes', 'Abrir'],
    ['Agende a primeira sessão', 'A agenda gera as cobranças sozinha.', false, '#/agenda', 'Abrir'],
  ];
  montar(el, html`<div class="cabeca"><div><h1>Olá, ${primeiroNome(App.eu.usuario.nome)}!</h1><p>${dataLonga(App.hoje)}</p></div></div>
    <div class="cartao"><div class="cartao-t"><h2>Primeiros passos</h2></div>
      <ol class="passos">${passos.map(([t, d, ok, link, rot], i) => html`<li class="${ok ? 'passo-ok' : ''}"><span class="passo-n">${ok ? '✓' : i + 1}</span><div style="flex:1"><span class="tit forte">${t}</span><br><span class="suave peq">${d}</span></div>${ok ? '' : html`<a class="btn btn-sec btn-peq" href="${link}">${rot}</a>`}</li>`)}</ol></div>`);
}
