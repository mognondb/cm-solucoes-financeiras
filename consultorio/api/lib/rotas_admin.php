<?php
/** Rotas do painel administrativo da CM (HTTP Basic): estado da plataforma, abrir/restringir o acesso, contas e testes grátis. */
declare(strict_types=1);

function psi_exigir_admin(): array {
  $a = psi_basic_admin();
  if (!$a) psi_erro('Acesso negado.', 403);
  return $a;
}

function psi_registrar_rotas_admin(PsiRoteador $r): void {
  $r->add('GET', 'admin/resumo', function () {
    psi_exigir_admin(); $db = psi_db();
    $planos = $db->query("SELECT plano, COUNT(*) n FROM psi_contas GROUP BY plano")->fetchAll(PDO::FETCH_KEY_PAIR);
    return [
      'acesso' => psi_acesso_aberto() ? 'aberto' : 'restrito', 'trialDias' => (int)psi_ajuste('trial_dias', (string)PSI_TRIAL_DIAS_PADRAO),
      'contas' => ['total' => array_sum($planos), 'teste' => (int)($planos['teste'] ?? 0), 'ativo' => (int)($planos['ativo'] ?? 0), 'expirado' => (int)($planos['expirado'] ?? 0), 'suspenso' => (int)($planos['suspenso'] ?? 0)],
      'pacientes' => (int)$db->query("SELECT COUNT(*) FROM psi_pacientes WHERE status <> 'arquivado'")->fetchColumn(),
    ];
  }, 'admin');

  $r->add('POST', 'admin/acesso', function () {
    $a = psi_exigir_admin(); $d = psi_corpo();
    $novo = psi_opcao($d['acesso'] ?? null, ['aberto', 'restrito'], '');
    if ($novo === '') psi_erro('Valor inválido.', 422);
    psi_definir_ajuste('acesso', $novo);
    error_log('[consultorio] acesso alterado para ' . $novo . ' por ' . $a['username']);
    return ['ok' => true, 'acesso' => $novo];
  }, 'admin');

  $r->add('POST', 'admin/trial', function () {
    psi_exigir_admin(); $d = psi_corpo();
    psi_definir_ajuste('trial_dias', (string)psi_int($d['dias'] ?? null, 1, 365, 'dias do teste grátis', true));
    return ['ok' => true];
  }, 'admin');

  $r->add('GET', 'admin/contas', function () {
    psi_exigir_admin();
    $s = psi_db()->query("SELECT c.id, c.nome, c.plano, c.trial_ate, c.criado_em, u.email, u.ultimo_acesso,
        (SELECT COUNT(*) FROM psi_pacientes p WHERE p.conta_id = c.id AND p.status <> 'arquivado') AS pacientes,
        (SELECT COUNT(*) FROM psi_agendamentos a WHERE a.conta_id = c.id) AS agendamentos
      FROM psi_contas c LEFT JOIN psi_usuarios u ON u.conta_id = c.id AND u.papel = 'dono' ORDER BY c.criado_em DESC LIMIT 200");
    return ['itens' => $s->fetchAll()];
  }, 'admin');

  $r->add('POST', 'admin/contas/{id}', function ($p) {
    psi_exigir_admin(); $d = psi_corpo();
    $plano = psi_opcao($d['plano'] ?? null, ['teste', 'ativo', 'expirado', 'suspenso'], '');
    if ($plano === '') psi_erro('Plano inválido.', 422);
    psi_db()->prepare('UPDATE psi_contas SET plano = ?, trial_ate = COALESCE(?, trial_ate), atualizado_em = ? WHERE id = ?')->execute([$plano, psi_data($d['trialAte'] ?? null), psi_agora(), (int)$p['id']]);
    return ['ok' => true];
  }, 'admin');
}
