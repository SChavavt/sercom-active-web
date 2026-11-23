// Pruebas de las funciones puras de src/lib/message-page.mjs: qué `href` llevan los enlaces de mensaje de una página que
// arma UN mensaje (cotizar, solicitud especial) y los demás enlaces de WhatsApp y de correo de esa página.
import test from 'node:test';
import assert from 'node:assert/strict';
import { contactLinks } from '../src/lib/contact.mjs';
import { composeListMessage, LINK_LIMITS, messageOf, withMessage } from '../src/lib/contact-core.mjs';
import { messageLinkHrefs, otherLinkHref } from '../src/lib/message-page.mjs';

const list = contactLinks.list();
const general = contactLinks.general();
const originals = [list.whatsapp, list.mailto, '/catalogo/'];
const template = messageOf(list.whatsapp);

test('importar el módulo no toca el navegador', async () => {
  // Corre en Node, sin `document` ni `window`: si el módulo hiciera algo al importarse, esta prueba no llegaría aquí.
  const module = await import('../src/lib/message-page.mjs');
  assert.equal(typeof module.createMessagePage, 'function');
});

test('con el mensaje igual a la plantilla, los enlaces quedan exactamente como se imprimieron', () => {
  assert.equal(template, composeListMessage({ opening: template.split('\n')[0] }));
  const state = messageLinkHrefs(originals, template, template);
  assert.deepEqual(state, { hrefs: originals, fits: true, changed: false });
});

test('un mensaje que cabe va en todos los enlaces de WhatsApp y de correo; los demás no cambian', () => {
  const message = composeListMessage({ opening: template.split('\n')[0], items: ['Marca EJ-1 (Guante), 12 pares'] });
  const state = messageLinkHrefs(originals, message, template);
  assert.equal(state.fits, true);
  assert.equal(state.changed, true);
  assert.equal(messageOf(state.hrefs[0]), message);
  assert.equal(messageOf(state.hrefs[1]), message);
  assert.ok(state.hrefs[1].includes(`subject=${encodeURIComponent('Lista para cotizar')}`), 'el correo conserva su asunto');
  assert.equal(state.hrefs[2], '/catalogo/');
});

test('un mensaje que no cabe en un enlace deja TODOS los enlaces sin texto', () => {
  const items = Array.from({ length: 40 }, (_, index) => `Marca larga EJ-${index} (Un nombre de producto bastante largo), 12 pares, Talla 8 (EJ-${index}-8)`);
  const message = composeListMessage({ opening: template.split('\n')[0], items });
  assert.ok(encodeURIComponent(message).length > LINK_LIMITS.whatsapp);
  const state = messageLinkHrefs(originals, message, template);
  assert.equal(state.fits, false);
  assert.equal(state.changed, true);
  assert.equal(messageOf(state.hrefs[0]), '');
  assert.equal(messageOf(state.hrefs[1]), '');
  assert.ok(state.hrefs[0].startsWith('https://wa.me/') && !state.hrefs[0].includes('?'));
  assert.equal(state.hrefs[2], '/catalogo/');
});

test('si el mensaje cabe en el enlace de WhatsApp pero no en el de correo, NINGUNO lleva el texto', () => {
  // Con el mismo mensaje el enlace de correo es más largo (lleva el asunto). Se busca un mensaje justo entre los dos
  // límites: cada enlace decidiendo por su cuenta dejaría el texto en el de WhatsApp, y la regla de la página es todos
  // o ninguno.
  const opening = template.split('\n')[0];
  let mixed = '';
  for (let length = 1; length <= 3000 && !mixed; length += 1) {
    const message = composeListMessage({ opening, note: 'ñ'.repeat(length) });
    if (withMessage(list.whatsapp, message).length <= LINK_LIMITS.whatsapp && withMessage(list.mailto, message).length > LINK_LIMITS.mailto) mixed = message;
  }
  assert.ok(mixed, 'no se encontró un mensaje que quepa en WhatsApp y no en el correo: revisar esta prueba si cambiaron los límites');
  const state = messageLinkHrefs(originals, mixed, template);
  assert.equal(state.fits, false);
  assert.equal(state.changed, true);
  assert.equal(messageOf(state.hrefs[0]), '', 'el enlace de WhatsApp tampoco lleva el texto');
  assert.equal(messageOf(state.hrefs[1]), '');
  assert.ok(state.hrefs[0].startsWith('https://wa.me/') && !state.hrefs[0].includes('?'));
  assert.equal(state.hrefs[2], '/catalogo/');
});

test('los demás enlaces toman el de la acción de su canal en cuanto el mensaje cambió, también en el estado largo', () => {
  const sends = { whatsapp: `${list.whatsapp}x`, mailto: `${list.mailto}y` };
  assert.equal(otherLinkHref(general.whatsapp, sends, { fits: true, changed: true }), sends.whatsapp);
  assert.equal(otherLinkHref(general.mailto, sends, { fits: true, changed: true }), sends.mailto);
  // Nada escrito ni agregado todavía: el impreso.
  assert.equal(otherLinkHref(general.whatsapp, sends, { fits: true, changed: false }), general.whatsapp);
  // Estado largo: el de la acción, que ya va sin texto; nunca el saludo general impreso.
  const long = messageLinkHrefs([list.whatsapp, list.mailto], 'x'.repeat(LINK_LIMITS.whatsapp + LINK_LIMITS.mailto), template);
  assert.equal(long.fits, false);
  const longSends = { whatsapp: long.hrefs[0], mailto: long.hrefs[1] };
  assert.equal(otherLinkHref(general.whatsapp, longSends, { fits: false, changed: true }), longSends.whatsapp);
  assert.equal(otherLinkHref(general.mailto, longSends, { fits: false, changed: true }), longSends.mailto);
  assert.equal(messageOf(otherLinkHref(general.whatsapp, longSends, { fits: false, changed: true })), '');
  // Otro tipo de enlace: el suyo. Un canal sin acción: el impreso mientras cabe y, en el estado largo, sin texto.
  assert.equal(otherLinkHref('/cotizar/', sends, { fits: true, changed: true }), '/cotizar/');
  assert.equal(otherLinkHref('/cotizar/', sends, { fits: false, changed: true }), '/cotizar/');
  assert.equal(otherLinkHref(general.mailto, { whatsapp: sends.whatsapp }, { fits: true, changed: true }), general.mailto);
  const bare = otherLinkHref(general.mailto, { whatsapp: sends.whatsapp }, { fits: false, changed: true });
  assert.equal(messageOf(bare), '');
  assert.ok(bare.startsWith(general.mailto.split('?')[0]), 'el mismo destinatario');
});
