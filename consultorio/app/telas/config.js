/* Configurações: consultório, agenda e cobrança, profissionais, tipos de atendimento, categorias e minha conta. */
import { api } from '../api.js';
import { App, defineEu, carregarBase, categoriasDe } from '../estado.js';
import { html, raw, montar, $, $$, abrirModal, confirmar, aviso, campo, dadosForm, lerReais, num2, brl, selo, DIAS_CURTOS, fmtCPF, fmtTel, dataBR } from '../ui.js';

const ABAS = [['consultorio', 'Consultório'], ['agenda', 'Agenda e cobrança'], ['profissionais', 'Profissionais'], ['atendimentos', 'Atendimentos'], ['categorias', 'Categorias'], ['conta', 'Minha conta']];

export async function abrir(el, args) {
  const aba = ABAS.some(([k]) => k === args[0]) ? args[0] : 'consultorio';
  montar(el, html`<div class="cabeca"><div><h1>Configurações</h1><p>Ajuste a plataforma ao jeito do seu consultório.</p></div></div>
    <div class="abas" role="tablist">${ABAS.map(([k, t]) => html`<button role="tab" aria-selected="${k === aba}" data-aba="${k}">${t}</button>`)}</div><div id="aba"></div>`);
  el.querySelector('.abas').addEventListener('click', (e) => { const b = e.target.closest('[data-aba]'); if (b) location.hash = '#/config/' + b.dataset.aba; });
  const alvo = $('#aba', el);
  await ({ consultorio, agenda, profissionais, atendimentos, categorias, conta }[aba])(alvo);
}

const erroEm = (form, msg) => { const e = $('.erro-form', form); e.textContent = msg; e.hidden = false; e.scrollIntoView({ block: 'nearest' }); };
async function enviar(form, fn, okMsg = 'Salvo.') {
  const btn = $('button[type=submit]', form); const e = $('.erro-form', form); if (e) e.hidden = true; btn.disabled = true;
  try { await fn(dadosForm(form)); aviso(okMsg); } catch (er) { erroEm(form, er.message); } finally { btn.disabled = false; }
}

/* ---------------------------------------------------------------- consultório */
function consultorio(alvo) {
  const c = App.eu.conta;
  montar(alvo, html`<form class="cartao" novalidate><p class="erro-form" role="alert" hidden></p>
    <p class="suave">Estes dados aparecem nos seus recibos e relatórios.</p>
    ${campo({ id: 'nome', rotulo: 'Nome do consultório', valor: c.nome, obrig: true })}
    <div class="grade-2">${campo({ id: 'documento', rotulo: 'CPF ou CNPJ', valor: fmtCPF(c.documento), ajuda: 'Obrigatório para emitir recibos válidos.' })}${campo({ id: 'crp', rotulo: 'Registro no CRP', valor: c.crp || '', placeholder: 'Ex.: 06/123456' })}</div>
    <div class="grade-2">${campo({ id: 'telefone', rotulo: 'Telefone', valor: fmtTel(c.telefone), tipo: 'tel' })}${campo({ id: 'endereco', rotulo: 'Endereço do consultório', valor: c.endereco || '' })}</div>
    <div class="grade-2">${campo({ id: 'cidade', rotulo: 'Cidade', valor: c.cidade || '' })}${campo({ id: 'uf', rotulo: 'UF', valor: c.uf || '', extra: 'maxlength="2" style="text-transform:uppercase"' })}</div>
    <button class="btn btn-pri" type="submit">Salvar</button></form>`);
  const form = $('form', alvo);
  form.addEventListener('submit', (e) => { e.preventDefault(); enviar(form, async (d) => { defineEu(await api.put('conta', d)); }); });
}

/* ---------------------------------------------------------------- agenda e cobrança */
function agenda(alvo) {
  const cf = App.eu.config; const dias = new Set(cf.dias_semana);
  montar(alvo, html`<form class="cartao" novalidate><p class="erro-form" role="alert" hidden></p>
    <h3>Agenda</h3>
    <div class="grade-3">${campo({ id: 'duracao_padrao', rotulo: 'Duração padrão da sessão (min)', tipo: 'number', valor: cf.duracao_padrao, extra: 'min="10" max="480" step="5"' })}
      ${campo({ id: 'hora_ini', rotulo: 'Agenda começa às (h)', tipo: 'number', valor: cf.hora_ini, extra: 'min="0" max="22"' })}${campo({ id: 'hora_fim', rotulo: 'Agenda termina às (h)', tipo: 'number', valor: cf.hora_fim, extra: 'min="1" max="24"' })}</div>
    <div class="campo"><label>Dias de atendimento</label><div class="chips">${DIAS_CURTOS.map((d, i) => html`<label class="chip" style="cursor:pointer"><input type="checkbox" name="dia${i}" ${dias.has(i) ? raw('checked') : ''} style="margin-right:6px">${d}</label>`)}</div></div>
    <h3 style="margin-top:20px">Cobrança</h3>
    ${campo({ id: 'prazo_padrao_dias', rotulo: 'Prazo para pagar cada sessão (dias após a sessão)', tipo: 'number', valor: cf.prazo_padrao_dias, extra: 'min="0" max="365"', ajuda: '0 = vence no próprio dia da sessão.' })}
    <label class="marca"><input type="checkbox" name="cobrar_falta" ${cf.cobrar_falta ? raw('checked') : ''}><span>Cobrar falta sem aviso (cancelamento sem justificativa)</span></label>
    ${campo({ id: 'falta_percentual', rotulo: 'Quanto cobrar da falta (% do valor da sessão)', tipo: 'number', valor: cf.falta_percentual, extra: 'min="0" max="100"' })}
    <h3 style="margin-top:20px">Preço social</h3>
    <p class="suave peq" style="margin-top:0">Para atender com valor reduzido pessoas em vulnerabilidade socioeconômica. Você marca o paciente ou a sessão como "preço social"; o valor vem do tipo de atendimento (campo "Valor social") ou, se ele não tiver, deste desconto sobre o valor de tabela.</p>
    ${campo({ id: 'social_percentual', rotulo: 'Desconto padrão do preço social (%)', tipo: 'number', valor: cf.social_percentual ?? 50, extra: 'min="0" max="90"', ajuda: 'Ex.: 50 = metade do valor de tabela.' })}
    <h3 style="margin-top:20px">Mensagens prontas (WhatsApp)</h3>
    <p class="suave peq">Você pode usar: {nome}, {descricao}, {valor}, {vencimento}, {profissional}, {dia}, {hora}.</p>
    ${campo({ id: 'msg_cobranca', rotulo: 'Cobrança de pagamento', tipo: 'textarea', valor: cf.msg_cobranca })}
    ${campo({ id: 'msg_confirmacao', rotulo: 'Confirmação de sessão', tipo: 'textarea', valor: cf.msg_confirmacao })}
    <button class="btn btn-pri" type="submit">Salvar</button></form>`);
  const form = $('form', alvo);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    enviar(form, async (d) => {
      const diasSel = DIAS_CURTOS.map((_, i) => (d['dia' + i] ? i : -1)).filter((i) => i >= 0);
      defineEu(await api.put('conta/config', { duracao_padrao: Number(d.duracao_padrao), hora_ini: Number(d.hora_ini), hora_fim: Number(d.hora_fim), dias_semana: diasSel,
        prazo_padrao_dias: Number(d.prazo_padrao_dias), cobrar_falta: d.cobrar_falta, falta_percentual: Number(d.falta_percentual), social_percentual: Number(d.social_percentual), msg_cobranca: d.msg_cobranca, msg_confirmacao: d.msg_confirmacao }));
    });
  });
}

/* ---------------------------------------------------------------- profissionais */
async function profissionais(alvo) {
  const { itens } = await api.get('profissionais');
  montar(alvo, html`<div class="cartao"><div class="cartao-t"><h3>Quem atende neste consultório</h3><button class="btn btn-sec btn-peq" data-novo>Adicionar profissional</button></div>
    <p class="suave peq">Se mais de uma pessoa atende (por exemplo, duas psicólogas dividindo a sala), cada uma tem a própria agenda e os próprios pacientes.</p>
    <ul class="lista">${itens.map((p) => html`<li class="linha"><span class="avatar" style="background:${p.cor};color:#fff">${p.nome.slice(0, 1)}</span><div class="corpo"><span class="tit">${p.nome}</span><span class="sub">${p.crp ? 'CRP ' + p.crp : 'CRP não informado'}</span></div>${p.ativo ? '' : selo('Inativo')}<button class="btn btn-ghost btn-peq" data-edit="${p.id}">Editar</button></li>`)}</ul></div>`);
  const abrirForm = (p) => {
    const m = abrirModal({ titulo: p ? 'Editar profissional' : 'Novo profissional', corpo: html`<form novalidate><p class="erro-form" role="alert" hidden></p>
      ${campo({ id: 'nome', rotulo: 'Nome', valor: p?.nome || '', obrig: true })}${campo({ id: 'crp', rotulo: 'CRP', valor: p?.crp || '' })}
      <div class="campo"><label for="cor">Cor na agenda</label><input id="cor" name="cor" type="color" value="${p?.cor || '#b18a52'}" style="height:44px;padding:4px"></div>
      ${p ? html`<label class="marca"><input type="checkbox" name="ativo" ${p.ativo ? raw('checked') : ''}><span>Ativo</span></label>` : ''}</form>`,
      acoes: [{ id: 'cancelar', rotulo: 'Cancelar' }, { id: 'salvar', rotulo: 'Salvar', classe: 'btn-pri' }] });
    m.el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-acao]'); if (!b) return; if (b.dataset.acao === 'cancelar') return m.fechar();
      if (b.dataset.acao === 'salvar') { const f = $('form', m.el); const d = dadosForm(f);
        try { if (p) await api.put('profissionais/' + p.id, { ...d, ativo: d.ativo !== false }); else await api.post('profissionais', d); defineEu(await api.get('conta')); m.fechar(); aviso('Salvo.'); await profissionais(alvo); } catch (er) { erroEm(f, er.message); } }
    });
  };
  alvo.querySelector('[data-novo]').addEventListener('click', () => abrirForm(null));
  alvo.onclick = (e) => { const b = e.target.closest('[data-edit]'); if (b) abrirForm(itens.find((x) => x.id === Number(b.dataset.edit))); };
}

/* ---------------------------------------------------------------- tipos de atendimento */
async function atendimentos(alvo) {
  await carregarBase(['servicos', 'categorias']);
  const lista = App.cache.servicos; const cats = categoriasDe('receita');
  const nomeCat = (id) => (App.cache.categorias.find((c) => c.id === id) || {}).nome || 'Sem categoria';
  montar(alvo, html`<div class="cartao"><div class="cartao-t"><h3>Tipos de atendimento</h3><button class="btn btn-sec btn-peq" data-novo>Adicionar</button></div>
    <p class="suave peq">Aqui ficam seus valores padrão. Cada paciente pode ter um valor próprio, mas começar daqui economiza digitação.</p>
    <ul class="lista">${lista.map((s) => html`<li class="linha"><div class="corpo"><span class="tit">${s.nome}</span><span class="sub">${s.duracaoMin} min · ${nomeCat(s.categoriaId)}</span></div>
      <strong class="num ${s.valor ? '' : 'aten'}">${s.valor ? brl(s.valor) : 'Defina o valor'}</strong>${s.valorSocial ? html`<span class="suave peq" style="margin-left:8px">social ${brl(s.valorSocial)}</span>` : ''}${s.ativo ? '' : selo('Inativo')}<button class="btn btn-ghost btn-peq" data-edit="${s.id}">Editar</button></li>`)}</ul></div>`);
  const abrirForm = (s) => {
    const m = abrirModal({ titulo: s ? 'Editar atendimento' : 'Novo atendimento', corpo: html`<form novalidate><p class="erro-form" role="alert" hidden></p>
      ${campo({ id: 'nome', rotulo: 'Nome', valor: s?.nome || '', obrig: true })}
      <div class="grade-2">${campo({ id: 'duracaoMin', rotulo: 'Duração (min)', tipo: 'number', valor: s?.duracaoMin || App.eu.config.duracao_padrao, extra: 'min="10" max="480"' })}
        <div class="campo"><label for="valor">Valor padrão</label><div class="dinheiro"><span>R$</span><input id="valor" name="valor" inputmode="decimal" value="${s?.valor ? num2(s.valor) : ''}" placeholder="0,00"></div></div></div>
      <div class="campo"><label for="valorSocial">Valor social (opcional)</label><div class="dinheiro"><span>R$</span><input id="valorSocial" name="valorSocial" inputmode="decimal" value="${s?.valorSocial ? num2(s.valorSocial) : ''}" placeholder="0,00"></div><small class="ajuda">Preço para quem é atendido com preço social. Em branco: usa o desconto padrão das configurações (${App.eu.config.social_percentual ?? 50}%).</small></div>
      ${campo({ id: 'categoriaId', rotulo: 'Categoria de receita', valor: s?.categoriaId || '', opcoes: [['', 'Sem categoria'], ...cats.map((c) => [c.id, c.nome])] })}
      ${s ? html`<label class="marca"><input type="checkbox" name="ativo" ${s.ativo ? raw('checked') : ''}><span>Ativo</span></label>` : ''}</form>`,
      acoes: [{ id: 'cancelar', rotulo: 'Cancelar' }, { id: 'salvar', rotulo: 'Salvar', classe: 'btn-pri' }] });
    m.el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-acao]'); if (!b) return; if (b.dataset.acao === 'cancelar') return m.fechar();
      if (b.dataset.acao === 'salvar') { const f = $('form', m.el); const d = dadosForm(f);
        const corpo = { nome: d.nome, duracaoMin: Number(d.duracaoMin), valor: lerReais(d.valor) ?? 0, valorSocial: d.valorSocial ? (lerReais(d.valorSocial) ?? null) : null, categoriaId: d.categoriaId ? Number(d.categoriaId) : null, ativo: d.ativo !== false };
        try { if (s) await api.put('servicos/' + s.id, corpo); else await api.post('servicos', corpo); m.fechar(); aviso('Salvo.'); await atendimentos(alvo); } catch (er) { erroEm(f, er.message); } }
    });
  };
  alvo.querySelector('[data-novo]').addEventListener('click', () => abrirForm(null));
  alvo.onclick = (e) => { const b = e.target.closest('[data-edit]'); if (b) abrirForm(lista.find((x) => x.id === Number(b.dataset.edit))); };
}

/* ---------------------------------------------------------------- categorias */
async function categorias(alvo) {
  await carregarBase(['categorias']);
  const bloco = (tipo, titulo) => { const l = App.cache.categorias.filter((c) => c.tipo === tipo); return html`<div class="cartao"><div class="cartao-t"><h3>${titulo}</h3><button class="btn btn-sec btn-peq" data-novo="${tipo}">Adicionar</button></div>
    <ul class="lista">${l.map((c) => html`<li class="linha"><div class="corpo"><span class="tit" style="${c.ativo ? '' : 'color:#999'}">${c.nome}</span><span class="sub">${tipo === 'despesa' ? (c.grupo === 'fixa' ? 'Fixa' : 'Variável') + (c.dedutivel ? ' · pode entrar no livro-caixa' : '') : ''}</span></div>${c.ativo ? '' : selo('Inativa')}<button class="btn btn-ghost btn-peq" data-edit="${c.id}">Editar</button></li>`)}</ul></div>`; };
  montar(alvo, html`<div class="pac-acoes" style="margin:0 0 12px;justify-content:flex-end"><a class="btn btn-sec btn-peq" href="#/importar?tipo=categorias">Importar planilha</a></div><p class="suave">Vieram da Planilha de Controle Financeiro para Psicólogos da CM. Renomear uma categoria já usada muda o nome nos lançamentos antigos; para encerrar uma, desative em vez de apagar.</p>${bloco('receita', 'Categorias de receita')}<div style="height:16px"></div>${bloco('despesa', 'Categorias de despesa')}
    <p class="suave peq" style="margin-top:12px">"Pode entrar no livro-caixa" é só uma sugestão para o carnê-leão: confirme com seu contador.</p>`);
  const abrirForm = (c, tipo) => {
    const m = abrirModal({ titulo: c ? 'Editar categoria' : 'Nova categoria', corpo: html`<form novalidate><p class="erro-form" role="alert" hidden></p>
      ${campo({ id: 'nome', rotulo: 'Nome', valor: c?.nome || '', obrig: true })}${campo({ id: 'descricao', rotulo: 'Descrição', valor: c?.descricao || '' })}
      ${tipo === 'despesa' ? html`${campo({ id: 'grupo', rotulo: 'Tipo de gasto', valor: c?.grupo || 'variavel', opcoes: [['fixa', 'Fixa (repete todo mês)'], ['variavel', 'Variável']] })}<label class="marca"><input type="checkbox" name="dedutivel" ${c?.dedutivel ? raw('checked') : ''}><span>Pode entrar no livro-caixa (carnê-leão)</span></label>` : ''}
      ${c ? html`<label class="marca"><input type="checkbox" name="ativo" ${c.ativo ? raw('checked') : ''}><span>Ativa</span></label>` : ''}</form>`,
      acoes: [{ id: 'cancelar', rotulo: 'Cancelar' }, { id: 'salvar', rotulo: 'Salvar', classe: 'btn-pri' }] });
    m.el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-acao]'); if (!b) return; if (b.dataset.acao === 'cancelar') return m.fechar();
      if (b.dataset.acao === 'salvar') { const f = $('form', m.el); const d = dadosForm(f);
        try { if (c) await api.put('categorias/' + c.id, { ...d, ativo: d.ativo !== false }); else await api.post('categorias', { ...d, tipo }); m.fechar(); aviso('Salvo.'); await categorias(alvo); } catch (er) { erroEm(f, er.message); } }
    });
  };
  alvo.onclick = (e) => {
    const n = e.target.closest('[data-novo]'); if (n) return abrirForm(null, n.dataset.novo);
    const b = e.target.closest('[data-edit]'); if (b) { const c = App.cache.categorias.find((x) => x.id === Number(b.dataset.edit)); abrirForm(c, c.tipo); }
  };
}

/* ---------------------------------------------------------------- minha conta */
function conta(alvo) {
  const u = App.eu.usuario; const p = App.eu.plano;
  const planoTxt = { teste: 'Teste grátis', ativo: 'Assinatura ativa', expirado: 'Teste encerrado', suspenso: 'Suspensa' }[p.plano];
  montar(alvo, html`<div class="cartao"><h3>Seu acesso</h3>
    <p><strong>${u.nome}</strong><br><span class="suave">${u.email}</span> ${u.verificado ? selo('E-mail confirmado', 'ok') : selo('E-mail por confirmar', 'aten')}</p>
    <p>Plano: <strong>${planoTxt}</strong>${p.plano === 'teste' && p.trialAte ? html` · termina em ${dataBR(p.trialAte)}` : ''}</p></div>
    <form class="cartao" novalidate><p class="erro-form" role="alert" hidden></p><h3>Trocar senha</h3>
      ${campo({ id: 'atual', rotulo: 'Senha atual', tipo: 'password', extra: 'autocomplete="current-password"' })}${campo({ id: 'nova', rotulo: 'Nova senha', tipo: 'password', extra: 'autocomplete="new-password" minlength="8"', ajuda: 'Pelo menos 8 caracteres.' })}
      <button class="btn btn-pri" type="submit">Trocar senha</button></form>
    <div class="cartao"><h3>Seus dados</h3><p class="suave">Os dados do consultório e dos pacientes são seus. Você pode levar tudo embora ou apagar a conta quando quiser.</p>
      <div class="pac-acoes" style="margin-top:0"><button class="btn btn-sec" id="baixar-dados">Baixar todos os meus dados</button><button class="btn btn-ghost" id="excluir-conta" style="color:var(--perigo)">Excluir minha conta</button></div>
      <p class="suave peq" style="margin:10px 0 0">O arquivo (JSON) inclui pacientes, agenda, cobranças, pagamentos, contas, extratos e recibos. Mesmo com o teste grátis encerrado, você pode baixar seus dados.</p></div>`);
  const form = $('form', alvo);
  form.addEventListener('submit', (e) => { e.preventDefault(); enviar(form, async (d) => { await api.post('auth/senha', d); form.reset(); }, 'Senha alterada.'); });
  $('#baixar-dados', alvo).addEventListener('click', async (e) => {
    const b = e.currentTarget; b.disabled = true;
    try { const dados = await api.get('conta/exportar'); const url = URL.createObjectURL(new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `portal-clincm-dados-${App.hoje}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); aviso('Arquivo gerado.'); }
    catch (er) { aviso(er.message, 'erro'); } finally { b.disabled = false; }
  });
  $('#excluir-conta', alvo).addEventListener('click', () => {
    const m = abrirModal({ titulo: 'Excluir minha conta', corpo: html`<div><p class="erro-form" role="alert" hidden></p>
      <p><strong>Isto apaga tudo, para sempre:</strong> pacientes, agenda, cobranças, pagamentos, contas, extratos e recibos. Não há como desfazer. Baixe seus dados antes, se quiser guardá-los.</p>
      ${campo({ id: 'senha', rotulo: 'Sua senha', tipo: 'password', obrig: true, extra: 'autocomplete="current-password"' })}${campo({ id: 'confirmacao', rotulo: 'Digite EXCLUIR para confirmar', obrig: true, extra: 'autocomplete="off"' })}</div>`,
      acoes: [{ id: 'cancelar', rotulo: 'Cancelar' }, { id: 'ok', rotulo: 'Excluir definitivamente', classe: 'btn-perigo' }] });
    const f = $('form', m.el);
    m.el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-acao]'); if (!b) return; if (b.dataset.acao === 'cancelar') return m.fechar();
      const d = dadosForm(f); b.disabled = true; const x = $('.erro-form', f); x.hidden = true;
      try { await api.post('conta/excluir', { senha: d.senha, confirmacao: d.confirmacao }); m.fechar(); aviso('Conta excluída. Seus dados foram apagados.', 'ok', 8000); location.hash = '#/entrar'; location.reload(); }
      catch (er) { x.textContent = er.message; x.hidden = false; b.disabled = false; }
    });
  });
}
