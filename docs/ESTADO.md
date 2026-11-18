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
