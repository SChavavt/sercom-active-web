import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CHECKS, checkMarkup } from '../scripts/check-markup.mjs';
import { makeTree, removeTree, ROOT } from './helpers.mjs';

// La comprobación de los enlaces a otro sitio (R-ENLACE-01) de scripts/check-markup.mjs: un enlace que abre otra
// pestaña lleva rel con noopener y el texto oculto «(se abre en otra pestaña)», y en /marcas/ dos enlaces con el mismo
// nombre accesible llevan al mismo lugar. Enlaces y marcas de prueba, en un sitio ficticio.
const LINK_CHECKS = CHECKS.filter(check => check.id === 'R-ENLACE-01');

const doc = (title, body) => `<!doctype html><html lang="es-MX"><head><meta charset="utf-8"><title>${title} · Sercom Active</title></head><body>`
  + `<div class="sheet"><main id="contenido">${body}</main></div></body></html>`;
const NEW_TAB = '<span class="vh"> (se abre en otra pestaña)</span>';
// Lo que imprime MoreLink con external, con texto oculto opcional antes del aviso.
const external = (href, label, { rel = 'noopener noreferrer', hidden = '', tab = NEW_TAB } = {}) =>
  `<a class="more" href="${href}" target="_blank" rel="${rel}"><span>${label}${hidden}${tab}</span><svg class="icon" aria-hidden="true" width="20" height="20"></svg></a>`;
const row = (brand, links) => `<li class="catalog-sources__row grid12"><div class="cell span-4"><a href="/marcas/${brand.toLowerCase()}/">${brand}</a></div><div class="cell span-8">${links}</div></li>`;

async function check(files) {
  const directory = await makeTree({ 'index.html': doc('Inicio', '<h1>Inicio</h1>'), ...files });
  try {
    return (await checkMarkup(directory, { checks: LINK_CHECKS })).problems;
  } finally {
    await removeTree(directory);
  }
}

test('la comprobación de los enlaces a otro sitio está en CHECKS, documentada en el script', async () => {
  assert.deepEqual(LINK_CHECKS.map(entry => entry.id), ['R-ENLACE-01']);
  assert.ok(LINK_CHECKS[0].title.length > 40);
  const source = await readFile(join(ROOT, 'scripts', 'check-markup.mjs'), 'utf8');
  assert.match(source, /\/\/ R-ENLACE-01 · /);
});

test('un enlace que abre otra pestaña con noopener y el texto oculto pasa; sin uno de los dos, falla', async () => {
  const page = link => ({ 'marcas/marca-ficticia/index.html': doc('Marca ficticia', `<h1>Marca ficticia</h1>${link}`) });
  assert.deepEqual(await check(page(external('https://fabricante.invalid/catalogo.pdf', 'Catálogo del fabricante (PDF)'))), []);
  // ActionRow con external: el mismo aviso dentro de la fila.
  assert.deepEqual(await check(page(`<a class="action cell-link" href="https://fabricante.invalid/" target="_blank" rel="noreferrer noopener"><span>Catálogo en línea del fabricante${NEW_TAB}</span></a>`)), []);
  // Un enlace que no abre otra pestaña no se revisa aquí.
  assert.deepEqual(await check(page('<a href="https://fabricante.invalid/">Sitio</a>')), []);
  for (const [link, message] of [
    [external('https://fabricante.invalid/', 'Sitio del fabricante', { rel: 'noreferrer' }), /abre otra pestaña sin rel="noopener"/],
    [external('https://fabricante.invalid/', 'Sitio del fabricante', { rel: '' }), /abre otra pestaña sin rel="noopener"/],
    [external('https://fabricante.invalid/', 'Sitio del fabricante', { tab: '' }), /abre otra pestaña sin decirlo: lleva el texto oculto «\(se abre en otra pestaña\)»/],
    // El aviso a la vista, sin .vh, tampoco es el texto oculto que piden MoreLink y ActionRow.
    [external('https://fabricante.invalid/', 'Sitio del fabricante', { tab: ' (se abre en otra pestaña)' }), /sin decirlo/],
    ['<a href="https://fabricante.invalid/" target="_BLANK">Sitio del fabricante</a>', /sin rel="noopener"/],
  ]) {
    const problems = await check(page(link));
    assert.ok(problems.length >= 1, link);
    assert.ok(problems.every(problem => problem.id === 'R-ENLACE-01' && problem.file === 'marcas/marca-ficticia/index.html'));
    assert.match(problems.map(problem => problem.message).join('\n'), message, link);
  }
});

test('en /marcas/ dos enlaces con el mismo nombre accesible llevan al mismo lugar: cada catálogo lleva su marca', async () => {
  const list = rows => ({ 'marcas/index.html': doc('Marcas', `<h1>Marcas</h1><ul class="brands"><li><a href="/marcas/alfa/">Alfa</a></li><li><a href="/marcas/beta/">Beta</a></li></ul><ul class="catalog-sources">${rows}</ul>`) });
  const good = row('Alfa', external('https://alfa.invalid/catalogo.pdf', 'Catálogo del fabricante (PDF)', { hidden: '<span class="vh">, Alfa</span>' }))
    + row('Beta', external('https://beta.invalid/catalogo.pdf', 'Catálogo del fabricante (PDF)', { hidden: '<span class="vh">, Beta</span>' }));
  // La celda de la marca y su nombre en la lista llevan al mismo lugar: pasa.
  assert.deepEqual(await check(list(good)), []);
  // Sin la marca en el nombre, dos catálogos se llaman igual y llevan a sitios distintos.
  const bad = row('Alfa', external('https://alfa.invalid/catalogo.pdf', 'Catálogo del fabricante (PDF)'))
    + row('Beta', external('https://beta.invalid/catalogo.pdf', 'Catálogo del fabricante (PDF)'));
  const problems = await check(list(bad));
  assert.deepEqual(problems.map(problem => problem.id), ['R-ENLACE-01']);
  assert.match(problems[0].message, /^dos enlaces se llaman «Catálogo del fabricante \(PDF\) \(se abre en otra pestaña\)» y llevan a lugares distintos \(https:\/\/alfa\.invalid\/catalogo\.pdf y https:\/\/beta\.invalid\/catalogo\.pdf\)/);
  // Un aria-label cuenta como el nombre.
  assert.equal((await check(list('<a href="/marcas/alfa/">Alfa</a><a href="/marcas/beta/" aria-label="Alfa">Ver</a>'))).length, 1);
  // Fuera de /marcas/ y fuera de <main> no se compara (el encabezado y el pie repiten «Catálogo» o «WhatsApp»).
  assert.deepEqual(await check({ 'catalogo/index.html': doc('Catálogo', `<h1>Catálogo</h1><ul>${bad}</ul>`) }), []);
  assert.deepEqual(await check({ 'marcas/index.html': `<!doctype html><html lang="es-MX"><head><title>Marcas</title></head><body><header><a href="/a/">Ver</a></header><main id="contenido"><h1>Marcas</h1><a href="/b/">Ver</a></main></body></html>` }), []);
});
