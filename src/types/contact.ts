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

/** Datos de contacto que las páginas muestran. No incluye la dirección: no se publica hasta confirmar la atención presencial. */
export interface ContactDetails {
  /** «Sercom Active». */
  readonly businessName: string;
  /** «Atención comercial en Puebla»: franja de servicio, pie, contacto y descripciones de las páginas. */
  readonly locationLabel: string;
  /** «Atención en Puebla»: solo el título de la portada, «Sercom Active · Atención en Puebla» (R-COPY-15). */
  readonly titleLabel: string;
  /** Nombre completo de la persona que atiende. */
  readonly contactName: string;
  /** Nombre de pila, para frases como «Yosmara revisa opciones…». */
  readonly contactFirstName: string;
  /** Iniciales para el monograma («YT»); no hay fotografía. */
  readonly contactInitials: string;
  readonly email: string;
  /** Número tal como se muestra: «+52 1 221 400 2219». */
  readonly whatsappDisplay: string;
  /** Horario completo: «Lunes a viernes de 9:00 a 18:00. Sábado y domingo cerrado.» */
  readonly hoursText: string;
  /** Horario corto para espacios estrechos: «Lunes a viernes de 9:00 a 18:00». */
  readonly hoursShortText: string;
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
  /** Producto retirado: pide una alternativa. Lleva la línea «Enlace» solo si hay `url`. */
  retired(product: ProductReference): string;
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
  /** «Consulta de alternativas: Marca CÓDIGO»; sin marca ni código, «Consulta de alternativas». */
  retired(product: Pick<ProductReference, 'brandName' | 'code'>): string;
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
  retired(product: ProductReference): ContactLinkPair;
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
