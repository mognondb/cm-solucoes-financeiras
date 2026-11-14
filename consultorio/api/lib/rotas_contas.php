<?php
/**
 * Contas financeiras (banco, carteira, cartão, plataforma), transferências, despesas fixas e fluxo de caixa.
 * - O saldo de uma conta nunca é um campo: é o saldo inicial + recebimentos − pagamentos ± transferências desde a data do saldo inicial.
 * - Cartão de crédito é uma conta cujo saldo é a dívida (negativo). Compra no cartão = pagamento (baixa) naquela conta; pagar a fatura = transferência de uma conta para o cartão.
 *   Assim o gasto aparece no dia da compra (resultado) e a saída de caixa só aparece quando a fatura é paga.
 */
declare(strict_types=1);

const PSI_TIPOS_CONTA_FIN = ['banco', 'carteira', 'cartao', 'plataforma'];

/** id → saldo (centavos) de todas as contas financeiras da conta. */
function psi_saldos_contas(): array {
  $s = psi_db()->prepare("SELECT f.id, f.saldo_inicial
      + COALESCE((SELECT SUM(b.valor) FROM psi_baixas b JOIN psi_lancamentos l ON l.id = b.lancamento_id WHERE b.conta_fin_id = f.id AND l.tipo = 'receber' AND b.data >= f.data_saldo), 0)
      - COALESCE((SELECT SUM(b.valor) FROM psi_baixas b JOIN psi_lancamentos l ON l.id = b.lancamento_id WHERE b.conta_fin_id = f.id AND l.tipo = 'pagar' AND b.data >= f.data_saldo), 0)
      + COALESCE((SELECT SUM(t.valor) FROM psi_transferencias t WHERE t.destino_id = f.id AND t.data >= f.data_saldo), 0)
      - COALESCE((SELECT SUM(t.valor) FROM psi_transferencias t WHERE t.origem_id = f.id AND t.data >= f.data_saldo), 0) AS saldo
    FROM psi_contas_fin f WHERE f.conta_id = ?");
  $s->execute([psi_conta_id()]);
  $o = []; foreach ($s->fetchAll() as $r) $o[(int)$r['id']] = (int)$r['saldo'];
  return $o;
}

/** Fatura do cartão: compras do ciclo aberto, o que já fechou e ainda deve, e as datas. (Aproximação: não casa cada pagamento com uma fatura.) */
function psi_fatura(array $f, int $saldo): ?array {
  if ($f['tipo'] !== 'cartao' || !$f['dia_fechamento'] || !$f['dia_vencimento']) return null;
  $hoje = psi_hoje(); $fech = (int)$f['dia_fechamento']; $ano = (int)substr($hoje, 0, 4); $mes = (int)substr($hoje, 5, 2);
  $fechEste = psi_data_no_mes($ano, $mes, $fech);
  $proxFech = $hoje <= $fechEste ? $fechEste : psi_dia_no_mes_de(psi_somar_meses(psi_inicio_mes($hoje), 1), $fech);
  $fechAnt = psi_dia_no_mes_de(psi_somar_meses(psi_inicio_mes($proxFech), -1), $fech);
  $q = psi_db()->prepare("SELECT COALESCE(SUM(b.valor), 0) FROM psi_baixas b JOIN psi_lancamentos l ON l.id = b.lancamento_id WHERE b.conta_id = ? AND b.conta_fin_id = ? AND l.tipo = 'pagar' AND b.data > ? AND b.data <= ?");
  $q->execute([psi_conta_id(), (int)$f['id'], $fechAnt, $proxFech]); $aberta = (int)$q->fetchColumn();
  $divida = max(0, -$saldo); $aberta = min($aberta, $divida); $fechada = $divida - $aberta;
  $vencBase = psi_somar_meses(psi_inicio_mes($fechAnt), (int)$f['dia_vencimento'] <= $fech ? 1 : 0);
  $vencFechada = psi_dia_no_mes_de($vencBase, (int)$f['dia_vencimento']);
  $vencAberta = psi_dia_no_mes_de(psi_somar_meses(psi_inicio_mes($proxFech), (int)$f['dia_vencimento'] <= $fech ? 1 : 0), (int)$f['dia_vencimento']);
  return ['aberta' => $aberta, 'fechada' => $fechada, 'fechamentoEm' => $proxFech, 'vencimentoFechada' => $vencFechada, 'vencimentoAberta' => $vencAberta];
}
function psi_ano_mes(string $data): array { return [(int)substr($data, 0, 4), (int)substr($data, 5, 2)]; }
/** O dia D do mês que contém a data (ajusta ao último dia em meses curtos). */
function psi_dia_no_mes_de(string $data, int $dia): string { return psi_data_no_mes((int)substr($data, 0, 4), (int)substr($data, 5, 2), $dia); }

function psi_conta_fin_json(array $f, int $saldo): array {
  $n = fn($v) => $v === null ? null : (int)$v;
  return ['id' => (int)$f['id'], 'tipo' => $f['tipo'], 'nome' => $f['nome'], 'banco' => $f['banco'], 'saldoInicial' => (int)$f['saldo_inicial'], 'dataSaldo' => $f['data_saldo'], 'saldo' => $saldo,
    'limite' => $n($f['limite']), 'diaFechamento' => $n($f['dia_fechamento']), 'diaVencimento' => $n($f['dia_vencimento']), 'contaPagamentoId' => $n($f['conta_pagamento_id']),
    'ativo' => (bool)$f['ativo'], 'fatura' => psi_fatura($f, $saldo)];
}

function psi_ler_conta_fin(array $d, ?array $atual): array {
  $tipo = $atual ? $atual['tipo'] : psi_opcao($d['tipo'] ?? null, PSI_TIPOS_CONTA_FIN, 'banco');
  $saldoIni = array_key_exists('saldoInicial', $d) ? psi_int($d['saldoInicial'], -2000000000, 2000000000, 'saldo inicial') ?? 0 : ($atual ? (int)$atual['saldo_inicial'] : 0);
  $dataSaldo = array_key_exists('dataSaldo', $d) ? (psi_data($d['dataSaldo'], false, 'data do saldo') ?? psi_hoje()) : ($atual ? $atual['data_saldo'] : psi_hoje());
  if ($dataSaldo < '2000-01-01' || $dataSaldo > psi_hoje()) psi_erro('A data do saldo inicial não pode ser no futuro.', 422);
  $cartao = $tipo === 'cartao';
  $pagId = $cartao && !empty($d['contaPagamentoId']) ? psi_da_conta('psi_contas_fin', $d['contaPagamentoId'], 'Conta de pagamento') : null;
  return [
    'tipo' => $tipo, 'nome' => psi_txt($d['nome'] ?? ($atual['nome'] ?? null), 80, true, 'nome da conta'), 'banco' => psi_txt($d['banco'] ?? ($atual['banco'] ?? null), 60),
    'saldo_inicial' => $saldoIni, 'data_saldo' => $dataSaldo,
    'limite' => $cartao ? psi_cent($d['limite'] ?? null, 'limite', false, true) : null, 'dia_fechamento' => $cartao ? psi_int($d['diaFechamento'] ?? null, 1, 31, 'dia de fechamento') : null,
    'dia_vencimento' => $cartao ? psi_int($d['diaVencimento'] ?? null, 1, 31, 'dia de vencimento') : null, 'conta_pagamento_id' => $pagId,
    'ativo' => array_key_exists('ativo', $d) ? psi_bool($d['ativo']) : ($atual ? (int)$atual['ativo'] : 1),
  ];
}

/* ================================================================= despesas fixas */
/** Uma conta a pagar por mês (atual e próximo) para cada despesa fixa ativa. Idempotente (chave_unica "rec:ID:AAAA-MM"). */
function psi_gerar_recorrentes(): void {
  static $feito = [];
  $c = psi_conta_id(); if (isset($feito[$c])) return; $feito[$c] = true;
  $db = psi_db(); $hoje = psi_hoje();
  $s = $db->prepare('SELECT * FROM psi_recorrentes WHERE conta_id = ? AND ativa = 1'); $s->execute([$c]); $regras = $s->fetchAll(); if (!$regras) return;
  $ins = $db->prepare("INSERT IGNORE INTO psi_lancamentos (conta_id, tipo, descricao, categoria_id, contraparte, valor, vencimento, competencia, situacao, origem, recorrente_id, chave_unica, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?,'aberto','recorrente',?,?,?,?)");
  $agora = psi_agora();
  foreach ([psi_inicio_mes($hoje), psi_inicio_mes(psi_somar_meses(psi_inicio_mes($hoje), 1))] as $mesIni) {
    [$ano, $mes] = psi_ano_mes($mesIni);
    foreach ($regras as $g) {
      if ($g['frequencia'] === 'anual' && (int)$g['mes'] !== $mes) continue;
      $venc = psi_data_no_mes($ano, $mes, (int)$g['dia']);
      if ($venc < $g['inicio'] || ($g['fim'] !== null && $venc > $g['fim'])) continue;
      $ins->execute([$c, 'pagar', $g['descricao'], $g['categoria_id'], $g['contraparte'], (int)$g['valor'], $venc, $mesIni, (int)$g['id'], 'rec:' . $g['id'] . ':' . substr($mesIni, 0, 7), $agora, $agora]);
    }
  }
}
function psi_recorrente_json(array $g): array {
  return ['id' => (int)$g['id'], 'descricao' => $g['descricao'], 'valor' => (int)$g['valor'], 'categoriaId' => $g['categoria_id'] === null ? null : (int)$g['categoria_id'], 'contraparte' => $g['contraparte'],
    'frequencia' => $g['frequencia'], 'dia' => (int)$g['dia'], 'mes' => $g['mes'] === null ? null : (int)$g['mes'], 'inicio' => $g['inicio'], 'fim' => $g['fim'], 'ativa' => (bool)$g['ativa'], 'obs' => $g['obs']];
}

function psi_registrar_rotas_contas(PsiRoteador $r): void {
  /* ---- contas financeiras ---- */
  $r->add('GET', 'contas-fin', function () {
    $s = psi_db()->prepare('SELECT * FROM psi_contas_fin WHERE conta_id = ? ORDER BY ativo DESC, ordem, id'); $s->execute([psi_conta_id()]);
    $saldos = psi_saldos_contas(); $itens = []; $caixa = 0; $divida = 0;
    foreach ($s->fetchAll() as $f) {
      $sd = $saldos[(int)$f['id']] ?? 0; $itens[] = psi_conta_fin_json($f, $sd);
      if ($f['ativo']) { if ($f['tipo'] === 'cartao') $divida += max(0, -$sd); else $caixa += $sd; }
    }
    return ['itens' => $itens, 'saldoCaixa' => $caixa, 'dividaCartoes' => $divida];
  });
  $r->add('POST', 'contas-fin', function () {
    $v = psi_ler_conta_fin(psi_corpo(), null); $db = psi_db(); $v += ['conta_id' => psi_conta_id(), 'ordem' => 99, 'criado_em' => psi_agora()];
    $db->prepare('INSERT INTO psi_contas_fin (' . implode(',', array_keys($v)) . ') VALUES (' . psi_marcadores($v) . ')')->execute(array_values($v));
    $id = (int)$db->lastInsertId(); psi_auditar('criar', 'conta_fin', $id); return ['id' => $id];
  });
  $r->add('PUT', 'contas-fin/{id}', function ($p) {
    $id = psi_da_conta('psi_contas_fin', $p['id'], 'Conta', true); $db = psi_db();
    $a = $db->prepare('SELECT * FROM psi_contas_fin WHERE id = ? AND conta_id = ?'); $a->execute([$id, psi_conta_id()]); $atual = $a->fetch();
    $v = psi_ler_conta_fin(psi_corpo(), $atual); unset($v['tipo']);   // o tipo não muda depois de criada
    if ((int)($v['conta_pagamento_id'] ?? 0) === $id) psi_erro('A conta de pagamento não pode ser o próprio cartão.', 422);
    $db->prepare('UPDATE psi_contas_fin SET ' . implode(', ', array_map(fn($k) => "$k = ?", array_keys($v))) . ' WHERE id = ? AND conta_id = ?')->execute(array_merge(array_values($v), [$id, psi_conta_id()]));
    psi_auditar('alterar', 'conta_fin', $id); return ['ok' => true];
  });
  $r->add('GET', 'contas-fin/{id}/movimentos', function ($p) {
    $id = psi_da_conta('psi_contas_fin', $p['id'], 'Conta', true); $c = psi_conta_id(); $lim = psi_int($_GET['limite'] ?? 100, 1, 500, 'limite') ?? 100;
    $s = psi_db()->prepare("(SELECT 'baixa' AS origem, b.id, b.data, CASE WHEN l.tipo = 'receber' THEN b.valor ELSE -b.valor END AS valor, l.descricao AS descricao, l.tipo AS tipo, pc.nome AS quem
        FROM psi_baixas b JOIN psi_lancamentos l ON l.id = b.lancamento_id LEFT JOIN psi_pacientes pc ON pc.id = l.paciente_id WHERE b.conta_id = ? AND b.conta_fin_id = ?)
      UNION ALL (SELECT 'transferencia', t.id, t.data, CASE WHEN t.destino_id = ? THEN t.valor ELSE -t.valor END, CONCAT('Transferência ', CASE WHEN t.destino_id = ? THEN 'recebida' ELSE 'enviada' END, IF(t.obs IS NULL, '', CONCAT(' · ', t.obs))), 'transferencia', NULL
        FROM psi_transferencias t WHERE t.conta_id = ? AND (t.origem_id = ? OR t.destino_id = ?))
      ORDER BY data DESC, id DESC LIMIT $lim");
    $s->execute([$c, $id, $id, $id, $c, $id, $id]);
    return ['itens' => array_map(fn($m) => ['origem' => $m['origem'], 'id' => (int)$m['id'], 'data' => $m['data'], 'valor' => (int)$m['valor'], 'descricao' => $m['descricao'], 'tipo' => $m['tipo'], 'quem' => $m['quem']], $s->fetchAll())];
  });

  /* ---- transferências (e pagamento de fatura) ---- */
  $r->add('GET', 'transferencias', function () {
    $s = psi_db()->prepare('SELECT t.id, t.origem_id, t.destino_id, t.valor, t.data, t.obs, o.nome AS origem, d.nome AS destino FROM psi_transferencias t JOIN psi_contas_fin o ON o.id = t.origem_id JOIN psi_contas_fin d ON d.id = t.destino_id WHERE t.conta_id = ? ORDER BY t.data DESC, t.id DESC LIMIT 100');
    $s->execute([psi_conta_id()]);
    return ['itens' => array_map(fn($t) => ['id' => (int)$t['id'], 'origemId' => (int)$t['origem_id'], 'destinoId' => (int)$t['destino_id'], 'origem' => $t['origem'], 'destino' => $t['destino'], 'valor' => (int)$t['valor'], 'data' => $t['data'], 'obs' => $t['obs']], $s->fetchAll())];
  });
  $r->add('POST', 'transferencias', function () {
    $d = psi_corpo(); $o = psi_da_conta('psi_contas_fin', $d['origemId'] ?? null, 'Conta de origem', true); $de = psi_da_conta('psi_contas_fin', $d['destinoId'] ?? null, 'Conta de destino', true);
    if ($o === $de) psi_erro('Escolha duas contas diferentes.', 422);
    $valor = psi_cent($d['valor'] ?? null, 'valor', true); $data = psi_data($d['data'] ?? null, false, 'data') ?? psi_hoje();
    if ($data > psi_hoje()) psi_erro('A data da transferência não pode ser no futuro.', 422); if ($data < '2000-01-01') psi_erro('Data inválida.', 422);
    $q = psi_db()->prepare('SELECT COUNT(*) FROM psi_contas_fin WHERE conta_id = ? AND ativo = 1 AND id IN (?, ?)'); $q->execute([psi_conta_id(), $o, $de]); if ((int)$q->fetchColumn() !== 2) psi_erro('Uma das contas está inativa.', 422);
    psi_db()->prepare('INSERT INTO psi_transferencias (conta_id, origem_id, destino_id, valor, data, obs, criado_em) VALUES (?,?,?,?,?,?,?)')->execute([psi_conta_id(), $o, $de, $valor, $data, psi_txt($d['obs'] ?? null, 200), psi_agora()]);
    $id = (int)psi_db()->lastInsertId(); psi_auditar('criar', 'transferencia', $id, ['valor' => $valor]); return ['id' => $id];
  });
  $r->add('DELETE', 'transferencias/{id}', function ($p) {
    $id = psi_int($p['id'], 1, null, 'transferência', true); $s = psi_db()->prepare('DELETE FROM psi_transferencias WHERE id = ? AND conta_id = ?'); $s->execute([$id, psi_conta_id()]);
    if ($s->rowCount() === 0) psi_erro('Transferência não encontrada.', 404);
    psi_auditar('apagar', 'transferencia', $id); return ['ok' => true];
  });

  /* ---- despesas fixas ---- */
  $r->add('GET', 'recorrentes', function () {
    $s = psi_db()->prepare('SELECT * FROM psi_recorrentes WHERE conta_id = ? ORDER BY ativa DESC, descricao'); $s->execute([psi_conta_id()]);
    return ['itens' => array_map('psi_recorrente_json', $s->fetchAll())];
  });
  $ler = function (array $d, ?array $atual) {
    $freq = psi_opcao($d['frequencia'] ?? ($atual['frequencia'] ?? null), ['mensal', 'anual'], 'mensal'); $inicio = psi_data($d['inicio'] ?? ($atual['inicio'] ?? null), false, 'início') ?? psi_hoje();
    $fim = array_key_exists('fim', $d) ? psi_data($d['fim'], false, 'fim') : ($atual['fim'] ?? null); if ($fim !== null && $fim < $inicio) psi_erro('O fim precisa ser depois do início.', 422);
    $mes = $freq === 'anual' ? psi_int($d['mes'] ?? ($atual['mes'] ?? null), 1, 12, 'mês', true) : null;
    return ['descricao' => psi_txt($d['descricao'] ?? ($atual['descricao'] ?? null), 150, true, 'descrição'), 'valor' => psi_cent($d['valor'] ?? ($atual['valor'] ?? null), 'valor', true),
      'categoria_id' => array_key_exists('categoriaId', $d) ? psi_categoria_id($d['categoriaId'], 'despesa') : ($atual['categoria_id'] ?? null), 'contraparte' => array_key_exists('contraparte', $d) ? psi_txt($d['contraparte'], 120) : ($atual['contraparte'] ?? null),
      'frequencia' => $freq, 'dia' => psi_int($d['dia'] ?? ($atual['dia'] ?? null), 1, 31, 'dia do vencimento', true), 'mes' => $mes, 'inicio' => $inicio, 'fim' => $fim,
      'ativa' => array_key_exists('ativa', $d) ? psi_bool($d['ativa']) : ($atual ? (int)$atual['ativa'] : 1), 'obs' => array_key_exists('obs', $d) ? psi_txt($d['obs'], 200) : ($atual['obs'] ?? null)];
  };
  $r->add('POST', 'recorrentes', function () use ($ler) {
    $v = $ler(psi_corpo(), null) + ['conta_id' => psi_conta_id(), 'criado_em' => psi_agora()]; $db = psi_db();
    $db->prepare('INSERT INTO psi_recorrentes (' . implode(',', array_keys($v)) . ') VALUES (' . psi_marcadores($v) . ')')->execute(array_values($v));
    $id = (int)$db->lastInsertId(); psi_auditar('criar', 'recorrente', $id); return ['id' => $id];
  });
  $r->add('PUT', 'recorrentes/{id}', function ($p) use ($ler) {
    $id = psi_int($p['id'], 1, null, 'despesa fixa', true); $db = psi_db(); $a = $db->prepare('SELECT * FROM psi_recorrentes WHERE id = ? AND conta_id = ?'); $a->execute([$id, psi_conta_id()]); $atual = $a->fetch();
    if (!$atual) psi_erro('Despesa fixa não encontrada.', 404);
    $v = $ler(psi_corpo(), $atual);
    $db->prepare('UPDATE psi_recorrentes SET ' . implode(', ', array_map(fn($k) => "$k = ?", array_keys($v))) . ' WHERE id = ? AND conta_id = ?')->execute(array_merge(array_values($v), [$id, psi_conta_id()]));
    psi_auditar('alterar', 'recorrente', $id); return ['ok' => true];
  });
  $r->add('DELETE', 'recorrentes/{id}', function ($p) {
    $id = psi_int($p['id'], 1, null, 'despesa fixa', true); $s = psi_db()->prepare('DELETE FROM psi_recorrentes WHERE id = ? AND conta_id = ?'); $s->execute([$id, psi_conta_id()]);
    if ($s->rowCount() === 0) psi_erro('Despesa fixa não encontrada.', 404);
    psi_auditar('apagar', 'recorrente', $id); return ['ok' => true];   // as contas já geradas continuam; só deixam de nascer novas
  });

  /* ---- fluxo de caixa: realizado do mês, previsto e projeção de saldo ---- */
  $r->add('GET', 'caixa', function () {
    psi_gerar_mensalidades(); psi_gerar_recorrentes();
    $c = psi_conta_id(); $db = psi_db(); $hoje = psi_hoje();
    $mesTxt = (string)($_GET['mes'] ?? substr($hoje, 0, 7)); if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $mesTxt)) psi_erro('Mês inválido.', 422);
    $ini = $mesTxt . '-01'; $fimMes = psi_data_no_mes((int)substr($mesTxt, 0, 4), (int)substr($mesTxt, 5, 2), 31);
    $cs = $db->prepare('SELECT * FROM psi_contas_fin WHERE conta_id = ? AND ativo = 1 ORDER BY ordem, id'); $cs->execute([$c]); $contas = $cs->fetchAll(); $saldos = psi_saldos_contas();
    $saldoCaixa = 0; $divida = 0; $cj = [];
    foreach ($contas as $f) { $sd = $saldos[(int)$f['id']] ?? 0; if ($f['tipo'] === 'cartao') $divida += max(0, -$sd); else $saldoCaixa += $sd; $cj[] = psi_conta_fin_json($f, $sd); }

    $dias = []; for ($d = $ini; $d <= $fimMes; $d = psi_somar_dias($d, 1)) $dias[$d] = ['data' => $d, 'entradas' => 0, 'saidas' => 0, 'previstoEntradas' => 0, 'previstoSaidas' => 0];
    $b = $db->prepare("SELECT b.data, l.tipo, SUM(b.valor) AS v FROM psi_baixas b JOIN psi_lancamentos l ON l.id = b.lancamento_id LEFT JOIN psi_contas_fin f ON f.id = b.conta_fin_id
      WHERE b.conta_id = ? AND b.data >= ? AND b.data <= ? AND (f.tipo IS NULL OR f.tipo <> 'cartao') GROUP BY b.data, l.tipo"); $b->execute([$c, $ini, $fimMes]);
    foreach ($b->fetchAll() as $x) $dias[$x['data']][$x['tipo'] === 'receber' ? 'entradas' : 'saidas'] += (int)$x['v'];
    $t = $db->prepare("SELECT t.data, SUM(t.valor) AS v FROM psi_transferencias t JOIN psi_contas_fin d ON d.id = t.destino_id JOIN psi_contas_fin o ON o.id = t.origem_id
      WHERE t.conta_id = ? AND t.data >= ? AND t.data <= ? AND d.tipo = 'cartao' AND o.tipo <> 'cartao' GROUP BY t.data"); $t->execute([$c, $ini, $fimMes]);
    $faturasPagas = 0; foreach ($t->fetchAll() as $x) { $dias[$x['data']]['saidas'] += (int)$x['v']; $faturasPagas += (int)$x['v']; }
    $g = $db->prepare("SELECT COALESCE(SUM(b.valor), 0) FROM psi_baixas b JOIN psi_lancamentos l ON l.id = b.lancamento_id JOIN psi_contas_fin f ON f.id = b.conta_fin_id WHERE b.conta_id = ? AND l.tipo = 'pagar' AND f.tipo = 'cartao' AND b.data >= ? AND b.data <= ?");
    $g->execute([$c, $ini, $fimMes]); $gastoCartao = (int)$g->fetchColumn();

    /* previsto: o que ainda está em aberto, no dia do vencimento (o atrasado entra em "hoje") */
    $abertos = []; foreach (['receber', 'pagar'] as $tp) foreach (psi_abertos_a_receber($tp) as $a) { $a['tipo'] = $tp; $abertos[] = $a; }
    $eventos = [];
    foreach ($abertos as $a) {
      $dt = $a['vencimento'] < $hoje ? $hoje : $a['vencimento']; $eventos[] = ['data' => $dt, 'tipo' => $a['tipo'], 'valor' => (int)$a['restante'], 'id' => (int)$a['id'], 'atrasado' => $a['vencimento'] < $hoje];
      if ($a['vencimento'] >= $ini && $a['vencimento'] <= $fimMes && $a['vencimento'] >= $hoje) $dias[$a['vencimento']][$a['tipo'] === 'receber' ? 'previstoEntradas' : 'previstoSaidas'] += (int)$a['restante'];
    }
    foreach ($contas as $f) if ($f['tipo'] === 'cartao') {
      $fa = psi_fatura($f, $saldos[(int)$f['id']] ?? 0); if (!$fa) continue;
      if ($fa['fechada'] > 0) $eventos[] = ['data' => max($hoje, $fa['vencimentoFechada']), 'tipo' => 'fatura', 'valor' => $fa['fechada'], 'id' => (int)$f['id'], 'nome' => $f['nome'], 'atrasado' => $fa['vencimentoFechada'] < $hoje];
      if ($fa['aberta'] > 0) $eventos[] = ['data' => max($hoje, $fa['vencimentoAberta']), 'tipo' => 'fatura', 'valor' => $fa['aberta'], 'id' => (int)$f['id'], 'nome' => $f['nome'], 'atrasado' => false];
    }
    foreach ($eventos as $e) if ($e['tipo'] === 'fatura' && $e['data'] >= $ini && $e['data'] <= $fimMes && $e['data'] >= $hoje && !$e['atrasado']) $dias[$e['data']]['previstoSaidas'] += $e['valor'];

    /* projeção de saldo dos próximos 60 dias: entradas atrasadas ficam de fora (incerteza), saídas atrasadas entram hoje */
    $proj = []; $saldo = $saldoCaixa; $menor = ['data' => $hoje, 'saldo' => $saldoCaixa];
    for ($i = 0; $i <= 60; $i++) {
      $d = psi_somar_dias($hoje, $i); $ent = 0; $sai = 0;
      foreach ($eventos as $e) if ($e['data'] === $d) { if ($e['tipo'] === 'receber') { if (!$e['atrasado']) $ent += $e['valor']; } else $sai += $e['valor']; }
      $saldo += $ent - $sai; $proj[] = ['data' => $d, 'saldo' => $saldo, 'entradas' => $ent, 'saidas' => $sai]; if ($saldo < $menor['saldo']) $menor = ['data' => $d, 'saldo' => $saldo];
    }
    /* próximos 14 dias, com descrição */
    $ate14 = psi_somar_dias($hoje, 14); $prox = array_values(array_filter($eventos, fn($e) => $e['data'] <= $ate14 && !($e['tipo'] === 'receber' && $e['atrasado']))); usort($prox, fn($a, $b) => strcmp($a['data'], $b['data']));
    $ids = array_values(array_filter(array_map(fn($e) => $e['tipo'] === 'fatura' ? null : $e['id'], $prox)));
    $desc = []; if ($ids) { $q = $db->prepare('SELECT l.id, l.descricao, p.nome FROM psi_lancamentos l LEFT JOIN psi_pacientes p ON p.id = l.paciente_id WHERE l.conta_id = ? AND l.id IN (' . psi_marcadores($ids) . ')'); $q->execute(array_merge([$c], $ids)); foreach ($q->fetchAll() as $x) $desc[(int)$x['id']] = $x; }
    $proximos = array_map(fn($e) => ['data' => $e['data'], 'tipo' => $e['tipo'], 'valor' => $e['valor'], 'atrasado' => $e['atrasado'], 'descricao' => $e['tipo'] === 'fatura' ? 'Fatura do cartão ' . $e['nome'] : ($desc[$e['id']]['descricao'] ?? ''), 'quem' => $e['tipo'] === 'fatura' ? null : ($desc[$e['id']]['nome'] ?? null), 'lancamentoId' => $e['tipo'] === 'fatura' ? null : $e['id']], $prox);

    $lista = array_values($dias); $sum = fn(string $k) => array_sum(array_column($lista, $k));
    return ['mes' => $mesTxt, 'contas' => $cj, 'saldoCaixa' => $saldoCaixa, 'dividaCartoes' => $divida, 'dias' => $lista,
      'totais' => ['entradas' => $sum('entradas'), 'saidas' => $sum('saidas'), 'previstoEntradas' => $sum('previstoEntradas'), 'previstoSaidas' => $sum('previstoSaidas'), 'gastoCartao' => $gastoCartao, 'faturasPagas' => $faturasPagas],
      'projecao' => $proj, 'menorSaldo' => $menor, 'proximos' => $proximos];
  });
}
