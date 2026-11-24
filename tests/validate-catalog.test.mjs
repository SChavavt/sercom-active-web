import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { brandSummary, photoSummary, registrySummary, validateProject, DATA_FILES } from '../scripts/validate-catalog.mjs';
import { photoSourceErrors } from '../src/lib/catalog-policy.mjs';
import { emptiedCatalog, loadProjectData, makeTree, png, readText, removeTree, ROOT } from './helpers.mjs';

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
// La foto de una ficha aprobada viene del sitio de su fabricante (photoSourceErrors): las fichas ficticias son de
// Ansell y su foto viene de una página inventada en el servidor de su sitio en el registro.
const ANSELL_SITE = JSON.parse(registryText).sources.find(source => source.entity_id === 'ansell').resources.find(resource => resource.type === 'web').url;
const PHOTO_PAGE = new URL('/pagina-ficticia-de-la-foto', ANSELL_SITE).href;
const fileImage = file => ({ file, alt: 'Foto del guante ficticio', sourceUrl: PHOTO_PAGE, usageConfirmed: true });
const urlImage = { url: 'https://example.invalid/foto.jpg', width: 1600, height: 1200, alt: 'Foto del guante ficticio', sourceUrl: PHOTO_PAGE, usageConfirmed: true };
/** El catálogo del repositorio vaciado, con «manos» aprobada y las fichas dadas. */
function catalogOf(...products) {
  const copy = emptiedCatalog(catalog);
  copy.categories.find(category => category.id === 'manos').status = 'approved';
  copy.products = products;
  return copy;
}

/**
 * Corre el validador sobre una carpeta temporal con ese catálogo y esas fotos (nombre → contenido) y, si se dan, ese
 * registro y esa lista de marcas en lugar de los del repositorio; las demás opciones pasan al validador.
 */
async function validate(catalogData, photos = {}, { registry, brands, ...options } = {}) {
  const files = {
    [DATA_FILES.catalog]: JSON.stringify(catalogData), [DATA_FILES.registry]: registry === undefined ? registryText : JSON.stringify(registry),
    [DATA_FILES.brands]: brands === undefined ? brandsText : JSON.stringify(brands), [DATA_FILES.examples]: examplesText,
  };
  for (const [name, content] of Object.entries(photos)) files[`src/assets/productos/${name}`] = content;
  const root = await makeTree(files);
  try {
    return await validateProject(root, options);
  } finally {
    await removeTree(root);
  }
}

test('el resumen de fotos se lee como siempre sin fichas aprobadas, o con todas con foto', () => {
  const line = 'Fotos de producto: 0 archivos en src/assets/productos/ y 0 por dirección, todas de fichas aprobadas.';
  assert.deepEqual(photoSummary(catalogOf()), [line]);
  // Los borradores no cuentan, con foto o sin ella.
  assert.deepEqual(photoSummary(catalogOf(product(1, { status: 'draft' }), product(2, { status: 'in_review', image: fileImage('casco-de-prueba.png') }))), [line]);
  // Tampoco su foto por dirección.
  assert.deepEqual(photoSummary(catalogOf(product(1, { status: 'draft', image: urlImage }), product(2, { status: 'in_review', image: urlImage }), product(3, { image: fileImage('guante-de-prueba.jpg') }))),
    ['Fotos de producto: 1 archivo en src/assets/productos/ y 0 por dirección, todas de fichas aprobadas.']);
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

test('con más de diez fichas aprobadas sin foto, el resumen dice cuántas, cuántas de cada marca y las diez primeras', () => {
  // Las marcas en el orden de su lista; una que la lista no tiene va al final, con su identificador.
  const brands = [{ id: 'marca-b', name: 'Marca B' }, { id: 'marca-a', name: 'Marca A' }];
  const bare = (index, brandId) => ({ id: `ficha-${index}`, brandId, status: 'approved' });
  const eleven = Array.from({ length: 11 }, (_, i) => bare(i + 1, i % 2 ? 'marca-b' : 'marca-a'));
  assert.deepEqual(photoSummary({ products: eleven }, brands), [
    'Fotos de producto: 0 archivos en src/assets/productos/ y 0 por dirección, todas de fichas aprobadas; 11 fichas aprobadas sin foto.',
    'Sin foto (se muestran con el pictograma de su categoría): 11 (Marca B 5, Marca A 6). Las primeras: ficha-1, ficha-2, ficha-3, ficha-4, ficha-5, ficha-6, ficha-7, ficha-8, ficha-9, ficha-10 y 1 más. La lista completa: npm run validate:catalog -- --sin-foto',
  ]);
  // Con diez, la línea de siempre.
  assert.deepEqual(photoSummary({ products: eleven.slice(0, 10) }, brands)[1],
    'Sin foto (se muestran con el pictograma de su categoría): ficha-1, ficha-2, ficha-3, ficha-4, ficha-5, ficha-6, ficha-7, ficha-8, ficha-9, ficha-10.');
  // Con 1,400 sin foto, 1,100 archivos y 1,200 direcciones: cada cifra con la coma de los miles.
  const many = [
    ...Array.from({ length: 1000 }, (_, i) => bare(i + 1, 'marca-a')),
    ...Array.from({ length: 399 }, (_, i) => bare(i + 1001, 'marca-b')),
    bare(1400, 'marca-c'),
    ...Array.from({ length: 1100 }, (_, i) => ({ ...bare(i + 2001, 'marca-a'), image: { file: `foto-${i}.jpg` } })),
    ...Array.from({ length: 1200 }, (_, i) => ({ ...bare(i + 4001, 'marca-b'), image: { url: `https://fotos.sitio.mx/${i}.jpg` } })),
    { ...bare(9001, 'marca-a'), status: 'draft' },
  ];
  assert.deepEqual(photoSummary({ products: many }, brands), [
    'Fotos de producto: 1,100 archivos en src/assets/productos/ y 1,200 por dirección, todas de fichas aprobadas; 1,400 fichas aprobadas sin foto.',
    'Sin foto (se muestran con el pictograma de su categoría): 1,400 (Marca B 399, Marca A 1,000, marca-c 1). Las primeras: ficha-1, ficha-2, ficha-3, ficha-4, ficha-5, ficha-6, ficha-7, ficha-8, ficha-9, ficha-10 y 1,390 más. La lista completa: npm run validate:catalog -- --sin-foto',
  ]);
});

test('con --sin-foto el validador escribe, después del resumen, cada ficha aprobada sin foto en su línea', async () => {
  const products = Array.from({ length: 12 }, (_, i) => product(i + 1));
  const plain = await validate(catalogOf(...products, product(13, { image: urlImage })));
  const full = await validate(catalogOf(...products, product(13, { image: urlImage })), {}, { listWithoutPhoto: true });
  assert.deepEqual(plain.errors, []);
  assert.deepEqual(full.lines.slice(0, plain.lines.length), plain.lines);
  assert.deepEqual(full.lines.slice(plain.lines.length), products.map(entry => entry.id));
  assert.ok(plain.lines.includes('Sin foto (se muestran con el pictograma de su categoría): 12 (Ansell 12). Las primeras: guante-ficticio-1, guante-ficticio-2, guante-ficticio-3, guante-ficticio-4, guante-ficticio-5, guante-ficticio-6, guante-ficticio-7, guante-ficticio-8, guante-ficticio-9, guante-ficticio-10 y 2 más. La lista completa: npm run validate:catalog -- --sin-foto'), plain.lines.join('\n'));
});

test('con los datos del repositorio, el resumen nombra las diez primeras fichas aprobadas sin foto, y --sin-foto las escribe todas', async () => {
  // Lo esperado sale de los datos, contado aquí: las fichas aprobadas sin image, en el orden del catálogo.
  const withoutPhoto = catalog.products.filter(entry => entry.status === 'approved' && !('image' in entry)).map(entry => entry.id);
  const run = async (...args) => (await promisify(execFile)(process.execPath, [join(ROOT, 'scripts', 'validate-catalog.mjs'), ...args])).stdout.trimEnd().split('\n');
  const [plain, full] = await Promise.all([run(), run('--sin-foto')]);
  assert.deepEqual(full.slice(0, plain.length), plain);
  assert.deepEqual(full.slice(plain.length), withoutPhoto);
  const line = plain.find(entry => entry.startsWith('Sin foto'));
  if (withoutPhoto.length > 10) {
    assert.ok(line.includes(`. Las primeras: ${withoutPhoto.slice(0, 10).join(', ')} y ${(withoutPhoto.length - 10).toLocaleString('es-MX')} más. La lista completa: npm run validate:catalog -- --sin-foto`), line);
  } else if (withoutPhoto.length) assert.equal(line, `Sin foto (se muestran con el pictograma de su categoría): ${withoutPhoto.join(', ')}.`);
});

test('las cifras del resumen llevan la coma de los miles', async () => {
  const products = Array.from({ length: 1000 }, (_, i) => product(i + 1));
  const { errors, lines } = await validate(catalogOf(...products));
  assert.deepEqual(errors, []);
  assert.ok(lines.includes('Catálogo: 1,000 productos / 1,000 aprobados / 0 retirados con página informativa.'), lines.join('\n'));
  assert.ok(lines.includes('Fotos de producto: 0 archivos en src/assets/productos/ y 0 por dirección, todas de fichas aprobadas; 1,000 fichas aprobadas sin foto.'), lines.join('\n'));
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
  assert.ok(lines.includes('Marcas públicas: 15 / 14 con algún enlace del fabricante / 14 con catálogo del fabricante (6 en PDF).'), lines.join('\n'));
});

test('la foto de una ficha aprobada viene de un sitio de su fabricante en el registro; si no, el mensaje dice de dónde viene y qué hacer', async () => {
  const foreign = { ...urlImage, sourceUrl: 'https://example.invalid/origen' };
  const { errors } = await validate(catalogOf(product(1, { image: urlImage }), product(2, { image: foreign })));
  assert.deepEqual(errors, ['products[1] (guante-ficticio-2).image.sourceUrl: la foto viene de example.invalid, pero el sitio de Ansell en el registro es ansell.com. La ficha muestra bajo la foto un crédito que enlaza esa página: escribe la página del sitio del fabricante de donde viene la foto, o agrega ese sitio a la marca en el registro de investigación, con su verificación.']);
  // Un borrador o una ficha en revisión no publican la foto: no se revisa.
  assert.deepEqual((await validate(catalogOf(product(1), product(2, { status: 'draft', image: foreign }), product(3, { status: 'in_review', image: foreign })))).errors, []);
  // Con o sin «www.», y sin distinguir mayúsculas en el servidor.
  for (const sourceUrl of ['https://ansell.com/mx/es/pagina-ficticia', 'https://WWW.Ansell.com/pagina-ficticia']) {
    assert.deepEqual((await validate(catalogOf(product(1, { image: { ...urlImage, sourceUrl } })))).errors, [], sourceUrl);
  }
});

test('el servidor de la foto debe ser el de un recurso de la marca verificado como accesible y de un tipo no bloqueado', () => {
  const registry = { sources: [
    { entity_id: 'marca-a', name: 'Marca A', entity_type: 'brand', resources: [
      { type: 'web', url: 'https://www.marca-a.example/', verification: 'accesible (2026-11-23)' },
      { type: 'landing', url: 'https://catalogo.marca-a.example/', verification: 'accesible (2026-11-23)' },
      { type: 'unverified_current', url: 'https://nuevo.marca-a.example/', verification: 'accesible (2026-11-23)' },
      { type: 'pdf', url: 'https://archivos.marca-a.example/catalogo.pdf', verification: 'sin comprobar' },
    ] },
    { entity_id: 'marca-b', name: 'Marca B', entity_type: 'brand', resources: [
      { type: 'web', url: 'https://marca-b.example/', verification: 'sin comprobar' },
    ] },
  ] };
  const photo = (brandId, sourceUrl, status = 'approved') => ({ id: `ficha-${brandId}`, brandId, status, image: { url: 'https://example.invalid/f.jpg', width: 800, height: 600, alt: 'Foto', sourceUrl, usageConfirmed: true } });
  const errorsOf = (...products) => photoSourceErrors({ products }, registry);
  assert.deepEqual(errorsOf(photo('marca-a', 'https://marca-a.example/producto/1'), photo('marca-a', 'https://catalogo.marca-a.example/x')), []);
  // Un tipo bloqueado o un recurso sin comprobar no respaldan la foto; otro subdominio tampoco.
  for (const sourceUrl of ['https://nuevo.marca-a.example/x', 'https://archivos.marca-a.example/foto', 'https://tienda.marca-a.example/x']) {
    const host = new URL(sourceUrl).hostname;
    assert.deepEqual(errorsOf(photo('marca-a', sourceUrl)), [`products[0] (ficha-marca-a).image.sourceUrl: la foto viene de ${host}, pero los sitios de Marca A en el registro son marca-a.example y catalogo.marca-a.example. La ficha muestra bajo la foto un crédito que enlaza esa página: escribe la página del sitio del fabricante de donde viene la foto, o agrega ese sitio a la marca en el registro de investigación, con su verificación.`], sourceUrl);
  }
  assert.deepEqual(errorsOf(photo('marca-b', 'https://marca-b.example/x')), ['products[0] (ficha-marca-b).image.sourceUrl: la foto viene de marca-b.example, pero Marca B no tiene en el registro ningún sitio verificado como accesible. La ficha muestra bajo la foto un crédito que enlaza esa página: escribe la página del sitio del fabricante de donde viene la foto, o agrega ese sitio a la marca en el registro de investigación, con su verificación.']);
  // Solo las fichas aprobadas; un retirado no muestra su foto.
  assert.deepEqual(errorsOf(photo('marca-b', 'https://marca-b.example/x', 'draft'), photo('marca-b', 'https://marca-b.example/x', 'retired')), []);
});

// --- Marcas retiradas del portal --------------------------------------------------------------------------------------
// Una copia del registro del repositorio en la que una marca que sigue en el portal (JYRSA) lleva la marca de retiro.
const PORTAL = { status: 'retirada', on: '2026-11-23', reason: 'Decisión sintética de prueba.' };
const withPortal = (id, portal = PORTAL) => {
  const registry = JSON.parse(registryText);
  registry.sources.find(source => source.entity_id === id).portal = portal;
  return registry;
};
const brandsWithout = id => JSON.parse(brandsText).filter(brand => brand.id !== id);

test('el validador revisa la marca de retiro del registro y dice en qué entidad y en qué campo está el problema', async () => {
  assert.deepEqual((await validate(catalogOf(), {}, { registry: withPortal('jyrsa'), brands: brandsWithout('jyrsa') })).errors, []);
  assert.deepEqual((await validate(catalogOf(), {}, { registry: withPortal('jyrsa', { ...PORTAL, on: '2026-11-31' }), brands: brandsWithout('jyrsa') })).errors,
    ['Registro de investigación: jyrsa.portal.on: «2026-11-31» no es una fecha real; escribe el día en que la marca salió del portal como AAAA-MM-DD, por ejemplo 2026-11-23.']);
  assert.deepEqual((await validate(catalogOf(), {}, { registry: withPortal('jyrsa', null), brands: brandsWithout('jyrsa') })).errors, [
    'Registro de investigación: jyrsa.portal: debe ser un objeto con status, on y reason, como {"status": "retirada", "on": "2026-11-23", "reason": "…"}; si la marca vuelve al portal, quita la clave portal.',
    'Marcas: registro: jyrsa falta en brands.json.',
  ]);
});

test('una marca retirada que sigue en brands.json, o un producto suyo, detienen la validación con el mensaje que dice qué hacer', async () => {
  assert.deepEqual((await validate(catalogOf(), {}, { registry: withPortal('jyrsa') })).errors,
    ['Marcas: jyrsa: en el registro está retirada del portal (2026-11-23); quítala de brands.json o, si vuelve al portal, quita la clave portal de su entidad en el registro.']);
  const ofWithdrawn = status => product(1, { brandId: 'jyrsa', status });
  for (const status of ['draft', 'approved']) {
    assert.deepEqual((await validate(catalogOf(ofWithdrawn(status)), {}, { registry: withPortal('jyrsa'), brands: brandsWithout('jyrsa') })).errors,
      ['products[0]: la marca jyrsa está retirada del portal; un producto suyo no se carga.'], status);
  }
});

test('la línea del registro dice cuántas entidades salieron del portal, solo si hay alguna', async () => {
  const entity = (id, portal) => ({ entity_id: id, resources: [{}, {}], ...(portal && { portal }) });
  assert.equal(registrySummary({ sources: [entity('a'), entity('b')] }), 'Registro: 2 entidades / 4 referencias.');
  assert.equal(registrySummary({ sources: [entity('a', PORTAL), entity('b')] }), 'Registro: 2 entidades (1 retirada del portal) / 4 referencias.');
  assert.equal(registrySummary({ sources: [entity('a', PORTAL), entity('b', PORTAL), entity('c', PORTAL), entity('d', PORTAL), entity('e')] }),
    'Registro: 5 entidades (4 retiradas del portal) / 10 referencias.');
  // Con el registro del repositorio y una marca retirada, en la salida del validador.
  const { lines } = await validate(catalogOf(), {}, { registry: withPortal('jyrsa'), brands: brandsWithout('jyrsa') });
  const registry = JSON.parse(registryText);
  const withdrawn = registry.sources.filter(source => source.portal !== undefined).length + 1;
  const references = registry.sources.reduce((count, source) => count + source.resources.length, 0);
  assert.equal(lines[0], `Registro: ${registry.sources.length} entidades (${withdrawn} ${withdrawn === 1 ? 'retirada' : 'retiradas'} del portal) / ${references} referencias.`);
});

// La página de la foto no es una página del registro que no se publica, y el sitio de una marca no es el visor ni la
// plataforma de otro donde está su catálogo.
const REGISTRY = JSON.parse(registryText);
/** Lo que el mensaje cita de un recurso del registro: su tipo y su verificación, cortada a 80 caracteres con «…». */
const cited = resource => `${resource.type}: ${[...resource.verification].length > 80 ? `${[...resource.verification].slice(0, 80).join('')}…` : resource.verification}`;
const withPhotoFrom = (brandId, sourceUrl) => ({ id: `ficha-${brandId}`, brandId, status: 'approved', image: { ...urlImage, sourceUrl } });

test('la foto de una ficha aprobada no puede venir de una página del registro que no se publica, escrita como sea', async () => {
  const mcr = REGISTRY.sources.find(source => source.entity_id === 'mcr-safety');
  // La lista de guías («no enlazar»), la página vieja (deprecated, 404) y la política de contenido (sin «accesible»).
  const hidden = mcr.resources.filter(resource => /guias-de-recursos\/$|catalogos\.php$|compartir-contenido\/$/.test(resource.url));
  assert.equal(hidden.length, 3);
  for (const resource of hidden) {
    for (const sourceUrl of [resource.url, resource.url.replace(/\/$/, ''), `${resource.url}#foto`, resource.url.replace('https://www.', 'https://')]) {
      assert.deepEqual(photoSourceErrors({ products: [withPhotoFrom('mcr-safety', sourceUrl)] }, REGISTRY), [
        `products[0] (ficha-mcr-safety).image.sourceUrl: esa página está en el registro de investigación como «${cited(resource)}» y no se publica, así que no puede ser la página de una foto: la ficha la enlazaría en el crédito. Escribe la página del producto en el sitio del fabricante de donde viene la foto.`,
      ], sourceUrl);
    }
  }
  // El mensaje del ejemplo, con la lista de guías.
  const guides = hidden.find(resource => /guias-de-recursos/.test(resource.url));
  assert.match(photoSourceErrors({ products: [withPhotoFrom('mcr-safety', guides.url)] }, REGISTRY)[0], /como «landing: no enlazar: la lista de 13 guías/);
  // En el validador completo.
  assert.deepEqual((await validate(catalogOf(product(1, { brandId: 'mcr-safety', image: { ...urlImage, sourceUrl: guides.url } })))).errors,
    [`products[0] (guante-ficticio-1).image.sourceUrl: esa página está en el registro de investigación como «${cited(guides)}» y no se publica, así que no puede ser la página de una foto: la ficha la enlazaría en el crédito. Escribe la página del producto en el sitio del fabricante de donde viene la foto.`]);
  // Una página del sitio de MCR que no está en el registro, o que está debajo de la lista de guías, sí.
  for (const sourceUrl of ['https://www.mcrsafety.com.mx/productos/guante-ficticio/', `${guides.url}guia-ficticia/`]) {
    assert.deepEqual(photoSourceErrors({ products: [withPhotoFrom('mcr-safety', sourceUrl)] }, REGISTRY), [], sourceUrl);
  }
});

test('con los datos reales, la foto de UVEX Classic viene de una página del registro que se publica, y pasa', () => {
  const uvex = catalog.products.find(entry => entry.id === 'uvex-classic-s360');
  const resource = REGISTRY.sources.flatMap(source => source.resources).find(entry => entry.url === uvex.image.sourceUrl);
  assert.equal(resource.type, 'product_page');
  assert.match(resource.verification, /^accesible/);
  assert.deepEqual(photoSourceErrors(catalog, REGISTRY), []);
});

test('el visor de Google Drive donde está el catálogo de MR Seguridad no es el sitio de MR Seguridad', () => {
  const mr = REGISTRY.sources.find(source => source.entity_id === 'mr-seguridad');
  assert.ok(mr.resources.some(resource => resource.type === 'pdf_viewer' && new URL(resource.url).hostname === 'drive.google.com'));
  assert.deepEqual(photoSourceErrors({ products: [withPhotoFrom('mr-seguridad', 'https://drive.google.com/file/d/archivo-ficticio/view')] }, REGISTRY), [
    'products[0] (ficha-mr-seguridad).image.sourceUrl: la foto viene de drive.google.com, pero el sitio de MR Seguridad en el registro es mrseguridad.com. La ficha muestra bajo la foto un crédito que enlaza esa página: escribe la página del sitio del fabricante de donde viene la foto, o agrega ese sitio a la marca en el registro de investigación, con su verificación.',
  ]);
  // Sus dos fotos reales vienen de mrseguridad.com y pasan.
  const real = catalog.products.filter(entry => entry.brandId === 'mr-seguridad' && entry.image);
  assert.equal(real.length, 2);
  for (const entry of real) assert.equal(new URL(entry.image.sourceUrl).hostname, 'mrseguridad.com');
  assert.deepEqual(photoSourceErrors({ products: real }, REGISTRY), []);
  // Una plataforma de catálogos tampoco es el sitio de la marca (registro sintético).
  const registry = { sources: [{ entity_id: 'marca-a', name: 'Marca A', entity_type: 'brand', resources: [
    { type: 'web', url: 'https://www.marca-a.example/', verification: 'accesible (2026-11-23)' },
    { type: 'catalog_platform', url: 'https://plataforma.example/catalogos/marca-a', verification: 'accesible (2026-11-23)' },
  ] }] };
  assert.match(photoSourceErrors({ products: [withPhotoFrom('marca-a', 'https://plataforma.example/catalogos/marca-a/foto')] }, registry)[0], /la foto viene de plataforma\.example, pero el sitio de Marca A en el registro es marca-a\.example\./);
});

test('el validador rechaza una dirección con un segmento «..» en la ruta y la página de una foto con un servidor que el navegador lee como otro, con el mensaje entero', async () => {
  const dots = product(1, { image: urlImage, documents: [{ label: 'Ficha técnica', url: 'https://www.ansell.com/mx/es/x/../ficha.pdf' }] });
  const letter = product(2, { image: { ...urlImage, sourceUrl: 'https://www.\u{1D41A}nsell.com/mx/es/ficha' } });
  assert.deepEqual((await validate(catalogOf(dots, letter))).errors, [
    'products[0].documents[0].url: la dirección lleva el segmento «..» en la ruta, después de «…/www.ansell.com/mx/es/x», y el navegador lo resuelve y abre otra dirección; escribe la dirección completa de la página o del documento del fabricante.',
    'products[1].image.sourceUrl: el servidor «www.\u{1D41A}nsell.com» lleva «\u{1D41A}» (U+1D41A), que el navegador lee como «a»; escribe la página de donde viene la foto.',
  ]);
});
