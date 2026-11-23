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
/**
 * Fotografía de una ficha: un archivo de `src/assets/productos/` (`file`; el ancho y el alto se leen del archivo) o una
 * dirección absoluta `https` con su ancho y alto en píxeles (`url`). Nunca las dos. `sourceUrl` dice de dónde viene la
 * foto y `usageConfirmed`, si su uso está confirmado; ninguno de los dos se publica.
 */
export type ProductImage =
  | { file: string; alt: string; sourceUrl: string; usageConfirmed: boolean }
  | { url: string; width: number; height: number; alt: string; sourceUrl: string; usageConfirmed: boolean };
/** Lo público de una fotografía (`getPublishedProducts`): sin su fuente ni su marca de uso. */
export type PublishedImage = { file: string; alt: string } | { url: string; width: number; height: number; alt: string };
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
  /**
   * Normas, de 1 a 12: la designación tal como la imprime el fabricante (`text`, una línea de 80 caracteres como máximo,
   * sin repetirse) y la página o el documento del fabricante donde consta para este producto (`sourceUrl`, no se
   * publica). Sin normas, la clave no va. Una norma se escribe solo aquí.
   */
  standards?: { text: string; sourceUrl: string }[];
  /**
   * Una de dos formas (ver `ProductImage`). Opcional en cualquier estado: una ficha aprobada sin foto se publica con el
   * pictograma de su categoría. Si una ficha aprobada la lleva, con `usageConfirmed: true`.
   */
  image?: ProductImage;
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
  /** Solo el texto de cada norma, en el orden de los datos; lista vacía sin normas. */
  standards: string[];
  /** `null` cuando la ficha no tiene foto. */
  image: PublishedImage | null;
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
