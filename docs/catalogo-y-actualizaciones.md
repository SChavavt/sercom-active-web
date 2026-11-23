# Carga y mantenimiento del catálogo

Cómo se agrega, se aprueba, se corrige y se retira un producto real, comprobado contra el validador (`src/lib/catalog-policy.mjs`) y los tipos (`src/types/catalog.ts`) actuales. Los productos reales llegan en el paso 3 (catálogo piloto de 30 a 50 productos); hasta entonces `src/data/catalog.json` no tiene fichas y las páginas se revisan con los ejemplos de la vista previa (ver [`datos-y-modos.md`](datos-y-modos.md)).

## 1. Qué está disponible

`research/Sercom_Active_Fuentes_Catalogos.json` es el registro original de investigación: 19 entidades y 35 referencias, con estado y siguiente acción. Incluye 18 marcas y un proveedor; no son 19 catálogos completos listos para importar. Algunas URLs son históricas o están pendientes de acceso. La validación del proyecto no vuelve a descargar las fuentes.

`src/data/catalog.json` contiene las diez categorías candidatas, todas en borrador, y ninguna ficha. Esto evita publicar un inventario o una oferta sin validar.

## 2. Campos de una ficha y lo que exige el validador

Cada producto de `catalog.json` es un objeto con estos campos y ningún otro (un campo desconocido se rechaza):

| Campo | Contenido | Regla |
| --- | --- | --- |
| `id` | Identificador | Minúsculas, cifras y guiones (`guante-nitrilo-37-175`); único. Es la dirección de la página: `/productos/{id}/`. |
| `brandId` | Marca | Un `id` de `brands.json` de tipo `brand` (un proveedor no es una marca). |
| `model` | Modelo o código exacto del fabricante | No vacío; único dentro de la misma marca. Es el «Código» que se muestra y se busca. |
| `name` | Nombre visible | No vacío. |
| `categoryIds` | Categorías | Al menos una; todas deben existir en `catalog.json`. |
| `status` | Estado editorial | `draft`, `in_review`, `approved` o `retired` (sección 4). |
| `description` | Resumen | Texto. Obligatorio para `approved`. |
| `characteristics` | Características verificadas | Lista de textos; de 3 a 5 para `approved`. |
| `saleUnit` | Unidad de venta (`par`, `pieza`, `caja`…) | Obligatoria para `approved`. Se escribe corta y en singular (sección 6); el validador solo exige que no esté vacía. |
| `variants` | Tallas, colores o presentaciones | Lista de `{ id, label, manufacturerCode }`: `id` en el formato de arriba y único en la ficha, etiqueta y código del fabricante no vacíos. |
| `image` | Fotografía | `{ url, alt, sourceUrl, usageConfirmed }`: `url` y `sourceUrl` con `https`, texto alternativo, y `usageConfirmed: true`. Obligatoria para `approved`. |
| `source` | Fuente revisada | `{ url, checkedOn }`: `https` y fecha `AAAA-MM-DD` válida. Obligatoria para `approved`. |
| `approval` | Aprobación comercial | `{ by, on, supplyConfirmed }`: quién aprobó, fecha `AAAA-MM-DD` válida y `supplyConfirmed: true`. Obligatoria para `approved` y para que un retirado conserve su página. |
| `documents` | Fichas técnicas u otros documentos | Lista de `{ label, url }` con `https`. Opcional. |

Además, en todo el archivo:

- Ninguna clave se llama `price`, `precio`, `cost` o `costo` (en singular o plural), `stock`, `inventory` ni `inventario`: el sitio no publica esos datos. Otras formas (`existencias`, `stocks`, `inventarios`) el validador no las rechaza; tampoco deben usarse.
- La marca excluida no puede aparecer en `id`, `brandId`, `model`, `name` ni en el nombre de la marca.
- Lo reservado a los ejemplos se rechaza: un `id` que empieza con `ejemplo-`, un nombre con «de ejemplo» y un código (`model` o de variante) que empieza con `EJ-` y una cifra.
- Una ficha `approved` exige que **todas** sus categorías estén aprobadas.

Un solo error, aunque sea de una ficha en `draft`, detiene la validación y la compilación de los dos modos: `getPublishedProducts` no entrega nada si `validateCatalog` encuentra un problema. Un borrador incompleto puede quedarse en el archivo (el validador solo exige lo de `approved` a las fichas aprobadas), pero sus campos deben tener la forma correcta.

Lo que el validador no revisa todavía: el texto de los campos de producto frente a las reglas de afirmaciones del sitio. Un texto legítimo de fabricante puede hacer fallar el escáner; está descrito en [`datos-y-modos.md`](datos-y-modos.md#7-límite-conocido-las-reglas-de-afirmaciones-y-el-texto-de-los-productos) y se decide antes de cargar el piloto.

## 3. Flujo para agregar un producto real

1. Obtener material del fabricante y confirmar con el contacto comercial los modelos que Sercom Active puede suministrar.
2. Agregar la ficha como `draft` con `id`, `brandId`, `model`, `name`, `categoryIds` y `source`. Mientras esté en `draft` o `in_review` no aparece en ninguna compilación.
3. Completar `description`, de 3 a 5 `characteristics` verificadas en la fuente, `saleUnit`, las `variants` aplicables con su código original y los `documents` que se puedan enlazar.
4. Revisar el uso de la imagen y de los documentos: no se asumen derechos por estar disponibles en Internet. Registrar `image.sourceUrl` y poner `usageConfirmed: true` solo con el uso confirmado.
5. Con la revisión del contacto comercial, registrar `approval` (`by`, `on`, `supplyConfirmed: true`) y pasar a `approved`. Si su categoría sigue en borrador, aprobarla también (ver [`datos-y-modos.md`](datos-y-modos.md#93-cómo-aprobar-una-categoría)).
6. Actualizar las pruebas que fijan «ningún producto real». Hoy varias pruebas dan por hecho que el catálogo real no tiene fichas y que las categorías están en borrador, y algunas agregan una ficha de prueba a una copia del catálogo real esperando conteos fijos: aprobar el primer producto (con su categoría) hace fallar pruebas de `tests/categories.test.mjs`, `tests/site-data.test.mjs`, `tests/build-output.test.mjs`, `tests/scan-dist.test.mjs`, `tests/retired-products.test.mjs` y `tests/text-search.test.mjs` (la lista, en [`datos-y-modos.md`](datos-y-modos.md#62-pruebas)). Se corrigen en el mismo cambio, de modo que sigan probando la regla con el catálogo que haya; conviene hacerlo una vez, al cargar el primer producto del piloto, para que dependan menos de los datos.
7. Ejecutar `npm run check` y los archivos de prueba de lo que cambió (entre ellos los del paso 6), revisar la diferencia y la página generada en la compilación de producción (`npm run build` y `npm run preview`); la batería completa y `npm run verify` corren en GitHub con la solicitud de cambios. Con el primer producto aparecen también la búsqueda del encabezado, los filtros del catálogo y «Agregar a mi cotización».
8. Integrar el cambio en `main`. Cuando haya alojamiento conectado, su compilación publicará el cambio (hoy no hay ninguno).

`getPublishedProducts` entrega a las páginas solo lo público (sin aprobación, fuente ni uso de imagen). Un campo booleano no sustituye la revisión humana ni confirma inventario.

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

Solo si el producto debe desaparecer por completo (su dirección da 404) se quita también `approval`. Volver a publicarlo es devolverlo a `approved` con sus datos completos.

**Qué pasa con la lista de un visitante.** Un visitante puede tener el producto guardado en «Mi cotización» (en su navegador; el sitio no lo sabe ni puede cambiarlo). Mientras el retirado conserve su página, «Cotizar mi lista» lo muestra con su nombre y «Producto retirado: no se incluye en tu mensaje.», con «Quitar»; no va en el mensaje. Si además se quita `approval`, la página ya no lo conoce: queda entre los productos que no ubica, con «Quitarlo de mi cotización», y tampoco va en el mensaje. En los dos casos el renglón guardado no se borra hasta que el visitante lo quita. Lo mismo pasa con una variante que se borra de una ficha: el renglón que la tenía elegida queda entre los que la página no ubica. Por eso una variante no se borra ni cambia de `id` para corregir su etiqueta: se corrige la etiqueta ([`datos-y-modos.md`](datos-y-modos.md#10-la-lista-guardada-en-el-navegador)).

**Qué muestra la página.** La ruta, el pictograma de su categoría (nunca una fotografía), la categoría pública y el nombre (H1), las filas Marca y Código, el aviso «Producto retirado» con «Este producto ya no forma parte del catálogo.» y «Dinos qué necesitas y revisamos alternativas.», las acciones «Consultar alternativas» (WhatsApp) y «Consultar por correo» con el borrador de alternativas, la banda de solicitud especial y «Más productos…». Su título es «{nombre} (producto retirado) · Sercom Active».

**Qué nunca muestra.** Acciones para cotizar o pedir la ficha técnica, unidad de venta, resumen, características, variantes, documentación, el aviso de disponibilidad ni la banda de ayuda de la ficha: nadie mantiene ya esos datos y el producto no se cotiza.

**El ejemplo de la vista previa.** `src/data/preview/example-products.json` tiene un ejemplo con `"retired": true`, «Producto de ejemplo retirado». Solo existe en la vista previa y ninguna página lo enlaza: se abre escribiendo la dirección `/productos/ejemplo-producto-retirado/` en el servidor de `npm run dev` o de la vista previa compilada.

**Qué lo protege.** El escáner (R-RULE-14) exige que existan exactamente las páginas de los retirados públicos y ninguna de un retirado sin aprobación. El verificador de marcado comprueba que una página de producto sea ficha o retirado, nunca las dos (R-STATE-04a), que el aviso y las dos acciones estén completos (R-STATE-04b), que haya un solo H1 antes del aviso y el título lleve «(producto retirado)» (R-STATE-04c) y que no aparezca nada de la ficha (R-STATE-04d). Detalle en [`datos-y-modos.md`](datos-y-modos.md#65-verificador-de-marcado).

## 6. Imágenes, documentos y variantes

- **Imágenes.** Hoy una ficha aprobada tiene una sola fotografía, con dirección absoluta `https`, que la página usa tal cual dentro de un marco de proporción fija. **Pendiente para el paso 3:** ampliar el esquema de imagen (archivo local optimizado o dirección absoluta, con ancho y alto) con sus pruebas, antes de cargar el piloto. No se diseña una galería de varias fotografías mientras el modelo de datos no la admita.
- **Documentos.** Cada documento se enlaza a su origen (`https`) y se abre en otra pestaña. Sin documentos, la ficha ofrece «Solicitar ficha técnica» por WhatsApp. Los PDF de fabricantes no se copian a `public/`.
- **Variantes.** Se guardan dentro de su ficha con el código original del fabricante. En la ficha se listan como información y, con JavaScript, se eligen en «Agregar a mi cotización» («Talla o color por definir» o una variante; con una sola variante no hay que elegir). La búsqueda encuentra sus códigos. El `id` de una variante es lo que guarda la lista del visitante: no se cambia una vez publicada.
- **Unidad de venta (`saleUnit`).** Se escribe corta y en singular («par», «pieza», «caja»), o con una palabra de unidad seguida de su contenido («caja con 100 piezas»). Es lo que el visitante ve elegido en la unidad de «Agregar a mi cotización», junto a pieza, par, caja y paquete, y lo que lee el mensaje con la cantidad («12 pares», «3 cajas con 100 piezas»). Las palabras de unidad conocidas (pieza, par, caja, paquete, bolsa, rollo, juego, kit, metro, litro, galón, cubeta, docena, millar, unidad) se reconocen en singular y en plural y sin distinguir mayúsculas: «pares» y «par» son la misma unidad, y dos renglones del mismo producto con una y otra son iguales. Con otra primera palabra, la unidad se deja como está y el número se separa («3 × tambo de 200 L»). Debe medir como máximo 60 caracteres: el validador no lo revisa y la ficha la muestra entera, pero la lista de cotización la recorta a 60 en sus opciones, en lo que guarda y en el mensaje.

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
