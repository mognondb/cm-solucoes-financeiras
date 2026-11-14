<?php
/**
 * Plataforma do consultório (agenda + financeiro para psicólogos): funções básicas da API.
 * Convenções: valores em CENTAVOS (inteiros), datas "AAAA-MM-DD", horários da agenda no fuso da conta (sem conversão),
 * tudo escopado por conta_id (cada psicólogo só enxerga os próprios dados).
 */
declare(strict_types=1);

require_once __DIR__ . '/../../../api/db.php';

const PSI_VERSAO_TERMOS = '2026-11';
const PSI_TRIAL_DIAS_PADRAO = 30;

function psi_db(): PDO { return cmDb(); }

function psi_agora(): string { return gmdate('Y-m-d H:i:s'); }

/** Resposta JSON e fim da requisição. */
function psi_json($dados, int $status = 200) {
  http_response_code($status);
  echo json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
  exit;
}
function psi_erro(string $mensagem, int $status = 400, array $extra = []) {
  psi_json(array_merge(['erro' => true, 'message' => $mensagem], $extra), $status);
}

/** Corpo JSON da requisição (objeto). */
function psi_corpo(int $maxBytes = 1048576): array {
  $raw = file_get_contents('php://input', false, null, 0, $maxBytes + 1);
  if ($raw === false || $raw === '') return [];
  if (strlen($raw) > $maxBytes) psi_erro('Pedido grande demais.', 413);
  $d = json_decode($raw, true);
  if (!is_array($d)) psi_erro('JSON inválido.', 400);
  return $d;
}

/* ------------------------------------------------------------------ validação */
function psi_txt($v, int $max, bool $obrig = false, string $campo = 'campo'): ?string {
  if ($v === null) { if ($obrig) psi_erro("Informe: $campo.", 422); return null; }
  if (!is_scalar($v)) psi_erro("Valor inválido em: $campo.", 422);
  $s = trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]+/u', '', (string)$v));
  if ($s === '') { if ($obrig) psi_erro("Informe: $campo.", 422); return null; }
  if (mb_strlen($s) > $max) psi_erro("$campo: no máximo $max caracteres.", 422);
  return $s;
}
function psi_email($v, bool $obrig = true): ?string {
  $s = psi_txt($v, 160, $obrig, 'e-mail');
  if ($s === null) return null;
  $s = mb_strtolower($s);
  if (!filter_var($s, FILTER_VALIDATE_EMAIL)) psi_erro('Informe um e-mail válido.', 422);
  return $s;
}
function psi_int($v, ?int $min = null, ?int $max = null, string $campo = 'valor', bool $obrig = false): ?int {
  if ($v === null || $v === '') { if ($obrig) psi_erro("Informe: $campo.", 422); return null; }
  if (is_string($v) && !preg_match('/^-?\d{1,12}$/', trim($v))) psi_erro("Número inválido em: $campo.", 422);
  if (!is_int($v) && !is_string($v) && !(is_float($v) && floor($v) === $v)) psi_erro("Número inválido em: $campo.", 422);
  $n = (int)$v;
  if ($min !== null && $n < $min) psi_erro("$campo: mínimo $min.", 422);
  if ($max !== null && $n > $max) psi_erro("$campo: máximo $max.", 422);
  return $n;
}
/** Valor em centavos (inteiro). */
function psi_cent($v, string $campo = 'valor', bool $obrig = false, bool $podeZero = false): ?int {
  $n = psi_int($v, 0, 2000000000, $campo, $obrig);
  if ($n !== null && !$podeZero && $n === 0) psi_erro("$campo: informe um valor maior que zero.", 422);
  return $n;
}
function psi_data($v, bool $obrig = false, string $campo = 'data'): ?string {
  if ($v === null || $v === '') { if ($obrig) psi_erro("Informe: $campo.", 422); return null; }
  if (!is_string($v) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m) || !checkdate((int)$m[2], (int)$m[3], (int)$m[1])) psi_erro("Data inválida em: $campo.", 422);
  return $v;
}
/** "AAAA-MM-DD HH:MM" (ou com T) → "AAAA-MM-DD HH:MM:00". */
function psi_datahora($v, bool $obrig = false, string $campo = 'data e hora'): ?string {
  if ($v === null || $v === '') { if ($obrig) psi_erro("Informe: $campo.", 422); return null; }
  if (!is_string($v) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?$/', $v, $m) || !checkdate((int)$m[2], (int)$m[3], (int)$m[1]) || (int)$m[4] > 23 || (int)$m[5] > 59) psi_erro("Data e hora inválidas em: $campo.", 422);
  return "$m[1]-$m[2]-$m[3] $m[4]:$m[5]:00";
}
function psi_opcao($v, array $permitidas, string $padrao): string {
  return is_string($v) && in_array($v, $permitidas, true) ? $v : $padrao;
}
function psi_bool($v): int { return ($v === true || $v === 1 || $v === '1' || $v === 'true') ? 1 : 0; }
function psi_cpf($v, bool $obrig = false): ?string {
  $s = psi_txt($v, 20, $obrig, 'CPF/CNPJ');
  if ($s === null) return null;
  $d = preg_replace('/\D+/', '', $s);
  if ($d === '') { if ($obrig) psi_erro('Informe o CPF/CNPJ.', 422); return null; }
  if (strlen($d) === 11) { if (!psi_cpf_valido($d)) psi_erro('CPF inválido.', 422); return $d; }
  if (strlen($d) === 14) return $d;
  psi_erro('CPF/CNPJ inválido.', 422);
}
function psi_cpf_valido(string $c): bool {
  if (strlen($c) !== 11 || preg_match('/^(\d)\1{10}$/', $c)) return false;
  for ($t = 9; $t < 11; $t++) {
    $soma = 0; for ($i = 0; $i < $t; $i++) $soma += (int)$c[$i] * (($t + 1) - $i);
    $dig = ((10 * $soma) % 11) % 10;
    if ((int)$c[$t] !== $dig) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ datas no fuso da conta */
function psi_fuso(): DateTimeZone {
  $tz = (PsiSessao::$conta['fuso'] ?? 'America/Sao_Paulo');
  try { return new DateTimeZone($tz); } catch (Throwable $e) { return new DateTimeZone('America/Sao_Paulo'); }
}
function psi_hoje(): string { return (new DateTimeImmutable('now', psi_fuso()))->format('Y-m-d'); }
function psi_agora_local(): string { return (new DateTimeImmutable('now', psi_fuso()))->format('Y-m-d H:i:s'); }
function psi_somar_dias(string $data, int $dias): string { return (new DateTimeImmutable($data))->modify(($dias >= 0 ? '+' : '') . $dias . ' days')->format('Y-m-d'); }
function psi_somar_meses(string $data, int $meses): string {
  // mantém o dia, ou o último dia do mês quando ele não existe (31 → 30/28)
  $d = new DateTimeImmutable($data); $dia = (int)$d->format('j');
  $alvo = $d->modify('first day of this month')->modify(($meses >= 0 ? '+' : '') . $meses . ' months');
  $ult = (int)$alvo->format('t');
  return $alvo->setDate((int)$alvo->format('Y'), (int)$alvo->format('n'), min($dia, $ult))->format('Y-m-d');
}
function psi_data_no_mes(int $ano, int $mes, int $dia): string {
  $ult = (int)(new DateTimeImmutable(sprintf('%04d-%02d-01', $ano, $mes)))->format('t');
  return sprintf('%04d-%02d-%02d', $ano, $mes, max(1, min($dia, $ult)));
}
function psi_inicio_mes(string $data): string { return substr($data, 0, 7) . '-01'; }

/* ------------------------------------------------------------------ utilidades */
function psi_ids(array $linhas, string $col = 'id'): array { return array_map(fn($r) => (int)$r[$col], $linhas); }
function psi_marcadores(array $itens): string { return implode(',', array_fill(0, count($itens), '?')); }
function psi_conta_id(): int { return (int)PsiSessao::$conta['id']; }
function psi_config(): array {
  $padrao = [
    'duracao_padrao' => 50, 'hora_ini' => 7, 'hora_fim' => 21, 'dias_semana' => [1, 2, 3, 4, 5],
    'cobrar_falta' => false, 'falta_percentual' => 100, 'prazo_padrao_dias' => 0,
    'msg_cobranca' => "Olá, {nome}! Tudo bem? Passando para lembrar do pagamento de {descricao}, no valor de {valor}, com vencimento em {vencimento}. Se já pagou, desconsidere. Qualquer dúvida é só me chamar. {profissional}",
    'msg_confirmacao' => "Olá, {nome}! Confirmando nossa sessão de {dia} às {hora}. Pode confirmar sua presença? {profissional}",
  ];
  $c = json_decode((string)(PsiSessao::$conta['config_json'] ?? ''), true);
  return is_array($c) ? array_replace($padrao, $c) : $padrao;
}

/** Trilha de auditoria (quem fez o quê): ações que mexem em dinheiro ou apagam dados. */
function psi_auditar(string $acao, string $entidade, $id = null, array $detalhe = []): void {
  try {
    psi_db()->prepare('INSERT INTO psi_auditoria (conta_id, usuario_id, acao, entidade, entidade_id, detalhe_json, criado_em) VALUES (?,?,?,?,?,?,?)')
      ->execute([PsiSessao::$conta['id'] ?? 0, PsiSessao::$usuario['id'] ?? null, $acao, $entidade, $id === null ? null : (string)$id, $detalhe ? json_encode($detalhe, JSON_UNESCAPED_UNICODE) : null, psi_agora()]);
  } catch (Throwable $e) { /* a trilha nunca derruba a operação */ }
}
