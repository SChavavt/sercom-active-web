import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { checkLinks, isLocalHost, RULE_ID } from '../scripts/check-links.mjs';
import { makeTree, removeTree, ROOT } from './helpers.mjs';

const page = (body = '', head = '') => `<!doctype html><html lang="es-MX"><head><meta charset="UTF-8"><title>Prueba</title>${head}</head><body><a href="#contenido">Saltar al contenido</a><main id="contenido">${body}</main></body></html>`;
// Carpeta de un equipo de compilación imaginario; no debe aparecer en la salida.
const BUILD_FOLDER = '/home/equipo/proyectos/sitio-de-prueba';

/** Revisa un sitio temporal. `files` se suma a una portada mínima. */
async function check(files = {}, options = {}) {
  const directory = await makeTree({ 'index.html': page('<h1>Inicio</h1>'), ...files });
  try {
    return await checkLinks(directory, { localPaths: [BUILD_FOLDER], ...options });
  } finally {
    await removeTree(directory);
  }
}
const kinds = result => result.problems.map(problem => problem.kind).sort();
/** Cada fragmento, puesto en una página, debe producir exactamente un problema de ese tipo. */
async function assertEach(kind, bodies, files = {}) {
  for (const body of bodies) {
    const result = await check({ ...files, 'pagina/index.html': page(body) });
    assert.deepEqual(kinds(result), [kind], `${body} → ${JSON.stringify(result.problems.map(problem => problem.message))}`);
    assert.equal(result.problems[0].id, 'R-RULE-30');
    assert.equal(result.problems[0].file, 'pagina/index.html');
  }
}
async function assertClean(bodies, files = {}) {
  for (const body of bodies) {
    const result = await check({ ...files, 'pagina/index.html': page(body) });
    assert.deepEqual(result.problems, [], body);
  }
}

const SITE = {
  'catalogo/index.html': page('<h1 id="titulo">Catálogo</h1><section id="filtros">Filtros</section><a name="ancla-antigua"></a><h2 id="señalización">Señalización</h2>'),
  'marcas/index.html': page('<h1>Marcas</h1>'),
  '404.html': page('<h1>No encontramos esa página</h1><a href="/">Ir al inicio</a>'),
  '_astro/sitio.abc123.css': 'body{background:url(/fondo.svg)}.logo{background:url("../logo.svg")}',
  '_astro/buscar.abc123.js': 'document.querySelector("#contenido");',
  'logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"><symbol id="marca"><title>Sercom Active</title></symbol></svg>',
  'fondo.svg': '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
  'imágenes/logo nuevo.svg': '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
  'robots.txt': 'User-agent: *\nDisallow: /\n',
};

test('un sitio con enlaces correctos no tiene problemas', async () => {
  const result = await check({
    ...SITE,
    'index.html': page(`
      <a href="/">Inicio</a> <a href="/catalogo/">Catálogo</a> <a href="/catalogo/?q=guante%2037-175">Buscar</a> <a href="/catalogo/#filtros">Filtros</a>
      <a href="/catalogo/index.html">Archivo</a> <a href="catalogo/">Relativo</a> <a href="./marcas/">Relativo</a> <a href="#top">Arriba</a> <a href="?q=casco">Consulta</a>
      <a href="/catalogo/#ancla-antigua">Ancla</a> <a href="/catalogo/#se%C3%B1alizaci%C3%B3n">Ancla con acento</a> <a href="/catalogo/#:~:text=Filtros">Texto</a>
      <a href="https://www.ansell.com/mx/es/industrial">Sitio del fabricante</a> <a href="https://wa.me/5212214002219?text=Hola">WhatsApp</a>
      <a href="mailto:ventas.puebla@sercomactive.com?subject=Hola">Correo</a> <a href="tel:+5212214002219">Teléfono</a>
      <a aria-current="page">Inicio</a> <a id="marcador"></a>
      <img src="/logo.svg" alt="Sercom Active" srcset="/logo.svg 1x, /fondo.svg 2x"> <img src="/im%C3%A1genes/logo%20nuevo.svg" alt="">
      <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt=""> <svg><use href="/logo.svg#marca"></use><use href="#icono"></use><symbol id="icono"></symbol></svg>
      <video poster="/fondo.svg"></video> <form action="/catalogo/" method="get"><input name="q"></form> <form action=""><input name="q"></form>
      <p style="background:url('/fondo.svg')">Fondo</p>`,
    '<link rel="stylesheet" href="/_astro/sitio.abc123.css"><script type="module" src="/_astro/buscar.abc123.js"></script><link rel="icon" href="/logo.svg"><meta property="og:image" content="/logo.svg"><style>h1{background:url(/fondo.svg);filter:url(#sombra)}</style>'),
  });
  assert.deepEqual(result.problems, []);
  assert.equal(result.pages, 4);
  assert.equal(result.files, 10);
  assert.equal(result.external, 2);
  assert.equal(result.other, 3);
  assert.ok(result.internal >= 25);
});

test('una página a la que nada enlaza no es un problema: así es la de un producto retirado', async () => {
  // Nada del sitio enlaza a la página de un retirado (R-STATE-04); se llega con la dirección guardada. Sus propios
  // enlaces sí se revisan.
  const retired = page('<h1>Producto de prueba retirado</h1><a href="/catalogo/">Catálogo</a><a href="https://wa.me/5212214002219?text=Hola">Consultar alternativas</a>');
  const result = await check({ ...SITE, 'productos/retirado/index.html': retired });
  assert.deepEqual(result.problems, []);
  assert.equal(result.pages, 5);
  const broken = await check({ ...SITE, 'productos/retirado/index.html': retired.replace('/catalogo/', '/catalogo-antiguo/') });
  assert.deepEqual(broken.problems.map(problem => [problem.kind, problem.file]), [['roto', 'productos/retirado/index.html']]);
});

test('enlaces y recursos internos sin destino', async () => {
  await assertEach('roto', [
    '<a href="/no-existe/">Página</a>', '<a href="/catalogo/guante/">Producto</a>', '<a href="no-existe/">Relativo</a>', '<a href="/Catalogo/">Mayúscula</a>',
    '<img src="/no-existe.png" alt="">', '<img src="/logo.svg" srcset="/logo.svg 1x, /no-existe@2x.png 2x" alt="">', '<script src="/_astro/no-existe.js"></script>',
    '<link rel="stylesheet" href="/_astro/no-existe.css">', '<video poster="/no-existe.jpg"></video>', '<form action="/buscar/"><input name="q"></form>',
    '<p style="background:url(/no-existe.svg)">Fondo</p>', '<style>.a{background:url("/no-existe.svg")}</style>', '<meta http-equiv="refresh" content="0; url=/no-existe/">',
    '<meta property="og:image" content="/no-existe.png">', '<a href="/catalogo/?q=guante#filtros">Bien</a><a href="/catalogo.html">Mal</a>',
    '<a href="/im%E1genes/">Codificación inválida</a>', '<object data="/no-existe.pdf"></object>', '<a href="/404">Sin extensión</a>',
  ], SITE);
  const css = await check({ ...SITE, '_astro/otra.css': '.a{background:url(../no-existe.svg)}@import "no-existe.css";' });
  assert.deepEqual(css.problems.map(problem => [problem.file, problem.kind]), [['_astro/otra.css', 'roto'], ['_astro/otra.css', 'roto']]);
});

test('una dirección que empieza con «//» no es interna ni externa: es un error al unir rutas', async () => {
  // «'/' + routes.catalog» da «//catalogo/», que el navegador abre en el servidor «catalogo».
  await assertEach('roto', [
    '<a href="//catalogo/">Catálogo</a>', '<a href="//marcas/ansell/">Ansell</a>', '<img src="//logo.svg" alt="">', '<img src="/logo.svg" srcset="//logo.svg 2x" alt="">',
    '<link rel="stylesheet" href="//_astro/sitio.abc123.css">', '<p style="background:url(//fondo.svg)">Fondo</p>', '<form action="//catalogo/"><input name="q"></form>',
  ], SITE);
  const result = await check({ ...SITE, 'pagina/index.html': page('<a href="//catalogo/">Catálogo</a>') });
  assert.match(result.problems[0].message, /«\/\/» al inicio/);
  // Con esquema explícito sigue siendo un enlace externo, y «//localhost» sigue siendo local.
  await assertClean(['<a href="https://catalogo.example/">Externo</a>'], SITE);
  await assertEach('local', ['<a href="//localhost:4321/">Local</a>'], SITE);
});

test('las direcciones de image-set() también se revisan', async () => {
  await assertEach('roto', [
    '<style>.a{background-image:image-set("/no-existe.png" 1x, "/logo.svg" 2x)}</style>', '<style>.a{background-image:-webkit-image-set(\'/no-existe.png\' 1x)}</style>',
    '<p style="background-image:image-set(&quot;/no-existe.png&quot; 1x)">Fondo</p>', '<style>.a{background-image:image-set(url("/no-existe.png") 1x, "/logo.svg" 2x)}</style>',
  ], SITE);
  const css = await check({ ...SITE, '_astro/otra.css': '.a{background:image-set("../no-existe.png" 1x,"/logo.svg" type("image/svg+xml") 2x)}' });
  assert.deepEqual(css.problems.map(problem => [problem.file, problem.kind, problem.target]), [['_astro/otra.css', 'roto', '../no-existe.png']]);
  await assertClean(['<style>.a{background-image:image-set("/logo.svg" 1x, "/fondo.svg" 2x)}</style>'], SITE);
});

test('una página se enlaza con su diagonal final', async () => {
  await assertEach('diagonal', ['<a href="/catalogo">Catálogo</a>', '<a href="/catalogo?q=guante">Buscar</a>', '<a href="/catalogo#filtros">Filtros</a>', '<a href="../marcas">Marcas</a>'], SITE);
  const result = await check({ ...SITE, 'pagina/index.html': page('<a href="/catalogo">Catálogo</a>') });
  assert.match(result.problems[0].message, /<a href> "\/catalogo": falta la diagonal final; la página es \/catalogo\//);
});

test('cada #ancla debe existir en la página de destino', async () => {
  await assertEach('ancla', [
    '<a href="#no-existe">Ancla</a>', '<a href="/catalogo/#no-existe">Ancla</a>', '<a href="/catalogo/#Filtros">Mayúscula</a>', '<a href="/#filtros">Otra página</a>',
    '<svg><use href="/logo.svg#no-existe"></use></svg>', '<svg><use xlink:href="#icono-perdido"></use></svg>',
    // Un id escrito dentro de un script o de un comentario no es un elemento de la página.
    '<a href="#fantasma">Ancla</a><script>var html=\'<div id="fantasma"></div>\';</script><!-- <div id="fantasma"></div> -->',
  ], SITE);
  await assertClean(['<a href="#contenido">Bien</a>', '<a href="/catalogo/#titulo">Bien</a>', '<h2 id="con espacio">x</h2><a href="#con%20espacio">Bien</a>', '<a href="#TOP">Arriba</a>'], SITE);
  const result = await check({ ...SITE, 'pagina/index.html': page('<a href="/catalogo/#no-existe">Ancla</a>') });
  assert.match(result.problems[0].message, /no existe id="no-existe" en \/catalogo\/index\.html/);
});

test('enlaces vacíos, inertes o sin href', async () => {
  await assertEach('vacio', ['<a href="">Vacío</a>', '<a href="#">Inerte</a>', '<a class="boton">Sin href</a>', '<a href=" ">Espacio</a>', '<img src="" alt="">', '<a href>Sin valor</a>']);
  await assertEach('javascript', ['<a href="javascript:void(0)">Abrir</a>', '<a href="JavaScript:abrir()">Abrir</a>']);
  await assertClean(['<a aria-current="page">Página actual</a>', '<a aria-disabled="true">Deshabilitado</a>', '<a id="marcador"></a>', '<a name="marcador"></a>', '<button type="button">Abrir menú</button>']);
});

test('nada apunta al equipo local, a una red privada ni a una ruta de archivo', async () => {
  await assertEach('local', [
    '<a href="http://localhost:4321/catalogo/">Catálogo</a>', '<a href="http://127.0.0.1:3000/">Inicio</a>', '<img src="//localhost/logo.svg" alt="">',
    '<a href="http://0.0.0.0:8080/">Inicio</a>', '<a href="http://[::1]:4321/">Inicio</a>', '<a href="https://192.168.1.20/catalogo/">Red local</a>',
    '<a href="http://sitio.localhost/">Inicio</a>', '<a href="http://10.0.0.5/">Red local</a>', '<a href="http://equipo.local/">Red local</a>',
    '<a href="file:///home/equipo/dist/index.html">Archivo</a>', '<img src="C:\\Users\\equipo\\logo.png" alt="">', '<img src="..\\img\\logo.png" alt="">',
    '<img src="/@fs/home/equipo/proyecto/src/logo.png" alt="">', '<script src="/src/scripts/buscar.ts"></script>', '<link rel="stylesheet" href="/node_modules/paquete/estilo.css">',
    `<img src="${BUILD_FOLDER}/public/logo.svg" alt="">`, `<p data-archivo="${BUILD_FOLDER}/src/pages/index.astro">Texto</p>`,
    '<script>fetch("http://localhost:4321/api")</script>', '<script>const origen = "file:///home/equipo/dist/";</script>',
  ]);
  for (const [path, content] of [
    ['_astro/app.js', 'const api="http://localhost:3000/api";'], ['_astro/app.js', 'new WebSocket("ws://127.0.0.1:24678")'], ['datos.json', '{"url":"http://localhost:4321/"}'],
    ['_astro/app.js', `const origen="${BUILD_FOLDER}/src/lib/site-data.mjs";`], ['_astro/sitio.css', '.a{background:url(http://localhost:4321/fondo.svg)}'],
    ['_astro/app.js.map', '{"sources":["file:///home/equipo/proyecto/src/app.js"]}'],
  ]) {
    assert.deepEqual(kinds(await check({ [path]: content })), ['local'], path);
  }
  // Mencionar la palabra en un texto no es un enlace.
  await assertClean(['<p>Para desarrollo se usa localhost; no se publica.</p>', '<a href="https://www.localhost-tools.example/">Externo</a>', '<a href="https://172.32.0.1.example/">Externo</a>']);
  assert.deepEqual([isLocalHost('localhost'), isLocalHost('[::1]'), isLocalHost('172.16.0.1'), isLocalHost('172.32.0.1'), isLocalHost('www.ansell.com'), isLocalHost('wa.me')], [true, true, true, false, false, false]);
});

test('la página 404 solo usa rutas que empiezan con «/»', async () => {
  const relative = await check({ ...SITE, '404.html': page('<a href="catalogo/">Catálogo</a><img src="logo.svg" alt="">') });
  assert.deepEqual(relative.problems.map(problem => [problem.file, problem.kind]), [['404.html', 'roto'], ['404.html', 'roto']]);
  assert.match(relative.problems[0].message, /la página 404 se muestra en cualquier dirección/);
  assert.deepEqual((await check({ ...SITE, '404.html': page('<a href="/catalogo/">Catálogo</a><img src="/logo.svg" alt=""><a href="#contenido">Contenido</a>') })).problems, []);
});

test('<base href> impide comprobar los enlaces relativos', async () => {
  const result = await check({ 'pagina/index.html': page('<a href="/">Inicio</a>', '<base href="/otra/">') });
  assert.deepEqual(kinds(result), ['base']);
});

test('con --site los enlaces absolutos del propio sitio se revisan como internos', async () => {
  const files = { ...SITE, 'pagina/index.html': page('<a href="https://catalogo.example/catalogo/">Catálogo</a><a href="https://catalogo.example/no-existe/">Rota</a>', '<link rel="canonical" href="https://catalogo.example/pagina/">') };
  const unknown = await check(files);
  assert.deepEqual(unknown.problems, []);
  assert.equal(unknown.external, 3);
  const known = await check(files, { site: 'https://catalogo.example' });
  assert.deepEqual(known.problems.map(problem => [problem.kind, problem.target]), [['roto', 'https://catalogo.example/no-existe/']]);
  assert.equal(known.external, 0);
  await assert.rejects(check(files, { site: 'no es una dirección' }), /--site no es una dirección válida/);
});

test('línea de comandos: informe claro y código de salida', async () => {
  const cli = (...args) => spawnSync(process.execPath, ['scripts/check-links.mjs', ...args], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, SITE_URL: '' } });
  const clean = await makeTree({ ...SITE, 'index.html': page('<a href="/catalogo/">Catálogo</a>') });
  const broken = await makeTree({ ...SITE, 'index.html': page('<a href="/catalogo">Catálogo</a><a href="/no-existe/">Rota</a><a href="#nada">Ancla</a><a href="http://localhost:4321/">Local</a>') });
  const empty = await makeTree({ 'robots.txt': 'User-agent: *\nDisallow: /\n' });
  try {
    const ok = cli(clean);
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(ok.stdout, /4 páginas HTML, \d+ referencias internas revisadas, 0 con problemas\./);
    assert.match(ok.stdout, /No se consultaron 0 enlaces externos/);
    const bad = cli(broken);
    assert.equal(bad.status, 1);
    const lines = bad.stdout.split('\n').filter(line => line.startsWith('FAIL'));
    assert.equal(lines.length, 4);
    for (const line of lines) assert.match(line, /^FAIL {2}R-RULE-30 {2}index\.html {2}<a href> "/);
    assert.match(bad.stdout, /falta la diagonal final; la página es \/catalogo\//);
    assert.match(bad.stdout, /no existe \/no-existe\/index\.html en la compilación/);
    assert.match(bad.stdout, /no existe id="nada" en \/index\.html/);
    assert.match(bad.stdout, /apunta al equipo o a la red local \(localhost:4321\)/);
    assert.match(bad.stdout, /4 con problemas\./);
    assert.equal(cli(empty).status, 2);
    assert.equal(cli(`${clean}-no-existe`).status, 2);
    assert.equal(cli(clean, '--otra-opcion').status, 2);
    assert.equal(cli(clean, '--site=no es una dirección').status, 2);
    assert.equal(cli(clean, '--site=https://catalogo.example').status, 0);
    assert.equal(RULE_ID, 'R-RULE-30');
  } finally {
    await Promise.all([clean, broken, empty].map(removeTree));
  }
});
