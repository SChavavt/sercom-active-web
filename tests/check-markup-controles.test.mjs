import test from 'node:test';
import assert from 'node:assert/strict';
import { CHECKS, checkMarkup, datasetName, importsOf, namesHook, parseHtml } from '../scripts/check-markup.mjs';
import { CHECKS as SCANNER_CHECKS } from '../scripts/scan-dist.mjs';
import { makeTree, removeTree } from './helpers.mjs';

// Las comprobaciones de los controles de scripts/check-markup.mjs: cada control tiene una función nativa o un script
// de su página que nombra su gancho (R-RULE-30a), y ningún <script> va dentro de un <template> (R-RULE-30b).
const CONTROL_CHECKS = CHECKS.filter(check => check.id === 'R-RULE-30a' || check.id === 'R-RULE-30b');

const page = (body, head = '') => `<!doctype html><html lang="es-MX"><head><meta charset="utf-8"><title>Prueba</title>${head}</head><body><main id="contenido">${body}</main></body></html>`;
const module = code => `<script type="module">${code}</script>`;

/** Revisa un sitio temporal con las dos comprobaciones y devuelve sus problemas. */
async function check(files) {
  const directory = await makeTree(files);
  try {
    return (await checkMarkup(directory, { checks: CONTROL_CHECKS })).problems;
  } finally {
    await removeTree(directory);
  }
}
const only = (problems, id) => problems.filter(problem => problem.id === id);

test('las dos comprobaciones de los controles están en CHECKS, con su título y sus límites', () => {
  assert.deepEqual(CONTROL_CHECKS.map(entry => entry.id), ['R-RULE-30a', 'R-RULE-30b']);
  for (const entry of CONTROL_CHECKS) assert.equal(typeof entry.page, 'function');
  const [controls, templates] = CONTROL_CHECKS;
  // El título dice lo que no prueba: que el script haga algo útil, ni que el control se muestre solo cuando funciona.
  assert.match(controls.title, /no que haga algo útil con él ni que el control se muestre solo cuando funciona/);
  assert.match(controls.title, /se revisa en el navegador/);
  assert.match(templates.title, /tampoco un bloque de datos/);
  // El texto de R-RULE-30 del escáner remite a estas dos comprobaciones por su identificador.
  const rule = SCANNER_CHECKS.filter(([id]) => id === 'R-RULE-30').map(([, doc]) => doc).join('\n');
  for (const entry of CONTROL_CHECKS) assert.ok(rule.includes(entry.id), `R-RULE-30 no nombra ${entry.id}`);
});

// ---------------------------------------------------------------------------------------------------
// Lectura del código
// ---------------------------------------------------------------------------------------------------

test('el lector guarda el código de cada <script> aparte, sin volverlo texto de la página', () => {
  const { root } = parseHtml('<p>Hola</p><script type="module">const a = "<b>";</script><script type="application/json">{"a":1}</script>');
  const [, code, data] = root.children;
  assert.equal(code.source, 'const a = "<b>";');
  assert.equal(data.source, '{"a":1}');
  assert.deepEqual(code.content, []);
});

test('lo que importa un código: estático, de efecto, reexportado o dinámico, con cualquier comilla', () => {
  const code = 'import{a as e,n as t}from"./uno.js";import"./dos.js";export{b}from\'./tres.js\';const x=import(`./cuatro.js`);import.meta.url;import{c}from"./uno.js"';
  assert.deepEqual(importsOf(code), ['./uno.js', './dos.js', './tres.js', './cuatro.js']);
});

test('un gancho se nombra entero: como atributo o en su forma dataset', () => {
  assert.equal(datasetName('data-quote-add'), 'quoteAdd');
  assert.equal(datasetName('data-toggle'), 'toggle');
  assert.ok(namesHook('document.querySelector(`[data-quote-add]`)', 'data-quote-add'));
  assert.ok(namesHook('e.getAttribute("data-quote-add")', 'data-quote-add'));
  assert.ok(namesHook('x.querySelector("[DATA-QUOTE-ADD]")', 'data-quote-add'));
  assert.ok(namesHook('let{quoteAdd:t}=e.dataset', 'data-quote-add'));
  assert.ok(namesHook('e.dataset.toggle', 'data-toggle'));
  assert.ok(namesHook("e.dataset['toggle']", 'data-toggle'));
  // Parte de un nombre más largo, o una palabra suelta que no se lee de dataset, no cuentan.
  assert.ok(!namesHook('document.querySelector(`[data-quote-add-all]`);e.dataset.quoteAddAll', 'data-quote-add'));
  assert.ok(!namesHook('document.querySelector(`[data-quote-add]`)', 'data-quote-add-all'));
  assert.ok(!namesHook('document.querySelector(`[x-data-quote-add]`)', 'data-quote-add'));
  assert.ok(!namesHook('e.classList.toggle(`abierto`)', 'data-toggle'));
});

// ---------------------------------------------------------------------------------------------------
// R-RULE-30a: controles con función
// ---------------------------------------------------------------------------------------------------

test('R-RULE-30a: la búsqueda nativa pasa sin ningún script (campo con name y botones de envío de un <form> con action)', async () => {
  const form = '<form class="catalog-search__form" role="search" action="/catalogo/" method="get"><label for="q">Buscar</label>'
    + '<input id="q" name="q" type="search"><button type="submit">Buscar</button><button>Ir</button><input type="submit" value="Otra"></form>';
  assert.deepEqual(await check({ 'index.html': page(form) }), []);
});

test('R-RULE-30a: un botón cuyo gancho nombra un script de módulo en línea pasa', async () => {
  const body = '<button type="button" data-quote-clear="true">Vaciar cotización</button>'
    + module('document.querySelector(`[data-quote-clear]`)?.addEventListener(`click`,()=>{})');
  assert.deepEqual(await check({ 'cotizar/index.html': page(body) }), []);
});

test('R-RULE-30a: un gancho nombrado solo en un archivo importado a dos niveles de profundidad pasa, también con import()', async () => {
  const body = '<button type="button" data-fila-quitar>Quitar</button><button type="button" data-fila-unir>Unirlos</button>';
  const files = {
    'cotizar/index.html': page(body, '<script type="module" src="/_astro/pagina.Ab12.js"></script>'),
    '_astro/pagina.Ab12.js': 'import{a as e}from"./uno.Cd34.js";e();',
    '_astro/uno.Cd34.js': 'import"./dos.Ef56.js";export const a=()=>import(`./tres.Gh78.js`);',
    '_astro/dos.Ef56.js': 'document.querySelectorAll(`[data-fila-quitar]`).forEach(e=>e.remove());',
    '_astro/tres.Gh78.js': 'document.querySelector(`[data-fila-unir]`);',
  };
  assert.deepEqual(await check(files), []);
  // Sin el segundo nivel, el primer control ya no tiene quien lo nombre.
  const problems = await check({ ...files, '_astro/uno.Cd34.js': 'export const a=()=>import(`./tres.Gh78.js`);' });
  assert.equal(problems.length, 1);
  assert.match(problems[0].message, /^<button type="button"> «Quitar» no tiene función: ningún script de la página nombra data-fila-quitar/);
});

test('R-RULE-30a: un campo con name y el botón de envío de un <form> con gancho pasan; los botones del selector llevan el suyo', async () => {
  const form = '<form class="producto__quote js-only" data-quote-add novalidate><label for="v">Variante</label><select id="v" name="variante"><option value="">Talla o color por definir</option></select>'
    + '<button type="button" data-stepper-minus aria-disabled="true">−</button><input id="c" name="cantidad" type="text" value="1" data-stepper-input><button type="button" data-stepper-plus>+</button>'
    + '<textarea name="nota"></textarea><input type="checkbox" name="guardar"><button type="submit">Agregar a mi cotización</button></form>';
  const code = module('const f=document.querySelector(`[data-quote-add]`);f.addEventListener(`submit`,e=>e.preventDefault());')
    + module('document.addEventListener(`click`,e=>e.target.closest(`[data-stepper-minus],[data-stepper-plus]`));document.querySelectorAll(`[data-stepper-input]`)');
  assert.deepEqual(await check({ 'productos/guante/index.html': page(form + code) }), []);
  // El atributo form también da el formulario al control que está fuera de él.
  const outside = '<form id="f" data-quote-add></form><input name="cantidad" form="f"><button form="f">Agregar</button>' + module('document.querySelector(`[data-quote-add]`)');
  assert.deepEqual(await check({ 'productos/guante/index.html': page(outside) }), []);
});

test('R-RULE-30a: un control dentro de un <template> se revisa, y pasa con su gancho nombrado fuera de la plantilla', async () => {
  const body = '<ol data-quote-rows></ol><template data-quote-row-template><li><select name="unidad" data-row-unit></select><button type="button" data-quote-remove>Quitar</button></li></template>'
    + module('document.addEventListener(`click`,e=>e.target.closest(`[data-quote-remove]`));document.querySelectorAll(`[data-row-unit]`)');
  assert.deepEqual(await check({ 'cotizar/index.html': page(body) }), []);
  const problems = await check({ 'cotizar/index.html': page(body.replace(' data-quote-remove>', '>')) });
  assert.equal(problems.length, 1);
  assert.match(problems[0].message, /«Quitar» no tiene función/);
});

test('R-RULE-30a: un gancho leído en su forma dataset pasa', async () => {
  const body = '<button type="button" data-copy-request="true">Copiar solicitud</button><button type="button" data-toggle="menu">Menú</button>'
    + module('document.addEventListener(`click`,e=>{const t=e.target;if(t.dataset.copyRequest!==void 0)copy();if(t.dataset.toggle===`menu`)open()})');
  assert.deepEqual(await check({ 'cotizar/index.html': page(body) }), []);
});

test('R-RULE-30a: <summary>, <label> y <input type="hidden"> no son controles', async () => {
  const body = '<details><summary>¿Por qué no aparecen precios?</summary><p>Porque…</p></details><label for="x">Nombre</label><input type="hidden" name="categoria" value="manos"><input type="HIDDEN">';
  assert.deepEqual(await check({ 'contacto/index.html': page(body) }), []);
});

test('R-RULE-30a: un <button> suelto, sin type o con type="button", falla y el mensaje dice la página, el control y lo que falta', async () => {
  const text = 'Un texto de botón bastante largo que pasa de los sesenta caracteres con holgura';
  const problems = await check({ 'contacto/index.html': page(`<button class="action action--primary">${text}</button><button type="button" name="x">Ver</button>`) });
  assert.equal(problems.length, 2);
  assert.deepEqual(problems.map(problem => [problem.id, problem.file]), [['R-RULE-30a', 'contacto/index.html'], ['R-RULE-30a', 'contacto/index.html']]);
  assert.equal(problems[0].message, `<button class="action action--primary"> «${text.slice(0, 60)}» no tiene función: no lleva un atributo data-* que un script de la página nombre; no está en un <form> con action o con un atributo data-* que un script de la página nombre`);
  assert.equal(problems[1].message, '<button type="button" name="x"> «Ver» no tiene función: no lleva un atributo data-* que un script de la página nombre');
});

test('R-RULE-30a: un gancho que ningún script nombra, o que nombra solo el script de OTRA página, falla', async () => {
  const button = '<button type="button" data-quote-clear>Vaciar cotización</button>';
  const alone = await check({ 'cotizar/index.html': page(button + module('document.querySelector(`[data-quote-undo]`)')) });
  assert.equal(alone.length, 1);
  assert.match(alone[0].message, /ningún script de la página nombra data-quote-clear \(ni quoteClear\)/);
  const elsewhere = await check({
    'cotizar/index.html': page(button, '<script type="module" src="/_astro/cotizar.js"></script>'),
    'otra/index.html': page('<p>Otra</p>', '<script type="module" src="/_astro/otra.js"></script>') + module('document.querySelector(`[data-quote-clear]`)'),
    '_astro/cotizar.js': 'document.querySelector(`[data-quote-undo]`)',
    '_astro/otra.js': 'document.querySelector(`[data-quote-clear]`)',
  });
  assert.deepEqual(elsewhere.map(problem => problem.file), ['cotizar/index.html']);
});

test('R-RULE-30a: un gancho nombrado solo dentro de un bloque de datos JSON falla', async () => {
  const body = '<button type="button" data-quote-clear>Vaciar cotización</button><script type="application/json" data-quote-index>{"selector":"[data-quote-clear]","quoteClear":true}</script>'
    + '<script type="application/ld+json">{"x":"[data-quote-clear]"}</script>';
  const problems = await check({ 'cotizar/index.html': page(body) });
  assert.equal(problems.length, 1);
  assert.match(problems[0].message, /ningún script de la página nombra data-quote-clear/);
});

test('R-RULE-30a: en un <form> con gancho, un campo sin name o un botón type="button" sin gancho fallan', async () => {
  const code = module('document.querySelector(`[data-quote-add]`).addEventListener(`submit`,()=>{})');
  const field = await check({ 'productos/guante/index.html': page(`<form data-quote-add><input type="text" id="cantidad"><button type="submit">Agregar</button></form>${code}`) });
  assert.equal(field.length, 1);
  assert.match(field[0].message, /^<input type="text"> no tiene función: .*está en un <form>, pero un campo sin name no viaja con él$/);
  const button = await check({ 'productos/guante/index.html': page(`<form data-quote-add><input name="cantidad"><button type="button">Sumar</button></form>${code}`) });
  assert.equal(button.length, 1);
  assert.match(button[0].message, /^<button type="button"> «Sumar» no tiene función: .*un botón type="button" no lo envía/);
  // Un <form> sin action ni gancho nombrado no da función a nada.
  const bare = await check({ 'productos/guante/index.html': page('<form data-nadie><input name="cantidad"><button>Agregar</button></form>') });
  assert.equal(bare.length, 2);
  assert.ok(bare.every(problem => /su <form> no lleva action ni un atributo data-\* que un script de la página nombre \(lleva data-nadie\)/.test(problem.message)));
});

test('R-RULE-30a: un botón type="reset" dentro de un <form> pasa sin gancho, y fuera de uno falla', async () => {
  assert.deepEqual(await check({ 'index.html': page('<form action="/catalogo/"><input name="q"><button type="reset">Limpiar</button><input type="reset" value="Limpiar"></form>') }), []);
  const loose = await check({ 'index.html': page('<button type="reset">Limpiar</button>') });
  assert.equal(loose.length, 1);
  assert.match(loose[0].message, /«Limpiar» no tiene función/);
});

test('R-RULE-30a: un role="button" sin gancho falla, y también un control con disabled', async () => {
  const problems = await check({ 'index.html': page('<span role="button" tabindex="0" class="chip">Abrir</span><button type="button" disabled>Enviar</button><button type="button" aria-disabled="true">Quitar</button>') });
  assert.deepEqual(problems.map(problem => problem.message.split(' no tiene función')[0]), [
    '<span role="button" class="chip"> «Abrir»', '<button type="button"> «Enviar»', '<button type="button"> «Quitar»',
  ]);
});

test('R-RULE-30a: un gancho que el código solo nombra como parte de un nombre más largo falla', async () => {
  const shorter = await check({ 'cotizar/index.html': page('<button type="button" data-quote-add>Agregar</button>' + module('document.querySelectorAll(`[data-quote-add-all]`);e.dataset.quoteAddAll')) });
  assert.equal(shorter.length, 1);
  const longer = await check({ 'cotizar/index.html': page('<button type="button" data-quote-add-all>Agregar todo</button>' + module('document.querySelectorAll(`[data-quote-add]`);e.dataset.quoteAdd')) });
  assert.equal(longer.length, 1);
  // Una palabra sola que el código usa para otra cosa («classList.toggle») no nombra data-toggle.
  const word = await check({ 'index.html': page('<button type="button" data-toggle="menu">Menú</button>' + module('document.body.classList.toggle(`abierto`)')) });
  assert.equal(word.length, 1);
});

// ---------------------------------------------------------------------------------------------------
// R-RULE-30b: ningún <script> dentro de un <template>
// ---------------------------------------------------------------------------------------------------

test('R-RULE-30b: una plantilla sin scripts junto a un script fuera de ella pasa', async () => {
  const body = '<template data-quote-row-template><li><button type="button" data-quote-remove>Quitar</button></li></template>'
    + '<script type="module" src="/_astro/stepper.js"></script>' + module('document.querySelector(`[data-quote-remove]`)');
  const problems = await check({ 'cotizar/index.html': page(body), '_astro/stepper.js': '' });
  assert.deepEqual(only(problems, 'R-RULE-30b'), []);
});

test('R-RULE-30b: un script de módulo en línea dentro de una plantilla falla, a cualquier profundidad', async () => {
  for (const inside of [module('document.addEventListener(`click`,()=>count++)'), `<li><div>${module('count++')}</div></li>`, '<script type="module" src="/_astro/stepper.js"></script>']) {
    const problems = only(await check({ 'cotizar/index.html': page(`<template data-quote-row-template>${inside}</template>`), '_astro/stepper.js': '' }), 'R-RULE-30b');
    assert.equal(problems.length, 1, inside);
    assert.equal(problems[0].file, 'cotizar/index.html');
    assert.match(problems[0].message, /^<script type="module"/, inside);
    assert.match(problems[0].message, /está dentro de <template data-quote-row-template>: cada clon de la plantilla lo ejecuta otra vez; el script va una sola vez fuera de la plantilla \(un componente …Script\.astro\)$/, inside);
  }
});

test('R-RULE-30b: un bloque de datos JSON dentro de una plantilla también falla', async () => {
  const problems = only(await check({ 'cotizar/index.html': page('<template id="fila"><script type="application/json">{"a":1}</script></template>') }), 'R-RULE-30b');
  assert.equal(problems.length, 1);
  assert.match(problems[0].message, /^<script type="application\/json"> «\{"a":1\}» está dentro de <template#fila>/);
});
