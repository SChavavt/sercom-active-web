# Sercom Active · catálogo web

Sitio de presentación y catálogo de Sercom Active, con atención comercial en Puebla por Yosmara del Rocío Torres Pérez. Muestra categorías, marcas y productos de equipo de protección y seguridad industrial, sin precios: la única acción comercial es pedir una cotización con un mensaje de WhatsApp o de correo que el cliente revisa y envía.

## Estado

**El paso 1 (diseño y navegación completa) está construido y espera la revisión del propietario. Nada está publicado:** no hay alojamiento, dominio, cuenta ni pago.

| Paso | Contenido | Estado |
| --- | --- | --- |
| **1** | **Diseño y navegación completa** | **Construido; en revisión del propietario** |
| 2 | Buscador, filtros y «Mi cotización» | Pendiente |
| 3 | Catálogo piloto (30 a 50 productos reales) | Pendiente |
| 4 | Publicación y QR | Pendiente |

- Todas las páginas existen con el diseño «Lámina técnica» que eligió el propietario: portada, catálogo, categorías, marcas, ficha de producto, «Cotizar mi lista», solicitud especial, contacto, privacidad y la página de error.
- Todavía no hay productos reales aprobados; llegan en el paso 3. Mientras tanto, la versión que se publicaría no muestra productos, y una versión de revisión aparte muestra productos de ejemplo marcados como «Ejemplo», que no son artículos reales.
- Lo que el negocio debe confirmar, lo verificado y lo pendiente: [`docs/ESTADO.md`](docs/ESTADO.md). El plan de los cuatro pasos: [`docs/plan-de-trabajo.md`](docs/plan-de-trabajo.md).

El sitio es de Sercom Active en su identidad. Técnicamente es un proyecto aparte: nunca modifica `sercomactive.com` ni supone acceso a ese dominio.

El repositorio ([SChavavt/sercom-active-web](https://github.com/SChavavt/sercom-active-web)) es público por decisión del propietario. No se agregan secretos, documentos de clientes ni información comercial confidencial.

## Alojamiento propuesto

Propuesto el 18 de noviembre de 2026; el propietario no ha respondido. Mientras se construye el sitio no se publica ni se paga nada. Al lanzar (paso 4), Cloudflare Pages en su plan gratuito, en una cuenta abierta por el propietario o por Sercom. El plan gratuito de Vercel (Hobby) no se usa, porque sus términos lo limitan a uso personal o no comercial; Vercel Pro (precio base publicado de 20 dólares al mes por equipo) queda posible más adelante, y `vercel.json` se mantiene listo. El QR de las tarjetas apuntará a un subdominio de un dominio que controle Sercom. Detalle en [`docs/arquitectura.md`](docs/arquitectura.md) y [`docs/publicacion.md`](docs/publicacion.md).

## Cómo ejecutarlo

Se necesita Node.js 24 y npm. Las versiones están fijadas en `package-lock.json`. El proyecto funciona sin archivo `.env`.

| Comando | Qué hace |
| --- | --- |
| `npm ci` | Instala las dependencias exactas del archivo de bloqueo. |
| `npm run dev` | Abre un servidor local de desarrollo con la vista previa (con ejemplos). |
| `npm run validate:catalog` | Valida los datos del catálogo, las marcas y los ejemplos. |
| `npm run check` | Valida los datos y revisa los tipos del código. |
| `npm test` | Ejecuta las pruebas automáticas. |
| `npm run build` | Genera la versión de producción en `dist/`. |
| `npm run build:preview` | Genera la vista previa con ejemplos en `dist-preview/`. |
| `npm run preview` | Sirve localmente `dist/` ya generada. Solo corre uno a la vez; se detiene con Ctrl+C o, si quedó en segundo plano (al ejecutarlo sin terminal), con `npx astro preview stop`. |
| `npm run verify` | Genera las dos versiones y revisa en ambas las reglas del sitio, los enlaces y el marcado. |
| `npm run scan:dist`, `npm run check:links`, `npm run check:markup` | Cada revisión por separado sobre `dist/`. |

Antes de proponer cualquier cambio: `npm run check`, `npm test` y `npm run verify`.

## Las dos versiones del sitio

Cada vez que se genera el sitio (una *compilación*) sale una de dos versiones. **Producción** (`npm run build`) es la que se publicará: solo muestra categorías y productos aprobados, hoy ninguno, y hasta el lanzamiento lleva en cada página el aviso «Sitio en preparación · Versión inicial para revisión». **Vista previa** (`npm run build:preview` o `npm run dev`) sirve para revisar el diseño: muestra las diez categorías y productos de ejemplo, con su propio aviso y la etiqueta «Ejemplo»; nunca se publica ni es la dirección del QR. Hoy ninguna de las dos se deja indexar por buscadores como Google; producción lo hará a partir del lanzamiento. Que la vista previa siga sin indexarse después del lanzamiento requiere un ajuste técnico que todavía está pendiente ([`docs/publicacion.md`](docs/publicacion.md#4-lista-de-lanzamiento)). Guía completa: [`docs/datos-y-modos.md`](docs/datos-y-modos.md).

## Archivos principales

| Ruta | Uso |
| --- | --- |
| `AGENTS.md` | Instrucciones de trabajo para quien modifica el repositorio, persona o agente automatizado |
| `docs/ESTADO.md` | Decisiones, lo implementado, lo verificado, lo pendiente y los límites conocidos |
| `docs/plan-de-trabajo.md` | Los cuatro pasos, qué entrega cada uno y cómo se acepta |
| `docs/diseno.md` | Guía del diseño «Lámina técnica»: variables, retícula, componentes, páginas, accesibilidad |
| `docs/datos-y-modos.md` | Archivos de datos, las dos versiones, los borradores de contacto, las protecciones y cómo cambiar el contacto, una marca o una categoría |
| `docs/catalogo-y-actualizaciones.md` | Cómo agregar, aprobar y retirar productos |
| `docs/arquitectura.md` | Plataforma, costos, estructura del código y evolución de datos |
| `docs/publicacion.md` | Comprobaciones, alojamiento y lista de lanzamiento |
| `docs/licencias-de-terceros.md` | Licencias de la fuente y de los iconos |
| `docs/Sercom_Active_Plan_Maestro_Web_y_Catalogo.pdf` | Plan maestro v1.2 |
| `research/Sercom_Active_Fuentes_Catalogos.json` | Registro de investigación: 19 entidades y 35 referencias; no es un catálogo de productos |
| `src/data/business.json` | Contacto, horario y datos del negocio |
| `src/data/catalog.json` | Categorías y productos; solo los aprobados se muestran |
| `src/data/brands.json` | «Marcas que manejamos» |
| `src/data/preview/example-products.json` | Productos de ejemplo, solo para la vista previa |
| `src/pages/`, `src/components/`, `src/styles/` | Páginas, componentes y estilos |
| `src/lib/` | Validación, datos públicos, contacto, búsqueda |
| `scripts/` | Validador, modo de vista previa y revisiones del sitio generado |
| `tests/` | Pruebas automáticas |
| `.github/workflows/quality.yml` | Comprobaciones en GitHub al proponer cambios, sin publicar nada ni tareas programadas |

La documentación y la investigación están fuera de `public/`, así que no se copian al sitio. No se suben al repositorio costos de proveedor, datos de clientes, claves ni archivos privados.

## Alcance comercial

Sin precios públicos, pagos en línea ni cuentas de clientes. La disponibilidad y los plazos se confirman al cotizar. Se excluye Guantes Internacionales/GISA. No se anuncia distribución autorizada, existencias, certificaciones ni compatibilidad sin evidencia. Una marca de la lista no acredita que todos sus productos estén disponibles. No se muestra dirección física ni mapa mientras no se confirme la atención presencial.
