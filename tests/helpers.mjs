// Utilidades compartidas por las pruebas. No es un archivo de pruebas: `npm test` solo ejecuta tests/*.test.mjs.
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPublicRetired } from '../src/lib/catalog-policy.mjs';

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

/**
 * Lo que cada compilación debe mostrar del catálogo real, derivado de los mismos datos (nunca una cifra escrita a mano):
 * producción muestra exactamente las categorías y las fichas `approved`; los retirados que fueron públicos solo tienen
 * su página. La vista previa suma las categorías en borrador y los ejemplos.
 */
export function publicCatalog(catalog) {
  const approvedCategoryIds = catalog.categories.filter(category => category.status === 'approved').map(category => category.id);
  const approvedProducts = catalog.products.filter(product => product.status === 'approved');
  const publicRetired = catalog.products.filter(isPublicRetired);
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
