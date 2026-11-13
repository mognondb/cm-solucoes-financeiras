<?php
/**
 * /conteudos/capa/<endereço>.png: imagem de capa provisória (com o título) de uma publicação sem capa.
 * É o que aparece na prévia do link quando a publicação é compartilhada. Nunca dá erro: se não achar a
 * publicação ou se o servidor não conseguir desenhar, entrega a imagem fixa da marca.
 */
declare(strict_types=1);
require __DIR__ . '/_layout.php';
require __DIR__ . '/_capa.php';

function cmCapaPadrao(int $cache = 3600): void {
  header('Content-Type: image/png');
  header('Cache-Control: public, max-age=' . $cache);
  readfile(dirname(__DIR__) . '/assets/img/capa-padrao.png');
  exit;
}

$slug = strtolower(trim((string)($_GET['slug'] ?? '')));
if (!preg_match('/^[a-z0-9-]{1,160}$/', $slug)) cmCapaPadrao();

$db = cmDb();
blogMigrar($db);
$r = blogPostPorSlug($db, $slug);
if (!$r) cmCapaPadrao();

$venda = ($r['tipo'] ?? 'blog') === 'infoproduto';
$rotulo = trim((string)($r['categoria'] ?? '')) ?: ($venda ? 'Infoproduto' : BLOG_NOME_PUBLICO);
$selo = $venda ? (!empty($r['gratuito']) ? 'Grátis' : trim((string)($r['preco_label'] ?? ''))) : '';
$png = cmCapaDesenhar((string)$r['titulo'], $rotulo, $selo);
if ($png === null) cmCapaPadrao();

header('Content-Type: image/png');
header('Cache-Control: public, max-age=604800'); // o endereço muda sozinho (?v=) quando o título muda
header('Content-Length: ' . strlen($png));
echo $png;
