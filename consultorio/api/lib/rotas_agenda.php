<?php
/**
 * Agenda: sessões e bloqueios de horário, com sessões fixas (semanal ou quinzenal) que viram ocorrências reais.
 * - Cada ocorrência é uma linha em psi_agendamentos (assim dá para remarcar, faltar ou cancelar só uma).
 * - A série (psi_series) guarda o "horário fixo"; as ocorrências são geradas até um horizonte e estendidas conforme a agenda é consultada.
 * - O cursor psi_series.gerado_ate só anda para frente: uma sessão remarcada ou apagada nunca é recriada.
 */
declare(strict_types=1);

const PSI_STATUS_SESSAO = ['agendada', 'confirmada', 'realizada', 'falta', 'falta_justificada', 'cancelada'];
const PSI_HORIZONTE_SERIE_DIAS = 800;     // até onde as sessões fixas são geradas, no máximo
const PSI_GERAR_AO_CRIAR_DIAS = 180;      // quanto da série já nasce pronto
const PSI_ESCOPOS = ['este', 'seguintes'];

const PSI_SQL_AGENDAMENTO = "SELECT a.*, p.nome AS p_nome, p.apelido AS p_apelido, p.telefone AS p_tel, p.resp_nome AS p_resp_nome, p.resp_telefone AS p_resp_tel,
    p.tipo AS p_tipo, p.modalidade_cobranca AS p_modal, p.status AS p_status, s.frequencia AS s_freq
  FROM psi_agendamentos a
  LEFT JOIN psi_pacientes p ON p.id = a.paciente_id AND p.conta_id = a.conta_id
  LEFT JOIN psi_series s ON s.id = a.serie_id";

function psi_agendamento_json(array $a): array {
  $n = fn($v) => $v === null ? null : (int)$v;
  return [
    'id' => (int)$a['id'], 'tipo' => $a['tipo'], 'titulo' => $a['titulo'], 'pacienteId' => $n($a['paciente_id']), 'profissionalId' => $n($a['profissional_id']), 'servicoId' => $n($a['servico_id']),
    'inicio' => $a['inicio'], 'fim' => $a['fim'], 'status' => $a['status'], 'modalidade' => $a['modalidade'], 'valor' => (int)$a['valor'], 'cobrar' => (bool)$a['cobrar'],
    'serieId' => $n($a['serie_id']), 'frequencia' => $a['s_freq'] ?? null, 'obs' => $a['obs'],
    'pac' => $a['paciente_id'] === null ? null : ['id' => (int)$a['paciente_id'], 'nome' => $a['p_nome'], 'apelido' => $a['p_apelido'], 'telefone' => $a['p_tel'], 'respNome' => $a['p_resp_nome'], 'respTelefone' => $a['p_resp_tel'], 'tipo' => $a['p_tipo'], 'modalidade' => $a['p_modal']],
  ];
}

function psi_carregar_agendamento(int $id): array {
  $s = psi_db()->prepare(PSI_SQL_AGENDAMENTO . ' WHERE a.id = ? AND a.conta_id = ?'); $s->execute([$id, psi_conta_id()]);
  $a = $s->fetch(); if (!$a) psi_erro('Sessão não encontrada.', 404);
  return $a;
}

function psi_fim_da_sessao(string $inicio, int $duracaoMin): string {
  $fim = (new DateTimeImmutable($inicio))->modify("+$duracaoMin minutes")->format('Y-m-d H:i:s');
  if (substr($fim, 0, 10) !== substr($inicio, 0, 10)) psi_erro('O horário precisa terminar no mesmo dia em que começa.', 422);
  return $fim;
}
function psi_duracao_min(string $inicio, string $fim): int { return (int)round((strtotime($fim) - strtotime($inicio)) / 60); }
function psi_checar_data_agenda(string $inicio): void {
  $dia = substr($inicio, 0, 10);
  if ($dia < '2000-01-01' || $dia > psi_somar_dias(psi_hoje(), 1100)) psi_erro('Essa data está fora do intervalo permitido.', 422);
}
function psi_profissional_unica(): ?int {
  $s = psi_db()->prepare('SELECT id FROM psi_profissionais WHERE conta_id = ? AND ativo = 1'); $s->execute([psi_conta_id()]); $ids = $s->fetchAll(PDO::FETCH_COLUMN);
  return count($ids) === 1 ? (int)$ids[0] : null;
}

/** Valor, cobrança e duração que uma sessão desse paciente costuma ter. */
function psi_padrao_sessao(array $pac): array {
  $serv = null;
  if ($pac['servico_id'] !== null) { $s = psi_db()->prepare('SELECT duracao_min, valor FROM psi_servicos WHERE id = ? AND conta_id = ?'); $s->execute([(int)$pac['servico_id'], psi_conta_id()]); $serv = $s->fetch() ?: null; }
  $dur = $serv ? (int)$serv['duracao_min'] : (int)psi_config()['duracao_padrao'];
  $valor = (int)$pac['valor_sessao'] ?: ($serv ? (int)$serv['valor'] : 0);
  if ($pac['modalidade_cobranca'] === 'mensal') return ['valor' => 0, 'cobrar' => 0, 'duracao' => $dur];   // coberta pela mensalidade
  return ['valor' => $valor, 'cobrar' => 1, 'duracao' => $dur];
}

/** Sessões e bloqueios que se sobrepõem ao intervalo, na agenda da mesma profissional (canceladas não contam). */
function psi_conflitos(?int $prof, array $intervalos, array $ignorarIds = [], array $ignorarSeries = []): array {
  if (!$intervalos) return [];
  $ini = min(array_column($intervalos, 0)); $fim = max(array_column($intervalos, 1));
  $s = psi_db()->prepare("SELECT a.id, a.inicio, a.fim, a.tipo, a.titulo, a.serie_id, p.nome FROM psi_agendamentos a LEFT JOIN psi_pacientes p ON p.id = a.paciente_id
    WHERE a.conta_id = ? AND a.profissional_id <=> ? AND a.status <> 'cancelada' AND a.inicio < ? AND a.fim > ? ORDER BY a.inicio");
  $s->execute([psi_conta_id(), $prof, $fim, $ini]);
  $achados = [];
  foreach ($s->fetchAll() as $e) {
    if (in_array((int)$e['id'], $ignorarIds, true) || ($e['serie_id'] !== null && in_array((int)$e['serie_id'], $ignorarSeries, true))) continue;
    foreach ($intervalos as [$i, $f]) {
      if ($e['inicio'] < $f && $e['fim'] > $i) { $achados[] = ['id' => (int)$e['id'], 'inicio' => $e['inicio'], 'fim' => $e['fim'], 'quem' => $e['tipo'] === 'bloqueio' ? ($e['titulo'] ?: 'Horário bloqueado') : $e['nome']]; break; }
    }
    if (count($achados) >= 6) break;
  }
  return $achados;
}
function psi_exigir_sem_conflito(?int $prof, array $intervalos, bool $ignorar, array $ignorarIds = [], array $ignorarSeries = []): void {
  if ($ignorar) return;
  $c = psi_conflitos($prof, $intervalos, $ignorarIds, $ignorarSeries);
  if ($c) psi_erro('Já existe algo marcado nesse horário.', 409, ['conflitos' => $c]);
}

/** Datas (AAAA-MM-DD) de uma série entre o início e o limite. */
function psi_datas_serie(string $inicio, int $passo, string $limite, int $max = 400): array {
  $o = []; for ($d = $inicio; $d <= $limite && count($o) < $max; $d = psi_somar_dias($d, $passo)) $o[] = $d;
  return $o;
}

/** Gera as ocorrências de uma série até a data (ou até o horizonte). O cursor gerado_ate só avança. */
function psi_materializar_serie(array $s, string $ate): void {
  $limite = min($ate, psi_somar_dias(psi_hoje(), PSI_HORIZONTE_SERIE_DIAS));
  if ($s['fim'] !== null && $s['fim'] < $limite) $limite = $s['fim'];
  $passo = $s['frequencia'] === 'quinzenal' ? 14 : 7;
  $ultimo = $s['gerado_ate']; $prox = $ultimo === null ? $s['inicio'] : psi_somar_dias($ultimo, $passo);
  if ($prox > $limite) return;
  $db = psi_db(); $agora = psi_agora();
  $ins = $db->prepare('INSERT IGNORE INTO psi_agendamentos (conta_id, profissional_id, paciente_id, servico_id, tipo, titulo, inicio, fim, status, modalidade, valor, cobrar, serie_id, criado_em, atualizado_em)
    VALUES (?,?,?,?,?,?,?,?,\'agendada\',?,?,?,?,?,?)');
  for ($n = 0; $prox <= $limite && $n < 400; $n++, $prox = psi_somar_dias($prox, $passo)) {
    $ini = $prox . ' ' . $s['hora']; $fim = (new DateTimeImmutable($ini))->modify('+' . (int)$s['duracao_min'] . ' minutes')->format('Y-m-d H:i:s');
    $ins->execute([$s['conta_id'], $s['profissional_id'], $s['paciente_id'], $s['servico_id'], $s['tipo'], $s['titulo'], $ini, $fim, $s['modalidade'], $s['valor'], $s['cobrar'], $s['id'], $agora, $agora]);
    $ultimo = $prox;
  }
  $db->prepare('UPDATE psi_series SET gerado_ate = ? WHERE id = ? AND conta_id = ?')->execute([$ultimo, $s['id'], $s['conta_id']]);
}
function psi_estender_series(string $ate): void {
  $s = psi_db()->prepare('SELECT * FROM psi_series WHERE conta_id = ? AND ativa = 1'); $s->execute([psi_conta_id()]);
  foreach ($s->fetchAll() as $serie) if ($serie['gerado_ate'] === null || $serie['gerado_ate'] < $ate) psi_materializar_serie($serie, $ate);
}

function psi_registrar_rotas_agenda(PsiRoteador $r): void {
  /* ---- consulta por período (a agenda inteira de uma semana ou mês) ---- */
  $r->add('GET', 'agenda', function () {
    $de = psi_data($_GET['de'] ?? null, true, 'início do período'); $ate = psi_data($_GET['ate'] ?? null, true, 'fim do período');
    if ($ate < $de) psi_erro('Período inválido.', 422);
    if ((strtotime($ate) - strtotime($de)) / 86400 > 100) psi_erro('Período grande demais (máximo de 100 dias).', 422);
    psi_estender_series($ate);
    $onde = ['a.conta_id = ?', 'a.inicio >= ?', 'a.inicio < ?']; $par = [psi_conta_id(), $de . ' 00:00:00', psi_somar_dias($ate, 1) . ' 00:00:00'];
    $prof = psi_int($_GET['profissional'] ?? null, 1, null, 'profissional'); if ($prof !== null) { $onde[] = 'a.profissional_id = ?'; $par[] = $prof; }
    $pac = psi_int($_GET['paciente'] ?? null, 1, null, 'paciente'); if ($pac !== null) { $onde[] = 'a.paciente_id = ?'; $par[] = $pac; }
    $s = psi_db()->prepare(PSI_SQL_AGENDAMENTO . ' WHERE ' . implode(' AND ', $onde) . ' ORDER BY a.inicio, a.id LIMIT 3000'); $s->execute($par);
    return ['itens' => array_map('psi_agendamento_json', $s->fetchAll())];
  });

  $r->add('GET', 'agenda/{id}', function ($p) {
    $id = psi_da_conta('psi_agendamentos', $p['id'], 'Sessão', true);
    return ['item' => psi_agendamento_json(psi_carregar_agendamento($id))];
  });

  /* ---- marcar sessão ou bloquear horário (com ou sem repetição) ---- */
  $r->add('POST', 'agenda', function () {
    $d = psi_corpo(); $db = psi_db(); $c = psi_conta_id();
    $tipo = psi_opcao($d['tipo'] ?? null, ['sessao', 'bloqueio'], 'sessao');
    $inicio = psi_datahora($d['inicio'] ?? null, true, 'data e hora'); psi_checar_data_agenda($inicio);
    $pac = null; $titulo = null;
    if ($tipo === 'sessao') {
      $pid = psi_da_conta('psi_pacientes', $d['pacienteId'] ?? null, 'Paciente', true);
      $q = $db->prepare('SELECT * FROM psi_pacientes WHERE id = ? AND conta_id = ?'); $q->execute([$pid, $c]); $pac = $q->fetch();
      if ($pac['status'] === 'arquivado') psi_erro('Este cadastro está arquivado. Reative o paciente para agendar.', 422);
    } else $titulo = psi_txt($d['titulo'] ?? null, 120, true, 'motivo do bloqueio');
    $prof = psi_da_conta('psi_profissionais', $d['profissionalId'] ?? null, 'Profissional') ?? ($pac['profissional_id'] ?? null) ?? psi_profissional_unica();
    $prof = $prof === null ? null : (int)$prof;
    $servId = psi_da_conta('psi_servicos', $d['servicoId'] ?? null, 'Tipo de atendimento') ?? ($pac && $pac['servico_id'] !== null ? (int)$pac['servico_id'] : null);
    $padrao = $pac ? psi_padrao_sessao($pac) : ['valor' => 0, 'cobrar' => 0, 'duracao' => (int)psi_config()['duracao_padrao']];
    $dur = psi_int($d['duracaoMin'] ?? null, 10, 600, 'duração') ?? $padrao['duracao'];
    $fim = psi_fim_da_sessao($inicio, $dur);
    $modal = psi_opcao($d['modalidade'] ?? null, ['presencial', 'online'], 'presencial');
    $valor = (isset($d['valor']) && $d['valor'] !== '') ? psi_cent($d['valor'], 'valor', false, true) : $padrao['valor'];
    $cobrar = array_key_exists('cobrar', $d) ? psi_bool($d['cobrar']) : $padrao['cobrar'];
    if ($tipo === 'bloqueio') { $valor = 0; $cobrar = 0; }
    $obs = psi_txt($d['obs'] ?? null, 255); $ignorar = ($d['ignorarConflitos'] ?? false) === true;
    $rec = is_array($d['recorrencia'] ?? null) ? $d['recorrencia'] : null;
    $freq = $rec ? psi_opcao($rec['frequencia'] ?? null, ['semanal', 'quinzenal'], '') : ''; $ate = $rec ? psi_data($rec['ate'] ?? null, false, 'data final da repetição') : null;
    $agora = psi_agora(); $dia = substr($inicio, 0, 10); $hora = substr($inicio, 11, 8);

    if ($freq === '') {
      psi_exigir_sem_conflito($prof, [[$inicio, $fim]], $ignorar);
      $db->prepare('INSERT INTO psi_agendamentos (conta_id, profissional_id, paciente_id, servico_id, tipo, titulo, inicio, fim, status, modalidade, valor, cobrar, obs, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?,\'agendada\',?,?,?,?,?,?)')
        ->execute([$c, $prof, $pac ? (int)$pac['id'] : null, $servId, $tipo, $titulo, $inicio, $fim, $modal, $valor, $cobrar, $obs, $agora, $agora]);
      $id = (int)$db->lastInsertId(); psi_auditar('criar', 'sessao', $id);
      return ['id' => $id];
    }
    if ($ate !== null && $ate < $dia) psi_erro('A repetição precisa terminar depois da primeira sessão.', 422);
    $passo = $freq === 'quinzenal' ? 14 : 7;
    $limite = psi_somar_dias(psi_hoje(), PSI_GERAR_AO_CRIAR_DIAS); if ($ate !== null && $ate < $limite) $limite = $ate; if ($limite < $dia) $limite = $dia;
    $intervalos = array_map(fn($x) => [$x . ' ' . $hora, psi_fim_da_sessao($x . ' ' . $hora, $dur)], psi_datas_serie($dia, $passo, $limite, 60));
    psi_exigir_sem_conflito($prof, $intervalos, $ignorar);
    $db->prepare('INSERT INTO psi_series (conta_id, profissional_id, paciente_id, servico_id, tipo, titulo, frequencia, dia_semana, hora, duracao_min, modalidade, valor, cobrar, inicio, fim, ativa, criado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)')
      ->execute([$c, $prof, $pac ? (int)$pac['id'] : null, $servId, $tipo, $titulo, $freq, (int)date('w', strtotime($dia)), $hora, $dur, $modal, $valor, $cobrar, $dia, $ate, $agora]);
    $serieId = (int)$db->lastInsertId();
    $sr = $db->prepare('SELECT * FROM psi_series WHERE id = ?'); $sr->execute([$serieId]); psi_materializar_serie($sr->fetch(), $limite);
    $n = $db->prepare('SELECT COUNT(*) FROM psi_agendamentos WHERE serie_id = ?'); $n->execute([$serieId]);
    psi_auditar('criar', 'serie', $serieId);
    return ['serieId' => $serieId, 'criados' => (int)$n->fetchColumn()];
  });

  /* ---- remarcar / ajustar (só esta ocorrência ou esta e as seguintes da série) ---- */
  $r->add('PUT', 'agenda/{id}', function ($p) {
    $id = psi_da_conta('psi_agendamentos', $p['id'], 'Sessão', true); $d = psi_corpo(); $db = psi_db(); $c = psi_conta_id();
    $a = psi_carregar_agendamento($id);
    $escopo = psi_opcao($d['escopo'] ?? null, PSI_ESCOPOS, 'este'); if ($a['serie_id'] === null) $escopo = 'este';
    $ignorar = ($d['ignorarConflitos'] ?? false) === true;
    $inicio = array_key_exists('inicio', $d) ? psi_datahora($d['inicio'], true, 'data e hora') : $a['inicio']; psi_checar_data_agenda($inicio);
    $durAtual = psi_duracao_min($a['inicio'], $a['fim']);
    $dur = array_key_exists('duracaoMin', $d) ? psi_int($d['duracaoMin'], 10, 600, 'duração', true) : $durAtual;
    $fim = psi_fim_da_sessao($inicio, $dur);
    $prof = array_key_exists('profissionalId', $d) ? (psi_da_conta('psi_profissionais', $d['profissionalId'], 'Profissional') ?? null) : ($a['profissional_id'] === null ? null : (int)$a['profissional_id']);
    $modal = array_key_exists('modalidade', $d) ? psi_opcao($d['modalidade'], ['presencial', 'online'], $a['modalidade']) : $a['modalidade'];
    $valor = array_key_exists('valor', $d) ? psi_cent($d['valor'], 'valor', false, true) ?? 0 : (int)$a['valor'];
    $cobrar = array_key_exists('cobrar', $d) ? psi_bool($d['cobrar']) : (int)$a['cobrar'];
    $obs = array_key_exists('obs', $d) ? psi_txt($d['obs'], 255) : $a['obs'];
    $titulo = $a['tipo'] === 'bloqueio' && array_key_exists('titulo', $d) ? psi_txt($d['titulo'], 120, true, 'motivo do bloqueio') : $a['titulo'];
    if ($a['tipo'] === 'bloqueio') { $valor = 0; $cobrar = 0; }

    if ($escopo === 'este') {
      if ($a['status'] !== 'cancelada') psi_exigir_sem_conflito($prof, [[$inicio, $fim]], $ignorar, [$id]);
      try {
        $db->prepare('UPDATE psi_agendamentos SET profissional_id = ?, titulo = ?, inicio = ?, fim = ?, modalidade = ?, valor = ?, cobrar = ?, obs = ?, atualizado_em = ? WHERE id = ? AND conta_id = ?')
          ->execute([$prof, $titulo, $inicio, $fim, $modal, $valor, $cobrar, $obs, psi_agora(), $id, $c]);
      } catch (PDOException $e) { if ($e->getCode() === '23000') psi_erro('Já existe uma sessão desta série nesse horário.', 409); throw $e; }
      psi_auditar('alterar', 'sessao', $id);
      return ['ok' => true, 'cobranca' => in_array($a['status'], ['realizada', 'falta'], true) ? psi_sincronizar_cobranca($id) : ['acao' => null]];
    }
    /* esta e as seguintes: o "horário fixo" muda e as sessões futuras ainda não realizadas acompanham */
    $serieId = (int)$a['serie_id']; $delta = (int)round((strtotime(substr($inicio, 0, 10)) - strtotime(substr($a['inicio'], 0, 10))) / 86400); $hora = substr($inicio, 11, 8);
    $q = $db->prepare("SELECT id, inicio FROM psi_agendamentos WHERE conta_id = ? AND serie_id = ? AND inicio >= ? AND status IN ('agendada','confirmada') ORDER BY inicio"); $q->execute([$c, $serieId, $a['inicio']]); $seguintes = $q->fetchAll();
    $intervalos = array_map(function ($x) use ($delta, $hora, $dur) { $ini = psi_somar_dias(substr($x['inicio'], 0, 10), $delta) . ' ' . $hora; return [$ini, psi_fim_da_sessao($ini, $dur)]; }, $seguintes);
    psi_exigir_sem_conflito($prof, $intervalos, $ignorar, [], [$serieId]);
    $db->beginTransaction();
    try {
      $sr = $db->prepare('SELECT dia_semana, gerado_ate FROM psi_series WHERE id = ? AND conta_id = ? FOR UPDATE'); $sr->execute([$serieId, $c]); $serie = $sr->fetch();
      $novoDia = (($serie['dia_semana'] + $delta) % 7 + 7) % 7; $novoGerado = $serie['gerado_ate'] === null ? null : psi_somar_dias($serie['gerado_ate'], $delta);
      $db->prepare('UPDATE psi_series SET profissional_id = ?, titulo = ?, dia_semana = ?, hora = ?, duracao_min = ?, modalidade = ?, valor = ?, cobrar = ?, gerado_ate = ? WHERE id = ? AND conta_id = ?')
        ->execute([$prof, $titulo, $novoDia, $hora, $dur, $modal, $valor, $cobrar, $novoGerado, $serieId, $c]);
      /* a ordem evita choque temporário com o índice único (serie_id, inicio) ao deslocar a série */
      $ordem = $delta > 0 ? 'DESC' : 'ASC';
      /* "fim" vem antes de "inicio" no SET de propósito: o MySQL aplica as atribuições da esquerda para a direita, e o fim precisa do início antigo */
      $db->prepare("UPDATE psi_agendamentos SET profissional_id = ?, titulo = ?, fim = DATE_ADD(CONCAT(DATE_ADD(DATE(inicio), INTERVAL ? DAY), ' ', ?), INTERVAL ? MINUTE), inicio = CONCAT(DATE_ADD(DATE(inicio), INTERVAL ? DAY), ' ', ?), modalidade = ?, valor = ?, cobrar = ?, atualizado_em = ?
        WHERE conta_id = ? AND serie_id = ? AND inicio >= ? AND status IN ('agendada','confirmada') ORDER BY inicio $ordem")
        ->execute([$prof, $titulo, $delta, $hora, $dur, $delta, $hora, $modal, $valor, $cobrar, psi_agora(), $c, $serieId, $a['inicio']]);
      $db->commit();
    } catch (Throwable $e) { $db->rollBack(); throw $e; }
    psi_auditar('alterar', 'serie', $serieId);
    return ['ok' => true, 'alteradas' => count($seguintes)];
  });

  /* ---- situação da sessão: confirmada, realizada, faltou, cancelada... ---- */
  $r->add('POST', 'agenda/{id}/status', function ($p) {
    $id = psi_da_conta('psi_agendamentos', $p['id'], 'Sessão', true); $d = psi_corpo(); $db = psi_db(); $c = psi_conta_id();
    $st = psi_opcao($d['status'] ?? null, PSI_STATUS_SESSAO, ''); if ($st === '') psi_erro('Situação inválida.', 422);
    $a = psi_carregar_agendamento($id);
    if ($a['tipo'] === 'bloqueio') psi_erro('Um horário bloqueado não tem situação. Apague o bloqueio se não precisar mais dele.', 422);
    if (in_array($st, ['realizada', 'falta', 'falta_justificada'], true) && substr($a['inicio'], 0, 10) > psi_hoje()) psi_erro('Só dá para marcar como realizada ou falta uma sessão de hoje ou de dias anteriores.', 422);
    $escopo = psi_opcao($d['escopo'] ?? null, PSI_ESCOPOS, 'este'); $removidas = 0;
    $db->beginTransaction();
    try {
      $db->prepare('UPDATE psi_agendamentos SET status = ?, atualizado_em = ? WHERE id = ? AND conta_id = ?')->execute([$st, psi_agora(), $id, $c]);
      if ($st === 'cancelada' && $escopo === 'seguintes' && $a['serie_id'] !== null) {
        /* cancelar "esta e as seguintes": as futuras somem e a série termina aqui (esta fica registrada como cancelada) */
        $del = $db->prepare("DELETE FROM psi_agendamentos WHERE conta_id = ? AND serie_id = ? AND inicio > ? AND status IN ('agendada','confirmada')
          AND NOT EXISTS (SELECT 1 FROM psi_lancamentos l WHERE l.agendamento_id = psi_agendamentos.id)"); $del->execute([$c, (int)$a['serie_id'], $a['inicio']]); $removidas = $del->rowCount();
        $db->prepare('UPDATE psi_series SET fim = ?, ativa = 0 WHERE id = ? AND conta_id = ?')->execute([substr($a['inicio'], 0, 10), (int)$a['serie_id'], $c]);
      }
      $db->commit();
    } catch (Throwable $e) { $db->rollBack(); throw $e; }
    psi_auditar('situacao', 'sessao', $id, ['status' => $st]);
    return ['ok' => true, 'status' => $st, 'removidas' => $removidas, 'cobranca' => psi_sincronizar_cobranca($id)];
  });

  /* ---- apagar: bloqueios e sessões que ainda não aconteceram nem geraram cobrança ---- */
  $r->add('DELETE', 'agenda/{id}', function ($p) {
    $id = psi_da_conta('psi_agendamentos', $p['id'], 'Sessão', true); $db = psi_db(); $c = psi_conta_id();
    $a = psi_carregar_agendamento($id);
    $escopo = psi_opcao($_GET['escopo'] ?? null, PSI_ESCOPOS, 'este'); if ($a['serie_id'] === null) $escopo = 'este';
    $tem = $db->prepare('SELECT COUNT(*) FROM psi_lancamentos WHERE conta_id = ? AND agendamento_id = ?'); $tem->execute([$c, $id]);
    if ($a['tipo'] === 'sessao' && (in_array($a['status'], ['realizada', 'falta', 'falta_justificada'], true) || (int)$tem->fetchColumn() > 0))
      psi_erro('Esta sessão já aconteceu ou tem cobrança registrada, então não pode ser apagada. Mude a situação (por exemplo, cancelada).', 409);
    $db->beginTransaction();
    try {
      $removidas = 1;
      $db->prepare('DELETE FROM psi_agendamentos WHERE id = ? AND conta_id = ?')->execute([$id, $c]);
      if ($escopo === 'seguintes') {
        $del = $db->prepare("DELETE FROM psi_agendamentos WHERE conta_id = ? AND serie_id = ? AND inicio > ? AND status IN ('agendada','confirmada')
          AND NOT EXISTS (SELECT 1 FROM psi_lancamentos l WHERE l.agendamento_id = psi_agendamentos.id)"); $del->execute([$c, (int)$a['serie_id'], $a['inicio']]); $removidas += $del->rowCount();
        $db->prepare('UPDATE psi_series SET fim = ?, ativa = 0 WHERE id = ? AND conta_id = ?')->execute([psi_somar_dias(substr($a['inicio'], 0, 10), -1), (int)$a['serie_id'], $c]);
      }
      $db->commit();
    } catch (Throwable $e) { $db->rollBack(); throw $e; }
    psi_auditar('apagar', 'sessao', $id);
    return ['ok' => true, 'removidas' => $removidas];
  });
}
