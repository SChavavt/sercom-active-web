# Comprobar, alojar y publicar

Qué se ejecuta antes de proponer un cambio, qué debe ejecutar un alojamiento, qué falta para lanzar el sitio y cómo se piensa el QR. **Nada está publicado:** no se ha creado ninguna cuenta ni proyecto de alojamiento, no se ha comprado un dominio y no se ha desplegado ninguna versión.

## 1. Repositorio y comprobaciones locales

Repositorio: [SChavavt/sercom-active-web](https://github.com/SChavavt/sercom-active-web), público por decisión del propietario. El trabajo del paso 1 está en la rama `claude/project-thread-xtacqo`, en la solicitud de cambios (pull request) n.º 1, en borrador; `main` todavía no lo tiene.

```bash
git clone https://github.com/SChavavt/sercom-active-web.git
cd sercom-active-web
npm ci
npm run check     # valida los datos y revisa los tipos
npm test          # pruebas
npm run verify    # compila producción y vista previa y revisa reglas, enlaces y marcado en ambas
```

Se necesita Node.js 24 (`.nvmrc`). Para aportar cambios se crea una rama, se ejecutan las tres comprobaciones y se revisa el resultado de GitHub Actions (`.github/workflows/quality.yml`), que repite `check`, `test`, `build` y `verify` en cada solicitud de cambios y en cada envío a `main`. Actions no publica nada ni consulta proveedores. Qué revisa cada comprobación: [`datos-y-modos.md`](datos-y-modos.md#6-las-protecciones).

El PDF del plan y las fuentes públicas se incluyen por confirmación del propietario. No se agregan contraseñas, tokens, archivos de clientes ni condiciones comerciales privadas.

## 2. Lo que debe ejecutar un alojamiento

El sitio es estático: el alojamiento solo compila y sirve la carpeta `dist/`. No requiere servidor, Workers, base de datos, adaptador ni variables secretas.

| Ajuste | Valor |
| --- | --- |
| Instalación | `npm ci` |
| Compilación | `npm run check && npm test && npm run build && node scripts/scan-dist.mjs dist --strict && node scripts/check-links.mjs dist && node scripts/check-markup.mjs dist` |
| Salida | `dist` |
| Node | 24 (como `.nvmrc`) |
| Rama de producción | `main` |
| Variables | `SITE_URL` con la dirección real, al lanzar (sección 4), como variable de entorno del alojamiento: un archivo `.env` no la aplica. `CATALOG_PREVIEW` **nunca** se define: sin ella se compila producción. |

Los tres últimos pasos de la compilación revisan `dist/` (reglas, enlaces y marcado): si alguno falla, la compilación falla y no se publica nada. La misma orden está en `vercel.json` (`buildCommand`). Si el alojamiento no permite definir la instalación, se deja que la detecte por `package-lock.json`.

## 3. Alojamiento propuesto

Propuesto el 18 de noviembre de 2026; **el propietario no ha respondido**. Los fundamentos y la comparación están en [`arquitectura.md`](arquitectura.md).

- Mientras se construye el sitio: no se publica nada y no se paga nada.
- Al lanzar (paso 4): **Cloudflare Pages, plan gratuito**, en una cuenta abierta por el propietario o por Sercom.
- El plan gratuito de Vercel (Hobby) no se usa para este sitio: sus términos lo limitan a uso personal o no comercial. Vercel Pro (precio base publicado de 20 dólares al mes por equipo) sigue siendo posible más adelante; la salida estática funciona en los dos y `vercel.json` se mantiene listo.

**Vista previa en una dirección web.** Está pendiente de que el propietario diga si se permite. Si se hace, se compila con `npm run build:preview` (salida `dist-preview/`), conserva su aviso y sus etiquetas «Ejemplo», necesita su propia `SITE_URL` si sus borradores deben llevar el enlace en el HTML, y nunca es la dirección del QR. Hoy lleva además `noindex` y el `robots.txt` bloqueante; después del lanzamiento los conserva solo si se resuelve el punto pendiente de la sección 4.

**Cloudflare Pages**, cuando exista la cuenta: conectar solo el repositorio de Sercom Active, elegir Astro, raíz del repositorio y los ajustes de la sección 2. La disponibilidad del nombre del proyecto y de su subdominio se confirma al crearlo; no se imprimen direcciones supuestas.

**Vercel Pro**, si se elige más adelante: importar el repositorio al equipo elegido; `vercel.json` ya fija instalación, compilación, salida y Astro. Confirmar plan y límites de gasto antes de desplegar. El archivo no crea recursos ni despliega por sí mismo.

## 4. Lista de lanzamiento

Ningún punto se hace antes de que el propietario apruebe publicar.

**Antes de tocar el código: confirmaciones del negocio.** Las que bloquean la publicación están en [`ESTADO.md`](ESTADO.md#7-pendiente-del-negocio): textos, aviso de privacidad, prueba real de WhatsApp, categorías y productos aprobados, dirección y atención presencial, marca en la posición 17, logotipo vectorial y condiciones comerciales.

**Pendiente de decidir antes de retirar nada: la vista previa.** El `<meta name="robots">` de `src/layouts/BaseLayout.astro` y `public/robots.txt` son **de las dos compilaciones**: `BaseLayout` imprime el mismo `meta` en producción y en la vista previa, y todo `public/` se copia a `dist/` y a `dist-preview/`. Si se retiran tal como están, la vista previa también deja de pedir que no la indexen, y `npm run verify` falla, porque el escáner de la vista previa (sin `--launch`) sigue exigiendo los dos: en una copia de prueba falló R-RULE-12 en cada página de la vista previa (sin `noindex`) y en su `robots.txt`. Hay que elegir en el mismo cambio del lanzamiento una de estas salidas; ninguna está hecha:

- **Conservar el bloqueo en la vista previa** (lo que suponen estos documentos: la vista previa nunca se indexa): imprimir el `meta` solo en ella (`{isPreview && <meta name="robots" content="noindex, nofollow" />}`) y darle un `robots.txt` bloqueante propio, que hoy no existe porque `public/` es común; por ejemplo, generar `robots.txt` según el modo en lugar de copiarlo de `public/`. El escáner de la vista previa sigue igual.
- **No publicar nunca `dist-preview/`** y cambiar cómo `npm run verify` revisa la vista previa (por ejemplo, con su propia opción para R-RULE-12). Esta salida deja de cumplir lo que dicen [`README.md`](../README.md) y la sección 3 si alguna vez se coloca una vista previa en una dirección web.

**Retirar** de producción (los tres a propósito, en el mismo cambio):

1. El `<meta name="robots" content="noindex, nofollow" />` de `src/layouts/BaseLayout.astro`, con el comentario que lo precede, según la salida elegida arriba. `noindex` no hace privado un sitio: cualquiera con la dirección puede abrirlo.
2. El bloqueo de `public/robots.txt` (`User-agent: *` / `Disallow: /`): reemplazarlo por uno que permita el rastreo y nombre el sitemap, según la salida elegida arriba.
3. El aviso de sitio en preparación: la línea `{!isPreview && <SiteNotice kind="development" />}` de `src/layouts/BaseLayout.astro`, con su comentario. El aviso se quita del marcado; esconderlo no basta (`hidden`, `aria-hidden`, `display:none`, un `<template>`, un `<details>` cerrado o una regla de estilo): con `--launch` el escáner lo busca en todo el texto de los elementos, oculto o no, y lo sigue encontrando (R-PUB-03). La vista previa conserva su propio aviso.

**Agregar:**

1. `SITE_URL` con la dirección definitiva en las variables del alojamiento. Con ella cada página declara su dirección canónica (la 404 nunca la declara) y los borradores de producto llevan la dirección de la ficha escrita en el HTML, también sin JavaScript. `astro.config.mjs` la lee de `process.env`: tiene que ser una variable de entorno real; una línea en un archivo `.env` se ignora sin aviso y la compilación sale sin dirección canónica. Para probarla en una computadora: `SITE_URL=https://… npm run build`.
2. Un sitemap (hoy no existe: antes del lanzamiento el escáner lo prohíbe).
3. Metadatos para compartir (título, descripción e imagen para redes y mensajería). Hoy no existen.

**Cambiar las comprobaciones:** agregar `--launch` al escáner de producción en `npm run verify` (`package.json`), en `vercel.json` y en la orden de compilación del alojamiento (`node scripts/scan-dist.mjs dist --strict --launch`). Sin `--launch` el escáner exige el `noindex`, el `robots.txt` bloqueante y el aviso (R-RULE-12); con `--launch` exige lo contrario y falla mientras quede cualquiera de los tres, el aviso también oculto (R-PUB-03). Revisar entonces también `--strict` si ya hay normas con fuente (paso 3). En el mismo cambio se actualizan las dos pruebas de `tests/build-mode.test.mjs` que fijan la orden de `npm run verify` y el `buildCommand` de `vercel.json` ([`datos-y-modos.md`](datos-y-modos.md#62-pruebas)); si no, `npm test` falla.

**Probar:** compilar con `SITE_URL`, ejecutar las comprobaciones, revisar el sitio en computadora, tableta y celular, abrir un borrador de WhatsApp y uno de correo desde un teléfono real y confirmar que llegan a la persona de contacto. Documentar en `ESTADO.md` cómo volver a la versión anterior en el alojamiento elegido.

**Por comprobar en el alojamiento elegido** (no hay procedimiento escrito todavía, porque no existe la cuenta): cómo se vuelve a un despliegue anterior y quién puede hacerlo; que una dirección desconocida reciba la página `404.html` con estado 404; y cómo trata las direcciones sin diagonal final, ya que el sitio usa `trailingSlash: 'always'` (`/catalogo/`) y cada página es un `index.html` dentro de su carpeta. El resultado se anota en `ESTADO.md` antes de imprimir el QR.

## 5. QR y dominio

Propuesto, no hecho:

- El QR de las tarjetas debe apuntar a un **subdominio de un dominio que controle Sercom**, para que la dirección impresa sobreviva a un cambio de alojamiento. Este proyecto nunca modifica `sercomactive.com` ni supone acceso a ese dominio: el subdominio lo configura quien lo administre.
- Nunca apunta a una vista previa ni a una dirección de un despliegue concreto.
- Se genera solo con una dirección pública estable ya probada, y se prueba impreso en tamaño real con varios teléfonos.
- Si el sitio cambia de alojamiento, la dirección impresa sigue funcionando y redirige.
