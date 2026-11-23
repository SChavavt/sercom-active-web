// @ts-check
// Lo que comparten en el navegador las dos páginas que arman UN mensaje: «Cotizar mi lista» (/cotizar/) y «Solicitud
// especial» (/solicitud-especial/). Cada página calcula su mensaje (la lista; los cinco campos) y llama a `update`; este
// módulo hace lo demás:
//   - escribe el borrador visible («Así queda tu mensaje»), una línea del mensaje por renglón, con textContent;
//   - da a los enlaces de mensaje (los de WhatsApp y de correo dentro de las regiones que la página marca) el mensaje,
//     con la regla de los enlaces largos (`draftLinks` de contact-core.mjs): si un enlace no cabe, NINGUNO lleva el
//     texto, las etiquetas de las acciones cambian («Abrir WhatsApp para pegar mi lista»), la acción de copiar toma el
//     dibujo principal y aparece el aviso de arriba de las acciones (también en la región viva, una vez, al cambiar);
//   - a los demás enlaces de WhatsApp y de correo de la página (franja, encabezado, pie, barra fija del celular) les da el
//     `href` que tiene en ese momento la acción de envío de su canal en cuanto el visitante cambió el mensaje: con el
//     texto mientras cabe y SIN texto en el estado largo, como las acciones (quien copió su solicitud y abre WhatsApp
//     desde la barra fija la pega en un mensaje vacío, no detrás del saludo general); mientras no cambia nada, el que
//     traían impreso;
//   - «Copiar solicitud»: copia el mensaje (portapapeles del navegador o, si falta o falla, la forma antigua) y muestra
//     la línea de estado que corresponde; esa línea se va cuando el mensaje cambia.
// La región viva dice cada frase una vez y no se queda con una que dejó de ser cierta: la de la copia se borra cuando el
// mensaje cambia, la del estado largo cuando el mensaje vuelve a caber, y la página borra las suyas con `quiet`.
// Abrir WhatsApp o el correo no es un envío: este módulo nunca escribe una confirmación ni cambia nada al pulsar una
// acción de envío.
//
// Ganchos que busca, SIEMPRE dentro de la raíz que recibe (salvo los demás enlaces, que se buscan en todo el documento
// con `linkChannel` sobre `document.links`, sin los que están dentro de las regiones marcadas):
//   [data-message-draft] [data-draft-text]   el borrador nuevo (DraftMessage con data-message-draft)
//   regiones (selector que da la página)     contienen los enlaces de mensaje
//   [data-message-send="whatsapp"|"mailto"]  las acciones de envío (enlaces); la de WhatsApp da la plantilla
//   [data-long-label="…"]                     un enlace cuya etiqueta (su <span> hijo) cambia cuando el mensaje no cabe
//   [data-primary-fits] / [data-primary-long] la fila de acción que lleva el dibujo principal en cada estado
//   [data-long-notice]                        el aviso «Tu lista es larga…» (StatusLine), oculto mientras cabe
//   [data-copy-request]                       el botón «Copiar solicitud»
//   [data-copy-status]                        su línea de estado, con data-copied y data-copy-failed (las dos frases)
//   [data-live]                               la región viva de la página (<p class="vh" role="status" data-live>)
// Apto para el navegador y para node:test: solo importa `contact-core.mjs`; no corre nada al importarse, no lee datos
// y no toca el almacenamiento. Las funciones puras de arriba tienen pruebas en tests/message-page.test.mjs.
/** @import { LinkChannel } from '../types/contact.ts' */
import { draftLinks, linkChannel, messageOf, withMessage } from './contact-core.mjs';

/**
 * Los `href` de los enlaces de mensaje para un mensaje. Con el mensaje igual a la plantilla de la página, los enlaces
 * quedan como se imprimieron (`changed: false`); si no, la regla de una página que arma un mensaje (`draftLinks`): o
 * todos llevan el texto (`fits: true`) o ninguno.
 * @param {readonly string[]} originals Los `href` impresos al compilar.
 * @param {string} message
 * @param {string} template El mensaje de la plantilla de la página.
 * @returns {{ hrefs: string[], fits: boolean, changed: boolean }}
 */
export function messageLinkHrefs(originals, message, template) {
  const list = Array.isArray(originals) ? originals.map(href => String(href ?? '')) : [];
  if (message === template) return { hrefs: list, fits: true, changed: false };
  const { hrefs, fits } = draftLinks(list, message);
  return { hrefs, fits, changed: true };
}

/**
 * El `href` de un enlace de WhatsApp o de correo fuera de las regiones de mensaje. Mientras el mensaje es el de la
 * plantilla (nada escrito ni agregado todavía), el impreso. En cuanto cambia, el de la acción de envío de su canal: con
 * el texto si cabe y sin texto en el estado largo (las acciones ya van sin texto). Si su canal no tiene acción de envío,
 * el impreso mientras el mensaje cabe y, en el estado largo, ese mismo sin texto: ningún enlace de la página abre la
 * aplicación con otro mensaje escrito cuando el aviso pide pegar el que se copió. Un enlace de otro tipo conserva el suyo.
 * @param {string} original
 * @param {Partial<Record<LinkChannel, string>>} sendHrefs El `href` actual de cada acción de envío.
 * @param {{ fits: boolean, changed: boolean }} state
 * @returns {string}
 */
export function otherLinkHref(original, sendHrefs, { fits, changed }) {
  const channel = linkChannel(original);
  if (!channel || !changed) return original;
  const send = sendHrefs?.[channel];
  if (send !== undefined) return send;
  return fits ? original : withMessage(original, '');
}

/**
 * Copia un texto con la forma antigua (un <textarea> temporal y el comando «copiar» del documento). Devuelve si el
 * navegador dijo que copió. El foco vuelve a donde estaba.
 * @param {string} text
 * @returns {boolean}
 */
function legacyCopy(text) {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const area = document.createElement('textarea');
  area.value = text;
  area.readOnly = true;
  area.setAttribute('aria-hidden', 'true');
  area.tabIndex = -1;
  // Fuera de la lámina y de la vista; dentro de <body> para que el navegador pueda seleccionarlo.
  Object.assign(area.style, { position: 'fixed', top: '0', left: '0', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none' });
  document.body.append(area);
  let copied = false;
  try {
    area.select();
    // El comando está marcado como obsoleto, pero es el único camino donde falta el portapapeles del navegador.
    copied = /** @type {{ execCommand(command: string): boolean }} */ (/** @type {unknown} */ (document)).execCommand('copy') === true;
  } catch {
    copied = false;
  }
  area.remove();
  previous?.focus({ preventScroll: true });
  return copied;
}

/**
 * Prepara la parte compartida de una página de mensaje. No cambia nada hasta la primera llamada a `update`.
 * @param {Element} root Donde están el borrador, las regiones, las acciones, el aviso, el estado y la región viva.
 * @param {{ regions: string }} options `regions`: el selector de las regiones de enlaces de mensaje (dentro de `root`).
 */
export function createMessagePage(root, { regions }) {
  const draft = root.querySelector('[data-message-draft] [data-draft-text]');
  const regionElements = [...root.querySelectorAll(regions)];
  const inRegion = (/** @type {Element} */ element) => regionElements.some(region => region.contains(element));

  /** @type {HTMLAnchorElement[]} */
  const messageLinks = [];
  for (const region of regionElements) {
    for (const link of region.querySelectorAll('a[href]')) {
      if (link instanceof HTMLAnchorElement && linkChannel(link.getAttribute('href')) && !messageLinks.includes(link)) messageLinks.push(link);
    }
  }
  const originals = messageLinks.map(link => link.getAttribute('href') ?? '');
  const others = [...document.links]
    .filter(link => link instanceof HTMLAnchorElement && linkChannel(link.getAttribute('href')) && !inRegion(link))
    .map(link => ({ link, original: link.getAttribute('href') ?? '' }));

  const sends = /** @type {HTMLAnchorElement[]} */ ([...root.querySelectorAll('a[data-message-send]')]);
  const templateSource = sends.find(link => linkChannel(link.getAttribute('href')) === 'whatsapp') ?? messageLinks[0];
  /** El mensaje de la plantilla: el que lleva impreso la acción de WhatsApp. */
  const template = messageOf(templateSource?.getAttribute('href') ?? '');

  const labels = [...root.querySelectorAll('[data-long-label]')].flatMap(element => {
    const span = element.querySelector(':scope > span');
    const long = element instanceof HTMLElement ? element.dataset.longLabel : undefined;
    return span && long ? [{ span, short: span.textContent ?? '', long }] : [];
  });
  const primaryFits = [...root.querySelectorAll('[data-primary-fits]')];
  const primaryLong = [...root.querySelectorAll('[data-primary-long]')];
  const notice = root.querySelector('[data-long-notice]');
  const copyButton = root.querySelector('[data-copy-request]');
  const copyStatus = root.querySelector('[data-copy-status]');
  const live = root.querySelector('[data-live]');

  let current = template;
  let fits = true;
  let started = false;
  /** Cuenta las copias: una respuesta del portapapeles que llega tarde no pisa la de una copia más nueva. */
  let copies = 0;

  /** De quién es la frase que tiene ahora la región viva ('copy', 'long' o lo que diga la página); '' si está vacía. */
  let liveFrom = '';
  /** Cuenta las frases: una que espera su cuadro no se escribe si mientras tanto llegó otra o se borró. */
  let liveTurn = 0;

  /**
   * Escribe una frase en la región viva; para repetir la misma, la vacía y la escribe en el cuadro siguiente. `from`
   * dice de quién es, para borrarla con `quiet` cuando deje de ser cierta.
   * @param {string} text
   * @param {string} [from]
   */
  const announce = (text, from = 'page') => {
    if (!(live instanceof HTMLElement)) return;
    liveTurn += 1;
    const turn = liveTurn;
    live.textContent = '';
    liveFrom = from;
    requestAnimationFrame(() => {
      if (turn === liveTurn) live.textContent = text;
    });
  };

  /**
   * Vacía la región viva si su frase es de `from`: quien recorre la página después no encuentra algo que ya no es
   * cierto. Vaciarla no se anuncia.
   * @param {string} from
   */
  const quiet = from => {
    if (!(live instanceof HTMLElement) || liveFrom !== from) return;
    liveTurn += 1;
    liveFrom = '';
    live.textContent = '';
  };

  const hideCopyStatus = () => {
    if (copyStatus instanceof HTMLElement && !copyStatus.hidden) copyStatus.hidden = true;
    quiet('copy');
  };

  /** El borrador, un renglón por línea: solo cambia los renglones que cambiaron. */
  const writeDraft = (/** @type {string} */ text) => {
    if (!(draft instanceof HTMLElement)) return;
    const lines = text.split('\n');
    const spans = [...draft.querySelectorAll(':scope > .draft__line')];
    if (spans.length === lines.length) {
      lines.forEach((line, index) => {
        if (spans[index].textContent !== line) spans[index].textContent = line;
      });
      return;
    }
    draft.replaceChildren(...lines.flatMap((line, index) => {
      const span = document.createElement('span');
      span.className = 'draft__line';
      span.textContent = line;
      return index > 0 ? [document.createTextNode('\n'), span] : [span];
    }));
  };

  /** El estado largo: etiquetas, dibujo principal y aviso. */
  const showFits = (/** @type {boolean} */ value) => {
    for (const label of labels) label.span.textContent = value ? label.short : label.long;
    for (const element of primaryFits) element.classList.toggle('action--primary', value);
    for (const element of primaryLong) element.classList.toggle('action--primary', !value);
    if (notice instanceof HTMLElement) notice.hidden = value;
  };

  /**
   * El mensaje de la página cambió (o se muestra por primera vez).
   * @param {string} message
   */
  const update = message => {
    if (started && message !== current) hideCopyStatus();
    current = message;
    writeDraft(message);
    const state = messageLinkHrefs(originals, message, template);
    messageLinks.forEach((link, index) => {
      if (link.getAttribute('href') !== state.hrefs[index]) link.setAttribute('href', state.hrefs[index]);
    });
    /** @type {Partial<Record<LinkChannel, string>>} */
    const sendHrefs = {};
    for (const link of sends) {
      const channel = linkChannel(link.getAttribute('href'));
      if (channel && sendHrefs[channel] === undefined) sendHrefs[channel] = link.getAttribute('href') ?? '';
    }
    for (const { link, original } of others) {
      const href = otherLinkHref(original, sendHrefs, state);
      if (link.getAttribute('href') !== href) link.setAttribute('href', href);
    }
    if (!started || state.fits !== fits) {
      showFits(state.fits);
      if (started && !state.fits && notice) announce(notice.querySelector('[data-status-text]')?.textContent ?? '', 'long');
      if (state.fits) quiet('long');
      fits = state.fits;
    }
    started = true;
  };

  /** Muestra la línea de estado de la copia: copiada o no. */
  const showCopied = (/** @type {boolean} */ copied) => {
    if (!(copyStatus instanceof HTMLElement)) return;
    const sentence = (copied ? copyStatus.dataset.copied : copyStatus.dataset.copyFailed) ?? '';
    const text = copyStatus.querySelector('[data-status-text]');
    if (text) text.textContent = sentence;
    for (const icon of copyStatus.querySelectorAll('[data-status-icon]')) {
      if (icon instanceof HTMLElement) icon.hidden = icon.dataset.statusIcon !== (copied ? 'check' : 'alert-circle');
    }
    copyStatus.hidden = false;
    announce(sentence, 'copy');
  };

  const copy = async () => {
    copies += 1;
    const turn = copies;
    const text = current;
    let copied = false;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch {
      copied = false;
    }
    if (!copied) copied = legacyCopy(text);
    // Si el mensaje cambió mientras tanto, lo copiado ya no es el mensaje actual: no se dice nada.
    if (turn === copies && text === current) showCopied(copied);
  };

  copyButton?.addEventListener('click', () => {
    void copy();
  });

  return {
    /** El mensaje de la plantilla de la página (el que llevan sus enlaces al compilar). */
    template,
    update,
    announce,
    quiet,
    /** El mensaje que muestran ahora el borrador y los enlaces. */
    get message() {
      return current;
    },
  };
}
