// Protecciones sobre el código de src/ (no sobre la salida): lo que escribe el visitante, lo que se lee de la dirección
// o del almacenamiento nunca se escribe como HTML, el almacenamiento del navegador solo lo toca un módulo, y no hay
// evaluación de código. Leen las fuentes sin comentarios, como las pruebas de las fuentes de tests/build-mode.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { listFiles, readText, ROOT } from './helpers.mjs';

// Código sin comentarios: «//» solo cuenta al inicio de la línea o después de un espacio (no corta «https://…»), y un
// texto entre comillas se conserva entero (un sumidero escrito como texto, `el['innerHTML']`, también cuenta).
const COMMENT_OR_STRING = /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\[\s\S]|[^`\\])*`)|\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|(^|\s)\/\/.*$/gm;
const stripComments = text => text.replace(COMMENT_OR_STRING, (_match, string, before) => string ?? before ?? '');
const SOURCE_FILE = /\.(?:astro|[cm]?[jt]s|[jt]sx|css|html?|svelte|vue)$/;
const sourceFiles = (await listFiles(join(ROOT, 'src'))).map(path => `src/${path}`).filter(path => SOURCE_FILE.test(path));
const sources = new Map(await Promise.all(sourceFiles.map(async path => [path, stripComments(await readText(path))])));

/** Formas de escribir HTML a partir de un texto: con cualquiera, un texto del visitante se volvería marcado. */
const HTML_SINKS = [
  ['innerHTML', /\binnerHTML\b/],
  ['outerHTML', /\bouterHTML\b/],
  ['insertAdjacentHTML', /\binsertAdjacentHTML\b/],
  ['document.write', /\bdocument\s*(?:\.\s*|\[\s*["'`])write(?:ln)?\b/],
  ['createContextualFragment', /\bcreateContextualFragment\b/],
  ['DOMParser', /\bDOMParser\b/],
  ['srcdoc', /\bsrcdoc\b/i],
];
const STORAGE = /\b(?:localStorage|sessionStorage)\b/;
const COOKIE = /\bdocument\s*(?:\.\s*|\[\s*["'`])cookie\b/;
const EVALUATION = [['eval(', /(?<![\w$])eval\s*\(/], ['new Function(', /\bnew\s+Function\s*\(/]];
const STORE_MODULE = 'src/lib/quote-store.mjs';
const ICON_KIT = 'src/components/Icon.astro';

/** Archivos de `sources` (o de otra colección) cuyo código coincide con `pattern`. */
const filesMatching = (pattern, collection = sources) => [...collection].filter(([, code]) => pattern.test(code)).map(([path]) => path);

/**
 * Cada `set:html` del código con la etiqueta que lo lleva: el texto desde el último «<nombre» anterior hasta él.
 * @param {string} code
 */
function setHtmlTags(code) {
  return [...code.matchAll(/set:html\b/g)].map(match => {
    const before = code.slice(0, match.index);
    const start = before.search(/<[A-Za-z][\w:-]*(?=[\s/>])(?![\s\S]*<[A-Za-z][\w:-]*[\s/>])/);
    return start === -1 ? '' : code.slice(start, match.index);
  });
}
/** ¿La etiqueta es un `<script type="application/json" …>`? */
const isJsonScript = tag => /^<script\b/i.test(tag) && /\stype\s*=\s*(["'])application\/json\1/i.test(tag);

test('la revisión lee el código de src/', () => {
  assert.ok(sources.size > 20, `solo ${sources.size} archivos`);
  for (const path of ['src/lib/search.mjs', 'src/lib/quote-store.mjs', ICON_KIT, 'src/layouts/BaseLayout.astro']) assert.ok(sources.has(path), path);
});

test('ningún archivo de src/ escribe HTML a partir de un texto (innerHTML, outerHTML, insertAdjacentHTML, document.write…)', () => {
  // La revisión reconoce cada sumidero en un ejemplo, también escrito como texto o con espacios.
  const samples = {
    innerHTML: ['el.innerHTML = q;', "el['innerHTML'] = q;"],
    outerHTML: ['node.outerHTML = html;'],
    insertAdjacentHTML: ["list.insertAdjacentHTML('beforeend', row);"],
    'document.write': ['document.write(q);', 'document . writeln(q);', "document['write'](q);"],
    createContextualFragment: ['document.createRange().createContextualFragment(html);'],
    DOMParser: ["new DOMParser().parseFromString(html, 'text/html');"],
    srcdoc: ['frame.srcdoc = html;', '<iframe srcdoc={html}></iframe>'],
  };
  for (const [name, pattern] of HTML_SINKS) {
    for (const sample of samples[name]) assert.match(stripComments(sample), pattern, `${name}: ${sample}`);
    // Un comentario que lo nombra no cuenta.
    assert.doesNotMatch(stripComments(`// nunca ${name}\n/* ni ${name} */\n<!-- ni ${name} -->`), pattern, name);
  }
  // Lo que sí se usa no cuenta: textContent, value, createElement.
  for (const [name, pattern] of HTML_SINKS) assert.doesNotMatch('el.textContent = q; input.value = q; document.createElement("li");', pattern, name);
  for (const [name, pattern] of HTML_SINKS) assert.deepEqual(filesMatching(pattern), [], `${name} en src/: escribe el texto con textContent o value, o crea los elementos con createElement`);
});

test('set:html solo en el kit de iconos y en un <script type="application/json">', () => {
  // La revisión reconoce la etiqueta que lleva cada set:html.
  assert.deepEqual(setHtmlTags('<p class="x" set:html={texto} />').map(isJsonScript), [false]);
  assert.deepEqual(setHtmlTags('<script type="application/json" id="indice" set:html={json} />').map(isJsonScript), [true]);
  assert.deepEqual(setHtmlTags("<script id='i' type='application/json' set:html={json}></script>").map(isJsonScript), [true]);
  assert.deepEqual(setHtmlTags('<script set:html={codigo} />').map(isJsonScript), [false]);
  assert.deepEqual(setHtmlTags('<script type="module" set:html={codigo} />').map(isJsonScript), [false]);
  assert.deepEqual(setHtmlTags('<Fragment set:html={html} />').map(isJsonScript), [false]);
  assert.deepEqual(setHtmlTags('<div>\n  <span set:html={a} />\n  <script type="application/json" set:html={b} />\n</div>').map(isJsonScript), [false, true]);
  const misplaced = [];
  for (const [path, code] of sources) {
    if (path === ICON_KIT) continue;
    for (const tag of setHtmlTags(code)) if (!isJsonScript(tag)) misplaced.push(`${path}: ${tag.slice(0, 80)}`);
  }
  assert.deepEqual(misplaced, [], 'set:html fuera del kit de iconos: escribe el texto como texto; los datos para un script van en <script type="application/json" set:html={jsonForScript(…)}>');
  assert.ok(setHtmlTags(sources.get(ICON_KIT)).length > 0, 'el kit de iconos usa set:html');
});

test('solo quote-store.mjs nombra localStorage o sessionStorage, y nadie usa document.cookie', () => {
  for (const sample of ['localStorage.setItem(k, v);', "window['sessionStorage']", 'const { localStorage } = window;']) assert.match(stripComments(sample), STORAGE, sample);
  for (const sample of ['document.cookie = "a=1";', "document['cookie']", 'document . cookie']) assert.match(stripComments(sample), COOKIE, sample);
  assert.doesNotMatch(stripComments('// guarda en localStorage\n/* sessionStorage */'), STORAGE);
  assert.deepEqual(filesMatching(STORAGE).filter(path => path !== STORE_MODULE), [], 'el almacenamiento del navegador solo se toca en src/lib/quote-store.mjs');
  assert.ok(STORAGE.test(sources.get(STORE_MODULE)), 'quote-store.mjs usa el almacenamiento');
  assert.deepEqual(filesMatching(COOKIE), [], 'el sitio no usa cookies');
});

test('ningún archivo de src/ evalúa código (eval, new Function)', () => {
  for (const sample of ['eval(texto);', 'window.eval (texto)', 'const f = new Function("a", "return a");', 'new  Function (x)']) {
    assert.ok(EVALUATION.some(([, pattern]) => pattern.test(stripComments(sample))), sample);
  }
  // Una palabra que solo contiene «eval» no cuenta.
  for (const sample of ['evaluar(x);', 'medieval(x)', 'reevaluate()', 'const evalua = 1;', 'myFunction(x)', 'new Functional()']) {
    assert.ok(!EVALUATION.some(([, pattern]) => pattern.test(sample)), sample);
  }
  for (const [name, pattern] of EVALUATION) assert.deepEqual(filesMatching(pattern), [], `${name} en src/`);
});
