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
//   3. Cada archivo es una imagen del formato que dice su extensión (JPEG para .jpg y .jpeg, PNG o WebP) y termina
//      donde termina su imagen: un archivo cortado no pasa, y uno con bytes de más después del final tampoco (nada
//      desconocido viaja dentro de una foto de un repositorio público). PNG: se recorren sus bloques hasta IEND; WebP:
//      se compara lo que declara su cabecera con lo que mide; JPEG: termina con su marca de fin (encontrar dónde
//      termina de verdad su imagen pide leerla entera, así que el mensaje dice las dos posibilidades). La biblioteca
//      con la que compila el sitio (sharp) puede leer su cabecera: lo que no puede leer, la compilación lo copiaría tal
//      cual a la página, y el navegador no lo dibujaría. Es una sola imagen, no una animación (la compilación apilaría
//      sus cuadros en la copia PNG). Su lado más largo mide de 400 a 4000 px, y pesa como máximo 1.5 MB. No se
//      decodifica la imagen entera: eso lo hace la compilación.
//   4. Cada cosa de la carpeta es un archivo o una subcarpeta (que es un error, regla 2), nunca un enlace simbólico,
//      apunte a donde apunte: la foto se copia en la carpeta. La carpeta misma tampoco es un archivo ni un enlace.
//      Cada problema se dice con un mensaje; la revisión nunca se detiene con un error.
// Una ficha que no está aprobada puede nombrar ya su archivo aunque todavía no esté en la carpeta.
//
// El formato y las medidas se leen con `imageMetadata` de Astro; que la compilación pueda leer la imagen y cuántos
// cuadros tiene, con `sharp`, la biblioteca con la que Astro optimiza las imágenes (declarada en package.json con la
// versión exacta del lockfile).
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { imageMetadata } from 'astro/assets/utils';
import sharp from 'sharp';

/** Carpeta de las fotos, relativa a la raíz del proyecto, como la nombran los mensajes. */
export const PHOTO_FOLDER = 'src/assets/productos';
/** Lado más largo mínimo y máximo de una foto, en píxeles. */
export const PHOTO_MIN_SIDE = 400;
export const PHOTO_MAX_SIDE = 4000;
/** Peso máximo de una foto: 1.5 MB. */
export const PHOTO_MAX_BYTES = 1_572_864;

const FORMAT_NAMES = { jpg: 'JPEG', png: 'PNG', webp: 'WebP' };
const EXTENSION_FORMATS = { jpg: 'jpg', jpeg: 'jpg', png: 'png', webp: 'webp' };
const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value);
const bytesText = bytes => bytes.toLocaleString('es-MX');
const byteCount = count => (count === 1 ? '1 byte' : `${bytesText(count)} bytes`);
/**
 * Dónde termina la imagen de un archivo frente a lo que mide: `cut` si le falta el final, `extra` con los bytes que
 * sobran después de él, `null` si termina donde termina su imagen. JPEG: `jpegEnd` si no termina con su marca de fin.
 * @returns {{ cut: true } | { extra: number } | { jpegEnd: true } | null}
 */
function endOf(data, format) {
  if (format === 'jpg') return data.length >= 4 && data[data.length - 2] === 0xff && data[data.length - 1] === 0xd9 ? null : { jpegEnd: true };
  if (format === 'png') {
    // Cada bloque: su largo (4 bytes), su tipo (4), sus datos y su código de control (4); el último es IEND.
    for (let offset = 8; offset + 8 <= data.length;) {
      const next = offset + 12 + data.readUInt32BE(offset);
      if (next > data.length) return { cut: true };
      if (data.toString('latin1', offset + 4, offset + 8) === 'IEND') return next === data.length ? null : { extra: data.length - next };
      offset = next;
    }
    return { cut: true };
  }
  if (format === 'webp') {
    if (data.length < 12) return { cut: true };
    const declared = data.readUInt32LE(4) + 8;
    if (declared > data.length) return { cut: true };
    return declared === data.length ? null : { extra: data.length - declared };
  }
  return null;
}

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
    const folderStats = await lstat(folder);
    if (folderStats.isSymbolicLink()) errors.push(`${label}: es un enlace a otra carpeta; guarda las fotos en la carpeta misma, sin enlazarla.`);
    else if (!folderStats.isDirectory()) errors.push(`${label}: es un archivo y debe ser una carpeta; quita el archivo y guarda las fotos en una carpeta con ese nombre.`);
    else entries = await readdir(folder, { withFileTypes: true });
  } catch (error) {
    // Sin carpeta no hay fotos todavía.
    if (error?.code !== 'ENOENT') errors.push(`${label}: no se pudo leer la carpeta; revisa que se pueda abrir.`);
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
    if (entry.isSymbolicLink()) {
      errors.push(`${shown}: es un enlace; copia aquí la foto en lugar de enlazarla.`);
      continue;
    }
    if (entry.isDirectory()) {
      errors.push(`${shown}/: es una carpeta; aquí solo van las fotos de fichas aprobadas. Quita la carpeta.`);
      continue;
    }
    if (!entry.isFile()) {
      errors.push(`${shown}: no es un archivo de foto; quítalo de la carpeta.`);
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

/** Formato, final, si la compilación la puede leer, cuadros, medidas y peso de un archivo de foto. */
async function inspectPhoto(path, shown) {
  const errors = [];
  let data;
  try {
    data = await readFile(path);
  } catch {
    return [`${shown}: no se pudo leer el archivo; revisa que se pueda abrir y vuelve a guardarlo.`];
  }
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
  if (FORMAT_NAMES[format]) {
    const end = endOf(data, format);
    if (end && 'cut' in end) errors.push(`${shown}: está cortado: le falta el final; vuelve a bajarlo o a guardarlo.`);
    else if (end && 'extra' in end) errors.push(`${shown}: lleva ${byteCount(end.extra)} después del final de la imagen; ábrela y guárdala de nuevo con un editor de imágenes.`);
    else if (end) errors.push(`${shown}: no termina donde termina un JPEG: está cortado o lleva datos después de la imagen; ábrela y guárdala de nuevo con un editor de imágenes, o vuelve a bajarla.`);
    // Lo que la compilación hará con el archivo: si sharp no puede leer su cabecera, Astro solo avisa y copia los bytes
    // tal cual a cada ancho de la página. De un archivo cortado ya se dijo qué hacer: no se dice además que no se lee.
    let built;
    if (!end || 'extra' in end) {
      try {
        built = await sharp(data).metadata();
      } catch {
        errors.push(`${shown}: la compilación no puede leer esta imagen; ábrela y guárdala de nuevo con un editor de imágenes.`);
      }
    }
    if (built && built.pages > 1) errors.push(`${shown}: es una animación de ${bytesText(built.pages)} cuadros; una foto de producto es una sola imagen: guarda un solo cuadro.`);
  }
  const longest = Math.max(metadata.width, metadata.height);
  if (longest < PHOTO_MIN_SIDE) errors.push(`${shown}: su lado más largo mide ${longest} px y el mínimo es ${PHOTO_MIN_SIDE} px; usa una foto más grande.`);
  if (longest > PHOTO_MAX_SIDE) errors.push(`${shown}: su lado más largo mide ${longest} px y el máximo es ${PHOTO_MAX_SIDE} px; reduce la foto.`);
  // Primero los bytes: redondeados a megas, 1,572,865 y 1,572,864 se leerían igual.
  if (data.length > PHOTO_MAX_BYTES) errors.push(`${shown}: pesa ${bytesText(data.length)} bytes y el máximo es ${bytesText(PHOTO_MAX_BYTES)} bytes (1.5 MB); guárdala con más compresión o más chica.`);
  return errors;
}
