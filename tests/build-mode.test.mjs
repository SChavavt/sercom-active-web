import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPreviewFlag, PREVIEW_FLAG, previewFlagWarning } from '../src/lib/build-mode.mjs';
import { listFiles, readJson, readText, ROOT } from './helpers.mjs';

const packageJson = await readJson('package.json');
const sourceFiles = (await listFiles(join(ROOT, 'src'))).map(path => `src/${path}`);
// Código sin comentarios: los comentarios pueden nombrar archivos que el código no importa.
// («//» solo cuenta como comentario al inicio de la línea o después de un espacio, para no cortar «https://…».)
const stripComments = text => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
const rawSources = new Map(await Promise.all(sourceFiles.filter(path => /\.(?:astro|mjs|js|ts|css)$/.test(path)).map(async path => [path, await readText(path)])));
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
/**
 * Patrones de `import.meta.glob(…)` y de `import(\`…${x}…\`)` (que Vite convierte en un patrón) en el código de un
 * archivo, resueltos desde la raíz del proyecto. Un `import()` cuyo argumento no es un texto escrito tal cual no se
 * puede revisar y se devuelve como «?».
 * @param {string} path Ruta del archivo («src/pages/x.astro»).
 * @param {string} code Código sin comentarios.
 */
function loadPatterns(path, code) {
  const directory = posix.dirname(`/${path}`);
  const resolvePattern = pattern => {
    const negated = pattern.startsWith('!');
    const body = negated ? pattern.slice(1) : pattern;
    const absolute = body.startsWith('/') ? posix.normalize(body) : posix.join(directory, body);
    return negated ? `!${absolute}` : absolute;
  };
  const patterns = [];
  for (const match of code.matchAll(/import\.meta\.glob\s*(?:<[^>]*>)?\s*\(\s*(\[[^\]]*\]|["'`][^"'`]*["'`]|[^,)]*)/g)) {
    const literals = [...match[1].matchAll(/["'`]([^"'`]*)["'`]/g)].map(literal => literal[1]);
    patterns.push(...(literals.length ? literals.map(resolvePattern) : ['?']));
  }
  for (const match of code.matchAll(/(?<![\w$.])import\s*\(\s*([^)]*)\)/g)) {
    const argument = match[1].trim();
    if (/^(["'])[^"'`]*\1(?:\s*,|$)/.test(argument)) continue; // Texto escrito tal cual: lo revisa la prueba de las menciones.
    const template = argument.match(/^`([^`]*)`/);
    patterns.push(template ? resolvePattern(template[1].replace(/\$\{[^}]*\}/g, '*')) : '?');
  }
  return patterns;
}
/** ¿Alguno de los patrones puede cargar el archivo de ejemplos? */
const reachesExamples = patterns => patterns.some(pattern => pattern === '?')
  || (patterns.some(pattern => !pattern.startsWith('!') && posix.matchesGlob(EXAMPLES_FILE, pattern))
    && !patterns.some(pattern => pattern.startsWith('!') && posix.matchesGlob(EXAMPLES_FILE, pattern.slice(1))));

test('ningún import.meta.glob ni import() con patrón puede cargar el archivo de ejemplos', () => {
  // La comprobación reconoce las formas que esquivan la búsqueda por nombre.
  const misuse = [
    ['src/pages/muestra.astro', "const datos = import.meta.glob('../data/*/*.json', { eager: true });"],
    ['src/pages/muestra.astro', "const datos = import.meta.glob(['../data/**/*.json', '!../data/catalog.json']);"],
    ['src/components/Tarjeta.astro', "const datos = import.meta.glob('/src/**/*.json');"],
    ['src/lib/otra.mjs', 'const datos = await import(`../data/${carpeta}/${nombre}.json`);'],
    ['src/lib/otra.mjs', 'const datos = await import(ruta);'],
  ];
  for (const [path, code] of misuse) assert.ok(reachesExamples(loadPatterns(path, code)), code);
  const harmless = [
    ['src/pages/muestra.astro', "const iconos = import.meta.glob('../icons/*.svg', { eager: true, query: '?raw' });"],
    ['src/pages/muestra.astro', "const datos = import.meta.glob(['../data/*.json', '!../data/preview/**']);"],
    ['src/lib/site-data.mjs', "const datos = (await import('../data/preview/example-products.json', { with: { type: 'json' } })).default;"],
  ];
  for (const [path, code] of harmless) assert.equal(reachesExamples(loadPatterns(path, code)), false, code);

  const offenders = [...sources].filter(([path, code]) => reachesExamples(loadPatterns(path, code))).map(([path]) => path);
  assert.deepEqual(offenders, [], 'un patrón de carga puede llevar el archivo de ejemplos fuera de la rama de vista previa');
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
    for (const match of template.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      scripts += 1;
      for (const specifier of importsOf(match[2])) assert.doesNotMatch(specifier, buildOnly, `${path}: un <script> importa ${specifier}`);
      assert.doesNotMatch(match[1], /\bsrc=["'][^"']*(?:site-data|contact\.mjs|\.json)/, path);
    }
  }
  // La comprobación sí reconoce una importación indebida.
  const misuse = "<script>\n  import { products } from '../lib/site-data.mjs';\n</script>";
  assert.match(importsOf(misuse.replace(/<\/?script>/g, ''))[0], buildOnly);
  assert.ok(scripts >= 0);
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
