<?php
/**
 * Conexão PDO com o MySQL da Hostinger, a partir de config.php (não versionado).
 */

function cmConfig(): array {
  $path = __DIR__ . '/config.php';
  if (!file_exists($path)) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['message' => 'config.php não encontrado. Copie config.sample.php para config.php e preencha com os dados do banco.']);
    exit;
  }
  return require $path;
}

function cmDb(): PDO {
  static $pdo = null;
  if ($pdo !== null) return $pdo;
  $cfg = cmConfig();
  $dsn = 'mysql:host=' . $cfg['db_host'] . ';dbname=' . $cfg['db_name'] . ';charset=utf8mb4';
  try {
    $pdo = new PDO($dsn, $cfg['db_user'], $cfg['db_pass'], [
      PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
      PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
      PDO::ATTR_EMULATE_PREPARES => false,
    ]);
  } catch (PDOException $e) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['message' => 'Não foi possível conectar ao banco de dados.']);
    exit;
  }
  return $pdo;
}

/** Data/hora atual em ISO 8601 UTC, no mesmo formato que o front-end já espera. */
function nowIso(): string {
  return (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z');
}
