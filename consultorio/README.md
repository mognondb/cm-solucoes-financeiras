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
| F1 | Agenda (dia/semana/mês, sessões fixas, conflitos, bloqueios, status, confirmação por WhatsApp) | feito |
| F1 | Contas a receber, pagamentos parciais e estorno, inadimplência, cobrança por WhatsApp, painel do dia | feito |
| F2 | Contas a pagar, contas bancárias, cartão e fatura, despesas fixas, fluxo de caixa | feito |
| F3 | Importar extrato (OFX/CSV/Excel) e conciliar | feito |
| F4 | Recibos em PDF, relatórios, apoio ao carnê-leão, exportar dados, excluir conta (LGPD) | feito |

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
- **Seus dados** (Configurações → Minha conta): exportação completa em JSON (`GET conta/exportar`, sem senhas nem tokens) e exclusão definitiva da conta
  (`POST conta/excluir`, exige a senha e a palavra EXCLUIR; apaga todas as tabelas `psi_*` da conta, lista em `PSI_TABELAS_DA_CONTA`). Ambas funcionam também com o teste expirado.
- Pendente antes de abrir ao público: criptografia de campo para CPF, revisão jurídica dos textos e verificação de SPF/DKIM do e-mail.

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
| `psi_extratos`, `psi_extrato_itens` | Extratos importados e suas linhas (pendente, conciliada, lançada, transferência, ignorada) |
| `psi_recibos`, `psi_recibo_baixas` | Recibos numerados (com cópia dos dados do emitente e do pagador no momento da emissão) e os pagamentos que cada um cobre |
| `psi_auditoria` | Quem fez o quê |

Migrações: v1 base · v2 agenda (índice único das séries) · v3 `psi_transferencias` e `psi_recorrentes`. · v4 `psi_extratos` e `psi_extrato_itens` · v5 `psi_recibos` e `psi_recibo_baixas`.

### Agenda (F1)

- Cada sessão é uma linha em `psi_agendamentos`; o "horário fixo" é uma linha em `psi_series` (semanal ou quinzenal). As ocorrências são **geradas de verdade**
  (180 dias ao criar, estendidas sob demanda quando a agenda é consultada, no máximo 800 dias à frente). Assim cada uma pode ser remarcada, faltar ou ser cancelada sozinha.
- O cursor `psi_series.gerado_ate` só anda para frente: sessão remarcada ou apagada **não volta** quando a série é estendida. O índice único `(serie_id, inicio)`
  (migração v2) e o `INSERT IGNORE` tornam a geração idempotente mesmo com consultas simultâneas.
- **Conflitos:** sobreposição na agenda da mesma profissional (sessões e bloqueios, menos canceladas) → 409 com a lista; `ignorarConflitos: true` (booleano) marca mesmo assim.
- **"Esta e as próximas":** remarcar desloca a série (dia da semana e horário) e as sessões futuras ainda não realizadas; cancelar/apagar encerra a série na data.
  Sessões realizadas ou com falta nunca são deslocadas nem apagadas (cancele em vez de apagar).
- Marcar realizada/falta só vale para hoje ou dias anteriores. Valor e "cobrar" nascem do paciente (mensalista: valor 0 e não cobra; convênio: valor do convênio).

### Cobranças (F1)

Um lançamento (`psi_lancamentos`) é uma conta a receber ou a pagar; `psi_baixas` guarda cada pagamento (parcial ou total). O saldo é sempre `valor − Σ baixas`, nunca um campo.

- **Por sessão:** a sessão marcada como *realizada* gera um lançamento (vencimento = data + prazo do paciente). `chave_unica = "sessao:ID"`: marcar de novo atualiza, não duplica.
  Voltar a sessão para "agendada/cancelada" cancela a cobrança (se ainda não houve pagamento); depois de pago, a cobrança é **mantida** e o aviso diz isso.
- **Falta:** só gera cobrança se `cobrar_falta` estiver ligado, no percentual `falta_percentual`; falta justificada nunca cobra. Sessão sem valor definido avisa e não gera nada.
- **Mensalidade:** um lançamento por mês (atual e próximo) para mensalistas ativos, `chave_unica = "mensal:PACIENTE:AAAA-MM"`. Cancelada, não volta. Quem começou depois do
  vencimento daquele mês não nasce devendo: a primeira mensalidade é a do mês seguinte. Dia 31 vira o último dia de meses curtos.
- **Convênio:** cobrança por sessão, com a operadora como contraparte e o prazo do convênio (padrão 30 dias).
- **Manual:** à vista, já recebido (nasce quitado, com a baixa) ou parcelado em até 60 meses (divisão exata em centavos; a diferença vai para a última parcela).
- **Pagamento:** não pode passar do saldo nem ser futuro; a linha do lançamento é travada (`FOR UPDATE`) para dois cliques não pagarem duas vezes. Estornar reabre a cobrança.
- **Inadimplência:** lançamento aberto com vencimento anterior a hoje, agrupado por paciente, com faixas de atraso (≤7, ≤30, ≤60, >60 dias), último contato e promessa de pagamento.
  "Cobrar no WhatsApp" abre a mensagem pronta (editável em Configurações) e já registra o contato.
- **Início:** painel da rotina (`GET inicio`): sessões de hoje e dos últimos 30 dias ainda por registrar (com botões Realizada/Faltou), indicadores e quem deve.

### Contas, cartão e fluxo de caixa (F2)

- **Saldo é calculado**, nunca guardado: saldo inicial + recebimentos − pagamentos ± transferências **desde a data do saldo inicial** (movimentos anteriores são ignorados).
- **Cartão de crédito** é uma conta cujo saldo é a dívida (negativo). Compra no cartão = pagamento (baixa) naquela conta, no dia da compra (aparece no resultado e em "Pagas");
  a saída de caixa só acontece quando a fatura é paga (transferência da conta para o cartão). A fatura é aproximada: aberta = compras do ciclo atual (pelo dia de fechamento); fechada = o resto da dívida.
- **Despesas fixas** (`psi_recorrentes`, mensais ou anuais) geram a conta a pagar do mês atual e do próximo (`chave_unica = "rec:ID:AAAA-MM"`); cancelada, não volta; a que começou depois do vencimento do mês não nasce atrasada.
- **Fluxo de caixa** (`GET caixa?mes=AAAA-MM`): realizado do mês (só contas que não são cartão), previsto (em aberto, no vencimento), projeção de 60 dias (atrasadas a pagar entram hoje; atrasadas a receber ficam fora)
  e menor saldo previsto. Faturas de cartão entram como saída no vencimento.

### Extrato bancário (F3)

- O arquivo (OFX, CSV ou Excel) é **lido no navegador** com o mesmo leitor do CM Diagnóstico (`assets/js/diagnostico-importar.js`, `CMDiag.importar.lerArquivo`); o servidor recebe só as linhas
  (`data`, `valor` em centavos inteiros, `descricao`, `id` do banco) em `POST extratos` (até 5.000 por pedido; a tela divide arquivos maiores sem separar um mesmo dia).
- **Sem duplicar:** cada linha tem um hash (data, valor, descrição normalizada, id do banco, nº da ocorrência no arquivo) e há índice único por conta + conta financeira. Importar o mesmo arquivo de novo, ou
  períodos que se sobrepõem, só traz o que é novo; duas linhas idênticas no mesmo arquivo continuam sendo dois lançamentos.
- **Conciliar** com uma cobrança/conta em aberto (do mesmo sinal: entrada com a receber, saída com a pagar) cria a baixa **na data do extrato e na conta do extrato**, total ou parcial (nunca acima do saldo).
  **Lançar** cria um lançamento já pago (origem "importação") para o que não estava previsto. **Transferência** registra a movimentação entre contas próprias (pagamento de fatura de cartão incluído).
  **Ignorar** descarta. **Desfazer** remove o que foi criado e devolve a linha a "pendente". Cada linha só vira um movimento, então o dinheiro nunca é contado duas vezes.
- **Sugestões:** valor igual ao restante (+50), nome do paciente/fornecedor na descrição (+20 por palavra, até 40) e vencimento próximo (+20/+10/+3). Só aparece sugestão com valor igual ou nome batendo.
  "Conciliar todas" aplica só as de valor exato e pontuação ≥ 70.

### Recibos e relatórios (F4)

- **Recibo:** emitido a partir de pagamentos já registrados (um ou vários do mesmo paciente) ou **avulso** (valor, referência e pagador livres, inclusive empresa com CNPJ).
  Numeração sequencial por consultório (`0001`, `0002`...), que **nunca se repete**: cancelar mantém o número como "cancelado" (o PDF sai com a marca CANCELADO) e libera os pagamentos para um novo recibo.
  Cada pagamento tem no máximo **um recibo ativo** (índice único). Criança ou paciente com responsável financeiro: o recibo sai no nome e CPF do responsável.
  Os dados do emitente (nome, CPF/CNPJ, CRP, cidade) e do pagador são **copiados na emissão**; editar o cadastro depois não altera recibos antigos.
- **PDF** montado no navegador com o jsPDF do site (`/assets/vendor/jspdf.umd.min.js`, texto vetorial; `app/recibo-pdf.js`), com o valor por extenso. Nada além do download sai do computador.
  No detalhe de um pagamento aparece "Recibo nº ..." (baixa o PDF existente) ou "Emitir recibo".
- **Resultado do mês:** regime de caixa (o que foi recebido e pago no mês; compra no cartão conta no dia da compra), por categoria, fixas × variáveis, ticket médio, quem mais pagou e comparação com o mês anterior. Exporta CSV (`;`, vírgula decimal, BOM) e imprime.
- **Apoio ao carnê-leão:** rendimentos de pessoas físicas por pagador (com CPF), recebidos sem paciente, pagadores sem CPF, despesas de categorias marcadas como "livro-caixa" e uma base estimada (rendimentos − despesas).
  Convênios e empresas (retenção na fonte) ficam de fora. **Não calcula imposto**: é um apoio à organização, e a tela avisa que o contador confirma.

## Testar localmente

Requer PHP 8 com `pdo_mysql` e MySQL/MariaDB.

1. Crie um banco e um `api/config.php` local apontando para ele (o arquivo é ignorado pelo git; **nunca** o publique).
2. Importe `db/schema.sql` (tabela `usuarios` do site, necessária ao login do admin) e crie um usuário `admin`.
3. Suba o servidor com um roteador que encaminhe `/consultorio/api/*` para `consultorio/api/index.php` e o resto para arquivos estáticos
   (`php -S 127.0.0.1:8099 router.php`). O envio de e-mail pode ser capturado com um `sendmail` falso.
4. Abra `/admin/`, entre, aba **Consultório**, "Abrir a plataforma".

Os testes de API e de interface usados no desenvolvimento ficam fora do repositório (cliente HTTP com cookies para a API e Playwright para a tela).
Cada fase nova deve ter os dois: API (isolamento entre contas, CSRF, limites, regras de cobrança) e navegador (desktop e celular de 390 px).
