/* Telas de acesso: plataforma restrita, entrar, cadastro (teste grátis), esqueci a senha, redefinir senha e verificar e-mail. */
import { api, definirCsrf } from '../api.js';
import { App, defineEu, carregarBase } from '../estado.js';
import { html, raw, montar, $, dadosForm } from '../ui.js';

const moldura = (conteudo) => html`<div class="acesso"><div class="acesso-caixa">
  <div class="acesso-marca"><small>CM Soluções Financeiras</small><div class="nome">Portal CLINCM</div></div>
  <div class="cartao">${conteudo}</div>${''}</div></div>`;

/** Plataforma em desenvolvimento: só a equipe da CM entra (pelo painel administrativo). */
export function restrito(raiz) {
  montar(raiz, moldura(html`<h1>Plataforma em desenvolvimento</h1>
    <p>O Portal CLINCM ainda está sendo construído e, por enquanto, só a equipe da CM Soluções Financeiras tem acesso.</p>
    <p class="suave peq">Se você faz parte da equipe, abra a plataforma pela aba <strong>Portal CLINCM</strong> do painel administrativo.</p>
    <a class="btn btn-pri btn-bloco" href="../admin/index.html">Ir para o painel administrativo</a>`));
}

export function mostrar(raiz, tela, args = []) {
  ({ entrar, cadastro, esqueci, redefinir }[tela] || entrar)(raiz, args);
}

function ligarFormulario(raiz, enviar, rotuloEnvio) {
  const form = $('form', raiz); const erro = $('.erro-form', raiz); const btn = $('button[type=submit]', raiz);
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); erro.hidden = true; btn.disabled = true; const antes = btn.textContent; btn.textContent = rotuloEnvio;
    try { await enviar(dadosForm(form)); } catch (er) { erro.textContent = er.message; erro.hidden = false; btn.disabled = false; btn.textContent = antes; }
  });
  const primeiro = $('input:not([type=hidden])', form); if (primeiro) primeiro.focus();
}

async function entrouComSucesso(eu) {
  defineEu(eu); definirCsrf(eu.csrf); await carregarBase();
  location.hash = '#/inicio'; // a mudança de endereço já aciona o roteador
}

function entrar(raiz) {
  montar(raiz, moldura(html`<h1>Entrar</h1>
    <form novalidate><p class="erro-form" role="alert" hidden></p>
      <div class="campo"><label for="email">E-mail</label><input id="email" name="email" type="email" autocomplete="username" required></div>
      <div class="campo"><label for="senha">Senha</label><input id="senha" name="senha" type="password" autocomplete="current-password" required></div>
      <button class="btn btn-pri btn-bloco" type="submit">Entrar</button></form>
    <p class="rodape-links"><a href="#/esqueci">Esqueci minha senha</a></p>
    <p class="rodape-links">Ainda não tem conta? <a href="#/cadastro"><strong>Teste grátis por ${App.estado?.trialDias || 30} dias</strong></a></p>`));
  ligarFormulario(raiz, async (d) => { await entrouComSucesso(await api.post('auth/entrar', d)); }, 'Entrando…');
}

function cadastro(raiz) {
  const dias = App.estado?.trialDias || 30;
  montar(raiz, moldura(html`<h1>Crie sua conta grátis</h1>
    <p class="suave">Agenda, pacientes e financeiro do seu consultório em um só lugar. Teste grátis por ${dias} dias, sem cartão.</p>
    <form novalidate><p class="erro-form" role="alert" hidden></p>
      <div class="campo"><label for="nome">Seu nome <span class="obrig">*</span></label><input id="nome" name="nome" autocomplete="name" required maxlength="120"></div>
      <div class="campo"><label for="consultorio">Nome do consultório</label><input id="consultorio" name="consultorio" maxlength="120" placeholder="Opcional"></div>
      <div class="campo"><label for="email">E-mail <span class="obrig">*</span></label><input id="email" name="email" type="email" autocomplete="email" required maxlength="160"></div>
      <div class="campo"><label for="senha">Senha <span class="obrig">*</span></label><input id="senha" name="senha" type="password" autocomplete="new-password" required minlength="8"><small class="ajuda">Pelo menos 8 caracteres.</small></div>
      <label class="marca"><input type="checkbox" name="aceite" required><span>Li e aceito os <a href="termos.html" target="_blank" rel="noopener">termos de uso</a> e a <a href="privacidade.html" target="_blank" rel="noopener">política de privacidade</a>.</span></label>
      <button class="btn btn-pri btn-bloco" type="submit">Criar minha conta</button></form>
    <p class="rodape-links">Já tem conta? <a href="#/entrar">Entrar</a></p>
    <div class="selos-confianca"><span>Seus dados são só seus</span><span>Sem anotações clínicas</span><span>Exporte quando quiser</span></div>`));
  ligarFormulario(raiz, async (d) => { await entrouComSucesso(await api.post('auth/cadastro', d)); }, 'Criando…');
}

function esqueci(raiz) {
  montar(raiz, moldura(html`<h1>Recuperar senha</h1>
    <p class="suave">Informe o e-mail da conta. Se ele estiver cadastrado, enviaremos um link para escolher uma nova senha.</p>
    <form novalidate><p class="erro-form" role="alert" hidden></p><div class="campo"><label for="email">E-mail</label><input id="email" name="email" type="email" autocomplete="email" required></div>
      <button class="btn btn-pri btn-bloco" type="submit">Enviar link</button></form>
    <p class="rodape-links"><a href="#/entrar">Voltar para entrar</a></p>`));
  ligarFormulario(raiz, async (d) => {
    const r = await api.post('auth/esqueci', { email: d.email });
    montar(raiz, moldura(html`<h1>Verifique seu e-mail</h1><p>${r.message}</p><p class="suave peq">O link vale por 1 hora. Se não chegar, olhe também a caixa de spam.</p><a class="btn btn-sec btn-bloco" href="#/entrar">Voltar para entrar</a>`));
  }, 'Enviando…');
}

function redefinir(raiz, args) {
  const token = args[0] || '';
  montar(raiz, moldura(html`<h1>Escolha uma nova senha</h1>
    <form novalidate><p class="erro-form" role="alert" hidden></p><div class="campo"><label for="senha">Nova senha</label><input id="senha" name="senha" type="password" autocomplete="new-password" required minlength="8"><small class="ajuda">Pelo menos 8 caracteres.</small></div>
      <button class="btn btn-pri btn-bloco" type="submit">Salvar nova senha</button></form>`));
  ligarFormulario(raiz, async (d) => {
    await api.post('auth/redefinir', { token, senha: d.senha });
    montar(raiz, moldura(html`<h1>Senha alterada</h1><p>Pronto! Agora é só entrar com a nova senha.</p><a class="btn btn-pri btn-bloco" href="#/entrar">Entrar</a>`));
  }, 'Salvando…');
}

export async function verificar(raiz, token) {
  montar(raiz, moldura(html`<h1>Confirmando seu e-mail…</h1>`));
  let ok = false; let msg = '';
  try { await api.post('auth/verificar', { token: token || '' }); ok = true; } catch (e) { msg = e.message; }
  if (ok && App.eu) App.eu.usuario.verificado = true;
  montar(raiz, moldura(ok ? html`<h1>E-mail confirmado</h1><p>Obrigado! Seu e-mail foi confirmado.</p><a class="btn btn-pri btn-bloco" href="#/${App.eu ? 'inicio' : 'entrar'}">Continuar</a>`
    : html`<h1>Não foi possível confirmar</h1><p>${msg}</p><a class="btn btn-sec btn-bloco" href="#/${App.eu ? 'inicio' : 'entrar'}">Continuar</a>`));
}
