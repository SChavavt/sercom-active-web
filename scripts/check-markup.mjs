#!/usr/bin/env node
// Comprobaciones del marcado de un sitio ya compilado: hechos de la cabecera y de la barra fija que se leen en el
// HTML y en las hojas de estilo, sin navegador.
//
// Uso:  node scripts/check-markup.mjs [carpeta] [--preview]
//   carpeta     carpeta compilada; por omisión `dist`, o `dist-preview` con --preview
//   --preview   la compilación es la vista previa de diseño: hay productos y categorías, así que la cabecera debe
//               tener el campo de búsqueda con su botón Buscar y la entrada «Categorías»
//
// Cada comprobación vive en CHECKS con su identificador (el del hallazgo de la revisión que la originó). Una
// comprobación recibe cada página ya leída (árbol de elementos, ruta publicada) y cada hoja de estilo, y devuelve
// mensajes; agregar otra es agregar una entrada a CHECKS.
//
// Qué no revisa: el resultado visual (anchos, solapes, foco, colores). Eso lo prueban las pruebas con navegador.
//
// Termina con código 1 si encuentra problemas y con 2 si la carpeta no existe o no tiene páginas HTML.
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { routes } from '../src/lib/routes.mjs';

// ---------------------------------------------------------------------------------------------------
// Lectura de HTML: un árbol de elementos sencillo (Astro escribe HTML bien formado)
// ---------------------------------------------------------------------------------------------------

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);
const ATTRIBUTE = /\s*([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/y;
const decodeEntities = text => text
  .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
  .replace(/&amp;/g, '&');

/**
 * @typedef {{ name: string, attributes: Map<string, string>, children: Element[], parent: Element | null, text: string[], order: number }} Element
 */

/**
 * Árbol de elementos de un documento. Cada elemento lleva su orden en el documento (`order`) y su texto directo.
 * El contenido de <script>, <style>, <textarea> y <title> no se interpreta. Las hojas <style> se devuelven aparte.
 * @param {string} source
 */
export function parseHtml(source) {
  const html = source.replace(/<!--[\s\S]*?-->/g, '');
  const lower = html.toLowerCase();
  /** @type {Element} */
  const root = { name: '#document', attributes: new Map(), children: [], parent: null, text: [], order: 0 };
  /** @type {string[]} */
  const styles = [];
  let current = root;
  let order = 0;
  const tag = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)/g;
  let last = 0;
  let match;
  while ((match = tag.exec(html))) {
    const between = html.slice(last, match.index);
    if (between.trim()) current.text.push(decodeEntities(between));
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
    const element = { name, attributes, children: [], parent: current, text: [], order: ++order };
    current.children.push(element);
    if (RAW_TEXT.has(name)) {
      const close = lower.indexOf(`</${name}`, next);
      const content = html.slice(next, close === -1 ? html.length : close);
      if (name === 'style') styles.push(content);
      else if (name !== 'script') element.text.push(decodeEntities(content));
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
export const textOf = element => [...element.text, ...element.children.map(textOf)].join(' ').replace(/\s+/g, ' ').trim();
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
const ATTRIBUTE_SELECTOR = new RegExp(String.raw`^\s*((?:${ESCAPE}|[\w-])+)\s*(?:([~|^$*]?=)\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|(?:${ESCAPE}|[^\s\]\\])+)\s*([iIsS])?)?\s*$`, 's');

/**
 * Lee un selector: las clases que nombra con «.» y sus selectores de atributo (lo que va entre corchetes y dentro de
 * las cadenas no son clases). Los escapes se resuelven.
 * @param {string} selector
 */
function readSelector(selector) {
  const classes = [];
  const attributes = [];
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
      }
      i = end + 1;
    } else {
      i++;
    }
  }
  return { classes, attributes };
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
 * ¿Un selector de atributo sobre `class` puede seleccionar un elemento con una clase retirada?
 * «=» y «~=» comparan palabras enteras; «|=», el valor o su prefijo con guion; «^=», «$=» y «*=», una parte del valor.
 * @param {{ operator: string | null, value: string | null, insensitive: boolean }} attribute
 */
export function classAttributeIsRetired({ operator, value, insensitive }) {
  if (!operator || !value) return false;
  const text = insensitive ? value.toLowerCase() : value;
  const words = text.split(/\s+/).filter(Boolean);
  // Palabras completas dentro del valor: las que tienen espacio (o el borde que el operador fija) a ambos lados.
  const whole = (open, close) => words.filter((_, index) => (index > 0 || open || /^\s/.test(text)) && (index < words.length - 1 || close || /\s$/.test(text)));
  switch (operator) {
    case '=': case '~=': return words.some(isRetiredClass);
    case '|=': return isRetiredClass(text);
    case '^=': return RETIRED_HEADER_CLASSES.some(name => name.startsWith(text)) || whole(true, false).some(isRetiredClass);
    case '$=': return RETIRED_HEADER_CLASSES.some(name => name.endsWith(text)) || whole(false, true).some(isRetiredClass);
    case '*=': return RETIRED_HEADER_CLASSES.some(name => name.includes(text)) || whole(false, false).some(isRetiredClass);
    default: return false;
  }
}

/**
 * @typedef {{ file: string, route: string, root: Element, elements: Element[] }} Page
 * @typedef {{ file: string, css: string, selectors: string[] }} Sheet
 * @typedef {{ preview: boolean }} Options
 * @typedef {{ id: string, title: string, page?: (page: Page, options: Options) => string[], sheet?: (sheet: Sheet, options: Options) => string[] }} Check
 */

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
    } else if (hasClass(element, 'masthead__cta')) add('cta', element);
    else if (hasClass(element, 'masthead__logo')) add('logo', element);
    else if (element.attributes.has('aria-current')) add(`otro:${describe(element)}`, element);
  }
  const dock = page.elements.find(element => element.name === 'nav' && hasClass(element, 'dock'));
  if (dock) for (const element of allElements(dock)) if (element.name === 'a') add(`dock:${element.attributes.get('href')}`, element);
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

/** @type {Check[]} */
export const CHECKS = [
  {
    id: 'U-03',
    title: 'En la cabecera los botones Buscar y Menú van antes de la navegación y de la búsqueda; el orden de computadora es logotipo, navegación, búsqueda, WhatsApp y Cotizar mi lista',
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
