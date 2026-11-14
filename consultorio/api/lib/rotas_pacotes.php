<?php
/**
 * Pacotes de sessões pré-pagas: o paciente paga N sessões de uma vez (à vista ou parcelado) e as sessões vão sendo agendadas e realizadas sem nova cobrança.
 * - O dinheiro é um lançamento a receber normal (com baixa quando recebido), ligado ao pacote por psi_lancamentos.pacote_id: entra nos relatórios, no caixa e nos recibos como qualquer recebimento (regime de caixa).
 * - As sessões do pacote (psi_agendamentos.pacote_id) ficam com cobrar = 0 e o valor de uma sessão do pacote (total / quantidade) só como referência.
 * - Quantas sessões restam é CALCULADO, nunca guardado: usadas = realizadas (+ faltas, quando a falta é cobrada), reservadas = agendadas/confirmadas, livres = quantidade - usadas - reservadas.
 *   Cancelar uma sessão devolve a vaga ao pacote.
 */
declare(strict_types=1);

const PSI_PACOTE_MAX_SESSOES = 60;

/** Valor de referência de uma sessão do pacote (total dividido pela quantidade, arredondado). */
function psi_pacote_valor_sessao(array $p): int { $q = max(1, (int)$p['qtd_sessoes']); return intdiv((int)$p['valor_total'] + intdiv($q, 2), $q); }

/** Contagens por pacote: id => [usadas, agendadas, proxima, ultima]. Falta conta como sessão usada só quando a falta é cobrada (política do consultório). */
function psi_pacote_contagens(array $ids): array {
  if (!$ids) return [];
  $faltaConta = !empty(psi_config()['cobrar_falta']);
  $s = psi_db()->prepare("SELECT pacote_id, SUM(status = 'realizada') AS realizadas, SUM(status = 'falta') AS faltas, SUM(status IN ('agendada','confirmada')) AS agendadas,
      MIN(CASE WHEN status IN ('agendada','confirmada') AND inicio >= ? THEN inicio END) AS proxima, MAX(CASE WHEN status = 'realizada' THEN inicio END) AS ultima
    FROM psi_agendamentos WHERE conta_id = ? AND pacote_id IN (" . psi_marcadores($ids) . ') GROUP BY pacote_id');
  $s->execute(array_merge([psi_hoje() . ' 00:00:00', psi_conta_id()], $ids)); $o = [];
  foreach ($s->fetchAll() as $x) $o[(int)$x['pacote_id']] = ['usadas' => (int)$x['realizadas'] + ($faltaConta ? (int)$x['faltas'] : 0), 'agendadas' => (int)$x['agendadas'], 'proxima' => $x['proxima'], 'ultima' => $x['ultima']];
  return $o;
}
/** Financeiro por pacote: id => [cobrado, pago] (parcelas canceladas ficam de fora). */
function psi_pacote_financeiro(array $ids): array {
  if (!$ids) return [];
  $c = psi_conta_id();
  $s = psi_db()->prepare("SELECT l.pacote_id, SUM(l.valor) AS cobrado, COALESCE(SUM(b.pago), 0) AS pago FROM psi_lancamentos l
    LEFT JOIN (SELECT lancamento_id, SUM(valor) AS pago FROM psi_baixas WHERE conta_id = ? GROUP BY lancamento_id) b ON b.lancamento_id = l.id
    WHERE l.conta_id = ? AND l.situacao <> 'cancelado' AND l.pacote_id IN (" . psi_marcadores($ids) . ') GROUP BY l.pacote_id');
  $s->execute(array_merge([$c, $c], $ids)); $o = [];
  foreach ($s->fetchAll() as $x) $o[(int)$x['pacote_id']] = ['cobrado' => (int)$x['cobrado'], 'pago' => (int)$x['pago']];
  return $o;
}

function psi_pacote_json(array $p, array $cont, array $fin): array {
  $qtd = (int)$p['qtd_sessoes']; $usadas = $cont['usadas'] ?? 0; $agendadas = $cont['agendadas'] ?? 0; $unit = psi_pacote_valor_sessao($p); $hoje = psi_hoje();
  $restam = max(0, $qtd - $usadas); $livres = max(0, $qtd - $usadas - $agendadas); $pago = $fin['pago'] ?? 0; $cobrado = $fin['cobrado'] ?? 0;
  $vencido = $p['validade'] !== null && $p['validade'] < $hoje && $restam > 0;
  $situacao = (int)$p['encerrado'] ? 'encerrado' : ($usadas >= $qtd ? 'concluido' : ($vencido ? 'vencido' : 'ativo'));
  return ['id' => (int)$p['id'], 'pacienteId' => (int)$p['paciente_id'], 'paciente' => $p['p_nome'] ?? null, 'servicoId' => $p['servico_id'] === null ? null : (int)$p['servico_id'], 'nome' => $p['nome'], 'qtd' => $qtd, 'valorTotal' => (int)$p['valor_total'], 'valorSessao' => $unit,
    'validade' => $p['validade'], 'situacao' => $situacao, 'usadas' => $usadas, 'agendadas' => $agendadas, 'restam' => $restam, 'livres' => $situacao === 'ativo' ? $livres : 0, 'proxima' => $cont['proxima'] ?? null, 'ultima' => $cont['ultima'] ?? null,
    'cobrado' => $cobrado, 'pago' => $pago, 'aReceber' => max(0, $cobrado - $pago),
    /* dinheiro já recebido que ainda não "virou" sessão realizada: o que o consultório deve em atendimento ao paciente */
    'adiantado' => in_array($situacao, ['ativo', 'vencido'], true) ? max(0, $pago - $usadas * $unit) : 0,
    'obs' => $p['obs'], 'criadoEm' => $p['criado_em'], 'faltasContam' => !empty(psi_config()['cobrar_falta'])];
}

const PSI_SQL_PACOTE = 'SELECT k.*, p.nome AS p_nome FROM psi_pacotes k LEFT JOIN psi_pacientes p ON p.id = k.paciente_id AND p.conta_id = k.conta_id WHERE k.conta_id = ?';
function psi_pacotes_json(array $linhas): array {
  $ids = array_map(fn($x) => (int)$x['id'], $linhas); $cont = psi_pacote_contagens($ids); $fin = psi_pacote_financeiro($ids);
  return array_map(fn($x) => psi_pacote_json($x, $cont[(int)$x['id']] ?? [], $fin[(int)$x['id']] ?? []), $linhas);
}
function psi_carregar_pacote(int $id): array {
  $s = psi_db()->prepare(PSI_SQL_PACOTE . ' AND k.id = ?'); $s->execute([psi_conta_id(), $id]); $p = $s->fetch(); if (!$p) psi_erro('Pacote não encontrado.', 404);
  return $p;
}

/**
 * Confere se o pacote pode receber estas sessões NOVAS (datas AAAA-MM-DD): é da conta e do paciente, não está encerrado, as datas estão na validade e há sessões livres.
 * Devolve [linha do pacote, livres antes de incluir as novas]. (Remarcar uma sessão que já é do pacote não passa por aqui: ela já ocupa a vaga dela.)
 */
function psi_pacote_para_uso(int $id, int $pacienteId, array $datas): array {
  $p = psi_carregar_pacote($id);
  if ((int)$p['paciente_id'] !== $pacienteId) psi_erro('Este pacote é de outro paciente.', 422);
  if ((int)$p['encerrado']) psi_erro('Este pacote foi encerrado.', 422);
  psi_pacote_exigir_validade($p, $datas);
  $cont = psi_pacote_contagens([$id])[$id] ?? ['usadas' => 0, 'agendadas' => 0];
  $livres = max(0, (int)$p['qtd_sessoes'] - $cont['usadas'] - $cont['agendadas']);
  if (count($datas) > $livres) psi_erro($livres === 0 ? 'Este pacote não tem mais sessões livres (todas já estão realizadas ou agendadas).' : 'Este pacote só tem ' . $livres . ($livres === 1 ? ' sessão livre.' : ' sessões livres.'), 422, ['livres' => $livres]);
  return [$p, $livres];
}
function psi_pacote_exigir_validade(array $p, array $datas): void {
  if ($p['validade'] === null) return;
  foreach ($datas as $dt) if ($dt > $p['validade']) psi_erro('O pacote vale até ' . substr($p['validade'], 8, 2) . '/' . substr($p['validade'], 5, 2) . '/' . substr($p['validade'], 0, 4) . ': não dá para marcar sessões depois dessa data.', 422);
}

/** Tira as sessões ainda não realizadas do pacote: voltam a seguir o padrão do paciente (valor e cobrança). Devolve quantas. */
function psi_pacote_soltar_sessoes(int $pacoteId): int {
  $db = psi_db(); $c = psi_conta_id();
  $s = $db->prepare("SELECT a.id, a.paciente_id FROM psi_agendamentos a WHERE a.conta_id = ? AND a.pacote_id = ? AND a.status IN ('agendada','confirmada')"); $s->execute([$c, $pacoteId]); $n = 0;
  $pacs = [];
  foreach ($s->fetchAll() as $a) {
    $pid = (int)$a['paciente_id']; if (!isset($pacs[$pid])) { $q = $db->prepare('SELECT * FROM psi_pacientes WHERE id = ? AND conta_id = ?'); $q->execute([$pid, $c]); $pacs[$pid] = $q->fetch() ?: null; }
    $pad = $pacs[$pid] ? psi_padrao_sessao($pacs[$pid]) : ['valor' => 0, 'cobrar' => 1, 'social' => 0, 'valor_cheio' => 0];
    $db->prepare('UPDATE psi_agendamentos SET pacote_id = NULL, valor = ?, cobrar = ?, social = ?, valor_cheio = ?, atualizado_em = ? WHERE id = ? AND conta_id = ?')->execute([$pad['valor'], $pad['cobrar'], $pad['social'], $pad['valor_cheio'], psi_agora(), (int)$a['id'], $c]); $n++;
  }
  $db->prepare('UPDATE psi_series SET pacote_id = NULL WHERE conta_id = ? AND pacote_id = ?')->execute([$c, $pacoteId]);
  return $n;
}

function psi_registrar_rotas_pacotes(PsiRoteador $r): void {
  /* ---- lista (de um paciente ou de todos) com o resumo do que há a realizar ---- */
  $r->add('GET', 'pacotes', function () {
    $c = psi_conta_id(); $onde = ''; $par = [$c];
    if (($pac = psi_int($_GET['paciente'] ?? null, 1, null, 'paciente')) !== null) { $onde .= ' AND k.paciente_id = ?'; $par[] = $pac; }
    $s = psi_db()->prepare(PSI_SQL_PACOTE . $onde . ' ORDER BY k.id DESC LIMIT 500'); $s->execute($par);
    $itens = psi_pacotes_json($s->fetchAll());
    $filtro = psi_opcao($_GET['situacao'] ?? null, ['ativos', 'ativo', 'concluido', 'encerrado', 'vencido', 'todos'], 'todos');
    $tot = ['ativos' => 0, 'sessoesARealizar' => 0, 'adiantado' => 0, 'aReceber' => 0];
    foreach ($itens as $i) { if (in_array($i['situacao'], ['ativo', 'vencido'], true)) { $tot['ativos']++; $tot['sessoesARealizar'] += $i['restam']; $tot['adiantado'] += $i['adiantado']; } if ($i['situacao'] !== 'encerrado') $tot['aReceber'] += $i['aReceber']; }
    if ($filtro === 'ativos') $itens = array_values(array_filter($itens, fn($i) => in_array($i['situacao'], ['ativo', 'vencido'], true)));
    elseif ($filtro !== 'todos') $itens = array_values(array_filter($itens, fn($i) => $i['situacao'] === $filtro));
    if (($_GET['comVaga'] ?? '') === '1') $itens = array_values(array_filter($itens, fn($i) => $i['livres'] > 0));
    return ['itens' => $itens, 'totais' => $tot];
  });

  /* ---- um pacote: sessões ligadas e pagamentos ---- */
  $r->add('GET', 'pacotes/{id}', function ($p) {
    $id = psi_da_conta('psi_pacotes', $p['id'], 'Pacote', true); $c = psi_conta_id(); $db = psi_db();
    $item = psi_pacotes_json([psi_carregar_pacote($id)])[0];
    $s = $db->prepare("SELECT id, inicio, status FROM psi_agendamentos WHERE conta_id = ? AND pacote_id = ? ORDER BY inicio"); $s->execute([$c, $id]);
    $l = $db->prepare("SELECT l.id, l.descricao, l.valor, l.vencimento, l.situacao, l.parcela, l.parcelas, COALESCE((SELECT SUM(b.valor) FROM psi_baixas b WHERE b.lancamento_id = l.id AND b.conta_id = l.conta_id), 0) AS pago, (SELECT MAX(b.data) FROM psi_baixas b WHERE b.lancamento_id = l.id AND b.conta_id = l.conta_id) AS ultima
      FROM psi_lancamentos l WHERE l.conta_id = ? AND l.pacote_id = ? ORDER BY l.vencimento, l.id"); $l->execute([$c, $id]);
    return ['item' => $item, 'sessoes' => array_map(fn($x) => ['id' => (int)$x['id'], 'inicio' => $x['inicio'], 'status' => $x['status']], $s->fetchAll()),
      'lancamentos' => array_map(fn($x) => ['id' => (int)$x['id'], 'descricao' => $x['descricao'], 'valor' => (int)$x['valor'], 'pago' => (int)$x['pago'], 'vencimento' => $x['vencimento'], 'situacao' => $x['situacao'], 'ultimaBaixa' => $x['ultima'], 'parcela' => $x['parcela'] === null ? null : (int)$x['parcela'], 'parcelas' => $x['parcelas'] === null ? null : (int)$x['parcelas']], $l->fetchAll())];
  });

  /* ---- vender um pacote: cria o pacote e o recebimento (já recebido, ou a receber em N parcelas) ---- */
  $r->add('POST', 'pacotes', function () {
    $d = psi_corpo(); $db = psi_db(); $c = psi_conta_id(); $hoje = psi_hoje(); $agora = psi_agora();
    $pid = psi_da_conta('psi_pacientes', $d['pacienteId'] ?? null, 'Paciente', true);
    $q = $db->prepare('SELECT * FROM psi_pacientes WHERE id = ? AND conta_id = ?'); $q->execute([$pid, $c]); $pac = $q->fetch();
    if ($pac['status'] === 'arquivado') psi_erro('Este cadastro está arquivado. Reative o paciente para vender um pacote.', 422);
    $qtd = psi_int($d['qtdSessoes'] ?? null, 1, PSI_PACOTE_MAX_SESSOES, 'quantidade de sessões', true); $total = psi_cent($d['valorTotal'] ?? null, 'valor do pacote', true);
    if ($total <= 0) psi_erro('Informe o valor do pacote.', 422);
    $serv = psi_da_conta('psi_servicos', $d['servicoId'] ?? null, 'Tipo de atendimento') ?? ($pac['servico_id'] !== null ? (int)$pac['servico_id'] : null);
    $nome = psi_txt($d['nome'] ?? null, 120) ?? ('Pacote de ' . $qtd . ($qtd === 1 ? ' sessão' : ' sessões'));
    $validade = psi_data($d['validade'] ?? null, false, 'validade'); if ($validade !== null && $validade < $hoje) psi_erro('A validade não pode ser no passado.', 422);
    $obs = psi_txt($d['obs'] ?? null, 300);
    $parcelas = psi_int($d['parcelas'] ?? 1, 1, 12, 'parcelas') ?? 1;
    $rec = is_array($d['recebido'] ?? null) ? $d['recebido'] : null;      // {data, forma, contaFinId}: já recebido à vista
    if ($rec !== null && $parcelas > 1) psi_erro('Um pacote já recebido é à vista. Para parcelar, deixe como "a receber" e registre cada parcela quando cair.', 422);
    $qData = $qConta = $qForma = null;
    if ($rec !== null) {
      $qData = psi_data($rec['data'] ?? null, false, 'data do recebimento') ?? $hoje; if ($qData > $hoje) psi_erro('A data do recebimento não pode ser no futuro.', 422); if ($qData < '2000-01-01') psi_erro('Data do recebimento inválida.', 422);
      $qConta = psi_da_conta('psi_contas_fin', $rec['contaFinId'] ?? null, 'Conta') ?? psi_conta_fin_padrao();
      $qForma = psi_txt($rec['forma'] ?? null, 30); if ($qForma !== null && !array_key_exists($qForma, PSI_FORMAS)) psi_erro('Forma de pagamento inválida.', 422);
    }
    $venc = $rec !== null ? $qData : (psi_data_lanc($d['vencimento'] ?? null, false, 'vencimento') ?? $hoje);
    $catServ = null; if ($serv !== null) { $z = $db->prepare('SELECT categoria_id FROM psi_servicos WHERE id = ? AND conta_id = ?'); $z->execute([$serv, $c]); $v = $z->fetchColumn(); $catServ = ($v === false || $v === null) ? null : (int)$v; }
    $cat = array_key_exists('categoriaId', $d) ? psi_categoria_id($d['categoriaId'], 'receita') : psi_categoria_da_cobranca($pac, $catServ);
    $db->beginTransaction();
    try {
      $db->prepare('INSERT INTO psi_pacotes (conta_id, paciente_id, servico_id, nome, qtd_sessoes, valor_total, validade, obs, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?,?,?)')->execute([$c, $pid, $serv, $nome, $qtd, $total, $validade, $obs, $agora, $agora]);
      $pacoteId = (int)$db->lastInsertId();
      $base = intdiv($total, $parcelas); $resto = $total - $base * $parcelas; $ids = [];
      $ins = $db->prepare("INSERT INTO psi_lancamentos (conta_id, tipo, descricao, categoria_id, paciente_id, valor, vencimento, competencia, situacao, origem, parcela, parcelas, pacote_id, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?,?,'manual',?,?,?,?,?)");
      for ($i = 0; $i < $parcelas; $i++) {
        $v = $base + ($i === $parcelas - 1 ? $resto : 0); $vc = $i === 0 ? $venc : psi_somar_meses($venc, $i);
        $ins->execute([$c, 'receber', $parcelas > 1 ? $nome . ' (' . ($i + 1) . '/' . $parcelas . ')' : $nome, $cat, $pid, $v, $vc, $vc, $rec !== null ? 'quitado' : 'aberto', $parcelas > 1 ? $i + 1 : null, $parcelas > 1 ? $parcelas : null, $pacoteId, $agora, $agora]);
        $ids[] = (int)$db->lastInsertId();
      }
      if ($parcelas > 1) $db->prepare('UPDATE psi_lancamentos SET grupo_id = ? WHERE conta_id = ? AND id IN (' . psi_marcadores($ids) . ')')->execute(array_merge([$ids[0], $c], $ids));
      if ($rec !== null) $db->prepare('INSERT INTO psi_baixas (conta_id, lancamento_id, data, valor, conta_fin_id, forma, obs, criado_em) VALUES (?,?,?,?,?,?,?,?)')->execute([$c, $ids[0], $qData, $total, $qConta, $qForma, 'Pacote de sessões', $agora]);
      $db->commit();
    } catch (Throwable $e) { if ($db->inTransaction()) $db->rollBack(); throw $e; }
    psi_auditar('criar', 'pacote', $pacoteId, ['qtd' => $qtd, 'valor' => $total, 'parcelas' => $parcelas, 'recebido' => $rec !== null]);
    return ['id' => $pacoteId, 'lancamentoIds' => $ids, 'item' => psi_pacotes_json([psi_carregar_pacote($pacoteId)])[0]];
  });

  /* ---- ajustar nome, validade, observação e a quantidade (nunca abaixo do que já está usado ou reservado). O valor se acerta na cobrança. ---- */
  $r->add('PUT', 'pacotes/{id}', function ($p) {
    $id = psi_da_conta('psi_pacotes', $p['id'], 'Pacote', true); $d = psi_corpo(); $db = psi_db(); $c = psi_conta_id(); $a = psi_carregar_pacote($id);
    $nome = array_key_exists('nome', $d) ? (psi_txt($d['nome'], 120, true, 'nome do pacote')) : $a['nome'];
    $validade = array_key_exists('validade', $d) ? psi_data($d['validade'], false, 'validade') : $a['validade'];
    $obs = array_key_exists('obs', $d) ? psi_txt($d['obs'], 300) : $a['obs'];
    $qtd = array_key_exists('qtdSessoes', $d) ? psi_int($d['qtdSessoes'], 1, PSI_PACOTE_MAX_SESSOES, 'quantidade de sessões', true) : (int)$a['qtd_sessoes'];
    $cont = psi_pacote_contagens([$id])[$id] ?? ['usadas' => 0, 'agendadas' => 0];
    if ($qtd < $cont['usadas'] + $cont['agendadas']) psi_erro('O pacote já tem ' . ($cont['usadas'] + $cont['agendadas']) . ' sessões realizadas ou agendadas: não dá para reduzir abaixo disso.', 422);
    $db->prepare('UPDATE psi_pacotes SET nome = ?, validade = ?, obs = ?, qtd_sessoes = ?, atualizado_em = ? WHERE id = ? AND conta_id = ?')->execute([$nome, $validade, $obs, $qtd, psi_agora(), $id, $c]);
    psi_auditar('alterar', 'pacote', $id);
    return ['ok' => true, 'item' => psi_pacotes_json([psi_carregar_pacote($id)])[0]];
  });

  /* ---- encerrar: não recebe mais sessões; as futuras ainda não realizadas voltam a ser cobradas como sessões comuns ---- */
  $r->add('POST', 'pacotes/{id}/encerrar', function ($p) {
    $id = psi_da_conta('psi_pacotes', $p['id'], 'Pacote', true); $db = psi_db(); $c = psi_conta_id(); $a = psi_carregar_pacote($id);
    if ((int)$a['encerrado']) return ['ok' => true, 'soltas' => 0];
    $db->beginTransaction();
    try {
      $soltas = psi_pacote_soltar_sessoes($id);
      $db->prepare('UPDATE psi_pacotes SET encerrado = 1, encerrado_em = ?, atualizado_em = ? WHERE id = ? AND conta_id = ?')->execute([psi_agora(), psi_agora(), $id, $c]);
      $db->commit();
    } catch (Throwable $e) { if ($db->inTransaction()) $db->rollBack(); throw $e; }
    psi_auditar('encerrar', 'pacote', $id, ['soltas' => $soltas]);
    return ['ok' => true, 'soltas' => $soltas];
  });
  $r->add('POST', 'pacotes/{id}/reabrir', function ($p) {
    $id = psi_da_conta('psi_pacotes', $p['id'], 'Pacote', true);
    psi_db()->prepare('UPDATE psi_pacotes SET encerrado = 0, encerrado_em = NULL, atualizado_em = ? WHERE id = ? AND conta_id = ?')->execute([psi_agora(), $id, psi_conta_id()]);
    psi_auditar('reabrir', 'pacote', $id); return ['ok' => true];
  });

  /* ---- apagar: só um pacote lançado por engano (nenhuma sessão ligada e nenhum recebimento registrado) ---- */
  $r->add('DELETE', 'pacotes/{id}', function ($p) {
    $id = psi_da_conta('psi_pacotes', $p['id'], 'Pacote', true); $db = psi_db(); $c = psi_conta_id();
    $n = $db->prepare('SELECT COUNT(*) FROM psi_agendamentos WHERE conta_id = ? AND pacote_id = ?'); $n->execute([$c, $id]);
    if ((int)$n->fetchColumn() > 0) psi_erro('Este pacote já tem sessões ligadas a ele. Encerre o pacote em vez de apagar.', 409);
    $b = $db->prepare('SELECT COUNT(*) FROM psi_baixas bb JOIN psi_lancamentos l ON l.id = bb.lancamento_id AND l.conta_id = bb.conta_id WHERE l.conta_id = ? AND l.pacote_id = ?'); $b->execute([$c, $id]);
    if ((int)$b->fetchColumn() > 0) psi_erro('Este pacote já tem recebimento registrado. Estorne o pagamento (em A receber) antes de apagar, ou encerre o pacote.', 409);
    $db->beginTransaction();
    try {
      $db->prepare('DELETE FROM psi_lancamentos WHERE conta_id = ? AND pacote_id = ?')->execute([$c, $id]);
      $db->prepare('DELETE FROM psi_pacotes WHERE id = ? AND conta_id = ?')->execute([$id, $c]); $db->commit();
    } catch (Throwable $e) { if ($db->inTransaction()) $db->rollBack(); throw $e; }
    psi_auditar('apagar', 'pacote', $id);
    return ['ok' => true];
  });
}
