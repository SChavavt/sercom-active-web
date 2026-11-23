// @ts-check
// Celdas de relleno de las retículas de la lámina (docs/diseno.md, sección 3): cada fila llena las doce
// columnas y lo que ninguna celda ocupa se pinta de blanco; el azul de la lámina solo se ve como filete.
// Aritmética pura, sin datos ni APIs de Node o de Astro. La usan ProductGrid, CategoryPlate,
// CategoryRegister, Steps y BrandCells (por medio de GridFill.astro, salvo BrandCells).
//
// Uso:
//   fillSpans(7, 3)                  → [3]       siete tarjetas de 3 columnas: falta una celda de 3
//   fillSpans(5, 2, { tail: 4 })     → [2, 8]    cinco mosaicos de 2 y la celda ancha de 4 al final de la última fila
//   gridFill(5, { lg: { span: 2, tail: 4 }, md: { span: 3, tail: 6 }, sm: { span: 6, tail: 12 } })
//                                    → [{ lg: 2, md: 3, sm: 6 }, { lg: 8, md: 0, sm: 0 }]

/**
 * @param {unknown} value
 * @param {string} name
 * @param {number} min
 * @param {number} [max]
 */
function wholeNumber(value, name, min, max = Number.MAX_SAFE_INTEGER) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} debe ser un número entero entre ${min} y ${max}; se recibió «${String(value)}».`);
  }
  return value;
}

/**
 * Anchos, en columnas y en orden, de las celdas de relleno que completan una retícula de `columns` pistas con
 * `count` celdas de `span` columnas cada una.
 *
 * Con `tail`, la retícula termina con una celda distinta de `tail` columnas (la celda ancha de solicitud
 * especial de la placa) que debe cerrar la última fila, apoyada en su borde derecho como en la maqueta. Los
 * rellenos van entonces entre las celdas iguales y esa celda final: si no cabe junto a las últimas, el primer
 * relleno termina esa fila y el segundo empieza la siguiente.
 *
 * Devuelve una lista vacía cuando las filas ya se llenan.
 * @param {number} count Celdas iguales (0 o más).
 * @param {number} span Columnas de cada una (1 a `columns`).
 * @param {{ columns?: number, tail?: number }} [options] `columns`: 12 por omisión. `tail`: 0 (sin celda final) por omisión.
 * @returns {number[]}
 */
export function fillSpans(count, span, { columns = 12, tail = 0 } = {}) {
  wholeNumber(columns, 'El número de columnas', 1);
  wholeNumber(count, 'El número de celdas', 0);
  wholeNumber(span, 'El ancho de cada celda', 1, columns);
  wholeNumber(tail, 'El ancho de la celda final', 0, columns);
  // Con un ancho que no divide las columnas, cada fila completa dejaría un sobrante a la derecha.
  if (columns % span !== 0) throw new RangeError(`El ancho de cada celda (${span}) debe dividir las ${columns} columnas.`);
  // Columnas ocupadas en la última fila de celdas iguales (0: la última fila está completa).
  const used = (count % (columns / span)) * span;
  if (tail === 0) return used === 0 ? [] : [columns - used];
  if (used + tail <= columns) {
    const gap = columns - used - tail;
    return gap === 0 ? [] : [gap];
  }
  return [columns - used, columns - tail].filter(width => width > 0);
}

/**
 * Celdas de relleno de una retícula que cambia de forma con el ancho de la pantalla. Recibe, por punto de
 * corte (por ejemplo `lg`, `md`, `sm`), el ancho de cada celda y el de la celda final, y devuelve una entrada
 * por celda de relleno con su ancho en cada punto de corte; 0 significa que en ese punto de corte esa celda no
 * hace falta (se oculta). La lista tiene tantas entradas como el punto de corte que más rellenos necesita.
 * @template {string} K
 * @param {number} count
 * @param {Record<K, { span: number, tail?: number, columns?: number }>} layouts
 * @returns {Record<K, number>[]}
 */
export function gridFill(count, layouts) {
  const keys = /** @type {K[]} */ (Object.keys(layouts));
  if (keys.length === 0) throw new RangeError('gridFill necesita al menos un punto de corte.');
  const spans = keys.map(key => fillSpans(count, layouts[key].span, { columns: layouts[key].columns, tail: layouts[key].tail }));
  const cells = Math.max(...spans.map(list => list.length));
  return Array.from({ length: cells }, (_, index) => /** @type {Record<K, number>} */ (
    Object.fromEntries(keys.map((key, k) => [key, spans[k][index] ?? 0]))
  ));
}
