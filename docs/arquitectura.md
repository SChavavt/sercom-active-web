# Arquitectura y elección de plataforma

Complementa el plan maestro v1.2. Las fuentes de precios y límites se revisaron el 18 de noviembre de 2026. Es una recomendación técnica: no registra una contratación ni un despliegue.

## 1. Recomendación

**GitHub + Astro/TypeScript + catálogo en JSON validado, con salida estática; Cloudflare Pages Free como alojamiento propuesto al lanzar.** El propietario creó el repositorio público y confirmó continuar con esa visibilidad. La primera versión no necesita base de datos: el contenido público se genera al compilar. El navegador busca y filtra el catálogo y, desde el paso 2, guarda la lista de cotización del visitante en ese mismo navegador, sin servidor. WhatsApp y el correo son el canal de atención.

Un sitio estático puede ser interactivo. «Estático» describe cómo se publica el contenido; no obliga a una página sin buscador, filtros o lista. La base de datos sirve cuando hay información que debe guardarse o editarse en un servidor; no es necesaria solo por tener categorías y cientos de productos.

El sitio es de Sercom Active en su identidad, pero técnicamente es un proyecto aparte: nunca modifica `sercomactive.com` ni supone acceso a ese dominio.

## 2. Comparación de alojamiento

| Alternativa | Encaje con Sercom | Costo y planteamiento | Situación |
| --- | --- | --- | --- |
| Cloudflare Pages | Catálogo estático, HTTPS, conexión con GitHub y subdominio del proveedor | Gratuito dentro de sus límites. Referencia: 500 compilaciones al mes, 20,000 archivos y 25 MiB por archivo | **Propuesto** para el lanzamiento (paso 4), en una cuenta del propietario o de Sercom. El propietario no ha respondido. |
| Vercel Pro | Buena integración con GitHub, vistas previas y despliegues; Astro estático funciona | Precio base publicado de 20 dólares al mes por equipo, con un puesto de despliegue incluido; consumos e impuestos pueden sumarse | Posible más adelante. `vercel.json` se mantiene listo. |
| Vercel Hobby | Técnicamente puede alojar el código, pero el sitio tiene finalidad comercial | Sus términos lo restringen a uso personal o no comercial | No se usa para este sitio. |

Mientras se construye el sitio no se publica ni se paga nada. No se creó ningún proyecto ni se habilitaron servicios facturables. Si el propietario ya tuviera Vercel Pro, agregar el sitio al mismo equipo no suma por sí solo otra suscripción; el consumo y cualquier puesto adicional siguen sujetos al plan.

Las cuotas y precios no son una promesa permanente: se verifican otra vez al publicar. Los PDF grandes de fabricantes se enlazan a su origen; no se copian a `public/`.

## 3. Datos sin base de datos

| Información | Dónde queda | Cómo cambia |
| --- | --- | --- |
| Contacto y horario | `src/data/business.json` | Edición versionada |
| Categorías y productos | `src/data/catalog.json` | Edición, validación y revisión |
| Marcas que se manejan | `src/data/brands.json` | Edición junto con el registro de investigación |
| Fuentes de marcas y proveedores | `research/Sercom_Active_Fuentes_Catalogos.json` | Registro interno, fuera de la salida web |
| Productos de ejemplo | `src/data/preview/example-products.json` | Solo en la vista previa de diseño |
| Lista del cliente («Mi cotización») | En su navegador: `localStorage` (clave `cotizacion:v1`) para la lista y `sessionStorage` (`cotizacion:borrador:v1`) para lo que escribe en «Cotizar mi lista» | La cambia solo el visitante; sin servidor, cuenta, cookies ni sincronización entre dispositivos. La lista guarda solo identificadores, cantidades y unidades; el borrador de la pestaña guarda el texto que el visitante escribe en los tres campos (su lista escrita, el lugar de entrega y la fecha). Formato y reglas en [`datos-y-modos.md`](datos-y-modos.md#10-la-lista-guardada-en-el-navegador). |
| Mensaje de cotización | WhatsApp o correo del cliente | El cliente revisa y envía; el sitio no acredita recepción |
| Historial de cambios del catálogo | Git | Commit y revisión |

Las páginas reciben una proyección pública de los datos (`src/lib/site-data.mjs`), nunca el archivo editorial completo: sin aprobación, fuente, uso de imagen ni datos del registro. Detalle en [`datos-y-modos.md`](datos-y-modos.md).

## 4. Estructura del código

| Parte | Dónde | Qué hace |
| --- | --- | --- |
| Datos | `src/data/` | JSON versionados (sección 3). |
| Tipos | `src/types/` | `catalog.ts` (archivo editorial), `site.ts` (forma pública), `contact.ts`, `catalog-filters.ts` (filtros y estado del catálogo) y `quote.ts` (la lista de cotización, sus renglones y «Deshacer»). |
| Capa de datos | `src/lib/` | `catalog-policy.mjs` (validación y proyección de aprobados y retirados), `site-data-core.mjs` y `site-data.mjs` (datos públicos por modo, solo al compilar), `contact-core.mjs` y `contact.mjs` (enlaces y borradores de contacto), `routes.mjs`, `search.mjs`, `text.mjs`, `catalog-filters.mjs` (filtros del catálogo), `quote-list.mjs` (reglas de la lista de cotización), `quote-store.mjs` (su almacén en el navegador), `message-page.mjs` (las páginas que arman un mensaje), `grid-fill.mjs`, `product-title.mjs`, `related-products.mjs` («Más productos de esta categoría»), `build-mode.mjs`, `icons.ts`, `ayuda.ts`. |
| Plantilla y componentes | `src/layouts/BaseLayout.astro`, `src/components/` | Plantilla común, encabezado, pie, barra fija, avisos y componentes compartidos. |
| Páginas | `src/pages/` | Portada, catálogo, categorías, marcas, producto (ficha o retirado), cotizar, solicitud especial, contacto, privacidad y 404. Las rutas con parámetro salen de los datos. |
| Estilos | `src/styles/` | Hoja global por capas y tres hojas de página. Guía en [`diseno.md`](diseno.md). |
| Recursos | `src/assets/`, `public/` | Fuente, logotipo, iconos, favicons y `robots.txt`. |
| Scripts del proyecto | `scripts/` | `validate-catalog.mjs`, `catalog-preview.mjs` (modo de vista previa), `scan-dist.mjs` (reglas), `check-links.mjs` (enlaces), `check-markup.mjs` (marcado). |
| Pruebas | `tests/` | Pruebas de Node y una sonda de compilación (`tests/build-probe/`). |
| Configuración | `astro.config.mjs`, `package.json`, `vercel.json`, `.github/workflows/quality.yml` | Salida estática con rutas terminadas en diagonal; la bandera de vista previa; el alojamiento y la verificación automática. |

Astro compila cada página a HTML. Los scripts del navegador son de mejora progresiva y no importan datos, ni directamente ni a través de otro módulo: una prueba de las fuentes (`tests/build-mode.test.mjs`) sigue cada importación de cada `<script>` y solo admite los módulos sin datos de `BROWSER_MODULES` (ver `datos-y-modos.md`, sección 2). La única dependencia de ejecución es Astro.

**Módulos del navegador.** Los ocho módulos sin datos son `text.mjs`, `search.mjs`, `routes.mjs`, `contact-core.mjs`, `catalog-filters.mjs`, `quote-list.mjs`, `quote-store.mjs` y `message-page.mjs`. Las decisiones que no tocan la página (qué coincide con una búsqueda, qué filtros se combinan, qué renglones son iguales, qué deshace «Deshacer», qué productos van en el mensaje, si el mensaje cabe en un enlace) son funciones puras con pruebas de Node; los scripts de las páginas las llaman y solo se ocupan del documento. Qué script usa cada uno: [`diseno.md`](diseno.md#10-scripts-del-navegador).

**Un solo módulo toca el almacenamiento.** Solo `src/lib/quote-store.mjs` usa `localStorage` y `sessionStorage`; los demás leen y escriben la lista a través de él, y una prueba de las fuentes (`tests/browser-code.test.mjs`) falla si otro archivo los nombra o usa cookies. Así lo que se guarda en el navegador del visitante se revisa en un solo archivo, junto con la página de privacidad.

## 5. Bases de datos y alternativas posteriores

La documentación de Supabase aplica el límite de dos proyectos gratuitos entre las organizaciones donde la persona es Owner o Admin; crear otra organización con el mismo usuario no añade automáticamente cupo. Este proyecto no usa Supabase.

No hace falta crear otra cuenta para esta web. Una cuenta propiedad del negocio podría tener sentido por titularidad y administración a futuro; la solución no se diseña alrededor de acumular cuotas gratuitas ni mezcla datos de Sercom con proyectos de otra operación.

| Si aparece esta necesidad | Alternativa a evaluar | Observación |
| --- | --- | --- |
| Editar texto y algunas fichas desde una interfaz | CMS que guarde cambios en Git | Mantiene el sitio estático; requiere configurar permisos y el proceso de publicación |
| Panel con cambios frecuentes y estados compartidos | Supabase dedicado | PostgreSQL, administración y servicios integrados; resolver plan, permisos y copias de seguridad al implementarlo |
| PostgreSQL separado sin usar otro proyecto Supabase | Neon | Su página ofrecía un plan gratuito con 100 proyectos, 100 CU-h al mes por proyecto y 1 GB por proyecto; validar plan e integración al crearlo |
| Guardar solicitudes y gestionar un panel pequeño en Cloudflare | D1 + Workers | SQL basado en SQLite. Plan gratuito revisado: 10 bases, 5 GB en total y cuotas diarias. No es un reemplazo idéntico de Postgres ni de todo Supabase |
| Adjuntos grandes | Almacenamiento de objetos dedicado | No elegir proveedor ni contratarlo hasta definir volumen, permisos y retención |

No se ha creado Neon, D1 ni una organización o cuenta de Supabase. La edición mediante panel, los folios de solicitudes, los clientes y los adjuntos requieren una fase propia, con protección contra spam, controles de acceso y una política de datos ajustada al flujo real.

## 6. Evolución sin rehacer el sitio

Los identificadores de marca, modelo y variante son estables y los componentes no dependen del almacenamiento: reciben la forma pública que arma `createSiteData`. Hoy esa función lee JSON; si después se usa una base de datos, se reemplaza el lector y se conserva la salida pública. Es posible seguir publicando un catálogo estático aprobado a partir de una base de datos: no tiene que consultarse en cada visita.

## 7. Fuentes revisadas

- [Vercel: términos, apartado Hobby Plan](https://vercel.com/legal/terms)
- [Vercel: precio y alcance de Pro](https://vercel.com/docs/plans/pro-plan)
- [Cloudflare Pages: producto](https://www.cloudflare.com/products/pages/)
- [Cloudflare Pages: límites](https://developers.cloudflare.com/pages/platform/limits/)
- [Supabase: planes y límite de proyectos](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Supabase: preguntas de facturación](https://supabase.com/docs/guides/platform/billing-faq)
- [Neon: precios](https://neon.com/pricing)
- [Cloudflare D1: precios](https://developers.cloudflare.com/d1/platform/pricing/)
- [Astro: publicación en Cloudflare](https://docs.astro.build/en/guides/deploy/cloudflare/)
- [Astro: publicación en Vercel](https://docs.astro.build/en/guides/deploy/vercel/)

La selección de arquitectura es una recomendación propia a partir del alcance de Sercom y estas fuentes. No se ha medido todavía el tráfico ni el tamaño final del catálogo.
