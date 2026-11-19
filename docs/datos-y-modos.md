# Datos y modos de compilación

Guía de la capa de datos: qué archivo guarda cada cosa, qué reciben las páginas, cómo se compila el sitio en sus dos modos, qué revisa cada protección y cómo se hacen los cambios de datos más comunes. Para cargar productos reales, ver [`catalogo-y-actualizaciones.md`](catalogo-y-actualizaciones.md); para el sistema visual, [`diseno.md`](diseno.md); para publicar, [`publicacion.md`](publicacion.md). Los resultados medidos de los comandos están en [`ESTADO.md`](ESTADO.md).

## 1. Archivos de datos

| Archivo | Contenido | Quién lo cambia |
| --- | --- | --- |
| `src/data/business.json` | Nombre del negocio, denominaciones, persona de contacto, WhatsApp, correo, horarios, zona horaria, dirección (no se publica) y dos marcas de confirmación (`whatsappTested`, `inPersonAttentionConfirmed`). | Quien mantiene el sitio, con el dato confirmado por el negocio (sección 9.1). |
| `src/data/catalog.json` | Las diez categorías (`id`, `name`, `shortName`, `summary`, `status`) y las fichas de producto (hoy, ninguna). | Quien mantiene el sitio. Pasar algo a `approved` requiere la confirmación del contacto comercial. |
| `src/data/brands.json` | «Marcas que manejamos»: 19 entradas con `id`, `name`, `kind` (`brand` o `supplier`) y, como máximo, un enlace con la etiqueta «Sitio del fabricante». | Quien mantiene el sitio, junto con el registro de investigación (sección 9.2). |
| `src/data/preview/example-products.json` | Los productos de ejemplo de la vista previa: diez que aparecen en los listados (uno por categoría) y uno retirado que solo tiene su página informativa. No son artículos reales. | Solo junto con un cambio de diseño. |
| `research/Sercom_Active_Fuentes_Catalogos.json` | Registro interno de fuentes de investigación. El sitio nunca lo importa: lo leen el validador, el escáner y las pruebas. | Investigación. |

Los tipos están en `src/types/`: `catalog.ts` (el archivo editorial), `site.ts` (la forma pública que reciben las páginas) y `contact.ts` (contacto y mensajes).

Los textos de ayuda que comparten varias páginas (las preguntas frecuentes y las tres entradas «Explorar productos», «Cotizar mi lista» y «Ayúdame a encontrarlo») están en `src/lib/ayuda.ts`.

## 2. Lo que reciben las páginas: la proyección pública

Las páginas nunca leen los JSON directamente. Leen dos módulos que solo se ejecutan al compilar:

| Módulo | Qué ofrece |
| --- | --- |
| `src/lib/site-data.mjs` | `mode`, `isPreview`, `categories`, `brands`, `products`, `retiredProducts`, `paths`, `getCategory`, `getBrand`, `getProduct`, `getRetiredProduct`, `productsByCategory`, `productsByBrand`, `featuredProducts`, `routes`, `PREVIEW_NOTICE`, `DEVELOPMENT_NOTICE`, `EXAMPLE_TAG` |
| `src/lib/contact.mjs` | `contactDetails` (nombre del negocio, denominaciones, persona de contacto, iniciales, correo, WhatsApp visible y horarios; sin dirección), `contactLinks`, `messages`, `subjects`, `whatsappUrl`, `mailtoUrl`, `absoluteUrl` |

`site-data.mjs` arma los datos con `createSiteData` (`src/lib/site-data-core.mjs`), que aplica estas reglas:

- **Categorías:** en producción, solo las `approved`; en la vista previa, también las `draft`. Una categoría aprobada aparece en producción aunque todavía no tenga productos (su página muestra el estado vacío).
- **Productos:** solo las fichas `approved`, a través de `getPublishedProducts` (`src/lib/catalog-policy.mjs`), que deja fuera aprobación, fuente y uso de imagen. En la vista previa se agregan los ejemplos, con la marca «Marca de ejemplo», sin marca real (`brandId: null`), sin imagen y sin documentos.
- **Productos retirados:** una colección aparte, `retiredProducts`, con solo lo que identifica al producto. Ningún listado, conteo, búsqueda ni selección los incluye (ver [`catalogo-y-actualizaciones.md`](catalogo-y-actualizaciones.md#5-producto-retirado)).
- **Marcas:** las 19 de `brands.json`, cada una con su número de productos públicos (los ejemplos no cuentan).
- **Productos destacados:** `featuredProducts(n)` toma, por turnos, un producto de cada categoría (8 por omisión).

Todo lo que devuelve está congelado. Las formas exactas (`PublicCategory`, `PublicBrand`, `PublicProduct`, `PublicRetiredProduct`) están en `src/types/site.ts`; ninguna incluye aprobación, fuente, estado editorial ni datos del registro.

Para los scripts que corren en el navegador existen módulos sin datos: `src/lib/routes.mjs` (rutas), `search.mjs` (búsqueda), `text.mjs` (normalización y limpieza de texto) y `contact-core.mjs` (`withPageLink`, `withRequestDescription`, `requestDescription`). Un `<script>` de navegador nunca importa `site-data.mjs`, `contact.mjs` ni un archivo `.json`: llevaría los datos completos al JavaScript público. Los dos módulos se niegan a ejecutarse en un navegador, una prueba lo vigila y el escáner lo detecta en la salida (R-RULE-13).

## 3. Los dos modos

| | Producción | Vista previa de diseño |
| --- | --- | --- |
| Comando | `npm run build` | `npm run build:preview` (y `npm run dev`) |
| Carpeta | `dist/` | `dist-preview/` (no se sube al repositorio) |
| Categorías | Solo las aprobadas (hoy, ninguna) | Aprobadas y en borrador (las diez) |
| Productos | Solo fichas aprobadas (hoy, ninguna) | Fichas aprobadas y los ejemplos |
| Productos retirados | Los que fueron públicos (hoy, ninguno) | Además, el ejemplo retirado |
| Marcas | Las 19 | Las 19 |
| Aviso arriba de cada página | «Sitio en preparación · Versión inicial para revisión» (`DEVELOPMENT_NOTICE`), hasta el lanzamiento | Solo el aviso de vista previa (`PREVIEW_NOTICE`) |
| Etiqueta «Ejemplo» | Nunca | En cada ejemplo, en tarjetas y en su página |

La vista previa sirve para revisar el diseño; nunca es la versión que se publica ni la que lleva el QR. Por eso nunca se escribe en `dist/`, la carpeta que publica el alojamiento: si `CATALOG_PREVIEW` está activa y la salida es `dist/` (o una carpeta dentro de ella), `astro build` se detiene con un error antes de escribir nada (integración `sercom:vista-previa-fuera-de-dist` de `astro.config.mjs`), y `scripts/catalog-preview.mjs build --outDir dist` se rechaza con código 2. Se comparan rutas absolutas, así que otras carpetas (`dist-preview/`, una temporal o la de la sonda de las pruebas) siguen permitidas.

El modo lo decide la variable de entorno `CATALOG_PREVIEW`:

- Solo `1` o `true` (sin distinguir mayúsculas) activan la vista previa. Sin la variable, o con cualquier otro valor, se compila producción; un valor no reconocido se avisa en la terminal.
- Se lee del entorno real del proceso. Un archivo `.env` no la activa, y ningún archivo del repositorio la define: en el alojamiento no hay que configurar nada para obtener producción.
- `npm run dev` y `npm run build:preview` la definen mediante `scripts/catalog-preview.mjs`, que funciona igual en Linux, macOS y Windows.

Otros usos: `npx astro dev` abre el servidor de desarrollo en modo producción; `npm run preview` sirve `dist/` ya compilada, y `npx astro preview --outDir dist-preview` sirve la vista previa ya compilada.

**El servidor de `npm run preview` (`astro preview`, Astro 7).** En una terminal interactiva queda en primer plano y se detiene con Ctrl+C. Si se ejecuta sin terminal (desde un script, un editor o un agente), Astro lo deja en segundo plano y el comando regresa enseguida con «Preview server running at …»: sigue sirviendo hasta `npx astro preview stop`; `npx astro preview status` dice si hay uno en marcha y `npx astro preview logs` muestra su registro. Astro deja correr **un solo** servidor de `astro preview` a la vez: un segundo (por ejemplo, el de `dist-preview/`) no arranca y solo responde «Preview server already running at …». Para servir las dos compilaciones a la vez se arranca el segundo con `--ignore-lock` y otro puerto (`npx astro preview --outDir dist-preview --port 4322 --ignore-lock`), o se detiene el primero. El servidor de `npm run dev` no tiene esa restricción.

**La dirección del sitio (`SITE_URL`).** Es opcional mientras se construye y se define al lanzar (ver [`publicacion.md`](publicacion.md)). Con ella, `astro.config.mjs` fija `site`, cada página declara su dirección canónica (salvo la 404, que nunca la declara) y los borradores de producto llevan la dirección de la ficha escrita en el HTML. Sin ella, la línea del enlace la agrega el navegador (sección 4). Una vista previa colocada en una dirección web necesita su propia `SITE_URL` si sus borradores deben llevar el enlace en el HTML. Igual que `CATALOG_PREVIEW`, **se lee del entorno real del proceso** (`process.env.SITE_URL`): una línea `SITE_URL=…` en un archivo `.env` no tiene efecto y la compilación sale sin dirección canónica, sin avisar. Se define en las variables del alojamiento o en la misma orden (`SITE_URL=https://… npm run build`). `.env.example` muestra el nombre de la variable, pero copiarlo a `.env` no la aplica.

## 4. Borradores de WhatsApp y correo

El sitio no envía nada: cada acción de contacto abre un borrador de WhatsApp (`https://wa.me/<número>?text=…`) o de correo (`mailto:` con asunto y cuerpo) que la persona revisa y envía. Los textos están en `src/lib/contact-core.mjs` (`createContact`) y sus pruebas en `tests/contact.test.mjs`. Las páginas los obtienen de `contactLinks` (`src/lib/contact.mjs`).

| Borrador | Dónde | Canales en la página | Primera línea | Asunto del correo |
| --- | --- | --- | --- | --- |
| General | Encabezado, pie, barra fija, `/contacto/` y el bloque de contacto de la portada (en `/cotizar/` y `/solicitud-especial/` ese bloque abre el borrador de la página) | WhatsApp y correo | «Hola, {nombre}. Quiero solicitar una cotización con Sercom Active.» | Solicitud de cotización |
| Producto | Ficha y tarjetas | WhatsApp y correo en la ficha; WhatsApp en la tarjeta | La misma línea, seguida de Producto, Variante (talla o color), Cantidad y unidad, Entrega en (ciudad o código postal), Fecha requerida y También necesito | Solicitud de cotización: {Marca} {CÓDIGO} |
| Lista | `/cotizar/` | WhatsApp y correo | «Hola, {nombre}. Quiero cotizar esta lista con Sercom Active:» | Lista para cotizar |
| Solicitud especial | `/solicitud-especial/` | WhatsApp y correo | «Hola, {nombre}. Busco un producto que no encuentro en el catálogo de Sercom Active.», con «Descripción o uso» | Solicitud especial |
| Marca | Página de una marca | WhatsApp | «Hola, {nombre}. Busco un producto de la marca {marca}.» | — |
| Categoría | Página de una categoría sin productos | WhatsApp | «Hola, {nombre}. Busco productos de {categoría}.» | — |
| Ficha técnica | Ficha sin documentos («Solicitar ficha técnica») | WhatsApp | «Hola, {nombre}. ¿Me puedes compartir la ficha técnica de …?» | — |
| Producto retirado | Página de un retirado | WhatsApp y correo | «Hola, {nombre}. Busco una alternativa a un producto que ya no está en el catálogo de Sercom Active.» | Consulta de alternativas: {Marca} {CÓDIGO} |

`{nombre}` es `contactFirstName` de `business.json`. El borrador general y los de producto abren con la misma línea del plan; los demás conservan su redacción propia porque cada uno dice para qué es. La página de privacidad enlaza el correo sin borrador. `contactLinks` también arma el correo de los borradores que en la página solo van por WhatsApp; hoy ninguna página lo usa.

**La línea «Enlace».** Los borradores de producto, de ficha técnica y del retirado llevan la dirección de la ficha. Con `SITE_URL` va escrita en el HTML. Sin ella, cada enlace lleva `data-page-link` con la ruta, y `PageLinkScript` (`src/components/PageLinkScript.astro`) reescribe el `href` con `withPageLink` **al cargar la página** y quita el atributo; los eventos de clic quedan como respaldo para un enlace agregado después. Con JavaScript apagado, el borrador sale igual, sin esa línea.

**La búsqueda en la solicitud especial.** Si `/solicitud-especial/` se abre con `?q=…` (desde el estado sin resultados del catálogo), un script agrega «Descripción o uso: …» a los dos borradores con `withRequestDescription` y muestra la nota «Agregamos tu búsqueda “…” al borrador.». El texto se limpia con `requestDescription` (la misma limpieza que el catálogo, `cleanQuery`, y un máximo de 200 caracteres). La limpieza está descrita en [`diseno.md`](diseno.md#10-scripts-del-navegador).

## 5. Cómo se mantienen los ejemplos fuera de producción

1. Viven en un archivo aparte y nunca entran en `catalog.json`: la validación rechaza cualquier ficha con identificador `ejemplo-…`, código `EJ-` seguido de una cifra (también en las variantes) o nombre con «de ejemplo».
2. `site-data.mjs` los carga solo dentro de la rama de vista previa. Con la bandera apagada, la compilación elimina esa rama y el archivo no llega a ningún HTML, script ni JSON. `tests/build-mode.test.mjs` comprueba sobre el código de `src/`:
   - que ningún otro archivo de código nombra el archivo de ejemplos (`example-products` o `data/preview`), que `site-data.mjs` lo nombra una sola vez, en un `import()` dentro de `if (__CATALOG_PREVIEW__)`, y que nadie más lee esa constante;
   - que ningún `import.meta.glob(…)` ni `import()` con patrón puede alcanzarlo. Toda mención de `import.meta.glob` (con espacios o sin ellos alrededor de los puntos) da sus patrones o se rechaza, nunca se pasa por alto: se salta el tipo genérico, también uno anidado o con una flecha (`import.meta.glob<Record<string, unknown>>(…)`, `<{ default: Array<unknown> }>`, `<() => Promise<unknown>>`), y se rechaza la mención que no es una llamada que se pueda revisar: un genérico que no se cierra, un alias (`const g = import.meta.glob`), `import.meta.globEager` y también una mención en un comentario o en un texto. Cada patrón se resuelve como lo hace Vite: `/…` desde la raíz del proyecto, `./…` y `../…` desde la carpeta del archivo o desde la opción `base`, también los recursivos (`'../data/**/*.json'`, `'/src/data/**/*.json'`) y las exclusiones (`'!../data/preview/**'`). Se rechaza lo que no se puede revisar: un argumento que no es un texto escrito tal cual, unas opciones que no son un objeto escrito tal cual (una variable, una expansión `...`, una opción que Vite no conoce o un `base` calculado) y un patrón que no empieza con `/`, `./` ni `../` (como `'**/*.json'` o un alias). El código se lee sin comentarios (un texto entre comillas no se toma por comentario) y también tal cual;
   - que el proyecto no usa colecciones de contenido de Astro: ningún archivo de `src/` nombra `astro/loaders` ni `astro:content`, de ninguna forma (`import`, `export … from`, `import type`, `import()` o un texto), y no existen `src/content.config.*`, `src/content/config.*` ni la carpeta `src/content/`. Agregar colecciones exige rediseñar antes esta protección;
   - que el código de `src/` no toca el disco: no importa `fs`, `fs/promises`, `module` ni `child_process`, no usa `require`, `createRequire`, `process.getBuiltinModule`, `process.binding` ni `process.dlopen`, y no importa ningún otro módulo integrado de Node (con `node:` o sin él) fuera de la lista permitida de la prueba, que hoy está vacía. Los datos se leen con `import` de JSON, que las comprobaciones anteriores sí pueden revisar.
3. En modo producción, `createSiteData` ignora los ejemplos aunque los reciba.
4. `tests/build-output.test.mjs` compila una página de prueba (`tests/build-probe/`) en ambos modos y comprueba que los ejemplos solo aparecen en la vista previa.
5. `npm run verify` escanea `dist/` y falla si encuentra `EJ-`, «Marca de ejemplo», `ejemplo-` o «de ejemplo» en cualquier archivo, o cualquier identificador, nombre, texto o código del archivo de ejemplos (los códigos también escritos con otro separador o sin él, como `EJ1001`).

El escáner reconoce los ejemplos por esas marcas y por sus textos. Una página que copiara un ejemplo y reescribiera todos sus textos ya no se distinguiría de una ficha real: por eso la garantía principal es el paso 2, que impide cargar el archivo fuera de la rama de vista previa.

Consecuencia para quien escribe páginas: esas cadenas tampoco pueden usarse en producción como nombre de clase CSS, identificador o texto (por ejemplo, una clase `ejemplo-…`). «Por ejemplo» sí puede escribirse.

## 6. Las protecciones

**Para qué sirven.** Protegen contra errores escritos de forma directa y legible: un precio en un texto visible, una frase de confirmación, un enlace de contacto con otro número o una forma de cargar el archivo de ejemplos como la escribiría alguien de buena fe. No protegen contra quien esconde algo a propósito (partir una cadena para que un patrón no la vea, `eval`, `new Function`, un acceso calculado a `process`): quien hace eso también puede borrar la prueba, y la defensa contra eso es revisar cada cambio, no un patrón. Un resultado limpio no garantiza más que eso.

**Nada se pierde.** Un cambio a una regla del escáner debe seguir haciendo fallar todo lo que una versión anterior de la regla detectaba, y seguir dejando limpio lo que era legítimo. Quien cambia una regla agrega primero los casos a `tests/scan-dist.test.mjs`.

### 6.1 Validador de datos

`npm run validate:catalog` (`scripts/validate-catalog.mjs`) no consulta Internet. Revisa:

- `catalog.json` con `validateCatalog` (`src/lib/catalog-policy.mjs`): campos conocidos, estados, categorías, marcas, ejemplos reservados, campos comerciales prohibidos y los requisitos de una ficha aprobada. El detalle está en [`catalogo-y-actualizaciones.md`](catalogo-y-actualizaciones.md#2-campos-de-una-ficha-y-lo-que-exige-el-validador).
- `brands.json` con `crossCheckBrands`: mismos identificadores, nombres y tipos que el registro de investigación; cada enlace es un recurso de esa entidad verificado como accesible; ninguna entidad excluida.
- El archivo de ejemplos con `validateExampleProducts`.

Imprime un resumen (entidades del registro, productos, aprobados, retirados con página, marcas con enlace, ejemplos) y termina con error si algo falla. Lo ejecutan `npm run check`, `npm run build` y `npm run build:preview` antes de compilar.

### 6.2 Pruebas

`npm test` ejecuta `tests/*.test.mjs` con el ejecutor de pruebas de Node. Cubren la política del catálogo, las categorías, las marcas, los ejemplos, la proyección pública, los productos retirados, la búsqueda y la limpieza de texto, los mensajes de contacto, las retículas, los títulos largos, el escáner, el verificador de enlaces, el de marcado y el modo de compilación (incluida una compilación real de la sonda en ambos modos). Algunas fijan a propósito datos acordados (textos de las categorías, orden y enlaces de las marcas, los ejemplos, los valores de contacto): si el cambio es intencional, se actualiza también la prueba.

`npm test` es la comprobación lenta, porque compila la sonda en los dos modos. Para trabajar con una sola prueba: `node --test tests/brands.test.mjs` ejecuta un archivo y `node --test --test-name-pattern="diecinueve" tests/brands.test.mjs` solo las pruebas cuyo nombre coincide. Antes de proponer el cambio se ejecuta `npm test` completo.

**Pruebas atadas a los datos de hoy.** Varias pruebas comprueban el estado actual de los datos, no solo las reglas: 19 marcas, ninguna ficha real, las diez categorías en borrador, los valores exactos del contacto y las órdenes exactas de `npm run verify` y de `vercel.json`. Un cambio de datos correcto las hace fallar, y hay que actualizarlas en el mismo cambio, revisando que cada una siga probando la regla y no solo la cifra nueva. Las que fallan con cada cambio de rutina (comprobado sobre una copia del repositorio):

| Cambio | Pruebas que fallan |
| --- | --- |
| Cambiar el WhatsApp y el correo (9.1) | 5: `tests/contact.test.mjs` (`DIGITS`, `EMAIL`, el número visible «+52 1 221 400 2219» y la dirección `wa.me` escrita en una expresión) y una de `tests/scan-dist.test.mjs` que escribe `tel:+52 1 221 400 2219` con espacios. |
| Agregar una marca (9.2) | 7: tres de `tests/brands.test.mjs` (el número 19 y el orden `ORDER`, los enlaces `LINKS` y `WITHOUT_LINK`, y los textos permitidos, que salen de `ORDER`), `tests/example-products.test.mjs` (`registry.sources.length, 19`), `tests/build-output.test.mjs` (`json.brands.length, 19`) y dos de `tests/site-data.test.mjs` (`site.brands.length, 19`). |
| Aprobar una categoría (9.3) | 7: «todas las categorías siguen en borrador» de `tests/categories.test.mjs`; cuatro de `tests/site-data.test.mjs` (producción y vista previa con los datos reales, las proyecciones públicas, `site-data.mjs` en producción); «producción: la sonda imprime los datos reales…» de `tests/build-output.test.mjs`, y la de R-RULE-14 de `tests/scan-dist.test.mjs`. |
| Aprobar el primer producto real, con su categoría ([`catalogo-y-actualizaciones.md`](catalogo-y-actualizaciones.md#3-flujo-para-agregar-un-producto-real)) | 27, en `tests/categories.test.mjs` («hoy no publica ninguna ficha»), `tests/site-data.test.mjs`, `tests/build-output.test.mjs`, `tests/scan-dist.test.mjs` (R-RULE-14), `tests/retired-products.test.mjs` y `tests/text-search.test.mjs`. Varias agregan una ficha de prueba a una copia del catálogo real y esperan conteos fijos. |
| Lanzar ([`publicacion.md`](publicacion.md#4-lista-de-lanzamiento)) | Dos de `tests/build-mode.test.mjs`: ««npm run verify» compila los dos modos y revisa las dos salidas», que fija la orden de `verify` paso por paso, y «ningún archivo del repositorio activa la vista previa en una compilación normal», que fija el `buildCommand` de `vercel.json`. |

El resumen final de `npm test` («failing tests») da el archivo y la línea de cada prueba que falla.

### 6.3 Escáner de reglas

`scripts/scan-dist.mjs` lee la salida compilada y aplica las reglas duras del proyecto. `node scripts/scan-dist.mjs --rules` imprime todas las reglas con su explicación; esa lista es la referencia completa. Uso: `node scripts/scan-dist.mjs [carpeta] [--preview] [--launch] [--in-person] [--strict]`.

- `--preview`: la carpeta es la vista previa (exige el aviso de vista previa y la etiqueta «Ejemplo»).
- `--strict`: un WARN también falla. Se usa en producción porque en la etapa actual la lista de normas, certificaciones y demás avisos debe estar vacía; cuando se publiquen normas con fuente (paso 3) se revisa esta opción.
- `--launch`: versión pública (ver R-RULE-12 abajo).
- `--in-person`: atención presencial confirmada; permite dirección, «Visítanos» y mapa.

**Cómo lee la salida.** Antes de comparar, normaliza el contenido: decodifica entidades y `%XX`, lleva el texto a su forma compatible (NFKC: «＄» es «$»), quita los caracteres invisibles y los acentos, y lee el texto también con las etiquetas en línea retiradas («GI<span>SA</span>», «Pro<b>moción</b>», «Solicitud envi<span>ada</span>»). Las reglas de precios, «gratis», «oficial» y «autorizado», la marca excluida y las confirmaciones leen además los atributos (`data-*`), los scripts en línea, los archivos JS y JSON (con las cadenas partidas unidas, y el marcado que escriben leído también sin sus etiquetas: `t.innerHTML="Solicitud <b>enviada</b>"`) y las cadenas `content:` del CSS. No ejecuta scripts.

**Qué hace fallar**, por regla (el identificador es el que imprime el escáner):

- **R-RULE-01, precios y descuentos.** Descuentos y promociones («descuento», «Promoción», también partidos por etiquetas). Prefijos de moneda («MX$350», «Desde MX$ 1,200», «US$25»), «costo», «importe», «monto» y «tarifa» seguidos de una cifra (también con «de»: «Precio de 350», salvo un año; o con «por», «con», «de» o «para» y una palabra en medio: «Precio por pieza 350.00», salvo un porcentaje o una talla, una serie, un modelo o una norma: «Precio con IVA 16%», «Precio para talla 9»), otras monedas («350 dólares») y cualquier clave de precio en el código público o en un JSON (`var o={monto:5}`), porque el sitio no tiene campos de precio. Una cantidad no es un precio: un número entero seguido de una unidad en plural y sin otra cifra en la misma frase («100 piezas o más», «12 pares»); «35 pza», «35.50 pieza» o «3 pares por 250» sí son precios. Solo en el código de un script, fuera de las cadenas, un «$» pegado a un identificador («$2», «a$1», «e.$2») se lee como código; en el texto, en los atributos (también las direcciones, con su `%XX` decodificado: `?text=Casco%20(MX%24350)` se lee como texto), en las cadenas `content:` del CSS (enteras, aunque lleven «;» o «}») y en las cadenas de un script o de un JSON, cualquier «$» seguido de una cifra es un precio. Ninguna dirección del sitio lleva «$» seguido de una cifra, así que una como `/catalogo/?q=a$1` también falla.
- **R-RULE-02**, «gratis» o «gratuito». **R-RULE-05**, reseñas y testimonios. **R-RULE-06**, experiencia o liderazgo sin evidencia (FAIL), y certificaciones o distintivos (WARN en producción, FAIL en la vista previa). **R-RULE-04**, normas y niveles de protección (WARN en producción, FAIL en la vista previa). Como producción se revisa con `--strict`, esos WARN también la hacen fallar. **R-RULE-09**, promesas de existencia o entrega. **R-RULE-16** y **R-RULE-26**, compatibilidades y cifras comerciales (WARN). **R-RULE-18**, condiciones comerciales no confirmadas. **R-RULE-19**, actualización automática. **R-RULE-22**, compra en línea, carrito o cuentas.
- **R-RULE-07**, «oficial», «autorizado», «distribuidor» o «sucursal».
- **R-RULE-08**, la marca excluida, en cualquier forma y en nombres de archivo.
- **R-RULE-10, confirmaciones falsas y plazos de respuesta.** Confirmaciones con una preposición y una o dos palabras entre el sustantivo y el participio («Mensaje de WhatsApp enviado», «Solicitud por correo electrónico enviada»), con «ha quedado» o «quedó» («Su solicitud ha quedado registrada») o con un artículo cuando la frase termina ahí, sola o con su destino («La solicitud enviada.»); no cuentan el participio que sigue como adjetivo («Revisa la lista enviada por WhatsApp») ni la frase con una negación o una condición antes del sustantivo («Ningún mensaje queda registrado»). Frases en primera persona («Hemos enviado tu solicitud») y plazos de respuesta («Te respondemos en breve», «Un asesor se comunicará contigo»), también con una cifra: un verbo de recibir, responder, enviar, cotizar o contactar dirigido al lector o en primera persona del plural y, a seis palabras como máximo, sin fin de frase y sin «que», «y», «para» ni una coma en medio, «en» o «dentro de» con una cifra y una unidad de tiempo («Recibirás tu cotización en 24 horas», «Te cotizamos en 24 hrs»). «Precio en 24 horas», un horario o «Usa el respirador un máximo de 8 horas» no son un plazo de respuesta.
  - *Límites conocidos:* no detecta una promesa con «que», «y», «para» o una coma entre el verbo y el plazo («Te enviamos la cotización que pediste en 24 horas.», «Recibirás tu cotización y la ficha técnica en 24 horas.»), la unidad «minuto» en singular («Recibirás tu cotización en 1 minuto») ni una cifra pegada a su unidad («Respondemos en 24h»). «Recibirás tu cotización en 24 horas.» y «… en 2 minutos.» sí fallan.
- **R-RULE-11**, dirección publicada, «Visítanos» o mapa (salvo con `--in-person`).
- **R-RULE-12, antes del lanzamiento.** Cada página lleva `<meta name="robots" content="noindex…">`; `robots.txt` bloquea todo el sitio en el grupo `User-agent: *` y en cada grupo que nombra a un buscador (un buscador con grupo propio solo obedece ese grupo; un grupo empieza con `User-agent`, también escrito `useragent` o `user agent`); no existe un sitemap, y **cada página de producción muestra el aviso «Sitio en preparación · Versión inicial para revisión»**. La vista previa lleva solo su propio aviso: una página suya que muestra el de sitio en preparación falla. «Muestra» quiere decir que el aviso está en el texto de los elementos: un comentario, un script, un estilo o un atributo no cuentan, ni el contenido de `<head>`, `<template>`, `<textarea>`, `<noscript>`, un `<dialog>` cerrado o un elemento con `hidden`, `aria-hidden="true"` o `display:none` / `visibility:hidden` en su `style`. Con `--launch` se exige lo contrario (R-PUB-03): ningún grupo bloquea el sitio entero, ninguna página lleva `noindex` y ninguna muestra el aviso.
- **R-RULE-03, ejemplos y datos de prueba.** En producción, ningún rastro de los ejemplos ni el aviso de vista previa (sección 5). En los dos modos, ningún dato sintético de las pruebas automáticas de `tests/`. En la vista previa, cada página muestra el aviso de vista previa y al menos tantas etiquetas «Ejemplo» como ejemplos distintos muestra (con la misma definición de «muestra» que R-RULE-12).
- **R-RULE-13**, metadatos internos, registro de investigación o archivos de datos completos en la salida.
- **R-RULE-14, páginas que corresponden a los datos.** `/categorias/` solo de categorías visibles en el modo; `/productos/` solo de fichas aprobadas, de productos retirados que fueron públicos (estado `retired` con aprobación completa) y, en la vista previa, de los ejemplos (también el retirado); `/marcas/` solo de las marcas públicas. Si existe alguna página de categoría o de producto, deben existir las de todos los registros visibles. Una página para un retirado sin aprobación falla.
- **R-RULE-24, contactos.** Cada destino de WhatsApp (`wa.me`, `api.`, `web.` o `chat.whatsapp.com`, `wa.link`, `whatsapp://`, `intent://`), de correo (`mailto:` y cualquier dirección escrita) y de teléfono (`tel:`, `sms:`) en la salida (enlaces, otros atributos, scripts y JSON, también con las diagonales escapadas o codificado con `%XX` dentro de otra dirección, aunque lo esté varias veces: decodifica hasta que el texto deja de cambiar, ocho veces como máximo) es el de `business.json`. Un `mailto:` con `to`, `cc` o `bcc` falla; en un atributo, un `mailto:` sin dirección, un `tel:` sin número o con letras y un marcador sin sustituir (`mailto:{correo}`) fallan; solo el código de un script puede llevar el principio de un enlace que completa en el navegador. Un número que un script arma con piezas que no son texto no se ve: por eso los scripts del navegador reciben los enlaces ya construidos y solo los completan con `withPageLink` o `withRequestDescription`. Además, cada número con forma de teléfono del texto visible que no sea el confirmado da un WARN (falla en producción por `--strict`, no en la vista previa).
  - *Lo que no prueba:* que los destinos coincidan con `business.json` no dice que el número o el correo sean correctos; eso solo lo prueba un teléfono real (9.1). Tampoco se comprueba que `whatsappDisplay` sea el mismo número que `whatsappDigits`: si difieren, el único aviso es ese WARN.
- **R-RULE-28**, formularios que envían datos a un servidor. **R-QUOTE-06**, texto de WhatsApp sin codificar.
- **R-RULE-29, paleta anterior o tema oscuro.** El azul marino y el celeste del plan anterior (a 4 o menos por canal), también con transparencia, y cualquier tema oscuro (`prefers-color-scheme`, `color-scheme`, `light-dark()`). Se buscan en las hojas de estilo, en los atributos de color y en los scripts y JSON: allí, en el valor de una propiedad, clave o constante cuyo nombre dice color (`color`, `fill`, `background`, `fondo`, `primary`, `brand`, `marca`, `azul`, `palette`, `paleta`, `theme`, `tema`…) y en todos los valores de un objeto o una lista guardados bajo esos nombres. La palabra cuenta en cualquier lugar del nombre (`textcolor`, `MAINCOLOR`, `navbg`, `darktheme`), salvo «tema», que cuenta solo donde empieza un nombre o una de sus partes (`temaOscuro`, `tema_claro`, `miTema`), no dentro de otra palabra (`sistema`) ni en `temas`, `tematica`, `tematico` o `temario`.
  - *Límite conocido:* otras palabras que empiezan con «tema» siguen contando como nombre de color: `temazcal` y `tematizado` hacen fallar la regla con un color anterior; `sistema`, `temas` y `tematica` quedan limpios.
- **R-NAV-17**, `lang="es-MX"` y enlace «Saltar al contenido». **R-COPY-15**, título de la portada: el nombre y `titleLabel` de `business.json` («Sercom Active · Atención en Puebla»). **R-PUB-04**, la 404 nunca declara dirección canónica. **R-A11Y-06** y **R-A11Y-07**, nombres de enlaces y botones, y `alt` de imágenes. **BUILD**, restos de una compilación fallida. **R-RULE-30** solo remite: los enlaces rotos y los controles inertes los revisa el verificador de enlaces (6.4).

**Frases permitidas.** `ALLOWED_SENTENCES`, al principio de las reglas de `scripts/scan-dist.mjs`, guarda frases del propio sitio que contienen una palabra vigilada sin decir lo que la regla prohíbe (hoy, por ejemplo, «¿Todo está en existencia?» y «La disponibilidad y el tiempo de entrega se confirman al cotizar.»). El escáner las quita antes de aplicar las reglas que leen el texto visible y lo legible (`text`, `joined`, `words` y `prose`, las vistas que lista `--rules`); las reglas que leen el archivo tal cual (`raw` y `norm`) las siguen viendo. Se comparan después de la misma normalización que el resto (sin acentos ni caracteres invisibles, un solo espacio), pero sí distinguen mayúsculas: hay que copiar la frase exactamente como sale en la página. Para agregar una: que sea un texto del sitio (nunca de un producto, sección 7), escrito en una plantilla; agregarla tal cual a la lista; agregar a `tests/scan-dist.test.mjs` un caso que muestre que la frase pasa y otro que muestre que una variante que sí promete algo sigue fallando, y ejecutar las tres comprobaciones. Ninguna prueba fija hoy el contenido de la lista: cada frase nueva se revisa en el cambio.

**Lo que solo protege la revisión.** Ninguna regla detecta los servicios que no están confirmados (análisis de riesgo, asesorías, capacitaciones), un enlace a la tienda en línea de la empresa ni los glifos de redes sociales del kit de iconos; tampoco que un texto nuevo esté aprobado por el contacto comercial. («Más de 25 años» sí lo detecta R-RULE-06.) Esas restricciones ([`ESTADO.md`](ESTADO.md#7-pendiente-del-negocio)) dependen de revisar cada cambio.

### 6.4 Verificador de enlaces

`scripts/check-links.mjs [carpeta] [--site=<dirección>]` comprueba que cada enlace o recurso interno escrito en el HTML o en el CSS (`href`, `src`, `srcset`, `action`, `url()`, `image-set()`…) exista, que las rutas de página terminen en diagonal (`/catalogo/`), que cada `#ancla` exista, que ninguna dirección empiece con `//` (al unir `'/' + routes.catalog` sale `//catalogo/`, que el navegador abre en otro servidor) y que nada apunte a `localhost` ni a una ruta de archivo. No consulta enlaces externos, de WhatsApp ni de correo: se prueban a mano. Tampoco ejecuta scripts: una dirección que un script arma en el navegador, o que va en un atributo `data-*`, no se revisa.

### 6.5 Verificador de marcado

`scripts/check-markup.mjs [carpeta] [--preview]` lee el HTML y las hojas de estilo de la salida, sin navegador, y comprueba hechos del marcado que una revisión encontró rotos alguna vez, más los de la página de un producto retirado. Imprime `FAIL <id> <archivo> <mensaje>` y una línea de resumen; termina con código 1 si hay problemas y con 2 si la carpeta no existe o no tiene páginas. Las comprobaciones (cada una con el identificador del hallazgo o del requisito que la originó; la lista viva es `CHECKS` en el script):

| Id | Qué comprueba |
| --- | --- |
| U-03 | En la cabecera, los botones Buscar y Menú van antes de la navegación y de la búsqueda; el orden de computadora es logotipo, navegación, búsqueda, WhatsApp y «Cotizar mi lista». |
| U-05 | La cabecera y la barra fija marcan la ubicación actual con `aria-current` según la ruta, y nada más lleva la marca. |
| U-07 | La navegación y la búsqueda de la cabecera usan nombres de su bloque; ninguna regla CSS selecciona `.nav`, `.search` ni sus elementos, tampoco con `[class…]` ni con escapes. |
| U-04 | Las celdas de relleno de las retículas están vacías, ocultas a las tecnologías de apoyo (`aria-hidden="true"`) y no reciben foco. |
| U-11 | Fuera de la cabecera, la dirección de correo que se muestra va en las dos partes de `EmailAddress` y solo puede partirse después de «@». |
| F-3 | En la ruta de navegación, cada diagonal es un elemento oculto a las tecnologías de apoyo al final de su elemento, y el último elemento es la página actual. |
| F-9a | En la página de una marca, solo su celda de «Marcas que manejamos» lleva `aria-current="page"` y el cuadro que la señala. |
| F-9b | En el pie, solo el enlace a la página actual lleva `aria-current="page"` y su cuadro. |
| R-STATE-04a | La página de un producto es una ficha (con «Cotizar este producto») o la de un retirado (con el aviso «Producto retirado»), nunca las dos ni ninguna; el aviso no aparece en ninguna otra página. |
| R-STATE-04b | La página de un retirado lleva el aviso completo (la etiqueta con su cuadro sólido y sus dos frases) y, después, «Consultar alternativas» por WhatsApp y «Consultar por correo». |
| R-STATE-04c | La página de un retirado tiene un solo H1, el nombre, antes del aviso, y su título dice «(producto retirado)». |
| R-STATE-04d | La página de un retirado nunca muestra acciones de cotizar ni de pedir la ficha, unidad de venta, resumen, características, variantes, documentación, aviso de disponibilidad ni la banda de ayuda de la ficha. |
| V-06 | En la línea marca · código de una tarjeta, el separador va unido a la marca con un espacio de no separación. |
| A-02a | Un enlace o botón con `aria-label` y texto visible tiene un nombre que empieza con ese texto (WCAG 2.5.3). |
| A-02b | Un enlace de correo que muestra la dirección se llama con la dirección exacta (`aria-label`). |
| A-02c | Las acciones de cada tarjeta se llaman «Ver ficha: {nombre}» y «Cotizar: {nombre}», y las filas de la barra lateral con productos «{nombre}, {n productos}». |
| A-06 | Cada icono en línea (`<svg class="icon">`) lleva `width` y `height` numéricos. |

Con `--preview` exige además el campo de búsqueda de la cabecera (`#buscador`) en U-03 y U-07; en los dos modos, si hay campo debe haber botón Buscar y al revés. La entrada «Categorías» no se comprueba. Lo que no debe aparecer se reconoce aunque cambie de forma (mayúsculas, acentos, puntuación o partido en elementos); lo que debe aparecer se compara al pie de la letra. Los textos que busca son los de las plantillas (`RETIRED_PAGE_TEXTS` y `FICHA_TEXTS` en el script): si una plantilla cambia el suyo, una prueba falla y avisa de que hay que cambiarlo también ahí. Una palabra partida por dentro («Produc<b>to</b> retirado») no la reconoce R-STATE-04a. No revisa el resultado visual (anchos, solapes, foco, colores): eso se prueba con navegador.

Para agregar una comprobación se añade un objeto `{ id, title, page?, sheet? }` al arreglo `CHECKS`; las pruebas están en `tests/check-markup.test.mjs` y `tests/check-markup-retired.test.mjs`.

### 6.6 `npm run verify`, el alojamiento y GitHub Actions

`npm run verify` compila los dos modos y ejecuta, sobre ambas salidas, el escáner (producción con `--strict`, vista previa con `--preview`), el verificador de enlaces y el de marcado. Es la comprobación completa antes de entregar un cambio.

La orden de compilación del alojamiento (`buildCommand` de `vercel.json`, la misma que indica [`publicacion.md`](publicacion.md) para Cloudflare Pages) ejecuta `npm run check`, `npm test` y `npm run build`, y después el escáner con `--strict`, el verificador de enlaces y el de marcado sobre `dist/`: una salida que no los pasa no se publica.

`.github/workflows/quality.yml` ejecuta en GitHub Actions `npm ci`, `npm run check`, `npm test`, `npm run build` y `npm run verify` con la versión de Node de `.nvmrc` (24), en cada solicitud de cambios (pull request: al abrirla y en cada envío a su rama), en cada envío a `main` y a mano (`workflow_dispatch`). No publica nada ni tiene tareas programadas.

### 6.7 Diferencia aceptada en producción

Astro escribe en `dist/_astro/` la hoja de estilo de la página de producto (`_id_.<huella>.css`) aunque producción no tenga hoy ninguna página de producto. Esa hoja lleva las reglas del aviso de producto retirado, y ninguna página la usa. Se acepta tal cual.

## 7. Límite conocido: las reglas de afirmaciones y el texto de los productos

Las reglas del escáner son mecánicas: buscan palabras y no saben quién las escribe. Se pensaron para el texto del sitio (lo que Sercom Active dice de sí mismo), pero también leen los campos de producto, y con texto legítimo de un fabricante fallan. Hoy harían fallar la compilación, por ejemplo:

- R-RULE-07: la señal «Solo personal autorizado», «Prohibido el paso a personal no autorizado» o «Chaleco reflejante para oficial de tránsito».
- R-RULE-18: «Fecha de fabricación impresa» o «Logotipo bordado».
- R-RULE-10: un candado con «etiqueta con folio consecutivo».
- R-RULE-06: «Casco para líder de cuadrilla», «Costuras garantizadas por el fabricante» o «Norma vigente desde 2019».
- R-RULE-11: un modelo o número de parte 72090.

Antes de cargar los productos reales (paso 3) hay que decidir cómo se revisan los campos de producto. Por ejemplo: una región marcada en las páginas (como `data-scan="producto"`) que las reglas sobre el negocio no lean y que revise un validador que conoce la fuente de cada ficha, o un archivo de excepciones revisado junto con esa fuente. No se resuelve agregando frases a la lista de frases permitidas de `scripts/scan-dist.mjs`, que es solo para textos del propio sitio.

Las reservas de los ejemplos se mantienen: los códigos `EJ-` seguidos de una cifra y la frase «de ejemplo» pertenecen a los productos de ejemplo, y la validación los rechaza en el catálogo. Una ficha real con un código así («Lente EJ-200») también necesita esa decisión.

## 8. Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo en vista previa. |
| `npm run validate:catalog` | Valida el catálogo, compara `brands.json` con el registro y revisa los ejemplos (6.1). |
| `npm run check` | La validación anterior y la revisión de tipos (`astro check`). |
| `npm test` | Pruebas de `tests/*.test.mjs` (6.2). |
| `npm run build` / `npm run build:preview` | Validan y compilan producción en `dist/` o la vista previa en `dist-preview/`. |
| `npm run preview` | Sirve `dist/` ya compilada. Uno a la vez; sin terminal queda en segundo plano y se detiene con `npx astro preview stop` (sección 3). |
| `npm run scan:dist` | Escáner de reglas sobre `dist/`. Vista previa: `npm run scan:dist -- dist-preview --preview`. |
| `npm run check:links` | Verificador de enlaces sobre `dist/`. Otra carpeta: `npm run check:links -- dist-preview`. |
| `npm run check:markup` | Verificador de marcado sobre `dist/`. Vista previa: `npm run check:markup -- --preview`. |
| `npm run verify` | Compila los dos modos y ejecuta las tres revisiones sobre ambas salidas (6.6). |

Después de cualquier cambio: `npm run check`, `npm test` y `npm run verify`.

## 9. Procedimientos

### 9.1 Cómo cambiar el contacto

Todo sale de `src/data/business.json`; ninguna página lleva el número, el correo ni el nombre escritos.

| Campo | Qué es | Dónde se ve |
| --- | --- | --- |
| `whatsappDigits` | El número tal como se usa en `wa.me`: solo dígitos y sin «normalizarlo» (hoy `5212214002219`, con el «1» después del 52). | Todos los borradores de WhatsApp. |
| `whatsappDisplay` | El mismo número como se lee («+52 1 221 400 2219»). | Franja superior del encabezado, pie, bloques de contacto. |
| `email` | El correo de ventas. | Todos los borradores de correo y las direcciones visibles. |
| `contactName`, `contactFirstName`, `contactInitials` | Nombre completo, nombre con el que saludan los borradores («Hola, Yosmara.») e iniciales del monograma. | Nombre completo: pie, «Atención con …» (portada, contacto, cotizar, solicitud especial) y descripción de `/contacto/`. Nombre: borradores y textos de la portada («Cómo funciona»). Iniciales: monograma. |
| `name`, `locationLabel`, `titleLabel` | Nombre del negocio, denominación («Atención comercial en Puebla») y la del título de la portada («Atención en Puebla»). | Borradores, encabezado, pie, descripciones, `<title>` de la portada. |
| `hoursText`, `hoursShortText` | Horario largo y horario corto. | Pie y bloques de contacto (largo); franja superior (corto). |
| `weeklyHours`, `timezone` | Horario por día y zona horaria. | Es un registro: hoy ninguna página ni script los lee. Un cambio de horario se hace en `hoursText` y `hoursShortText`. |
| `address`, `inPersonAttentionConfirmed` | Dirección y si la atención presencial está confirmada. | Ninguno se publica. `inPersonAttentionConfirmed` es un registro, como `whatsappTested`: el sitio no lo lee, y cambiarlo a `true` no muestra nada. La dirección no sale porque `contact.mjs` no la incluye en `contactDetails`, y el escáner (R-RULE-11) falla si aparece, salvo con la opción `--in-person`. |
| `whatsappTested` | Si el número ya se probó en un teléfono real. | Es un registro: el sitio no lo lee ni lo publica. |

Qué lo valida: `createContact` (`src/lib/contact-core.mjs`) rechaza al compilar un número que no tenga de 8 a 15 dígitos, un correo sin forma de correo o un `contactFirstName` o `name` vacíos; el escáner (R-RULE-24) compara cada destino de la salida con este archivo; `tests/contact.test.mjs` fija a propósito los valores confirmados al inicio (`DIGITS`, `EMAIL`) y los saludos. Nada comprueba que `whatsappDisplay` sea el mismo número que `whatsappDigits`: si difieren, solo aparece un WARN de R-RULE-24 por el número visible, que hace fallar producción (`--strict`) pero no la vista previa. Y que la salida coincida con `business.json` no prueba que el número sea el correcto: eso solo lo prueba un teléfono real (paso 6).

Pasos:

1. Editar `src/data/business.json` con el dato confirmado por el negocio: `whatsappDigits` y `whatsappDisplay` juntos (el mismo número en las dos formas), `email`. Si cambia el número, poner `whatsappTested` en `false` hasta probar el nuevo.
2. Actualizar las pruebas. Si cambian el número y el correo, fallan cinco (lista en 6.2): `DIGITS`, `EMAIL`, el número visible y la dirección `wa.me` de `tests/contact.test.mjs`, y un caso de `tests/scan-dist.test.mjs` que escribe el número con espacios. Buscar el valor anterior **en sus dos formas** y en todo el repositorio, porque también está en documentos y comentarios: `grep -rn -e "5212214002219" -e "221 400 2219" -e "ventas.puebla@" --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=dist-preview --exclude-dir=.git .` (hoy aparece, además de en las pruebas, en `AGENTS.md`, en `docs/ESTADO.md`, en la tabla de arriba y en comentarios de `src/types/contact.ts`, `src/components/EmailAddress.astro` y `scripts/scan-dist.mjs`; el PDF del plan maestro no se modifica).
3. Actualizar la sección «Datos confirmados» de `AGENTS.md`, la tabla de arriba y la evidencia de `docs/ESTADO.md` (criterio 19).
4. Ejecutar `npm run check`, `npm test` y `npm run verify`.
5. Revisar en `dist/` que cada enlace de WhatsApp vaya a `https://wa.me/<whatsappDigits>` y cada correo a la dirección nueva (R-RULE-24 ya falla si alguno es distinto de `business.json`).
6. Probar el WhatsApp en un teléfono real: compilar, abrir desde el teléfono un enlace del sitio (por ejemplo «WhatsApp» del encabezado) o `https://wa.me/<whatsappDigits>?text=Hola`, y confirmar que se abre el chat de la persona de contacto con el texto escrito. Probar también un correo. Solo con la prueba hecha se cambia `whatsappTested` a `true` y se anota en `docs/ESTADO.md`. Si el chat no abre, no se cambia el número por suposición: se pregunta al negocio la forma correcta.

**Para mostrar la dirección**, cuando el negocio confirme la dirección y la atención presencial (hoy pendiente, [`ESTADO.md`](ESTADO.md#7-pendiente-del-negocio)), cambiar el dato no basta: hay que agregar la dirección a `contactDetails` en `src/lib/contact.mjs` y a las páginas que la muestren, agregar `--in-person` al escáner en `npm run verify`, en `vercel.json` y en la orden de compilación del alojamiento (sin esa opción R-RULE-11 falla), actualizar las dos pruebas de `tests/build-mode.test.mjs` que fijan esas órdenes, poner `inPersonAttentionConfirmed` en `true` como registro y anotarlo en `docs/ESTADO.md`.

### 9.2 Cómo agregar o corregir una marca

1. Cambiar `src/data/brands.json` y la entidad correspondiente de `research/Sercom_Active_Fuentes_Catalogos.json` a la vez: el validador exige los mismos `id`, nombre y tipo (`brand` o `supplier`). Un proveedor (`supplier`, hoy Espomega) se lista, pero no puede tener productos propios.
2. El enlace es opcional y como máximo uno. Debe ser un recurso de esa entidad en el registro cuya `verification` empiece con «accesible» y cuyo `type` no sea `deprecated`, `unverified_current` ni `gated_landing`, con `https` y la etiqueta exacta «Sitio del fabricante».
3. El orden de `brands.json` es el orden de la empresa en «Marcas que manejamos».
4. El `id` es la dirección de la página (`/marcas/{id}/`). Cambiar el `id` de una marca cambia su dirección; las fichas que la usan deben cambiar su `brandId`.
5. La marca excluida no se agrega nunca; el validador la rechaza en cualquier campo.
6. Actualizar las pruebas que fijan las marcas de hoy. Agregar una hace fallar siete (lista en 6.2): `ORDER`, `LINKS` y `WITHOUT_LINK` de `tests/brands.test.mjs` y el número 19 en esa prueba y en `tests/example-products.test.mjs`, `tests/build-output.test.mjs` y `tests/site-data.test.mjs`. Cambiar un `id` cambia también `ORDER` y, si la marca tiene enlace, `LINKS` o `WITHOUT_LINK`.
7. Ejecutar `npm run check`, `npm test` y `npm run verify`. Si cambia el número de marcas, actualizar las menciones de «19» y «diecinueve» en los documentos.

**Una entidad nueva del registro.** El validador compara `brands.json` con `sources` del registro en las dos direcciones: cada entidad del registro debe estar en `brands.json` y cada marca en el registro. De cada entidad lee `entity_id` (el `id`), `name`, `entity_type` (`brand` o `supplier`) y, para el enlace, `resources[]` con `label`, `url`, `type` y `verification`. Las entidades actuales llevan además `scope`, `source_status`, `checked_on` (`AAAA-MM-DD`), `recommended_ingestion`, `unattended_api_or_feed_verified`, `monitoring_active`, `publication_policy` y `next_action`: una entidad nueva lleva los mismos campos, copiando la forma de una existente y escribiendo lo que se sabe de la fuente. Ninguno de esos campos llega al sitio; el escáner (R-RULE-13) falla si alguna nota o enlace no aprobado del registro aparece en la salida.

**Corregir el nombre de una marca.** Se cambia `name` en los dos archivos a la vez. Corregir solo el nombre conserva la dirección (`/marcas/{id}/`); cambiar también el `id` (y el `entity_id`) la cambia. Mientras nada esté publicado ninguna dirección se ha difundido, así que puede elegirse; después de publicar, un `id` nuevo rompe los enlaces guardados. Si el nombre correcto resulta ser otra empresa, el enlace también se revisa, porque es un recurso de la entidad anterior. La corrección pendiente «Derma Care» o «Safety Guardian» (ver [`ESTADO.md`](ESTADO.md#7-pendiente-del-negocio)) se hace así cuando el negocio responda; si cambia también el `id` `derma-care` y el enlace a `dermacare.mx` se decide en ese momento.

### 9.3 Cómo aprobar una categoría

1. Con la confirmación del contacto comercial, cambiar su `status` de `draft` a `approved` en `src/data/catalog.json`. Si cambian sus textos (`name`, `shortName`, `summary`), actualizar también `tests/categories.test.mjs`.
2. Desde ese momento aparece en producción: la entrada «Categorías» y su panel en el encabezado; en la portada, la placa de categorías (en lugar de la nota «Estamos preparando el catálogo» y las tres entradas), «¿Cómo podemos ayudarte?» y «Explora nuestras categorías»; la placa en la página 404; el registro de categorías en `/catalogo/`, que sigue diciendo «Estamos preparando el catálogo» mientras no haya productos; la columna de categorías del pie, y su página `/categorias/{id}/`. Sin productos aprobados, su página muestra «Estamos cargando los productos de esta categoría.» con el borrador de WhatsApp de la categoría. **La búsqueda del encabezado no aparece**: solo se imprime cuando hay productos públicos.
3. Actualizar las pruebas que fijan «todas las categorías en borrador». Aprobar una sola hace fallar siete (lista en 6.2): en `tests/categories.test.mjs`, `tests/site-data.test.mjs`, `tests/build-output.test.mjs` y `tests/scan-dist.test.mjs`.
4. Ejecutar `npm run check`, `npm test` y `npm run verify`, y revisar la compilación de producción en el navegador.

Una ficha aprobada exige que todas sus categorías estén aprobadas. El flujo de un producto real está en [`catalogo-y-actualizaciones.md`](catalogo-y-actualizaciones.md).
