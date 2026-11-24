// Revisión del texto de las fichas de src/data/catalog.json frente a las reglas de redacción del sitio. La corre
// `npm run validate:catalog` (scripts/validate-catalog.mjs), y con ella `npm run check`, `npm run build` y
// `npm run build:preview`: una ficha con un problema detiene las dos compilaciones, aunque sea un borrador.
//
// El texto de una ficha es editorial: se escribe para este sitio, con sus palabras, a partir de lo que publica el
// fabricante. No hay excepción de «texto del fabricante»: cada regla de redacción vale para él. Lo que cambia es cuándo
// y cómo se informa: aquí, antes de aprobar la ficha, con la ficha, el campo, la regla y el texto encontrado, en lugar
// de en el escaneo de la página compilada, que nombra una página.
//
// Las reglas no se copian: son las del escáner (scripts/scan-dist.mjs), con las que se revisa una página de
// producción (`textFindings`), cada una aplicada al texto del campo. Un WARN cuenta como problema, porque producción se
// revisa con --strict. Las frases permitidas del escáner son textos del sitio y no se aplican aquí.
//
// Además:
//   - una norma va solo en `standards`: en su texto no se aplica R-RULE-04 (sus dos patrones), y en cualquier otro
//     campo una norma se informa diciendo dónde va;
//   - un número con forma de teléfono (la expresión de R-RULE-24 para el texto visible) solo puede ir en `model` y en
//     `manufacturerCode`: un número largo es un código, no va en el texto;
//   - una dirección de correo no va en ninguna ficha (R-RULE-24), ni un enlace o una nota del registro de investigación
//     (R-RULE-13, la misma lista y la misma comparación que usa el escáner: un enlace del registro escrito de otra forma
//     de la misma página también cuenta, src/lib/address-match.mjs); un documento o una foto por dirección que enlazan el registro
//     tampoco, salvo un enlace del fabricante publicado en brands.json: un documento puede enlazar el catálogo de su
//     marca (en PDF o en línea) o su sitio;
//   - las direcciones que publica la ficha (cada documento, la foto por dirección y la página de donde viene la foto) no
//     se revisan como frases: el escáner no las lee así cuando la página las escribe enteras en un atributo, porque son
//     del fabricante. Sí se revisan con lo que el escáner todavía encuentra en ellas (`addressFindings`: la marca
//     excluida, las marcas de los ejemplos, la dirección del negocio, un mapa, una confirmación, la paleta anterior, un
//     campo de precio, un destino de contacto). El registro de investigación en ellas se revisa aparte, arriba.
//
// Límites: cada campo se revisa solo. El escáner lee una página como una sola línea, así que una regla también puede
// encontrar algo entre dos campos que quedan juntos en la página; eso solo lo ve el escaneo de la página compilada,
// cuando la ficha ya está aprobada. Y no hay excepciones por ficha: si un producto real no se puede escribir sin una
// palabra que una regla rechaza (un modelo que ES esa palabra), el mensaje lo muestra y la excepción se diseña entonces,
// con ese caso a la vista.
import { addressFindings, emailAddresses, phoneShapedNumbers, registryFindings, registryLeaks, textFindings } from './scan-dist.mjs';

const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value);
const list = value => (Array.isArray(value) ? value : []);
const MAX_QUOTE = 80;
/** Un texto encontrado, para citarlo: en una línea y, si es largo, cortado. */
const quote = text => {
  const line = String(text).replace(/\s+/g, ' ').trim();
  return [...line].length > MAX_QUOTE ? `${[...line].slice(0, MAX_QUOTE).join('')}…` : line;
};

/**
 * Los campos de texto que se revisan de una ficha: [campo, valor, tipo]. `code`: `model` y `manufacturerCode`, donde
 * un número largo sí puede ir; `standard`: el texto de una norma, donde una norma sí puede ir.
 * @returns {[string, unknown, 'text' | 'code' | 'standard'][]}
 */
function textFields(product) {
  const fields = [['name', product.name, 'text'], ['model', product.model, 'code'], ['description', product.description, 'text'], ['saleUnit', product.saleUnit, 'text']];
  list(product.characteristics).forEach((value, i) => fields.push([`characteristics[${i}]`, value, 'text']));
  list(product.variants).forEach((variant, i) => {
    if (!isRecord(variant)) return;
    fields.push([`variants[${i}].label`, variant.label, 'text'], [`variants[${i}].manufacturerCode`, variant.manufacturerCode, 'code']);
  });
  list(product.standards).forEach((standard, i) => {
    if (isRecord(standard)) fields.push([`standards[${i}].text`, standard.text, 'standard']);
  });
  list(product.documents).forEach((document, i) => {
    if (isRecord(document)) fields.push([`documents[${i}].label`, document.label, 'text']);
  });
  // La foto es opcional: solo se revisa su texto alternativo cuando la ficha tiene una.
  if (isRecord(product.image)) fields.push(['image.alt', product.image.alt, 'text']);
  return fields.filter(([, value]) => typeof value === 'string');
}

/**
 * Las direcciones que publica una ficha: [campo, dirección, qué hacer si el escaneo la rechazaría].
 * @returns {[string, unknown, string][]}
 */
function addressFields(product) {
  const fields = [];
  list(product.documents).forEach((document, i) => {
    if (isRecord(document)) fields.push([`documents[${i}].url`, document.url, 'enlaza otra página o documento del fabricante para este producto.']);
  });
  if (isRecord(product.image)) {
    fields.push(['image.url', product.image.url, 'usa otra dirección de la foto o guarda la foto en src/assets/productos/.']);
    fields.push(['image.sourceUrl', product.image.sourceUrl, 'escribe otra página del fabricante de donde viene la foto.']);
  }
  return fields.filter(([, value]) => typeof value === 'string');
}

/**
 * Revisa el texto de cada ficha del catálogo, en cualquier estado.
 * @param {unknown} catalog Contenido de src/data/catalog.json.
 * @param {{ registry: unknown, brands: unknown, examples?: unknown }} sources El registro de investigación,
 *   src/data/brands.json y el archivo de ejemplos (sus códigos no van en una dirección publicada).
 * @returns {string[]} Un mensaje por problema, con la ficha, el campo, la regla y qué hacer; lista vacía si no hay.
 */
export function reviewCatalogText(catalog, { registry, brands, examples = [] }) {
  const products = isRecord(catalog) ? list(catalog.products) : [];
  const leaks = registryLeaks(registry, brands);
  const messages = [];
  products.forEach((product, index) => {
    if (!isRecord(product)) return;
    const named = typeof product.id === 'string' && product.id.trim() ? ` (${product.id})` : '';
    const at = field => `products[${index}].${field}${named}`;

    for (const [field, value, kind] of textFields(product)) {
      for (const { id, title, found } of textFindings(value, { skip: kind === 'standard' ? ['R-RULE-04'] : [] })) {
        const what = id === 'R-RULE-04'
          ? 'Una norma va solo en standards, con la página o el documento del fabricante donde consta; aquí escríbelo de otra forma o quítalo.'
          : 'Escríbelo de otra forma.';
        messages.push(`${at(field)}: ${id}, ${title}: «${quote(found)}». ${what}`);
      }
      if (kind !== 'code') {
        for (const match of phoneShapedNumbers(value)) {
          messages.push(`${at(field)}: R-RULE-24, número con forma de teléfono: «${quote(match[0])}». Un número así va en model o en el manufacturerCode de su variante, no en el texto; escríbelo de otra forma.`);
        }
      }
      for (const address of emailAddresses(value)) {
        messages.push(`${at(field)}: R-RULE-24, dirección de correo: «${quote(address)}». Los datos de contacto no van en una ficha; quítala.`);
      }
      const { urls, notes } = registryFindings(value, leaks);
      for (const url of urls) {
        messages.push(`${at(field)}: R-RULE-13, lleva un enlace del registro de investigación, que no se publica: «${quote(url)}». Quítalo.`);
      }
      for (const note of notes) {
        messages.push(`${at(field)}: R-RULE-13, copia una nota interna del registro de investigación: «${quote(note)}». Escríbelo con tus palabras.`);
      }
    }

    // Las direcciones que se publican, con lo que el escaneo todavía encuentra en ellas. El registro de investigación
    // (R-RULE-13) se revisa aparte, abajo, solo en los documentos y en la foto por dirección.
    for (const [field, address, what] of addressFields(product)) {
      for (const { id, title, found } of addressFindings(address, { examples, skip: ['R-RULE-13'] })) {
        messages.push(`${at(field)}: ${id}, ${title}: «${quote(found)}». La dirección se publica tal como está escrita; ${what}`);
      }
    }

    // Los enlaces que se publican: cada documento y la foto por dirección.
    list(product.documents).forEach((document, i) => {
      if (!isRecord(document) || typeof document.url !== 'string') return;
      if (registryFindings(document.url, leaks).urls.length) {
        messages.push(`${at(`documents[${i}].url`)}: R-RULE-13, ese enlace es del registro de investigación y no está entre los enlaces del fabricante publicados en brands.json; enlaza la página o la ficha del producto en el sitio del fabricante, o el catálogo que publica su marca.`);
      }
    });
    if (isRecord(product.image) && typeof product.image.url === 'string' && registryFindings(product.image.url, leaks).urls.length) {
      messages.push(`${at('image.url')}: R-RULE-13, ese enlace es del registro de investigación y no se publica; usa la dirección de la foto en el sitio del fabricante o guarda la foto en src/assets/productos/.`);
    }
  });
  return messages;
}
