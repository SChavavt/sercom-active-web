// @ts-check
// Lógica pura de los datos públicos del sitio: recibe los datos como argumentos y no importa
// ningún archivo de datos, de modo que se prueba con node:test sin compilar el sitio.
// Las páginas no usan este módulo directamente: importan `site-data.mjs`.
/**
 * @import { Catalog } from '../types/catalog.ts'
 * @import { BrandRecord, ExampleProductRecord, PublicBrand, PublicCategory, PublicProduct, PublicRetiredProduct, SiteData, SiteSources } from '../types/site.ts'
 */
import { getPublishedProducts, getRetiredProducts, mentionsExcludedBrand } from './catalog-policy.mjs';
import { routes } from './routes.mjs';
import { normalizeText } from './text.mjs';

export { routes };

/** Aviso que lleva cada página de una compilación de vista previa. */
export const PREVIEW_NOTICE = 'Vista previa para revisión. Los productos que aparecen son ejemplos de diseño, no artículos reales.';
/** Etiqueta visible de cada producto de ejemplo. */
export const EXAMPLE_TAG = 'Ejemplo';
/** Marca de todos los productos de ejemplo. Nunca es una marca real. */
export const EXAMPLE_BRAND_NAME = 'Marca de ejemplo';
/** Única etiqueta permitida para el enlace de una marca. */
export const MANUFACTURER_LINK_LABEL = 'Sitio del fabricante';

/** @param {unknown} value @returns {value is string} */
const isText = value => typeof value === 'string' && value.trim().length > 0;
/** @param {unknown} value @returns {value is string} */
const isId = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value);
/** @param {unknown} value */
const isHttps = value => {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
};
/** @param {Record<string, unknown>} record @param {string[]} allowed */
const unknownKeys = (record, allowed) => Object.keys(record).filter(key => !allowed.includes(key));
/** ¿Aparece `needle` como palabra completa dentro de `haystack`? Ambos ya normalizados. */
const hasWord = (/** @type {string} */ haystack, /** @type {string} */ needle) => {
  let from = haystack.indexOf(needle);
  while (from !== -1) {
    const before = haystack[from - 1];
    const after = haystack[from + needle.length];
    if (!(before && /[a-z0-9]/.test(before)) && !(after && /[a-z0-9]/.test(after))) return true;
    from = haystack.indexOf(needle, from + 1);
  }
  return false;
};

const BRAND_KEYS = ['id', 'name', 'kind', 'manufacturerLinks'];
const LINK_KEYS = ['label', 'url'];
// `retired: true` marca el ejemplo de producto retirado: tiene su página, pero no entra en ningún listado.
const EXAMPLE_KEYS = ['id', 'name', 'brandName', 'code', 'categoryIds', 'saleUnit', 'summary', 'characteristics', 'variants', 'retired'];
const VARIANT_KEYS = ['id', 'label', 'code'];
/** Tipos de recurso del registro que nunca se publican como enlace. */
const BLOCKED_RESOURCE_TYPES = ['deprecated', 'unverified_current', 'gated_landing'];

/**
 * Valida la estructura de `src/data/brands.json`.
 * @param {unknown} brands
 * @returns {string[]} Errores; lista vacía si todo es correcto.
 */
export function validateBrands(brands) {
  if (!Array.isArray(brands) || brands.length === 0) return ['brands: debe ser una lista con al menos una marca.'];
  /** @type {string[]} */
  const errors = [];
  const ids = new Set();
  brands.forEach((brand, index) => {
    const path = `brands[${index}]`;
    if (!isRecord(brand)) {
      errors.push(`${path}: marca inválida.`);
      return;
    }
    for (const key of unknownKeys(brand, BRAND_KEYS)) errors.push(`${path}.${key}: campo no definido.`);
    if (!isId(brand.id) || ids.has(brand.id)) errors.push(`${path}: id inválido o duplicado.`);
    ids.add(brand.id);
    if (!isText(brand.name)) errors.push(`${path}: falta nombre.`);
    if (brand.kind !== 'brand' && brand.kind !== 'supplier') errors.push(`${path}: kind debe ser "brand" o "supplier".`);
    if (mentionsExcludedBrand(String(brand.id).replaceAll('-', ' ')) || mentionsExcludedBrand(brand.name)) errors.push(`${path}: marca excluida.`);
    const links = brand.manufacturerLinks;
    if (!Array.isArray(links) || links.length > 1) {
      errors.push(`${path}: manufacturerLinks debe ser una lista con un enlace como máximo.`);
      return;
    }
    for (const link of links) {
      if (!isRecord(link) || unknownKeys(link, LINK_KEYS).length || link.label !== MANUFACTURER_LINK_LABEL || !isHttps(link.url)) {
        errors.push(`${path}: el enlace debe tener solo la etiqueta «${MANUFACTURER_LINK_LABEL}» y una URL https.`);
      }
    }
  });
  return errors;
}

/**
 * Compara la lista pública de marcas con el registro de investigación: mismos identificadores,
 * nombres y tipos, y cada enlace debe ser un recurso de esa entidad verificado como accesible.
 * Solo la usan el validador (`npm run validate:catalog`) y las pruebas; el sitio nunca importa el registro.
 * @param {unknown} brands Contenido de `src/data/brands.json`.
 * @param {unknown} registry Contenido de `research/Sercom_Active_Fuentes_Catalogos.json`.
 * @returns {string[]} Errores; lista vacía si coinciden.
 */
export function crossCheckBrands(brands, registry) {
  const errors = validateBrands(brands);
  if (errors.length) return errors;
  const records = /** @type {BrandRecord[]} */ (brands);
  const registryData = /** @type {{ sources?: any[], scope?: { excluded_entities?: unknown[] } }} */ (isRecord(registry) ? registry : {});
  const sources = Array.isArray(registryData.sources) ? registryData.sources : [];
  if (sources.length === 0) return ['registro: no contiene entidades.'];
  const byId = new Map(sources.map(source => [source.entity_id, source]));

  for (const source of sources) {
    if (!records.some(brand => brand.id === source.entity_id)) errors.push(`registro: ${source.entity_id} falta en brands.json.`);
  }
  for (const brand of records) {
    const source = byId.get(brand.id);
    if (!source) {
      errors.push(`${brand.id}: no existe en el registro de investigación.`);
      continue;
    }
    if (brand.name !== source.name) errors.push(`${brand.id}: el nombre «${brand.name}» no coincide con el registro («${source.name}»).`);
    if (brand.kind !== source.entity_type) errors.push(`${brand.id}: kind «${brand.kind}» no coincide con el registro («${source.entity_type}»).`);
    for (const link of brand.manufacturerLinks) {
      const resources = Array.isArray(source.resources) ? source.resources : [];
      const resource = resources.find((/** @type {any} */ candidate) => candidate.url === link.url);
      if (!resource) errors.push(`${brand.id}: el enlace ${link.url} no es un recurso de esa entidad en el registro.`);
      else if (!String(resource.verification ?? '').startsWith('accesible') || BLOCKED_RESOURCE_TYPES.includes(resource.type)) {
        errors.push(`${brand.id}: el enlace ${link.url} no está verificado como accesible (${resource.type}: ${resource.verification}).`);
      }
    }
  }
  const excluded = Array.isArray(registryData.scope?.excluded_entities) ? registryData.scope.excluded_entities : [];
  for (const entity of excluded) {
    const needle = normalizeText(entity);
    if (!needle) continue;
    for (const brand of records) {
      if (hasWord(normalizeText(brand.name), needle) || hasWord(normalizeText(brand.id.replaceAll('-', ' ')), needle)) {
        errors.push(`${brand.id}: entidad excluida del alcance.`);
      }
    }
  }
  return errors;
}

/**
 * Valida los productos de ejemplo de la vista previa. Deben ser inconfundibles con fichas reales:
 * identificador «ejemplo-…», código «EJ-0000», nombre con «de ejemplo», marca «Marca de ejemplo»
 * y ninguna mención de una marca real. `retired: true` marca un ejemplo retirado; sus demás reglas no cambian.
 * @param {unknown} examples Contenido de `src/data/preview/example-products.json`.
 * @param {{ categoryIds: readonly string[], brands: readonly Pick<BrandRecord, 'id' | 'name'>[] }} context
 * @returns {string[]} Errores; lista vacía si todo es correcto.
 */
export function validateExampleProducts(examples, { categoryIds, brands }) {
  if (!Array.isArray(examples)) return ['ejemplos: debe ser una lista.'];
  /** @type {string[]} */
  const errors = [];
  const ids = new Set();
  const codes = new Set();
  examples.forEach((example, index) => {
    const path = `ejemplos[${index}]`;
    if (!isRecord(example)) {
      errors.push(`${path}: ejemplo inválido.`);
      return;
    }
    for (const key of unknownKeys(example, EXAMPLE_KEYS)) errors.push(`${path}.${key}: campo no definido.`);
    if (typeof example.id !== 'string' || !isId(example.id) || !example.id.startsWith('ejemplo-') || ids.has(example.id)) {
      errors.push(`${path}: el id debe empezar con «ejemplo-», ir en minúsculas con guiones y no repetirse.`);
    }
    ids.add(example.id);
    if (typeof example.code !== 'string' || !/^EJ-\d{4}$/.test(example.code) || codes.has(example.code)) {
      errors.push(`${path}: el código debe tener la forma EJ-0000 y no repetirse.`);
    }
    codes.add(example.code);
    if (!isText(example.name) || !hasWord(normalizeText(example.name), 'de ejemplo')) errors.push(`${path}: el nombre debe contener «de ejemplo».`);
    if (example.brandName !== EXAMPLE_BRAND_NAME) errors.push(`${path}: la marca debe ser «${EXAMPLE_BRAND_NAME}».`);
    if ('retired' in example && typeof example.retired !== 'boolean') errors.push(`${path}: retired debe ser true o false.`);
    if (!Array.isArray(example.categoryIds) || example.categoryIds.length === 0 || example.categoryIds.some(id => !categoryIds.includes(id))) {
      errors.push(`${path}: faltan categorías existentes.`);
    }
    if (!isText(example.saleUnit) || !isText(example.summary)) errors.push(`${path}: falta unidad de venta o resumen.`);
    const characteristics = example.characteristics;
    if (!Array.isArray(characteristics) || characteristics.length < 3 || characteristics.length > 5 || characteristics.some(item => !isText(item))) {
      errors.push(`${path}: requiere de 3 a 5 características.`);
    }
    const variants = example.variants;
    const variantIds = new Set();
    if (!Array.isArray(variants) || variants.length === 0) errors.push(`${path}: requiere al menos una variante.`);
    else for (const variant of variants) {
      const valid = isRecord(variant) && unknownKeys(variant, VARIANT_KEYS).length === 0 && isId(variant.id) && !variantIds.has(variant.id)
        && isText(variant.label) && typeof variant.code === 'string' && variant.code.startsWith(`${example.code}-`) && !codes.has(variant.code);
      if (!valid) errors.push(`${path}: variante incompleta, duplicada o con un código que no empieza con el del ejemplo.`);
      if (isRecord(variant)) {
        variantIds.add(variant.id);
        codes.add(variant.code);
      }
    }
    // Ningún campo puede nombrar una marca real ni la marca excluida.
    const text = normalizeText(JSON.stringify(example).replace(/["{}\[\],:]+/g, ' '));
    for (const brand of brands) {
      if (hasWord(text, normalizeText(brand.name)) || hasWord(text, normalizeText(brand.id))) errors.push(`${path}: menciona la marca real «${brand.name}».`);
    }
    if (mentionsExcludedBrand(text)) errors.push(`${path}: menciona la marca excluida.`);
  });
  return errors;
}

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
function deepFreeze(value) {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/** @param {string[]} errors */
function failOn(errors) {
  if (errors.length) throw new Error(errors.join('\n'));
}

/**
 * Una dirección /productos/{id}/ es de un producto o de un retirado, nunca de los dos, ni de dos retirados.
 * Con datos validados no se llega a romperla: `validateCatalog` no repite ids entre las fichas, el espacio de nombres
 * «ejemplo-» separa las fichas reales de los ejemplos y `validateExampleProducts` no repite ids entre ejemplos. Es la
 * última defensa de `createSiteData` antes de generar dos páginas en la misma dirección.
 * @param {readonly { id: string }[]} products Los productos listados (reales y de ejemplo).
 * @param {readonly { id: string }[]} retiredProducts Los retirados (reales y de ejemplo).
 * @throws {Error} si un id se repite.
 */
export function assertDistinctProductIds(products, retiredProducts) {
  const productIds = new Set(products.map(product => product.id));
  const retiredIds = new Set(retiredProducts.map(product => product.id));
  if (retiredIds.size !== retiredProducts.length || retiredProducts.some(product => productIds.has(product.id))) {
    throw new Error('Hay identificadores repetidos entre los productos y los retirados.');
  }
}

/**
 * Construye los datos públicos del sitio para un modo de compilación.
 *
 * - Los productos reales entran únicamente por `getPublishedProducts`, que valida el catálogo completo
 *   y entrega solo los campos públicos de las fichas aprobadas.
 * - Los productos retirados que fueron públicos (`getRetiredProducts`) van en su propia colección,
 *   `retiredProducts`, con solo lo que los identifica: ningún listado, conteo, búsqueda ni selección los incluye.
 * - Los productos de ejemplo solo existen en modo `preview`; en `production` se ignoran aunque se entreguen.
 *   Un ejemplo con `retired: true` va a `retiredProducts`, nunca a `products`.
 * - El alcance de marcas sale de `brands.json` (el validador comprueba que coincide con el registro de investigación).
 *
 * Todo lo que devuelve está congelado: para ordenar o filtrar, copia antes (`[...products]`).
 * @param {SiteSources} sources
 * @returns {SiteData}
 */
export function createSiteData({ mode, catalog, brands, exampleProducts = [] }) {
  if (mode !== 'production' && mode !== 'preview') throw new Error(`Modo de sitio no reconocido: «${String(mode)}». Usa "production" o "preview".`);
  const isPreview = mode === 'preview';

  failOn(validateBrands(brands));
  const brandRecords = /** @type {BrandRecord[]} */ (brands);
  const brandScope = { sources: brandRecords.map(brand => ({ entity_id: brand.id, name: brand.name, entity_type: brand.kind })) };
  const published = getPublishedProducts(catalog, brandScope);
  const retiredRecords = getRetiredProducts(catalog, brandScope);
  const editorial = /** @type {Catalog} */ (catalog);

  const visibleCategories = editorial.categories.filter(category => category.status === 'approved' || (isPreview && category.status === 'draft'));
  const categoryNames = new Map(visibleCategories.map(category => [category.id, category.name]));
  const brandNames = new Map(brandRecords.map(brand => [brand.id, brand.name]));

  /** @type {ExampleProductRecord[]} */
  let examples = [];
  /** @type {ExampleProductRecord[]} */
  let retiredExamples = [];
  if (isPreview) {
    failOn(validateExampleProducts(exampleProducts, { categoryIds: editorial.categories.map(category => category.id), brands: brandRecords }));
    const all = /** @type {ExampleProductRecord[]} */ (exampleProducts);
    examples = all.filter(example => example.retired !== true);
    retiredExamples = all.filter(example => example.retired === true);
  }

  /** @param {string} productId @param {readonly string[]} ids */
  const namesOf = (productId, ids) => ids.map(id => {
    const name = categoryNames.get(id);
    if (name === undefined) throw new Error(`${productId}: la categoría «${id}» no es pública en modo ${mode}.`);
    return name;
  });

  /** @type {PublicProduct[]} */
  const products = [
    ...published.map(product => {
      const brandName = brandNames.get(product.brandId);
      if (brandName === undefined) throw new Error(`${product.id}: la marca «${product.brandId}» no está en la lista pública de marcas.`);
      return {
        id: product.id,
        url: routes.product(product.id),
        name: product.name,
        brandId: product.brandId,
        brandName,
        code: product.model,
        categoryIds: [...product.categoryIds],
        categoryNames: namesOf(product.id, product.categoryIds),
        summary: product.description,
        characteristics: [...product.characteristics],
        saleUnit: product.saleUnit,
        variants: product.variants.map(variant => ({ id: variant.id, label: variant.label, code: variant.manufacturerCode })),
        image: { url: product.image.url, alt: product.image.alt },
        documents: product.documents.map(document => ({ label: document.label, url: document.url })),
        isExample: false,
      };
    }),
    ...examples.map(example => ({
      id: example.id,
      url: routes.product(example.id),
      name: example.name,
      brandId: null,
      brandName: EXAMPLE_BRAND_NAME,
      code: example.code,
      categoryIds: [...example.categoryIds],
      categoryNames: namesOf(example.id, example.categoryIds),
      summary: example.summary,
      characteristics: [...example.characteristics],
      saleUnit: example.saleUnit,
      variants: example.variants.map(variant => ({ id: variant.id, label: variant.label, code: variant.code })),
      image: null,
      documents: [],
      isExample: true,
    })),
  ];
  const productById = new Map(products.map(product => [product.id, product]));
  if (productById.size !== products.length) throw new Error('Hay identificadores de producto repetidos entre el catálogo y los ejemplos.');

  // Retirados: solo identificación y las categorías públicas en este modo (pueden quedar sin ninguna).
  /** @param {readonly string[]} ids */
  const publicCategoryIds = ids => ids.filter(id => categoryNames.has(id));
  /** @type {PublicRetiredProduct[]} */
  const retiredProducts = [
    ...retiredRecords.map(record => {
      const brandName = brandNames.get(record.brandId);
      if (brandName === undefined) throw new Error(`${record.id}: la marca «${record.brandId}» no está en la lista pública de marcas.`);
      const ids = publicCategoryIds(record.categoryIds);
      return {
        id: record.id, url: routes.product(record.id), name: record.name, brandId: record.brandId, brandName, code: record.model,
        categoryIds: ids, categoryNames: namesOf(record.id, ids), isExample: false,
      };
    }),
    ...retiredExamples.map(example => {
      const ids = publicCategoryIds(example.categoryIds);
      return {
        id: example.id, url: routes.product(example.id), name: example.name, brandId: null, brandName: EXAMPLE_BRAND_NAME, code: example.code,
        categoryIds: ids, categoryNames: namesOf(example.id, ids), isExample: true,
      };
    }),
  ];
  assertDistinctProductIds(products, retiredProducts);
  const retiredById = new Map(retiredProducts.map(product => [product.id, product]));

  /** @param {string} id */
  const productsByCategory = id => products.filter(product => product.categoryIds.includes(id));
  /** @param {string} id */
  const productsByBrand = id => products.filter(product => product.brandId === id);

  /** @type {PublicCategory[]} */
  const categories = visibleCategories.map(category => ({
    id: category.id,
    name: category.name,
    shortName: category.shortName ?? category.name,
    summary: category.summary ?? '',
    isDraft: category.status !== 'approved',
    productCount: productsByCategory(category.id).length,
    url: routes.category(category.id),
  }));
  /** @type {PublicBrand[]} */
  const publicBrands = brandRecords.map(brand => ({
    id: brand.id,
    name: brand.name,
    kind: brand.kind,
    manufacturerLinks: brand.manufacturerLinks.map(link => ({ label: link.label, url: link.url })),
    productCount: productsByBrand(brand.id).length,
    url: routes.brand(brand.id),
  }));
  const categoryById = new Map(categories.map(category => [category.id, category]));
  const brandById = new Map(publicBrands.map(brand => [brand.id, brand]));

  /** @param {number} [limit] */
  const featuredProducts = (limit = 8) => {
    const max = Math.min(Math.max(0, Math.trunc(Number(limit)) || 0), products.length);
    /** @type {PublicProduct[]} */
    const picked = [];
    const queues = categories.map(category => productsByCategory(category.id));
    while (picked.length < max) {
      const before = picked.length;
      for (const queue of queues) {
        const next = queue.find(product => !picked.includes(product));
        if (next && picked.length < max) picked.push(next);
      }
      if (picked.length === before) break;
    }
    return picked;
  };

  /** @type {SiteData} */
  const site = {
    mode,
    isPreview,
    categories: deepFreeze(categories),
    brands: deepFreeze(publicBrands),
    products: deepFreeze(products),
    paths: deepFreeze({
      categoryIds: categories.map(category => category.id),
      brandIds: publicBrands.map(brand => brand.id),
      productIds: products.map(product => product.id),
    }),
    getCategory: id => categoryById.get(id),
    getBrand: id => brandById.get(id),
    getProduct: id => productById.get(id),
    retiredProducts: deepFreeze(retiredProducts),
    getRetiredProduct: id => retiredById.get(id),
    productsByCategory,
    productsByBrand,
    featuredProducts,
  };
  return Object.freeze(site);
}
