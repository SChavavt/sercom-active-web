import { readFile } from 'node:fs/promises';
import { validateCatalog, getPublishedProducts } from '../src/lib/catalog-policy.mjs';
const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const [catalog, registry] = await Promise.all([
  read('../src/data/catalog.json'), read('../research/Sercom_Active_Fuentes_Catalogos.json'),
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
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Registro: ${registry.sources.length} entidades / ${registry.sources.reduce((n, s) => n + s.resources.length, 0)} referencias.`);
  console.log(`Catálogo: ${catalog.products.length} productos / ${getPublishedProducts(catalog, registry).length} aprobados.`);
  console.log('Validación estructural correcta; no acredita disponibilidad ni vuelve a consultar las fuentes.');
}
