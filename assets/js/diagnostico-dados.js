/* ==========================================================================
   CM Diagnóstico — banco de perguntas.
   Só dados e regras de ramificação; a análise fica em diagnostico-motor.js e as recomendações em diagnostico-recs.js.

   Como ler uma pergunta:
     etapa   1 Perfil · 2 Panorama · 3 Operação do segmento · 4 Organização · 5 Aprofundamento
     se      (r) => boolean — a pergunta só aparece quando for verdadeiro (r = respostas até agora)
     titulo/ajuda/opcoes  texto fixo ou (c) => ... com c = { r, seg } para adaptar ao segmento
     opcoes  { v: valor guardado, t: texto, p: pontos 0–3 (3 = melhor) ou null = não pontua, n: valor numérico estimado }
     pontua  { dim: 'D1'..'D6', analise: 'saude'|'maturidade'|'eficiencia', peso }  — onde a resposta conta na análise
     curto   rótulo curto usado nos "pontos de atenção" do relatório
   "Não sei informar": nas perguntas de prática vale 0 ponto (não saber já é um achado); nas de valor (faturamento,
   custos, despesas) não entra nas contas e vira a recomendação de levantar os números.
   ========================================================================== */
(function (g) {
  'use strict';
  var D = g.CMDiag = g.CMDiag || {};

  D.VERSAO_MODELO = 1;

  D.SEGMENTOS = [
    { id: 'alimentacao', rotulo: 'Alimentação', desc: 'Restaurante, lanchonete, padaria, cafeteria, marmitas, delivery' },
    { id: 'saude', rotulo: 'Saúde', desc: 'Consultório, clínica, psicologia, odontologia, fisioterapia' },
    { id: 'estetica', rotulo: 'Estética e beleza', desc: 'Salão, barbearia, clínica de estética, unhas' },
    { id: 'comercio', rotulo: 'Comércio', desc: 'Loja física, loja virtual, distribuição' },
    { id: 'servicos', rotulo: 'Serviços', desc: 'Consultoria, serviços técnicos, agência, obras e reformas' },
    { id: 'outro', rotulo: 'Outro segmento', desc: 'Nenhum dos anteriores' },
  ];

  D.ETAPAS = [
    { id: 1, nome: 'Perfil', titulo: 'Perfil do negócio', texto: 'Poucas perguntas para entender quem é você e o seu negócio. Com elas, o percurso é adaptado: você só responde o que faz sentido para o seu caso.' },
    { id: 2, nome: 'Panorama', titulo: 'Panorama financeiro', texto: 'Aqui queremos entender a dimensão econômica do negócio, sem exigir uma DRE ou controles contábeis completos. Faixas aproximadas bastam.' },
    { id: 3, nome: 'Operação', titulo: 'Operação e custos do seu segmento', texto: 'Esta etapa investiga como o negócio transforma o que compra em produtos ou serviços vendidos e em receita: onde costuma se perder margem.' },
    { id: 4, nome: 'Organização', titulo: 'Organização e gestão financeira', texto: 'Como o dinheiro é registrado, separado e acompanhado no dia a dia. Não existe resposta certa: queremos a realidade.' },
    { id: 5, nome: 'Aprofundamento', titulo: 'Aprofundamento', texto: 'Com base nas suas respostas, algumas perguntas a mais, só onde faz diferença para o seu caso.' },
    { id: 6, nome: 'Relatório', titulo: 'Seu relatório', texto: '' },
  ];

  /* Seis dimensões avaliadas (cada resposta pontuada alimenta uma delas). */
  D.DIMENSOES = [
    { id: 'D1', nome: 'Controle de custos e insumos', desc: 'Custos de produção, compras e desperdício' },
    { id: 'D2', nome: 'Formação de preços e rentabilidade', desc: 'Margens, custos por produto e precificação' },
    { id: 'D3', nome: 'Fluxo de caixa e liquidez', desc: 'Entradas, saídas e disponibilidade financeira' },
    { id: 'D4', nome: 'Organização financeira', desc: 'Registros, separação patrimonial e retiradas' },
    { id: 'D5', nome: 'Planejamento financeiro', desc: 'Orçamento, previsões e metas' },
    { id: 'D6', nome: 'Gestão e indicadores', desc: 'Acompanhamento periódico dos resultados' },
  ];

  /* Três análises, sempre apresentadas separadas (nunca uma nota única). */
  D.ANALISES = {
    saude: { nome: 'Saúde financeira', desc: 'Indicadores quantitativos estimados: margem de contribuição, ponto de equilíbrio, liquidez e cobertura de despesas.' },
    maturidade: { nome: 'Maturidade de gestão', desc: 'Qualidade dos processos, controles, planejamento e acompanhamento.' },
    eficiencia: { nome: 'Eficiência operacional', desc: 'Características específicas do segmento.' },
  };
  D.EFICIENCIA_DESC = {
    alimentacao: 'Desperdício, estoque, fichas técnicas e custos de produção.',
    saude: 'Precificação do atendimento, agenda, repasses e custos por atendimento.',
    estetica: 'Consumo de produtos, custo por serviço, ocupação da agenda e comissões.',
    comercio: 'Estoque, giro, compras e formação de preço de venda.',
    servicos: 'Custo da hora, rentabilidade por projeto e dependência de clientes.',
    outro: 'Custos diretos e formação de preço.',
  };

  /* Referências de margem de contribuição (1 − custos diretos ÷ faturamento) por segmento: [nota 3, nota 2, nota 1].
     São regras práticas para pequenos negócios, não benchmarks validados: devem ser calibradas com casos reais. */
  D.LIM_MARGEM = {
    alimentacao: [0.62, 0.52, 0.42],
    saude: [0.75, 0.60, 0.45],
    estetica: [0.65, 0.50, 0.35],
    comercio: [0.40, 0.30, 0.20],
    servicos: [0.65, 0.50, 0.35],
    outro: [0.55, 0.40, 0.25],
  };

  /* ------------------------------------------------------------------ utilidades de montagem */
  function O(v, t, p, n) { return { v: v, t: t, p: p === undefined ? null : p, n: n === undefined ? null : n }; }
  var NS = function (p) { return O('ns', 'Não sei informar', p === undefined ? null : p, null); };
  function por(mapa, padrao) { return function (c) { return mapa[c.seg] !== undefined ? mapa[c.seg] : padrao; }; }
  function tem(arr, v) { return Array.isArray(arr) && arr.indexOf(v) !== -1; }
  function eq(r, id, vs) { return vs.indexOf(r[id]) !== -1; }
  var sozinho = function (r) { return r.equipe === 'solo'; };
  var comEquipe = function (r) { return !!r.equipe && r.equipe !== 'solo'; };
  var seg = function (r, s) { return r.segmento === s; };
  D._u = { O: O, tem: tem, eq: eq, sozinho: sozinho, comEquipe: comEquipe };

  var FAIXAS_FAT = [
    O('f1', 'Até R$ 5 mil', null, 2500), O('f2', 'R$ 5 mil a R$ 10 mil', null, 7500), O('f3', 'R$ 10 mil a R$ 20 mil', null, 15000),
    O('f4', 'R$ 20 mil a R$ 40 mil', null, 30000), O('f5', 'Acima de R$ 40 mil', null, 50000), NS(),
  ];
  var FAIXAS_CUSTO = [
    O('c1', 'Até R$ 2 mil', null, 1000), O('c2', 'R$ 2 mil a R$ 5 mil', null, 3500), O('c3', 'R$ 5 mil a R$ 10 mil', null, 7500),
    O('c4', 'R$ 10 mil a R$ 20 mil', null, 15000), O('c5', 'Acima de R$ 20 mil', null, 25000), NS(),
  ];
  var FAIXAS_FIXAS = [
    O('x1', 'Até R$ 1 mil', null, 600), O('x2', 'R$ 1 mil a R$ 2 mil', null, 1500), O('x3', 'R$ 2 mil a R$ 4 mil', null, 3000),
    O('x4', 'R$ 4 mil a R$ 7 mil', null, 5500), O('x5', 'Acima de R$ 7 mil', null, 9000), NS(),
  ];
  var FAIXAS_FOLHA = [
    O('h1', 'Até R$ 2 mil', null, 1000), O('h2', 'R$ 2 mil a R$ 5 mil', null, 3500), O('h3', 'R$ 5 mil a R$ 10 mil', null, 7500),
    O('h4', 'R$ 10 mil a R$ 20 mil', null, 15000), O('h5', 'Acima de R$ 20 mil', null, 25000), NS(),
  ];

  /* Escalas reaproveitadas */
  function escalaCusto(t0, t1, t2, t3) { // como define o preço / sabe o custo
    return [O('a', t0, 3), O('b', t1, 2), O('c', t2, 1), O('d', t3, 0.5), O('ns', 'Não sei calcular', 0)];
  }
  function escalaControle(t0, t1, t2, t3) { // quatro níveis de controle
    return [O('a', t0, 3), O('b', t1, 1.5), O('c', t2, 0.5), O('d', t3, 0)];
  }

  /* ------------------------------------------------------------------ perguntas */
  D.PERGUNTAS = [

    /* ===================== ETAPA 1 — PERFIL ===================== */
    { id: 'segmento', etapa: 1, tipo: 'unica', curto: 'Segmento',
      titulo: 'Qual é o segmento do seu negócio?', ajuda: 'O percurso é adaptado a ele.',
      opcoes: D.SEGMENTOS.map(function (s) { var o = O(s.id, s.rotulo); o.d = s.desc; return o; }) },
    { id: 'tempo', etapa: 1, tipo: 'unica', curto: 'Tempo de atividade', titulo: 'Há quanto tempo o negócio existe?',
      opcoes: [O('t1', 'Menos de 1 ano'), O('t2', '1 a 3 anos'), O('t3', '3 a 5 anos'), O('t4', 'Mais de 5 anos')] },
    { id: 'porte', etapa: 1, tipo: 'unica', curto: 'Porte', titulo: 'Qual é o porte do negócio?',
      ajuda: 'Pela formalização e pelo tamanho. Se tiver dúvida, escolha a opção mais próxima.',
      opcoes: [O('informal', 'Ainda sem CNPJ (informal)'), O('mei', 'MEI'), O('me', 'Microempresa'), O('epp', 'Pequena empresa'), NS()] },
    { id: 'equipe', etapa: 1, tipo: 'unica', curto: 'Equipe', titulo: 'Quantas pessoas trabalham no negócio, além de você?',
      ajuda: 'Considere funcionários, estagiários e colaboradores fixos.',
      opcoes: [O('solo', 'Somente o proprietário'), O('e1', '1 a 3 pessoas'), O('e2', '4 a 10 pessoas'), O('e3', 'Mais de 10 pessoas')] },
    { id: 'modelo', etapa: 1, tipo: 'unica', curto: 'Modelo de atendimento', titulo: 'Como o negócio atende os clientes?',
      opcoes: [O('presencial', 'Presencial'), O('online', 'Online'), O('hibrido', 'Presencial e online'), O('domicilio', 'Itinerante ou a domicílio')] },

    /* ===================== ETAPA 2 — PANORAMA ===================== */
    { id: 'fat', etapa: 2, tipo: 'unica', curto: 'Faturamento', titulo: 'Qual é o faturamento médio mensal do negócio?',
      ajuda: 'Valor total vendido por mês, em média, antes de descontar qualquer despesa.', opcoes: FAIXAS_FAT },
    { id: 'custo', etapa: 2, tipo: 'unica', curto: 'Custos diretos',
      titulo: por({
        alimentacao: 'Quanto você gasta aproximadamente por mês com ingredientes, bebidas e embalagens?',
        saude: 'Quanto você gasta por mês com materiais, insumos, repasses a profissionais e outros custos diretos dos atendimentos?',
        estetica: 'Quanto você gasta por mês com produtos, materiais e comissões dos profissionais?',
        comercio: 'Quanto você gasta por mês na compra de mercadorias para revenda (incluindo embalagens e fretes)?',
        servicos: 'Quanto você gasta por mês com custos diretos dos serviços (materiais, terceiros, comissões e deslocamentos)?',
      }, 'Quanto você gasta por mês com o que é diretamente ligado ao que você vende (matéria-prima, mercadorias, terceiros, comissões)?'),
      ajuda: por({
        alimentacao: 'Considere os gastos diretamente ligados à produção e venda dos alimentos.',
        saude: 'Inclua só o que varia com o número de atendimentos. Aluguel e despesas fixas ficam para a próxima pergunta.',
        estetica: 'Inclua só o que varia com o número de atendimentos. Aluguel e despesas fixas ficam para a próxima pergunta.',
        comercio: 'Considere o custo do que você revende. Aluguel e despesas fixas ficam para a próxima pergunta.',
        servicos: 'Inclua só o que varia com o volume de trabalho. Aluguel e despesas fixas ficam para a próxima pergunta.',
      }, 'Inclua só o que varia com o volume vendido. Aluguel e despesas fixas ficam para a próxima pergunta.'),
      opcoes: FAIXAS_CUSTO },
    { id: 'fixas', etapa: 2, tipo: 'unica', curto: 'Despesas fixas', titulo: 'Quanto são as despesas fixas mensais?',
      ajuda: por({
        alimentacao: 'Aluguel, água, energia, internet, sistemas, contabilidade e outras despesas recorrentes. Não inclua ingredientes e embalagens.',
      }, 'Aluguel, água, energia, internet, sistemas, contabilidade e outras despesas recorrentes. Não inclua os custos diretos da pergunta anterior.'),
      opcoes: FAIXAS_FIXAS },
    { id: 'folha', etapa: 2, tipo: 'unica', curto: 'Folha de pagamento', se: comEquipe,
      titulo: 'Quanto representa, por mês, a folha de pagamento da equipe?',
      ajuda: 'Salários, encargos, benefícios e pró-labore de sócios, se houver. Não inclua a sua própria retirada.',
      opcoes: FAIXAS_FOLHA },
    { id: 'dividas', etapa: 2, tipo: 'unica', curto: 'Dívidas do negócio', titulo: 'O negócio possui dívidas ou parcelas em aberto?',
      pontua: { dim: 'D3', analise: 'saude', peso: 1 },
      opcoes: [O('nao', 'Não', 3), O('ok', 'Sim, em valores que consigo pagar', 2), O('dificil', 'Sim, com dificuldade para pagar', 1), O('atraso', 'Sim, com pagamentos atrasados', 0), NS(0)] },
    { id: 'reserva', etapa: 2, tipo: 'unica', curto: 'Reserva de caixa',
      titulo: 'Se o negócio parasse de vender hoje, por quanto tempo conseguiria pagar suas despesas com o dinheiro disponível?',
      pontua: { dim: 'D3', analise: 'saude', peso: 1.5 },
      opcoes: [O('r0', 'Não conseguiria pagar o próximo mês', 0, 0), O('r1', 'Menos de 1 mês', 0.5, 0.5), O('r2', 'De 1 a 2 meses', 1.5, 1.5),
        O('r3', 'De 3 a 6 meses', 2.5, 4.5), O('r4', 'Mais de 6 meses', 3, 8), NS(0)] },
    { id: 'rec', etapa: 2, tipo: 'multipla', curto: 'Formas de recebimento', titulo: 'Como seus clientes costumam pagar?',
      ajuda: 'Marque todas as formas que você usa.',
      opcoes: function (c) {
        var base = [O('pix', 'Pix'), O('din', 'Dinheiro'), O('deb', 'Cartão de débito'), O('cre', 'Cartão de crédito')];
        var extra = {
          alimentacao: [O('vr', 'Vale-refeição ou alimentação'), O('app', 'Aplicativos de entrega')],
          saude: [O('conv', 'Convênios e planos de saúde'), O('prazo', 'Boleto ou fatura a prazo')],
          estetica: [],
          comercio: [O('app', 'Marketplaces e plataformas de venda'), O('prazo', 'Venda a prazo, fiado ou boleto')],
          servicos: [O('prazo', 'Boleto ou fatura a prazo')],
        }[c.seg] || [O('app', 'Plataformas e aplicativos de venda'), O('prazo', 'Venda a prazo ou boleto')];
        return base.concat(extra);
      } },

    /* ===================== ETAPA 3 — OPERAÇÃO (por segmento) ===================== */
    /* --- Alimentação --- */
    { id: 'al_tipo', etapa: 3, tipo: 'unica', curto: 'Tipo de operação', se: function (r) { return seg(r, 'alimentacao'); },
      titulo: 'Qual é o principal tipo de operação?',
      opcoes: [O('rest', 'Restaurante ou lanchonete'), O('marm', 'Marmitas e refeições prontas'), O('pad', 'Padaria ou confeitaria'), O('caf', 'Cafeteria'),
        O('del', 'Delivery ou cozinha de produção'), O('truck', 'Food truck ou alimentação ambulante'), O('outro', 'Outro')] },
    { id: 'al_estoque', etapa: 3, tipo: 'unica', curto: 'Controle de estoque de ingredientes', se: function (r) { return seg(r, 'alimentacao'); },
      titulo: 'Como você controla o estoque de ingredientes?', pontua: { dim: 'D1', analise: 'eficiencia', peso: 1 },
      opcoes: [O('reg', 'Registro de entradas e saídas', 3), O('cont', 'Contagem periódica, sem registro detalhado', 1.5), O('compras', 'Controle apenas pelas compras', 0.5), O('nenhum', 'Não tenho controle de estoque', 0)] },
    { id: 'al_desperdicio', etapa: 3, tipo: 'unica', curto: 'Acompanhamento do desperdício', se: function (r) { return seg(r, 'alimentacao'); },
      titulo: 'Como você acompanha o desperdício de alimentos?', pontua: { dim: 'D1', analise: 'eficiencia', peso: 1.25 },
      opcoes: [O('reg', 'Registro a quantidade e o custo das perdas', 3), O('perc', 'Percebo as perdas, mas não calculo o custo', 1.5), O('nao', 'Não acompanho sistematicamente', 0.5), NS(0)] },
    { id: 'al_custo_item', etapa: 3, tipo: 'unica', curto: 'Custo de produção de cada item', se: function (r) { return seg(r, 'alimentacao'); },
      titulo: 'Você sabe quanto custa produzir cada item do cardápio?', pontua: { dim: 'D2', analise: 'eficiencia', peso: 1.5 },
      opcoes: [O('ficha', 'Sim, tenho fichas técnicas e custos atualizados', 3), O('aprox', 'Conheço aproximadamente os custos', 2),
        O('conc', 'Defino os preços observando a concorrência', 1), O('intui', 'Defino os preços por experiência ou intuição', 0.5), O('ns', 'Não sei calcular', 0)] },
    { id: 'al_compras', etapa: 3, tipo: 'unica', curto: 'Frequência de compras', se: function (r) { return seg(r, 'alimentacao'); },
      titulo: 'Com que frequência você compra ingredientes e insumos?',
      opcoes: [O('dia', 'Diariamente'), O('sem2', 'Algumas vezes por semana'), O('sem', 'Semanalmente'), O('quinz', 'Quinzenalmente'), O('mes', 'Mensalmente ou conforme a necessidade')] },

    /* --- Saúde --- */
    { id: 'sa_tipo', etapa: 3, tipo: 'unica', curto: 'Tipo de operação', se: function (r) { return seg(r, 'saude'); },
      titulo: 'Qual é o formato do seu atendimento?',
      opcoes: [O('indiv', 'Consultório individual'), O('clinica', 'Clínica com mais de um profissional'), O('online', 'Atendimento online ou domiciliar'), O('outro', 'Outro')] },
    { id: 'sa_custos', etapa: 3, tipo: 'unica', curto: 'Custos variáveis por atendimento', se: function (r) { return seg(r, 'saude'); },
      titulo: 'Você acompanha os custos que variam com cada atendimento (materiais, taxas, repasses)?', pontua: { dim: 'D1', analise: 'eficiencia', peso: 1 },
      opcoes: escalaControle('Sim, registro e acompanho por atendimento ou por mês', 'Tenho uma estimativa geral', 'Só olho quando o valor chama atenção', 'Não acompanho') },
    { id: 'sa_preco', etapa: 3, tipo: 'unica', curto: 'Valor mínimo do atendimento', se: function (r) { return seg(r, 'saude'); },
      titulo: 'Você sabe o valor mínimo de cada atendimento para cobrir os custos e a sua retirada?', pontua: { dim: 'D2', analise: 'eficiencia', peso: 1.5 },
      opcoes: escalaCusto('Sim, calculado com custos e retirada', 'Conheço aproximadamente', 'Sigo a tabela da região ou dos colegas', 'Defino por experiência ou intuição') },
    { id: 'sa_agenda', etapa: 3, tipo: 'unica', curto: 'Faltas e agenda ociosa', se: function (r) { return seg(r, 'saude'); },
      titulo: 'Como você acompanha faltas, cancelamentos e horários ociosos da agenda?', pontua: { dim: 'D2', analise: 'eficiencia', peso: 1 },
      opcoes: [O('a', 'Registro e sei quanto isso custa por mês', 3), O('b', 'Registro as faltas, mas não calculo o impacto', 2), O('c', 'Percebo, mas não acompanho', 1), O('d', 'Não acompanho', 0)] },
    { id: 'sa_repasse', etapa: 3, tipo: 'unica', curto: 'Regras de repasse', se: function (r) { return seg(r, 'saude') && comEquipe(r); },
      titulo: 'Como são calculados os repasses ou comissões dos profissionais?', pontua: { dim: 'D1', analise: 'eficiencia', peso: 1 },
      opcoes: escalaControle('Regras definidas, calculadas em planilha ou sistema', 'Regras combinadas, mas calculadas manualmente', 'Combinado informalmente, sem registro', 'Não tenho repasses definidos') },

    /* --- Estética e beleza --- */
    { id: 'es_tipo', etapa: 3, tipo: 'unica', curto: 'Tipo de operação', se: function (r) { return seg(r, 'estetica'); },
      titulo: 'Qual é o principal tipo de negócio?',
      opcoes: [O('salao', 'Salão de beleza'), O('barbearia', 'Barbearia'), O('clinica', 'Clínica de estética'), O('unhas', 'Manicure e unhas'), O('estudio', 'Estúdio ou spa'), O('outro', 'Outro')] },
    { id: 'es_produtos', etapa: 3, tipo: 'unica', curto: 'Controle do consumo de produtos', se: function (r) { return seg(r, 'estetica'); },
      titulo: 'Como você controla o consumo de produtos e materiais?', pontua: { dim: 'D1', analise: 'eficiencia', peso: 1 },
      opcoes: [O('reg', 'Registro o consumo por serviço', 3), O('est', 'Faço contagem periódica do estoque', 2), O('compras', 'Controlo apenas pelas compras', 1), O('nenhum', 'Não tenho controle', 0)] },
    { id: 'es_preco', etapa: 3, tipo: 'unica', curto: 'Custo de cada serviço', se: function (r) { return seg(r, 'estetica'); },
      titulo: 'Você sabe quanto custa realizar cada serviço (produtos, tempo e estrutura)?', pontua: { dim: 'D2', analise: 'eficiencia', peso: 1.5 },
      opcoes: escalaCusto('Sim, calculado e atualizado', 'Conheço aproximadamente', 'Defino o preço olhando a concorrência', 'Defino por experiência ou intuição') },
    { id: 'es_agenda', etapa: 3, tipo: 'unica', curto: 'Ocupação da agenda e faltas', se: function (r) { return seg(r, 'estetica'); },
      titulo: 'Você acompanha a ocupação da agenda e as faltas?', pontua: { dim: 'D2', analise: 'eficiencia', peso: 1 },
      opcoes: [O('a', 'Sim, medindo a ocupação e o custo das faltas', 3), O('b', 'Acompanho as faltas, sem medir o impacto', 2), O('c', 'Percebo, mas não acompanho', 1), O('d', 'Não acompanho', 0)] },
    { id: 'es_comissao', etapa: 3, tipo: 'unica', curto: 'Cálculo de comissões', se: function (r) { return seg(r, 'estetica') && comEquipe(r); },
      titulo: 'Como você calcula as comissões ou parcerias com os profissionais?', pontua: { dim: 'D1', analise: 'eficiencia', peso: 1 },
      opcoes: escalaControle('Regras definidas, calculadas em planilha ou sistema', 'Regras combinadas, mas calculadas manualmente', 'Combinado informalmente, sem registro', 'Não tenho comissões definidas') },
    { id: 'es_pacotes', etapa: 3, tipo: 'unica', curto: 'Venda de pacotes', se: function (r) { return seg(r, 'estetica'); },
      titulo: 'Você vende pacotes ou serviços pagos antecipadamente?',
      opcoes: [O('sim', 'Sim'), O('nao', 'Não')] },

    /* --- Comércio --- */
    { id: 'co_tipo', etapa: 3, tipo: 'unica', curto: 'Tipo de operação', se: function (r) { return seg(r, 'comercio'); },
      titulo: 'Como o negócio vende?',
      opcoes: [O('fisica', 'Loja física'), O('virtual', 'Loja virtual'), O('ambas', 'Loja física e virtual'), O('atacado', 'Atacado ou distribuição'), O('redes', 'Marketplaces e redes sociais'), O('outro', 'Outro')] },
    { id: 'co_estoque', etapa: 3, tipo: 'unica', curto: 'Controle de estoque', se: function (r) { return seg(r, 'comercio'); },
      titulo: 'Como você controla o estoque de mercadorias?', pontua: { dim: 'D1', analise: 'eficiencia', peso: 1.25 },
      opcoes: [O('reg', 'Registro de entradas e saídas, em sistema ou planilha', 3), O('cont', 'Contagens periódicas e conferência', 2), O('compras', 'Controle apenas pelas compras', 1), O('nenhum', 'Não tenho controle de estoque', 0)] },
    { id: 'co_giro', etapa: 3, tipo: 'unica', curto: 'Produtos parados', se: function (r) { return seg(r, 'comercio'); },
      titulo: 'Você acompanha quais produtos estão parados ou vendem pouco?', pontua: { dim: 'D1', analise: 'eficiencia', peso: 1 },
      opcoes: [O('a', 'Sim, regularmente, com relatório de giro', 3), O('b', 'Sei de cabeça, sem relatório', 1.5), O('c', 'Só percebo quando falta espaço', 0.5), O('d', 'Não acompanho', 0)] },
    { id: 'co_compras', etapa: 3, tipo: 'unica', curto: 'Planejamento das compras', se: function (r) { return seg(r, 'comercio'); },
      titulo: 'Como você decide o que e quanto comprar?', pontua: { dim: 'D1', analise: 'eficiencia', peso: 1 },
      opcoes: [O('a', 'Planejo com base nas vendas e no estoque', 3), O('b', 'Reponho o que acabou', 1.5), O('c', 'Compro conforme ofertas e oportunidades dos fornecedores', 0.5), O('d', 'Compro por intuição, sem critério', 0)] },
    { id: 'co_preco', etapa: 3, tipo: 'unica', curto: 'Formação do preço de venda', se: function (r) { return seg(r, 'comercio'); },
      titulo: 'Como você define o preço de venda?', pontua: { dim: 'D2', analise: 'eficiencia', peso: 1.5 },
      opcoes: [O('a', 'Margem calculada por produto, considerando custos, impostos e taxas', 3), O('b', 'Uma margem padrão para todos os produtos', 2), O('c', 'Observando a concorrência', 1), O('d', 'Por experiência ou intuição', 0.5), O('ns', 'Não sei calcular', 0)] },

    /* --- Serviços --- */
    { id: 'se_tipo', etapa: 3, tipo: 'unica', curto: 'Tipo de operação', se: function (r) { return seg(r, 'servicos'); },
      titulo: 'Qual é o principal tipo de serviço?',
      opcoes: [O('consult', 'Consultoria e serviços profissionais'), O('tecnico', 'Serviços técnicos e manutenção'), O('agencia', 'Agência, marketing ou tecnologia'), O('obras', 'Obras e reformas'), O('educ', 'Educação e treinamento'), O('outro', 'Outro')] },
    { id: 'se_cobranca', etapa: 3, tipo: 'unica', curto: 'Modelo de cobrança', se: function (r) { return seg(r, 'servicos'); },
      titulo: 'Como você cobra pelos serviços?',
      opcoes: [O('hora', 'Por hora'), O('projeto', 'Por projeto ou contrato fechado'), O('mensal', 'Mensalidade recorrente'), O('misto', 'Um pouco de cada')] },
    { id: 'se_custo_hora', etapa: 3, tipo: 'unica', curto: 'Custo da hora ou do projeto', se: function (r) { return seg(r, 'servicos'); },
      titulo: 'Você sabe quanto custa uma hora (ou um projeto) para você, incluindo despesas e sua retirada?', pontua: { dim: 'D2', analise: 'eficiencia', peso: 1.5 },
      opcoes: escalaCusto('Sim, calculado e atualizado', 'Conheço aproximadamente', 'Cobro o que o mercado costuma pagar', 'Defino por experiência ou intuição') },
    { id: 'se_projeto', etapa: 3, tipo: 'unica', curto: 'Rentabilidade por projeto', se: function (r) { return seg(r, 'servicos'); },
      titulo: 'Você registra o tempo e os custos de cada projeto ou cliente para saber se deu lucro?', pontua: { dim: 'D1', analise: 'eficiencia', peso: 1 },
      opcoes: [O('a', 'Sim, em todos', 3), O('b', 'Em alguns, ou por estimativa', 1.5), O('c', 'Só vejo o resultado geral no fim do mês', 0.5), O('d', 'Não registro', 0)] },
    { id: 'se_concentracao', etapa: 3, tipo: 'unica', curto: 'Dependência de um cliente', se: function (r) { return seg(r, 'servicos'); },
      titulo: 'Quanto do faturamento vem do seu maior cliente?', pontua: { dim: 'D3', analise: 'saude', peso: 1 },
      opcoes: [O('a', 'Menos de 20%', 3), O('b', 'De 20% a 40%', 2), O('c', 'De 40% a 60%', 1), O('d', 'Mais de 60%', 0), NS(0)] },

    /* --- Outro segmento --- */
    { id: 'ou_tipo', etapa: 3, tipo: 'texto', curto: 'O que o negócio vende', se: function (r) { return seg(r, 'outro'); },
      titulo: 'Em poucas palavras, o que o seu negócio vende?', ajuda: 'Opcional. Ajuda a CM a entender o seu caso.', opcional: true },
    { id: 'ou_custos', etapa: 3, tipo: 'unica', curto: 'Acompanhamento dos custos diretos', se: function (r) { return seg(r, 'outro'); },
      titulo: 'Você acompanha os custos diretos do que vende, separados das despesas fixas?', pontua: { dim: 'D1', analise: 'eficiencia', peso: 1 },
      opcoes: escalaControle('Sim, todo mês', 'Tenho uma estimativa geral', 'Só olho quando o dinheiro aperta', 'Não acompanho') },
    { id: 'ou_preco', etapa: 3, tipo: 'unica', curto: 'Formação de preços', se: function (r) { return seg(r, 'outro'); },
      titulo: 'Como você define os preços?', pontua: { dim: 'D2', analise: 'eficiencia', peso: 1.5 },
      opcoes: escalaCusto('Calculado a partir dos custos e da margem desejada', 'Conheço aproximadamente os custos', 'Observando a concorrência', 'Por experiência ou intuição') },

    /* ===================== ETAPA 4 — ORGANIZAÇÃO ===================== */
    { id: 'org_separa', etapa: 4, tipo: 'unica', curto: 'Separação entre pessoal e negócio',
      titulo: 'Você separa o dinheiro pessoal do dinheiro do negócio?', pontua: { dim: 'D4', analise: 'maturidade', peso: 1 },
      opcoes: [O('sim', 'Sim, completamente', 3), O('parc', 'Tenho contas separadas, mas às vezes misturo os valores', 1.5), O('nao', 'Não, utilizo o mesmo dinheiro', 0)] },
    { id: 'org_registro', etapa: 4, tipo: 'unica', curto: 'Registro de vendas e despesas',
      titulo: 'Como você registra as vendas e despesas?', pontua: { dim: 'D4', analise: 'maturidade', peso: 1 },
      opcoes: [O('sis', 'Sistema de gestão ou software financeiro', 3), O('plan', 'Planilha', 2), O('caderno', 'Caderno ou anotações', 1), O('extrato', 'Extratos bancários e comprovantes', 0.5), O('nao', 'Não registro regularmente', 0)] },
    { id: 'org_contas', etapa: 4, tipo: 'unica', curto: 'Acompanhamento de contas a pagar e a receber',
      titulo: 'Como você acompanha o que tem a pagar e a receber nos próximos dias?', pontua: { dim: 'D3', analise: 'maturidade', peso: 1.5 },
      opcoes: [O('a', 'Calendário ou lista de vencimentos atualizada', 3), O('b', 'Anoto os principais vencimentos, sem rotina fixa', 1.5), O('c', 'Guardo de cabeça e confiro pelo extrato do banco', 0.5), O('d', 'Frequentemente sou surpreendido por contas', 0)] },
    { id: 'org_retirada', etapa: 4, tipo: 'unica', curto: 'Retirada mensal do proprietário',
      titulo: 'Você define um valor mensal para retirar do negócio como remuneração pessoal?', pontua: { dim: 'D4', analise: 'maturidade', peso: 1 },
      opcoes: [O('def', 'Sim, tenho um valor definido', 3), O('nec', 'Faço retiradas conforme a necessidade', 1.5), O('sobra', 'Retiro o que sobra', 1), O('nao', 'Não tenho uma retirada organizada', 0)] },
    { id: 'org_lucro', etapa: 4, tipo: 'unica', curto: 'Conhecimento do lucro mensal',
      titulo: 'Você consegue identificar quanto o negócio realmente lucra por mês?', pontua: { dim: 'D6', analise: 'maturidade', peso: 1.5 },
      opcoes: [O('sim', 'Sim, com base em controles atualizados', 3), O('est', 'Tenho uma estimativa', 1.5), O('sobra', 'Sei apenas quanto sobra na conta', 0.5), O('nao', 'Não consigo identificar', 0)] },
    { id: 'org_planejamento', etapa: 4, tipo: 'unica', curto: 'Previsão do mês e metas',
      titulo: 'Você faz uma previsão do mês (quanto vai vender, gastar e sobrar) ou define metas de faturamento?', pontua: { dim: 'D5', analise: 'maturidade', peso: 1 },
      opcoes: [O('a', 'Sim, defino previsão e metas e comparo com o realizado', 3), O('b', 'Tenho metas e previsões informais, na cabeça', 1.5), O('c', 'Só planejo quando há uma despesa grande', 0.5), O('d', 'Não planejo', 0)] },
    { id: 'org_invest', etapa: 4, tipo: 'unica', curto: 'Análise de investimentos',
      titulo: 'Antes de uma compra grande ou investimento (equipamento, reforma, contratação), você avalia o impacto no caixa?', pontua: { dim: 'D5', analise: 'maturidade', peso: 0.75 },
      opcoes: [O('a', 'Sempre, faço as contas e simulo os próximos meses', 3), O('b', 'Às vezes', 1.5), O('c', 'Decido pela necessidade ou oportunidade', 0.5), O('d', 'Não avalio', 0)] },
    { id: 'org_acomp', etapa: 4, tipo: 'unica', curto: 'Frequência de análise dos resultados',
      titulo: 'Com que frequência você analisa os resultados financeiros do negócio?', pontua: { dim: 'D6', analise: 'maturidade', peso: 1 },
      opcoes: [O('sem', 'Toda semana', 3), O('mes', 'Uma vez por mês', 2.5), O('raro', 'Poucas vezes por ano', 0.5), O('falta', 'Só quando falta dinheiro', 0.5), O('nunca', 'Nunca', 0)] },

    /* ===================== ETAPA 5 — APROFUNDAMENTO (condicional) ===================== */
    { id: 'dv_app_pct', etapa: 5, tipo: 'unica', curto: 'Peso dos aplicativos nas vendas', se: function (r) { return tem(r.rec, 'app'); },
      titulo: por({ comercio: 'Qual percentual das vendas vem dos marketplaces e plataformas?' }, 'Qual percentual das vendas vem dos aplicativos?'),
      opcoes: [O('p1', 'Menos de 20%', null, 0.10), O('p2', 'De 20% a 40%', null, 0.30), O('p3', 'De 40% a 60%', null, 0.50), O('p4', 'Mais de 60%', null, 0.75), NS()] },
    { id: 'dv_app_taxa', etapa: 5, tipo: 'unica', curto: 'Taxa cobrada pelos aplicativos', se: function (r) { return tem(r.rec, 'app'); },
      titulo: por({ comercio: 'Qual é, em média, a taxa total cobrada pelos marketplaces e plataformas?' }, 'Qual é, em média, a taxa total cobrada pelos aplicativos?'),
      ajuda: 'Some comissão, taxa de entrega e de pagamento, se houver.',
      opcoes: [O('t1', 'Até 12%', null, 0.10), O('t2', 'De 12% a 20%', null, 0.16), O('t3', 'De 20% a 30%', null, 0.25), O('t4', 'Mais de 30%', null, 0.33), NS()] },
    { id: 'dv_app_preco', etapa: 5, tipo: 'unica', curto: 'Taxa dos aplicativos no preço', se: function (r) { return tem(r.rec, 'app'); },
      titulo: 'Essa taxa está considerada no preço que você pratica nos aplicativos?', pontua: { dim: 'D2', analise: 'eficiencia', peso: 1 },
      opcoes: [O('a', 'Sim, o preço já embute a taxa', 3), O('b', 'Pratico o mesmo preço do balcão, sem embutir a taxa', 1), O('c', 'Não sei se o preço cobre a taxa', 0)] },
    { id: 'dv_cartao', etapa: 5, tipo: 'unica', curto: 'Taxas e prazos do cartão no controle',
      se: function (r) { return tem(r.rec, 'deb') || tem(r.rec, 'cre') || tem(r.rec, 'vr'); },
      titulo: 'Você considera as taxas e os prazos de recebimento das maquininhas no controle financeiro?', pontua: { dim: 'D3', analise: 'maturidade', peso: 0.75 },
      opcoes: [O('a', 'Sim, considero taxas e prazos', 3), O('b', 'Considero só as taxas', 2), O('c', 'Considero só os prazos', 1.5), O('d', 'Não considero: olho o valor vendido', 0), O('ns', 'Não sei quanto pago de taxas', 0)] },
    { id: 'dv_estoque_freq', etapa: 5, tipo: 'unica', curto: 'Conferência do valor em estoque',
      se: function (r) {
        return (seg(r, 'alimentacao') && r.al_estoque && r.al_estoque !== 'nenhum') || (seg(r, 'comercio') && r.co_estoque && r.co_estoque !== 'nenhum')
          || (seg(r, 'estetica') && r.es_produtos && r.es_produtos !== 'nenhum');
      },
      titulo: por({ alimentacao: 'Com que frequência você confere o valor dos ingredientes armazenados?', comercio: 'Com que frequência você confere o valor das mercadorias em estoque?' }, 'Com que frequência você confere o valor dos produtos armazenados?'),
      pontua: { dim: 'D1', analise: 'eficiencia', peso: 0.75 },
      opcoes: [O('a', 'Toda semana ou mais', 3), O('b', 'Todo mês', 2), O('c', 'Poucas vezes por ano', 1), O('d', 'Nunca', 0)] },
    { id: 'dv_perdas', etapa: 5, tipo: 'unica', curto: 'Custo mensal das perdas',
      se: function (r) { return seg(r, 'alimentacao') && eq(r, 'al_desperdicio', ['perc', 'nao', 'ns']); },
      titulo: 'Você consegue estimar o custo mensal das perdas?', ajuda: 'Pense em tudo que é descartado: sobras, validade vencida e erros de preparo.',
      pontua: { dim: 'D1', analise: 'eficiencia', peso: 0.75 },
      opcoes: [O('p1', 'Sim: até R$ 500 por mês', 2.5, 250), O('p2', 'Sim: de R$ 500 a R$ 1.500 por mês', 2.5, 1000), O('p3', 'Sim: mais de R$ 1.500 por mês', 2.5, 2000),
        O('p4', 'Tenho uma ideia, mas sem números', 1), O('p5', 'Não faço ideia', 0)] },
    { id: 'dv_fichas', etapa: 5, tipo: 'unica', curto: 'Receitas e fichas técnicas',
      se: function (r) { return seg(r, 'alimentacao') && eq(r, 'al_custo_item', ['conc', 'intui', 'ns']); },
      titulo: 'Você possui receitas ou fichas técnicas com as quantidades de ingredientes?', pontua: { dim: 'D2', analise: 'eficiencia', peso: 0.75 },
      opcoes: [O('a', 'Sim, para todos os itens', 2.5), O('b', 'Para alguns itens', 1.5), O('c', 'Só de cabeça, sem registro', 0.5), O('d', 'Não', 0)] },
    { id: 'dv_convenio', etapa: 5, tipo: 'unica', curto: 'Controle de convênios, glosas e prazos', se: function (r) { return tem(r.rec, 'conv'); },
      titulo: 'Como você controla o que cada convênio deve pagar, incluindo glosas (recusas) e prazos?', pontua: { dim: 'D3', analise: 'maturidade', peso: 0.75 },
      opcoes: [O('a', 'Controle por convênio, com glosas e prazos', 3), O('b', 'Controle simples do valor a receber', 1.5), O('c', 'Só vejo quando o dinheiro entra', 0)] },
    { id: 'dv_pacotes', etapa: 5, tipo: 'unica', curto: 'Controle do saldo de pacotes', se: function (r) { return seg(r, 'estetica') && r.es_pacotes === 'sim'; },
      titulo: 'Como você controla o saldo e os serviços ainda a prestar desses pacotes?', pontua: { dim: 'D3', analise: 'maturidade', peso: 0.75 },
      opcoes: [O('a', 'Registro por cliente, com baixa a cada atendimento', 3), O('b', 'Anotações soltas', 1), O('c', 'Não controlo', 0)] },
    { id: 'dv_receber', etapa: 5, tipo: 'unica', curto: 'Acompanhamento de recebíveis e atrasos',
      se: function (r) { return tem(r.rec, 'prazo') || seg(r, 'servicos'); },
      titulo: 'Como você acompanha o que tem a receber de clientes e os atrasos?', pontua: { dim: 'D3', analise: 'maturidade', peso: 1 },
      opcoes: [O('a', 'Controle com vencimentos e rotina de cobrança', 3), O('b', 'Controle simples, sem rotina de cobrança', 2), O('c', 'Só percebo quando o dinheiro não entra', 0.5), O('d', 'Não controlo', 0)] },
    { id: 'dv_parcela', etapa: 5, tipo: 'unica', curto: 'Valor das parcelas mensais', se: function (r) { return !!r.dividas && r.dividas !== 'nao'; },
      titulo: 'Qual o valor aproximado das parcelas de dívidas que você paga por mês?',
      opcoes: [O('a', 'Até R$ 500', null, 250), O('b', 'De R$ 500 a R$ 1.500', null, 1000), O('c', 'De R$ 1.500 a R$ 3.000', null, 2250),
        O('d', 'De R$ 3.000 a R$ 6.000', null, 4500), O('e', 'Mais de R$ 6.000', null, 8000), NS()] },
    { id: 'dv_saldo', etapa: 5, tipo: 'unica', curto: 'Saldo devedor aproximado', se: function (r) { return !!r.dividas && r.dividas !== 'nao'; },
      titulo: 'E o saldo devedor total, aproximadamente?',
      opcoes: [O('a', 'Até R$ 5 mil', null, 2500), O('b', 'De R$ 5 mil a R$ 20 mil', null, 12500), O('c', 'De R$ 20 mil a R$ 50 mil', null, 35000), O('d', 'Mais de R$ 50 mil', null, 70000), NS()] },
  ];


  /* ===================== MODO PRECISO =====================
     r.modo === 'preciso': as perguntas de faixa viram campos de valor (R$, %, dias, horas) e entram perguntas mais
     detalhadas. Quem não sabe o valor exato usa "escolher uma faixa" (r._faixa[idDoValor] = true), que volta à pergunta de
     faixa correspondente. Os valores podem vir de um extrato importado (r._pre, r._origem) e continuam editáveis. */
  function preciso(r) { return r.modo === 'preciso'; }
  function emFaixa(r, id) { return !!(r._faixa && r._faixa[id]); }
  D._u.preciso = preciso;
  var iA = function (id) { for (var i = 0; i < D.PERGUNTAS.length; i++) if (D.PERGUNTAS[i].id === id) return i; return -1; };

  /* cria idValor logo depois de idFaixa e esconde a pergunta de faixa enquanto o modo for preciso */
  function par(idFaixa, idValor, cfg) {
    var i = iA(idFaixa), qf = D.PERGUNTAS[i], seF = qf.se || function () { return true; };
    qf.se = function (r) { return seF(r) && (!preciso(r) || emFaixa(r, idValor)); };
    var qv = {
      id: idValor, etapa: qf.etapa, tipo: 'valor', unidade: cfg.unidade || 'R$', curto: qf.curto, faixaDe: idFaixa, textoFaixa: cfg.textoFaixa || 'Não sei o valor exato: escolher uma faixa',
      titulo: cfg.titulo || qf.titulo, ajuda: cfg.ajuda !== undefined ? cfg.ajuda : qf.ajuda, max: cfg.max || 1e8,
      se: function (r) { return seF(r) && preciso(r) && !emFaixa(r, idValor); },
    };
    D.PERGUNTAS.splice(i + 1, 0, qv);
  }
  /* pergunta nova, só no modo preciso, inserida depois de idAntes; se(r) refina quando aparece; opcional = pode pular */
  function nova(idAntes, q) {
    var se = q.se || function () { return true; };
    q.tipo = 'valor'; q.unidade = q.unidade || 'R$'; q.max = q.max || 1e8;
    q.se = function (r) { return preciso(r) && se(r); };
    D.PERGUNTAS.splice(iA(idAntes) + 1, 0, q);
  }
  var NOUN = { alimentacao: 'pedido ou venda', saude: 'atendimento', estetica: 'atendimento', comercio: 'venda', servicos: 'cliente ou projeto atendido', outro: 'venda' };
  var h = function (a, b) { return function (r) { return a.indexOf(r.segmento) !== -1 && (!b || b(r)); }; };

  /* --- etapa 2: valores exatos no lugar das faixas --- */
  par('fat', 'fat_v', { ajuda: 'Total vendido por mês, em média, nos últimos meses. Se você importou um extrato, já preenchemos: pode corrigir.' });
  par('custo', 'custo_v', {});
  par('fixas', 'fixas_v', {});
  par('folha', 'folha_v', {});
  par('reserva', 'saldo_v', {
    titulo: 'Quanto há disponível hoje, em caixa e nas contas do negócio?', ajuda: 'Some o saldo das contas e o dinheiro em caixa. Não inclua aplicações de longo prazo nem dinheiro pessoal.',
    textoFaixa: 'Prefiro dizer por quanto tempo o dinheiro dura',
  });
  nova('fat_v', { id: 'px_vendas', etapa: 2, curto: 'Vendas por mês', unidade: 'un', opcional: true, max: 1e6,
    titulo: function (c) { return 'Em média, quantos ' + ({ alimentacao: 'pedidos ou vendas', saude: 'atendimentos', estetica: 'atendimentos', comercio: 'vendas', servicos: 'clientes ou projetos' }[c.seg] || 'vendas') + ' o negócio faz por mês?'; },
    ajuda: 'Um número aproximado já serve: com ele calculamos o ticket médio e quanto é preciso vender para empatar.' });
  nova('px_vendas', { id: 'px_dias', etapa: 2, curto: 'Dias de funcionamento', unidade: 'dias', opcional: true, max: 31,
    titulo: 'Quantos dias por mês o negócio funciona, em média?', ajuda: 'Para transformar a meta do mês em uma meta por dia.' });
  nova('folha_v', { id: 'impostos_v', etapa: 2, curto: 'Impostos por mês', opcional: true,
    titulo: 'Quanto o negócio paga de impostos por mês, em média?', ajuda: 'DAS do Simples, DAS-MEI, ISS e outros tributos. Pode deixar em branco se não souber.' });
  nova('impostos_v', { id: 'retirada_v', etapa: 2, curto: 'Retirada do proprietário', opcional: true,
    titulo: 'Quanto você retira por mês, em média, para você?', ajuda: 'Pró-labore e retiradas. Mesmo que seja pouco ou nada, informe: o resultado do negócio precisa sustentar essa retirada.' });

  /* --- etapa 3: detalhes por segmento --- */
  nova('ou_preco', { id: 'px_item_preco', etapa: 3, curto: 'Preço do item mais vendido', se: h(['alimentacao']),
    titulo: 'Pense no item que mais vende: por quanto você o vende?', ajuda: 'Preço de venda, em reais.', opcional: true });
  nova('px_item_preco', { id: 'px_item_custo', etapa: 3, curto: 'Custo do item mais vendido', se: h(['alimentacao']),
    titulo: 'E quanto custa produzir esse item?', ajuda: 'Ingredientes e embalagem de uma unidade, em reais. Se tiver ficha técnica, use o custo dela.', opcional: true });
  nova('px_item_custo', { id: 'px_horas_agenda', etapa: 3, curto: 'Horas disponíveis na agenda', unidade: 'h', max: 744, se: h(['saude', 'estetica']),
    titulo: 'Quantas horas de atendimento a sua agenda comporta por mês?', ajuda: 'Considere os dias e horários em que você atende. Ex.: 6 horas por dia × 20 dias = 120 horas.', opcional: true });
  nova('px_horas_agenda', { id: 'px_horas_atend', etapa: 3, curto: 'Horas atendidas', unidade: 'h', max: 744, se: h(['saude', 'estetica']),
    titulo: 'E quantas horas foram efetivamente atendidas, em média?', ajuda: 'Só os horários realmente ocupados por atendimento.', opcional: true });
  nova('px_horas_atend', { id: 'px_faltas', etapa: 3, curto: 'Faltas e cancelamentos', unidade: '%', max: 100, se: h(['saude', 'estetica']),
    titulo: 'Que percentual dos horários marcados costuma faltar ou cancelar sem reposição?', ajuda: 'Uma estimativa: de cada 100 horários marcados, quantos viram falta?', opcional: true });
  nova('px_faltas', { id: 'px_estoque_v', etapa: 3, curto: 'Valor do estoque', se: h(['comercio']),
    titulo: 'Qual é, hoje, o valor do estoque a preço de custo?', ajuda: 'Quanto o que está parado na prateleira custou para você comprar.', opcional: true });
  // As horas são do negócio todo (o custo por hora divide as despesas do negócio inteiro por elas): quem tem equipe soma as horas de todos.
  // Por isso o limite de 744 h (um mês inteiro) só vale para quem trabalha sozinho.
  nova('px_estoque_v', { id: 'px_horas_vend', etapa: 3, curto: 'Horas cobradas dos clientes por mês', unidade: 'h', se: h(['servicos']),
    max: function (r) { return sozinho(r) ? 744 : 20000; },
    titulo: function (c) { return sozinho(c.r) ? 'Quantas horas por mês você dedica a trabalho que é cobrado dos clientes?' : 'Somando você e a equipe, quantas horas por mês são dedicadas a trabalho cobrado dos clientes?'; },
    ajuda: function (c) {
      return 'Conte só as horas de projeto, atendimento e entrega. Não conte reuniões internas, tarefas administrativas nem a busca por novos clientes. '
        + (sozinho(c.r) ? 'Exemplo: 5 horas por dia × 20 dias = 100 horas. ' : 'Exemplo: 3 pessoas × 5 horas por dia × 20 dias = 300 horas. ')
        + 'Se você não controla as horas, uma estimativa já ajuda; ou pule. Com isso descobrimos quanto custa cada hora do negócio.';
    }, opcional: true });
  nova('px_horas_vend', { id: 'px_valor_hora', etapa: 3, curto: 'Valor cobrado por hora', se: h(['servicos']),
    titulo: 'Em média, quanto você cobra por hora de trabalho?',
    ajuda: 'Se tem uma tabela de preços, use o valor da hora. Se cobra por projeto ou mensalidade, divida o valor pelas horas gastas. Exemplo: projeto de R$ 3.000 feito em 30 horas = R$ 100 por hora.', opcional: true });
  nova('px_valor_hora', { id: 'px_receber_v', etapa: 3, curto: 'Valores a receber em aberto', se: h(['servicos']),
    titulo: 'Quanto os clientes devem a você hoje (valores a receber em aberto)?', ajuda: 'Somando tudo que já foi entregue ou faturado e ainda não foi pago.', opcional: true });

  /* --- etapa 5: aprofundamento com valores --- */
  par('dv_app_pct', 'dv_app_pct_v', { unidade: '%', max: 100, ajuda: 'De cada 100 reais vendidos, quantos vêm desse canal?', textoFaixa: 'Não sei o percentual exato: escolher uma faixa' });
  par('dv_app_taxa', 'dv_app_taxa_v', { unidade: '%', max: 100, ajuda: 'Some comissão, taxa de entrega e de pagamento, se houver.', textoFaixa: 'Não sei a taxa exata: escolher uma faixa' });
  par('dv_parcela', 'dv_parcela_v', { titulo: 'Quanto você paga por mês em parcelas de dívidas?', ajuda: 'Some todas as parcelas de empréstimos, financiamentos e renegociações.' });
  par('dv_saldo', 'dv_saldo_v', { titulo: 'E o saldo devedor total, aproximadamente?', ajuda: 'Quanto ainda falta pagar, somando todas as dívidas.' });
  nova('dv_saldo_v', { id: 'px_prazo_receb', etapa: 5, curto: 'Prazo médio de recebimento', unidade: 'dias', max: 365, opcional: true,
    titulo: 'Em média, em quantos dias o dinheiro das vendas entra na conta?', ajuda: '0 se recebe na hora (Pix, dinheiro, débito). Crédito no cartão costuma levar cerca de 30 dias; vendas a prazo, o que foi combinado.' });
  nova('px_prazo_receb', { id: 'px_prazo_pagto', etapa: 5, curto: 'Prazo médio de pagamento', unidade: 'dias', max: 365, opcional: true,
    titulo: 'Em média, em quantos dias você paga os fornecedores?', ajuda: '0 se paga à vista. Prazo maior que o de recebimento alivia o caixa.' });

  D._mapa = {};
  D.PERGUNTAS.forEach(function (q) { D._mapa[q.id] = q; });
  D.pergunta = function (id) { return D._mapa[id] || null; };
})(typeof window !== 'undefined' ? window : globalThis);
