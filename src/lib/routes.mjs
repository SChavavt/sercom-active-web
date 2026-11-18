// @ts-check
// Rutas del sitio. Apto para el navegador y para node:test: solo importa `search.mjs`; no lee datos.
/** @import { SiteRoutes } from '../types/site.ts' */
import { SEARCH_PARAM } from './search.mjs';

/**
 * Rutas del sitio; todas terminan en diagonal, como exige `trailingSlash: 'always'` en astro.config.mjs.
 * `routes.search('guante')` → `/catalogo/?q=guante`; sin texto → `/catalogo/`.
 */
export const routes = Object.freeze(/** @type {SiteRoutes} */ ({
  home: '/',
  catalog: '/catalogo/',
  brands: '/marcas/',
  quoteList: '/cotizar/',
  specialRequest: '/solicitud-especial/',
  contact: '/contacto/',
  privacy: '/privacidad/',
  category: id => `/categorias/${id}/`,
  brand: id => `/marcas/${id}/`,
  product: id => `/productos/${id}/`,
  search: query => {
    const text = String(query ?? '').trim();
    return text ? `/catalogo/?${SEARCH_PARAM}=${encodeURIComponent(text)}` : '/catalogo/';
  },
}));
