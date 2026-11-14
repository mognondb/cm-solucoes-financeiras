<?php
/** E-mails da plataforma (verificação de e-mail e redefinição de senha). Texto + HTML; nada que veio do usuário entra nos cabeçalhos. */
declare(strict_types=1);

/** Endereço público da plataforma. Só aceita o próprio domínio (ou localhost, nos testes): o cabeçalho Host não pode virar link de e-mail. */
function psi_url_base(): string {
  $host = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));
  $ok = in_array($host, ['cmfinanceiro.com', 'www.cmfinanceiro.com'], true) || preg_match('/^(localhost|127\.0\.0\.1)(:\d+)?$/', $host);
  return ($ok ? (psi_https() ? 'https://' : 'http://') . $host : 'https://cmfinanceiro.com') . '/consultorio/';
}

function psi_enviar_email(string $para, string $assunto, string $texto, string $botaoRotulo = '', string $botaoLink = ''): bool {
  try {
    $para = (string)filter_var(trim($para), FILTER_VALIDATE_EMAIL);
    if ($para === '') return false;
    $h = fn($v) => htmlspecialchars((string)$v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $paragrafos = array_map(fn($p) => '<p style="margin:0 0 14px;font-size:15px;line-height:1.6">' . nl2br($h($p)) . '</p>', preg_split('/\n{2,}/', trim($texto)));
    $html = '<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f8f6f1;font-family:Arial,Helvetica,sans-serif;color:#2e2e2e">'
      . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">'
      . '<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border:1px solid #ebe6dc;border-radius:14px">'
      . '<tr><td style="padding:20px 28px;border-bottom:1px solid #ebe6dc;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;color:#8f6d38">CM Consultório</td></tr>'
      . '<tr><td style="padding:24px 28px 8px">' . implode('', $paragrafos) . '</td></tr>'
      . ($botaoLink !== '' ? '<tr><td style="padding:4px 28px 24px"><a href="' . $h($botaoLink) . '" style="display:inline-block;background:#b18a52;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:999px">' . $h($botaoRotulo) . '</a></td></tr>' : '')
      . '<tr><td style="padding:16px 28px;border-top:1px solid #ebe6dc;font-size:12px;line-height:1.5;color:#6b6b63">CM Soluções Financeiras · É um e-mail automático, não precisa responder.</td></tr>'
      . '</table></td></tr></table></body></html>';
    $textoFinal = $texto . ($botaoLink !== '' ? "\n\n$botaoRotulo: $botaoLink" : '') . "\n\n--\nCM Soluções Financeiras · e-mail automático, não precisa responder.";
    $b = 'cm_alt_' . bin2hex(random_bytes(8));
    $enc = fn($v) => '=?UTF-8?B?' . base64_encode($v) . '?=';
    $cab = "From: {$enc('CM Consultório')} <nao-responda@cmfinanceiro.com>\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary=\"$b\"";
    $corpo = "--$b\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($textoFinal)) . "\r\n"
      . "--$b\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($html)) . "\r\n--$b--\r\n";
    return (bool)@mail($para, $enc($assunto), $corpo, $cab);
  } catch (Throwable $e) { return false; }
}

/** Gera um token de uso único (guarda só o hash) e devolve o token puro, para ir no link do e-mail. */
function psi_token_criar(int $usuarioId, string $tipo, int $validadeSeg): string {
  $token = bin2hex(random_bytes(32));
  psi_db()->prepare("UPDATE psi_tokens SET usado_em = ? WHERE usuario_id = ? AND tipo = ? AND usado_em IS NULL")->execute([psi_agora(), $usuarioId, $tipo]);
  psi_db()->prepare('INSERT INTO psi_tokens (usuario_id, tipo, token_hash, expira_em, criado_em) VALUES (?,?,?,?,?)')
    ->execute([$usuarioId, $tipo, hash('sha256', $token), gmdate('Y-m-d H:i:s', time() + $validadeSeg), psi_agora()]);
  return $token;
}
/** Confere e consome um token. Devolve o id do usuário ou null. */
function psi_token_consumir(string $token, string $tipo): ?int {
  if (!preg_match('/^[a-f0-9]{64}$/', $token)) return null;
  $db = psi_db();
  $s = $db->prepare('SELECT id, usuario_id FROM psi_tokens WHERE token_hash = ? AND tipo = ? AND usado_em IS NULL AND expira_em > ?');
  $s->execute([hash('sha256', $token), $tipo, psi_agora()]);
  $r = $s->fetch();
  if (!$r) return null;
  $u = $db->prepare('UPDATE psi_tokens SET usado_em = ? WHERE id = ? AND usado_em IS NULL'); $u->execute([psi_agora(), $r['id']]);
  return $u->rowCount() === 1 ? (int)$r['usuario_id'] : null;
}
