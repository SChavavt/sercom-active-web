// Pruebas de las páginas de atención: la descripción que la solicitud especial agrega al borrador
// (requestDescription) y los textos compartidos de ayuda (src/lib/ayuda.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { contactLinks } from '../src/lib/contact.mjs';
import { requestDescription, withRequestDescription } from '../src/lib/contact-core.mjs';
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
