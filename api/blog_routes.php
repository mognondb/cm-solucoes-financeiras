<?php
/**
 * Rotas do blog e das páginas de venda de infoprodutos (incluído por api/index.php).
 *
 * Públicas (só o que já está publicado):
 *   GET  /api/posts?tipo=blog|infoproduto&limite=&pagina=&categoria=
 *   GET  /api/post?slug=
 * Só administrador:
 *   GET    /api/admin/posts?tipo=         lista tudo, inclusive rascunhos
 *   GET    /api/admin/post?id=            um post completo (com blocos)
 *   PUT    /api/admin/post                cria/atualiza
 *   DELETE /api/admin/post?id=
 *   POST   /api/admin/post-preview        HTML dos blocos, igual ao do site
 *   POST   /api/admin/upload              foto, planilha, pdf... (multipart, campo "arquivo")
 */
declare(strict_types=1);
require_once __DIR__ . '/blog_lib.php';

function blogExigirAdmin(): array {
  $s = autenticarSessao();
  if (!$s) jsonResponse(['message' => 'Usuário ou senha inválidos'], 401);
  if ($s['papel'] !== 'admin') jsonResponse(['message' => 'Acesso negado'], 403);
  return $s;
}

function blogRotas(string $path, string $method, PDO $db): void {
  $publica = in_array($path, ['/api/posts', '/api/post'], true);
  $admin = strpos($path, '/api/admin/post') === 0 || $path === '/api/admin/posts' || $path === '/api/admin/upload';
  if (!$publica && !$admin) return;
  blogMigrar($db);

  // ---------------------------------------------------------------- público
  if ($path === '/api/posts') {
    if ($method !== 'GET') jsonResponse(['message' => 'Método não suportado'], 405);
    $tipo = ($_GET['tipo'] ?? 'blog') === 'infoproduto' ? 'infoproduto' : 'blog';
    $cat = trim((string)($_GET['categoria'] ?? '')) ?: null;
    jsonResponse(blogPublicados($db, (int)($_GET['limite'] ?? 12), (int)($_GET['pagina'] ?? 1), $cat, $tipo));
  }

  if ($path === '/api/post') {
    if ($method !== 'GET') jsonResponse(['message' => 'Método não suportado'], 405);
    $slug = trim((string)($_GET['slug'] ?? ''));
    $r = $slug !== '' ? blogPostPorSlug($db, $slug) : null;
    if (!$r) jsonResponse(['message' => 'Post não encontrado'], 404);
    jsonResponse(blogPostJson($r));
  }

  // ---------------------------------------------------------------- administrador
  blogExigirAdmin();

  if ($path === '/api/admin/posts') {
    if ($method !== 'GET') jsonResponse(['message' => 'Método não suportado'], 405);
    $tipo = $_GET['tipo'] ?? '';
    $sql = 'SELECT * FROM posts' . (in_array($tipo, ['blog', 'infoproduto'], true) ? ' WHERE tipo = ' . $db->quote($tipo) : '') . ' ORDER BY COALESCE(publicado_em, atualizado_em) DESC, criado_em DESC';
    jsonResponse(array_map('blogResumoJson', $db->query($sql)->fetchAll()));
  }

  if ($path === '/api/admin/post') {
    if ($method === 'GET') {
      $stmt = $db->prepare('SELECT * FROM posts WHERE id = ?');
      $stmt->execute([(string)($_GET['id'] ?? '')]);
      $r = $stmt->fetch();
      if (!$r) jsonResponse(['message' => 'Post não encontrado'], 404);
      jsonResponse(blogPostJson($r));
    }
    if ($method === 'PUT') {
      try {
        jsonResponse(blogPostJson(blogSalvar($db, bodyJson())));
      } catch (InvalidArgumentException $e) {
        jsonResponse(['message' => $e->getMessage()], 400);
      }
    }
    if ($method === 'DELETE') {
      $db->prepare('DELETE FROM posts WHERE id = ?')->execute([(string)($_GET['id'] ?? '')]);
      jsonResponse(['ok' => true]);
    }
    jsonResponse(['message' => 'Método não suportado'], 405);
  }

  if ($path === '/api/admin/post-preview') {
    if ($method !== 'POST') jsonResponse(['message' => 'Método não suportado'], 405);
    $d = bodyJson();
    $blocos = blogNormalizarBlocos($d['blocos'] ?? []);
    $fake = ['gratuito' => !empty($d['gratuito']), 'link_compra' => blogUrl($d['linkCompra'] ?? '', true), 'cta_rotulo' => $d['ctaRotulo'] ?? '', 'preco_label' => $d['precoLabel'] ?? ''];
    jsonResponse(['html' => blogRenderBlocos($blocos, ['cta' => blogCtaProduto($fake)]), 'precisaPainel' => blogPrecisaPainel($blocos)]);
  }

  if ($path === '/api/admin/upload') {
    if ($method !== 'POST') jsonResponse(['message' => 'Método não suportado'], 405);
    if (empty($_FILES['arquivo'])) jsonResponse(['message' => 'Nenhum arquivo recebido (o arquivo pode ser maior do que o servidor aceita).'], 400);
    try {
      jsonResponse(blogSalvarUpload($_FILES['arquivo']));
    } catch (RuntimeException $e) {
      jsonResponse(['message' => $e->getMessage()], 400);
    }
  }

  jsonResponse(['message' => 'Não encontrado'], 404);
}
