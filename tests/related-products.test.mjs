// «Más productos de esta categoría» de la ficha: qué productos lista y en qué orden (src/lib/related-products.mjs).
// Productos sintéticos escritos para estas pruebas; cada lista esperada está escrita a mano.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sameCategoryProducts } from '../src/lib/related-products.mjs';

const product = (id, ...categoryIds) => Object.freeze({ id, categoryIds: Object.freeze(categoryIds) });
const ids = list => list.map(entry => entry.id);
const more = (products, productId, categoryId, limit = 4) => ids(sameCategoryProducts(Object.freeze(products), { productId, categoryId, limit }));

test('primero los productos cuya primera categoría es la de la página y después los que la tienen como otra, cada grupo en el orden recibido', () => {
  const products = [
    product('guante-a', 'manos'),
    product('soldador-b', 'soldadura', 'manos'),
    product('guante-c', 'manos', 'ropa'),
    product('overol-d', 'ropa'),
    product('mangas-e', 'ropa', 'manos'),
    product('guante-f', 'manos'),
  ];
  assert.deepEqual(more(products, 'guante-f', 'manos'), ['guante-a', 'guante-c', 'soldador-b', 'mangas-e']);
  assert.deepEqual(more(products, 'guante-a', 'manos'), ['guante-c', 'guante-f', 'soldador-b', 'mangas-e']);
  // Desde la página de un producto que tiene la categoría en segundo lugar: la de la página es su primera.
  assert.deepEqual(more(products, 'soldador-b', 'soldadura'), []);
  assert.deepEqual(more(products, 'mangas-e', 'ropa'), ['overol-d', 'guante-c']);
});

test('como máximo el límite, y nunca el producto de la página', () => {
  const products = ['a', 'b', 'c', 'd', 'e', 'f'].map(letter => product(`casco-${letter}`, 'cabeza'));
  assert.deepEqual(more(products, 'casco-a', 'cabeza'), ['casco-b', 'casco-c', 'casco-d', 'casco-e']);
  assert.deepEqual(more(products, 'casco-c', 'cabeza'), ['casco-a', 'casco-b', 'casco-d', 'casco-e']);
  assert.deepEqual(more(products, 'casco-a', 'cabeza', 2), ['casco-b', 'casco-c']);
  assert.deepEqual(more(products, 'casco-a', 'cabeza', 0), []);
  // Los de la segunda categoría también cuentan para el límite, después de los de la primera.
  const mixed = [product('lente-a', 'ojos'), product('careta-b', 'soldadura', 'ojos'), product('lente-c', 'ojos'), product('careta-d', 'soldadura', 'ojos')];
  assert.deepEqual(more(mixed, 'lente-a', 'ojos', 2), ['lente-c', 'careta-b']);
});

test('una página cuya única categoría compartida es su segunda no lista nada: no hay otro producto de su categoría', () => {
  const products = [
    product('chaleco-a', 'vial', 'ropa'),
    product('overol-b', 'ropa'),
    product('overol-c', 'ropa', 'quimicos'),
  ];
  assert.deepEqual(more(products, 'chaleco-a', 'vial'), []);
  // Los overoles sí listan el chaleco, que tiene «ropa» como segunda categoría, después de los de primera.
  assert.deepEqual(more(products, 'overol-b', 'ropa'), ['overol-c', 'chaleco-a']);
});

test('sin otro producto de la categoría, o sin categoría, la lista queda vacía', () => {
  const products = [product('arnes-a', 'alturas'), product('bota-b', 'calzado')];
  assert.deepEqual(more(products, 'arnes-a', 'alturas'), []);
  assert.deepEqual(more(products, 'arnes-a', undefined), []);
  assert.deepEqual(more([], 'arnes-a', 'alturas'), []);
});

test('devuelve los mismos objetos que recibe, sin cambiar la lista', () => {
  const products = [product('tapon-a', 'auditiva'), product('orejera-b', 'auditiva')];
  const result = sameCategoryProducts(products, { productId: 'tapon-a', categoryId: 'auditiva', limit: 4 });
  assert.equal(result[0], products[1]);
  assert.notEqual(result, products);
  assert.deepEqual(ids(products), ['tapon-a', 'orejera-b']);
});
