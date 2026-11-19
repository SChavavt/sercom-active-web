// @ts-check
// Enlaces de contacto y plantillas de mensaje, sin datos del negocio: todo llega como argumento.
// Apto para el navegador y para node:test: solo importa `text.mjs` (la limpieza del texto del visitante).
// Las páginas usan `contact.mjs` al compilar; un <script> de navegador solo necesita de aquí
// `withPageLink` y `withRequestDescription`, que completan un enlace ya construido.
/** @import { Contact, ContactLinkPair, ContactLinks, ContactMessages, ContactSettings, ContactSubjects, EmailParts, ProductReference } from '../types/contact.ts' */
import { cleanQuery } from './text.mjs';

const LINK_LABEL = 'Enlace';
const DESCRIPTION_LABEL = 'Descripción o uso';
const DELIVERY_LABEL = 'Entrega en (ciudad o código postal)';
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
 * La limpia `cleanQuery`, la misma función que la búsqueda del catálogo (`displayQuery`): sin el carácter de
 * reemplazo, controles, caracteres de dirección, invisibles ni mitades sueltas de un par sustituto.
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

/**
 * Aplica un cambio al texto del mensaje de un enlace de WhatsApp o de correo ya construido.
 * Cualquier otro enlace, o uno con codificación inválida, se devuelve igual.
 * @param {unknown} href
 * @param {(text: string) => string} transform
 * @returns {string}
 */
function rewriteMessage(href, transform) {
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
    if (base.startsWith('https://wa.me/')) {
      const text = read('text');
      return text ? buildWhatsappUrl(base.slice('https://wa.me/'.length), transform(text)) : value;
    }
    if (base.startsWith('mailto:')) {
      const body = read('body').replace(/\r\n?/g, '\n');
      return body ? buildMailtoUrl(base.slice('mailto:'.length), { subject: read('subject'), body: transform(body) }) : value;
    }
  } catch {
    // Codificación inválida: el enlace se deja como estaba.
  }
  return value;
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
      field('Variante (talla o color)'),
      field('Cantidad y unidad'),
      field(DELIVERY_LABEL),
      field('Fecha requerida'),
      field('También necesito'),
    ), product?.url),
    list: () => lines(
      `${hello} Quiero cotizar esta lista con ${business}:`,
      '1. (marca y código o descripción), (cantidad y unidad), (talla o color)',
      '2. ',
      '3. ',
      field(DELIVERY_LABEL),
      field('Fecha requerida'),
    ),
    specialRequest: options => setDescriptionLine(lines(
      `${hello} Busco un producto que no encuentro en el catálogo de ${business}.`,
      field(DESCRIPTION_LABEL),
      field('Marca o modelo (si lo tengo)'),
      field('Cantidad y unidad'),
      field(DELIVERY_LABEL),
      field('Fecha requerida'),
      'Puedo enviar una foto o archivo en esta conversación.',
    ), options?.query),
    brand: brandName => {
      const brand = clean(brandName);
      return lines(
        brand ? `${hello} Busco un producto de la marca ${brand}.` : `${hello} Busco un producto.`,
        field('Modelo o descripción'),
        field('Cantidad y unidad'),
      );
    },
    category: categoryName => {
      const category = inlineCategoryName(categoryName);
      return lines(
        category ? `${hello} Busco productos de ${category}.` : `${hello} Busco productos.`,
        field('Qué necesito'),
        field('Cantidad y unidad'),
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
      field('Cantidad y unidad'),
      field(DELIVERY_LABEL),
      field('Fecha requerida'),
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
