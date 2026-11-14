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
    // "deixar mais preciso": quem já respondeu o rápido só vê o que falta
    while (estado.pularRespondidas && prox && prox.etapa > 1 && D.respondida(prox, estado.r)) { i++; prox = s[i + 1]; }
    if (prox) return ir('q', prox.id);
    aposUltima();
  }
  /* depois do perfil (e da importação, no modo preciso): primeira pergunta da etapa 2 em diante, ou a primeira pendente */
  function irAposPerfil() {
    var s = seq(), alvo = s.filter(function (q) { return q.etapa > 1 && (!estado.pularRespondidas || !D.respondida(q, estado.r)); })[0];
    if (alvo) ir('q', alvo.id); else aposUltima();
  }
  function recuar(semHistorico) {
    var s = seq(), v = estado.vista, alvo;
    if (v === 'q') {
      var atual = qAtual(), i = indice(atual);
      if (i <= 0) alvo = ['intro'];
      else if (s[i - 1].etapa === 1 && atual.etapa > 1) alvo = ['perfil']; // da primeira pergunta da etapa 2 volta ao resumo do perfil
      else alvo = ['q', s[i - 1].id];
    }
    else if (v === 'importar') alvo = ['perfil'];
    else if (v === 'importado') alvo = ['importar'];
    else if (v === 'perfil') alvo = ['q', s.filter(function (q) { return q.etapa === 1; }).pop().id];
    else if (v === 'contato') alvo = ['q', s[s.length - 1].id];
    else alvo = ['intro'];
    ir(alvo[0], alvo[1], false);
  }

  function comecar() { estado = { r: {}, vista: 'q', q: 'segmento', sim: false, resultado: null, enviado: false, falhaEnvio: false, imp: null, pularRespondidas: false }; limparSalvo(); ir('q', 'segmento'); }
  function iniciarSimulacao(modo) {
    estado = { r: JSON.parse(JSON.stringify(modo === 'preciso' ? D.EXEMPLO_PRECISO : D.EXEMPLO)), vista: 'perfil', q: null, sim: true, resultado: null, enviado: false, falhaEnvio: false };
    ir('perfil');
  }
  /* a partir do relatório rápido: mantém o que já foi respondido e pede só os números exatos e os detalhes */
  function aprofundar() {
    estado.r.modo = 'preciso'; estado.pularRespondidas = true; estado.resultado = null; estado.enviado = false; estado.falhaEnvio = false;
    estado.imp = estado.imp || novoImp();
    ir('importar');
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
    if (estado.vista === 'perfil' || estado.vista === 'importar' || estado.vista === 'importado') return 2;
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
      + '<p class="dg-intro-modos">Você escolhe a profundidade: <strong>rápido</strong> (faixas aproximadas) ou <strong>preciso</strong> (valores reais, com a opção de importar o extrato do banco).</p>'
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
    if (atual === undefined && multi && r._pre && Array.isArray(r._pre[q.id])) atual = r._pre[q.id]; // marcado a partir do extrato; a pessoa confirma
    var corpo;
    if (q.tipo === 'texto') {
      corpo = '<textarea name="dgq" rows="3" maxlength="300" placeholder="Ex.: confecção de roupas, serviços de limpeza...">' + esc(atual || '') + '</textarea>';
    } else if (q.tipo === 'valor') {
      corpo = corpoValor(q);
    } else {
      corpo = '<div class="dg-ops" role="' + (multi ? 'group' : 'radiogroup') + '" aria-labelledby="dg-foco">' + ops.map(function (o) { return opcao(q, o, atual, multi); }).join('') + '</div>';
    }
    var ajuda = D.ajudaDe(q, r);
    var pode = q.tipo === 'valor' ? (!!q.opcional || valorAtual(q) !== null) : (D.respondida(q, r) || (multi && Array.isArray(atual) && atual.length > 0));
    var pular = (q.tipo === 'texto' && !atual) || (q.tipo === 'valor' && q.opcional && valorAtual(q) === null);
    // pergunta de faixa que a pessoa escolheu no modo preciso: oferece voltar ao valor exato
    var qValor = D.PERGUNTAS.filter(function (x) { return x.faixaDe === q.id; })[0];
    var voltaValor = qValor && r.modo === 'preciso' && r._faixa && r._faixa[qValor.id]
      ? '<p class="dg-faixa"><button type="button" class="dg-link" data-acao="usar-valor">Prefiro informar o valor exato</button></p>' : '';
    return topo(q.etapa) + bannerSim()
      + '<section class="dg-etapa"><p class="dg-etapa-t">Etapa ' + q.etapa + ' de 6 · ' + esc(tituloEtapa(e)) + '</p><p class="dg-etapa-p">' + esc(e.texto) + '</p></section>'
      + '<section class="dg-q"><h2 id="dg-foco" tabindex="-1">' + esc(D.tituloDe(q, r)) + '</h2>'
      + (ajuda ? '<p class="dg-ajuda">' + esc(ajuda) + '</p>' : '')
      + (multi ? '<p class="dg-ajuda dg-ajuda-multi">Marque uma ou mais opções.</p>' : '')
      + corpo + voltaValor
      + '<div class="dg-acoes"><button type="button" class="btn btn-ghost" data-acao="voltar">Voltar</button>'
      + '<button type="button" class="btn btn-primary" data-acao="continuar"' + (pode ? '' : ' disabled') + '>' + (pular ? 'Pular' : 'Continuar') + '</button></div></section>';
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
      + res.perfil.filter(function (p) { return p.rotulo !== 'Profundidade'; }).map(function (p) { return '<tr><th scope="row">' + esc(p.rotulo) + '</th><td>' + esc(p.valor) + '</td></tr>'; }).join('') + '</tbody></table>'
      + '<p class="dg-ajuda">As perguntas seguintes serão adaptadas a esse perfil:</p><ul class="dg-lista">' + linhas.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>'
      + modoHtml()
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
    var rapido = estado.resultado && estado.resultado.modo !== 'preciso';
    var acoes = '<div class="dg-rel-acoes"><button type="button" class="btn btn-outline" data-acao="imprimir">Salvar em PDF ou imprimir</button>'
      + (estado.sim ? (rapido ? '<button type="button" class="btn btn-outline" data-acao="exemplo-preciso">Ver o mesmo exemplo no modo preciso</button>' : '') + '<button type="button" class="btn btn-primary" data-acao="comecar">Fazer o meu diagnóstico</button>'
        : (rapido ? '<button type="button" class="btn btn-primary" data-acao="aprofundar">Deixar mais preciso</button>' : '') + '<button type="button" class="dg-link" data-acao="refazer">Refazer o diagnóstico</button>') + '</div>'
      + (!estado.sim && rapido ? '<p class="dg-aprofundar">Este relatório usa faixas aproximadas. No modo preciso você informa os números reais (ou importa o extrato do banco) e responde só o que falta: os indicadores ficam bem mais exatos.</p>' : '');
    return '<div class="dg-relatorio">' + aviso + '<h1 id="dg-foco" tabindex="-1" class="dg-sr">Relatório do CM Diagnóstico</h1>'
      + D.relatorioHtml(estado.resultado, { simulacao: estado.sim, cta: !estado.sim }) + acoes + '</div>';
  }


  /* ------------------------------------------------------------------ modo preciso: campos de valor */
  var UNID = { '%': '%', dias: 'dias', h: 'horas', un: '' };
  function fmtCampo(q, n) {
    return q.unidade === 'R$' ? n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(Math.round(n * 10) / 10).replace('.', ',');
  }
  function valorAtual(q) {
    var r = estado.r;
    if (typeof r[q.id] === 'number') return r[q.id];
    if (r._pre && typeof r._pre[q.id] === 'number') return r._pre[q.id];
    return null;
  }
  function corpoValor(q) {
    var n = valorAtual(q), un = q.unidade, r = estado.r;
    var origem = (n !== null && r._origem && r._origem[q.id] === 'extrato') ? '<p class="dg-origem">Calculado a partir do extrato que você importou. Pode corrigir.</p>' : '';
    return '<div class="dg-valor">' + (un === 'R$' ? '<span class="dg-valor-un">R$</span>' : '')
      + '<input id="dg-valor" name="dgq" type="text" inputmode="decimal" autocomplete="off" placeholder="' + (un === 'R$' ? '0,00' : '0') + '" value="' + esc(n === null ? '' : fmtCampo(q, n)) + '" aria-labelledby="dg-foco">'
      + (un !== 'R$' && UNID[un] ? '<span class="dg-valor-un dg-valor-suf">' + esc(UNID[un]) + '</span>' : '') + '</div>'
      + origem + '<p class="dg-erro dg-erro-valor" id="dg-erro-valor" role="alert" hidden></p>'
      + (q.faixaDe ? '<p class="dg-faixa"><button type="button" class="dg-link" data-acao="usar-faixa">' + esc(q.textoFaixa) + '</button></p>' : '');
  }
  function lerCampo(q) {
    var el = document.getElementById('dg-valor'); if (!el) return { vazio: true };
    var txt = el.value.trim(); if (!txt) return { vazio: true };
    var n = D.importar.numero(txt);
    if (n === null || n < 0 || n > D.maxDe(q, estado.r)) return { invalido: true };
    return { valor: n };
  }
  function commitValor(q) {
    var c = lerCampo(q), r = estado.r, erro = document.getElementById('dg-erro-valor');
    function falha(m) { if (erro) { erro.textContent = m; erro.hidden = false; } var el = document.getElementById('dg-valor'); if (el) el.focus(); return false; }
    var mx = D.maxDe(q, r);
    if (c.invalido) return falha(q.unidade === '%' ? 'Informe um percentual entre 0 e 100.' : mx <= 100000 ? 'Informe um número de 0 a ' + mx.toLocaleString('pt-BR') + '.' : 'Informe um número válido (use vírgula para os centavos).');
    if (c.vazio) { if (q.opcional) { r[q.id] = null; guardar(); return true; } return falha('Informe um valor ou escolha uma faixa.'); }
    r[q.id] = c.valor;
    if (r._origem && r._origem[q.id] === 'extrato' && !(r._pre && r._pre[q.id] === c.valor)) delete r._origem[q.id]; // mexeu no valor: deixa de ser "do extrato"
    guardar();
    return true;
  }
  function atualizarBotaoValor(q) {
    var b = raiz.querySelector('[data-acao="continuar"]'); if (!b) return;
    var c = lerCampo(q), erro = document.getElementById('dg-erro-valor');
    b.disabled = !(q.opcional || c.valor !== undefined);
    b.textContent = q.opcional && c.vazio ? 'Pular' : 'Continuar';
    if (erro) erro.hidden = true;
  }

  /* ------------------------------------------------------------------ modo preciso: escolha da profundidade */
  function modoOp(v, nome, tempo, desc, atual) {
    return '<label class="dg-modo-op"><input type="radio" name="dgmodo" value="' + v + '"' + (atual === v ? ' checked' : '') + '><span class="dg-op-marca" aria-hidden="true"></span>'
      + '<span class="dg-op-t"><strong>' + nome + '</strong> <em>· ' + tempo + '</em><small>' + desc + '</small></span></label>';
  }
  function modoHtml() {
    var m = estado.r.modo === 'preciso' ? 'preciso' : 'rapido';
    return '<fieldset class="dg-modo"><legend>Como você prefere seguir?</legend>'
      + modoOp('rapido', 'Rápido', 'cerca de 6 minutos', 'Faixas aproximadas de valores. Já dá um bom retrato do negócio.', m)
      + modoOp('preciso', 'Preciso', 'cerca de 12 minutos', 'Valores reais, perguntas mais detalhadas e a opção de importar o extrato do banco (OFX, CSV ou Excel). Indicadores bem mais exatos.', m)
      + '</fieldset>';
  }

  /* ------------------------------------------------------------------ modo preciso: importação do extrato (tudo no navegador) */
  var II = function () { return D.importar; };
  function novoImp() { return { fase: 'escolha', msg: '', juncao: null, analise: null, escolhas: {}, resto: { in: 'venda', out: 'custo' }, saldo: null }; }
  function R0(n) { return D.fmt.inteiro(n); }
  function dataBR(iso) { return iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4); }

  function telaImportar() {
    var imp = estado.imp || (estado.imp = novoImp());
    var corpo = imp.fase === 'lendo' ? '<p class="dg-lendo" role="status"><span class="dg-spin" aria-hidden="true"></span>Lendo o extrato neste computador…</p>'
      : imp.fase === 'revisao' ? htmlRevisao(imp) : htmlEscolha(imp);
    return topo(2) + bannerSim() + '<section class="dg-imp">' + corpo + '</section>';
  }
  function htmlEscolha(imp) {
    return '<p class="dg-eyebrow">Modo preciso</p><h2 id="dg-foco" tabindex="-1">Quer importar um extrato para preencher os números?</h2>'
      + '<p class="dg-ajuda">Leia o extrato do banco e calculamos faturamento, custos, despesas e saldo por você. Se preferir, é só digitar os valores.</p>'
      + '<div class="dg-privacidade"><strong>Seu extrato não sai do seu computador.</strong> O arquivo é lido aqui, no navegador, e não é enviado. Se você enviar o diagnóstico, a CM recebe apenas os totais por categoria: sem nomes, sem descrições e sem o arquivo.</div>'
      + (imp.fase === 'erro' ? '<p class="dg-erro" role="alert">' + esc(imp.msg) + '</p>' : '')
      + '<label class="dg-drop" for="dg-arq"><strong>Escolher arquivos</strong><span>ou arraste para cá</span><small>OFX, CSV ou Excel (.xlsx) · de preferência os últimos 3 meses · pode enviar mais de um</small>'
      + '<input id="dg-arq" type="file" accept=".ofx,.qfx,.csv,.txt,.xlsx" multiple></label>'
      + '<div class="dg-acoes"><button type="button" class="btn btn-ghost" data-acao="voltar">Voltar</button><button type="button" class="btn btn-outline" data-acao="imp-pular">Prefiro digitar os valores</button></div>';
  }
  function linhasGrupos(imp, dir) {
    var ops = dir === 'in' ? II().CLASSES_ENTRADA : II().CLASSES_SAIDA;
    return imp.analise.grupos.filter(function (g) { return g.dir === dir; }).map(function (g) {
      var atual = imp.escolhas[g.id] || g.sug || '';
      return '<tr class="' + (atual ? '' : 'dg-pend') + '"><td><strong>' + esc(g.rotulo) + '</strong><small>' + esc(g.exemplo) + '</small></td><td class="dg-n">' + g.qtd + '</td><td class="dg-n">' + R0(g.mensal) + '</td>'
        + '<td><select data-grupo="' + esc(g.id) + '" aria-label="Classificar ' + esc(g.rotulo) + '">' + (atual ? '' : '<option value="" selected disabled>Escolha…</option>')
        + ops.map(function (o) { return '<option value="' + o[0] + '"' + (atual === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></td></tr>';
    }).join('');
  }
  function selResto(imp, dir) {
    var rs = imp.analise.resto[dir], desc = rs.porClasse['?'] || 0;
    if (!desc) return '';
    var ops = dir === 'in' ? II().CLASSES_ENTRADA : II().CLASSES_SAIDA;
    return '<p class="dg-resto">Outros lançamentos pequenos que não identificamos (' + dir.replace('in', 'entradas').replace('out', 'saídas') + ', cerca de ' + R0(desc * imp.analise.fator) + ' por mês): considerar como '
      + '<select data-resto="' + dir + '" aria-label="Classificar os lançamentos pequenos">' + ops.map(function (o) { return '<option value="' + o[0] + '"' + (imp.resto[dir] === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></p>';
  }
  function htmlRevisao(imp) {
    var an = imp.analise, j = imp.juncao;
    var avisos = [];
    if (an.periodoCurto) avisos.push('O período é curto (' + an.dias + ' dias). A média mensal pode não representar um mês típico: se puder, envie também os meses anteriores.');
    if (j.cartao) avisos.push('Este parece ser um extrato de cartão de crédito. Compras entram como saídas e pagamentos de fatura como entradas: classifique os pagamentos como "ignorar".');
    var saldos = j.saldos.length > 1
      ? '<p class="dg-nota-saldo">Saldos encontrados: ' + j.saldos.map(function (x) { return esc(x.arquivo) + ': ' + R0(x.valor); }).join(' · ') + '. <button type="button" class="dg-link" data-acao="imp-somar">Somar todos</button> (se forem contas diferentes) ou digite o total abaixo.</p>'
      : j.saldos.length === 1 ? '<p class="dg-nota-saldo">O extrato informa saldo final de ' + R0(j.saldos[0].valor) + (j.saldos[0].data ? ' em ' + dataBR(j.saldos[0].data) : '') + '.</p>' : '';
    return '<p class="dg-eyebrow">Extrato lido</p><h2 id="dg-foco" tabindex="-1">Confira como entendemos o extrato</h2>'
      + '<p class="dg-ajuda">Período de <strong>' + dataBR(an.ini) + '</strong> a <strong>' + dataBR(an.fim) + '</strong> (' + an.dias + ' dias) · ' + an.lancamentos.toLocaleString('pt-BR') + ' lançamentos · entradas de ' + R0(an.entradas) + ' e saídas de ' + R0(an.saidas)
      + '<br><small>Arquivos: ' + esc(j.arquivos.join(', ')) + '</small></p>'
      + avisos.map(function (a) { return '<p class="dg-aviso">' + esc(a) + '</p>'; }).join('')
      + '<p class="dg-ajuda">Sugerimos uma classe para cada origem. Confirme ou corrija: é isso que transforma o extrato em faturamento, custos e despesas. Em destaque, o que precisa da sua escolha.</p>'
      + '<ul class="dg-legenda"><li><strong>Vendas:</strong> dinheiro que entrou dos clientes</li><li><strong>Outras entradas:</strong> empréstimo, aporte, estorno, rendimento</li>'
      + '<li><strong>Custos diretos:</strong> o que varia com a venda (insumos, mercadorias, taxas)</li><li><strong>Despesas fixas:</strong> aluguel, contas, sistemas, tarifas, contabilidade</li>'
      + '<li><strong>Ignorar:</strong> transferência entre as suas próprias contas</li></ul>'
      + '<h3 class="dg-sub">Entradas</h3><div class="dg-rolagem"><table class="dg-tab dg-tab-imp"><thead><tr><th>Origem</th><th class="dg-n">Lanç.</th><th class="dg-n">Média/mês</th><th>Classificar como</th></tr></thead><tbody>' + linhasGrupos(imp, 'in') + '</tbody></table></div>' + selResto(imp, 'in')
      + '<h3 class="dg-sub">Saídas</h3><div class="dg-rolagem"><table class="dg-tab dg-tab-imp"><thead><tr><th>Destino</th><th class="dg-n">Lanç.</th><th class="dg-n">Média/mês</th><th>Classificar como</th></tr></thead><tbody>' + linhasGrupos(imp, 'out') + '</tbody></table></div>' + selResto(imp, 'out')
      + saldos
      + '<div class="dg-campo dg-saldo"><label for="dg-saldo">Saldo disponível hoje (R$)</label><input id="dg-saldo" type="text" inputmode="decimal" autocomplete="off" placeholder="Opcional" value="' + esc(imp.saldo === null ? '' : imp.saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) + '"></div>'
      + '<div class="dg-imp-prev" id="dg-imp-prev" aria-live="polite">' + htmlPreview(imp) + '</div>'
      + '<div class="dg-acoes"><button type="button" class="btn btn-ghost" data-acao="imp-outros">Escolher outros arquivos</button>'
      + '<button type="button" class="btn btn-primary" data-acao="imp-aplicar"' + (pendentes(imp) ? ' disabled' : '') + '>Usar estes números</button></div>';
  }
  function pendentes(imp) { return imp.analise.grupos.filter(function (g) { return !(imp.escolhas[g.id] || g.sug); }).length; }
  function htmlPreview(imp) {
    var r = estado.r, equipe = !!(r.equipe && r.equipe !== 'solo'), pend = pendentes(imp);
    var f = II().fechar(imp.analise, imp.escolhas, { resto: imp.resto, equipe: equipe, saldoFinal: imp.saldo }), v = f.valores;
    var res = v.fat_v - v.custo_v - v.fixas_v - (v.folha_v || 0) - v.impostos_v;
    var lin = function (rot, val) { return '<div><dt>' + rot + '</dt><dd>' + val + '</dd></div>'; };
    return '<h3 class="dg-sub">Média mensal com estas escolhas</h3><dl class="dg-prev">'
      + lin('Vendas', R0(v.fat_v)) + lin('Custos diretos', R0(v.custo_v)) + lin('Despesas fixas' + (equipe ? '' : ' (inclui folha, se houver)'), R0(v.fixas_v)) + (equipe ? lin('Folha de pagamento', R0(v.folha_v)) : '')
      + lin('Impostos', R0(v.impostos_v)) + lin('Dívidas (parcelas)', R0(v.dv_parcela_v)) + lin('Retirada do proprietário', R0(v.retirada_v))
      + lin('<strong>Resultado antes da retirada</strong>', '<strong>' + R0(res) + '</strong>') + '</dl>'
      + (pend ? '<p class="dg-aviso">Faltam ' + pend + ' origem' + (pend > 1 ? 's' : '') + ' para classificar (em destaque acima).</p>' : '')
      + (f.resumo.cobertura < 90 ? '<p class="dg-aviso">Só ' + f.resumo.cobertura + '% do valor das saídas está classificado com segurança. Quanto mais você classificar, mais confiáveis ficam os números.</p>' : '')
      + (v.dv_app_pct_v ? '<p class="dg-nota-saldo">Cerca de ' + v.dv_app_pct_v + '% das vendas vêm de aplicativos e plataformas: já usamos isso nas perguntas seguintes.</p>' : '')
      + '<p class="dg-nota-saldo">Vendas no extrato podem ser menores que as reais (dinheiro que não foi depositado) ou maiores (dinheiro pessoal misturado). Você poderá corrigir cada número na sequência.</p>';
  }
  function atualizarPreviaImp() {
    var imp = estado.imp, el = document.getElementById('dg-imp-prev'); if (!imp || !el) return;
    el.innerHTML = htmlPreview(imp);
    var b = raiz.querySelector('[data-acao="imp-aplicar"]'); if (b) b.disabled = pendentes(imp) > 0;
    Array.prototype.forEach.call(raiz.querySelectorAll('select[data-grupo]'), function (sel) { var tr = sel.closest('tr'); if (tr) tr.classList.toggle('dg-pend', !sel.value); });
  }
  function lerArquivos(files) {
    var lista = Array.prototype.slice.call(files || []).slice(0, 12); if (!lista.length) return;
    var imp = estado.imp = novoImp(); imp.fase = 'lendo'; desenhar();
    Promise.all(lista.map(function (f) { return f.arrayBuffer().then(function (b) { return II().lerArquivo(f.name, b); }); })).then(function (lidos) {
      var j = II().juntar(lidos), an = II().analisar(j.transacoes, j.periodo);
      imp.juncao = j; imp.analise = an; imp.saldo = j.saldoFinal; imp.fase = 'revisao'; desenhar();
    }).catch(function (e) {
      imp.fase = 'erro'; imp.msg = e && e.amigavel ? e.message : 'Não consegui ler este arquivo. Tente baixar o extrato em OFX ou CSV no site do banco.'; desenhar();
    });
  }
  function aplicarImportacao() {
    var imp = estado.imp, r = estado.r, equipe = !!(r.equipe && r.equipe !== 'solo');
    var f = II().fechar(imp.analise, imp.escolhas, { resto: imp.resto, equipe: equipe, saldoFinal: imp.saldo });
    r._origem = r._origem || {}; r._pre = r._pre || {};
    Object.keys(f.valores).forEach(function (k) { if (D.pergunta(k)) { r[k] = f.valores[k]; r._origem[k] = 'extrato'; } });
    estado.impValores = JSON.parse(JSON.stringify(f.valores));
    // formas de recebimento vistas no extrato: já vêm marcadas na pergunta (a pessoa confirma, pois dinheiro vivo não passa pelo banco)
    var qrec = D.pergunta('rec'), ops = qrec ? D.opcoesDe(qrec, r).map(function (o) { return o.v; }) : [], c = f.resumo.canais || {}, rec = [];
    [['app', ['app']], ['cartao', ['deb', 'cre']], ['pix', ['pix']], ['dinheiro', ['din']], ['convenio', ['conv']], ['boleto', ['prazo']]].forEach(function (m) {
      if (c[m[0]] > 0) m[1].forEach(function (v) { if (ops.indexOf(v) !== -1 && rec.indexOf(v) === -1) rec.push(v); });
    });
    if (rec.length) r._pre.rec = rec;
    r._import = f.resumo; // só totais (por categoria, mês e semana): nada de descrições nem de nomes
    guardar();
    ir('importado');
  }

  /* "o que encontramos no extrato" (editável) e "o que vamos perguntar" */
  var ROT_ACHADOS = { fat_v: 'Vendas por mês', custo_v: 'Custos diretos por mês', fixas_v: 'Despesas fixas por mês', folha_v: 'Folha de pagamento por mês', impostos_v: 'Impostos por mês', retirada_v: 'Retirada do proprietário por mês', dv_parcela_v: 'Parcelas de dívidas por mês', saldo_v: 'Saldo disponível hoje', dv_app_pct_v: 'Vendas por aplicativos e plataformas' };
  function telaImportado() {
    var r = estado.r, equipe = !!(r.equipe && r.equipe !== 'solo');
    var chaves = ['fat_v', 'custo_v', 'fixas_v', 'folha_v', 'impostos_v', 'retirada_v', 'dv_parcela_v', 'saldo_v', 'dv_app_pct_v'].filter(function (k) { return typeof r[k] === 'number' && !(k === 'folha_v' && !equipe); });
    var linhas = chaves.map(function (k) {
      var pct = k === 'dv_app_pct_v', q = { unidade: pct ? '%' : 'R$' };
      return '<tr><th scope="row"><label for="dg-i-' + k + '">' + esc(ROT_ACHADOS[k]) + '</label></th><td><div class="dg-valor dg-valor-peq">' + (pct ? '' : '<span class="dg-valor-un">R$</span>')
        + '<input id="dg-i-' + k + '" data-chave="' + k + '" type="text" inputmode="decimal" autocomplete="off" value="' + esc(fmtCampo(q, r[k])) + '">' + (pct ? '<span class="dg-valor-un dg-valor-suf">%</span>' : '') + '</div></td></tr>';
    }).join('');
    var falta = [], vistos = {};
    seq().forEach(function (q) { if (q.etapa > 1 && !D.respondida(q, r) && !vistos[q.curto]) { vistos[q.curto] = 1; falta.push(q.curto); } });
    var mostra = falta.slice(0, 14);
    var imp = r._import || {};
    return topo(2) + bannerSim() + '<section class="dg-imp"><p class="dg-eyebrow">Extrato lido</p><h2 id="dg-foco" tabindex="-1">O que encontramos e o que vamos perguntar</h2>'
      + '<p class="dg-ajuda">Estes números saíram do seu extrato (média de ' + (imp.mesesPeriodo ? String(imp.mesesPeriodo).replace('.', ',') + ' ' + (imp.mesesPeriodo === 1 ? 'mês' : 'meses') : 'um mês') + '). Confira e corrija o que não bater: eles entram direto no relatório.</p>'
      + '<table class="dg-tab dg-tab-achados"><tbody>' + linhas + '</tbody></table>'
      + '<p class="dg-erro" id="dg-erro-imp" role="alert" hidden></p>'
      + '<h3 class="dg-sub">O que o extrato não mostra: vamos perguntar</h3>'
      + '<p class="dg-ajuda">Só o que falta, sem repetir o que já sabemos' + (falta.length ? ' (' + falta.length + ' pergunta' + (falta.length > 1 ? 's' : '') + ' por enquanto; outras aparecem conforme as suas respostas)' : '') + ':</p>'
      + '<ul class="dg-lista dg-lista-falta">' + mostra.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + (falta.length > mostra.length ? '<li>e mais ' + (falta.length - mostra.length) + '…</li>' : '') + '</ul>'
      + '<div class="dg-acoes"><button type="button" class="btn btn-ghost" data-acao="voltar">Voltar</button><button type="button" class="btn btn-primary" data-acao="imp-continuar">Continuar</button></div></section>';
  }
  function confirmarAchados() {
    var r = estado.r, erro = document.getElementById('dg-erro-imp'), campos = raiz.querySelectorAll('input[data-chave]'), novos = {}, ok = true;
    Array.prototype.forEach.call(campos, function (el) {
      var k = el.getAttribute('data-chave'), txt = el.value.trim();
      if (!txt) { novos[k] = null; return; }
      var n = II().numero(txt);
      if (n === null || n < 0 || (k === 'dv_app_pct_v' && n > 100)) { ok = false; el.focus(); return; }
      novos[k] = n;
    });
    if (!ok) { if (erro) { erro.textContent = 'Há um número inválido. Use apenas dígitos e vírgula para os centavos.'; erro.hidden = false; } return false; }
    Object.keys(novos).forEach(function (k) {
      if (novos[k] === null) { delete r[k]; if (r._origem) delete r._origem[k]; return; }
      r[k] = novos[k];
      if (!estado.impValores || estado.impValores[k] !== novos[k]) { if (r._origem) delete r._origem[k]; }
    });
    guardar();
    return true;
  }

  function desenhar() {
    var v = estado.vista, h;
    raiz.setAttribute('data-vista', v);
    if (v === 'intro') h = telaIntro();
    else if (v === 'perfil') h = telaPerfil();
    else if (v === 'importar') h = telaImportar();
    else if (v === 'importado') h = telaImportado();
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

  function escolherModo(v) {
    estado.r.modo = v === 'preciso' ? 'preciso' : 'rapido';
    if (estado.sim) estado.r = JSON.parse(JSON.stringify(v === 'preciso' ? D.EXEMPLO_PRECISO : D.EXEMPLO)); // o exemplo acompanha o modo
    guardar();
  }
  raiz.addEventListener('change', function (e) {
    var t = e.target;
    if (t.name === 'dgmodo') escolherModo(t.value);
    else if (t.id === 'dg-arq') lerArquivos(t.files);
    else if (t.hasAttribute('data-grupo') && estado.imp) { estado.imp.escolhas[t.getAttribute('data-grupo')] = t.value; atualizarPreviaImp(); }
    else if (t.hasAttribute('data-resto') && estado.imp) { estado.imp.resto[t.getAttribute('data-resto')] = t.value; atualizarPreviaImp(); }
    else if (t.name === 'dgq' && t.type !== 'textarea' && t.id !== 'dg-valor') responder(t);
  });
  raiz.addEventListener('input', function (e) {
    var t = e.target;
    if (t.id === 'dg-valor') { var q = qAtual(); if (q) atualizarBotaoValor(q); }
    else if (t.id === 'dg-saldo' && estado.imp) { var n = II().numero(t.value); estado.imp.saldo = t.value.trim() && n !== null && n >= 0 ? n : null; atualizarPreviaImp(); }
    else if (t.name === 'dgq' && t.tagName === 'TEXTAREA') responder(t);
  });
  raiz.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    if (e.target.id === 'dg-valor') { e.preventDefault(); acao('continuar'); }
    else if (e.target.hasAttribute && e.target.hasAttribute('data-chave')) { e.preventDefault(); acao('imp-continuar'); }
  });
  raiz.addEventListener('dragover', function (e) { var z = e.target.closest && e.target.closest('.dg-drop'); if (z) { e.preventDefault(); z.classList.add('dg-drop-sobre'); } });
  raiz.addEventListener('dragleave', function (e) { var z = e.target.closest && e.target.closest('.dg-drop'); if (z) z.classList.remove('dg-drop-sobre'); });
  raiz.addEventListener('drop', function (e) { var z = e.target.closest && e.target.closest('.dg-drop'); if (z) { e.preventDefault(); z.classList.remove('dg-drop-sobre'); lerArquivos(e.dataTransfer && e.dataTransfer.files); } });
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
    else if (a === 'continuar') {
      var qc = qAtual();
      if (qc && qc.tipo === 'valor' && !commitValor(qc)) return;
      if (qc && qc.tipo === 'multipla' && estado.r[qc.id] === undefined && estado.r._pre && Array.isArray(estado.r._pre[qc.id])) estado.r[qc.id] = estado.r._pre[qc.id].slice(); // confirma a marcação vinda do extrato
      avancar();
    }
    else if (a === 'continuar-perfil') {
      if (estado.r.modo === 'preciso' && !estado.sim) { estado.imp = estado.imp || novoImp(); ir('importar'); return; }
      irAposPerfil();
    }
    else if (a === 'usar-faixa') { var qf = qAtual(); if (qf && qf.faixaDe) { estado.r._faixa = estado.r._faixa || {}; estado.r._faixa[qf.id] = true; delete estado.r[qf.id]; ir('q', qf.faixaDe); } }
    else if (a === 'usar-valor') { var qr = qAtual(), qv = D.PERGUNTAS.filter(function (x) { return qr && x.faixaDe === qr.id; })[0]; if (qv && estado.r._faixa) { delete estado.r._faixa[qv.id]; ir('q', qv.id); } }
    else if (a === 'imp-pular') irAposPerfil();
    else if (a === 'imp-aplicar') aplicarImportacao();
    else if (a === 'imp-continuar') { if (confirmarAchados()) { estado.pularRespondidas = true; irAposPerfil(); } }
    else if (a === 'imp-outros') { estado.imp = novoImp(); desenhar(); }
    else if (a === 'imp-somar') { var j = estado.imp && estado.imp.juncao; if (j) { estado.imp.saldo = Math.round(j.saldos.reduce(function (t, x) { return t + x.valor; }, 0) * 100) / 100; desenhar(); } }
    else if (a === 'aprofundar') aprofundar();
    else if (a === 'exemplo-preciso') iniciarSimulacao('preciso');
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
  if (/[?&]exemplo\b/.test(location.search)) iniciarSimulacao(/[?&]exemplo=preciso\b/.test(location.search) ? 'preciso' : 'rapido');
  else { desenhar(); }
})();
