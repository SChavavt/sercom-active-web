// Pruebas de las páginas de atención: la descripción que la solicitud especial agrega al borrador
// (requestDescription) y los textos compartidos de ayuda (src/lib/ayuda.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { contactLinks } from '../src/lib/contact.mjs';
import { requestDescription, withRequestDescription } from '../src/lib/contact-core.mjs';
import { displayQuery } from '../src/lib/search.mjs';
import { routes } from '../src/lib/routes.mjs';
import { faqs, helpEntries, helpEntry } from '../src/lib/ayuda.ts';

const descriptionLine = href => {
  const text = new URL(href).searchParams.get('text') ?? '';
  return text.split('\n').find(line => line.startsWith('Descripción o uso:'));
};

test('requestDescription deja la búsqueda en una línea, sin espacios sobrantes y con 200 caracteres como máximo', () => {
  assert.equal(requestDescription('guante'), 'guante');
  assert.equal(requestDescription('  guante\n para\tácido  '), 'guante para ácido');
  assert.equal(requestDescription('y'.repeat(500)), 'y'.repeat(200));
  assert.equal(requestDescription(`${'a'.repeat(199)} b`), 'a'.repeat(199));       // sin espacio final tras el corte
  assert.equal(requestDescription('<img src=x onerror=alert(1)>'), '<img src=x onerror=alert(1)>');   // texto, nunca HTML
});

test('requestDescription devuelve una cadena vacía cuando no hay texto útil', () => {
  for (const value of ['', '   ', '\n\t', null, undefined]) assert.equal(requestDescription(value), '', String(value));
});

test('la nota de la página muestra exactamente lo que entra en el borrador', () => {
  const empty = contactLinks.specialRequest();
  for (const query of ['guante', '  casco   blanco ', 'z'.repeat(500), '<b>negrita</b>', '100% algodón']) {
    const shown = requestDescription(query);
    assert.equal(descriptionLine(withRequestDescription(empty.whatsapp, shown)), `Descripción o uso: ${shown}`, query);
    assert.equal(withRequestDescription(empty.whatsapp, shown), withRequestDescription(empty.whatsapp, query), query);
    assert.equal(withRequestDescription(empty.mailto, shown), contactLinks.specialRequest({ query }).mailto, query);
  }
});

test('las cinco preguntas frecuentes son las del brief, tal cual', () => {
  assert.deepEqual(faqs.map(item => item.question), [
    '¿Por qué no aparecen precios?',
    '¿Todo está en existencia?',
    '¿Puedo pedir algo que no está aquí?',
    '¿Qué datos envío?',
    '¿Hacen productos personalizados?',
  ]);
  assert.equal(faqs[3].answer, 'Producto o descripción, cantidad y unidad; si aplica, talla, lugar de entrega y fecha requerida.');
  for (const item of faqs) assert.ok(item.answer.endsWith('.'), item.question);
});

test('las tres entradas de ayuda llevan a sus páginas', () => {
  assert.deepEqual(helpEntries.map(entry => [entry.title, entry.href]), [
    ['Explorar productos', routes.catalog],
    ['Cotizar mi lista', routes.quoteList],
    ['Ayúdame a encontrarlo', routes.specialRequest],
  ]);
  assert.equal(helpEntry('specialRequest').kicker, 'Solicitud especial');
  assert.throws(() => helpEntry(/** @type {any} */ ('otra')), /No existe la entrada/);
});

// Lo que no debe llegar nunca a la nota ni a los borradores (A-04).
const REMOVED = /[\uFFFD\p{Cc}\u00AD\u061C\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]|\p{Cs}/u;
const bodyOf = href => decodeURIComponent(href.slice(href.indexOf('body=') + 5));

test('requestDescription quita los controles de dirección, los de Cc, los invisibles y las mitades de un par sustituto', () => {
  assert.equal(requestDescription('guante ‮otreibua'), 'guante otreibua');
  assert.equal(requestDescription('‮guante \u0001bota​ azul‮'), 'guante bota azul');
  assert.equal(requestDescription('guan\u0000te\u0007 rojo\u007F'), 'guan te rojo');
  assert.equal(requestDescription('guan\uD83Ete'), 'guan te');
  assert.equal(requestDescription('guan�te'), 'guan te');
  // Solo caracteres quitados: no hay descripción, como sin ?q=.
  for (const value of ['‮', '\u0000​⁦⁩﻿', '\uD800 �']) assert.equal(requestDescription(value), '', JSON.stringify(value));
  // Árabe, hebreo y emojis con U+200D se conservan.
  for (const value of ['قفاز حماية', 'כפפה מגן', '👷🏽‍♀️ guante', 'می‌خواهم']) assert.equal(requestDescription(value), value);
});

test('la nota y el borrador muestran lo mismo que el catálogo, y los enlaces nunca llevan un carácter quitado', () => {
  const empty = contactLinks.specialRequest();
  for (const query of ['guante ‮otreibua', '⁦casco⁩ ‏blanco‎', 'gu​ante\u0000', '\u0085x\u009F', 'bota\uD83E', 'قفاز ‫حماية‬', `${'a‮'.repeat(150)}`]) {
    const shown = requestDescription(query);
    // Mientras quepa en 200 caracteres, la nota dice lo mismo que la línea de resultados del catálogo.
    if (Array.from(displayQuery(query)).length <= 200) assert.equal(shown, displayQuery(query), JSON.stringify(query));
    for (const href of [withRequestDescription(empty.whatsapp, query), withRequestDescription(empty.mailto, query), contactLinks.specialRequest({ query }).whatsapp, contactLinks.specialRequest({ query }).mailto]) {
      const message = href.startsWith('mailto:') ? bodyOf(href) : new URL(href).searchParams.get('text');
      assert.doesNotMatch(message.replace(/\r?\n/g, ' '), REMOVED, `${JSON.stringify(query)} → ${href.slice(0, 40)}`);
      assert.ok(message.includes(`Descripción o uso: ${shown}`), JSON.stringify(query));
    }
  }
});

test('el límite de 200 cuenta caracteres completos, también después de quitar los de control', () => {
  assert.equal(requestDescription('🧤'.repeat(300)), '🧤'.repeat(200));
  assert.equal(Array.from(requestDescription('👷🏽‍♀️'.repeat(100))).length, 200);
  // Cada U+202E se quita sin dejar espacio: «aaa…», 200 caracteres. Cada control pasa a ser un espacio: «a a a …»,
  // 200 caracteres sin espacio final.
  assert.equal(requestDescription('a‮'.repeat(300)), 'a'.repeat(200));
  const spaced = requestDescription('a\u0001'.repeat(300));
  assert.equal(Array.from(spaced).length, 199);
  assert.equal(spaced, Array(100).fill('a').join(' '));
  assert.equal(requestDescription(`${'‮'.repeat(50)}${'b'.repeat(250)}`), 'b'.repeat(200));
  assert.equal(requestDescription('x'.repeat(500)), 'x'.repeat(200));
});
