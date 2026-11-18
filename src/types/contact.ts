// Tipos de los enlaces de contacto y de las plantillas de mensaje (`src/lib/contact.mjs`).

/** Campos de `src/data/business.json` que usan los enlaces y los mensajes. */
export interface ContactSettings {
  /** Nombre del negocio, por ejemplo «Sercom Active». */
  name: string;
  /** Nombre con el que se saluda en los mensajes, por ejemplo «Yosmara». */
  contactFirstName: string;
  email: string;
  /** Número de WhatsApp tal como se usa en `wa.me`: solo dígitos, sin normalizar. */
  whatsappDigits: string;
}

/** Producto al que se refiere un mensaje. Las partes vacías se omiten del texto. */
export interface ProductReference {
  brandName?: string | null;
  code?: string | null;
  name?: string | null;
  /** Dirección absoluta de la página del producto; si falta, el mensaje no lleva la línea «Enlace». */
  url?: string | null;
}

export interface EmailParts {
  subject?: string | null;
  body?: string | null;
}

/** Textos de los mensajes. Devuelven texto plano con saltos de línea `\n`. */
export interface ContactMessages {
  general(): string;
  product(product: ProductReference): string;
  list(): string;
  specialRequest(options?: { query?: string | null }): string;
  brand(brandName: string): string;
  category(categoryName: string): string;
  datasheet(product: ProductReference): string;
}

/** Asuntos de correo, uno por cada mensaje. */
export interface ContactSubjects {
  general(): string;
  product(product: Pick<ProductReference, 'brandName' | 'code'>): string;
  list(): string;
  specialRequest(): string;
  brand(brandName: string): string;
  category(categoryName: string): string;
  datasheet(product: Pick<ProductReference, 'brandName' | 'code'>): string;
}

/** Los dos canales para un mismo mensaje. */
export interface ContactLinkPair {
  /** `https://wa.me/<dígitos>?text=...` */
  whatsapp: string;
  /** `mailto:<correo>?subject=...&body=...` */
  mailto: string;
  subject: string;
  text: string;
}

/** Enlaces listos para `href`, uno por cada mensaje. */
export interface ContactLinks {
  general(): ContactLinkPair;
  product(product: ProductReference): ContactLinkPair;
  list(): ContactLinkPair;
  specialRequest(options?: { query?: string | null }): ContactLinkPair;
  brand(brandName: string): ContactLinkPair;
  category(categoryName: string): ContactLinkPair;
  datasheet(product: ProductReference): ContactLinkPair;
}

export interface Contact {
  /** Abre WhatsApp con el texto como borrador. Sin texto devuelve solo `https://wa.me/<dígitos>`. */
  whatsappUrl(text?: string | null): string;
  /** Abre el correo con asunto y cuerpo como borrador. */
  mailtoUrl(parts?: EmailParts): string;
  messages: ContactMessages;
  subjects: ContactSubjects;
  contactLinks: ContactLinks;
}
