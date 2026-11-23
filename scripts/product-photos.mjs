// Revisión de los archivos de las fotografías de producto (src/assets/productos/). La hace el validador
// (`npm run validate:catalog`, scripts/validate-catalog.mjs) porque necesita el disco: el código de src/ no lo lee.
// La forma de `image` en cada ficha la revisa `validateCatalog` (src/lib/catalog-policy.mjs); aquí, los archivos.
//
// Reglas:
//   1. Cada ficha `approved` con `image.file` tiene ese archivo en la carpeta, con el nombre exacto (también las
//      mayúsculas y minúsculas: el alojamiento las distingue aunque la computadora de trabajo no). Una ficha aprobada
//      sin `image`, o con una foto por dirección (`image.url`), no pide ningún archivo: sin foto se publica con el
//      pictograma de su categoría.
//   2. La carpeta tiene solo fotos de fichas aprobadas: cada archivo es el `image.file` de al menos una ficha
//      `approved`. La foto de un borrador, de una ficha en revisión o de un retirado, un archivo suelto o una
//      subcarpeta son un error. Todo lo que está en la carpeta puede terminar en la salida publicada, y el repositorio
//      es público: una foto entra al repositorio en el mismo cambio que aprueba su ficha, con su uso confirmado, y
//      sale cuando la ficha deja de estar aprobada, o después, en su propio cambio, si la ficha se aprobó sin foto.
//      Sin carpeta no hay fotos todavía, y está bien, aunque haya fichas aprobadas.
//   3. Cada archivo es una imagen real del formato que dice su extensión (JPEG para .jpg y .jpeg, PNG o WebP); su
//      lado más largo mide de 600 a 4000 px, y pesa como máximo 1.5 MB.
// Una ficha que no está aprobada puede nombrar ya su archivo aunque todavía no esté en la carpeta.
//
// Las medidas y el formato se leen con `imageMetadata` de Astro (sin dependencias nuevas).
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { imageMetadata } from 'astro/assets/utils';

/** Carpeta de las fotos, relativa a la raíz del proyecto, como la nombran los mensajes. */
export const PHOTO_FOLDER = 'src/assets/productos';
/** Lado más largo mínimo y máximo de una foto, en píxeles. */
export const PHOTO_MIN_SIDE = 600;
export const PHOTO_MAX_SIDE = 4000;
/** Peso máximo de una foto: 1.5 MB. */
export const PHOTO_MAX_BYTES = 1_572_864;

const FORMAT_NAMES = { jpg: 'JPEG', png: 'PNG', webp: 'WebP' };
const EXTENSION_FORMATS = { jpg: 'jpg', jpeg: 'jpg', png: 'png', webp: 'webp' };
const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value);
const megabytes = bytes => (bytes / 1_048_576).toFixed(1);
const bytesText = bytes => bytes.toLocaleString('es-MX');

/**
 * Revisa la carpeta de fotos contra el catálogo y devuelve los mensajes de error (ninguno si todo está bien).
 * @param {unknown} catalog el contenido de src/data/catalog.json
 * @param {string} folder ruta de la carpeta de fotos en el disco
 * @param {string} [label] cómo la nombran los mensajes
 * @returns {Promise<string[]>}
 */
export async function checkProductPhotos(catalog, folder, label = PHOTO_FOLDER) {
  const errors = [];
  const products = isRecord(catalog) && Array.isArray(catalog.products) ? catalog.products : [];
  // Nombre de archivo → las fichas que lo usan, con su posición y su estado.
  const users = new Map();
  products.forEach((product, index) => {
    const file = isRecord(product) && isRecord(product.image) ? product.image.file : undefined;
    if (typeof file !== 'string') return;
    if (!users.has(file)) users.set(file, []);
    users.get(file).push({ path: `products[${index}]`, status: product.status });
  });

  let entries = [];
  try {
    entries = await readdir(folder, { withFileTypes: true });
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const names = new Set(entries.map(entry => entry.name));

  for (const [file, list] of users) {
    for (const user of list) {
      if (user.status === 'approved' && !names.has(file)) {
        errors.push(`${user.path}.image.file: «${file}» no está en ${label}/; agrega la foto con ese nombre exacto (también las mayúsculas y minúsculas) o corrige el nombre.`);
      }
    }
  }

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const shown = `${label}/${entry.name}`;
    if (entry.isDirectory()) {
      errors.push(`${shown}/: es una carpeta; aquí solo van las fotos de fichas aprobadas. Quita la carpeta.`);
      continue;
    }
    const list = users.get(entry.name) ?? [];
    if (!list.some(user => user.status === 'approved')) {
      errors.push(list.length
        ? `${shown}: es la foto de ${list.map(user => `${user.path} (${user.status})`).join(', ')}, que no está aprobada; quita el archivo o aprueba su ficha.`
        : `${shown}: ninguna ficha aprobada usa este archivo; quita el archivo o aprueba su ficha.`);
      continue;
    }
    errors.push(...await inspectPhoto(join(folder, entry.name), shown));
  }
  return errors;
}

/** Formato, medidas y peso de un archivo de foto. */
async function inspectPhoto(path, shown) {
  const errors = [];
  const data = await readFile(path);
  const extension = shown.slice(shown.lastIndexOf('.') + 1).toLowerCase();
  const expected = EXTENSION_FORMATS[extension];
  let metadata;
  try {
    metadata = await imageMetadata(data, shown);
  } catch {
    return [`${shown}: no es una imagen JPEG, PNG ni WebP que se pueda leer; vuelve a guardar la foto en uno de esos formatos.`];
  }
  const format = metadata.format === 'jpeg' ? 'jpg' : metadata.format;
  if (!FORMAT_NAMES[format]) {
    errors.push(`${shown}: es una imagen ${String(metadata.format).toUpperCase()}; guárdala como JPEG, PNG o WebP.`);
  } else if (expected && format !== expected) {
    errors.push(`${shown}: es una imagen ${FORMAT_NAMES[format]} con la extensión .${extension}; guárdala como ${FORMAT_NAMES[expected]} o cambia la extensión del archivo y de image.file a .${format}.`);
  }
  const longest = Math.max(metadata.width, metadata.height);
  if (longest < PHOTO_MIN_SIDE) errors.push(`${shown}: su lado más largo mide ${longest} px y el mínimo es ${PHOTO_MIN_SIDE} px; usa una foto más grande.`);
  if (longest > PHOTO_MAX_SIDE) errors.push(`${shown}: su lado más largo mide ${longest} px y el máximo es ${PHOTO_MAX_SIDE} px; reduce la foto.`);
  if (data.length > PHOTO_MAX_BYTES) errors.push(`${shown}: pesa ${megabytes(data.length)} MB (${bytesText(data.length)} bytes) y el máximo es 1.5 MB (${bytesText(PHOTO_MAX_BYTES)} bytes); guárdala con más compresión o más chica.`);
  return errors;
}
