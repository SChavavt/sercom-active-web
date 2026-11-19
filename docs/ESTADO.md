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
- **Bloque «Atención con …».** En la portada, contacto, cotizar y solicitud especial tiene la misma forma: una celda a la izquierda y los datos de contacto a la derecha; el orden en pantalla es el mismo que el del teclado en todos los anchos.
- **Orden del teclado del encabezado en tableta.** Buscar, Menú, WhatsApp y «Cotizar mi lista», aunque el botón Menú se dibuja al final: el menú necesita ese botón antes de la navegación. Se acepta ([`diseno.md`](diseno.md#43-encabezado-siteheader)).
- **Texto que escribe el visitante en una búsqueda.** Antes de mostrarlo y de buscarlo se quitan los caracteres que no se ven, así la línea de resultados muestra exactamente lo que se buscó; una búsqueda sin nada visible cuenta como sin búsqueda. Una búsqueda hecha solo de signos (por ejemplo `-`) se muestra en la solicitud especial y en el catálogo no busca nada: se acepta ([`diseno.md`](diseno.md#10-scripts-del-navegador)).
- **Nombres largos de producto.** El objetivo es la versión de producción en una pantalla de 1440 × 900, con el aviso de sitio en preparación: con un nombre de hasta 90 caracteres y un resumen del largo de los ejemplos, «Cotizar este producto» queda en la primera pantalla. Con un nombre de más de 50 caracteres, en computadora, la ruta de navegación de la ficha se queda en un renglón y corta el nombre con «…»; el título lo da entero justo debajo. Las pantallas más chicas no son objetivo; lo que queda fuera está en la sección 10 y se vuelve a medir con los productos reales (paso 3).
- **Acciones de las tarjetas.** «Ver ficha» y «Cotizar» nunca parten su texto; cuando no caben juntas, «Cotizar» baja a una segunda fila dentro de la tarjeta. Con la letra agrandada su texto empieza donde el de «Ver ficha»; con el espaciado de texto a tamaño normal, 4 px más a la izquierda, y se acepta (sección 10).
- **Letra agrandada.** Con la letra del navegador agrandada (su ajuste de tamaño de letra, que no es el zoom), a 125, 150 y 200 %, cada texto queda dentro de su botón, enlace o campo y ninguna página se desplaza a los lados, desde 320 px de ancho (a 200 %, desde 360 px); la última línea del pie queda visible sobre la barra fija del celular, y con la letra normal el sitio se ve exactamente igual que antes. Cómo se logra y las reglas para lo que se agregue: [`diseno.md`](diseno.md#114-texto-espaciado-y-agrandado-wcag-1412); lo que queda fuera, en la sección 10.
- **Números de contacto.** La compilación se detiene si el número que muestran las páginas y el que abren los enlaces no son las mismas cifras ([`datos-y-modos.md`](datos-y-modos.md#91-cómo-cambiar-el-contacto)). La prueba que impide escribir a mano un dato de contacto reconoce también el teléfono escrito con espacios o guiones especiales, como el guion que no parte la línea.
- **Dirección del sitio en `.env`.** La dirección se lee de la orden que compila (las variables del alojamiento), no de un archivo `.env`, y se queda así; `.env.example` lo dice.
- **`noindex` y `robots.txt` al lanzar.** Hoy los comparten las dos versiones. Cómo los conserva la vista previa cuando producción los quita es trabajo del paso 4; las dos salidas posibles están en [`publicacion.md`](publicacion.md#4-lista-de-lanzamiento).
- **Pruebas que fijan los datos de hoy** (diecinueve marcas, ningún producto aprobado, todas las categorías en borrador, los datos de contacto exactos). Fallan cuando los datos cambian, y se acepta: son lo que demuestra que no se publica nada sin aprobar. Están listadas en [`datos-y-modos.md`](datos-y-modos.md#62-pruebas), y el paso 3 las reemplaza a medida que lleguen los productos reales.
- **Protecciones automáticas.** Para qué sirven, qué no cubren y cómo se cambian: [`datos-y-modos.md`](datos-y-modos.md#6-las-protecciones). El escáner lee cada página de dos formas: el aviso de arriba solo cuenta si se muestra, y al lanzar no puede quedar ni oculto. El verificador de marcado revisa además que ninguna regla de estilo esconda el aviso. Las pruebas de las fuentes impiden que una página lea directamente un archivo de datos o lleve escrito a mano un dato de contacto. Ninguna regla busca en producción los nombres de las categorías en borrador, porque son palabras comunes. La comprobación de los botones que no hacen nada se escribe en el paso 2, con los primeros botones que tengan un script propio.
- **Archivos que producción publica sin usarlos todavía:** la hoja de estilo de la ficha y tres scripts (la búsqueda del catálogo, su módulo de búsqueda y el que agrega el enlace a los borradores). Se usan en cuanto se publique el primer producto ([`datos-y-modos.md`](datos-y-modos.md#67-diferencia-aceptada-en-producción)).
- **Textos repetidos.** Algunos textos del sitio están escritos igual en varios archivos; [`datos-y-modos.md`](datos-y-modos.md#4-borradores-de-whatsapp-y-correo) dice dónde está cada uno, para que una redacción aprobada se cambie en todos.
- **Precios en el escáner.** La marca «3M» después de «precio de» es un nombre, no un precio, mientras no le siga una cifra en la misma frase: «Precio de 3M: a cotizar» pasa y «Precio de 3M 350» no. Una cifra seguida de «con IVA» solo es un dato (una talla, un modelo, una norma) si se escribe en una de las formas de una lista cerrada; cualquier otra forma cuenta como precio y se redacta de otra manera. Se acepta que «Tallas 9 a 350 con IVA» y «Talla 9 y 350 con IVA» pasen, porque la regla no las distingue de una lista de tallas ([`datos-y-modos.md`](datos-y-modos.md#63-escáner-de-reglas)).
- **Promesas de respuesta.** El escáner rechaza también las promesas en la voz con la que habla el sitio, la de la persona de ventas («Te cotizo hoy mismo», «Te respondo el mismo día»), y la respuesta o la cotización anunciadas con un plazo («Respuesta inmediata», «Cotización en 24 horas»). Las invitaciones a escribir («Solicita tu cotización hoy mismo») y la respuesta de un producto («Detector de gas con respuesta inmediata») pasan. Lo que la regla no detecta está escrito junto a ella: todo texto lo aprueba el contacto comercial, y la regla atrapa los errores directos, no cualquier redacción.
- **Límites de las protecciones que se quedan así:** `module.require` en el código, un archivo Markdown o HTML en `src/components/`, el aviso escrito dentro del documento de un `<object>` o de un `<embed>`, y la lentitud de la regla de precios con una línea artificial de miles de cifras pegadas ([`datos-y-modos.md`](datos-y-modos.md#6-las-protecciones)).
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
- Accesibilidad: teclado, foco visible, objetivos táctiles, texto espaciado, letra agrandada, colores forzados y contraste documentado ([`diseno.md`](diseno.md#11-accesibilidad)).

## 4. Verificado y cómo

### 4.1 Comandos

Ejecutados el 19 de noviembre de 2026 sobre el código del commit `e756c30` (el último que cambió el código; estos documentos no lo cambian), con Node.js 24.22.3 y npm 11.19.1. Estas son las únicas cifras del proyecto que cambian con el tiempo; cada una va con el comando que la da.

| Comando | Resultado |
| --- | --- |
| `npm run validate:catalog` | «Registro: 19 entidades / 35 referencias.» «Catálogo: 0 productos / 0 aprobados / 0 retirados con página informativa.» «Marcas públicas: 19 / 14 con enlace al sitio del fabricante.» «Ejemplos de vista previa: 11 (1 retirado)». Validación correcta. |
| `npm run check` | «Result (97 files): 0 errors, 0 warnings, 0 hints». |
| `npm test` | «tests 355, pass 355, fail 0». |
| `npm run verify` | Termina sin error. Escáner: producción 27 páginas HTML (44 archivos), 0 FAIL y 0 WARN con `--strict`; vista previa 48 páginas HTML (65 archivos), 0 FAIL y 0 WARN. Enlaces: 1144 referencias internas en producción y 3521 en la vista previa, 0 con problemas; no se consultan 149 enlaces externos y 62 de correo, teléfono o datos en producción, ni 323 y 115 en la vista previa (se prueban a mano antes de publicar). Marcado: 19 comprobaciones (U-03, U-05, U-07, U-04, U-11, F-3, F-9a, F-9b, R-STATE-04a a R-STATE-04d, V-03, V-06, A-02a a A-02c, A-06 e I-04) sobre 4 hojas de estilo, 0 problemas en las dos. |
| `node scripts/scan-dist.mjs dist --launch` | 55 FAIL de R-PUB-03, como se espera antes del lanzamiento: el aviso de sitio en preparación (27 páginas: «sigue en la versión de lanzamiento (oculto o no): debe quitarse»), `noindex` (27 páginas) y `robots.txt`. |

Las 27 páginas de producción son: portada, 404, catálogo, marcas, las 19 páginas de marca, cotizar, solicitud especial, contacto y privacidad. La vista previa agrega las 10 categorías y las 11 páginas de producto (10 ejemplos y el retirado).

### 4.2 Revisión en navegador

- Hubo cuatro revisiones independientes, cada una seguida de correcciones que se verificaron por separado:
  1. La base: plantilla, encabezado, pie, componentes compartidos y protecciones de datos.
  2. Las páginas.
  3. Una revisión final de todo el sitio en tres frentes (requisitos y contacto; aspecto; accesibilidad y robustez). No encontró defectos que bloquearan. Confirmó dieciséis puntos (cinco de requisitos, siete de aspecto y cuatro de accesibilidad), y la verificación del aspecto encontró uno más; todos se corrigieron y se verificaron otra vez.
  4. Una revisión del código y de los documentos, y de las protecciones automáticas y sus pruebas. No encontró defectos que bloquearan. Confirmó trece puntos: dos importantes, que eran huecos de las protecciones (una página podía leer directamente un archivo de datos, y las promesas de respuesta escritas de forma sencilla pasaban el escáner), y once menores. Todos se corrigieron y se verificaron otra vez.
- Después vinieron dos trabajos más: la ronda de cierre de las protecciones (la regla de precios y las promesas de respuesta, la prueba de los datos de contacto), verificada en dos rondas sin nada pendiente, y la corrección de la letra agrandada, que ninguna de las cuatro revisiones había probado. Una verificación independiente de la letra agrandada seguía en curso cuando se escribió esto.
- Las revisiones en navegador cubrieron cada tipo de página en las dos compilaciones, de 320 a 1920 px de ancho, con teclado, sin JavaScript, con el espaciado de texto de WCAG 1.4.12, con la letra agrandada a 125 %, 150 % y 200 % (y a los tamaños intermedios 110, 120, 133 y 170 %), en colores forzados y con textos de búsqueda maliciosos. En la revisión final, hecha antes de sus correcciones, axe no encontró infracciones en 274 revisiones (cada tipo de página, ambos modos, 1440, 768 y 390 px, con cada panel abierto), y ninguna página se desplazaba a los lados.
- Con la letra normal, el código de la letra agrandada se comparó píxel por píxel con el código anterior: todas las páginas de las dos compilaciones (más el catálogo con una búsqueda que encuentra y otra que no, y la solicitud especial con una búsqueda) a 22 anchos de 320 a 1920 px, y el encabezado con su menú y su panel de búsqueda abiertos en una página de cada tipo. Todas las capturas salieron iguales.
- Sobre el código de la sección 4.1, un barrido de desbordamiento revisó las páginas de las dos compilaciones a 22 anchos, sin y con el espaciado de texto: 1944 estados en las 27 páginas de producción y 4800 en las 48 de la vista previa. Ninguna se desplaza a los lados, ningún elemento sobresale sin desplazar y ningún campo recorta su texto de ayuda. Los barridos de la letra agrandada sobre ese mismo código seguían en curso cuando se escribió esto.
- La contención de diseño que aplican otros motores a los contenedores se emuló en Chromium; el resultado está en [`diseno.md`](diseno.md#12-navegadores-compatibles).
- Las revisiones se hicieron con Chromium y con scripts que no forman parte del repositorio (el repositorio no tiene dependencias de navegador).
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
| 6 | Catálogo con tarjetas iguales, entrada por categoría y marca, búsqueda, ningún control inerte | Cumple | Búsqueda probada (conteo, sin resultados, limpiar, regreso con `?q`); producción no tiene búsqueda porque no hay productos. El verificador de enlaces revisa que ningún enlace esté vacío, sea «#» o use `javascript:`, y el de marcado, los botones de la cabecera; un botón que no hace nada solo lo encuentra la revisión en el navegador. |
| 7 | Página de categoría | Cumple hasta donde los datos lo permiten | «Marcas en esta categoría» no aparece porque los ejemplos no tienen marca real. |
| 8 | Marcas como texto, ningún proveedor como marca, sin afirmar disponibilidad | Cumple | Las 19 páginas; «Sitio del fabricante» abre en otra pestaña. |
| 9 | Ficha con sus zonas, texto de condiciones y «Cotizar este producto» con marca, código y enlace | Cumple | El enlace se agrega al cargar la página sin dirección del sitio, o va escrito con ella. |
| 10 | Estados: sin resultados, dato no confirmado, documento no disponible, producto retirado, lista vacía | Cumple | Ver [`diseno.md`](diseno.md#8-estados). |
| 11 | Contacto sin dirección, mapa ni «Visítanos» | Cumple | El escáner no encuentra ninguno. |
| 12 | Identidad: blanco, tinta, azul, logotipo sin modificar, sin paleta anterior ni tema oscuro | Cumple | El escáner no encuentra la paleta anterior ni tema oscuro. |
| 13 | Cada par de texto y fondo listado con su contraste | Cumple | Tabla en [`diseno.md`](diseno.md#116-contraste), con la del anillo de foco; incluye la copia del texto de ayuda del buscador cuando pasa a dos líneas (par 8). |
| 14 | Teclado y enlace «Saltar al contenido» | Cumple | Recorrido con Tab y Mayús+Tab en todos los anchos; Escape cierra cada panel. |
| 15 | Sin desbordamiento horizontal a 1440, 1280, 768, 390 y 360 px | Cumple | Ambas compilaciones, también con la letra agrandada a 125 %, 150 % y 200 % (por debajo de 360 px al 200 %, ver la sección 10). |
| 16 | Capturas de cada página a los cinco anchos | Cumple hasta donde el repositorio lo permite | Entregadas fuera del repositorio. |
| 17 | Ejemplos solo en la vista previa, marcados, con aviso; una prueba lo demuestra | Cumple | `tests/build-output.test.mjs` y el escáner. |
| 18 | El escáner sin fallos en ambas compilaciones | Cumple | Sección 4.1. |
| 19 | Contactos solo de `business.json` | Cumple | Cada enlace de WhatsApp va a `https://wa.me/5212214002219` y cada correo a `ventas.puebla@sercomactive.com` (R-RULE-24). La compilación se detiene si el número visible y el de los enlaces no son las mismas cifras, y una prueba de las fuentes falla si un dato de contacto está escrito a mano en una página, un componente, una plantilla o un módulo. |
| 20 | Ningún mensaje de éxito después de un clic de contacto | Cumple | Clics reales a 1440 y 390 px. |
| 21 | `noindex`, `robots.txt` bloqueante y aviso de desarrollo; sin sitemap | Cumple | El aviso «Sitio en preparación» se agregó después de la revisión final; el escáner exige que cada página de producción lo muestre, sin contar uno oculto (R-RULE-12), y el verificador de marcado, que ninguna regla de estilo lo esconda fuera de la impresión (I-04). Con `--launch` el escáner lo prohíbe, oculto o no (R-PUB-03). |
| 22 | Las páginas leen solo la proyección pública | Cumple | Nada de aprobación, fuente, uso de imagen ni del registro en la salida (R-RULE-13). Una prueba de las fuentes falla si un archivo de `src/` que no es de la capa de datos carga un archivo de `src/data/` o de `research/`. |
| 23 | `check`, `test` y `build` pasan con Node 24; sin dependencias de servidor | Cumple | Sección 4.1; la única dependencia es Astro. |
| 24 | `ESTADO.md` con decisiones, vista previa, evidencia y estados; documentos corregidos; «cómo cambiar el contacto» | Cumple | Este documento y la actualización de todos los documentos del 19 de noviembre, puesta al día después de las últimas correcciones; [`datos-y-modos.md`](datos-y-modos.md#91-cómo-cambiar-el-contacto). |
| 25 | Nada publicado, comprado ni contratado; `sercomactive.com` intacto | Cumple | El flujo de GitHub corre en solicitudes de cambios y envíos, sin tareas programadas; nada en el repositorio despliega. |

## 5. Solo propuesto

- **Alojamiento** (18 de noviembre de 2026; el propietario no ha respondido): no publicar ni pagar nada mientras se construye; al lanzar, Cloudflare Pages en su plan gratuito, en una cuenta del propietario o de Sercom. El plan gratuito de Vercel no se usa porque sus términos lo limitan a uso personal o no comercial; Vercel Pro (20 dólares al mes por equipo, precio base publicado) queda posible más adelante. Detalle en [`arquitectura.md`](arquitectura.md).
- **QR:** apuntará a un subdominio de un dominio que controle Sercom, para que la dirección impresa sobreviva a un cambio de alojamiento.
- **Navegadores compatibles:** Safari e iOS 16, Chrome y Edge 117, Firefox 110 o posteriores ([`diseno.md`](diseno.md#12-navegadores-compatibles)); se confirma antes de publicar.
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
- **Paso 2 (buscador, filtros y «Mi cotización»):** filtros combinables, «Agregar a mi cotización» en la ficha, la lista que se arma en el sitio con cantidades y variantes, copiar el resumen y manejar mensajes largos; la búsqueda guiada de la solicitud especial. Con ese paso también: la comprobación automática de los botones que no hacen nada, escrita junto con los primeros botones que tengan un script propio; la dirección de la búsqueda del catálogo, que hoy el script reescribe completa a partir de `q` y que cambia cuando los filtros compartan la dirección ([`diseno.md`](diseno.md#10-scripts-del-navegador)), y decidir si las revisiones en navegador (desbordamiento, letra agrandada y axe) entran al repositorio como herramienta opcional.
- **Paso 3 (catálogo piloto):** cargar de 30 a 50 productos reales aprobados; ampliar el esquema de imagen (archivo local o dirección, con ancho y alto) con sus pruebas; decidir cómo se revisa el texto de los productos frente a las reglas del escáner; revisar la opción `--strict` cuando haya normas con fuente; retirar los ejemplos cuando haya productos aprobados; actualizar las pruebas que hoy dan por hecho que no hay productos reales y que las categorías están en borrador ([`datos-y-modos.md`](datos-y-modos.md#62-pruebas)); medir la ficha de producto con los nombres y resúmenes reales del catálogo piloto y decidir entonces si el resumen necesita un largo máximo (sección 10); decidir si un producto puede dar su tiempo de respuesta en minutos («Tiempo de respuesta: 2 minutos», que hoy el escáner rechaza como una promesa).
- **Paso 4 (publicación y QR):** elegir y crear el alojamiento, definir la dirección, la lista de lanzamiento de [`publicacion.md`](publicacion.md) (decidir qué pasa con el `noindex` y el `robots.txt` de la vista previa, que son los mismos de producción; retirar de producción `noindex`, `robots.txt` y el aviso; agregar `SITE_URL`, sitemap y metadatos para compartir; escáner con `--launch`), comprobar en el alojamiento la página 404, las direcciones sin diagonal final y cómo se vuelve a una versión anterior, confirmar los navegadores compatibles, generar y probar el QR.
- **Mejoras anotadas:** el menú abierto en una pantalla muy baja (sección 10). El alto máximo del menú abierto que da la hoja de estilo, cuando el script del encabezado todavía no ha corrido, usa el alto de diseño del encabezado y no descuenta la barra fija; el script escribe el valor real en cuanto corre. Con la letra al 200 %, de 700 a 768 px de ancho, el filete de 1 px que separa los datos de la franja superior queda al principio de su segundo renglón (detalle visual).

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
- En producción se publican la hoja de estilo de la página de producto y tres scripts (la búsqueda del catálogo, su módulo de búsqueda y el que agrega el enlace a los borradores) aunque hoy ninguna página los use; se usan con el primer producto ([`datos-y-modos.md`](datos-y-modos.md#67-diferencia-aceptada-en-producción)).
- Nombres largos de producto: el objetivo (sección 2) se cumple a 1440 × 900 con 11.6 px de margen medidos. Mientras se muestre el aviso de sitio en preparación, un nombre de esa longitud escrito todo en mayúsculas (27 px por debajo con 86 caracteres) o un resumen más largo que los de los ejemplos (15 px por debajo con 157 caracteres) pueden dejar «Cotizar este producto» debajo de la primera pantalla; sin el aviso, que se quita al lanzar, caben. En pantallas más chicas, como 1280 × 800, la acción queda debajo de la primera pantalla con nombres largos. Se mide de nuevo con los productos reales (paso 3).
- En las tarjetas, con el espaciado de texto de WCAG 1.4.12 y la letra de tamaño normal, las acciones solo pasan a dos filas alrededor de 1100 px de ancho, y ahí el texto de «Cotizar» empieza 4 px a la izquierda del de «Ver ficha». Se acepta: el CSS no puede saber que la fila se partió. Con la letra agrandada empiezan alineados (medido: 0 px de 700 a 1920 px); a cambio, ahí «Cotizar» lleva el mismo relleno también cuando las dos caben en una fila, así que pasan a dos filas un poco antes (a 150 %, las tarjetas de la portada y de la ficha también a 1440 y 1920 px).
- Con la letra al 200 % en pantallas de menos de 360 px (a 320 px equivale a una pantalla de 160 px con la letra normal), la página puede desplazarse unos píxeles a los lados: medido, hasta 350 px el título de la 404 sobresale hasta 33 px; hasta 330 px, los renglones del titular de la portada sobresalen de 9 a 14 px y «WhatsApp» de la barra fija queda hasta 3 px fuera de la pantalla; hasta 340 px, la etiqueta «Ejemplo» de la vista previa y un icono sobresalen hasta 12 y 5 px, y hasta 325 px el teléfono de las filas de datos sale 7 px de su enlace. Desde 355 px no se encontró ninguno. No es objetivo.
- La letra agrandada a 150 o 200 % junto con el espaciado de texto de WCAG 1.4.12 no es objetivo: en esa combinación todavía se salen de su lugar la columna de contacto del pie (teléfono, correo y horario, hasta 77 px), los títulos largos, el título de la 404, algunas celdas de marca y algunos enlaces.
- Con la letra agrandada, en la ficha a 700 px y 200 %, los nombres de variante se parten con guion («Unita-lla», «Extra-grande»): se permite.
- Las reglas de la letra agrandada usan umbrales medidos con la fuente Archivo y los textos de hoy (por ejemplo, el de las filas de datos depende de «WhatsApp», hoy la clave más larga): si cambian la fuente o esas palabras, se miden de nuevo ([`diseno.md`](diseno.md#114-texto-espaciado-y-agrandado-wcag-1412)).
- La regla de precios del escáner tarda varios segundos con una línea artificial de miles de cifras pegadas (unos 5 segundos con 16 000); las páginas reales están muy lejos de eso.
- Las protecciones automáticas detectan errores escritos de forma directa, no ocultamientos deliberados; sus límites por regla están en [`datos-y-modos.md`](datos-y-modos.md#63-escáner-de-reglas).

## 11. Historia

- **18 de noviembre de 2026.** Se incorporó al repositorio la base Astro y TypeScript con el plan maestro v1.2 y el registro de investigación (19 entidades, 35 referencias), sin modificar el PDF original. El propietario tomó las seis decisiones de la sección 1. Se agregaron los nombres cortos de las categorías, la lista pública de marcas, los ejemplos de vista previa, la capa de datos públicos con los dos modos, los enlaces de contacto, el escáner de reglas y el verificador de enlaces.
- **19 de noviembre de 2026.** Se construyó la base visual «Lámina técnica» (fuente propia, logotipo SVG, iconos, plantilla, encabezado, pie, barra fija y componentes compartidos) y se retiraron los estilos azul marino y celeste. Se construyeron todas las páginas, la búsqueda del catálogo, la página de producto retirado y el verificador de marcado. Se hicieron las tres primeras revisiones de la sección 4.2 con sus correcciones, se agregó el aviso de sitio en preparación y se actualizaron todos los documentos. Después, la cuarta revisión (código, documentos y protecciones automáticas) y sus correcciones: el escáner lee cada página de dos formas, el verificador de marcado revisa que nada esconda el aviso, las pruebas de las fuentes vigilan la carga de datos y los datos de contacto, y la compilación compara los dos números de WhatsApp. Siguieron una ronda de cierre de las protecciones (la regla de precios y las promesas de respuesta en la voz del sitio) y la corrección de la letra agrandada, que ninguna revisión había probado. Al final se pusieron al día los documentos con el código de la sección 4.1.
