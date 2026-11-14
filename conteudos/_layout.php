<?php
/**
 * Moldura (cabeçalho, rodapé, SEO) e peças reaproveitadas das páginas públicas de conteúdos
 * e das páginas de venda de infoprodutos. Não é uma página: o .htaccess nega acesso direto.
 */
declare(strict_types=1);
require_once __DIR__ . '/../api/db.php';
require_once __DIR__ . '/../api/blog_lib.php';

const CM_SITE_NOME = 'CM Soluções Financeiras';
const CM_WHATS = '554888766576';
const CM_V_CSS = 5;
const CM_V_JS = 1;

function cmOrigem(): string {
  $host = strtolower((string)($_SERVER['HTTP_HOST'] ?? 'cmfinanceiro.com'));
  if (!preg_match('/^[a-z0-9.\-]+(:\d+)?$/', $host)) $host = 'cmfinanceiro.com';
  $local = (bool)preg_match('/^(localhost|127\.)/', $host);
  return ($local ? 'http://' : 'https://') . $host;
}

function cmAbs(string $u): string {
  if ($u === '') return '';
  return preg_match('~^https?://~i', $u) ? $u : cmOrigem() . '/' . ltrim($u, '/');
}

/** Dia e mês em português, sem depender de locale instalado. */
function cmData(?string $iso): string { return $iso ? blogData($iso) : ''; }

function cmJson($dados): string {
  return json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
}

/**
 * Abre a página. Opções: titulo, descricao, caminho (ex.: '/conteudos/'), imagem, og ('website'|'article'|'product'),
 * jsonld (lista de objetos), noindex, painel (carrega o painel interativo), ativo ('conteudos'|'infoprodutos'), corpo (classe extra),
 * css (lista de folhas de estilo extras, no <head>). cmFechar aceita js (lista de scripts extras, no fim da página).
 */
function cmAbrir(array $o): void {
  $titulo = (string)($o['titulo'] ?? BLOG_NOME_PUBLICO);
  $tituloCompleto = $titulo . ' | ' . CM_SITE_NOME;
  $desc = blogCortar($o['descricao'] ?? 'Guias, manuais e novidades da CM Soluções Financeiras para organizar e entender o financeiro da sua empresa.', 300);
  $url = cmOrigem() . ($o['caminho'] ?? '/conteudos/');
  $img = cmAbs((string)($o['imagem'] ?? '')) ?: cmOrigem() . '/assets/img/capa-padrao.png'; // nunca a logo crua: fica enorme e feia na prévia
  $imgPadrao = empty($o['imagem']) || !empty($o['imagemAuto']); // as capas padrão e automática têm 1200x630
  $og = in_array($o['og'] ?? '', ['article', 'product'], true) ? $o['og'] : 'website';
  $ativo = $o['ativo'] ?? 'conteudos';
  $link = fn(string $href, string $rot, string $chave = '') => '<a href="' . $href . '"' . ($chave !== '' && $chave === $ativo ? ' class="ativo" aria-current="page"' : '') . '>' . $rot . '</a>';
  header('Content-Type: text/html; charset=utf-8');
  header('X-Content-Type-Options: nosniff');
  header('Referrer-Policy: strict-origin-when-cross-origin');
  ?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title><?= blogEsc($tituloCompleto) ?></title>
<meta name="description" content="<?= blogEsc($desc) ?>">
<link rel="canonical" href="<?= blogEsc($url) ?>">
<?php if (!empty($o['noindex'])): ?><meta name="robots" content="noindex, follow">
<?php endif; ?>
<meta property="og:site_name" content="<?= blogEsc(CM_SITE_NOME) ?>">
<meta property="og:locale" content="pt_BR">
<meta property="og:type" content="<?= blogEsc($og === 'product' ? 'website' : $og) ?>">
<meta property="og:title" content="<?= blogEsc($titulo) ?>">
<meta property="og:description" content="<?= blogEsc($desc) ?>">
<meta property="og:url" content="<?= blogEsc($url) ?>">
<meta property="og:image" content="<?= blogEsc($img) ?>">
<?php if ($imgPadrao): ?><meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<?php endif; ?>
<meta property="og:image:alt" content="<?= blogEsc($titulo) ?>">
<meta name="twitter:image" content="<?= blogEsc($img) ?>">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico?v=1" sizes="16x16 32x32 48x48">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/img/icon-32.png?v=1">
<link rel="icon" type="image/png" sizes="192x192" href="/assets/img/icon-192.png?v=1">
<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png?v=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/style.css?v=16">
<link rel="stylesheet" href="/assets/css/conteudos.css?v=<?= CM_V_CSS ?>">
<?php foreach ((array)($o['css'] ?? []) as $href): ?><link rel="stylesheet" href="<?= blogEsc($href) ?>">
<?php endforeach; ?>
<?php if (!empty($o['painel'])): ?><link rel="stylesheet" href="/assets/css/dashboard.css?v=5">
<?php endif; ?>
<?php foreach ((array)($o['jsonld'] ?? []) as $j): ?><script type="application/ld+json"><?= cmJson($j) ?></script>
<?php endforeach; ?>
</head>
<body class="home pg-cont <?= blogEsc($o['corpo'] ?? '') ?>">

<header class="site-header" id="topo">
  <div class="container header-inner">
    <a href="/" class="logo">
      <img src="/assets/img/logo-cm.png" alt="<?= blogEsc(CM_SITE_NOME) ?>" class="logo-mark-img">
      <span class="logo-divider"></span>
      <span class="logo-text">Soluções<br>Financeiras</span>
    </a>

    <nav class="nav" id="nav">
      <a href="/diagnostico/" class="nav-destaque"<?= $ativo === 'diagnostico' ? ' aria-current="page"' : '' ?>>Diagnóstico grátis</a>
      <?= $link('/#sobre', 'Sobre') ?>
      <?= $link('/conteudos/', BLOG_NOME_PUBLICO, 'conteudos') ?>
      <?= $link('/#painel', 'Painel') ?>
      <?= $link('/#servicos', 'Serviços') ?>
      <?= $link('/#infoprodutos', 'Infoprodutos', 'infoprodutos') ?>
      <?= $link('/#contato', 'Contato') ?>
      <a href="/portal/index.html" class="btn btn-primary nav-cta-m">Portal do Cliente</a>
    </nav>

    <a href="/portal/index.html" class="btn btn-primary nav-cta">Portal do Cliente</a>

    <button class="nav-toggle" id="navToggle" aria-label="Abrir menu" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>
  </div>
</header>

<main>
<?php
}

function cmFechar(array $o = []): void {
  ?>
</main>

<footer class="site-footer">
  <div class="container footer-grid">
    <div class="footer-brand">
      <img src="/assets/img/logo-cm.png" alt="<?= blogEsc(CM_SITE_NOME) ?>" class="footer-logo-img">
      <p>Organização, clareza e controle financeiro para empresas que querem decidir com confiança — não no achismo.</p>
    </div>
    <div class="footer-col">
      <h5>Navegação</h5>
      <a href="/diagnostico/">Diagnóstico gratuito</a>
      <a href="/#plataformas">Plataformas</a>
      <a href="/#sobre">Sobre</a>
      <a href="/conteudos/"><?= blogEsc(BLOG_NOME_PUBLICO) ?></a>
      <a href="/#painel">Painel</a>
      <a href="/#servicos">Serviços</a>
      <a href="/#infoprodutos">Infoprodutos</a>
      <a href="/#contato">Contato</a>
    </div>
    <div class="footer-col">
      <h5>Acesso</h5>
      <a href="/portal/index.html">Portal do Cliente</a>
      <a href="/admin/index.html">Portal administrativo</a>
    </div>
    <div class="footer-col">
      <h5>Fale com a gente</h5>
      <a href="https://wa.me/<?= CM_WHATS ?>" target="_blank" rel="noopener">WhatsApp</a>
      <a href="https://www.instagram.com/cm.financeiro" target="_blank" rel="noopener">@cm.financeiro</a>
      <a href="mailto:contato@cmsolucoesfinanceiras.com.br">contato@cmsolucoesfinanceiras.com.br</a>
    </div>
  </div>
  <div class="container footer-bottom">
    <p>&copy; <span id="ano"><?= date('Y') ?></span> <?= blogEsc(CM_SITE_NOME) ?>. Todos os direitos reservados.</p>
    <p class="footer-cnpj">CNPJ: 68.911.913/0001-01</p>
  </div>
</footer>

<a href="https://wa.me/<?= CM_WHATS ?>?text=<?= rawurlencode('Olá! Vim pelo site e gostaria de conversar com a CM Soluções Financeiras.') ?>"
   class="whatsapp-float" target="_blank" rel="noopener" aria-label="Conversar no WhatsApp">
  <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16.001 2.667C8.64 2.667 2.667 8.64 2.667 16c0 2.52.697 4.878 1.908 6.889L2.667 29.333l6.61-1.866a13.26 13.26 0 0 0 6.724 1.826c7.36 0 13.333-5.973 13.333-13.333S23.361 2.667 16.001 2.667zm0 24.228a11.11 11.11 0 0 1-5.98-1.74l-.429-.26-4.278 1.208 1.19-4.223-.28-.432a11.09 11.09 0 0 1-1.79-6.048c0-6.144 5.001-11.145 11.147-11.145 6.144 0 11.145 5.001 11.145 11.145 0 6.145-5.001 11.145-11.145 11.145zm6.122-8.321c-.335-.168-1.983-.978-2.29-1.09-.307-.112-.531-.168-.754.168-.223.335-.865 1.09-1.06 1.313-.195.224-.39.252-.726.084-.335-.168-1.415-.522-2.695-1.663-.996-.889-1.669-1.987-1.864-2.322-.195-.335-.021-.516.147-.683.15-.15.335-.39.502-.586.168-.195.223-.335.335-.558.112-.224.056-.419-.028-.586-.084-.168-.754-1.818-1.034-2.49-.272-.654-.548-.565-.754-.576l-.642-.012c-.223 0-.586.084-.893.419-.307.335-1.172 1.146-1.172 2.795s1.2 3.24 1.367 3.464c.168.224 2.362 3.605 5.722 5.055.8.345 1.424.551 1.911.705.803.255 1.534.219 2.112.133.644-.096 1.983-.811 2.263-1.595.28-.783.28-1.455.195-1.595-.084-.14-.307-.224-.642-.391z"/></svg>
</a>

<script src="/assets/js/conteudos.js?v=<?= CM_V_JS ?>"></script>
<?php if (!empty($o['painel'])): ?><script src="/assets/js/dashboard.js?v=4"></script>
<?php endif; ?>
<?php foreach ((array)($o['js'] ?? []) as $src): ?><script src="<?= blogEsc($src) ?>"></script>
<?php endforeach; ?>
</body>
</html>
<?php
}

/* ====================================================================== peças */

/** Cartão de um conteúdo ou de um infoproduto (recebe a forma "de lista" vinda de blogResumoJson). */
function cmCard(array $p, bool $destaque = false): string {
  $venda = ($p['tipo'] ?? 'blog') === 'infoproduto';
  $capa = !empty($p['capa'])
    ? '<img src="' . blogEsc($p['capa']) . '" alt="' . blogEsc($p['capaAlt'] ?: $p['titulo']) . '" loading="' . ($destaque ? 'eager' : 'lazy') . '" decoding="async">'
    : '<span class="c-capa-vazia" aria-hidden="true">' . blogEsc(mb_strtoupper(mb_substr($p['categoria'] ?: ($venda ? 'Material' : 'CM'), 0, 22))) . '</span>';
  $selo = '';
  if ($venda) $selo = '<span class="badge ' . (!empty($p['gratuito']) ? 'badge-free' : 'badge-paid') . '">' . blogEsc(!empty($p['gratuito']) ? 'Grátis' : ($p['precoLabel'] ?: 'Infoproduto')) . '</span>';
  $meta = [];
  if ($p['categoria']) $meta[] = '<span class="c-categoria">' . blogEsc($p['categoria']) . '</span>';
  if ($p['publicadoEm']) $meta[] = '<time datetime="' . blogEsc(substr($p['publicadoEm'], 0, 10)) . '">' . blogEsc(blogData($p['publicadoEm'])) . '</time>';
  if (!$venda) $meta[] = '<span>' . blogEsc((string)$p['tempoLeitura']) . ' min de leitura</span>';
  return '<a class="c-card' . ($destaque ? ' c-destaque' : '') . '" href="' . blogEsc($p['url']) . '">'
    . '<span class="c-capa">' . $capa . '</span>'
    . '<span class="c-corpo">' . $selo
    . '<span class="c-meta">' . implode('', $meta) . '</span>'
    . '<strong class="c-titulo">' . blogEsc($p['titulo']) . '</strong>'
    . ($p['resumo'] !== '' ? '<span class="c-resumo">' . blogEsc($p['resumo']) . '</span>' : '')
    . '<span class="c-ler">' . ($venda ? 'Ver detalhes' : 'Ler conteúdo') . ' <span aria-hidden="true">→</span></span></span></a>';
}

/** Botão da página de venda. Sem link de compra cadastrado, leva à conversa no WhatsApp já com o nome do produto. */
function cmCtaVenda(array $r): array {
  $c = blogCtaProduto($r);
  if ($c['url'] === '') {
    $c['url'] = 'https://wa.me/' . CM_WHATS . '?text=' . rawurlencode('Olá! Tenho interesse em: ' . $r['titulo']);
    if (trim((string)($r['cta_rotulo'] ?? '')) === '') $c['rotulo'] = 'Quero este material';
  }
  return $c;
}

/** Valor numérico do rótulo de preço ("R$ 47,90" → 47.90), para os dados estruturados. null se não der para ler. */
function cmPrecoNumero(string $label): ?float {
  if (!preg_match('/(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?/', $label, $m)) return null;
  return (float)(str_replace('.', '', $m[1]) . '.' . ($m[2] ?? '0'));
}

function cmPaginar(int $atual, int $total, callable $href): string {
  if ($total <= 1) return '';
  $o = '<nav class="c-pager" aria-label="Páginas">';
  if ($atual > 1) $o .= '<a href="' . blogEsc($href($atual - 1)) . '" rel="prev">← Anteriores</a>';
  $o .= '<span>Página ' . $atual . ' de ' . $total . '</span>';
  if ($atual < $total) $o .= '<a href="' . blogEsc($href($atual + 1)) . '" rel="next">Próximos →</a>';
  return $o . '</nav>';
}

/** Página "não encontrada" com o mesmo visual do site. */
function cmNaoEncontrada(string $tipo = 'blog'): void {
  http_response_code(404);
  cmAbrir(['titulo' => 'Página não encontrada', 'caminho' => '/conteudos/', 'noindex' => true, 'ativo' => $tipo === 'infoproduto' ? 'infoprodutos' : 'conteudos']);
  ?>
<section class="c-vazio container">
  <p class="section-eyebrow">Erro 404</p>
  <h1>Não encontramos esta página</h1>
  <p>O endereço pode ter mudado ou o material ainda não foi publicado.</p>
  <p><a class="btn btn-primary" href="<?= $tipo === 'infoproduto' ? '/#infoprodutos' : '/conteudos/' ?>"><?= $tipo === 'infoproduto' ? 'Ver os infoprodutos' : 'Ver todos os conteúdos' ?></a></p>
</section>
<?php
  cmFechar();
  exit;
}
