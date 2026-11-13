<?php
/** Mapa do site para os buscadores: página inicial, lista de conteúdos e cada post publicado. */
declare(strict_types=1);
require __DIR__ . '/_layout.php';

$db = cmDb();
blogMigrar($db);
$o = cmOrigem();
$stmt = $db->prepare("SELECT slug, tipo, publicado_em, atualizado_em FROM posts WHERE status = 'publicado' AND publicado_em IS NOT NULL AND publicado_em <= ? ORDER BY publicado_em DESC");
$stmt->execute([nowIso()]);
header('Content-Type: application/xml; charset=utf-8');
echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc><?= blogEsc($o) ?>/</loc></url>
  <url><loc><?= blogEsc($o) ?>/conteudos/</loc></url>
<?php foreach ($stmt->fetchAll() as $r): ?>
  <url><loc><?= blogEsc($o . blogUrlDoPost($r)) ?></loc><lastmod><?= blogEsc(substr((string)($r['atualizado_em'] ?: $r['publicado_em']), 0, 10)) ?></lastmod></url>
<?php endforeach; ?>
</urlset>
