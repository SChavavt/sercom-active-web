// Formas públicas de los datos del sitio (lo que las páginas pueden imprimir).
// Las produce `src/lib/site-data-core.mjs`; las páginas las reciben desde `src/lib/site-data.mjs`.
// Ninguna incluye aprobación, fuente, estado editorial ni datos del registro de investigación.

/** `production`: solo lo aprobado. `preview`: además categorías en borrador y productos de ejemplo. */
export type SiteMode = 'production' | 'preview';

/** Clase de un enlace de marca: el catálogo en PDF, el catálogo en línea o el sitio del fabricante. */
export type ManufacturerLinkKind = 'pdf' | 'online' | 'site';

/** Enlace de una marca al sitio de su fabricante: su catálogo en PDF, su catálogo en línea o su sitio. */
export interface ManufacturerLink {
  /** Una de `MANUFACTURER_LINK_LABELS` (`site-data-core.mjs`), la que corresponde a `kind`. */
  readonly label: string;
  readonly url: string;
  readonly kind: ManufacturerLinkKind;
  /** Solo en el PDF: la edición y el tamaño que se conocen («2026 v2 · 49 MB»); `null` sin ellos y en los demás. */
  readonly detail: string | null;
}

export interface PublicCategory {
  readonly id: string;
  /** Nombre completo, por ejemplo «Protección de manos». */
  readonly name: string;
  /** Nombre corto para menús y mosaicos, por ejemplo «Manos». */
  readonly shortName: string;
  /** Línea orientativa de subcategorías; cadena vacía si no hay. */
  readonly summary: string;
  /** `true` cuando la categoría sigue en borrador (solo se ve en la vista previa). */
  readonly isDraft: boolean;
  /** Productos públicos de la categoría en el modo actual. */
  readonly productCount: number;
  /** `/categorias/{id}/` */
  readonly url: string;
}

export interface PublicBrand {
  readonly id: string;
  readonly name: string;
  /** `supplier`: proveedor (hoy Espomega); no tiene productos propios. */
  readonly kind: 'brand' | 'supplier';
  /** De cero a tres enlaces, en este orden: catálogo en PDF, catálogo en línea y sitio del fabricante. */
  readonly manufacturerLinks: readonly ManufacturerLink[];
  /** `true` si la marca tiene un catálogo del fabricante (en PDF o en línea): sale en «Catálogos de los fabricantes». */
  readonly hasCatalog: boolean;
  /** Productos públicos de la marca en el modo actual (los ejemplos no cuentan: no tienen marca real). */
  readonly productCount: number;
  /** `/marcas/{id}/` */
  readonly url: string;
}

export interface PublicVariant {
  readonly id: string;
  readonly label: string;
  /** Código del fabricante para la variante; cadena vacía si la variante no tiene código propio. */
  readonly code: string;
}

/**
 * Fotografía de un producto, en una de dos formas: un archivo de `src/assets/productos/` que la compilación optimiza
 * (`file`; el ancho y el alto se leen del archivo) o una dirección que la página usa tal cual, con su ancho y alto
 * (`url`). La dibuja `ProductPhoto.astro`.
 */
export type PublicImage = PublicFileImage | PublicUrlImage;

export interface PublicFileImage {
  /** Nombre del archivo en `src/assets/productos/`, sin carpeta. */
  readonly file: string;
  readonly alt: string;
  /** Página `https` del fabricante de donde viene la foto: la ficha la enlaza en el crédito bajo la foto. */
  readonly sourceUrl: string;
}

export interface PublicUrlImage {
  /** Dirección absoluta `https`. */
  readonly url: string;
  /** Ancho y alto de la foto en píxeles. */
  readonly width: number;
  readonly height: number;
  readonly alt: string;
  /** Página `https` del fabricante de donde viene la foto: la ficha la enlaza en el crédito bajo la foto. */
  readonly sourceUrl: string;
}

export interface PublicDocument {
  readonly label: string;
  readonly url: string;
}

/** Forma única para dibujar un producto, sea una ficha aprobada o un ejemplo de la vista previa. */
export interface PublicProduct {
  readonly id: string;
  /** `/productos/{id}/` */
  readonly url: string;
  readonly name: string;
  /** `null` en los ejemplos: no pertenecen a una marca real y no tienen página de marca. */
  readonly brandId: string | null;
  /** Nombre visible de la marca; en los ejemplos, «Marca de ejemplo», «Marca de ejemplo Beta» o «Marca de ejemplo Gamma». */
  readonly brandName: string;
  /** Modelo o código exacto del fabricante. */
  readonly code: string;
  readonly categoryIds: readonly string[];
  /** Nombres de las categorías, en el mismo orden que `categoryIds`. */
  readonly categoryNames: readonly string[];
  readonly summary: string;
  readonly characteristics: readonly string[];
  readonly saleUnit: string;
  readonly variants: readonly PublicVariant[];
  /** Normas del fabricante, solo su texto, en el orden de los datos; lista vacía sin normas y en todos los ejemplos. */
  readonly standards: readonly string[];
  /** `null` cuando no hay fotografía (una ficha aprobada sin foto y todos los ejemplos): la página muestra el icono de la categoría. */
  readonly image: PublicImage | null;
  readonly documents: readonly PublicDocument[];
  /** `true` solo en los ejemplos de la vista previa: la página debe mostrar la etiqueta «Ejemplo». */
  readonly isExample: boolean;
}

/**
 * Producto retirado que fue público (R-STATE-04): conserva una página informativa en su dirección, con solo lo que
 * lo identifica. No está en `products`: ningún listado, conteo, búsqueda ni selección lo incluye.
 */
export interface PublicRetiredProduct {
  readonly id: string;
  /** `/productos/{id}/`, la misma dirección que tuvo. */
  readonly url: string;
  readonly name: string;
  /** `null` en el ejemplo retirado de la vista previa. */
  readonly brandId: string | null;
  readonly brandName: string;
  readonly code: string;
  /** Solo sus categorías públicas en el modo actual; puede quedar vacía. */
  readonly categoryIds: readonly string[];
  readonly categoryNames: readonly string[];
  /** `true` en el ejemplo retirado de la vista previa: la página muestra la etiqueta «Ejemplo». */
  readonly isExample: boolean;
}

/** Identificadores para `getStaticPaths()` en el modo actual. */
export interface SitePaths {
  readonly categoryIds: readonly string[];
  readonly brandIds: readonly string[];
  readonly productIds: readonly string[];
}

export interface SiteData {
  readonly mode: SiteMode;
  readonly isPreview: boolean;
  readonly categories: readonly PublicCategory[];
  readonly brands: readonly PublicBrand[];
  readonly products: readonly PublicProduct[];
  readonly paths: SitePaths;
  getCategory(id: string): PublicCategory | undefined;
  getBrand(id: string): PublicBrand | undefined;
  getProduct(id: string): PublicProduct | undefined;
  /** Retirados públicos en el modo actual, en el orden del catálogo (los ejemplos al final, solo en la vista previa). */
  readonly retiredProducts: readonly PublicRetiredProduct[];
  getRetiredProduct(id: string): PublicRetiredProduct | undefined;
  /** Productos de una categoría, en el orden del catálogo. Lista vacía si no existe o no es pública. */
  productsByCategory(id: string): PublicProduct[];
  /** Productos de una marca, en el orden del catálogo. Lista vacía si no existe. */
  productsByBrand(id: string): PublicProduct[];
  /** Selección variada para la portada: recorre las categorías por turnos. Por defecto, hasta ocho. */
  featuredProducts(limit?: number): PublicProduct[];
}

/** Datos que recibe `createSiteData`. Se validan al construir; por eso llegan sin tipo estricto. */
export interface SiteSources {
  mode: SiteMode;
  /** Contenido de `src/data/catalog.json`. */
  catalog: unknown;
  /** Contenido de `src/data/brands.json`. */
  brands: unknown;
  /** Contenido de `src/data/preview/example-products.json`. Se ignora en modo producción. */
  exampleProducts?: unknown;
}

/** Registro de `src/data/brands.json`. */
export interface BrandRecord {
  id: string;
  name: string;
  kind: 'brand' | 'supplier';
  /** De cero a tres; solo el PDF lleva `edition` y `megabytes` (los valida `validateBrands`). */
  manufacturerLinks: { label: string; url: string; edition?: string; megabytes?: number }[];
}

/** Registro de `src/data/preview/example-products.json`. No es una ficha del catálogo. */
export interface ExampleProductRecord {
  id: string;
  name: string;
  /** Una de `EXAMPLE_BRAND_NAMES` (`site-data-core.mjs`). */
  brandName: string;
  code: string;
  categoryIds: string[];
  saleUnit: string;
  summary: string;
  characteristics: string[];
  /** Puede estar vacía: un producto sin variantes. */
  variants: { id: string; label: string; code: string }[];
  /** `true`: ejemplo de producto retirado (solo tiene su página informativa; no entra en ningún listado). */
  retired?: boolean;
}

/** Campos de un producto que usa la búsqueda. */
export type SearchableProduct = Pick<PublicProduct, 'name' | 'brandName' | 'code' | 'categoryNames'> & {
  readonly variants: readonly Pick<PublicVariant, 'code'>[];
};

/** Rutas del sitio. Todas terminan en diagonal. */
export interface SiteRoutes {
  readonly home: string;
  readonly catalog: string;
  readonly brands: string;
  readonly quoteList: string;
  readonly specialRequest: string;
  readonly contact: string;
  readonly privacy: string;
  category(id: string): string;
  brand(id: string): string;
  product(id: string): string;
  /** `/marcas/#catalogos`: la sección «Catálogos de los fabricantes» de la lista de marcas. */
  readonly brandCatalogs: string;
  /** `/catalogo/?q=...`; sin consulta devuelve `/catalogo/`. */
  search(query?: string | null): string;
}
