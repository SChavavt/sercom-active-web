// @ts-check
// Lógica pura de los datos públicos del sitio: recibe los datos como argumentos y no importa
// ningún archivo de datos, de modo que se prueba con node:test sin compilar el sitio.
// Las páginas no usan este módulo directamente: importan `site-data.mjs`.
/**
 * @import { Catalog } from '../types/catalog.ts'
 * @import { BrandRecord, ExampleProductRecord, PublicBrand, PublicCategory, PublicProduct, PublicRetiredProduct, SiteData, SiteSources } from '../types/site.ts'
 */
import { BLOCKED_RESOURCE_TYPES, getPublishedProducts, getRetiredProducts, isHttpsAddress, isWithdrawn, mentionsExcludedBrand, validDate, WITHDRAWN_STATUS } from './catalog-policy.mjs';
import { routes } from './routes.mjs';
import { cleanQuery, normalizeText } from './text.mjs';

export { routes };

/** Aviso que lleva cada página de una compilación de vista previa. */
export const PREVIEW_NOTICE = 'Vista previa para revisión. Los productos que aparecen son ejemplos de diseño, no artículos reales.';
/**
 * Aviso que lleva cada página de la compilación de producción hasta el lanzamiento (R-RULE-12, F.21). Se retira a
 * propósito al publicar, junto con `noindex` (BaseLayout.astro); el escáner lo exige antes y lo prohíbe con --launch.
 */
export const DEVELOPMENT_NOTICE = 'Sitio en preparación · Versión inicial para revisión';
/** Etiqueta visible de cada producto de ejemplo. */
export const EXAMPLE_TAG = 'Ejemplo';
/** Marca del primer producto de ejemplo. Nunca es una marca real. */
export const EXAMPLE_BRAND_NAME = 'Marca de ejemplo';
/**
 * Las únicas marcas que puede llevar un producto de ejemplo: tres, para revisar en la vista previa el grupo de marcas de
 * los filtros. Ninguna es una marca real ni tiene página de marca (los ejemplos llevan `brandId: null`). La segunda y la
 * tercera terminan en una palabra completa («Beta», «Gamma») para que la búsqueda las distinga: una sola letra coincide
 * con casi cualquier texto.
 */
export const EXAMPLE_BRAND_NAMES = Object.freeze([EXAMPLE_BRAND_NAME, 'Marca de ejemplo Beta', 'Marca de ejemplo Gamma']);
/**
 * Las tres etiquetas de los enlaces de una marca (`manufacturerLinks`), una por clase de enlace y en el orden en que se
 * escriben y se muestran: el catálogo general del fabricante en PDF, la página donde se consulta o se descargan sus
 * catálogos, y su sitio. Cada una va una vez por marca como máximo. Las páginas nunca escriben una etiqueta: imprimen
 * la del dato.
 */
export const MANUFACTURER_LINK_LABELS = Object.freeze({
  pdf: 'Catálogo del fabricante (PDF)',
  online: 'Catálogo en línea del fabricante',
  site: 'Sitio del fabricante',
});
/** @typedef {'pdf' | 'online' | 'site'} LinkKind */
/** Las clases de enlace en su orden: `pdf`, `online`, `site`. */
const LINK_KINDS = /** @type {LinkKind[]} */ (['pdf', 'online', 'site']);
/** La clase de enlace de cada etiqueta. */
const KIND_OF_LABEL = /** @type {Map<string, LinkKind>} */ (new Map(LINK_KINDS.map(kind => [MANUFACTURER_LINK_LABELS[kind], kind])));
/**
 * Los tipos de recurso del registro que admite cada etiqueta. «Sitio del fabricante» admite cualquiera que no esté
 * bloqueado (`null`). Una política de uso, una documentación de exportación o la página de un solo producto nunca son
 * un catálogo.
 */
const LINK_RESOURCE_TYPES = {
  pdf: { types: ['pdf', 'pdf_viewer'], purpose: 'un PDF (tipo pdf o pdf_viewer)' },
  online: { types: ['web', 'landing', 'catalog_platform'], purpose: 'la página donde se consulta o se descarga el catálogo (tipo web, landing o catalog_platform)' },
  site: null,
};
/** Largo máximo de la edición de un catálogo en PDF («2026 v2»). */
export const MAX_EDITION_LENGTH = 24;
/** Tamaño máximo, en megabytes, que se escribe para un catálogo en PDF. */
export const MAX_MEGABYTES = 999;
/** Las etiquetas en su orden, para los mensajes: «A», «B» y «C». */
const LABEL_LIST = `«${MANUFACTURER_LINK_LABELS.pdf}», «${MANUFACTURER_LINK_LABELS.online}» y «${MANUFACTURER_LINK_LABELS.site}»`;
/** Un texto limpio de una línea: como lo deja `cleanQuery` y sin caracteres que no se ven. */
/** @param {unknown} value @returns {value is string} */
const isCleanLine = value => typeof value === 'string' && value.trim() !== '' && cleanQuery(value) === value && !/\p{DI}/u.test(value);

/**
 * Lo que la página imprime junto a un catálogo en PDF: la edición y el tamaño que se conocen, unidos con « · »
 * («2026 v2 · 49 MB», «2026 v2», «49 MB»); `null` sin ninguno de los dos o en otro enlace.
 * @param {{ edition?: string, megabytes?: number }} link
 * @returns {string | null}
 */
export function manufacturerLinkDetail(link) {
  const parts = [link.edition, link.megabytes === undefined ? undefined : `${link.megabytes} MB`].filter(part => part !== undefined);
  return parts.length ? parts.join(' · ') : null;
}

/** @param {unknown} value @returns {value is string} */
const isText = value => typeof value === 'string' && value.trim().length > 0;
/** @param {unknown} value @returns {value is string} */
const isId = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value);
/** Una dirección `https` escrita completa, con la misma regla que las direcciones de una ficha. */
const isHttps = isHttpsAddress;
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
const LINK_KEYS = ['label', 'url', 'edition', 'megabytes'];
// `retired: true` marca el ejemplo de producto retirado: tiene su página, pero no entra en ningún listado.
const EXAMPLE_KEYS = ['id', 'name', 'brandName', 'code', 'categoryIds', 'saleUnit', 'summary', 'characteristics', 'variants', 'retired'];
const VARIANT_KEYS = ['id', 'label', 'code'];
/** «Marca de ejemplo», «Marca de ejemplo Beta» o «Marca de ejemplo Gamma»: las marcas que acepta un ejemplo, para los errores. */
const BRAND_CHOICES = `${EXAMPLE_BRAND_NAMES.slice(0, -1).map(name => `«${name}»`).join(', ')} o «${EXAMPLE_BRAND_NAMES.at(-1)}»`;

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
    errors.push(...linkErrors(brand.manufacturerLinks, isId(brand.id) ? `${path} (${brand.id})` : path));
  });
  return errors;
}

/**
 * Revisa los enlaces de una marca (`manufacturerLinks`): una lista de 0 a 3 enlaces, cada uno con `label` y `url`; la
 * etiqueta es una de `MANUFACTURER_LINK_LABELS`, cada una una vez y en su orden; la dirección es `https` escrita
 * completa y no se repite; solo el PDF puede llevar `edition` (texto de una línea, de 1 a `MAX_EDITION_LENGTH`
 * caracteres) y `megabytes` (entero de 1 a `MAX_MEGABYTES`). Que cada dirección sea un recurso verificado de la
 * marca en el registro, con un tipo que su etiqueta admite, lo revisa `crossCheckBrands`.
 * @param {unknown} links
 * @param {string} path la marca, para los mensajes
 * @returns {string[]}
 */
function linkErrors(links, path) {
  if (!Array.isArray(links)) return [`${path}: manufacturerLinks debe ser una lista de enlaces; escribe [] si la marca no tiene ninguno.`];
  /** @type {string[]} */
  const errors = [];
  if (links.length > LINK_KINDS.length) {
    return [`${path}: manufacturerLinks admite como máximo tres enlaces, uno por etiqueta: ${LABEL_LIST}, en ese orden.`];
  }
  /** @type {LinkKind[]} */
  const kinds = [];
  const urls = new Set();
  links.forEach((link, i) => {
    const where = `${path}.manufacturerLinks[${i}]`;
    if (!isRecord(link)) {
      errors.push(`${where}: debe ser un objeto con label y url.`);
      return;
    }
    for (const key of unknownKeys(link, LINK_KEYS)) errors.push(`${where}.${key}: campo no definido.`);
    const kind = typeof link.label === 'string' ? KIND_OF_LABEL.get(link.label) : undefined;
    const { edition, megabytes } = link;
    if (!kind) errors.push(`${where}.label: ${typeof link.label === 'string' ? `«${link.label}» no es una etiqueta de enlace` : 'falta la etiqueta'}; usa una de estas tres: ${LABEL_LIST.replace(/ y «/, ' o «')}.`);
    else if (kinds.includes(kind)) errors.push(`${where}.label: la etiqueta «${link.label}» ya está en otro enlace de la marca; cada etiqueta va una vez.`);
    else kinds.push(kind);
    if (!isHttps(link.url)) errors.push(`${where}.url: debe ser una URL https escrita completa, como https://www.fabricante.com/catalogo/.`);
    else if (urls.has(link.url)) errors.push(`${where}.url: la dirección ${link.url} ya está en otro enlace de la marca; cada dirección va una vez.`);
    else urls.add(link.url);
    for (const [key, what] of /** @type {const} */ ([['edition', 'la edición'], ['megabytes', 'el tamaño en megabytes']])) {
      if (Object.hasOwn(link, key) && kind && kind !== 'pdf') errors.push(`${where}.${key}: solo el enlace «${MANUFACTURER_LINK_LABELS.pdf}» lleva ${what}; quítalo de este.`);
    }
    if (Object.hasOwn(link, 'edition') && (!isCleanLine(edition) || [...edition].length > MAX_EDITION_LENGTH)) {
      errors.push(`${where}.edition: debe ser un texto de una línea, de 1 a ${MAX_EDITION_LENGTH} caracteres, como lo imprime el fabricante («2026», «2026 v2»).`);
    }
    if (Object.hasOwn(link, 'megabytes') && (typeof megabytes !== 'number' || !Number.isInteger(megabytes) || megabytes < 1 || megabytes > MAX_MEGABYTES)) {
      errors.push(`${where}.megabytes: debe ser un número entero de 1 a ${MAX_MEGABYTES}: lo que pesa el archivo en megabytes (de un millón de bytes), redondeado.`);
    }
  });
  const ordered = [...kinds].sort((a, b) => LINK_KINDS.indexOf(a) - LINK_KINDS.indexOf(b));
  if (ordered.join() !== kinds.join()) errors.push(`${path}: los enlaces van en este orden: ${LABEL_LIST}; ordénalos así.`);
  return errors;
}

/**
 * Compara la lista pública de marcas con el registro de investigación: mismos identificadores,
 * nombres y tipos, y cada enlace debe ser un recurso de esa entidad verificado como accesible, de un tipo que no está
 * bloqueado y que su etiqueta admite (`LINK_RESOURCE_TYPES`). Una entidad retirada del portal (`portal.status`
 * «retirada», `isWithdrawn`) no se espera en brands.json, y si está ahí es un error que dice qué hacer.
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
    if (isWithdrawn(source)) continue;
    if (!records.some(brand => brand.id === source.entity_id)) errors.push(`registro: ${source.entity_id} falta en brands.json.`);
  }
  for (const brand of records) {
    const source = byId.get(brand.id);
    if (!source) {
      errors.push(`${brand.id}: no existe en el registro de investigación.`);
      continue;
    }
    if (isWithdrawn(source)) {
      errors.push(`${brand.id}: en el registro está retirada del portal (${source.portal.on}); quítala de brands.json o, si vuelve al portal, quita la clave portal de su entidad en el registro.`);
      continue;
    }
    if (brand.name !== source.name) errors.push(`${brand.id}: el nombre «${brand.name}» no coincide con el registro («${source.name}»).`);
    if (brand.kind !== source.entity_type) errors.push(`${brand.id}: kind «${brand.kind}» no coincide con el registro («${source.entity_type}»).`);
    for (const link of brand.manufacturerLinks) {
      const resources = Array.isArray(source.resources) ? source.resources : [];
      const resource = resources.find((/** @type {any} */ candidate) => candidate.url === link.url);
      const admitted = LINK_RESOURCE_TYPES[/** @type {LinkKind} */ (KIND_OF_LABEL.get(link.label))];
      if (!resource) errors.push(`${brand.id}: el enlace ${link.url} no es un recurso de esa entidad en el registro.`);
      else if (!String(resource.verification ?? '').startsWith('accesible') || BLOCKED_RESOURCE_TYPES.includes(resource.type)) {
        errors.push(`${brand.id}: el enlace ${link.url} no está verificado como accesible (${resource.type}: ${resource.verification}).`);
      } else if (admitted && !admitted.types.includes(resource.type)) {
        errors.push(`${brand.id}: el enlace ${link.url} lleva la etiqueta «${link.label}», pero en el registro es de tipo «${resource.type}»; esa etiqueta es solo para ${admitted.purpose}. Cambia la etiqueta o enlaza otro recurso de la marca.`);
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

const PORTAL_KEYS = ['status', 'on', 'reason'];

/**
 * Revisa la marca de retiro del portal de cada entidad del registro de investigación que la lleva (`portal`): un
 * objeto con exactamente `status` (hoy solo «retirada»), `on` (el día en que salió, una fecha real AAAA-MM-DD) y
 * `reason` (la decisión, en un texto limpio de una línea). Una entidad sin la clave está en el alcance del sitio. Cada
 * mensaje nombra la entidad y el campo, y dice qué escribir.
 * @param {unknown} registry Contenido de `research/Sercom_Active_Fuentes_Catalogos.json`.
 * @returns {string[]} Errores; lista vacía si todo es correcto.
 */
export function registryPortalErrors(registry) {
  const sources = isRecord(registry) && Array.isArray(registry.sources) ? registry.sources : [];
  /** @type {string[]} */
  const errors = [];
  sources.forEach((source, index) => {
    if (!isRecord(source) || !Object.hasOwn(source, 'portal')) return;
    const where = `${isId(source.entity_id) ? source.entity_id : `sources[${index}]`}.portal`;
    const { portal } = source;
    if (!isRecord(portal)) {
      errors.push(`${where}: debe ser un objeto con status, on y reason, como {"status": "${WITHDRAWN_STATUS}", "on": "2026-11-23", "reason": "…"}; si la marca vuelve al portal, quita la clave portal.`);
      return;
    }
    for (const key of unknownKeys(portal, PORTAL_KEYS)) errors.push(`${where}.${key}: campo no definido; la marca de retiro lleva solo status, on y reason.`);
    if (portal.status === undefined) errors.push(`${where}.status: falta; escribe «${WITHDRAWN_STATUS}».`);
    else if (portal.status !== WITHDRAWN_STATUS) errors.push(`${where}.status: «${String(portal.status)}» no es un estado del portal; el único que existe es «${WITHDRAWN_STATUS}».`);
    if (!validDate(portal.on)) {
      errors.push(`${where}.on: ${portal.on === undefined ? 'falta' : `«${String(portal.on)}» no es una fecha real`}; escribe el día en que la marca salió del portal como AAAA-MM-DD, por ejemplo 2026-11-23.`);
    }
    if (portal.reason === undefined) errors.push(`${where}.reason: falta; escribe en una línea la decisión por la que la marca salió del portal.`);
    else if (typeof portal.reason !== 'string' || !portal.reason.trim()) errors.push(`${where}.reason: ${typeof portal.reason === 'string' ? 'está vacío' : 'debe ser un texto'}; escribe en una línea la decisión por la que la marca salió del portal.`);
    else if (!isCleanLine(portal.reason)) errors.push(`${where}.reason: tiene espacios de más, un salto de línea o un carácter invisible; escríbelo en una sola línea.`);
  });
  return errors;
}

/**
 * Valida los productos de ejemplo de la vista previa. Deben ser inconfundibles con fichas reales:
 * identificador «ejemplo-…», código «EJ-0000», nombre con «de ejemplo», una de las marcas de `EXAMPLE_BRAND_NAMES`
 * y ninguna mención de una marca real. Las variantes pueden faltar (`variants: []`), como en una ficha real; si las
 * hay, cada una lleva su código (a diferencia de una ficha real, donde es opcional). Dos ejemplos no tienen el mismo
 * nombre ni dos variantes de un ejemplo la misma etiqueta (comparados con `normalizeText`), como en el catálogo.
 * `retired: true` marca un ejemplo retirado; sus demás reglas no cambian.
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
  // Nombre ya visto (con `normalizeText`) → el ejemplo que lo usa primero. Como en el catálogo (`validateCatalog`):
  // «Cotizar mi lista» nombra los controles de cada renglón con el nombre y la etiqueta de la variante, y dos ejemplos o
  // dos variantes con el mismo nombre darían a dos renglones los mismos nombres accesibles.
  /** @type {Map<string, string>} */
  const names = new Map();
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
    const nameKey = isText(example.name) ? normalizeText(example.name) : '';
    if (nameKey && names.has(nameKey)) errors.push(`${path}.name: repite el nombre de ${names.get(nameKey)}; cada ejemplo necesita un nombre propio.`);
    else if (nameKey) names.set(nameKey, path);
    if (typeof example.brandName !== 'string' || !EXAMPLE_BRAND_NAMES.includes(example.brandName)) errors.push(`${path}: la marca debe ser ${BRAND_CHOICES}.`);
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
    /** @type {Map<string, number>} */
    const labels = new Map();
    if (!Array.isArray(variants)) errors.push(`${path}: variants debe ser una lista (puede estar vacía).`);
    else for (const [position, variant] of variants.entries()) {
      const valid = isRecord(variant) && unknownKeys(variant, VARIANT_KEYS).length === 0 && isId(variant.id) && !variantIds.has(variant.id)
        && isText(variant.label) && typeof variant.code === 'string' && variant.code.startsWith(`${example.code}-`) && !codes.has(variant.code);
      if (!valid) errors.push(`${path}: variante incompleta, duplicada o con un código que no empieza con el del ejemplo.`);
      if (isRecord(variant)) {
        variantIds.add(variant.id);
        codes.add(variant.code);
        const labelKey = isText(variant.label) ? normalizeText(variant.label) : '';
        if (labelKey && labels.has(labelKey)) errors.push(`${path}.variants[${position}].label: repite la etiqueta de variants[${labels.get(labelKey)}]; cada variante necesita una etiqueta propia.`);
        else if (labelKey) labels.set(labelKey, position);
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
        // Una variante sin código propio lleva `code: ''`: la ficha muestra solo su etiqueta y el mensaje no lleva código.
        variants: product.variants.map(variant => ({ id: variant.id, label: variant.label, code: variant.manufacturerCode ?? '' })),
        // Solo el texto de cada norma: la ficha las muestra en «Normas» y ninguna otra parte del sitio las usa.
        standards: [...product.standards],
        // Solo lo que muestra la página: el archivo o la dirección con sus medidas, el texto alternativo y la página de
        // donde viene la foto (el crédito bajo la foto). Sin foto, `null`: la página muestra el pictograma de la categoría.
        image: product.image === null ? null : 'file' in product.image
          ? { file: product.image.file, alt: product.image.alt, sourceUrl: product.image.sourceUrl }
          : { url: product.image.url, width: product.image.width, height: product.image.height, alt: product.image.alt, sourceUrl: product.image.sourceUrl },
        documents: product.documents.map(document => ({ label: document.label, url: document.url })),
        isExample: false,
      };
    }),
    ...examples.map(example => ({
      id: example.id,
      url: routes.product(example.id),
      name: example.name,
      brandId: null,
      brandName: example.brandName,
      code: example.code,
      categoryIds: [...example.categoryIds],
      categoryNames: namesOf(example.id, example.categoryIds),
      summary: example.summary,
      characteristics: [...example.characteristics],
      saleUnit: example.saleUnit,
      variants: example.variants.map(variant => ({ id: variant.id, label: variant.label, code: variant.code })),
      standards: [],
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
        id: example.id, url: routes.product(example.id), name: example.name, brandId: null, brandName: example.brandName, code: example.code,
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
    // De cada enlace, lo que imprime la página: la etiqueta, la dirección, su clase y, en el PDF, la edición y el
    // tamaño ya escritos en una línea (`detail`).
    manufacturerLinks: brand.manufacturerLinks.map(link => {
      const kind = /** @type {LinkKind} */ (KIND_OF_LABEL.get(link.label));
      return { label: link.label, url: link.url, kind, detail: kind === 'pdf' ? manufacturerLinkDetail(link) : null };
    }),
    hasCatalog: brand.manufacturerLinks.some(link => KIND_OF_LABEL.get(link.label) !== 'site'),
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
