// @ts-check
// Datos públicos del sitio: el único módulo de datos que usan las páginas y los componentes.
//
// Exporta `mode`, `isPreview`, `categories`, `brands`, `products`, `retiredProducts`, `paths`, `getCategory`,
// `getBrand`, `getProduct`, `getRetiredProduct`, `productsByCategory`, `productsByBrand`, `featuredProducts`, `routes`,
// `PREVIEW_NOTICE`, `DEVELOPMENT_NOTICE` y `EXAMPLE_TAG`.
//
// SOLO PARA COMPILACIÓN (frontmatter de archivos .astro). Un <script> de navegador no debe alcanzarlo, ni
// directamente ni a través de otro módulo: arrastraría los archivos de datos completos al JavaScript público. Los
// scripts del navegador solo alcanzan los módulos sin datos de `BROWSER_MODULES` (tests/build-mode.test.mjs): hoy
// `text.mjs`, `search.mjs`, `routes.mjs`, `contact-core.mjs`, `catalog-filters.mjs`, `quote-list.mjs`,
// `quote-store.mjs` y `message-page.mjs`. Lo que una página necesita en el navegador viaja en el HTML (`data-*` o un
// bloque `<script type="application/json">`, como el índice público de «Cotizar mi lista»).
//
// Modos (ver docs/datos-y-modos.md):
//   - producción: categorías aprobadas y fichas aprobadas, nada más;
//   - vista previa (CATALOG_PREVIEW=1): además las categorías en borrador y los productos de ejemplo.
import catalog from '../data/catalog.json' with { type: 'json' };
import brandRecords from '../data/brands.json' with { type: 'json' };
import { createSiteData } from './site-data-core.mjs';

export { DEVELOPMENT_NOTICE, EXAMPLE_TAG, PREVIEW_NOTICE } from './site-data-core.mjs';
export { routes } from './routes.mjs';

if (typeof document !== 'undefined') {
  throw new Error('site-data.mjs es solo para compilación: un script de navegador no debe importarlo.');
}

/** @type {unknown} */
let exampleProducts = [];
// La constante va escrita tal cual dentro del `if` y la carga es dinámica: así, con la bandera apagada,
// el empaquetador elimina la rama completa y el archivo de ejemplos no entra en la compilación.
if (__CATALOG_PREVIEW__) {
  exampleProducts = (await import('../data/preview/example-products.json', { with: { type: 'json' } })).default;
}

const site = createSiteData({
  mode: __CATALOG_PREVIEW__ ? 'preview' : 'production',
  catalog,
  brands: brandRecords,
  exampleProducts,
});

export const {
  /** `'production'` o `'preview'`. */
  mode,
  /** `true` en la vista previa: la plantilla muestra `PREVIEW_NOTICE` en todas las páginas. */
  isPreview,
  /** Categorías públicas en el orden del catálogo. Producción: solo aprobadas. */
  categories,
  /** Las diecinueve «Marcas que manejamos», en el orden de la empresa. */
  brands,
  /** Productos públicos: fichas aprobadas y, solo en la vista previa, los ejemplos. */
  products,
  /** Identificadores para `getStaticPaths()`: `categoryIds`, `brandIds`, `productIds`. */
  paths,
  getCategory,
  getBrand,
  getProduct,
  /** Productos retirados que fueron públicos: su página informativa, en la misma dirección. No están en `products`. */
  retiredProducts,
  getRetiredProduct,
  productsByCategory,
  productsByBrand,
  featuredProducts,
} = site;
