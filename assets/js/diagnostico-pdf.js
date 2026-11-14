/* CM Diagnóstico: relatório em PDF, gerado no navegador.

   Por que no navegador: as regras e os textos do relatório vivem no JavaScript (o servidor só guarda as respostas), e
   assim o PDF sai igual ao que a pessoa está vendo. O relatório é desenhado num quadro invisível de largura fixa (o
   layout "de computador" em qualquer aparelho), fotografado em faixas do tamanho de uma página A4 e montado com
   cabeçalho, rodapé e numeração. Os cortes só acontecem em pontos seguros: nunca no meio de um cartão, gráfico ou
   parágrafo, nem logo abaixo de um título.

   jsPDF e html2canvas ficam em assets/vendor (não vêm de CDN) e só são carregados na hora de gerar.
   O PDF não leva links nem ações: o servidor recusa PDFs com isso (ver validarPdfDiagnostico em api/index.php).

   API: CMDiag.pdf.gerar(resultado, { nome, empresa, simulacao, progresso(0..1) }) -> Promise<{ blob, nome, base64() }>
        CMDiag.pdf.baixar(arquivo) */
(function () {
  'use strict';
  var D = window.CMDiag = window.CMDiag || {};

  var LIBS = { h2c: '/assets/vendor/html2canvas.min.js?v=1.4.1', pdf: '/assets/vendor/jspdf.umd.min.js?v=4.2.1' };
  var LARG = 812;                                   // largura (px) do relatório: a mesma que ele tem na tela de um computador
  var VISTA = 1200;                                 // largura da "janela" do quadro: acima dos pontos de quebra do CSS, para valer o layout de computador mesmo no celular
  var ESCALA = 2;                                   // nitidez da imagem
  var PG = { w: 210, h: 297, mx: 12, topo: 23, rodape: 15 };          // página A4 e margens, em mm
  var MM_PX = (PG.w - 2 * PG.mx) / LARG;            // mm por px do quadro
  var ALTURA_PX = (PG.h - PG.topo - PG.rodape) / MM_PX;               // altura útil de uma página, em px do quadro
  var MANTER_COM_TITULO = 70;                       // px de conteúdo que acompanham um título (não deixa título sozinho no fim da página)
  var ORCAMENTO_BYTES = 4200000;                    // passando disso, as próximas páginas saem com mais compressão (o servidor aceita até 6 MB)

  // blocos que não podem ser cortados ao meio
  var SEL_INTEIROS = '.dg-card, .dg-dim, .dg-rec, .dg-fig, .dg-kpi, .dg-interp, .dg-rel-topo, .dg-legenda, .dg-precisao, .dg-aviso, .dg-origem, .dg-barra, .dg-ind > div, svg, table, tr, p, li, dt, dd';
  var SEL_TITULOS = 'h1, h2, h3, h4, .dg-eyebrow, .dg-sec-t, .dg-sec-sub';

  /* ------------------------------------------------------------------ bibliotecas sob demanda */
  var carregando = null;
  function script(src) {
    return new Promise(function (ok, no) {
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = function () { ok(); };
      s.onerror = function () { no(new Error('Não foi possível carregar o gerador de PDF.')); };
      document.head.appendChild(s);
    });
  }
  function bibliotecas() {
    if (window.html2canvas && window.jspdf) return Promise.resolve();
    if (!carregando) {
      carregando = Promise.all([window.html2canvas ? 0 : script(LIBS.h2c), window.jspdf ? 0 : script(LIBS.pdf)]).catch(function (e) { carregando = null; throw e; });
    }
    return carregando;
  }

  /* ------------------------------------------------------------------ utilidades */
  function pausa(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }
  // a fonte padrão do PDF só tem o alfabeto latino (Latin-1): letras fora dele perdem o acento em vez de sair como lixo
  function latin(s) {
    return String(s == null ? '' : s).replace(/[^\x20-\x7E\xA0-\xFF]/g, function (c) {
      var d = c.normalize ? c.normalize('NFD').replace(/[̀-ͯ]/g, '') : '';
      return /^[\x20-\x7E\xA0-\xFF]+$/.test(d) ? d : '';
    }).replace(/\s+/g, ' ').trim();
  }
  function slug(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
  }
  function dataBR(d) { return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear(); }
  function dataISO(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function paraBase64(buf) {
    var b = new Uint8Array(buf), s = '', T = 0x8000;
    for (var i = 0; i < b.length; i += T) s += String.fromCharCode.apply(null, b.subarray(i, i + T));
    return btoa(s);
  }

  function carregarLogo() {
    return new Promise(function (ok) {
      var img = new Image();
      img.onload = function () {
        try {
          var c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
          c.getContext('2d').drawImage(img, 0, 0);
          ok({ url: c.toDataURL('image/png'), proporcao: img.naturalWidth / img.naturalHeight });
        } catch (e) { ok(null); }
      };
      img.onerror = function () { ok(null); };
      img.src = '/assets/img/logo-cm.png';
    });
  }

  /* ------------------------------------------------------------------ o relatório num quadro invisível */
  function criarQuadro(corpoHtml) {
    return new Promise(function (ok, no) {
      var links = Array.prototype.slice.call(document.querySelectorAll('link[rel="stylesheet"]')).map(function (l) { return '<link rel="stylesheet" href="' + l.href + '">'; }).join('');
      var css = 'html,body{margin:0;padding:0;background:#fff!important}body{width:' + LARG + 'px;overflow:visible}'
        + '#dg-app{max-width:none!important;width:' + LARG + 'px!important;margin:0!important;padding:0!important}'
        + '*{animation:none!important;transition:none!important}'
        + '.dg-card,.dg-dim,.dg-rec,.dg-interp{box-shadow:none!important}'
        + '.dg-mais summary,.dg-rel-acoes,.dg-cta,.dg-aviso-envio,.dg-topo{display:none!important}';
      var f = document.createElement('iframe');
      f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
      f.style.cssText = 'position:fixed;left:-10000px;top:0;width:' + VISTA + 'px;height:1400px;border:0;opacity:0;pointer-events:none';
      var fim = setTimeout(function () { ok(f); }, 15000); // se algum arquivo de estilo travar, segue assim mesmo
      f.onload = function () { clearTimeout(fim); ok(f); };
      f.onerror = function () { clearTimeout(fim); no(new Error('Não foi possível montar o relatório para o PDF.')); };
      f.srcdoc = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><base href="' + location.origin + '/">' + links + '<style>' + css + '</style></head>'
        + '<body class="pg-dg dg-root"><div id="dg-app"><div class="dg-relatorio">' + corpoHtml + '</div></div></body></html>';
      document.body.appendChild(f);
    });
  }

  // O html2canvas transforma cada SVG em imagem sozinha, sem as folhas de estilo: as cores dos gráficos (vindas de classes CSS
  // e variáveis) sumiriam. Fixa o estilo já calculado em cada elemento do SVG antes da captura.
  function fixarSvg(doc, win) {
    var props = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'fill-opacity', 'stroke-opacity', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'letter-spacing'];
    Array.prototype.forEach.call(doc.querySelectorAll('svg, svg *'), function (el) {
      var cs = win.getComputedStyle(el), s = '';
      props.forEach(function (p) { var v = cs.getPropertyValue(p); if (v) s += p + ':' + v + ';'; });
      el.setAttribute('style', s + (el.getAttribute('style') || ''));
    });
  }

  /* ------------------------------------------------------------------ onde cortar */
  function caixas(doc, win) {
    var lista = [], top0 = win.pageYOffset || 0;
    function rect(el) { var r = el.getBoundingClientRect(); return { top: r.top + top0, bottom: r.bottom + top0, h: r.height }; }
    Array.prototype.forEach.call(doc.querySelectorAll(SEL_INTEIROS), function (el) { var r = rect(el); if (r.h > 2) lista.push(r); });
    Array.prototype.forEach.call(doc.querySelectorAll(SEL_TITULOS), function (el) { var r = rect(el); if (r.h > 2) lista.push({ top: r.top, bottom: r.bottom + MANTER_COM_TITULO }); });
    return lista;
  }
  function faixas(total, lista) {
    var out = [], y0 = 0;
    while (y0 < total - 2) {
      var y1 = Math.min(Math.floor(y0 + ALTURA_PX), total);
      if (y1 < total) {
        // empurra o corte para cima até nenhum bloco inteiro ficar atravessado por ele
        for (var volta = 0, mudou = true; mudou && volta < 300; volta++) {
          mudou = false;
          for (var i = 0; i < lista.length; i++) {
            var c = lista[i];
            // corta no px inteiro logo acima do bloco (a borda do bloco seguinte não vaza para esta página). A tolerância de 1,5 px
            // evita que blocos encostados um no outro empurrem o corte em cascata até o começo da seção.
            if (c.top < y1 - 1.5 && c.bottom > y1 + 1.5 && Math.floor(c.top) > y0 + 1) { y1 = Math.floor(c.top); mudou = true; }
          }
        }
        if (y1 < y0 + ALTURA_PX * 0.3) y1 = Math.min(Math.floor(y0 + ALTURA_PX), total); // bloco gigante: corta no limite da página
      }
      out.push([y0, y1]);
      y0 = y1;
    }
    return out.length ? out : [[0, total]];
  }

  /* ------------------------------------------------------------------ montagem do PDF */
  function cabecalhoERodape(pdf, logo, ctx, n, total) {
    var dir = PG.w - PG.mx, xTxt = PG.mx;
    if (logo) { var h = 10, w = h * logo.proporcao; pdf.addImage(logo.url, 'PNG', PG.mx, 6.5, w, h); xTxt = PG.mx + w + 3; }
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(63, 76, 57);
    pdf.text('CM Soluções Financeiras', xTxt, 10.8);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); pdf.setTextColor(107, 107, 99);
    pdf.text('Relatório do CM Diagnóstico', xTxt, 14.8);
    var quem = ctx.simulacao ? 'Exemplo ilustrativo' : (ctx.nome ? 'Preparado para ' + latin(ctx.nome).slice(0, 44) : '');
    if (quem) pdf.text(quem, dir, 10.8, { align: 'right' });
    var sub = [ctx.simulacao ? '' : latin(ctx.empresa).slice(0, 34), dataBR(ctx.data)].filter(Boolean).join('  ·  ');
    pdf.text(sub, dir, 14.8, { align: 'right' });
    pdf.setDrawColor(224, 218, 207); pdf.setLineWidth(0.3);
    pdf.line(PG.mx, 19, dir, 19);
    pdf.line(PG.mx, PG.h - 11.5, dir, PG.h - 11.5);
    pdf.setFontSize(8); pdf.setTextColor(107, 107, 99);
    pdf.text('CM Soluções Financeiras  ·  cmfinanceiro.com', PG.mx, PG.h - 7.2);
    pdf.text('Página ' + n + ' de ' + total, dir, PG.h - 7.2, { align: 'right' });
  }

  function montar(paginas, logo, ctx) {
    var J = window.jspdf.jsPDF;
    var pdf = new J({ unit: 'mm', format: 'a4', compress: true });
    // título em ASCII: o servidor confere a marca "CM Diagnostico" antes de anexar o PDF ao e-mail
    pdf.setProperties({ title: 'CM Diagnostico - Relatorio', subject: 'Relatorio do CM Diagnostico', author: 'CM Solucoes Financeiras', creator: 'CM Diagnostico', keywords: 'cm-diagnostico' });
    paginas.forEach(function (p, i) {
      if (i) pdf.addPage();
      pdf.addImage(p.url, 'JPEG', PG.mx, PG.topo, LARG * MM_PX, p.altura * MM_PX, undefined, 'FAST');
      cabecalhoERodape(pdf, logo, ctx, i + 1, paginas.length);
    });
    return pdf.output('arraybuffer');
  }

  /* ------------------------------------------------------------------ gerar */
  function gerar(res, o) {
    o = o || {};
    var progresso = typeof o.progresso === 'function' ? o.progresso : function () {};
    var ctx = { nome: o.nome || '', empresa: o.empresa || '', simulacao: !!o.simulacao, data: new Date() };
    var quadro = null;
    progresso(0.02);
    return Promise.all([bibliotecas(), carregarLogo()]).then(function (r) {
      var logo = r[1];
      progresso(0.1);
      return criarQuadro(D.relatorioHtml(res, { simulacao: ctx.simulacao, cta: false, largo: true })).then(function (f) {
        quadro = f;
        var doc = f.contentDocument, win = f.contentWindow;
        Array.prototype.forEach.call(doc.querySelectorAll('details'), function (d) { d.open = true; });
        var pronto = doc.fonts && doc.fonts.ready ? doc.fonts.ready.catch(function () {}) : Promise.resolve();
        return pronto.then(function () { return pausa(60); }).then(function () {
          fixarSvg(doc, win);
          var total = Math.ceil(Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight));
          var cortes = faixas(total, caixas(doc, win));
          var paginas = [], soma = 0, qualidade = 0.86;
          // uma página por vez (e cedendo o fio de execução entre elas): a tela continua respondendo
          return cortes.reduce(function (cadeia, corte, i) {
            return cadeia.then(function () {
              return window.html2canvas(doc.body, {
                scale: ESCALA, backgroundColor: '#ffffff', logging: false, useCORS: true,
                x: 0, y: corte[0], width: LARG, height: Math.ceil(corte[1] - corte[0]), windowWidth: VISTA, windowHeight: total, scrollX: 0, scrollY: 0,
              }).then(function (canvas) {
                var url = canvas.toDataURL('image/jpeg', qualidade);
                soma += url.length * 0.75;
                if (soma > ORCAMENTO_BYTES) qualidade = 0.6;
                paginas.push({ url: url, altura: corte[1] - corte[0] });
                canvas.width = canvas.height = 0; // libera a memória da página já convertida
                progresso(0.1 + 0.8 * (i + 1) / cortes.length);
                return pausa(0);
              });
            });
          }, Promise.resolve()).then(function () {
            var buf = montar(paginas, logo, ctx);
            progresso(1);
            var nome = 'CM-Diagnostico-' + (slug(ctx.empresa) || slug(ctx.nome) || 'relatorio') + '-' + dataISO(ctx.data) + '.pdf';
            return { blob: new Blob([buf], { type: 'application/pdf' }), nome: nome, bytes: buf.byteLength, paginas: paginas.length, base64: function () { return paraBase64(buf); } };
          });
        });
      });
    }).then(function (arq) {
      if (quadro && quadro.parentNode) quadro.parentNode.removeChild(quadro);
      return arq;
    }, function (e) {
      if (quadro && quadro.parentNode) quadro.parentNode.removeChild(quadro);
      throw e;
    });
  }

  function baixar(arq) {
    var url = URL.createObjectURL(arq.blob);
    var a = document.createElement('a');
    a.href = url; a.download = arq.nome; a.rel = 'noopener';
    document.body.appendChild(a); a.click();
    setTimeout(function () { if (a.parentNode) a.parentNode.removeChild(a); URL.revokeObjectURL(url); }, 4000);
  }

  D.pdf = { gerar: gerar, baixar: baixar };
})();
