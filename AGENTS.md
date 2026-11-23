# Instrucciones de trabajo

## Objetivo y alcance actual

Crear un sitio profesional de Sercom Active para que clientes exploren categorías, marcas y modelos y contacten a Yosmara con un requerimiento claro. Prioridad: experiencia web de computadora; adaptar también celular y tableta. Leer `README.md`, `docs/ESTADO.md`, el plan maestro y `docs/arquitectura.md` antes de cambiar la arquitectura.

Cuatro pasos aprobados por el propietario (`docs/plan-de-trabajo.md`): (1) diseño y navegación completa, **aprobado** el 22 de noviembre de 2026 (solicitud de cambios n.º 1); (2) buscador, filtros y «Mi cotización», **construido y en revisión** (solicitud de cambios n.º 2, en borrador; nada aprobado, integrado ni publicado); (3) catálogo piloto de 30 a 50 productos reales; (4) publicación y QR.

Identidad (decisión del propietario): el sitio es de Sercom Active y se ve como su logotipo, con fondos blancos, tinta `#19171A` y azul `#0067B0`, diseño «Lámina técnica». Sin estilo oscuro y sin la paleta azul marino y celeste del plan maestro. Técnicamente es un proyecto aparte: no modifica `sercomactive.com` ni supone acceso a ese dominio. Guía de diseño: `docs/diseno.md`.

Astro y TypeScript con salida estática y datos versionados. Alojamiento propuesto al lanzar: Cloudflare Pages Free en una cuenta del propietario o de Sercom; Vercel Hobby no se usa (uso comercial); Vercel Pro solo si se decide pagarlo. Todavía no hay alojamiento elegido, URL pública ni recursos provisionados. No añadir Supabase, login, pagos, panel o servidor por inercia.

## Datos confirmados

- Contacto: Yosmara del Rocío Torres Pérez.
- WhatsApp aportado: +52 1 221 400 2219; correo: ventas.puebla@sercomactive.com.
- Horario: lunes a viernes de 9:00 a 18:00; sábado y domingo cerrado; America/Mexico_City.
- Dirección aportada: C. 31-A Nte. 1024, Villa San Alejandro, 72090 Heroica Puebla de Zaragoza, Pue., México. Falta confirmar atención presencial; no anunciar visitas ni publicar la dirección todavía.
- El enlace de WhatsApp está pendiente de prueba funcional por el negocio. Conservar el número aportado hasta comprobar cualquier normalización.

Todo sale de `src/data/business.json`; cómo cambiarlo: `docs/datos-y-modos.md`.

## Datos de catálogo

No fabricar productos, modelos, normas, fichas, testimonios ni inventario. El registro de investigación no es un feed, una autorización de uso ni una validación de todos los SKU. Excluir Guantes Internacionales/GISA incluso en documentos combinados. Espomega es un proveedor; no duplicar productos Derma Care por esa relación.

Datos públicos sin precios ni costos. Usar `src/data/catalog.json`, `src/data/brands.json`, `src/types/catalog.ts` y `src/lib/catalog-policy.mjs`. Conservar fuente, fecha de revisión y aprobación. Publicar solo `approved` mediante la proyección de campos públicos. Material incierto permanece en borrador. No exponer el registro completo de investigación ni metadatos internos en la salida web.

Dos compilaciones (`docs/datos-y-modos.md`): **producción** (`npm run build`, `dist/`) solo con lo aprobado y, hasta el lanzamiento, con el aviso «Sitio en preparación»; **vista previa** (`npm run build:preview`, `dist-preview/`) con productos de ejemplo marcados, solo para revisar el diseño. Los ejemplos nunca entran en `catalog.json` ni en producción, y la vista previa nunca se publica como sitio ni como dirección del QR.

Las consultas de proveedores son trabajos separados de las visitas del cliente. Un error de descarga jamás borra productos. No activar tareas periódicas ni prometer actualizaciones automáticas antes de implementar y validar cada conector.

## Desarrollo

Usar npm y Node.js 24; mantener el lockfile. Antes de proponer cualquier cambio de datos o de código, `npm run check`, `npm test` y `npm run verify` deben pasar. Por decisión de quien dirige el proyecto del 23 de noviembre de 2026, la batería completa (`npm test`) y la verificación completa (`npm run verify`) corren en GitHub, en la comprobación «Verificar catálogo y sitio» de la solicitud de cambios de la rama; en la computadora de trabajo se corren solo los archivos de prueba de lo que cambió (`node --test tests/<archivo>.test.mjs`), `npm run check` y las compilaciones que haga falta para revisar en el navegador. Las pruebas deben cubrir riesgos del flujo, no replicar detalles del diseño. Varias fijan los datos de hoy (19 marcas, ningún producto real, categorías en borrador, el contacto, las órdenes de `verify` y `vercel.json`): qué pruebas cambian con cada cambio de datos está en `docs/datos-y-modos.md` (6.2). Las comprobaciones no reemplazan la revisión visual y funcional en el navegador.

El texto debe caber con el espaciado de WCAG 1.4.12 y con la letra agrandada a 125 %, 150 % y 200 %: un componente nuevo o un texto más largo se revisa también así, y no lleva alto fijo donde haya texto (las pocas excepciones están en 11.4). Las reglas de la letra agrandada (consultas de contenedor con umbrales en `rem`) y la revisión que cualquiera puede repetir están en `docs/diseno.md` (11.4 y 15).

Ningún control que no haga nada: todo lo que se ve funciona, y lo que corresponde a un paso posterior no se dibuja. Sin JavaScript cada página sigue siendo usable. Un script del navegador no alcanza `site-data.mjs`, `contact.mjs` ni archivos `.json`, ni directamente ni a través de otro módulo: solo los módulos sin datos de `BROWSER_MODULES` (`tests/build-mode.test.mjs`), y un módulo nuevo se agrega ahí con sus importaciones. Solo `src/lib/quote-store.mjs` toca `localStorage` y `sessionStorage`. Cada control lleva una función nativa o un gancho `data-*` que el código de su página nombra, y ningún `<script>` va dentro de un `<template>` (R-RULE-30a y R-RULE-30b, `docs/datos-y-modos.md` 6.5).

El contacto abre WhatsApp o correo; abrir una aplicación no prueba que el mensaje se envió. «Mi cotización» (paso 2) es una lista guardada solo en el navegador del visitante (`cotizacion:v1`, sin servidor ni cookies) que la página «Cotizar mi lista» convierte en un mensaje: ofrece «Copiar solicitud», y cuando el mensaje no cabe en un enlace (`LINK_LIMITS`) ningún enlace lleva el texto y la página pide copiar primero. La página nunca cambia lo guardado por su cuenta, solo lo que el visitante toca; un cambio de lo que guarda un renglón usa una clave nueva (`cotizacion:v2`). No simular confirmaciones de recepción. Decisiones y límites: `docs/ESTADO.md` (2.2).

## Publicación

No modificar `sercomactive.com` ni otros repositorios o proyectos del usuario. El permiso actual cubre preparar el repositorio y planear la infraestructura. No comprar dominio, contratar planes ni crear cuentas para obtener cuotas. Mantener un estado revisable antes de la publicación comercial. Generar el QR definitivo solo con una URL pública estable probada.

El sitio está en desarrollo: cada página lleva `noindex`, `robots.txt` bloquea el rastreo y producción muestra el aviso de sitio en preparación. `noindex` no restringe el acceso. Al preparar el lanzamiento se revisa el contenido comercial, se prueban los contactos, se define la URL y se retiran deliberadamente de producción los bloqueos y el aviso; el `noindex` y el `robots.txt` son comunes a las dos compilaciones, así que antes hay que decidir qué pasa con ellos en la vista previa (`docs/publicacion.md`).

El repositorio es público por decisión del propietario. El plan y la investigación se incorporaron con su confirmación; no agregar secretos, documentos de clientes ni datos comerciales confidenciales.

Registrar decisiones nuevas y evidencia de pruebas en `docs/ESTADO.md`. Diferenciar siempre entre implementado, propuesto, verificado localmente y desplegado.
