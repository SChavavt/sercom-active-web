#!/usr/bin/env node
// Comprobaciones del marcado de un sitio ya compilado: hechos de la cabecera, de la barra fija y del contenido
// (celdas de relleno de las retículas, dirección de correo, ruta de navegación, marcas de la página actual y página
// de un producto retirado) que se leen en el HTML y en las hojas de estilo, sin navegador.
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
    if (between.trim()) addText(current, between);
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
