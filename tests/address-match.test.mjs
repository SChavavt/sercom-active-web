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

// Una dirección se lee como la lee el navegador: con el analizador de direcciones de la plataforma. Cada punto de la
// cabecera de src/lib/address-match.mjs con direcciones que son la misma página y otras que no, escritas a mano con
// servidores «.example»; entre ellas, las grafías que la revisión probó y que el navegador abre como la página.
const PAGE = 'https://www.fabricante.example/recursos/guias/';
const READ_AS_PAGE = {
  // 1. Antes de leerla: «\/», «\x2f» y «/» de un script o un JSON son «/», «\» es «/» y «//» es https.
  antes: [
    'https:\\x2f\\x2fwww.fabricante.example\\x2frecursos\\x2fguias\\x2f', 'https:\\u002F\\u002Fwww.fabricante.example\\u002Frecursos\\u002Fguias',
    'https:\\\\www.fabricante.example\\recursos\\guias\\', '//fabricante.example/recursos/guias', 'http://fabricante.example/recursos/guias/',
  ],
  // 2. El servidor como lo deja el analizador: letras que el navegador lleva a otras, caracteres que quita, %XX, el
  //    punto ideográfico y el punto final.
  servidor: [
    'https://www.\u{1D41F}abricante.example/recursos/guias/', 'https://www.\u{1D523}abricante.example/recursos/guias/', 'https://www.fabricantᵉ.example/recursos/guias/',
    'https://www.ⓕabricante.example/recursos/guias/', 'https://ｗｗｗ．ｆａｂｒｉｃａｎｔｅ．example/recursos/guias/', 'https://www。fabricante。example/recursos/guias/',
    'https://www.fabri­cante.example/recursos/guias/', 'https://www.fabri​cante.example/recursos/guias/', 'https://www.fabri͏cante.example/recursos/guias/',
    'https://www.fabri️cante.example/recursos/guias/', 'https://www%2Efabricante.example/recursos/guias/', 'https://www.FABRICANTE.example./recursos/guias/',
    // U+FEFF, escrito con escape porque no se ve: el analizador lo quita del servidor, y con su %XX también.
    'https://www.fabri\uFEFFcante.example/recursos/guias/', 'https://www.fabri%EF%BB%BFcante.example/recursos/guias/',
  ],
  // 3. El puerto: 443 y 80 no cuentan, tampoco «:0443» ni un puerto vacío.
  puerto: [
    'https://www.fabricante.example:443/recursos/guias/', 'https://www.fabricante.example:0443/recursos/guias/', 'https://www.fabricante.example:/recursos/guias/',
    'http://www.fabricante.example:80/recursos/guias/', 'https://www.fabricante.example:80/recursos/guias/', 'http://www.fabricante.example:443/recursos/guias/',
  ],
  // 4. El usuario antes del servidor no cuenta, con cuantas «@» lleve.
  usuario: [
    'https://a@b@www.fabricante.example/recursos/guias/', 'https://usuario:clave@www.fabricante.example/recursos/guias/', "https://a'b@www.fabricante.example/recursos/guias/",
    'https://@www.fabricante.example/recursos/guias/',
  ],
  // 5. La ruta: los segmentos «.» y «..» (también %2e, y los que aparecen al decodificar) y las diagonales repetidas.
  ruta: [
    'https://www.fabricante.example/recursos/./guias/', 'https://www.fabricante.example/recursos/x/../guias/', 'https://www.fabricante.example/recursos/%2e/guias/',
    'https://www.fabricante.example/x/%2E%2E/recursos/guias/', 'https://www.fabricante.example/recursos/x/.%2e/guias/', 'https://www.fabricante.example/recursos/guias/.',
    'https://www.fabricante.example/recursos/guias/x/..', 'https://www.fabricante.example/./recursos/guias/', 'https://www.fabricante.example/recursos//guias/',
    'https://www.fabricante.example//recursos/guias/', 'https://www.fabricante.example/recursos///guias//', 'https://www.fabricante.example/recursos/%252e/guias/',
    'https://www.fabricante.example/x/%252e%252e/recursos/guias/', 'https://www.fabricante.example/recursos/%2F/guias/',
  ],
  // 6. La consulta: los pares que solo cuentan una visita, también los que agrega la lista.
  consulta: [
    'srsltid=AfmBOo', '_gl=1*abc', '_ga=2.1', 'gclsrc=aw.ds', 'dclid=x', 'gbraid=x', 'wbraid=x', 'gad_source=1', 'gad_campaignid=2', 'yclid=3',
    'twclid=4', 'ttclid=5', 'li_fat_id=6', '_hsenc=7', '_hsmi=8', 'mkt_tok=9', 'SRSLTID=x&_GL=y',
  ].map(pair => `${PAGE}?${pair}`),
  // 7. El fragmento no cuenta, diga lo que diga.
  fragmento: [`${PAGE}#x`, `${PAGE}#/../../otra/`, `${PAGE}#?producto=24`],
};
const NOT_READ_AS_PAGE = {
  antes: ['https://www.fabricante.example:99999/recursos/guias/', 'https://www.fabri cante.example/recursos/guias/', 'ftp://www.fabricante.example/recursos/guias/', 'https://', '///recursos/guias/'],
  servidor: ['https://www.ƒabricante.example/recursos/guias/', 'https://www.fabricantes.example/recursos/guias/', 'https://www.fabricante.example.otro.example/recursos/guias/'],
  puerto: ['https://www.fabricante.example:8443/recursos/guias/', 'https://www.fabricante.example:8080/recursos/guias/', 'http://www.fabricante.example:1/recursos/guias/'],
  usuario: ['https://www.fabricante.example@otro.example/recursos/guias/', 'https://www.fabricante.example:clave@otro.example/recursos/guias/'],
  ruta: [
    'https://www.fabricante.example/recursos/guias/..', 'https://www.fabricante.example/recursos/guias/../otra/', 'https://www.fabricante.example/recursos/.guias/',
    'https://www.fabricante.example/recursos/guias/.../', 'https://www.fabricante.example/recursos/guias/%2e%2e%2e/', 'https://www.fabricante.example/recursos/guias/%23x',
  ],
  consulta: ['lang=es', '=', 'srsltid2=x', '_gl_x=1', 'gad=1'].map(pair => `${PAGE}?${pair}`),
  fragmento: ['https://www.fabricante.example/recursos/guias/%23x', 'https://www.fabricante.example/recursos/guias/x#'],
};

test('cada punto de la lectura: direcciones que el navegador abre como la misma página y otras que no', () => {
  for (const [point, list] of Object.entries(READ_AS_PAGE)) {
    for (const address of list) {
      assert.ok(samePage(PAGE, address), `${point}: ${JSON.stringify(address)}`);
      assert.ok(samePage(address, PAGE), `${point}: ${JSON.stringify(address)}`);
    }
  }
  for (const [point, list] of Object.entries(NOT_READ_AS_PAGE)) for (const address of list) assert.ok(!samePage(PAGE, address), `${point}: ${JSON.stringify(address)}`);
});

test('el servidor: «ſ» es «s», un nombre con acentos es el mismo servidor que su forma xn--, y un servidor con puerto propio se compara con él', () => {
  assert.ok(samePage('https://www.casco.example/', 'https://www.caſco.example/'));
  for (const written of ['https://xn--sealizacin-u9a5a.example/gu%C3%ADas/', 'https://SEÑALIZACIÓN.example/guías', 'https://www.señalización.example/gu%C3%ADas/']) {
    assert.ok(samePage('https://señalización.example/guías/', written), written);
  }
  assert.ok(!samePage('https://señalización.example/guías/', 'https://senalizacion.example/guías/'));
  assert.ok(samePage('https://www.fabricante.example:8443/x', 'http://fabricante.example:8443/x/'));
  assert.ok(!samePage('https://www.fabricante.example:8443/x', 'https://www.fabricante.example/x'));
  // La plantilla de un sitio que sirve «//producto/» como «/producto/»: con dos diagonales es la misma página; con su
  // consulta, otra.
  assert.ok(samePage('https://www.plantilla.example/producto/', 'https://www.plantilla.example//producto/'));
  assert.ok(!samePage('https://www.plantilla.example/producto/', 'https://www.plantilla.example//producto/?producto=1'));
});

// En un texto: las mismas grafías dentro de un href, una frase, una cadena de JSON y un srcset.
const WRITTEN_IN = {
  href: address => `<p>Antes</p><a href="${address}">Enlace</a><p>Después</p>`,
  frase: address => `<p>Más información en ${address} hoy.</p>`,
  json: address => `<script type="application/json">${JSON.stringify({ url: address })}</script>`,
  srcset: address => `<img srcset="${address} 1x, /foto.png 2x" alt="">`,
};
// Lo que termina una dirección escrita en un texto (una comilla, un espacio) no puede ir en ella: esa grafía la lee el
// escáner en el valor entero de un atributo. U+FEFF sí puede ir: una expresión regular lo cuenta como espacio («\s»),
// pero el navegador lo quita del servidor y no termina nada.
const writable = address => !/[^\S\uFEFF]|['"]/.test(address);

test('en un texto, cada grafía que el navegador abre como la página se encuentra en un href, una frase, un JSON y un srcset', () => {
  const findPage = addressFinder([PAGE, 'https://www.otra.example/']);
  for (const [point, list] of Object.entries(READ_AS_PAGE)) {
    for (const address of list.filter(writable)) {
      for (const [where, write] of Object.entries(WRITTEN_IN)) assert.deepEqual(findPage(write(address)), [PAGE], `${point}, ${where}: ${JSON.stringify(address)}`);
    }
  }
  // «ftp://» lleva «//», y en un texto «//» empieza una dirección; un texto también se lee con su %XX decodificado, así
  // que «%23» ahí es un «#»; los signos del final, abajo.
  for (const [point, list] of Object.entries(NOT_READ_AS_PAGE)) {
    for (const address of list.filter(address => writable(address) && !address.startsWith('ftp:') && !address.includes('%23') && !/[.,;:!?)\]]$/.test(address))) {
      for (const [where, write] of Object.entries(WRITTEN_IN)) assert.deepEqual(findPage(write(address)), [], `${point}, ${where}: ${JSON.stringify(address)}`);
    }
  }
  // Los signos al final de una dirección escrita pueden ser la puntuación de la frase: se lee sin ellos y con ellos. Así
  // «…/guias/x/..» es la página (con ellos), y «…/guias/..», que el navegador abre como «…/recursos/», también se toma
  // por ella (sin ellos): una falsa alarma posible, en el lado seguro.
  for (const [where, write] of Object.entries(WRITTEN_IN)) assert.deepEqual(findPage(write('https://www.fabricante.example/recursos/guias/..')), [PAGE], where);
});

test('en un texto, una dirección de la lista con puerto propio, la plantilla con dos diagonales y «ſ» en el servidor se encuentran', () => {
  const findList = addressFinder(['https://www.fabricante.example:8443/x', 'https://www.plantilla.example/producto/', 'https://www.casco.example/']);
  for (const [address, expected] of [
    ['http://fabricante.example:8443/x/', ['https://www.fabricante.example:8443/x']], ['https://www.fabricante.example/x', []], ['https://www.fabricante.example:8080/x', []],
    ['https://www.plantilla.example//producto/', ['https://www.plantilla.example/producto/']], ['https://www.plantilla.example//producto/?producto=1', []],
    ['https://www.caſco.example/', ['https://www.casco.example/']],
  ]) {
    for (const [where, write] of Object.entries(WRITTEN_IN)) assert.deepEqual(findList(write(address)), expected, `${where}: ${address}`);
  }
});

test('en un texto, «&» justo después de la ruta termina la dirección, también una que el navegador limpia; lo que continúa la ruta es otra', () => {
  const findPage = addressFinder([PAGE]);
  for (const text of [
    'https://otro.example/ir?u=https://www.fabricante.example/recursos/./guias/&x=1', 'https://otro.example/ir?u=https://www.fabricante.example:0443/recursos/guias&x=1',
    `https://otro.example/ir?u=${encodeURIComponent('https://www.fabricante.example//recursos/guias/')}&x=1`, 'https://www.fabricante.example/recursos/guias&x=1',
  ]) assert.deepEqual(findPage(text), [PAGE], text);
  for (const text of ['https://www.fabricante.example/recursos/guias-&x=1', 'https://www.fabricante.example/recursos/guias/x&y', 'https://www.fabricante.example/recursos/./guias/09-catalogo/']) {
    assert.deepEqual(findPage(text), [], text);
  }
});

test('en un JSON o un script, un tabulador o un salto de línea escrito con escape dentro de la dirección se quita, y uno al final la termina', () => {
  const findPage = addressFinder([PAGE]);
  // Dentro de la ruta: el script recibe el tabulador o el salto de línea, y el navegador lo quita de la dirección.
  for (const text of [
    '{"u":"https://www.fabricante.example/recursos/gui\\tas/"}', '{"u":"https://www.fabricante.example/recursos/gui\\nas/"}',
    '{"u":"https:\\/\\/www.fabricante.example\\/recursos\\/gui\\r\\nas\\/"}', '<script>location.href = "https://www.fabri\\u0009cante.example/recursos/guias/";</script>',
    "<script>location.href = 'https://www.fabricante.example/recursos/gui\\x0Aas/';</script>", '{"u":"https://www.fabricante.example/recursos/gui\\u000Das/"}',
  ]) assert.deepEqual(findPage(text), [PAGE], text);
  // Al final de la dirección, el escape la termina: lo que sigue es otro texto.
  for (const text of ['{"t":"Ver https://www.fabricante.example/recursos/guias/\\nOtra línea"}', '{"t":"https://www.fabricante.example/recursos/guias\\tsiguiente"}']) {
    assert.deepEqual(findPage(text), [PAGE], text);
  }
  // Otra página escrita con escapes sigue siendo otra página.
  for (const text of ['{"u":"https://www.fabricante.example/recursos/gui\\tas/09-catalogo/"}', '{"u":"https://www.fabricante.example/recursos/guias\\\\nuevo"}']) {
    assert.deepEqual(findPage(text), [], text);
  }
});

test('un tabulador o un salto de línea en el esquema o entre las dos diagonales se quita antes de leer la dirección, como lo hace el navegador', () => {
  for (const written of ['ht\ttps://www.fabricante.example/recursos/guias/', 'https:/\n/www.fabricante.example/recursos/guias/', '/\r\n/www.fabricante.example/recursos/guias/']) {
    assert.ok(samePage(written, PAGE), JSON.stringify(written));
  }
  assert.ok(!samePage('ht\ttps://www.fabricante.example/recursos/otras/', PAGE));
});

test('en un JSON, una dirección sin esquema con sus diagonales escapadas («\\/\\/www…») se encuentra', () => {
  const findPage = addressFinder([PAGE]);
  for (const text of ['{"u":"\\/\\/www.fabricante.example\\/recursos\\/guias\\/"}', '{"u":"\\u002f\\u002fwww.fabricante.example\\u002frecursos\\u002fguias\\u002f"}']) {
    assert.deepEqual(findPage(text), [PAGE], text);
  }
  assert.deepEqual(findPage('{"u":"\\/\\/www.fabricante.example\\/recursos\\/otras\\/"}'), []);
});

test('en un texto, U+FEFF no termina una dirección: el navegador lo quita del servidor, así que el texto se lee también sin él', () => {
  const findPage = addressFinder([PAGE]);
  // Dentro del servidor, en cada lugar donde puede ir una dirección: al principio, en medio y al final del nombre.
  for (const written of [
    'https://www.fabri\uFEFFcante.example/recursos/guias/', 'https://www.fabricante.example\uFEFF/recursos/guias/', '//\uFEFFwww.fabricante.example/recursos/guias',
    'http://fabricante\uFEFF.\uFEFFexample/recursos/guias/#x',
  ]) {
    assert.ok(samePage(written, PAGE), JSON.stringify(written));
    for (const [where, write] of Object.entries(WRITTEN_IN)) assert.deepEqual(findPage(write(written)), [PAGE], `${where}: ${JSON.stringify(written)}`);
  }
  // Después de la dirección la sigue terminando, como un espacio: lo que sigue es otro texto.
  assert.deepEqual(findPage(`Ver ${PAGE}\uFEFFy después`), [PAGE]);
  // Otra página con U+FEFF en el servidor sigue siendo otra página.
  for (const [where, write] of Object.entries(WRITTEN_IN)) assert.deepEqual(findPage(write('https://www.fabri\uFEFFcante.example/recursos/otras/')), [], where);
  // En la ruta el navegador no lo quita («…/gui%EF%BB%BFas/» es otra página), pero la lectura sin él la toma por la
  // página: una falsa alarma posible, en el lado seguro.
  assert.ok(!samePage('https://www.fabricante.example/recursos/gui\uFEFFas/', PAGE));
  assert.deepEqual(findPage('<a href="https://www.fabricante.example/recursos/gui\uFEFFas/">x</a>'), [PAGE]);
});

test('lo que la búsqueda en un texto no ve, como dice la cabecera del módulo: un usuario con un espacio, unas comillas, «<» o una llave, y un tabulador escrito tal cual fuera de unas comillas', () => {
  const findPage = addressFinder([PAGE]);
  // El navegador abre estas direcciones como la página, pero la dirección escrita termina en el espacio o en el signo.
  for (const written of [
    'https://a b@www.fabricante.example/recursos/guias/', 'https://a"b@www.fabricante.example/recursos/guias/', 'https://a<b@www.fabricante.example/recursos/guias/',
    'https://a{b}@www.fabricante.example/recursos/guias/', 'https://a«b@www.fabricante.example/recursos/guias/',
  ]) {
    assert.ok(samePage(written, PAGE), written);
    assert.deepEqual(findPage(`<p>Ver ${written} hoy</p>`), [], written);
    assert.deepEqual(findPage(`0; url=${written}`), [], written);
  }
  // Un tabulador o un salto de línea escrito tal cual termina la dirección en una frase; entre comillas sin «<» ni «>», se quita.
  assert.deepEqual(findPage('<p>Ver https://www.fabricante.example/recursos/gui\tas/ hoy</p>'), []);
  assert.deepEqual(findPage('<p>Ver https://www.fabricante.example/recursos/gui\nas/ hoy</p>'), []);
  assert.deepEqual(findPage('<a href="https://www.fabricante.example/recursos/gui\tas/">Guías</a>'), [PAGE]);
  assert.deepEqual(findPage(`<script>location.href = 'https://www.fabricante.example/recursos/gui\tas/#>';</script>`), []);
});
