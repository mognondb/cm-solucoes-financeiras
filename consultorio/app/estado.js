/* Estado compartilhado do aplicativo (conta logada, listas de apoio em cache) e carregamento dos dados-base. */
import { api } from './api.js';

export const App = { eu: null, estado: null, cache: {}, hoje: '' };

/** Dados de apoio que quase toda tela usa. Recarrega só o que for pedido (ou tudo, na primeira vez). */
export async function carregarBase(quais) {
  const mapa = { categorias: 'categorias', servicos: 'servicos', profissionais: 'profissionais' };
  const lista = quais || Object.keys(mapa);
  await Promise.all(lista.map(async (k) => { App.cache[k] = (await api.get(mapa[k])).itens; }));
}
export const categoriasDe = (tipo, soAtivas = true) => (App.cache.categorias || []).filter((c) => c.tipo === tipo && (!soAtivas || c.ativo));
export const servicoPorId = (id) => (App.cache.servicos || []).find((s) => s.id === Number(id));
export const profissionalPorId = (id) => (App.eu?.profissionais || []).find((p) => p.id === Number(id));
export const somenteLeitura = () => !!App.eu?.plano?.somenteLeitura;
export const defineEu = (eu) => { App.eu = eu; App.hoje = eu?.hoje || ''; };
