# Licencias de terceros

Material de terceros incluido en el repositorio y en el sitio compilado. El logotipo, los favicons y el nombre «Sercom Active» son de la propia empresa (decisión del propietario, ver `docs/ESTADO.md`) y no se listan aquí.

| Material | Dónde está | Licencia |
| --- | --- | --- |
| Tipografía Archivo (variable, ejes de peso y ancho), archivos `archivo-latin-wdth-normal.woff2` y `archivo-latin-ext-wdth-normal.woff2` del paquete npm `@fontsource-variable/archivo` 5.3.0, sin modificar | `src/assets/fonts/` | SIL Open Font License 1.1 |
| Iconos de Lucide (68, 23 de ellos heredados de Feather) | `src/assets/icons/icons.json` | ISC (Feather: MIT) |
| Iconos de Tabler Icons (7) | `src/assets/icons/icons.json` | MIT |
| Icono de WhatsApp de Simple Icons (1) | `src/assets/icons/icons.json` | CC0 1.0 |
| Fotografías de producto (hoy, ninguna) | `src/assets/productos/` o una dirección `https`, según la ficha | La de cada foto, con su uso confirmado y su origen en la ficha (sección «Fotografías de producto») |

Solo los iconos que una página usa llegan a su HTML (se imprimen en línea al compilar). Las licencias de la tipografía y de los iconos no exigen un crédito visible en el sitio; las fotografías de producto llevan uno (sección «Fotografías de producto»).

Nada más de terceros llega al sitio compilado, salvo las fotografías de producto cuando las haya: los scripts y las hojas de estilo de `dist/_astro/` salen del código del proyecto (`src/`), y Astro y las demás dependencias de `package.json` se usan para compilar y revisar, sin copiarse a la salida.

## Tipografía Archivo · SIL Open Font License 1.1

Copyright 2020 The Archivo Project Authors (https://github.com/Omnibus-Type/Archivo). Sin nombre reservado.

El texto completo de la licencia está en `src/assets/fonts/OFL-Archivo.txt` y debe quedarse junto a los archivos de la fuente. La OFL permite usar, incrustar y redistribuir la fuente con un sitio web; no permite venderla por sí sola, y una versión modificada no puede llevar el nombre original sin permiso. Los archivos se usan sin cambios.

## Fotografías de producto

Hoy ninguna ficha está aprobada y no hay ninguna fotografía en el repositorio ni en el sitio compilado. Una ficha aprobada lleva una foto de su producto o ninguna (entonces se muestra el pictograma de su categoría). La foto es la que el fabricante publica en su sitio oficial, con la página de donde salió; no es de la empresa ni tiene una licencia común a todas:

- La ficha registra de dónde viene (`image.sourceUrl`, la página `https` de origen) y `image.usageConfirmed: true`; el validador rechaza la foto de una ficha aprobada sin las dos cosas ([`catalogo-y-actualizaciones.md`](catalogo-y-actualizaciones.md#3-flujo-para-agregar-un-producto-real), paso 4).
- Una foto guardada como archivo está en `src/assets/productos/`, que solo guarda las de fichas aprobadas porque el repositorio es público; la compilación la copia a `dist/_astro/` convertida a WebP y en varios anchos. Una foto por dirección (`image.url`) no se copia: la página la pide a ese servidor.
- Las fotografías son de sus fabricantes y vienen de sus propios sitios. La página de cada producto muestra bajo la foto el crédito «Foto: {marca}», que enlaza la página de donde viene (`image.sourceUrl`); el validador exige que esa página sea del sitio de la marca en el registro de investigación ([`catalogo-y-actualizaciones.md`](catalogo-y-actualizaciones.md#6-imágenes-documentos-y-variantes), «Crédito de la foto»).
- Una foto se quita si su fabricante lo pide: se borra `image` de la ficha (y su archivo de `src/assets/productos/`) y el producto se muestra con el pictograma de su categoría.
- MCR Safety publica sus condiciones para usar las imágenes de sus productos (https://www.mcrsafety.com.mx/politicas/compartir-contenido/, leída el 23 de noviembre de 2026): nombrarla como fuente, enlazar a donde está la imagen original y quitarla si lo solicita. El sitio hace eso mismo con todas las marcas: el crédito y el retiro de arriba.
- Las condiciones de cada foto (crédito, plazo, dónde se puede usar) son las que dé su titular, y se cumplen ficha por ficha; este archivo no las lista una por una.

## Iconos

### Resumen

| Origen | Iconos del kit | Licencia | Versión usada | Enlace a la licencia |
| --- | --- | --- | --- | --- |
| Lucide (https://github.com/lucide-icons/lucide) | 68 | ISC. 23 de ellos proceden del proyecto Feather y llevan además aviso MIT | colección Lucide de `@iconify/json` 2.2.558, actualizada el 2026-11-17; texto de licencia leído del paquete `lucide-static` 1.75.0 | https://github.com/lucide-icons/lucide/blob/main/LICENSE |
| Tabler Icons (https://github.com/tabler/tabler-icons) | 7 | MIT | 3.52.0 | https://github.com/tabler/tabler-icons/blob/master/LICENSE |
| Simple Icons (https://github.com/simple-icons/simple-icons) | 1 | CC0 1.0 Universal | 16.38.0 | https://github.com/simple-icons/simple-icons/blob/develop/LICENSE.md |
| Dibujos propios | 9 | Obra original hecha para este proyecto; no depende de ninguna licencia de terceros | — | — |
| Dibujos propios adaptados de Lucide | 2 | ISC (obra derivada de Lucide) | — | https://github.com/lucide-icons/lucide/blob/main/LICENSE |

### Qué exigen estas licencias

- Ninguna exige mostrar un crédito visible en las páginas del sitio.
- ISC y MIT piden que el aviso de copyright y el texto del permiso acompañen a las copias del material. La forma más simple y sin impacto visual de cumplirlo: conservar este archivo en el repositorio junto a los iconos (`src/assets/icons/icons.json`). No hace falta enlazarlo desde el diseño.
- CC0 1.0 no impone condiciones de uso sobre el dibujo.
- Las licencias cubren el dibujo SVG. No cubren los derechos de marca de los glifos de marcas comerciales (ver la última sección).

### Lucide · ISC

Proyecto: https://github.com/lucide-icons/lucide · sitio: https://lucide.dev · licencia: https://github.com/lucide-icons/lucide/blob/main/LICENSE

Iconos del kit tomados de Lucide sin cambios en el trazo (68). Donde el nombre del kit difiere, se indica el nombre original:

`cat-cabeza` ← `hard-hat`, `cat-vial-y-senalizacion` ← `traffic-cone`, `search`, `menu`, `close` ← `x`, `chevron-down`, `chevron-right`, `chevron-left`, `arrow-right`, `arrow-up-right`, `mail`, `phone`, `clock`, `map-pin`, `clipboard-list`, `plus`, `minus`, `check`, `check-circle` ← `circle-check`, `file-text`, `download`, `sliders` ← `sliders-horizontal`, `filter` ← `funnel`, `tag`, `package`, `box`, `help-circle` ← `circle-question-mark`, `message-circle`, `shield-check`, `truck`, `info`, `copy`, `home` ← `house`, `layout-grid`, `building` ← `building-complex`, `factory`, `user`, `headset`, `sparkles`, `external-link`, `trash`, `pencil`, `chevron-up`, `arrow-left`, `arrow-up`, `list`, `x-circle` ← `circle-x`, `alert-circle` ← `circle-exclamation-point`, `alert-triangle` ← `triangle-exclamation-point`, `clipboard-plus`, `clipboard-check`, `message-circle-question` ← `message-circle-question-mark`, `send`, `share` ← `share-2`, `link`, `qr-code`, `printer`, `image`, `image-off`, `eye`, `file-down`, `book-open`, `ruler`, `layers`, `rotate-ccw`, `loader` ← `loader-circle`, `handshake`, `users`

Adaptaciones propias construidas sobre trazos de Lucide (2): `cat-ojos-y-cara` (a partir de `lucide:rectangle-goggles` y `lucide:glasses`); `cat-ojos-y-cara-goggles` (a partir de `lucide:rectangle-goggles`).

```text
ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

#### Parte heredada de Feather · MIT

El archivo de licencia de Lucide indica que una lista de iconos deriva del proyecto Feather y queda bajo licencia MIT. De esa lista, el kit usa 23:

`search`, `close` (Feather `x`), `chevron-down`, `chevron-right`, `chevron-left`, `arrow-right`, `arrow-up-right`, `clock`, `plus`, `minus`, `check`, `download`, `help-circle`, `info`, `external-link`, `trash`, `chevron-up`, `arrow-left`, `arrow-up`, `x-circle`, `alert-circle`, `alert-triangle`, `link`

```text
The MIT License (MIT) (for the icons listed above)

Copyright (c) 2013-present Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Tabler Icons · MIT

Proyecto: https://github.com/tabler/tabler-icons · licencia: https://github.com/tabler/tabler-icons/blob/master/LICENSE

Iconos del kit tomados de Tabler Icons (7): `zoom-question`, `whatsapp-outline` ← `brand-whatsapp`, `facebook` ← `brand-facebook`, `instagram` ← `brand-instagram`, `youtube` ← `brand-youtube`, `tiktok` ← `brand-tiktok`, `linkedin` ← `brand-linkedin`.

Se usan porque Lucide no ofrece una lupa con interrogación ni glifos de marcas. Comparten rejilla de 24 px, trazo 2 y extremos redondos con Lucide.

```text
MIT License

Copyright (c) 2020-2026 Paweł Kuna

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Simple Icons · CC0 1.0 Universal

Proyecto: https://github.com/simple-icons/simple-icons · licencia: https://github.com/simple-icons/simple-icons/blob/develop/LICENSE.md · identificador SPDX: `CC0-1.0`

Icono del kit tomado de Simple Icons (1): `whatsapp`. Es el único icono relleno del kit (`strokeBased: false`).

CC0 es una dedicación al dominio público: no pide aviso ni atribución. El texto completo está en el enlace de la licencia. Simple Icons advierte en su archivo `DISCLAIMER.md` que el hecho de que el proyecto esté bajo CC0 no implica que cada logotipo lo esté, y pide a quien los use revisar las pautas de marca de cada titular y obtener los permisos que correspondan.

### Dibujos propios

Iconos dibujados para este proyecto sobre la misma rejilla y con el mismo trazo que Lucide (9): `cat-manos`, `cat-respiratoria`, `cat-auditiva`, `cat-alturas`, `cat-ropa`, `cat-calzado`, `cat-soldadura`, `cat-vial-y-senalizacion-flat`, `cat-respiratoria-n95`.

Son obra original. No requieren aviso de terceros. Los iconos de categoría que sí vienen de Lucide tal cual son `cat-cabeza` (`hard-hat`) y `cat-vial-y-senalizacion` (`traffic-cone`).

### Marcas registradas

Los glifos `whatsapp`, `whatsapp-outline`, `facebook`, `instagram`, `youtube`, `tiktok`, `linkedin` representan marcas de sus respectivos titulares. Las licencias CC0 y MIT cubren únicamente el dibujo, no el derecho de marca.

- Usarlos solo para identificar el canal de contacto o el perfil propio de la empresa en cada servicio, sin sugerir patrocinio ni asociación.
- WhatsApp: Simple Icons remite a la página oficial de recursos de marca, https://about.meta.com/brand/resources/whatsapp/whatsapp-brand (consultada el 2026-11-18). Esa página pide usar los logotipos oficiales descargados de allí, no modificar sus colores, no combinarlos con otros logotipos, no usar el nombre como verbo y escribir siempre "WhatsApp" con W y A mayúsculas. Un glifo de un solo color como el de este kit es la práctica habitual en botones del tipo "Cotizar por WhatsApp", pero no es el recurso oficial. Si se quiere cumplimiento estricto, descargar el glifo oficial desde esa página y sustituir el cuerpo de `whatsapp`.
- LinkedIn figura como retirado (`hidden`) en los datos de Simple Icons 16.38.0, por eso el kit solo trae el contorno de Tabler Icons, como opción.
- Los contornos de redes sociales están en el grupo `ui-extra` y son opcionales: solo hacen falta si el sitio enlaza perfiles de la empresa.
