// @ts-check
// Búsqueda básica sobre la forma pública de producto.
// Apto para el navegador y para node:test: solo importa `text.mjs`; no lee datos ni usa APIs de Node o de Astro.
//
// Uso previsto:
//   - al compilar: `data-search={searchText(product)}` en cada tarjeta;
//   - en el navegador: `matchesSearchText(card.dataset.search, input.value)` para mostrar u ocultar la tarjeta.
//
// Cada palabra de la consulta se busca tal como se escribió y, además, en sus formas singulares (`singularForms`) y en
// los sinónimos revisados (`SEARCH_SYNONYMS`): «guantes» encuentra «Guante …» y «gafas» encuentra «Lente …». Cuánto
// debe coincidir cada una de esas otras formas depende de su largo (`matchesForm`).
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
 * Vocabulario de búsqueda revisado en el plan: cada grupo reúne palabras que un cliente usa para lo mismo al buscar
 * («lentes» o «gafas»). No son equivalencias técnicas entre productos. Ya normalizadas: sin acentos, en minúsculas y en
 * singular. Agregar un grupo o una palabra necesita la revisión de la persona de ventas.
 * @type {readonly (readonly string[])[]}
 */
export const SEARCH_SYNONYMS = Object.freeze([
  Object.freeze(['lente', 'gafa']),
  Object.freeze(['bota', 'calzado']),
  // «Orejeras / protección auditiva» en el plan: el adjetivo va en sus dos géneros («tapón auditivo», «protección auditiva»).
  Object.freeze(['orejera', 'auditiva', 'auditivo']),
]);

// Solo una palabra hecha únicamente de letras tiene plural: un código («37-175», «ej1001») se busca tal cual.
const WORD = /^\p{L}+$/u;

/**
 * Formas singulares de una palabra normalizada (sin acentos, en minúsculas): una lista de 0, 1 o 2 palabras. Se usa
 * solo la PRIMERA regla que aplica (terminación y largo); las siguientes no se prueban:
 *   1. termina en «ces» y tiene al menos 5 letras → «ces» cambiado por «z» y la palabra sin su última «s»
 *      («lapices» → «lapiz», «lapice»): un plural en «-ces» viene de «-z» o de «-ce», y la palabra sola no dice cuál;
 *   2. termina en «es» después de «l», «r», «n», «d», «s», «j» o «y», y sin «es» le quedan al menos 3 letras → esa raíz
 *      («overoles» → «overol», «tapones» → «tapon», «redes» → «red»). Si el singular real termina en «e» («cables»),
 *      la raíz («cabl») es parte de él y el producto se encuentra igual;
 *   3. termina en «s» pero no en «is» ni en «us» (en español no cambian en plural: «gris», «tenis», «virus») y le quedan
 *      al menos 3 letras → la palabra sin la «s» («guantes» → «guante», «kits» → «kit»).
 * Una palabra que ninguna regla acepta, o que no está hecha solo de letras (un código), no tiene forma singular.
 * @param {string} token
 * @returns {string[]}
 */
export function singularForms(token) {
  const word = String(token ?? '');
  if (!WORD.test(word)) return [];
  const length = Array.from(word).length;
  if (word.endsWith('ces') && length >= 5) return [`${word.slice(0, -3)}z`, word.slice(0, -1)];
  if (/[lrndsjy]es$/.test(word) && length - 2 >= 3) return [word.slice(0, -2)];
  if (word.endsWith('s') && !/[iu]s$/.test(word) && length - 1 >= 3) return [word.slice(0, -1)];
  return [];
}

/**
 * Formas que se buscan para una palabra normalizada de la consulta, en este orden y sin repetir: la palabra misma, sus
 * formas singulares y, por cada una de ellas que sea exactamente un miembro de un grupo de `SEARCH_SYNONYMS`, los demás
 * miembros del grupo. `tokenAlternatives('lentes')` → `['lentes', 'lente', 'gafa']`.
 * @param {string} token
 * @returns {string[]}
 */
export function tokenAlternatives(token) {
  const word = String(token ?? '');
  const forms = [word, ...singularForms(word)];
  const result = new Set(forms);
  for (const form of forms) {
    for (const group of SEARCH_SYNONYMS) if (group.includes(form)) for (const member of group) result.add(member);
  }
  return [...result];
}

/** Una letra o una cifra: lo que forma una palabra. */
const WORD_CHARACTER = /[\p{L}\p{N}]/u;

/**
 * ¿`needle` aparece en `haystack` al principio de una palabra (al inicio o después de algo que no es letra ni cifra)?
 * Con `whole`, además debe terminar ahí la palabra (al final o antes de algo que no es letra ni cifra).
 * @param {string} haystack
 * @param {string} needle
 * @param {boolean} [whole]
 */
function startsWord(haystack, needle, whole = false) {
  for (let from = haystack.indexOf(needle); from !== -1; from = haystack.indexOf(needle, from + 1)) {
    if (from > 0 && WORD_CHARACTER.test(haystack[from - 1] ?? '')) continue;
    if (!whole || !WORD_CHARACTER.test(haystack[from + needle.length] ?? '')) return true;
  }
  return false;
}

/**
 * ¿Una forma singular o un sinónimo de una palabra de la consulta coincide con el texto? Cuanto más corta es la forma,
 * más exacta debe ser la coincidencia, porque una forma corta aparece por casualidad dentro de otras palabras:
 *   - 5 letras o más: en cualquier parte del texto, igual que una palabra escrita («lentes» → «lente» encuentra
 *     «Sobrelente», «guantes» → «guante» encuentra «Sobreguante»);
 *   - 4 letras: al principio de una palabra («micas» → «mica» encuentra «Mica clara» y no «Protección química»;
 *     «cables» → «cabl» encuentra «Cable»);
 *   - 3 letras: la palabra completa, sola o seguida de «e» («pares» → «par» encuentra «Par …» y no «para» ni
 *     «Separador»; «bases» → «bas» encuentra «Base …» y no «Bastón»; «arnes» → «arn» no encuentra «carnaza»).
 * @param {string} haystack Texto producido por `searchText`.
 * @param {string} form Forma normalizada (`tokenAlternatives`).
 */
function matchesForm(haystack, form) {
  const length = Array.from(form).length;
  if (length >= 5) return haystack.includes(form);
  if (length === 4) return startsWord(haystack, form);
  return startsWord(haystack, form, true) || startsWord(haystack, `${form}e`, true);
}

/**
 * Prepara una consulta UNA vez y devuelve la función que dice si un texto de búsqueda (resultado de `searchText`) la
 * cumple: el texto debe tener todas las palabras de la consulta. Una palabra coincide tal como se escribió, en cualquier
 * parte del texto («guant» encuentra «guante»), o en su forma de código sin separadores («37175» encuentra «37-175»), o
 * en una de sus formas singulares o sus sinónimos (`tokenAlternatives` de la palabra sin signos: «guantes,» y
 * «¿lentes?» se buscan como «guantes» y «lentes»), con la exactitud que pide `matchesForm`. Una consulta vacía coincide
 * con todo. Para filtrar muchas tarjetas con la misma consulta, llama a esta función una vez y usa su resultado en
 * cada tarjeta.
 * @param {unknown} query
 * @returns {(text: string | null | undefined) => boolean}
 */
export function searchMatcher(query) {
  const words = [...new Set(queryTokens(query))].map(token => {
    const compact = normalizeCode(token);
    return { token, compact, forms: tokenAlternatives(compact).slice(1) };
  });
  return text => {
    const haystack = String(text ?? '');
    return words.every(({ token, compact, forms }) => haystack.includes(token) || haystack.includes(compact) || forms.some(form => matchesForm(haystack, form)));
  };
}

/**
 * ¿El texto de búsqueda de un producto (resultado de `searchText`) contiene todas las palabras de la consulta (cada una
 * tal como se escribió o en una de sus formas, ver `searchMatcher`)? Una consulta vacía coincide con todo.
 * @param {string | null | undefined} text
 * @param {unknown} query
 * @returns {boolean}
 */
export function matchesSearchText(text, query) {
  return searchMatcher(query)(text);
}

/**
 * ¿El producto coincide con la consulta? Cada palabra (o una de sus formas: `tokenAlternatives`) debe aparecer en el
 * nombre, la marca, el código, el código de alguna variante o el nombre de una categoría. No distingue mayúsculas ni
 * acentos.
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
  if (!isActiveQuery(query)) return [...products];
  const matches = searchMatcher(query);
  return products.filter(product => matches(searchText(product)));
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
 * Con `options.filtered` (hay filtros marcados) la línea lo dice: «4 productos con filtros» sin búsqueda y
 * «2 resultados para “guante” con filtros» con ella.
 * @param {number} count Productos visibles.
 * @param {unknown} [query]
 * @param {{ filtered?: boolean }} [options]
 * @returns {{ lead: string, term: string, end: string }}
 */
export function resultSummaryParts(count, query = '', options = {}) {
  const total = Math.max(0, Math.trunc(Number(count)) || 0);
  const filters = options?.filtered === true ? ' con filtros' : '';
  if (!isActiveQuery(query)) return { lead: `${total} ${total === 1 ? 'producto' : 'productos'}${filters}`, term: '', end: '' };
  return { lead: `${total} ${total === 1 ? 'resultado' : 'resultados'} para “`, term: displayQuery(query), end: `”${filters}` };
}

/**
 * Línea de resultados del catálogo, en español y con el plural correcto:
 *   sin búsqueda → «10 productos» (singular «1 producto»);
 *   con búsqueda → «3 resultados para “guante”» (singular «1 resultado para “guante”»);
 *   con `options.filtered` → «4 productos con filtros», «2 resultados para “guante” con filtros».
 * Devuelve texto plano: en el navegador se escribe con nodos de texto (`resultSummaryParts`), nunca como HTML.
 * @param {number} count Productos visibles.
 * @param {unknown} [query]
 * @param {{ filtered?: boolean }} [options]
 * @returns {string}
 */
export function resultSummary(count, query = '', options = {}) {
  const { lead, term, end } = resultSummaryParts(count, query, options);
  return `${lead}${term}${end}`;
}
