// Búsqueda por palabras: plurales, los tres grupos de sinónimos revisados y la línea de resultados con filtros.
import test from 'node:test';
import assert from 'node:assert/strict';
import { filterProducts, matchesQuery, matchesSearchText, resultSummary, resultSummaryParts, SEARCH_SYNONYMS, searchMatcher, searchText, singularForms, tokenAlternatives } from '../src/lib/search.mjs';
import { createSiteData } from '../src/lib/site-data-core.mjs';
import { emptiedCatalog, loadProjectData } from './helpers.mjs';

const { brands, catalog, examples } = await loadProjectData();
// Los productos de la vista previa sin fichas reales (catálogo vaciado): solo los dieciséis ejemplos, con cualquier catálogo.
const previewProducts = createSiteData({ mode: 'preview', catalog: emptiedCatalog(catalog), brands, exampleProducts: examples }).products;

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
  assert.deepEqual(tokenAlternatives('orejeras'), ['orejeras', 'orejera', 'auditiva', 'auditivo']);
  assert.deepEqual(tokenAlternatives('auditiva'), ['auditiva', 'orejera', 'auditivo']);
  assert.deepEqual(tokenAlternatives('auditivos'), ['auditivos', 'auditivo', 'orejera', 'auditiva']);
});

test('SEARCH_SYNONYMS son exactamente los tres grupos revisados, congelados', () => {
  // «Orejeras / protección auditiva» lleva el adjetivo en sus dos géneros: «auditiva» y «auditivo».
  assert.deepEqual(SEARCH_SYNONYMS, [['lente', 'gafa'], ['bota', 'calzado'], ['orejera', 'auditiva', 'auditivo']]);
  assert.ok(Object.isFrozen(SEARCH_SYNONYMS) && SEARCH_SYNONYMS.every(group => Object.isFrozen(group)));
  // Nada fuera de los tres grupos es un sinónimo.
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

test('las reglas de plurales y sinónimos valen igual para la etiqueta de una variante', () => {
  const helmet = product('Casco sintético de prueba', ['Protección de cabeza'], { variants: [{ label: 'Amarillo', code: '' }, { label: 'Naranja alta visibilidad', code: '' }] });
  assert.equal(finds(helmet, 'amarillos'), true);
  assert.equal(finds(helmet, 'cascos naranjas'), true);
  assert.equal(finds(helmet, 'verdes'), false);
  // Un sinónimo de una palabra de la consulta también se busca en las etiquetas: «calzado» encuentra la etiqueta «Bota».
  const kit = product('Kit sintético de prueba', ['Ropa'], { variants: [{ label: 'Con bota', code: '' }, { label: 'Sin bota', code: '' }] });
  assert.equal(finds(kit, 'kit calzado'), true);
});

test('un singular sigue encontrando el plural (la palabra se busca en cualquier parte del texto)', () => {
  assert.equal(finds(product('Guantes sintéticos de prueba'), 'guante'), true);
  assert.equal(finds(product('Guantes sintéticos de prueba'), 'guant'), true);
  assert.equal(finds(product('Lentes sintéticos de prueba'), 'lente'), true);
});

test('una forma singular o un sinónimo de 5 letras o más coincide en cualquier parte, como la palabra escrita', () => {
  // Lo que encuentra el singular lo encuentra el plural, también dentro de una palabra compuesta.
  for (const [name, singular, plural] of [
    ['Sobrelente sintético de prueba', 'lente', 'lentes'],
    ['Sobreguante sintético de prueba', 'guante', 'guantes'],
    ['Subcasco sintético de prueba', 'casco', 'cascos'],
    ['Semicareta sintética de prueba', 'careta', 'caretas'],
  ]) {
    assert.equal(finds(product(name, ['Ropa']), singular), true, `${singular} → ${name}`);
    assert.equal(finds(product(name, ['Ropa']), plural), true, `${plural} → ${name}`);
  }
  // Un sinónimo largo también: «botas» encuentra «Cubrecalzado» por «calzado»; «gafas», «Sobrelente» por «lente».
  assert.equal(finds(product('Cubrecalzado sintético de prueba', ['Ropa']), 'botas'), true);
  assert.equal(finds(product('Sobrelente sintético de prueba', ['Ropa']), 'gafas'), true);
  // La raíz larga de la regla 2: «arneses» → «arnes», «tapones» → «tapon».
  assert.deepEqual(filterProducts(previewProducts, 'arneses').map(item => item.code), ['EJ-6001']);
  assert.equal(finds(product('Portatapón sintético de prueba', ['Ropa']), 'tapones'), true);
});

test('una forma de 4 letras solo coincide al principio de una palabra', () => {
  // «micas» da «mica»: encuentra «Mica …» y no un producto de «Protección química».
  assert.equal(finds(product('Mica sintética de prueba', ['Ropa']), 'micas'), true);
  assert.equal(finds(product('Traje sintético de prueba', ['Protección química']), 'micas'), false);
  // El sinónimo «gafa» de «lentes» no encuentra «Agafador»; «lente» sí encuentra «Lentes».
  assert.equal(finds(product('Agafador sintético de prueba', ['Ropa']), 'lentes'), false);
  assert.equal(finds(product('Lentes sintéticos de prueba', ['Ropa']), 'gafas'), true);
  // «botas» da «bota»: encuentra «Bota …» y «Botas …», no «Sabotaje …».
  assert.equal(finds(product('Bota sintética de prueba', ['Ropa']), 'botas'), true);
  assert.equal(finds(product('Sabotaje sintético de prueba', ['Ropa']), 'botas'), false);
  // «cables» da la raíz «cabl»: encuentra «Cable …».
  assert.equal(finds(product('Cable sintético de prueba', ['Ropa']), 'cables'), true);
});

test('una forma de 3 letras solo coincide con la palabra completa, sola o seguida de «e»', () => {
  // «arnes» da la raíz «arn» (regla 2): no debe encontrar «carnaza».
  assert.equal(finds(product('Guante sintético de carnaza'), 'arnes'), false);
  assert.deepEqual(filterProducts(previewProducts, 'arnes').map(item => item.code), ['EJ-6001']);
  // «pares» da «par»: encuentra «Par …», no «Separador …» ni cada producto que dice «para».
  assert.equal(finds(product('Par sintético de prueba', ['Ropa']), 'pares'), true);
  assert.equal(finds(product('Guante sintético (par)', ['Ropa']), 'pares'), true);
  assert.equal(finds(product('Separador sintético de prueba', ['Ropa']), 'pares'), false);
  assert.equal(finds(product('Careta sintética para soldar', ['Ropa']), 'pares'), false);
  assert.equal(finds(product('Parka sintética de prueba', ['Ropa']), 'pares'), false);
  assert.deepEqual(filterProducts(previewProducts, 'pares'), []);
  // «redes» da «red»: encuentra «Red …», no «Redondo …».
  assert.equal(finds(product('Red sintética para cabello', ['Ropa']), 'redes'), true);
  assert.equal(finds(product('Tope sintético redondo', ['Ropa']), 'redes'), false);
  // «bases» da «bas»: el singular es «base» (la raíz seguida de «e»); no encuentra «Bastón …» ni «básico».
  assert.equal(finds(product('Base sintética para cono', ['Ropa']), 'bases'), true);
  assert.equal(finds(product('Bastón sintético de prueba', ['Ropa']), 'bases'), false);
  assert.equal(finds(product('Arnés sintético básico', ['Ropa']), 'bases'), false);
  // «pies» da «pie»: encuentra «… de pie», no «Pieza …» ni «… de piel».
  assert.equal(finds(product('Protector sintético de pie', ['Ropa']), 'pies'), true);
  assert.equal(finds(product('Pieza sintética de piel', ['Ropa']), 'pies'), false);
  // «kits» da «kit»; «luces» da «luz».
  assert.equal(finds(product('Kit sintético de prueba', ['Ropa']), 'kits'), true);
  assert.equal(finds(product('Luz sintética de prueba', ['Ropa']), 'luces'), true);
});

test('un signo pegado a la palabra no apaga el plural ni los sinónimos', () => {
  const guante = product('Guante sintético de prueba');
  for (const query of ['guantes,', 'guantes.', '(guantes)', '¿guantes?', '«guantes»', 'guantes;']) assert.equal(finds(guante, query), true, query);
  assert.equal(finds(product('Lente sintético de prueba', ['Ropa']), '¿gafas?'), true);
  assert.deepEqual(filterProducts(previewProducts, 'guantes,').map(item => item.code), ['EJ-1001', 'EJ-1003', 'EJ-1004']);
  // Un código sigue buscándose tal cual: «ej-1001s» no es un plural.
  assert.deepEqual(filterProducts(previewProducts, 'ej-1001s'), []);
});

test('searchMatcher prepara la consulta una vez y da lo mismo que matchesSearchText', () => {
  const texts = previewProducts.map(searchText);
  for (const query of ['', '   ', 'guantes', 'lentes de seguridad', 'EJ-1001', 'ej1001', 'gafas', 'zzzz', 'guantes guantes guantes', '%%']) {
    const matches = searchMatcher(query);
    assert.deepEqual(texts.map(text => matches(text)), texts.map(text => matchesSearchText(text, query)), query);
  }
  assert.equal(searchMatcher('guante')(null), false);
  assert.equal(searchMatcher('')(null), true);
  // Una consulta enorme con la misma palabra repetida da lo mismo que la palabra sola.
  const repeated = searchMatcher('guantes '.repeat(12500));
  assert.deepEqual(texts.map(text => repeated(text)), texts.map(text => matchesSearchText(text, 'guantes')));
});

test('«gris» no tiene singular y no encuentra un producto que solo dice «grip»', () => {
  assert.equal(finds(product('Guante sintético grip'), 'gris'), false);
  assert.equal(finds(product('Guante sintético gris'), 'gris'), true);
});

test('los tres grupos funcionan en las dos direcciones', () => {
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
  // El adjetivo en masculino: «tapones auditivos» y «protector auditivo» son la misma protección.
  assert.equal(finds(orejera, 'auditivo'), true);
  assert.equal(finds(orejera, 'auditivos'), true);
  assert.equal(finds(product('Tapón auditivo sintético de prueba', ['Ropa']), 'orejeras'), true);
  assert.equal(finds(product('Tapón auditivo sintético de prueba', ['Ropa']), 'auditiva'), true);
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
