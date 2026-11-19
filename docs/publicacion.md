# Preparar GitHub y publicar después

## Repositorio de GitHub

Repositorio: [SChavavt/sercom-active-web](https://github.com/SChavavt/sercom-active-web). El propietario lo creó y confirmó continuar con visibilidad pública. El commit inicial se conserva; no se reescribe su historia.

Para trabajar desde una computadora:

```bash
git clone https://github.com/SChavavt/sercom-active-web.git
cd sercom-active-web
npm ci
npm run check
npm test
npm run build
```

Para aportar cambios, crear una rama desde `main`, modificar los archivos y revisar las comprobaciones de GitHub Actions. No crear otro repositorio del mismo nombre ni forzar el push. La configuración de Actions comprueba el proyecto; no publica un sitio ni activa consultas periódicas a proveedores.

El PDF del plan y las fuentes públicas se incluyen por confirmación del propietario. No agregar contraseñas, tokens, archivos de clientes o condiciones comerciales privadas.

## Cloudflare Pages — opción recomendada de arranque

Con el repositorio disponible y acceso a una cuenta del responsable del sitio:

- Conectar únicamente el repositorio de Sercom al proyecto de Pages.
- Framework: Astro.
- Directorio raíz: raíz del repositorio.
- Instalación: `npm ci`, si el panel permite definirla; de otro modo conservar detección por lockfile.
- Compilación: `npm run check && npm test && npm run build && node scripts/scan-dist.mjs dist --strict && node scripts/check-links.mjs dist && node scripts/check-markup.mjs dist`. Los tres últimos pasos revisan la salida de `dist/` (reglas, enlaces y marcado): si fallan, no se publica nada.
- Salida: `dist`.
- Versión de Node: 24, consistente con `.nvmrc`.
- Rama de producción: `main`.
- Definir `SITE_URL` con la URL real después de crear el proyecto.

La versión inicial es estática y no requiere Workers, D1, adaptador de servidor ni variables secretas. La disponibilidad del nombre y la URL se confirman al crear el alojamiento. No imprimir direcciones supuestas.

## Vercel — alternativa si se confirma Pro

Importar el repositorio al equipo elegido; usar Astro, Node.js 24 y la configuración `vercel.json`. Confirmar plan comercial y límites de gasto antes de desplegar. La configuración incluida no crea recursos ni ejecuta un despliegue por sí misma.

No se requieren Supabase, Neon ni una integración de base de datos. Si después se adopta un backend, vincular el proyecto y comprobar variables antes de correr migraciones; nunca poner claves privadas en variables públicas del navegador.

## Antes del lanzamiento comercial

Completar catálogo y recorridos del plan. La portada mínima actual no es la entrega completa. Probar contactos, revisar contenido con Yosmara, completar privacidad según el flujo implementado y verificar experiencia en computadora, tableta y celular.

Retirar la etiqueta de desarrollo, el meta `noindex, nofollow` de `BaseLayout.astro` y el bloqueo de `public/robots.txt` cuando el sitio esté aprobado para indexar. Añadir URL canónica, sitemap y metadatos de compartir con la URL definitiva. `noindex` no hace privado un sitio accesible por URL.

## QR y dominio posterior

El QR debe apuntar a la dirección estable de producción del proyecto, nunca a una vista previa por commit. No se generó QR en esta etapa. Probarlo impreso en tamaño real con varios teléfonos.

Al añadir un dominio propio después, mantener funcionando la dirección impresa y configurar su redirección si el proveedor lo permite. No borrar o renombrar el alojamiento del que dependan las tarjetas sin un plan para conservar ese enlace. Sercom puede seguir compartiendo la misma URL del subdominio mientras se decide el dominio.
