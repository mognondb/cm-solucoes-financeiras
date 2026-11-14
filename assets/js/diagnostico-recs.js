/* ==========================================================================
   CM Diagnóstico — recomendações.
   Cada regra devolve uma "gravidade" de 0 a 1 em quando(c) (0 = não se aplica) e o texto em texto(c).
   O motor ordena por gravidade × peso e mostra as mais importantes primeiro.
   c = { r, seg, ind, p(id) pontos da resposta ou null, resp(id) texto da resposta, tem(id,v), fmt:{brl,pct} }
   ========================================================================== */
(function (g) {
  'use strict';
  var D = g.CMDiag = g.CMDiag || {};

  /* gravidade a partir dos pontos de uma pergunta: 0 ponto = 1, 3 pontos = 0; só vale se os pontos ficarem até o limite */
  function sev(c, id, limite) {
    var p = c.p(id);
    return (p !== null && p <= limite) ? (3 - p) / 3 : 0;
  }
  function maior() { return Math.max.apply(null, arguments); }
  var SUBSTANTIVO = { alimentacao: 'item do cardápio', saude: 'atendimento', estetica: 'serviço', comercio: 'produto', servicos: 'serviço ou projeto', outro: 'produto ou serviço' };
  var ITENS = { alimentacao: 'itens', saude: 'atendimentos', estetica: 'serviços', comercio: 'produtos', servicos: 'serviços', outro: 'produtos ou serviços' };

  D.RECOMENDACOES = [

    /* ---------------------------------------------------------------- fundamentos (qualquer segmento) */
    { id: 'numeros', dim: 'D3', peso: 1.3,
      quando: function (c) { return c.ind.faltam.length ? 1 : 0; },
      texto: function (c) {
        return {
          titulo: 'Levantar os números básicos do negócio',
          porque: 'Você não soube informar ' + c.ind.faltam.join(', ').replace(/, ([^,]*)$/, ' e $1') + '. Sem esses números não dá para saber se o negócio dá lucro nem quanto precisa vender para empatar.',
          acoes: ['Separe os extratos e comprovantes dos últimos 3 meses.',
            'Some o que entrou (faturamento) e o que saiu, separando custos diretos, despesas fixas e retiradas pessoais.',
            'Calcule a média mensal de cada grupo e repita o cálculo todo mês.'],
        };
      } },

    { id: 'separar_contas', dim: 'D4', peso: 1.2,
      quando: function (c) { return sev(c, 'org_separa', 1.5); },
      texto: function (c) {
        return {
          titulo: 'Separar o dinheiro pessoal do dinheiro do negócio',
          porque: c.p('org_separa') === 0 ? 'Hoje o dinheiro pessoal e o do negócio saem do mesmo lugar, e isso esconde o resultado real.'
            : 'Você tem contas separadas, mas às vezes mistura os valores, o que distorce o resultado do negócio.',
          acoes: ['Use uma conta bancária exclusiva do negócio (se tiver CNPJ, uma conta PJ).',
            'Pague despesas pessoais apenas com a sua retirada, nunca direto do caixa do negócio.',
            'Quando precisar de dinheiro além da retirada, registre como retirada extra, não como despesa do negócio.'],
        };
      } },

    { id: 'retirada', dim: 'D4', peso: 1,
      quando: function (c) { return sev(c, 'org_retirada', 1.5); },
      texto: function (c) {
        var i = c.ind;
        return {
          titulo: 'Definir uma retirada mensal para você',
          porque: 'Hoje você retira ' + (c.r.org_retirada === 'sobra' ? 'o que sobra' : c.r.org_retirada === 'nec' ? 'conforme a necessidade' : 'sem organização')
            + ', o que mascara o resultado real do negócio.' + (i.resultado !== null ? ' O resultado estimado antes da sua retirada é de ' + c.fmt.brl(i.resultado) + ' por mês: é dele que sua retirada precisa sair.' : ''),
          acoes: ['Trate a retirada como um custo fixo do negócio, com valor e data definidos.',
            'Comece com um valor que o resultado atual sustente e revise a cada trimestre.',
            'Retirada acima do resultado é dinheiro do caixa saindo: se isso acontece, o problema está no preço, nos custos ou nas despesas, não na retirada.'],
        };
      } },

    { id: 'fluxo_caixa', dim: 'D3', peso: 1.25,
      quando: function (c) { var pr = c.ind.ptsReserva; return maior(sev(c, 'org_contas', 1.5), pr !== null && pr <= 0.5 ? 0.8 : 0); },
      texto: function (c) {
        var pouca = c.ind.ptsReserva !== null && c.ind.ptsReserva <= 0.5;
        return {
          titulo: 'Estruturar uma rotina de fluxo de caixa',
          porque: 'Sem enxergar os vencimentos dos próximos dias' + (pouca ? ' e com pouca reserva' : '') + ', é fácil ser surpreendido por contas e atrasar pagamentos.',
          acoes: ['Liste tudo que vence nas próximas 4 semanas (a pagar e a receber), com data e valor.',
            'Atualize a lista toda semana, em um dia fixo: 20 minutos bastam.',
            'Olhe o saldo previsto semana a semana. Se ficar negativo, aja antes: negocie prazo, antecipe recebimentos ou adie compras.'],
        };
      } },

    { id: 'registro', dim: 'D4', peso: 1,
      quando: function (c) { return sev(c, 'org_registro', 1); },
      texto: function (c) {
        var como = { caderno: 'de anotações em caderno', extrato: 'dos extratos bancários', nao: 'de nenhum registro regular' }[c.r.org_registro] || 'de registros soltos';
        return {
          titulo: 'Registrar vendas e despesas em um só lugar',
          porque: 'Hoje o controle depende ' + como + ', o que dificulta somar, comparar meses e achar erros.',
          acoes: ['Escolha uma ferramenta única: uma planilha simples resolve no começo; se o volume for alto, um sistema de gestão.',
            'Defina poucas categorias fixas (custos diretos, despesas fixas, impostos, retiradas).',
            'Lance toda semana. Deixar acumular para o fim do mês é o que faz o controle morrer.'],
        };
      } },

    { id: 'lucro_real', dim: 'D6', peso: 1.1,
      quando: function (c) { return sev(c, 'org_lucro', 0.5); },
      texto: function () {
        return {
          titulo: 'Descobrir o lucro real de cada mês',
          porque: 'Saldo na conta não é lucro: ele mistura dívidas, estoque, retiradas e valores a receber.',
          acoes: ['No fim do mês, calcule: vendas − custos diretos − despesas fixas − impostos.',
            'Compare com a sua retirada: o que sobra é o lucro do mês.',
            'Guarde o resultado mês a mês para enxergar a tendência.'],
        };
      } },

    { id: 'planejamento', dim: 'D5', peso: 1,
      quando: function (c) { return maior(sev(c, 'org_planejamento', 1.5), sev(c, 'org_invest', 1.5) * 0.8); },
      texto: function (c) {
        var i = c.ind;
        return {
          titulo: 'Criar uma previsão simples do mês e definir metas',
          porque: 'Sem previsão, o negócio reage aos problemas em vez de se antecipar a eles.'
            + (i.pe !== null && isFinite(i.pe) ? ' Pelos números informados, o faturamento mínimo para empatar é de cerca de ' + c.fmt.brl(i.pe) + ' por mês: é a meta mínima.' : ''),
          acoes: ['No começo do mês, estime vendas, custos diretos e despesas fixas.',
            'Defina uma meta mínima (a que cobre custos e retirada) e uma meta desejada.',
            'Antes de qualquer compra grande, simule o impacto no caixa dos próximos 3 meses.'],
        };
      } },

    { id: 'acompanhamento', dim: 'D6', peso: 0.9,
      quando: function (c) { return sev(c, 'org_acomp', 0.5); },
      texto: function () {
        return {
          titulo: 'Escolher um dia fixo para olhar os resultados',
          porque: 'Olhar os números só quando falta dinheiro significa descobrir o problema tarde demais.',
          acoes: ['Reserve 20 minutos por semana (ou 1 hora por mês) só para isso.',
            'Acompanhe três números: faturamento, margem (o que sobra depois dos custos diretos) e saldo previsto.',
            'Termine cada revisão com uma decisão: o que vou mudar até a próxima.'],
        };
      } },

    { id: 'reserva', dim: 'D3', peso: 1.2,
      quando: function (c) { var pr = c.ind.ptsReserva; return pr !== null && pr <= 0.5 ? (3 - pr) / 3 : 0; },
      texto: function (c) {
        var i = c.ind;
        return {
          titulo: 'Montar uma reserva de caixa',
          porque: 'O dinheiro disponível cobre menos de um mês de despesas: qualquer queda nas vendas vira atraso.',
          acoes: ['Meta inicial: 1 mês de despesas fixas' + (i.fixosTot !== null ? ' (cerca de ' + c.fmt.brl(i.fixosTot) + ')' : '') + '.',
            'Separe um percentual fixo de cada venda (mesmo 2% a 3%) em uma conta à parte.',
            'Não use essa reserva para investimentos nem para retiradas.'],
        };
      } },

    { id: 'dividas', dim: 'D3', peso: 1.2,
      quando: function (c) {
        var i = c.ind;
        return maior(sev(c, 'dividas', 1), (i.parcelaPct !== null && i.parcelaPct > 0.15) ? 0.7 : 0);
      },
      texto: function (c) {
        var i = c.ind;
        return {
          titulo: 'Organizar e renegociar as dívidas',
          porque: (c.r.dividas === 'atraso' ? 'Há pagamentos atrasados, o que aumenta juros e multas.' : 'As dívidas estão pesando para pagar.')
            + (i.parcelaPct !== null ? ' As parcelas representam cerca de ' + c.fmt.pct(i.parcelaPct) + ' do faturamento.' : ''),
          acoes: ['Liste todas as dívidas com saldo, parcela, taxa e atraso.',
            'Priorize as mais caras (cartão, cheque especial, empréstimo de giro) e as que podem travar o negócio.',
            'Procure o credor antes de atrasar: renegociar cedo costuma custar menos.',
            'Evite pegar um novo empréstimo para pagar o antigo sem calcular o custo total.'],
        };
      } },

    { id: 'margem', dim: 'D2', peso: 1.3,
      quando: function (c) { var i = c.ind; return (i.margem !== null && i.ptsMargem !== null && i.ptsMargem <= 1) ? (3 - i.ptsMargem) / 3 : 0; },
      texto: function (c) {
        var i = c.ind;
        return {
          titulo: 'Recuperar margem: rever custos diretos e preços',
          porque: 'Estimamos que cerca de ' + c.fmt.pct(i.custoVar / i.fat) + ' do faturamento vá para custos diretos, o que deixa uma margem de contribuição de ' + c.fmt.pct(i.margem)
            + '. Para o seu segmento, uma referência confortável é acima de ' + c.fmt.pct(i.limMargem[1]) + '.',
          acoes: ['Liste os 10 itens de maior custo e peça cotação a pelo menos um outro fornecedor.',
            'Revise os preços dos ' + ITENS[c.seg] + ' mais vendidos: um reajuste pequeno nos campeões de venda pesa mais que muitos reajustes nos demais.',
            'Ataque perdas e desperdícios (veja as recomendações específicas do seu segmento).'],
        };
      } },

    { id: 'ponto_equilibrio', dim: 'D3', peso: 1.2,
      quando: function (c) {
        var i = c.ind;
        if (i.resultado !== null && i.resultado <= 0) return 1;
        return (i.ptsFolga !== null && i.ptsFolga <= 1) ? (3 - i.ptsFolga) / 3 : 0;
      },
      texto: function (c) {
        var i = c.ind, ate;
        if (i.pe === Infinity || i.pe === null) ate = 'Com a margem estimada, o faturamento informado não cobre as despesas fixas.';
        else ate = 'Com os números informados, o faturamento mínimo para empatar é de cerca de ' + c.fmt.brl(i.pe) + ' por mês'
          + (i.folga !== null ? (i.folga >= 0 ? ', apenas ' + c.fmt.pct(i.folga) + ' abaixo do que você fatura hoje.' : ', acima do que você fatura hoje.') : '.');
        return {
          titulo: 'Calcular e acompanhar o ponto de equilíbrio',
          porque: ate,
          acoes: ['Ponto de equilíbrio = despesas fixas ÷ margem de contribuição.',
            'Divida pelo número de dias de funcionamento para ter uma meta diária de vendas.',
            'Se a meta estiver apertada, atue nas duas pontas: reduzir despesas fixas e aumentar a margem.'],
        };
      } },

    { id: 'despesas_fixas', dim: 'D2', peso: 0.9,
      quando: function (c) { var i = c.ind; return (i.fixosTot !== null && i.fat && i.fixosTot / i.fat > 0.35) ? 0.7 : 0; },
      texto: function (c) {
        var i = c.ind;
        return {
          titulo: 'Revisar as despesas fixas',
          porque: 'As despesas fixas estimadas consomem cerca de ' + c.fmt.pct(i.fixosTot / i.fat) + ' do faturamento, o que deixa pouca folga em meses mais fracos.',
          acoes: ['Liste cada despesa fixa e pergunte: o que acontece se eu cortar?',
            'Renegocie contratos (aluguel, internet, sistemas, contabilidade) e cancele o que não é usado.',
            'Sempre que possível, troque custo fixo por variável (comissão em vez de valor fixo).'],
        };
      } },

    { id: 'cartao', dim: 'D3', peso: 0.8,
      quando: function (c) { return sev(c, 'dv_cartao', 1.5); },
      texto: function () {
        return {
          titulo: 'Considerar as taxas e os prazos do cartão no controle',
          porque: 'Vender no cartão não é receber na hora: taxa e prazo mudam o dinheiro que realmente entra no caixa.',
          acoes: ['Registre a venda pelo valor líquido (já descontada a taxa), não pelo valor da maquininha.',
            'Acompanhe o calendário de recebimento: crédito parcelado e vale-refeição costumam cair semanas depois.',
            'Compare as taxas das adquirentes e negocie, principalmente se o volume for alto.'],
        };
      } },

    { id: 'aplicativos', dim: 'D2', peso: 1,
      quando: function (c) {
        var i = c.ind;
        var s = maior(sev(c, 'dv_app_preco', 1), 0);
        if (i.appFees !== null && i.fat && i.appFees / i.fat > 0.06) s = maior(s, 0.7);
        return s;
      },
      texto: function (c) {
        var i = c.ind, plataforma = c.seg === 'comercio' ? 'marketplaces e plataformas' : 'aplicativos';
        return {
          titulo: 'Incluir a taxa dos ' + plataforma + ' no preço',
          porque: (i.appFees !== null ? 'Estimamos que as taxas dos ' + plataforma + ' custem cerca de ' + c.fmt.brl(i.appFees) + ' por mês (' + c.fmt.pct(i.appFees / i.fat) + ' do faturamento). ' : '')
            + 'Se o preço é o mesmo do balcão, essa taxa sai direto da sua margem.',
          acoes: ['Calcule a margem de cada ' + SUBSTANTIVO[c.seg] + ' já descontada a taxa.',
            'Pratique um preço diferente (ou itens exclusivos) nesse canal.',
            'Incentive o canal próprio (WhatsApp, balcão) para clientes recorrentes.'],
        };
      } },

    /* ---------------------------------------------------------------- alimentação */
    { id: 'fichas', dim: 'D2', peso: 1.4, seg: ['alimentacao'],
      quando: function (c) { return maior(sev(c, 'al_custo_item', 1), sev(c, 'dv_fichas', 0.5) * 0.9); },
      texto: function (c) {
        var como = { conc: 'observando a concorrência', intui: 'por experiência ou intuição', ns: 'sem um cálculo' }[c.r.al_custo_item] || 'sem um custo atualizado';
        return {
          titulo: 'Implantar fichas técnicas para calcular o custo de cada produto',
          porque: 'Hoje o preço é definido ' + como + ', sem saber quanto custa produzir cada item. É assim que um item muito vendido pode dar prejuízo sem ninguém perceber.',
          acoes: ['Comece pelos 5 itens mais vendidos: liste os ingredientes e as quantidades de cada receita.',
            'Custo do item = quantidade × preço unitário de cada ingrediente (inclua a embalagem).',
            'Preço de venda = custo ÷ (1 − margem desejada − impostos e taxas). Atualize quando os preços de compra mudarem.'],
        };
      } },

    { id: 'desperdicio', dim: 'D1', peso: 1.3, seg: ['alimentacao'],
      quando: function (c) { return maior(sev(c, 'al_desperdicio', 1.5), sev(c, 'dv_perdas', 1) * 0.9); },
      texto: function (c) {
        var i = c.ind, est = '';
        if (i.perdasMes !== null) {
          est = ' Você estimou perdas de cerca de ' + c.fmt.brl(i.perdasMes) + ' por mês'
            + (i.custo ? ', algo como ' + c.fmt.pct(i.perdasMes / i.custo) + ' do que gasta com ingredientes.' : '.');
        }
        return {
          titulo: 'Medir o custo financeiro do desperdício',
          porque: 'As perdas existem, mas ainda não viram número.' + est,
          acoes: ['Durante 2 semanas, registre tudo que for descartado: item, quantidade e motivo (sobra, validade, erro de preparo).',
            'Converta em reais usando o custo de cada item e some por semana.',
            'Ataque a principal causa: ajuste porções e quantidades de preparo, revise os pedidos de compra e aproveite sobras em outros itens.'],
        };
      } },

    { id: 'compras_alimentacao', dim: 'D1', peso: 0.9, seg: ['alimentacao'],
      quando: function (c) { return (c.r.al_compras === 'mes' && c.p('al_estoque') !== null && c.p('al_estoque') <= 1.5) ? 0.65 : 0; },
      texto: function () {
        return {
          titulo: 'Planejar as compras com base nas vendas',
          porque: 'Comprar conforme a necessidade, sem controle de estoque, costuma gerar sobra de alguns itens (que viram perda) e falta de outros.',
          acoes: ['Anote as vendas por dia da semana e identifique o padrão.',
            'Monte a lista de compras a partir do que vendeu e do que ficou em estoque, não do que parece faltar.',
            'Concentre os pedidos em poucos fornecedores e negocie prazo de pagamento.'],
        };
      } },

    /* ---------------------------------------------------------------- estoque (alimentação, comércio, estética) */
    { id: 'estoque', dim: 'D1', peso: 1.1, seg: ['alimentacao', 'comercio', 'estetica'],
      quando: function (c) { return maior(sev(c, 'al_estoque', 1), sev(c, 'co_estoque', 1), sev(c, 'es_produtos', 1), sev(c, 'dv_estoque_freq', 1) * 0.8); },
      texto: function (c) {
        var o = { alimentacao: 'ingredientes', comercio: 'mercadorias', estetica: 'produtos' }[c.seg];
        return {
          titulo: 'Controlar entradas e saídas do estoque',
          porque: 'Sem saber o que entra e o que sai, o dinheiro fica parado em ' + o + ' e as perdas passam despercebidas.',
          acoes: ['Faça uma contagem semanal dos 10 itens de maior valor.',
            'Defina estoque mínimo e máximo para esses itens.',
            c.seg === 'comercio' ? 'Use um relatório de giro para reduzir a compra do que vende pouco.' : 'Organize por validade: o primeiro que vence é o primeiro que sai.'],
        };
      } },

    { id: 'rentabilidade_itens', dim: 'D2', peso: 0.9, seg: ['alimentacao', 'comercio', 'estetica'],
      quando: function (c) { var i = c.ind; return (i.margem !== null && i.ptsMargem !== null && i.ptsMargem <= 2 && i.ptsMargem > 1) ? 0.5 : 0; },
      texto: function (c) {
        return {
          titulo: 'Avaliar a rentabilidade dos ' + ITENS[c.seg] + ' mais vendidos',
          porque: 'Faturar bem não garante lucro: o que mais vende nem sempre é o que mais deixa margem.',
          acoes: ['Liste os 10 que mais vendem e calcule a margem de cada um (preço − custo − taxas).',
            'Onde a venda é alta e a margem é baixa, ajuste preço, receita ou porção.',
            'Dê destaque no cardápio, na vitrine ou na agenda aos de maior margem.'],
        };
      } },

    /* ---------------------------------------------------------------- saúde */
    { id: 'valor_atendimento', dim: 'D2', peso: 1.4, seg: ['saude'],
      quando: function (c) { return sev(c, 'sa_preco', 1); },
      texto: function () {
        return {
          titulo: 'Calcular o valor mínimo de cada atendimento',
          porque: 'Sem esse piso, é fácil cobrar menos do que o atendimento custa, e a conta aparece só no fim do mês.',
          acoes: ['Some as despesas fixas e a sua retirada desejada e divida pelas horas realmente atendidas por mês.',
            'Some o custo variável de cada atendimento (materiais, taxas, repasses).',
            'Compare com o valor cobrado: esse é o piso. Tabelas da região e dos colegas são só referência.'],
        };
      } },

    { id: 'agenda', dim: 'D2', peso: 1, seg: ['saude', 'estetica'],
      quando: function (c) { return maior(sev(c, 'sa_agenda', 1), sev(c, 'es_agenda', 1)); },
      texto: function () {
        return {
          titulo: 'Medir faltas e horários ociosos da agenda',
          porque: 'Cada horário vazio ou faltoso é receita que não volta, e em geral é a maior perda invisível desse tipo de negócio.',
          acoes: ['Registre por semana: horários disponíveis, ocupados e faltas.',
            'Calcule quanto as faltas custam em reais por mês.',
            'Adote confirmação prévia e uma política clara de cancelamento e reposição.'],
        };
      } },

    { id: 'repasse', dim: 'D1', peso: 1, seg: ['saude', 'estetica'],
      quando: function (c) { return maior(sev(c, 'sa_repasse', 1.5), sev(c, 'es_comissao', 1.5)); },
      texto: function (c) {
        var o = c.seg === 'saude' ? 'repasse' : 'comissão';
        return {
          titulo: 'Formalizar as regras de ' + o,
          porque: 'Regras informais geram erros de cálculo, discussões e custo que o negócio não enxerga.',
          acoes: ['Escreva as regras (percentual, base de cálculo e prazo de pagamento) e combine por escrito.',
            'Calcule em planilha ou sistema a cada fechamento, nunca de memória.',
            'Entregue ao profissional o demonstrativo do que ele recebeu.'],
        };
      } },

    { id: 'custos_atendimento', dim: 'D1', peso: 0.9, seg: ['saude'],
      quando: function (c) { return sev(c, 'sa_custos', 1.5); },
      texto: function () {
        return {
          titulo: 'Acompanhar os custos que variam com cada atendimento',
          porque: 'Sem esse acompanhamento, materiais, taxas e repasses vão corroendo a margem sem que ninguém perceba.',
          acoes: ['Liste os custos que mudam conforme o número de atendimentos.',
            'Some por mês e divida pelo número de atendimentos para ter o custo médio de cada um.',
            'Compare com o valor cobrado e reveja o que estiver desproporcional.'],
        };
      } },

    { id: 'convenio', dim: 'D3', peso: 1, seg: ['saude'],
      quando: function (c) { return sev(c, 'dv_convenio', 1.5); },
      texto: function () {
        return {
          titulo: 'Controlar o que cada convênio deve pagar, com glosas e prazos',
          porque: 'Convênio paga tarde e pode recusar parte do valor. Sem controle, o dinheiro some entre o atendimento e o recebimento.',
          acoes: ['Registre cada guia com data, valor e convênio.',
            'Acompanhe as glosas (recusas) e o motivo; recorra dentro do prazo.',
            'Calcule o prazo médio de recebimento de cada convênio e compare com seus custos para decidir quais compensam.'],
        };
      } },

    /* ---------------------------------------------------------------- estética */
    { id: 'custo_servico', dim: 'D2', peso: 1.4, seg: ['estetica'],
      quando: function (c) { return sev(c, 'es_preco', 1); },
      texto: function () {
        return {
          titulo: 'Calcular o custo de cada serviço',
          porque: 'Sem saber quanto custa realizar cada serviço, o preço vira palpite e alguns serviços podem dar prejuízo.',
          acoes: ['Para cada serviço, some o custo dos produtos, o tempo do profissional e uma parte da estrutura.',
            'Defina o preço a partir desse custo e da margem desejada.',
            'Revise os serviços de maior volume primeiro.'],
        };
      } },

    { id: 'pacotes', dim: 'D3', peso: 0.8, seg: ['estetica'],
      quando: function (c) { return sev(c, 'dv_pacotes', 1.5); },
      texto: function () {
        return {
          titulo: 'Controlar o saldo dos pacotes vendidos antecipadamente',
          porque: 'Pacote pago adiantado é dinheiro que entrou, mas serviço que ainda será prestado: se for gasto como lucro, falta caixa depois.',
          acoes: ['Cadastre cada pacote com cliente, valor e número de sessões, e dê baixa a cada atendimento.',
            'Trate o valor recebido e ainda não prestado como obrigação, não como dinheiro livre.',
            'Defina prazo de validade e regra de reembolso.'],
        };
      } },

    /* ---------------------------------------------------------------- comércio */
    { id: 'giro', dim: 'D1', peso: 1, seg: ['comercio'],
      quando: function (c) { return sev(c, 'co_giro', 1); },
      texto: function () {
        return {
          titulo: 'Acompanhar os produtos parados e de baixo giro',
          porque: 'Produto parado é dinheiro congelado na prateleira, que poderia pagar contas ou virar produto que vende.',
          acoes: ['Liste os produtos sem venda nos últimos 60 a 90 dias e quanto dinheiro está parado neles.',
            'Planeje promoções e combos para girar esse estoque.',
            'Reduza ou pare a compra desses itens.'],
        };
      } },

    { id: 'preco_comercio', dim: 'D2', peso: 1.4, seg: ['comercio'],
      quando: function (c) { return sev(c, 'co_preco', 1.5); },
      texto: function () {
        return {
          titulo: 'Definir o preço por margem, não por palpite',
          porque: 'Sem uma margem-alvo, um produto pode vender bem e dar pouco ou nenhum lucro depois de impostos, taxas e frete.',
          acoes: ['Defina a margem desejada por categoria, considerando impostos, taxas e frete.',
            'Preço = custo ÷ (1 − margem − impostos − taxas).',
            'Revise os preços sempre que o fornecedor reajustar.'],
        };
      } },

    { id: 'compras_comercio', dim: 'D1', peso: 0.9, seg: ['comercio'],
      quando: function (c) { return sev(c, 'co_compras', 1.5); },
      texto: function () {
        return {
          titulo: 'Planejar a reposição com base em vendas e estoque',
          porque: 'Comprar por oferta ou só quando acaba gera excesso de alguns itens e ruptura de outros, e os dois custam dinheiro.',
          acoes: ['Calcule o giro médio dos itens principais.',
            'Defina ponto de reposição: quando o estoque chega a X, compra-se Y.',
            'Compare o desconto por volume com o custo de manter o estoque parado.'],
        };
      } },

    /* ---------------------------------------------------------------- serviços */
    { id: 'custo_hora', dim: 'D2', peso: 1.4, seg: ['servicos'],
      quando: function (c) { return sev(c, 'se_custo_hora', 1); },
      texto: function () {
        return {
          titulo: 'Calcular o custo da sua hora (ou do projeto)',
          porque: 'Sem esse número, é fácil vender barato e trabalhar muito para ganhar pouco.',
          acoes: ['Some as despesas fixas e a sua retirada desejada e divida pelas horas vendáveis do mês (desconte reuniões, administrativo e prospecção).',
            'Acrescente custos diretos e impostos.',
            'Cobre pelo menos esse piso mais a margem desejada.'],
        };
      } },

    { id: 'rentab_projeto', dim: 'D1', peso: 1, seg: ['servicos'],
      quando: function (c) { return sev(c, 'se_projeto', 1.5); },
      texto: function () {
        return {
          titulo: 'Registrar tempo e custo de cada projeto',
          porque: 'Sem isso, o resultado geral do mês esconde quais clientes e projetos dão lucro e quais consomem margem.',
          acoes: ['Registre as horas trabalhadas e os custos diretos de cada projeto.',
            'Ao final de cada um, calcule a margem real e compare com o que foi previsto.',
            'Use esses dados para calibrar as próximas propostas.'],
        };
      } },

    { id: 'concentracao', dim: 'D3', peso: 1.1, seg: ['servicos'],
      quando: function (c) { return sev(c, 'se_concentracao', 1); },
      texto: function (c) {
        return {
          titulo: 'Reduzir a dependência de poucos clientes',
          porque: 'Um único cliente representa ' + (c.r.se_concentracao === 'd' ? 'mais de 60%' : c.r.se_concentracao === 'c' ? 'de 40% a 60%' : 'boa parte') + ' do faturamento: perdê-lo abalaria o caixa de uma vez.',
          acoes: ['Calcule a participação de cada cliente no faturamento.',
            'Defina uma meta mensal de propostas para novos clientes.',
            'Prefira contratos recorrentes e com prazo.'],
        };
      } },

    { id: 'receber', dim: 'D3', peso: 1, seg: ['servicos', 'comercio', 'saude', 'estetica', 'alimentacao', 'outro'],
      quando: function (c) { return sev(c, 'dv_receber', 1.5); },
      texto: function () {
        return {
          titulo: 'Acompanhar o que tem a receber e cobrar os atrasos',
          porque: 'Venda a prazo só vira dinheiro quando é recebida. Sem controle, o atraso só aparece quando o caixa já apertou.',
          acoes: ['Liste quem deve, quanto e desde quando.',
            'Defina uma rotina de cobrança: lembrete antes do vencimento, contato no dia e nova cobrança depois de alguns dias.',
            'Combine prazos e multa por escrito.'],
        };
      } },

    /* ---------------------------------------------------------------- outro segmento */
    { id: 'preco_geral', dim: 'D2', peso: 1.3, seg: ['outro'],
      quando: function (c) { return sev(c, 'ou_preco', 1); },
      texto: function () {
        return {
          titulo: 'Definir os preços a partir dos custos e da margem desejada',
          porque: 'Preço definido por concorrência ou intuição pode não cobrir os custos nem a sua retirada.',
          acoes: ['Calcule o custo de cada produto ou serviço (diretos + parte das despesas fixas).',
            'Defina a margem desejada e o preço que a garante.',
            'Compare com a concorrência apenas depois.'],
        };
      } },

    { id: 'custos_gerais', dim: 'D1', peso: 0.9, seg: ['outro'],
      quando: function (c) { return sev(c, 'ou_custos', 1.5); },
      texto: function () {
        return {
          titulo: 'Separar e acompanhar os custos diretos',
          porque: 'Misturar custos diretos e despesas fixas esconde se a margem de cada venda está saudável.',
          acoes: ['Separe, todo mês, o que varia com a venda do que é fixo.',
            'Calcule quanto sobra de cada venda depois dos custos diretos.',
            'Acompanhe essa margem mês a mês.'],
        };
      } },

    /* ---------------------------------------------------------------- modo preciso (precisam de números exatos) */
    { id: 'meta_diaria', dim: 'D3', peso: 1.15,
      quando: function (c) {
        var i = c.ind;
        if (i.peVendas === null || !i.vendasMes) return 0;
        var uso = i.peVendas / i.vendasMes; // quanto do volume atual é só para empatar
        return uso >= 1 ? 1 : uso >= 0.8 ? 0.7 : 0;
      },
      texto: function (c) {
        var i = c.ind, f = c.fmt;
        var dia = i.diasFunc ? ' (cerca de ' + (Math.round(i.peVendas / i.diasFunc * 10) / 10 + '').replace('.', ',') + ' por dia de funcionamento)' : '';
        return {
          titulo: 'Transformar o ponto de equilíbrio em uma meta diária',
          porque: 'Com ticket médio de ' + f.inteiro(i.ticket) + ', o negócio precisa de cerca de ' + Math.round(i.peVendas).toLocaleString('pt-BR') + ' vendas por mês só para empatar' + dia
            + '. Hoje faz cerca de ' + Math.round(i.vendasMes).toLocaleString('pt-BR') + ': sobra pouca ou nenhuma folga.',
          acoes: ['Coloque a meta diária (' + (i.peDia !== null ? f.inteiro(i.peDia) : 'o ponto de equilíbrio dividido pelos dias de funcionamento') + ') onde a equipe e você enxerguem todo dia.',
            'Compare o vendido com a meta ao fechar o dia, não só no fim do mês.',
            'Para ganhar folga, aja no ticket médio (combos, adicionais, venda casada) e na margem, antes de buscar mais volume.'],
        };
      } },

    { id: 'retirada_excede', dim: 'D4', peso: 1.35,
      quando: function (c) { var i = c.ind; return (i.resultadoApos !== null && i.fat) ? (i.resultadoApos < 0 ? 1 : (i.resultadoApos / i.fat < 0.03 ? 0.6 : 0)) : 0; },
      texto: function (c) {
        var i = c.ind, f = c.fmt;
        return {
          titulo: i.resultadoApos < 0 ? 'Sua retirada é maior do que o resultado do negócio' : 'Depois da sua retirada, quase nada sobra',
          porque: 'O resultado estimado é de ' + f.inteiro(i.resultado) + ' por mês e a sua retirada é de ' + f.inteiro(i.retirada) + '.'
            + (i.resultadoApos < 0 ? ' A diferença (' + f.inteiro(-i.resultadoApos) + ' por mês) sai do caixa ou vira dívida.' : ' Sobram ' + f.inteiro(i.resultadoApos) + ': sem folga para imprevistos ou investimento.'),
          acoes: ['Decida conscientemente: reduzir a retirada por um tempo, aumentar a margem ou cortar despesas fixas. Deixar como está consome o caixa.',
            'Defina a retirada como uma porcentagem do resultado do mês anterior, para ela se ajustar sozinha.',
            'Revise a rentabilidade dos itens e o preço antes de mexer na retirada: costuma ser onde mais rende.'],
        };
      } },

    { id: 'item_lider', dim: 'D2', peso: 1.1, seg: ['alimentacao'],
      quando: function (c) { var i = c.ind; return (i.ptsItem !== null && i.ptsItem <= 1.5) ? (3 - i.ptsItem) / 3 : 0; },
      texto: function (c) {
        var i = c.ind, f = c.fmt;
        return {
          titulo: 'Rever o preço ou a receita do item que mais vende',
          porque: 'O item mais vendido deixa ' + f.pct(i.itemMargem) + ' de margem (vende por ' + f.inteiro(i.itemP) + ' e custa ' + f.inteiro(i.itemC) + '), abaixo da referência de ' + f.pct(i.limMargem[1]) + '. Como ele é o que mais sai, o efeito no resultado é grande.',
          acoes: ['Teste um reajuste pequeno de preço neste item e acompanhe por duas semanas se a venda se mantém.',
            'Reveja a receita: porção, ingrediente mais caro, embalagem.',
            'Cotize os 3 ingredientes mais caros dele com outro fornecedor.'],
        };
      } },

    { id: 'ocupacao', dim: 'D2', peso: 1.2, seg: ['saude', 'estetica'],
      quando: function (c) { var i = c.ind; return (i.ptsOcup !== null && i.ptsOcup <= 1.5) ? (3 - i.ptsOcup) / 3 : 0; },
      texto: function (c) {
        var i = c.ind, f = c.fmt;
        return {
          titulo: 'Aumentar a ocupação da agenda',
          porque: 'A agenda está ' + f.pct(i.ocupacao) + ' ocupada.' + (i.perdaFaltas !== null ? ' Só as faltas e cancelamentos custam cerca de ' + f.inteiro(i.perdaFaltas) + ' por mês.' : '') + ' Horário vazio tem custo fixo e não gera receita.',
          acoes: ['Mapeie os dias e horários que mais ficam vazios e concentre ações neles (retorno de clientes antigos, horários promocionais, lista de espera).',
            'Confirme os atendimentos com antecedência e tenha regra clara para falta e cancelamento.',
            'Acompanhe a ocupação toda semana: é o seu principal número de capacidade.'],
        };
      } },

    { id: 'estoque_dias', dim: 'D1', peso: 1.1, seg: ['comercio'],
      quando: function (c) { var i = c.ind; return (i.ptsEstoque !== null && i.ptsEstoque <= 1.5) ? (3 - i.ptsEstoque) / 3 : 0; },
      texto: function (c) {
        var i = c.ind;
        return {
          titulo: 'Reduzir o dinheiro parado em estoque',
          porque: 'O estoque equivale a cerca de ' + Math.round(i.diasEstoque) + ' dias de compras. Esse dinheiro poderia estar no caixa, pagando contas ou virando mercadoria que gira mais rápido.',
          acoes: ['Liste o que está parado há mais de 90 dias e faça promoções ou combos para girar.',
            'Reduza a compra dos itens de baixo giro e reponha em lotes menores.',
            'Defina uma meta de dias de estoque e acompanhe todo mês.'],
        };
      } },

    { id: 'ciclo_caixa', dim: 'D3', peso: 1,
      quando: function (c) { var i = c.ind; return (i.ptsCiclo !== null && i.ptsCiclo <= 1.5) ? (3 - i.ptsCiclo) / 3 : 0; },
      texto: function (c) {
        var i = c.ind, f = c.fmt;
        return {
          titulo: 'Encurtar o intervalo entre pagar e receber',
          porque: 'O dinheiro das vendas entra em cerca de ' + (i.ciclo + ' dias a mais do que o prazo que você tem para pagar fornecedores') + (i.capitalGiro !== null ? ': o caixa precisa financiar cerca de ' + f.inteiro(i.capitalGiro) + ' nesse intervalo' : '') + '.',
          acoes: ['Negocie prazo maior com os principais fornecedores (ou pague quando vencer, não antes).',
            'Ofereça um pequeno desconto para pagamento à vista ou via Pix.',
            'Avalie antecipar recebíveis só quando o custo for menor que o de ficar sem caixa.'],
        };
      } },

    { id: 'valor_hora', dim: 'D2', peso: 1.4, seg: ['servicos'],
      quando: function (c) { var i = c.ind; return (i.ptsHora !== null && i.ptsHora <= 1.5) ? (3 - i.ptsHora) / 3 : 0; },
      texto: function (c) {
        var i = c.ind, f = c.fmt;
        return {
          titulo: 'Reajustar o valor da hora (ou vender mais horas)',
          porque: 'Cada hora custa cerca de ' + f.inteiro(i.custoHora) + ' (despesas, custos, impostos e a sua retirada) e você cobra ' + f.inteiro(i.valorHora) + ': margem de ' + f.pct(i.margemHora) + '.',
          acoes: ['Reajuste o valor das novas propostas até a hora cobrir o custo com margem.',
            'Para clientes antigos, combine reajuste anual por índice.',
            'Aumente as horas vendidas: reduza o tempo gasto com administrativo e propostas que não fecham.'],
        };
      } },

    { id: 'receber_aberto', dim: 'D3', peso: 0.9, seg: ['servicos'],
      quando: function (c) { var i = c.ind; return (i.diasReceber !== null && i.diasReceber >= 45) ? (i.diasReceber >= 60 ? 0.8 : 0.6) : 0; },
      texto: function (c) {
        var i = c.ind, f = c.fmt;
        return {
          titulo: 'Cobrar o que já foi entregue',
          porque: 'Há ' + f.inteiro(i.receberAberto) + ' a receber, o equivalente a cerca de ' + Math.round(i.diasReceber) + ' dias de faturamento parados na mão dos clientes.',
          acoes: ['Liste quem deve, quanto e desde quando, e comece pelos maiores e mais antigos.',
            'Defina rotina de cobrança (lembrete antes do vencimento, contato no dia, nova cobrança em poucos dias).',
            'Nas próximas vendas, peça entrada ou parcele em etapas de entrega.'],
        };
      } },

    /* ---------------------------------------------------------------- quando quase tudo vai bem */
    { id: 'evoluir', dim: 'D6', peso: 0.5,
      quando: function () { return 0.15; },
      texto: function () {
        return {
          titulo: 'Transformar o controle em decisão',
          porque: 'Com a base organizada, o próximo passo é usar os números para decidir: o que vende mais e deixa mais margem, onde investir e quanto crescer.',
          acoes: ['Escolha 3 a 5 indicadores e acompanhe todo mês no mesmo formato.',
            'Defina metas por indicador e revise a cada trimestre.',
            'Simule cenários (mais vendas, custo maior, novo investimento) antes de decidir.'],
        };
      } },
  ];
})(typeof window !== 'undefined' ? window : globalThis);
