/* Recibo em PDF, montado no navegador com o jsPDF que o site já usa (texto vetorial, sem imagem). Nada sai da sua máquina além do download. */
import { brl, fmtCPF, MESES } from './ui.js';

/* ------------------------------------------------------------------ valor por extenso (R$) */
const U = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const D = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CEN = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
function ate999(n) {
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100); const r = n % 100; const p = [];
  if (c) p.push(CEN[c]);
  if (r) { if (r < 20) p.push(U[r]); else { const d = Math.floor(r / 10); const u = r % 10; p.push(u ? `${D[d]} e ${U[u]}` : D[d]); } }
  return p.join(' e ');
}
export function extensoInteiro(n) {
  if (n === 0) return 'zero';
  const escalas = [['', ''], ['mil', 'mil'], ['milhão', 'milhões'], ['bilhão', 'bilhões']]; const grupos = []; let x = n;
  while (x > 0) { grupos.push(x % 1000); x = Math.floor(x / 1000); }
  const partes = [];
  for (let g = grupos.length - 1; g >= 0; g--) {
    const v = grupos[g]; if (!v) continue;
    partes.push({ v, txt: g === 1 && v === 1 ? 'mil' : g === 0 ? ate999(v) : `${ate999(v)} ${v === 1 ? escalas[g][0] : escalas[g][1]}` });
  }
  return partes.reduce((acc, p, i) => (i === 0 ? p.txt : `${acc}${i === partes.length - 1 && (p.v < 100 || p.v % 100 === 0) ? ' e ' : ' '}${p.txt}`), '');
}
/** 36000 (centavos) → "trezentos e sessenta reais". */
export function valorPorExtenso(centavos) {
  const c = Math.round(Math.abs(centavos)); const reais = Math.floor(c / 100); const cent = c % 100; const partes = [];
  if (reais > 0) partes.push(`${extensoInteiro(reais)} ${reais >= 1000000 && reais % 1000000 === 0 ? 'de ' : ''}${reais === 1 ? 'real' : 'reais'}`);
  if (cent > 0) partes.push(`${extensoInteiro(cent)} ${cent === 1 ? 'centavo' : 'centavos'}`);
  return partes.length ? partes.join(' e ') : 'zero reais';
}

/* ------------------------------------------------------------------ PDF */
function carregarJsPdf() {
  if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  return new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = '/assets/vendor/jspdf.umd.min.js';
    s.onload = () => (window.jspdf && window.jspdf.jsPDF ? res(window.jspdf.jsPDF) : rej(new Error('Gerador de PDF indisponível.'))); s.onerror = () => rej(new Error('Não foi possível carregar o gerador de PDF.')); document.head.appendChild(s);
  });
}
const dataExtenso = (iso) => { const [a, m, d] = iso.slice(0, 10).split('-').map(Number); return `${d} de ${MESES[m - 1]} de ${a}`; };
const FORMA = { pix: 'PIX', dinheiro: 'dinheiro', debito: 'cartão de débito', credito: 'cartão de crédito', transferencia: 'transferência bancária', boleto: 'boleto', convenio: 'convênio', debito_automatico: 'débito automático', cheque: 'cheque', outro: 'outra forma' };

/** Monta o PDF do recibo e devolve o objeto jsPDF (use .save(nome) para baixar). */
export async function montarReciboPdf(r) {
  const JsPdf = await carregarJsPdf(); const doc = new JsPdf({ unit: 'mm', format: 'a4' }); const L = 20; const W = 170; let y = 24;
  const txt = (t, x, yy, o = {}) => doc.text(String(t), x, yy, o);
  doc.setDrawColor(177, 138, 82); doc.setLineWidth(0.6); doc.line(L, 18, L + W, 18);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(63, 76, 57); txt(r.consultorio || r.emitenteNome, L, y); y += 6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(107, 107, 99);
  const linhaEmit = [r.emitenteNome !== r.consultorio ? r.emitenteNome : null, r.emitenteCrp ? `CRP ${r.emitenteCrp}` : null, r.emitenteDoc ? `${r.emitenteDoc.length === 14 ? 'CNPJ' : 'CPF'} ${fmtCPF(r.emitenteDoc)}` : null].filter(Boolean).join('  ·  ');
  if (linhaEmit) { txt(linhaEmit, L, y); y += 5; }
  y += 8; doc.setFont('helvetica', 'bold'); doc.setFontSize(24); doc.setTextColor(46, 46, 46); txt('RECIBO', L, y);
  doc.setFontSize(12); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 107, 99); txt(`Nº ${String(r.numero).padStart(4, '0')}`, L + W, y - 1, { align: 'right' });
  y += 9; doc.setFillColor(246, 241, 232); doc.roundedRect(L, y, W, 18, 2, 2, 'F'); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(107, 107, 99); txt('VALOR', L + 6, y + 6.5);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(63, 76, 57); txt(brl(r.valor).replace(/ /g, ' '), L + 6, y + 14.5);
  y += 30; doc.setFont('helvetica', 'normal'); doc.setFontSize(12); doc.setTextColor(46, 46, 46);
  const pagador = `${r.pagadorNome}${r.pagadorCpf ? `, ${r.pagadorCpf.length === 14 ? 'CNPJ' : 'CPF'} ${fmtCPF(r.pagadorCpf)}` : ''}`;
  const corpo = `Recebi de ${pagador}, a importância de ${brl(r.valor)} (${valorPorExtenso(r.valor)}), referente a ${r.referencia}.`;
  const linhas = doc.splitTextToSize(corpo, W); doc.text(linhas, L, y, { lineHeightFactor: 1.6 }); y += linhas.length * 7.4 + 4;
  if (r.forma) { doc.setFontSize(10.5); doc.setTextColor(107, 107, 99); txt(`Forma de pagamento: ${FORMA[r.forma] || r.forma}.`, L, y); y += 7; }
  doc.setFontSize(10.5); doc.setTextColor(107, 107, 99); txt(`Pagamento em ${dataExtenso(r.data)}.`, L, y); y += 22;
  doc.setTextColor(46, 46, 46); doc.setFontSize(12); txt(`${r.local ? `${r.local}, ` : ''}${dataExtenso(r.data)}.`, L, y); y += 30;
  doc.setDrawColor(46, 46, 46); doc.setLineWidth(0.3); doc.line(L + 25, y, L + W - 25, y); y += 5.5;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); txt(r.emitenteNome, L + W / 2, y, { align: 'center' }); y += 5; doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(107, 107, 99);
  const ass = [r.emitenteCrp ? `CRP ${r.emitenteCrp}` : null, r.emitenteDoc ? `${r.emitenteDoc.length === 14 ? 'CNPJ' : 'CPF'} ${fmtCPF(r.emitenteDoc)}` : null].filter(Boolean).join('  ·  '); if (ass) txt(ass, L + W / 2, y, { align: 'center' });
  doc.setFontSize(8); doc.setTextColor(150, 148, 141); txt('Gerado pelo Portal CLINCM', L, 285);
  if (r.cancelado) { doc.setTextColor(200, 80, 60); doc.setFont('helvetica', 'bold'); doc.setFontSize(60); doc.text('CANCELADO', 105, 150, { align: 'center', angle: 30 }); }
  return doc;
}
export async function baixarReciboPdf(r) { const doc = await montarReciboPdf(r); doc.save(`recibo-${String(r.numero).padStart(4, '0')}.pdf`); }
