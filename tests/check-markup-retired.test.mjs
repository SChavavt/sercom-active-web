import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CHECKS, checkMarkup, FICHA_TEXTS, isRetiredPage, RETIRED_PAGE_TEXTS } from '../scripts/check-markup.mjs';
import { makeTree, removeTree, ROOT } from './helpers.mjs';

// Las comprobaciones de la página de un producto retirado (R-STATE-04) de scripts/check-markup.mjs.
const RETIRED_CHECKS = CHECKS.filter(check => check.id.startsWith('R-STATE-04'));

// ---------------------------------------------------------------------------------------------------
// Páginas mínimas con el marcado de la ficha (src/pages/productos/[id].astro) y de RetiredProduct.astro.
// ---------------------------------------------------------------------------------------------------

const AVAILABILITY = 'Disponibilidad y tiempo de entrega sujetos a confirmación al cotizar.';
// El pie del sitio repite el aviso de disponibilidad: no es el de la ficha.
const FOOTER = `<footer class="site-footer"><p class="t-small">${AVAILABILITY}</p></footer>`;
const doc = (title, body) => `<!doctype html><html lang="es-MX"><head><meta charset="utf-8"><title>${title} · Sercom Active</title></head><body>`
  + `<a class="skip-link" href="#contenido">Saltar al contenido</a><div class="sheet"><main id="contenido" tabindex="-1">${body}</main>${FOOTER}</div></body></html>`;
const action = (label, href, primary = false) => `<a class="action cell-link${primary ? ' action--primary' : ''}" href="${href}"><span>${label}</span><svg class="icon" width="20" height="20"></svg></a>`;
const WA = 'https://wa.me/5212214002219?text=Hola';
const MAIL = 'mailto:ventas.puebla@sercomactive.com?subject=Consulta%20de%20alternativas';
const row = (key, value) => `<div class="data__row"><dt class="data__key label">${key}</dt><dd class="data__value">${value}</dd></div>`;
const head = name => `<div class="producto__head cell"><a class="producto__cat label" href="/categorias/manos/">Protección de manos</a><h1 class="producto__title t-title" id="titulo">${name}</h1></div>`;
const LABEL = '<p class="producto__retired-label eyebrow label">Producto retirado</p>';
const LEAD = '<p class="producto__retired-lead">Este producto ya no forma parte del catálogo.</p>';
const TEXT = '<p class="producto__retired-text">Dinos qué necesitas y revisamos alternativas.</p>';
const NOTICE = `<div class="producto__retired cell">${LABEL}${LEAD}${TEXT}</div>`;
const ACTIONS = `<div class="producto__actions">${action('Consultar alternativas', WA, true)}${action('Consultar por correo', MAIL)}</div>`;

/** Cuerpo de la página de un retirado; `parts` cambia una pieza. */
function retiredBody(parts = {}) {
  const p = { head: head('Producto de prueba retirado'), data: `<dl class="data producto__data">${row('Marca', 'Marca de prueba')}${row('Código', '<span class="t-code">PR-1</span>')}</dl>`, notice: NOTICE, actions: ACTIONS, extra: '', after: '', ...parts };
  return `<section class="producto grid12" aria-labelledby="titulo"><div class="producto__media span-7"><div class="producto__frame"><span class="producto__plate"><svg></svg></span></div></div>`
    + `<div class="producto__body span-5">${p.head}${p.data}${p.notice}${p.actions}${p.extra}</div></section>`
    + '<section class="section" aria-labelledby="especial-title"><div class="band grid12"><div class="band__body span-8"><h2 class="t-h2" id="especial-title">¿Buscas algo que no aparece en el catálogo?</h2></div></div></section>'
    + `${p.after}<section class="section" aria-labelledby="mas-title"><header class="sec-head"><h2 class="t-h2" id="mas-title">Más productos de esta categoría</h2></header>`
    + '<div class="products grid12"><article class="product span-3"><h3 class="product__name t-h3">Guante de prueba</h3><a class="product__action" href="/productos/guante/"><span>Ver ficha</span></a>'
    + `<a class="product__action product__action--quote" href="${WA}"><span>Cotizar<span class="vh">: Guante de prueba</span></span></a></article></div></section>`;
}
const retiredPage = (parts, title = 'Producto de prueba retirado (producto retirado)') => doc(title, retiredBody(parts));
/** Cuerpo de una ficha. */
const fichaBody = (extra = '') => `<section class="producto grid12" aria-labelledby="titulo"><div class="producto__body span-5">${head('Guante de prueba')}`
  + `<dl class="data producto__data">${row('Marca', 'Marca de prueba')}${row('Código', 'PR-2')}${row('Unidad de venta', 'par')}</dl><div class="producto__summary cell"><p>Resumen.</p></div>`
  + `<div class="producto__actions">${action('Cotizar este producto', WA, true)}${action('Cotizar por correo', MAIL)}</div><p class="note producto__note"><span>${AVAILABILITY}</span></p>${extra}</div></section>`;
const fichaPage = extra => doc('Guante de prueba', fichaBody(extra));

/** Revisa un sitio temporal (una portada, una ficha y la página de un retirado, más `files`) con las comprobaciones del retirado. */
async function check(files = {}, ids) {
  const directory = await makeTree({
    'index.html': doc('Inicio', '<h1>Inicio</h1>'),
    'productos/guante/index.html': fichaPage(),
    'productos/retirado/index.html': retiredPage(),
    ...files,
  });
  try {
    const { problems } = await checkMarkup(directory, { preview: true, checks: RETIRED_CHECKS });
    return ids ? problems.filter(problem => ids.includes(problem.id)) : problems;
  } finally {
    await removeTree(directory);
  }
}
/** Cada página rota, puesta en la dirección del retirado, produce un problema de la comprobación con ese mensaje. */
async function assertEachBreaks(id, cases, path = 'productos/retirado/index.html') {
  for (const [html, expected] of cases) {
    const problems = await check({ [path]: html }, [id]);
    assert.ok(problems.length >= 1 && problems.every(problem => problem.file === path), `${id}: ${expected}\n${JSON.stringify(problems)}`);
    assert.ok(problems.some(problem => expected.test(problem.message)), `${id}: ${expected}\n${problems.map(problem => problem.message).join('\n')}`);
  }
}

test('las cuatro comprobaciones del producto retirado están en CHECKS', () => {
  assert.deepEqual(RETIRED_CHECKS.map(check => check.id), ['R-STATE-04a', 'R-STATE-04b', 'R-STATE-04c', 'R-STATE-04d']);
  for (const entry of RETIRED_CHECKS) {
    assert.ok(entry.title.length > 40, entry.id);
    assert.equal(typeof entry.page, 'function', entry.id);
  }
});

test('los textos que busca el verificador son los que escriben las plantillas', async () => {
  // El verificador repite estos textos; si una plantilla cambia el suyo, hay que cambiarlo también en
  // scripts/check-markup.mjs (RETIRED_PAGE_TEXTS, FICHA_TEXTS) o la comprobación deja de mirar lo que la página dice.
  const retired = await readFile(join(ROOT, 'src/components/RetiredProduct.astro'), 'utf8');
  const ficha = await readFile(join(ROOT, 'src/pages/productos/[id].astro'), 'utf8');
  const { notice, sentences, alternatives, alternativesMail } = RETIRED_PAGE_TEXTS;
  for (const text of [notice, ...sentences, alternatives, alternativesMail]) assert.ok(retired.includes(`>${text}<`), `RetiredProduct.astro ya no escribe «${text}»`);
  for (const text of [...FICHA_TEXTS.actions, FICHA_TEXTS.availability, ...FICHA_TEXTS.parts]) assert.ok(ficha.includes(`>${text}<`), `la ficha ya no escribe «${text}»`);
  assert.ok(ficha.includes(`title="${FICHA_TEXTS.helpBand}"`), `la ficha ya no escribe «${FICHA_TEXTS.helpBand}»`);
  // Y las clases del aviso que el verificador pide son las de la plantilla.
  for (const name of ['producto__retired cell', 'producto__retired-label eyebrow label', 'producto__head cell']) assert.ok(retired.includes(`class="${name}"`), name);
});

test('un sitio con una ficha y la página de un retirado correctas pasa todas', async () => {
  assert.deepEqual(await check(), []);
  // Sin la fila de marca o de código (dato que falta) también pasa.
  assert.deepEqual(await check({ 'productos/retirado/index.html': retiredPage({ data: `<dl class="data producto__data">${row('Código', 'PR-1')}</dl>` }) }), []);
  assert.deepEqual(await check({ 'productos/retirado/index.html': retiredPage({ data: '' }) }), []);
  // Una página que no es de producto, sin aviso, no se revisa.
  assert.deepEqual(await check({ 'contacto/index.html': doc('Contacto', '<h1>Contacto</h1><h1>Otro</h1>') }), []);
});

test('isRetiredPage: la página de un producto con el aviso', () => {
  const page = (route, names) => ({ route, elements: names.map(([name, cls, text]) => ({ name, attributes: new Map(cls ? [['class', cls]] : []), children: [], text: text ? [text] : [], content: text ? [text] : [], parent: null, order: 1 })) });
  assert.equal(isRetiredPage(page('/productos/retirado/', [['div', 'producto__retired cell']])), true);
  assert.equal(isRetiredPage(page('/productos/retirado/', [['p', '', 'PRODUCTO RETIRADO']])), true);
  assert.equal(isRetiredPage(page('/productos/guante/', [['p', '', 'Cotizar este producto']])), false);
  assert.equal(isRetiredPage(page('/contacto/', [['div', 'producto__retired cell']])), false);
  assert.equal(isRetiredPage(page('/productos/', [['div', 'producto__retired cell']])), false);
  assert.equal(isRetiredPage(page('/productos/a/b/', [['div', 'producto__retired cell']])), false);
});

test('R-STATE-04a: una página de producto es ficha o retirado; el aviso no aparece en otra página', async () => {
  assert.deepEqual(await check({}, ['R-STATE-04a']), []);
  await assertEachBreaks('R-STATE-04a', [
    [doc('Producto', '<h1>Producto</h1>'), /no lleva «Cotizar este producto» ni el aviso/],
    [retiredPage({ notice: '' }), /no lleva «Cotizar este producto» ni el aviso/],
    [retiredPage({ extra: action('Cotizar este producto', WA, true) }), /es una ficha o la de un retirado, no las dos/],
    // La acción con puntuación, en mayúsculas, sin acento, partida en elementos o en un botón sigue siendo la acción.
    [retiredPage({ extra: action('Cotizar este producto.', WA, true) }), /no las dos/],
    [retiredPage({ extra: action('COTIZAR ESTE PRODUCTO', WA, true) }), /no las dos/],
    [retiredPage({ extra: `<a class="action" href="${WA}">Cotizar <b>este</b> producto</a>` }), /no las dos/],
    [retiredPage({ extra: `<a class="action" href="${WA}"><b>Cotizar</b> este producto »</a>` }), /no las dos/],
    [retiredPage({ extra: '<button type="button">¡Cotizar este producto!</button>' }), /no las dos/],
  ]);
  // Y una ficha cuya acción cambia de forma sigue siendo una ficha.
  assert.deepEqual(await check({ 'productos/guante/index.html': doc('Guante de prueba', fichaBody().replace('Cotizar este producto', 'COTIZAR ESTE PRODUCTO')) }, ['R-STATE-04a']), []);
  // La ficha con el aviso (o con la etiqueta suelta, en cualquier forma) también falla.
  await assertEachBreaks('R-STATE-04a', [
    [fichaPage(NOTICE), /no las dos/],
    [fichaPage('<p class="tag">PRODUCTO RETIRADO</p>'), /no las dos/],
  ], 'productos/guante/index.html');
  // Fuera de /productos/{id}/ ninguna página lleva el aviso.
  for (const path of ['catalogo/index.html', 'index.html', 'productos/index.html', '404.html']) {
    await assertEachBreaks('R-STATE-04a', [[doc('Página', `<h1>Página</h1>${NOTICE}`), /no es la de un producto/], [doc('Página', '<h1>Página</h1><span>Producto retirado</span>'), /no es la de un producto/]], path);
  }
  // La etiqueta partida en elementos (también por dentro de una palabra o con el hijo antes del texto), con
  // puntuación o con otros espacios también es el aviso: el texto se lee en el orden del documento.
  const disguised = [
    '<p class="eyebrow label">Producto <b>retirado</b></p>',
    '<p class="eyebrow label"><b>Producto</b> retirado</p>',
    '<p class="eyebrow label">Produc<b>to</b> retirado</p>',
    '<p class="eyebrow label">Pro<i>duc</i>to reti<i>rado</i></p>',
    '<p class="eyebrow label"><span>Producto</span> <span>retirado</span></p>',
    '<p class="eyebrow label">Producto retirado.</p>',
    '<p>«Producto retirado»</p>',
    '<p>¡Producto&nbsp;retirado!</p>',
    '<p>Producto retirado:</p>',
    '<p>PRODUCTO RETIRÁDO</p>',
  ];
  for (const html of disguised) {
    await assertEachBreaks('R-STATE-04a', [[doc('Categoría', `<h1>Categoría</h1>${html}`), /no es la de un producto/]], 'categorias/manos/index.html');
    await assertEachBreaks('R-STATE-04a', [[fichaPage(html), /no las dos/]], 'productos/guante/index.html');
  }
  // El mensaje nombra el elemento que lleva la etiqueta, no la celda que lo contiene.
  await assertEachBreaks('R-STATE-04a', [[doc('Marca', '<h1>Marca</h1><div class="cell"><span class="label">Producto retirado</span></div>'), /^<span\.label> lleva el aviso/]], 'marcas/ansell/index.html');
  // Un texto que solo contiene esas palabras dentro de una frase más larga no es el aviso.
  assert.deepEqual(await check({ 'categorias/manos/index.html': doc('Categoría', '<h1>Categoría</h1><p>Si un producto retirado te interesa, escríbenos.</p>') }, ['R-STATE-04a']), []);
});

test('isRetiredPage: la etiqueta partida o con puntuación también marca la página', () => {
  const label = { name: 'p', attributes: new Map([['class', 'eyebrow label']]), children: [], text: ['Producto'], content: ['Producto'], parent: null, order: 1 };
  const bold = { name: 'b', attributes: new Map(), children: [], text: ['retirado.'], content: ['retirado.'], parent: label, order: 2 };
  label.children.push(bold);
  label.content.push(bold);
  assert.equal(isRetiredPage({ route: '/productos/retirado/', elements: [label, bold] }), true);
  const sentence = ['Producto retirado hace tiempo'];
  assert.equal(isRetiredPage({ route: '/productos/retirado/', elements: [{ ...label, children: [], text: sentence, content: sentence }] }), false);
});

test('R-STATE-04b: el aviso completo y las dos acciones para consultar alternativas, en orden', async () => {
  assert.deepEqual(await check({}, ['R-STATE-04b']), []);
  const notice = inner => `<div class="producto__retired cell">${inner}</div>`;
  await assertEachBreaks('R-STATE-04b', [
    [retiredPage({ notice: notice(`${LEAD}${TEXT}`), extra: '<p class="tag">Producto retirado</p>' }), /no lleva la etiqueta «Producto retirado»/],
    [retiredPage({ notice: notice(`<p class="producto__retired-label label">Producto retirado</p>${LEAD}${TEXT}`) }), /cuadro sólido/],
    [retiredPage({ notice: notice(`<p class="eyebrow label">Producto retirado</p>${LEAD}${TEXT}`) }), /tinta, no en azul/],
    [retiredPage({ notice: notice(`${LABEL}${TEXT}`) }), /le falta la frase «Este producto ya no forma parte del catálogo\.»/],
    [retiredPage({ notice: notice(`${LABEL}${LEAD}`) }), /le falta la frase «Dinos qué necesitas y revisamos alternativas\.»/],
    [retiredPage({ notice: notice(`${LABEL}${TEXT}${LEAD}`) }), /otro orden/],
    [retiredPage({ notice: `${NOTICE}${NOTICE}` }), /2 celdas del aviso/],
    [retiredPage({ actions: action('Consultar por correo', MAIL) }), /0 acciones «Consultar alternativas»/],
    [retiredPage({ actions: action('Consultar alternativas', WA, true) }), /0 acciones «Consultar por correo»/],
    [retiredPage({ actions: `${action('Consultar alternativas', MAIL, true)}${action('Consultar por correo', MAIL)}` }), /no abre WhatsApp/],
    [retiredPage({ actions: `${action('Consultar alternativas', WA)}${action('Consultar por correo', MAIL)}` }), /no es la acción sólida/],
    [retiredPage({ actions: `${action('Consultar alternativas', WA, true)}${action('Consultar por correo', WA)}` }), /no abre el correo/],
    [retiredPage({ actions: `${action('Consultar alternativas', WA, true)}${action('Consultar por correo', MAIL, true)}` }), /va sólida/],
    [retiredPage({ actions: `${action('Consultar por correo', MAIL)}${action('Consultar alternativas', WA, true)}` }), /va antes de «Consultar alternativas»/],
    [retiredPage({ head: `${head('Producto de prueba retirado')}${ACTIONS}`, actions: '' }), /va antes del aviso/],
    [retiredPage({ extra: action('Consultar alternativas', WA, true) }), /2 acciones «Consultar alternativas»/],
  ]);
});

test('R-STATE-04c: un solo H1, en el bloque del título y antes del aviso; el título dice «(producto retirado)»', async () => {
  assert.deepEqual(await check({}, ['R-STATE-04c']), []);
  await assertEachBreaks('R-STATE-04c', [
    [retiredPage({ extra: '<h1>Otro título</h1>' }), /2 H1/],
    [retiredPage({ head: '<div class="producto__head cell"><h2>Producto de prueba retirado</h2></div>' }), /0 H1/],
    [retiredPage({ head: '<div class="producto__head cell"><h1></h1></div>' }), /el H1 está vacío/],
    [retiredPage({ head: '<div class="cell"><h1>Producto de prueba retirado</h1></div>' }), /no está en el bloque del título/],
    [retiredPage({ head: '', extra: head('Producto de prueba retirado') }), /después del aviso/],
    [retiredPage({}, 'Producto de prueba retirado'), /no empieza con «Producto de prueba retirado \(producto retirado\)»/],
    [retiredPage({}, 'Otro nombre (producto retirado)'), /no empieza con/],
  ]);
});

test('R-STATE-04d: nada de la ficha en la página de un retirado', async () => {
  assert.deepEqual(await check({}, ['R-STATE-04d']), []);
  const part = title => `<section class="producto__part" aria-labelledby="p"><h2 class="producto__part-title t-h3" id="p">${title}</h2></section>`;
  await assertEachBreaks('R-STATE-04d', [
    [retiredPage({ extra: '<a class="action cell-link" href="mailto:x"><span>Cotizar por correo</span></a>' }), /la acción «Cotizar por correo»/],
    [retiredPage({ extra: '<a class="producto__doc cell-link" href="https://wa.me/1"><span>Solicitar ficha técnica</span></a>' }), /la acción «Solicitar ficha técnica»/],
    [retiredPage({ data: `<dl class="data">${row('Marca', 'Marca de prueba')}${row('Unidad de venta', 'par')}</dl>` }), /la fila «Unidad de venta»/],
    [retiredPage({ extra: '<div class="producto__summary cell"><p>Resumen.</p></div>' }), /\.producto__summary/],
    [retiredPage({ extra: part('Características') }), /«Características»/],
    [retiredPage({ extra: '<section aria-labelledby="v"><h2 id="v">Variantes</h2><ul class="producto__chips"></ul></section>' }), /«Variantes»|\.producto__chips/],
    [retiredPage({ extra: '<section aria-labelledby="d"><h2 id="d">Documentación</h2></section>' }), /«Documentación»/],
    [retiredPage({ extra: '<ul class="producto__docs"><li>Ficha</li></ul>' }), /\.producto__docs/],
    [retiredPage({ extra: `<p class="note producto__note"><span>${AVAILABILITY}</span></p>` }), /\.producto__note/],
    [retiredPage({ extra: `<p>${AVAILABILITY}</p>` }), /el aviso de disponibilidad/],
    [retiredPage({ after: '<section class="section producto__help" aria-labelledby="ayuda-title"><h2 id="ayuda-title">¿Necesitas otra talla, color o presentación?</h2></section>' }), /producto__help|¿Necesitas otra talla/],
  ]);
  // Lo mismo con otra forma: puntuación, mayúsculas, sin acentos o partido en elementos.
  await assertEachBreaks('R-STATE-04d', [
    [retiredPage({ extra: action('Cotizar este producto.', WA, true) }), /la acción «Cotizar este producto»/],
    [retiredPage({ extra: action('COTIZAR ESTE PRODUCTO', WA, true) }), /la acción «Cotizar este producto»/],
    [retiredPage({ extra: '<a class="action cell-link" href="mailto:x">Cotizar por <b>correo</b>.</a>' }), /la acción «Cotizar por correo»/],
    [retiredPage({ extra: '<a class="action cell-link" href="mailto:x"><b>Cotizar</b> por correo</a>' }), /la acción «Cotizar por correo»/],
    [retiredPage({ extra: '<button type="button">SOLICITAR FICHA TECNICA</button>' }), /la acción «Solicitar ficha técnica»/],
    [retiredPage({ extra: '<section aria-labelledby="c"><h2 id="c">CARACTERÍSTICAS</h2></section>' }), /«Características»/],
    [retiredPage({ extra: '<section aria-labelledby="c"><h2 id="c">Caracteristicas:</h2></section>' }), /«Características»/],
    [retiredPage({ extra: '<section aria-labelledby="v"><h3 id="v"><span>Varian</span>tes</h3></section>' }), /«Variantes»/],
    [retiredPage({ extra: '<section aria-labelledby="d"><h2 id="d">Documentación.</h2></section>' }), /«Documentación»/],
    [retiredPage({ after: '<section class="section" aria-labelledby="a"><h2 id="a">Necesitas otra talla, color o presentación</h2></section>' }), /«¿Necesitas otra talla, color o presentación\?»/],
    [retiredPage({ extra: '<p>Disponibilidad y <b>tiempo de entrega</b> sujetos a confirmación al cotizar.</p>' }), /el aviso de disponibilidad/],
    [retiredPage({ extra: '<p><b>Disponibilidad</b> y tiempo de entrega sujetos a confirmación al cotizar</p>' }), /el aviso de disponibilidad/],
    [retiredPage({ extra: '<div><span>Disponibilidad y tiempo de entrega</span><span>sujetos a confirmación al cotizar.</span></div>' }), /el aviso de disponibilidad/],
    [retiredPage({ extra: '<p>DISPONIBILIDAD Y TIEMPO DE ENTREGA SUJETOS A CONFIRMACION AL COTIZAR</p>' }), /el aviso de disponibilidad/],
    [retiredPage({ extra: '<p>Nota: disponibilidad y tiempo de entrega, sujetos a confirmación al cotizar; escríbenos.</p>' }), /el aviso de disponibilidad/],
    [retiredPage({ after: AVAILABILITY }), /el aviso de disponibilidad/],
  ]);
  // Un título o un enlace que solo se parece no es de la ficha.
  assert.deepEqual(await check({ 'productos/retirado/index.html': retiredPage({
    extra: '<section aria-labelledby="s"><h2 id="s">Características del servicio</h2><p>La disponibilidad se confirma al escribirnos.</p><a href="/cotizar/">Cotizar otros productos</a></section>',
  }) }, ['R-STATE-04d']), []);
  // La acción «Cotizar este producto» en un retirado la señalan 04a (no las dos) y 04d.
  const both = await check({ 'productos/retirado/index.html': retiredPage({ extra: action('Cotizar este producto', WA, true) }) }, ['R-STATE-04a', 'R-STATE-04d']);
  assert.deepEqual(both.map(problem => problem.id).sort(), ['R-STATE-04a', 'R-STATE-04d']);
  // El aviso de disponibilidad del pie no cuenta; la ficha no se revisa con esta comprobación.
  assert.deepEqual(await check({}, ['R-STATE-04d']), []);
});
