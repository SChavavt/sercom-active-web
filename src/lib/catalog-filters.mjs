// @ts-check
// Filtros combinables del catálogo: categorías y marcas, junto con la búsqueda por texto.
// Apto para el navegador y para node:test: solo importa `routes.mjs`, `search.mjs` y `text.mjs`; no lee datos.
//
// Conceptos:
//   - una *ficha de filtro* es `parametro:id` («categoria:manos», «marca:ansell»); cada tarjeta del catálogo lleva las
//     suyas en `data-facets`, separadas por espacios (`facetText`, al compilar);
//   - un *grupo* es un parámetro con sus opciones (`buildFacetGroups`, al compilar);
//   - los *filtros* son `{ categoria: string[], marca: string[] }` y el *estado* es `{ query, filters }`.
//
// La dirección del catálogo es `/catalogo/?q=<texto>&categoria=<id>&categoria=<id>&marca=<id>`: primero `q`, luego cada
// `categoria` y luego cada `marca`, con los parámetros repetidos (`catalogHref` la escribe y `parseCatalogState` la lee).
// Dentro de un grupo las opciones se suman (O); entre grupos, y con el texto, se restringen (Y).
//
// Ninguna función cambia sus argumentos.
/** @import { CatalogFilters, CatalogItem, CatalogResult, CatalogState, FacetGroup, FacetOption, FacetParam, FacetProduct } from '../types/catalog-filters.ts' */
import { routes } from './routes.mjs';
import { displayQuery, isActiveQuery, matchesSearchText, SEARCH_PARAM } from './search.mjs';
import { normalizeText } from './text.mjs';

/** Los parámetros de los grupos, en el orden de los grupos en la página y en la dirección. */
export const FACET_PARAMS = /** @type {readonly FacetParam[]} */ (Object.freeze(['categoria', 'marca']));

/** Títulos de los grupos. */
const GROUP_LABELS = Object.freeze({ categoria: 'Categorías', marca: 'Marcas' });
/** Un id de la dirección: minúsculas, cifras y guiones sueltos, como los de los datos. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_ID_LENGTH = 80;
const MAX_IDS_PER_PARAM = 50;

/** @param {unknown} value @returns {value is string} */
const isSlug = value => typeof value === 'string' && value.length <= MAX_ID_LENGTH && SLUG.test(value);

/**
 * Id de un nombre visible, para una marca sin página de marca (`brandId` nulo): el nombre normalizado (`normalizeText`)
 * con cada tramo de lo que no es una letra de la «a» a la «z» o una cifra cambiado por un guion, sin guiones en los
 * extremos. «Protección de manos» → «proteccion-de-manos». Así el id siempre tiene la forma que acepta la dirección.
 * @param {unknown} label
 * @returns {string}
 */
export function facetId(label) {
  return normalizeText(label).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Fichas de filtro de un producto: una «categoria:<id>» por categoría y una «marca:<brandId>» o, cuando no tiene página
 * de marca, «marca:<facetId(brandName)>» (nada si tampoco tiene nombre de marca).
 * @param {FacetProduct} product
 * @returns {string[]}
 */
export function productFacets(product) {
  /** @type {string[]} */
  const facets = [];
  for (const id of product?.categoryIds ?? []) {
    const facet = `categoria:${id}`;
    if (typeof id === 'string' && id && !facets.includes(facet)) facets.push(facet);
  }
  const brand = brandFacetId(product);
  if (brand) facets.push(`marca:${brand}`);
  return facets;
}

/**
 * Id de la opción de marca de un producto: su `brandId` o, sin él, el de su nombre de marca.
 * @param {FacetProduct | null | undefined} product
 * @returns {string}
 */
function brandFacetId(product) {
  if (typeof product?.brandId === 'string' && product.brandId) return product.brandId;
  return facetId(product?.brandName);
}

/**
 * El valor de `data-facets` de la tarjeta de un producto: sus fichas separadas por un espacio.
 * @param {FacetProduct} product
 * @returns {string}
 */
export function facetText(product) {
  return productFacets(product).join(' ');
}

/**
 * Grupos de filtros para una lista de productos (al compilar). Solo entran las opciones con al menos un producto de la
 * lista, y un grupo sin opciones se omite.
 *   - Categorías: en el orden de `categories`, con el nombre de la categoría.
 *   - Marcas: primero las de `brands`, en su orden y con su nombre; luego las marcas sin página, en el orden en que
 *     aparecen por primera vez en la lista, con el nombre de marca del producto.
 * `count` es el número de productos de la lista con esa opción.
 * @param {readonly FacetProduct[]} products
 * @param {{ categories: readonly { id: string, name: string }[], brands: readonly { id: string, name: string }[] }} sources
 * @returns {FacetGroup[]}
 */
export function buildFacetGroups(products, { categories, brands }) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const product of products) for (const facet of productFacets(product)) counts.set(facet, (counts.get(facet) ?? 0) + 1);
  const count = (/** @type {FacetParam} */ param, /** @type {string} */ id) => counts.get(`${param}:${id}`) ?? 0;

  /** @type {FacetOption[]} */
  const categoryOptions = [];
  for (const category of categories) {
    if (count('categoria', category.id) > 0) categoryOptions.push({ id: category.id, label: category.name, count: count('categoria', category.id) });
  }
  /** @type {FacetOption[]} */
  const brandOptions = [];
  const seen = new Set();
  for (const brand of brands) {
    if (seen.has(brand.id) || count('marca', brand.id) === 0) continue;
    seen.add(brand.id);
    brandOptions.push({ id: brand.id, label: brand.name, count: count('marca', brand.id) });
  }
  for (const product of products) {
    const id = brandFacetId(product);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    brandOptions.push({ id, label: String(product.brandName ?? '').trim() || id, count: count('marca', id) });
  }
  /** @type {FacetGroup[]} */
  const groups = [];
  if (categoryOptions.length) groups.push({ param: 'categoria', label: GROUP_LABELS.categoria, options: categoryOptions });
  if (brandOptions.length) groups.push({ param: 'marca', label: GROUP_LABELS.marca, options: brandOptions });
  return groups;
}

/**
 * Filtros sin nada marcado.
 * @returns {CatalogFilters}
 */
export function emptyFilters() {
  return { categoria: [], marca: [] };
}

/**
 * Estado del catálogo leído de la dirección: `search` es el texto de `location.search` (con «?» o sin él) o un
 * `URLSearchParams`. `query` es `displayQuery` del primer `q`. De cada parámetro de `FACET_PARAMS` se toman los valores
 * que tienen forma de id (minúsculas, cifras y guiones, hasta 80 caracteres), sin repetir, en el orden de la dirección y
 * hasta 50. Lo demás se ignora (un valor en mayúsculas, con espacios, con «%» o con forma de código). Nunca lanza.
 * @param {unknown} search
 * @returns {CatalogState}
 */
export function parseCatalogState(search) {
  /** @type {URLSearchParams} */
  let params;
  try {
    if (search instanceof URLSearchParams) params = search;
    else params = new URLSearchParams(typeof search === 'string' ? search.replace(/^\?/, '') : '');
  } catch {
    params = new URLSearchParams();
  }
  const filters = emptyFilters();
  for (const param of FACET_PARAMS) {
    /** @type {string[]} */
    const ids = [];
    for (const value of params.getAll(param)) {
      if (ids.length >= MAX_IDS_PER_PARAM) break;
      if (isSlug(value) && !ids.includes(value)) ids.push(value);
    }
    filters[param] = ids;
  }
  return { query: displayQuery(params.get(SEARCH_PARAM) ?? ''), filters };
}

/**
 * Deja en los filtros solo los ids que ofrecen los grupos, en el orden de sus opciones (el orden canónico). Un grupo
 * que no está en `groups` queda sin nada marcado.
 * @param {Partial<CatalogFilters> | null | undefined} filters
 * @param {readonly FacetGroup[]} groups
 * @returns {CatalogFilters}
 */
export function restrictFilters(filters, groups) {
  const result = emptyFilters();
  for (const param of FACET_PARAMS) {
    const chosen = new Set(Array.isArray(filters?.[param]) ? filters[param] : []);
    const group = groups.find(candidate => candidate.param === param);
    result[param] = group ? group.options.map(option => option.id).filter(id => chosen.has(id)) : [];
  }
  return result;
}

/**
 * ¿Hay alguna opción marcada?
 * @param {Partial<CatalogFilters> | null | undefined} filters
 * @returns {boolean}
 */
export function hasActiveFilters(filters) {
  return FACET_PARAMS.some(param => Array.isArray(filters?.[param]) && filters[param].length > 0);
}

/**
 * Texto del título de un grupo con opciones marcadas: «1 seleccionada», «2 seleccionadas»; cadena vacía con 0.
 * @param {number} count
 * @returns {string}
 */
export function selectedLabel(count) {
  const total = Math.max(0, Math.trunc(Number(count)) || 0);
  if (total === 0) return '';
  return `${total} ${total === 1 ? 'seleccionada' : 'seleccionadas'}`;
}

/**
 * Dirección del catálogo para un estado: `routes.catalog` y la consulta canónica: `q` (solo si la búsqueda está activa:
 * `displayQuery`, codificado), luego cada `categoria` y luego cada `marca`. Los ids que no tienen forma de id o que se
 * repiten se omiten. Sin filtros es `routes.search(displayQuery(query))` para una búsqueda activa y `routes.catalog`
 * para un texto que no es una búsqueda («%%», «-», vacío).
 * @param {{ query?: unknown, filters?: Partial<CatalogFilters> | null } | null | undefined} state
 * @returns {string}
 */
export function catalogHref(state) {
  /** @type {string[]} */
  const parts = [];
  if (isActiveQuery(state?.query)) parts.push(`${SEARCH_PARAM}=${encodeURIComponent(displayQuery(state?.query))}`);
  for (const param of FACET_PARAMS) {
    const values = state?.filters?.[param];
    /** @type {string[]} */
    const ids = [];
    for (const id of Array.isArray(values) ? values : []) if (isSlug(id) && !ids.includes(id)) ids.push(id);
    for (const id of ids) parts.push(`${param}=${encodeURIComponent(id)}`);
  }
  return parts.length ? `${routes.catalog}?${parts.join('&')}` : routes.catalog;
}

/**
 * Aplica un estado a las tarjetas del catálogo (en el navegador).
 * `items`: el `data-search` y el `data-facets` de cada tarjeta, en el orden de la página.
 *   - `visible[i]`: la tarjeta coincide con la búsqueda (`matchesSearchText`) y, en cada grupo con ids marcados, lleva
 *     al menos uno de ellos;
 *   - `count`: tarjetas visibles;
 *   - `optionCounts[param][id]`: tarjetas que coinciden con la búsqueda y con lo marcado en los OTROS grupos y llevan
 *     esa opción (lo que el visitante obtendría marcando solo esa opción en su grupo, con lo demás como está). Cada
 *     opción de `groups` tiene su número, también 0.
 * Usa los filtros tal como llegan: para ignorar ids que la página no ofrece, pasa antes por `restrictFilters`.
 * @param {readonly CatalogItem[]} items
 * @param {{ query?: unknown, filters?: Partial<CatalogFilters> | null }} state
 * @param {readonly FacetGroup[]} groups
 * @returns {CatalogResult}
 */
export function applyCatalogState(items, state, groups) {
  const selected = FACET_PARAMS.map(param => {
    const values = state?.filters?.[param];
    return { param, tokens: (Array.isArray(values) ? values : []).map(id => `${param}:${id}`) };
  });
  const cards = items.map(item => {
    const facets = new Set(String(item?.facets ?? '').split(' ').filter(Boolean));
    return {
      facets,
      query: matchesSearchText(item?.search, state?.query),
      // Por grupo: ¿la tarjeta cumple con lo marcado en ese grupo? (un grupo sin nada marcado no restringe)
      groups: selected.map(({ tokens }) => tokens.length === 0 || tokens.some(token => facets.has(token))),
    };
  });
  const visible = cards.map(card => card.query && card.groups.every(Boolean));

  /** @type {CatalogResult['optionCounts']} */
  const optionCounts = { categoria: {}, marca: {} };
  for (const group of groups) {
    const position = FACET_PARAMS.indexOf(group.param);
    if (position === -1) continue;
    const candidates = cards.filter(card => card.query && card.groups.every((ok, index) => index === position || ok));
    for (const option of group.options) {
      const token = `${group.param}:${option.id}`;
      optionCounts[group.param][option.id] = candidates.filter(card => card.facets.has(token)).length;
    }
  }
  return { visible, count: visible.filter(Boolean).length, optionCounts };
}
