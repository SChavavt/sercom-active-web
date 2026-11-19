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
| Variables | `SITE_URL` con la dirección real, al lanzar (sección 4). `CATALOG_PREVIEW` **nunca** se define: sin ella se compila producción. |

Los tres últimos pasos de la compilación revisan `dist/` (reglas, enlaces y marcado): si alguno falla, la compilación falla y no se publica nada. La misma orden está en `vercel.json` (`buildCommand`). Si el alojamiento no permite definir la instalación, se deja que la detecte por `package-lock.json`.

## 3. Alojamiento propuesto

Propuesto el 18 de noviembre de 2026; **el propietario no ha respondido**. Los fundamentos y la comparación están en [`arquitectura.md`](arquitectura.md).

- Mientras se construye el sitio: no se publica nada y no se paga nada.
- Al lanzar (paso 4): **Cloudflare Pages, plan gratuito**, en una cuenta abierta por el propietario o por Sercom.
- El plan gratuito de Vercel (Hobby) no se usa para este sitio: sus términos lo limitan a uso personal o no comercial. Vercel Pro (precio base publicado de 20 dólares al mes por equipo) sigue siendo posible más adelante; la salida estática funciona en los dos y `vercel.json` se mantiene listo.

**Vista previa en una dirección web.** Está pendiente de que el propietario diga si se permite. Si se hace, se compila con `npm run build:preview` (salida `dist-preview/`), conserva su aviso, sus etiquetas «Ejemplo» y `noindex`, necesita su propia `SITE_URL` si sus borradores deben llevar el enlace en el HTML, y nunca es la dirección del QR.

**Cloudflare Pages**, cuando exista la cuenta: conectar solo el repositorio de Sercom Active, elegir Astro, raíz del repositorio y los ajustes de la sección 2. La disponibilidad del nombre del proyecto y de su subdominio se confirma al crearlo; no se imprimen direcciones supuestas.

**Vercel Pro**, si se elige más adelante: importar el repositorio al equipo elegido; `vercel.json` ya fija instalación, compilación, salida y Astro. Confirmar plan y límites de gasto antes de desplegar. El archivo no crea recursos ni despliega por sí mismo.

## 4. Lista de lanzamiento

Ningún punto se hace antes de que el propietario apruebe publicar.

**Antes de tocar el código: confirmaciones del negocio.** Las que bloquean la publicación están en [`ESTADO.md`](ESTADO.md#7-pendiente-del-negocio): textos, aviso de privacidad, prueba real de WhatsApp, categorías y productos aprobados, dirección y atención presencial, marca en la posición 17, logotipo vectorial y condiciones comerciales.

**Retirar** (los tres a propósito, en el mismo cambio):

1. El `<meta name="robots" content="noindex, nofollow" />` de `src/layouts/BaseLayout.astro`, con el comentario que lo precede. `noindex` no hace privado un sitio: cualquiera con la dirección puede abrirlo.
2. El bloqueo de `public/robots.txt` (`User-agent: *` / `Disallow: /`): reemplazarlo por uno que permita el rastreo y nombre el sitemap.
3. El aviso de sitio en preparación: la línea `{!isPreview && <SiteNotice kind="development" />}` de `src/layouts/BaseLayout.astro`, con su comentario. La vista previa conserva su propio aviso.

**Agregar:**

1. `SITE_URL` con la dirección definitiva en las variables del alojamiento. Con ella cada página declara su dirección canónica (la 404 nunca la declara) y los borradores de producto llevan la dirección de la ficha escrita en el HTML, también sin JavaScript.
2. Un sitemap (hoy no existe: antes del lanzamiento el escáner lo prohíbe).
3. Metadatos para compartir (título, descripción e imagen para redes y mensajería). Hoy no existen.

**Cambiar las comprobaciones:** agregar `--launch` al escáner de producción en `npm run verify` (`package.json`), en `vercel.json` y en la orden de compilación del alojamiento (`node scripts/scan-dist.mjs dist --strict --launch`). Sin `--launch` el escáner exige el `noindex`, el `robots.txt` bloqueante y el aviso (R-RULE-12); con `--launch` exige lo contrario y falla mientras quede cualquiera de los tres (R-PUB-03). Revisar entonces también `--strict` si ya hay normas con fuente (paso 3).

**Probar:** compilar con `SITE_URL`, ejecutar las comprobaciones, revisar el sitio en computadora, tableta y celular, abrir un borrador de WhatsApp y uno de correo desde un teléfono real y confirmar que llegan a la persona de contacto. Documentar en `ESTADO.md` cómo volver a la versión anterior en el alojamiento elegido.

## 5. QR y dominio

Propuesto, no hecho:

- El QR de las tarjetas debe apuntar a un **subdominio de un dominio que controle Sercom**, para que la dirección impresa sobreviva a un cambio de alojamiento. Este proyecto nunca modifica `sercomactive.com` ni supone acceso a ese dominio: el subdominio lo configura quien lo administre.
- Nunca apunta a una vista previa ni a una dirección de un despliegue concreto.
- Se genera solo con una dirección pública estable ya probada, y se prueba impreso en tamaño real con varios teléfonos.
- Si el sitio cambia de alojamiento, la dirección impresa sigue funcionando y redirige.
