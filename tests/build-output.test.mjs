// Prueba de compilación: demuestra con Astro real que el archivo de ejemplos no llega a la salida de producción.
//
// Compila la sonda de tests/build-probe (páginas que imprimen todos los datos públicos, un archivo JSON y dos
// scripts de navegador) con la configuración real del proyecto, en carpetas temporales:
//   1. producción, sin la bandera y con un archivo .env que intenta activarla;
//   2. producción, con un valor no reconocido en la bandera;
//   3. vista previa, con el mismo lanzador que usa `npm run build:preview`;
//   4. el sitio real, en producción, con un catálogo sintético en lugar de src/data/catalog.json (una configuración
//      temporal que importa la del proyecto y solo cambia ese archivo): la única forma de compilar la ficha real
//      (src/pages/productos/[id].astro) con normas mientras el catálogo del repositorio no tiene productos.
// La vista previa sirve de control: los mismos archivos sí contienen los ejemplos cuando la bandera está activa.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scanDist } from '../scripts/scan-dist.mjs';
import { validateCatalog } from '../src/lib/catalog-policy.mjs';
import { matchesSearchText, SEARCH_PARAM } from '../src/lib/search.mjs';
import { listFiles, loadProjectData, publicCatalog, ROOT } from './helpers.mjs';

const PROBE = join(ROOT, 'tests', 'build-probe');
// --root es relativo a la carpeta del proyecto y --config es relativo a --root.
const PROBE_ARGS = ['--root', 'tests/build-probe', '--config', '../../astro.config.mjs'];
const MARKERS = /EJ-\d|marca de ejemplo|ejemplo-|de ejemplo/i;
const MISUSE_CHUNK = /^_astro\/script-con-datos\./;

const data = await loadProjectData();
// Lo que el catálogo real debe mostrar en cada compilación, derivado de los mismos datos: la sonda se compila con el
// catálogo del repositorio, sea cual sea.
const real = publicCatalog(data.catalog);
const listedIn = (html, attribute) => [...html.matchAll(new RegExp(`${attribute}="([^"]+)"`, 'g'))].map(match => match[1]);
// Los dieciséis ejemplos de los listados; el ejemplo retirado solo tiene su página informativa.
const listedExamples = data.examples.filter(example => example.retired !== true);
const retiredExamples = data.examples.filter(example => example.retired === true);
// Todo lo que identifica a un ejemplo: ids, nombres, códigos, códigos de variante y textos.
const fixtureTokens = [...new Set(data.examples.flatMap(example => [
  example.id, example.name, example.code, example.summary, ...example.characteristics, ...example.variants.map(variant => variant.code),
]))];

// Catálogo sintético de la compilación 4: las categorías del repositorio con «manos» aprobada, una ficha aprobada con
// tres normas (en un orden que no es el alfabético), otra aprobada sin normas y un retirado que fue público, con una
// norma en sus datos. Fichas, códigos y normas inventados.
const NORM_SOURCE = 'https://fabricante.example/ficha-sintetica-normas';
const NORMS = ['Norma sintética SONDA-C3', 'Norma sintética SONDA-A1', 'Norma sintética SONDA-B2'];
const RETIRED_NORM = 'Norma sintética SONDA-R9';
const synthetic = (id, change) => ({
  id, brandId: data.brands[0].id, model: `SONDA-${id.length}`, name: `Guante sintético ${id}`, categoryIds: ['manos'], status: 'approved',
  description: 'Guante sintético que solo existe en la prueba de la ficha.', saleUnit: 'par',
  characteristics: ['Dato sintético uno', 'Dato sintético dos', 'Dato sintético tres'],
  variants: [{ id: 'talla-8', label: 'Talla 8' }, { id: 'talla-9', label: 'Talla 9' }],
  documents: [{ label: 'Hoja de datos sintética', url: 'https://fabricante.example/hoja-sintetica' }],
  source: { url: 'https://fabricante.example/origen-sintetico', checkedOn: '2026-11-23' },
  approval: { by: 'Prueba de compilación', on: '2026-11-23', supplyConfirmed: true },
  ...change,
});
const normsCatalog = {
  ...data.catalog,
  categories: data.catalog.categories.map(category => (category.id === 'manos' ? { ...category, status: 'approved' } : category)),
  products: [
    synthetic('guante-con-normas', { standards: NORMS.map(text => ({ text, sourceUrl: NORM_SOURCE })) }),
    synthetic('guante-sin-normas', { model: 'SONDA-SIN' }),
    synthetic('guante-retirado-normas', { status: 'retired', model: 'SONDA-RET', standards: [{ text: RETIRED_NORM, sourceUrl: NORM_SOURCE }] }),
  ],
};

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
  // 4: la configuración del proyecto, con src/data/catalog.json resuelto al catálogo sintético.
  assert.deepEqual(validateCatalog(normsCatalog, data.registry), [], 'el catálogo sintético debe ser válido');
  const catalogFile = join(ROOT, 'src', 'data', 'catalog.json');
  const syntheticFile = join(temporary, 'catalogo-sintetico.json');
  await writeFile(syntheticFile, JSON.stringify(normsCatalog));
  const config = join(temporary, 'astro.config.normas.mjs');
  await writeFile(config, [
    "import { dirname, resolve } from 'node:path';",
    `import base from ${JSON.stringify(pathToFileURL(join(ROOT, 'astro.config.mjs')).href)};`,
    `const catalog = ${JSON.stringify(catalogFile)};`,
    'const swap = {',
    "  name: 'prueba:catalogo-sintetico', enforce: 'pre',",
    "  resolveId(source, importer) { return importer && resolve(dirname(importer.split('?')[0]), source.split('?')[0]) === catalog ? " + `${JSON.stringify(syntheticFile)} : null; },`,
    '};',
    'export default { ...base, vite: { ...base.vite, plugins: [...(base.vite?.plugins ?? []), swap] } };',
    '',
  ].join('\n'));
  // --config se resuelve desde la carpeta del proyecto, también cuando es una ruta absoluta: va relativa.
  plan.push(['norms', [astroBin, 'build', '--config', relative(ROOT, config)], undefined]);
  // Una tras otra: las tres primeras escriben en las mismas carpetas de trabajo de la sonda, y nunca dos a la vez.
  for (const [name, args, flag] of plan) {
    const directory = join(temporary, name);
    const result = await run([...args, '--outDir', directory], flag);
    assert.equal(result.code, 0, `la compilación «${name}» falló:\n${result.output}`);
    builds[name] = { directory, output: result.output, files: await readOutput(directory) };
  }
}, { timeout: 300_000 });

after(async () => {
  await Promise.all([
    temporary ? rm(temporary, { recursive: true, force: true }) : undefined,
    rm(join(PROBE, '.env'), { force: true }),
    rm(join(PROBE, '.astro'), { recursive: true, force: true }),
    rm(join(PROBE, 'node_modules'), { recursive: true, force: true }),
  ]);
});

test('producción: la sonda imprime exactamente las categorías y las fichas aprobadas, y ningún ejemplo', () => {
  const { files } = builds.production;
  const index = files.get('index.html');
  assert.match(index, /<body data-mode="production" data-env-file="leido">/);
  for (const brand of data.brands) assert.ok(index.includes(`<li data-brand="${brand.id}">${brand.name}</li>`), brand.id);
  // Nada sin aprobar llega a la salida: ni una categoría en borrador ni una ficha en borrador, en revisión o retirada.
  assert.deepEqual(listedIn(index, 'data-category'), real.approvedCategoryIds);
  assert.deepEqual(listedIn(index, 'data-product'), real.approvedProductIds);
  assert.deepEqual(listedIn(index, 'data-retired'), real.publicRetiredIds);
  const json = JSON.parse(files.get('datos.json'));
  assert.equal(json.mode, 'production');
  assert.deepEqual(json.products.map(product => product.id), real.approvedProductIds);
  assert.ok(json.products.every(product => product.isExample === false));
  assert.deepEqual(json.retiredProducts.map(product => product.id), real.publicRetiredIds);
  assert.deepEqual(json.categories.map(category => category.id), real.approvedCategoryIds);
  assert.equal(json.brands.length, 15);
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

test('vista previa (control): los mismos archivos sí contienen los dieciséis ejemplos y el retirado, cada uno en su lista', () => {
  const { files, output } = builds.preview;
  assert.match(output, /Vista previa de diseño \(CATALOG_PREVIEW\)/);
  const index = files.get('index.html');
  assert.match(index, /<body data-mode="preview"/);
  assert.equal(index.match(/data-product="ejemplo-/g).length, 16);
  assert.equal(index.match(/data-category="/g).length, 10);
  for (const example of listedExamples) {
    for (const token of [example.id, example.name, example.code, ...example.variants.map(variant => variant.code)]) assert.ok(index.includes(token), token);
  }
  // El ejemplo retirado solo está en su lista, con solo lo que lo identifica.
  assert.equal(retiredExamples.length, 1);
  assert.deepEqual(listedIn(index, 'data-retired'), [...real.publicRetiredIds, ...retiredExamples.map(example => example.id)]);
  for (const example of retiredExamples) {
    assert.ok(!index.includes(`data-product="${example.id}"`), example.id);
    for (const token of [example.name, example.code]) assert.ok(index.includes(token), token);
    for (const variant of example.variants) assert.ok(!index.includes(variant.code), variant.code);
  }
  const json = JSON.parse(files.get('datos.json'));
  assert.equal(json.mode, 'preview');
  // Las fichas aprobadas del catálogo real van primero; después, los ejemplos.
  assert.deepEqual(json.products.map(product => product.id), [...real.approvedProductIds, ...listedExamples.map(example => example.id)]);
  const exampleProducts = json.products.filter(product => product.isExample === true);
  assert.deepEqual(exampleProducts.map(product => product.id), listedExamples.map(example => example.id));
  assert.deepEqual(json.retiredProducts.filter(product => product.isExample === true).map(product => [product.id, product.isExample, product.brandId, Object.keys(product).length]), retiredExamples.map(example => [example.id, true, null, 9]));
  assert.deepEqual(json.retiredProducts.filter(product => product.isExample !== true).map(product => product.id), real.publicRetiredIds);
  assert.ok(exampleProducts.every(product => product.brandId === null));
  // Cada ejemplo llega con su marca de ejemplo, sin cambiarla.
  assert.deepEqual(exampleProducts.map(product => product.brandName), listedExamples.map(example => example.brandName));
  assert.deepEqual([...new Set(exampleProducts.map(product => product.brandName))], ['Marca de ejemplo', 'Marca de ejemplo Beta', 'Marca de ejemplo Gamma']);
  assert.equal(json.categories.length, 10);
  // Con la bandera activa, el script que importa el módulo de datos sí carga el archivo de ejemplos:
  // es la rama que la compilación de producción elimina.
  const scripts = [...files].filter(([path]) => path.endsWith('.js'));
  for (const example of data.examples) assert.ok(scripts.some(([, content]) => content.includes(example.code)), example.code);
});

test('vista previa: la búsqueda del navegador sobre los data-search compilados da los productos esperados', () => {
  // El mismo camino que el script de la página: el atributo escrito en el HTML (con sus entidades), leído como lo
  // devuelve getAttribute, y la consulta leída de la dirección con URLSearchParams. Lo esperado está escrito a mano.
  const decode = text => text.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(amp|lt|gt|quot|apos|#39));/gi, (_entity, decimal, hex, name) => (
    decimal ? String.fromCodePoint(Number(decimal)) : hex ? String.fromCodePoint(parseInt(hex, 16)) : { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" }[name.toLowerCase()]));
  const index = builds.preview.files.get('index.html');
  // Solo las tarjetas de los ejemplos: lo esperado es de ellos, y las fichas reales que haya no lo cambian.
  const exampleIds = new Set(listedExamples.map(example => example.id));
  const cards = [...index.matchAll(/<li data-product="([^"]+)" data-search="([^"]*)"/g)].map(match => ({ id: match[1], search: decode(match[2]) }))
    .filter(card => exampleIds.has(card.id));
  assert.equal(cards.length, 16);
  const found = location => cards.filter(card => matchesSearchText(card.search, new URL(location, 'https://sitio.example/').searchParams.get(SEARCH_PARAM))).map(card => card.id);
  const all = listedExamples.map(example => example.id);
  const expectations = [
    ['/catalogo/', all],
    ['/catalogo/?q=', all],
    ['/catalogo/?q=guante', ['ejemplo-guante-recubierto', 'ejemplo-guante-de-nitrilo', 'ejemplo-guante-de-carnaza']],
    ['/catalogo/?q=guantes', ['ejemplo-guante-recubierto', 'ejemplo-guante-de-nitrilo', 'ejemplo-guante-de-carnaza']],
    ['/catalogo/?q=GUANTE+recubierto', ['ejemplo-guante-recubierto']],
    ['/catalogo/?q=gafas', ['ejemplo-lente-de-seguridad']],
    ['/catalogo/?q=arnes', ['ejemplo-arnes-de-cuerpo-completo']],
    ['/catalogo/?q=EJ-1001', ['ejemplo-guante-recubierto']],
    ['/catalogo/?q=ej1001', ['ejemplo-guante-recubierto']],
    ['/catalogo/?q=ej%201001', ['ejemplo-guante-recubierto']],
    ['/catalogo/?q=EJ-8001-27', ['ejemplo-bota-con-casquillo']],
    ['/catalogo/?q=ARN%C3%89S', ['ejemplo-arnes-de-cuerpo-completo']],
    ['/catalogo/?q=se%C3%B1alizaci%C3%B3n', ['ejemplo-cono-de-71-cm']],
    ['/catalogo/?q=senalizacion', ['ejemplo-cono-de-71-cm']],
    ['/catalogo/?q=casco%20cachucha', ['ejemplo-casco-tipo-cachucha']],
    ['/catalogo/?q=EJ-4002', ['ejemplo-respirador-desechable']],
    ['/catalogo/?q=casco+EJ-1001', []],
    ['/catalogo/?q=zzzz', []],
  ];
  for (const [location, expected] of expectations) assert.deepEqual(found(location), expected, location);
});

test('la sonda dibuja una foto local con el mismo componente que las fichas: WebP en varios anchos, el formato del archivo, sizes, medidas y alt', () => {
  const { files } = builds.production;
  const html = files.get('foto/index.html');
  assert.ok(html, 'la sonda debe tener la página de la foto');
  const block = id => html.match(new RegExp(`<div id="${id}">([\\s\\S]*?)</div>`))[1];
  const attribute = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
  const entries = srcset => srcset.split(',').map(entry => entry.trim().split(/\s+/));
  // La imagen sintética mide 1200 × 900 (4:3).
  for (const [id, place] of [['tarjeta', 'card'], ['ficha', 'page']]) {
    const markup = block(id);
    const source = markup.match(/<source\b[^>]*>/)[0];
    const img = markup.match(/<img\b[^>]*>/)[0];
    assert.match(markup, /^\s*<picture>/, id);
    assert.equal(attribute(source, 'type'), 'image/webp', id);
    // Los anchos de cada lugar, sin agrandar la foto: lo que pasa de 1200 se cambia por 1200.
    const widths = place === 'card' ? ['160w', '240w', '320w', '400w', '480w', '640w'] : ['160w', '240w', '320w', '480w', '640w', '960w', '1200w'];
    for (const [srcset, extension] of [[attribute(source, 'srcset'), 'webp'], [attribute(img, 'srcset'), 'png']]) {
      const list = entries(srcset);
      assert.deepEqual(list.map(([, width]) => width), widths, `${id} ${extension}`);
      for (const [url] of list) {
        assert.match(url, new RegExp(`^/_astro/foto-sintetica\\.[\\w-]+\\.${extension}$`), `${id} ${url}`);
        assert.ok(files.has(url.slice(1)), `${id}: falta ${url}`);
      }
    }
    // Para un navegador sin WebP, el formato del archivo (PNG).
    assert.match(attribute(img, 'src'), /^\/_astro\/foto-sintetica\.[\w-]+\.png$/, id);
    assert.ok(files.has(attribute(img, 'src').slice(1)), id);
    // `sizes`: el ancho que ocupa una foto de 4:3 contenida en el marco de cada lugar. En la ficha en celular, el marco
    // de 4:3 de todo el ancho menos 20 px de relleno a cada lado (350 px a 390, medido en el navegador).
    const sizes = place === 'card' ? '(max-width: 699px) 50vw, (max-width: 1099px) 39.2vw, 323px' : '(max-width: 699px) calc(100vw - 40px), (max-width: 1099px) 347px, 627px';
    assert.equal(attribute(source, 'sizes'), sizes, id);
    assert.equal(attribute(img, 'sizes'), sizes, id);
    // Medidas del archivo, texto alternativo, clase del lugar y carga.
    assert.equal(attribute(img, 'width'), '1200', id);
    assert.equal(attribute(img, 'height'), '900', id);
    assert.equal(attribute(img, 'alt'), 'Foto sintética de la sonda', id);
    assert.equal(attribute(img, 'class'), place === 'card' ? 'product__img' : 'producto__img', id);
    assert.equal(attribute(img, 'decoding'), 'async', id);
    assert.equal(attribute(img, 'loading'), place === 'card' ? 'lazy' : 'eager', id);
    assert.equal(attribute(img, 'fetchpriority'), place === 'card' ? undefined : 'high', id);
  }
  // Ningún archivo generado es más ancho que la foto.
  assert.ok(![...files.keys()].some(path => /foto-sintetica.*\.(?:webp|png)$/.test(path) && /1280|1600/.test(path)));
  // Una foto por dirección: un <img> con la dirección tal cual, sus medidas, y sin decirle al otro servidor de qué página viene.
  const remote = block('direccion').trim();
  assert.doesNotMatch(remote, /<picture|<source/);
  assert.equal(attribute(remote, 'src'), 'https://fotos.sonda.invalid/foto.jpg');
  assert.equal(attribute(remote, 'width'), '1600');
  assert.equal(attribute(remote, 'height'), '1200');
  assert.equal(attribute(remote, 'alt'), 'Foto de la sonda por dirección');
  assert.equal(attribute(remote, 'referrerpolicy'), 'no-referrer');
  assert.equal(attribute(remote, 'loading'), 'lazy');
  assert.equal(attribute(remote, 'decoding'), 'async');
  // La compilación no descarga la dirección.
  assert.ok(![...files.keys()].some(path => path.includes('sonda.invalid') || /^_astro\/foto\./.test(path)));
});

test('vista previa (control): el escáner en modo producción detecta los ejemplos en HTML, JSON y scripts', async () => {
  const { findings } = await scanDist(builds.preview.directory, { data });
  const leaked = new Set(findings.filter(finding => finding.level === 'FAIL' && finding.id === 'R-RULE-03').map(finding => finding.file));
  assert.ok(leaked.has('index.html'));
  assert.ok(leaked.has('datos.json'));
  assert.ok([...leaked].some(path => path.endsWith('.js')));
});

test('la ficha real muestra sus normas en «Normas», después de «Características» y antes de «Variantes», y en ningún otro lugar', () => {
  const { files } = builds.norms;
  const page = files.get('productos/guante-con-normas/index.html');
  assert.ok(page, 'la ficha con normas debe compilarse');
  const heading = title => page.indexOf(`>${title}</h2>`);
  assert.ok(heading('Características') > 0 && heading('Características') < heading('Normas') && heading('Normas') < heading('Variantes'), 'orden de los bloques');
  // Una fila por norma, con su texto y en el orden de los datos, y la nota debajo.
  const block = page.match(/<section[^>]*aria-labelledby="normas-title"[^>]*>([\s\S]*?)<\/section>/)?.[1] ?? '';
  const list = block.match(/<ul class="producto__norms"[^>]*>([\s\S]*?)<\/ul>/)?.[1] ?? '';
  assert.deepEqual([...list.matchAll(/<li class="producto__norm"[^>]*>([^<]*)<\/li>/g)].map(match => match[1]), NORMS);
  assert.ok(block.indexOf('Según la información publicada por el fabricante.') > block.indexOf('</ul>'), 'la nota va debajo de la lista');
  assert.ok(!block.includes(NORM_SOURCE) && !page.includes(NORM_SOURCE), 'la dirección de la norma no se publica');
  // Fuera de su lista, ninguna norma: ni en el título, ni en la descripción, ni en el índice de «Mi cotización», ni en
  // ninguna otra página (tarjetas, data-search del catálogo, la página del retirado), ni en un script o un JSON.
  // Se busca la parte inventada de cada norma sin distinguir mayúsculas: el texto de búsqueda va en minúsculas y sin acentos.
  const anyNorm = /SONDA-(?:C3|A1|B2|R9)/i;
  assert.doesNotMatch(page.replace(list, ''), anyNorm, 'la ficha muestra una norma fuera de «Normas»');
  for (const [path, content] of files) if (path !== 'productos/guante-con-normas/index.html') assert.doesNotMatch(content, anyNorm, path);
  for (const part of [/<title>[^<]*<\/title>/, /<meta name="description"[^>]*>/, /<script type="application\/json" data-quote-index[^>]*>[^<]*<\/script>/]) {
    assert.match(page, part);
    assert.ok(!NORMS.some(norm => page.match(part)[0].includes(norm)), String(part));
  }
  // Lo que se revisa existe: la tarjeta del catálogo con su texto de búsqueda, la otra ficha y la página del retirado.
  assert.ok((files.get('catalogo/index.html').match(/ data-search="/g) ?? []).length >= 2, 'el catálogo muestra las dos fichas con su texto de búsqueda');
  assert.ok(files.get('productos/guante-sin-normas/index.html').includes('guante-con-normas'), 'la otra ficha muestra la tarjeta de la ficha con normas');
  const retired = files.get('productos/guante-retirado-normas/index.html');
  assert.ok(retired && !retired.includes('normas-title'), 'la página del retirado no lleva «Normas»');
});

