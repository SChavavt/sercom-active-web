# Plan de trabajo

El propietario aprobó cuatro pasos el 18 de noviembre de 2026, con la indicación de empezar por el primero y hacerlo bien desde el principio. Este documento dice qué entrega cada paso y cómo se acepta. El estado medido está en [`ESTADO.md`](ESTADO.md).

## Paso 1. Diseño y navegación completa — aprobado

**Entrega.** El sitio completo con el diseño «Lámina técnica», en computadora (prioridad), tableta y celular: portada, catálogo, categorías, marcas, ficha de producto, página de producto retirado, «Cotizar mi lista» y «Solicitud especial» como páginas sencillas con borrador de WhatsApp o correo, contacto, privacidad y 404. La búsqueda del catálogo y la navegación por categoría y marca funcionan. Hay dos compilaciones: producción, sin productos mientras no haya aprobados y con el aviso «Sitio en preparación»; y vista previa, con productos de ejemplo marcados.

**Se acepta cuando** el propietario revisa el sitio (localmente o en capturas) y aprueba el diseño y la navegación, o pide cambios. Los criterios técnicos de terminado (rutas, encabezado, textos del plan, estados, contraste, teclado, anchos, ejemplos solo en la vista previa, reglas duras, contacto, nada publicado) están cumplidos y su evidencia está en [`ESTADO.md`](ESTADO.md#44-criterios-de-terminado-del-paso-1).

**Estado.** Aprobado el 22 de noviembre de 2026, al integrar en `main` la solicitud de cambios n.º 1.

## Paso 2. Buscador, filtros y «Mi cotización» — construido, en revisión

**Entrega.** Filtros combinables en el catálogo y regreso a los resultados conservando su estado; «Agregar a mi cotización» en la ficha; la lista que se arma en el sitio, guardada solo en el navegador del cliente, con cantidades, unidades y variantes; resumen para copiar, envío por WhatsApp o correo y manejo de mensajes largos; la solicitud especial guiada. Los adjuntos siguen enviándose por WhatsApp o correo.

**Se acepta cuando** la búsqueda encuentra por código, marca y sin acentos; los filtros se combinan; la lista funciona con teclado, vacía y con muchos productos, con cantidades y unidades; ninguna página dice «recibimos tu solicitud» al abrir otra aplicación. Registrar la recepción en un sistema exigiría un servidor y un canal real, que no forman parte de este paso.

**Estado.** Construido en la solicitud de cambios n.º 2, que espera la revisión de quien dirige el proyecto: nada de este paso está aprobado, integrado ni publicado. Cada criterio, con su evidencia, está en [`ESTADO.md`](ESTADO.md#45-criterios-de-aceptación-del-paso-2); lo que solo se puede probar en un teléfono real o en otro navegador queda para antes del lanzamiento ([`ESTADO.md`](ESTADO.md#46-lo-que-nadie-ha-verificado-todavía)). Los filtros por talla, material, recubrimiento o tipo esperan los datos reales del paso 3.

## Paso 3. Catálogo piloto (30 a 50 productos reales) — pendiente

**Entrega.** Con el contacto comercial, las categorías y modelos prioritarios que Sercom Active puede suministrar; de 30 a 50 fichas con fuente, código exacto, unidad, variantes aplicables, imagen con uso confirmado, resumen y características verificadas, aprobadas una por una. Antes de cargarlas: ampliar el esquema de imagen (archivo local o dirección, con ancho y alto) y decidir cómo se revisa el texto de los fabricantes frente a las reglas del sitio. Al haber productos aprobados, los ejemplos dejan de ser necesarios.

**Se acepta cuando** cada ficha pasa el validador y las comprobaciones, el contacto comercial la aprobó y la compilación de producción muestra las categorías y los productos aprobados. El procedimiento está en [`catalogo-y-actualizaciones.md`](catalogo-y-actualizaciones.md).

## Paso 4. Publicación y QR — pendiente

**Entrega.** Alojamiento creado en una cuenta del propietario o de Sercom (propuesta: Cloudflare Pages en su plan gratuito); dirección estable de producción; retiro en producción de `noindex`, del `robots.txt` bloqueante y del aviso de sitio en preparación, después de decidir qué pasa con la vista previa, que comparte los dos primeros; `SITE_URL`, sitemap y metadatos para compartir; el QR en SVG y PNG, una guía breve y la hoja de seguimiento comercial que pide el plan. La lista completa está en [`publicacion.md`](publicacion.md#4-lista-de-lanzamiento).

**Se acepta cuando** las confirmaciones del negocio que bloquean la publicación están resueltas, el escáner pasa con `--launch`, los contactos se probaron en un teléfono real, el sitio se revisó en computadora, tableta y celular, está documentado cómo volver a una versión anterior y el QR impreso en tamaño real abre el sitio en varios teléfonos.

## Después del paso 4: operación

Al principio, revisión manual de las fichas y de los cambios de proveedores. Después, si conviene: detector de cambios por fuente, informe de diferencias y aprobación. La periodicidad semanal del plan maestro es una propuesta, no una tarea activada. Medir consultas, búsquedas sin resultado y uso de la cotización para decidir si hace falta un panel o una base de datos.

## Equivalencia con numeraciones anteriores

Notas anteriores usan las «entregas» 0 a 5 de la versión anterior de este documento o las etapas del plan maestro. Equivalen así:

| Paso aprobado | Entrega anterior | Etapa del plan maestro |
| --- | --- | --- |
| — | 0. Repositorio e infraestructura (hecho) | — |
| 1. Diseño y navegación completa | 1. Navegación y propuesta visual (sin la búsqueda y los filtros) | 2, salvo el dibujo de la página de cotización, que pasa al paso 2 |
| 2. Buscador, filtros y «Mi cotización» | 3. Cotización y solicitudes especiales, más la búsqueda y los filtros de la entrega 1 | 4 |
| 3. Catálogo piloto | 2. Catálogo piloto | 3 |
| 4. Publicación y QR | 4. Revisión y primera publicación | 5 y 6 |
| Operación, después del paso 4 | 5. Operación | — |

## Lo que el negocio todavía debe aportar

La lista al día, con quién responde y lo que bloquea cada punto, está en [`ESTADO.md`](ESTADO.md#7-pendiente-del-negocio). En resumen:

- La revisión del paso 2 y la aprobación de todos los textos del sitio por el contacto comercial, incluidos los nuevos del paso 2 y el aviso de privacidad, que la empresa revisa.
- La prueba del número de WhatsApp en un teléfono real.
- Qué categorías se aprueban y qué modelos prioritarios se pueden conseguir, con sus fuentes e imágenes de uso permitido.
- «Derma Care» o «Safety Guardian» en la lista de marcas.
- La dirección y los teléfonos de Puebla, y si se recibe a clientes en persona.
- El logotipo vectorial original.
- Las condiciones comerciales (facturación, mínimos, cobertura, pagos, entregas, devoluciones) y si se pueden usar afirmaciones como «más de 25 años», los servicios o la tienda en línea.
- La respuesta a la propuesta de alojamiento, quién tendrá las cuentas y el nombre de la dirección.
- Si se permite una vista previa en una dirección web para revisarla.
- Quién revisará los cambios del catálogo.

El contacto, el horario y la prioridad de computadora ya están definidos y no se vuelven a preguntar.
