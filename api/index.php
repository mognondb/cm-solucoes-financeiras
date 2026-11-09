<?php
/**
 * API do painel administrativo da CM Soluções Financeiras — versão Hostinger
 * (PHP + MySQL), mesma origem do site. Substitui o antigo Worker Cloudflare;
 * endpoints e formato de resposta mantidos iguais, pra não precisar reescrever
 * o front-end inteiro.
 */

declare(strict_types=1);
require __DIR__ . '/db.php';

header('Content-Type: application/json; charset=utf-8');

function jsonResponse($body, int $status = 200): void {
  http_response_code($status);
  echo json_encode($body, JSON_UNESCAPED_UNICODE);
  exit;
}

function bodyJson(): array {
  $raw = file_get_contents('php://input');
  $data = json_decode($raw ?: '', true);
  if (!is_array($data)) jsonResponse(['message' => 'JSON inválido'], 400);
  return $data;
}

function slugify(string $str): string {
  $str = trim($str);
  if (class_exists('Transliterator')) {
    $t = Transliterator::create('Any-Latin; Latin-ASCII');
    if ($t) $str = $t->transliterate($str);
  } else {
    $str = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $str) ?: $str;
  }
  $str = strtolower($str);
  $str = preg_replace('/[^a-z0-9]+/', '-', $str);
  return trim($str, '-');
}

function gerarSaltHex(): string {
  return bin2hex(random_bytes(16));
}
function hashSenha(string $senha, string $saltHex): string {
  return bin2hex(hash_pbkdf2('sha256', $senha, hex2bin($saltHex), 100000, 32, true));
}

function getAuthHeader(): ?string {
  if (!empty($_SERVER['HTTP_AUTHORIZATION'])) return $_SERVER['HTTP_AUTHORIZATION'];
  if (!empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) return $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
  if (function_exists('apache_request_headers')) {
    foreach (apache_request_headers() as $k => $v) if (strcasecmp($k, 'Authorization') === 0) return $v;
  }
  if (!empty($_SERVER['PHP_AUTH_USER'])) {
    return 'Basic ' . base64_encode($_SERVER['PHP_AUTH_USER'] . ':' . ($_SERVER['PHP_AUTH_PW'] ?? ''));
  }
  return null;
}

function decodificarBasicAuth(): ?array {
  $auth = getAuthHeader();
  if (!$auth || stripos($auth, 'Basic ') !== 0) return null;
  $decoded = base64_decode(substr($auth, 6), true);
  if ($decoded === false) return null;
  $idx = strpos($decoded, ':');
  if ($idx === false) return null;
  return ['usuario' => substr($decoded, 0, $idx), 'senha' => substr($decoded, $idx + 1)];
}

/** Confere usuário/senha contra a tabela "usuarios" e devolve a sessão (papel + escopo) ou null. */
function autenticarSessao(): ?array {
  $cred = decodificarBasicAuth();
  if (!$cred) return null;
  $db = cmDb();
  $stmt = $db->prepare('SELECT * FROM usuarios WHERE username = ? LIMIT 1');
  $stmt->execute([$cred['usuario']]);
  $row = $stmt->fetch();
  if (!$row || !$row['ativo']) return null;
  if (hashSenha($cred['senha'], $row['salt_hex']) !== $row['hash_hex']) return null;
  return [
    'username' => $row['username'],
    'nome' => $row['nome'],
    'papel' => $row['papel'],
    'clienteId' => $row['cliente_id'],
    'relatorioId' => $row['relatorio_id'],
  ];
}

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'OPTIONS') jsonResponse(null, 200);

$db = cmDb();

// ---------- login ----------
if ($path === '/api/login') {
  $sessao = autenticarSessao();
  if (!$sessao) jsonResponse(['message' => 'Usuário ou senha inválidos'], 401);
  jsonResponse(['ok' => true, 'papel' => $sessao['papel'], 'nome' => $sessao['nome'], 'clienteId' => $sessao['clienteId'], 'relatorioId' => $sessao['relatorioId']]);
}

// ---------- esqueci minha senha (painel administrativo) ----------
// O e-mail de redefinição sempre vai pra uma caixa fixa (combinada com a CM), não pro
// e-mail do usuário (a tabela "usuarios" nem guarda e-mail) — é o ponto único de controle
// de quem consegue resetar uma senha do painel.
const EMAIL_RESET_SENHA = 'mognon.db@gmail.com';

function migrarTabelaResetSenha(PDO $db): void {
  $db->exec('CREATE TABLE IF NOT EXISTS reset_senha (
    id VARCHAR(40) PRIMARY KEY,
    username VARCHAR(80) NOT NULL,
    token_hash CHAR(64) NOT NULL,
    criado_em VARCHAR(40) NOT NULL,
    expira_em VARCHAR(40) NOT NULL,
    usado_em VARCHAR(40) NULL,
    INDEX idx_reset_username (username)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
}

if ($path === '/api/esqueci-senha') {
  if ($method !== 'POST') jsonResponse(['message' => 'Método não suportado'], 405);
  $dados = bodyJson();
  if (!empty($dados['website'])) jsonResponse(['ok' => true]); // campo-armadilha: bots preenchem, finge sucesso

  // Resposta sempre igual, exista ou não o usuário — evita que alguém descubra
  // quais usuários existem só testando esta tela.
  $respostaGenerica = ['ok' => true, 'message' => 'Se o usuário existir, um e-mail de redefinição foi enviado.'];
  $username = trim((string)($dados['username'] ?? ''));
  if ($username === '') jsonResponse($respostaGenerica);

  migrarTabelaResetSenha($db);

  $stmt = $db->prepare('SELECT * FROM usuarios WHERE username = ? LIMIT 1');
  $stmt->execute([$username]);
  $user = $stmt->fetch();

  if ($user && $user['ativo']) {
    // no máximo 1 e-mail a cada 5 minutos por usuário, pra não virar spam se alguém
    // ficar clicando ou tentar usar isso pra encher a caixa de entrada.
    $stmt = $db->prepare('SELECT criado_em FROM reset_senha WHERE username = ? ORDER BY criado_em DESC LIMIT 1');
    $stmt->execute([$username]);
    $ultimo = $stmt->fetchColumn();
    $podeEnviar = true;
    if ($ultimo) {
      $segundos = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->getTimestamp() - (new DateTimeImmutable($ultimo))->getTimestamp();
      $podeEnviar = $segundos >= 300;
    }

    if ($podeEnviar) {
      $tokenCru = bin2hex(random_bytes(32));
      $agora = nowIso();
      $expiraEm = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->modify('+1 hour')->format('Y-m-d\TH:i:s.v\Z');
      $stmt = $db->prepare('INSERT INTO reset_senha (id, username, token_hash, criado_em, expira_em) VALUES (?,?,?,?,?)');
      $stmt->execute(['rst-' . bin2hex(random_bytes(8)), $username, hash('sha256', $tokenCru), $agora, $expiraEm]);

      $link = 'https://cmfinanceiro.com/admin/index.html?resetUser=' . urlencode($username) . '&resetToken=' . $tokenCru;
      $assunto = 'Redefinição de senha — Painel CM Soluções Financeiras';
      $corpo = "Foi solicitada a redefinição de senha do usuário \"{$username}\" no painel administrativo "
        . "(cmfinanceiro.com/admin).\n\nPara definir uma senha nova, acesse o link abaixo:\n{$link}\n\n"
        . "Esse link expira em 1 hora e só pode ser usado uma vez.\n\n"
        . "Se você não pediu essa redefinição, ignore este e-mail — nada foi alterado ainda.";
      $headers = "From: Painel CM <nao-responda@cmfinanceiro.com>\r\nContent-Type: text/plain; charset=UTF-8";
      @mail(EMAIL_RESET_SENHA, $assunto, $corpo, $headers);
    }
  }

  jsonResponse($respostaGenerica);
}

if ($path === '/api/redefinir-senha') {
  if ($method !== 'POST') jsonResponse(['message' => 'Método não suportado'], 405);
  $dados = bodyJson();
  $username = trim((string)($dados['username'] ?? ''));
  $token = (string)($dados['token'] ?? '');
  $novaSenha = (string)($dados['novaSenha'] ?? '');
  if ($username === '' || $token === '') jsonResponse(['message' => 'Link de redefinição inválido.'], 400);
  if (strlen($novaSenha) < 6) jsonResponse(['message' => 'A nova senha precisa ter pelo menos 6 caracteres.'], 400);

  migrarTabelaResetSenha($db);

  $stmt = $db->prepare('SELECT * FROM reset_senha WHERE username = ? AND token_hash = ? AND usado_em IS NULL ORDER BY criado_em DESC LIMIT 1');
  $stmt->execute([$username, hash('sha256', $token)]);
  $reset = $stmt->fetch();
  if (!$reset) jsonResponse(['message' => 'Link inválido ou já utilizado. Peça uma nova redefinição.'], 400);
  if ($reset['expira_em'] < nowIso()) jsonResponse(['message' => 'Link expirado. Peça uma nova redefinição.'], 400);

  $stmt = $db->prepare('SELECT * FROM usuarios WHERE username = ?');
  $stmt->execute([$username]);
  $user = $stmt->fetch();
  if (!$user || !$user['ativo']) jsonResponse(['message' => 'Usuário não encontrado ou inativo.'], 404);

  $saltHex = gerarSaltHex();
  $hashHex = hashSenha($novaSenha, $saltHex);
  $db->prepare('UPDATE usuarios SET salt_hex = ?, hash_hex = ?, atualizado_em = ? WHERE username = ?')
    ->execute([$saltHex, $hashHex, nowIso(), $username]);
  $db->prepare('UPDATE reset_senha SET usado_em = ? WHERE id = ?')->execute([nowIso(), $reset['id']]);

  jsonResponse(['ok' => true]);
}

// ---------- diagnóstico financeiro (formulário público do site) ----------
if ($path === '/api/diagnostico') {
  if ($method === 'POST') {
    $dados = bodyJson();
    if (!empty($dados['website'])) jsonResponse(['ok' => true]); // campo-armadilha: bots preenchem, finge sucesso

    if (empty($dados['nome']) || empty($dados['email'])) jsonResponse(['message' => 'Informe nome e e-mail'], 400);

    $limitar = fn($v, $max) => mb_substr(trim((string)($v ?? '')), 0, $max);
    $id = 'diag-' . round(microtime(true) * 1000) . '-' . substr(bin2hex(random_bytes(4)), 0, 6);
    $stmt = $db->prepare('INSERT INTO diagnosticos (id, nome, email, telefone, empresa, ramo, colaboradores, controle_atual, dificuldade, objetivo, urgencia, mensagem, lido, criado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?)');
    $stmt->execute([
      $id, $limitar($dados['nome'], 120), $limitar($dados['email'], 160), $limitar($dados['telefone'] ?? '', 40),
      $limitar($dados['empresa'] ?? '', 120), $limitar($dados['ramo'] ?? '', 80), $limitar($dados['colaboradores'] ?? '', 40),
      $limitar($dados['controleAtual'] ?? '', 80), $limitar($dados['dificuldade'] ?? '', 160), $limitar($dados['objetivo'] ?? '', 160),
      $limitar($dados['urgencia'] ?? '', 60), $limitar($dados['mensagem'] ?? '', 1000), nowIso(),
    ]);
    jsonResponse(['ok' => true]);
  }

  if ($method === 'DELETE') {
    $sessao = autenticarSessao();
    if (!$sessao || $sessao['papel'] !== 'admin') jsonResponse(['message' => 'Acesso negado'], 403);
    $id = $_GET['id'] ?? null;
    if (!$id) jsonResponse(['message' => 'Parâmetro "id" obrigatório'], 400);
    $db->prepare('DELETE FROM diagnosticos WHERE id = ?')->execute([$id]);
    jsonResponse(['ok' => true]);
  }

  if ($method === 'PATCH') {
    $sessao = autenticarSessao();
    if (!$sessao || $sessao['papel'] !== 'admin') jsonResponse(['message' => 'Acesso negado'], 403);
    $id = $_GET['id'] ?? null;
    if (!$id) jsonResponse(['message' => 'Parâmetro "id" obrigatório'], 400);
    $corpo = bodyJson();
    $lido = ($corpo['lido'] ?? true) !== false ? 1 : 0;
    $stmt = $db->prepare('UPDATE diagnosticos SET lido = ? WHERE id = ?');
    $stmt->execute([$lido, $id]);
    if ($stmt->rowCount() === 0) jsonResponse(['message' => 'Não encontrado'], 404);
    $row = diagnosticoRow($db, $id);
    jsonResponse($row);
  }

  jsonResponse(['message' => 'Método não suportado'], 405);
}

if ($path === '/api/diagnosticos') {
  if ($method !== 'GET') jsonResponse(['message' => 'Método não suportado'], 405);
  $sessao = autenticarSessao();
  if (!$sessao || $sessao['papel'] !== 'admin') jsonResponse(['message' => 'Acesso negado'], 403);
  $rows = $db->query('SELECT * FROM diagnosticos ORDER BY criado_em DESC')->fetchAll();
  jsonResponse(array_map('diagnosticoToJson', $rows));
}

function diagnosticoRow(PDO $db, string $id): ?array {
  $stmt = $db->prepare('SELECT * FROM diagnosticos WHERE id = ?');
  $stmt->execute([$id]);
  $row = $stmt->fetch();
  return $row ? diagnosticoToJson($row) : null;
}
function diagnosticoToJson(array $r): array {
  return [
    'id' => $r['id'], 'nome' => $r['nome'], 'email' => $r['email'], 'telefone' => $r['telefone'],
    'empresa' => $r['empresa'], 'ramo' => $r['ramo'], 'colaboradores' => $r['colaboradores'],
    'controleAtual' => $r['controle_atual'], 'dificuldade' => $r['dificuldade'], 'objetivo' => $r['objetivo'],
    'urgencia' => $r['urgencia'], 'mensagem' => $r['mensagem'], 'lido' => (bool)$r['lido'], 'criadoEm' => $r['criado_em'],
  ];
}

// ---------- rotas protegidas por login ----------
$rotasProtegidas = ['/api/clientes', '/api/cliente', '/api/relatorios', '/api/relatorio', '/api/relatorio-dados', '/api/usuarios', '/api/usuario'];
if (in_array($path, $rotasProtegidas, true)) {
  $sessao = autenticarSessao();
  if (!$sessao) jsonResponse(['message' => 'Usuário ou senha inválidos'], 401);

  // ---- usuários do painel (só admin) ----
  if ($path === '/api/usuarios' || $path === '/api/usuario') {
    if ($sessao['papel'] !== 'admin') jsonResponse(['message' => 'Acesso negado'], 403);

    if ($path === '/api/usuarios') {
      if ($method !== 'GET') jsonResponse(['message' => 'Método não suportado'], 405);
      $rows = $db->query('SELECT * FROM usuarios ORDER BY criado_em ASC')->fetchAll();
      jsonResponse(array_map('usuarioToJson', $rows));
    }

    $usernameParam = $_GET['username'] ?? null;

    if ($method === 'DELETE') {
      if (!$usernameParam) jsonResponse(['message' => 'Parâmetro "username" obrigatório'], 400);
      $db->prepare('DELETE FROM usuarios WHERE username = ?')->execute([$usernameParam]);
      jsonResponse(['ok' => true]);
    }

    if ($method === 'PUT') {
      $dados = bodyJson();
      $username = trim($dados['username'] ?? '');
      if (!$username) jsonResponse(['message' => 'Informe o nome de usuário'], 400);
      $papeisValidos = ['admin', 'cliente', 'dashboard'];
      if (!in_array($dados['papel'] ?? null, $papeisValidos, true)) jsonResponse(['message' => 'Papel inválido'], 400);
      if ($dados['papel'] === 'cliente' && empty($dados['clienteId'])) jsonResponse(['message' => 'Informe o cliente para o papel "cliente"'], 400);
      if ($dados['papel'] === 'dashboard' && empty($dados['relatorioId'])) jsonResponse(['message' => 'Informe o relatório para o papel "dashboard"'], 400);

      $stmt = $db->prepare('SELECT * FROM usuarios WHERE username = ?');
      $stmt->execute([$username]);
      $existente = $stmt->fetch();
      if (!$existente && empty($dados['senha'])) jsonResponse(['message' => 'Informe uma senha para o novo usuário'], 400);

      $saltHex = ($existente && empty($dados['senha'])) ? $existente['salt_hex'] : gerarSaltHex();
      $hashHex = !empty($dados['senha']) ? hashSenha($dados['senha'], $saltHex) : $existente['hash_hex'];
      $nome = $dados['nome'] ?? $username;
      $clienteId = $dados['papel'] === 'cliente' ? $dados['clienteId'] : null;
      $relatorioId = $dados['papel'] === 'dashboard' ? $dados['relatorioId'] : null;
      $ativo = ($dados['ativo'] ?? true) !== false ? 1 : 0;
      $criadoEm = $existente['criado_em'] ?? nowIso();
      $atualizadoEm = nowIso();

      $stmt = $db->prepare('INSERT INTO usuarios (username, nome, papel, cliente_id, relatorio_id, ativo, salt_hex, hash_hex, criado_em, atualizado_em)
        VALUES (?,?,?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE nome=VALUES(nome), papel=VALUES(papel), cliente_id=VALUES(cliente_id), relatorio_id=VALUES(relatorio_id), ativo=VALUES(ativo), salt_hex=VALUES(salt_hex), hash_hex=VALUES(hash_hex), atualizado_em=VALUES(atualizado_em)');
      $stmt->execute([$username, $nome, $dados['papel'], $clienteId, $relatorioId, $ativo, $saltHex, $hashHex, $criadoEm, $atualizadoEm]);

      jsonResponse(['username' => $username, 'nome' => $nome, 'papel' => $dados['papel'], 'clienteId' => $clienteId, 'relatorioId' => $relatorioId, 'ativo' => (bool)$ativo, 'criadoEm' => $criadoEm]);
    }

    jsonResponse(['message' => 'Método não suportado'], 405);
  }

  // ---- clientes ----
  if ($path === '/api/clientes') {
    if ($method !== 'GET') jsonResponse(['message' => 'Método não suportado'], 405);
    if ($sessao['papel'] === 'dashboard') jsonResponse(['message' => 'Acesso negado'], 403);
    if ($sessao['papel'] === 'cliente') {
      $stmt = $db->prepare('SELECT c.*, (SELECT COUNT(*) FROM relatorios r WHERE r.cliente_id = c.id) AS qtd FROM clientes c WHERE c.id = ?');
      $stmt->execute([$sessao['clienteId']]);
    } else {
      $stmt = $db->query('SELECT c.*, (SELECT COUNT(*) FROM relatorios r WHERE r.cliente_id = c.id) AS qtd FROM clientes c ORDER BY c.nome ASC');
    }
    $rows = $stmt->fetchAll();
    jsonResponse(array_map(fn($r) => ['id' => $r['id'], 'nome' => $r['nome'], 'qtdRelatorios' => (int)$r['qtd'], 'atualizadoEm' => $r['atualizado_em']], $rows));
  }

  if ($path === '/api/cliente') {
    $id = $_GET['id'] ?? null;
    if ($sessao['papel'] === 'dashboard') jsonResponse(['message' => 'Acesso negado'], 403);
    if ($sessao['papel'] === 'cliente' && ($method !== 'GET' || $id !== $sessao['clienteId'])) jsonResponse(['message' => 'Acesso negado'], 403);

    if ($method === 'GET') {
      if (!$id) jsonResponse(['message' => 'Parâmetro "id" obrigatório'], 400);
      $stmt = $db->prepare('SELECT * FROM clientes WHERE id = ?');
      $stmt->execute([$id]);
      $row = $stmt->fetch();
      if (!$row) jsonResponse(['message' => 'Cliente não encontrado'], 404);
      jsonResponse(clienteToJson($row));
    }

    if ($method === 'PUT') {
      $cliente = bodyJson();
      if (empty($cliente['nome'])) jsonResponse(['message' => 'Informe o nome do cliente'], 400);
      $idFinal = $cliente['id'] ?? slugify($cliente['nome']);
      $atualizadoEm = nowIso();
      $stmt = $db->prepare('SELECT criado_em FROM clientes WHERE id = ?');
      $stmt->execute([$idFinal]);
      $existente = $stmt->fetch();
      $criadoEm = $existente['criado_em'] ?? ($cliente['criadoEm'] ?? $atualizadoEm);
      $extra = array_diff_key($cliente, array_flip(['id', 'nome', 'criadoEm', 'atualizadoEm']));

      $stmt = $db->prepare('INSERT INTO clientes (id, nome, dados_json, criado_em, atualizado_em) VALUES (?,?,?,?,?)
        ON DUPLICATE KEY UPDATE nome=VALUES(nome), dados_json=VALUES(dados_json), atualizado_em=VALUES(atualizado_em)');
      $stmt->execute([$idFinal, $cliente['nome'], $extra ? json_encode($extra, JSON_UNESCAPED_UNICODE) : null, $criadoEm, $atualizadoEm]);

      $stmt = $db->prepare('SELECT * FROM clientes WHERE id = ?');
      $stmt->execute([$idFinal]);
      jsonResponse(clienteToJson($stmt->fetch()));
    }

    if ($method === 'DELETE') {
      if (!$id) jsonResponse(['message' => 'Parâmetro "id" obrigatório'], 400);
      $db->prepare('DELETE FROM clientes WHERE id = ?')->execute([$id]); // relatórios somem junto (ON DELETE CASCADE)
      jsonResponse(['ok' => true]);
    }

    jsonResponse(['message' => 'Método não suportado'], 405);
  }

  // ---- relatórios ----
  if ($path === '/api/relatorios') {
    if ($method !== 'GET') jsonResponse(['message' => 'Método não suportado'], 405);
    if ($sessao['papel'] === 'dashboard') jsonResponse(['message' => 'Acesso negado'], 403);
    $tipo = $_GET['tipo'] ?? null;
    $clienteId = $_GET['clienteId'] ?? null;
    $sql = 'SELECT * FROM relatorios WHERE 1=1';
    $params = [];
    if ($sessao['papel'] === 'cliente') { $sql .= ' AND cliente_id = ? AND ativo = 1'; $params[] = $sessao['clienteId']; }
    elseif ($clienteId) { $sql .= ' AND cliente_id = ?'; $params[] = $clienteId; }
    if ($tipo) { $sql .= ' AND tipo = ?'; $params[] = $tipo; }
    $sql .= ' ORDER BY atualizado_em DESC';
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    jsonResponse(array_map('relatorioResumoToJson', $stmt->fetchAll()));
  }

  // Dados importados dentro dos relatórios HTML (Premium, Luanda): mesmo login do
  // portal, mesma regra de acesso por papel que o relatório em si já tem — nada de
  // token separado, é o mesmo relatório, só que a parte "dados importados" dele.
  if ($path === '/api/relatorio-dados') {
    $id = $_GET['id'] ?? null;
    if (!$id) jsonResponse(['message' => 'Parâmetro "id" obrigatório'], 400);
    $stmt = $db->prepare('SELECT cliente_id, ativo FROM relatorios WHERE id = ?');
    $stmt->execute([$id]);
    $relatorio = $stmt->fetch();
    if (!$relatorio) jsonResponse(['message' => 'Relatório não encontrado'], 404);
    if ($sessao['papel'] === 'dashboard' && $id !== $sessao['relatorioId']) jsonResponse(['message' => 'Acesso negado'], 403);
    if ($sessao['papel'] === 'cliente' && ($relatorio['cliente_id'] !== $sessao['clienteId'] || !$relatorio['ativo'])) jsonResponse(['message' => 'Acesso negado'], 403);

    if ($method === 'GET') {
      $stmt = $db->prepare('SELECT dados_json, atualizado_em FROM relatorio_dados WHERE relatorio_id = ?');
      $stmt->execute([$id]);
      $row = $stmt->fetch();
      jsonResponse(['dados' => $row ? json_decode($row['dados_json'], true) : null, 'atualizadoEm' => $row['atualizado_em'] ?? null]);
    }

    if ($method === 'PUT') {
      $dados = json_decode(file_get_contents('php://input') ?: 'null', true);
      $atualizadoEm = nowIso();
      $stmt = $db->prepare('INSERT INTO relatorio_dados (relatorio_id, dados_json, atualizado_em) VALUES (?,?,?) ON DUPLICATE KEY UPDATE dados_json = VALUES(dados_json), atualizado_em = VALUES(atualizado_em)');
      $stmt->execute([$id, json_encode($dados, JSON_UNESCAPED_UNICODE), $atualizadoEm]);
      jsonResponse(['dados' => $dados, 'atualizadoEm' => $atualizadoEm]);
    }

    jsonResponse(['message' => 'Método não suportado'], 405);
  }

  $id = $_GET['id'] ?? null;
  if ($sessao['papel'] === 'dashboard' && ($method !== 'GET' || $id !== $sessao['relatorioId'])) jsonResponse(['message' => 'Acesso negado'], 403);
  if ($sessao['papel'] === 'cliente' && $method !== 'GET') jsonResponse(['message' => 'Acesso negado'], 403);

  if ($method === 'GET') {
    if (!$id) jsonResponse(['message' => 'Parâmetro "id" obrigatório'], 400);
    $stmt = $db->prepare('SELECT * FROM relatorios WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) jsonResponse(['message' => 'Relatório não encontrado'], 404);
    if ($sessao['papel'] === 'cliente' && ($row['cliente_id'] !== $sessao['clienteId'] || !$row['ativo'])) jsonResponse(['message' => 'Relatório não encontrado'], 404);
    jsonResponse(relatorioToJson($row));
  }

  if ($method === 'PUT') {
    $relatorio = bodyJson();
    $tiposValidos = ['fechamento', 'orcamento', 'comissoes', 'personalizado'];
    if (empty($relatorio['clienteId']) || empty($relatorio['periodo']) || !in_array($relatorio['tipo'] ?? null, $tiposValidos, true)) {
      jsonResponse(['message' => 'Informe o cliente, o período e um tipo válido'], 400);
    }
    if (($relatorio['modo'] ?? null) === 'embed' && empty($relatorio['embedUrl'])) {
      jsonResponse(['message' => 'Informe o link do dashboard (Power BI / Looker Studio)'], 400);
    }
    if ($relatorio['tipo'] === 'personalizado' && ($relatorio['modo'] ?? null) !== 'embed' && !isset($relatorio['abas'])) {
      jsonResponse(['message' => 'Informe ao menos uma aba com widgets'], 400);
    }
    $idFinal = $relatorio['id'] ?? slugify($relatorio['clienteId'] . '-' . $relatorio['tipo'] . '-' . $relatorio['periodo']);
    $modo = $relatorio['modo'] ?? 'importado';
    $ativo = ($relatorio['ativo'] ?? true) !== false ? 1 : 0;
    $atualizadoEm = nowIso();

    $stmt = $db->prepare('SELECT dados_token FROM relatorios WHERE id = ?');
    $stmt->execute([$idFinal]);
    $existente = $stmt->fetch();
    $dadosToken = $relatorio['dadosToken'] ?? ($existente['dados_token'] ?? null);

    // Campos fora da lista fixa (ex.: "abas" do construtor, ou os campos próprios
    // dos relatórios "fechamento" antigos, como kpis/resumoExecutivo/etc.) são
    // guardados tal como vieram, sem precisar listar cada um.
    $camposFixos = ['id', 'clienteId', 'cliente', 'tipo', 'modo', 'periodo', 'descricao', 'embedUrl', 'dadosToken', 'ativo', 'atualizadoEm'];
    $extra = array_diff_key($relatorio, array_flip($camposFixos));

    $stmt = $db->prepare('INSERT INTO relatorios (id, cliente_id, cliente, tipo, modo, periodo, descricao, embed_url, extra_json, dados_token, ativo, atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE cliente_id=VALUES(cliente_id), cliente=VALUES(cliente), tipo=VALUES(tipo), modo=VALUES(modo), periodo=VALUES(periodo), descricao=VALUES(descricao), embed_url=VALUES(embed_url), extra_json=VALUES(extra_json), dados_token=VALUES(dados_token), ativo=VALUES(ativo), atualizado_em=VALUES(atualizado_em)');
    $stmt->execute([
      $idFinal, $relatorio['clienteId'], $relatorio['cliente'] ?? '', $relatorio['tipo'], $modo, $relatorio['periodo'],
      $relatorio['descricao'] ?? null, $relatorio['embedUrl'] ?? null,
      $extra ? json_encode($extra, JSON_UNESCAPED_UNICODE) : null,
      $dadosToken, $ativo, $atualizadoEm,
    ]);

    $stmt = $db->prepare('SELECT * FROM relatorios WHERE id = ?');
    $stmt->execute([$idFinal]);
    jsonResponse(relatorioToJson($stmt->fetch()));
  }

  if ($method === 'DELETE') {
    if (!$id) jsonResponse(['message' => 'Parâmetro "id" obrigatório'], 400);
    $db->prepare('DELETE FROM relatorios WHERE id = ?')->execute([$id]); // relatorio_dados some junto (ON DELETE CASCADE)
    jsonResponse(['ok' => true]);
  }

  jsonResponse(['message' => 'Método não suportado'], 405);
}

// ---------- infoprodutos (públicos pra leitura; gravação exige admin) ----------
if ($path === '/api/file') {
  $tipo = $_GET['path'] ?? null;
  if ($tipo !== 'infoprodutos') jsonResponse(['message' => 'Parâmetro "path" inválido'], 400);

  if ($method === 'GET') {
    $rows = $db->query('SELECT * FROM infoprodutos ORDER BY ordem ASC, nome ASC')->fetchAll();
    jsonResponse(array_map('infoprodutoToJson', $rows));
  }

  if ($method === 'PUT') {
    $sessao = autenticarSessao();
    if (!$sessao || $sessao['papel'] !== 'admin') jsonResponse(['message' => 'Usuário ou senha inválidos'], 401);
    $payload = bodyJson();
    if (array_keys($payload) !== range(0, count($payload) - 1) && !empty($payload)) jsonResponse(['message' => 'Corpo inválido: esperada uma lista de itens'], 400);

    $db->beginTransaction();
    $db->exec('DELETE FROM infoprodutos');
    $stmt = $db->prepare('INSERT INTO infoprodutos (id, nome, descricao, icone, tipo, preco_label, link, ativo, ordem) VALUES (?,?,?,?,?,?,?,?,?)');
    foreach ($payload as $i => $item) {
      $stmt->execute([
        $item['id'] ?? slugify($item['nome'] ?? ('item-' . $i)), $item['nome'] ?? '', $item['descricao'] ?? '',
        $item['icone'] ?? '', $item['tipo'] ?? '', $item['precoLabel'] ?? '', $item['link'] ?? '',
        ($item['ativo'] ?? true) !== false ? 1 : 0, $i,
      ]);
    }
    $db->commit();
    jsonResponse(['ok' => true]);
  }

  jsonResponse(['message' => 'Método não suportado'], 405);
}

jsonResponse(['message' => 'Não encontrado'], 404);

// ---------- helpers de formatação ----------
function usuarioToJson(array $r): array {
  return ['username' => $r['username'], 'nome' => $r['nome'], 'papel' => $r['papel'], 'clienteId' => $r['cliente_id'], 'relatorioId' => $r['relatorio_id'], 'ativo' => (bool)$r['ativo'], 'criadoEm' => $r['criado_em']];
}
function clienteToJson(array $r): array {
  $base = ['id' => $r['id'], 'nome' => $r['nome'], 'criadoEm' => $r['criado_em'], 'atualizadoEm' => $r['atualizado_em']];
  if (!empty($r['dados_json'])) $base = array_merge($base, json_decode($r['dados_json'], true) ?: []);
  return $base;
}
function relatorioResumoToJson(array $r): array {
  return ['id' => $r['id'], 'clienteId' => $r['cliente_id'], 'cliente' => $r['cliente'], 'tipo' => $r['tipo'], 'modo' => $r['modo'], 'periodo' => $r['periodo'], 'ativo' => (bool)$r['ativo'], 'atualizadoEm' => $r['atualizado_em']];
}
function relatorioToJson(array $r): array {
  $base = [
    'id' => $r['id'], 'clienteId' => $r['cliente_id'], 'cliente' => $r['cliente'], 'tipo' => $r['tipo'], 'modo' => $r['modo'],
    'periodo' => $r['periodo'], 'descricao' => $r['descricao'], 'embedUrl' => $r['embed_url'],
    'dadosToken' => $r['dados_token'], 'ativo' => (bool)$r['ativo'], 'atualizadoEm' => $r['atualizado_em'],
  ];
  if (!empty($r['extra_json'])) $base = array_merge($base, json_decode($r['extra_json'], true) ?: []);
  return $base;
}
function infoprodutoToJson(array $r): array {
  return ['id' => $r['id'], 'nome' => $r['nome'], 'descricao' => $r['descricao'], 'icone' => $r['icone'], 'tipo' => $r['tipo'], 'precoLabel' => $r['preco_label'], 'link' => $r['link'], 'ativo' => (bool)$r['ativo']];
}
