<?php
/**
 * Semente (uma única vez): cria a página de venda da "Planilha de Controle Financeiro para Psicólogos"
 * e remove o infoproduto cadastrado antes. Chamada por api/index.php (garantirProdutoPsicologos).
 * O texto e as imagens (assets/img/produtos/controle-financeiro-psicologos/) são os mesmos que a pessoa
 * edita depois no painel; apagar a publicação lá não faz ela voltar (o marcador fica na tabela "migracoes").
 */
declare(strict_types=1);

const PRODUTO_PSICOLOGOS_ARQUIVOS = ["/assets/img/produtos/controle-financeiro-psicologos/capa.png", "/assets/img/produtos/controle-financeiro-psicologos/categorias.png", "/assets/img/produtos/controle-financeiro-psicologos/checagens.png", "/assets/img/produtos/controle-financeiro-psicologos/despesas-como-preencher.png", "/assets/img/produtos/controle-financeiro-psicologos/despesas-lancamentos.png", "/assets/img/produtos/controle-financeiro-psicologos/instrucoes.png", "/assets/img/produtos/controle-financeiro-psicologos/painel-comparativo-semanas.png", "/assets/img/produtos/controle-financeiro-psicologos/painel-graficos.png", "/assets/img/produtos/controle-financeiro-psicologos/painel-indicadores.png", "/assets/img/produtos/controle-financeiro-psicologos/painel-top5.png", "/assets/img/produtos/controle-financeiro-psicologos/painel-visao-geral.png", "/assets/img/produtos/controle-financeiro-psicologos/receitas-como-preencher.png", "/assets/img/produtos/controle-financeiro-psicologos/receitas-lancamentos.png"];
const PRODUTO_PSICOLOGOS_ANTIGO = 'planilha-controle-financeiro-orcamentario-pessoal';

function produtoPsicologosDefinicao(): array {
  return json_decode(<<<'JSON'
{
 "tipo": "infoproduto",
 "titulo": "Planilha de Controle Financeiro para Psicólogos",
 "slug": "planilha-controle-financeiro-psicologos",
 "resumo": "Controle receitas, despesas e sessões do seu consultório em uma planilha com painel que se atualiza sozinho: indicadores do mês, comparativo de 3 meses, gráficos e checagens automáticas.",
 "seoDescricao": "Planilha de controle financeiro para psicólogos: receitas, despesas, ticket médio por sessão, painel com gráficos e checagens automáticas. Para consultório de psicologia.",
 "categoria": "Planilhas",
 "tags": "psicólogos, consultório, controle financeiro, planilha, fluxo de caixa",
 "autor": "CM Soluções Financeiras",
 "capa": "/assets/img/produtos/controle-financeiro-psicologos/capa.png",
 "capaAlt": "Planilha de Controle Financeiro para Psicólogos, com o painel do consultório em destaque",
 "precoLabel": "R$ 29,99",
 "gratuito": false,
 "linkCompra": "https://pay.hotmart.com/Q107277632H",
 "ctaRotulo": "Quero a planilha",
 "status": "publicado",
 "blocos": [
  {
   "t": "texto",
   "html": "<p>Se você atende como psicólogo(a) em consultório próprio, em sala alugada ou em uma clínica pequena, já deve ter vivido isto: o dinheiro entra por PIX, cartão, convênio e dinheiro vivo; as contas saem de lugares diferentes; e, no fim do mês, a pergunta continua sem resposta: <strong>quanto sobrou de verdade?</strong></p><p>A <strong>Planilha de Controle Financeiro para Psicólogos</strong> foi montada para responder isso sem complicação. Você registra o que entra e o que sai, e a planilha mostra, sozinha, <strong>quanto entrou, quanto saiu e quanto sobrou, por mês e por categoria</strong>. Segundo o guia que vem dentro do arquivo, depois que você pega o jeito o uso do dia a dia leva menos de 5 minutos por semana.</p>"
  },
  {
   "t": "lista",
   "titulo": "O que você recebe",
   "estilo": "check",
   "itens": [
    "6 abas prontas: Instruções, Despesas, Receitas, Categorias, Dashboard e Checagens",
    "Painel que se atualiza sozinho: indicadores do mês, comparativo de 3 meses, semana a semana, top 5 de despesas e de receitas e 4 gráficos",
    "22 categorias de despesa e 13 de receita já pensadas para a rotina de um consultório de psicologia (você pode editar e acrescentar)",
    "Listas suspensas e validações que evitam erro de digitação em datas, valores, categorias e status",
    "300 linhas prontas em Despesas e em Receitas, com tabela que cresce sozinha quando acabam",
    "Controle de sessões realizadas e de ticket médio por sessão",
    "Valores a receber e a pagar (pendentes e atrasados) separados do que já entrou e saiu",
    "14 checagens automáticas que avisam quando um lançamento ficou incompleto ou algum total não bate",
    "Guia rápido de uso dentro da própria planilha"
   ]
  },
  {
   "t": "imagem",
   "url": "/assets/img/produtos/controle-financeiro-psicologos/painel-visao-geral.png",
   "alt": "Aba Dashboard da planilha, com indicadores, comparativo de três meses, tabela semana a semana, top 5 e quatro gráficos",
   "legenda": "O painel do consultório: tudo o que você registra vira indicadores e gráficos (dados fictícios).",
   "largura": "normal",
   "w": 1640,
   "h": 825
  },
  {
   "t": "destaque",
   "variante": "info",
   "titulo": "Sobre as imagens desta página",
   "html": "<p>Nas imagens, a planilha aparece preenchida com <strong>dados fictícios</strong> (nomes, valores e datas inventados) apenas para mostrar o painel funcionando. O arquivo que você recebe vem em branco, pronto para você preencher. Clique em qualquer imagem para ampliar.</p>"
  },
  {
   "t": "lista",
   "titulo": "Para quem é",
   "estilo": "bullets",
   "itens": [
    "Psicólogos(as) autônomos(as) com consultório próprio ou sala alugada",
    "Quem atende particular e também por convênio ou plano de saúde",
    "Quem tem secretária, contador ou outros custos fixos e quer saber quanto sobra no fim do mês",
    "Quem, além das sessões, tem receitas de supervisão, palestras, cursos, avaliações psicológicas ou aluguel de sala a colegas"
   ]
  },
  {
   "t": "cta",
   "titulo": "Quer saber quanto sobra no seu consultório?",
   "texto": "Compre pelo Hotmart e comece a organizar as finanças ainda hoje.",
   "rotulo": "",
   "url": "",
   "preco": true
  },
  {
   "t": "texto",
   "html": "<h2>Como funciona, em 5 passos</h2><p>É a rotina que o próprio guia da planilha propõe. Você só mexe nas células de fundo azul-claro; todo o resto é calculado.</p>"
  },
  {
   "t": "passos",
   "itens": [
    {
     "titulo": "Confira as categorias",
     "html": "<p>Na aba <strong>Categorias</strong>, veja se as sugestões fazem sentido para o seu consultório. Ajuste ou acrescente o que faltar.</p>",
     "url": "",
     "alt": ""
    },
    {
     "titulo": "Registre as despesas",
     "html": "<p>Na aba <strong>Despesas</strong>, uma linha para cada pagamento: aluguel, luz, supervisão, maquininha…</p>",
     "url": "",
     "alt": ""
    },
    {
     "titulo": "Registre as receitas",
     "html": "<p>Na aba <strong>Receitas</strong>, uma linha para cada recebimento de paciente, convênio, palestra ou curso.</p>",
     "url": "",
     "alt": ""
    },
    {
     "titulo": "Leia o painel",
     "html": "<p>Na aba <strong>Dashboard</strong>, escolha o ano e o mês nas duas células amarelas e leia os indicadores. Nada mais precisa ser digitado ali.</p>",
     "url": "",
     "alt": ""
    },
    {
     "titulo": "Confira antes de fechar o mês",
     "html": "<p>Na aba <strong>Checagens</strong>, veja se algum lançamento ficou incompleto ou se algum total não está batendo.</p>",
     "url": "",
     "alt": ""
    }
   ]
  },
  {
   "t": "texto",
   "html": "<h2>Conheça cada aba por dentro</h2><p>Veja como é cada uma das seis abas e o que ela faz pelo seu controle financeiro.</p>"
  },
  {
   "t": "texto",
   "html": "<h3>1. Instruções: o guia rápido dentro da planilha</h3><p>A primeira aba funciona como um manual de bolso. Em uma página só, ela explica:</p><ul><li><strong>O que a planilha faz</strong> e <strong>por onde começar</strong> (os cinco passos acima);</li><li><strong>O que cada aba faz</strong>, uma por uma;</li><li><strong>A legenda de cores</strong>: azul-claro é o que você preenche, amarelo é a escolha que muda o painel (ano e mês), cinza é o que a planilha calcula sozinha, e número vermelho entre parênteses é valor negativo;</li><li><strong>As regras de ouro</strong>: registrar no mesmo dia (ou em um horário fixo por semana), não pular linhas, usar as listas suspensas, datas no formato dia/mês/ano, valores sempre positivos e com vírgula nos centavos;</li><li><strong>O que cada status significa</strong>: Pago e Recebido entram nos totais; Pendente e Atrasado aparecem em \"A pagar\" e \"A receber\"; Cancelado fica fora de tudo;</li><li><strong>O que fazer quando as linhas acabam</strong>.</li></ul>"
  },
  {
   "t": "imagem",
   "url": "/assets/img/produtos/controle-financeiro-psicologos/instrucoes.png",
   "alt": "Aba Instruções da planilha, com o guia rápido de uso",
   "legenda": "Aba Instruções: o passo a passo, a legenda de cores e as regras de ouro.",
   "largura": "normal",
   "w": 1640,
   "h": 1018
  },
  {
   "t": "texto",
   "html": "<h3>2. Categorias: as listas que alimentam a planilha</h3><p>É aqui que você adapta a planilha ao seu consultório. Tudo o que está nesta aba vira lista suspensa nas abas Despesas e Receitas.</p><ul><li><strong>22 categorias de despesa</strong>, cada uma marcada como <em>Fixa</em> (repete todo mês) ou <em>Variável</em> (muda de valor), com exemplos do que lançar: aluguel do consultório, condomínio e IPTU, energia, água, internet e telefonia, software e sistemas (prontuário eletrônico, agenda online), material de escritório, material de consumo e limpeza, manutenção, mobiliário e equipamentos, marketing, salários e encargos, serviços de terceiros, supervisão clínica, cursos e formação continuada, anuidade do CRP, impostos e taxas, taxas de maquininha, seguros, transporte, pró-labore e outras despesas;</li><li><strong>13 categorias de receita</strong>: sessão individual particular, sessão por convênio ou plano, terapia de casal, terapia familiar, atendimento infantil e de adolescentes, atendimento em grupo, avaliação psicológica e laudos, psicoterapia online, palestras e workshops, supervisão prestada, cursos e treinamentos ministrados, aluguel de sala a colegas e outras receitas;</li><li><strong>9 formas de pagamento e recebimento</strong>: dinheiro, PIX, cartão de débito, cartão de crédito, transferência bancária, boleto, convênio ou plano de saúde, débito automático e cheque;</li><li><strong>Os status</strong>: Pago, Pendente, Atrasado e Cancelado para despesas; Recebido, Pendente, Atrasado e Cancelado para receitas.</li></ul><p>Precisa de uma categoria nova? Escreva na primeira linha vazia dentro do bloco e ela passa a aparecer nas listas. A classificação em Fixa ou Variável é o que alimenta os indicadores de despesas fixas e variáveis no painel.</p>"
  },
  {
   "t": "destaque",
   "variante": "atencao",
   "titulo": "Um cuidado importante",
   "html": "<p>Não renomeie uma categoria que já foi usada nos lançamentos: o painel deixaria de somar aquele valor. Se precisar, crie uma categoria nova.</p>"
  },
  {
   "t": "imagem",
   "url": "/assets/img/produtos/controle-financeiro-psicologos/categorias.png",
   "alt": "Aba Categorias com as listas de despesas, receitas, formas de pagamento e status",
   "legenda": "Aba Categorias: despesas (Fixa ou Variável), receitas, formas de pagamento e status, todas editáveis.",
   "largura": "normal",
   "w": 1640,
   "h": 388
  },
  {
   "t": "texto",
   "html": "<h3>3. Despesas: tudo o que sai do caixa</h3><p>Uma linha para cada pagamento. As colunas são: <strong>Data</strong>, <strong>Categoria</strong>, <strong>Descrição</strong>, <strong>Fornecedor</strong>, <strong>Forma de pagamento</strong>, <strong>Valor (R$)</strong>, <strong>Status</strong>, <strong>Competência (ano-mês)</strong> e <strong>Observações</strong>.</p><ul><li>Categoria, forma de pagamento e status são <strong>listas suspensas</strong>: você escolhe, não digita;</li><li>A coluna de data só aceita data e a de valor só aceita número positivo, com um aviso na própria célula explicando o formato;</li><li>A <strong>Competência (ano-mês)</strong> é calculada sozinha a partir da data (por exemplo, 2026-07), para o painel agrupar tudo por mês;</li><li>O <strong>Status</strong> decide para onde o valor vai: <em>Pago</em> entra em \"Despesas pagas\"; <em>Pendente</em> e <em>Atrasado</em> entram em \"A pagar\"; <em>Cancelado</em> fica fora dos totais;</li><li>Em dúvida sobre a categoria? Deixe em branco e anote o motivo em <strong>Observações</strong>: a aba Checagens avisa que falta classificar.</li></ul><p>A aba já vem com 300 linhas prontas, e no topo tem um passo a passo de como preencher.</p>"
  },
  {
   "t": "imagem",
   "url": "/assets/img/produtos/controle-financeiro-psicologos/despesas-como-preencher.png",
   "alt": "Topo da aba Despesas, com o passo a passo de como preencher",
   "legenda": "No topo da aba Despesas, um passo a passo curto de como preencher.",
   "largura": "normal",
   "w": 1640,
   "h": 180
  },
  {
   "t": "imagem",
   "url": "/assets/img/produtos/controle-financeiro-psicologos/despesas-lancamentos.png",
   "alt": "Tabela de lançamentos da aba Despesas, com dados fictícios",
   "legenda": "Lançamentos de despesas (dados fictícios): categoria, fornecedor, forma de pagamento, valor, status e competência automática.",
   "largura": "normal",
   "w": 1640,
   "h": 377
  },
  {
   "t": "texto",
   "html": "<h3>4. Receitas: tudo o que entra no caixa</h3><p>Uma linha para cada recebimento. As colunas são: <strong>Data</strong>, <strong>Paciente / Cliente</strong>, <strong>Categoria</strong>, <strong>Forma de recebimento</strong>, <strong>Qtd de sessões</strong>, <strong>Valor (R$)</strong>, <strong>Status</strong>, <strong>Competência (ano-mês)</strong> e <strong>Observações</strong>.</p><ul><li><strong>Paciente / Cliente</strong>: use sempre o mesmo nome, as iniciais ou, se preferir preservar o sigilo, um código fixo (por exemplo, PAC-014);</li><li><strong>Qtd de sessões</strong>: quantas sessões aquele recebimento cobre. Use 1 para sessão avulsa e 4 para um pacote mensal de quatro sessões; se não for atendimento (uma palestra, por exemplo), deixe 1. É isso que permite calcular o ticket médio por sessão;</li><li><strong>Data</strong>: o dia em que o dinheiro entrou (ou a data prevista, se o status for Pendente);</li><li><strong>Status</strong>: <em>Recebido</em> é dinheiro na conta; <em>Pendente</em> ainda vai receber; <em>Atrasado</em> é paciente que não pagou no prazo; <em>Cancelado</em> é sessão desmarcada e não cobrada.</li></ul><p>Assim como em Despesas, são 300 linhas prontas, listas suspensas, validações e competência automática.</p>"
  },
  {
   "t": "imagem",
   "url": "/assets/img/produtos/controle-financeiro-psicologos/receitas-como-preencher.png",
   "alt": "Topo da aba Receitas, com o passo a passo de como preencher",
   "legenda": "No topo da aba Receitas, o passo a passo de como preencher.",
   "largura": "normal",
   "w": 1640,
   "h": 190
  },
  {
   "t": "imagem",
   "url": "/assets/img/produtos/controle-financeiro-psicologos/receitas-lancamentos.png",
   "alt": "Tabela de lançamentos da aba Receitas, com dados fictícios",
   "legenda": "Lançamentos de receitas (dados fictícios): paciente por iniciais, categoria, forma de recebimento, quantidade de sessões e status.",
   "largura": "normal",
   "w": 1640,
   "h": 395
  },
  {
   "t": "destaque",
   "variante": "dica",
   "titulo": "Sigilo dos pacientes",
   "html": "<p>Você não precisa colocar o nome completo de ninguém. A planilha só precisa que o identificador seja sempre o mesmo para o mesmo paciente: pode ser as iniciais ou um código. Os lançamentos ficam no seu arquivo; a CM não recebe nem acessa o que você preenche.</p>"
  },
  {
   "t": "texto",
   "html": "<h3>5. Dashboard: o painel do seu consultório</h3><p>É a aba que você abre para decidir. Duas células amarelas controlam tudo: o <strong>Ano</strong> e o <strong>Mês de referência</strong>. O painel olha para o mês escolhido, para o mês anterior e para os <strong>3 meses que terminam nele</strong>. Trocou o mês, o painel inteiro se atualiza, sem digitar mais nada. Os lançamentos continuam guardados nas abas Despesas e Receitas.</p><h4>Indicadores</h4><p>Cada indicador aparece para o mês selecionado, para o mês anterior, com a variação entre eles (em vermelho e entre parênteses quando o valor é negativo) e com o total dos 3 meses:</p><ul><li><strong>Receitas recebidas</strong>: tudo o que está como Recebido no período;</li><li><strong>Despesas pagas</strong>: tudo o que está como Pago;</li><li><strong>Resultado (sobra ou falta)</strong>: receitas recebidas menos despesas pagas;</li><li><strong>Margem sobre a receita</strong>: quanto de cada real recebido sobra depois das despesas;</li><li><strong>Sessões realizadas</strong> e <strong>Ticket médio por sessão</strong>: quantas sessões foram feitas e quanto cada uma rende em média;</li><li><strong>Despesas fixas</strong> e <strong>Despesas variáveis</strong>: separadas conforme o tipo de cada categoria;</li><li><strong>A receber</strong> e <strong>A pagar</strong>: o que está pendente ou atrasado, para você enxergar o dinheiro que ainda vai entrar e as contas que ainda vão sair.</li></ul>"
  },
  {
   "t": "imagem",
   "url": "/assets/img/produtos/controle-financeiro-psicologos/painel-indicadores.png",
   "alt": "Seletores de ano e mês e tabela de indicadores do Dashboard",
   "legenda": "Seletores de ano e mês e os indicadores do mês, do mês anterior e dos 3 meses (dados fictícios).",
   "largura": "normal",
   "w": 1640,
   "h": 643
  },
  {
   "t": "texto",
   "html": "<h4>Comparativo de 3 meses e semana a semana</h4><p>O <strong>comparativo dos últimos 3 meses</strong> mostra receitas, despesas, resultado e margem de cada mês, com o total. Logo abaixo, a tabela <strong>semana a semana</strong> quebra o mês selecionado em até cinco semanas (receitas, despesas, resultado e sessões), com barras de intensidade para você ver de relance em que semana o caixa entrou ou saiu mais.</p>"
  },
  {
   "t": "imagem",
   "url": "/assets/img/produtos/controle-financeiro-psicologos/painel-comparativo-semanas.png",
   "alt": "Tabelas de comparativo dos últimos três meses e de semana a semana",
   "legenda": "Comparativo dos últimos 3 meses e movimento semana a semana dentro do mês escolhido.",
   "largura": "normal",
   "w": 1640,
   "h": 487
  },
  {
   "t": "texto",
   "html": "<h4>Top 5 de despesas e de receitas</h4><p>Para onde está indo o dinheiro e de onde ele vem: as <strong>cinco maiores categorias de despesa</strong> e as <strong>cinco maiores categorias de receita</strong> dos 3 meses, com o valor e o percentual do total, e uma linha de \"demais categorias\" para fechar a conta.</p>"
  },
  {
   "t": "imagem",
   "url": "/assets/img/produtos/controle-financeiro-psicologos/painel-top5.png",
   "alt": "Tabelas com as cinco maiores categorias de despesa e de receita",
   "legenda": "Top 5 categorias de despesa e de receita (dados fictícios).",
   "largura": "normal",
   "w": 1200,
   "h": 611
  },
  {
   "t": "texto",
   "html": "<h4>Quatro gráficos</h4><ul><li><strong>Receitas x Despesas</strong>: colunas lado a lado, mês a mês;</li><li><strong>Semana a semana</strong>: linhas de receitas e despesas dentro do mês selecionado;</li><li><strong>Para onde foi o dinheiro</strong>: rosca com as principais categorias de despesa;</li><li><strong>De onde veio a receita</strong>: barras com as principais categorias de receita.</li></ul><p>Os cálculos por categoria ficam em uma área de apoio, recolhida no fim da aba. Você não precisa abrir.</p>"
  },
  {
   "t": "imagem",
   "url": "/assets/img/produtos/controle-financeiro-psicologos/painel-graficos.png",
   "alt": "Quatro gráficos do Dashboard: receitas e despesas, semana a semana, rosca de despesas e barras de receitas",
   "legenda": "Os quatro gráficos do painel (dados fictícios).",
   "largura": "normal",
   "w": 1640,
   "h": 893
  },
  {
   "t": "texto",
   "html": "<h3>6. Checagens: a planilha confere o seu trabalho</h3><p>Planilha cheia de lançamento esquecido gera número errado. Por isso a última aba faz <strong>14 verificações automáticas</strong> e mostra <em>OK</em> em verde ou <em>ALERTA</em> em vermelho, com a explicação de como corrigir. Quando você corrige o lançamento, o status volta a OK sozinho. Ela confere, por exemplo:</p><ul><li>despesas e receitas com valor lançado, mas sem data, sem categoria ou sem status (que ficariam fora do painel);</li><li>categoria digitada fora da lista, que o painel contaria como outra categoria;</li><li>valores negativos lançados por engano;</li><li>receita recebida com zero sessões, que distorceria o ticket médio;</li><li>lançamentos com data posterior ao ano escolhido no painel;</li><li>se os totais do painel batem entre si: despesas e receitas do mês iguais à soma por categoria, resultado igual a receitas menos despesas, e total dos 3 meses igual à soma dos meses.</li></ul><p>A dica é abrir esta aba antes de fechar o mês.</p>"
  },
  {
   "t": "imagem",
   "url": "/assets/img/produtos/controle-financeiro-psicologos/checagens.png",
   "alt": "Aba Checagens com as 14 verificações automáticas e o status OK em verde",
   "legenda": "Aba Checagens: as verificações automáticas, o resultado e a explicação de cada uma.",
   "largura": "normal",
   "w": 1640,
   "h": 584
  },
  {
   "t": "faq",
   "titulo": "Perguntas frequentes",
   "itens": [
    {
     "p": "Preciso saber Excel para usar?",
     "r": "<p>Não. Você preenche as células de fundo azul-claro e escolhe o ano e o mês no painel. Tudo o que é calculado fica em cinza, e a aba Instruções explica o passo a passo.</p>"
    },
    {
     "p": "O que acontece com os dados antigos quando troco o mês do painel?",
     "r": "<p>Nada se perde. Todos os lançamentos ficam nas abas Despesas e Receitas; trocar o ano ou o mês só muda o que o painel mostra.</p>"
    },
    {
     "p": "E se eu precisar de mais linhas ou de outras categorias?",
     "r": "<p>Cada aba de lançamentos já vem com 300 linhas e, ao chegar na última, a tabela cresce sozinha (basta pressionar TAB na célula final), levando as fórmulas e as listas junto. Categorias novas você cadastra na aba Categorias.</p>"
    },
    {
     "p": "Em quais programas funciona?",
     "r": "<p>O arquivo é uma planilha .xlsx, feita para o Excel. Os cálculos também foram conferidos no LibreOffice, que é gratuito. No Google Planilhas ainda não garantimos todos os recursos, como a tabela que cresce sozinha com a tecla TAB.</p>"
    },
    {
     "p": "Serve para uma clínica com vários profissionais?",
     "r": "<p>Ela foi pensada para o consultório do(a) psicólogo(a), com secretária e outros custos se houver. A planilha não separa o resultado por profissional. Se a sua clínica precisa disso, fale com a CM.</p>"
    },
    {
     "p": "Como eu recebo a planilha?",
     "r": "<p>A compra é feita no Hotmart, uma plataforma de pagamento externa. Você recebe o acesso ao arquivo pelo próprio Hotmart, depois da confirmação do pagamento.</p>"
    },
    {
     "p": "Tenho uma dúvida sobre as fórmulas ou o painel. Com quem falo?",
     "r": "<p>A planilha foi desenvolvida pela CM Soluções Financeiras, que também cuida da manutenção e das atualizações. Dúvidas sobre o funcionamento das fórmulas, do painel e da aba Checagens podem ser tiradas com a CM pelo WhatsApp ou pelo Instagram @cm.financeiro.</p>"
    }
   ]
  },
  {
   "t": "cta",
   "titulo": "Pronto para saber quanto sobra no seu consultório?",
   "texto": "Compre pelo Hotmart, em ambiente seguro, e comece a organizar receitas e despesas ainda hoje.",
   "rotulo": "",
   "url": "",
   "preco": true
  },
  {
   "t": "destaque",
   "variante": "info",
   "titulo": "Quem desenvolveu",
   "html": "<p>Planilha criada pela <strong>CM Soluções Financeiras</strong>: estruturação das abas, fórmulas, validações e indicadores.</p>"
  }
 ]
}
JSON
  , true);
}

/** Devolve true se concluiu (ou se já estava concluído). Qualquer falha é engolida: nunca pode derrubar a API. */
function produtoPsicologosAplicar(PDO $db): void {
  try {
    foreach (PRODUTO_PSICOLOGOS_ARQUIVOS as $f) { // as imagens sobem junto com o deploy: espera elas chegarem
      if (!is_file(dirname(__DIR__) . $f)) return;
    }
    require_once __DIR__ . '/blog_lib.php';
    blogMigrar($db);
    $def = produtoPsicologosDefinicao();
    $stmt = $db->prepare('SELECT id FROM posts WHERE slug = ? LIMIT 1');
    $stmt->execute([$def['slug']]);
    if (!$stmt->fetchColumn()) blogSalvar($db, $def);

    // remove o infoproduto cadastrado antes (a cópia de segurança está em db/backup/)
    $db->prepare('DELETE FROM infoprodutos WHERE id = ?')->execute([PRODUTO_PSICOLOGOS_ANTIGO]);

    $db->prepare('INSERT INTO migracoes (nome, aplicada_em) VALUES (?, ?)')->execute(['produto-psicologos-v1', nowIso()]);
  } catch (Throwable $e) {
    // sem alarde: tenta de novo na próxima chamada
  }
}
