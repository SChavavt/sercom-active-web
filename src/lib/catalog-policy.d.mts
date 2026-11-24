// Tipos de `catalog-policy.mjs` para TypeScript y `astro check`.
// Node, Vite y node:test ignoran este archivo: la lógica vive en el `.mjs`.
import type { PublishedProduct, PublishedRetiredProduct } from '../types/catalog.ts';

/**
 * Alcance de marcas: basta con identificador, nombre y tipo de cada entidad. Una entidad con `portal.status`
 * «retirada» salió del portal: no está en el alcance y una ficha suya se rechaza con su propio mensaje.
 */
export interface BrandScope {
  sources: { entity_id: string; name: string; entity_type: string; portal?: unknown }[];
}

/** Una fecha real escrita como AAAA-MM-DD. */
export function validDate(value: unknown): value is string;

/** El único estado de la marca `portal` de una entidad del registro: «retirada». */
export const WITHDRAWN_STATUS: 'retirada';

/** ¿La entidad del registro salió del portal? Solo con `portal.status` igual a «retirada». */
export function isWithdrawn(source: unknown): boolean;

/** Indica si un texto menciona la marca excluida del alcance. */
export function mentionsExcludedBrand(value: unknown): boolean;

/** Largo máximo de una dirección, en caracteres. */
export const MAX_ADDRESS_LENGTH: number;

/** Lo que tiene de malo una dirección `https` escrita completa, en una frase corta; `null` si nada. */
export function addressProblem(value: unknown): string | null;

/** Una dirección `https` escrita completa: sin nada de lo que dice `addressProblem`. */
export function isHttpsAddress(value: unknown): value is string;

/** El mensaje de una dirección con un problema, con el campo, el problema y qué hacer; `null` si está bien. */
export function addressError(path: string, value: unknown, todo: string): string | null;

/** Valida el archivo editorial completo antes de producir una salida pública. Devuelve los errores. */
export function validateCatalog(catalog: unknown, registry: BrandScope): string[];

/** Exportación explícita: solo fichas aprobadas y solo campos públicos. Lanza un error si el catálogo no es válido. */
export function getPublishedProducts(catalog: unknown, registry: BrandScope): PublishedProduct[];

/** Producto retirado que fue público: estado `retired` con aprobación comercial completa. */
export function isPublicRetired(product: unknown): boolean;

/** Exportación explícita de los retirados públicos: solo identificación. Lanza un error si el catálogo no es válido. */
export function getRetiredProducts(catalog: unknown, registry: BrandScope): PublishedRetiredProduct[];

/** Tipos de recurso del registro que nunca se publican como enlace ni respaldan la fuente de una foto. */
export const BLOCKED_RESOURCE_TYPES: readonly string[];

/**
 * La página de donde viene la foto de cada ficha aprobada (`image.sourceUrl`) es del sitio de su marca en el registro:
 * un recurso accesible y de un tipo no bloqueado con el mismo servidor (sin `www.`). Devuelve los errores.
 */
export function photoSourceErrors(catalog: unknown, registry: unknown): string[];
