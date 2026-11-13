/* ==========================================================================
   CM Diagnóstico — motor de análise.
   Funciona igual no navegador (percurso e relatório) e no painel (reabre o relatório de cada resposta).
   D.sequencia(r)  perguntas aplicáveis, na ordem, para as respostas r
   D.analisar(r)   resultado completo, só com dados simples (pode ir para o servidor e voltar como JSON)

   Três análises SEPARADAS (nunca uma nota única): saúde financeira, maturidade de gestão e eficiência operacional;
   seis dimensões; uma interpretação integrada; recomendações ordenadas por gravidade.
   Pontuação: cada resposta vale 0 a 3 (3 = melhor); cada indicador quantitativo também. A nota de uma dimensão ou
   análise é a média ponderada dos itens que a alimentam, em %.
   ========================================================================== */
(function (g) {
  'use strict';
  var D = g.CMDiag = g.CMDiag || {};
  var U = D._u;

  /* ------------------------------------------------------------------ formatação */
  function brl(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    var a = Math.abs(n), s;
    if (a >= 1000) {
      var k = Math.round(a / 100) / 10;
      s = (k % 1 === 0 ? String(k) : String(k).replace('.', ',')) + ' mil';
    } else s = String(Math.round(a / 10) * 10);
    return (n < 0 ? '−' : '') + 'R$ ' + s;
  }
  function pct(x) { return (x === null || x === undefined || !isFinite(x)) ? '—' : Math.round(x * 100) + '%'; }
  function lista(arr) { return arr.join(', ').replace(/, ([^,]*)$/, ' e $1'); }
  D.fmt = { brl: brl, pct: pct, lista: lista };

  /* ------------------------------------------------------------------ perguntas e respostas */
  function ctxDe(r) { return { r: r, seg: r.segmento || '' }; }
  function resolver(v, c) { return typeof v === 'function' ? v(c) : v; }
  D.tituloDe = function (q, r) { return resolver(q.titulo, ctxDe(r)); };
  D.ajudaDe = function (q, r) { return resolver(q.ajuda, ctxDe(r)) || ''; };
  D.opcoesDe = function (q, r) { return resolver(q.opcoes, ctxDe(r)) || []; };

  D.sequencia = function (r) {
    r = r || {};
    return D.PERGUNTAS.filter(function (q) { return q.se ? !!q.se(r) : true; });
  };

  function opcaoDe(q, r) {
    var ops = D.opcoesDe(q, r);
    for (var i = 0; i < ops.length; i++) if (ops[i].v === r[q.id]) return ops[i];
    return null;
  }
  D.respondida = function (q, r) {
    var v = r[q.id];
    if (q.tipo === 'multipla') return Array.isArray(v) && v.length > 0;
    if (q.tipo === 'texto') return q.opcional ? true : !!(v && String(v).trim());
    return v !== undefined && v !== null && v !== '';
  };
  D.rotuloResposta = function (q, r) {
    var v = r[q.id];
    if (q.tipo === 'texto') return v ? String(v) : '—';
    if (q.tipo === 'multipla') {
      var ops = D.opcoesDe(q, r);
      return (Array.isArray(v) ? v : []).map(function (x) { var o = ops.filter(function (p) { return p.v === x; })[0]; return o ? o.t : x; }).join(', ') || '—';
    }
    var o = opcaoDe(q, r);
    return o ? o.t : '—';
  };
  /* só as respostas que ainda se aplicam (quem volta e muda o perfil não leva respostas antigas para o relatório) */
  D.respostasAplicaveis = function (r) {
    var out = {};
    D.sequencia(r).forEach(function (q) { if (r[q.id] !== undefined && r[q.id] !== null) out[q.id] = r[q.id]; });
    return out;
  };

  /* ------------------------------------------------------------------ pontuação */
  /* interpolação linear: x >= t3 → 3, x = t2 → 2, x = t1 → 1, abaixo cai até 0 (na distância t2−t1 abaixo de t1) */
  function escala(x, t3, t2, t1) {
    if (x >= t3) return 3;
    if (x >= t2) return 2 + (x - t2) / (t3 - t2);
    if (x >= t1) return 1 + (x - t1) / (t2 - t1);
    var t0 = t1 - (t2 - t1);
    return Math.max(0, (x - t0) / (t1 - t0));
  }
  function r2(x) { return Math.round(x * 100) / 100; }
  function media(itens) {
    var s = 0, w = 0;
    itens.forEach(function (i) { s += i.pts * i.peso; w += i.peso; });
    return w ? (s / (3 * w)) * 100 : null;
  }
  function nivelDe(p) {
    if (p === null || p === undefined) return null;
    return p < 35 ? 'critico' : p < 55 ? 'atencao' : p < 75 ? 'desenvolvimento' : 'solido';
  }
  D.NIVEIS = {
    critico: 'Ponto crítico', atencao: 'Atenção', desenvolvimento: 'Em desenvolvimento', solido: 'Sólido',
  };
  D.nivelDe = nivelDe;

  /* ------------------------------------------------------------------ análise */
  D.analisar = function (rBruto) {
    var r = D.respostasAplicaveis(rBruto || {});
    var seg = r.segmento || 'outro';
    var seq = D.sequencia(r);
    var porId = {};
    seq.forEach(function (q) { porId[q.id] = q; });

    function opt(id) { var q = porId[id]; return q ? opcaoDe(q, r) : null; }
    function num(id) { var o = opt(id); return o && o.n !== null && o.n !== undefined ? o.n : null; }
    function pts(id) { var o = opt(id); return o && o.p !== null && o.p !== undefined ? o.p : null; }
    function resp(id) { var o = opt(id); return o ? o.t : ''; }

    /* ---------- indicadores quantitativos (estimados a partir das faixas) ---------- */
    var equipe = r.equipe && r.equipe !== 'solo';
    var fat = num('fat'), custo = num('custo'), fixas = num('fixas'), folha = equipe ? num('folha') : 0;
    var faltam = [];
    if (fat === null) faltam.push('o faturamento');
    if (custo === null) faltam.push('os custos diretos');
    if (fixas === null) faltam.push('as despesas fixas');
    if (equipe && folha === null) faltam.push('a folha de pagamento');

    var pctApp = num('dv_app_pct'), taxaApp = num('dv_app_taxa');
    var appFees = (fat !== null && pctApp !== null && taxaApp !== null) ? fat * pctApp * taxaApp : null;
    var custoVar = custo !== null ? custo + (appFees || 0) : null;
    var fixosTot = (fixas !== null && folha !== null) ? fixas + folha : null;
    var lim = D.LIM_MARGEM[seg] || D.LIM_MARGEM.outro;

    var margem = (fat && custoVar !== null) ? (fat - custoVar) / fat : null;
    var resultado = (fat && custoVar !== null && fixosTot !== null) ? fat - custoVar - fixosTot : null;
    var pe = null, folga = null;
    if (margem !== null && fixosTot !== null && fat) {
      if (margem > 0) { pe = fixosTot / margem; folga = (fat - pe) / fat; } else { pe = Infinity; folga = -1; }
    }
    var parcela = num('dv_parcela'), saldo = num('dv_saldo');
    var parcelaPct = (parcela !== null && fat) ? parcela / fat : null;
    var reservaMeses = num('reserva');
    var perdasMes = num('dv_perdas');

    var ptsMargem = margem !== null ? escala(margem, lim[0], lim[1], lim[2]) : null;
    var ptsResultado = (resultado !== null && fat) ? escala(resultado / fat, 0.20, 0.10, 0.03) : null;
    var ptsFolga = folga !== null ? (folga <= 0 ? 0 : escala(folga, 0.35, 0.20, 0.08)) : null;
    var ptsParcela = (parcelaPct !== null && r.dividas && r.dividas !== 'nao') ? escala(-parcelaPct, -0.05, -0.10, -0.20) : null;

    var ind = {
      fat: fat, custo: custo, fixas: fixas, folha: folha, fixosTot: fixosTot, custoVar: custoVar, appFees: appFees,
      margem: margem, resultado: resultado, pe: pe, folga: folga, parcela: parcela, saldo: saldo, parcelaPct: parcelaPct,
      reservaMeses: reservaMeses, perdasMes: perdasMes, faltam: faltam, limMargem: lim,
      ptsMargem: ptsMargem, ptsResultado: ptsResultado, ptsFolga: ptsFolga, ptsParcela: ptsParcela,
    };

    /* ---------- itens pontuados ---------- */
    var itens = [];
    seq.forEach(function (q) {
      if (!q.pontua || !D.respondida(q, r)) return;
      var o = opcaoDe(q, r);
      if (!o || o.p === null || o.p === undefined) return;
      itens.push({ id: q.id, curto: q.curto || q.id, resposta: o.t, pts: r2(o.p), peso: q.pontua.peso || 1, dim: q.pontua.dim, analise: q.pontua.analise });
    });
    function ind2(id, curto, valor, p, peso, dim) {
      if (p === null) return;
      itens.push({ id: id, curto: curto, resposta: valor, pts: r2(p), peso: peso, dim: dim, analise: 'saude', calculado: true });
    }
    ind2('ind_margem', 'Margem de contribuição estimada', pct(margem), ptsMargem, 1.5, 'D2');
    ind2('ind_resultado', 'Resultado estimado do mês', resultado !== null ? brl(resultado) + ' (' + pct(resultado / fat) + ' do faturamento)' : '', ptsResultado, 1.5, 'D2');
    ind2('ind_folga', 'Folga sobre o ponto de equilíbrio', pct(folga), ptsFolga, 1, 'D3');
    ind2('ind_parcelas', 'Parcelas de dívidas sobre o faturamento', pct(parcelaPct), ptsParcela, 1, 'D3');

    /* ---------- análises e dimensões ---------- */
    var analises = {};
    ['saude', 'maturidade', 'eficiencia'].forEach(function (a) {
      var its = itens.filter(function (i) { return i.analise === a; });
      var p = media(its);
      var ordenados = its.slice().sort(function (x, y) { return x.pts - y.pts; });
      analises[a] = {
        nome: D.ANALISES[a].nome,
        desc: a === 'eficiencia' ? (D.EFICIENCIA_DESC[seg] || D.EFICIENCIA_DESC.outro) : D.ANALISES[a].desc,
        pct: p === null ? null : Math.round(p), nivel: nivelDe(p), n: its.length,
        atencao: ordenados.filter(function (i) { return i.pts <= 1.5; }).slice(0, 3).map(corte),
        fortes: ordenados.slice().reverse().filter(function (i) { return i.pts >= 2.5; }).slice(0, 3).map(corte),
      };
    });
    function corte(i) { return { curto: i.curto, resposta: i.resposta, pts: i.pts }; }
    analises.saude.confianca = (faltam.length === 0) ? 'alta' : (fat !== null && faltam.length === 1) ? 'parcial' : 'baixa';

    var dimensoes = D.DIMENSOES.map(function (d) {
      var its = itens.filter(function (i) { return i.dim === d.id; });
      var p = media(its);
      var fontes = [];
      its.forEach(function (i) { if (fontes.indexOf(i.analise) === -1) fontes.push(i.analise); });
      return { id: d.id, nome: d.nome, desc: d.desc, pct: p === null ? null : Math.round(p), nivel: nivelDe(p), n: its.length, analises: fontes };
    });

    /* ---------- interpretação integrada ---------- */
    var S = analises.saude, M = analises.maturidade, E = analises.eficiencia;
    var semNumeros = S.pct === null || S.confianca === 'baixa';
    var sOk = S.pct !== null && S.pct >= 55, mOk = M.pct !== null && M.pct >= 55;
    var interp;
    if (semNumeros) {
      interp = { chave: 'sem_numeros', titulo: 'Ainda faltam números para avaliar',
        texto: 'Não foi possível avaliar a saúde financeira com segurança porque faltaram números básicos (' + lista(faltam.length ? faltam : ['faturamento, custos ou despesas']) + '). Isso já é um achado: sem esses números, o negócio decide no escuro. O primeiro passo é medir.' };
    } else if (sOk && mOk) {
      interp = { chave: 'base_solida', titulo: 'Base sólida',
        texto: 'Os números fecham e existem processos para sustentar o resultado. O desafio agora é crescer com previsibilidade: metas, indicadores por produto ou serviço e planejamento de investimentos.' };
    } else if (sOk && !mOk) {
      interp = { chave: 'sem_sustentacao', titulo: 'Bom resultado, pouca sustentação',
        texto: 'Os números hoje são razoáveis, mas faltam controles para garantir que continuem assim. Sem registro, previsão e acompanhamento, uma queda de vendas ou um custo inesperado pode ser descoberto tarde demais.' };
    } else if (!sOk && mOk) {
      interp = { chave: 'organizado_pressionado', titulo: 'Organizado, mas pressionado',
        texto: 'Os controles existem, mas os números estão apertados. O problema provavelmente não é falta de organização: está na margem, nos preços, na estrutura de custos ou nas dívidas, e é aí que estão as maiores alavancas.' };
    } else {
      interp = { chave: 'em_alerta', titulo: 'Em alerta',
        texto: 'Falta enxergar e falta folga. O primeiro passo não é investir em ferramentas sofisticadas: é levantar os números básicos, separar o dinheiro pessoal do dinheiro do negócio e criar uma rotina simples de caixa.' };
    }
    var detalhes = [];
    if (E.pct !== null && E.pct < 55) {
      detalhes.push({
        alimentacao: 'A operação está consumindo margem: desperdício, estoque e custo por item pedem atenção, mesmo que o faturamento pareça bom.',
        saude: 'A forma de precificar e de ocupar a agenda está deixando dinheiro na mesa.',
        estetica: 'Consumo de produtos, custo por serviço e ocupação da agenda estão deixando margem pelo caminho.',
        comercio: 'Estoque, giro e compras estão prendendo dinheiro que poderia estar no caixa.',
        servicos: 'Sem saber o custo da hora e a rentabilidade por projeto, é difícil garantir que o trabalho dá lucro.',
        outro: 'A formação de preços e o acompanhamento dos custos diretos precisam de mais rigor.',
      }[seg]);
    } else if (E.pct !== null && E.pct >= 75) {
      detalhes.push('A eficiência operacional é um ponto forte e ajuda a proteger a margem.');
    }
    var comNota = dimensoes.filter(function (d) { return d.pct !== null; });
    if (comNota.length >= 3) {
      var ord = comNota.slice().sort(function (a, b) { return a.pct - b.pct; });
      var fraca = ord[0], forte = ord[ord.length - 1];
      detalhes.push('Dimensão mais frágil: ' + fraca.nome.toLowerCase() + '.' + (forte.pct >= 55 ? ' Mais forte: ' + forte.nome.toLowerCase() + '.' : ' Nenhuma dimensão chegou ainda a um patamar confortável.'));
    }
    interp.detalhes = detalhes;

    /* ---------- recomendações ---------- */
    var c = {
      r: r, seg: seg, ind: ind, p: pts, resp: resp, fmt: D.fmt,
      tem: function (id, v) { return U.tem(r[id], v); },
    };
    var recs = [];
    D.RECOMENDACOES.forEach(function (rec) {
      if (rec.seg && rec.seg.indexOf(seg) === -1) return;
      var s = rec.quando(c);
      if (!s || s <= 0) return;
      if (rec.id !== 'evoluir' && s < 0.45) return;
      var t = rec.texto(c);
      recs.push({ id: rec.id, dim: rec.dim, grav: s, score: s * rec.peso, titulo: t.titulo, porque: t.porque, acoes: t.acoes });
    });
    recs.sort(function (a, b) { return b.score - a.score; });
    var reais = recs.filter(function (x) { return x.id !== 'evoluir'; });
    if (reais.length >= 3) recs = reais;
    recs.forEach(function (x, i) {
      x.principal = i < 5;
      x.prioridade = x.score >= 0.95 ? 'alta' : x.score >= 0.6 ? 'media' : 'complementar';
      x.score = r2(x.score); x.grav = r2(x.grav);
    });

    /* ---------- indicadores para exibir ---------- */
    var indicadores = [];
    function add(rotulo, valor, nota) { indicadores.push({ rotulo: rotulo, valor: valor, nota: nota || '' }); }
    add('Faturamento mensal', fat !== null ? resp('fat') : 'Não informado', fat !== null ? 'Estimativa usada nas contas: ' + brl(fat) : '');
    add('Custos diretos', custo !== null ? resp('custo') : 'Não informado', custo !== null && fat ? pct(custo / fat) + ' do faturamento' + (appFees ? ' (+ ' + brl(appFees) + ' de taxas de plataformas)' : '') : '');
    add('Margem de contribuição estimada', margem !== null ? pct(margem) : 'Não calculável', margem !== null ? 'O que sobra de cada venda depois dos custos diretos. Referência do segmento: acima de ' + pct(lim[1]) : 'Falta faturamento ou custos');
    add('Despesas fixas' + (equipe ? ' e folha' : ''), fixosTot !== null ? brl(fixosTot) + ' por mês' : 'Não informado', fixosTot !== null && fat ? pct(fixosTot / fat) + ' do faturamento' : '');
    add('Resultado estimado do mês', resultado !== null ? brl(resultado) : 'Não calculável', resultado !== null ? 'Antes da sua retirada pessoal e dos juros' + (fat ? ' · ' + pct(resultado / fat) + ' do faturamento' : '') : 'Faltam números básicos');
    add('Ponto de equilíbrio estimado', pe === null ? 'Não calculável' : pe === Infinity ? 'Fora do alcance' : brl(pe) + ' por mês', pe === null ? '' : pe === Infinity ? 'Com a margem estimada, o faturamento não cobre as despesas fixas' : (folga >= 0 ? 'Você fatura ' + pct(folga) + ' acima dele' : 'Está acima do que você fatura hoje'));
    add('Cobertura de caixa', resp('reserva') || 'Não informado', reservaMeses !== null ? 'Quanto tempo o dinheiro disponível paga as despesas' : '');
    if (r.dividas && r.dividas !== 'nao') add('Dívidas', resp('dividas'), (parcela !== null ? 'Parcelas de cerca de ' + brl(parcela) + ' por mês' + (parcelaPct !== null ? ' (' + pct(parcelaPct) + ' do faturamento)' : '') : '') + (saldo !== null ? (parcela !== null ? ' · ' : '') + 'Saldo devedor aproximado de ' + brl(saldo) : ''));

    /* ---------- perfil ---------- */
    var perfil = [];
    ['segmento', 'tempo', 'porte', 'equipe', 'modelo'].forEach(function (id) {
      var q = porId[id]; if (q && D.respondida(q, r)) perfil.push({ rotulo: q.curto, valor: D.rotuloResposta(q, r) });
    });
    var qTipo = seq.filter(function (q) { return q.etapa === 3 && /_tipo$/.test(q.id) && q.tipo === 'unica'; })[0];
    if (qTipo && D.respondida(qTipo, r)) perfil.push({ rotulo: qTipo.curto, valor: D.rotuloResposta(qTipo, r) });

    return {
      versao: D.VERSAO_MODELO, segmento: seg,
      perfil: perfil, indicadores: indicadores, analises: analises, dimensoes: dimensoes,
      interpretacao: interp, recomendacoes: recs,
      confianca: analises.saude.confianca,
    };
  };

  /* resumo para listas e e-mails */
  D.resumo = function (res) {
    var a = (res && res.analises) || {};
    function n(k) { return a[k] && a[k].nivel ? D.NIVEIS[a[k].nivel] : 'Sem dados'; }
    return { saude: n('saude'), maturidade: n('maturidade'), eficiencia: n('eficiencia') };
  };

  /* respostas de exemplo para a simulação (alimentação, dono sozinho, margem apertada) */
  D.EXEMPLO = {
    segmento: 'alimentacao', tempo: 't2', porte: 'me', equipe: 'solo', modelo: 'presencial',
    fat: 'f3', custo: 'c3', fixas: 'x4', dividas: 'dificil', reserva: 'r1', rec: ['pix', 'din', 'deb', 'cre', 'app'],
    al_tipo: 'rest', al_estoque: 'cont', al_desperdicio: 'perc', al_custo_item: 'conc', al_compras: 'sem2',
    org_separa: 'parc', org_registro: 'caderno', org_contas: 'c', org_retirada: 'sobra', org_lucro: 'sobra',
    org_planejamento: 'c', org_invest: 'b', org_acomp: 'falta',
    dv_app_pct: 'p2', dv_app_taxa: 't3', dv_app_preco: 'b', dv_cartao: 'b', dv_estoque_freq: 'b', dv_perdas: 'p4', dv_fichas: 'c',
    dv_parcela: 'b', dv_saldo: 'b',
  };
})(typeof window !== 'undefined' ? window : globalThis);
