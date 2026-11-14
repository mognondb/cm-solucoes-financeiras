-- Esquema do banco de dados MySQL (Hostinger) do site CM Soluções Financeiras.
-- Substitui o KV do Cloudflare Worker: mesma informação, agora relacional.
--
-- Como aplicar: no hPanel da Hostinger, abra "Bancos de Dados MySQL" → phpMyAdmin
-- do banco que você criou → aba "Importar" → selecione este arquivo → Executar.
-- Pode rodar uma única vez; CREATE TABLE IF NOT EXISTS evita duplicar se rodar de novo.

CREATE TABLE IF NOT EXISTS usuarios (
  username VARCHAR(80) PRIMARY KEY,
  nome VARCHAR(160) NOT NULL,
  papel ENUM('admin','cliente','dashboard') NOT NULL,
  cliente_id VARCHAR(120) NULL,
  relatorio_id VARCHAR(160) NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  salt_hex CHAR(32) NOT NULL,
  hash_hex CHAR(64) NOT NULL,
  criado_em VARCHAR(32) NOT NULL,
  atualizado_em VARCHAR(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS clientes (
  id VARCHAR(120) PRIMARY KEY,
  nome VARCHAR(200) NOT NULL,
  dados_json LONGTEXT NULL,
  criado_em VARCHAR(32) NOT NULL,
  atualizado_em VARCHAR(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS relatorios (
  id VARCHAR(160) PRIMARY KEY,
  cliente_id VARCHAR(120) NOT NULL,
  cliente VARCHAR(200) NOT NULL,
  tipo VARCHAR(40) NOT NULL,
  modo VARCHAR(40) NOT NULL DEFAULT 'importado',
  periodo VARCHAR(120) NOT NULL,
  descricao VARCHAR(255) NULL,
  embed_url TEXT NULL,
  extra_json LONGTEXT NULL,
  dados_token CHAR(48) NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  atualizado_em VARCHAR(32) NOT NULL,
  CONSTRAINT fk_relatorios_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
  INDEX idx_relatorios_cliente (cliente_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS relatorio_dados (
  relatorio_id VARCHAR(160) PRIMARY KEY,
  dados_json LONGTEXT NULL,
  atualizado_em VARCHAR(32) NULL,
  CONSTRAINT fk_relatorio_dados_relatorio FOREIGN KEY (relatorio_id) REFERENCES relatorios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS diagnosticos (
  id VARCHAR(80) PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL,
  telefone VARCHAR(40) NULL,
  empresa VARCHAR(120) NULL,
  ramo VARCHAR(80) NULL,
  colaboradores VARCHAR(40) NULL,
  controle_atual VARCHAR(80) NULL,
  dificuldade VARCHAR(160) NULL,
  objetivo VARCHAR(160) NULL,
  urgencia VARCHAR(60) NULL,
  mensagem TEXT NULL,
  lido TINYINT(1) NOT NULL DEFAULT 0,
  criado_em VARCHAR(32) NOT NULL,
  segmento VARCHAR(40) NULL,
  versao TINYINT NULL,
  respostas_json MEDIUMTEXT NULL,
  resultado_json MEDIUMTEXT NULL,
  pdf_token_hash CHAR(64) NULL,
  pdf_enviado_em VARCHAR(32) NULL,
  pdf_tentativas TINYINT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS infoprodutos (
  id VARCHAR(120) PRIMARY KEY,
  nome VARCHAR(200) NOT NULL,
  descricao TEXT NULL,
  icone VARCHAR(16) NULL,
  tipo VARCHAR(40) NOT NULL,
  preco_label VARCHAR(40) NULL,
  link TEXT NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  ordem INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
