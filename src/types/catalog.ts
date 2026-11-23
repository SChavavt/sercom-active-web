export type EditorialStatus = 'draft' | 'in_review' | 'approved' | 'retired';
export interface Category {
  id: string;
  name: string;
  /** Nombre corto para menús y mosaicos. Opcional; si falta se usa `name`. */
  shortName?: string;
  /** Línea orientativa de subcategorías. Opcional. */
  summary?: string;
  status: 'draft' | 'approved';
}
export interface Product {
  id: string;
  brandId: string;
  model: string;
  name: string;
  categoryIds: string[];
  status: EditorialStatus;
  description?: string;
  characteristics?: string[];
  saleUnit?: string;
  /** `manufacturerCode` es opcional: muchas tallas no tienen un código propio. Si la clave está, no puede ir vacía. */
  variants?: { id: string; label: string; manufacturerCode?: string }[];
  image?: { url: string; alt: string; sourceUrl: string; usageConfirmed: boolean };
  source?: { url: string; checkedOn: string };
  approval?: { by: string; on: string; supplyConfirmed: boolean };
  documents?: { label: string; url: string }[];
}
/** Campos públicos que entrega `getPublishedProducts`: sin aprobación, fuente ni controles internos. */
export interface PublishedProduct {
  id: string;
  brandId: string;
  model: string;
  name: string;
  categoryIds: string[];
  description: string;
  characteristics: string[];
  saleUnit: string;
  /** Sin `manufacturerCode` cuando la variante no tiene código propio. */
  variants: { id: string; label: string; manufacturerCode?: string }[];
  image: { url: string; alt: string };
  documents: { label: string; url: string }[];
}
/**
 * Campos públicos de un producto retirado que fue público (`getRetiredProducts`): solo lo que lo identifica.
 * Descripción, características, unidad, variantes, imagen y documentos ya nadie los mantiene y no se publican.
 */
export interface PublishedRetiredProduct {
  id: string;
  brandId: string;
  model: string;
  name: string;
  categoryIds: string[];
}
export interface Catalog {
  schemaVersion: 1;
  categories: Category[];
  products: Product[];
}
