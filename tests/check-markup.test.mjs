import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { checkMarkup, cssSelectors, expectedLocation, parseHtml, routeOf, selectorAttributes, selectorClasses } from '../scripts/check-markup.mjs';
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
    ? `<li><details class="${c.cat}"><summary class="${c.link}"${current('nav:categorias')}>Categorías<svg class="icon"><path d="M0 0"/></svg></summary><div class="catpanel"><ul class="catpanel__list grid12">`
      + `<li class="span-2"><a class="catpanel__link cell-link" href="/categorias/manos/"${current('cat:/categorias/manos/')}><span>Protección de manos</span></a></li>`
      + `<li class="span-2"><a class="catpanel__link cell-link" href="/categorias/cabeza/"${current('cat:/categorias/cabeza/')}><span>Protección de cabeza</span></a></li>`
      + `<li class="catpanel__all"><a class="catpanel__link catpanel__link--all cell-link" href="/catalogo/"${current('cat:todo')}><span>Ver todo el catálogo</span></a></li></ul></div></details></li>`
    : '';
  const nav = `<nav class="${c.nav} span-4" id="menu" aria-label="Principal"><ul class="${c.list}">${link('/catalogo/', 'Catálogo')}${cats}${link('/marcas/', 'Marcas')}`
    + `<li class="${c.quote}">${link('/cotizar/', 'Cotizar mi lista').slice(4, -5)}</li>${link('/contacto/', 'Contacto')}</ul></nav>`;
  const form = search
    ? `<form class="${c.search} span-3" id="buscador" role="search" aria-label="Buscar en el catálogo" action="/catalogo/" method="get"><label class="vh" for="q">Buscar</label>`
      + `<span class="masthead__search-field"><input class="${c.input}" id="q" name="q" type="search" placeholder="Buscar por producto, marca o código" /><span class="masthead__search-hint" aria-hidden="true"><span>Buscar por producto, marca o código</span></span></span><button class="${c.button}" type="submit" aria-label="Buscar"><svg class="icon"></svg></button></form>`
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
const page = (options = {}, body = '<h1>Página</h1>') => `<!doctype html><html lang="es-MX"><head><meta charset="utf-8"><title>Prueba</title></head><body><a class="skip-link" href="#contenido">Saltar al contenido</a>`
  + `<div class="sheet">${header(options)}<main id="contenido" tabindex="-1">${body}</main></div>${dock(options.marks)}</body></html>`;
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
