import { readFile } from 'node:fs/promises';
import { validateCatalog, getPublishedProducts, getRetiredProducts } from '../src/lib/catalog-policy.mjs';
import { crossCheckBrands, validateExampleProducts } from '../src/lib/site-data-core.mjs';
const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const [catalog, registry, brands, examples] = await Promise.all([
  read('../src/data/catalog.json'), read('../research/Sercom_Active_Fuentes_Catalogos.json'),
  read('../src/data/brands.json'), read('../src/data/preview/example-products.json'),
]);
const errors = validateCatalog(catalog, registry);
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
const retiredExamples = Array.isArray(examples) ? examples.filter(example => example?.retired === true).length : 0;
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Registro: ${registry.sources.length} entidades / ${registry.sources.reduce((n, s) => n + s.resources.length, 0)} referencias.`);
  console.log(`Catálogo: ${catalog.products.length} productos / ${getPublishedProducts(catalog, registry).length} aprobados / ${getRetiredProducts(catalog, registry).length} retirados con página informativa.`);
  console.log(`Marcas públicas: ${brands.length} / ${brands.filter(brand => brand.manufacturerLinks.length).length} con enlace al sitio del fabricante.`);
  console.log(`Ejemplos de vista previa: ${examples.length} (${retiredExamples} ${retiredExamples === 1 ? 'retirado' : 'retirados'}); no forman parte del catálogo y solo se muestran con CATALOG_PREVIEW.`);
  console.log('Validación estructural correcta; no acredita disponibilidad ni vuelve a consultar las fuentes.');
}
