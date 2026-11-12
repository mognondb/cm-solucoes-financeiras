/* Painel financeiro interativo (dados 100% fictícios) — estilo Power BI, embutido na home.
   Todo o painel é calculado a partir de uma lista de lançamentos gerada de forma determinística:
   filtrar por mês, categoria ou período recalcula KPIs, gráficos e tabela juntos (filtro cruzado). */
(function () {
  'use strict';
  const root = document.getElementById('dash');
  if (!root) return;

  /* ---------- formatação ---------- */
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const brl = v => (v < 0 ? '−' : '') + 'R$ ' + nf0.format(Math.abs(Math.round(v)));
  const pct = v => nf1.format(v * 100) + '%';
  const short = v => {
    const a = Math.abs(v), s = v < 0 ? '−' : '';
    if (a >= 1e6) return s + nf1.format(a / 1e6) + ' mi';
    if (a >= 1000) return s + nf1.format(a / 1000) + ' mil';
    return s + nf0.format(a);
  };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');

  function niceTicks(lo, hi, n) {
    const range = hi - lo || 1, rough = range / n, mag = Math.pow(10, Math.floor(Math.log10(rough))), norm = rough / mag;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    const nlo = Math.floor(lo / step) * step, nhi = Math.ceil(hi / step) * step, ticks = [];
    for (let t = nlo; t <= nhi + step * 1e-6; t += step) ticks.push(Math.round(t * 1e6) / 1e6);
    return { lo: nlo, hi: nhi, ticks };
  }

  /* ---------- dados fictícios (24 meses, terminando em out/2026) ---------- */
  const N = 24, LAST = 2026 * 12 + 9;
  const mesInfo = i => { const t = LAST - (N - 1 - i); return { m: t % 12, y: Math.floor(t / 12) }; };
  const lbl = i => { const { m, y } = mesInfo(i); return MES[m] + '/' + String(y).slice(2); };

  const RECS = [
    { nome: 'Serviços', base: 36000, cp: ['Alfa Engenharia Ltda', 'Beta Comércio ME', 'Gama Logística S/A', 'Delta Alimentos'], sh: [0.38, 0.28, 0.22, 0.12] },
    { nome: 'Produtos', base: 15500, cp: ['Loja Aurora', 'Distribuidora Sol', 'Mercado Central'], sh: [0.45, 0.33, 0.22] },
    { nome: 'Consultoria', base: 7800, cp: ['Instituto Horizonte', 'Grupo Vértice'], sh: [0.6, 0.4] },
  ];
  const DESPS = [
    { nome: 'Folha e pessoal', base: 21500, cp: ['Folha de pagamento', 'Pró-labore', 'Benefícios'], sh: [0.72, 0.15, 0.13] },
    { nome: 'Fornecedores', base: 9800, cp: ['Fornecedor Alfa', 'Fornecedor Beta', 'Fornecedor Gama'], sh: [0.45, 0.33, 0.22] },
    { nome: 'Marketing', base: 4800, cp: ['Agência Pulsar', 'Mídia paga'], sh: [0.55, 0.45] },
    { nome: 'Impostos e taxas', pct: 0.145, cp: ['Simples Nacional', 'ISS municipal'], sh: [0.82, 0.18] },
    { nome: 'Estrutura', base: 5200, cp: ['Aluguel', 'Energia e internet', 'Contabilidade'], sh: [0.58, 0.22, 0.2] },
  ];
  const COR = {
    'Serviços': '#4b5a42', 'Produtos': '#7d8f6e', 'Consultoria': '#a89a6a',
    'Folha e pessoal': '#3f4c39', 'Fornecedores': '#5f6f52', 'Marketing': '#8fa07f', 'Impostos e taxas': '#b18a52', 'Estrutura': '#cdbf9f',
  };

  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const TX = [];
  for (let i = 0; i < N; i++) {
    const m = mesInfo(i).m;
    const season = 1 + 0.06 * Math.sin((2 * Math.PI * (m - 8)) / 12);
    const g = 1 + 0.011 * i;
    let recTotal = 0;
    RECS.forEach(c => {
      const total = c.base * g * season * (1 + (rnd() - 0.5) * 0.09);
      c.cp.forEach((n, j) => {
        const v = Math.round((total * c.sh[j] * (1 + (rnd() - 0.5) * 0.14)) / 10) * 10;
        recTotal += v;
        TX.push({ i, d: 1 + Math.floor(rnd() * 28), n, c: c.nome, t: 'r', v });
      });
    });
    DESPS.forEach(c => {
      const total = c.pct ? recTotal * c.pct : c.base * (1 + 0.006 * i) * (1 + (rnd() - 0.5) * 0.08);
      c.cp.forEach((n, j) => {
        const v = Math.round((total * c.sh[j] * (1 + (rnd() - 0.5) * 0.1)) / 10) * 10;
        TX.push({ i, d: 1 + Math.floor(rnd() * 28), n, c: c.nome, t: 'd', v });
      });
    });
  }

  /* ---------- estado e agregações ---------- */
  const S = { n: 12, mes: null, cat: null, metric: null, sort: { k: 'd', dir: -1 }, all: false };
  const win = () => [N - S.n, N - 1];
  const cur = () => (S.mes != null ? [S.mes, S.mes] : win());
  const prev = () => {
    if (S.mes != null) return S.mes > 0 ? [S.mes - 1, S.mes - 1] : null;
    const a = N - 2 * S.n; return [a, a + S.n - 1];
  };
  function agg(a, b, cat) {
    let rec = 0, desp = 0;
    for (const t of TX) {
      if (t.i < a || t.i > b || (cat && t.c !== cat)) continue;
      if (t.t === 'r') rec += t.v; else desp += t.v;
    }
    return { rec, desp, res: rec - desp };
  }
  function byCat(a, b, tipo) {
    const m = new Map();
    for (const t of TX) if (t.i >= a && t.i <= b && t.t === tipo) m.set(t.c, (m.get(t.c) || 0) + t.v);
    return [...m].map(([nome, v]) => ({ nome, v })).sort((x, y) => y.v - x.v);
  }

  const KPIS = [
    { key: 'receita', label: 'Receita', get: x => x.rec, good: 1, fmt: brl },
    { key: 'despesa', label: 'Despesas', get: x => x.desp, good: -1, fmt: brl },
    { key: 'resultado', label: 'Resultado', get: x => x.res, good: 1, fmt: brl },
    { key: 'margem', label: 'Margem', get: x => (x.rec > 0 ? x.res / x.rec : null), good: 1, fmt: v => (v == null ? '—' : pct(v)) },
  ];
  const KCOR = { receita: '#5f6f52', despesa: '#bb8570', resultado: '#b18a52', margem: '#7d8f6e' };

  function deltaChip(k, c, p) {
    if (!p) return '<span class="chip flat">—</span>';
    const a = k.get(c), b = k.get(p);
    if (a == null || b == null) return '<span class="chip flat">—</span>';
    let v, txt;
    if (k.key === 'margem') { v = (a - b) * 100; txt = (v > 0 ? '+' : v < 0 ? '−' : '') + nf1.format(Math.abs(v)) + ' p.p.'; }
    else { if (b === 0) return '<span class="chip flat">—</span>'; v = ((a - b) / Math.abs(b)) * 100; txt = (v > 0 ? '+' : v < 0 ? '−' : '') + nf1.format(Math.abs(v)) + '%'; }
    const cls = Math.abs(v) < 0.05 ? 'flat' : (v * k.good > 0 ? 'good' : 'bad');
    return `<span class="chip ${cls}">${v > 0.05 ? '▲' : v < -0.05 ? '▼' : '•'} ${txt}</span>`;
  }

  function spark(k) {
    const [a, b] = win(), vals = [];
    for (let i = a; i <= b; i++) { const v = k.get(agg(i, i, S.cat)); vals.push(v == null ? 0 : v); }
    const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1, W = 100, H = 30;
    const px = j => (vals.length === 1 ? W / 2 : (j * W) / (vals.length - 1)), py = v => H - 3 - ((v - lo) / span) * (H - 8);
    const d = vals.map((v, j) => (j ? 'L' : 'M') + px(j).toFixed(1) + ' ' + py(v).toFixed(1)).join('');
    let mark = '';
    if (S.mes != null && S.mes >= a) { const x = px(S.mes - a); mark = `<line x1="${x}" x2="${x}" y1="0" y2="${H}" stroke="${KCOR[k.key]}" stroke-width="1" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" opacity=".6"/>`; }
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}L${W} ${H}L0 ${H}Z" fill="${KCOR[k.key]}" opacity=".10"/><path d="${d}" fill="none" stroke="${KCOR[k.key]}" stroke-width="1.8" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>${mark}</svg>`;
  }

  /* ---------- peças de HTML ---------- */
  function periodoLabel() { return S.mes != null ? lbl(S.mes) : S.n === 12 ? 'Últimos 12 meses' : 'Últimos ' + S.n + ' meses'; }

  function donutHTML() {
    const [a, b] = cur(), data = byCat(a, b, 'd'), total = data.reduce((s, x) => s + x.v, 0);
    if (!total) return '<p class="dv-empty">Sem dados.</p>';
    const SZ = 176, c = SZ / 2, R = 82, r = 54, gap = 0.012;
    const selDesp = S.cat && data.find(x => x.nome === S.cat);
    let ang = -Math.PI / 2, paths = '';
    data.forEach(x => {
      const frac = x.v / total, a0 = ang + gap, a1 = ang + frac * 2 * Math.PI - gap; ang += frac * 2 * Math.PI;
      const big = a1 - a0 > Math.PI ? 1 : 0, p = (rad, t) => [(c + rad * Math.cos(t)).toFixed(2), (c + rad * Math.sin(t)).toFixed(2)];
      const [x0, y0] = p(R, a0), [x1, y1] = p(R, a1), [x2, y2] = p(r, a1), [x3, y3] = p(r, a0);
      const mid = (a0 + a1) / 2, sel = S.cat === x.nome, off = sel ? 4 : 0;
      const dim = S.cat && !sel ? ' is-dim' : '';
      paths += `<path class="sl${dim}" d="M${x0} ${y0}A${R} ${R} 0 ${big} 1 ${x1} ${y1}L${x2} ${y2}A${r} ${r} 0 ${big} 0 ${x3} ${y3}Z" fill="${COR[x.nome]}" transform="translate(${(off * Math.cos(mid)).toFixed(2)} ${(off * Math.sin(mid)).toFixed(2)})" role="button" tabindex="0" data-act="cat" data-v="${esc(x.nome)}" aria-label="${esc(x.nome)}: ${brl(x.v)}" aria-pressed="${sel}" data-tip="<b>${esc(x.nome)}</b><br>${brl(x.v)} · ${pct(frac)}"/>`;
    });
    const centro = selDesp ? `<text x="${c}" y="${c - 2}" text-anchor="middle" class="dn-v">${short(selDesp.v)}</text><text x="${c}" y="${c + 16}" text-anchor="middle" class="dn-l">${pct(selDesp.v / total)} do total</text>`
      : `<text x="${c}" y="${c - 2}" text-anchor="middle" class="dn-v">${short(total)}</text><text x="${c}" y="${c + 16}" text-anchor="middle" class="dn-l">despesas</text>`;
    const leg = data.map(x => {
      const sel = S.cat === x.nome, dim = S.cat && !sel ? ' is-dim' : '';
      return `<button class="dlg${sel ? ' is-sel' : ''}${dim}" data-act="cat" data-v="${esc(x.nome)}" aria-pressed="${sel}"><i style="background:${COR[x.nome]}"></i><span>${esc(x.nome)}</span><b>${brl(x.v)}</b><em>${pct(x.v / total)}</em></button>`;
    }).join('');
    return `<div class="donut-wrap"><svg class="donut" viewBox="0 0 ${SZ} ${SZ}" role="group" aria-label="Despesas por categoria">${paths}${centro}</svg><div class="dlgs">${leg}</div></div>`;
  }

  function revBarsHTML() {
    const [a, b] = cur(), data = byCat(a, b, 'r'), max = Math.max(...data.map(x => x.v), 1), total = data.reduce((s, x) => s + x.v, 0);
    return '<div class="hbars">' + data.map(x => {
      const sel = S.cat === x.nome, dim = S.cat && !sel ? ' is-dim' : '';
      return `<button class="hb${sel ? ' is-sel' : ''}${dim}" data-act="cat" data-v="${esc(x.nome)}" aria-pressed="${sel}" data-tip="<b>${esc(x.nome)}</b><br>${brl(x.v)} · ${pct(x.v / total)} da receita"><span class="hb-t"><span>${esc(x.nome)}</span><b>${brl(x.v)}</b></span><span class="hb-bar"><i style="width:${(x.v / max) * 100}%;background:${COR[x.nome]}"></i></span></button>`;
    }).join('') + '</div>' + revFactsHTML(a, b);
  }

  function revFactsHTML(a, b) {
    const revCat = RECS.some(r => r.nome === S.cat);
    const rows = TX.filter(t => t.t === 'r' && t.i >= a && t.i <= b && (!revCat || t.c === S.cat));
    const tot = rows.reduce((s, t) => s + t.v, 0), n = rows.length, meses = b - a + 1;
    const maior = rows.reduce((m, t) => (t.v > m ? t.v : m), 0);
    const f = (l, v) => `<div class="rf"><span>${l}</span><b>${v}</b></div>`;
    return `<div class="rev-facts">${f('Recebimentos', n)}${f('Ticket médio', n ? brl(tot / n) : '—')}${f('Receita por mês', brl(tot / meses))}${f('Maior recebimento', n ? brl(maior) : '—')}</div>`;
  }

  function tableHTML() {
    const [a, b] = cur();
    const rows = TX.filter(t => t.i >= a && t.i <= b && (!S.cat || t.c === S.cat));
    const key = { d: t => t.i * 100 + t.d, n: t => t.n, c: t => t.c, v: t => (t.t === 'r' ? t.v : -t.v) }[S.sort.k];
    rows.sort((x, y) => { const A = key(x), B = key(y); return (A < B ? -1 : A > B ? 1 : 0) * S.sort.dir; });
    const shown = S.all ? rows : rows.slice(0, 8);
    const th = (k, l, right) => `<th class="${right ? 'r' : ''}${k === 'c' ? ' c-cat' : ''}" aria-sort="${S.sort.k === k ? (S.sort.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button data-act="sort" data-k="${k}">${l}<i>${S.sort.k === k ? (S.sort.dir > 0 ? '▲' : '▼') : ''}</i></button></th>`;
    const body = shown.map(t => {
      const { m, y } = mesInfo(t.i);
      return `<tr><td>${pad(t.d)}/${pad(m + 1)}/${String(y).slice(2)}</td><td><span class="cdot m-only" style="background:${COR[t.c]}"></span>${esc(t.n)}</td><td class="c-cat"><span class="cdot" style="background:${COR[t.c]}"></span>${esc(t.c)}</td><td class="r ${t.t === 'r' ? 'pos' : 'neg'}">${t.t === 'r' ? '+' : '−'} ${brl(t.v).replace('−', '')}</td></tr>`;
    }).join('') || '<tr><td colspan="4" class="dv-empty">Nenhum lançamento.</td></tr>';
    const more = rows.length > 8 ? `<button class="tbl-more" data-act="more">${S.all ? 'Mostrar menos' : 'Ver todos os ' + rows.length + ' lançamentos'}</button>` : '';
    return `<div class="tbl-wrap${S.all ? ' is-all' : ''}"><table class="tbl"><thead><tr>${th('d', 'Data')}${th('n', 'Lançamento')}${th('c', 'Categoria')}${th('v', 'Valor', true)}</tr></thead><tbody>${body}</tbody></table></div>${more}`;
  }

  /* ---------- gráfico de tendência (SVG, responsivo à largura real) ---------- */
  function drawTrend() {
    const body = root.querySelector('#trendBody');
    if (!body) return;
    body.innerHTML = '';
    const W = Math.max(300, Math.floor(body.clientWidth)), compact = W < 560, base = compact ? 232 : 272;
    const H = Math.min(420, Math.max(base, Math.floor(body.clientHeight)));
    const [a0, b0] = win(), data = [];
    for (let i = a0; i <= b0; i++) { const x = agg(i, i, S.cat); data.push({ i, ...x, mar: x.rec > 0 ? (x.res / x.rec) * 100 : 0 }); }
    const mode = S.metric, n = data.length;
    const pick = d => (mode === 'receita' ? d.rec : mode === 'despesa' ? d.desp : mode === 'margem' ? d.mar : d.res);
    const vals = !mode ? data.flatMap(d => [d.rec, d.desp, d.res]) : data.map(pick);
    const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
    const sc = niceTicks(lo, hi === lo ? lo + 1 : hi, compact ? 4 : 5);
    const pl = compact ? 40 : 50, pr = 8, pt = 14, pb = 26, iw = W - pl - pr, ih = H - pt - pb, band = iw / n;
    const y = v => pt + (ih * (sc.hi - v)) / (sc.hi - sc.lo), fmtAx = mode === 'margem' ? v => Math.round(v) + '%' : short;
    let g = '';
    sc.ticks.forEach(t => { g += `<line x1="${pl}" x2="${W - pr}" y1="${y(t)}" y2="${y(t)}" class="${t === 0 ? 'tr-zero' : 'tr-grid'}"/><text x="${pl - 8}" y="${y(t) + 4}" class="tr-ax" text-anchor="end">${fmtAx(t)}</text>`; });
    const step = Math.max(1, Math.ceil(38 / band));
    const bar = (x, w, v, cls) => { const top = y(Math.max(v, 0)), h = Math.max(1, Math.abs(y(v) - y(0))); return `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(4, w / 2)}" class="${cls}"/>`; };
    const pts = [];
    data.forEach((d, k) => {
      const x0 = pl + k * band, cx = x0 + band / 2, sel = S.mes === d.i, dim = S.mes != null && !sel ? ' is-dim' : '';
      if (sel) g += `<rect x="${x0}" y="${pt}" width="${band}" height="${ih}" class="band-sel"/>`;
      g += `<g class="bg${dim}">`;
      if (!mode) {
        const bw = Math.min(18, band * 0.3);
        g += bar(cx - bw - 1, bw, d.rec, 'b-rec') + bar(cx + 1, bw, d.desp, 'b-desp');
        pts.push({ cx, cy: y(d.res), dim });
      } else {
        const bw = Math.min(30, band * 0.52), v = pick(d), cls = mode === 'receita' ? 'b-rec' : mode === 'despesa' ? 'b-desp' : mode === 'margem' ? 'b-mar' : (v < 0 ? 'b-desp' : 'b-res');
        g += bar(cx - bw / 2, bw, v, cls);
        if (band >= 42) g += `<text x="${cx}" y="${v >= 0 ? y(v) - 6 : y(v) + 14}" text-anchor="middle" class="tr-val">${mode === 'margem' ? nf1.format(v) + '%' : short(v)}</text>`;
      }
      g += '</g>';
      if (k % step === (n - 1) % step) g += `<text x="${cx}" y="${H - 8}" class="tr-ax${sel ? ' tr-ax-sel' : ''}" text-anchor="middle">${lbl(d.i)}</text>`;
    });
    if (!mode && pts.length) {
      g += `<path class="l-res" d="${pts.map((p, j) => (j ? 'L' : 'M') + p.cx.toFixed(1) + ' ' + p.cy.toFixed(1)).join('')}"/>`;
      pts.forEach(p => { g += `<circle class="p-res${p.dim}" cx="${p.cx.toFixed(1)}" cy="${p.cy.toFixed(1)}" r="3.6"/>`; });
    }
    data.forEach((d, k) => {
      const tip = `<b>${lbl(d.i)}</b><br>Receita ${brl(d.rec)}<br>Despesas ${brl(d.desp)}<br>Resultado ${brl(d.res)}`;
      g += `<rect class="hit" x="${pl + k * band}" y="${pt}" width="${band}" height="${ih}" role="button" tabindex="0" data-act="mes" data-i="${d.i}" aria-pressed="${S.mes === d.i}" aria-label="${lbl(d.i)}: receita ${brl(d.rec)}, despesas ${brl(d.desp)}" data-tip="${esc(tip)}"/>`;
    });
    body.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="group" aria-label="Evolução mensal">${g}</svg>`;
  }

  /* ---------- render ---------- */
  function captureFocus() {
    const el = document.activeElement;
    if (!el || !root.contains(el) || !el.dataset || !el.dataset.act) return null;
    return { act: el.dataset.act, i: el.dataset.i, v: el.dataset.v, k: el.dataset.k, n: Array.prototype.indexOf.call(root.querySelectorAll(selFor(el.dataset)), el) };
  }
  function selFor(d) {
    let sel = `[data-act="${d.act}"]`;
    if (d.i != null) sel += `[data-i="${d.i}"]`;
    if (d.v != null) sel += `[data-v="${CSS.escape(d.v)}"]`;
    if (d.k != null) sel += `[data-k="${d.k}"]`;
    return sel;
  }
  function restoreFocus(f) {
    if (!f) return;
    // mesmo gatilho pode existir em mais de um visual (fatia, legenda, barra): volta ao mesmo elemento
    const els = root.querySelectorAll(selFor(f));
    const el = els[Math.max(0, f.n)] || els[0];
    if (el) el.focus({ preventScroll: true });
  }

  function render() {
    const f = captureFocus();
    const [ca, cb] = cur(), pr = prev(), c = agg(ca, cb, S.cat), p = pr ? agg(pr[0], pr[1], S.cat) : null;
    const has = S.mes != null || S.cat;
    const cmp = S.mes != null ? 'vs. mês anterior' : 'vs. período anterior';
    const chips = has
      ? `${S.mes != null ? `<button class="fchip" data-act="clearMes">Mês: ${lbl(S.mes)} <b aria-hidden="true">×</b><span class="sr">remover filtro</span></button>` : ''}${S.cat ? `<button class="fchip" data-act="clearCat">Categoria: ${esc(S.cat)} <b aria-hidden="true">×</b><span class="sr">remover filtro</span></button>` : ''}`
      : '<span class="dash-hint"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3l14 7-6 2-2 6z"/></svg> Clique em um mês, numa categoria ou num indicador — todo o painel se filtra junto.</span>';
    const kpis = KPIS.map(k => {
      const sel = S.metric === k.key;
      return `<button class="dk${sel ? ' is-sel' : ''}" data-act="metric" data-v="${k.key}" aria-pressed="${sel}"><span class="dk-l">${k.label}</span><span class="dk-v">${k.fmt(k.get(c))}</span><span class="dk-d">${deltaChip(k, c, p)}<small>${cmp}</small></span>${spark(k)}</button>`;
    }).join('');
    const legend = !S.metric
      ? '<span><i class="lg lg-rec"></i>Receita</span><span><i class="lg lg-desp"></i>Despesas</span><span><i class="lg lg-res"></i>Resultado</span>'
      : `<span><i class="lg" style="background:${KCOR[S.metric]}"></i>${KPIS.find(k => k.key === S.metric).label}</span>`;
    const nTx = TX.filter(t => t.i >= ca && t.i <= cb && (!S.cat || t.c === S.cat)).length;

    root.innerHTML = `
      <div class="dash-top">
        <div class="dash-title"><span class="dash-eyebrow">Painel financeiro</span><strong>Empresa Modelo Ltda</strong><span class="dash-pill">dados fictícios</span></div>
        <div class="dash-controls">
          <div class="seg" role="group" aria-label="Período">${[3, 6, 12].map(n => `<button data-act="n" data-v="${n}" aria-pressed="${S.n === n}">${n}M</button>`).join('')}</div>
          <button class="dash-clear" data-act="clear" ${has ? '' : 'disabled'}>Limpar filtros</button>
        </div>
      </div>
      <div class="dash-filters">${chips}</div>
      <div class="dash-kpis">${kpis}</div>
      <div class="dash-grid">
        <section class="dv dv-trend"><header class="dv-h"><h3>Evolução mensal${S.cat ? ' · ' + esc(S.cat) : ''}</h3><div class="dv-legend">${legend}</div></header><div id="trendBody" class="dv-body"></div></section>
        <section class="dv dv-donut"><header class="dv-h"><h3>Despesas por categoria</h3><span class="dv-sub">${periodoLabel()}</span></header>${donutHTML()}</section>
        <section class="dv dv-rev"><header class="dv-h"><h3>Receita por linha</h3><span class="dv-sub">${periodoLabel()}</span></header>${revBarsHTML()}</section>
        <section class="dv dv-table"><header class="dv-h"><h3>Lançamentos</h3><span class="dv-sub">${nTx} no período · ${periodoLabel()}</span></header>${tableHTML()}</section>
      </div>`;
    drawTrend();
    restoreFocus(f);
  }

  /* ---------- interação ---------- */
  function act(el) {
    const a = el.dataset.act;
    if (a === 'mes') { const i = +el.dataset.i; S.mes = S.mes === i ? null : i; }
    else if (a === 'cat') { S.cat = S.cat === el.dataset.v ? null : el.dataset.v; S.all = false; }
    else if (a === 'metric') { S.metric = S.metric === el.dataset.v ? null : el.dataset.v; }
    else if (a === 'n') { S.n = +el.dataset.v; if (S.mes != null && S.mes < N - S.n) S.mes = null; }
    else if (a === 'clear') { S.mes = null; S.cat = null; }
    else if (a === 'clearMes') S.mes = null;
    else if (a === 'clearCat') S.cat = null;
    else if (a === 'sort') { const k = el.dataset.k; S.sort = S.sort.k === k ? { k, dir: -S.sort.dir } : { k, dir: k === 'd' || k === 'v' ? -1 : 1 }; }
    else if (a === 'more') S.all = !S.all;
    else return;
    render();
  }
  root.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (el && root.contains(el)) act(el); });
  root.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest('[data-act]');
    if (el && el.tagName !== 'BUTTON') { e.preventDefault(); act(el); }
  });

  const tip = document.createElement('div');
  tip.className = 'dash-tip'; tip.setAttribute('role', 'tooltip');
  document.body.appendChild(tip);
  root.addEventListener('mousemove', e => {
    const t = e.target.closest('[data-tip]');
    if (!t) { tip.style.display = 'none'; return; }
    tip.innerHTML = t.getAttribute('data-tip'); tip.style.display = 'block';
    let x = e.clientX + 14, y = e.clientY + 14; const r = tip.getBoundingClientRect();
    if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
    if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  });
  root.addEventListener('mouseleave', () => { tip.style.display = 'none'; });

  let lastW = 0, raf = 0;
  const redraw = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(drawTrend); };
  if ('ResizeObserver' in window) {
    new ResizeObserver(entries => {
      const w = Math.round(entries[0].contentRect.width);
      if (Math.abs(w - lastW) >= 8) { lastW = w; redraw(); }
    }).observe(root);
  } else window.addEventListener('resize', redraw);

  render();
  lastW = Math.round(root.getBoundingClientRect().width);
})();
