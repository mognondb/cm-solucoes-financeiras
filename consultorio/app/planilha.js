/* Leitura de planilhas (CSV e Excel) no navegador e ligação das colunas aos campos do sistema.
   O arquivo é lido aqui, na máquina da pessoa; ao servidor só vão as linhas já ligadas aos campos, na hora de conferir e importar. */

const LEITOR = '/assets/js/diagnostico-importar.js?v=3';
let carregando = null;
const leitorPronto = () => (window.CMDiag && window.CMDiag.importar && window.CMDiag.importar.lerMatriz ? window.CMDiag.importar : null);
const injetar = (url) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = url; s.onload = res; s.onerror = () => rej(new Error('Não foi possível carregar o leitor de planilhas.')); document.head.appendChild(s); });

/** Carrega (uma vez) o leitor de arquivos que o site já usa no CM Diagnóstico e nos extratos. Os arquivos do site ficam 7 dias no navegador:
    se uma cópia antiga (sem a leitura de planilhas) estiver guardada, pede de novo com um parâmetro novo em vez de falhar. */
export function carregarLeitor() {
  if (leitorPronto()) return Promise.resolve(leitorPronto());
  if (carregando) return carregando;
  carregando = (async () => {
    await injetar(LEITOR); if (leitorPronto()) return leitorPronto();
    await injetar(LEITOR + '&r=' + Date.now()); if (leitorPronto()) return leitorPronto();
    throw new Error('Não consegui carregar o leitor de planilhas. Atualize a página (Ctrl+F5) e tente de novo.');
  })().catch((e) => { carregando = null; throw e; });
  return carregando;
}

/** Lê o arquivo escolhido: { arquivo, abas: [{ nome, linhas }] }. Erros "amigáveis" já vêm em português. */
export async function lerArquivo(file) {
  const leitor = await carregarLeitor();
  const buffer = await file.arrayBuffer();
  return leitor.lerMatriz(file.name, new Uint8Array(buffer));
}

/** Sem acento, minúsculas, só letras e números separados por espaço: "Data de Nascimento" → "data de nascimento". */
export const chave = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Quantas células da linha parecem nomes de campos do sistema (rótulo ou sinônimo). */
function pontos(linha, campos) {
  const conhecidos = new Set(campos.flatMap((c) => [chave(c.rotulo), chave(c.chave), ...c.sinonimos.map(chave)]));
  return linha.reduce((n, cel) => n + (cel !== null && cel !== undefined && conhecidos.has(chave(cel)) ? 1 : 0), 0);
}
/** A planilha é o modelo do sistema? Cabeçalho na 1ª linha, cada título exatamente o nome de um campo (sem repetir nem sobrar coluna desconhecida) e os campos obrigatórios presentes.
    Nesse caso não há o que ligar: as colunas já se sabem. Qualquer outra planilha (títulos diferentes, coluna a mais) segue para a ligação manual. */
export function ehModelo(linhas, campos) {
  const cab = linhas[0]; if (!cab) return false;
  const porNome = new Map(campos.map((c) => [chave(c.rotulo), c.chave])); const vistos = new Set();
  for (const cel of cab) {
    const k = chave(cel); if (!k) continue;
    const campo = porNome.get(k); if (!campo || vistos.has(campo)) return false; vistos.add(campo);
  }
  return vistos.size > 0 && campos.filter((c) => c.obrigatorio).every((c) => vistos.has(c.chave));
}

/** Procura o cabeçalho entre as primeiras linhas (planilhas exportadas costumam ter título antes). Devolve o índice da linha. */
export function detectarCabecalho(linhas, campos) {
  let melhor = 0; let pMelhor = pontos(linhas[0] || [], campos);
  for (let i = 1; i < Math.min(linhas.length, 10); i++) { const p = pontos(linhas[i], campos); if (p > pMelhor) { melhor = i; pMelhor = p; } }
  return melhor;
}

/** Liga cada campo do sistema a uma coluna da planilha pelo nome do cabeçalho. Devolve { campo: índiceDaColuna | null }. */
export function ligarColunas(cabecalho, campos) {
  const cols = cabecalho.map((c, i) => ({ i, k: chave(c) })); const usadas = new Set(); const mapa = {};
  // 1º o nome exato (rótulo ou chave), 2º os sinônimos; cada coluna só liga a um campo
  for (const passo of [(c) => [chave(c.rotulo), chave(c.chave)], (c) => c.sinonimos.map(chave)]) {
    for (const c of campos) {
      if (mapa[c.chave] !== undefined && mapa[c.chave] !== null) continue;
      const nomes = passo(c); const achada = cols.find((x) => !usadas.has(x.i) && x.k && nomes.includes(x.k));
      if (achada) { mapa[c.chave] = achada.i; usadas.add(achada.i); }
    }
  }
  campos.forEach((c) => { if (mapa[c.chave] === undefined) mapa[c.chave] = null; });
  return mapa;
}

/** Linhas de dados (depois do cabeçalho) como objetos { campo: valor } só com as colunas ligadas. _linha = posição na tabela. */
export function montarLinhas(linhas, indiceCabecalho, mapa, padroes = {}) {
  const saida = [];
  for (let i = indiceCabecalho + 1; i < linhas.length; i++) {
    const l = linhas[i]; const o = { _linha: i + 1 }; let algo = false;
    for (const [campo, col] of Object.entries(mapa)) {
      if (col === null || col === undefined || col === '') continue;
      const v = l[Number(col)]; if (v !== null && v !== undefined && String(v).trim() !== '') { o[campo] = v; algo = true; }
    }
    if (!algo) continue;
    for (const [campo, v] of Object.entries(padroes)) if (o[campo] === undefined && v) o[campo] = v;
    saida.push(o);
  }
  return saida;
}

/** Modelo de planilha (CSV que o Excel abre direto: separador ";", BOM e acentos). */
export function baixarModelo(nome, campos) {
  const esc = (v) => { const s = String(v ?? ''); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const linhas = [campos.map((c) => c.rotulo), ...[0, 1].map((i) => campos.map((c) => c.exemplos[i] ?? ''))];
  const csv = '﻿' + linhas.map((l) => l.map(esc).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** "A" para a coluna 0, "B" para 1... (como o Excel mostra). */
export const letraColuna = (i) => { let s = ''; let n = i + 1; while (n) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
