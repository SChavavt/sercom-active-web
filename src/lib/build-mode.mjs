// @ts-check
// Lectura de la bandera de compilación CATALOG_PREVIEW.
// La usa `astro.config.mjs`, que la convierte en la constante `__CATALOG_PREVIEW__`.
// Regla de seguridad: solo «1» o «true» activan la vista previa; cualquier otro valor (o ninguno) es producción.
// Y la vista previa nunca se escribe en `dist/`, la carpeta que publica el alojamiento.

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

/** Carpeta de la compilación de producción, relativa a la raíz del proyecto. Es la que publica el alojamiento. */
export const PRODUCTION_OUT_DIR = 'dist';

/**
 * ¿La carpeta de salida es `dist/` del proyecto o está dentro de ella? Compara rutas absolutas, no el nombre:
 * `tests/build-probe/dist` o una carpeta temporal se permiten. Quien llama resuelve las rutas antes
 * (`path.resolve`), para que este módulo no dependa de las APIs de Node.
 * @param {string} outDir Carpeta de salida, absoluta y resuelta.
 * @param {string} projectRoot Raíz del proyecto (la carpeta de `astro.config.mjs`), absoluta.
 * @returns {string} Mensaje de error para la vista previa, o cadena vacía si la carpeta se permite.
 */
export function previewOutDirError(outDir, projectRoot) {
  const platform = /** @type {{ process?: { platform?: string } }} */ (globalThis).process?.platform;
  const comparable = (/** @type {string} */ path) => {
    const plain = String(path).replace(/\\/g, '/').replace(/\/+$/, '');
    // Windows y macOS no distinguen mayúsculas en las rutas: «Dist» es la misma carpeta que «dist».
    return platform === 'win32' || platform === 'darwin' || /^[a-z]:\//i.test(plain) ? plain.toLowerCase() : plain;
  };
  const dist = `${comparable(projectRoot)}/${PRODUCTION_OUT_DIR}`;
  const target = comparable(outDir);
  if (target !== dist && !target.startsWith(`${dist}/`)) return '';
  return `La vista previa no se compila en ${PRODUCTION_OUT_DIR}/ (${outDir}): esa carpeta es la versión que se publica. Usa "npm run build:preview", que escribe en dist-preview/, u otra carpeta con --outDir.`;
}
