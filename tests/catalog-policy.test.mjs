import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { addressProblem, isHttpsAddress, validateCatalog, getPublishedProducts } from '../src/lib/catalog-policy.mjs';
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

test('un producto de una marca retirada del portal se rechaza con su propio mensaje, en cualquier estado', () => {
  const portal = { status: 'retirada', on: '2026-11-23', reason: 'Decisión sintética de prueba.' };
  const withdrawnRegistry = { sources: [{ ...registry.sources[0], portal }, { entity_id: 'otra-marca', name: 'Otra marca sintética', entity_type: 'brand' }] };
  const message = 'products[0]: la marca test-brand está retirada del portal; un producto suyo no se carga.';
  for (const status of STATUSES) {
    assert.deepEqual(validateCatalog(catalogWith({ status }), withdrawnRegistry), [message], status);
  }
  assert.throws(() => getPublishedProducts(fixture('draft'), withdrawnRegistry), /la marca test-brand está retirada del portal/);
  // La misma ficha en otra marca del registro, que no salió del portal, se acepta.
  assert.deepEqual(validateCatalog(catalogWith({ brandId: 'otra-marca' }), withdrawnRegistry), []);
  // Sin la marca de retiro, la marca está en el alcance, como siempre; con otro estado, también (el validador del
  // registro rechaza ese estado aparte).
  assert.deepEqual(validateCatalog(catalogWith({}), registry), []);
  const otherStatus = { sources: [{ ...registry.sources[0], portal: { ...portal, status: 'pausada' } }] };
  assert.deepEqual(validateCatalog(catalogWith({}), otherStatus), []);
});

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
    for (const [url, problem] of [['http://example.invalid/foto.jpg', 'la dirección no empieza con «https://»'], ['/fotos/guante.jpg', 'la dirección no empieza con «https://»'],
      ['https://usuario:clave@example.invalid/foto.jpg', 'la dirección lleva usuario o contraseña antes del servidor'], ['foto.jpg', 'la dirección no empieza con «https://»'], ['', 'falta'], [7, 'no es un texto']]) {
      assert.deepEqual(imageErrors({ ...URL_IMAGE, url }, status), [`products[0].image.url: ${problem}; escribe la dirección https completa de la foto, sin usuario ni contraseña.`], `${status} ${url}`);
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
  // Cada dirección rota con lo que tiene de malo, escrito a mano: el mensaje de cada campo dice eso y qué hacer.
  const broken = [
    ['https:/example.invalid/a.jpg', 'la dirección no empieza con «https://»'], ['https:example.invalid/a.jpg', 'la dirección no empieza con «https://»'],
    [' https://example.invalid/a.jpg', 'la dirección tiene un espacio o un salto de línea al principio'],
    ['https://example.invalid/a.jpg ', 'la dirección tiene un espacio o un salto de línea después de «…/example.invalid/a.jpg»'],
    ['https://exa\nmple.invalid/a.jpg', 'la dirección tiene un espacio o un salto de línea después de «https://exa»'],
    ['https://example.invalid/a b.jpg', 'la dirección tiene un espacio o un salto de línea después de «…/example.invalid/a»'],
    ['https://example.invalid/a\tb.jpg', 'la dirección tiene un espacio o un salto de línea después de «…/example.invalid/a»'],
    ['https://example.invalid/a\u00a0b.jpg', 'la dirección tiene un espacio o un salto de línea después de «…/example.invalid/a»'],
    ['https:\\\\example.invalid\\a.jpg', 'la dirección no empieza con «https://»'], ['https://example.invalid\\a.jpg', 'la dirección lleva una diagonal invertida'],
    ['https:///a.jpg', 'no se puede leer como dirección'], ['https://', 'no se puede leer como dirección'],
    ['https://example.invalid/ficha\u200b-tecnica.pdf', 'la dirección tiene un carácter invisible (U+200B) después de «…/example.invalid/ficha»'],
    ['https://example.invalid:8443/a.pdf', 'la dirección lleva un puerto («:8443»)'],
    ['https://usuario@example.invalid/a.jpg', 'la dirección lleva usuario o contraseña antes del servidor'],
  ];
  const fields = [
    ['image.url', url => ({ image: { ...URL_IMAGE, url } }), problem => `products[0].image.url: ${problem}; escribe la dirección https completa de la foto, sin usuario ni contraseña.`],
    ['image.sourceUrl', sourceUrl => ({ image: { ...FILE_IMAGE, sourceUrl } }), problem => `products[0].image.sourceUrl: ${problem}; escribe la página de donde viene la foto.`],
    ['standards[0].sourceUrl', sourceUrl => ({ standards: [{ text: 'EN 388:2016 4131A', sourceUrl }] }), problem => `products[0].standards[0].sourceUrl: ${problem}; escribe la página o el documento del fabricante donde consta esta norma para este producto.`],
    ['source.url', url => ({ source: { url, checkedOn: '2026-11-18' } }), problem => `products[0].source.url: ${problem}; escribe la página del fabricante donde revisaste los datos de la ficha.`],
    ['documents[0].url', url => ({ documents: [{ label: 'Ficha técnica', url }] }), problem => `products[0].documents[0].url: ${problem}; escribe la dirección completa de la página o del documento del fabricante.`],
  ];
  for (const status of STATUSES) {
    for (const [field, change, message] of fields) {
      for (const [url, problem] of broken) assert.deepEqual(errorsOf({ status, ...change(url) }), [message(problem)], `${status} ${field} ${JSON.stringify(url)}`);
      // Una dirección honesta pasa: con acentos, sin diagonal final, con consulta o fragmento, con el servidor escrito con
      // sus letras o en su forma xn--.
      for (const url of ['https://example.invalid', 'https://example.invalid/catálogo/protección-de-manos', 'https://example.invalid/a.pdf?id=7#pagina=2', 'https://xn--fabricacin-9db.invalid/ficha', 'https://fabricación.invalid/ficha']) {
        assert.deepEqual(errorsOf({ status, ...change(url) }), [], `${status} ${field} ${url}`);
      }
    }
  }
});

test('addressProblem dice en una frase corta qué tiene de malo una dirección, y isHttpsAddress es no tener nada', () => {
  // Lo esperado está escrito a mano, caso por caso.
  const cases = [
    [undefined, 'falta'], ['', 'falta'], [7, 'no es un texto'], [null, 'no es un texto'], [['https://sitio.mx/a'], 'no es un texto'],
    ['http://sitio.mx/a', 'no empieza con «https://»'], ['HTTPS://sitio.mx/a', 'no empieza con «https://»'], ['https:/sitio.mx/a', 'no empieza con «https://»'],
    ['/fotos/guante.jpg', 'no empieza con «https://»'], ['ficha del fabricante', 'no empieza con «https://»'], ['javascript:alert(1)', 'no empieza con «https://»'],
    ['https://sitio.mx/a b', 'tiene un espacio o un salto de línea después de «https://sitio.mx/a»'],
    ['https://sitio.mx/a\r\nb', 'tiene un espacio o un salto de línea después de «https://sitio.mx/a»'],
    ['https://sitio.mx/a\u2028b', 'tiene un espacio o un salto de línea después de «https://sitio.mx/a»'],
    ['\nhttps://sitio.mx/a', 'tiene un espacio o un salto de línea al principio'],
    ['https://sitio.mx/a\\b', 'lleva una diagonal invertida'],
    // Lo que no se ve: lo mismo que no puede llevar el texto de una ficha, dicho igual.
    ['https://sitio.mx/a\u200bb', 'tiene un carácter invisible (U+200B) después de «https://sitio.mx/a»'],
    ['https://si\u200btio.mx/a', 'tiene un carácter invisible (U+200B) después de «https://si»'],
    ['https://si\u00adtio.mx/a', 'tiene un carácter invisible (U+00AD) después de «https://si»'],
    ['https://sitio.mx/a\u202eb', 'tiene un carácter invisible (U+202E) después de «https://sitio.mx/a»'],
    ['https://sitio.mx/a\u0000b', 'tiene un carácter invisible (U+0000) después de «https://sitio.mx/a»'],
    ['https://sitio.mx/a\u007fb', 'tiene un carácter invisible (U+007F) después de «https://sitio.mx/a»'],
    ['https://sitio.mx/a\u0085b', 'tiene un carácter invisible (U+0085) después de «https://sitio.mx/a»'],
    ['https://sitio.mx/a\u200db', 'tiene un carácter invisible (U+200D) después de «https://sitio.mx/a»'],
    ['https://sitio.mx/a\u{E0100}b', 'tiene un carácter invisible (U+E0100) después de «https://sitio.mx/a»'],
    ['\ufeffhttps://sitio.mx/a', 'tiene un carácter invisible (U+FEFF) al principio'],
    ['https://www.fabricante.com.mx/productos/guantes/ficha\u200b.pdf', 'tiene un carácter invisible (U+200B) después de «…/productos/guantes/ficha»'],
    // Usuario o contraseña, también vacíos.
    ['https://usuario:clave@sitio.mx/x', 'lleva usuario o contraseña antes del servidor'], ['https://@sitio.mx/x', 'lleva usuario o contraseña antes del servidor'],
    ['https://:@sitio.mx/x', 'lleva usuario o contraseña antes del servidor'], ['https://usuario@sitio.mx/x', 'lleva usuario o contraseña antes del servidor'],
    // El servidor es el nombre de un sitio.
    ['https://./x', 'el servidor «.» no es el nombre de un sitio'], ['https://../x', 'el servidor «..» no es el nombre de un sitio'],
    ['https://sitio.mx./x', 'el servidor «sitio.mx.» no es el nombre de un sitio'], ['https://sitio..mx/x', 'el servidor «sitio..mx» no es el nombre de un sitio'],
    ['https://localhost/x', 'el servidor «localhost» no es el nombre de un sitio'], ['https://[::1]/x', 'el servidor «[::1]» no es el nombre de un sitio'],
    ['https://[::1]:8443/x', 'el servidor «[::1]» no es el nombre de un sitio'],
    ['https://127.0.0.1/x', 'el servidor «127.0.0.1» no es el nombre de un sitio'], ['https://2130706433/x', 'el servidor «2130706433» no es el nombre de un sitio'],
    ['https://1.2.3/x', 'el servidor «1.2.3» no es el nombre de un sitio'], ['https://si"tio.mx/x', 'el servidor «si"tio.mx» no es el nombre de un sitio'],
    ['https://si_tio.mx/x', 'el servidor «si_tio.mx» no es el nombre de un sitio'], ['https://si%41tio.mx/x', 'el servidor «si%41tio.mx» no es el nombre de un sitio'],
    ['https://sitio.mx:8443/x', 'lleva un puerto («:8443»)'], ['https://sitio.mx:443/x', 'lleva un puerto («:443»)'], ['https://sitio.mx:/x', 'lleva un puerto («:»)'],
    ['https://sitio.123/x', 'no se puede leer como dirección'], ['https://?x', 'no se puede leer como dirección'], ['https://#x', 'no se puede leer como dirección'],
    [`https://sitio.mx/${'a'.repeat(1984)}`, 'mide más de 2,000 caracteres'], [`https://sitio.mx/${'a'.repeat(100000)}`, 'mide más de 2,000 caracteres'],
  ];
  assert.equal(`https://sitio.mx/${'a'.repeat(1983)}`.length, 2000);
  for (const [value, problem] of cases) {
    assert.equal(addressProblem(value), problem, JSON.stringify(value)?.slice(0, 80));
    assert.equal(isHttpsAddress(value), false, JSON.stringify(value)?.slice(0, 80));
  }
  // Una sola lista de lo que no se ve: un carácter que el nombre de una ficha no puede llevar, una dirección tampoco, y
  // lo que el nombre sí puede llevar, la dirección también.
  for (const character of ['\u200b', '\u00ad', '\u202e', '\u0000', '\u007f', '\u0085', '\u200c', '\u200d', '\ufe0f', '\u2060', '\u115f', '\ufffd', '\u{E0100}', 'é', 'ñ', '·', '®', '\u0301']) {
    const code = `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
    assert.equal(addressProblem(`https://sitio.mx/a${character}b`) !== null, errorsOf({ name: `Guante${character}nitrilo` }).length > 0, code);
  }
  // Direcciones honestas, como las publican los fabricantes.
  for (const value of ['https://sitio.mx', 'https://sitio.mx/', `https://sitio.mx/${'a'.repeat(1983)}`, 'https://SITIO.MX/Guante', 'https://www.sub-dominio.sitio.com.mx/x',
    'https://sitio.mx/catálogo/protección-de-manos', 'https://fabricación.mx/ficha', 'https://xn--fabricacin-9db.mx/ficha', 'https://sitio.mx//producto/?producto=13',
    'https://sitio.mx/a%20b?c=1&d=2#e', 'https://sitio.mx/a@b', 'https://sitio.mx/r?u=https://otro.mx/x', 'https://cdn.sitio.mx/is/image/x?wid=2000&hei=2000']) {
    assert.equal(addressProblem(value), null, value);
    assert.equal(isHttpsAddress(value), true, value);
  }
});

test('cada documento se revisa solo: su etiqueta y su dirección, con su posición', () => {
  const ok = { label: 'Ficha técnica', url: 'https://example.invalid/ficha.pdf' };
  for (const status of STATUSES) {
    assert.deepEqual(errorsOf({ status, documents: [ok, { label: 'Hoja de seguridad', url: 'https://example.invalid/hoja.pdf' }] }), [], status);
    assert.deepEqual(errorsOf({ status, documents: [ok, ok, { label: 'Hoja de seguridad', url: 'https://example.invalid/a b.pdf' }] }),
      ['products[0].documents[2].url: la dirección tiene un espacio o un salto de línea después de «…/example.invalid/a»; escribe la dirección completa de la página o del documento del fabricante.'], status);
    assert.deepEqual(errorsOf({ status, documents: [{ label: 'Ficha técnica' }] }),
      ['products[0].documents[0].url: falta; escribe la dirección completa de la página o del documento del fabricante.'], status);
    assert.deepEqual(errorsOf({ status, documents: [ok, { url: 'https://example.invalid/hoja.pdf' }] }),
      ['products[0].documents[1].label: falta; escribe qué es el documento, como «Ficha técnica».'], status);
    assert.deepEqual(errorsOf({ status, documents: [{ label: '  ', url: 'https://example.invalid/hoja.pdf' }] }),
      ['products[0].documents[0].label: está vacío; escribe qué es el documento, como «Ficha técnica».'], status);
    assert.deepEqual(errorsOf({ status, documents: [{ label: 7, url: 7 }] }), [
      'products[0].documents[0].label: debe ser un texto; escribe qué es el documento, como «Ficha técnica».',
      'products[0].documents[0].url: no es un texto; escribe la dirección completa de la página o del documento del fabricante.',
    ], status);
    assert.deepEqual(errorsOf({ status, documents: [ok, null] }), ['products[0].documents[1]: debe ser un objeto con label y url.'], status);
    assert.deepEqual(errorsOf({ status, documents: 'https://example.invalid/ficha.pdf' }), ['products[0].documents: debe ser una lista de documentos, cada uno con label y url.'], status);
  }
});

test('la fuente de una ficha: su dirección y su fecha se dicen por separado', () => {
  for (const status of STATUSES) {
    assert.deepEqual(errorsOf({ status, source: { url: 'https:/example.invalid/a', checkedOn: '2026-11-18' } }),
      ['products[0].source.url: la dirección no empieza con «https://»; escribe la página del fabricante donde revisaste los datos de la ficha.'], status);
    for (const checkedOn of ['18/11/2026', '2026-02-30', '2026-11-18 ', 20261118]) {
      assert.deepEqual(errorsOf({ status, source: { url: 'https://example.invalid/a', checkedOn } }),
        [`products[0].source.checkedOn: ${typeof checkedOn === 'string' ? `«${checkedOn}» no es una fecha` : 'no es un texto'}; escribe el día en que revisaste la fuente como AAAA-MM-DD, por ejemplo 2026-11-18.`], `${status} ${checkedOn}`);
    }
    assert.deepEqual(errorsOf({ status, source: { url: 'https://example.invalid/a' } }),
      ['products[0].source.checkedOn: falta; escribe el día en que revisaste la fuente como AAAA-MM-DD, por ejemplo 2026-11-18.'], status);
    assert.deepEqual(errorsOf({ status, source: { checkedOn: '2026-11-18' } }),
      ['products[0].source.url: falta; escribe la página del fabricante donde revisaste los datos de la ficha.'], status);
    assert.deepEqual(errorsOf({ status, source: { url: 'http://example.invalid/a', checkedOn: 'ayer' } }), [
      'products[0].source.url: la dirección no empieza con «https://»; escribe la página del fabricante donde revisaste los datos de la ficha.',
      'products[0].source.checkedOn: «ayer» no es una fecha; escribe el día en que revisaste la fuente como AAAA-MM-DD, por ejemplo 2026-11-18.',
    ], status);
    assert.deepEqual(errorsOf({ status, source: 'https://example.invalid/a' }), ['products[0].source: debe ser un objeto con url y checkedOn.'], status);
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

test('la dirección de la foto se lee decodificada, como la lee el escáner: la marca excluida escrita con %XX o con «+» tampoco pasa', () => {
  const reserved = 'products[0].image.url: la dirección lleva «ejemplo» o «ej-» con una cifra, que están reservados para los ejemplos de la vista previa; usa otra dirección.';
  const brand = 'products[0].image.url: la dirección lleva la marca excluida, que el sitio no publica; usa otra foto.';
  const [longName, shortName] = EXCLUDED;
  const words = longName.toLowerCase().split(' ');
  const hex = character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`;
  for (const status of STATUSES) {
    for (const url of [`https://fabricante.invalid/${hex(shortName[0])}${shortName.slice(1)}/foto.jpg`, `https://fabricante.invalid/${hex(shortName[0]).replace('%', '%25')}${shortName.slice(1)}/foto.jpg`,
      `https://fabricante.invalid/${words.join('+')}/foto.jpg`, `https://fabricante.invalid/${words.join('%20')}/foto.jpg`, `https://fabricante.invalid/fotos?marca=${words.join('+')}`]) {
      assert.deepEqual(imageErrors({ ...URL_IMAGE, url }, status), [brand], `${status} ${url}`);
    }
    // «ej-» con una cifra donde empieza una palabra, también escrito con %XX.
    for (const url of ['https://fabricante.invalid/fotos/%45J-1001.jpg', 'https://fabricante.invalid/fotos/ej%2D1001.jpg', 'https://fabricante.invalid/ref-ej-2024.jpg', 'https://fabricante.invalid/a.jpg?id=ej-2']) {
      assert.deepEqual(imageErrors({ ...URL_IMAGE, url }, status), [reserved], `${status} ${url}`);
    }
  }
  // «ej-» con una cifra pegado a una letra o a una cifra no empieza una palabra: no es lo reservado.
  for (const url of ['https://fabricante.invalid/reej-2.jpg', 'https://fabricante.invalid/modelo-tej-5.jpg', 'https://fabricante.invalid/x2ej-5.jpg', 'https://fabricante.invalid/guante%2Dnitrilo.jpg']) {
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
      assert.deepEqual(imageErrors({ ...image, sourceUrl: 'http://example.invalid/origen' }, status), ['products[0].image.sourceUrl: la dirección no empieza con «https://»; escribe la página de donde viene la foto.'], status);
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
    for (const [sourceUrl, problem] of [['http://example.invalid/ficha', 'la dirección no empieza con «https://»'], ['ficha del fabricante', 'la dirección no empieza con «https://»'], ['', 'falta'],
      ['https://usuario:clave@example.invalid/ficha', 'la dirección lleva usuario o contraseña antes del servidor']]) {
      assert.deepEqual(errorsOf({ status, standards: [norm('EN 388:2016 4131A', { sourceUrl })] }), [`products[0].standards[0].sourceUrl: ${problem}; ${where}`], `${status} ${sourceUrl}`);
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

test('addressProblem rechaza un segmento «.» o «..» en la ruta, escrito tal cual o con %2e, porque el navegador lo resuelve y abre otra dirección', () => {
  // Lo esperado está escrito a mano, caso por caso: el segmento como está escrito y lo que va antes de él.
  const resolves = (segment, before) => `lleva el segmento «${segment}» en la ruta, después de «${before}», y el navegador lo resuelve y abre otra dirección`;
  for (const [value, problem] of [
    ['https://f.example/a/../b', resolves('..', 'https://f.example/a')], ['https://f.example/a/./b', resolves('.', 'https://f.example/a')],
    ['https://f.example/./a', resolves('.', 'https://f.example')], ['https://f.example/a/%2e%2e/b', resolves('%2e%2e', 'https://f.example/a')],
    ['https://f.example/a/%2E/b', resolves('%2E', 'https://f.example/a')], ['https://f.example/a/.%2e/b', resolves('.%2e', 'https://f.example/a')],
    ['https://f.example/a/%2E./b', resolves('%2E.', 'https://f.example/a')], ['https://f.example/a/b/..', resolves('..', 'https://f.example/a/b')],
    ['https://f.example/a/.', resolves('.', 'https://f.example/a')], ['https://f.example/a/..?x=1', resolves('..', 'https://f.example/a')],
    ['https://www.fabricante.example/recursos/guias/./ficha/', resolves('.', '…/recursos/guias')],
  ]) {
    assert.equal(addressProblem(value), problem, value);
    assert.equal(isHttpsAddress(value), false, value);
  }
  // Un punto que no es un segmento entero, o que va en la consulta o en el fragmento, no se resuelve.
  for (const value of ['https://f.example/a/.b', 'https://f.example/a/b.', 'https://f.example/a/...', 'https://f.example/a/..b', 'https://f.example/a/%2e%2e%2e/b',
    'https://f.example/a?x=/../b', 'https://f.example/a#/../b', 'https://f.example/a/%252e%252e/b', 'https://f.example/.well-known/x']) {
    assert.equal(addressProblem(value), null, value);
  }
});

test('addressProblem rechaza un servidor con un carácter que el navegador lee como otro; un nombre con acentos, su forma xn-- y las mayúsculas pasan', () => {
  // Cada carácter con su código y lo que lee el navegador, escritos a mano.
  for (const [value, server, character, code, read] of [
    ['https://www.\u{1D426}arca.example/x', 'www.\u{1D426}arca.example', '\u{1D426}', 'U+1D426', 'm'],
    ['https://www.\u{1D52A}arca.example/x', 'www.\u{1D52A}arca.example', '\u{1D52A}', 'U+1D52A', 'm'],
    ['https://ſitio.example/x', 'ſitio.example', 'ſ', 'U+017F', 's'],
    ['https://www.ᵐarca.example/x', 'www.ᵐarca.example', 'ᵐ', 'U+1D50', 'm'],
    ['https://cªsa.example/x', 'cªsa.example', 'ª', 'U+00AA', 'a'],
    ['https://sitio¹.example/x', 'sitio¹.example', '¹', 'U+00B9', '1'],
    ['https://ﬁbra.example/x', 'ﬁbra.example', 'ﬁ', 'U+FB01', 'fi'],
    ['https://www.ｍarca.example/x', 'www.ｍarca.example', 'ｍ', 'U+FF4D', 'm'],
    ['https://www.Ｍarca.example/x', 'www.Ｍarca.example', 'Ｍ', 'U+FF2D', 'm'],
  ]) {
    assert.equal(addressProblem(value), `el servidor «${server}» lleva «${character}» (${code}), que el navegador lee como «${read}»`, value);
  }
  for (const value of ['https://diseño.example/x', 'https://café.example/x', 'https://pingüino.example/x', 'https://straße.example/x', 'https://xn--fabricacin-9db.mx/ficha',
    'https://WWW.MARCA.EXAMPLE/X', 'https://DISEÑO.example/x', 'https://diseño.example/x']) {
    assert.equal(addressProblem(value), null, value);
  }
});
