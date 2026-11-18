# Sercom Active · catálogo web

Base del sitio de presentación y catálogo de Sercom Active, con atención comercial en Puebla por Yosmara del Rocío Torres Pérez.

**Estado:** estructura inicial y planificación técnica en [SChavavt/sercom-active-web](https://github.com/SChavavt/sercom-active-web). El catálogo de productos está vacío de manera intencional; no se han inventado ni aprobado modelos. No hay base de datos, sincronización de proveedores activa, dominio comprado ni sitio publicado.

El repositorio es público. El propietario confirmó continuar con el proyecto completo, el plan maestro y las fuentes. No incluir secretos, documentos de clientes ni información comercial confidencial en nuevos cambios.

## Decisión inicial propuesta

- Astro y TypeScript, salida estática portable.
- Cloudflare Pages Free como alojamiento inicial recomendado para reducir el costo; subdominio del proveedor al comenzar. La URL exacta todavía no está reservada.
- Vercel como alternativa si se confirma un equipo Pro disponible. El acceso conectado no devolvió el plan de facturación; no se presupone Pro. No usar Hobby para este sitio comercial.
- Catálogo aprobado en archivos JSON versionados. Sin Supabase en la primera etapa.
- Enlaces a WhatsApp y correo para solicitar cotizaciones; no existe un formulario de envío a servidor.
- Computadora como experiencia principal; adaptación a celular y tableta.

Las recomendaciones de alojamiento no equivalen a una contratación ni a una publicación. Detalle y fuentes en [docs/arquitectura.md](docs/arquitectura.md).

## Empezar

Usar Node.js 24 y npm. Las versiones directas están fijadas y el archivo `package-lock.json` registra las dependencias resueltas.

```bash
npm ci
npm run check
npm test
npm run build
npm run dev
```

El proyecto funciona sin `.env`. `SITE_URL` es opcional hasta definir el alojamiento. La página inicial es una base mínima de contacto y está marcada `noindex` mientras se desarrolla; eso no constituye una medida de privacidad. No se presenta como el diseño final aprobado.

## Archivos principales

| Ruta | Uso |
| --- | --- |
| `AGENTS.md` | Instrucciones para Codex y otros agentes |
| `docs/Sercom_Active_Plan_Maestro_Web_y_Catalogo.pdf` | Plan de investigación v1.2; incluye horario y prioridad de escritorio |
| `docs/arquitectura.md` | Plataforma, costos, decisiones y evolución de datos |
| `docs/plan-de-trabajo.md` | Siguientes entregas y criterios de aceptación |
| `docs/catalogo-y-actualizaciones.md` | Cómo cargar, revisar y actualizar productos |
| `docs/publicacion.md` | Cómo conectar GitHub y desplegar después |
| `docs/ESTADO.md` | Qué se hizo, pruebas y pendientes reales |
| `research/Sercom_Active_Fuentes_Catalogos.json` | Registro original: 19 entidades y 35 URLs; no es catálogo de productos |
| `src/data/business.json` | Contacto, horario y datos del negocio |
| `src/data/catalog.json` | Productos; solo los aprobados pueden mostrarse |
| `src/lib/catalog-policy.mjs` | Validación de publicación y exclusiones |
| `.github/workflows/quality.yml` | Revisión al subir cambios, sin despliegue ni tareas programadas |

La documentación y la investigación están fuera de `public/`, por lo que no se copian al sitio. No subir costos de proveedor, datos de clientes, claves o archivos privados al repositorio.

## Alcance comercial

Sin precios públicos, pagos en línea ni cuentas de clientes. La disponibilidad y los plazos se confirman al cotizar. Excluir Guantes Internacionales/GISA. No anunciar distribución autorizada, stock, certificaciones ni compatibilidad sin evidencia. Una marca de la lista no acredita que todos sus productos estén disponibles.

El proyecto es independiente de `sercomactive.com`; no modifica ese dominio ni presupone acceso a él.
