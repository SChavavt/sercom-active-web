import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewCatalogText } from '../scripts/catalog-text.mjs';
import { registryLeaks, scanDist } from '../scripts/scan-dist.mjs';
import { validateCatalog } from '../src/lib/catalog-policy.mjs';
import { DEVELOPMENT_NOTICE } from '../src/lib/site-data-core.mjs';
import { emptiedCatalog, loadProjectData, makeTree, readText, removeTree } from './helpers.mjs';

// Fichas sintéticas, solo de prueba: ningún producto, código ni norma de un producto real.
const data = await loadProjectData();
const sources = { registry: data.registry, brands: data.brands, examples: data.examples };
const brandScope = { sources: [{ entity_id: 'ansell', name: 'Ansell', entity_type: 'brand' }] };
const STATUSES = ['draft', 'in_review', 'approved', 'retired'];
const SOURCE = 'https://example.invalid/ficha-sintetica';

/** Una ficha ficticia, bien escrita y completa, con los cambios dados. */
function product(change = {}) {
  return {
    id: 'guante-ficticio', brandId: 'ansell', model: 'FIC-100', name: 'Guante ficticio de las pruebas', categoryIds: ['manos'], status: 'draft',
    description: 'Guante ficticio que solo existe en las pruebas.', saleUnit: 'par',
    characteristics: ['Dato ficticio A', 'Dato ficticio B', 'Dato ficticio C'],
    variants: [{ id: 'talla-8', label: 'Talla 8', manufacturerCode: 'FIC-100-8' }],
    documents: [{ label: 'Hoja de datos', url: SOURCE }],
    source: { url: SOURCE, checkedOn: '2026-11-18' },
    ...change,
  };
}
const catalogOf = (...products) => ({ schemaVersion: 1, categories: [{ id: 'manos', name: 'Protección de manos', status: 'approved' }], products });
const review = (...changes) => reviewCatalogText(catalogOf(...changes.map(product)), sources);

test('una ficha bien escrita no tiene mensajes, y la ficha de base es válida', () => {
  assert.deepEqual(review({}), []);
  assert.deepEqual(validateCatalog(catalogOf(product()), brandScope), []);
});

test('los ejemplos de redacción que hacían fallar el escaneo se informan con la ficha, el campo y la regla, en cualquier estado', () => {
  const at = field => `products[0].${field} (guante-ficticio)`;
  const characteristics = text => ({ characteristics: ['Dato ficticio A', text, 'Dato ficticio C'] });
  const cases = [
    [characteristics('Solo personal autorizado'), `${at('characteristics[1]')}: R-RULE-07, «oficial», «autorizado», distribuidor, sucursal o representante: «autorizado». Escríbelo de otra forma.`],
    [characteristics('Prohibido el paso a personal no autorizado'), `${at('characteristics[1]')}: R-RULE-07, «oficial», «autorizado», distribuidor, sucursal o representante: «autorizado». Escríbelo de otra forma.`],
    [{ name: 'Chaleco reflejante para oficial de tránsito' }, `${at('name')}: R-RULE-07, «oficial», «autorizado», distribuidor, sucursal o representante: «oficial». Escríbelo de otra forma.`],
    [characteristics('Fecha de fabricación impresa'), `${at('characteristics[1]')}: R-RULE-18, condición comercial o servicio no confirmado: «fabricación». Escríbelo de otra forma.`],
    [characteristics('Logotipo bordado'), `${at('characteristics[1]')}: R-RULE-18, condición comercial o servicio no confirmado: «bordado». Escríbelo de otra forma.`],
    [{ description: 'Candado con etiqueta con folio consecutivo.' }, `${at('description')}: R-RULE-10, confirmación falsa de recepción o folio: «folio». Escríbelo de otra forma.`],
    [{ name: 'Casco para líder de cuadrilla' }, `${at('name')}: R-RULE-06, experiencia o liderazgo sin evidencia: «líder». Escríbelo de otra forma.`],
    [characteristics('Costuras garantizadas por el fabricante'), `${at('characteristics[1]')}: R-RULE-06, experiencia o liderazgo sin evidencia: «garantizadas». Escríbelo de otra forma.`],
    [characteristics('Norma vigente desde 2019'), `${at('characteristics[1]')}: R-RULE-06, experiencia o liderazgo sin evidencia: «desde 2019». Escríbelo de otra forma.`],
    [{ model: '72090' }, `${at('model')}: R-RULE-11, dirección publicada: «72090». Escríbelo de otra forma.`],
    [characteristics('Cumple ANSI Z87.1'), `${at('characteristics[1]')}: R-RULE-04, norma o valor técnico: «ANSI». Una norma va solo en standards, con la página o el documento del fabricante donde consta; aquí escríbelo de otra forma o quítalo.`],
    [characteristics('Nivel de corte A4'), `${at('characteristics[1]')}: R-RULE-04, norma mexicana o nivel de protección: «Nivel de corte». Una norma va solo en standards, con la página o el documento del fabricante donde consta; aquí escríbelo de otra forma o quítalo.`],
    [characteristics('Filtro compatible con la serie de cartuchos de la misma marca'), `${at('characteristics[1]')}: R-RULE-16, equivalencia o compatibilidad afirmada: «compatible». Escríbelo de otra forma.`],
    // «Tiempo de respuesta» en minutos: la regla de la promesa de respuesta no cambia; se escribe en segundos o con otras palabras.
    [characteristics('Tiempo de respuesta: 2 minutos'), `${at('characteristics[1]')}: R-RULE-10, confirmación falsa de recepción o folio: «Tiempo de respuesta: 2 minutos». Escríbelo de otra forma.`],
    [{ description: 'Guante con código 70001234567 impreso en el puño.' }, `${at('description')}: R-RULE-24, número con forma de teléfono: «70001234567». Un número así va en model o en el manufacturerCode de su variante, no en el texto; escríbelo de otra forma.`],
  ];
  for (const status of STATUSES) {
    for (const [change, message] of cases) assert.deepEqual(review({ status, ...change }), [message], `${status} ${JSON.stringify(change)}`);
  }
  // El mismo tiempo en segundos, o dicho de otra forma, sí pasa.
  assert.deepEqual(review(characteristics('Tiempo de respuesta: 120 segundos')), []);
  assert.deepEqual(review(characteristics('Responde en menos de 2 minutos al detectar el gas')), []);
});

test('texto legítimo de un producto queda limpio', () => {
  for (const text of ['Caja con 100 piezas', 'Disponible en tallas 7 a 11', 'Modelo 6200', 'Libre de látex', 'Fabricado en México', 'Filtra al menos el 95 % de partículas']) {
    assert.deepEqual(review({ description: text }), [], text);
    assert.deepEqual(review({ characteristics: ['Dato ficticio A', text, 'Dato ficticio C'] }), [], text);
  }
  // Un número largo en un código no es un teléfono: va justo ahí.
  assert.deepEqual(review({ model: '70006953338' }), []);
  assert.deepEqual(review({ variants: [{ id: 'talla-8', label: 'Talla 8', manufacturerCode: '70001234567' }] }), []);
  // Una norma, en su campo.
  assert.deepEqual(review({ standards: [{ text: 'EN 388:2016 4131A', sourceUrl: SOURCE }] }), []);
});

test('una norma va en standards: ahí no se aplica R-RULE-04 y sí todas las demás reglas', () => {
  const standards = (...texts) => ({ standards: texts.map(text => ({ text, sourceUrl: SOURCE })) });
  assert.deepEqual(review(standards('ANSI/ISEA 105-2016 A4', 'EN407:2004 X2XXXX', 'NOM-017-STPS-2008', 'Nivel de corte A2', 'NIOSH N95, aprobación TC-84A-0007', 'ISO 13997')), []);
  const at = 'products[0].standards[0].text (guante-ficticio)';
  assert.deepEqual(review(standards('Certificación NIOSH')), [`${at}: R-RULE-06, certificación o distintivo: «Certificación». Escríbelo de otra forma.`]);
  assert.deepEqual(review(standards('ANSI Z87.1, 100 % probado')), [`${at}: R-RULE-06, certificación o distintivo: «100 %». Escríbelo de otra forma.`]);
  assert.deepEqual(review(standards('Producto certificado EN 388')), [`${at}: R-RULE-06, certificación o distintivo: «certificado». Escríbelo de otra forma.`]);
  // La misma norma en otro campo se informa diciendo dónde va.
  const misplaced = review({ description: 'Guante ficticio con nivel ANSI/ISEA 105-2016 A4.' });
  assert.equal(misplaced.length, 1);
  assert.match(misplaced[0], /^products\[0\]\.description \(guante-ficticio\): R-RULE-04, norma o valor técnico: «ANSI\/ISEA»\. Una norma va solo en standards/);
});

test('se revisan todos los campos de texto de la ficha, también el alternativo de la foto, y solo cuando la ficha tiene foto', () => {
  const word = 'Guante oficial';
  const message = field => `products[0].${field} (guante-ficticio): R-RULE-07, «oficial», «autorizado», distribuidor, sucursal o representante: «oficial». Escríbelo de otra forma.`;
  const image = { url: 'https://example.invalid/foto.jpg', width: 800, height: 600, alt: word, sourceUrl: SOURCE, usageConfirmed: true };
  for (const [field, change] of [
    ['name', { name: word }], ['model', { model: 'FIC oficial' }], ['description', { description: word }], ['saleUnit', { saleUnit: 'par oficial' }],
    ['characteristics[0]', { characteristics: [word] }], ['variants[0].label', { variants: [{ id: 'talla-8', label: word }] }],
    ['variants[0].manufacturerCode', { variants: [{ id: 'talla-8', label: 'Talla 8', manufacturerCode: 'FIC oficial' }] }],
    ['documents[0].label', { documents: [{ label: word, url: SOURCE }] }], ['image.alt', { image }],
    ['standards[0].text', { standards: [{ text: 'EN 388 oficial', sourceUrl: SOURCE }] }],
  ]) assert.deepEqual(review(change), [message(field)], field);
  // Sin foto no hay nada que revisar de ella; una ficha sin id se nombra solo por su posición.
  assert.deepEqual(review({ image: undefined }), []);
  assert.deepEqual(reviewCatalogText(catalogOf({ ...product(), id: undefined, name: word }), sources), ['products[0].name: R-RULE-07, «oficial», «autorizado», distribuidor, sucursal o representante: «oficial». Escríbelo de otra forma.']);
  // Las fuentes no se publican y no se revisan.
  assert.deepEqual(review({ source: { url: 'https://example.invalid/oficial', checkedOn: '2026-11-18' }, standards: [{ text: 'EN 388', sourceUrl: 'https://example.invalid/oficial' }] }), []);
});

test('las frases permitidas del escáner son del sitio: en una ficha no valen', () => {
  assert.deepEqual(review({ description: '¿Todo está en existencia?' }), ['products[0].description (guante-ficticio): R-RULE-09, promesa de existencia, inventario o entrega: «en existencia». Escríbelo de otra forma.']);
});

test('una dirección de correo no va en una ficha, ni la del negocio', () => {
  for (const address of ['ventas@otra-oficina.example', data.business.email]) {
    assert.deepEqual(review({ description: `Pide la ficha a ${address}` }), [`products[0].description (guante-ficticio): R-RULE-24, dirección de correo: «${address}». Los datos de contacto no van en una ficha; quítala.`], address);
  }
  // Un nombre de archivo con «@» no es una dirección.
  assert.deepEqual(review({ description: 'Ver logo@2x.png' }), []);
});

test('un enlace del registro de investigación no se publica como documento ni como foto; el sitio del fabricante y la ficha del producto sí', () => {
  const leaks = registryLeaks(data.registry, data.brands);
  const [leak] = leaks.urls;
  assert.ok(leak, 'el registro tiene enlaces que no se publican');
  const documentAt = 'products[0].documents[0].url (guante-ficticio)';
  assert.deepEqual(review({ documents: [{ label: 'Catálogo general', url: leak }] }), [`${documentAt}: R-RULE-13, ese enlace es del registro de investigación y no está entre los enlaces del fabricante publicados en brands.json; enlaza la página o la ficha del producto en el sitio del fabricante, o el catálogo que publica su marca.`]);
  const image = { url: leak, width: 800, height: 600, alt: 'Guante ficticio', sourceUrl: SOURCE, usageConfirmed: true };
  assert.deepEqual(review({ image }), ['products[0].image.url (guante-ficticio): R-RULE-13, ese enlace es del registro de investigación y no se publica; usa la dirección de la foto en el sitio del fabricante o guarda la foto en src/assets/productos/.']);
  // El «Sitio del fabricante» de una marca y una página de producto del mismo sitio sí se publican.
  const brandLink = data.brands.flatMap(brand => brand.manufacturerLinks.map(link => link.url))[0];
  const productPage = `${leak.replace(/\/?$/, '/')}guante-ficticio-100`;
  for (const url of [brandLink, productPage]) assert.deepEqual(review({ documents: [{ label: 'Ficha del producto', url }] }), [], url);
});

test('el texto alternativo de la foto no lleva lo reservado a los ejemplos ni la marca excluida, en cualquier estado', () => {
  const [longName, shortName] = data.registry.scope.excluded_entities;
  const image = alt => ({ image: { url: 'https://example.invalid/foto.jpg', width: 800, height: 600, alt, sourceUrl: SOURCE, usageConfirmed: true } });
  for (const status of STATUSES) {
    assert.deepEqual(review({ status, ...image('Foto del guante de ejemplo') }), ['products[0].image.alt (guante-ficticio): R-RULE-03, marca de producto de ejemplo en producción: «de ejemplo». Escríbelo de otra forma.'], status);
    assert.deepEqual(review({ status, ...image(`Foto del guante ${shortName}`) }), [`products[0].image.alt (guante-ficticio): R-RULE-08, marca excluida: «${shortName}». Escríbelo de otra forma.`], status);
    assert.equal(review({ status, ...image(`Guante de ${longName}`) }).length, 1, status);
    assert.deepEqual(review({ status, ...image('Foto del guante ficticio, de frente') }), [], status);
  }
});

test('una nota interna del registro copiada en un texto se informa; mencionar un catálogo con otras palabras no', () => {
  const { notes } = registryLeaks(data.registry, data.brands);
  const note = notes.find(text => text.length >= 20 && !/[_]/.test(text));
  assert.ok(note);
  assert.deepEqual(review({ description: `Según ${note}.` }), [`products[0].description (guante-ficticio): R-RULE-13, copia una nota interna del registro de investigación: «${note.length > 80 ? `${note.slice(0, 80)}…` : note}». Escríbelo con tus palabras.`]);
  for (const text of ['Consulta el catálogo del fabricante', 'Aparece en el catálogo general de la marca', 'Ficha técnica en el sitio del fabricante']) {
    assert.deepEqual(review({ description: text }), [], text);
  }
});

test('npm run validate:catalog corre la revisión del texto sobre el catálogo', async () => {
  const source = await readText('scripts/validate-catalog.mjs');
  assert.match(source, /reviewCatalogText\(catalog, \{ registry, brands, examples \}\)/);
  // Con los datos del repositorio, ningún mensaje.
  assert.deepEqual(reviewCatalogText(data.catalog, sources), []);
});

test('un documento puede enlazar el catálogo que su marca publica en brands.json, en PDF o en línea; un catálogo del registro sin publicar, no', () => {
  const published = data.brands.flatMap(brand => brand.manufacturerLinks.filter(link => link.label !== 'Sitio del fabricante').map(link => link.url));
  assert.ok(published.length >= 14);
  for (const url of published) assert.deepEqual(review({ documents: [{ label: 'Catálogo de la marca', url }] }), [], url);
  const publishedAll = new Set(data.brands.flatMap(brand => brand.manufacturerLinks.map(link => link.url)));
  const unpublished = data.registry.sources.flatMap(source => source.resources).filter(resource => resource.type === 'pdf' && !publishedAll.has(resource.url));
  assert.ok(unpublished.length >= 2);
  for (const { url } of unpublished) assert.match(review({ documents: [{ label: 'Catálogo de la marca', url }] }).join('\n'), /R-RULE-13, ese enlace es del registro de investigación y no está entre los enlaces del fabricante publicados en brands\.json/, url);
});

test('lo reservado a los ejemplos se informa por R-RULE-03 en la descripción y en una característica, en cualquier estado', () => {
  const at = field => `products[0].${field} (guante-ficticio)`;
  for (const status of STATUSES) {
    for (const [field, change] of [['description', text => ({ description: text })], ['characteristics[1]', text => ({ characteristics: ['Dato ficticio A', text, 'Dato ficticio C'] })]]) {
      assert.deepEqual(review({ status, ...change('Guante de ejemplo') }), [`${at(field)}: R-RULE-03, marca de producto de ejemplo en producción: «de ejemplo». Escríbelo de otra forma.`], `${status} ${field}`);
      const code = review({ status, ...change('Lente EJ-200') });
      assert.equal(code.length, 1, `${status} ${field}`);
      assert.match(code[0], new RegExp(`^${at(field).replace(/[[\]().]/g, '\\$&')}: R-RULE-03, marca de producto de ejemplo en producción: «EJ-2`), `${status} ${field}`);
    }
  }
});

test('un número con forma de teléfono se informa en cada campo de texto, también en el de una norma, y no en model ni en manufacturerCode', () => {
  const number = '70001234567';
  const message = field => `products[0].${field} (guante-ficticio): R-RULE-24, número con forma de teléfono: «${number}». Un número así va en model o en el manufacturerCode de su variante, no en el texto; escríbelo de otra forma.`;
  const image = alt => ({ url: 'https://example.invalid/foto.jpg', width: 800, height: 600, alt, sourceUrl: SOURCE, usageConfirmed: true });
  const fields = [
    ['name', { name: `Guante ${number}` }, true],
    ['model', { model: number }, false],
    ['description', { description: `Guante con ${number} impreso.` }, true],
    ['saleUnit', { saleUnit: `par ${number}` }, true],
    ['characteristics[0]', { characteristics: [`Lote ${number}`] }, true],
    ['variants[0].label', { variants: [{ id: 'talla-8', label: `Talla ${number}` }] }, true],
    ['variants[0].manufacturerCode', { variants: [{ id: 'talla-8', label: 'Talla 8', manufacturerCode: number }] }, false],
    ['standards[0].text', { standards: [{ text: `Norma sintética ${number}`, sourceUrl: SOURCE }] }, true],
    ['documents[0].label', { documents: [{ label: `Hoja ${number}`, url: SOURCE }] }, true],
    ['image.alt', { image: image(`Guante ${number}`) }, true],
  ];
  // Los diez tipos de campo que se revisan, uno por uno.
  assert.equal(fields.length, 10);
  for (const [field, change, reported] of fields) assert.deepEqual(review(change), reported ? [message(field)] : [], field);
});

test('el texto encontrado se cita entero: hasta el final de la palabra o de la designación que corta', () => {
  const at = 'products[0].description (guante-ficticio)';
  const where = 'Una norma va solo en standards, con la página o el documento del fabricante donde consta; aquí escríbelo de otra forma o quítalo.';
  const cases = [
    ['Cumple con la NOM-113-STPS-2009 vigente.', `${at}: R-RULE-04, norma mexicana o nivel de protección: «NOM-113-STPS-2009». ${where}`],
    ['Lente EJ-200 de policarbonato', `${at}: R-RULE-03, marca de producto de ejemplo en producción: «EJ-200». Escríbelo de otra forma.`],
    ['Lente EJ-200.', `${at}: R-RULE-03, marca de producto de ejemplo en producción: «EJ-200». Escríbelo de otra forma.`],
    // También hacia atrás, y con la palabra escrita en forma descompuesta: se cita como está escrita.
    ['Guante semi-garantizado', `${at}: R-RULE-06, experiencia o liderazgo sin evidencia: «semi-garantizado». Escríbelo de otra forma.`],
    ['Guante no-autorizado', `${at}: R-RULE-07, «oficial», «autorizado», distribuidor, sucursal o representante: «no-autorizado». Escríbelo de otra forma.`],
    ['Casco para co-líder de cuadrilla'.normalize('NFD'), `${at}: R-RULE-06, experiencia o liderazgo sin evidencia: «${'co-líder'.normalize('NFD')}». Escríbelo de otra forma.`],
    // Lo que no corta ninguna palabra queda como se encontró.
    ['Guante con nivel de corte A4', `${at}: R-RULE-04, norma mexicana o nivel de protección: «nivel de corte». ${where}`],
    ['Cumple EN 388, ANSI Z87.1 y más.', `${at}: R-RULE-04, norma o valor técnico: «EN 388». ${where}`],
  ];
  for (const [description, message] of cases) assert.deepEqual(review({ description }).slice(0, 1), [message], description);
  // Una designación muy larga se corta como cualquier cita, a 80 caracteres.
  const long = `NOM-${'1'.repeat(90)}`;
  assert.deepEqual(review({ description: `Cumple ${long}` }), [`${at}: R-RULE-04, norma mexicana o nivel de protección: «${long.slice(0, 80)}…». ${where}`]);
});

// Las direcciones que publica una ficha: el escáner no las lee como frases (una dirección del fabricante no es una frase
// del sitio), pero sí con las reglas que leen el archivo tal cual o decodificado y con la de los destinos de contacto. El
// validador dice antes lo que el escáner encontraría, con la ficha y el campo.
const NOTICE_HTML = `<aside class="site-notice"><p><strong>${DEVELOPMENT_NOTICE.split(' · ')[0]}</strong> · ${DEVELOPMENT_NOTICE.split(' · ').slice(1).join(' · ')}</p></aside>`;
const htmlPage = body => `<!doctype html><html lang="es-MX"><head><meta charset="UTF-8"><meta name="robots" content="noindex, nofollow"><title>${data.business.name} · ${data.business.titleLabel}</title></head><body><a href="#contenido">Saltar al contenido</a>${NOTICE_HTML}<main id="contenido">${body}</main></body></html>`;
const escapeAttribute = text => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const PHOTO = { url: 'https://fotos.fabricante.example/guante.jpg', width: 800, height: 800, alt: 'Guante ficticio', sourceUrl: 'https://fabricante.example/guante-ficticio', usageConfirmed: true };
const ADDRESS_FIELDS = [
  ['documents[0].url', address => ({ documents: [{ label: 'Hoja de datos', url: address }] }), address => `<a href="${escapeAttribute(address)}" target="_blank" rel="noopener noreferrer">Hoja de datos</a>`,
    'enlaza otra página o documento del fabricante para este producto.'],
  ['image.url', address => ({ image: { ...PHOTO, url: address } }), address => `<img src="${escapeAttribute(address)}" alt="Guante ficticio" width="800" height="800" referrerpolicy="no-referrer">`,
    'usa otra dirección de la foto o guarda la foto en src/assets/productos/.'],
  ['image.sourceUrl', address => ({ image: { ...PHOTO, sourceUrl: address } }), address => `<a href="${escapeAttribute(address)}" rel="noopener">Origen de la foto</a>`,
    'escribe otra página del fabricante de donde viene la foto.'],
];
/** El escaneo de producción de una página que imprime la dirección como la imprime su campo; la ficha, aprobada. */
async function scanLinked(change, markup, { published = true } = {}) {
  const catalog = emptiedCatalog(data.catalog);
  catalog.categories[0].status = 'approved';
  if (published) catalog.products.push({ ...product({ status: 'approved', ...change }), approval: { by: 'Prueba', on: '2026-11-20', supplyConfirmed: true } });
  const directory = await makeTree({ 'robots.txt': 'User-agent: *\nDisallow: /\n', 'index.html': htmlPage('<h1>Inicio</h1>'), 'pagina/index.html': htmlPage(`<h1>Guante ficticio</h1>${markup}`) });
  try {
    return [...new Set((await scanDist(directory, { data: { ...data, catalog } })).findings.map(finding => `${finding.level} ${finding.id}`))].sort();
  } finally {
    await removeTree(directory);
  }
}

test('una dirección publicada que el escaneo rechazaría se informa antes, con la ficha, el campo, la regla y qué hacer; el escaneo de la página dice lo mismo', async () => {
  const [, shortName] = data.registry.scope.excluded_entities;
  const BASE = 'https://fabricante.example';
  // [dirección, regla, título de la regla, lo encontrado]
  const cases = [
    [`${BASE}/ficha?modelo=100,precio:350`, 'R-RULE-01', 'precio en datos estructurados o en un campo de precio', ',precio:'],
    [`${BASE}/fichas/EJ-1001.pdf`, 'R-RULE-03', 'marca de producto de ejemplo en producción', 'EJ-1001'],
    [`${BASE}/fichas/ej1001.pdf`, 'R-RULE-03', 'marca de producto de ejemplo en producción', 'ej1001'],
    [`${BASE}/fichas/test-001.pdf`, 'R-RULE-03', 'dato sintético de las pruebas automáticas', 'test-001'],
    [`${BASE}/${shortName.toLowerCase()}/ficha.pdf`, 'R-RULE-08', 'marca excluida', shortName.toLowerCase()],
    [`${BASE}/fichas/Solicitud%20enviada.pdf`, 'R-RULE-10', 'confirmación falsa en el contenido de un archivo', 'Solicitud enviada'],
    [`${BASE}/fichas/72090.pdf`, 'R-RULE-11', 'dirección publicada', '72090'],
    ['https://www.google.com/maps/place/guante', 'R-RULE-11', '«Visítanos», mapa o visita anunciada', 'google.com/maps'],
    [`${BASE}/ficha#00a6e5`, 'R-RULE-29', 'paleta anterior o tema oscuro', '#00a6e5'],
    [`${BASE}/ficha?correo=ventas@fabricante.example`, 'R-RULE-24', 'destino de contacto en una dirección', 'ventas@fabricante.example'],
    ['https://wa.me/5215555555555', 'R-RULE-24', 'destino de contacto en una dirección', 'https://wa.me/5215555555555'],
  ];
  for (const [field, change, markup, what] of ADDRESS_FIELDS) {
    for (const [address, id, title, found] of cases) {
      for (const status of STATUSES) {
        assert.deepEqual(review({ status, ...change(address) }), [`products[0].${field} (guante-ficticio): ${id}, ${title}: «${found}». La dirección se publica tal como está escrita; ${what}`], `${field} ${address} ${status}`);
      }
      assert.ok((await scanLinked(change(address), markup(address))).includes(`FAIL ${id}`), `escáner: ${field} ${address}`);
    }
  }
});

test('una dirección publicada con una palabra vigilada no da mensaje ni falla el escaneo; sin publicarla, el escaneo sí falla', async () => {
  for (const [field, change, markup] of ADDRESS_FIELDS) {
    for (const [address, id] of [
      ['https://fabricante.example/distribuidores-autorizados/ficha-guante.pdf', 'R-RULE-07'], ['https://fabricante.example/es/tienda-oficial/guante-100', 'R-RULE-07'],
      ['https://fabricante.example/promociones/guante-100.pdf', 'R-RULE-01'], ['https://fabricante.example/gratis/guante-100.pdf', 'R-RULE-02'],
    ]) {
      assert.deepEqual(review({ status: 'approved', ...change(address) }), [], `${field} ${address}`);
      assert.deepEqual(await scanLinked(change(address), markup(address)), [], `escáner: ${field} ${address}`);
      assert.deepEqual(await scanLinked(change(address), markup(address), { published: false }), [`FAIL ${id}`], `sin publicar: ${field} ${address}`);
    }
  }
});

test('las direcciones de brands.json y del registro no dan mensaje de la revisión de direcciones', () => {
  const addresses = [...new Set([
    ...data.brands.flatMap(brand => brand.manufacturerLinks.map(link => link.url)),
    ...data.registry.sources.flatMap(source => source.resources.map(resource => resource.url)),
    ...(data.registry.technical_references ?? []).map(reference => reference.url),
  ])].filter(address => typeof address === 'string');
  assert.ok(addresses.length > 19);
  const { urls } = registryLeaks(data.registry, data.brands);
  for (const address of addresses) {
    // Como origen de la foto: sin la revisión del registro de investigación.
    assert.deepEqual(review({ image: { ...PHOTO, sourceUrl: address } }), [], address);
    // Como documento o como foto: solo, si es del registro, el mensaje que lo dice.
    const registry = urls.includes(address);
    for (const [field, change] of ADDRESS_FIELDS.slice(0, 2)) {
      const messages = review(change(address));
      assert.equal(messages.length, registry ? 1 : 0, `${field} ${address}`);
      // El documento dice que el enlace no está entre los que su marca publica; la foto por dirección, que no se publica.
      if (registry) assert.match(messages[0], /: R-RULE-13, ese enlace es del registro de investigación y no (?:se publica|está entre los enlaces del fabricante publicados en brands\.json);/, `${field} ${address}`);
    }
  }
});

test('la revisión del texto reconoce las mismas familias de normas que el escaneo, y no una sigla dentro de un modelo', () => {
  const at = field => `products[0].${field} (guante-ficticio)`;
  const where = 'Una norma va solo en standards, con la página o el documento del fabricante donde consta; aquí escríbelo de otra forma o quítalo.';
  assert.deepEqual(review({ description: 'Cumple NFPA 9999.' }), [`${at('description')}: R-RULE-04, norma o valor técnico: «NFPA». ${where}`]);
  assert.deepEqual(review({ characteristics: ['Dato ficticio A', 'Con marcado CE', 'Dato ficticio C'] }), [`${at('characteristics[1]')}: R-RULE-04, norma o valor técnico: «marcado CE». ${where}`]);
  assert.deepEqual(review({ description: 'Cumple NOM 999.' }), [`${at('description')}: R-RULE-04, norma mexicana o nivel de protección: «NOM 999». ${where}`]);
  for (const description of ['Lente CE-200.', 'Serie UL-100.', 'Respirador N95.', 'Guante clase 0.']) assert.deepEqual(review({ description }), [], description);
});

test('un documento que enlaza una dirección del registro escrita de otra forma se informa igual; una página de producto bajo ella, no', () => {
  const guides = data.registry.sources.find(source => source.entity_id === 'mcr-safety').resources.find(resource => /guias-de-recursos\/$/.test(resource.url)).url;
  const message = 'products[0].documents[0].url (guante-ficticio): R-RULE-13, ese enlace es del registro de investigación y no está entre los enlaces del fabricante publicados en brands.json; enlaza la página o la ficha del producto en el sitio del fabricante, o el catálogo que publica su marca.';
  for (const url of [guides.slice(0, -1), `${guides}#x`, `${guides}?utm_source=boletin`, guides.replace('https://www.', 'https://'), guides.replace('guias', 'GU%49AS')]) {
    assert.deepEqual(review({ documents: [{ label: 'Guías', url }] }), [message], url);
  }
  const image = url => ({ url, width: 800, height: 600, alt: 'Guante ficticio', sourceUrl: SOURCE, usageConfirmed: true });
  assert.equal(review({ image: image(`${guides}#foto`) }).length, 1);
  for (const url of [`${guides}guia-de-tallas/`, `${guides.slice(0, -1)}.pdf`]) assert.deepEqual(review({ documents: [{ label: 'Guía', url }] }), [], url);
});
