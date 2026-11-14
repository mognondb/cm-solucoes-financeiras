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
migrarColunaEmailUsuarios($db);
migrarTabelaResetSenha($db);
migrarColunasDiagnosticos($db);
garantirClienteDemonstrativo($db);
garantirProdutoPsicologos($db);
garantirPostsIniciais($db);
ajustarPrecosPlanilhas($db);

// ---------- login ----------
if ($path === '/api/login') {
  $sessao = autenticarSessao();
  if (!$sessao) jsonResponse(['message' => 'Usuário ou senha inválidos'], 401);
  jsonResponse(['ok' => true, 'papel' => $sessao['papel'], 'nome' => $sessao['nome'], 'clienteId' => $sessao['clienteId'], 'relatorioId' => $sessao['relatorioId']]);
}

// ---------- contas de usuário: e-mail próprio, boas-vindas e redefinição de senha ----------
// Cada usuário tem seu e-mail cadastrado (coluna "email" em usuarios) e usa esse e-mail
// pra receber o aviso de conta criada e pra "esqueci minha senha" — são contas
// independentes, não passam pelo e-mail de ninguém mais. Se por algum motivo um usuário
// antigo não tiver e-mail cadastrado ainda, cai nesta caixa fixa como rede de segurança.
const EMAIL_RESET_SENHA = 'mognon.db@gmail.com';

/** Cria, uma única vez, a página de venda da "Planilha de Controle Financeiro para Psicólogos" e remove o infoproduto
 *  cadastrado antes (api/seed_produto_psicologos.php). A trava do MySQL evita que duas chamadas simultâneas (a página
 *  inicial faz duas ao carregar) criem a página em dobro. Qualquer falha é engolida: nunca pode derrubar a API. */
function garantirProdutoPsicologos(PDO $db): void {
  $trava = false;
  try {
    $db->exec('CREATE TABLE IF NOT EXISTS migracoes (
      nome VARCHAR(80) PRIMARY KEY,
      aplicada_em VARCHAR(40) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    $feito = function () use ($db): bool {
      $stmt = $db->prepare('SELECT 1 FROM migracoes WHERE nome = ?');
      $stmt->execute(['produto-psicologos-v1']);
      return (bool)$stmt->fetchColumn();
    };
    if ($feito()) return;
    $arq = __DIR__ . '/seed_produto_psicologos.php';
    if (!is_file($arq)) return; // o deploy ainda está subindo os arquivos
    $trava = (int)$db->query("SELECT GET_LOCK('cm_produto_psicologos_v1', 0)")->fetchColumn() === 1;
    if (!$trava || $feito()) return;
    require_once $arq;
    produtoPsicologosAplicar($db);
  } catch (Throwable $e) {
    // sem alarde: tenta de novo na próxima chamada
  } finally {
    if ($trava) { try { $db->query("SELECT RELEASE_LOCK('cm_produto_psicologos_v1')")->fetchColumn(); } catch (Throwable $e) {} }
  }
}

/** Publica, uma única vez cada, os posts que estão em api/seeds/*.php (um arquivo por post; o marcador é o nome do arquivo).
 *  É como um post entra no ar sem login no painel: o arquivo vai junto no deploy. Depois de criado, o post é editado
 *  normalmente no painel e, se for apagado lá, não volta. A trava do MySQL evita duplicar quando duas chamadas chegam juntas.
 *  Qualquer falha é engolida: nunca pode derrubar a API. */
function garantirPostsIniciais(PDO $db): void {
  try {
    $arquivos = glob(__DIR__ . '/seeds/*.php');
    if (!$arquivos) return;
    $db->exec('CREATE TABLE IF NOT EXISTS migracoes (
      nome VARCHAR(80) PRIMARY KEY,
      aplicada_em VARCHAR(40) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    $feitos = $db->query('SELECT nome FROM migracoes')->fetchAll(PDO::FETCH_COLUMN);
    foreach ($arquivos as $arq) {
      $marcador = 'seed:' . basename($arq, '.php');
      if (in_array($marcador, $feitos, true)) continue;
      $trava = false;
      try {
        $def = require $arq;
        if (!is_array($def) || empty($def['post'])) continue;
        foreach (($def['arquivos'] ?? []) as $f) { // imagens que sobem junto com o deploy: espera chegarem
          if (!is_file(dirname(__DIR__) . $f)) continue 2;
        }
        $trava = (int)$db->query("SELECT GET_LOCK('cm_seed_" . md5($marcador) . "', 0)")->fetchColumn() === 1;
        if (!$trava) continue;
        $stmt = $db->prepare('SELECT 1 FROM migracoes WHERE nome = ?');
        $stmt->execute([$marcador]);
        if ($stmt->fetchColumn()) continue;
        require_once __DIR__ . '/blog_lib.php';
        blogMigrar($db);
        $stmt = $db->prepare('SELECT id FROM posts WHERE slug = ? LIMIT 1');
        $stmt->execute([$def['post']['slug'] ?? '']);
        if (!$stmt->fetchColumn()) blogSalvar($db, $def['post']);
        $db->prepare('INSERT INTO migracoes (nome, aplicada_em) VALUES (?, ?)')->execute([$marcador, nowIso()]);
      } catch (Throwable $e) {
        // sem alarde: tenta de novo na próxima chamada
      } finally {
        if ($trava) { try { $db->query("SELECT RELEASE_LOCK('cm_seed_" . md5($marcador) . "')")->fetchColumn(); } catch (Throwable $e) {} }
      }
    }
  } catch (Throwable $e) {
    // sem alarde
  }
}

/** Preços das duas planilhas de psicologia (e o link de compra da de Controle Financeiro), aplicados UMA vez nas páginas que
 *  já estão no ar. Só preenche o preço se estiver vazio e só troca o link se ainda for o antigo: o que foi editado no painel
 *  não é sobrescrito. Instalações novas já nascem certas pelos arquivos de api/seed*. Falha engolida: nunca derruba a API. */
function ajustarPrecosPlanilhas(PDO $db): void {
  $marcador = 'ajuste:precos-planilhas-v1';
  try {
    $db->exec('CREATE TABLE IF NOT EXISTS migracoes (
      nome VARCHAR(80) PRIMARY KEY,
      aplicada_em VARCHAR(40) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    $stmt = $db->prepare('SELECT 1 FROM migracoes WHERE nome = ?');
    $stmt->execute([$marcador]);
    if ($stmt->fetchColumn()) return;
    require_once __DIR__ . '/blog_lib.php';
    blogMigrar($db);
    $agora = nowIso();
    $db->prepare("UPDATE posts SET preco_label = ?, atualizado_em = ? WHERE tipo = 'infoproduto' AND slug = ? AND (preco_label IS NULL OR preco_label = '')")
       ->execute(['R$ 29,99', $agora, 'planilha-controle-financeiro-psicologos']);
    $db->prepare("UPDATE posts SET link_compra = ?, atualizado_em = ? WHERE tipo = 'infoproduto' AND slug = ? AND link_compra = ?")
       ->execute(['https://pay.hotmart.com/Q107277632H', $agora, 'planilha-controle-financeiro-psicologos', 'https://pay.hotmart.com/G107631232H']);
    $db->prepare("UPDATE posts SET preco_label = ?, atualizado_em = ? WHERE tipo = 'infoproduto' AND slug = ? AND (preco_label IS NULL OR preco_label = '')")
       ->execute(['R$ 10,00', $agora, 'planilha-precificacao-psicologos']);
    $db->prepare('INSERT IGNORE INTO migracoes (nome, aplicada_em) VALUES (?, ?)')->execute([$marcador, $agora]);
  } catch (Throwable $e) {
    // sem alarde: tenta de novo na próxima chamada
  }
}

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

/** Cliente "Demonstrativo" (empresa e números 100% fictícios, usado para gravar vídeos e
 *  posts): criado UMA vez, com o relatório nativo apontando para relatorios/demo.html.
 *  O marcador na tabela "migracoes" garante que, se o cliente for apagado depois no painel,
 *  ele não seja recriado. Qualquer falha aqui é engolida de propósito: nunca pode derrubar a API. */
function garantirClienteDemonstrativo(PDO $db): void {
  try {
    $db->exec('CREATE TABLE IF NOT EXISTS migracoes (
      nome VARCHAR(80) PRIMARY KEY,
      aplicada_em VARCHAR(40) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    $stmt = $db->prepare('SELECT 1 FROM migracoes WHERE nome = ?');
    $stmt->execute(['cliente-demonstrativo-v1']);
    if ($stmt->fetchColumn()) return;

    $agora = nowIso();
    $db->prepare('INSERT IGNORE INTO clientes (id, nome, dados_json, criado_em, atualizado_em) VALUES (?,?,?,?,?)')
      ->execute(['demonstrativo', 'Demonstrativo', null, $agora, $agora]);
    $db->prepare('INSERT IGNORE INTO relatorios (id, cliente_id, cliente, tipo, modo, periodo, descricao, embed_url, extra_json, dados_token, ativo, atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      ->execute(['demonstrativo-fechamento-visao-geral', 'demonstrativo', 'Demonstrativo', 'fechamento', 'nativo', 'Visão Geral',
        'Gestão de caixa completa (dados fictícios)', 'relatorios/demo.html', null, null, 1, $agora]);
    $db->prepare('INSERT INTO migracoes (nome, aplicada_em) VALUES (?,?)')->execute(['cliente-demonstrativo-v1', $agora]);
  } catch (Throwable $e) {
    // sem alarde: o demonstrativo é opcional
  }
}

/** Colunas do CM Diagnóstico (percurso adaptativo): respostas e resultado completos em JSON, segmento e versão do modelo.
 *  Os diagnósticos antigos (formulário curto) continuam intactos: essas colunas ficam nulas neles. */
function migrarColunasDiagnosticos(PDO $db): void {
  try {
    migrarColunasDiagnosticosAplicar($db);
  } catch (Throwable $e) {
    // sem alarde: se o banco recusar o ALTER, só o CM Diagnóstico novo fica indisponível; o resto da API segue
  }
}
function migrarColunasDiagnosticosAplicar(PDO $db): void {
  // pdf_*: envio do relatório em PDF por e-mail (token de uso único, hash dele, quando foi enviado e quantas tentativas)
  $cols = ['segmento' => 'VARCHAR(40) NULL', 'versao' => 'TINYINT NULL', 'respostas_json' => 'MEDIUMTEXT NULL', 'resultado_json' => 'MEDIUMTEXT NULL',
    'pdf_token_hash' => 'CHAR(64) NULL', 'pdf_enviado_em' => 'VARCHAR(32) NULL', 'pdf_tentativas' => 'TINYINT NOT NULL DEFAULT 0'];
  $stmt = $db->query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'diagnosticos'");
  $tem = array_map('strtolower', $stmt->fetchAll(PDO::FETCH_COLUMN));
  if (!$tem) return; // tabela ainda não existe (instalação nova passa antes pelo setup)
  foreach ($cols as $nome => $tipo) {
    if (!in_array($nome, $tem, true)) $db->exec("ALTER TABLE diagnosticos ADD COLUMN $nome $tipo");
  }
}

function migrarColunaEmailUsuarios(PDO $db): void {
  $stmt = $db->query("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'email'");
  if ((int)$stmt->fetchColumn() === 0) $db->exec('ALTER TABLE usuarios ADD COLUMN email VARCHAR(190) NULL AFTER nome');
}

/** Painel administrativo (papel admin) e portal do cliente (cliente/dashboard) são
 *  duas "portas de entrada" separadas no site — o link de redefinição leva pra cada
 *  uma dependendo de quem é o usuário. */
function linkRedefinicaoSenha(string $username, string $tokenCru, string $papel): string {
  $pagina = $papel === 'admin' ? 'admin/index.html' : 'portal/index.html';
  return 'https://cmfinanceiro.com/' . $pagina . '?resetUser=' . urlencode($username) . '&resetToken=' . $tokenCru;
}

/** Gera um token de redefinição (válido por 1h, uso único) e manda por e-mail — de
 *  boas-vindas (conta recém-criada) ou de "esqueci minha senha". */
function enviarEmailRedefinicao(PDO $db, array $user, string $motivo): void {
  $tokenCru = bin2hex(random_bytes(32));
  $agora = nowIso();
  $expiraEm = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->modify('+1 hour')->format('Y-m-d\TH:i:s.v\Z');
  $db->prepare('INSERT INTO reset_senha (id, username, token_hash, criado_em, expira_em) VALUES (?,?,?,?,?)')
    ->execute(['rst-' . bin2hex(random_bytes(8)), $user['username'], hash('sha256', $tokenCru), $agora, $expiraEm]);

  $link = linkRedefinicaoSenha($user['username'], $tokenCru, $user['papel']);
  $temEmailProprio = !empty($user['email']);
  $destino = $temEmailProprio ? $user['email'] : EMAIL_RESET_SENHA;
  $avisoSemEmail = $temEmailProprio ? '' : "\n\n(Esse usuário ainda não tem e-mail cadastrado — complete o cadastro em Usuários no painel administrativo.)";

  if ($motivo === 'boas-vindas') {
    $assunto = 'Seu acesso foi criado — CM Soluções Financeiras';
    $corpo = "Foi criado um acesso pra você em cmfinanceiro.com, com o usuário \"{$user['username']}\".\n\n"
      . "Antes de começar a usar, defina sua própria senha pelo link abaixo:\n{$link}\n\n"
      . "Esse link expira em 1 hora e só pode ser usado uma vez. Depois disso é só entrar normalmente com seu usuário e a senha que você escolher.{$avisoSemEmail}";
  } else {
    $assunto = 'Redefinição de senha — CM Soluções Financeiras';
    $corpo = "Foi solicitada a redefinição de senha do usuário \"{$user['username']}\" em cmfinanceiro.com.\n\n"
      . "Para definir uma senha nova, acesse o link abaixo:\n{$link}\n\n"
      . "Esse link expira em 1 hora e só pode ser usado uma vez.\n\n"
      . "Se você não pediu essa redefinição, ignore este e-mail — nada foi alterado ainda.{$avisoSemEmail}";
  }
  $headers = "From: CM Soluções Financeiras <nao-responda@cmfinanceiro.com>\r\nContent-Type: text/plain; charset=UTF-8";
  @mail($destino, $assunto, $corpo, $headers);
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
    if ($podeEnviar) enviarEmailRedefinicao($db, $user, 'esqueci');
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

  jsonResponse(['ok' => true, 'papel' => $user['papel'], 'clienteId' => $user['cliente_id'], 'relatorioId' => $user['relatorio_id']]);
}

// ---------- diagnóstico financeiro (formulário público do site) ----------
if ($path === '/api/diagnostico') {
  if ($method === 'POST') {
    $dados = bodyJson();
    if (!empty($dados['website'])) jsonResponse(['ok' => true]); // campo-armadilha: bots preenchem, finge sucesso

    if (empty($dados['nome']) || empty($dados['email'])) jsonResponse(['message' => 'Informe nome e e-mail'], 400);

    $limitar = fn($v, $max) => mb_substr(trim((string)($v ?? '')), 0, $max);
    $id = 'diag-' . round(microtime(true) * 1000) . '-' . substr(bin2hex(random_bytes(4)), 0, 6);

    // CM Diagnóstico (percurso adaptativo): guarda respostas e resultado completos
    if ((int)($dados['versao'] ?? 0) >= 2) {
      $emailOk = filter_var(trim((string)$dados['email']), FILTER_VALIDATE_EMAIL);
      if (!$emailOk) jsonResponse(['message' => 'Informe um e-mail válido'], 400);
      if (empty($dados['consentimento'])) jsonResponse(['message' => 'É preciso concordar com o contato para enviar'], 400);
      $respostas = $dados['respostas'] ?? null; $resultado = $dados['resultado'] ?? null;
      if (!is_array($respostas) || !is_array($resultado)) jsonResponse(['message' => 'Respostas inválidas'], 400);
      $respJson = json_encode($respostas, JSON_UNESCAPED_UNICODE); $resJson = json_encode($resultado, JSON_UNESCAPED_UNICODE);
      if ($respJson === false || $resJson === false || strlen($respJson) > 40000 || strlen($resJson) > 120000) jsonResponse(['message' => 'Dados grandes demais'], 413);
      $segmentos = ['alimentacao', 'saude', 'estetica', 'comercio', 'servicos', 'outro'];
      $segmento = in_array($dados['segmento'] ?? '', $segmentos, true) ? $dados['segmento'] : 'outro';
      $perfil = []; foreach ((array)($resultado['perfil'] ?? []) as $p) if (is_array($p)) $perfil[(string)($p['rotulo'] ?? '')] = (string)($p['valor'] ?? '');
      $stmt = $db->prepare('INSERT INTO diagnosticos (id, nome, email, telefone, empresa, ramo, colaboradores, controle_atual, dificuldade, objetivo, urgencia, mensagem, lido, criado_em, segmento, versao, respostas_json, resultado_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?)');
      $stmt->execute([
        $id, $limitar($dados['nome'], 120), $limitar($emailOk, 160), $limitar($dados['telefone'] ?? '', 40), $limitar($dados['empresa'] ?? '', 120),
        $limitar($perfil['Segmento'] ?? $segmento, 80), $limitar($perfil['Equipe'] ?? '', 40), '', '', '', '', '', nowIso(),
        $segmento, 2, $respJson, $resJson,
      ]);
      avisarNovoDiagnostico($db, $dados, $resultado, $segmento);
      // token de uso único para enviar o PDF do relatório por e-mail: só o hash fica no banco. Se a coluna não existir
      // (migração recusada), o diagnóstico segue normal, só sem o envio do PDF.
      $pdfToken = null;
      try {
        $pdfToken = bin2hex(random_bytes(16));
        $db->prepare('UPDATE diagnosticos SET pdf_token_hash = ? WHERE id = ?')->execute([hash('sha256', $pdfToken), $id]);
      } catch (Throwable $e) {
        $pdfToken = null;
      }
      jsonResponse(['ok' => true, 'id' => $id, 'pdfToken' => $pdfToken]);
    }

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

// ---------- relatório do CM Diagnóstico em PDF, enviado por e-mail à pessoa que o fez ----------
// O PDF é gerado no navegador (as regras e os textos do relatório vivem no JavaScript) e chega aqui junto com o id do
// diagnóstico e o token devolvido no cadastro. Nada é gravado em disco: o PDF só é anexado ao e-mail e descartado.
const PDF_MAX_BYTES = 6 * 1024 * 1024;       // tamanho máximo do PDF
const PDF_JANELA_SEGUNDOS = 2 * 3600;        // o token vale 2 horas a partir do cadastro
const PDF_MAX_TENTATIVAS = 3;                // por diagnóstico
const PDF_MAX_POR_EMAIL_DIA = 3;             // para o mesmo endereço, em 24 horas
const PDF_MAX_POR_HORA = 40;                 // no site todo: protege a reputação do e-mail da CM

if ($path === '/api/diagnostico/pdf') {
  if ($method !== 'POST') jsonResponse(['message' => 'Método não suportado'], 405);
  $dados = bodyJson();
  $id = (string)($dados['id'] ?? ''); $token = (string)($dados['token'] ?? ''); $b64 = $dados['pdf'] ?? '';
  if (!preg_match('/^diag-\d{10,15}-[a-f0-9]{6}$/', $id) || !preg_match('/^[a-f0-9]{32}$/', $token) || !is_string($b64) || $b64 === '') {
    jsonResponse(['message' => 'Pedido inválido'], 400);
  }
  try {
    $stmt = $db->prepare('SELECT id, nome, email, criado_em, resultado_json, pdf_token_hash, pdf_enviado_em, pdf_tentativas FROM diagnosticos WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
  } catch (Throwable $e) {
    jsonResponse(['message' => 'Envio por e-mail indisponível no momento'], 503);
  }
  // mesma resposta para "não existe" e "token errado": quem não tem o token não descobre quais ids existem
  if (!$row || empty($row['pdf_token_hash']) || !hash_equals((string)$row['pdf_token_hash'], hash('sha256', $token))) {
    jsonResponse(['message' => 'Não autorizado'], 403);
  }
  if (!empty($row['pdf_enviado_em'])) jsonResponse(['ok' => true, 'jaEnviado' => true]);
  $criado = strtotime((string)$row['criado_em']);
  if (!$criado || time() - $criado > PDF_JANELA_SEGUNDOS) jsonResponse(['message' => 'Este envio expirou. Baixe o PDF pela tela do relatório.'], 410);
  if ((int)$row['pdf_tentativas'] >= PDF_MAX_TENTATIVAS) jsonResponse(['message' => 'Limite de tentativas atingido. Baixe o PDF pela tela do relatório.'], 429);

  try {
    $q = $db->prepare('SELECT COUNT(*) FROM diagnosticos WHERE pdf_enviado_em >= ?');
    $q->execute([gmdate('Y-m-d\TH:i:s', time() - 3600)]);
    $naHora = (int)$q->fetchColumn();
    $q = $db->prepare('SELECT COUNT(*) FROM diagnosticos WHERE email = ? AND pdf_enviado_em >= ?');
    $q->execute([$row['email'], gmdate('Y-m-d\TH:i:s', time() - 86400)]);
    $noDia = (int)$q->fetchColumn();
  } catch (Throwable $e) {
    jsonResponse(['message' => 'Envio por e-mail indisponível no momento'], 503);
  }
  if ($naHora >= PDF_MAX_POR_HORA || $noDia >= PDF_MAX_POR_EMAIL_DIA) {
    jsonResponse(['message' => 'Muitos envios em pouco tempo. Baixe o PDF pela tela do relatório.'], 429);
  }

  if (strlen($b64) > (int)(PDF_MAX_BYTES * 4 / 3) + 16) jsonResponse(['message' => 'PDF grande demais'], 413);
  $pdf = base64_decode($b64, true);
  $erroPdf = $pdf === false ? 'PDF inválido' : validarPdfDiagnostico($pdf);
  if ($erroPdf !== null) jsonResponse(['message' => $erroPdf], 400);

  // reserva a tentativa antes de enviar (duas requisições ao mesmo tempo não passam do limite)
  $res = $db->prepare('UPDATE diagnosticos SET pdf_tentativas = pdf_tentativas + 1 WHERE id = ? AND pdf_enviado_em IS NULL AND pdf_tentativas < ?');
  $res->execute([$id, PDF_MAX_TENTATIVAS]);
  if ($res->rowCount() === 0) jsonResponse(['message' => 'Não foi possível concluir o envio'], 409);

  if (!enviarRelatorioPdfPorEmail($row, $pdf)) {
    jsonResponse(['message' => 'Não foi possível enviar o e-mail agora. Você pode baixar o PDF pela tela do relatório.'], 502);
  }
  $db->prepare('UPDATE diagnosticos SET pdf_enviado_em = ? WHERE id = ?')->execute([gmdate('Y-m-d\TH:i:s') . 'Z', $id]);
  jsonResponse(['ok' => true]);
}

/** O PDF vem do navegador, então só entra no e-mail o que parece exatamente com o que o gerador do site produz
 *  (jsPDF, páginas com imagem): sem ações, scripts, links, arquivos embutidos nem fluxos compactados de objetos,
 *  onde um conteúdo ativo poderia se esconder. Devolve a mensagem de erro ou null se estiver tudo certo. */
function validarPdfDiagnostico(string $pdf): ?string {
  $n = strlen($pdf);
  if ($n < 2000 || $n > PDF_MAX_BYTES) return 'PDF inválido';
  if (strncmp($pdf, '%PDF-1.', 7) !== 0) return 'PDF inválido';
  if (strpos(substr($pdf, -2048), '%%EOF') === false) return 'PDF inválido';
  if (strpos($pdf, '/Producer (jsPDF') === false || strpos($pdf, 'CM Diagnostico') === false) return 'PDF inválido';
  // a busca pelos termos proibidos só olha o que está FORA dos blocos de dados (imagens, páginas): ali os bytes aparecem por acaso
  $estrutura = pdfSemFluxos($pdf);
  if ($estrutura === null) return 'PDF inválido';
  // o jsPDF escreve "/OpenAction [3 0 R /FitH null]" no catálogo: é só o zoom inicial (um destino entre colchetes), não uma ação.
  // Qualquer outra forma de /OpenAction (dicionário ou referência a um objeto) pode disparar algo e continua barrada.
  $pdf = preg_replace('#/OpenAction\s*\[[^\]]{0,80}\]#', '', $estrutura);
  if ($pdf === null) return 'PDF inválido';
  foreach (['/JavaScript', '/JS', '/Launch', '/OpenAction', '/AA', '/EmbeddedFile', '/RichMedia', '/XFA', '/URI', '/SubmitForm', '/GoToR', '/GoToE', '/ImportData', '/ObjStm', '/Encrypt', '/Annots', '/AcroForm'] as $perigoso) {
    if (strpos($pdf, $perigoso) !== false) return 'PDF inválido';
  }
  $paginas = preg_match_all('#/Type\s*/Page\b#', $pdf);
  if ($paginas < 1 || $paginas > 40) return 'PDF inválido';
  return null;
}

/** O PDF sem o conteúdo dos blocos "stream ... endstream" (só a estrutura de objetos). Null se algum bloco ficar aberto. */
function pdfSemFluxos(string $pdf): ?string {
  $saida = ''; $pos = 0; $n = strlen($pdf);
  while ($pos < $n) {
    $i = strpos($pdf, 'stream', $pos);
    if ($i === false) return $saida . substr($pdf, $pos);
    $saida .= substr($pdf, $pos, $i + 6 - $pos);
    if ($i >= 3 && substr($pdf, $i - 3, 3) === 'end') { $pos = $i + 6; continue; } // "endstream"
    $fim = strpos($pdf, 'endstream', $i + 6);
    if ($fim === false) return null;
    $pos = $fim;
  }
  return $saida;
}

function nivelAnaliseTexto(array $res, string $k): string {
  $a = $res['analises'][$k] ?? [];
  $mapa = ['critico' => 'Ponto crítico', 'atencao' => 'Atenção', 'desenvolvimento' => 'Em desenvolvimento', 'solido' => 'Sólido'];
  return ($mapa[$a['nivel'] ?? ''] ?? 'Sem dados') . (isset($a['pct']) && is_numeric($a['pct']) ? ' (' . (int)$a['pct'] . '/100)' : '');
}

/** Monta e envia o e-mail (texto + HTML + PDF em anexo). Só o endereço validado vai nos cabeçalhos; o nome entra apenas no corpo,
 *  sem caracteres de controle e escapado no HTML. */
function enviarRelatorioPdfPorEmail(array $row, string $pdf): bool {
  try {
    $para = filter_var(trim((string)$row['email']), FILTER_VALIDATE_EMAIL);
    if (!$para) return false;
    $limpa = fn($v, $max) => mb_substr(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', trim((string)$v)), 0, $max);
    $partes = preg_split('/\s+/u', $limpa($row['nome'], 120), -1, PREG_SPLIT_NO_EMPTY);
    $primeiro = $partes ? $partes[0] : '';
    $res = json_decode((string)($row['resultado_json'] ?? ''), true) ?: [];
    $niveis = [
      'Saúde financeira' => nivelAnaliseTexto($res, 'saude'),
      'Maturidade de gestão' => nivelAnaliseTexto($res, 'maturidade'),
      'Eficiência operacional' => nivelAnaliseTexto($res, 'eficiencia'),
    ];
    $whats = 'https://wa.me/554888766576';
    $ola = $primeiro !== '' ? "Olá, {$primeiro}!" : 'Olá!';

    $texto = "$ola\r\n\r\n"
      . "Obrigado por fazer o CM Diagnóstico. O relatório completo do seu negócio está em anexo, em PDF: ele reúne as três análises, os indicadores e as recomendações, em ordem de prioridade.\r\n\r\n"
      . "Resumo:\r\n";
    foreach ($niveis as $rot => $niv) $texto .= "- $rot: $niv\r\n";
    $texto .= "\r\nQuer ajuda para colocar as recomendações em prática? Chame a CM no WhatsApp, sem compromisso:\r\n$whats\r\n\r\n"
      . "CM Soluções Financeiras · https://cmfinanceiro.com\r\n\r\n"
      . "Você recebeu este e-mail porque pediu o relatório do CM Diagnóstico em cmfinanceiro.com. É um envio automático.\r\n";

    $h = fn($v) => htmlspecialchars((string)$v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $linhas = '';
    foreach ($niveis as $rot => $niv) $linhas .= '<tr><td style="padding:8px 0;border-bottom:1px solid #ebe6dc;color:#6b6b63">' . $h($rot) . '</td><td style="padding:8px 0;border-bottom:1px solid #ebe6dc;text-align:right;font-weight:600;color:#3f4c39">' . $h($niv) . '</td></tr>';
    $html = '<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f8f6f1;font-family:Arial,Helvetica,sans-serif;color:#2e2e2e">'
      . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8f6f1"><tr><td align="center" style="padding:24px 12px">'
      . '<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #ebe6dc;border-radius:14px">'
      . '<tr><td style="padding:22px 28px;border-bottom:1px solid #ebe6dc;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;color:#8f6d38">CM Soluções Financeiras</td></tr>'
      . '<tr><td style="padding:28px 28px 8px;font-size:22px;line-height:1.3;color:#3f4c39;font-family:Georgia,serif">' . $h($ola) . '</td></tr>'
      . '<tr><td style="padding:8px 28px;font-size:15px;line-height:1.6">Obrigado por fazer o <strong>CM Diagnóstico</strong>. O relatório completo do seu negócio está <strong>em anexo, em PDF</strong>: ele reúne as três análises, os indicadores e as recomendações, em ordem de prioridade.</td></tr>'
      . '<tr><td style="padding:8px 28px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">' . $linhas . '</table></td></tr>'
      . '<tr><td style="padding:18px 28px 8px;font-size:15px;line-height:1.6">Quer ajuda para colocar as recomendações em prática? Chame a CM no WhatsApp, sem compromisso.</td></tr>'
      . '<tr><td style="padding:6px 28px 26px"><a href="' . $h($whats) . '" style="display:inline-block;background:#b18a52;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:999px">Conversar pelo WhatsApp</a></td></tr>'
      . '<tr><td style="padding:16px 28px;border-top:1px solid #ebe6dc;font-size:12px;line-height:1.5;color:#6b6b63">Você recebeu este e-mail porque pediu o relatório do CM Diagnóstico em cmfinanceiro.com. É um envio automático.</td></tr>'
      . '</table></td></tr></table></body></html>';

    $b1 = 'cm_mix_' . bin2hex(random_bytes(8)); $b2 = 'cm_alt_' . bin2hex(random_bytes(8));
    $enc = fn($v) => '=?UTF-8?B?' . base64_encode($v) . '?=';
    $arquivo = 'CM-Diagnostico-' . gmdate('Y-m-d') . '.pdf';
    $cab = "From: {$enc('CM Soluções Financeiras')} <nao-responda@cmfinanceiro.com>\r\n"
      . "MIME-Version: 1.0\r\n"
      . "Content-Type: multipart/mixed; boundary=\"$b1\"";
    $corpo = "--$b1\r\nContent-Type: multipart/alternative; boundary=\"$b2\"\r\n\r\n"
      . "--$b2\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($texto)) . "\r\n"
      . "--$b2\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($html)) . "\r\n"
      . "--$b2--\r\n"
      . "--$b1\r\nContent-Type: application/pdf; name=\"$arquivo\"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename=\"$arquivo\"\r\n\r\n"
      . chunk_split(base64_encode($pdf)) . "\r\n"
      . "--$b1--\r\n";
    return (bool)@mail($para, $enc('Seu relatório do CM Diagnóstico'), $corpo, $cab);
  } catch (Throwable $e) {
    return false;
  }
}

if ($path === '/api/diagnosticos') {
  if ($method !== 'GET') jsonResponse(['message' => 'Método não suportado'], 405);
  $sessao = autenticarSessao();
  if (!$sessao || $sessao['papel'] !== 'admin') jsonResponse(['message' => 'Acesso negado'], 403);
  $rows = $db->query('SELECT * FROM diagnosticos ORDER BY criado_em DESC')->fetchAll();
  jsonResponse(array_map('diagnosticoToJson', $rows));
}

/** Aviso por e-mail à CM a cada diagnóstico recebido (melhor esforço: se o envio falhar, o registro já está no painel).
 *  Só texto simples; nada que veio do navegador entra no assunto nem nos cabeçalhos. */
function avisarNovoDiagnostico(PDO $db, array $d, array $res, string $segmento): void {
  try {
    // teto de avisos por hora: se alguém despejar o formulário em massa, o painel guarda tudo, mas a caixa de e-mail não enche
    $stmt = $db->prepare('SELECT COUNT(*) FROM diagnosticos WHERE criado_em >= ?');
    $stmt->execute([gmdate('Y-m-d\TH:i:s', time() - 3600)]);
    if ((int)$stmt->fetchColumn() > 12) return;
    $limpa = fn($v, $max = 160) => mb_substr(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', trim((string)$v)), 0, $max);
    $nivel = function ($k) use ($res) {
      $a = $res['analises'][$k] ?? [];
      $mapa = ['critico' => 'Ponto crítico', 'atencao' => 'Atenção', 'desenvolvimento' => 'Em desenvolvimento', 'solido' => 'Sólido'];
      return ($mapa[$a['nivel'] ?? ''] ?? 'Sem dados') . (isset($a['pct']) && is_numeric($a['pct']) ? ' (' . (int)$a['pct'] . '/100)' : '');
    };
    $recs = []; foreach (array_slice((array)($res['recomendacoes'] ?? []), 0, 3) as $r) if (is_array($r)) $recs[] = '- ' . $limpa($r['titulo'] ?? '', 120);
    $tel = preg_replace('/\D+/', '', (string)($d['telefone'] ?? ''));
    $corpo = "Novo CM Diagnóstico recebido em cmfinanceiro.com.\n\n"
      . 'Nome: ' . $limpa($d['nome'] ?? '', 120) . "\n"
      . 'Empresa: ' . $limpa($d['empresa'] ?? '', 120) . "\n"
      . 'E-mail: ' . $limpa($d['email'] ?? '') . "\n"
      . 'WhatsApp: ' . $limpa($d['telefone'] ?? '', 40) . ($tel !== '' ? "  (https://wa.me/55$tel)" : '') . "\n"
      . 'Segmento: ' . $limpa($segmento, 40) . "\n"
      . 'Modo: ' . (($res['modo'] ?? '') === 'preciso' ? 'Preciso' . (!empty($res['importacao']) ? ' (com extrato importado)' : '') : 'Rápido') . "\n\n"
      . 'Saúde financeira: ' . $nivel('saude') . "\n"
      . 'Maturidade de gestão: ' . $nivel('maturidade') . "\n"
      . 'Eficiência operacional: ' . $nivel('eficiencia') . "\n\n"
      . "Principais recomendações:\n" . ($recs ? implode("\n", $recs) : '-') . "\n\n"
      . "O relatório completo e as respostas estão no painel administrativo, na aba Diagnósticos.";
    $headers = "From: CM Soluções Financeiras <nao-responda@cmfinanceiro.com>\r\nContent-Type: text/plain; charset=UTF-8";
    @mail(EMAIL_RESET_SENHA, 'Novo CM Diagnóstico: ' . $limpa($d['nome'] ?? 'sem nome', 60), $corpo, $headers);
  } catch (Throwable $e) {
    // sem alarde
  }
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
    'versao' => isset($r['versao']) ? (int)$r['versao'] : null, 'segmento' => $r['segmento'] ?? null,
    'pdfEnviadoEm' => $r['pdf_enviado_em'] ?? null,
    'respostas' => !empty($r['respostas_json']) ? json_decode($r['respostas_json'], true) : null,
    'resultado' => !empty($r['resultado_json']) ? json_decode($r['resultado_json'], true) : null,
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
      $email = trim($dados['email'] ?? '');
      if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) jsonResponse(['message' => 'E-mail inválido'], 400);
      $papeisValidos = ['admin', 'cliente', 'dashboard'];
      if (!in_array($dados['papel'] ?? null, $papeisValidos, true)) jsonResponse(['message' => 'Papel inválido'], 400);
      if ($dados['papel'] === 'cliente' && empty($dados['clienteId'])) jsonResponse(['message' => 'Informe o cliente para o papel "cliente"'], 400);
      if ($dados['papel'] === 'dashboard' && empty($dados['relatorioId'])) jsonResponse(['message' => 'Informe o relatório para o papel "dashboard"'], 400);

      $stmt = $db->prepare('SELECT * FROM usuarios WHERE username = ?');
      $stmt->execute([$username]);
      $existente = $stmt->fetch();
      if (!$existente && empty($dados['senha'])) jsonResponse(['message' => 'Informe uma senha para o novo usuário'], 400);
      if (!$existente && $email === '') jsonResponse(['message' => 'Informe o e-mail do novo usuário'], 400);

      $saltHex = ($existente && empty($dados['senha'])) ? $existente['salt_hex'] : gerarSaltHex();
      $hashHex = !empty($dados['senha']) ? hashSenha($dados['senha'], $saltHex) : $existente['hash_hex'];
      $nome = $dados['nome'] ?? $username;
      $emailFinal = $email !== '' ? $email : ($existente['email'] ?? null);
      $clienteId = $dados['papel'] === 'cliente' ? $dados['clienteId'] : null;
      $relatorioId = $dados['papel'] === 'dashboard' ? $dados['relatorioId'] : null;
      $ativo = ($dados['ativo'] ?? true) !== false ? 1 : 0;
      $criadoEm = $existente['criado_em'] ?? nowIso();
      $atualizadoEm = nowIso();

      $stmt = $db->prepare('INSERT INTO usuarios (username, nome, email, papel, cliente_id, relatorio_id, ativo, salt_hex, hash_hex, criado_em, atualizado_em)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE nome=VALUES(nome), email=VALUES(email), papel=VALUES(papel), cliente_id=VALUES(cliente_id), relatorio_id=VALUES(relatorio_id), ativo=VALUES(ativo), salt_hex=VALUES(salt_hex), hash_hex=VALUES(hash_hex), atualizado_em=VALUES(atualizado_em)');
      $stmt->execute([$username, $nome, $emailFinal, $dados['papel'], $clienteId, $relatorioId, $ativo, $saltHex, $hashHex, $criadoEm, $atualizadoEm]);

      // Usuário novo: dispara o e-mail de boas-vindas com o link pra definir a senha
      // própria (a senha que o admin acabou de definir é só a inicial/temporária).
      if (!$existente) {
        enviarEmailRedefinicao($db, ['username' => $username, 'email' => $emailFinal, 'papel' => $dados['papel']], 'boas-vindas');
      }

      jsonResponse(['username' => $username, 'nome' => $nome, 'email' => $emailFinal, 'papel' => $dados['papel'], 'clienteId' => $clienteId, 'relatorioId' => $relatorioId, 'ativo' => (bool)$ativo, 'criadoEm' => $criadoEm]);
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
    // Importar, restaurar backup e ajustar configurações é trabalho da CM: cliente e "dashboard" só leem.
    if ($method === 'PUT' && $sessao['papel'] !== 'admin') jsonResponse(['message' => 'Somente a CM pode gravar os dados do relatório'], 403);

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

// ---------- blog e páginas de venda de infoprodutos (arquivo próprio) ----------
// (só carrega o arquivo do blog quando o endereço é dele: o resto da API não depende dele)
if (preg_match('~^/api/(posts?|admin/(posts?|post-preview|upload))$~', $path)) {
  require_once __DIR__ . '/blog_routes.php';
  blogRotas($path, $method, $db);
}

jsonResponse(['message' => 'Não encontrado'], 404);

// ---------- helpers de formatação ----------
function usuarioToJson(array $r): array {
  return ['username' => $r['username'], 'nome' => $r['nome'], 'email' => $r['email'] ?? null, 'papel' => $r['papel'], 'clienteId' => $r['cliente_id'], 'relatorioId' => $r['relatorio_id'], 'ativo' => (bool)$r['ativo'], 'criadoEm' => $r['criado_em']];
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
