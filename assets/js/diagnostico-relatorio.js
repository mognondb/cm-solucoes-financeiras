/* ==========================================================================
   CM Diagnóstico — relatório em HTML.
   D.relatorioHtml(resultado, opcoes) devolve o HTML do relatório. Usado na página pública e no painel (onde o
   resultado vem do banco): por isso TODO texto passa por esc(), inclusive o que parece fixo.
   opcoes: { simulacao: bool, cta: bool, whats: 'numero' }
   ========================================================================== */
(function (g) {
  'use strict';
  var D = g.CMDiag = g.CMDiag || {};

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  D.esc = esc;
  var NIVEIS = { critico: 'Ponto crítico', atencao: 'Atenção', desenvolvimento: 'Em desenvolvimento', solido: 'Sólido' };
  var NIVEL_OK = { critico: 1, atencao: 1, desenvolvimento: 1, solido: 1 };
  var PRIO = { alta: 'Prioridade alta', media: 'Prioridade média', complementar: 'Complementar' };
  function nv(n) { return NIVEL_OK[n] ? n : 'nd'; }
  function rotuloNivel(n) { return NIVEIS[n] || 'Sem dados'; }
  function pc(p) { var x = Number(p); return isFinite(x) ? Math.max(0, Math.min(100, Math.round(x))) : null; }
  function arr(a) { return Array.isArray(a) ? a : []; }

  function barra(p, nivel, rotulo) {
    var v = pc(p);
    return '<div class="dg-barra" data-nivel="' + nv(nivel) + '" role="img" aria-label="' + esc(rotulo + ': ' + (v === null ? 'sem dados' : v + ' de 100')) + '">'
      + '<span style="width:' + (v === null ? 0 : v) + '%"></span></div>';
  }

  function listaPontos(titulo, pontos, vazio) {
    pontos = arr(pontos);
    var h = '<h4>' + esc(titulo) + '</h4>';
    if (!pontos.length) return h + '<p class="dg-vazio">' + esc(vazio) + '</p>';
    return h + '<ul class="dg-pontos">' + pontos.map(function (p) {
      return '<li><strong>' + esc(p.curto) + '</strong><span>' + esc(p.resposta) + '</span></li>';
    }).join('') + '</ul>';
  }

  function cartao(a, chave, avisoSaude) {
    a = a || {};
    var n = nv(a.nivel), v = pc(a.pct);
    return '<article class="dg-card" data-nivel="' + n + '">'
      + '<header><h3>' + esc(a.nome) + '</h3><span class="dg-selo" data-nivel="' + n + '">' + esc(rotuloNivel(a.nivel)) + '</span></header>'
      + '<p class="dg-num">' + (v === null ? '—' : '<strong>' + v + '</strong><small>/100</small>') + '</p>'
      + barra(a.pct, a.nivel, a.nome)
      + '<p class="dg-card-desc">' + esc(a.desc) + '</p>'
      + (avisoSaude || '')
      + listaPontos('O que mais pesa', a.atencao, 'Nenhum ponto crítico nas respostas.')
      + listaPontos('Pontos fortes', a.fortes, 'Ainda não há pontos fortes claros nesta análise.')
      + '</article>';
  }

  function recomendacao(r, i) {
    var p = r.prioridade === 'alta' || r.prioridade === 'media' ? r.prioridade : 'complementar';
    return '<li class="dg-rec" data-prio="' + p + '">'
      + '<div class="dg-rec-n" aria-hidden="true">' + (i + 1) + '</div>'
      + '<div class="dg-rec-corpo"><div class="dg-rec-topo"><h4>' + esc(r.titulo) + '</h4><span class="dg-prio" data-prio="' + p + '">' + PRIO[p] + '</span></div>'
      + '<p class="dg-rec-porque">' + esc(r.porque) + '</p>'
      + '<ol class="dg-rec-acoes">' + arr(r.acoes).map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ol></div></li>';
  }

  D.relatorioHtml = function (res, op) {
    op = op || {};
    res = res || {};
    var an = res.analises || {};
    var interp = res.interpretacao || {};
    var recs = arr(res.recomendacoes);
    var principais = recs.filter(function (r) { return r.principal; });
    var outras = recs.filter(function (r) { return !r.principal; });
    var h = '<div class="dg-rel">';

    /* topo */
    h += '<header class="dg-rel-topo">'
      + '<p class="dg-eyebrow">CM Diagnóstico</p>'
      + '<h2>Diagnóstico financeiro' + (op.simulacao ? ' <span class="dg-simul">Simulação ilustrativa</span>' : '') + '</h2>'
      + (op.simulacao ? '<p class="dg-aviso-simul">Resultado gerado com respostas demonstrativas. Não representa dados reais de nenhum negócio.</p>' : '')
      + '<ul class="dg-perfil">' + arr(res.perfil).map(function (p) { return '<li><span>' + esc(p.rotulo) + '</span>' + esc(p.valor) + '</li>'; }).join('') + '</ul>'
      + '</header>';

    /* interpretação integrada */
    h += '<section class="dg-interp" aria-labelledby="dg-interp-t"><p class="dg-eyebrow">Leitura integrada</p>'
      + '<h3 id="dg-interp-t">' + esc(interp.titulo) + '</h3><p>' + esc(interp.texto) + '</p>'
      + arr(interp.detalhes).map(function (d) { return '<p class="dg-interp-det">' + esc(d) + '</p>'; }).join('') + '</section>';

    /* três análises, sempre separadas */
    var aviso = '';
    if (an.saude && an.saude.confianca && an.saude.confianca !== 'alta') {
      aviso = '<p class="dg-aviso">' + (an.saude.confianca === 'baixa'
        ? 'Avaliação limitada: faltaram números básicos, então esta análise usa só as respostas qualitativas.'
        : 'Avaliação parcial: um dos números básicos não foi informado.') + '</p>';
    }
    h += '<section class="dg-sec" aria-labelledby="dg-tres-t"><h3 id="dg-tres-t" class="dg-sec-t">Três análises, lidas separadamente</h3>'
      + '<p class="dg-sec-sub">Um negócio pode estar bem organizado e financeiramente apertado, ou ter bons números hoje sem controles que os sustentem. Por isso não existe uma nota única.</p>'
      + '<div class="dg-tres">' + cartao(an.saude, 'saude', aviso) + cartao(an.maturidade, 'maturidade') + cartao(an.eficiencia, 'eficiencia') + '</div></section>';

    /* seis dimensões */
    h += '<section class="dg-sec" aria-labelledby="dg-dim-t"><h3 id="dg-dim-t" class="dg-sec-t">Seis dimensões avaliadas</h3><div class="dg-dims">'
      + arr(res.dimensoes).map(function (d) {
        return '<div class="dg-dim" data-nivel="' + nv(d.nivel) + '"><div class="dg-dim-topo"><div><strong>' + esc(d.nome) + '</strong><span>' + esc(d.desc) + '</span></div>'
          + '<span class="dg-selo" data-nivel="' + nv(d.nivel) + '">' + esc(rotuloNivel(d.nivel)) + '</span></div>' + barra(d.pct, d.nivel, d.nome) + '</div>';
      }).join('') + '</div></section>';

    /* indicadores */
    h += '<section class="dg-sec" aria-labelledby="dg-ind-t"><h3 id="dg-ind-t" class="dg-sec-t">Indicadores estimados</h3>'
      + '<p class="dg-sec-sub">Calculados a partir das faixas que você informou. São estimativas para dar direção, não uma apuração contábil.</p>'
      + '<dl class="dg-ind">' + arr(res.indicadores).map(function (i) {
        return '<div><dt>' + esc(i.rotulo) + '</dt><dd><strong>' + esc(i.valor) + '</strong>' + (i.nota ? '<span>' + esc(i.nota) + '</span>' : '') + '</dd></div>';
      }).join('') + '</dl></section>';

    /* recomendações */
    h += '<section class="dg-sec" aria-labelledby="dg-rec-t"><h3 id="dg-rec-t" class="dg-sec-t">Por onde começar</h3>'
      + '<p class="dg-sec-sub">Ordenadas pelo que mais pesa no seu caso. Comece pela primeira.</p>'
      + '<ol class="dg-recs">' + principais.map(recomendacao).join('') + '</ol>'
      + (outras.length ? '<details class="dg-mais"><summary>Ver outras ' + outras.length + ' recomendações</summary><ol class="dg-recs" start="' + (principais.length + 1) + '">'
        + outras.map(function (r, i) { return recomendacao(r, principais.length + i); }).join('') + '</ol></details>' : '')
      + '</section>';

    /* como ler */
    h += '<section class="dg-como"><h4>Como ler este relatório</h4><ul>'
      + '<li>As respostas são declaradas por você e os valores são faixas: os indicadores são aproximações, úteis para direção.</li>'
      + '<li>As referências de margem e as pontuações são regras práticas para pequenos negócios e seguem em evolução.</li>'
      + '<li>O diagnóstico não substitui o trabalho de um contador ou de um consultor financeiro.</li></ul></section>';

    /* próximo passo */
    if (op.cta) {
      var txt = 'Olá! Fiz o CM Diagnóstico' + (res.segmento ? ' (segmento: ' + ((D.SEGMENTOS.filter(function (s) { return s.id === res.segmento; })[0] || {}).rotulo || res.segmento) + ')' : '') + ' e gostaria de conversar sobre o resultado.';
      h += '<section class="dg-cta"><div><h3>Quer ajuda para colocar isso em prática?</h3>'
        + '<p>A CM pode olhar o seu resultado com você, sem compromisso, e mostrar por onde começar na prática: do caixa organizado ao fechamento mensal com relatório.</p></div>'
        + '<div class="dg-cta-acoes"><a class="btn btn-primary" target="_blank" rel="noopener" href="https://wa.me/' + esc(op.whats || '554888766576') + '?text=' + encodeURIComponent(txt) + '">Conversar com a CM</a>'
        + '<a class="btn btn-outline" href="/#servicos">Conhecer os serviços</a></div></section>';
    }
    return h + '</div>';
  };
})(typeof window !== 'undefined' ? window : globalThis);
