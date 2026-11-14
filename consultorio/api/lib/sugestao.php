<?php
/**
 * Sugestão de categoria para as linhas do extrato, lendo a descrição do banco. Quatro fontes, da mais confiável para a menos:
 *   1. fornecedor cadastrado cujo nome aparece na descrição (usa a categoria padrão dele ou a que você mais usou com ele);
 *   2. o que você já classificou antes (aprende com o histórico da própria conta: linhas de extrato já lançadas e lançamentos);
 *   3. paciente identificado pelo nome, para entradas (categoria que ele já usa, a do atendimento dele ou convênio/particular);
 *   4. dicionário de palavras comuns de extrato (energia, água, internet, impostos, tarifas, softwares...), resolvido contra as categorias da conta.
 * A sugestão sempre diz o motivo e nunca grava nada sozinha: quem decide é a pessoa (ou "lançar com um clique" depois de ver).
 */
declare(strict_types=1);

/** Palavras que aparecem em quase todo extrato e não dizem o que foi pago. */
const PSI_SUG_RUIDO = ['PIX', 'TED', 'DOC', 'TRANSF', 'TRANSFERENCIA', 'ENVIADO', 'ENVIADA', 'RECEBIDO', 'RECEBIDA', 'PAGAMENTO', 'PAGTO', 'PGTO', 'COMPRA', 'DEBITO', 'CREDITO', 'CARTAO', 'BOLETO', 'COBRANCA',
  'LTDA', 'EIRELI', 'EPP', 'BANCO', 'ITAU', 'BRADESCO', 'NUBANK', 'SANTANDER', 'INTER', 'CAIXA', 'SICOOB', 'SICREDI', 'CONTA', 'SALDO', 'REFERENTE', 'PARCELA', 'ONLINE', 'DEBITADO', 'CREDITADO', 'LANCAMENTO',
  'PAGO', 'PAGA', 'PARA', 'COM', 'DOS', 'DAS', 'DEPOSITO', 'AGENCIA', 'AUTOMATICO', 'AUTOMATICA', 'INTERNET', 'MOBILE', 'APLICATIVO', 'APP', 'FATURA', 'FAVORECIDO', 'REMETENTE', 'TITULAR', 'RECEBIMENTO'];

function psi_sug_ruido(): array { static $m = null; return $m ??= array_flip(PSI_SUG_RUIDO); }
/** Texto da descrição já sem acento, em maiúsculas e só com letras, números e espaços. */
function psi_sug_texto(string $s): string { return trim(preg_replace('/\s+/', ' ', preg_replace('/[^A-Z0-9]+/', ' ', psi_norm_texto($s)))); }
/** Palavras que identificam o assunto: 4+ letras, sem números e fora da lista de ruído. */
function psi_sug_tokens(string $s): array {
  $ruido = psi_sug_ruido(); $t = [];
  foreach (explode(' ', psi_sug_texto($s)) as $w) { if (strlen($w) >= 4 && !preg_match('/\d/', $w) && !isset($ruido[$w])) $t[$w] = true; }
  return array_keys($t);
}
function psi_sug_tem_palavra(string $texto, string $trecho): bool { return $trecho !== '' && str_contains(' ' . $texto . ' ', ' ' . $trecho . ' '); }

/** Dicionário: [tipo da linha, padrão na descrição (maiúsculas, sem acento), padrão no nome da categoria, rótulo da palavra]. */
function psi_sug_dicionario(): array {
  return [
    ['pagar', '/\b(ALUGUEL|LOCACAO|IMOBILIARIA)\b/', '/ALUGUEL/', 'aluguel'],
    ['pagar', '/\b(CONDOMINIO|IPTU)\b/', '/CONDOMINIO|IPTU/', 'condomínio/IPTU'],
    ['pagar', '/\b(ENERGIA|CELESC|CPFL|ENEL|CEMIG|COPEL|LIGHT|EQUATORIAL|ELEKTRO|NEOENERGIA|ENERGISA)\b/', '/ENERGIA/', 'energia'],
    ['pagar', '/\b(AGUA|SABESP|CASAN|COPASA|SANEPAR|CEDAE|EMBASA|SANESUL|SAAE|CAESB)\b/', '/AGUA/', 'água'],
    ['pagar', '/\b(VIVO|CLARO|TIM|OI|NET|TELEFONE|TELEFONIA|FIBRA|TELECOM|BRISANET|ALGAR|INTERNET)\b/', '/INTERNET|TELEFON/', 'internet/telefone'],
    ['pagar', '/\b(GOOGLE|ZOOM|MICROSOFT|ADOBE|CANVA|NOTION|DROPBOX|ICLOUD|SOFTWARE|LICENCA|ASSINATURA|HOSTINGER|GODADDY|SKYPE|CHATGPT|OPENAI|CLINCM)\b/', '/SOFTWARE|SISTEMA/', 'software/assinatura'],
    ['pagar', '/\b(PAPELARIA|KALUNGA|CARTUCHO|TONER|PAPEL)\b/', '/ESCRITORIO/', 'papelaria'],
    ['pagar', '/\b(LIMPEZA|SUPERMERCADO|SUPERMERCADOS|ATACADAO|ASSAI|CARREFOUR|CAFE)\b/', '/CONSUMO|LIMPEZA/', 'material de consumo'],
    ['pagar', '/\b(MANUTENCAO|REFORMA|PINTURA|ELETRICISTA|ENCANADOR)\b/', '/MANUTENCAO|REFORMA/', 'manutenção'],
    ['pagar', '/\b(MOVEIS|MAGAZINE|MAGALU|LEROY|KABUM|DELL|NOTEBOOK|INFORMATICA)\b/', '/MOBILIARIO|EQUIPAMENTO/', 'móveis/equipamentos'],
    ['pagar', '/\b(FACEBOOK|META|INSTAGRAM|TRAFEGO|PUBLICIDADE|MARKETING|GRAFICA|FOTOGRAFO|FOTOGRAFIA)\b/', '/MARKETING|DIVULGACAO/', 'marketing'],
    ['pagar', '/\b(SALARIO|FOLHA|FGTS|ESOCIAL|FERIAS|RESCISAO)\b/', '/SALARIO|ENCARGO/', 'salário/encargos'],
    ['pagar', '/\b(CONTABIL|CONTABILIDADE|CONTADOR|ADVOGADO|ADVOCACIA|FAXINA|DIARISTA|HONORARIOS)\b/', '/TERCEIRO/', 'serviço de terceiros'],
    ['pagar', '/\b(SUPERVISAO)\b/', '/SUPERVISAO/', 'supervisão'],
    ['pagar', '/\b(CURSO|CONGRESSO|POSGRADUACAO|UDEMY|ALURA|HOTMART|WORKSHOP|FORMACAO|LIVRARIA|SARAIVA)\b/', '/CURSO|FORMACAO/', 'curso/formação'],
    ['pagar', '/\b(CRP|CONSELHO|ANUIDADE|SINDICATO|ASSOCIACAO)\b/', '/CONSELHO|ANUIDADE|CRP/', 'conselho/anuidade'],
    ['pagar', '/\b(DAS|DARF|SIMPLES|ISS|IRPF|IRPJ|GPS|IMPOSTO|TRIBUTO|PREFEITURA|DAE)\b/', '/IMPOSTO/', 'imposto'],
    ['pagar', '/\b(TARIFA|IOF|JUROS|MULTA|MORA|CESTA|ENCARGOS)\b/', '/IMPOSTO|TAXA/', 'tarifa/taxa'],
    ['pagar', '/\b(MAQUININHA|STONE|CIELO|GETNET|PAGSEGURO|PAGBANK|SUMUP|MERCADOPAGO|PAGARME)\b/', '/MAQUININHA|GATEWAY/', 'taxa de maquininha'],
    ['pagar', '/\b(SEGURO|SEGUROS|MAPFRE|ALLIANZ|ICATU)\b/', '/SEGURO/', 'seguro'],
    ['pagar', '/\b(UBER|99POP|CABIFY|POSTO|COMBUSTIVEL|GASOLINA|ESTACIONAMENTO|PEDAGIO|SEMPARAR|PASSAGEM)\b/', '/TRANSPORTE|DESLOCAMENTO/', 'transporte'],
    ['pagar', '/\b(PROLABORE|RETIRADA|LUCROS)\b/', '/LABORE|RETIRADA/', 'pró-labore'],
    ['receber', '/\b(UNIMED|AMIL|HAPVIDA|NOTREDAME|CASSI|CONVENIO|GEAP|SAUDE)\b/', '/CONVENIO/', 'convênio'],
    ['receber', '/\b(PALESTRA|WORKSHOP|OFICINA)\b/', '/PALESTRA|WORKSHOP/', 'palestra'],
    ['receber', '/\b(CURSO|TREINAMENTO|HOTMART|EDUZZ|KIWIFY|MENTORIA)\b/', '/CURSO|TREINAMENTO/', 'curso'],
    ['receber', '/\b(LAUDO|AVALIACAO|TESTAGEM|PERICIA)\b/', '/AVALIACAO|LAUDO/', 'avaliação/laudo'],
    ['receber', '/\b(SUPERVISAO)\b/', '/SUPERVISAO/', 'supervisão'],
    ['receber', '/\b(ALUGUEL)\b/', '/ALUGUEL DE SALA/', 'aluguel de sala'],
    ['receber', '/\b(RENDIMENTO|REEMBOLSO|ESTORNO|DEVOLUCAO|CASHBACK)\b/', '/OUTRAS RECEITAS/', 'reembolso/rendimento'],
  ];
}

/** Para cada linha pendente (array com id, data, valor, descricao), a melhor categoria sugerida ou nada. */
function psi_sugerir_categorias(array $itens): array {
  if (!$itens) return [];
  $c = psi_conta_id(); $db = psi_db();
  // categorias da conta (ativas), por tipo
  $s = $db->prepare('SELECT id, tipo, nome FROM psi_categorias WHERE conta_id = ? AND ativo = 1 ORDER BY ordem, id'); $s->execute([$c]);
  $cats = []; $catNome = [];
  foreach ($s->fetchAll() as $x) { $cats[$x['tipo']][(int)$x['id']] = $x['nome']; $catNome[(int)$x['id']] = $x['nome']; }
  $porRegex = function (string $tipoCat, string $re) use ($cats): ?int { foreach ($cats[$tipoCat] ?? [] as $id => $nome) if (preg_match($re, psi_norm_texto($nome))) return (int)$id; return null; };
  $valida = fn($id, string $tipoCat): ?int => ($id !== null && isset($cats[$tipoCat][(int)$id])) ? (int)$id : null;

  // histórico: palavra → categoria → peso (linhas de extrato já lançadas valem 2; lançamentos valem 1)
  $idx = ['pagar' => [], 'receber' => []]; $exatas = ['pagar' => [], 'receber' => []];
  $h = $db->prepare("SELECT i.descricao AS texto, l.categoria_id, l.tipo FROM psi_extrato_itens i JOIN psi_lancamentos l ON l.id = i.lancamento_id AND l.conta_id = i.conta_id
    WHERE i.conta_id = ? AND i.situacao = 'conciliado' AND l.categoria_id IS NOT NULL ORDER BY i.id DESC LIMIT 1500"); $h->execute([$c]);
  foreach ($h->fetchAll() as $x) {
    $tp = $x['tipo']; $cid = (int)$x['categoria_id']; $exatas[$tp][psi_sug_texto((string)$x['texto'])][$cid] = ($exatas[$tp][psi_sug_texto((string)$x['texto'])][$cid] ?? 0) + 1;
    foreach (psi_sug_tokens((string)$x['texto']) as $t) $idx[$tp][$t][$cid] = ($idx[$tp][$t][$cid] ?? 0) + 2;
  }
  $h = $db->prepare("SELECT CONCAT_WS(' ', l.contraparte, l.descricao) AS texto, l.categoria_id, l.tipo FROM psi_lancamentos l WHERE l.conta_id = ? AND l.categoria_id IS NOT NULL AND l.situacao <> 'cancelado' ORDER BY l.id DESC LIMIT 2000"); $h->execute([$c]);
  foreach ($h->fetchAll() as $x) foreach (psi_sug_tokens((string)$x['texto']) as $t) $idx[$x['tipo']][$t][(int)$x['categoria_id']] = ($idx[$x['tipo']][$t][(int)$x['categoria_id']] ?? 0) + 1;

  // fornecedores (saídas) e pacientes (entradas)
  $forn = []; $catDoForn = [];
  $f = $db->prepare('SELECT nome, categoria_id FROM psi_fornecedores WHERE conta_id = ? AND ativo = 1'); $f->execute([$c]);
  $g = $db->prepare("SELECT contraparte, categoria_id, COUNT(*) AS n FROM psi_lancamentos WHERE conta_id = ? AND tipo = 'pagar' AND categoria_id IS NOT NULL AND contraparte IS NOT NULL GROUP BY contraparte, categoria_id"); $g->execute([$c]);
  foreach ($g->fetchAll() as $x) { $k = psi_sug_texto((string)$x['contraparte']); if (!isset($catDoForn[$k]) || (int)$x['n'] > $catDoForn[$k][1]) $catDoForn[$k] = [(int)$x['categoria_id'], (int)$x['n']]; }
  foreach ($f->fetchAll() as $x) $forn[] = ['nome' => $x['nome'], 'texto' => psi_sug_texto($x['nome']), 'tokens' => psi_sug_tokens($x['nome']), 'cat' => $valida($x['categoria_id'] !== null ? (int)$x['categoria_id'] : null, 'despesa') ?? $valida($catDoForn[psi_sug_texto($x['nome'])][0] ?? null, 'despesa')];
  $pacs = []; $catDoPac = [];
  $g = $db->prepare("SELECT paciente_id, categoria_id, COUNT(*) AS n FROM psi_lancamentos WHERE conta_id = ? AND tipo = 'receber' AND categoria_id IS NOT NULL AND paciente_id IS NOT NULL GROUP BY paciente_id, categoria_id"); $g->execute([$c]);
  foreach ($g->fetchAll() as $x) { $k = (int)$x['paciente_id']; if (!isset($catDoPac[$k]) || (int)$x['n'] > $catDoPac[$k][1]) $catDoPac[$k] = [(int)$x['categoria_id'], (int)$x['n']]; }
  $sv = $db->prepare('SELECT id, categoria_id FROM psi_servicos WHERE conta_id = ?'); $sv->execute([$c]); $catServ = []; foreach ($sv->fetchAll() as $x) $catServ[(int)$x['id']] = $x['categoria_id'] !== null ? (int)$x['categoria_id'] : null;
  $p = $db->prepare('SELECT id, nome, apelido, servico_id, modalidade_cobranca FROM psi_pacientes WHERE conta_id = ?'); $p->execute([$c]);
  foreach ($p->fetchAll() as $x) {
    $tk = psi_sug_tokens($x['nome']); if (count($tk) < 2 && strlen(psi_sug_texto($x['nome'])) < 8) continue;
    $cat = $valida($catDoPac[(int)$x['id']][0] ?? null, 'receita') ?? $valida($catServ[(int)($x['servico_id'] ?? 0)] ?? null, 'receita')
      ?? ($x['modalidade_cobranca'] === 'convenio' ? $porRegex('receita', '/CONVENIO/') : $porRegex('receita', '/PARTICULAR/'));
    $pacs[] = ['id' => (int)$x['id'], 'nome' => $x['nome'], 'texto' => psi_sug_texto($x['nome']), 'tokens' => $tk, 'cat' => $cat];
  }
  $dic = psi_sug_dicionario(); $saida = [];

  foreach ($itens as $it) {
    $entrada = (int)$it['valor'] > 0; $tp = $entrada ? 'receber' : 'pagar'; $tipoCat = $entrada ? 'receita' : 'despesa';
    $texto = psi_sug_texto((string)$it['descricao']); $tokens = psi_sug_tokens((string)$it['descricao']); $cand = [];
    // 1) fornecedor cadastrado (saídas)
    if (!$entrada) foreach ($forn as $fo) {
      $score = 0;
      if (strlen($fo['texto']) >= 4 && psi_sug_tem_palavra($texto, $fo['texto'])) $score = 90;
      elseif ($fo['tokens'] && count(array_filter($fo['tokens'], fn($t) => psi_sug_tem_palavra($texto, $t))) === count($fo['tokens']) && (count($fo['tokens']) >= 2 || strlen($fo['tokens'][0]) >= 6)) $score = 80;
      if ($score) $cand[] = ['score' => $score, 'cat' => $fo['cat'], 'origem' => 'fornecedor', 'motivo' => 'Fornecedor cadastrado: ' . $fo['nome'] . '.', 'contraparte' => $fo['nome']];
    }
    // 3) paciente identificado (entradas)
    if ($entrada) foreach ($pacs as $pa) {
      $score = 0;
      if (psi_sug_tem_palavra($texto, $pa['texto'])) $score = 85;
      elseif (count($pa['tokens']) >= 2 && count(array_filter($pa['tokens'], fn($t) => psi_sug_tem_palavra($texto, $t))) >= 2) $score = 75;
      if ($score) $cand[] = ['score' => $score, 'cat' => $pa['cat'], 'origem' => 'paciente', 'motivo' => 'Paciente identificado: ' . $pa['nome'] . '.', 'pacienteId' => $pa['id']];
    }
    // 2) o que você já classificou antes
    $votos = []; $palavras = []; $maisUsada = [];
    foreach ($tokens as $t) {
      $d = $idx[$tp][$t] ?? null; if (!$d) continue; $total = array_sum($d); arsort($d); $cid = (int)array_key_first($d); $parte = $d[$cid] / $total;
      if ($parte >= 0.7) { $votos[$cid] = ($votos[$cid] ?? 0) + min($total, 8) * $parte; $palavras[$cid][] = $t; $maisUsada[$cid] = max($maisUsada[$cid] ?? 0, $total); }
    }
    $iguais = $exatas[$tp][$texto] ?? null; if ($iguais) { arsort($iguais); $cid = (int)array_key_first($iguais); $votos[$cid] = ($votos[$cid] ?? 0) + 6; $palavras[$cid] = $palavras[$cid] ?? []; }
    if ($votos) {
      arsort($votos); $cid = (int)array_key_first($votos); $v = $votos[$cid];
      $cand[] = ['score' => (int)min(89, 55 + $v * 6), 'cat' => $cid, 'origem' => 'historico',
        'motivo' => $iguais && (int)array_key_first($iguais) === $cid ? 'Você já lançou uma linha igual a esta nesta categoria.' : 'Você já usou esta categoria com "' . implode(' ', array_slice($palavras[$cid], 0, 2)) . '" (' . ($maisUsada[$cid] ?? 1) . ' ' . (($maisUsada[$cid] ?? 1) === 1 ? 'vez' : 'vezes') . ').'];
    }
    // 4) dicionário de palavras comuns
    foreach ($dic as [$tpD, $reDesc, $reCat, $rotulo]) {
      if ($tpD !== $tp || !preg_match($reDesc, $texto)) continue;
      $cat = $porRegex($tipoCat, $reCat); if ($cat !== null) { $cand[] = ['score' => 66, 'cat' => $cat, 'origem' => 'palavra', 'motivo' => 'A descrição fala em ' . $rotulo . '.']; break; }
    }
    // escolhe: a de maior pontuação que tenha categoria; se só há fornecedor/paciente sem categoria, devolve a identificação sem categoria
    $cand = array_values(array_filter($cand, fn($x) => true)); usort($cand, fn($a, $b) => $b['score'] <=> $a['score']);
    $escolhida = null; $identidade = null;
    foreach ($cand as $x) {
      if (($x['origem'] === 'fornecedor' || $x['origem'] === 'paciente') && $identidade === null) $identidade = $x;
      if ($x['cat'] !== null && isset($catNome[$x['cat']]) && ($cats[$tipoCat][$x['cat']] ?? null) !== null) { $escolhida = $x; break; }
    }
    if ($escolhida === null && $identidade === null) continue;
    $base = $escolhida ?? $identidade; $score = $base['score'];
    $saida[(int)$it['id']] = ['categoriaId' => $escolhida ? (int)$escolhida['cat'] : null, 'categoria' => $escolhida ? $catNome[(int)$escolhida['cat']] : null, 'origem' => $base['origem'], 'confianca' => $score >= 85 ? 'alta' : ($score >= 65 ? 'media' : 'baixa'),
      'motivo' => $base['motivo'] . ($escolhida === null ? ' Ainda sem categoria padrão.' : ''), 'contraparte' => $base['contraparte'] ?? ($identidade['contraparte'] ?? null), 'pacienteId' => $base['pacienteId'] ?? ($identidade['pacienteId'] ?? null)];
  }
  return $saida;
}
