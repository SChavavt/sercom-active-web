// Tipos de los filtros combinables del catálogo (`src/lib/catalog-filters.mjs`).

/** Parámetro de la dirección de un grupo de filtros: `?categoria=…` o `?marca=…`. */
export type FacetParam = 'categoria' | 'marca';

/** Lo que necesita `productFacets` de un producto (la forma pública lo tiene). */
export interface FacetProduct {
  readonly categoryIds: readonly string[];
  /** `null` cuando la marca no tiene página (los ejemplos): la opción toma el id de `brandName`. */
  readonly brandId: string | null;
  readonly brandName: string;
}

/** Una opción de un grupo. */
export interface FacetOption {
  /** Id de la dirección: el de la categoría o de la marca, o `facetId(brandName)` para una marca sin página. */
  readonly id: string;
  /** Nombre visible: el de la categoría o de la marca. */
  readonly label: string;
  /** Productos de la lista con esta opción, al compilar. */
  readonly count: number;
}

/** Un grupo de filtros: un parámetro con sus opciones. */
export interface FacetGroup {
  readonly param: FacetParam;
  /** «Categorías» o «Marcas». */
  readonly label: string;
  readonly options: readonly FacetOption[];
}

/** Opciones marcadas, por grupo, en el orden de la dirección. */
export interface CatalogFilters {
  categoria: string[];
  marca: string[];
}

/** Estado del catálogo: la búsqueda (`displayQuery`) y las opciones marcadas. */
export interface CatalogState {
  query: string;
  filters: CatalogFilters;
}

/** Una tarjeta del catálogo, como la lee el navegador. */
export interface CatalogItem {
  /** Su `data-search` (`searchText`). */
  readonly search: string;
  /** Su `data-facets` (`facetText`). */
  readonly facets: string;
}

/**
 * Qué dice el estado sin resultados del catálogo (`emptySituation`): hay búsqueda y filtros (`'both'`), solo filtros
 * (`'filters'`) o solo búsqueda (`'query'`, también cuando no hay ninguna de las dos).
 */
export type CatalogEmptySituation = 'both' | 'filters' | 'query';

/** Resultado de `applyCatalogState`. */
export interface CatalogResult {
  /** Por tarjeta, en el orden de `items`: ¿se muestra? */
  visible: boolean[];
  /** Tarjetas visibles. */
  count: number;
  /** Por grupo y opción: tarjetas que se verían marcando solo esa opción en su grupo, con lo demás como está. */
  optionCounts: Record<FacetParam, Record<string, number>>;
}
