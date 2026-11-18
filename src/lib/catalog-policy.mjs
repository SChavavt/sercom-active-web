const normalize = value => String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
const isText = value => typeof value === 'string' && value.trim().length > 0;
const isId = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const isHttps = value => {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; }
  catch { return false; }
};
/** Indica si un texto menciona la marca excluida del alcance. */
export const mentionsExcludedBrand = value => /\bgisa\b|guantes?\s+internacionales?/.test(normalize(value));
const excluded = mentionsExcludedBrand;
const forbidden = /^(price|prices|precio|precios|cost|costs|costo|costos|stock|inventory|inventario)$/;
const productKeys = new Set(['id', 'brandId', 'model', 'name', 'categoryIds', 'status', 'description', 'characteristics', 'saleUnit', 'variants', 'image', 'source', 'approval', 'documents']);
const categoryKeys = new Set(['id', 'name', 'shortName', 'summary', 'status']);
// Los ejemplos de la vista previa viven en src/data/preview y nunca entran al catálogo: sus marcas quedan reservadas.
const exampleCode = value => /^ej-\d/i.test(String(value ?? '').trim());
const reservedForExamples = p => /^ejemplo(?:-|$)/.test(String(p.id ?? '')) || /\bde ejemplo\b/.test(normalize(p.name))
  || exampleCode(p.model) || (Array.isArray(p.variants) && p.variants.some(v => exampleCode(v?.manufacturerCode)));

function inspectFields(value, path, errors) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.test(normalize(key))) errors.push(`${path}.${key}: campo comercial no permitido en este catálogo.`);
    inspectFields(child, `${path}.${key}`, errors);
  }
}

/** Valida el archivo editorial completo antes de producir una salida pública. */
export function validateCatalog(catalog, registry) {
  const errors = [];
  if (catalog?.schemaVersion !== 1 || !Array.isArray(catalog?.categories) || !Array.isArray(catalog?.products)) {
    return ['El catálogo debe tener schemaVersion 1, categories y products.'];
  }
  inspectFields(catalog, 'catalog', errors);
  const brands = new Map((registry?.sources ?? []).filter(s => s.entity_type === 'brand').map(s => [s.entity_id, s]));
  const categories = new Map();
  for (const c of catalog.categories) {
    if (!c || !isId(c.id) || !isText(c.name) || !['draft', 'approved'].includes(c.status)) errors.push('Categoría inválida.');
    if (c && typeof c === 'object') {
      for (const key of Object.keys(c)) if (!categoryKeys.has(key)) errors.push(`Categoría ${c.id}: campo no definido (${key}).`);
      for (const key of ['shortName', 'summary']) if (key in c && !isText(c[key])) errors.push(`Categoría ${c.id}: ${key} debe ser un texto no vacío.`);
    }
    if (categories.has(c?.id)) errors.push(`Categoría duplicada: ${c?.id}.`);
    categories.set(c?.id, c);
  }
  const ids = new Set();
  const models = new Set();
  for (const [index, p] of catalog.products.entries()) {
    const path = `products[${index}]`;
    if (!p || typeof p !== 'object') { errors.push(`${path}: producto inválido.`); continue; }
    for (const key of Object.keys(p)) if (!productKeys.has(key)) errors.push(`${path}.${key}: campo no definido.`);
    if (!isId(p.id) || ids.has(p.id)) errors.push(`${path}: id inválido o duplicado.`);
    ids.add(p.id);
    const brand = brands.get(p.brandId);
    if (!brand) errors.push(`${path}: la marca no está en el alcance permitido; un proveedor no es una marca.`);
    if ([p.id, p.brandId, p.model, p.name, brand?.name].some(excluded)) errors.push(`${path}: marca excluida.`);
    if (reservedForExamples(p)) errors.push(`${path}: identificador, código o nombre reservado para los ejemplos de vista previa.`);
    const modelKey = `${normalize(p.brandId)}:${normalize(p.model)}`;
    if (!isText(p.model) || models.has(modelKey)) errors.push(`${path}: modelo vacío o duplicado en la misma marca.`);
    models.add(modelKey);
    if (!isText(p.name)) errors.push(`${path}: falta nombre.`);
    if (!['draft', 'in_review', 'approved', 'retired'].includes(p.status)) errors.push(`${path}: estado editorial inválido.`);
    if (!Array.isArray(p.categoryIds) || !p.categoryIds.length || p.categoryIds.some(id => !categories.has(id))) errors.push(`${path}: faltan categorías válidas.`);
    if (p.source && (!isHttps(p.source.url) || !validDate(p.source.checkedOn))) errors.push(`${path}: fuente o fecha inválida.`);
    if (p.documents && (!Array.isArray(p.documents) || p.documents.some(d => !d || !isText(d.label) || !isHttps(d.url)))) errors.push(`${path}: documento inválido.`);
    if (p.variants) {
      const variantIds = new Set();
      if (!Array.isArray(p.variants)) errors.push(`${path}: variants debe ser una lista.`);
      else for (const v of p.variants) {
        if (!v || !isId(v.id) || variantIds.has(v.id) || !isText(v.label) || !isText(v.manufacturerCode)) errors.push(`${path}: variante incompleta o duplicada.`);
        variantIds.add(v?.id);
      }
    }
    if (p.status !== 'approved') continue;
    if (!isText(p.description) || !isText(p.saleUnit)) errors.push(`${path}: falta descripción o unidad de venta.`);
    if (!Array.isArray(p.characteristics) || p.characteristics.length < 3 || p.characteristics.length > 5 || p.characteristics.some(v => !isText(v))) errors.push(`${path}: requiere de 3 a 5 características verificadas.`);
    if (!p.source) errors.push(`${path}: falta fuente revisada.`);
    if (!p.approval || !isText(p.approval.by) || !validDate(p.approval.on) || p.approval.supplyConfirmed !== true) errors.push(`${path}: falta aprobación comercial.`);
    if (!p.image || !isHttps(p.image.url) || !isText(p.image.alt) || !isHttps(p.image.sourceUrl) || p.image.usageConfirmed !== true) errors.push(`${path}: falta imagen verificable con uso confirmado.`);
    if (Array.isArray(p.categoryIds) && p.categoryIds.some(id => categories.get(id)?.status !== 'approved')) errors.push(`${path}: categoría pendiente de aprobación.`);
  }
  return errors;
}

/** Exportación explícita: no expone aprobador ni controles internos. */
export function getPublishedProducts(catalog, registry) {
  const errors = validateCatalog(catalog, registry);
  if (errors.length) throw new Error(errors.join('\n'));
  return catalog.products.filter(p => p.status === 'approved').map(p => ({
    id: p.id, brandId: p.brandId, model: p.model, name: p.name,
    categoryIds: [...p.categoryIds], description: p.description,
    characteristics: [...p.characteristics], saleUnit: p.saleUnit,
    variants: (p.variants ?? []).map(v => ({ id: v.id, label: v.label, manufacturerCode: v.manufacturerCode })),
    image: { url: p.image.url, alt: p.image.alt },
    documents: (p.documents ?? []).map(d => ({ label: d.label, url: d.url })),
  }));
}
