#!/usr/bin/env node
// Ejecuta Astro en modo de vista previa de diseño (CATALOG_PREVIEW=1).
// Existe para que `npm run dev` y `npm run build:preview` funcionen igual en Linux, macOS y Windows:
// la variable se define aquí y no con la sintaxis de cada terminal.
//
// Uso: node scripts/catalog-preview.mjs dev [opciones de astro dev]
//      node scripts/catalog-preview.mjs build [opciones de astro build]   (escribe en dist-preview/)
//
// La vista previa nunca se escribe en dist/, la carpeta de la compilación de producción: `--outDir dist` (o una
// carpeta dentro de dist/) se rechaza aquí con código 2, y astro.config.mjs vuelve a comprobarlo al compilar.
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { previewOutDirError } from '../src/lib/build-mode.mjs';

const PREVIEW_OUT_DIR = 'dist-preview';
const root = fileURLToPath(new URL('..', import.meta.url));
const [command, ...rest] = process.argv.slice(2);

if (command !== 'dev' && command !== 'build') {
  console.error('Uso: node scripts/catalog-preview.mjs <dev|build> [opciones de Astro]');
  process.exit(2);
}

// El ejecutable de Astro se toma de su package.json para no depender de `npx` ni de archivos .cmd.
const astroPackage = new URL('../node_modules/astro/package.json', import.meta.url);
let astroBin;
try {
  const { bin } = JSON.parse(await readFile(astroPackage, 'utf8'));
  astroBin = fileURLToPath(new URL(typeof bin === 'string' ? bin : bin.astro, astroPackage));
} catch {
  console.error('No se encontró Astro en node_modules. Ejecuta "npm ci" primero.');
  process.exit(2);
}

/** Valor de una opción de Astro escrita como «--opcion valor» o «--opcion=valor». */
const option = (/** @type {string} */ name) => {
  const index = rest.findIndex(arg => arg === name || arg.startsWith(`${name}=`));
  if (index === -1) return undefined;
  return rest[index] === name ? rest[index + 1] ?? '' : rest[index].slice(name.length + 1);
};

const args = [command, ...rest];
if (command === 'build') {
  const outDir = option('--outDir');
  if (outDir === undefined) {
    args.push('--outDir', PREVIEW_OUT_DIR);
  } else {
    // Astro resuelve --outDir relativo a --root, y --root relativo a la carpeta del proyecto.
    const error = previewOutDirError(resolve(root, option('--root') ?? '.', outDir), root);
    if (error) {
      console.error(error);
      process.exit(2);
    }
  }
}

const child = spawn(process.execPath, [astroBin, ...args], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, CATALOG_PREVIEW: '1' },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => {
  console.error(`No se pudo iniciar Astro: ${error.message}`);
  process.exit(1);
});
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
