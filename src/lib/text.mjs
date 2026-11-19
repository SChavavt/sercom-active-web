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

// Caracteres que nunca se muestran ni entran en un borrador cuando el texto llega del visitante (la búsqueda de
// la dirección o del campo): el de reemplazo U+FFFD (así llega una secuencia % mal formada), los controles (Cc),
// los de dirección (U+061C, U+200E, U+200F, U+202A a U+202E, U+2066 a U+2069), que invertirían las palabras
// del propio sitio, y los invisibles U+200B, U+2060 y U+FEFF. Con la bandera «u», \p{Cs} solo encuentra una mitad
// suelta de un par sustituto (un emoji partido al pegar): un par completo es un solo carácter y no cuenta.
// U+200C y U+200D se conservan: varias escrituras y los emojis compuestos los necesitan.
const UNSAFE_IN_QUERY = /[�\p{Cc}؜‎‏‪-‮⁦-⁩​⁠﻿]|\p{Cs}/gu;
// Lo que se ve de una consulta: una letra, una cifra, un símbolo (los emojis lo son) o un signo de puntuación. Una
// consulta sin ninguno (solo U+200C, U+200D, U+00AD, selectores de variante, marcas sueltas u otros caracteres de
// formato, que no se quitan uno por uno porque el texto real los necesita) no muestra nada: queda vacía, y el
// catálogo (que ya no la usaba para filtrar, `isActiveQuery`) y la solicitud especial la tratan como sin búsqueda.
const VISIBLE_IN_QUERY = /[\p{L}\p{N}\p{S}\p{P}]/u;

/**
 * Texto que escribió el visitante, listo para mostrarlo dentro de una frase del sitio o para ponerlo en un
 * borrador: cada carácter de UNSAFE_IN_QUERY pasa a ser un espacio, y luego se recorta y queda un solo espacio
 * entre palabras. Conserva mayúsculas, acentos y las letras, cifras y marcas de cualquier escritura. Un texto
 * hecho solo de esos caracteres, o sin nada visible (VISIBLE_IN_QUERY), queda vacío. Lo usan `displayQuery`
 * (catálogo) y `requestDescription` (solicitud especial y sus borradores), así los dos muestran lo mismo.
 * @param {unknown} value
 * @returns {string}
 */
export function cleanQuery(value) {
  const text = String(value ?? '').replace(UNSAFE_IN_QUERY, ' ').replace(/\s+/g, ' ').trim();
  return VISIBLE_IN_QUERY.test(text) ? text : '';
}
