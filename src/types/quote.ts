// Tipos de la lista de cotización (`src/lib/quote-list.mjs`) y de su almacén (`src/lib/quote-store.mjs`).

/**
 * Un renglón de la lista tal como se guarda en el navegador: solo identificadores, la cantidad y la unidad. Los nombres
 * y los códigos nunca se guardan: se leen del índice público que imprime la página.
 */
export interface QuoteLine {
  /** Id del producto (forma de id: minúsculas, cifras y guiones). */
  productId: string;
  /** Id de la variante elegida, o `''` si no se eligió (o el producto no tiene variantes). */
  variantId: string;
  /** Entero de 1 a 99999. */
  quantity: number;
  /** Unidad elegida («par», «caja con 100 piezas»…), en una línea. */
  unit: string;
}

/** Variante de un producto en el índice público de la página. */
export interface QuoteIndexVariant {
  id: string;
  label: string;
  code: string;
}

/** Producto en el índice público de la página. */
export interface QuoteIndexProduct {
  id: string;
  name: string;
  brandName: string;
  code: string;
  /** `/productos/{id}/` */
  url: string;
  saleUnit: string;
  isExample: boolean;
  variants: QuoteIndexVariant[];
}

/** Producto retirado en el índice público de la página: solo lo que lo identifica. */
export interface QuoteIndexRetired {
  id: string;
  name: string;
  brandName: string;
  code: string;
  url: string;
  isExample: boolean;
}

/** Índice público que imprime una página en un `<script type="application/json">`. */
export interface QuoteIndex {
  products: QuoteIndexProduct[];
  retired: QuoteIndexRetired[];
}

/** El índice listo para buscar por id (`indexMaps`). */
export interface QuoteIndexMaps {
  products: Map<string, QuoteIndexProduct>;
  retired: Map<string, QuoteIndexRetired>;
}

/** Un renglón que la página conoce y puede cotizar. */
export interface QuoteRowOk {
  /** El mismo objeto del renglón guardado (`rows[i].line === lines[i]`). */
  line: QuoteLine;
  status: 'ok';
  product: QuoteIndexProduct;
  /** La variante elegida, o la única del producto si no se eligió ninguna; `null` en los demás casos. */
  variant: QuoteIndexVariant | null;
  /** Unidades que se ofrecen para el renglón (la del renglón al final si no es una de ellas). */
  units: string[];
  /** La opción de `units` que es la unidad del renglón (`unitKey`): la que la lista muestra elegida. */
  unit: string;
}

/** Un renglón de un producto retirado. */
export interface QuoteRowRetired {
  line: QuoteLine;
  status: 'retired';
  product: QuoteIndexRetired;
}

/** Un renglón que la página no puede ubicar (el producto o la variante no están en su índice). */
export interface QuoteRowUnknown {
  line: QuoteLine;
  status: 'unknown';
}

export type QuoteRow = QuoteRowOk | QuoteRowRetired | QuoteRowUnknown;

/** Un renglón quitado, con su posición original: lo que necesita deshacer. */
export interface RemovedLine {
  index: number;
  line: QuoteLine;
}

/** Lo que el visitante escribe en «Cotizar mi lista». Pertenece a la pestaña. */
export interface QuoteDraft {
  note: string;
  delivery: string;
  date: string;
}

/** Algo con la forma de `Storage` (`localStorage`, `sessionStorage` o uno de prueba). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Por qué se avisa a quien escucha: una escritura de esta pestaña, un cambio en otra o una página restaurada. */
export type QuoteSource = 'write' | 'storage' | 'pageshow';

export type QuoteListener = (lines: QuoteLine[], details: { source: QuoteSource }) => void;

export interface QuoteStore {
  /** ¿Se puede leer el almacén de la lista sin una excepción? No escribe nada. */
  available(): boolean;
  /** La lista guardada (`parseList`); `[]` ante cualquier falla. */
  read(): QuoteLine[];
  /**
   * Guarda la lista (una lista vacía quita la clave) y avisa con `'write'`. `false`, sin guardar ni avisar, si `lines`
   * no es una lista de hasta `MAX_LINES` renglones válidos (`isValidLine`), si el navegador no dejó guardar o si lo
   * guardado es una lista de una versión más nueva del formato (`isNewerList`).
   */
  write(lines: readonly QuoteLine[]): boolean;
  /** Escucha los cambios; devuelve la función que cancela esa suscripción (cada llamada es una suscripción propia). */
  subscribe(listener: QuoteListener): () => void;
  /** ¿Se puede leer el almacén del borrador (el de la pestaña) sin una excepción? No escribe nada. */
  draftAvailable(): boolean;
  readDraft(): QuoteDraft;
  writeDraft(fields: Partial<QuoteDraft>): boolean;
  clearDraft(): boolean;
}
