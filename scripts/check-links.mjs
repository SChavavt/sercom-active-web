#!/usr/bin/env node
// Verificador de enlaces de un sitio ya compilado (regla R-RULE-30: sin enlaces rotos ni controles inertes).
//
// Uso:  node scripts/check-links.mjs [carpeta] [--site=https://dominio]
//   carpeta   carpeta compilada; por omisión `dist`
//   --site    dirección pública del sitio: sus enlaces absolutos se revisan como internos.
//             Por omisión se usa la variable SITE_URL, la misma que lee astro.config.mjs.
//
// Qué revisa en cada página HTML y en cada hoja de estilo:
//   1. Cada href, src, srcset, poster, action, url() e image-set() interno lleva a un archivo de la carpeta. La ruta de una
//      página termina en diagonal (/catalogo/) y corresponde a un index.html.
//   2. Cada #ancla existe como id en la página de destino.
//   3. Ningún enlace está vacío, es solo «#», usa javascript: o carece de href.
//   4. Nada apunta a localhost, a una red local, a file:// ni a una carpeta del equipo donde se compiló
//      (esto también se busca dentro de JS, CSS y JSON).
//   5. La página 404 solo usa rutas que empiezan con «/», porque se muestra en cualquier dirección.
//   6. Ninguna dirección empieza con «//» (sin esquema): «'/' + '/catalogo/'» da «//catalogo/», que el navegador
//      abre en el servidor «catalogo».
//
// Qué no revisa: los enlaces externos, de WhatsApp, de correo y de teléfono no se consultan (la revisión no
// usa la red); hay que probarlos a mano antes de publicar. Tampoco ejecuta scripts: una dirección que un script
// arma en el navegador, o que va en un atributo data-*, no se revisa.
//
// Termina con código 1 si encuentra problemas y con 2 si la carpeta no existe o no tiene páginas HTML.
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const RULE_ID = 'R-RULE-30';
const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]+$/, '');
const INTERNAL_ORIGIN = 'http://sitio-compilado.invalid';
const TEXT_EXTENSIONS = new Set(['.html', '.htm', '.js', '.mjs', '.css', '.json', '.txt', '.xml', '.svg', '.webmanifest', '.map']);
const URL_ATTRIBUTES = ['href', 'xlink:href', 'src', 'poster', 'action', 'formaction'];
const SRCSET_ATTRIBUTES = ['srcset', 'imagesrcset'];
const URL_META = new Set(['og:image', 'og:image:url', 'og:image:secure_url', 'og:url', 'twitter:image', 'twitter:image:src']);
// Rutas que solo existen en el servidor de desarrollo de Astro/Vite.
const DEV_ONLY_PATH = /^\/(?:@fs|@id|@vite|src|node_modules)\//;

const decodeEntities = text => text
  .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
  .replace(/&amp;/g, '&');
const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const shorten = (text, length = 100) => (text.length > length ? `${text.slice(0, length)}…` : text);

// ---------------------------------------------------------------------------------------------------
// Lectura de HTML y CSS
// ---------------------------------------------------------------------------------------------------

const ATTRIBUTE = /\s*([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/y;

/**
 * Lista las etiquetas de apertura de un documento HTML o SVG con sus atributos. El contenido de <script> no se
 * interpreta (se devuelve aparte) y el de <style> se devuelve para revisar sus url().
 * @param {string} source
 */
function parseMarkup(source) {
  const html = source.replace(/<!--[\s\S]*?-->/g, '');
  const lower = html.toLowerCase();
  /** @type {{ name: string, attributes: Map<string, string> }[]} */
  const tags = [];
  /** @type {string[]} */
  const styles = [];
  /** @type {string[]} */
  const scripts = [];
  const open = /<([a-zA-Z][a-zA-Z0-9:-]*)/g;
  let match;
  while ((match = open.exec(html))) {
    const name = match[1].toLowerCase();
    const attributes = new Map();
    let position = open.lastIndex;
    for (;;) {
      ATTRIBUTE.lastIndex = position;
      const found = ATTRIBUTE.exec(html);
      if (!found) break;
      const key = found[1].toLowerCase();
      // Si un atributo se repite, el navegador conserva el primero.
      if (!attributes.has(key)) attributes.set(key, decodeEntities(found[2] ?? found[3] ?? found[4] ?? ''));
      position = ATTRIBUTE.lastIndex;
    }
    const end = html.indexOf('>', position);
    let next = end === -1 ? html.length : end + 1;
    tags.push({ name, attributes });
    if (name === 'script' || name === 'style') {
      const close = lower.indexOf(`</${name}`, next);
      const content = html.slice(next, close === -1 ? html.length : close);
      (name === 'style' ? styles : scripts).push(content);
      next = close === -1 ? html.length : close;
    }
    open.lastIndex = next;
  }
  return { tags, styles, scripts };
}

/** Direcciones de un atributo srcset («a.jpg 1x, b.jpg 2x»). */
function srcsetUrls(value) {
  return [...value.matchAll(/([^\s,][^\s]*)(?:\s+[\d.]+[wx])?\s*(?:,|$)/g)].map(match => match[1].replace(/,+$/, '')).filter(Boolean);
}

const CSS_URL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi;

/** Contenido de cada image-set(…) o -webkit-image-set(…), con sus paréntesis internos. */
function imageSets(css) {
  const contents = [];
  for (const match of css.matchAll(/(?:-webkit-)?image-set\(/gi)) {
    let depth = 1;
    let quote = '';
    let index = match.index + match[0].length;
    const start = index;
    for (; index < css.length && depth > 0; index += 1) {
      const char = css[index];
      if (quote) { if (char === '\\') index += 1; else if (char === quote) quote = ''; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === '(') depth += 1;
      else if (char === ')') depth -= 1;
    }
    contents.push(css.slice(start, index - 1));
  }
  return contents;
}

/** Direcciones de url(...), de image-set("…") y de @import en una hoja de estilo. */
function cssUrls(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const urls = [...clean.matchAll(CSS_URL)].map(match => match[1] ?? match[2] ?? match[3] ?? '');
  // En image-set() una dirección también puede ir como cadena sola: image-set("a.png" 1x, "b.png" 2x).
  // Las url(…) ya se contaron y type("image/avif") es un tipo, no una dirección.
  const sets = imageSets(clean).flatMap(content => [...content.replace(CSS_URL, ' ').replace(/\btype\(\s*(?:"[^"]*"|'[^']*')\s*\)/gi, ' ')
    .matchAll(/"([^"]*)"|'([^']*)'/g)].map(match => match[1] ?? match[2]));
  const imports = [...clean.matchAll(/@import\s+(?:"([^"]+)"|'([^']+)')/gi)].map(match => match[1] ?? match[2]);
  // url(#filtro) apunta a un elemento del mismo documento y data: lleva el contenido incluido.
  return [...urls, ...sets, ...imports].map(url => url.trim()).filter(url => url && !url.startsWith('#') && !/^data:/i.test(url));
}

/**
 * Referencias de una página: [{ label, value, kind }], donde `label` describe el atributo para el informe.
 * @param {ReturnType<typeof parseMarkup>} parsed
 */
function pageReferences(parsed) {
  /** @type {{ label: string, value: string, emptyMatters: boolean }[]} */
  const list = [];
  const add = (label, value, emptyMatters = false) => list.push({ label, value: value.trim(), emptyMatters });
  for (const { name, attributes } of parsed.tags) {
    if (name === 'base') continue; // Se informa aparte: con <base> los enlaces relativos no son comprobables.
    for (const key of URL_ATTRIBUTES) {
      if (attributes.has(key)) add(`<${name} ${key}>`, attributes.get(key), key === 'href' || key === 'xlink:href' || key === 'src');
    }
    if (name === 'object' && attributes.has('data')) add('<object data>', attributes.get('data'), true);
    for (const key of SRCSET_ATTRIBUTES) {
      if (attributes.has(key)) for (const url of srcsetUrls(attributes.get(key))) add(`<${name} ${key}>`, url);
    }
    if (name === 'meta') {
      const content = attributes.get('content') ?? '';
      if (/^refresh$/i.test(attributes.get('http-equiv') ?? '')) {
        const target = content.match(/url\s*=\s*["']?([^"']+)/i);
        if (target) add('<meta http-equiv="refresh">', target[1]);
      } else {
        const key = (attributes.get('property') ?? attributes.get('name') ?? '').toLowerCase();
        if (URL_META.has(key)) add(`<meta ${key}>`, content, true);
      }
    }
    if (attributes.has('style')) for (const url of cssUrls(attributes.get('style'))) add(`<${name} style> url()`, url);
  }
  for (const css of parsed.styles) for (const url of cssUrls(css)) add('<style> url()', url);
  return list;
}

/** Identificadores a los que puede apuntar un #ancla. */
function anchorIds(parsed) {
  const ids = new Set();
  for (const { name, attributes } of parsed.tags) {
    if (attributes.get('id')) ids.add(attributes.get('id'));
    if (name === 'a' && attributes.get('name')) ids.add(attributes.get('name'));
  }
  return ids;
}

// ---------------------------------------------------------------------------------------------------
// Clasificación de direcciones
// ---------------------------------------------------------------------------------------------------

/** Equipo local o red privada: nunca es un destino válido en un sitio publicado. */
export function isLocalHost(hostname) {
  const host = String(hostname).toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '0.0.0.0' || host === '::1' || host === '::'
    || /^127(?:\.\d{1,3}){3}$/.test(host) || /^10(?:\.\d{1,3}){3}$/.test(host) || /^192\.168(?:\.\d{1,3}){2}$/.test(host)
    || /^172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}$/.test(host) || /^169\.254(?:\.\d{1,3}){2}$/.test(host);
}

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
 * Revisa los enlaces de una carpeta compilada.
 * @param {string} directory
 * @param {{ site?: string, localPaths?: string[] }} [options] `site`: dirección pública del sitio. `localPaths`:
 *   carpetas del equipo de compilación que no deben aparecer en la salida (por omisión, la del proyecto).
 * @returns {Promise<{ problems: { id: string, file: string, kind: string, target: string, message: string }[],
 *   files: number, pages: number, internal: number, external: number, other: number }>}
 */
export async function checkLinks(directory, options = {}) {
  const localPaths = (options.localPaths ?? [ROOT]).filter(path => typeof path === 'string' && path.length > 3);
  let siteOrigin;
  if (options.site) {
    try { siteOrigin = new URL(options.site).origin; } catch { throw new Error(`--site no es una dirección válida: ${options.site}`); }
  }
  const paths = (await walk(directory)).sort();
  const name = file => relative(directory, file).split('\\').join('/');
  /** Rutas publicadas («/catalogo/index.html») → archivo en disco. */
  const published = new Map(paths.map(file => [`/${name(file)}`, file]));
  const pages = paths.filter(file => /\.html?$/i.test(file));

  /** @type {Map<string, Promise<ReturnType<typeof parseMarkup>>>} */
  const parsedCache = new Map();
  const parsedFile = file => {
    if (!parsedCache.has(file)) parsedCache.set(file, readFile(file, 'utf8').then(parseMarkup));
    return parsedCache.get(file);
  };

  const problems = [];
  const seen = new Set();
  const counts = { internal: 0, external: 0, other: 0 };
  const report = (file, kind, target, message) => {
    const key = `${file}\n${kind}\n${target}`;
    if (seen.has(key)) return;
    seen.add(key);
    problems.push({ id: RULE_ID, file: name(file), kind, target, message });
  };

  /**
   * Revisa una referencia hallada en `file`, cuya dirección publicada es `basePath`.
   * @param {string} file
   * @param {string} basePath
   * @param {{ label: string, value: string, emptyMatters: boolean }} reference
   */
  async function check(file, basePath, { label, value, emptyMatters }) {
    const shown = `${label} "${shorten(value)}"`;
    if (value === '') {
      if (emptyMatters) report(file, 'vacio', label, `${label} vacío: el enlace o recurso no lleva a ningún lado`);
      return;
    }
    if (value === '#') return report(file, 'vacio', label, `${label} "#": control inerte, no lleva a ningún lado`);
    if (/^[a-z]:[\\/]/i.test(value) || value.includes('\\')) return report(file, 'local', value, `${shown}: ruta de archivo de Windows, no una dirección web`);
    const scheme = value.match(/^([a-z][a-z0-9+.-]*):/i)?.[1].toLowerCase();
    if (scheme === 'file') return report(file, 'local', value, `${shown}: apunta a un archivo del equipo (file:)`);
    if (scheme === 'javascript') return report(file, 'javascript', value, `${shown}: enlace javascript:, usa un botón con su script o un enlace real`);
    if (scheme && scheme !== 'http' && scheme !== 'https') {
      counts.other += 1; // mailto:, tel:, data:, sms:… no se consultan.
      return;
    }

    let url;
    try { url = new URL(value, `${INTERNAL_ORIGIN}${basePath}`); } catch { return report(file, 'roto', value, `${shown}: dirección no válida`); }
    // «//catalogo/» no es una ruta del sitio: el navegador la abre en el servidor «catalogo». Suele salir de unir
    // «/» con una ruta que ya empieza con «/». El sitio no usa direcciones externas sin esquema.
    if (!scheme && /^\/\//.test(value)) {
      if (isLocalHost(url.hostname)) return report(file, 'local', value, `${shown}: apunta al equipo o a la red local (${url.host})`);
      return report(file, 'roto', value, `${shown}: «//» al inicio la convierte en una dirección del servidor «${url.host}»; una ruta del sitio empieza con una sola «/» y una dirección externa lleva https:`);
    }
    if (url.origin !== INTERNAL_ORIGIN && url.origin !== siteOrigin) {
      if (isLocalHost(url.hostname)) return report(file, 'local', value, `${shown}: apunta al equipo o a la red local (${url.host})`);
      counts.external += 1;
      return;
    }

    // Enlace interno.
    counts.internal += 1;
    const isRelative = !scheme && !/^[/#?]/.test(value);
    if (isRelative && basePath === '/404.html') {
      return report(file, 'roto', value, `${shown}: la página 404 se muestra en cualquier dirección; usa una ruta que empiece con «/»`);
    }
    let path;
    try { path = decodeURIComponent(url.pathname); } catch { return report(file, 'roto', value, `${shown}: dirección con codificación %XX no válida`); }
    for (const local of localPaths) if (path.startsWith(local)) return report(file, 'local', value, `${shown}: ruta de una carpeta del equipo donde se compiló`);
    if (DEV_ONLY_PATH.test(path)) return report(file, 'local', value, `${shown}: ruta que solo existe en el servidor de desarrollo`);

    let target = path;
    if (path.endsWith('/')) {
      target = `${path}index.html`;
      if (!published.has(target)) return report(file, 'roto', value, `${shown}: no existe ${target} en la compilación`);
    } else if (!published.has(path)) {
      if (published.has(`${path}/index.html`)) return report(file, 'diagonal', value, `${shown}: falta la diagonal final; la página es ${path}/`);
      return report(file, 'roto', value, `${shown}: no existe ${path} en la compilación`);
    }

    // Ancla.
    if (url.hash.length <= 1) return;
    let fragment = url.hash.slice(1);
    try { fragment = decodeURIComponent(fragment); } catch { /* se compara tal cual */ }
    if (fragment.startsWith(':~:') || !/\.(?:html?|svg)$/i.test(target)) return;
    const ids = anchorIds(await parsedFile(published.get(target)));
    if (ids.has(fragment)) return;
    // «#top» lleva al inicio de la página aunque no exista un elemento con ese id.
    if (/\.html?$/i.test(target) && fragment.toLowerCase() === 'top') return;
    report(file, 'ancla', value, `${shown}: no existe id="${fragment}" en ${target}`);
  }

  for (const file of paths) {
    const extension = extname(file).toLowerCase();
    if (!TEXT_EXTENSIONS.has(extension)) continue;
    const publishedPath = `/${name(file)}`;
    const isHtml = extension === '.html' || extension === '.htm';
    const raw = await readFile(file, 'utf8');
    let loose = raw; // Texto donde se buscan direcciones locales fuera de los atributos.

    if (isHtml) {
      const parsed = await parsedFile(file);
      const basePath = publishedPath.replace(/(^|\/)index\.html?$/i, '$1');
      if (parsed.tags.some(tag => tag.name === 'base' && tag.attributes.has('href'))) {
        report(file, 'base', '<base>', 'la página usa <base href>: los enlaces relativos dejan de ser comprobables; usa rutas que empiecen con «/»');
      }
      for (const { name: tag, attributes } of parsed.tags) {
        const isAnchor = attributes.has('id') || attributes.has('name');
        if (tag === 'a' && !attributes.has('href') && !isAnchor && !attributes.has('aria-current') && !attributes.has('aria-disabled')) {
          report(file, 'vacio', '<a>', '<a> sin href: el enlace no lleva a ningún lado (¿una dirección quedó sin definir?)');
        }
      }
      for (const reference of pageReferences(parsed)) await check(file, basePath, reference);
      loose = parsed.scripts.join('\n');
    } else if (extension === '.css') {
      for (const url of cssUrls(raw)) await check(file, publishedPath, { label: 'url()', value: url, emptyMatters: false });
    }

    // Direcciones locales escritas dentro de scripts, estilos o datos. Lo que ya se informó como enlace no se repite.
    const reported = text => problems.some(problem => problem.file === name(file) && problem.kind === 'local' && problem.target.includes(text));
    for (const match of loose.matchAll(/(?:(?:https?|wss?):)?\/\/(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\])(?=[:/"'`\s)\\]|$)/gi)) {
      if (!reported(match[0])) report(file, 'local', match[0], `referencia al equipo local en el contenido: ${match[0]}`);
    }
    for (const match of loose.matchAll(/\bfile:\/\/[^\s"'`<>)]*/gi)) {
      if (!reported(match[0])) report(file, 'local', match[0], `referencia a un archivo del equipo en el contenido: ${shorten(match[0])}`);
    }
    for (const local of localPaths) {
      if (!reported(local) && new RegExp(`${escapeRegExp(local)}(?![A-Za-z0-9_-])`).test(isHtml ? raw : loose)) report(file, 'local', local, `aparece la carpeta del equipo donde se compiló: ${local}`);
    }
  }

  problems.sort((a, b) => a.file.localeCompare(b.file) || a.message.localeCompare(b.message));
  return { problems, files: paths.length, pages: pages.length, ...counts };
}

// ---------------------------------------------------------------------------------------------------
// Línea de comandos
// ---------------------------------------------------------------------------------------------------

async function main(argv) {
  const usage = 'Uso: node scripts/check-links.mjs [carpeta] [--site=https://dominio]';
  const flags = argv.filter(arg => arg.startsWith('--'));
  const unknown = flags.filter(flag => !flag.startsWith('--site='));
  if (unknown.length) {
    console.error(`Opción no reconocida: ${unknown.join(', ')}\n${usage}`);
    return 2;
  }
  const site = flags.find(flag => flag.startsWith('--site='))?.slice('--site='.length) || process.env.SITE_URL || undefined;
  const target = argv.find(arg => !arg.startsWith('--')) ?? 'dist';
  let result;
  try {
    result = await checkLinks(resolve(target), { site });
  } catch (error) {
    if (error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR') {
      console.error(error instanceof Error ? error.message : String(error));
      return 2;
    }
    console.error(`No se puede leer ${target}: compila antes de revisar (npm run build o npm run build:preview).`);
    return 2;
  }
  if (result.pages === 0) {
    // Una carpeta sin páginas nunca cuenta como correcta.
    console.error(`No hay páginas HTML en ${target}: compila antes de revisar (npm run build o npm run build:preview).`);
    return 2;
  }
  for (const problem of result.problems) console.log(`FAIL  ${problem.id}  ${problem.file}  ${problem.message}`);
  console.log(`${result.problems.length ? '\n' : ''}Enlaces · ${target}: ${result.files} archivos, ${result.pages} páginas HTML, ${result.internal} referencias internas revisadas, ${result.problems.length} con problemas.`);
  console.log(`No se consultaron ${result.external} enlaces externos ni ${result.other} de correo, teléfono o datos: pruébalos a mano antes de publicar.`);
  return result.problems.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
