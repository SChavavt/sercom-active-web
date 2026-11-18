import test from 'node:test';
import assert from 'node:assert/strict';
import { absoluteUrl, contactLinks, mailtoUrl, messages, subjects, whatsappUrl } from '../src/lib/contact.mjs';
import { buildMailtoUrl, buildWhatsappUrl, createContact, withPageLink, withRequestDescription } from '../src/lib/contact-core.mjs';
import { loadProjectData } from './helpers.mjs';

const { business, catalog } = await loadProjectData();

// Datos de contacto confirmados. Si el negocio los cambia en business.json, se actualizan aquí a propósito.
const DIGITS = '5212214002219';
const EMAIL = 'ventas.puebla@sercomactive.com';

const product = { brandName: 'Marca de ejemplo', code: 'EJ-1001', name: 'Guante de ejemplo recubierto' };
const pageUrl = 'https://sitio.example/productos/ejemplo-guante-recubierto/';
const text = (...lines) => lines.join('\n');
const whatsappText = url => decodeURIComponent(url.slice(`https://wa.me/${DIGITS}?text=`.length));
const mailtoParts = url => {
  const query = url.slice(url.indexOf('?') + 1);
  return Object.fromEntries(query.split('&').map(param => [param.slice(0, param.indexOf('=')), decodeURIComponent(param.slice(param.indexOf('=') + 1))]));
};

test('los datos de contacto salen de business.json y el número se conserva tal como se aportó', () => {
  assert.equal(business.whatsappDigits, DIGITS);
  assert.equal(business.email, EMAIL);
  assert.equal(business.contactFirstName, 'Yosmara');
  assert.equal(business.name, 'Sercom Active');
  assert.equal(whatsappUrl(), `https://wa.me/${DIGITS}`);
  assert.equal(mailtoUrl(), `mailto:${EMAIL}`);
  // Sin «normalizar»: el 1 después del 52 se conserva.
  assert.ok(!whatsappUrl('Hola').includes('522214002219'));
});

test('whatsappUrl codifica el texto completo y se puede leer de vuelta', () => {
  const message = 'Hola, Yosmara. ¿Tienen señalización & conos #71? 100% de la lista + guantes\nCantidad y unidad: 10 pares';
  const url = whatsappUrl(message);
  assert.equal(url, `https://wa.me/${DIGITS}?text=${encodeURIComponent(message)}`);
  assert.equal(whatsappText(url), message);
  assert.match(url, /^https:\/\/wa\.me\/5212214002219\?text=[A-Za-z0-9%._~!*'()-]+$/);
  assert.ok(url.includes('%0A') && url.includes('%C3%B1') && url.includes('%26') && url.includes('%23') && url.includes('%2B') && url.includes('%25'));
  assert.equal(whatsappUrl(''), `https://wa.me/${DIGITS}`);
  assert.equal(whatsappUrl(null), `https://wa.me/${DIGITS}`);
});

test('mailtoUrl codifica asunto y cuerpo; los saltos de línea viajan como %0D%0A', () => {
  const url = mailtoUrl({ subject: 'Solicitud de cotización: Marca & Cía 37-175', body: 'Línea 1\nLínea 2\r\nLínea 3\rLínea 4' });
  assert.equal(url, `mailto:${EMAIL}?subject=Solicitud%20de%20cotizaci%C3%B3n%3A%20Marca%20%26%20C%C3%ADa%2037-175&body=L%C3%ADnea%201%0D%0AL%C3%ADnea%202%0D%0AL%C3%ADnea%203%0D%0AL%C3%ADnea%204`);
  assert.deepEqual(mailtoParts(url), { subject: 'Solicitud de cotización: Marca & Cía 37-175', body: 'Línea 1\r\nLínea 2\r\nLínea 3\r\nLínea 4' });
  // Ningún salto de línea suelto.
  assert.doesNotMatch(url.replaceAll('%0D%0A', ''), /%0A|%0D|\s/);
  assert.equal(mailtoUrl({ subject: 'Solicitud especial' }), `mailto:${EMAIL}?subject=Solicitud%20especial`);
  assert.equal(mailtoUrl({ body: 'Hola' }), `mailto:${EMAIL}?body=Hola`);
  assert.equal(mailtoUrl({}), `mailto:${EMAIL}`);
  assert.equal(mailtoUrl({ subject: null, body: undefined }), `mailto:${EMAIL}`);
});

test('mensaje general', () => {
  assert.equal(messages.general(), 'Hola, Yosmara. Me interesa solicitar información y una cotización con Sercom Active.');
});

test('mensaje de producto, con y sin enlace a la página', () => {
  assert.equal(messages.product(product), text(
    'Hola, Yosmara. Quiero solicitar una cotización con Sercom Active.',
    'Producto: Marca de ejemplo EJ-1001 (Guante de ejemplo recubierto)',
    'Variante (talla o color): ',
    'Cantidad y unidad: ',
    'Entrega en (ciudad o código postal): ',
    'Fecha requerida: ',
    'También necesito: ',
  ));
  assert.equal(messages.product({ ...product, url: pageUrl }), text(
    'Hola, Yosmara. Quiero solicitar una cotización con Sercom Active.',
    'Producto: Marca de ejemplo EJ-1001 (Guante de ejemplo recubierto)',
    'Variante (talla o color): ',
    'Cantidad y unidad: ',
    `Enlace: ${pageUrl}`,
    'Entrega en (ciudad o código postal): ',
    'Fecha requerida: ',
    'También necesito: ',
  ));
});

test('mensaje para cotizar una lista', () => {
  assert.equal(messages.list(), text(
    'Hola, Yosmara. Quiero cotizar esta lista con Sercom Active:',
    '1. (marca y código o descripción), (cantidad y unidad), (talla o color)',
    '2. ',
    '3. ',
    'Entrega en (ciudad o código postal): ',
    'Fecha requerida: ',
  ));
});

test('mensaje de solicitud especial, con y sin lo que el cliente buscó', () => {
  const expected = description => text(
    'Hola, Yosmara. Busco un producto que no encuentro en el catálogo de Sercom Active.',
    `Descripción o uso: ${description}`,
    'Marca o modelo (si lo tengo): ',
    'Cantidad y unidad: ',
    'Entrega en (ciudad o código postal): ',
    'Fecha requerida: ',
    'Puedo enviar una foto o archivo en esta conversación.',
  );
  assert.equal(messages.specialRequest(), expected(''));
  assert.equal(messages.specialRequest({}), expected(''));
  assert.equal(messages.specialRequest({ query: null }), expected(''));
  assert.equal(messages.specialRequest({ query: 'guante para ácido' }), expected('guante para ácido'));
  // La búsqueda se escribe en una sola línea y se recorta.
  assert.equal(messages.specialRequest({ query: '  guante\n para   ácido ' }), expected('guante para ácido'));
  assert.equal(messages.specialRequest({ query: 'x'.repeat(500) }), expected('x'.repeat(200)));
});

test('mensaje de marca', () => {
  assert.equal(messages.brand('MCR Safety'), text(
    'Hola, Yosmara. Busco un producto de la marca MCR Safety.',
    'Modelo o descripción: ',
    'Cantidad y unidad: ',
  ));
});

test('mensaje de categoría: el nombre se escribe en minúsculas cuando así se lee natural', () => {
  assert.equal(messages.category('Protección de manos'), text(
    'Hola, Yosmara. Busco productos de protección de manos.',
    'Qué necesito: ',
    'Cantidad y unidad: ',
  ));
  const sentence = name => messages.category(name).split('\n')[0];
  const expected = {
    'Protección de manos': 'protección de manos',
    'Protección de ojos y cara': 'protección de ojos y cara',
    'Protección de cabeza': 'protección de cabeza',
    'Protección respiratoria': 'protección respiratoria',
    'Protección auditiva': 'protección auditiva',
    'Trabajo en alturas': 'trabajo en alturas',
    'Ropa y protección corporal': 'ropa y protección corporal',
    'Calzado industrial': 'calzado industrial',
    'Vial y señalización': 'vial y señalización',
    'Soldadura': 'soldadura',
  };
  // Las diez categorías reales.
  assert.deepEqual(catalog.categories.map(category => category.name), Object.keys(expected));
  for (const [name, inline] of Object.entries(expected)) assert.equal(sentence(name), `Hola, Yosmara. Busco productos de ${inline}.`);
  // Un nombre que empieza con otra palabra no cambia, y las siglas se conservan.
  assert.equal(sentence('Señalización'), 'Hola, Yosmara. Busco productos de Señalización.');
  assert.equal(sentence('Ropa FR y EPP'), 'Hola, Yosmara. Busco productos de ropa FR y EPP.');
});

test('mensaje para pedir una ficha técnica, con y sin enlace', () => {
  assert.equal(messages.datasheet(product), 'Hola, Yosmara. ¿Me puedes compartir la ficha técnica de Marca de ejemplo EJ-1001 (Guante de ejemplo recubierto)?');
  assert.equal(messages.datasheet({ ...product, url: pageUrl }), text(
    'Hola, Yosmara. ¿Me puedes compartir la ficha técnica de Marca de ejemplo EJ-1001 (Guante de ejemplo recubierto)?',
    `Enlace: ${pageUrl}`,
  ));
});

test('asuntos de correo', () => {
  assert.equal(subjects.general(), 'Solicitud de cotización');
  assert.equal(subjects.product(product), 'Solicitud de cotización: Marca de ejemplo EJ-1001');
  assert.equal(subjects.list(), 'Lista para cotizar');
  assert.equal(subjects.specialRequest(), 'Solicitud especial');
  assert.equal(subjects.brand('MCR Safety'), 'Consulta sobre la marca MCR Safety');
  assert.equal(subjects.category('Protección de manos'), 'Consulta sobre Protección de manos');
  assert.equal(subjects.datasheet(product), 'Ficha técnica: Marca de ejemplo EJ-1001');
});

test('las partes que faltan se omiten con limpieza: nunca «undefined», «null» ni paréntesis vacíos', () => {
  const firstLine = value => value.split('\n')[1];
  assert.equal(firstLine(messages.product({ brandName: 'Marca', code: 'M-1' })), 'Producto: Marca M-1');
  assert.equal(firstLine(messages.product({ brandName: 'Marca', name: 'Guante' })), 'Producto: Marca (Guante)');
  assert.equal(firstLine(messages.product({ code: 'M-1', name: 'Guante' })), 'Producto: M-1 (Guante)');
  assert.equal(firstLine(messages.product({ name: 'Guante' })), 'Producto: Guante');
  assert.equal(firstLine(messages.product({})), 'Producto: ');
  assert.equal(firstLine(messages.product({ brandName: null, code: undefined, name: '  ', url: '' })), 'Producto: ');
  assert.equal(messages.datasheet({ code: 'M-1' }), 'Hola, Yosmara. ¿Me puedes compartir la ficha técnica de M-1?');
  assert.equal(messages.datasheet({}), 'Hola, Yosmara. ¿Me puedes compartir una ficha técnica?');
  assert.equal(messages.brand('').split('\n')[0], 'Hola, Yosmara. Busco un producto.');
  assert.equal(messages.category(undefined).split('\n')[0], 'Hola, Yosmara. Busco productos.');
  assert.equal(subjects.product({}), 'Solicitud de cotización');
  assert.equal(subjects.product({ code: 'M-1' }), 'Solicitud de cotización: M-1');
  assert.equal(subjects.datasheet({}), 'Ficha técnica');
  assert.equal(subjects.brand(null), 'Consulta sobre una marca');
  assert.equal(subjects.category(''), 'Consulta sobre una categoría');

  const incomplete = [undefined, null, {}, { brandName: undefined, code: null, name: undefined, url: null }, { name: 'Guante', url: undefined }];
  const outputs = [
    messages.general(), messages.list(), messages.specialRequest(), messages.specialRequest({ query: undefined }),
    messages.brand(undefined), messages.brand(null), messages.category(undefined), messages.category(null),
    subjects.brand(undefined), subjects.category(null),
    ...incomplete.flatMap(value => [messages.product(value), messages.datasheet(value), subjects.product(value), subjects.datasheet(value)]),
    ...incomplete.flatMap(value => Object.values(contactLinks.product(value))),
    ...incomplete.flatMap(value => Object.values(contactLinks.datasheet(value))),
    ...Object.values(contactLinks.brand(undefined)), ...Object.values(contactLinks.category(null)), ...Object.values(contactLinks.specialRequest()),
    whatsappUrl(undefined), mailtoUrl(undefined), mailtoUrl({ subject: undefined, body: null }),
  ];
  for (const output of outputs) {
    const readable = decodeURIComponent(output);
    assert.doesNotMatch(readable, /undefined|null|NaN|\[object|\(\s*\)|\[\s*\]|\{\s*\}/, readable);
    assert.doesNotMatch(readable, / {2,}| \./, readable);
  }
});

test('contactLinks entrega el mismo mensaje por WhatsApp y por correo', () => {
  const pairs = {
    general: [contactLinks.general(), subjects.general(), messages.general()],
    product: [contactLinks.product({ ...product, url: pageUrl }), subjects.product(product), messages.product({ ...product, url: pageUrl })],
    list: [contactLinks.list(), subjects.list(), messages.list()],
    specialRequest: [contactLinks.specialRequest({ query: 'cono de 71 cm' }), subjects.specialRequest(), messages.specialRequest({ query: 'cono de 71 cm' })],
    brand: [contactLinks.brand('3M'), subjects.brand('3M'), messages.brand('3M')],
    category: [contactLinks.category('Calzado industrial'), subjects.category('Calzado industrial'), messages.category('Calzado industrial')],
    datasheet: [contactLinks.datasheet(product), subjects.datasheet(product), messages.datasheet(product)],
  };
  assert.deepEqual(Object.keys(contactLinks).sort(), Object.keys(pairs).sort());
  assert.deepEqual(Object.keys(messages).sort(), Object.keys(pairs).sort());
  assert.deepEqual(Object.keys(subjects).sort(), Object.keys(pairs).sort());
  for (const [name, [pair, subject, message]] of Object.entries(pairs)) {
    assert.deepEqual(Object.keys(pair), ['whatsapp', 'mailto', 'subject', 'text'], name);
    assert.equal(pair.subject, subject, name);
    assert.equal(pair.text, message, name);
    assert.equal(pair.whatsapp, whatsappUrl(message), name);
    assert.equal(whatsappText(pair.whatsapp), message, name);
    assert.equal(pair.mailto, mailtoUrl({ subject, body: message }), name);
    assert.deepEqual(mailtoParts(pair.mailto), { subject, body: message.replaceAll('\n', '\r\n') }, name);
  }
});

test('absoluteUrl devuelve la dirección completa solo cuando se conoce la dirección del sitio', () => {
  assert.equal(absoluteUrl('/productos/ejemplo-orejera/', 'https://catalogo.example'), 'https://catalogo.example/productos/ejemplo-orejera/');
  assert.equal(absoluteUrl('/productos/ejemplo-orejera/', new URL('https://catalogo.example/')), 'https://catalogo.example/productos/ejemplo-orejera/');
  assert.equal(absoluteUrl('/', 'https://catalogo.example'), 'https://catalogo.example/');
  for (const unknown of [undefined, null, '', 'sin-protocolo', 'file:///tmp/sitio', 'javascript:alert(1)']) {
    assert.equal(absoluteUrl('/productos/ejemplo-orejera/', unknown), undefined, String(unknown));
  }
  // Sin dirección del sitio, el mensaje simplemente no lleva la línea «Enlace».
  const message = messages.product({ ...product, url: absoluteUrl('/productos/ejemplo-guante-recubierto/', undefined) });
  assert.equal(message, messages.product(product));
  assert.doesNotMatch(message, /Enlace/);
});

test('withPageLink agrega en el navegador el enlace que no se conocía al compilar', () => {
  const built = contactLinks.product(product);
  const complete = contactLinks.product({ ...product, url: pageUrl });
  assert.equal(withPageLink(built.whatsapp, pageUrl), complete.whatsapp);
  assert.equal(withPageLink(built.mailto, pageUrl), complete.mailto);
  const sheet = contactLinks.datasheet(product);
  const completeSheet = contactLinks.datasheet({ ...product, url: pageUrl });
  assert.equal(withPageLink(sheet.whatsapp, pageUrl), completeSheet.whatsapp);
  assert.equal(withPageLink(sheet.mailto, pageUrl), completeSheet.mailto);
  // Si el mensaje ya trae su enlace, no se duplica ni se cambia.
  assert.equal(withPageLink(complete.whatsapp, 'https://otro.example/'), complete.whatsapp);
  assert.equal(withPageLink(withPageLink(built.mailto, pageUrl), pageUrl), complete.mailto);
  // Sin dirección, o en un enlace que no es de cotización, no cambia nada.
  assert.equal(withPageLink(built.whatsapp, ''), built.whatsapp);
  assert.equal(withPageLink(built.whatsapp, undefined), built.whatsapp);
  assert.equal(withPageLink(`https://wa.me/${DIGITS}`, pageUrl), `https://wa.me/${DIGITS}`);
  assert.equal(withPageLink(`mailto:${EMAIL}`, pageUrl), `mailto:${EMAIL}`);
  assert.equal(withPageLink('https://www.ansell.com/mx/es/industrial?text=hola', pageUrl), 'https://www.ansell.com/mx/es/industrial?text=hola');
  assert.equal(withPageLink(`https://wa.me/${DIGITS}?text=%E0%A4%A`, pageUrl), `https://wa.me/${DIGITS}?text=%E0%A4%A`);
  assert.equal(withPageLink(undefined, pageUrl), '');
  assert.equal(withPageLink(null, pageUrl), '');
});

test('withRequestDescription escribe en el navegador lo que el cliente buscó', () => {
  const empty = contactLinks.specialRequest();
  const filled = contactLinks.specialRequest({ query: 'guante para ácido' });
  assert.equal(withRequestDescription(empty.whatsapp, 'guante para ácido'), filled.whatsapp);
  assert.equal(withRequestDescription(empty.mailto, 'guante para ácido'), filled.mailto);
  assert.equal(withRequestDescription(empty.whatsapp, '  guante\npara   ácido '), filled.whatsapp);
  assert.equal(withRequestDescription(filled.whatsapp, ''), empty.whatsapp);
  assert.equal(whatsappText(withRequestDescription(empty.whatsapp, 'y'.repeat(900))).split('\n')[1], `Descripción o uso: ${'y'.repeat(200)}`);
  // En un mensaje sin esa línea no cambia nada.
  const general = contactLinks.general();
  assert.equal(withRequestDescription(general.whatsapp, 'guante'), general.whatsapp);
  assert.equal(withRequestDescription(general.mailto, 'guante'), general.mailto);
});

test('createContact usa los datos que recibe y rechaza datos de contacto mal formados', () => {
  const other = createContact({ name: 'Negocio de prueba', contactFirstName: 'Persona', email: 'prueba@example.invalid', whatsappDigits: '5215500000000' });
  assert.equal(other.messages.general(), 'Hola, Persona. Me interesa solicitar información y una cotización con Negocio de prueba.');
  assert.equal(other.whatsappUrl('Hola'), 'https://wa.me/5215500000000?text=Hola');
  assert.equal(other.mailtoUrl({ subject: 'Hola' }), 'mailto:prueba@example.invalid?subject=Hola');
  assert.equal(buildWhatsappUrl('5215500000000', 'Hola'), 'https://wa.me/5215500000000?text=Hola');
  assert.equal(buildMailtoUrl('prueba@example.invalid', { body: 'a\nb' }), 'mailto:prueba@example.invalid?body=a%0D%0Ab');
  const valid = { name: 'Negocio de prueba', contactFirstName: 'Persona', email: 'prueba@example.invalid', whatsappDigits: '5215500000000' };
  for (const whatsappDigits of ['+52 1 55 0000 0000', '52-1-55', '', undefined, '123']) {
    assert.throws(() => createContact({ ...valid, whatsappDigits }), /whatsappDigits debe contener solo dígitos/, String(whatsappDigits));
  }
  for (const email of ['', 'sin-arroba', 'a@b', 'a b@example.invalid', 'a@example.invalid?subject=x', undefined]) {
    assert.throws(() => createContact({ ...valid, email }), /email no tiene forma de dirección de correo/, String(email));
  }
  assert.throws(() => createContact({ ...valid, contactFirstName: ' ' }), /faltan contactFirstName o name/);
  assert.throws(() => createContact({ ...valid, name: undefined }), /faltan contactFirstName o name/);
  assert.throws(() => createContact(undefined), /whatsappDigits/);
});

test('contact.mjs no se puede cargar en un navegador', async () => {
  globalThis.document = {};
  try {
    await assert.rejects(import('../src/lib/contact.mjs?navegador'), /solo para compilación/);
  } finally {
    delete globalThis.document;
  }
});
