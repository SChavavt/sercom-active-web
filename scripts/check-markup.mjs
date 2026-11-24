#!/usr/bin/env node
// Comprobaciones del marcado de un sitio ya compilado: hechos de la cabecera, de la barra fija y del contenido
// (celdas de relleno de las retículas, dirección de correo, ruta de navegación, marcas de la página actual, página
// de un producto retirado y fotografías de producto), del aviso de arriba (que nada lo oculte), de los controles
// (que cada uno tenga una función nativa o un script de su página que lo nombre, y que ningún script vaya dentro de
// un <template>) y de la página de cotizar (que lleve lo que su script necesita según las páginas de producto de la
// compilación), que se leen en el HTML, en las hojas de estilo y en el código de cada página, sin navegador.
//
// Uso:  node scripts/check-markup.mjs [carpeta] [--preview]
//   carpeta     carpeta compilada; por omisión `dist`, o `dist-preview` con --preview
//   --preview   la compilación es la vista previa de diseño: hay productos, así que la cabecera debe tener el campo
//               de búsqueda (#buscador) con su botón Buscar
//
// Cada comprobación vive en CHECKS con su identificador (el del hallazgo de la revisión que la originó). Una
// comprobación recibe cada página ya leída (árbol de elementos, ruta publicada, el código de sus scripts) y cada hoja
// de estilo, con las opciones (el modo y todas las páginas de la compilación, para comparar una página con las demás),
// y devuelve mensajes; agregar otra es agregar una entrada a CHECKS.
//
// Qué no revisa: el resultado visual (anchos, solapes, foco, colores) ni lo que hace un control al usarlo (solo que
// un script de su página lo nombra). Eso se revisa a mano en un navegador (docs/diseno.md, sección 15): el
// repositorio no tiene pruebas con navegador.
//
// Termina con código 1 si encuentra problemas y con 2 si la carpeta no existe o no tiene páginas HTML.
import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { routes } from '../src/lib/routes.mjs';
import { isLongProductName } from '../src/lib/product-title.mjs';
import { resultSummary } from '../src/lib/search.mjs';

// ---------------------------------------------------------------------------------------------------
// Lectura de HTML: un árbol de elementos sencillo (Astro escribe HTML bien formado)
// ---------------------------------------------------------------------------------------------------

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);
const ATTRIBUTE = /\s*([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/y;
const decodeEntities = text => text
  .replace(/&nbsp;/g, '\u00a0').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
  .replace(/&amp;/g, '&');

/**
 * @typedef {{ name: string, attributes: Map<string, string>, children: Element[], parent: Element | null, text: string[], content: (string | Element)[], order: number, source?: string }} Element
 */

/**
 * Árbol de elementos de un documento. Cada elemento lleva su orden en el documento (`order`), su texto directo
 * (`text`) y su contenido tal como se lee (`content`: el texto directo y los elementos hijos, en su orden).
 * El contenido de <script>, <style>, <textarea> y <title> no se interpreta. Las hojas <style> se devuelven aparte;
 * el contenido de un <script> va tal cual en su `source` (no es texto del elemento ni de la página).
 * @param {string} source
 */
export function parseHtml(source) {
  const html = source.replace(/<!--[\s\S]*?-->/g, '');
  const lower = html.toLowerCase();
  /** @type {Element} */
  const root = { name: '#document', attributes: new Map(), children: [], parent: null, text: [], content: [], order: 0 };
  /** @type {string[]} */
  const styles = [];
  let current = root;
  let order = 0;
  /** Anota un texto en su elemento: en el texto directo y, en su lugar, en el contenido. */
  const addText = (element, raw) => {
    const text = decodeEntities(raw);
    element.text.push(text);
    element.content.push(text);
  };
  const tag = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)/g;
  let last = 0;
  let match;
  while ((match = tag.exec(html))) {
    const between = html.slice(last, match.index);
    // El espacio suelto entre dos elementos (también &nbsp;) no es texto del elemento, pero sí parte de cómo se lee:
    // va al contenido en su lugar (un espacio normal es un punto donde el renglón puede partirse; uno de no separación, no).
    if (decodeEntities(between).trim()) addText(current, between);
    else if (between) current.content.push(decodeEntities(between));
    const [, closing, rawName] = match;
    const name = rawName.toLowerCase();
    if (closing) {
      const end = html.indexOf('>', tag.lastIndex);
      last = tag.lastIndex = end === -1 ? html.length : end + 1;
      // Cierra hasta el elemento abierto del mismo nombre (si no está abierto, se ignora).
      for (let node = current; node && node !== root; node = node.parent) {
        if (node.name === name) { current = node.parent; break; }
      }
      continue;
    }
    const attributes = new Map();
    let position = tag.lastIndex;
    for (;;) {
      ATTRIBUTE.lastIndex = position;
      const found = ATTRIBUTE.exec(html);
      if (!found) break;
      const key = found[1].toLowerCase();
      if (!attributes.has(key)) attributes.set(key, decodeEntities(found[2] ?? found[3] ?? found[4] ?? ''));
      position = ATTRIBUTE.lastIndex;
    }
    const end = html.indexOf('>', position);
    const selfClosing = end > 0 && html[end - 1] === '/';
    let next = end === -1 ? html.length : end + 1;
    /** @type {Element} */
    const element = { name, attributes, children: [], parent: current, text: [], content: [], order: ++order };
    current.children.push(element);
    current.content.push(element);
    if (RAW_TEXT.has(name)) {
      const close = lower.indexOf(`</${name}`, next);
      const content = html.slice(next, close === -1 ? html.length : close);
      if (name === 'style') styles.push(content);
      else if (name === 'script') element.source = content;
      else addText(element, content);
      const closeEnd = close === -1 ? html.length : html.indexOf('>', close) + 1;
      next = closeEnd || html.length;
    } else if (!VOID.has(name) && !selfClosing) {
      current = element;
    }
    last = tag.lastIndex = next;
  }
  return { root, styles };
}

/** Todos los elementos de un árbol, en orden del documento. */
export function allElements(node) {
  const list = [];
  const visit = element => { for (const child of element.children) { list.push(child); visit(child); } };
  visit(node);
  return list;
}
export const classesOf = element => (element.attributes.get('class') ?? '').split(/\s+/).filter(Boolean);
export const hasClass = (element, name) => classesOf(element).includes(name);
/** El texto de un elemento como se lee: el suyo y el de sus hijos, en el orden del documento. */
export const textOf = element => element.content.map(part => (typeof part === 'string' ? part : textOf(part))).join(' ').replace(/\s+/g, ' ').trim();
/** El texto de un elemento tal como está escrito (entidades resueltas, espacios intactos), sin separar los elementos. */
export const rawText = element => element.content.map(part => (typeof part === 'string' ? part : rawText(part))).join('');
/** Lo que no se ve de un elemento: el texto solo para lectores de pantalla (`.vh`) y lo marcado aria-hidden="true". */
const isUnseen = element => hasClass(element, 'vh') || element.attributes.get('aria-hidden') === 'true';
/** El texto que se ve de un elemento, tal como está escrito (sin `.vh` ni aria-hidden="true", espacios intactos). */
export const visibleText = element => element.content
  .map(part => (typeof part === 'string' ? part : isUnseen(part) ? '' : visibleText(part))).join('');
// Lo que no se dibuja: espacios, controles, caracteres de formato (de ancho cero, guion suave, de dirección) y los que
// Unicode marca para ignorar al dibujar.
const NOT_DRAWN = /[\s\p{Cc}\p{Cf}\p{DI}]/gu;
/**
 * Las partes de una variante en el orden del documento (R-VARIANTE-01): `{ hidden }` con el texto de cada elemento
 * `.vh`, y `{ shown }` con cada tramo de texto que se ve, sin los caracteres que no se dibujan (`NOT_DRAWN`). Lo marcado
 * aria-hidden="true" o con el atributo `hidden` no cuenta. Un tramo que no dibuja nada no se guarda.
 * @returns {({ hidden: string } | { shown: string })[]}
 */
function variantShown(element) {
  const parts = [];
  for (const part of element.content) {
    if (typeof part === 'string') {
      const drawn = part.replace(NOT_DRAWN, '');
      if (drawn) parts.push({ shown: drawn });
    } else if (hasClass(part, 'vh')) parts.push({ hidden: textOf(part) });
    else if (part.attributes.get('aria-hidden') !== 'true' && !part.attributes.has('hidden')) parts.push(...variantShown(part));
  }
  return parts;
}
/**
 * El nombre accesible de un enlace como lo calcula esta revisión: su `aria-label` o, sin él, su texto, también el oculto
 * para la vista (`.vh`), sin lo marcado aria-hidden="true".
 */
const accessibleName = element => (element.attributes.get('aria-label') ?? element.content
  .map(part => (typeof part === 'string' ? part : part.attributes.get('aria-hidden') === 'true' ? '' : accessibleName(part))).join(' ')).replace(/\s+/g, ' ').trim();
/** Lo que dice, para los lectores de pantalla, un enlace que abre otra pestaña (MoreLink y ActionRow con `external`). */
const NEW_TAB_TEXT = '(se abre en otra pestaña)';
/** Los destinos (`target`) que no abren otra pestaña; cualquier otro nombre sí («_blank», «_new», «nueva»). */
const SAME_TAB_TARGETS = ['', '_self', '_parent', '_top'];
/**
 * Un `<a>` o un `<area>` que abre otra pestaña: su `target`, en minúsculas y como está escrito (un espacio o un tabulador
 * también cuentan: « _self» abre otra pestaña), no es uno de `SAME_TAB_TARGETS`.
 */
const opensAnotherTab = element => (element.name === 'a' || element.name === 'area')
  && element.attributes.has('target') && !SAME_TAB_TARGETS.includes((element.attributes.get('target') ?? '').toLowerCase());
/**
 * Por qué el lector de pantalla no lee el texto oculto `notice` del enlace `link`, o null si lo lee: sube desde el
 * texto hasta el enlace (sin contarlo) y da el primer motivo que encuentra: otro `<a>` en medio, un `<template>`,
 * aria-hidden="true", el atributo hidden o un style en línea con display:none, visibility:hidden o collapse, o
 * content-visibility:hidden. Una regla de una hoja de estilo que lo esconda no se ve aquí.
 */
const unreadBecause = (notice, link) => {
  for (let node = notice; node && node !== link; node = node.parent) {
    if (node.name === 'a' && node !== notice) return 'está dentro de otro enlace (<a>), y el navegador cierra el primero donde empieza el segundo; ponlo en el enlace mismo';
    if (node.name === 'template') return 'está dentro de un <template>, que el navegador no muestra ni lee; ponlo fuera';
    if ((node.attributes.get('aria-hidden') ?? '').trim().toLowerCase() === 'true') return 'está dentro de aria-hidden="true" y no se lee; ponlo fuera';
    if (node.attributes.has('hidden')) return 'está escondido con el atributo hidden y no se lee; ponlo fuera';
    const hiding = declarationsOf(node.attributes.get('style') ?? '').find(hidesElement);
    if (hiding) return `está escondido con style="${hiding.property}:${hiding.value.toLowerCase()}" y no se lee; ponlo fuera`;
  }
  return null;
};
/** Dos destinos de /marcas/ son el mismo lugar si difieren solo en las diagonales del final de la ruta. */
const samePlace = (a, b) => {
  const place = href => href.replace(/^([^?#]*?)\/+(?=$|[?#])/, '$1');
  return place(a) === place(b);
};
/** Un texto para comparar: sin distinguir mayúsculas y con los espacios seguidos como uno. */
const loose = text => text.replace(/\s+/g, ' ').trim().toLowerCase();
/** El primer elemento de `node` (incluido) hacia arriba que cumple `test`. */
export function closest(node, test) {
  for (let element = node; element && element.name !== '#document'; element = element.parent) if (test(element)) return element;
  return null;
}
const describe = element => {
  const id = element.attributes.get('id');
  const classes = classesOf(element);
  return `<${element.name}${id ? `#${id}` : ''}${classes.length ? `.${classes.join('.')}` : ''}>`;
};

// ---------------------------------------------------------------------------------------------------
// Lectura de CSS: selectores de cada regla
// ---------------------------------------------------------------------------------------------------

/**
 * Selectores de una hoja de estilo, uno por elemento de cada lista de selectores (sin @media ni @font-face).
 * Los comentarios se quitan; las cadenas se conservan tal cual (un «{» o un «;» dentro de una cadena no corta nada).
 * @param {string} css
 */
export function cssSelectors(css) {
  const selectors = [];
  let buffer = '';
  for (let i = 0; i < css.length; i++) {
    const char = css[i];
    if (char === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end === -1 ? css.length : end + 1;
    } else if (char === '"' || char === "'") {
      const end = stringEnd(css, i);
      buffer += css.slice(i, end);
      i = end - 1;
    } else if (char === '\\') {
      buffer += css.slice(i, i + 2);
      i++;
    } else if (char === '{') {
      // El texto antes de cada «{» es un selector o una regla @; las declaraciones no contienen llaves.
      const prelude = buffer.trim();
      buffer = '';
      if (!prelude || prelude.startsWith('@') || /^(?:from|to|\d+(?:\.\d+)?%)(?:\s*,|$)/.test(prelude)) continue;
      selectors.push(...splitSelectorList(prelude));
    } else if (char === '}' || char === ';') {
      buffer = '';
    } else {
      buffer += char;
    }
  }
  return selectors;
}
// Reglas condicionales que, anidadas en una regla de estilo, pueden llevar declaraciones para los selectores de fuera.
const NESTED_GROUP_RULE = /^@(?:media|supports|layer|container|scope)\b/i;
/**
 * Reglas de estilo de una hoja: sus selectores, sus declaraciones (sin los comentarios) y las reglas @ que la
 * contienen, de fuera hacia dentro («@media print»). Las reglas de @keyframes y @font-face no son reglas de estilo.
 * Una regla anidada dentro de otra lleva los selectores de las dos unidos («&» es el de fuera). Las declaraciones
 * escritas directamente dentro de una regla condicional anidada en una regla de estilo (@media, @supports, @layer,
 * @container, @scope) son otra regla, con los selectores de fuera y las reglas @ que la contienen, ella incluida:
 * «.a { @media screen { display: none } }» da { selectors: [".a"], conditions: ["@media screen"] }. Las de
 * @starting-style no cuentan: solo dan el punto de partida de una transición, no el estilo del elemento.
 * @param {string} css
 * @returns {{ selectors: string[], declarations: string, conditions: string[] }[]}
 */
export function cssRules(css) {
  /** @type {{ selectors: string[], declarations: string, conditions: string[] }[]} */
  const rules = [];
  /** @type {({ at: string } | { rule: { selectors: string[], declarations: string, conditions: string[] } } | { at: string, rule: { selectors: string[], declarations: string, conditions: string[] } } | { skip: true })[]} */
  const stack = [];
  let buffer = '';
  const top = () => stack[stack.length - 1];
  for (let i = 0; i < css.length; i++) {
    const char = css[i];
    if (char === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end === -1 ? css.length : end + 1;
    } else if (char === '"' || char === "'") {
      const end = stringEnd(css, i);
      buffer += css.slice(i, end);
      i = end - 1;
    } else if (char === '\\') {
      buffer += css.slice(i, i + 2);
      i++;
    } else if (char === '{') {
      const current = top();
      const prelude = (current && 'rule' in current ? buffer.slice(buffer.lastIndexOf(';') + 1) : buffer).trim();
      if (current && 'rule' in current) current.rule.declarations += buffer.slice(0, buffer.lastIndexOf(';') + 1);
      buffer = '';
      if (prelude.startsWith('@')) {
        const at = prelude.replace(/\s+/g, ' ');
        const parent = [...stack].reverse().find(entry => 'rule' in entry);
        if (/^@(?:-\w+-)?(?:keyframes|font-face|counter-style|font-feature-values|property|page)\b/i.test(prelude) || stack.some(entry => 'skip' in entry)) {
          stack.push({ skip: true });
        } else if (parent && 'rule' in parent && NESTED_GROUP_RULE.test(prelude)) {
          // Una regla condicional dentro de una regla de estilo («.a { @media screen { display: none } }»): sus
          // declaraciones son de los selectores de fuera, con las condiciones reunidas hasta aquí.
          const conditions = [...stack.flatMap(entry => ('at' in entry ? [entry.at] : [])), at];
          const rule = { selectors: parent.rule.selectors, declarations: '', conditions };
          rules.push(rule);
          stack.push({ at, rule });
        } else {
          stack.push({ at });
        }
      } else if (stack.some(entry => 'skip' in entry)) {
        stack.push({ skip: true });
      } else {
        const parent = [...stack].reverse().find(entry => 'rule' in entry);
        const own = splitSelectorList(prelude);
        const selectors = parent && 'rule' in parent
          ? parent.rule.selectors.flatMap(outer => own.map(inner => (inner.includes('&') ? inner.split('&').join(outer) : `${outer} ${inner}`)))
          : own;
        const rule = { selectors, declarations: '', conditions: stack.flatMap(entry => ('at' in entry ? [entry.at] : [])) };
        rules.push(rule);
        stack.push({ rule });
      }
    } else if (char === '}') {
      const current = stack.pop();
      if (current && 'rule' in current) current.rule.declarations += buffer;
      buffer = '';
    } else if (char === ';' && !(top() && 'rule' in top())) {
      buffer = '';
    } else {
      buffer += char;
    }
  }
  return rules;
}
/**
 * Declaraciones de un bloque de estilo («color: red; display: none !important»), con el nombre en minúsculas y el
 * valor sin «!important»; los escapes se resuelven y los comentarios se quitan.
 * @param {string} block
 */
export function declarationsOf(block) {
  const declarations = [];
  let part = '';
  const flush = () => {
    const colon = part.indexOf(':');
    if (colon > 0) {
      const property = unescapeCss(part.slice(0, colon).trim()).toLowerCase();
      const value = unescapeCss(part.slice(colon + 1)).replace(/!\s*important\s*$/i, '').trim();
      declarations.push({ property, value });
    }
    part = '';
  };
  for (let i = 0; i < block.length; i++) {
    if (block[i] === '/' && block[i + 1] === '*') {
      const end = block.indexOf('*/', i + 2);
      i = end === -1 ? block.length : end + 1;
    } else if (block[i] === '"' || block[i] === "'") {
      const end = stringEnd(block, i);
      part += block.slice(i, end);
      i = end - 1;
    } else if (block[i] === '\\') {
      part += block.slice(i, i + 2);
      i++;
    } else if (block[i] === ';') {
      flush();
    } else {
      part += block[i];
    }
  }
  flush();
  return declarations;
}
/** Posición siguiente al cierre de la cadena que empieza en `start`. */
function stringEnd(text, start) {
  const quote = text[start];
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === '\\') i++;
    else if (text[i] === quote) return i + 1;
  }
  return text.length;
}
/** Separa «a, b:is(c, d)» en ["a", "b:is(c, d)"]. */
function splitSelectorList(list) {
  const parts = [];
  let depth = 0, start = 0;
  for (let i = 0; i < list.length; i++) {
    if (list[i] === '"' || list[i] === "'") i = stringEnd(list, i) - 1;
    else if (list[i] === '\\') i++;
    else if (list[i] === '(' || list[i] === '[') depth++;
    else if (list[i] === ')' || list[i] === ']') depth--;
    else if (list[i] === ',' && depth === 0) { parts.push(list.slice(start, i).trim()); start = i + 1; }
  }
  parts.push(list.slice(start).trim());
  return parts.filter(Boolean);
}

/** Quita los escapes de CSS de un nombre o de un valor, como lo lee el navegador («se\61 rch» → «search»). */
export const unescapeCss = text => text.replace(/\\(?:([0-9a-fA-F]{1,6})[ \t\n\r\f]?|([^\n\r\f]))/g,
  (_, hex, char) => (hex ? String.fromCodePoint(Number.parseInt(hex, 16) || 0xfffd) : char));
const ESCAPE = String.raw`\\(?:[0-9a-fA-F]{1,6}[ \t\n\r\f]?|[^\n\r\f])`;
const ESCAPE_AT = new RegExp(ESCAPE, 'y');
const IDENT = new RegExp(String.raw`(?:${ESCAPE}|[\w\u00a0-\uffff-])+`, 'y');
// El nombre puede llevar delante un espacio de nombres («*|class», «|class», «svg|class»); «class|=» es el operador.
const ATTRIBUTE_SELECTOR = new RegExp(String.raw`^\s*(?:(?:\*|(?:${ESCAPE}|[\w-])+)?\|(?!=))?((?:${ESCAPE}|[\w-])+)\s*(?:([~|^$*]?=)\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|(?:${ESCAPE}|[^\s\]\\])+)\s*([iIsS])?)?\s*$`, 's');

/**
 * Lee un selector: las clases que nombra con «.» y sus selectores de atributo (lo que va entre corchetes y dentro de
 * las cadenas no son clases). Los escapes se resuelven. `unread` cuenta los corchetes que no se pudieron leer.
 * @param {string} selector
 */
function readSelector(selector) {
  const classes = [];
  const attributes = [];
  let unread = 0;
  for (let i = 0; i < selector.length;) {
    const char = selector[i];
    if (char === '"' || char === "'") {
      i = stringEnd(selector, i);
    } else if (char === '\\') {
      i += 2;
    } else if (char === '.') {
      IDENT.lastIndex = i + 1;
      const match = IDENT.exec(selector);
      if (match) classes.push(unescapeCss(match[0]));
      i = match ? IDENT.lastIndex : i + 1;
    } else if (char === '[') {
      let end = i + 1;
      while (end < selector.length && selector[end] !== ']') {
        if (selector[end] === '"' || selector[end] === "'") end = stringEnd(selector, end);
        else end += selector[end] === '\\' ? 2 : 1;
      }
      const match = ATTRIBUTE_SELECTOR.exec(selector.slice(i + 1, end));
      if (match) {
        const [, name, operator, raw, flag] = match;
        const value = raw === undefined ? null : unescapeCss(/^["']/.test(raw) ? raw.slice(1, -1) : raw);
        attributes.push({ name: unescapeCss(name).toLowerCase(), operator: operator ?? null, value, insensitive: flag?.toLowerCase() === 'i' });
      } else {
        unread++;
      }
      i = end + 1;
    } else {
      i++;
    }
  }
  return { classes, attributes, unread };
}
/** Clases que nombra un selector («.a .b__c:hover» → ["a", "b__c"]). */
export const selectorClasses = selector => readSelector(selector).classes;
/**
 * Selectores de atributo sobre `class` de un selector («[class~="nav" i]» → { operator: "~=", value: "nav", insensitive: true }).
 * @returns {{ operator: string | null, value: string | null, insensitive: boolean }[]}
 */
export const selectorAttributes = selector => readSelector(selector).attributes
  .filter(attribute => attribute.name === 'class')
  .map(({ operator, value, insensitive }) => ({ operator, value, insensitive }));

// ---------------------------------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------------------------------

/** Ruta publicada de una página: «marcas/ansell/index.html» → «/marcas/ansell/»; «404.html» → «/404.html». */
export function routeOf(file) {
  const path = `/${file.split('\\').join('/')}`;
  return path.replace(/(^|\/)index\.html?$/i, '$1');
}

// ---------------------------------------------------------------------------------------------------
// Comprobaciones
// ---------------------------------------------------------------------------------------------------

// Bloques genéricos que la cabecera ya no usa (U-07): ni la cabecera ni ninguna regla de las hojas globales usan
// «nav» o «search», ni sus elementos y variantes («nav__link», «search__input», «nav--x»). Así un elemento de página
// con esos nombres nunca hereda reglas de la cabecera. Las clases de la cabecera son «masthead__nav…» y «masthead__search…».
const RETIRED_HEADER_BLOCKS = ['nav', 'search'];
// Nombres que usó la cabecera, para los selectores de atributo que comparan una parte del valor («[class^=nav]»).
const RETIRED_HEADER_CLASSES = ['nav', 'nav__list', 'nav__link', 'nav__cat', 'nav__item--quote', 'search', 'search__input', 'search__btn'];
/** ¿La clase es de un bloque retirado? */
export const isRetiredClass = name => RETIRED_HEADER_BLOCKS.some(block => name === block || name.startsWith(`${block}__`) || name.startsWith(`${block}--`));
/**
 * ¿Un selector de atributo sobre `class` puede seleccionar un elemento por una de ciertas clases, como palabra entera
 * del atributo? `isWhole` dice si una palabra es una de esas clases; `names`, los nombres con los que se comparan las
 * partes de palabra («[class^=na]» puede ser el principio de «nav»).
 * «=» y «~=» comparan palabras enteras; «|=», el valor o su prefijo con guion; «^=», «$=» y «*=», una parte del valor.
 *
 * Con «^=», «$=» y «*=» cada palabra del valor se lee según lo que tiene a cada lado: un espacio (dentro del valor) o
 * el borde que fija el operador («^=» el principio del atributo, «$=» el final) es un límite de palabra; el borde
 * libre del valor puede seguir con cualquier letra. Una palabra con límite a ambos lados es entera; con límite solo
 * a la izquierda es el principio de una clase («[class*=" na"]», en «x nav»; «[class^="nav-"]», en «nav--open»); solo a la derecha, su final
 * («[class*="av "]», en «nav x»); sin ninguno, cualquier parte («[class*=av]»). Un valor de puros espacios cabe en
 * « nav ».
 * @param {{ operator: string | null, value: string | null, insensitive: boolean }} attribute
 * @param {{ isWhole: (word: string) => boolean, names: string[] }} target
 */
export function classAttributeCouldMatch({ operator, value, insensitive }, { isWhole, names }) {
  if (!operator || !value) return false;
  const text = insensitive ? value.toLowerCase() : value;
  const words = text.split(/\s+/).filter(Boolean);
  if (operator === '=' || operator === '~=') return words.some(isWhole);
  // «|=» pide el valor entero o el valor seguido de «-»: las palabras de delante son enteras; la última es entera o el
  // principio de una clase que sigue con «-» («[class|=site]» en «site-notice», «[class|="nav-"]» en «nav--open»).
  // «-x» representa cualquier continuación para las familias abiertas («nav--…»).
  if (operator === '|=') {
    // Con un espacio al final, todas las palabras del valor son enteras.
    const last = /\s$/.test(text) ? undefined : words[words.length - 1];
    return (last === undefined ? words : words.slice(0, -1)).some(isWhole)
      || (last !== undefined && (isWhole(last) || names.some(name => name.startsWith(`${last}-`)) || isWhole(`${last}-x`)));
  }
  if (!['^=', '$=', '*='].includes(operator)) return false;
  if (operator === '*=' && !words.length) return names.some(name => ` ${name} `.includes(text));
  const startBound = operator === '^=' || /^\s/.test(text);
  const endBound = operator === '$=' || /\s$/.test(text);
  return words.some((word, index) => {
    const left = index > 0 || startBound;
    const right = index < words.length - 1 || endBound;
    if (isWhole(word)) return true;
    if (left && right) return false;
    // Con límite solo a la izquierda empieza una clase: un nombre empieza con ella o, como con «|=», la palabra seguida
    // de «-x» es de una familia abierta («[class^="nav-"]» en «nav--open»).
    if (left) return names.some(name => name.startsWith(word)) || isWhole(`${word}-x`);
    if (right) return names.some(name => name.endsWith(word));
    return names.some(name => name.includes(word));
  });
}
/**
 * ¿Un selector de atributo sobre `class` puede seleccionar un elemento con una clase retirada?
 * @param {{ operator: string | null, value: string | null, insensitive: boolean }} attribute
 */
export const classAttributeIsRetired = attribute => classAttributeCouldMatch(attribute, { isWhole: isRetiredClass, names: RETIRED_HEADER_CLASSES });

/**
 * `code` es el código de la página: el de sus scripts en línea y el de los archivos de la carpeta que cargan (ver
 * `pageCode`); vacío si no lleva ninguno.
 * @typedef {{ file: string, route: string, root: Element, elements: Element[], code?: string }} Page
 * @typedef {{ file: string, css: string, selectors: string[] }} Sheet
 * `pages` son todas las páginas de la compilación: una comprobación que compara una página con las demás las lee ahí.
 * @typedef {{ preview: boolean, pages: Page[] }} Options
 * @typedef {{ id: string, title: string, page?: (page: Page, options: Options) => string[], sheet?: (sheet: Sheet, options: Options) => string[] }} Check
 */

/** El valor de tabindex como lo lee el navegador (espacios delante, signo, cifras; lo que sigue no cuenta); `null` si falta o no es un número. */
function tabindexOf(element) {
  const match = /^[\t\n\f\r ]*([+-]?\d+)/.exec(element.attributes.get('tabindex') ?? '');
  return match ? Number(match[1]) : null;
}
/** ¿El elemento se enfoca con Tab sin tabindex? Enlaces con href, botones, campos visibles, listas, áreas de texto y resúmenes. */
const isFocusable = element => (element.name === 'a' ? element.attributes.has('href')
  : element.name === 'input' ? (element.attributes.get('type') ?? '').toLowerCase() !== 'hidden'
    : ['button', 'select', 'textarea', 'summary'].includes(element.name));

/** Partes de la cabecera de una página; `null` si falta. */
function headerParts(page) {
  const header = page.elements.find(element => element.name === 'header' && hasClass(element, 'site-header'));
  if (!header) return null;
  const inHeader = allElements(header);
  const byId = id => inHeader.find(element => element.attributes.get('id') === id) ?? null;
  return {
    header,
    elements: inHeader,
    masthead: inHeader.find(element => hasClass(element, 'masthead')) ?? null,
    menu: byId('menu'),
    search: byId('buscador'),
    menuButton: inHeader.find(element => element.attributes.get('data-toggle') === 'menu') ?? null,
    searchButton: inHeader.find(element => element.attributes.get('data-toggle') === 'search') ?? null,
  };
}

/**
 * Entradas de la cabecera y de la barra fija que pueden marcar la ubicación actual, con su clave:
 * «nav:/marcas/» (enlace de la navegación), «nav:categorias» (el resumen Categorías), «cat:/categorias/manos/»
 * (categoría del panel; «cat:todo» es «Ver todo el catálogo»), «cta» (bloque «Cotizar mi lista»), «dock:/cotizar/»
 * (enlace de la barra fija) y «logo».
 * @param {Page} page
 */
function locationEntries(page, parts) {
  const entries = [];
  const add = (key, element) => entries.push({ key, element, value: element.attributes.get('aria-current') ?? null, label: textOf(element) || key });
  for (const element of parts.elements) {
    if (parts.menu && closest(element, node => node === parts.menu)) {
      if (element.name === 'summary') add('nav:categorias', element);
      else if (element.name === 'a' && hasClass(element, 'catpanel__link')) add(hasClass(element, 'catpanel__link--all') ? 'cat:todo' : `cat:${element.attributes.get('href')}`, element);
      else if (element.name === 'a') add(`nav:${element.attributes.get('href')}`, element);
      // Cualquier otro elemento de la navegación (un <li>, un <span> dentro de un enlace) nunca marca la ubicación.
      else if (element.attributes.has('aria-current')) add(`otro:${describe(element)}`, element);
    } else if (hasClass(element, 'masthead__cta')) add('cta', element);
    else if (hasClass(element, 'masthead__logo')) add('logo', element);
    else if (element.attributes.has('aria-current')) add(`otro:${describe(element)}`, element);
  }
  const dock = page.elements.find(element => element.name === 'nav' && hasClass(element, 'dock'));
  if (dock) {
    for (const element of allElements(dock)) {
      if (element.name === 'a') add(`dock:${element.attributes.get('href')}`, element);
      else if (element.attributes.has('aria-current')) add(`otro:${describe(element)}`, element);
    }
  }
  return { entries, dock };
}

/** Prefijo de las rutas con parámetro («/marcas/»), sacado de `routes` para no escribir las rutas aquí. */
const prefix = make => make('').slice(0, -1);

/**
 * Qué entradas deben marcar la ubicación en una ruta, y con qué valor. Las que no aparecen no se marcan.
 * @param {string} route
 * @returns {Record<string, 'page' | 'true'>}
 */
export function expectedLocation(route) {
  const path = route.split(/[?#]/)[0];
  const inside = make => path.startsWith(prefix(make)) && path.length > prefix(make).length;
  if (path === routes.home) return { logo: 'page' };
  if (path === routes.catalog) return { [`nav:${routes.catalog}`]: 'page' };
  if (path === routes.brands) return { [`nav:${routes.brands}`]: 'page' };
  if (path === routes.contact) return { [`nav:${routes.contact}`]: 'page' };
  if (path === routes.quoteList) return { [`nav:${routes.quoteList}`]: 'page', cta: 'page', [`dock:${routes.quoteList}`]: 'page' };
  if (inside(routes.brand)) return { [`nav:${routes.brands}`]: 'true' };
  if (inside(routes.category)) return { 'nav:categorias': 'true', [`cat:${path}`]: 'page' };
  if (inside(routes.product)) return { [`nav:${routes.catalog}`]: 'true' };
  return {};
}

// Celdas que solo completan en blanco la última fila de una retícula (docs/diseno.md).
const FILL_CLASSES = ['grid-fill', 'brands__fill', 'catalog-grid__fill', 'producto__more-fill', 'producto__chip-fill'];
const FOCUSABLE = ['a', 'button', 'input', 'select', 'textarea', 'summary'];
/** El primer hijo de `element` si lleva la clase `name`; si no, `null`. */
const leadingMark = (element, name) => (element.children[0] && hasClass(element.children[0], name) ? element.children[0] : null);

// Página informativa de un producto retirado (R-STATE-04): la página de un producto (/productos/{id}/) que lleva el
// aviso «Producto retirado» (RetiredProduct.astro). Que exista solo cuando los datos lo dicen lo revisa R-RULE-14 en
// scripts/scan-dist.mjs; aquí se revisa lo que la página muestra y lo que no. Los textos son los de las plantillas:
// una prueba avisa si dejan de coincidir.
export const RETIRED_PAGE_TEXTS = {
  notice: 'Producto retirado',
  sentences: ['Este producto ya no forma parte del catálogo.', 'Dinos qué necesitas y revisamos alternativas.'],
  alternatives: 'Consultar alternativas',
  alternativesMail: 'Consultar por correo',
};
// Lo que una ficha muestra y la página de un retirado no: nadie mantiene ya esos datos y el producto no se cotiza.
export const FICHA_TEXTS = {
  actions: ['Cotizar este producto', 'Cotizar por correo', 'Solicitar ficha técnica'],
  availability: 'Disponibilidad y tiempo de entrega sujetos a confirmación al cotizar.',
  parts: ['Características', 'Variantes', 'Documentación'],
  helpBand: '¿Necesitas otra talla, color o presentación?',
};
const FICHA_CLASSES = ['producto__summary', 'producto__note', 'producto__part', 'producto__list', 'producto__chips', 'producto__docs', 'producto__help'];

/** El texto directo de un elemento, sin el de sus hijos. */
const ownText = element => element.text.join(' ').replace(/\s+/g, ' ').trim();
/**
 * La forma de un texto para reconocerlo: sin acentos ni mayúsculas, y solo letras y números. Así un texto partido en
 * elementos («Producto <b>retirado</b>», «Produc<b>to</b> retirado»), con puntuación («Producto retirado.»,
 * «¡Producto retirado!», «“Producto retirado”»), en mayúsculas o con otros espacios sigue siendo el mismo.
 *
 * Con esta forma se compara todo lo que una página NO debe mostrar (el aviso fuera de su página, las acciones de
 * cotizar, las partes de la ficha, el aviso de disponibilidad): que cambie una coma no lo vuelve aceptable. Lo que la
 * página SÍ debe llevar (la etiqueta, sus dos frases, las dos acciones) se compara al pie de la letra.
 */
const bare = text => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
/** ¿El texto completo del elemento (el suyo y el de sus hijos, como se lee) es `text` en cualquier forma? */
const reads = (element, text) => bare(textOf(element)) === bare(text);
/** ¿La ruta es la de un producto (/productos/{id}/)? */
const isProductRoute = route => route.startsWith(prefix(routes.product)) && /^[^/]+\/$/.test(route.slice(prefix(routes.product).length));
/** Contenido principal de la página (<main>); el pie repite el aviso de disponibilidad y no cuenta. */
const mainOf = page => page.elements.find(element => element.name === 'main') ?? null;
const inMain = page => {
  const main = mainOf(page);
  return main ? allElements(main) : [];
};
/**
 * Las marcas del aviso «Producto retirado» en una página: cada celda `.producto__retired` y cada elemento cuyo texto
 * completo es esa etiqueta en cualquier forma (`reads`). Una frase que solo la contiene («Si un producto retirado te
 * interesa…») no es el aviso.
 */
const retiredMarks = page => page.elements.filter(element => hasClass(element, 'producto__retired') || reads(element, RETIRED_PAGE_TEXTS.notice));
/** Enlaces con un texto exacto: las acciones que la página debe llevar. */
const linksWithText = (elements, text) => elements.filter(element => element.name === 'a' && textOf(element) === text);
/** Enlaces y botones que dicen `text` en cualquier forma: las acciones que la página no debe llevar. */
const actionsReading = (elements, text) => elements.filter(element => (element.name === 'a' || element.name === 'button') && reads(element, text));
/** Una página es de retirado si es la de un producto y lleva el aviso. */
export const isRetiredPage = page => isProductRoute(page.route) && retiredMarks(page).length > 0;

// Aviso de arriba de la página (SiteNotice.astro): <aside class="site-notice"><p class="site-notice__text"><strong>…
// al principio de <body>. Una prueba avisa si la plantilla deja de escribirlo así.
//
// `elements` son los elementos que, ocultos, ocultan el aviso: él, su texto, lo que va en el texto y lo que lo contiene,
// cada uno con las clases y los atributos que puede llevar (los del marcado y los que ponen los scripts: BaseLayout
// añade .js a <html> y SiteHeader escribe variables en su style). Con esta tabla se juzga si una regla de estilo puede
// seleccionar uno de ellos; la comprobación de cada página confirma que el aviso compilado no tiene nada fuera de ella
// (sin contar hidden, popover, aria-hidden y style, que se revisan aparte). Un script que cambie el aviso o lo que lo
// contiene se anota aquí.
export const NOTICE_MARKUP = {
  tag: 'aside', textTag: 'p', leadTag: 'strong', classes: ['site-notice', 'site-notice__text'],
  elements: [
    { name: 'aside', classes: ['site-notice'], attributes: ['class', 'aria-label'] },
    { name: 'p', classes: ['site-notice__text'], attributes: ['class'] },
    { name: 'strong', classes: [], attributes: [] },
    { name: 'body', classes: [], attributes: [] },
    { name: 'html', classes: ['js'], attributes: ['lang', 'class', 'style'] },
  ],
};
// Atributos que se revisan aparte (hiddenByAttributes): no hace falta anotarlos en la tabla.
const NOTICE_JUDGED_ATTRIBUTES = ['hidden', 'popover', 'aria-hidden', 'style'];
// Tipos de lo que puede contener a un elemento del aviso: los antecesores de <strong> (p, aside, body, html).
const NOTICE_ANCESTORS = ['html', 'body', NOTICE_MARKUP.tag, NOTICE_MARKUP.textTag];
/** ¿La declaración quita el elemento de la pantalla? display:none, visibility:hidden o collapse, content-visibility:hidden. */
const hidesElement = ({ property, value }) => {
  const keyword = value.toLowerCase();
  return (property === 'display' && keyword === 'none') || (property === 'visibility' && (keyword === 'hidden' || keyword === 'collapse'))
    || (property === 'content-visibility' && keyword === 'hidden');
};
/** ¿La regla solo se aplica al imprimir? Lo está si una de sus reglas @ es un @media cuyas consultas son todas de impresión. */
const printOnly = conditions => conditions.some(condition => {
  const media = /^@media\s+(.*)$/is.exec(condition);
  return Boolean(media) && splitSelectorList(media[1]).every(query => /^(?:only\s+)?print\b/i.test(query.trim()));
});
/** Quita de un selector los argumentos de las seudoclases con paréntesis («:not(.js)» → «:not»), las cadenas y lo que va entre corchetes se conservan. */
const withoutArguments = selector => {
  let out = '';
  let depth = 0;
  for (let i = 0; i < selector.length; i++) {
    const char = selector[i];
    if (char === '"' || char === "'") { const end = stringEnd(selector, i); if (!depth) out += selector.slice(i, end); i = end - 1; }
    else if (char === '\\') { if (!depth) out += selector.slice(i, i + 2); i++; }
    else if (char === '(') depth++;
    else if (char === ')') depth = Math.max(0, depth - 1);
    else if (!depth) out += char;
  }
  return out;
};
/**
 * Separa un selector sin argumentos de seudoclases en sus selectores compuestos, con el combinador que va después de
 * cada uno («html.js > aside» → [{ compound: "html.js", next: ">" }, { compound: "aside", next: null }]). Lo que va
 * entre corchetes, las cadenas y los escapes no separan; un escape hexadecimal lleva consigo el espacio que lo cierra
 * («html.js \61 side» → «html.js» y «\61 side»), como lo leen U-07 y el navegador.
 * @param {string} bare
 */
function compoundsOf(bare) {
  /** @type {{ compound: string, next: string | null }[]} */
  const compounds = [];
  let current = '';
  let pending = null;
  for (let i = 0; i < bare.length; i++) {
    const char = bare[i];
    if (/[\s>+~]/.test(char)) {
      if (current) { compounds.push({ compound: current, next: null }); current = ''; }
      if (compounds.length && /[>+~]/.test(char)) pending = char;
      else if (compounds.length && !pending) pending = ' ';
      continue;
    }
    if (pending) { compounds[compounds.length - 1].next = pending; pending = null; }
    if (char === '"' || char === "'") { const end = stringEnd(bare, i); current += bare.slice(i, end); i = end - 1; }
    else if (char === '\\') {
      // Un escape va entero, con el espacio que puede cerrarlo («\61 side» es «aside», un solo compuesto).
      ESCAPE_AT.lastIndex = i;
      const escape = ESCAPE_AT.exec(bare)?.[0] ?? char;
      current += escape;
      i += escape.length - 1;
    } else if (char === '[') {
      let end = i + 1;
      while (end < bare.length && bare[end] !== ']') {
        if (bare[end] === '"' || bare[end] === "'") end = stringEnd(bare, end);
        else end += bare[end] === '\\' ? 2 : 1;
      }
      current += bare.slice(i, end + 1);
      i = end;
    } else current += char;
  }
  if (current) compounds.push({ compound: current, next: null });
  return compounds;
}
const COMPOUND_TYPE = new RegExp(String.raw`^(?:(?:\*|(?:${ESCAPE}|[\w-])+)?\|(?!=))?(\*|(?:${ESCAPE}|[\w -￿-])+)?`);
/** El tipo de un selector compuesto en minúsculas («svg|aside.x» → «aside»); «» si no lo pide o es «*». */
const typeOfCompound = compound => {
  const type = COMPOUND_TYPE.exec(compound)?.[1];
  return !type || type === '*' ? '' : unescapeCss(type).toLowerCase();
};
/** ¿El selector compuesto pide un id («#x»)? Lo que va entre corchetes, en cadenas o escapado no cuenta. */
const asksForId = compound => /#/.test(compound.replace(/\[(?:[^\]"'\\]|\\.|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')*\]?|\\./g, ''));
/**
 * ¿Un selector compuesto, el sujeto de la regla, puede ser `element` (una fila de NOTICE_MARKUP.elements)? Su tipo,
 * sus clases, su id y sus selectores de atributo se comparan con los de la fila; los de clase, como los lee U-07. Las
 * seudoclases no se juzgan (pueden cumplirse), y un corchete que no se puede leer puede ser cualquier cosa.
 */
function compoundCouldBe(compound, element) {
  const type = typeOfCompound(compound);
  if (type && type !== element.name) return false;
  const { classes, attributes, unread } = readSelector(compound);
  if (unread) return true;
  if (!classes.every(name => element.classes.includes(name))) return false;
  if (asksForId(compound) && !element.attributes.includes('id')) return false;
  const target = { isWhole: word => element.classes.includes(word), names: element.classes };
  return attributes.every(attribute => element.attributes.includes(attribute.name)
    && (attribute.name !== 'class' || !attribute.operator || classAttributeCouldMatch(attribute, target)));
}
/**
 * ¿Un selector puede seleccionar el aviso, su texto, lo que va en el texto o lo que lo contiene?
 *
 * Se juzga su sujeto (el último selector compuesto) contra cada elemento de NOTICE_MARKUP.elements. De lo que va
 * antes solo cuenta el tipo de los antecesores (un compuesto seguido de « » o «>» debe poder ser html, body, aside
 * o p, «main aside» no puede ser el aviso); sus clases y atributos no se juzgan, porque un script los cambia (.js en
 * <html>), y los hermanos («.skip-link + aside») pueden ser cualquier cosa. Además, como antes, cuenta todo selector
 * que nombra .site-notice o .site-notice__text en cualquier parte (con «.», con un selector de atributo sobre class o
 * con escapes, como U-07). Un selector que termina en un seudoelemento («::before») solo alcanza ese seudoelemento.
 */
function reachesNotice(selector) {
  const compounds = compoundsOf(withoutArguments(selector).trim());
  const subject = compounds[compounds.length - 1]?.compound ?? '';
  if (/::|:(?:before|after|first-line|first-letter)\b/i.test(subject)) return false;
  const { classes, attributes } = readSelector(selector);
  if (classes.some(name => NOTICE_MARKUP.classes.includes(name))) return true;
  const target = { isWhole: word => NOTICE_MARKUP.classes.includes(word), names: NOTICE_MARKUP.classes };
  if (attributes.some(attribute => attribute.name === 'class' && classAttributeCouldMatch(attribute, target))) return true;
  const ancestorsFit = compounds.slice(0, -1).every(({ compound, next }) => {
    const type = typeOfCompound(compound);
    return next === '+' || next === '~' || !type || NOTICE_ANCESTORS.includes(type);
  });
  return ancestorsFit && NOTICE_MARKUP.elements.some(element => compoundCouldBe(subject, element));
}
/** Lo que un elemento del aviso (o de lo que lo contiene) lleva y NOTICE_MARKUP.elements no describe. */
function unknownToNotice(element) {
  const entry = NOTICE_MARKUP.elements.find(known => known.name === element.name);
  if (!entry) return [`el elemento <${element.name}>`];
  return [
    ...classesOf(element).filter(name => !entry.classes.includes(name)).map(name => `la clase «${name}»`),
    ...[...element.attributes.keys()].filter(name => !entry.attributes.includes(name) && !NOTICE_JUDGED_ATTRIBUTES.includes(name)).map(name => `el atributo «${name}»`),
  ];
}
/** Lo que oculta un elemento desde su marcado: hidden, popover, aria-hidden="true" o un estilo en línea que lo quita. */
function hiddenByAttributes(element) {
  const reasons = [];
  if (element.attributes.has('hidden')) reasons.push('hidden');
  if (element.attributes.has('popover')) reasons.push('popover');
  if ((element.attributes.get('aria-hidden') ?? '').trim().toLowerCase() === 'true') reasons.push('aria-hidden="true"');
  for (const declaration of declarationsOf(element.attributes.get('style') ?? '')) {
    if (hidesElement(declaration)) reasons.push(`style="${declaration.property}: ${declaration.value}"`);
  }
  return reasons;
}

// Controles y el código de la página (R-RULE-30a y R-RULE-30b) -----------------------------------------------

// Un <script> es código cuando no lleva type, lo lleva vacío, es «module» o un tipo de JavaScript. Un bloque de datos
// (application/json, application/ld+json, importmap…) no es código: lo que nombra no da función a nada.
const CODE_TYPE = /^(?:|module|(?:text|application)\/(?:x-)?(?:java|ecma)script|text\/javascript1\.[0-5]|text\/(?:jscript|livescript))$/;
/** ¿El <script> es código que el navegador ejecuta? */
export const isCodeScript = script => CODE_TYPE.test((script.attributes.get('type') ?? '').trim().toLowerCase());
// Lo que un archivo de código importa: «import{a}from"./x.js"», «import"./x.js"», «export{a}from"./x.js"» y
// «import("./x.js")», con cualquiera de las tres comillas (la compilación escribe «`»).
const STATIC_IMPORT = /\b(?:import|export)\s*(?:[\w$*{}\s,]*?\bfrom\s*)?(["'`])([^"'`\r\n]+)\1/g;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*(["'`])([^"'`\r\n]+)\1\s*[,)]/g;
/** Las direcciones que importa un código, estáticas o dinámicas, en orden y sin repetir. */
export function importsOf(code) {
  const found = [...code.matchAll(STATIC_IMPORT), ...code.matchAll(DYNAMIC_IMPORT)].sort((a, b) => a.index - b.index).map(match => match[2]);
  return [...new Set(found)];
}

/** Nombre de un atributo data-* en su forma `dataset`: «data-quote-add» → «quoteAdd». */
export const datasetName = attribute => attribute.slice('data-'.length).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/**
 * ¿El código nombra el atributo data-* `attribute`, como nombre entero? Como atributo («[data-quote-add]»,
 * getAttribute('data-quote-add'); sin distinguir mayúsculas, como un selector), con algo que no sea letra, cifra, «_» ni
 * «-» a cada lado: «data-quote-add» no es «data-quote-add-all». O en su forma `dataset` como palabra entera
 * («quoteAdd», no «quoteAddAll»). Un nombre de una sola palabra («data-toggle» → «toggle») aparece en cualquier código
 * («classList.toggle»), así que en su forma `dataset` solo cuenta leído de `dataset` («dataset.toggle»,
 * «dataset['toggle']»).
 */
export function namesHook(code, attribute) {
  if (new RegExp(`(?<![\\w-])${escapeRegExp(attribute)}(?![\\w-])`, 'i').test(code)) return true;
  const key = escapeRegExp(datasetName(attribute));
  if (!key) return false;
  if (/[A-Z]/.test(datasetName(attribute))) return new RegExp(`(?<![\\w$])${key}(?![\\w$])`).test(code);
  return new RegExp(`\\bdataset\\s*(?:\\?\\.|\\.)\\s*${key}(?![\\w$])|\\bdataset\\s*(?:\\?\\.)?\\[\\s*(["'\`])${key}\\1\\s*\\]`).test(code);
}
/** Los atributos data-* de un elemento: todos, y los que nombra el código. */
function hooksOf(element, code) {
  const all = [...element.attributes.keys()].filter(name => name.startsWith('data-') && name.length > 'data-'.length);
  return { all, named: all.filter(name => namesHook(code, name)) };
}

const typeAttribute = element => (element.attributes.get('type') ?? '').trim().toLowerCase();
const roles = element => (element.attributes.get('role') ?? '').trim().toLowerCase().split(/\s+/);
/** ¿Es un control? <button>, <select>, <textarea>, <input> que no es hidden, y todo lo que lleva role="button". */
export const isControl = element => (['button', 'select', 'textarea'].includes(element.name)
  || (element.name === 'input' && typeAttribute(element) !== 'hidden') || roles(element).includes('button'));
/** ¿Envía su formulario? Un <button> sin type o con type="submit" (o un type que no existe), un <input> submit o image. */
const isSubmit = element => (element.name === 'button' ? !['button', 'reset'].includes(typeAttribute(element))
  : element.name === 'input' && ['submit', 'image'].includes(typeAttribute(element)));
/** ¿Borra su formulario? type="reset" vacía los campos del <form> sin script, con action o sin él. */
const isReset = element => ['button', 'input'].includes(element.name) && typeAttribute(element) === 'reset';
/** ¿Es un campo cuyo valor viaja con su formulario? <select>, <textarea> o un <input> que no es un botón. */
const isField = element => element.name === 'select' || element.name === 'textarea'
  || (element.name === 'input' && !['hidden', 'button', 'submit', 'reset', 'image'].includes(typeAttribute(element)));
/**
 * El formulario de un control: el que nombra su atributo form (si no es un <form>, ninguno) o el <form> que lo
 * contiene. Un <template> es un límite: lo que va dentro se clona en otro lugar.
 * @param {Element} control @param {Page} page
 */
function formOf(control, page) {
  if (control.attributes.has('form')) {
    const id = control.attributes.get('form');
    return page.elements.find(element => element.name === 'form' && element.attributes.get('id') === id) ?? null;
  }
  for (let element = control.parent; element && element.name !== '#document' && element.name !== 'template'; element = element.parent) {
    if (element.name === 'form') return element;
  }
  return null;
}
/** Un control como se reporta: etiqueta, type, name, role, clases y los primeros 60 caracteres de su texto. */
function describeControl(control) {
  const attributes = ['type', 'name', 'role', 'class'].filter(key => control.attributes.has(key)).map(key => ` ${key}="${control.attributes.get(key)}"`).join('');
  const text = textOf(control).slice(0, 60);
  return `<${control.name}${attributes}>${text ? ` «${text}»` : ''}`;
}
/**
 * Por qué un control no tiene función en una página; `null` si la tiene (ver R-RULE-30a).
 * @param {Element} control @param {Page} page
 */
export function missingFunction(control, page) {
  const code = page.code ?? '';
  const own = hooksOf(control, code);
  if (own.named.length) return null;
  const form = formOf(control, page);
  const named = isField(control) && Boolean(control.attributes.get('name'));
  const sends = isSubmit(control);
  const formHooks = form ? hooksOf(form, code) : null;
  if (form && isReset(control)) return null;
  if (form && (named || sends) && (form.attributes.has('action') || formHooks?.named.length)) return null;
  const reasons = [own.all.length
    ? `ningún script de la página nombra ${own.all.map(name => `${name} (ni ${datasetName(name)})`).join(', ')}`
    : 'no lleva un atributo data-* que un script de la página nombre'];
  if (form) {
    if (isField(control) && !named) reasons.push('está en un <form>, pero un campo sin name no viaja con él');
    else if (!named && !sends) reasons.push(`está en un <form>, pero ${control.name === 'button' || control.name === 'input' ? `un botón type="${typeAttribute(control)}"` : 'este control'} no lo envía: el <form> solo da función a sus campos con name y a su botón de envío`);
    else reasons.push(`su <form> no lleva action ni un atributo data-* que un script de la página nombre${formHooks?.all.length ? ` (lleva ${formHooks.all.join(', ')})` : ''}`);
  } else if (named || sends) {
    reasons.push(`no está en un <form> con action o con un atributo data-* que un script de la página nombre`);
  }
  return `${describeControl(control)} no tiene función: ${reasons.join('; ')}`;
}

/**
 * El código de una página: el texto de sus <script> de código en línea y el de los archivos de la carpeta que cargan
 * sus <script src>, más lo que esos archivos importan, estática o dinámicamente, desde la carpeta, a cualquier
 * profundidad. Cada archivo se lee una vez (`load` guarda lo leído); una dirección fuera de la carpeta (otro servidor,
 * «../» que sale de ella) o un archivo que no existe no aportan nada (los enlaces rotos los revisa check-links).
 * @param {{ file: string, root: Element }} page `file` es la ruta del archivo de la página en el disco
 * @param {string} directory @param {(path: string) => Promise<string | null>} load
 */
export async function pageCode({ file, root }, directory, load) {
  const resolveFrom = (specifier, base) => {
    const address = specifier.trim();
    if (!/^(?:\.{1,2}\/|\/(?!\/))/.test(address)) return null;
    let path = address.split(/[?#]/)[0];
    try { path = decodeURIComponent(path); } catch { /* se usa tal cual */ }
    const target = path.startsWith('/') ? join(directory, path) : join(dirname(base), path);
    const inside = relative(directory, target);
    return inside && !inside.startsWith('..') && !isAbsolute(inside) ? target : null;
  };
  const parts = [];
  const queue = [];
  for (const script of allElements(root).filter(element => element.name === 'script' && isCodeScript(element))) {
    if (script.attributes.has('src')) {
      const target = resolveFrom(script.attributes.get('src') ?? '', file);
      if (target) queue.push(target);
      continue;
    }
    parts.push(script.source ?? '');
    for (const specifier of importsOf(script.source ?? '')) {
      const target = resolveFrom(specifier, file);
      if (target) queue.push(target);
    }
  }
  const seen = new Set();
  while (queue.length) {
    const target = /** @type {string} */ (queue.shift());
    if (seen.has(target)) continue;
    seen.add(target);
    const text = await load(target);
    if (text === null) continue;
    parts.push(text);
    for (const specifier of importsOf(text)) {
      const next = resolveFrom(specifier, target);
      if (next) queue.push(next);
    }
  }
  return parts.join('\n');
}

// La página de cotizar (R-QUOTE-12) -----------------------------------------------------------------------------

/**
 * Los ganchos de la página de cotizar (src/pages/cotizar/index.astro) que revisa R-QUOTE-12, y el del selector de
 * cantidad (Stepper.astro), que solo atiende su script (StepperScript.astro). Una prueba avisa si las plantillas dejan
 * de escribirlos.
 */
export const QUOTE_PAGE_HOOKS = {
  index: 'data-quote-index',
  rowTemplate: 'data-quote-row-template',
  retiredTemplate: 'data-quote-retired-template',
  tools: 'data-quote-tools',
  unknown: 'data-quote-unknown',
  statusRow: 'data-quote-status-row',
  writeFailed: 'data-quote-write-failed',
  stepper: 'data-stepper',
};
/** ¿Está dentro de un <template>? Lo que va ahí no está en el documento hasta que se clona: un script no lo encuentra. */
const inTemplate = element => closest(element.parent, node => node.name === 'template') !== null;
/**
 * Las páginas de producto de la compilación (/productos/{id}/), por su ruta: las fichas y las de un retirado (las que
 * llevan el aviso «Producto retirado», `isRetiredPage`).
 * @param {Page[]} pages
 */
function productPages(pages) {
  const fichas = new Set();
  const retired = new Set();
  for (const page of pages) if (isProductRoute(page.route)) (isRetiredPage(page) ? retired : fichas).add(page.route);
  return { fichas, retired };
}
/**
 * Lo que no cuadra entre el índice público impreso (el texto de su bloque JSON) y las páginas de producto de la
 * compilación: cada entrada de «products» es una ficha de la compilación y cada entrada de «retired» la página de un
 * retirado, en la ruta de su id (`routes.product(id)`) y con esa ruta como url; y cada ficha y cada página de retirado
 * de la compilación está en su lista.
 * @param {string} source
 * @param {{ fichas: Set<string>, retired: Set<string> }} built
 */
function quoteIndexProblems(source, built) {
  let data;
  try {
    data = JSON.parse(source);
  } catch {
    return ['el índice público (data-quote-index) no es JSON válido: la página no puede leer ningún producto'];
  }
  if (typeof data !== 'object' || data === null || !Array.isArray(data.products) || !Array.isArray(data.retired)) {
    return ['el índice público (data-quote-index) no tiene las listas «products» y «retired»'];
  }
  const problems = [];
  const lists = [
    { list: 'products', own: built.fichas, kind: 'una ficha', other: built.retired, otherKind: 'la de un retirado' },
    { list: 'retired', own: built.retired, kind: 'la página de un retirado', other: built.fichas, otherKind: 'una ficha' },
  ];
  for (const { list, own, kind, other, otherKind } of lists) {
    const listed = new Set();
    for (const entry of data[list]) {
      const id = entry?.id;
      if (typeof id !== 'string' || !id) {
        problems.push(`una entrada de «${list}» del índice público no tiene id: la página no la puede ubicar`);
        continue;
      }
      const route = routes.product(id);
      listed.add(route);
      if (entry.url !== route) problems.push(`«${id}» («${list}» del índice público) lleva url «${entry.url ?? ''}» y su página es ${route}`);
      if (!own.has(route)) {
        problems.push(other.has(route)
          ? `«${id}» está en «${list}» del índice público y su página (${route}) es ${otherKind}`
          : `«${id}» está en «${list}» del índice público y la compilación no tiene su página (${route})`);
      }
    }
    for (const route of own) if (!listed.has(route)) problems.push(`${route} es ${kind} de la compilación y no está en «${list}» del índice público: la página de cotizar no la ubicaría`);
  }
  return problems;
}

/** @type {Check[]} */
export const CHECKS = [
  {
    id: 'U-03',
    title: 'En la cabecera los botones Buscar y Menú van antes de la navegación y de la búsqueda; el orden de computadora es logotipo, navegación, búsqueda, WhatsApp y Cotizar mi lista; ningún tabindex cambia ese orden',
    page(page, options) {
      const parts = headerParts(page);
      if (!parts || !parts.masthead) return ['la página no tiene la cabecera del sitio (<header class="site-header"> con .masthead)'];
      const problems = [];
      const { menu, search, menuButton, searchButton } = parts;
      if (!menu) problems.push('falta la navegación principal (#menu)');
      if (!menuButton) problems.push('falta el botón Menú (data-toggle="menu")');
      else if (menuButton.attributes.get('aria-controls') !== 'menu') problems.push('el botón Menú no controla #menu (aria-controls)');
      if (options.preview && !search) problems.push('vista previa: falta el campo de búsqueda de la cabecera (#buscador)');
      if (search && !searchButton) problems.push('hay búsqueda (#buscador) pero falta el botón Buscar (data-toggle="search")');
      if (searchButton && !search) problems.push('hay botón Buscar pero falta la búsqueda (#buscador)');
      if (searchButton && searchButton.attributes.get('aria-controls') !== 'buscador') problems.push('el botón Buscar no controla #buscador (aria-controls)');
      const panels = [menu, search].filter(Boolean);
      for (const [button, label] of [[menuButton, 'Menú'], [searchButton, 'Buscar']]) {
        if (!button) continue;
        for (const panel of panels) {
          if (button.order > panel.order) problems.push(`el botón ${label} está después de ${describe(panel)}: al abrir un panel con el teclado, el siguiente Tab no entra en él`);
        }
      }
      // Orden del teclado en computadora (los botones no se ven): logotipo, navegación, búsqueda, WhatsApp, cotizar.
      const sequence = [
        ['el logotipo', parts.elements.find(element => hasClass(element, 'masthead__logo'))],
        ['la navegación', menu],
        ['la búsqueda', search],
        ['WhatsApp', parts.elements.find(element => hasClass(element, 'masthead__wa'))],
        ['Cotizar mi lista', parts.elements.find(element => hasClass(element, 'masthead__cta'))],
      ];
      for (const [label, element] of sequence) if (!element && label !== 'la búsqueda') problems.push(`falta ${label} en la cabecera`);
      const present = sequence.filter(([, element]) => element);
      for (let i = 1; i < present.length; i++) {
        if (present[i][1].order < present[i - 1][1].order) problems.push(`${present[i][0]} está antes que ${present[i - 1][0]}: el orden de computadora es logotipo, navegación, búsqueda, WhatsApp, Cotizar mi lista`);
      }
      // El orden del documento solo es el del teclado si nada lo cambia: ningún tabindex positivo en la cabecera (ese
      // elemento pasaría delante de todo; el <header> también cuenta) y ningún negativo en los botones ni en lo que se
      // enfoca de esa secuencia.
      for (const element of [parts.header, ...parts.elements]) {
        const index = tabindexOf(element);
        if (index !== null && index > 0) problems.push(`${describe(element)} lleva tabindex="${element.attributes.get('tabindex')}": con Tab pasa delante de todo lo demás`);
      }
      const panelsContent = [menu, search].filter(Boolean).flatMap(panel => allElements(panel).filter(isFocusable));
      const stops = [
        [menuButton, 'el botón Menú'], [searchButton, 'el botón Buscar'], [sequence[0][1], 'el logotipo'], [sequence[3][1], 'WhatsApp'], [sequence[4][1], 'Cotizar mi lista'],
        ...panelsContent.map(element => [element, `${describe(element)}${textOf(element) ? ` («${textOf(element)}»)` : ''} de ${closest(element, node => node === menu) ? 'la navegación' : 'la búsqueda'}`]),
      ];
      for (const [element, label] of stops) {
        const index = element ? tabindexOf(element) : null;
        if (index !== null && index < 0) problems.push(`${label} lleva tabindex="${element.attributes.get('tabindex')}": sale del orden de Tab`);
      }
      return problems;
    },
  },
  {
    id: 'U-05',
    title: 'La cabecera y la barra fija marcan la ubicación actual con aria-current según la ruta, y nada más lleva la marca',
    page(page) {
      const parts = headerParts(page);
      if (!parts) return ['la página no tiene la cabecera del sitio (<header class="site-header">)'];
      const { entries, dock } = locationEntries(page, parts);
      const want = expectedLocation(page.route);
      const problems = [];
      if (!dock) problems.push('falta la barra fija (<nav class="dock">)');
      for (const [key, value] of Object.entries(want)) {
        const found = entries.filter(entry => entry.key === key);
        if (!found.length) problems.push(`falta la entrada ${key} que debe marcar la ubicación (aria-current="${value}")`);
        for (const entry of found) if (entry.value !== value) problems.push(`«${entry.label}» (${key}) debe llevar aria-current="${value}" y lleva ${entry.value === null ? 'nada' : `aria-current="${entry.value}"`}`);
      }
      for (const entry of entries) {
        if (entry.value !== null && !(entry.key in want)) problems.push(`«${entry.label}» (${entry.key}) lleva aria-current="${entry.value}" y no le corresponde en ${page.route}`);
      }
      return problems;
    },
  },
  {
    id: 'U-07',
    title: 'La navegación y la búsqueda de la cabecera usan nombres de su bloque; ninguna regla global selecciona .nav, .search ni sus elementos (.nav__link, .search__input…), tampoco con [class…] ni con escapes',
    sheet(sheet) {
      const problems = [];
      for (const selector of sheet.selectors) {
        const retired = [...new Set(selectorClasses(selector).filter(isRetiredClass))].map(name => `.${name}`);
        for (const attribute of selectorAttributes(selector)) if (classAttributeIsRetired(attribute)) retired.push(`[class${attribute.operator}"${attribute.value}"${attribute.insensitive ? ' i' : ''}]`);
        if (retired.length) problems.push(`el selector «${selector}» usa el nombre genérico ${retired.join(', ')}: una página que use ese nombre heredaría las reglas de la cabecera`);
      }
      return problems;
    },
    page(page, options) {
      const parts = headerParts(page);
      if (!parts) return ['la página no tiene la cabecera del sitio (<header class="site-header">)'];
      const problems = [];
      for (const element of parts.elements) {
        const retired = classesOf(element).filter(isRetiredClass);
        if (retired.length) problems.push(`${describe(element)} de la cabecera usa la clase genérica .${retired.join(', .')}`);
      }
      if (!parts.menu) problems.push('falta la navegación principal (#menu) en la cabecera');
      else if (!hasClass(parts.menu, 'masthead__nav')) problems.push(`la navegación ${describe(parts.menu)} no lleva la clase masthead__nav`);
      if (options.preview && !parts.search) problems.push('vista previa: falta el campo de búsqueda de la cabecera (#buscador)');
      if (parts.search) {
        if (!hasClass(parts.search, 'masthead__search')) problems.push(`la búsqueda ${describe(parts.search)} no lleva la clase masthead__search`);
        const inSearch = allElements(parts.search);
        const input = inSearch.find(element => element.name === 'input' && element.attributes.get('type') === 'search');
        const submit = inSearch.find(element => element.name === 'button' && element.attributes.get('type') === 'submit');
        if (!input) problems.push('la búsqueda de la cabecera no tiene su campo (input type="search")');
        else if (!hasClass(input, 'masthead__search-input')) problems.push(`el campo ${describe(input)} no lleva la clase masthead__search-input`);
        if (!submit) problems.push('la búsqueda de la cabecera no tiene su botón (button type="submit")');
        else if (!hasClass(submit, 'masthead__search-btn')) problems.push(`el botón ${describe(submit)} no lleva la clase masthead__search-btn`);
      }
      return problems;
    },
  },
  {
    id: 'U-04',
    title: 'Las celdas de relleno de las retículas están vacías, ocultas a las tecnologías de apoyo (aria-hidden="true") y no reciben foco',
    page(page) {
      const problems = [];
      for (const element of page.elements) {
        if (!classesOf(element).some(name => FILL_CLASSES.includes(name))) continue;
        if (element.attributes.get('aria-hidden') !== 'true') problems.push(`la celda de relleno ${describe(element)} no lleva aria-hidden="true"`);
        if (element.children.length || textOf(element)) problems.push(`la celda de relleno ${describe(element)} tiene contenido`);
        if (FOCUSABLE.includes(element.name) || element.attributes.has('tabindex') || element.attributes.has('href')) problems.push(`la celda de relleno ${describe(element)} puede recibir foco`);
      }
      return problems;
    },
  },
  {
    id: 'U-11',
    title: 'Fuera de la cabecera, la dirección de correo que se muestra va en dos partes (EmailAddress) y solo puede partirse después de «@»',
    page(page) {
      const problems = [];
      for (const link of page.elements) {
        const href = link.attributes.get('href') ?? '';
        if (link.name !== 'a' || !/^mailto:/i.test(href) || closest(link, node => node.name === 'header')) continue;
        // Un enlace de correo que no muestra la dirección (una acción «Escribir por correo») no entra en esta regla.
        if (!textOf(link).includes('@')) continue;
        let address = href.slice('mailto:'.length).split('?')[0];
        try { address = decodeURIComponent(address); } catch { /* se compara tal cual */ }
        const at = address.lastIndexOf('@') + 1;
        const email = allElements(link).find(element => hasClass(element, 'email'));
        const [user, breakPoint, domain] = email?.children ?? [];
        const whole = email && email.children.length === 3 && !email.text.join('').trim()
          && hasClass(user, 'email__part') && breakPoint.name === 'wbr' && hasClass(domain, 'email__part')
          && !user.children.length && !domain.children.length
          && user.text.join('') === address.slice(0, at) && domain.text.join('') === address.slice(at);
        if (!whole) problems.push(`el enlace a ${address} muestra la dirección sin las dos partes de EmailAddress (span.email > span.email__part + <wbr> + span.email__part): podría partirse a mitad del dominio`);
      }
      return problems;
    },
  },
  {
    id: 'F-3',
    title: 'En la ruta de navegación cada diagonal es un elemento oculto a las tecnologías de apoyo al final de su elemento, y el último elemento es la página actual',
    page(page) {
      const problems = [];
      for (const nav of page.elements) {
        if (nav.name !== 'nav' || !hasClass(nav, 'crumbs')) continue;
        const inNav = allElements(nav);
        const items = inNav.filter(element => element.name === 'li' && hasClass(element, 'crumbs__item'));
        if (items.length < 2) problems.push(`la ruta tiene ${items.length} elementos; lleva al menos la portada y la página actual`);
        items.forEach((item, index) => {
          const inItem = allElements(item);
          const separators = inItem.filter(element => hasClass(element, 'crumbs__sep'));
          const current = inItem.filter(element => element.attributes.has('aria-current'));
          const label = `el elemento ${index + 1} de la ruta`;
          if (index === items.length - 1) {
            if (separators.length) problems.push(`${label} es el último y lleva una diagonal`);
            if (current.length !== 1 || current[0].attributes.get('aria-current') !== 'page') problems.push(`${label} es el último y no marca la página actual (aria-current="page")`);
            return;
          }
          if (current.length) problems.push(`${label} lleva aria-current y no es el último`);
          if (separators.length !== 1) { problems.push(`${label} lleva ${separators.length} diagonales (span.crumbs__sep); lleva una`); return; }
          const [separator] = separators;
          if (separator.attributes.get('aria-hidden') !== 'true') problems.push(`la diagonal de ${label} no lleva aria-hidden="true": un lector de pantalla la lee`);
          if (textOf(separator) !== '/') problems.push(`el separador de ${label} no es una diagonal`);
          if (item.children[item.children.length - 1] !== separator) problems.push(`la diagonal de ${label} no va al final de su elemento: podría empezar un renglón`);
        });
        // Una diagonal escrita como texto (o generada entre elementos) la lee la tecnología de apoyo.
        const loose = [nav, ...inNav].some(element => !hasClass(element, 'crumbs__sep') && element.text.some(text => text.trim() === '/'));
        if (loose) problems.push('la ruta tiene una diagonal escrita como texto, fuera de span.crumbs__sep');
      }
      return problems;
    },
  },
  {
    id: 'F-9a',
    title: 'En la página de una marca, su celda de «Marcas que manejamos» lleva aria-current="page" y el cuadro que la señala; ninguna otra celda los lleva',
    page(page) {
      const problems = [];
      const cells = page.elements.filter(element => element.name === 'a' && hasClass(element, 'brand'));
      const brandPrefix = prefix(routes.brand);
      const onBrandPage = page.route.startsWith(brandPrefix) && page.route.length > brandPrefix.length;
      const own = cells.filter(cell => cell.attributes.get('href') === page.route);
      if (onBrandPage && cells.length && own.length !== 1) problems.push(`${own.length} celdas de marca llevan a esta página; debe haber exactamente una`);
      for (const cell of cells) {
        const value = cell.attributes.get('aria-current') ?? null;
        const mark = leadingMark(cell, 'brand__mark');
        const name = textOf(cell);
        if (onBrandPage && own.includes(cell)) {
          if (value !== 'page') problems.push(`la celda de la marca actual («${name}») no lleva aria-current="page"`);
          if (!mark) problems.push(`la celda de la marca actual («${name}») no empieza con el cuadro que la señala (span.brand__mark)`);
          else if (mark.attributes.get('aria-hidden') !== 'true') problems.push(`el cuadro de la marca actual («${name}») no lleva aria-hidden="true"`);
        } else {
          if (value !== null) problems.push(`la celda «${name}» lleva aria-current="${value}" y no es la de esta página`);
          if (allElements(cell).some(element => hasClass(element, 'brand__mark'))) problems.push(`la celda «${name}» lleva el cuadro de marca actual y no es la de esta página`);
        }
      }
      const marks = page.elements.filter(element => hasClass(element, 'brand__mark'));
      if (marks.some(mark => !cells.includes(mark.parent))) problems.push('hay un cuadro de marca actual (.brand__mark) fuera de una celda de marca');
      return problems;
    },
  },
  {
    id: 'F-9b',
    title: 'En el pie, el enlace a la página actual lleva aria-current="page" y el cuadro que lo señala; ningún otro enlace del pie los lleva',
    page(page) {
      const footer = page.elements.find(element => element.name === 'footer' && hasClass(element, 'site-footer'));
      if (!footer) return ['la página no tiene el pie del sitio (<footer class="site-footer">)'];
      const problems = [];
      const inFooter = allElements(footer);
      // El logotipo lleva a la portada, pero no es un enlace de las listas del pie.
      const links = inFooter.filter(element => element.name === 'a' && !hasClass(element, 'footer__logo'));
      for (const link of links) {
        const value = link.attributes.get('aria-current') ?? null;
        const mark = leadingMark(link, 'footer__mark');
        const label = textOf(link);
        if (link.attributes.get('href') === page.route) {
          if (value !== 'page') problems.push(`el enlace del pie a esta página («${label}») no lleva aria-current="page"`);
          if (!mark) problems.push(`el enlace del pie a esta página («${label}») no empieza con el cuadro que lo señala (span.footer__mark)`);
          else if (mark.attributes.get('aria-hidden') !== 'true') problems.push(`el cuadro del enlace del pie «${label}» no lleva aria-hidden="true"`);
        } else {
          if (value !== null) problems.push(`el enlace del pie «${label}» lleva aria-current="${value}" y no lleva a esta página`);
          if (allElements(link).some(element => hasClass(element, 'footer__mark'))) problems.push(`el enlace del pie «${label}» lleva el cuadro de página actual y no lleva a esta página`);
        }
      }
      if (inFooter.some(element => hasClass(element, 'footer__mark') && !links.includes(element.parent))) problems.push('hay un cuadro de página actual (.footer__mark) fuera de un enlace del pie');
      return problems;
    },
  },
  {
    id: 'R-STATE-04a',
    title: 'La página de un producto es una ficha (con «Cotizar este producto») o la de un producto retirado (con el aviso «Producto retirado»), nunca las dos ni ninguna; el aviso solo aparece en la página de un retirado',
    page(page) {
      const { notice } = RETIRED_PAGE_TEXTS;
      const [quoteAction] = FICHA_TEXTS.actions;
      const marks = retiredMarks(page);
      if (!isProductRoute(page.route)) {
        // Se nombra el elemento más interno: el que lleva la etiqueta, no la celda que lo contiene.
        const inner = marks.find(mark => !marks.some(other => other !== mark && closest(other.parent, element => element === mark)));
        return marks.length ? [`${describe(inner ?? marks[0])} lleva el aviso «${notice}» y esta página no es la de un producto`] : [];
      }
      const quote = actionsReading(inMain(page), quoteAction);
      if (marks.length && quote.length) return [`la página lleva el aviso «${notice}» y la acción «${quoteAction}»: es una ficha o la de un retirado, no las dos`];
      if (!marks.length && !quote.length) return [`la página de producto no lleva «${quoteAction}» ni el aviso «${notice}»`];
      return [];
    },
  },
  {
    id: 'R-STATE-04b',
    title: 'La página de un retirado lleva el aviso completo (la etiqueta «Producto retirado» con el cuadro sólido y sus dos frases) y, después, «Consultar alternativas» por WhatsApp y «Consultar por correo»',
    page(page) {
      if (!isRetiredPage(page)) return [];
      const { notice, sentences, alternatives, alternativesMail } = RETIRED_PAGE_TEXTS;
      const problems = [];
      const main = inMain(page);
      const cells = main.filter(element => hasClass(element, 'producto__retired'));
      if (cells.length !== 1) return [`la página lleva ${cells.length} celdas del aviso (.producto__retired); lleva una`];
      const [cell] = cells;
      const inCell = allElements(cell);
      const label = inCell.find(element => ownText(element) === notice);
      if (!label) problems.push(`el aviso no lleva la etiqueta «${notice}»`);
      else if (!hasClass(label, 'label') || !hasClass(label, 'eyebrow')) problems.push(`la etiqueta «${notice}» no tiene el estilo de etiqueta con el cuadro sólido (.eyebrow.label)`);
      else if (!hasClass(label, 'producto__retired-label')) problems.push(`la etiqueta «${notice}» no lleva .producto__retired-label (la que la pinta en tinta, no en azul)`);
      const paragraphs = inCell.filter(element => element.name === 'p').map(ownText);
      for (const sentence of sentences) if (!paragraphs.includes(sentence)) problems.push(`al aviso le falta la frase «${sentence}»`);
      if (label && paragraphs.indexOf(sentences[0]) !== -1 && paragraphs.indexOf(sentences[0]) > paragraphs.indexOf(sentences[1])) problems.push('las dos frases del aviso van en otro orden');
      const whatsapp = linksWithText(main, alternatives);
      const mail = linksWithText(main, alternativesMail);
      if (whatsapp.length !== 1) problems.push(`la página lleva ${whatsapp.length} acciones «${alternatives}»; lleva una`);
      else {
        if (!(whatsapp[0].attributes.get('href') ?? '').startsWith('https://wa.me/')) problems.push(`«${alternatives}» no abre WhatsApp (https://wa.me/…)`);
        if (!hasClass(whatsapp[0], 'action--primary')) problems.push(`«${alternatives}» no es la acción sólida (.action--primary)`);
        if (whatsapp[0].order < cell.order) problems.push(`«${alternatives}» va antes del aviso`);
      }
      if (mail.length !== 1) problems.push(`la página lleva ${mail.length} acciones «${alternativesMail}»; lleva una`);
      else {
        if (!/^mailto:/i.test(mail[0].attributes.get('href') ?? '')) problems.push(`«${alternativesMail}» no abre el correo (mailto:)`);
        if (hasClass(mail[0], 'action--primary')) problems.push(`«${alternativesMail}» no es la acción principal y va sólida`);
        if (whatsapp.length === 1 && mail[0].order < whatsapp[0].order) problems.push(`«${alternativesMail}» va antes de «${alternatives}»`);
      }
      return problems;
    },
  },
  {
    id: 'R-STATE-04c',
    title: 'La página de un retirado tiene un solo H1, el nombre, antes del aviso, y su título dice «(producto retirado)»',
    page(page) {
      if (!isRetiredPage(page)) return [];
      const problems = [];
      const headings = page.elements.filter(element => element.name === 'h1');
      if (headings.length !== 1) return [`la página lleva ${headings.length} H1; lleva uno`];
      const [h1] = headings;
      if (!textOf(h1)) problems.push('el H1 está vacío');
      if (!closest(h1, element => hasClass(element, 'producto__head'))) problems.push('el H1 no está en el bloque del título de la hoja (.producto__head)');
      const cell = page.elements.find(element => hasClass(element, 'producto__retired'));
      if (cell && h1.order > cell.order) problems.push('el H1 va después del aviso');
      const title = page.elements.find(element => element.name === 'title');
      const expected = `${textOf(h1)} (producto retirado)`;
      if (!title || !textOf(title).startsWith(expected)) problems.push(`el título de la página no empieza con «${expected}»`);
      return problems;
    },
  },
  {
    id: 'R-STATE-04d',
    title: 'La página de un retirado nunca muestra una acción de cotizar ni pedir la ficha, la unidad de venta, el resumen, las características, las variantes, la documentación, el aviso de disponibilidad ni la banda de ayuda de la ficha',
    page(page) {
      if (!isRetiredPage(page)) return [];
      const problems = [];
      const main = inMain(page);
      for (const text of FICHA_TEXTS.actions) if (actionsReading(main, text).length) problems.push(`la página muestra la acción «${text}»`);
      const keys = main.filter(element => element.name === 'dt').map(textOf);
      for (const key of keys) if (key !== 'Marca' && key !== 'Código') problems.push(`la página muestra la fila «${key}»; solo lleva Marca y Código`);
      for (const element of main) {
        const ficha = classesOf(element).filter(name => FICHA_CLASSES.includes(name));
        if (ficha.length) problems.push(`la página lleva ${describe(element)}, un bloque de la ficha`);
      }
      for (const heading of main.filter(element => /^h[2-6]$/.test(element.name))) {
        const part = [...FICHA_TEXTS.parts, FICHA_TEXTS.helpBand].find(text => reads(heading, text));
        if (part) problems.push(`la página muestra «${part}»`);
      }
      // El aviso se busca en todo el contenido principal, como se lee: partido en elementos sigue siendo el aviso.
      const whole = mainOf(page);
      if (whole && bare(textOf(whole)).includes(bare(FICHA_TEXTS.availability))) problems.push('la página muestra el aviso de disponibilidad');
      return problems;
    },
  },
  {
    id: 'V-03',
    title: 'En la ficha de un producto, el título y la fila de ruta llevan data-long exactamente cuando el nombre pasa de 50 caracteres',
    page(page) {
      const problems = [];
      const title = page.elements.find(element => element.name === 'h1' && hasClass(element, 'producto__title'));
      if (!title) return problems;
      const titleLong = title.attributes.has('data-long');
      // El título de la ficha (no el de un producto retirado, que no baja de tamaño) se marca según su nombre.
      if (closest(title, element => hasClass(element, 'producto'))) {
        const long = isLongProductName(textOf(title));
        if (titleLong !== long) problems.push(`el título «${textOf(title)}» ${long ? 'pasa de 50 caracteres y no lleva' : 'no pasa de 50 caracteres y lleva'} data-long`);
      }
      // La fila de ruta va con el título: con un nombre largo se queda en un renglón (producto.css).
      const crumbs = page.elements.find(element => hasClass(element, 'producto__crumbs'));
      if (crumbs && crumbs.attributes.has('data-long') !== titleLong) {
        problems.push(`la fila de ruta ${titleLong ? 'no lleva' : 'lleva'} data-long y el título «${textOf(title)}» ${titleLong ? 'sí' : 'no'}: los dos van juntos`);
      }
      return problems;
    },
  },
  {
    id: 'V-06',
    title: 'En la línea marca · código de una tarjeta de producto, el separador va unido a la marca con un espacio de no separación: el renglón solo puede partirse después del separador',
    page(page) {
      const problems = [];
      for (const meta of page.elements.filter(element => hasClass(element, 'product__meta'))) {
        const text = rawText(meta);
        for (let at = text.indexOf('·'); at !== -1; at = text.indexOf('·', at + 1)) {
          // El espacio que va justo antes del separador: solo espacios de no separación, y al menos uno.
          const before = /\s*$/.exec(text.slice(0, at))[0];
          if (!before || /[^\u00a0]/.test(before)) {
            const shown = before ? before.replace(/\u00a0/g, '⍽').replace(/\n/g, '↵').replace(/ /g, '␣') : 'nada';
            problems.push(`el separador de «${textOf(meta)}» va precedido por ${shown}: lleva un espacio de no separación (&nbsp;), así que el renglón puede empezar con «·»`);
          }
        }
      }
      return problems;
    },
  },
  {
    id: 'A-02a',
    title: 'Un enlace o un botón con aria-label y texto visible lleva un nombre que empieza con ese texto (WCAG 2.5.3)',
    page(page) {
      const problems = [];
      for (const element of page.elements) {
        if (element.name !== 'a' && element.name !== 'button') continue;
        const label = element.attributes.get('aria-label');
        const shown = loose(visibleText(element));
        if (label === undefined || !shown) continue;
        if (!loose(label).startsWith(shown)) problems.push(`${describe(element)} muestra «${visibleText(element).replace(/\s+/g, ' ').trim()}» y se llama «${label}»: el nombre empieza con las palabras que se ven`);
      }
      return problems;
    },
  },
  {
    id: 'A-02b',
    title: 'Un enlace de correo que muestra la dirección se llama con la dirección exacta (aria-label): sin él, el navegador lee un espacio en el <wbr>',
    page(page) {
      const problems = [];
      for (const link of page.elements) {
        const href = link.attributes.get('href') ?? '';
        // La franja de servicio de la cabecera muestra la dirección en un solo texto, sin <wbr> (U-11): no entra.
        if (link.name !== 'a' || !/^mailto:/i.test(href) || closest(link, node => hasClass(node, 'site-header'))) continue;
        let address = href.slice('mailto:'.length).split('?')[0];
        try { address = decodeURIComponent(address); } catch { /* se compara tal cual */ }
        if (visibleText(link).replace(/\s+/g, '') !== address) continue;
        const label = link.attributes.get('aria-label');
        if (label !== address) problems.push(`el enlace que muestra ${address} ${label === undefined ? 'no tiene aria-label' : `se llama «${label}»`}: lleva aria-label="${address}"`);
      }
      return problems;
    },
  },
  {
    id: 'A-02c',
    title: 'Las acciones de cada tarjeta de producto se llaman «Ver ficha: {nombre}» y «Cotizar: {nombre}», y las filas de la barra lateral con productos «{nombre}, {n productos}»',
    page(page) {
      const problems = [];
      const expectLabel = (element, expected) => {
        const label = element.attributes.get('aria-label');
        if (label !== expected) problems.push(`${describe(element)} ${label === undefined ? 'no tiene aria-label' : `se llama «${label}»`}: debe llamarse «${expected}»`);
      };
      for (const card of page.elements.filter(element => element.name === 'article' && hasClass(element, 'product'))) {
        const name = allElements(card).find(element => hasClass(element, 'product__name'));
        if (!name) continue;
        for (const action of allElements(card).filter(element => element.name === 'a' && hasClass(element, 'product__action'))) {
          if (hasClass(action, 'product__action--sheet')) expectLabel(action, `Ver ficha: ${textOf(name)}`);
          else if (hasClass(action, 'product__action--quote')) expectLabel(action, `Cotizar: ${textOf(name)}`);
        }
      }
      for (const row of page.elements.filter(element => element.name === 'a' && hasClass(element, 'catalog-nav__link'))) {
        const parts = allElements(row);
        const count = parts.find(element => hasClass(element, 'catalog-nav__count'));
        const name = parts.find(element => hasClass(element, 'catalog-nav__name'));
        if (!count || !name) continue;
        const number = Number(textOf(count.children.find(element => element.attributes.get('aria-hidden') === 'true') ?? count).match(/\d+/)?.[0]);
        expectLabel(row, `${textOf(name)}, ${resultSummary(number)}`);
      }
      return problems;
    },
  },
  {
    id: 'A-06',
    title: 'Cada icono en línea (<svg class="icon">) lleva width y height numéricos: sin la hoja de estilo conserva su tamaño',
    page(page) {
      const problems = [];
      const numeric = value => value !== undefined && /^\d+(\.\d+)?$/.test(value.trim()) && Number(value) > 0;
      for (const svg of page.elements.filter(element => element.name === 'svg' && hasClass(element, 'icon'))) {
        const missing = ['width', 'height'].filter(key => !numeric(svg.attributes.get(key)));
        if (missing.length) problems.push(`${describe(svg)}${svg.parent ? ` dentro de ${describe(svg.parent)}` : ''} no lleva ${missing.map(key => `${key} numérico`).join(' ni ')}: sin la hoja de estilo crece al ancho de la página`);
      }
      return problems;
    },
  },
  // R-FOTO-01 · La fotografía de un producto (ProductPhoto.astro) es un <img> con la clase de su lugar: product__img en
  // la tarjeta y producto__img en la ficha, también dentro de un <picture>. Las medidas son las del archivo o las
  // declaradas en los datos: sin ellas, la página salta cuando la foto termina de cargar. La página de un retirado
  // muestra el pictograma de su categoría, nunca su foto (R-STATE-04); las tarjetas de «Más productos…» sí llevan las
  // suyas.
  {
    id: 'R-FOTO-01',
    title: 'Cada fotografía de producto (img.product__img, img.producto__img) lleva un alt no vacío y width y height enteros positivos, y la página de un producto retirado no lleva su fotografía',
    page(page) {
      const problems = [];
      const positive = value => value !== undefined && /^[1-9]\d*$/.test(value.trim());
      for (const img of page.elements.filter(element => element.name === 'img' && (hasClass(element, 'product__img') || hasClass(element, 'producto__img')))) {
        const missing = [];
        if (!(img.attributes.get('alt') ?? '').trim()) missing.push('un alt no vacío');
        for (const key of ['width', 'height']) if (!positive(img.attributes.get(key))) missing.push(`${key} entero positivo`);
        if (missing.length) problems.push(`${describe(img)} (${img.attributes.get('src') ?? 'sin src'}) no lleva ${missing.join(' ni ')}`);
      }
      if (isRetiredPage(page)) {
        const media = page.elements.filter(element => hasClass(element, 'producto__media')).flatMap(allElements);
        const photos = new Set([
          ...page.elements.filter(element => element.name === 'img' && hasClass(element, 'producto__img')),
          ...media.filter(element => ['img', 'picture', 'source'].includes(element.name)),
        ]);
        for (const photo of photos) problems.push(`la página de un producto retirado lleva ${describe(photo)}: muestra el pictograma de su categoría, nunca una fotografía`);
      }
      return problems;
    },
  },
  // R-VARIANTE-01 · Las variantes de una ficha (src/pages/productos/[id].astro): cada <li class="producto__chip"> lleva
  // su etiqueta (.producto__chip-label) con texto que se ve. El código es opcional (muchas tallas no tienen uno propio):
  // cuando está, .producto__chip-code lleva la palabra oculta «Código» (.vh) y, después, el código, con algo que se ve;
  // un elemento de código sin código se leería «Código» y nada más. Lo que se ve es el texto sin lo oculto (.vh,
  // aria-hidden="true", el atributo hidden) y sin los caracteres que no se dibujan (`variantShown`). Una página sin foto
  // también se revisa (R-FOTO-01 solo mira las fotos que hay).
  {
    id: 'R-VARIANTE-01',
    title: 'En la página de un producto, cada variante (li.producto__chip) lleva una etiqueta (.producto__chip-label) con texto que se ve, y su código (.producto__chip-code), cuando lo lleva, tiene un código que se ve después de la palabra oculta «Código»',
    page(page) {
      if (!isProductRoute(page.route)) return [];
      const problems = [];
      for (const [index, chip] of page.elements.filter(element => element.name === 'li' && hasClass(element, 'producto__chip')).entries()) {
        const inside = allElements(chip);
        const where = `la variante ${index + 1} (${describe(chip)})`;
        const labels = inside.filter(element => hasClass(element, 'producto__chip-label'));
        if (!labels.some(label => variantShown(label).some(part => part.shown))) problems.push(`${where} no lleva una etiqueta con texto (.producto__chip-label): el visitante no sabe qué variante es`);
        for (const code of inside.filter(element => hasClass(element, 'producto__chip-code'))) {
          const parts = variantShown(code);
          const label = textOf(labels[0] ?? chip);
          const word = parts.findIndex(part => part.hidden && /^código$/i.test(part.hidden));
          const shown = parts.findIndex(part => part.shown);
          if (word === -1 || (shown !== -1 && shown < word)) problems.push(`${where}, «${label}», lleva ${describe(code)} sin la palabra oculta «Código» (.vh) antes del código`);
          if (shown === -1) problems.push(`${where}, «${label}», lleva ${describe(code)} sin código: si la variante no tiene código propio, la página no imprime ese elemento`);
        }
      }
      return problems;
    },
  },
  // R-ENLACE-01 · Los enlaces a otro sitio (los catálogos y el sitio de cada fabricante, el crédito de una foto): cada
  // enlace que abre otra pestaña (un `<a>` o un `<area>` con un `target` que no es vacío, `_self`, `_parent` ni `_top`:
  // `_blank`, `_new` o cualquier nombre) lleva `rel` con `noopener` y, para los lectores de pantalla, el texto oculto
  // «(se abre en otra pestaña)» (`.vh`), como hacen MoreLink y ActionRow con `external`. El `target` se lee como está
  // escrito, en minúsculas: « _self» o «_top » abren otra pestaña. El texto oculto cuenta si el lector lo lee: dentro
  // del enlace, sin otro `<a>` en medio, fuera de un `<template>` y sin que él ni lo que lo contiene lleve
  // aria-hidden="true", el atributo hidden o un style en línea que lo esconda (display:none, visibility:hidden o
  // collapse, content-visibility:hidden); una regla de una hoja de estilo que lo esconda no se ve aquí. Con `aria-label`, el lector lee la etiqueta, así que
  // ella debe decirlo; con `aria-labelledby` falla (el nombre viene de otro elemento: el texto oculto va en el enlace),
  // y un `<area>` falla siempre (no puede llevar texto: va un enlace). Y en /marcas/,
  // donde cada marca repite «Catálogo del fabricante (PDF)» o «Catálogo en línea del fabricante», dos enlaces con el
  // mismo nombre accesible llevan al mismo lugar: si no, la lista de enlaces de un lector de pantalla los confunde (cada
  // catálogo lleva la marca en su nombre, con texto oculto). Dos enlaces con el mismo nombre y el mismo destino (la
  // celda de una marca y su nombre en la lista de catálogos) sí pueden ir; dos destinos que difieren solo en la diagonal
  // final de la ruta son el mismo lugar, y uno con fragmento («/marcas/#catalogos») es otro que la página sola.
  {
    id: 'R-ENLACE-01',
    title: 'Cada enlace que abre otra pestaña lleva rel con noopener y el texto oculto «(se abre en otra pestaña)», que el lector de pantalla lee, y en /marcas/ dos enlaces con el mismo nombre accesible llevan al mismo lugar',
    page(page) {
      const problems = [];
      for (const link of page.elements.filter(opensAnotherTab)) {
        const href = link.attributes.get('href') ?? '';
        if (link.name === 'area') {
          problems.push(`el área «${link.attributes.get('alt') ?? ''}» (${href.slice(0, 80)}) abre otra pestaña: un <area> no puede llevar el texto oculto «${NEW_TAB_TEXT}»; usa un enlace (<a>), como MoreLink con external`);
          continue;
        }
        const where = `el enlace «${accessibleName(link)}» (${href.slice(0, 80)})`;
        if (!(link.attributes.get('rel') ?? '').toLowerCase().split(/\s+/).includes('noopener')) problems.push(`${where} abre otra pestaña sin rel="noopener": escribe rel="noopener noreferrer", como MoreLink con external`);
        const hidden = allElements(link).filter(element => hasClass(element, 'vh') && textOf(element).includes(NEW_TAB_TEXT));
        // Se lee si, subiendo desde el texto oculto, se llega al enlace sin nada que lo esconda o lo saque de él.
        const read = hidden.filter(element => unreadBecause(element, link) === null);
        if (link.attributes.has('aria-labelledby')) problems.push(`${where} abre otra pestaña y toma su nombre de aria-labelledby: quítalo y deja el nombre y el texto oculto «${NEW_TAB_TEXT}» (.vh) dentro del enlace, como MoreLink con external`);
        else if (link.attributes.has('aria-label')) {
          if (!(link.attributes.get('aria-label') ?? '').includes(NEW_TAB_TEXT)) problems.push(`${where} abre otra pestaña y su aria-label no lo dice: el lector de pantalla lee la etiqueta y no el texto oculto; quita aria-label o termina la etiqueta con «${NEW_TAB_TEXT}»`);
        } else if (!read.length && hidden.length) problems.push(`${where} abre otra pestaña sin decirlo: su texto oculto «${NEW_TAB_TEXT}» ${unreadBecause(hidden[0], link)}, como MoreLink con external`);
        else if (!read.length) problems.push(`${where} abre otra pestaña sin decirlo: lleva el texto oculto «${NEW_TAB_TEXT}» (.vh), como MoreLink con external`);
      }
      if (page.route === routes.brands) {
        /** @type {Map<string, string>} */
        const seen = new Map();
        for (const link of inMain(page).filter(element => element.name === 'a' && element.attributes.has('href'))) {
          const name = loose(accessibleName(link));
          const href = link.attributes.get('href') ?? '';
          if (!name) continue;
          if (seen.has(name) && !samePlace(seen.get(name), href)) problems.push(`dos enlaces se llaman «${accessibleName(link)}» y llevan a lugares distintos (${seen.get(name).slice(0, 60)} y ${href.slice(0, 60)}): agrega a cada uno, con texto oculto, lo que los distingue (la marca)`);
          else if (!seen.has(name)) seen.set(name, href);
        }
      }
      return problems;
    },
  },
  // I-04 · Qué reconoce y qué no.
  // Reconoce, en el aviso, en lo que va dentro y en lo que lo contiene: hidden, popover, aria-hidden="true" y un
  // style en línea con display:none, visibility:hidden o collapse, o content-visibility:hidden. En las hojas de la
  // salida y en los <style> de cada página: una regla con esas mismas declaraciones cuyo sujeto puede ser uno de esos
  // elementos (NOTICE_MARKUP.elements), escrita como sea: con escapes, con [class…], anidada en otra regla o con sus
  // declaraciones directamente dentro de un @media, @supports, @layer, @container o @scope anidado. Solo se permite
  // dentro de @media print; las demás condiciones no se evalúan (pueden cumplirse), así que una regla dentro de
  // @media (min-width: …) o @supports cuenta siempre.
  // Límites (lo que no ve, o ve de más):
  // - Un valor que llega por una variable no se resuelve: «display: var(--x)» con «--x: none», o
  //   «display: var(--nada, none)», ocultan el aviso y pasan. Es el mismo límite que el del escáner con lo que lee de
  //   una página: lo que se calcula al mostrarla no se ve en el archivo.
  // - Solo ve el marcado compilado: una clase o un atributo que un script pone en el aviso al cargar la página, con una
  //   regla que no nombra las clases del aviso («.oculto { display: none }» y un script que pone .oculto en el
  //   <aside>), pasa; lo que un script hace directamente (quitar el aviso, cambiar su style) tampoco se ve. Lo que los
  //   scripts de hoy ponen (.js y variables en el style de <html>) está anotado en NOTICE_MARKUP.elements.
  // - No lee el atributo media de <link> ni de <style>: una hoja que el navegador solo aplica al imprimir por ese
  //   atributo se juzga como si se aplicara siempre (se reporta de más).
  // - Otras formas de quitar el aviso de la vista (opacity: 0, alto cero, sacarlo de la pantalla, un color igual al
  //   fondo) no se reconocen. Las declaraciones escritas directamente en un @starting-style anidado no cuentan: solo
  //   dan el punto de partida de una transición.
  // - Las declaraciones escritas directamente en un @scope que no está dentro de una regla
  //   («@scope (.site-notice) { display: none }») no se leen: ocultan el aviso y pasan. Con una regla dentro del
  //   @scope («:scope { … }», «& { … }») sí se reportan.
  // Como todas las protecciones, busca errores escritos de forma directa, no un ocultamiento hecho a propósito.
  {
    id: 'I-04',
    title: 'Nada oculta el aviso de arriba fuera de la impresión: ni hidden, popover, aria-hidden="true" o un estilo en línea en el aviso, en lo que va dentro o en lo que lo contiene, ni una regla de estilo que pueda seleccionarlos con display:none, visibility:hidden o collapse, o content-visibility:hidden; el aviso compilado no lleva elementos, clases ni atributos que la comprobación no conozca',
    // Que el aviso deba estar (y cuál) lo decide scripts/scan-dist.mjs, que conoce --launch; aquí solo se revisa que,
    // si está, nada lo oculte. Un texto que se lee sin navegador no ve una hoja de estilo: por eso esta comprobación.
    page(page) {
      const problems = [];
      const seen = new Set();
      const isNotice = element => classesOf(element).some(name => NOTICE_MARKUP.classes.includes(name));
      for (const notice of page.elements.filter(isNotice)) {
        const containers = [];
        for (let element = notice.parent; element && element.name !== '#document'; element = element.parent) containers.push(element);
        // El aviso, lo que va dentro (el <strong> de la primera frase) y lo que lo contiene, hasta <html>.
        for (const element of [notice, ...allElements(notice), ...containers]) {
          if (seen.has(element)) continue;
          seen.add(element);
          const relation = isNotice(element) ? '' : containers.includes(element) ? `, que contiene ${describe(notice)},` : `, dentro de ${describe(closest(element.parent, isNotice) ?? notice)},`;
          const hiding = hiddenByAttributes(element);
          if (hiding.length) {
            problems.push(`${describe(element)}${relation} lleva ${hiding.join(', ')}: oculta el aviso de arriba`);
            continue;
          }
          const unknown = unknownToNotice(element);
          if (unknown.length) problems.push(`${describe(element)}${relation} no está descrito en NOTICE_MARKUP.elements (scripts/check-markup.mjs): ${unknown.join(', ')}. Sin esa descripción la comprobación no puede saber si una regla de estilo lo oculta; anótalo allí o quítalo del aviso`);
        }
      }
      return problems;
    },
    sheet(sheet) {
      const problems = [];
      for (const rule of cssRules(sheet.css)) {
        if (printOnly(rule.conditions)) continue;
        const hiding = declarationsOf(rule.declarations).filter(hidesElement);
        if (!hiding.length) continue;
        for (const selector of rule.selectors.filter(reachesNotice)) {
          const where = rule.conditions.length ? ` (dentro de ${rule.conditions.join(' › ')})` : '';
          problems.push(`la regla «${selector}»${where} lleva ${hiding.map(({ property, value }) => `${property}: ${value}`).join(', ')}: oculta el aviso de arriba (su sujeto puede ser el aviso, su texto, lo que va en él o lo que lo contiene); solo se permite dentro de @media print, o con un sujeto que el aviso no pueda ser (una clase propia)`);
        }
      }
      return problems;
    },
  },
  // R-RULE-30a · Ningún control que no haga nada.
  // Los controles: cada <button>, <select>, <textarea>, <input> que no es hidden y cada elemento con role="button", en
  // cualquier parte de la página, también dentro de un <template> (se clona y entra en la página). El código de la
  // página es el de `pageCode`: sus scripts de código en línea y los archivos de la carpeta que cargan e importan; un
  // bloque de datos (<script type="application/json">) no es código, y lo que nombra el código de OTRA página no cuenta.
  // Un control tiene función cuando:
  // - funciona solo: es un campo con name o un botón de envío (type="submit", o un <button> sin type) de un <form> con
  //   action (las dos búsquedas: el navegador va a la dirección del formulario con sus campos), o un botón
  //   type="reset" dentro de un <form> (vacía sus campos sin script; hoy el sitio no usa ninguno);
  // - lleva un atributo data-* que el código nombra (`namesHook`: el atributo entero, o su forma dataset como palabra
  //   entera; «data-quote-add» no cuenta como «data-quote-add-all»);
  // - es un campo con name o un botón de envío de un <form> que lleva un atributo así (el script atiende el envío del
  //   formulario y lee sus campos). El formulario es el que contiene al control o el que nombra su atributo form; un
  //   <template> corta esa relación.
  // Decisiones, tomadas de lo que las páginas llevan hoy:
  // - <summary> no es un control aquí: abre y cierra su <details> sin script (Categorías, «Ver todas las marcas», las
  //   preguntas de contacto). <label> tampoco: enfoca o marca su campo, y el campo se revisa.
  // - Un control con disabled o aria-disabled="true" se revisa igual que los demás: si ningún script lo nombra, nada lo
  //   habilita y se queda inútil (hoy solo «Disminuir» del selector de cantidad empieza con aria-disabled, y lleva su
  //   gancho). Un control con hidden también: un script lo muestra.
  // - Un manejador escrito en un atributo (onclick) no cuenta: el sitio no los usa; un control así lleva su gancho.
  // - El código de un <script> que está dentro de un <template> cuenta como código de la página (el navegador lo
  //   ejecuta al clonarla), pero R-RULE-30b ya hace fallar ese <script>, así que la compilación no pasa igual.
  // Límites: prueba que un script de la página nombra el gancho del control, no que haga algo útil con él, ni que el
  // control se muestre solo cuando funciona (que un control de JavaScript lleve js-only, por ejemplo). Basta con que el
  // nombre aparezca en el código, también en un comentario o en una cadena que no es un selector. Un control cuya
  // función viene solo de un oyente puesto en un antecesor sin gancho propio falla: es a propósito, se le da un
  // gancho. Un archivo que el código arma en el navegador («import(variable)») no se sigue. El comportamiento (qué
  // pasa al pulsar, el foco, lo que se anuncia) se sigue revisando en el navegador.
  {
    id: 'R-RULE-30a',
    title: 'Cada control (<button>, <select>, <textarea>, <input> que no es hidden y role="button", también dentro de un <template>) tiene función: es un campo con name o un botón de envío de un <form> con action (o un botón type="reset" de un <form>), o lleva un atributo data-* que el código de su página nombra (sus scripts en línea y los archivos de la compilación que cargan e importan, sin los bloques de datos), o es un campo con name o un botón de envío de un <form> que lleva ese atributo. <summary> y <label> no son controles; disabled no exime. Prueba que un script nombra el gancho, no que haga algo útil con él ni que el control se muestre solo cuando funciona: el comportamiento se revisa en el navegador',
    page(page) {
      return page.elements.filter(isControl).map(control => missingFunction(control, page)).filter(message => message !== null);
    },
  },
  // R-RULE-30b · Ningún <script> dentro de un <template>.
  // Astro escribe el script de un componente donde el componente se dibuja por primera vez; dentro de un <template>
  // escribe una copia más, y cada clon de la plantilla la ejecuta otra vez: en este proyecto eso hizo que un clic
  // contara cuatro veces con tres renglones clonados. La regla del proyecto es que un componente que se usa dentro de un
  // <template> no lleva script, y su script lo escribe una sola vez un componente aparte (…Script.astro) fuera de la
  // plantilla. Para que la regla sea simple falla cualquier <script> dentro de un <template>, a cualquier profundidad y
  // de cualquier tipo: también un bloque de datos (nada lo necesita ahí).
  {
    id: 'R-RULE-30b',
    title: 'Ningún <script>, de ningún tipo (tampoco un bloque de datos), va dentro de un <template>: cada clon de la plantilla ejecutaría su copia otra vez',
    page(page) {
      const problems = [];
      for (const script of page.elements.filter(element => element.name === 'script')) {
        const template = closest(script.parent, element => element.name === 'template');
        if (!template) continue;
        const type = script.attributes.get('type');
        const src = script.attributes.get('src');
        const hooks = [...template.attributes.keys()].filter(name => name.startsWith('data-'));
        const what = `<script${type !== undefined ? ` type="${type}"` : ''}${src !== undefined ? ` src="${src}"` : ''}>${src === undefined ? ` «${(script.source ?? '').trim().slice(0, 60)}»` : ''}`;
        problems.push(`${what} está dentro de ${describe(template).slice(0, -1)}${hooks.length ? ` ${hooks.join(' ')}` : ''}>: cada clon de la plantilla lo ejecuta otra vez; el script va una sola vez fuera de la plantilla (un componente …Script.astro)`);
      }
      return problems;
    },
  },
  // R-QUOTE-12 · La página de cotizar lleva lo que su script necesita, según la compilación.
  // La lista guardada solo tiene ids (productId, variantId, cantidad y unidad); la página de cotizar recupera nombre y
  // código del índice público que imprime al compilar. Lo que imprime depende de las páginas de producto de la
  // compilación (src/pages/cotizar/index.astro), y su script trabaja con lo que encuentra: sin el índice, cada renglón
  // guardado sería «un producto que no aparece en esta página»; sin la plantilla de renglón, ningún producto se
  // dibujaría; sin el script del selector de cantidad, sus botones no harían nada. Hechos, en la página /cotizar/:
  // - siempre: el renglón de los productos que la página no ubica (data-quote-unknown), la línea de estado
  //   (data-quote-status-row) y el aviso de que el navegador no guardó un cambio (data-quote-write-failed), uno de cada
  //   uno;
  // - con alguna página de producto (ficha o retirado): un índice público (<script type="application/json"
  //   data-quote-index>) que cuadra con la compilación (cada ficha en «products», cada retirado en «retired», cada
  //   entrada con su página en la ruta de su id y esa ruta como url) y la plantilla del renglón de un retirado
  //   (template[data-quote-retired-template]); sin ninguna, ninguno de los dos;
  // - con alguna ficha: la plantilla de renglón (template[data-quote-row-template]), el bloque de herramientas
  //   (data-quote-tools) y el script del selector de cantidad; sin ninguna, ninguno de los tres.
  // Hoy las dos condiciones coinciden (la vista previa tiene fichas y un retirado; producción, ninguna página de
  // producto). Todo se cuenta fuera de un <template>, donde el script de la página lo encuentra.
  // Límites: el script del selector de cantidad se reconoce porque el código de la página (sus scripts y los archivos que
  // cargan) nombra data-stepper, el gancho que solo él atiende; otro script que lo nombrara contaría como él. Del índice
  // compara ids y url con las páginas, no los nombres, códigos ni variantes. Sin una página /cotizar/ en la carpeta no
  // dice nada. No ejecuta el script: lo que hace con lo impreso se revisa en el navegador.
  {
    id: 'R-QUOTE-12',
    title: 'La página de cotizar lleva lo que su script necesita según las páginas de producto de la compilación: siempre, el renglón de los productos que no ubica, la línea de estado y el aviso de que el navegador no guardó un cambio; con alguna página de producto (ficha o retirado), el índice público, que cuadra con la compilación (cada ficha en «products» y cada retirado en «retired», en la ruta de su id), y la plantilla del renglón retirado, y sin ninguna, ninguno de los dos; con alguna ficha, la plantilla de renglón, el bloque de herramientas y el script del selector de cantidad, y sin ninguna, ninguno de los tres',
    page(page, options) {
      if (page.route !== routes.quoteList) return [];
      const built = productPages(options.pages ?? []);
      const anyProduct = built.fichas.size + built.retired.size > 0;
      const anyFicha = built.fichas.size > 0;
      const reachable = page.elements.filter(element => !inTemplate(element));
      const withHook = (hook, name) => reachable.filter(element => element.attributes.has(hook) && (!name || element.name === name));
      const indexes = withHook(QUOTE_PAGE_HOOKS.index, 'script').filter(script => (script.attributes.get('type') ?? '').trim().toLowerCase() === 'application/json');
      const stepperScript = namesHook(page.code ?? '', QUOTE_PAGE_HOOKS.stepper);
      const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
      const fichasNote = anyFicha ? `la compilación tiene ${plural(built.fichas.size, 'ficha', 'fichas')}` : 'la compilación no tiene fichas';
      const productsNote = anyProduct
        ? `la compilación tiene ${plural(built.fichas.size, 'ficha', 'fichas')} y ${plural(built.retired.size, 'página de retirado', 'páginas de retirado')}`
        : 'la compilación no tiene páginas de producto';
      const problems = [];
      /** `what` lleva su artículo; `note` dice por qué va o no va. */
      const expect = (found, wanted, what, note) => {
        if (found === wanted) return;
        if (wanted === 0) problems.push(`la página lleva ${what}${found > 1 ? ` (${found} veces)` : ''} y ${note}`);
        else if (found === 0) problems.push(`falta ${what}: ${note}`);
        else problems.push(`${what} aparece ${found} veces; va una sola vez (el script de la página usa el primero)`);
      };
      const always = 'va siempre: aun sin productos, la página quita de una lista guardada los que no ubica, lo deja deshacer y avisa si el navegador no guarda el cambio';
      expect(withHook(QUOTE_PAGE_HOOKS.unknown).length, 1, 'el renglón de los productos que la página no ubica ([data-quote-unknown])', always);
      expect(withHook(QUOTE_PAGE_HOOKS.statusRow).length, 1, 'la línea de estado ([data-quote-status-row])', always);
      expect(withHook(QUOTE_PAGE_HOOKS.writeFailed).length, 1, 'el aviso de que el navegador no guardó un cambio ([data-quote-write-failed])', always);
      expect(indexes.length, anyProduct ? 1 : 0, 'el índice público (<script type="application/json" data-quote-index>)', productsNote);
      expect(withHook(QUOTE_PAGE_HOOKS.retiredTemplate, 'template').length, anyProduct ? 1 : 0, 'la plantilla del renglón retirado (template[data-quote-retired-template])', productsNote);
      expect(withHook(QUOTE_PAGE_HOOKS.rowTemplate, 'template').length, anyFicha ? 1 : 0, 'la plantilla de renglón (template[data-quote-row-template])', fichasNote);
      expect(withHook(QUOTE_PAGE_HOOKS.tools).length, anyFicha ? 1 : 0, 'el bloque de herramientas ([data-quote-tools])', fichasNote);
      if (anyFicha && !stepperScript) problems.push(`falta el script del selector de cantidad (ningún script de la página nombra [${QUOTE_PAGE_HOOKS.stepper}]) y ${fichasNote}: los botones de cantidad de los renglones no harían nada`);
      if (!anyFicha && stepperScript) problems.push(`la página carga el script del selector de cantidad (un script nombra [${QUOTE_PAGE_HOOKS.stepper}]) y ${fichasNote}: no hay ningún selector que atender`);
      if (indexes.length === 1) problems.push(...quoteIndexProblems(indexes[0].source ?? '', built));
      return problems;
    },
  },
];

// ---------------------------------------------------------------------------------------------------
// Revisión de una carpeta
// ---------------------------------------------------------------------------------------------------

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

/**
 * Revisa el marcado de una carpeta compilada.
 * @param {string} directory
 * @param {{ preview?: boolean, checks?: Check[] }} [options] `preview`: modo de la compilación. `checks`: las comprobaciones (todas por omisión).
 * @returns {Promise<{ problems: { id: string, file: string, message: string }[], pages: number, sheets: number }>}
 */
export async function checkMarkup(directory, options = {}) {
  const checks = options.checks ?? CHECKS;
  const files = (await walk(directory)).sort();
  const name = file => relative(directory, file).split('\\').join('/');
  /** @type {Page[]} */
  const pages = [];
  /** @type {Options} */
  const settings = { preview: Boolean(options.preview), pages };
  /** @type {Sheet[]} */
  const sheets = [];
  // Cada archivo de código se lee una sola vez, aunque lo carguen muchas páginas.
  const sources = new Map();
  const load = path => {
    if (!sources.has(path)) sources.set(path, readFile(path, 'utf8').catch(() => null));
    return sources.get(path);
  };
  for (const file of files) {
    const extension = extname(file).toLowerCase();
    if (extension === '.html' || extension === '.htm') {
      const { root, styles } = parseHtml(await readFile(file, 'utf8'));
      const code = await pageCode({ file, root }, directory, load);
      pages.push({ file: name(file), route: routeOf(name(file)), root, elements: allElements(root), code });
      styles.forEach((css, index) => sheets.push({ file: `${name(file)} <style> ${index + 1}`, css, selectors: cssSelectors(css) }));
    } else if (extension === '.css') {
      const css = await readFile(file, 'utf8');
      sheets.push({ file: name(file), css, selectors: cssSelectors(css) });
    }
  }
  const problems = [];
  for (const check of checks) {
    if (check.sheet) for (const sheet of sheets) for (const message of check.sheet(sheet, settings)) problems.push({ id: check.id, file: sheet.file, message });
    if (check.page) for (const page of pages) for (const message of check.page(page, settings)) problems.push({ id: check.id, file: page.file, message });
  }
  return { problems, pages: pages.length, sheets: sheets.length };
}

// ---------------------------------------------------------------------------------------------------
// Línea de comandos
// ---------------------------------------------------------------------------------------------------

async function main(argv) {
  const usage = 'Uso: node scripts/check-markup.mjs [carpeta] [--preview]';
  const flags = argv.filter(arg => arg.startsWith('--'));
  const unknown = flags.filter(flag => flag !== '--preview');
  if (unknown.length) {
    console.error(`Opción no reconocida: ${unknown.join(', ')}\n${usage}`);
    return 2;
  }
  const preview = flags.includes('--preview');
  const target = argv.find(arg => !arg.startsWith('--')) ?? (preview ? 'dist-preview' : 'dist');
  let result;
  try {
    result = await checkMarkup(resolve(target), { preview });
  } catch (error) {
    if (error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR') throw error;
    console.error(`No se puede leer ${target}: compila antes de revisar (npm run build o npm run build:preview).`);
    return 2;
  }
  if (result.pages === 0) {
    console.error(`No hay páginas HTML en ${target}: compila antes de revisar (npm run build o npm run build:preview).`);
    return 2;
  }
  for (const problem of result.problems) console.log(`FAIL  ${problem.id}  ${problem.file}  ${problem.message}`);
  console.log(`${result.problems.length ? '\n' : ''}Marcado · ${target} · modo ${preview ? 'vista previa' : 'producción'}: ${result.pages} páginas HTML, ${result.sheets} hojas de estilo, ${CHECKS.length} comprobaciones (${CHECKS.map(check => check.id).join(', ')}), ${result.problems.length} problemas.`);
  return result.problems.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
