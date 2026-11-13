<?php
/**
 * Semente (uma única vez): página de venda da "Planilha de Precificação para Psicólogos".
 * Aplicada por api/index.php (garantirPostsIniciais) quando as imagens listadas já chegaram do deploy.
 * Depois de criada, é editada normalmente no painel; se for apagada lá, não volta.
 */
return [
  'arquivos' => ["/assets/img/produtos/precificacao-psicologos/capa.png", "/assets/img/produtos/precificacao-psicologos/checagens.png", "/assets/img/produtos/precificacao-psicologos/custos-fixos.png", "/assets/img/produtos/precificacao-psicologos/documentacao-formulas.png", "/assets/img/produtos/precificacao-psicologos/documentacao-uso.png", "/assets/img/produtos/precificacao-psicologos/entradas.png", "/assets/img/produtos/precificacao-psicologos/memoria-de-calculo.png", "/assets/img/produtos/precificacao-psicologos/preco-sugerido.png", "/assets/img/produtos/precificacao-psicologos/resultado-mensal.png", "/assets/img/produtos/precificacao-psicologos/visao-geral.png"],
  'post' => json_decode(<<<'JSON'
{
 "tipo": "infoproduto",
 "titulo": "Planilha de Precificação para Psicólogos",
 "slug": "planilha-precificacao-psicologos",
 "resumo": "Descubra o preço justo da sua sessão a partir dos custos reais do consultório, da retirada que você quer ter e da sua agenda. Inclui pacote mensal, valor por hora, lucro projetado e ponto de equilíbrio.",
 "seoDescricao": "Precificação para psicólogos: calcule o valor da sessão com custos, pró-labore, impostos e margem. Pacote mensal, valor por hora e ponto de equilíbrio.",
 "categoria": "Planilhas",
 "tags": "psicólogos, precificação, valor da sessão, consultório, planilha, pró-labore",
 "autor": "CM Soluções Financeiras",
 "capa": "/assets/img/produtos/precificacao-psicologos/capa.png",
 "capaAlt": "Planilha de Precificação para Psicólogos, com a aba de cálculo do preço da sessão em destaque",
 "precoLabel": "",
 "gratuito": false,
 "linkCompra": "https://pay.hotmart.com/G107631232H",
 "ctaRotulo": "Quero a planilha",
 "status": "publicado",
 "blocos": [
  {
   "t": "texto",
   "html": "<p>Quanto cobrar pela sessão? Muita gente define o preço olhando o que os colegas cobram, mas isso não garante que o consultório se sustente, pague a retirada de que você precisa e ainda deixe uma sobra para férias, imprevistos e crescimento.</p><p>A <strong>Planilha de Precificação para Psicólogos</strong> faz o caminho inverso: parte dos <strong>seus custos reais</strong>, da <strong>retirada mensal que você deseja</strong> e de <strong>quantas sessões cabem na sua agenda</strong>, e calcula o <strong>preço sugerido por sessão</strong>, já com impostos, taxas de pagamento e margem de lucro embutidos. Mexeu em um número, o preço se recalcula na hora.</p>"
  },
  {
   "t": "lista",
   "titulo": "O que você recebe",
   "estilo": "check",
   "itens": [
    "4 abas: Precificação, Custos_Fixos, Checagens e Documentação",
    "Preço sugerido por sessão, calculado pelo método do markup divisor (impostos, taxas e margem já embutidos no preço)",
    "Capacidade da agenda: quantas sessões você realmente atende por mês, considerando semanas e taxa de ocupação",
    "Lista de 18 itens típicos de custo fixo de consultório, com total automático",
    "Pró-labore (sua retirada) e custo variável por sessão entrando no cálculo",
    "Pacote mensal de 4 sessões, com desconto que você configura",
    "Valor por hora de trabalho",
    "Resultado mensal projetado: faturamento, impostos e taxas, custos, pró-labore e lucro",
    "Margem líquida real e ponto de equilíbrio (quantas sessões por mês para cobrir custos e retirada)",
    "12 checagens automáticas de integridade, que avisam se algo não bate",
    "Fórmulas protegidas contra apagamento por engano e documentação completa dentro do arquivo"
   ]
  },
  {
   "t": "imagem",
   "url": "/assets/img/produtos/precificacao-psicologos/visao-geral.png",
   "alt": "Aba Precificação da planilha, com os blocos de entrada, a memória de cálculo, o resultado mensal e o painel com o preço sugerido por sessão",
   "legenda": "A aba Precificação: você preenche as células azuis e o preço sugerido aparece em destaque (números de exemplo que acompanham a planilha).",
   "largura": "normal",
   "w": 1640,
   "h": 946
  },
  {
   "t": "destaque",
   "variante": "info",
   "titulo": "Sobre as imagens desta página",
   "html": "<p>As imagens mostram a planilha com os <strong>números de exemplo que já vêm no arquivo</strong> (por exemplo, 20 sessões por semana, retirada de R$ 6.000 e custos fixos de R$ 2.330). Você substitui tudo pelos seus dados e o preço se recalcula na hora. Clique em qualquer imagem para ampliar.</p>"
  },
  {
   "t": "lista",
   "titulo": "Para quem é",
   "estilo": "bullets",
   "itens": [
    "Psicólogos(as) com consultório próprio, sala compartilhada ou atendimento online",
    "Profissionais autônomos(as) ou com CNPJ de pequeno porte",
    "Quem vai definir o valor da primeira sessão, ou quer reajustar o valor atual com base em números",
    "Quem quer saber quantas sessões precisa fazer por mês para pagar os custos e a própria retirada"
   ]
  },
  {
   "t": "cta",
   "titulo": "Quer descobrir o preço justo da sua sessão?",
   "texto": "Compre pelo Hotmart e faça a conta ainda hoje.",
   "rotulo": "",
   "url": "",
   "preco": true
  },
  {
   "t": "texto",
   "html": "<h2>Como funciona, em 5 passos</h2><p>É o caminho que a própria planilha propõe. Você só preenche as células azuis; todo o resto é fórmula.</p>"
  },
  {
   "t": "passos",
   "itens": [
    {
     "titulo": "Lance os custos fixos",
     "html": "<p>Na aba <strong>Custos_Fixos</strong>, informe os valores mensais dos itens que você tem. O que não se aplica pode ficar vazio.</p>",
     "url": "",
     "alt": ""
    },
    {
     "titulo": "Informe a sua agenda",
     "html": "<p>Na aba <strong>Precificação</strong>, bloco 1: sessões por semana, semanas por mês, taxa de ocupação da agenda e duração da sessão.</p>",
     "url": "",
     "alt": ""
    },
    {
     "titulo": "Defina a sua retirada",
     "html": "<p>No bloco 2, o pró-labore que você deseja retirar por mês e o custo variável por sessão.</p>",
     "url": "",
     "alt": ""
    },
    {
     "titulo": "Ajuste os percentuais",
     "html": "<p>No bloco 3, os impostos, a taxa de meios de pagamento e a margem de lucro desejada.</p>",
     "url": "",
     "alt": ""
    },
    {
     "titulo": "Leia o preço e confira as Checagens",
     "html": "<p>O preço sugerido aparece no painel em destaque. Depois, abra a aba <strong>Checagens</strong>: se houver ALERTA, revise o item apontado antes de usar o preço.</p>",
     "url": "",
     "alt": ""
    }
   ]
  },
  {
   "t": "texto",
   "html": "<h2>Como o preço é calculado</h2><p>Imposto, taxa da maquininha e margem de lucro são <strong>percentuais do preço final</strong>. Por isso a planilha usa o <strong>markup divisor</strong>: ela soma o que cada sessão custa e divide o resultado por (1 menos esses percentuais), para que impostos, taxas e margem já fiquem dentro do preço.</p>"
  },
  {
   "t": "formula",
   "rotulo": "Preço sugerido por sessão",
   "codigo": "Preço = (custo fixo por sessão + pró-labore por sessão + custo variável por sessão)\n        ÷ (1 − impostos − taxa de pagamento − margem de lucro)"
  },
  {
   "t": "texto",
   "html": "<p>No exemplo que acompanha a planilha:</p><ul><li>os <strong>custos fixos</strong> de R$ 2.330 divididos por 73,1 sessões atendidas no mês dão R$ 31,87 por sessão;</li><li>a <strong>retirada</strong> de R$ 6.000 dá R$ 82,08 por sessão;</li><li>somados R$ 3,00 de custo variável, a <strong>base de custo</strong> é de R$ 116,95 por sessão;</li><li>com 6% de impostos, 3% de taxas de pagamento e 15% de margem, o <strong>divisor</strong> é 76%;</li><li>resultado: <strong>R$ 153,89 por sessão</strong>.</li></ul>"
  },
  {
   "t": "texto",
   "html": "<h2>Conheça cada aba por dentro</h2>"
  },
  {
   "t": "texto",
   "html": "<h3>1. Precificação: onde tudo acontece</h3><p>É a aba principal, organizada em cinco blocos numerados. As células de fundo azul são as suas; o resto é calculado.</p><h4>Bloco 1: capacidade de atendimento</h4><ul><li><strong>Sessões por semana que você consegue atender</strong>: a capacidade máxima da sua agenda;</li><li><strong>Semanas por mês</strong>: o padrão de mercado é 4,3;</li><li><strong>Taxa de ocupação da agenda</strong>: quanto da agenda fica realmente preenchida;</li><li><strong>Duração da sessão (minutos)</strong>: usada para calcular o valor por hora.</li></ul><p>Com isso a planilha calcula as <strong>sessões atendidas por mês</strong> (sessões por semana × semanas por mês × taxa de ocupação). No exemplo, 20 × 4,3 × 85% = 73,1 sessões.</p><h4>Bloco 2: custos e retirada mensal</h4><ul><li><strong>Custos fixos mensais</strong>: vêm sozinhos da aba Custos_Fixos (aparecem em verde, porque vêm de outra aba);</li><li><strong>Pró-labore desejado</strong>: quanto você quer receber por mês;</li><li><strong>Custo variável por sessão</strong>: água, café, material impresso, testes.</li></ul><h4>Bloco 3: percentuais sobre o preço</h4><ul><li><strong>Impostos sobre o faturamento</strong> (confirme a alíquota com o seu contador);</li><li><strong>Taxa de meios de pagamento</strong>: cartão, Pix pago, maquininha;</li><li><strong>Margem de lucro desejada</strong>: a reserva para férias, imprevistos e crescimento.</li></ul><p>A planilha mostra a <strong>soma dos percentuais</strong> e avisa que ela precisa ser menor que 100%: acima disso, o preço seria impossível de calcular.</p>"
  },
  {
   "t": "imagem",
   "url": "/assets/img/produtos/precificacao-psicologos/entradas.png",
   "alt": "Blocos 1 a 3 da aba Precificação: capacidade de atendimento, custos e retirada mensal e percentuais sobre o preço",
   "legenda": "Blocos 1, 2 e 3: as células azuis são as que você preenche.",
   "largura": "normal",
   "w": 1640,
   "h": 711
  },
  {
   "t": "texto",
   "html": "<h4>Painel do preço sugerido</h4><p>À direita, o <strong>preço sugerido por sessão</strong> aparece em destaque, com a duração da sessão. Logo abaixo, os números que ajudam a decidir:</p><ul><li><strong>Desconto no pacote mensal</strong> (você escolhe; no exemplo, 5%) e o <strong>valor do pacote mensal de 4 sessões</strong>;</li><li><strong>Valor por hora de trabalho</strong>: o preço da sessão convertido em valor hora, pela duração informada;</li><li><strong>Lucro mensal projetado</strong> e <strong>margem líquida real</strong>;</li><li><strong>Ponto de equilíbrio</strong>: o número mínimo de sessões no mês para cobrir custos e pró-labore.</li></ul><p>Uma pequena legenda de cores lembra: azul é o que você preenche, preto é cálculo da própria aba, verde vem de outra aba e dourado é resultado em destaque.</p>"
  },
  {
   "t": "imagem",
   "url": "/assets/img/produtos/precificacao-psicologos/preco-sugerido.png",
   "alt": "Painel com o preço sugerido por sessão, pacote mensal, valor por hora, lucro mensal projetado, margem líquida real, ponto de equilíbrio e a legenda das cores",
   "legenda": "O painel do preço sugerido e os indicadores de apoio (números de exemplo).",
   "largura": "normal",
   "w": 1000,
   "h": 802
  },
  {
   "t": "texto",
   "html": "<h4>Bloco 4: memória de cálculo</h4><p>Nada de caixa-preta. A planilha mostra cada etapa do cálculo, linha por linha: custo fixo por sessão, pró-labore por sessão, custo variável por sessão, a <strong>base de custo por sessão</strong>, o <strong>divisor de markup</strong> e, por fim, o <strong>preço sugerido</strong>. Ao lado de cada linha há uma explicação curta de como o número foi obtido.</p>"
  },
  {
   "t": "imagem",
   "url": "/assets/img/produtos/precificacao-psicologos/memoria-de-calculo.png",
   "alt": "Bloco 4 da aba Precificação, com a memória de cálculo do preço sugerido",
   "legenda": "Bloco 4: a memória de cálculo, do custo por sessão até o preço sugerido.",
   "largura": "normal",
   "w": 1640,
   "h": 270
  },
  {
   "t": "texto",
   "html": "<h4>Bloco 5: resultado mensal projetado</h4><p>Com o preço sugerido na mão, a planilha projeta o mês: <strong>faturamento</strong> (preço × sessões), menos <strong>impostos e taxas de pagamento</strong>, menos <strong>custos fixos</strong>, menos <strong>custos variáveis</strong>, menos o <strong>pró-labore</strong>. O que sobra é o <strong>lucro mensal</strong>, e a <strong>margem líquida real</strong> mostra quanto isso representa do faturamento, para você comparar com a margem que desejava. A linha do <strong>ponto de equilíbrio</strong> fecha o bloco.</p>"
  },
  {
   "t": "imagem",
   "url": "/assets/img/produtos/precificacao-psicologos/resultado-mensal.png",
   "alt": "Bloco 5 da aba Precificação, com o resultado mensal projetado",
   "legenda": "Bloco 5: do faturamento ao lucro do mês, com margem líquida e ponto de equilíbrio.",
   "largura": "normal",
   "w": 1640,
   "h": 341
  },
  {
   "t": "texto",
   "html": "<h3>2. Custos_Fixos: tudo o que o consultório custa por mês</h3><p>Uma lista pronta com <strong>18 itens típicos de custo fixo de consultório</strong>: aluguel da sala, condomínio e IPTU, energia, água, internet e telefone, limpeza e conservação, contador, software de agenda e prontuário eletrônico, plataforma de videochamada (atendimento online), anuidade do CRP, supervisão clínica, formação continuada e cursos, marketing e divulgação, seguro e taxas bancárias fixas, material de escritório e testes psicológicos, secretária ou recepção, depreciação de móveis e equipamentos e outros custos fixos.</p><ul><li>Você preenche só a coluna <strong>Valor (R$)</strong>. Itens que você não tem podem ficar vazios;</li><li>Há uma coluna de <strong>Observação</strong> com dicas, como dividir a anuidade do CRP por 12 (uma anuidade de R$ 600 por ano equivale a R$ 50 por mês) ou dividir o valor de um bem pela vida útil em meses, no caso da depreciação;</li><li>O <strong>total de custos fixos mensais</strong> é calculado sozinho e alimenta a aba Precificação.</li></ul>"
  },
  {
   "t": "imagem",
   "url": "/assets/img/produtos/precificacao-psicologos/custos-fixos.png",
   "alt": "Aba Custos_Fixos com a lista de 18 itens de custo fixo mensal e o total",
   "legenda": "Aba Custos_Fixos: os 18 itens e o total que alimenta a Precificação (valores de exemplo).",
   "largura": "normal",
   "w": 1640,
   "h": 590
  },
  {
   "t": "texto",
   "html": "<h3>3. Checagens: a planilha confere a si mesma</h3><p>Preço errado custa caro. Por isso a terceira aba faz <strong>12 validações cruzadas</strong>, todas por fórmula, e mostra <em>OK</em> em verde ou <em>ALERTA</em> em vermelho, com uma explicação do motivo. Entre elas:</p><ul><li>se o total de custos fixos bate com a soma dos itens;</li><li>se a soma dos percentuais é menor que 100%;</li><li>se as sessões por mês são maiores que zero;</li><li>se a base de custo por sessão fecha com os três componentes;</li><li>se o preço por sessão cobre o custo (preço abaixo do custo significa prejuízo em cada atendimento);</li><li>se faturamento e lucro mensal conferem com as contas da projeção;</li><li>se a margem real é igual ou maior que a margem desejada;</li><li>se o ponto de equilíbrio cabe na capacidade da agenda (se não cabe, o preço está baixo);</li><li>se nenhum custo foi lançado como negativo, se os campos obrigatórios estão preenchidos e se a taxa de ocupação está entre 1% e 100%.</li></ul><p>Se alguma linha ficar em ALERTA, a orientação é revisar o item antes de usar o preço.</p>"
  },
  {
   "t": "imagem",
   "url": "/assets/img/produtos/precificacao-psicologos/checagens.png",
   "alt": "Aba Checagens com as 12 validações de integridade e o status OK em verde",
   "legenda": "Aba Checagens: a fórmula usada, o esperado, o resultado, o status e o porquê de cada validação.",
   "largura": "normal",
   "w": 1640,
   "h": 268
  },
  {
   "t": "texto",
   "html": "<h3>4. Documentação: o manual dentro do arquivo</h3><p>A última aba é um manual completo da planilha. Ela explica para que serve e para quem é, o método de cálculo, o que cada aba faz, o passo a passo de uso, todas as capacidades da planilha, as <strong>fórmulas principais</strong> (com a célula onde cada uma está), o código de cores e as limitações.</p>"
  },
  {
   "t": "imagem",
   "url": "/assets/img/produtos/precificacao-psicologos/documentacao-uso.png",
   "alt": "Aba Documentação com o objetivo, as abas, os 5 passos e as capacidades da planilha",
   "legenda": "Aba Documentação: para que serve, as abas, os 5 passos e as capacidades.",
   "largura": "normal",
   "w": 1640,
   "h": 833
  },
  {
   "t": "imagem",
   "url": "/assets/img/produtos/precificacao-psicologos/documentacao-formulas.png",
   "alt": "Aba Documentação com as fórmulas principais, o código de cores e as limitações",
   "legenda": "Fórmulas principais, código de cores e limitações, documentados na própria planilha.",
   "largura": "normal",
   "w": 1640,
   "h": 431
  },
  {
   "t": "destaque",
   "variante": "dica",
   "titulo": "Fórmulas protegidas, sem senha",
   "html": "<p>Para evitar que uma fórmula seja apagada por engano (e o preço saia errado), a planilha vem protegida: só as células azuis podem ser editadas. A proteção não tem senha, de propósito: se você precisar liberar, é só usar a guia Revisão, botão Desproteger Planilha.</p>"
  },
  {
   "t": "destaque",
   "variante": "atencao",
   "titulo": "O que a planilha não faz",
   "html": "<p>Os percentuais de imposto são preenchidos por você: confirme a alíquota do seu regime com o contador. A planilha não substitui contabilidade, apuração de impostos nem controle de fluxo de caixa. Os números de exemplo servem só para demonstração: substitua todos pelos seus dados.</p>"
  },
  {
   "t": "faq",
   "titulo": "Perguntas frequentes",
   "itens": [
    {
     "p": "Preciso saber Excel para usar?",
     "r": "<p>Não. Você preenche só as células azuis (os custos e alguns números da sua agenda) e o preço aparece sozinho. A aba Documentação traz o passo a passo.</p>"
    },
    {
     "p": "A planilha já vem com números?",
     "r": "<p>Sim, vem com valores de exemplo nas células azuis, apenas para demonstração. É só substituir pelos seus dados.</p>"
    },
    {
     "p": "E se eu não tiver algum dos custos da lista?",
     "r": "<p>Deixe em branco: os itens que você não tem podem ficar vazios, e o total considera só o que você preencher.</p>"
    },
    {
     "p": "Serve para atendimento online?",
     "r": "<p>Serve. A planilha foi pensada para consultório próprio, sala compartilhada ou atendimento online, e a lista de custos inclui a plataforma de videochamada.</p>"
    },
    {
     "p": "A planilha calcula os meus impostos?",
     "r": "<p>Não. Você informa o percentual de impostos que incide sobre o seu faturamento (confirme a alíquota com o seu contador) e a planilha o embute no preço. Ela não faz apuração de impostos.</p>"
    },
    {
     "p": "Em quais programas funciona?",
     "r": "<p>O arquivo é uma planilha .xlsx, feita para o Excel. Os cálculos também foram conferidos no LibreOffice, que é gratuito. No Google Planilhas ainda não garantimos todos os recursos.</p>"
    },
    {
     "p": "Como eu recebo a planilha?",
     "r": "<p>A compra é feita no Hotmart, uma plataforma de pagamento externa. Você recebe o acesso ao arquivo pelo próprio Hotmart, depois da confirmação do pagamento.</p>"
    },
    {
     "p": "Tenho uma dúvida sobre as fórmulas. Com quem falo?",
     "r": "<p>A planilha foi criada pela CM Soluções Financeiras. Dúvidas sobre o funcionamento das fórmulas e do cálculo podem ser tiradas com a CM pelo WhatsApp ou pelo Instagram @cm.financeiro.</p>"
    }
   ]
  },
  {
   "t": "cta",
   "titulo": "Pronto para precificar a sua sessão com números?",
   "texto": "Compre pelo Hotmart, em ambiente seguro, e descubra quanto cobrar para o seu consultório se sustentar.",
   "rotulo": "",
   "url": "",
   "preco": true
  },
  {
   "t": "destaque",
   "variante": "info",
   "titulo": "Quem desenvolveu",
   "html": "<p>Planilha criada pela <strong>CM Soluções Financeiras</strong>: estruturação das abas, fórmulas, validações e checagens.</p>"
  }
 ]
}
JSON
  , true),
];
