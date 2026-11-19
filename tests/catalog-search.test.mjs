import test from 'node:test';
import assert from 'node:assert/strict';
import { displayQuery, isActiveQuery, resultSummary } from '../src/lib/search.mjs';

test('resultSummary sin búsqueda: conteo de productos con el plural correcto', () => {
  assert.equal(resultSummary(10), '10 productos');
  assert.equal(resultSummary(1), '1 producto');
  assert.equal(resultSummary(0), '0 productos');
  assert.equal(resultSummary(2, ''), '2 productos');
});

test('resultSummary con búsqueda: resultados y consulta entre comillas tipográficas', () => {
  assert.equal(resultSummary(3, 'guante'), '3 resultados para “guante”');
  assert.equal(resultSummary(1, 'guante'), '1 resultado para “guante”');
  assert.equal(resultSummary(0, 'zzz'), '0 resultados para “zzz”');
});

test('resultSummary muestra la consulta tal como se escribió, con los espacios limpios', () => {
  assert.equal(resultSummary(2, '  Protección   de  MANOS '), '2 resultados para “Protección de MANOS”');
  assert.equal(resultSummary(0, '<img src=x onerror=alert(1)>'), '0 resultados para “<img src=x onerror=alert(1)>”');
  assert.equal(resultSummary(0, '"comillas" & más'), '0 resultados para “"comillas" & más”');
});

test('resultSummary trata una consulta sin letras ni números como si no hubiera búsqueda', () => {
  assert.equal(resultSummary(10, '   '), '10 productos');
  assert.equal(resultSummary(10, '- / .'), '10 productos');
  assert.equal(resultSummary(10, null), '10 productos');
});

test('resultSummary no imprime cantidades inválidas', () => {
  assert.equal(resultSummary(-3), '0 productos');
  assert.equal(resultSummary(Number.NaN, 'a'), '0 resultados para “a”');
  assert.equal(resultSummary(2.7), '2 productos');
});

test('isActiveQuery y displayQuery', () => {
  assert.equal(isActiveQuery('guante'), true);
  assert.equal(isActiveQuery('EJ-1'), true);
  assert.equal(isActiveQuery(''), false);
  assert.equal(isActiveQuery('  -  '), false);
  assert.equal(isActiveQuery(undefined), false);
  assert.equal(displayQuery('  a \t b\n'), 'a b');
  assert.equal(displayQuery(undefined), '');
  assert.equal(displayQuery('x'.repeat(500)).length, 500);
});
