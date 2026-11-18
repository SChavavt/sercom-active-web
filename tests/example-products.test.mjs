import test from 'node:test';
import assert from 'node:assert/strict';
import { getPublishedProducts, validateCatalog } from '../src/lib/catalog-policy.mjs';
import { EXAMPLE_BRAND_NAME, validateExampleProducts } from '../src/lib/site-data-core.mjs';
import { normalizeText } from '../src/lib/text.mjs';
import { allStrings, loadProjectData } from './helpers.mjs';

const { brands, catalog, examples, registry } = await loadProjectData();
const categoryIds = catalog.categories.map(category => category.id);
const context = { categoryIds, brands };

const sizes = (code, from, to) => Array.from({ length: to - from + 1 }, (_, index) => [`Talla ${from + index}`, `${code}-${from + index}`]);
// Los diez ejemplos del diseño: id, nombre, código, categoría, unidad y variantes (etiqueta, código).
const EXPECTED = [
  ['ejemplo-guante-recubierto', 'Guante de ejemplo recubierto', 'EJ-1001', 'manos', 'par', sizes('EJ-1001', 7, 10)],
  ['ejemplo-lente-de-seguridad', 'Lente de seguridad de ejemplo', 'EJ-2001', 'ojos-y-cara', 'pieza', [['Mica clara', 'EJ-2001-CL'], ['Mica gris', 'EJ-2001-GR']]],
  ['ejemplo-casco-tipo-cachucha', 'Casco de ejemplo tipo cachucha', 'EJ-3001', 'cabeza', 'pieza', [['Blanco', 'EJ-3001-BL'], ['Amarillo', 'EJ-3001-AM'], ['Azul', 'EJ-3001-AZ']]],
  ['ejemplo-respirador-de-media-cara', 'Respirador de ejemplo de media cara', 'EJ-4001', 'respiratoria', 'pieza', [['Mediano', 'EJ-4001-M'], ['Grande', 'EJ-4001-G']]],
  ['ejemplo-orejera', 'Orejera de ejemplo', 'EJ-5001', 'auditiva', 'pieza', [['Única', 'EJ-5001-U']]],
  ['ejemplo-arnes-de-cuerpo-completo', 'Arnés de ejemplo de cuerpo completo', 'EJ-6001', 'alturas', 'pieza', [['Unitalla', 'EJ-6001-UNI'], ['Extragrande', 'EJ-6001-XG']]],
  ['ejemplo-overol', 'Overol de ejemplo', 'EJ-7001', 'ropa', 'pieza', [['M', 'EJ-7001-M'], ['G', 'EJ-7001-G'], ['XG', 'EJ-7001-XG']]],
  ['ejemplo-bota-con-casquillo', 'Bota de ejemplo con casquillo', 'EJ-8001', 'calzado', 'par', sizes('EJ-8001', 25, 30)],
  ['ejemplo-cono-de-71-cm', 'Cono de ejemplo de 71 cm', 'EJ-9001', 'vial-y-senalizacion', 'pieza', [['Única', 'EJ-9001-U']]],
  ['ejemplo-careta-para-soldar', 'Careta de ejemplo para soldar', 'EJ-1101', 'soldadura', 'pieza', [['Única', 'EJ-1101-U']]],
];
const SUMMARY = 'Texto de ejemplo para mostrar cómo se verá el resumen de un producto. No describe un artículo real.';
const CHARACTERISTICS = ['Característica de ejemplo: material y recubrimiento', 'Característica de ejemplo: uso recomendado', 'Característica de ejemplo: presentación y empaque'];

const mutated = change => {
  const list = structuredClone(examples);
  change(list[0], list);
  return validateExampleProducts(list, context).join('\n');
};
const hasWord = (text, word) => new RegExp(`(?:^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^a-z0-9]|$)`).test(text);

test('el archivo contiene exactamente los diez ejemplos del diseño', () => {
  assert.equal(examples.length, 10);
  assert.deepEqual(
    examples.map(example => [example.id, example.name, example.code, example.categoryIds[0], example.saleUnit, example.variants.map(variant => [variant.label, variant.code])]),
    EXPECTED,
  );
  for (const example of examples) {
    assert.equal(example.categoryIds.length, 1, example.id);
    assert.equal(example.summary, SUMMARY, example.id);
    assert.deepEqual(example.characteristics, CHARACTERISTICS, example.id);
  }
});

test('cada ejemplo es inconfundible: id «ejemplo-», códigos «EJ-», nombre «de ejemplo» y «Marca de ejemplo»', () => {
  assert.equal(EXAMPLE_BRAND_NAME, 'Marca de ejemplo');
  for (const example of examples) {
    assert.ok(example.id.startsWith('ejemplo-'), example.id);
    assert.match(example.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, example.id);
    assert.ok(example.code.startsWith('EJ-'), example.id);
    assert.ok(example.name.includes('de ejemplo'), example.id);
    assert.equal(example.brandName, 'Marca de ejemplo', example.id);
    assert.deepEqual(Object.keys(example), ['id', 'name', 'brandName', 'code', 'categoryIds', 'saleUnit', 'summary', 'characteristics', 'variants'], example.id);
    assert.ok(example.variants.length >= 1, example.id);
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
  assert.equal(codes.length, 35);
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
  assert.deepEqual(examples.map(example => example.categoryIds[0]), categoryIds);
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

test('validateExampleProducts rechaza un ejemplo que pueda confundirse con una ficha real', () => {
  assert.match(mutated(example => { example.id = 'guante-recubierto'; }), /el id debe empezar con «ejemplo-»/);
  assert.match(mutated((example, list) => { example.id = list[1].id; }), /el id debe empezar con «ejemplo-», ir en minúsculas con guiones y no repetirse/);
  assert.match(mutated(example => { example.code = '11-800'; }), /el código debe tener la forma EJ-0000/);
  assert.match(mutated((example, list) => { example.code = list[1].code; }), /el código debe tener la forma EJ-0000 y no repetirse/);
  assert.match(mutated(example => { example.name = 'Guante recubierto'; }), /el nombre debe contener «de ejemplo»/);
  assert.match(mutated(example => { example.brandName = 'Ansell'; }), /la marca debe ser «Marca de ejemplo»/);
  assert.match(mutated(example => { example.brandName = 'Ansell'; }), /menciona la marca real «Ansell»/);
  assert.match(mutated(example => { example.summary = 'Parecido a un guante de 3M.'; }), /menciona la marca real «3M»/);
  assert.match(mutated(example => { example.characteristics[1] = 'Como el modelo de MCR Safety'; }), /menciona la marca real «MCR Safety»/);
  assert.match(mutated(example => { example.variants[0].label = 'Tipo mcr-safety'; }), /menciona la marca real «MCR Safety»/);
  assert.match(mutated(example => { example.categoryIds = ['guantes']; }), /faltan categorías existentes/);
  assert.match(mutated(example => { example.categoryIds = []; }), /faltan categorías existentes/);
  assert.match(mutated(example => { example.characteristics = example.characteristics.slice(0, 2); }), /requiere de 3 a 5 características/);
  assert.match(mutated(example => { example.variants = []; }), /requiere al menos una variante/);
  assert.match(mutated(example => { example.variants[0].code = '11-800-7'; }), /código que no empieza con el del ejemplo/);
  assert.match(mutated(example => { example.variants[1].id = example.variants[0].id; }), /variante incompleta, duplicada/);
  assert.match(mutated(example => { example.saleUnit = ''; }), /falta unidad de venta o resumen/);
  // Campos de una ficha real o comerciales: un ejemplo no los admite.
  for (const key of ['approval', 'source', 'status', 'brandId', 'model', 'image', 'documents', 'precio']) {
    assert.match(mutated(example => { example[key] = 'x'; }), new RegExp(`${key}: campo no definido`));
  }
  for (const entity of registry.scope.excluded_entities) {
    assert.match(mutated(example => { example.summary = `Texto de ejemplo con ${entity}.`; }), /menciona la marca excluida/);
  }
});
