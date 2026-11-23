# Carga y mantenimiento del catálogo

Cómo se agrega, se aprueba, se corrige y se retira un producto real, comprobado contra el validador (`src/lib/catalog-policy.mjs`) y los tipos (`src/types/catalog.ts`) actuales. Los productos reales llegan en el paso 3 (catálogo piloto de 30 a 50 productos); hasta entonces `src/data/catalog.json` no tiene fichas y las páginas se revisan con los ejemplos de la vista previa (ver [`datos-y-modos.md`](datos-y-modos.md)).

## 1. Qué está disponible

`research/Sercom_Active_Fuentes_Catalogos.json` es el registro original de investigación: 19 entidades y 35 referencias, con estado y siguiente acción. Incluye 18 marcas y un proveedor; no son 19 catálogos completos listos para importar. Algunas URLs son históricas o están pendientes de acceso. La validación del proyecto no vuelve a descargar las fuentes.

`src/data/catalog.json` contiene las diez categorías candidatas, todas en borrador, y ninguna ficha. Esto evita publicar un inventario o una oferta sin validar.

## 2. Campos de una ficha y lo que exige el validador

Cada producto de `catalog.json` es un objeto con estos campos y ningún otro (un campo desconocido se rechaza). Lo mismo vale dentro de cada variante, cada documento, `source` y `approval`: solo llevan las claves de la tabla, y una clave mal escrita (`manufacturerCodes`) se rechaza en lugar de leerse como si faltara. `image` también: lleva exactamente las claves de una de sus dos formas.

| Campo | Contenido | Regla |
| --- | --- | --- |
| `id` | Identificador | Minúsculas, cifras y guiones (`guante-nitrilo-37-175`); único. Es la dirección de la página: `/productos/{id}/`. |
| `brandId` | Marca | Un `id` de `brands.json` de tipo `brand` (un proveedor no es una marca). |
| `model` | Modelo o código exacto del fabricante | No vacío; único dentro de la misma marca. Es el «Código» que se muestra y se busca. |
| `name` | Nombre visible | No vacío; único en todo el catálogo, en cualquier estado. Se compara como compara el sitio (sin acentos, sin mayúsculas, con un solo espacio): «Guante Solvex» y «guante SOLVEX» son el mismo nombre. «Cotizar mi lista» nombra los controles de cada renglón con el nombre del producto y la etiqueta de su variante, y dos nombres iguales darían a dos renglones los mismos nombres. |
| `categoryIds` | Categorías | Al menos una; todas deben existir en `catalog.json`. |
| `status` | Estado editorial | `draft`, `in_review`, `approved` o `retired` (sección 4). |
| `description` | Resumen | Texto. Obligatorio para `approved`. |
| `characteristics` | Características verificadas | Lista de textos; de 3 a 5 para `approved`. |
| `saleUnit` | Unidad de venta (`par`, `pieza`, `caja`…) | Obligatoria para `approved`. En cualquier estado: como máximo 60 caracteres, y si su primera palabra es una palabra de unidad conocida, va sola y en singular («pares», «Cajas con 100 piezas» y «par, talla única» se rechazan, y el mensaje dice la palabra que cambia: «cambia «pares» por «par»»; sección 6). |
| `variants` | Tallas, colores o presentaciones | Lista de `{ id, label, manufacturerCode }`: `id` en el formato de arriba y único en la ficha; etiqueta no vacía y distinta de las demás de la ficha (con la misma comparación que los nombres); `manufacturerCode` opcional: una variante sin código propio no lleva la clave, y si la lleva no puede ir vacía (sección 6). |
| `image` | Fotografía | Una de dos formas, nunca las dos: `{ file, alt, sourceUrl, usageConfirmed }`, con `file` el nombre de un archivo de `src/assets/productos/` (minúsculas, cifras y guiones, con extensión `.jpg`, `.jpeg`, `.png` o `.webp`, sin carpeta: `guante-nitrilo-37-175.jpg`), o `{ url, width, height, alt, sourceUrl, usageConfirmed }`, con `url` una dirección `https` y `width` y `height` las medidas de la foto en píxeles (enteros de 1 a 10000). `alt` describe la foto en una línea limpia de 160 caracteres como máximo; `sourceUrl` es la página `https` de donde viene; `usageConfirmed` es `true` o `false`. La forma vale en cualquier estado; para `approved` es obligatoria y con `usageConfirmed: true`. El nombre del archivo no lleva «ejemplo», «ej-» con una cifra ni la marca excluida. Sección 6. |
| `source` | Fuente revisada | `{ url, checkedOn }` y ninguna otra clave: `https` y fecha `AAAA-MM-DD` válida. Obligatoria para `approved`. |
| `approval` | Aprobación comercial | `{ by, on, supplyConfirmed }` y ninguna otra clave: quién aprobó, fecha `AAAA-MM-DD` válida y `supplyConfirmed: true`. Obligatoria para `approved` y para que un retirado conserve su página. |
| `standards` | Normas, certificaciones y niveles de protección | Opcional: sin normas, la ficha no lleva la clave (una lista vacía se rechaza). De 1 a 12 objetos `{ text, sourceUrl }`, sin otras claves, en cualquier estado. `text`: la norma como la imprime el fabricante («EN 388:2016 4131A»), limpia y en una línea como el resto del texto, de 80 caracteres como máximo y sin repetir otra de la ficha (con la misma comparación que los nombres). `sourceUrl`: la dirección `https` de la página o el documento del fabricante donde consta esa norma para ese producto; no se publica. La ficha las muestra en el bloque «Normas»; una norma no va en ningún otro campo ([`datos-y-modos.md`](datos-y-modos.md#7-cómo-se-revisa-el-texto-de-una-ficha)). |
| `documents` | Fichas técnicas u otros documentos | Lista de `{ label, url }` con `https`, sin otras claves. Opcional. |

Además, en todo el archivo:

- Ninguna clave se llama `price`, `precio`, `cost` o `costo` (en singular o plural), `stock`, `inventory` ni `inventario`: el sitio no publica esos datos. Otras formas (`existencias`, `stocks`, `inventarios`) el validador no las rechaza; tampoco deben usarse.
- La marca excluida no puede aparecer en `id`, `brandId`, `model`, `name` ni en el nombre de la marca.
- Lo reservado a los ejemplos se rechaza: un `id` que empieza con `ejemplo-`, un nombre con «de ejemplo» y un código (`model` o de variante) que empieza con `EJ-` y una cifra.
- Una ficha `approved` exige que **todas** sus categorías estén aprobadas.
- El texto de una ficha va limpio y en una sola línea, en cualquier estado: `name`, `model`, `description`, `saleUnit`, cada característica, la etiqueta y el código de cada variante, el texto de cada norma y la etiqueta de cada documento. Limpio quiere decir igual a como lo deja `cleanQuery` (`src/lib/text.mjs`) y, además, sin ninguno de los caracteres que no se ven y que `cleanQuery` conserva para el texto de un visitante (U+200C, U+200D, los selectores de variante y los demás que Unicode marca para ignorar al dibujar): sin espacios al principio ni al final, sin dos espacios seguidos, sin saltos de línea ni tabuladores, sin espacios de no separación y sin caracteres invisibles. Es lo que suele traer un texto pegado de un PDF. El mensaje dice el campo y qué hacer: «products[3].characteristics[1]: tiene espacios de más, un salto de línea o un carácter invisible; escríbelo en una sola línea.». De un carácter invisible que `cleanQuery` conserva dice además cuál es y dónde está, porque quien corrige no puede verlo: «products[3].name: tiene un carácter invisible (U+200D) después de «Guante»; borra esa parte y escríbela de nuevo.» (del texto anterior cita hasta 24 caracteres, y «al principio» si no hay ninguno). Un campo de texto que está tampoco puede ir vacío: se escribe o se quita.

Un solo error, aunque sea de una ficha en `draft`, detiene la validación y la compilación de los dos modos: `getPublishedProducts` no entrega nada si `validateCatalog` encuentra un problema. Un borrador incompleto puede quedarse en el archivo (el validador solo exige lo de `approved` a las fichas aprobadas), pero sus campos deben tener la forma correcta: las reglas de forma (claves conocidas, nombres y etiquetas sin repetir, texto limpio, unidad de venta) valen para cualquier estado, porque los candidatos se cargan como borradores.

El validador también revisa el texto de cada ficha, en cualquier estado, con las mismas reglas con las que el escaneo revisa una página de producción: palabras que el sitio no puede decir («autorizado», «garantizado», «líder», «compatible»…), una norma fuera de `standards`, un número largo fuera de `model` y de los códigos de variante, una dirección de correo, y un enlace o una nota del registro de investigación. Cada mensaje dice la ficha, el campo, la regla y lo encontrado; está descrito, con ejemplos, en [`datos-y-modos.md`](datos-y-modos.md#7-cómo-se-revisa-el-texto-de-una-ficha).

## 3. Flujo para agregar un producto real

1. Obtener material del fabricante y confirmar con el contacto comercial los modelos que Sercom Active puede suministrar.
2. Agregar la ficha como `draft` con `id`, `brandId`, `model`, `name`, `categoryIds` y `source`. Mientras esté en `draft` o `in_review` no aparece en ninguna compilación.
3. Completar `description`, de 3 a 5 `characteristics` verificadas en la fuente, `saleUnit`, las `variants` aplicables (con su código original cuando el fabricante publica uno para cada variante) los `documents` que se puedan enlazar (la página o la ficha del producto en el sitio del fabricante, no un catálogo general del registro de investigación) y, si el fabricante las publica para ese producto, sus normas en `standards`, cada una con la dirección donde consta. Una norma, una certificación o un nivel de protección van solo ahí, no en la descripción ni en las características.
4. Revisar el uso de la foto y de los documentos: no se asumen derechos por estar disponibles en Internet. Registrar `image.sourceUrl` y poner `usageConfirmed: true` solo con el uso confirmado. Luego preparar la foto (sección 6): de preferencia un archivo en JPEG, PNG o WebP, de 600 a 4000 px por su lado más largo y de 1.5 MB como máximo, con un nombre en minúsculas, cifras y guiones (`guante-nitrilo-37-175.jpg`). El archivo entra a `src/assets/productos/` en el mismo cambio que aprueba la ficha, nunca antes: la carpeta solo guarda fotos de fichas aprobadas, porque el repositorio es público. En la ficha se escribe `image.file` con ese nombre exacto y `image.alt` con una descripción de la foto. `npm run check` dice si falta el archivo, si sobra uno o si no cumple el formato, las medidas o el peso; la foto se revisa después en la página compilada.
   Si el validador informa una regla de redacción en un campo («R-RULE-06, experiencia o liderazgo sin evidencia: «garantizadas». Escríbelo de otra forma.»), se escribe ese texto de otra forma, con lo mismo que dice el fabricante; no se cambia la regla ni se agrega la frase a las frases permitidas. Si un producto no se puede escribir sin esa palabra (su modelo *es* esa palabra), se detiene la carga de esa ficha y se consulta: la excepción se diseña con ese caso a la vista.
5. Con la revisión del contacto comercial, registrar `approval` (`by`, `on`, `supplyConfirmed: true`) y pasar a `approved`. Si su categoría sigue en borrador, aprobarla también (ver [`datos-y-modos.md`](datos-y-modos.md#93-cómo-aprobar-una-categoría)).
6. No hay que cambiar pruebas por cargar o aprobar productos: las que tratan del catálogo real comparan lo que se publica con lo que se deriva del mismo catálogo (en producción, exactamente las fichas y las categorías aprobadas), y las de los ejemplos, de los modos o de una ficha sintética usan el catálogo vaciado ([`datos-y-modos.md`](datos-y-modos.md#62-pruebas)). Una ficha mal formada, aunque sea un borrador, sí detiene la validación (sección 2).
7. Ejecutar `npm run check` y los archivos de prueba de lo que cambió, revisar la diferencia y la página generada en la compilación de producción (`npm run build` y `npm run preview`); la batería completa y `npm run verify` corren en GitHub con la solicitud de cambios. Con el primer producto aparecen también la búsqueda del encabezado, los filtros del catálogo y «Agregar a mi cotización».
8. Integrar el cambio en `main`. Cuando haya alojamiento conectado, su compilación publicará el cambio (hoy no hay ninguno).

`getPublishedProducts` entrega a las páginas solo lo público (sin aprobación, fuente ni uso de imagen: de la foto, solo `file` y `alt`, o `url`, `width`, `height` y `alt`; de las normas, solo su texto). Un campo booleano no sustituye la revisión humana ni confirma inventario.

## 4. Qué hace el sitio con cada estado

| Estado | Qué pasa |
| --- | --- |
| `draft` | Nada se publica. `/productos/{id}/` no existe (404). |
| `in_review` | Igual que `draft`. |
| `approved` | Ficha en `/productos/{id}/`; aparece en el catálogo, en su categoría, en su marca, en la búsqueda, en los conteos, en «Productos del catálogo» de la portada y en «Más productos…». |
| `retired` con `approval` completa | Fue público: su dirección se conserva como página informativa (sección 5). Sale de listados, conteos, búsqueda y selecciones. |
| `retired` sin `approval` completa | Nunca fue público y sigue privado: su dirección da 404. El escáner falla si existe una página para él (R-RULE-14). |

## 5. Producto retirado

Quien guardó el enlace de una ficha, escaneó una cotización o conserva un mensaje no debe llegar a un error: la dirección de un producto que fue público sigue funcionando y dice que salió del catálogo (requisito R-STATE-04 del plan).

**Datos.** Un producto con `status: "retired"` y `approval` completa (`by`, `on` con fecha válida y `supplyConfirmed: true`) es un retirado público (`isPublicRetired`). `getRetiredProducts` entrega de él solo `id`, `brandId`, `model`, `name` y `categoryIds`, y `createSiteData` lo pone en `retiredProducts`, aparte de `products`, con sus categorías públicas en el modo (puede quedar sin ninguna). Lo que se muestra pasa en el validador las mismas reglas que una ficha aprobada; sus categorías no necesitan estar aprobadas. Un identificador no puede repetirse entre productos y retirados.

**Cómo retirar un producto.**

1. En `src/data/catalog.json`, cambiar su `status` a `retired` y **conservar** su bloque `approval`.
2. Ejecutar `npm run check` y las pruebas de lo que cambió; la batería completa y `npm run verify` corren en GitHub con la solicitud de cambios.
3. Su dirección `/productos/{id}/` sigue funcionando y pasa a ser la página informativa; el producto sale de listados, conteos, búsqueda, «Productos del catálogo» y «Más productos…».

Si la ficha tenía su foto en `src/assets/productos/`, el archivo sale de la carpeta en el mismo cambio: la página del retirado no muestra fotografía, y la carpeta solo guarda fotos de fichas aprobadas (`npm run check` falla mientras el archivo siga ahí). `image` puede quedarse en la ficha.

Solo si el producto debe desaparecer por completo (su dirección da 404) se quita también `approval`. Volver a publicarlo es devolverlo a `approved` con sus datos completos.

**Qué pasa con la lista de un visitante.** Un visitante puede tener el producto guardado en «Mi cotización» (en su navegador; el sitio no lo sabe ni puede cambiarlo). Mientras el retirado conserve su página, «Cotizar mi lista» lo muestra con su nombre y «Producto retirado: no se incluye en tu mensaje.», con «Quitar»; no va en el mensaje. Si además se quita `approval`, la página ya no lo conoce: queda entre los productos que no ubica, con «Quitarlo de mi cotización», y tampoco va en el mensaje. En los dos casos el renglón guardado no se borra hasta que el visitante lo quita. Lo mismo pasa con una variante que se borra de una ficha: el renglón que la tenía elegida queda entre los que la página no ubica. Por eso una variante no se borra ni cambia de `id` para corregir su etiqueta: se corrige la etiqueta ([`datos-y-modos.md`](datos-y-modos.md#10-la-lista-guardada-en-el-navegador)).

**Qué muestra la página.** La ruta, el pictograma de su categoría (nunca una fotografía), la categoría pública y el nombre (H1), las filas Marca y Código, el aviso «Producto retirado» con «Este producto ya no forma parte del catálogo.» y «Dinos qué necesitas y revisamos alternativas.», las acciones «Consultar alternativas» (WhatsApp) y «Consultar por correo» con el borrador de alternativas, la banda de solicitud especial y «Más productos…». Su título es «{nombre} (producto retirado) · Sercom Active».

**Qué nunca muestra.** Acciones para cotizar o pedir la ficha técnica, unidad de venta, resumen, características, variantes, documentación, el aviso de disponibilidad ni la banda de ayuda de la ficha: nadie mantiene ya esos datos y el producto no se cotiza.

**El ejemplo de la vista previa.** `src/data/preview/example-products.json` tiene un ejemplo con `"retired": true`, «Producto de ejemplo retirado». Solo existe en la vista previa y ninguna página lo enlaza: se abre escribiendo la dirección `/productos/ejemplo-producto-retirado/` en el servidor de `npm run dev` o de la vista previa compilada.

**Qué lo protege.** El escáner (R-RULE-14) exige que existan exactamente las páginas de los retirados públicos y ninguna de un retirado sin aprobación. El verificador de marcado comprueba que una página de producto sea ficha o retirado, nunca las dos (R-STATE-04a), que el aviso y las dos acciones estén completos (R-STATE-04b), que haya un solo H1 antes del aviso y el título lleve «(producto retirado)» (R-STATE-04c) que no aparezca nada de la ficha (R-STATE-04d) y que no lleve fotografía (R-FOTO-01). Detalle en [`datos-y-modos.md`](datos-y-modos.md#65-verificador-de-marcado).

## 6. Imágenes, documentos y variantes

- **Imágenes.** Una ficha aprobada tiene una sola fotografía, en una de dos formas (sección 2). Cada una se muestra completa, sin recortar ni deformar, dentro del marco de proporción fija de la tarjeta y de la ficha, con su ancho y alto reales para que la página no salte al cargarla; sin foto (los ejemplos de la vista previa, la página de un retirado) se muestra el pictograma de la categoría. No se diseña una galería de varias fotografías mientras el modelo de datos no la admita.
  - **Archivo (`file`), la forma preferida.** La foto se guarda en `src/assets/productos/` con el nombre exacto de `image.file` (también las mayúsculas y minúsculas). La compilación la convierte a WebP en varios anchos (160 a 640 px para la tarjeta, 160 a 1600 px para la ficha, nunca más ancha que el original) y deja otra copia en el formato del archivo (JPEG para un JPEG, PNG para un PNG o un WebP) para el navegador que no lee WebP; el navegador baja solo el ancho que necesita. `npm run check` (`scripts/product-photos.mjs`) exige que cada ficha aprobada con `file` tenga su archivo; que la carpeta no tenga nada más (ni una subcarpeta, ni la foto de un borrador, ni un archivo suelto: «quita el archivo o aprueba su ficha»); y que cada archivo sea de verdad una imagen del formato de su extensión, de 600 a 4000 px por su lado más largo y de 1.5 MB (1,572,864 bytes) como máximo. Sin la carpeta, o vacía, no hay fotos y está bien. Si se compila sin el validador (`npx astro build`) y falta un archivo, la compilación se detiene con un mensaje que nombra la ficha y el archivo.
  - **Dirección (`url`).** Para una foto que no se puede guardar en el repositorio: la página la pide tal cual a ese servidor, sin convertirla, sin decirle de qué página viene (`referrerpolicy="no-referrer"`) y con las medidas que dice la ficha (`width` y `height`, que deben ser las de la foto). Si esa dirección deja de responder, la página muestra el texto alternativo; nada lo comprueba al compilar.
- **Documentos.** Cada documento se enlaza a su origen (`https`) y se abre en otra pestaña. Un enlace que también está en el registro de investigación (por ejemplo, el catálogo general de una marca en PDF) no se publica, salvo un «Sitio del fabricante» de `brands.json`: el validador lo informa. Sin documentos, la ficha ofrece «Solicitar ficha técnica» por WhatsApp. Los PDF de fabricantes no se copian a `public/`.
- **Variantes.** Se guardan dentro de su ficha, cada una con su etiqueta y, cuando el fabricante publica uno para ella, su código original (`manufacturerCode`). Muchos fabricantes publican las tallas sin un código propio (un guante en tallas 7 a 11 bajo un solo código de modelo): entonces la variante lleva solo `id` y `label`, la ficha la muestra con su etiqueta y sin código, y el mensaje de cotización dice «Talla 8» en lugar de «Talla 8 (código)». En una misma ficha pueden convivir variantes con código y sin él. Dos variantes de una ficha no llevan la misma etiqueta. En la ficha se listan como información y, con JavaScript, se eligen en «Agregar a mi cotización» («Talla o color por definir» o una variante; con una sola variante no hay que elegir). La búsqueda encuentra sus códigos. El `id` de una variante es lo que guarda la lista del visitante: no se cambia una vez publicada.
- **Unidad de venta (`saleUnit`).** Se escribe corta y en singular («par», «pieza», «caja»), o con una palabra de unidad seguida de su contenido («caja con 100 piezas»). Es lo que el visitante ve elegido en la unidad de «Agregar a mi cotización», junto a pieza, par, caja y paquete, y lo que lee el mensaje con la cantidad («12 pares», «3 cajas con 100 piezas»). Las palabras de unidad conocidas (pieza, par, caja, paquete, bolsa, rollo, juego, kit, metro, litro, galón, cubeta, docena, millar, unidad) se reconocen en singular y en plural y sin distinguir mayúsculas: «pares» y «par» son la misma unidad, y dos renglones del mismo producto con una y otra son iguales. Con otra primera palabra, la unidad se deja como está y el número se separa («3 × tambo de 200 L»). Mide como máximo 60 caracteres (`MAX_UNIT_LENGTH` de `src/lib/quote-list.mjs`, el largo al que la lista de cotización recorta la unidad en sus opciones, en lo que guarda y en el mensaje), y su primera palabra, si es una de esas palabras de unidad, va sola y en singular: el validador rechaza, en cualquier estado, una unidad más larga, en plural o con un signo pegado a esa palabra («pares,», «(caja)»), porque la lista solo reconoce la palabra sola y escribiría «3 × par, talla única». Lo demás va después de un espacio («par (talla única)»). El mensaje dice solo la palabra que cambia («cambia «pares» por «par»»), nunca la unidad completa: lo que sigue a la palabra puede concordar con ella («piezas sueltas»).

## 7. Identidad de un producto

Un modelo se identifica por marca y código. No se duplica el mismo modelo por aparecer en varios proveedores o categorías: una ficha puede tener varias categorías. Espomega puede ser origen comercial; el producto conserva su marca real, por ejemplo Derma Care.

## 8. Automatización posterior, sin necesitar una base de datos desde hoy

**No está construido.** Una tarea del repositorio podría consultar las fuentes permitidas, conservar `ETag`, fecha y huella, comparar con la versión anterior y proponer cambios en una rama. Tras validación y revisión, se integran y se vuelve a compilar el sitio. Git conserva un historial; los PDF originales y materiales voluminosos se almacenarían aparte según permiso y tamaño.

Una base de datos puede ayudar cuando haya un panel y varios editores, pero no es requisito para detectar cambios o actualizar archivos JSON. Ninguna de esas tareas está programada en este repositorio; el único flujo de GitHub Actions es el control de calidad.

Reglas para el futuro conector:

- Respetar el acceso y las condiciones de la fuente; preferir Excel, CSV o una API entregada por el proveedor.
- Mantener la lista de marcas y modelos habilitados, sin la marca que el proyecto excluye.
- Descargar en un trabajo interno, nunca al abrir cada visita del cliente.
- Separar el cambio de archivo del cambio técnico de producto.
- Conservar el último contenido aprobado ante un error o una extracción dudosa.
- Presentar altas, cambios y posibles retirados para revisión; no borrar porque una fuente devolvió 404 o 503.
- No convertir un catálogo actualizado en una promesa de existencia, precio o entrega.

Las credenciales, costos de proveedor, archivos de clientes y adjuntos no se agregan a Git ni a `public/`. `private-imports/` está excluida del repositorio como ubicación local temporal, no como respaldo durable.

## 9. Cómo busca el catálogo

La búsqueda del catálogo (`src/lib/search.mjs`, con pruebas en `tests/search-words.test.mjs`, `tests/text-search.test.mjs` y `tests/catalog-search.test.mjs`) lee de cada producto el nombre, la marca, el código, los códigos de variante y los nombres de sus categorías, sin distinguir mayúsculas ni acentos y con los códigos también sin separadores («37175» encuentra «37-175»). Un producto aparece si tiene **todas** las palabras de la búsqueda. Cada palabra coincide de una de estas formas:

1. **Tal como se escribió**, en cualquier parte del texto («guant» encuentra «Guante»), o en su forma de código sin separadores.
2. **En singular.** Una palabra hecha solo de letras se busca también en singular, con la primera de estas reglas que aplique: termina en «ces» y tiene al menos 5 letras → «z» y la palabra sin su última «s» («lapices» → «lapiz» y «lapice»); termina en «es» después de «l», «r», «n», «d», «s», «j» o «y», y le quedan al menos 3 letras → sin «es» («overoles» → «overol», «tapones» → «tapon»); termina en «s» pero no en «is» ni en «us», y le quedan al menos 3 letras → sin la «s» («guantes» → «guante»). Un código no tiene singular.
3. **Con un sinónimo revisado.** Tres grupos de palabras que un cliente usa para lo mismo al buscar (`SEARCH_SYNONYMS`): «lente» y «gafa»; «bota» y «calzado»; «orejera», «auditiva» y «auditivo». «gafas» encuentra un «Lente…». No son equivalencias técnicas entre productos.

**Exactitud según el largo.** Una forma en singular o un sinónimo es más corto que lo escrito y podría aparecer por casualidad dentro de otra palabra, así que cuanto más corto, más exacto debe ser:

- 5 letras o más: en cualquier parte del texto («guantes» → «guante» encuentra «Sobreguante»);
- 4 letras: al principio de una palabra («micas» → «mica» encuentra «Mica clara» y no «Protección química»);
- 3 letras: la palabra completa, sola o seguida de «e» («pares» → «par» encuentra «Par …» y no «para»; «bases» → «bas» encuentra «Base» y no «Bastón»).

**Agregar un sinónimo.** Un grupo nuevo, o una palabra nueva en un grupo, necesita la revisión de la persona de ventas: tiene que ser una palabra que los clientes usan para buscar lo mismo, no una equivalencia técnica. Se escribe ya normalizada (sin acentos, en minúsculas y en singular) en `SEARCH_SYNONYMS` de `src/lib/search.mjs`, se agregan a `tests/search-words.test.mjs` un caso que encuentra y otro que no debe encontrar (una palabra que contenga el sinónimo por casualidad), y se revisa la búsqueda en la vista previa.

**Al cargar productos reales.** Los nombres deben llevar las palabras que un cliente busca («Guante de nitrilo», no solo el código), y las categorías también se buscan por su nombre. Un plural irregular o una palabra con otra terminación que la búsqueda no lleva al singular se encuentra escribiendo su raíz. Una búsqueda mide como máximo 200 caracteres. Sin resultados, el catálogo ofrece «Solicitar este producto» con lo buscado.
