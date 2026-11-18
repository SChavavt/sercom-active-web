# Arquitectura y elección de plataforma

Fecha de revisión: 18 de noviembre de 2026. Complementa el plan maestro v1.2. Es una recomendación técnica; no registra una contratación o un despliegue.

## Recomendación para empezar

**GitHub + Astro/TypeScript + Cloudflare Pages + catálogo JSON validado.** El propietario creó el repositorio público y confirmó continuar con esa visibilidad. La primera versión no necesita base de datos. El contenido público se genera al compilar. El navegador podrá buscar, filtrar y conservar temporalmente una lista de cotización; WhatsApp o correo serán el canal de atención cuando se complete ese recorrido.

Un sitio estático puede ser interactivo. “Estático” describe cómo se publica el contenido; no obliga a una página sin buscador, filtros o lista. La base de datos sirve cuando hay información que debe guardarse o editarse en un servidor; no es necesaria solo por tener categorías y cientos de productos.

## Comparación de alojamiento

| Alternativa | Encaje con Sercom | Costo/planteamiento actual | Decisión propuesta |
| --- | --- | --- | --- |
| Cloudflare Pages | Catálogo estático, HTTPS, conexión GitHub y subdominio del proveedor | Free, dentro de sus límites. Referencia: 500 compilaciones/mes, 20,000 archivos y 25 MiB por archivo | Primera opción para reducir costo inicial |
| Vercel Pro | Buena integración GitHub, vistas previas y despliegues; Astro estático funciona | Tarifa base publicada de USD 20/mes por equipo, un puesto de despliegue incluido; consumos e impuestos pueden añadirse | Buena opción si el usuario ya dispone de Pro o decide pagarlo |
| Vercel Hobby | Técnicamente puede alojar el código, pero el sitio de Sercom tiene finalidad comercial | Sus términos restringen Hobby a uso personal o no comercial | No proponerlo como alojamiento gratuito de este negocio |

El plan del equipo de Vercel debe confirmarse antes de elegir ese alojamiento. No se creó ningún proyecto ni se habilitaron servicios facturables. Si ya hay Pro, no se suma automáticamente una segunda suscripción de USD 20 por añadir el sitio al mismo equipo; el consumo y cualquier puesto adicional siguen sujetos al plan.

Las cuotas y precios no son una promesa permanente. Verificar otra vez al publicar. Los PDFs grandes de fabricantes se enlazan a su origen autorizado; no se copian todos a `public/`. Los que excedan el límite del alojamiento requerirían otra estrategia de archivos, evaluada cuando haga falta.

## Datos sin Supabase en la etapa inicial

| Información | Dónde queda | Cómo cambia |
| --- | --- | --- |
| Contacto y horario | `src/data/business.json` | Edición versionada |
| Categorías y productos | `src/data/catalog.json` | Importación o edición, validación y revisión |
| Fuentes de marcas/proveedores | `research/Sercom_Active_Fuentes_Catalogos.json` | Registro interno, fuera de la salida web |
| Selección de productos del cliente | Navegador, cuando se implemente la lista | Sin sincronización entre dispositivos; no guardar datos sensibles |
| Mensaje de cotización | WhatsApp/correo del cliente | El cliente revisa y envía; la web no acredita recepción |
| Historial de cambios del catálogo | Git | Commit y revisión de cambios |

La interfaz pública debe consumir una proyección de campos aprobados, no el archivo editorial completo. `getPublishedProducts` prepara esa separación. Aún falta desarrollar las pantallas del catálogo y conectar la lista de cotización.

## Supabase y alternativas posteriores

La documentación de Supabase aplica el límite de dos proyectos Free entre las organizaciones donde la persona es Owner o Admin; crear otra organización con el mismo usuario no añade automáticamente cupo. Esta primera etapa no utiliza un proyecto de Supabase.

No hace falta crear otra cuenta para esta web. Una cuenta propiedad del negocio podría tener sentido por titularidad y administración a futuro; no debe diseñarse la solución alrededor de acumular cuotas gratuitas ni mezclar datos de Sercom con proyectos de otra operación.

| Si aparece esta necesidad | Alternativa a evaluar | Observación |
| --- | --- | --- |
| Editar texto y algunas fichas desde una interfaz | CMS que guarde cambios en Git | Mantiene el sitio estático; requiere configurar permisos y el proceso de publicación |
| Panel con cambios frecuentes y estados compartidos | Supabase dedicado | PostgreSQL, administración y servicios integrados; resolver plan, permisos y copias de seguridad al implementarlo |
| PostgreSQL separado sin usar otro proyecto Supabase | Neon | La página actual ofrece Free con 100 proyectos, 100 CU-h/mes por proyecto y 1 GB por proyecto; validar plan e integración concreta al provisionar |
| Guardar solicitudes y gestionar un panel pequeño en Cloudflare | D1 + Workers | SQL basado en SQLite. Free actual: 10 bases, 5 GB totales y cuotas diarias. No es un reemplazo idéntico de Postgres ni de todo Supabase |
| Adjuntos grandes | Almacenamiento de objetos dedicado | No elegir proveedor ni contratarlo hasta definir volumen, permisos y retención |

No se ha creado Neon, D1 ni una nueva organización o cuenta de Supabase. La edición mediante panel, los folios de solicitudes, clientes y adjuntos requieren una fase propia; incluir protección contra spam, controles de acceso y política de datos ajustada al flujo real.

## Evolución sin rehacer el sitio

Mantener identificadores estables de marca/modelo/variante y componentes desacoplados del almacenamiento. En la etapa inicial una función lee JSON; si después se usa una base de datos, se reemplaza ese lector y se conserva la salida pública. Es posible seguir publicando un catálogo estático aprobado a partir de la base de datos: no tiene que consultarse la base en cada visita.

## Fuentes oficiales revisadas

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

La selección de arquitectura es una recomendación propia a partir del alcance de Sercom y estas fuentes. No se ha medido todavía tráfico o tamaño final del catálogo.
