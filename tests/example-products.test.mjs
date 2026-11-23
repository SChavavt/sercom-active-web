import test from 'node:test';
import assert from 'node:assert/strict';
import { getPublishedProducts, validateCatalog } from '../src/lib/catalog-policy.mjs';
import { buildFacetGroups } from '../src/lib/catalog-filters.mjs';
import { filterProducts } from '../src/lib/search.mjs';
import { createSiteData, EXAMPLE_BRAND_NAME, EXAMPLE_BRAND_NAMES, validateExampleProducts } from '../src/lib/site-data-core.mjs';
import { normalizeText } from '../src/lib/text.mjs';
import { allStrings, emptiedCatalog, loadProjectData } from './helpers.mjs';

const { brands, catalog, examples, registry } = await loadProjectData();
const categoryIds = catalog.categories.map(category => category.id);
// Los dieciséis ejemplos de los listados y el ejemplo de producto retirado, que solo tiene su página informativa.
const listed = examples.filter(example => example.retired !== true);
const retired = examples.filter(example => example.retired === true);
const context = { categoryIds, brands };

const sizes = (code, from, to) => Array.from({ length: to - from + 1 }, (_, index) => [`Talla ${from + index}`, `${code}-${from + index}`]);
// Los dieciséis ejemplos del diseño: id, nombre, marca, código, categoría, unidad y variantes (etiqueta, código). Los
// diez primeros, uno por categoría; los seis siguientes dan a la vista previa tres marcas, los tres tipos de producto
// (varias variantes, una sola y ninguna) y una unidad de venta compuesta («caja con 100 piezas»).
const A = 'Marca de ejemplo';
const B = 'Marca de ejemplo Beta';
const C = 'Marca de ejemplo Gamma';
const EXPECTED = [
  ['ejemplo-guante-recubierto', 'Guante de ejemplo recubierto', A, 'EJ-1001', 'manos', 'par', sizes('EJ-1001', 7, 10)],
  ['ejemplo-lente-de-seguridad', 'Lente de seguridad de ejemplo', A, 'EJ-2001', 'ojos-y-cara', 'pieza', [['Mica clara', 'EJ-2001-CL'], ['Mica gris', 'EJ-2001-GR']]],
  ['ejemplo-casco-tipo-cachucha', 'Casco de ejemplo tipo cachucha', A, 'EJ-3001', 'cabeza', 'pieza', [['Blanco', 'EJ-3001-BL'], ['Amarillo', 'EJ-3001-AM'], ['Azul', 'EJ-3001-AZ']]],
  ['ejemplo-respirador-de-media-cara', 'Respirador de ejemplo de media cara', A, 'EJ-4001', 'respiratoria', 'pieza', [['Mediano', 'EJ-4001-M'], ['Grande', 'EJ-4001-G']]],
  ['ejemplo-orejera', 'Orejera de ejemplo', A, 'EJ-5001', 'auditiva', 'pieza', [['Única', 'EJ-5001-U']]],
  ['ejemplo-arnes-de-cuerpo-completo', 'Arnés de ejemplo de cuerpo completo', A, 'EJ-6001', 'alturas', 'pieza', [['Unitalla', 'EJ-6001-UNI'], ['Extragrande', 'EJ-6001-XG']]],
  ['ejemplo-overol', 'Overol de ejemplo', A, 'EJ-7001', 'ropa', 'pieza', [['M', 'EJ-7001-M'], ['G', 'EJ-7001-G'], ['XG', 'EJ-7001-XG']]],
  ['ejemplo-bota-con-casquillo', 'Bota de ejemplo con casquillo', A, 'EJ-8001', 'calzado', 'par', sizes('EJ-8001', 25, 30)],
  ['ejemplo-cono-de-71-cm', 'Cono de ejemplo de 71 cm', A, 'EJ-9001', 'vial-y-senalizacion', 'pieza', [['Única', 'EJ-9001-U']]],
  ['ejemplo-careta-para-soldar', 'Careta de ejemplo para soldar', A, 'EJ-1101', 'soldadura', 'pieza', [['Única', 'EJ-1101-U']]],
  ['ejemplo-guante-de-nitrilo', 'Guante de ejemplo de nitrilo', B, 'EJ-1003', 'manos', 'caja con 100 piezas', [['Chico', 'EJ-1003-CH'], ['Mediano', 'EJ-1003-M'], ['Grande', 'EJ-1003-G']]],
  ['ejemplo-guante-de-carnaza', 'Guante de ejemplo de carnaza', C, 'EJ-1004', 'manos', 'par', [['Unitalla', 'EJ-1004-UNI']]],
  ['ejemplo-goggle-ventilado', 'Goggle de ejemplo ventilado', B, 'EJ-2002', 'ojos-y-cara', 'pieza', [['Mica clara', 'EJ-2002-CL']]],
  ['ejemplo-casco-de-ala-completa', 'Casco de ejemplo de ala completa', C, 'EJ-3002', 'cabeza', 'pieza', [['Blanco', 'EJ-3002-BL'], ['Naranja', 'EJ-3002-NA']]],
  ['ejemplo-respirador-desechable', 'Respirador de ejemplo desechable', B, 'EJ-4002', 'respiratoria', 'caja', []],
  ['ejemplo-zapato-tipo-choclo', 'Zapato de ejemplo tipo choclo', C, 'EJ-8002', 'calzado', 'par', sizes('EJ-8002', 25, 29)],
];
const SUMMARY = 'Texto de ejemplo para mostrar cómo se verá el resumen de un producto. No describe un artículo real.';
const CHARACTERISTICS = ['Característica de ejemplo: material y recubrimiento', 'Característica de ejemplo: uso recomendado', 'Característica de ejemplo: presentación y empaque'];

const mutated = change => {
  const list = structuredClone(examples);
  change(list[0], list);
  return validateExampleProducts(list, context).join('\n');
};
const hasWord = (text, word) => new RegExp(`(?:^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^a-z0-9]|$)`).test(text);

test('el archivo contiene exactamente los dieciséis ejemplos del diseño y un ejemplo retirado', () => {
  assert.equal(examples.length, 17);
  assert.equal(listed.length, 16);
  assert.deepEqual(
    listed.map(example => [example.id, example.name, example.brandName, example.code, example.categoryIds[0], example.saleUnit, example.variants.map(variant => [variant.label, variant.code])]),
    EXPECTED,
  );
  // Las tres marcas de ejemplo, en las cantidades de la tabla: diez de la primera y tres de cada una de las otras dos.
  const count = name => listed.filter(example => example.brandName === name).length;
  assert.deepEqual([count(A), count(B), count(C)], [10, 3, 3]);
  // Los tres tipos de producto: varias variantes, exactamente una y ninguna.
  assert.ok(listed.some(example => example.variants.length > 1));
  assert.ok(listed.some(example => example.variants.length === 1));
  assert.deepEqual(listed.filter(example => example.variants.length === 0).map(example => example.id), ['ejemplo-respirador-desechable']);
  // El retirado va al final, con un código de ejemplo que ningún otro usa y una categoría.
  assert.deepEqual(
    retired.map(example => [example.id, example.name, example.brandName, example.code, example.categoryIds, example.retired]),
    [['ejemplo-producto-retirado', 'Producto de ejemplo retirado', 'Marca de ejemplo', 'EJ-1002', ['manos'], true]],
  );
  assert.equal(examples.at(-1), retired[0]);
  assert.ok(listed.every(example => !('retired' in example)));
  for (const example of examples) {
    assert.equal(example.categoryIds.length, 1, example.id);
    assert.equal(example.summary, SUMMARY, example.id);
    assert.deepEqual(example.characteristics, CHARACTERISTICS, example.id);
  }
});

test('cada ejemplo es inconfundible: id «ejemplo-», códigos «EJ-», nombre «de ejemplo» y una «Marca de ejemplo»', () => {
  assert.equal(EXAMPLE_BRAND_NAME, 'Marca de ejemplo');
  assert.deepEqual(EXAMPLE_BRAND_NAMES, ['Marca de ejemplo', 'Marca de ejemplo Beta', 'Marca de ejemplo Gamma']);
  assert.ok(Object.isFrozen(EXAMPLE_BRAND_NAMES));
  assert.deepEqual([...new Set(examples.map(example => example.brandName))], EXAMPLE_BRAND_NAMES);
  for (const example of examples) {
    assert.ok(example.id.startsWith('ejemplo-'), example.id);
    assert.match(example.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, example.id);
    assert.ok(example.code.startsWith('EJ-'), example.id);
    assert.ok(example.name.includes('de ejemplo'), example.id);
    assert.ok(EXAMPLE_BRAND_NAMES.includes(example.brandName), example.id);
    const keys = ['id', 'name', 'brandName', 'code', 'categoryIds', 'saleUnit', 'summary', 'characteristics', 'variants'];
    assert.deepEqual(Object.keys(example), example.retired === true ? [...keys, 'retired'] : keys, example.id);
    assert.ok(Array.isArray(example.variants), example.id);
    for (const variant of example.variants) {
      assert.deepEqual(Object.keys(variant), ['id', 'label', 'code'], example.id);
      assert.match(variant.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, example.id);
      assert.ok(variant.label.trim().length > 0, example.id);
      assert.ok(variant.code.startsWith(`${example.code}-`), `${example.id}: ${variant.code}`);
    }
    assert.equal(new Set(example.variants.map(variant => variant.id)).size, example.variants.length, example.id);
  }
  const codes = examples.flatMap(example => [example.code, ...example.variants.map(variant => variant.code)]);
  assert.equal(new Set(codes).size, codes.length, 'códigos repetidos');
  assert.equal(codes.length, 55);
  assert.equal(new Set(examples.map(example => example.id)).size, examples.length, 'ids repetidos');
});

test('ningún campo de un ejemplo menciona una marca real del registro ni la marca excluida', () => {
  assert.equal(registry.sources.length, 19);
  for (const example of examples) {
    const text = normalizeText(allStrings(example).join(' | '));
    for (const source of registry.sources) {
      for (const needle of [normalizeText(source.name), source.entity_id, source.entity_id.replaceAll('-', ' ')]) {
        assert.ok(!hasWord(text, needle), `${example.id} menciona «${source.name}»`);
      }
    }
    for (const entity of registry.scope.excluded_entities) assert.ok(!hasWord(text, normalizeText(entity)), `${example.id}: entidad excluida`);
  }
});

test('las categorías de los ejemplos existen y cada categoría tiene un ejemplo', () => {
  for (const example of examples) for (const id of example.categoryIds) assert.ok(categoryIds.includes(id), `${example.id}: ${id}`);
  // Los diez primeros recorren las categorías en orden; los seis siguientes repiten cinco de ellas.
  assert.deepEqual(listed.slice(0, 10).map(example => example.categoryIds[0]), categoryIds);
  assert.deepEqual(listed.slice(10).map(example => example.categoryIds[0]), ['manos', 'manos', 'ojos-y-cara', 'cabeza', 'respiratoria', 'calzado']);
});

test('los filtros de la vista previa: un grupo «Marcas» con las tres marcas y «Categorías» con conteos que suman', () => {
  // Sin fichas reales (catálogo vaciado): los filtros de los dieciséis ejemplos, con cualquier catálogo.
  const site = createSiteData({ mode: 'preview', catalog: emptiedCatalog(catalog), brands, exampleProducts: examples });
  const groups = buildFacetGroups(site.products, { categories: site.categories, brands: site.brands });
  assert.deepEqual(groups.map(group => [group.param, group.label]), [['categoria', 'Categorías'], ['marca', 'Marcas']]);
  const [categoryGroup, brandGroup] = groups;
  assert.deepEqual(brandGroup.options, [
    { id: 'marca-de-ejemplo', label: 'Marca de ejemplo', count: 10 },
    { id: 'marca-de-ejemplo-beta', label: 'Marca de ejemplo Beta', count: 3 },
    { id: 'marca-de-ejemplo-gamma', label: 'Marca de ejemplo Gamma', count: 3 },
  ]);
  // La búsqueda distingue las dos marcas que terminan en una palabra completa, por esa palabra o por el nombre entero.
  const found = query => filterProducts(site.products, query).map(product => product.code);
  assert.deepEqual(found('Marca de ejemplo Beta'), ['EJ-1003', 'EJ-2002', 'EJ-4002']);
  assert.deepEqual(found('beta'), ['EJ-1003', 'EJ-2002', 'EJ-4002']);
  assert.deepEqual(found('Marca de ejemplo Gamma'), ['EJ-1004', 'EJ-3002', 'EJ-8002']);
  assert.deepEqual(found('gamma'), ['EJ-1004', 'EJ-3002', 'EJ-8002']);
  assert.equal(found('Marca de ejemplo').length, 16);
  // Cada ejemplo tiene una sola categoría: los conteos suman los dieciséis productos.
  assert.deepEqual(categoryGroup.options.map(option => option.id), categoryIds);
  assert.equal(categoryGroup.options.reduce((sum, option) => sum + option.count, 0), site.products.length);
  assert.equal(site.products.length, 16);
  assert.deepEqual(categoryGroup.options.map(option => option.count), [3, 2, 2, 2, 1, 1, 1, 2, 1, 1]);
  // Las marcas reales no tienen productos en la vista previa: no aparecen como opción.
  assert.ok(brandGroup.options.every(option => !site.brands.some(brand => brand.id === option.id)));
});

test('los ejemplos no llevan normas, precios ni afirmaciones', () => {
  const text = allStrings(examples).join(' | ');
  assert.doesNotMatch(text, /\$|\bMXN\b|\bprecio|\bNOM-|\bANSI\b|\bEN \d|\bcertific|\boficial|\bautorizad|\bgarant/i);
});

test('los ejemplos nunca están en catalog.json ni pueden pasar por getPublishedProducts', () => {
  const file = JSON.stringify(catalog);
  assert.doesNotMatch(file, /ejemplo-|EJ-\d|de ejemplo/i);
  // Un ejemplo copiado al catálogo, incluso con todos los datos de una ficha aprobada, se rechaza.
  const example = examples[0];
  const tampered = {
    schemaVersion: 1,
    categories: [{ id: 'manos', name: 'Protección de manos', status: 'approved' }],
    products: [{
      id: example.id, brandId: 'ansell', model: example.code, name: example.name, categoryIds: ['manos'], status: 'approved',
      description: example.summary, saleUnit: example.saleUnit, characteristics: example.characteristics,
      image: { url: 'https://example.invalid/test.png', alt: 'Imagen de prueba', sourceUrl: 'https://example.invalid/source', usageConfirmed: true },
      source: { url: 'https://example.invalid/test', checkedOn: '2026-11-18' },
      approval: { by: 'Revisor de prueba', on: '2026-11-18', supplyConfirmed: true },
    }],
  };
  assert.deepEqual(validateCatalog(tampered, registry), ['products[0]: identificador, código o nombre reservado para los ejemplos de vista previa.']);
  assert.throws(() => getPublishedProducts(tampered, registry), /reservado para los ejemplos de vista previa/);
  // El mismo registro con otros identificadores sí sería una ficha válida: lo único que lo bloquea es la marca de ejemplo.
  const real = structuredClone(tampered);
  Object.assign(real.products[0], { id: 'test-001', model: 'TEST-001', name: 'Producto sintético de prueba' });
  assert.deepEqual(validateCatalog(real, registry), []);
});

test('validateExampleProducts acepta el archivo real', () => {
  assert.deepEqual(validateExampleProducts(examples, context), []);
  assert.deepEqual(validateExampleProducts({}, context), ['ejemplos: debe ser una lista.']);
});

test('un ejemplo sin variantes se acepta y llega a la vista previa con la lista vacía, y cada marca de ejemplo se proyecta tal cual', () => {
  assert.equal(mutated(example => { example.variants = []; }), '');
  for (const name of EXAMPLE_BRAND_NAMES) assert.equal(mutated(example => { example.brandName = name; }), '', name);
  const site = createSiteData({ mode: 'preview', catalog: emptiedCatalog(catalog), brands, exampleProducts: examples });
  assert.deepEqual(site.getProduct('ejemplo-respirador-desechable')?.variants, []);
  assert.equal(site.getProduct('ejemplo-respirador-desechable')?.saleUnit, 'caja');
  assert.equal(site.getProduct('ejemplo-guante-de-nitrilo')?.saleUnit, 'caja con 100 piezas');
  // La proyección conserva la marca validada de cada ejemplo (también la del retirado).
  for (const example of listed) assert.equal(site.getProduct(example.id)?.brandName, example.brandName, example.id);
  const retiredCopy = structuredClone(examples);
  retiredCopy.at(-1).brandName = 'Marca de ejemplo Gamma';
  const withRetired = createSiteData({ mode: 'preview', catalog: emptiedCatalog(catalog), brands, exampleProducts: retiredCopy });
  assert.equal(withRetired.getRetiredProduct('ejemplo-producto-retirado')?.brandName, 'Marca de ejemplo Gamma');
});

test('validateExampleProducts rechaza un ejemplo que pueda confundirse con una ficha real', () => {
  assert.match(mutated(example => { example.id = 'guante-recubierto'; }), /el id debe empezar con «ejemplo-»/);
  assert.match(mutated((example, list) => { example.id = list[1].id; }), /el id debe empezar con «ejemplo-», ir en minúsculas con guiones y no repetirse/);
  assert.match(mutated(example => { example.code = '11-800'; }), /el código debe tener la forma EJ-0000/);
  assert.match(mutated((example, list) => { example.code = list[1].code; }), /el código debe tener la forma EJ-0000 y no repetirse/);
  assert.match(mutated(example => { example.name = 'Guante recubierto'; }), /el nombre debe contener «de ejemplo»/);
  assert.match(mutated(example => { example.brandName = 'Ansell'; }), /la marca debe ser «Marca de ejemplo», «Marca de ejemplo Beta» o «Marca de ejemplo Gamma»/);
  for (const name of ['Marca de ejemplo Delta', 'Marca de ejemplo B', 'Marca de ejemplo C', 'marca de ejemplo beta', 'Marca de ejemplo  Beta', ' Marca de ejemplo', '', null]) {
    assert.match(mutated(example => { example.brandName = name; }), /la marca debe ser «Marca de ejemplo», «Marca de ejemplo Beta» o «Marca de ejemplo Gamma»/, String(name));
  }
  assert.match(mutated(example => { example.brandName = 'Ansell'; }), /menciona la marca real «Ansell»/);
  assert.match(mutated(example => { example.summary = 'Parecido a un guante de 3M.'; }), /menciona la marca real «3M»/);
  assert.match(mutated(example => { example.characteristics[1] = 'Como el modelo de MCR Safety'; }), /menciona la marca real «MCR Safety»/);
  assert.match(mutated(example => { example.variants[0].label = 'Tipo mcr-safety'; }), /menciona la marca real «MCR Safety»/);
  assert.match(mutated(example => { example.categoryIds = ['guantes']; }), /faltan categorías existentes/);
  assert.match(mutated(example => { example.categoryIds = []; }), /faltan categorías existentes/);
  assert.match(mutated(example => { example.characteristics = example.characteristics.slice(0, 2); }), /requiere de 3 a 5 características/);
  for (const variants of [undefined, null, 'Talla 8', {}]) {
    assert.match(mutated(example => { example.variants = variants; }), /variants debe ser una lista \(puede estar vacía\)/, String(variants));
  }
  assert.match(mutated(example => { example.variants[0].code = '11-800-7'; }), /código que no empieza con el del ejemplo/);
  assert.match(mutated(example => { example.variants[1].id = example.variants[0].id; }), /variante incompleta, duplicada/);
  // Dos ejemplos con el mismo nombre, o dos variantes de un ejemplo con la misma etiqueta (sin distinguir acentos,
  // mayúsculas ni espacios), como en el catálogo: darían los mismos nombres a dos renglones de «Cotizar mi lista».
  assert.equal(mutated((example, list) => { example.name = list[1].name.toUpperCase(); }), 'ejemplos[1].name: repite el nombre de ejemplos[0]; cada ejemplo necesita un nombre propio.');
  assert.equal(mutated((_, list) => { list[5].name = 'ARNES de ejemplo de cuerpo completo'; list[6].name = 'Arnés de ejemplo de cuerpo completo'; }),
    'ejemplos[6].name: repite el nombre de ejemplos[5]; cada ejemplo necesita un nombre propio.');
  assert.equal(mutated(example => { example.variants[2].label = 'TALLA 7'; }), 'ejemplos[0].variants[2].label: repite la etiqueta de variants[0]; cada variante necesita una etiqueta propia.');
  // En ejemplos distintos, la misma etiqueta sí puede repetirse (el archivo real ya lo hace: «Única», «Mica clara»).
  assert.ok(listed.filter(example => example.variants.some(variant => variant.label === 'Única')).length > 1);
  // A diferencia de una ficha real, cada variante de un ejemplo lleva su código.
  assert.match(mutated(example => { delete example.variants[0].code; }), /variante incompleta, duplicada o con un código que no empieza con el del ejemplo/);
  assert.match(mutated(example => { example.saleUnit = ''; }), /falta unidad de venta o resumen/);
  // Campos de una ficha real o comerciales: un ejemplo no los admite.
  for (const key of ['approval', 'source', 'status', 'brandId', 'model', 'image', 'documents', 'precio']) {
    assert.match(mutated(example => { example[key] = 'x'; }), new RegExp(`${key}: campo no definido`));
  }
  for (const entity of registry.scope.excluded_entities) {
    assert.match(mutated(example => { example.summary = `Texto de ejemplo con ${entity}.`; }), /menciona la marca excluida/);
  }
});
