import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { checkMarkup, cssSelectors, expectedLocation, parseHtml, routeOf, selectorAttributes, selectorClasses, textOf } from '../scripts/check-markup.mjs';
import { makeTree, removeTree, ROOT } from './helpers.mjs';

// ---------------------------------------------------------------------------------------------------
// Un sitio mínimo con la cabecera tal como la escribe SiteHeader, configurable para romper cada comprobación.
// ---------------------------------------------------------------------------------------------------

/**
 * Cabecera de una página.
 * @param {{ search?: boolean, categories?: boolean, marks?: Record<string, string>, classes?: Record<string, string>, order?: string[] }} [options]
 *   `marks`: aria-current por entrada («nav:/marcas/», «nav:categorias», «cat:/categorias/manos/», «cta», «logo»).
 *   `classes`: clases de navegación, búsqueda, campo y botón.
 *   `order`: orden de las piezas de la cabecera (por omisión el de SiteHeader).
 */
const ORDER = ['logo', 'searchButton', 'menuButton', 'nav', 'form', 'wa', 'cta'];
function header({ search = true, categories = true, marks = {}, classes = {}, order = ORDER } = {}) {
  const c = {
    nav: 'masthead__nav', list: 'masthead__nav-list', link: 'masthead__nav-link', cat: 'masthead__nav-cat', quote: 'masthead__nav-item--quote',
    search: 'masthead__search', input: 'masthead__search-input', button: 'masthead__search-btn', ...classes,
  };
  const current = key => (marks[key] ? ` aria-current="${marks[key]}"` : '');
  const link = (href, label) => `<li><a class="${c.link}" href="${href}"${current(`nav:${href}`)}>${label}</a></li>`;
  const searchButton = search ? '<button class="masthead__btn masthead__btn--search" type="button" aria-expanded="false" aria-controls="buscador" data-toggle="search"><span class="label">Buscar</span></button>' : '';
  const menuButton = '<button class="masthead__btn masthead__btn--menu" type="button" aria-expanded="false" aria-controls="menu" data-toggle="menu"><span class="label">Menú</span></button>';
  const cats = categories
    ? `<li><details class="${c.cat}"><summary class="${c.link}"${current('nav:categorias')}>Categorías<svg class="icon" width="20" height="20"><path d="M0 0"/></svg></summary><div class="catpanel"><ul class="catpanel__list grid12">`
      + `<li class="span-2"><a class="catpanel__link cell-link" href="/categorias/manos/"${current('cat:/categorias/manos/')}><span>Protección de manos</span></a></li>`
      + `<li class="span-2"><a class="catpanel__link cell-link" href="/categorias/cabeza/"${current('cat:/categorias/cabeza/')}><span>Protección de cabeza</span></a></li>`
      + `<li class="catpanel__all"><a class="catpanel__link catpanel__link--all cell-link" href="/catalogo/"${current('cat:todo')}><span>Ver todo el catálogo</span></a></li></ul></div></details></li>`
    : '';
  const nav = `<nav class="${c.nav} span-4" id="menu" aria-label="Principal"><ul class="${c.list}">${link('/catalogo/', 'Catálogo')}${cats}${link('/marcas/', 'Marcas')}`
    + `<li class="${c.quote}">${link('/cotizar/', 'Cotizar mi lista').slice(4, -5)}</li>${link('/contacto/', 'Contacto')}</ul></nav>`;
  const form = search
    ? `<form class="${c.search} span-3" id="buscador" role="search" aria-label="Buscar en el catálogo" action="/catalogo/" method="get"><label class="vh" for="q">Buscar</label>`
      + `<span class="masthead__search-field"><input class="${c.input}" id="q" name="q" type="search" placeholder="Buscar en el catálogo" /><span class="masthead__search-hint" aria-hidden="true"><span>Buscar en el catálogo</span></span></span><button class="${c.button}" type="submit" aria-label="Buscar"><svg class="icon" width="20" height="20"></svg></button></form>`
    : '';
  return `<header class="site-header"><div class="utility"><ul class="utility__group"><li class="utility__item">Puebla, México</li></ul></div>`
    + '<div class="masthead grid12">'
    + order.map(piece => ({
      logo: `<a class="masthead__logo span-2" href="/"${current('logo')}><img src="/logo.svg" width="156" height="59" alt="Sercom Active" /></a>`,
      searchButton, menuButton, nav, form,
      wa: '<a class="masthead__wa" href="https://wa.me/5212214002219">WhatsApp</a>',
      cta: `<a class="masthead__cta span-2" href="/cotizar/"${current('cta')}><span>Cotizar mi lista</span></a>`,
    })[piece]).join('')
    + '</div></header>';
}
const dock = (marks = {}) => `<nav class="dock" aria-label="Acciones rápidas"><a class="dock__link" href="/cotizar/"${marks['dock:/cotizar/'] ? ` aria-current="${marks['dock:/cotizar/']}"` : ''}><span>Cotizar mi lista</span></a><a class="dock__link dock__link--wa" href="https://wa.me/5212214002219"><span>WhatsApp</span></a></nav>`;
// El pie por omisión no lleva enlaces: las pruebas del pie lo sustituyen con `withFooter`.
const EMPTY_FOOTER = '<footer class="site-footer"><p class="label">Sercom Active</p></footer>';
const page = (options = {}, body = '<h1>Página</h1>') => `<!doctype html><html lang="es-MX"><head><meta charset="utf-8"><title>Prueba</title></head><body><a class="skip-link" href="#contenido">Saltar al contenido</a>`
  + `<div class="sheet">${header(options)}<main id="contenido" tabindex="-1">${body}</main>${EMPTY_FOOTER}</div>${dock(options.marks)}</body></html>`;
const STYLE = '.masthead__nav{display:flex}.masthead__search{display:flex}.masthead__search-input{flex:1}.masthead__search-btn{width:44px}.masthead__nav-link{padding:0 12px}@media (max-width:1099px){.masthead__nav,.masthead__search{position:absolute;display:none}html:not(.js) .masthead__nav{display:flex}}';

/** Revisa un sitio temporal (una portada correcta más `files`) con solo las comprobaciones indicadas. */
async function check(files, { ids, preview = true } = {}) {
  const directory = await makeTree({ 'index.html': page({ marks: { logo: 'page' } }), '_astro/sitio.css': STYLE, ...files });
  try {
    const result = await checkMarkup(directory, { preview });
    return ids ? result.problems.filter(problem => ids.includes(problem.id)) : result.problems;
  } finally {
    await removeTree(directory);
  }
}

// ---------------------------------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------------------------------

test('el lector de HTML arma el árbol con elementos vacíos, autocerrados y texto sin interpretar', () => {
  const { root, styles } = parseHtml('<div id="a"><img src="x.png"><svg><path d="M0"/></svg><p>Uno &amp; dos</p><script>const s = "<nav class=\'nav\'>";</script><style>.x{color:red}</style></div><span>fin</span>');
  const [div, span] = root.children;
  assert.equal(div.attributes.get('id'), 'a');
  assert.deepEqual(div.children.map(child => child.name), ['img', 'svg', 'p', 'script', 'style']);
  assert.equal(div.children[1].children[0].name, 'path');
  assert.deepEqual(div.children[2].text, ['Uno & dos']);
  assert.equal(div.children[3].children.length, 0, 'el contenido de <script> no se interpreta');
  assert.deepEqual(styles, ['.x{color:red}']);
  assert.equal(span.name, 'span');
});

test('el texto de un elemento se lee en el orden del documento, con el de sus hijos en su lugar', () => {
  const { root } = parseHtml('<p>Uno <b>dos</b> tres <i>cua<u>tro</u></i></p><a><span>Cotizar</span> ahora</a><h2>Produc<b>to</b> &amp; más</h2><title>Inicio · Sitio</title>');
  const [p, a, h2, title] = root.children;
  assert.equal(textOf(p), 'Uno dos tres cua tro');
  assert.deepEqual(p.content.map(part => (typeof part === 'string' ? part : `<${part.name}>`)), ['Uno ', '<b>', ' tres ', '<i>']);
  assert.deepEqual(p.text, ['Uno ', ' tres '], 'el texto directo sigue aparte');
  assert.equal(textOf(a), 'Cotizar ahora');
  assert.equal(textOf(h2), 'Produc to & más');
  assert.equal(textOf(title), 'Inicio · Sitio');
  assert.equal(textOf(root), 'Uno dos tres cua tro Cotizar ahora Produc to & más Inicio · Sitio');
});

test('los selectores y sus clases se leen de cada regla, también dentro de @media', () => {
  const css = '/* .nav comentario */ .a,.b .c:hover{x:1}@media (max-width:1099px){html:not(.js) .d,.e:is(.f, .g){y:2}}@keyframes k{from{z:0}50%{z:1}}.h[data-x="{.nav}"]{w:0}.i::before{content:"}.nav{"}';
  assert.deepEqual(cssSelectors(css), ['.a', '.b .c:hover', 'html:not(.js) .d', '.e:is(.f, .g)', '.h[data-x="{.nav}"]', '.i::before']);
  assert.deepEqual(selectorClasses('.masthead__nav.is-open > .nav__link::after'), ['masthead__nav', 'is-open', 'nav__link']);
  // Los escapes se leen como el navegador; lo que va dentro de un atributo o de una cadena no es una clase.
  assert.deepEqual(selectorClasses('.se\\61 rch .na\\v .\\6e av__link:not(.x)[data-x=".y"]'), ['search', 'nav', 'nav__link', 'x']);
  assert.deepEqual(selectorAttributes('main [class~="nav" i] [data-x=a][class|=b], [CLASS^=se\\61 rch]'), [
    { operator: '~=', value: 'nav', insensitive: true }, { operator: '|=', value: 'b', insensitive: false }, { operator: '^=', value: 'search', insensitive: false },
  ]);
});

test('la ruta de cada página sale de su archivo', () => {
  assert.equal(routeOf('index.html'), '/');
  assert.equal(routeOf('marcas/ansell/index.html'), '/marcas/ansell/');
  assert.equal(routeOf('404.html'), '/404.html');
});

// ---------------------------------------------------------------------------------------------------
// U-07: nombres de la cabecera
// ---------------------------------------------------------------------------------------------------

test('U-07: la cabecera con nombres de su bloque pasa, en vista previa y en producción', async () => {
  assert.deepEqual(await check({ 'marcas/index.html': page({ marks: { 'nav:/marcas/': 'page' } }) }, { ids: ['U-07'] }), []);
  assert.deepEqual(await check({ 'index.html': page({ search: false, categories: false, marks: { logo: 'page' } }) }, { ids: ['U-07'], preview: false }), []);
  // Clases y selectores de atributo que solo se parecen a los retirados.
  const similar = '.navegacion{x:0}.searchbox{x:0}.catalog-search__input{x:0}.search-x{x:0}.catalog-nav__list{x:0}.masthead--no-search .masthead__nav-list{x:0}'
    + '[class*="catalog-nav"]{x:0}[class^="masthead"]{x:0}[data-x~=nav]{x:0}[class]{x:0}.h[data-x="{.nav}"]{x:0}:is(.navegacion,.searchbox){x:0}.i::before{content:".nav"}';
  assert.deepEqual(await check({ '_astro/pagina.css': similar }, { ids: ['U-07'] }), []);
});

test('U-07: una regla de estilo con .nav, .search, .search__input o .search__btn falla', async () => {
  for (const css of ['.nav{display:flex}', '@media (max-width:1099px){.nav.is-open{display:flex}}', 'html:not(.js) .search{display:flex}', '.search__input::placeholder{color:red}', '.a,.search__btn:hover{x:0}']) {
    const problems = await check({ '_astro/otra.css': css }, { ids: ['U-07'] });
    assert.equal(problems.length, 1, css);
    assert.equal(problems[0].file, '_astro/otra.css');
  }
  const inline = await check({ 'pagina/index.html': page().replace('</head>', '<style>.nav{x:0}</style></head>') }, { ids: ['U-07'] });
  assert.deepEqual(inline.map(problem => problem.file), ['pagina/index.html <style> 1']);
});

test('U-07: los hijos del bloque .nav o .search, los selectores de atributo y los escapes también fallan', async () => {
  const cases = [
    // Los hijos que conservaban el nombre genérico: una página con un bloque .nav propio heredaba sus reglas.
    '.nav__item--quote{display:none}', '.nav__list>li{background:#fff}', '.nav__link{min-height:60px}', '.nav__cat{display:flex}', '.search--abierta{x:0}',
    // Otras formas de escribir los mismos nombres.
    '[class~=nav]{display:none}', '[class="search"]{display:none}', '[class~="nav" i]{x:0}', "[class|='search']{x:0}", '[class^=nav]{x:0}',
    '[class*="nav__l"]{x:0}', '[class$="__btn"]{x:0}', '[class*=" search "]{x:0}', 'main [class~=search__input]{x:0}',
    '.se\\61 rch{display:none}', '.na\\v{x:0}', '.\\6e av__link{x:0}',
  ];
  for (const css of cases) {
    const problems = await check({ '_astro/otra.css': css }, { ids: ['U-07'] });
    assert.equal(problems.length, 1, `${css} → ${JSON.stringify(problems.map(problem => problem.message))}`);
  }
});

test('U-07: una parte del valor que toca un espacio por un lado y su borde por el otro puede ser una palabra entera', async () => {
  // «nav » está en «nav x»; « search», en «x search»; «x nav», en «x nav»; «x na», al principio de «x nav».
  const cases = [
    '[class*="nav "]{display:none}', '[class*=" search"]{display:none}', '[class*="x nav"]{x:0}', '[class*="av x"]{x:0}', '[class*="h__input y"]{x:0}',
    '[class*=" nav__link"]{x:0}', '[class*=" nav__otro"]{x:0}', '[class^="x na"]{x:0}', '[class^="x nav__"]{x:0}', '[class$="av x"]{x:0}', '[class$="search x"]{x:0}',
    '[class*="NAV " i]{x:0}', '[class*=" "]{x:0}', '[class^=" na"]{x:0}',
  ];
  for (const css of cases) {
    const problems = await check({ '_astro/otra.css': css }, { ids: ['U-07'] });
    assert.equal(problems.length, 1, `${css} → ${JSON.stringify(problems.map(problem => problem.message))}`);
  }
  // Partes que no pueden ser una de esas palabras entera.
  const near = '[class*="navy"]{x:0}[class*="research"]{x:0}[class*="masthead__nav"]{x:0}[class*="x navy"]{x:0}[class*="anav "]{x:0}[class^="na x"]{x:0}'
    + '[class$="x av"]{x:0}[class*="NAV "]{x:0}[class*="catalog-nav "]{x:0}[class*=" searchbox"]{x:0}';
  assert.deepEqual(await check({ '_astro/pagina.css': near }, { ids: ['U-07'] }), []);
});

test('U-07: «|=» con un valor que, seguido de un guion, empieza una clase retirada falla', async () => {
  // «[class|="nav-"]» selecciona class="nav--open …" (el valor seguido de «-»), y nav--open es del bloque .nav.
  for (const css of ['[class|="nav-"]{display:none}', '[class|="search-"]{x:0}', '[class|=nav]{x:0}', '[class|="NAV-" i]{x:0}']) {
    const problems = await check({ '_astro/otra.css': css }, { ids: ['U-07'] });
    assert.equal(problems.length, 1, `${css} → ${JSON.stringify(problems.map(problem => problem.message))}`);
  }
  // «nav_-…», «na-…» o «NAV-…» (sin «i») nunca son clases retiradas.
  assert.deepEqual(await check({ '_astro/pagina.css': '[class|="nav_"]{x:0}[class|=na]{x:0}[class|="NAV-"]{x:0}[class|="masthead__nav"]{x:0}' }, { ids: ['U-07'] }), []);
});

test('U-07: «^=» y «*=» con una palabra que termina en guion y empieza en un límite se leen como «|=»', async () => {
  // «[class^="nav-"]» selecciona class="nav--open": la palabra «nav-» empieza la clase y nav--… es del bloque .nav.
  for (const css of ['[class^="nav-"] { display: none }', '[class*=" nav-"]{display:none}', '[class^="search-"]{x:0}', '[class^="nav--"]{x:0}',
    '[class*="x nav-"]{x:0}', '[class*=" search-"]{x:0}', '[class^="NAV-" i]{x:0}', '[class^="x nav-"]{x:0}',
    // «nav_» empieza nav__list: ya fallaba y sigue fallando.
    '[class^="nav_"]{x:0}']) {
    const problems = await check({ '_astro/otra.css': css }, { ids: ['U-07'] });
    assert.equal(problems.length, 1, `${css} → ${JSON.stringify(problems.map(problem => problem.message))}`);
  }
  // Sin límite a la izquierda, sin el guion de una familia retirada o con otras mayúsculas (sin «i») no es una clase retirada.
  const near = '[class^="navy"]{x:0}[class*="masthead__nav"]{x:0}[class^="masthead"]{x:0}[class^="NAV-"]{x:0}[class^="na-"]{x:0}[class*="catalog-nav-"]{x:0}'
    + '[class^="search-x"]{x:0}[class$="nav-"]{x:0}[class*="anav-"]{x:0}[class^="masthead__nav-"]{x:0}[class*=" -"]{x:0}[class^="x-nav-"]{x:0}[class^="x nav- y"]{x:0}';
  assert.deepEqual(await check({ '_astro/pagina.css': near }, { ids: ['U-07'] }), []);
});

test('U-07: un selector de atributo con espacio de nombres (*|, |, ns|) se lee igual', async () => {
  for (const css of ['[*|class~=nav]{display:none}', '[|class~=nav]{x:0}', '[svg|class="search"]{x:0}', '[*|CLASS*=" search"]{x:0}']) {
    const problems = await check({ '_astro/otra.css': css }, { ids: ['U-07'] });
    assert.equal(problems.length, 1, `${css} → ${JSON.stringify(problems.map(problem => problem.message))}`);
  }
  assert.deepEqual(selectorAttributes('[*|class~=nav][svg|class|=x][|data-x=nav]'), [{ operator: '~=', value: 'nav', insensitive: false }, { operator: '|=', value: 'x', insensitive: false }]);
  // «class|=» sigue siendo el operador |=, no un espacio de nombres.
  assert.deepEqual(selectorAttributes('[class|=nav]'), [{ operator: '|=', value: 'nav', insensitive: false }]);
  assert.deepEqual(await check({ '_astro/pagina.css': '[*|class~=navy]{x:0}[*|data-x~=nav]{x:0}' }, { ids: ['U-07'] }), []);
});

test('U-07: una clase retirada en una regla anidada, también dentro de una regla condicional anidada, falla', async () => {
  for (const css of ['.masthead { .nav { color: red } }', '.x { @media screen { .nav__link { color: red } } }', '.x{&.search{color:red}}',
    '.x{color:red;@supports (display:grid){@layer y{[class~="search__input"]{x:0}}}}', '.x{.y{.nav--abierta{x:0}}}']) {
    const problems = await check({ '_astro/otra.css': css }, { ids: ['U-07'] });
    assert.equal(problems.length, 1, `${css} → ${JSON.stringify(problems.map(problem => problem.message))}`);
  }
  assert.deepEqual(cssSelectors('.masthead { .nav { color: red } } .x { @media screen { display: none; .nav__link { color: red } } }'), ['.masthead', '.nav', '.x', '.nav__link']);
  assert.deepEqual(await check({ '_astro/pagina.css': '.masthead{.masthead__nav{color:red}@media screen{.navy{x:0}&.searchbox{x:0}}}' }, { ids: ['U-07'] }), []);
});

test('U-07: la cabecera que usa las clases genéricas o no usa las de su bloque falla', async () => {
  const cases = [
    [{ nav: 'nav' }, 2], [{ nav: 'masthead__nav nav' }, 1], [{ search: 'search' }, 2], [{ input: 'search__input' }, 2], [{ button: 'search__btn' }, 2], [{ nav: 'navegacion' }, 1],
    // Los hijos con los nombres anteriores (uno por cada elemento que los lleva: 4 enlaces y el resumen Categorías).
    [{ list: 'nav__list' }, 1], [{ link: 'nav__link' }, 5], [{ cat: 'nav__cat' }, 1], [{ quote: 'nav__item--quote' }, 1],
  ];
  for (const [classes, count] of cases) {
    const problems = await check({ 'pagina/index.html': page({ classes }) }, { ids: ['U-07'] });
    assert.equal(problems.length, count, JSON.stringify(classes));
    assert.ok(problems.every(problem => problem.file === 'pagina/index.html'));
  }
  // En vista previa la búsqueda debe existir; una página sin cabecera nunca pasa.
  assert.equal((await check({ 'pagina/index.html': page({ search: false }) }, { ids: ['U-07'] })).length, 1);
  assert.deepEqual(await check({ 'pagina/index.html': page({ search: false }) }, { ids: ['U-07'], preview: false }), []);
  assert.equal((await check({ 'pagina/index.html': '<!doctype html><html><body><main>Sin cabecera</main></body></html>' }, { ids: ['U-07'] })).length, 1);
});

// ---------------------------------------------------------------------------------------------------
// U-03: orden de la cabecera
// ---------------------------------------------------------------------------------------------------

test('U-03: botones antes de los paneles y orden de computadora correcto pasan, con y sin búsqueda', async () => {
  assert.deepEqual(await check({ 'marcas/index.html': page() }, { ids: ['U-03'] }), []);
  assert.deepEqual(await check({ 'index.html': page({ search: false, categories: false, marks: { logo: 'page' } }) }, { ids: ['U-03'], preview: false }), []);
});

test('U-03: un botón después de su panel, o un orden de computadora distinto, falla', async () => {
  const cases = [
    // El orden anterior a la corrección: Menú al final y Buscar antes de la navegación.
    [['logo', 'searchButton', 'nav', 'form', 'wa', 'cta', 'menuButton'], 2],
    [['logo', 'menuButton', 'nav', 'searchButton', 'form', 'wa', 'cta'], 1],
    [['logo', 'searchButton', 'menuButton', 'form', 'nav', 'wa', 'cta'], 1],
    [['logo', 'searchButton', 'menuButton', 'nav', 'form', 'cta', 'wa'], 1],
    [['searchButton', 'menuButton', 'nav', 'logo', 'form', 'wa', 'cta'], 1],
  ];
  for (const [order, count] of cases) {
    const problems = await check({ 'pagina/index.html': page({ order }) }, { ids: ['U-03'] });
    assert.equal(problems.length, count, `${order.join(' ')} → ${JSON.stringify(problems.map(problem => problem.message))}`);
  }
  // Piezas que faltan: el botón Menú, o en vista previa la búsqueda con su botón.
  assert.equal((await check({ 'pagina/index.html': page({ order: ['logo', 'searchButton', 'nav', 'form', 'wa', 'cta'] }) }, { ids: ['U-03'] })).length, 1);
  assert.equal((await check({ 'pagina/index.html': page({ order: ['logo', 'menuButton', 'nav', 'form', 'wa', 'cta'] }) }, { ids: ['U-03'] })).length, 1);
  assert.equal((await check({ 'pagina/index.html': page({ search: false }) }, { ids: ['U-03'] })).length, 1);
  assert.equal((await check({ 'pagina/index.html': '<!doctype html><html><body><main>Sin cabecera</main></body></html>' }, { ids: ['U-03'] })).length, 1);
});

test('U-03: un tabindex positivo en la cabecera, o -1 en un botón o en una pieza del orden de computadora, falla', async () => {
  const cases = [
    // tabindex positivo: ese elemento pasa delante de todo lo demás al usar Tab.
    ['<a class="masthead__wa"', '<a tabindex="1" class="masthead__wa"'],
    ['<li class="utility__item">', '<li class="utility__item" tabindex="2">'],
    ['<span class="label">Buscar</span>', '<span class="label" tabindex=" +3x">Buscar</span>'],
    // tabindex="-1" (o cualquier negativo): el elemento sale del orden de Tab.
    ['data-toggle="menu"', 'data-toggle="menu" tabindex="-1"'],
    ['data-toggle="search"', 'data-toggle="search" tabindex="-1"'],
    ['<a class="masthead__logo span-2"', '<a tabindex="-1" class="masthead__logo span-2"'],
    ['<a class="masthead__wa"', '<a tabindex="-1" class="masthead__wa"'],
    ['<a class="masthead__cta span-2"', '<a tabindex="-2" class="masthead__cta span-2"'],
    ['<a class="masthead__nav-link" href="/marcas/"', '<a class="masthead__nav-link" tabindex="-1" href="/marcas/"'],
    ['<summary class="masthead__nav-link"', '<summary tabindex="-1" class="masthead__nav-link"'],
    ['<a class="catpanel__link cell-link" href="/categorias/manos/"', '<a tabindex="-1" class="catpanel__link cell-link" href="/categorias/manos/"'],
    ['<input class="masthead__search-input"', '<input tabindex="-1" class="masthead__search-input"'],
    ['<button class="masthead__search-btn"', '<button tabindex="-1" class="masthead__search-btn"'],
  ];
  for (const [from, to] of cases) {
    const html = page();
    assert.ok(html.includes(from), from);
    const problems = await check({ 'pagina/index.html': html.replace(from, to) }, { ids: ['U-03'] });
    assert.equal(problems.length, 1, `${to} → ${JSON.stringify(problems.map(problem => problem.message))}`);
    assert.match(problems[0].message, /tabindex/);
  }
  // El propio <header> también: con tabindex positivo pasaría delante de todo lo demás.
  for (const value of ['1', ' 2']) {
    const problems = await check({ 'pagina/index.html': page().replace('<header class="site-header"', `<header tabindex="${value}" class="site-header"`) }, { ids: ['U-03'] });
    assert.equal(problems.length, 1, `<header tabindex="${value}"> → ${JSON.stringify(problems.map(problem => problem.message))}`);
    assert.match(problems[0].message, /<header\.site-header> lleva tabindex/);
  }
  // tabindex="0", o -1 en lo que no se enfoca con Tab (la copia oculta del texto de ayuda), no cambian el orden.
  const fine = page().replace('<a class="masthead__wa"', '<a tabindex="0" class="masthead__wa"').replace('<span class="masthead__search-hint"', '<span tabindex="-1" class="masthead__search-hint"');
  assert.deepEqual(await check({ 'pagina/index.html': fine }, { ids: ['U-03'] }), []);
});

// ---------------------------------------------------------------------------------------------------
// U-05: ubicación actual
// ---------------------------------------------------------------------------------------------------

// Cada ruta con sus marcas correctas.
const LOCATIONS = {
  'index.html': { logo: 'page' },
  'catalogo/index.html': { 'nav:/catalogo/': 'page' },
  'marcas/index.html': { 'nav:/marcas/': 'page' },
  'marcas/ansell/index.html': { 'nav:/marcas/': 'true' },
  'categorias/manos/index.html': { 'nav:categorias': 'true', 'cat:/categorias/manos/': 'page' },
  'productos/guante/index.html': { 'nav:/catalogo/': 'true' },
  'cotizar/index.html': { 'nav:/cotizar/': 'page', cta: 'page', 'dock:/cotizar/': 'page' },
  'contacto/index.html': { 'nav:/contacto/': 'page' },
  'solicitud-especial/index.html': {},
  'privacidad/index.html': {},
  '404.html': {},
};

test('U-05: las marcas esperadas salen de la ruta', () => {
  for (const [file, marks] of Object.entries(LOCATIONS)) assert.deepEqual(expectedLocation(routeOf(file)), marks, file);
  assert.deepEqual(expectedLocation('/catalogo/?q=guante'), { 'nav:/catalogo/': 'page' });
});

test('U-05: cada ruta con exactamente sus marcas pasa', async () => {
  const files = Object.fromEntries(Object.entries(LOCATIONS).map(([file, marks]) => [file, page({ marks })]));
  assert.deepEqual(await check(files, { ids: ['U-05'] }), []);
});

test('U-05: una marca que falta, sobra o lleva otro valor falla', async () => {
  const cases = [
    // Lo que hacía la cabecera antes de la corrección: la ficha no marcaba Catálogo y la barra fija no marcaba nada.
    ['productos/guante/index.html', {}],
    ['cotizar/index.html', { 'nav:/cotizar/': 'page', cta: 'page' }],
    ['marcas/ansell/index.html', { 'nav:/marcas/': 'page' }],
    ['categorias/manos/index.html', { 'nav:categorias': 'true' }],
    ['categorias/manos/index.html', { 'nav:categorias': 'true', 'cat:/categorias/manos/': 'page', 'cat:/categorias/cabeza/': 'page' }],
    ['catalogo/index.html', { 'nav:/catalogo/': 'page', 'cat:todo': 'page' }],
    ['solicitud-especial/index.html', { 'nav:/contacto/': 'page' }],
    ['404.html', { logo: 'page' }],
    ['index.html', { logo: 'page', 'nav:/catalogo/': 'true' }],
    ['contacto/index.html', { 'nav:/contacto/': 'page', 'dock:/cotizar/': 'page' }],
  ];
  for (const [file, marks] of cases) {
    const problems = await check({ [file]: page({ marks }) }, { ids: ['U-05'] });
    assert.equal(problems.length, 1, `${file} ${JSON.stringify(marks)} → ${JSON.stringify(problems.map(problem => problem.message))}`);
    assert.equal(problems[0].file, file);
  }
  // La entrada que debe marcarse no existe (sin Categorías en una página de categoría), o falta la barra fija.
  assert.equal((await check({ 'categorias/manos/index.html': page({ categories: false, marks: {} }) }, { ids: ['U-05'] })).length, 2);
  const withoutDock = page({ marks: { 'nav:/contacto/': 'page' } }).replace(/<nav class="dock"[\s\S]*?<\/nav>/, '');
  assert.equal((await check({ 'contacto/index.html': withoutDock }, { ids: ['U-05'] })).length, 1);
});

test('U-05: dentro de la navegación o de la barra fija, aria-current en un elemento que no es la entrada falla', async () => {
  const marcas = page({ marks: { 'nav:/marcas/': 'page' } });
  const cases = [
    // En /marcas/: la marca en el <li> de Contacto, en un <span> dentro de su enlace o en la lista.
    ['<li><a class="masthead__nav-link" href="/contacto/">', '<li aria-current="page"><a class="masthead__nav-link" href="/contacto/">'],
    ['href="/contacto/">Contacto</a>', 'href="/contacto/"><span aria-current="page">Contacto</span></a>'],
    ['<ul class="masthead__nav-list">', '<ul class="masthead__nav-list" aria-current="true">'],
    ['<div class="catpanel">', '<div class="catpanel" aria-current="page">'],
    // Y en la barra fija, dentro de un enlace.
    ['<span>WhatsApp</span></a></nav>', '<span aria-current="page">WhatsApp</span></a></nav>'],
  ];
  for (const [from, to] of cases) {
    assert.ok(marcas.includes(from), from);
    const problems = await check({ 'marcas/index.html': marcas.replace(from, to) }, { ids: ['U-05'] });
    assert.equal(problems.length, 1, `${to} → ${JSON.stringify(problems.map(problem => problem.message))}`);
    assert.match(problems[0].message, /no le corresponde/);
  }
});

// ---------------------------------------------------------------------------------------------------
// Contenido: celdas de relleno, dirección de correo, ruta de navegación y marcas de la página actual
// ---------------------------------------------------------------------------------------------------

const ADDRESS = 'ventas.puebla@sercomactive.com';
const EMAIL = '<span class="email"><span class="email__part">ventas.puebla@</span><wbr><span class="email__part">sercomactive.com</span></span>';
const crumbs = items => `<nav class="crumbs label" aria-label="Ruta de navegación"><ol class="crumbs__list">${items.join('')}</ol></nav>`;
const crumb = (label, href) => `<li class="crumbs__item"><a class="crumbs__link" href="${href}">${label}</a><span class="crumbs__sep" aria-hidden="true">/</span></li>`;
const crumbHere = label => `<li class="crumbs__item"><span aria-current="page">${label}</span></li>`;
const BRAND_MARK = '<span class="brand__mark" aria-hidden="true"></span>';
const brandCell = (href, name, extra = '', inside = '') => `<li class="span-3"><a class="brand cell-link" href="${href}"${extra}>${inside}<span>${name}</span><svg class="icon" width="20" height="20"></svg></a></li>`;
const brandCells = cells => `<ul class="brands grid12">${cells.join('')}<li class="span-3"><a class="brand brand--all cell-link" href="/marcas/"><span>Ver todas las marcas</span></a></li><li class="brands__fill span-3" aria-hidden="true"></li></ul>`;
const FOOTER_MARK = '<span class="footer__mark" aria-hidden="true"></span>';
const FOOTER_LINKS = [['/catalogo/', 'Catálogo'], ['/marcas/', 'Marcas'], ['/contacto/', 'Contacto'], ['/privacidad/', 'Privacidad']];
/** Pie con el enlace a `route` marcado como lo escribe SiteFooter; `change` altera ese pie para romper la regla. */
const footer = (route, change = html => html) => change('<footer class="site-footer"><a class="footer__logo" href="/"><img src="/logo.svg" width="194" height="73" alt="Sercom Active"></a><ul>'
  + FOOTER_LINKS.map(([href, label]) => `<li><a href="${href}"${href === route ? ` aria-current="page">${FOOTER_MARK}` : '>'}${label}</a></li>`).join('')
  + `</ul><a href="mailto:${ADDRESS}">${EMAIL}</a></footer>`);
/** Una página completa con pie. */
const withFooter = (route, body, change) => page({}, body).replace(EMPTY_FOOTER, footer(route, change));

test('U-04: una celda de relleno vacía, oculta y sin foco pasa; con contenido, visible para el lector o enfocable falla', async () => {
  const grid = fill => `<ul class="grid12"><li class="cell span-3">Uno</li>${fill}</ul>`;
  const good = ['<li class="grid-fill" aria-hidden="true" data-hide="lg md" style="--fill-lg:9"></li>', '<li class="brands__fill span-3" aria-hidden="true"></li>',
    '<div class="catalog-grid__fill" aria-hidden="true"></div>', '<li class="producto__more-fill" aria-hidden="true"></li>', '<li class="producto__chip-fill" aria-hidden="true"></li>'];
  assert.deepEqual(await check({ 'catalogo/index.html': page({}, grid(good.join(''))) }, { ids: ['U-04'] }), []);
  const bad = [
    ['<li class="grid-fill"></li>', /aria-hidden/],
    ['<li class="grid-fill" aria-hidden="false"></li>', /aria-hidden/],
    ['<li class="brands__fill" aria-hidden="true">Ver más</li>', /contenido/],
    ['<div class="catalog-grid__fill" aria-hidden="true"><span></span></div>', /contenido/],
    ['<li class="producto__more-fill" aria-hidden="true" tabindex="0"></li>', /foco/],
    ['<a class="producto__chip-fill" aria-hidden="true" href="/catalogo/"></a>', /foco/],
  ];
  for (const [fill, expected] of bad) {
    const problems = await check({ 'catalogo/index.html': page({}, grid(fill)) }, { ids: ['U-04'] });
    assert.equal(problems.length, 1, fill);
    assert.match(problems[0].message, expected, fill);
    assert.equal(problems[0].file, 'catalogo/index.html');
  }
});

test('U-11: la dirección en dos partes pasa; entera, partida en otro punto o distinta de la del enlace falla', async () => {
  const good = [
    `<a href="mailto:${ADDRESS}">${EMAIL}</a>`,
    `<a class="data__value" href="mailto:${ADDRESS}?subject=Cotizaci%C3%B3n&amp;body=Hola"><svg class="icon" width="20" height="20"></svg>${EMAIL}</a>`,
    // Una acción que no muestra la dirección no entra en la regla.
    `<a class="action" href="mailto:${ADDRESS}?subject=Hola"><span>Escribir por correo</span></a>`,
  ];
  assert.deepEqual(await check({ 'contacto/index.html': page({}, good.join('')) }, { ids: ['U-11'] }), []);
  // La barra de servicio de la cabecera imprime la dirección en un solo renglón: queda fuera de la regla.
  const inHeader = page().replace('<li class="utility__item">Puebla, México</li>', `<li class="utility__item"><a href="mailto:${ADDRESS}">${ADDRESS}</a></li>`);
  assert.match(inHeader, /<header[\s\S]*mailto:[\s\S]*<\/header>/);
  assert.deepEqual(await check({ 'contacto/index.html': inHeader }, { ids: ['U-11'] }), []);
  const bad = [
    `<a href="mailto:${ADDRESS}">${ADDRESS}</a>`,
    `<a href="mailto:${ADDRESS}"><span class="email">${ADDRESS}</span></a>`,
    '<a href="mailto:ventas.puebla@sercomactive.com"><span class="email"><span class="email__part">ventas.puebla@sercom</span><wbr><span class="email__part">active.com</span></span></a>',
    '<a href="mailto:ventas.puebla@sercomactive.com"><span class="email"><span class="email__part">ventas.puebla@</span><span class="email__part">sercomactive.com</span></span></a>',
    '<a href="mailto:ventas.puebla@sercomactive.com"><span class="email"><span class="email__part">ventas.</span><wbr><span class="email__part">puebla@</span><wbr><span class="email__part">sercomactive.com</span></span></a>',
    `<a href="mailto:otra@sercomactive.com">${EMAIL}</a>`,
  ];
  for (const link of bad) {
    const problems = await check({ 'contacto/index.html': page({}, link) }, { ids: ['U-11'] });
    assert.equal(problems.length, 1, link);
    assert.match(problems[0].message, /dos partes/, link);
  }
});

test('F-3: la ruta con diagonales ocultas al final de cada elemento pasa; escritas como texto, visibles para el lector o mal puestas falla', async () => {
  const good = {
    'catalogo/index.html': page({}, crumbs([crumb('Inicio', '/'), crumbHere('Catálogo')])),
    'productos/respirador/index.html': page({}, crumbs([crumb('Inicio', '/'), crumb('Catálogo', '/catalogo/'), crumb('Protección respiratoria', '/categorias/respiratoria/'), crumbHere('Respirador N95/KN95 de ejemplo')])),
    // Una página sin ruta (la portada) no tiene nada que revisar.
    'contacto/index.html': page(),
  };
  assert.deepEqual(await check(good, { ids: ['F-3'] }), []);
  const here = crumbHere('Catálogo');
  const bad = [
    [crumbs(['<li class="crumbs__item"><a class="crumbs__link" href="/">Inicio</a></li>', here]), /0 diagonales/],
    [crumbs(['<li class="crumbs__item"><a class="crumbs__link" href="/">Inicio</a> / </li>', here]), /como texto/],
    [crumbs(['<li class="crumbs__item"><a class="crumbs__link" href="/">Inicio</a></li> / ', here]), /como texto/],
    [crumbs(['<li class="crumbs__item"><a class="crumbs__link" href="/">Inicio</a><span class="crumbs__sep">/</span></li>', here]), /aria-hidden/],
    [crumbs(['<li class="crumbs__item"><span class="crumbs__sep" aria-hidden="true">/</span><a class="crumbs__link" href="/">Inicio</a></li>', here]), /al final/],
    [crumbs(['<li class="crumbs__item"><a class="crumbs__link" href="/">Inicio</a><span class="crumbs__sep" aria-hidden="true">›</span></li>', here]), /no es una diagonal/],
    [crumbs([crumb('Inicio', '/'), '<li class="crumbs__item"><span aria-current="page">Catálogo</span><span class="crumbs__sep" aria-hidden="true">/</span></li>']), /último y lleva una diagonal/],
    [crumbs([crumb('Inicio', '/'), '<li class="crumbs__item"><span>Catálogo</span></li>']), /no marca la página actual/],
    [crumbs([crumb('Inicio', '/').replace('<a class', '<a aria-current="page" class'), here]), /no es el último/],
    [crumbs([here]), /1 elementos/],
  ];
  for (const [trail, expected] of bad) {
    const problems = await check({ 'catalogo/index.html': page({}, trail) }, { ids: ['F-3'] });
    assert.ok(problems.length >= 1, trail);
    assert.ok(problems.some(problem => expected.test(problem.message)), `${trail}\n${problems.map(problem => problem.message).join('\n')}`);
  }
});

test('F-9a: en la página de una marca solo su celda lleva aria-current y el cuadro; en otra página, ninguna', async () => {
  const cells = (ansell = brandCell('/marcas/ansell/', 'Ansell', ' aria-current="page"', BRAND_MARK), other = brandCell('/marcas/3m/', '3M')) => brandCells([ansell, other]);
  const good = {
    'marcas/ansell/index.html': page({}, cells()),
    // El índice de marcas y la portada listan las marcas sin señalar ninguna.
    'marcas/index.html': page({}, brandCells([brandCell('/marcas/ansell/', 'Ansell'), brandCell('/marcas/3m/', '3M')])),
    // Una página de marca con productos no lleva las celdas: no hay nada que revisar.
    'marcas/3m/index.html': page(),
  };
  assert.deepEqual(await check(good, { ids: ['F-9a'] }), []);
  const bad = [
    [cells(brandCell('/marcas/ansell/', 'Ansell', '', BRAND_MARK)), /no lleva aria-current="page"/],
    [cells(brandCell('/marcas/ansell/', 'Ansell', ' aria-current="true"', BRAND_MARK)), /no lleva aria-current="page"/],
    [cells(brandCell('/marcas/ansell/', 'Ansell', ' aria-current="page"')), /no empieza con el cuadro/],
    [cells(brandCell('/marcas/ansell/', 'Ansell', ' aria-current="page"', '<span class="brand__mark"></span>')), /aria-hidden/],
    [cells(undefined, brandCell('/marcas/3m/', '3M', ' aria-current="page"')), /«3M» lleva aria-current/],
    [cells(undefined, brandCell('/marcas/3m/', '3M', '', BRAND_MARK)), /«3M» lleva el cuadro/],
    [brandCells([brandCell('/marcas/3m/', '3M')]), /0 celdas de marca llevan a esta página/],
    [`${cells()}<p>${BRAND_MARK}</p>`, /fuera de una celda/],
  ];
  for (const [body, expected] of bad) {
    const problems = await check({ 'marcas/ansell/index.html': page({}, body) }, { ids: ['F-9a'] });
    assert.ok(problems.some(problem => expected.test(problem.message)), `${body}\n${problems.map(problem => problem.message).join('\n')}`);
  }
  // Fuera de la página de la marca, la celda marcada falla.
  const elsewhere = await check({ 'marcas/index.html': page({}, cells()) }, { ids: ['F-9a'] });
  assert.equal(elsewhere.length, 2);
  assert.deepEqual(elsewhere.map(problem => problem.file), ['marcas/index.html', 'marcas/index.html']);
});

test('F-9b: en el pie solo el enlace a la página actual lleva aria-current y el cuadro', async () => {
  const good = {
    'index.html': withFooter('/', '<h1>Portada</h1>'),
    'contacto/index.html': withFooter('/contacto/', '<h1>Contacto</h1>'),
    'privacidad/index.html': withFooter('/privacidad/', '<h1>Privacidad</h1>'),
    '404.html': withFooter('/404.html', '<h1>No encontramos esta página</h1>'),
  };
  assert.deepEqual(await check(good, { ids: ['F-9b'] }), []);
  const base = { 'index.html': withFooter('/', '<h1>Portada</h1>') };
  const bad = [
    [html => html.replace(' aria-current="page"', ''), /no lleva aria-current="page"/],
    [html => html.replace(FOOTER_MARK, ''), /no empieza con el cuadro/],
    [html => html.replace(FOOTER_MARK, '<span class="footer__mark"></span>'), /aria-hidden/],
    [html => html.replace('<a href="/marcas/">', '<a href="/marcas/" aria-current="page">'), /«Marcas» lleva aria-current/],
    [html => html.replace('<a href="/marcas/">', `<a href="/marcas/">${FOOTER_MARK}`), /«Marcas» lleva el cuadro/],
    [html => html.replace('</ul>', `</ul><p>${FOOTER_MARK}</p>`), /fuera de un enlace/],
  ];
  for (const [change, expected] of bad) {
    const problems = await check({ ...base, 'contacto/index.html': withFooter('/contacto/', '<h1>Contacto</h1>', change) }, { ids: ['F-9b'] });
    assert.ok(problems.length >= 1 && problems.every(problem => problem.file === 'contacto/index.html'), String(change));
    assert.ok(problems.some(problem => expected.test(problem.message)), `${change}\n${problems.map(problem => problem.message).join('\n')}`);
  }
  // Una página sin el pie del sitio falla: todas lo llevan.
  const without = await check({ ...base, 'contacto/index.html': page().replace(EMPTY_FOOTER, '') }, { ids: ['F-9b'] });
  assert.deepEqual(without.map(problem => problem.message), ['la página no tiene el pie del sitio (<footer class="site-footer">)']);
});

// ---------------------------------------------------------------------------------------------------
// V-03: título largo de la ficha y su fila de ruta
// ---------------------------------------------------------------------------------------------------

const NAME_90 = 'Guante de ejemplo de nitrilo con recubrimiento de palma y puño tejido para piezas grasosas';
const NAME_50 = 'Guante de ejemplo de nitrilo con recubrimiento de p';
/** Ficha como la escribe productos/[id].astro: fila de ruta y, en la sección .producto, el H1 del nombre. */
const ficha = (name, { title = '', crumbs = '' } = {}) => `<div class="producto__crumbs cell"${crumbs}><nav class="crumbs label" aria-label="Ruta de navegación"><ol class="crumbs__list">`
  + `<li class="crumbs__item"><a class="crumbs__link" href="/">Inicio</a><span class="crumbs__sep" aria-hidden="true">/</span></li><li class="crumbs__item"><span aria-current="page">${name}</span></li></ol></nav></div>`
  + `<section class="producto grid12" aria-labelledby="titulo"><div class="producto__head cell"><h1 class="producto__title t-title" id="titulo"${title}>${name}</h1></div></section>`;

test('V-03: el título y la ruta llevan data-long juntos, solo con un nombre de más de 50 caracteres', async () => {
  assert.equal([...NAME_90].length, 90);
  assert.equal([...NAME_50.slice(0, 50)].length, 50);
  const good = [
    ficha(NAME_90, { title: ' data-long', crumbs: ' data-long' }),
    ficha(NAME_90, { title: ' data-long=""', crumbs: ' data-long=""' }),
    ficha(NAME_50.slice(0, 50)),
    ficha('Guante recubierto de ejemplo'),
  ];
  for (const body of good) assert.deepEqual(await check({ 'productos/x/index.html': page({}, body) }, { ids: ['V-03'] }), [], body);
  // Un producto retirado no baja su título; una página sin ficha no tiene nada que revisar.
  const retired = `<div class="producto__crumbs cell"></div><section class="retirado"><h1 class="producto__title t-title">${NAME_90} (producto retirado)</h1></section>`;
  assert.deepEqual(await check({ 'productos/r/index.html': page({}, retired), 'contacto/index.html': page() }, { ids: ['V-03'] }), []);
});

test('V-03: un nombre largo sin data-long, uno corto con data-long o la ruta sin la marca del título fallan', async () => {
  const bad = [
    [ficha(NAME_90), /pasa de 50 caracteres y no lleva data-long/],
    [ficha(NAME_90, { crumbs: ' data-long' }), /pasa de 50 caracteres y no lleva data-long/],
    [ficha(NAME_50.slice(0, 50), { title: ' data-long', crumbs: ' data-long' }), /no pasa de 50 caracteres y lleva data-long/],
    // Lo que escribía la ficha antes de la ronda 2: el título marcado y la ruta sin marcar (se partía en dos renglones).
    [ficha(NAME_90, { title: ' data-long' }), /la fila de ruta no lleva data-long/],
    [ficha('Guante recubierto de ejemplo', { crumbs: ' data-long' }), /la fila de ruta lleva data-long/],
  ];
  for (const [body, message] of bad) {
    const problems = await check({ 'productos/x/index.html': page({}, body) }, { ids: ['V-03'] });
    assert.ok(problems.some(problem => message.test(problem.message)), `${body}\n${JSON.stringify(problems)}`);
    assert.equal(problems[0].file, 'productos/x/index.html');
  }
});

// ---------------------------------------------------------------------------------------------------
// V-06: separador de la línea marca · código de las tarjetas
// ---------------------------------------------------------------------------------------------------

test('el lector conserva el espacio de no separación y el texto que solo es espacio, en su lugar del contenido', () => {
  const { root } = parseHtml('<p>Marca&nbsp;<b>·</b> <i>C-1</i>&#160;<u>x</u> <s>y</s></p>');
  const [p] = root.children;
  assert.deepEqual(p.content.map(part => (typeof part === 'string' ? part : `<${part.name}>`)), ['Marca ', '<b>', ' ', '<i>', ' ', '<u>', ' ', '<s>']);
  // El texto directo y la lectura de textOf no cambian: el espacio suelto no cuenta como texto.
  assert.deepEqual(p.text, ['Marca ']);
  assert.equal(textOf(p), 'Marca · C-1 x y');
});

/** Tarjeta de producto como la escribe ProductCard; `meta` es el contenido de su línea marca · código. */
const META_GOOD = 'Marca de ejemplo<span class="sep" aria-hidden="true">&nbsp;·</span> <span class="t-code">EJ-1001</span>';
const card = (meta = META_GOOD, { name = 'Guante de ejemplo', sheet, quote } = {}) => '<article class="product span-3"><div class="product__body">'
  + `<h3 class="product__name t-h3">${name}</h3><p class="product__meta t-small">${meta}</p></div><div class="product__actions">`
  + `<a class="product__action product__action--sheet" href="/productos/guante/"${sheet === undefined ? ` aria-label="Ver ficha: ${name}"` : sheet}><span>Ver ficha<span class="vh">: ${name}</span></span><svg class="icon icon--18" width="18" height="18" aria-hidden="true"></svg></a>`
  + `<a class="product__action product__action--quote" href="https://wa.me/5212214002219"${quote === undefined ? ` aria-label="Cotizar: ${name}"` : quote}><span>Cotizar<span class="vh">: ${name}</span></span><svg class="icon icon--18" width="18" height="18" aria-hidden="true"></svg></a></div></article>`;

test('V-06: el separador unido a la marca con un espacio de no separación pasa, dentro o fuera de su elemento', async () => {
  const good = [
    META_GOOD,
    'Marca de ejemplo&nbsp;<span class="sep" aria-hidden="true">·</span> <span class="t-code">EJ-1001</span>',
    'Marca de ejemplo&#160;<span class="sep" aria-hidden="true">·</span> <span class="t-code">EJ-1001</span>',
    'Marca de ejemplo <span class="sep" aria-hidden="true">·</span>\n<span class="t-code">EJ-1001</span>',
  ];
  assert.deepEqual(await check({ 'catalogo/index.html': page({}, good.map(meta => card(meta)).join('')) }, { ids: ['V-06'] }), []);
  // Una página sin tarjetas no tiene nada que revisar.
  assert.deepEqual(await check({ 'contacto/index.html': page() }, { ids: ['V-06'] }), []);
});

test('V-06: un separador precedido por un espacio normal, por ninguno o por un salto de renglón falla', async () => {
  const bad = [
    // Lo que escribía ProductCard: el renglón podía empezar con «·».
    'Marca de ejemplo <span class="sep" aria-hidden="true">·</span> <span class="t-code">EJ-1001</span>',
    'Marca de ejemplo<span class="sep" aria-hidden="true">·</span> <span class="t-code">EJ-1001</span>',
    'Marca de ejemplo\n<span class="sep" aria-hidden="true">&nbsp;·</span> <span class="t-code">EJ-1001</span>',
    'Marca de ejemplo <span class="sep" aria-hidden="true">&nbsp;·</span> <span class="t-code">EJ-1001</span>',
    '<b>Marca de ejemplo</b> <span class="sep" aria-hidden="true">&nbsp;·</span> <span class="t-code">EJ-1001</span>',
    'Marca de ejemplo&nbsp;<span class="sep" aria-hidden="true"> ·</span> <span class="t-code">EJ-1001</span>',
  ];
  for (const meta of bad) {
    const problems = await check({ 'catalogo/index.html': page({}, card(meta)) }, { ids: ['V-06'] });
    assert.equal(problems.length, 1, meta);
    assert.match(problems[0].message, /espacio de no separación/, meta);
    assert.equal(problems[0].file, 'catalogo/index.html');
  }
});

// ---------------------------------------------------------------------------------------------------
// A-02: nombres accesibles sin espacios sueltos
// ---------------------------------------------------------------------------------------------------

/** Fila de la barra lateral del catálogo como la escribe CatalogNavList; `label` es su atributo aria-label completo. */
const navRow = (name, count, label = ` aria-label="${name}, ${count} ${count === 1 ? 'producto' : 'productos'}"`) => `<li><a class="catalog-nav__link" href="/categorias/manos/"${label}>`
  + `<span class="catalog-nav__name">${name}</span>${count ? `<span class="catalog-nav__count"><span aria-hidden="true">${count}</span><span class="vh">, ${count} ${count === 1 ? 'producto' : 'productos'}</span></span>` : ''}</a></li>`;

test('A-02a: un nombre que empieza con el texto visible pasa, sin importar mayúsculas, espacios ni lo oculto', async () => {
  const good = [
    card(),
    `<ul class="catalog-nav__list">${navRow('Protección de manos', 1)}</ul>`,
    '<a href="/catalogo/" aria-label="ver   FICHA: Guante"><span>Ver ficha</span></a>',
    // Sin texto visible (solo un icono) el nombre puede ser cualquiera.
    '<a href="https://wa.me/5212214002219" aria-label="WhatsApp"><svg class="icon" width="20" height="20" aria-hidden="true"></svg></a>',
    '<button type="button" aria-label="Cerrar el menú">Cerrar</button>',
    `<a href="mailto:${ADDRESS}" aria-label="${ADDRESS}">${EMAIL}</a>`,
  ];
  assert.deepEqual(await check({ 'catalogo/index.html': page({}, good.join('')) }, { ids: ['A-02a'] }), []);
});

test('A-02a: un nombre que no empieza con el texto visible falla', async () => {
  const bad = [
    card(META_GOOD, { sheet: ' aria-label="Ficha: Guante de ejemplo"' }),
    '<a href="/catalogo/" aria-label="Guante: Ver ficha"><span>Ver ficha</span><span class="vh">: Guante</span></a>',
    '<button type="button" aria-label="Abrir">Menú</button>',
    `<a href="mailto:${ADDRESS}" aria-label="Correo">${EMAIL}</a>`,
  ];
  for (const html of bad) {
    const problems = await check({ 'catalogo/index.html': page({}, html) }, { ids: ['A-02a'] });
    assert.equal(problems.length, 1, html);
    assert.match(problems[0].message, /empieza con las palabras que se ven/, html);
  }
});

test('A-02b: un enlace de correo que muestra la dirección y se llama con ella pasa; la acción «Escribir por correo» y la cabecera no entran', async () => {
  const good = [
    `<a href="mailto:${ADDRESS}" aria-label="${ADDRESS}"><svg class="icon icon--16" width="16" height="16" aria-hidden="true"></svg>${EMAIL}</a>`,
    `<a class="data__link" href="mailto:${ADDRESS}?subject=Cotizaci%C3%B3n&amp;body=Hola" aria-label="${ADDRESS}">${EMAIL}<svg class="icon" width="20" height="20" aria-hidden="true"></svg></a>`,
    `<a class="action" href="mailto:${ADDRESS}?subject=Hola"><span>Escribir por correo</span></a>`,
  ];
  assert.deepEqual(await check({ 'contacto/index.html': page({}, good.join('')) }, { ids: ['A-02b'] }), []);
  const inHeader = page().replace('<li class="utility__item">Puebla, México</li>', `<li class="utility__item"><a href="mailto:${ADDRESS}">${ADDRESS}</a></li>`);
  assert.deepEqual(await check({ 'contacto/index.html': inHeader }, { ids: ['A-02b'] }), []);
});

test('A-02b: un enlace de correo que muestra la dirección sin aria-label, o con otro, falla', async () => {
  const bad = [
    [`<a href="mailto:${ADDRESS}">${EMAIL}</a>`, /no tiene aria-label/],
    [`<a href="mailto:${ADDRESS}?subject=Hola">${EMAIL}</a>`, /no tiene aria-label/],
    [`<a href="mailto:${ADDRESS}" aria-label="ventas.puebla@ sercomactive.com">${EMAIL}</a>`, /se llama «ventas\.puebla@ sercomactive\.com»/],
    [`<a href="mailto:${ADDRESS}" aria-label="Escribir a ${ADDRESS}">${EMAIL}</a>`, /se llama/],
  ];
  for (const [html, expected] of bad) {
    const problems = await check({ 'contacto/index.html': page({}, html) }, { ids: ['A-02b'] });
    assert.equal(problems.length, 1, html);
    assert.match(problems[0].message, expected, html);
  }
});

test('A-02c: las acciones de la tarjeta y las filas con productos con su nombre completo pasan; una fila sin productos no lo necesita', async () => {
  const good = card() + card(META_GOOD, { name: 'Lente de seguridad' })
    + `<ul class="catalog-nav__list">${navRow('Protección de manos', 1)}${navRow('Protección de cabeza', 12)}${navRow('Soldadura', 0, '')}</ul>`;
  assert.deepEqual(await check({ 'catalogo/index.html': page({}, good) }, { ids: ['A-02c'] }), []);
});

test('A-02c: una acción o una fila sin nombre, o con otro, falla', async () => {
  const bad = [
    [card(META_GOOD, { sheet: '' }), /no tiene aria-label: debe llamarse «Ver ficha: Guante de ejemplo»/],
    [card(META_GOOD, { quote: ' aria-label="Cotizar"' }), /se llama «Cotizar»: debe llamarse «Cotizar: Guante de ejemplo»/],
    [card(META_GOOD, { sheet: ' aria-label="Ver ficha: Otro guante"' }), /debe llamarse «Ver ficha: Guante de ejemplo»/],
    [`<ul>${navRow('Protección de manos', 1, '')}</ul>`, /no tiene aria-label: debe llamarse «Protección de manos, 1 producto»/],
    [`<ul>${navRow('Protección de manos', 3, ' aria-label="Protección de manos, 3 producto"')}</ul>`, /debe llamarse «Protección de manos, 3 productos»/],
    [`<ul>${navRow('Protección de manos', 1, ' aria-label="Protección de manos , 1 producto"')}</ul>`, /se llama «Protección de manos , 1 producto»/],
  ];
  for (const [html, expected] of bad) {
    const problems = await check({ 'catalogo/index.html': page({}, html) }, { ids: ['A-02c'] });
    assert.equal(problems.length, 1, html);
    assert.match(problems[0].message, expected, html);
  }
});

// ---------------------------------------------------------------------------------------------------
// A-06: tamaño de los iconos sin la hoja de estilo
// ---------------------------------------------------------------------------------------------------

test('A-06: los iconos con width y height numéricos pasan; un SVG que no es icono no entra', async () => {
  const good = [
    '<svg class="icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"></svg>',
    '<svg class="icon icon--18" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"></svg>',
    '<svg class="icon icon--28 icon--art" viewBox="0 0 24 24" width="28" height="28" role="img" aria-label="Guantes"></svg>',
    '<svg class="icon" width="17.5" height="17.5"></svg>',
    // El dibujo de una placa o un logotipo no es un icono del kit.
    '<svg viewBox="0 0 10 10"></svg>',
  ];
  assert.deepEqual(await check({ 'catalogo/index.html': page({}, good.join('')) }, { ids: ['A-06'] }), []);
});

test('A-06: un icono sin width o sin height, o con un valor que no es un número de píxeles, falla', async () => {
  const bad = [
    ['<svg class="icon" viewBox="0 0 24 24"></svg>', /width numérico ni height numérico/],
    ['<svg class="icon icon--16" width="16"></svg>', /no lleva height numérico/],
    ['<svg class="icon" height="20"></svg>', /no lleva width numérico/],
    ['<svg class="icon" width="100%" height="20"></svg>', /no lleva width numérico/],
    ['<svg class="icon" width="1em" height="1em"></svg>', /width numérico ni height numérico/],
    ['<svg class="icon" width="0" height="20"></svg>', /no lleva width numérico/],
  ];
  for (const [html, expected] of bad) {
    const problems = await check({ 'catalogo/index.html': page({}, `<p>${html}</p>`) }, { ids: ['A-06'] });
    assert.equal(problems.length, 1, html);
    assert.match(problems[0].message, expected, html);
    assert.match(problems[0].message, /dentro de <p>/, html);
  }
});

// ---------------------------------------------------------------------------------------------------
// Línea de comandos
// ---------------------------------------------------------------------------------------------------

test('la línea de comandos termina con 1 si hay problemas, 0 si no y 2 si la carpeta no tiene páginas', async () => {
  const good = await makeTree({ 'index.html': page({ marks: { logo: 'page' } }), '_astro/sitio.css': STYLE });
  const bad = await makeTree({ 'index.html': page({ marks: { logo: 'page' } }), '_astro/sitio.css': '.nav{display:flex}' });
  const empty = await makeTree({ 'robots.txt': 'User-agent: *\n' });
  try {
    const run = (...args) => spawnSync(process.execPath, ['scripts/check-markup.mjs', ...args], { cwd: ROOT, encoding: 'utf8' });
    const ok = run(good, '--preview');
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(ok.stdout, /0 problemas/);
    const fail = run(bad, '--preview');
    assert.equal(fail.status, 1);
    assert.match(fail.stdout, /FAIL {2}U-07 {2}_astro\/sitio\.css/);
    assert.equal(run(empty).status, 2);
    assert.equal(run(good, '--otra').status, 2);
  } finally {
    await Promise.all([good, bad, empty].map(removeTree));
  }
});
