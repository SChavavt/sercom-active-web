import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import { isPreviewFlag, previewFlagWarning, previewOutDirError } from './src/lib/build-mode.mjs';

// Modo de compilación (docs/datos-y-modos.md). CATALOG_PREVIEW=1 (o true) activa la vista previa de diseño:
// categorías en borrador y productos de ejemplo. Sin la variable, o con otro valor, se compila producción.
// Se lee del entorno real: un archivo .env no la activa.
const catalogPreview = isPreviewFlag(process.env.CATALOG_PREVIEW);
const flagWarning = previewFlagWarning(process.env.CATALOG_PREVIEW);
if (flagWarning) console.warn(`[sercom] ${flagWarning}`);
if (catalogPreview) console.log('[sercom] Vista previa de diseño (CATALOG_PREVIEW): incluye categorías en borrador y productos de ejemplo. No es la versión para publicar.');

// La vista previa nunca se escribe en dist/ del proyecto, que es lo que publica el alojamiento: si la bandera
// llega por error al entorno de una compilación de producción, la compilación se detiene en lugar de publicar los
// ejemplos. Se compara la ruta absoluta, así que la sonda de las pruebas (otra raíz u otra carpeta) sigue funcionando.
const projectRoot = fileURLToPath(new URL('.', import.meta.url));
/** @type {string | undefined} */
let astroCommand;
const previewOutsideDist = {
  name: 'sercom:vista-previa-fuera-de-dist',
  hooks: {
    'astro:config:setup': ({ command }) => {
      astroCommand = command;
    },
    // Solo al compilar: `astro dev` también tiene dist/ como carpeta de salida, pero no escribe en ella.
    'astro:config:done': ({ config }) => {
      if (!catalogPreview || astroCommand !== 'build') return;
      const error = previewOutDirError(fileURLToPath(config.outDir), projectRoot);
      if (error) throw new Error(error);
    },
  },
};

export default defineConfig({
  output: 'static',
  integrations: [previewOutsideDist],
  site: process.env.SITE_URL || undefined,
  // Todas las rutas del sitio terminan en diagonal (/catalogo/); así una diagonal olvidada falla al revisar.
  trailingSlash: 'always',
  // Espacios en blanco fieles al HTML (comportamiento de Astro 6). El valor por omisión de Astro 7 ('jsx')
  // elimina el espacio de los saltos de línea entre elementos en línea y une palabras de la maqueta.
  compressHTML: true,
  vite: {
    define: {
      // Constante de compilación declarada en src/env.d.ts. Las páginas usan `isPreview` de src/lib/site-data.mjs.
      __CATALOG_PREVIEW__: JSON.stringify(catalogPreview),
    },
    build: {
      // Sin esto, Lightning CSS conserva el anidamiento y escribe consultas de rango (width<=1099px)
      // que los navegadores anteriores a Safari 16.4 no entienden.
      cssTarget: ['chrome90', 'edge90', 'firefox90', 'safari14', 'ios14'],
    },
  },
});
