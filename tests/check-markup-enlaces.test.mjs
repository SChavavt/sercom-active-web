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

test('el texto oculto cuenta solo dentro del enlace que abre otra pestaña: fuera de él, ese enlace falla', async () => {
  const page = body => ({ 'marcas/marca-ficticia/index.html': doc('Marca ficticia', `<h1>Marca ficticia</h1>${body}`) });
  const bare = '<a href="https://fabricante.invalid/" target="_blank" rel="noopener noreferrer">Sitio del fabricante</a>';
  for (const body of [
    // En un hermano del enlace.
    `${bare}${NEW_TAB}`,
    `<p>${NEW_TAB}${bare}</p>`,
    // Dentro de otro enlace, que sí lo dice.
    `${external('https://fabricante.invalid/catalogo.pdf', 'Catálogo del fabricante (PDF)')}${bare}`,
  ]) {
    const problems = await check(page(body));
    assert.deepEqual(problems.map(problem => problem.message), [
      `el enlace «Sitio del fabricante» (https://fabricante.invalid/) abre otra pestaña sin decirlo: lleva el texto oculto «(se abre en otra pestaña)» (.vh), como MoreLink con external`,
    ], body);
  }
});

test('se revisa todo <a> o <area> que abre otra pestaña, con cualquier nombre de destino', async () => {
  const page = body => ({ 'marcas/marca-ficticia/index.html': doc('Marca ficticia', `<h1>Marca ficticia</h1>${body}`) });
  const bare = target => `<a href="https://fabricante.invalid/" target="${target}">Sitio del fabricante</a>`;
  // Abren otra pestaña: _blank escrito como sea, _new, un nombre cualquiera.
  for (const target of ['_blank', ' _BLANK ', '_new', 'nueva', 'catalogo']) {
    const messages = (await check(page(bare(target)))).map(problem => problem.message);
    assert.deepEqual(messages, [
      'el enlace «Sitio del fabricante» (https://fabricante.invalid/) abre otra pestaña sin rel="noopener": escribe rel="noopener noreferrer", como MoreLink con external',
      'el enlace «Sitio del fabricante» (https://fabricante.invalid/) abre otra pestaña sin decirlo: lleva el texto oculto «(se abre en otra pestaña)» (.vh), como MoreLink con external',
    ], target);
    // Con noopener y el texto oculto, pasa.
    assert.deepEqual(await check(page(`<a href="https://fabricante.invalid/" target="${target}" rel="noopener">Sitio del fabricante${NEW_TAB}</a>`)), [], target);
  }
  // No abren otra pestaña: sin target, vacío, _self, _parent o _top.
  for (const target of ['', '_self', '_PARENT', '_top']) assert.deepEqual(await check(page(bare(target))), [], JSON.stringify(target));
  assert.deepEqual(await check(page('<a href="https://fabricante.invalid/">Sitio del fabricante</a>')), []);
});

test('el texto oculto cuenta solo si el lector de pantalla lo lee', async () => {
  const page = body => ({ 'marcas/marca-ficticia/index.html': doc('Marca ficticia', `<h1>Marca ficticia</h1>${body}`) });
  const messages = async body => (await check(page(body))).map(problem => problem.message);
  // Dentro de aria-hidden="true", no se lee.
  for (const inner of [`<span aria-hidden="true">${NEW_TAB}</span>`, '<span class="vh" aria-hidden="true"> (se abre en otra pestaña)</span>']) {
    assert.deepEqual(await messages(`<a href="https://fabricante.invalid/" target="_blank" rel="noopener">Sitio del fabricante${inner}</a>`), [
      'el enlace «Sitio del fabricante» (https://fabricante.invalid/) abre otra pestaña sin decirlo: su texto oculto «(se abre en otra pestaña)» está dentro de aria-hidden="true" y no se lee; ponlo fuera, como MoreLink con external',
    ], inner);
  }
  // Con aria-label, el lector lee la etiqueta: ella debe decirlo.
  assert.deepEqual(await messages(`<a href="https://fabricante.invalid/" target="_blank" rel="noopener" aria-label="Sitio de Marca ficticia">Sitio del fabricante${NEW_TAB}</a>`), [
    'el enlace «Sitio de Marca ficticia» (https://fabricante.invalid/) abre otra pestaña y su aria-label no lo dice: el lector de pantalla lee la etiqueta y no el texto oculto; quita aria-label o termina la etiqueta con «(se abre en otra pestaña)»',
  ]);
  assert.deepEqual(await messages('<a href="https://fabricante.invalid/" target="_blank" rel="noopener" aria-label="Sitio de Marca ficticia (se abre en otra pestaña)">Sitio del fabricante</a>'), []);
  // aria-labelledby: falla, aunque el texto oculto esté.
  assert.deepEqual(await messages(`<span id="nombre">Sitio de Marca ficticia</span><a href="https://fabricante.invalid/" target="_blank" rel="noopener" aria-labelledby="nombre">Sitio del fabricante${NEW_TAB}</a>`), [
    'el enlace «Sitio del fabricante (se abre en otra pestaña)» (https://fabricante.invalid/) abre otra pestaña y toma su nombre de aria-labelledby: quítalo y deja el nombre y el texto oculto «(se abre en otra pestaña)» (.vh) dentro del enlace, como MoreLink con external',
  ]);
  // Un <area> no puede llevar el texto oculto.
  assert.deepEqual(await messages('<map name="m"><area href="https://fabricante.invalid/" target="_blank" rel="noopener" alt="Sitio del fabricante" shape="rect" coords="0,0,10,10"></map>'), [
    'el área «Sitio del fabricante» (https://fabricante.invalid/) abre otra pestaña: un <area> no puede llevar el texto oculto «(se abre en otra pestaña)»; usa un enlace (<a>), como MoreLink con external',
  ]);
  assert.deepEqual(await messages('<map name="m"><area href="https://fabricante.invalid/" alt="Sitio del fabricante" shape="rect" coords="0,0,10,10"></map>'), []);
});

test('en /marcas/ dos destinos que difieren solo en la diagonal final son el mismo lugar; con un fragmento, no', async () => {
  const list = links => ({ 'marcas/index.html': doc('Marcas', `<h1>Marcas</h1>${links}`) });
  assert.deepEqual(await check(list('<a href="/marcas/alfa/">Alfa</a><a href="/marcas/alfa">Alfa</a>')), []);
  assert.deepEqual(await check(list('<a href="/marcas/alfa/?x=1">Alfa</a><a href="/marcas/alfa?x=1">Alfa</a>')), []);
  assert.deepEqual((await check(list('<a href="/marcas/#catalogos">Catálogos</a><a href="/marcas/">Catálogos</a>'))).map(problem => problem.message), [
    'dos enlaces se llaman «Catálogos» y llevan a lugares distintos (/marcas/#catalogos y /marcas/): agrega a cada uno, con texto oculto, lo que los distingue (la marca)',
  ]);
  assert.equal((await check(list('<a href="/marcas/alfa/">Alfa</a><a href="/marcas/beta/">Alfa</a>'))).length, 1);
});

test('el target se lee como está escrito: con un espacio o un tabulador, abre otra pestaña', async () => {
  const page = body => ({ 'marcas/marca-ficticia/index.html': doc('Marca ficticia', `<h1>Marca ficticia</h1>${body}`) });
  const bare = target => `<a href="https://fabricante.invalid/" target="${target}">Sitio del fabricante</a>`;
  for (const target of [' _self', '_self ', '_top ', '\t_parent', ' ', '\t']) {
    assert.deepEqual((await check(page(bare(target)))).map(problem => problem.message), [
      'el enlace «Sitio del fabricante» (https://fabricante.invalid/) abre otra pestaña sin rel="noopener": escribe rel="noopener noreferrer", como MoreLink con external',
      'el enlace «Sitio del fabricante» (https://fabricante.invalid/) abre otra pestaña sin decirlo: lleva el texto oculto «(se abre en otra pestaña)» (.vh), como MoreLink con external',
    ], JSON.stringify(target));
  }
  // Siguen en la misma pestaña: vacío y _self, _parent o _top con cualquier mayúscula.
  for (const target of ['', '_SELF', '_Self', '_Parent', '_TOP']) assert.deepEqual(await check(page(bare(target))), [], JSON.stringify(target));
});

test('el texto oculto no cuenta si algo entre él y el enlace lo esconde o lo saca del enlace, y dice qué', async () => {
  const page = body => ({ 'marcas/marca-ficticia/index.html': doc('Marca ficticia', `<h1>Marca ficticia</h1>${body}`) });
  const messages = async body => (await check(page(body))).map(problem => problem.message);
  const link = inner => `<a href="https://fabricante.invalid/" target="_blank" rel="noopener">Sitio del fabricante${inner}</a>`;
  // El nombre del enlace en el mensaje es el que calcula la revisión (accessibleName): lleva el texto oculto.
  const start = (name = 'Sitio del fabricante (se abre en otra pestaña)') => `el enlace «${name}» (https://fabricante.invalid/) abre otra pestaña sin decirlo: su texto oculto «(se abre en otra pestaña)» `;
  const cases = [
    ['<span class="vh" hidden> (se abre en otra pestaña)</span>', 'está escondido con el atributo hidden y no se lee; ponlo fuera, como MoreLink con external'],
    [`<span hidden="">${NEW_TAB}</span>`, 'está escondido con el atributo hidden y no se lee; ponlo fuera, como MoreLink con external'],
    ['<span class="vh" style="display:none"> (se abre en otra pestaña)</span>', 'está escondido con style="display:none" y no se lee; ponlo fuera, como MoreLink con external'],
    [`<span style="color: red; DISPLAY: None !important">${NEW_TAB}</span>`, 'está escondido con style="display:none" y no se lee; ponlo fuera, como MoreLink con external'],
    [`<span style="visibility:hidden">${NEW_TAB}</span>`, 'está escondido con style="visibility:hidden" y no se lee; ponlo fuera, como MoreLink con external'],
    [`<span><span style="visibility: collapse">${NEW_TAB}</span></span>`, 'está escondido con style="visibility:collapse" y no se lee; ponlo fuera, como MoreLink con external'],
    [`<template>${NEW_TAB}</template>`, 'está dentro de un <template>, que el navegador no muestra ni lee; ponlo fuera, como MoreLink con external'],
    [`<a href="/marcas/">otra${NEW_TAB}</a>`, 'está dentro de otro enlace (<a>), y el navegador cierra el primero donde empieza el segundo; ponlo en el enlace mismo, como MoreLink con external', 'Sitio del fabricante otra (se abre en otra pestaña)'],
    // Otro <a> que empieza dentro del enlace antes del texto oculto: el navegador cierra ahí el primero, y el texto queda fuera.
    [`<a href="/marcas/">otra</a>${NEW_TAB}`, 'va después de otro enlace (<a>) que empieza dentro de este, y el navegador cierra el primero donde empieza el segundo; ponlo antes de ese enlace, como MoreLink con external', 'Sitio del fabricante otra (se abre en otra pestaña)'],
    [`<span><a href="/marcas/">otra</a></span><span>${NEW_TAB}</span>`, 'va después de otro enlace (<a>) que empieza dentro de este, y el navegador cierra el primero donde empieza el segundo; ponlo antes de ese enlace, como MoreLink con external', 'Sitio del fabricante otra (se abre en otra pestaña)'],
    // El texto oculto escrito él mismo como un <a>.
    ['<a class="vh" href="#"> (se abre en otra pestaña)</a>', 'es él mismo un enlace (<a>), y el navegador cierra el primero donde empieza el segundo; escríbelo en un <span>, como MoreLink con external'],
    // Dentro de un elemento con el atributo inert, que sale del árbol de accesibilidad.
    [`<span inert>${NEW_TAB}</span>`, 'está dentro de un elemento con el atributo inert y no se lee; ponlo fuera, como MoreLink con external'],
    ['<span class="vh" inert=""> (se abre en otra pestaña)</span>', 'está dentro de un elemento con el atributo inert y no se lee; ponlo fuera, como MoreLink con external'],
  ];
  for (const [inner, reason, name] of cases) assert.deepEqual(await messages(link(inner)), [start(name) + reason], inner);
  // Siguen pasando: el texto oculto visible en un <span> dentro de un <span>, y con atributos que no lo esconden.
  for (const inner of [`<span><span>${NEW_TAB}</span></span>`, `<span style="display:inline" aria-hidden="false">${NEW_TAB}</span>`,
    `<span style="visibility:visible">${NEW_TAB}</span>`, `<span data-hidden="true">${NEW_TAB}</span>`, `<span data-inert>${NEW_TAB}</span>`]) {
    assert.deepEqual(await messages(link(inner)), [], inner);
  }
  // Otro <a> que empieza después del texto oculto no lo saca del enlace: el navegador cierra el primero ya con su texto.
  assert.deepEqual(await messages(link(`${NEW_TAB}<a href="/marcas/">otra</a>`)), []);
  // Con un aviso que se lee y otro que no, pasa.
  assert.deepEqual(await messages(link(`${NEW_TAB}<span hidden>${NEW_TAB}</span>`)), []);
});

test('un <base> con un target que abre otra pestaña falla: con él, cada enlace sin target la abre sin decirlo', async () => {
  const withBase = (base, body) => ({ 'marcas/marca-ficticia/index.html': `<!doctype html><html lang="es-MX"><head><meta charset="utf-8">${base}<title>Marca ficticia · Sercom Active</title></head><body>`
    + `<div class="sheet"><main id="contenido"><h1>Marca ficticia</h1>${body}</main></div></body></html>` });
  const plain = '<a href="https://fabricante.invalid/" rel="noopener">Sitio del fabricante</a>';
  for (const target of ['_blank', '_BLANK', ' _self', 'nueva']) {
    assert.deepEqual((await check(withBase(`<base target="${target}">`, plain))).map(problem => [problem.id, problem.file, problem.message]), [[
      'R-ENLACE-01', 'marcas/marca-ficticia/index.html',
      `la página lleva <base target="${target}">: con él, cada enlace sin target abre otra pestaña sin decirlo; quítalo y pon el target en cada enlace que lo necesite, como MoreLink con external`,
    ]], target);
  }
  // Un <base> sin target, o con uno que deja el enlace en la misma pestaña, no cambia nada.
  for (const base of ['<base href="/">', '<base target="">', '<base target="_self">', '<base target="_TOP" href="/">', '']) assert.deepEqual(await check(withBase(base, plain)), [], base);
});
