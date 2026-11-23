// Utilidades compartidas por las pruebas. No es un archivo de pruebas: `npm test` solo ejecuta tests/*.test.mjs.
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

/** Carpeta del proyecto. */
export const ROOT = fileURLToPath(new URL('..', import.meta.url));

export const readText = path => readFile(join(ROOT, path), 'utf8');
export const readJson = async path => JSON.parse(await readText(path));

/** Los archivos de datos del proyecto, tal como están en el repositorio. */
export async function loadProjectData() {
  const [business, catalog, brands, examples, registry] = await Promise.all([
    readJson('src/data/business.json'), readJson('src/data/catalog.json'), readJson('src/data/brands.json'),
    readJson('src/data/preview/example-products.json'), readJson('research/Sercom_Active_Fuentes_Catalogos.json'),
  ]);
  return { business, catalog, brands, examples, registry };
}

/**
 * El catálogo real vaciado: las mismas categorías, todas en borrador, y ninguna ficha. Es una copia: no cambia el
 * catálogo recibido. Para las pruebas cuyo tema no son los datos reales (los ejemplos, los modos, una ficha sintética),
 * que así dan lo mismo con cualquier catálogo válido: con borradores cargados o con fichas y categorías aprobadas.
 */
export function emptiedCatalog(catalog) {
  const copy = structuredClone(catalog);
  for (const category of copy.categories) category.status = 'draft';
  copy.products = [];
  return copy;
}

// Una fecha «AAAA-MM-DD» que existe en el calendario.
const isCalendarDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
};

/**
 * Un retirado que fue público: estado `retired` con la aprobación comercial completa (quién, una fecha que existe y el
 * suministro confirmado). Está escrito aquí, aparte de `isPublicRetired` de `src/lib/catalog-policy.mjs`, a propósito:
 * lo esperado de las pruebas sobre los datos reales no puede salir de la regla que esas pruebas revisan, o un error en
 * la regla cambiaría a la vez lo esperado y lo obtenido y ninguna lo vería.
 */
const wasPublicRetired = product => product?.status === 'retired'
  && typeof product.approval?.by === 'string' && product.approval.by.trim() !== ''
  && isCalendarDate(product.approval.on) && product.approval.supplyConfirmed === true;

/**
 * Lo que cada compilación debe mostrar del catálogo real, derivado de los mismos datos (nunca una cifra escrita a mano):
 * producción muestra exactamente las categorías y las fichas `approved`; los retirados que fueron públicos solo tienen
 * su página. La vista previa suma las categorías en borrador y los ejemplos.
 */
export function publicCatalog(catalog) {
  const approvedCategoryIds = catalog.categories.filter(category => category.status === 'approved').map(category => category.id);
  const approvedProducts = catalog.products.filter(product => product.status === 'approved');
  const publicRetired = catalog.products.filter(wasPublicRetired);
  return {
    approvedCategoryIds,
    approvedProducts,
    approvedProductIds: approvedProducts.map(product => product.id),
    publicRetiredIds: publicRetired.map(product => product.id),
    /** Las fichas que no se muestran en ninguna lista: borradores, en revisión y retirados. */
    unlistedProductIds: catalog.products.filter(product => product.status !== 'approved').map(product => product.id),
  };
}

/**
 * Crea una carpeta temporal con los archivos indicados y devuelve su ruta.
 * @param {Record<string, string | Buffer>} files Rutas relativas («catalogo/index.html») y su contenido.
 */
export async function makeTree(files) {
  const directory = await mkdtemp(join(tmpdir(), 'sercom-prueba-'));
  for (const [path, content] of Object.entries(files)) {
    const target = join(directory, ...path.split('/'));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  return directory;
}

export const removeTree = directory => rm(directory, { recursive: true, force: true });

/** Rutas relativas (con «/») de todos los archivos de una carpeta. */
export async function listFiles(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(join(directory, entry.name), path));
    else files.push(path);
  }
  return files.sort();
}

/** Todas las cadenas de texto de un valor JSON, sin importar la profundidad. */
export function allStrings(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(allStrings);
  return [];
}

/** Todas las claves de un valor JSON, sin importar la profundidad. */
export function allKeys(value) {
  if (Array.isArray(value)) return value.flatMap(allKeys);
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([key, child]) => [key, ...allKeys(child)]);
  return [];
}

// --- Imágenes sintéticas, sin dependencias: un color liso o la sola cabecera del formato, con las medidas pedidas ---

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = bytes => {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
};

/**
 * Un PNG real de un color liso (RGB). `level: 0` guarda los píxeles sin comprimir: así se arma un archivo pesado.
 * @param {number} width @param {number} height
 * @param {{ color?: [number, number, number], level?: number }} [options]
 */
export function png(width, height, { color = [200, 120, 40], level = 9 } = {}) {
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x += 1) row.set(color, 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** La cabecera de un JPEG (SOI, APP0 y SOF0 con las medidas, EOI): lo que lee `imageMetadata`. */
export function jpegHeader(width, height) {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.from([0xff, 0xd9])]);
}

/** La cabecera de un WebP extendido (RIFF, WEBP y VP8X con el lienzo): lo que lee `imageMetadata`. */
export function webpHeader(width, height) {
  const vp8x = Buffer.alloc(10);
  vp8x.writeUIntLE(width - 1, 4, 3);
  vp8x.writeUIntLE(height - 1, 7, 3);
  const body = Buffer.concat([Buffer.from('WEBP'), Buffer.from('VP8X'), Buffer.from([10, 0, 0, 0]), vp8x]);
  const riff = Buffer.alloc(8);
  riff.write('RIFF', 0, 'ascii');
  riff.writeUInt32LE(body.length, 4);
  return Buffer.concat([riff, body]);
}
