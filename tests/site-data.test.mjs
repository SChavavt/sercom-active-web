import test from 'node:test';
import assert from 'node:assert/strict';
import { createSiteData, DEVELOPMENT_NOTICE, EXAMPLE_TAG, PREVIEW_NOTICE, routes } from '../src/lib/site-data-core.mjs';
import { searchText } from '../src/lib/search.mjs';
import { allKeys, allStrings, emptiedCatalog, loadProjectData, publicCatalog } from './helpers.mjs';

const { brands, catalog, examples } = await loadProjectData();
// Las pruebas de los ejemplos, de los modos y de una ficha sintética usan el catálogo real vaciado (las mismas
// categorías, todas en borrador, y ninguna ficha): dan lo mismo con cualquier catálogo válido. Las que tratan de los
// datos reales comparan con lo que se deriva de ellos (`publicCatalog`), nunca con una cifra escrita a mano.
const emptied = emptiedCatalog(catalog);
const real = publicCatalog(catalog);
const categoryIds = catalog.categories.map(category => category.id);
const brandIds = brands.map(brand => brand.id);
// Los dieciséis ejemplos de los listados; el último del archivo es el ejemplo de producto retirado (solo tiene su página).
// Productos de ejemplo por categoría, en el orden del catálogo: tres guantes; dos de ojos, cabeza, respiratoria y calzado.
const EXAMPLES_PER_CATEGORY = [3, 2, 2, 2, 1, 1, 1, 2, 1, 1];
const exampleIds = examples.filter(example => example.retired !== true).map(example => example.id);
const RETIRED_EXAMPLE_ID = 'ejemplo-producto-retirado';

const CATEGORY_KEYS = ['id', 'name', 'shortName', 'summary', 'isDraft', 'productCount', 'url'];
const BRAND_KEYS = ['id', 'name', 'kind', 'manufacturerLinks', 'hasCatalog', 'productCount', 'url'];
const PRODUCT_KEYS = ['id', 'url', 'name', 'brandId', 'brandName', 'code', 'categoryIds', 'categoryNames', 'summary', 'characteristics', 'saleUnit', 'variants', 'standards', 'image', 'documents', 'isExample'];
/** Las rutas de las claves `key` que no están dentro de un objeto `image` (por ejemplo, la fuente de una norma). */
function keysOutsideImage(value, key, path = '') {
  if (Array.isArray(value)) return value.flatMap((child, index) => keysOutsideImage(child, key, `${path}[${index}]`));
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([name, child]) => [
    ...(name === key && !path.endsWith('.image') ? [`${path}.${name}`] : []),
    ...keysOutsideImage(child, key, `${path}.${name}`),
  ]);
}
// Nombres de campos internos que nunca deben verse en los datos públicos.
// `sourceUrl` solo llega como la página de donde viene una foto (`image.sourceUrl`, el crédito bajo la foto): lo
// revisa `keysOutsideImage`.
const INTERNAL_KEYS = ['approval', 'source', 'status', 'usageConfirmed', 'supplyConfirmed', 'checkedOn', 'by', 'on', 'model', 'description', 'manufacturerCode', 'schemaVersion', 'entity_id', 'entity_type', 'resources', 'verification', 'next_action'];

const production = () => createSiteData({ mode: 'production', catalog, brands, exampleProducts: examples });
const preview = () => createSiteData({ mode: 'preview', catalog, brands, exampleProducts: examples });
// Los mismos modos sobre el catálogo vaciado: solo los ejemplos y las diez categorías en borrador.
const emptyPreview = () => createSiteData({ mode: 'preview', catalog: emptied, brands, exampleProducts: examples });
const printable = site => ({ mode: site.mode, isPreview: site.isPreview, categories: site.categories, brands: site.brands, products: site.products, paths: site.paths });

// Catálogo sintético de prueba: la categoría «manos» aprobada y una ficha aprobada con todos sus datos internos.
// Nunca se importa en el sitio.
function syntheticCatalog(change = () => {}) {
  const copy = emptiedCatalog(catalog);
  copy.categories[0].status = 'approved';
  copy.products.push({
    id: 'test-001', brandId: 'ansell', model: 'TEST-001/A', name: 'Producto sintético de prueba', categoryIds: ['manos'], status: 'approved',
    description: 'No es un artículo comercial.', saleUnit: 'pieza',
    characteristics: ['Dato sintético A', 'Dato sintético B', 'Dato sintético C'],
    variants: [{ id: 'talla-9', label: 'Talla 9', manufacturerCode: 'TEST-001/A-9' }],
    image: { url: 'https://example.invalid/test.png', width: 1600, height: 1200, alt: 'Imagen de prueba', sourceUrl: 'https://example.invalid/source', usageConfirmed: true },
    documents: [{ label: 'Ficha técnica de prueba', url: 'https://example.invalid/ficha.pdf' }],
    source: { url: 'https://example.invalid/test', checkedOn: '2026-11-18' },
    approval: { by: 'Revisor de prueba', on: '2026-11-18', supplyConfirmed: true },
  });
  change(copy, copy.products[0]);
  return copy;
}

/**
 * Lo que un sitio armado con el catálogo real muestra, comparado con lo que se deriva de los mismos datos: en
 * producción, exactamente las categorías y las fichas aprobadas; en la vista previa, además las categorías en borrador
 * y los ejemplos. Ninguna ficha en borrador, en revisión o retirada está en una lista, y un retirado que fue público
 * solo tiene su registro (su página). Sirve para `createSiteData` y para el módulo `site-data.mjs`.
 */
function assertRealData(site) {
  const isPreview = site.isPreview;
  const categoryStatus = new Map(catalog.categories.map(category => [category.id, category.status]));
  const visibleCategoryIds = isPreview ? categoryIds : real.approvedCategoryIds;
  const listedIds = isPreview ? [...real.approvedProductIds, ...exampleIds] : real.approvedProductIds;
  assert.deepEqual(site.paths, { categoryIds: visibleCategoryIds, brandIds, productIds: listedIds });
  assert.deepEqual(site.categories.map(category => [category.id, category.isDraft]), visibleCategoryIds.map(id => [id, categoryStatus.get(id) !== 'approved']));
  assert.deepEqual(site.products.map(product => product.id), listedIds);
  assert.deepEqual(site.products.map(product => product.isExample), listedIds.map(id => exampleIds.includes(id)));
  assert.deepEqual(site.brands.map(brand => brand.id), brandIds);
  assert.deepEqual(site.retiredProducts.map(product => product.id), isPreview ? [...real.publicRetiredIds, RETIRED_EXAMPLE_ID] : real.publicRetiredIds);
  // Nada sin aprobar está en una lista; un retirado público solo tiene su registro.
  for (const id of real.unlistedProductIds) assert.equal(site.getProduct(id), undefined, id);
  for (const id of real.publicRetiredIds) assert.equal(site.getRetiredProduct(id)?.id, id);
  if (!isPreview) for (const id of exampleIds) assert.equal(site.getProduct(id), undefined, id);
  // Conteos y listados por categoría y por marca: solo lo listado (los ejemplos no tienen marca real).
  for (const category of site.categories) {
    const expected = site.products.filter(product => product.categoryIds.includes(category.id)).map(product => product.id);
    assert.deepEqual(site.productsByCategory(category.id).map(product => product.id), expected, category.id);
    assert.equal(category.productCount, expected.length, category.id);
  }
  for (const brand of site.brands) {
    const expected = real.approvedProducts.filter(product => product.brandId === brand.id).map(product => product.id);
    assert.deepEqual(site.productsByBrand(brand.id).map(product => product.id), expected, brand.id);
    assert.equal(brand.productCount, expected.length, brand.id);
  }
  const featured = site.featuredProducts().map(product => product.id);
  assert.equal(featured.length, Math.min(8, listedIds.length));
  assert.ok(featured.every(id => listedIds.includes(id)));
}

test('producción con los datos reales: solo las categorías y las fichas aprobadas, y las quince marcas', () => {
  const site = production();
  assert.equal(site.mode, 'production');
  assert.equal(site.isPreview, false);
  assertRealData(site);
  assert.ok(site.products.every(product => product.isExample === false));
});

test('vista previa con los datos reales: lo de producción, las categorías en borrador y los ejemplos', () => {
  const site = preview();
  assert.equal(site.mode, 'preview');
  assert.equal(site.isPreview, true);
  assertRealData(site);
  // Las fichas reales van antes que los ejemplos.
  assert.deepEqual(site.products.filter(product => !product.isExample).map(product => product.id), real.approvedProductIds);
});

test('producción ignora los ejemplos aunque se le entreguen, incluso si son inválidos', () => {
  const text = JSON.stringify(printable(createSiteData({ mode: 'production', catalog: emptied, brands, exampleProducts: examples })));
  assert.doesNotMatch(text, /EJ-\d|ejemplo/i);
  const site = createSiteData({ mode: 'production', catalog: emptied, brands, exampleProducts: [{ id: 'no-es-un-ejemplo-valido' }] });
  assert.deepEqual(site.products, []);
  assert.deepEqual(createSiteData({ mode: 'production', catalog: emptied, brands }).products, []);
  // Con el catálogo real, lo mismo con ejemplos que sin ellos.
  assert.deepEqual(createSiteData({ mode: 'production', catalog, brands, exampleProducts: [{ id: 'no-es-un-ejemplo-valido' }] }).products, production().products);
});

test('vista previa sin fichas reales: diez categorías en borrador y dieciséis ejemplos', () => {
  const site = emptyPreview();
  assert.equal(site.mode, 'preview');
  assert.equal(site.isPreview, true);
  assert.deepEqual(site.categories.map(category => category.id), categoryIds);
  assert.ok(site.categories.every(category => category.isDraft === true));
  assert.deepEqual(site.categories.map(category => category.productCount), EXAMPLES_PER_CATEGORY);
  assert.deepEqual(site.products.map(product => product.id), exampleIds);
  assert.equal(site.products.length, 16);
  assert.deepEqual(site.brands.map(brand => brand.id), brandIds);
  assert.deepEqual(site.paths, { categoryIds, brandIds, productIds: exampleIds });
  // El ejemplo retirado no está en ningún listado: solo en su colección.
  assert.deepEqual(site.retiredProducts.map(product => product.id), [RETIRED_EXAMPLE_ID]);
  assert.equal(site.getProduct(RETIRED_EXAMPLE_ID), undefined);
  // Cada ejemplo conserva su marca de ejemplo (la proyección no la cambia): tres marcas, ninguna con página.
  assert.deepEqual(site.products.map(product => product.brandName), examples.filter(example => example.retired !== true).map(example => example.brandName));
  assert.deepEqual([...new Set(site.products.map(product => product.brandName))], ['Marca de ejemplo', 'Marca de ejemplo Beta', 'Marca de ejemplo Gamma']);
  assert.deepEqual(site.products.filter(product => product.brandName !== 'Marca de ejemplo').map(product => [product.code, product.brandName]), [
    ['EJ-1003', 'Marca de ejemplo Beta'], ['EJ-1004', 'Marca de ejemplo Gamma'], ['EJ-2002', 'Marca de ejemplo Beta'],
    ['EJ-3002', 'Marca de ejemplo Gamma'], ['EJ-4002', 'Marca de ejemplo Beta'], ['EJ-8002', 'Marca de ejemplo Gamma'],
  ]);
  for (const product of site.products) {
    assert.equal(product.isExample, true);
    assert.equal(product.brandId, null);
    assert.equal(product.image, null);
    assert.deepEqual(product.documents, []);
    assert.equal(product.url, `/productos/${product.id}/`);
  }
  // Los ejemplos no pertenecen a ninguna marca real.
  assert.ok(site.brands.every(brand => brand.productCount === 0 && site.productsByBrand(brand.id).length === 0));
});

test('las proyecciones tienen exactamente los campos públicos acordados', () => {
  const site = emptyPreview();
  for (const category of site.categories) assert.deepEqual(Object.keys(category), CATEGORY_KEYS);
  for (const brand of site.brands) {
    assert.deepEqual(Object.keys(brand), BRAND_KEYS);
    for (const link of brand.manufacturerLinks) assert.deepEqual(Object.keys(link), ['label', 'url', 'kind', 'detail']);
  }
  for (const product of site.products) {
    assert.deepEqual(Object.keys(product), PRODUCT_KEYS);
    for (const variant of product.variants) assert.deepEqual(Object.keys(variant), ['id', 'label', 'code']);
  }
  const manos = site.getCategory('manos');
  assert.deepEqual(manos, {
    id: 'manos', name: 'Protección de manos', shortName: 'Manos',
    summary: 'Guantes recubiertos, de cuero, desechables, anticorte, para químicos y mangas',
    isDraft: true, productCount: 3, url: '/categorias/manos/',
  });
  assert.deepEqual(site.getBrand('ansell'), {
    id: 'ansell', name: 'Ansell', kind: 'brand',
    manufacturerLinks: [
      { label: 'Catálogo del fabricante (PDF)', url: 'https://www.ansell.com/-/media/projects/ansell/website/pdf/industrial/catalogo-general.ashx?hash=89416386AB73E1C18D8D4B0D69061569&rev=fe1daef904d74a5baabf722c6ac075e0', kind: 'pdf', detail: '2023' },
      { label: 'Sitio del fabricante', url: 'https://www.ansell.com/mx/es/industrial', kind: 'site', detail: null },
    ],
    hasCatalog: true, productCount: 0, url: '/marcas/ansell/',
  });
  assert.deepEqual(site.getBrand('espomega'), { id: 'espomega', name: 'Espomega', kind: 'supplier', manufacturerLinks: [], hasCatalog: false, productCount: 0, url: '/marcas/espomega/' });
  // Una marca con solo su sitio no tiene catálogo: Ansell sin su catálogo en PDF.
  const siteOnly = structuredClone(brands);
  siteOnly.find(brand => brand.id === 'ansell').manufacturerLinks.splice(0, 1);
  assert.equal(createSiteData({ mode: 'preview', catalog: emptied, brands: siteOnly, exampleProducts: examples }).getBrand('ansell').hasCatalog, false);
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
    standards: [], image: null, documents: [], isExample: true,
  });
});

test('cada enlace de marca llega con su clase y, en el PDF, la edición y el tamaño en una línea', () => {
  const PDF = 'Catálogo del fabricante (PDF)';
  const ONLINE = 'Catálogo en línea del fabricante';
  const SITE = 'Sitio del fabricante';
  // Marcas ficticias de prueba sobre la lista real: los mismos ids, con otros enlaces.
  const linksOf = links => {
    const list = structuredClone(brands);
    list[0].manufacturerLinks = links;
    return createSiteData({ mode: 'production', catalog: emptied, brands: list }).brands[0];
  };
  const pdf = details => linksOf([{ label: PDF, url: 'https://fabricante.invalid/catalogo.pdf', ...details }]).manufacturerLinks[0];
  assert.deepEqual(pdf({ edition: '2026 v2', megabytes: 49 }), { label: PDF, url: 'https://fabricante.invalid/catalogo.pdf', kind: 'pdf', detail: '2026 v2 · 49 MB' });
  assert.equal(pdf({ edition: '2026 v2' }).detail, '2026 v2');
  assert.equal(pdf({ megabytes: 49 }).detail, '49 MB');
  assert.equal(pdf({}).detail, null);
  const all = linksOf([
    { label: PDF, url: 'https://fabricante.invalid/catalogo.pdf', edition: '2026' },
    { label: ONLINE, url: 'https://fabricante.invalid/catalogos/' },
    { label: SITE, url: 'https://fabricante.invalid/' },
  ]);
  assert.deepEqual(all.manufacturerLinks.map(link => [link.kind, link.detail]), [['pdf', '2026'], ['online', null], ['site', null]]);
  assert.equal(all.hasCatalog, true);
  assert.equal(linksOf([{ label: ONLINE, url: 'https://fabricante.invalid/catalogos/' }]).hasCatalog, true);
  assert.equal(linksOf([{ label: SITE, url: 'https://fabricante.invalid/' }]).hasCatalog, false);
  assert.equal(linksOf([]).hasCatalog, false);
  // La edición y el tamaño no llegan a las páginas como campos: solo en `detail`.
  assert.ok(!allKeys(all).includes('edition') && !allKeys(all).includes('megabytes'));
});

test('búsquedas por id, por categoría y por marca, y selección de destacados', () => {
  const site = emptyPreview();
  categoryIds.forEach((id, index) => {
    assert.equal(site.getCategory(id)?.id, id);
    assert.deepEqual(site.productsByCategory(id).map(product => product.categoryIds), Array(EXAMPLES_PER_CATEGORY[index]).fill([id]));
  });
  assert.deepEqual(site.productsByCategory('manos').map(product => product.code), ['EJ-1001', 'EJ-1003', 'EJ-1004']);
  for (const id of exampleIds) assert.equal(site.getProduct(id)?.id, id);
  for (const id of brandIds) assert.equal(site.getBrand(id)?.id, id);
  assert.equal(site.getCategory('no-existe'), undefined);
  assert.equal(site.getBrand('no-existe'), undefined);
  assert.equal(site.getProduct('no-existe'), undefined);
  assert.deepEqual(site.productsByCategory('no-existe'), []);
  assert.deepEqual(site.productsByBrand('no-existe'), []);
  assert.deepEqual(site.featuredProducts(4).map(product => product.code), ['EJ-1001', 'EJ-2001', 'EJ-3001', 'EJ-4001']);
  // Ocho destacados, uno por categoría en turno: los seis ejemplos nuevos no cambian la portada.
  assert.deepEqual(site.featuredProducts().map(product => product.code), ['EJ-1001', 'EJ-2001', 'EJ-3001', 'EJ-4001', 'EJ-5001', 'EJ-6001', 'EJ-7001', 'EJ-8001']);
  assert.equal(site.featuredProducts(99).length, 16);
  assert.deepEqual(site.featuredProducts(0), []);
  assert.deepEqual(site.featuredProducts(-3), []);
  assert.equal(new Set(site.featuredProducts(16).map(product => product.id)).size, 16);
  // Después de una vuelta por las diez categorías, la segunda toma el siguiente de cada una que todavía tiene.
  assert.deepEqual(site.featuredProducts(16).slice(10).map(product => product.code), ['EJ-1003', 'EJ-2002', 'EJ-3002', 'EJ-4002', 'EJ-8002', 'EJ-1004']);
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
    standards: [],
    image: { url: 'https://example.invalid/test.png', width: 1600, height: 1200, alt: 'Imagen de prueba', sourceUrl: 'https://example.invalid/source' },
    documents: [{ label: 'Ficha técnica de prueba', url: 'https://example.invalid/ficha.pdf' }],
    isExample: false,
  }]);
  assert.deepEqual(site.productsByBrand('ansell').map(product => product.id), ['test-001']);
  assert.equal(site.getBrand('ansell')?.productCount, 1);
  assert.equal(site.getBrand('3m')?.productCount, 0);
  assert.deepEqual(site.featuredProducts().map(product => product.id), ['test-001']);

  // Nada de lo que se puede imprimir lleva aprobación, fuente, estado ni datos del registro; de la foto, solo la página
  // de donde viene, como image.sourceUrl.
  const data = JSON.parse(JSON.stringify(printable(site)));
  const keys = new Set(allKeys(data));
  for (const key of INTERNAL_KEYS) assert.ok(!keys.has(key), `campo interno publicado: ${key}`);
  assert.deepEqual(keysOutsideImage(data, 'sourceUrl'), []);
  const text = allStrings(data).join(' | ');
  assert.equal(text.split('https://example.invalid/source').length - 1, 1, 'la página de donde viene la foto, una vez');
  assert.doesNotMatch(text, /Revisor de prueba|2026-11-18|example\.invalid\/test(?!\.png)|approved|draft/);
});

test('vista previa con una ficha aprobada: la ficha real va primero y los ejemplos se suman', () => {
  const site = createSiteData({ mode: 'preview', catalog: syntheticCatalog(), brands, exampleProducts: examples });
  assert.deepEqual(site.categories.map(category => category.isDraft), [false, ...Array(9).fill(true)]);
  assert.deepEqual(site.products.map(product => product.id), ['test-001', ...exampleIds]);
  assert.deepEqual(site.products.map(product => product.isExample), [false, ...Array(16).fill(true)]);
  assert.equal(site.getCategory('manos')?.productCount, 4);
  // Los destacados recorren las categorías por turnos: no se agotan en la primera.
  assert.deepEqual(site.featuredProducts(3).map(product => product.code), ['TEST-001/A', 'EJ-2001', 'EJ-3001']);
  assert.deepEqual(site.featuredProducts(11).at(-1)?.code, 'EJ-1001');
});

test('la foto de una ficha llega a la forma pública como { file, alt } o { url, width, height, alt }, sin su fuente ni su uso', () => {
  const fromFile = createSiteData({ mode: 'production', brands, exampleProducts: examples, catalog: syntheticCatalog((_, product) => {
    product.image = { file: 'producto-sintetico-de-prueba.jpg', alt: 'Imagen de prueba', sourceUrl: 'https://example.invalid/source', usageConfirmed: true };
  }) });
  assert.deepEqual(fromFile.getProduct('test-001')?.image, { file: 'producto-sintetico-de-prueba.jpg', alt: 'Imagen de prueba', sourceUrl: 'https://example.invalid/source' });
  const fromUrl = createSiteData({ mode: 'production', brands, exampleProducts: examples, catalog: syntheticCatalog() });
  assert.deepEqual(fromUrl.getProduct('test-001')?.image, { url: 'https://example.invalid/test.png', width: 1600, height: 1200, alt: 'Imagen de prueba', sourceUrl: 'https://example.invalid/source' });
  // Los ejemplos de la vista previa siguen sin foto.
  const preview = createSiteData({ mode: 'preview', brands, exampleProducts: examples, catalog: syntheticCatalog() });
  assert.ok(preview.products.filter(product => product.isExample).every(product => product.image === null));
});

test('una ficha aprobada sin foto llega a la forma pública con image: null y sin datos internos', () => {
  for (const mode of ['production', 'preview']) {
    const site = createSiteData({ mode, brands, exampleProducts: examples, catalog: syntheticCatalog((_, product) => { delete product.image; }) });
    const product = site.getProduct('test-001');
    assert.equal(product?.image, null, mode);
    assert.deepEqual(Object.keys(product ?? {}), PRODUCT_KEYS, mode);
    assert.deepEqual(site.productsByCategory('manos').map(item => item.id)[0], 'test-001', mode);
    const data = JSON.parse(JSON.stringify(printable(site)));
    const keys = new Set(allKeys(data));
    for (const key of INTERNAL_KEYS) assert.ok(!keys.has(key), `${mode}: campo interno publicado: ${key}`);
    assert.doesNotMatch(allStrings(data).join(' | '), /Revisor de prueba|2026-11-18|example\.invalid\/(?:source|test)/, mode);
  }
});

test('las normas de una ficha llegan a la forma pública como su texto, sin su fuente; un ejemplo no tiene normas', () => {
  const site = createSiteData({ mode: 'preview', brands, exampleProducts: examples, catalog: syntheticCatalog((_, product) => {
    product.standards = [
      { text: 'Norma sintética 100', sourceUrl: 'https://example.invalid/norma-a' },
      { text: 'Norma sintética 200 nivel 3', sourceUrl: 'https://example.invalid/norma-b' },
    ];
  }) });
  assert.deepEqual(site.getProduct('test-001')?.standards, ['Norma sintética 100', 'Norma sintética 200 nivel 3']);
  assert.ok(Object.isFrozen(site.getProduct('test-001')?.standards));
  // Las normas se muestran en la ficha; la búsqueda del catálogo no las lee.
  assert.doesNotMatch(searchText(site.getProduct('test-001')), /norma/);
  assert.ok(site.products.filter(product => product.isExample).every(product => product.standards.length === 0));
  const data = JSON.parse(JSON.stringify(printable(site)));
  assert.doesNotMatch(allStrings(data).join(' | '), /norma-a|norma-b/);
  assert.deepEqual(keysOutsideImage(data, 'sourceUrl'), []);
  // Sin normas, la lista está vacía.
  const without = createSiteData({ mode: 'production', brands, exampleProducts: examples, catalog: syntheticCatalog() });
  assert.deepEqual(without.getProduct('test-001')?.standards, []);
});

test('una variante sin código propio llega a la forma pública con el código vacío', () => {
  const site = createSiteData({ mode: 'production', brands, exampleProducts: examples, catalog: syntheticCatalog((_, product) => {
    product.variants = [{ id: 'chica', label: 'Chica' }, { id: 'mediana', label: 'Mediana', manufacturerCode: 'TEST-001/A-M' }, { id: 'grande', label: 'Grande' }];
  }) });
  assert.deepEqual(site.getProduct('test-001')?.variants, [
    { id: 'chica', label: 'Chica', code: '' }, { id: 'mediana', label: 'Mediana', code: 'TEST-001/A-M' }, { id: 'grande', label: 'Grande', code: '' },
  ]);
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
  assert.throws(() => build((_, product) => { product.image.usageConfirmed = false; }), /image\.usageConfirmed: el uso de la foto no está confirmado/);
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
  // Sin ejemplos ni fichas reales, la vista previa solo muestra las categorías.
  const empty = createSiteData({ mode: 'preview', catalog: emptied, brands });
  assert.equal(empty.categories.length, 10);
  assert.deepEqual(empty.products, []);
});

test('los datos devueltos están congelados y no comparten memoria con los archivos de origen', () => {
  const site = emptyPreview();
  assert.ok(Object.isFrozen(site) && Object.isFrozen(site.products) && Object.isFrozen(site.products[0]) && Object.isFrozen(site.products[0].variants[0]));
  assert.ok(Object.isFrozen(site.categories[0]) && Object.isFrozen(site.brands[0].manufacturerLinks) && Object.isFrozen(site.paths.productIds));
  assert.throws(() => { site.products.push(site.products[0]); }, TypeError);
  assert.throws(() => { site.categories[0].name = 'Otro'; }, TypeError);
  // Los resultados de los ayudantes son listas nuevas: se pueden ordenar sin afectar a nadie.
  const list = site.productsByCategory('manos');
  list.pop();
  assert.equal(site.productsByCategory('manos').length, 3);
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
  assert.equal(routes.brandCatalogs, '/marcas/#catalogos');
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

test('aviso de sitio en preparación de la compilación de producción, hasta el lanzamiento', () => {
  assert.equal(DEVELOPMENT_NOTICE, 'Sitio en preparación · Versión inicial para revisión');
  // Nunca se confunde con el de la vista previa: cada compilación lleva solo el suyo.
  assert.ok(!PREVIEW_NOTICE.includes(DEVELOPMENT_NOTICE) && !DEVELOPMENT_NOTICE.includes(PREVIEW_NOTICE));
});

// --- Módulo de entrada que usan las páginas -----------------------------------------------------------------
// Astro define la constante __CATALOG_PREVIEW__ al compilar; aquí se define a mano antes de cargar el módulo.
const EXPORTS = ['DEVELOPMENT_NOTICE', 'EXAMPLE_TAG', 'PREVIEW_NOTICE', 'brands', 'categories', 'featuredProducts', 'getBrand', 'getCategory', 'getProduct', 'getRetiredProduct', 'isPreview', 'mode', 'paths', 'products', 'productsByBrand', 'productsByCategory', 'retiredProducts', 'routes'];

test('site-data.mjs en producción: solo las categorías y las fichas aprobadas, sin ejemplos', async () => {
  globalThis.__CATALOG_PREVIEW__ = false;
  const site = await import('../src/lib/site-data.mjs?produccion');
  assert.deepEqual(Object.keys(site).sort(), EXPORTS);
  assert.equal(site.DEVELOPMENT_NOTICE, DEVELOPMENT_NOTICE);
  assert.equal(site.mode, 'production');
  assert.equal(site.isPreview, false);
  assert.equal(site.brands.length, 15);
  assertRealData(site);
  assert.equal(site.getProduct('ejemplo-orejera'), undefined);
  assert.equal(site.getRetiredProduct(RETIRED_EXAMPLE_ID), undefined);
});

test('site-data.mjs en vista previa: lo de producción, las diez categorías y los dieciséis ejemplos', async () => {
  globalThis.__CATALOG_PREVIEW__ = true;
  const site = await import('../src/lib/site-data.mjs?vista-previa');
  assert.deepEqual(Object.keys(site).sort(), EXPORTS);
  assert.equal(site.mode, 'preview');
  assert.equal(site.isPreview, true);
  assert.equal(site.categories.length, 10);
  assert.equal(site.products.filter(product => product.isExample).length, 16);
  assert.equal(site.brands.length, 15);
  assertRealData(site);
  assert.equal(site.getProduct('ejemplo-orejera')?.code, 'EJ-5001');
  // Los ejemplos de cada categoría, en su orden, después de las fichas reales que haya.
  assert.deepEqual(site.productsByCategory('soldadura').filter(product => product.isExample).map(product => product.code), ['EJ-1101']);
  assert.equal(site.featuredProducts(3).length, 3);
  assert.equal(site.routes.catalog, '/catalogo/');
  assert.deepEqual(site.retiredProducts.filter(product => product.isExample).map(product => [product.id, product.code, product.isExample]), [[RETIRED_EXAMPLE_ID, 'EJ-1002', true]]);
  assert.equal(site.getRetiredProduct(RETIRED_EXAMPLE_ID)?.categoryIds[0], 'manos');
  assert.equal(site.getProduct('ejemplo-guante-de-nitrilo')?.brandName, 'Marca de ejemplo Beta');
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
