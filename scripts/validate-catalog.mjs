// `npm run validate:catalog`: revisa los datos del proyecto antes de compilar (lo corren también `npm run check`,
// `npm run build` y `npm run build:preview`). Con errores los escribe y termina con código 1; sin ellos, escribe el
// resumen. Con `npm run validate:catalog -- --sin-foto` escribe además, después del resumen, cada ficha aprobada sin
// foto en su línea. Los pasos están en `validateProject`, que recibe la carpeta del proyecto: así las pruebas lo corren
// sobre una carpeta temporal, con sus propios datos y fotos.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCatalog, getPublishedProducts, getRetiredProducts, photoSourceErrors } from '../src/lib/catalog-policy.mjs';
import { crossCheckBrands, MANUFACTURER_LINK_LABELS, validateExampleProducts } from '../src/lib/site-data-core.mjs';
import { reviewCatalogText } from './catalog-text.mjs';
import { checkProductPhotos, PHOTO_FOLDER } from './product-photos.mjs';

/** Los archivos de datos que lee el validador, relativos a la carpeta del proyecto. */
export const DATA_FILES = {
  catalog: 'src/data/catalog.json', registry: 'research/Sercom_Active_Fuentes_Catalogos.json',
  brands: 'src/data/brands.json', examples: 'src/data/preview/example-products.json',
};

/** Una cifra del resumen, con la coma de los miles («1,400»). */
const count = value => value.toLocaleString('es-MX');
const plural = (value, one, many) => `${count(value)} ${value === 1 ? one : many}`;
/** Cuántas fichas sin foto nombra el resumen; con más, dice cuántas de cada marca, las primeras y cuántas más. */
export const WITHOUT_PHOTO_SHOWN = 10;
/** La opción del validador que escribe cada ficha aprobada sin foto en su línea. */
export const WITHOUT_PHOTO_OPTION = '--sin-foto';

/** Las fichas aprobadas sin foto de un catálogo ya validado, en su orden. */
const approvedWithoutPhoto = catalog => catalog.products.filter(product => product.status === 'approved' && product.image === undefined);

/**
 * Las líneas del resumen sobre las fotos de las fichas aprobadas de un catálogo ya validado: cuántos archivos y cuántas
 * direcciones; y, cuando hay fichas aprobadas sin foto, cuáles, en el orden del catálogo, para que quien mantiene el
 * catálogo sepa qué fotos faltan. Con más de `WITHOUT_PHOTO_SHOWN`, en lugar de todas dice cuántas son, cuántas de cada
 * marca (en el orden de `brands`, la lista de brands.json), las primeras y cómo ver la lista completa. No es un error:
 * una ficha aprobada sin foto se publica con el pictograma de su categoría.
 * @param {{ products: any[] }} catalog
 * @param {{ id: string, name: string }[]} [brands]
 * @returns {string[]}
 */
export function photoSummary(catalog, brands = []) {
  const approved = catalog.products.filter(product => product.status === 'approved');
  const withoutPhoto = approvedWithoutPhoto(catalog);
  const photoFiles = new Set(approved.map(product => product.image?.file).filter(Boolean)).size;
  const photoUrls = approved.filter(product => product.image?.url).length;
  const missing = withoutPhoto.length ? `; ${plural(withoutPhoto.length, 'ficha aprobada', 'fichas aprobadas')} sin foto` : '';
  const lines = [`Fotos de producto: ${plural(photoFiles, 'archivo', 'archivos')} en ${PHOTO_FOLDER}/ y ${count(photoUrls)} por dirección, todas de fichas aprobadas${missing}.`];
  const label = 'Sin foto (se muestran con el pictograma de su categoría):';
  const ids = withoutPhoto.map(product => product.id);
  if (ids.length > WITHOUT_PHOTO_SHOWN) {
    // Marca → cuántas, en el orden de la lista de marcas; las que la lista no tiene, al final.
    const perBrand = new Map(brands.map(brand => [brand.id, 0]));
    for (const product of withoutPhoto) perBrand.set(product.brandId, (perBrand.get(product.brandId) ?? 0) + 1);
    const names = new Map(brands.map(brand => [brand.id, brand.name]));
    const counts = [...perBrand].filter(([, value]) => value > 0).map(([id, value]) => `${names.get(id) ?? id} ${count(value)}`).join(', ');
    lines.push(`${label} ${count(ids.length)} (${counts}). Las primeras: ${ids.slice(0, WITHOUT_PHOTO_SHOWN).join(', ')} y ${count(ids.length - WITHOUT_PHOTO_SHOWN)} más. La lista completa: npm run validate:catalog -- ${WITHOUT_PHOTO_OPTION}`);
  } else if (ids.length) lines.push(`${label} ${ids.join(', ')}.`);
  return lines;
}

/**
 * La línea del resumen sobre los enlaces de las marcas, ya validadas: cuántas tienen algún enlace del fabricante,
 * cuántas un catálogo (en PDF o en línea) y, de esas, cuántas en PDF.
 * @returns {string}
 */
export function brandSummary(brands) {
  const labels = brand => brand.manufacturerLinks.map(link => link.label);
  const catalogLabels = [MANUFACTURER_LINK_LABELS.pdf, MANUFACTURER_LINK_LABELS.online];
  const withLink = brands.filter(brand => brand.manufacturerLinks.length).length;
  const withCatalog = brands.filter(brand => labels(brand).some(label => catalogLabels.includes(label))).length;
  const withPdf = brands.filter(brand => labels(brand).includes(MANUFACTURER_LINK_LABELS.pdf)).length;
  return `Marcas públicas: ${brands.length} / ${withLink} con algún enlace del fabricante / ${withCatalog} con catálogo del fabricante (${withPdf} en PDF).`;
}

/**
 * Revisa los datos de la carpeta del proyecto `root` y su carpeta de fotos.
 * @param {string} root carpeta del proyecto
 * @param {{ listWithoutPhoto?: boolean }} [options] `listWithoutPhoto`: después del resumen, cada ficha aprobada sin
 *   foto en su línea (`--sin-foto`)
 * @returns {Promise<{ errors: string[], lines: string[] }>} los mensajes de error y, sin errores, las líneas del resumen
 */
export async function validateProject(root, { listWithoutPhoto = false } = {}) {
  const read = async path => JSON.parse(await readFile(join(root, path), 'utf8'));
  const [catalog, registry, brands, examples] = await Promise.all([
    read(DATA_FILES.catalog), read(DATA_FILES.registry), read(DATA_FILES.brands), read(DATA_FILES.examples),
  ]);
  const errors = validateCatalog(catalog, registry);
  // El texto de cada ficha, en cualquier estado, frente a las reglas de redacción del escáner (catalog-text.mjs).
  errors.push(...reviewCatalogText(catalog, { registry, brands, examples }));
  // Los archivos de las fotografías: solo los de fichas aprobadas, con su formato, medidas y peso (product-photos.mjs).
  // Es la revisión que impide que un archivo de más llegue a la salida: la compilación copia todo lo que hay en la
  // carpeta. El escáner lo vuelve a revisar sobre la salida (R-FOTO-02).
  errors.push(...await checkProductPhotos(catalog, join(root, PHOTO_FOLDER)));
  // La página de donde viene la foto de cada ficha aprobada es del sitio de su fabricante: la ficha la enlaza en el
  // crédito de la foto. Va aparte de validateCatalog porque necesita los recursos del registro (catalog-policy.mjs).
  errors.push(...photoSourceErrors(catalog, registry));
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
    `Registro: ${count(registry.sources.length)} entidades / ${count(registry.sources.reduce((n, s) => n + s.resources.length, 0))} referencias.`,
    `Catálogo: ${count(catalog.products.length)} productos / ${count(getPublishedProducts(catalog, registry).length)} aprobados / ${count(getRetiredProducts(catalog, registry).length)} retirados con página informativa.`,
    ...photoSummary(catalog, brands),
    brandSummary(brands),
    `Ejemplos de vista previa: ${count(examples.length)} (${count(retiredExamples)} ${retiredExamples === 1 ? 'retirado' : 'retirados'}); no forman parte del catálogo y solo se muestran con CATALOG_PREVIEW.`,
    'Validación estructural correcta; no acredita disponibilidad ni vuelve a consultar las fuentes.',
    ...(listWithoutPhoto ? approvedWithoutPhoto(catalog).map(product => product.id) : []),
  ] };
}

if (import.meta.main) {
  const listWithoutPhoto = process.argv.slice(2).includes(WITHOUT_PHOTO_OPTION);
  const { errors, lines } = await validateProject(fileURLToPath(new URL('..', import.meta.url)), { listWithoutPhoto });
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else for (const line of lines) console.log(line);
}
