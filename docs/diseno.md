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
| `--blue-300` | `#99C2DF` | flechas tenues de las celdas de marca, filete dentro de la banda azul |
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

El campo «Buscar» (y su botón) solo se imprime si hay productos públicos; la entrada «Categorías», si hay categorías públicas (en producción, hoy ninguno de los dos). Una categoría aprobada sin productos agrega «Categorías», pero no la búsqueda. El botón «Menú» dice «Cerrar» mientras el menú está abierto.

**Paneles.** En tableta y celular, el menú y la búsqueda son paneles que abre su botón (`aria-expanded`). Un panel se cierra con Escape (el foco vuelve a su botón), con un clic fuera o cuando el foco sale del panel y de su botón. El menú abierto mide como máximo el espacio hasta la barra fija y se desplaza por dentro; `keepFocusInMenu()` desplaza el panel (nunca la página) para que el elemento con foco se vea entero. El panel «Categorías» de computadora es un `<details>` nativo que se cierra con Escape, con un clic fuera o al salir el foco; lleva seis categorías por fila y, con la letra agrandada, dos por fila con «Ver todo el catálogo» a todo lo ancho, como en tableta, cuando la palabra más larga ya no cabe junto a su icono. Sin JavaScript nada queda escondido detrás de un botón. El panel de búsqueda de tableta y celular mide al menos 64 px de alto: el campo y el botón caben en ellos, y cuando el texto de ayuda pasa a dos líneas (abajo) el panel crece con él, sin depender de `:has()`.

**Ubicación actual.** `aria-current="page"` en el enlace a la propia página y `"true"` en su sección: una página de marca marca «Marcas»; una de categoría, «Categorías» (y su categoría lleva `page` en el panel); una ficha, «Catálogo». En `/cotizar/` la llevan la entrada del menú, el bloque «Cotizar mi lista» y el enlace de la barra fija. La portada marca solo el logotipo (`aria-current="page"`, sin dibujo); la solicitud especial, la privacidad y la 404 no marcan nada en el encabezado ni en la barra fija. Se dibuja con un subrayado azul de 4 px en computadora, una barra azul de 4 px a la izquierda en las filas del menú y del panel, una barra blanca de 4 px dentro del bloque «Cotizar mi lista» y una azul abajo en la barra fija.

**El texto del campo de búsqueda.** El campo se llama «Buscar en el catálogo» (etiqueta oculta y texto de ayuda) y envía a `/catalogo/?q=…`. Con el tamaño de letra normal ese texto cabe en una línea en todos los anchos. Con texto espaciado o agrandado puede no caber: entonces el script del encabezado (si existe `ResizeObserver`) agrega `.is-long` a `.masthead__search-field`, cambia el texto de ayuda por un espacio y muestra en su lugar `.masthead__search-hint`, una copia oculta a los lectores de pantalla que ocupa hasta dos líneas dentro de la celda y se oculta en cuanto el campo tiene texto. En computadora la celda conserva el alto de la fila de la cabecera, y desde 1100 px la copia usa un interlineado de 1.25 para que sus dos líneas quepan en ella; en tableta y celular la copia comparte la casilla del campo y el panel crece con ella. La copia no recibe el clic (`pointer-events: none`): en la revisión en navegador con la letra al 200 %, un clic sobre cualquiera de sus dos líneas puso el foco en el campo, en computadora (1100, 1280 y 1440 px) y en el panel de tableta y celular. Sin JavaScript queda el texto de ayuda nativo. Mientras la copia se ve, axe informa dos resultados «incompletos» (`#q`, «Element has no value», y la copia, «partially overlaps other elements»); los dos son límites de la herramienta, y el contraste de la copia es 6.76:1 (el par 8 de la tabla de 11.6, que redondea hacia abajo).

**Texto que crece.** La franja y la cabecera tienen alto mínimo, no fijo, y la franja, sus grupos y la lista de navegación de computadora pueden pasar a otra línea. El encabezado mide su alto real con `ResizeObserver` y lo escribe en `--utility-shift` y `--masthead-shift` en `<html>` (y el de la barra fija del celular en `--dock-space`, 4.4); la posición fija y `scroll-padding-top` usan esos valores, con las alturas de diseño como respaldo. Una hoja de página que coloque algo bajo la cabecera fija debe usar `var(--masthead-shift, var(--masthead-h))`, como la imagen de la ficha en `producto.css`.

**Botones con la letra agrandada** (11.4; con la letra normal no cambian). Buscar y Menú dejan su ancho fijo y crecen con su etiqueta, con 72 px como mínimo en tableta y 64 en el celular, y WhatsApp de tableta hace lo mismo desde 88 px; «Cotizar mi lista» pasa a dos renglones. Cuando la fila ya no tiene lugar para una etiqueta, esa etiqueta queda solo para los lectores de pantalla (sigue siendo el nombre del botón) y el botón muestra su icono: Buscar y Menú en celular y tableta, WhatsApp en computadora.

**Nombres de clase.** La navegación es `.masthead__nav` (`#menu`) con `__nav-list`, `__nav-link`, `__nav-cat` y `__nav-item--quote`; la búsqueda es `.masthead__search` (`#buscador`) con `__search-field`, `__search-input`, `__search-hint` y `__search-btn`. Los bloques genéricos `.nav` y `.search` están retirados: el verificador de marcado (U-07) rechaza cualquier regla que los use. Una página nombra sus bloques con su propio prefijo (por ejemplo `catalog-nav__list`).

### 4.4 Barra fija del celular (Dock)

Solo hasta 699 px: dos enlaces al pie de la pantalla, «Cotizar mi lista» y WhatsApp (borrador general). La página deja al final un espacio del alto de la barra (`padding-bottom` del `body`), para que la última línea del pie quede visible, y `scroll-padding-bottom` deja el elemento con foco por encima de ella. Con la letra agrandada (11.4) cada etiqueta puede pasar a dos renglones y la barra crece: el script del encabezado mide su alto real con `ResizeObserver` y lo escribe en `--dock-space`, que usan esos dos espacios. Sin JavaScript se usa un respaldo que alcanza para etiquetas de dos renglones (`max(57px, 2.25rem + 1px)` más el área segura del dispositivo), nunca menos que los 57 px de la barra con la letra normal. La barra está fuera de la lámina y es su propio contenedor (`container: barra`).

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
7. Ejecutar `npm run check`, `npm test` y `npm run verify`, y revisar la página en el navegador (sección 15).

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
| `Button` | `href?`, `variant?` (`primary`, `inverse` para la banda azul), `block?`, `icon?`, `iconEnd?`, `type?` | Botón sólido. Sin `href` imprime `<button>`: solo si un script le da función. Mide 52 px como mínimo y pasa a dos líneas antes de cortarse. |
| `ActionRow` | `href`, `primary?`, `icon?` (`arrow-right`) | Fila de acción que ocupa una fila de la lámina, con flecha. Columna lateral de `PageHeader`, de la portada y de la ficha. |
| `MoreLink` | `href`, `icon?`, `external?` | Enlace de texto azul con flecha. `external` abre otra pestaña y agrega «(se abre en otra pestaña)» para lectores de pantalla («Sitio del fabricante»). |
| `Note` | `icon?` (`info`), `class?`; texto en el slot | Nota pequeña gris con icono: avisos de disponibilidad. |
| `Tag` | texto en el slot | Etiqueta en mayúsculas sobre tinta. Hoy, solo `EXAMPLE_TAG` en cada ejemplo. |
| `Monogram` | — | Iniciales de la persona de contacto en un cuadro azul (decorativo). |
| `EmailAddress` | — | La dirección de correo de contacto, partible solo después de «@». Va dentro de un enlace `mailto:` que lleva `aria-label` con la dirección (U-11, A-02b). |
| `GridFill` | `cells`, `as?` (`li` o `div`) | Celdas de relleno (sección 3). |

**Estructura de página**

| Componente | Props | Cuándo se usa |
| --- | --- | --- |
| `PageHeader` | `title`, `breadcrumbs?`, `eyebrow?`, `icon?`, `lead?`, `id?` (`titulo`); slot con acciones | Bloque de título de las páginas interiores: 8 columnas con la ruta, el pictograma opcional y el H1; 4 columnas con la entrada y las acciones. Sin `lead` ni slot, el título ocupa las doce columnas. `eyebrow` pone un antetítulo azul en lugar de la ruta; ninguna página lo usa hoy, todas llevan la ruta. |
| `Breadcrumbs` | `items` (`{ label, href? }[]`), `class?` | Ruta de navegación (4.5). La imprime `PageHeader`; la ficha la usa sola. |
| `SectionHead` | `title`, `id`, `level?` (2), `eyebrow?`, `more?` (`{ href, label }`), `aside?`; slot `side` | Cabeza de cada sección. `aside` pone un párrafo en 8 columnas a la derecha («Cómo funciona»); `eyebrow` con `<Monogram slot="side" />` da la variante de contacto. |
| `Band` | `title`, `id`, `text?`, `action` (`{ href, label }`), `icon?` (`zoom-question`), `headingLevel?` (2; con 1 el título toma el tamaño de título de página); slot bajo el texto | Banda azul sólida con botón blanco. |
| `CatalogBand` | — | La banda de solicitud especial al final de los listados y de la página de un retirado. Una por página. |
| `EmptyState` | `icon`, `title`, `text`, `action` (`{ href, label, icon? }`), `headingLevel?` (2 o 3), `class?` | Estado vacío a todo lo ancho: pictograma, dos frases y una sola acción (sección 8). |
| `Steps` | `steps` (`string[]`, al menos uno) | Pasos numerados con flecha. Hasta cuatro en una fila; con más, tres por fila con relleno. Con la letra agrandada, desde 700 px, una palabra larga del paso se parte con guion. |
| `Faq` | `items` (`{ question, answer }[]`), `openFirst?` (`true`), `headingLevel?` (3) | Preguntas frecuentes con `<details>` nativos. En un celular más angosto que 20rem (con la letra agrandada) la pregunta puede partir una palabra con guion para que el signo «+» quede entero. |
| `ItemRegister` | `items` (`{ label, text }[]`), `class?` | Registro numerado: qué enviar en «Cotizar mi lista» y en la solicitud especial. Estilos en `atencion.css`. Desde 700 px, si a la explicación no le quedan 12rem junto a la etiqueta (letra agrandada), pasa debajo de ella, como en el celular. |
| `DraftMessage` | `text`, `id`, `title?` («Así empieza tu mensaje»), `headingLevel?` (3), `class?` | El texto del borrador, una línea por renglón. No es un formulario. `data-draft-text` permite que un script lo reescriba. |
| `ContactData` | `whatsappHref?`, `mailHref?`, `extraRows?` (`{ key, value }[]`), `class?` | Filas WhatsApp, Correo y Horario con los datos de `business.json`; los enlaces abren el borrador general o los que se pasen. `extraRows` agrega filas después; ninguna página las usa hoy. En tableta y computadora la clave va en una columna de 148 px; con la raíz de más de 27 px (cerca de 170 %), la clave va arriba y el valor debajo, como en el celular. Las filas Marca, Código y Unidad de venta de la ficha y del producto retirado son las mismas filas de datos y hacen lo mismo. |
| `EntryCard` | `href`, `icon`, `title`, `kicker`, `text`, `headingLevel?` (3) | Tarjeta de entrada de 4 columnas (las tres entradas de `src/lib/ayuda.ts`). Toda la tarjeta es el enlace. |

En la portada, `/contacto/`, `/cotizar/` y `/solicitud-especial/` el bloque «Atención con …» tiene la misma forma: `SectionHead` con el antetítulo «Atención personal» y el monograma, una celda de 5 columnas a la izquierda y `ContactData` en 7 columnas a la derecha (`contact__data`); en tableta y celular se apilan en ese orden, que es también el del documento. Lo que lleva la celda de la izquierda cambia por página:

- Portada (`contact__intro`): «Cuéntame qué necesita tu empresa…» y el botón «Contactar por WhatsApp» (borrador general).
- `/contacto/` (`contact__intro contacto__intro`): la misma frase y, debajo, la denominación (`locationLabel`); sin acción.
- `/cotizar/` y `/solicitud-especial/` (`atencion__side`, de `atencion.css`, con su propio relleno): «Conoce las categorías y las marcas que manejamos.» y la fila «Explorar catálogo». En estas dos páginas los enlaces de `ContactData` abren el borrador de la página (la lista o la solicitud especial), no el general.

**Catálogo, categorías y marcas**

| Componente | Props | Cuándo se usa |
| --- | --- | --- |
| `CategoryPlate` | `categories`, `special?` (`true`) | Placa de la portada y de la 404: mosaicos con pictograma, número y nombre corto (el nombre accesible es el completo) y la celda ancha de solicitud especial. No se llama sin categorías. Con la letra agrandada, desde 700 px, si la palabra más larga de un nombre no cabe en su mosaico, se parte con guion. |
| `CategoryRegister` | `categories`, `headingLevel?` (2, 3 o 4; 3) | Registro de categorías: número, pictograma, nombre y línea de subcategorías. |
| `BrandCells` | `brands`, `allLink?` (`{ href, label }`, celda azul final), `size?` (`md`; `lg`, celdas de 96 px), `counts?`, `currentId?` | Nombres de marca como texto en celdas, nunca logotipos. `currentId` marca la celda de la página actual (F-9a). Con la letra agrandada, si el nombre más largo ya no cabe en su celda, la mitad de celdas por fila (dos o una). |
| `ProductCard` | `product`, `headingLevel?` (3), `class?` | Tarjeta de un `PublicProduct`: imagen o pictograma de la categoría sobre el rayado, «Ejemplo» si corresponde, categoría, nombre, «marca · código» (el «·» va unido a la marca con un espacio de no separación: V-06), «Ver ficha» y «Cotizar» (borrador de producto por WhatsApp). Las dos acciones se llaman «Ver ficha: {nombre}» y «Cotizar: {nombre}» (A-02c). La fila de acciones es flexible con salto de línea: las dos ocupan mitades iguales y sus etiquetas no se parten; si no caben juntas (texto espaciado o agrandado), «Cotizar» baja a una segunda fila del ancho de la tarjeta. Con la letra agrandada, la etiqueta de «Cotizar» lleva el relleno de la celda y empieza donde la de «Ver ficha», también cuando las dos caben en una fila, así que pasan a dos filas un poco antes; con el espaciado de texto a tamaño normal empieza 4 px más a la izquierda ([`ESTADO.md`](ESTADO.md#10-límites-conocidos)). En el celular y en el catálogo de cuatro columnas (desde 1360 px) se apilan en una sola columna y la etiqueta puede partirse. Con la letra agrandada, la categoría de la tarjeta se parte con guion antes de salirse. |
| `ProductGrid` | `products`, `headingLevel?` | Tarjetas de 3 columnas: cuatro por fila en computadora, dos en tableta y celular. Con la lista vacía no imprime nada. |
| `CatalogListing` | `products`, `categories`, `brands`, `currentCategoryId?`, `currentBrandId?`; slot | Cuerpo de catálogo, categoría y marca: `CatalogNav` (3 columnas) y `CatalogGrid` (9). Solo con productos. El slot recibe el estado sin resultados. |
| `CatalogNav` | `categories`, `brands`, `currentCategoryId?`, `currentBrandId?`, `class?` | Barra lateral de navegación (no son filtros): «Categorías» y «Marcas», plegadas después de la octava marca. En tableta y celular, dos filas plegables cerradas al cargar. |
| `CatalogNavList` | `items` (`{ label, href, count, current }`), `collapseAfter?`, `moreLabel?`, `lessLabel?` | Lista de la barra lateral. La fila actual nunca queda plegada. Una fila con productos se llama «{nombre}, {n productos}». |
| `CatalogGrid` | `products` | Tarjetas del catálogo: cuatro por fila desde 1360, tres a 1280, dos en tableta y celular, con relleno recalculado al filtrar. Cada tarjeta lleva su texto de búsqueda en `data-search`. |
| `CatalogSearch` | `total` | Fila de búsqueda del catálogo (sección 10). En computadora, con la letra agrandada, cuando «Buscar» o la línea de resultados ya no caben, toma el arreglo de tableta: campo en 9 columnas, «Buscar» en 3 y la línea de resultados en una fila propia. |
| `RetiredProduct` | `product`, `category?`, `brand?`, `alternatives`, `pageLink?` | Página informativa de un producto retirado (sección 7). |
| `PageLinkScript` | — | Agrega la línea «Enlace» a los borradores (sección 10). |

**Plantilla:** `SiteNotice`, `SiteHeader`, `SiteFooter` y `Dock` los usa solo `BaseLayout`.

## 7. Páginas

| Ruta | Qué muestra |
| --- | --- |
| `/` | Portada: titular «Equipo de protección y soluciones para tu empresa.» con sus acciones; placa de categorías o, sin categorías, la nota «Estamos preparando el catálogo» y las tres entradas; «¿Cómo podemos ayudarte?» y «Explora nuestras categorías» (solo con categorías); «Marcas que manejamos»; productos (solo si hay); banda de solicitud especial; «Atención con …»; «Cómo funciona»; preguntas frecuentes. |
| `/catalogo/` | Con productos: título, búsqueda, barra lateral y tarjetas. Sin productos: «Estamos preparando el catálogo. Mientras tanto…», acciones, registro de categorías (si hay) y marcas. Termina con la banda de solicitud especial. |
| `/categorias/{id}/` | Título con pictograma y línea de subcategorías; «Marcas en esta categoría» (solo si algún producto tiene marca real; un nombre de marca que no cabe en la fila baja a un segundo renglón dentro de su enlace); listado o estado vacío. |
| `/marcas/` | Las 19 marcas en celdas grandes; bajo cada nombre, su número de productos cuando tiene alguno. |
| `/marcas/{id}/` | Título con «Sitio del fabricante» (si la marca lo tiene) y, solo con productos, «Contactar por WhatsApp»; listado o estado vacío con las demás marcas (la actual marcada). |
| `/productos/{id}/` | Ficha (abajo) o página de un producto retirado. |
| `/cotizar/` | Qué enviar (siete datos), el borrador de la lista, notas y «Atención con …». |
| `/solicitud-especial/` | Banda como título con «Enviar mi solicitud por WhatsApp», la acción por correo, notas, qué nos ayuda a encontrarlo y «Atención con …». |
| `/contacto/` | Persona de contacto, WhatsApp, correo, horario y denominación; sin dirección ni mapa. Entradas de ayuda y preguntas frecuentes. |
| `/privacidad/` | El sitio no tiene formularios ni cookies y no guarda datos; enlace al correo. El texto está pendiente de aprobación. |
| 404 | Antetítulo «Error 404», placa de categorías o las tres entradas. No declara dirección canónica. Con la letra agrandada, si el número «404» no cabe en sus columnas, va en una fila propia sobre el mensaje, como en el celular. |

**Ficha de producto.** Ruta (Inicio / Catálogo / categoría / producto); la hoja en dos partes: imagen en 7 columnas (fotografía contenida o, sin ella, el pictograma de la categoría sobre el rayado; «Ejemplo» en los ejemplos) y, en 5 columnas, categoría, nombre (H1), filas Marca, Código y Unidad de venta, resumen, «Cotizar este producto» (WhatsApp) y «Cotizar por correo», el aviso «Disponibilidad y tiempo de entrega sujetos a confirmación al cotizar.», «Características», «Variantes» y «Documentación». En tableta y celular las dos partes se apilan. Después, la banda «¿Necesitas otra talla, color o presentación?» y hasta cuatro productos de la misma categoría (o del catálogo). Las variantes son información, no controles; si algún código de variante pasa de 14 caracteres, se listan en filas en lugar de celdas. En tableta y celular, con la letra agrandada, una variante larga se parte con guion dentro de su celda. El paso 2 pondrá «Agregar a mi cotización» bajo las dos acciones; hoy no se imprime nada para él.

**Nombres largos de producto.** Un nombre de más de 50 caracteres (`LONG_PRODUCT_NAME` en `src/lib/product-title.mjs`, contados como se leen) lleva `data-long` en el H1 y en la fila de ruta. Desde 1100 px el título baja al tamaño de los títulos de sección, en renglones equilibrados, y la fila de ruta se queda en un renglón: su último elemento, el nombre, toma lo que queda de la fila y se corta con «…» (el H1 lo da entero justo debajo y el lector de pantalla lee el nombre completo); si no le quedan al menos 12em, baja entero al renglón siguiente y ahí se corta, sin salir de su celda. En tableta y celular la acción queda debajo de la imagen de todos modos y nada cambia. El verificador de marcado (V-03) revisa que las dos marcas `data-long` vayan juntas y solo con un nombre largo. En las tarjetas, el nombre se muestra completo y el código pasa entero al renglón siguiente si cabe ahí, o se parte dentro de la tarjeta si no. El nombre más largo de los ejemplos actuales tiene 35 caracteres.

El objetivo de la primera pantalla es la compilación de producción a 1440 × 900, con el aviso de sitio en preparación arriba: con un nombre de hasta 90 caracteres escrito en mayúsculas y minúsculas y un resumen del largo de los de los ejemplos (unos 100 caracteres), «Cotizar este producto» queda entera en la primera pantalla, con 11.6 px de margen medidos. Las pantallas más chicas y la vista previa no son objetivo. Los casos que quedan fuera están en [`ESTADO.md`](ESTADO.md#10-límites-conocidos), y la medición con los nombres y resúmenes reales es trabajo del paso 3.

**Producto retirado.** Misma dirección que tuvo la ficha. La hoja conserva la división: en 7 columnas solo el pictograma de la categoría (o el genérico), nunca una fotografía; en 5 columnas la categoría pública, el nombre (H1), las filas Marca y Código, el aviso «Producto retirado» (etiqueta con cuadro sólido, «Este producto ya no forma parte del catálogo.» y «Dinos qué necesitas y revisamos alternativas.») y las acciones «Consultar alternativas» (WhatsApp) y «Consultar por correo». Después, la banda de solicitud especial y «Más productos…». Nunca muestra acciones de cotizar ni de pedir la ficha, unidad de venta, resumen, características, variantes, documentación, aviso de disponibilidad ni la banda de ayuda de la ficha. Su título es «{nombre} (producto retirado) · Sercom Active». Los datos y el procedimiento están en [`catalogo-y-actualizaciones.md`](catalogo-y-actualizaciones.md#5-producto-retirado).

## 8. Estados

Todo lo que depende del catálogo se decide con los datos (`categories.length`, `products.length`, campos vacíos), nunca con un interruptor escrito a mano. Una página nueva que muestre categorías o productos contempla la lista vacía.

| Estado | Qué se ve |
| --- | --- |
| Búsqueda sin resultados | `EmptyState` «No encontramos productos con esa búsqueda.» / «Puedes pedirnos este producto y lo buscamos por ti.» con «Solicitar este producto», que lleva la búsqueda a la solicitud especial (`?q=…`). |
| Catálogo vacío (producción hoy) | Portada sin placa ni secciones de categorías y productos, con «Estamos preparando el catálogo» y las tres entradas; `/catalogo/` con su texto de preparación, acciones y marcas; sin búsqueda ni «Categorías» en el encabezado; pie sin columna de categorías. |
| Categoría sin productos | `EmptyState` «Estamos cargando los productos de esta categoría.» con «Contactar por WhatsApp» (borrador de la categoría), sin barra lateral. |
| Marca sin productos | `EmptyState` «Estamos cargando los productos de esta marca.», las demás marcas con la actual marcada y una nota. |
| Documento no disponible | «Documentación» ofrece «Solicitar ficha técnica» por WhatsApp; nunca una descarga muerta. |
| Dato no confirmado | Se omite: una ficha sin unidad de venta, resumen, características o variantes no imprime ese bloque; una marca sin enlace no muestra «Sitio del fabricante»; la dirección no se publica. |
| Producto retirado | Página informativa (sección 7). |
| Lista vacía | `/cotizar/` explica qué enviar y abre un borrador; la lista que se arma en el sitio llega en el paso 2. |

## 9. Hojas de página

1. Las reglas de una página van en `src/styles/pages/<pagina>.css` y se importan en el encabezado de la página **después** de la plantilla (`import '../../styles/pages/producto.css';`): Astro las agrega después de la hoja global.
2. Clases nuevas con el prefijo de la página (`.catalog-…`, `.producto__…`, `.solicitud__…`). No se redefinen clases globales (`.btn`, `.product`, `.sec-head`…) ni se escribe en `:root`.
3. Se usan las variables y los puntos de corte de la sección 2: `max-width` para bajar de un ancho y `min-width` con el valor siguiente (700, 1100, 1360) para lo que solo vale en anchos mayores.
4. Se mantiene la lámina: celdas blancas sobre el azul, filetes por huecos de 1 px, sin bordes propios, sin radios, sin sombras.
5. Toda retícula nueva o bloque sólido nuevo se agrega a la lista de colores forzados (`responsive.css`, 6.8).
6. Lo que tenga texto sigue las reglas de la letra agrandada (11.4): mínimos en lugar de tamaños fijos y, si una fila deja de caber, una regla `@container lamina` que con la letra normal no se cumpla.
7. Las cadenas reservadas a los ejemplos (`ejemplo-…`, «de ejemplo», «Marca de ejemplo», `EJ-`) no pueden aparecer en producción, tampoco como clase CSS: el escáner falla.

## 10. Scripts del navegador

Hay cuatro, todos de mejora progresiva: sin JavaScript cada página sigue siendo usable.

| Script | Importa | Qué hace |
| --- | --- | --- |
| `SiteHeader` | nada | Paneles de menú, búsqueda y «Categorías»; alto real del encabezado y de la barra fija (4.3, 4.4); texto de ayuda del campo en dos líneas (4.3). |
| `CatalogSearch` | `routes.mjs`, `search.mjs` | Filtra las tarjetas del catálogo (abajo). |
| `PageLinkScript` | `contact-core.mjs` | Agrega la línea «Enlace» a los borradores de producto al cargar la página ([`datos-y-modos.md`](datos-y-modos.md#4-borradores-de-whatsapp-y-correo)). |
| Solicitud especial | `contact-core.mjs`, `search.mjs` (solo el nombre del parámetro) | Con `?q=…`, agrega «Descripción o uso» a los borradores y muestra la nota de la búsqueda. |

Un script de navegador solo importa los módulos sin datos: `routes.mjs`, `search.mjs`, `text.mjs` y `contact-core.mjs`. Nunca `site-data.mjs`, `contact.mjs` ni un `.json`: los datos viajan en el HTML (`data-*`) y los enlaces de contacto llegan ya construidos. El texto que escribe el visitante se escribe con `textContent`, `value` o como parámetro codificado, nunca como HTML. Un `<script>` de página va dentro de `<BaseLayout>` o en un componente. La regla de movimiento reducido da a toda propiedad una transición de 0.01 ms: un script que lee el diseño justo después de cambiar un estilo puede ver todavía el valor anterior.

**Búsqueda del catálogo.** El formulario es real (GET a `/catalogo/`, parámetro `q`). El script filtra en el navegador, sin recargar: al cargar con `?q=…` (el campo del encabezado envía aquí), mientras se escribe y al enviar. Una tarjeta se muestra si cada palabra de la consulta está en su nombre, marca, código, códigos de variante o categorías, sin distinguir mayúsculas ni acentos («senalizacion» encuentra «señalización») y con los códigos comparados sin separadores («37175» encuentra «37-175»). Mantiene la dirección al día con `history.replaceState`, actualiza la línea de resultados («10 productos», «3 resultados para “guante”»; región viva, hasta dos renglones), muestra «Limpiar búsqueda» y el estado sin resultados, y pasa la consulta a «Solicitar este producto». Sin JavaScript, el formulario envía a `/catalogo/?q=…` y la página lista todo con el conteo simple.

**Limpieza del texto de búsqueda.** `cleanQuery` (`src/lib/text.mjs`) prepara el texto del visitante para mostrarlo dentro de una frase, para buscarlo o para ponerlo en un borrador. Lo usan `displayQuery` y `queryTokens` (catálogo: lo que muestra la línea de resultados es exactamente lo que se busca) y `requestDescription` (solicitud especial y sus borradores), así todos leen lo mismo.

- **Se quitan sin dejar espacio** los caracteres sin ancho ni significado en una consulta (`REMOVED_IN_QUERY`): el guion suave U+00AD; los de dirección U+061C, U+200E, U+200F, U+202A a U+202E y U+2066 a U+2069, que invertirían las palabras del propio sitio; los invisibles U+200B, U+2060 a U+2064 y U+FEFF; los de formato obsoletos U+206A a U+206F, y los rellenos del hangul U+115F, U+1160, U+3164 y U+FFA0, que para Unicode son letras pero no dibujan nada. Un nombre pegado con uno de ellos dentro de una palabra («gu<U+200B>ante», «cas<U+115F>co») se muestra y se busca como la palabra.
- **Pasan a ser un espacio** (`SPACE_IN_QUERY`) el de reemplazo U+FFFD (así llega una secuencia `%` mal formada), los controles y las mitades sueltas de un par sustituto, porque suelen estar donde había un separador. Después se recorta y queda un solo espacio entre palabras.
- **Se conservan** U+200C y U+200D (varias escrituras y los emojis compuestos los necesitan), los selectores de variante, los caracteres de etiqueta (banderas) y toda letra, cifra, marca, símbolo o signo de cualquier escritura.

Si no queda nada visible (una letra, una cifra, un símbolo o un signo de puntuación que no se ignore por omisión), la consulta queda vacía y las dos páginas la tratan como sin búsqueda. El catálogo filtra mientras se escribe con el valor tal como está en el campo; al cargar, usa la consulta ya limpia. Una consulta hecha solo de puntuación (por ejemplo `-`) se muestra en la solicitud especial, pero en el catálogo no filtra nada: se acepta.

**La dirección de la búsqueda.** Hoy el script del catálogo reescribe la dirección completa a partir de `q` (`/catalogo/?q=…`, o `/catalogo/` sin búsqueda): cualquier otro parámetro de la dirección se pierde en cuanto el visitante escribe, envía o limpia la búsqueda. Cambia en el paso 2, cuando los filtros compartan la dirección con la búsqueda.

## 11. Accesibilidad

### 11.1 Estructura

Un solo H1 por página y títulos en orden; cada `<section>` con `aria-labelledby`; `lang="es-MX"`; «Saltar al contenido» como primer elemento enfocable, que lleva el foco a `main#contenido`. Un control con texto visible y `aria-label` tiene un nombre que empieza con ese texto (A-02a).

### 11.2 Foco

Anillo de 3 px de tinta (`--focus`) con 2 px de separación. En celdas que se tocan (`cell-link`, filas de la navegación, logotipo, botones del encabezado) se dibuja por dentro (`outline-offset: -3px`). Dentro de la banda azul es blanco. El enlace «Saltar al contenido» es tinta con anillo blanco interior.

### 11.3 Objetivos táctiles

Al menos 44 px en tableta y celular: botones del encabezado, enlaces de la ruta, filas de datos, enlaces del pie, preguntas frecuentes, «Limpiar búsqueda», la categoría de la ficha. Los botones sólidos miden 52 px.

### 11.4 Texto espaciado y agrandado (WCAG 1.4.12)

Son dos pruebas distintas, y el código las trata por separado. En las dos, nada tiene alto fijo donde haya texto, con tres excepciones de una sola línea o decorativas: el campo de búsqueda del encabezado (44 px de alto; en el panel de tableta y celular crece con la copia de su texto de ayuda, 4.3), el del catálogo (64 px) y el monograma, un cuadro de 88, 72 o 56 px con las iniciales.

**Texto espaciado** (WCAG 1.4.12: más interlineado y más espacio entre párrafos, letras y palabras, con la letra de tamaño normal). Los botones y las filas de acción pasan a dos líneas, la franja y la cabecera crecen (4.3), los nombres de mosaico y de panel se parten con guion en pantallas angostas, los códigos y el correo se parten solo donde está permitido, y las acciones de una tarjeta pasan a dos filas cuando no caben juntas (sección 6). Las reglas de la letra agrandada (abajo) no se activan con el espaciado solo.

**Letra agrandada** (el tamaño de letra del navegador: la raíz, `html`, a 125, 150 o 200 %; no es el zoom de la página, que agranda todo junto). El objetivo: a 125 y 150 % desde 320 px de ancho, y a 200 % desde 360 px, en cada página y con los paneles del encabezado cerrados o abiertos, ninguna página se desplaza a los lados, ningún elemento visible queda en parte fuera de la pantalla, ningún texto sale de su enlace, botón, resumen, campo o etiqueta, y la última línea del pie queda visible sobre la barra fija. Con la letra normal nada cambia. Lo que queda fuera del objetivo está en [`ESTADO.md`](ESTADO.md#10-límites-conocidos).

Cómo lo hace el código. La lámina es un contenedor de consultas (`container: lamina / inline-size` en `.sheet`, `layout.css`), y la barra fija, que está fuera de la lámina, es otro (`barra`); `ItemRegister` es el suyo propio (`registro`, `atencion.css`). Las reglas de `responsive.css` 6.9, y las de `catalogo.css`, `producto.css` y `atencion.css` que la citan, comparan con `@container` el ancho del contenedor con lo que mide el texto en `rem`, algo que una consulta de medios no puede hacer. La mayoría usa un interruptor, `@container lamina (width < calc((1rem - 16px) * 400))`, que solo se cumple cuando la raíz mide más de 16 px: desde 125 % se cumple en cualquier lámina (mide como máximo 1296 px); a 120 %, en las de menos de 1280 px; a 110 %, en las de menos de 640 px, y con la letra normal nunca, tampoco con el espaciado de texto. Las demás condiciones tienen umbrales que con la letra normal no se cumplen desde 320 px.

Qué hace cada parte cuando la letra crece:

- **Franja de servicio:** la denominación pasa a dos renglones y la cabecera fija sigue su alto real (4.3).
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
- Los umbrales en `rem` están medidos con Archivo y con los textos de hoy (por ejemplo «WhatsApp», la clave más larga de las filas de datos, «Señalización» en los mosaicos o «sercomactive.com» en el pie): si cambian la fuente o esas palabras, se miden de nuevo.

### 11.5 Colores forzados, movimiento reducido e impresión

- **Colores forzados** (`responsive.css`, 6.8): cada celda, campo, botón, fila de acción y bloque sólido recibe un contorno de 1 px `CanvasText`; los iconos toman el color de su texto; las marcas de ubicación hechas con sombra pasan a bordes de 4 px; los cuadros de la marca actual, del pie y del catálogo se pintan `CanvasText`; los logotipos quedan sobre una placa blanca. Los selectores van en `:where()` para que el foco y las reglas de cada componente ganen. Una retícula o un bloque sólido nuevo se agrega a esa lista.
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

Otros pares que no son texto: filetes, bordes de campo, iconos y barras de ubicación actual son `#0067B0` sobre blanco (5.88:1); la barra de ubicación del panel «Categorías», `#0067B0` sobre `#F3F8FC` (5.50:1); la del bloque «Cotizar mi lista», blanco sobre `#0067B0` (5.88:1). Decorativos: flechas de las celdas de marca, `#99C2DF` sobre blanco (1.88:1); filetes suaves, `#C8DFEE` sobre blanco (1.37:1); el rayado de la imagen de producto.

## 12. Navegadores compatibles

Declaración propuesta, a partir de las tablas de compatibilidad de las propiedades que usa la hoja compilada: **Safari e iOS 16 o posterior, Chrome y Edge 117 o posterior, Firefox 110 o posterior.** El piso lo ponen dos propiedades: `grid-template-columns: subgrid` de `pages/catalogo.css` (Chrome y Edge 117, Firefox 71, Safari 16) y las consultas de contenedor de la letra agrandada (`container` y `@container`, 11.4), con la sintaxis de rangos y `calc()` con `rem` en la condición (Chrome y Edge 105, Firefox 110, Safari e iOS 16). Otras propiedades necesarias (`:focus-visible`, `overflow-wrap: anywhere`, `aspect-ratio`, `:where()`, `gap` en flex, `:placeholder-shown`, y `overflow: clip` de la fila de acciones de las tarjetas: Chrome 90, Firefox 81, Safari 16) piden versiones menores; `inset` se escribe en la hoja compilada como `top`, `right`, `bottom` y `left`. `100dvh` (Chrome 108, Firefox 101, Safari 15.4) tiene un respaldo en `vh`. `text-wrap: balance` y `pretty`, los colores forzados y `ResizeObserver` (alto real del encabezado y de la barra fija, texto de ayuda en dos líneas) son mejoras: sin ellos la página sigue funcionando. No se usan `:has()`, `@layer`, `color-mix` ni anidamiento nativo; usar `:has()` subiría Firefox a 121. Las revisiones en navegador se hicieron en Chromium; estas versiones deben confirmarse antes de publicar.

**Lo que pierde un navegador anterior.** Uno sin consultas de contenedor (por ejemplo, Firefox 101 a 109, que tiene todo lo demás) ignora `container` y `@container`: con la letra normal la página se ve igual, y con la letra agrandada se comporta como antes de esos ajustes: algunas etiquetas pueden salir de su control y la página puede desplazarse a los lados. Lo que pierde uno por debajo de las otras versiones no se ha revisado.

**Contención en otros motores.** Declarar un contenedor (`container-type` o `container`) aplicaba además contención de diseño y de estilo en Chrome hasta la versión 128, y en octubre de 2024 Firefox y Safari todavía la aplicaban. Con la contención de diseño, el elemento pasa a ser el bloque contenedor de sus descendientes con posición absoluta o fija, un contexto de apilamiento y un contexto de formato independiente. Lo que hace el código: la barra fija (`.dock`) es hermana de `.sheet`, no está dentro de ella; nada dentro de `.sheet` ni de `.item-register` tiene `position: fixed`; el encabezado es `position: sticky` dentro de `.sheet`, y una posición `sticky` no depende del bloque contenedor de un elemento fijo; y `.sheet`, `.dock` y `.item-register` ya son retículas, así que ya eran contextos de formato independientes. La contención se emuló en Chromium (`contain: layout` agregado a `.sheet`, `.item-register` y `.dock` en una copia de las dos compilaciones), y se comparó con la compilación tal como está: la caja de cada elemento, las cajas fijas y pegajosas en tres posiciones de desplazamiento y qué elemento queda encima en una rejilla de puntos, en una página de cada tipo, a varios anchos de 320 a 1920 px, con los paneles del encabezado cerrados y abiertos, con la letra al 100 % en las dos compilaciones y al 200 % en la de producción. Ninguna caja se movió, tampoco la barra fija ni el encabezado. Cambió qué elemento queda encima en unos pocos puntos donde dos cajas se tocan (un dibujo SVG y su trazo, dos textos del pie) o donde el menú se midió a mitad de su animación de apertura; y a 320 px con la letra al 200 % la página dejó de desplazarse a los lados: lo que sobresale a ese tamaño (de 6 a 33 px, un límite anotado en `ESTADO.md`, sección 10) sigue en su lugar, pero no se alcanza desplazando la página. La comparación de la vista previa al 200 % seguía en curso cuando se escribió esto. No se probó en Firefox ni en Safari.

**Destino de la hoja compilada.** `astro.config.mjs` fija `vite.build.cssTarget` en `chrome90`, `edge90`, `firefox90`, `safari14` e `ios14`. Sin ese ajuste, Lightning CSS (el procesador de CSS de la compilación) conserva el anidamiento y escribe las consultas como rangos (`width<=1099px`), que los navegadores anteriores a Safari 16.4 no entienden. Con él, la hoja compilada sale con `max-width` y `min-width` clásicos. No se quita aunque la declaración de navegadores suba. Las consultas de contenedor sí conservan la sintaxis de rangos (`@container lamina (width<calc(400rem - 6400px))`), que entiende todo navegador que tiene consultas de contenedor; Lightning CSS simplifica `calc((1rem - 16px) * 400)` a `calc(400rem - 6400px)`, el mismo valor.

## 13. Producción y vista previa

| | Producción (`npm run build`, hoy) | Vista previa (`npm run build:preview`) |
| --- | --- | --- |
| Aviso arriba | «Sitio en preparación · Versión inicial para revisión» en todas las páginas | `PREVIEW_NOTICE` en todas las páginas |
| Navegación | Catálogo, Marcas, Contacto y el bloque «Cotizar mi lista» | además «Categorías» con su panel |
| Búsqueda en el encabezado | no hay campo ni botón Buscar (aparecen con el primer producto aprobado) | campo en computadora, botón Buscar en tableta y celular |
| Portada | sin placa: nota «Estamos preparando el catálogo» y las tres entradas; sin secciones de categorías ni de productos | todas las secciones |
| Pie | sin columna de categorías | con categorías |
| Páginas de categoría y de producto | ninguna | las diez categorías, los diez ejemplos y el ejemplo retirado |
| Etiqueta «Ejemplo» | nunca | en cada ejemplo |

Cuando se apruebe una categoría, la entrada «Categorías», la placa y las secciones de categorías aparecen solas en producción; la búsqueda del encabezado y las secciones de productos aparecen con el primer producto aprobado. Qué cambia exactamente: [`datos-y-modos.md`](datos-y-modos.md#93-cómo-aprobar-una-categoría).

## 14. Reglas

- **Logotipo.** Siempre `logo.svg` sobre blanco, con `width` y `height` explícitos y `alt="Sercom Active"`; ancho mínimo 120 px; aire libre alrededor. Nunca se recolorea, estira, recorta, gira, delinea ni se usa como decoración.
- **Colores.** Solo los de la sección 2. Nada del azul marino `#0E2A3D` ni del celeste `#00A6E5` del plan anterior, ni tema oscuro (el escáner lo detecta, R-RULE-29).
- **Tipografía.** Títulos con peso 700 y ancho 96 %; nunca más de 104 %. El ancho 110 % es solo para etiquetas. Sin cursivas: el énfasis es peso. Sin flechas ni palomitas tecleadas: salen del kit de iconos.
- **Iconos.** Solo los del kit, mediante `Icon`. Los glifos de redes sociales del kit no se usan mientras la empresa no confirme perfiles. Nunca logotipos de otras marcas.
- **Ningún control que no haga nada.** Todo lo visible funciona. Lo que llega en el paso 2 (filtros combinables, «Agregar a mi cotización», la lista que se arma en el sitio) no se dibuja. Sin JavaScript todo sigue siendo usable.
- **Contacto.** Abrir WhatsApp o el correo nunca va seguido de un mensaje de confirmación. Los enlaces salen de `contactLinks`; los datos visibles, de `contactDetails`.
- **Textos.** Se toman del plan y de la maqueta aprobada; todos son borradores pendientes de aprobación del contacto comercial. No se inventan afirmaciones, cifras, direcciones, normas ni testimonios. El sitio no se presenta como oficial, autorizado, distribuidor ni sucursal; no nombra la marca excluida; no muestra precios, existencias, envíos, carrito, dirección física ni mapa. El enlace de una marca se llama «Sitio del fabricante».
- **Ejemplos.** Cada producto de ejemplo lleva `Tag` con `EXAMPLE_TAG`, en tarjetas y en su página.

## 15. Comprobaciones

- `npm run check`, `npm test` y `npm run verify` (compila ambos modos y ejecuta el escáner de reglas, el verificador de enlaces y el de marcado).
- Revisión en navegador de ambas compilaciones a 1440, 1280, 768, 390 y 360 px como mínimo: ningún desbordamiento horizontal, teclado, sin JavaScript, texto espaciado y colores forzados. Para servirlas: `npm run preview` sirve `dist/` y `npx astro preview --outDir dist-preview` sirve `dist-preview/`, pero Astro solo deja correr un servidor de `astro preview` a la vez; para tener los dos, el segundo se arranca en primer plano con `--ignore-lock` y otro puerto. Desde una terminal o un script común el servidor queda en primer plano y se detiene con Ctrl+C; solo con `--background`, o cuando Astro detecta que lo ejecuta un agente automatizado, queda en segundo plano y se detiene con `npx astro preview stop` ([`datos-y-modos.md`](datos-y-modos.md#3-los-dos-modos)). También sirve `npm run dev` (vista previa) o `npx astro dev` (producción); el servidor de desarrollo también corre uno a la vez (para los dos, el segundo con `--ignore-lock` y otro puerto), y puede correr junto a uno de `astro preview`.
- Letra agrandada (11.4): en la consola del navegador, `document.documentElement.style.fontSize = '200%'` reproduce lo que se midió, y lo mismo con `'125%'` y `'150%'` (`''` vuelve al tamaño normal; recargar la página también). Se revisa cada tipo de página de las dos compilaciones a 1440, 1280, 768, 390 y 360 px, y además a 320 px con 125 y 150 %, con los paneles del encabezado cerrados y abiertos: la página no se desplaza a los lados, ningún elemento visible queda en parte fuera de la pantalla, ningún texto sale de su enlace, botón, resumen, campo o etiqueta ni queda cortado por una celda vecina, y en el celular la última línea del pie queda visible sobre la barra fija. Con la letra normal nada cambia.
- Accesibilidad con axe (WCAG 2.1 A y AA): cero infracciones, también con los paneles abiertos.
- El repositorio no incluye axe ni pruebas con navegador (sus únicas dependencias son Astro, `@astrojs/check` y TypeScript, y una prueba impide agregar otras sin cambiarla). Estas revisiones se hacen a mano, en un navegador, con una herramienta que ejecute axe (por ejemplo, su extensión para el navegador) y las herramientas del navegador para el ancho, el espaciado de texto, la letra agrandada y los colores forzados; el resultado se anota en `docs/ESTADO.md`.
- Las comprobaciones no sustituyen leer la página: textos, alineación con la retícula y estados vacíos.
