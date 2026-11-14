<?php
/** Rotas da conta: dados do consultório, preferências, profissionais, categorias e tipos de atendimento. */
declare(strict_types=1);

function psi_registrar_rotas_conta(PsiRoteador $r): void {
  $r->add('GET', 'conta', fn() => psi_eu());

  $r->add('PUT', 'conta', function () {
    $d = psi_corpo(); $db = psi_db();
    $uf = psi_txt($d['uf'] ?? null, 2); if ($uf !== null && !preg_match('/^[A-Za-z]{2}$/', $uf)) psi_erro('UF inválida.', 422);
    $db->prepare('UPDATE psi_contas SET nome = ?, documento = ?, crp = ?, telefone = ?, cidade = ?, uf = ?, endereco = ?, atualizado_em = ? WHERE id = ?')->execute([
      psi_txt($d['nome'] ?? null, 120, true, 'nome do consultório'), psi_cpf($d['documento'] ?? null), psi_txt($d['crp'] ?? null, 30), psi_txt($d['telefone'] ?? null, 30),
      psi_txt($d['cidade'] ?? null, 80), $uf === null ? null : strtoupper($uf), psi_txt($d['endereco'] ?? null, 160), psi_agora(), psi_conta_id(),
    ]);
    $c = $db->prepare('SELECT * FROM psi_contas WHERE id = ?'); $c->execute([psi_conta_id()]); PsiSessao::$conta = $c->fetch();
    return psi_eu();
  });

  $r->add('PUT', 'conta/config', function () {
    $d = psi_corpo(); $atual = psi_config(); $novo = $atual;
    if (isset($d['duracao_padrao'])) $novo['duracao_padrao'] = psi_int($d['duracao_padrao'], 10, 480, 'duração padrão');
    if (isset($d['hora_ini'])) $novo['hora_ini'] = psi_int($d['hora_ini'], 0, 22, 'hora inicial');
    if (isset($d['hora_fim'])) $novo['hora_fim'] = psi_int($d['hora_fim'], 1, 24, 'hora final');
    if ($novo['hora_fim'] <= $novo['hora_ini']) psi_erro('A hora final precisa ser depois da inicial.', 422);
    if (isset($d['dias_semana'])) {
      $dias = array_values(array_unique(array_map('intval', (array)$d['dias_semana'])));
      foreach ($dias as $x) if ($x < 0 || $x > 6) psi_erro('Dia da semana inválido.', 422);
      sort($dias); $novo['dias_semana'] = $dias ?: [1, 2, 3, 4, 5];
    }
    if (isset($d['cobrar_falta'])) $novo['cobrar_falta'] = (bool)psi_bool($d['cobrar_falta']);
    if (isset($d['falta_percentual'])) $novo['falta_percentual'] = psi_int($d['falta_percentual'], 0, 100, 'percentual da falta');
    if (isset($d['prazo_padrao_dias'])) $novo['prazo_padrao_dias'] = psi_int($d['prazo_padrao_dias'], 0, 365, 'prazo padrão');
    foreach (['msg_cobranca', 'msg_confirmacao'] as $k) if (isset($d[$k])) $novo[$k] = psi_txt($d[$k], 600, true, 'mensagem');
    psi_db()->prepare('UPDATE psi_contas SET config_json = ?, atualizado_em = ? WHERE id = ?')->execute([json_encode($novo, JSON_UNESCAPED_UNICODE), psi_agora(), psi_conta_id()]);
    PsiSessao::$conta['config_json'] = json_encode($novo, JSON_UNESCAPED_UNICODE);
    return psi_eu();
  });

  /* ---- seus dados (LGPD): exportar tudo e excluir a conta. Funcionam mesmo com o teste encerrado. ---- */
  $r->add('GET', 'conta/exportar', function () {
    $c = psi_conta_id(); $db = psi_db(); $conta = PsiSessao::$conta;
    /* cada tabela com as colunas que fazem sentido para o usuário (sem segredos, sem ids internos de sessão) */
    $tabelas = ['profissionais' => 'psi_profissionais', 'categorias' => 'psi_categorias', 'servicos' => 'psi_servicos', 'contas_financeiras' => 'psi_contas_fin', 'pacientes' => 'psi_pacientes', 'series_de_sessoes' => 'psi_series',
      'agendamentos' => 'psi_agendamentos', 'lancamentos' => 'psi_lancamentos', 'pagamentos' => 'psi_baixas', 'cobrancas_feitas' => 'psi_cobrancas', 'transferencias' => 'psi_transferencias', 'despesas_fixas' => 'psi_recorrentes',
      'extratos' => 'psi_extratos', 'linhas_de_extrato' => 'psi_extrato_itens', 'recibos' => 'psi_recibos'];
    $saida = ['exportado_em' => gmdate('c'), 'aviso' => 'Dados do CM Consultório. Valores em centavos. Datas e horas da agenda no horário local do consultório.',
      'consultorio' => ['nome' => $conta['nome'], 'documento' => $conta['documento'] ?? null, 'crp' => $conta['crp'] ?? null, 'telefone' => $conta['telefone'] ?? null, 'cidade' => $conta['cidade'] ?? null, 'uf' => $conta['uf'] ?? null, 'endereco' => $conta['endereco'] ?? null, 'configuracoes' => psi_config()],
      'usuario' => ['nome' => PsiSessao::$usuario['nome'], 'email' => PsiSessao::$usuario['email']]];
    foreach ($tabelas as $nome => $tab) { $s = $db->prepare("SELECT * FROM $tab WHERE conta_id = ?"); $s->execute([$c]); $linhas = $s->fetchAll(); foreach ($linhas as &$l) unset($l['conta_id']); unset($l); $saida[$nome] = $linhas; }
    psi_auditar('exportar', 'conta', $c);
    header('Content-Disposition: attachment; filename="cm-consultorio-dados-' . gmdate('Y-m-d') . '.json"');
    return $saida;
  }, 'login_sempre');

  /* Exclusão definitiva: exige a senha e a palavra EXCLUIR. Apaga tudo da conta (pacientes, agenda, financeiro, extratos, recibos) e encerra a sessão. */
  $r->add('POST', 'conta/excluir', function () {
    $d = psi_corpo(); $db = psi_db(); $u = PsiSessao::$usuario; $c = psi_conta_id(); $chave = 'ex|' . $u['id'];
    if (psi_limite_excedido('excluir', $chave, 5, 900)) psi_erro('Muitas tentativas. Aguarde alguns minutos e tente de novo.', 429);
    if (trim((string)($d['confirmacao'] ?? '')) !== 'EXCLUIR') psi_erro('Digite EXCLUIR para confirmar.', 422);
    $s = $db->prepare('SELECT senha_hash FROM psi_usuarios WHERE id = ?'); $s->execute([$u['id']]);
    if (!password_verify((string)($d['senha'] ?? ''), (string)$s->fetchColumn())) { psi_registrar_tentativa('excluir', $chave); psi_erro('Senha incorreta.', 422); }
    $db->beginTransaction();
    try {
      $db->prepare('DELETE FROM psi_tokens WHERE usuario_id IN (SELECT id FROM (SELECT id FROM psi_usuarios WHERE conta_id = ?) x)')->execute([$c]);   // antes dos usuários
      foreach (PSI_TABELAS_DA_CONTA as $tab) $db->prepare("DELETE FROM $tab WHERE conta_id = ?")->execute([$c]);
      $db->prepare('DELETE FROM psi_contas WHERE id = ?')->execute([$c]);
      $db->commit();
    } catch (Throwable $e) { if ($db->inTransaction()) $db->rollBack(); throw $e; }
    error_log('[consultorio] conta excluida pelo proprio usuario: conta ' . $c);   // sem dados pessoais
    psi_sessao_encerrar();
    return ['ok' => true];
  }, 'login_sempre');

  /* ---- profissionais (uma ou duas pessoas atendendo no mesmo consultório) ---- */
  $r->add('GET', 'profissionais', function () {
    $s = psi_db()->prepare('SELECT id, nome, crp, cor, ativo FROM psi_profissionais WHERE conta_id = ? ORDER BY id'); $s->execute([psi_conta_id()]);
    return ['itens' => array_map(fn($p) => ['id' => (int)$p['id'], 'nome' => $p['nome'], 'crp' => $p['crp'], 'cor' => $p['cor'], 'ativo' => (bool)$p['ativo']], $s->fetchAll())];
  });
  $r->add('POST', 'profissionais', function () {
    $d = psi_corpo(); $cor = psi_txt($d['cor'] ?? null, 7); if ($cor !== null && !preg_match('/^#[0-9a-fA-F]{6}$/', $cor)) psi_erro('Cor inválida.', 422);
    psi_db()->prepare('INSERT INTO psi_profissionais (conta_id, nome, crp, cor, criado_em) VALUES (?,?,?,?,?)')->execute([psi_conta_id(), psi_txt($d['nome'] ?? null, 120, true, 'nome'), psi_txt($d['crp'] ?? null, 30), $cor ?? '#b18a52', psi_agora()]);
    return ['id' => (int)psi_db()->lastInsertId()];
  });
  $r->add('PUT', 'profissionais/{id}', function ($p) {
    $d = psi_corpo(); $cor = psi_txt($d['cor'] ?? null, 7); if ($cor !== null && !preg_match('/^#[0-9a-fA-F]{6}$/', $cor)) psi_erro('Cor inválida.', 422);
    $s = psi_db()->prepare('UPDATE psi_profissionais SET nome = ?, crp = ?, cor = COALESCE(?, cor), ativo = ? WHERE id = ? AND conta_id = ?');
    $s->execute([psi_txt($d['nome'] ?? null, 120, true, 'nome'), psi_txt($d['crp'] ?? null, 30), $cor, psi_bool($d['ativo'] ?? true), (int)$p['id'], psi_conta_id()]);
    return ['ok' => true];
  });

  /* ---- categorias ---- */
  $r->add('GET', 'categorias', function () {
    $s = psi_db()->prepare('SELECT id, tipo, nome, grupo, dedutivel, descricao, ativo FROM psi_categorias WHERE conta_id = ? ORDER BY tipo, ordem, nome'); $s->execute([psi_conta_id()]);
    return ['itens' => array_map(fn($c) => ['id' => (int)$c['id'], 'tipo' => $c['tipo'], 'nome' => $c['nome'], 'grupo' => $c['grupo'], 'dedutivel' => (bool)$c['dedutivel'], 'descricao' => $c['descricao'], 'ativo' => (bool)$c['ativo']], $s->fetchAll())];
  });
  $r->add('POST', 'categorias', function () {
    $d = psi_corpo(); $tipo = psi_opcao($d['tipo'] ?? null, ['receita', 'despesa'], ''); if ($tipo === '') psi_erro('Informe o tipo da categoria.', 422);
    $grupo = $tipo === 'receita' ? 'receita' : psi_opcao($d['grupo'] ?? null, ['fixa', 'variavel'], 'variavel');
    try {
      psi_db()->prepare('INSERT INTO psi_categorias (conta_id, tipo, nome, grupo, dedutivel, descricao, ordem) VALUES (?,?,?,?,?,?,999)')
        ->execute([psi_conta_id(), $tipo, psi_txt($d['nome'] ?? null, 80, true, 'nome'), $grupo, psi_bool($d['dedutivel'] ?? false), psi_txt($d['descricao'] ?? null, 200)]);
    } catch (PDOException $e) { if ($e->getCode() === '23000') psi_erro('Já existe uma categoria com esse nome.', 409); throw $e; }
    return ['id' => (int)psi_db()->lastInsertId()];
  });
  $r->add('PUT', 'categorias/{id}', function ($p) {
    $d = psi_corpo();
    try {
      $s = psi_db()->prepare('UPDATE psi_categorias SET nome = ?, grupo = IF(tipo = \'receita\', \'receita\', ?), dedutivel = ?, descricao = ?, ativo = ? WHERE id = ? AND conta_id = ?');
      $s->execute([psi_txt($d['nome'] ?? null, 80, true, 'nome'), psi_opcao($d['grupo'] ?? null, ['fixa', 'variavel'], 'variavel'), psi_bool($d['dedutivel'] ?? false), psi_txt($d['descricao'] ?? null, 200), psi_bool($d['ativo'] ?? true), (int)$p['id'], psi_conta_id()]);
    } catch (PDOException $e) { if ($e->getCode() === '23000') psi_erro('Já existe uma categoria com esse nome.', 409); throw $e; }
    return ['ok' => true];
  });

  /* ---- tipos de atendimento ---- */
  $r->add('GET', 'servicos', function () {
    $s = psi_db()->prepare('SELECT id, nome, duracao_min, valor, categoria_id, ativo FROM psi_servicos WHERE conta_id = ? ORDER BY ordem, nome'); $s->execute([psi_conta_id()]);
    return ['itens' => array_map(fn($x) => ['id' => (int)$x['id'], 'nome' => $x['nome'], 'duracaoMin' => (int)$x['duracao_min'], 'valor' => (int)$x['valor'], 'categoriaId' => $x['categoria_id'] === null ? null : (int)$x['categoria_id'], 'ativo' => (bool)$x['ativo']], $s->fetchAll())];
  });
  $r->add('POST', 'servicos', function () {
    $d = psi_corpo();
    psi_db()->prepare('INSERT INTO psi_servicos (conta_id, nome, duracao_min, valor, categoria_id, ordem) VALUES (?,?,?,?,?,999)')->execute([
      psi_conta_id(), psi_txt($d['nome'] ?? null, 80, true, 'nome'), psi_int($d['duracaoMin'] ?? 50, 10, 480, 'duração'), psi_cent($d['valor'] ?? 0, 'valor', false, true), psi_categoria_id($d['categoriaId'] ?? null, 'receita'),
    ]);
    return ['id' => (int)psi_db()->lastInsertId()];
  });
  $r->add('PUT', 'servicos/{id}', function ($p) {
    $d = psi_corpo();
    psi_db()->prepare('UPDATE psi_servicos SET nome = ?, duracao_min = ?, valor = ?, categoria_id = ?, ativo = ? WHERE id = ? AND conta_id = ?')->execute([
      psi_txt($d['nome'] ?? null, 80, true, 'nome'), psi_int($d['duracaoMin'] ?? 50, 10, 480, 'duração'), psi_cent($d['valor'] ?? 0, 'valor', false, true), psi_categoria_id($d['categoriaId'] ?? null, 'receita'), psi_bool($d['ativo'] ?? true), (int)$p['id'], psi_conta_id(),
    ]);
    return ['ok' => true];
  });
}

/** Confere que a categoria é da conta e do tipo esperado; devolve o id ou null. */
function psi_categoria_id($v, string $tipo): ?int {
  $id = psi_int($v, 1, null, 'categoria');
  if ($id === null) return null;
  $s = psi_db()->prepare('SELECT 1 FROM psi_categorias WHERE id = ? AND conta_id = ? AND tipo = ?'); $s->execute([$id, psi_conta_id(), $tipo]);
  if (!$s->fetchColumn()) psi_erro('Categoria inválida.', 422);
  return $id;
}
/** Confere que o registro é da conta (nunca confie em um id vindo do navegador). */
function psi_da_conta(string $tabela, $id, string $rotulo, bool $obrig = false): ?int {
  $n = psi_int($id, 1, null, $rotulo, $obrig);
  if ($n === null) return null;
  if (!in_array($tabela, ['psi_pacientes', 'psi_profissionais', 'psi_servicos', 'psi_contas_fin', 'psi_lancamentos', 'psi_agendamentos', 'psi_series'], true)) throw new LogicException('tabela inválida');
  $s = psi_db()->prepare("SELECT 1 FROM $tabela WHERE id = ? AND conta_id = ?"); $s->execute([$n, psi_conta_id()]);
  if (!$s->fetchColumn()) psi_erro("$rotulo não encontrado.", 422);
  return $n;
}
