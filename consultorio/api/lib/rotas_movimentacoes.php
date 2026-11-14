<?php
/**
 * Movimentações bancárias: o que entrou e saiu das contas, dia a dia, com o saldo e o que ainda falta conciliar com o extrato do banco.
 * - "Movimento" = pagamento/recebimento (baixa) ou transferência registrados no sistema. Só entram os que contam no saldo (data >= data do saldo inicial da conta),
 *   então a coluna de saldo fecha com o saldo de "Contas e cartões".
 * - O saldo ao fim de cada dia é calculado de trás para frente a partir do saldo de hoje (saldo atual − o que aconteceu depois daquele dia).
 * - "Não conciliado" = linhas do extrato importado que ainda estão pendentes (nem ligadas a um pagamento, nem ignoradas), pela data da linha.
 * - Escopo: uma conta ou "todas". "Todas" = contas de caixa ativas (banco, carteira, plataforma); cartão de crédito fica de fora, como no fluxo de caixa,
 *   e a dívida dele é informada à parte. Transferência entre duas contas do escopo não é entrada nem saída (só muda o dinheiro de lugar).
 */
declare(strict_types=1);

const PSI_MOV_LIMITE = 3000;      // movimentos (e linhas pendentes) devolvidos por mês; acima disso a resposta avisa que foi cortada
const PSI_MOV_MESES_PENDENTES = 36;

/** Quanto cada dia mudou o saldo do escopo (centavos, com sinal), de $desde em diante. [data => variação]. Só o que conta no saldo de cada conta. */
function psi_mov_variacao_por_dia(array $escopo, string $desde): array {
  $c = psi_conta_id(); $db = psi_db(); $in = psi_marcadores($escopo); $v = [];
  $q = $db->prepare("SELECT b.data, SUM(CASE WHEN l.tipo = 'receber' THEN b.valor ELSE -b.valor END) AS v FROM psi_baixas b JOIN psi_lancamentos l ON l.id = b.lancamento_id JOIN psi_contas_fin f ON f.id = b.conta_fin_id
    WHERE b.conta_id = ? AND b.conta_fin_id IN ($in) AND b.data >= f.data_saldo AND b.data >= ? GROUP BY b.data");
  $q->execute(array_merge([$c], $escopo, [$desde]));
  foreach ($q->fetchAll() as $x) $v[$x['data']] = ($v[$x['data']] ?? 0) + (int)$x['v'];
  foreach ([['destino_id', 1], ['origem_id', -1]] as [$lado, $sinal]) {
    $q = $db->prepare("SELECT t.data, SUM(t.valor) AS v FROM psi_transferencias t JOIN psi_contas_fin f ON f.id = t.$lado WHERE t.conta_id = ? AND t.$lado IN ($in) AND t.data >= f.data_saldo AND t.data >= ? GROUP BY t.data");
    $q->execute(array_merge([$c], $escopo, [$desde]));
    foreach ($q->fetchAll() as $x) $v[$x['data']] = ($v[$x['data']] ?? 0) + $sinal * (int)$x['v'];
  }
  return $v;
}

/** Texto e valor de uma transferência vista do escopo. Devolve [descrição, efeito no saldo do escopo, interna?, conta do escopo (id, nome)] ou null se não conta no saldo. */
function psi_mov_transferencia(array $t, array $escopo, array $contas): ?array {
  $o = $contas[(int)$t['origem_id']] ?? null; $d = $contas[(int)$t['destino_id']] ?? null; if (!$o || !$d) return null;
  $oDentro = in_array((int)$o['id'], $escopo, true) && $t['data'] >= $o['data_saldo']; $dDentro = in_array((int)$d['id'], $escopo, true) && $t['data'] >= $d['data_saldo'];
  if (!$oDentro && !$dDentro) return null;
  $valor = (int)$t['valor']; $efeito = ($dDentro ? $valor : 0) - ($oDentro ? $valor : 0); $interna = in_array((int)$o['id'], $escopo, true) && in_array((int)$d['id'], $escopo, true);
  $obs = $t['obs'] !== null && $t['obs'] !== '' ? ' · ' . $t['obs'] : '';
  if ($interna) $desc = 'Transferência entre contas: ' . $o['nome'] . ' → ' . $d['nome'] . $obs;
  elseif ($d['tipo'] === 'cartao' && $o['tipo'] !== 'cartao') $desc = 'Pagamento da fatura do cartão ' . $d['nome'] . $obs;
  elseif ($efeito > 0) $desc = 'Transferência recebida de ' . $o['nome'] . $obs;
  else $desc = 'Transferência enviada para ' . $d['nome'] . $obs;
  $minha = $dDentro && !$oDentro ? $d : ($oDentro ? $o : $d);
  return [$desc, $efeito, $interna, $minha];
}

function psi_registrar_rotas_movimentacoes(PsiRoteador $r): void {
  $r->add('GET', 'movimentacoes', function () {
    $c = psi_conta_id(); $db = psi_db(); $hoje = psi_hoje();
    $mes = (string)($_GET['mes'] ?? substr($hoje, 0, 7)); if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $mes) || $mes < '2000-01' || $mes > '2100-12') psi_erro('Mês inválido.', 422);
    $ini = $mes . '-01'; $fim = psi_data_no_mes((int)substr($mes, 0, 4), (int)substr($mes, 5, 2), 31);

    $s = $db->prepare('SELECT * FROM psi_contas_fin WHERE conta_id = ? ORDER BY ativo DESC, ordem, id'); $s->execute([$c]);
    $todas = $s->fetchAll(); $contas = []; foreach ($todas as $f) $contas[(int)$f['id']] = $f;
    $saldos = psi_saldos_contas();
    $pc = $db->prepare("SELECT conta_fin_id, COUNT(*) AS q, COALESCE(SUM(ABS(valor)), 0) AS t FROM psi_extrato_itens WHERE conta_id = ? AND situacao = 'pendente' GROUP BY conta_fin_id"); $pc->execute([$c]);
    $pend = []; foreach ($pc->fetchAll() as $x) $pend[(int)$x['conta_fin_id']] = ['qtd' => (int)$x['q'], 'total' => (int)$x['t']];
    $lista = array_map(fn($f) => ['id' => (int)$f['id'], 'nome' => $f['nome'], 'tipo' => $f['tipo'], 'banco' => $f['banco'], 'ativo' => (bool)$f['ativo'], 'saldo' => $saldos[(int)$f['id']] ?? 0,
      'pendentes' => $pend[(int)$f['id']] ?? ['qtd' => 0, 'total' => 0]], $todas);

    $divida = 0; foreach ($todas as $f) if ($f['ativo'] && $f['tipo'] === 'cartao') $divida += max(0, -($saldos[(int)$f['id']] ?? 0));
    $pedida = (string)($_GET['conta'] ?? 'todas');
    if ($pedida === '' || $pedida === 'todas') { $escopo = []; foreach ($todas as $f) if ($f['ativo'] && $f['tipo'] !== 'cartao') $escopo[] = (int)$f['id']; $unica = null; }
    else { $unica = psi_da_conta('psi_contas_fin', $pedida, 'Conta', true); $escopo = [$unica]; }

    $vazio = ['mes' => $mes, 'conta' => $unica, 'contas' => $lista, 'saldo' => 0, 'saldoAbertura' => 0, 'dividaCartoes' => $divida, 'cartoesForaDoTotal' => $unica === null && $divida > 0,
      'totais' => ['entradas' => 0, 'saidas' => 0, 'liquido' => 0, 'movimentos' => 0], 'naoConciliado' => ['qtd' => 0, 'entradas' => 0, 'saidas' => 0, 'total' => 0, 'dias' => 0],
      'pendentes' => ['qtd' => 0, 'entradas' => 0, 'saidas' => 0, 'total' => 0, 'maisAntiga' => null, 'foraDoMes' => ['qtd' => 0, 'total' => 0], 'porMes' => []], 'dias' => [], 'truncado' => false];
    if (!$escopo) return $vazio;
    $in = psi_marcadores($escopo);

    /* saldo de hoje e variação por dia (para o saldo ao fim de cada dia, de trás para frente) */
    $saldoAtual = 0; foreach ($escopo as $id) $saldoAtual += $saldos[$id] ?? 0;
    $variacao = psi_mov_variacao_por_dia($escopo, $ini); krsort($variacao);
    $desdeIni = array_sum($variacao); $saldoAbertura = $saldoAtual - $desdeIni;

    /* movimentos do mês */
    $dias = []; $novoDia = fn(string $d) => ['data' => $d, 'entradas' => 0, 'saidas' => 0, 'movimentos' => [], 'pendentes' => [], 'naoConciliado' => ['qtd' => 0, 'entradas' => 0, 'saidas' => 0, 'total' => 0]];
    $truncado = false; $nMov = 0;
    $b = $db->prepare("SELECT b.id, b.data, b.valor, b.forma, l.id AS lancamento_id, l.tipo, l.descricao, COALESCE(pc.nome, l.contraparte) AS quem, cat.nome AS categoria, f.id AS conta_fin_id, f.nome AS conta_nome,
        EXISTS (SELECT 1 FROM psi_extrato_itens e WHERE e.conta_id = b.conta_id AND e.baixa_id = b.id) AS conciliado
      FROM psi_baixas b JOIN psi_lancamentos l ON l.id = b.lancamento_id JOIN psi_contas_fin f ON f.id = b.conta_fin_id LEFT JOIN psi_pacientes pc ON pc.id = l.paciente_id LEFT JOIN psi_categorias cat ON cat.id = l.categoria_id
      WHERE b.conta_id = ? AND b.conta_fin_id IN ($in) AND b.data >= f.data_saldo AND b.data >= ? AND b.data <= ? ORDER BY b.data, b.id LIMIT " . (PSI_MOV_LIMITE + 1));
    $b->execute(array_merge([$c], $escopo, [$ini, $fim]));
    foreach ($b->fetchAll() as $x) {
      if (++$nMov > PSI_MOV_LIMITE) { $truncado = true; break; }
      $d = $x['data']; $dias[$d] ??= $novoDia($d); $entrada = $x['tipo'] === 'receber'; $v = (int)$x['valor'];
      $dias[$d][$entrada ? 'entradas' : 'saidas'] += $v;
      $dias[$d]['movimentos'][] = ['origem' => 'baixa', 'id' => (int)$x['id'], 'tipo' => $x['tipo'], 'lancamentoId' => (int)$x['lancamento_id'], 'descricao' => $x['descricao'], 'quem' => $x['quem'], 'categoria' => $x['categoria'],
        'forma' => $x['forma'], 'contaId' => (int)$x['conta_fin_id'], 'conta' => $x['conta_nome'], 'valor' => $entrada ? $v : -$v, 'interna' => false, 'conciliado' => (bool)$x['conciliado']];
    }
    $t = $db->prepare("SELECT t.*, EXISTS (SELECT 1 FROM psi_extrato_itens e WHERE e.conta_id = t.conta_id AND e.transferencia_id = t.id) AS conciliado FROM psi_transferencias t
      WHERE t.conta_id = ? AND (t.origem_id IN ($in) OR t.destino_id IN ($in)) AND t.data >= ? AND t.data <= ? ORDER BY t.data, t.id LIMIT " . (PSI_MOV_LIMITE + 1));
    $t->execute(array_merge([$c], $escopo, $escopo, [$ini, $fim]));
    foreach ($t->fetchAll() as $x) {
      $m = psi_mov_transferencia($x, $escopo, $contas); if (!$m) continue;
      if (++$nMov > PSI_MOV_LIMITE) { $truncado = true; break; }
      [$desc, $efeito, $interna, $minha] = $m; $d = $x['data']; $dias[$d] ??= $novoDia($d);
      if (!$interna) { if ($efeito > 0) $dias[$d]['entradas'] += $efeito; else $dias[$d]['saidas'] += -$efeito; }
      $dias[$d]['movimentos'][] = ['origem' => 'transferencia', 'id' => (int)$x['id'], 'tipo' => 'transferencia', 'lancamentoId' => null, 'descricao' => $desc, 'quem' => null, 'categoria' => null, 'forma' => null,
        'contaId' => (int)$minha['id'], 'conta' => $minha['nome'], 'valor' => $interna ? (int)$x['valor'] : $efeito, 'interna' => $interna, 'conciliado' => (bool)$x['conciliado']];
    }

    /* linhas do extrato ainda não conciliadas, pela data da linha */
    $e = $db->prepare("SELECT i.id, i.extrato_id, i.conta_fin_id, i.data, i.valor, i.descricao, f.nome AS conta_nome FROM psi_extrato_itens i JOIN psi_contas_fin f ON f.id = i.conta_fin_id
      WHERE i.conta_id = ? AND i.situacao = 'pendente' AND i.conta_fin_id IN ($in) AND i.data >= ? AND i.data <= ? ORDER BY i.data, i.id LIMIT " . (PSI_MOV_LIMITE + 1));
    $e->execute(array_merge([$c], $escopo, [$ini, $fim])); $nPend = 0; $nc = ['qtd' => 0, 'entradas' => 0, 'saidas' => 0, 'total' => 0, 'dias' => 0];
    foreach ($e->fetchAll() as $x) {
      if (++$nPend > PSI_MOV_LIMITE) { $truncado = true; break; }
      $d = $x['data']; $dias[$d] ??= $novoDia($d); $v = (int)$x['valor'];
      $dias[$d]['pendentes'][] = ['id' => (int)$x['id'], 'extratoId' => (int)$x['extrato_id'], 'contaId' => (int)$x['conta_fin_id'], 'conta' => $x['conta_nome'], 'descricao' => $x['descricao'], 'valor' => $v];
      $n = &$dias[$d]['naoConciliado']; $n['qtd']++; if ($v > 0) $n['entradas'] += $v; else $n['saidas'] += -$v; $n['total'] += abs($v); unset($n);
      $nc['qtd']++; if ($v > 0) $nc['entradas'] += $v; else $nc['saidas'] += -$v; $nc['total'] += abs($v);
    }

    /* saldo ao fim de cada dia (de trás para frente) e o resumo do mês */
    krsort($dias); $lista_dias = []; $tot = ['entradas' => 0, 'saidas' => 0, 'liquido' => 0, 'movimentos' => 0];
    foreach ($dias as $d => $dia) {
      $depois = 0; foreach ($variacao as $dv => $vv) if ($dv > $d) $depois += $vv;
      $dia['saldoFim'] = $saldoAtual - $depois; $dia['liquido'] = $dia['entradas'] - $dia['saidas'];
      if ($dia['naoConciliado']['qtd'] > 0) $nc['dias']++;
      $tot['entradas'] += $dia['entradas']; $tot['saidas'] += $dia['saidas']; $tot['movimentos'] += count($dia['movimentos']);
      $lista_dias[] = $dia;
    }
    $tot['liquido'] = $tot['entradas'] - $tot['saidas'];

    /* pendências no total (todas as datas) e por mês, para avisar do que está fora do mês aberto */
    $g = $db->prepare("SELECT COUNT(*) AS q, COALESCE(SUM(CASE WHEN valor > 0 THEN valor ELSE 0 END), 0) AS e, COALESCE(SUM(CASE WHEN valor < 0 THEN -valor ELSE 0 END), 0) AS s, MIN(data) AS antiga
      FROM psi_extrato_itens WHERE conta_id = ? AND situacao = 'pendente' AND conta_fin_id IN ($in)"); $g->execute(array_merge([$c], $escopo)); $geral = $g->fetch();
    $pm = $db->prepare("SELECT SUBSTR(data, 1, 7) AS mes, COUNT(*) AS q, SUM(ABS(valor)) AS t FROM psi_extrato_itens WHERE conta_id = ? AND situacao = 'pendente' AND conta_fin_id IN ($in) GROUP BY SUBSTR(data, 1, 7) ORDER BY mes DESC LIMIT " . PSI_MOV_MESES_PENDENTES);
    $pm->execute(array_merge([$c], $escopo)); $porMes = array_map(fn($x) => ['mes' => $x['mes'], 'qtd' => (int)$x['q'], 'total' => (int)$x['t']], $pm->fetchAll());
    $doMes = null; foreach ($porMes as $x) if ($x['mes'] === $mes) $doMes = $x;
    $totalGeral = (int)$geral['e'] + (int)$geral['s'];

    return ['mes' => $mes, 'conta' => $unica, 'contas' => $lista, 'saldo' => $saldoAtual, 'saldoAbertura' => $saldoAbertura, 'dividaCartoes' => $divida, 'cartoesForaDoTotal' => $unica === null && $divida > 0,
      'totais' => $tot, 'naoConciliado' => $nc,
      'pendentes' => ['qtd' => (int)$geral['q'], 'entradas' => (int)$geral['e'], 'saidas' => (int)$geral['s'], 'total' => $totalGeral, 'maisAntiga' => $geral['antiga'],
        'foraDoMes' => ['qtd' => (int)$geral['q'] - ($doMes['qtd'] ?? 0), 'total' => $totalGeral - ($doMes['total'] ?? 0)], 'porMes' => $porMes],
      'dias' => $lista_dias, 'truncado' => $truncado];
  });
}
