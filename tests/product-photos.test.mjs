import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, symlink, truncate, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { checkProductPhotos, PHOTO_MAX_BYTES, PHOTO_MAX_SIDE, PHOTO_MIN_SIDE } from '../scripts/product-photos.mjs';
import sharp from 'sharp';
import { jpegHeader, makeTree, png, removeTree, webpHeader } from './helpers.mjs';

// La revisión de los archivos de src/assets/productos/ (scripts/product-photos.mjs), con carpetas temporales, fichas
// sintéticas e imágenes de un color liso hechas aquí con la biblioteca de imágenes de la compilación. Datos
// exclusivamente de prueba.
const solid = (width, height) => sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } } });
const jpeg = (width, height) => solid(width, height).jpeg().toBuffer();
const webp = (width, height) => solid(width, height).webp().toBuffer();
const JPEG = await jpeg(1600, 1200);
const WEBP = await webp(1200, 1200);
const product = (index, status, file) => ({ id: `test-00${index}`, status, image: { file, alt: 'Foto sintética de prueba', sourceUrl: 'https://example.invalid/origen', usageConfirmed: true } });
const catalogOf = (...products) => ({ schemaVersion: 1, categories: [], products });
const LABEL = 'src/assets/productos';

/**
 * Revisa una carpeta temporal con `files` (nombre → contenido, o 'carpeta' para una subcarpeta); con `null`, una carpeta
 * que no existe.
 */
async function check(catalog, files) {
  const directory = await makeTree({});
  const folder = join(directory, 'productos');
  try {
    if (files !== null) {
      await mkdir(folder);
      for (const [name, content] of Object.entries(files)) {
        if (content === 'carpeta') await mkdir(join(folder, name));
        else await writeFile(join(folder, name), content);
      }
    }
    return await checkProductPhotos(catalog, folder, LABEL);
  } finally {
    await removeTree(directory);
  }
}

test('los límites son los acordados: de 400 a 4000 px por el lado más largo y 1.5 MB', () => {
  assert.equal(PHOTO_MIN_SIDE, 400);
  assert.equal(PHOTO_MAX_SIDE, 4000);
  assert.equal(PHOTO_MAX_BYTES, 1_572_864);
});

test('sin carpeta, o con la carpeta vacía, no hay fotos y está bien mientras ninguna ficha aprobada nombre una', async () => {
  assert.deepEqual(await check(catalogOf(), null), []);
  assert.deepEqual(await check(catalogOf(), {}), []);
  // Un borrador puede nombrar su archivo antes de que entre a la carpeta.
  assert.deepEqual(await check(catalogOf(product(1, 'draft', 'guante-de-prueba.jpg'), product(2, 'in_review', 'casco-de-prueba.png')), null), []);
});

test('cada ficha aprobada con archivo lo tiene en la carpeta, con el nombre exacto', async () => {
  const files = { 'guante-de-prueba.jpg': JPEG, 'casco-de-prueba.png': png(900, 1500), 'lente-de-prueba.webp': WEBP };
  const catalog = catalogOf(product(1, 'approved', 'guante-de-prueba.jpg'), product(2, 'approved', 'casco-de-prueba.png'), product(3, 'approved', 'lente-de-prueba.webp'));
  assert.deepEqual(await check(catalog, files), []);
  // Dos fichas aprobadas pueden usar la misma foto.
  assert.deepEqual(await check(catalogOf(product(1, 'approved', 'guante-de-prueba.jpg'), product(2, 'approved', 'guante-de-prueba.jpg')), { 'guante-de-prueba.jpg': JPEG }), []);
  const missing = 'products[1].image.file: «casco-de-prueba.png» no está en src/assets/productos/; agrega la foto con ese nombre exacto (también las mayúsculas y minúsculas) o corrige el nombre.';
  assert.deepEqual(await check(catalogOf(product(1, 'approved', 'guante-de-prueba.jpg'), product(2, 'approved', 'casco-de-prueba.png')), { 'guante-de-prueba.jpg': JPEG }), [missing]);
  assert.deepEqual(await check(catalogOf(product(1, 'approved', 'guante-de-prueba.jpg'), product(2, 'approved', 'casco-de-prueba.png')), null), [
    'products[0].image.file: «guante-de-prueba.jpg» no está en src/assets/productos/; agrega la foto con ese nombre exacto (también las mayúsculas y minúsculas) o corrige el nombre.', missing,
  ]);
  // Otro uso de mayúsculas es otro archivo (el alojamiento las distingue), y entonces sobra.
  assert.deepEqual(await check(catalogOf(product(1, 'approved', 'guante-de-prueba.jpg')), { 'Guante-de-prueba.jpg': JPEG }), [
    'products[0].image.file: «guante-de-prueba.jpg» no está en src/assets/productos/; agrega la foto con ese nombre exacto (también las mayúsculas y minúsculas) o corrige el nombre.',
    'src/assets/productos/Guante-de-prueba.jpg: ninguna ficha aprobada usa este archivo; quita el archivo o aprueba su ficha.',
  ]);
});

test('la carpeta tiene solo fotos de fichas aprobadas: un archivo suelto, la foto de una ficha sin aprobar o una subcarpeta son un error', async () => {
  const approved = product(1, 'approved', 'guante-de-prueba.jpg');
  const base = { 'guante-de-prueba.jpg': JPEG };
  assert.deepEqual(await check(catalogOf(approved), { ...base, 'suelta.jpg': JPEG }), ['src/assets/productos/suelta.jpg: ninguna ficha aprobada usa este archivo; quita el archivo o aprueba su ficha.']);
  assert.deepEqual(await check(catalogOf(approved), { ...base, '.DS_Store': 'x' }), ['src/assets/productos/.DS_Store: ninguna ficha aprobada usa este archivo; quita el archivo o aprueba su ficha.']);
  for (const status of ['draft', 'in_review', 'retired']) {
    assert.deepEqual(await check(catalogOf(approved, product(2, status, 'casco-de-prueba.png')), { ...base, 'casco-de-prueba.png': png(900, 1500) }),
      [`src/assets/productos/casco-de-prueba.png: es la foto de products[1] (${status}), que no está aprobada; quita el archivo o aprueba su ficha.`], status);
  }
  assert.deepEqual(await check(catalogOf(approved), { ...base, viejas: 'carpeta' }), ['src/assets/productos/viejas/: es una carpeta; aquí solo van las fotos de fichas aprobadas. Quita la carpeta.']);
});

test('cada foto es una imagen real del formato de su extensión, de 400 a 4000 px por su lado más largo y de 1.5 MB como máximo', async () => {
  const at = (file, content) => check(catalogOf(product(1, 'approved', file)), { [file]: content });
  // En el límite: pasan.
  assert.deepEqual(await at('guante-de-prueba.png', png(400, 300)), []);
  assert.deepEqual(await at('guante-de-prueba.jpg', await jpeg(300, 400)), []);
  assert.deepEqual(await at('guante-de-prueba.jpeg', await jpeg(3000, 4000)), []);
  assert.deepEqual(await at('guante-de-prueba.webp', await webp(4000, 4000)), []);
  // Muy chica: 300 px, y 399 px en el borde.
  assert.deepEqual(await at('guante-de-prueba.png', png(300, 225)), ['src/assets/productos/guante-de-prueba.png: su lado más largo mide 300 px y el mínimo es 400 px; usa una foto más grande.']);
  assert.deepEqual(await at('guante-de-prueba.jpg', await jpeg(399, 399)), ['src/assets/productos/guante-de-prueba.jpg: su lado más largo mide 399 px y el mínimo es 400 px; usa una foto más grande.']);
  // Muy grande.
  assert.deepEqual(await at('guante-de-prueba.webp', await webp(1000, 4001)), ['src/assets/productos/guante-de-prueba.webp: su lado más largo mide 4001 px y el máximo es 4000 px; reduce la foto.']);
  // Muy pesada: un PNG real sin comprimir de 800 × 700.
  const heavy = png(800, 700, { level: 0 });
  assert.ok(heavy.length > PHOTO_MAX_BYTES);
  assert.deepEqual(await at('guante-de-prueba.png', heavy), [`src/assets/productos/guante-de-prueba.png: pesa ${heavy.length.toLocaleString('es-MX')} bytes y el máximo es 1,572,864 bytes (1.5 MB); guárdala con más compresión o más chica.`]);
  // Otro formato con la extensión equivocada: un PNG que se llama .jpg, un JPEG que se llama .png o .webp.
  assert.deepEqual(await at('guante-de-prueba.jpg', png(1000, 800)), ['src/assets/productos/guante-de-prueba.jpg: es una imagen PNG con la extensión .jpg; guárdala como JPEG o cambia la extensión del archivo y de image.file a .png.']);
  assert.deepEqual(await at('guante-de-prueba.png', await jpeg(1000, 800)), ['src/assets/productos/guante-de-prueba.png: es una imagen JPEG con la extensión .png; guárdala como PNG o cambia la extensión del archivo y de image.file a .jpg.']);
  assert.deepEqual(await at('guante-de-prueba.webp', png(1000, 800)), ['src/assets/productos/guante-de-prueba.webp: es una imagen PNG con la extensión .webp; guárdala como WebP o cambia la extensión del archivo y de image.file a .png.']);
  // Un GIF o algo que no es una imagen.
  const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x20, 0x03, 0x58, 0x02, 0x00, 0x00, 0x00]);
  assert.deepEqual(await at('guante-de-prueba.jpg', gif), ['src/assets/productos/guante-de-prueba.jpg: es una imagen GIF; guárdala como JPEG, PNG o WebP.']);
  assert.deepEqual(await at('guante-de-prueba.jpg', Buffer.from('no es una imagen')), ['src/assets/productos/guante-de-prueba.jpg: no es una imagen JPEG, PNG ni WebP que se pueda leer; vuelve a guardar la foto en uno de esos formatos.']);
  // Varios problemas a la vez: todos.
  assert.deepEqual(await at('guante-de-prueba.jpg', png(300, 200)), [
    'src/assets/productos/guante-de-prueba.jpg: es una imagen PNG con la extensión .jpg; guárdala como JPEG o cambia la extensión del archivo y de image.file a .png.',
    'src/assets/productos/guante-de-prueba.jpg: su lado más largo mide 300 px y el mínimo es 400 px; usa una foto más grande.',
  ]);
});

/**
 * Un JPEG real de `bytes` bytes en total: después de su marca de inicio lleva segmentos de aplicación (APP15) de relleno,
 * que la imagen no usa, así que sigue completo y se puede leer.
 */
const jpegOfSize = bytes => {
  const segments = [];
  let rest = bytes - JPEG.length;
  while (rest > 0) {
    // Cada segmento: su marca (2 bytes), su largo (2 bytes, que se cuentan) y el relleno; de 4 a 65,537 bytes. El
    // último no puede quedar de menos de 4.
    const size = rest <= 65537 ? rest : Math.min(65537, rest - 4);
    const segment = Buffer.alloc(size);
    segment.set([0xff, 0xef]);
    segment.writeUInt16BE(size - 2, 2);
    segments.push(segment);
    rest -= size;
  }
  return Buffer.concat([JPEG.subarray(0, 2), ...segments, JPEG.subarray(2)]);
};

test('el peso en su borde exacto: 1,572,864 bytes pasa y uno más no, con un mensaje cuyas dos cifras nunca son iguales', async () => {
  const at = content => check(catalogOf(product(1, 'approved', 'guante-de-prueba.jpg')), { 'guante-de-prueba.jpg': content });
  assert.equal(jpegOfSize(PHOTO_MAX_BYTES).length, 1_572_864);
  assert.deepEqual(await at(jpegOfSize(PHOTO_MAX_BYTES)), []);
  assert.deepEqual(await at(jpegOfSize(PHOTO_MAX_BYTES + 1)), ['src/assets/productos/guante-de-prueba.jpg: pesa 1,572,865 bytes y el máximo es 1,572,864 bytes (1.5 MB); guárdala con más compresión o más chica.']);
});

test('una foto cortada, o con bytes de más después de su final, no pasa, y el mensaje dice cuál de las dos', async () => {
  const at = (file, content) => check(catalogOf(product(1, 'approved', file)), { [file]: content });
  const cut = file => `src/assets/productos/${file}: está cortado: le falta el final; vuelve a bajarlo o a guardarlo.`;
  const extra = (file, bytes) => `src/assets/productos/${file}: lleva ${bytes} después del final de la imagen; ábrela y guárdala de nuevo con un editor de imágenes.`;
  const jpegEnd = file => `src/assets/productos/${file}: no termina donde termina un JPEG: está cortado o lleva datos después de la imagen; ábrela y guárdala de nuevo con un editor de imágenes, o vuelve a bajarla.`;
  // PNG sin su último bloque, o cortado en medio de un bloque; con 25 bytes o un salto de línea después de IEND.
  assert.deepEqual(await at('guante-de-prueba.png', png(800, 600).subarray(0, -12)), [cut('guante-de-prueba.png')]);
  assert.deepEqual(await at('guante-de-prueba.png', png(800, 600).subarray(0, -1)), [cut('guante-de-prueba.png')]);
  assert.deepEqual(await at('guante-de-prueba.png', png(800, 600).subarray(0, 60)), [cut('guante-de-prueba.png')]);
  assert.deepEqual(await at('guante-de-prueba.png', Buffer.concat([png(800, 600), Buffer.from('datos-de-mas-de-la-camara')])), [extra('guante-de-prueba.png', '25 bytes')]);
  assert.deepEqual(await at('guante-de-prueba.png', Buffer.concat([png(800, 600), Buffer.from('\n')])), [extra('guante-de-prueba.png', '1 byte')]);
  // WebP más corto de lo que declara, o más largo.
  const shortWebp = Buffer.from(WEBP);
  shortWebp.writeUInt32LE(shortWebp.readUInt32LE(4) + 2000, 4);
  assert.deepEqual(await at('guante-de-prueba.webp', shortWebp), [cut('guante-de-prueba.webp')]);
  assert.deepEqual(await at('guante-de-prueba.webp', WEBP.subarray(0, -6)), [cut('guante-de-prueba.webp')]);
  assert.deepEqual(await at('guante-de-prueba.webp', Buffer.concat([WEBP, Buffer.alloc(2)])), [extra('guante-de-prueba.webp', '2 bytes')]);
  // JPEG que no termina con su marca de fin: cortado o con datos después, las dos posibilidades.
  assert.deepEqual(await at('guante-de-prueba.jpg', JPEG.subarray(0, -2)), [jpegEnd('guante-de-prueba.jpg')]);
  assert.deepEqual(await at('guante-de-prueba.jpg', jpegOfSize(30000).subarray(0, 25000)), [jpegEnd('guante-de-prueba.jpg')]);
  assert.deepEqual(await at('guante-de-prueba.jpg', Buffer.concat([JPEG, Buffer.from('datos-de-mas-de-la-camara')])), [jpegEnd('guante-de-prueba.jpg')]);
  assert.deepEqual(await at('guante-de-prueba.jpg', Buffer.concat([JPEG, Buffer.from('\n')])), [jpegEnd('guante-de-prueba.jpg')]);
  // Completas: pasan.
  assert.deepEqual(await at('guante-de-prueba.jpg', jpegOfSize(30000)), []);
  assert.deepEqual(await at('guante-de-prueba.png', png(800, 600)), []);
  assert.deepEqual(await at('guante-de-prueba.webp', WEBP), []);
  // Cortada y con la extensión de otro formato: se dicen las dos cosas; el final se revisa según lo que el archivo es.
  assert.deepEqual(await at('guante-de-prueba.jpg', png(800, 600).subarray(0, 60)), [
    'src/assets/productos/guante-de-prueba.jpg: es una imagen PNG con la extensión .jpg; guárdala como JPEG o cambia la extensión del archivo y de image.file a .png.',
    cut('guante-de-prueba.jpg'),
  ]);
});

test('una foto que la compilación no puede leer no pasa, aunque su cabecera diga un formato y unas medidas', async () => {
  const at = (file, content) => check(catalogOf(product(1, 'approved', file)), { [file]: content });
  const unreadable = file => `src/assets/productos/${file}: la compilación no puede leer esta imagen; ábrela y guárdala de nuevo con un editor de imágenes.`;
  // Un WebP con un último bloque de tamaño impar sin su byte de relleno, que mide lo que declara.
  const extended = await solid(500, 500).withMetadata({ exif: { IFD0: { Copyright: 'Prueba' } } }).webp().toBuffer();
  const chunk = Buffer.alloc(8);
  chunk.write('XYZW', 0, 'latin1');
  chunk.writeUInt32LE(5, 4);
  const unpadded = Buffer.concat([extended, chunk, Buffer.from('ABCDE')]);
  unpadded.writeUInt32LE(unpadded.length - 8, 4);
  assert.deepEqual(await at('guante-de-prueba.webp', unpadded), [unreadable('guante-de-prueba.webp')]);
  // El mismo bloque con su byte de relleno: pasa.
  const padded = Buffer.concat([extended, chunk, Buffer.from('ABCDE'), Buffer.alloc(1)]);
  padded.writeUInt32LE(padded.length - 8, 4);
  assert.deepEqual(await at('guante-de-prueba.webp', padded), []);
  // Solo la cabecera de un JPEG o de un WebP, sin la imagen: su formato y sus medidas se leen, la imagen no.
  assert.deepEqual(await at('guante-de-prueba.jpg', jpegHeader(1600, 1200)), [unreadable('guante-de-prueba.jpg')]);
  assert.deepEqual(await at('guante-de-prueba.webp', webpHeader(1200, 1200)), [unreadable('guante-de-prueba.webp')]);
});

test('una animación no pasa: una foto de producto es una sola imagen', async () => {
  const at = (file, content) => check(catalogOf(product(1, 'approved', file)), { [file]: content });
  // Cuadros de 500 × 500 de colores distintos, uno debajo del otro: cada uno es un cuadro de la animación.
  const animation = frames => sharp(Buffer.concat(frames.map(value => Buffer.alloc(500 * 500 * 3, value))), { raw: { width: 500, height: 500 * frames.length, channels: 3, pageHeight: 500 } })
    .webp({ loop: 0, delay: frames.map(() => 500) }).toBuffer();
  const message = (file, frames) => `src/assets/productos/${file}: es una animación de ${frames} cuadros; una foto de producto es una sola imagen: guarda un solo cuadro.`;
  assert.deepEqual(await at('guante-de-prueba.webp', await animation([40, 220])), [message('guante-de-prueba.webp', 2)]);
  assert.deepEqual(await at('guante-de-prueba.webp', await animation([40, 130, 220])), [message('guante-de-prueba.webp', 3)]);
  // Un solo cuadro: pasa.
  assert.deepEqual(await at('guante-de-prueba.webp', await animation([40])), []);
});

test('un enlace simbólico en la carpeta, o una carpeta que no es carpeta, se informan con un mensaje y nunca detienen la revisión', async () => {
  const approved = catalogOf(product(1, 'approved', 'guante-de-prueba.jpg'));
  const link = 'src/assets/productos/guante-de-prueba.jpg: es un enlace; copia aquí la foto en lugar de enlazarla.';
  // Arma la carpeta con `setup(folder, directory)` y la revisa.
  async function checkWith(catalog, setup) {
    const directory = await makeTree({ 'fuera/guante.jpg': JPEG });
    const folder = join(directory, 'productos');
    try {
      await setup(folder, directory);
      return await checkProductPhotos(catalog, folder, LABEL);
    } finally {
      await removeTree(directory);
    }
  }
  // Un enlace a un archivo de fuera, aunque sea una foto válida; uno roto; uno a una carpeta.
  assert.deepEqual(await checkWith(approved, async (folder, directory) => { await mkdir(folder); await symlink(join(directory, 'fuera', 'guante.jpg'), join(folder, 'guante-de-prueba.jpg')); }), [link]);
  assert.deepEqual(await checkWith(approved, async (folder, directory) => { await mkdir(folder); await symlink(join(directory, 'no-existe.jpg'), join(folder, 'guante-de-prueba.jpg')); }), [link]);
  assert.deepEqual(await checkWith(approved, async (folder, directory) => { await mkdir(folder); await symlink(join(directory, 'fuera'), join(folder, 'guante-de-prueba.jpg')); }), [link]);
  assert.deepEqual(await checkWith(catalogOf(), async (folder, directory) => { await mkdir(folder); await symlink(join(directory, 'fuera'), join(folder, 'viejas')); }),
    ['src/assets/productos/viejas: es un enlace; copia aquí la foto en lugar de enlazarla.']);
  // La carpeta es un archivo, o es un enlace a otra carpeta.
  const missing = 'products[0].image.file: «guante-de-prueba.jpg» no está en src/assets/productos/; agrega la foto con ese nombre exacto (también las mayúsculas y minúsculas) o corrige el nombre.';
  assert.deepEqual(await checkWith(catalogOf(), async folder => { await writeFile(folder, 'x'); }),
    ['src/assets/productos: es un archivo y debe ser una carpeta; quita el archivo y guarda las fotos en una carpeta con ese nombre.']);
  assert.deepEqual(await checkWith(approved, async folder => { await writeFile(folder, 'x'); }),
    ['src/assets/productos: es un archivo y debe ser una carpeta; quita el archivo y guarda las fotos en una carpeta con ese nombre.', missing]);
  assert.deepEqual(await checkWith(approved, async (folder, directory) => { await symlink(join(directory, 'fuera'), folder); }),
    ['src/assets/productos: es un enlace a otra carpeta; guarda las fotos en la carpeta misma, sin enlazarla.', missing]);
});

test('un archivo o una carpeta que no se pueden leer dan un mensaje y nunca detienen la revisión', async () => {
  const directory = await makeTree({ 'no-es-carpeta': 'x' });
  try {
    // Más de 2 GiB (un archivo disperso, que no ocupa el disco): la lectura falla con el archivo en su lugar.
    const folder = join(directory, 'productos');
    await mkdir(folder);
    await writeFile(join(folder, 'guante-de-prueba.jpg'), '');
    await truncate(join(folder, 'guante-de-prueba.jpg'), 2 ** 31);
    assert.deepEqual(await checkProductPhotos(catalogOf(product(1, 'approved', 'guante-de-prueba.jpg')), folder, LABEL),
      ['src/assets/productos/guante-de-prueba.jpg: no se pudo leer el archivo; revisa que se pueda abrir y vuelve a guardarlo.']);
    // Una carpeta dentro de un archivo: no se puede ni mirar; la ficha aprobada sigue pidiendo su foto.
    assert.deepEqual(await checkProductPhotos(catalogOf(product(1, 'approved', 'guante-de-prueba.jpg')), join(directory, 'no-es-carpeta', 'productos'), LABEL), [
      'src/assets/productos: no se pudo leer la carpeta; revisa que se pueda abrir.',
      'products[0].image.file: «guante-de-prueba.jpg» no está en src/assets/productos/; agrega la foto con ese nombre exacto (también las mayúsculas y minúsculas) o corrige el nombre.',
    ]);
  } finally {
    await removeTree(directory);
  }
});

test('una ficha aprobada sin foto no pide ningún archivo, y la carpeta puede no existir', async () => {
  const bare = { id: 'test-001', status: 'approved' };
  assert.deepEqual(await check(catalogOf(bare), null), []);
  assert.deepEqual(await check(catalogOf(bare), {}), []);
  // Junto a una ficha aprobada con foto: solo se pide ese archivo.
  const withPhoto = product(2, 'approved', 'guante-de-prueba.jpg');
  assert.deepEqual(await check(catalogOf(bare, withPhoto), { 'guante-de-prueba.jpg': JPEG }), []);
  assert.deepEqual(await check(catalogOf(bare, withPhoto), null), ['products[1].image.file: «guante-de-prueba.jpg» no está en src/assets/productos/; agrega la foto con ese nombre exacto (también las mayúsculas y minúsculas) o corrige el nombre.']);
  // Un archivo en la carpeta sigue siendo de más si ninguna ficha aprobada lo nombra.
  assert.deepEqual(await check(catalogOf(bare), { 'guante-de-prueba.jpg': JPEG }), ['src/assets/productos/guante-de-prueba.jpg: ninguna ficha aprobada usa este archivo; quita el archivo o aprueba su ficha.']);
});

test('una ficha con foto por dirección o un catálogo mal formado no hacen fallar la revisión de la carpeta', async () => {
  const remote = { id: 'test-001', status: 'approved', image: { url: 'https://example.invalid/foto.jpg', width: 1600, height: 1200, alt: 'Foto sintética de prueba', sourceUrl: 'https://example.invalid/origen', usageConfirmed: true } };
  assert.deepEqual(await check(catalogOf(remote), {}), []);
  for (const catalog of [null, {}, { products: 'x' }, catalogOf(null, { image: null }, { image: { file: 7 } })]) assert.deepEqual(await check(catalog, {}), [], JSON.stringify(catalog));
});
