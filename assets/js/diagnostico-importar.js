/* ==========================================================================
   CM Diagnóstico — leitura de extratos (OFX, CSV, XLSX) no navegador.
   PRIVACIDADE: o arquivo é lido aqui, na máquina da pessoa. Nada daqui faz requisição de rede.
   Só os totais por categoria (D.importar.fechar → resumo) podem ir para a CM, e só se a pessoa enviar o diagnóstico.

   Fluxo:  lerArquivo(nome, bytes)  →  juntar([...])  →  analisar(transacoes)  →  fechar(analise, escolhas, opcoes)
   Uma transação é { data: 'AAAA-MM-DD', desc, valor (+ entrada / − saída), cat?, saldo? }.
   ========================================================================== */
(function (g) {
  'use strict';
  var D = g.CMDiag = g.CMDiag || {};
  var I = D.importar = {};
  var LIM_BYTES = 15 * 1024 * 1024, LIM_LINHAS = 60000, LIM_ZIP = 80 * 1024 * 1024;
  var DIA_MS = 86400000, MES_DIAS = 30.4375;

  /* ------------------------------------------------------------------ utilidades */
  function semAcento(s) { return String(s === null || s === undefined ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function norm(s) { return semAcento(s).toUpperCase().replace(/\s+/g, ' ').trim(); }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function r2(x) { return Math.round(x * 100) / 100; }
  function dataOk(y, m, d) {
    if (y < 2000 || y > 2100) return false;
    var t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
  }
  function iso(y, m, d) { return dataOk(y, m, d) ? y + '-' + p2(m) + '-' + p2(d) : null; }
  function erro(msg) { var e = new Error(msg); e.amigavel = true; return e; }

  /* datas em vários jeitos: 31/12/2026, 31/12/26, 31-12-2026, 31.12.2026, 2026-12-31, 20261231, série do Excel */
  function lerData(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') {
      if (v >= 36526 && v <= 73415) { var t = new Date(Math.round((v - 25569) * DIA_MS)); return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); }
      return null;
    }
    var s = String(v).trim(), m;
    if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) return iso(+m[1], +m[2], +m[3]);
    if ((m = /^(\d{4})(\d{2})(\d{2})(?:\d{0,9})(?:\D|$)/.exec(s))) return iso(+m[1], +m[2], +m[3]); // AAAAMMDD, com ou sem hora (OFX)
    if ((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/.exec(s))) return iso(+m[3], +m[2], +m[1]);
    if ((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2})(?:\D|$)/.exec(s))) return iso(2000 + +m[3], +m[2], +m[1]);
    return null;
  }

  /* números no formato brasileiro e no internacional: R$ 1.234,56 · 1234.56 · (123,45) · 123,45- · 123,45 D */
  function lerNumero(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (v === null || v === undefined) return null;
    var s = String(v).trim(), neg = false;
    if (!s) return null;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1).trim(); }
    if (/-$/.test(s)) { neg = true; s = s.slice(0, -1).trim(); }
    if (/\s[Dd]$/.test(s)) { neg = true; s = s.slice(0, -1).trim(); } else if (/\s[Cc]$/.test(s)) s = s.slice(0, -1).trim();
    s = s.replace(/R\$|\s/g, '');
    if (s.charAt(0) === '-') { neg = true; s = s.slice(1); } else if (s.charAt(0) === '+') s = s.slice(1);
    if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
    if (s.indexOf(',') !== -1 && s.indexOf('.') !== -1) {
      s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (s.indexOf(',') !== -1) {
      if ((s.match(/,/g) || []).length > 1) return null;
      s = s.replace(',', '.');
    } else if (s.indexOf('.') !== -1) {
      if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // 1.234 ou 1.234.567: milhar
      else if ((s.match(/\./g) || []).length > 1) return null;
    }
    var n = parseFloat(s);
    if (!isFinite(n)) return null;
    return neg ? -n : n;
  }
  I._lerNumero = lerNumero; I._lerData = lerData;
  I.numero = lerNumero; // para os campos de valor digitados na tela

  /* ------------------------------------------------------------------ texto: UTF-8 ou Windows-1252 */
  function decodificar(bytes) {
    var u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(u).replace(/^﻿/, ''); } catch (e) { /* não é UTF-8 */ }
    return new TextDecoder('windows-1252').decode(u);
  }

  /* ------------------------------------------------------------------ OFX */
  function tagOfx(bloco, t) { var m = new RegExp('<' + t + '>([^<\\r\\n]*)', 'i').exec(bloco); return m ? m[1].trim() : ''; }
  function entidades(s) { return String(s).replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&apos;/gi, "'").replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(+n); }); }

  function lerOFX(texto) {
    var trans = [], re = /<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>|<\/CCSTMTRS>|<\/STMTRS>|$)/gi, m;
    while ((m = re.exec(texto))) {
      var b = m[1], d = lerData(tagOfx(b, 'DTPOSTED')), v = lerNumero(tagOfx(b, 'TRNAMT').replace(',', '.'));
      if (!d || v === null) continue;
      var nome = entidades(tagOfx(b, 'NAME')), memo = entidades(tagOfx(b, 'MEMO'));
      var desc = memo && nome && memo.toUpperCase().indexOf(nome.toUpperCase()) === -1 ? nome + ' ' + memo : (memo || nome);
      trans.push({ data: d, desc: desc.slice(0, 200), valor: v, id: tagOfx(b, 'FITID') });
    }
    if (!trans.length) throw erro('Não encontrei lançamentos neste arquivo OFX.');
    // saldo final informado pelo banco (por conta)
    var saldos = {};
    var contas = texto.split(/<BANKACCTFROM>|<CCACCTFROM>/i);
    for (var i = 1; i < contas.length; i++) {
      var conta = tagOfx(contas[i], 'ACCTID') || ('c' + i), lb = /<LEDGERBAL>([\s\S]*?)(?:<\/LEDGERBAL>|<\/STMTRS>|<\/CCSTMTRS>|$)/i.exec(contas[i]);
      if (lb) { var bal = lerNumero(tagOfx(lb[1], 'BALAMT').replace(',', '.')), dt = lerData(tagOfx(lb[1], 'DTASOF')); if (bal !== null) saldos[conta] = { valor: bal, data: dt }; }
    }
    var pIni = lerData(tagOfx(texto, 'DTSTART')), pFim = lerData(tagOfx(texto, 'DTEND'));
    return { formato: 'ofx', cartao: /<CREDITCARDMSGSRSV1>|<CCSTMTRS>/i.test(texto), transacoes: trans, saldos: saldos, periodo: pIni && pFim && pIni <= pFim ? { ini: pIni, fim: pFim } : null };
  }

  /* ------------------------------------------------------------------ CSV */
  function dividirCsv(texto, delim) {
    var linhas = [], linha = [], campo = '', aspas = false, i = 0, n = texto.length, c;
    while (i < n) {
      c = texto.charAt(i);
      if (aspas) {
        if (c === '"') { if (texto.charAt(i + 1) === '"') { campo += '"'; i++; } else aspas = false; } else campo += c;
      } else if (c === '"') aspas = true;
      else if (c === delim) { linha.push(campo); campo = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && texto.charAt(i + 1) === '\n') i++;
        linha.push(campo); campo = '';
        if (linha.length > 1 || linha[0] !== '') linhas.push(linha);
        linha = [];
        if (linhas.length > LIM_LINHAS) throw erro('O arquivo tem linhas demais (limite de ' + LIM_LINHAS.toLocaleString('pt-BR') + ').');
      } else campo += c;
      i++;
    }
    linha.push(campo); if (linha.length > 1 || linha[0] !== '') linhas.push(linha);
    return linhas;
  }
  function detectarDelim(texto) {
    var amostra = texto.split(/\r?\n/).filter(function (l) { return l.trim(); }).slice(0, 25), melhor = ';', placar = -1;
    [';', ',', '\t', '|'].forEach(function (d) {
      var cont = amostra.map(function (l) { return dividirCsv(l, d)[0].length; }), freq = {};
      cont.forEach(function (c) { freq[c] = (freq[c] || 0) + 1; });
      var modo = 0, f = 0; Object.keys(freq).forEach(function (k) { if (freq[k] > f || (freq[k] === f && +k > modo)) { f = freq[k]; modo = +k; } });
      var pt = modo >= 2 ? f * 10 + modo : 0;
      if (pt > placar) { placar = pt; melhor = d; }
    });
    return melhor;
  }

  /* tabela (linhas de células texto/número) → transações. Reconhece o cabeçalho pelas palavras das colunas. */
  var COL = {
    data: function (h) { return /(^|\b)(DATA|DATE|DT)(\b|$)/.test(h); },
    valor: function (h) { return /(^|\b)(VALOR|AMOUNT|QUANTIA|VLR)(\b|$)/.test(h) && !/SALDO/.test(h); },
    cred: function (h) { return /(^|\b)(CREDITO|CREDIT|ENTRADAS?|RECEITA)(\b|$)/.test(h); },
    deb: function (h) { return /(^|\b)(DEBITO|DEBIT|SAIDAS?|DESPESA)(\b|$)/.test(h); },
    tipo: function (h) { return /^(TIPO|NATUREZA|D\/C|C\/D|DC|OPERACAO|DEBITO\/CREDITO|CREDITO\/DEBITO)$/.test(h); },
    saldo: function (h) { return /SALDO|BALANCE/.test(h); },
    cat: function (h) { return /CATEGORIA|PLANO DE CONTAS|CLASSIFICACAO|CATEGORY/.test(h); },
    desc: function (h) { return /(HISTORICO|DESCRI|LANCAMENTO|MEMO|DETALHE|FAVORECIDO|NOME|TRANSACAO|OBSERVACAO|COMPLEMENTO)/.test(h); },
  };
  function lerTabela(linhas) {
    var cab = -1, mapa = null;
    for (var i = 0; i < Math.min(linhas.length, 40) && cab < 0; i++) {
      var hs = linhas[i].map(function (c) { return norm(c); });
      var iData = -1, ds = [];
      hs.forEach(function (h, j) { if (COL.data(h)) ds.push(j); });
      // prefere a data de lançamento/movimento/pagamento à de vencimento ou competência
      iData = ds.filter(function (j) { return !/VENCIMENTO|COMPETENCIA|EMISSAO/.test(hs[j]); })[0];
      if (iData === undefined) iData = ds[0];
      var temV = hs.some(function (h) { return COL.valor(h); }), temCD = hs.some(function (h) { return COL.cred(h); }) && hs.some(function (h) { return COL.deb(h); });
      if (iData !== undefined && (temV || temCD)) {
        cab = i; mapa = { data: iData, valor: -1, cred: -1, deb: -1, tipo: -1, saldo: -1, cat: -1, desc: [] };
        hs.forEach(function (h, j) {
          if (j === iData) return;
          if (COL.saldo(h)) mapa.saldo = j;
          else if (COL.valor(h) && mapa.valor < 0) mapa.valor = j;
          else if (COL.cred(h) && mapa.cred < 0) mapa.cred = j;
          else if (COL.deb(h) && mapa.deb < 0) mapa.deb = j;
          else if (COL.tipo(h) && mapa.tipo < 0) mapa.tipo = j;
          else if (COL.cat(h) && mapa.cat < 0) mapa.cat = j;
          else if (COL.desc(h) && !COL.data(h)) mapa.desc.push(j);
        });
      }
    }
    if (cab < 0) throw erro('Não reconheci as colunas deste arquivo. Ele precisa ter, no mínimo, uma coluna de data e uma de valor (ou de crédito e débito).');
    var trans = [], saldoUlt = null, dataUlt = null;
    for (var k = cab + 1; k < linhas.length; k++) {
      var L = linhas[k], d = lerData(L[mapa.data]);
      if (!d) continue;
      var v = null;
      if (mapa.valor >= 0) {
        v = lerNumero(L[mapa.valor]);
        if (v !== null && mapa.tipo >= 0) {
          var t = norm(L[mapa.tipo]);
          if (/^(D|DEB|DEBITO|SAIDA|DESPESA|PAGAMENTO)/.test(t)) v = -Math.abs(v); else if (/^(C|CRED|CREDITO|ENTRADA|RECEITA|RECEBIMENTO)/.test(t)) v = Math.abs(v);
        }
      } else {
        var c = lerNumero(L[mapa.cred]), db = lerNumero(L[mapa.deb]);
        if (c || db) v = (c ? Math.abs(c) : 0) - (db ? Math.abs(db) : 0);
      }
      if (v === null || v === 0) continue;
      var desc = mapa.desc.map(function (j) { return L[j] === undefined || L[j] === null ? '' : String(L[j]).trim(); }).filter(Boolean).join(' ');
      var tr = { data: d, desc: desc.slice(0, 200), valor: v };
      if (mapa.cat >= 0 && L[mapa.cat]) tr.cat = String(L[mapa.cat]).trim().slice(0, 80);
      if (mapa.saldo >= 0) { var sd = lerNumero(L[mapa.saldo]); if (sd !== null && (!dataUlt || d >= dataUlt)) { saldoUlt = sd; dataUlt = d; } }
      trans.push(tr);
    }
    if (!trans.length) throw erro('Encontrei as colunas, mas nenhum lançamento com data e valor.');
    var out = { formato: 'tabela', transacoes: trans, saldos: {} };
    if (saldoUlt !== null) out.saldos.arquivo = { valor: saldoUlt, data: dataUlt };
    return out;
  }
  function lerCSV(texto) { return lerTabela(dividirCsv(texto, detectarDelim(texto))); }

  /* ------------------------------------------------------------------ XLSX (zip + XML, sem biblioteca) */
  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
  async function inflar(bytes) {
    if (typeof DecompressionStream === 'undefined') throw erro('Este navegador não consegue abrir arquivos .xlsx. Use o OFX ou exporte a planilha em CSV.');
    var s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    var buf = await new Response(s).arrayBuffer();
    if (buf.byteLength > LIM_ZIP) throw erro('A planilha é grande demais para abrir aqui.');
    return new Uint8Array(buf);
  }
  function lerZip(bytes) {
    var eocd = -1;
    for (var i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (u32(bytes, i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw erro('Este arquivo não parece uma planilha .xlsx válida.');
    var total = u16(bytes, eocd + 10), off = u32(bytes, eocd + 16), entradas = {};
    for (var n = 0; n < total; n++) {
      if (u32(bytes, off) !== 0x02014b50) break;
      var met = u16(bytes, off + 10), comp = u32(bytes, off + 20), desc = u32(bytes, off + 24), nl = u16(bytes, off + 28), el = u16(bytes, off + 30), cl = u16(bytes, off + 32), loc = u32(bytes, off + 42);
      var nome = new TextDecoder('utf-8').decode(bytes.subarray(off + 46, off + 46 + nl));
      entradas[nome] = { met: met, comp: comp, desc: desc, loc: loc };
      off += 46 + nl + el + cl;
    }
    return {
      nomes: Object.keys(entradas),
      ler: async function (nome) {
        var e = entradas[nome]; if (!e) return null;
        if (e.desc > LIM_ZIP) throw erro('A planilha é grande demais para abrir aqui.');
        var o = e.loc; if (u32(bytes, o) !== 0x04034b50) throw erro('Arquivo .xlsx danificado.');
        var ini = o + 30 + u16(bytes, o + 26) + u16(bytes, o + 28), dados = bytes.subarray(ini, ini + e.comp);
        if (e.met === 0) return dados;
        if (e.met === 8) return inflar(dados);
        throw erro('Compressão da planilha não suportada. Exporte em CSV.');
      },
    };
  }
  function colunaDe(ref) { var m = /^([A-Z]+)/.exec(ref), n = 0; if (!m) return 0; for (var i = 0; i < m[1].length; i++) n = n * 26 + (m[1].charCodeAt(i) - 64); return n - 1; }
  function textoXml(s) { var t = '', re = /<t\b[^>]*>([\s\S]*?)<\/t>/g, m; while ((m = re.exec(s))) t += m[1]; return entidades(t); }
  function lerPlanilha(xml, strings) {
    var linhas = [], reL = /<row\b[^>]*>([\s\S]*?)<\/row>/g, mL;
    while ((mL = reL.exec(xml))) {
      var cel = [], reC = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, mC;
      while ((mC = reC.exec(mL[1]))) {
        var at = mC[1], corpo = mC[2] || '', ref = /\br="([A-Z]+\d+)"/.exec(at), tp = /\bt="(\w+)"/.exec(at), j = ref ? colunaDe(ref[1]) : cel.length, val = null;
        var v = /<v>([\s\S]*?)<\/v>/.exec(corpo);
        if (tp && tp[1] === 's') val = v ? (strings[+v[1]] === undefined ? '' : strings[+v[1]]) : null;
        else if (tp && tp[1] === 'inlineStr') val = textoXml(corpo);
        else if (tp && (tp[1] === 'str' || tp[1] === 'e')) val = v ? entidades(v[1]) : null;
        else if (v) { var num = parseFloat(v[1]); val = isFinite(num) ? num : entidades(v[1]); }
        cel[j] = val === undefined ? null : val;
      }
      for (var q = 0; q < cel.length; q++) if (cel[q] === undefined) cel[q] = null;
      if (cel.length) linhas.push(cel);
      if (linhas.length > LIM_LINHAS) throw erro('A planilha tem linhas demais (limite de ' + LIM_LINHAS.toLocaleString('pt-BR') + ').');
    }
    return linhas;
  }
  async function lerXLSX(bytes) {
    var zip = lerZip(bytes), dec = new TextDecoder('utf-8'), strings = [];
    var ss = await zip.ler('xl/sharedStrings.xml');
    if (ss) { var xs = dec.decode(ss), re = /<si\b[^>]*>([\s\S]*?)<\/si>/g, m; while ((m = re.exec(xs))) strings.push(textoXml(m[1])); }
    var abas = zip.nomes.filter(function (n) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(n); }).sort(function (a, b) { return parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10); });
    if (!abas.length) throw erro('Não encontrei nenhuma aba nesta planilha.');
    var ultimoErro = null;
    for (var i = 0; i < abas.length; i++) {
      try { return lerTabela(lerPlanilha(dec.decode(await zip.ler(abas[i])), strings)); } catch (e) { if (!e.amigavel) throw e; ultimoErro = e; }
    }
    throw ultimoErro;
  }

  /* ------------------------------------------------------------------ ponto de entrada de um arquivo */
  I.lerArquivo = async function (nome, buffer) {
    var bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (bytes.length > LIM_BYTES) throw erro('O arquivo é grande demais (limite de 15 MB).');
    if (!bytes.length) throw erro('O arquivo está vazio.');
    var r;
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) throw erro('PDF não é aceito: a leitura não é confiável. Baixe o extrato em OFX, CSV ou Excel (.xlsx) no site ou app do seu banco.');
    if (bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0) throw erro('Este é um Excel antigo (.xls). Abra e salve como .xlsx ou CSV e envie de novo.');
    if (bytes[0] === 0x50 && bytes[1] === 0x4B) r = await lerXLSX(bytes);
    else {
      var texto = decodificar(bytes);
      if (/<OFX>|OFXHEADER/i.test(texto.slice(0, 4000))) r = lerOFX(texto);
      else r = lerCSV(texto);
    }
    r.arquivo = String(nome || 'arquivo').slice(0, 120);
    return r;
  };

  /* ------------------------------------------------------------------ vários arquivos: junta sem contar duas vezes o mesmo lançamento */
  I.juntar = function (lidos) {
    var porArquivo = lidos.map(function (r) {
      var c = {};
      r.transacoes.forEach(function (t) { var k = t.data + '|' + t.valor.toFixed(2) + '|' + norm(t.desc); (c[k] = c[k] || []).push(t); });
      return c;
    });
    var chaves = {}; porArquivo.forEach(function (c) { Object.keys(c).forEach(function (k) { chaves[k] = true; }); });
    var trans = [];
    Object.keys(chaves).forEach(function (k) {
      var melhor = []; porArquivo.forEach(function (c) { if (c[k] && c[k].length > melhor.length) melhor = c[k]; });
      melhor.forEach(function (t) { trans.push(t); });
    });
    trans.sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : 0; });
    // saldos informados nos arquivos (por conta, no caso do OFX). Vários arquivos podem ser da mesma conta ou de contas diferentes:
    // quem decide é a pessoa, na tela; aqui só vira saldo final quando há uma única fonte.
    var saldos = {};
    lidos.forEach(function (r, i) {
      Object.keys(r.saldos || {}).forEach(function (c) {
        var chave = r.formato === 'ofx' ? 'ofx:' + c : 'arq' + i;
        if (!saldos[chave] || (r.saldos[c].data || '') >= (saldos[chave].data || '')) saldos[chave] = { arquivo: r.arquivo, valor: r.saldos[c].valor, data: r.saldos[c].data };
      });
    });
    var lista = Object.keys(saldos).map(function (k) { return saldos[k]; });
    var per = null;
    lidos.forEach(function (r) { if (r.periodo) { per = per ? { ini: r.periodo.ini < per.ini ? r.periodo.ini : per.ini, fim: r.periodo.fim > per.fim ? r.periodo.fim : per.fim } : { ini: r.periodo.ini, fim: r.periodo.fim }; } });
    return { transacoes: trans, periodo: per, saldos: lista, saldoFinal: lista.length === 1 ? r2(lista[0].valor) : null, arquivos: lidos.map(function (r) { return r.arquivo; }), formatos: lidos.map(function (r) { return r.formato; }), cartao: lidos.some(function (r) { return r.cartao; }) };
  };

  /* ------------------------------------------------------------------ classificação sugerida */
  /* cl: venda, outras, ign (entradas) · custo, fixa, folha, imposto, divida, retirada, ign (saídas) */
  var RE_ENTRADA = [
    { re: /RENDIMENTO|REMUNERACAO|JUROS (RECEB|S\/)|ESTORNO|DEVOLUCAO|REEMBOLSO|CASHBACK/, cl: 'outras', rotulo: 'Rendimentos e estornos' },
    { re: /TRANSF(ERENCIA)? ENTRE CONTAS|MESMA TITULARIDADE|PROPRIA CONTA|\bRESGATE\b|\bAPLICACAO\b/, cl: 'ign', rotulo: 'Transferências entre contas e aplicações' },
    { re: /EMPRESTIMO|FINANCIAMENTO|CAPITAL DE GIRO|CREDITO PESSOAL|LIBERACAO DE CREDITO|ANTECIPACAO DE RECEBIVE/, cl: 'outras', rotulo: 'Empréstimos e antecipações' },
    { re: /IFOOD|I FOOD|RAPPI|99 ?FOOD|KEETA|UBER ?EATS|AIQFOME|DELIVERY MUCH/, cl: 'venda', canal: 'app', rotulo: 'Aplicativos de entrega' },
    { re: /MERCADO ?LIVRE|SHOPEE|AMAZON|MAGAZINE LUIZA|MAGALU|AMERICANAS|NUVEMSHOP|HOTMART|EDUZZ|KIWIFY/, cl: 'venda', canal: 'app', rotulo: 'Marketplaces e plataformas' },
    { re: /CIELO|REDECARD|\bREDE\b|STONE|GETNET|PAGSEGURO|PAGBANK|SUMUP|SAFRA ?PAY|\bVERO\b|ELAVON|PAGAR ?ME|IZETTLE|ZOOP|MERCADO ?PAGO|ADQUIRENTE|MAQUININHA|VISANET/, cl: 'venda', canal: 'cartao', rotulo: 'Maquininhas e cartões' },
    { re: /UNIMED|AMIL\b|BRADESCO SAUDE|SULAMERICA|HAPVIDA|NOTREDAME|CASSI\b|CONVENIO|PLANO DE SAUDE/, cl: 'venda', canal: 'convenio', rotulo: 'Convênios e planos de saúde' },
    { re: /PIX RECEB|RECEBIMENTO (PIX|TED|DOC)|TED RECEB|DOC RECEB|TRANSFERENCIA RECEBIDA|CREDITO PIX|PIX CREDITO|TRANSF.* RECEBID/, cl: 'venda', canal: 'pix', rotulo: 'Pix e transferências recebidas' },
    { re: /DEPOSITO|DEP\.? ?DINHEIRO/, cl: 'venda', canal: 'dinheiro', rotulo: 'Depósitos em dinheiro' },
    { re: /BOLETO RECEBID|COBRANCA RECEBID|LIQUIDACAO (DE )?(BOLETO|COBRANCA)|RECEBIMENTO (DE )?(BOLETO|COBRANCA)/, cl: 'venda', canal: 'boleto', rotulo: 'Boletos e cobranças recebidas' },
    { re: /^(VENDAS?|RECEITAS?|FATURAMENTO|SERVICOS? PRESTADOS?)\b/, cl: 'venda', canal: 'outro' },
  ];
  var RE_SAIDA = [
    { re: /TRANSF(ERENCIA)? ENTRE CONTAS|MESMA TITULARIDADE|PROPRIA CONTA|\bAPLICACAO\b|\bRESGATE\b|INVESTIMENTO|\bCDB\b|POUPANCA/, cl: 'ign', rotulo: 'Transferências entre contas e aplicações' },
    { re: /PRO[ -]?LABORE|RETIRADA|DISTRIBUICAO (DE )?LUCROS?|LUCROS? DISTRIB|\bSOCIO\b/, cl: 'retirada', rotulo: 'Retiradas do proprietário' },
    { re: /\bDAS\b|SIMPLES NACIONAL|DARF|\bGPS\b|\bINSS\b|\bFGTS\b|\bISS\b|\bICMS\b|IRPJ|CSLL|ESOCIAL|RECEITA FEDERAL|TRIBUT|IMPOSTO|\bDAE\b|\bDARE\b|ALVARA/, cl: 'imposto', rotulo: 'Impostos e tributos' },
    { re: /EMPRESTIMO|FINANCIAMENTO|CONSORCIO|\bPARCELA\b|\bPARC\b|JUROS|\bIOF\b|CHEQUE ESPECIAL|\bMORA\b|CAPITAL DE GIRO|REFIN|\bDIVIDA/, cl: 'divida', rotulo: 'Empréstimos, parcelas e juros' },
    { re: /SALARIO|\bFOLHA\b|FUNCIONARIO|RESCISAO|\bFERIAS\b|DECIMO TERCEIRO|VALE TRANSPORTE|HOLERITE|\bPESSOAL\b/, cl: 'folha', rotulo: 'Folha de pagamento' },
    { re: /TAXA (DE )?(CARTAO|MAQUININHA|ADQUIRENCIA)|\bMDR\b|COMISSAO (IFOOD|APP)/, cl: 'custo', rotulo: 'Taxas de maquininhas e plataformas' },
    { re: /ALUGUEL|LOCACAO|CONDOMINIO|IPTU|ENERGIA|CELESC|CPFL|CEMIG|COPEL|\bENEL\b|EQUATORIAL|ENERGISA|NEOENERGIA|\bAGUA\b|SABESP|SANEPAR|CASAN\b|COPASA|SAMAE|\bSAAE\b|EMBASA|TELEFON|\bVIVO\b|\bCLARO\b|\bTIM\b|\bOI\b|INTERNET|FIBRA|CONTABIL|CONTADOR|ASSINATURA|SISTEMA|SOFTWARE|SEGURO|TARIFA|CESTA DE SERVICOS|ANUIDADE|MANUTENCAO (DE )?CONTA|HONORARIO|DESPESAS? FIXAS?/, cl: 'fixa', rotulo: 'Despesas fixas (aluguel, contas, sistemas, tarifas)' },
    { re: /ATACAD|ASSAI|MAKRO|SUPERMERCAD|HORTIFRUTI|FRIGORIFIC|ACOUGUE|DISTRIBUIDORA|EMBALAGEM|EMBALAGENS|GAS GLP|SUPERGASBRAS|ULTRAGAZ|FORNECEDOR|MERCADORIA|INSUMO|CEASA|\bCOMPRAS?\b$|CUSTOS?/, cl: 'custo' },
  ];
  function sugerir(desc, dir, cat) {
    var regras = dir === 'in' ? RE_ENTRADA : RE_SAIDA, textos = [];
    if (cat) textos.push(norm(cat));
    textos.push(norm(desc));
    for (var t = 0; t < textos.length; t++) for (var i = 0; i < regras.length; i++) if (regras[i].re.test(textos[t])) return regras[i];
    return null;
  }
  var GENERICAS = { COMPRA: 1, COMPRAS: 1, PAGAMENTO: 1, PGTO: 1, PAG: 1, PIX: 1, ENVIADO: 1, ENVIADA: 1, ENVIO: 1, TRANSFERENCIA: 1, TRANSF: 1, TED: 1, DOC: 1, DEBITO: 1, CREDITO: 1, CARTAO: 1, NO: 1, EM: 1, DE: 1, DA: 1, DO: 1, DOS: 1, DAS: 1, PARA: 1, DEB: 1, CRED: 1, FILIAL: 1, LTDA: 1, SA: 1, ME: 1, EPP: 1, EIRELI: 1, COM: 1, E: 1 };
  function chaveNome(desc) {
    var d = norm(desc).replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, ' ').replace(/[^A-Z ]/g, ' ');
    var pal = d.split(' ').filter(Boolean), uteis = pal.filter(function (w) { return !GENERICAS[w] && w.length > 1; });
    return (uteis.length ? uteis : pal).slice(0, 3).join(' ') || 'OUTROS';
  }
  function titulo(s) { return s.toLowerCase().replace(/(^|\s)(\S)/g, function (_, a, b) { return a + b.toUpperCase(); }); }

  /* domingo da semana da data (as semanas do gráfico de caixa terminam no domingo) */
  function fimDaSemana(iso) {
    var d = new Date(Date.parse(iso)), dow = d.getUTCDay(), add = dow === 0 ? 0 : 7 - dow, f = new Date(d.getTime() + add * DIA_MS);
    return f.getUTCFullYear() + '-' + p2(f.getUTCMonth() + 1) + '-' + p2(f.getUTCDate());
  }
  /* meses presentes no extrato, com os dias cobertos em cada um (mês incompleto vira "parcial") */
  function serieMensal(porMes, ini, fim) {
    return Object.keys(porMes).sort().map(function (mes) {
      var y = +mes.slice(0, 4), m = +mes.slice(5, 7), diasMes = new Date(Date.UTC(y, m, 0)).getUTCDate();
      var a = mes + '-01' > ini ? mes + '-01' : ini, b = mes + '-' + p2(diasMes) < fim ? mes + '-' + p2(diasMes) : fim;
      var dias = Math.round((Date.parse(b) - Date.parse(a)) / DIA_MS) + 1;
      return { mes: mes, dias: dias, diasMes: diasMes, parcial: dias < diasMes - 2, g: porMes[mes] };
    });
  }

  /* ------------------------------------------------------------------ análise: períodos, grupos, cobertura */
  /* periodo (opcional): o que o próprio arquivo informa (OFX); amplia o intervalo dos lançamentos, nunca o reduz */
  I.analisar = function (trans, periodo) {
    if (!trans.length) throw erro('Nenhum lançamento para analisar.');
    var ini = trans[0].data, fim = trans[trans.length - 1].data;
    if (periodo && periodo.ini && periodo.fim) { if (periodo.ini < ini) ini = periodo.ini; if (periodo.fim > fim) fim = periodo.fim; }
    var dias = Math.round((Date.parse(fim) - Date.parse(ini)) / DIA_MS) + 1;
    var fator = MES_DIAS / Math.max(dias, 1);
    var grupos = {}, tot = { in: 0, out: 0 }, qtd = { in: 0, out: 0 };
    var porMes = {}, porSemana = {}, liquidoTotal = 0;
    var temCat = trans.filter(function (t) { return t.cat; }).length / trans.length >= 0.7;
    trans.forEach(function (t) {
      var dir = t.valor > 0 ? 'in' : 'out', v = Math.abs(t.valor), cat = temCat ? t.cat : '';
      var s = sugerir(t.desc, dir, cat);
      var rotulo = cat ? cat : (s && s.rotulo) ? s.rotulo : titulo(chaveNome(t.desc));
      var id = dir + '|' + norm(rotulo);
      var g = grupos[id] || (grupos[id] = { id: id, dir: dir, rotulo: rotulo, qtd: 0, total: 0, sug: s ? s.cl : null, canal: s && s.canal ? s.canal : null, exemplo: t.desc });
      g.qtd++; g.total += v; tot[dir] += v; qtd[dir]++;
      if (!g.sug && s) { g.sug = s.cl; g.canal = s.canal || g.canal; }
      var mes = t.data.slice(0, 7), pm = porMes[mes] || (porMes[mes] = {});
      pm[id] = (pm[id] || 0) + v;
      var sem = fimDaSemana(t.data); porSemana[sem] = (porSemana[sem] || 0) + t.valor; liquidoTotal += t.valor;
    });
    var lista = Object.keys(grupos).map(function (k) { return grupos[k]; }).sort(function (a, b) { return b.total - a.total; });
    var VISIVEIS = { in: 6, out: 14 }, vistos = { in: 0, out: 0 }, principais = [];
    // o que fica fora da lista de revisão (grupos pequenos) mantém a classe que as regras reconheceram; "?" = sem classe
    var resto = { in: { qtd: 0, total: 0, porClasse: {}, canais: {} }, out: { qtd: 0, total: 0, porClasse: {}, canais: {} } };
    var todos = {};
    lista.forEach(function (g) {
      g.total = r2(g.total); g.mensal = r2(g.total * fator);
      var relevante = g.total >= tot[g.dir] * 0.01;
      todos[g.id] = { dir: g.dir, sug: g.sug, canal: g.canal, principal: false };
      if (vistos[g.dir] < VISIVEIS[g.dir] && relevante) { vistos[g.dir]++; principais.push(g); todos[g.id].principal = true; }
      else {
        var rs = resto[g.dir], k = g.sug || '?';
        rs.qtd += g.qtd; rs.total += g.total; rs.porClasse[k] = (rs.porClasse[k] || 0) + g.total;
        if (g.dir === 'in' && g.sug === 'venda') rs.canais[g.canal || 'outro'] = (rs.canais[g.canal || 'outro'] || 0) + g.total;
      }
    });
    return { ini: ini, fim: fim, dias: dias, meses: Math.round((dias / MES_DIAS) * 10) / 10, fator: fator, lancamentos: trans.length, qtd: qtd, entradas: r2(tot.in), saidas: r2(tot.out), grupos: principais, resto: resto, periodoCurto: dias < 25,
      todos: todos, serie: serieMensal(porMes, ini, fim), semanas: Object.keys(porSemana).sort().map(function (k) { return { fim: k, liquido: r2(porSemana[k]) }; }), liquido: r2(liquidoTotal) };
  };
  I.CLASSES_ENTRADA = [['venda', 'Vendas'], ['outras', 'Outras entradas'], ['ign', 'Ignorar']];
  I.CLASSES_SAIDA = [['custo', 'Custos diretos'], ['fixa', 'Despesas fixas'], ['folha', 'Folha de pagamento'], ['imposto', 'Impostos'], ['divida', 'Dívidas e parcelas'], ['retirada', 'Retirada do proprietário'], ['ign', 'Ignorar']];

  /* ------------------------------------------------------------------ fechamento: médias mensais por classe */
  /* escolhas: { idDoGrupo: classe }; opc: { resto: { in:'venda', out:'custo' }, equipe: bool, saldoFinal } */
  I.fechar = function (an, escolhas, opc) {
    escolhas = escolhas || {}; opc = opc || {};
    var resto = Object.assign({ in: 'venda', out: 'custo' }, opc.resto || {});
    var soma = { venda: 0, outras: 0, custo: 0, fixa: 0, folha: 0, imposto: 0, divida: 0, retirada: 0, ign: 0 };
    var canais = {}, classificado = 0, semClasse = 0;
    an.grupos.forEach(function (g) {
      var cl = escolhas[g.id] || g.sug;
      if (!cl) { semClasse += g.total; cl = 'ign'; }
      else if (g.dir === 'out') classificado += g.total;
      soma[cl] += g.total;
      if (g.dir === 'in' && cl === 'venda') canais[g.canal || 'outro'] = (canais[g.canal || 'outro'] || 0) + g.total;
    });
    var desconhecido = semClasse;
    ['in', 'out'].forEach(function (dir) {
      var rs = an.resto[dir];
      Object.keys(rs.porClasse).forEach(function (k) {
        var cl = k === '?' ? resto[dir] : k;
        soma[cl] += rs.porClasse[k];
        if (k === '?') desconhecido += dir === 'out' ? rs.porClasse[k] : 0;
      });
      Object.keys(rs.canais).forEach(function (c) { canais[c] = (canais[c] || 0) + rs.canais[c]; });
      if (dir === 'in' && rs.porClasse['?'] && resto.in === 'venda') canais.outro = (canais.outro || 0) + rs.porClasse['?'];
    });
    var f = an.fator, mensal = {};
    Object.keys(soma).forEach(function (k) { mensal[k] = r2(soma[k] * f); });
    var vendas = soma.venda, canaisPct = {};
    Object.keys(canais).forEach(function (k) { canaisPct[k] = vendas ? Math.round((canais[k] / vendas) * 1000) / 10 : 0; });
    var folha = mensal.folha, fixas = mensal.fixa;
    if (!opc.equipe) { fixas = r2(fixas + folha); folha = 0; } // quem trabalha sozinho: a folha identificada entra nas despesas fixas
    var cobertura = an.saidas ? Math.round(((an.saidas - desconhecido) / an.saidas) * 100) : 100;
    // totais por mês (por classe) e saldo ao fim de cada semana: só números, nunca descrições
    var classeDe = function (id) {
      var gi = an.todos[id]; if (!gi) return 'ign';
      var cl = escolhas[id] || gi.sug;
      if (!cl) cl = gi.principal ? 'ign' : resto[gi.dir];
      return cl;
    };
    var meses = an.serie.map(function (m) {
      var o = { mes: m.mes, dias: m.dias, parcial: m.parcial, vendas: 0, custos: 0, fixas: 0, folha: 0, impostos: 0, dividas: 0, retiradas: 0, outras: 0 };
      var chave = { venda: 'vendas', custo: 'custos', fixa: 'fixas', folha: 'folha', imposto: 'impostos', divida: 'dividas', retirada: 'retiradas', outras: 'outras' };
      Object.keys(m.g).forEach(function (id) { var k = chave[classeDe(id)]; if (k) o[k] += m.g[id]; });
      if (!opc.equipe) { o.fixas += o.folha; o.folha = 0; }
      Object.keys(o).forEach(function (k) { if (typeof o[k] === 'number' && k !== 'dias') o[k] = r2(o[k]); });
      return o;
    });
    var caixa = null;
    if (opc.saldoFinal !== null && opc.saldoFinal !== undefined && an.semanas.length) {
      var cum = 0; caixa = an.semanas.map(function (w) { cum += w.liquido; return { fim: w.fim, saldo: r2(opc.saldoFinal - (an.liquido - cum)) }; });
    }
    var valores = { fat_v: mensal.venda, custo_v: mensal.custo, fixas_v: fixas, folha_v: folha, impostos_v: mensal.imposto, retirada_v: mensal.retirada, dv_parcela_v: mensal.divida };
    if (canaisPct.app) valores.dv_app_pct_v = Math.round(canaisPct.app);
    if (opc.saldoFinal !== null && opc.saldoFinal !== undefined) valores.saldo_v = r2(opc.saldoFinal);
    return {
      valores: valores,
      resumo: { periodo: { ini: an.ini, fim: an.fim, dias: an.dias }, mesesPeriodo: an.meses, lancamentos: an.lancamentos, cobertura: cobertura, naoClassificado: r2(desconhecido * f),
        mensal: { vendas: mensal.venda, custos: mensal.custo, fixas: mensal.fixa, folha: mensal.folha, impostos: mensal.imposto, dividas: mensal.divida, retiradas: mensal.retirada, outrasEntradas: mensal.outras },
        canais: canaisPct, saldoFinal: opc.saldoFinal === undefined ? null : opc.saldoFinal, meses: meses, caixa: caixa },
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
