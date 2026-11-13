<?php
/** Lista pública de todos os conteúdos: o mais recente em destaque, depois os demais, com filtro por categoria. */
declare(strict_types=1);
require __DIR__ . '/_layout.php';

$db = cmDb();
blogMigrar($db);

$cat = trim((string)($_GET['categoria'] ?? '')) ?: null;
$pag = max(1, (int)($_GET['pagina'] ?? 1));
$res = blogPublicados($db, 10, $pag, $cat, 'blog');
$cats = blogCategorias($db);
$posts = $res['posts'];
$destaque = (!$cat && $res['pagina'] === 1 && $posts) ? array_shift($posts) : null;

$href = function (int $p) use ($cat): string {
  $q = [];
  if ($cat) $q['categoria'] = $cat;
  if ($p > 1) $q['pagina'] = $p;
  return '/conteudos/' . ($q ? '?' . http_build_query($q) : '');
};

cmAbrir([
  'titulo' => $cat ? BLOG_NOME_PUBLICO . ': ' . $cat : BLOG_NOME_PUBLICO,
  'descricao' => 'Guias, manuais de planilhas, apresentações de dashboards e novidades da CM Soluções Financeiras para organizar e entender o financeiro da sua empresa.',
  'caminho' => $href($res['pagina']),
  'ativo' => 'conteudos',
  'jsonld' => [['@context' => 'https://schema.org', '@type' => 'CollectionPage', 'name' => BLOG_NOME_PUBLICO . ' | ' . CM_SITE_NOME, 'url' => cmOrigem() . '/conteudos/']],
]);
?>
<section class="c-topo">
  <div class="container">
    <p class="eyebrow"><?= $cat ? 'Categoria' : 'Aprenda · Entenda · Aplique' ?></p>
    <h1><?= $cat ? blogEsc($cat) : 'Ideias, guias e novidades para o seu financeiro' ?></h1>
    <p class="c-topo-sub">Manuais de planilhas, apresentações de painéis, boas práticas de gestão e tudo o que a CM vem aprendendo no dia a dia das empresas.</p>
  </div>
</section>

<section class="c-lista">
  <div class="container">
    <?php if ($cats): ?>
    <nav class="c-chips" aria-label="Categorias">
      <a href="/conteudos/"<?= !$cat ? ' class="on" aria-current="true"' : '' ?>>Tudo</a>
      <?php foreach ($cats as $c): ?>
      <a href="/conteudos/?categoria=<?= rawurlencode($c['categoria']) ?>"<?= $cat === $c['categoria'] ? ' class="on" aria-current="true"' : '' ?>><?= blogEsc($c['categoria']) ?></a>
      <?php endforeach; ?>
    </nav>
    <?php endif; ?>

    <?php if (!$res['total']): ?>
      <div class="c-vazio">
        <p><?= $cat ? 'Ainda não há conteúdos nesta categoria.' : 'Em breve, novos conteúdos por aqui.' ?></p>
        <?php if ($cat): ?><p><a class="btn btn-outline" href="/conteudos/">Ver todos</a></p><?php endif; ?>
      </div>
    <?php else: ?>
      <?php if ($destaque): ?><?= cmCard($destaque, true) ?><?php endif; ?>
      <?php if ($posts): ?>
      <div class="c-grid">
        <?php foreach ($posts as $p): ?><?= cmCard($p) ?><?php endforeach; ?>
      </div>
      <?php endif; ?>
      <?= cmPaginar($res['pagina'], $res['paginas'], $href) ?>
    <?php endif; ?>
  </div>
</section>
<?php cmFechar(); ?>
