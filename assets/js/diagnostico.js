/* ==========================================================================
   CM Diagnóstico — percurso (uma pergunta por tela), simulação, contato e relatório.
   Depende de diagnostico-dados.js, -recs.js, -motor.js e -relatorio.js.
   ========================================================================== */
(function () {
  'use strict';
  var D = window.CMDiag;
  var raiz = document.getElementById('dg-app');
  if (!raiz || !D) return;

  var esc = D.esc;
  var CHAVE = 'cm_diag_v1';
  var DIAS = 14;
  var estado = { r: {}, vista: 'intro', q: null, sim: false, resultado: null, enviado: false, falhaEnvio: false };
  var timer = null;
  var aguardandoPop = false;

  /* ------------------------------------------------------------------ persistência (opcional: nunca pode quebrar) */
  function guardar() {
    if (estado.sim) return;
    try {
      if (estado.vista === 'intro' || estado.vista === 'relatorio') return;
      localStorage.setItem(CHAVE, JSON.stringify({ r: estado.r, vista: estado.vista, q: estado.q, ts: Date.now() }));
    } catch (e) { /* sem armazenamento: segue sem retomada */ }
  }
  function lerSalvo() {
    try {
      var s = JSON.parse(localStorage.getItem(CHAVE) || 'null');
      if (!s || !s.r || !s.r.segmento || Date.now() - s.ts > DIAS * 864e5) return null;
      return s;
    } catch (e) { return null; }
  }
  function limparSalvo() { try { localStorage.removeItem(CHAVE); } catch (e) { /* ok */ } }

  /* ------------------------------------------------------------------ navegação */
  function seq() { return D.sequencia(estado.r); }
  function qAtual() { return D.pergunta(estado.q); }
  function indice(q) { var s = seq(); for (var i = 0; i < s.length; i++) if (s[i].id === q.id) return i; return -1; }

  function ir(vista, qid, empurrar) {
    estado.vista = vista; estado.q = qid || null;
    desenhar();
    guardar();
    if (empurrar !== false) { try { history.pushState({ dg: 1 }, ''); } catch (e) { /* ok */ } }
  }
  function aposUltima() { if (estado.sim) mostrarRelatorio(); else ir('contato'); }

  function avancar() {
    var q = qAtual(); if (!q || !D.respondida(q, estado.r)) return;
    var s = seq(), i = indice(q), prox = s[i + 1];
    if (q.etapa === 1 && (!prox || prox.etapa !== 1)) return ir('perfil');
    if (prox) return ir('q', prox.id);
    aposUltima();
  }
  function recuar(semHistorico) {
    var s = seq(), v = estado.vista, alvo;
    if (v === 'q') { var i = indice(qAtual()); alvo = i > 0 ? ['q', s[i - 1].id] : ['intro']; }
    else if (v === 'perfil') alvo = ['q', s.filter(function (q) { return q.etapa === 1; }).pop().id];
    else if (v === 'contato') alvo = ['q', s[s.length - 1].id];
    else alvo = ['intro'];
    ir(alvo[0], alvo[1], false);
  }

  function comecar() { estado = { r: {}, vista: 'q', q: 'segmento', sim: false, resultado: null, enviado: false, falhaEnvio: false }; limparSalvo(); ir('q', 'segmento'); }
  function iniciarSimulacao() {
    estado = { r: JSON.parse(JSON.stringify(D.EXEMPLO)), vista: 'perfil', q: null, sim: true, resultado: null, enviado: false, falhaEnvio: false };
    ir('perfil');
  }
  function retomar() {
    var s = lerSalvo(); if (!s) return comecar();
    estado = { r: s.r, vista: s.vista, q: s.q, sim: false, resultado: null, enviado: false, falhaEnvio: false };
    var q = estado.vista === 'q' ? D.pergunta(estado.q) : null;
    if (estado.vista === 'q' && (!q || seq().indexOf(q) === -1)) {
      var primeira = seq().filter(function (x) { return !D.respondida(x, estado.r); })[0];
      estado.q = primeira ? primeira.id : 'segmento';
    }
    ir(estado.vista, estado.q);
  }
  function mostrarRelatorio() {
    estado.resultado = D.analisar(estado.r);
    ir('relatorio');
  }

  /* ------------------------------------------------------------------ peças de HTML */
  function etapaAtual() {
    if (estado.vista === 'contato' || estado.vista === 'relatorio') return 6;
    if (estado.vista === 'perfil') return 2;
    var q = qAtual(); return q ? q.etapa : 1;
  }
  function tituloEtapa(e) {
    if (e.id !== 3) return e.titulo;
    var s = D.SEGMENTOS.filter(function (x) { return x.id === estado.r.segmento; })[0];
    return s && s.id !== 'outro' ? 'Operação e custos específicos de ' + s.rotulo.toLowerCase() : 'Operação e custos do seu negócio';
  }
  function topo(atual) {
    var s = seq(), feitas = s.filter(function (q) { return D.respondida(q, estado.r); }).length;
    var largura = Math.min(100, Math.round((feitas / (s.length + 1)) * 100));
    return '<div class="dg-topo">'
      + '<ol class="dg-passos" aria-label="Etapas do diagnóstico">' + D.ETAPAS.map(function (e) {
        var cl = e.id < atual ? 'ok' : e.id === atual ? 'atual' : '';
        return '<li class="' + cl + '"' + (e.id === atual ? ' aria-current="step"' : '') + '><span class="dg-passo-n">' + (e.id < atual ? '✓' : e.id) + '</span><span class="dg-passo-t">' + esc(e.nome) + '</span></li>';
      }).join('') + '</ol>'
      + '<div class="dg-prog" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + largura + '" aria-label="Progresso"><span style="width:' + largura + '%"></span></div></div>';
  }
  function bannerSim() {
    return estado.sim ? '<div class="dg-sim" role="note"><p><strong>Modo simulação.</strong> Respostas demonstrativas, editáveis. Não representam dados reais do negócio e nada é enviado à CM.</p>'
      + '<div><button type="button" class="dg-link" data-acao="pular-sim">Ir direto ao relatório de exemplo</button><button type="button" class="dg-link" data-acao="sair-sim">Sair da simulação</button></div></div>' : '';
  }
  function opcao(q, o, atual, multi) {
    var marcado = multi ? (Array.isArray(atual) && atual.indexOf(o.v) !== -1) : atual === o.v;
    return '<label class="dg-op' + (o.v === 'ns' ? ' dg-op-ns' : '') + '"><input type="' + (multi ? 'checkbox' : 'radio') + '" name="dgq" value="' + esc(o.v) + '"' + (marcado ? ' checked' : '') + '>'
      + '<span class="dg-op-marca" aria-hidden="true"></span><span class="dg-op-t">' + esc(o.t) + (o.d ? '<small>' + esc(o.d) + '</small>' : '') + '</span></label>';
  }

  /* ------------------------------------------------------------------ telas */
  function telaIntro() {
    var salvo = lerSalvo();
    var an = D.ANALISES;
    return '<section class="dg-intro">'
      + '<p class="dg-eyebrow">CM Diagnóstico</p>'
      + '<h1 id="dg-foco" tabindex="-1">Descubra a saúde financeira do seu negócio</h1>'
      + '<p class="dg-lead">Uma análise gratuita, adaptada ao seu segmento, em cerca de 6 minutos. Você não precisa de balanço, DRE nem planilha: faixas aproximadas bastam.</p>'
      + '<div class="dg-intro-tres">'
      + [['saude', 'Saúde financeira'], ['maturidade', 'Maturidade de gestão'], ['eficiencia', 'Eficiência operacional']].map(function (x) {
        return '<div><h3>' + esc(an[x[0]].nome) + '</h3><p>' + esc(x[0] === 'eficiencia' ? 'Onde a operação do seu segmento ganha ou perde margem.' : an[x[0]].desc) + '</p></div>';
      }).join('') + '</div>'
      + '<div class="dg-intro-acoes">'
      + '<button type="button" class="btn btn-primary" data-acao="comecar">Começar o diagnóstico</button>'
      + (salvo ? '<button type="button" class="btn btn-outline" data-acao="retomar">Continuar de onde parei</button>' : '')
      + '<button type="button" class="dg-link" data-acao="exemplo">Ver um exemplo (simulação com um negócio de alimentação)</button></div>'
      + '<p class="dg-nota-intro">Usamos suas respostas só para montar a análise e para a CM entrar em contato, se você quiser. Não pedimos dados bancários.</p>'
      + '</section>';
  }

  function telaPergunta() {
    var q = qAtual(), r = estado.r, e = D.ETAPAS[q.etapa - 1];
    var ops = D.opcoesDe(q, r), multi = q.tipo === 'multipla', atual = r[q.id];
    var corpo;
    if (q.tipo === 'texto') {
      corpo = '<textarea name="dgq" rows="3" maxlength="300" placeholder="Ex.: confecção de roupas, serviços de limpeza...">' + esc(atual || '') + '</textarea>';
    } else {
      corpo = '<div class="dg-ops" role="' + (multi ? 'group' : 'radiogroup') + '" aria-labelledby="dg-foco">' + ops.map(function (o) { return opcao(q, o, atual, multi); }).join('') + '</div>';
    }
    var ajuda = D.ajudaDe(q, r);
    var pode = D.respondida(q, r);
    return topo(q.etapa) + bannerSim()
      + '<section class="dg-etapa"><p class="dg-etapa-t">Etapa ' + q.etapa + ' de 6 · ' + esc(tituloEtapa(e)) + '</p><p class="dg-etapa-p">' + esc(e.texto) + '</p></section>'
      + '<section class="dg-q"><h2 id="dg-foco" tabindex="-1">' + esc(D.tituloDe(q, r)) + '</h2>'
      + (ajuda ? '<p class="dg-ajuda">' + esc(ajuda) + '</p>' : '')
      + (multi ? '<p class="dg-ajuda dg-ajuda-multi">Marque uma ou mais opções.</p>' : '')
      + corpo
      + '<div class="dg-acoes"><button type="button" class="btn btn-ghost" data-acao="voltar">Voltar</button>'
      + '<button type="button" class="btn btn-primary" data-acao="continuar"' + (pode ? '' : ' disabled') + '>' + (q.tipo === 'texto' && !atual ? 'Pular' : 'Continuar') + '</button></div></section>';
  }

  var TOPICOS = {
    alimentacao: 'custo dos ingredientes, desperdício, formação de preços, vendas diárias, despesas fixas e disponibilidade de caixa',
    saude: 'precificação do atendimento, faltas e agenda, custos por atendimento e recebimento de convênios',
    estetica: 'consumo de produtos, custo de cada serviço, ocupação da agenda e comissões',
    comercio: 'estoque, giro dos produtos, compras e formação do preço de venda',
    servicos: 'custo da hora, rentabilidade por projeto, dependência de poucos clientes e recebimentos',
    outro: 'custos diretos, formação de preço e acompanhamento dos resultados',
  };
  function telaPerfil() {
    var res = D.analisar(estado.r), r = estado.r;
    var seg = D.SEGMENTOS.filter(function (s) { return s.id === r.segmento; })[0];
    var linhas = [];
    if (r.equipe === 'solo') linhas.push('Como o negócio é tocado só por você, não vamos perguntar sobre funcionários nem sobre folha de pagamento.');
    else linhas.push('Como há equipe, incluímos uma pergunta sobre a folha de pagamento' + (r.segmento === 'saude' || r.segmento === 'estetica' ? ' e outra sobre repasses ou comissões dos profissionais' : '') + '.');
    linhas.push('Na etapa 3 vamos investigar o que mais pesa na saúde financeira de um negócio' + (seg && seg.id !== 'outro' ? ' de ' + seg.rotulo.toLowerCase() : '') + ': ' + TOPICOS[r.segmento || 'outro'] + '.');
    linhas.push('Algumas perguntas só aparecem se as suas respostas indicarem que fazem sentido. Ninguém responde tudo.');
    return topo(2) + bannerSim()
      + '<section class="dg-perfil-tela"><p class="dg-eyebrow">Perfil identificado</p><h2 id="dg-foco" tabindex="-1">Vamos adaptar o percurso a este perfil</h2>'
      + '<table class="dg-tab"><thead><tr><th>Campo</th><th>Resposta</th></tr></thead><tbody>'
      + res.perfil.map(function (p) { return '<tr><th scope="row">' + esc(p.rotulo) + '</th><td>' + esc(p.valor) + '</td></tr>'; }).join('') + '</tbody></table>'
      + '<p class="dg-ajuda">As perguntas seguintes serão adaptadas a esse perfil:</p><ul class="dg-lista">' + linhas.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>'
      + '<div class="dg-acoes"><button type="button" class="btn btn-ghost" data-acao="voltar">Voltar</button><button type="button" class="btn btn-primary" data-acao="continuar-perfil">Continuar</button></div></section>';
  }

  function telaContato() {
    var c = estado.contato || {};
    return topo(6)
      + '<section class="dg-contato"><p class="dg-eyebrow">Seu relatório está pronto</p><h2 id="dg-foco" tabindex="-1">Para quem enviamos o resultado?</h2>'
      + '<p class="dg-ajuda">Informe seus dados para ver o relatório. A CM recebe o seu resultado e pode conversar com você sobre ele, sem compromisso.</p>'
      + '<form id="dg-form" novalidate>'
      + '<div class="dg-campo"><label for="dg-nome">Nome *</label><input id="dg-nome" name="nome" type="text" autocomplete="name" required maxlength="120" value="' + esc(c.nome) + '"></div>'
      + '<div class="dg-campo"><label for="dg-email">E-mail *</label><input id="dg-email" name="email" type="email" autocomplete="email" required maxlength="160" value="' + esc(c.email) + '"></div>'
      + '<div class="dg-campo"><label for="dg-tel">WhatsApp *</label><input id="dg-tel" name="telefone" type="tel" autocomplete="tel" inputmode="tel" required maxlength="40" placeholder="(00) 00000-0000" value="' + esc(c.telefone) + '"></div>'
      + '<div class="dg-campo"><label for="dg-empresa">Empresa</label><input id="dg-empresa" name="empresa" type="text" autocomplete="organization" maxlength="120" value="' + esc(c.empresa) + '"></div>'
      + '<div class="dg-armadilha" aria-hidden="true"><label>Não preencha<input name="website" type="text" tabindex="-1" autocomplete="off"></label></div>'
      + '<label class="dg-consent"><input type="checkbox" name="consentimento" required><span>Concordo em ser contatado(a) pela CM Soluções Financeiras e autorizo o uso dos meus dados e das minhas respostas para essa finalidade.</span></label>'
      + '<p class="dg-erro" id="dg-erro" role="alert" hidden></p>'
      + '<div class="dg-acoes"><button type="button" class="btn btn-ghost" data-acao="voltar">Voltar</button>'
      + '<button type="submit" class="btn btn-primary" id="dg-enviar">Ver meu relatório</button></div>'
      + (estado.falhaEnvio ? '<p class="dg-erro-alt"><button type="button" class="dg-link" data-acao="ver-sem-enviar">Ver o relatório mesmo assim</button></p>' : '')
      + '</form></section>';
  }

  function telaRelatorio() {
    var aviso = '';
    if (!estado.sim && !estado.enviado) {
      aviso = '<div class="dg-aviso-envio" role="alert"><p>Não conseguimos registrar o seu contato agora, mas o relatório está aqui.</p><button type="button" class="dg-link" data-acao="reenviar">Tentar enviar de novo</button></div>';
    }
    var acoes = '<div class="dg-rel-acoes"><button type="button" class="btn btn-outline" data-acao="imprimir">Salvar em PDF ou imprimir</button>'
      + (estado.sim ? '<button type="button" class="btn btn-primary" data-acao="comecar">Fazer o meu diagnóstico</button>' : '<button type="button" class="dg-link" data-acao="refazer">Refazer o diagnóstico</button>') + '</div>';
    return '<div class="dg-relatorio">' + aviso + '<h1 id="dg-foco" tabindex="-1" class="dg-sr">Relatório do CM Diagnóstico</h1>'
      + D.relatorioHtml(estado.resultado, { simulacao: estado.sim, cta: !estado.sim }) + acoes + '</div>';
  }

  function desenhar() {
    var v = estado.vista, h;
    raiz.setAttribute('data-vista', v);
    if (v === 'intro') h = telaIntro();
    else if (v === 'perfil') h = telaPerfil();
    else if (v === 'contato') h = telaContato();
    else if (v === 'relatorio') h = telaRelatorio();
    else h = telaPergunta();
    raiz.innerHTML = h;
    var foco = document.getElementById('dg-foco');
    if (foco && v !== 'intro') {
      var y = raiz.getBoundingClientRect().top + window.pageYOffset - 84;
      if (window.pageYOffset > y) window.scrollTo(0, Math.max(0, y));
      try { foco.focus({ preventScroll: true }); } catch (e) { /* ok */ }
    }
  }

  /* ------------------------------------------------------------------ envio */
  function enviar(contato) {
    var res = estado.resultado || D.analisar(estado.r);
    estado.resultado = res;
    var corpo = {
      versao: 2, modelo: D.VERSAO_MODELO, nome: contato.nome, email: contato.email, telefone: contato.telefone, empresa: contato.empresa,
      consentimento: true, website: contato.website || '', segmento: estado.r.segmento,
      respostas: D.respostasAplicaveis(estado.r), resultado: res,
    };
    return fetch('/api/diagnostico', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
      .then(function (resp) { return resp.json().catch(function () { return {}; }).then(function (b) { if (!resp.ok) throw new Error(b.message || 'Não foi possível enviar agora.'); return true; }); });
  }

  function submeter(form) {
    var d = {};
    new FormData(form).forEach(function (v, k) { d[k] = String(v).trim(); });
    var erro = document.getElementById('dg-erro');
    function falha(m, campo) { erro.textContent = m; erro.hidden = false; var el = form.querySelector('[name="' + campo + '"]'); if (el) el.focus(); }
    erro.hidden = true;
    if (!d.nome) return falha('Informe o seu nome.', 'nome');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email || '')) return falha('Informe um e-mail válido.', 'email');
    if ((d.telefone || '').replace(/\D/g, '').length < 10) return falha('Informe um WhatsApp com DDD.', 'telefone');
    if (!form.querySelector('[name="consentimento"]').checked) return falha('Para continuar, é preciso concordar com o contato.', 'consentimento');
    estado.contato = d;
    var btn = document.getElementById('dg-enviar'); btn.disabled = true; btn.textContent = 'Enviando...';
    estado.resultado = D.analisar(estado.r);
    enviar(d).then(function () {
      estado.enviado = true; estado.falhaEnvio = false; limparSalvo(); ir('relatorio');
    }).catch(function (err) {
      btn.disabled = false; btn.textContent = 'Ver meu relatório';
      estado.falhaEnvio = true;
      erro.textContent = (err instanceof TypeError ? 'Não foi possível conectar ao servidor agora.' : err.message) + ' Você pode tentar de novo ou ver o relatório mesmo assim.';
      erro.hidden = false;
      if (!document.querySelector('.dg-erro-alt')) {
        document.querySelector('#dg-form .dg-acoes').insertAdjacentHTML('afterend', '<p class="dg-erro-alt"><button type="button" class="dg-link" data-acao="ver-sem-enviar">Ver o relatório mesmo assim</button></p>');
      }
    });
  }

  /* ------------------------------------------------------------------ eventos */
  function responder(el) {
    var q = qAtual(); if (!q) return;
    if (q.tipo === 'multipla') {
      estado.r[q.id] = Array.prototype.map.call(raiz.querySelectorAll('input[name="dgq"]:checked'), function (i) { return i.value; });
    } else if (q.tipo === 'texto') estado.r[q.id] = el.value;
    else estado.r[q.id] = el.value;
    guardar();
    var b = raiz.querySelector('[data-acao="continuar"]');
    if (b) { b.disabled = !D.respondida(q, estado.r); if (q.tipo === 'texto') b.textContent = estado.r[q.id] ? 'Continuar' : 'Pular'; }
  }

  raiz.addEventListener('change', function (e) { if (e.target.name === 'dgq' && e.target.type !== 'textarea') responder(e.target); });
  raiz.addEventListener('input', function (e) { if (e.target.name === 'dgq' && e.target.tagName === 'TEXTAREA') responder(e.target); });
  raiz.addEventListener('submit', function (e) { if (e.target.id === 'dg-form') { e.preventDefault(); submeter(e.target); } });
  raiz.addEventListener('click', function (e) {
    var b = e.target.closest('[data-acao]');
    if (b) return acao(b.getAttribute('data-acao'));
    /* toque ou clique do mouse numa opção única avança sozinho; teclado (setas, espaço) não, para não pular perguntas */
    var lab = e.target.closest('label.dg-op'), q = qAtual();
    if (lab && q && q.tipo === 'unica' && e.target.tagName !== 'INPUT' && e.detail > 0) {
      clearTimeout(timer);
      timer = setTimeout(function () { if (estado.vista === 'q' && qAtual() === q && D.respondida(q, estado.r)) avancar(); }, 280);
    }
  });

  function acao(a) {
    clearTimeout(timer);
    if (a === 'comecar') comecar();
    else if (a === 'retomar') retomar();
    else if (a === 'exemplo') iniciarSimulacao();
    else if (a === 'voltar') {
      /* usa o histórico do navegador para a pilha ficar em dia; se ele não responder (sem entrada anterior), volta direto */
      aguardandoPop = true;
      try { history.back(); } catch (e) { /* cai no tempo abaixo */ }
      setTimeout(function () { if (aguardandoPop) { aguardandoPop = false; recuar(); } }, 200);
    }
    else if (a === 'continuar') avancar();
    else if (a === 'continuar-perfil') { var s = seq(); var primeira = s.filter(function (q) { return q.etapa > 1; })[0]; if (primeira) ir('q', primeira.id); else aposUltima(); }
    else if (a === 'pular-sim') mostrarRelatorio();
    else if (a === 'sair-sim') { estado = { r: {}, vista: 'intro', q: null, sim: false, resultado: null, enviado: false, falhaEnvio: false }; ir('intro'); }
    else if (a === 'ver-sem-enviar') { estado.enviado = false; mostrarRelatorio(); }
    else if (a === 'reenviar') {
      enviar(estado.contato || {}).then(function () { estado.enviado = true; limparSalvo(); desenhar(); }).catch(function () { /* mantém o aviso */ });
    }
    else if (a === 'imprimir') window.print();
    else if (a === 'refazer') { estado = { r: {}, vista: 'intro', q: null, sim: false, resultado: null, enviado: false, falhaEnvio: false }; ir('intro'); }
  }

  /* botão Voltar do navegador = voltar uma pergunta */
  window.addEventListener('popstate', function () {
    clearTimeout(timer);
    aguardandoPop = false;
    if (estado.vista === 'intro') return;
    if (estado.vista === 'relatorio') { estado.vista = 'intro'; desenhar(); return; }
    recuar(true);
  });

  window.addEventListener('beforeprint', function () {
    Array.prototype.forEach.call(raiz.querySelectorAll('details'), function (d) { d.open = true; });
  });

  /* ------------------------------------------------------------------ início */
  if (/[?&]exemplo\b/.test(location.search)) iniciarSimulacao();
  else { desenhar(); }
})();
