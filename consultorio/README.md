# CM Consultório

Plataforma de gestão para consultórios de psicologia muito pequenos (uma ou duas pessoas, poucas contas bancárias e um cartão):
**pacientes, agenda, contas a receber (com inadimplência), contas a pagar, fluxo de caixa, extrato bancário, recibos e relatórios.**
Pense em um "Conta Azul" feito para essa rotina, com a agenda no centro: o que acontece na agenda gera o que há para receber.

- Endereço: `/consultorio/` (aplicativo) e `/consultorio/api/` (API).
- **Não é linkada em lugar nenhum do site público** (nem menu, rodapé, sitemap ou robots). Enquanto estiver em desenvolvimento só se entra
  pela aba **Consultório** do painel administrativo (`/admin/`), que libera o acesso. Quando estiver pronta, a mesma aba abre ao público.
- Só administrativo e financeiro. **Sem prontuário nem anotações clínicas** (os termos pedem que o profissional não registre nada clínico).
- Este arquivo é bloqueado na web pelo `.htaccess` da pasta.

## Estado

| Fase | Conteúdo | Situação |
|---|---|---|
| F0 | Base: API, segurança, acesso restrito, cadastro/login/teste grátis, configurações, painel admin | feito |
| F1 | Pacientes e tipos de atendimento | feito |
| F1 | Agenda (calendário, recorrência, status das sessões) | a fazer |
| F1 | Contas a receber, baixas, inadimplência, cobrança | a fazer |
| F2 | Contas a pagar, contas bancárias, cartão e fatura, despesas fixas, fluxo de caixa | a fazer |
| F3 | Importar extrato (OFX/CSV/Excel) e conciliar | a fazer |
| F4 | Recibos em PDF, relatórios, apoio ao carnê-leão, exportar dados, excluir conta (LGPD) | a fazer |

Rotas do aplicativo que ainda não têm tela aparecem como "Em construção" (lista `PRONTAS` em `app/main.js`: ao criar uma tela, acrescente-a ali).
O hash aceita parâmetros (`#/agenda?paciente=12`): a tela recebe `abrir(el, resto, consulta)`.

## Arquitetura

- **Sem framework e sem etapa de build.** Front-end em JavaScript puro (módulos ES), PHP 8.0+ e MySQL. Mesma hospedagem do site (Hostinger).
- A conexão com o banco e as configurações vêm do mesmo `api/db.php` / `api/config.php` do site (`cmDb()`, `cmConfig()`).
- **Multi-inquilino:** toda linha tem `conta_id`; toda consulta filtra por ele. Os ajudantes `psi_da_conta()` e `psi_categoria_id()`
  conferem que um id recebido pertence à conta antes de usá-lo.
- **Dinheiro em centavos inteiros.** Datas da agenda como data e hora locais sem fuso (o consultório é um só lugar).
- **Migrações versionadas e idempotentes** (`lib/esquema.php`, `psi_ajustes.schema_versao`, protegidas por `GET_LOCK`). Só se acrescenta:
  nunca se apaga nem se renomeia coluna em produção. Cada fase nova é uma versão nova.
- **Roteador próprio** (`lib/roteador.php`). Cada rota declara o nível de acesso: `livre`, `admin`, `publica`, `login`, `login_sempre`.

```
consultorio/
  index.html, termos.html, privacidade.html   páginas (noindex)
  .htaccess                                    noindex, sem cache nos estáticos, bloqueia *.md
  app/                                         aplicativo
    main.js      rotas por hash (#/inicio), casca (menu lateral / barra inferior no celular), faixas de aviso
    ui.js        html`` com escape automático, modais, formulários, datas, dinheiro, WhatsApp
    api.js       fetch com CSRF, erros e eventos de sessão
    estado.js    estado do app e cache (serviços, categorias, contas)
    app.css      sistema de design
    telas/       uma tela por rota (acesso, inicio, config, ...)
  api/
    index.php    ponto de entrada, migrações, rotas
    lib/         base, esquema, padroes, seguranca, roteador, email, rotas_auth, rotas_conta, rotas_admin (negado pela web)
```

### Interface

- `html` é uma *tagged template* que escapa tudo por padrão (proteção contra XSS); só `raw()` deixa passar HTML cru e só é usado com texto fixo.
- Listeners em elementos que sobrevivem à re-renderização usam `elemento.onclick = ...` (não `addEventListener`), para não acumular
  a cada recarga da lista (isso já causou janelas duplicadas).
- Telas são carregadas sob demanda (`import()`); uma tela listada em `PRONTAS` que falhar mostra o erro de verdade.

## Acesso restrito

Configuração `acesso` em `psi_ajustes`: `restrito` (padrão) ou `aberto`.

1. Em `restrito`, toda rota que não seja `livre` ou `admin` exige o cookie `psi_adm` (assinado com HMAC, validade de 8 h).
2. O cookie é emitido por `POST restrito/entrar`, que exige autenticação HTTP Basic de um **administrador** da tabela `usuarios` do site.
3. A aba **Consultório** do painel: "Abrir a plataforma" faz essa chamada com a credencial que o painel já guarda e abre `/consultorio/`.
   Também alterna `restrito`/`aberto` (com confirmação), define os dias de teste grátis e lista as contas, podendo mudar o plano de cada uma.
4. Visitante sem o cookie vê apenas "Plataforma em desenvolvimento".

**Para abrir ao público:** terminar as fases, ter os termos e a política revisados por advogado (hoje são rascunho, versão `2026-11`),
validar a entrega de e-mail (SPF/DKIM do domínio) e então usar "Abrir ao público…" na aba. Só então considerar link no site.

## Segurança e LGPD

- Sessão em cookie `psi_sess`: `HttpOnly`, `SameSite=Lax`, `Secure` em HTTPS, restrito a `/consultorio/`. O banco guarda só o `sha256` do token.
- **CSRF:** cabeçalho `X-CSRF-Token` em toda escrita, além de checagem de `Origin`.
- **Senhas** com `password_hash` (bcrypt); mensagens de erro de login genéricas e de tempo constante (inclusive para e-mail inexistente).
- **Limite de tentativas** (`psi_tentativas`): login por e-mail e por IP; cadastro e recuperação de senha por IP (a recuperação também por e-mail); reenvio da confirmação por usuário.
- O segredo que assina o cookie `psi_adm` é derivado da configuração do servidor (não está no repositório nem no banco).
- **Tokens de uso único** (confirmação de e-mail, redefinição de senha), guardados só como hash, com validade curta.
- **Isolamento entre contas** em todas as consultas; **trilha de auditoria** (`psi_auditoria`) das operações financeiras.
- Cabeçalhos de segurança e `noindex` nas páginas e na API.
- Teste grátis (`trial_dias`, padrão 30): contas `teste`, `ativo`, `expirado`, `suspenso`. Conta expirada ou suspensa fica **somente leitura**
  (escritas respondem 402), e o profissional continua vendo e exportando os dados.
- Papéis na LGPD: o profissional é o controlador dos dados dos pacientes; a CM é operadora. Para o cadastro do profissional a CM é controladora.
- Fase final: criptografia de campo para CPF, exportação completa dos dados e exclusão da conta.

## Modelo de dados (prefixo `psi_`)

| Tabela | Para quê |
|---|---|
| `psi_ajustes` | Chave/valor da plataforma: `schema_versao`, `acesso`, `trial_dias` |
| `psi_contas` | O consultório: nome, CPF/CNPJ, CRP, endereço, plano, fim do teste, configurações (`config_json`) |
| `psi_usuarios`, `psi_sessoes`, `psi_tokens`, `psi_tentativas` | Acesso, sessões, tokens de uso único e limite de tentativas |
| `psi_profissionais` | Quem atende (cor própria na agenda) |
| `psi_servicos` | Tipos de atendimento com duração e valor padrão |
| `psi_pacientes` | Cadastro administrativo: contato, responsável financeiro, como paga (`sessao`/`mensal`/`convenio`), valores, vencimento |
| `psi_series`, `psi_agendamentos` | Recorrência semanal/quinzenal e as ocorrências materializadas; estados: agendada, confirmada, realizada, falta, falta justificada, cancelada; bloqueios |
| `psi_lancamentos` | A receber e a pagar (valor, vencimento, competência, situação, origem, parcelas). `chave_unica` torna a geração automática idempotente |
| `psi_baixas` | Pagamentos e recebimentos, inclusive parciais; estorno |
| `psi_cobrancas` | Registro de cobranças feitas (WhatsApp, e-mail...) e promessas de pagamento |
| `psi_contas_fin` | Bancos, carteira, cartão de crédito e plataformas (quantidade livre) |
| `psi_categorias` | 13 de receita e 22 de despesa já sugeridas (fixa/variável; "pode entrar no livro-caixa"), editáveis |
| `psi_auditoria` | Quem fez o quê |

Fases seguintes acrescentam: `psi_transferencias`, `psi_recorrentes` (F2); `psi_extratos`, `psi_extrato_itens` (F3); `psi_recibos` (F4).

### Regras de cobrança previstas (F1)

- **Por sessão:** a sessão marcada como *realizada* gera um lançamento a receber (vencimento = data + prazo do paciente).
- **Falta:** só gera cobrança conforme a política do consultório (`cobrar_falta`, `falta_percentual`).
- **Mensalidade:** um lançamento por mês, com `chave_unica` (paciente + competência), então rodar a geração duas vezes não duplica.
- **Convênio:** cobrança por sessão, com a operadora como contraparte e prazo próprio.
- **Inadimplência:** lançamento `aberto` com vencimento anterior a hoje; a lista por paciente mostra atraso e último contato, e o botão de
  cobrança abre o WhatsApp com a mensagem padrão preenchida (a mensagem é editável em Configurações).

## Testar localmente

Requer PHP 8 com `pdo_mysql` e MySQL/MariaDB.

1. Crie um banco e um `api/config.php` local apontando para ele (o arquivo é ignorado pelo git; **nunca** o publique).
2. Importe `db/schema.sql` (tabela `usuarios` do site, necessária ao login do admin) e crie um usuário `admin`.
3. Suba o servidor com um roteador que encaminhe `/consultorio/api/*` para `consultorio/api/index.php` e o resto para arquivos estáticos
   (`php -S 127.0.0.1:8099 router.php`). O envio de e-mail pode ser capturado com um `sendmail` falso.
4. Abra `/admin/`, entre, aba **Consultório**, "Abrir a plataforma".

Os testes de API e de interface usados no desenvolvimento ficam fora do repositório (cliente HTTP com cookies para a API e Playwright para a tela).
Cada fase nova deve ter os dois: API (isolamento entre contas, CSRF, limites, regras de cobrança) e navegador (desktop e celular de 390 px).
