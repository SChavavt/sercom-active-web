// @ts-check
// Enlaces de WhatsApp y de correo, y plantillas de mensaje, con los datos de `src/data/business.json`.
// Para cambiar el contacto se edita ese archivo; aquí no hay nombres, números ni correos escritos.
//
// SOLO PARA COMPILACIÓN (frontmatter de archivos .astro) y pruebas. Un <script> de navegador no debe
// importarlo: arrastraría `business.json` completo, con datos que no se publican. En el navegador se usan
// `withPageLink` y `withRequestDescription` de `contact-core.mjs`, que trabajan sobre el `href` ya construido.
//
// Abrir WhatsApp o el correo no envía nada: la página nunca debe mostrar una confirmación de recepción.
import business from '../data/business.json' with { type: 'json' };
import { createContact } from './contact-core.mjs';

export { absoluteUrl } from './contact-core.mjs';

if (typeof document !== 'undefined') {
  throw new Error('contact.mjs es solo para compilación: en el navegador usa contact-core.mjs.');
}

/**
 * Datos de contacto para mostrar en las páginas (encabezado, pie, bloque de atención personal).
 * Es una proyección de `business.json`: la dirección y los campos internos no salen de aquí.
 * @type {import('../types/contact.ts').ContactDetails}
 */
export const contactDetails = Object.freeze({
  businessName: business.name,
  locationLabel: business.locationLabel,
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
  /** Textos de los mensajes: `general`, `product`, `list`, `specialRequest`, `brand`, `category`, `datasheet`. */
  messages,
  /** Asuntos de correo, con los mismos nombres que `messages`. */
  subjects,
  /** Atajo: `contactLinks.product(p)` → `{ whatsapp, mailto, subject, text }` con el mismo mensaje en ambos canales. */
  contactLinks,
} = createContact(business);
