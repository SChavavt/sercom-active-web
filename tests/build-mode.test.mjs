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
// («//» y «/*» solo abren un comentario al inicio de la línea o después de un espacio: así «//» no corta «https://…» y
// el «/*» de una expresión regular como `/^\/*/` no esconde el código que sigue hasta el siguiente «*/».)
// Un texto entre comillas se salta entero: «'../data/**/*.json'» lleva «/**/», que no es un comentario. Las comillas
// simples y dobles no pasan de una línea, así que un apóstrofo suelto del texto de una página solo afecta a su línea.
const COMMENT_OR_STRING = /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\[\s\S]|[^`\\])*`)|(^|\s)\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|(^|\s)\/\/.*$/gm;
const stripComments = text => text.replace(COMMENT_OR_STRING, (_match, string, beforeBlock, beforeLine) => string ?? beforeBlock ?? beforeLine ?? '');
// Tipos de archivo que leen las pruebas de las fuentes (ejemplos, colecciones, disco, capa de datos, datos de contacto):
// las páginas y componentes .astro, los scripts y las hojas de estilo. No leen Markdown, MDX ni HTML.
const SOURCE_FILE = /\.(?:astro|[cm]?[jt]s|[jt]sx|css)$/;
const rawSources = new Map(await Promise.all(sourceFiles.filter(path => SOURCE_FILE.test(path)).map(async path => [path, await readText(path)])));
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
  assert.equal(scripts['check:markup'], 'node scripts/check-markup.mjs');
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
    // El marcado se revisa en los dos modos: la vista previa exige además la búsqueda de la cabecera (#buscador).
    'node scripts/check-markup.mjs dist',
    'node scripts/check-markup.mjs dist-preview --preview',
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
  // El alojamiento publica dist/ solo si la salida pasa el escáner de reglas, el verificador de enlaces y el de marcado.
  assert.equal(vercel.buildCommand, 'npm run check && npm test && npm run build && node scripts/scan-dist.mjs dist --strict && node scripts/check-links.mjs dist && node scripts/check-markup.mjs dist');
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
// `new URL('…', import.meta.url)` con un texto o una plantilla escritos tal cual: Vite copia ese archivo a la salida
// (uno pequeño, en línea como `data:`), así que es una carga como un import.
const NEW_URL_ASSET = /\bnew\s+URL\s*\(\s*(["'`])((?:(?!\1)[^\\\n]|\\.)*)\1\s*,\s*import\s*\.\s*meta\s*\.\s*url\b/g;
/**
 * Archivo (o patrón) al que apunta la ruta de un `new URL(…, import.meta.url)`, resuelto desde la raíz del proyecto:
 * «/…» desde la raíz y cualquier otra ruta desde la carpeta del archivo (aquí «data/x.json» es relativa, no un
 * paquete). Una dirección con esquema («https:», «data:») no es un archivo del proyecto: `undefined`.
 */
function resolveAssetUrl(path, value) {
  const file = value.replace(/[?#].*$/, '');
  if (!file || /^[a-z][a-z\d+.-]*:/i.test(file) || file.startsWith('//')) return undefined;
  return file.startsWith('/') ? posix.normalize(file) : posix.join(posix.dirname(`/${path}`), file);
}
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
  // `new URL(\`…${x}…\`, import.meta.url)`, que Vite también convierte en un patrón (desde la carpeta del archivo).
  for (const match of code.matchAll(NEW_URL_ASSET)) {
    if (match[1] !== '`') continue; // Texto escrito tal cual: lo revisa `dataLoads`.
    const target = resolveAssetUrl(path, match[2].replace(/\$\{[^}]*\}/g, '*'));
    if (target) patterns.push(target);
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

  // require() con la ruta de un archivo de datos escrita tal cual, en un módulo .cjs, .js o .mjs o en el frontmatter de
  // una página: todos son tipos que esta prueba lee, y require() falla siempre.
  for (const [path, code] of [['src/lib/datos.cjs', "const catalogo = require('../data/catalog.json');\nmodule.exports = catalogo.categories;"],
    ['src/lib/datos.js', 'const catalogo = require("../data/catalog.json");'], ['src/lib/datos.mjs', "export const marcas = require('../data/brands.json');"],
    ['src/pages/contacto/index.astro', "---\nconst negocio = require('../../data/business.json');\n---\n<p>{negocio.contactName}</p>"]]) {
    assert.ok(SOURCE_FILE.test(path), path);
    assert.match(stripComments(code), DISK_ACCESS, `${path}: ${code}`);
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

// Capa de datos: los únicos módulos de src/ que cargan archivos de src/data/ o de research/, cada uno con lo que carga.
// Las páginas, los componentes, las plantillas y los demás módulos leen los datos a través de ellos, que filtran por
// estado y por modo (docs/datos-y-modos.md, sección 2): una página que importa catalog.json directamente publicaría en
// producción las categorías en borrador. El archivo de ejemplos tiene además su propia regla, más estricta (arriba).
const DATA_LAYER = {
  'src/lib/site-data.mjs': ['/src/data/brands.json', '/src/data/catalog.json', '/src/data/preview/example-products.json'],
  'src/lib/contact.mjs': ['/src/data/business.json'],
};
const DATA_DIRECTORIES = ['/src/data', '/research'];
// Carpetas de datos que existen hoy, con sus subcarpetas: un patrón de import.meta.glob las alcanza si puede cargar
// un archivo dentro de alguna de ellas.
const dataDirectories = [...DATA_DIRECTORIES, ...(await Promise.all(DATA_DIRECTORIES.map(async directory => (await readdir(join(ROOT, directory), { recursive: true, withFileTypes: true }))
  .filter(entry => entry.isDirectory())
  .map(entry => `${directory}/${join(entry.parentPath, entry.name).slice(join(ROOT, directory).length + 1).split('\\').join('/')}`)))).flat()];
// Una mención solo de tipo no carga nada: `import type … from '…'`, `export type … from '…'` y `typeof import('…')`.
const TYPE_ONLY = /\b(?:import|export)\s+type\s+(?:\{[^}]*\}|\*(?:\s+as\s+[\w$]+)?|[\w$]+)\s+from\s*(["'])[^"'\n]*\1|\btypeof\s+import\s*\(\s*(["'])[^"'\n]*\2\s*\)/g;
// `import … from '…'`, `export … from '…'` (también con `with { type: 'json' }` después), `import '…'` e `import('…')`.
const LOAD_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(["'])([^"'\n]+)\1/g;
const inDataDirectory = target => DATA_DIRECTORIES.some(directory => target === directory || target.startsWith(`${directory}/`));
/** Archivo al que apunta un especificador, resuelto desde la raíz del proyecto, o `undefined` si es un paquete. */
function resolveSpecifier(path, specifier) {
  const file = specifier.replace(/[?#].*$/, '');
  if (file.startsWith('/')) return posix.normalize(file);
  if (file.startsWith('./') || file.startsWith('../')) return posix.join(posix.dirname(`/${path}`), file);
  return undefined;
}
/** ¿Puede un patrón de `import.meta.glob` (ya resuelto, como los de `loadPatterns`) cargar un archivo de la carpeta? */
const globReaches = (pattern, directory) => {
  const slash = pattern.lastIndexOf('/');
  const last = pattern.slice(slash + 1);
  // Cualquier archivo de la carpeta: el último segmento se cambia por «*», salvo «**», que ya baja a las subcarpetas.
  return posix.matchesGlob(`${directory}/archivo`, last.includes('**') ? pattern : `${pattern.slice(0, slash)}/*`);
};
/**
 * Archivos de src/data/ o de research/ que carga un código, leído sin comentarios: cada especificador de `import`,
 * `export … from` e `import()` y cada ruta de `new URL('…', import.meta.url)` que apunta a ellos, y «patrón <…>» por
 * cada patrón de `import.meta.glob`, de `import()` o de `new URL(…, import.meta.url)` con plantilla que puede
 * alcanzarlos (también «?», un patrón que no se puede revisar). Un patrón negado («!../data/**») excluye la carpeta
 * que cubre entera. `readFile` y las demás lecturas del disco las rechaza la prueba del disco (arriba); un `fetch` no
 * se revisa: en el navegador solo alcanza lo que está en la salida, y src/data/ no se copia a ella.
 * @param {string} path Ruta del archivo («src/pages/x.astro»).
 * @param {string} text Contenido del archivo.
 */
function dataLoads(path, text) {
  const code = stripComments(text).replace(TYPE_ONLY, '');
  const loads = [
    ...[...code.matchAll(LOAD_SPECIFIER)].map(match => resolveSpecifier(path, match[2])),
    ...[...code.matchAll(NEW_URL_ASSET)].filter(match => match[1] !== '`').map(match => resolveAssetUrl(path, match[2])),
  ].filter(target => target && inDataDirectory(target));
  const patterns = loadPatterns(path, code);
  const excluded = directory => patterns.some(pattern => pattern.startsWith('!') && pattern.endsWith('/**') && posix.matchesGlob(`${directory}/archivo`, pattern.slice(1)));
  for (const pattern of patterns.filter(item => !item.startsWith('!'))) {
    if (pattern === '?' || dataDirectories.some(directory => !excluded(directory) && globReaches(pattern, directory))) loads.push(`patrón ${pattern}`);
  }
  return [...new Set(loads)].sort();
}

test('solo los módulos de la capa de datos cargan archivos de src/data/ o de research/', () => {
  // Las formas sencillas de cargar un archivo, plantadas en una página, un componente o un módulo: todas fallan.
  const misuse = [
    // La de la revisión: la página lista las diez categorías en borrador, también en producción.
    ['src/pages/contacto/index.astro', "---\nimport catalogoCrudo from '../../data/catalog.json';\nconst nombresCat = catalogoCrudo.categories.map(c => c.name).join(', ');\n---\n<p>{nombresCat}</p>", ['/src/data/catalog.json']],
    ['src/pages/contacto/index.astro', "---\nimport catalogo from '../../data/catalog.json' with { type: 'json' };\n---", ['/src/data/catalog.json']],
    ['src/components/SiteFooter.astro', "---\nimport { categories } from '../data/catalog.json';\n---", ['/src/data/catalog.json']],
    ['src/lib/catalogo-crudo.mjs', "export { default as catalogo } from '../data/catalog.json';", ['/src/data/catalog.json']],
    ['src/lib/marcas.mjs', "export * from '../data/brands.json';", ['/src/data/brands.json']],
    ['src/pages/marcas/index.astro', "---\nimport '../../data/brands.json';\n---", ['/src/data/brands.json']],
    ['src/pages/marcas/index.astro', "---\nconst marcas = (await import('../../data/brands.json')).default;\n---", ['/src/data/brands.json']],
    ['src/pages/contacto/index.astro', "---\nconst negocio = (await import(\"../../data/business.json\", { with: { type: 'json' } })).default;\n---", ['/src/data/business.json']],
    ['src/layouts/BaseLayout.astro', "---\nimport negocio from '/src/data/business.json';\n---", ['/src/data/business.json']],
    ['src/components/Tarjeta.astro', "---\nimport texto from '../data/catalog.json?raw';\n---", ['/src/data/catalog.json']],
    ['src/pages/sonda.astro', "---\nimport registro from '../../research/Sercom_Active_Fuentes_Catalogos.json';\n---", ['/research/Sercom_Active_Fuentes_Catalogos.json']],
    ['src/components/Aviso.astro', "<script>\n  import negocio from '../data/business.json';\n</script>", ['/src/data/business.json']],
    // import.meta.glob con un patrón que alcanza data/, e import() con una plantilla.
    ['src/pages/sonda.astro', "---\nconst datos = import.meta.glob('../data/*.json', { eager: true });\n---", ['patrón /src/data/*.json']],
    ['src/components/Tarjeta.astro', "---\nconst datos = import.meta.glob('/src/**/*.json', { eager: true, import: 'default' });\n---", ['patrón /src/**/*.json']],
    ['src/lib/datos.mjs', "export const datos = import.meta.glob('./*.yaml', { base: '../data/preview' });", ['patrón /src/data/preview/*.yaml']],
    ['src/lib/datos.mjs', "export const datos = import.meta.glob(['/src/**', '!/src/data/preview/**']);", ['patrón /src/**']],
    ['src/lib/datos.mjs', 'export const cargar = nombre => import(`../data/${nombre}.json`);', ['patrón /src/data/*.json']],
    ['src/lib/datos.mjs', 'export const cargar = ruta => import(ruta);', ['patrón ?']],
    // `new URL('…', import.meta.url)`: Vite copia el archivo a la salida (un JSON pequeño, en línea como data:) y la
    // página lo publica entero, borradores incluidos. Con una plantilla, Vite lo convierte en un patrón.
    ['src/pages/contacto/index.astro', "<script>\n  const url = new URL('../../data/catalog.json', import.meta.url);\n  fetch(url).then(r => r.json());\n</script>", ['/src/data/catalog.json']],
    ['src/components/Crudo.astro', '<script>\n  const url = new URL("../data/brands.json" , import . meta . url);\n</script>', ['/src/data/brands.json']],
    ['src/lib/datos.mjs', 'export const url = new URL(`../data/${nombre}.json`, import.meta.url);', ['patrón /src/data/*.json']],
    ['src/pages/sonda.astro', "---\nconst url = new URL('/research/Sercom_Active_Fuentes_Catalogos.json', import.meta.url);\n---", ['/research/Sercom_Active_Fuentes_Catalogos.json']],
  ];
  for (const [path, code, loads] of misuse) {
    assert.deepEqual(dataLoads(path, code), loads, code);
    assert.ok(!(path in DATA_LAYER), path);
  }
  // Un módulo de la capa de datos que carga otro archivo de datos también falla: se compara con su lista.
  assert.deepEqual(dataLoads('src/lib/contact.mjs', "import catalog from '../data/catalog.json' with { type: 'json' };"), ['/src/data/catalog.json']);
  // No son cargas: un comentario, una mención solo de tipo, otro JSON del proyecto, un patrón que no alcanza data/.
  const harmless = [
    ['src/pages/contacto/index.astro', "---\n// import catalogo from '../../data/catalog.json';\n/* import('../../data/brands.json') */\nimport { categories } from '../../lib/site-data.mjs';\n---\n<!-- import negocio from '../../data/business.json' -->"],
    ['src/types/site.ts', "/** Contenido de `src/data/catalog.json`. */\nexport type CatalogoCrudo = typeof import('../data/catalog.json');\nimport type { Brand } from '../data/brands.json';"],
    ['src/lib/icons.ts', "import kit from '../assets/icons/icons.json';"],
    ['src/components/Tarjeta.astro', "---\nconst iconos = import.meta.glob('../assets/icons/*.svg', { eager: true, query: '?raw' });\n---"],
    ['src/lib/datos.mjs', "export const iconos = import.meta.glob(['/src/**/*.svg', '!/src/data/**']);"],
    ['src/pages/contacto/index.astro', '<p>Los datos salen de catalog.json, de brands.json y de business.json.</p>'],
    // Una dirección de la página o del sitio, no un archivo del proyecto.
    ['src/components/PageLinkScript.astro', '<script>\n  const destino = new URL(path, window.location.href);\n  const otra = new URL(\'https://example.com/data/catalog.json\', import.meta.url);\n</script>'],
    ['src/lib/iconos.mjs', "export const logo = new URL('../assets/logo.svg', import.meta.url);"],
  ];
  for (const [path, code] of harmless) assert.deepEqual(dataLoads(path, code), [], code);

  // El árbol de hoy: fuera de la capa de datos nadie carga datos, y cada módulo de la capa carga exactamente su lista.
  const outside = [...rawSources].filter(([path]) => !(path in DATA_LAYER)).flatMap(([path, text]) => dataLoads(path, text).map(load => `${path}: ${load}`));
  assert.deepEqual(outside, [], 'un archivo de src/ carga datos directamente: las páginas y los componentes leen los datos con site-data.mjs o contact.mjs (docs/datos-y-modos.md, sección 2)');
  for (const [path, allowed] of Object.entries(DATA_LAYER)) assert.deepEqual(dataLoads(path, rawSources.get(path)), allowed, path);
});

// Datos de contacto escritos a mano. Las páginas los toman de business.json a través de contact.mjs: un nombre, un
// correo o un número copiados en una plantilla se quedan viejos cuando business.json cambia, y ningún escáner de la
// salida lo nota (el nombre viejo es texto común). Se buscan en el código sin comentarios de src/pages/,
// src/components/, src/layouts/ y src/lib/ (los tipos de src/types/ solo los mencionan en comentarios).
const business = await readJson('src/data/business.json');
const CONTACT_CODE = /^src\/(?:pages|components|layouts|lib)\//;
const foldAccents = text => text.normalize('NFD').replace(/\p{M}/gu, '');
const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Un espacio o un guion de Unicode: los espacios (\s ya los incluye todos, también el duro y el fino), las rayas y
// guiones (\p{Pd}: el guion que no se parte, la raya, el guion de cifra…) y el signo menos.
const SPACE_OR_DASH = '[\\s\\p{Pd}\\u2212]';
/**
 * Cifras con cualquier separador de un teléfono entre ellas («221 400 2219», «(221) 400-2219», «221.400.2219»), y
 * con cualquier espacio o guion de Unicode, que no cuentan al comparar las cifras («221‑400‑2219», «221 400 2219»).
 */
const digitsPattern = digits => `(?<!\\d)${[...digits].join(`(?:${SPACE_OR_DASH}|[().+])*`)}(?!\\d)`;
/**
 * Patrones de los datos de contacto de un business.json. El nombre completo y el correo no distinguen mayúsculas ni
 * acentos. El nombre de pila se busca como palabra completa y con su mayúscula inicial, como se escribe un nombre: si
 * además es una palabra común («Rosa», «Luz», «Paz»), esa palabra en minúsculas no cuenta («guante color rosa»), y una
 * frase que empiece con ella sí, aunque no hable de la persona: esa frase se escribe de otra forma. El número cuenta
 * como se muestra, con sus cifras completas o con las diez del número nacional, con o sin separadores.
 */
const contactPatterns = record => [
  ['nombre', new RegExp(foldAccents(record.contactName).split(/\s+/).map(escapeRegExp).join('\\s+'), 'i')],
  ['nombre de pila', new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(foldAccents(record.contactFirstName))}(?![\\p{L}\\p{N}])`, 'u')],
  // También partido como lo dibuja EmailAddress («ventas.puebla@» y el dominio en otro elemento).
  ['correo', new RegExp(`${escapeRegExp(record.email)}|${escapeRegExp(record.email.split('@')[0])}@`, 'i')],
  ['teléfono como se muestra', new RegExp(record.whatsappDisplay.split(/\s+/).map(escapeRegExp).join(`${SPACE_OR_DASH}*`), 'u')],
  ['cifras del teléfono', new RegExp(`${digitsPattern(record.whatsappDigits)}|${digitsPattern(record.whatsappDigits.slice(-10))}`, 'u')],
];
// Las formas de mantener un número o un nombre en una línea, escritas tal cual o como entidad: se decodifican las
// entidades con nombre y las numéricas (decimales o hexadecimales, con punto y coma o sin él) de los espacios y de los
// guiones («&nbsp;», también «&nbsp» sin punto y coma como lo lee el navegador, «&thinsp;», «&ensp;», «&emsp;», «&#32;»,
// «&#x20;», «&#8201;», «&#8209;», «&ndash;»…), y después cualquier espacio o guion de Unicode cuenta como separador:
// entre las palabras del nombre (\s) y entre las cifras del teléfono (SPACE_OR_DASH), donde no cuenta al comparar las
// cifras. La unión de palabras (U+2060, &NoBreak;) y el espacio de ancho cero (U+200B) se quitan. Un «@» escrito como
// entidad («ventas.puebla&#64;…») o el correo partido por una etiqueta antes del «@» no se buscan: no son la forma de
// escribir un dato, sino de esconderlo (docs/datos-y-modos.md, sección 6).
const SPACE_OR_DASH_NAMES = {
  nbsp: '\u00a0', nonbreakingspace: '\u00a0', ensp: '\u2002', emsp: '\u2003', emsp13: '\u2004', emsp14: '\u2005', numsp: '\u2007', puncsp: '\u2008',
  thinsp: '\u2009', thinspace: '\u2009', hairsp: '\u200a', verythinspace: '\u200a', mediumspace: '\u205f', hyphen: '\u2010', dash: '\u2010',
  ndash: '\u2013', mdash: '\u2014', horbar: '\u2015', minus: '\u2212',
};
const NAMED_SPACE_OR_DASH = new RegExp(`&nbsp;?|&(${Object.keys(SPACE_OR_DASH_NAMES).join('|')});`, 'gi');
const NUMERIC_ENTITY = /&#(?:x([0-9a-f]+)|(\d+));?/gi;
const IS_SPACE_OR_DASH = new RegExp(`^${SPACE_OR_DASH}$`, 'u');
const decodeSpacesAndDashes = text => text
  .replace(NAMED_SPACE_OR_DASH, (_entity, name) => (name ? SPACE_OR_DASH_NAMES[name.toLowerCase()] : '\u00a0'))
  .replace(NUMERIC_ENTITY, (entity, hex, decimal) => {
    const code = Number.parseInt(hex ?? decimal, hex ? 16 : 10);
    const character = code <= 0x10ffff ? String.fromCodePoint(code) : '';
    return IS_SPACE_OR_DASH.test(character) ? character : entity;
  });
const WORD_JOINER = /[\u2060\u200b]|&(?:NoBreak|ZeroWidthSpace|#0*8288|#x0*2060|#0*8203|#x0*200b);/gi;
/** Datos de contacto que un código lleva escritos, leído sin comentarios y sin acentos. */
const contactLiterals = (text, record = business) => {
  const code = decodeSpacesAndDashes(foldAccents(stripComments(text)).replace(WORD_JOINER, ''));
  return contactPatterns(record).filter(([, pattern]) => pattern.test(code)).map(([label]) => label);
};

// Los valores de business.json con los que se escribieron los casos (los de la revisión): los casos usan este registro,
// no el archivo, para que un cambio de contacto no los rompa.
const REVIEWED_CONTACT = { contactName: 'Yosmara del Rocío Torres Pérez', contactFirstName: 'Yosmara', email: 'ventas.puebla@sercomactive.com', whatsappDisplay: '+52 1 221 400 2219', whatsappDigits: '5212214002219' };

test('ninguna página, componente, plantilla ni módulo lleva escritos los datos de contacto de business.json', () => {
  const misuse = [
    // La de la revisión: el nombre escrito en la página de contacto.
    ['<p class="atiende">Te atiende Yosmara del Rocío Torres Pérez.</p>', ['nombre', 'nombre de pila']],
    ['<p>Te atiende YOSMARA DEL ROCIO TORRES PEREZ.</p>', ['nombre']],
    ['<p>Yosmara revisa opciones contigo.</p>', ['nombre de pila']],
    ["const saludo = 'Hola, Yosmara.';", ['nombre de pila']],
    ['<a href="mailto:ventas.puebla@sercomactive.com">Correo</a>', ['correo']],
    ['<span class="email__part">ventas.puebla@</span><wbr><span class="email__part">sercomactive.com</span>', ['correo']],
    ['<p>WhatsApp: +52 1 221 400 2219</p>', ['teléfono como se muestra', 'cifras del teléfono']],
    ['<a href="https://wa.me/5212214002219">WhatsApp</a>', ['cifras del teléfono']],
    ['<p>Llámanos al (221) 400-2219.</p>', ['cifras del teléfono']],
    ['<a href="tel:2214002219">Teléfono</a>', ['cifras del teléfono']],
    // Con los espacios que mantienen el número o el nombre en una línea.
    ['<p>+52&nbsp;1&nbsp;221&nbsp;400&nbsp;2219</p>', ['teléfono como se muestra', 'cifras del teléfono']],
    ['<p>+52&#160;1&#160;221&#160;400&#160;2219</p>', ['teléfono como se muestra', 'cifras del teléfono']],
    ['<p>+52&#xA0;1&#xA0;221&#xA0;400&#xA0;2219</p>', ['teléfono como se muestra', 'cifras del teléfono']],
    ['<p>+52\u00a01\u00a0221\u00a0400\u00a02219</p>', ['teléfono como se muestra', 'cifras del teléfono']],
    ['<p>+52\u202f1\u202f221\u202f400\u202f2219</p>', ['teléfono como se muestra', 'cifras del teléfono']],
    ['<p>+52&#8239;1&#x202F;221&nbsp;400&#8199;2219</p>', ['teléfono como se muestra', 'cifras del teléfono']],
    ['<p>221&nbsp;400&nbsp;2219</p>', ['cifras del teléfono']],
    ['<p>221&NoBreak;400\u20602219</p>', ['cifras del teléfono']],
    ['<p>Yosmara&nbsp;del Rocío Torres Pérez</p>', ['nombre', 'nombre de pila']],
    // Con las demás marcas que mantienen el número en una línea: el guion que no se parte (U+2011, también como entidad),
    // la raya y el guion de cifra, los espacios finos y anchos escritos como entidad, «&#32;» y «&nbsp» sin punto y coma.
    ['<p>221\u2011400\u20112219</p>', ['cifras del teléfono']],
    ['<p>221&#8209;400&#8209;2219</p>', ['cifras del teléfono']],
    ['<p>221&#x2011;400&#x2011;2219</p>', ['cifras del teléfono']],
    ['<p>221\u2013400\u20132219</p>', ['cifras del teléfono']],
    ['<p>221\u2012400\u20122219</p>', ['cifras del teléfono']],
    ['<p>221&ndash;400&mdash;2219</p>', ['cifras del teléfono']],
    ['<p>+52\u20111\u2011221\u2011400\u20112219</p>', ['teléfono como se muestra', 'cifras del teléfono']],
    ['<p>+52&thinsp;1&thinsp;221&thinsp;400&thinsp;2219</p>', ['teléfono como se muestra', 'cifras del teléfono']],
    ['<p>221&ensp;400&ensp;2219</p>', ['cifras del teléfono']],
    ['<p>221&emsp;400&emsp;2219</p>', ['cifras del teléfono']],
    ['<p>+52&#32;1&#32;221&#32;400&#32;2219</p>', ['teléfono como se muestra', 'cifras del teléfono']],
    ['<p>221&#x20;400&#x20;2219</p>', ['cifras del teléfono']],
    ['<p>221&#8201;400&#8201;2219</p>', ['cifras del teléfono']],
    ['<p>221&hairsp;400&#x2009;2219</p>', ['cifras del teléfono']],
    ['<p>+52&nbsp1&nbsp221&nbsp400&nbsp2219</p>', ['teléfono como se muestra', 'cifras del teléfono']],
    ['<p>221&nbsp400&nbsp2219</p>', ['cifras del teléfono']],
    ['<p>Yosmara&nbspdel Rocío Torres Pérez</p>', ['nombre', 'nombre de pila']],
  ];
  for (const [code, labels] of misuse) assert.deepEqual(contactLiterals(code, REVIEWED_CONTACT), labels, code);
  const harmless = [
    '---\n// Saluda a Yosmara del Rocío Torres Pérez con los datos de business.json (ventas.puebla@sercomactive.com).\nimport { contactDetails } from \'../lib/contact.mjs\';\n---\n<!-- +52 1 221 400 2219 -->',
    '<p>Te atiende {contactDetails.name}.</p><a href={contactLinks.whatsapp}>{contactDetails.whatsappDisplay}</a>',
    '<p>Modelo 2214002218, talla 9.</p>', '<p>Los Yosmarales</p>', '<p>Modelo 221&ndash;400 y talla 2219.</p>',
    // Límites documentados: un «@» escrito como entidad y el correo partido por una etiqueta antes del «@» no se buscan.
    '<p>ventas.puebla&#64;sercomactive.com</p>', '<p>ventas.<b></b>puebla@sercomactive.com</p>',
  ];
  for (const code of harmless) assert.deepEqual(contactLiterals(code, REVIEWED_CONTACT), [], code);
  // Un nombre de pila que también es una palabra común: en minúsculas no cuenta; con mayúscula, sí.
  const rosa = { ...REVIEWED_CONTACT, contactName: 'Rosa María López Ruiz', contactFirstName: 'Rosa' };
  assert.deepEqual(contactLiterals('<p>Guante de nitrilo color rosa.</p>', rosa), []);
  assert.deepEqual(contactLiterals('<p>Rosa revisa opciones contigo.</p>', rosa), ['nombre de pila']);

  const written = [...sources].filter(([path]) => CONTACT_CODE.test(path))
    .flatMap(([path, code]) => contactLiterals(code).map(label => `${path}: ${label}`));
  assert.deepEqual(written, [], 'un archivo lleva escrito un dato de contacto: se toma de business.json con contact.mjs (contactDetails, contactLinks)');
});

// Astro publica como página también un archivo Markdown, MDX o HTML de src/pages/, y ninguna prueba de las fuentes lo
// lee: «Escríbele a Yosmara.» en src/pages/nota.md, o la importación de un archivo de datos en una página .mdx, pasarían.
// Hoy todas las páginas son .astro (src/pages/ no tiene otro tipo). Antes de agregar una de otro tipo, las pruebas de las
// fuentes tienen que leerlo.
test('src/pages/ solo tiene páginas de los tipos que leen las pruebas de las fuentes', () => {
  for (const path of ['src/pages/nota.md', 'src/pages/nota.mdx', 'src/pages/nota.markdown', 'src/pages/nota.html', 'src/pages/contacto/index.md']) assert.ok(!SOURCE_FILE.test(path), path);
  for (const path of ['src/pages/index.astro', 'src/pages/marcas/[id].astro', 'src/pages/feed.json.ts', 'src/pages/datos.mjs']) assert.ok(SOURCE_FILE.test(path), path);
  const pages = sourceFiles.filter(path => path.startsWith('src/pages/'));
  assert.ok(pages.length > 0);
  const unread = pages.filter(path => !SOURCE_FILE.test(path));
  assert.deepEqual(unread, [], 'una página de src/pages/ es de un tipo que las pruebas de las fuentes no leen (capa de datos, datos de contacto, ejemplos, disco): antes de agregarla, haz que esas pruebas lean ese tipo (SOURCE_FILE en tests/build-mode.test.mjs) y que revisen su contenido');
});

test('los módulos para el navegador no importan datos ni usan APIs de Node o de Astro', () => {
  const allowed = {
    'src/lib/text.mjs': [],
    'src/lib/search.mjs': ['./text.mjs'],
    'src/lib/routes.mjs': ['./search.mjs'],
    'src/lib/contact-core.mjs': ['./text.mjs'],
    'src/lib/catalog-filters.mjs': ['./routes.mjs', './search.mjs', './text.mjs'],
    'src/lib/quote-list.mjs': ['./text.mjs'],
    'src/lib/quote-store.mjs': ['./quote-list.mjs'],
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
