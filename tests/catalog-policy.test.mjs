import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateCatalog, getPublishedProducts } from '../src/lib/catalog-policy.mjs';
import { MAX_UNIT_LENGTH } from '../src/lib/quote-list.mjs';

// Datos sintéticos exclusivamente de prueba; nunca se importan en el sitio.
const registry = { sources: [{ entity_id: 'test-brand', name: 'Marca sintética de prueba', entity_type: 'brand' }] };
// La marca excluida, como la nombra el registro de investigación: las pruebas no la escriben.
const EXCLUDED = JSON.parse(await readFile(new URL('../research/Sercom_Active_Fuentes_Catalogos.json', import.meta.url), 'utf8')).scope.excluded_entities;
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
  // De la foto se publica la página de donde viene (el crédito bajo la foto), nunca su uso.
  assert.deepEqual(products[0].image, { file: 'producto-sintetico-de-prueba.jpg', alt: 'Imagen de prueba', sourceUrl: 'https://example.invalid/source' });
});

test('bloquea publicación sin evidencia y costos anidados', () => {
  const missingApproval = fixture();
  missingApproval.products[0].approval.supplyConfirmed = false;
  assert.throws(() => getPublishedProducts(missingApproval, registry), /aprobación comercial/);
  const unconfirmedImage = fixture();
  unconfirmedImage.products[0].image.usageConfirmed = false;
  assert.throws(() => getPublishedProducts(unconfirmedImage, registry), /image\.usageConfirmed: el uso de la foto no está confirmado/);
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
  // Lo que no se ve y `cleanQuery` conserva (U+200C, U+200D, un selector de variante): en una ficha tampoco pasa. El
  // mensaje nombra el carácter y dice después de qué texto está, porque quien corrige no puede verlo.
  const hidden = (field, code, where) => `products[0].${field}: tiene un carácter invisible (${code}) ${where}; borra esa parte y escríbela de nuevo.`;
  const hiddenCases = [
    [{ name: 'Guante\u200Dde nitrilo' }, hidden('name', 'U+200D', 'después de «Guante»')],
    [{ name: '\u200DGuante de nitrilo' }, hidden('name', 'U+200D', 'al principio')],
    [{ description: 'Guante de\u200C nitrilo para químicos.' }, hidden('description', 'U+200C', 'después de «Guante de»')],
    [{ characteristics: ['Dato sintético A', 'Marca registrada ®\uFE0F', 'Dato sintético C'] }, hidden('characteristics[1]', 'U+FE0F', 'después de «Marca registrada ®»')],
    [{ variants: [{ id: 'talla-7', label: 'Talla\u200D 7', manufacturerCode: 'TEST-001-7' }] }, hidden('variants[0].label', 'U+200D', 'después de «Talla»')],
    [{ variants: [{ id: 'talla-7', label: 'Talla 7', manufacturerCode: 'TEST-001\u200C-7' }] }, hidden('variants[0].manufacturerCode', 'U+200C', 'después de «TEST-001»')],
    [{ documents: [{ label: 'Ficha técnica\u{E0100}', url: 'https://example.invalid/ficha.pdf' }] }, hidden('documents[0].label', 'U+E0100', 'después de «Ficha técnica»')],
    // De un texto largo se cita solo el final, desde el principio de una palabra; solo se dice el primero que haya.
    [{ description: 'Guante reutilizable de nitrilo para químicos\u200D y solventes\u200C.' }, hidden('description', 'U+200D', 'después de «…de nitrilo para químicos»')],
    [{ description: 'Guante reutilizable con recubrimiento antideslizante\u200D.' }, hidden('description', 'U+200D', 'después de «…antideslizante»')],
  ];
  for (const status of STATUSES) {
    for (const [field, change] of cases) assert.deepEqual(errorsOf({ status, ...change }), [dirty(field)], `${status} ${JSON.stringify(change)}`);
    for (const [change, message] of hiddenCases) assert.deepEqual(errorsOf({ status, ...change }), [message], `${status} ${JSON.stringify(change)}`);
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

test('la unidad de venta mide como máximo 60 caracteres y su primera palabra va en singular y sin signos pegados, en cualquier estado', () => {
  assert.equal(MAX_UNIT_LENGTH, 60);
  for (const unit of ['par', 'pieza', 'caja con 100 piezas', 'Caja con 100 piezas', 'galón', 'PAR', 'tambo de 200 L', 'juego de 3 piezas', 'x'.repeat(MAX_UNIT_LENGTH)]) {
    assert.deepEqual(errorsOf({ saleUnit: unit }), [], unit);
  }
  // Con una palabra de unidad conocida y un signo pegado, la lista no la reconoce y escribiría «3 × par, talla única».
  // Con otra primera palabra, el signo se queda: la lista la escribe tal cual.
  for (const unit of ['par (talla única)', 'caja c/100 piezas', 'tambo, 200 L', 'pza.', 'pieza(s)', 'par/caja', '½ docena']) {
    assert.deepEqual(errorsOf({ saleUnit: unit }), [], unit);
  }
  for (const status of STATUSES) {
    // El mensaje dice solo la palabra que cambia: lo que sigue a la unidad puede concordar con ella («piezas sueltas»).
    for (const [unit, plural, singular] of [
      ['pares', 'pares', 'par'], ['Cajas con 100 piezas', 'Cajas', 'Caja'], ['GALONES', 'GALONES', 'GALÓN'], ['piezas', 'piezas', 'pieza'],
      ['Juegos de 3 piezas', 'Juegos', 'Juego'], ['piezas sueltas', 'piezas', 'pieza'], ['cajas surtidas', 'cajas', 'caja'],
    ]) {
      assert.deepEqual(errorsOf({ status, saleUnit: unit }), [`products[0].saleUnit: la primera palabra va en singular; cambia «${plural}» por «${singular}».`], `${status} ${unit}`);
    }
    for (const [unit, written, alone] of [
      ['par, talla única', 'par,', 'par'], ['pares, talla única', 'pares,', 'par'], ['pares.', 'pares.', 'par'], ['(Caja) con 100 piezas', '(Caja)', 'Caja'],
      ['CAJAS: 100 piezas', 'CAJAS:', 'CAJA'], ['"galones"', '"galones"', 'galón'],
    ]) {
      assert.deepEqual(errorsOf({ status, saleUnit: unit }), [`products[0].saleUnit: la primera palabra lleva un signo pegado («${written}»); escríbela sola y en singular, «${alone}», para que la lista de cotización la escriba según la cantidad.`], `${status} ${unit}`);
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

test('una dirección va escrita completa: https://, un servidor y sin espacios, saltos de línea ni diagonales invertidas, en cada campo que la lleva', () => {
  const broken = ['https:/example.invalid/a.jpg', 'https:example.invalid/a.jpg', ' https://example.invalid/a.jpg', 'https://example.invalid/a.jpg ', 'https://exa\nmple.invalid/a.jpg',
    'https://example.invalid/a b.jpg', 'https://example.invalid/a\tb.jpg', 'https://example.invalid/a\u00a0b.jpg', 'https:\\\\example.invalid\\a.jpg', 'https://example.invalid\\a.jpg', 'https:///a.jpg', 'https://'];
  const fields = [
    ['image.url', url => ({ image: { ...URL_IMAGE, url } }), 'products[0].image.url: debe ser una dirección https completa, sin usuario ni contraseña.'],
    ['image.sourceUrl', sourceUrl => ({ image: { ...FILE_IMAGE, sourceUrl } }), 'products[0].image.sourceUrl: debe ser una dirección https; escribe la página de donde viene la foto.'],
    ['standards[0].sourceUrl', sourceUrl => ({ standards: [{ text: 'EN 388:2016 4131A', sourceUrl }] }), 'products[0].standards[0].sourceUrl: debe ser una dirección https; escribe la página o el documento del fabricante donde consta esta norma para este producto.'],
    ['source.url', url => ({ source: { url, checkedOn: '2026-11-18' } }), 'products[0]: fuente o fecha inválida.'],
    ['documents[0].url', url => ({ documents: [{ label: 'Ficha técnica', url }] }), 'products[0]: documento inválido.'],
  ];
  for (const status of STATUSES) {
    for (const [field, change, message] of fields) {
      for (const url of broken) assert.deepEqual(errorsOf({ status, ...change(url) }), [message], `${status} ${field} ${JSON.stringify(url)}`);
      // Una dirección honesta pasa: con acentos, sin diagonal final, con puerto, consulta o fragmento.
      for (const url of ['https://example.invalid', 'https://example.invalid/catálogo/protección-de-manos', 'https://example.invalid:8443/a.pdf?id=7#pagina=2', 'https://xn--fabricacin-9db.invalid/ficha']) {
        assert.deepEqual(errorsOf({ status, ...change(url) }), [], `${status} ${field} ${url}`);
      }
    }
  }
});

test('la dirección de la foto no lleva lo reservado a los ejemplos ni la marca excluida, en cualquier estado', () => {
  const reserved = 'products[0].image.url: la dirección lleva «ejemplo» o «ej-» con una cifra, que están reservados para los ejemplos de la vista previa; usa otra dirección.';
  const brand = 'products[0].image.url: la dirección lleva la marca excluida, que el sitio no publica; usa otra foto.';
  const [longName, shortName] = EXCLUDED;
  for (const status of STATUSES) {
    for (const url of ['https://fabricante.invalid/ejemplo-guante.jpg', 'https://fabricante.invalid/fotos/EJ-1001.jpg', 'https://ejemplo.invalid/guante.jpg', 'https://fabricante.invalid/a.jpg?id=ej-2']) {
      assert.deepEqual(imageErrors({ ...URL_IMAGE, url }, status), [reserved], `${status} ${url}`);
    }
    for (const url of [`https://${shortName.toLowerCase()}.com.mx/foto.jpg`, `https://fabricante.invalid/${longName.toLowerCase().replace(' ', '-')}/foto.jpg`, `https://fabricante.invalid/fotos/${shortName}_guante.jpg`]) {
      assert.deepEqual(imageErrors({ ...URL_IMAGE, url }, status), [brand], `${status} ${url}`);
    }
  }
  // Direcciones parecidas que no son lo reservado.
  for (const url of ['https://fabricante.invalid/ejemplar.jpg', 'https://fabricante.invalid/casco-ej4.png', 'https://fabricante.invalid/guantes-internos.jpg', 'https://fabricante.invalid/legisla/foto.jpg']) {
    assert.deepEqual(imageErrors({ ...URL_IMAGE, url }), [], url);
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

test('una ficha aprobada puede no tener foto; si la lleva, con el uso confirmado; un borrador acepta las dos', () => {
  // Sin `image`: válida en cualquier estado; la ficha aprobada se publica con el pictograma de su categoría.
  for (const status of STATUSES) assert.deepEqual(errorsOf({ status, image: undefined }), [], status);
  // Con la foto y su uso confirmado: válida (las dos formas).
  for (const image of [FILE_IMAGE, URL_IMAGE]) assert.deepEqual(imageErrors(image, 'approved'), [], JSON.stringify(image));
  // Con la foto y el uso sin confirmar: rechazada, con un mensaje que dice las dos salidas. Nunca se quita en silencio.
  const unconfirmed = 'products[0].image.usageConfirmed: el uso de la foto no está confirmado. Confírmalo y escribe true, o quita image de la ficha: un producto aprobado se publica sin foto, con el pictograma de su categoría.';
  assert.deepEqual(imageErrors({ ...FILE_IMAGE, usageConfirmed: false }, 'approved'), [unconfirmed]);
  assert.deepEqual(imageErrors({ ...URL_IMAGE, usageConfirmed: false }, 'approved'), [unconfirmed]);
  assert.throws(() => getPublishedProducts(catalogWith({ image: { ...URL_IMAGE, usageConfirmed: false } }), registry), /el uso de la foto no está confirmado/);
  // El mensaje nombra la ficha que lo tiene.
  assert.deepEqual(errorsOf({}, { image: undefined }, { image: { ...FILE_IMAGE, usageConfirmed: false } }), [unconfirmed.replace('products[0]', 'products[2]')]);
  // Una ficha que no está aprobada acepta las dos formas sin confirmar, y también sin foto.
  for (const status of ['draft', 'in_review', 'retired']) {
    assert.deepEqual(imageErrors({ ...FILE_IMAGE, usageConfirmed: false }, status), [], status);
    assert.deepEqual(imageErrors({ ...URL_IMAGE, usageConfirmed: false }, status), [], status);
  }
  // Un borrador con la imagen mal formada detiene la validación igual que una ficha aprobada.
  assert.deepEqual(imageErrors({ ...FILE_IMAGE, width: 800, file: 'Foto 1.JPG' }, 'draft'), [
    'products[0].image.width: no va con file; el ancho y el alto se leen del archivo. Quita la clave.',
    'products[0].image.file: «Foto 1.JPG» no es un nombre válido; usa solo minúsculas, cifras y guiones, sin carpeta, con la extensión .jpg, .jpeg, .png o .webp, como «guante-nitrilo-37-175.jpg».',
  ]);
  assert.throws(() => getPublishedProducts(catalogWith({ status: 'draft', image: { ...URL_IMAGE, width: undefined } }), registry), /image\.width: falta/);
});

test('una ficha aprobada sin foto se publica con image: null y sin ningún dato interno', () => {
  const [without, withFile] = getPublishedProducts(catalogWith({ image: undefined }, { image: FILE_IMAGE }), registry);
  assert.equal(without.image, null);
  assert.deepEqual(withFile.image, { file: 'guante-de-prueba-37-175.jpg', alt: 'Guante verde de prueba', sourceUrl: FILE_IMAGE.sourceUrl });
  // Las mismas claves que una ficha con foto: sin `hasPhoto` ni nada parecido.
  assert.deepEqual(Object.keys(without), Object.keys(withFile));
  const text = JSON.stringify(without);
  for (const key of ['approval', 'source', 'status', 'sourceUrl', 'usageConfirmed', 'supplyConfirmed', 'checkedOn']) assert.equal(text.includes(`"${key}"`), false, key);
  assert.doesNotMatch(text, /Revisor de prueba|example\.invalid\/(?:source|test)/);
});

test('lo publicado de la imagen es exactamente { file, alt, sourceUrl } o { url, width, height, alt, sourceUrl }, sin su uso', () => {
  // `sourceUrl` es la dirección del crédito que la ficha muestra bajo la foto; `usageConfirmed` nunca se publica.
  const [fromFile, fromUrl] = getPublishedProducts(catalogWith({ image: FILE_IMAGE }, { image: URL_IMAGE }), registry);
  assert.deepEqual(fromFile.image, { file: 'guante-de-prueba-37-175.jpg', alt: 'Guante verde de prueba', sourceUrl: FILE_IMAGE.sourceUrl });
  assert.deepEqual(fromUrl.image, { url: 'https://example.invalid/fotos/guante.jpg', width: 1600, height: 1200, alt: 'Guante verde de prueba', sourceUrl: URL_IMAGE.sourceUrl });
  for (const product of [fromFile, fromUrl]) assert.equal('usageConfirmed' in product.image, false);
});

// --- Normas (`standards`): cada una con su texto y la página del fabricante donde consta, en cualquier estado -------
const NORM_SOURCE = 'https://example.invalid/ficha-del-fabricante';
const norm = (text, extra = {}) => ({ text, sourceUrl: NORM_SOURCE, ...extra });
const NORMS_12 = Array.from({ length: 12 }, (_, i) => norm(`Norma sintética de prueba ${i + 1}:2020 nivel ${i % 4 + 1}`));

test('las normas son una lista de 1 a 12, cada una con text y sourceUrl y ninguna otra clave, en cualquier estado', () => {
  for (const status of STATUSES) {
    assert.deepEqual(errorsOf({ status, standards: [norm('EN 388:2016 4131A')] }), [], status);
    assert.deepEqual(errorsOf({ status, standards: NORMS_12 }), [], status);
    // Sin normas, la clave no va.
    assert.deepEqual(errorsOf({ status, standards: undefined }), [], status);
    assert.deepEqual(errorsOf({ status, standards: [] }), ['products[0].standards: está vacía; si el producto no tiene normas, quita la clave.'], status);
    assert.deepEqual(errorsOf({ status, standards: [...NORMS_12, norm('Otra norma sintética')] }), ['products[0].standards: tiene 13 normas y el máximo es 12; deja las principales.'], status);
    assert.deepEqual(errorsOf({ status, standards: 'EN 388:2016 4131A' }), ['products[0].standards: debe ser una lista de normas, cada una con text y sourceUrl.'], status);
    assert.deepEqual(errorsOf({ status, standards: ['EN 388:2016 4131A'] }), ['products[0].standards[0]: debe ser un objeto con text y sourceUrl.'], status);
    assert.deepEqual(errorsOf({ status, standards: [norm('EN 388:2016 4131A', { nivel: '4131A' })] }), ['products[0].standards[0].nivel: campo no definido.'], status);
  }
});

test('el texto de una norma va limpio, en una línea, con 80 caracteres como máximo y sin repetirse en la ficha', () => {
  const at = (i, field, message) => `products[0].standards[${i}].${field}: ${message}`;
  for (const status of STATUSES) {
    const cases = [
      [[{ sourceUrl: NORM_SOURCE }], [at(0, 'text', 'falta; escribe la norma como la imprime el fabricante.')]],
      [[norm('')], [at(0, 'text', 'está vacío; escribe la norma como la imprime el fabricante.')]],
      [[norm(388)], [at(0, 'text', 'debe ser un texto.')]],
      // La misma regla del texto limpio que los demás campos de la ficha, con sus mismos mensajes.
      [[norm('EN 388:2016  4131A')], [at(0, 'text', 'tiene espacios de más, un salto de línea o un carácter invisible; escríbelo en una sola línea.')]],
      [[norm('EN 388:2016\n4131A')], [at(0, 'text', 'tiene espacios de más, un salto de línea o un carácter invisible; escríbelo en una sola línea.')]],
      [[norm('EN 388:2016‍ 4131A')], [at(0, 'text', 'tiene un carácter invisible (U+200D) después de «EN 388:2016»; borra esa parte y escríbela de nuevo.')]],
      [[norm('A'.repeat(81))], [at(0, 'text', 'tiene 81 caracteres y el máximo es 80; escribe solo la designación de la norma.'), at(0, 'text', '«AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA» es una sola palabra y no lleva número; escribe la designación completa de la norma como la imprime el fabricante, por ejemplo «EN 388:2016 4131A».')]],
      // Repetida, comparada como compara el sitio: sin acentos, sin mayúsculas.
      [[norm('EN 388:2016 4131A'), norm('Categoría III'), norm('CATEGORIA III')], [at(2, 'text', 'repite la norma de standards[1]; escribe cada norma una vez.')]],
    ];
    for (const [standards, messages] of cases) assert.deepEqual(errorsOf({ status, standards }), messages, `${status} ${JSON.stringify(standards)}`);
  }
  // 80 caracteres sí; se cuentan como se leen.
  assert.deepEqual(errorsOf({ standards: [norm(`${'Á'.repeat(76)} 100`)] }), []);
});

test('cada norma lleva la dirección https del fabricante donde consta', () => {
  const where = 'escribe la página o el documento del fabricante donde consta esta norma para este producto.';
  for (const status of STATUSES) {
    assert.deepEqual(errorsOf({ status, standards: [{ text: 'EN 388:2016 4131A' }] }), [`products[0].standards[0].sourceUrl: falta; ${where}`], status);
    for (const sourceUrl of ['http://example.invalid/ficha', 'ficha del fabricante', '', 'https://usuario:clave@example.invalid/ficha']) {
      assert.deepEqual(errorsOf({ status, standards: [norm('EN 388:2016 4131A', { sourceUrl })] }), [`products[0].standards[0].sourceUrl: debe ser una dirección https; ${where}`], `${status} ${sourceUrl}`);
    }
  }
});

test('lo publicado de las normas es solo su texto, en el orden de los datos; sin normas, una lista vacía', () => {
  const [withNorms, without] = getPublishedProducts(catalogWith({ standards: [norm('EN 388:2016 4131A'), norm('ANSI/ISEA 105-2016 A4')] }, {}), registry);
  assert.deepEqual(withNorms.standards, ['EN 388:2016 4131A', 'ANSI/ISEA 105-2016 A4']);
  assert.deepEqual(without.standards, []);
  // La fuente de una norma no se publica (la de la foto sí: es el crédito bajo la foto).
  assert.equal(JSON.stringify(withNorms.standards).includes('sourceUrl'), false);
  assert.equal(JSON.stringify(withNorms).includes(NORM_SOURCE), false);
});

test('el largo de una norma se cuenta como lo lee una persona: una letra acentuada es un carácter, compuesta o descompuesta, y también uno fuera del plano básico', () => {
  const at = message => [`products[0].standards[0].text: ${message}`];
  const tooLong = 'tiene 81 caracteres y el máximo es 80; escribe solo la designación de la norma.';
  // «EN 1» y el resto de la norma con la letra dada: 80 y 81 caracteres en total.
  const designation = (letter, length) => `EN 1${letter.repeat(length - 4)}`;
  for (const [form, letter] of [['compuesta', 'é'.normalize('NFC')], ['descompuesta', 'é'.normalize('NFD')], ['fuera del plano básico', '\u{1D400}']]) {
    for (const status of STATUSES) {
      assert.deepEqual(errorsOf({ status, standards: [norm(designation(letter, 80))] }), [], `${form} 80 ${status}`);
      assert.deepEqual(errorsOf({ status, standards: [norm(designation(letter, 81))] }), at(tooLong), `${form} 81 ${status}`);
    }
  }
});

test('una norma es una designación: una sola palabra sin número se rechaza; varias palabras, o una con número, no', () => {
  const message = text => [`products[0].standards[0].text: «${text}» es una sola palabra y no lleva número; escribe la designación completa de la norma como la imprime el fabricante, por ejemplo «EN 388:2016 4131A».`];
  for (const status of STATUSES) {
    for (const text of ['ANSI', 'NIOSH', 'CE', 'ANSI/ISEA', 'Ignífugo']) assert.deepEqual(errorsOf({ status, standards: [norm(text)] }), message(text), `${status} ${text}`);
    // La segunda de dos normas también, con su posición.
    assert.deepEqual(errorsOf({ status, standards: [norm('EN 388:2016 4131A'), norm('ASTM')] }), ['products[0].standards[1].text: «ASTM» es una sola palabra y no lleva número; escribe la designación completa de la norma como la imprime el fabricante, por ejemplo «EN 388:2016 4131A».'], status);
    for (const text of ['Aprobado por NIOSH', 'Norma sintética', 'Z87', 'EN388', 'Categoría III', 'Clase E']) assert.deepEqual(errorsOf({ status, standards: [norm(text)] }), [], `${status} ${text}`);
  }
});
