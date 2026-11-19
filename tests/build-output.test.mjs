// Prueba de compilación: demuestra con Astro real que el archivo de ejemplos no llega a la salida de producción.
//
// Compila la sonda de tests/build-probe (páginas que imprimen todos los datos públicos, un archivo JSON y dos
// scripts de navegador) con la configuración real del proyecto, en carpetas temporales:
//   1. producción, sin la bandera y con un archivo .env que intenta activarla;
//   2. producción, con un valor no reconocido en la bandera;
//   3. vista previa, con el mismo lanzador que usa `npm run build:preview`.
// La vista previa sirve de control: los mismos archivos sí contienen los ejemplos cuando la bandera está activa.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanDist } from '../scripts/scan-dist.mjs';
import { matchesSearchText, SEARCH_PARAM } from '../src/lib/search.mjs';
import { listFiles, loadProjectData, ROOT } from './helpers.mjs';

const PROBE = join(ROOT, 'tests', 'build-probe');
// --root es relativo a la carpeta del proyecto y --config es relativo a --root.
const PROBE_ARGS = ['--root', 'tests/build-probe', '--config', '../../astro.config.mjs'];
const MARKERS = /EJ-\d|marca de ejemplo|ejemplo-|de ejemplo/i;
const MISUSE_CHUNK = /^_astro\/script-con-datos\./;

const data = await loadProjectData();
// Todo lo que identifica a un ejemplo: ids, nombres, códigos, códigos de variante y textos.
const fixtureTokens = [...new Set(data.examples.flatMap(example => [
  example.id, example.name, example.code, example.summary, ...example.characteristics, ...example.variants.map(variant => variant.code),
]))];

const astroPackage = new URL('../node_modules/astro/package.json', import.meta.url);
const { bin } = JSON.parse(await readFile(astroPackage, 'utf8'));
const astroBin = fileURLToPath(new URL(typeof bin === 'string' ? bin : bin.astro, astroPackage));

/** Ejecuta un comando de Node en la carpeta del proyecto y devuelve su código de salida y lo que imprimió. */
function run(args, catalogPreview) {
  const env = { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' };
  delete env.CATALOG_PREVIEW;
  if (catalogPreview !== undefined) env.CATALOG_PREVIEW = catalogPreview;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', reject);
    child.on('exit', code => resolve({ code, output }));
  });
}

/** Lee todos los archivos de una carpeta compilada: ruta → contenido. */
async function readOutput(directory) {
  const files = new Map();
  for (const path of await listFiles(directory)) files.set(path, (await readFile(join(directory, ...path.split('/')))).toString('utf8'));
  return files;
}

let temporary;
const builds = {};

before(async () => {
  temporary = await mkdtemp(join(tmpdir(), 'sercom-sonda-'));
  // Trampa: un archivo .env que Vite sí lee, con la bandera activada. No debe cambiar el modo.
  await writeFile(join(PROBE, '.env'), 'CATALOG_PREVIEW=1\nPUBLIC_PROBE_ENV_FILE=leido\n');
  const plan = [
    ['production', [astroBin, 'build', ...PROBE_ARGS], undefined],
    ['malformed', [astroBin, 'build', ...PROBE_ARGS], 'si'],
    ['preview', ['scripts/catalog-preview.mjs', 'build', ...PROBE_ARGS], undefined],
  ];
  // Una tras otra: las tres escriben en las mismas carpetas de trabajo de la sonda.
  for (const [name, args, flag] of plan) {
    const directory = join(temporary, name);
    const result = await run([...args, '--outDir', directory], flag);
    assert.equal(result.code, 0, `la compilación «${name}» falló:\n${result.output}`);
    builds[name] = { directory, output: result.output, files: await readOutput(directory) };
  }
}, { timeout: 180_000 });

after(async () => {
  await Promise.all([
    temporary ? rm(temporary, { recursive: true, force: true }) : undefined,
    rm(join(PROBE, '.env'), { force: true }),
    rm(join(PROBE, '.astro'), { recursive: true, force: true }),
    rm(join(PROBE, 'node_modules'), { recursive: true, force: true }),
  ]);
});

test('producción: la sonda imprime los datos reales y ningún ejemplo', () => {
  const { files } = builds.production;
  const index = files.get('index.html');
  assert.match(index, /<body data-mode="production" data-env-file="leido">/);
  for (const brand of data.brands) assert.ok(index.includes(`<li data-brand="${brand.id}">${brand.name}</li>`), brand.id);
  assert.doesNotMatch(index, /data-product=|data-category=/);
  const json = JSON.parse(files.get('datos.json'));
  assert.equal(json.mode, 'production');
  assert.deepEqual(json.products, []);
  assert.deepEqual(json.categories, []);
  assert.equal(json.brands.length, 19);
  // El script de la página trae la búsqueda y los enlaces, sin datos.
  const scripts = [...files.keys()].filter(path => path.endsWith('.js'));
  assert.ok(scripts.length >= 2, 'la sonda debe producir scripts de navegador');
  assert.ok(scripts.some(path => MISUSE_CHUNK.test(path)));
});

test('producción: el archivo de ejemplos no está en ningún HTML, script ni JSON', () => {
  const { files } = builds.production;
  assert.ok(files.size >= 5);
  for (const [path, content] of files) {
    assert.doesNotMatch(path, /ejemplo|example-products/i, 'nombre de archivo');
    for (const token of fixtureTokens) assert.ok(!content.includes(token), `${path} contiene «${token}»`);
    // Fuera del script que importa el módulo de datos (caso prohibido, ver la prueba siguiente), tampoco hay
    // ninguna de las marcas genéricas de ejemplo.
    if (!MISUSE_CHUNK.test(path)) assert.doesNotMatch(content, MARKERS, path);
  }
});

test('producción: un script de navegador que importa el módulo de datos no arrastra los ejemplos, y el escáner lo delata', async () => {
  const { files, directory } = builds.production;
  const [path, content] = [...files].find(([name]) => MISUSE_CHUNK.test(name));
  // El script lleva catalog.json completo (por eso está prohibido), pero no el archivo de ejemplos.
  assert.ok(content.includes('schemaVersion'));
  for (const token of fixtureTokens) assert.ok(!content.includes(token), token);
  const { findings } = await scanDist(directory, { data });
  const flagged = findings.filter(finding => finding.level === 'FAIL' && finding.file === path).map(finding => finding.id);
  assert.ok(flagged.includes('R-RULE-13'), 'el escáner debe señalar los datos internos en el script');
  // Los demás archivos de la sonda no tienen ningún hallazgo de ejemplos.
  assert.deepEqual(findings.filter(finding => finding.id === 'R-RULE-03' && finding.file !== path), []);
});

test('un archivo .env o un valor no reconocido no activan la vista previa', () => {
  // La compilación de producción leyó el .env de la sonda (data-env-file="leido") y aun así fue producción.
  assert.doesNotMatch(builds.production.output, /Vista previa de diseño/);
  const { files, output } = builds.malformed;
  assert.match(output, /CATALOG_PREVIEW="si" no es un valor reconocido/);
  assert.match(files.get('index.html'), /<body data-mode="production"/);
  assert.equal(JSON.parse(files.get('datos.json')).mode, 'production');
  for (const [path, content] of files) for (const token of fixtureTokens) assert.ok(!content.includes(token), `${path} contiene «${token}»`);
});

test('vista previa (control): los mismos archivos sí contienen los diez ejemplos', () => {
  const { files, output } = builds.preview;
  assert.match(output, /Vista previa de diseño \(CATALOG_PREVIEW\)/);
  const index = files.get('index.html');
  assert.match(index, /<body data-mode="preview"/);
  assert.equal(index.match(/data-product="ejemplo-/g).length, 10);
  assert.equal(index.match(/data-category="/g).length, 10);
  for (const example of data.examples) {
    for (const token of [example.id, example.name, example.code, ...example.variants.map(variant => variant.code)]) assert.ok(index.includes(token), token);
  }
  const json = JSON.parse(files.get('datos.json'));
  assert.equal(json.mode, 'preview');
  assert.deepEqual(json.products.map(product => product.id), data.examples.map(example => example.id));
  assert.ok(json.products.every(product => product.isExample === true && product.brandId === null));
  assert.equal(json.categories.length, 10);
  // Con la bandera activa, el script que importa el módulo de datos sí carga el archivo de ejemplos:
  // es la rama que la compilación de producción elimina.
  const scripts = [...files].filter(([path]) => path.endsWith('.js'));
  for (const example of data.examples) assert.ok(scripts.some(([, content]) => content.includes(example.code)), example.code);
});

test('vista previa: la búsqueda del navegador sobre los data-search compilados da los productos esperados', () => {
  // El mismo camino que el script de la página: el atributo escrito en el HTML (con sus entidades), leído como lo
  // devuelve getAttribute, y la consulta leída de la dirección con URLSearchParams. Lo esperado está escrito a mano.
  const decode = text => text.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(amp|lt|gt|quot|apos|#39));/gi, (entity, decimal, hex, name) => (
    decimal ? String.fromCodePoint(Number(decimal)) : hex ? String.fromCodePoint(parseInt(hex, 16)) : { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" }[name.toLowerCase()]));
  const index = builds.preview.files.get('index.html');
  const cards = [...index.matchAll(/<li data-product="([^"]+)" data-search="([^"]*)"/g)].map(match => ({ id: match[1], search: decode(match[2]) }));
  assert.equal(cards.length, 10);
  const found = location => cards.filter(card => matchesSearchText(card.search, new URL(location, 'https://sitio.example/').searchParams.get(SEARCH_PARAM))).map(card => card.id);
  const all = data.examples.map(example => example.id);
  const expectations = [
    ['/catalogo/', all],
    ['/catalogo/?q=', all],
    ['/catalogo/?q=guante', ['ejemplo-guante-recubierto']],
    ['/catalogo/?q=GUANTE+recubierto', ['ejemplo-guante-recubierto']],
    ['/catalogo/?q=EJ-1001', ['ejemplo-guante-recubierto']],
    ['/catalogo/?q=ej1001', ['ejemplo-guante-recubierto']],
    ['/catalogo/?q=ej%201001', ['ejemplo-guante-recubierto']],
    ['/catalogo/?q=EJ-8001-27', ['ejemplo-bota-con-casquillo']],
    ['/catalogo/?q=ARN%C3%89S', ['ejemplo-arnes-de-cuerpo-completo']],
    ['/catalogo/?q=se%C3%B1alizaci%C3%B3n', ['ejemplo-cono-de-71-cm']],
    ['/catalogo/?q=senalizacion', ['ejemplo-cono-de-71-cm']],
    ['/catalogo/?q=casco%20cachucha', ['ejemplo-casco-tipo-cachucha']],
    ['/catalogo/?q=casco+EJ-1001', []],
    ['/catalogo/?q=zzzz', []],
  ];
  for (const [location, expected] of expectations) assert.deepEqual(found(location), expected, location);
});

test('vista previa (control): el escáner en modo producción detecta los ejemplos en HTML, JSON y scripts', async () => {
  const { findings } = await scanDist(builds.preview.directory, { data });
  const leaked = new Set(findings.filter(finding => finding.level === 'FAIL' && finding.id === 'R-RULE-03').map(finding => finding.file));
  assert.ok(leaked.has('index.html'));
  assert.ok(leaked.has('datos.json'));
  assert.ok([...leaked].some(path => path.endsWith('.js')));
});
