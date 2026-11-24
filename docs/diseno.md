# Diseño del sitio: guía de «Lámina técnica»

Guía del sistema visual «Lámina técnica» tal como está en el código. El 18 de noviembre de 2026 el propietario eligió esta propuesta (la A de tres portadas dibujadas) y todo el sitio la sigue. La identidad sale del logotipo: fondos blancos, tinta `#19171A` y azul Sercom `#0067B0`; no hay estilo oscuro ni la paleta azul marino y celeste del plan maestro.

Sirve a quien agrega o cambia una página: qué existe, cómo se arma una página, qué reglas no se rompen y qué cambia entre producción y vista previa. Para los datos, los modos y los borradores de contacto, ver [`datos-y-modos.md`](datos-y-modos.md).

## 1. Qué hay y dónde

| Archivo | Contenido |
| --- | --- |
| `src/layouts/BaseLayout.astro` | Plantilla de todas las páginas: `<head>`, «Saltar al contenido», el aviso de arriba, la lámina con encabezado, `<main id="contenido">` y pie, y la barra fija del celular. Importa la hoja global una sola vez. |
| `src/components/` | La plantilla (`SiteNotice`, `SiteHeader`, `SiteFooter`, `Dock`) y los componentes compartidos (sección 6). |
| `src/pages/` | Las páginas (sección 7). |
| `src/styles/global.css` | Única entrada de la hoja global. Importa, en este orden: `fonts.css` (kit tipográfico), `tokens.css`, `base.css`, `layout.css`, `components.css`, `sections.css` (secciones de la portada) y `responsive.css`. |
| `src/styles/pages/` | Hojas de página: `atencion.css` (cotizar, solicitud especial, contacto, privacidad y la 404), `catalogo.css` (catálogo, categoría, marca) y `producto.css` (ficha y producto retirado). |
| `src/assets/fonts/` | Archivo variable de Archivo (latin y latin-ext) y su licencia OFL. |
| `src/assets/brand/logo.svg` | Logotipo principal. |
| `src/assets/icons/icons.json` | Kit de iconos. `src/lib/icons.ts` da los nombres tipados (`IconName`) y `categoryIcon()`. |
| `src/lib/grid-fill.mjs`, `src/lib/product-title.mjs` | Cálculo de las celdas de relleno y regla del nombre largo de producto. |
| `src/lib/catalog-filters.mjs`, `quote-list.mjs`, `quote-store.mjs`, `message-page.mjs` | Lo que usan los scripts del paso 2: los filtros del catálogo, las reglas de la lista de cotización, su almacén en el navegador y lo que comparten las dos páginas que arman un mensaje (secciones 10 y 16). |
| `public/` | `favicon.svg`, `favicon.ico`, `apple-touch-icon.png`, `robots.txt`. |
| `docs/licencias-de-terceros.md` | Avisos de la fuente y de los iconos. |

Los componentes compartidos, la plantilla y los archivos de `src/styles/` fuera de `pages/` son la base común: una página no los redefine. Si falta algo, se cambia la base (con sus pruebas) en lugar de duplicar reglas en una página.

## 2. Variables (tokens)

Todas están en `:root` (`tokens.css` y, las tipográficas, `fonts.css`). Se usan siempre; no se escriben colores ni tamaños sueltos.

**Color.** Paleta cerrada: tinta, azul Sercom, blanco, sus tintes y sombras y grises neutros.

| Variable | Valor | Uso |
| --- | --- | --- |
| `--ink` | `#19171A` | texto, avisos de arriba, etiqueta «Ejemplo», anillo de foco |
| `--blue` | `#0067B0` | filetes, iconos, enlaces, bloques sólidos |
| `--white` | `#FFFFFF` | todas las superficies |
| `--blue-800` / `--blue-700` | `#00406E` / `#00548F` | presionado / al pasar sobre azul sólido |
| `--blue-300` | `#99C2DF` | flechas tenues de las celdas de marca, filete dentro de la banda azul, filete de un botón apagado |
| `--blue-200` (`--rule-soft`) | `#C8DFEE` | filete suave dentro de una celda |
| `--blue-100` / `--blue-050` (`--surface-tint`) | `#E6F0F7` / `#F3F8FC` | rayado, tinte al pasar, celda teñida |
| `--grey-700` / `--grey-600` | `#46464C` / `#5A5B62` | texto secundario / terciario y textos de ayuda de los campos |
| `--grey-300` | `#C9CACE` | diagonales de la ruta de navegación (decorativas) |
| `--rule`, `--surface`, `--focus` | azul, blanco, tinta | funciones: filete, celda, foco |

No hay tema oscuro ni colores de estado (error, aviso); si una página necesitara uno, se agrega primero a la base y a la tabla de contraste (sección 11.6).

**Colores prohibidos.** El azul marino `#0E2A3D` (rgb 14, 42, 61) y el celeste `#00A6E5` (rgb 0, 166, 229) de la paleta anterior del plan maestro. El escáner (R-RULE-29) rechaza cualquier color a 4 o menos por canal de cualquiera de los dos, también con transparencia, y cualquier tema oscuro (`prefers-color-scheme`, `color-scheme`, `light-dark()`).

**Tipografía.** Una sola familia, Archivo variable, servida desde el propio sitio (sin peticiones a terceros). Mientras el archivo carga, o si no carga, se usan las fuentes del sistema ajustadas a las medidas de Archivo para que el texto no salte: `fonts.css` define con `@font-face` las caras «Archivo Fallback», «Archivo Display Fallback» y «Archivo Label Fallback» (sobre Arial, Liberation Sans o Arimo) y sus variantes «… Roboto» (sobre Roboto, primero en las pilas por Android). Las pilas `--font-heading`, `--font-body` y `--font-label` las ordenan; no se cambian sin medir otra vez sus ajustes.

| Función | Variable o clase | Ajustes |
| --- | --- | --- |
| H1 de la portada | `.t-h1` (`--h1`) | 80 px desde 1430, 72 a 1280, 56 como máximo en tableta, 32–33 en celular; peso 700, ancho 96 % |
| H1 de páginas interiores | `.t-title` (`--type-title-size`) | 44 px en computadora, 28 en celular; peso 700, ancho 96 % |
| H2 de sección | `.t-h2` (`--h2`) | 44 px desde 1130, 36 a 768, tamaño del kit en celular; peso 700, ancho 96 % |
| H3 | `.t-h3` (`--h3`) | 20 px, peso 700 (`--h3-lg`, 28 px, en tarjetas de entrada) |
| Entrada | `.t-lead` (`--lead`) | 17 a 19 px |
| Texto | `--body` | 16 px, peso 400 |
| Pequeño | `.t-small` (`--small`) | 14 px |
| Etiqueta | `.label` (`--label`, `--label-sm`) | 12.5 / 11.5 px, mayúsculas, ancho 110 % |
| Códigos | `.t-code` | peso 600, cifras tabulares, sin corte de línea (los componentes que muestran códigos largos permiten cortarlos) |
| Antetítulo | `.eyebrow.label` | etiqueta azul con el cuadro sólido de 10 px |

**Excepción deliberada: el número de «Cotizar mi lista».** El número de renglones guardados junto a «Cotizar mi lista» (`.quote-count`, sección 16) no usa un tamaño de la escala: mide `calc(0.171875rem + 8.25px)`, 11 px con la letra normal, y en la fila del menú de tableta y celular `calc(0.1875rem + 9px)`, 12 px; se coloca con desplazamientos ópticos de 3, 5 y 6 px. Con la letra agrandada crece a un cuarto del ritmo del texto (12.4 px al 150 %, 13.75 px al 200 %), porque al mismo ritmo tapaba el texto de su enlace, que también crece. Va fuera del flujo: aparecer o pasar de «3» a «120» no mueve nada.

**Espacios** (base de 4 px): `--s-1` 4 · `--s-2` 8 · `--s-3` 12 · `--s-4` 16 · `--s-5` 20 · `--s-6` 24 · `--s-7` 32 · `--s-8` 40 · `--s-9` 48 · `--s-10` 56 · `--s-11` 64 · `--s-12` 80.

**Composición por ancho**

| Variable | 1360 o más | 1100 a 1359 | 700 a 1099 | hasta 699 |
| --- | --- | --- | --- | --- |
| `--margin` (blanco fuera de la lámina) | 72 | 48 | 24 | 0 |
| `--pad` (relleno lateral de una celda) | 32 | 24 | 24 | 20 |
| `--section-top` (aire sobre el título de sección) | 80 | 72 | 56 | 48 |
| `--masthead-h` (alto de diseño del encabezado) | 84 | 84 | 72 | 64 |
| `--utility-h` (franja superior) | 36 | 36 | 36 | 32 |

La lámina mide como máximo `--sheet-max` (1296 px). `--edge-left` y `--edge-right` son el margen o el área segura del dispositivo, el mayor de los dos.

**Puntos de corte:** **1359** (computadora pequeña), **1099** (la navegación se pliega: tableta), **699** (celular), **379** (celular angosto). Las consultas usan estos valores: `max-width` para lo que cambia al bajar de un ancho y `min-width` con el valor siguiente (700, 1100, 1360) para lo que solo vale desde un ancho, solo o en un rango (`(min-width: 1100px) and (max-width: 1359px)`). El encabezado usa además dos rangos propios (1100–1199 y 1360–1379 px, sección 4.3). Las reglas de la letra agrandada comparan además el ancho de la lámina con el texto mediante consultas de contenedor (sección 11.4).

**Forma y movimiento:** `--radius: 0` (esquinas rectas siempre), `--line: 1px`, `--ease: 150ms ease` (solo color y el desplazamiento de 4 px de una flecha). Sombra (`--shadow-overlay`) solo en paneles que flotan sobre la página.

## 3. La lámina, la retícula y las celdas de relleno

La página entera es una lámina: `.sheet` está pintada de azul y cada bloque es una celda blanca. **Los huecos de 1 px entre celdas son los filetes.** Ningún elemento dibuja su propio borde, así que las líneas nunca se duplican y caen siempre en las mismas posiciones.

**Única excepción: controles que dibujan su propio filete.** Un control que va dentro de una celda blanca más ancha no tiene un hueco de la lámina que lo rodee, así que dibuja su propio filete azul de 1 px. Son exactamente estos: `.field--framed` (un campo dentro de una celda, junto a otro contenido; dos seguidos comparten el filete), `.stepper` (las tres casillas del selector de cantidad), `.check-row__box` (el cuadro de una casilla de los filtros), `.btn--outline` (el botón blanco con filete azul, la acción secundaria de un bloque, como «Limpiar filtros») y `.btn[aria-disabled="true"]` (un botón apagado, con filete azul claro, `--blue-300`). Nada más puede dibujar su propio borde: un componente nuevo que lo necesite se agrega primero a esta lista y al comentario de `components.css` (4.18).

- `<main>` y `.section` son columnas de filas separadas por 1 px.
- `.grid12` es una fila de doce pistas separadas por 1 px. Sus hijos toman columnas con `.span-1` … `.span-12`.
- `.cell` pinta una celda de blanco; `.cell--pad` le da el relleno estándar (`--s-9` arriba y abajo, `--pad` a los lados).
- En tableta y celular, `.span-md-N` (2, 3, 4, 6, 8, 12; hasta 1099 px) y `.span-sm-N` (3, 4, 6, 12; hasta 699 px) cambian el ancho de una celda. Una celda con `span-8 span-md-12` ocupa 8 columnas en computadora y toda la fila en tableta y celular.

Reglas de la lámina:

- **Cada fila llena las doce columnas.** Lo que ninguna celda ocupa se pinta de blanco con una celda de relleno; si no, se ve el azul del fondo.
- Dentro de una celda, una separación se dibuja con `--rule-soft` (1 px), nunca con el azul fuerte.
- Los enlaces que ocupan toda una celda llevan `cell-link`: su anillo de foco se dibuja por dentro.
- Una sección empieza con `SectionHead` (el título apoyado en el filete, con `--section-top` de aire arriba).

**Celdas de relleno.** `GridFill` imprime celdas `.grid-fill` vacías, con `aria-hidden="true"` y fuera del orden del teclado, como hijos directos de su retícula y después de las celdas reales. Cada una trae su ancho en computadora (`lg`), tableta (`md`) y celular (`sm`); con 0 no se muestra en ese ancho. Los anchos los calcula `gridFill(count, layouts)` de `src/lib/grid-fill.mjs` (o `fillSpans(count, span, { columns, tail })` para un solo ancho; `tail` es una celda final más ancha, como la de solicitud especial de la placa de categorías). Usan relleno `ProductGrid`, `CategoryPlate`, `CategoryRegister`, `Steps` y `BrandCells`; `CatalogGrid` y la ficha de producto tienen su propio relleno (`.catalog-grid__fill`, `.producto__more-fill`, `.producto__chip-fill`). El verificador de marcado comprueba que todas estén vacías, ocultas y sin foco (U-04).

Una fila de dos celdas, 8 + 4 columnas, que en tableta se apilan:

```astro
<section class="section" aria-labelledby="envio-title">
  <SectionHead title="Qué enviar" id="envio-title" />
  <div class="grid12">
    <div class="cell cell--pad span-8 span-md-12">…</div>
    <div class="cell cell--pad span-4 span-md-12">…</div>
  </div>
</section>
```

## 4. La plantilla: aviso, encabezado, barra fija, ruta y pie

### 4.1 BaseLayout

Props: `title?` (nombre de la página), `description?`, `canonical?` (`false` en la 404). El título es «{title} · Sercom Active»; la portada, sin `title`, lleva «Sercom Active · Atención en Puebla» (nombre y `titleLabel` de `business.json`). La dirección canónica solo se escribe cuando se compila con `SITE_URL` y la página no la desactiva. Cada página lleva `lang="es-MX"`, `theme-color` blanco, los favicons, `<meta name="robots" content="noindex, nofollow">` (hasta el lanzamiento) y el enlace «Saltar al contenido» hacia `#contenido`. Un script en línea pone la clase `js` en `<html>`: sin JavaScript, los botones que solo abren paneles no se muestran.

### 4.2 El aviso de arriba (SiteNotice)

Una sola banda de tinta con texto blanco, antes de la lámina y con sus mismos márgenes; la primera parte va en negritas. Cada compilación lleva un solo aviso:

- Vista previa (`kind="preview"`): `PREVIEW_NOTICE`, «**Vista previa para revisión.** Los productos que aparecen son ejemplos de diseño, no artículos reales.», con nombre accesible «Aviso de vista previa».
- Producción hasta el lanzamiento (`kind="development"`): `DEVELOPMENT_NOTICE`, «**Sitio en preparación** · Versión inicial para revisión», con nombre accesible «Aviso de sitio en preparación».

Los dos se dibujan igual (`components.css`, 4.1) y no se imprimen en papel. El escáner exige el que corresponde a cada modo (R-RULE-03 y R-RULE-12); cómo se retira el de producción al lanzar está en [`publicacion.md`](publicacion.md).

### 4.3 Encabezado (SiteHeader)

**Franja superior** (se desplaza con la página): la denominación, el horario corto, WhatsApp y correo. En tableta se ocultan WhatsApp y correo; en celular, también el horario. Con la letra agrandada (11.4) la denominación pasa a dos renglones y la franja crece.

**Cabecera fija** (`.masthead`, una `grid12`):

- Computadora (1100 px o más): logotipo (2 columnas), navegación «Catálogo», «Categorías» (panel), «Marcas», «Contacto» (4 columnas con búsqueda; 7 sin ella), campo de búsqueda (3 columnas), WhatsApp y «Cotizar mi lista» (2 columnas, bloque azul). Orden del teclado: logotipo, navegación, búsqueda, WhatsApp, «Cotizar mi lista». De 1100 a 1199 px con búsqueda, los enlaces se aprietan; de 1360 a 1379, la lista pierde relleno.
- Tableta (700 a 1099 px): logotipo, botón «Buscar», WhatsApp, «Cotizar mi lista» y botón «Menú», dibujado al final. La navegación se pliega en un panel con una fila por entrada (incluida «Cotizar mi lista»). **Orden del teclado: Buscar, Menú, WhatsApp, Cotizar**: el botón Menú va en el documento antes de la navegación, porque al abrir el menú el siguiente Tab debe entrar en él, y se dibuja al final con `order: 1`. Ningún orden del documento cumple a la vez eso, el orden de computadora y el orden visual de tableta; es una decisión aceptada.
- Celular (hasta 699 px): logotipo, «Buscar» y «Menú»; WhatsApp y «Cotizar mi lista» viven en la barra fija (4.4).

El campo «Buscar» (y su botón) solo se imprime si hay productos públicos; la entrada «Categorías», si hay categorías públicas (desde el paso 3 producción tiene los dos). Una categoría aprobada sin productos agrega «Categorías», pero no la búsqueda. El botón «Menú» dice «Cerrar» mientras el menú está abierto. Junto a «Cotizar mi lista», en el bloque de la cabecera y en la fila del menú, va el número de renglones guardados (sección 16). En `/catalogo/`, el formulario de búsqueda del encabezado lleva además un campo oculto por cada filtro marcado, para que buscar desde ahí no quite los filtros (sección 10).

**Paneles.** En tableta y celular, el menú y la búsqueda son paneles que abre su botón (`aria-expanded`). Un panel se cierra con Escape (el foco vuelve a su botón), con un clic fuera o cuando el foco sale del panel y de su botón. El menú abierto mide como máximo el espacio hasta la barra fija y se desplaza por dentro; `keepFocusInMenu()` desplaza el panel (nunca la página) para que el elemento con foco se vea entero. El panel «Categorías» de computadora es un `<details>` nativo que se cierra con Escape, con un clic fuera o al salir el foco; lleva seis categorías por fila y, con la letra agrandada, dos por fila con «Ver todo el catálogo» a todo lo ancho, como en tableta, cuando la palabra más larga ya no cabe junto a su icono. Sin JavaScript nada queda escondido detrás de un botón. El panel de búsqueda de tableta y celular mide al menos 64 px de alto: el campo y el botón caben en ellos, y cuando el texto de ayuda pasa a dos líneas (abajo) el panel crece con él, sin depender de `:has()`.

**Ubicación actual.** `aria-current="page"` en el enlace a la propia página y `"true"` en su sección: una página de marca marca «Marcas»; una de categoría, «Categorías» (y su categoría lleva `page` en el panel); una ficha, «Catálogo». En `/cotizar/` la llevan la entrada del menú, el bloque «Cotizar mi lista» y el enlace de la barra fija. La portada marca solo el logotipo (`aria-current="page"`, sin dibujo); la solicitud especial, la privacidad y la 404 no marcan nada en el encabezado ni en la barra fija. Se dibuja con un subrayado azul de 4 px en computadora, una barra azul de 4 px a la izquierda en las filas del menú y del panel, una barra blanca de 4 px dentro del bloque «Cotizar mi lista» y una azul abajo en la barra fija.

**El texto del campo de búsqueda.** El campo se llama «Buscar en el catálogo» (etiqueta oculta y texto de ayuda) y envía a `/catalogo/?q=…`. Con el tamaño de letra normal ese texto cabe en una línea en todos los anchos. Con texto espaciado o agrandado puede no caber: entonces el script del encabezado (si existe `ResizeObserver`) agrega `.is-long` a `.masthead__search-field`, cambia el texto de ayuda por un espacio y muestra en su lugar `.masthead__search-hint`, una copia oculta a los lectores de pantalla que ocupa hasta dos líneas dentro de la celda y se oculta en cuanto el campo tiene texto. En computadora la celda conserva el alto de la fila de la cabecera, y desde 1100 px la copia usa un interlineado de 1.25 para que sus dos líneas quepan en ella; en tableta y celular la copia comparte la casilla del campo y el panel crece con ella. La copia no recibe el clic (`pointer-events: none`): en la revisión en navegador con la letra al 200 %, un clic sobre cualquiera de sus dos líneas puso el foco en el campo, en computadora (1100, 1280 y 1440 px) y en el panel de tableta y celular. Sin JavaScript queda el texto de ayuda nativo. Mientras la copia se ve, axe informa dos resultados «incompletos» (`#q`, «Element has no value», y la copia, «partially overlaps other elements»); los dos son límites de la herramienta, y el contraste de la copia es 6.76:1 (el par 8 de la tabla de 11.6, que redondea hacia abajo).

**Texto que crece.** La franja y la cabecera tienen alto mínimo, no fijo, y la franja, sus grupos y la lista de navegación de computadora pueden pasar a otra línea. El encabezado mide su alto real con `ResizeObserver` y lo escribe en `--utility-shift` y `--masthead-shift` en `<html>` (y el de la barra fija del celular en `--dock-space`, 4.4); la posición fija y `scroll-padding-top` usan esos valores, con las alturas de diseño como respaldo. Sin JavaScript (o antes de la primera medida), en computadora, el respaldo de la franja es `--utility-fit` (`responsive.css` 6.9): la hoja de estilo cuenta sus renglones comparando el ancho de la lámina con lo que miden sus dos grupos en `rem`, así la cabecera fija la esconde entera también con la letra agrandada; con la letra normal vale los 36 px del diseño. Con el espaciado de texto de WCAG 1.4.12 ese cálculo se queda corto y parte de la franja queda a la vista ([`ESTADO.md`](ESTADO.md#10-límites-conocidos)). Debajo de 1100 px, sin JavaScript, la cabecera no es fija. Una hoja de página que coloque algo bajo la cabecera fija debe usar `var(--masthead-shift, var(--masthead-h))`, como la imagen de la ficha en `producto.css`.

**Botones con la letra agrandada** (11.4; con la letra normal no cambian). Buscar y Menú dejan su ancho fijo y crecen con su etiqueta, con 72 px como mínimo en tableta y 64 en el celular, y WhatsApp de tableta hace lo mismo desde 88 px; «Cotizar mi lista» pasa a dos renglones. Cuando la fila ya no tiene lugar para una etiqueta, esa etiqueta queda solo para los lectores de pantalla (sigue siendo el nombre del botón) y el botón muestra su icono: Buscar y Menú en celular y tableta, WhatsApp en computadora.

**Nombres de clase.** La navegación es `.masthead__nav` (`#menu`) con `__nav-list`, `__nav-link`, `__nav-cat` y `__nav-item--quote`; la búsqueda es `.masthead__search` (`#buscador`) con `__search-field`, `__search-input`, `__search-hint` y `__search-btn`. Los bloques genéricos `.nav` y `.search` están retirados: el verificador de marcado (U-07) rechaza cualquier regla que los use. Una página nombra sus bloques con su propio prefijo (por ejemplo `catalog-nav__list`).

### 4.4 Barra fija del celular (Dock)

Solo hasta 699 px: dos enlaces al pie de la pantalla, «Cotizar mi lista» y WhatsApp (borrador general). La página deja al final un espacio del alto de la barra (`padding-bottom` del `body`), para que la última línea del pie quede visible, y `scroll-padding-bottom` deja el elemento con foco por encima de ella. Con la letra agrandada (11.4) cada etiqueta puede pasar a dos renglones y la barra crece: el script del encabezado mide su alto real con `ResizeObserver` y lo escribe en `--dock-space`, que usan esos dos espacios. Sin JavaScript se usa un respaldo que alcanza para etiquetas de dos renglones (`max(57px, 2.25rem + 1px)` más el área segura del dispositivo), nunca menos que los 57 px de la barra con la letra normal. La barra está fuera de la lámina y es su propio contenedor (`container: barra`). «Cotizar mi lista» lleva también aquí el número de renglones guardados, y en «Cotizar mi lista» y en la solicitud especial el enlace de WhatsApp lleva el mensaje de la página en cuanto el visitante lo cambia (sección 16).

### 4.5 Ruta de navegación (Breadcrumbs)

`.crumbs`, con estilo de etiqueta. Cada diagonal es un `span.crumbs__sep` con `aria-hidden` al final del elemento anterior; el último elemento es la página actual (`aria-current="page"`). En celular, con tres elementos o más, la página actual se oculta a la vista pero sigue para los lectores de pantalla. Los enlaces de la ruta miden 44 px de alto en tableta y celular.

### 4.6 Pie (SiteFooter)

Logotipo con «Tu mejor opción», enlaces, columna de categorías (solo si hay categorías públicas), contacto (WhatsApp, correo con `EmailAddress` y horario), las notas «Disponibilidad y tiempo de entrega sujetos a confirmación al cotizar.» y «Las marcas mencionadas pertenecen a sus respectivos titulares.», el año y «Privacidad». El enlace a la página actual lleva `aria-current="page"` y un cuadro azul de 10 px (`footer__mark`). Con la letra agrandada (11.4), cuando la columna de contacto ya no tiene lugar para la parte más ancha del correo, las columnas pasan a filas: en computadora, cuatro celdas de 6 columnas; en tableta, enlaces y categorías lado a lado y el contacto a todo lo ancho. Sin columna de categorías (producción hoy) las celdas tienen lugar de sobra. En el celular los enlaces pasan de dos columnas a una cuando una palabra no cabe en la mitad.

## 5. Cómo agregar una página

1. Crear el archivo en `src/pages/` (por ejemplo `src/pages/ayuda/index.astro`). Las rutas terminan en diagonal; se usan las de `routes` (`src/lib/routes.mjs`, también exportadas por `site-data.mjs`) en lugar de escribirlas.
2. Envolverla en `BaseLayout` con `title` y, si se quiere, `description`.
3. El primer bloque es `PageHeader` (el único H1) o, si la página es una petición, una `Band` con `headingLevel={1}`. Después, secciones con `SectionHead`.
4. Datos: solo de `src/lib/site-data.mjs` (categorías, marcas, productos, rutas, `isPreview`) y de `src/lib/contact.mjs` (`contactDetails`, `contactLinks`). Nunca se escriben en la página números, correos, nombres de marcas, de categorías ni de productos.
5. Estilos propios: sección 9.
6. Contemplar la lista vacía de todo lo que dependa del catálogo (sección 8).
7. Ejecutar `npm run check` y los archivos de prueba de lo que cambió, y revisar la página en el navegador (sección 15). La batería completa (`npm test`) y `npm run verify` corren en GitHub, en el flujo «Verificar catálogo y sitio» (comprobación «verify») de la solicitud de cambios ([`AGENTS.md`](../AGENTS.md)).

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import ActionRow from '../../components/ActionRow.astro';
import PageHeader from '../../components/PageHeader.astro';
import { contactLinks } from '../../lib/contact.mjs';
import { routes } from '../../lib/site-data.mjs';
const general = contactLinks.general();
---
<BaseLayout title="Ayuda">
  <PageHeader title="Ayuda" breadcrumbs={[{ label: 'Inicio', href: routes.home }, { label: 'Ayuda' }]} lead="…">
    <ActionRow href={general.whatsapp} primary icon="whatsapp">Escribir por WhatsApp</ActionRow>
  </PageHeader>
  …
</BaseLayout>
```

Las rutas con parámetro usan `paths.categoryIds`, `paths.brandIds` y `paths.productIds` en `getStaticPaths()`; el escáner exige que existan exactamente las páginas de los registros visibles en cada modo (R-RULE-14).

## 6. Componentes

Todos están en `src/components/`, tienen props tipadas y un comentario de uso al inicio del archivo, que es la referencia detallada.

**Piezas básicas**

| Componente | Props | Cuándo se usa |
| --- | --- | --- |
| `Icon` | `name` (`IconName`), `class?` (`icon--16`, `icon--18`, `icon--24`, `icon--28`; 20 px por omisión; peso óptico `icon--art` de 40 a 64 px, `icon--fine` desde 64 px), `label?` | Todo icono. SVG en línea que toma el color del texto; decorativo por omisión. `label` solo si el icono es todo el contenido de un control. Escribe `width` y `height` numéricos (16, 18, 24, 28 o 20) para que conserve su tamaño sin la hoja de estilo (A-06). |
| `Button` | `href` o `type`, uno de los dos y nunca ambos (los tipos lo exigen); `variant?` (`primary`; `inverse` para la banda azul; `outline`, blanco con filete azul, para la acción secundaria de un bloque), `block?`, `icon?`, `iconEnd?` | Botón sólido. Con `type` y sin `href` imprime `<button>`: `type="button"` si lo atiende un script de la página, con su propio gancho `data-*`, o `type="submit"` si envía su formulario. Con `aria-disabled="true"` se ve apagado y no cambia al pasar el puntero. Mide 52 px como mínimo y pasa a dos líneas antes de cortarse. |
| `ActionRow` | `href` o `type` (como `Button`), `primary?`, `icon?` (`arrow-right`), `external?` (solo con `href`) | Fila de acción que ocupa una fila de la lámina, con flecha u otro icono. Columna lateral de `PageHeader`, de la portada y de la ficha. Con `type` es un `<button>` con el mismo dibujo y las mismas reglas que `Button`: «Agregar a mi cotización», «Vaciar cotización», «Copiar solicitud». `external` abre otra pestaña (`rel="noopener noreferrer"`) y agrega «(se abre en otra pestaña)» para lectores de pantalla: los catálogos del fabricante en la página de una marca, con el icono `external-link`. |
| `MoreLink` | `href`, `icon?`, `external?` | Enlace de texto azul con flecha. `external` abre otra pestaña y agrega «(se abre en otra pestaña)» para lectores de pantalla («Sitio del fabricante» en la página de una marca, y los catálogos del fabricante, en PDF y en línea, en «Catálogos de los fabricantes» de `/marcas/`). |
| `Note` | `icon?` (`info`), `class?`; texto en el slot | Nota pequeña gris con icono: avisos de disponibilidad. |
| `Tag` | texto en el slot | Etiqueta en mayúsculas sobre tinta. Hoy, solo `EXAMPLE_TAG` en cada ejemplo. |
| `Monogram` | — | Iniciales de la persona de contacto en un cuadro azul (decorativo). |
| `EmailAddress` | — | La dirección de correo de contacto, partible solo después de «@». Va dentro de un enlace `mailto:` que lleva `aria-label` con la dirección (U-11, A-02b). |
| `GridFill` | `cells`, `as?` (`li` o `div`) | Celdas de relleno (sección 3). |

**Estructura de página**

| Componente | Props | Cuándo se usa |
| --- | --- | --- |
| `PageHeader` | `title`, `breadcrumbs?`, `eyebrow?`, `icon?`, `lead?`, `id?` (`titulo`); slot con acciones | Bloque de título de las páginas interiores: 8 columnas con la ruta, el pictograma opcional y el H1; 4 columnas con la entrada y las acciones. Sin `lead` ni slot, el título ocupa las doce columnas. `eyebrow` pone un antetítulo azul en lugar de la ruta; `id` cambia el `id` del H1. Ninguna página usa hoy `eyebrow` ni `id`: todas llevan la ruta, y todos los H1 hechos con `PageHeader` tienen el `id` `titulo`. |
| `Breadcrumbs` | `items` (`{ label, href? }[]`), `class?` | Ruta de navegación (4.5). La imprime `PageHeader`; la ficha la usa sola. |
| `SectionHead` | `title`, `id`, `level?` (2), `eyebrow?`, `more?` (`{ href, label }`), `aside?`; slot `side` | Cabeza de cada sección. `aside` pone un párrafo en 8 columnas a la derecha («Cómo funciona»); `eyebrow` con `<Monogram slot="side" />` da la variante de contacto. |
| `Band` | `title`, `id`, `text?`, `action` (`{ href, label }`), `icon?` (`zoom-question`), `headingLevel?` (2; con 1 el título toma el tamaño de título de página); slot bajo el texto | Banda azul sólida con botón blanco. El slot lleva, por ejemplo, el enlace secundario `.band__link` (texto blanco subrayado, de 44 px de alto como mínimo). |
| `CatalogBand` | — | La banda de solicitud especial al final de los listados y de la página de un retirado. Una por página. Si alguna marca publica su catálogo, lleva bajo el texto de la banda (en el slot de `Band`; en el celular, sobre el botón) el enlace «Ver los catálogos de los fabricantes» a `/marcas/#catalogos`. `/marcas/` no la usa: la sección está justo arriba. |
| `EmptyState` | `icon`, `title`, `text`, `action` (`{ href, label, icon? }`), `headingLevel?` (2 o 3), `class?`; slot `extra` | Estado vacío a todo lo ancho: pictograma, dos frases y una acción (sección 8). El slot `extra` agrega una segunda acción después de la principal (el catálogo pone ahí «Limpiar filtros»): las dos van una sobre otra en computadora, lado a lado si caben en tableta y a todo lo ancho en el celular. |
| `Steps` | `steps` (`string[]`, al menos uno) | Pasos numerados con flecha. Hasta cuatro en una fila; con más, tres por fila con relleno. Con la letra agrandada, desde 700 px, una palabra larga del paso se parte con guion. |
| `Faq` | `items` (`{ question, answer }[]`), `openFirst?` (`true`), `headingLevel?` (3) | Preguntas frecuentes con `<details>` nativos. En un celular más angosto que 20rem (con la letra agrandada) la pregunta puede partir una palabra con guion para que el signo «+» quede entero. |
| `ItemRegister` | `items` (`{ label, text }[]`), `class?` | Registro numerado: qué enviar en «Cotizar mi lista» y en la solicitud especial. Estilos en `atencion.css`. Desde 700 px, si a la explicación no le quedan 12rem junto a la etiqueta (letra agrandada), pasa debajo de ella, como en el celular. |
| `DraftMessage` | `text`, `id`, `title?` («Así empieza tu mensaje»), `headingLevel?` (3), `class?`; los demás atributos pasan a la celda | El texto del borrador, una línea por renglón. No es un formulario. `data-draft-text` permite que un script lo reescriba. Con JavaScript, «Cotizar mi lista» y la solicitud especial imprimen un segundo borrador, «Así queda tu mensaje», marcado con `data-message-draft`, que sigue cada cambio (sección 16). |
| `ContactData` | `whatsappHref?`, `mailHref?`, `extraRows?` (`{ key, value }[]`), `class?` | Filas WhatsApp, Correo y Horario con los datos de `business.json`; los enlaces abren el borrador general o los que se pasen. `extraRows` agrega filas después; ninguna página las usa hoy. En tableta y computadora la clave va en una columna de 148 px; con la raíz de más de 27 px (cerca de 170 %), la clave va arriba y el valor debajo, como en el celular. Las filas Marca, Código y Unidad de venta de la ficha y del producto retirado son las mismas filas de datos y hacen lo mismo. |
| `EntryCard` | `href`, `icon`, `title`, `kicker`, `text`, `headingLevel?` (3) | Tarjeta de entrada de 4 columnas (las tres entradas de `src/lib/ayuda.ts`). Toda la tarjeta es el enlace. |

En la portada, `/contacto/`, `/cotizar/` y `/solicitud-especial/` el bloque «Atención con …» tiene la misma forma: `SectionHead` con el antetítulo «Atención personal» y el monograma, una celda de 5 columnas a la izquierda y `ContactData` en 7 columnas a la derecha (`contact__data`); en tableta y celular se apilan en ese orden, que es también el del documento. Lo que lleva la celda de la izquierda cambia por página:

- Portada (`contact__intro cell`): «Cuéntame qué necesita tu empresa…» y el botón «Contactar por WhatsApp» (`Button`, borrador general). Solo aquí la sección lleva `id="atencion"`; hoy nada enlaza a ese ancla.
- `/contacto/` (`contact__intro contacto__intro cell`): la misma frase y, debajo, la denominación (`locationLabel`); sin acción.
- `/cotizar/` y `/solicitud-especial/` (`atencion__side span-5 span-md-12`, de `atencion.css`, sin `.cell` y con su propio relleno): «Conoce las categorías y las marcas que manejamos.» y la fila «Explorar catálogo» (`ActionRow`). En estas dos páginas los enlaces de `ContactData` abren el borrador de la página (la lista o la solicitud especial), no el general. En `/solicitud-especial/` la sección lleva además `data-solicitud`: cuando la página llega con una búsqueda (`?q=`), su script agrega lo buscado a los enlaces de WhatsApp y correo de todo lo marcado así, también a los de este bloque (sección 10).

**Catálogo, categorías y marcas**

| Componente | Props | Cuándo se usa |
| --- | --- | --- |
| `CategoryPlate` | `categories`, `special?` (`true`) | Placa de la portada y de la 404: mosaicos con pictograma, número y nombre corto (el nombre accesible es el completo) y la celda ancha de solicitud especial. No se llama sin categorías. Con la letra agrandada, desde 700 px, si la palabra más larga de un nombre no cabe en su mosaico, se parte con guion. |
| `CategoryRegister` | `categories`, `headingLevel?` (2, 3 o 4; 3) | Registro de categorías: número, pictograma, nombre y línea de subcategorías. |
| `BrandCells` | `brands`, `allLink?` (`{ href, label }`, celda azul final), `size?` (`md`; `lg`, celdas de 96 px), `counts?`, `currentId?` | Nombres de marca como texto en celdas, nunca logotipos. `currentId` marca la celda de la página actual (F-9a). Con la letra agrandada, si el nombre más largo ya no cabe en su celda, la mitad de celdas por fila (dos o una). |
| `ProductCard` | `product`, `headingLevel?` (3), `class?` | Tarjeta de un `PublicProduct`: su fotografía (`ProductPhoto`, completa dentro del marco 4:3, 16:10 en tableta, sin recortar ni deformar) o, sin ella, el pictograma de la categoría sobre el rayado, «Ejemplo» si corresponde, categoría, nombre, «marca · código» (el «·» va unido a la marca con un espacio de no separación: V-06), «Ver ficha» y «Cotizar» (borrador de producto por WhatsApp). Las dos acciones se llaman «Ver ficha: {nombre}» y «Cotizar: {nombre}» (A-02c). La fila de acciones es flexible con salto de línea: las dos ocupan mitades iguales y sus etiquetas no se parten; si no caben juntas (texto espaciado o agrandado), «Cotizar» baja a una segunda fila del ancho de la tarjeta. Con la letra agrandada, la etiqueta de «Cotizar» lleva el relleno de la celda y empieza donde la de «Ver ficha», también cuando las dos caben en una fila, así que pasan a dos filas un poco antes; con el espaciado de texto a tamaño normal empieza 4 px más a la izquierda ([`ESTADO.md`](ESTADO.md#10-límites-conocidos)). En el celular y en el catálogo de cuatro columnas (desde 1360 px) se apilan en una sola columna y la etiqueta puede partirse. Con la letra agrandada, la categoría de la tarjeta se parte con guion antes de salirse, y en el nombre una palabra que no cabe en su renglón pasa al siguiente (con guion si tiene ocho letras o más y el navegador permite fijar ese mínimo). |
| `ProductPhoto` | `image` (`PublicImage`), `place` (`card` o `page`), `class`, `productId`, `photos?` | La fotografía de un producto en la tarjeta (`product__img`, carga diferida) y en la ficha (`producto__img`, carga inmediata con prioridad alta). Con `file`, un `<picture>` con WebP en varios anchos (sin pasar del ancho del archivo), una copia en el formato del archivo para el navegador sin WebP (PNG para un WebP), `sizes` calculado con la proporción de la foto y el marco de cada lugar (en la ficha en celular, `calc(100vw - 40px)` para una foto de proporción 1.3 o más ancha y el alto del marco de 4:3 por la proporción para una más alta), y el ancho y el alto del archivo; si el archivo no está en `src/assets/productos/`, la compilación se detiene con el nombre de la ficha y del archivo. Con `url`, un `<img>` con la dirección tal cual, el ancho y el alto de la ficha y `referrerpolicy="no-referrer"`. `photos` solo lo usa la sonda de las pruebas. |
| `ProductGrid` | `products`, `headingLevel?` | Tarjetas de 3 columnas: cuatro por fila en computadora, dos en tableta y celular. Con la lista vacía no imprime nada. |
| `CatalogListing` | `products`, `categories`, `brands`, `currentCategoryId?`, `currentBrandId?`, `facets?`; slot | Cuerpo de catálogo, categoría y marca: `CatalogNav` (3 columnas) y `CatalogGrid` (9). Solo con productos. El slot recibe el estado sin resultados. Con `facets` (solo el catálogo) la posición de la barra lleva las dos formas con las mismas clases de columna: `CatalogNav` con `no-js-only` y `CatalogFilters` con `js-only`. |
| `CatalogNav` | `categories`, `brands`, `currentCategoryId?`, `currentBrandId?`, `class?` | Barra lateral de navegación por enlaces (no son filtros): «Categorías» y «Marcas», plegadas después de la octava marca. En tableta y celular, dos filas plegables cerradas al cargar. En el catálogo solo se ve sin JavaScript; en las páginas de categoría y de marca, siempre. |
| `CatalogFilters` | `groups` (`buildFacetGroups`), `class?` | Filtros combinables del catálogo, solo con JavaScript: «Limpiar filtros» y un grupo de casillas (`CheckRow`) por parámetro, «Categorías» y «Marcas», cada opción con su número de productos. El título de cada grupo es un botón de pliegue (`.disclosure`). Desde 1100 px llena la celda de la barra lateral con los grupos abiertos y «Limpiar filtros» arriba; en tableta y celular los grupos son filas plegables, cerradas al cargar, y «Limpiar filtros» va después de ellos. No lleva script: lo atiende el de `CatalogSearch`. |
| `CatalogNavList` | `items` (`{ label, href, count, current }`), `collapseAfter?`, `moreLabel?`, `lessLabel?` | Lista de la barra lateral. La fila actual nunca queda plegada. Una fila con productos se llama «{nombre}, {n productos}». |
| `CatalogGrid` | `products`, `facets?` | Tarjetas del catálogo: cuatro por fila desde 1360, tres a 1280, dos en tableta y celular, con relleno recalculado al filtrar. Cada tarjeta lleva su texto de búsqueda en `data-search` y, con `facets`, sus fichas de filtro en `data-facets` («categoria:manos marca:ansell»). |
| `CatalogSearch` | `total` | Fila de búsqueda del catálogo; su script es el único que lleva el estado del catálogo (la búsqueda y los filtros) y el único que escribe la dirección (sección 10). En computadora, con la letra agrandada, cuando «Buscar» o la línea de resultados ya no caben, toma el arreglo de tableta: campo en 9 columnas, «Buscar» en 3 y la línea de resultados en una fila propia. |
| `RetiredProduct` | `product`, `category?`, `brand?`, `alternatives`, `pageLink?` | Página informativa de un producto retirado (sección 7). |
| `PageLinkScript` | — | Agrega la línea «Enlace» a los borradores (sección 10). |
| `QuoteAdd` | `product` | «Agregar a mi cotización» de la ficha, solo con JavaScript (sección 16). |
| `QuoteCount` | — | El número de renglones guardados, dentro del enlace «Cotizar mi lista» (cabecera, menú y barra fija). Solo marcado: su script es `QuoteCountScript`, que `SiteHeader` imprime una vez por página fuera de todo enlace (sección 16). |
| `MessageActions` | `whatsappHref`, `mailHref`, `whatsappLabel`, `mailLabel`, `longWhatsapp`, `longMail`, `notice`, `class?`; los demás atributos pasan a la columna | Las acciones de un mensaje que arma la página (solo con JavaScript): el aviso de mensaje largo, «Enviar … por WhatsApp», «Enviar … por correo» y «Copiar solicitud» con su línea de estado. Solo marcado: lo atiende `src/lib/message-page.mjs` (sección 16). |

**Formularios** (la base del paso 2; estilos en `components.css`, 4.18; cómo se usan, en la sección 16)

| Componente | Props | Cuándo se usa |
| --- | --- | --- |
| `Field` | `label`, `for`, `hint?`, `error?`, `framed?`, `class?`; el control en el slot | Campo: etiqueta pequeña arriba, el control a todo lo ancho y sin borde propio, el texto de ayuda (`{for}-ayuda`) y, con `error`, el contenedor del error (`{for}-error`), oculto. Es una celda de la lámina; con `framed`, una casilla con su propio filete dentro de una celda más ancha. |
| `Select` | los atributos del `<select>`; las `<option>` en el slot | Lista desplegable nativa con la flecha del kit, 44 px de alto como mínimo y letra de 16 px. La opción elegida nunca pasa bajo la flecha. |
| `Stepper` | `id`, `name?`, `value?` (1), `min?` (1), `max?` (99999), `label?`, `class?` | Selector de cantidad: [−] [número] [+], botones de 44 px. Solo marcado: su script es `StepperScript`, que la página imprime una vez, fuera de todo `<template>` y de todo enlace. Sin JavaScript queda solo el campo de texto. |
| `CheckRow` | `name`, `value`, `label`, `count?`, `checked?`, `class?` | Fila con casilla de una opción de filtro: el cuadro de 18 px, el nombre y el número de productos. Toda la fila es la etiqueta; las opciones nunca se deshabilitan. |
| `StatusLine` | `icon?` (`check`) o `icons?`, `hidden?` (`true`), `class?`; slot `action` | Línea de estado: icono, frase y, si hace falta, una acción (un enlace `.more` o un botón `.text-btn`). Se imprime oculta y vacía; el script escribe la frase. Va junto a una región viva oculta (sección 16). |

**Plantilla:** `SiteNotice`, `SiteHeader`, `SiteFooter` y `Dock` los usa solo `BaseLayout`.

## 7. Páginas

| Ruta | Qué muestra |
| --- | --- |
| `/` | Portada: titular «Equipo de protección y soluciones para tu empresa.» con sus acciones; placa de categorías o, sin categorías, la nota «Estamos preparando el catálogo» y las tres entradas; «¿Cómo podemos ayudarte?» y «Explora nuestras categorías» (solo con categorías); «Marcas que manejamos»; productos (solo si hay); banda de solicitud especial; «Atención con …»; «Cómo funciona»; preguntas frecuentes. |
| `/catalogo/` | Con productos: título, búsqueda, filtros por categoría y por marca (sin JavaScript, la barra lateral de enlaces) y tarjetas. Sin productos: «Estamos preparando el catálogo. Mientras tanto…», acciones, registro de categorías (si hay) y marcas. Termina con la banda de solicitud especial. |
| `/categorias/{id}/` | Título con pictograma y línea de subcategorías; «Marcas en esta categoría» (solo si algún producto tiene marca real; un nombre de marca que no cabe en la fila baja a un segundo renglón dentro de su enlace); listado o estado vacío. |
| `/marcas/` | Las marcas de `brands.json` en celdas grandes, en su orden; bajo cada nombre, su número de productos cuando tiene alguno. Después, la sección «Catálogos de los fabricantes» (`#catalogos`): una fila por marca con un catálogo del fabricante en PDF o en línea, el nombre (enlace a su página) en 4 columnas y sus catálogos en 8 («Sitio del fabricante» no se lista aquí: está en la página de la marca), cada uno con la marca en texto oculto para que no se repitan los nombres, la edición y el tamaño del PDF a la vista; en celular, el nombre y sus enlaces en una sola celda. Termina con la nota «Disponibilidad por marca y modelo sujeta a confirmación al cotizar.». |
| `/marcas/{id}/` | Título con sus enlaces del fabricante (si la marca los tiene): los catálogos, en PDF y en línea, como filas de acción (`ActionRow` con `external`) con la edición y el tamaño del PDF bajo la etiqueta, y «Sitio del fabricante» como enlace de texto; y, solo con productos, «Contactar por WhatsApp»; listado o estado vacío con las demás marcas (la actual marcada). |
| `/productos/{id}/` | Ficha (abajo) o página de un producto retirado. |
| `/cotizar/` | Sin JavaScript: qué enviar (siete datos), el borrador de la lista, notas y «Atención con …». Con JavaScript: «Mi cotización», «Completa tu solicitud» (sin productos en la compilación, «Escribe tu lista»), «Revisa y envía» y «Atención con …» (sección 16). |
| `/solicitud-especial/` | Banda como título con «Enviar mi solicitud por WhatsApp», la acción por correo, notas, qué nos ayuda a encontrarlo y «Atención con …». Con JavaScript, la sección «Qué nos ayuda a encontrarlo» cambia su registro numerado por cinco campos y las acciones del mensaje (sección 16). |
| `/contacto/` | Persona de contacto, WhatsApp, correo, horario y denominación; sin dirección ni mapa. Entradas de ayuda y preguntas frecuentes. |
| `/privacidad/` | Qué datos pide el sitio (ninguno), lo que se agrega a la cotización (solo en una compilación con productos), lo que se escribe en el sitio, qué pasa al escribir por WhatsApp o correo, lo que se comparte y el correo para dudas. Dice qué guarda el navegador y cuánto dura; no hay cookies. Es un borrador pendiente de aprobación y no es el aviso de privacidad de la empresa. |
| 404 | Antetítulo «Error 404», placa de categorías o las tres entradas. No declara dirección canónica. Con la letra agrandada, si el número «404» no cabe en sus columnas, va en una fila propia sobre el mensaje, como en el celular. |

**Ficha de producto.** Ruta (Inicio / Catálogo / categoría / producto); la hoja en dos partes: imagen en 7 columnas (la fotografía, `ProductPhoto`, completa dentro de su marco sin recortar ni deformar, con su ancho y alto reales para que la página no salte al cargarla, o, sin ella, el pictograma de la categoría sobre el rayado; «Ejemplo» en los ejemplos) y, en 5 columnas, categoría, nombre (H1), filas Marca, Código y Unidad de venta, resumen, «Cotizar este producto» (WhatsApp) y «Cotizar por correo», el aviso «Disponibilidad y tiempo de entrega sujetos a confirmación al cotizar.», «Características», «Normas» (solo si la ficha tiene normas), «Variantes» y «Documentación». Con fotografía, el marco y su crédito van juntos en un `<figure>`: bajo el marco, en la misma celda blanca, la línea «Foto: {marca}» en letra chica gris (`t-small`, `--grey-700`, alineada con el relleno de la celda, de 44 px de alto como mínimo), donde la marca, subrayada, enlaza la página del fabricante de donde viene la foto y abre otra pestaña; su nombre accesible es «Foto de {marca}, página del fabricante (se abre en otra pestaña)», distinto del de la fila Marca, que lleva a la página de la marca en este sitio. En computadora el `<figure>` entero se queda a la vista al bajar (el crédito acompaña a la foto) y el marco le cede al crédito su alto para que quepan los dos en la pantalla. Sin foto (pictograma), en un retirado y en las tarjetas no hay crédito. En tableta y celular las dos partes se apilan; en celular, el marco de una fotografía es de 4:3 y de todo el ancho, con 12 px de relleno arriba y abajo (el del pictograma sigue de 200 px de alto), para que la foto se vea casi del ancho de la pantalla. Después, la banda «¿Necesitas otra talla, color o presentación?» y hasta cuatro productos de la misma categoría (o del catálogo). Las variantes de la lista son información, no controles: cada una con su etiqueta y, si tiene código propio, el código (una variante sin código muestra solo su etiqueta); si algún código de variante pasa de 14 caracteres, se listan en filas en lugar de celdas. «Normas» lista cada norma en su propia fila, de celda blanca a todo el ancho, como la escribe el fabricante (una designación larga se parte en renglones dentro de su fila), seguida de la nota «Según la información publicada por el fabricante.»; no lleva enlace ni la dirección de la fuente. En tableta y celular, con la letra agrandada, una variante larga se parte con guion dentro de su celda. Con JavaScript, «Agregar a mi cotización» (`QuoteAdd`) va bajo las dos acciones y antes del aviso de disponibilidad: ahí se eligen la talla o el color, la cantidad y la unidad (sección 16). «Catálogo», en la ruta, regresa a los resultados de los que se llegó (sección 10).

**Nombres largos de producto.** Un nombre de más de 50 caracteres (`LONG_PRODUCT_NAME` en `src/lib/product-title.mjs`, contados como se leen) lleva `data-long` en el H1 y en la fila de ruta. Desde 1100 px el título baja al tamaño de los títulos de sección, en renglones equilibrados, y la fila de ruta se queda en un renglón: su último elemento, el nombre, toma lo que queda de la fila y se corta con «…» (el H1 lo da entero justo debajo y el lector de pantalla lee el nombre completo); si no le quedan al menos 12em, baja entero al renglón siguiente y ahí se corta, sin salir de su celda. En tableta y celular la acción queda debajo de la imagen de todos modos y nada cambia. El verificador de marcado (V-03) revisa que las dos marcas `data-long` vayan juntas y solo con un nombre largo. En las tarjetas, el nombre se muestra completo y el código pasa entero al renglón siguiente si cabe ahí, o se parte dentro de la tarjeta si no. El nombre más largo de los ejemplos actuales tiene 35 caracteres.

El objetivo de la primera pantalla es la compilación de producción a 1440 × 900, con el aviso de sitio en preparación arriba: con un nombre de hasta 90 caracteres escrito en mayúsculas y minúsculas y un resumen del largo de los de los ejemplos (unos 100 caracteres), «Cotizar este producto» queda entera en la primera pantalla, con 11.6 px de margen medidos. Las pantallas más chicas y la vista previa no son objetivo. Los casos que quedan fuera están en [`ESTADO.md`](ESTADO.md#10-límites-conocidos). Con los 46 productos reales, cuyos resúmenes son más largos que los de los ejemplos (de 81 a 167 caracteres), la acción cabe entera en 31 fichas y termina 1.8 px debajo de la primera pantalla en 15: las de nombre de 41 a 50 caracteres, que ocupa tres renglones al tamaño grande, con un resumen de cinco renglones. Sin el aviso caben las 46.

**Producto retirado.** Misma dirección que tuvo la ficha. La hoja conserva la división: en 7 columnas solo el pictograma de la categoría (o el genérico), nunca una fotografía; en 5 columnas la categoría pública, el nombre (H1), las filas Marca y Código, el aviso «Producto retirado» (etiqueta con cuadro sólido, «Este producto ya no forma parte del catálogo.» y «Dinos qué necesitas y revisamos alternativas.») y las acciones «Consultar alternativas» (WhatsApp) y «Consultar por correo». Después, la banda de solicitud especial y «Más productos…». Nunca muestra acciones de cotizar ni de pedir la ficha, unidad de venta, resumen, características, variantes, documentación, aviso de disponibilidad ni la banda de ayuda de la ficha. Su título es «{nombre} (producto retirado) · Sercom Active». Los datos y el procedimiento están en [`catalogo-y-actualizaciones.md`](catalogo-y-actualizaciones.md#5-producto-retirado).

## 8. Estados

Todo lo que depende del catálogo se decide con los datos (`categories.length`, `products.length`, campos vacíos), nunca con un interruptor escrito a mano. Una página nueva que muestre categorías o productos contempla la lista vacía.

| Estado | Qué se ve |
| --- | --- |
| Sin resultados en el catálogo | Un solo `EmptyState`, con tres versiones que elige `emptySituation`: por la búsqueda, «No encontramos productos con esa búsqueda.» / «Puedes pedirnos este producto y lo buscamos por ti.» con «Solicitar este producto», que lleva la búsqueda a la solicitud especial (`?q=…`); por los filtros, «No hay productos con esos filtros.» / «Quita algún filtro o dinos qué necesitas y lo buscamos por ti.» con «Ayúdame a encontrarlo»; por los dos, «No encontramos productos con esa búsqueda y esos filtros.» / «Quita algún filtro, o pídenos este producto y lo buscamos por ti.» con «Solicitar este producto». Con filtros marcados ofrece además «Limpiar filtros» (slot `extra`). |
| Catálogo vacío (ninguna categoría ni ficha aprobada; producción antes del paso 3) | Portada sin placa ni secciones de categorías y productos, con «Estamos preparando el catálogo» y las tres entradas; `/catalogo/` con su texto de preparación, acciones y marcas; sin búsqueda ni «Categorías» en el encabezado; pie sin columna de categorías. |
| Categoría sin productos | `EmptyState` «Estamos cargando los productos de esta categoría.» con «Contactar por WhatsApp» (borrador de la categoría), sin barra lateral. |
| Marca sin productos | `EmptyState` «Estamos cargando los productos de esta marca.» con «Mientras tanto, consulta el catálogo del fabricante y dinos qué modelo necesitas: te ayudamos a cotizarlo.» si la marca publica su catálogo (o «Mientras tanto, dinos qué necesitas y te ayudamos a cotizarlo.» si no), las demás marcas con la actual marcada y una nota. |
| Documento no disponible | «Documentación» ofrece «Solicitar ficha técnica» por WhatsApp; nunca una descarga muerta. |
| Dato no confirmado | Se omite: una ficha sin unidad de venta, resumen, características o variantes no imprime ese bloque; una marca sin enlace del fabricante no muestra ninguno, y sin catálogo su estado vacío no menciona el catálogo del fabricante; un PDF sin edición ni tamaño comprobados no muestra esa línea; la dirección no se publica. |
| Producto retirado | Página informativa (sección 7). |
| Lista vacía | `/cotizar/` con JavaScript: «Mi cotización» muestra «Aún no agregas productos del catálogo.» / «Agrégalos desde su ficha o escribe abajo lo que necesitas.» con «Explorar catálogo»; los campos y el mensaje siguen ahí. Sin productos en la compilación (producción antes del paso 3, o un catálogo sin fichas aprobadas), «Mi cotización» solo aparece si el navegador guarda renglones de otra compilación, para informarlos. Sin JavaScript, qué enviar y el borrador. |
| Estados del paso 2 | Error de cantidad, mensaje largo, almacenamiento que no se puede usar, renglones iguales y renglones que la página no ubica: sección 16. |

## 9. Hojas de página

1. Las reglas de una página van en `src/styles/pages/<pagina>.css` y se importan en el encabezado de la página **después** de la plantilla (`import '../../styles/pages/producto.css';`): Astro las agrega después de la hoja global.
2. Clases nuevas con el prefijo de la página (`.catalog-…`, `.producto__…`, `.solicitud__…`). No se redefinen clases globales (`.btn`, `.product`, `.sec-head`…) ni se escribe en `:root`.
3. Se usan las variables y los puntos de corte de la sección 2: `max-width` para bajar de un ancho y `min-width` con el valor siguiente (700, 1100, 1360) para lo que solo vale en anchos mayores.
4. Se mantiene la lámina: celdas blancas sobre el azul, filetes por huecos de 1 px, sin bordes propios (salvo los cinco controles de la sección 3, y nada más), sin radios, sin sombras.
5. Toda retícula nueva o bloque sólido nuevo se agrega a la lista de colores forzados (`responsive.css`, 6.8).
6. Lo que tenga texto sigue las reglas de la letra agrandada (11.4): mínimos en lugar de tamaños fijos y, si una fila deja de caber, una regla `@container lamina` que con la letra normal no se cumpla.
7. Las cadenas reservadas a los ejemplos (`ejemplo-…`, «de ejemplo», «Marca de ejemplo», `EJ-`) no pueden aparecer en producción, tampoco como clase CSS: el escáner falla.

## 10. Scripts del navegador

Todos son de mejora progresiva: sin JavaScript cada página sigue siendo usable. Cada uno se escribe dentro de un componente o de una página.

| Script | Dónde se carga | Importa | Qué hace |
| --- | --- | --- | --- |
| `SiteHeader` | todas las páginas | nada | Paneles de menú, búsqueda y «Categorías»; alto real del encabezado y de la barra fija (4.3, 4.4); texto de ayuda del campo en dos líneas (4.3). |
| `QuoteCountScript` | todas las páginas (lo imprime `SiteHeader`) | `quote-list.mjs`, `quote-store.mjs` | El número de renglones guardados junto a «Cotizar mi lista» y el nombre de su enlace (sección 16). Solo lee. |
| `CatalogSearch` | `/catalogo/` con productos | `catalog-filters.mjs`, `search.mjs` | La búsqueda y los filtros del catálogo (abajo). Atiende también `CatalogFilters`. |
| `PageLinkScript` | tarjetas y ficha | `contact-core.mjs` | Agrega la línea «Enlace» a los borradores de producto al cargar la página ([`datos-y-modos.md`](datos-y-modos.md#4-borradores-de-whatsapp-y-correo)). |
| `QuoteAdd` | ficha de un producto público | `quote-list.mjs`, `quote-store.mjs`, `contact-core.mjs` | «Agregar a mi cotización» y lo que lo elegido agrega a «Cotizar este producto» y «Cotizar por correo» (sección 16). |
| `StepperScript` | ficha, y `/cotizar/` con productos | `quote-list.mjs` | Los botones − y + de cada selector de cantidad de la página, también de los que se clonan después (sección 16). |
| Ficha de producto | `/productos/{id}/` | `catalog-filters.mjs`, `routes.mjs` | El regreso a los resultados (abajo). |
| Cotizar mi lista | `/cotizar/` | `contact-core.mjs`, `message-page.mjs`, `quote-list.mjs`, `quote-store.mjs` | La lista guardada, los tres campos y el mensaje (sección 16). |
| Solicitud especial | `/solicitud-especial/` | `contact-core.mjs`, `message-page.mjs`, `search.mjs` (solo el nombre del parámetro) | Los cinco campos y el mensaje; con `?q=…`, la búsqueda llega escrita en «Descripción o uso» con su nota (sección 16). |

Reglas para un script del navegador:

- **Solo módulos sin datos.** Un script solo alcanza, directa o indirectamente, los módulos sin datos de `BROWSER_MODULES` (`tests/build-mode.test.mjs`): hoy `text.mjs`, `search.mjs`, `routes.mjs`, `contact-core.mjs`, `catalog-filters.mjs`, `quote-list.mjs`, `quote-store.mjs` y `message-page.mjs`, de `src/lib/`. Un módulo nuevo se agrega ahí con sus importaciones, o la prueba falla. Nunca `site-data.mjs`, `contact.mjs` ni un `.json`: los datos viajan en el HTML (`data-*` o un bloque `<script type="application/json">`) y los enlaces de contacto llegan ya construidos. Tampoco `<script src>`, `import()` con una ruta calculada, `import.meta`, `process.` ni módulos de Node o de Astro; un tipo se importa con `import type`. Detalle: [`datos-y-modos.md`](datos-y-modos.md#2-lo-que-reciben-las-páginas-la-proyección-pública).
- **Un solo módulo toca el almacenamiento.** Solo `src/lib/quote-store.mjs` usa `localStorage` y `sessionStorage`; nadie usa cookies ni otro almacenamiento (una prueba de las fuentes lo exige, `tests/browser-code.test.mjs`). Los demás leen y escriben la lista con `quoteStore`.
- **Cada control tiene su gancho.** Un `<button>`, `<select>`, `<textarea>`, `<input>` o `role="button"` tiene una función nativa (un campo con `name`, o el botón de envío de un formulario con `action`, como las dos búsquedas) o lleva un atributo `data-*` propio que el código de su página nombra (`data-quote-add`, `data-copy-request`, `data-filter-clear`…). Las regiones cuyos enlaces llevan el mensaje se marcan igual: `data-cotizar` y `data-solicitud`. El verificador de marcado lo revisa en el sitio compilado (R-RULE-30a).
- **Ningún `<script>` dentro de un `<template>` ni de un enlace.** Astro imprime el script de un componente otra vez dentro de la plantilla, y cada clon lo ejecutaría de nuevo (un clic contaría varias veces). Por eso un componente que va dentro de un `<template>` o de un enlace es solo marcado, y su script es un componente aparte que la página imprime una vez, fuera de ellos: `Stepper` y `StepperScript`, `QuoteCount` y `QuoteCountScript`, como `PageLinkScript`. R-RULE-30b falla si un `<script>` queda dentro de un `<template>`.
- **`stepper:sync`.** Una página que escribe `input.value` de un selector de cantidad desde su código (al dibujar la lista, al deshacer) lanza después el evento `stepper:sync` (con burbujeo), desde el campo o desde el contenedor de varias filas, cuando la fila ya está en el documento: así `StepperScript` pone al día qué botón está apagado. Una página nunca lanza `input` ni `change` por su cuenta: si guarda en cada `input`, guardaría mientras dibuja.
- El texto que escribe el visitante, y todo lo que llega de la dirección o de lo guardado, se escribe con `textContent`, `value`, propiedades o como parámetro codificado, nunca como HTML.
- La regla de movimiento reducido da a toda propiedad una transición de 0.01 ms: un script que lee el diseño justo después de cambiar un estilo puede ver todavía el valor anterior.

**Búsqueda y filtros del catálogo.** El formulario es real (GET a `/catalogo/`, parámetro `q`). El script de `CatalogSearch` filtra en el navegador, sin recargar: al cargar con `?q=…` o con filtros en la dirección (el campo del encabezado envía aquí), mientras se escribe, al enviar y al marcar una casilla. Una tarjeta se muestra si cada palabra de la consulta, o una de sus formas en singular o un sinónimo revisado ([`catalogo-y-actualizaciones.md`](catalogo-y-actualizaciones.md#9-cómo-busca-el-catálogo)), está en su nombre, marca, código, códigos de variante o categorías, sin distinguir mayúsculas ni acentos («senalizacion» encuentra «señalización») y con los códigos comparados sin separadores («37175» encuentra «37-175»), y si cumple los filtros: dentro de un grupo las opciones se suman y entre grupos, y con la búsqueda, se combinan (`applyCatalogState` sobre `data-search` y `data-facets`). Actualiza la línea de resultados («10 productos», «3 resultados para “guante”», «4 productos con filtros»; región viva, hasta dos renglones, que solo se escribe cuando su frase cambia), el número de cada opción, «(2 seleccionadas)» en el título de cada grupo, «Limpiar búsqueda» (que conserva los filtros), los dos «Limpiar filtros» y el estado sin resultados en su versión (sección 8), y pasa la consulta a «Solicitar este producto». Los pliegues de los grupos se abren desde 1100 px y se cierran por debajo, al cargar y al cruzar ese ancho, salvo el grupo que tiene el foco dentro. «Limpiar filtros» va en el documento donde se ve (primero desde 1100 px y último por debajo): el script lo coloca al cargar y al cruzar ese ancho, conservando el foco. Al usarlo, el foco pasa al título del primer grupo, o al campo de búsqueda si se pulsó en el estado sin resultados. Sin JavaScript, el formulario envía a `/catalogo/?q=…`, la página lista todo con el conteo simple y queda la barra lateral de enlaces.

**Limpieza del texto de búsqueda.** `cleanQuery` (`src/lib/text.mjs`) prepara el texto del visitante para mostrarlo dentro de una frase, para buscarlo o para ponerlo en un borrador. Lo usan `displayQuery` y `queryTokens` (catálogo: lo que muestra la línea de resultados es exactamente lo que se busca) y `requestDescription` (solicitud especial y sus borradores), así todos leen lo mismo.

- **Se quitan sin dejar espacio** los caracteres sin ancho ni significado en una consulta (`REMOVED_IN_QUERY`): el guion suave U+00AD; los de dirección U+061C, U+200E, U+200F, U+202A a U+202E y U+2066 a U+2069, que invertirían las palabras del propio sitio; los invisibles U+200B, U+2060 a U+2064 y U+FEFF; los de formato obsoletos U+206A a U+206F, y los rellenos del hangul U+115F, U+1160, U+3164 y U+FFA0, que para Unicode son letras pero no dibujan nada. Un nombre pegado con uno de ellos dentro de una palabra («gu<U+200B>ante», «cas<U+115F>co») se muestra y se busca como la palabra.
- **Pasan a ser un espacio** (`SPACE_IN_QUERY`) el de reemplazo U+FFFD (así llega una secuencia `%` mal formada), los controles y las mitades sueltas de un par sustituto, porque suelen estar donde había un separador. Después se recorta y queda un solo espacio entre palabras.
- **Se conservan** U+200C y U+200D (varias escrituras y los emojis compuestos los necesitan), los selectores de variante, los caracteres de etiqueta (banderas) y toda letra, cifra, marca, símbolo o signo de cualquier escritura.

Si no queda nada visible (una letra, una cifra, un símbolo o un signo de puntuación que no se ignore por omisión), la consulta queda vacía y las dos páginas la tratan como sin búsqueda. El catálogo filtra siempre sobre la consulta limpia: al cargar con `?q=…`, el campo recibe ya la consulta limpia; mientras se escribe, el campo conserva lo escrito y el filtro, la línea de resultados y la dirección usan su versión limpia. Una consulta hecha solo de puntuación (por ejemplo `-`) se muestra en la solicitud especial, pero en el catálogo no filtra nada: se acepta.

**La dirección del catálogo.** La dirección dice siempre lo que se ve: `/catalogo/?q=…&categoria=…&categoria=…&marca=…`, primero la búsqueda, luego cada categoría y luego cada marca, con los parámetros repetidos (`FACET_PARAMS` en `src/lib/catalog-filters.mjs`). La escribe `catalogHref` y la lee `parseCatalogState`; el script la mantiene al día con `history.replaceState`, sin agregar entradas al historial (Atrás sale del catálogo). Al cargar se quedan solo las opciones que la página ofrece, y si la dirección no era la canónica (ids desconocidos, otro orden) se reemplaza. En el catálogo, el formulario del encabezado lleva un campo oculto por opción marcada (`data-filter-hidden`), así su envío normal conserva los filtros. Al volver a la página desde la caché del navegador (`pageshow`), el script vuelve a leer la dirección sin tocarla.

**Largo máximo de una búsqueda.** 200 caracteres completos (`MAX_QUERY_LENGTH` en `src/lib/search.mjs`). Los dos campos de búsqueda llevan ese `maxlength`, y `displayQuery` y `queryTokens` recortan igual lo que llega por la dirección: lo que se muestra sigue siendo lo que se busca, y un texto pegado por error no deja una dirección ni un enlace «Solicitar este producto» de decenas de KB.

**El regreso a los resultados.** En la ficha, «Catálogo» de la ruta lleva a los mismos resultados (búsqueda y filtros) cuando la página anterior fue el catálogo con búsqueda o filtros: el script de la ficha lee `document.referrer`, y solo si es del mismo origen, su ruta es `/catalogo/` y lleva parámetros, reescribe el enlace con `catalogHref(parseCatalogState(…))`. No guarda nada. Si el navegador no da la página anterior (otra política de referencia, una pestaña nueva), el enlace lleva al catálogo completo; el botón Atrás regresa a los resultados de todos modos. Qué política de referencia necesita el alojamiento: [`publicacion.md`](publicacion.md#4-lista-de-lanzamiento).

## 11. Accesibilidad

### 11.1 Estructura

Un solo H1 por página y títulos en orden; cada `<section>` con `aria-labelledby`; `lang="es-MX"`; «Saltar al contenido» como primer elemento enfocable, que lleva el foco a `main#contenido`. Un control con texto visible y `aria-label` tiene un nombre que empieza con ese texto (A-02a).

### 11.2 Foco

Anillo de 3 px de tinta (`--focus`) con 2 px de separación. En celdas que se tocan (`cell-link`, filas de la navegación, logotipo, botones del encabezado) se dibuja por dentro (`outline-offset: -3px`). Dentro de la banda azul es blanco. El enlace «Saltar al contenido» es tinta con anillo blanco interior.

### 11.3 Objetivos táctiles

Al menos 44 px en tableta y celular: botones del encabezado, enlaces de la ruta, filas de datos, enlaces del pie, preguntas frecuentes, «Limpiar búsqueda», la categoría de la ficha, los botones de texto (`.text-btn`: «Quitar», «Deshacer», «Unirlos», «Quitarlos de mi cotización») y el nombre del producto en cada renglón de «Mi cotización». Ese nombre es un enlace de un renglón: hasta 1099 px su objetivo crece a 44 px con un relleno de 12 px que un margen negativo compensa (nada se mueve), y su anillo de foco se dibuja sobre el texto, no sobre el relleno, para no cruzar el renglón de abajo. Las filas con casilla de los filtros miden 48 px en tableta y celular. Los controles de formulario (campos, listas, los botones del selector de cantidad) miden al menos 44 px en todos los anchos. Los botones sólidos miden 52 px.

### 11.4 Texto espaciado y agrandado (WCAG 1.4.12)

Son dos pruebas distintas, y el código las trata por separado. En las dos, nada tiene alto fijo donde haya texto, con tres excepciones de una sola línea o decorativas: el campo de búsqueda del encabezado (44 px de alto; en el panel de tableta y celular crece con la copia de su texto de ayuda, 4.3), el del catálogo (64 px) y el monograma, un cuadro de 88, 72 o 56 px con las iniciales.

**Texto espaciado** (WCAG 1.4.12: más interlineado y más espacio entre párrafos, letras y palabras, con la letra de tamaño normal). Los botones y las filas de acción pasan a dos líneas, la franja y la cabecera crecen (4.3), los nombres de mosaico y de panel se parten con guion en pantallas angostas, los códigos y el correo se parten solo donde está permitido, y las acciones de una tarjeta pasan a dos filas cuando no caben juntas (sección 6). Las reglas de la letra agrandada (abajo) no se activan con el espaciado solo.

**Letra agrandada** (el tamaño de letra del navegador: la raíz, `html`, a 125, 150 o 200 %; no es el zoom de la página, que agranda todo junto). El objetivo: a 125 y 150 % desde 320 px de ancho, y a 200 % desde 360 px, en cada página y con los paneles del encabezado cerrados o abiertos, ninguna página se desplaza a los lados, ningún elemento visible queda en parte fuera de la pantalla, ningún texto sale de su enlace, botón, resumen, campo o etiqueta, y la última línea del pie queda visible sobre la barra fija. Con la letra normal nada cambia. Los anchos son los del área de la página, sin la barra de desplazamiento; cómo se mide y cómo se aplica cada prueba está en la sección 15. Lo que queda fuera del objetivo está en [`ESTADO.md`](ESTADO.md#10-límites-conocidos).

Cómo lo hace el código. La lámina es un contenedor de consultas (`container: lamina / inline-size` en `.sheet`, `layout.css`), y la barra fija, que está fuera de la lámina, es otro (`barra`); `ItemRegister` es el suyo propio (`registro`, `atencion.css`). Las reglas de `responsive.css` 6.9, y las de `catalogo.css`, `producto.css` y `atencion.css` que la citan, comparan con `@container` el ancho del contenedor con lo que mide el texto en `rem`, algo que una consulta de medios no puede hacer. La mayoría usa un interruptor, `@container lamina (width < calc((1rem - 16px) * 400))`, que solo se cumple cuando la raíz mide más de 16 px: desde 125 % se cumple en cualquier lámina (mide como máximo 1296 px); a 120 %, en las de menos de 1280 px; a 110 %, en las de menos de 640 px, y con la letra normal nunca, tampoco con el espaciado de texto. Las demás condiciones tienen umbrales que con la letra normal no se cumplen desde 320 px.

Qué hace cada parte cuando la letra crece:

- **Franja de servicio:** la denominación pasa a dos renglones y la cabecera fija sigue su alto real; sin JavaScript, en computadora, lo sigue con el alto que calcula la hoja de estilo (4.3).
- **Botones del encabezado:** crecen con su etiqueta desde un ancho mínimo, y «Cotizar mi lista» pasa a dos renglones; sin lugar, la etiqueta queda solo para los lectores de pantalla y se ve el icono (4.3).
- **Barra fija del celular:** sus etiquetas pasan a dos renglones y la barra crece; la página reserva su alto real al final y bajo el foco (4.4).
- **Pie:** las columnas pasan a filas; en el celular, los enlaces pasan a una columna (4.6).
- **Celdas con nombre:** las celdas de marca pasan a la mitad por fila, el panel «Categorías» de computadora a dos por fila, la búsqueda del catálogo de computadora toma el arreglo de tableta, la explicación del registro numerado baja bajo su etiqueta, las filas de datos ponen la clave sobre el valor y el número de la 404 va en su propia fila (secciones 4.3, 6 y 7).
- **Palabras largas:** se parten con guion (la página es `es-MX`) los nombres de los mosaicos, el texto de los pasos, las variantes de la ficha, la categoría de las tarjetas y, en un celular más angosto que 20rem, la pregunta de un acordeón.
- **Acciones de las tarjetas:** cuando «Cotizar» baja a una segunda fila, su etiqueta empieza donde la de «Ver ficha» (sección 6).

Reglas para un componente nuevo:

- Sin alto ni ancho fijo donde haya texto: mínimos (`min-height`, `min-width`), y el control crece con su etiqueta.
- El texto pasa a otro renglón; una palabra larga se parte con guion.
- Si las celdas de una fila ya no caben lado a lado, pasan a filas, con una regla `@container lamina` cuyo umbral se mide en `rem` con el texto real.
- Para que el texto agrandado quepa nunca se achica la letra, no se corta con «…» y no se agrega una barra de desplazamiento.
- Con la letra normal nada cambia: cada condición nueva es falsa con la raíz de 16 px desde 320 px, también con el espaciado de texto.
- Los umbrales en `rem` están medidos con Archivo y con los textos de hoy (por ejemplo «WhatsApp», la clave más larga de las filas de datos, «Señalización» en los mosaicos, «sercomactive.com» en el pie, o la denominación, el horario corto, el número de WhatsApp y el correo de la franja, de los que depende el alto que la cabecera fija le da sin JavaScript): si cambian la fuente o esos textos, se miden de nuevo.

### 11.5 Colores forzados, movimiento reducido e impresión

- **Colores forzados** (`responsive.css`, 6.8): cada celda, campo, botón, fila de acción y bloque sólido recibe un contorno de 1 px `CanvasText`; los iconos toman el color de su texto; las marcas de ubicación hechas con sombra pasan a bordes de 4 px; los cuadros de la marca actual, del pie y del catálogo se pintan `CanvasText`; los logotipos quedan sobre una placa blanca. Los selectores van en `:where()` para que el foco y las reglas de cada componente ganen. Una retícula o un bloque sólido nuevo se agrega a esa lista. Los formularios: los campos, las listas y los botones ya reciben su contorno; el selector de cantidad pierde los filetes de su fondo azul y quedan los contornos de sus tres casillas; las filas con casilla muestran la casilla nativa del sistema en lugar del cuadro dibujado; la barra de error toma `CanvasText` y lo apagado `GrayText`; un control sin borde propio recibe relleno a los lados para que el texto no toque su contorno, y el contorno de un botón de texto se separa de sus letras. El número de «Cotizar mi lista» lleva su propio contorno.
- **Movimiento reducido:** toda transición y animación dura 0.01 ms y el desplazamiento es inmediato.
- **Impresión:** se ocultan el aviso de arriba, la barra fija, los botones del encabezado y «Saltar al contenido»; el encabezado deja de ser fijo.

### 11.6 Contraste

Pares de texto y fondo usados en el sitio, medidos en la revisión final en ambos modos (1440, 768 y 390 px, en reposo, con paneles abiertos y al pasar el puntero) y comprobados contra las variables de `tokens.css`. Razones según WCAG, redondeadas hacia abajo; texto grande es 24 px o más, o 18.66 px o más con peso 700.

| # | Texto | Fondo | Razón | Tamaño menor visto | Dónde (ejemplos) | Resultado |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `#19171A` tinta | `#FFFFFF` | 17.81:1 | normal 10.5 px y grande | texto, navegación, H1, conteos, nombres, códigos | cumple |
| 2 | `#FFFFFF` | `#19171A` | 17.81:1 | normal 10.5 px | «Saltar al contenido», avisos de arriba, «Ejemplo», Buscar y Menú abiertos | cumple |
| 3 | `#19171A` | `#F3F8FC` | 16.66:1 | normal 10.5 px y grande 19 px | filas del panel «Categorías» y del menú, filas al pasar, mosaicos | cumple |
| 4 | `#19171A` | `#E6F0F7` | 15.41:1 | normal 16 px | botones blancos de la banda azul al pasar | cumple |
| 5 | `#46464C` gris 700 | `#FFFFFF` | 9.37:1 | normal 13 px | datos de tarjeta, pie, notas, horario, textos de entrada y registro | cumple |
| 6 | `#46464C` | `#F3F8FC` | 8.76:1 | normal 14 px | líneas del registro al pasar | cumple |
| 7 | `#FFFFFF` | `#00548F` azul 700 | 7.88:1 | normal 16 px | acciones principales al pasar, «Buscar» del catálogo, «Cotizar mi lista» | cumple |
| 8 | `#5A5B62` gris 600 | `#FFFFFF` | 6.75:1 | normal 11.5 px | textos de ayuda de los dos campos, claves de `ContactData`, números de registro y mosaico | cumple |
| 9 | `#5A5B62` | `#F3F8FC` | 6.32:1 | normal 11.5 px | números en filas al pasar, conteos de la barra lateral al pasar | cumple |
| 10 | `#FFFFFF` | `#0067B0` azul | 5.88:1 | normal 15 px | «Buscar» del catálogo, texto de la banda, «Cotizar mi lista», WhatsApp de la barra fija, acciones principales | cumple |
| 11 | `#FFFFFF` | `#0067B0` | 5.88:1 | grande 20 px | títulos de banda, monograma | cumple |
| 12 | `#0067B0` | `#FFFFFF` | 5.88:1 | normal 10.5 px | enlaces de la ruta, «Ver todas las marcas», categoría de la ficha, antetítulos, títulos del pie | cumple |
| 13 | `#0067B0` | `#FFFFFF` | 5.88:1 | grande 28 px | números de pasos y de registros, número de la 404, lema del pie | cumple |
| 14 | `#0067B0` | `#F3F8FC` | 5.50:1 | normal 12.5 px | antetítulo de la celda ancha, «Ver menos marcas» al pasar | cumple |
| 15 | `#19171A` | `#F3F8FC` | 16.66:1 | grande 19 px | nombres de mosaico, filas H3 del menú | cumple |
| 16 | `#0067B0` | `#E6F0F7` | 5.09:1 | normal 12.5 px | antetítulo de la celda ancha al pasar | cumple |
| 17 | `#C9CACE` gris 300 | `#FFFFFF` | 1.63:1 | normal 12.5 px | diagonales de la ruta (ocultas a los lectores de pantalla) | exento (decoración) |

**Anillo de foco** contra el color sobre el que se dibuja (contraste de elementos que no son texto, WCAG 1.4.11):

| Anillo | Sobre | Razón | Lo usan |
| --- | --- | --- | --- |
| `#19171A` | `#FFFFFF` | 17.81:1 | logotipo, Buscar y Menú, ruta, los dos campos de búsqueda, barra lateral, acciones de la ficha, enlaces del pie |
| `#19171A` | `#F3F8FC` | 16.66:1 | mosaicos, celdas del panel |
| `#FFFFFF` | `#19171A` | 17.81:1 | «Saltar al contenido» |
| `#FFFFFF` | `#0067B0` | 5.88:1 | botones dentro de la banda azul, WhatsApp de la barra fija |
| `#19171A` | `#0067B0` | 3.02:1 | anillo dentro de celdas azules: «Buscar» del catálogo, «Cotizar mi lista» y WhatsApp del encabezado, acciones principales, «Ver todas las marcas». Cumple casi sin margen; si además el puntero está encima (`#00548F`), baja a 2.26:1. |

Otros pares que no son texto: filetes, bordes de campo, iconos y barras de ubicación actual son `#0067B0` sobre blanco (5.88:1); la barra de ubicación del panel «Categorías», `#0067B0` sobre `#F3F8FC` (5.50:1); la del bloque «Cotizar mi lista», blanco sobre `#0067B0` (5.88:1). Decorativos: flechas de las celdas de marca, `#99C2DF` sobre blanco (1.88:1); filetes suaves, `#C8DFEE` sobre blanco (1.37:1); el rayado de la imagen de producto. Del paso 2: el texto de un control apagado (`aria-disabled="true"`) es el gris 600 sobre blanco (par 8), y su filete azul claro (`#99C2DF`, 1.88:1) es el de un control inactivo, que WCAG exime; el número de «Cotizar mi lista» es blanco sobre azul o azul sobre blanco (5.88:1), y el cuadro de una casilla, su filete y la casilla marcada son `#0067B0` sobre blanco (5.88:1). Estos pares no se midieron con la tabla de arriba: salen de las variables.

## 12. Navegadores compatibles

Declaración propuesta, a partir de las tablas de compatibilidad de las propiedades que usa la hoja compilada: **Safari e iOS 16 o posterior, Chrome y Edge 117 o posterior, Firefox 110 o posterior.** El piso lo ponen dos propiedades: `grid-template-columns: subgrid` de `pages/catalogo.css` (Chrome y Edge 117, Firefox 71, Safari 16) y las consultas de contenedor de la letra agrandada (`container` y `@container`, 11.4), con la sintaxis de rangos y `calc()` con `rem` en la condición (Chrome y Edge 105, Firefox 110, Safari e iOS 16). Otras propiedades necesarias (`:focus-visible`, `overflow-wrap: anywhere`, `aspect-ratio`, `:where()`, `gap` en flex, `:placeholder-shown`, y `overflow: clip` de la fila de acciones de las tarjetas: Chrome 90, Firefox 81, Safari 16) piden versiones menores; `inset` se escribe en la hoja compilada como `top`, `right`, `bottom` y `left`. `100dvh` (Chrome 108, Firefox 101, Safari 15.4) tiene un respaldo en `vh`. `text-wrap: balance` y `pretty`, los colores forzados y `ResizeObserver` (alto real del encabezado y de la barra fija, texto de ayuda en dos líneas) son mejoras: sin ellos la página sigue funcionando. No se usan `@layer`, `color-mix` ni anidamiento nativo. `:has()` (Firefox 121) se usa solo como mejora, dentro de `@supports selector(:has(*))`, en los campos de formulario: la barra de error y, en la casilla entera, el anillo de foco y el tinte al pasar. Donde no lo hay, la página pone la clase `field--invalid` en el campo para la barra de error y el control conserva su anillo de siempre, así que no sube el piso; un uso nuevo de `:has()` sigue la misma forma, con su respaldo. Con la misma idea van en `@supports` `field-sizing: content` (el área de texto crece con lo que se escribe; sin él, el visitante la estira) y `hyphenate-limit-chars` (guion solo en palabras de ocho letras o más en el nombre de una tarjeta con la letra agrandada). «Copiar solicitud» usa el portapapeles del navegador y, si falta o falla, la forma antigua; si las dos fallan, lo dice y pide copiar el texto a mano. Las revisiones en navegador se hicieron en Chromium; estas versiones deben confirmarse antes de publicar.

**Lo que pierde un navegador anterior.** Uno sin consultas de contenedor (por ejemplo, Firefox 101 a 109, que tiene todo lo demás) ignora `container` y `@container`: con la letra normal la página se ve igual, y con la letra agrandada se comporta como antes de esos ajustes: algunas etiquetas pueden salir de su control y la página puede desplazarse a los lados. Lo que pierde uno por debajo de las otras versiones no se ha revisado.

**Contención en otros motores.** Declarar un contenedor (`container-type` o `container`) aplicaba además contención de diseño y de estilo en Chrome hasta la versión 128, y en octubre de 2024 Firefox y Safari todavía la aplicaban. Con la contención de diseño, el elemento pasa a ser el bloque contenedor de sus descendientes con posición absoluta o fija, un contexto de apilamiento y un contexto de formato independiente. Lo que hace el código: la barra fija (`.dock`) es hermana de `.sheet`, no está dentro de ella; nada dentro de `.sheet` ni de `.item-register` tiene `position: fixed`; el encabezado es `position: sticky` dentro de `.sheet`, y una posición `sticky` no depende del bloque contenedor de un elemento fijo; y `.sheet`, `.dock` y `.item-register` ya son retículas, así que ya eran contextos de formato independientes. La contención se emuló en Chromium (`contain: layout` agregado a `.sheet`, `.item-register` y `.dock` en una copia de las dos compilaciones), y se comparó con la compilación tal como está: la caja de cada elemento, las cajas fijas y pegajosas en tres posiciones de desplazamiento y qué elemento queda encima en una rejilla de puntos, en una página de cada tipo, a diez anchos de 320 a 1440 px, con los paneles del encabezado cerrados y abiertos, con la letra al 100 % y al 200 %, en las dos compilaciones (860 estados). Ninguna caja se movió, tampoco la barra fija ni el encabezado. Cambió qué elemento queda encima en unos pocos puntos donde dos cajas se tocan o se contienen (un dibujo SVG y su trazo, dos textos del pie, un enlace y su texto) o donde el menú se midió a mitad de su animación de apertura; y a 320 px con la letra al 200 % la página dejó de desplazarse a los lados: lo que sobresale a ese tamaño (de 6 a 33 px, un límite anotado en `ESTADO.md`, sección 10) sigue en su lugar, pero no se alcanza desplazando la página. No se probó en Firefox ni en Safari.

**Destino de la hoja compilada.** `astro.config.mjs` fija `vite.build.cssTarget` en `chrome90`, `edge90`, `firefox90`, `safari14` e `ios14`. Sin ese ajuste, Lightning CSS (el procesador de CSS de la compilación) conserva el anidamiento y escribe las consultas como rangos (`width<=1099px`), que los navegadores anteriores a Safari 16.4 no entienden. Con él, la hoja compilada sale con `max-width` y `min-width` clásicos. No se quita aunque la declaración de navegadores suba. Las consultas de contenedor sí conservan la sintaxis de rangos (`@container lamina (width<calc(400rem - 6400px))`), que entiende todo navegador que tiene consultas de contenedor; Lightning CSS simplifica `calc((1rem - 16px) * 400)` a `calc(400rem - 6400px)`, el mismo valor.

## 13. Producción y vista previa

Desde el paso 3 producción tiene categorías y productos aprobados, así que las dos compilaciones dibujan las mismas páginas con los mismos componentes; la vista previa agrega los ejemplos.

| | Producción (`npm run build`) | Vista previa (`npm run build:preview`) |
| --- | --- | --- |
| Aviso arriba | «Sitio en preparación · Versión inicial para revisión» en todas las páginas | `PREVIEW_NOTICE` en todas las páginas |
| Navegación | Catálogo, «Categorías» con su panel, Marcas, Contacto y el bloque «Cotizar mi lista» | la misma |
| Búsqueda en el encabezado | campo en computadora, botón Buscar en tableta y celular | la misma |
| Portada | todas las secciones, con las categorías y los productos aprobados | además, los ejemplos entre los productos |
| Pie | con la columna de categorías | con la columna de categorías |
| Páginas de categoría y de producto | las de las categorías y las fichas aprobadas (hoy, diez y 46) | además, los dieciséis ejemplos y el ejemplo retirado |
| Filtros del catálogo y «Agregar a mi cotización» | con JavaScript | con JavaScript |
| «Cotizar mi lista» con JavaScript | «Mi cotización», «Completa tu solicitud» y el mensaje | lo mismo |
| Etiqueta «Ejemplo» | nunca | en cada ejemplo |

Con un catálogo sin categorías ni fichas aprobadas, como estuvo producción hasta el paso 3, nada de eso se imprime: el encabezado no lleva «Categorías» ni la búsqueda, la portada y `/catalogo/` dicen «Estamos preparando el catálogo», no hay filtros ni fichas y «Cotizar mi lista» muestra «Escribe tu lista» (sección 8, «Catálogo vacío»). La entrada «Categorías», la placa y las secciones de categorías aparecen con la primera categoría aprobada; la búsqueda del encabezado y las secciones de productos, con el primer producto aprobado. Qué cambia exactamente: [`datos-y-modos.md`](datos-y-modos.md#93-cómo-aprobar-una-categoría).

## 14. Reglas

- **Logotipo.** Siempre `logo.svg` sobre blanco, con `width` y `height` explícitos y `alt="Sercom Active"`; ancho mínimo 120 px; aire libre alrededor. Nunca se recolorea, estira, recorta, gira, delinea ni se usa como decoración.
- **Colores.** Solo los de la sección 2. Nada del azul marino `#0E2A3D` ni del celeste `#00A6E5` del plan anterior, ni tema oscuro (el escáner lo detecta, R-RULE-29).
- **Tipografía.** Títulos con peso 700 y ancho 96 %; nunca más de 104 %. El ancho 110 % es solo para etiquetas. Sin cursivas: el énfasis es peso. Sin flechas ni palomitas tecleadas: salen del kit de iconos.
- **Iconos.** Solo los del kit, mediante `Icon`. Los glifos de redes sociales del kit no se usan mientras la empresa no confirme perfiles. Nunca logotipos de otras marcas.
- **Ningún control que no haga nada.** Todo lo visible funciona, y lo que corresponde a un paso posterior (por ejemplo, los filtros por talla o material, paso 3) no se dibuja. Lo que solo funciona con JavaScript lleva `js-only` y su alternativa estática `no-js-only`; sin JavaScript todo sigue siendo usable. El verificador de marcado revisa que cada control tenga una función (R-RULE-30a); que haga algo útil se revisa en el navegador.
- **Contacto.** Abrir WhatsApp o el correo nunca va seguido de un mensaje de confirmación: el sitio no sabe si el mensaje se envió. «Copiar solicitud» sí dice «Solicitud copiada…», porque la copia sí ocurrió en el navegador. Los enlaces salen de `contactLinks`; los datos visibles, de `contactDetails`.
- **Textos.** Se toman del plan y de la maqueta aprobada; todos son borradores pendientes de aprobación del contacto comercial. No se inventan afirmaciones, cifras, direcciones, normas ni testimonios. El sitio no se presenta como oficial, autorizado, distribuidor ni sucursal; no nombra la marca excluida; no muestra precios, existencias, envíos, carrito, dirección física ni mapa. Los enlaces de una marca se llaman «Catálogo del fabricante (PDF)», «Catálogo en línea del fabricante» y «Sitio del fabricante».
- **Ejemplos.** Cada producto de ejemplo lleva `Tag` con `EXAMPLE_TAG`, en tarjetas y en su página.

## 15. Comprobaciones

- `npm run check`, `npm test` y `npm run verify` (compila ambos modos y ejecuta el escáner de reglas, el verificador de enlaces y el de marcado). Desde el 23 de noviembre de 2026, la batería completa y `npm run verify` corren en GitHub; en la computadora, `npm run check`, los archivos de prueba de lo que cambió y las compilaciones que haga falta para revisar en el navegador ([`AGENTS.md`](../AGENTS.md)).
- Revisión en navegador de ambas compilaciones a 1440, 1280, 768, 390 y 360 px como mínimo: ningún desbordamiento horizontal, teclado, sin JavaScript, texto espaciado y colores forzados. Para servirlas: `npm run preview` sirve `dist/` y `npx astro preview --outDir dist-preview` sirve `dist-preview/`, pero Astro solo deja correr un servidor de `astro preview` a la vez; para tener los dos, el segundo se arranca en primer plano con `--ignore-lock` y otro puerto, y ese segundo se detiene con Ctrl+C en su terminal o terminando su proceso, porque `npx astro preview stop` no lo conoce. Desde una terminal o un script común el servidor queda en primer plano y se detiene con Ctrl+C; solo con `--background`, o cuando Astro detecta que lo ejecuta un agente automatizado, queda en segundo plano y se detiene con `npx astro preview stop` ([`datos-y-modos.md`](datos-y-modos.md#3-los-dos-modos)). También sirve `npm run dev` (vista previa) o `npx astro dev` (producción); el servidor de desarrollo también corre uno a la vez (para los dos, el segundo con `--ignore-lock` y otro puerto), y puede correr junto a uno de `astro preview`.
- Letra agrandada (11.4): en la consola del navegador, `document.documentElement.style.fontSize = '200%'` reproduce lo que se midió, y lo mismo con `'125%'` y `'150%'` (`''` vuelve al tamaño normal; recargar la página también). Se revisa cada tipo de página de las dos compilaciones a 1440, 1280, 768, 390 y 360 px, y además a 320 px con 125 y 150 %, con los paneles del encabezado cerrados y abiertos: la página no se desplaza a los lados, ningún elemento visible queda en parte fuera de la pantalla, ningún texto sale de su enlace, botón, resumen, campo o etiqueta ni queda cortado por una celda vecina, y en el celular la última línea del pie queda visible sobre la barra fija. Con la letra normal nada cambia.
- Accesibilidad con axe (WCAG 2.1 A y AA): cero infracciones, también con los paneles abiertos.
- Los estados del paso 2 (sección 16), en la vista previa y, donde aplica, en producción, a los mismos anchos, con la letra agrandada y con el teclado: el catálogo con un filtro, con búsqueda y filtro, y en cada versión del estado sin resultados; la ficha con «Agregar a mi cotización» y su error de cantidad; «Cotizar mi lista» vacía, con pocos renglones, con una lista que todavía cabe en un enlace (12 de los productos de ejemplo) y con una que ya no cabe (13 o más), con renglones iguales, con un producto retirado y con renglones que la página no ubica, con el almacenamiento bloqueado o lleno y con la lista cambiada en otra pestaña; con una cantidad no válida en un renglón, varios clics seguidos en «+» de un renglón de más abajo y, después, un clic en el control de al lado y otro en el renglón siguiente (cada uno debe caer donde se ve), y un doble clic en «Quitar», «Unirlos», «Vaciar cotización», «Deshacer» y «Quitarlo de mi cotización» (también con el doble clic del sistema en su ajuste más lento, y con el botón de en medio); la solicitud especial que llega desde una búsqueda y con un mensaje largo. Una lista guardada se prepara desde la consola escribiendo en `localStorage` la clave `cotizacion:v1` con el formato de [`datos-y-modos.md`](datos-y-modos.md#10-la-lista-guardada-en-el-navegador) y recargando la página; el almacenamiento bloqueado se prueba con el bloqueo de datos del sitio del navegador. En cada uno: el foco después de cada acción, lo que dice la región viva (una vez, y nunca una confirmación de envío), los enlaces de WhatsApp y de correo de toda la página, y que nada se desborde.
- Cómo se repite cada revisión, con la consola del navegador y sin otras herramientas:
  - *El ancho* es el del área de la página, sin la barra de desplazamiento: `document.documentElement.clientWidth` debe dar el ancho de la lista. En una ventana de computadora con una barra de desplazamiento que ocupa lugar, el área es más angosta que la ventana (en Chrome sin pantalla, 360 px de ventana dejan 345 px de área), y por debajo de 360 px de área la letra al 200 % ya es un límite aceptado ([`ESTADO.md`](ESTADO.md#10-límites-conocidos)): se agranda la ventana hasta que `clientWidth` dé el ancho, o se usa un modo de dispositivo cuyas barras no ocupen lugar.
  - *Desplazamiento lateral:* `document.documentElement.scrollWidth - document.documentElement.clientWidth` da 0.
  - *Elementos fuera de la pantalla:* `[...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.left < 0 || r.right > document.documentElement.clientWidth); })` da una lista vacía. Lo que el sitio esconde a la vista y deja a los lectores de pantalla puede aparecer y no cuenta: por ejemplo, en el celular, el último elemento de una ruta de tres o más, que va dentro de un cuadro recortado de 1 px.
  - *Espaciado de texto de WCAG 1.4.12:* `document.head.insertAdjacentHTML('beforeend', '<style>*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-bottom:2em!important}</style>')` aplica los cuatro valores del criterio; recargar la página los quita. Es lo que usaron los barridos de la sección 4.2 de `ESTADO.md`.
  - *Sin JavaScript* y *colores forzados:* las herramientas de desarrollo de Chromium permiten desactivar JavaScript y emular `forced-colors: active` (en Windows, también un tema de contraste). Sin JavaScript se recarga la página; con colores forzados, `matchMedia('(forced-colors: active)').matches` da `true` mientras la emulación está activa.
- El repositorio no incluye axe ni pruebas con navegador (sus únicas dependencias son Astro, sharp, `@astrojs/check` y TypeScript, y una prueba impide agregar otras sin cambiarla). Estas revisiones se hacen a mano, en un navegador, con una herramienta que ejecute axe (por ejemplo, su extensión para el navegador) y las herramientas del navegador para el ancho, el espaciado de texto, la letra agrandada y los colores forzados; el resultado se anota en `docs/ESTADO.md`.
- Las comprobaciones no sustituyen leer la página: textos, alineación con la retícula y estados vacíos.

## 16. Formularios y estados del paso 2

El paso 2 agrega la base de los formularios y tres lugares que la usan: los filtros del catálogo, «Agregar a mi cotización» en la ficha y las dos páginas que arman un mensaje. Todo es mejora progresiva: sin JavaScript nada de esto se ve (`js-only`) y cada página es la del paso 1 (`no-js-only`). Las decisiones y sus motivos están en [`ESTADO.md`](ESTADO.md) (2.2); el almacenamiento, en [`datos-y-modos.md`](datos-y-modos.md#10-la-lista-guardada-en-el-navegador).

### 16.1 La base de los formularios

Estilos en `components.css` (4.18); componentes en la sección 6.

- **Un campo es una celda.** `Field` es una celda blanca de la lámina: etiqueta pequeña arriba, el control a todo lo ancho sin borde propio, el texto de ayuda y el contenedor del error. Dentro de una celda más ancha, `framed` le da su propio filete (sección 3). Dos controles lado a lado en una celda (cantidad y unidad) van en `.field-group` y se apilan solos cuando no caben.
- **Letra y alto.** Los controles nunca usan letra de menos de 16 px (iOS agrandaría la página al enfocarlos) y miden al menos 44 px de alto en todo ancho.
- **Texto de ayuda real.** Las instrucciones van en el texto de ayuda (`{for}-ayuda`, enlazado con `aria-describedby`), nunca en el `placeholder`.
- **Error.** Sin colores de estado: un error se marca con texto en tinta, un icono y una barra de tinta de 3 px en el borde izquierdo del campo. El script escribe la frase en `[data-field-error]`, muestra el contenedor, pone `aria-invalid="true"`, agrega `{for}-error` a `aria-describedby` (solo mientras se ve) y lleva el foco al control. En la ficha nada se valida mientras se escribe: el error aparece al pulsar «Agregar a mi cotización». En un renglón de «Mi cotización» aparece mientras se escribe una cantidad no válida (un campo vacío no lo muestra) y, al salir del campo, vuelve la última cantidad válida (16.8). En los dos casos el error se va en cuanto el valor es válido. Cuando el error se quita porque el foco salió del campo con el puntero oprimiendo otro control, la línea deja de verse y de describir al campo, pero conserva su lugar (clase `field__error--unseen`) mientras el puntero oprime y, después, mientras siga a la altura de la línea o más abajo: si se quitara antes, lo que está debajo subiría y el clic, o el clic siguiente, caería en otro lado (16.8).
- **Foco.** Donde el navegador tiene `:has()`, el anillo se dibuja en la casilla entera del campo; donde no, en el control (sección 12).
- **Selector de cantidad.** `Stepper`: [−] [número] [+]. Acepta una cantidad entera de 1 a 99,999, escrita con o sin coma de miles (`parseQuantity` de `src/lib/quote-list.mjs` es la única regla de cantidad del sitio). En el mínimo, «Disminuir» lleva `aria-disabled="true"`: sigue en el orden del teclado, se ve apagado y no hace nada (lo mismo «Aumentar» en el máximo). Sin JavaScript queda el campo de texto.
- **Botones que no son enlaces.** `Button` y `ActionRow` con `type`, y el botón de texto `.text-btn`. El botón de pliegue `.disclosure` abre y cierra la lista que nombra su `aria-controls` y dice su estado con `aria-expanded`.
- **Línea de estado y región viva.** `StatusLine` es la fila visible: icono, frase y, si hace falta, una acción («Ver mi cotización», «Deshacer», «Unirlos»). No lleva `role`. Junto a ella, la página imprime una región siempre presente y oculta a la vista, `<p class="vh" role="status" data-live></p>`, donde el script escribe la misma frase. Nunca `role="alert"` ni foco para una confirmación; una fila que recibe el foco (después de quitar un renglón) no repite su frase en la región. La región no se queda con una frase que dejó de ser cierta: la de la copia se borra cuando el mensaje cambia, la del mensaje largo cuando vuelve a caber, y la de «no se guardó» cuando la lista se vuelve a guardar.

### 16.2 Filtros del catálogo

`CatalogFilters`, atendido por el script de `CatalogSearch` (sección 10). Dos grupos, «Categorías» y «Marcas», de filas con casilla (`CheckRow`), cada opción con su número de productos según la búsqueda y los demás filtros. El nombre accesible de cada casilla es el de la fila («Protección de manos, 12 productos»), como en la barra lateral. Desde 1100 px, los grupos abiertos en la celda de la barra lateral y «Limpiar filtros» arriba, solo mientras hay algo marcado; en tableta y celular, los títulos de los grupos son filas plegables sobre las tarjetas, cerradas al cargar, con «(2 seleccionadas)» cuando tienen opciones marcadas, y «Limpiar filtros» va después. El orden del teclado es el de la pantalla en cada ancho.

### 16.3 «Agregar a mi cotización» (ficha)

`QuoteAdd`, en la ficha de un producto público, bajo «Cotizar este producto» y «Cotizar por correo» y antes del aviso de disponibilidad; nunca en la de un retirado ni en las tarjetas. Una columna de celdas:

- «Variante», solo si el producto tiene más de una: «Talla o color por definir» (elegida al cargar) y una opción por variante. Con una sola variante no hay control y se guarda esa.
- «Cantidad» (`Stepper`) y «Unidad» (la unidad de venta del producto, elegida, y después pieza, par, caja y paquete), en una celda.
- Una nota que dice que lo elegido también va en los dos enlaces de arriba: cada línea de su mensaje («Variante (talla o color)», «Cantidad y unidad») se completa solo después de que el visitante cambió ese campo.
- «Agregar a mi cotización» (`ActionRow` de envío; no es la acción principal de la página) y la línea de estado: «Agregado a tu cotización: 12 pares, Talla 8.» con «Ver mi cotización», más «Con lo que ya tenías son …» si se sumó a un renglón igual; o, sin enlace, el aviso de la lista llena o de que el navegador no deja guardar.

El foco y los campos se quedan como estaban: se puede agregar otra talla enseguida. Con una cantidad no válida, el error del campo y nada se agrega. El mismo renglón enviado otra vez a menos de medio segundo (doble clic, Enter sostenido) no se agrega dos veces. La línea de estado se quita, también de la región viva, cuando deja de ser cierta: siempre en una página que el navegador restaura de su caché y cuando después se envía una cantidad no válida. Cuando la lista cambia en otra pestaña se va solo la frase que dejó de ser cierta (`addStatusStands` en `src/lib/quote-list.mjs`): «Agregado…» siempre; el aviso de la lista llena, cuando la lista deja de estar llena; el de que el navegador no deja guardar se queda. Si el foco estaba en «Ver mi cotización», pasa a «Agregar a mi cotización».

### 16.4 «Cotizar mi lista»

Con JavaScript, de arriba abajo:

- **Título** con una fila de acción que lleva dentro de la página: «Revisar y enviar mi lista» (con productos en la compilación) o «Escribir mi lista» (sin ellos).
- **«Mi cotización».** Un renglón por producto guardado, construido desde un `<template>` (sin ningún script dentro): la etiqueta «Ejemplo» en la vista previa, el nombre como enlace a su ficha, marca y código, «Quitar», y los campos «Variante», «Cantidad» y «Unidad». Cada control lleva en su nombre accesible el producto («Cantidad de {nombre}», «Quitar {nombre}», «Unirlos: {nombre}») y, si el producto tiene más de una variante, la del renglón: «Quitar Guante recubierto, Talla 8», o «…, talla o color por definir» si no se eligió ninguna (`rowControlNames` en `src/lib/quote-list.mjs`). Así el mismo producto en dos tallas no repite nombres; la lista «Variante» lleva solo el producto, porque su valor ya es la variante. Si dos renglones solo difieren en la unidad (el mismo guante y la misma talla en pares y en cajas), «Quitar», la cantidad y «Unirlos» dicen también la unidad («Quitar Guante recubierto, Talla 8, caja»), y la lista «Variante», el producto y la unidad; la lista «Unidad» nunca la dice, porque su valor ya es la unidad. Los nombres se revisan después de cada cambio de la lista. Dos renglones del mismo producto, con la misma variante y la misma unidad, se llaman igual: a esos la página los marca como iguales y ofrece unirlos si su suma cabe (16.8, «Renglones iguales»). También se llaman igual dos renglones del mismo producto retirado (un renglón retirado lleva solo el nombre del producto, y los dos se ven iguales; [`ESTADO.md`](ESTADO.md#10-límites-conocidos)). Dos productos distintos nunca comparten nombre, ni dos variantes de un producto su etiqueta: el validador lo rechaza en cualquier estado ([`catalogo-y-actualizaciones.md`](catalogo-y-actualizaciones.md#2-campos-de-una-ficha-y-lo-que-exige-el-validador)). Después, «Seguir agregando productos» y «Vaciar cotización».
- **«Completa tu solicitud»** («Escribe tu lista» sin productos): «Otros productos o tu lista escrita» (o «Tu lista escrita»), «Lugar de entrega» y «Fecha requerida». Lo que se escribe se guarda solo en esa pestaña.
- **«Revisa y envía».** `MessageActions` y el borrador «Así queda tu mensaje», siempre al día; las notas, una de ellas sobre lo que se guarda en ese navegador, y el enlace «Privacidad».
- **«Atención con …»**, cuyos enlaces llevan el mensaje de la página.

Cada cambio en un renglón se guarda en el momento; quitar, vaciar y unir se pueden deshacer desde la línea de estado que queda en el lugar del renglón. Cuando otra pestaña cambia la lista, o el navegador restaura la página desde su caché, la lista se vuelve a dibujar con lo guardado. Si el control que tenía el foco se fue, el foco pasa al mismo control del renglón que quedó en su lugar (si es del mismo producto), al título «Mi cotización» o, si la sección entera se oculta, al título de la sección de los campos. Solo un cambio que llega de otra pestaña se dice en la región viva: «Tu cotización cambió en otra pestaña.»; si ese cambio además deja el mensaje sin caber en un enlace, la región dice esa frase y el aviso de la lista larga juntos, porque dos frases seguidas se borrarían una a la otra.

«Quitar», «Unirlos», «Vaciar cotización», «Deshacer» y «Quitarlo de mi cotización» cambian la lista de lugar, y lo que queda bajo el puntero ya es otra cosa: el enlace de otro producto, «Deshacer», la cantidad de otro renglón. Por eso, durante medio segundo después de uno de esos clics, otro clic en el mismo punto (a 24 px o menos; `isRepeatedPress` en `src/lib/quote-list.mjs`) no activa nada ni mueve el foco: es el segundo clic de un doble clic. Vale para cualquier botón del ratón: el de en medio abriría en otra pestaña el enlace que quedó debajo. Se decide al oprimir: si el puntero oprimió dentro de ese medio segundo, su clic tampoco cuenta aunque suelte después. Quien tiene el doble clic más lento en su sistema da el segundo clic después del medio segundo; el navegador lo cuenta como parte del mismo clic múltiple (`detail` mayor que 1) y, mientras todos los clics desde el que movió la lista hayan sido repetidos, uno así tampoco cuenta, hasta un segundo después de aquel (`REPEATED_PRESS.chainMs`). El plazo no se alarga más: después de ese segundo, un clic en el mismo punto siempre cuenta. Un clic en otro lugar o después de esas pausas cuenta como siempre, y con el teclado la regla no aplica.

### 16.5 «Solicitud especial»

Con JavaScript, la sección «Qué nos ayuda a encontrarlo» cambia su registro numerado por cinco campos: «Descripción o uso», «Marca o modelo (si lo tienes)», «Cantidad y unidad», «Lugar de entrega» y «Fecha requerida». Debajo, `MessageActions`; al lado, «Así queda tu mensaje». La búsqueda que llega del catálogo (`?q=…`) se escribe en «Descripción o uso», con la nota «Agregamos tu búsqueda “…” al borrador.», que se va en cuanto el campo ya no empieza con ese texto. Nada de lo que se escribe aquí se guarda.

### 16.6 El mensaje y sus enlaces

Lo comparten las dos páginas (`src/lib/message-page.mjs`):

- **Todos los enlaces llevan el mensaje.** Mientras el visitante no cambia nada, cada enlace de WhatsApp y de correo de la página conserva el borrador impreso. En cuanto lo cambia, todos llevan el mensaje que se ve: las acciones de envío, los datos de contacto, la franja, el encabezado, el pie y la barra fija del celular.
- **Mensaje largo.** Si el enlace de WhatsApp o el de correo pasaría del largo máximo (`LINK_LIMITS` en `src/lib/contact-core.mjs`), ningún enlace de la página lleva el texto: abren la aplicación sin texto, las etiquetas cambian («Abrir WhatsApp para pegar mi lista», «Abrir mi correo para pegar mi lista»), «Copiar solicitud» toma el dibujo principal y aparece arriba de las acciones el aviso «Tu lista es larga y no cabe en un enlace. Primero copia tu solicitud; después abre WhatsApp o tu correo y pégala.» (en la solicitud especial, «Tu solicitud es larga y no cabe en un enlace. Primero cópiala; después abre WhatsApp o tu correo y pégala.», y las etiquetas «… para pegar mi solicitud»). Nada se copia sin que el visitante pulse «Copiar solicitud».
- **«Copiar solicitud».** Copia el mensaje y lo dice: «Solicitud copiada. Pégala en WhatsApp o en tu correo.», o, si el navegador no deja copiar, «No pudimos copiarla automáticamente. Selecciona el texto de “Así queda tu mensaje” y cópialo.».
- Abrir WhatsApp o el correo no cambia la página ni dice nada.

### 16.7 El número junto a «Cotizar mi lista»

`QuoteCount` y `QuoteCountScript`, en todas las páginas: en el bloque de la cabecera, la fila del menú de tableta y celular y la barra fija. Muestra la cantidad exacta de renglones guardados («3», «120»; «999+» solo si el máximo de 200 renglones cambiara algún día) y forma parte del nombre del enlace: «Cotizar mi lista, 3 productos». Con la lista vacía, y siempre sin JavaScript, no se ve ni ocupa lugar. Va fuera del flujo y no mueve nada. Su tamaño es una excepción a la escala (sección 2).

### 16.8 Estados

| Estado | Qué se ve |
| --- | --- |
| Lista vacía | En «Mi cotización», `EmptyState` «Aún no agregas productos del catálogo.» con «Explorar catálogo»; los campos y el mensaje siguen ahí (sección 8). |
| Error de cantidad | En la ficha, al pulsar «Agregar a mi cotización» con una cantidad no válida: el error del campo (16.1) y el foco en el campo. En un renglón de «Mi cotización», el error aparece mientras se escribe una cantidad no válida; al salir del campo con una cantidad vacía o no válida vuelve la última válida, y la región viva lo dice («La cantidad volvió a 12 pares.»); esa frase pertenece a su renglón y se borra cuando ese renglón cambia o se va. Si el foco sale porque el puntero oprime otro control, la línea del error conserva su lugar sin verse (16.1), para que ni ese clic ni el siguiente (otro «+», un doble clic, el control de al lado, el renglón de abajo) caigan en otro lado. Al quitarse una línea sube lo que está debajo de ella y nada de lo que está arriba; por eso el puntero solo la quita cuando queda más arriba que ella: al soltar, o al abrirse el menú contextual, se quitan las líneas que están más abajo que el puntero, y al mover el ratón o el lápiz, las que van quedando más abajo; las que están a la altura del puntero o más arriba se quedan. Con el dedo no hay movimiento que avise: las que quedan se quitan con el siguiente toque más arriba que ellas. Todas se quitan cuando la página se desplaza, con una tecla que no sea modificadora ni de bloqueo, cuando la ventana pierde el foco y después de un arrastre. Una tecla sostenida mientras el puntero oprime no cuenta (Ctrl + clic). Si el puntero oprime «Quitar» o «Unirlos» de ese mismo renglón, o «Vaciar cotización», la frase no se dice mientras el renglón esté por irse: se dice al soltar solo si el renglón sigue en la lista. |
| Mensaje largo | 16.6. |
| Almacenamiento que no se puede usar | Si el navegador no deja guardar la lista: «Tu navegador no permite guardar tu cotización en este equipo. Escribe abajo los productos que necesitas.» Si un cambio no se pudo guardar (almacenamiento lleno o bloqueado después de cargar): «Tu navegador no permitió guardar el cambio. Copia o manda tu solicitud antes de salir de esta página.» La nota de lo que se guarda dice lo que pasa en ese navegador, con cuatro casos: se guardan la lista y los campos; solo los campos («Tu cotización no se guarda en este navegador. Lo que escribes en los campos se borra al cerrar esta pestaña.»); solo la lista; nada. Sigue al último intento de guardar: si el navegador rechaza un cambio de la lista o de los campos, deja de decir que eso se guarda, y lo vuelve a decir cuando un cambio posterior sí se guarda o cuando la página vuelve a mostrar la lista guardada (`storageNoteText` en `src/lib/quote-list.mjs`). En la ficha, la línea de estado dice que no se pudo guardar. |
| Renglones iguales | Dos renglones del mismo producto, la misma variante y la misma unidad (en singular o en plural) no se unen solos: el segundo muestra «Este renglón es igual a otro de tu cotización.» con «Unirlos», que suma las cantidades en el primero y se puede deshacer. Si la suma pasaría de 99,999, el aviso se muestra sin «Unirlos». |
| Renglones que la página no ubica | Un producto que la página no conoce, o una talla o un color que el producto ya no ofrece: un solo renglón al final que dice cuántos son, con «Quitarlo de mi cotización» o «Quitarlos de mi cotización». No van en el mensaje y la página no los borra por su cuenta. |
| Producto retirado | Su renglón dice «Producto retirado: no se incluye en tu mensaje.», con «Quitar». |
| Sin resultados en el catálogo | Las tres versiones de la sección 8. |
