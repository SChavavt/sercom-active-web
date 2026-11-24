// @ts-check
// «Más productos de esta categoría» de la página de un producto: qué otros productos lista y en qué orden.
// Función pura y sin datos: recibe los productos como argumento (la página le pasa los de site-data.mjs) y no importa
// nada. Pruebas: tests/related-products.test.mjs.

/**
 * Los productos que la página de un producto lista bajo «Más productos de esta categoría»: solo los que tienen
 * `categoryId` (la categoría de la página: la primera del producto, la que va sobre el título y en la ruta) entre sus
 * categorías. Primero los que la tienen como primera categoría y después los que la tienen como otra de las suyas, cada
 * grupo en el orden recibido (el del catálogo); nunca el producto de la página (`productId`) y como máximo `limit`. Así
 * cada tarjeta, que muestra su propia primera categoría, lleva la de la página siempre que haya bastantes.
 * Sin categoría (`undefined`) o sin otro producto que la tenga, una lista vacía: la página muestra entonces «Más
 * productos del catálogo». Una categoría que el producto tiene en segundo lugar no cuenta.
 * @template {{ id: string, categoryIds: readonly string[] }} T
 * @param {readonly T[]} products Los productos del catálogo, en su orden.
 * @param {{ productId: string, categoryId: string | undefined, limit: number }} page
 * @returns {T[]}
 */
export function sameCategoryProducts(products, { productId, categoryId, limit }) {
  if (categoryId === undefined) return [];
  const others = products.filter(product => product.id !== productId && product.categoryIds.includes(categoryId));
  const first = others.filter(product => product.categoryIds[0] === categoryId);
  const second = others.filter(product => product.categoryIds[0] !== categoryId);
  return [...first, ...second].slice(0, Math.max(0, limit));
}
