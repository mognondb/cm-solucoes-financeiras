<?php
/** Rotas financeiras: lançamentos (a receber e a pagar), baixas, inadimplência, registro de cobranças e o painel do dia. */
declare(strict_types=1);

const PSI_CANAIS_COBRANCA = ['whatsapp', 'email', 'telefone', 'pessoalmente', 'outro'];

function psi_conta_fin_padrao(): ?int {
  $s = psi_db()->prepare("SELECT id FROM psi_contas_fin WHERE conta_id = ? AND ativo = 1 AND tipo IN ('banco','carteira','plataforma') ORDER BY (tipo = 'banco') DESC, ordem, id LIMIT 1"); $s->execute([psi_conta_id()]);
  $v = $s->fetchColumn(); return $v === false ? null : (int)$v;
}
function psi_data_lanc($v, bool $obrig, string $campo): ?string {
  $d = psi_data($v, $obrig, $campo);
  if ($d !== null && ($d < '2000-01-01' || $d > psi_somar_dias(psi_hoje(), 365 * 6))) psi_erro("Data fora do intervalo permitido em: $campo.", 422);
  return $d;
}

/** Tudo o que está em aberto (a receber ou a pagar), já com o restante de cada um. Base das somas e da inadimplência. */
function psi_abertos_a_receber(string $tipo = 'receber'): array {
  $c = psi_conta_id();
  $s = psi_db()->prepare("SELECT l.id, l.paciente_id, l.vencimento, l.valor - COALESCE(b.pago, 0) AS restante
    FROM psi_lancamentos l LEFT JOIN (SELECT lancamento_id, SUM(valor) AS pago FROM psi_baixas WHERE conta_id = ? GROUP BY lancamento_id) b ON b.lancamento_id = l.id
    WHERE l.conta_id = ? AND l.tipo = ? AND l.situacao = 'aberto'"); $s->execute([$c, $c, $tipo]);
  return array_values(array_filter($s->fetchAll(), fn($r) => (int)$r['restante'] > 0));
}

function psi_resumo_receber(string $tipo = 'receber'): array {
  $hoje = psi_hoje(); $ini = psi_inicio_mes($hoje); $fim = psi_data_no_mes((int)substr($hoje, 0, 4), (int)substr($hoje, 5, 2), 31); $sete = psi_somar_dias($hoje, 7);
  $r = ['atrasado' => 0, 'atrasadoQtd' => 0, 'pacientesEmAtraso' => 0, 'venceHoje' => 0, 'vence7dias' => 0, 'previstoMes' => 0, 'aberto' => 0, 'faixas' => ['ate7' => 0, 'ate30' => 0, 'ate60' => 0, 'mais60' => 0]]; $pacs = [];
  foreach (psi_abertos_a_receber($tipo) as $a) {
    $v = (int)$a['restante']; $r['aberto'] += $v;
    if ($a['vencimento'] < $hoje) {
      $r['atrasado'] += $v; $r['atrasadoQtd']++; $pacs[(string)$a['paciente_id']] = 1;
      $dias = (int)round((strtotime($hoje) - strtotime($a['vencimento'])) / 86400);
      $r['faixas'][$dias <= 7 ? 'ate7' : ($dias <= 30 ? 'ate30' : ($dias <= 60 ? 'ate60' : 'mais60'))] += $v;
    } elseif ($a['vencimento'] === $hoje) $r['venceHoje'] += $v;
    elseif ($a['vencimento'] <= $sete) $r['vence7dias'] += $v;
    if ($a['vencimento'] >= $ini && $a['vencimento'] <= $fim) $r['previstoMes'] += $v;
  }
  $r['pacientesEmAtraso'] = count($pacs);
  $b = psi_db()->prepare("SELECT COALESCE(SUM(CASE WHEN b.data >= ? AND b.data <= ? THEN b.valor END), 0), COALESCE(SUM(CASE WHEN b.data >= ? AND b.data < ? THEN b.valor END), 0)
    FROM psi_baixas b JOIN psi_lancamentos l ON l.id = b.lancamento_id WHERE b.conta_id = ? AND l.tipo = ?");
  $ant = psi_inicio_mes(psi_somar_meses($ini, -1)); $b->execute([$ini, $fim, $ant, $ini, psi_conta_id(), $tipo]); [$mes, $mesAnt] = $b->fetch(PDO::FETCH_NUM);
  $r['recebidoMes'] = (int)$mes; $r['recebidoMesAnterior'] = (int)$mesAnt;
  return $r;
}

/** Quem está devendo: um item por paciente, com o total vencido, há quantos dias e o último contato. */
function psi_inadimplencia(): array {
  $c = psi_conta_id(); $hoje = psi_hoje();
  $s = psi_db()->prepare(PSI_SQL_LANCAMENTO . " AND l.tipo = 'receber' AND l.situacao = 'aberto' AND l.vencimento < ? ORDER BY l.vencimento"); $s->execute([$c, $c, $hoje]);
  $porPac = [];
  foreach ($s->fetchAll() as $l) {
    $rest = (int)$l['valor'] - (int)$l['pago']; if ($rest <= 0) continue;
    $k = $l['paciente_id'] === null ? 'sem' : (string)$l['paciente_id'];
    if (!isset($porPac[$k])) $porPac[$k] = ['pacienteId' => $l['paciente_id'] === null ? null : (int)$l['paciente_id'], 'nome' => $l['p_nome'] ?? 'Sem paciente', 'apelido' => $l['p_apelido'], 'telefone' => $l['p_tel'], 'respNome' => $l['p_resp_nome'], 'respTelefone' => $l['p_resp_tel'],
      'tipo' => $l['p_tipo'], 'vencido' => 0, 'qtd' => 0, 'maisAntigo' => $l['vencimento'], 'descricoes' => [], 'ultimaCobranca' => null, 'promessaEm' => null];
    $porPac[$k]['vencido'] += $rest; $porPac[$k]['qtd']++; if (count($porPac[$k]['descricoes']) < 3) $porPac[$k]['descricoes'][] = $l['descricao'];
  }
  if ($porPac) {
    $q = psi_db()->prepare('SELECT c.paciente_id, c.canal, c.obs, c.promessa_em, c.criado_em FROM psi_cobrancas c JOIN (SELECT paciente_id, MAX(id) AS mid FROM psi_cobrancas WHERE conta_id = ? GROUP BY paciente_id) m ON m.mid = c.id WHERE c.conta_id = ?'); $q->execute([$c, $c]);
    foreach ($q->fetchAll() as $co) { $k = (string)$co['paciente_id']; if (isset($porPac[$k])) { $porPac[$k]['ultimaCobranca'] = ['canal' => $co['canal'], 'obs' => $co['obs'], 'em' => $co['criado_em']]; $porPac[$k]['promessaEm'] = $co['promessa_em']; } }
  }
  foreach ($porPac as &$p) { $p['diasAtraso'] = (int)round((strtotime($hoje) - strtotime($p['maisAntigo'])) / 86400); $p['promessaVigente'] = $p['promessaEm'] !== null && $p['promessaEm'] >= $hoje; } unset($p);
  $lista = array_values($porPac); usort($lista, fn($a, $b) => $b['diasAtraso'] <=> $a['diasAtraso'] ?: $b['vencido'] <=> $a['vencido']);
  return $lista;
}

function psi_registrar_rotas_lancamentos(PsiRoteador $r): void {
  /* ---- listar ---- */
  $r->add('GET', 'lancamentos', function () {
    $c = psi_conta_id(); $hoje = psi_hoje();
    $tipo = psi_opcao($_GET['tipo'] ?? null, ['receber', 'pagar'], 'receber'); if ($tipo === 'receber') psi_gerar_mensalidades(); else psi_gerar_recorrentes();
    $sit = psi_opcao($_GET['situacao'] ?? null, ['aberto', 'quitado', 'cancelado', 'atrasado', 'todos'], 'aberto');
    $onde = ['l.tipo = ?']; $par = [$tipo];
    if ($sit === 'atrasado') { $onde[] = "l.situacao = 'aberto' AND l.vencimento < ?"; $par[] = $hoje; } elseif ($sit !== 'todos') { $onde[] = 'l.situacao = ?'; $par[] = $sit; }
    if (($de = psi_data($_GET['de'] ?? null, false, 'vencimento inicial')) !== null) { $onde[] = 'l.vencimento >= ?'; $par[] = $de; }
    if (($ate = psi_data($_GET['ate'] ?? null, false, 'vencimento final')) !== null) { $onde[] = 'l.vencimento <= ?'; $par[] = $ate; }
    $pd = psi_data($_GET['pagoDe'] ?? null, false, 'pago de'); $pa = psi_data($_GET['pagoAte'] ?? null, false, 'pago até');
    if ($pd !== null || $pa !== null) { $onde[] = 'EXISTS (SELECT 1 FROM psi_baixas bb WHERE bb.lancamento_id = l.id AND bb.data >= ? AND bb.data <= ?)'; array_push($par, $pd ?? '2000-01-01', $pa ?? '2999-12-31'); }
    if (($pac = psi_int($_GET['paciente'] ?? null, 1, null, 'paciente')) !== null) { $onde[] = 'l.paciente_id = ?'; $par[] = $pac; }
    if (($cat = psi_int($_GET['categoria'] ?? null, 1, null, 'categoria')) !== null) { $onde[] = 'l.categoria_id = ?'; $par[] = $cat; }
    $busca = trim((string)($_GET['busca'] ?? ''));
    if ($busca !== '') { $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], mb_substr($busca, 0, 60)) . '%'; $onde[] = '(l.descricao LIKE ? OR l.contraparte LIKE ? OR p.nome LIKE ? OR p.apelido LIKE ?)'; array_push($par, $like, $like, $like, $like); }
    $ordem = in_array($sit, ['aberto', 'atrasado'], true) ? 'l.vencimento ASC, l.id ASC' : 'l.vencimento DESC, l.id DESC';
    $limite = psi_int($_GET['limite'] ?? 500, 1, 1000, 'limite') ?? 500;
    $s = psi_db()->prepare(PSI_SQL_LANCAMENTO . ' AND ' . implode(' AND ', $onde) . " ORDER BY $ordem LIMIT " . ($limite + 1)); $s->execute(array_merge([$c, $c], $par));
    $linhas = $s->fetchAll(); $cortou = count($linhas) > $limite; if ($cortou) array_pop($linhas);
    $itens = array_map('psi_lancamento_json', $linhas); $tot = ['valor' => 0, 'pago' => 0, 'restante' => 0];
    foreach ($itens as $i) if ($i['situacao'] !== 'cancelado') { $tot['valor'] += $i['valor']; $tot['pago'] += $i['pago']; $tot['restante'] += $i['restante']; }
    return ['itens' => $itens, 'totais' => $tot, 'cortou' => $cortou];
  });

  $r->add('GET', 'lancamentos/{id}', function ($p) {
    $id = psi_da_conta('psi_lancamentos', $p['id'], 'Lançamento', true); $c = psi_conta_id(); $db = psi_db();
    $l = psi_lancamento_json(psi_carregar_lancamento($id));
    $b = $db->prepare('SELECT b.id, b.data, b.valor, b.forma, b.conta_fin_id, b.obs, f.nome AS conta, r.id AS recibo_id, r.numero AS recibo_numero FROM psi_baixas b LEFT JOIN psi_contas_fin f ON f.id = b.conta_fin_id LEFT JOIN psi_recibo_baixas rb ON rb.baixa_id = b.id LEFT JOIN psi_recibos r ON r.id = rb.recibo_id AND r.cancelado = 0 WHERE b.lancamento_id = ? AND b.conta_id = ? ORDER BY b.data, b.id'); $b->execute([$id, $c]);
    $baixas = array_map(fn($x) => ['id' => (int)$x['id'], 'data' => $x['data'], 'valor' => (int)$x['valor'], 'forma' => $x['forma'], 'contaFinId' => $x['conta_fin_id'] === null ? null : (int)$x['conta_fin_id'], 'conta' => $x['conta'], 'obs' => $x['obs'], 'reciboId' => $x['recibo_id'] === null ? null : (int)$x['recibo_id'], 'reciboNumero' => $x['recibo_numero'] === null ? null : (int)$x['recibo_numero']], $b->fetchAll());
    $co = $db->prepare('SELECT canal, obs, promessa_em, criado_em FROM psi_cobrancas WHERE conta_id = ? AND lancamento_id = ? ORDER BY id DESC LIMIT 10'); $co->execute([$c, $id]);
    return ['item' => $l, 'baixas' => $baixas, 'cobrancas' => $co->fetchAll()];
  });

  /* ---- criar à mão (um valor, ou parcelado em meses) ---- */
  $r->add('POST', 'lancamentos', function () {
    $d = psi_corpo(); $db = psi_db(); $c = psi_conta_id(); $hoje = psi_hoje();
    $tipo = psi_opcao($d['tipo'] ?? null, ['receber', 'pagar'], ''); if ($tipo === '') psi_erro('Informe se é a receber ou a pagar.', 422);
    $desc = psi_txt($d['descricao'] ?? null, 150, true, 'descrição'); $total = psi_cent($d['valor'] ?? null, 'valor', true);
    $venc = psi_data_lanc($d['vencimento'] ?? null, true, 'vencimento'); $comp = psi_data_lanc($d['competencia'] ?? null, false, 'competência') ?? $venc;
    $cat = psi_categoria_id($d['categoriaId'] ?? null, $tipo === 'receber' ? 'receita' : 'despesa');
    $pac = $tipo === 'receber' ? psi_da_conta('psi_pacientes', $d['pacienteId'] ?? null, 'Paciente') : null;
    $contraparte = psi_txt($d['contraparte'] ?? null, 120); $obs = psi_txt($d['obs'] ?? null, 300);
    $n = psi_int($d['parcelas'] ?? 1, 1, 60, 'parcelas') ?? 1;
    $quitar = is_array($d['quitar'] ?? null) ? $d['quitar'] : null;
    if ($quitar !== null && $n > 1) psi_erro('Não dá para marcar como já pago um lançamento parcelado. Registre o pagamento de cada parcela.', 422);
    $qData = $qConta = $qForma = null;
    if ($quitar !== null) {   // {} (vazio) também significa "já foi pago, com os padrões"
      $qData = psi_data($quitar['data'] ?? null, false, 'data do pagamento') ?? $hoje; if ($qData > $hoje) psi_erro('A data do pagamento não pode ser no futuro.', 422);
      $qConta = psi_da_conta('psi_contas_fin', $quitar['contaFinId'] ?? null, 'Conta') ?? psi_conta_fin_padrao();
      $qForma = psi_txt($quitar['forma'] ?? null, 30); if ($qForma !== null && !array_key_exists($qForma, PSI_FORMAS)) psi_erro('Forma de pagamento inválida.', 422);
    }
    $base = intdiv($total, $n); $resto = $total - $base * $n; $agora = psi_agora(); $ids = [];
    $ins = $db->prepare("INSERT INTO psi_lancamentos (conta_id, tipo, descricao, categoria_id, paciente_id, contraparte, valor, vencimento, competencia, situacao, origem, parcela, parcelas, obs, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?,?,?,'manual',?,?,?,?,?)");
    $db->beginTransaction();
    try {
      for ($i = 0; $i < $n; $i++) {
        $v = $base + ($i === $n - 1 ? $resto : 0); $vc = $i === 0 ? $venc : psi_somar_meses($venc, $i); $cp = $i === 0 ? $comp : psi_somar_meses($comp, $i);
        $ins->execute([$c, $tipo, $n > 1 ? "$desc (" . ($i + 1) . "/$n)" : $desc, $cat, $pac, $contraparte, $v, $vc, $cp, $quitar !== null ? 'quitado' : 'aberto', $n > 1 ? $i + 1 : null, $n > 1 ? $n : null, $obs, $agora, $agora]);
        $ids[] = (int)$db->lastInsertId();
      }
      if ($n > 1) $db->prepare('UPDATE psi_lancamentos SET grupo_id = ? WHERE conta_id = ? AND id IN (' . psi_marcadores($ids) . ')')->execute(array_merge([$ids[0], $c], $ids));
      if ($quitar !== null) $db->prepare('INSERT INTO psi_baixas (conta_id, lancamento_id, data, valor, conta_fin_id, forma, criado_em) VALUES (?,?,?,?,?,?,?)')->execute([$c, $ids[0], $qData, $total, $qConta, $qForma, $agora]);
      $db->commit();
    } catch (Throwable $e) { $db->rollBack(); throw $e; }
    psi_auditar('criar', 'lancamento', $ids[0], ['tipo' => $tipo, 'parcelas' => $n, 'valor' => $total]);
    return ['id' => $ids[0], 'ids' => $ids];
  });

  /* ---- editar ---- */
  $r->add('PUT', 'lancamentos/{id}', function ($p) {
    $id = psi_da_conta('psi_lancamentos', $p['id'], 'Lançamento', true); $d = psi_corpo(); $db = psi_db(); $c = psi_conta_id();
    $l = psi_carregar_lancamento($id); if ($l['situacao'] === 'cancelado') psi_erro('Este lançamento está cancelado. Reabra para editar.', 409);
    $valor = array_key_exists('valor', $d) ? psi_cent($d['valor'], 'valor', true) : (int)$l['valor']; $pago = (int)$l['pago'];
    if ($valor < $pago) psi_erro('O valor não pode ficar abaixo do que já foi pago (R$ ' . number_format($pago / 100, 2, ',', '.') . ').', 422);
    $venc = array_key_exists('vencimento', $d) ? psi_data_lanc($d['vencimento'], true, 'vencimento') : $l['vencimento'];
    $comp = array_key_exists('competencia', $d) ? (psi_data_lanc($d['competencia'], false, 'competência') ?? $venc) : $l['competencia'];
    $cat = array_key_exists('categoriaId', $d) ? psi_categoria_id($d['categoriaId'], $l['tipo'] === 'receber' ? 'receita' : 'despesa') : ($l['categoria_id'] === null ? null : (int)$l['categoria_id']);
    $pac = $l['tipo'] === 'receber' && array_key_exists('pacienteId', $d) ? psi_da_conta('psi_pacientes', $d['pacienteId'], 'Paciente') : ($l['paciente_id'] === null ? null : (int)$l['paciente_id']);
    $db->prepare('UPDATE psi_lancamentos SET descricao = ?, valor = ?, vencimento = ?, competencia = ?, categoria_id = ?, paciente_id = ?, contraparte = ?, obs = ?, atualizado_em = ? WHERE id = ? AND conta_id = ?')->execute([
      array_key_exists('descricao', $d) ? psi_txt($d['descricao'], 150, true, 'descrição') : $l['descricao'], $valor, $venc, $comp, $cat, $pac,
      array_key_exists('contraparte', $d) ? psi_txt($d['contraparte'], 120) : $l['contraparte'], array_key_exists('obs', $d) ? psi_txt($d['obs'], 300) : $l['obs'], psi_agora(), $id, $c]);
    psi_recalcular_situacao($id); psi_auditar('alterar', 'lancamento', $id, ['valor' => $valor]);
    return ['ok' => true];
  });

  $r->add('POST', 'lancamentos/{id}/cancelar', function ($p) {
    $id = psi_da_conta('psi_lancamentos', $p['id'], 'Lançamento', true); $d = psi_corpo();
    $l = psi_carregar_lancamento($id);
    if ($l['situacao'] === 'cancelado') return ['ok' => true];
    if ((int)$l['pago'] > 0) psi_erro('Esta cobrança já tem pagamento registrado. Estorne o pagamento antes de cancelar.', 409);
    psi_db()->prepare("UPDATE psi_lancamentos SET situacao = 'cancelado', cancelado_motivo = ?, atualizado_em = ? WHERE id = ? AND conta_id = ?")->execute([psi_txt($d['motivo'] ?? null, 160) ?? 'Cancelado', psi_agora(), $id, psi_conta_id()]);
    psi_auditar('cancelar', 'lancamento', $id);
    return ['ok' => true];
  });
  $r->add('POST', 'lancamentos/{id}/reabrir', function ($p) {
    $id = psi_da_conta('psi_lancamentos', $p['id'], 'Lançamento', true);
    $l = psi_carregar_lancamento($id); if ($l['situacao'] !== 'cancelado') return ['ok' => true];
    psi_db()->prepare("UPDATE psi_lancamentos SET situacao = 'aberto', cancelado_motivo = NULL, atualizado_em = ? WHERE id = ? AND conta_id = ?")->execute([psi_agora(), $id, psi_conta_id()]);
    psi_recalcular_situacao($id); psi_auditar('reabrir', 'lancamento', $id);
    return ['ok' => true];
  });

  /* ---- pagamentos (baixas): total ou parcial, com estorno ---- */
  $r->add('POST', 'lancamentos/{id}/baixas', function ($p) {
    $id = psi_da_conta('psi_lancamentos', $p['id'], 'Lançamento', true); $d = psi_corpo(); $db = psi_db(); $c = psi_conta_id(); $hoje = psi_hoje();
    $data = psi_data($d['data'] ?? null, false, 'data do pagamento') ?? $hoje;
    if ($data > $hoje) psi_erro('A data do pagamento não pode ser no futuro.', 422);
    if ($data < '2000-01-01') psi_erro('Data do pagamento inválida.', 422);
    $conta = psi_da_conta('psi_contas_fin', $d['contaFinId'] ?? null, 'Conta') ?? psi_conta_fin_padrao();
    $forma = psi_txt($d['forma'] ?? null, 30); if ($forma !== null && !array_key_exists($forma, PSI_FORMAS)) psi_erro('Forma de pagamento inválida.', 422);
    $obs = psi_txt($d['obs'] ?? null, 200); $valorInformado = array_key_exists('valor', $d) && $d['valor'] !== null && $d['valor'] !== '' ? psi_cent($d['valor'], 'valor', true) : null;
    $db->beginTransaction();
    try {
      $s = $db->prepare('SELECT valor, situacao FROM psi_lancamentos WHERE id = ? AND conta_id = ? FOR UPDATE'); $s->execute([$id, $c]); $l = $s->fetch();   // trava: dois cliques não pagam duas vezes
      if (!$l || $l['situacao'] !== 'aberto') { $db->rollBack(); psi_erro('Esta cobrança não está em aberto.', 409); }
      $rest = (int)$l['valor'] - psi_pago_do_lancamento($id); $valor = $valorInformado ?? $rest;
      if ($valor > $rest) { $db->rollBack(); psi_erro('O valor é maior que o saldo em aberto (R$ ' . number_format($rest / 100, 2, ',', '.') . ').', 422); }
      $db->prepare('INSERT INTO psi_baixas (conta_id, lancamento_id, data, valor, conta_fin_id, forma, obs, criado_em) VALUES (?,?,?,?,?,?,?,?)')->execute([$c, $id, $data, $valor, $conta, $forma, $obs, psi_agora()]);
      $baixaId = (int)$db->lastInsertId(); psi_recalcular_situacao($id); $db->commit();
    } catch (PDOException $e) { if ($db->inTransaction()) $db->rollBack(); throw $e; }
    psi_auditar('baixa', 'lancamento', $id, ['valor' => $valor, 'baixa' => $baixaId]);
    $novo = psi_lancamento_json(psi_carregar_lancamento($id));
    return ['baixaId' => $baixaId, 'restante' => $novo['restante'], 'situacao' => $novo['situacao']];
  });

  $r->add('DELETE', 'baixas/{id}', function ($p) {
    $id = psi_int($p['id'], 1, null, 'pagamento', true); $c = psi_conta_id(); $db = psi_db();
    $s = $db->prepare('SELECT lancamento_id, valor FROM psi_baixas WHERE id = ? AND conta_id = ?'); $s->execute([$id, $c]); $b = $s->fetch();
    if (!$b) psi_erro('Pagamento não encontrado.', 404);
    $db->beginTransaction();
    try { $db->prepare('DELETE FROM psi_baixas WHERE id = ? AND conta_id = ?')->execute([$id, $c]); psi_recalcular_situacao((int)$b['lancamento_id']); $db->commit(); } catch (Throwable $e) { $db->rollBack(); throw $e; }
    psi_auditar('estorno', 'lancamento', (int)$b['lancamento_id'], ['valor' => (int)$b['valor']]);
    return ['ok' => true];
  });

  /* ---- visão de quem deve ---- */
  $r->add('GET', 'receber/resumo', function () { psi_gerar_mensalidades(); return psi_resumo_receber(); });
  $r->add('GET', 'pagar/resumo', function () { psi_gerar_recorrentes(); return psi_resumo_receber('pagar'); });
  $r->add('GET', 'receber/inadimplencia', function () { psi_gerar_mensalidades(); $l = psi_inadimplencia(); return ['itens' => $l, 'total' => array_sum(array_column($l, 'vencido'))]; });

  /* ---- registro de cobranças feitas (contatos e promessas de pagamento) ---- */
  $r->add('GET', 'pacientes/{id}/cobrancas', function ($p) {
    $id = psi_da_conta('psi_pacientes', $p['id'], 'Paciente', true);
    $s = psi_db()->prepare('SELECT id, canal, obs, promessa_em, lancamento_id, criado_em FROM psi_cobrancas WHERE conta_id = ? AND paciente_id = ? ORDER BY id DESC LIMIT 50'); $s->execute([psi_conta_id(), $id]);
    return ['itens' => $s->fetchAll()];
  });
  $r->add('POST', 'pacientes/{id}/cobrancas', function ($p) {
    $id = psi_da_conta('psi_pacientes', $p['id'], 'Paciente', true); $d = psi_corpo(); $c = psi_conta_id();
    $canal = psi_opcao($d['canal'] ?? null, PSI_CANAIS_COBRANCA, 'whatsapp'); $promessa = psi_data($d['promessaEm'] ?? null, false, 'data prometida');
    if ($promessa !== null && $promessa < psi_hoje()) psi_erro('A data prometida precisa ser hoje ou depois.', 422);
    $lanc = psi_da_conta('psi_lancamentos', $d['lancamentoId'] ?? null, 'Lançamento');
    if ($lanc !== null) { $q = psi_db()->prepare('SELECT paciente_id FROM psi_lancamentos WHERE id = ? AND conta_id = ?'); $q->execute([$lanc, $c]); if ((int)$q->fetchColumn() !== $id) psi_erro('Esse lançamento não é deste paciente.', 422); }
    psi_db()->prepare('INSERT INTO psi_cobrancas (conta_id, paciente_id, lancamento_id, canal, obs, promessa_em, usuario_id, criado_em) VALUES (?,?,?,?,?,?,?,?)')
      ->execute([$c, $id, $lanc, $canal, psi_txt($d['obs'] ?? null, 300), $promessa, PsiSessao::$usuario['id'] ?? null, psi_agora()]);
    return ['id' => (int)psi_db()->lastInsertId()];
  });

  /* ---- painel do dia ---- */
  $r->add('GET', 'inicio', function () {
    psi_gerar_mensalidades();
    $c = psi_conta_id(); $db = psi_db(); $hoje = psi_hoje(); $agora = psi_agora_local();
    $lista = function (string $onde, array $par, string $ordem, int $lim) use ($db, $c) {
      $s = $db->prepare(PSI_SQL_AGENDAMENTO . " WHERE a.conta_id = ? AND a.tipo = 'sessao' AND $onde ORDER BY $ordem LIMIT $lim"); $s->execute(array_merge([$c], $par));
      return array_map('psi_agendamento_json', $s->fetchAll());
    };
    $hojeSessoes = $lista("a.inicio >= ? AND a.inicio < ? AND a.status <> 'cancelada'", [$hoje . ' 00:00:00', psi_somar_dias($hoje, 1) . ' 00:00:00'], 'a.inicio', 60);
    /* só dias anteriores: as sessões de hoje já aparecem em "Hoje", com os mesmos botões */
    $aRegistrar = $lista("a.status IN ('agendada','confirmada') AND a.inicio < ? AND a.inicio >= ?", [$hoje . ' 00:00:00', psi_somar_dias($hoje, -30) . ' 00:00:00'], 'a.inicio DESC', 40);
    $proximas = $lista("a.status IN ('agendada','confirmada') AND a.inicio >= ?", [$agora], 'a.inicio', 6);
    $n = $db->prepare("SELECT COUNT(*) FROM psi_pacientes WHERE conta_id = ? AND status = 'ativo'"); $n->execute([$c]);
    $inad = psi_inadimplencia();
    return ['hoje' => $hojeSessoes, 'aRegistrar' => $aRegistrar, 'proximas' => $proximas, 'financeiro' => psi_resumo_receber(), 'inadimplentes' => array_slice($inad, 0, 5), 'totalInadimplentes' => count($inad), 'pacientesAtivos' => (int)$n->fetchColumn()];
  });
}
