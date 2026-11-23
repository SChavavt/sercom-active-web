// @ts-check
// Enlaces de contacto y plantillas de mensaje, sin datos del negocio: todo llega como argumento.
// Apto para el navegador y para node:test: solo importa `text.mjs` (la limpieza del texto del visitante).
// Las páginas usan `contact.mjs` al compilar. Un <script> de navegador usa de aquí lo que trabaja sobre un enlace ya
// construido (`withPageLink`, `withRequestDescription`, `linkChannel`, `messageOf`, `withMessage`, `withFieldValues`,
// `draftLink`, `draftLinks`) y lo que arma el texto de un borrador (`cleanLines`, `listItem`, `composeListMessage`).
// Nunca recibe un número, un correo ni un nombre del contacto: los trae el `href` que imprimió la página.
/** @import { Contact, ContactLinkPair, ContactLinks, ContactMessages, ContactSettings, ContactSubjects, DraftLinks, EmailParts, LinkChannel, ListItemParts, ListMessageParts, ProductReference } from '../types/contact.ts' */
import { cleanQuery } from './text.mjs';

/**
 * Etiquetas de las líneas «Etiqueta: valor» de los mensajes. Las plantillas de `createContact` las usan, y un script de
 * navegador completa esas líneas con `withFieldValues`: una sola fuente para cada etiqueta.
 */
export const MESSAGE_LABELS = Object.freeze({
  link: 'Enlace',
  variant: 'Variante (talla o color)',
  quantity: 'Cantidad y unidad',
  also: 'También necesito',
  delivery: 'Entrega en (ciudad o código postal)',
  date: 'Fecha requerida',
  description: 'Descripción o uso',
  model: 'Marca o modelo (si lo tengo)',
});

/**
 * Largo máximo, en caracteres, del enlace completo de cada canal: `{ whatsapp: 1900, mailto: 1900 }`. Es conservador a
 * propósito: no se pudo medir contra los servicios y se revisará con la prueba en un teléfono real. Con un enlace más
 * largo, la página abre la aplicación sin texto y pide copiar primero (`draftLinks`).
 * Se arma con pares [canal, largo] y no con un objeto escrito: el empaquetador escribiría la clave como «mailto:1900»,
 * y el escáner de la salida lee eso como un enlace de correo a otra dirección.
 * @type {Readonly<Record<LinkChannel, number>>}
 */
export const LINK_LIMITS = Object.freeze(/** @type {Record<LinkChannel, number>} */ (Object.fromEntries([['whatsapp', 1900], ['mailto', 1900]])));

const LINK_LABEL = MESSAGE_LABELS.link;
const DESCRIPTION_LABEL = MESSAGE_LABELS.description;
const DELIVERY_LABEL = MESSAGE_LABELS.delivery;
/** Límite de una línea que completa `withFieldValues`. */
const MAX_FIELD_LENGTH = 1000;
/** Límites de lo que el visitante escribe en la lista: el texto libre y las dos líneas de entrega y fecha. */
const MAX_NOTE_LENGTH = 10000;
const MAX_LINE_LENGTH = 200;
/** Lo que dice el mensaje de lista mientras no tiene productos ni texto: la plantilla de siempre. */
const LIST_PLACEHOLDERS = ['1. (marca y código o descripción), (cantidad y unidad), (talla o color)', '2. ', '3. '];
/** Palabras iniciales de un nombre de categoría que se escribe en minúsculas dentro de una frase. */
const COMMON_FIRST_WORDS = ['Protección', 'Trabajo', 'Ropa', 'Calzado', 'Vial', 'Soldadura'];
/** Límite de la descripción que llega desde el buscador, para no producir enlaces enormes. */
const MAX_DESCRIPTION_LENGTH = 200;

/**
 * Quita las mitades sueltas de un par sustituto de UTF-16 (por ejemplo, un emoji partido): `encodeURIComponent`
 * lanza URIError con ellas y el enlace no se podría construir.
 * @param {string} text
 * @returns {string}
 */
const wellFormed = text => text.replace(/\p{Cs}/gu, '');

/**
 * Texto de una sola línea y sin espacios sobrantes. Un valor ausente es una cadena vacía, nunca «undefined» ni «null».
 * @param {unknown} value
 * @returns {string}
 */
const clean = value => (value === undefined || value === null ? '' : wellFormed(String(value)).replace(/\s+/g, ' ').trim());

/** Línea «Etiqueta: valor». Sin valor queda lista para que el cliente la complete. */
const field = (/** @type {string} */ label, value = '') => `${label}: ${value}`;

/**
 * Enlace que abre WhatsApp con un borrador. Abrirlo no envía nada: el cliente revisa y envía.
 * @param {string} digits Número tal como se usa en `wa.me` (solo dígitos).
 * @param {string | null} [text]
 * @returns {string}
 */
export function buildWhatsappUrl(digits, text) {
  const message = text === undefined || text === null ? '' : wellFormed(String(text));
  return message ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : `https://wa.me/${digits}`;
}

/**
 * Enlace `mailto:` con asunto y cuerpo codificados. Los saltos de línea del cuerpo viajan como `%0D%0A`.
 * @param {string} email
 * @param {EmailParts} [parts]
 * @returns {string}
 */
export function buildMailtoUrl(email, parts = {}) {
  const subject = clean(parts?.subject);
  const body = parts?.body === undefined || parts?.body === null ? '' : wellFormed(String(parts.body)).replace(/\r\n|\r|\n/g, '\r\n');
  const params = [];
  if (subject) params.push(`subject=${encodeURIComponent(subject)}`);
  if (body) params.push(`body=${encodeURIComponent(body)}`);
  return params.length ? `mailto:${email}?${params.join('&')}` : `mailto:${email}`;
}

/**
 * Dirección absoluta de una ruta del sitio. Devuelve `undefined` mientras no se conozca la dirección
 * del sitio (`Astro.site` sin definir): en ese caso la página la agrega en el navegador con `withPageLink`.
 * @param {string} path Ruta como `/productos/abc/`.
 * @param {URL | string | null | undefined} site Normalmente `Astro.site`.
 * @returns {string | undefined}
 */
export function absoluteUrl(path, site) {
  if (!site) return undefined;
  try {
    const base = new URL(String(site));
    if (base.protocol !== 'https:' && base.protocol !== 'http:') return undefined;
    return new URL(path, base).href;
  } catch {
    return undefined;
  }
}

/**
 * Nombre de categoría dentro de una frase: «Protección de manos» se escribe «protección de manos».
 * Las siglas («EPP», «3M») se conservan; un nombre que empieza con otra palabra no cambia.
 * @param {unknown} name
 * @returns {string}
 */
function inlineCategoryName(name) {
  const words = clean(name).split(' ');
  if (!COMMON_FIRST_WORDS.includes(words[0] ?? '')) return words.join(' ');
  return words
    .map(word => {
      const letters = word.replace(/[^\p{L}\p{N}]/gu, '');
      const isAcronym = letters.length >= 2 && /\p{L}/u.test(letters) && letters === letters.toUpperCase();
      return isAcronym ? word : word.toLowerCase();
    })
    .join(' ');
}

/** «Marca CÓDIGO»; omite la parte que falte. */
const codeLabel = (/** @type {Pick<ProductReference, 'brandName' | 'code'> | null | undefined} */ product) =>
  [clean(product?.brandName), clean(product?.code)].filter(Boolean).join(' ');

/** «Marca CÓDIGO (Nombre)»; omite lo que falte y nunca deja paréntesis vacíos. */
const productLabel = (/** @type {ProductReference | null | undefined} */ product) => {
  const head = codeLabel(product);
  const name = clean(product?.name);
  return head && name ? `${head} (${name})` : head || name;
};

/**
 * Agrega la línea «Enlace: <url>» a un mensaje que no la tenga: antes de los datos de entrega
 * o, si el mensaje no los pide, al final.
 * @param {string} text
 * @param {unknown} url
 * @returns {string}
 */
function addLinkLine(text, url) {
  const link = clean(url);
  if (!link || !text) return text;
  const lines = text.split('\n');
  if (lines.some(line => line.startsWith(`${LINK_LABEL}: `))) return text;
  const delivery = lines.findIndex(line => line.startsWith(`${DELIVERY_LABEL}:`));
  lines.splice(delivery === -1 ? lines.length : delivery, 0, field(LINK_LABEL, link));
  return lines.join('\n');
}

/**
 * Para el navegador y la compilación: la descripción tal como entra en la línea «Descripción o uso» de una
 * solicitud especial (una sola línea, sin espacios sobrantes, hasta 200 caracteres). Cadena vacía si no hay
 * texto útil. Sirve para mostrar en la página exactamente lo que se agregó al borrador.
 * La limpia `cleanQuery`, la misma función que la búsqueda del catálogo (`displayQuery`): los caracteres de dirección,
 * los invisibles y el guion suave se quitan sin dejar espacio («gu<U+200B>ante» queda «guante»); el carácter de
 * reemplazo, los controles y las mitades sueltas de un par sustituto pasan a ser un espacio.
 * Cuenta caracteres completos (puntos de código), no unidades de UTF-16: el recorte nunca parte un emoji.
 * @param {unknown} description
 * @returns {string}
 */
export function requestDescription(description) {
  return Array.from(cleanQuery(description)).slice(0, MAX_DESCRIPTION_LENGTH).join('').trim();
}

/**
 * Escribe la descripción en la línea «Descripción o uso» de una solicitud especial.
 * @param {string} text
 * @param {unknown} description
 * @returns {string}
 */
function setDescriptionLine(text, description) {
  const value = requestDescription(description);
  return text
    .split('\n')
    .map(line => (line.startsWith(`${DESCRIPTION_LABEL}:`) ? field(DESCRIPTION_LABEL, value) : line))
    .join('\n');
}

const WHATSAPP_PREFIX = 'https://wa.me/';
const MAILTO_PREFIX = 'mailto:';

/**
 * Las partes de un enlace de WhatsApp o de correo ya construido: canal, destino (los dígitos o el correo) y el asunto y
 * el texto decodificados (los saltos de línea como `\n`). `null` para cualquier otro enlace o uno con codificación
 * inválida.
 * @param {unknown} href
 * @returns {{ channel: LinkChannel, destination: string, subject: string, text: string } | null}
 */
function parseMessageLink(href) {
  const value = href === undefined || href === null ? '' : String(href);
  const queryStart = value.indexOf('?');
  const base = queryStart === -1 ? value : value.slice(0, queryStart);
  const params = queryStart === -1 ? [] : value.slice(queryStart + 1).split('&');
  /** @param {string} name */
  const read = name => {
    const param = params.find(candidate => candidate.startsWith(`${name}=`));
    return param === undefined ? '' : decodeURIComponent(param.slice(name.length + 1));
  };
  try {
    if (base.startsWith(WHATSAPP_PREFIX)) return { channel: 'whatsapp', destination: base.slice(WHATSAPP_PREFIX.length), subject: '', text: read('text') };
    if (base.startsWith(MAILTO_PREFIX)) {
      return { channel: 'mailto', destination: base.slice(MAILTO_PREFIX.length), subject: read('subject'), text: read('body').replace(/\r\n?/g, '\n') };
    }
  } catch {
    // Codificación inválida: no es un enlace que se pueda leer.
  }
  return null;
}

/**
 * Construye de nuevo un enlace leído con `parseMessageLink`, con otro texto.
 * @param {{ channel: LinkChannel, destination: string, subject: string }} link
 * @param {string} text
 */
const buildMessageLink = (link, text) => (link.channel === 'whatsapp'
  ? buildWhatsappUrl(link.destination, text)
  : buildMailtoUrl(link.destination, { subject: link.subject, body: text }));

/**
 * Aplica un cambio al texto del mensaje de un enlace de WhatsApp o de correo ya construido.
 * Cualquier otro enlace, uno sin texto o uno con codificación inválida, se devuelve igual.
 * @param {unknown} href
 * @param {(text: string) => string} transform
 * @returns {string}
 */
function rewriteMessage(href, transform) {
  const value = href === undefined || href === null ? '' : String(href);
  const link = parseMessageLink(value);
  if (!link || !link.text) return value;
  try {
    return buildMessageLink(link, transform(link.text));
  } catch {
    return value;
  }
}

/**
 * Canal de un enlace: «whatsapp» para `https://wa.me/…`, «mailto» para `mailto:…` y `null` para cualquier otro.
 * @param {unknown} href
 * @returns {LinkChannel | null}
 */
export function linkChannel(href) {
  const value = href === undefined || href === null ? '' : String(href);
  if (value.startsWith(WHATSAPP_PREFIX)) return 'whatsapp';
  if (value.startsWith(MAILTO_PREFIX)) return 'mailto';
  return null;
}

/**
 * Para el navegador: el texto del mensaje de un enlace de WhatsApp, o el cuerpo de un enlace de correo, decodificado y
 * con los saltos de línea como `\n`. Cadena vacía si no tiene, si es otro enlace o si su codificación es inválida.
 * La línea de apertura de un mensaje es `messageOf(href).split('\n')[0]`.
 * @param {unknown} href
 * @returns {string}
 */
export function messageOf(href) {
  return parseMessageLink(href)?.text ?? '';
}

/**
 * Para el navegador: el mismo destino (y el mismo asunto, en un correo) con `text` como mensaje completo; con `''` el
 * enlace queda sin texto. Cualquier otro enlace, o uno con codificación inválida, se devuelve igual.
 * @param {unknown} href
 * @param {unknown} text
 * @returns {string}
 */
export function withMessage(href, text) {
  const value = href === undefined || href === null ? '' : String(href);
  const link = parseMessageLink(value);
  if (!link) return value;
  return buildMessageLink(link, text === undefined || text === null ? '' : String(text));
}

/**
 * Para el navegador: completa líneas «Etiqueta: valor» del mensaje de un enlace. `values` es `{ [etiqueta]: texto }`:
 * cada línea que empieza con `${etiqueta}:` queda `${etiqueta}: ${valor}`, con el valor en una sola línea (`cleanQuery`:
 * los saltos de línea pasan a ser espacios) y hasta 1000 caracteres completos; con `''` la línea queda vacía. Las líneas
 * cuya etiqueta no está en `values` no cambian, las etiquetas que el mensaje no tiene se ignoran y nunca se agrega una
 * línea. Aplicarla dos veces da lo mismo que una.
 * @param {unknown} href
 * @param {Record<string, unknown> | null | undefined} values
 * @returns {string}
 */
export function withFieldValues(href, values) {
  const entries = Object.entries(values && typeof values === 'object' ? values : {})
    .map(([label, value]) => [label, Array.from(cleanQuery(value)).slice(0, MAX_FIELD_LENGTH).join('').trim()])
    .filter(([label]) => label !== '')
    // Si una etiqueta empieza como otra, cuenta la más larga.
    .sort((a, b) => b[0].length - a[0].length);
  if (entries.length === 0) return href === undefined || href === null ? '' : String(href);
  return rewriteMessage(href, text => text
    .split('\n')
    .map(line => {
      const entry = entries.find(([label]) => line.startsWith(`${label}:`));
      return entry ? field(entry[0], entry[1]) : line;
    })
    .join('\n'));
}

/**
 * Para el navegador: el enlace con `text` como mensaje si cabe en `LINK_LIMITS` para su canal (`fits: true`). Si no
 * cabe, el enlace sin texto (`fits: false`): abre la aplicación y el visitante pega lo que copió. Un enlace que no es de
 * ninguno de los dos canales se devuelve igual, con `fits: true`.
 * @param {unknown} href
 * @param {unknown} text
 * @returns {{ href: string, fits: boolean }}
 */
export function draftLink(href, text) {
  const value = href === undefined || href === null ? '' : String(href);
  const channel = linkChannel(value);
  if (!channel) return { href: value, fits: true };
  const full = withMessage(value, text);
  if (full.length <= LINK_LIMITS[channel]) return { href: full, fits: true };
  return { href: withMessage(value, ''), fits: false };
}

/**
 * Para el navegador: la regla de una página que arma UN mensaje. `fits` es `true` solo si TODOS los enlaces caben con
 * el texto; si uno no cabe, todos los enlaces de WhatsApp y de correo de la lista vuelven sin texto. Los demás enlaces
 * pasan igual. Mismo orden que `hrefs`.
 * @param {readonly unknown[]} hrefs
 * @param {unknown} text
 * @returns {DraftLinks}
 */
export function draftLinks(hrefs, text) {
  const list = Array.isArray(hrefs) ? hrefs : [];
  const drafts = list.map(href => draftLink(href, text));
  const fits = drafts.every(draft => draft.fits);
  if (fits) return { hrefs: drafts.map(draft => draft.href), fits };
  return { hrefs: list.map(href => (linkChannel(href) ? withMessage(href, '') : href === undefined || href === null ? '' : String(href))), fits };
}

/**
 * Texto de varias líneas que escribió el visitante: cada línea limpia como `cleanQuery` (sin caracteres invisibles ni de
 * dirección, los controles como espacios), sin líneas vacías al principio ni al final, con a lo más una línea vacía
 * seguida, y recortado a `limit` caracteres completos (puntos de código: nunca parte un emoji en dos mitades). Cadena
 * vacía si no queda nada visible.
 * @param {unknown} value
 * @param {number} [limit]
 * @returns {string}
 */
export function cleanLines(value, limit = Infinity) {
  const max = Number.isFinite(limit) ? Math.max(0, Math.trunc(Number(limit))) : Infinity;
  /** @type {string[]} */
  const lines = [];
  for (const line of (value === undefined || value === null ? '' : String(value)).split(/\r\n|\r|\n/)) {
    const cleaned = cleanQuery(line);
    if (cleaned || (lines.length > 0 && lines[lines.length - 1] !== '')) lines.push(cleaned);
  }
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const text = Array.from(lines.join('\n')).slice(0, max).join('');
  // El recorte puede dejar un espacio o una línea vacía al final.
  return text.replace(/\s+$/u, '');
}

/**
 * Un renglón del mensaje de lista: la etiqueta del producto como la escriben los demás mensajes («Marca CÓDIGO
 * (Nombre)»), luego la cantidad y la variante cuando no están vacías: «Marca CÓDIGO (Nombre), 12 pares, Talla 8
 * (CÓDIGO-8)».
 * @param {ListItemParts} parts
 * @returns {string}
 */
export function listItem({ brandName, code, name, quantity, variant } = {}) {
  return [productLabel({ brandName, code, name }), clean(quantity), clean(variant)].filter(Boolean).join(', ');
}

/**
 * El mensaje de la lista:
 *
 *     {opening}
 *     1. {renglón}
 *     2. …
 *     También necesito: {texto}            ← solo con productos; un texto de varias líneas va en las líneas siguientes
 *     Entrega en (ciudad o código postal): {texto}
 *     Fecha requerida: {texto}
 *
 * `items` son textos (`listItem`); aquí se numeran. `note` pasa por `cleanLines(note, 10000)`: sin productos, sus líneas
 * siguen directamente a la apertura. `delivery` y `date` van en una línea cada uno (`cleanQuery`, hasta 200 caracteres).
 * Sin productos ni texto aparecen las tres líneas de ejemplo de la plantilla de siempre (`messages.list()`).
 * @param {ListMessageParts} parts
 * @returns {string}
 */
export function composeListMessage({ opening, items = [], note = '', delivery = '', date = '' }) {
  const lines = [clean(opening)];
  const products = (Array.isArray(items) ? items : []).map(item => clean(item)).filter(Boolean);
  const notes = cleanLines(note, MAX_NOTE_LENGTH);
  products.forEach((item, index) => lines.push(`${index + 1}. ${item}`));
  if (products.length > 0 && notes) {
    const [first, ...rest] = notes.split('\n');
    if (rest.length === 0) lines.push(field(MESSAGE_LABELS.also, first));
    else lines.push(`${MESSAGE_LABELS.also}:`, first, ...rest);
  } else if (notes) lines.push(...notes.split('\n'));
  else if (products.length === 0) lines.push(...LIST_PLACEHOLDERS);
  const oneLine = (/** @type {unknown} */ value) => Array.from(cleanQuery(value)).slice(0, MAX_LINE_LENGTH).join('').trim();
  lines.push(field(DELIVERY_LABEL, oneLine(delivery)), field(MESSAGE_LABELS.date, oneLine(date)));
  return lines.join('\n');
}

/**
 * Para el navegador: agrega la dirección de la página al mensaje de un enlace de cotización
 * (WhatsApp o correo) construido sin ella. Si el mensaje ya trae una línea «Enlace», no cambia nada.
 *
 *     link.href = withPageLink(link.href, location.origin + location.pathname);
 *
 * @param {unknown} href Valor actual de `href`.
 * @param {unknown} pageUrl Dirección absoluta de la página.
 * @returns {string}
 */
export function withPageLink(href, pageUrl) {
  return rewriteMessage(href, text => addLinkLine(text, pageUrl));
}

/**
 * Para el navegador: escribe lo que el cliente buscó en la línea «Descripción o uso» de un enlace
 * de solicitud especial (WhatsApp o correo). En cualquier otro enlace no cambia nada.
 * @param {unknown} href Valor actual de `href`.
 * @param {unknown} description Texto de la búsqueda; se recorta a 200 caracteres.
 * @returns {string}
 */
export function withRequestDescription(href, description) {
  return rewriteMessage(href, text => setDescriptionLine(text, description));
}

/**
 * Crea los enlaces y las plantillas de mensaje para un negocio. Las páginas no llaman a esta función:
 * usan `contact.mjs`, que ya la aplica a `src/data/business.json`.
 * @param {ContactSettings} settings
 * @returns {Contact}
 */
export function createContact(settings) {
  const digits = clean(settings?.whatsappDigits);
  const email = clean(settings?.email);
  const firstName = clean(settings?.contactFirstName);
  const business = clean(settings?.name);
  if (!/^\d{8,15}$/.test(digits)) throw new Error('Contacto: whatsappDigits debe contener solo dígitos (de 8 a 15).');
  // El número que muestran las páginas (whatsappDisplay) y el que abren los enlaces (whatsappDigits) son el mismo:
  // las mismas cifras, con los espacios y signos que se quieran para mostrarlo. Se revisa aquí porque contact.mjs
  // llama a createContact con business.json al cargarse, y toda página que muestra el número o un enlace pasa por
  // contact.mjs: si no coinciden, la compilación se detiene. Este archivo también llega al navegador y no nombra
  // archivos: contact.mjs (contactFromBusiness) añade al error dónde están los datos.
  const display = clean(settings?.whatsappDisplay);
  if (!display) throw new Error('Contacto: falta whatsappDisplay, el número que muestran las páginas; sus cifras deben ser las de whatsappDigits.');
  if (display.replace(/\D/g, '') !== digits) {
    throw new Error(`Contacto: whatsappDisplay («${display}») y whatsappDigits («${digits}») no son el mismo número: las páginas mostrarían uno y los enlaces abrirían otro. Corrige uno de los dos en los datos del negocio.`);
  }
  if (!/^[^\s@?&#%]+@[^\s@?&#%]+\.[^\s@?&#%]+$/.test(email)) throw new Error('Contacto: email no tiene forma de dirección de correo.');
  if (!firstName || !business) throw new Error('Contacto: faltan contactFirstName o name.');

  const hello = `Hola, ${firstName}.`;
  // Línea de apertura del plan (R-QUOTE-05): abre el mensaje general y el de producto. Se escribe una sola vez
  // para que los dos no se separen. Los demás mensajes dicen para qué escribe el cliente y abren a su manera.
  const quoteOpening = `${hello} Quiero solicitar una cotización con ${business}.`;
  const lines = (/** @type {string[]} */ ...parts) => parts.join('\n');
  /** @param {string | null} [text] */
  const whatsappUrl = text => buildWhatsappUrl(digits, text);
  /** @param {EmailParts} [parts] */
  const mailtoUrl = parts => buildMailtoUrl(email, parts);

  /** @type {ContactMessages} */
  const messages = {
    general: () => quoteOpening,
    product: product => addLinkLine(lines(
      quoteOpening,
      field('Producto', productLabel(product)),
      field(MESSAGE_LABELS.variant),
      field(MESSAGE_LABELS.quantity),
      field(DELIVERY_LABEL),
      field(MESSAGE_LABELS.date),
      field(MESSAGE_LABELS.also),
    ), product?.url),
    // La plantilla de siempre: la lista sin productos ni texto. La página de cotizar la completa en el navegador con
    // `composeListMessage`, tomando la apertura del enlace (`messageOf(href).split('\n')[0]`).
    list: () => composeListMessage({ opening: `${hello} Quiero cotizar esta lista con ${business}:` }),
    specialRequest: options => setDescriptionLine(lines(
      `${hello} Busco un producto que no encuentro en el catálogo de ${business}.`,
      field(DESCRIPTION_LABEL),
      field(MESSAGE_LABELS.model),
      field(MESSAGE_LABELS.quantity),
      field(DELIVERY_LABEL),
      field(MESSAGE_LABELS.date),
      'Puedo enviar una foto o archivo en esta conversación.',
    ), options?.query),
    brand: brandName => {
      const brand = clean(brandName);
      return lines(
        brand ? `${hello} Busco un producto de la marca ${brand}.` : `${hello} Busco un producto.`,
        field('Modelo o descripción'),
        field(MESSAGE_LABELS.quantity),
      );
    },
    category: categoryName => {
      const category = inlineCategoryName(categoryName);
      return lines(
        category ? `${hello} Busco productos de ${category}.` : `${hello} Busco productos.`,
        field('Qué necesito'),
        field(MESSAGE_LABELS.quantity),
      );
    },
    datasheet: product => {
      const label = productLabel(product);
      const question = label ? `¿Me puedes compartir la ficha técnica de ${label}?` : '¿Me puedes compartir una ficha técnica?';
      return addLinkLine(`${hello} ${question}`, product?.url);
    },
    // Producto retirado (R-STATE-04): pide una alternativa; la línea «Enlace» sigue la regla de los demás mensajes.
    retired: product => addLinkLine(lines(
      `${hello} Busco una alternativa a un producto que ya no está en el catálogo de ${business}.`,
      field('Producto', productLabel(product)),
      field('Para qué lo uso'),
      field(MESSAGE_LABELS.quantity),
      field(DELIVERY_LABEL),
      field(MESSAGE_LABELS.date),
    ), product?.url),
  };

  /** @param {string} title @param {string} detail */
  const withDetail = (title, detail) => (detail ? `${title}: ${detail}` : title);
  /** @type {ContactSubjects} */
  const subjects = {
    general: () => 'Solicitud de cotización',
    product: product => withDetail('Solicitud de cotización', codeLabel(product)),
    list: () => 'Lista para cotizar',
    specialRequest: () => 'Solicitud especial',
    brand: brandName => (clean(brandName) ? `Consulta sobre la marca ${clean(brandName)}` : 'Consulta sobre una marca'),
    category: categoryName => (clean(categoryName) ? `Consulta sobre ${clean(categoryName)}` : 'Consulta sobre una categoría'),
    datasheet: product => withDetail('Ficha técnica', codeLabel(product)),
    retired: product => withDetail('Consulta de alternativas', codeLabel(product)),
  };

  /**
   * @param {string} subject
   * @param {string} text
   * @returns {ContactLinkPair}
   */
  const pair = (subject, text) => ({ whatsapp: whatsappUrl(text), mailto: mailtoUrl({ subject, body: text }), subject, text });
  /** @type {ContactLinks} */
  const contactLinks = {
    general: () => pair(subjects.general(), messages.general()),
    product: product => pair(subjects.product(product), messages.product(product)),
    list: () => pair(subjects.list(), messages.list()),
    specialRequest: options => pair(subjects.specialRequest(), messages.specialRequest(options)),
    brand: brandName => pair(subjects.brand(brandName), messages.brand(brandName)),
    category: categoryName => pair(subjects.category(categoryName), messages.category(categoryName)),
    datasheet: product => pair(subjects.datasheet(product), messages.datasheet(product)),
    retired: product => pair(subjects.retired(product), messages.retired(product)),
  };

  return Object.freeze({
    whatsappUrl,
    mailtoUrl,
    messages: Object.freeze(messages),
    subjects: Object.freeze(subjects),
    contactLinks: Object.freeze(contactLinks),
  });
}
