/* Gerador da base fictícia (formato do extrato financeiro do Conta Azul) do cliente demonstrativo.
   Tudo aqui é inventado: empresa, obras, clientes, fornecedores, pessoas e valores.
   Datas são relativas a "hoje", então a demonstração sempre parece atual. */
const DEMO = (function () {
  const HEADER = ['Data movimento', 'Identificador do fornecedor/cliente', 'Nome do fornecedor/cliente', 'Recorrência', 'Quantidade de recorrência', 'Descrição', 'Agendado', 'Tipo', 'Origem do lançamento', 'Conta bancária', 'Forma de pgto/recbto', 'Valor (R$)', 'Saldo conta (R$)', 'Situação', 'Valor original (R$)', 'Juros (R$)', 'Multa (R$)', 'Desconto (R$)', 'Taxas (R$)', 'Data de competência', 'Data original de vencimento', 'Data prevista', 'Observações', 'Nota fiscal', 'Categoria 1', 'Valor na Categoria 1', 'Centro de Custo 1', 'Valor no Centro de Custo 1'];

  const CC1 = 'Banco Sul - Conta Corrente 01', CARD1 = 'Banco Sul - Cartão de Crédito 01', CAIXA1 = 'Caixa Obras 01';
  const CC2 = 'Banco Sul - Conta Corrente 02', CAP2 = 'Cooperativa Verde - Conta Capital 02';
  const ACCOUNTS = {
    [CC1]: { cnpj: '01', type: 'banco' }, [CARD1]: { cnpj: '01', type: 'cartao' }, [CAIXA1]: { cnpj: '01', type: 'caixa' },
    [CC2]: { cnpj: '02', type: 'banco' }, [CAP2]: { cnpj: '02', type: 'aplicacao' },
  };
  const OPENING = { [CC1]: 96500, [CARD1]: 0, [CAIXA1]: 2400, [CC2]: 58000, [CAP2]: 22000 };

  // obras: entidade, cliente, início/fim (índice do mês 0..10), medição mensal, contrato
  const OBRAS = [
    { n: 'Ed. Solar das Palmeiras', e: '01', cli: 'Condomínio Ed. Solar das Palmeiras', a: -1, b: 8, med: 68000, cat: 'Medição de Obra' },
    { n: 'Cond. Recanto do Sol', e: '01', cli: 'Condomínio Recanto do Sol', a: 1, b: 10, med: 47500, cat: 'Medição de Obra' },
    { n: 'Ed. Monte Castelo', e: '01', cli: 'Administradora Castelo Ltda', a: 3, b: 10, med: 44000, cat: 'Medição de Obra' },
    { n: 'Ed. Alameda Central', e: '01', cli: 'Condomínio Alameda Central', a: -1, b: 5, med: 58000, cat: 'Medição de Obra' },
    { n: 'Ed. Bosque Real', e: '01', cli: 'Condomínio Bosque Real', a: -1, b: 3, med: 39000, cat: 'Medição de Obra' },
    { n: 'Ed. Vila Verde', e: '02', cli: 'Vila Verde Empreendimentos S/A', a: -1, b: 10, med: 31500, cat: 'Serviços de Pintura' },
    { n: 'Ed. Parque das Águias', e: '02', cli: 'Condomínio Parque das Águias', a: 2, b: 9, med: 37000, cat: 'Serviços de Pintura' },
    { n: 'Cond. Villa Toscana', e: '02', cli: 'Incorporadora Toscana Ltda', a: 5, b: 10, med: 35500, cat: 'Serviços de Pintura' },
    { n: 'Ed. Marina Bay', e: '02', cli: 'Marina Bay Residencial SPE Ltda', a: 6, b: 10, med: 34000, cat: 'Serviços de Pintura' },
  ];
  OBRAS.forEach(o => { o.contrato = Math.round(o.med * (o.b - o.a + 1) / 1000) * 1000; });
  const MANUT = [
    { n: 'Contratos de Manutenção', e: '02', cli: 'Residencial Jardim das Flores', v: 3800 },
    { n: 'Contratos de Manutenção', e: '02', cli: 'Edifício Comercial Prime', v: 2900 },
    { n: 'Contratos de Manutenção', e: '02', cli: 'Colégio Novo Horizonte', v: 4300 },
  ];
  const FUNC = [ // nome, centro, salário, entidade, início (idx do mês)
    ['Ana Paula Ribeiro', 'Administrativo', 4300, '01', 0], ['Bruna Carvalho Teixeira', 'Administrativo', 3900, '01', 0],
    ['Carlos Eduardo Lima', 'Ed. Solar das Palmeiras', 6200, '01', 0], ['Fábio Henrique Souza', 'Ed. Solar das Palmeiras', 3300, '01', 0],
    ['João Batista Martins', 'Ed. Alameda Central', 3100, '01', 0], ['Marcelo Augusto Alves', 'Cond. Recanto do Sol', 3400, '01', 1],
    ['Pedro Henrique Costa', 'Ed. Monte Castelo', 3250, '01', 3], ['Rafael Moreira Dias', 'Ed. Vila Verde', 3350, '02', 0],
    ['Sérgio Luiz Nogueira', 'Ed. Parque das Águias', 3200, '02', 2], ['Valdir Aparecido Ramos', 'Ed. Vila Verde', 2950, '02', 0],
    ['Wellington Pires Cardoso', 'Cond. Villa Toscana', 3300, '02', 5], ['Diego Fernandes Rocha', 'Ed. Marina Bay', 3150, '02', 6],
  ];
  const SOCIOS = ['Eduardo Prado', 'Cláudia Prado'];
  const FORN_MAT = ['Tintas Colorama Distribuidora Ltda', 'Casa das Tintas e Texturas', 'Depósito Construforte', 'Bela Cor Insumos Ltda'];
  const EMPREITEIROS = ['Marcos Antônio Pereira', 'Rogério Barbosa Pinturas ME', 'Equipe Acabamento Fino Ltda', 'Luciano Souza'];

  const pad = n => String(n).padStart(2, '0');
  const iso = (y, m, d) => y + '-' + pad(m + 1) + '-' + pad(d);
  const br = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '';
  const addDays = (s, n) => { const d = new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10) + n); return iso(d.getFullYear(), d.getMonth(), d.getDate()); };
  const dim = (y, m) => new Date(y, m + 1, 0).getDate();
  const r2 = n => Math.round(n * 100) / 100;

  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  /* gera os lançamentos "de verdade" (independente da data de corte) */
  function events(todayIso) {
    const R = rng(20260);
    const rnd = (a, b) => a + R() * (b - a);
    const pick = arr => arr[Math.floor(R() * arr.length)];
    const ty = +todayIso.slice(0, 4), tm = +todayIso.slice(5, 7) - 1;
    const mon = i => { const t = ty * 12 + tm - (10 - i); return { y: Math.floor(t / 12), m: t % 12 }; }; // i=10 → mês atual
    const ev = []; // { due, pay|null, tipo, valor(+), conta, cat, centro, pessoa, desc, forma, nf, comp, opening? }
    const add = e => ev.push(Object.assign({ forma: 'Pix', nf: '' }, e));
    const accOf = e => (e === '01' ? CC1 : CC2);

    for (let i = 0; i <= 10; i++) {
      const { y, m } = mon(i), last = dim(y, m);
      const compIso = iso(y, m, last);
      // ---- receitas: medição do mês anterior recebida neste mês
      for (const o of OBRAS) {
        if (i - 1 < o.a || i - 1 > o.b) continue;
        const v = r2(o.med * rnd(0.95, 1.15)), due = iso(y, m, Math.min(last, Math.round(rnd(8, 14))));
        const delay = R() < 0.35 ? Math.round(rnd(1, 6)) : 0;
        add({ due, pay: addDays(due, delay), tipo: 'R', valor: v, conta: accOf(o.e), cat: o.cat, centro: o.n, pessoa: o.cli, desc: 'Medição ' + pad(((m + 11) % 12) + 1) + '/' + (m === 0 ? y - 1 : y) + ' - ' + o.n, forma: pick(['Boleto', 'Transferência bancária', 'Pix']), nf: String(1000 + Math.round(rnd(0, 800))), comp: iso(m === 0 ? y - 1 : y, (m + 11) % 12, dim(m === 0 ? y - 1 : y, (m + 11) % 12)) });
      }
      // última medição (mês atual) fica a receber no mês seguinte
      if (i === 10) for (const o of OBRAS) {
        if (10 < o.a || 10 > o.b) continue;
        const v = r2(o.med * rnd(0.95, 1.15)), ny = m === 11 ? y + 1 : y, nm = (m + 1) % 12;
        add({ due: iso(ny, nm, Math.round(rnd(8, 14))), pay: null, tipo: 'R', valor: v, conta: accOf(o.e), cat: o.cat, centro: o.n, pessoa: o.cli, desc: 'Medição ' + pad(m + 1) + '/' + y + ' - ' + o.n, forma: 'Boleto', nf: String(1000 + Math.round(rnd(0, 800))), comp: compIso });
      }
      for (const c of MANUT) add({ due: iso(y, m, 15), pay: addDays(iso(y, m, 15), R() < .3 ? 2 : 0), tipo: 'R', valor: c.v, conta: CC2, cat: 'Serviços de Manutenção', centro: c.n, pessoa: c.cli, desc: 'Contrato de manutenção ' + pad(m + 1) + '/' + y, forma: 'Boleto', comp: compIso });

      // ---- custos de obra
      // contratos de manutenção: materiais e um pintor autônomo
      add({ due: iso(y, m, 9), pay: iso(y, m, 9), tipo: 'D', valor: r2(rnd(1300, 1900)), conta: CC2, cat: 'Materiais de Pintura (Tintas e Insumos)', centro: 'Contratos de Manutenção', pessoa: 'Casa das Tintas e Texturas', desc: 'Materiais para manutenções', forma: 'Pix', comp: iso(y, m, 9) });
      add({ due: iso(y, m, 28 > last ? last : 28), pay: iso(y, m, 28 > last ? last : 28), tipo: 'D', valor: r2(rnd(3100, 3700)), conta: CC2, cat: 'Mão de Obra - Empreita', centro: 'Contratos de Manutenção', pessoa: 'Luciano Souza', desc: 'Pintor autônomo - manutenções', forma: 'Pix', comp: iso(y, m, 28 > last ? last : 28) });
      for (const o of OBRAS) {
        if (i < o.a || i > o.b) continue;
        const base = o.med, acc = accOf(o.e);
        const nMat = pick([1, 2, 2, 3]);
        for (let k = 0; k < nMat; k++) {
          const v = r2(base * 0.19 * rnd(0.75, 1.25) / nMat), d = Math.round(rnd(3, last - 3));
          const onCard = o.e === '01' && R() < 0.3;
          add({ due: iso(y, m, d), pay: iso(y, m, d), tipo: 'D', valor: v, conta: onCard ? CARD1 : acc, cat: 'Materiais de Pintura (Tintas e Insumos)', centro: o.n, pessoa: pick(FORN_MAT), desc: 'Compra de tintas e insumos - ' + o.n, forma: onCard ? 'Cartão de crédito' : pick(['Boleto', 'Pix', 'Boleto']), nf: String(20000 + Math.round(rnd(0, 9000))), comp: iso(y, m, d) });
        }
        add({ due: iso(y, m, 10), pay: iso(y, m, 10 + (R() < .3 ? 2 : 0)), tipo: 'D', valor: r2(base * 0.065 * rnd(0.88, 1.12)), conta: acc, cat: 'Locação de Andaimes e Equipamentos', centro: o.n, pessoa: 'Andaimes Torre Forte Locações', desc: 'Locação de andaimes - ' + o.n, forma: 'Boleto', nf: String(300 + Math.round(rnd(0, 90))), comp: compIso });
        if (R() < 0.55) add({ due: iso(y, m, Math.round(rnd(5, 25))), pay: iso(y, m, Math.round(rnd(5, 25))), tipo: 'D', valor: r2(rnd(900, 2600)), conta: acc, cat: 'Serviços de Terceiros (Caçamba, Frete e Laudos)', centro: o.n, pessoa: pick(['Caçamba Limpa Entulhos', 'Frete Rápido Transportes', 'Engenharia & Laudos Ltda']), desc: 'Serviço de apoio - ' + o.n, forma: 'Pix', comp: compIso });
        // empreita: pagamento em duas parcelas (dia 12 e 27)
        const emp = o.n === 'Ed. Solar das Palmeiras' ? 'Marcos Antônio Pereira' : o.n === 'Cond. Villa Toscana' ? 'Rogério Barbosa Pinturas ME' : pick(['Equipe Acabamento Fino Ltda', 'Luciano Souza']);
        const tot = r2(base * 0.235 * rnd(0.9, 1.1));
        for (const [d, f] of [[12, 0.45], [Math.min(27, last), 0.55]]) add({ due: iso(y, m, d), pay: iso(y, m, d), tipo: 'D', valor: r2(tot * f), conta: acc, cat: 'Mão de Obra - Empreita', centro: o.n, pessoa: emp, desc: 'Empreita ' + (d < 20 ? '1ª' : '2ª') + ' quinzena - ' + o.n, forma: 'Pix', comp: iso(y, m, d) });
      }

      // ---- folha
      const empAt = FUNC.filter(f => i >= f[4]);
      for (const [nome, centro, sal, ent] of empAt) {
        const acc = accOf(ent), vale = r2(sal * 0.4), resto = r2(sal - vale);
        add({ due: iso(y, m, 20), pay: iso(y, m, 20), tipo: 'D', valor: vale, conta: acc, cat: 'Adiantamento Salarial', centro, pessoa: nome, desc: 'Adiantamento salarial ' + pad(m + 1) + '/' + y, forma: 'Pix', comp: iso(y, m, 20) });
        const nm = (m + 1) % 12, ny = m === 11 ? y + 1 : y;
        add({ due: iso(ny, nm, 5), pay: iso(ny, nm, 5), tipo: 'D', valor: resto, conta: acc, cat: 'Salários e Ordenados', centro, pessoa: nome, desc: 'Salário ' + pad(m + 1) + '/' + y + ' (saldo)', forma: 'Pix', comp: compIso });
      }
      for (const ent of ['01', '02']) {
        const folha = empAt.filter(f => f[3] === ent).reduce((s, f) => s + f[2], 0);
        if (!folha) continue;
        const nm = (m + 1) % 12, ny = m === 11 ? y + 1 : y;
        add({ due: iso(ny, nm, 7), pay: iso(ny, nm, 7), tipo: 'D', valor: r2(folha * 0.305), conta: accOf(ent), cat: 'Encargos Sociais (FGTS e INSS)', centro: 'Administrativo', pessoa: 'Receita Federal - GPS/FGTS', desc: 'FGTS e INSS sobre salários ' + pad(m + 1) + '/' + y, forma: 'Boleto', comp: compIso });
        add({ due: iso(y, m, 3), pay: iso(y, m, 3), tipo: 'D', valor: r2(empAt.filter(f => f[3] === ent).length * 285), conta: accOf(ent), cat: 'Benefícios (Vale Transporte e Alimentação)', centro: 'Administrativo', pessoa: 'Cartão Benefícios Alfa', desc: 'Vale transporte e alimentação ' + pad(m + 1) + '/' + y, forma: 'Boleto', comp: compIso });
      }
      for (const s of SOCIOS) add({ due: iso(y, m, 28 > last ? last : 28), pay: iso(y, m, 28 > last ? last : 28), tipo: 'D', valor: 8000, conta: CC1, cat: 'Pró-labore', centro: 'Sócios', pessoa: s, desc: 'Pró-labore ' + pad(m + 1) + '/' + y, forma: 'Transferência bancária', comp: compIso });
      if (i === 4) add({ due: iso(y, m, 14), pay: iso(y, m, 14), tipo: 'D', valor: 4180, conta: CC1, cat: 'Férias e Rescisões', centro: 'Ed. Alameda Central', pessoa: 'João Batista Martins', desc: 'Férias 20 dias', forma: 'Pix', comp: iso(y, m, 14) });
      if (i === 7) add({ due: iso(y, m, 16), pay: iso(y, m, 16), tipo: 'D', valor: 3650, conta: CC2, cat: 'Férias e Rescisões', centro: 'Ed. Vila Verde', pessoa: 'Valdir Aparecido Ramos', desc: 'Férias 20 dias', forma: 'Pix', comp: iso(y, m, 16) });

      if (i === 7) for (const sc of SOCIOS) add({ due: iso(y, m, 26), pay: iso(y, m, 26), tipo: 'D', valor: 14000, conta: CC1, cat: 'Distribuição de Lucros', centro: 'Sócios', pessoa: sc, desc: 'Distribuição de lucros do semestre', forma: 'Transferência bancária', comp: iso(y, m, 26) });
      if (i === 4) add({ due: iso(y, m, 17), pay: iso(y, m, 17), tipo: 'D', valor: 46800, conta: CC2, cat: 'Aquisição de Equipamentos', centro: 'Administrativo', pessoa: 'Equipa Locações de Máquinas', desc: 'Compra de compressores e pulverizadores', forma: 'Transferência bancária', nf: '48211', comp: iso(y, m, 17) });
      if (i === 9 || i === 10) add({ due: iso(y, m, 6 + i), pay: iso(y, m, 6 + i), tipo: 'D', valor: r2(rnd(1200, 2900)), conta: CC1, cat: 'Despesas a Identificar', centro: '', pessoa: 'Pix sem identificação', desc: 'Pagamento via Pix a identificar', forma: 'Pix', comp: iso(y, m, 6 + i) });
      // ---- tributos
      const rec1 = OBRAS.filter(o => o.e === '01' && i - 1 >= o.a && i - 1 <= o.b).reduce((s, o) => s + o.med, 0);
      const rec2 = OBRAS.filter(o => o.e === '02' && i - 1 >= o.a && i - 1 <= o.b).reduce((s, o) => s + o.med, 0) + MANUT.reduce((s, c) => s + c.v, 0);
      if (rec1) add({ due: iso(y, m, 20), pay: iso(y, m, 20), tipo: 'D', valor: r2(rec1 * 0.0365 * rnd(.97, 1.03)), conta: CC1, cat: 'Impostos sobre Faturamento (PIS/COFINS/CSLL)', centro: 'Administrativo', pessoa: 'Receita Federal - DARF', desc: 'DARF ' + pad(((m + 11) % 12) + 1) + '/' + (m === 0 ? y - 1 : y), forma: 'Boleto', comp: compIso });
      if (rec1) add({ due: iso(y, m, 10), pay: iso(y, m, 10), tipo: 'D', valor: r2(rec1 * 0.02 * rnd(.97, 1.03)), conta: CC1, cat: 'ISS', centro: 'Administrativo', pessoa: 'Prefeitura Municipal - ISS', desc: 'ISS ' + pad(((m + 11) % 12) + 1) + '/' + (m === 0 ? y - 1 : y), forma: 'Boleto', comp: compIso });
      if (rec2) add({ due: iso(y, m, 20), pay: iso(y, m, 20), tipo: 'D', valor: r2(rec2 * 0.062 * rnd(.97, 1.03)), conta: CC2, cat: 'Impostos sobre Faturamento (DAS - Simples Nacional)', centro: 'Administrativo', pessoa: 'Receita Federal - DAS', desc: 'DAS ' + pad(((m + 11) % 12) + 1) + '/' + (m === 0 ? y - 1 : y), forma: 'Boleto', comp: compIso });

      // ---- administrativas
      const adm = (d, v, cat, pessoa, desc, conta, forma) => add({ due: iso(y, m, Math.min(d, last)), pay: iso(y, m, Math.min(d, last)), tipo: 'D', valor: r2(v), conta: conta || CC1, cat, centro: 'Administrativo', pessoa, desc: desc + ' ' + pad(m + 1) + '/' + y, forma: forma || 'Boleto', comp: compIso });
      adm(5, 6800, 'Aluguel', 'Imobiliária Central', 'Aluguel da sede');
      adm(10, 2850, 'Honorários Contábeis', 'Contabilidade Exata S/S', 'Honorários contábeis');
      adm(8, 1290, 'Software e Licenças', 'Sistema Gestão Obra', 'Licença do sistema de gestão', CC2);
      adm(12, 980 * rnd(.95, 1.1), 'Telefone e Internet', 'Conecta Telecom', 'Internet e telefonia');
      adm(15, 1840, 'Seguros', 'Seguradora Confiança', 'Seguro de equipamentos e responsabilidade civil');
      adm(18, 4900 * rnd(.85, 1.2), 'Combustível', 'Rede de Postos Via Norte', 'Combustível da frota', CARD1, 'Cartão de crédito');
      adm(22, 2700 * rnd(.7, 1.3), 'Marketing e Publicidade', 'Agência Impulso Digital', 'Marketing digital', CARD1, 'Cartão de crédito');
      adm(25, 640 * rnd(.9, 1.1), 'Tarifas Bancárias', 'Banco Sul', 'Tarifas e manutenção de conta');
      adm(5, 5240, 'Financiamento de Equipamentos', 'Banco Sul - Financiamento', 'Parcela do financiamento de equipamentos');
      if (i % 3 === 1) adm(19, 1500, 'Honorários Advocatícios', 'Advocacia Moura & Associados', 'Assessoria jurídica');
      if (i % 4 === 2) add({ due: iso(y, m, 9), pay: iso(y, m, 9), tipo: 'D', valor: r2(rnd(380, 760)), conta: CC1, cat: 'ART / CREA', centro: 'Administrativo', pessoa: 'CREA - Conselho Regional', desc: 'Anuidade e ART', forma: 'Boleto', comp: iso(y, m, 9) });
      if (i >= 2) add({ due: iso(y, m, 24), pay: iso(y, m, 24), tipo: 'TRF', valor: r2(rnd(7000, 13000)), conta: CC2, cat: '', centro: '', pessoa: '', desc: 'Transferência entre contas (CNPJ 02 para CNPJ 01)', comp: iso(y, m, 24) });
      // pagamento da fatura do cartão (mês anterior) no dia 10
      if (i > 0) add({ due: iso(y, m, 10), pay: iso(y, m, 10), tipo: 'FAT', valor: 0, conta: CC1, cat: '', centro: '', pessoa: '', desc: 'Pagamento da fatura do cartão', comp: iso(y, m, 10) });
    }
    return ev;
  }

  /* monta as linhas do extrato "como estava" em asOfIso (lançamentos depois disso ainda não foram baixados) */
  function rows(todayIso, asOfIso) {
    asOfIso = asOfIso || todayIso;
    const ev = events(todayIso);
    const firstDay = (() => { const e = ev.reduce((a, b) => (a.due < b.due ? a : b)); return e.due.slice(0, 8) + '01'; })();
    const out = []; // { date(sort), row[] , conta, delta }
    const bal = Object.assign({}, OPENING);
    const lines = [];
    // saldos iniciais
    for (const [conta, v] of Object.entries(OPENING)) {
      if (!v) continue;
      lines.push({ sort: firstDay + 'a', conta, mov: firstDay, o: 'Saldo Conta Bancária', tipo: v < 0 ? 'D' : 'R', valor: v, sit: 'Quitado', cat: 'Saldo Inicial', desc: 'Saldo Inicial ' + conta, centro: '', pessoa: '', forma: 'Outro', due: firstDay, comp: firstDay });
    }
    // fatura do cartão: soma das compras do cartão do mês anterior (realizadas até o corte)
    const realized = e => e.pay && e.pay <= asOfIso;
    const cardTotal = {};
    for (const e of ev) if (e.conta === CARD1 && e.tipo === 'D' && realized(e)) { const k = e.pay.slice(0, 7); cardTotal[k] = r2((cardTotal[k] || 0) + e.valor); }
    for (const e of ev) {
      if (e.tipo === 'FAT') {
        const d = new Date(+e.pay.slice(0, 4), +e.pay.slice(5, 7) - 2, 1), k = d.getFullYear() + '-' + pad(d.getMonth() + 1);
        const v = cardTotal[k]; if (!v || !realized(e)) continue;
        lines.push({ sort: e.pay + 'b', conta: CC1, mov: e.pay, o: 'Transferência', tipo: 'D', valor: -v, sit: 'Transferido', cat: 'Transferência de Saída', desc: 'Pagamento da fatura do cartão', centro: '', pessoa: '', forma: 'Transferência bancária', due: e.pay, comp: e.pay });
        lines.push({ sort: e.pay + 'b', conta: CARD1, mov: e.pay, o: 'Transferência', tipo: 'R', valor: v, sit: 'Transferido', cat: 'Transferência de Entrada', desc: 'Pagamento da fatura do cartão', centro: '', pessoa: '', forma: 'Transferência bancária', due: e.pay, comp: e.pay });
        continue;
      }
      if (e.tipo === 'TRF') {
        if (!realized(e)) continue;
        lines.push({ sort: e.pay + 'b', conta: CC2, mov: e.pay, o: 'Transferência', tipo: 'D', valor: -e.valor, sit: 'Transferido', cat: 'Transferência de Saída', desc: e.desc, centro: '', pessoa: '', forma: 'Transferência bancária', due: e.pay, comp: e.pay });
        lines.push({ sort: e.pay + 'b', conta: CC1, mov: e.pay, o: 'Transferência', tipo: 'R', valor: e.valor, sit: 'Transferido', cat: 'Transferência de Entrada', desc: e.desc, centro: '', pessoa: '', forma: 'Transferência bancária', due: e.pay, comp: e.pay });
        continue;
      }
      const sign = e.tipo === 'R' ? 1 : -1;
      if (realized(e)) lines.push({ sort: e.pay + 'c', conta: e.conta, mov: e.pay, o: 'Lançamento Financeiro', tipo: e.tipo, valor: sign * e.valor, sit: ((e.pay.charCodeAt(9) + e.valor) | 0) % 5 === 0 ? 'Quitado' : 'Conciliado', cat: e.cat, desc: e.desc, centro: e.centro, pessoa: e.pessoa, forma: e.forma, nf: e.nf, due: e.due, comp: e.comp });
      else lines.push({ sort: e.due + 'd', conta: e.conta, mov: '', o: 'Lançamento Financeiro', tipo: e.tipo, valor: sign * e.valor, sit: e.due < asOfIso ? 'Atrasado' : 'Em aberto', cat: e.cat, desc: e.desc, centro: e.centro, pessoa: e.pessoa, forma: e.forma, nf: e.nf, due: e.due, comp: e.comp });
    }
    lines.sort((a, b) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0));
    const res = [HEADER];
    let run = 0;
    for (const L of lines) {
      if (L.sit !== 'Atrasado') run = r2(run + L.valor);
      const saldo = run;
      res.push([L.mov ? br(L.mov) : '', '', L.pessoa, 'Sem recorrência', '', L.desc, '-', L.tipo === 'R' ? 'Receita' : 'Despesa', L.o, L.conta, L.forma, L.valor, saldo, L.sit, L.valor, 0, 0, 0, 0, br(L.comp), br(L.due), br(L.due), '', L.nf || '', L.cat, L.valor, L.centro, L.centro ? L.valor : '']);
    }
    return res;
  }

  const SETTINGS = {
    cnpjLabel: { '01': 'CNPJ 01 · Atlas Obras (Lucro Presumido)', '02': 'CNPJ 02 · Atlas Serviços (Simples)' },
    accounts: ACCOUNTS, OBRAS, FUNC, SOCIOS, MANUT,
  };
  return { HEADER, rows, events, SETTINGS, ACCOUNTS, OBRAS };
})();
if (typeof module !== 'undefined') module.exports = DEMO;
