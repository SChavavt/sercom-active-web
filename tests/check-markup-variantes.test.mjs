import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CHECKS, checkMarkup } from '../scripts/check-markup.mjs';
import { makeTree, removeTree, ROOT } from './helpers.mjs';

// La comprobación de las variantes de una ficha (R-VARIANTE-01) de scripts/check-markup.mjs: cada variante lleva su
// etiqueta, y un código solo cuando lo tiene. Páginas sintéticas, solo de prueba.
const VARIANT_CHECKS = CHECKS.filter(check => check.id === 'R-VARIANTE-01');

const doc = (title, body) => `<!doctype html><html lang="es-MX"><head><meta charset="utf-8"><title>${title} · Sercom Active</title></head><body>`
  + `<div class="sheet"><main id="contenido">${body}</main></div></body></html>`;
// Lo que imprime src/pages/productos/[id].astro: la etiqueta y, si la variante tiene código, el código tras «Código».
const chip = (label, code) => `<li class="producto__chip"><span class="producto__chip-label">${label}</span>`
  + `${code === undefined ? '' : `<span class="producto__chip-code t-code"><span class="vh">Código </span>${code}</span>`}</li>`;
const chips = (...items) => `<section class="producto grid12"><div class="producto__body span-5"><h2 class="t-label">Variantes</h2>`
  + `<ul class="producto__chips">${items.join('')}<li class="producto__chip-fill" aria-hidden="true"></li></ul></div></section>`;

async function check(files) {
  const directory = await makeTree({ 'index.html': doc('Inicio', '<h1>Inicio</h1>'), ...files });
  try {
    return (await checkMarkup(directory, { checks: VARIANT_CHECKS })).problems;
  } finally {
    await removeTree(directory);
  }
}
const ficha = html => check({ 'productos/guante-ficticio/index.html': doc('Guante ficticio', html) });

test('la comprobación de las variantes está en CHECKS, documentada en el script', async () => {
  assert.deepEqual(VARIANT_CHECKS.map(entry => entry.id), ['R-VARIANTE-01']);
  assert.ok(VARIANT_CHECKS[0].title.length > 40);
  const source = await readFile(join(ROOT, 'scripts', 'check-markup.mjs'), 'utf8');
  assert.match(source, /\/\/ R-VARIANTE-01 · /);
});

test('variantes con código, sin código o mezcladas no son un problema', async () => {
  assert.deepEqual(await ficha(chips(chip('Talla 8', 'FIC-100-8'), chip('Talla 9', 'FIC-100-9'))), []);
  assert.deepEqual(await ficha(chips(chip('Talla 7'), chip('Talla 8'))), []);
  assert.deepEqual(await ficha(chips(chip('Chica'), chip('Mediana', 'FIC-100-M'), chip('Grande'))), []);
  // Una ficha sin variantes, o una página que no es de producto, no tienen nada que revisar.
  assert.deepEqual(await ficha('<section class="producto grid12"><div class="producto__body span-5"><p>Sin variantes</p></div></section>'), []);
  assert.deepEqual(await check({ 'catalogo/index.html': doc('Catálogo', chips(chip(''))) }), []);
});

test('un elemento de código sin código es un problema: la variante sin código propio no lo imprime', async () => {
  for (const code of ['', '  ', '<span aria-hidden="true">FIC</span>']) {
    const problems = await ficha(chips(chip('Talla 8', 'FIC-100-8'), chip('Talla 9', code)));
    assert.equal(problems.length, 1, `${JSON.stringify(code)}\n${JSON.stringify(problems)}`);
    assert.equal(problems[0].file, 'productos/guante-ficticio/index.html');
    assert.equal(problems[0].message, 'la variante 2 (<li.producto__chip>), «Talla 9», lleva <span.producto__chip-code.t-code> sin código: si la variante no tiene código propio, la página no imprime ese elemento');
  }
});

test('un código sin la palabra oculta «Código» antes es un problema', async () => {
  const problems = await ficha(chips('<li class="producto__chip"><span class="producto__chip-label">Talla 8</span><span class="producto__chip-code t-code">FIC-100-8</span></li>'));
  assert.deepEqual(problems.map(problem => problem.message), ['la variante 1 (<li.producto__chip>), «Talla 8», lleva <span.producto__chip-code.t-code> sin la palabra oculta «Código» (.vh) antes del código']);
});

test('una variante sin etiqueta, o con la etiqueta vacía, es un problema', async () => {
  const message = 'la variante 1 (<li.producto__chip>) no lleva una etiqueta con texto (.producto__chip-label): el visitante no sabe qué variante es';
  assert.deepEqual((await ficha(chips(chip('', 'FIC-100-8')))).map(problem => problem.message), [message]);
  assert.deepEqual((await ficha(chips(chip('   ')))).map(problem => problem.message), [message]);
  assert.deepEqual((await ficha(chips('<li class="producto__chip"><span class="producto__chip-code t-code"><span class="vh">Código </span>FIC-100-8</span></li>'))).map(problem => problem.message), [message]);
});
