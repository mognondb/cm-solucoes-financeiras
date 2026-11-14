<?php
/**
 * Esquema do banco da plataforma do consultório (tabelas psi_*), com migrações versionadas e idempotentes.
 * Cada versão só ADICIONA (tabelas/colunas); nunca remove nem renomeia, para poder rodar em produção sem risco.
 * A versão aplicada fica em psi_ajustes("schema_versao"). Duas requisições simultâneas não migram ao mesmo tempo (GET_LOCK).
 */
declare(strict_types=1);

const PSI_TABELAS_DA_CONTA = [ // tudo o que tem conta_id: usado ao excluir uma conta
  'psi_auditoria', 'psi_cobrancas', 'psi_baixas', 'psi_lancamentos', 'psi_agendamentos', 'psi_series', 'psi_pacientes', 'psi_servicos',
  'psi_contas_fin', 'psi_categorias', 'psi_profissionais', 'psi_sessoes', 'psi_usuarios',
];

function psi_migracoes(): array {
  $t = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
  return [
    1 => [
      "CREATE TABLE IF NOT EXISTS psi_ajustes (chave VARCHAR(60) PRIMARY KEY, valor TEXT NULL) $t",
      "CREATE TABLE IF NOT EXISTS psi_contas (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, nome VARCHAR(120) NOT NULL,
        documento VARCHAR(20) NULL, crp VARCHAR(30) NULL, telefone VARCHAR(30) NULL, cidade VARCHAR(80) NULL, uf CHAR(2) NULL, endereco VARCHAR(160) NULL,
        plano ENUM('teste','ativo','expirado','suspenso') NOT NULL DEFAULT 'teste', trial_ate DATE NULL,
        fuso VARCHAR(40) NOT NULL DEFAULT 'America/Sao_Paulo', config_json TEXT NULL,
        criado_em DATETIME NOT NULL, atualizado_em DATETIME NOT NULL
      ) $t",
      "CREATE TABLE IF NOT EXISTS psi_usuarios (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, conta_id BIGINT UNSIGNED NOT NULL, nome VARCHAR(120) NOT NULL,
        email VARCHAR(160) NOT NULL, senha_hash VARCHAR(255) NOT NULL, papel ENUM('dono','assistente') NOT NULL DEFAULT 'dono',
        email_verificado_em DATETIME NULL, termos_aceitos_em DATETIME NULL, termos_versao VARCHAR(20) NULL,
        ultimo_acesso DATETIME NULL, ativo TINYINT(1) NOT NULL DEFAULT 1, criado_em DATETIME NOT NULL,
        UNIQUE KEY uq_email (email), KEY k_conta (conta_id)
      ) $t",
      "CREATE TABLE IF NOT EXISTS psi_sessoes (
        token_hash CHAR(64) PRIMARY KEY, usuario_id BIGINT UNSIGNED NOT NULL, conta_id BIGINT UNSIGNED NOT NULL, csrf CHAR(32) NOT NULL,
        criado_em DATETIME NOT NULL, expira_em DATETIME NOT NULL, ultimo_uso DATETIME NOT NULL, KEY k_usuario (usuario_id), KEY k_exp (expira_em)
      ) $t",
      "CREATE TABLE IF NOT EXISTS psi_tentativas (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, chave CHAR(64) NOT NULL, tipo VARCHAR(20) NOT NULL, criado_em DATETIME NOT NULL, KEY k_chave (chave, tipo, criado_em)
      ) $t",
      "CREATE TABLE IF NOT EXISTS psi_tokens (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, usuario_id BIGINT UNSIGNED NOT NULL, tipo ENUM('redefinir','verificar') NOT NULL,
        token_hash CHAR(64) NOT NULL, expira_em DATETIME NOT NULL, usado_em DATETIME NULL, criado_em DATETIME NOT NULL, KEY k_hash (token_hash)
      ) $t",
      "CREATE TABLE IF NOT EXISTS psi_profissionais (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, conta_id BIGINT UNSIGNED NOT NULL, nome VARCHAR(120) NOT NULL, crp VARCHAR(30) NULL,
        cor CHAR(7) NOT NULL DEFAULT '#5f6f52', ativo TINYINT(1) NOT NULL DEFAULT 1, criado_em DATETIME NOT NULL, KEY k_conta (conta_id)
      ) $t",
      "CREATE TABLE IF NOT EXISTS psi_categorias (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, conta_id BIGINT UNSIGNED NOT NULL, tipo ENUM('receita','despesa') NOT NULL,
        nome VARCHAR(80) NOT NULL, grupo ENUM('fixa','variavel','receita') NOT NULL DEFAULT 'variavel', dedutivel TINYINT(1) NOT NULL DEFAULT 0,
        descricao VARCHAR(200) NULL, ativo TINYINT(1) NOT NULL DEFAULT 1, ordem SMALLINT NOT NULL DEFAULT 0,
        UNIQUE KEY uq_cat (conta_id, tipo, nome)
      ) $t",
      "CREATE TABLE IF NOT EXISTS psi_contas_fin (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, conta_id BIGINT UNSIGNED NOT NULL, tipo ENUM('banco','carteira','cartao','plataforma') NOT NULL DEFAULT 'banco',
        nome VARCHAR(80) NOT NULL, banco VARCHAR(60) NULL, saldo_inicial INT NOT NULL DEFAULT 0, data_saldo DATE NOT NULL,
        limite INT NULL, dia_fechamento TINYINT NULL, dia_vencimento TINYINT NULL, conta_pagamento_id BIGINT UNSIGNED NULL,
        ativo TINYINT(1) NOT NULL DEFAULT 1, ordem SMALLINT NOT NULL DEFAULT 0, criado_em DATETIME NOT NULL, KEY k_conta (conta_id)
      ) $t",
      "CREATE TABLE IF NOT EXISTS psi_servicos (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, conta_id BIGINT UNSIGNED NOT NULL, nome VARCHAR(80) NOT NULL,
        duracao_min SMALLINT NOT NULL DEFAULT 50, valor INT NOT NULL DEFAULT 0, categoria_id BIGINT UNSIGNED NULL,
        ativo TINYINT(1) NOT NULL DEFAULT 1, ordem SMALLINT NOT NULL DEFAULT 0, KEY k_conta (conta_id)
      ) $t",
      "CREATE TABLE IF NOT EXISTS psi_pacientes (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, conta_id BIGINT UNSIGNED NOT NULL, profissional_id BIGINT UNSIGNED NULL,
        nome VARCHAR(120) NOT NULL, apelido VARCHAR(60) NULL, cpf VARCHAR(14) NULL, nascimento DATE NULL,
        telefone VARCHAR(30) NULL, email VARCHAR(160) NULL, resp_nome VARCHAR(120) NULL, resp_cpf VARCHAR(14) NULL, resp_telefone VARCHAR(30) NULL,
        tipo ENUM('individual','casal','familia','infantil','grupo') NOT NULL DEFAULT 'individual', servico_id BIGINT UNSIGNED NULL,
        modalidade_cobranca ENUM('sessao','mensal','convenio') NOT NULL DEFAULT 'sessao',
        valor_sessao INT NOT NULL DEFAULT 0, valor_mensal INT NOT NULL DEFAULT 0, dia_vencimento TINYINT NULL, prazo_dias SMALLINT NOT NULL DEFAULT 0,
        forma_pagamento VARCHAR(30) NULL, convenio_nome VARCHAR(80) NULL, convenio_prazo_dias SMALLINT NULL,
        status ENUM('ativo','pausado','alta','arquivado') NOT NULL DEFAULT 'ativo', obs VARCHAR(500) NULL, desde DATE NULL,
        criado_em DATETIME NOT NULL, atualizado_em DATETIME NOT NULL, KEY k_status (conta_id, status), KEY k_nome (conta_id, nome)
      ) $t",
      "CREATE TABLE IF NOT EXISTS psi_series (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, conta_id BIGINT UNSIGNED NOT NULL, profissional_id BIGINT UNSIGNED NULL, paciente_id BIGINT UNSIGNED NULL,
        servico_id BIGINT UNSIGNED NULL, tipo ENUM('sessao','bloqueio') NOT NULL DEFAULT 'sessao', titulo VARCHAR(120) NULL,
        frequencia ENUM('semanal','quinzenal') NOT NULL DEFAULT 'semanal', dia_semana TINYINT NOT NULL, hora TIME NOT NULL, duracao_min SMALLINT NOT NULL,
        modalidade ENUM('presencial','online') NOT NULL DEFAULT 'presencial', valor INT NOT NULL DEFAULT 0, cobrar TINYINT(1) NOT NULL DEFAULT 1,
        inicio DATE NOT NULL, fim DATE NULL, gerado_ate DATE NULL, ativa TINYINT(1) NOT NULL DEFAULT 1, criado_em DATETIME NOT NULL, KEY k_conta (conta_id, ativa)
      ) $t",
      "CREATE TABLE IF NOT EXISTS psi_agendamentos (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, conta_id BIGINT UNSIGNED NOT NULL, profissional_id BIGINT UNSIGNED NULL, paciente_id BIGINT UNSIGNED NULL,
        servico_id BIGINT UNSIGNED NULL, tipo ENUM('sessao','bloqueio') NOT NULL DEFAULT 'sessao', titulo VARCHAR(120) NULL,
        inicio DATETIME NOT NULL, fim DATETIME NOT NULL,
        status ENUM('agendada','confirmada','realizada','falta','falta_justificada','cancelada') NOT NULL DEFAULT 'agendada',
        modalidade ENUM('presencial','online') NOT NULL DEFAULT 'presencial', valor INT NOT NULL DEFAULT 0, cobrar TINYINT(1) NOT NULL DEFAULT 1,
        serie_id BIGINT UNSIGNED NULL, obs VARCHAR(255) NULL, criado_em DATETIME NOT NULL, atualizado_em DATETIME NOT NULL,
        KEY k_periodo (conta_id, inicio), KEY k_paciente (conta_id, paciente_id), KEY k_serie (serie_id)
      ) $t",
      "CREATE TABLE IF NOT EXISTS psi_lancamentos (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, conta_id BIGINT UNSIGNED NOT NULL, tipo ENUM('receber','pagar') NOT NULL,
        descricao VARCHAR(160) NOT NULL, categoria_id BIGINT UNSIGNED NULL, paciente_id BIGINT UNSIGNED NULL, contraparte VARCHAR(120) NULL,
        valor INT NOT NULL, vencimento DATE NOT NULL, competencia DATE NOT NULL,
        situacao ENUM('aberto','quitado','cancelado') NOT NULL DEFAULT 'aberto', cancelado_motivo VARCHAR(160) NULL,
        forma VARCHAR(30) NULL, conta_fin_id BIGINT UNSIGNED NULL,
        origem ENUM('manual','sessao','mensalidade','convenio','recorrente','importacao') NOT NULL DEFAULT 'manual',
        agendamento_id BIGINT UNSIGNED NULL, grupo_id BIGINT UNSIGNED NULL, parcela TINYINT NULL, parcelas TINYINT NULL, recorrente_id BIGINT UNSIGNED NULL,
        chave_unica VARCHAR(80) NULL, obs VARCHAR(300) NULL, criado_em DATETIME NOT NULL, atualizado_em DATETIME NOT NULL,
        UNIQUE KEY uq_chave (conta_id, chave_unica), KEY k_lista (conta_id, tipo, situacao, vencimento), KEY k_paciente (conta_id, paciente_id), KEY k_comp (conta_id, competencia), KEY k_agenda (agendamento_id)
      ) $t",
      "CREATE TABLE IF NOT EXISTS psi_baixas (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, conta_id BIGINT UNSIGNED NOT NULL, lancamento_id BIGINT UNSIGNED NOT NULL, data DATE NOT NULL,
        valor INT NOT NULL, conta_fin_id BIGINT UNSIGNED NULL, forma VARCHAR(30) NULL, obs VARCHAR(200) NULL, criado_em DATETIME NOT NULL,
        KEY k_lanc (lancamento_id), KEY k_data (conta_id, data)
      ) $t",
      "CREATE TABLE IF NOT EXISTS psi_cobrancas (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, conta_id BIGINT UNSIGNED NOT NULL, paciente_id BIGINT UNSIGNED NOT NULL, lancamento_id BIGINT UNSIGNED NULL,
        canal ENUM('whatsapp','email','telefone','pessoalmente','outro') NOT NULL DEFAULT 'whatsapp', obs VARCHAR(300) NULL, promessa_em DATE NULL,
        usuario_id BIGINT UNSIGNED NULL, criado_em DATETIME NOT NULL, KEY k_paciente (conta_id, paciente_id), KEY k_lanc (lancamento_id)
      ) $t",
      "CREATE TABLE IF NOT EXISTS psi_auditoria (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, conta_id BIGINT UNSIGNED NOT NULL, usuario_id BIGINT UNSIGNED NULL, acao VARCHAR(40) NOT NULL,
        entidade VARCHAR(40) NOT NULL, entidade_id VARCHAR(40) NULL, detalhe_json TEXT NULL, criado_em DATETIME NOT NULL, KEY k_conta (conta_id, criado_em)
      ) $t",
    ],
    /* v2 (agenda): impede duas ocorrências da mesma série no mesmo horário (geração concorrente das sessões fixas). */
    2 => [
      function (PDO $db): void {
        $s = $db->query("SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'psi_agendamentos' AND INDEX_NAME = 'uq_serie_inicio'");
        if ((int)$s->fetchColumn() === 0) $db->exec('ALTER TABLE psi_agendamentos ADD UNIQUE KEY uq_serie_inicio (serie_id, inicio)');
      },
    ],
  ];
}

/** Aplica as migrações pendentes. Barato quando já está tudo em dia (uma consulta). */
function psi_migrar(PDO $db): void {
  static $feito = false;
  if ($feito) return;
  $versaoAtual = 0;
  try {
    $v = $db->query("SELECT valor FROM psi_ajustes WHERE chave = 'schema_versao'")->fetchColumn();
    $versaoAtual = $v === false ? 0 : (int)$v;
  } catch (Throwable $e) { /* tabela ainda não existe: primeira execução */ }
  $migs = psi_migracoes();
  $ultima = max(array_keys($migs));
  if ($versaoAtual >= $ultima) { $feito = true; return; }

  $trava = (int)$db->query("SELECT GET_LOCK('psi_migracao', 20)")->fetchColumn();
  try {
    // depois de esperar a trava outra requisição pode ter migrado
    try { $v = $db->query("SELECT valor FROM psi_ajustes WHERE chave = 'schema_versao'")->fetchColumn(); $versaoAtual = $v === false ? 0 : (int)$v; } catch (Throwable $e) { $versaoAtual = 0; }
    foreach ($migs as $versao => $comandos) {
      if ($versao <= $versaoAtual) continue;
      foreach ($comandos as $sql) { if (is_callable($sql)) $sql($db); else $db->exec($sql); }
      $db->prepare("INSERT INTO psi_ajustes (chave, valor) VALUES ('schema_versao', ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)")->execute([(string)$versao]);
    }
  } finally {
    if ($trava === 1) { try { $db->query("SELECT RELEASE_LOCK('psi_migracao')"); } catch (Throwable $e) { /* ok */ } }
  }
  $feito = true;
}
