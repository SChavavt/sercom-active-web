import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CHECKS, checkMarkup } from '../scripts/check-markup.mjs';
import { makeTree, removeTree, ROOT } from './helpers.mjs';

// La comprobación de las fotografías de producto (R-FOTO-01) de scripts/check-markup.mjs: cada foto lleva alt y medidas,
// y la página de un producto retirado no lleva la suya.
const PHOTO_CHECKS = CHECKS.filter(check => check.id === 'R-FOTO-01');

const doc = (title, body) => `<!doctype html><html lang="es-MX"><head><meta charset="utf-8"><title>${title} · Sercom Active</title></head><body>`
  + `<div class="sheet"><main id="contenido">${body}</main></div></body></html>`;
// Lo que imprime ProductPhoto.astro: un archivo con <picture> y una dirección con un <img> solo.
const picture = (cls, img = '') => `<picture><source srcset="/_astro/foto.a1_b2.webp 320w, /_astro/foto.a1_c3.webp 640w" type="image/webp" sizes="320px">`
  + `<img src="/_astro/foto.a1_d4.jpg" srcset="/_astro/foto.a1_e5.jpg 320w" sizes="320px" ${img || 'alt="Guante de prueba" width="1600" height="1200"'} decoding="async" loading="lazy" class="${cls}"></picture>`;
const remote = (cls, img = 'alt="Guante de prueba" width="1600" height="1200"') => `<img class="${cls}" src="https://fotos.example.invalid/guante.jpg" ${img} decoding="async" referrerpolicy="no-referrer" loading="lazy">`;
const card = photo => `<article class="product span-3"><div class="product__media product__media--photo">${photo}</div><h3 class="product__name t-h3">Guante de prueba</h3></article>`;
const ficha = photo => `<section class="producto grid12"><div class="producto__media producto__media--photo span-7"><div class="producto__frame">${photo}</div></div>`
  + '<div class="producto__body span-5"><a class="action cell-link action--primary" href="https://wa.me/5212214002219?text=Hola"><span>Cotizar este producto</span></a></div></section>';
const retiredMedia = (inFrame = '') => `<section class="producto grid12"><div class="producto__media span-7"><div class="producto__frame">${inFrame}<span class="producto__plate"><svg></svg></span></div></div>`
  + '<div class="producto__body span-5"><div class="producto__retired cell"><p class="producto__retired-label">Producto retirado</p></div></div></section>';
const more = photo => `<section class="section"><div class="products grid12">${card(photo)}</div></section>`;

async function check(files) {
  const directory = await makeTree({ 'index.html': doc('Inicio', '<h1>Inicio</h1>'), ...files });
  try {
    return (await checkMarkup(directory, { checks: PHOTO_CHECKS })).problems;
  } finally {
    await removeTree(directory);
  }
}

test('la comprobación de las fotografías está en CHECKS, documentada en el script', async () => {
  assert.deepEqual(PHOTO_CHECKS.map(entry => entry.id), ['R-FOTO-01']);
  assert.ok(PHOTO_CHECKS[0].title.length > 40);
  const source = await readFile(join(ROOT, 'scripts', 'check-markup.mjs'), 'utf8');
  assert.match(source, /\/\/ R-FOTO-01 · /);
});

test('una foto con alt y medidas, en tarjetas y en la ficha, de archivo o de dirección, no es un problema', async () => {
  const problems = await check({
    'catalogo/index.html': doc('Catálogo', `<h1>Catálogo</h1>${card(picture('product__img'))}${card(remote('product__img'))}`),
    'productos/guante/index.html': doc('Guante', ficha(picture('producto__img').replace('loading="lazy"', 'loading="eager" fetchpriority="high"')) + more(remote('product__img'))),
    'productos/casco/index.html': doc('Casco', ficha(remote('producto__img'))),
  });
  assert.deepEqual(problems, []);
});

test('una ficha o una tarjeta sin foto, con el pictograma de su categoría, no es un problema', async () => {
  // Como las imprimen ProductCard.astro y la ficha cuando `image` es null: la placa con el pictograma, sin <img>.
  const plateCard = '<article class="product span-3"><div class="product__media"><span class="product__plate"><svg class="icon" width="40" height="40"></svg></span></div><h3 class="product__name t-h3">Guante sin foto</h3></article>';
  const plateFicha = '<section class="producto grid12"><div class="producto__media span-7"><div class="producto__frame"><span class="producto__plate"><svg class="icon" width="64" height="64"></svg></span></div></div>'
    + '<div class="producto__body span-5"><a class="action cell-link action--primary" href="https://wa.me/5212214002219?text=Hola"><span>Cotizar este producto</span></a></div></section>';
  assert.deepEqual(await check({
    'catalogo/index.html': doc('Catálogo', `<h1>Catálogo</h1>${plateCard}${card(picture('product__img'))}`),
    'productos/guante-sin-foto/index.html': doc('Guante sin foto', plateFicha + `<section class="section"><div class="products grid12">${plateCard}${card(remote('product__img'))}</div></section>`),
  }), []);
});

test('una foto de producto sin alt, con alt vacío o sin medidas enteras positivas es un problema', async () => {
  const cases = [
    ['alt="" width="1600" height="1200"', /no lleva un alt no vacío$/],
    ['alt="  " width="1600" height="1200"', /no lleva un alt no vacío$/],
    ['width="1600" height="1200"', /no lleva un alt no vacío$/],
    ['alt="Guante" height="1200"', /no lleva width entero positivo$/],
    ['alt="Guante" width="1600"', /no lleva height entero positivo$/],
    ['alt="Guante" width="0" height="1200"', /no lleva width entero positivo$/],
    ['alt="Guante" width="800.5" height="600"', /no lleva width entero positivo$/],
    ['alt="Guante" width="100%" height="auto"', /no lleva width entero positivo ni height entero positivo$/],
    ['alt="" width="" height=""', /no lleva un alt no vacío ni width entero positivo ni height entero positivo$/],
  ];
  for (const [attributes, expected] of cases) {
    for (const [name, html] of [
      ['tarjeta con picture', card(picture('product__img', attributes))],
      ['tarjeta con dirección', card(remote('product__img', attributes))],
      ['ficha con picture', ficha(picture('producto__img', attributes))],
      ['ficha con dirección', ficha(remote('producto__img', attributes))],
    ]) {
      const problems = await check({ 'productos/guante/index.html': doc('Guante', html) });
      assert.equal(problems.length, 1, `${name}: ${attributes}\n${JSON.stringify(problems)}`);
      assert.equal(problems[0].file, 'productos/guante/index.html');
      assert.match(problems[0].message, expected, `${name}: ${attributes}`);
    }
  }
  // Otras imágenes de la página (un logotipo, un icono) no son fotos de producto.
  assert.deepEqual(await check({ 'productos/guante/index.html': doc('Guante', `<img src="/logo.svg" alt="">${ficha(remote('producto__img'))}`) }), []);
});

test('la página de un producto retirado no lleva su fotografía; las tarjetas de «Más productos…» sí pueden llevar la suya', async () => {
  // Como la imprime RetiredProduct.astro: el pictograma de la categoría, y tarjetas con foto debajo.
  assert.deepEqual(await check({ 'productos/retirado/index.html': doc('Retirado (producto retirado)', retiredMedia() + more(picture('product__img'))) }), []);
  for (const [name, html] of [
    ['picture en el marco', retiredMedia(picture('producto__img'))],
    ['dirección en el marco', retiredMedia(remote('producto__img'))],
    ['foto sin la clase en el marco', retiredMedia('<img src="/_astro/foto.jpg" alt="Guante" width="10" height="10">')],
    ['foto de la ficha fuera del marco', retiredMedia() + `<div>${remote('producto__img')}</div>`],
  ]) {
    const problems = await check({ 'productos/retirado/index.html': doc('Retirado (producto retirado)', html) });
    assert.ok(problems.length >= 1, name);
    assert.ok(problems.every(problem => /la página de un producto retirado lleva <(img|picture|source)/.test(problem.message)), `${name}\n${JSON.stringify(problems)}`);
  }
  // Fuera de la dirección de un producto, el aviso no hace de la página un retirado.
  assert.deepEqual(await check({ 'catalogo/index.html': doc('Catálogo', retiredMedia(remote('producto__img'))) }), []);
});
