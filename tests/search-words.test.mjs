// Búsqueda por palabras: plurales, los tres pares de sinónimos revisados y la línea de resultados con filtros.
import test from 'node:test';
import assert from 'node:assert/strict';
import { filterProducts, matchesQuery, matchesSearchText, resultSummary, resultSummaryParts, SEARCH_SYNONYMS, searchText, singularForms, tokenAlternatives } from '../src/lib/search.mjs';
import { createSiteData } from '../src/lib/site-data-core.mjs';
import { loadProjectData } from './helpers.mjs';

const { brands, catalog, examples } = await loadProjectData();
const previewProducts = createSiteData({ mode: 'preview', catalog, brands, exampleProducts: examples }).products;

// Productos sintéticos de prueba con la forma pública que usa la búsqueda. Nunca se importan en el sitio.
const product = (name, categoryNames = ['Protección de manos'], extra = {}) => ({ name, brandName: 'Marca Alfa', code: 'SP-100', categoryNames, variants: [], ...extra });
const finds = (item, query) => matchesQuery(item, query);

test('singularForms: la primera regla que aplica da las formas singulares', () => {
  // Regla 1: «-ces» con al menos 5 letras → «-z» y la palabra sin su última «s».
  assert.deepEqual(singularForms('lapices'), ['lapiz', 'lapice']);
  assert.deepEqual(singularForms('luces'), ['luz', 'luce']);
  // Regla 2: «-es» después de l, r, n, d, s, j o y, con al menos 3 letras de raíz.
  assert.deepEqual(singularForms('overoles'), ['overol']);
  assert.deepEqual(singularForms('respiradores'), ['respirador']);
  assert.deepEqual(singularForms('arneses'), ['arnes']);
  assert.deepEqual(singularForms('tapones'), ['tapon']);
  assert.deepEqual(singularForms('pares'), ['par']);
  assert.deepEqual(singularForms('redes'), ['red']);
  assert.deepEqual(singularForms('cables'), ['cabl']);
  assert.deepEqual(singularForms('relojes'), ['reloj']);
  assert.deepEqual(singularForms('reyes'), ['rey']);
  // Regla 3: «-s» que no es «-is» ni «-us», con al menos 3 letras de raíz.
  assert.deepEqual(singularForms('guantes'), ['guante']);
  assert.deepEqual(singularForms('lentes'), ['lente']);
  assert.deepEqual(singularForms('kits'), ['kit']);
  assert.deepEqual(singularForms('pies'), ['pie']);
  // Solo la primera regla: «luces» no pasa también por la regla 3, ni «redes» da «rede».
  assert.ok(!singularForms('redes').includes('rede'));
  // Sin forma singular: «-is», «-us», palabras cortas, sin «s» final y lo que no es una palabra de letras.
  for (const word of ['gris', 'tenis', 'virus', 'gas', 'es', 'las', 'mes', 'guante', 'casco', '', '37-175s', 'ej1001s', 'a1s']) {
    assert.deepEqual(singularForms(word), [], word);
  }
  // «aces»: la regla 1 pide 5 letras; la 2 no aplica (c); la 3 sí.
  assert.deepEqual(singularForms('aces'), ['ace']);
});

test('tokenAlternatives: la palabra, sus singulares y los sinónimos de esas formas, sin repetir', () => {
  assert.deepEqual(tokenAlternatives('lentes'), ['lentes', 'lente', 'gafa']);
  assert.deepEqual(tokenAlternatives('respiradores'), ['respiradores', 'respirador']);
  assert.deepEqual(tokenAlternatives('lapices'), ['lapices', 'lapiz', 'lapice']);
  assert.deepEqual(tokenAlternatives('guante'), ['guante']);
  assert.deepEqual(tokenAlternatives('gris'), ['gris']);
  assert.deepEqual(tokenAlternatives('gafas'), ['gafas', 'gafa', 'lente']);
  assert.deepEqual(tokenAlternatives('lente'), ['lente', 'gafa']);
  assert.deepEqual(tokenAlternatives('botas'), ['botas', 'bota', 'calzado']);
  assert.deepEqual(tokenAlternatives('calzado'), ['calzado', 'bota']);
  assert.deepEqual(tokenAlternatives('orejeras'), ['orejeras', 'orejera', 'auditiva']);
  assert.deepEqual(tokenAlternatives('auditiva'), ['auditiva', 'orejera']);
});

test('SEARCH_SYNONYMS son exactamente los tres pares revisados, congelados', () => {
  assert.deepEqual(SEARCH_SYNONYMS, [['lente', 'gafa'], ['bota', 'calzado'], ['orejera', 'auditiva']]);
  assert.ok(Object.isFrozen(SEARCH_SYNONYMS) && SEARCH_SYNONYMS.every(group => Object.isFrozen(group)));
  // Nada fuera de los tres pares es un sinónimo.
  for (const word of ['zapato', 'goggle', 'careta', 'casco', 'cachucha', 'tapon', 'respirador', 'mascarilla', 'anteojo', 'tenis', 'protector']) {
    assert.deepEqual(tokenAlternatives(word), [word], word);
  }
  assert.equal(finds(product('Zapato sintético de prueba', ['Ropa']), 'bota'), false);
  assert.equal(finds(product('Careta sintética de prueba', ['Soldadura']), 'lentes'), false);
  assert.equal(finds(product('Tapón sintético de prueba', ['Ropa']), 'orejera'), false);
});

test('un plural encuentra el singular con cada una de las tres reglas', () => {
  assert.equal(finds(product('Red sintética de prueba'), 'redes'), true);
  assert.equal(finds(product('Cable sintético de prueba'), 'cables'), true);
  assert.equal(finds(product('Lápiz sintético de prueba'), 'lapices'), true);
  assert.equal(finds(product('Lápiz sintético de prueba'), 'LÁPICES'), true);
  assert.equal(finds(product('Guante sintético de prueba'), 'guantes'), true);
  assert.equal(finds(product('Overol sintético de prueba'), 'overoles'), true);
  assert.equal(finds(product('Tapón sintético de prueba'), 'tapones'), true);
  // Con los ejemplos de la vista previa: «guantes» encuentra los tres guantes y «lentes» el lente (y el goggle no).
  assert.deepEqual(filterProducts(previewProducts, 'guantes').map(item => item.code), ['EJ-1001', 'EJ-1003', 'EJ-1004']);
  assert.deepEqual(filterProducts(previewProducts, 'cascos').map(item => item.code), ['EJ-3001', 'EJ-3002']);
});

test('un singular sigue encontrando el plural (la palabra se busca en cualquier parte del texto)', () => {
  assert.equal(finds(product('Guantes sintéticos de prueba'), 'guante'), true);
  assert.equal(finds(product('Guantes sintéticos de prueba'), 'guant'), true);
  assert.equal(finds(product('Lentes sintéticos de prueba'), 'lente'), true);
});

test('las formas singulares y los sinónimos solo coinciden al principio de una palabra', () => {
  // «arnes» da la raíz «arn» (regla 2): no debe encontrar «carnaza».
  assert.equal(finds(product('Guante sintético de carnaza'), 'arnes'), false);
  assert.deepEqual(filterProducts(previewProducts, 'arnes').map(item => item.code), ['EJ-6001']);
  assert.deepEqual(filterProducts(previewProducts, 'arneses').map(item => item.code), ['EJ-6001']);
  // «pares» da «par»: encuentra «Par …», no «Separador …».
  assert.equal(finds(product('Separador sintético de prueba', ['Ropa']), 'pares'), false);
  assert.equal(finds(product('Par sintético de prueba', ['Ropa']), 'pares'), true);
  // El sinónimo «gafa» de «lentes» no encuentra «Agafador»; «lente» sí encuentra «Lentes».
  assert.equal(finds(product('Agafador sintético de prueba', ['Ropa']), 'lentes'), false);
  assert.equal(finds(product('Lentes sintéticos de prueba', ['Ropa']), 'gafas'), true);
});

test('«gris» no tiene singular y no encuentra un producto que solo dice «grip»', () => {
  assert.equal(finds(product('Guante sintético grip'), 'gris'), false);
  assert.equal(finds(product('Guante sintético gris'), 'gris'), true);
});

test('los tres pares funcionan en las dos direcciones', () => {
  const lente = product('Lente sintético de prueba', ['Protección de ojos y cara']);
  const gafa = product('Gafa sintética de prueba', ['Protección de ojos y cara']);
  const bota = product('Bota sintética de prueba', ['Ropa']);
  const orejera = product('Orejera sintética de prueba', ['Ropa']);
  const auditiva = product('Tapón sintético de prueba', ['Protección auditiva']);
  assert.equal(finds(lente, 'gafas'), true);
  assert.equal(finds(gafa, 'lentes'), true);
  assert.equal(finds(bota, 'calzado'), true);
  assert.equal(finds(product('Calzado sintético de prueba', ['Ropa']), 'botas'), true);
  assert.equal(finds(auditiva, 'orejeras'), true);
  assert.equal(finds(orejera, 'auditiva'), true);
  // Con los ejemplos de la vista previa.
  assert.deepEqual(filterProducts(previewProducts, 'gafas').map(item => item.code), ['EJ-2001']);
  assert.deepEqual(filterProducts(previewProducts, 'orejeras').map(item => item.code), ['EJ-5001']);
  assert.deepEqual(filterProducts(previewProducts, 'botas').map(item => item.code), ['EJ-8001', 'EJ-8002']);
});

test('la búsqueda encuentra por código, marca y sin acentos (forma pública de producto)', () => {
  const item = { name: 'Arnés sintético de prueba', brandName: 'Marca Alfa', code: '37-175', categoryNames: ['Trabajo en alturas'], variants: [{ code: '37-175-09' }] };
  const attribute = searchText(item);
  // Por código, con y sin separadores, y por el código de una variante.
  assert.equal(matchesSearchText(attribute, '37175'), true);
  assert.equal(matchesSearchText(attribute, '37-175'), true);
  assert.equal(matchesSearchText(attribute, '3717509'), true);
  // Por marca.
  assert.equal(matchesSearchText(attribute, 'marca alfa'), true);
  assert.equal(matchesSearchText(attribute, 'ALFA'), true);
  // Sin acentos ni mayúsculas.
  assert.equal(matchesSearchText(attribute, 'arnes'), true);
  assert.equal(matchesSearchText(attribute, 'ARNÉS'), true);
  assert.equal(matchesSearchText(attribute, 'arneses'), true);
  // Una consulta sin letras ni cifras no es una búsqueda.
  assert.equal(matchesSearchText(attribute, ' - / '), true);
  assert.equal(matchesSearchText(attribute, 'zzzz'), false);
});

test('la línea de resultados dice cuándo hay filtros marcados', () => {
  assert.equal(resultSummary(4, '', { filtered: true }), '4 productos con filtros');
  assert.equal(resultSummary(1, '', { filtered: true }), '1 producto con filtros');
  assert.equal(resultSummary(0, '  ', { filtered: true }), '0 productos con filtros');
  assert.equal(resultSummary(2, 'guante', { filtered: true }), '2 resultados para “guante” con filtros');
  assert.equal(resultSummary(1, 'guante', { filtered: true }), '1 resultado para “guante” con filtros');
  assert.deepEqual(resultSummaryParts(2, 'guante', { filtered: true }), { lead: '2 resultados para “', term: 'guante', end: '” con filtros' });
  assert.deepEqual(resultSummaryParts(4, '', { filtered: true }), { lead: '4 productos con filtros', term: '', end: '' });
  // Sin `filtered` (o con otro valor) nada cambia.
  for (const options of [undefined, {}, { filtered: false }, { filtered: 'sí' }, null]) {
    assert.equal(resultSummary(4, '', options), '4 productos', JSON.stringify(options));
    assert.equal(resultSummary(2, 'guante', options), '2 resultados para “guante”', JSON.stringify(options));
  }
});
