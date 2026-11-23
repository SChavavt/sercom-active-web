// @ts-check
// Enlaces de WhatsApp y de correo, y plantillas de mensaje, con los datos de `src/data/business.json`.
// Para cambiar el contacto se edita ese archivo; aquí no hay nombres, números ni correos escritos.
//
// Exporta `contactDetails` (los datos que se muestran, sin dirección), `contactLinks` (los enlaces de cada borrador),
// `messages` y `subjects` (textos y asuntos), `whatsappUrl`, `mailtoUrl`, `absoluteUrl` y `contactFromBusiness`.
//
// SOLO PARA COMPILACIÓN (frontmatter de archivos .astro) y pruebas. Un <script> de navegador no debe
// alcanzarlo, ni directamente ni a través de otro módulo: arrastraría `business.json` completo, con datos que no se
// publican. Los scripts del navegador solo alcanzan los módulos sin datos de `BROWSER_MODULES`
// (tests/build-mode.test.mjs); de `contact-core.mjs` usan lo que trabaja sobre un `href` ya construido (`withPageLink`,
// `withFieldValues`, `withMessage`, `draftLinks`…) y lo que arma el texto de un mensaje (`composeListMessage`,
// `listItem`). Ver docs/datos-y-modos.md, secciones 2 y 4.
//
// Abrir WhatsApp o el correo no envía nada: la página nunca debe mostrar una confirmación de recepción.
import business from '../data/business.json' with { type: 'json' };
import { createContact } from './contact-core.mjs';

export { absoluteUrl } from './contact-core.mjs';

if (typeof document !== 'undefined') {
  throw new Error('contact.mjs es solo para compilación: en el navegador usa contact-core.mjs.');
}

/**
 * `createContact` con los datos del negocio. Si los rechaza (por ejemplo, whatsappDisplay y whatsappDigits no son el
 * mismo número), el error dice además en qué archivo se corrigen: contact-core.mjs también llega al navegador y no
 * nombra archivos, y Astro solo muestra dónde se cargó el módulo.
 * @param {Parameters<typeof createContact>[0]} settings
 */
export function contactFromBusiness(settings) {
  try {
    return createContact(settings);
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)} Los datos están en src/data/business.json.`, { cause: error });
  }
}

/**
 * Datos de contacto para mostrar en las páginas (encabezado, pie, bloque de atención personal).
 * Es una proyección de `business.json`: la dirección y los campos internos no salen de aquí.
 * @type {import('../types/contact.ts').ContactDetails}
 */
export const contactDetails = Object.freeze({
  businessName: business.name,
  locationLabel: business.locationLabel,
  titleLabel: business.titleLabel,
  contactName: business.contactName,
  contactFirstName: business.contactFirstName,
  contactInitials: business.contactInitials,
  email: business.email,
  whatsappDisplay: business.whatsappDisplay,
  hoursText: business.hoursText,
  hoursShortText: business.hoursShortText,
});

export const {
  /** `whatsappUrl(text)` → `https://wa.me/<dígitos>?text=<texto codificado>`. */
  whatsappUrl,
  /** `mailtoUrl({ subject, body })` → `mailto:<correo>?subject=...&body=...`. */
  mailtoUrl,
  /** Textos de los mensajes: `general`, `product`, `list`, `specialRequest`, `brand`, `category`, `datasheet`, `retired`. */
  messages,
  /** Asuntos de correo, con los mismos nombres que `messages`. */
  subjects,
  /** Atajo: `contactLinks.product(p)` → `{ whatsapp, mailto, subject, text }` con el mismo mensaje en ambos canales. */
  contactLinks,
} = contactFromBusiness(business);
