import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { CHECKS, checkMarkup, cssRules, NOTICE_MARKUP } from '../scripts/check-markup.mjs';
import { makeTree, removeTree, ROOT } from './helpers.mjs';

// La comprobación del aviso de arriba de scripts/check-markup.mjs: nada en el marcado ni en las hojas de estilo lo
// oculta fuera de la impresión. Que el aviso deba estar lo decide scripts/scan-dist.mjs; aquí no se exige.
const NOTICE_CHECKS = CHECKS.filter(check => check.id === 'I-04');

// El aviso como lo escribe SiteNotice.astro, al principio de <body> como en BaseLayout.astro.
const NOTICE = '<aside class="site-notice" aria-label="Aviso de sitio en preparación"><p class="site-notice__text"><strong>Sitio en preparación</strong> · Versión inicial para revisión</p></aside>';
const page = (notice = NOTICE, head = '') => `<!doctype html><html lang="es-MX"><head><meta charset="utf-8"><title>Prueba</title>${head}</head><body>${notice}<div class="sheet"><main id="contenido"><h1>Página</h1></main></div></body></html>`;
// Las reglas del aviso de hoy (components.css y responsive.css), con la de impresión que lo oculta.
const STYLE = '.site-notice{background:var(--ink);color:var(--white)}.site-notice__text{margin:0 auto}@media (max-width:699px){.site-notice__text{font-size:.78rem}}'
  + '@media print{.site-notice,.dock,.masthead__btn,.skip-link{display:none!important}.site-header{position:static}}'
  + '@media (forced-colors:active){:where(.skip-link,.site-notice){outline:1px solid CanvasText}}';

/** Revisa un sitio temporal (una página con el aviso y la hoja de hoy, más `files`) solo con la comprobación del aviso. */
async function check(files = {}) {
  const directory = await makeTree({ 'index.html': page(), '_astro/sitio.css': STYLE, ...files });
  try {
    return (await checkMarkup(directory, { checks: NOTICE_CHECKS })).problems;
  } finally {
    await removeTree(directory);
  }
}

test('la comprobación del aviso está en CHECKS', () => {
  assert.equal(NOTICE_CHECKS.length, 1);
  assert.ok(NOTICE_CHECKS[0].title.length > 40);
  assert.equal(typeof NOTICE_CHECKS[0].page, 'function');
  assert.equal(typeof NOTICE_CHECKS[0].sheet, 'function');
});

test('el aviso que conoce la comprobación es el que escribe SiteNotice.astro', async () => {
  const source = await readFile(join(ROOT, 'src/components/SiteNotice.astro'), 'utf8');
  assert.ok(source.includes(`<${NOTICE_MARKUP.tag} class="${NOTICE_MARKUP.classes[0]}"`), 'SiteNotice.astro ya no escribe el aviso como <aside class="site-notice">');
  assert.ok(source.includes(`<${NOTICE_MARKUP.textTag} class="${NOTICE_MARKUP.classes[1]}"><${NOTICE_MARKUP.leadTag}>`), 'SiteNotice.astro ya no escribe el texto como <p class="site-notice__text"><strong>');
});

test('el aviso visible con las reglas de hoy pasa, y una página sin aviso también (que deba estar lo decide scan-dist)', async () => {
  assert.deepEqual(await check(), []);
  assert.deepEqual(await check({ 'index.html': page('') }), []);
  // Atributos y estilos que no ocultan nada.
  for (const notice of [
    NOTICE.replace('<aside', '<aside aria-hidden="false" style="display:block; visibility: visible; content-visibility: auto"'),
    NOTICE.replace('<p class', '<p style="--display: none; color: red" class'),
    `<div class="banda">${NOTICE}</div>`,
  ]) assert.deepEqual(await check({ 'index.html': page(notice) }), [], notice);
});

test('un atributo que oculta el aviso, su texto o un elemento que lo contiene falla', async () => {
  const cases = [
    NOTICE.replace('<aside', '<aside hidden'),
    NOTICE.replace('<aside', '<aside hidden="until-found"'),
    NOTICE.replace('<aside', '<aside aria-hidden="true"'),
    NOTICE.replace('<aside', '<aside aria-hidden=" TRUE "'),
    NOTICE.replace('<aside', '<aside style="display:none"'),
    NOTICE.replace('<aside', '<aside style="color: red; DISPLAY: None !important"'),
    NOTICE.replace('<aside', '<aside style="display:/**/none/**/"'),
    NOTICE.replace('<aside', '<aside style="visibility: hidden"'),
    NOTICE.replace('<aside', '<aside style="visibility:collapse"'),
    NOTICE.replace('<aside', '<aside style="content-visibility: hidden"'),
    NOTICE.replace('<aside', '<aside popover'),
    NOTICE.replace('<p class', '<p hidden class'),
    NOTICE.replace('<p class', '<p style="visibility:hidden" class'),
    NOTICE.replace('<p class', '<p aria-hidden="true" class'),
    `<div hidden>${NOTICE}</div>`,
    `<div style="display:none">${NOTICE}</div>`,
    `<div aria-hidden="true">${NOTICE}</div>`,
  ];
  for (const notice of cases) {
    const problems = await check({ 'index.html': page(notice) });
    assert.equal(problems.length, 1, `${notice}\n${JSON.stringify(problems)}`);
    assert.equal(problems[0].file, 'index.html');
    assert.equal(problems[0].id, 'I-04');
  }
});

test('el lector de reglas da los selectores, las declaraciones sin comentarios y las reglas @ que las contienen', () => {
  const rules = cssRules('/* .site-notice{display:none} */.a,.b{color:red;display:/* x */none}@media print{.c{display:none}@media (min-width:1px){.d{x:1}}}@keyframes k{from{display:none}}@font-face{font-family:x}.e::before{content:"}{;"}');
  assert.deepEqual(rules.map(rule => [rule.selectors, rule.declarations.replace(/\s+/g, ''), rule.conditions]), [
    [['.a', '.b'], 'color:red;display:none', []],
    [['.c'], 'display:none', ['@media print']],
    [['.d'], 'x:1', ['@media print', '@media (min-width:1px)']],
    [['.e::before'], 'content:"}{;"', []],
  ]);
});

test('la regla de impresión que oculta el aviso se permite; la misma regla fuera de la impresión falla', async () => {
  const allowed = [
    '@media print{.site-notice{display:none!important}}',
    '@media PRINT and (min-width:0){.site-notice__text{visibility:hidden}}',
    '@media only print{.site-notice{display:none}}',
    '@media print{@media (min-width:1px){.site-notice{display:none}}}',
    '@media print{@supports (display:grid){.site-notice{display:none}}}',
  ];
  for (const css of allowed) assert.deepEqual(await check({ '_astro/otra.css': css }), [], css);
  const reported = [
    '.site-notice{display:none!important}',
    '@media screen{.site-notice{display:none}}',
    '@media print, screen{.site-notice{display:none}}',
    '@media not print{.site-notice{display:none}}',
    '@media all{.site-notice{display:none}}',
    '@supports (display:grid){.site-notice{display:none}}',
    '@media (min-width:1100px){@media print{.x{y:0}}.site-notice{display:none}}',
  ];
  for (const css of reported) {
    const problems = await check({ '_astro/otra.css': css });
    assert.equal(problems.length, 1, `${css}\n${JSON.stringify(problems)}`);
    assert.equal(problems[0].file, '_astro/otra.css');
  }
});

test('una regla que puede seleccionar el aviso o su texto y lo oculta falla, en una hoja o en un <style> de la página', async () => {
  const cases = [
    '.site-notice{display:none}', '.site-notice__text{visibility:hidden}', '.site-notice{visibility:collapse}', '.site-notice{content-visibility:hidden}',
    '.site-notice{display:/* nada */none}', '.site-notice{DISPLAY:NONE}', '.site-notice{color:red;display:none;}', '.site-notice{d\\isplay:n\\6f ne}',
    'body>.site-notice{display:none}', '.site-notice strong{visibility:hidden}', '.sheet,.site-notice{display:none}', ':is(.site-notice){display:none}',
    // Selectores de atributo y escapes, como en U-07.
    '[class~=site-notice]{display:none}', '[class="site-notice"]{display:none}', '[class*="notice "]{display:none}', '[class^="site-notice__t"]{display:none}',
    '[*|class~="site-notice"]{display:none}', '[class*="SITE-NOTICE" i]{display:none}', '.site-\\6e otice{display:none}', '.site\\-notice__text{display:none}',
    // Sin nombrar sus clases: el tipo del aviso, de su texto o de lo que lo contiene, o cualquier elemento.
    'aside{display:none}', 'p{visibility:hidden}', 'strong{display:none}', 'body{display:none}', '*{visibility:hidden}', ':root{display:none}', 'html:not(.js) aside{display:none}',
  ];
  for (const css of cases) {
    const problems = await check({ '_astro/otra.css': css });
    assert.equal(problems.length, 1, `${css}\n${JSON.stringify(problems)}`);
    assert.match(problems[0].message, /oculta el aviso/);
  }
  const inline = await check({ 'pagina/index.html': page(NOTICE, '<style>.site-notice{display:none}</style>') });
  assert.deepEqual(inline.map(problem => problem.file), ['pagina/index.html <style> 1']);
});

test('una regla que no oculta, que no puede seleccionar el aviso o que solo oculta un pseudoelemento pasa', async () => {
  const css = '.site-notice{display:block}.site-notice{background:none}.site-notice{--display:none}.site-notice::before{display:none}.site-notice__text:after{visibility:hidden}'
    + '.site-notice-x{display:none}.site-notices{display:none}[class*="site-notices"]{display:none}[class*="x-site-notice"]{display:none}[data-x~=site-notice]{display:none}'
    + '.dock{display:none}.sheet p{display:none}main aside{visibility:hidden}div{display:none}summary::-webkit-details-marker{display:none}.site-notice{content:"display:none"}'
    + '.masthead__btn[hidden]{display:none}.catalog-grid__item[hidden]{display:none}';
  assert.deepEqual(await check({ '_astro/otra.css': css }), []);
});

test('la línea de comandos falla con un <style> que oculta el aviso y lo nombra en la lista de comprobaciones', async () => {
  const bad = await makeTree({ 'index.html': page(NOTICE, '<style>.site-notice{display:none}</style>') });
  try {
    const run = spawnSync(process.execPath, ['scripts/check-markup.mjs', bad], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(run.status, 1);
    assert.match(run.stdout, /FAIL {2}I-04 {2}index\.html <style> 1/);
    assert.match(run.stdout, /comprobaciones \([^)]*I-04/);
  } finally {
    await removeTree(bad);
  }
});
