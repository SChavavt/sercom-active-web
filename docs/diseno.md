# Diseño del sitio: guía para construir páginas

Guía práctica del sistema visual «Lámina técnica» (la maqueta aprobada de la portada) tal como quedó en el código. Sirve a quien construye las páginas que faltan: qué existe, cómo se arma una página, qué reglas no se rompen y qué cambia entre producción y vista previa. Para los datos y los modos de compilación, ver `docs/datos-y-modos.md`.

## 1. Qué hay y dónde

| Archivo | Contenido |
| --- | --- |
| `src/layouts/BaseLayout.astro` | Plantilla de todas las páginas: `<head>`, aviso de vista previa, enlace «Saltar al contenido», la lámina con encabezado, `<main id="contenido">` y pie, barra fija del celular. Importa la hoja global una sola vez. |
| `src/components/` | Encabezado (`SiteHeader`), pie (`SiteFooter`), barra fija (`Dock`), aviso (`PreviewBanner`) y los componentes compartidos de la sección 5. |
| `src/styles/global.css` | Única entrada de estilos. Importa, en este orden: `fonts.css` (kit tipográfico), `tokens.css`, `base.css`, `layout.css`, `components.css`, `sections.css` (secciones de la portada) y `responsive.css`. |
| `src/styles/pages/` | Estilos propios de una página (no existe todavía; ver sección 6). |
| `src/assets/fonts/` | Archivo variable (latin y latin-ext) y su licencia OFL. |
| `src/assets/brand/logo.svg` | Logotipo principal. |
| `src/assets/icons/icons.json` | Kit de iconos (87). `src/lib/icons.ts` da los nombres tipados y `categoryIcon()`. |
| `public/` | `favicon.svg`, `favicon.ico`, `apple-touch-icon.png`, `robots.txt`. |
| `docs/licencias-de-terceros.md` | Avisos de la fuente y de los iconos. |

Los componentes compartidos, la plantilla y los archivos de `src/styles/` (salvo `pages/`) son la base común: quien construye una página **no los modifica**. Si falta algo, se pide un cambio a la base en lugar de duplicar reglas.

## 2. Variables (tokens)

Todas están en `:root` (`tokens.css` y, las tipográficas, `fonts.css`). Úsalas siempre; no escribas colores ni tamaños sueltos.

**Color.** Paleta cerrada: tinta, azul Sercom, blanco, sus tintes y sombras y grises neutros. Nada más.

| Variable | Valor | Uso |
| --- | --- | --- |
| `--ink` | `#19171A` | texto, aviso de vista previa, etiqueta «Ejemplo», anillo de foco |
| `--blue` | `#0067B0` | filetes, iconos, enlaces, bloques sólidos (blanco encima: 5.89:1) |
| `--white` | `#FFFFFF` | todas las superficies |
| `--blue-800` / `--blue-700` | `#00406E` / `#00548F` | presionado / al pasar sobre azul sólido |
| `--blue-300` | `#99C2DF` | flechas tenues, filete dentro de la banda azul |
| `--blue-200` (`--rule-soft`) | `#C8DFEE` | filete suave dentro de una celda |
| `--blue-100` / `--blue-050` (`--surface-tint`) | `#E6F0F7` / `#F3F8FC` | rayado, tinte al pasar, celda teñida |
| `--grey-700` / `--grey-600` / `--grey-300` | `#46464C` / `#5A5B62` / `#C9CACE` | texto secundario, terciario, separadores decorativos |
| `--rule`, `--surface`, `--focus` | azul, blanco, tinta | funciones: filete, celda, foco |

No hay tema oscuro ni colores de estado; si una página necesitara uno (error, aviso), se agrega primero a la base.

**Tipografía.** Una sola familia, Archivo variable, servida desde el propio sitio (sin peticiones a terceros).

| Función | Variable o clase | Ajustes |
| --- | --- | --- |
| H1 de la portada | `.t-h1` (`--h1`) | 80 px a 1440, 72 a 1280, 53 a 768, 32–33 en celular; peso 700, ancho 96 % |
| H1 de páginas interiores | `.t-title` (`--type-title-size`) | 44 px en computadora, 28 en celular; peso 700, ancho 96 % |
| H2 de sección | `.t-h2` (`--h2`) | 44 px en computadora, 36 a 768, 24 en celular; peso 700, ancho 96 % |
| H3 | `.t-h3` (`--h3`) | 20 px, peso 700 |
| Entrada | `.t-lead` (`--lead`) | 17 a 19 px |
| Texto | `--body` | 16 px, peso 400 |
| Pequeño | `.t-small` (`--small`) | 14 px |
| Etiqueta | `.label` (`--label`, `--label-sm`) | 12.5 / 11.5 px, mayúsculas, peso 650, ancho 110 %, espaciado 0.08em |
| Códigos | `.t-code` | peso 600, cifras tabulares, sin corte de línea |
| Antetítulo | `.eyebrow.label` | etiqueta azul con el cuadro sólido de 10 px |

**Espacios** (base de 4 px): `--s-1` 4 · `--s-2` 8 · `--s-3` 12 · `--s-4` 16 · `--s-5` 20 · `--s-6` 24 · `--s-7` 32 · `--s-8` 40 · `--s-9` 48 · `--s-10` 56 · `--s-11` 64 · `--s-12` 80.

**Composición por ancho**

| Variable | 1360 o más | 1100 a 1359 | 700 a 1099 | hasta 699 |
| --- | --- | --- | --- | --- |
| `--margin` (blanco fuera de la lámina) | 72 | 48 | 24 | 0 |
| `--pad` (relleno lateral de una celda: el borde del texto) | 32 | 24 | 24 | 20 |
| `--section-top` (aire sobre el título de sección) | 80 | 72 | 56 | 48 |
| `--masthead-h` | 84 | 84 | 72 | 64 |

Puntos de corte: **1359** (computadora pequeña), **1099** (se pliega la navegación: tableta), **699** (celular), **379** (celular angosto). Escribe tus consultas con `max-width` y estos valores.

Forma y movimiento: `--radius: 0` (esquinas rectas siempre), `--line: 1px`, `--ease: 150ms ease` (solo color y un desplazamiento de 4 px de la flecha; desaparece con `prefers-reduced-motion`). Sombra (`--shadow-overlay`) solo en paneles que flotan sobre la página.

## 3. La lámina y la retícula de doce columnas

La página entera es una lámina: `.sheet` está pintada de azul y cada bloque es una celda blanca. **Los huecos de 1 px entre celdas son los filetes.** Ningún elemento dibuja su propio borde, así que las líneas nunca se duplican y siempre caen en las mismas once posiciones verticales.

- `<main>` y `.section` son columnas de filas separadas por 1 px.
- `.grid12` es una fila de doce pistas separadas por 1 px. Sus hijos toman columnas con `.span-1` … `.span-12`.
- `.cell` pinta una celda de blanco; `.cell--pad` le da el relleno estándar (`--s-9` arriba y abajo, `--pad` a los lados).
- En tableta y celular las clases `.span-md-N` (2, 3, 4, 6, 8, 12; hasta 1099 px) y `.span-sm-N` (3, 4, 6, 12; hasta 699 px) cambian el ancho de una celda.

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

Reglas de la lámina:

- Cada fila llena las doce columnas. Una celda vacía también se pinta (`<div class="cell span-4" aria-hidden="true"></div>`): si no, se ve el azul del fondo.
- Dentro de una celda, una separación se dibuja con `--rule-soft` (1 px), nunca con el azul fuerte.
- Los enlaces que ocupan toda una celda llevan `cell-link`: su anillo de foco se dibuja por dentro.
- Una sección empieza con `SectionHead` (el título apoyado en el filete, con `--section-top` de aire arriba).

## 4. Cómo agregar una página

1. Crea el archivo en `src/pages/` (por ejemplo `src/pages/cotizar/index.astro`). Las rutas terminan en diagonal; usa `routes` de `site-data.mjs` en lugar de escribirlas.
2. Envuélvela en `BaseLayout` con `title` (nombre de la página) y, si quieres, `description`.
3. El primer bloque es `PageHeader` (el único H1 de la página). Después, secciones con `SectionHead`.
4. Datos: solo de `src/lib/site-data.mjs` (categorías, marcas, productos, rutas, `isPreview`) y de `src/lib/contact.mjs` (`contactDetails`, `contactLinks`). Nunca escribas en la página números, correos, nombres de marcas, de categorías ni de productos.
5. Estilos propios: sección 6.
6. Ejecuta `npm run check`, `npm test` y `npm run verify` (sección 9).

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import ActionRow from '../../components/ActionRow.astro';
import PageHeader from '../../components/PageHeader.astro';
import SectionHead from '../../components/SectionHead.astro';
import { contactLinks } from '../../lib/contact.mjs';
import { routes } from '../../lib/site-data.mjs';
const list = contactLinks.list();
---
<BaseLayout title="Cotizar mi lista">
  <PageHeader
    title="Cotizar mi lista"
    breadcrumbs={[{ label: 'Inicio', href: routes.home }, { label: 'Cotizar mi lista' }]}
    lead="¿Ya tienes marcas, códigos o cantidades? Envíanos tu lista y preparamos la cotización."
  >
    <ActionRow href={list.whatsapp} primary icon="whatsapp">Enviar mi lista por WhatsApp</ActionRow>
    <ActionRow href={list.mailto} icon="mail">Enviar mi lista por correo</ActionRow>
  </PageHeader>
  <section class="section" aria-labelledby="envio-title">
    <SectionHead title="…" id="envio-title" />
    …
  </section>
</BaseLayout>
```

Las páginas de `catalogo`, `categorias/[id]`, `marcas`, `marcas/[id]`, `productos/[id]`, `cotizar`, `solicitud-especial`, `contacto` y `privacidad` existen hoy como **provisionales** (solo `PageHeader` con su título real) para que la navegación y la revisión de enlaces funcionen. Se reemplazan completas. Las rutas con parámetro usan `paths.categoryIds`, `paths.brandIds` y `paths.productIds` en `getStaticPaths()`; el escáner exige que existan exactamente las páginas de los registros visibles en cada modo.

Un `<script>` de página se escribe dentro de `<BaseLayout>` o en un componente (escrito después de `</BaseLayout>` saldría fuera de `</html>`). Un script de navegador nunca importa `site-data.mjs`, `contact.mjs` ni archivos `.json`: los datos viajan en el HTML (`data-*`). Para el navegador existen `routes.mjs`, `search.mjs`, `text.mjs` y `contact-core.mjs`.

## 5. Componentes

Todos están en `src/components/`, tienen props tipadas y un comentario de uso al inicio. Los nombres de clase son los de la maqueta aprobada.

### Icon

Icono del kit como SVG en línea; toma el color del texto. Decorativo por omisión (`aria-hidden`, `focusable="false"`).

| Prop | Tipo | Nota |
| --- | --- | --- |
| `name` | `IconName` | nombre del kit; TypeScript rechaza uno inexistente |
| `class` | `string` | tamaño: `icon--16`, `icon--18`, `icon--24`, `icon--28` (20 px por omisión); peso óptico: `icon--art` (40–64 px), `icon--fine` (64 px o más) |
| `label` | `string` | nombre accesible; solo si el icono es todo el contenido de un control o transmite información |

```astro
<Icon name="whatsapp" class="icon--18" />
<Icon name={categoryIcon(category.id)} class="icon--fine" />   <!-- de src/lib/icons.ts -->
```

### Button

Botón sólido (`.btn`), un enlace. `<Button href={…} variant="inverse" block iconEnd="arrow-right">Ayúdame a encontrarlo</Button>`.

| Prop | Tipo | Nota |
| --- | --- | --- |
| `href` | `string` | sin él imprime `<button>`: solo si un script le da función |
| `variant` | `'primary' \| 'inverse'` | `inverse` es blanco, para la banda azul |
| `block` | `boolean` | todo el ancho |
| `icon`, `iconEnd` | `IconName` | icono antes / después del texto |
| `type` | `'button' \| 'submit'` | solo para `<button>` |

### ActionRow

Fila de acción (`.action`): un enlace que es una fila entera de la lámina, con flecha. `primary` la pinta de azul. Se usa en la columna lateral de `PageHeader` y de la portada.

| Prop | Tipo |
| --- | --- |
| `href` | `string` |
| `primary` | `boolean` |
| `icon` | `IconName` (por omisión `arrow-right`) |

```astro
<ActionRow href={routes.catalog} primary>Explorar catálogo</ActionRow>
```

### MoreLink

Enlace de texto azul con flecha (`.more`). `external` abre otra pestaña, usa `external-link` y agrega para lectores de pantalla «(se abre en otra pestaña)».

```astro
<MoreLink href={routes.catalog}>Ver todo el catálogo</MoreLink>
<MoreLink href={link.url} external>{link.label}</MoreLink>   <!-- «Sitio del fabricante» -->
```

### SectionHead

Cabeza de sección (`.sec-head`).

| Prop | Tipo | Nota |
| --- | --- | --- |
| `title` | `string` | |
| `id` | `string` | id del título, para `aria-labelledby` de la `<section>` |
| `level` | `2 \| 3` | 2 por omisión |
| `eyebrow` | `string` | antetítulo; con el slot `side` (monograma) da la variante de contacto |
| `more` | `{ href, label }` | enlace a la derecha |
| `aside` | `string` | párrafo en una celda de 8 columnas a la derecha («Cómo funciona») |

```astro
<SectionHead title="Productos del catálogo" id="productos-title" more={{ href: routes.catalog, label: 'Ver todo el catálogo' }} />
<SectionHead title={`Atención con ${contactDetails.contactName}`} id="atencion-title" eyebrow="Atención personal">
  <Monogram slot="side" />
</SectionHead>
```

### PageHeader

Bloque de título de las páginas interiores (no dibujado en la maqueta; diseñado con la división de la portada): en 8 columnas la ruta de navegación como etiqueta, el pictograma opcional y el H1 apoyado en el filete; en 4 columnas la entrada (`lead`) arriba y, debajo, lo que llegue por el slot (normalmente `ActionRow`). Sin `lead` ni slot, el título ocupa las doce columnas. En tableta y celular las dos partes se apilan.

| Prop | Tipo | Nota |
| --- | --- | --- |
| `title` | `string` | el H1 |
| `breadcrumbs` | `Crumb[]` (`{ label, href? }`) | desde Inicio; el último es la página actual |
| `eyebrow` | `string` | en lugar de la ruta (404) |
| `tag` | `string` | etiqueta junto al título: `EXAMPLE_TAG` en un producto de ejemplo |
| `icon` | `IconName` | pictograma de 64 px (categoría) |
| `lead` | `string` | entrada de la página |
| `id` | `string` | id del H1 (`titulo` por omisión) |

### Breadcrumbs

Ruta de navegación (`.crumbs`, con estilo de etiqueta y diagonales grises). `items: { label, href? }[]`; el último lleva `aria-current="page"`. Normalmente la imprime `PageHeader`.

### CategoryPlate

Placa de categorías de la portada (`.plate`): mosaicos con pictograma de 64 px, número y nombre corto (el nombre accesible es el completo), y la celda ancha de solicitud especial. Props: `categories: PublicCategory[]`, `special?: boolean` (por omisión `true`). No se llama si no hay categorías.

### CategoryRegister

Registro de categorías (`.register`): filas con número, pictograma de 48 px, nombre y línea de subcategorías; dos columnas en computadora. Props: `categories`, `headingLevel?: 2 | 3 | 4` (3).

### BrandCells

Nombres de marca como texto en celdas (`.brands`), cuatro por fila; nunca logotipos de terceros. Props: `brands: PublicBrand[]`, `allLink?: { href, label }` (celda azul final, en la portada), `size?: 'md' | 'lg'` (`lg`: celdas de 96 px para `/marcas/`).

### ProductCard y ProductGrid

`ProductCard` dibuja un `PublicProduct`: imagen (o, sin fotografía, el pictograma de la categoría sobre el rayado), etiqueta «Ejemplo» si `isExample`, categoría, nombre, marca y código, «Ver ficha» (toda la tarjeta lleva a la ficha) y «Cotizar», que abre WhatsApp con `contactLinks.product`. Mientras no haya `SITE_URL`, un script agrega al hacer clic la línea «Enlace» con la dirección de la ficha. Props: `product`, `headingLevel?` (3), `class?` (columna).

`ProductGrid` (`.products`) pone las tarjetas en 3 columnas cada una (cuatro por fila en computadora, dos en tableta y celular). Props: `products`, `headingLevel?`. Con la lista vacía no imprime nada: la página muestra `EmptyState`.

```astro
<ProductGrid products={featuredProducts(8)} />
```

En el catálogo con barra lateral (3 columnas) las tarjetas viven en las 9 restantes: tres por fila a 1280 con `span-3` sobre las doce, y cuatro a 1440 con una retícula anidada de cuatro pistas en el CSS de la página. Usa `ProductCard` con tu propia `class`.

### EntryCard

Tarjeta de entrada (`.entry`), 4 columnas: pictograma de 56 px, título enlazado (toda la tarjeta es el enlace), antetítulo azul, texto y la esquina azul con flecha. Props: `href`, `icon`, `title`, `kicker`, `text`, `headingLevel?: 2 | 3` (3). Van dentro de un `.grid12`.

### Band

Banda azul sólida (`.band`): título y texto blancos en 8 columnas; pictograma y botón blanco en 4. Props: `title`, `id`, `text?`, `action: { href, label }`, `icon?` (`zoom-question`), `headingLevel?: 1 | 2` (1 si la banda es el título de la página, como en la solicitud especial). Slot opcional bajo el texto.

### ContactData y Monogram

`ContactData` (`.data`): filas WhatsApp, Correo y Horario con los datos de `business.json`; los enlaces abren el mensaje general (o los que se pasen). Props: `whatsappHref?`, `mailHref?`, `extraRows?: { key, value }[]`, `class?` (columna, por ejemplo `contact__data span-7`).

`Monogram`: las iniciales de la persona que atiende en un cuadro azul (decorativo). Sin props.

### Steps

Pasos numerados (`.steps`): número grande en azul, texto y flecha entre pasos. Prop `steps: string[]` (pensado para tres). Los lectores de pantalla oyen «1. », «2. »… antes de cada texto.

### Faq

Preguntas frecuentes (`.faq`) con `<details>` nativos. Props: `items: { question, answer }[]`, `openFirst?` (`true`), `headingLevel?` (3).

### Note

Fila de nota (`.note`): icono azul y texto pequeño gris. Props: `icon?` (`info`), `class?`. Slot: el texto.

```astro
<Note>Disponibilidad por marca y modelo sujeta a confirmación al cotizar.</Note>
```

### Tag

Etiqueta en mayúsculas sobre tinta (`.tag`). Su uso es `<Tag>{EXAMPLE_TAG}</Tag>` en cada ejemplo de la vista previa.

### EmptyState

Estado vacío (`.empty`, no dibujado en la maqueta): una celda de ancho completo con pictograma de línea de 64 px, dos frases y una sola acción. Props: `icon`, `title` (primera frase), `text` (segunda), `action: { href, label, icon? }`, `headingLevel?` (2), `class?`. Textos del brief (6.3):

```astro
<EmptyState
  icon="search"
  title="No encontramos productos con esa búsqueda."
  text="Puedes pedirnos este producto y lo buscamos por ti."
  action={{ href: routes.specialRequest, label: 'Solicitar este producto' }}
/>
<EmptyState
  icon={categoryIcon(category.id)}
  title="Estamos cargando los productos de esta categoría."
  text="Mientras tanto, dinos qué necesitas y te ayudamos a cotizarlo."
  action={{ href: contactLinks.category(category.name).whatsapp, label: 'Contactar por WhatsApp', icon: 'whatsapp' }}
/>
```

### Piezas de la plantilla

`SiteHeader`, `SiteFooter`, `Dock` y `PreviewBanner` los usa solo `BaseLayout`. El encabezado marca la página actual con `aria-current="page"` (y `"true"` en su sección: una marca dentro de «Marcas»).

## 6. Estilos propios de una página

1. Crea `src/styles/pages/<pagina>.css` (por ejemplo `catalogo.css`) e impórtalo en el encabezado de la página: `import '../../styles/pages/catalogo.css';`. Astro lo agrega después de la hoja global.
2. Usa clases nuevas con el nombre de la página como prefijo (`.catalogo__side`, `.catalogo__results`). **No redefinas clases globales** (`.btn`, `.product`, `.sec-head`…) ni escribas en `:root`.
3. Usa las variables (`var(--pad)`, `var(--rule)`, `var(--s-6)`…) y los puntos de corte de la sección 2 con `max-width`.
4. Mantén la lámina: celdas blancas sobre el azul, filetes por huecos de 1 px, sin bordes propios, sin radios, sin sombras.
5. Un bloque muy pequeño puede ir en un `<style>` de la propia página (Astro lo limita a ella); el archivo en `pages/` es preferible cuando hay consultas de medios.

```css
/* src/styles/pages/catalogo.css */
.catalogo__body { align-items: start; }
.catalogo__side { background: var(--surface); }
@media (max-width: 1099px) {
  .catalogo__side { grid-column: span 12; }
}
```

Las clases `ejemplo-…` y los textos «de ejemplo», «Marca de ejemplo» o `EJ-` no pueden aparecer en producción, tampoco en CSS: el escáner falla.

## 7. Reglas

- **Logotipo.** Siempre `logo.svg` sobre blanco, con `width` y `height` explícitos (proporción 2.656) y `alt="Sercom Active"`; ancho mínimo 120 px; aire libre alrededor de al menos la altura de la «e». Nunca se recolorea, estira, recorta, gira, delinea ni se usa como decoración. El guante solo (`mark`) es solo para favicons.
- **Colores.** Solo los de la sección 2. Nada de azul marino ni celeste del plan anterior, ni tema oscuro (el escáner lo detecta).
- **Tipografía.** Títulos con peso 700 y ancho 96 % (`.t-h1`, `.t-title`, `.t-h2`); nunca más de 104 %. El ancho 110 % es solo para etiquetas. Sin cursivas: el énfasis es peso. Sin flechas ni palomitas tecleadas: salen del kit de iconos.
- **Iconos.** Solo los del kit, mediante `Icon`, en azul sobre blanco. Los glifos de redes sociales del kit no se usan mientras la empresa no confirme perfiles. Nunca logotipos de otras marcas.
- **Ningún control que no haga nada.** Todo lo visible funciona; lo que llega en el paso 2 (filtros combinables, «Agregar a mi cotización») no se dibuja. Sin JavaScript todo sigue siendo usable.
- **Contacto.** Abrir WhatsApp o el correo nunca va seguido de un mensaje de confirmación. Los enlaces salen de `contactLinks`; los datos visibles de `contactDetails`.
- **Textos.** Se copian tal cual del brief y de la maqueta. No se inventan afirmaciones, cifras, direcciones, normas ni testimonios. Nunca «oficial», «autorizado», «distribuidor» ni «sucursal»; nunca la marca excluida; ni precios, existencias, envíos o carrito; ni dirección física o mapa. El enlace de una marca se llama «Sitio del fabricante».
- **Accesibilidad.** Un solo H1 por página y títulos en orden; cada `<section>` con `aria-labelledby`; objetivos táctiles de 44 px en tableta y celular; foco visible (anillo de 3 px de tinta, por dentro en celdas que se tocan).
- **Ejemplos.** Cada producto de ejemplo lleva `Tag` con `EXAMPLE_TAG`, en tarjetas y en su ficha.

## 8. Producción y vista previa

Todo lo que depende del catálogo se decide con los datos (`categories.length`, `products.length`), nunca con un interruptor escrito a mano.

| | Producción (`npm run build`, hoy) | Vista previa (`npm run build:preview`) |
| --- | --- | --- |
| Aviso arriba | no | `PREVIEW_NOTICE` en todas las páginas |
| Navegación | Catálogo, Marcas, Contacto (y «Cotizar mi lista» como bloque sólido) | además «Categorías» con su panel |
| Búsqueda en el encabezado | no hay campo ni botón Buscar (no hay productos) | campo en computadora, botón Buscar en tableta y celular |
| Portada | sin placa: aviso «Estamos preparando el catálogo» y las tres entradas arriba; sin secciones de categorías ni de productos | la maqueta completa |
| Pie | sin columna de categorías (logotipo, enlaces y contacto, 4 columnas cada uno) | con categorías (3 columnas cada uno) |
| Páginas de categoría y de producto | ninguna | las diez categorías y los diez ejemplos |
| Etiqueta «Ejemplo» | nunca | en cada ejemplo |

Cuando se apruebe una categoría o un producto real, la entrada «Categorías», la búsqueda y las secciones aparecen solas en producción. Una página nueva debe comportarse igual: si muestra categorías o productos, contempla la lista vacía.

## 9. Comprobaciones

- `npm run check`, `npm test` y `npm run verify` (compila ambos modos y ejecuta el escáner de reglas y el verificador de enlaces).
- Revisión visual: `npm run build:preview`, servir `dist-preview` y capturar 1440, 1280, 768, 390 y 360 px; ningún desbordamiento horizontal. Revisar también la compilación de producción.
- Accesibilidad con axe (WCAG 2.1 A y AA y buenas prácticas): cero infracciones, también con paneles abiertos (Categorías, menú y búsqueda del celular, una pregunta abierta).
- Las comprobaciones no sustituyen leer la página: textos, alineación con la retícula y estados vacíos.
