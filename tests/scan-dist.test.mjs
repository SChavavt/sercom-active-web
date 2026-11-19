import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { CHECKS, RULES, scanDist } from '../scripts/scan-dist.mjs';
import { DEVELOPMENT_NOTICE, EXAMPLE_TAG, PREVIEW_NOTICE } from '../src/lib/site-data-core.mjs';
import { loadProjectData, makeTree, readText, removeTree, ROOT } from './helpers.mjs';

const data = await loadProjectData();
const ROBOTS = 'User-agent: *\nDisallow: /\n';
const WHATSAPP = `https://wa.me/${data.business.whatsappDigits}`;

// Título de la portada (R-COPY-15): el nombre del negocio y titleLabel, de business.json.
const HOME_TITLE = `${data.business.name} · ${data.business.titleLabel}`;

// Lugar del aviso de arriba en una página de prueba. `site()` lo llena según el modo de la revisión: en producción
// antes del lanzamiento, el aviso de sitio en preparación (R-RULE-12); en la vista previa y con --launch, nada. Así
// cada prueba falla solo por lo que prueba.
const NOTICE_SLOT = '<!--aviso-->';
const DEVELOPMENT_NOTICE_HTML = `<aside class="site-notice" aria-label="Aviso de sitio en preparación"><p class="site-notice__text"><strong>${DEVELOPMENT_NOTICE.split(' · ')[0]}</strong> · ${DEVELOPMENT_NOTICE.split(' · ').slice(1).join(' · ')}</p></aside>`;
/** Llena el lugar del aviso de cada página de `files` según el modo de la revisión. */
const site = (files, { preview = false, launch = false } = {}) => Object.fromEntries(Object.entries(files).map(([path, content]) => [
  path, typeof content === 'string' ? content.replaceAll(NOTICE_SLOT, preview || launch ? '' : DEVELOPMENT_NOTICE_HTML) : content,
]));

/**
 * Página mínima que cumple todas las reglas. `notice`: 'auto' (el aviso del modo, ver `site`), 'preview' (el aviso
 * de vista previa) o 'none' (ningún aviso).
 */
function page(body = '<h1>Inicio</h1>', { head = '', notice = 'auto', lang = 'es-MX', robots = '<meta name="robots" content="noindex, nofollow">', skip = '<a href="#contenido">Saltar al contenido</a>', title = HOME_TITLE } = {}) {
  const top = { auto: NOTICE_SLOT, preview: `<p class="aviso">${PREVIEW_NOTICE}</p>`, none: '' }[notice];
  return `<!doctype html><html lang="${lang}"><head><meta charset="UTF-8">${robots}<title>${title}</title>${head}</head>`
    + `<body>${skip}${top}<main id="contenido">${body}</main></body></html>`;
}
const previewPage = (body, options) => page(body, { ...options, notice: 'preview' });
const exampleCard = (example, tag = true) => `<article><h2>${example.name}</h2><p>${example.brandName} · ${example.code}</p>${tag ? `<span class="tag">${EXAMPLE_TAG}</span>` : ''}</article>`;

/** Escanea un sitio temporal. `files` se suma a un sitio mínimo válido (index.html y robots.txt). */
async function scan(files = {}, options = {}) {
  const directory = await makeTree(site({ 'robots.txt': ROBOTS, 'index.html': page(), ...files }, options));
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

test('R-RULE-08: la marca excluida partida por etiquetas en línea o por caracteres invisibles', async () => {
  const [longName, shortName] = data.registry.scope.excluded_entities;
  const [first, second] = longName.split(' ');
  const [a, b, c, d] = shortName.split('');
  await assertEachFails('R-RULE-08', [
    `<p><strong>${first}</strong> ${second}</p>`, `<p>${first} <em>${second}</em></p>`, `<p>${first}<br>${second}</p>`, `<p>${a}${b}<span>${c}${d}</span></p>`,
    `<p>${a}&#8203;${b}${c}${d}</p>`, `<p>${a}\u200b${b}${c}${d}</p>`, `<p>${a}${b}&shy;${c}${d}</p>`, `<p>${a}\u2060${b}${c}${d}</p>`,
    `<p>${[a, b, c, d].map(letter => String.fromCodePoint(letter.codePointAt(0) + 0xfee0)).join('')}</p>`, `<p>${a}.<b>${b}</b>.${c}.${d}.</p>`,
    `<script>el.textContent="${a}${b}"+"${c}${d}";</script>`,
  ]);
  for (const content of [`el.textContent="${a}${b}"+"${c}${d}";`, `el.textContent=\`${a}${b}\${""}${c}${d}\`;`, `el.textContent="${a}${b}\\u200b${c}${d}";`,
    `const ${shortName.toLowerCase()}Logo=1;`, `const logo${a}${b.toLowerCase()}${c.toLowerCase()}${d.toLowerCase()}=1;`, `const ${shortName}_URL="";`]) {
    assert.ok(failedIds(await scan({ '_astro/app.js': content })).includes('R-RULE-08'), content);
  }
  // Palabras que solo contienen esas letras, o etiquetas entre palabras separadas, no son la marca.
  await assertNoneFails(['<p>Registro <b>sagisal</b></p>', '<p><span>Lógica</span> <span>sanitaria</span></p>', '<p><b>Gi</b> <i>Sa</i></p>', '<p>Gi<br>sa</p>']);
  assert.deepEqual(failures(await scan({ '_astro/app.js': 'const legisAtura=1,magisAdo=2;' })), []);
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

test('R-RULE-01: precios sin símbolo antes de la cifra, en JS, JSON, CSS y atributos, y texto en forma descompuesta', async () => {
  await assertEachFails('R-RULE-01', [
    '<p>Precio: 350</p>', '<p>Precio unitario 350.00</p>', '<p>PRECIO DE LISTA: $ 1 200</p>', '<p>350.00 M.N.</p>', '<p>350 MN</p>', '<p>\uff041,200</p>', '<p>1.200 €</p>', '<p>EUR 90</p>',
    '<div data-precio="$350 MXN"></div>', '<p data-x="Precio: 350">Casco</p>', '<p>' + 'Promoción'.normalize('NFD') + '</p>', '<p>Descuento&nbsp;de temporada</p>',
    '<style>.a::after{content:"$350"}</style>', '<style>.a::after{content:"\\24 350"}</style>', '<p style="--x:1">Casco</p><style>.b::before{content:\'Precio: 99\'}</style>',
    '<script>el.textContent="$350 MXN";</script>', '<script>el.textContent="\\u0024350";</script>',
  ]);
  for (const [path, content] of [['_astro/app.js', 'el.textContent="$350 MXN";'], ['buscar.json', '[{"t":"Casco $350 MXN"}]'], ['_astro/sitio.css', '.a::after{content:"$350"}'],
    ['_astro/app.js', 'el.textContent=`Precio: ${""}350`;'], ['_astro/app.js', 'el.textContent="Precio: "+"350";']]) {
    assert.ok(failedIds(await scan({ [path]: content })).includes('R-RULE-01'), content);
  }
  assert.ok(failedIds(await scan({ '_astro/app.js': 'b.textContent="Muestra gratis";' })).includes('R-RULE-02'));
  // Las demás reglas del texto visible también leen el texto descompuesto (NFD) o con caracteres de ancho completo.
  await assertEachFails('R-RULE-05', ['<p>' + 'Reseñas'.normalize('NFD') + '</p>']);
  await assertEachFails('R-RULE-18', ['<p>' + 'Facturación'.normalize('NFD') + '</p>']);
  await assertEachFails('R-RULE-22', ['<p>Comprar\u00a0ahora</p>']);
  // El código de un script (referencias de reemplazo, plantillas) y las frases del sitio no son precios.
  await assertNoneFails([
    '<p>Los productos se muestran sin precio: la cotización se prepara según lo que necesitas.</p>', '<p>Precio sujeto a cotización</p>', '<p>Cono de 71 cm, 10 piezas</p>',
    '<script>const t=s.replace(/(\\d+)/g,"$1 ").replaceAll(r,"$&");const u=`https://wa.me/${e}`;</script>',
  ]);
  for (const content of ['const t=s.replace(/(\\d+)-(\\d+)/g,"$1$2");', 'const u=`${a}${b}`;', 'a.style.width=`${n}%`;']) {
    assert.deepEqual(failures(await scan({ '_astro/app.js': content })), [], content);
  }
});

test('R-RULE-01 y R-RULE-02: costos, importes y otras monedas, precios partidos por etiquetas o escritos como marcado desde un script', async () => {
  await assertEachFails('R-RULE-01', [
    '<p>Costo: 350</p>', '<p>Importe: 350</p>', '<p>Monto total: 1,200.00</p>', '<p>Tarifa por pieza: 35</p>', '<p>350 dólares</p>', '<p>350 euros</p>', '<p>Precio 350</p>',
    '<p>Precio por caja de 12: 350</p>', '<p>Precio: <b>350</b></p>', '<p><sup>$</sup>350</p>', '<p>Pro<b>moción</b></p>', '<p>Des<span>cuento</span> por volumen</p>',
  ]);
  await assertEachFails('R-RULE-02', ['<p>Muestra gra<b>tis</b></p>']);
  for (const [path, content] of [['_astro/app.js', 'el.innerHTML="Precio: <b>350</b>";'], ['_astro/app.js', 'el.innerHTML="<span>$</span>350";'],
    ['_astro/app.js', "el.innerHTML='<b>Costo:</b> 350';"], ['datos.json', '{"importe":350}'], ['datos.json', '{"monto":350}'], ['datos.json', '{"tarifa":"350"}']]) {
    assert.ok(failedIds(await scan({ [path]: content })).includes('R-RULE-01'), content);
  }
  // Un año junto a «precios», un modelo con «MN» o el código de un script no son precios.
  await assertNoneFails(['<h2>Precios y cotización 2026</h2>', '<p>Modelo 3 MN</p>', '<p>Precio: a cotizar</p>', '<p>Precios sujetos a cotización en 2026</p>']);
  for (const content of ['const x=$(1);const y=$2;', 'const r=/^\\$\\d+$/;', 'a=b.replace(c,"$1");d=`${e}`;f="$"+g;']) {
    assert.deepEqual(failures(await scan({ '_astro/app.js': content })), [], content);
  }
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

test('R-RULE-10: otras formas de confirmación, partidas por etiquetas o escritas desde un script', async () => {
  await assertEachFails('R-RULE-10', [
    '<p>Tu solicitud fue enviada</p>', '<p>Hemos recibido tu solicitud</p>', '<p>¡Listo! Te responderemos pronto</p>', '<p>Cotización enviada</p>', '<p>Cotizaci&oacute;n enviada</p>',
    '<p>Mensaje <b>enviado</b></p>', '<p>Solicitud&nbsp;enviada</p>', '<p>Solicitud\u00a0enviada</p>', '<p>Tu lista se ha enviado</p>', '<p>Pedido registrado</p>',
    '<p>Te contactaremos pronto</p>', '<p>Nos pondremos en contacto contigo</p>', '<p>¡Enviado!</p>', '<p>Gracias por tu cotización</p>', '<div data-aviso="Solicitud enviada"></div>',
    '<p>' + 'Cotización recibida'.normalize('NFD') + '</p>', '<!-- Solicitud enviada -->',
  ]);
  for (const [path, content] of [['_astro/app.js', 't.textContent=`Solicitud ${""}enviada`;'], ['_astro/app.js', 't.textContent=`Solicitud ${"enviada"}`;'], ['_astro/app.js', 'el.textContent="Mensaje "+"enviado";'],
    ['_astro/app.js', 'toast("Solicitud\\u00a0enviada");'], ['avisos.json', '{"aviso":"Hemos recibido tu lista"}']]) {
    assert.ok(failedIds(await scan({ [path]: content })).includes('R-RULE-10'), content);
  }
  // Las frases del sitio que explican que nada se envía solo no son confirmaciones.
  await assertNoneFails([
    '<p>Los botones abren tu aplicación con un borrador que puedes editar antes de enviarlo.</p>', '<p>El sitio no envía el mensaje por ti ni guarda una copia.</p>',
    '<p>Lo que envíes por WhatsApp o por correo llega directamente a Sercom Active para atender tu solicitud de cotización.</p>',
    '<p>Tu mensaje no se ha enviado todavía: revísalo en tu aplicación.</p>', '<p>Tu solicitud aún no ha sido enviada.</p>', '<p>Recibes tu cotización por WhatsApp o correo</p>',
    '<p>Agregamos tu búsqueda al borrador.</p>', '<p>Listo para cotizar</p>', '<p>Enviar mi solicitud por correo</p>',
  ]);
});

test('R-RULE-10: confirmaciones en primera persona, partidas dentro de una palabra o escritas como marcado desde un script', async () => {
  await assertEachFails('R-RULE-10', [
    '<p>Hemos enviado tu solicitud</p>', '<p>Ya enviamos tu mensaje</p>', '<p>Enviamos tu cotización a Sercom</p>', '<p>Registramos tu pedido</p>',
    '<p>Un asesor te contactará pronto</p>', '<p>Te respondemos en breve</p>', '<p>Tu solicitud se envió correctamente</p>', '<p>Solicitud de cotización enviada</p>',
    '<p>Solicitud envi<span>ada</span></p>', '<p>Men<b>saje</b> enviado</p>', '<p>Tu solicitud quedó enviada</p>', '<p>Solicitud\n<b>enviada</b></p>',
    '<script>t.innerHTML="Solicitud <b>enviada</b>";</script>',
  ]);
  for (const content of ['t.innerHTML="Solicitud <b>enviada</b>";', "t.innerHTML='Mensaje <strong>enviado</strong>';", 't.innerHTML="Solicitud "+"<b>enviada</b>";',
    't.innerHTML=`<p>Gracias por tu <em>solicitud</em></p>`;', 'toast("Te <b>respondemos</b> en breve")']) {
    assert.ok(failedIds(await scan({ '_astro/app.js': content })).includes('R-RULE-10'), content);
  }
  // Frases legítimas: un participio usado como adjetivo, o una negación con «nada».
  await assertNoneFails([
    '<p>Consulta la lista de marcas registradas en cada ficha.</p>', '<p>Escribe al correo registrado del negocio.</p>', '<p>Nada ha sido enviado aún.</p>',
    '<p>Tu lista se envía por WhatsApp cuando tú lo decides.</p>', '<p>Nada se envía hasta que tú lo envíes desde tu aplicación.</p>', '<p>Revisa tu mensaje antes de enviarlo.</p>',
    '<p>Los datos no se envían a ningún servidor.</p>', '<p>El mensaje queda sin enviar hasta que lo confirmes.</p>', '<p>No se ha enviado nada todavía.</p>', '<p>Tu mensaje no se envió.</p>',
  ]);
  for (const content of ['if(a<b&&c>d)x="Mensaje";', 'for(let i=0;i<a.length;i++)y=`${i}`;']) assert.deepEqual(failures(await scan({ '_astro/app.js': content })), [], content);
});

test('R-RULE-29: paleta anterior y tema oscuro', async () => {
  for (const css of ['a{color:#0e2a3d}', 'a{color:#0E2A3D}', 'a{background:#00a6e5}', 'a{color:rgb(14, 42, 61)}', 'a{color:rgba(0,166,229,.5)}',
    '@media (prefers-color-scheme: dark){a{color:#fff}}', ':root{color-scheme:light dark}', 'a{background:url("data:image/svg+xml,%3Csvg fill=\'%230e2a3d\'/%3E")}']) {
    assert.deepEqual(failedIds(await scan({ '_astro/sitio.css': css })), ['R-RULE-29'], css);
  }
  await assertEachFails('R-RULE-29', ['<p style="color:#0e2a3d">Texto</p>', '<svg><path fill="#00A6E5" d="M0 0"/></svg>']);
  assert.deepEqual(failedIds(await scan({ 'index.html': page('<h1>Inicio</h1>', { head: '<meta name="theme-color" content="#0e2a3d">' }) })), ['R-RULE-29']);
  // Una cadena hexadecimal más larga que empieza igual (por ejemplo, un hash) no es un color.
  assert.deepEqual(failures(await scan({ '_astro/sitio.css': ':root{color-scheme:light;--ink:#19171a;--blue:#0067b0;--otro:#0e2a3df0e1}' })), []);
});

test('R-RULE-29: la paleta anterior con transparencia, en colores casi iguales y como tema oscuro declarado', async () => {
  // Lightning CSS escribe rgb(14 42 61 / 80%) como #0e2a3dcc, y redondea hsl() u oklch() a un hexadecimal vecino.
  for (const css of ['.a{color:#0e2a3dcc}', '.a{background:#00a6e580}', '.a{color:#0E2A3DFF}', '.a{color:#0e2a3e}', '.a{color:#00a4e6}', '.a{color:#0b293c}',
    '.a{color:light-dark(#fff,#000)}', '.a{color:rgb(13 41 62)}', '.a{color:rgb(5.5% 16.5% 23.9%)}', '.a{color:hsl(205 63% 15%)}', '.a{color:hsla(197deg,100%,45%,.5)}',
    '@media (prefers-color-scheme : dark){a{color:red}}']) {
    assert.deepEqual(failedIds(await scan({ '_astro/sitio.css': css })), ['R-RULE-29'], css);
  }
  await assertEachFails('R-RULE-29', ['<p style="color:hsl(205 63% 15%)">Texto</p>', '<p style="color:#0e2a3dcc">Texto</p>']);
  for (const head of ['<meta name="color-scheme" content="light dark">', '<meta content="dark" name="color-scheme">', "<meta name='color-scheme' content='only dark'>"]) {
    assert.deepEqual(failedIds(await scan({ 'index.html': page('<h1>Inicio</h1>', { head }) })), ['R-RULE-29'], head);
  }
  // La paleta aprobada y colores lejanos no fallan.
  for (const css of ['.a{color:#0067b0cc;background:#19171a}', '.a{color:#0067b0;border-color:#e6eef5}', '.a{color:rgb(0 103 176)}', '.a{color:#1e3a4d}']) {
    assert.deepEqual(failures(await scan({ '_astro/sitio.css': css })), [], css);
  }
  assert.deepEqual(failures(await scan({ 'index.html': page('<h1>Inicio</h1>', { head: '<meta name="color-scheme" content="light">' }) })), []);
});

test('R-RULE-12: noindex en cada página, robots.txt bloqueado y sin sitemap hasta el lanzamiento', async () => {
  const withoutMeta = await scan({ 'catalogo/index.html': page('<h1>Catálogo</h1>', { robots: '' }) });
  assert.deepEqual(failures(withoutMeta).map(finding => [finding.id, finding.file]), [['R-RULE-12', 'catalogo/index.html']]);
  assert.deepEqual(failedIds(await scan({ 'index.html': page('<h1>Inicio</h1>', { robots: '<meta name="robots" content="index, follow">' }) })), ['R-RULE-12']);
  assert.deepEqual(failedIds(await scan({ 'index.html': page('<h1>Inicio</h1>', { robots: '<!-- <meta name="robots" content="noindex"> -->' }) })), ['R-RULE-12']);
  assert.deepEqual(failedIds(await scan({ 'robots.txt': 'User-agent: *\nAllow: /\n' })), ['R-RULE-12']);
  assert.deepEqual(failedIds(await scan({ 'robots.txt': 'User-agent: *\nDisallow: /privado/\n' })), ['R-RULE-12']);
  assert.deepEqual(failedIds(await scan({ 'sitemap-index.xml': '<sitemapindex/>' })), ['R-RULE-12']);
  // Un bloqueo que solo vale para un buscador, o que el grupo «*» deshace, no bloquea el sitio.
  for (const robots of ['User-agent: Googlebot\nDisallow: /\n', 'User-agent: *\nAllow: /\n\nUser-agent: Bingbot\nDisallow: /\n', 'User-agent: *\nDisallow: /\nAllow: /\n',
    'User-agent: *\nDisallow: /\nAllow: /catalogo/\n', 'Disallow: /\n', 'User-agent: *\n# Disallow: /\n']) {
    assert.deepEqual(failedIds(await scan({ 'robots.txt': robots })), ['R-RULE-12'], robots);
  }
  for (const robots of ['User-agent: Googlebot\nUser-agent: *\nDisallow: /\n', '# Antes del lanzamiento\nuser-agent: * # todos\ndisallow: / # todo\n', 'User-agent: *\r\nDisallow: /\r\nAllow:\r\n']) {
    assert.deepEqual(failures(await scan({ 'robots.txt': robots })), [], robots);
  }
  // El orden de los atributos y las comillas no importan.
  assert.deepEqual(failures(await scan({ 'index.html': page('<h1>Inicio</h1>', { robots: "<meta content='NOINDEX,nofollow' name='robots'>" }) })), []);

  // Con --launch se exige lo contrario: los bloqueos se retiran a propósito.
  const launched = { 'index.html': page('<h1>Inicio</h1>', { robots: '' }), 'robots.txt': 'User-agent: *\nAllow: /\n', 'sitemap-index.xml': '<sitemapindex/>' };
  assert.deepEqual(failures(await scan(launched, { launch: true })), []);
  assert.deepEqual(failedIds(await scan({}, { launch: true })), ['R-PUB-03']);
  await assert.rejects(scan({}, { launch: true, preview: true }), /se excluyen/);
});

test('R-RULE-12 y R-PUB-03: el aviso de sitio en preparación, visible en cada página de producción hasta el lanzamiento', async () => {
  // Antes del lanzamiento: cada página de producción lo muestra; la que no lo lleva falla.
  assert.deepEqual(failures(await scan({ 'contacto/index.html': page('<h1>Contacto</h1>') })), []);
  const missing = await scan({ 'contacto/index.html': page('<h1>Contacto</h1>', { notice: 'none' }), 'marcas/index.html': page('<h1>Marcas</h1>', { notice: 'none' }) });
  assert.deepEqual(failures(missing).map(finding => [finding.id, finding.file]), [['R-RULE-12', 'contacto/index.html'], ['R-RULE-12', 'marcas/index.html']]);
  // Escondido no cuenta: en un comentario, en un script, en un atributo o en un estilo.
  for (const hidden of [`<!-- ${DEVELOPMENT_NOTICE} -->`, `<script>var aviso=${JSON.stringify(DEVELOPMENT_NOTICE)};</script>`,
    `<div aria-label="${DEVELOPMENT_NOTICE}"></div>`, `<img src="/aviso.svg" alt="${DEVELOPMENT_NOTICE}">`, `<div title="${DEVELOPMENT_NOTICE}" data-aviso="${DEVELOPMENT_NOTICE}"></div>`,
    `<style>.x::before{content:"${DEVELOPMENT_NOTICE}"}</style>`]) {
    assert.deepEqual(failedIds(await scan({ 'contacto/index.html': page(`<h1>Contacto</h1>${hidden}`, { notice: 'none' }) })), ['R-RULE-12'], hidden);
  }
  // Visible con otro marcado, con entidades o con los acentos descompuestos sigue siendo el aviso.
  for (const shown of [`<p>${DEVELOPMENT_NOTICE}</p>`, '<div><b>Sitio en preparaci&oacute;n</b> &middot; <span>Versión inicial para revisión</span></div>',
    `<p>${DEVELOPMENT_NOTICE.normalize('NFD')}</p>`, '<p>Sitio en preparación\n   · Versión inicial\npara revisión</p>']) {
    assert.deepEqual(failures(await scan({ 'contacto/index.html': page(`<h1>Contacto</h1>${shown}`, { notice: 'none' }) })), [], shown);
  }
  // Incompleto o con otras palabras en medio no es el aviso.
  for (const broken of ['<p>Sitio en preparación</p>', '<p>Versión inicial para revisión</p>', '<p>Sitio en preparación</p><p>Catálogo · Versión inicial para revisión</p>']) {
    assert.deepEqual(failedIds(await scan({ 'contacto/index.html': page(`<h1>Contacto</h1>${broken}`, { notice: 'none' }) })), ['R-RULE-12'], broken);
  }

  // Con --launch se exige lo contrario: una página que todavía lo muestra falla (R-PUB-03).
  const launched = files => ({ 'robots.txt': 'User-agent: *\nAllow: /\n', 'index.html': page('<h1>Inicio</h1>', { robots: '' }), ...files });
  assert.deepEqual(failures(await scan(launched({}), { launch: true })), []);
  const still = await scan(launched({ 'contacto/index.html': page(`<h1>Contacto</h1>${DEVELOPMENT_NOTICE_HTML}`, { robots: '' }) }), { launch: true });
  assert.deepEqual(failures(still).map(finding => [finding.id, finding.file]), [['R-PUB-03', 'contacto/index.html']]);
  // En un comentario ya no se ve: no cuenta.
  assert.deepEqual(failures(await scan(launched({ 'contacto/index.html': page(`<h1>Contacto</h1><!-- ${DEVELOPMENT_NOTICE} -->`, { robots: '' }) }), { launch: true })), []);

  // La vista previa lleva solo su propio aviso: el de sitio en preparación visible falla (R-RULE-12); escondido no cuenta.
  const preview = { preview: true };
  assert.deepEqual(failures(await scan({ 'index.html': previewPage() }, preview)), []);
  const both = await scan({ 'index.html': previewPage(), 'contacto/index.html': previewPage(`<h1>Contacto</h1>${DEVELOPMENT_NOTICE_HTML}`) }, preview);
  assert.deepEqual(failures(both).map(finding => [finding.id, finding.file]), [['R-RULE-12', 'contacto/index.html']]);
  assert.deepEqual(failures(await scan({ 'index.html': previewPage(`<h1>Inicio</h1><!-- ${DEVELOPMENT_NOTICE} --><script>var a=${JSON.stringify(DEVELOPMENT_NOTICE)}</script>`) }, preview)), []);
});

// El aviso dentro de algo que el visitante no ve: un atributo que contiene «>», un elemento oculto (hidden,
// aria-hidden="true", display:none o visibility:hidden en su style), <template>, <textarea>, <noscript>, un
// <dialog> cerrado, el <head> (el <title>) o un <title> de SVG.
// En un atributo no es texto de ningún elemento: tampoco está en la página para las revisiones que prohíben el aviso.
const attributeNotices = notice => [`<div data-x="a>${notice}"></div>`, `<div data-x='a>${notice}'></div>`, `<img alt="x>${notice}" src="/a.svg">`];
// Dentro de un elemento que no se ve: no se muestra, pero sigue en la página.
const hiddenElementNotices = notice => [
  `<aside hidden><p>${notice}</p></aside>`, `<aside class="site-notice" HIDDEN=""><p>${notice}</p></aside>`, `<p hidden="hidden">${notice}</p>`,
  `<aside aria-hidden="true"><p>${notice}</p></aside>`, `<div style="display:none"><p>${notice}</p></div>`, `<div style="color: red; DISPLAY : none !important"><p>${notice}</p></div>`,
  `<div style="visibility:hidden"><p>${notice}</p></div>`, `<div style='visibility: collapse'><p>${notice}</p></div>`,
  `<template><aside><p>${notice}</p></aside></template>`, `<textarea hidden>${notice}</textarea>`, `<textarea>${notice}</textarea>`,
  `<noscript><p>${notice}</p></noscript>`, `<dialog><p>${notice}</p></dialog>`, `<svg><title>${notice}</title></svg>`,
  // Anidado: el elemento oculto cierra en su propia etiqueta de cierre, no en la primera del mismo nombre.
  `<div hidden><div><p>Otro</p></div><p>${notice}</p></div>`,
];
const hiddenNotices = notice => [...attributeNotices(notice), ...hiddenElementNotices(notice)];
// Elementos visibles junto a otros ocultos: el aviso sigue a la vista.
const shownNotices = notice => [
  `<div hidden><div><p>Otro</p></div></div><aside><p>${notice}</p></aside>`, `<input type="hidden" name="a"><p>${notice}</p>`, `<input hidden><p>${notice}</p>`,
  `<p data-hidden="1" class="hidden-x">${notice}</p>`, `<p aria-hidden="false">${notice}</p>`, `<p style="display:block" title="a>b">${notice}</p>`,
  `<dialog open><p>${notice}</p></dialog>`, `<p>Uno &lt; dos</p><p>${notice}</p>`, `<p data-x="a>b">${notice}</p>`, `<br/><hr /><p>${notice}</p>`,
];
// Un sitio listo para el lanzamiento (sin noindex y con robots.txt abierto) con `body` en contacto/.
const launchedSite = body => ({ 'robots.txt': 'User-agent: *\nAllow: /\n', 'index.html': page('<h1>Inicio</h1>', { robots: '' }),
  'contacto/index.html': page(`<h1>Contacto</h1>${body}`, { robots: '' }) });

test('R-RULE-12 y R-PUB-03: el aviso de sitio en preparación escondido en un elemento que no se ve no cuenta como mostrado', async () => {
  for (const hidden of hiddenNotices(DEVELOPMENT_NOTICE)) {
    // Antes del lanzamiento falta: no se ve.
    assert.deepEqual(failedIds(await scan({ 'contacto/index.html': page(`<h1>Contacto</h1>${hidden}`, { notice: 'none' }) })), ['R-RULE-12'], hidden);
  }
  for (const hidden of attributeNotices(DEVELOPMENT_NOTICE)) {
    // En un atributo no está en el texto de la página: con --launch y en la vista previa no falla.
    assert.deepEqual(failures(await scan(launchedSite(hidden), { launch: true })), [], hidden);
    assert.deepEqual(failures(await scan({ 'index.html': previewPage(`<h1>Inicio</h1>${hidden}`) }, { preview: true })), [], hidden);
  }
  for (const hidden of hiddenElementNotices(DEVELOPMENT_NOTICE)) {
    // Escondido sigue en la página: con --launch falla R-PUB-03 y en la vista previa R-RULE-12 (ver la prueba siguiente).
    assert.deepEqual(failedIds(await scan(launchedSite(hidden), { launch: true })), ['R-PUB-03'], hidden);
    assert.deepEqual(failedIds(await scan({ 'index.html': previewPage(`<h1>Inicio</h1>${hidden}`) }, { preview: true })), ['R-RULE-12'], hidden);
  }
  // Solo en el <title> de la página tampoco cuenta.
  assert.deepEqual(failedIds(await scan({ 'contacto/index.html': page('<h1>Contacto</h1>', { notice: 'none', title: DEVELOPMENT_NOTICE }) })), ['R-RULE-12']);
  for (const shown of shownNotices(DEVELOPMENT_NOTICE)) {
    assert.deepEqual(failures(await scan({ 'contacto/index.html': page(`<h1>Contacto</h1>${shown}`, { notice: 'none' }) })), [], shown);
  }
});

// I-09: las revisiones que prohíben el aviso de sitio en preparación (R-PUB-03 con --launch y R-RULE-12 en la vista
// previa) leen todo el texto de los elementos, oculto o no: al lanzar, el aviso se quita de la página, no se esconde.
// Las que lo exigen (R-RULE-12 antes del lanzamiento) leen solo el texto que se muestra a todos.
const forbiddenNotices = {
  'aria-hidden="true" en el aside': DEVELOPMENT_NOTICE_HTML.replace('<aside ', '<aside aria-hidden="true" '),
  'aria-hidden="true" en un antecesor': `<div aria-hidden="true"><div>${DEVELOPMENT_NOTICE_HTML}</div></div>`,
  hidden: DEVELOPMENT_NOTICE_HTML.replace('<aside ', '<aside hidden '),
  'display:none en su style': DEVELOPMENT_NOTICE_HTML.replace('<aside ', '<aside style="display:none" '),
  '<template>': `<template>${DEVELOPMENT_NOTICE_HTML}</template>`,
  '<details> cerrado': `<details><summary>Más</summary>${DEVELOPMENT_NOTICE_HTML}</details>`,
};
for (const [label, body] of Object.entries(forbiddenNotices)) {
  test(`R-PUB-03 y R-RULE-12: el aviso de sitio en preparación escondido (${label}) sigue en la página`, async () => {
    // Con --launch: el aviso debe haberse quitado, no escondido.
    const launched = await scan(launchedSite(body), { launch: true });
    assert.deepEqual(failures(launched).map(finding => [finding.id, finding.file]), [['R-PUB-03', 'contacto/index.html']]);
    // En la vista previa, que lleva solo su propio aviso.
    const preview = await scan({ 'index.html': previewPage(), 'contacto/index.html': previewPage(`<h1>Contacto</h1>${body}`) }, { preview: true });
    assert.deepEqual(failures(preview).map(finding => [finding.id, finding.file]), [['R-RULE-12', 'contacto/index.html']]);
    // En producción antes del lanzamiento no se muestra a todos: falta.
    const before = await scan({ 'contacto/index.html': page(`<h1>Contacto</h1>${body}`, { notice: 'none' }) });
    assert.deepEqual(failures(before).map(finding => [finding.id, finding.file]), [['R-RULE-12', 'contacto/index.html']]);
  });
}

// El aviso real envuelto en un elemento cuyo contenido el troceador lee como texto crudo. Las revisiones que lo
// prohíben leen ese contenido también como marcado: «<strong>Sitio en preparación</strong> · …» sigue siendo el aviso
// (el escáner anterior a las dos lecturas lo encontraba en todos). `inPerson`: sin R-RULE-11, que prohíbe todo <iframe>.
for (const container of ['noscript', 'iframe', 'noembed', 'noframes', 'xmp', 'plaintext', 'textarea', 'title']) {
  test(`R-PUB-03 y R-RULE-12: el aviso real envuelto en <${container}> sigue en la página`, async () => {
    const body = `<${container}>${DEVELOPMENT_NOTICE_HTML}</${container}>`;
    const launched = await scan(launchedSite(body), { launch: true, inPerson: true });
    assert.deepEqual(failures(launched).map(finding => [finding.id, finding.file]), [['R-PUB-03', 'contacto/index.html']]);
    const preview = await scan({ 'index.html': previewPage(), 'contacto/index.html': previewPage(`<h1>Contacto</h1>${body}`) }, { preview: true, inPerson: true });
    assert.deepEqual(failures(preview).map(finding => [finding.id, finding.file]), [['R-RULE-12', 'contacto/index.html']]);
    // Antes del lanzamiento no se muestra a todos (la lectura del texto que se muestra no cambia): falta.
    const before = await scan({ 'contacto/index.html': page(`<h1>Contacto</h1>${body}`, { notice: 'none' }) }, { inPerson: true });
    assert.deepEqual(failures(before).map(finding => [finding.id, finding.file]), [['R-RULE-12', 'contacto/index.html']]);
  });
}

test('R-PUB-03 y R-RULE-12: el contenido de esos elementos también se sigue leyendo tal cual', async () => {
  // Leído tal cual, el texto de un <textarea> con un comentario es el aviso (el campo lo muestra con sus «<!--»), y el
  // de un <noscript> también (es el texto del elemento cuando hay JavaScript).
  for (const body of [`<textarea><!-- ${DEVELOPMENT_NOTICE} --></textarea>`, `<noscript><!-- ${DEVELOPMENT_NOTICE} --></noscript>`, `<xmp><b>x</b>${DEVELOPMENT_NOTICE}</xmp>`]) {
    assert.deepEqual(failedIds(await scan(launchedSite(body), { launch: true })), ['R-PUB-03'], body);
    assert.deepEqual(failedIds(await scan({ 'index.html': previewPage(`<h1>Inicio</h1>${body}`) }, { preview: true })), ['R-RULE-12'], body);
  }
});

test('R-PUB-03 y R-RULE-12: un comentario, un script, un estilo o un atributo con el aviso no lo ponen en la página', async () => {
  for (const body of [`<!-- ${DEVELOPMENT_NOTICE} -->`, `<script>var aviso=${JSON.stringify(DEVELOPMENT_NOTICE)};</script>`, `<style>.x::before{content:"${DEVELOPMENT_NOTICE}"}</style>`,
    `<div title="${DEVELOPMENT_NOTICE}" data-aviso="${DEVELOPMENT_NOTICE}"></div>`, `<input value="${DEVELOPMENT_NOTICE}">`, `<?${DEVELOPMENT_NOTICE}>`, `</ ${DEVELOPMENT_NOTICE}>`]) {
    assert.deepEqual(failures(await scan(launchedSite(body), { launch: true })), [], body);
    assert.deepEqual(failures(await scan({ 'index.html': previewPage(`<h1>Inicio</h1>${body}`) }, { preview: true })), [], body);
  }
});

// I-10: más formas de no mostrar un aviso exigido. Con cada una, el único aviso de la página no cuenta como mostrado.
const unshownNotices = notice => ({
  '<details> cerrado (todo menos su <summary>)': `<details><summary>Más</summary><aside><p>${notice}</p></aside></details>`,
  '<details> cerrado sin <summary>': `<details><p>${notice}</p></details>`,
  '<details> cerrado, texto suelto': `<details><summary>Más</summary>${notice}</details>`,
  '<summary> que no es el primero': `<details><summary>Más</summary><summary>${notice}</summary></details>`,
  'popover': `<aside popover><p>${notice}</p></aside>`,
  'popover="manual"': `<div popover="manual"><p>${notice}</p></div>`,
  'content-visibility: hidden': `<aside style="content-visibility: hidden"><p>${notice}</p></aside>`,
  'display:none con un comentario de CSS': `<aside style="display:none/**/"><p>${notice}</p></aside>`,
  'display con un comentario de CSS antes del valor': `<aside style="display:/* oculto */ none"><p>${notice}</p></aside>`,
  'visibility con un escape de CSS': `<aside style="visibility:\\68 idden"><p>${notice}</p></aside>`,
  '<iframe>': `<iframe>${notice}</iframe>`,
  '<noembed>': `<noembed>${notice}</noembed>`,
  '<noframes>': `<noframes>${notice}</noframes>`,
  '<datalist>': `<datalist id="lista"><option>${notice}</option></datalist>`,
  '<video>': `<video><p>${notice}</p></video>`,
  '<audio>': `<audio><p>${notice}</p></audio>`,
  '<canvas>': `<canvas><p>${notice}</p></canvas>`,
  '<object> con data': `<object data="/a.svg" type="image/svg+xml"><p>${notice}</p></object>`,
  '<desc> de SVG': `<svg><desc>${notice}</desc></svg>`,
  '<metadata> de SVG': `<svg><metadata><p>${notice}</p></metadata></svg>`,
  '<rp>': `<ruby>Aviso<rp>${notice}</rp><rt>a</rt></ruby>`,
  'comentario <?…>': `<?${notice}>`,
  'comentario </ …>': `</ ${notice}>`,
  'comentario </1…>': `</1${notice}>`,
  '<textarea> que «cierra» el elemento oculto': `<div hidden><textarea></div></textarea>${notice}</div>`,
  '<title> de SVG que «cierra» el elemento oculto': `<div hidden><svg><title></div></title></svg>${notice}</div>`,
  '<iframe> que «cierra» el elemento oculto': `<div hidden><iframe></div></iframe>${notice}</div>`,
  '<template> que «cierra» el elemento oculto': `<div hidden><template></div></template>${notice}</div>`,
  'etiqueta con «/>» que no cierra un elemento de HTML': `<div hidden/>${notice}</div>`,
});
for (const label of Object.keys(unshownNotices(''))) {
  test(`R-RULE-12 y R-RULE-03: un aviso exigido escondido así no cuenta como mostrado: ${label}`, async () => {
    // `inPerson`: sin la regla R-RULE-11, que prohíbe todo <iframe> (un mapa); aquí solo cuenta el aviso.
    const production = unshownNotices(DEVELOPMENT_NOTICE)[label];
    assert.deepEqual(failedIds(await scan({ 'contacto/index.html': page(`<h1>Contacto</h1>${production}`, { notice: 'none' }) }, { inPerson: true })), ['R-RULE-12'], production);
    const preview = unshownNotices(PREVIEW_NOTICE)[label];
    assert.deepEqual(failedIds(await scan({ 'index.html': page(`<h1>Inicio</h1>${preview}`, { notice: 'none' }) }, { preview: true, inPerson: true })), ['R-RULE-03'], preview);
  });
}

test('R-RULE-12 y R-RULE-03: el aviso sigue mostrado junto a esos elementos o con sus formas visibles', async () => {
  const controls = notice => [
    `<details open><summary>Más</summary><p>${notice}</p></details>`,
    `<details><summary>${notice}</summary><p>Detalle</p></details>`,
    `<details><summary><span>${notice}</span></summary></details>`,
    `<div popover><p>Otro</p></div><aside><p>${notice}</p></aside>`,
    `<aside style="content-visibility: visible"><p>${notice}</p></aside>`,
    `<aside style="content-visibility: auto; display: block"><p>${notice}</p></aside>`,
    `<object><p>${notice}</p></object>`,
    `<object data=""><p>${notice}</p></object>`,
    `<video controls></video><p>${notice}</p>`,
    `<svg><title>Icono</title><desc>Icono</desc></svg><p>${notice}</p>`,
    `<ruby>Aviso<rp>(</rp><rt>a</rt><rp>)</rp></ruby><p>${notice}</p>`,
    `<p>${notice}</p><?php echo 1 ?>`,
    `<iframe title="x"></iframe><textarea></textarea><p>${notice}</p>`,
    `<p data-x="<?x>">${notice}</p>`,
  ];
  for (const shown of controls(DEVELOPMENT_NOTICE)) {
    assert.deepEqual(failures(await scan({ 'contacto/index.html': page(`<h1>Contacto</h1>${shown}`, { notice: 'none' }) }, { inPerson: true })), [], shown);
  }
  for (const shown of controls(PREVIEW_NOTICE)) {
    assert.deepEqual(failures(await scan({ 'index.html': page(`<h1>Inicio</h1>${shown}`, { notice: 'none' }) }, { preview: true, inPerson: true })), [], shown);
  }
});

test('R-RULE-03 en vista previa: el aviso de vista previa escondido en un elemento que no se ve no cuenta', async () => {
  const options = { preview: true };
  for (const hidden of hiddenNotices(PREVIEW_NOTICE)) {
    assert.deepEqual(failedIds(await scan({ 'index.html': page(`<h1>Inicio</h1>${hidden}`, { notice: 'none' }) }, options)), ['R-RULE-03'], hidden);
  }
  assert.deepEqual(failedIds(await scan({ 'index.html': previewPage(), 'contacto/index.html': page('<h1>Contacto</h1>', { notice: 'none', title: PREVIEW_NOTICE }) }, options)), ['R-RULE-03']);
  for (const shown of shownNotices(PREVIEW_NOTICE)) {
    assert.deepEqual(failures(await scan({ 'index.html': page(`<h1>Inicio</h1>${shown}`, { notice: 'none' }) }, options)), [], shown);
  }
});

test('R-RULE-12 y R-PUB-03: robots.txt revisa cada grupo de buscadores, no solo el de «*»', async () => {
  // Antes del lanzamiento, un buscador con su propio grupo obedece ese grupo: si no bloquea todo, el sitio queda abierto para él.
  for (const robots of ['User-agent: *\nDisallow: /\n\nUser-agent: Googlebot\nAllow: /\n', 'User-agent: *\nDisallow: /\n\nUser-agent: Googlebot\nDisallow:\n',
    'User-agent: *\nDisallow: /\n\nUser-agent: Bingbot\nCrawl-delay: 5\n', 'User-agent: *\nDisallow: /\n\nUser-agent: Googlebot\nDisallow: /\nAllow: /catalogo/\n']) {
    assert.deepEqual(failedIds(await scan({ 'robots.txt': robots })), ['R-RULE-12'], robots);
  }
  for (const robots of ['User-agent: *\nDisallow: /\n\nUser-agent: Googlebot\nDisallow: /\n', '\ufeffUser-agent: *\nDisallow: /\n', 'User-agent: *\nDisallow: /\nSitemap: https://sitio.example/sitemap.xml\n']) {
    assert.deepEqual(failures(await scan({ 'robots.txt': robots })), [], robots);
  }
  // Con --launch, ningún grupo puede seguir bloqueando el sitio.
  const launched = robots => ({ 'index.html': page('<h1>Inicio</h1>', { robots: '' }), 'robots.txt': robots });
  for (const robots of ['User-agent: Googlebot\nDisallow: /\n', 'User-agent: *\nAllow: /\n\nUser-agent: Googlebot\nDisallow: /\n', 'User-agent: *\nDisallow: /*\n']) {
    assert.deepEqual(failedIds(await scan(launched(robots), { launch: true })), ['R-PUB-03'], robots);
  }
  for (const robots of ['User-agent: *\nAllow: /\n', 'User-agent: *\nDisallow: /privado/\n\nUser-agent: Googlebot\nDisallow:\n']) {
    assert.deepEqual(failures(await scan(launched(robots), { launch: true })), [], robots);
  }
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
  // Los códigos de los ejemplos escritos sin el guion, con otro separador o en caracteres de ancho completo.
  const compact = example.code.replace('-', '');
  await assertEachFails('R-RULE-03', [
    `<p>Guante ${compact}</p>`, `<p>Código ${example.code.replace('-', ' ').toLowerCase()}</p>`, `<p>${example.code.replace('-', '_')}</p>`, `<p>${example.code.replace('-', '\u2013')}</p>`,
    `<p>${example.variants[0].code.replaceAll('-', '')}</p>`, `<p>${[...example.code].map(char => (char === '-' ? char : String.fromCodePoint(char.codePointAt(0) + 0xfee0))).join('')}</p>`,
    '<p>Guante de<br>ejemplo</p>', `<p>${example.code.slice(0, 3)}<span>${example.code.slice(3)}</span></p>`,
  ]);
  assert.ok(failedIds(await scan({ '_astro/chunk.js': `const c="${compact}";` })).includes('R-RULE-03'));
  // «por ejemplo» y palabras parecidas son texto normal.
  await assertNoneFails(['<p>Por ejemplo, guantes y lentes.</p>', '<p>Un ejemplar del catálogo</p>', '<p>Modelo EJE-100</p>', '<p>Ejemplo: 10 pares</p>', `<p>Hoja ${compact.slice(2)}</p>`, `<p>REJ${compact.slice(2)}</p>`]);
});

test('R-RULE-29 y R-RULE-03: un ancla, un identificador o una abreviatura no son un color ni un código de ejemplo', async () => {
  await assertNoneFails(['<a href="#00a6e9">Ir</a><p id="00a6e9">Texto</p>', '<p>Pedidos grandes, ej. 1001 piezas</p>']);
  assert.deepEqual(failures(await scan({ 'datos.json': '{"x":"#0e2a40"}' })), []);
  assert.deepEqual(failures(await scan({ '_astro/app.js': 'const ancla="#00a6e9";' })), []);
  // Los colores casi iguales siguen fallando donde son un color: CSS, style, fill, stroke y theme-color.
  await assertEachFails('R-RULE-29', ['<p style="color:#0e2a40">Texto</p>', '<svg><path fill="#00a6e9" d="M0 0"/></svg>', '<svg><path stroke="#0e2a40" d="M0 0"/></svg>', '<style>.a{color:#0e2a40}</style>']);
  assert.deepEqual(failedIds(await scan({ 'index.html': page('<h1>Inicio</h1>', { head: '<meta name="theme-color" content="#0e2a40">' }) })), ['R-RULE-29']);
  assert.deepEqual(failedIds(await scan({ 'img/a.svg': '<svg xmlns="http://www.w3.org/2000/svg"><path fill="#0e2a3e" d="M0 0"/></svg>' })), ['R-RULE-29']);
  await assertEachFails('R-RULE-03', ['<p>Pedidos grandes, EJ1001</p>', '<p>Código ej 1001</p>']);
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
  // El aviso escondido en un comentario, en un script o en un atributo no cuenta.
  assert.deepEqual(failedIds(await scan({ 'index.html': page(`<h1>Inicio</h1><!-- ${PREVIEW_NOTICE} --><script>var aviso=${JSON.stringify(PREVIEW_NOTICE)}</script>`) }, options)), ['R-RULE-03']);
  assert.deepEqual(failedIds(await scan({ 'index.html': page(`<h1>Inicio</h1><div aria-label="${PREVIEW_NOTICE}" title="${PREVIEW_NOTICE}"></div>`) }, options)), ['R-RULE-03']);
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

test('R-RULE-14: un producto retirado tiene página solo si fue público, y el ejemplo retirado solo en la vista previa', async () => {
  const approval = { by: 'Revisor de prueba', on: '2026-11-18', supplyConfirmed: true };
  const editorial = structuredClone(data.catalog);
  editorial.products.push(
    { id: 'guante-retirado', status: 'retired', approval },
    { id: 'guante-retirado-sin-aprobacion', status: 'retired' },
    { id: 'guante-retirado-sin-suministro', status: 'retired', approval: { ...approval, supplyConfirmed: false } },
  );
  const withRetired = { ...data, catalog: editorial };
  // Producción: el retirado que fue público tiene su página; los que nunca lo fueron, no.
  assert.deepEqual(failures(await scan({ 'productos/guante-retirado/index.html': page() }, { data: withRetired })), []);
  for (const id of ['guante-retirado-sin-aprobacion', 'guante-retirado-sin-suministro']) {
    const result = await scan({ 'productos/guante-retirado/index.html': page(), [`productos/${id}/index.html`]: page() }, { data: withRetired });
    assert.deepEqual(failures(result).map(finding => [finding.id, finding.file]), [['R-RULE-14', `productos/${id}`]], id);
  }
  // Si ya hay páginas de producto, no puede faltar la del retirado público.
  const approved = structuredClone(editorial);
  approved.categories[0].status = 'approved';
  approved.products.push({ id: 'guante-aprobado', status: 'approved' });
  const missing = await scan({ 'productos/guante-aprobado/index.html': page() }, { data: { ...data, catalog: approved } });
  assert.deepEqual(failures(missing).map(finding => finding.message), ['falta la página de producto «guante-retirado»']);

  // Vista previa: el ejemplo retirado tiene su página, y no puede faltar.
  const retiredExamples = data.examples.filter(example => example.retired === true);
  assert.deepEqual(retiredExamples.map(example => example.id), ['ejemplo-producto-retirado']);
  const options = { preview: true };
  const home = { 'index.html': previewPage('<h1>Inicio</h1>') };
  const productPages = Object.fromEntries(data.examples.map(example => [`productos/${example.id}/index.html`, previewPage(exampleCard(example))]));
  assert.deepEqual(failures(await scan({ ...home, ...productPages }, options)), []);
  const { 'productos/ejemplo-producto-retirado/index.html': _retired, ...withoutRetired } = productPages;
  assert.deepEqual(failures(await scan({ ...home, ...withoutRetired }, options)).map(finding => finding.message), ['falta la página de producto «ejemplo-producto-retirado»']);
  // Su página sin la etiqueta «Ejemplo» falla, como la de cualquier ejemplo.
  const untagged = await scan({ ...home, ...productPages, 'productos/ejemplo-producto-retirado/index.html': previewPage(exampleCard(retiredExamples[0], false)) }, options);
  assert.deepEqual(failures(untagged).map(finding => [finding.id, finding.file]), [['R-RULE-03', 'productos/ejemplo-producto-retirado/index.html']]);

  // Producción: el ejemplo retirado no existe; su página falla por los datos y por las marcas de ejemplo.
  const leaked = await scan({ 'productos/ejemplo-producto-retirado/index.html': page('<h1>Producto retirado</h1>') });
  assert.deepEqual(failedIds(leaked), ['R-RULE-03', 'R-RULE-14']);
  for (const token of [retiredExamples[0].name, retiredExamples[0].code]) {
    assert.deepEqual(failedIds(await scan({ 'pagina/index.html': page(`<p>${token}</p>`) })), ['R-RULE-03'], token);
  }
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

test('R-RULE-24: destinos de contacto en cualquier atributo, script o archivo, y correos con copia a otra dirección', async () => {
  const EMAIL = data.business.email;
  await assertEachFails('R-RULE-24', [
    `<a href="mailto:${EMAIL}?cc=otro@example.com">Correo</a>`, `<a href="mailto:${EMAIL}?subject=Hola&amp;bcc=otro@example.com">Correo</a>`,
    `<a href="mailto:${EMAIL}?to=otro@example.com">Correo</a>`, `<a href="mailto:${EMAIL}?CC=${EMAIL}">Correo</a>`, `<a href="mailto:${EMAIL},otro@example.com">Correo</a>`,
    `<a href="mailto:${EMAIL}%2Cotro@example.com">Correo</a>`, '<a href="MAILTO:otro@example.com">Correo</a>',
    '<map name="m"><area href="https://wa.me/5215555555555" alt="WhatsApp"></map>', '<form><button formaction="https://wa.me/5215555555555">WhatsApp</button></form>',
    '<a data-href="https://api.whatsapp.com/send?phone=5215555555555" href="/">WhatsApp</a>', '<p data-contacto="whatsapp://send?phone=5215555555555">WhatsApp</p>',
    `<script>location.href='https://wa.me/5215555555555';</script>`, `<script>location.href="mailto:otro@example.com";</script>`, '<script>const c="otro@example.com";</script>',
    '<p data-correo="otro@example.com">Correo</p>', '<a href="https://wa.me/message/ABCDEF">WhatsApp</a>', '<button data-tel="tel:+525511223344">Llamar</button>',
  ]);
  for (const content of ["location.href='https://wa.me/5215555555555'", "location.href='mailto:otro@example.com'", 'const correo="otro@example.com";',
    `const c=\`mailto:${EMAIL}?bcc=otro@example.com\`;`, "location.href='tel:+525511223344'", "a.href='//wa.me/5215555555555?text=Hola'"]) {
    assert.deepEqual(failedIds(await scan({ '_astro/app.js': content })), ['R-RULE-24'], content);
  }
  assert.deepEqual(failedIds(await scan({ 'datos.json': '{"whatsapp":"https://wa.me/5215555555555"}' })), ['R-RULE-24']);
  // El código que completa los enlaces confirmados (contact-core.mjs ya compilado) no es un destino.
  const contactCore = 'function i(e,t){let n=t==null?``:String(t);return n?`https://wa.me/${e}?text=${encodeURIComponent(n)}`:`https://wa.me/${e}`}'
    + 'function a(e,t){return t.length?`mailto:${e}?${t.join(`&`)}`:`mailto:${e}`}if(o.startsWith(`https://wa.me/`)){}if(o.startsWith(`mailto:`)){}'
    + 'document.querySelectorAll(`[data-solicitud] a[href^="https://wa.me/"], [data-solicitud] a[href^="mailto:"], a[href^="tel:"]`);const logo="logo@2x.png";';
  assert.deepEqual(failures(await scan({ '_astro/contact-core.js': contactCore })), []);
  await assertNoneFails([
    `<a href="${WHATSAPP}?text=Hola%2C%20Yosmara.%0AEnlace%3A%20https%3A%2F%2Fsitio.example%2F">WhatsApp</a>`,
    `<a href="mailto:${EMAIL}?subject=Solicitud%20especial&amp;body=Hola%2C%20Yosmara.%0D%0Acc%3D%20to%3Dalguien%40example.com">Correo</a>`,
    `<a href="mailto:${EMAIL.toUpperCase()}">Correo</a>`, `<area href="${WHATSAPP}" alt="WhatsApp">`, `<script>location.href='${WHATSAPP}';</script>`,
  ]);
});

test('R-RULE-24: un enlace de correo o de teléfono vacío o sin sustituir, y destinos escondidos en otra dirección', async () => {
  const EMAIL = data.business.email;
  const DIGITS = data.business.whatsappDigits;
  await assertEachFails('R-RULE-24', [
    '<a href="mailto:">Correo</a>', '<a href="mailto:%20">Correo</a>', '<a href="mailto:?subject=Hola">Correo</a>', '<a href="mailto:{correo}">Correo</a>', '<a href="mailto:${correo}">Correo</a>',
    '<a href="tel:">Llamar</a>', '<a href="tel:+">Llamar</a>', '<a href="tel:abc">Llamar</a>', '<a href="tel:{tel}">Llamar</a>', '<a href="tel:${tel}">Llamar</a>', `<a href="tel:+${DIGITS}abc">Llamar</a>`,
    '<a href="https://wa.me/">WhatsApp</a>', '<a href="https://wa.me/{numero}">WhatsApp</a>', '<a href="sms:+525511223344">SMS</a>',
    '<a href="https://l.example.com/?u=https%3A%2F%2Fwa.me%2F5215555555555">WhatsApp</a>', '<a href="https://l.example.com/?u=mailto%3Aotro%40example.com">Correo</a>',
    '<a href="https://chat.whatsapp.com/AbCdEf">Grupo</a>', '<a href="https://whatsapp.com/send?phone=5215555555555">WhatsApp</a>', '<a href="https://wa.link/abc123">WhatsApp</a>',
    '<a href="intent://send/5215555555555#Intent;scheme=whatsapp;end">WhatsApp</a>', '<p data-u="https:\\/\\/wa.me\\/5215555555555">x</p>',
    '<script type="application/ld+json">{"contactPoint":{"url":"https:\\/\\/wa.me\\/5215555555555"}}</script>',
  ]);
  for (const [path, content] of [['_astro/app.js', 'location.href="https:\\/\\/wa.me\\/5215555555555";'], ['datos.json', '{"u":"https:\\/\\/wa.me\\/5215555555555"}'],
    ['datos.json', '{"correo":"mailto:{correo}"}'], ['datos.json', '{"tel":"tel:{tel}"}'], ['_astro/sitio.css', 'a[href^="tel:+"]{x:1}'], ['_astro/app.js', 'location.href="https%3A%2F%2Fwa.me%2F5215555555555";']]) {
    assert.deepEqual(failedIds(await scan({ [path]: content })), ['R-RULE-24'], content);
  }
  // Lo que sí es legítimo: los enlaces confirmados, el código que los completa y un comentario de licencia con correo.
  await assertNoneFails([`<a href="tel:+${DIGITS}">Llamar</a>`, `<a href="tel:+52 1 221 400 2219">Llamar</a>`, `<a href="mailto:${EMAIL}?subject=Hola&amp;body=Hola%2C%20Yosmara.">Correo</a>`,
    `<script>document.querySelectorAll('a[href^="mailto:"], a[href^="tel:"]');const u=\`https://wa.me/\${d}?text=\${encodeURIComponent(t)}\`;</script>`]);
  for (const content of ['/*! (c) autor <dev@example.org> MIT */const a=1;', 'const u=`https://wa.me/${d}?text=${encodeURIComponent(t)}`;', 'const t=`tel:${n}`;a.href="mailto:"+e;']) {
    assert.deepEqual(failures(await scan({ '_astro/app.js': content })), [], content);
  }
  // Una etiqueta «Tel:» o «WhatsApp:» del texto y un selector de CSS no son enlaces.
  await assertNoneFails(['<p>Tel: 221 400 2219</p>', '<p>WhatsApp: 221 400 2219</p>', '<style>a[href^="mailto:"]::before{content:"✉"}</style>']);
  assert.deepEqual(failures(await scan({ '_astro/sitio.css': 'a[href^="mailto:"],a[href^="tel:"]{text-decoration:none}' })), []);
});

test('R-RULE-01: un prefijo de moneda antes de «$» es un precio en el texto, en los atributos, en los scripts y en el CSS', async () => {
  // La base y la ronda 1 los detectaban; la excepción de «$» pegado a una letra solo vale para el código de un script.
  await assertEachFails('R-RULE-01', [
    '<p>MX$350</p>', '<p>Desde MX$ 1,200</p>', '<p>US$25</p>', '<p>MN$350</p>', '<p>Casco: mx$350</p>', '<p title="US$25">Casco</p>', '<p data-precio-visible="Desde MX$350">Casco</p>',
    '<style>.p::after{content:"MX$350"}</style>', '<script>el.textContent="MX$350";</script>',
  ]);
  for (const [path, content] of [['_astro/app.js', 'el.textContent="MX$350";'], ['_astro/app.js', "el.innerHTML='Desde <b>US$ 25</b>';"], ['_astro/sitio.css', '.p::after{content:"MX$350"}'],
    ['datos.json', '{"t":"Desde MX$ 1,200"}'], ['img/p.svg', '<svg xmlns="http://www.w3.org/2000/svg"><text>MX$350</text></svg>']]) {
    assert.deepEqual(failedIds(await scan({ [path]: content })), ['R-RULE-01'], content);
  }
  // En el código, «$» pegado a un identificador sigue sin ser un precio.
  for (const content of ['const x=$(1);const y=$2;', 'const a$1=2;', 'const u=`${n}`;', 'const URL$1=globalThis.URL;new URL$1(a);', 'var A$2=e=>e;A$2(1);']) {
    assert.deepEqual(failures(await scan({ '_astro/app.js': content })), [], content);
  }
});

test('R-RULE-01: dentro de una cadena de un script o de un JSON, «MX$350» es un precio aunque lo siga un signo', async () => {
  // La excepción del código («$» pegado a un identificador) no vale dentro de una cadena: ahí todo es texto.
  const texts = ['Desde MX$350 (IVA incluido)', 'Casco (MX$350)', 'MX$350; envío aparte', '¿Solo MX$350?', 'MX$350: lista', '(desde MX$ 350)'];
  for (const text of texts) {
    assert.deepEqual(failedIds(await scan({ '_astro/app.js': `el.textContent=${JSON.stringify(text)};` })), ['R-RULE-01'], `JS ${text}`);
    assert.deepEqual(failedIds(await scan({ '_astro/app.js': `el.textContent=\`${text}\`;` })), ['R-RULE-01'], `plantilla ${text}`);
    assert.deepEqual(failedIds(await scan({ 'datos.json': JSON.stringify({ t: text }) })), ['R-RULE-01'], `JSON ${text}`);
  }
  await assertEachFails('R-RULE-01', ['<script>el.textContent="Desde MX$350 (IVA incluido)";</script>', '<script>el.textContent="Casco (MX$350)";</script>', '<script type="application/json">{"t":"Casco (MX$350)"}</script>']);
  // Fuera de las cadenas sigue la excepción del código; la cadena de reemplazo de .replace() y una expresión regular no son texto.
  for (const content of ['var URL$1=globalThis.URL;function f(e){return e.$2}const a=$1;', 'a=b.replace(/x/,"MX$1");', 'const r=/^MX$/;', 'const q=/["\']/g;var A$1=2;A$1(q);', 'const t=`${a}`;var B$2=1;']) {
    assert.deepEqual(failures(await scan({ '_astro/app.js': content })), [], content);
  }
  await assertNoneFails(['<script>$(1);var A$1=2;</script>']);
  // Una dirección se lee como texto: ninguna dirección del sitio lleva «$» seguido de una cifra, así que «a$1» en un
  // href falla a propósito (la excepción del código solo vale para el código de un script).
  await assertEachFails('R-RULE-01', ['<a href="/catalogo/?q=a$1">Catálogo</a>']);
});

test('R-RULE-01: un precio en el texto de un borrador de WhatsApp o de correo, aunque lo siga un signo', async () => {
  // El borrador es la única acción comercial del sitio: su texto se lee como texto, con el %XX decodificado.
  const EMAIL = data.business.email;
  await assertEachFails('R-RULE-01', [
    `<a href="${WHATSAPP}?text=Hola%2C%20quiero%20cotizar%20Casco%20(MX%24350)">Cotizar</a>`,
    `<a href="${WHATSAPP}?text=Casco%20MX%24350%3B%20gracias">Cotizar</a>`,
    `<a href="${WHATSAPP}?text=%C2%BFEl%20casco%20cuesta%20MX%24350%3F">Cotizar</a>`,
    `<a href="mailto:${EMAIL}?subject=Casco%20(MX%24350)">Correo</a>`,
    `<a href="mailto:${EMAIL}?subject=Cotizaci%C3%B3n&amp;body=Casco%20(MX%24350)">Correo</a>`,
    `<a href="${WHATSAPP}?text=Casco%20precio%3D%24350">Cotizar</a>`,
  ]);
  // Sin codificar, el mismo texto falla además por R-QUOTE-06.
  assert.ok(failedIds(await scan({ 'pagina/index.html': page(`<a href="${WHATSAPP}?text=precio=$350">Cotizar</a>`) })).includes('R-RULE-01'));
  // El texto de --rules lo dice.
  assert.ok(RULES.some(rule => rule.id === 'R-RULE-01' && rule.scope === 'prose' && rule.doc.includes('también las direcciones')));
  assert.ok(!RULES.some(rule => rule.doc.includes('salvo los que son una dirección')));
  // El texto de un borrador sin precio sigue limpio.
  await assertNoneFails([`<a href="${WHATSAPP}?text=Hola%2C%20Yosmara.%0AProducto%3A%20Casco%20(modelo%203)%3B%20cantidad%3A%2012">WhatsApp</a>`]);
});

test('R-RULE-01: una cadena `content:` del CSS se lee entera, aunque lleve «;» o «}»', async () => {
  const css = ['.p::after{content:"Desde MX$350; IVA incluido"}', '.p::after{content:"Envío; casco (MX$350)"}', ".p::after{content:'Envío} casco $350'}",
    '.p::after{content:"Desde " "MX$350;"}', '.p::after{content:"\\24 350"}', 'a::before{content:"x"}b::after{content:"Casco; MX$350"}b{color:red}'];
  for (const content of css) assert.deepEqual(failedIds(await scan({ '_astro/sitio.css': content })), ['R-RULE-01'], content);
  await assertEachFails('R-RULE-01', ['<style>.p::after{content:"Desde MX$350; IVA incluido"}</style>', "<style>.p::after{content:'Envío} casco $350'}</style>", '<p style=\'--x:1;content:"Envío; casco (MX$350)"\'>x</p>']);
  // Lo que ya estaba limpio sigue limpio: cadenas vacías, escapes que no son un precio, contadores y CSS compactado.
  for (const content of ['.a::before{content:""}', '.q::before{content:"\\201C"}', 'li::before{content:counter(x) ". "}', 'a::before{content:"x"}b{color:red}',
    '.p::after{content:";"}.q{margin:0}', ".p::after{content:'}'}.q{margin:0}"]) {
    assert.deepEqual(failures(await scan({ '_astro/sitio.css': content })), [], content);
  }
  await assertNoneFails(['<style>.q::before{content:"\\201C"}</style>', '<p style=\'content:"; "\'>x</p>']);
});

test('R-RULE-01: «precio» con «por», «con», «de» o «para» y una palabra antes de la cifra, y las claves de precio en el código', async () => {
  await assertEachFails('R-RULE-01', [
    '<p>Precio por pieza 350.00</p>', '<p>Precio con IVA 350</p>', '<p>Precio de mayoreo 300</p>', '<p>Precio para mayoristas 300</p>', '<p>Costo por unidad 120</p>',
    '<p>Tarifa de envío $90</p>',
  ]);
  await assertNoneFails(['<h2>Precios y cotización 2026</h2>', '<p>Te damos el precio en 24 horas</p>', '<p>Modelo 3 MN</p>', '<p>Pedido mínimo 12 piezas</p>', '<p>Paquete con 2 frascos de 350 ml</p>']);
  // Una clave de precio en el código público o en un JSON falla siempre: el sitio no tiene campos de precio.
  for (const content of ['var o={monto:5};', 'var o={price:5};', 'var p={a:1,precio:"350"};']) {
    assert.deepEqual(failedIds(await scan({ '_astro/app.js': content })), ['R-RULE-01'], content);
  }
  assert.ok(RULES.some(rule => rule.id === 'R-RULE-01' && rule.doc.includes('{monto:5}')), 'el texto de --rules dice que una clave de precio en el código falla');
});

test('R-RULE-01: una cifra seguida de una unidad de cantidad no es un precio', async () => {
  await assertNoneFails(['<p>Cotiza precio por volumen: 100 piezas o más</p>', '<p>Precio por volumen: 12 pares</p>', '<p>Tarifa de envío: 3 cajas</p>', '<p>Precio de mayoreo 50 pzas. en adelante</p>',
    '<p>Precio por volumen 100 pzas</p>', '<p>Pregunta el precio de 12 pares</p>', '<p>El precio de 2026 lo confirma Sercom</p>']);
  // La misma frase con una cifra que no es una cantidad sigue siendo un precio.
  await assertEachFails('R-RULE-01', ['<p>Precio por volumen: 100</p>', '<p>Precio por volumen: 100 pesos</p>', '<p>Precio: 100.00 por pieza</p>', '<p>Precio por pieza 35 MXN</p>']);
  // Solo es una cantidad un número entero seguido de una unidad en plural, sin otra cifra en la misma frase: «35 pza»,
  // «35.50 pieza» o «3 pares por 250» son la forma de escribir un precio por unidad.
  await assertEachFails('R-RULE-01', [
    '<p>Precio: 35 pza</p>', '<p>Precio 35 pza</p>', '<p>Precio: 35.50 pieza</p>', '<p>Precio: 3 pares por 250</p>', '<p>Precio: 12 piezas 1,500</p>', '<p>Precio: 120 caja</p>',
    '<p>Precio: 45 metro</p>', '<p>Precio: 1 pieza 35.00</p>', '<p>Precio: 10 piezas = 350</p>', '<p>Precio: 100 piezas o más, 30 c/u</p>', '<p>Precio: 3 cajas por 900</p>',
    '<p>Precio de mayoreo: 6 pares 900</p>', '<p>Costo: 1 kit 1500</p>', '<p>Precio: 350 kg</p>', '<p>Precio de 350</p>',
  ]);
});

test('R-RULE-01: un porcentaje, una talla, una serie o un modelo después de «precio por|con|de|para» no son un precio', async () => {
  await assertNoneFails(['<p>El precio con IVA 16% se confirma al cotizar</p>', '<p>Precio para talla 9 al cotizar</p>', '<p>Precio de serie 6000: se cotiza</p>', '<p>Precio por modelo 3M al cotizar</p>']);
  await assertEachFails('R-RULE-01', ['<p>Precio con IVA 350</p>', '<p>Precio para mayoristas 300</p>', '<p>Precio de mayoreo 300</p>']);
});

test('R-RULE-01: una cifra más IVA, «c/u» después de una cifra con dos decimales y «precio» con una palabra y «de»', async () => {
  // Las de la revisión final, que pasaban, y otras escrituras de lo mismo.
  await assertEachFails('R-RULE-01', [
    '<p>Casco 350 + IVA</p>', '<p>Guante de nitrilo 25.50 + IVA</p>', '<p>Casco 350 más IVA</p>', '<p>Casco 350 mas IVA</p>', '<p>Casco 350+IVA</p>', '<p>Casco 1,200.00 + iva</p>',
    '<p>Guante 25.50 c/u</p>', '<p>Lentes 1,250.50 c/u</p>', '<p>Guante 25,50 c/u</p>', '<p>Casco 350 <b>+ IVA</b></p>', '<div data-msg="Casco 350 + IVA"></div>',
    // La revisión de la ronda 1 lo detectaba (decisión 2).
    '<p>Precio unitario de 120</p>', '<p>Costo aproximado de 350</p>',
  ]);
  for (const content of ['el.textContent="Guante 25.50 + IVA";', 'toast("Lentes 25.50 c/u");']) assert.deepEqual(failedIds(await scan({ '_astro/app.js': content })), ['R-RULE-01'], content);
  // Un porcentaje con IVA sigue como estaba, y «c/u» después de un entero puede ser una cantidad.
  await assertNoneFails([
    '<p>Precio con IVA 16%</p>', '<p>IVA 16%</p>', '<p>16% + IVA</p>', '<p>Cotización con IVA desglosado</p>', '<p>12 pares c/u</p>', '<p>25 c/u</p>', '<p>Guante de nitrilo 25 c/u</p>',
    '<p>Caja con 12 pares c/u</p>', '<p>Precio unitario de 2026 en adelante: a cotizar</p>', '<p>Precio sugerido de 12 pares: a cotizar</p>', '<p>Precio por talla de 9 a 11</p>',
  ]);
});

test('R-RULE-01: una cifra con IVA incluido, con o sin IVA, I.V.A.; una cifra pegada a una letra después de «de» es un nombre', async () => {
  // Otras escrituras de una cifra con el IVA, que ninguna versión detectaba.
  await assertEachFails('R-RULE-01', [
    '<p>Casco 350 IVA incluido</p>', '<p>Casco 350 con IVA</p>', '<p>Casco 350 + I.V.A.</p>', '<p>Casco 350 más I.V.A.</p>', '<p>Casco 350 sin IVA</p>',
    '<p>Casco 350 más el IVA</p>', '<p>Guante 25.50 I.V.A. incluido</p>', '<p>Casco 350 iva incluido</p>', '<p>Casco 350 con I.V.A</p>',
  ]);
  // «Precio … de» con una cifra sigue fallando, también con una unidad pegada o una moneda.
  await assertEachFails('R-RULE-01', ['<p>Precio unitario de 120</p>', '<p>Precio de 350</p>', '<p>Precio de 35pza</p>', '<p>Precio unitario de 25.50pza</p>', '<p>Precio de 350MXN</p>']);
  await assertNoneFails([
    // 3M es una de las marcas: «de 3M» no es una cifra (también «Los precios de 3M…», que la versión de f37334b marcaba).
    '<p>El precio vigente de 3M se confirma al cotizar.</p>', '<p>Los precios actuales de 3M y Ansell se confirman al cotizar.</p>', '<p>El costo real de 3M se confirma al cotizar.</p>',
    '<p>Precio unitario de 3M: a cotizar</p>', '<p>Tarifas vigentes de 3M: a cotizar</p>', '<p>Los precios de 3M se confirman al cotizar.</p>', '<p>Precio de 3M: a cotizar</p>',
    // Un porcentaje con IVA y el IVA sin cifra siguen como estaban.
    '<p>16% IVA incluido</p>', '<p>16% con IVA</p>', '<p>16 % + IVA</p>', '<p>IVA del 16 %</p>', '<p>Todas las cotizaciones son en pesos mexicanos más IVA.</p>',
    '<p>Caja con 12 pares con IVA desglosado</p>', '<p>NOM-017-STPS-2008 con IVA desglosado al cotizar</p>',
  ]);
  // El texto de --rules dice lo que la regla reconoce ahora.
  const printed = spawnSync(process.execPath, ['scripts/scan-dist.mjs', '--rules'], { cwd: ROOT, encoding: 'utf8' }).stdout;
  assert.match(printed, /«con IVA», «sin IVA» o «IVA incluido», también escrito «I\.V\.A\.»/);
  assert.match(printed, /el nombre de una marca de brands\.json que empieza con una cifra[^\n]*no es una cifra: «El precio vigente de 3M»/);
});

test('R-RULE-01: después de «precio de» solo el nombre de una marca que empieza con una cifra no es un precio', async () => {
  // Una cifra pegada a letras sigue siendo un precio (f37334b las detectaba): una oferta, un importe abreviado, una
  // unidad o el nombre de la marca escrito de otra forma.
  await assertEachFails('R-RULE-01', [
    '<p>Precio de 2x1</p>', '<p>Precio de 2x1: consulta</p>', '<p>Precio de 3x2 en guantes</p>', '<p>Precio de 350c/IVA</p>', '<p>Precio de 350k</p>', '<p>Precio de 5K</p>',
    '<p>Precio de 99c/u</p>', '<p>Costo de 3m</p>', '<p>Precio de 3MM</p>', '<p>Tarifa de 3M2</p>', '<p>Precio unitario de 350k</p>', '<p>Precio unitario de 2x1</p>',
    // La marca seguida de una cifra: la cifra es el precio.
    '<p>Precio de 3M 350</p>', '<p>Precio de 3M-350</p>', '<p>Precio de marca 3M 350</p>',
  ]);
  // La marca escrita como la escribe (con su mayúscula y como palabra completa) es un nombre. «Los precios de 3M…» y
  // «Precio de 3M: a cotizar» fallaban en f37334b: son texto de marca y no dicen ningún precio (la única excepción a
  // la decisión 2 de esta corrección).
  await assertNoneFails([
    '<p>El precio vigente de 3M se confirma al cotizar.</p>', '<p>Los precios de 3M se confirman al cotizar.</p>', '<p>Precio de 3M: a cotizar</p>',
    '<p>Los precios actuales de 3M y Ansell se confirman al cotizar.</p>', '<p>El costo real de 3M se confirma al cotizar.</p>', '<p>Precio unitario de 3M: a cotizar</p>',
    '<p>Precio de marca 3M</p>', '<p>Precio de <b>3M</b>: a cotizar</p>',
  ]);
  // Cada marca de brands.json cuyo nombre empieza con una cifra está en la excepción: una marca nueva así se nota aquí.
  const figureBrands = data.brands.map(brand => brand.name).filter(name => /^\d/.test(name));
  assert.ok(figureBrands.includes('3M'), 'brands.json tiene hoy una marca que empieza con una cifra');
  for (const name of figureBrands) {
    for (const body of [`<p>Precio de ${name}: a cotizar</p>`, `<p>Los precios de ${name} se confirman al cotizar.</p>`, `<p>El precio vigente de ${name} se confirma al cotizar.</p>`, `<p>Precio de marca ${name}</p>`]) {
      assert.deepEqual(failures(await scan({ 'pagina/index.html': page(body) })), [],
        `${body}: la marca «${name}» de brands.json empieza con una cifra y no está en la excepción de R-RULE-01 (FIGURE_BRANDS de scripts/scan-dist.mjs)`);
    }
  }
  // Una marca que no está en la excepción se lee como una cifra: así es como la prueba anterior la notaría.
  assert.deepEqual(failedIds(await scan({ 'pagina/index.html': page('<p>Precio de 4Safe: a cotizar</p>') })), ['R-RULE-01']);
  const printed = spawnSync(process.execPath, ['scripts/scan-dist.mjs', '--rules'], { cwd: ROOT, encoding: 'utf8' }).stdout;
  assert.match(printed, /«Precio de 2x1», «Precio de 350k», «Costo de 3m» y «Precio de 3M 350» sí/);
});

test('R-RULE-10: el sustantivo y el participio con una o dos palabras entre ellos, «ha quedado» y la frase que termina', async () => {
  await assertEachFails('R-RULE-10', [
    '<p>Mensaje de WhatsApp enviado</p>', '<p>Tu lista de productos enviada</p>', '<p>Solicitud por WhatsApp enviada</p>', '<p>¡Tu solicitud a Sercom enviada!</p>',
    '<p>Su solicitud ha quedado registrada</p>', '<p>La solicitud enviada.</p>', '<p>La solicitud enviada</p>', '<p>Tu lista de productos fue enviada</p>', '<p>Solicitud especial enviada</p>',
    '<p>Te enviaremos la cotización en breve</p>', '<p>Un asesor se comunicará contigo</p>', '<p>Recibirás tu cotización en breve</p>', '<div data-msg="Solicitud &lt;b&gt;enviada&lt;/b&gt;"></div>',
  ]);
  for (const content of ['toast("Mensaje de WhatsApp enviado");', 't.innerHTML="La solicitud <b>enviada</b>.";']) {
    assert.deepEqual(failedIds(await scan({ '_astro/app.js': content })), ['R-RULE-10'], content);
  }
  // El participio como adjetivo dentro de una frase que sigue, o después de una preposición, no es una confirmación.
  await assertNoneFails([
    '<p>Revisa la lista enviada por WhatsApp</p>', '<p>Una vez enviado tu mensaje, Sercom contesta por WhatsApp.</p>', '<p>Cuando tu mensaje sea enviado desde tu teléfono.</p>',
    '<p>Marcas y productos registrados</p>', '<p>El correo registrado del negocio</p>', '<p>Nunca se ha enviado nada sin tu permiso.</p>', '<p>Nadie ha recibido tus datos.</p>',
    '<p>Escribe al correo registrado.</p>', '<p>Revisa los datos en la lista enviada.</p>', '<p>Recibirás tu cotización por WhatsApp o por correo.</p>', '<p>Consulta la lista de marcas registradas en cada ficha.</p>', '<p>Lista de marcas registradas</p>',
  ]);
});

test('R-RULE-10: un nombre o un sustantivo de dos palabras entre el sustantivo y el participio, y la frase con su destino', async () => {
  await assertEachFails('R-RULE-10', [
    '<p>¡Tu solicitud a Sercom Active enviada!</p>', '<p>Solicitud por correo electrónico enviada</p>', '<p>Mensaje de WhatsApp Business enviado</p>', '<p>Mensaje para Sercom Active enviado</p>',
    '<p>Tu lista de 3 productos enviada</p>', '<p>Tu pedido de 3 productos enviado</p>', '<p>La solicitud enviada a Sercom</p>', '<p>Listo: la solicitud enviada a Sercom.</p>',
  ]);
  assert.deepEqual(failedIds(await scan({ '_astro/app.js': 'toast("¡Tu solicitud a Sercom Active enviada!");' })), ['R-RULE-10']);
  // Una negación o una condición antes del sustantivo, un verbo en el hueco o el participio que sigue como adjetivo no confirman nada.
  await assertNoneFails([
    '<p>Ningún mensaje queda registrado en este sitio.</p>', '<p>Cuando tu solicitud queda enviada desde tu WhatsApp, Sercom responde.</p>', '<p>Sin correo registrado.</p>',
    '<p>Escribe tu mensaje para que sea enviado desde tu WhatsApp.</p>', '<p>La lista enviada a Sercom incluye la página de cada producto.</p>',
  ]);
});

test('R-RULE-10: un plazo de respuesta con una cifra', async () => {
  const promises = ['Recibirás tu cotización en 24 horas', 'Te respondemos en menos de 24 horas', 'Te cotizamos en 24 hrs', 'Respondemos en 2 horas', 'Te enviamos tu cotización en 1 día hábil',
    'Recibes tu cotización dentro de 48 horas'];
  await assertEachFails('R-RULE-10', promises.map(text => `<p>${text}</p>`));
  for (const text of promises) assert.deepEqual(failedIds(await scan({ '_astro/app.js': `toast(${JSON.stringify(text)});` })), ['R-RULE-10'], `JS ${text}`);
  await assertNoneFails(['<p>Precio en 24 horas</p>', '<p>La disponibilidad y el tiempo de entrega se confirman al cotizar.</p>', '<label>Fecha requerida:</label>', '<label>Entrega en (ciudad o código postal):</label>',
    '<p>Horario: lunes a viernes de 9 a 18 horas</p>', '<p>Usa el respirador un máximo de 8 horas</p>', '<p>Cambia el filtro cada 40 horas</p>', '<p>No recibirás nada en 24 horas sin pedirlo.</p>']);
  // Después de «que», «y», «para» o una coma empieza otra oración: el plazo ya no es el de la respuesta.
  await assertNoneFails(['<p>Recibes guantes de nitrilo que se cambian en 4 horas de uso.</p>', '<p>Recibes un extintor que se recarga en 1 hora.</p>', '<p>Te cotizamos el equipo que usas en 8 horas de turno.</p>',
    '<p>Te enviamos la lista para que la revises en 5 minutos.</p>', '<p>Recibes el arnés y lo ajustas en 2 minutos.</p>', '<p>Recibes un respirador que protege en 8 horas de jornada.</p>', '<p>Te enviamos el casco, que se ajusta en 2 minutos.</p>',
    // Una duración de uso («de turno», «de uso», «de jornada») tampoco es un plazo de respuesta.
    '<p>Respondemos tus dudas sobre el uso en 8 horas de turno.</p>', '<p>Te cotizamos filtros para trabajar en 40 horas de uso.</p>']);
  // El segundo verbo de la frase sigue contando por sí mismo, y «días de trabajo» son días hábiles, no una duración de uso.
  await assertEachFails('R-RULE-10', ['<p>Te respondemos y cotizamos en 24 horas</p>', '<p>Te cotizamos en 2 días de trabajo</p>', '<p>Respondemos en 24 horas de servicio.</p>']);
});

test('R-RULE-10: contestar y mandar, la primera persona del singular con un plazo, el plazo antes del verbo y «ya tenemos»', async () => {
  // Las promesas de la revisión final, que pasaban.
  const promises = ['Te contestaremos a la brevedad.', 'Te contestamos pronto.', 'Te contestaremos en 24 horas.', 'Te mandamos tu cotización en 24 horas.',
    'En breve recibirás tu cotización.', 'Pronto recibirás tu cotización.', '¡Gracias! Ya tenemos tu solicitud.', 'Te daremos respuesta en menos de 24 horas.',
    'Te respondo a la brevedad.', 'Te contesto a la brevedad.'];
  await assertEachFails('R-RULE-10', promises.map(text => `<p>${text}</p>`));
  for (const text of promises) assert.deepEqual(failedIds(await scan({ '_astro/app.js': `toast(${JSON.stringify(text)});` })), ['R-RULE-10'], `JS ${text}`);
  // Otras formas de lo mismo: contestar y mandar en plural sin «te», el singular con un plazo con cifra o sin ella, el
  // plazo antes del verbo y «ya tenemos» con otro sustantivo.
  await assertEachFails('R-RULE-10', [
    '<p>Contestamos a la brevedad.</p>', '<p>Contestaremos tu mensaje en 24 horas.</p>', '<p>Mandamos tu cotización en 1 día hábil.</p>', '<p>Le contestamos hoy mismo.</p>',
    '<p>Te escribo en 24 horas.</p>', '<p>Te envío la cotización a la brevedad.</p>', '<p>Le mando tu cotización hoy mismo.</p>', '<p>Te responderé en breve.</p>',
    '<p>Respondo en menos de 2 horas.</p>', '<p>A la brevedad te respondo.</p>', '<p>En breve te contestamos.</p>', '<p>Ya tenemos tu lista.</p>', '<p>Ya tenemos su pedido.</p>',
    '<p>Te daremos una respuesta pronto.</p>', '<p>Te <b>contesto</b> a la brevedad.</p>',
  ]);
  // Sin plazo, la primera persona del singular no promete nada; «envío» y «mando» sin «te» o «le» son sustantivos.
  await assertNoneFails([
    '<p>Te respondo dudas sobre tallas por WhatsApp.</p>', '<p>Escríbeme por WhatsApp y te respondo.</p>', '<p>Mando la ficha técnica si el fabricante la publica.</p>',
    '<p>Te respondo por WhatsApp o por correo.</p>', '<p>Contesto tus dudas sobre tallas.</p>', '<p>Te mando la ficha técnica cuando el fabricante la publica.</p>',
    '<p>Envío de la ficha técnica: pídela en tu mensaje.</p>', '<p>Si lo necesitas pronto, dilo en tu mensaje.</p>', '<p>Tenemos tu lista de marcas a la vista en el catálogo.</p>',
    '<p>Escríbeme y te respondo con la disponibilidad confirmada al cotizar.</p>',
  ]);
});

test('R-RULE-10: el plazo antes del verbo con coma o con cifra, «te damos respuesta»; «envío» y «mando» solos no son verbos', async () => {
  await assertEachFails('R-RULE-10', [
    '<p>En breve, recibirás tu cotización.</p>', '<p>A la brevedad, te respondo.</p>', '<p>Pronto, recibirás tu cotización.</p>', '<p>A la brevedad, recibirás respuesta.</p>',
    '<p>En 24 horas recibirás tu cotización.</p>', '<p>Dentro de 48 horas recibirás tu cotización.</p>', '<p>En 24 horas, te contesto.</p>', '<p>En un día hábil cotizamos tu lista.</p>',
    '<p>Te damos respuesta en 24 horas.</p>', '<p>Te damos respuesta a la brevedad.</p>', '<p>Le damos una respuesta pronto.</p>',
    // «envío» y «mando» con te, le o les delante siguen siendo verbos en los dos órdenes.
    '<p>Pronto te envío la cotización.</p>', '<p>De inmediato le mando la ficha.</p>', '<p>A la brevedad les mando la cotización.</p>',
  ]);
  await assertNoneFails([
    // Sustantivos después de un plazo sin cifra.
    '<p>Solicita tu cotización para un pronto envío.</p>', '<p>Arnés con pronto envío de la ficha técnica.</p>', '<p>Paro de emergencia: de inmediato mando a cero.</p>',
    '<p>Válvula de cierre de inmediato mando manual.</p>', '<p>Botón de paro de inmediato mando apagado.</p>',
    // Una duración de uso no es un plazo, y un plazo con coma seguido de otra cosa que un verbo de respuesta no promete nada.
    '<p>En 8 horas de uso recibes una alerta para cambiar el filtro.</p>', '<p>En 8 horas de turno, recibes protección continua.</p>', '<p>Pronto, más marcas en el catálogo.</p>',
    '<p>En breve, el catálogo tendrá productos.</p>', '<p>Te damos el precio en 24 horas</p>',
  ]);
  const printed = spawnSync(process.execPath, ['scripts/scan-dist.mjs', '--rules'], { cwd: ROOT, encoding: 'utf8' }).stdout;
  assert.match(printed, /«te damos respuesta»/);
  assert.match(printed, /el plazo antes del verbo, con cifra o sin ella y con una coma o sin ella/);
  assert.match(printed, /«un pronto envío» y «de inmediato mando a cero» no fallan/);
});

test('R-RULE-24: un destino codificado más de una vez dentro de otra dirección', async () => {
  await assertEachFails('R-RULE-24', [
    '<a href="https://l.example.com/?u=https%253A%252F%252Fwa.me%252F5215555555555">WhatsApp</a>',
    '<a href="https://l.example.com/?u=https%25253A%25252F%25252Fwa.me%25252F5215555555555">WhatsApp</a>',
    '<a href="https://l.example.com/?u=mailto%253Aotro%2540example.com">Correo</a>',
    // Codificado cinco veces: la base lo detectaba.
    `<a href="https://l.example.com/?u=${[1, 2, 3, 4, 5].reduce(text => encodeURIComponent(text), 'https://wa.me/5215555555555')}">WhatsApp</a>`,
  ]);
  assert.deepEqual(failedIds(await scan({ '_astro/app.js': 'location.href="https://l.example.com/?u=https%253A%252F%252Fwa.me%252F5215555555555";' })), ['R-RULE-24']);
  // El enlace confirmado codificado dos veces dentro de otro sigue siendo el confirmado.
  await assertNoneFails([`<a href="https://l.example.com/?u=${encodeURIComponent(encodeURIComponent(WHATSAPP))}">WhatsApp</a>`]);
});

test('R-RULE-29: colores de la paleta anterior en setProperty, constantes y claves de color, animaciones de SVG y atributos de color antiguos', async () => {
  for (const content of ["el.style.setProperty('--marca','#0e2a3e');", "el.style.setProperty('--x', '#00a6e4');", "const NAVY='#0e2a3e';el.style.color=NAVY;", "const tema={primary:'#00a6e4'};",
    'const brand="#0e2a3e";', 'var c={accent:"#00a4e6",bg:"#0e2a3e"};']) {
    assert.deepEqual(failedIds(await scan({ '_astro/app.js': content })), ['R-RULE-29'], content);
  }
  assert.deepEqual(failedIds(await scan({ 'img/a.svg': '<svg xmlns="http://www.w3.org/2000/svg"><rect><animate attributeName="fill" to="#0e2a3e"/></rect></svg>' })), ['R-RULE-29']);
  await assertEachFails('R-RULE-29', [
    '<svg><rect><set attributeName="fill" to="#0e2a3e"/></rect></svg>', '<svg><rect><animate attributeName="fill" from="#00a6e4" to="#fff"/></rect></svg>',
    '<svg><rect><animate attributeName="fill" values="#fff;#0e2a3e"/></rect></svg>', '<table bordercolor="#0e2a3e"><tr><td>x</td></tr></table>',
    '<table bgcolor="#0e2a3e"><tr><td>x</td></tr></table>', '<font color="#00a6e4">x</font>',
  ]);
  // El segundo argumento de setProperty sea cual sea el primero, los valores de un objeto o una lista de colores y «by» de <animate>.
  for (const content of ["el.style.setProperty(nombre,'#0e2a3e');", "const colores={fondo:'#0e2a3e'};", "const palette=['#0e2a3e','#fff'];", "const paleta=['#0e2a3e'];", "const tema={fondo:'#0e2a3e'};"]) {
    assert.deepEqual(failedIds(await scan({ '_astro/app.js': content })), ['R-RULE-29'], content);
  }
  assert.deepEqual(failedIds(await scan({ 'img/a.svg': '<svg xmlns="http://www.w3.org/2000/svg"><rect><animate attributeName="fill" by="#0e2a3e"/></rect></svg>' })), ['R-RULE-29']);
  // Un ancla, un identificador o un dato con forma de color, fuera de un nombre de color, siguen limpios.
  await assertNoneFails(['<a href="#00a6e9">Ir</a><p id="00a6e9">Texto</p>', '<svg><a href="#00a6e9"><text>x</text></a></svg>', '<svg><set attributeName="href" to="#00a6e9"/></svg>']);
  for (const [path, content] of [['datos.json', '{"x":"#0e2a40"}'], ['_astro/app.js', 'const ancla="#00a6e9";'], ['_astro/app.js', "el.style.setProperty('--ancho','12px');location.hash='#00a6e9';"],
    ['_astro/app.js', "const marca={id:'#0e2a3e'};"], ['_astro/app.js', "const primary={label:'Cotizar',href:'#00a6e9'};"]]) {
    assert.deepEqual(failures(await scan({ [path]: content })), [], content);
  }
});

test('R-RULE-29: un nombre de color cuenta donde empieza un nombre o una parte de él, no dentro de otra palabra', async () => {
  // «tema» dentro de «sistema» no es un tema, y «temas» son asuntos: un ancla bajo esos nombres no es un color.
  for (const content of ["const sistema={id:'#00a6e9'};", "const temas=[{titulo:'Envíos',ancla:'#00a6e9'}];", "const sistemas={id:'#00a6e9'};", "const problemas=[{ancla:'#00a6e9'}];",
    "const esquema={id:'#00a6e9'};", "const sistema='#00a6e9';", "var o={sistema:'#00a6e9',subtema:'#00a6e9'};", "const TEMAS=[{ancla:'#00a6e9'}];", "const temasDelMes=[{ancla:'#00a6e9'}];"]) {
    assert.deepEqual(failures(await scan({ '_astro/app.js': content })), [], content);
  }
  assert.deepEqual(failures(await scan({ 'datos.json': '{"sistema":{"id":"#00a6e9"},"temas":[{"ancla":"#00a6e9"}]}' })), [], 'JSON');
  // Al principio del nombre, después de «_», «-» o «$», o en una parte en camelCase, sí cuenta.
  for (const content of ["const themeColors={fondo:'#0e2a3e'};", "const brandColors=['#0e2a3e'];", "const miPaleta=['#0e2a3e'];", "const TEMA={primary:'#0e2a3e'};", "const tema_claro={x:'#0e2a3e'};",
    "const temaSecundario={x:'#0e2a3e'};", "const COLOR_PRIMARIO='#0e2a3e';", "const azulMarino='#0e2a3e';", "const btnFondo='#0e2a3e';", "const $marca='#0e2a3e';", "el.style.setProperty('--color-marca','#0e2a3e');"]) {
    assert.deepEqual(failedIds(await scan({ '_astro/app.js': content })), ['R-RULE-29'], content);
  }
});

test('R-RULE-29: un nombre de color pegado a otra palabra o en mayúsculas sigue contando', async () => {
  // Solo «tema» necesita empezar un nombre o una parte de él; «color», «bg», «theme» y las demás palabras de color
  // cuentan en cualquier lugar del nombre, como antes: «textcolor», «MAINCOLOR», «navbg», «darktheme».
  for (const content of ["const textcolor='#0e2a3e';", "const maincolor='#0e2a3e';", "const MAINCOLOR='#0e2a3e';", "const UIColor='#0e2a3e';", "var o={linkcolor:'#0e2a3e'};",
    "var o={fontcolor:'#0e2a3e'};", "const navbg='#0e2a3e';", "const darktheme={x:'#0e2a3e'};", "const sitetheme={x:'#0e2a3e'};", "const textcolor='rgb(14,42,62)';"]) {
    assert.deepEqual(failedIds(await scan({ '_astro/app.js': content })), ['R-RULE-29'], content);
  }
  assert.deepEqual(failedIds(await scan({ 'datos.json': '{"textcolor":"#0e2a3e"}' })), ['R-RULE-29'], 'JSON');
});

test('R-RULE-29: «temática», «temático» y «temario» son otras palabras; «tema» pegado a otra palabra sigue contando', async () => {
  for (const content of ["const tematica={id:'#00a6e9'};", "const temario=[{ancla:'#00a6e9'}];", "const TEMARIO=[{ancla:'#00a6e9'}];", "const Tematica={id:'#00a6e9'};", "var o={tematica:'#00a6e9'};",
    "const temática={id:'#00a6e9'};", "const tematico=[{ancla:'#00a6e9'}];", "const temarios=[{ancla:'#00a6e9'}];", "const TEMATICAS=[{ancla:'#00a6e9'}];"]) {
    assert.deepEqual(failures(await scan({ '_astro/app.js': content })), [], content);
  }
  // «tema» sigue contando solo, en camelCase, después de «_», en mayúsculas y pegado a otra palabra.
  for (const content of ["const tema={x:'#0e2a3e'};", "const temaOscuro={x:'#0e2a3e'};", "const TemaClaro={x:'#0e2a3e'};", "const TEMA_OSCURO={x:'#0e2a3e'};", "const tema2={x:'#0e2a3e'};",
    "const temaoscuro={x:'#0e2a3e'};", "const temaclaro={texto:'#0e2a3e',enlace:'#00a6e4'};", "const TEMAOSCURO={x:'#0e2a3e'};", "const temaprincipal='#0e2a3e';"]) {
    assert.deepEqual(failedIds(await scan({ '_astro/app.js': content })), ['R-RULE-29'], content);
  }
  assert.deepEqual(failedIds(await scan({ 'datos.json': '{"temaoscuro":{"texto":"#0e2a3e"}}' })), ['R-RULE-29'], 'JSON');
});

test('R-RULE-12: robots.txt reconoce «useragent» y «user agent» como el principio de un grupo', async () => {
  for (const robots of ['User-agent: *\nDisallow: /\n\nuseragent: Googlebot\nDisallow:\n', 'User-agent: *\nDisallow: /\n\nuser agent: Googlebot\nAllow: /\n', 'useragent: *\nDisallow: /\n\nUSERAGENT: Bingbot\nDisallow: /privado/\n']) {
    assert.deepEqual(failedIds(await scan({ 'robots.txt': robots })), ['R-RULE-12'], robots);
  }
  for (const robots of ['useragent: *\nDisallow: /\n', 'User-agent: *\nDisallow: /\n\nuser agent: Googlebot\nDisallow: /\n']) {
    assert.deepEqual(failures(await scan({ 'robots.txt': robots })), [], robots);
  }
  const launched = robots => ({ 'index.html': page('<h1>Inicio</h1>', { robots: '' }), 'robots.txt': robots });
  assert.deepEqual(failedIds(await scan(launched('User-agent: *\nAllow: /\n\nuser agent: Bingbot\nDisallow: /\n'), { launch: true })), ['R-PUB-03']);
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

test('R-COPY-15: el título de la portada es el nombre del negocio, « · » y titleLabel', async () => {
  assert.equal(HOME_TITLE, 'Sercom Active · Atención en Puebla');
  for (const options of [{}, { preview: true }]) {
    const home = title => ({ 'index.html': options.preview ? previewPage('<h1>Inicio</h1>', { title }) : page('<h1>Inicio</h1>', { title }) });
    assert.deepEqual(failures(await scan(home(HOME_TITLE), options)), [], JSON.stringify(options));
    // Las entidades y los espacios sobrantes no cambian el título que se lee.
    assert.deepEqual(failures(await scan(home(`  ${data.business.name}\n&middot;   Atenci&oacute;n en Puebla `), options)), []);
    // La etiqueta del encabezado, el nombre solo, otro separador, un título vacío o ninguno.
    for (const title of [`${data.business.name} · Atención comercial en Puebla`, data.business.name, `${data.business.name} - ${data.business.titleLabel}`, '', 'Inicio · Sercom Active']) {
      const result = await scan(home(title), options);
      assert.deepEqual(failures(result).map(finding => [finding.id, finding.file]), [['R-COPY-15', 'index.html']], title);
    }
    const untitled = await scan({ 'index.html': home('')['index.html'].replace('<title></title>', '') }, options);
    assert.deepEqual(failedIds(untitled), ['R-COPY-15']);
    // Un título escondido en un comentario no cuenta; el de la página sí.
    const hidden = home(data.business.name)['index.html'].replace('</head>', `<!-- <title>${HOME_TITLE}</title> --></head>`);
    assert.deepEqual(failedIds(await scan({ 'index.html': hidden }, options)), ['R-COPY-15']);
  }
  // Solo la portada: las páginas interiores llevan «<Página> · Sercom Active».
  assert.deepEqual(failures(await scan({ 'contacto/index.html': page('<h1>Contacto</h1>', { title: `Contacto · ${data.business.name}` }) })), []);
  // Sin titleLabel en los datos, la portada no puede tener el título correcto.
  const data2 = { ...data, business: { ...data.business, titleLabel: undefined } };
  assert.ok(failedIds(await scan({}, { data: data2 })).includes('R-COPY-15'));
});

test('R-PUB-04: la página 404 nunca declara una dirección canónica', async () => {
  const canonical = '<link rel="canonical" href="https://sitio.example/404/">';
  for (const options of [{}, { preview: true }]) {
    const make = head => (options.preview ? previewPage('<h1>No encontramos esta página.</h1>', { head, title: 'Página no encontrada · Sercom Active' }) : page('<h1>No encontramos esta página.</h1>', { head, title: 'Página no encontrada · Sercom Active' }));
    const home = options.preview ? { 'index.html': previewPage() } : {};
    assert.deepEqual(failures(await scan({ ...home, '404.html': make('') }, options)), [], JSON.stringify(options));
    for (const head of [canonical, "<link href='https://sitio.example/' rel='CANONICAL'>", '<link rel="alternate canonical" href="/">', '<link rel=canonical href=/404/>']) {
      const result = await scan({ ...home, '404.html': make(head) }, options);
      assert.deepEqual(failures(result).map(finding => [finding.id, finding.file]), [['R-PUB-04', '404.html']], head);
    }
    // En un comentario no es una declaración.
    assert.deepEqual(failures(await scan({ ...home, '404.html': make(`<!-- ${canonical} -->`) }, options)), []);
  }
  // Las demás páginas sí la llevan cuando se compila con SITE_URL.
  assert.deepEqual(failures(await scan({
    'index.html': page('<h1>Inicio</h1>', { head: '<link rel="canonical" href="https://sitio.example/">' }),
    'contacto/index.html': page('<h1>Contacto</h1>', { head: '<link rel="canonical" href="https://sitio.example/contacto/">' }),
  })), []);
});

test('cada regla está documentada y conserva su identificador', () => {
  for (const rule of RULES) {
    assert.match(rule.id, /^R-[A-Z0-9]+-\d{2}$/);
    assert.ok(rule.title.length > 5 && rule.doc.length > 40, rule.id);
    assert.ok(['text', 'joined', 'words', 'prose', 'raw', 'norm'].includes(rule.scope), rule.id);
  }
  const documented = new Set([...RULES.map(rule => rule.id), ...CHECKS.map(([id]) => id)]);
  for (const id of ['R-RULE-01', 'R-RULE-03', 'R-RULE-07', 'R-RULE-08', 'R-RULE-10', 'R-RULE-12', 'R-RULE-13', 'R-RULE-14', 'R-RULE-24', 'R-RULE-29', 'R-NAV-17', 'R-COPY-15', 'R-PUB-04']) {
    assert.ok(documented.has(id), id);
  }
  for (const [, doc] of CHECKS) assert.ok(doc.length > 30);
});

test('--rules dice qué lectura de la página usa cada revisión de los avisos de arriba', () => {
  const docs = id => CHECKS.filter(([check]) => check === id).map(([, doc]) => doc).join('\n');
  // Las que exigen un aviso leen el texto que se muestra, y listan lo que no cuenta como mostrado.
  for (const id of ['R-RULE-03', 'R-RULE-12']) {
    assert.match(docs(id), /texto que se muestra/, id);
    for (const item of ['aria-hidden="true"', 'popover', '<details> cerrado salvo su primer <summary>', 'content-visibility:hidden', '<iframe>', '<noembed>', '<noframes>',
      '<datalist>', '<video>', '<audio>', '<canvas>', '<object> con data', '<desc>', '<metadata>', '<rp>', '«<?…>»', '«</ …>»', 'comentarios o escapes de CSS', '<textarea>']) {
      assert.ok(docs(id).includes(item), `${id}: ${item}`);
    }
  }
  // Las que lo prohíben leen todo el texto de los elementos, oculto o no.
  assert.match(docs('R-RULE-12'), /La vista previa lleva solo su propio aviso: [^\n]*también oculto \(en todo el texto de los elementos, oculto o no/);
  assert.match(docs('R-PUB-03'), /tampoco oculto[^\n]*en todo el texto de los elementos, oculto o no/);
  // El contenido de los elementos de texto crudo se lee tal cual y además como marcado.
  for (const id of ['R-RULE-12', 'R-PUB-03']) {
    assert.match(docs(id), /<noscript>, <textarea>, <title>, <iframe>, <noembed>, <noframes>, <xmp> y <plaintext> se lee tal cual y además como marcado/, id);
  }
});

test('--rules dice los límites de las dos lecturas y no promete más de lo que hace el escáner', () => {
  const docs = id => CHECKS.filter(([check]) => check === id).map(([, doc]) => doc).join('\n');
  // El texto que se muestra: lo que no modela, y que entonces un aviso que no se muestra puede contar como mostrado.
  for (const id of ['R-RULE-03', 'R-RULE-12']) {
    assert.doesNotMatch(docs(id), /no puede saberlo, el aviso cuenta como no mostrado/, id);
    for (const item of ['no es un analizador de HTML', 'SVG', 'MathML', '<text>', 'CDATA', '<annotation>', 'display="none"', 'visibility="hidden"',
      'var(', '&semi;', 'elemento de formato', '<select>', 'doble escape de <script>', 'puede contar como mostrado', 'a propósito']) {
      assert.ok(docs(id).includes(item), `${id}: ${item}`);
    }
  }
  // Todo el texto de los elementos: un aviso escrito con entidades poco comunes no se reconoce.
  for (const id of ['R-RULE-12', 'R-PUB-03']) {
    for (const item of ['&Tab;', '&NewLine;', '&centerdot;', 'no se reconoce', 'a propósito']) assert.ok(docs(id).includes(item), `${id}: ${item}`);
  }
});

test('--rules nombra «representante» en R-RULE-07 y todo <iframe> en R-RULE-11', async () => {
  // Los dos disparadores existen (no cambian) y el texto de cada regla los dice.
  assert.deepEqual(failedIds(await scan({ 'pagina/index.html': page('<p>Habla con un representante de ventas</p>') })), ['R-RULE-07']);
  assert.deepEqual(failedIds(await scan({ 'pagina/index.html': page('<iframe src="https://www.youtube-nocookie.com/embed/x" title="Video del fabricante"></iframe>') })), ['R-RULE-11']);
  // El texto que imprime --rules (R-RULE-11 solo aplica sin --in-person y no está en RULES).
  const printed = spawnSync(process.execPath, ['scripts/scan-dist.mjs', '--rules'], { cwd: ROOT, encoding: 'utf8' }).stdout;
  const entry = (id, title) => printed.split(/\n(?=R-|BUILD)/).find(block => block.startsWith(id) && block.includes(title)) ?? '';
  assert.match(entry('R-RULE-07', 'oficial'), /^R-RULE-07 .*«oficial», «autorizado», distribuidor, sucursal o representante\n[^]*La palabra «representante» \(y «representantes»\) falla siempre/);
  assert.match(entry('R-RULE-11', 'mapa'), /Cualquier <iframe> falla mientras la atención presencial no esté confirmada, porque el escáner no distingue un mapa de otra inserción: un video del fabricante se da como enlace/);
});

test('--rules y check-links no prometen revisar los botones: un botón sin efecto solo se encuentra en el navegador', async () => {
  // R-RULE-30: check-links revisa enlaces; los botones de la cabecera, check-markup; un botón sin efecto, solo el navegador.
  const links = CHECKS.filter(([id]) => id === 'R-RULE-30').map(([, doc]) => doc).join('\n');
  assert.doesNotMatch(links, /controles inertes/);
  assert.match(links, /vacíos, «#», javascript: o un <a> sin href/);
  assert.match(links, /botones propios de la cabecera/);
  assert.match(links, /Un botón que no hace nada no lo encuentra ninguna comprobación: solo la revisión de la página en el navegador/);
  const header = (await readText('scripts/check-links.mjs')).split('\nimport ')[0];
  assert.doesNotMatch(header, /controles inertes/);
  assert.match(header, /Solo revisa enlaces: un <button> u otro control que no hace nada no se detecta aquí/);
  assert.match(header, /Un botón sin efecto solo se encuentra revisando la página en el navegador/);
});

test('línea de comandos: código 0 sin fallos, 1 con fallos y 2 cuando no hay nada que revisar', async () => {
  const cli = (...args) => spawnSync(process.execPath, ['scripts/scan-dist.mjs', ...args], { cwd: ROOT, encoding: 'utf8' });
  const clean = await makeTree(site({ 'robots.txt': ROBOTS, 'index.html': page() }));
  const dirty = await makeTree(site({ 'robots.txt': ROBOTS, 'index.html': page('<p>Sitio oficial, todo a $10</p>') }));
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
    const warned = await makeTree(site({ 'robots.txt': ROBOTS, 'index.html': page('<p>Guante EN 388. Arnés certificado.</p>') }));
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
