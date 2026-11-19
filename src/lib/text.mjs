// @ts-check
// Normalización de texto para comparar y buscar, y limpieza del texto que escribe el visitante.
// Apto para el navegador y para node:test: sin importaciones y sin datos del proyecto.

/**
 * Deja un texto listo para comparar: sin acentos ni diéresis, en minúsculas,
 * sin espacios al inicio o al final y con un solo espacio entre palabras.
 * La «ñ» se compara como «n» para que «senalizacion» encuentre «señalización».
 * Solo se quitan las marcas que acompañan a una letra (categoría Unicode M); los signos sueltos como
 * «·», «^» o «´» se conservan.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normaliza un código de fabricante: además de lo anterior quita todo lo que no sea
 * letra o número (guiones, diagonales, puntos, espacios), de modo que «37175» coincide
 * con «37-175» y «al026cl3c» con «AL026CL/3C».
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeCode(value) {
  return normalizeText(value).replace(/[^\p{L}\p{N}]+/gu, '');
}

// Texto que llega del visitante (la búsqueda de la dirección o del campo). Tres clases de caracteres:
//   - Se quitan sin dejar espacio los que no tienen ancho ni significado en una consulta (REMOVED_IN_QUERY): el guion
//     suave U+00AD, los de dirección (U+061C, U+200E, U+200F, U+202A a U+202E, U+2066 a U+2069), que invertirían las
//     palabras del propio sitio, los invisibles U+200B, U+2060 a U+2064 y U+FEFF, y los de formato obsoletos U+206A a
//     U+206F, y los rellenos del hangul U+115F, U+1160, U+3164 y U+FFA0, que son letras para Unicode pero no dibujan
//     nada: pegados a una palabra, la línea de resultados mostraría una palabra que la búsqueda no busca. Un nombre
//     pegado con uno de ellos dentro de una palabra («gu<U+200B>ante», «cas<U+115F>co») se lee y se busca como la palabra.
//   - Pasan a ser un espacio (SPACE_IN_QUERY) el de reemplazo U+FFFD (así llega una secuencia % mal formada), los
//     controles (Cc) y una mitad suelta de un par sustituto (un emoji partido al pegar), porque suelen estar donde había
//     un separador. Con la bandera «u», \p{Cs} solo encuentra una mitad suelta: un par completo es un solo carácter.
//   - Se conservan U+200C y U+200D (varias escrituras y los emojis compuestos los necesitan), los selectores de variante,
//     los caracteres de etiqueta (banderas) y toda letra, cifra, marca, símbolo o signo de cualquier escritura.
const REMOVED_IN_QUERY = /[\u00AD\u061C\u115F\u1160\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\u3164\uFEFF\uFFA0]/gu;
const SPACE_IN_QUERY = /[\uFFFD\p{Cc}]|\p{Cs}/gu;
// Lo que se ve de una consulta: una letra, una cifra, un símbolo (los emojis lo son) o un signo de puntuación que no sea
// de los que se ignoran por omisión (\p{DI}). Una consulta sin ninguno (solo U+200C, U+200D, selectores de variante,
// marcas sueltas u otros caracteres de formato, que no se quitan uno por uno porque el texto real los necesita) no
// muestra nada: queda vacía, y el catálogo y la solicitud especial la tratan como sin búsqueda. Junto a texto visible
// esos caracteres se conservan. Los rellenos del hangul ya no llegan aquí: se quitan antes (REMOVED_IN_QUERY).
const VISIBLE_IN_QUERY = /(?!\p{DI})[\p{L}\p{N}\p{S}\p{P}]/u;

/**
 * Texto que escribió el visitante, listo para mostrarlo dentro de una frase del sitio, para buscarlo en el catálogo o
 * para ponerlo en un borrador: quita sin dejar espacio cada carácter de REMOVED_IN_QUERY, cambia por un espacio cada
 * uno de SPACE_IN_QUERY, y luego recorta y deja un solo espacio entre palabras. Conserva mayúsculas, acentos y las
 * letras, cifras y marcas de cualquier escritura. Un texto sin nada visible (VISIBLE_IN_QUERY) queda vacío. Lo usan
 * `displayQuery` y `queryTokens` (catálogo: lo que se muestra es lo que se busca) y `requestDescription` (solicitud
 * especial y sus borradores), así todos leen lo mismo.
 * @param {unknown} value
 * @returns {string}
 */
export function cleanQuery(value) {
  const text = String(value ?? '').replace(REMOVED_IN_QUERY, '').replace(SPACE_IN_QUERY, ' ').replace(/\s+/g, ' ').trim();
  return VISIBLE_IN_QUERY.test(text) ? text : '';
}
