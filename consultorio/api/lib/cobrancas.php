<?php
/**
 * Núcleo financeiro: lançamentos (a receber / a pagar), baixas (pagamentos parciais ou totais) e a geração automática de cobranças.
 * - Sessão realizada (ou falta, conforme a política do consultório) gera um lançamento a receber, uma única vez por sessão (chave_unica "sessao:ID").
 * - Mensalistas ganham um lançamento por mês (chave_unica "mensal:PACIENTE:AAAA-MM"), então gerar de novo nunca duplica nem recria o que foi cancelado.
 * - Dinheiro sempre em centavos inteiros.
 */
declare(strict_types=1);

const PSI_SITUACOES_LANC = ['aberto', 'quitado', 'cancelado'];

/** SELECT padrão: lançamento + quanto já foi pago + dados do paciente e da categoria. Parâmetros: conta_id (baixas), conta_id (lançamentos). */
const PSI_SQL_LANCAMENTO = "SELECT l.*, COALESCE(b.pago, 0) AS pago, b.ultima AS ultima_baixa,
    p.nome AS p_nome, p.apelido AS p_apelido, p.telefone AS p_tel, p.resp_nome AS p_resp_nome, p.resp_telefone AS p_resp_tel, p.tipo AS p_tipo, p.forma_pagamento AS p_forma,
    c.nome AS cat_nome, a.inicio AS ag_inicio
  FROM psi_lancamentos l
  LEFT JOIN (SELECT lancamento_id, SUM(valor) AS pago, MAX(data) AS ultima FROM psi_baixas WHERE conta_id = ? GROUP BY lancamento_id) b ON b.lancamento_id = l.id
  LEFT JOIN psi_pacientes p ON p.id = l.paciente_id AND p.conta_id = l.conta_id
  LEFT JOIN psi_categorias c ON c.id = l.categoria_id AND c.conta_id = l.conta_id
  LEFT JOIN psi_agendamentos a ON a.id = l.agendamento_id AND a.conta_id = l.conta_id
  WHERE l.conta_id = ?";

function psi_lancamento_json(array $l): array {
  $n = fn($v) => $v === null ? null : (int)$v;
  $valor = (int)$l['valor']; $pago = (int)$l['pago']; $hoje = psi_hoje();
  $estado = $l['situacao'] === 'cancelado' ? 'cancelado' : ($l['situacao'] === 'quitado' ? 'quitado'
    : ($l['vencimento'] < $hoje ? 'atrasado' : ($l['vencimento'] === $hoje ? 'hoje' : ($pago > 0 ? 'parcial' : 'aberto'))));
  $atraso = ($l['situacao'] === 'aberto' && $l['vencimento'] < $hoje) ? (int)round((strtotime($hoje) - strtotime($l['vencimento'])) / 86400) : 0;
  return [
    'id' => (int)$l['id'], 'tipo' => $l['tipo'], 'descricao' => $l['descricao'], 'valor' => $valor, 'pago' => $pago, 'restante' => $l['situacao'] === 'cancelado' ? 0 : max(0, $valor - $pago),
    'vencimento' => $l['vencimento'], 'competencia' => $l['competencia'], 'situacao' => $l['situacao'], 'estado' => $estado, 'atraso' => $atraso, 'canceladoMotivo' => $l['cancelado_motivo'],
    'forma' => $l['forma'], 'contaFinId' => $n($l['conta_fin_id']), 'origem' => $l['origem'], 'agendamentoId' => $n($l['agendamento_id']), 'sessaoEm' => $l['ag_inicio'] ?? null,
    'grupoId' => $n($l['grupo_id']), 'parcela' => $n($l['parcela']), 'parcelas' => $n($l['parcelas']), 'categoriaId' => $n($l['categoria_id']), 'categoria' => $l['cat_nome'],
    'contraparte' => $l['contraparte'], 'obs' => $l['obs'], 'pacienteId' => $n($l['paciente_id']), 'ultimaBaixa' => $l['ultima_baixa'], 'social' => (bool)($l['social'] ?? 0), 'valorCheio' => (int)($l['valor_cheio'] ?? 0),
    'paciente' => $l['paciente_id'] === null ? null : ['id' => (int)$l['paciente_id'], 'nome' => $l['p_nome'], 'apelido' => $l['p_apelido'], 'telefone' => $l['p_tel'], 'respNome' => $l['p_resp_nome'], 'respTelefone' => $l['p_resp_tel'], 'tipo' => $l['p_tipo'], 'forma' => $l['p_forma']],
  ];
}

function psi_carregar_lancamento(int $id): array {
  $c = psi_conta_id(); $s = psi_db()->prepare(PSI_SQL_LANCAMENTO . ' AND l.id = ?'); $s->execute([$c, $c, $id]);
  $l = $s->fetch(); if (!$l) psi_erro('Lançamento não encontrado.', 404);
  return $l;
}

/** Aberto ↔ quitado conforme o que já foi pago (cancelado não muda). */
function psi_recalcular_situacao(int $id): void {
  $db = psi_db(); $c = psi_conta_id();
  $s = $db->prepare('SELECT valor, situacao FROM psi_lancamentos WHERE id = ? AND conta_id = ?'); $s->execute([$id, $c]); $l = $s->fetch();
  if (!$l || $l['situacao'] === 'cancelado') return;
  $p = $db->prepare('SELECT COALESCE(SUM(valor), 0) FROM psi_baixas WHERE lancamento_id = ? AND conta_id = ?'); $p->execute([$id, $c]);
  $nova = (int)$p->fetchColumn() >= (int)$l['valor'] ? 'quitado' : 'aberto';
  if ($nova !== $l['situacao']) $db->prepare('UPDATE psi_lancamentos SET situacao = ?, atualizado_em = ? WHERE id = ? AND conta_id = ?')->execute([$nova, psi_agora(), $id, $c]);
}

function psi_pago_do_lancamento(int $id): int {
  $s = psi_db()->prepare('SELECT COALESCE(SUM(valor), 0) FROM psi_baixas WHERE lancamento_id = ? AND conta_id = ?'); $s->execute([$id, psi_conta_id()]);
  return (int)$s->fetchColumn();
}

/** Id da categoria de receita pelo nome (as padrão) — com cache por conta. */
function psi_categoria_receita_por_nome(string $nome): ?int {
  static $cache = [];
  $k = psi_conta_id() . '|' . $nome;
  if (!array_key_exists($k, $cache)) { $s = psi_db()->prepare("SELECT id FROM psi_categorias WHERE conta_id = ? AND tipo = 'receita' AND nome = ? AND ativo = 1"); $s->execute([psi_conta_id(), $nome]); $v = $s->fetchColumn(); $cache[$k] = $v === false ? null : (int)$v; }
  return $cache[$k];
}
function psi_categoria_da_cobranca(array $pac, ?int $categoriaDoServico): ?int {
  if ($categoriaDoServico !== null) return $categoriaDoServico;
  $nome = $pac['modalidade_cobranca'] === 'convenio' ? 'Sessão individual - convênio/plano'
    : (['infantil' => 'Atendimento infantil / adolescente', 'casal' => 'Terapia de casal', 'familia' => 'Terapia familiar', 'grupo' => 'Atendimento em grupo'][$pac['tipo']] ?? 'Sessão individual - particular');
  return psi_categoria_receita_por_nome($nome);
}

/** O que a sessão deve gerar de cobrança agora (ou null: nada). */
function psi_valor_devido(array $a): ?array {
  if ($a['tipo'] !== 'sessao' || !(int)$a['cobrar'] || (int)$a['valor'] <= 0) return null;
  $dia = substr($a['inicio'], 0, 10); $dataBR = substr($dia, 8, 2) . '/' . substr($dia, 5, 2) . '/' . substr($dia, 0, 4);
  if ($a['status'] === 'realizada') return ['valor' => (int)$a['valor'], 'descricao' => "Sessão de $dataBR"];
  if ($a['status'] === 'falta') {
    $cfg = psi_config(); if (empty($cfg['cobrar_falta'])) return null;
    $pct = max(0, min(100, (int)$cfg['falta_percentual'])); $v = intdiv((int)$a['valor'] * $pct + 50, 100);
    return $v > 0 ? ['valor' => $v, 'descricao' => 'Falta em ' . $dataBR . ($pct < 100 ? " ($pct%)" : '')] : null;
  }
  return null;
}

/**
 * Mantém a cobrança da sessão coerente com a situação dela. Seguro para chamar de novo (idempotente).
 * Devolve ['acao' => criada|atualizada|reaberta|cancelada|mantida|sem_valor|null, 'lancamentoId' => ?, 'valor' => ?, 'vencimento' => ?].
 * Se já houve pagamento, a cobrança é mantida como está (o profissional ajusta à mão, se precisar).
 */
function psi_sincronizar_cobranca(int $agId): array {
  $db = psi_db(); $c = psi_conta_id();
  $s = $db->prepare('SELECT * FROM psi_agendamentos WHERE id = ? AND conta_id = ?'); $s->execute([$agId, $c]); $a = $s->fetch();
  if (!$a || $a['tipo'] !== 'sessao') return ['acao' => null];
  $chave = 'sessao:' . $agId;
  $q = $db->prepare('SELECT * FROM psi_lancamentos WHERE conta_id = ? AND chave_unica = ?'); $q->execute([$c, $chave]); $l = $q->fetch() ?: null;
  $devido = psi_valor_devido($a); $agora = psi_agora();

  if ($devido === null) {
    if ($l && $l['situacao'] !== 'cancelado') {
      if (psi_pago_do_lancamento((int)$l['id']) > 0) return ['acao' => 'mantida', 'lancamentoId' => (int)$l['id']];
      $db->prepare("UPDATE psi_lancamentos SET situacao = 'cancelado', cancelado_motivo = ?, atualizado_em = ? WHERE id = ? AND conta_id = ?")->execute(['Sessão sem cobrança', $agora, (int)$l['id'], $c]);
      psi_auditar('cancelar', 'lancamento', (int)$l['id'], ['motivo' => 'sessao']);
      return ['acao' => 'cancelada', 'lancamentoId' => (int)$l['id']];
    }
    // realizada, para cobrar, mas sem valor definido: o profissional precisa informar o valor para a cobrança nascer
    return ['acao' => ($a['status'] === 'realizada' && (int)$a['cobrar'] && (int)$a['valor'] <= 0) ? 'sem_valor' : null];
  }

  // preço social: o valor de tabela acompanha a mesma proporção cobrada (uma falta cobrada a 50% leva 50% do valor de tabela)
  $social = (int)($a['social'] ?? 0); $cheio = ($social && (int)$a['valor'] > 0 && (int)$a['valor_cheio'] > 0) ? (int)round((int)$a['valor_cheio'] * $devido['valor'] / (int)$a['valor']) : 0;
  $p = null;
  if ($a['paciente_id'] !== null) { $q2 = $db->prepare('SELECT * FROM psi_pacientes WHERE id = ? AND conta_id = ?'); $q2->execute([(int)$a['paciente_id'], $c]); $p = $q2->fetch() ?: null; }
  $dia = substr($a['inicio'], 0, 10);
  $prazo = $p ? ($p['modalidade_cobranca'] === 'convenio' ? (int)($p['convenio_prazo_dias'] ?? 30) : (int)$p['prazo_dias']) : 0;
  $venc = psi_somar_dias($dia, $prazo);

  if ($l) {
    if (psi_pago_do_lancamento((int)$l['id']) > 0) return ['acao' => 'mantida', 'lancamentoId' => (int)$l['id']];
    $db->prepare("UPDATE psi_lancamentos SET valor = ?, descricao = ?, vencimento = ?, competencia = ?, social = ?, valor_cheio = ?, situacao = 'aberto', cancelado_motivo = NULL, atualizado_em = ? WHERE id = ? AND conta_id = ?")
      ->execute([$devido['valor'], $devido['descricao'], $venc, $dia, $social, $cheio, $agora, (int)$l['id'], $c]);
    return ['acao' => $l['situacao'] === 'cancelado' ? 'reaberta' : 'atualizada', 'lancamentoId' => (int)$l['id'], 'valor' => $devido['valor'], 'vencimento' => $venc];
  }
  $catServ = null;
  if ($a['servico_id'] !== null) { $r = $db->prepare('SELECT categoria_id FROM psi_servicos WHERE id = ? AND conta_id = ?'); $r->execute([(int)$a['servico_id'], $c]); $v = $r->fetchColumn(); $catServ = ($v === false || $v === null) ? null : (int)$v; }
  $cat = $p ? psi_categoria_da_cobranca($p, $catServ) : $catServ;
  $contraparte = $p && $p['modalidade_cobranca'] === 'convenio' ? $p['convenio_nome'] : null;
  $db->prepare("INSERT IGNORE INTO psi_lancamentos (conta_id, tipo, descricao, categoria_id, paciente_id, contraparte, valor, vencimento, competencia, social, valor_cheio, situacao, origem, agendamento_id, chave_unica, criado_em, atualizado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,'aberto',?,?,?,?,?)")
    ->execute([$c, 'receber', $devido['descricao'], $cat, $a['paciente_id'], $contraparte, $devido['valor'], $venc, $dia, $social, $cheio, $p && $p['modalidade_cobranca'] === 'convenio' ? 'convenio' : 'sessao', $agId, $chave, $agora, $agora]);
  $id = (int)$db->lastInsertId(); if ($id > 0) psi_auditar('criar', 'lancamento', $id, ['origem' => 'sessao']);
  return ['acao' => 'criada', 'lancamentoId' => $id, 'valor' => $devido['valor'], 'vencimento' => $venc];
}

/** Uma mensalidade por mês (atual e próximo) para cada paciente mensalista ativo. Idempotente. */
function psi_gerar_mensalidades(): void {
  static $feito = [];
  $c = psi_conta_id(); if (isset($feito[$c])) return; $feito[$c] = true;
  $db = psi_db(); $hoje = psi_hoje();
  $s = $db->prepare("SELECT * FROM psi_pacientes WHERE conta_id = ? AND status = 'ativo' AND modalidade_cobranca = 'mensal' AND valor_mensal > 0 AND dia_vencimento IS NOT NULL"); $s->execute([$c]);
  $pacientes = $s->fetchAll(); if (!$pacientes) return;
  $meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  $ins = $db->prepare("INSERT IGNORE INTO psi_lancamentos (conta_id, tipo, descricao, categoria_id, paciente_id, valor, vencimento, competencia, social, situacao, origem, chave_unica, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?,?,'aberto','mensalidade',?,?,?)");
  $agora = psi_agora();
  foreach ([psi_inicio_mes($hoje), psi_inicio_mes(psi_somar_meses(psi_inicio_mes($hoje), 1))] as $mes) {
    $ano = (int)substr($mes, 0, 4); $m = (int)substr($mes, 5, 2); $fimMes = psi_data_no_mes($ano, $m, 31);
    foreach ($pacientes as $p) {
      $venc = psi_data_no_mes($ano, $m, (int)$p['dia_vencimento']);
      /* quem começou depois do vencimento daquele mês não nasce devendo: a primeira mensalidade é a do mês seguinte */
      if ($p['desde'] !== null && ($p['desde'] > $fimMes || $venc < $p['desde'])) continue;
      $ins->execute([$c, 'receber', 'Mensalidade de ' . $meses[$m - 1] . '/' . $ano, psi_categoria_da_cobranca($p, null), (int)$p['id'], (int)$p['valor_mensal'], $venc, $mes, (int)($p['social'] ?? 0), 'mensal:' . $p['id'] . ':' . substr($mes, 0, 7), $agora, $agora]);
    }
  }
}
