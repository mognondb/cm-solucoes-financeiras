<?php
/** Rotas de pacientes: cadastro administrativo (sem informação clínica), como cada um paga e a situação financeira de cada um. */
declare(strict_types=1);

const PSI_TIPOS_PACIENTE = ['individual', 'casal', 'familia', 'infantil', 'grupo'];
const PSI_MODALIDADES = ['sessao', 'mensal', 'convenio'];
const PSI_STATUS_PACIENTE = ['ativo', 'pausado', 'alta', 'arquivado'];

/** Telefone só com dígitos (DDD + número, com ou sem 55). */
function psi_telefone($v, string $campo = 'telefone'): ?string {
  $s = psi_txt($v, 30, false, $campo);
  if ($s === null) return null;
  $d = preg_replace('/\D+/', '', $s);
  if ($d === '') return null;
  if (strlen($d) < 10 || strlen($d) > 13) psi_erro("Telefone inválido em: $campo (use DDD + número).", 422);
  return $d;
}

function psi_paciente_json(array $p): array {
  $n = fn($v) => $v === null ? null : (int)$v;
  return [
    'id' => (int)$p['id'], 'profissionalId' => $n($p['profissional_id']), 'nome' => $p['nome'], 'apelido' => $p['apelido'], 'cpf' => $p['cpf'], 'nascimento' => $p['nascimento'],
    'telefone' => $p['telefone'], 'email' => $p['email'], 'respNome' => $p['resp_nome'], 'respCpf' => $p['resp_cpf'], 'respTelefone' => $p['resp_telefone'],
    'tipo' => $p['tipo'], 'servicoId' => $n($p['servico_id']), 'modalidade' => $p['modalidade_cobranca'], 'valorSessao' => (int)$p['valor_sessao'], 'valorMensal' => (int)$p['valor_mensal'],
    'diaVencimento' => $n($p['dia_vencimento']), 'prazoDias' => (int)$p['prazo_dias'], 'formaPagamento' => $p['forma_pagamento'], 'convenioNome' => $p['convenio_nome'],
    'convenioPrazoDias' => $n($p['convenio_prazo_dias']), 'status' => $p['status'], 'obs' => $p['obs'], 'desde' => $p['desde'],
  ];
}

/** Lê e valida o corpo do pedido; devolve as colunas prontas para gravar. */
function psi_ler_paciente(array $d): array {
  $modal = psi_opcao($d['modalidade'] ?? null, PSI_MODALIDADES, 'sessao');
  $valorMensal = psi_cent($d['valorMensal'] ?? 0, 'valor da mensalidade', false, true) ?? 0;
  $dia = psi_int($d['diaVencimento'] ?? null, 1, 31, 'dia de vencimento');
  $convNome = psi_txt($d['convenioNome'] ?? null, 80);
  $convPrazo = psi_int($d['convenioPrazoDias'] ?? null, 0, 365, 'prazo do convênio');
  if ($modal === 'mensal') {
    if ($valorMensal <= 0) psi_erro('Informe o valor da mensalidade.', 422);
    if ($dia === null) psi_erro('Informe o dia do vencimento da mensalidade.', 422);
  }
  if ($modal === 'convenio') {
    if ($convNome === null) psi_erro('Informe o nome do convênio.', 422);
    if ($convPrazo === null) $convPrazo = 30;
  } else { $convNome = null; $convPrazo = null; }
  if ($modal !== 'mensal') { $dia = null; $valorMensal = 0; }
  $nasc = psi_data($d['nascimento'] ?? null, false, 'data de nascimento');
  if ($nasc !== null && $nasc > psi_hoje()) psi_erro('A data de nascimento não pode ser no futuro.', 422);
  $forma = psi_txt($d['formaPagamento'] ?? null, 30);
  if ($forma !== null && !array_key_exists($forma, PSI_FORMAS)) psi_erro('Forma de pagamento inválida.', 422);
  $profId = psi_da_conta('psi_profissionais', $d['profissionalId'] ?? null, 'Profissional');
  if ($profId === null) {
    $s = psi_db()->prepare('SELECT id FROM psi_profissionais WHERE conta_id = ? AND ativo = 1'); $s->execute([psi_conta_id()]); $ids = $s->fetchAll(PDO::FETCH_COLUMN);
    if (count($ids) === 1) $profId = (int)$ids[0];
  }
  return [
    'profissional_id' => $profId, 'nome' => psi_txt($d['nome'] ?? null, 120, true, 'nome do paciente'), 'apelido' => psi_txt($d['apelido'] ?? null, 60),
    'cpf' => psi_cpf($d['cpf'] ?? null), 'nascimento' => $nasc, 'telefone' => psi_telefone($d['telefone'] ?? null), 'email' => psi_email($d['email'] ?? null, false),
    'resp_nome' => psi_txt($d['respNome'] ?? null, 120), 'resp_cpf' => psi_cpf($d['respCpf'] ?? null), 'resp_telefone' => psi_telefone($d['respTelefone'] ?? null, 'telefone do responsável'),
    'tipo' => psi_opcao($d['tipo'] ?? null, PSI_TIPOS_PACIENTE, 'individual'), 'servico_id' => psi_da_conta('psi_servicos', $d['servicoId'] ?? null, 'Tipo de atendimento'),
    'modalidade_cobranca' => $modal, 'valor_sessao' => psi_cent($d['valorSessao'] ?? 0, 'valor da sessão', false, true) ?? 0, 'valor_mensal' => $valorMensal,
    'dia_vencimento' => $dia, 'prazo_dias' => psi_int($d['prazoDias'] ?? 0, 0, 365, 'prazo de pagamento') ?? 0, 'forma_pagamento' => $forma,
    'convenio_nome' => $convNome, 'convenio_prazo_dias' => $convPrazo, 'status' => psi_opcao($d['status'] ?? null, PSI_STATUS_PACIENTE, 'ativo'),
    'obs' => psi_txt($d['obs'] ?? null, 500), 'desde' => psi_data($d['desde'] ?? null, false, 'data de início'),
  ];
}

/** Saldo em aberto e vencido por paciente (a receber, descontadas as baixas parciais). */
function psi_saldos_pacientes(?array $ids = null): array {
  $c = psi_conta_id(); $hoje = psi_hoje();
  $sql = "SELECT l.paciente_id, SUM(l.valor - COALESCE(b.pago, 0)) AS aberto,
            SUM(CASE WHEN l.vencimento < ? THEN l.valor - COALESCE(b.pago, 0) ELSE 0 END) AS vencido,
            MIN(CASE WHEN l.vencimento < ? THEN l.vencimento ELSE NULL END) AS mais_antigo
          FROM psi_lancamentos l
          LEFT JOIN (SELECT lancamento_id, SUM(valor) AS pago FROM psi_baixas WHERE conta_id = ? GROUP BY lancamento_id) b ON b.lancamento_id = l.id
          WHERE l.conta_id = ? AND l.tipo = 'receber' AND l.situacao = 'aberto' AND l.paciente_id IS NOT NULL";
  $par = [$hoje, $hoje, $c, $c];
  if ($ids !== null) { if (!$ids) return []; $sql .= ' AND l.paciente_id IN (' . psi_marcadores($ids) . ')'; $par = array_merge($par, $ids); }
  $s = psi_db()->prepare($sql . ' GROUP BY l.paciente_id'); $s->execute($par);
  $o = [];
  foreach ($s->fetchAll() as $r) $o[(int)$r['paciente_id']] = ['aberto' => (int)$r['aberto'], 'vencido' => (int)$r['vencido'], 'maisAntigo' => $r['mais_antigo']];
  return $o;
}

function psi_registrar_rotas_pacientes(PsiRoteador $r): void {
  $r->add('GET', 'pacientes', function () {
    $c = psi_conta_id(); $db = psi_db();
    $status = psi_opcao($_GET['status'] ?? null, array_merge(PSI_STATUS_PACIENTE, ['todos']), 'ativo');
    $onde = ['p.conta_id = ?']; $par = [psi_conta_id()];
    if ($status !== 'todos') { $onde[] = 'p.status = ?'; $par[] = $status; }
    $prof = psi_int($_GET['profissional'] ?? null, 1, null, 'profissional'); if ($prof !== null) { $onde[] = 'p.profissional_id = ?'; $par[] = $prof; }
    $busca = trim((string)($_GET['busca'] ?? ''));
    if ($busca !== '') {
      $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], mb_substr($busca, 0, 60)) . '%'; $dig = preg_replace('/\D+/', '', $busca);
      $cond = '(p.nome LIKE ? OR p.apelido LIKE ? OR p.resp_nome LIKE ?'; array_push($par, $like, $like, $like);
      if (strlen($dig) >= 4) { $cond .= ' OR p.telefone LIKE ? OR p.cpf LIKE ?'; $ld = '%' . $dig . '%'; array_push($par, $ld, $ld); }
      $onde[] = $cond . ')';
    }
    $agora = psi_agora_local();
    $sql = "SELECT p.*,
        (SELECT MIN(a.inicio) FROM psi_agendamentos a WHERE a.conta_id = p.conta_id AND a.paciente_id = p.id AND a.status IN ('agendada','confirmada') AND a.inicio >= ?) AS proxima,
        (SELECT MAX(a.inicio) FROM psi_agendamentos a WHERE a.conta_id = p.conta_id AND a.paciente_id = p.id AND a.status = 'realizada') AS ultima,
        (SELECT COUNT(*) FROM psi_agendamentos a WHERE a.conta_id = p.conta_id AND a.paciente_id = p.id AND a.status = 'realizada') AS sessoes
      FROM psi_pacientes p WHERE " . implode(' AND ', $onde) . ' ORDER BY p.nome ASC LIMIT 1000';
    $s = $db->prepare($sql); $s->execute(array_merge([$agora], $par)); $linhas = $s->fetchAll();
    $saldos = psi_saldos_pacientes(psi_ids($linhas));
    $itens = [];
    foreach ($linhas as $p) {
      $sd = $saldos[(int)$p['id']] ?? ['aberto' => 0, 'vencido' => 0, 'maisAntigo' => null];
      $itens[] = psi_paciente_json($p) + ['proxima' => $p['proxima'], 'ultima' => $p['ultima'], 'sessoes' => (int)$p['sessoes'], 'aberto' => $sd['aberto'], 'vencido' => $sd['vencido'], 'maisAntigo' => $sd['maisAntigo']];
    }
    if (!empty($_GET['inadimplentes'])) $itens = array_values(array_filter($itens, fn($i) => $i['vencido'] > 0));
    $cont = $db->prepare('SELECT status, COUNT(*) FROM psi_pacientes WHERE conta_id = ? GROUP BY status'); $cont->execute([$c]);
    return ['itens' => $itens, 'contagem' => $cont->fetchAll(PDO::FETCH_KEY_PAIR)];
  });

  $r->add('GET', 'pacientes/{id}', function ($p) {
    $c = psi_conta_id(); $db = psi_db(); $id = (int)$p['id'];
    $s = $db->prepare('SELECT * FROM psi_pacientes WHERE id = ? AND conta_id = ?'); $s->execute([$id, $c]); $pac = $s->fetch();
    if (!$pac) psi_erro('Paciente não encontrado.', 404);
    $agora = psi_agora_local();
    $q = function (string $extra, array $par) use ($db, $c, $id): array {
      $s = $db->prepare("SELECT id, inicio, fim, status, modalidade, valor, cobrar, serie_id FROM psi_agendamentos WHERE conta_id = ? AND paciente_id = ? $extra"); $s->execute(array_merge([$c, $id], $par));
      return array_map(fn($a) => ['id' => (int)$a['id'], 'inicio' => $a['inicio'], 'fim' => $a['fim'], 'status' => $a['status'], 'modalidade' => $a['modalidade'], 'valor' => (int)$a['valor'], 'cobrar' => (bool)$a['cobrar'], 'serieId' => $a['serie_id'] === null ? null : (int)$a['serie_id']], $s->fetchAll());
    };
    $proximas = $q("AND status IN ('agendada','confirmada') AND inicio >= ? ORDER BY inicio ASC LIMIT 6", [$agora]);
    $historico = $q('AND inicio < ? ORDER BY inicio DESC LIMIT 12', [$agora]);
    $s = $db->prepare("SELECT l.id, l.descricao, l.valor, l.vencimento, l.origem, l.agendamento_id, COALESCE((SELECT SUM(b.valor) FROM psi_baixas b WHERE b.lancamento_id = l.id), 0) AS pago
        FROM psi_lancamentos l WHERE l.conta_id = ? AND l.paciente_id = ? AND l.tipo = 'receber' AND l.situacao = 'aberto' ORDER BY l.vencimento ASC LIMIT 100");
    $s->execute([$c, $id]);
    $abertos = array_map(fn($l) => ['id' => (int)$l['id'], 'descricao' => $l['descricao'], 'valor' => (int)$l['valor'], 'pago' => (int)$l['pago'], 'vencimento' => $l['vencimento'], 'origem' => $l['origem'], 'agendamentoId' => $l['agendamento_id'] === null ? null : (int)$l['agendamento_id']], $s->fetchAll());
    $sd = psi_saldos_pacientes([$id])[$id] ?? ['aberto' => 0, 'vencido' => 0, 'maisAntigo' => null];
    $s = $db->prepare("SELECT COALESCE(SUM(b.valor), 0) FROM psi_baixas b JOIN psi_lancamentos l ON l.id = b.lancamento_id WHERE l.conta_id = ? AND l.paciente_id = ? AND l.tipo = 'receber'"); $s->execute([$c, $id]);
    $s2 = $db->prepare("SELECT COUNT(*) FROM psi_agendamentos WHERE conta_id = ? AND paciente_id = ? AND status = 'realizada'"); $s2->execute([$c, $id]);
    $s3 = $db->prepare('SELECT canal, obs, promessa_em, criado_em FROM psi_cobrancas WHERE conta_id = ? AND paciente_id = ? ORDER BY id DESC LIMIT 5'); $s3->execute([$c, $id]);
    return ['paciente' => psi_paciente_json($pac), 'financeiro' => $sd + ['recebido' => (int)$s->fetchColumn(), 'sessoesRealizadas' => (int)$s2->fetchColumn()],
      'proximas' => $proximas, 'historico' => $historico, 'abertos' => $abertos, 'cobrancas' => $s3->fetchAll()];
  });

  $r->add('POST', 'pacientes', function () {
    $d = psi_corpo(); $v = psi_ler_paciente($d); $db = psi_db();
    $dup = $db->prepare('SELECT id FROM psi_pacientes WHERE conta_id = ? AND nome = ? LIMIT 1'); $dup->execute([psi_conta_id(), $v['nome']]);
    if ($dup->fetchColumn() && ($d['confirmarDuplicado'] ?? false) !== true) psi_erro('Já existe um paciente com esse nome. Se for outra pessoa, confirme para cadastrar mesmo assim.', 409, ['duplicado' => true]);
    $agora = psi_agora(); $v += ['conta_id' => psi_conta_id(), 'criado_em' => $agora, 'atualizado_em' => $agora];
    if ($v['desde'] === null) $v['desde'] = psi_hoje();
    $db->prepare('INSERT INTO psi_pacientes (' . implode(',', array_keys($v)) . ') VALUES (' . psi_marcadores($v) . ')')->execute(array_values($v));
    $id = (int)$db->lastInsertId(); psi_auditar('criar', 'paciente', $id);
    return ['id' => $id];
  });

  $r->add('PUT', 'pacientes/{id}', function ($p) {
    $id = psi_da_conta('psi_pacientes', $p['id'], 'Paciente', true); $v = psi_ler_paciente(psi_corpo());
    $v['atualizado_em'] = psi_agora();
    $set = implode(', ', array_map(fn($k) => "$k = ?", array_keys($v)));
    psi_db()->prepare("UPDATE psi_pacientes SET $set WHERE id = ? AND conta_id = ?")->execute(array_merge(array_values($v), [$id, psi_conta_id()]));
    psi_auditar('alterar', 'paciente', $id);
    return ['ok' => true];
  });

  /* Mudança rápida de situação (pausar, dar alta, arquivar, reativar) sem reenviar o cadastro inteiro. */
  $r->add('POST', 'pacientes/{id}/status', function ($p) {
    $id = psi_da_conta('psi_pacientes', $p['id'], 'Paciente', true); $d = psi_corpo();
    $st = psi_opcao($d['status'] ?? null, PSI_STATUS_PACIENTE, ''); if ($st === '') psi_erro('Situação inválida.', 422);
    psi_db()->prepare('UPDATE psi_pacientes SET status = ?, atualizado_em = ? WHERE id = ? AND conta_id = ?')->execute([$st, psi_agora(), $id, psi_conta_id()]);
    psi_auditar('situacao', 'paciente', $id, ['status' => $st]);
    return ['ok' => true];
  });

  /* Só apaga quem nunca teve agenda nem cobrança (cadastro por engano); os demais são arquivados. */
  $r->add('DELETE', 'pacientes/{id}', function ($p) {
    $id = psi_da_conta('psi_pacientes', $p['id'], 'Paciente', true); $db = psi_db(); $c = psi_conta_id();
    $s = $db->prepare('SELECT (SELECT COUNT(*) FROM psi_agendamentos WHERE conta_id = ? AND paciente_id = ?) + (SELECT COUNT(*) FROM psi_lancamentos WHERE conta_id = ? AND paciente_id = ?) + (SELECT COUNT(*) FROM psi_series WHERE conta_id = ? AND paciente_id = ?)');
    $s->execute([$c, $id, $c, $id, $c, $id]);
    if ((int)$s->fetchColumn() > 0) psi_erro('Este paciente já tem agenda ou cobranças registradas, então não pode ser apagado. Arquive o cadastro.', 409);
    $db->prepare('DELETE FROM psi_cobrancas WHERE conta_id = ? AND paciente_id = ?')->execute([$c, $id]);
    $db->prepare('DELETE FROM psi_pacientes WHERE id = ? AND conta_id = ?')->execute([$id, $c]);
    psi_auditar('apagar', 'paciente', $id);
    return ['ok' => true];
  });
}
