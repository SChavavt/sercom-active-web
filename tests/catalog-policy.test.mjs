import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCatalog, getPublishedProducts } from '../src/lib/catalog-policy.mjs';
import { MAX_UNIT_LENGTH } from '../src/lib/quote-list.mjs';

// Datos sintéticos exclusivamente de prueba; nunca se importan en el sitio.
const registry = { sources: [{ entity_id: 'test-brand', name: 'Marca sintética de prueba', entity_type: 'brand' }] };
function fixture(status = 'approved') {
  return { schemaVersion: 1, categories: [{ id: 'test-category', name: 'Prueba', status: 'approved' }], products: [{
    id: 'test-001', brandId: 'test-brand', model: 'TEST-001', name: 'Producto sintético de prueba',
    categoryIds: ['test-category'], status, description: 'No es un artículo comercial.', saleUnit: 'pieza',
    characteristics: ['Dato sintético A', 'Dato sintético B', 'Dato sintético C'],
    image: { file: 'producto-sintetico-de-prueba.jpg', alt: 'Imagen de prueba', sourceUrl: 'https://example.invalid/source', usageConfirmed: true },
    source: { url: 'https://example.invalid/test', checkedOn: '2026-11-18' },
    approval: { by: 'Revisor de prueba', on: '2026-11-18', supplyConfirmed: true },
  }] };
}

test('los borradores no salen al catálogo y la aprobación interna no se exporta', () => {
  assert.deepEqual(getPublishedProducts(fixture('draft'), registry), []);
  const products = getPublishedProducts(fixture(), registry);
  assert.equal(products.length, 1);
  assert.equal('approval' in products[0], false);
  assert.equal('usageConfirmed' in products[0].image, false);
});

test('bloquea publicación sin evidencia y costos anidados', () => {
  const missingApproval = fixture();
  missingApproval.products[0].approval.supplyConfirmed = false;
  assert.throws(() => getPublishedProducts(missingApproval, registry), /aprobación comercial/);
  const missingImage = fixture();
  missingImage.products[0].image.usageConfirmed = false;
  assert.throws(() => getPublishedProducts(missingImage, registry), /imagen verificable/);
  const privateCost = fixture();
  privateCost.products[0].variants = [{ id: 'v-1', label: 'Prueba', manufacturerCode: 'V-1', costo: 100 }];
  assert.throws(() => getPublishedProducts(privateCost, registry), /campo comercial/);
});

test('rechaza marcas excluidas, proveedores como marcas y modelos duplicados', () => {
  const excluded = fixture();
  excluded.products[0].name = 'Guantes Internacionales GISA';
  assert.throws(() => getPublishedProducts(excluded, registry), /marca excluida/);
  const supplierRegistry = { sources: [{ entity_id: 'test-brand', name: 'Proveedor de prueba', entity_type: 'supplier' }] };
  assert.ok(validateCatalog(fixture(), supplierRegistry).some(e => e.includes('proveedor')));
  const duplicates = fixture();
  duplicates.products.push({ ...duplicates.products[0], id: 'test-002' });
  assert.throws(() => getPublishedProducts(duplicates, registry), /modelo vacío o duplicado/);
});

// --- Reglas de forma: valen en cualquier estado, porque los candidatos se cargan como borradores -------------------
const STATUSES = ['draft', 'in_review', 'approved', 'retired'];
/** Un catálogo con varias fichas sintéticas completas, cada una con su id, modelo y nombre propios y los cambios dados. */
function catalogWith(...changes) {
  const catalog = fixture();
  const base = catalog.products[0];
  catalog.products = changes.map((change, index) => ({
    ...structuredClone(base), id: `test-00${index + 1}`, model: `TEST-00${index + 1}`, name: `Producto sintético de prueba ${index + 1}`, ...change,
  }));
  return catalog;
}
const errorsOf = (...changes) => validateCatalog(catalogWith(...changes), registry);

test('dos productos con el mismo nombre se rechazan, también con otros acentos, mayúsculas o espacios, en cualquier estado', () => {
  assert.deepEqual(errorsOf({}, {}), []);
  const repeated = 'products[1].name: repite el nombre de products[0]; cada producto necesita un nombre propio.';
  for (const [first, second] of [
    ['Guante Solvex', 'guante SOLVEX'], ['Guante de nitrilo para químicos', 'Guante de nitrilo para quimicos'],
    ['Guante de nitrilo', 'Guante de nitrilo'], ['Señal de piso mojado', 'SENAL DE PISO MOJADO'],
  ]) assert.deepEqual(errorsOf({ name: first }, { name: second }), [repeated], `${first} / ${second}`);
  // Cada estado: un borrador, una ficha en revisión, una aprobada o una retirada no pueden repetir un nombre.
  for (const status of STATUSES) {
    assert.deepEqual(errorsOf({ name: 'Guante Solvex', status: 'draft' }, { name: 'guante solvex', status }), [repeated], status);
  }
  // El mensaje nombra la primera ficha que usa el nombre.
  assert.deepEqual(errorsOf({ name: 'Casco' }, { name: 'Guante' }, { name: 'CASCO' }), ['products[2].name: repite el nombre de products[0]; cada producto necesita un nombre propio.']);
  // Nombres parecidos que no son el mismo.
  assert.deepEqual(errorsOf({ name: 'Guante Solvex 37-175' }, { name: 'Guante Solvex 37-176' }), []);
});

test('dos variantes de un producto con la misma etiqueta se rechazan; en productos distintos pueden repetirse', () => {
  const sizes = (...labels) => labels.map((label, index) => ({ id: `v-${index + 1}`, label }));
  assert.deepEqual(errorsOf({ variants: sizes('Talla 8', 'Talla 9') }), []);
  for (const status of STATUSES) {
    assert.deepEqual(errorsOf({ status, variants: sizes('Talla 8', 'Talla 9', 'talla  8'.replace('  ', ' ')) }),
      ['products[0].variants[2].label: repite la etiqueta de variants[0]; cada variante necesita una etiqueta propia.'], status);
  }
  assert.deepEqual(errorsOf({ variants: sizes('Única', 'unica') }), ['products[0].variants[1].label: repite la etiqueta de variants[0]; cada variante necesita una etiqueta propia.']);
  // La misma talla en dos productos distintos no es un problema.
  assert.deepEqual(errorsOf({ variants: sizes('Talla 8') }, { variants: sizes('Talla 8') }), []);
});

test('una variante puede no tener código propio; si lleva la clave, el código no puede ir vacío', () => {
  // Tallas sin código, con código y mezcladas: las tres formas son válidas en cualquier estado.
  for (const status of STATUSES) {
    assert.deepEqual(errorsOf({ status, variants: [{ id: 'talla-7', label: 'Talla 7' }, { id: 'talla-8', label: 'Talla 8' }] }), [], status);
    assert.deepEqual(errorsOf({ status, variants: [{ id: 'chica', label: 'Chica' }, { id: 'mediana', label: 'Mediana', manufacturerCode: 'TEST-001-M' }, { id: 'grande', label: 'Grande' }] }), [], status);
  }
  // Lo publicado no lleva la clave cuando la variante no tiene código.
  const [published] = getPublishedProducts(catalogWith({ variants: [{ id: 'talla-7', label: 'Talla 7' }, { id: 'talla-8', label: 'Talla 8', manufacturerCode: 'TEST-001-8' }] }), registry);
  assert.deepEqual(published.variants, [{ id: 'talla-7', label: 'Talla 7' }, { id: 'talla-8', label: 'Talla 8', manufacturerCode: 'TEST-001-8' }]);
  // Una clave vacía no significa «sin código»: se escribe el código o se quita la clave.
  const empty = 'products[0].variants[0].manufacturerCode: está vacío; escribe el código o, si la variante no tiene código propio, quita la clave.';
  for (const status of STATUSES) {
    for (const code of ['', '   ']) assert.deepEqual(errorsOf({ status, variants: [{ id: 'talla-7', label: 'Talla 7', manufacturerCode: code }] }), [empty], `${status} ${JSON.stringify(code)}`);
  }
  for (const code of [null, 7, ['TEST-001-7']]) {
    assert.deepEqual(errorsOf({ variants: [{ id: 'talla-7', label: 'Talla 7', manufacturerCode: code }] }), ['products[0].variants[0].manufacturerCode: debe ser un texto.'], JSON.stringify(code));
  }
  // La etiqueta sigue siendo obligatoria.
  assert.deepEqual(errorsOf({ status: 'draft', variants: [{ id: 'talla-7', label: '' }] }), ['products[0]: variante incompleta o duplicada.']);
});

test('una variante, un documento, la fuente, la aprobación y la imagen no admiten claves desconocidas, en cualquier estado', () => {
  for (const status of STATUSES) {
    // Una clave mal escrita diría en silencio «sin código».
    assert.deepEqual(errorsOf({ status, variants: [{ id: 'talla-7', label: 'Talla 7', manufacturerCodes: 'TEST-001-7' }] }), ['products[0].variants[0].manufacturerCodes: campo no definido.'], status);
    assert.deepEqual(errorsOf({ status, documents: [{ label: 'Ficha técnica', url: 'https://example.invalid/ficha.pdf', idioma: 'es' }] }), ['products[0].documents[0].idioma: campo no definido.'], status);
    assert.deepEqual(errorsOf({ status, source: { url: 'https://example.invalid/test', checkedOn: '2026-11-18', nota: 'x' } }), ['products[0].source.nota: campo no definido.'], status);
    assert.deepEqual(errorsOf({ status, approval: { by: 'Revisor de prueba', on: '2026-11-18', supplyConfirmed: true, comentario: 'x' } }), ['products[0].approval.comentario: campo no definido.'], status);
  }
  // Un campo comercial dentro de una variante conserva su propio mensaje.
  const errors = errorsOf({ variants: [{ id: 'v-1', label: 'Prueba', manufacturerCode: 'V-1', costo: 100 }] });
  assert.ok(errors.includes('catalog.products.0.variants.0.costo: campo comercial no permitido en este catálogo.'), errors.join('\n'));
  // La imagen tampoco (sus dos formas, abajo).
  for (const status of STATUSES) assert.deepEqual(errorsOf({ status, image: { ...fixture().products[0].image, ancho: 800 } }), ['products[0].image.ancho: campo no definido.'], status);
});

test('el texto de una ficha va limpio y en una sola línea, en cualquier estado', () => {
  const dirty = field => `products[0].${field}: tiene espacios de más, un salto de línea o un carácter invisible; escríbelo en una sola línea.`;
  const cases = [
    ['name', { name: 'Guante de nitrilo' }],
    ['name', { name: 'Guante de nitrilo ' }],
    ['model', { model: 'TEST​001' }],
    ['description', { description: 'Guante reutilizable.\nPara químicos.' }],
    ['description', { description: 'Guante  reutilizable.' }],
    ['saleUnit', { saleUnit: ' par' }],
    ['characteristics[1]', { characteristics: ['Dato sintético A', 'Dato\tsintético B', 'Dato sintético C'] }],
    ['characteristics[2]', { characteristics: ['Dato sintético A', 'Dato sintético B', 'Dato sintético­C'] }],
    ['variants[0].label', { variants: [{ id: 'talla-7', label: 'Talla 7' }] }],
    ['variants[0].manufacturerCode', { variants: [{ id: 'talla-7', label: 'Talla 7', manufacturerCode: 'TEST-001-7\r\n' }] }],
    ['documents[0].label', { documents: [{ label: 'Ficha⁠técnica', url: 'https://example.invalid/ficha.pdf' }] }],
  ];
  for (const status of STATUSES) {
    for (const [field, change] of cases) assert.deepEqual(errorsOf({ status, ...change }), [dirty(field)], `${status} ${JSON.stringify(change)}`);
  }
  // Texto limpio con acentos, «ñ», comillas, fracciones, guiones y símbolos.
  assert.deepEqual(errorsOf({ name: 'Guante «Señal» talla 9½ — 33 cm', description: 'Nitrilo/algodón, 0.125 mm; uso: químicos.', characteristics: ['Puño tipo guantelete', 'Longitud de 330 mm', 'Forro flocado de algodón'] }), []);
  // Vacío en un borrador: se escribe o se quita. En una ficha aprobada lo dice la regla de lo que falta, una sola vez.
  assert.deepEqual(errorsOf({ status: 'draft', description: '' }), ['products[0].description: está vacío; escríbelo o quítalo.']);
  assert.deepEqual(errorsOf({ status: 'draft', saleUnit: ' ' }), ['products[0].saleUnit: está vacío; escríbelo o quítalo.']);
  assert.deepEqual(errorsOf({ status: 'draft', characteristics: ['Dato sintético A', ''] }), ['products[0].characteristics[1]: está vacío; escríbelo o quítalo.']);
  assert.deepEqual(errorsOf({ status: 'draft', characteristics: 'Dato sintético A' }), ['products[0].characteristics: debe ser una lista de textos.']);
  assert.deepEqual(errorsOf({ status: 'draft', description: 5 }), ['products[0].description: debe ser un texto.']);
  assert.deepEqual(errorsOf({ status: 'approved', description: '' }), ['products[0]: falta descripción o unidad de venta.']);
  // Un borrador puede no tener esos campos.
  assert.deepEqual(errorsOf({ status: 'draft', description: undefined, saleUnit: undefined, characteristics: undefined }), []);
});

test('la unidad de venta mide como máximo 60 caracteres y su primera palabra va en singular, en cualquier estado', () => {
  assert.equal(MAX_UNIT_LENGTH, 60);
  for (const unit of ['par', 'pieza', 'caja con 100 piezas', 'Caja con 100 piezas', 'galón', 'PAR', 'tambo de 200 L', 'juego de 3 piezas', 'x'.repeat(MAX_UNIT_LENGTH)]) {
    assert.deepEqual(errorsOf({ saleUnit: unit }), [], unit);
  }
  for (const status of STATUSES) {
    for (const [unit, singular] of [['pares', 'par'], ['Cajas con 100 piezas', 'Caja con 100 piezas'], ['GALONES', 'GALÓN'], ['piezas', 'pieza'], ['Juegos de 3 piezas', 'Juego de 3 piezas']]) {
      assert.deepEqual(errorsOf({ status, saleUnit: unit }), [`products[0].saleUnit: la primera palabra va en singular; escribe «${singular}».`], `${status} ${unit}`);
    }
    const long = `caja con 100 piezas ${'x'.repeat(MAX_UNIT_LENGTH - 19)}`;
    assert.equal([...long].length, 61);
    assert.deepEqual(errorsOf({ status, saleUnit: long }), ['products[0].saleUnit: tiene 61 caracteres y el máximo es 60; escribe una unidad corta, como «par» o «caja con 100 piezas».'], status);
    // Una sola palabra más larga que el máximo: un mensaje, el del largo, y ninguno sobre el singular.
    assert.deepEqual(errorsOf({ status, saleUnit: 'x'.repeat(MAX_UNIT_LENGTH + 1) }), ['products[0].saleUnit: tiene 61 caracteres y el máximo es 60; escribe una unidad corta, como «par» o «caja con 100 piezas».'], status);
    // Larga y además en plural: también solo el del largo; al acortarla, el validador dirá lo del singular.
    assert.deepEqual(errorsOf({ status, saleUnit: `cajas con 100 piezas ${'x'.repeat(MAX_UNIT_LENGTH - 20)}` }), ['products[0].saleUnit: tiene 61 caracteres y el máximo es 60; escribe una unidad corta, como «par» o «caja con 100 piezas».'], status);
  }
});

// --- La fotografía: un archivo de src/assets/productos/ o una dirección con su ancho y alto -------------------------
const FILE_IMAGE = { file: 'guante-de-prueba-37-175.jpg', alt: 'Guante verde de prueba', sourceUrl: 'https://example.invalid/origen', usageConfirmed: true };
const URL_IMAGE = { url: 'https://example.invalid/fotos/guante.jpg', width: 1600, height: 1200, alt: 'Guante verde de prueba', sourceUrl: 'https://example.invalid/origen', usageConfirmed: true };
const imageErrors = (image, status = 'draft') => errorsOf({ status, image });

test('la imagen es un archivo o una dirección con ancho y alto, nunca las dos ni ninguna, en cualquier estado', () => {
  for (const status of STATUSES) {
    assert.deepEqual(imageErrors(FILE_IMAGE, status), [], status);
    assert.deepEqual(imageErrors(URL_IMAGE, status), [], status);
    for (const extension of ['jpg', 'jpeg', 'png', 'webp']) assert.deepEqual(imageErrors({ ...FILE_IMAGE, file: `guante-de-prueba.${extension}` }, status), [], extension);
    assert.deepEqual(imageErrors({ ...FILE_IMAGE, url: URL_IMAGE.url }, status), ['products[0].image: lleva file y url; usa solo uno: file para una foto guardada en src/assets/productos/ o url para una dirección.'], status);
    const { file, ...neither } = FILE_IMAGE;
    assert.deepEqual(imageErrors(neither, status), ['products[0].image: falta file o url; escribe el nombre del archivo de src/assets/productos/ (file) o la dirección de la foto (url).'], status);
    for (const image of [null, 'guante.jpg', [FILE_IMAGE], 7]) {
      assert.deepEqual(imageErrors(image, status), ['products[0].image: debe ser un objeto con file o url, alt, sourceUrl y usageConfirmed.'], `${status} ${JSON.stringify(image)}`);
    }
  }
});

test('cada forma de la imagen acepta solo sus claves: el ancho y el alto de un archivo se leen del archivo', () => {
  for (const status of STATUSES) {
    assert.deepEqual(imageErrors({ ...FILE_IMAGE, width: 1600 }, status), ['products[0].image.width: no va con file; el ancho y el alto se leen del archivo. Quita la clave.'], status);
    assert.deepEqual(imageErrors({ ...FILE_IMAGE, width: 1600, height: 1200 }, status), [
      'products[0].image.width: no va con file; el ancho y el alto se leen del archivo. Quita la clave.',
      'products[0].image.height: no va con file; el ancho y el alto se leen del archivo. Quita la clave.',
    ], status);
    assert.deepEqual(imageErrors({ ...FILE_IMAGE, credito: 'Fabricante' }, status), ['products[0].image.credito: campo no definido.'], status);
    assert.deepEqual(imageErrors({ ...URL_IMAGE, ancho: 1600 }, status), ['products[0].image.ancho: campo no definido.'], status);
  }
});

test('el nombre del archivo: sin carpeta, en minúsculas, cifras y guiones, con extensión de imagen, sin lo reservado ni la marca excluida', () => {
  const invalid = file => `products[0].image.file: «${file}» no es un nombre válido; usa solo minúsculas, cifras y guiones, sin carpeta, con la extensión .jpg, .jpeg, .png o .webp, como «guante-nitrilo-37-175.jpg».`;
  for (const status of STATUSES) {
    for (const file of ['Guante.jpg', 'guante.JPG', 'fotos/guante.jpg', '../guante.jpg', 'guante de nitrilo.jpg', 'guante_nitrilo.jpg', 'guante.gif', 'guante.svg', 'guante', '.jpg', '-guante.jpg', 'guante-.jpg', 'guante--nitrilo.jpg', 'guante.jpg.png ', 'guanté.jpg', '']) {
      assert.deepEqual(imageErrors({ ...FILE_IMAGE, file }, status), [invalid(file)], `${status} ${file}`);
    }
    assert.deepEqual(imageErrors({ ...FILE_IMAGE, file: 7 }, status), ['products[0].image.file: debe ser un nombre de archivo; usa solo minúsculas, cifras y guiones, sin carpeta, con la extensión .jpg, .jpeg, .png o .webp, como «guante-nitrilo-37-175.jpg».'], status);
    const reserved = 'products[0].image.file: el nombre lleva «ejemplo» o «ej-» con una cifra, que están reservados para los ejemplos de la vista previa; usa otro nombre.';
    for (const file of ['guante-ejemplo.jpg', 'ejemplo-guante.png', 'ej-1001.jpg', 'guante-ej-200.webp']) assert.deepEqual(imageErrors({ ...FILE_IMAGE, file }, status), [reserved], `${status} ${file}`);
    for (const file of ['gisa-guante.jpg', 'guante-gisa.png', 'guantes-internacionales-1.jpg', 'guante-internacionales.webp']) {
      assert.deepEqual(imageErrors({ ...FILE_IMAGE, file }, status), ['products[0].image.file: marca excluida.'], `${status} ${file}`);
    }
  }
  // Nombres parecidos que no son lo reservado.
  for (const file of ['guante-reflejante.jpg', 'casco-ej4.png', 'guantes-internos.jpg', 'tapon-gisado.jpg']) assert.deepEqual(imageErrors({ ...FILE_IMAGE, file }), [], file);
});

test('la dirección es https y el ancho y el alto son enteros de 1 a 10000', () => {
  for (const status of STATUSES) {
    for (const url of ['http://example.invalid/foto.jpg', '/fotos/guante.jpg', 'https://usuario:clave@example.invalid/foto.jpg', 'foto.jpg', '', 7]) {
      assert.deepEqual(imageErrors({ ...URL_IMAGE, url }, status), ['products[0].image.url: debe ser una dirección https completa, sin usuario ni contraseña.'], `${status} ${url}`);
    }
    const { height, ...noHeight } = URL_IMAGE;
    assert.deepEqual(imageErrors(noHeight, status), ['products[0].image.height: falta; con url se escribe el alto de la foto en píxeles.'], status);
    const { width, ...noWidth } = URL_IMAGE;
    assert.deepEqual(imageErrors(noWidth, status), ['products[0].image.width: falta; con url se escribe el ancho de la foto en píxeles.'], status);
    for (const value of [0, -1, 1.5, 10001, '1600', null, Number.NaN]) {
      assert.deepEqual(imageErrors({ ...URL_IMAGE, width: value }, status), ['products[0].image.width: debe ser un número entero de 1 a 10000, el ancho de la foto en píxeles.'], `${status} ${value}`);
      assert.deepEqual(imageErrors({ ...URL_IMAGE, height: value }, status), ['products[0].image.height: debe ser un número entero de 1 a 10000, el alto de la foto en píxeles.'], `${status} ${value}`);
    }
    for (const value of [1, 10000]) assert.deepEqual(imageErrors({ ...URL_IMAGE, width: value, height: value }, status), [], `${status} ${value}`);
  }
});

test('el texto alternativo va limpio, en una línea y con 160 caracteres como máximo; la fuente es https y el uso, un booleano', () => {
  for (const status of STATUSES) {
    for (const image of [FILE_IMAGE, URL_IMAGE]) {
      const { alt, ...noAlt } = image;
      assert.deepEqual(imageErrors(noAlt, status), ['products[0].image.alt: falta; describe la foto en una línea.'], status);
      assert.deepEqual(imageErrors({ ...image, alt: '' }, status), ['products[0].image.alt: está vacío; describe la foto en una línea.'], status);
      assert.deepEqual(imageErrors({ ...image, alt: 7 }, status), ['products[0].image.alt: debe ser un texto.'], status);
      for (const dirty of ['Guante verde ', 'Guante\nverde', 'Guante  verde', 'Guante\u200bverde']) {
        assert.deepEqual(imageErrors({ ...image, alt: dirty }, status), ['products[0].image.alt: tiene espacios de más, un salto de línea o un carácter invisible; escríbelo en una sola línea.'], `${status} ${dirty}`);
      }
      assert.deepEqual(imageErrors({ ...image, alt: 'á'.repeat(160) }, status), [], status);
      assert.deepEqual(imageErrors({ ...image, alt: 'á'.repeat(161) }, status), ['products[0].image.alt: tiene 161 caracteres y el máximo es 160; describe la foto en una línea más corta.'], status);
      const { sourceUrl, ...noSource } = image;
      assert.deepEqual(imageErrors(noSource, status), ['products[0].image.sourceUrl: falta; escribe la página de donde viene la foto.'], status);
      assert.deepEqual(imageErrors({ ...image, sourceUrl: 'http://example.invalid/origen' }, status), ['products[0].image.sourceUrl: debe ser una dirección https; escribe la página de donde viene la foto.'], status);
      const { usageConfirmed, ...noUsage } = image;
      for (const value of [undefined, 'si', 1]) {
        assert.deepEqual(imageErrors(value === undefined ? noUsage : { ...image, usageConfirmed: value }, status), ['products[0].image.usageConfirmed: debe ser true o false; true solo con el uso de la foto confirmado.'], `${status} ${value}`);
      }
    }
  }
});

test('solo una ficha aprobada exige imagen, y con el uso confirmado; un borrador puede no tenerla o tenerla sin confirmar', () => {
  const missing = 'products[0]: falta imagen verificable con uso confirmado.';
  assert.deepEqual(errorsOf({ status: 'approved', image: undefined }), [missing]);
  assert.deepEqual(imageErrors({ ...FILE_IMAGE, usageConfirmed: false }, 'approved'), [missing]);
  assert.deepEqual(imageErrors({ ...URL_IMAGE, usageConfirmed: false }, 'approved'), [missing]);
  for (const status of ['draft', 'in_review', 'retired']) {
    assert.deepEqual(errorsOf({ status, image: undefined }), [], status);
    assert.deepEqual(imageErrors({ ...FILE_IMAGE, usageConfirmed: false }, status), [], status);
  }
  // Un borrador con la imagen mal formada detiene la validación igual que una ficha aprobada.
  assert.deepEqual(imageErrors({ ...FILE_IMAGE, width: 800, file: 'Foto 1.JPG' }, 'draft'), [
    'products[0].image.width: no va con file; el ancho y el alto se leen del archivo. Quita la clave.',
    'products[0].image.file: «Foto 1.JPG» no es un nombre válido; usa solo minúsculas, cifras y guiones, sin carpeta, con la extensión .jpg, .jpeg, .png o .webp, como «guante-nitrilo-37-175.jpg».',
  ]);
  assert.throws(() => getPublishedProducts(catalogWith({ status: 'draft', image: { ...URL_IMAGE, width: undefined } }), registry), /image\.width: falta/);
});

test('lo publicado de la imagen es exactamente { file, alt } o { url, width, height, alt }, sin su fuente ni su uso', () => {
  const [fromFile, fromUrl] = getPublishedProducts(catalogWith({ image: FILE_IMAGE }, { image: URL_IMAGE }), registry);
  assert.deepEqual(fromFile.image, { file: 'guante-de-prueba-37-175.jpg', alt: 'Guante verde de prueba' });
  assert.deepEqual(fromUrl.image, { url: 'https://example.invalid/fotos/guante.jpg', width: 1600, height: 1200, alt: 'Guante verde de prueba' });
  for (const product of [fromFile, fromUrl]) {
    assert.equal('sourceUrl' in product.image, false);
    assert.equal('usageConfirmed' in product.image, false);
  }
});
