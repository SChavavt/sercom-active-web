import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CHECKS, checkMarkup, QUOTE_PAGE_HOOKS } from '../scripts/check-markup.mjs';
import { makeTree, removeTree, ROOT } from './helpers.mjs';

// La comprobación de la página de cotizar (R-QUOTE-12) de scripts/check-markup.mjs: que /cotizar/ lleve lo que su
// script necesita según las páginas de producto de la compilación, y que su índice público cuadre con ellas.
const QUOTE_CHECKS = CHECKS.filter(check => check.id === 'R-QUOTE-12');

// ---------------------------------------------------------------------------------------------------
// Un sitio mínimo: fichas, páginas de retirado y la página de cotizar con las piezas que imprime
// src/pages/cotizar/index.astro, cada una configurable para romper un hecho.
// ---------------------------------------------------------------------------------------------------

const doc = (body, scripts = '') => '<!doctype html><html lang="es-MX"><head><meta charset="utf-8"><title>Prueba</title></head><body>'
  + `<div class="sheet"><main id="contenido" tabindex="-1">${body}</main></div>${scripts}</body></html>`;
// Una ficha (sin el aviso de retirado) y la página de un retirado (con su celda de aviso).
const ficha = name => doc(`<h1 class="producto__title">${name}</h1><a class="action" href="https://wa.me/5212214002219"><span>Cotizar este producto</span></a>`);
const retiredPage = name => doc(`<h1 class="producto__title">${name}</h1><div class="producto__retired cell"><p class="producto__retired-label eyebrow label">Producto retirado</p></div>`);
const entry = id => ({ id, name: `Producto ${id}`, brandName: 'Marca de prueba', code: 'PR-1', url: `/productos/${id}/` });
const indexOf = (products, retired) => ({ products: products.map(id => ({ ...entry(id), saleUnit: 'par', isExample: false, variants: [] })), retired: retired.map(entry) });

// El script de la página nombra los ganchos de la lista (también los botones del selector, para sus nombres), pero no
// el del selector mismo: ese lo atiende solo el script del selector de cantidad.
const PAGE_SCRIPT = 'const l=document.querySelector(`[data-quote-rows]`),u=document.querySelector(`[data-quote-unknown]`);l.querySelector(`[data-stepper-input]`);';
const STEPPER_SCRIPT = 'const S=`[data-stepper]`;document.addEventListener(`click`,e=>{e.target.closest(`[data-stepper-minus], [data-stepper-plus]`)?.closest(S)});';

/**
 * La página de cotizar. Por omisión, la de una compilación con fichas y retirados (`index` es el índice que imprime);
 * cada opción quita, repite o cambia una pieza.
 */
function cotizar({
  index = indexOf(['guante', 'casco'], ['viejo']), indexScript, rowTemplate = true, retiredTemplate = true, tools = true, stepper = true,
  unknown = 1, statusRow = 1, writeFailed = 1, extra = '',
} = {}) {
  const repeat = (count, html) => html.repeat(count);
  const block = indexScript ?? (index === null ? '' : `<script type="application/json" data-quote-index>${typeof index === 'string' ? index : JSON.stringify(index)}</script>`);
  const body = '<h1>Cotizar mi lista</h1><section data-quote-section>'
    + block
    + `<ol data-quote-rows>${repeat(unknown, '<li data-quote-unknown hidden></li>')}${repeat(statusRow, '<li data-quote-status-row hidden></li>')}</ol>`
    + repeat(writeFailed, '<p data-quote-write-failed hidden>Tu navegador no permitió guardar el cambio.</p>')
    + (tools ? '<div class="grid12" data-quote-tools hidden></div>' : '')
    + (rowTemplate ? '<template data-quote-row-template><li><div class="stepper" data-stepper><button type="button" data-stepper-minus></button><input data-stepper-input name="cantidad"><button type="button" data-stepper-plus></button></div></li></template>' : '')
    + (retiredTemplate ? '<template data-quote-retired-template><li><a data-row-link href="/catalogo/">Producto</a></li></template>' : '')
    + `${extra}</section>`;
  const scripts = `${stepper ? '<script type="module" src="/_astro/StepperScript.js"></script>' : ''}<script type="module" src="/_astro/cotizar.js"></script>`;
  return doc(body, scripts);
}
/** La página de cotizar de una compilación sin páginas de producto (producción hoy). */
const bareCotizar = (options = {}) => cotizar({ index: null, rowTemplate: false, retiredTemplate: false, tools: false, stepper: false, ...options });

const SCRIPTS = { '_astro/cotizar.js': PAGE_SCRIPT, '_astro/StepperScript.js': STEPPER_SCRIPT };
/** Una compilación con dos fichas y un retirado. */
const WITH_PRODUCTS = {
  'index.html': doc('<h1>Inicio</h1>'),
  'productos/guante/index.html': ficha('Guante'),
  'productos/casco/index.html': ficha('Casco'),
  'productos/viejo/index.html': retiredPage('Viejo'),
  'cotizar/index.html': cotizar(),
  ...SCRIPTS,
};
/** Una compilación sin páginas de producto. */
const WITHOUT_PRODUCTS = { 'index.html': doc('<h1>Inicio</h1>'), 'cotizar/index.html': bareCotizar(), ...SCRIPTS };

/** Revisa un sitio temporal con R-QUOTE-12 y devuelve sus problemas. */
async function check(files) {
  const directory = await makeTree(files);
  try {
    return (await checkMarkup(directory, { preview: true, checks: QUOTE_CHECKS })).problems;
  } finally {
    await removeTree(directory);
  }
}
/** Cada sitio produce al menos un problema de R-QUOTE-12 en /cotizar/, y alguno con el mensaje esperado. */
async function assertEachBreaks(cases) {
  for (const [files, expected] of cases) {
    const problems = await check(files);
    assert.ok(problems.length >= 1 && problems.every(problem => problem.id === 'R-QUOTE-12' && problem.file === 'cotizar/index.html'), `${expected}\n${JSON.stringify(problems)}`);
    assert.ok(problems.some(problem => expected.test(problem.message)), `${expected}\n${problems.map(problem => problem.message).join('\n')}`);
  }
}

test('la comprobación de la página de cotizar está en CHECKS, con su título', () => {
  assert.deepEqual(QUOTE_CHECKS.map(entry => entry.id), ['R-QUOTE-12']);
  assert.ok(QUOTE_CHECKS[0].title.length > 40);
  assert.equal(typeof QUOTE_CHECKS[0].page, 'function');
});

test('los ganchos que busca la comprobación son los que escriben las plantillas', async () => {
  // Si una plantilla cambia uno de estos ganchos, hay que cambiarlo también en QUOTE_PAGE_HOOKS o la comprobación deja
  // de mirar lo que la página lleva.
  const page = await readFile(join(ROOT, 'src/pages/cotizar/index.astro'), 'utf8');
  const { stepper, ...pageHooks } = QUOTE_PAGE_HOOKS;
  // Un elemento o un componente («<StatusLine … data-quote-write-failed>») que lleva el gancho.
  const writes = (source, hook) => new RegExp(`<[A-Za-z]+[^>]*\\s${hook}[\\s>]`).test(source);
  for (const hook of Object.values(pageHooks)) assert.ok(writes(page, hook), `la página de cotizar ya no escribe ${hook}`);
  assert.ok(page.includes('<script type="application/json" data-quote-index '), 'el índice ya no es un bloque de datos JSON');
  assert.ok(page.includes('<StepperScript />'), 'la página ya no carga el script del selector de cantidad');
  // El selector de cantidad lleva el gancho, y solo su script lo nombra como selector (no los de sus botones).
  assert.ok(writes(await readFile(join(ROOT, 'src/components/Stepper.astro'), 'utf8'), stepper), `Stepper.astro ya no escribe ${stepper}`);
  assert.ok((await readFile(join(ROOT, 'src/components/StepperScript.astro'), 'utf8')).includes(`'[${stepper}]'`), `StepperScript.astro ya no nombra [${stepper}]`);
  assert.ok(!page.slice(page.indexOf('<script>')).includes(`[${stepper}]`), `el script de la página de cotizar nombra [${stepper}]`);
});

test('la página de cotizar correcta pasa, con páginas de producto y sin ellas', async () => {
  assert.deepEqual(await check(WITH_PRODUCTS), []);
  assert.deepEqual(await check(WITHOUT_PRODUCTS), []);
  // Solo con retirados (ninguna ficha): el índice y la plantilla del retirado, sin la plantilla de renglón, las
  // herramientas ni el selector de cantidad. Así lo imprime la página.
  assert.deepEqual(await check({
    'productos/viejo/index.html': retiredPage('Viejo'),
    'cotizar/index.html': bareCotizar({ index: indexOf([], ['viejo']), retiredTemplate: true }),
    ...SCRIPTS,
  }), []);
  // Una compilación sin página de cotizar no se revisa, y las demás páginas tampoco.
  assert.deepEqual(await check({ 'index.html': doc('<h1>Inicio</h1>'), 'productos/guante/index.html': ficha('Guante'), 'contacto/index.html': doc('<h1>Contacto</h1>') }), []);
});

test('siempre: el renglón de los productos que no ubica, la línea de estado y el aviso de que no se guardó, uno de cada uno', async () => {
  for (const [base, page] of [[WITH_PRODUCTS, cotizar], [WITHOUT_PRODUCTS, bareCotizar]]) {
    await assertEachBreaks([
      [{ ...base, 'cotizar/index.html': page({ unknown: 0 }) }, /^falta el renglón de los productos que la página no ubica \(\[data-quote-unknown\]\): va siempre/],
      [{ ...base, 'cotizar/index.html': page({ statusRow: 0 }) }, /^falta la línea de estado \(\[data-quote-status-row\]\)/],
      [{ ...base, 'cotizar/index.html': page({ writeFailed: 0 }) }, /^falta el aviso de que el navegador no guardó un cambio \(\[data-quote-write-failed\]\)/],
      [{ ...base, 'cotizar/index.html': page({ unknown: 2 }) }, /\[data-quote-unknown\]\) aparece 2 veces; va una sola vez/],
      [{ ...base, 'cotizar/index.html': page({ statusRow: 2 }) }, /\[data-quote-status-row\]\) aparece 2 veces/],
      [{ ...base, 'cotizar/index.html': page({ writeFailed: 3 }) }, /\[data-quote-write-failed\]\) aparece 3 veces/],
      // Dentro de una plantilla no está en el documento: el script no lo encuentra.
      [{ ...base, 'cotizar/index.html': page({ writeFailed: 0, extra: '<template><p data-quote-write-failed></p></template>' }) }, /^falta el aviso de que el navegador no guardó/],
    ]);
  }
});

test('con páginas de producto: falta el índice, una plantilla, las herramientas o el script del selector de cantidad', async () => {
  await assertEachBreaks([
    [{ ...WITH_PRODUCTS, 'cotizar/index.html': cotizar({ index: null }) }, /^falta el índice público .*: la compilación tiene 2 fichas y 1 página de retirado$/],
    [{ ...WITH_PRODUCTS, 'cotizar/index.html': cotizar({ retiredTemplate: false }) }, /^falta la plantilla del renglón retirado \(template\[data-quote-retired-template\]\)/],
    [{ ...WITH_PRODUCTS, 'cotizar/index.html': cotizar({ rowTemplate: false }) }, /^falta la plantilla de renglón \(template\[data-quote-row-template\]\): la compilación tiene 2 fichas$/],
    [{ ...WITH_PRODUCTS, 'cotizar/index.html': cotizar({ tools: false }) }, /^falta el bloque de herramientas \(\[data-quote-tools\]\)/],
    [{ ...WITH_PRODUCTS, 'cotizar/index.html': cotizar({ stepper: false }) }, /^falta el script del selector de cantidad \(ningún script de la página nombra \[data-stepper\]\)/],
    // El índice tiene que ser un bloque de datos JSON fuera de toda plantilla; un gancho en otro elemento no cuenta.
    [{ ...WITH_PRODUCTS, 'cotizar/index.html': cotizar({ indexScript: `<script data-quote-index>${JSON.stringify(indexOf(['guante', 'casco'], ['viejo']))}</script>` }) }, /^falta el índice público/],
    [{ ...WITH_PRODUCTS, 'cotizar/index.html': cotizar({ indexScript: `<template><script type="application/json" data-quote-index>${JSON.stringify(indexOf(['guante', 'casco'], ['viejo']))}</script></template>` }) }, /^falta el índice público/],
    [{ ...WITH_PRODUCTS, 'cotizar/index.html': cotizar({ indexScript: '<div data-quote-index></div>' }) }, /^falta el índice público/],
    [{ ...WITH_PRODUCTS, 'cotizar/index.html': cotizar({ tools: false, extra: '<p data-quote-tools-x></p>' }) }, /^falta el bloque de herramientas/],
    // Dos índices o dos plantillas: el script usa el primero.
    [{ ...WITH_PRODUCTS, 'cotizar/index.html': cotizar({ extra: `<script type="application/json" data-quote-index>${JSON.stringify(indexOf(['guante', 'casco'], ['viejo']))}</script>` }) }, /^el índice público .* aparece 2 veces/],
    [{ ...WITH_PRODUCTS, 'cotizar/index.html': cotizar({ extra: '<template data-quote-row-template><li></li></template>' }) }, /^la plantilla de renglón .* aparece 2 veces/],
  ]);
});

test('sin páginas de producto: ni índice, ni plantillas, ni herramientas, ni el script del selector de cantidad', async () => {
  await assertEachBreaks([
    [{ ...WITHOUT_PRODUCTS, 'cotizar/index.html': bareCotizar({ index: indexOf([], []) }) }, /^la página lleva el índice público .* y la compilación no tiene páginas de producto$/],
    [{ ...WITHOUT_PRODUCTS, 'cotizar/index.html': bareCotizar({ retiredTemplate: true }) }, /^la página lleva la plantilla del renglón retirado .* y la compilación no tiene páginas de producto$/],
    [{ ...WITHOUT_PRODUCTS, 'cotizar/index.html': bareCotizar({ rowTemplate: true }) }, /^la página lleva la plantilla de renglón .* y la compilación no tiene fichas$/],
    [{ ...WITHOUT_PRODUCTS, 'cotizar/index.html': bareCotizar({ tools: true }) }, /^la página lleva el bloque de herramientas .* y la compilación no tiene fichas$/],
    [{ ...WITHOUT_PRODUCTS, 'cotizar/index.html': bareCotizar({ stepper: true }) }, /^la página carga el script del selector de cantidad .* y la compilación no tiene fichas: no hay ningún selector que atender$/],
    // Solo con retirados, lo de las fichas también sobra.
    [{ ...WITHOUT_PRODUCTS, 'productos/viejo/index.html': retiredPage('Viejo'), 'cotizar/index.html': cotizar({ index: indexOf([], ['viejo']) }) }, /^la página lleva la plantilla de renglón .* y la compilación no tiene fichas$/],
  ]);
  // Todo junto: un problema por pieza.
  const all = await check({ ...WITHOUT_PRODUCTS, 'cotizar/index.html': cotizar({ index: indexOf([], []) }) });
  assert.equal(all.length, 5, all.map(problem => problem.message).join('\n'));
});

test('el índice público cuadra con las páginas de producto de la compilación', async () => {
  const withIndex = (index, files = {}) => ({ ...WITH_PRODUCTS, ...files, 'cotizar/index.html': cotizar({ index }) });
  await assertEachBreaks([
    // Un producto del índice sin su página, y una ficha que no está en el índice.
    [withIndex(indexOf(['guante', 'casco', 'botas'], ['viejo'])), /^«botas» está en «products» del índice público y la compilación no tiene su página \(\/productos\/botas\/\)$/],
    [withIndex(indexOf(['guante'], ['viejo'])), /^\/productos\/casco\/ es una ficha de la compilación y no está en «products» del índice público/],
    // Un retirado del índice sin su página, y una página de retirado que no está en «retired».
    [withIndex(indexOf(['guante', 'casco'], ['viejo', 'otro'])), /^«otro» está en «retired» del índice público y la compilación no tiene su página/],
    [withIndex(indexOf(['guante', 'casco'], [])), /^\/productos\/viejo\/ es la página de un retirado de la compilación y no está en «retired» del índice público/],
    // Cada uno en la lista que no le corresponde.
    [withIndex(indexOf(['guante', 'casco', 'viejo'], [])), /^«viejo» está en «products» del índice público y su página \(\/productos\/viejo\/\) es la de un retirado$/],
    [withIndex(indexOf(['guante'], ['viejo', 'casco'])), /^«casco» está en «retired» del índice público y su página \(\/productos\/casco\/\) es una ficha$/],
    // La url de una entrada no es la ruta de su id.
    [withIndex({ ...indexOf(['guante', 'casco'], ['viejo']), products: [{ ...entry('guante'), url: '/productos/casco/' }, entry('casco')] }), /^«guante» \(«products» del índice público\) lleva url «\/productos\/casco\/» y su página es \/productos\/guante\/$/],
    [withIndex({ ...indexOf(['guante', 'casco'], ['viejo']), retired: [{ ...entry('viejo'), url: undefined }] }), /^«viejo» \(«retired» del índice público\) lleva url «» y su página es \/productos\/viejo\/$/],
    // Lo que no se puede leer.
    [withIndex('{"products": ['), /no es JSON válido/],
    [withIndex({ products: indexOf(['guante', 'casco'], []).products }), /no tiene las listas «products» y «retired»/],
    [withIndex('[]'), /no tiene las listas «products» y «retired»/],
    [withIndex({ ...indexOf(['guante', 'casco'], ['viejo']), products: [...indexOf(['guante', 'casco'], []).products, { name: 'Sin id' }] }), /^una entrada de «products» del índice público no tiene id/],
  ]);
  // Con el texto escapado como lo imprime jsonForScript («<» como \u003c) también se lee.
  const escaped = JSON.stringify(indexOf(['guante', 'casco'], ['viejo'])).replace('Producto guante', 'Producto <b>guante</b>').replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
  assert.deepEqual(await check(withIndex(escaped)), []);
});
