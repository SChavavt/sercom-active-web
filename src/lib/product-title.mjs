// @ts-check
// Nombre largo de un producto: la ficha (/productos/{id}/) baja su título un paso de la escala en computadora
// (data-long en el H1, producto.css) para que «Cotizar este producto» siga en la primera pantalla.
// Apto para el navegador y para node:test: sin importaciones y sin datos del proyecto.

/** Caracteres a partir de los cuales (sin contar este número) un nombre es largo. */
export const LONG_PRODUCT_NAME = 50;

/**
 * ¿El nombre pasa de LONG_PRODUCT_NAME caracteres? Cuenta los caracteres como se leen: una letra con acento es
 * uno aunque venga con el acento combinado, y los espacios de los extremos o repetidos no cuentan.
 * @param {string} name
 * @returns {boolean}
 */
export function isLongProductName(name) {
  return [...String(name ?? '').normalize('NFC').replace(/\s+/g, ' ').trim()].length > LONG_PRODUCT_NAME;
}
