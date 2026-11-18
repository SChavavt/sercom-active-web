# Instrucciones de trabajo

## Objetivo y alcance actual

Crear un sitio profesional de Sercom Active para que clientes exploren categorías, marcas y modelos y contacten a Yosmara con un requerimiento claro. Prioridad: experiencia web de computadora; adaptar también celular y tableta. Leer `README.md`, `docs/ESTADO.md`, el plan maestro y `docs/arquitectura.md` antes de cambiar la arquitectura.

El arranque es Astro/TypeScript estático con datos versionados. Cloudflare Pages es la recomendación de costo inicial; Vercel es una alternativa condicionada al plan comercial. Todavía no hay alojamiento elegido de forma definitiva, URL pública ni recursos provisionados. No añadir Supabase, login, pagos, panel o servidor por inercia.

## Datos confirmados

- Contacto: Yosmara del Rocío Torres Pérez.
- WhatsApp aportado: +52 1 221 400 2219; correo: ventas.puebla@sercomactive.com.
- Horario: lunes a viernes de 9:00 a 18:00; sábado y domingo cerrado; America/Mexico_City.
- Dirección aportada: C. 31-A Nte. 1024, Villa San Alejandro, 72090 Heroica Puebla de Zaragoza, Pue., México. Falta confirmar atención presencial; no anunciar visitas todavía.
- El enlace de WhatsApp está pendiente de prueba funcional por el negocio. Conservar el número aportado hasta comprobar cualquier normalización.

## Datos de catálogo

No fabricar productos, modelos, normas, fichas, testimonios ni inventario. El registro de investigación no es un feed, una autorización de uso ni una validación de todos los SKU. Excluir Guantes Internacionales/GISA incluso en documentos combinados. Espomega es un proveedor; no duplicar productos Derma Care por esa relación.

Datos públicos sin precios ni costos. Usar `src/data/catalog.json`, `src/types/catalog.ts` y `src/lib/catalog-policy.mjs`. Conservar fuente, fecha de revisión y aprobación. Publicar solo `approved` mediante la proyección de campos públicos. Material incierto permanece en borrador. No exponer el registro completo de investigación ni metadatos internos en la salida web.

Las consultas de proveedores son trabajos separados de las visitas del cliente. Un error de descarga jamás borra productos. No activar tareas periódicas ni prometer actualizaciones automáticas antes de implementar y validar cada conector.

## Desarrollo

Usar npm y Node.js 24; mantener el lockfile. Ejecutar `npm run check`, `npm test` y `npm run build` para cambios de datos o código. Las pruebas deben cubrir riesgos del flujo, no replicar detalles del diseño. La compilación no reemplaza la revisión visual y funcional antes de publicar.

El contacto abre WhatsApp o correo; abrir una aplicación no prueba que el mensaje se envió. Más adelante la cotización debe ofrecer copiar el resumen y soportar listas largas. No simular confirmaciones de recepción.

## Publicación

No modificar `sercomactive.com` ni otros repositorios/proyectos del usuario. El permiso actual cubre preparar el repositorio y planear la infraestructura. No comprar dominio, contratar planes ni crear cuentas para obtener cuotas. Mantener un estado revisable antes de la publicación comercial. Generar QR definitivo solo con una URL pública estable probada.

El sitio mínimo está en desarrollo. `noindex` no restringe acceso. Al preparar el lanzamiento se debe revisar el contenido comercial, probar contactos, definir la URL y retirar los bloqueos de indexación deliberadamente.

El repositorio es público por decisión del propietario. El plan y la investigación se incorporaron con su confirmación; no agregar secretos, documentos de clientes ni datos comerciales confidenciales.

Registrar decisiones nuevas y evidencia de pruebas en `docs/ESTADO.md`. Diferenciar siempre entre implementado, propuesto, verificado localmente y desplegado.
