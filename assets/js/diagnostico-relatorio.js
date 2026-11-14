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


  /* ------------------------------------------------------------------ painel gráfico (modo preciso) */
  function num(x) { var n = Number(x); return isFinite(n) ? n : 0; }
  function mil(n) { // 18926 → "18,9 mil"; 640 → "640"
    var a = Math.abs(n), t = a >= 1000 ? (Math.round(a / 100) / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil' : String(Math.round(a));
    return (n < 0 ? '−' : '') + t;
  }
  var forcarLargo = false; // o PDF é sempre desenhado em largura de computador, mesmo gerado num celular
  function compacto() { return !forcarLargo && typeof window !== 'undefined' && window.innerWidth < 640; } // celular: gráfico mais estreito, texto maior na tela
  var MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  function rotuloMes(m) { var s = String(m || ''); return (MESES[parseInt(s.slice(5, 7), 10) - 1] || s) + '/' + s.slice(2, 4); }
  function dm(iso) { var s = String(iso || ''); return s.slice(8, 10) + '/' + s.slice(5, 7); }
  function quebra(txt, max) { // duas linhas no máximo
    var pal = String(txt).split(' '), a = '', b = '';
    pal.forEach(function (w) { if ((a + ' ' + w).trim().length <= max && !b) a = (a + ' ' + w).trim(); else b = (b + ' ' + w).trim(); });
    return [a, b.length > max + 2 ? b.slice(0, max) + '…' : b];
  }

  function cascataSvg(passos) {
    passos = arr(passos).filter(function (p) { return p && isFinite(Number(p.valor)); });
    if (passos.length < 3) return '';
    var comp = compacto(), W = comp ? 440 : 720, H = 250, L = 8, R = 8, T = 30, B = 58, iw = W - L - R, ih = H - T - B, n = passos.length, slot = iw / n, bw = Math.min(58, slot * 0.64);
    var run = 0, barras = [], topo = 0, fundo = 0;
    passos.forEach(function (p) {
      var v = num(p.valor), a, b;
      if (p.tipo === 'menos') { a = run; b = run + v; run = b; }
      else { a = 0; b = v; run = v; }
      barras.push({ p: p, v: v, lo: Math.min(a, b), hi: Math.max(a, b) });
      topo = Math.max(topo, a, b); fundo = Math.min(fundo, a, b);
    });
    if (topo === fundo) topo = fundo + 1;
    var y = function (v) { return T + ((topo - v) / (topo - fundo)) * ih; };
    var s = '<svg class="dg-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc('Cascata do mês médio: ' + passos.map(function (p) { return p.rotulo + ' ' + (num(p.valor) < 0 ? 'menos ' : '') + 'R$ ' + mil(Math.abs(num(p.valor))); }).join('; ')) + '">';
    s += '<line class="dg-eixo" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(0) + '" y2="' + y(0) + '"/>';
    barras.forEach(function (b, i) {
      var cx = L + slot * i + slot / 2, x = cx - bw / 2, y1 = y(b.hi), y2 = y(b.lo), hh = Math.max(2, y2 - y1);
      var cls = b.p.tipo === 'menos' ? 'dg-b-menos' : b.p.tipo === 'total' ? 'dg-b-total' : b.p.tipo === 'subtotal' ? 'dg-b-sub' : (b.v < 0 ? 'dg-b-neg' : 'dg-b-sobra');
      s += '<rect class="' + cls + '" x="' + x.toFixed(1) + '" y="' + y1.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hh.toFixed(1) + '" rx="4"><title>' + esc(b.p.rotulo + ': ' + (b.v < 0 ? '−' : '') + 'R$ ' + mil(Math.abs(b.v))) + '</title></rect>';
      // o valor fica sempre acima da barra (nas negativas, acima da linha de zero), longe do nome da categoria
      s += '<text class="dg-val" x="' + cx.toFixed(1) + '" y="' + (y1 - 7).toFixed(1) + '" text-anchor="middle">' + (b.p.tipo === 'menos' || b.v < 0 ? '−' : '') + esc(mil(Math.abs(b.v)).replace(/^−/, '')) + '</text>';
      var q = quebra(b.p.rotulo, comp ? 9 : 13);
      s += '<text class="dg-rot" x="' + cx.toFixed(1) + '" y="' + (H - B + 20) + '" text-anchor="middle">' + esc(q[0]) + '</text>' + (q[1] ? '<text class="dg-rot" x="' + cx.toFixed(1) + '" y="' + (H - B + 34) + '" text-anchor="middle">' + esc(q[1]) + '</text>' : '');
    });
    return s + '</svg>';
  }

  function mesesSvg(meses) {
    meses = arr(meses).filter(function (m) { return m && m.mes; });
    if (!meses.length) return '';
    var W = compacto() ? 440 : 720, H = 250, L = 10, R = 10, T = 36, B = 40, iw = W - L - R, ih = H - T - B, n = meses.length, slot = iw / n, bw = Math.min(54, slot * (compacto() ? 0.34 : 0.28));
    var dados = meses.map(function (m) { return { mes: m.mes, parcial: !!m.parcial, e: num(m.vendas), s: num(m.custos) + num(m.fixas) + num(m.folha) + num(m.impostos) + num(m.dividas) + num(m.retiradas) }; });
    var topo = Math.max.apply(null, dados.map(function (d) { return Math.max(d.e, d.s); }).concat([1]));
    var y = function (v) { return T + (1 - v / topo) * ih; };
    var s = '<svg class="dg-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc('Entradas e saídas por mês: ' + dados.map(function (d) { return rotuloMes(d.mes) + ' entradas R$ ' + mil(d.e) + ', saídas R$ ' + mil(d.s); }).join('; ')) + '">';
    s += '<rect class="dg-b-total" x="' + (L + 2) + '" y="8" width="10" height="10" rx="2"/><text class="dg-leg" x="' + (L + 17) + '" y="17">Entradas (vendas)</text>'
      + '<rect class="dg-b-saida" x="' + (L + 140) + '" y="8" width="10" height="10" rx="2"/><text class="dg-leg" x="' + (L + 155) + '" y="17">Saídas (tudo o que saiu da conta)</text>';
    s += '<line class="dg-eixo" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(0) + '" y2="' + y(0) + '"/>';
    dados.forEach(function (d, i) {
      var cx = L + slot * i + slot / 2;
      [[d.e, 'dg-b-total', cx - bw - 3], [d.s, 'dg-b-saida', cx + 3]].forEach(function (b) {
        var y1 = y(b[0]);
        s += '<rect class="' + b[1] + (d.parcial ? ' dg-parcial' : '') + '" x="' + b[2].toFixed(1) + '" y="' + y1.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(2, y(0) - y1).toFixed(1) + '" rx="4"><title>' + esc(rotuloMes(d.mes) + ': R$ ' + mil(b[0])) + '</title></rect>'
          + '<text class="dg-val" x="' + (b[2] + bw / 2).toFixed(1) + '" y="' + (y1 - 6).toFixed(1) + '" text-anchor="middle">' + esc(mil(b[0])) + '</text>';
      });
      s += '<text class="dg-rot" x="' + cx.toFixed(1) + '" y="' + (H - B + 20) + '" text-anchor="middle">' + esc(rotuloMes(d.mes)) + (d.parcial ? ' *' : '') + '</text>';
    });
    return s + '</svg>';
  }

  var CANAIS = { cartao: 'Cartões e maquininhas', app: 'Aplicativos e plataformas', pix: 'Pix e transferências', dinheiro: 'Depósitos em dinheiro', convenio: 'Convênios e planos', boleto: 'Boletos e cobranças', outro: 'Outras entradas' };
  function canaisHtml(canais) {
    var lista = Object.keys(canais || {}).map(function (k) { return { k: k, v: num(canais[k]) }; }).filter(function (x) { return x.v > 0; }).sort(function (a, b) { return b.v - a.v; });
    if (!lista.length) return '';
    return '<ul class="dg-canais">' + lista.map(function (x) {
      var v = Math.max(0, Math.min(100, x.v));
      return '<li><span>' + esc(CANAIS[x.k] || 'Outras entradas') + '</span><div class="dg-barra" data-nivel="solido" role="img" aria-label="' + esc((CANAIS[x.k] || 'Outras entradas') + ': ' + Math.round(v) + '%') + '"><span style="width:' + v + '%"></span></div><b>' + Math.round(x.v) + '%</b></li>';
    }).join('') + '</ul>';
  }

  function caixaSvg(caixa) {
    caixa = arr(caixa).filter(function (c) { return c && c.fim && isFinite(Number(c.saldo)); });
    if (caixa.length < 3) return '';
    var W = 440, H = 230, L = 10, R = 10, T = 30, B = 34, iw = W - L - R, ih = H - T - B, n = caixa.length; // sempre estreito: costuma ocupar meia largura
    var vs = caixa.map(function (c) { return num(c.saldo); }), topo = Math.max.apply(null, vs.concat([0])), fundo = Math.min.apply(null, vs.concat([0]));
    if (topo === fundo) topo = fundo + 1;
    var x = function (i) { return L + (n === 1 ? 0 : (iw * i) / (n - 1)); }, y = function (v) { return T + ((topo - v) / (topo - fundo)) * ih; };
    var pts = vs.map(function (v, i) { return x(i).toFixed(1) + ',' + y(v).toFixed(1); }).join(' ');
    var imin = vs.indexOf(Math.min.apply(null, vs)), ult = n - 1;
    var s = '<svg class="dg-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc('Saldo ao fim de cada semana: de R$ ' + mil(vs[0]) + ' a R$ ' + mil(vs[ult]) + ', mínimo de R$ ' + mil(vs[imin])) + '">';
    s += '<line class="dg-eixo dg-zero" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(0) + '" y2="' + y(0) + '"/>'
      + '<polygon class="dg-area" points="' + x(0).toFixed(1) + ',' + y(0).toFixed(1) + ' ' + pts + ' ' + x(ult).toFixed(1) + ',' + y(0).toFixed(1) + '"/><polyline class="dg-linha" points="' + pts + '"/>';
    [[0, 'start'], [imin, 'middle'], [ult, 'end']].forEach(function (p) {
      var i = p[0]; if (i === 0 && imin === 0) return;
      s += '<circle class="dg-pt' + (vs[i] < 0 ? ' dg-pt-neg' : '') + '" cx="' + x(i).toFixed(1) + '" cy="' + y(vs[i]).toFixed(1) + '" r="4"/>'
        + '<text class="dg-val" x="' + x(i).toFixed(1) + '" y="' + (y(vs[i]) - 9).toFixed(1) + '" text-anchor="' + p[1] + '">' + esc(mil(vs[i])) + '</text>';
    });
    s += '<text class="dg-rot" x="' + L + '" y="' + (H - 8) + '">' + esc(dm(caixa[0].fim)) + '</text><text class="dg-rot" x="' + (W - R) + '" y="' + (H - 8) + '" text-anchor="end">' + esc(dm(caixa[ult].fim)) + '</text>';
    return s + '</svg>';
  }

  function painelHtml(res) {
    var p = res.painel; if (!p) return '';
    var imp = res.importacao || null, h = '';
    h += '<section class="dg-sec dg-painel" aria-labelledby="dg-painel-t"><h3 id="dg-painel-t" class="dg-sec-t">Painel do seu negócio</h3>'
      + '<p class="dg-sec-sub">' + (imp ? 'Montado com os números do extrato que você importou' + (imp.periodo ? ' (' + esc(dm(imp.periodo.ini)) + ' a ' + esc(dm(imp.periodo.fim)) + ', ' + esc(String(imp.lancamentos || '')) + ' lançamentos)' : '') + ' e com o que você informou.' : 'Montado com os números que você informou. Valores de um mês médio.') + '</p>';
    h += '<div class="dg-kpis">' + arr(p.kpis).map(function (k) { return '<div class="dg-kpi"' + (k.tom === 'ruim' ? ' data-tom="ruim"' : '') + '><span>' + esc(k.rotulo) + '</span><strong>' + esc(k.valor) + '</strong></div>'; }).join('') + '</div>';
    var figs = '';
    var casc = cascataSvg(p.cascata);
    if (casc) figs += '<figure class="dg-fig dg-fig-larga"><figcaption>Da venda até o que sobra (mês médio, em reais)</figcaption>' + casc + '</figure>';
    var mes = imp ? mesesSvg(imp.meses) : '';
    if (mes) figs += '<figure class="dg-fig dg-fig-larga"><figcaption>Entradas e saídas mês a mês' + (arr(imp.meses).some(function (m) { return m.parcial; }) ? ' <small>(* mês incompleto no extrato)</small>' : '') + '</figcaption>' + mes + '</figure>';
    var can = imp ? canaisHtml(imp.canais) : '';
    if (can) figs += '<figure class="dg-fig"><figcaption>De onde vem a venda</figcaption>' + can + '</figure>';
    var cx = imp ? caixaSvg(imp.caixa) : '';
    if (cx) figs += '<figure class="dg-fig' + (can ? '' : ' dg-fig-larga') + '"><figcaption>Saldo ao fim de cada semana <small>(estimado a partir do saldo informado)</small></figcaption>' + cx + '</figure>';
    h += '<div class="dg-graficos">' + figs + '</div>';
    if (imp && num(imp.cobertura) && num(imp.cobertura) < 100) h += '<p class="dg-nota-painel">Cobertura da classificação das saídas: ' + Math.round(num(imp.cobertura)) + '%.' + (num(imp.naoClassificado) > 0 ? ' Cerca de R$ ' + mil(num(imp.naoClassificado)) + ' por mês ficaram sem classe e não entram nos cálculos.' : '') + '</p>';
    return h + '</section>';
  }

  function relatorioHtmlInterno(res, op) {
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
      + (res.modo === 'preciso' ? '<p class="dg-precisao" data-p="' + (res.precisao === 'exata' ? 'exata' : 'mista') + '">' + (res.precisao === 'exata'
        ? 'Modo preciso: os indicadores abaixo usam os números reais que você informou' + (res.importacao ? ' e os do extrato importado' : '') + ', não faixas.'
        : 'Modo preciso: parte dos números veio de faixas aproximadas (o relatório indica a fonte de cada um).') + '</p>' : '')
      + '</header>';

    /* interpretação integrada */
    h += '<section class="dg-interp" aria-labelledby="dg-interp-t"><p class="dg-eyebrow">Leitura integrada</p>'
      + '<h3 id="dg-interp-t">' + esc(interp.titulo) + '</h3><p>' + esc(interp.texto) + '</p>'
      + arr(interp.detalhes).map(function (d) { return '<p class="dg-interp-det">' + esc(d) + '</p>'; }).join('') + '</section>';

    /* painel gráfico (modo preciso) */
    h += painelHtml(res);

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
        return '<div><dt>' + esc(i.rotulo) + '</dt><dd><strong>' + esc(i.valor) + '</strong>' + (i.fonte ? '<em class="dg-fonte">' + esc(i.fonte) + '</em>' : '') + (i.nota ? '<span>' + esc(i.nota) + '</span>' : '') + '</dd></div>';
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
  }
  D.relatorioHtml = function (res, op) {
    forcarLargo = !!(op && op.largo);
    try { return relatorioHtmlInterno(res, op); } finally { forcarLargo = false; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
