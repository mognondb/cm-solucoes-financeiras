<?php
/**
 * Movimentações bancárias: o que entrou e saiu das contas, dia a dia, com o saldo e o que ainda falta conciliar com o extrato do banco.
 * - "Movimento" = pagamento/recebimento (baixa) ou transferência registrados no sistema. TODOS aparecem, mesmo os de antes da data do saldo inicial da conta:
 *   o saldo da conta só conta o que veio a partir dessa data (a regra de "Contas e cartões"), então os anteriores saem marcados como `foraDoSaldo` e não mexem no saldo.
 *   Quem cria a conta sem informar a data fica com "hoje" e, ao importar um extrato ou lançar pagamentos de dias passados, teria esses movimentos escondidos.
 * - O saldo ao fim de cada dia é calculado de trás para frente, conta a conta, a partir do saldo de hoje (saldo atual − o que aconteceu depois daquele dia).
 *   Em dias anteriores à data do saldo inicial de uma conta ela ainda não tinha saldo: fica de fora da soma (`saldoParcial`), e se nenhuma conta do escopo tinha, `saldoFim` é null.
 *   No dia do saldo inicial entra uma linha "Saldo inicial" (`saldoInicial`), o ponto de partida do saldo, que não é entrada nem saída.
 * - "Não conciliado" = linhas do extrato importado que ainda estão pendentes (nem ligadas a um pagamento, nem ignoradas), pela data da linha.
 * - Escopo: uma conta ou "todas". "Todas" = contas de caixa ativas (banco, carteira, plataforma); cartão de crédito fica de fora, como no fluxo de caixa,
 *   e a dívida dele é informada à parte. Transferência entre duas contas do escopo não é entrada nem saída (só muda o dinheiro de lugar).
 */
declare(strict_types=1);

const PSI_MOV_LIMITE = 3000;      // movimentos (e linhas pendentes) devolvidos por mês; acima disso a resposta avisa que foi cortada
const PSI_MOV_MESES_PENDENTES = 36;

/** Quanto cada dia mudou o saldo de cada conta do escopo (centavos, com sinal), de $desde em diante: [contaFinId][data] => variação. Só o que conta no saldo da conta (data >= data do saldo inicial). */
function psi_mov_variacao_por_dia(array $escopo, string $desde): array {
  $c = psi_conta_id(); $db = psi_db(); $in = psi_marcadores($escopo); $v = [];
  $q = $db->prepare("SELECT b.conta_fin_id AS cid, b.data, SUM(CASE WHEN l.tipo = 'receber' THEN b.valor ELSE -b.valor END) AS v FROM psi_baixas b JOIN psi_lancamentos l ON l.id = b.lancamento_id JOIN psi_contas_fin f ON f.id = b.conta_fin_id
    WHERE b.conta_id = ? AND b.conta_fin_id IN ($in) AND b.data >= f.data_saldo AND b.data >= ? GROUP BY b.conta_fin_id, b.data");
  $q->execute(array_merge([$c], $escopo, [$desde]));
  foreach ($q->fetchAll() as $x) $v[(int)$x['cid']][$x['data']] = ($v[(int)$x['cid']][$x['data']] ?? 0) + (int)$x['v'];
  foreach ([['destino_id', 1], ['origem_id', -1]] as [$lado, $sinal]) {
    $q = $db->prepare("SELECT t.$lado AS cid, t.data, SUM(t.valor) AS v FROM psi_transferencias t JOIN psi_contas_fin f ON f.id = t.$lado WHERE t.conta_id = ? AND t.$lado IN ($in) AND t.data >= f.data_saldo AND t.data >= ? GROUP BY t.$lado, t.data");
    $q->execute(array_merge([$c], $escopo, [$desde]));
    foreach ($q->fetchAll() as $x) $v[(int)$x['cid']][$x['data']] = ($v[(int)$x['cid']][$x['data']] ?? 0) + $sinal * (int)$x['v'];
  }
  return $v;
}

/** Texto e valor de uma transferência vista do escopo. Devolve [descrição, efeito no escopo, interna?, conta do escopo, fora do saldo?] ou null se nenhuma ponta é do escopo.
    "Fora do saldo" = nenhuma das pontas do escopo já tinha saldo inicial na data (a transferência aparece, mas não entrou no saldo). */
function psi_mov_transferencia(array $t, array $escopo, array $contas): ?array {
  $o = $contas[(int)$t['origem_id']] ?? null; $d = $contas[(int)$t['destino_id']] ?? null; if (!$o || !$d) return null;
  $oDentro = in_array((int)$o['id'], $escopo, true); $dDentro = in_array((int)$d['id'], $escopo, true); if (!$oDentro && !$dDentro) return null;
  $conta = ($oDentro && $t['data'] >= $o['data_saldo']) || ($dDentro && $t['data'] >= $d['data_saldo']);
  $valor = (int)$t['valor']; $efeito = ($dDentro ? $valor : 0) - ($oDentro ? $valor : 0); $interna = $oDentro && $dDentro;
  $obs = $t['obs'] !== null && $t['obs'] !== '' ? ' · ' . $t['obs'] : '';
  if ($interna) $desc = 'Transferência entre contas: ' . $o['nome'] . ' → ' . $d['nome'] . $obs;
  elseif ($d['tipo'] === 'cartao' && $o['tipo'] !== 'cartao') $desc = 'Pagamento da fatura do cartão ' . $d['nome'] . $obs;
  elseif ($efeito > 0) $desc = 'Transferência recebida de ' . $o['nome'] . $obs;
  else $desc = 'Transferência enviada para ' . $d['nome'] . $obs;
  $minha = $dDentro && !$oDentro ? $d : ($oDentro ? $o : $d);
  return [$desc, $efeito, $interna, $minha, !$conta];
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
      'saldoInicial' => (int)$f['saldo_inicial'], 'dataSaldo' => $f['data_saldo'], 'pendentes' => $pend[(int)$f['id']] ?? ['qtd' => 0, 'total' => 0]], $todas);

    $divida = 0; foreach ($todas as $f) if ($f['ativo'] && $f['tipo'] === 'cartao') $divida += max(0, -($saldos[(int)$f['id']] ?? 0));
    $pedida = (string)($_GET['conta'] ?? 'todas');
    if ($pedida === '' || $pedida === 'todas') { $escopo = []; foreach ($todas as $f) if ($f['ativo'] && $f['tipo'] !== 'cartao') $escopo[] = (int)$f['id']; $unica = null; }
    else { $unica = psi_da_conta('psi_contas_fin', $pedida, 'Conta', true); $escopo = [$unica]; }

    $vazio = ['mes' => $mes, 'conta' => $unica, 'contas' => $lista, 'saldo' => 0, 'saldoAbertura' => 0, 'dividaCartoes' => $divida, 'cartoesForaDoTotal' => $unica === null && $divida > 0,
      'totais' => ['entradas' => 0, 'saidas' => 0, 'liquido' => 0, 'movimentos' => 0], 'naoConciliado' => ['qtd' => 0, 'entradas' => 0, 'saidas' => 0, 'total' => 0, 'dias' => 0],
      'pendentes' => ['qtd' => 0, 'entradas' => 0, 'saidas' => 0, 'total' => 0, 'maisAntiga' => null, 'foraDoMes' => ['qtd' => 0, 'total' => 0], 'porMes' => []], 'foraDoSaldo' => ['qtd' => 0, 'contas' => []], 'dias' => [], 'truncado' => false];
    if (!$escopo) return $vazio;
    $in = psi_marcadores($escopo);

    /* saldo de hoje e variação por dia de cada conta, para o saldo ao fim de cada dia (de trás para frente) */
    $saldoAtual = 0; foreach ($escopo as $id) $saldoAtual += $saldos[$id] ?? 0;
    $variacao = psi_mov_variacao_por_dia($escopo, $ini);
    /* saldo de uma conta ao fim do dia $data: o de hoje menos o que aconteceu depois. Antes da data do saldo inicial ela ainda não tinha saldo (null). */
    $saldoDaConta = function (int $id, string $data) use ($saldos, $variacao, $contas): ?int {
      if ($contas[$id]['data_saldo'] > $data) return null;
      $depois = 0; foreach ($variacao[$id] ?? [] as $dv => $vv) if ($dv > $data) $depois += $vv;
      return ($saldos[$id] ?? 0) - $depois;
    };
    /* primeiro movimento de cada conta (de qualquer data): uma conta que ainda não tinha saldo num dia só deixa o total "parcial" se tem saldo inicial ou já tinha movimento até ali (a "Dinheiro" vazia não conta) */
    $pm0 = $db->prepare("SELECT cid, MIN(data) AS d FROM (SELECT conta_fin_id AS cid, data FROM psi_baixas WHERE conta_id = ? AND conta_fin_id IN ($in) UNION ALL SELECT origem_id, data FROM psi_transferencias WHERE conta_id = ? AND origem_id IN ($in)
      UNION ALL SELECT destino_id, data FROM psi_transferencias WHERE conta_id = ? AND destino_id IN ($in)) x GROUP BY cid");
    $pm0->execute(array_merge([$c], $escopo, [$c], $escopo, [$c], $escopo)); $primeiro = []; foreach ($pm0->fetchAll() as $x) $primeiro[(int)$x['cid']] = $x['d'];
    $relevante = fn(int $id, string $data) => (int)$contas[$id]['saldo_inicial'] !== 0 || (isset($primeiro[$id]) && $primeiro[$id] <= $data);
    /* saldo no início do mês: as contas que já existiam no dia 1 (quem abre no meio do mês entra pela linha "Saldo inicial" do dia) */
    $saldoAbertura = 0;
    foreach ($escopo as $id) if ($contas[$id]['data_saldo'] <= $ini) { $depois = 0; foreach ($variacao[$id] ?? [] as $dv => $vv) if ($dv >= $ini) $depois += $vv; $saldoAbertura += ($saldos[$id] ?? 0) - $depois; }

    /* movimentos do mês */
    $dias = []; $novoDia = fn(string $d) => ['data' => $d, 'entradas' => 0, 'saidas' => 0, 'movimentos' => [], 'saldoInicial' => [], 'pendentes' => [], 'naoConciliado' => ['qtd' => 0, 'entradas' => 0, 'saidas' => 0, 'total' => 0]];
    $truncado = false; $nMov = 0; $fora = [];   // fora: conta → movimentos do mês que a data do saldo inicial deixou de fora do saldo
    $contaFora = function (array $f) use (&$fora) { $id = (int)$f['id']; $fora[$id] ??= ['id' => $id, 'nome' => $f['nome'], 'dataSaldo' => $f['data_saldo'], 'qtd' => 0]; $fora[$id]['qtd']++; };
    $b = $db->prepare("SELECT b.id, b.data, b.valor, b.forma, l.id AS lancamento_id, l.tipo, l.descricao, COALESCE(pc.nome, l.contraparte) AS quem, cat.nome AS categoria, f.id AS conta_fin_id, f.nome AS conta_nome, f.data_saldo,
        EXISTS (SELECT 1 FROM psi_extrato_itens e WHERE e.conta_id = b.conta_id AND e.baixa_id = b.id) AS conciliado
      FROM psi_baixas b JOIN psi_lancamentos l ON l.id = b.lancamento_id JOIN psi_contas_fin f ON f.id = b.conta_fin_id LEFT JOIN psi_pacientes pc ON pc.id = l.paciente_id LEFT JOIN psi_categorias cat ON cat.id = l.categoria_id
      WHERE b.conta_id = ? AND b.conta_fin_id IN ($in) AND b.data >= ? AND b.data <= ? ORDER BY b.data, b.id LIMIT " . (PSI_MOV_LIMITE + 1));
    $b->execute(array_merge([$c], $escopo, [$ini, $fim]));
    foreach ($b->fetchAll() as $x) {
      if (++$nMov > PSI_MOV_LIMITE) { $truncado = true; break; }
      $d = $x['data']; $dias[$d] ??= $novoDia($d); $entrada = $x['tipo'] === 'receber'; $v = (int)$x['valor']; $foraDoSaldo = $d < $x['data_saldo'];
      if ($foraDoSaldo) $contaFora($contas[(int)$x['conta_fin_id']]);
      $dias[$d][$entrada ? 'entradas' : 'saidas'] += $v;
      $dias[$d]['movimentos'][] = ['origem' => 'baixa', 'id' => (int)$x['id'], 'tipo' => $x['tipo'], 'lancamentoId' => (int)$x['lancamento_id'], 'descricao' => $x['descricao'], 'quem' => $x['quem'], 'categoria' => $x['categoria'],
        'forma' => $x['forma'], 'contaId' => (int)$x['conta_fin_id'], 'conta' => $x['conta_nome'], 'valor' => $entrada ? $v : -$v, 'interna' => false, 'conciliado' => (bool)$x['conciliado'], 'foraDoSaldo' => $foraDoSaldo];
    }
    $t = $db->prepare("SELECT t.*, EXISTS (SELECT 1 FROM psi_extrato_itens e WHERE e.conta_id = t.conta_id AND e.transferencia_id = t.id) AS conciliado FROM psi_transferencias t
      WHERE t.conta_id = ? AND (t.origem_id IN ($in) OR t.destino_id IN ($in)) AND t.data >= ? AND t.data <= ? ORDER BY t.data, t.id LIMIT " . (PSI_MOV_LIMITE + 1));
    $t->execute(array_merge([$c], $escopo, $escopo, [$ini, $fim]));
    foreach ($t->fetchAll() as $x) {
      $m = psi_mov_transferencia($x, $escopo, $contas); if (!$m) continue;
      if (++$nMov > PSI_MOV_LIMITE) { $truncado = true; break; }
      [$desc, $efeito, $interna, $minha, $foraDoSaldo] = $m; $d = $x['data']; $dias[$d] ??= $novoDia($d); if ($foraDoSaldo) $contaFora($minha);
      if (!$interna) { if ($efeito > 0) $dias[$d]['entradas'] += $efeito; else $dias[$d]['saidas'] += -$efeito; }
      $dias[$d]['movimentos'][] = ['origem' => 'transferencia', 'id' => (int)$x['id'], 'tipo' => 'transferencia', 'lancamentoId' => null, 'descricao' => $desc, 'quem' => null, 'categoria' => null, 'forma' => null,
        'contaId' => (int)$minha['id'], 'conta' => $minha['nome'], 'valor' => $interna ? (int)$x['valor'] : $efeito, 'interna' => $interna, 'conciliado' => (bool)$x['conciliado'], 'foraDoSaldo' => $foraDoSaldo];
    }

    /* o dia em que uma conta do escopo começa a ter saldo (dentro do mês) ganha a linha "Saldo inicial": de onde o saldo parte */
    foreach ($escopo as $id) { $f = $contas[$id]; if ($f['data_saldo'] >= $ini && $f['data_saldo'] <= $fim && (int)$f['saldo_inicial'] !== 0) { $dd = $f['data_saldo']; $dias[$dd] ??= $novoDia($dd); $dias[$dd]['saldoInicial'][] = ['contaId' => $id, 'conta' => $f['nome'], 'valor' => (int)$f['saldo_inicial']]; } }

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
      $soma = 0; $abertas = 0; $faltam = false; foreach ($escopo as $id) { $sc = $saldoDaConta($id, (string)$d); if ($sc !== null) { $soma += $sc; $abertas++; } elseif ($relevante($id, (string)$d)) $faltam = true; }
      $dia['saldoFim'] = $abertas ? $soma : null; $dia['saldoParcial'] = $abertas > 0 && $faltam; $dia['liquido'] = $dia['entradas'] - $dia['saidas'];
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
      'foraDoSaldo' => ['qtd' => array_sum(array_column($fora, 'qtd')), 'contas' => array_values($fora)],
      'dias' => $lista_dias, 'truncado' => $truncado];
  });
}
