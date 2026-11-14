<?php
/**
 * Extrato bancário: importar as linhas que o navegador leu (OFX, CSV ou Excel) e conciliar cada uma com um pagamento, um lançamento novo,
 * uma transferência entre contas ou ignorar. O arquivo em si nunca chega ao servidor: só as linhas já lidas.
 * Conciliar = registrar a baixa na data do extrato, na conta do extrato; nenhum dinheiro é contado duas vezes (cada linha só vira um movimento).
 */
declare(strict_types=1);

const PSI_MAX_ITENS_EXTRATO = 5000;

/** Texto sem acento, em maiúsculas e com espaços simples, para comparar nomes. */
function psi_norm_texto(string $s): string {
  $s = strtr($s, ['á' => 'a', 'à' => 'a', 'â' => 'a', 'ã' => 'a', 'ä' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'í' => 'i', 'ì' => 'i', 'î' => 'i', 'ï' => 'i', 'ó' => 'o', 'ò' => 'o', 'ô' => 'o', 'õ' => 'o', 'ö' => 'o',
    'ú' => 'u', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ç' => 'c', 'ñ' => 'n', 'Á' => 'A', 'À' => 'A', 'Â' => 'A', 'Ã' => 'A', 'Ä' => 'A', 'É' => 'E', 'È' => 'E', 'Ê' => 'E', 'Ë' => 'E', 'Í' => 'I', 'Ì' => 'I', 'Î' => 'I', 'Ï' => 'I',
    'Ó' => 'O', 'Ò' => 'O', 'Ô' => 'O', 'Õ' => 'O', 'Ö' => 'O', 'Ú' => 'U', 'Ù' => 'U', 'Û' => 'U', 'Ü' => 'U', 'Ç' => 'C', 'Ñ' => 'N']);
  return trim(preg_replace('/\s+/', ' ', mb_strtoupper($s, 'UTF-8')));
}

function psi_item_json(array $i, array $sugestoes = []): array {
  $n = fn($v) => $v === null ? null : (int)$v;
  return ['id' => (int)$i['id'], 'contaFinId' => (int)$i['conta_fin_id'], 'data' => $i['data'], 'valor' => (int)$i['valor'], 'descricao' => $i['descricao'], 'situacao' => $i['situacao'],
    'baixaId' => $n($i['baixa_id']), 'lancamentoId' => $n($i['lancamento_id']), 'transferenciaId' => $n($i['transferencia_id']), 'sugestoes' => $sugestoes];
}
function psi_carregar_item(int $id): array {
  $s = psi_db()->prepare('SELECT * FROM psi_extrato_itens WHERE id = ? AND conta_id = ?'); $s->execute([$id, psi_conta_id()]);
  $i = $s->fetch(); if (!$i) psi_erro('Linha do extrato não encontrada.', 404);
  return $i;
}

/** Até 3 lançamentos em aberto que provavelmente são esta linha: valor igual, nome do paciente/fornecedor na descrição e vencimento próximo. */
function psi_sugerir(array $itens): array {
  if (!$itens) return [];
  $c = psi_conta_id(); $abertos = ['receber' => [], 'pagar' => []];
  $s = psi_db()->prepare("SELECT l.id, l.tipo, l.descricao, l.vencimento, l.contraparte, p.nome AS paciente, p.apelido, l.valor - COALESCE(b.pago, 0) AS restante
    FROM psi_lancamentos l LEFT JOIN (SELECT lancamento_id, SUM(valor) AS pago FROM psi_baixas WHERE conta_id = ? GROUP BY lancamento_id) b ON b.lancamento_id = l.id
    LEFT JOIN psi_pacientes p ON p.id = l.paciente_id AND p.conta_id = l.conta_id WHERE l.conta_id = ? AND l.situacao = 'aberto'"); $s->execute([$c, $c]);
  foreach ($s->fetchAll() as $l) if ((int)$l['restante'] > 0) {
    $nomes = array_filter([$l['paciente'], $l['apelido'], $l['contraparte']]); $tokens = [];
    foreach ($nomes as $nm) foreach (explode(' ', psi_norm_texto($nm)) as $t) if (mb_strlen($t) >= 4 && !in_array($t, ['DOS', 'DAS', 'DE', 'DA', 'DO'], true)) $tokens[$t] = 1;
    $abertos[$l['tipo']][] = ['id' => (int)$l['id'], 'descricao' => $l['descricao'], 'vencimento' => $l['vencimento'], 'restante' => (int)$l['restante'], 'quem' => $l['paciente'] ?: $l['contraparte'], 'tokens' => array_keys($tokens)];
  }
  $saida = [];
  foreach ($itens as $it) {
    $tp = (int)$it['valor'] > 0 ? 'receber' : 'pagar'; $abs = abs((int)$it['valor']); $desc = psi_norm_texto((string)$it['descricao']); $cands = [];
    foreach ($abertos[$tp] as $l) {
      $score = 0; if ($l['restante'] === $abs) $score += 50; elseif ($l['restante'] > $abs) $score += 5;
      $acertos = 0; foreach ($l['tokens'] as $tk) if ($tk !== '' && str_contains($desc, $tk)) $acertos++; $score += min(40, $acertos * 20);
      $dias = abs((strtotime($it['data']) - strtotime($l['vencimento'])) / 86400); $score += $dias <= 3 ? 20 : ($dias <= 15 ? 10 : ($dias <= 45 ? 3 : 0));
      if (($l['restante'] === $abs || $acertos > 0) && $l['restante'] >= $abs) $cands[] = ['lancamentoId' => $l['id'], 'descricao' => $l['descricao'], 'quem' => $l['quem'], 'restante' => $l['restante'], 'vencimento' => $l['vencimento'], 'score' => $score];
    }
    usort($cands, fn($a, $b) => $b['score'] <=> $a['score']); $saida[(int)$it['id']] = array_slice($cands, 0, 3);
  }
  return $saida;
}

function psi_registrar_rotas_extrato(PsiRoteador $r): void {
  /* ---- importar as linhas que o navegador leu ---- */
  $r->add('POST', 'extratos', function () {
    $d = psi_corpo(8 * 1024 * 1024); $db = psi_db(); $c = psi_conta_id();
    $conta = psi_da_conta('psi_contas_fin', $d['contaFinId'] ?? null, 'Conta', true);
    $itens = $d['itens'] ?? null; if (!is_array($itens) || !$itens) psi_erro('Nenhuma linha para importar.', 422);
    if (count($itens) > PSI_MAX_ITENS_EXTRATO) psi_erro('Arquivo grande demais: no máximo ' . PSI_MAX_ITENS_EXTRATO . ' linhas por importação. Importe por períodos.', 422);
    $limpos = []; $ocorrencia = []; $ini = null; $fim = null;
    foreach ($itens as $i => $it) {
      if (!is_array($it)) psi_erro('Linha ' . ($i + 1) . ' inválida.', 422);
      $data = psi_data($it['data'] ?? null, true, 'data da linha ' . ($i + 1)); if ($data < '2000-01-01' || $data > psi_somar_dias(psi_hoje(), 366)) psi_erro('Data fora do intervalo na linha ' . ($i + 1) . '.', 422);
      $valor = psi_int($it['valor'] ?? null, -2000000000, 2000000000, 'valor da linha ' . ($i + 1), true); if ($valor === 0) continue;
      $desc = mb_substr(trim(preg_replace('/\s+/', ' ', (string)($it['descricao'] ?? ''))), 0, 200); if ($desc === '') $desc = 'Sem descrição';
      $fitid = mb_substr((string)($it['id'] ?? ''), 0, 60);
      $chave = $data . '|' . $valor . '|' . psi_norm_texto($desc) . '|' . $fitid; $ocorrencia[$chave] = ($ocorrencia[$chave] ?? 0) + 1;   // duas linhas iguais no mesmo arquivo são lançamentos diferentes
      $limpos[] = ['data' => $data, 'valor' => $valor, 'desc' => $desc, 'hash' => sha1($chave . '|' . $ocorrencia[$chave])];
      $ini = $ini === null || $data < $ini ? $data : $ini; $fim = $fim === null || $data > $fim ? $data : $fim;
    }
    if (!$limpos) psi_erro('Todas as linhas estavam zeradas ou vazias.', 422);
    $agora = psi_agora(); $db->beginTransaction();
    try {
      $db->prepare('INSERT INTO psi_extratos (conta_id, conta_fin_id, arquivo, periodo_ini, periodo_fim, qtd, novos, criado_em) VALUES (?,?,?,?,?,?,0,?)')->execute([$c, $conta, psi_txt($d['arquivo'] ?? null, 120), $ini, $fim, count($limpos), $agora]);
      $extId = (int)$db->lastInsertId();
      $ins = $db->prepare('INSERT IGNORE INTO psi_extrato_itens (conta_id, extrato_id, conta_fin_id, data, valor, descricao, hash, situacao, criado_em) VALUES (?,?,?,?,?,?,?,\'pendente\',?)'); $novos = 0;
      foreach ($limpos as $l) { $ins->execute([$c, $extId, $conta, $l['data'], $l['valor'], $l['desc'], $l['hash'], $agora]); $novos += $ins->rowCount(); }
      $db->prepare('UPDATE psi_extratos SET novos = ? WHERE id = ?')->execute([$novos, $extId]); $db->commit();
    } catch (Throwable $e) { if ($db->inTransaction()) $db->rollBack(); throw $e; }
    psi_auditar('importar', 'extrato', $extId, ['linhas' => count($limpos), 'novas' => $novos]);
    return ['extratoId' => $extId, 'total' => count($limpos), 'novos' => $novos, 'duplicados' => count($limpos) - $novos, 'periodo' => ['ini' => $ini, 'fim' => $fim]];
  });

  $r->add('GET', 'extratos', function () {
    $conta = psi_int($_GET['contaFin'] ?? null, 1, null, 'conta'); $onde = 'e.conta_id = ?'; $par = [psi_conta_id()]; if ($conta !== null) { $onde .= ' AND e.conta_fin_id = ?'; $par[] = $conta; }
    $s = psi_db()->prepare("SELECT e.*, f.nome AS conta FROM psi_extratos e JOIN psi_contas_fin f ON f.id = e.conta_fin_id WHERE $onde ORDER BY e.id DESC LIMIT 50"); $s->execute($par);
    return ['itens' => array_map(fn($e) => ['id' => (int)$e['id'], 'contaFinId' => (int)$e['conta_fin_id'], 'conta' => $e['conta'], 'arquivo' => $e['arquivo'], 'periodoIni' => $e['periodo_ini'], 'periodoFim' => $e['periodo_fim'], 'qtd' => (int)$e['qtd'], 'novos' => (int)$e['novos'], 'criadoEm' => $e['criado_em']], $s->fetchAll())];
  });

  /* ---- linhas do extrato, com sugestões para as pendentes ---- */
  $r->add('GET', 'extrato-itens', function () {
    $c = psi_conta_id(); $conta = psi_da_conta('psi_contas_fin', $_GET['contaFin'] ?? null, 'Conta', true);
    $sit = psi_opcao($_GET['situacao'] ?? null, ['pendente', 'conciliado', 'ignorado', 'todos'], 'pendente'); $onde = ['conta_id = ?', 'conta_fin_id = ?']; $par = [$c, $conta];
    if ($sit !== 'todos') { $onde[] = 'situacao = ?'; $par[] = $sit; }
    if (($de = psi_data($_GET['de'] ?? null, false, 'de')) !== null) { $onde[] = 'data >= ?'; $par[] = $de; } if (($ate = psi_data($_GET['ate'] ?? null, false, 'até')) !== null) { $onde[] = 'data <= ?'; $par[] = $ate; }
    $lim = psi_int($_GET['limite'] ?? 300, 1, 1000, 'limite') ?? 300;
    $s = psi_db()->prepare('SELECT * FROM psi_extrato_itens WHERE ' . implode(' AND ', $onde) . " ORDER BY data DESC, id DESC LIMIT $lim"); $s->execute($par); $linhas = $s->fetchAll();
    $sug = $sit === 'pendente' || $sit === 'todos' ? psi_sugerir(array_values(array_filter($linhas, fn($l) => $l['situacao'] === 'pendente'))) : [];
    $cont = psi_db()->prepare('SELECT situacao, COUNT(*) FROM psi_extrato_itens WHERE conta_id = ? AND conta_fin_id = ? GROUP BY situacao'); $cont->execute([$c, $conta]);
    return ['itens' => array_map(fn($l) => psi_item_json($l, $sug[(int)$l['id']] ?? []), $linhas), 'contagem' => $cont->fetchAll(PDO::FETCH_KEY_PAIR)];
  });

  /* ---- conciliar com uma conta a receber/pagar em aberto (baixa total ou parcial) ---- */
  $r->add('POST', 'extrato-itens/{id}/conciliar', function ($p) {
    $id = (int)$p['id']; $it = psi_carregar_item($id); $d = psi_corpo(); $db = psi_db(); $c = psi_conta_id();
    if ($it['situacao'] !== 'pendente') psi_erro('Esta linha já foi tratada.', 409);
    $lid = psi_da_conta('psi_lancamentos', $d['lancamentoId'] ?? null, 'Lançamento', true); $abs = abs((int)$it['valor']);
    $db->beginTransaction();
    try {
      $s = $db->prepare('SELECT tipo, valor, situacao FROM psi_lancamentos WHERE id = ? AND conta_id = ? FOR UPDATE'); $s->execute([$lid, $c]); $l = $s->fetch();
      if (!$l || $l['situacao'] !== 'aberto') { $db->rollBack(); psi_erro('Este lançamento não está em aberto.', 409); }
      if (($l['tipo'] === 'receber') !== ((int)$it['valor'] > 0)) { $db->rollBack(); psi_erro($l['tipo'] === 'receber' ? 'Uma cobrança a receber só concilia com uma entrada do extrato.' : 'Uma conta a pagar só concilia com uma saída do extrato.', 422); }
      $rest = (int)$l['valor'] - psi_pago_do_lancamento($lid);
      if ($abs > $rest) { $db->rollBack(); psi_erro('O valor da linha (R$ ' . number_format($abs / 100, 2, ',', '.') . ') é maior que o saldo do lançamento (R$ ' . number_format($rest / 100, 2, ',', '.') . '). Use "Lançar" para criar um novo.', 422); }
      $db->prepare('INSERT INTO psi_baixas (conta_id, lancamento_id, data, valor, conta_fin_id, obs, criado_em) VALUES (?,?,?,?,?,?,?)')->execute([$c, $lid, $it['data'], $abs, (int)$it['conta_fin_id'], 'Conciliado com o extrato', psi_agora()]);
      $baixa = (int)$db->lastInsertId(); psi_recalcular_situacao($lid);
      $db->prepare("UPDATE psi_extrato_itens SET situacao = 'conciliado', baixa_id = ?, lancamento_id = ? WHERE id = ? AND conta_id = ?")->execute([$baixa, $lid, $id, $c]); $db->commit();
    } catch (PDOException $e) { if ($db->inTransaction()) $db->rollBack(); throw $e; }
    psi_auditar('conciliar', 'extrato_item', $id, ['lancamento' => $lid]);
    return ['ok' => true, 'baixaId' => $baixa];
  });

  /* ---- lançar: cria o lançamento já pago a partir da linha (para o que não estava previsto) ---- */
  $r->add('POST', 'extrato-itens/{id}/lancar', function ($p) {
    $id = (int)$p['id']; $it = psi_carregar_item($id); $d = psi_corpo(); $db = psi_db(); $c = psi_conta_id();
    if ($it['situacao'] !== 'pendente') psi_erro('Esta linha já foi tratada.', 409);
    $tipo = (int)$it['valor'] > 0 ? 'receber' : 'pagar'; $abs = abs((int)$it['valor']);
    $desc = psi_txt($d['descricao'] ?? null, 150) ?? mb_substr((string)$it['descricao'], 0, 150);
    $cat = psi_categoria_id($d['categoriaId'] ?? null, $tipo === 'receber' ? 'receita' : 'despesa'); $pac = $tipo === 'receber' ? psi_da_conta('psi_pacientes', $d['pacienteId'] ?? null, 'Paciente') : null;
    $agora = psi_agora(); $db->beginTransaction();
    try {
      $db->prepare("INSERT INTO psi_lancamentos (conta_id, tipo, descricao, categoria_id, paciente_id, contraparte, valor, vencimento, competencia, situacao, origem, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?,?,'quitado','importacao',?,?)")
        ->execute([$c, $tipo, $desc, $cat, $pac, psi_txt($d['contraparte'] ?? null, 120), $abs, $it['data'], $it['data'], $agora, $agora]);
      $lid = (int)$db->lastInsertId();
      $db->prepare('INSERT INTO psi_baixas (conta_id, lancamento_id, data, valor, conta_fin_id, obs, criado_em) VALUES (?,?,?,?,?,?,?)')->execute([$c, $lid, $it['data'], $abs, (int)$it['conta_fin_id'], 'Lançado a partir do extrato', $agora]);
      $baixa = (int)$db->lastInsertId();
      $db->prepare("UPDATE psi_extrato_itens SET situacao = 'conciliado', baixa_id = ?, lancamento_id = ? WHERE id = ? AND conta_id = ?")->execute([$baixa, $lid, $id, $c]); $db->commit();
    } catch (Throwable $e) { if ($db->inTransaction()) $db->rollBack(); throw $e; }
    psi_auditar('lancar', 'extrato_item', $id, ['lancamento' => $lid]);
    return ['ok' => true, 'lancamentoId' => $lid];
  });

  /* ---- transferência entre as próprias contas (inclui pagamento de fatura) ---- */
  $r->add('POST', 'extrato-itens/{id}/transferencia', function ($p) {
    $id = (int)$p['id']; $it = psi_carregar_item($id); $d = psi_corpo(); $db = psi_db(); $c = psi_conta_id();
    if ($it['situacao'] !== 'pendente') psi_erro('Esta linha já foi tratada.', 409);
    $outra = psi_da_conta('psi_contas_fin', $d['contaId'] ?? null, 'Outra conta', true); if ($outra === (int)$it['conta_fin_id']) psi_erro('Escolha a outra conta da transferência.', 422);
    $sai = (int)$it['valor'] < 0; $abs = abs((int)$it['valor']); if ($it['data'] > psi_hoje()) psi_erro('A data da linha está no futuro.', 422);
    $db->beginTransaction();
    try {
      $db->prepare('INSERT INTO psi_transferencias (conta_id, origem_id, destino_id, valor, data, obs, criado_em) VALUES (?,?,?,?,?,?,?)')->execute([$c, $sai ? (int)$it['conta_fin_id'] : $outra, $sai ? $outra : (int)$it['conta_fin_id'], $abs, $it['data'], 'Do extrato: ' . mb_substr((string)$it['descricao'], 0, 150), psi_agora()]);
      $tr = (int)$db->lastInsertId();
      $db->prepare("UPDATE psi_extrato_itens SET situacao = 'conciliado', transferencia_id = ? WHERE id = ? AND conta_id = ?")->execute([$tr, $id, $c]); $db->commit();
    } catch (Throwable $e) { if ($db->inTransaction()) $db->rollBack(); throw $e; }
    psi_auditar('transferir', 'extrato_item', $id, ['transferencia' => $tr]);
    return ['ok' => true, 'transferenciaId' => $tr];
  });

  $r->add('POST', 'extrato-itens/{id}/ignorar', function ($p) {
    $id = (int)$p['id']; $it = psi_carregar_item($id); if ($it['situacao'] !== 'pendente') psi_erro('Esta linha já foi tratada.', 409);
    psi_db()->prepare("UPDATE psi_extrato_itens SET situacao = 'ignorado' WHERE id = ? AND conta_id = ?")->execute([$id, psi_conta_id()]); psi_auditar('ignorar', 'extrato_item', $id);
    return ['ok' => true];
  });

  /* ---- desfazer: remove o que a conciliação criou e a linha volta a ficar pendente ---- */
  $r->add('POST', 'extrato-itens/{id}/desfazer', function ($p) {
    $id = (int)$p['id']; $it = psi_carregar_item($id); $db = psi_db(); $c = psi_conta_id(); if ($it['situacao'] === 'pendente') return ['ok' => true];
    $db->beginTransaction();
    try {
      if ($it['baixa_id'] !== null) {
        $db->prepare('DELETE FROM psi_baixas WHERE id = ? AND conta_id = ?')->execute([(int)$it['baixa_id'], $c]);
        if ($it['lancamento_id'] !== null) {
          $l = $db->prepare('SELECT origem FROM psi_lancamentos WHERE id = ? AND conta_id = ?'); $l->execute([(int)$it['lancamento_id'], $c]); $o = $l->fetchColumn();
          if ($o === 'importacao') $db->prepare('DELETE FROM psi_lancamentos WHERE id = ? AND conta_id = ?')->execute([(int)$it['lancamento_id'], $c]); else psi_recalcular_situacao((int)$it['lancamento_id']);
        }
      }
      if ($it['transferencia_id'] !== null) $db->prepare('DELETE FROM psi_transferencias WHERE id = ? AND conta_id = ?')->execute([(int)$it['transferencia_id'], $c]);
      $db->prepare("UPDATE psi_extrato_itens SET situacao = 'pendente', baixa_id = NULL, lancamento_id = NULL, transferencia_id = NULL WHERE id = ? AND conta_id = ?")->execute([$id, $c]); $db->commit();
    } catch (Throwable $e) { if ($db->inTransaction()) $db->rollBack(); throw $e; }
    psi_auditar('desfazer', 'extrato_item', $id);
    return ['ok' => true];
  });
}
