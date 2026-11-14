<?php
/** CM Diagnóstico: percurso adaptativo de análise financeira (a lógica roda no navegador; ver assets/js/diagnostico*.js). */
declare(strict_types=1);
require __DIR__ . '/../conteudos/_layout.php';

cmAbrir([
  'titulo' => 'CM Diagnóstico',
  'descricao' => 'Diagnóstico financeiro gratuito para pequenos negócios: análise de saúde financeira, maturidade de gestão e eficiência operacional, adaptada ao seu segmento, em cerca de 6 minutos.',
  'caminho' => '/diagnostico/',
  'css' => ['/assets/css/diagnostico.css?v=4'],
  'corpo' => 'pg-dg dg-root',
  'ativo' => 'diagnostico', // marca o item "Diagnóstico grátis" do menu
]);
?>
<div id="dg-app" aria-live="polite">
  <noscript><p>O CM Diagnóstico precisa do JavaScript ativado para funcionar. Se preferir, fale com a CM pelo <a href="https://wa.me/<?= CM_WHATS ?>">WhatsApp</a>.</p></noscript>
</div>
<?php
cmFechar([
  'js' => [
    '/assets/js/diagnostico-dados.js?v=3',
    '/assets/js/diagnostico-recs.js?v=2',
    '/assets/js/diagnostico-motor.js?v=3',
    '/assets/js/diagnostico-relatorio.js?v=3',
    '/assets/js/diagnostico-importar.js?v=2',
    '/assets/js/diagnostico.js?v=4',
  ],
]);
