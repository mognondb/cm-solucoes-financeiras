<?php
/**
 * API da plataforma do consultório (agenda + financeiro para psicólogos). Roteador único: /consultorio/api/<rota>.
 * Veja consultorio/README.md para a visão geral, o modelo de dados e a segurança.
 */
declare(strict_types=1);

require __DIR__ . '/lib/base.php';
require __DIR__ . '/lib/esquema.php';
require __DIR__ . '/lib/padroes.php';
require __DIR__ . '/lib/seguranca.php';
require __DIR__ . '/lib/roteador.php';
require __DIR__ . '/lib/email.php';
require __DIR__ . '/lib/rotas_auth.php';
require __DIR__ . '/lib/rotas_conta.php';
require __DIR__ . '/lib/rotas_admin.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('X-Frame-Options: DENY');

set_exception_handler(function (Throwable $e) {
  error_log('[consultorio] ' . get_class($e) . ': ' . $e->getMessage() . ' em ' . basename($e->getFile()) . ':' . $e->getLine());
  if (!headers_sent()) http_response_code(500);
  echo json_encode(['erro' => true, 'message' => 'Algo deu errado do nosso lado. Tente de novo em instantes.'], JSON_UNESCAPED_UNICODE);
});

$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($metodo === 'OPTIONS') { http_response_code(204); exit; }

$uri = (string)parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$base = '/consultorio/api/';
$caminho = strpos($uri, $base) === 0 ? substr($uri, strlen($base)) : '';

psi_migrar(psi_db());

$roteador = new PsiRoteador();
psi_registrar_rotas_auth($roteador);
psi_registrar_rotas_conta($roteador);
psi_registrar_rotas_admin($roteador);
$roteador->despachar($metodo, $caminho);
