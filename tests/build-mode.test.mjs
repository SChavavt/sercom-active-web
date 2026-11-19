import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPreviewFlag, PREVIEW_FLAG, previewFlagWarning } from '../src/lib/build-mode.mjs';
import { listFiles, readJson, readText, ROOT } from './helpers.mjs';

const packageJson = await readJson('package.json');
const sourceFiles = (await listFiles(join(ROOT, 'src'))).map(path => `src/${path}`);
// Código sin comentarios: los comentarios pueden nombrar archivos que el código no importa.
// («//» solo cuenta como comentario al inicio de la línea o después de un espacio, para no cortar «https://…».)
// Un texto entre comillas se salta entero: «'../data/**/*.json'» lleva «/**/», que no es un comentario. Las comillas
// simples y dobles no pasan de una línea, así que un apóstrofo suelto del texto de una página solo afecta a su línea.
const COMMENT_OR_STRING = /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\[\s\S]|[^`\\])*`)|\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|(^|\s)\/\/.*$/gm;
const stripComments = text => text.replace(COMMENT_OR_STRING, (_match, string, before) => string ?? before ?? '');
const rawSources = new Map(await Promise.all(sourceFiles.filter(path => /\.(?:astro|[cm]?[jt]s|[jt]sx|css)$/.test(path)).map(async path => [path, await readText(path)])));
const sources = new Map([...rawSources].map(([path, text]) => [path, stripComments(text)]));
const astroPackage = new URL('../node_modules/astro/package.json', import.meta.url);
const { bin: astroBinField } = JSON.parse(await readFile(astroPackage, 'utf8'));
const astroBin = fileURLToPath(new URL(typeof astroBinField === 'string' ? astroBinField : astroBinField.astro, astroPackage));
const importsOf = code => [...code.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/g)].map(match => match[1]);

test('la bandera CATALOG_PREVIEW solo se activa con «1» o «true»', () => {
  assert.equal(PREVIEW_FLAG, 'CATALOG_PREVIEW');
  for (const value of ['1', 'true', 'TRUE', 'True', ' 1 ', 'true\n']) assert.equal(isPreviewFlag(value), true, JSON.stringify(value));
  for (const value of [undefined, null, '', ' ', '0', 'false', 'no', 'si', 'sí', 'yes', 'on', 'preview', '2', '11', 'true1', '1 true', 1, true, {}, ['1']]) {
    assert.equal(isPreviewFlag(value), false, JSON.stringify(value));
  }
});

test('un valor no reconocido se avisa y se trata como producción', () => {
  for (const value of [undefined, null, '', '  ', '0', 'false', 'FALSE', '1', 'true']) assert.equal(previewFlagWarning(value), '', JSON.stringify(value));
  for (const value of ['si', 'yes', 'preview', '2', 'verdadero']) {
    assert.equal(isPreviewFlag(value), false);
    assert.match(previewFlagWarning(value), /no es un valor reconocido .* Se compila en modo producción\./, value);
    assert.ok(previewFlagWarning(value).includes(`CATALOG_PREVIEW="${value}"`));
  }
});

test('los scripts de npm no dependen de la sintaxis de una terminal', () => {
  const { scripts } = packageJson;
  assert.equal(scripts.build, 'npm run validate:catalog && astro build');
  assert.equal(scripts['build:preview'], 'npm run validate:catalog && node scripts/catalog-preview.mjs build');
  assert.equal(scripts.dev, 'node scripts/catalog-preview.mjs dev');
  assert.equal(scripts['scan:dist'], 'node scripts/scan-dist.mjs');
  assert.equal(scripts['check:links'], 'node scripts/check-links.mjs');
  for (const [name, command] of Object.entries(scripts)) {
    // Nada de «VARIABLE=valor comando», «set VARIABLE=» ni utilidades externas para definir variables.
    assert.doesNotMatch(command, /(?:^|&&\s*|;\s*)\s*[A-Z_][A-Z0-9_]*=|\bset\s+[A-Z_]+=|cross-env|\bexport\s/, name);
    if (!['dev', 'build:preview', 'verify'].includes(name)) assert.doesNotMatch(command, /preview\.mjs|CATALOG_PREVIEW/, name);
  }
});

test('«npm run verify» compila los dos modos y revisa las dos salidas', () => {
  const steps = packageJson.scripts.verify.split('&&').map(step => step.trim());
  assert.deepEqual(steps, [
    'npm run build:preview',
    'npm run build',
    // Producción con --strict: en la etapa 1 la lista de avisos (normas, certificaciones) debe estar vacía.
    'node scripts/scan-dist.mjs dist --strict',
    'node scripts/scan-dist.mjs dist-preview --preview',
    'node scripts/check-links.mjs dist',
    'node scripts/check-links.mjs dist-preview',
  ]);
});

test('no se agregaron dependencias', () => {
  assert.deepEqual(packageJson.dependencies, { astro: '7.4.13' });
  assert.deepEqual(packageJson.devDependencies, { '@astrojs/check': '0.9.12', typescript: '6.0.3' });
});

test('ningún archivo del repositorio activa la vista previa en una compilación normal', async () => {
  const config = await readText('astro.config.mjs');
  // La bandera sale del entorno real, pasa por isPreviewFlag y llega al código como constante de compilación.
  assert.match(config, /const catalogPreview = isPreviewFlag\(process\.env\.CATALOG_PREVIEW\);/);
  assert.match(config, /__CATALOG_PREVIEW__: JSON\.stringify\(catalogPreview\)/);
  assert.doesNotMatch(config, /loadEnv|dotenv|import\.meta\.env/);
  assert.match(config, /trailingSlash: 'always'/);

  const vercel = await readJson('vercel.json');
  // El alojamiento publica dist/ solo si la salida pasa el escáner de reglas y el verificador de enlaces.
  assert.equal(vercel.buildCommand, 'npm run check && npm test && npm run build && node scripts/scan-dist.mjs dist --strict && node scripts/check-links.mjs dist');
  assert.equal(vercel.outputDirectory, 'dist');
  const committed = [await readText('vercel.json'), await readText('.env.example'), await readText('.github/workflows/quality.yml')];
  for (const text of committed) assert.doesNotMatch(text, /CATALOG_PREVIEW|build:preview(?!\b.*verify)|catalog-preview/);
  // Archivos .env que Vite cargaría: solo existe el de ejemplo, que no define la bandera.
  const envFiles = (await readdir(ROOT)).filter(name => /^\.env(?:\.|$)/.test(name) && name !== '.env.example');
  for (const name of envFiles) assert.doesNotMatch(await readText(name), /CATALOG_PREVIEW/, name);

  const gitignore = (await readText('.gitignore')).split(/\r?\n/);
  assert.ok(gitignore.includes('dist-preview/'));
  assert.ok((await readJson('tsconfig.json')).exclude.includes('dist-preview'));
});

test('la integración continua ejecuta «npm run verify» después de los pasos que ya existían', async () => {
  const runs = [...(await readText('.github/workflows/quality.yml')).matchAll(/^\s*- run: (.+)$/gm)].map(match => match[1].trim());
  assert.deepEqual(runs, ['npm ci', 'npm run check', 'npm test', 'npm run build', 'npm run verify']);
});

test('el lanzador de la vista previa solo acepta «dev» o «build»', () => {
  for (const args of [[], ['preview'], ['--outDir', 'dist']]) {
    const result = spawnSync(process.execPath, ['scripts/catalog-preview.mjs', ...args], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(result.status, 2, args.join(' '));
    assert.match(result.stderr, /Uso: node scripts\/catalog-preview\.mjs <dev\|build>/);
  }
});

test('el archivo de ejemplos solo se carga dentro de la rama de vista previa de site-data.mjs', () => {
  const mentions = [...sources].filter(([, code]) => /example-products|data\/preview/.test(code)).map(([path]) => path);
  assert.deepEqual(mentions, ['src/lib/site-data.mjs']);
  const entry = rawSources.get('src/lib/site-data.mjs');
  // Una sola mención, en una carga dinámica y dentro del `if` con la constante escrita tal cual.
  assert.equal(sources.get('src/lib/site-data.mjs').match(/example-products/g).length, 1);
  assert.match(entry, /\nif \(__CATALOG_PREVIEW__\) \{\n\s+exampleProducts = \(await import\('\.\.\/data\/preview\/example-products\.json', \{ with: \{ type: 'json' \} \}\)\)\.default;\n\}\n/);
  assert.doesNotMatch(entry, /^import .*preview/m);
  // Nadie más lee la constante: las páginas usan `isPreview` o `mode`.
  const readers = [...sources].filter(([path, code]) => path !== 'src/env.d.ts' && code.includes('__CATALOG_PREVIEW__')).map(([path]) => path);
  assert.deepEqual(readers, ['src/lib/site-data.mjs']);
});

// Archivo de ejemplos, tal como lo vería un patrón de Vite resuelto desde la raíz del proyecto.
const EXAMPLES_FILE = '/src/data/preview/example-products.json';
// Opciones de `import.meta.glob` que conoce Vite 8. Solo `base` cambia los archivos que se cargan.
const GLOB_OPTIONS = new Set(['as', 'eager', 'import', 'query', 'exhaustive', 'base', 'caseSensitive']);
const PLAIN_STRING = /^(["'])((?:(?!\1)[^\\])*)\1$|^`([^`$\\]*)`$/;
/** Valor de un texto escrito tal cual («'…'», «"…"» o «`…`» sin `${}`), o `undefined`. */
const plainString = text => {
  const match = text.trim().match(PLAIN_STRING);
  return match ? match[2] ?? match[3] : undefined;
};
/**
 * Divide en el nivel superior (fuera de paréntesis, llaves, corchetes y textos) el contenido de una llamada o de un
 * literal. Devuelve también el índice donde se cierra el contenido, o -1 si no se cierra.
 */
function splitTopLevel(code, start) {
  const parts = [];
  let depth = 0;
  let part = '';
  for (let index = start; index < code.length; index += 1) {
    const character = code[index];
    if (`"'\``.includes(character)) {
      let end = index + 1;
      while (end < code.length && code[end] !== character) end += code[end] === '\\' ? 2 : 1;
      part += code.slice(index, end + 1);
      index = end;
    } else if ('([{'.includes(character)) {
      depth += 1;
      part += character;
    } else if (')]}'.includes(character)) {
      if (depth === 0) return { parts: [...parts, part], end: index };
      depth -= 1;
      part += character;
    } else if (character === ',' && depth === 0) {
      parts.push(part);
      part = '';
    } else {
      part += character;
    }
  }
  return { parts: [...parts, part], end: -1 };
}
/**
 * Salta el tipo genérico `<…>` que empieza en `start` (un «<»): cuenta los «<» y «>» anidados (sin el «>» de una
 * flecha «=>»), salta los textos entre comillas y sigue los paréntesis, corchetes y llaves. Devuelve la posición
 * siguiente al «>» que lo cierra, o -1 si no se cierra.
 */
function skipTypeArguments(code, start) {
  let angles = 0;
  let brackets = 0;
  for (let index = start; index < code.length; index += 1) {
    const character = code[index];
    if (`"'\``.includes(character)) {
      let end = index + 1;
      while (end < code.length && code[end] !== character) end += code[end] === '\\' ? 2 : 1;
      if (end >= code.length) return -1;
      index = end;
    } else if ('([{'.includes(character)) {
      brackets += 1;
    } else if (')]}'.includes(character)) {
      if (brackets === 0) return -1;
      brackets -= 1;
    } else if (character === '<') {
      angles += 1;
    } else if (character === '>' && code[index - 1] !== '=') {
      angles -= 1;
      if (angles === 0) return brackets === 0 ? index + 1 : -1;
    }
  }
  return -1;
}
// Toda mención de `import.meta.glob`, con espacios o sin ellos alrededor de los puntos y la siga lo que la siga.
const GLOB_MENTION = /import\s*\.\s*meta\s*\.\s*glob/g;
/**
 * Patrones de `import.meta.glob(…)` y de `import(\`…${x}…\`)` (que Vite convierte en un patrón) en el código de un
 * archivo, resueltos desde la raíz del proyecto como lo hace Vite: «/…» desde la raíz, «./…» y «../…» desde la
 * carpeta del archivo o desde la opción `base`. Cada mención de `import.meta.glob` da sus patrones o «?»: nunca
 * nada. Lo que no se puede revisar se devuelve como «?»: una mención que no es una llamada (un alias como
 * `const g = import.meta.glob`, una mención en un comentario o en un texto, `import.meta.globEager`), un tipo
 * genérico `<…>` que no se cierra, un argumento que no es un texto escrito tal cual, unas opciones que no son un
 * objeto escrito tal cual (con una opción desconocida, una expansión o un `base` calculado) y un patrón que no
 * empieza con «/», «./» ni «../» (uno que empieza con «**», un alias).
 * @param {string} path Ruta del archivo («src/pages/x.astro»).
 * @param {string} code Código del archivo.
 */
function loadPatterns(path, code) {
  const directory = posix.dirname(`/${path}`);
  const patterns = [];
  for (const match of code.matchAll(GLOB_MENTION)) {
    // Después de la mención: espacios, un tipo genérico opcional (`<Record<string, unknown>>`), espacios y «(».
    let index = match.index + match[0].length;
    while (/\s/.test(code[index] ?? '')) index += 1;
    if (code[index] === '<') index = skipTypeArguments(code, index);
    while (index >= 0 && /\s/.test(code[index] ?? '')) index += 1;
    if (index < 0 || code[index] !== '(') {
      patterns.push('?');
      continue;
    }
    const { parts, end } = splitTopLevel(code, index + 1);
    const [first = '', options, ...extra] = parts.map(part => part.trim());
    if (end < 0 || extra.some(Boolean)) {
      patterns.push('?');
      continue;
    }
    // Las opciones: un objeto escrito tal cual, con claves conocidas y un `base` escrito tal cual.
    let base = directory;
    if (options) {
      const entries = options.startsWith('{') && options.endsWith('}') ? splitTopLevel(options, 1).parts.map(entry => entry.trim()).filter(Boolean) : undefined;
      const pairs = entries?.map(entry => entry.match(/^(?:(["'])(\w+)\1|(\w+))\s*:\s*([\s\S]+)$/));
      if (!pairs || pairs.some(pair => !pair || !GLOB_OPTIONS.has(pair[2] ?? pair[3]))) {
        patterns.push('?');
        continue;
      }
      const baseOption = pairs.find(pair => (pair[2] ?? pair[3]) === 'base');
      if (baseOption) {
        const value = plainString(baseOption[4]);
        if (value === undefined) {
          patterns.push('?');
          continue;
        }
        base = value.startsWith('/') ? posix.normalize(value) : posix.join(directory, value);
      }
    }
    const resolvePattern = pattern => {
      const negated = pattern.startsWith('!');
      const body = negated ? pattern.slice(1) : pattern;
      if (body.startsWith('/')) return `${negated ? '!' : ''}${posix.normalize(body)}`;
      if (body.startsWith('./') || body.startsWith('../')) return `${negated ? '!' : ''}${posix.join(base, body)}`;
      return negated ? undefined : '?';
    };
    const literals = first.startsWith('[') && first.endsWith(']') ? splitTopLevel(first, 1).parts.map(entry => entry.trim()).filter(Boolean).map(plainString) : [plainString(first)];
    if (literals.some(literal => literal === undefined)) patterns.push('?');
    else patterns.push(...literals.map(resolvePattern).filter(Boolean));
  }
  for (const match of code.matchAll(/(?<![\w$.])import\s*\(\s*([^)]*)\)/g)) {
    const argument = match[1].trim();
    if (/^(["'])[^"'`]*\1(?:\s*,|$)/.test(argument)) continue; // Texto escrito tal cual: lo revisa la prueba de las menciones.
    const template = argument.match(/^`([^`]*)`/);
    if (!template) {
      patterns.push('?');
      continue;
    }
    const pattern = template[1].replace(/\$\{[^}]*\}/g, '*');
    patterns.push(pattern.startsWith('/') ? posix.normalize(pattern) : posix.join(posix.dirname(`/${path}`), pattern));
  }
  return patterns;
}
/** ¿Alguno de los patrones puede cargar el archivo de ejemplos? */
const reachesExamples = patterns => patterns.some(pattern => pattern === '?')
  || (patterns.some(pattern => !pattern.startsWith('!') && posix.matchesGlob(EXAMPLES_FILE, pattern))
    && !patterns.some(pattern => pattern.startsWith('!') && posix.matchesGlob(EXAMPLES_FILE, pattern.slice(1))));
/**
 * Archivos cuyo código tiene un patrón de carga que alcanza el archivo de ejemplos. Se lee el código sin comentarios y
 * también el archivo tal cual, por si quitar los comentarios cambiara un patrón. @param {Iterable<[string, string]>} files
 */
const examplesLoaders = files => [...files]
  .filter(([path, text]) => reachesExamples(loadPatterns(path, stripComments(text))) || reachesExamples(loadPatterns(path, text)))
  .map(([path]) => path);

test('ningún import.meta.glob ni import() con patrón puede cargar el archivo de ejemplos', () => {
  // La comprobación reconoce las formas que esquivan la búsqueda por nombre, revisadas igual que los archivos reales.
  const misuse = [
    ['src/pages/muestra.astro', "---\nconst datos = import.meta.glob('../data/*/*.json', { eager: true });\n---"],
    ['src/pages/muestra.astro', "const datos = import.meta.glob(['../data/**/*.json', '!../data/catalog.json']);"],
    ['src/components/Tarjeta.astro', "const datos = import.meta.glob('/src/**/*.json');"],
    // Un patrón recursivo lleva «/**/», que no es un comentario.
    ['src/pages/sondas/rec.astro', "---\nconst modulos = import.meta.glob('../../data/**/*.json', { eager: true, import: 'default' });\n---\n<p>{JSON.stringify(modulos)}</p>"],
    ['src/pages/sondas/abs.astro', "---\nconst modulos = import.meta.glob('/src/data/**/*.json', { eager: true, import: 'default' });\n---"],
    ['src/lib/todos-los-datos.mjs', "// Todos los JSON de datos, para depurar.\nexport const datos = import.meta.glob('../data/**/*.json', { eager: true, import: 'default' });"],
    ['src/pages/sondas/css.astro', "---\nconst modulos = import.meta.glob('../../data/*/*.json', { eager: true });\n---\n<style>\n  /* espacio entre bloques */\n  p { margin: 0; }\n</style>"],
    // La opción `base` de Vite: los patrones relativos se resuelven desde ella.
    ['src/pages/sondas/base.astro', "const modulos = import.meta.glob('**/*.json', { base: '../../data', eager: true, import: 'default' });"],
    ['src/pages/sondas/base.astro', "const modulos = import.meta.glob('./**/*.json', { base: '../../data', eager: true });"],
    ['src/pages/sondas/base.astro', "const modulos = import.meta.glob('./preview/*.json', { base: '/src/data' });"],
    ['src/pages/sondas/base.astro', "const modulos = import.meta.glob('./*/*.json', { base: carpeta });"],
    ['src/pages/sondas/base.astro', "const modulos = import.meta.glob('../icons/*.svg', { ...opciones });"],
    ['src/pages/sondas/base.astro', "const modulos = import.meta.glob('../icons/*.svg', opciones);"],
    ['src/pages/sondas/base.astro', "const modulos = import.meta.glob('../icons/*.svg', { eager: true, raiz: '../../data' });"],
    ['src/pages/sondas/base.astro', "const modulos = import.meta.glob('@datos/**/*.json');"],
    ['src/lib/otra.mjs', 'const datos = await import(`../data/${carpeta}/${nombre}.json`);'],
    ['src/lib/otra.mjs', 'const datos = await import(ruta);'],
    // Con un tipo genérico que lleva otro dentro, una función flecha o un objeto: se salta el `<…>` completo.
    ['src/pages/sondas/g.astro', "---\nconst modulos = import.meta.glob<Record<string, unknown>>('../../data/**/*.json', { eager: true });\n---"],
    ['src/pages/sondas/g.astro', "const modulos = import.meta.glob<{ default: Array<unknown> }>('../../data/**/*.json');"],
    ['src/pages/sondas/g.astro', "const modulos = import.meta.glob<() => Promise<unknown>>('../../data/**/*.json');"],
    ['src/pages/sondas/g.astro', "const modulos = import . meta . glob < Record<string, { default: unknown }> > ('../../data/*/*.json');"],
    // Toda mención que no es una llamada que se pueda revisar falla: un alias, un genérico sin cerrar, una mención en
    // un comentario o en un texto.
    ['src/pages/sondas/g.astro', "const g = import.meta.glob;\nconst modulos = g('../../data/*/*.json', { eager: true });"],
    ['src/pages/sondas/g.astro', "const modulos = import.meta.glob<Record<string, unknown>('../../data/*/*.json');"],
    ['src/pages/sondas/g.astro', "const modulos = import.meta.globEager('../icons/*.svg');"],
    ['src/lib/notas.mjs', '// Los iconos se cargan con import.meta.glob.\nexport const nota = 1;'],
    ['src/lib/notas.mjs', "export const nota = 'Se cargan con import.meta.glob';"],
  ];
  for (const [path, code] of misuse) assert.deepEqual(examplesLoaders([[path, code]]), [path], code);
  const harmless = [
    ['src/pages/muestra.astro', "const iconos = import.meta.glob('../icons/*.svg', { eager: true, query: '?raw' });"],
    ['src/pages/muestra.astro', "const iconos = import.meta.glob<Record<string, string>>('../icons/*.svg', { eager: true, query: '?raw', import: 'default' });"],
    ['src/pages/muestra.astro', "const iconos = import.meta.glob<{ default: Array<string> }>('../icons/*.svg');"],
    ['src/pages/muestra.astro', "const iconos = import.meta.glob<() => Promise<string>>('../icons/*.svg');"],
    ['src/pages/muestra.astro', "const iconos = import.meta.glob<{ nombre: '>' }>('../icons/*.svg');"],
    ['src/pages/muestra.astro', "const iconos = import.meta.glob('./**/*.svg', { base: '../icons', eager: true });"],
    ['src/pages/muestra.astro', "const datos = import.meta.glob(['../data/*.json', '!../data/preview/**']);"],
    ['src/pages/muestra.astro', "// Sin la carpeta de ejemplos:\nconst datos = import.meta.glob(['../data/**/*.json', '!../data/preview/**'], { eager: true });"],
    ['src/lib/site-data.mjs', "const datos = (await import('../data/preview/example-products.json', { with: { type: 'json' } })).default;"],
  ];
  for (const [path, code] of harmless) assert.deepEqual(examplesLoaders([[path, code]]), [], code);

  assert.deepEqual(examplesLoaders(rawSources), [], 'un patrón de carga puede llevar el archivo de ejemplos fuera de la rama de vista previa, o hay una mención de import.meta.glob que no se puede revisar (un alias, un genérico sin cerrar, o una mención en un comentario o en un texto, que también se rechaza)');
});

// Colecciones de contenido de Astro. Sus cargadores (`glob()` y `file()` de «astro/loaders») leen archivos de src/ con un
// patrón, y un cargador puede escribirse de muchas formas que una revisión de la sintaxis no sigue (un alias, `.call`,
// un módulo que lo reexporta). El proyecto no las usa, así que la regla es total: ningún archivo de src/ nombra
// «astro/loaders» ni «astro:content», de ninguna forma (import, export, import type, import(), un texto suelto), y no
// existe su configuración (src/content.config.*, src/content/config.* ni la carpeta src/content/).
const COLLECTION_MODULES = /astro\/loaders|astro:content/;
const COLLECTION_PATHS = /^src\/(?:content\.config\.[^/]+|content\/)/;
const NO_COLLECTIONS = 'este proyecto no usa colecciones de contenido de Astro: no se agregan sin rediseñar antes la protección de los ejemplos (ver «Cómo se mantienen los ejemplos fuera de producción» en docs/datos-y-modos.md)';
/** Archivos que nombran un módulo de colecciones de contenido o son su configuración. @param {Iterable<[string, string]>} files */
const collectionFiles = files => [...files].filter(([path, text]) => COLLECTION_PATHS.test(path) || COLLECTION_MODULES.test(text)).map(([path]) => path);
// Todos los archivos de src/, con sus comentarios: también una mención en un comentario o en un texto cuenta.
const allSources = new Map(await Promise.all(sourceFiles.map(async path => [path, await readText(path)])));

test('el proyecto no usa colecciones de contenido de Astro', async () => {
  // Cada forma de cargar una colección nombra el módulo o crea la configuración, también las que esquivaban la
  // revisión anterior de los cargadores (un alias, `.call`, un módulo que reexporta «astro/loaders»).
  const misuse = [
    ['src/lib/datos.ts', "import { glob } from 'astro/loaders';\nconst cargar = glob;\nconst c = cargar({ pattern: '**/*.json', base: './src/data' });"],
    ['src/lib/datos.ts', "import { glob } from 'astro/loaders';\nconst c = glob.call(null, { pattern: '**/*.json', base: './src/data' });"],
    ['src/lib/cargadores.ts', "export { glob } from 'astro/loaders';"],
    ['src/lib/cargadores.ts', "export * from 'astro/loaders';"],
    ['src/lib/tipos.ts', "import type { Loader } from 'astro/loaders';"],
    ['src/lib/datos.mjs', "const { glob } = await import('astro/loaders');"],
    ['src/lib/datos.mjs', "const modulo = 'astro/loaders';"],
    ['src/pages/sonda.astro', "---\nimport { getCollection } from 'astro:content';\nconst items = await getCollection('sondas');\n---"],
    ['src/lib/datos.ts', "import { defineCollection } from 'astro:content';"],
    ['src/lib/datos.ts', "import { glob as cargar } from 'astro/loaders';\nconst c = cargar({ base: 'src', pattern: ['**/*.json', '!content/**'] });"],
    ['src/lib/datos.ts', "import * as cargadores from 'astro/loaders';\nconst c = cargadores.glob({ pattern: '*.md', base: './src/notas' });"],
    ['src/lib/datos.ts', "import { file } from 'astro/loaders';\nconst c = file('src/data/brands.json');"],
    ['src/lib/datos.ts', "import { glob } from 'astro/loaders';\nconst c = glob({ pattern: '**/*.md', base: './src/content/notas' });"],
    ['src/content.config.ts', 'export const collections = {};'],
    ['src/content.config.mjs', ''],
    ['src/content/config.ts', 'export const collections = {};'],
    ['src/content/notas/uno.md', '# Nota'],
  ];
  for (const [path, code] of misuse) assert.deepEqual(collectionFiles([[path, code]]), [path], code || path);
  const harmless = [
    ['src/lib/otra.mjs', "import { defineConfig } from 'astro/config';"],
    ['src/components/Tarjeta.astro', "---\nimport type { HTMLAttributes } from 'astro/types';\n---"],
    ['src/lib/contenido.mjs', "export const contenido = 'astro';"],
    ['src/pages/content.astro', '<p>Contenido</p>'],
  ];
  for (const [path, code] of harmless) assert.deepEqual(collectionFiles([[path, code]]), [], path);

  assert.deepEqual(collectionFiles(allSources), [], NO_COLLECTIONS);
  // La carpeta src/content/ tampoco existe vacía.
  assert.ok(!(await readdir(join(ROOT, 'src'))).includes('content'), NO_COLLECTIONS);
});

// Módulos integrados de Node que el código de src/ usa hoy: ninguno. Cualquier otro (con «node:» o sin él) falla.
const NODE_BUILTINS_ALLOWED = [];
const NODE_BUILTINS = new Set(builtinModules.filter(name => !name.startsWith('node:')));
const specifiersOf = code => [...code.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)(["'`])([^"'`]+)\1/g)].map(match => match[2]);
/** Módulos integrados de Node que importa un código, salvo los permitidos. */
const nodeBuiltinsOf = code => specifiersOf(code)
  .filter(specifier => specifier.startsWith('node:') || NODE_BUILTINS.has(specifier))
  .filter(specifier => !NODE_BUILTINS_ALLOWED.includes(specifier.replace(/^node:/, '')));
// Lecturas del disco o carga de módulos por una ruta calculada: ninguna prueba puede saber qué archivo leen.
// `process.getBuiltinModule()` da cualquier módulo de Node sin importarlo; `process.binding()` y `process.dlopen()`, el acceso nativo.
const DISK_ACCESS = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)["'](?:node:)?(?:fs|fs\/promises|module|child_process)["']|\bcreateRequire\b|(?<![\w$.])require\s*\(|\bprocess\s*\.\s*(?:binding|_linkedBinding|dlopen)\b|\bgetBuiltinModule\b/;

test('el código de src/ no lee el disco ni importa módulos de Node', () => {
  for (const code of ["import { readdirSync, readFileSync } from 'node:fs';", "import fs from 'fs';", "const { readFile } = await import('node:fs/promises');",
    "import { createRequire } from 'node:module';", "const datos = require('../data/' + nombre);", "const fs = process.getBuiltinModule('node:fs');",
    "const { readdirSync } = globalThis.process.getBuiltinModule('fs');", "const enlace = process.binding('fs');", 'process.dlopen(modulo, ruta);']) {
    assert.match(code, DISK_ACCESS, code);
  }
  assert.doesNotMatch("import { routes } from '../lib/routes.mjs';\nconst ref = fsLike.require;\nconst plataforma = globalThis.process?.platform;", DISK_ACCESS);
  for (const code of ["import os from 'node:os';", "import { join } from 'path';", "export * from 'node:fs';", 'const fs = await import(`node:fs`);',
    "import { Worker } from 'node:worker_threads';", "import { readFile } from 'fs/promises';", "import { DatabaseSync } from 'node:sqlite';"]) {
    assert.notDeepEqual(nodeBuiltinsOf(code), [], code);
  }
  for (const code of ["import { routes } from '../lib/routes.mjs';", "import type { HTMLAttributes } from 'astro/types';", "import path from './path.mjs';"]) {
    assert.deepEqual(nodeBuiltinsOf(code), [], code);
  }

  // El código del sitio lee los datos con import de JSON, que las pruebas anteriores pueden revisar; nunca del disco.
  const diskReaders = [...sources].filter(([, code]) => DISK_ACCESS.test(code)).map(([path]) => path);
  assert.deepEqual(diskReaders, [], 'el código de src/ lee archivos del disco');
  const builtins = [...sources].flatMap(([path, code]) => nodeBuiltinsOf(code).map(specifier => `${path}: ${specifier}`));
  assert.deepEqual(builtins, [], 'el código de src/ importa un módulo de Node que no está en la lista permitida');
});

test('el código del sitio nunca importa el registro de investigación', () => {
  for (const [path, code] of sources) {
    assert.doesNotMatch(code, /research\/|Sercom_Active_Fuentes_Catalogos/, path);
    for (const specifier of importsOf(code)) assert.ok(!specifier.includes('research'), `${path} importa ${specifier}`);
  }
  // Solo lo leen el validador, el escáner y las pruebas.
  assert.ok(!sourceFiles.some(path => /research|fuentes/i.test(path)));
});

test('los módulos para el navegador no importan datos ni usan APIs de Node o de Astro', () => {
  const allowed = {
    'src/lib/text.mjs': [],
    'src/lib/search.mjs': ['./text.mjs'],
    'src/lib/routes.mjs': ['./search.mjs'],
    'src/lib/contact-core.mjs': [],
  };
  for (const [path, imports] of Object.entries(allowed)) {
    const code = sources.get(path);
    assert.ok(code, path);
    assert.deepEqual(importsOf(code), imports, path);
    assert.doesNotMatch(code, /\bnode:|\bastro:|\bprocess\.|import\.meta|\brequire\(|\.json\b|__CATALOG_PREVIEW__/, path);
  }
});

test('ningún <script> de navegador importa los módulos de datos', () => {
  const buildOnly = /site-data|contact\.mjs|catalog-policy|build-mode|\.json|\/data\//;
  let scripts = 0;
  for (const [path, code] of sources) {
    if (!path.endsWith('.astro')) continue;
    const template = code.replace(/^---\r?\n[\s\S]*?\r?\n---/, '');
    // Cada <script> de la plantilla pasa por la revisión: si la expresión dejara de reconocerlos, la prueba falla.
    const opened = (template.match(/<script\b/gi) ?? []).length;
    assert.equal([...template.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].length, opened, `${path}: hay un <script> que la revisión no reconoce`);
    for (const match of template.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      scripts += 1;
      for (const specifier of importsOf(match[2])) assert.doesNotMatch(specifier, buildOnly, `${path}: un <script> importa ${specifier}`);
      assert.doesNotMatch(match[1], /\bsrc=["'][^"']*(?:site-data|contact\.mjs|\.json)/, path);
    }
  }
  // La comprobación sí reconoce una importación indebida.
  const misuse = "<script>\n  import { products } from '../lib/site-data.mjs';\n</script>";
  assert.match(importsOf(misuse.replace(/<\/?script>/g, ''))[0], buildOnly);
  // El sitio tiene scripts de navegador (la plantilla base y el encabezado, al menos): la revisión no puede pasar sin ver ninguno.
  assert.ok(scripts > 0, 'la revisión no encontró ningún <script> en las plantillas');
});

test('la vista previa nunca se compila en la carpeta dist/ del proyecto', async () => {
  const { previewOutDirError } = await import('../src/lib/build-mode.mjs');
  const dist = join(ROOT, 'dist');
  for (const outDir of [dist, `${dist}/`, join(dist, 'vista'), join(ROOT, 'otra', '..', 'dist')]) {
    assert.match(previewOutDirError(outDir, ROOT), /dist/, outDir);
  }
  // Las demás carpetas sí se permiten: la de la vista previa, la de la sonda de las pruebas y una temporal.
  for (const outDir of [join(ROOT, 'dist-preview'), join(ROOT, 'tests', 'build-probe', 'dist'), join(ROOT, 'distribucion'), join(tmpdir(), 'sercom-sonda', 'preview')]) {
    assert.equal(previewOutDirError(outDir, ROOT), '', outDir);
  }
});

test('el lanzador de la vista previa rechaza --outDir dist', () => {
  for (const args of [['--outDir', 'dist'], ['--outDir=dist'], ['--outDir', './dist/'], ['--outDir', join(ROOT, 'dist')], ['--outDir', 'dist/vista']]) {
    const result = spawnSync(process.execPath, ['scripts/catalog-preview.mjs', 'build', ...args], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 });
    assert.equal(result.status, 2, `${args.join(' ')}\n${result.stdout}${result.stderr}`);
    assert.match(result.stderr, /La vista previa no se compila en dist\//);
  }
});

test('Astro se niega a compilar la vista previa en dist/ aunque la bandera llegue desde el entorno', () => {
  const env = { ...process.env, CATALOG_PREVIEW: '1', ASTRO_TELEMETRY_DISABLED: '1' };
  const astro = (...args) => spawnSync(process.execPath, [astroBin, 'build', ...args], { cwd: ROOT, encoding: 'utf8', env, timeout: 120_000 });
  // Sin --outDir (la carpeta por omisión es dist/) y con la sonda de las pruebas dirigida a dist/.
  for (const args of [[], ['--root', 'tests/build-probe', '--config', '../../astro.config.mjs', '--outDir', join(ROOT, 'dist')]]) {
    const result = astro(...args);
    assert.notEqual(result.status, 0, `${args.join(' ')}\n${result.stdout}`);
    assert.match(`${result.stdout}${result.stderr}`, /La vista previa no se compila en dist\//, args.join(' '));
  }
});
