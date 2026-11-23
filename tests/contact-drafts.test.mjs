// Borradores que arma el navegador sobre los enlaces ya construidos: leer y cambiar el mensaje, completar líneas,
// el límite de largo de los enlaces y el mensaje de la lista.
import test from 'node:test';
import assert from 'node:assert/strict';
import { contactLinks, messages } from '../src/lib/contact.mjs';
import {
  cleanLines, composeListMessage, draftLink, draftLinks, LINK_LIMITS, linkChannel, listItem, MESSAGE_LABELS, messageOf, withFieldValues, withMessage,
  withPageLink, withRequestDescription,
} from '../src/lib/contact-core.mjs';
import { loadProjectData } from './helpers.mjs';

const { business } = await loadProjectData();
const WHATSAPP = `https://wa.me/${business.whatsappDigits}`;
const MAILTO = `mailto:${business.email}`;
const product = { brandName: 'Marca Alfa', code: 'SP-100', name: 'Guante sintético de prueba' };
const pageUrl = 'https://sitio.example/productos/guante-sintetico/';
const text = (...lines) => lines.join('\n');
const list = contactLinks.list();
const opening = messageOf(list.whatsapp).split('\n')[0];
/** Largo de texto con el que el enlace mide exactamente `length` caracteres (texto de letras «a», sin codificar). */
const fill = (href, length) => 'a'.repeat(length - withMessage(href, 'a').length + 1);

test('MESSAGE_LABELS y LINK_LIMITS', () => {
  assert.deepEqual(MESSAGE_LABELS, {
    link: 'Enlace', variant: 'Variante (talla o color)', quantity: 'Cantidad y unidad', also: 'También necesito',
    delivery: 'Entrega en (ciudad o código postal)', date: 'Fecha requerida', description: 'Descripción o uso', model: 'Marca o modelo (si lo tengo)',
  });
  assert.deepEqual(LINK_LIMITS, { whatsapp: 1900, mailto: 1900 });
  assert.ok(Object.isFrozen(MESSAGE_LABELS) && Object.isFrozen(LINK_LIMITS));
  // Las plantillas usan esas etiquetas.
  const lines = messages.product({ ...product, url: pageUrl }).split('\n');
  for (const key of ['variant', 'quantity', 'delivery', 'date', 'also', 'link']) assert.ok(lines.some(line => line.startsWith(`${MESSAGE_LABELS[key]}:`)), key);
  const special = messages.specialRequest().split('\n');
  for (const key of ['description', 'model', 'quantity', 'delivery', 'date']) assert.ok(special.some(line => line.startsWith(`${MESSAGE_LABELS[key]}:`)), key);
});

test('linkChannel', () => {
  assert.equal(linkChannel(list.whatsapp), 'whatsapp');
  assert.equal(linkChannel(WHATSAPP), 'whatsapp');
  assert.equal(linkChannel(list.mailto), 'mailto');
  assert.equal(linkChannel(MAILTO), 'mailto');
  for (const href of ['https://www.ansell.com/', '/cotizar/', 'tel:+52', '', null, undefined, 'https://api.whatsapp.com/send?text=x', 'MAILTO:x@y.z']) assert.equal(linkChannel(href), null, String(href));
});

test('messageOf y withMessage van y vuelven en los dos canales, con caracteres especiales y saltos de línea', () => {
  const message = 'Hola. ¿Tienen señalización & conos #71? 100% + guantes 🧤\nCantidad: 10 pares\n\nÚltima línea';
  for (const href of [list.whatsapp, list.mailto, WHATSAPP, MAILTO]) {
    const rewritten = withMessage(href, message);
    assert.equal(messageOf(rewritten), message, href);
    assert.equal(linkChannel(rewritten), linkChannel(href));
  }
  // El correo conserva su asunto y escribe los saltos de línea como %0D%0A.
  const mail = withMessage(list.mailto, 'Uno\nDos');
  assert.ok(mail.startsWith(`${MAILTO}?subject=${encodeURIComponent('Lista para cotizar')}&body=`), mail);
  assert.ok(mail.includes('Uno%0D%0ADos'));
  // WhatsApp: el mismo número.
  assert.ok(withMessage(list.whatsapp, 'Hola').startsWith(`${WHATSAPP}?text=`));
  // El mensaje de la plantilla se lee tal cual.
  assert.equal(messageOf(list.whatsapp), messages.list());
  assert.equal(messageOf(list.mailto), messages.list());
});

test('una mitad suelta de un par sustituto no rompe el enlace', () => {
  for (const href of [list.whatsapp, list.mailto]) {
    let rewritten = '';
    assert.doesNotThrow(() => { rewritten = withMessage(href, 'guante \uD83E roto'); });
    assert.equal(messageOf(rewritten), 'guante  roto');
  }
});

test('withMessage con texto vacío deja el enlace sin texto', () => {
  assert.equal(withMessage(list.whatsapp, ''), WHATSAPP);
  assert.equal(withMessage(list.mailto, ''), `${MAILTO}?subject=${encodeURIComponent('Lista para cotizar')}`);
  assert.equal(withMessage(list.whatsapp, null), WHATSAPP);
  assert.equal(messageOf(WHATSAPP), '');
  assert.equal(messageOf(MAILTO), '');
});

test('un enlace que no es de los dos canales, o uno mal formado, vuelve igual', () => {
  for (const href of ['https://www.ansell.com/mx/es/industrial?text=hola', '/cotizar/', '#', 'tel:+5212214002219']) {
    assert.equal(withMessage(href, 'Hola'), href);
    assert.equal(withFieldValues(href, { [MESSAGE_LABELS.quantity]: '12' }), href);
    assert.equal(messageOf(href), '');
  }
  const broken = `${WHATSAPP}?text=%E0%A4%A`;
  assert.equal(withMessage(broken, 'Hola'), broken);
  assert.equal(messageOf(broken), '');
  assert.equal(withFieldValues(broken, { x: 'y' }), broken);
  assert.equal(withMessage(undefined, 'Hola'), '');
});

test('withFieldValues completa las líneas del mensaje de producto y de solicitud especial', () => {
  const links = contactLinks.product(product);
  const values = { [MESSAGE_LABELS.variant]: 'Talla 8 (SP-100-8)', [MESSAGE_LABELS.quantity]: '12 pares' };
  for (const href of [links.whatsapp, links.mailto]) {
    const filled = withFieldValues(href, values);
    assert.equal(messageOf(filled), text(
      'Hola, Yosmara. Quiero solicitar una cotización con Sercom Active.',
      'Producto: Marca Alfa SP-100 (Guante sintético de prueba)',
      'Variante (talla o color): Talla 8 (SP-100-8)',
      'Cantidad y unidad: 12 pares',
      'Entrega en (ciudad o código postal): ',
      'Fecha requerida: ',
      'También necesito: ',
    ));
    // Idempotente; vaciar una línea; etiquetas desconocidas ignoradas; nunca agrega una línea.
    assert.equal(withFieldValues(filled, values), filled);
    assert.equal(withFieldValues(filled, { [MESSAGE_LABELS.quantity]: '' }), withFieldValues(href, { [MESSAGE_LABELS.variant]: 'Talla 8 (SP-100-8)' }));
    assert.equal(withFieldValues(href, { 'No existe': 'x', Producto2: 'y' }), href);
    assert.equal(messageOf(withFieldValues(href, { 'No existe': 'x' })).split('\n').length, messageOf(href).split('\n').length);
    // Un texto con saltos de línea queda en una sola línea; el valor se recorta a 1000 caracteres.
    const multi = messageOf(withFieldValues(href, { [MESSAGE_LABELS.also]: 'Uno\nDos\r\n  Tres\u202E' }));
    assert.equal(multi.split('\n').at(-1), 'También necesito: Uno Dos Tres');
    const long = messageOf(withFieldValues(href, { [MESSAGE_LABELS.also]: '🧤'.repeat(1200) })).split('\n').at(-1);
    assert.equal(Array.from(long.slice('También necesito: '.length)).length, 1000);
    assert.ok(!/\p{Cs}/u.test(long.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')));
  }
  // La solicitud especial: completa varias líneas a la vez.
  const special = contactLinks.specialRequest();
  const filled = withFieldValues(special.whatsapp, { [MESSAGE_LABELS.description]: 'guante para ácido', [MESSAGE_LABELS.model]: 'SP-100', [MESSAGE_LABELS.delivery]: 'Puebla' });
  assert.deepEqual(messageOf(filled).split('\n').slice(1, 5), ['Descripción o uso: guante para ácido', 'Marca o modelo (si lo tengo): SP-100', 'Cantidad y unidad: ', 'Entrega en (ciudad o código postal): Puebla']);
  // Las líneas que no están en values quedan como estaban.
  assert.equal(messageOf(filled).split('\n').at(-1), 'Puedo enviar una foto o archivo en esta conversación.');
});

test('withFieldValues sobre un enlace de producto que ya trae la línea «Enlace»', () => {
  const href = withPageLink(contactLinks.product(product).whatsapp, pageUrl);
  const filled = withFieldValues(href, { [MESSAGE_LABELS.quantity]: '3 cajas', [MESSAGE_LABELS.link]: 'https://otro.example/' });
  const lines = messageOf(filled).split('\n');
  assert.ok(lines.includes('Cantidad y unidad: 3 cajas'));
  assert.ok(lines.includes('Enlace: https://otro.example/'));
  assert.equal(lines.length, messageOf(href).split('\n').length);
  // Sin tocar la línea «Enlace»: sigue la de la página.
  assert.ok(messageOf(withFieldValues(href, { [MESSAGE_LABELS.quantity]: '3 cajas' })).split('\n').includes(`Enlace: ${pageUrl}`));
  // withRequestDescription sigue igual.
  assert.equal(withRequestDescription(contactLinks.specialRequest().whatsapp, 'guante'), contactLinks.specialRequest({ query: 'guante' }).whatsapp);
});

test('draftLink justo por debajo y justo por encima del límite, en los dos canales', () => {
  for (const [href, channel] of [[list.whatsapp, 'whatsapp'], [list.mailto, 'mailto']]) {
    const fits = fill(href, LINK_LIMITS[channel]);
    const full = withMessage(href, fits);
    assert.equal(full.length, LINK_LIMITS[channel], channel);
    assert.deepEqual(draftLink(href, fits), { href: full, fits: true }, channel);
    assert.deepEqual(draftLink(href, `${fits}a`), { href: withMessage(href, ''), fits: false }, channel);
  }
  // Para el mismo texto, el enlace de correo es más largo (dirección, asunto y saltos de línea como %0D%0A).
  const sample = 'Uno\nDos\nTres';
  assert.ok(withMessage(list.mailto, sample).length > withMessage(list.whatsapp, sample).length);
  // Un enlace que no es de ninguno de los dos canales pasa igual.
  assert.deepEqual(draftLink('/cotizar/', 'x'.repeat(5000)), { href: '/cotizar/', fits: true });
});

test('draftLinks: todos caben, o ninguno lleva texto', () => {
  const hrefs = [list.whatsapp, list.mailto, '/catalogo/'];
  const short = draftLinks(hrefs, 'Hola');
  assert.deepEqual(short, { hrefs: [withMessage(list.whatsapp, 'Hola'), withMessage(list.mailto, 'Hola'), '/catalogo/'], fits: true });
  // Un texto que cabe en WhatsApp pero no en el correo: ninguno lleva texto.
  const between = fill(list.whatsapp, LINK_LIMITS.whatsapp);
  assert.equal(draftLink(list.whatsapp, between).fits, true);
  assert.equal(draftLink(list.mailto, between).fits, false);
  assert.deepEqual(draftLinks(hrefs, between), { hrefs: [WHATSAPP, withMessage(list.mailto, ''), '/catalogo/'], fits: false });
  assert.deepEqual(draftLinks([], 'x'), { hrefs: [], fits: true });
});

test('composeListMessage en sus cinco formas, con entrega y fecha', () => {
  const items = [
    listItem({ ...product, quantity: '12 pares', variant: 'Talla 8 (SP-100-8)' }),
    listItem({ brandName: 'Marca Beta', code: 'SP-300', name: 'Respirador sintético', quantity: '3 cajas', variant: '' }),
  ];
  assert.deepEqual(items, ['Marca Alfa SP-100 (Guante sintético de prueba), 12 pares, Talla 8 (SP-100-8)', 'Marca Beta SP-300 (Respirador sintético), 3 cajas']);
  // 1. Nada: la plantilla de siempre.
  assert.equal(composeListMessage({ opening }), messages.list());
  assert.equal(composeListMessage({ opening, items: [], note: '  \n \n', delivery: ' ', date: '' }), messages.list());
  // 2. Con productos.
  assert.equal(composeListMessage({ opening, items }), text(
    opening, `1. ${items[0]}`, `2. ${items[1]}`, 'Entrega en (ciudad o código postal): ', 'Fecha requerida: ',
  ));
  // 3. Productos y una línea de texto.
  assert.equal(composeListMessage({ opening, items, note: ' Guantes de carnaza ', delivery: ' Puebla,\n72000 ', date: 'Antes del 15' }), text(
    opening, `1. ${items[0]}`, `2. ${items[1]}`, 'También necesito: Guantes de carnaza', 'Entrega en (ciudad o código postal): Puebla, 72000', 'Fecha requerida: Antes del 15',
  ));
  // 4. Productos y un texto de varias líneas.
  assert.equal(composeListMessage({ opening, items, note: 'Guantes de carnaza\n\n\n10 cascos blancos\n' }), text(
    opening, `1. ${items[0]}`, `2. ${items[1]}`, 'También necesito:', 'Guantes de carnaza', '', '10 cascos blancos', 'Entrega en (ciudad o código postal): ', 'Fecha requerida: ',
  ));
  // 5. Texto sin productos: sigue a la apertura, sin «También necesito».
  assert.equal(composeListMessage({ opening, note: '20 pares de guantes\n5 cascos', delivery: 'Puebla' }), text(
    opening, '20 pares de guantes', '5 cascos', 'Entrega en (ciudad o código postal): Puebla', 'Fecha requerida: ',
  ));
  // Entrega y fecha: una línea cada una, hasta 200 caracteres.
  const long = composeListMessage({ opening, delivery: 'x'.repeat(300), date: 'y'.repeat(300) }).split('\n');
  assert.equal(long.at(-2), `Entrega en (ciudad o código postal): ${'x'.repeat(200)}`);
  assert.equal(long.at(-1), `Fecha requerida: ${'y'.repeat(200)}`);
});

test('listItem omite lo que falta', () => {
  assert.equal(listItem({ brandName: 'Marca Alfa', code: 'SP-100', name: 'Guante', quantity: '1 par', variant: 'talla o color por definir' }), 'Marca Alfa SP-100 (Guante), 1 par, talla o color por definir');
  assert.equal(listItem({ name: 'Guante', quantity: '2 pares' }), 'Guante, 2 pares');
  assert.equal(listItem({ code: 'SP-100' }), 'SP-100');
  assert.equal(listItem({}), '');
  assert.equal(listItem(), '');
  assert.equal(listItem({ brandName: ' Marca\nAlfa ', code: null, name: undefined, quantity: '  3 cajas ' }), 'Marca Alfa, 3 cajas');
});

test('un mensaje de 200 productos no lanza y draftLink dice que no cabe', () => {
  const items = Array.from({ length: 200 }, (_, i) => listItem({ ...product, code: `SP-${i}`, quantity: '12 pares', variant: `Talla ${i % 10} (SP-${i}-${i % 10})` }));
  let message = '';
  assert.doesNotThrow(() => { message = composeListMessage({ opening, items, note: 'Más cosas', delivery: 'Puebla', date: 'Pronto' }); });
  assert.equal(message.split('\n').length, 1 + 200 + 3);
  assert.deepEqual(draftLink(list.whatsapp, message), { href: WHATSAPP, fits: false });
  assert.equal(draftLinks([list.whatsapp, list.mailto], message).fits, false);
});

test('cuántos productos caben en el enlace: unos 10 con renglones largos y unos 13 con renglones comunes', () => {
  // Renglones como los que arma la página: marca, código, nombre, cantidad con su unidad y variante con su código.
  const long = listItem({ brandName: 'Marca Gamma Ñandú', code: 'SP-1003', name: 'Guante sintético de nitrilo', quantity: '3 cajas con 100 piezas', variant: 'Mediano (SP-1003-M)' });
  const common = listItem({ brandName: 'Marca Alfa', code: 'SP-11840', name: 'Guante sintético recubierto', quantity: '12 pares', variant: 'Talla 8 (SP-11840-8)' });
  const longest = listItem({ brandName: 'Marca Gamma Ñandú', code: 'SP-8002', name: 'Señalización sintética para área de producción', quantity: '10 piezas', variant: 'Tamaño único (SP-8002-U)' });
  assert.deepEqual([long.length, common.length, longest.length], [100, 81, 111]);
  const fields = { delivery: 'Puebla, Pue.', date: '15 de diciembre' };
  /** Cuántos renglones iguales caben en los dos enlaces a la vez. */
  const fitting = (item, parts = {}) => {
    let count = 0;
    while (count < 60 && draftLinks([list.whatsapp, list.mailto], composeListMessage({ opening, items: Array(count + 1).fill(item), ...parts })).fits) count += 1;
    return count;
  };
  // Márgenes de un producto: el número exacto depende del saludo y del largo del correo del negocio.
  const between = (value, low, high) => assert.ok(value >= low && value <= high, `${value} no está entre ${low} y ${high}`);
  between(fitting(long, fields), 9, 11);
  between(fitting(common, fields), 12, 14);
  // Ni con el renglón más largo, lugar, fecha y una nota caben menos de 6: el aviso de «no cabe» es para listas grandes.
  between(fitting(longest, { ...fields, note: 'También 10 cascos blancos' }), 6, 9);
  // El texto con acentos ocupa más en el enlace que en el mensaje: por eso el límite se mide en el enlace codificado.
  const message = composeListMessage({ opening, items: Array(fitting(long, fields)).fill(long), ...fields });
  for (const href of [list.whatsapp, list.mailto]) assert.ok(withMessage(href, message).length <= LINK_LIMITS[linkChannel(href)]);
  assert.ok(withMessage(list.mailto, message).length > message.length);
});

test('composeListMessage sin argumentos no lanza: la plantilla sin apertura', () => {
  assert.doesNotThrow(() => composeListMessage());
  assert.equal(composeListMessage(), composeListMessage({}));
  assert.equal(composeListMessage(null), composeListMessage({}));
  assert.deepEqual(composeListMessage().split('\n').slice(-2), ['Entrega en (ciudad o código postal): ', 'Fecha requerida: ']);
});

test('cleanLines: caracteres de dirección, controles, líneas vacías y el límite en caracteres completos', () => {
  assert.equal(cleanLines('  Guantes\u202E de\u200B carnaza  \r\n\tTalla\u00079 '), 'Guantes de carnaza\nTalla 9');
  assert.equal(cleanLines('\n\n  \nUno\n\n\n\nDos\n \n'), 'Uno\n\nDos');
  assert.equal(cleanLines('Uno\rDos\r\nTres'), 'Uno\nDos\nTres');
  assert.equal(cleanLines('\u200B\n\u202E\n  '), '');
  assert.equal(cleanLines(null), '');
  assert.equal(cleanLines(undefined, 10), '');
  assert.equal(cleanLines('abcdef', 3), 'abc');
  assert.equal(cleanLines('ab\ncd', 3), 'ab');
  assert.equal(cleanLines('ab cd', 3), 'ab');
  // El límite cuenta caracteres completos: un emoji nunca queda partido.
  assert.equal(cleanLines('🧤🧤🧤', 2), '🧤🧤');
  const cut = cleanLines(`${'a'.repeat(9)}🧤🧤`, 10);
  assert.equal(cut, `${'a'.repeat(9)}🧤`);
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(cut));
  // Una mitad suelta se vuelve espacio, como en cleanQuery.
  assert.equal(cleanLines('guante\uD83Erojo'), 'guante rojo');
  // Sin límite, el texto entero.
  assert.equal(cleanLines('x'.repeat(20000)).length, 20000);
});
