import test from 'node:test';
import assert from 'node:assert/strict';
import { createSiteData, EXAMPLE_TAG, PREVIEW_NOTICE, routes } from '../src/lib/site-data-core.mjs';
import { allKeys, allStrings, loadProjectData } from './helpers.mjs';

const { brands, catalog, examples } = await loadProjectData();
const categoryIds = catalog.categories.map(category => category.id);
const brandIds = brands.map(brand => brand.id);
// Los diez ejemplos de los listados; el undécimo es el ejemplo de producto retirado (solo tiene su página).
const exampleIds = examples.filter(example => example.retired !== true).map(example => example.id);
const RETIRED_EXAMPLE_ID = 'ejemplo-producto-retirado';

const CATEGORY_KEYS = ['id', 'name', 'shortName', 'summary', 'isDraft', 'productCount', 'url'];
const BRAND_KEYS = ['id', 'name', 'kind', 'manufacturerLinks', 'productCount', 'url'];
const PRODUCT_KEYS = ['id', 'url', 'name', 'brandId', 'brandName', 'code', 'categoryIds', 'categoryNames', 'summary', 'characteristics', 'saleUnit', 'variants', 'image', 'documents', 'isExample'];
// Nombres de campos internos que nunca deben verse en los datos públicos.
const INTERNAL_KEYS = ['approval', 'source', 'status', 'sourceUrl', 'usageConfirmed', 'supplyConfirmed', 'checkedOn', 'by', 'on', 'model', 'description', 'manufacturerCode', 'schemaVersion', 'entity_id', 'entity_type', 'resources', 'verification', 'next_action'];

const production = () => createSiteData({ mode: 'production', catalog, brands, exampleProducts: examples });
const preview = () => createSiteData({ mode: 'preview', catalog, brands, exampleProducts: examples });
const printable = site => ({ mode: site.mode, isPreview: site.isPreview, categories: site.categories, brands: site.brands, products: site.products, paths: site.paths });

// Catálogo sintético de prueba: la categoría «manos» aprobada y una ficha aprobada con todos sus datos internos.
// Nunca se importa en el sitio.
function syntheticCatalog(change = () => {}) {
  const copy = structuredClone(catalog);
  copy.categories[0].status = 'approved';
  copy.products.push({
    id: 'test-001', brandId: 'ansell', model: 'TEST-001/A', name: 'Producto sintético de prueba', categoryIds: ['manos'], status: 'approved',
    description: 'No es un artículo comercial.', saleUnit: 'pieza',
    characteristics: ['Dato sintético A', 'Dato sintético B', 'Dato sintético C'],
    variants: [{ id: 'talla-9', label: 'Talla 9', manufacturerCode: 'TEST-001/A-9' }],
    image: { url: 'https://example.invalid/test.png', alt: 'Imagen de prueba', sourceUrl: 'https://example.invalid/source', usageConfirmed: true },
    documents: [{ label: 'Ficha técnica de prueba', url: 'https://example.invalid/ficha.pdf' }],
    source: { url: 'https://example.invalid/test', checkedOn: '2026-11-18' },
    approval: { by: 'Revisor de prueba', on: '2026-11-18', supplyConfirmed: true },
  });
  change(copy, copy.products[0]);
  return copy;
}

test('producción con los datos reales: ninguna categoría en borrador, ningún producto y las diecinueve marcas', () => {
  const site = production();
  assert.equal(site.mode, 'production');
  assert.equal(site.isPreview, false);
  assert.deepEqual(site.categories, []);
  assert.deepEqual(site.products, []);
  assert.deepEqual(site.brands.map(brand => brand.id), brandIds);
  assert.deepEqual(site.paths, { categoryIds: [], brandIds, productIds: [] });
  assert.deepEqual(site.featuredProducts(), []);
  assert.equal(site.getCategory('manos'), undefined);
  assert.equal(site.getProduct(exampleIds[0]), undefined);
  assert.deepEqual(site.productsByCategory('manos'), []);
  assert.deepEqual(site.productsByBrand('ansell'), []);
  assert.ok(site.brands.every(brand => brand.productCount === 0));
});

test('producción ignora los ejemplos aunque se le entreguen, incluso si son inválidos', () => {
  const text = JSON.stringify(printable(production()));
  assert.doesNotMatch(text, /EJ-\d|ejemplo/i);
  const site = createSiteData({ mode: 'production', catalog, brands, exampleProducts: [{ id: 'no-es-un-ejemplo-valido' }] });
  assert.deepEqual(site.products, []);
  assert.deepEqual(createSiteData({ mode: 'production', catalog, brands }).products, []);
});

test('vista previa con los datos reales: diez categorías en borrador y diez ejemplos', () => {
  const site = preview();
  assert.equal(site.mode, 'preview');
  assert.equal(site.isPreview, true);
  assert.deepEqual(site.categories.map(category => category.id), categoryIds);
  assert.ok(site.categories.every(category => category.isDraft === true && category.productCount === 1));
  assert.deepEqual(site.products.map(product => product.id), exampleIds);
  assert.equal(site.products.length, 10);
  assert.deepEqual(site.brands.map(brand => brand.id), brandIds);
  assert.deepEqual(site.paths, { categoryIds, brandIds, productIds: exampleIds });
  // El ejemplo retirado no está en ningún listado: solo en su colección.
  assert.deepEqual(site.retiredProducts.map(product => product.id), [RETIRED_EXAMPLE_ID]);
  assert.equal(site.getProduct(RETIRED_EXAMPLE_ID), undefined);
  for (const product of site.products) {
    assert.equal(product.isExample, true);
    assert.equal(product.brandId, null);
    assert.equal(product.brandName, 'Marca de ejemplo');
    assert.equal(product.image, null);
    assert.deepEqual(product.documents, []);
    assert.equal(product.url, `/productos/${product.id}/`);
  }
  // Los ejemplos no pertenecen a ninguna marca real.
  assert.ok(site.brands.every(brand => brand.productCount === 0 && site.productsByBrand(brand.id).length === 0));
});

test('las proyecciones tienen exactamente los campos públicos acordados', () => {
  const site = preview();
  for (const category of site.categories) assert.deepEqual(Object.keys(category), CATEGORY_KEYS);
  for (const brand of site.brands) {
    assert.deepEqual(Object.keys(brand), BRAND_KEYS);
    for (const link of brand.manufacturerLinks) assert.deepEqual(Object.keys(link), ['label', 'url']);
  }
  for (const product of site.products) {
    assert.deepEqual(Object.keys(product), PRODUCT_KEYS);
    for (const variant of product.variants) assert.deepEqual(Object.keys(variant), ['id', 'label', 'code']);
  }
  const manos = site.getCategory('manos');
  assert.deepEqual(manos, {
    id: 'manos', name: 'Protección de manos', shortName: 'Manos',
    summary: 'Guantes recubiertos, de cuero, desechables, anticorte, para químicos y mangas',
    isDraft: true, productCount: 1, url: '/categorias/manos/',
  });
  assert.deepEqual(site.getBrand('ansell'), {
    id: 'ansell', name: 'Ansell', kind: 'brand',
    manufacturerLinks: [{ label: 'Sitio del fabricante', url: 'https://www.ansell.com/mx/es/industrial' }],
    productCount: 0, url: '/marcas/ansell/',
  });
  assert.deepEqual(site.getBrand('espomega'), { id: 'espomega', name: 'Espomega', kind: 'supplier', manufacturerLinks: [], productCount: 0, url: '/marcas/espomega/' });
  assert.deepEqual(site.getProduct('ejemplo-guante-recubierto'), {
    id: 'ejemplo-guante-recubierto', url: '/productos/ejemplo-guante-recubierto/', name: 'Guante de ejemplo recubierto',
    brandId: null, brandName: 'Marca de ejemplo', code: 'EJ-1001', categoryIds: ['manos'], categoryNames: ['Protección de manos'],
    summary: 'Texto de ejemplo para mostrar cómo se verá el resumen de un producto. No describe un artículo real.',
    characteristics: ['Característica de ejemplo: material y recubrimiento', 'Característica de ejemplo: uso recomendado', 'Característica de ejemplo: presentación y empaque'],
    saleUnit: 'par',
    variants: [
      { id: 'talla-7', label: 'Talla 7', code: 'EJ-1001-7' }, { id: 'talla-8', label: 'Talla 8', code: 'EJ-1001-8' },
      { id: 'talla-9', label: 'Talla 9', code: 'EJ-1001-9' }, { id: 'talla-10', label: 'Talla 10', code: 'EJ-1001-10' },
    ],
    image: null, documents: [], isExample: true,
  });
});

test('búsquedas por id, por categoría y por marca, y selección de destacados', () => {
  const site = preview();
  for (const id of categoryIds) {
    assert.equal(site.getCategory(id)?.id, id);
    assert.deepEqual(site.productsByCategory(id).map(product => product.categoryIds), [[id]]);
  }
  for (const id of exampleIds) assert.equal(site.getProduct(id)?.id, id);
  for (const id of brandIds) assert.equal(site.getBrand(id)?.id, id);
  assert.equal(site.getCategory('no-existe'), undefined);
  assert.equal(site.getBrand('no-existe'), undefined);
  assert.equal(site.getProduct('no-existe'), undefined);
  assert.deepEqual(site.productsByCategory('no-existe'), []);
  assert.deepEqual(site.productsByBrand('no-existe'), []);
  assert.deepEqual(site.featuredProducts(4).map(product => product.code), ['EJ-1001', 'EJ-2001', 'EJ-3001', 'EJ-4001']);
  assert.equal(site.featuredProducts().length, 8);
  assert.equal(site.featuredProducts(99).length, 10);
  assert.deepEqual(site.featuredProducts(0), []);
  assert.deepEqual(site.featuredProducts(-3), []);
  assert.equal(new Set(site.featuredProducts(10).map(product => product.id)).size, 10);
});

test('una ficha aprobada llega por getPublishedProducts con la forma pública y sin datos internos', () => {
  const site = createSiteData({ mode: 'production', catalog: syntheticCatalog(), brands, exampleProducts: examples });
  assert.deepEqual(site.categories.map(category => [category.id, category.isDraft, category.productCount]), [['manos', false, 1]]);
  assert.deepEqual(site.paths, { categoryIds: ['manos'], brandIds, productIds: ['test-001'] });
  assert.deepEqual(site.products, [{
    id: 'test-001', url: '/productos/test-001/', name: 'Producto sintético de prueba',
    brandId: 'ansell', brandName: 'Ansell', code: 'TEST-001/A', categoryIds: ['manos'], categoryNames: ['Protección de manos'],
    summary: 'No es un artículo comercial.', characteristics: ['Dato sintético A', 'Dato sintético B', 'Dato sintético C'], saleUnit: 'pieza',
    variants: [{ id: 'talla-9', label: 'Talla 9', code: 'TEST-001/A-9' }],
    image: { url: 'https://example.invalid/test.png', alt: 'Imagen de prueba' },
    documents: [{ label: 'Ficha técnica de prueba', url: 'https://example.invalid/ficha.pdf' }],
    isExample: false,
  }]);
  assert.deepEqual(site.productsByBrand('ansell').map(product => product.id), ['test-001']);
  assert.equal(site.getBrand('ansell')?.productCount, 1);
  assert.equal(site.getBrand('3m')?.productCount, 0);
  assert.deepEqual(site.featuredProducts().map(product => product.id), ['test-001']);

  // Nada de lo que se puede imprimir lleva aprobación, fuente, estado ni datos del registro.
  const data = JSON.parse(JSON.stringify(printable(site)));
  const keys = new Set(allKeys(data));
  for (const key of INTERNAL_KEYS) assert.ok(!keys.has(key), `campo interno publicado: ${key}`);
  const text = allStrings(data).join(' | ');
  assert.doesNotMatch(text, /Revisor de prueba|2026-11-18|example\.invalid\/source|example\.invalid\/test(?!\.png)|approved|draft/);
});

test('vista previa con una ficha aprobada: la ficha real va primero y los ejemplos se suman', () => {
  const site = createSiteData({ mode: 'preview', catalog: syntheticCatalog(), brands, exampleProducts: examples });
  assert.deepEqual(site.categories.map(category => category.isDraft), [false, ...Array(9).fill(true)]);
  assert.deepEqual(site.products.map(product => product.id), ['test-001', ...exampleIds]);
  assert.deepEqual(site.products.map(product => product.isExample), [false, ...Array(10).fill(true)]);
  assert.equal(site.getCategory('manos')?.productCount, 2);
  // Los destacados recorren las categorías por turnos: no se agotan en la primera.
  assert.deepEqual(site.featuredProducts(3).map(product => product.code), ['TEST-001/A', 'EJ-2001', 'EJ-3001']);
  assert.deepEqual(site.featuredProducts(11).at(-1)?.code, 'EJ-1001');
});

test('lo que no está aprobado no se publica, y un catálogo inválido detiene la compilación', () => {
  const build = (change, mode = 'production') => createSiteData({ mode, catalog: syntheticCatalog(change), brands, exampleProducts: examples });
  for (const status of ['draft', 'in_review', 'retired']) {
    assert.deepEqual(build((_, product) => { product.status = status; }).products, [], status);
  }
  // Ficha aprobada en una categoría que sigue en borrador.
  assert.throws(() => build((_, product) => { product.categoryIds = ['cabeza']; }), /categoría pendiente de aprobación/);
  // Un proveedor no es una marca, y una marca fuera de brands.json no existe.
  assert.throws(() => build((_, product) => { product.brandId = 'espomega'; }), /un proveedor no es una marca/);
  assert.throws(() => build((_, product) => { product.brandId = 'marca-desconocida'; }), /la marca no está en el alcance permitido/);
  assert.throws(() => build((_, product) => { product.approval.supplyConfirmed = false; }), /falta aprobación comercial/);
  assert.throws(() => build((_, product) => { product.image.usageConfirmed = false; }), /imagen verificable/);
  assert.throws(() => build((_, product) => { product.precio = 10; }), /campo comercial no permitido/);
  assert.throws(() => build((_, product) => { product.id = 'ejemplo-guante-recubierto'; }), /reservado para los ejemplos/);
});

test('createSiteData rechaza modos, marcas y ejemplos inválidos', () => {
  assert.throws(() => createSiteData({ mode: 'desarrollo', catalog, brands }), /Modo de sitio no reconocido/);
  assert.throws(() => createSiteData({ mode: undefined, catalog, brands }), /Modo de sitio no reconocido/);
  assert.throws(() => createSiteData({ mode: 'production', catalog, brands: [] }), /al menos una marca/);
  assert.throws(() => createSiteData({ mode: 'production', catalog: {}, brands }), /schemaVersion 1/);
  const broken = structuredClone(examples);
  broken[0].brandName = 'Ansell';
  assert.throws(() => createSiteData({ mode: 'preview', catalog, brands, exampleProducts: broken }), /la marca debe ser «Marca de ejemplo»/);
  assert.throws(() => createSiteData({ mode: 'preview', catalog, brands, exampleProducts: null }), /debe ser una lista/);
  // Sin ejemplos, la vista previa solo muestra las categorías.
  const empty = createSiteData({ mode: 'preview', catalog, brands });
  assert.equal(empty.categories.length, 10);
  assert.deepEqual(empty.products, []);
});

test('los datos devueltos están congelados y no comparten memoria con los archivos de origen', () => {
  const site = preview();
  assert.ok(Object.isFrozen(site) && Object.isFrozen(site.products) && Object.isFrozen(site.products[0]) && Object.isFrozen(site.products[0].variants[0]));
  assert.ok(Object.isFrozen(site.categories[0]) && Object.isFrozen(site.brands[0].manufacturerLinks) && Object.isFrozen(site.paths.productIds));
  assert.throws(() => { site.products.push(site.products[0]); }, TypeError);
  assert.throws(() => { site.categories[0].name = 'Otro'; }, TypeError);
  // Los resultados de los ayudantes son listas nuevas: se pueden ordenar sin afectar a nadie.
  const list = site.productsByCategory('manos');
  list.pop();
  assert.equal(site.productsByCategory('manos').length, 1);
  assert.notEqual(site.featuredProducts(2), site.featuredProducts(2));
  assert.equal(examples[0].variants.length, 4);
  assert.ok(!Object.isFrozen(examples[0]) && !Object.isFrozen(brands[0]) && !Object.isFrozen(catalog.categories[0]));
});

test('rutas del sitio: todas con diagonal final y la consulta codificada', () => {
  assert.deepEqual(
    [routes.home, routes.catalog, routes.brands, routes.quoteList, routes.specialRequest, routes.contact, routes.privacy],
    ['/', '/catalogo/', '/marcas/', '/cotizar/', '/solicitud-especial/', '/contacto/', '/privacidad/'],
  );
  assert.equal(routes.category('manos'), '/categorias/manos/');
  assert.equal(routes.brand('mcr-safety'), '/marcas/mcr-safety/');
  assert.equal(routes.product('ejemplo-orejera'), '/productos/ejemplo-orejera/');
  assert.equal(routes.search('guante 37-175 señalización'), '/catalogo/?q=guante%2037-175%20se%C3%B1alizaci%C3%B3n');
  assert.equal(routes.search('  '), '/catalogo/');
  assert.equal(routes.search(), '/catalogo/');
  assert.equal(routes.search(null), '/catalogo/');
  assert.ok(Object.isFrozen(routes));
});

test('textos fijos de la vista previa', () => {
  assert.equal(PREVIEW_NOTICE, 'Vista previa para revisión. Los productos que aparecen son ejemplos de diseño, no artículos reales.');
  assert.equal(EXAMPLE_TAG, 'Ejemplo');
});

// --- Módulo de entrada que usan las páginas -----------------------------------------------------------------
// Astro define la constante __CATALOG_PREVIEW__ al compilar; aquí se define a mano antes de cargar el módulo.
const EXPORTS = ['EXAMPLE_TAG', 'PREVIEW_NOTICE', 'brands', 'categories', 'featuredProducts', 'getBrand', 'getCategory', 'getProduct', 'getRetiredProduct', 'isPreview', 'mode', 'paths', 'products', 'productsByBrand', 'productsByCategory', 'retiredProducts', 'routes'];

test('site-data.mjs en producción: sin ejemplos ni categorías en borrador', async () => {
  globalThis.__CATALOG_PREVIEW__ = false;
  const site = await import('../src/lib/site-data.mjs?produccion');
  assert.deepEqual(Object.keys(site).sort(), EXPORTS);
  assert.equal(site.mode, 'production');
  assert.equal(site.isPreview, false);
  assert.equal(site.categories.length, 0);
  assert.equal(site.products.length, 0);
  assert.equal(site.brands.length, 19);
  assert.deepEqual(site.paths, { categoryIds: [], brandIds, productIds: [] });
  assert.deepEqual(site.featuredProducts(), []);
  assert.equal(site.getProduct('ejemplo-orejera'), undefined);
  assert.deepEqual(site.retiredProducts, []);
  assert.equal(site.getRetiredProduct(RETIRED_EXAMPLE_ID), undefined);
});

test('site-data.mjs en vista previa: diez categorías y diez ejemplos', async () => {
  globalThis.__CATALOG_PREVIEW__ = true;
  const site = await import('../src/lib/site-data.mjs?vista-previa');
  assert.deepEqual(Object.keys(site).sort(), EXPORTS);
  assert.equal(site.mode, 'preview');
  assert.equal(site.isPreview, true);
  assert.equal(site.categories.length, 10);
  assert.equal(site.products.length, 10);
  assert.equal(site.brands.length, 19);
  assert.deepEqual(site.paths, { categoryIds, brandIds, productIds: exampleIds });
  assert.equal(site.getProduct('ejemplo-orejera')?.code, 'EJ-5001');
  assert.equal(site.getCategory('auditiva')?.productCount, 1);
  assert.deepEqual(site.productsByCategory('soldadura').map(product => product.code), ['EJ-1101']);
  assert.equal(site.featuredProducts(3).length, 3);
  assert.equal(site.routes.catalog, '/catalogo/');
  assert.deepEqual(site.retiredProducts.map(product => [product.id, product.code, product.isExample]), [[RETIRED_EXAMPLE_ID, 'EJ-1002', true]]);
  assert.equal(site.getRetiredProduct(RETIRED_EXAMPLE_ID)?.categoryIds[0], 'manos');
  assert.equal(site.getCategory('manos')?.productCount, 1);
});

test('site-data.mjs no se puede cargar en un navegador ni fuera de una compilación', async () => {
  // Fuera de Astro la constante no existe: el módulo falla en lugar de elegir un modo por su cuenta.
  delete globalThis.__CATALOG_PREVIEW__;
  await assert.rejects(import('../src/lib/site-data.mjs?sin-constante'), ReferenceError);
  // En un navegador existe `document`: el módulo se niega a entregar los archivos de datos.
  globalThis.__CATALOG_PREVIEW__ = false;
  globalThis.document = {};
  try {
    await assert.rejects(import('../src/lib/site-data.mjs?navegador'), /solo para compilación/);
  } finally {
    delete globalThis.document;
    delete globalThis.__CATALOG_PREVIEW__;
  }
});
