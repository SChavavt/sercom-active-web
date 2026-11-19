// Textos de ayuda que se repiten en varias páginas, escritos una sola vez.
// SOLO PARA COMPILACIÓN (frontmatter de archivos .astro).
//   - `faqs`: las cinco preguntas frecuentes (brief 6.2, punto 9; textos de la p. 11 del plan, tal cual).
//     Las usan la portada y la página de contacto con el componente Faq.
//   - `helpEntries`: las tres formas de pedir ayuda (brief 6.2, punto 2), para EntryCard. Las usan la portada
//     y la página 404, en este orden. `helpEntry('quoteList')` devuelve una sola: la página de contacto las
//     toma así, una por una, en su propio orden.
// No llevan nombres, números ni correos: los datos de contacto salen de `contact.mjs`.
import type { IconName } from './icons.ts';
import { routes } from './routes.mjs';

export interface FaqItem {
  readonly question: string;
  readonly answer: string;
}

/** Preguntas frecuentes, en el orden de la portada. */
export const faqs: readonly FaqItem[] = Object.freeze([
  { question: '¿Por qué no aparecen precios?', answer: 'La cotización se prepara según el producto, la cantidad y las condiciones del requerimiento.' },
  { question: '¿Todo está en existencia?', answer: 'La disponibilidad y el tiempo de entrega se confirman al cotizar.' },
  { question: '¿Puedo pedir algo que no está aquí?', answer: 'Sí. Compártenos la información del artículo y revisaremos opciones para conseguirlo.' },
  { question: '¿Qué datos envío?', answer: 'Producto o descripción, cantidad y unidad; si aplica, talla, lugar de entrega y fecha requerida.' },
  { question: '¿Hacen productos personalizados?', answer: 'Revisamos requerimientos especiales. La personalización física o fabricación se ofrece solo si se confirma ese servicio.' },
]);

export type HelpEntryId = 'catalog' | 'quoteList' | 'specialRequest';

export interface HelpEntry {
  readonly id: HelpEntryId;
  readonly href: string;
  readonly icon: IconName;
  readonly title: string;
  readonly kicker: string;
  readonly text: string;
}

/** Las tres entradas, en el orden de la portada: explorar, cotizar mi lista, ayúdame a encontrarlo. */
export const helpEntries: readonly HelpEntry[] = Object.freeze([
  { id: 'catalog', href: routes.catalog, icon: 'layout-grid', title: 'Explorar productos', kicker: 'Productos y marcas', text: 'Conoce las categorías y las marcas que manejamos.' },
  { id: 'quoteList', href: routes.quoteList, icon: 'clipboard-list', title: 'Cotizar mi lista', kicker: 'Códigos y cantidades', text: '¿Ya tienes marcas, códigos o cantidades? Envíanos tu lista y preparamos la cotización.' },
  { id: 'specialRequest', href: routes.specialRequest, icon: 'zoom-question', title: 'Ayúdame a encontrarlo', kicker: 'Solicitud especial', text: '¿Buscas un artículo que no identificas o que no aparece? Cuéntanos qué necesitas.' },
]);

/** Una entrada por su clave. */
export function helpEntry(id: HelpEntryId): HelpEntry {
  const entry = helpEntries.find(candidate => candidate.id === id);
  if (!entry) throw new Error(`No existe la entrada de ayuda «${id}».`);
  return entry;
}
