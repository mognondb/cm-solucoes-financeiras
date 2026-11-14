/* Aba "Consultório" do painel administrativo: abre a plataforma do consultório (CM Consultório), controla se ela está restrita
   à equipe ou aberta ao público e acompanha as contas e os testes grátis. Fala com /consultorio/api/admin/* usando a mesma
   credencial (HTTP Basic) que o painel já guarda no navegador. */
(function () {
  'use strict';
  var painel = document.getElementById('tab-consultorio');
  var aba = document.querySelector('.admin-tab[data-tab="consultorio"]');
  if (!painel || !aba) return;

  var API = '/consultorio/api/';
  function credencial() { return localStorage.getItem('cm_admin_auth') || sessionStorage.getItem('cm_admin_auth') || ''; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function chamar(metodo, rota, corpo) {
    return fetch(API + rota, { method: metodo, headers: { Authorization: credencial(), 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined, credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.message || 'Erro ' + r.status); return d; }); });
  }
  function dataBR(iso) { return iso ? String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) + '/' + String(iso).slice(0, 4) : ''; }

  var PLANOS = { teste: 'Teste grátis', ativo: 'Ativa', expirado: 'Teste encerrado', suspenso: 'Suspensa' };

  function desenhar(resumo, contas) {
    var aberto = resumo.acesso === 'aberto';
    painel.innerHTML =
      '<p class="admin-field-hint" style="margin-bottom:16px;">CM Consultório: agenda, pacientes e financeiro para consultórios de psicologia. ' +
      'Enquanto estiver <strong>restrito</strong>, só quem entra por esta aba consegue usar. A plataforma não aparece no site.</p>' +
      '<div class="admin-card" style="padding:18px;border:1px solid #ebe6dc;border-radius:14px;background:#fff;margin-bottom:18px">' +
      '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;justify-content:space-between">' +
      '<div><strong>Acesso: ' + (aberto ? '<span style="color:#a8472f">ABERTO AO PÚBLICO</span>' : 'restrito à equipe da CM') + '</strong><br>' +
      '<span class="admin-field-hint" style="margin:0">' + resumo.contas.total + ' conta(s): ' + resumo.contas.teste + ' em teste, ' + resumo.contas.ativo + ' ativa(s), ' + resumo.contas.expirado + ' com teste encerrado · ' + resumo.pacientes + ' paciente(s) cadastrados</span></div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" id="psiAbrir">Abrir a plataforma</button>' +
      '<button class="btn btn-outline btn-sm" id="psiAlternar">' + (aberto ? 'Voltar para restrito' : 'Abrir ao público…') + '</button></div></div>' +
      '<div style="margin-top:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><label for="psiDias" style="font-size:.85rem">Dias de teste grátis para novas contas:</label>' +
      '<input type="number" id="psiDias" min="1" max="365" value="' + esc(resumo.trialDias) + '" style="width:80px;padding:6px 8px">' +
      '<button class="btn btn-ghost btn-sm" id="psiDiasSalvar">Salvar</button></div>' +
      '<p class="admin-feedback" id="psiFeedback" role="status"></p></div>' +
      '<h3 style="margin:0 0 10px;font-size:1.05rem">Contas</h3>' +
      (contas.length ? '<div class="admin-lista">' + contas.map(function (c) {
        return '<div class="admin-item"><div class="admin-item-info"><h4>' + esc(c.nome) + ' <small>— ' + esc(c.email || 'sem e-mail') + '</small></h4>' +
          '<p>' + esc(PLANOS[c.plano] || c.plano) + (c.plano === 'teste' && c.trial_ate ? ' até ' + dataBR(c.trial_ate) : '') + ' · criada em ' + dataBR(String(c.criado_em).slice(0, 10)) + ' · ' + c.pacientes + ' paciente(s), ' + c.agendamentos + ' agendamento(s)</p></div>' +
          '<div class="admin-item-actions"><select data-conta="' + esc(c.id) + '" aria-label="Plano da conta">' + Object.keys(PLANOS).map(function (k) { return '<option value="' + k + '"' + (k === c.plano ? ' selected' : '') + '>' + PLANOS[k] + '</option>'; }).join('') + '</select></div></div>';
      }).join('') + '</div>' : '<p class="loading-placeholder">Nenhuma conta ainda.</p>');
  }

  function aviso(msg, erro) { var f = document.getElementById('psiFeedback'); if (f) { f.textContent = msg; f.style.color = erro ? '#a8472f' : ''; } }

  function carregar() {
    painel.innerHTML = '<p class="loading-placeholder">Carregando…</p>';
    Promise.all([chamar('GET', 'admin/resumo'), chamar('GET', 'admin/contas')]).then(function (r) { desenhar(r[0], r[1].itens); })
      .catch(function (e) { painel.innerHTML = '<p class="admin-feedback" style="color:#a8472f">Não foi possível carregar: ' + esc(e.message) + '</p>'; });
  }

  painel.addEventListener('click', function (e) {
    var t = e.target.closest('button'); if (!t) return;
    if (t.id === 'psiAbrir') {
      var janela = window.open('', '_blank'); // abre já (antes do fetch) para o navegador não bloquear
      chamar('POST', 'restrito/entrar', {}).then(function () { if (janela) janela.location.href = '/consultorio/'; else window.location.href = '/consultorio/'; })
        .catch(function (er) { if (janela) janela.close(); aviso(er.message, true); });
    } else if (t.id === 'psiAlternar') {
      var abrir = t.textContent.indexOf('Abrir ao público') === 0;
      if (abrir && !window.confirm('Abrir a plataforma ao público? Qualquer pessoa com o endereço poderá criar uma conta e usar o teste grátis. Confirme só quando estiver pronta para o lançamento.')) return;
      chamar('POST', 'admin/acesso', { acesso: abrir ? 'aberto' : 'restrito' }).then(carregar).catch(function (er) { aviso(er.message, true); });
    } else if (t.id === 'psiDiasSalvar') {
      chamar('POST', 'admin/trial', { dias: Number(document.getElementById('psiDias').value) }).then(function () { aviso('Salvo.'); }).catch(function (er) { aviso(er.message, true); });
    }
  });
  painel.addEventListener('change', function (e) {
    var s = e.target.closest('select[data-conta]'); if (!s) return;
    chamar('POST', 'admin/contas/' + s.getAttribute('data-conta'), { plano: s.value }).then(function () { aviso('Plano atualizado.'); }).catch(function (er) { aviso(er.message, true); carregar(); });
  });
  aba.addEventListener('click', carregar);
})();
