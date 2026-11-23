import test from 'node:test';
import assert from 'node:assert/strict';
import { filterProducts, matchesQuery, matchesSearchText, queryTokens, SEARCH_PARAM, searchText } from '../src/lib/search.mjs';
import { requestDescription } from '../src/lib/contact-core.mjs';
import { createSiteData } from '../src/lib/site-data-core.mjs';
import { cleanQuery, normalizeCode, normalizeText } from '../src/lib/text.mjs';
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

// --- Texto de una búsqueda que llega de la dirección o del campo (A-04) --------------------------------------
// Cada clase de carácter que se quita, escrita con su punto de código para que se vea en la prueba.
const REMOVED = {
  'carácter de reemplazo': ['�'],
  'controles (Cc)': ['\u0000', '\u0001', '\u0007', '\u0008', '\u001B', '\u001F', '\u007F', '\u0080', '\u0085', '\u009F'],
  'controles de dirección': ['؜', '‎', '‏', '‪', '‫', '‬', '‭', '‮', '⁦', '⁧', '⁨', '⁩'],
  invisibles: ['​', '⁠', '﻿'],
  'mitades sueltas de un par sustituto': ['\uD800', '\uD83E', '\uDBFF', '\uDC00', '\uDCA5', '\uDFFF'],
};

const SPACE_IN_WORD = new Set(['carácter de reemplazo', 'controles (Cc)', 'mitades sueltas de un par sustituto']);

test('cleanQuery quita cada carácter de control, de dirección o invisible, al inicio, en medio y al final', () => {
  for (const [kind, characters] of Object.entries(REMOVED)) {
    for (const character of characters) {
      const code = `U+${character.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')} (${kind})`;
      assert.equal(cleanQuery(`${character}guante`), 'guante', code);
      assert.equal(cleanQuery(`guante${character}`), 'guante', code);
      // En medio, el de reemplazo, un control o una mitad suelta dejan un espacio (suelen estar donde había un
      // separador); los de dirección y los invisibles no tienen ancho y se quitan sin dejar espacio.
      assert.equal(cleanQuery(`guante${character}rojo`), SPACE_IN_WORD.has(kind) ? 'guante rojo' : 'guanterojo', code);
      assert.equal(cleanQuery(`casco ${character} blanco`), 'casco blanco', code);
      assert.equal(cleanQuery(character), '', code);
      assert.equal(cleanQuery(`${character}${character} ${character}`), '', code);
    }
  }
  // Mezclados con texto real.
  assert.equal(cleanQuery('‮guante \u0001bota​ azul‮'), 'guante bota azul');
  assert.equal(cleanQuery('guante ‮otreibua'), 'guante otreibua');
  assert.equal(cleanQuery('⁦guante⁩ ⁧bota⁩'), 'guante bota');
});

test('cleanQuery deja una consulta hecha solo de caracteres quitados vacía', () => {
  // Separados por espacios: dos mitades seguidas («\uDBFF\uDC00») forman un par completo, que es un carácter real.
  const all = Object.values(REMOVED).flat().join(' ');
  assert.equal(cleanQuery(all), '');
  assert.equal(cleanQuery(` \t\n${all}\r\n `), '');
  for (const value of ['', '   ', null, undefined]) assert.equal(cleanQuery(value), '', String(value));
});

test('cleanQuery conserva las letras, cifras y marcas de cualquier escritura, los emojis y las uniones U+200C y U+200D', () => {
  for (const text of [
    'قفاز حماية',                 // árabe
    'כפפה מגן',                   // hebreo
    'नमस्ते दस्ताने',              // devanagari, con marcas combinantes
    'می‌خواهم',              // persa, con la no-unión U+200C
    '👷🏽‍♀️ guante',         // emoji compuesto con U+200D y un selector de variante
    '🧤🦺🥾',                      // pares sustitutos completos
    'café Señalización 37-175',
    '<img src=x onerror=alert(1)> & "comillas" 100%',
  ]) assert.equal(cleanQuery(text), text, text);
  // Lo demás sigue igual que antes: espacios recortados y uno solo entre palabras.
  assert.equal(cleanQuery('  Protección   de\tMANOS \n'), 'Protección de MANOS');
  assert.equal(cleanQuery('x'.repeat(500)), 'x'.repeat(500));
  assert.equal(cleanQuery(37175), '37175');
});

test('cleanQuery deja vacía una consulta sin ninguna letra, cifra, símbolo ni signo visible', () => {
  // Caracteres de formato, de unión o selectores que no se quitan uno por uno (U+200C y U+200D hacen falta en
  // palabras y emojis), pero que solos no muestran nada: la consulta queda vacía, como en el catálogo.
  const invisible = ['\u200C', '\u200D', '\u00AD', '\u2064', '\uFE0F', '\u{E0041}', '\u180E', '\u034F', '\u206A', '\u0301', '\u{E0100}'];
  for (const character of invisible) {
    const code = `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
    assert.equal(cleanQuery(character), '', code);
    assert.equal(cleanQuery(`  ${character}${character} ${character}\u0001‮`), '', code);
  }
  assert.equal(cleanQuery(invisible.join('')), '');
  // Con texto visible se conservan tal cual: solo se vacía la consulta que no muestra nada.
  assert.equal(cleanQuery('می‌خواهم'), 'می‌خواهم');
  assert.equal(cleanQuery('👷🏽‍♀️'), '👷🏽‍♀️');
  assert.equal(cleanQuery('\u200Dguante'), '\u200Dguante');
  // El guion suave no tiene ancho: se quita sin dejar espacio, también en medio de una palabra.
  assert.equal(cleanQuery('co\u00ADllar'), 'collar');
  // Un signo o un símbolo solos sí se ven: se muestran como los escribió la persona.
  for (const text of ['-', '¿?', '#', '$', '·', '❤️', '🇲🇽', '1️⃣']) assert.equal(cleanQuery(text), text, text);
});

// Rellenos del hangul: letras para Unicode (\p{Lo}) que no dibujan nada. Se quitan sin dejar espacio, como los otros
// invisibles: pegado a una palabra, el relleno no puede hacer que la línea de resultados muestre una palabra que la
// búsqueda no busca (?q=cas%E1%85%9Fco y ?q=%E3%85%A4casco).
const HANGUL_FILLERS = ['ᅟ', 'ᅠ', 'ㅤ', 'ﾠ'];
test('cleanQuery quita sin dejar espacio los rellenos del hangul U+115F, U+1160, U+3164 y U+FFA0', () => {
  const casco = exampleProducts.find(product => product.code === 'EJ-3001');
  assert.ok(casco && /^Casco\b/.test(casco.name));
  for (const filler of HANGUL_FILLERS) {
    const code = `U+${filler.codePointAt(0).toString(16).toUpperCase()}`;
    for (const [where, query] of [['dentro', `cas${filler}co`], ['antes', `${filler}casco`], ['después', `casco${filler}`]]) {
      const label = `${code} ${where} de la palabra`;
      assert.equal(cleanQuery(query), 'casco', label);
      assert.deepEqual(queryTokens(query), ['casco'], label);
      assert.equal(matchesQuery(casco, query), true, label);
      assert.equal(matchesSearchText(searchText(casco), query), true, label);
      assert.deepEqual(codes(exampleProducts, query), ['EJ-3001'], label);
      assert.equal(requestDescription(query), 'casco', label);
    }
    // Solo, o solo con otros caracteres que no se ven: consulta vacía.
    for (const query of [filler, `${filler}${filler}`, ` ${filler} ${filler} `, `${filler}‍`]) {
      assert.equal(cleanQuery(query), '', `${code} ${JSON.stringify(query)}`);
      assert.deepEqual(queryTokens(query), [], code);
      assert.equal(codes(exampleProducts, query).length, exampleProducts.length, code);
      assert.equal(requestDescription(query), '', code);
    }
  }
  // La prueba de lo visible sigue sin contar lo que se ignora por omisión: solo selectores de variante es vacía.
  assert.equal(cleanQuery('️︎\u{E0100}'), '');
});
