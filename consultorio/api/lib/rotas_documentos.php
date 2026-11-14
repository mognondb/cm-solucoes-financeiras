<?php
/**
 * Documentos: recibos (numerados, com os dados do emitente guardados no momento da emissão) e relatórios (resultado do mês e apoio ao carnê-leão).
 * O PDF do recibo é montado no navegador a partir do que está salvo aqui. Os relatórios usam regime de caixa: contam o que foi recebido e pago no mês.
 */
declare(strict_types=1);

function psi_recibo_json(array $r): array {
  return ['id' => (int)$r['id'], 'numero' => (int)$r['numero'], 'pacienteId' => $r['paciente_id'] === null ? null : (int)$r['paciente_id'], 'pagadorNome' => $r['pagador_nome'], 'pagadorCpf' => $r['pagador_cpf'],
    'valor' => (int)$r['valor'], 'data' => $r['data'], 'referencia' => $r['referencia'], 'forma' => $r['forma'], 'emitenteNome' => $r['emitente_nome'], 'emitenteCrp' => $r['emitente_crp'], 'emitenteDoc' => $r['emitente_doc'],
    'consultorio' => $r['consultorio'], 'local' => $r['local'], 'cancelado' => (bool)$r['cancelado'], 'canceladoMotivo' => $r['cancelado_motivo'], 'criadoEm' => $r['criado_em']];
}

/** Pagamentos (baixas) de cobranças a receber de um paciente que ainda não têm recibo ativo. */
function psi_baixas_sem_recibo(int $pacienteId): array {
  $c = psi_conta_id();
  $s = psi_db()->prepare("SELECT b.id, b.data, b.valor, b.forma, l.descricao FROM psi_baixas b JOIN psi_lancamentos l ON l.id = b.lancamento_id LEFT JOIN psi_recibo_baixas rb ON rb.baixa_id = b.id
    WHERE b.conta_id = ? AND l.tipo = 'receber' AND l.paciente_id = ? AND rb.baixa_id IS NULL ORDER BY b.data DESC, b.id DESC LIMIT 200"); $s->execute([$c, $pacienteId]);
  return array_map(fn($x) => ['baixaId' => (int)$x['id'], 'data' => $x['data'], 'valor' => (int)$x['valor'], 'forma' => $x['forma'], 'descricao' => $x['descricao']], $s->fetchAll());
}

/** Resultado por categoria no período (regime de caixa): receitas recebidas e despesas pagas. */
function psi_somas_por_categoria(string $tipo, string $ini, string $fim): array {
  $s = psi_db()->prepare("SELECT l.categoria_id, COALESCE(c.nome, 'Sem categoria') AS nome, COALESCE(c.grupo, 'variavel') AS grupo, COALESCE(c.dedutivel, 0) AS dedutivel, SUM(b.valor) AS v
    FROM psi_baixas b JOIN psi_lancamentos l ON l.id = b.lancamento_id LEFT JOIN psi_categorias c ON c.id = l.categoria_id AND c.conta_id = l.conta_id
    WHERE b.conta_id = ? AND l.tipo = ? AND b.data >= ? AND b.data <= ? GROUP BY l.categoria_id, c.nome, c.grupo, c.dedutivel ORDER BY v DESC"); $s->execute([psi_conta_id(), $tipo, $ini, $fim]);
  return array_map(fn($x) => ['categoriaId' => $x['categoria_id'] === null ? null : (int)$x['categoria_id'], 'nome' => $x['nome'], 'grupo' => $x['grupo'], 'dedutivel' => (bool)$x['dedutivel'], 'valor' => (int)$x['v']], $s->fetchAll());
}
function psi_intervalo_mes(string $m): array {
  if (!preg_match('/^(\d{4})-(0[1-9]|1[0-2])$/', $m)) psi_erro('Mês inválido.', 422);
  return [$m . '-01', psi_data_no_mes((int)substr($m, 0, 4), (int)substr($m, 5, 2), 31)];
}

function psi_registrar_rotas_documentos(PsiRoteador $r): void {
  /* ================= recibos ================= */
  $r->add('GET', 'recibos/pendentes', function () {
    $pac = psi_da_conta('psi_pacientes', $_GET['paciente'] ?? null, 'Paciente', true);
    return ['itens' => psi_baixas_sem_recibo($pac)];
  });

  $r->add('GET', 'recibos', function () {
    $c = psi_conta_id(); $onde = ['conta_id = ?']; $par = [$c];
    if (($pac = psi_int($_GET['paciente'] ?? null, 1, null, 'paciente')) !== null) { $onde[] = 'paciente_id = ?'; $par[] = $pac; }
    if (($de = psi_data($_GET['de'] ?? null, false, 'de')) !== null) { $onde[] = 'data >= ?'; $par[] = $de; } if (($ate = psi_data($_GET['ate'] ?? null, false, 'até')) !== null) { $onde[] = 'data <= ?'; $par[] = $ate; }
    $s = psi_db()->prepare('SELECT * FROM psi_recibos WHERE ' . implode(' AND ', $onde) . ' ORDER BY numero DESC LIMIT 300'); $s->execute($par);
    return ['itens' => array_map('psi_recibo_json', $s->fetchAll())];
  });
  $r->add('GET', 'recibos/{id}', function ($p) {
    $id = psi_int($p['id'], 1, null, 'recibo', true); $s = psi_db()->prepare('SELECT * FROM psi_recibos WHERE id = ? AND conta_id = ?'); $s->execute([$id, psi_conta_id()]); $x = $s->fetch();
    if (!$x) psi_erro('Recibo não encontrado.', 404);
    return ['item' => psi_recibo_json($x)];
  });

  /* Emite um recibo dos pagamentos escolhidos (ou avulso, com valor e referência). Numeração sequencial por consultório, sem buracos nem repetição. */
  $r->add('POST', 'recibos', function () {
    $d = psi_corpo(); $db = psi_db(); $c = psi_conta_id(); $conta = PsiSessao::$conta;
    $pacId = psi_da_conta('psi_pacientes', $d['pacienteId'] ?? null, 'Paciente'); $pac = null;
    if ($pacId !== null) { $q = $db->prepare('SELECT * FROM psi_pacientes WHERE id = ? AND conta_id = ?'); $q->execute([$pacId, $c]); $pac = $q->fetch(); }
    $baixaIds = array_values(array_unique(array_map('intval', is_array($d['baixaIds'] ?? null) ? $d['baixaIds'] : []))); $valor = 0; $data = null; $forma = null; $refs = [];
    if ($baixaIds) {
      if ($pac === null) psi_erro('Escolha o paciente dos pagamentos.', 422); if (count($baixaIds) > 100) psi_erro('Muitos pagamentos em um só recibo (máximo de 100).', 422);
      $q = $db->prepare('SELECT b.id, b.data, b.valor, b.forma, l.paciente_id, l.tipo, l.competencia, rb.baixa_id AS ja FROM psi_baixas b JOIN psi_lancamentos l ON l.id = b.lancamento_id LEFT JOIN psi_recibo_baixas rb ON rb.baixa_id = b.id
        WHERE b.conta_id = ? AND b.id IN (' . psi_marcadores($baixaIds) . ')'); $q->execute(array_merge([$c], $baixaIds)); $linhas = $q->fetchAll();
      if (count($linhas) !== count($baixaIds)) psi_erro('Pagamento não encontrado.', 422);
      foreach ($linhas as $b) {
        if ($b['tipo'] !== 'receber' || (int)$b['paciente_id'] !== $pacId) psi_erro('Os pagamentos precisam ser deste paciente.', 422);
        if ($b['ja'] !== null) psi_erro('Um dos pagamentos já tem recibo emitido.', 422);
        $valor += (int)$b['valor']; $data = $data === null || $b['data'] > $data ? $b['data'] : $data; $forma = $forma === null ? $b['forma'] : ($forma === $b['forma'] ? $forma : 'outro');
        $refs[substr($b['competencia'], 0, 7)] = 1;
      }
    } else { $valor = psi_cent($d['valor'] ?? null, 'valor', true); }
    $meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    $refPadrao = $refs ? 'Atendimento psicológico (' . implode(', ', array_map(fn($m) => $meses[(int)substr($m, 5, 2) - 1] . '/' . substr($m, 0, 4), array_keys($refs))) . ')' : null;
    $referencia = psi_txt($d['referencia'] ?? null, 250) ?? $refPadrao; if ($referencia === null) psi_erro('Informe a que se refere o recibo.', 422);
    $data = psi_data($d['data'] ?? null, false, 'data') ?? ($data ?? psi_hoje()); if ($data > psi_hoje()) psi_erro('A data do recibo não pode ser no futuro.', 422); if ($data < '2000-01-01') psi_erro('Data inválida.', 422);
    /* quem paga: o responsável financeiro (quando tem CPF informado) ou o próprio paciente; pode ser sobrescrito */
    $pNome = psi_txt($d['pagadorNome'] ?? null, 120); $pCpf = array_key_exists('pagadorCpf', $d) ? psi_cpf($d['pagadorCpf']) : null;
    if ($pNome === null) { if ($pac) { if ($pac['resp_nome'] && $pac['resp_cpf']) { $pNome = $pac['resp_nome']; $pCpf = $pCpf ?? $pac['resp_cpf']; } else { $pNome = $pac['nome']; $pCpf = $pCpf ?? $pac['cpf']; } } else psi_erro('Informe quem pagou.', 422); }
    $prof = $pac && $pac['profissional_id'] !== null ? psi_da_conta('psi_profissionais', $pac['profissional_id'], 'Profissional') : null; $emit = null;
    if ($prof) { $q = $db->prepare('SELECT nome, crp FROM psi_profissionais WHERE id = ? AND conta_id = ?'); $q->execute([$prof, $c]); $emit = $q->fetch(); }
    $emitNome = $emit['nome'] ?? (PsiSessao::$usuario['nome'] ?? $conta['nome']); $emitCrp = ($emit['crp'] ?? null) ?: ($conta['crp'] ?? null);
    $local = trim(($conta['cidade'] ?? '') . (($conta['cidade'] ?? '') && ($conta['uf'] ?? '') ? '/' : '') . ($conta['uf'] ?? '')) ?: null; $agora = psi_agora();
    for ($tentativa = 0; $tentativa < 3; $tentativa++) {
      $db->beginTransaction();
      try {
        $n = $db->prepare('SELECT COALESCE(MAX(numero), 0) + 1 FROM psi_recibos WHERE conta_id = ? FOR UPDATE'); $n->execute([$c]); $numero = (int)$n->fetchColumn();
        $db->prepare('INSERT INTO psi_recibos (conta_id, numero, paciente_id, pagador_nome, pagador_cpf, valor, data, referencia, forma, emitente_nome, emitente_crp, emitente_doc, consultorio, local, criado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
          ->execute([$c, $numero, $pacId, $pNome, $pCpf, $valor, $data, $referencia, $forma, $emitNome, $emitCrp, $conta['documento'] ?? null, $conta['nome'] ?? null, $local, $agora]);
        $id = (int)$db->lastInsertId();
        if ($baixaIds) { $v = $db->prepare('INSERT INTO psi_recibo_baixas (recibo_id, baixa_id, conta_id) VALUES (?,?,?)'); foreach ($baixaIds as $bid) $v->execute([$id, $bid, $c]); }
        $db->commit(); psi_auditar('emitir', 'recibo', $id, ['numero' => $numero, 'valor' => $valor]);
        return ['id' => $id, 'numero' => $numero];
      } catch (PDOException $e) { if ($db->inTransaction()) $db->rollBack(); if ($e->getCode() !== '23000' || $tentativa === 2) { if ($e->getCode() === '23000') psi_erro('Um dos pagamentos já tem recibo emitido.', 409); throw $e; } }
    }
  });

  /* Cancelar não apaga: o número fica registrado como cancelado e os pagamentos voltam a poder receber um novo recibo. */
  $r->add('POST', 'recibos/{id}/cancelar', function ($p) {
    $id = psi_int($p['id'], 1, null, 'recibo', true); $d = psi_corpo(); $db = psi_db(); $c = psi_conta_id();
    $s = $db->prepare('SELECT cancelado FROM psi_recibos WHERE id = ? AND conta_id = ?'); $s->execute([$id, $c]); $x = $s->fetch(); if (!$x) psi_erro('Recibo não encontrado.', 404); if ($x['cancelado']) return ['ok' => true];
    $db->beginTransaction();
    try { $db->prepare('UPDATE psi_recibos SET cancelado = 1, cancelado_motivo = ? WHERE id = ? AND conta_id = ?')->execute([psi_txt($d['motivo'] ?? null, 160) ?? 'Cancelado', $id, $c]); $db->prepare('DELETE FROM psi_recibo_baixas WHERE recibo_id = ? AND conta_id = ?')->execute([$id, $c]); $db->commit(); }
    catch (Throwable $e) { $db->rollBack(); throw $e; }
    psi_auditar('cancelar', 'recibo', $id); return ['ok' => true];
  });

  /* ================= relatórios ================= */
  $r->add('GET', 'relatorios/resultado', function () {
    $mes = (string)($_GET['mes'] ?? substr(psi_hoje(), 0, 7)); [$ini, $fim] = psi_intervalo_mes($mes); $c = psi_conta_id(); $db = psi_db();
    $rec = psi_somas_por_categoria('receber', $ini, $fim); $des = psi_somas_por_categoria('pagar', $ini, $fim);
    $totRec = array_sum(array_column($rec, 'valor')); $totDes = array_sum(array_column($des, 'valor')); $fixas = array_sum(array_map(fn($x) => $x['grupo'] === 'fixa' ? $x['valor'] : 0, $des));
    $ant = psi_somar_meses($ini, -1); [$aIni, $aFim] = psi_intervalo_mes(substr($ant, 0, 7)); $aRec = array_sum(array_column(psi_somas_por_categoria('receber', $aIni, $aFim), 'valor')); $aDes = array_sum(array_column(psi_somas_por_categoria('pagar', $aIni, $aFim), 'valor'));
    $q = $db->prepare("SELECT p.id, p.nome, SUM(b.valor) AS v FROM psi_baixas b JOIN psi_lancamentos l ON l.id = b.lancamento_id JOIN psi_pacientes p ON p.id = l.paciente_id AND p.conta_id = l.conta_id
      WHERE b.conta_id = ? AND l.tipo = 'receber' AND b.data >= ? AND b.data <= ? GROUP BY p.id, p.nome ORDER BY v DESC LIMIT 10"); $q->execute([$c, $ini, $fim]);
    $s = $db->prepare("SELECT COUNT(*) FROM psi_agendamentos WHERE conta_id = ? AND tipo = 'sessao' AND status = 'realizada' AND inicio >= ? AND inicio < ?"); $s->execute([$c, $ini . ' 00:00:00', psi_somar_dias($fim, 1) . ' 00:00:00']); $sessoes = (int)$s->fetchColumn();
    return ['mes' => $mes, 'receitas' => $rec, 'despesas' => $des, 'totais' => ['receitas' => $totRec, 'despesas' => $totDes, 'resultado' => $totRec - $totDes, 'despesasFixas' => $fixas, 'despesasVariaveis' => $totDes - $fixas, 'sessoesRealizadas' => $sessoes, 'ticketMedio' => $sessoes ? intdiv($totRec, $sessoes) : null],
      'anterior' => ['receitas' => $aRec, 'despesas' => $aDes, 'resultado' => $aRec - $aDes], 'topPacientes' => array_map(fn($x) => ['id' => (int)$x['id'], 'nome' => $x['nome'], 'valor' => (int)$x['v']], $q->fetchAll())];
  });

  /* Apoio ao carnê-leão: rendimentos recebidos de pessoas físicas, por pagador, e as despesas que podem entrar no livro-caixa. NÃO calcula o imposto. */
  $r->add('GET', 'relatorios/carne-leao', function () {
    $mes = (string)($_GET['mes'] ?? substr(psi_hoje(), 0, 7)); [$ini, $fim] = psi_intervalo_mes($mes); $c = psi_conta_id(); $db = psi_db();
    $s = $db->prepare("SELECT b.valor, b.data, l.paciente_id, l.origem, l.contraparte, l.descricao, p.nome, p.cpf, p.resp_nome, p.resp_cpf, p.modalidade_cobranca
      FROM psi_baixas b JOIN psi_lancamentos l ON l.id = b.lancamento_id LEFT JOIN psi_pacientes p ON p.id = l.paciente_id AND p.conta_id = l.conta_id
      WHERE b.conta_id = ? AND l.tipo = 'receber' AND b.data >= ? AND b.data <= ? ORDER BY b.data"); $s->execute([$c, $ini, $fim]);
    $pf = []; $semPaciente = 0; $convenio = 0; $semCpf = 0;
    foreach ($s->fetchAll() as $b) {
      $v = (int)$b['valor'];
      if ($b['origem'] === 'convenio' || $b['modalidade_cobranca'] === 'convenio' || ($b['contraparte'] !== null && $b['paciente_id'] === null)) { $convenio += $v; continue; }   // retido na fonte pela operadora: fora do carnê-leão
      if ($b['paciente_id'] === null) { $semPaciente += $v; continue; }
      $comResp = $b['resp_nome'] && $b['resp_cpf']; $nome = $comResp ? $b['resp_nome'] : $b['nome']; $cpf = $comResp ? $b['resp_cpf'] : $b['cpf']; $k = ($cpf ?: 'sem:' . $b['paciente_id']) . '|' . $nome;
      if (!isset($pf[$k])) $pf[$k] = ['pagador' => $nome, 'cpf' => $cpf, 'valor' => 0, 'pagamentos' => 0]; $pf[$k]['valor'] += $v; $pf[$k]['pagamentos']++; if (!$cpf) $semCpf += $v;
    }
    $lista = array_values($pf); usort($lista, fn($a, $b) => $b['valor'] <=> $a['valor']); $rendPF = array_sum(array_column($lista, 'valor'));
    $ded = array_values(array_filter(psi_somas_por_categoria('pagar', $ini, $fim), fn($x) => $x['dedutivel'])); $totDed = array_sum(array_column($ded, 'valor'));
    return ['mes' => $mes, 'rendimentosPF' => $lista, 'totais' => ['rendimentosPF' => $rendPF, 'semPaciente' => $semPaciente, 'convenio' => $convenio, 'semCpf' => $semCpf, 'deducoes' => $totDed, 'baseEstimada' => max(0, $rendPF + $semPaciente - $totDed)],
      'deducoes' => $ded, 'aviso' => 'Apoio à organização, não substitui contador. A tabela do imposto não é aplicada. Rendimentos de convênios e empresas (com retenção na fonte) ficam de fora do carnê-leão. Confirme com seu contador quais despesas podem ir ao livro-caixa.'];
  });
}
