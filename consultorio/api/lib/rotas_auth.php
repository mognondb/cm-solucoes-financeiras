<?php
/** Rotas de acesso: estado da plataforma, cadastro (com teste grátis), login, sair, recuperação de senha e verificação de e-mail. */
declare(strict_types=1);

function psi_validar_senha($v): string {
  if (!is_string($v) || mb_strlen($v) < 8) psi_erro('A senha precisa ter pelo menos 8 caracteres.', 422);
  if (strlen($v) > 72) psi_erro('A senha pode ter no máximo 72 caracteres.', 422);
  return $v;
}

/** O que o aplicativo precisa saber logo depois de entrar. */
function psi_eu(): array {
  $c = PsiSessao::$conta; $u = PsiSessao::$usuario;
  $s = psi_db()->prepare('SELECT id, nome, crp, cor FROM psi_profissionais WHERE conta_id = ? AND ativo = 1 ORDER BY id'); $s->execute([$c['id']]);
  return [
    'logado' => true, 'csrf' => PsiSessao::$csrf,
    'usuario' => ['id' => $u['id'], 'nome' => $u['nome'], 'email' => $u['email'], 'papel' => $u['papel'], 'verificado' => $u['verificado']],
    'conta' => ['id' => (int)$c['id'], 'nome' => $c['nome'], 'documento' => $c['documento'], 'crp' => $c['crp'], 'telefone' => $c['telefone'], 'cidade' => $c['cidade'], 'uf' => $c['uf'], 'endereco' => $c['endereco'], 'fuso' => $c['fuso']],
    'plano' => psi_plano(), 'config' => psi_config(), 'profissionais' => array_map(fn($p) => ['id' => (int)$p['id'], 'nome' => $p['nome'], 'crp' => $p['crp'], 'cor' => $p['cor'], 'ativo' => true], $s->fetchAll()),
    'hoje' => psi_hoje(),
  ];
}

function psi_registrar_rotas_auth(PsiRoteador $r): void {
  /** Estado público: o aplicativo decide a primeira tela (acesso restrito, entrar ou cadastro). */
  $r->add('GET', 'estado', function () {
    return ['acesso' => psi_acesso_aberto() ? 'aberto' : 'restrito', 'liberado' => psi_liberado(), 'trialDias' => (int)psi_ajuste('trial_dias', (string)PSI_TRIAL_DIAS_PADRAO), 'termos' => PSI_VERSAO_TERMOS];
  }, 'livre');

  /** O painel administrativo chama isto (HTTP Basic) para receber o cookie que libera a plataforma enquanto ela está restrita. */
  $r->add('POST', 'restrito/entrar', function () {
    $a = psi_basic_admin();
    if (!$a) psi_erro('Acesso negado.', 403);
    psi_adm_emitir($a['username']);
    return ['ok' => true, 'usuario' => $a['username']];
  }, 'livre');

  $r->add('POST', 'auth/cadastro', function () {
    $d = psi_corpo(); $db = psi_db();
    $ip = 'cad|' . ($_SERVER['REMOTE_ADDR'] ?? '');
    if (psi_limite_excedido('cadastro', $ip, 8, 3600)) psi_erro('Muitos cadastros em pouco tempo. Tente de novo mais tarde.', 429);
    $nome = psi_txt($d['nome'] ?? null, 120, true, 'nome');
    $email = psi_email($d['email'] ?? null);
    $senha = psi_validar_senha($d['senha'] ?? null);
    $consultorio = psi_txt($d['consultorio'] ?? null, 120) ?? ('Consultório de ' . $nome);
    if (empty($d['aceite'])) psi_erro('Para criar a conta é preciso aceitar os termos de uso e a política de privacidade.', 422);
    psi_registrar_tentativa('cadastro', $ip);
    $ja = $db->prepare('SELECT 1 FROM psi_usuarios WHERE email = ?'); $ja->execute([$email]);
    if ($ja->fetchColumn()) psi_erro('Já existe uma conta com este e-mail. Entre ou recupere a senha.', 409);

    $agora = psi_agora(); $hoje = (new DateTimeImmutable('now', new DateTimeZone('America/Sao_Paulo')))->format('Y-m-d');
    $trial = (int)psi_ajuste('trial_dias', (string)PSI_TRIAL_DIAS_PADRAO);
    $db->beginTransaction();
    try {
      $db->prepare("INSERT INTO psi_contas (nome, plano, trial_ate, criado_em, atualizado_em) VALUES (?, 'teste', ?, ?, ?)")->execute([$consultorio, psi_somar_dias($hoje, $trial), $agora, $agora]);
      $contaId = (int)$db->lastInsertId();
      $db->prepare('INSERT INTO psi_usuarios (conta_id, nome, email, senha_hash, papel, termos_aceitos_em, termos_versao, ultimo_acesso, criado_em) VALUES (?,?,?,?,?,?,?,?,?)')
        ->execute([$contaId, $nome, $email, password_hash($senha, PASSWORD_DEFAULT), 'dono', $agora, PSI_VERSAO_TERMOS, $agora, $agora]);
      $usuarioId = (int)$db->lastInsertId();
      psi_semear_conta($db, $contaId, $nome, $hoje);
      $db->commit();
    } catch (Throwable $e) { if ($db->inTransaction()) $db->rollBack(); throw $e; }

    $c = $db->prepare('SELECT * FROM psi_contas WHERE id = ?'); $c->execute([$contaId]);
    PsiSessao::$conta = $c->fetch();
    PsiSessao::$usuario = ['id' => $usuarioId, 'nome' => $nome, 'email' => $email, 'papel' => 'dono', 'verificado' => false];
    psi_sessao_criar($usuarioId, $contaId);
    psi_auditar('conta_criada', 'conta', $contaId);
    $tok = psi_token_criar($usuarioId, 'verificar', 3 * 86400);
    psi_enviar_email($email, 'Confirme seu e-mail — Portal CLINCM', "Olá, " . explode(' ', $nome)[0] . "!\n\nBem-vindo(a) ao Portal CLINCM. Para confirmar que este e-mail é seu, use o botão abaixo. O link vale por 3 dias.", 'Confirmar meu e-mail', psi_url_base() . '#/verificar/' . $tok);
    return psi_eu();
  }, 'publica');

  $r->add('POST', 'auth/entrar', function () {
    $d = psi_corpo(); $db = psi_db();
    $email = mb_strtolower((string)psi_txt($d['email'] ?? null, 160, true, 'e-mail'));
    $senha = (string)($d['senha'] ?? '');
    $chaveEmail = 'login|' . $email; $chaveIp = 'login|' . ($_SERVER['REMOTE_ADDR'] ?? '');
    if (psi_limite_excedido('login', $chaveEmail, 8, 900) || psi_limite_excedido('login', $chaveIp, 30, 900)) psi_erro('Muitas tentativas. Aguarde alguns minutos e tente de novo.', 429);
    $s = $db->prepare('SELECT * FROM psi_usuarios WHERE email = ? AND ativo = 1'); $s->execute([$email]);
    $u = $s->fetch();
    // mesma resposta e mesmo custo de tempo para "e-mail não existe" e "senha errada"
    $ok = password_verify($senha, $u ? $u['senha_hash'] : '$2y$10$.K5Zu2iwxoJRGBXcmTw/Zex7UGxyfJid2VV8DHCjmxSuoayhUbiGC');
    if (!$u || !$ok) { psi_registrar_tentativa('login', $chaveEmail); psi_registrar_tentativa('login', $chaveIp); psi_erro('E-mail ou senha incorretos.', 401); }
    if (password_needs_rehash($u['senha_hash'], PASSWORD_DEFAULT)) $db->prepare('UPDATE psi_usuarios SET senha_hash = ? WHERE id = ?')->execute([password_hash($senha, PASSWORD_DEFAULT), $u['id']]);
    $db->prepare('UPDATE psi_usuarios SET ultimo_acesso = ? WHERE id = ?')->execute([psi_agora(), $u['id']]);
    $c = $db->prepare('SELECT * FROM psi_contas WHERE id = ?'); $c->execute([$u['conta_id']]);
    PsiSessao::$conta = $c->fetch();
    PsiSessao::$usuario = ['id' => (int)$u['id'], 'nome' => $u['nome'], 'email' => $u['email'], 'papel' => $u['papel'], 'verificado' => $u['email_verificado_em'] !== null];
    psi_sessao_criar((int)$u['id'], (int)$u['conta_id']);
    return psi_eu();
  }, 'publica');

  /** Quem sou eu: o aplicativo chama ao abrir. Sem sessão, responde logado=false (não é erro). */
  $r->add('GET', 'auth/eu', function () {
    if (!psi_sessao_carregar()) return ['logado' => false];
    return psi_eu();
  }, 'publica');

  $r->add('POST', 'auth/sair', function () {
    psi_sessao_encerrar();
    return ['ok' => true];
  }, 'login_sempre');

  $r->add('POST', 'auth/esqueci', function () {
    $d = psi_corpo(); $db = psi_db();
    $email = mb_strtolower((string)psi_txt($d['email'] ?? null, 160, true, 'e-mail'));
    $ip = 'esq|' . ($_SERVER['REMOTE_ADDR'] ?? '');
    if (psi_limite_excedido('esqueci', $ip, 8, 3600) || psi_limite_excedido('esqueci', 'esq|' . $email, 3, 3600)) psi_erro('Muitos pedidos em pouco tempo. Tente de novo mais tarde.', 429);
    psi_registrar_tentativa('esqueci', $ip); psi_registrar_tentativa('esqueci', 'esq|' . $email);
    $s = $db->prepare('SELECT id, nome FROM psi_usuarios WHERE email = ? AND ativo = 1'); $s->execute([$email]);
    if ($u = $s->fetch()) {
      $tok = psi_token_criar((int)$u['id'], 'redefinir', 3600);
      psi_enviar_email($email, 'Redefinir senha — Portal CLINCM', "Olá, " . explode(' ', (string)$u['nome'])[0] . "!\n\nRecebemos um pedido para redefinir a senha da sua conta. Use o botão abaixo para escolher uma nova senha. O link vale por 1 hora e só funciona uma vez.\n\nSe não foi você, ignore este e-mail: nada foi alterado.", 'Escolher nova senha', psi_url_base() . '#/redefinir/' . $tok);
    }
    return ['ok' => true, 'message' => 'Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.']; // mesma resposta exista ou não
  }, 'publica');

  $r->add('POST', 'auth/redefinir', function () {
    $d = psi_corpo(); $db = psi_db();
    $senha = psi_validar_senha($d['senha'] ?? null);
    $uid = psi_token_consumir((string)($d['token'] ?? ''), 'redefinir');
    if (!$uid) psi_erro('Este link expirou ou já foi usado. Peça um novo.', 400);
    $db->prepare('UPDATE psi_usuarios SET senha_hash = ? WHERE id = ?')->execute([password_hash($senha, PASSWORD_DEFAULT), $uid]);
    $db->prepare('DELETE FROM psi_sessoes WHERE usuario_id = ?')->execute([$uid]); // quem estava logado com a senha antiga é desconectado
    return ['ok' => true];
  }, 'publica');

  $r->add('POST', 'auth/verificar', function () {
    $d = psi_corpo();
    $uid = psi_token_consumir((string)($d['token'] ?? ''), 'verificar');
    if (!$uid) psi_erro('Este link expirou ou já foi usado.', 400);
    psi_db()->prepare('UPDATE psi_usuarios SET email_verificado_em = ? WHERE id = ?')->execute([psi_agora(), $uid]);
    return ['ok' => true];
  }, 'publica');

  $r->add('POST', 'auth/reenviar-verificacao', function () {
    $u = PsiSessao::$usuario;
    if ($u['verificado']) return ['ok' => true];
    if (psi_limite_excedido('verificar', 'ver|' . $u['id'], 3, 3600)) psi_erro('Aguarde um pouco antes de pedir de novo.', 429);
    psi_registrar_tentativa('verificar', 'ver|' . $u['id']);
    $tok = psi_token_criar((int)$u['id'], 'verificar', 3 * 86400);
    psi_enviar_email($u['email'], 'Confirme seu e-mail — Portal CLINCM', "Para confirmar que este e-mail é seu, use o botão abaixo. O link vale por 3 dias.", 'Confirmar meu e-mail', psi_url_base() . '#/verificar/' . $tok);
    return ['ok' => true];
  }, 'login_sempre');

  $r->add('POST', 'auth/senha', function () {
    $d = psi_corpo(); $db = psi_db(); $u = PsiSessao::$usuario;
    $nova = psi_validar_senha($d['nova'] ?? null);
    $s = $db->prepare('SELECT senha_hash FROM psi_usuarios WHERE id = ?'); $s->execute([$u['id']]);
    if (!password_verify((string)($d['atual'] ?? ''), (string)$s->fetchColumn())) psi_erro('A senha atual está incorreta.', 422);
    $db->prepare('UPDATE psi_usuarios SET senha_hash = ? WHERE id = ?')->execute([password_hash($nova, PASSWORD_DEFAULT), $u['id']]);
    psi_auditar('senha_alterada', 'usuario', $u['id']);
    return ['ok' => true];
  }, 'login_sempre');
}
