<?php
/**
 * Fornecedores: quem o consultório paga (aluguel, contador, materiais, sistemas...). Cadastro administrativo.
 * A ligação com as despesas é pelo NOME (campo "contraparte" do lançamento): o que já foi lançado antes do cadastro passa a aparecer
 * na ficha do fornecedor, e renomear o fornecedor renomeia a contraparte das despesas dele.
 */
declare(strict_types=1);

/** Lê e valida o cadastro de um fornecedor (usado pelo cadastro manual e pela importação de planilha). */
function psi_ler_fornecedor(array $d): array {
  return [
    'nome' => psi_txt($d['nome'] ?? null, 120, true, 'nome do fornecedor'),
    'documento' => psi_cpf($d['documento'] ?? null),
    'email' => psi_email($d['email'] ?? null, false),
    'telefone' => psi_telefone($d['telefone'] ?? null),
    'categoria_id' => psi_categoria_id($d['categoriaId'] ?? null, 'despesa'),
    'obs' => psi_txt($d['obs'] ?? null, 300),
    'ativo' => array_key_exists('ativo', $d) ? psi_bool($d['ativo']) : 1,
  ];
}

/** Garante o cadastro de um fornecedor pelo nome (para quem lança direto do extrato): devolve o nome oficial. Já existindo (sem diferenciar maiúsculas/acentos), só o reaproveita. */
function psi_fornecedor_garantir(string $nome, ?int $categoriaId): string {
  $nome = trim(preg_replace('/\s+/', ' ', $nome)); if ($nome === '') return '';
  $nome = mb_substr($nome, 0, 120); $c = psi_conta_id(); $db = psi_db();
  $s = $db->prepare('SELECT nome FROM psi_fornecedores WHERE conta_id = ? AND nome = ?'); $s->execute([$c, $nome]); $ja = $s->fetchColumn(); if ($ja !== false) return (string)$ja;
  $agora = psi_agora();
  try { $db->prepare('INSERT INTO psi_fornecedores (conta_id, nome, categoria_id, ativo, criado_em, atualizado_em) VALUES (?,?,?,1,?,?)')->execute([$c, $nome, $categoriaId, $agora, $agora]); psi_auditar('criar', 'fornecedor', (int)$db->lastInsertId(), ['origem' => 'extrato']); }
  catch (PDOException $e) { if ($e->getCode() !== '23000') throw $e; }
  return $nome;
}

function psi_fornecedor_json(array $f): array {
  $n = fn($v) => $v === null ? null : (int)$v;
  $total = (int)($f['total'] ?? 0); $pago = (int)($f['pago'] ?? 0);
  return ['id' => (int)$f['id'], 'nome' => $f['nome'], 'documento' => $f['documento'], 'email' => $f['email'], 'telefone' => $f['telefone'], 'categoriaId' => $n($f['categoria_id']),
    'obs' => $f['obs'], 'ativo' => (bool)$f['ativo'], 'lancamentos' => (int)($f['qtd'] ?? 0), 'total' => $total, 'pago' => $pago, 'emAberto' => max(0, $total - $pago), 'ultimoVencimento' => $f['ultima'] ?? null];
}

/** Fornecedores da conta com o que foi lançado (e pago) para cada um. Parâmetros: conta_id (baixas), conta_id (lançamentos), conta_id (fornecedores). */
const PSI_SQL_FORNECEDORES = "SELECT f.*, t.qtd, t.total, t.pago, t.ultima FROM psi_fornecedores f
  LEFT JOIN (SELECT l.contraparte, COUNT(*) AS qtd, SUM(l.valor) AS total, SUM(COALESCE(b.pago, 0)) AS pago, MAX(l.vencimento) AS ultima
    FROM psi_lancamentos l LEFT JOIN (SELECT lancamento_id, SUM(valor) AS pago FROM psi_baixas WHERE conta_id = ? GROUP BY lancamento_id) b ON b.lancamento_id = l.id
    WHERE l.conta_id = ? AND l.tipo = 'pagar' AND l.situacao <> 'cancelado' AND l.contraparte IS NOT NULL GROUP BY l.contraparte) t ON t.contraparte = f.nome
  WHERE f.conta_id = ?";

function psi_registrar_rotas_fornecedores(PsiRoteador $r): void {
  $r->add('GET', 'fornecedores', function () {
    $c = psi_conta_id(); $onde = ''; $par = [$c, $c, $c];
    if (($_GET['ativos'] ?? '1') !== '0') $onde .= ' AND f.ativo = 1';
    $busca = trim((string)($_GET['busca'] ?? ''));
    if ($busca !== '') { $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], mb_substr($busca, 0, 60)) . '%'; $onde .= ' AND (f.nome LIKE ? OR f.documento LIKE ? OR f.email LIKE ?)'; array_push($par, $like, $like, $like); }
    $s = psi_db()->prepare(PSI_SQL_FORNECEDORES . $onde . ' ORDER BY f.nome'); $s->execute($par);
    return ['itens' => array_map('psi_fornecedor_json', $s->fetchAll())];
  });

  $r->add('GET', 'fornecedores/{id}', function ($p) {
    $id = psi_da_conta('psi_fornecedores', $p['id'], 'Fornecedor', true); $c = psi_conta_id(); $db = psi_db();
    $s = $db->prepare(PSI_SQL_FORNECEDORES . ' AND f.id = ?'); $s->execute([$c, $c, $c, $id]); $f = psi_fornecedor_json($s->fetch());
    $l = $db->prepare("SELECT l.id, l.descricao, l.valor, l.vencimento, l.situacao, COALESCE((SELECT SUM(b.valor) FROM psi_baixas b WHERE b.lancamento_id = l.id AND b.conta_id = l.conta_id), 0) AS pago
      FROM psi_lancamentos l WHERE l.conta_id = ? AND l.tipo = 'pagar' AND l.situacao <> 'cancelado' AND l.contraparte = ? ORDER BY l.vencimento DESC, l.id DESC LIMIT 20");
    $l->execute([$c, $f['nome']]);
    $f['recentes'] = array_map(fn($x) => ['id' => (int)$x['id'], 'descricao' => $x['descricao'], 'valor' => (int)$x['valor'], 'vencimento' => $x['vencimento'], 'situacao' => $x['situacao'], 'pago' => (int)$x['pago']], $l->fetchAll());
    return ['item' => $f];
  });

  $r->add('POST', 'fornecedores', function () {
    $v = psi_ler_fornecedor(psi_corpo()); $agora = psi_agora(); $v += ['conta_id' => psi_conta_id(), 'criado_em' => $agora, 'atualizado_em' => $agora];
    try { psi_db()->prepare('INSERT INTO psi_fornecedores (' . implode(',', array_keys($v)) . ') VALUES (' . psi_marcadores($v) . ')')->execute(array_values($v)); }
    catch (PDOException $e) { if ($e->getCode() === '23000') psi_erro('Já existe um fornecedor com esse nome.', 409); throw $e; }
    $id = (int)psi_db()->lastInsertId(); psi_auditar('criar', 'fornecedor', $id);
    return ['id' => $id];
  });

  $r->add('PUT', 'fornecedores/{id}', function ($p) {
    $id = psi_da_conta('psi_fornecedores', $p['id'], 'Fornecedor', true); $c = psi_conta_id(); $db = psi_db(); $v = psi_ler_fornecedor(psi_corpo());
    $ant = $db->prepare('SELECT nome FROM psi_fornecedores WHERE id = ? AND conta_id = ?'); $ant->execute([$id, $c]); $nomeAntes = (string)$ant->fetchColumn();
    $v['atualizado_em'] = psi_agora(); $set = implode(', ', array_map(fn($k) => "$k = ?", array_keys($v)));
    try {
      $db->beginTransaction();
      $db->prepare("UPDATE psi_fornecedores SET $set WHERE id = ? AND conta_id = ?")->execute(array_merge(array_values($v), [$id, $c]));
      if ($nomeAntes !== $v['nome']) { // as despesas dele acompanham o novo nome
        $db->prepare("UPDATE psi_lancamentos SET contraparte = ? WHERE conta_id = ? AND tipo = 'pagar' AND contraparte = ?")->execute([$v['nome'], $c, $nomeAntes]);
        $db->prepare('UPDATE psi_recorrentes SET contraparte = ? WHERE conta_id = ? AND contraparte = ?')->execute([$v['nome'], $c, $nomeAntes]);
      }
      $db->commit();
    } catch (PDOException $e) { if ($db->inTransaction()) $db->rollBack(); if ($e->getCode() === '23000') psi_erro('Já existe um fornecedor com esse nome.', 409); throw $e; }
    psi_auditar('alterar', 'fornecedor', $id);
    return ['ok' => true];
  });

  /* Só apaga quem nunca teve despesa; os demais são arquivados (ativo = false) para não perder o histórico. */
  $r->add('DELETE', 'fornecedores/{id}', function ($p) {
    $id = psi_da_conta('psi_fornecedores', $p['id'], 'Fornecedor', true); $c = psi_conta_id(); $db = psi_db();
    $s = $db->prepare('SELECT (SELECT COUNT(*) FROM psi_lancamentos l WHERE l.conta_id = f.conta_id AND l.tipo = \'pagar\' AND l.contraparte = f.nome) + (SELECT COUNT(*) FROM psi_recorrentes q WHERE q.conta_id = f.conta_id AND q.contraparte = f.nome)
      FROM psi_fornecedores f WHERE f.id = ? AND f.conta_id = ?'); $s->execute([$id, $c]);
    if ((int)$s->fetchColumn() > 0) psi_erro('Este fornecedor já tem despesas registradas, então não pode ser apagado. Arquive o cadastro.', 409);
    $db->prepare('DELETE FROM psi_fornecedores WHERE id = ? AND conta_id = ?')->execute([$id, $c]);
    psi_auditar('apagar', 'fornecedor', $id);
    return ['ok' => true];
  });
}
