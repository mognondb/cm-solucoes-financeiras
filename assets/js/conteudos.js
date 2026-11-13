// Páginas de conteúdos e de venda de infoprodutos: menu no celular, ampliar imagens,
// copiar fórmula/link e barra de compra fixa. Sem dependências.
(function () {
  'use strict';

  // menu do celular (mesmo comportamento da página inicial)
  var header = document.querySelector('.site-header');
  var toggle = document.getElementById('navToggle');
  if (header && toggle) {
    toggle.addEventListener('click', function () {
      var aberto = header.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(aberto));
    });
    var nav = document.getElementById('nav');
    if (nav) nav.addEventListener('click', function (e) { if (e.target.tagName === 'A') header.classList.remove('open'); });
  }

  // ampliar imagem ao clicar
  function fechar() {
    var lb = document.querySelector('.lb');
    if (lb) lb.remove();
  }
  document.addEventListener('click', function (e) {
    var img = e.target.closest && e.target.closest('img[data-zoom]');
    if (img) {
      fechar();
      var lb = document.createElement('div');
      lb.className = 'lb';
      lb.setAttribute('role', 'dialog');
      lb.setAttribute('aria-label', 'Imagem ampliada');
      var g = document.createElement('img');
      g.src = img.currentSrc || img.src;
      g.alt = img.alt || '';
      var x = document.createElement('button');
      x.type = 'button';
      x.setAttribute('aria-label', 'Fechar');
      x.textContent = '×';
      lb.appendChild(g);
      lb.appendChild(x);
      lb.addEventListener('click', fechar);
      document.body.appendChild(lb);
      return;
    }
    var copiar = e.target.closest && e.target.closest('[data-copiar]');
    if (copiar) {
      var code = copiar.closest('.b-formula').querySelector('code');
      copiarTexto(code ? code.textContent : '', copiar, 'Copiado!');
      return;
    }
    var link = e.target.closest && e.target.closest('[data-copiar-link]');
    if (link) copiarTexto(link.getAttribute('data-copiar-link') || location.href, link, 'Link copiado!');
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fechar(); });

  function copiarTexto(texto, botao, aviso) {
    var original = botao.textContent;
    function ok() {
      botao.textContent = aviso;
      setTimeout(function () { botao.textContent = original; }, 1600);
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(texto).then(ok, function () { alternativo(); });
    } else {
      alternativo();
    }
    function alternativo() {
      var t = document.createElement('textarea');
      t.value = texto;
      t.setAttribute('readonly', '');
      t.style.position = 'fixed';
      t.style.opacity = '0';
      document.body.appendChild(t);
      t.select();
      try { document.execCommand('copy'); ok(); } catch (err) { /* sem permissão: nada a fazer */ }
      t.remove();
    }
  }

  // barra de compra: aparece quando o botão principal sai da tela
  var barra = document.getElementById('buybar');
  var botao = document.getElementById('vendaBotao');
  if (barra && botao && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (itens) {
      var visivel = itens[0].isIntersecting;
      var abaixo = itens[0].boundingClientRect.top > 0; // ainda não chegou no botão: não mostra
      var mostrar = !visivel && !abaixo;
      barra.hidden = !mostrar;
      document.body.classList.toggle('tem-buybar', mostrar);
    });
    io.observe(botao);
  }
})();
