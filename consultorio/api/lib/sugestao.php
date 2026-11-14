<?php
/**
 * Sugestões para as linhas do extrato, lendo a descrição do banco: categoria, fornecedor e o que fazer (transferência entre contas).
 *
 * Primeiro tira o ruído do banco (PIX, TED, "compra no débito", datas, CPF mascarado) e fica com o FAVORECIDO ("Marcenaria Ze"). Com ele:
 *   fornecedor: cadastrado cujo nome aparece na descrição (tolerante a nome cortado pelo banco) → que você já usou nesse favorecido → novo (nome extraído, cadastrado ao lançar);
 *   categoria:  fornecedor cadastrado → paciente (entradas) → o que você já classificou antes → nome das SUAS categorias → dicionário de termos de extrato → palpite para entradas de pessoa física.
 * Cada sugestão traz o motivo em português e uma confiança (alta ≥ 85, média ≥ 65, baixa); nunca grava nada sozinha. "grupo" junta linhas do mesmo favorecido para classificar de uma vez.
 */
declare(strict_types=1);

/** Palavras que aparecem em quase todo extrato e não dizem o que foi pago nem a quem. */
const PSI_SUG_RUIDO = ['PIX', 'TED', 'DOC', 'TRANSF', 'TRANSFERENCIA', 'ENVIADO', 'ENVIADA', 'RECEBIDO', 'RECEBIDA', 'PAGAMENTO', 'PAGTO', 'PGTO', 'PAG', 'COMPRA', 'DEBITO', 'CREDITO', 'CARTAO', 'BOLETO', 'COBRANCA',
  'LTDA', 'EIRELI', 'EPP', 'BANCO', 'ITAU', 'BRADESCO', 'NUBANK', 'SANTANDER', 'INTER', 'CAIXA', 'SICOOB', 'SICREDI', 'CONTA', 'SALDO', 'REFERENTE', 'PARCELA', 'ONLINE', 'DEBITADO', 'CREDITADO', 'LANCAMENTO',
  'PAGO', 'PAGA', 'PARA', 'COM', 'DOS', 'DAS', 'DEPOSITO', 'AGENCIA', 'AUTOMATICO', 'AUTOMATICA', 'MOBILE', 'APLICATIVO', 'APP', 'FATURA', 'FAVORECIDO', 'REMETENTE', 'TITULAR', 'RECEBIMENTO',
  'QRS', 'CODE', 'AUT', 'DEB', 'PELO', 'NOS', 'NAS', 'POR', 'UMA', 'EFETUADO', 'EFETUADA', 'REALIZADO', 'REALIZADA', 'SISPAG', 'TRANSACAO', 'MOVIMENTACAO', 'CODIGO', 'DATA', 'HORA', 'NUMERO', 'PAGADOR', 'BENEFICIARIO', 'CRED', 'BANKING', 'TRANSFERIDA', 'TRANSFERIDO', 'COBRANCA', 'PGTO'];

function psi_sug_ruido(): array { static $m = null; return $m ??= array_flip(PSI_SUG_RUIDO); }
/** Texto da descrição já sem acento, em maiúsculas e só com letras, números e espaços. */
function psi_sug_texto(string $s): string { return trim(preg_replace('/\s+/', ' ', preg_replace('/[^A-Z0-9]+/', ' ', psi_norm_texto($s)))); }
/** Palavras de assunto: 4+ letras, sem números e fora do ruído (para histórico e categorias). */
function psi_sug_tokens(string $s): array {
  $ruido = psi_sug_ruido(); $t = [];
  foreach (explode(' ', psi_sug_texto($s)) as $w) { if (strlen($w) >= 4 && !preg_match('/\d/', $w) && !isset($ruido[$w])) $t[$w] = true; }
  return array_keys($t);
}
function psi_sug_tem_palavra(string $texto, string $trecho): bool { return $trecho !== '' && str_contains(' ' . $texto . ' ', ' ' . $trecho . ' '); }
/** Tira o "S" do plural para comparar (TAXAS = TAXA). */
function psi_sug_radical(string $w): string { return strlen($w) > 4 && str_ends_with($w, 'S') ? substr($w, 0, -1) : $w; }
/** Duas palavras "são a mesma" se iguais (no singular) ou se uma é o começo da outra (o banco corta nomes longos: IMOBILIARIA CENTR). */
function psi_sug_casa(string $a, string $b): bool {
  $a = psi_sug_radical($a); $b = psi_sug_radical($b); if ($a === $b) return true;
  return strlen($a) >= 5 && strlen($b) >= 5 && (str_starts_with($a, $b) || str_starts_with($b, $a));
}
function psi_sug_conta_casos(array $tokensLinha, array $tokensNome): int {
  $n = 0; foreach ($tokensNome as $nt) foreach ($tokensLinha as $lt) if (psi_sug_casa($lt, $nt)) { $n++; break; } return $n;
}

/** O favorecido da linha: as palavras que sobram depois de tirar o ruído (de 3 letras em diante), na ordem, um nome para exibir ("Jose da Silva") e uma chave para agrupar. */
function psi_sug_favorecido(string $desc): array {
  $ruido = psi_sug_ruido(); $conectivos = ['DA', 'DE', 'DO', 'DOS', 'DAS', 'E'];
  // palavras de 2 letras só entram se parecerem nome ("Zé"); ficam de fora conectivos, estados e siglas de banco
  $parada = array_flip(array_merge($conectivos, ['NAS', 'NOS', 'EMP', 'COM', 'SAO', 'EM', 'NA', 'NO', 'AO', 'AS', 'OS', 'PF', 'PJ', 'CC', 'CP', 'SA', 'ME', 'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO', 'BR', 'US', 'CA']));
  $pal = explode(' ', psi_sug_texto($desc)); $pos = []; $vistos = [];
  foreach ($pal as $i => $w) { if (strlen($w) >= 2 && !preg_match('/\d/', $w) && !isset($ruido[$w]) && !isset($parada[$w]) && !isset($vistos[$w])) { $pos[] = $i; $vistos[$w] = true; if (count($pos) === 4) break; } }
  $t = []; $exib = [];
  foreach ($pos as $k => $i) {
    $t[] = $pal[$i]; $exib[] = mb_convert_case(strtolower($pal[$i]), MB_CASE_TITLE, 'UTF-8');
    if (isset($pos[$k + 1]) && $pos[$k + 1] === $i + 2 && in_array($pal[$i + 1], $conectivos, true)) $exib[] = strtolower($pal[$i + 1]);
  }
  $chave = $t ? $t[0] . (isset($t[1]) ? ' ' . substr($t[1], 0, 4) : '') : '';
  return ['tokens' => $t, 'nome' => implode(' ', $exib), 'chave' => $chave];
}

/** Linhas que não são de um fornecedor (tarifas, impostos, rendimentos, saques...). */
const PSI_SUG_SEM_FORNECEDOR = '/\b(TARIFA|IOF|JUROS|MULTA|MORA|ENCARGOS|CESTA|IMPOSTO|TRIBUTO|SALDO|RENDIMENTO|RESGATE|APLICACAO|SAQUE|FATURA|ANUIDADE|DARF|GPS|ISS|IRPF|IRPJ|SIMPLES|PACOTE)\b/';
/** Parece movimentação entre contas da própria pessoa, pagamento de fatura de cartão ou aplicação. */
const PSI_SUG_TRANSFERENCIA = '/\b(MESMA TITULARIDADE|PROPRIA CONTA|ENTRE CONTAS|PGTO FATURA|PAG FATURA|PAGAMENTO (DE )?FATURA|FATURA (CARTAO|PAGA)|APLICACAO|RESGATE|APLIC AUT|RESG AUT)\b/';
const PSI_SUG_RENDIMENTO = '/\b(REND|RENDIMENTO|RENDIMENTOS|JUROS S CAPITAL)\b/';

/** Dicionário: [tipo da linha, padrão na descrição (maiúsculas, sem acento), padrão no nome da categoria, rótulo da palavra]. */
function psi_sug_dicionario(): array {
  return [
    ['pagar', '/\b(ALUGUEL|LOCACAO|IMOBILIARIA|IMOBILIARIO|IMOVEIS|COWORKING)\b/', '/ALUGUEL/', 'aluguel'],
    ['pagar', '/\b(CONDOMINIO|IPTU)\b/', '/CONDOMINIO|IPTU/', 'condomínio/IPTU'],
    ['pagar', '/\b(ENERGIA|ENERGISA|CELESC|CPFL|ENEL|CEMIG|COPEL|LIGHT|EQUATORIAL|ELEKTRO|NEOENERGIA|ELETROPAULO|CELPE|COELBA|RGE|EDP|ELETRICA)\b/', '/ENERGIA|LUZ/', 'energia'],
    ['pagar', '/\b(AGUA|SABESP|CASAN|COPASA|SANEPAR|CEDAE|EMBASA|SANESUL|SAAE|CAESB|COMPESA|CAGECE|SAMAE|ESGOTO)\b/', '/AGUA/', 'água'],
    ['pagar', '/\b(VIVO|CLARO|TIM|OI|NET|NEXTEL|SKY|GVT|UNIFIQUE|BRISANET|ALGAR|TELEFONE|TELEFONIA|FIBRA|TELECOM|INTERNET)\b/', '/INTERNET|TELEFON/', 'internet/telefone'],
    ['pagar', '/\b(GOOGLE|ZOOM|MICROSOFT|ADOBE|CANVA|NOTION|DROPBOX|ICLOUD|SOFTWARE|LICENCA|ASSINATURA|HOSTINGER|GODADDY|SKYPE|CHATGPT|OPENAI|CLINCM|MAILCHIMP|WIX|SQUARESPACE)\b/', '/SOFTWARE|SISTEMA/', 'software/assinatura'],
    ['pagar', '/\b(PAPELARIA|KALUNGA|CARTUCHO|TONER|PAPEL|PACIFIC)\b/', '/ESCRITORIO/', 'papelaria'],
    ['pagar', '/\b(LIMPEZA|SUPERMERCADO|SUPERMERCADOS|ATACADAO|ASSAI|CARREFOUR|COMPER|ZAFFARI|ANGELONI|BISTEK|CAFE|PADARIA)\b/', '/CONSUMO|LIMPEZA/', 'material de consumo'],
    ['pagar', '/\b(MANUTENCAO|REFORMA|PINTURA|ELETRICISTA|ENCANADOR|CHAVEIRO|LEROY|TELHANORTE|CONSTRUCAO|CLIMATIZACAO)\b/', '/MANUTENCAO|REFORMA/', 'manutenção'],
    ['pagar', '/\b(MOVEIS|MAGAZINE|MAGALU|KABUM|DELL|NOTEBOOK|INFORMATICA|CASAS BAHIA|FAST SHOP|AMERICANAS|TOK STOK|SAMSUNG|LENOVO|MERCADOLIVRE|MERCADO LIVRE|AMAZON|SHOPEE|ALIEXPRESS)\b/', '/MOBILIARIO|EQUIPAMENTO/', 'móveis/equipamentos'],
    ['pagar', '/\b(FACEBOOK|META|INSTAGRAM|TRAFEGO|PUBLICIDADE|MARKETING|GRAFICA|FOTOGRAFO|FOTOGRAFIA|DESIGN|IMPRESSAO)\b/', '/MARKETING|DIVULGACAO/', 'marketing'],
    ['pagar', '/\b(SALARIO|FOLHA|FGTS|ESOCIAL|FERIAS|RESCISAO|INSS)\b/', '/SALARIO|ENCARGO/', 'salário/encargos'],
    ['pagar', '/\b(CONTABIL|CONTABILIDADE|CONTADOR|ADVOGADO|ADVOCACIA|FAXINA|DIARISTA|HONORARIOS|DESPACHANTE)\b/', '/TERCEIRO/', 'serviço de terceiros'],
    ['pagar', '/\b(SUPERVISAO|SUPERVISOR|SUPERVISORA)\b/', '/SUPERVISAO/', 'supervisão'],
    ['pagar', '/\b(CURSO|CONGRESSO|POSGRADUACAO|UDEMY|ALURA|HOTMART|WORKSHOP|FORMACAO|LIVRARIA|SARAIVA|SYMPLA|FACULDADE|UNIVERSIDADE|ESPECIALIZACAO)\b/', '/CURSO|FORMACAO/', 'curso/formação'],
    ['pagar', '/\b(CRP|CONSELHO|ANUIDADE|SINDICATO|ASSOCIACAO|SOCIEDADE)\b/', '/CONSELHO|ANUIDADE|CRP/', 'conselho/anuidade'],
    ['pagar', '/\b(PGDAS|DAS MEI|GUIA DAS|DARF|SIMPLES|ISS|IRPF|IRPJ|GPS|IMPOSTO|TRIBUTO|PREFEITURA|DAE|ALVARA)\b/', '/IMPOSTO/', 'imposto'],
    ['pagar', '/\b(TARIFA|IOF|JUROS|MULTA|MORA|CESTA|ENCARGOS|PACOTE)\b/', '/IMPOSTO|TAXA|TARIFA/', 'tarifa/taxa'],
    ['pagar', '/\b(MAQUININHA|STONE|CIELO|GETNET|PAGSEGURO|PAGBANK|SUMUP|MERCADOPAGO|PAGARME|ELAVON|SAFRAPAY|INFINITEPAY)\b/', '/MAQUININHA|GATEWAY/', 'taxa de maquininha'],
    ['pagar', '/\b(SEGURO|SEGUROS|MAPFRE|ALLIANZ|ICATU|TOKIO)\b/', '/SEGURO/', 'seguro'],
    ['pagar', '/\b(UBER|99POP|CABIFY|POSTO|COMBUSTIVEL|GASOLINA|ESTACIONAMENTO|PEDAGIO|SEMPARAR|CONECTCAR|PASSAGEM|IPIRANGA|SHELL|PETROBRAS|BUSER|CLICKBUS)\b/', '/TRANSPORTE|DESLOCAMENTO/', 'transporte'],
    ['pagar', '/\b(PROLABORE|RETIRADA|LUCROS)\b/', '/LABORE|RETIRADA/', 'pró-labore'],
    ['receber', '/\b(UNIMED|AMIL|HAPVIDA|NOTREDAME|CASSI|CONVENIO|GEAP|SAUDE)\b/', '/CONVENIO/', 'convênio'],
    ['receber', '/\b(PALESTRA|WORKSHOP|OFICINA)\b/', '/PALESTRA|WORKSHOP/', 'palestra'],
    ['receber', '/\b(CURSO|TREINAMENTO|HOTMART|EDUZZ|KIWIFY|MENTORIA)\b/', '/CURSO|TREINAMENTO/', 'curso'],
    ['receber', '/\b(LAUDO|AVALIACAO|TESTAGEM|PERICIA)\b/', '/AVALIACAO|LAUDO/', 'avaliação/laudo'],
    ['receber', '/\b(SUPERVISAO)\b/', '/SUPERVISAO/', 'supervisão'],
    ['receber', '/\b(ALUGUEL)\b/', '/ALUGUEL DE SALA/', 'aluguel de sala'],
    ['receber', '/\b(REND|RENDIMENTO|RENDIMENTOS|REEMBOLSO|ESTORNO|DEVOLUCAO|CASHBACK)\b/', '/OUTRAS RECEITAS/', 'reembolso/rendimento'],
    ['receber', '/\b(PAGSEGURO|PAGBANK|STONE|CIELO|GETNET|SUMUP|MERCADOPAGO|MERCADO PAGO|PAGARME|REDE|INFINITEPAY|SAFRAPAY)\b/', '/PARTICULAR/', 'recebimento da maquininha/link de pagamento'],
  ];
}

/** Palavras de categoria que não ajudam a reconhecer nada (aparecem em muitas categorias). */
const PSI_SUG_GENERICAS_CATEGORIA = ['CLINICA', 'CLINICO', 'CLINICAS', 'CONSULTORIO', 'OUTRAS', 'OUTROS', 'DESPESAS', 'RECEITAS', 'SERVICOS', 'SERVICO', 'PRESTADA', 'MINISTRADO', 'SESSAO', 'INDIVIDUAL', 'ATENDIMENTO', 'PARTICULAR', 'PLANO', 'SOCIO', 'ESPACO', 'SALA'];

/** Motor: para cada linha pendente (id, data, valor, descricao) devolve categoria, fornecedor, ação sugerida e o grupo do favorecido. */
function psi_sug_motor(array $itens): array {
  if (!$itens) return [];
  $c = psi_conta_id(); $db = psi_db();
  // categorias ativas da conta
  $s = $db->prepare('SELECT id, tipo, nome FROM psi_categorias WHERE conta_id = ? AND ativo = 1 ORDER BY ordem, id'); $s->execute([$c]);
  $cats = []; $catNome = []; $catTokens = []; $generica = array_flip(PSI_SUG_GENERICAS_CATEGORIA);
  foreach ($s->fetchAll() as $x) {
    $cats[$x['tipo']][(int)$x['id']] = $x['nome']; $catNome[(int)$x['id']] = $x['nome'];
    $catTokens[$x['tipo']][(int)$x['id']] = array_values(array_filter(psi_sug_tokens($x['nome']), fn($w) => strlen($w) >= 5 && !isset($generica[$w])));
  }
  $porRegex = function (string $tipoCat, string $re) use ($cats): ?int { foreach ($cats[$tipoCat] ?? [] as $id => $nome) if (preg_match($re, psi_norm_texto($nome))) return (int)$id; return null; };
  $valida = fn($id, string $tipoCat): ?int => ($id !== null && isset($cats[$tipoCat][(int)$id])) ? (int)$id : null;

  // histórico: palavra → categoria → peso (linhas de extrato já lançadas valem 2; lançamentos valem 1) e palavra → fornecedor
  $idx = ['pagar' => [], 'receber' => []]; $exatas = ['pagar' => [], 'receber' => []]; $idxForn = ['pagar' => [], 'receber' => []];
  $h = $db->prepare("SELECT i.descricao AS texto, l.categoria_id, l.tipo, l.contraparte FROM psi_extrato_itens i JOIN psi_lancamentos l ON l.id = i.lancamento_id AND l.conta_id = i.conta_id
    WHERE i.conta_id = ? AND i.situacao = 'conciliado' ORDER BY i.id DESC LIMIT 2000"); $h->execute([$c]);
  foreach ($h->fetchAll() as $x) {
    $tp = $x['tipo']; $cid = $x['categoria_id'] === null ? null : (int)$x['categoria_id']; $tk = psi_sug_texto((string)$x['texto']);
    if ($cid !== null) $exatas[$tp][$tk][$cid] = ($exatas[$tp][$tk][$cid] ?? 0) + 1;
    foreach (psi_sug_tokens((string)$x['texto']) as $t) {
      if ($cid !== null) $idx[$tp][$t][$cid] = ($idx[$tp][$t][$cid] ?? 0) + 2;
      if ($x['contraparte'] !== null && $x['contraparte'] !== '') $idxForn[$tp][$t][$x['contraparte']] = ($idxForn[$tp][$t][$x['contraparte']] ?? 0) + 2;
    }
  }
  $h = $db->prepare("SELECT CONCAT_WS(' ', l.contraparte, l.descricao) AS texto, l.categoria_id, l.tipo, l.contraparte FROM psi_lancamentos l WHERE l.conta_id = ? AND l.situacao <> 'cancelado' AND (l.categoria_id IS NOT NULL OR l.contraparte IS NOT NULL) ORDER BY l.id DESC LIMIT 3000"); $h->execute([$c]);
  foreach ($h->fetchAll() as $x) foreach (psi_sug_tokens((string)$x['texto']) as $t) {
    if ($x['categoria_id'] !== null) $idx[$x['tipo']][$t][(int)$x['categoria_id']] = ($idx[$x['tipo']][$t][(int)$x['categoria_id']] ?? 0) + 1;
    if ($x['contraparte'] !== null && $x['contraparte'] !== '') $idxForn[$x['tipo']][$t][$x['contraparte']] = ($idxForn[$x['tipo']][$t][$x['contraparte']] ?? 0) + 1;
  }

  // fornecedores (saídas) e pacientes (entradas)
  $forn = []; $catDoForn = [];
  $g = $db->prepare("SELECT contraparte, categoria_id, COUNT(*) AS n FROM psi_lancamentos WHERE conta_id = ? AND tipo = 'pagar' AND categoria_id IS NOT NULL AND contraparte IS NOT NULL GROUP BY contraparte, categoria_id"); $g->execute([$c]);
  foreach ($g->fetchAll() as $x) { $k = psi_sug_texto((string)$x['contraparte']); if (!isset($catDoForn[$k]) || (int)$x['n'] > $catDoForn[$k][1]) $catDoForn[$k] = [(int)$x['categoria_id'], (int)$x['n']]; }
  $f = $db->prepare('SELECT id, nome, categoria_id FROM psi_fornecedores WHERE conta_id = ? AND ativo = 1'); $f->execute([$c]);
  foreach ($f->fetchAll() as $x) {
    $tx = psi_sug_texto($x['nome']);
    $forn[] = ['id' => (int)$x['id'], 'nome' => $x['nome'], 'texto' => $tx, 'tokens' => array_values(array_filter(explode(' ', $tx), fn($w) => strlen($w) >= 4 && !isset(psi_sug_ruido()[$w]) && !preg_match('/\d/', $w))),
      'cat' => $valida($x['categoria_id'] !== null ? (int)$x['categoria_id'] : null, 'despesa') ?? $valida($catDoForn[$tx][0] ?? null, 'despesa')];
  }
  $pacs = []; $catDoPac = [];
  $g = $db->prepare("SELECT paciente_id, categoria_id, COUNT(*) AS n FROM psi_lancamentos WHERE conta_id = ? AND tipo = 'receber' AND categoria_id IS NOT NULL AND paciente_id IS NOT NULL GROUP BY paciente_id, categoria_id"); $g->execute([$c]);
  foreach ($g->fetchAll() as $x) { $k = (int)$x['paciente_id']; if (!isset($catDoPac[$k]) || (int)$x['n'] > $catDoPac[$k][1]) $catDoPac[$k] = [(int)$x['categoria_id'], (int)$x['n']]; }
  $sv = $db->prepare('SELECT id, categoria_id FROM psi_servicos WHERE conta_id = ?'); $sv->execute([$c]); $catServ = []; foreach ($sv->fetchAll() as $x) $catServ[(int)$x['id']] = $x['categoria_id'] !== null ? (int)$x['categoria_id'] : null;
  $p = $db->prepare('SELECT id, nome, servico_id, modalidade_cobranca FROM psi_pacientes WHERE conta_id = ?'); $p->execute([$c]);
  foreach ($p->fetchAll() as $x) {
    $tk = psi_sug_tokens($x['nome']); if (count($tk) < 2 && strlen(psi_sug_texto($x['nome'])) < 8) continue;
    $cat = $valida($catDoPac[(int)$x['id']][0] ?? null, 'receita') ?? $valida($catServ[(int)($x['servico_id'] ?? 0)] ?? null, 'receita')
      ?? ($x['modalidade_cobranca'] === 'convenio' ? $porRegex('receita', '/CONVENIO/') : $porRegex('receita', '/PARTICULAR/'));
    $pacs[] = ['id' => (int)$x['id'], 'nome' => $x['nome'], 'texto' => psi_sug_texto($x['nome']), 'tokens' => $tk, 'cat' => $cat];
  }
  $dic = psi_sug_dicionario(); $saida = [];
  $conf = fn(int $sc): string => $sc >= 85 ? 'alta' : ($sc >= 65 ? 'media' : 'baixa');

  foreach ($itens as $it) {
    $entrada = (int)$it['valor'] > 0; $tp = $entrada ? 'receber' : 'pagar'; $tipoCat = $entrada ? 'receita' : 'despesa';
    $texto = psi_sug_texto((string)$it['descricao']); $textoDic = trim(strtr($texto, ['INTERNET BANKING' => ' ', 'MOBILE BANKING' => ' ', 'HOME BANKING' => ' ', 'PAGSEGURO INTERNET' => 'PAGSEGURO'])); $tokens = psi_sug_tokens($textoDic); $fav = psi_sug_favorecido($textoDic);
    $cand = []; $fornSug = null; $acao = preg_match(PSI_SUG_TRANSFERENCIA, $texto) && !preg_match(PSI_SUG_RENDIMENTO, $texto) ? 'transferencia' : null;

    // 1) fornecedor cadastrado (saídas), tolerante a nome cortado pelo banco
    if (!$entrada) foreach ($forn as $fo) {
      $score = 0;
      if (strlen($fo['texto']) >= 4 && psi_sug_tem_palavra($texto, $fo['texto'])) $score = 90;
      elseif ($fo['tokens']) {
        $m = psi_sug_conta_casos($fav['tokens'], $fo['tokens']); $k = count($fo['tokens']);
        if ($m === $k && ($k >= 2 || strlen($fo['tokens'][0]) >= 5)) $score = 82; elseif ($k >= 2 && $m >= 2) $score = 72;   // uma palavra só em comum ("Marcenaria") não basta para dizer que é o mesmo fornecedor
      }
      if ($score) {
        $cand[] = ['score' => $score, 'cat' => $fo['cat'], 'origem' => 'fornecedor', 'motivo' => 'Fornecedor cadastrado: ' . $fo['nome'] . '.', 'contraparte' => $fo['nome']];
        if ($fornSug === null || $score > $fornSug['score']) $fornSug = ['nome' => $fo['nome'], 'id' => $fo['id'], 'origem' => 'cadastrado', 'score' => $score, 'motivo' => $score >= 80 ? 'Fornecedor cadastrado.' : 'Parece o fornecedor cadastrado.'];
      }
    }
    // 3) paciente identificado (entradas), tolerante a nome cortado
    if ($entrada) foreach ($pacs as $pa) {
      $score = 0;
      if (psi_sug_tem_palavra($texto, $pa['texto'])) $score = 85;
      elseif (count($pa['tokens']) >= 2 && psi_sug_conta_casos($fav['tokens'], $pa['tokens']) >= 2) $score = 75;
      if ($score) $cand[] = ['score' => $score, 'cat' => $pa['cat'], 'origem' => 'paciente', 'motivo' => 'Paciente identificado: ' . $pa['nome'] . '.', 'pacienteId' => $pa['id']];
    }
    // 2) o que você já classificou antes (categoria) e já usou com esse favorecido (fornecedor)
    $votos = []; $palavras = []; $maisUsada = []; $votosF = []; $totalF = [];
    foreach ($tokens as $t) {
      $d = $idx[$tp][$t] ?? null;
      if ($d) {
        $total = array_sum($d); arsort($d); $cid = (int)array_key_first($d); $parte = $d[$cid] / $total;
        if ($parte >= 0.7) { $votos[$cid] = ($votos[$cid] ?? 0) + min($total, 8) * $parte; $palavras[$cid][] = $t; $maisUsada[$cid] = max($maisUsada[$cid] ?? 0, $total); }
      }
      $df = $idxForn[$tp][$t] ?? null;
      if ($df) { $tot = array_sum($df); arsort($df); $nm = (string)array_key_first($df); if ($df[$nm] / $tot >= 0.7) { $votosF[$nm] = ($votosF[$nm] ?? 0) + min($tot, 8) * ($df[$nm] / $tot); $totalF[$nm] = max($totalF[$nm] ?? 0, $tot); } }
    }
    $iguais = $exatas[$tp][$texto] ?? null; if ($iguais) { arsort($iguais); $cid = (int)array_key_first($iguais); $votos[$cid] = ($votos[$cid] ?? 0) + 6; $palavras[$cid] = $palavras[$cid] ?? []; }
    if ($votos) {
      arsort($votos); $cid = (int)array_key_first($votos); $v = $votos[$cid];
      $cand[] = ['score' => (int)min(89, 55 + $v * 6), 'cat' => $cid, 'origem' => 'historico',
        'motivo' => $iguais && (int)array_key_first($iguais) === $cid ? 'Você já lançou uma linha igual a esta nesta categoria.' : 'Você já usou esta categoria com "' . implode(' ', array_slice($palavras[$cid], 0, 2)) . '" (' . ($maisUsada[$cid] ?? 1) . ' ' . (($maisUsada[$cid] ?? 1) === 1 ? 'vez' : 'vezes') . ').'];
    }
    if ($votosF && !$entrada && ($fornSug === null || $fornSug['score'] < 80)) {
      arsort($votosF); $nm = (string)array_key_first($votosF); $kf = psi_sug_texto($nm); $sc = (int)min(85, 55 + $votosF[$nm] * 6);
      $fornSug = ['nome' => $nm, 'id' => null, 'origem' => 'historico', 'score' => $sc, 'motivo' => 'Você já lançou despesas parecidas com este fornecedor (' . ($totalF[$nm] ?? 1) . ' ' . (($totalF[$nm] ?? 1) === 1 ? 'vez' : 'vezes') . ').'];
      $cd = $catDoForn[$kf][0] ?? null; if ($valida($cd, 'despesa') !== null) $cand[] = ['score' => min(80, $sc), 'cat' => (int)$cd, 'origem' => 'historico', 'motivo' => 'As despesas de "' . $nm . '" costumam ficar nesta categoria.', 'contraparte' => $nm];
    }
    // 5) nome das SUAS categorias aparece na descrição (funciona com categorias personalizadas)
    $melhor = null; $mMelhor = 0;
    foreach ($catTokens[$tipoCat] ?? [] as $cid => $ct) { if (!$ct) continue; $m = psi_sug_conta_casos($tokens, $ct); if ($m > $mMelhor) { $mMelhor = $m; $melhor = $cid; } }
    if ($melhor !== null) $cand[] = ['score' => 62, 'cat' => (int)$melhor, 'origem' => 'nome', 'motivo' => 'O nome da categoria "' . $catNome[$melhor] . '" aparece na descrição.'];
    // 4) dicionário de termos de extrato
    foreach ($dic as [$tpD, $reDesc, $reCat, $rotulo]) {
      if ($tpD !== $tp || !preg_match($reDesc, $textoDic)) continue;
      $cat = $porRegex($tipoCat, $reCat); if ($cat !== null) { $cand[] = ['score' => 66, 'cat' => $cat, 'origem' => 'palavra', 'motivo' => 'A descrição fala em ' . $rotulo . '.']; break; }
    }
    // 6) palpite para entrada de pessoa física sem outra pista: quase sempre é pagamento de sessão
    if ($entrada && $acao === null && preg_match('/\b(PIX|TED|DOC|TRANSF|TRANSFERENCIA)\b/', $texto) && $fav['tokens']) {
      $cat = $porRegex('receita', '/PARTICULAR/'); if ($cat !== null) $cand[] = ['score' => 50, 'cat' => $cat, 'origem' => 'palpite', 'motivo' => 'Entrada de pessoa física: costuma ser pagamento de sessão. Confirme.'];
    }
    usort($cand, fn($a, $b) => $b['score'] <=> $a['score']);
    $escolhida = null; $identidade = null;
    foreach ($cand as $x) {
      if (($x['origem'] === 'fornecedor' || $x['origem'] === 'paciente') && $identidade === null) $identidade = $x;
      if ($x['cat'] !== null && ($cats[$tipoCat][$x['cat']] ?? null) !== null) { $escolhida = $x; break; }
    }
    // fornecedor novo: o favorecido extraído, quando a linha é uma saída para alguém (não tarifa, imposto, transferência...)
    if ($fornSug === null && !$entrada && $acao === null && $fav['nome'] !== '' && !preg_match(PSI_SUG_SEM_FORNECEDOR, $texto) && strlen($fav['tokens'][0]) >= 4)
      $fornSug = ['nome' => $fav['nome'], 'id' => null, 'origem' => 'novo', 'score' => 40, 'motivo' => 'Favorecido identificado na descrição; será cadastrado ao lançar.'];
    if ($acao !== null) $fornSug = null;

    $categoriaSug = null;
    if ($escolhida !== null || $identidade !== null) {
      $base = $escolhida ?? $identidade;
      $categoriaSug = ['categoriaId' => $escolhida ? (int)$escolhida['cat'] : null, 'categoria' => $escolhida ? $catNome[(int)$escolhida['cat']] : null, 'origem' => $base['origem'], 'confianca' => $conf($base['score']),
        'motivo' => $base['motivo'] . ($escolhida === null ? ' Ainda sem categoria padrão.' : ''), 'contraparte' => $base['contraparte'] ?? ($identidade['contraparte'] ?? null), 'pacienteId' => $base['pacienteId'] ?? ($identidade['pacienteId'] ?? null)];
    }
    if ($fornSug !== null) { $fornSug['confianca'] = $conf($fornSug['score']); unset($fornSug['score']); }
    $saida[(int)$it['id']] = ['categoriaSugerida' => $categoriaSug, 'fornecedorSugerido' => $fornSug, 'acaoSugerida' => $acao, 'grupo' => $fav['chave'] !== '' ? ['chave' => $fav['chave'], 'nome' => $fav['nome']] : null];
  }
  return $saida;
}

/** Sugestão completa (categoria, fornecedor, ação e grupo) de cada linha pendente. */
function psi_sugerir_extrato(array $itens): array { return psi_sug_motor($itens); }
/** Só a categoria sugerida (o formato que o lançamento em lote usa). */
function psi_sugerir_categorias(array $itens): array {
  $r = []; foreach (psi_sug_motor($itens) as $id => $s) if ($s['categoriaSugerida'] !== null) $r[$id] = $s['categoriaSugerida']; return $r;
}
