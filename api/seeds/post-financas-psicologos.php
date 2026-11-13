<?php
/**
 * Semente (uma única vez): publica o post "Finanças para psicólogos: como organizar consultório, convênio e particular".
 * Aplicada por api/index.php (garantirPostsIniciais). Depois de criado, o post é editado normalmente no painel;
 * se for apagado lá, ele não volta (o marcador "seed:<nome do arquivo>" fica na tabela "migracoes").
 */
return [
  'arquivos' => [],
  'post' => json_decode(<<<'JSON'
{
 "tipo": "blog",
 "titulo": "Finanças para psicólogos: como organizar consultório, convênio e particular",
 "slug": "financas-para-psicologos-como-organizar-consultorio-convenio-e-particular",
 "resumo": "Contas separadas, controle de particular e convênio, valor da sessão calculado pelos custos, impostos em dia e as mudanças de 2027: o passo a passo para organizar as finanças do consultório.",
 "seoDescricao": "Guia para psicólogos: separar as contas, controlar particular e convênio, calcular o valor da sessão, Receita Saúde, carnê-leão e a Reforma Tributária de 2027.",
 "categoria": "Gestão",
 "tags": "psicólogos, consultório, convênio, particular, Receita Saúde, carnê-leão, Reforma Tributária",
 "autor": "",
 "status": "publicado",
 "blocos": [
  {
   "t": "texto",
   "html": "<p>A formação em Psicologia prepara o profissional para a prática clínica, mas raramente aborda a gestão financeira do consultório. O resultado é um cenário comum: agenda cheia, rotina intensa e pouca clareza sobre quanto o consultório realmente gera de resultado.</p><p>O desafio é que o dinheiro do consultório chega por caminhos diferentes. Pacientes particulares pagam por sessão ou por mês, convênios repassam valores com semanas de atraso e, às vezes, com descontos. Somam-se a isso custos fixos, obrigações fiscais e, a partir de 2027, as mudanças da Reforma Tributária.</p><p>Neste post, apresentamos um guia prático para organizar as finanças do consultório: como separar as contas, como controlar particular e convênio, como calcular o valor da sessão, quais são as obrigações fiscais e qual rotina adotar.</p><h2>Resumo rápido</h2>"
  },
  {
   "t": "tabela",
   "cab": true,
   "linhas": [
    [
     "Tema",
     "Principal cuidado",
     "Impacto para o consultório"
    ],
    [
     "Contas",
     "Separar finanças pessoais e profissionais",
     "Clareza sobre o resultado real"
    ],
    [
     "Particular",
     "Política de faltas e forma de pagamento",
     "Receita previsível"
    ],
    [
     "Convênio",
     "Controle de faturamento, repasse e glosas",
     "Menos perdas de receita"
    ],
    [
     "Preço",
     "Cálculo a partir dos custos e da meta de renda",
     "Valor de sessão sustentável"
    ],
    [
     "Impostos",
     "Receita Saúde, carnê-leão e mudanças de 2027",
     "Regularidade e ausência de multas"
    ]
   ],
   "legenda": ""
  },
  {
   "t": "texto",
   "html": "<h2>1. Separe as finanças do consultório das finanças pessoais</h2><p>Misturar receitas e despesas do consultório com gastos pessoais é o erro mais comum entre profissionais autônomos. Quando tudo passa pela mesma conta, não é possível saber se o consultório gera lucro, quanto custa mantê-lo ou quanto sobra no fim do mês.</p><h3>Como fazer</h3><ul><li><strong>Tenha uma conta exclusiva para o trabalho.</strong> Para quem atende como pessoa física, pode ser uma segunda conta no próprio CPF. Para quem tem CNPJ, a conta PJ.</li><li><strong>Concentre ali todas as receitas</strong> de pacientes particulares e de convênios.</li><li><strong>Pague por ela todas as despesas do consultório:</strong> sala, supervisão, plataformas, anuidade do CRP.</li><li><strong>Defina uma retirada mensal fixa</strong> (pró-labore) e transfira esse valor para a conta pessoal.</li></ul><h3>O que isso significa na prática</h3><p>Com a retirada fixa, o que excede nos meses de maior movimento permanece no consultório e forma uma reserva. Essa reserva sustenta os meses mais fracos, como janeiro, julho e períodos de férias dos pacientes, sem comprometer a renda pessoal.</p><h2>2. Entenda as diferenças entre particular e convênio</h2><p>Atender particular e convênio significa lidar com dois fluxos de receita com regras, prazos e riscos distintos.</p>"
  },
  {
   "t": "tabela",
   "cab": true,
   "linhas": [
    [
     "Aspecto",
     "Particular",
     "Convênio"
    ],
    [
     "Valor da sessão",
     "Definido pelo profissional",
     "Definido em contrato pela operadora"
    ],
    [
     "Prazo de recebimento",
     "Imediato ou conforme combinado",
     "Após o faturamento, em geral em até 30 dias"
    ],
    [
     "Principal risco",
     "Faltas e remarcações",
     "Glosas e atrasos de repasse"
    ],
    [
     "Burocracia",
     "Baixa",
     "Alta: guias, autorizações e auditorias"
    ]
   ],
   "legenda": ""
  },
  {
   "t": "texto",
   "html": "<h3>Particular</h3><p>O atendimento particular oferece maior autonomia e previsibilidade. Os principais pontos de atenção são as faltas e as remarcações. Recomenda-se:</p><ul><li><strong>Formalizar a política de cancelamento</strong> no contrato terapêutico.</li><li><strong>Avaliar o pagamento mensal antecipado</strong>, que reduz a inadimplência e torna a receita mais previsível.</li></ul><h3>Convênio</h3><p>No convênio, o valor por sessão costuma ser significativamente menor que o do particular, e o pagamento ocorre somente após o faturamento. Há ainda o risco de <strong>glosa</strong>: a recusa total ou parcial do pagamento de uma sessão pela operadora, frequentemente motivada por falhas administrativas, como ausência de autorização prévia ou preenchimento incorreto da guia.</p><p>Para controlar esse fluxo, registre para cada sessão de convênio:</p><ol><li>Data do atendimento</li><li>Data do faturamento</li><li>Valor previsto</li><li>Valor efetivamente recebido</li></ol><p>Com esse controle, é possível identificar atrasos, glosas e o total a receber de cada operadora.</p>"
  },
  {
   "t": "destaque",
   "variante": "atencao",
   "titulo": "Atenção",
   "html": "<p>Recursos de glosa têm prazo definido em contrato, e a perda do prazo resulta na perda definitiva do valor.</p>"
  },
  {
   "t": "destaque",
   "variante": "atencao",
   "titulo": "Cuidado ético",
   "html": "<p>Não é permitido registrar uma sessão no convênio e cobrar complemento particular do paciente pela mesma sessão. A prática configura infração ética e pode gerar glosa.</p>"
  },
  {
   "t": "texto",
   "html": "<h2>3. Calcule o valor da sessão a partir dos seus custos</h2><p>Definir o valor da sessão apenas com base no que outros profissionais cobram não garante a sustentabilidade do consultório. O cálculo deve partir de três elementos: custos, meta de renda e volume de atendimentos.</p><h3>Passo 1: levante os custos mensais</h3><ul><li>Aluguel da sala (mensal ou por turno)</li><li>Supervisão e terapia pessoal</li><li>Anuidade do CRP (dividida por 12)</li><li>Plataforma de atendimento online, agenda, internet e telefone</li><li>Contabilidade ou gestão financeira</li><li>Cursos e formações</li></ul><h3>Passo 2: some a meta de retirada mensal</h3><p>A soma dos custos com a retirada desejada corresponde ao faturamento mínimo necessário, antes dos impostos.</p><h3>Passo 3: calcule o número de sessões</h3><p>Exemplo: custos de R$ 3.000 e retirada desejada de R$ 6.000 resultam em faturamento necessário de R$ 9.000 por mês.</p>"
  },
  {
   "t": "tabela",
   "cab": true,
   "linhas": [
    [
     "Cenário",
     "Valor por sessão",
     "Sessões por mês",
     "Sessões por semana"
    ],
    [
     "Somente particular",
     "R$ 150",
     "60",
     "15"
    ],
    [
     "Somente convênio",
     "R$ 60",
     "150",
     "37 a 38"
    ],
    [
     "Misto (40 particulares + 50 de convênio)",
     "R$ 150 e R$ 60",
     "90",
     "22 a 23"
    ]
   ],
   "legenda": "Valores ilustrativos. O repasse de cada convênio é definido no contrato de credenciamento."
  },
  {
   "t": "texto",
   "html": "<h3>O que isso significa na prática</h3><ul><li>Atender exclusivamente por convênio exige mais que o dobro de sessões para atingir o mesmo resultado do atendimento particular.</li><li>O convênio tem vantagens, como volume e acesso a novos pacientes, mas o equilíbrio entre os dois modelos deve ser uma decisão consciente.</li><li><strong>Considere as faltas no cálculo.</strong> Com uma taxa média de 10%, 60 sessões agendadas resultam em 54 realizadas.</li></ul><h2>4. Mantenha recibos e impostos em dia</h2><p>As obrigações fiscais variam conforme a forma de atuação do profissional.</p>"
  },
  {
   "t": "tabela",
   "cab": true,
   "linhas": [
    [
     "Critério",
     "Pessoa física (CPF)",
     "Empresa (CNPJ, ME ou EPP)"
    ],
    [
     "Documento emitido",
     "Recibo pelo Receita Saúde",
     "Nota fiscal de serviço (NFS-e)"
    ],
    [
     "Imposto de renda",
     "Carnê-leão mensal e declaração anual",
     "Simples Nacional (DAS)"
    ],
    [
     "Contador",
     "Não obrigatório",
     "Obrigatório"
    ]
   ],
   "legenda": ""
  },
  {
   "t": "texto",
   "html": "<h3>Psicólogo pessoa física</h3><ul><li><strong>Receita Saúde:</strong> desde janeiro de 2025, o recibo deve ser emitido pelo aplicativo da Receita Federal. O recibo em papel não tem mais validade para dedução no Imposto de Renda do paciente. É obrigatório informar o CPF de quem pagou.</li><li><strong>Multa:</strong> a falta de emissão gera multa de R$ 100 por mês de atraso. Recomenda-se emitir o recibo no momento do recebimento.</li><li><strong>Carnê-leão:</strong> os valores recebidos de pessoas físicas devem ser declarados e o imposto recolhido mensalmente.</li></ul><h3>Psicólogo com CNPJ</h3><p>O profissional emite NFS-e, recolhe os tributos pelo Simples Nacional e deve contar com contabilidade.</p>"
  },
  {
   "t": "destaque",
   "variante": "atencao",
   "titulo": "Importante",
   "html": "<p>Psicólogo não pode ser MEI, pois a Psicologia é uma profissão regulamentada.</p>"
  },
  {
   "t": "texto",
   "html": "<h3>O que muda em 2027</h3><p>Com a Reforma Tributária, a partir de 1º de janeiro de 2027 o profissional autônomo que exerce atividade de forma habitual e fatura acima do limite do nanoempreendedor passa a ser contribuinte do IBS e da CBS. Na prática, será necessário:</p><ul><li><strong>Inscrição no CNPJ vinculada ao CPF</strong>, chamada pelo mercado de \"CNPJ técnico\".</li><li><strong>Emissão de nota fiscal eletrônica</strong>, como uma empresa.</li></ul><p>As regras ainda estão em regulamentação, e o impacto varia conforme o faturamento e o perfil de cada profissional. Em alguns casos, a abertura de empresa no Simples Nacional pode ser mais vantajosa do que a atuação como pessoa física.</p>"
  },
  {
   "t": "destaque",
   "variante": "dica",
   "titulo": "Nossa recomendação",
   "html": "<p>Faça essa análise antes de janeiro, com apoio profissional.</p>"
  },
  {
   "t": "texto",
   "html": "<h3>Reserve o valor dos impostos</h3><p>Independentemente do enquadramento, separe um percentual de cada recebimento para os impostos assim que o valor entrar, mantendo-o em uma reserva específica. Isso evita surpresas no pagamento do carnê-leão, do DAS ou da declaração anual.</p><h2>5. Adote uma rotina financeira simples</h2><p>A organização financeira não exige sistemas complexos, mas sim constância.</p>"
  },
  {
   "t": "tabela",
   "cab": true,
   "linhas": [
    [
     "Frequência",
     "Tarefas",
     "Tempo estimado"
    ],
    [
     "Semanal",
     "Conferir pagamentos e pendências, emitir recibos faltantes, verificar repasses de convênio",
     "15 minutos"
    ],
    [
     "Mensal",
     "Fechar receitas (particular e convênio), despesas, retirada e resultado; comparar com o mês anterior",
     "1 hora"
    ]
   ],
   "legenda": ""
  },
  {
   "t": "texto",
   "html": "<h3>O que isso significa na prática</h3><p>Após três ou quatro meses de acompanhamento, os padrões ficam visíveis: meses de menor movimento, convênios com mais glosas e o peso das faltas. Com esses dados, decisões como reajustar o valor da sessão, descredenciar um convênio ou ampliar os turnos de atendimento passam a ser tomadas com segurança.</p><h2>Checklist: organize o financeiro do seu consultório</h2>"
  },
  {
   "t": "lista",
   "titulo": "",
   "estilo": "check",
   "itens": [
    "Abrir uma conta exclusiva para o consultório.",
    "Definir um valor fixo de retirada mensal.",
    "Formalizar a política de faltas e cancelamentos no contrato terapêutico.",
    "Criar um controle de sessões de convênio: atendimento, faturamento, valor previsto e valor recebido.",
    "Levantar todos os custos mensais do consultório.",
    "Recalcular o valor da sessão com base nos custos e na meta de renda.",
    "Emitir todos os recibos pelo Receita Saúde e manter o carnê-leão em dia.",
    "Avaliar, antes de janeiro, o impacto da Reforma Tributária em 2027."
   ]
  },
  {
   "t": "texto",
   "html": "<h2>Conclusão</h2><p>A gestão financeira do consultório não exige que o psicólogo se torne especialista em finanças. Exige método: contas separadas, controle de particular e convênio, preço calculado a partir dos custos e obrigações fiscais em dia.</p><p>Com 2027 trazendo mudanças relevantes para quem atende como pessoa física, este é o momento de organizar os números e tomar decisões com antecedência.</p><p>Quer ajuda para organizar as finanças do seu consultório? <strong><a href=\"/#contato\">Fale com a CM Soluções Financeiras.</a></strong> A gente transforma números em decisões.</p><h2>Fontes</h2><ul><li><a href=\"https://agilize.com.br/artigos/?p=3876\">Agilize: Receita Saúde e recibo de psicólogo</a></li><li><a href=\"https://agilize.com.br/artigos/?p=3736\">Agilize: multa por recibo não emitido</a></li><li><a href=\"https://agilize.com.br/artigos/?p=3934\">Agilize: psicólogo pelo convênio e prazo de repasse</a></li><li><a href=\"https://agilize.com.br/artigos/?p=3400\">Agilize: psicólogo que atende plano e particular</a></li><li><a href=\"https://agilize.com.br/artigos/contabilidade-medico-convenios-glosas\">Agilize: o que é glosa de convênio</a></li><li><a href=\"https://contadores.cnt.br/projetos/35/noticias/tecnicas/2026/07/02/cnpj-tecnico-para-pessoa-fisica-entenda-quem-pode-ser-obrigado-se-o-recibo-acaba-e-quando-sera-necessario-emitir-nota-fiscal.html\">Contadores.cnt.br: CNPJ técnico para pessoa física em 2027</a></li><li><a href=\"https://www.cora.com.br/blog/reforma-tributaria-medicos/\">Cora: Reforma Tributária para profissionais de saúde</a></li></ul>"
  }
 ]
}
JSON
  , true),
];
