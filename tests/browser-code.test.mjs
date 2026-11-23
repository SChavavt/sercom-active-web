// Protecciones sobre el código de src/ (no sobre la salida): lo que escribe el visitante, lo que se lee de la dirección
// o del almacenamiento nunca se escribe como HTML, el almacenamiento del navegador solo lo toca un módulo, y no hay
// evaluación de código. Leen las fuentes sin comentarios, como las pruebas de las fuentes de tests/build-mode.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { listFiles, readText, ROOT } from './helpers.mjs';

// Código sin comentarios: «//» y «/*» solo abren un comentario al inicio de la línea o después de un espacio (así «//»
// no corta «https://…» y «/*» no se confunde con el de una expresión regular como `/^\/*/`, que escondería todo el
// código hasta el siguiente «*/»), y un texto entre comillas se conserva entero (un sumidero escrito como texto,
// `el['innerHTML']`, también cuenta). Un comentario pegado a otro signo, como `f(/* nota */ x)`, se queda en el código:
// la revisión prefiere leer de más.
const COMMENT_OR_STRING = /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\[\s\S]|[^`\\])*`)|(^|\s)\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|(^|\s)\/\/.*$/gm;
const stripComments = text => text.replace(COMMENT_OR_STRING, (_match, string, beforeBlock, beforeLine) => string ?? beforeBlock ?? beforeLine ?? '');
const SOURCE_FILE = /\.(?:astro|[cm]?[jt]s|[jt]sx|css|html?|svelte|vue)$/;
const sourceFiles = (await listFiles(join(ROOT, 'src'))).map(path => `src/${path}`).filter(path => SOURCE_FILE.test(path));
const sources = new Map(await Promise.all(sourceFiles.map(async path => [path, stripComments(await readText(path))])));

// Cómo se llega a un miembro de `document`: con punto, con «?.» o entre corchetes como texto. Vale para cualquier
// documento (`ownerDocument`, `contentDocument`), por eso no se pide el inicio de la palabra.
const DOCUMENT_MEMBER = String.raw`[dD]ocument\s*(?:\?\.\s*|\.\s*)?(?:\[\s*["'\`])?`;
/** Formas de escribir HTML a partir de un texto: con cualquiera, un texto del visitante se volvería marcado. */
const HTML_SINKS = [
  ['innerHTML', /\binnerHTML\b/],
  ['outerHTML', /\bouterHTML\b/],
  ['insertAdjacentHTML', /\binsertAdjacentHTML\b/],
  ['document.write', new RegExp(String.raw`${DOCUMENT_MEMBER}(?<![dD]ocument\s*)write(?:ln)?\b`)],
  ['createContextualFragment', /\bcreateContextualFragment\b/],
  ['DOMParser', /\bDOMParser\b/],
  ['setHTMLUnsafe', /\bsetHTMLUnsafe\b/],
  ['parseHTMLUnsafe', /\bparseHTMLUnsafe\b/],
  ['setHTML', /\bsetHTML\b/],
  ['srcdoc', /\bsrcdoc\b/i],
];
const STORAGE = /\b(?:localStorage|sessionStorage)\b/;
/** Otros almacenamientos del navegador: el sitio no usa ninguno, tampoco el módulo del almacén. */
const OTHER_STORAGE = [['indexedDB', /\bindexedDB\b/], ['caches', /\bcaches\s*(?:\?\.|\.|\[)/], ['cookieStore', /\bcookieStore\b/]];
/** `document.cookie` con punto, «?.» o corchetes, y también tomada al desarmar el documento (`const { cookie } = document`). */
const COOKIE = new RegExp(String.raw`${DOCUMENT_MEMBER}(?<![dD]ocument\s*)cookie\b|\{[^{}]*\bcookie\b[^{}]*\}\s*=[^;\n]*[dD]ocument\b`);
/** Evaluación de un texto como código: `eval`, `Function` con o sin `new`, y un temporizador que recibe un texto. */
const EVALUATION = [
  ['eval(', /(?<![\w$])eval\s*(?:\?\.\s*)?\(/],
  ['Function(', /(?<![\w$])Function\s*(?:\?\.\s*)?\(/],
  ['setTimeout o setInterval con un texto', /\bset(?:Timeout|Interval)\s*(?:\?\.\s*)?\(\s*["'`]/],
];
const STORE_MODULE = 'src/lib/quote-store.mjs';
const ICON_KIT = 'src/components/Icon.astro';

/** Archivos de `sources` (o de otra colección) cuyo código coincide con `pattern`. */
const filesMatching = (pattern, collection = sources) => [...collection].filter(([, code]) => pattern.test(code)).map(([path]) => path);

/**
 * Cada `set:html` del código con la etiqueta que lo lleva (el texto desde el último «<nombre» anterior hasta él) y con
 * lo que sigue (su valor).
 * @param {string} code
 * @returns {{ tag: string, value: string }[]}
 */
function setHtmlUses(code) {
  return [...code.matchAll(/set:html\b/g)].map(match => {
    const before = code.slice(0, match.index);
    const start = before.search(/<[A-Za-z][\w:-]*(?=[\s/>])(?![\s\S]*<[A-Za-z][\w:-]*[\s/>])/);
    return { tag: start === -1 ? '' : code.slice(start, match.index), value: code.slice(match.index + match[0].length) };
  });
}
/** ¿La etiqueta es un `<script type="application/json" …>`? */
const isJsonScript = tag => /^<script\b/i.test(tag) && /\stype\s*=\s*(["'])application\/json\1/i.test(tag);
/** ¿El valor se imprime con `jsonForScript(…)`, escrito ahí mismo? (escapa «<», «>» y «&»: nada puede cerrar el bloque) */
const printsJsonForScript = value => /^\s*=\s*\{\s*jsonForScript\s*\(/.test(value);
/** Un `set:html` permitido fuera del kit de iconos: los datos de un script, impresos con `jsonForScript`. */
const isSafeJsonBlock = use => isJsonScript(use.tag) && printsJsonForScript(use.value);

test('la revisión lee el código de src/', () => {
  assert.ok(sources.size > 20, `solo ${sources.size} archivos`);
  for (const path of ['src/lib/search.mjs', 'src/lib/quote-store.mjs', ICON_KIT, 'src/layouts/BaseLayout.astro']) assert.ok(sources.has(path), path);
});

test('la lectura sin comentarios no pierde código por un «/*» dentro de una expresión regular', () => {
  // Antes, el «/*» de estas expresiones abría un «comentario» que escondía el resto hasta el siguiente «*/».
  for (const sample of [
    "const path = s.replace(/^\\/*/, ''); el.innerHTML = q; /* fin */",
    'const re = /\\/*/; el.innerHTML = q; const x = 1; /* fin */',
    'const re = /[/*]/; el.innerHTML = q; /* fin */',
  ]) assert.match(stripComments(sample), /\binnerHTML\b/, sample);
  // Los comentarios de siempre sí se quitan: al inicio de la línea o después de un espacio.
  assert.equal(stripComments('a = 1; /* nota */ b = 2; // fin\n/** doc */\nc = 3;').replace(/\s+/g, ' ').trim(), 'a = 1; b = 2; c = 3;');
  assert.equal(stripComments('const url = "https://sitio.example/a"; // nota').trim(), 'const url = "https://sitio.example/a";');
});

test('ningún archivo de src/ escribe HTML a partir de un texto (innerHTML, outerHTML, insertAdjacentHTML, document.write…)', () => {
  // La revisión reconoce cada sumidero en un ejemplo, también escrito como texto, con espacios, con «?.» o en otro
  // documento.
  const samples = {
    innerHTML: ['el.innerHTML = q;', "el['innerHTML'] = q;", 'el?.innerHTML'],
    outerHTML: ['node.outerHTML = html;'],
    insertAdjacentHTML: ["list.insertAdjacentHTML('beforeend', row);"],
    'document.write': ['document.write(q);', 'document . writeln(q);', "document['write'](q);", 'document?.write(q);', "document?.['write'](q);",
      'el.ownerDocument.write(q);', 'frame.contentDocument.write(html);', 'frame.contentDocument?.writeln(html);'],
    createContextualFragment: ['document.createRange().createContextualFragment(html);'],
    DOMParser: ["new DOMParser().parseFromString(html, 'text/html');"],
    setHTMLUnsafe: ['el.setHTMLUnsafe(html);', 'shadow.setHTMLUnsafe(html)'],
    parseHTMLUnsafe: ['Document.parseHTMLUnsafe(html)'],
    setHTML: ['el.setHTML(html);'],
    srcdoc: ['frame.srcdoc = html;', '<iframe srcdoc={html}></iframe>'],
  };
  assert.deepEqual(Object.keys(samples), HTML_SINKS.map(([name]) => name));
  for (const [name, pattern] of HTML_SINKS) {
    for (const sample of samples[name]) assert.match(stripComments(sample), pattern, `${name}: ${sample}`);
    // Un comentario que lo nombra no cuenta.
    assert.doesNotMatch(stripComments(`// nunca ${name}\n/* ni ${name} */\n<!-- ni ${name} -->`), pattern, name);
  }
  // Lo que sí se usa no cuenta: textContent, value, createElement, y un documento del que se lee otra cosa.
  const harmless = 'el.textContent = q; input.value = q; document.createElement("li"); document.title; el.ownerDocument.body; const written = 1; rewrite(x); document.querySelector("[data-write]");';
  for (const [name, pattern] of HTML_SINKS) assert.doesNotMatch(harmless, pattern, name);
  for (const [name, pattern] of HTML_SINKS) assert.deepEqual(filesMatching(pattern), [], `${name} en src/: escribe el texto con textContent o value, o crea los elementos con createElement`);
});

test('set:html solo en el kit de iconos y en un <script type="application/json"> impreso con jsonForScript', () => {
  // La revisión reconoce la etiqueta que lleva cada set:html.
  const tags = code => setHtmlUses(code).map(use => isJsonScript(use.tag));
  assert.deepEqual(tags('<p class="x" set:html={texto} />'), [false]);
  assert.deepEqual(tags('<script type="application/json" id="indice" set:html={json} />'), [true]);
  assert.deepEqual(tags("<script id='i' type='application/json' set:html={json}></script>"), [true]);
  assert.deepEqual(tags('<script set:html={codigo} />'), [false]);
  assert.deepEqual(tags('<script type="module" set:html={codigo} />'), [false]);
  assert.deepEqual(tags('<Fragment set:html={html} />'), [false]);
  assert.deepEqual(tags('<div>\n  <span set:html={a} />\n  <script type="application/json" set:html={b} />\n</div>'), [false, true]);
  // Y en el bloque JSON, que el valor sea `jsonForScript(…)` escrito ahí mismo: `JSON.stringify` no escapa «</script>».
  const safe = code => setHtmlUses(code).map(isSafeJsonBlock);
  assert.deepEqual(safe('<script type="application/json" id="indice" set:html={jsonForScript(index)} />'), [true]);
  assert.deepEqual(safe('<script type="application/json" data-quote-index set:html={ jsonForScript( buildQuoteIndex(products) ) }></script>'), [true]);
  assert.deepEqual(safe('<script type="application/json" id="indice" set:html={JSON.stringify(index)} />'), [false]);
  assert.deepEqual(safe('<script type="application/json" set:html={`${data}`}></script>'), [false]);
  assert.deepEqual(safe('<script type="application/json" set:html={json} />'), [false]);
  assert.deepEqual(safe('<script type="application/json" set:html="{}" />'), [false]);
  assert.deepEqual(safe('<script type="module" set:html={jsonForScript(index)} />'), [false]);
  assert.deepEqual(safe('<p set:html={jsonForScript(index)} />'), [false]);
  const misplaced = [];
  for (const [path, code] of sources) {
    if (path === ICON_KIT) continue;
    for (const use of setHtmlUses(code)) if (!isSafeJsonBlock(use)) misplaced.push(`${path}: ${use.tag.slice(0, 80)}`);
  }
  assert.deepEqual(misplaced, [], 'set:html fuera del kit de iconos: escribe el texto como texto; los datos para un script van en <script type="application/json" set:html={jsonForScript(…)}>, con la llamada escrita ahí mismo');
  assert.ok(setHtmlUses(sources.get(ICON_KIT)).length > 0, 'el kit de iconos usa set:html');
});

test('solo quote-store.mjs nombra localStorage o sessionStorage, y nadie usa cookies ni otro almacenamiento', () => {
  for (const sample of ['localStorage.setItem(k, v);', "window['sessionStorage']", 'const { localStorage } = window;', 'window?.localStorage']) assert.match(stripComments(sample), STORAGE, sample);
  for (const sample of ['document.cookie = "a=1";', "document['cookie']", 'document . cookie', 'document?.cookie', "document?.['cookie']", 'el.ownerDocument.cookie',
    'const { cookie } = document;', 'const { title, cookie: all } = window.document;']) assert.match(stripComments(sample), COOKIE, sample);
  const others = { indexedDB: ['indexedDB.open("x")', 'window.indexedDB'], caches: ['caches.open("x")', 'caches?.match(request)', "caches['open']('x')"], cookieStore: ['cookieStore.set("a", "1")'] };
  assert.deepEqual(Object.keys(others), OTHER_STORAGE.map(([name]) => name));
  for (const [name, pattern] of OTHER_STORAGE) for (const sample of others[name]) assert.match(stripComments(sample), pattern, sample);
  assert.doesNotMatch(stripComments('// guarda en localStorage\n/* sessionStorage */'), STORAGE);
  // Un texto que habla de cookies, o un documento del que se lee otra cosa, no cuenta.
  for (const sample of ['<p>Este sitio no usa cookies de seguimiento.</p>', 'document.title', 'const { title } = document;', 'const caches = 1;']) {
    assert.doesNotMatch(sample, COOKIE, sample);
    for (const [name, pattern] of OTHER_STORAGE) assert.doesNotMatch(sample, pattern, `${name}: ${sample}`);
  }
  assert.deepEqual(filesMatching(STORAGE).filter(path => path !== STORE_MODULE), [], 'el almacenamiento del navegador solo se toca en src/lib/quote-store.mjs');
  assert.ok(STORAGE.test(sources.get(STORE_MODULE)), 'quote-store.mjs usa el almacenamiento');
  assert.deepEqual(filesMatching(COOKIE), [], 'el sitio no usa cookies');
  for (const [name, pattern] of OTHER_STORAGE) assert.deepEqual(filesMatching(pattern), [], `${name} en src/: el sitio solo guarda la lista y su borrador, en quote-store.mjs`);
});

test('ningún archivo de src/ evalúa código (eval, Function, un temporizador con un texto)', () => {
  for (const sample of ['eval(texto);', 'window.eval (texto)', 'globalThis.eval?.(texto)', 'const f = new Function("a", "return a");', 'new  Function (x)', 'Function("return 1")()',
    'globalThis.Function(body)', "setTimeout('paso()', 100)", 'setInterval(`paso()`, 100)', 'window.setTimeout("x()")']) {
    assert.ok(EVALUATION.some(([, pattern]) => pattern.test(stripComments(sample))), sample);
  }
  // Una palabra que solo contiene «eval» o «Function», o un temporizador con una función, no cuenta.
  for (const sample of ['evaluar(x);', 'medieval(x)', 'reevaluate()', 'const evalua = 1;', 'myFunction(x)', 'new Functional()', 'isFunction(x)', "typeof f === 'function'",
    'setTimeout(() => { throw error; });', 'setTimeout(paso, 100)', 'function (a) {}', 'async function(a) {}']) {
    assert.ok(!EVALUATION.some(([, pattern]) => pattern.test(sample)), sample);
  }
  for (const [name, pattern] of EVALUATION) assert.deepEqual(filesMatching(pattern), [], `${name} en src/`);
});
