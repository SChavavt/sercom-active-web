# Datos y modos de compilación

Guía práctica de la capa de datos: qué archivo guarda cada cosa, cómo se compila el sitio en sus dos modos y qué comandos revisan el resultado. Para cargar fichas reales, ver `docs/catalogo-y-actualizaciones.md`.

## Archivos de datos

| Archivo | Contenido | Quién lo cambia |
| --- | --- | --- |
| `src/data/business.json` | Nombre del negocio, contacto, WhatsApp, correo, horario y dirección. | Quien mantiene el sitio, con el dato confirmado por el negocio. |
| `src/data/catalog.json` | Las diez categorías (`id`, `name`, `shortName`, `summary`, `status`) y las fichas de producto. | Quien mantiene el sitio. Pasar algo a `approved` requiere la confirmación del contacto comercial. |
| `src/data/brands.json` | «Marcas que manejamos»: 19 entradas con `id`, `name`, `kind` y, como máximo, un enlace «Sitio del fabricante». | Quien mantiene el sitio. Debe coincidir con el registro de investigación. |
| `src/data/preview/example-products.json` | Los diez productos de ejemplo del diseño. No son artículos reales. | Solo junto con un cambio de diseño. |
| `research/Sercom_Active_Fuentes_Catalogos.json` | Registro interno de fuentes. El sitio nunca lo importa: lo leen el validador, el escáner y las pruebas. | Investigación. |

Los tipos están en `src/types/` (`catalog.ts`, `site.ts`, `contact.ts`).

## Los dos modos

| | Producción | Vista previa de diseño |
| --- | --- | --- |
| Comando | `npm run build` | `npm run build:preview` (y `npm run dev`) |
| Carpeta | `dist/` | `dist-preview/` (no se sube al repositorio) |
| Categorías | Solo las aprobadas (hoy, ninguna) | Aprobadas y en borrador (las diez) |
| Productos | Solo fichas aprobadas (hoy, ninguna) | Fichas aprobadas y los diez ejemplos |
| Marcas | Las 19 | Las 19 |
| Distintivos | Ninguno | Aviso de vista previa en cada página y etiqueta «Ejemplo» en cada ejemplo |

La vista previa sirve para revisar el diseño; nunca es la versión que se publica ni la que lleva el QR.

El modo lo decide la variable de entorno `CATALOG_PREVIEW`:

- Solo `1` o `true` activan la vista previa. Sin la variable, o con cualquier otro valor, se compila producción (un valor no reconocido se avisa en la terminal).
- Se lee del entorno real del proceso. Un archivo `.env` no la activa, y ningún archivo del repositorio la define: en el alojamiento no hay que configurar nada para obtener producción.
- `npm run dev` y `npm run build:preview` la definen mediante `scripts/catalog-preview.mjs`, que funciona igual en Linux, macOS y Windows.

Otros usos: `npx astro dev` abre el servidor de desarrollo en modo producción; `npx astro preview --outDir dist-preview` sirve la vista previa ya compilada.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo en vista previa. |
| `npm run validate:catalog` | Valida el catálogo, compara `brands.json` con el registro y revisa los ejemplos. No consulta Internet. |
| `npm run check` | Validación anterior y revisión de tipos (`astro check`). |
| `npm test` | Pruebas de `tests/*.test.mjs`. Incluye una compilación de prueba en ambos modos. |
| `npm run build` / `npm run build:preview` | Compilan producción en `dist/` o la vista previa en `dist-preview/`. |
| `npm run scan:dist` | Revisa las reglas duras sobre `dist/`. Para la vista previa: `npm run scan:dist -- dist-preview --preview`. |
| `npm run check:links` | Revisa los enlaces de `dist/`. Otra carpeta: `npm run check:links -- dist-preview`. |
| `npm run verify` | Compila los dos modos y ejecuta el escáner y el verificador de enlaces sobre ambas salidas. Es la comprobación completa antes de entregar un cambio. |

`node scripts/scan-dist.mjs --rules` imprime todas las reglas con su explicación. El escáner falla, entre otras cosas, por: la marca excluida, precios o monedas, «oficial» o «autorizado», confirmaciones falsas de envío, la paleta anterior, páginas sin `noindex`, datos internos o del registro, y contactos distintos de los de `business.json`. Opciones para más adelante: `--launch` (versión pública: exige retirar `noindex` y el bloqueo de `robots.txt`) y `--in-person` (atención presencial confirmada: permite dirección y mapa).

`scripts/check-links.mjs` comprueba que cada enlace o recurso interno exista, que las rutas de página terminen en diagonal (`/catalogo/`), que cada `#ancla` exista y que nada apunte a `localhost` ni a una ruta de archivo. No consulta enlaces externos, de WhatsApp ni de correo: se prueban a mano.

## Módulos que usan las páginas

| Módulo | Dónde se usa | Qué ofrece |
| --- | --- | --- |
| `src/lib/site-data.mjs` | Solo al compilar (encabezado de archivos `.astro`) | `mode`, `isPreview`, `categories`, `brands`, `products`, `paths`, `getCategory`, `getBrand`, `getProduct`, `productsByCategory`, `productsByBrand`, `featuredProducts`, `routes`, `PREVIEW_NOTICE`, `EXAMPLE_TAG` |
| `src/lib/contact.mjs` | Solo al compilar | `whatsappUrl`, `mailtoUrl`, `messages`, `subjects`, `contactLinks`, `absoluteUrl`, `contactDetails` (nombre, ubicación, contacto, iniciales, correo, WhatsApp visible y horarios; sin domicilio) |
| `src/lib/routes.mjs`, `search.mjs`, `text.mjs`, `contact-core.mjs` | También en scripts de navegador | Rutas, búsqueda, normalización de texto, `withPageLink` y `withRequestDescription` |

Un `<script>` de navegador no importa `site-data.mjs`, `contact.mjs` ni archivos `.json`: llevaría los datos completos al JavaScript público. Los dos módulos se niegan a ejecutarse en un navegador, una prueba lo vigila y el escáner lo detecta en la salida.

La dirección del sitio todavía no existe (`SITE_URL` vacío), así que `absoluteUrl()` devuelve `undefined` y los mensajes de producto se construyen sin la línea «Enlace». La página la agrega al hacer clic con `withPageLink(enlace.href, location.origin + location.pathname)`.

## Cómo se mantienen los ejemplos fuera de producción

1. Viven en un archivo aparte y nunca entran en `catalog.json`: la validación rechaza cualquier ficha con identificador `ejemplo-…`, código `EJ-…` o nombre con «de ejemplo».
2. `site-data.mjs` los carga solo dentro de la rama de vista previa. Con la bandera apagada, la compilación elimina esa rama y el archivo no llega a ningún HTML, script ni JSON.
3. En modo producción, `createSiteData` ignora los ejemplos aunque los reciba.
4. `tests/build-output.test.mjs` compila una página de prueba en ambos modos y comprueba que los ejemplos solo aparecen en la vista previa.
5. `npm run verify` escanea `dist/` y falla si encuentra `EJ-`, «Marca de ejemplo», `ejemplo-` o «de ejemplo» en cualquier archivo.

Consecuencia para quien escribe páginas: esas cadenas tampoco pueden usarse en producción como nombre de clase CSS, identificador o texto (por ejemplo, una clase `ejemplo-…`). «Por ejemplo» sí puede escribirse.

## Aprobar una categoría o agregar un producto real

El procedimiento completo está en `docs/catalogo-y-actualizaciones.md`. En resumen:

- **Categoría:** cambiar su `status` de `draft` a `approved` en `catalog.json`, solo con la confirmación del contacto comercial. Desde ese momento aparece en producción.
- **Producto:** agregar la ficha en `catalog.json` con marca (un `id` de `brands.json` de tipo `brand`), modelo exacto, categorías aprobadas, fuente revisada, imagen con uso confirmado y aprobación comercial. Mientras esté en `draft` o `in_review` no se publica.
- **Marca o enlace de fabricante:** cambiar `brands.json` y el registro de investigación a la vez. El enlace debe ser un recurso del registro verificado como accesible y su etiqueta siempre es «Sitio del fabricante».

Después de cualquier cambio: `npm run check`, `npm test` y `npm run verify`. Las pruebas fijan a propósito los textos de las categorías, el orden y los enlaces de las marcas y los diez ejemplos; si el cambio es intencional, se actualiza también la prueba correspondiente.

## Cambiar los datos de contacto

Todo sale de `src/data/business.json`; ninguna página lleva el número o el correo escritos.

- `whatsappDigits`: el número tal como se usa en `wa.me`, solo dígitos y sin «normalizarlo» (hoy `5212214002219`).
- `email`: el correo de ventas.
- `contactFirstName`: el nombre con el que saludan los mensajes («Hola, Yosmara.»).
- `name`: el nombre del negocio que aparece en los mensajes.

Pasos: editar el archivo, actualizar los valores confirmados al inicio de `tests/contact.test.mjs` y ejecutar `npm test` y `npm run verify`. El escáner compara cada enlace de WhatsApp, correo y teléfono de la salida con este archivo. Los textos de los mensajes están en `src/lib/contact-core.mjs` y tienen sus pruebas en `tests/contact.test.mjs`.
