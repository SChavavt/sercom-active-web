// Filtros combinables del catálogo: fichas de filtro, grupos, lectura y escritura de la dirección y aplicación del
// estado a las tarjetas. Los productos son sintéticos de prueba, con la forma pública; nunca se importan en el sitio.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCatalogState, buildFacetGroups, catalogHref, emptyFilters, emptySituation, FACET_PARAMS, facetId, facetText, hasActiveFilters,
  parseCatalogState, productFacets, restrictFilters, selectedLabel,
} from '../src/lib/catalog-filters.mjs';
import { routes } from '../src/lib/routes.mjs';
import { displayQuery, MAX_QUERY_LENGTH, searchText } from '../src/lib/search.mjs';

const categories = [
  { id: 'manos', name: 'Protección de manos' },
  { id: 'cabeza', name: 'Protección de cabeza' },
  { id: 'calzado', name: 'Calzado industrial' },
  { id: 'soldadura', name: 'Soldadura' },
];
const brands = [
  { id: 'marca-alfa', name: 'Marca Alfa' },
  { id: 'marca-beta', name: 'Marca Beta' },
  { id: 'marca-sin-productos', name: 'Marca sin productos' },
];
const item = (name, categoryIds, brandId, brandName, code) => ({
  name, brandId, brandName, code, categoryIds, categoryNames: categoryIds.map(id => categories.find(category => category.id === id).name), variants: [],
});
const products = [
  item('Guante sintético de prueba', ['manos'], 'marca-alfa', 'Marca Alfa', 'SP-1'),
  item('Casco sintético de prueba', ['cabeza'], 'marca-beta', 'Marca Beta', 'SP-2'),
  item('Guante sintético para soldar', ['manos', 'soldadura'], 'marca-beta', 'Marca Beta', 'SP-3'),
  item('Bota sintética de prueba', ['calzado'], null, 'Marca Gamma Ñandú', 'SP-4'),
  item('Guante sintético rojo', ['manos'], null, 'Marca Delta', 'SP-5'),
  item('Casco sintético de ala', ['cabeza'], null, 'Marca Gamma Ñandú', 'SP-6'),
];
const groups = buildFacetGroups(products, { categories, brands });
const items = products.map(product => ({ search: searchText(product), facets: facetText(product) }));
const visibleCodes = result => products.filter((_, index) => result.visible[index]).map(product => product.code);
const state = (query, filters = {}) => ({ query, filters: { ...emptyFilters(), ...filters } });
// Los conteos no heredan nada (ni siquiera de Object): para compararlos con un objeto escrito aquí se copian.
const plainCounts = counts => ({ categoria: { ...counts.categoria }, marca: { ...counts.marca } });

test('FACET_PARAMS: categorías y luego marcas, congelado', () => {
  assert.deepEqual(FACET_PARAMS, ['categoria', 'marca']);
  assert.ok(Object.isFrozen(FACET_PARAMS));
});

test('facetId: el nombre normalizado con guiones', () => {
  assert.equal(facetId('Protección de manos'), 'proteccion-de-manos');
  assert.equal(facetId('  Marca Gamma Ñandú '), 'marca-gamma-nandu');
  assert.equal(facetId('3M / Seguridad & Co.'), '3m-seguridad-co');
  assert.equal(facetId('---'), '');
  assert.equal(facetId(''), '');
  assert.equal(facetId(null), '');
  // Lo que no es una letra latina ni una cifra se vuelve guion: el id siempre tiene la forma que acepta la dirección.
  assert.equal(facetId('Marca قفاز B'), 'marca-b');
});

test('fichas de filtro de un producto con marca real y de uno sin página de marca', () => {
  assert.deepEqual(productFacets(products[0]), ['categoria:manos', 'marca:marca-alfa']);
  assert.deepEqual(productFacets(products[2]), ['categoria:manos', 'categoria:soldadura', 'marca:marca-beta']);
  assert.deepEqual(productFacets(products[3]), ['categoria:calzado', 'marca:marca-gamma-nandu']);
  assert.equal(facetText(products[3]), 'categoria:calzado marca:marca-gamma-nandu');
  // Sin nombre de marca ni página: solo las categorías. Una categoría repetida cuenta una vez.
  assert.deepEqual(productFacets({ categoryIds: ['manos', 'manos'], brandId: null, brandName: '' }), ['categoria:manos']);
  assert.deepEqual(productFacets({ categoryIds: [], brandId: null, brandName: '  ' }), []);
  // No cambia el producto.
  const frozen = Object.freeze({ ...products[0], categoryIds: Object.freeze([...products[0].categoryIds]) });
  assert.deepEqual(productFacets(frozen), ['categoria:manos', 'marca:marca-alfa']);
});

test('grupos: orden, nombres, conteos y opciones o grupos vacíos omitidos', () => {
  assert.deepEqual(groups, [
    { param: 'categoria', label: 'Categorías', options: [
      { id: 'manos', label: 'Protección de manos', count: 3 },
      { id: 'cabeza', label: 'Protección de cabeza', count: 2 },
      { id: 'calzado', label: 'Calzado industrial', count: 1 },
      { id: 'soldadura', label: 'Soldadura', count: 1 },
    ] },
    { param: 'marca', label: 'Marcas', options: [
      // Primero las marcas con página, en su orden; «Marca sin productos» no aparece.
      { id: 'marca-alfa', label: 'Marca Alfa', count: 1 },
      { id: 'marca-beta', label: 'Marca Beta', count: 2 },
      // Luego las marcas sin página, en el orden en que aparecen por primera vez.
      { id: 'marca-gamma-nandu', label: 'Marca Gamma Ñandú', count: 2 },
      { id: 'marca-delta', label: 'Marca Delta', count: 1 },
    ] },
  ]);
  // Las categorías siguen el orden de `categories`, no el de los productos.
  const reversed = buildFacetGroups([...products].reverse(), { categories, brands });
  assert.deepEqual(reversed[0].options.map(option => option.id), ['manos', 'cabeza', 'calzado', 'soldadura']);
  assert.deepEqual(reversed[1].options.map(option => option.id), ['marca-alfa', 'marca-beta', 'marca-gamma-nandu', 'marca-delta']);
  // Un grupo sin opciones se omite.
  assert.deepEqual(buildFacetGroups([], { categories, brands }), []);
  const onlyCategories = buildFacetGroups([{ categoryIds: ['soldadura'], brandId: null, brandName: '' }], { categories, brands });
  assert.deepEqual(onlyCategories, [{ param: 'categoria', label: 'Categorías', options: [{ id: 'soldadura', label: 'Soldadura', count: 1 }] }]);
  // Una categoría de un producto que no está en `categories` no se ofrece.
  assert.deepEqual(buildFacetGroups([{ categoryIds: ['otra'], brandId: 'marca-alfa', brandName: 'Marca Alfa' }], { categories, brands }).map(group => group.param), ['marca']);
});

test('parseCatalogState: la búsqueda y los ids con forma de id, sin repetir y en su orden', () => {
  assert.deepEqual(parseCatalogState(''), { query: '', filters: { categoria: [], marca: [] } });
  assert.deepEqual(parseCatalogState('?q=guante&categoria=manos&marca=marca-alfa&categoria=cabeza'), { query: 'guante', filters: { categoria: ['manos', 'cabeza'], marca: ['marca-alfa'] } });
  // Sin «?», o como URLSearchParams.
  assert.deepEqual(parseCatalogState('categoria=manos'), { query: '', filters: { categoria: ['manos'], marca: [] } });
  assert.deepEqual(parseCatalogState(new URLSearchParams('q=casco&marca=marca-beta')), { query: 'casco', filters: { categoria: [], marca: ['marca-beta'] } });
  // Repetidos: una vez, en el orden de la primera aparición.
  assert.deepEqual(parseCatalogState('?categoria=cabeza&categoria=manos&categoria=cabeza').filters.categoria, ['cabeza', 'manos']);
  // La búsqueda: el primer «q», como la muestra la página.
  assert.equal(parseCatalogState('?q=++Guante+++rojo+&q=otro').query, 'Guante rojo');
  assert.equal(parseCatalogState('?q=%E0%A4%A').query, displayQuery('�%A'));
  // Lo que no tiene forma de id se ignora: mayúsculas, espacios, «%», guiones sueltos, texto con forma de script.
  const junk = ['Manos', 'MANOS', 'manos ', ' manos', 'man os', 'man%20os', '%', '%%', 'manos%', '-manos', 'manos-', 'man--os', 'man_os', 'mañana',
    '<script>alert(1)</script>', '"><img src=x onerror=alert(1)>', 'javascript:alert(1)', '__proto__', '../manos', 'manos/', 'a'.repeat(81), ''];
  const search = junk.map(value => `categoria=${encodeURIComponent(value)}`).join('&');
  assert.deepEqual(parseCatalogState(`?${search}&marca=marca-alfa`).filters, { categoria: [], marca: ['marca-alfa'] });
  // Basura de «%» que no se puede decodificar tampoco rompe nada.
  assert.deepEqual(parseCatalogState('?categoria=%E0%A4%A&categoria=%ZZ&marca=%&q=%'), { query: '%', filters: { categoria: [], marca: [] } });
  // Un id de 80 caracteres sí cuenta.
  assert.deepEqual(parseCatalogState(`?categoria=${'a'.repeat(80)}`).filters.categoria, ['a'.repeat(80)]);
  // Otros parámetros no cuentan.
  assert.deepEqual(parseCatalogState('?color=rojo&categorias=manos&Marca=marca-alfa').filters, { categoria: [], marca: [] });
  // Nunca lanza, con cualquier cosa.
  for (const value of [null, undefined, 42, {}, [], '?', '&&&', '?=&=='] ) {
    assert.deepEqual(parseCatalogState(value), { query: '', filters: { categoria: [], marca: [] } }, String(value));
  }
});

test('parseCatalogState: a lo más 50 ids por grupo', () => {
  const many = Array.from({ length: 70 }, (_, index) => `categoria=c${index}`).join('&');
  const { filters } = parseCatalogState(`?${many}&marca=m1`);
  assert.equal(filters.categoria.length, 50);
  assert.deepEqual(filters.categoria.slice(0, 2), ['c0', 'c1']);
  assert.equal(filters.categoria.at(-1), 'c49');
  assert.deepEqual(filters.marca, ['m1']);
});

test('restrictFilters: solo lo que ofrecen los grupos, en el orden de las opciones', () => {
  assert.deepEqual(restrictFilters({ categoria: ['soldadura', 'otra', 'manos'], marca: ['marca-delta', 'marca-sin-productos', 'marca-alfa'] }, groups),
    { categoria: ['manos', 'soldadura'], marca: ['marca-alfa', 'marca-delta'] });
  assert.deepEqual(restrictFilters({ categoria: ['manos'] }, []), { categoria: [], marca: [] });
  assert.deepEqual(restrictFilters(null, groups), { categoria: [], marca: [] });
  const filters = Object.freeze({ categoria: Object.freeze(['cabeza', 'manos']), marca: Object.freeze([]) });
  assert.deepEqual(restrictFilters(filters, groups), { categoria: ['manos', 'cabeza'], marca: [] });
});

test('hasActiveFilters, emptyFilters y selectedLabel', () => {
  assert.equal(hasActiveFilters(emptyFilters()), false);
  assert.equal(hasActiveFilters({ categoria: [], marca: ['marca-alfa'] }), true);
  assert.equal(hasActiveFilters({ categoria: ['manos'] }), true);
  assert.equal(hasActiveFilters(null), false);
  assert.equal(hasActiveFilters({}), false);
  assert.notEqual(emptyFilters(), emptyFilters());
  assert.equal(selectedLabel(0), '');
  assert.equal(selectedLabel(1), '1 seleccionada');
  assert.equal(selectedLabel(2), '2 seleccionadas');
  assert.equal(selectedLabel(12), '12 seleccionadas');
});

test('catalogHref: orden canónico, y sin filtros la misma dirección que la búsqueda', () => {
  assert.equal(catalogHref(state('guante', { marca: ['marca-beta'], categoria: ['manos', 'soldadura'] })), '/catalogo/?q=guante&categoria=manos&categoria=soldadura&marca=marca-beta');
  assert.equal(catalogHref(state('', { marca: ['marca-alfa'] })), '/catalogo/?marca=marca-alfa');
  assert.equal(catalogHref(state('señal 37/175 & más')), '/catalogo/?q=se%C3%B1al%2037%2F175%20%26%20m%C3%A1s');
  // Sin filtros: routes.search(displayQuery(query)) para una búsqueda activa; routes.catalog para lo demás.
  for (const query of ['guante', '  guante   rojo ', 'Protección', 'EJ-1001']) {
    assert.equal(catalogHref(state(query)), routes.search(displayQuery(query)), query);
  }
  assert.equal(catalogHref(state('  guante   rojo ')), '/catalogo/?q=guante%20rojo');
  // routes.search solo recorta: con espacios dobles las dos difieren, y catalogHref escribe lo que muestra la página.
  assert.notEqual(routes.search('  guante   rojo '), catalogHref(state('  guante   rojo ')));
  for (const query of ['%%', '-', '', '   ', ' / . ', null, undefined]) assert.equal(catalogHref(state(query)), routes.catalog, String(query));
  assert.equal(catalogHref(null), routes.catalog);
  assert.equal(catalogHref({}), routes.catalog);
  // Un id sin forma de id o repetido no se escribe.
  assert.equal(catalogHref(state('', { categoria: ['manos', 'Manos', 'manos', '<x>'] })), '/catalogo/?categoria=manos');
});

test('una búsqueda larga llega recortada a la dirección, y la dirección recortada se lee igual', () => {
  const pasted = `${'guante de nitrilo '.repeat(600)}fin`;
  const state = parseCatalogState(`?q=${encodeURIComponent(pasted)}&marca=acme`);
  assert.equal(Array.from(state.query).length <= MAX_QUERY_LENGTH, true);
  assert.equal(state.query, displayQuery(pasted));
  const href = catalogHref({ query: pasted, filters: state.filters });
  assert.equal(href, catalogHref(state));
  assert.ok(href.length < 400, `${href.length} caracteres`);
  assert.deepEqual(parseCatalogState(href.slice(href.indexOf('?'))), state);
});

test('catalogHref y parseCatalogState van y vuelven sin cambiar el estado', () => {
  const states = [
    state('guante', { categoria: ['manos', 'soldadura'], marca: ['marca-beta'] }),
    state('', { marca: ['marca-gamma-nandu', 'marca-alfa'] }),
    state('Guante “rojo” & 37/175 ñ', {}),
    state('casco', { categoria: ['cabeza'] }),
    state('', {}),
  ];
  for (const original of states) {
    const back = parseCatalogState(catalogHref(original).split('?')[1] ?? '');
    assert.deepEqual(back, { query: displayQuery(original.query), filters: original.filters }, catalogHref(original));
    assert.equal(catalogHref(back), catalogHref(original));
  }
});

test('O dentro de un grupo, Y entre grupos y Y con la búsqueda', () => {
  assert.deepEqual(visibleCodes(applyCatalogState(items, state(''), groups)), ['SP-1', 'SP-2', 'SP-3', 'SP-4', 'SP-5', 'SP-6']);
  // O dentro de «categoria».
  assert.deepEqual(visibleCodes(applyCatalogState(items, state('', { categoria: ['manos', 'calzado'] }), groups)), ['SP-1', 'SP-3', 'SP-4', 'SP-5']);
  // O dentro de «marca».
  assert.deepEqual(visibleCodes(applyCatalogState(items, state('', { marca: ['marca-alfa', 'marca-delta'] }), groups)), ['SP-1', 'SP-5']);
  // Y entre grupos.
  assert.deepEqual(visibleCodes(applyCatalogState(items, state('', { categoria: ['manos'], marca: ['marca-beta'] }), groups)), ['SP-3']);
  assert.deepEqual(visibleCodes(applyCatalogState(items, state('', { categoria: ['calzado'], marca: ['marca-alfa'] }), groups)), []);
  // Y con la búsqueda (que también encuentra plurales).
  assert.deepEqual(visibleCodes(applyCatalogState(items, state('guantes', { marca: ['marca-alfa', 'marca-beta'] }), groups)), ['SP-1', 'SP-3']);
  assert.deepEqual(visibleCodes(applyCatalogState(items, state('casco', { categoria: ['cabeza'], marca: ['marca-gamma-nandu'] }), groups)), ['SP-6']);
  const result = applyCatalogState(items, state('guante', { categoria: ['manos'] }), groups);
  assert.equal(result.count, 3);
  assert.equal(result.visible.length, items.length);
});

test('conteos de opción: con la búsqueda y lo marcado en los OTROS grupos', () => {
  // Sin nada marcado: los conteos de los grupos.
  assert.deepEqual(plainCounts(applyCatalogState(items, state(''), groups).optionCounts), {
    categoria: { manos: 3, cabeza: 2, calzado: 1, soldadura: 1 },
    marca: { 'marca-alfa': 1, 'marca-beta': 2, 'marca-gamma-nandu': 2, 'marca-delta': 1 },
  });
  // Con una búsqueda y una marca: las categorías cuentan lo que daría cada una con esa marca; las marcas, lo que daría
  // cada una con la búsqueda (su propio grupo no se cuenta).
  const result = applyCatalogState(items, state('guante', { marca: ['marca-beta'] }), groups);
  assert.deepEqual(plainCounts(result.optionCounts), {
    categoria: { manos: 1, cabeza: 0, calzado: 0, soldadura: 1 },
    marca: { 'marca-alfa': 1, 'marca-beta': 1, 'marca-gamma-nandu': 0, 'marca-delta': 1 },
  });
  assert.deepEqual(visibleCodes(result), ['SP-3']);
  // Con opciones marcadas en los dos grupos.
  const both = applyCatalogState(items, state('', { categoria: ['cabeza'], marca: ['marca-gamma-nandu'] }), groups);
  assert.deepEqual(plainCounts(both.optionCounts), {
    categoria: { manos: 0, cabeza: 1, calzado: 1, soldadura: 0 },
    marca: { 'marca-alfa': 0, 'marca-beta': 1, 'marca-gamma-nandu': 1, 'marca-delta': 0 },
  });
});

test('los ceros también están: cada opción de los grupos tiene su número', () => {
  const result = applyCatalogState(items, state('zzzz'), groups);
  assert.equal(result.count, 0);
  for (const group of groups) {
    assert.deepEqual(Object.keys(result.optionCounts[group.param]), group.options.map(option => option.id), group.param);
    assert.ok(Object.values(result.optionCounts[group.param]).every(count => count === 0), group.param);
  }
  // Sin grupos, los conteos quedan vacíos.
  assert.deepEqual(plainCounts(applyCatalogState(items, state(''), []).optionCounts), { categoria: {}, marca: {} });
});

test('los conteos no heredan nada: un id que no es una opción no da una función de Object', () => {
  const { optionCounts } = applyCatalogState(items, state(''), groups);
  for (const param of FACET_PARAMS) {
    assert.equal(Object.getPrototypeOf(optionCounts[param]), null, param);
    for (const id of ['constructor', 'toString', 'hasOwnProperty', 'valueOf', '__proto__']) assert.equal(optionCounts[param][id], undefined, `${param} ${id}`);
  }
  // Una opción que sí se llama así cuenta como cualquier otra.
  const odd = [{ param: 'marca', label: 'Marcas', options: [{ id: 'constructor', label: 'Constructor', count: 1 }] }];
  const result = applyCatalogState([{ search: 'guante', facets: 'marca:constructor' }, { search: 'casco', facets: '' }], state(''), odd);
  assert.equal(result.optionCounts.marca.constructor, 1);
  assert.deepEqual(Object.keys(result.optionCounts.marca), ['constructor']);
});

test('con unas tarjetas o unos grupos que faltan o mal formados no lanza: cuentan como ninguno', () => {
  const empty = { visible: [], count: 0, optionCounts: { categoria: {}, marca: {} } };
  const plain = result => ({ ...result, optionCounts: plainCounts(result.optionCounts) });
  for (const missing of [null, undefined, 42, 'grupos', {}]) {
    assert.deepEqual(plain(applyCatalogState(missing, state(''), missing)), empty, String(missing));
    assert.deepEqual(plain(applyCatalogState(missing, null, missing)), empty, String(missing));
    assert.deepEqual(restrictFilters({ categoria: ['manos'], marca: ['marca-alfa'] }, missing), emptyFilters(), String(missing));
    assert.deepEqual(restrictFilters(missing, missing), emptyFilters(), String(missing));
    // Las tarjetas sí se aplican aunque falten los grupos.
    assert.equal(applyCatalogState(items, state('guante'), missing).count, 3, String(missing));
  }
  // Lo que no es un grupo, un grupo con opciones que no son una lista, una opción sin id y un parámetro desconocido.
  const broken = [null, 7, 'x', { param: 'marca', options: 'marca-alfa' }, { param: 'color', options: [{ id: 'rojo' }] },
    { param: 'categoria', options: [null, {}, { id: 7 }, { id: 'manos', label: 'Protección de manos', count: 3 }] }];
  assert.deepEqual(restrictFilters({ categoria: ['manos', 'cabeza'], marca: ['marca-alfa'] }, broken), { categoria: ['manos'], marca: [] });
  const result = applyCatalogState(items, state('', { categoria: ['manos'] }), broken);
  assert.deepEqual(visibleCodes(result), ['SP-1', 'SP-3', 'SP-5']);
  assert.deepEqual(plainCounts(result.optionCounts), { categoria: { manos: 3 }, marca: {} });
  // Un grupo sin opciones no ofrece nada.
  assert.deepEqual(restrictFilters({ categoria: ['manos'] }, [{ param: 'categoria' }]), emptyFilters());
  assert.deepEqual(plainCounts(applyCatalogState(items, state(''), [{ param: 'categoria' }]).optionCounts), { categoria: {}, marca: {} });
  // Una tarjeta que falta o sin sus textos no coincide con una búsqueda ni lleva fichas, y no rompe a las demás.
  const holes = applyCatalogState([null, undefined, {}, { search: 'guante sintetico', facets: 'categoria:manos' }], state('guante', { categoria: ['manos'] }), groups);
  assert.deepEqual(holes.visible, [false, false, false, true]);
  assert.equal(holes.count, 1);
});

test('un estado con ids desconocidos no filtra nada después de restrictFilters', () => {
  const unknown = parseCatalogState('?categoria=ya-no-existe&marca=otra-marca');
  assert.deepEqual(unknown.filters, { categoria: ['ya-no-existe'], marca: ['otra-marca'] });
  const restricted = { ...unknown, filters: restrictFilters(unknown.filters, groups) };
  assert.equal(hasActiveFilters(restricted.filters), false);
  assert.equal(applyCatalogState(items, restricted, groups).count, items.length);
  // Sin restringir, un id desconocido sí deja todo fuera: por eso la página restringe antes.
  assert.equal(applyCatalogState(items, unknown, groups).count, 0);
  assert.equal(catalogHref(restricted), routes.catalog);
});

test('ninguna función cambia sus argumentos', () => {
  const frozenItems = Object.freeze(items.map(entry => Object.freeze({ ...entry })));
  const frozenState = Object.freeze({ query: 'guante', filters: Object.freeze({ categoria: Object.freeze(['manos']), marca: Object.freeze(['marca-beta']) }) });
  const frozenGroups = Object.freeze(groups.map(group => Object.freeze({ ...group, options: Object.freeze(group.options.map(option => Object.freeze({ ...option }))) })));
  assert.doesNotThrow(() => applyCatalogState(frozenItems, frozenState, frozenGroups));
  assert.doesNotThrow(() => restrictFilters(frozenState.filters, frozenGroups));
  assert.doesNotThrow(() => catalogHref(frozenState));
  assert.doesNotThrow(() => buildFacetGroups(Object.freeze(products.map(product => Object.freeze({ ...product }))), { categories: Object.freeze(categories), brands: Object.freeze(brands) }));
});

test('emptySituation: la versión del estado sin resultados según la búsqueda y los filtros', () => {
  assert.equal(emptySituation(state('guante', { categoria: ['manos'] })), 'both');
  assert.equal(emptySituation(state('guante', { marca: ['marca-alfa'] })), 'both');
  assert.equal(emptySituation(state('', { categoria: ['manos'], marca: ['marca-alfa'] })), 'filters');
  // Un texto que no es una búsqueda («%%», espacios) cuenta como sin búsqueda.
  assert.equal(emptySituation(state('%%', { marca: ['marca-alfa'] })), 'filters');
  assert.equal(emptySituation(state('   ', { categoria: ['manos'] })), 'filters');
  assert.equal(emptySituation(state('guante')), 'query');
  // Sin búsqueda ni filtros (un catálogo sin productos): la versión de la búsqueda.
  assert.equal(emptySituation(state('')), 'query');
  assert.equal(emptySituation(null), 'query');
  assert.equal(emptySituation({ query: 'guante', filters: null }), 'query');
  // No cambia el estado.
  assert.doesNotThrow(() => emptySituation(Object.freeze({ query: 'guante', filters: Object.freeze({ categoria: Object.freeze(['manos']), marca: Object.freeze([]) }) })));
});
