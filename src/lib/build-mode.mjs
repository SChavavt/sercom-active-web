// @ts-check
// Lectura de la bandera de compilación CATALOG_PREVIEW.
// La usa `astro.config.mjs`, que la convierte en la constante `__CATALOG_PREVIEW__`.
// Regla de seguridad: solo «1» o «true» activan la vista previa; cualquier otro valor (o ninguno) es producción.

/** Nombre de la variable de entorno. */
export const PREVIEW_FLAG = 'CATALOG_PREVIEW';

/**
 * @param {unknown} value Valor de la variable de entorno.
 * @returns {boolean} `true` solo para «1» o «true» (sin importar mayúsculas ni espacios alrededor).
 */
export function isPreviewFlag(value) {
  return typeof value === 'string' && /^(?:1|true)$/i.test(value.trim());
}

/**
 * Explica un valor que no se reconoce, para avisar en la terminal sin detener la compilación.
 * @param {unknown} value
 * @returns {string} Cadena vacía cuando el valor es válido o no existe.
 */
export function previewFlagWarning(value) {
  if (value === undefined || value === null) return '';
  const text = String(value).trim();
  if (text === '' || /^(?:0|false|1|true)$/i.test(text)) return '';
  return `${PREVIEW_FLAG}="${text}" no es un valor reconocido (usa 1 o true para la vista previa). Se compila en modo producción.`;
}
