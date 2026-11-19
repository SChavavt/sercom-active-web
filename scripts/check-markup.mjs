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
 * @param {string} css
 */
export function cssSelectors(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
  const selectors = [];
  // El texto antes de cada «{» es un selector o una regla @; las declaraciones no contienen llaves.
  for (const match of clean.matchAll(/([^{};]+)\{/g)) {
    const prelude = match[1].trim();
    if (!prelude || prelude.startsWith('@') || /^(?:from|to|\d+(?:\.\d+)?%)(?:\s*,|$)/.test(prelude)) continue;
    selectors.push(...splitSelectorList(prelude));
  }
  return selectors;
}
/** Separa «a, b:is(c, d)» en ["a", "b:is(c, d)"]. */
function splitSelectorList(list) {
  const parts = [];
  let depth = 0, start = 0;
  for (let i = 0; i < list.length; i++) {
    if (list[i] === '(') depth++;
    else if (list[i] === ')') depth--;
    else if (list[i] === ',' && depth === 0) { parts.push(list.slice(start, i).trim()); start = i + 1; }
  }
  parts.push(list.slice(start).trim());
  return parts.filter(Boolean);
}
/** Clases que nombra un selector («.a .b__c:hover» → ["a", "b__c"]). */
export const selectorClasses = selector => [...selector.matchAll(/\.(-?[_a-zA-Z\u00a0-\uffff][\w\u00a0-\uffff-]*)/g)].map(match => match[1]);

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

// Clases genéricas que la cabecera ya no usa: una página puede usarlas sin heredar reglas de la cabecera (U-07).
const RETIRED_HEADER_CLASSES = ['nav', 'search', 'search__input', 'search__btn'];

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

/** @type {Check[]} */
export const CHECKS = [
  {
    id: 'U-07',
    title: 'La navegación y la búsqueda de la cabecera usan nombres de su bloque; ninguna regla global selecciona .nav, .search, .search__input ni .search__btn',
    sheet(sheet) {
      const problems = [];
      for (const selector of sheet.selectors) {
        const retired = selectorClasses(selector).filter(name => RETIRED_HEADER_CLASSES.includes(name));
        if (retired.length) problems.push(`el selector «${selector}» usa la clase genérica .${retired.join(', .')}: una página que use ese nombre heredaría las reglas de la cabecera`);
      }
      return problems;
    },
    page(page, options) {
      const parts = headerParts(page);
      if (!parts) return ['la página no tiene la cabecera del sitio (<header class="site-header">)'];
      const problems = [];
      for (const element of parts.elements) {
        const retired = classesOf(element).filter(name => RETIRED_HEADER_CLASSES.includes(name));
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
