// @ts-check
// Búsqueda básica sobre la forma pública de producto.
// Apto para el navegador y para node:test: solo importa `text.mjs`; no lee datos ni usa APIs de Node o de Astro.
//
// Uso previsto:
//   - al compilar: `data-search={searchText(product)}` en cada tarjeta;
//   - en el navegador: `matchesSearchText(card.dataset.search, input.value)` para mostrar u ocultar la tarjeta.
/** @import { SearchableProduct } from '../types/site.ts' */
import { cleanQuery, normalizeCode, normalizeText } from './text.mjs';

/** Nombre del parámetro de la URL que lleva la consulta: `/catalogo/?q=...`. */
export const SEARCH_PARAM = 'q';

// Una letra o una cifra que se ve: no cuenta una de las que se ignoran por omisión (\p{DI}), que no dibujan nada. Los
// rellenos del hangul (U+115F, U+1160, U+3164, U+FFA0), que lo son, ya los quita `cleanQuery` sin dejar espacio.
const SEARCHABLE = /(?!\p{DI})[\p{L}\p{N}]/u;

/**
 * Palabras de la consulta limpia (`cleanQuery`, la misma que se muestra), ya normalizadas: el catálogo filtra sobre
 * exactamente lo que muestra la línea de resultados. Se descartan las palabras sin ninguna letra ni cifra visible.
 * @param {unknown} query
 * @returns {string[]}
 */
export function queryTokens(query) {
  return normalizeText(cleanQuery(query)).split(' ').filter(token => SEARCHABLE.test(normalizeCode(token)));
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

/**
 * Consulta tal como se muestra en la página (`cleanQuery`): sin espacios al inicio o al final y con un solo
 * espacio entre palabras. Conserva mayúsculas y acentos (es lo que escribió la persona).
 * Quita sin dejar espacio los caracteres sin ancho: los de dirección (U+202E invertiría las palabras del sitio que
 * siguen al término), los invisibles, el guion suave y los rellenos del hangul (U+115F, U+1160, U+3164, U+FFA0), así
 * «gu<U+200B>ante» y «cas<U+115F>co» se muestran y se buscan «guante» y «casco».
 * Cambia por un espacio el carácter de reemplazo (U+FFFD), que es como llega una secuencia % mal formada de la URL
 * (`?q=%E0%A4%A` → «�%A» → «%A»), los controles y las mitades sueltas de un par sustituto (`encodeURIComponent` no
 * las acepta). Una consulta sin nada visible queda vacía.
 * @param {unknown} query
 * @returns {string}
 */
export function displayQuery(query) {
  return cleanQuery(query);
}

/**
 * ¿La consulta filtra algo? Solo cuando su texto limpio (`cleanQuery`) tiene al menos una palabra con letras o números.
 * @param {unknown} query
 * @returns {boolean}
 */
export function isActiveQuery(query) {
  return queryTokens(query).length > 0;
}

/**
 * Línea de resultados del catálogo en tres partes: la frase hasta la comilla de apertura, el término y el
 * cierre. Sin búsqueda, toda la línea va en `lead` y las otras dos partes están vacías. Unidas dan
 * exactamente `resultSummary`. En el navegador el término se escribe aparte, dentro de un <bdi>, para que su
 * dirección (árabe, hebreo) no reordene las palabras del sitio: siempre con nodos de texto, nunca como HTML.
 * @param {number} count Productos visibles.
 * @param {unknown} [query]
 * @returns {{ lead: string, term: string, end: string }}
 */
export function resultSummaryParts(count, query = '') {
  const total = Math.max(0, Math.trunc(Number(count)) || 0);
  if (!isActiveQuery(query)) return { lead: `${total} ${total === 1 ? 'producto' : 'productos'}`, term: '', end: '' };
  return { lead: `${total} ${total === 1 ? 'resultado' : 'resultados'} para “`, term: displayQuery(query), end: '”' };
}

/**
 * Línea de resultados del catálogo, en español y con el plural correcto:
 *   sin búsqueda → «10 productos» (singular «1 producto»);
 *   con búsqueda → «3 resultados para “guante”» (singular «1 resultado para “guante”»).
 * Devuelve texto plano: en el navegador se escribe con nodos de texto (`resultSummaryParts`), nunca como HTML.
 * @param {number} count Productos visibles.
 * @param {unknown} [query]
 * @returns {string}
 */
export function resultSummary(count, query = '') {
  const { lead, term, end } = resultSummaryParts(count, query);
  return `${lead}${term}${end}`;
}
