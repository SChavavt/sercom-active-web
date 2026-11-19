import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { CHECKS, RULES, scanDist } from '../scripts/scan-dist.mjs';
import { EXAMPLE_TAG, PREVIEW_NOTICE } from '../src/lib/site-data-core.mjs';
import { loadProjectData, makeTree, removeTree, ROOT } from './helpers.mjs';

const data = await loadProjectData();
const ROBOTS = 'User-agent: *\nDisallow: /\n';
const WHATSAPP = `https://wa.me/${data.business.whatsappDigits}`;

/** Página mínima que cumple todas las reglas. */
function page(body = '<h1>Inicio</h1>', { head = '', notice = false, lang = 'es-MX', robots = '<meta name="robots" content="noindex, nofollow">', skip = '<a href="#contenido">Saltar al contenido</a>' } = {}) {
  return `<!doctype html><html lang="${lang}"><head><meta charset="UTF-8">${robots}<title>Sercom Active</title>${head}</head>`
    + `<body>${notice ? `<p class="aviso">${PREVIEW_NOTICE}</p>` : ''}${skip}<main id="contenido">${body}</main></body></html>`;
}
const previewPage = (body, options) => page(body, { ...options, notice: true });
const exampleCard = (example, tag = true) => `<article><h2>${example.name}</h2><p>${example.brandName} · ${example.code}</p>${tag ? `<span class="tag">${EXAMPLE_TAG}</span>` : ''}</article>`;

/** Escanea un sitio temporal. `files` se suma a un sitio mínimo válido (index.html y robots.txt). */
async function scan(files = {}, options = {}) {
  const directory = await makeTree({ 'robots.txt': ROBOTS, 'index.html': page(), ...files });
  try {
    return await scanDist(directory, { data, ...options });
  } finally {
    await removeTree(directory);
  }
}
const failures = result => result.findings.filter(finding => finding.level === 'FAIL');
const failedIds = result => [...new Set(failures(result).map(finding => finding.id))].sort();
const warnedIds = result => [...new Set(result.findings.filter(finding => finding.level === 'WARN').map(finding => finding.id))].sort();
/** Comprueba que cada fragmento, puesto en una página, produce un FAIL de la regla (y solo de esa regla). */
async function assertEachFails(id, bodies, options) {
  for (const body of bodies) assert.deepEqual(failedIds(await scan({ 'pagina/index.html': page(body) }, options)), [id], body);
}
async function assertNoneFails(bodies, options) {
  for (const body of bodies) assert.deepEqual(failures(await scan({ 'pagina/index.html': page(body) }, options)), [], body);
}

test('un sitio mínimo correcto no tiene hallazgos', async () => {
  const result = await scan({
    'contacto/index.html': page(`<h1>Contacto</h1><p>¿Por qué no aparecen precios?</p><p>La disponibilidad y el tiempo de entrega se confirman al cotizar.</p>
      <a href="${WHATSAPP}?text=Hola%2C%20Yosmara.">Contactar por WhatsApp</a> <a href="mailto:${data.business.email}?subject=Solicitud%20de%20cotizaci%C3%B3n">${data.business.email}</a>
      <a href="tel:+${data.business.whatsappDigits}">${data.business.whatsappDisplay}</a> <img src="/logo.svg" alt="Sercom Active">
      <a href="https://www.ansell.com/mx/es/industrial" rel="noopener">Sitio del fabricante</a><p>Por ejemplo, guantes y lentes.</p>`),
    '_astro/sitio.css': ':root{color-scheme:light;--ink:#19171a;--blue:#0067b0}',
    '_astro/buscar.js': 'const q=new URLSearchParams(location.search).get("q");',
    'logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"><title>Sercom Active</title></svg>',
  });
  assert.deepEqual(result.findings, []);
  assert.equal(result.pages, 2);
  assert.equal(result.files, 6);
});

test('R-RULE-08: la marca excluida, con cualquier escritura y en cualquier archivo', async () => {
  const [longName, shortName] = data.registry.scope.excluded_entities;
  const spaced = shortName.split('').join('.');
  await assertEachFails('R-RULE-08', [
    `<p>${longName}</p>`, `<p>${longName.toUpperCase()}</p>`, `<p>${longName.toLowerCase().replace(' ', '   ')}</p>`,
    `<p>${longName.replace(' ', '-')}</p>`, `<p>${longName.replace(' ', '')}</p>`, `<p>${longName.replace(' ', '_')}</p>`,
    `<p>Guante Internacional</p>`, `<p>${shortName}</p>`, `<p>marca ${shortName.toLowerCase()}.</p>`, `<p>${spaced}</p>`, `<p>${shortName.split('').join(' ')}</p>`,
    `<a href="/marcas/${encodeURIComponent(longName.toLowerCase())}/">Marca</a>`, `<p>&#71;ISA</p>`, `<img src="/logo.svg" alt="Logotipo de ${shortName}">`,
    `<p data-marca="${shortName.toLowerCase()}">Marca</p>`, `<!-- ${longName} -->`,
  ]);
  for (const [path, content] of [
    ['_astro/datos.js', `const marcas=["${longName}"];`], ['datos.json', JSON.stringify({ marca: shortName })], ['_astro/sitio.css', `.${shortName.toLowerCase()}-logo{display:none}`],
    [`img/${shortName.toLowerCase()}.png`, Buffer.from([0x89, 0x50, 0x4e, 0x47])], [`marcas/${longName.toLowerCase().replace(' ', '-')}/index.html`, page()],
  ]) {
    assert.ok(failedIds(await scan({ [path]: content })).includes('R-RULE-08'), path);
  }
  // Palabras parecidas que no son la marca excluida.
  await assertNoneFails(['<p>Guantes de uso internacional</p>', '<p>Registro sagisal</p>', '<p>Comercio internacional de guantes</p>']);
});

test('R-RULE-01 y R-RULE-02: precios, monedas, descuentos y «gratis»', async () => {
  await assertEachFails('R-RULE-01', [
    '<p>$1,250.00</p>', '<p>$ 99</p>', '<p>MXN 350</p>', '<p>350 pesos</p>', '<p>1,200 MXN</p>', '<p>USD 20</p>', '<p>Precio desde 10 piezas</p>',
    '<p>Precios de lista</p>', '<p>Descuento por volumen</p>', '<p>Guantes en oferta</p>', '<p>Promoción de temporada</p>', '<p>Rebajas</p>',
    '<script type="application/ld+json">{"@type":"Product","offers":{"price":"10"}}</script>',
    '<script type="application/ld+json">{"@context":"https://schema.org/Offer"}</script>', '<span itemprop="price">10</span>',
  ]);
  assert.ok(failedIds(await scan({ 'datos.json': '{"precio": 120}' })).includes('R-RULE-01'));
  assert.ok(failedIds(await scan({ '_astro/app.js': 'const p={"price":10};' })).includes('R-RULE-01'));
  await assertEachFails('R-RULE-02', ['<p>Muestra gratis</p>', '<p>Asesoría gratuita</p>']);
  // Cifras y frases que no son un precio.
  await assertNoneFails([
    '<p>¿Por qué no aparecen precios?</p>', '<p>La cotización se prepara según el producto, la cantidad y las condiciones del requerimiento.</p>',
    '<p>Cono de 71 cm</p>', '<p>Código 37-175, talla 9</p>', '<p>Lunes a viernes de 9:00 a 18:00</p>', '<p>Solicita tu cotización</p>',
  ]);
});

test('R-RULE-07: «oficial», «autorizado» y afirmaciones de representación', async () => {
  await assertEachFails('R-RULE-07', [
    '<a href="https://www.ansell.com/mx/es/industrial">Sitio oficial</a>', '<p>Distribuidor autorizado</p>', '<p>Marca oficialmente representada</p>',
    '<p>Somos distribuidores</p>', '<p>Nuestra sucursal Puebla</p>', '<p>Centro AUTORIZADO</p>', '<p>Tiendas autorizadas</p>',
    '<a href="/" aria-label="Sitio oficial">Inicio</a>', '<img src="/logo.svg" alt="Representante de la marca">',
    '<script>document.title="Sitio oficial";</script>',
  ]);
  assert.ok(failedIds(await scan({ '_astro/app.js': 'el.textContent="Distribuidor autorizado";' })).includes('R-RULE-07'));
  await assertNoneFails(['<a href="https://www.ansell.com/mx/es/industrial">Sitio del fabricante</a>', '<p>Marcas que manejamos</p>', '<p>Atención comercial en Puebla</p>']);
});

test('R-RULE-10: confirmaciones falsas de recepción', async () => {
  await assertEachFails('R-RULE-10', [
    '<p>Recibimos tu solicitud</p>', '<p>¡Mensaje enviado!</p>', '<p>Tu lista fue enviada con éxito</p>', '<p>Gracias por tu mensaje</p>',
    '<p>Tu folio es 1234</p>', '<p>Solicitud recibida</p>', '<p hidden>Solicitud enviada</p>', '<p>Tu número de seguimiento</p>',
    '<script>status.textContent="Mensaje enviado";</script>',
  ]);
  assert.ok(failedIds(await scan({ '_astro/app.js': 'alert("Gracias por tu solicitud")' })).includes('R-RULE-10'));
  await assertNoneFails(['<p>Se abrirá WhatsApp con un borrador. Revísalo y envíalo desde tu aplicación.</p>', '<p>Enviar mi lista por WhatsApp</p>']);
});

test('R-RULE-29: paleta anterior y tema oscuro', async () => {
  for (const css of ['a{color:#0e2a3d}', 'a{color:#0E2A3D}', 'a{background:#00a6e5}', 'a{color:rgb(14, 42, 61)}', 'a{color:rgba(0,166,229,.5)}',
    '@media (prefers-color-scheme: dark){a{color:#fff}}', ':root{color-scheme:light dark}', 'a{background:url("data:image/svg+xml,%3Csvg fill=\'%230e2a3d\'/%3E")}']) {
    assert.deepEqual(failedIds(await scan({ '_astro/sitio.css': css })), ['R-RULE-29'], css);
  }
  await assertEachFails('R-RULE-29', ['<p style="color:#0e2a3d">Texto</p>', '<svg><path fill="#00A6E5" d="M0 0"/></svg>']);
  assert.deepEqual(failedIds(await scan({ 'index.html': page('<h1>Inicio</h1>', { head: '<meta name="theme-color" content="#0e2a3d">' }) })), ['R-RULE-29']);
  assert.deepEqual(failures(await scan({ '_astro/sitio.css': ':root{color-scheme:light;--ink:#19171a;--blue:#0067b0;--otro:#0e2a3df0}' })), []);
});

test('R-RULE-12: noindex en cada página, robots.txt bloqueado y sin sitemap hasta el lanzamiento', async () => {
  const withoutMeta = await scan({ 'catalogo/index.html': page('<h1>Catálogo</h1>', { robots: '' }) });
  assert.deepEqual(failures(withoutMeta).map(finding => [finding.id, finding.file]), [['R-RULE-12', 'catalogo/index.html']]);
  assert.deepEqual(failedIds(await scan({ 'index.html': page('<h1>Inicio</h1>', { robots: '<meta name="robots" content="index, follow">' }) })), ['R-RULE-12']);
  assert.deepEqual(failedIds(await scan({ 'index.html': page('<h1>Inicio</h1>', { robots: '<!-- <meta name="robots" content="noindex"> -->' }) })), ['R-RULE-12']);
  assert.deepEqual(failedIds(await scan({ 'robots.txt': 'User-agent: *\nAllow: /\n' })), ['R-RULE-12']);
  assert.deepEqual(failedIds(await scan({ 'robots.txt': 'User-agent: *\nDisallow: /privado/\n' })), ['R-RULE-12']);
  assert.deepEqual(failedIds(await scan({ 'sitemap-index.xml': '<sitemapindex/>' })), ['R-RULE-12']);
  // El orden de los atributos y las comillas no importan.
  assert.deepEqual(failures(await scan({ 'index.html': page('<h1>Inicio</h1>', { robots: "<meta content='NOINDEX,nofollow' name='robots'>" }) })), []);

  // Con --launch se exige lo contrario: los bloqueos se retiran a propósito.
  const launched = { 'index.html': page('<h1>Inicio</h1>', { robots: '' }), 'robots.txt': 'User-agent: *\nAllow: /\n', 'sitemap-index.xml': '<sitemapindex/>' };
  assert.deepEqual(failures(await scan(launched, { launch: true })), []);
  assert.deepEqual(failedIds(await scan({}, { launch: true })), ['R-PUB-03']);
  await assert.rejects(scan({}, { launch: true, preview: true }), /se excluyen/);
});

test('R-RULE-13: metadatos internos y registro de investigación', async () => {
  for (const [path, content] of [
    ['_astro/datos.js', 'var c={schemaVersion:1,products:[]};'], ['_astro/datos.js', 'const p={approval:{by:"x"}};'], ['datos.json', '{"image":{"usageConfirmed":true}}'],
    ['datos.json', '{"source":{"checkedOn":"2026-11-18"}}'], ['_astro/negocio.js', 'var b={whatsappTested:!1,inPersonAttentionConfirmed:!1};'],
    ['datos.json', JSON.stringify(data.registry.sources[0])], ['_astro/registro.js', `var r=${JSON.stringify({ sources: [{ entity_id: 'x', next_action: 'y' }] })}`],
  ]) {
    assert.ok(failedIds(await scan({ [path]: content })).includes('R-RULE-13'), content.slice(0, 60));
  }
  await assertEachFails('R-RULE-13', ['<p data-approval=\'{"supplyConfirmed":true}\'>Producto</p>']);
  // Un enlace del registro que no es uno de los «Sitio del fabricante» publicados, y una nota interna.
  const published = new Set(data.brands.flatMap(brand => brand.manufacturerLinks.map(link => link.url)));
  const privateResource = data.registry.sources.flatMap(source => source.resources).find(resource => !published.has(resource.url));
  assert.deepEqual(failedIds(await scan({ 'marcas/index.html': page(`<a href="${privateResource.url.replaceAll('&', '&amp;')}">Catálogo</a>`) })), ['R-RULE-13']);
  assert.deepEqual(failedIds(await scan({ 'marcas/index.html': page(`<p>${data.registry.sources[0].next_action}</p>`) })), ['R-RULE-13']);
  assert.ok(failedIds(await scan({ '_astro/marcas.js': `var enlaces=["${privateResource.url}"];` })).includes('R-RULE-13'));
  // Los catorce enlaces publicados no son una fuga.
  const links = data.brands.flatMap(brand => brand.manufacturerLinks.map(link => `<a href="${link.url}">${link.label}</a>`)).join(' ');
  assert.equal(published.size, 14);
  assert.deepEqual(failures(await scan({ 'marcas/index.html': page(links) })), []);
  // Documentos sueltos: se listan para revisión.
  assert.deepEqual(warnedIds(await scan({ 'docs/plan.pdf': Buffer.from('%PDF-1.7') })), ['R-RULE-13']);
});

test('R-RULE-03 en producción: cualquier marca de ejemplo, en cualquier archivo', async () => {
  const example = data.examples[0];
  await assertEachFails('R-RULE-03', [
    `<p>${example.code}</p>`, `<p>Código ej-2001</p>`, `<p>${example.brandName}</p>`, `<p>MARCA DE EJEMPLO</p>`, `<p>${example.name}</p>`, `<p>Producto de&nbsp;ejemplo</p>`,
    `<a href="/productos/${example.id}/">Ver</a>`, `<span class="ejemplo-tag">Muestra</span>`, `<p>${PREVIEW_NOTICE}</p>`, `<option value="${example.variants[0].code}">Talla</option>`,
    `<p data-search="guante ${example.code.toLowerCase()}">Guante</p>`, `<script type="application/json">{"code":"${example.code}"}</script>`,
  ]);
  for (const [path, content] of [
    ['_astro/chunk.js', `const e=[{id:"${example.id}"}];`], ['_astro/chunk.js', 'var v=`Marca de ejemplo`;'], ['datos.json', JSON.stringify([example])],
    ['_astro/sitio.css', '.ejemplo-tag{color:red}'], ['buscar.xml', `<item>${example.name}</item>`], ['img/foto.png', Buffer.from(`\u0089PNG ${example.id}`)],
    [`productos/${example.id}/datos.txt`, 'x'], ['_astro/example-products.abc123.js', 'export default []'],
  ]) {
    assert.ok(failedIds(await scan({ [path]: content })).includes('R-RULE-03'), path);
  }
  // «por ejemplo» y palabras parecidas son texto normal.
  await assertNoneFails(['<p>Por ejemplo, guantes y lentes.</p>', '<p>Un ejemplar del catálogo</p>', '<p>Modelo EJE-100</p>', '<p>Ejemplo: 10 pares</p>']);
});

test('R-RULE-03 en vista previa: aviso en cada página y etiqueta «Ejemplo» en cada ejemplo', async () => {
  const [first, second, third] = data.examples;
  const options = { preview: true };
  const home = { 'index.html': previewPage('<h1>Inicio</h1>') };
  // Correcto: aviso en todas las páginas y una etiqueta por ejemplo.
  const complete = await scan({ ...home, 'catalogo/index.html': previewPage(exampleCard(first) + exampleCard(second) + exampleCard(third)) }, options);
  assert.deepEqual(complete.findings, []);
  // Falta el aviso en una página, aunque no muestre ejemplos.
  const withoutNotice = await scan({ ...home, 'contacto/index.html': page('<h1>Contacto</h1>') }, options);
  assert.deepEqual(failures(withoutNotice).map(finding => [finding.id, finding.file]), [['R-RULE-03', 'contacto/index.html']]);
  // El aviso escondido en un comentario o en un script no cuenta.
  assert.deepEqual(failedIds(await scan({ 'index.html': page(`<h1>Inicio</h1><!-- ${PREVIEW_NOTICE} --><script>var aviso=${JSON.stringify(PREVIEW_NOTICE)}</script>`) }, options)), ['R-RULE-03']);
  // Un ejemplo sin etiqueta, o tres ejemplos con dos etiquetas.
  assert.deepEqual(failedIds(await scan({ ...home, 'catalogo/index.html': previewPage(exampleCard(first, false)) }, options)), ['R-RULE-03']);
  const missingOne = await scan({ ...home, 'catalogo/index.html': previewPage(exampleCard(first) + exampleCard(second) + exampleCard(third, false)) }, options);
  assert.match(failures(missingOne)[0].message, /3 producto\(s\) de ejemplo en la página y 2 etiqueta\(s\) «Ejemplo»/);
  // El ejemplo se reconoce por su nombre, por su código o por el código de una variante.
  for (const body of [`<h1>${first.name}</h1>`, `<p>${first.code}</p>`, `<option value="${first.variants[0].code}">Talla 7</option>`, `<p>Código EJ-9999 sin registrar</p>`]) {
    assert.deepEqual(failedIds(await scan({ ...home, 'producto/index.html': previewPage(body) }, options)), ['R-RULE-03'], body);
    assert.deepEqual(failures(await scan({ ...home, 'producto/index.html': previewPage(`${body}<span>${EXAMPLE_TAG}</span>`) }, options)), [], body);
  }
  // La etiqueta debe ser exactamente «Ejemplo».
  assert.deepEqual(failedIds(await scan({ ...home, 'producto/index.html': previewPage(`<h1>${first.name}</h1><span>Ejemplo de diseño</span>`) }, options)), ['R-RULE-03']);
  // Una compilación de producción revisada como vista previa también falla: no lleva el aviso.
  assert.deepEqual(failedIds(await scan({}, options)), ['R-RULE-03']);
});

test('R-RULE-04 y R-RULE-06: normas y certificaciones son aviso en producción y fallo en la vista previa', async () => {
  for (const body of ['<p>Cumple ANSI Z87.1</p>', '<p>NOM-017-STPS</p>', '<p>EN 388</p>', '<p>ISO 20345</p>', '<p>NRR 25 dB</p>', '<p>Nivel de corte A4</p>']) {
    const production = await scan({ 'pagina/index.html': page(body) });
    assert.deepEqual([failedIds(production), warnedIds(production)], [[], ['R-RULE-04']], body);
    assert.deepEqual(failedIds(await scan({ 'index.html': previewPage('<h1>Inicio</h1>'), 'pagina/index.html': previewPage(body) }, { preview: true })), ['R-RULE-04'], body);
  }
  const certified = await scan({ 'pagina/index.html': page('<p>Producto certificado</p>') });
  assert.deepEqual([failedIds(certified), warnedIds(certified)], [[], ['R-RULE-06']]);
  await assertEachFails('R-RULE-06', ['<p>Más de 20 años de experiencia</p>', '<p>Empresa líder</p>', '<p>Calidad garantizada</p>']);
  // «en 2026» o «en 100 piezas» no son una norma.
  const plain = await scan({ 'pagina/index.html': page('<p>Catálogo en 2026 con guantes en 100 presentaciones</p>') });
  assert.deepEqual(plain.findings, []);
});

test('R-RULE-14: solo se generan páginas de registros que pueden mostrarse', async () => {
  // Producción: las diez categorías están en borrador y no hay fichas aprobadas.
  const draftCategory = await scan({ 'categorias/manos/index.html': page('<h1>Protección de manos</h1>') });
  assert.deepEqual(failures(draftCategory).map(finding => [finding.id, finding.file]), [['R-RULE-14', 'categorias/manos']]);
  assert.deepEqual(failedIds(await scan({ 'productos/guante-x/index.html': page('<h1>Guante</h1>') })), ['R-RULE-14']);
  assert.deepEqual(failedIds(await scan({ 'marcas/marca-desconocida/index.html': page('<h1>Marca</h1>') })), ['R-RULE-14']);
  // Las diecinueve marcas pueden tener página, y la lista de marcas puede existir sin ellas.
  const brandPages = Object.fromEntries(data.brands.map(brand => [`marcas/${brand.id}/index.html`, page(`<h1>${brand.name}</h1>`)]));
  assert.deepEqual(failures(await scan({ 'marcas/index.html': page('<h1>Marcas</h1>'), ...brandPages })), []);
  assert.deepEqual(failures(await scan({ 'marcas/index.html': page('<h1>Marcas</h1>') })), []);
  assert.deepEqual(failures(await scan({ 'marcas/index.html': page('<h1>Marcas</h1>'), 'marcas/ansell/index.html': page('<h1>Ansell</h1>') })), []);

  // Vista previa: categorías en borrador y ejemplos sí; cualquier otra página no.
  const options = { preview: true };
  const home = { 'index.html': previewPage('<h1>Inicio</h1>') };
  const categoryPages = Object.fromEntries(data.catalog.categories.map(category => [`categorias/${category.id}/index.html`, previewPage(`<h1>${category.name}</h1>`)]));
  const productPages = Object.fromEntries(data.examples.map(example => [`productos/${example.id}/index.html`, previewPage(exampleCard(example))]));
  assert.deepEqual(failures(await scan({ ...home, ...categoryPages, ...productPages }, options)), []);
  assert.deepEqual(failedIds(await scan({ ...home, ...productPages, 'productos/otro/index.html': previewPage('<h1>Otro</h1>') }, options)), ['R-RULE-14']);
  // Si ya hay páginas de producto o de categoría, no puede faltar la de ningún registro visible.
  const { 'productos/ejemplo-orejera/index.html': _product, ...withoutProduct } = productPages;
  assert.deepEqual(failures(await scan({ ...home, ...withoutProduct }, options)).map(finding => finding.message), ['falta la página de producto «ejemplo-orejera»']);
  const { 'categorias/soldadura/index.html': _category, ...withoutCategory } = categoryPages;
  assert.deepEqual(failures(await scan({ ...home, ...withoutCategory }, options)).map(finding => finding.message), ['falta la página de categoría «soldadura»']);
  // Un sitio que todavía no genera esas páginas (solo las listas) no falla por eso.
  assert.deepEqual(failures(await scan({ ...home, 'catalogo/index.html': previewPage('<h1>Catálogo</h1>'), 'categorias/index.html': previewPage('<h1>Categorías</h1>') }, options)), []);

  // Con una categoría y una ficha aprobadas, sus páginas son válidas en producción.
  const approved = structuredClone(data.catalog);
  approved.categories[0].status = 'approved';
  approved.products.push({ id: 'guante-aprobado', status: 'approved' }, { id: 'guante-borrador', status: 'draft' });
  const withApproved = { ...data, catalog: approved };
  assert.deepEqual(failures(await scan({ 'categorias/manos/index.html': page(), 'productos/guante-aprobado/index.html': page() }, { data: withApproved })), []);
  assert.deepEqual(failedIds(await scan({ 'productos/guante-aprobado/index.html': page(), 'productos/guante-borrador/index.html': page() }, { data: withApproved })), ['R-RULE-14']);
});

test('R-RULE-24 y R-QUOTE-06: el contacto es el confirmado y el texto de WhatsApp va codificado', async () => {
  await assertEachFails('R-RULE-24', [
    '<a href="https://wa.me/5215511223344?text=Hola">WhatsApp</a>', '<a href="https://wa.me/522214002219">WhatsApp</a>',
    '<a href="https://api.whatsapp.com/send?phone=5212214002219">WhatsApp</a>', '<a href="mailto:ventas@otra-oficina.example">Correo</a>',
    '<p>Escribe a ventas@otra-oficina.example</p>', '<a href="tel:+525511223344">Llamar</a>',
  ]);
  await assertEachFails('R-QUOTE-06', [`<a href="${WHATSAPP}?text=Hola, Yosmara. Quiero una cotización">WhatsApp</a>`]);
  await assertNoneFails([`<a href="${WHATSAPP}">WhatsApp</a>`, `<a href="${WHATSAPP}?text=Hola%2C%20Yosmara.%0AProducto%3A%20">WhatsApp</a>`, `<a href="mailto:${data.business.email}">Correo</a>`]);
  assert.deepEqual(warnedIds(await scan({ 'pagina/index.html': page('<p>Llámanos al 55 1122 3344</p>') })), ['R-RULE-24']);
});

test('R-RULE-11: sin atención presencial confirmada no hay dirección, mapa ni invitación a visitar', async () => {
  const bodies = ['<p>Visítanos</p>', `<p>${data.business.address}</p>`, '<p>C.P. 72090</p>', '<iframe src="https://www.google.com/maps/embed"></iframe>', '<a href="https://maps.app.goo.gl/abc">Cómo llegar</a>'];
  await assertEachFails('R-RULE-11', bodies);
  assert.deepEqual(failedIds(await scan({ '_astro/negocio.js': `var b=${JSON.stringify({ address: data.business.address })}` })), ['R-RULE-11']);
  for (const body of bodies) assert.deepEqual(failures(await scan({ 'pagina/index.html': page(body) }, { inPerson: true })), [], body);
});

test('otras reglas de la página: idioma, enlace de salto, imágenes, formularios, compra en línea y restos de compilación', async () => {
  assert.deepEqual(failedIds(await scan({ 'index.html': page('<h1>Inicio</h1>', { lang: 'es' }) })), ['R-NAV-17']);
  assert.deepEqual(failedIds(await scan({ 'index.html': page('<h1>Inicio</h1>', { skip: '' }) })), ['R-NAV-17']);
  assert.deepEqual(failedIds(await scan({ 'index.html': page('<h1>Inicio</h1>', { skip: '<a href="/contenido/">Saltar al contenido</a>' }) })), ['R-NAV-17']);
  await assertEachFails('R-A11Y-07', ['<img src="/logo.svg">']);
  await assertNoneFails(['<img src="/logo.svg" alt="">', '<img alt src="/adorno.svg">']);
  await assertEachFails('R-RULE-28', ['<form method="post" action="/enviar/"><button>Enviar</button></form>', '<form action="https://formularios.example/x"><button>Enviar</button></form>']);
  await assertNoneFails(['<form action="/catalogo/" method="get"><input name="q" aria-label="Buscar"><button>Buscar</button></form>']);
  await assertEachFails('R-RULE-22', ['<a href="/carrito/">Carrito</a>', '<button>Comprar ahora</button>', '<a href="/cuenta/">Iniciar sesión</a>']);
  await assertEachFails('R-RULE-09', ['<p>Entrega inmediata</p>', '<p>Producto en existencia</p>', '<p>En stock</p>']);
  await assertEachFails('R-RULE-05', ['<p>Testimonios</p>', '<p>★★★★★</p>', '<p>Nuestros clientes</p>']);
  await assertEachFails('R-RULE-18', ['<p>Facturación inmediata</p>', '<p>Meses sin intereses</p>', '<p>Pago con tarjeta de crédito</p>']);
  await assertEachFails('R-RULE-19', ['<p>Catálogo actualizado en tiempo real</p>']);
  await assertEachFails('R-RULE-03', ['<p>Producto sintético de prueba</p>', '<p data-id="test-001">Guante</p>']);
  assert.deepEqual(warnedIds(await scan({ 'pagina/index.html': page('<a href="/catalogo/"><svg></svg></a>') })), ['R-A11Y-06']);
  assert.deepEqual(warnedIds(await scan({ 'pagina/index.html': page('<p>Compatible con el modelo anterior</p>') })), ['R-RULE-16']);
  assert.deepEqual(failedIds(await scan({ '.prerender/chunk.mjs': 'export{}' })), ['BUILD']);
});

test('cada regla está documentada y conserva su identificador', () => {
  for (const rule of RULES) {
    assert.match(rule.id, /^R-[A-Z0-9]+-\d{2}$/);
    assert.ok(rule.title.length > 5 && rule.doc.length > 40, rule.id);
    assert.ok(['text', 'words', 'raw', 'norm'].includes(rule.scope), rule.id);
  }
  const documented = new Set([...RULES.map(rule => rule.id), ...CHECKS.map(([id]) => id)]);
  for (const id of ['R-RULE-01', 'R-RULE-03', 'R-RULE-07', 'R-RULE-08', 'R-RULE-10', 'R-RULE-12', 'R-RULE-13', 'R-RULE-14', 'R-RULE-24', 'R-RULE-29', 'R-NAV-17']) {
    assert.ok(documented.has(id), id);
  }
  for (const [, doc] of CHECKS) assert.ok(doc.length > 30);
});

test('línea de comandos: código 0 sin fallos, 1 con fallos y 2 cuando no hay nada que revisar', async () => {
  const cli = (...args) => spawnSync(process.execPath, ['scripts/scan-dist.mjs', ...args], { cwd: ROOT, encoding: 'utf8' });
  const clean = await makeTree({ 'robots.txt': ROBOTS, 'index.html': page() });
  const dirty = await makeTree({ 'robots.txt': ROBOTS, 'index.html': page('<p>Sitio oficial, todo a $10</p>') });
  const empty = await makeTree({ 'robots.txt': ROBOTS });
  try {
    const ok = cli(clean);
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(ok.stdout, /modo producción: 2 archivos, 1 páginas HTML, 0 FAIL, 0 WARN\./);
    const bad = cli(dirty);
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /^FAIL {2}R-RULE-01 {2}index\.html {2}/m);
    assert.match(bad.stdout, /^FAIL {2}R-RULE-07 {2}index\.html {2}/m);
    assert.match(bad.stdout, /2 FAIL, 0 WARN\./);
    // La misma carpeta limpia, revisada como vista previa, falla: no lleva el aviso.
    const asPreview = cli(clean, '--preview');
    assert.equal(asPreview.status, 1);
    assert.match(asPreview.stdout, /modo vista previa/);
    assert.equal(cli(empty).status, 2);
    assert.equal(cli(`${clean}-no-existe`).status, 2);
    assert.equal(cli(clean, '--otra-opcion').status, 2);
    assert.equal(cli(clean, '--preview', '--launch').status, 2);
    // --strict: un aviso (WARN) también hace fallar la revisión.
    const warned = await makeTree({ 'robots.txt': ROBOTS, 'index.html': page('<p>Guante EN 388. Arnés certificado.</p>') });
    try {
      const lenient = cli(warned);
      assert.equal(lenient.status, 0, lenient.stdout);
      assert.match(lenient.stdout, /0 FAIL, 2 WARN\./);
      const strict = cli(warned, '--strict');
      assert.equal(strict.status, 1, strict.stdout + strict.stderr);
      assert.match(strict.stdout, /modo producción \+ estricto: .* 0 FAIL, 2 WARN\./);
      assert.equal(cli(clean, '--strict').status, 0);
    } finally {
      await removeTree(warned);
    }
    const rules = cli('--rules');
    assert.equal(rules.status, 0);
    for (const id of ['R-RULE-01', 'R-RULE-08', 'R-RULE-29', 'R-RULE-12', 'R-RULE-14', 'BUILD']) assert.ok(rules.stdout.includes(id), id);
  } finally {
    await Promise.all([clean, dirty, empty].map(removeTree));
  }
});
