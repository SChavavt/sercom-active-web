// @ts-check
// Búsqueda básica sobre la forma pública de producto.
// Apto para el navegador y para node:test: solo importa `text.mjs`; no lee datos ni usa APIs de Node o de Astro.
//
// Uso previsto:
//   - al compilar: `data-search={searchText(product)}` en cada tarjeta;
//   - en el navegador: `matchesSearchText(card.dataset.search, input.value)` para mostrar u ocultar la tarjeta.
/** @import { SearchableProduct } from '../types/site.ts' */
import { normalizeCode, normalizeText } from './text.mjs';

/** Nombre del parámetro de la URL que lleva la consulta: `/catalogo/?q=...`. */
export const SEARCH_PARAM = 'q';

/**
 * Palabras de la consulta, ya normalizadas. Se descartan las que no tienen letras ni números.
 * @param {unknown} query
 * @returns {string[]}
 */
export function queryTokens(query) {
  return normalizeText(query).split(' ').filter(token => normalizeCode(token) !== '');
}

/**
 * Texto de búsqueda de un producto: nombre, marca, código, códigos de variantes y nombres de categoría,
 * normalizados, más las formas sin separadores de los códigos y de las palabras que los llevan.
 * @param {SearchableProduct} product
 * @returns {string}
 */
export function searchText(product) {
  const codes = [product.code, ...product.variants.map(variant => variant.code)];
  const text = normalizeText([product.name, product.brandName, ...codes, ...product.categoryNames].join(' '));
  const compact = new Set(codes.map(normalizeCode));
  for (const word of text.split(' ')) compact.add(normalizeCode(word));
  const words = new Set(text.split(' '));
  return [text, ...[...compact].filter(form => form && !words.has(form))].join(' ');
}

/**
 * @param {string} haystack Texto producido por `searchText`.
 * @param {string[]} tokens Resultado de `queryTokens`.
 */
function matchesTokens(haystack, tokens) {
  return tokens.every(token => haystack.includes(token) || haystack.includes(normalizeCode(token)));
}

/**
 * ¿El texto de búsqueda de un producto (resultado de `searchText`) contiene todas las palabras de la consulta?
 * Una consulta vacía coincide con todo.
 * @param {string | null | undefined} text
 * @param {unknown} query
 * @returns {boolean}
 */
export function matchesSearchText(text, query) {
  return matchesTokens(String(text ?? ''), queryTokens(query));
}

/**
 * ¿El producto coincide con la consulta? Cada palabra debe aparecer en el nombre, la marca,
 * el código, el código de alguna variante o el nombre de una categoría. No distingue mayúsculas ni acentos.
 * @param {SearchableProduct} product
 * @param {unknown} query
 * @returns {boolean}
 */
export function matchesQuery(product, query) {
  return matchesSearchText(searchText(product), query);
}

/**
 * Productos que coinciden con la consulta, en el mismo orden. Una consulta vacía los devuelve todos.
 * @template {SearchableProduct} T
 * @param {readonly T[]} products
 * @param {unknown} query
 * @returns {T[]}
 */
export function filterProducts(products, query) {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return [...products];
  return products.filter(product => matchesTokens(searchText(product), tokens));
}
