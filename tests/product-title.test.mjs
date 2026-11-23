import test from 'node:test';
import assert from 'node:assert/strict';
import { isLongProductName, LONG_PRODUCT_NAME } from '../src/lib/product-title.mjs';
import { loadProjectData } from './helpers.mjs';

const { examples } = await loadProjectData();

test('un nombre de producto es largo a partir de 51 caracteres', () => {
  assert.equal(LONG_PRODUCT_NAME, 50);
  assert.equal(isLongProductName('a'.repeat(50)), false);
  assert.equal(isLongProductName('a'.repeat(51)), true);
  assert.equal(isLongProductName('Guante de nitrilo con recubrimiento de palma y puño tejido para manejo de piezas aceitosas'), true);
  assert.equal(isLongProductName(''), false);
});

test('el largo se cuenta en caracteres como se leen, no en unidades de código', () => {
  // 50 letras con acento: compuestas (é) o con el acento combinado (e + U+0301) siguen siendo 50 caracteres.
  assert.equal(isLongProductName('é'.repeat(50)), false);
  assert.equal(isLongProductName('é'.repeat(50)), false);
  assert.equal(isLongProductName('ñ'.repeat(51)), true);
  // Los espacios de los extremos y los repetidos no alargan el nombre.
  assert.equal(isLongProductName(`  ${'a'.repeat(25)}    ${'b'.repeat(24)}  `), false);
});

test('ningún ejemplo de la vista previa tiene un nombre largo: su ficha no cambia', () => {
  assert.ok(examples.length > 0);
  for (const example of examples) assert.equal(isLongProductName(example.name), false, example.name);
});
