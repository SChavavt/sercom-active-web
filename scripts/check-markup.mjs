#!/usr/bin/env node
// Comprobaciones del marcado de un sitio ya compilado: hechos de la cabecera, de la barra fija y del contenido
// (celdas de relleno de las retículas, dirección de correo, ruta de navegación, marcas de la página actual y página
// de un producto retirado) y del aviso de arriba (que nada lo oculte), que se leen en el HTML y en las hojas de
// estilo, sin navegador.
//
// Uso:  node scripts/check-markup.mjs [carpeta] [--preview]
//   carpeta     carpeta compilada; por omisión `dist`, o `dist-preview` con --preview
//   --preview   la compilación es la vista previa de diseño: hay productos, así que la cabecera debe tener el campo
//               de búsqueda (#buscador) con su botón Buscar
//
// Cada comprobación vive en CHECKS con su identificador (el del hallazgo de la revisión que la originó). Una
// comprobación recibe cada página ya leída (árbol de elementos, ruta publicada) y cada hoja de estilo, y devuelve
// mensajes; agregar otra es agregar una entrada a CHECKS.
//
// Qué no revisa: el resultado visual (anchos, solapes, foco, colores). Eso se revisa a mano en un navegador
// (docs/diseno.md, sección 15): el repositorio no tiene pruebas con navegador.
//
// Termina con código 1 si encuentra problemas y con 2 si la carpeta no existe o no tiene páginas HTML.
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
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
 * @typedef {{ name: string, attributes: Map<string, string>, children: Element[], parent: Element | null, text: string[], content: (string | Element)[], order: number }} Element
 */

/**
 * Árbol de elementos de un documento. Cada elemento lleva su orden en el documento (`order`), su texto directo
 * (`text`) y su contenido tal como se lee (`content`: el texto directo y los elementos hijos, en su orden).
 * El contenido de <script>, <style>, <textarea> y <title> no se interpreta. Las hojas <style> se devuelven aparte.
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
      else if (name !== 'script') addText(element, content);
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
/**
 * Reglas de estilo de una hoja: sus selectores, sus declaraciones (sin los comentarios) y las reglas @ que la
 * contienen, de fuera hacia dentro («@media print»). Las reglas de @keyframes y @font-face no son reglas de estilo.
 * Una regla anidada dentro de otra lleva los selectores de las dos unidos («&» es el de fuera).
 * @param {string} css
 * @returns {{ selectors: string[], declarations: string, conditions: string[] }[]}
 */
export function cssRules(css) {
  /** @type {{ selectors: string[], declarations: string, conditions: string[] }[]} */
  const rules = [];
  /** @type {({ at: string } | { rule: { selectors: string[], declarations: string, conditions: string[] } } | { skip: true })[]} */
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
        stack.push(/^@(?:-\w+-)?(?:keyframes|font-face|counter-style|font-feature-values|property|page)\b/i.test(prelude) ? { skip: true } : { at: prelude.replace(/\s+/g, ' ') });
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
 * a la izquierda es el principio de una clase («[class*=" na"]», en «x nav»); solo a la derecha, su final
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
    if (left) return names.some(name => name.startsWith(word));
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
 * @typedef {{ file: string, route: string, root: Element, elements: Element[] }} Page
 * @typedef {{ file: string, css: string, selectors: string[] }} Sheet
 * @typedef {{ preview: boolean }} Options
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
 * entre corchetes, las cadenas y los escapes no separan.
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
    else if (char === '\\') { current += bare.slice(i, i + 2); i++; }
    else if (char === '[') {
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
  const settings = { preview: Boolean(options.preview) };
  const checks = options.checks ?? CHECKS;
  const files = (await walk(directory)).sort();
  const name = file => relative(directory, file).split('\\').join('/');
  /** @type {Page[]} */
  const pages = [];
  /** @type {Sheet[]} */
  const sheets = [];
  for (const file of files) {
    const extension = extname(file).toLowerCase();
    if (extension === '.html' || extension === '.htm') {
      const { root, styles } = parseHtml(await readFile(file, 'utf8'));
      pages.push({ file: name(file), route: routeOf(name(file)), root, elements: allElements(root) });
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
