// @ts-check
// Normalización de texto para comparar y buscar.
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
