# Estado del proyecto

Fecha: 18 de noviembre de 2026.

## Preparado

- Repositorio `SChavavt/sercom-active-web`, rama `main`, creado por el propietario y con visibilidad pública confirmada. La incorporación conserva el commit inicial.
- Plan maestro v1.2 incorporado, sin modificar el PDF original.
- Registro de investigación con 19 entidades y 35 referencias incorporado.
- Base Astro/TypeScript estática; portada mínima de contacto y página 404.
- Datos de negocio centralizados, horario completo y prioridad de computadora.
- Categorías candidatas en borrador, cero productos inventados.
- Reglas de aprobación, exclusión de GISA, separación marca/proveedor, duplicados y omisión de campos internos.
- Documentación de arquitectura, publicación, operación y siguientes entregas.
- Configuración compatible con Cloudflare Pages y Vercel; control de calidad de GitHub preparado.

## No realizado

- Alojamiento, dominio, base de datos y servicios de pago: no creados ni contratados.
- Importación de SKU, panel, búsqueda, filtros, lista de cotización y sincronización: siguientes entregas.
- QR: pendiente de URL definitiva publicada y probada.
- Prueba visual del sitio y prueba real del destinatario de WhatsApp: pendientes.

## Verificación local

- Dependencias instaladas y fijadas en `package-lock.json`: Astro 7.4.13, TypeScript 6.0.3 y @astrojs/check 0.9.12.
- Entorno de verificación: Node.js 24.22.3 y npm 11.9.0.
- `npm run check`: correcto, sin errores ni advertencias de Astro.
- `npm test`: 3 pruebas correctas (aprobación/proyección pública, evidencia/costos y exclusiones/duplicados).
- `npm run build`: correcto, dos páginas estáticas generadas (`index.html` y `404.html`).
- Registro: 19 entidades y 35 URLs válidas estructuralmente. Catálogo: cero productos y cero aprobados.
- No se ejecutó aún GitHub Actions ni se desplegó el proyecto. Las verificaciones fueron locales.
- No se realizó prueba visual en navegador ni envío de mensajes reales. El aviso de desarrollo y `noindex` permanecen deliberadamente.

## Próxima acción

Comprobar GitHub Actions para esta incorporación. Continuar con la navegación de escritorio y el catálogo piloto. La elección de base de datos puede posponerse sin bloquear ese desarrollo.

## Diseño base: lámina técnica (19 de noviembre de 2026)

Implementado y verificado localmente; sin publicar ni enviar a GitHub.

- La maqueta aprobada de la portada es ahora la base real del sitio: tipografía Archivo propia, logotipo SVG, favicons, kit de iconos, estilos por capa en `src/styles/`, plantilla `BaseLayout`, encabezado, pie, barra inferior móvil y componentes compartidos. La guía para construir páginas está en `docs/diseno.md`.
- Se retiraron los estilos anteriores (azul marino y cian).
- La portada se ve igual que la maqueta en vista previa. En producción, sin categorías ni productos aprobados, oculta la búsqueda, el menú Categorías y las secciones de catálogo, y muestra «Estamos preparando el catálogo» con accesos a cotizar y a la solicitud especial.
- Páginas provisionales para todas las rutas enlazadas (catálogo, categorías, marcas, producto, cotizar, solicitud especial, contacto y privacidad) y una página 404 funcional. Su contenido definitivo corresponde a las siguientes entregas.
- `npm run check`: 0 errores, 0 advertencias, 0 sugerencias (72 archivos). `npm test`: 119 pruebas correctas.
- `npm run verify`: producción 27 páginas y vista previa 47 páginas, 0 FAIL y 0 WARN; enlaces internos 668 y 2222 referencias sin problemas. La salida de producción no contiene datos de ejemplo.
- Revisión en navegador a 1440, 1280, 1024, 768 y 390 px: sin desbordamiento horizontal. axe: 0 infracciones en portada, páginas provisionales, 404 y estados abiertos (Categorías, menú móvil, búsqueda, preguntas frecuentes). Objetivos táctiles de al menos 44 px en 390 y 768.
- Material del propietario: se usa el logotipo en SVG en lugar del PNG de la maqueta; el pie queda entre 6 y 7 px más bajo en tableta y teléfono. El favicon SVG no tiene variante oscura (el escáner prohíbe `prefers-color-scheme: dark`).
- Pendiente: texto del aviso de privacidad y prueba real del enlace de WhatsApp con el destinatario.
