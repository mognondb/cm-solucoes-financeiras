# CM Soluções Financeiras — Site

Site estático (HTML/CSS/JS puro) para a CM Soluções Financeiras, publicado via GitHub Pages.

## Estrutura

```
index.html                 Página única com todas as seções
assets/css/style.css        Estilos
assets/js/main.js           Menu mobile, formulário de contato e renderização dinâmica
assets/data/infoprodutos.json  Dados dos infoprodutos (cadastrados via /admin/)
assets/downloads/           Planilhas gratuitas (CSV) disponíveis para download
assets/img/                 Logo e imagens
admin/                      Painel administrativo (escondido, não linkado no site)
admin/worker.js             Código do servidor (Cloudflare Worker) usado pelo painel
admin/cliente.html(.js)     Pasta de um cliente: lista e cadastra os dashboards dele
admin/construtor.html(.js/.css)  Construtor livre de dashboards (arrastar e soltar blocos)
admin/widgets.js(.css)      Motor de blocos (gráficos/tabela/KPI/texto) — compartilhado
                             entre o construtor e a apresentação
admin/relatorio.html(.js/.css)  Apresentação de um dashboard ao cliente
admin/README-servidor.md    Passo a passo para publicar o servidor
robots.txt                  Bloqueia indexação de /admin/ por buscadores
legacy-jekyll-boilerplate/  Arquivos antigos do scaffold padrão do GitHub Pages (não usados)
.nojekyll                   Desativa o processamento Jekyll para servir os arquivos como estão
```

## Seções da página

1. **Hero** — apresentação rápida da CM, com o aviso "Novo · Diagnóstico financeiro gratuito" no alto, o botão principal
   "Fazer o diagnóstico gratuito" e o microtexto (gratuito · cerca de 6 minutos). O menu tem o item destacado
   "Diagnóstico grátis" (primeiro da lista, também nas páginas de conteúdo e do diagnóstico).
2. **CM Diagnóstico** (`#plataformas`, faixa escura logo depois do topo) — o diagnóstico como protagonista (selos
   "Plataforma digital" e "Gratuito", benefícios, prévia do painel e botões para `/diagnostico/`). Se o diagnóstico
   deixar de ser gratuito, altere o selo "Gratuito", o aviso do topo, o microtexto e o item do menu. A imagem
   `assets/img/diagnostico-painel.png` é uma captura do relatório de exemplo (dados fictícios); ao mudar o visual do
   painel, gere outra a partir de `/diagnostico/?exemplo=preciso`.
3. **Sobre** — quem é a CM e como ela trabalha.
4. **Conteúdos** — o conteúdo mais recente (some enquanto nada foi publicado); a lista completa fica em `/conteudos/`.
5. **Painel** — dashboard interativo de demonstração.
6. **Serviços** — BPO Financeiro (a partir de R$ 797/mês, com o que está incluso) e Emissão de notas fiscais
   (valor por faixa de notas/mês).
7. **Infoprodutos** — planilhas gratuitas e produtos pagos (Hotmart), carregados do
   servidor do painel (ou de `assets/data/infoprodutos.json` como fallback), mais as páginas de venda
   criadas na aba "Conteúdos" com o tipo "Infoproduto".
8. **Contato / Relatório** — formulário para o cliente interessado preencher.

## Painel administrativo (`/admin/`)

Página **escondida** (não aparece no menu, bloqueada em `robots.txt`) para cadastrar
infoprodutos **sem editar código**.

- Acesse `seusite.com/admin/`
- Login: **usuário e senha**, só isso — verificados por um servidor próprio
  (Cloudflare Worker, gratuito, sem token de GitHub nem de nada) — veja
  **`admin/README-servidor.md`** para o passo a passo de publicá-lo (uma vez só,
  leva uns 5 minutos).
- O servidor guarda o usuário/senha como segredo e os dados cadastrados num banco
  de dados próprio do Cloudflare (KV) — nada disso fica no código do site. O
  navegador só envia usuário/senha a cada chamada; é o servidor quem decide se
  autoriza.
- Depois de configurado, o navegador lembra o endereço do servidor; o login do dia a
  dia é só usuário e senha.
- Cada "Salvar alterações" grava direto no servidor — fica no ar na hora, sem
  precisar de novo deploy do site.
- **Infoprodutos grátis**: o campo "link" deve apontar para um arquivo já existente em
  `assets/downloads/`. Para adicionar um arquivo novo, é preciso subir ele no repositório
  (o painel ainda não faz upload de arquivo).
- **Infoprodutos pagos**: o campo "link" é a URL de checkout da Hotmart
  (ex: `https://pay.hotmart.com/XXXXXXX`).

O painel não aparece no menu do site e é bloqueado em `robots.txt`, mas isso é só para
não aparecer em buscas — quem de fato impede alguém de salvar algo é o usuário/senha
verificado pelo servidor.

### Clientes: construtor de dashboards (apresentação ao vivo)

Uma terceira aba do painel, **"Clientes"**, funciona como uma pasta por cliente
(`admin/cliente.html?id=<id>`): dentro de cada cliente você cadastra quantos
dashboards quiser, um por período (ex.: Instituto Luanda → Setembro/2026,
Outubro/2026...), para apresentar numa reunião. Diferente dos infoprodutos (que são
públicos), **esses dados de cliente nunca são públicos**: tanto a leitura quanto a
gravação exigem login no servidor.

- **Aba "Clientes"** (`admin/index.html`): lista os clientes cadastrados, cria novos
  (nome + observações) e exclui (excluir um cliente apaga também todos os dashboards
  dele).
- **Dentro de um cliente** (`admin/cliente.html?id=<id>`): uma lista única de
  dashboards. O botão **"+ Novo dashboard"** oferece duas formas de criar um:
  1. **Construtor livre** (`admin/construtor.html`) — monte o dashboard do zero:
     clique num botão de bloco (Gráfico de barras, Linha, Pizza, Tabela, Indicador/KPI,
     Bloco de texto ou Segmentação por período) para adicioná-lo à tela, arraste-o
     pelo ícone ⠿⠿ para a posição desejada e arraste o canto inferior direito pra
     redimensionar. Preencha os dados de cada bloco manualmente (linha por linha) ou
     importando uma planilha (.xlsx — primeira coluna/linha como rótulo, demais como
     valores). Crie quantas abas quiser pelo botão **"+ Nova aba"** (clique duas vezes
     no nome de uma aba para renomeá-la).

     O bloco **Segmentação por período** cria botões (ex: "Jan/2026", "Fev/2026") que
     trocam os dados de todos os outros blocos da mesma aba de uma vez — ao editar
     qualquer outro bloco, a opção **"Aplicar a"** deixa escolher se o conteúdo é o
     mesmo para todos os períodos ou diferente por período.
  2. **Link público** — para quem já usa Power BI ou Looker Studio: cole o link de
     **"Publicar na web" / "Embed"** (não o link comum de acesso) e a apresentação
     mostra o dashboard embutido num iframe.

  Cada dashboard pode ser editado, marcado como ativo/inativo e removido. Dashboards
  antigos, criados antes do construtor (fechamento/orçamento/comissões importados de
  planilha), continuam aparecendo na lista e podem ser abertos normalmente — só não
  têm mais botão de editar, já que esse formato de criação foi substituído pelo
  construtor livre.
- **Apresentar ao cliente**: cada dashboard salvo ganha uma página própria em
  `admin/relatorio.html?id=<id>` (link "Abrir" na lista do cliente) — navegável por
  abas, pronta pra usar numa tela/projeção durante a reunião (ou, no modo de link
  público, o próprio dashboard do Power BI/Looker Studio embutido). Pede login própria
  (mesmo usuário/senha do painel) e tem um link de volta para a pasta do cliente certo.
- Esses dados ficam só no Cloudflare KV (nunca no repositório Git) — por isso nenhum
  cliente ou dashboard real está versionado aqui.

### Conteúdos e páginas de venda de infoprodutos (aba "Conteúdos")

No painel, a aba **Conteúdos** lista as publicações; **+ Nova publicação** abre o editor
(`admin/conteudo.html`). Ao começar, escolha o tipo:

- **Conteúdo**: artigo, manual de uso de planilha, apresentação de painel, novidade. Vira a página
  `/conteudos/<endereço>`, aparece na lista `/conteudos/` e o mais recente aparece na página inicial.
- **Infoproduto**: página de venda (imagens com legenda, lista do que vem no produto, perguntas
  frequentes, preço e botão de compra). Vira `/infoprodutos/<endereço>` e aparece **junto dos cartões
  de infoprodutos** da página inicial.

Cada publicação é uma lista de **blocos**: texto formatado, foto, imagem ao lado do texto, galeria,
arquivo para baixar (planilha, PDF, .pbix), tabela (dá para colar do Excel), fórmula com botão "Copiar",
painel/vídeo incorporado (Power BI "Publicar na Web", Looker Studio, Google Planilhas, YouTube, Vimeo),
o painel interativo de demonstração da home, caixa de destaque, passo a passo, lista, perguntas
frequentes, botão e chamada para compra. Dá para salvar como rascunho, **agendar** (data futura) e ver
a **pré-visualização** (computador e celular) com o mesmo visual do site.

**Publicar por arquivo:** um post também pode entrar no ar sem passar pelo painel: o arquivo `api/seeds/<nome>.php`
(retorna `['arquivos' => [...imagens exigidas...], 'post' => [...]]`, no mesmo formato do editor) é aplicado uma única vez,
na primeira chamada da API depois do deploy. Depois de criado, o post é editado normalmente no painel e, se for
apagado lá, não volta.

**Capa provisória:** publicação sem foto de capa ganha, na prévia do link (WhatsApp, LinkedIn...), uma
capa 1200x630 desenhada pelo servidor com a marca, a categoria e o título (`conteudos/capa.php`, fontes em
`assets/fonts/`, infoprodutos mostram também o preço). Se o servidor não conseguir desenhar, usa a
imagem fixa `assets/img/capa-padrao.png`, que também é a imagem da página inicial e da lista de conteúdos.

Detalhes técnicos: tabela `posts` (criada sozinha na primeira chamada, sem passo manual); código em
`api/blog_lib.php` (sanitização e renderização) e `api/blog_routes.php` (rotas `/api/posts`,
`/api/post` públicas e `/api/admin/post*` e `/api/admin/upload` só para administrador); páginas em
`conteudos/` e `infoprodutos/` (PHP, com `.htaccess` para os endereços bonitos); fotos e arquivos
enviados ficam em `uploads/midia/` no servidor (não vão para o Git). Qualquer pessoa com o endereço
consegue baixar um arquivo enviado: para produtos pagos, entregue o arquivo pela plataforma de venda.

### Usuários com acesso limitado

Além do seu login (usuário/senha configurado como secret do Worker — sempre com
acesso total), a aba **"Usuários"** do painel (`admin/index.html`) permite criar
outros acessos, cada um com uma permissão:

- **Administrador** — acesso total ao painel, igual ao login mestre.
- **Cliente** — só enxerga a pasta de **um** cliente específico
  (`admin/cliente.html?id=<id>`), em modo leitura (sem criar, editar, ativar/desativar
  ou remover dashboards) — útil pra dar acesso só aos dashboards já publicados daquele
  cliente.
- **Dashboard** — só enxerga **um** dashboard específico
  (`admin/relatorio.html?id=<id>`), em modo leitura — útil pra compartilhar o link de
  apresentação de um dashboard só com quem precisa ver aquele, sem dar acesso a mais
  nada.

Essas senhas ficam guardadas no Cloudflare KV com hash (PBKDF2), nunca em texto puro —
diferente do login mestre, que continua sendo um secret do Worker. Criar, editar e
excluir usuários exige estar logado como administrador.

### CM Diagnóstico (plataforma de análise e captação de leads qualificados)

O botão principal do topo da home e a seção "Plataformas digitais" levam a `/diagnostico/` (`diagnostico/index.php`).
Não é um questionário genérico: o percurso se adapta ao perfil de quem responde, uma pergunta por tela.

1. **Perfil** (segmento, tempo, porte, equipe, modelo) — com um resumo de como o percurso será adaptado
   (quem trabalha sozinho não responde sobre funcionários nem folha).
2. **Panorama financeiro** — faturamento, custos diretos, despesas fixas, dívidas, reserva de caixa e
   formas de recebimento, em faixas.
3. **Operação do segmento** — alimentação (estoque, desperdício, custo por item, compras), saúde,
   estética e beleza, comércio, serviços e "outro".
4. **Organização e gestão** — separação pessoal/negócio, registros, contas a pagar e a receber,
   retirada, lucro, planejamento e acompanhamento.
5. **Aprofundamento** — só aparece quando as respostas pedem (aplicativos, cartão, estoque, perdas, fichas
   técnicas, convênios, pacotes, recebíveis, dívidas).

No fim a pessoa informa os dados de contato (com aceite) e recebe o relatório. O resultado traz **três
análises separadas** (saúde financeira, maturidade de gestão e eficiência operacional), seis dimensões, uma
leitura integrada e recomendações por prioridade — nunca uma nota única. Há também uma **simulação** com um
negócio de alimentação (`/diagnostico/?exemplo=1`, ou o link "Ver um exemplo"); ela não envia nada.

**Modo preciso e importação de extrato.** No resumo do perfil a pessoa escolhe entre *rápido* (faixas, ~6 min) e
*preciso* (~12 min). No preciso as perguntas de faixa viram campos de valor (R$, %, dias, horas; quem não sabe o valor
exato volta à faixa), entram perguntas mais detalhadas (ticket médio, dias de funcionamento, impostos, retirada, saldo,
prazos de recebimento e pagamento e, por segmento, o item mais vendido, a ocupação da agenda, o estoque, o valor da hora)
e o relatório ganha um **painel gráfico** (cascata da venda até a sobra do mês e indicadores-chave). Quem respondeu o
rápido pode "Deixar mais preciso" sem repetir o que já respondeu.
Opcionalmente a pessoa **importa o extrato** (OFX, CSV ou Excel .xlsx; PDF não é aceito): o sistema identifica faturamento,
custos, despesas, impostos, retirada, dívidas, canais de venda e saldo, pede que ela confirme as maiores origens, mostra
"o que encontramos e o que vamos perguntar" (só pergunta o que o extrato não deu) e o painel passa a incluir entradas e
saídas mês a mês, os canais de venda e o saldo semana a semana.
- **Privacidade**: o arquivo é lido **no navegador** (`assets/js/diagnostico-importar.js` não faz requisição de rede) e nunca
  é enviado. Se a pessoa enviar o diagnóstico, só vão totais: por categoria, por mês e por semana, sem nomes, descrições nem
  o arquivo. Isso também é o que fica no banco e aparece no painel.
- **Regras de classificação** (palavras-chave de adquirentes, aplicativos, aluguel, energia, impostos, parcelas...): ficam
  em `RE_ENTRADA` e `RE_SAIDA` no importador. O que as regras não reconhecem (em geral transferências para pessoas) é
  perguntado à pessoa. Cada valor importado continua editável.
- **Modo preciso (código)**: perguntas com `tipo: 'valor'` e a função `par()` (cria o campo de valor a partir da faixa) em
  `diagnostico-dados.js`; indicadores e pontuações novos em `diagnostico-motor.js`; recomendações exclusivas em `diagnostico-recs.js`;
  gráficos (SVG, sem biblioteca) em `diagnostico-relatorio.js`.

- **Onde editar**: `assets/js/diagnostico-dados.js` (perguntas, opções, pontos de cada resposta e as
  referências de margem por segmento em `LIM_MARGEM`), `diagnostico-recs.js` (recomendações e quando
  aparecem), `diagnostico-motor.js` (cálculo dos indicadores, notas e leitura integrada),
  `diagnostico-relatorio.js` (o relatório e o painel gráfico) e `diagnostico-importar.js` (leitura de extratos). Para um novo segmento: incluir em `SEGMENTOS`, criar as
  perguntas da etapa 3 com `se`, e preencher `LIM_MARGEM`, `EFICIENCIA_DESC`, as opções de recebimento e as
  recomendações. Ao alterar qualquer arquivo, aumente o `?v=` dele em `diagnostico/index.php` e `admin/index.html`.
- **Calibragem**: os pesos, as notas e as referências de margem são regras práticas para pequenos negócios,
  não benchmarks validados — vale ajustá-los comparando com casos reais.
- **Indicadores**: vêm de faixas de valor (usa-se o ponto médio de cada faixa), por isso são estimativas e o
  relatório avisa disso. "Não sei informar" nos valores deixa o indicador de fora e vira a recomendação de
  levantar os números; nas perguntas de prática vale 0 ponto.
- **Dados**: cada envio vai para a tabela `diagnosticos` (colunas `segmento`, `versao`, `respostas_json` e
  `resultado_json` são criadas sozinhas na primeira chamada da API) e aparece na aba **"Diagnósticos"** do painel,
  com segmento, nível de cada análise, o relatório completo e as respostas pergunta a pergunta. Diagnósticos do
  formulário antigo continuam abrindo normalmente. A CM também recebe um e-mail de aviso (função `mail()` do PHP,
  melhor esforço; se falhar, o registro continua no painel).
- **Spam**: campo-armadilha invisível, validação de e-mail e consentimento no servidor e limite de tamanho do envio.

## Configurações pendentes (precisam dos seus dados reais)

### 1. Formulário de contato (relatório)
O formulário geral em `index.html` (`id="formRelatorio"`) está apontando para:
```html
action="https://formspree.io/f/SEU_FORM_ID"
```
Para funcionar de verdade:
1. Crie uma conta gratuita em https://formspree.io
2. Crie um formulário, configure o e-mail de destino como `contato@cmfinanceiro.com`
   e copie o endpoint gerado (`https://formspree.io/f/xxxxxxx`)
3. Substitua `SEU_FORM_ID` pelo ID real em `index.html`


**Se você já tinha publicado o Worker antes:** toda vez que `admin/worker.js` for
atualizado (o arquivo ganhou rotas e validações novas várias vezes — clientes/
relatórios, usuários, Diagnóstico Financeiro, e agora o construtor de dashboards),
copie o conteúdo novo para o Worker no Cloudflare (Edit code → colar → Save and
Deploy). Nenhuma variável nova é obrigatória.

### 5. Site público já busca os dados em tempo real
`assets/js/main.js` (constante `ADMIN_API_URL`) já aponta pro Worker publicado — os
Infoprodutos do site mostram direto o que está cadastrado no painel (sem precisar de
novo deploy a cada alteração), com `assets/data/infoprodutos.json` só como reserva
caso o servidor esteja fora do ar. O CM Diagnóstico envia as respostas para o mesmo servidor
(`/api/diagnostico`).

## Publicação

O site já está pronto para o GitHub Pages: basta habilitar Pages apontando para a branch
publicada, usando a pasta raiz (`/`).
