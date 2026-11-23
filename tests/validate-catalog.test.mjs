import test from 'node:test';
import assert from 'node:assert/strict';
import { brandSummary, photoSummary, validateProject, DATA_FILES } from '../scripts/validate-catalog.mjs';
import { emptiedCatalog, loadProjectData, makeTree, png, readText, removeTree } from './helpers.mjs';

// El validador (`npm run validate:catalog`) corrido sobre una carpeta temporal con los datos del repositorio y un
// catálogo y unas fotos sintéticas. Datos exclusivamente de prueba.
const { catalog } = await loadProjectData();
const [registryText, brandsText, examplesText] = await Promise.all([readText(DATA_FILES.registry), readText(DATA_FILES.brands), readText(DATA_FILES.examples)]);

const product = (index, change = {}) => ({
  id: `guante-ficticio-${index}`, brandId: 'ansell', model: `FIC-10${index}`, name: `Guante ficticio ${index} de las pruebas`, categoryIds: ['manos'], status: 'approved',
  description: 'Guante ficticio que solo existe en las pruebas.', saleUnit: 'par',
  characteristics: ['Dato ficticio A', 'Dato ficticio B', 'Dato ficticio C'],
  source: { url: 'https://example.invalid/test', checkedOn: '2026-11-18' },
  approval: { by: 'Revisor de prueba', on: '2026-11-18', supplyConfirmed: true },
  ...change,
});
const fileImage = file => ({ file, alt: 'Foto del guante ficticio', sourceUrl: 'https://example.invalid/origen', usageConfirmed: true });
const urlImage = { url: 'https://example.invalid/foto.jpg', width: 1600, height: 1200, alt: 'Foto del guante ficticio', sourceUrl: 'https://example.invalid/origen', usageConfirmed: true };
/** El catálogo del repositorio vaciado, con «manos» aprobada y las fichas dadas. */
function catalogOf(...products) {
  const copy = emptiedCatalog(catalog);
  copy.categories.find(category => category.id === 'manos').status = 'approved';
  copy.products = products;
  return copy;
}

/** Corre el validador sobre una carpeta temporal con ese catálogo y esas fotos (nombre → contenido). */
async function validate(catalogData, photos = {}) {
  const files = {
    [DATA_FILES.catalog]: JSON.stringify(catalogData), [DATA_FILES.registry]: registryText,
    [DATA_FILES.brands]: brandsText, [DATA_FILES.examples]: examplesText,
  };
  for (const [name, content] of Object.entries(photos)) files[`src/assets/productos/${name}`] = content;
  const root = await makeTree(files);
  try {
    return await validateProject(root);
  } finally {
    await removeTree(root);
  }
}

test('el resumen de fotos se lee como siempre sin fichas aprobadas, o con todas con foto', () => {
  const line = 'Fotos de producto: 0 archivos en src/assets/productos/ y 0 por dirección, todas de fichas aprobadas.';
  assert.deepEqual(photoSummary(catalogOf()), [line]);
  // Los borradores no cuentan, con foto o sin ella.
  assert.deepEqual(photoSummary(catalogOf(product(1, { status: 'draft' }), product(2, { status: 'in_review', image: fileImage('casco-de-prueba.png') }))), [line]);
  assert.deepEqual(photoSummary(catalogOf(product(1, { image: fileImage('guante-de-prueba.jpg') }))), ['Fotos de producto: 1 archivo en src/assets/productos/ y 0 por dirección, todas de fichas aprobadas.']);
  assert.deepEqual(photoSummary(catalogOf(product(1, { image: fileImage('guante-de-prueba.jpg') }), product(2, { image: fileImage('casco-de-prueba.png') }), product(3, { image: urlImage }))),
    ['Fotos de producto: 2 archivos en src/assets/productos/ y 1 por dirección, todas de fichas aprobadas.']);
});

test('con fichas aprobadas sin foto, el resumen dice cuántas y otra línea dice cuáles, en el orden del catálogo', () => {
  assert.deepEqual(photoSummary(catalogOf(product(1, { image: fileImage('guante-de-prueba.jpg') }), product(2))), [
    'Fotos de producto: 1 archivo en src/assets/productos/ y 0 por dirección, todas de fichas aprobadas; 1 ficha aprobada sin foto.',
    'Sin foto (se muestran con el pictograma de su categoría): guante-ficticio-2.',
  ]);
  assert.deepEqual(photoSummary(catalogOf(product(4), product(1, { image: fileImage('guante-de-prueba.jpg') }), product(2, { image: fileImage('casco-de-prueba.png') }), product(3, { image: urlImage }), product(5, { status: 'draft' }), product(6), product(7), product(8))), [
    'Fotos de producto: 2 archivos en src/assets/productos/ y 1 por dirección, todas de fichas aprobadas; 4 fichas aprobadas sin foto.',
    'Sin foto (se muestran con el pictograma de su categoría): guante-ficticio-4, guante-ficticio-6, guante-ficticio-7, guante-ficticio-8.',
  ]);
  // Ninguna con foto.
  assert.deepEqual(photoSummary(catalogOf(product(1), product(2))), [
    'Fotos de producto: 0 archivos en src/assets/productos/ y 0 por dirección, todas de fichas aprobadas; 2 fichas aprobadas sin foto.',
    'Sin foto (se muestran con el pictograma de su categoría): guante-ficticio-1, guante-ficticio-2.',
  ]);
});

test('el validador acepta fichas aprobadas sin foto y lo dice en el resumen, sin error', async () => {
  const { errors, lines } = await validate(catalogOf(product(1), product(2, { image: fileImage('guante-de-prueba.png') }), product(3, { image: urlImage })), { 'guante-de-prueba.png': png(800, 600) });
  assert.deepEqual(errors, []);
  assert.deepEqual(lines.slice(1, 4), [
    'Catálogo: 3 productos / 3 aprobados / 0 retirados con página informativa.',
    'Fotos de producto: 1 archivo en src/assets/productos/ y 1 por dirección, todas de fichas aprobadas; 1 ficha aprobada sin foto.',
    'Sin foto (se muestran con el pictograma de su categoría): guante-ficticio-1.',
  ]);
  assert.equal(lines.at(-1), 'Validación estructural correcta; no acredita disponibilidad ni vuelve a consultar las fuentes.');
});

test('el validador revisa la carpeta de fotos: un archivo suelto o la foto de un borrador detienen la validación', async () => {
  // La compilación copia todo lo que hay en la carpeta: esta revisión es la que lo impide antes de compilar.
  const approved = product(1, { image: fileImage('guante-de-prueba.png') });
  const photo = { 'guante-de-prueba.png': png(800, 600) };
  assert.deepEqual((await validate(catalogOf(approved), photo)).errors, []);
  assert.deepEqual((await validate(catalogOf(approved), { ...photo, 'suelta.png': png(800, 600) })).errors,
    ['src/assets/productos/suelta.png: ninguna ficha aprobada usa este archivo; quita el archivo o aprueba su ficha.']);
  const draft = product(2, { status: 'draft', image: fileImage('casco-de-prueba.png') });
  const result = await validate(catalogOf(approved, draft), { ...photo, 'casco-de-prueba.png': png(800, 600) });
  assert.deepEqual(result.errors, ['src/assets/productos/casco-de-prueba.png: es la foto de products[1] (draft), que no está aprobada; quita el archivo o aprueba su ficha.']);
  assert.deepEqual(result.lines, []);
  // Y la falta del archivo de una ficha aprobada.
  assert.deepEqual((await validate(catalogOf(approved))).errors,
    ['products[0].image.file: «guante-de-prueba.png» no está en src/assets/productos/; agrega la foto con ese nombre exacto (también las mayúsculas y minúsculas) o corrige el nombre.']);
});

test('una foto aprobada sin el uso confirmado detiene la validación con el mensaje que dice qué hacer', async () => {
  const { errors } = await validate(catalogOf(product(1), product(2, { image: { ...urlImage, usageConfirmed: false } })));
  assert.deepEqual(errors, ['products[1].image.usageConfirmed: el uso de la foto no está confirmado. Confírmalo y escribe true, o quita image de la ficha: un producto aprobado se publica sin foto, con el pictograma de su categoría.']);
});

test('el resumen de las marcas dice cuántas tienen algún enlace, cuántas un catálogo y cuántas en PDF', async () => {
  const PDF = 'Catálogo del fabricante (PDF)';
  const ONLINE = 'Catálogo en línea del fabricante';
  const SITE = 'Sitio del fabricante';
  const brand = (...labels) => ({ manufacturerLinks: labels.map(label => ({ label, url: 'https://example.invalid/' })) });
  assert.equal(brandSummary([brand(), brand(SITE), brand(ONLINE), brand(PDF, SITE), brand(PDF, ONLINE, SITE)]),
    'Marcas públicas: 5 / 4 con algún enlace del fabricante / 3 con catálogo del fabricante (2 en PDF).');
  // Con los datos del repositorio, la línea contada a mano desde la tabla de enlaces acordada.
  const { lines } = await validate(catalogOf());
  assert.ok(lines.includes('Marcas públicas: 19 / 16 con algún enlace del fabricante / 14 con catálogo del fabricante (6 en PDF).'), lines.join('\n'));
});
