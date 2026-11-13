<?php
/**
 * Página de um conteúdo (artigo, manual, apresentação de painel...) ou, quando chamada por
 * infoprodutos/post.php, a página de venda de um infoproduto. Renderizada no servidor:
 * o buscador e a prévia do link (WhatsApp, Instagram, LinkedIn) leem o texto completo.
 */
declare(strict_types=1);
require __DIR__ . '/_layout.php';

$tipo = defined('CM_TIPO') ? CM_TIPO : 'blog';
$slug = strtolower(trim((string)($_GET['slug'] ?? '')));
if (!preg_match('/^[a-z0-9-]{1,160}$/', $slug)) cmNaoEncontrada($tipo);

$db = cmDb();
blogMigrar($db);
$r = blogPostPorSlug($db, $slug);
if (!$r) cmNaoEncontrada($tipo);
if (($r['tipo'] ?? 'blog') !== $tipo) { // endereço do outro tipo: manda para o lugar certo
  header('Location: ' . blogUrlDoPost($r), true, 301);
  exit;
}

$venda = $tipo === 'infoproduto';
$blocos = blogBlocosDe($r);
$cta = $venda ? cmCtaVenda($r) : ['url' => '', 'rotulo' => '', 'preco' => '', 'gratuito' => false];
$resumoEscrito = trim((string)($r['resumo'] ?? '')); // só aparece no topo se a pessoa escreveu; o automático serve para busca e prévia do link
$resumo = $resumoEscrito ?: blogResumoAuto($blocos);
$descricao = trim((string)($r['seo_descricao'] ?? '')) ?: $resumo;
$autor = trim((string)($r['autor'] ?? '')) ?: CM_SITE_NOME;
$caminho = blogUrlDoPost($r);
$urlAbs = cmOrigem() . $caminho;
$capa = (string)($r['capa'] ?? '');
if ($capa === '') { // sem capa: usa a primeira imagem do próprio conteúdo na prévia do link
  foreach ($blocos as $b) { if (($b['t'] ?? '') === 'imagem' || ($b['t'] ?? '') === 'imagem_texto') { $capa = (string)$b['url']; break; } if (($b['t'] ?? '') === 'galeria') { $capa = (string)$b['itens'][0]['url']; break; } }
}
$ctxBlocos = ['cta' => ['url' => $cta['url'], 'rotulo' => $cta['rotulo'], 'preco' => $cta['preco']]];

/* ---- dados estruturados ---- */
if ($venda) {
  $prod = ['@context' => 'https://schema.org', '@type' => 'Product', 'name' => $r['titulo'], 'description' => $descricao, 'url' => $urlAbs, 'brand' => ['@type' => 'Brand', 'name' => CM_SITE_NOME]];
  if ($capa !== '') $prod['image'] = cmAbs($capa);
  $preco = !empty($r['gratuito']) ? 0.0 : cmPrecoNumero((string)($r['preco_label'] ?? ''));
  if ($preco !== null) $prod['offers'] = ['@type' => 'Offer', 'price' => number_format($preco, 2, '.', ''), 'priceCurrency' => 'BRL', 'availability' => 'https://schema.org/InStock', 'url' => $cta['url']];
  $jsonld = [$prod];
} else {
  $art = ['@context' => 'https://schema.org', '@type' => 'Article', 'headline' => $r['titulo'], 'description' => $descricao, 'mainEntityOfPage' => $urlAbs,
          'datePublished' => $r['publicado_em'], 'dateModified' => $r['atualizado_em'] ?: $r['publicado_em'],
          'author' => ['@type' => $autor === CM_SITE_NOME ? 'Organization' : 'Person', 'name' => $autor],
          'publisher' => ['@type' => 'Organization', 'name' => CM_SITE_NOME, 'logo' => ['@type' => 'ImageObject', 'url' => cmOrigem() . '/assets/img/logo-cm.png']]];
  if ($capa !== '') $art['image'] = cmAbs($capa);
  $jsonld = [$art, ['@context' => 'https://schema.org', '@type' => 'BreadcrumbList', 'itemListElement' => [
    ['@type' => 'ListItem', 'position' => 1, 'name' => 'Início', 'item' => cmOrigem() . '/'],
    ['@type' => 'ListItem', 'position' => 2, 'name' => BLOG_NOME_PUBLICO, 'item' => cmOrigem() . '/conteudos/'],
    ['@type' => 'ListItem', 'position' => 3, 'name' => $r['titulo'], 'item' => $urlAbs]]]];
}

/* ---- "leia também" / "outros materiais" ---- */
$stmt = $db->prepare("SELECT * FROM posts WHERE tipo = ? AND status = 'publicado' AND publicado_em IS NOT NULL AND publicado_em <= ? AND id <> ? ORDER BY publicado_em DESC LIMIT 3");
$stmt->execute([$tipo, nowIso(), $r['id']]);
$outros = array_map('blogResumoJson', $stmt->fetchAll());

cmAbrir([
  'titulo' => $r['titulo'], 'descricao' => $descricao, 'caminho' => $caminho, 'imagem' => $capa,
  'og' => $venda ? 'product' : 'article', 'jsonld' => $jsonld, 'painel' => blogPrecisaPainel($blocos),
  'ativo' => $venda ? 'infoprodutos' : 'conteudos', 'corpo' => $venda ? 'pg-venda' : 'pg-artigo',
]);

$compartilhar = rawurlencode($r['titulo'] . ' ' . $urlAbs);
$tempo = blogTempoLeitura($blocos);
$tags = array_values(array_filter(array_map('trim', explode(',', (string)($r['tags'] ?? '')))));
$externo = blogUrlExterna($cta['url']);
?>
<?php if ($venda): ?>
<!-- =============================== PÁGINA DE VENDA =============================== -->
<section class="venda-hero" id="vendaTopo">
  <div class="container venda-grid">
    <div class="venda-txt">
      <p class="eyebrow"><?= blogEsc($r['categoria'] ?: 'Infoproduto') ?></p>
      <h1><?= blogEsc($r['titulo']) ?></h1>
      <?php if ($resumoEscrito !== ''): ?><p class="venda-resumo"><?= blogEsc($resumoEscrito) ?></p><?php endif; ?>
      <div class="venda-compra">
        <?php if ($cta['preco'] !== ''): ?><span class="venda-preco<?= $cta['gratuito'] ? ' gratis' : '' ?>"><?= blogEsc($cta['preco']) ?></span><?php endif; ?>
        <a class="btn btn-primary btn-grande" id="vendaBotao" href="<?= blogEsc($cta['url']) ?>"<?= $externo ? ' target="_blank" rel="noopener noreferrer"' : '' ?>><?= blogEsc($cta['rotulo']) ?></a>
      </div>
      <?php if (!$cta['gratuito'] && $externo): ?><p class="venda-nota">Pagamento processado por uma plataforma externa, em ambiente seguro.</p><?php endif; ?>
    </div>
    <?php if ($capa !== ''): ?>
    <figure class="venda-capa"><img src="<?= blogEsc($capa) ?>" alt="<?= blogEsc($r['capa_alt'] ?: $r['titulo']) ?>" decoding="async" fetchpriority="high" data-zoom></figure>
    <?php endif; ?>
  </div>
</section>

<article class="art-body venda-corpo" id="vendaCorpo">
  <?= blogRenderBlocos($blocos, $ctxBlocos) ?>
</article>

<?php if ($outros): ?>
<section class="c-lista c-outros">
  <div class="container">
    <h2>Outros materiais</h2>
    <div class="c-grid"><?php foreach ($outros as $p) echo cmCard($p); ?></div>
  </div>
</section>
<?php endif; ?>

<div class="buybar" id="buybar" hidden>
  <div class="container buybar-in">
    <span class="buybar-nome"><?= blogEsc($r['titulo']) ?></span>
    <?php if ($cta['preco'] !== ''): ?><span class="buybar-preco"><?= blogEsc($cta['preco']) ?></span><?php endif; ?>
    <a class="btn btn-primary" href="<?= blogEsc($cta['url']) ?>"<?= $externo ? ' target="_blank" rel="noopener noreferrer"' : '' ?>><?= blogEsc($cta['rotulo']) ?></a>
  </div>
</div>

<?php else: ?>
<!-- =============================== CONTEÚDO =============================== -->
<article class="art">
  <header class="art-topo container">
    <nav class="art-trilha" aria-label="Onde você está">
      <a href="/">Início</a><i aria-hidden="true">›</i><a href="/conteudos/"><?= blogEsc(BLOG_NOME_PUBLICO) ?></a><?php if ($r['categoria']): ?><i aria-hidden="true">›</i><a href="/conteudos/?categoria=<?= rawurlencode($r['categoria']) ?>"><?= blogEsc($r['categoria']) ?></a><?php endif; ?>
    </nav>
    <h1><?= blogEsc($r['titulo']) ?></h1>
    <?php if ($resumoEscrito !== ''): ?><p class="art-resumo"><?= blogEsc($resumoEscrito) ?></p><?php endif; ?>
    <p class="art-meta">
      <span><?= blogEsc($autor) ?></span>
      <time datetime="<?= blogEsc(substr((string)$r['publicado_em'], 0, 10)) ?>"><?= blogEsc(blogData($r['publicado_em'])) ?></time>
      <span><?= $tempo ?> min de leitura</span>
    </p>
  </header>

  <?php if ($capa !== '' && !empty($r['capa'])): ?>
  <figure class="art-capa container"><img src="<?= blogEsc($r['capa']) ?>" alt="<?= blogEsc($r['capa_alt'] ?: $r['titulo']) ?>" decoding="async" fetchpriority="high"></figure>
  <?php endif; ?>

  <div class="art-body">
    <?= blogRenderBlocos($blocos, $ctxBlocos) ?>
  </div>

  <footer class="art-rodape container">
    <?php if ($tags): ?><p class="art-tags"><?php foreach ($tags as $t): ?><span>#<?= blogEsc($t) ?></span><?php endforeach; ?></p><?php endif; ?>
    <div class="art-compartilhar">
      <span>Compartilhar</span>
      <a href="https://wa.me/?text=<?= $compartilhar ?>" target="_blank" rel="noopener noreferrer">WhatsApp</a>
      <a href="https://www.linkedin.com/sharing/share-offsite/?url=<?= rawurlencode($urlAbs) ?>" target="_blank" rel="noopener noreferrer">LinkedIn</a>
      <button type="button" data-copiar-link="<?= blogEsc($urlAbs) ?>">Copiar link</button>
    </div>
  </footer>

  <aside class="art-convite container">
    <div>
      <h2>Quer ver isso aplicado no financeiro da sua empresa?</h2>
      <p>Faça um diagnóstico gratuito e descubra por onde começar a organizar números, rotinas e decisões.</p>
    </div>
    <a class="btn btn-primary" href="/#contato">Solicitar diagnóstico gratuito</a>
  </aside>
</article>

<?php if ($outros): ?>
<section class="c-lista c-outros">
  <div class="container">
    <h2>Leia também</h2>
    <div class="c-grid"><?php foreach ($outros as $p) echo cmCard($p); ?></div>
    <p class="c-todos"><a href="/conteudos/">Ver todos os conteúdos →</a></p>
  </div>
</section>
<?php endif; ?>
<?php endif; ?>
<?php cmFechar(['painel' => blogPrecisaPainel($blocos)]); ?>
