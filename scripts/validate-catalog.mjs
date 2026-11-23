// `npm run validate:catalog`: revisa los datos del proyecto antes de compilar (lo corren también `npm run check`,
// `npm run build` y `npm run build:preview`). Con errores los escribe y termina con código 1; sin ellos, escribe el
// resumen. Los pasos están en `validateProject`, que recibe la carpeta del proyecto: así las pruebas lo corren sobre
// una carpeta temporal, con sus propios datos y fotos.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCatalog, getPublishedProducts, getRetiredProducts } from '../src/lib/catalog-policy.mjs';
import { crossCheckBrands, validateExampleProducts } from '../src/lib/site-data-core.mjs';
import { reviewCatalogText } from './catalog-text.mjs';
import { checkProductPhotos, PHOTO_FOLDER } from './product-photos.mjs';

/** Los archivos de datos que lee el validador, relativos a la carpeta del proyecto. */
export const DATA_FILES = {
  catalog: 'src/data/catalog.json', registry: 'research/Sercom_Active_Fuentes_Catalogos.json',
  brands: 'src/data/brands.json', examples: 'src/data/preview/example-products.json',
};

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

/**
 * Las líneas del resumen sobre las fotos de las fichas aprobadas de un catálogo ya validado: cuántos archivos y cuántas
 * direcciones; y, cuando hay fichas aprobadas sin foto, cuántas son y cuáles, en el orden del catálogo, para que quien
 * mantiene el catálogo sepa qué fotos faltan. No es un error: una ficha aprobada sin foto se publica con el pictograma
 * de su categoría.
 * @returns {string[]}
 */
export function photoSummary(catalog) {
  const approved = catalog.products.filter(product => product.status === 'approved');
  const withoutPhoto = approved.filter(product => product.image === undefined).map(product => product.id);
  const photoFiles = new Set(approved.map(product => product.image?.file).filter(Boolean)).size;
  const photoUrls = approved.filter(product => product.image?.url).length;
  const missing = withoutPhoto.length ? `; ${plural(withoutPhoto.length, 'ficha aprobada', 'fichas aprobadas')} sin foto` : '';
  const lines = [`Fotos de producto: ${plural(photoFiles, 'archivo', 'archivos')} en ${PHOTO_FOLDER}/ y ${photoUrls} por dirección, todas de fichas aprobadas${missing}.`];
  if (withoutPhoto.length) lines.push(`Sin foto (se muestran con el pictograma de su categoría): ${withoutPhoto.join(', ')}.`);
  return lines;
}

/**
 * Revisa los datos de la carpeta del proyecto `root` y su carpeta de fotos.
 * @param {string} root carpeta del proyecto
 * @returns {Promise<{ errors: string[], lines: string[] }>} los mensajes de error y, sin errores, las líneas del resumen
 */
export async function validateProject(root) {
  const read = async path => JSON.parse(await readFile(join(root, path), 'utf8'));
  const [catalog, registry, brands, examples] = await Promise.all([
    read(DATA_FILES.catalog), read(DATA_FILES.registry), read(DATA_FILES.brands), read(DATA_FILES.examples),
  ]);
  const errors = validateCatalog(catalog, registry);
  // El texto de cada ficha, en cualquier estado, frente a las reglas de redacción del escáner (catalog-text.mjs).
  errors.push(...reviewCatalogText(catalog, { registry, brands }));
  // Los archivos de las fotografías: solo los de fichas aprobadas, con su formato, medidas y peso (product-photos.mjs).
  // Es la revisión que impide que un archivo de más llegue a la salida: la compilación copia todo lo que hay en la
  // carpeta.
  errors.push(...await checkProductPhotos(catalog, join(root, PHOTO_FOLDER)));
  const sourceIds = new Set();
  for (const source of registry.sources) {
    if (sourceIds.has(source.entity_id)) errors.push(`Fuente duplicada: ${source.entity_id}`);
    sourceIds.add(source.entity_id);
    for (const resource of source.resources) {
      try { if (new URL(resource.url).protocol !== 'https:') errors.push(`Fuente sin HTTPS: ${source.entity_id}`); }
      catch { errors.push(`URL inválida en ${source.entity_id}`); }
    }
  }
  // La lista pública de marcas debe coincidir con el registro; el sitio solo lee brands.json.
  errors.push(...crossCheckBrands(brands, registry).map(error => `Marcas: ${error}`));
  // Los ejemplos de vista previa se revisan siempre, aunque solo se usen con CATALOG_PREVIEW.
  const categoryIds = Array.isArray(catalog?.categories) ? catalog.categories.map(category => category?.id) : [];
  errors.push(...validateExampleProducts(examples, { categoryIds, brands: Array.isArray(brands) ? brands : [] }).map(error => `Ejemplos: ${error}`));
  if (errors.length) return { errors, lines: [] };
  const retiredExamples = Array.isArray(examples) ? examples.filter(example => example?.retired === true).length : 0;
  return { errors, lines: [
    `Registro: ${registry.sources.length} entidades / ${registry.sources.reduce((n, s) => n + s.resources.length, 0)} referencias.`,
    `Catálogo: ${catalog.products.length} productos / ${getPublishedProducts(catalog, registry).length} aprobados / ${getRetiredProducts(catalog, registry).length} retirados con página informativa.`,
    ...photoSummary(catalog),
    `Marcas públicas: ${brands.length} / ${brands.filter(brand => brand.manufacturerLinks.length).length} con enlace al sitio del fabricante.`,
    `Ejemplos de vista previa: ${examples.length} (${retiredExamples} ${retiredExamples === 1 ? 'retirado' : 'retirados'}); no forman parte del catálogo y solo se muestran con CATALOG_PREVIEW.`,
    'Validación estructural correcta; no acredita disponibilidad ni vuelve a consultar las fuentes.',
  ] };
}

if (import.meta.main) {
  const { errors, lines } = await validateProject(fileURLToPath(new URL('..', import.meta.url)));
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else for (const line of lines) console.log(line);
}
