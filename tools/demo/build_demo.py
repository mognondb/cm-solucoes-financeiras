#!/usr/bin/env python3
"""Gera portal/relatorios/demo.html a partir de portal/relatorios/premium.html.

Mesma aplicação do relatório Premium, com identidade (Atlas Pinturas Prediais), entidades, obras,
empreitas, pessoas e números 100% fictícios. A base é montada em memória por demo_gen.js (um extrato no
formato do Conta Azul, com datas relativas a hoje) e passa pelo mesmo caminho de importação do relatório
real. Nada é gravado no servidor.

Uso (a partir da raiz do repositório):  python3 tools/demo/build_demo.py
Rode de novo sempre que o premium.html mudar, para o demonstrativo acompanhar. Esta pasta (tools/) não vai
para a Hostinger (ver "exclude" em .github/workflows/deploy-hostinger.yml).
"""
import os, re, sys

SP = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(SP, '..', '..'))
s = open(REPO + '/portal/relatorios/premium.html', encoding='utf-8').read()
gen = open(SP + '/demo_gen.js', encoding='utf-8').read()
gen = gen.replace("if (typeof module !== 'undefined') module.exports = DEMO;\n", '')


def rep(old, new, n=1):
    global s
    c = s.count(old)
    assert c >= 1, 'não achei: ' + old[:80]
    if n is not None:
        assert c == n, f'esperava {n} ocorrência(s), achei {c}: ' + old[:80]
    s = s.replace(old, new)


def rep_re(pat, new, n=None, flags=0):
    global s
    s, c = re.subn(pat, new, s, flags=flags)
    assert c >= 1, 'regex sem efeito: ' + pat[:80]
    if n is not None:
        assert c == n, f'regex esperava {n}, fez {c}: ' + pat[:80]


# ---------------------------------------------------------------- cabeçalho / identidade
rep('<html lang="pt-BR">', '<html lang="pt-BR" data-theme="light">')
rep('<title>Premium · Gestão de Caixa</title>', '<title>Atlas Pinturas · Gestão de Caixa</title>\n<meta name="robots" content="noindex,nofollow">')
rep('../../assets/img/clientes/premium-pinturas.png', '../../assets/img/clientes/demonstrativo.png', 4)
rep('Premium Pinturas Prediais', 'Atlas Pinturas Prediais', None)
rep('/* identidade visual Premium Pinturas Prediais: vinho, marrom escuro e dourado */', '/* identidade visual do demonstrativo: verde-oliva e dourado (paleta da CM) */', None) if 'identidade visual Premium' in s else None

# paleta (variáveis) — claro apenas
old_root = re.search(r':root\{\n  /\* identidade visual.*?\n\}\n', s, flags=re.S)
assert old_root, 'bloco :root'
new_root = """:root{
  /* identidade visual do demonstrativo: verde-oliva e dourado (paleta da CM) */
  --bg:#f6f3ec;--panel:#ffffff;--ink:#2e2e2e;--ink2:#5d5d54;--ink3:#8a8a80;--line:#e4ded1;--line2:#f1ede4;
  --brand:#3f4c39;--brand2:#5f6f52;--accent:#b18a52;--gold:#c9a66b;--accentbg:#f4ecde;
  --side1:#2f3a2b;--side2:#5f6f52;
  --pos:#5b7f5f;--neg:#a8655a;--warn:#a8761b;--warnbg:#fbf1dc;--badbg:#fbe9e7;--okbg:#e8f4ec;--infobg:#f1efe6;
  --c01:#5f6f52;--c02:#b18a52;--shadow:0 1px 2px rgba(48,56,40,.06),0 2px 8px rgba(48,56,40,.05);
  --a1:#b18a52;--a2:#9c3f73;--a3:#3366a3;--a4:#b5652e;--a5:#0d9488;
}
"""
s = s[:old_root.start()] + new_root + s[old_root.end():]
for a, b in [('#8c2323', '#5f6f52'), ('#3b1716', '#3f4c39'), ('#2a1515', '#2f3a2b'), ('#6e1d1d', '#5f6f52'), ('#5b4743', '#5d5d54'),
             ('#f7f3ef', '#f6f3ec'), ('#e8b44c', '#c9a66b'), ('#d4a03f', '#b18a52')]:
    s = re.sub(re.escape(a), b, s, flags=re.I)
s = s.replace('rgba(232,180,76,', 'rgba(201,166,107,')

# ---------------------------------------------------------------- entidades (CNPJ 52/20 -> 01/02)
s = re.sub(r'(--|\.)c52', r'\1c01', s); s = re.sub(r'(--|\.)c20', r'\1c02', s)
rep('#cnpj-switch button.on[data-c="52"]', '#cnpj-switch button.on[data-c="01"]')
rep('#cnpj-switch button.on[data-c="20"]', '#cnpj-switch button.on[data-c="02"]')
rep('<button data-c="52">CNPJ 52</button><button data-c="20">CNPJ 20</button>', '<button data-c="01">CNPJ 01</button><button data-c="02">CNPJ 02</button>')
rep("const has52 = /\\b52\\b/.test(k), has20 = /\\b20\\b/.test(k);\n  if (has52 && !has20) return '52';\n  if (has20 && !has52) return '20';",
    "const has01 = /\\b01\\b/.test(k), has02 = /\\b02\\b/.test(k);\n  if (has01 && !has02) return '01';\n  if (has02 && !has01) return '02';")
rep("cnpj:'52'|'20'|''", "cnpj:'01'|'02'|''")
rep("<option value=\"52\" ${man.cnpj === '52' ? 'selected' : ''}>52</option>", "<option value=\"01\" ${man.cnpj === '01' ? 'selected' : ''}>01</option>")
rep_re(r"<option value=\"20\" \$\{man\.cnpj === '20' \? 'selected' : ''\}>20</option>", "<option value=\"02\" ${man.cnpj === '02' ? 'selected' : ''}>02</option>", 1)
rep("const cn = ['52', '20', ''];", "const cn = ['01', '02', ''];")
rep("const views = c === 'C' ? ['C', '52', '20'] : [c];", "const views = c === 'C' ? ['C', '01', '02'] : [c];")
rep("for (const c of ['C', '52', '20']) { const p = project", "for (const c of ['C', '01', '02']) { const p = project")
rep("['', '52', '20'].map(x =>", "['', '01', '02'].map(x =>", 2)
rep('Nome do CNPJ 52 <input data-lab="52" value="${U.esc(st.cnpjLabel[\'52\'])}"></label><label class="grow">Nome do CNPJ 20 <input data-lab="20" value="${U.esc(st.cnpjLabel[\'20\'])}">',
    'Nome do CNPJ 01 <input data-lab="01" value="${U.esc(st.cnpjLabel[\'01\'])}"></label><label class="grow">Nome do CNPJ 02 <input data-lab="02" value="${U.esc(st.cnpjLabel[\'02\'])}">')
rep("const cnpjs = c === 'C' ? ['52', '20', 'C'] : [c];", "const cnpjs = c === 'C' ? ['01', '02', 'C'] : [c];")

# ---------------------------------------------------------------- configuração padrão fictícia
rep("cnpjLabel: { '52': 'CNPJ 52 · Oliveira 01 (Lucro Presumido)', '20': 'CNPJ 20 · Oliveira & Oliveira (Simples)' },",
    "cnpjLabel: { '01': 'CNPJ 01 · Atlas Obras (Lucro Presumido)', '02': 'CNPJ 02 · Atlas Serviços (Simples)' },")
m = re.search(r"    // obra \(centro de custo\) -> CNPJ.*?\n    centroCnpj: \{.*?\n    \},\n", s, flags=re.S)
assert m, 'centroCnpj'
ob = [("Ed. Solar das Palmeiras", '01'), ("Cond. Recanto do Sol", '01'), ("Ed. Monte Castelo", '01'), ("Ed. Alameda Central", '01'), ("Ed. Bosque Real", '01'),
      ("Ed. Vila Verde", '02'), ("Ed. Parque das Águias", '02'), ("Cond. Villa Toscana", '02'), ("Ed. Marina Bay", '02'), ("Contratos de Manutenção", '02')]
lines = ',\n'.join(f"      '{n}': {{ cnpj: '{c}', validated: true, src: 'Contrato da obra' }}" for n, c in ob)
lines += ",\n      'Administrativo': { cnpj: '01', validated: true, natureza: 'administrativo', src: 'Estrutura da empresa' }"
lines += ",\n      'Sócios': { cnpj: '01', validated: true, natureza: 'administrativo', src: 'Estrutura da empresa' }"
s = s[:m.start()] + "    // obra (centro de custo) -> CNPJ, usado só para lançamentos SEM conta bancária (demonstrativo: tudo fictício)\n    centroCnpj: {\n" + lines + "\n    },\n" + s[m.end():]

# empreitas fictícias
i0 = s.index('/* empreitas iniciais informadas pelo Tiago')
i1 = s.index("const EMP_STATUS = ['Conferido', 'Aguardando comprovante', 'Aguardando Alisson'];")
new_emp = """/* empreitas do demonstrativo (fictícias): datas relativas a hoje */
function defaultEmpreitas() {
  const t = U.today(); const [y, mo] = t.split('-').map(Number);
  const desde = U.iso(new Date(y, mo - 11, 1));
  const m = (id, dias, recebedor, valor, forma, ref, status) => ({ id, data: U.addDays(t, -dias), recebedor, valor, forma, ref, status: status || 'Conferido' });
  return [
    { id: 'marcos-solar', nome: 'Marcos (empreita Solar das Palmeiras)', obra: 'Ed. Solar das Palmeiras', contratado: 168000,
      recebedores: 'Marcos Antônio Pereira', desde,
      nota: 'Mão de obra da pintura de fachada e áreas comuns. Os pagamentos quinzenais vêm do Conta Azul; descontos de material e EPI abatem do valor contratado.',
      manuais: [ m('d1', 96, 'Desconto', 1850, 'Desconto', 'EPI e material de proteção'), m('d2', 54, 'Desconto', 2300, 'Desconto', 'Locação de andaime paga pela Atlas'), m('d3', 18, 'Desconto', 1120, 'Desconto', 'Tinta de retoque (reposição)', 'Aguardando comprovante') ] },
    { id: 'rogerio-toscana', nome: 'Rogério (empreita Villa Toscana)', obra: 'Cond. Villa Toscana', contratado: 62000,
      recebedores: 'Rogério Barbosa', desde: U.addDays(t, -165),
      nota: 'Contrato de mão de obra do condomínio Villa Toscana.',
      manuais: [ m('p1', 120, 'Rogério Barbosa', 4000, 'Dinheiro', 'Adiantamento em espécie na mobilização') ] },
  ];
}
/* sem migração de empreitas antigas no demonstrativo */
function empUpgrade(list) { return false; }
"""
s = s[:i0] + new_emp + s[i1:]
rep("const EMP_STATUS = ['Conferido', 'Aguardando comprovante', 'Aguardando Alisson'];", "const EMP_STATUS = ['Conferido', 'Aguardando comprovante', 'Aguardando conferência'];")

# ---------------------------------------------------------------- textos com nomes reais / referências ao cliente
rep("// Não é erro de cadastro; a categoria a identificar fica sem centro de custo de propósito (Tiago, 16/10/2026).",
    "// Não é erro de cadastro; a categoria a identificar fica sem centro de custo de propósito.")
rep("replace(/ - Oliveira.*/i, '')", "replace(/ - Atlas.*/i, '')")
rep_re(r"<b>Regra de pagamento a validar com os sócios:</b> o Notion.*?O sistema não altera datas: usa as do Conta Azul\.",
       "<b>Regra de pagamento combinada com os sócios:</b> adiantamento no dia 20 e saldo no 5º dia útil. O sistema não altera datas: usa as do Conta Azul.", 1, flags=re.S)
rep("data em que o Tiago conciliou a conta no Conta Azul", "data em que a CM conciliou a conta no Conta Azul")
rep("guardar na pasta da Premium no Drive. Esse arquivo tem dados financeiros da cliente: trate como confidencial.", "guardar na pasta do cliente no Drive. Esse arquivo tem dados financeiros: trate como confidencial.")
rep("['backup', 'Fazer o backup e guardar na pasta da Premium'],", "['backup', 'Fazer o backup e guardar na pasta do cliente'],")
rep("se a Premium tiver, para comparar", "se o cliente tiver, para comparar")
rep("adaptada ao modelo da Premium (múltiplos CNPJs", "adaptada ao modelo de empreiteira (múltiplos CNPJs")
rep("premium_caixa_", "demo_caixa_", None)
rep("relatorio_premium_", "relatorio_demo_", None)
rep("fechamento_premium_", "fechamento_demo_", None)
rep("premium-caixa-cm", "demo-caixa-cm", 2)
rep("Premium Caixa: núcleo", "Caixa: núcleo")

rep("['52', '20', ''].map(k =>", "['01', '02', ''].map(k =>")
rep("(o Conta Azul da Premium começa em 01/10/2026)", "(o histórico do Conta Azul ainda é curto)")
rep("a sugestão veio dos relatórios de recebimentos por CNPJ (01/10/2026) e, enquanto", "a sugestão veio do cadastro da obra e, enquanto")
rep("<option>52</option><option>20</option>", "<option>01</option><option>02</option>")
rep("Mesma lógica do Fechamento do Instituto Luanda:", "Mesma lógica do Fechamento dos demais relatórios:")

rep("function fechMonthDefault() { const b = S.ui.base; return +b.slice(8) <= 15 ? U.month(U.addDays(b.slice(0, 7) + '-01', -1)) : U.month(b); }",
    "/* demonstrativo: o fechamento abre sempre no último mês completo */\nfunction fechMonthDefault() { return U.month(U.addDays(S.ui.base.slice(0, 7) + '-01', -1)); }")

# ---------------------------------------------------------------- persistência: base fictícia em memória
p0 = s.index('/* ---------- persistência: base própria da CM')
p1 = s.index('/* ==========================================================================\n   Aplicação: estado, navegação')
persist = """/* ---------- persistência: demonstrativo ----------
   Cliente DEMONSTRATIVO: tudo é fictício e fica só em memória (nada é gravado no servidor).
   A base vem de um gerador que monta um extrato no formato do Conta Azul, com datas relativas a
   hoje, e passa pelo MESMO caminho de leitura do relatório real. Recarregar a página volta ao
   estado original. */
const RELATORIO_ID = 'demonstrativo-fechamento-visao-geral';
const authHeader = localStorage.getItem('cm_admin_auth') || sessionStorage.getItem('cm_admin_auth') || '';
if (!authHeader) location.href = '../index.html';

""" + gen + """
function demoSeed() {
  const today = U.today();
  const settings = defaultSettings();
  settings.schema = SCHEMA;
  settings.mappingValidated = true;
  for (const [conta, a] of Object.entries(DEMO.ACCOUNTS)) settings.accounts[conta] = { cnpj: a.cnpj, type: a.type, validated: true };
  for (const o of DEMO.OBRAS) settings.obras[o.n] = { contratado: o.contrato, orcamento: Math.round(o.contrato * 0.83), nota: '', fonte: 'Contrato assinado' };
  settings.obras['Contratos de Manutenção'] = { contratado: 132000, orcamento: 66000, nota: 'Três contratos mensais de manutenção predial.', fonte: 'Contratos assinados' };
  const mk = (asOf, label, ts) => {
    const rows = DEMO.rows(today, asOf);
    const name = 'extrato_financeiro_' + asOf.replace(/-/g, '') + '.xlsx';
    const f = { fileName: name, size: 0, sheetName: 'Extrato Financeiro', sheets: ['Extrato Financeiro'], rows, headerIdx: 0 };
    const map = suggestMapping(rows[0]); const mapping = { [name]: map, __default: map };
    const built = buildRecords([f], mapping, settings);
    const v = { id: 'demo-' + asOf, at: ts, label, base: asOf, files: [{ name, size: 0, sheet: 'Extrato Financeiro', rows: rows.length }], headers: rows[0].map(P.text), records: built.records, ignored: built.ignored.length, mapping };
    const all = enrich(v.records, settings, asOf); const bal = accountBalances(all, settings, asOf);
    v.snapshot = {};
    for (const c of ['C', '01', '02']) { const p = project(all, settings, asOf, c, { balances: bal, days: 120 }); const eom = p.days.find(d => d.d === U.endOfMonth(asOf)); v.snapshot[c] = { base: asOf, start: p.start.total, eom: eom ? eom.fim : null, firstNeg: p.firstNeg ? p.firstNeg.d : null, min: p.minBal.v, minD: p.minBal.d, d30: (p.days[30] || {}).fim, ar: U.sum(byCnpj(all, c).filter(r => r.open && r.k === 'receita'), r => r.openAmt), ap: U.sum(byCnpj(all, c).filter(r => r.open && r.k === 'despesa'), r => r.openAmt) }; }
    settings.lastMapping = map;
    return v;
  };
  const prev = U.addDays(today, -7);
  const versions = [mk(prev, 'Atualização de ' + U.br(prev), new Date(prev + 'T18:00:00').getTime()), mk(today, 'Atualização de ' + U.br(today), Date.now() - 3600e3)];
  // saldos do extrato bancário conferidos e contas conciliadas até ontem (o que a CM faz toda semana)
  const allNow = enrich(versions[1].records, settings, today);
  for (const bk of accountBalances(allNow, settings, today)) {
    const a = settings.accounts[bk.conta]; if (!a) continue;
    if (bk.type !== 'cartao') a.conciliadoAte = U.addDays(today, -1);
    if (bk.type === 'banco' || bk.type === 'caixa') {
      // saldo do extrato informado no fim do mês do fechamento (é o que o Fechamento confere)
      let d = U.endOfMonth(fechMonthDefault() + '-01'); if (d > today) d = today;
      settings.openingBalances[bk.conta] = { valor: U.sum(bk.records.filter(r => r.effDate <= d), r => r.sign * (r.valor || 0)), data: d, fonte: 'Extrato bancário', nota: '' };
    }
  }
  return { settings, versions, activeId: versions[1].id };
}
const Store = {
  ok: true, remoteErr: null, cache: null, cacheAt: null, onRemoteChange: null,
  async open() { this.cache = demoSeed(); this.cacheAt = new Date().toISOString(); },
  async get(k) { return this.cache ? this.cache[k] : undefined; },
  async set(k, v) { if (!this.cache) this.cache = {}; this.cache[k] = v; },
  async checkRemote() {},
  async estimate() { return null; },
  async persist() { return true; },
};

"""
s = s[:p0] + persist + s[p1:]

open(REPO + '/portal/relatorios/demo.html', 'w', encoding='utf-8').write(s)
print('ok', len(s))
