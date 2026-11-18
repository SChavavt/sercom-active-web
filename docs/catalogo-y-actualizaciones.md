# Carga y mantenimiento del catálogo

## Qué está disponible

`research/Sercom_Active_Fuentes_Catalogos.json` es el registro original de investigación: 19 entidades y 35 referencias, con estado y siguiente acción. Incluye 18 marcas y un proveedor; no son 19 catálogos completos listos para importar. Algunas URLs son históricas o están pendientes de acceso. La validación estructural del proyecto no vuelve a descargar las fuentes.

`src/data/catalog.json` contiene categorías candidatas en borrador y cero productos. Esto evita publicar un inventario o una oferta sin validar. Las fichas se cargarán después de escoger modelos reales.

## Flujo de edición inicial

1. Obtener material oficial y confirmar los modelos que Sercom puede suministrar.
2. Incorporar cada ficha como `draft`, conservando marca, código exacto, categorías y fuente.
3. Completar descripción, 3-5 características verificadas, unidad, imagen y variantes aplicables.
4. Revisar el uso de imágenes y documentos. No asumir derechos por estar disponibles en Internet.
5. Registrar revisión comercial y pasar a `approved` cuando corresponda. Las categorías también deben aprobarse.
6. Ejecutar `npm run check`, `npm test` y `npm run build`, revisar la diferencia y la página generada.
7. Incorporar la versión revisada a `main`. Al conectar el alojamiento, sus compilaciones publicarán los cambios.

El código permite la publicación de aprobados mediante `getPublishedProducts`, que elimina metadatos internos. Falta conectar esa salida a las futuras pantallas del catálogo. Un campo booleano no sustituye la revisión humana ni confirma inventario.

## Identidad y variantes

Un modelo se identifica por marca y código. Variantes como talla/color se guardan dentro de esa ficha con su código original. No duplicar el mismo modelo por aparecer en varios proveedores o categorías. Espomega puede ser origen comercial; el producto debe conservar su marca real, por ejemplo Derma Care.

## Automatización posterior, sin necesitar una base de datos desde hoy

Una tarea del repositorio puede consultar las fuentes permitidas, conservar `ETag`, fecha y huella, comparar con la versión anterior y proponer cambios en una rama. Tras validación y revisión, se integran y se vuelve a compilar el sitio. Git conserva un historial; los PDFs originales y materiales voluminosos deben almacenarse aparte según permiso y tamaño.

Una base de datos puede ayudar cuando hay un panel y varios editores, pero no es requisito para detectar cambios o actualizar archivos JSON. Ninguna de esas tareas está programada en este repositorio; el único workflow preparado es el control de calidad de cambios de código.

Reglas del futuro conector:

- Respetar el acceso y las condiciones de la fuente; preferir Excel/CSV o API/feed entregado por proveedor.
- Mantener lista de marcas y modelos habilitados y excluir GISA.
- Descargar en servidor/trabajo interno, nunca al abrir cada visita del cliente.
- Separar cambio de archivo de cambio técnico de producto.
- Conservar último contenido aprobado ante un error o una extracción dudosa.
- Presentar altas, cambios y posibles retirados para revisión; no borrar porque una fuente devolvió 404/503.
- No convertir un catálogo actualizado en una promesa de existencia, precio o entrega.

Las credenciales, costos de proveedor, archivos de clientes y adjuntos no se agregan a Git ni a `public/`. `private-imports/` está excluida del repositorio como ubicación local temporal, no como respaldo durable.
