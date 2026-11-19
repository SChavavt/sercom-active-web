# Estado del proyecto

Fecha: 19 de noviembre de 2026.

Este documento registra qué se decidió, qué está hecho, qué se comprobó y cómo, qué solo está propuesto, qué está publicado (nada) y qué falta. Distingue siempre entre **implementado** (existe en el código), **verificado localmente** (se comprobó en una computadora de trabajo), **propuesto** (planteado, sin aprobar ni ejecutar) y **desplegado** (publicado en Internet).

## En pocas palabras

- **El paso 1 (diseño y navegación completa) está construido y espera la revisión del propietario.** Todas las páginas existen con el diseño «Lámina técnica» elegido.
- **Nada está publicado.** No hay alojamiento, dominio, cuenta ni pago. El sitio solo se ha visto en computadoras de trabajo y en capturas entregadas al propietario.
- El sitio se genera en dos versiones (a cada generación se le llama *compilación*):
  - **Producción**, la que algún día se publicará: hoy no muestra productos, porque todavía no hay ninguno aprobado, y avisa en cada página «Sitio en preparación · Versión inicial para revisión».
  - **Vista previa**, solo para revisar el diseño: muestra productos de ejemplo, claramente marcados como «Ejemplo», que no son artículos reales.
- Los productos reales llegan en el paso 3. Antes de publicar hacen falta las confirmaciones del negocio de la sección 7.

## 1. Decisiones del propietario (18 de noviembre de 2026)

1. **Identidad.** El sitio se ve como Sercom Active, tomado de su logotipo: fondos blancos, tinta casi negra `#19171A` y azul Sercom `#0067B0`. No es un estilo oscuro ni usa la paleta azul marino y celeste del plan maestro, que ya no se usa en ningún lugar.
2. **Es el sitio propio de Sercom Active** en su identidad. Técnicamente es un proyecto aparte: nunca modifica `sercomactive.com` y no supone acceso a ese dominio.
3. **Material.** Solo el que está en el proyecto: el plan maestro, el logotipo y la imagen de las marcas. No hay lista de productos todavía; los reales llegan en el paso 3. Mientras tanto las páginas se revisan con productos de ejemplo marcados, que solo existen en la vista previa.
4. **Marcas.** Los diecinueve nombres del registro de investigación se listan en «Marcas que manejamos», como texto y sin logotipos. Guantes Internacionales/GISA sigue excluida.
5. **Cuatro pasos**, empezando por el 1 y haciéndolo bien desde el principio: (1) Diseño y navegación completa; (2) Buscador, filtros y «Mi cotización»; (3) Catálogo piloto (30 a 50 productos reales); (4) Publicación y QR. Detalle en [`plan-de-trabajo.md`](plan-de-trabajo.md).
6. **Dirección de diseño.** Se dibujaron tres propuestas de portada; el propietario eligió la A, «Lámina técnica». Todo el sitio la sigue.

## 2. Decisiones del 19 de noviembre de 2026

Tomadas al integrar y revisar el paso 1. Todas pueden revisarse con el propietario.

- **Aviso de sitio en preparación.** Hasta el lanzamiento, cada página de producción muestra «Sitio en preparación · Versión inicial para revisión», dibujado como el aviso de la vista previa; la vista previa muestra solo el suyo. Se retira al lanzar ([`publicacion.md`](publicacion.md)).
- **Borradores de mensaje.** El borrador general y los de producto abren con la línea del plan «Hola, Yosmara. Quiero solicitar una cotización con Sercom Active.»; los demás (lista, solicitud especial, marca, categoría, ficha técnica, producto retirado) conservan su redacción propia. Mientras el sitio no tenga dirección web definitiva, el enlace al producto se agrega al borrador cuando la página carga; sin JavaScript el borrador sale sin él.
- **Dirección del sitio.** No hace falta mientras se construye; se define al lanzar. La página de error 404 nunca declara una dirección canónica.
- **Textos decididos al integrar**, pendientes de aprobación como todos los demás: el aviso de sitio en preparación; el título de la portada «Sercom Active · Atención en Puebla»; el texto del buscador del encabezado «Buscar en el catálogo» y el del catálogo «Producto, marca o código».
- **Protecciones automáticas.** Para qué sirven, qué no cubren y cómo se cambian: [`datos-y-modos.md`](datos-y-modos.md#6-las-protecciones).
- **Se dejan como están** los puntos de la sección 10.

## 3. Implementado en el paso 1

**Páginas** (en la vista previa; producción tiene las mismas salvo las que dependen de productos y categorías aprobados):

- **Portada**: titular, accesos a cotizar y a la solicitud especial, categorías, marcas, productos, banda «¿Buscas algo que no aparece…?», atención con Yosmara, «Cómo funciona» y preguntas frecuentes. En producción, sin categorías ni productos aprobados, dice «Estamos preparando el catálogo» y ofrece las tres entradas.
- **Catálogo** con buscador, barra lateral de categorías y marcas y tarjetas de producto; en producción, una página de «Estamos preparando el catálogo» con las marcas.
- **Diez páginas de categoría** (solo en la vista previa, porque ninguna categoría está aprobada).
- **Marcas**: la lista de las 19 y una página por marca, con «Sitio del fabricante» cuando hay enlace verificado.
- **Ficha de producto** con imagen o pictograma, marca, código, unidad de venta, resumen, características, variantes, documentación o «Solicitar ficha técnica», «Cotizar este producto» y «Cotizar por correo» (diez ejemplos en la vista previa).
- **Producto retirado**: página informativa en la misma dirección de un producto que fue público, con «Consultar alternativas» (un ejemplo en la vista previa, en `/productos/ejemplo-producto-retirado/`, al que no enlaza ninguna página).
- **Cotizar mi lista** y **Solicitud especial**: qué enviar y el borrador de WhatsApp o correo; la solicitud especial recibe la búsqueda sin resultados del catálogo.
- **Contacto**, **Privacidad** y la página de **error 404**.

**Comportamientos:**

- Encabezado con navegación, búsqueda y «Cotizar mi lista» en computadora; menú y búsqueda plegables en tableta y celular; barra fija con «Cotizar mi lista» y WhatsApp en el celular.
- Cada acción de contacto abre un borrador de WhatsApp o de correo para la persona de contacto, con los datos de `src/data/business.json`. El sitio no envía nada ni muestra confirmaciones.
- Búsqueda del catálogo en la vista previa: por nombre, marca, código o categoría, sin distinguir acentos; sin resultados, ofrece «Solicitar este producto» con lo buscado.
- Sin precios, sin existencias, sin carrito, sin dirección física ni mapa, sin afirmaciones de distribución autorizada.
- Ninguna página se indexa en buscadores hasta el lanzamiento: cada página pide a los buscadores que no la incluyan en sus resultados (con la etiqueta `noindex`), y el archivo `robots.txt` les pide no recorrer el sitio. Las dos cosas valen hoy para las dos compilaciones; qué pasa con ellas en la vista previa después del lanzamiento está pendiente ([`publicacion.md`](publicacion.md#4-lista-de-lanzamiento)).
- Las dos compilaciones, con los ejemplos solo en la vista previa.
- Protecciones automáticas que revisan los datos, el código y el sitio generado: validador, pruebas, escáner de reglas, verificador de enlaces y verificador de marcado ([`datos-y-modos.md`](datos-y-modos.md)).
- Accesibilidad: teclado, foco visible, objetivos táctiles, texto espaciado, colores forzados y contraste documentado ([`diseno.md`](diseno.md#11-accesibilidad)).

## 4. Verificado y cómo

### 4.1 Comandos

Ejecutados el 19 de noviembre de 2026 sobre el código del commit `5ba1a00` (la versión guardada del código que se revisó; estos documentos no cambian el código), con Node.js 24.22.3 y npm 11.19.1. Estas son las únicas cifras del proyecto que cambian con el tiempo; cada una va con el comando que la da.

| Comando | Resultado |
| --- | --- |
| `npm run validate:catalog` | «Registro: 19 entidades / 35 referencias.» «Catálogo: 0 productos / 0 aprobados / 0 retirados con página informativa.» «Marcas públicas: 19 / 14 con enlace al sitio del fabricante.» «Ejemplos de vista previa: 11 (1 retirado)». Validación correcta. |
| `npm run check` | «Result (95 files): 0 errors, 0 warnings, 2 hints». Las dos sugerencias son dos parámetros sin usar en `scripts/scan-dist.mjs`. |
| `npm test` | «tests 250, pass 250, fail 0». |
| `npm run verify` | Termina sin error. Escáner: producción 27 páginas HTML (44 archivos), 0 FAIL y 0 WARN con `--strict`; vista previa 48 páginas HTML (65 archivos), 0 FAIL y 0 WARN. Enlaces: 1144 referencias internas en producción y 3521 en la vista previa, 0 con problemas. Marcado: 17 comprobaciones, 0 problemas en las dos. |
| `node scripts/scan-dist.mjs dist --launch` | 55 FAIL, como se espera antes del lanzamiento: el aviso de sitio en preparación (27 páginas), `noindex` (27 páginas) y `robots.txt`. |

Las 27 páginas de producción son: portada, 404, catálogo, marcas, las 19 páginas de marca, cotizar, solicitud especial, contacto y privacidad. La vista previa agrega las 10 categorías y las 11 páginas de producto (10 ejemplos y el retirado).

### 4.2 Revisión en navegador

- Hubo tres revisiones independientes, cada una seguida de correcciones: la base (plantilla, encabezado, pie, componentes compartidos y protecciones de datos), las páginas, y una revisión final de todo el sitio en tres frentes (requisitos y contacto; aspecto; accesibilidad y robustez).
- La revisión final no encontró defectos que bloquearan. Sus quince puntos confirmados se corrigieron y se verificaron otra vez.
- Las revisiones en navegador cubrieron cada tipo de página en las dos compilaciones, de 320 a 1920 px de ancho, con teclado, sin JavaScript, con el espaciado de texto de WCAG 1.4.12, en colores forzados y con textos de búsqueda maliciosos. En la revisión final, hecha antes de sus correcciones, axe no encontró infracciones en 274 revisiones (cada tipo de página, ambos modos, 1440, 768 y 390 px, con cada panel abierto), y ninguna página se desplazaba a los lados.
- Las revisiones se hicieron con Chromium.
- Las capturas se entregaron al propietario fuera del repositorio; no se guardan en él por su peso.

### 4.3 GitHub Actions

El trabajo está en la rama `claude/project-thread-xtacqo` (una línea de trabajo separada dentro del repositorio, que no cambia la versión principal hasta que se integra), en la solicitud de cambios n.º 1 del repositorio, en borrador; nada se ha integrado en `main`, la versión principal. GitHub Actions (el servicio de GitHub que ejecuta comprobaciones automáticas) corre el flujo de calidad en cada envío a esa rama, a través de la solicitud de cambios: `npm ci`, `check`, `test`, `build` y `verify`. No publica nada.

### 4.4 Criterios de terminado del paso 1

| # | Criterio | Estado | Evidencia |
| --- | --- | --- | --- |
| 1 | Las rutas se generan y abren; cotizar y solicitud especial son páginas honestas | Cumple | Todas las rutas responden en ambos modos (27 y 48 páginas); `/no-existe/` y `/a/b/c/` dan la 404. |
| 2 | Encabezado en cada página con logotipo, Catálogo, Marcas, Contacto y contacto; «Menú» en el celular; ubicación actual | Cumple | Revisado a 1440 y 390 px; el menú abre y Escape lo cierra; `aria-current` correcto por tipo de página (verificador de marcado U-05). |
| 3 | Nueve secciones de la portada en orden | Cumple en la vista previa; en producción, por diseño | Producción omite categorías y productos y muestra las tres entradas. |
| 4 | Textos de la página 11 del plan al pie de la letra | Cumple | Cada texto encontrado carácter por carácter en la vista previa. |
| 5 | Tres entradas; «Cotizar mi lista» y «Ayúdame a encontrarlo» visibles y funcionando | Cumple | Portada, encabezado, banda y pie. |
| 6 | Catálogo con tarjetas iguales, entrada por categoría y marca, búsqueda, ningún control inerte | Cumple | Búsqueda probada (conteo, sin resultados, limpiar, regreso con `?q`); producción no tiene búsqueda porque no hay productos. |
| 7 | Página de categoría | Cumple hasta donde los datos lo permiten | «Marcas en esta categoría» no aparece porque los ejemplos no tienen marca real. |
| 8 | Marcas como texto, ningún proveedor como marca, sin afirmar disponibilidad | Cumple | Las 19 páginas; «Sitio del fabricante» abre en otra pestaña. |
| 9 | Ficha con sus zonas, texto de condiciones y «Cotizar este producto» con marca, código y enlace | Cumple | El enlace se agrega al cargar la página sin dirección del sitio, o va escrito con ella. |
| 10 | Estados: sin resultados, dato no confirmado, documento no disponible, producto retirado, lista vacía | Cumple | Ver [`diseno.md`](diseno.md#8-estados). |
| 11 | Contacto sin dirección, mapa ni «Visítanos» | Cumple | El escáner no encuentra ninguno. |
| 12 | Identidad: blanco, tinta, azul, logotipo sin modificar, sin paleta anterior ni tema oscuro | Cumple | El escáner no encuentra la paleta anterior ni tema oscuro. |
| 13 | Cada par de texto y fondo listado con su contraste | Cumple | Tabla en [`diseno.md`](diseno.md#116-contraste), con la del anillo de foco. |
| 14 | Teclado y enlace «Saltar al contenido» | Cumple | Recorrido con Tab y Mayús+Tab en todos los anchos; Escape cierra cada panel. |
| 15 | Sin desbordamiento horizontal a 1440, 1280, 768, 390 y 360 px | Cumple | Ambas compilaciones. |
| 16 | Capturas de cada página a los cinco anchos | Cumple hasta donde el repositorio lo permite | Entregadas fuera del repositorio. |
| 17 | Ejemplos solo en la vista previa, marcados, con aviso; una prueba lo demuestra | Cumple | `tests/build-output.test.mjs` y el escáner. |
| 18 | El escáner sin fallos en ambas compilaciones | Cumple | Sección 4.1. |
| 19 | Contactos solo de `business.json` | Cumple | Cada enlace de WhatsApp va a `https://wa.me/5212214002219` y cada correo a `ventas.puebla@sercomactive.com`. |
| 20 | Ningún mensaje de éxito después de un clic de contacto | Cumple | Clics reales a 1440 y 390 px. |
| 21 | `noindex`, `robots.txt` bloqueante y aviso de desarrollo; sin sitemap | Cumple | El aviso «Sitio en preparación» se agregó después de la revisión final; el escáner lo exige en cada página de producción (R-RULE-12). |
| 22 | Las páginas leen solo la proyección pública | Cumple | Nada de aprobación, fuente, uso de imagen ni del registro en la salida. |
| 23 | `check`, `test` y `build` pasan con Node 24; sin dependencias de servidor | Cumple | Sección 4.1; la única dependencia es Astro. |
| 24 | `ESTADO.md` con decisiones, vista previa, evidencia y estados; documentos corregidos; «cómo cambiar el contacto» | Cumple | Este documento y la actualización de todos los documentos del 19 de noviembre; [`datos-y-modos.md`](datos-y-modos.md#91-cómo-cambiar-el-contacto). |
| 25 | Nada publicado, comprado ni contratado; `sercomactive.com` intacto | Cumple | El flujo de GitHub corre en solicitudes de cambios y envíos, sin tareas programadas; nada en el repositorio despliega. |

## 5. Solo propuesto

- **Alojamiento** (18 de noviembre de 2026; el propietario no ha respondido): no publicar ni pagar nada mientras se construye; al lanzar, Cloudflare Pages en su plan gratuito, en una cuenta del propietario o de Sercom. El plan gratuito de Vercel no se usa porque sus términos lo limitan a uso personal o no comercial; Vercel Pro (20 dólares al mes por equipo, precio base publicado) queda posible más adelante. Detalle en [`arquitectura.md`](arquitectura.md).
- **QR:** apuntará a un subdominio de un dominio que controle Sercom, para que la dirección impresa sobreviva a un cambio de alojamiento.
- **Navegadores compatibles:** Safari e iOS 16, Chrome y Edge 117, Firefox 101 o posteriores ([`diseno.md`](diseno.md#12-navegadores-compatibles)); se confirma antes de publicar.
- **Productos reales:** cómo revisar el texto de los fabricantes frente a las reglas del sitio ([`datos-y-modos.md`](datos-y-modos.md#7-límite-conocido-las-reglas-de-afirmaciones-y-el-texto-de-los-productos)).

## 6. Desplegado

Nada. No se ha creado ninguna cuenta ni proyecto de alojamiento, no se ha comprado ningún dominio y no se ha publicado ninguna versión.

## 7. Pendiente del negocio

Ninguno bloquea el paso 1. Todos bloquean la publicación, salvo donde se indica. Cada punto dice quién responde cuando está definido; donde dice «el negocio», el propietario indica quién lo confirma.

**Del propietario:**

- **Revisión del paso 1** y los cambios que pida (sección 8).
- **Alojamiento.** La respuesta a la propuesta (sección 5), quién abre y conserva las cuentas, y el nombre de la dirección del sitio.
- **Vista previa en una dirección web.** Si se permite colocar una vista previa marcada y no indexada en una dirección web para revisarla (no bloquea la publicación).
- **Quién revisará los cambios del catálogo** cuando haya productos reales.
- **La aprobación para publicar.**

**Del contacto comercial:**

- **Textos.** Todo texto visible del sitio es un borrador para su aprobación, incluidos los de la página 11 del plan maestro.
- **Aviso de privacidad.** La aprobación de su texto.
- **Categorías y productos.** Cuáles de las diez categorías se aprueban, y los primeros productos reales con sus fuentes e imágenes (paso 3).

**Del negocio:**

- **Marca en la posición 17.** La imagen de marcas de la empresa dice «Safety Guardian»; el registro y el sitio dicen «Derma Care». ¿Cuál es la correcta?
- **Dirección y teléfono de Puebla.** El sitio propio de la empresa muestra otra dirección de Puebla y otros teléfonos que los dados para este proyecto. Hasta aclararlo y confirmar la atención presencial, el sitio no muestra dirección, mapa ni «Visítanos».
- **WhatsApp.** Confirmar en un teléfono real que el número abre el chat de la persona de contacto (en los datos, `whatsappTested` sigue en `false`).
- **Logotipo vectorial original.** Solo existe un PNG de 400 px; el SVG del repositorio es un trazo fiel de él. Hace falta para imprimir.
- **Afirmaciones que no se usan hasta confirmarlas:** «más de 25 años», los tres servicios (análisis de riesgo, asesorías, capacitaciones) y cualquier enlace a la tienda en línea de la empresa. Hoy el pie de cada página y la descripción por omisión para buscadores dicen «Venta, entrega y asesoría de productos de seguridad industrial.»: esa «asesoría» se confirma o se quita junto con los servicios. Solo «más de 25 años» lo detecta una comprobación automática; lo demás depende de revisar cada cambio ([`datos-y-modos.md`](datos-y-modos.md#63-escáner-de-reglas)).
- **Condiciones comerciales** (facturación, mínimos, cobertura, pagos, entregas, devoluciones): el sitio dice que se confirman al cotizar.

## 8. Pendiente técnico, por paso

- **Paso 1:** la revisión del propietario y los cambios que pida.
- **Paso 2 (buscador, filtros y «Mi cotización»):** filtros combinables, «Agregar a mi cotización» en la ficha, la lista que se arma en el sitio con cantidades y variantes, copiar el resumen y manejar mensajes largos; la búsqueda guiada de la solicitud especial.
- **Paso 3 (catálogo piloto):** cargar de 30 a 50 productos reales aprobados; ampliar el esquema de imagen (archivo local o dirección, con ancho y alto) con sus pruebas; decidir cómo se revisa el texto de los productos frente a las reglas del escáner; revisar la opción `--strict` cuando haya normas con fuente; retirar los ejemplos cuando haya productos aprobados; actualizar las pruebas que hoy dan por hecho que no hay productos reales y que las categorías están en borrador ([`datos-y-modos.md`](datos-y-modos.md#62-pruebas)).
- **Paso 4 (publicación y QR):** elegir y crear el alojamiento, definir la dirección, la lista de lanzamiento de [`publicacion.md`](publicacion.md) (decidir qué pasa con el `noindex` y el `robots.txt` de la vista previa, que son los mismos de producción; retirar de producción `noindex`, `robots.txt` y el aviso; agregar `SITE_URL`, sitemap y metadatos para compartir; escáner con `--launch`), comprobar en el alojamiento la página 404, las direcciones sin diagonal final y cómo se vuelve a una versión anterior, confirmar los navegadores compatibles, generar y probar el QR.
- **Mejoras anotadas:** el menú abierto en una pantalla muy baja (sección 10); detalles de código listados en la revisión de estos documentos (dos comentarios que dicen «al hacer clic» donde el enlace se agrega al cargar, dos parámetros sin usar que dan las dos sugerencias de `npm run check`, la posición fija de la imagen de la ficha, que usa el alto de diseño del encabezado en lugar de su alto real, un comentario de `scripts/check-markup.mjs` que dice que la vista previa exige la entrada «Categorías» cuando solo exige la búsqueda, y `.env.example`, que presenta `SITE_URL` como variable de un archivo `.env` aunque ese archivo no la aplica).

## 9. Qué se puede revisar y cómo

Para ver el sitio en una computadora con Node.js 24: `npm ci` y después `npm run dev` (vista previa con ejemplos) o `npm run build` seguido de `npm run preview` (producción; el servidor se detiene con Ctrl+C). El ejemplo de producto retirado se abre escribiendo `/productos/ejemplo-producto-retirado/` después de la dirección local. Instrucciones completas en [`README.md`](../README.md).

## 10. Límites conocidos

Decididos o aceptados; ninguno impide revisar el paso 1.

- Un código de producto largo puede seguir en un segundo renglón después de uno de sus propios guiones.
- En el celular, las listas plegadas de categorías y marcas del catálogo aparecen antes del aviso de búsqueda sin resultados.
- Una categoría sin productos muestra su mensaje sin la lista lateral.
- El botón del menú dice «Cerrar» mientras el menú está abierto.
- En una pantalla muy baja (por ejemplo, con el navegador al 400 % de zoom), el menú abierto queda corto hasta desplazar la página. Se anota como mejora para un paso posterior.
- Una búsqueda hecha solo de signos de puntuación (por ejemplo, `-`) se muestra en la página de solicitud especial, pero en el catálogo no busca nada. Cómo se limpia el texto de búsqueda está en [`diseno.md`](diseno.md#10-scripts-del-navegador).
- En producción se publica la hoja de estilo de la página de producto aunque hoy ninguna página la use ([`datos-y-modos.md`](datos-y-modos.md#67-diferencia-aceptada-en-producción)).
- Las protecciones automáticas detectan errores escritos de forma directa, no ocultamientos deliberados; sus límites por regla están en [`datos-y-modos.md`](datos-y-modos.md#63-escáner-de-reglas).

## 11. Historia

- **18 de noviembre de 2026.** Se incorporó al repositorio la base Astro y TypeScript con el plan maestro v1.2 y el registro de investigación (19 entidades, 35 referencias), sin modificar el PDF original. El propietario tomó las seis decisiones de la sección 1. Se agregaron los nombres cortos de las categorías, la lista pública de marcas, los ejemplos de vista previa, la capa de datos públicos con los dos modos, los enlaces de contacto, el escáner de reglas y el verificador de enlaces.
- **19 de noviembre de 2026.** Se construyó la base visual «Lámina técnica» (fuente propia, logotipo SVG, iconos, plantilla, encabezado, pie, barra fija y componentes compartidos) y se retiraron los estilos azul marino y celeste. Se construyeron todas las páginas, la búsqueda del catálogo, la página de producto retirado y el verificador de marcado. Se hicieron las tres revisiones de la sección 4.2 con sus correcciones, se agregó el aviso de sitio en preparación y se actualizaron todos los documentos.
