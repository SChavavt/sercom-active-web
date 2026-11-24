import test from 'node:test';
import assert from 'node:assert/strict';
import { addressFinder, samePage } from '../src/lib/address-match.mjs';
import { registryFindings, registryLeaks } from '../scripts/scan-dist.mjs';
import { loadProjectData } from './helpers.mjs';

// Cuándo dos direcciones son la misma página, y dónde se encuentra una dirección dentro de un texto. Las direcciones de
// los casos sintéticos son de servidores «.example», que no existen; los casos con los datos reales usan el registro de
// investigación y brands.json tal como están.
const data = await loadProjectData();

const GUIDES = 'https://www.fabricante.example/recursos/guias/';
const SAME_AS_GUIDES = [
  // 1. El esquema: http, https y «//» cuentan igual, también en mayúsculas.
  'http://www.fabricante.example/recursos/guias/', '//www.fabricante.example/recursos/guias/', 'HTTPS://www.fabricante.example/recursos/guias/',
  // 2. El servidor: sin distinguir mayúsculas, con o sin «www.».
  'https://WWW.FABRICANTE.EXAMPLE/recursos/guias/', 'https://fabricante.example/recursos/guias/', 'https://Fabricante.Example/recursos/guias/',
  // 3. La ruta: sin las diagonales del final, sin distinguir mayúsculas, con su %XX decodificado (también dos veces) y con «\/».
  'https://www.fabricante.example/recursos/guias', 'https://www.fabricante.example/recursos/guias///', 'https://www.fabricante.example/RECURSOS/Guias/',
  'https://www.fabricante.example/recursos/gu%69as/', 'https://www.fabricante.example/recursos/gu%2569as/', 'https:\\/\\/www.fabricante.example\\/recursos\\/guias\\/',
  // 4. El fragmento no cuenta.
  'https://www.fabricante.example/recursos/guias/#catalogos', 'https://www.fabricante.example/recursos/guias#',
  // 5. Los pares que solo cuentan una visita no cuentan; una consulta vacía no es consulta.
  'https://www.fabricante.example/recursos/guias/?utm_source=x', 'https://www.fabricante.example/recursos/guias/?UTM_Campaign=otono&utm_medium=correo',
  'https://www.fabricante.example/recursos/guias/?fbclid=1&gclid=2&msclkid=3&mc_cid=4&mc_eid=5&igshid=6', 'https://www.fabricante.example/recursos/guias/?',
];
const NOT_SAME_AS_GUIDES = [
  // Otra página del mismo sitio: más honda, hermana, la de arriba, otra que empieza igual.
  'https://www.fabricante.example/recursos/guias/09-catalogo/', 'https://www.fabricante.example/recursos/guias.html', 'https://www.fabricante.example/recursos/',
  'https://www.fabricante.example/recursos/guias-de-otra-linea/',
  // Una consulta con un par que no es de una visita.
  'https://www.fabricante.example/recursos/guias/?producto=24', 'https://www.fabricante.example/recursos/guias/?utm_source=x&producto=24',
  // Otro servidor: un subdominio, el mismo nombre dentro de otro, otro puerto, «www.» dos veces.
  'https://tienda.fabricante.example/recursos/guias/', 'https://www.fabricante.example.otro.example/recursos/guias/',
  'https://www.fabricante.example:8443/recursos/guias/', 'https://www.www.fabricante.example/recursos/guias/',
  // Sin esquema ni «//» no es una dirección; un correo tampoco.
  'www.fabricante.example/recursos/guias/', 'fabricante.example/recursos/guias/', 'ventas@fabricante.example', '', undefined,
];

test('dos direcciones son la misma página con cualquier esquema, servidor con o sin www, ruta con o sin diagonal final, fragmento o pares de una visita', () => {
  for (const address of SAME_AS_GUIDES) {
    assert.ok(samePage(GUIDES, address), address);
    assert.ok(samePage(address, GUIDES), address);
  }
  for (const address of NOT_SAME_AS_GUIDES) assert.ok(!samePage(GUIDES, address), String(address));
});

test('la consulta es parte de la página: un conjunto de pares decodificados, en cualquier orden, con «+» y «%20» como espacio', () => {
  const sheet = 'https://www.fabricante.example/ficha?modelo=Serie+100&idioma=es';
  for (const address of [
    'https://fabricante.example/ficha/?idioma=es&modelo=Serie%20100', 'https://www.fabricante.example/ficha?modelo=Serie%2520100&idioma=es',
    `${sheet}&utm_campaign=x`, `${sheet}#ficha`, `${sheet}&idioma=es`, `${sheet}&&`,
  ]) assert.ok(samePage(sheet, address), address);
  for (const address of [
    'https://www.fabricante.example/ficha?modelo=Serie+100', 'https://www.fabricante.example/ficha?modelo=Serie+200&idioma=es',
    'https://www.fabricante.example/ficha?modelo=Serie%2B100&idioma=es', 'https://www.fabricante.example/ficha?Modelo=Serie+100&idioma=es',
    'https://www.fabricante.example/ficha', 'https://www.fabricante.example/ficha?modelo=Serie+100&idioma=es&pagina=2',
  ]) assert.ok(!samePage(sheet, address), address);
  // Un nombre sin valor es el mismo par que el nombre con «=».
  assert.ok(samePage('https://fabricante.example/ficha?vista', 'https://fabricante.example/ficha?vista='));
});

// Una lista como la del registro: una página de guías, la portada de un sitio y una plantilla sin consulta.
const LIST = ['https://www.fabricante.example/recursos/guias/', 'https://portada.example/', 'https://www.plantilla.example/producto/'];
const find = addressFinder(LIST);
const link = href => `<p>Antes</p><a href="${href}" target="_blank" rel="noopener noreferrer">Enlace</a><p>Después</p>`;

test('en un texto, una dirección se encuentra escrita de cualquiera de las formas de la misma página', () => {
  const found = [
    link(GUIDES), ...SAME_AS_GUIDES.filter(address => !address.includes('\\')).map(link),
    // Codificada entera dentro de otra dirección, una o dos veces, al final o seguida de otro par.
    link(`https://otro.example/ir?u=${encodeURIComponent(GUIDES)}`), link(`https://otro.example/ir?u=${encodeURIComponent(encodeURIComponent(GUIDES))}`),
    link(`https://otro.example/ir?u=${encodeURIComponent(GUIDES.slice(0, -1))}&x=1`), link(`https://otro.example/ir?u=${GUIDES}&x=1`),
    // En un script, con las diagonales escapadas o no; en un bloque JSON; en un atributo de datos.
    `<script>const u="${GUIDES.replaceAll('/', '\\/')}";</script>`, `<script>const u='${GUIDES}';</script>`, `<script>const u="https:\\u002F\\u002Fwww.fabricante.example\\u002Frecursos\\u002Fguias";</script>`,
    `<script type="application/ld+json">{"url":"${GUIDES}"}</script>`, `<div data-url="${GUIDES}">Guías</div>`,
    // En el texto, seguida de un signo de puntuación, entre paréntesis o con «www.» sin esquema.
    `<p>Ver ${GUIDES}.</p>`, `<p>Ver ${GUIDES.slice(0, -1)}, y más.</p>`, `<p>(${GUIDES})</p>`, `<p>«${GUIDES}»</p>`, `<p>Visita www.fabricante.example/recursos/guias hoy.</p>`,
    // Lo que el navegador limpia: «\», el puerto 443, un usuario, el punto final del servidor, un tabulador o un salto de
    // línea dentro del atributo, letras de ancho completo.
    link('https:\\\\www.fabricante.example\\recursos\\guias\\'), link('https://www.fabricante.example:443/recursos/guias/'), link('https://alguien@www.fabricante.example/recursos/guias/'),
    link('https://www.fabricante.example./recursos/guias/'), link('https://www.fabri\ncante.example/recursos/gu\tias/'), link('https://ｗｗｗ．fabricante．example/recursos/guias/'),
    link('https:www.fabricante.example/recursos/guias/'),
  ];
  for (const text of found) assert.deepEqual(find(text), [GUIDES], text);
  // La portada de un sitio, con o sin diagonal, con un fragmento o con pares de una visita.
  for (const text of [link('https://portada.example'), link('http://www.portada.example/#arriba'), link('https://portada.example/?utm_source=x'), '<p>Ver https://portada.example.</p>']) {
    assert.deepEqual(find(text), ['https://portada.example/'], text);
  }
  // Una plantilla sin consulta: con una consulta vacía o solo con pares de una visita es la misma página.
  for (const text of [link('https://www.plantilla.example/producto/?utm_source=x'), link('https://www.plantilla.example/producto/?'), '<p>Ver https://www.plantilla.example/producto/?</p>']) {
    assert.deepEqual(find(text), ['https://www.plantilla.example/producto/'], text);
  }
});

test('en un texto, otra página, un servidor sin «//» ni «www.», un correo y otro servidor no son la dirección', () => {
  for (const text of [
    // Otra página: más honda, hermana, la ruta continúa, una consulta con un par propio.
    link('https://www.fabricante.example/recursos/guias/09-catalogo/'), link('https://www.fabricante.example/recursos/guias.html'), link('https://www.fabricante.example/recursos/guias-de-otra-linea/'),
    link('https://www.plantilla.example/producto/?producto=24'), link('https://www.plantilla.example/producto/?producto=24&utm_source=x'), '<p>Ver https://www.plantilla.example/producto/?producto=24.</p>',
    link('https://www.plantilla.example/producto.html'), link('https://portada.example/productos/guante'), link('https://portada.example/~linea'),
    // Un servidor y una ruta sin «//» ni «www.»: una frase, no una dirección.
    '<p>Más información en fabricante.example/recursos/guias/</p>', '<p>Más información en portada.example.</p>',
    // Un correo nunca es la página de un sitio.
    '<p>Escribe a ventas@portada.example</p>', '<a href="mailto:ventas@portada.example">Correo</a>', '<p>Escribe a ventas@www.portada.example</p>',
    // Otro servidor: un subdominio, el mismo nombre dentro de otro, otro puerto, otro nombre que empieza igual.
    link('https://tienda.portada.example/'), link('https://portada.example.otro.example/'), link('https://portada.examplex/'), link('https://portada.example:8443/'),
    link('https://wwwportada.example/'),
    // Una ruta del propio sitio que empieza con el nombre del servidor.
    link('/www.fabricante.example/recursos/guias/'),
  ]) assert.deepEqual(find(text), [], text);
});

// Con los datos reales: la lista de guías de MCR Safety («no enlazar») y las páginas de Golden Eagle.
const leaks = registryLeaks(data.registry, data.brands);
const resourceOf = (entity, test) => data.registry.sources.find(source => source.entity_id === entity).resources.find(test);
const MCR_GUIDES = resourceOf('mcr-safety', resource => /guias-de-recursos\/$/.test(resource.url)).url;
const GOLDEN_TEMPLATE = resourceOf('golden-eagle', resource => /\/producto\/$/.test(resource.url)).url;
const SALSIFY = resourceOf('msa', resource => resource.type === 'catalog_platform').url;

test('la lista de guías de MCR Safety se encuentra escrita de cualquier forma: las que dejaba pasar la comparación letra por letra', () => {
  assert.equal(MCR_GUIDES, 'https://www.mcrsafety.com.mx/recursos/guias-de-recursos/');
  for (const written of [
    MCR_GUIDES.slice(0, -1), MCR_GUIDES.replace('www.mcrsafety', 'WWW.MCRSAFETY'), MCR_GUIDES.replace('https:', 'http:'), MCR_GUIDES.replace('www.', ''),
    `${MCR_GUIDES}#catalogos`, `${MCR_GUIDES}?utm_source=x`, MCR_GUIDES.replace('guias', 'gu%69as'), `https://example.com/r?u=${encodeURIComponent(MCR_GUIDES)}`,
  ]) assert.deepEqual(registryFindings(link(written), leaks).urls, [MCR_GUIDES], written);
  assert.deepEqual(registryFindings(`<script>const u="${MCR_GUIDES.replaceAll('/', '\\/')}";</script>`, leaks).urls, [MCR_GUIDES]);
  // El catálogo en línea de MSA con «+» escrito «%20» es la misma página.
  assert.deepEqual(registryFindings(link(SALSIFY.replaceAll('+', '%20')), leaks).urls, [SALSIFY]);
  // La guía del catálogo de MCR, que está debajo de la lista, es otra página (y está en el registro por sí misma).
  const catalogPage = resourceOf('mcr-safety', resource => /09-catalogo/.test(resource.url)).url;
  assert.deepEqual(registryFindings(link(catalogPage), leaks).urls, [catalogPage]);
  assert.deepEqual(registryFindings(link(`${MCR_GUIDES}otra-guia/`), leaks).urls, []);
});

test('las páginas de producto de Golden Eagle no son su plantilla del registro; la plantilla con pares de una visita sí', () => {
  assert.equal(GOLDEN_TEMPLATE, 'https://www.goldeneagle.com.mx/producto/');
  for (let id = 1; id <= 200; id += 1) {
    for (const written of [`${GOLDEN_TEMPLATE}?producto=${id}`, `${GOLDEN_TEMPLATE}?producto=${id}&utm_source=x`, `https://goldeneagle.com.mx/producto?producto=${id}#ficha`]) {
      assert.deepEqual(registryFindings(link(written), leaks).urls, [], written);
    }
  }
  for (const written of [GOLDEN_TEMPLATE, `${GOLDEN_TEMPLATE}?utm_source=x`, `${GOLDEN_TEMPLATE}?`, `${GOLDEN_TEMPLATE}#x`, 'http://goldeneagle.com.mx/producto']) {
    assert.deepEqual(registryFindings(link(written), leaks).urls, [GOLDEN_TEMPLATE], written);
  }
  // «goldeneagle.com.mx» en una frase no es una dirección.
  assert.deepEqual(registryFindings('<p>Más información en goldeneagle.com.mx/producto/.</p>', leaks).urls, []);
});

test('la comparación nueva agrega hallazgos y no quita ninguno: cada dirección del registro escrita tal cual se sigue encontrando', () => {
  assert.ok(leaks.urls.length >= 10);
  for (const url of leaks.urls) {
    for (const text of [link(url), `<p>${url}</p>`, `${url},https://otro.example/`, `["${url}"]`, `${url}ñ`]) {
      assert.ok(registryFindings(text, leaks).urls.includes(url), `${url} en ${text}`);
    }
  }
});

test('una dirección del registro que es la misma página que un enlace publicado en brands.json está publicada, escrita como sea', () => {
  const registry = { sources: [{ entity_id: 'fabricante', resources: [{ url: 'https://www.fabricante.example/catalogo/', label: 'Catálogo', verification: 'accesible' }, { url: GUIDES, label: 'Guías', verification: 'accesible' }] }] };
  const brands = [{ id: 'fabricante', manufacturerLinks: [{ label: 'Catálogo en línea del fabricante', url: 'https://fabricante.example/catalogo' }] }];
  const own = registryLeaks(registry, brands);
  assert.deepEqual(own.urls, [GUIDES]);
  for (const written of ['https://fabricante.example/catalogo', 'https://www.fabricante.example/catalogo/', 'http://FABRICANTE.example/catalogo#x']) {
    assert.deepEqual(registryFindings(link(written), own).urls, [], written);
  }
  // Con los datos reales, ninguna dirección del registro sin publicar es la misma página que un enlace publicado.
  const published = data.brands.flatMap(brand => brand.manufacturerLinks.map(entry => entry.url));
  assert.equal(published.length, 21);
  for (const url of leaks.urls) for (const entry of published) assert.ok(!samePage(url, entry), `${url} y ${entry}`);
  // Y ningún enlace publicado contiene una dirección del registro sin publicar.
  for (const entry of published) assert.deepEqual(registryFindings(link(entry), leaks).urls, [], entry);
});
