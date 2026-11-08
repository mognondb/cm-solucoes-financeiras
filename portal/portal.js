(function () {
  'use strict';

  // API própria do site (PHP + MySQL na Hostinger, mesma origem).
  const API_URL = '';

  let authHeader = localStorage.getItem('cm_admin_auth') || sessionStorage.getItem('cm_admin_auth') || '';
  let papelSessao = localStorage.getItem('cm_admin_papel') || sessionStorage.getItem('cm_admin_papel') || 'admin';

  function limparSessaoSalva() {
    ['cm_admin_auth', 'cm_admin_papel', 'cm_admin_cliente_id', 'cm_admin_relatorio_id'].forEach((k) => {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  // ---------- Login ----------

  const loginScreen = document.getElementById('loginScreen');
  const painel = document.getElementById('painel');
  const loginForm = document.getElementById('loginForm');
  const userInput = document.getElementById('userInput');
  const passInput = document.getElementById('passInput');
  const loginFeedback = document.getElementById('loginFeedback');
  const btnEntrar = document.getElementById('btnEntrar');

  // Quem só tem acesso a um cliente ou a um relatório específico não precisa
  // ver esta lista — vai direto pro lugar dele.
  function redirecionarPorPapel(dadosSessao) {
    if (dadosSessao.papel === 'cliente' && dadosSessao.clienteId) {
      location.href = `cliente.html?id=${encodeURIComponent(dadosSessao.clienteId)}`;
      return true;
    }
    if (dadosSessao.papel === 'dashboard' && dadosSessao.relatorioId) {
      location.href = `relatorio.html?id=${encodeURIComponent(dadosSessao.relatorioId)}`;
      return true;
    }
    return false;
  }

  async function tentarEntrar(e) {
    e.preventDefault();
    btnEntrar.disabled = true;
    loginFeedback.textContent = 'Verificando...';
    loginFeedback.className = 'admin-feedback';

    const tentativaAuth = `Basic ${btoa(`${userInput.value.trim()}:${passInput.value}`)}`;
    try {
      const res = await fetch(`${API_URL}/api/login`, { headers: { Authorization: tentativaAuth } });
      if (res.status === 401) throw new Error('Usuário ou senha inválidos.');
      if (!res.ok) throw new Error(`Não foi possível falar com o servidor (HTTP ${res.status}).`);
      const dadosSessao = await res.json().catch(() => ({}));

      authHeader = tentativaAuth;
      papelSessao = dadosSessao.papel || 'admin';
      const armazenamento = document.getElementById('manterConectado')?.checked ? localStorage : sessionStorage;
      armazenamento.setItem('cm_admin_auth', authHeader);
      armazenamento.setItem('cm_admin_papel', papelSessao);
      if (dadosSessao.clienteId) armazenamento.setItem('cm_admin_cliente_id', dadosSessao.clienteId);
      if (dadosSessao.relatorioId) armazenamento.setItem('cm_admin_relatorio_id', dadosSessao.relatorioId);

      if (redirecionarPorPapel(dadosSessao)) return;

      loginScreen.hidden = true;
      iniciar();
    } catch (err) {
      loginFeedback.textContent = err instanceof TypeError
        ? `Não foi possível conectar ao servidor (${err.message}).`
        : err.message;
      loginFeedback.className = 'admin-feedback error';
    } finally {
      btnEntrar.disabled = false;
    }
  }
  loginForm.addEventListener('submit', tentarEntrar);

  document.getElementById('btnSair').addEventListener('click', () => {
    authHeader = '';
    limparSessaoSalva();
    painel.hidden = true;
    loginScreen.hidden = false;
  });

  async function apiGet(path) {
    const res = await fetch(`${API_URL}${path}`, { headers: { Authorization: authHeader } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || `Erro (HTTP ${res.status})`);
    return body;
  }

  function iniciar() {
    painel.hidden = false;
    document.getElementById('linkAdmin').hidden = papelSessao !== 'admin';
    carregarClientes();
  }

  if (authHeader) {
    const clienteIdSalvo = localStorage.getItem('cm_admin_cliente_id') || sessionStorage.getItem('cm_admin_cliente_id');
    const relatorioIdSalvo = localStorage.getItem('cm_admin_relatorio_id') || sessionStorage.getItem('cm_admin_relatorio_id');
    if (!redirecionarPorPapel({ papel: papelSessao, clienteId: clienteIdSalvo, relatorioId: relatorioIdSalvo })) {
      loginScreen.hidden = true;
      iniciar();
    }
  }

  document.getElementById('btnRecarregar').addEventListener('click', carregarClientes);

  // ---------- Lista de clientes ----------

  function feedbackEl() { return document.getElementById('feedbackLista'); }

  async function carregarClientes() {
    const lista = document.getElementById('listaClientes');
    lista.innerHTML = '<p class="loading-placeholder">Carregando...</p>';
    feedbackEl().textContent = '';
    feedbackEl().className = 'admin-feedback';
    try {
      const clientes = await apiGet('/api/clientes');
      if (!clientes.length) {
        lista.innerHTML = '<p class="loading-placeholder">Nenhum cliente cadastrado ainda.</p>';
        return;
      }
      lista.innerHTML = clientes
        .slice()
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
        .map((c) => `
          <a class="admin-item" href="cliente.html?id=${encodeURIComponent(c.id)}" style="text-decoration:none; color:inherit;">
            <div class="admin-item-info">
              <h4>${escapeHtml(c.nome)}</h4>
              <p>${c.qtdRelatorios || 0} relatório${c.qtdRelatorios === 1 ? '' : 's'} cadastrado${c.qtdRelatorios === 1 ? '' : 's'}</p>
            </div>
            <div class="admin-item-actions">
              <span class="btn btn-ghost btn-sm">Abrir →</span>
            </div>
          </a>`).join('');
    } catch (err) {
      lista.innerHTML = '';
      feedbackEl().textContent = err.message;
      feedbackEl().className = 'admin-feedback error';
    }
  }
})();
