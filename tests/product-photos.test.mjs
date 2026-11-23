import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { checkProductPhotos, PHOTO_MAX_BYTES, PHOTO_MAX_SIDE, PHOTO_MIN_SIDE } from '../scripts/product-photos.mjs';
import { jpegHeader, makeTree, png, removeTree, webpHeader } from './helpers.mjs';

// La revisión de los archivos de src/assets/productos/ (scripts/product-photos.mjs), con carpetas temporales y fichas
// sintéticas. Datos exclusivamente de prueba.
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
  const files = { 'guante-de-prueba.jpg': jpegHeader(1600, 1200), 'casco-de-prueba.png': png(900, 1500), 'lente-de-prueba.webp': webpHeader(1200, 1200) };
  const catalog = catalogOf(product(1, 'approved', 'guante-de-prueba.jpg'), product(2, 'approved', 'casco-de-prueba.png'), product(3, 'approved', 'lente-de-prueba.webp'));
  assert.deepEqual(await check(catalog, files), []);
  // Dos fichas aprobadas pueden usar la misma foto.
  assert.deepEqual(await check(catalogOf(product(1, 'approved', 'guante-de-prueba.jpg'), product(2, 'approved', 'guante-de-prueba.jpg')), { 'guante-de-prueba.jpg': jpegHeader(1600, 1200) }), []);
  const missing = 'products[1].image.file: «casco-de-prueba.png» no está en src/assets/productos/; agrega la foto con ese nombre exacto (también las mayúsculas y minúsculas) o corrige el nombre.';
  assert.deepEqual(await check(catalogOf(product(1, 'approved', 'guante-de-prueba.jpg'), product(2, 'approved', 'casco-de-prueba.png')), { 'guante-de-prueba.jpg': jpegHeader(1600, 1200) }), [missing]);
  assert.deepEqual(await check(catalogOf(product(1, 'approved', 'guante-de-prueba.jpg'), product(2, 'approved', 'casco-de-prueba.png')), null), [
    'products[0].image.file: «guante-de-prueba.jpg» no está en src/assets/productos/; agrega la foto con ese nombre exacto (también las mayúsculas y minúsculas) o corrige el nombre.', missing,
  ]);
  // Otro uso de mayúsculas es otro archivo (el alojamiento las distingue), y entonces sobra.
  assert.deepEqual(await check(catalogOf(product(1, 'approved', 'guante-de-prueba.jpg')), { 'Guante-de-prueba.jpg': jpegHeader(1600, 1200) }), [
    'products[0].image.file: «guante-de-prueba.jpg» no está en src/assets/productos/; agrega la foto con ese nombre exacto (también las mayúsculas y minúsculas) o corrige el nombre.',
    'src/assets/productos/Guante-de-prueba.jpg: ninguna ficha aprobada usa este archivo; quita el archivo o aprueba su ficha.',
  ]);
});

test('la carpeta tiene solo fotos de fichas aprobadas: un archivo suelto, la foto de una ficha sin aprobar o una subcarpeta son un error', async () => {
  const approved = product(1, 'approved', 'guante-de-prueba.jpg');
  const base = { 'guante-de-prueba.jpg': jpegHeader(1600, 1200) };
  assert.deepEqual(await check(catalogOf(approved), { ...base, 'suelta.jpg': jpegHeader(1600, 1200) }), ['src/assets/productos/suelta.jpg: ninguna ficha aprobada usa este archivo; quita el archivo o aprueba su ficha.']);
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
  assert.deepEqual(await at('guante-de-prueba.jpg', jpegHeader(300, 400)), []);
  assert.deepEqual(await at('guante-de-prueba.jpeg', jpegHeader(3000, 4000)), []);
  assert.deepEqual(await at('guante-de-prueba.webp', webpHeader(4000, 4000)), []);
  // Muy chica: 300 px, y 399 px en el borde.
  assert.deepEqual(await at('guante-de-prueba.png', png(300, 225)), ['src/assets/productos/guante-de-prueba.png: su lado más largo mide 300 px y el mínimo es 400 px; usa una foto más grande.']);
  assert.deepEqual(await at('guante-de-prueba.jpg', jpegHeader(399, 399)), ['src/assets/productos/guante-de-prueba.jpg: su lado más largo mide 399 px y el mínimo es 400 px; usa una foto más grande.']);
  // Muy grande.
  assert.deepEqual(await at('guante-de-prueba.webp', webpHeader(1000, 4001)), ['src/assets/productos/guante-de-prueba.webp: su lado más largo mide 4001 px y el máximo es 4000 px; reduce la foto.']);
  // Muy pesada: un PNG real sin comprimir de 800 × 700.
  const heavy = png(800, 700, { level: 0 });
  assert.ok(heavy.length > PHOTO_MAX_BYTES);
  assert.deepEqual(await at('guante-de-prueba.png', heavy), [`src/assets/productos/guante-de-prueba.png: pesa ${heavy.length.toLocaleString('es-MX')} bytes y el máximo es 1,572,864 bytes (1.5 MB); guárdala con más compresión o más chica.`]);
  // Otro formato con la extensión equivocada: un PNG que se llama .jpg, un JPEG que se llama .png o .webp.
  assert.deepEqual(await at('guante-de-prueba.jpg', png(1000, 800)), ['src/assets/productos/guante-de-prueba.jpg: es una imagen PNG con la extensión .jpg; guárdala como JPEG o cambia la extensión del archivo y de image.file a .png.']);
  assert.deepEqual(await at('guante-de-prueba.png', jpegHeader(1000, 800)), ['src/assets/productos/guante-de-prueba.png: es una imagen JPEG con la extensión .png; guárdala como PNG o cambia la extensión del archivo y de image.file a .jpg.']);
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

/** Un JPEG de cabecera de `bytes` bytes en total: relleno antes de su marca de fin, así que sigue completo. */
const jpegOfSize = bytes => {
  const header = jpegHeader(1600, 1200);
  return Buffer.concat([header.subarray(0, -2), Buffer.alloc(bytes - header.length), header.subarray(-2)]);
};

test('el peso en su borde exacto: 1,572,864 bytes pasa y uno más no, con un mensaje cuyas dos cifras nunca son iguales', async () => {
  const at = content => check(catalogOf(product(1, 'approved', 'guante-de-prueba.jpg')), { 'guante-de-prueba.jpg': content });
  assert.equal(jpegOfSize(PHOTO_MAX_BYTES).length, 1_572_864);
  assert.deepEqual(await at(jpegOfSize(PHOTO_MAX_BYTES)), []);
  assert.deepEqual(await at(jpegOfSize(PHOTO_MAX_BYTES + 1)), ['src/assets/productos/guante-de-prueba.jpg: pesa 1,572,865 bytes y el máximo es 1,572,864 bytes (1.5 MB); guárdala con más compresión o más chica.']);
});

test('una foto cortada no pasa: el archivo termina como dice su formato', async () => {
  const at = (file, content) => check(catalogOf(product(1, 'approved', file)), { [file]: content });
  const cut = file => `src/assets/productos/${file}: el archivo está incompleto o dañado; vuelve a guardarlo o a descargarlo.`;
  // JPEG sin su marca de fin, PNG sin su último bloque y WebP más corto de lo que declara.
  assert.deepEqual(await at('guante-de-prueba.jpg', jpegHeader(1600, 1200).subarray(0, -2)), [cut('guante-de-prueba.jpg')]);
  assert.deepEqual(await at('guante-de-prueba.jpg', jpegOfSize(3000).subarray(0, 2500)), [cut('guante-de-prueba.jpg')]);
  assert.deepEqual(await at('guante-de-prueba.png', png(800, 600).subarray(0, 40)), [cut('guante-de-prueba.png')]);
  assert.deepEqual(await at('guante-de-prueba.png', png(800, 600).subarray(0, -1)), [cut('guante-de-prueba.png')]);
  const shortWebp = webpHeader(1200, 1200);
  shortWebp.writeUInt32LE(shortWebp.readUInt32LE(4) + 2000, 4);
  assert.deepEqual(await at('guante-de-prueba.webp', shortWebp), [cut('guante-de-prueba.webp')]);
  // Con bytes de más después del final también.
  assert.deepEqual(await at('guante-de-prueba.webp', Buffer.concat([webpHeader(1200, 1200), Buffer.alloc(2)])), [cut('guante-de-prueba.webp')]);
  // Completas: pasan.
  assert.deepEqual(await at('guante-de-prueba.jpg', jpegOfSize(3000)), []);
  assert.deepEqual(await at('guante-de-prueba.png', png(800, 600)), []);
  assert.deepEqual(await at('guante-de-prueba.webp', webpHeader(1200, 1200)), []);
  // Cortada y con la extensión de otro formato: se dicen las dos cosas; el final se revisa según lo que el archivo es.
  assert.deepEqual(await at('guante-de-prueba.jpg', png(800, 600).subarray(0, 40)), [
    'src/assets/productos/guante-de-prueba.jpg: es una imagen PNG con la extensión .jpg; guárdala como JPEG o cambia la extensión del archivo y de image.file a .png.',
    cut('guante-de-prueba.jpg'),
  ]);
});

test('un enlace simbólico en la carpeta, o una carpeta que no es carpeta, se informan con un mensaje y nunca detienen la revisión', async () => {
  const approved = catalogOf(product(1, 'approved', 'guante-de-prueba.jpg'));
  const link = 'src/assets/productos/guante-de-prueba.jpg: es un enlace; copia aquí la foto en lugar de enlazarla.';
  // Arma la carpeta con `setup(folder, directory)` y la revisa.
  async function checkWith(catalog, setup) {
    const directory = await makeTree({ 'fuera/guante.jpg': jpegHeader(1600, 1200) });
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

test('una ficha aprobada sin foto no pide ningún archivo, y la carpeta puede no existir', async () => {
  const bare = { id: 'test-001', status: 'approved' };
  assert.deepEqual(await check(catalogOf(bare), null), []);
  assert.deepEqual(await check(catalogOf(bare), {}), []);
  // Junto a una ficha aprobada con foto: solo se pide ese archivo.
  const withPhoto = product(2, 'approved', 'guante-de-prueba.jpg');
  assert.deepEqual(await check(catalogOf(bare, withPhoto), { 'guante-de-prueba.jpg': jpegHeader(1600, 1200) }), []);
  assert.deepEqual(await check(catalogOf(bare, withPhoto), null), ['products[1].image.file: «guante-de-prueba.jpg» no está en src/assets/productos/; agrega la foto con ese nombre exacto (también las mayúsculas y minúsculas) o corrige el nombre.']);
  // Un archivo en la carpeta sigue siendo de más si ninguna ficha aprobada lo nombra.
  assert.deepEqual(await check(catalogOf(bare), { 'guante-de-prueba.jpg': jpegHeader(1600, 1200) }), ['src/assets/productos/guante-de-prueba.jpg: ninguna ficha aprobada usa este archivo; quita el archivo o aprueba su ficha.']);
});

test('una ficha con foto por dirección o un catálogo mal formado no hacen fallar la revisión de la carpeta', async () => {
  const remote = { id: 'test-001', status: 'approved', image: { url: 'https://example.invalid/foto.jpg', width: 1600, height: 1200, alt: 'Foto sintética de prueba', sourceUrl: 'https://example.invalid/origen', usageConfirmed: true } };
  assert.deepEqual(await check(catalogOf(remote), {}), []);
  for (const catalog of [null, {}, { products: 'x' }, catalogOf(null, { image: null }, { image: { file: 7 } })]) assert.deepEqual(await check(catalog, {}), [], JSON.stringify(catalog));
});
