<?php
/**
 * Segurança da plataforma do consultório:
 *  - sessão por cookie HttpOnly (só o hash do token fica no banco) + token CSRF em todo pedido que altera dados;
 *  - limite de tentativas (login, cadastro, redefinição de senha);
 *  - "acesso restrito": enquanto a plataforma está em desenvolvimento, só entra quem tem o cookie assinado que o painel
 *    administrativo emite (psi_adm). Para abrir ao público basta mudar o ajuste "acesso" para "aberto" (aba Consultório do painel);
 *  - teste grátis: depois do prazo a conta fica somente leitura (dá para ver e exportar os dados) até virar assinatura.
 */
declare(strict_types=1);

final class PsiSessao {
  public static ?array $usuario = null;
  public static ?array $conta = null;
  public static string $csrf = '';
}

/* ------------------------------------------------------------------ ajustes globais */
function psi_ajuste(string $chave, ?string $padrao = null): ?string {
  $s = psi_db()->prepare('SELECT valor FROM psi_ajustes WHERE chave = ?'); $s->execute([$chave]);
  $v = $s->fetchColumn();
  return $v === false ? $padrao : (string)$v;
}
function psi_definir_ajuste(string $chave, string $valor): void {
  psi_db()->prepare('INSERT INTO psi_ajustes (chave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)')->execute([$chave, $valor]);
}

/* ------------------------------------------------------------------ segredos e cookies */
/** Segredo derivado da configuração do servidor (nunca está no repositório nem no banco). */
function psi_segredo(string $uso): string {
  $c = cmConfig();
  return hash_hmac('sha256', 'psi|' . $uso, (string)($c['db_pass'] ?? '') . '|' . (string)($c['db_name'] ?? ''));
}
function psi_https(): bool {
  return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}
function psi_cookie(string $nome, string $valor, int $segundos): void {
  setcookie($nome, $valor, ['expires' => $segundos > 0 ? time() + $segundos : time() - 3600, 'path' => '/consultorio/', 'secure' => psi_https(), 'httponly' => true, 'samesite' => 'Lax']);
}

/* ------------------------------------------------------------------ acesso restrito (painel administrativo) */
function psi_adm_emitir(string $usuario): void {
  $p = rtrim(strtr(base64_encode(json_encode(['u' => $usuario, 'exp' => time() + 8 * 3600])), '+/', '-_'), '=');
  psi_cookie('psi_adm', $p . '.' . hash_hmac('sha256', $p, psi_segredo('adm')), 8 * 3600);
}
function psi_adm_valido(): ?string {
  $c = $_COOKIE['psi_adm'] ?? '';
  if (!is_string($c) || substr_count($c, '.') !== 1) return null;
  [$p, $sig] = explode('.', $c);
  if (!hash_equals(hash_hmac('sha256', $p, psi_segredo('adm')), $sig)) return null;
  $d = json_decode((string)base64_decode(strtr($p, '-_', '+/')), true);
  if (!is_array($d) || (int)($d['exp'] ?? 0) < time()) return null;
  return (string)($d['u'] ?? '');
}
/** Usuário e senha do painel administrativo (HTTP Basic, mesma tabela "usuarios" do site) → dados do admin ou null. */
function psi_basic_admin(): ?array {
  $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
  if ($h === '' && function_exists('apache_request_headers')) foreach (apache_request_headers() as $k => $v) if (strcasecmp((string)$k, 'Authorization') === 0) $h = (string)$v;
  if (stripos($h, 'Basic ') !== 0) return null;
  $dec = base64_decode(substr($h, 6), true);
  if ($dec === false || ($i = strpos($dec, ':')) === false) return null;
  $usuario = substr($dec, 0, $i); $senha = substr($dec, $i + 1);
  $ipChave = 'adm|' . ($_SERVER['REMOTE_ADDR'] ?? '');
  if (psi_limite_excedido('admin', $ipChave, 12, 900)) psi_erro('Muitas tentativas. Aguarde alguns minutos.', 429);
  $s = psi_db()->prepare('SELECT * FROM usuarios WHERE username = ? LIMIT 1'); $s->execute([$usuario]);
  $r = $s->fetch();
  $ok = $r && $r['ativo'] && $r['papel'] === 'admin' && hash_equals((string)$r['hash_hex'], bin2hex(hash_pbkdf2('sha256', $senha, (string)hex2bin((string)$r['salt_hex']), 100000, 32, true)));
  if (!$ok) { psi_registrar_tentativa('admin', $ipChave); return null; }
  return ['username' => $r['username'], 'nome' => $r['nome']];
}
function psi_acesso_aberto(): bool { return psi_ajuste('acesso', 'restrito') === 'aberto'; }
function psi_liberado(): bool { return psi_acesso_aberto() || psi_adm_valido() !== null; }
function psi_exigir_liberado(): void {
  if (!psi_liberado()) psi_erro('Plataforma em desenvolvimento: acesso restrito à equipe da CM.', 403, ['restrito' => true]);
}

/* ------------------------------------------------------------------ limite de tentativas */
function psi_limite_excedido(string $tipo, string $chave, int $max, int $janelaSeg): bool {
  $s = psi_db()->prepare('SELECT COUNT(*) FROM psi_tentativas WHERE chave = ? AND tipo = ? AND criado_em >= ?');
  $s->execute([hash('sha256', $chave), $tipo, gmdate('Y-m-d H:i:s', time() - $janelaSeg)]);
  return (int)$s->fetchColumn() >= $max;
}
function psi_registrar_tentativa(string $tipo, string $chave): void {
  psi_db()->prepare('INSERT INTO psi_tentativas (chave, tipo, criado_em) VALUES (?,?,?)')->execute([hash('sha256', $chave), $tipo, psi_agora()]);
}

/* ------------------------------------------------------------------ sessão do psicólogo */
function psi_sessao_criar(int $usuarioId, int $contaId): void {
  $token = bin2hex(random_bytes(32)); $csrf = bin2hex(random_bytes(16)); $agora = psi_agora();
  psi_db()->prepare('INSERT INTO psi_sessoes (token_hash, usuario_id, conta_id, csrf, criado_em, expira_em, ultimo_uso) VALUES (?,?,?,?,?,?,?)')
    ->execute([hash('sha256', $token), $usuarioId, $contaId, $csrf, $agora, gmdate('Y-m-d H:i:s', time() + 14 * 86400), $agora]);
  psi_cookie('psi_sess', $token, 14 * 86400);
  PsiSessao::$csrf = $csrf;
}
function psi_sessao_carregar(): bool {
  $token = $_COOKIE['psi_sess'] ?? '';
  if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/', $token)) return false;
  $db = psi_db(); $agora = psi_agora();
  $s = $db->prepare('SELECT s.*, u.nome AS u_nome, u.email AS u_email, u.papel AS u_papel, u.ativo AS u_ativo, u.email_verificado_em AS u_verif FROM psi_sessoes s JOIN psi_usuarios u ON u.id = s.usuario_id WHERE s.token_hash = ? AND s.expira_em > ?');
  $s->execute([hash('sha256', $token), $agora]);
  $r = $s->fetch();
  if (!$r || !$r['u_ativo']) return false;
  $c = $db->prepare('SELECT * FROM psi_contas WHERE id = ?'); $c->execute([$r['conta_id']]);
  $conta = $c->fetch();
  if (!$conta) return false;
  PsiSessao::$usuario = ['id' => (int)$r['usuario_id'], 'nome' => $r['u_nome'], 'email' => $r['u_email'], 'papel' => $r['u_papel'], 'verificado' => $r['u_verif'] !== null];
  PsiSessao::$conta = $conta;
  PsiSessao::$csrf = (string)$r['csrf'];
  if (strtotime($r['ultimo_uso'] . ' UTC') < time() - 3600) { // sessão deslizante: renova uma vez por hora
    $db->prepare('UPDATE psi_sessoes SET ultimo_uso = ?, expira_em = ? WHERE token_hash = ?')->execute([$agora, gmdate('Y-m-d H:i:s', time() + 14 * 86400), hash('sha256', $token)]);
    psi_cookie('psi_sess', $token, 14 * 86400);
    if (random_int(1, 20) === 1) { // faxina ocasional
      $db->prepare('DELETE FROM psi_sessoes WHERE expira_em < ?')->execute([$agora]);
      $db->prepare('DELETE FROM psi_tentativas WHERE criado_em < ?')->execute([gmdate('Y-m-d H:i:s', time() - 86400)]);
    }
  }
  return true;
}
function psi_sessao_encerrar(): void {
  $token = $_COOKIE['psi_sess'] ?? '';
  if (is_string($token) && preg_match('/^[a-f0-9]{64}$/', $token)) psi_db()->prepare('DELETE FROM psi_sessoes WHERE token_hash = ?')->execute([hash('sha256', $token)]);
  psi_cookie('psi_sess', '', 0);
  PsiSessao::$usuario = null; PsiSessao::$conta = null; PsiSessao::$csrf = '';
}
function psi_exigir_login(): void {
  if (!psi_sessao_carregar()) psi_erro('Faça login para continuar.', 401, ['login' => true]);
}
function psi_exigir_csrf(): void {
  $h = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
  if (PsiSessao::$csrf === '' || !hash_equals(PsiSessao::$csrf, $h)) psi_erro('Sua sessão mudou. Recarregue a página e tente de novo.', 403, ['csrf' => true]);
  $origem = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
  if ($origem !== '') {
    $hostOrigem = (string)parse_url($origem, PHP_URL_HOST); $porta = parse_url($origem, PHP_URL_PORT);
    $hostReq = (string)($_SERVER['HTTP_HOST'] ?? '');
    if (strcasecmp($hostOrigem . ($porta ? ':' . $porta : ''), $hostReq) !== 0) psi_erro('Origem não permitida.', 403);
  }
}

/* ------------------------------------------------------------------ teste grátis / plano */
/** Situação do plano da conta logada; marca como expirado quando o teste acaba. */
function psi_plano(): array {
  $c = PsiSessao::$conta; $plano = (string)$c['plano']; $dias = null;
  if ($plano === 'teste' && $c['trial_ate']) {
    $dias = (int)floor((strtotime($c['trial_ate'] . ' 23:59:59 ' . psi_fuso()->getName()) - time()) / 86400) + 1;
    if (psi_hoje() > $c['trial_ate']) {
      psi_db()->prepare("UPDATE psi_contas SET plano = 'expirado' WHERE id = ? AND plano = 'teste'")->execute([$c['id']]);
      PsiSessao::$conta['plano'] = $plano = 'expirado'; $dias = 0;
    }
  }
  return ['plano' => $plano, 'trialAte' => $c['trial_ate'], 'diasRestantes' => $dias, 'somenteLeitura' => in_array($plano, ['expirado', 'suspenso'], true)];
}
function psi_exigir_escrita(): void {
  $p = psi_plano();
  if ($p['somenteLeitura']) psi_erro($p['plano'] === 'suspenso' ? 'Esta conta está suspensa.' : 'Seu teste grátis terminou. Você ainda pode ver e exportar seus dados.', 402, ['assinatura' => true]);
}
