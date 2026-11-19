import test from 'node:test';
import assert from 'node:assert/strict';
import { displayQuery, isActiveQuery, resultSummary, resultSummaryParts } from '../src/lib/search.mjs';
import { cleanQuery } from '../src/lib/text.mjs';

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

test('displayQuery quita el carácter de reemplazo de una secuencia % mal formada (?q=%E0%A4%A)', () => {
  // URLSearchParams decodifica «%E0%A4%A» como «�%A»: la página no debe mostrar «�».
  const malformed = new URLSearchParams('q=%E0%A4%A').get('q');
  assert.equal(malformed, '�%A');
  assert.equal(displayQuery(malformed), '%A');
  assert.equal(displayQuery('guan�te'), 'guan te');
  assert.equal(displayQuery(' � guante � '), 'guante');
  assert.equal(resultSummary(10, malformed), '10 resultados para “%A”');
  // Una consulta que no es más que caracteres de reemplazo cuenta como vacía.
  assert.equal(displayQuery('��'), '');
  assert.equal(isActiveQuery('�'), false);
  assert.equal(resultSummary(10, '� �'), '10 productos');
});

test('displayQuery quita los controles de dirección, los de Cc y los invisibles (A-04)', () => {
  // U+202E invierte las palabras del sitio que siguen al término: nunca se muestra.
  assert.equal(displayQuery('guante ‮otreibua'), 'guante otreibua');
  assert.equal(resultSummary(0, 'guante ‮otreibua'), '0 resultados para “guante otreibua”');
  assert.equal(displayQuery('‮guante\u0000 ⁦bota⁩​'), 'guante bota');
  assert.equal(displayQuery('guan\uD83Ete'), 'guan te');
  // Es la misma función que limpia la descripción de los borradores.
  for (const query of ['guante ‮otreibua', '\u0000‮', 'قفاز حماية', '👷🏽‍♀️', ' a ﻿ b ']) assert.equal(displayQuery(query), cleanQuery(query), query);
});

test('una consulta hecha solo de caracteres quitados es una consulta vacía', () => {
  for (const query of ['‮', '\u0000\u0007', '​⁠﻿', '⁦⁩', '\uD83E', '‮ \u0000 �']) {
    assert.equal(displayQuery(query), '', JSON.stringify(query));
    assert.equal(isActiveQuery(query), false, JSON.stringify(query));
    assert.equal(resultSummary(10, query), '10 productos', JSON.stringify(query));
  }
});

test('el árabe, el hebreo y los emojis se muestran como se escribieron', () => {
  assert.equal(resultSummary(0, 'قفاز حماية'), '0 resultados para “قفاز حماية”');
  assert.equal(resultSummary(0, 'כפפה מגן'), '0 resultados para “כפפה מגן”');
  assert.equal(resultSummary(1, '👷🏽‍♀️ guante'), '1 resultado para “👷🏽‍♀️ guante”');
  assert.equal(isActiveQuery('قفاز'), true);
});

test('resultSummaryParts separa el término de la frase y une exactamente resultSummary', () => {
  assert.deepEqual(resultSummaryParts(3, 'guante'), { lead: '3 resultados para “', term: 'guante', end: '”' });
  assert.deepEqual(resultSummaryParts(1, '  guante  '), { lead: '1 resultado para “', term: 'guante', end: '”' });
  assert.deepEqual(resultSummaryParts(10), { lead: '10 productos', term: '', end: '' });
  assert.deepEqual(resultSummaryParts(10, '‮'), { lead: '10 productos', term: '', end: '' });
  assert.deepEqual(resultSummaryParts(0, 'guante ‮otreibua'), { lead: '0 resultados para “', term: 'guante otreibua', end: '”' });
  for (const [count, query] of [[10, undefined], [1, ''], [0, 'zzz'], [2, '  Protección   de  MANOS '], [-3, 'a'], [Number.NaN, 'a'], [2.7, null], [5, '- / .'],
    [0, '<img src=x onerror=alert(1)>'], [4, 'قفاز حماية'], [0, '�%A'], [1, 'x'.repeat(500)]]) {
    const { lead, term, end } = resultSummaryParts(count, query);
    assert.equal(`${lead}${term}${end}`, resultSummary(count, query), `${count} ${query}`);
  }
});
