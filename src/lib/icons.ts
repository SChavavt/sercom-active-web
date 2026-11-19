// Kit de iconos del sitio (src/assets/icons/icons.json): nombres y utilidades.
// SOLO PARA COMPILACIÓN: lo usan los componentes .astro; los SVG se imprimen en línea en el HTML,
// así que una página solo lleva los iconos que usa. Licencias en docs/licencias-de-terceros.md.
import kit from '../assets/icons/icons.json';

export interface IconDefinition {
  readonly viewBox: string;
  /** Contenido del SVG tal como viene del kit (trazo `currentColor`). */
  readonly body: string;
}

/** Nombre de un icono del kit. TypeScript rechaza un nombre que no exista. */
export type IconName = keyof typeof kit;

const icons: Record<string, IconDefinition> = kit;

/** Definición de un icono; falla al compilar si el nombre no está en el kit. */
export function getIcon(name: IconName): IconDefinition {
  const icon = icons[name];
  if (!icon) throw new Error(`El icono «${String(name)}» no está en src/assets/icons/icons.json.`);
  return icon;
}

/** ¿Existe un icono con este nombre? */
export function isIconName(name: string): name is IconName {
  return Object.hasOwn(icons, name);
}

/**
 * Pictograma de una categoría: `cat-<id>` (por ejemplo `cat-manos`). Una categoría nueva sin dibujo
 * propio usa `package` hasta que se agregue su icono al kit.
 */
export function categoryIcon(categoryId: string): IconName {
  const name = `cat-${categoryId}`;
  return isIconName(name) ? name : 'package';
}
