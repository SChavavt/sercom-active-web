// Productos retirados (R-STATE-04): una ficha que fue pública y salió del catálogo conserva una página informativa.
// Estas pruebas cubren la capa de datos: cuándo un retirado es público, qué campos llegan a la página y que ningún
// listado, conteo, búsqueda o selección existente lo incluye.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getPublishedProducts, getRetiredProducts, isPublicRetired, validateCatalog } from '../src/lib/catalog-policy.mjs';
import { createSiteData, validateExampleProducts } from '../src/lib/site-data-core.mjs';
import { matchesQuery } from '../src/lib/search.mjs';
import { allKeys, allStrings, loadProjectData } from './helpers.mjs';

const { brands, catalog, examples } = await loadProjectData();
const brandScope = { sources: brands.map(brand => ({ entity_id: brand.id, name: brand.name, entity_type: brand.kind })) };
const listedExamples = examples.filter(example => example.retired !== true);

const RETIRED_KEYS = ['id', 'url', 'name', 'brandId', 'brandName', 'code', 'categoryIds', 'categoryNames', 'isExample'];
// Lo que una ficha retirada tiene en el catálogo y nunca llega a su página.
const INTERNAL_KEYS = ['approval', 'source', 'status', 'sourceUrl', 'usageConfirmed', 'supplyConfirmed', 'checkedOn', 'by', 'on', 'model', 'description', 'characteristics', 'saleUnit', 'variants', 'image', 'documents', 'summary', 'manufacturerCode'];

/** Ficha sintética completa (como una que fue aprobada); nunca se importa en el sitio. */
const record = (fields = {}) => ({
  id: 'test-001', brandId: 'ansell', model: 'TEST-001/A', name: 'Producto sintético de prueba', categoryIds: ['manos'], status: 'retired',
  description: 'No es un artículo comercial.', saleUnit: 'pieza',
  characteristics: ['Dato sintético A', 'Dato sintético B', 'Dato sintético C'],
  variants: [{ id: 'talla-9', label: 'Talla 9', manufacturerCode: 'TEST-001/A-9' }],
  image: { url: 'https://example.invalid/test.png', alt: 'Imagen de prueba', sourceUrl: 'https://example.invalid/source', usageConfirmed: true },
  documents: [{ label: 'Ficha técnica de prueba', url: 'https://example.invalid/ficha.pdf' }],
  source: { url: 'https://example.invalid/test', checkedOn: '2026-11-18' },
  approval: { by: 'Revisor de prueba', on: '2026-11-18', supplyConfirmed: true },
  ...fields,
});
/** El catálogo real con la categoría «manos» aprobada y las fichas indicadas. */
function withProducts(...products) {
  const copy = structuredClone(catalog);
  copy.categories[0].status = 'approved';
  copy.products.push(...products);
  return copy;
}
/** Un ejemplo retirado de la vista previa, con todas las reglas de los ejemplos. */
const retiredExample = (fields = {}) => ({
  id: 'ejemplo-producto-retirado', name: 'Producto de ejemplo retirado', brandName: 'Marca de ejemplo', code: 'EJ-1002', categoryIds: ['manos'],
  saleUnit: 'par', summary: listedExamples[0].summary, characteristics: [...listedExamples[0].characteristics],
  variants: [{ id: 'unica', label: 'Única', code: 'EJ-1002-U' }], retired: true, ...fields,
});
const build = (mode, products, exampleProducts = listedExamples) => createSiteData({ mode, catalog: withProducts(...products), brands, exampleProducts });

test('una ficha retirada es pública solo si tiene una aprobación comercial completa', () => {
  assert.equal(isPublicRetired(record()), true);
  for (const [label, product] of [
    ['sin aprobación', record({ approval: undefined })],
    ['sin quien aprueba', record({ approval: { by: ' ', on: '2026-11-18', supplyConfirmed: true } })],
    ['fecha inválida', record({ approval: { by: 'Revisor de prueba', on: '2026-02-30', supplyConfirmed: true } })],
    ['suministro sin confirmar', record({ approval: { by: 'Revisor de prueba', on: '2026-11-18', supplyConfirmed: false } })],
    ['aprobada', record({ status: 'approved' })],
    ['borrador', record({ status: 'draft' })],
    ['en revisión', record({ status: 'in_review' })],
  ]) {
    assert.equal(isPublicRetired(product), false, label);
  }
  assert.equal(isPublicRetired(undefined), false);
  assert.equal(isPublicRetired(null), false);
});

test('getRetiredProducts entrega solo lo que identifica al producto y nunca los campos internos', () => {
  const editorial = withProducts(record(), record({ id: 'test-002', model: 'TEST-002', approval: undefined }));
  const retired = getRetiredProducts(editorial, brandScope);
  assert.deepEqual(retired, [{ id: 'test-001', brandId: 'ansell', model: 'TEST-001/A', name: 'Producto sintético de prueba', categoryIds: ['manos'] }]);
  // La copia no comparte memoria con el catálogo.
  retired[0].categoryIds.push('cabeza');
  assert.deepEqual(editorial.products.at(-2).categoryIds, ['manos']);
  // Un retirado no es una ficha publicada.
  assert.deepEqual(getPublishedProducts(editorial, brandScope), []);
  // Un catálogo inválido detiene la exportación, como en getPublishedProducts.
  assert.throws(() => getRetiredProducts(withProducts(record({ brandId: 'marca-desconocida' })), brandScope), /la marca no está en el alcance permitido/);
});

test('la validación del catálogo no cambia: un retirado sin aprobación es un registro privado válido', () => {
  assert.deepEqual(validateCatalog(withProducts(record({ approval: undefined })), brandScope), []);
  assert.deepEqual(validateCatalog(withProducts(record({ approval: { by: '', on: 'mañana', supplyConfirmed: false } })), brandScope), []);
  // Un retirado no necesita descripción, imagen ni fuente (no se muestran), ni categorías aprobadas.
  const bare = record({ description: undefined, saleUnit: undefined, characteristics: undefined, variants: undefined, image: undefined, documents: undefined, source: undefined, categoryIds: ['cabeza'] });
  assert.deepEqual(validateCatalog(withProducts(bare), brandScope), []);
  // Lo que se muestra pasa las mismas reglas que una ficha aprobada.
  const errors = change => validateCatalog(withProducts(record(change)), brandScope).join('\n');
  assert.match(errors({ id: 'Test 001' }), /id inválido o duplicado/);
  assert.match(errors({ brandId: 'espomega' }), /un proveedor no es una marca/);
  assert.match(errors({ model: ' ' }), /modelo vacío o duplicado/);
  assert.match(errors({ name: '' }), /falta nombre/);
  assert.match(errors({ categoryIds: [] }), /faltan categorías válidas/);
  assert.match(errors({ categoryIds: ['guantes'] }), /faltan categorías válidas/);
  assert.match(errors({ name: 'Guantes Internacionales' }), /marca excluida/);
  assert.match(errors({ precio: 10 }), /campo comercial no permitido/);
});

test('un identificador nunca es a la vez un producto y un retirado, y las marcas de los ejemplos siguen reservadas', () => {
  const approved = record({ status: 'approved' });
  assert.throws(() => build('production', [approved, record({ model: 'TEST-OTRO' })]), /id inválido o duplicado/);
  for (const change of [{ id: 'ejemplo-producto-retirado' }, { model: 'EJ-1002' }, { name: 'Producto de ejemplo retirado' }, { variants: [{ id: 'u', label: 'Única', manufacturerCode: 'EJ-1002-U' }] }]) {
    assert.throws(() => build('production', [record(change)]), /reservado para los ejemplos de vista previa/, JSON.stringify(change));
  }
  // En los ejemplos, un retirado no puede repetir el id ni el código de otro ejemplo.
  const context = { categoryIds: catalog.categories.map(category => category.id), brands };
  assert.match(validateExampleProducts([...listedExamples, retiredExample({ id: listedExamples[0].id })], context).join('\n'), /no repetirse/);
  assert.match(validateExampleProducts([...listedExamples, retiredExample({ code: listedExamples[0].code })], context).join('\n'), /EJ-0000 y no repetirse/);
});

test('producción: el retirado con aprobación tiene registro propio y ningún listado, conteo o búsqueda lo incluye', () => {
  const site = build('production', [record()]);
  assert.deepEqual(site.retiredProducts, [{
    id: 'test-001', url: '/productos/test-001/', name: 'Producto sintético de prueba', brandId: 'ansell', brandName: 'Ansell',
    code: 'TEST-001/A', categoryIds: ['manos'], categoryNames: ['Protección de manos'], isExample: false,
  }]);
  assert.equal(site.getRetiredProduct('test-001'), site.retiredProducts[0]);
  assert.equal(site.getProduct('test-001'), undefined);
  assert.deepEqual(site.products, []);
  assert.deepEqual(site.paths, { categoryIds: ['manos'], brandIds: brands.map(brand => brand.id), productIds: [] });
  assert.equal(site.getCategory('manos')?.productCount, 0);
  assert.deepEqual(site.productsByCategory('manos'), []);
  assert.equal(site.getBrand('ansell')?.productCount, 0);
  assert.deepEqual(site.productsByBrand('ansell'), []);
  assert.deepEqual(site.featuredProducts(99), []);
  assert.deepEqual(site.products.filter(product => matchesQuery(product, 'sintético')), []);
});

test('con una ficha aprobada y una retirada, los conteos y listados solo cuentan la aprobada', () => {
  const site = build('preview', [record({ status: 'approved', id: 'test-002', model: 'TEST-002', variants: [{ id: 'talla-9', label: 'Talla 9', manufacturerCode: 'TEST-002-9' }] }), record()]);
  assert.deepEqual(site.products.map(product => product.id), ['test-002', ...listedExamples.map(example => example.id)]);
  assert.deepEqual(site.retiredProducts.map(product => product.id), ['test-001']);
  assert.equal(site.getCategory('manos')?.productCount, 2);
  assert.deepEqual(site.productsByCategory('manos').map(product => product.id), ['test-002', 'ejemplo-guante-recubierto']);
  assert.equal(site.getBrand('ansell')?.productCount, 1);
  assert.deepEqual(site.productsByBrand('ansell').map(product => product.id), ['test-002']);
  assert.ok(!site.featuredProducts(99).some(product => product.id === 'test-001'));
  assert.deepEqual(site.products.filter(product => matchesQuery(product, 'TEST-001')), []);
  assert.deepEqual(site.paths.productIds, ['test-002', ...listedExamples.map(example => example.id)]);
});

test('un retirado sin aprobación no es público en ningún modo', () => {
  for (const mode of ['production', 'preview']) {
    const site = build(mode, [record({ approval: undefined })]);
    assert.deepEqual(site.retiredProducts, [], mode);
    assert.equal(site.getRetiredProduct('test-001'), undefined, mode);
    assert.equal(site.getProduct('test-001'), undefined, mode);
  }
});

test('las categorías del retirado son solo las públicas en el modo', () => {
  // «cabeza» sigue en borrador: en producción no es pública, en la vista previa sí.
  const product = record({ categoryIds: ['cabeza', 'manos'] });
  assert.deepEqual(build('production', [product]).retiredProducts.map(item => [item.categoryIds, item.categoryNames]), [[['manos'], ['Protección de manos']]]);
  assert.deepEqual(build('preview', [product]).retiredProducts.map(item => [item.categoryIds, item.categoryNames]), [[['cabeza', 'manos'], ['Protección de cabeza', 'Protección de manos']]]);
  // Sin ninguna categoría pública sigue teniendo su página, sin categoría.
  const orphan = build('production', [record({ categoryIds: ['cabeza'] })]).retiredProducts;
  assert.deepEqual(orphan.map(item => [item.id, item.categoryIds, item.categoryNames]), [['test-001', [], []]]);
});

test('los campos internos y los textos que ya nadie mantiene nunca llegan al registro público', () => {
  for (const mode of ['production', 'preview']) {
    const site = build(mode, [record()], [...listedExamples, retiredExample()]);
    for (const item of site.retiredProducts) assert.deepEqual(Object.keys(item), RETIRED_KEYS, `${mode} ${item.id}`);
    const data = JSON.parse(JSON.stringify(site.retiredProducts));
    const keys = new Set(allKeys(data));
    for (const key of INTERNAL_KEYS) assert.ok(!keys.has(key), `${mode}: campo interno publicado: ${key}`);
    const text = allStrings(data).join(' | ');
    assert.doesNotMatch(text, /Revisor de prueba|2026-11-18|example\.invalid|No es un artículo comercial|Dato sintético|Talla 9|pieza|retired|approved/);
    assert.doesNotMatch(text, /Texto de ejemplo|Característica de ejemplo|EJ-1002-U|Única|\bpar\b/);
  }
});

test('producción ignora el ejemplo retirado; la vista previa le da su registro y nada más cambia', () => {
  const exampleProducts = [...listedExamples, retiredExample()];
  const production = createSiteData({ mode: 'production', catalog, brands, exampleProducts });
  assert.deepEqual(production.retiredProducts, []);
  assert.equal(production.getRetiredProduct('ejemplo-producto-retirado'), undefined);
  assert.doesNotMatch(JSON.stringify(production.retiredProducts), /ejemplo/i);

  const preview = createSiteData({ mode: 'preview', catalog, brands, exampleProducts });
  const before = createSiteData({ mode: 'preview', catalog, brands, exampleProducts: listedExamples });
  assert.deepEqual(preview.retiredProducts, [{
    id: 'ejemplo-producto-retirado', url: '/productos/ejemplo-producto-retirado/', name: 'Producto de ejemplo retirado',
    brandId: null, brandName: 'Marca de ejemplo', code: 'EJ-1002', categoryIds: ['manos'], categoryNames: ['Protección de manos'], isExample: true,
  }]);
  assert.equal(preview.getProduct('ejemplo-producto-retirado'), undefined);
  // Listados, conteos, destacados y rutas son exactamente los de los diez ejemplos.
  assert.deepEqual(preview.products, before.products);
  assert.deepEqual(preview.categories, before.categories);
  assert.deepEqual(preview.brands, before.brands);
  assert.deepEqual(preview.paths, before.paths);
  assert.deepEqual(preview.featuredProducts(99), before.featuredProducts(99));
  for (const category of preview.categories) assert.deepEqual(preview.productsByCategory(category.id), before.productsByCategory(category.id), category.id);
  assert.deepEqual(before.retiredProducts, []);
});

test('el registro de los retirados está congelado', () => {
  const site = build('preview', [record()], [...listedExamples, retiredExample()]);
  assert.ok(Object.isFrozen(site.retiredProducts) && Object.isFrozen(site.retiredProducts[0]) && Object.isFrozen(site.retiredProducts[0].categoryIds));
  assert.throws(() => { site.retiredProducts.push(site.retiredProducts[0]); }, TypeError);
});

test('un ejemplo se marca como retirado con «retired»: true; el resto de sus reglas no cambia', () => {
  const context = { categoryIds: catalog.categories.map(category => category.id), brands };
  assert.deepEqual(validateExampleProducts([...listedExamples, retiredExample()], context), []);
  assert.deepEqual(validateExampleProducts([...listedExamples, retiredExample({ retired: false })], context), []);
  for (const value of ['true', 1, null, 'sí']) {
    assert.match(validateExampleProducts([retiredExample({ retired: value })], context).join('\n'), /retired debe ser true o false/, String(value));
  }
  // Las reglas de siempre siguen valiendo para un ejemplo retirado.
  const errors = change => validateExampleProducts([retiredExample(change)], context).join('\n');
  assert.match(errors({ id: 'producto-retirado' }), /el id debe empezar con «ejemplo-»/);
  assert.match(errors({ code: 'R-1002' }), /el código debe tener la forma EJ-0000/);
  assert.match(errors({ name: 'Producto retirado' }), /el nombre debe contener «de ejemplo»/);
  assert.match(errors({ brandName: 'Ansell' }), /la marca debe ser «Marca de ejemplo»/);
  assert.match(errors({ summary: '' }), /falta unidad de venta o resumen/);
  assert.match(errors({ categoryIds: [] }), /faltan categorías existentes/);
  assert.match(errors({ status: 'retired' }), /status: campo no definido/);
});
