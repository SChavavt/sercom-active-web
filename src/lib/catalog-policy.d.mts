// Tipos de `catalog-policy.mjs` para TypeScript y `astro check`.
// Node, Vite y node:test ignoran este archivo: la lógica vive en el `.mjs`.
import type { PublishedProduct } from '../types/catalog.ts';

/** Alcance de marcas: basta con identificador, nombre y tipo de cada entidad. */
export interface BrandScope {
  sources: { entity_id: string; name: string; entity_type: string }[];
}

/** Indica si un texto menciona la marca excluida del alcance. */
export function mentionsExcludedBrand(value: unknown): boolean;

/** Valida el archivo editorial completo antes de producir una salida pública. Devuelve los errores. */
export function validateCatalog(catalog: unknown, registry: BrandScope): string[];

/** Exportación explícita: solo fichas aprobadas y solo campos públicos. Lanza un error si el catálogo no es válido. */
export function getPublishedProducts(catalog: unknown, registry: BrandScope): PublishedProduct[];
