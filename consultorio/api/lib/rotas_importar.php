<?php
/**
 * Importação de cadastros por planilha (pacientes, fornecedores, categorias).
 * O navegador lê o arquivo (CSV/Excel) e manda só as linhas já ligadas aos campos; o servidor entende os formatos de planilha em português
 * (datas dd/mm/aaaa ou número serial do Excel, "R$ 1.234,56", CPF que perdeu o zero à esquerda, "sim"/"não"...) e REUSA as mesmas validações do cadastro
 * manual. Duas etapas: aplicar=false só confere e mostra o que aconteceria (nada é gravado); aplicar=true grava as linhas válidas.
 * Duplicados (mesmo CPF/CNPJ ou mesmo nome) são ignorados ou, se a pessoa pedir, atualizados só nos campos preenchidos.
 */
declare(strict_types=1);

const PSI_IMPORTAR_MAX_LINHAS = 2000;

/* ------------------------------------------------------------------ catálogo de campos (fonte única para a tela e para os modelos de planilha) */
function psi_imp_campos(string $tipo): array {
  $c = fn(string $chave, string $rotulo, bool $obrig, string $dica, array $sin, array $ex) => ['chave' => $chave, 'rotulo' => $rotulo, 'obrigatorio' => $obrig, 'dica' => $dica, 'sinonimos' => $sin, 'exemplos' => $ex];
  if ($tipo === 'pacientes') return [
    $c('nome', 'Nome', true, 'Nome completo.', ['nome', 'nome completo', 'paciente', 'nome do paciente', 'cliente'], ['Maria Souza', 'Pedro Alves']),
    $c('apelido', 'Apelido', false, 'Como a pessoa prefere ser chamada.', ['apelido', 'nome social', 'como prefere ser chamado', 'preferido'], ['Mari', '']),
    $c('cpf', 'CPF', false, 'Com ou sem pontos. Necessário para recibos e carnê-leão.', ['cpf', 'cpf do paciente', 'documento', 'cpf paciente'], ['529.982.247-25', '']),
    $c('nascimento', 'Data de nascimento', false, 'dd/mm/aaaa.', ['nascimento', 'data de nascimento', 'data nasc', 'nasc', 'dt nascimento', 'dt nasc', 'aniversario'], ['15/03/1988', '02/11/2015']),
    $c('telefone', 'Telefone / WhatsApp', false, 'DDD + número.', ['telefone', 'celular', 'whatsapp', 'fone', 'tel', 'contato', 'telefone celular', 'telefone whatsapp'], ['(48) 99999-1234', '']),
    $c('email', 'E-mail', false, '', ['email', 'e-mail', 'mail', 'correio'], ['maria@exemplo.com', '']),
    $c('respNome', 'Responsável financeiro', false, 'Para crianças e quando outra pessoa paga.', ['responsavel', 'nome do responsavel', 'responsavel financeiro', 'resp', 'mae', 'pai', 'tutor', 'responsavel legal'], ['', 'Marta Alves']),
    $c('respCpf', 'CPF do responsável', false, '', ['cpf do responsavel', 'cpf responsavel', 'cpf resp', 'cpf do resp'], ['', '390.533.447-05']),
    $c('respTelefone', 'Telefone do responsável', false, '', ['telefone do responsavel', 'celular do responsavel', 'whatsapp do responsavel', 'tel responsavel', 'telefone responsavel', 'fone do responsavel'], ['', '(48) 98888-4321']),
    $c('tipo', 'Tipo de atendimento', false, 'Individual, casal, família, infantil ou grupo.', ['tipo', 'tipo de atendimento', 'tipo de paciente', 'atendimento'], ['individual', 'infantil']),
    $c('modalidade', 'Como paga', false, 'Por sessão, mensal ou convênio.', ['como paga', 'modalidade', 'modalidade de cobranca', 'cobranca', 'tipo de cobranca', 'forma de cobranca'], ['por sessão', 'mensal']),
    $c('valorSessao', 'Valor da sessão (R$)', false, 'Ex.: 180,00.', ['valor', 'valor da sessao', 'valor sessao', 'preco', 'valor da consulta', 'valor consulta', 'honorario', 'valor por sessao'], ['180,00', '']),
    $c('valorMensal', 'Valor da mensalidade (R$)', false, 'Só para quem paga mensal.', ['mensalidade', 'valor mensal', 'valor da mensalidade', 'valor do mes'], ['', '640,00']),
    $c('diaVencimento', 'Dia do vencimento', false, '1 a 31, para quem paga mensal.', ['dia de vencimento', 'vencimento', 'dia vencimento', 'dia do pagamento', 'dia do vencimento'], ['', '10']),
    $c('prazoDias', 'Prazo para pagar (dias)', false, '0 = paga no dia da sessão.', ['prazo', 'prazo de pagamento', 'prazo para pagar', 'prazo dias'], ['0', '']),
    $c('formaPagamento', 'Forma de pagamento', false, 'PIX, dinheiro, cartão, transferência, boleto...', ['forma de pagamento', 'pagamento', 'forma pagamento', 'meio de pagamento', 'forma que paga'], ['PIX', 'boleto']),
    $c('convenioNome', 'Convênio / plano', false, 'Obrigatório para quem paga por convênio.', ['convenio', 'nome do convenio', 'plano de saude', 'operadora', 'plano'], ['', '']),
    $c('convenioPrazoDias', 'Prazo do convênio (dias)', false, 'Em quantos dias o convênio paga.', ['prazo do convenio', 'prazo convenio', 'prazo de repasse'], ['', '']),
    $c('status', 'Situação', false, 'Ativo, pausado, alta ou arquivado.', ['situacao', 'status', 'situacao do paciente'], ['ativo', 'ativo']),
    $c('desde', 'Paciente desde', false, 'Data de início do atendimento (dd/mm/aaaa).', ['desde', 'data de inicio', 'inicio', 'data de cadastro', 'primeira consulta', 'data inicio', 'inicio do atendimento'], ['02/02/2024', '']),
    $c('social', 'Preço social', false, 'Sim para quem é atendido com preço social. Só a marca: não registre o motivo.', ['preco social', 'social', 'valor social', 'tarifa social', 'sessao social'], ['', 'sim']),
    $c('obs', 'Observações administrativas', false, 'Não use para dados clínicos.', ['observacao', 'observacoes', 'obs', 'observacao administrativa'], ['Prefere horário da manhã', '']),
  ];
  if ($tipo === 'fornecedores') return [
    $c('nome', 'Nome do fornecedor', true, 'Nome ou razão social, do jeito que você quer ver nas despesas.', ['nome', 'fornecedor', 'razao social', 'nome fantasia', 'empresa', 'favorecido', 'nome do fornecedor'], ['Imobiliária Central', 'Contabilidade Silva']),
    $c('documento', 'CPF / CNPJ', false, 'Com ou sem pontuação.', ['cnpj', 'cpf', 'cpf/cnpj', 'cnpj/cpf', 'documento', 'cpf cnpj', 'cnpj cpf'], ['12.345.678/0001-95', '']),
    $c('email', 'E-mail', false, '', ['email', 'e-mail', 'mail'], ['contato@central.exemplo.com', '']),
    $c('telefone', 'Telefone', false, 'DDD + número.', ['telefone', 'celular', 'whatsapp', 'fone', 'tel', 'contato'], ['(48) 3333-4444', '']),
    $c('categoria', 'Categoria padrão da despesa', false, 'Nome de uma categoria de despesa já existente. Se não existir, o fornecedor entra sem categoria.', ['categoria', 'categoria padrao', 'plano de contas', 'tipo de despesa', 'categoria da despesa'], ['Aluguel do consultório', 'Contabilidade']),
    $c('obs', 'Observações', false, '', ['observacao', 'observacoes', 'obs'], ['', 'Honorário mensal']),
  ];
  if ($tipo === 'categorias') return [
    $c('tipo', 'Tipo', true, 'Receita (entrada) ou despesa (saída).', ['tipo', 'natureza', 'entrada ou saida', 'receita ou despesa'], ['despesa', 'receita']),
    $c('nome', 'Nome da categoria', true, 'Até 80 caracteres.', ['nome', 'categoria', 'nome da categoria', 'plano de contas', 'descricao da categoria'], ['Supervisão clínica', 'Palestras']),
    $c('grupo', 'Fixa ou variável', false, 'Só para despesas. Padrão: variável.', ['grupo', 'fixa ou variavel', 'fixa/variavel', 'comportamento', 'classificacao'], ['variável', '']),
    $c('dedutivel', 'Livro-caixa?', false, 'Sim se a despesa costuma entrar no livro-caixa (o contador confirma).', ['dedutivel', 'livro-caixa', 'livro caixa', 'livro-caixa?', 'deduz', 'dedutivel no livro caixa'], ['sim', '']),
    $c('descricao', 'Descrição', false, 'Até 200 caracteres.', ['descricao', 'detalhe', 'observacao', 'obs'], ['Supervisão com colega', 'Honorários de palestra']),
  ];
  psi_erro('Tipo de importação inválido.', 404);
}

/* ------------------------------------------------------------------ normalização dos valores de planilha */
function psi_imp_chave(string $s): string {
  return trim(preg_replace('/\s+/', ' ', strtolower(preg_replace('/[^A-Z0-9]+/', ' ', psi_norm_texto($s)))));
}
/** Texto da célula (ou null se vazia). Números inteiros guardados como decimal (11999998888.0) voltam a ser inteiros. */
function psi_imp_str($v): ?string {
  if ($v === null || is_bool($v) || is_array($v)) return null;
  if (is_float($v) && is_finite($v) && floor($v) === $v && abs($v) < 1e15) $v = (int)$v;
  $s = trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]+/u', '', (string)$v));
  return $s === '' ? null : $s;
}
/** [data ISO, erro]: dd/mm/aaaa, dd-mm-aa, aaaa-mm-dd (com ou sem hora), aaaammdd ou número serial do Excel. */
function psi_imp_data($v, string $rotulo): array {
  $s = psi_imp_str($v); if ($s === null) return [null, null];
  $erro = [null, "$rotulo inválida (\"" . mb_substr($s, 0, 30) . "\"): use dd/mm/aaaa."];
  $ok = fn(int $a, int $m, int $d) => ($a >= 1900 && $a <= 2100 && checkdate($m, $d, $a)) ? sprintf('%04d-%02d-%02d', $a, $m, $d) : null;
  if ((is_int($v) || is_float($v)) || preg_match('/^\d{1,6}$/', $s)) { // número serial do Excel (dias desde 30/12/1899)
    $n = (int)$v; if ($n < 1 || $n > 2958465) return $erro;
    return [(new DateTimeImmutable('1899-12-30'))->modify("+$n days")->format('Y-m-d'), null];
  }
  if (preg_match('/^(\d{4})(\d{2})(\d{2})$/', $s, $m)) { $r = $ok((int)$m[1], (int)$m[2], (int)$m[3]); return $r ? [$r, null] : $erro; }
  if (preg_match('/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/', $s, $m)) { $r = $ok((int)$m[1], (int)$m[2], (int)$m[3]); return $r ? [$r, null] : $erro; }
  if (preg_match('/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})(?:[ T].*)?$/', $s, $m)) {
    $a = (int)$m[3]; if ($a < 100) $a += ($a > (int)psi_hoje_ano() % 100 ? 1900 : 2000);
    $r = $ok($a, (int)$m[2], (int)$m[1]); return $r ? [$r, null] : $erro;
  }
  return $erro;
}
function psi_hoje_ano(): string { return substr(psi_hoje(), 0, 4); }
/** [centavos, erro]: aceita 180, 180.5, "180,00", "R$ 1.234,56", "1,234.56". Números da planilha são REAIS (180 = R$ 180,00). */
function psi_imp_reais($v, string $rotulo): array {
  if ($v === null || $v === '') return [null, null];
  $erro = [null, "$rotulo inválido (\"" . mb_substr((string)$v, 0, 30) . "\"): use um valor como 180,00."];
  if (is_int($v) || is_float($v)) return ($v < 0 || $v > 20000000) ? $erro : [(int)round($v * 100), null];
  $s = psi_imp_str($v); if ($s === null) return [null, null];
  $s = trim(str_ireplace(['R$', "\xC2\xA0", ' '], '', $s));
  if ($s === '') return [null, null];
  if (preg_match('/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/', $s)) $s = str_replace(',', '.', str_replace('.', '', $s));
  elseif (preg_match('/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/', $s)) $s = str_replace(',', '', $s);
  elseif (preg_match('/^\d+,\d{1,2}$/', $s)) $s = str_replace(',', '.', $s);
  elseif (!preg_match('/^\d+(\.\d{1,2})?$/', $s)) return $erro;
  [$int, $frac] = array_pad(explode('.', $s, 2), 2, '0');
  $c = (int)$int * 100 + (int)str_pad(substr($frac, 0, 2), 2, '0');
  return $c > 2000000000 ? $erro : [$c, null];
}
/** [inteiro, erro] (aceita "dia 10", "10", 10.0). */
function psi_imp_inteiro($v, string $rotulo, int $min, int $max): array {
  $s = psi_imp_str($v); if ($s === null) return [null, null];
  if (!preg_match('/(\d{1,6})/', $s, $m)) return [null, "$rotulo inválido (\"" . mb_substr($s, 0, 20) . "\")."];
  $n = (int)$m[1]; if ($n < $min || $n > $max) return [null, "$rotulo deve ficar entre $min e $max."];
  return [$n, null];
}
/** [valor interno, erro]: compara sem acento nem maiúsculas com o nome do valor e seus sinônimos. */
function psi_imp_enum($v, array $mapa, string $rotulo): array {
  $s = psi_imp_str($v); if ($s === null) return [null, null];
  $k = psi_imp_chave($s);
  foreach ($mapa as $interno => $sinonimos) {
    if ($k === psi_imp_chave((string)$interno)) return [$interno, null];
    foreach ($sinonimos as $x) if ($k === psi_imp_chave($x)) return [$interno, null];
  }
  return [null, "$rotulo não reconhecido (\"" . mb_substr($s, 0, 30) . "\")."];
}
function psi_imp_simnao($v): array {
  $s = psi_imp_str($v); if ($s === null) return [null, null];
  $k = psi_imp_chave($s);
  if (in_array($k, ['sim', 's', '1', 'true', 'x', 'yes', 'verdadeiro'], true)) return [1, null];
  if (in_array($k, ['nao', 'n', '0', 'false', 'no', 'falso'], true)) return [0, null];
  return [null, "Esperado sim ou não (\"" . mb_substr($s, 0, 20) . "\")."];
}
/** CPF/CNPJ só com dígitos; o Excel tira zeros à esquerda de números, então completa 9–10 dígitos (CPF) e 12–13 (CNPJ). */
function psi_imp_documento($v): ?string {
  $s = psi_imp_str($v); if ($s === null) return null;
  $d = preg_replace('/\D+/', '', $s); $n = strlen($d);
  if ($n >= 9 && $n < 11) $d = str_pad($d, 11, '0', STR_PAD_LEFT);
  elseif ($n >= 12 && $n < 14) $d = str_pad($d, 14, '0', STR_PAD_LEFT);
  return $d === '' ? $s : $d;
}

const PSI_IMP_TIPO_PAC = ['individual' => ['adulto', 'adulta'], 'casal' => ['casais'], 'familia' => ['familiar', 'familias'], 'infantil' => ['crianca', 'infanto juvenil', 'infantojuvenil', 'adolescente'], 'grupo' => ['em grupo']];
const PSI_IMP_MODAL = ['sessao' => ['por sessao', 'avulso', 'avulsa', 'particular', 'sessao avulsa', 'por consulta', 'consulta'], 'mensal' => ['mensalidade', 'pacote mensal', 'plano mensal', 'por mes'], 'convenio' => ['plano', 'plano de saude', 'operadora', 'convenio medico']];
const PSI_IMP_STATUS = ['ativo' => ['ativa', 'em atendimento', 'sim'], 'pausado' => ['pausa', 'pausada', 'em pausa'], 'alta' => ['de alta', 'recebeu alta'], 'arquivado' => ['arquivada', 'inativo', 'inativa', 'desativado', 'nao']];
const PSI_IMP_FORMAS = ['dinheiro' => ['especie', 'cash'], 'pix' => ['chave pix', 'pix qr'], 'debito' => ['cartao de debito', 'cartao debito', 'debito em conta'], 'credito' => ['cartao de credito', 'cartao credito', 'cartao', 'credito parcelado'],
  'transferencia' => ['transferencia bancaria', 'ted', 'doc', 'transf'], 'boleto' => ['boleto bancario'], 'convenio' => ['convenio medico', 'plano de saude'], 'debito_automatico' => ['debito automatico', 'debito aut'], 'cheque' => [], 'outro' => ['outra', 'outros']];

/* ------------------------------------------------------------------ linhas → dados no formato da API (só o que veio preenchido) */
function psi_imp_paciente(array $r): array {
  $d = []; $erros = []; $pegaTxt = function (string $k) use ($r, &$d) { $s = psi_imp_str($r[$k] ?? null); if ($s !== null) $d[$k] = $s; };
  foreach (['nome', 'apelido', 'respNome', 'convenioNome', 'obs', 'telefone', 'respTelefone'] as $k) $pegaTxt($k);
  foreach (['cpf', 'respCpf'] as $k) { $x = psi_imp_documento($r[$k] ?? null); if ($x !== null) $d[$k] = $x; }
  $e = psi_imp_str($r['email'] ?? null); if ($e !== null) $d['email'] = $e;
  foreach (['nascimento' => 'Data de nascimento', 'desde' => 'Data de início'] as $k => $rot) { [$x, $er] = psi_imp_data($r[$k] ?? null, $rot); if ($er) $erros[] = $er; elseif ($x !== null) $d[$k] = $x; }
  foreach (['tipo' => [PSI_IMP_TIPO_PAC, 'Tipo de atendimento'], 'modalidade' => [PSI_IMP_MODAL, 'Forma de cobrança'], 'status' => [PSI_IMP_STATUS, 'Situação'], 'formaPagamento' => [PSI_IMP_FORMAS, 'Forma de pagamento']] as $k => [$mapa, $rot]) {
    [$x, $er] = psi_imp_enum($r[$k] ?? null, $mapa, $rot); if ($er) $erros[] = $er; elseif ($x !== null) $d[$k] = $x;
  }
  [$sx, $er] = psi_imp_simnao($r['social'] ?? null); if ($er) $erros[] = 'Preço social: ' . $er; elseif ($sx !== null) $d['social'] = $sx;
  foreach (['valorSessao' => 'Valor da sessão', 'valorMensal' => 'Valor da mensalidade'] as $k => $rot) { [$x, $er] = psi_imp_reais($r[$k] ?? null, $rot); if ($er) $erros[] = $er; elseif ($x !== null) $d[$k] = $x; }
  foreach (['diaVencimento' => ['Dia do vencimento', 1, 31], 'prazoDias' => ['Prazo para pagar', 0, 365], 'convenioPrazoDias' => ['Prazo do convênio', 0, 365]] as $k => [$rot, $mn, $mx]) {
    [$x, $er] = psi_imp_inteiro($r[$k] ?? null, $rot, $mn, $mx); if ($er) $erros[] = $er; elseif ($x !== null) $d[$k] = $x;
  }
  return [$d, $erros];
}
function psi_imp_fornecedor(array $r, array $categoriasDespesa): array {
  $d = []; $erros = []; $avisos = [];
  foreach (['nome', 'email', 'telefone', 'obs'] as $k) { $s = psi_imp_str($r[$k] ?? null); if ($s !== null) $d[$k] = $s; }
  $doc = psi_imp_documento($r['documento'] ?? null); if ($doc !== null) $d['documento'] = $doc;
  $cat = psi_imp_str($r['categoria'] ?? null);
  if ($cat !== null) { $id = $categoriasDespesa[psi_imp_chave($cat)] ?? null; if ($id !== null) $d['categoriaId'] = $id; else $avisos[] = "Categoria \"" . mb_substr($cat, 0, 40) . "\" não encontrada: o fornecedor entra sem categoria padrão."; }
  return [$d, $erros, $avisos];
}
function psi_imp_categoria(array $r): array {
  $d = []; $erros = [];
  [$t, $er] = psi_imp_enum($r['tipo'] ?? null, ['receita' => ['entrada', 'receitas', 'a receber', 'ganho'], 'despesa' => ['saida', 'despesas', 'custo', 'gasto', 'a pagar', 'pagar']], 'Tipo'); if ($er) $erros[] = $er; elseif ($t !== null) $d['tipo'] = $t;
  $n = psi_imp_str($r['nome'] ?? null); if ($n !== null) $d['nome'] = $n;
  [$g, $er] = psi_imp_enum($r['grupo'] ?? null, ['fixa' => ['fixo', 'recorrente', 'mensal'], 'variavel' => ['variaveis', 'eventual', 'esporadica']], 'Grupo'); if ($er) $erros[] = $er; elseif ($g !== null) $d['grupo'] = $g;
  [$x, $er] = psi_imp_simnao($r['dedutivel'] ?? null); if ($er) $erros[] = $er; elseif ($x !== null) $d['dedutivel'] = $x;
  $ds = psi_imp_str($r['descricao'] ?? null); if ($ds !== null) $d['descricao'] = $ds;
  return [$d, $erros];
}

/* ------------------------------------------------------------------ rotas */
const PSI_IMP_COLUNAS_PAC = ['nome' => 'nome', 'apelido' => 'apelido', 'cpf' => 'cpf', 'nascimento' => 'nascimento', 'telefone' => 'telefone', 'email' => 'email', 'respNome' => 'resp_nome', 'respCpf' => 'resp_cpf',
  'respTelefone' => 'resp_telefone', 'tipo' => 'tipo', 'modalidade' => 'modalidade_cobranca', 'valorSessao' => 'valor_sessao', 'valorMensal' => 'valor_mensal', 'diaVencimento' => 'dia_vencimento', 'prazoDias' => 'prazo_dias',
  'formaPagamento' => 'forma_pagamento', 'convenioNome' => 'convenio_nome', 'convenioPrazoDias' => 'convenio_prazo_dias', 'status' => 'status', 'obs' => 'obs', 'desde' => 'desde', 'social' => 'social'];

function psi_registrar_rotas_importar(PsiRoteador $r): void {
  $r->add('GET', 'importar/campos/{tipo}', function ($p) { return ['campos' => psi_imp_campos((string)$p['tipo']), 'limite' => PSI_IMPORTAR_MAX_LINHAS]; });

  $r->add('POST', 'importar/{tipo}', function ($p) {
    $tipo = (string)$p['tipo']; psi_imp_campos($tipo); // 404 se o tipo não existe
    $d = psi_corpo(6 * 1048576); $linhas = $d['linhas'] ?? null;
    if (!is_array($linhas) || !$linhas) psi_erro('Nenhuma linha para importar.', 422);
    if (count($linhas) > PSI_IMPORTAR_MAX_LINHAS) psi_erro('O arquivo tem linhas demais: o limite é de ' . PSI_IMPORTAR_MAX_LINHAS . ' por importação. Divida em partes.', 422);
    $aplicar = ($d['aplicar'] ?? false) === true; $atualizar = ($d['duplicados'] ?? 'ignorar') === 'atualizar';
    $plano = $tipo === 'pacientes' ? psi_imp_planejar_pacientes($linhas, $atualizar) : ($tipo === 'fornecedores' ? psi_imp_planejar_fornecedores($linhas, $atualizar) : psi_imp_planejar_categorias($linhas, $atualizar));
    $resumo = ['total' => count($plano), 'novos' => 0, 'atualizados' => 0, 'ignorados' => 0, 'erros' => 0];
    foreach ($plano as $it) { $resumo[['novo' => 'novos', 'atualizar' => 'atualizados', 'ignorado' => 'ignorados', 'erro' => 'erros'][$it['situacao']]]++; }
    if ($aplicar && ($resumo['novos'] + $resumo['atualizados']) > 0) {
      $db = psi_db();
      try { $db->beginTransaction(); psi_imp_gravar($tipo, $plano); $db->commit(); }
      catch (Throwable $e) { if ($db->inTransaction()) $db->rollBack(); if ($e instanceof PDOException && $e->getCode() === '23000') psi_erro('Alguns registros já existem. Confira o arquivo e tente de novo.', 409); throw $e; }
      psi_auditar('importar', $tipo, null, ['novos' => $resumo['novos'], 'atualizados' => $resumo['atualizados'], 'ignorados' => $resumo['ignorados'], 'erros' => $resumo['erros']]);
    }
    return ['aplicado' => $aplicar, 'resumo' => $resumo, 'itens' => array_map(fn($it) => ['linha' => $it['linha'], 'situacao' => $it['situacao'], 'rotulo' => $it['rotulo'], 'mensagem' => $it['mensagem'], 'avisos' => $it['avisos']], $plano)];
  });
}

/** Item do plano: o que vai acontecer com cada linha. */
function psi_imp_item(int $linha, ?string $rotulo, string $situacao, ?string $mensagem = null, array $extra = []): array {
  return array_merge(['linha' => $linha, 'rotulo' => $rotulo, 'situacao' => $situacao, 'mensagem' => $mensagem, 'avisos' => []], $extra);
}
function psi_imp_numero_linha($r, int $i): int { return is_array($r) && isset($r['_linha']) && is_numeric($r['_linha']) ? (int)$r['_linha'] : $i + 1; }

function psi_imp_planejar_pacientes(array $linhas, bool $atualizar): array {
  $c = psi_conta_id(); $db = psi_db();
  $s = $db->prepare('SELECT * FROM psi_pacientes WHERE conta_id = ?'); $s->execute([$c]);
  $porCpf = []; $porNome = []; $existentes = [];
  foreach ($s->fetchAll() as $p) { $existentes[(int)$p['id']] = $p; if ($p['cpf'] !== null) $porCpf[$p['cpf']] = (int)$p['id']; $porNome[psi_imp_chave($p['nome'])][] = (int)$p['id']; }
  $vistoCpf = []; $vistoNome = []; $plano = [];
  foreach (array_values($linhas) as $i => $r) {
    $n = psi_imp_numero_linha($r, $i);
    if (!is_array($r)) { $plano[] = psi_imp_item($n, null, 'erro', 'Linha inválida.'); continue; }
    [$dados, $erros] = psi_imp_paciente($r); $rotulo = $dados['nome'] ?? null;
    if ($erros) { $plano[] = psi_imp_item($n, $rotulo, 'erro', implode(' ', $erros)); continue; }
    if (!$dados) { $plano[] = psi_imp_item($n, null, 'ignorado', 'Linha vazia.'); continue; }
    if (!isset($dados['nome'])) { $plano[] = psi_imp_item($n, null, 'erro', 'Informe o nome do paciente.'); continue; }
    $cpf = $dados['cpf'] ?? null; $chave = psi_imp_chave($dados['nome']);
    // já existe? mesmo CPF; ou mesmo nome quando um dos dois não tem CPF (duas pessoas com o mesmo nome e CPFs diferentes são pessoas diferentes)
    $achou = $cpf !== null && isset($porCpf[$cpf]) ? $porCpf[$cpf] : null;
    if ($achou === null) foreach ($porNome[$chave] ?? [] as $id) { $ex = $existentes[$id] ?? null; if ($ex === null || $cpf === null || $ex['cpf'] === null) { $achou = $id; break; } }
    $repetido = ($cpf !== null && isset($vistoCpf[$cpf])) ? $vistoCpf[$cpf] : null;
    if ($repetido === null && isset($vistoNome[$chave])) { foreach ($vistoNome[$chave] as [$ln, $cpfVisto]) { if ($cpf === null || $cpfVisto === null || $cpf === $cpfVisto) { $repetido = $ln; break; } } }
    if ($repetido !== null) { $plano[] = psi_imp_item($n, $rotulo, 'ignorado', "Repetido no arquivo (já aparece na linha $repetido)."); continue; }
    $vistoNome[$chave][] = [$n, $cpf]; if ($cpf !== null) $vistoCpf[$cpf] = $n;
    if ($achou !== null) {
      if (!$atualizar) { $plano[] = psi_imp_item($n, $rotulo, 'ignorado', 'Já cadastrado (mesmo ' . ($cpf !== null && isset($porCpf[$cpf]) ? 'CPF' : 'nome') . ').'); continue; }
      $ex = $existentes[$achou]; $mesclado = array_merge(psi_paciente_json($ex), $dados); unset($mesclado['id']);
      [$val, $er] = psi_tentar(fn() => psi_ler_paciente($mesclado));
      if ($er !== null) { $plano[] = psi_imp_item($n, $rotulo, 'erro', $er); continue; }
      $cols = []; foreach (array_keys($dados) as $k) { if ($k === 'nome') continue; $col = PSI_IMP_COLUNAS_PAC[$k] ?? null; if ($col) $cols[$col] = $val[$col]; }
      if (isset($dados['modalidade'])) foreach (['valor_mensal', 'dia_vencimento', 'convenio_nome', 'convenio_prazo_dias'] as $col) $cols[$col] = $val[$col];
      if (!$cols) { $plano[] = psi_imp_item($n, $rotulo, 'ignorado', 'Já cadastrado e sem dados novos para atualizar.'); continue; }
      $plano[] = psi_imp_item($n, $rotulo, 'atualizar', 'Atualiza o cadastro existente (' . count($cols) . ' campo' . (count($cols) === 1 ? '' : 's') . ').', ['id' => $achou, 'colunas' => $cols]);
      continue;
    }
    [$val, $er] = psi_tentar(fn() => psi_ler_paciente($dados));
    if ($er !== null) { $plano[] = psi_imp_item($n, $rotulo, 'erro', $er); continue; }
    if ($val['desde'] === null) $val['desde'] = psi_hoje();
    $plano[] = psi_imp_item($n, $rotulo, 'novo', null, ['valores' => $val]);
    // os próximos da planilha comparam também com este
    if ($cpf !== null) $porCpf[$cpf] = -1; $porNome[$chave][] = -1;
  }
  return $plano;
}

function psi_imp_planejar_fornecedores(array $linhas, bool $atualizar): array {
  $c = psi_conta_id(); $db = psi_db();
  $s = $db->prepare("SELECT id, nome FROM psi_categorias WHERE conta_id = ? AND tipo = 'despesa'"); $s->execute([$c]);
  $cats = []; foreach ($s->fetchAll() as $x) $cats[psi_imp_chave($x['nome'])] = (int)$x['id'];
  $s = $db->prepare('SELECT * FROM psi_fornecedores WHERE conta_id = ?'); $s->execute([$c]);
  $porDoc = []; $porNome = []; $existentes = [];
  foreach ($s->fetchAll() as $f) { $existentes[(int)$f['id']] = $f; if ($f['documento'] !== null) $porDoc[$f['documento']] = (int)$f['id']; $porNome[psi_imp_chave($f['nome'])] = (int)$f['id']; }
  $vistoDoc = []; $vistoNome = []; $plano = [];
  foreach (array_values($linhas) as $i => $r) {
    $n = psi_imp_numero_linha($r, $i);
    if (!is_array($r)) { $plano[] = psi_imp_item($n, null, 'erro', 'Linha inválida.'); continue; }
    [$dados, $erros, $avisos] = psi_imp_fornecedor($r, $cats); $rotulo = $dados['nome'] ?? null;
    if ($erros) { $plano[] = psi_imp_item($n, $rotulo, 'erro', implode(' ', $erros)); continue; }
    if (!$dados) { $plano[] = psi_imp_item($n, null, 'ignorado', 'Linha vazia.'); continue; }
    if (!isset($dados['nome'])) { $plano[] = psi_imp_item($n, null, 'erro', 'Informe o nome do fornecedor.'); continue; }
    $doc = $dados['documento'] ?? null; $chave = psi_imp_chave($dados['nome']);
    $rep = ($doc !== null && isset($vistoDoc[$doc])) ? $vistoDoc[$doc] : ($vistoNome[$chave] ?? null);
    if ($rep !== null) { $plano[] = psi_imp_item($n, $rotulo, 'ignorado', "Repetido no arquivo (já aparece na linha $rep).", ['avisos' => $avisos]); continue; }
    $vistoNome[$chave] = $n; if ($doc !== null) $vistoDoc[$doc] = $n;
    $achou = ($doc !== null && isset($porDoc[$doc])) ? $porDoc[$doc] : ($porNome[$chave] ?? null);
    if ($achou !== null) {
      if (!$atualizar) { $plano[] = psi_imp_item($n, $rotulo, 'ignorado', 'Já cadastrado (mesmo ' . ($doc !== null && isset($porDoc[$doc]) ? 'CPF/CNPJ' : 'nome') . ').', ['avisos' => $avisos]); continue; }
      $ex = $existentes[$achou] ?? null; $mesclado = ['nome' => $ex['nome'] ?? $dados['nome'], 'documento' => $ex['documento'] ?? null, 'email' => $ex['email'] ?? null, 'telefone' => $ex['telefone'] ?? null,
        'categoriaId' => $ex['categoria_id'] ?? null, 'obs' => $ex['obs'] ?? null, 'ativo' => $ex['ativo'] ?? 1];
      foreach (['documento', 'email', 'telefone', 'categoriaId', 'obs'] as $k) if (isset($dados[$k])) $mesclado[$k] = $dados[$k];
      [$val, $er] = psi_tentar(fn() => psi_ler_fornecedor($mesclado));
      if ($er !== null) { $plano[] = psi_imp_item($n, $rotulo, 'erro', $er); continue; }
      $cols = []; foreach (['documento' => 'documento', 'email' => 'email', 'telefone' => 'telefone', 'categoriaId' => 'categoria_id', 'obs' => 'obs'] as $k => $col) if (isset($dados[$k])) $cols[$col] = $val[$col];
      if (!$cols) { $plano[] = psi_imp_item($n, $rotulo, 'ignorado', 'Já cadastrado e sem dados novos para atualizar.', ['avisos' => $avisos]); continue; }
      $plano[] = psi_imp_item($n, $rotulo, 'atualizar', 'Atualiza o fornecedor existente (' . count($cols) . ' campo' . (count($cols) === 1 ? '' : 's') . ').', ['id' => $achou, 'colunas' => $cols, 'avisos' => $avisos]);
      continue;
    }
    [$val, $er] = psi_tentar(fn() => psi_ler_fornecedor($dados));
    if ($er !== null) { $plano[] = psi_imp_item($n, $rotulo, 'erro', $er); continue; }
    $plano[] = psi_imp_item($n, $rotulo, 'novo', null, ['valores' => $val, 'avisos' => $avisos]);
    $porNome[$chave] = -1; if ($doc !== null) $porDoc[$doc] = -1;
  }
  return $plano;
}

function psi_imp_planejar_categorias(array $linhas, bool $atualizar): array {
  $c = psi_conta_id(); $s = psi_db()->prepare('SELECT id, tipo, nome FROM psi_categorias WHERE conta_id = ?'); $s->execute([$c]);
  $existentes = []; foreach ($s->fetchAll() as $x) $existentes[$x['tipo'] . '|' . psi_imp_chave($x['nome'])] = (int)$x['id'];
  $visto = []; $plano = [];
  foreach (array_values($linhas) as $i => $r) {
    $n = psi_imp_numero_linha($r, $i);
    if (!is_array($r)) { $plano[] = psi_imp_item($n, null, 'erro', 'Linha inválida.'); continue; }
    [$dados, $erros] = psi_imp_categoria($r); $rotulo = $dados['nome'] ?? null;
    if ($erros) { $plano[] = psi_imp_item($n, $rotulo, 'erro', implode(' ', $erros)); continue; }
    if (!$dados) { $plano[] = psi_imp_item($n, null, 'ignorado', 'Linha vazia.'); continue; }
    if (!isset($dados['nome'])) { $plano[] = psi_imp_item($n, null, 'erro', 'Informe o nome da categoria.'); continue; }
    if (!isset($dados['tipo'])) { $plano[] = psi_imp_item($n, $rotulo, 'erro', 'Informe o tipo: receita ou despesa.'); continue; }
    [$nome, $er] = psi_tentar(fn() => psi_txt($dados['nome'], 80, true, 'nome'));
    if ($er !== null) { $plano[] = psi_imp_item($n, $rotulo, 'erro', $er); continue; }
    [$desc, $er] = psi_tentar(fn() => psi_txt($dados['descricao'] ?? null, 200, false, 'descrição'));
    if ($er !== null) { $plano[] = psi_imp_item($n, $rotulo, 'erro', $er); continue; }
    $tipo = $dados['tipo']; $chave = $tipo . '|' . psi_imp_chave($nome);
    if (isset($visto[$chave])) { $plano[] = psi_imp_item($n, $rotulo, 'ignorado', 'Repetida no arquivo (já aparece na linha ' . $visto[$chave] . ').'); continue; }
    $visto[$chave] = $n;
    $grupo = $tipo === 'receita' ? 'receita' : ($dados['grupo'] ?? 'variavel');
    $ded = (int)($dados['dedutivel'] ?? 0);
    if (isset($existentes[$chave])) {
      if (!$atualizar) { $plano[] = psi_imp_item($n, $rotulo, 'ignorado', 'Já existe uma categoria com esse nome.'); continue; }
      $cols = []; if ($tipo === 'despesa' && isset($dados['grupo'])) $cols['grupo'] = $grupo; if (isset($dados['dedutivel'])) $cols['dedutivel'] = $ded; if ($desc !== null) $cols['descricao'] = $desc;
      if (!$cols) { $plano[] = psi_imp_item($n, $rotulo, 'ignorado', 'Já existe e sem dados novos para atualizar.'); continue; }
      $plano[] = psi_imp_item($n, $rotulo, 'atualizar', 'Atualiza a categoria existente.', ['id' => $existentes[$chave], 'colunas' => $cols]); continue;
    }
    $plano[] = psi_imp_item($n, $rotulo, 'novo', null, ['valores' => ['tipo' => $tipo, 'nome' => $nome, 'grupo' => $grupo, 'dedutivel' => $ded, 'descricao' => $desc]]);
    $existentes[$chave] = -1;
  }
  return $plano;
}

/** Grava o plano (dentro de uma transação aberta por quem chamou). */
function psi_imp_gravar(string $tipo, array $plano): void {
  $db = psi_db(); $c = psi_conta_id(); $agora = psi_agora();
  $tabela = ['pacientes' => 'psi_pacientes', 'fornecedores' => 'psi_fornecedores', 'categorias' => 'psi_categorias'][$tipo];
  foreach ($plano as $it) {
    if ($it['situacao'] === 'novo') {
      $v = $it['valores'] + ['conta_id' => $c];
      if ($tipo === 'categorias') $v['ordem'] = 999; else $v += ['criado_em' => $agora, 'atualizado_em' => $agora];
      $db->prepare("INSERT INTO $tabela (" . implode(',', array_keys($v)) . ') VALUES (' . psi_marcadores($v) . ')')->execute(array_values($v));
    } elseif ($it['situacao'] === 'atualizar') {
      $cols = $it['colunas']; if ($tipo !== 'categorias') $cols['atualizado_em'] = $agora;
      $set = implode(', ', array_map(fn($k) => "$k = ?", array_keys($cols)));
      $db->prepare("UPDATE $tabela SET $set WHERE id = ? AND conta_id = ?")->execute(array_merge(array_values($cols), [(int)$it['id'], $c]));
    }
  }
}
