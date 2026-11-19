// Texto que escribe el visitante (la búsqueda del catálogo y la de la solicitud especial): qué se quita sin dejar
// espacio, qué pasa a ser un espacio y qué se conserva, y que el catálogo filtra sobre lo mismo que muestra.
import test from 'node:test';
import assert from 'node:assert/strict';
import { requestDescription } from '../src/lib/contact-core.mjs';
import { displayQuery, filterProducts, isActiveQuery, matchesQuery, matchesSearchText, queryTokens, resultSummary, searchText } from '../src/lib/search.mjs';
import { cleanQuery, normalizeCode, normalizeText } from '../src/lib/text.mjs';

const hex = character => `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, index) => String.fromCodePoint(from + index));

// Sin ancho y sin significado en una consulta: se quitan sin dejar espacio.
const WITHOUT_SPACE = ['­', '؜', '​', '‎', '‏', ...range(0x202A, 0x202E), ...range(0x2060, 0x2064), ...range(0x2066, 0x206F), '﻿'];
// Suelen estar donde había un separador: pasan a ser un espacio.
const AS_SPACE = {
  'carácter de reemplazo': ['�'],
  'controles (Cc)': ['\u0000', '\u0001', '\u0007', '\u0008', '\u0009', '\u000A', '\u000D', '\u001B', '\u001F', '\u007F', '\u0080', '\u0085', '\u009F'],
  'mitades sueltas de un par sustituto': ['\uD800', '\uD83E', '\uDBFF', '\uDC00', '\uDCA5', '\uDFFF'],
};
// Rellenos del hangul: letras para Unicode (\p{Lo}) que no dibujan nada.
const FILLERS = ['ㅤ', 'ᅟ', 'ᅠ', 'ﾠ'];

// La consulta como se leía antes de limpiarla: sirve para comprobar que el texto que no cambia busca lo mismo.
const rawTokens = query => normalizeText(query).split(' ').filter(token => normalizeCode(token) !== '');

const guante = { name: 'Guante recubierto', brandName: 'Marca Alfa', code: 'GX-10', categoryNames: ['Protección de manos'], variants: [] };
const casco = { name: 'Casco blanco', brandName: 'Marca Beta', code: 'CB-20', categoryNames: ['Protección de cabeza'], variants: [] };

test('cleanQuery quita sin dejar espacio U+00AD, U+061C, U+200B, U+200E, U+200F, U+202A a U+202E, U+2060 a U+2064, U+2066 a U+206F y U+FEFF', () => {
  assert.equal(WITHOUT_SPACE.length, 26);
  for (const character of WITHOUT_SPACE) {
    const code = hex(character);
    assert.equal(cleanQuery(`gu${character}ante`), 'guante', `${code} dentro de una palabra`);
    assert.equal(cleanQuery(`${character}guante`), 'guante', `${code} al inicio`);
    assert.equal(cleanQuery(`guante${character}`), 'guante', `${code} al final`);
    assert.equal(cleanQuery(`casco ${character} blanco`), 'casco blanco', `${code} entre dos palabras con espacio`);
    assert.equal(cleanQuery(`casco${character} blanco`), 'casco blanco', code);
    assert.equal(cleanQuery(`casco ${character}blanco`), 'casco blanco', code);
    assert.equal(cleanQuery(`g${character}u${character}${character}a${character}n${character}t${character}e`), 'guante', `${code} varias veces`);
    assert.equal(cleanQuery(character), '', `${code} solo`);
    assert.equal(cleanQuery(` ${character}${character} ${character} `), '', `${code} solo, repetido`);
  }
  assert.equal(cleanQuery('‮guante ​bota⁦ azul⁩﻿'), 'guante bota azul');
});

test('cleanQuery cambia por un espacio el carácter de reemplazo, los controles (Cc) y una mitad suelta de un par sustituto', () => {
  for (const [kind, characters] of Object.entries(AS_SPACE)) {
    for (const character of characters) {
      const code = `${hex(character)} (${kind})`;
      assert.equal(cleanQuery(`guante${character}rojo`), 'guante rojo', `${code} dentro de una palabra`);
      assert.equal(cleanQuery(`${character}guante`), 'guante', `${code} al inicio`);
      assert.equal(cleanQuery(`guante${character}`), 'guante', `${code} al final`);
      assert.equal(cleanQuery(`casco ${character} blanco`), 'casco blanco', `${code} entre dos palabras con espacio`);
      assert.equal(cleanQuery(character), '', `${code} solo`);
    }
  }
  // Un par sustituto completo es un carácter real y se conserva.
  assert.equal(cleanQuery('guante🧤'), 'guante🧤');
});

test('un nombre pegado con un carácter invisible dentro se lee y se busca como la palabra', () => {
  for (const query of ['gu​ante', 'gu­ante', 'gu⁠ante', 'gu﻿ante', 'gu‎ante', '‪gu‬ante']) {
    const code = JSON.stringify(query);
    assert.equal(cleanQuery(query), 'guante', code);
    assert.equal(displayQuery(query), 'guante', code);
    assert.deepEqual(queryTokens(query), ['guante'], code);
    assert.equal(isActiveQuery(query), true, code);
    assert.equal(matchesQuery(guante, query), true, code);
    assert.equal(matchesSearchText(searchText(guante), query), true, code);
    assert.deepEqual(filterProducts([casco, guante], query), [guante], code);
    assert.equal(resultSummary(1, query), '1 resultado para “guante”', code);
    assert.equal(requestDescription(query), 'guante', code);
  }
  // Con un control o un carácter de reemplazo en medio son dos palabras, también para el filtro: lo que se muestra es lo que se busca.
  assert.equal(displayQuery('gu�ante'), 'gu ante');
  assert.deepEqual(queryTokens('gu�ante'), ['gu', 'ante']);
  assert.deepEqual(queryTokens('guante\u0000recubierto'), ['guante', 'recubierto']);
  assert.equal(matchesQuery(guante, 'guante\u0000recubierto'), true);
});

test('el catálogo filtra sobre la consulta limpia: lo que muestra la línea de resultados es lo que se buscó', () => {
  const queries = ['gu​ante', 'casco­ blanco', '‮bl⁣anco', 'guante\u0007rojo', 'cas\uD83Eco', 'ㅤ', 'guante ㅤ', '‍', 'GX​-10', 'zz⁠z'];
  for (const query of queries) {
    const shown = displayQuery(query);
    const code = JSON.stringify(query);
    assert.deepEqual(queryTokens(query), queryTokens(shown), code);
    assert.equal(isActiveQuery(query), isActiveQuery(shown), code);
    for (const product of [guante, casco]) assert.equal(matchesQuery(product, query), matchesQuery(product, shown), `${code} ${product.code}`);
    assert.deepEqual(filterProducts([guante, casco], query), filterProducts([guante, casco], shown), code);
  }
  assert.equal(matchesQuery(guante, 'GX​-10'), true);
  assert.equal(matchesQuery(guante, 'gx10⁡'), true);
});

test('árabe, hebreo, persa con U+200C, un emoji con U+200D y una bandera con caracteres de etiqueta se muestran y se buscan como antes', () => {
  const texts = [
    'قفاز حماية',
    'כפפה מגן',
    'می‌خواهم دستکش',
    '👷🏽‍♀️ guante',
    '🏴󠁧󠁢󠁳󠁣󠁴󠁿 guante',
    'guante ✋️',
    'café Señalización 37-175',
  ];
  for (const text of texts) {
    assert.equal(cleanQuery(text), text, text);
    assert.equal(displayQuery(text), text, text);
    assert.deepEqual(queryTokens(text), rawTokens(text), text);
    assert.equal(requestDescription(text), text, text);
  }
  // Un producto cuyo nombre lleva esas escrituras se encuentra con ellas.
  const written = { name: 'قفاز حماية می‌خواهم כפפה', brandName: 'Marca Alfa', code: 'AR-1', categoryNames: [], variants: [] };
  for (const query of ['قفاز', 'می‌خواهم', 'כפפה', 'حماية כפפה']) assert.equal(matchesQuery(written, query), true, query);
  assert.equal(matchesQuery(guante, '👷🏽‍♀️ guante'), true);
  assert.equal(matchesQuery(guante, '🏴󠁧󠁢󠁳󠁣󠁴󠁿 guante'), true);
});

test('los rellenos del hangul (U+3164, U+115F, U+1160, U+FFA0) solos son una consulta vacía; junto a texto visible se conservan', () => {
  for (const filler of FILLERS) {
    const code = hex(filler);
    for (const query of [filler, `${filler}${filler}`, ` ${filler} ${filler} `, `${filler}‍`, `‮${filler}\u0000`]) {
      assert.equal(cleanQuery(query), '', `${code} ${JSON.stringify(query)}`);
      assert.equal(displayQuery(query), '', code);
      assert.equal(isActiveQuery(query), false, code);
      assert.equal(resultSummary(10, query), '10 productos', code);
      assert.equal(requestDescription(query), '', code);
    }
    // Junto a texto visible no se quitan: el coreano puede necesitarlos.
    assert.equal(cleanQuery(`한${filler}글`), `한${filler}글`, code);
    assert.equal(cleanQuery(`guante ${filler}`), `guante ${filler}`, code);
    assert.equal(requestDescription(`${filler}casco`), `${filler}casco`, code);
    // Una palabra hecha solo de rellenos no se busca: no se ve.
    assert.deepEqual(queryTokens(`guante ${filler}`), ['guante'], code);
    assert.equal(matchesQuery(guante, `guante ${filler}`), true, code);
  }
});

test('la prueba de lo visible no cuenta lo que se ignora por omisión, pero sí letras, árabe, emojis y signos', () => {
  for (const invisible of ['‍', '‌', '️', '\u{E0041}', '͏', '᠎', ...FILLERS]) assert.equal(cleanQuery(invisible), '', hex(invisible));
  for (const visible of ['a', 'Ñ', 'ق', '👷🏽‍♀️', '-', '¿?', '#', '7', '한']) assert.equal(cleanQuery(visible), visible, visible);
});

test('el límite de 200 caracteres de los borradores cuenta caracteres completos después de limpiar', () => {
  assert.equal(requestDescription('a​'.repeat(300)), 'a'.repeat(200));
  assert.equal(requestDescription(`${'­'.repeat(400)}${'b'.repeat(250)}`), 'b'.repeat(200));
  assert.equal(requestDescription('🧤⁠'.repeat(300)), '🧤'.repeat(200));
  assert.equal(Array.from(requestDescription('한ㅤ'.repeat(150))).length, 200);
});
