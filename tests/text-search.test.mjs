import test from 'node:test';
import assert from 'node:assert/strict';
import { filterProducts, matchesQuery, matchesSearchText, queryTokens, SEARCH_PARAM, searchText } from '../src/lib/search.mjs';
import { createSiteData } from '../src/lib/site-data-core.mjs';
import { normalizeCode, normalizeText } from '../src/lib/text.mjs';
import { loadProjectData } from './helpers.mjs';

const { brands, catalog, examples } = await loadProjectData();
// Los diez ejemplos de la vista previa, con la forma pública que reciben las páginas.
const exampleProducts = createSiteData({ mode: 'preview', catalog, brands, exampleProducts: examples }).products;
// Productos sintéticos de prueba con códigos parecidos a los de un fabricante. Nunca se importan en el sitio.
const synthetic = [
  { name: 'Guante sintético de prueba', brandName: 'Marca Alfa', code: '37-175', categoryNames: ['Protección de manos'], variants: [{ code: '37-175-09' }, { code: '37-175-10' }] },
  { name: 'Arnés sintético de prueba', brandName: 'Marca Beta', code: 'AL026CL/3C', categoryNames: ['Trabajo en alturas'], variants: [] },
  { name: 'Señal sintética de prueba', brandName: 'Marca Beta', code: 'S.100 A', categoryNames: ['Vial y señalización'], variants: [{ code: 'S.100 A/R' }] },
];
const codes = (products, query) => filterProducts(products, query).map(product => product.code);

test('normalizeText quita acentos y mayúsculas, recorta y deja un solo espacio', () => {
  assert.equal(normalizeText('  Protección   de\tOJOS \n y cara  '), 'proteccion de ojos y cara');
  assert.equal(normalizeText('Vial y señalización'), 'vial y senalizacion');
  assert.equal(normalizeText('ARNÉS · Pingüino'), 'arnes · pinguino');
  // Solo se quitan las marcas de una letra; los signos sueltos se conservan.
  assert.equal(normalizeText('A^2 `b´ ñ'), 'a^2 `b´ n');
  // La misma letra escrita de dos formas (compuesta o con acento combinado) se compara igual.
  assert.equal(normalizeText('café'), normalizeText('café'));
  assert.equal(normalizeText('AL026CL/3C'), 'al026cl/3c');
  assert.equal(normalizeText(37175), '37175');
  assert.equal(normalizeText(null), '');
  assert.equal(normalizeText(undefined), '');
  assert.equal(normalizeText('   '), '');
});

test('normalizeCode además quita separadores: «37175» coincide con «37-175»', () => {
  assert.equal(normalizeCode('37-175'), '37175');
  assert.equal(normalizeCode('37175'), normalizeCode('37-175'));
  assert.equal(normalizeCode('al026cl3c'), normalizeCode('AL026CL/3C'));
  assert.equal(normalizeCode(' AL026CL / 3C '), 'al026cl3c');
  assert.equal(normalizeCode('S.100_A·R'), 's100ar');
  assert.equal(normalizeCode('EJ-1001-7'), 'ej10017');
  assert.equal(normalizeCode('Ñ-01'), 'n01');
  assert.equal(normalizeCode('-/. '), '');
  assert.equal(normalizeCode(null), '');
});

test('una consulta vacía devuelve todos los productos, en una lista nueva', () => {
  for (const query of ['', '   ', null, undefined, '-', ' / . ']) {
    const result = filterProducts(exampleProducts, query);
    assert.deepEqual(result, [...exampleProducts], JSON.stringify(query));
    assert.notEqual(result, exampleProducts);
  }
  assert.deepEqual(filterProducts([], 'guante'), []);
  assert.ok(matchesQuery(exampleProducts[0], ''));
});

test('la búsqueda no distingue mayúsculas ni acentos', () => {
  assert.deepEqual(codes(exampleProducts, 'arnes'), ['EJ-6001']);
  assert.deepEqual(codes(exampleProducts, 'ARNÉS'), ['EJ-6001']);
  assert.deepEqual(codes(exampleProducts, 'Señalización'), ['EJ-9001']);
  assert.deepEqual(codes(exampleProducts, 'senalizacion'), ['EJ-9001']);
  assert.deepEqual(codes(exampleProducts, 'GUANTE'), ['EJ-1001']);
  assert.deepEqual(codes(exampleProducts, 'guant'), ['EJ-1001']);
});

test('encuentra por código con y sin separadores', () => {
  for (const query of ['37-175', '37175', '37 175', '37/175', '37.175']) assert.deepEqual(codes(synthetic, query), ['37-175'], query);
  for (const query of ['AL026CL/3C', 'al026cl3c', 'AL026CL-3C', 'al026cl 3c', 'AL026']) assert.deepEqual(codes(synthetic, query), ['AL026CL/3C'], query);
  for (const query of ['S.100 A', 's100a', 'S-100-A', 's100']) assert.deepEqual(codes(synthetic, query), ['S.100 A'], query);
  for (const query of ['EJ-1001', 'ej1001', 'ej 1001', 'Ej-1001']) assert.deepEqual(codes(exampleProducts, query), ['EJ-1001'], query);
  assert.deepEqual(codes(exampleProducts, 'EJ-'), exampleProducts.map(product => product.code));
});

test('encuentra por el código de una variante', () => {
  assert.deepEqual(codes(synthetic, '37-175-10'), ['37-175']);
  assert.deepEqual(codes(synthetic, '3717510'), ['37-175']);
  assert.deepEqual(codes(synthetic, 's100ar'), ['S.100 A']);
  assert.deepEqual(codes(exampleProducts, 'EJ-8001-27'), ['EJ-8001']);
  assert.deepEqual(codes(exampleProducts, 'ej800127'), ['EJ-8001']);
  assert.deepEqual(codes(exampleProducts, 'EJ-3001-AZ'), ['EJ-3001']);
});

test('encuentra por marca y por nombre de categoría', () => {
  assert.deepEqual(codes(synthetic, 'marca alfa'), ['37-175']);
  assert.deepEqual(codes(synthetic, 'BETA'), ['AL026CL/3C', 'S.100 A']);
  assert.deepEqual(codes(synthetic, 'marca'), ['37-175', 'AL026CL/3C', 'S.100 A']);
  assert.deepEqual(codes(exampleProducts, 'marca de ejemplo'), exampleProducts.map(product => product.code));
  assert.deepEqual(codes(exampleProducts, 'calzado'), ['EJ-8001']);
  assert.deepEqual(codes(exampleProducts, 'ojos y cara'), ['EJ-2001']);
  assert.deepEqual(codes(synthetic, 'alturas'), ['AL026CL/3C']);
  // «protección» está en el nombre de varias categorías.
  assert.deepEqual(codes(exampleProducts, 'proteccion'), ['EJ-1001', 'EJ-2001', 'EJ-3001', 'EJ-4001', 'EJ-5001', 'EJ-7001']);
});

test('todas las palabras de la consulta deben coincidir, en cualquier campo y en cualquier orden', () => {
  assert.deepEqual(codes(exampleProducts, 'casco cachucha'), ['EJ-3001']);
  assert.deepEqual(codes(exampleProducts, 'cachucha  CASCO'), ['EJ-3001']);
  assert.deepEqual(codes(exampleProducts, 'casco EJ-3001 cabeza'), ['EJ-3001']);
  assert.deepEqual(codes(exampleProducts, 'casco EJ-1001'), []);
  assert.deepEqual(codes(synthetic, 'guante 37175 manos alfa'), ['37-175']);
  assert.deepEqual(codes(synthetic, 'guante alturas'), []);
});

test('sin coincidencias devuelve una lista vacía', () => {
  assert.deepEqual(filterProducts(exampleProducts, 'zzzz'), []);
  assert.deepEqual(filterProducts(exampleProducts, 'guante zzzz'), []);
  assert.deepEqual(filterProducts(synthetic, '99-999'), []);
  assert.equal(matchesQuery(exampleProducts[0], 'casco'), false);
  assert.equal(matchesQuery(exampleProducts[0], 'guante'), true);
});

test('conserva el orden y no modifica la lista ni los productos', () => {
  const frozen = Object.freeze([...exampleProducts]);
  assert.deepEqual(codes(frozen, 'de ejemplo'), exampleProducts.map(product => product.code));
  assert.deepEqual(filterProducts(frozen, 'pieza'), []); // la unidad de venta no forma parte de la búsqueda
  assert.equal(frozen.length, 10);
});

test('queryTokens separa la consulta en palabras normalizadas y descarta los signos sueltos', () => {
  assert.deepEqual(queryTokens('  Guante   37-175 / ÁCIDO '), ['guante', '37-175', 'acido']);
  assert.deepEqual(queryTokens(''), []);
  assert.deepEqual(queryTokens(null), []);
  assert.equal(SEARCH_PARAM, 'q');
});

test('searchText y matchesSearchText dan en el navegador el mismo resultado que matchesQuery al compilar', () => {
  const guante = searchText(exampleProducts[0]);
  assert.equal(guante, normalizeText(guante));
  for (const part of ['guante de ejemplo recubierto', 'marca de ejemplo', 'ej-1001', 'ej-1001-10', 'proteccion de manos', 'ej1001', 'ej100110']) {
    assert.ok(guante.includes(part), part);
  }
  const queries = ['', 'guante', 'GUANTE recubierto', 'ej1001', 'EJ-1001-7', 'casco', '37175', 'al026cl3c', 'senalizacion', 'marca beta', 'zzzz', 'manos ej'];
  for (const product of [...exampleProducts, ...synthetic]) {
    const attribute = searchText(product);
    for (const query of queries) assert.equal(matchesSearchText(attribute, query), matchesQuery(product, query), `${product.code} / ${query}`);
  }
  assert.equal(matchesSearchText(null, 'guante'), false);
  assert.equal(matchesSearchText(undefined, ''), true);
});
