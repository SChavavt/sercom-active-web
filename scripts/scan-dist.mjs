#!/usr/bin/env node
// Escáner de reglas duras sobre un sitio ya compilado (HTML, JS, CSS y JSON de dist/).
//
// Uso:  node scripts/scan-dist.mjs [carpeta] [--preview] [--launch] [--in-person] [--strict] [--rules]
//   carpeta       carpeta compilada; por omisión `dist`, o `dist-preview` con --preview
//   --preview     la compilación es la vista previa de diseño: los ejemplos se permiten, pero cada página
//                 debe llevar el aviso de vista previa y cada ejemplo su etiqueta «Ejemplo»
//   --launch      la compilación es la versión pública aprobada: `noindex`, el bloqueo de robots.txt y el aviso
//                 «Sitio en preparación» deben haberse retirado (R-PUB-03)
//   --in-person   la atención presencial fue confirmada: se permiten dirección, «Visítanos» y mapa
//   --strict      un WARN también hace fallar la revisión. `npm run verify` y el alojamiento lo usan para la
//                 compilación de producción: en la etapa 1 la lista de normas y certificaciones debe estar vacía
//   --rules       imprime la lista de reglas y termina
//
// Solo compara patrones de texto y datos del proyecto. No ve imágenes ni diseño, y no puede saber si una
// afirmación tiene evidencia: un resultado limpio es necesario, no suficiente. Termina con código 1 si hay
// algún FAIL (o algún WARN con --strict) y con 2 si la carpeta no existe o está vacía. Sin --strict, los WARN
// se listan para revisión manual.
//
// Los identificadores (R-RULE-xx…) son los de la lista de requisitos del proyecto. Cada regla lleva su
// explicación en el campo `doc`; las comprobaciones que no son un patrón están documentadas en `CHECKS`.
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isPublicRetired } from '../src/lib/catalog-policy.mjs';
import { DEVELOPMENT_NOTICE, EXAMPLE_TAG, PREVIEW_NOTICE } from '../src/lib/site-data-core.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKIP_LINK_TEXT = 'Saltar al contenido';
const TEXT_EXTENSIONS = new Set(['.html', '.htm', '.js', '.mjs', '.css', '.json', '.txt', '.xml', '.svg', '.webmanifest', '.map']);

// ---------------------------------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------------------------------

const stripAccents = text => text.normalize('NFD').replace(/\p{M}/gu, '');
/**
 * Forma comparable de un texto: compatibilidad Unicode (NFKC: «＄» es «$», «ＧＩＳＡ» es «GISA», el espacio duro es un
 * espacio), sin caracteres de formato invisibles (espacio de ancho cero, guion suave, unión de palabras) y sin acentos.
 * Así, un texto pegado en forma descompuesta (NFD) o con caracteres invisibles entre las letras se lee igual.
 */
const fold = text => stripAccents(text.normalize('NFKC').replace(/\p{Cf}/gu, ''));
const codePoint = (value, radix) => {
  const number = parseInt(value, radix);
  return Number.isInteger(number) && number >= 0 && number <= 0x10ffff ? String.fromCodePoint(number) : undefined;
};
// Entidades con nombre que un texto en español puede llevar; las numéricas se decodifican todas.
const NAMED_ENTITIES = {
  nbsp: ' ', quot: '"', apos: "'", lt: '<', gt: '>', shy: '­', zwnj: '‌', zwj: '‍', ZeroWidthSpace: '​', NoBreak: '⁠',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', Uuml: 'Ü', iexcl: '¡', iquest: '¿', laquo: '«', raquo: '»', ndash: '–', mdash: '—', hellip: '…',
  middot: '·', bull: '•', copy: '©', reg: '®', trade: '™', deg: '°', dollar: '$', euro: '€', cent: '¢', pound: '£', star: '☆', starf: '★', commat: '@', period: '.', colon: ':', sol: '/', num: '#', percnt: '%',
};
const decodeEntities = text => text
  .replace(/&(?:#(\d+)|#x([0-9a-f]+)|([A-Za-z][A-Za-z0-9]*));/gi, (entity, decimal, hex, name) => {
    if (decimal) return codePoint(decimal, 10) ?? entity;
    if (hex) return codePoint(hex, 16) ?? entity;
    return name === 'amp' ? entity : NAMED_ENTITIES[name] ?? entity;
  })
  .replace(/&amp;/g, '&');
const decodePercent = text => text.replace(/(?:%[0-9a-f]{2})+/gi, run => {
  try { return decodeURIComponent(run); } catch { return run; }
});
/** Contenido comparable: entidades y %XX decodificados, en forma comparable (`fold`). Las reglas lo leen sin distinguir mayúsculas. */
const normalizeContent = text => fold(decodePercent(decodeEntities(text)));
const oneLine = text => text.replace(/\s+/g, ' ').trim();
const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const withoutScripts = html => html.replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
// Atributos que un visitante o un buscador leen como texto. El resto (salvo los de NON_TEXT_ATTRIBUTES, también las
// direcciones) se revisa con su %XX decodificado en los ámbitos `words` y `prose`.
const TEXT_ATTRIBUTES = /^(?:alt|title|aria-label|placeholder|content|value)$/i;
// Atributos que no llevan texto: nombres de clase, geometría de SVG y similares.
const NON_TEXT_ATTRIBUTES = /^(?:class|id|style|d|points|viewbox|transform|xmlns(?::\w+)?|width|height|x|y|x1|x2|y1|y2|cx|cy|r|rx|ry|fill|stroke|stroke-\w+|integrity|nonce|crossorigin|rel|type|charset|lang|dir|sizes|media|as|loading|decoding|fetchpriority|role|tabindex|hidden|aria-hidden|aria-labelledby|aria-describedby|aria-controls|aria-current|aria-expanded|for|name|method|target)$/i;
/** Atributos de todas las etiquetas de un documento: [nombre, valor sin entidades]. */
const attributesOf = html => [...html.matchAll(/<[a-zA-Z][^\s"'>/]*((?:"[^"]*"|'[^']*'|[^'">])*)>/g)]
  .flatMap(tag => [...tag[1].matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)])
  .map(match => [match[1], decodeEntities(match[2] ?? match[3] ?? match[4] ?? '')]);
/** Texto que lee un visitante o un buscador: contenido de los elementos y atributos descriptivos. */
function visibleText(html) {
  const body = withoutScripts(html);
  const attributes = attributesOf(body).filter(([name]) => TEXT_ATTRIBUTES.test(name)).map(([, value]) => value);
  return oneLine(decodeEntities(`${body.replace(/<[^>]+>/g, ' ')} \n ${attributes.join(' \n ')}`));
}
// Elementos en línea: no separan palabras, así que «GI<span>SA</span>» se lee «GISA».
const INLINE_TAG = /<\/?(?:a|abbr|b|bdi|bdo|cite|code|data|del|dfn|em|font|i|ins|kbd|mark|q|s|samp|small|span|strong|sub|sup|time|u|var|wbr)\b[^>]*>/gi;
/** Texto visible con las etiquetas en línea retiradas sin dejar espacio. */
const joinedText = html => oneLine(fold(decodeEntities(withoutScripts(html).replace(INLINE_TAG, '').replace(/<[^>]+>/g, ' '))));
// ---------------------------------------------------------------------------------------------------
// Las dos lecturas de una página para sus avisos de arriba
// ---------------------------------------------------------------------------------------------------
// El marcado se recorre con un troceador sencillo (`htmlTokens`), no con un analizador de HTML: etiquetas que respetan
// las comillas de sus valores («data-x="a>b"» no termina en «>»), comentarios (también los falsos «<?…>», «<!…>» y «</»
// seguido de algo que no es una letra, que el analizador de HTML convierte en comentarios), y elementos cuyo contenido
// es texto hasta su propia etiqueta de cierre (<script>, <style>, <textarea>, <title>, <iframe>…):
// «<textarea></div></textarea>» no cierra nada.
// Con eso se leen dos textos:
//   - `shownText`, el texto que se muestra a todos, para las revisiones que EXIGEN un aviso;
//   - `allElementText`, todo el texto de los elementos, oculto o no, para las que lo PROHÍBEN (el contenido de <noscript>,
//     <textarea>, <title>, <iframe>… se lee tal cual y además como marcado).
// Las dos reconocen las formas comunes de esconder un aviso, no todo lo que hace un navegador: lo que no modelan está
// escrito sobre cada una y en --rules (SHOWN_TEXT_DOC, ALL_TEXT_DOC). En esos casos un aviso que no se muestra puede
// contar como mostrado, y uno escrito con entidades poco comunes no se reconoce: es ocultarlo a propósito, y contra eso
// no protege un patrón (docs/datos-y-modos.md, sección 6).
const INLINE_ELEMENT = /^(?:a|abbr|b|bdi|bdo|cite|code|data|del|dfn|em|font|i|ins|kbd|mark|q|s|samp|small|span|strong|sub|sup|time|u|var|wbr)$/i;
const VOID_ELEMENT = /^(?:area|base|br|col|embed|hr|img|input|keygen|link|meta|param|source|track|wbr)$/i;
// Su contenido es texto hasta su etiqueta de cierre (en HTML; dentro de <svg> o <math> solo <script> y <style>).
const RAW_TEXT_ELEMENT = /^(?:script|style|textarea|title|xmp|iframe|noembed|noframes|noscript|plaintext)$/i;
// Su contenido nunca es texto de la página, en ninguna de las dos lecturas.
const CODE_ELEMENT = /^(?:script|style)$/i;
// Una etiqueta de cierre no sale de estos elementos sin cerrarlos antes (el «ámbito» del analizador de HTML).
const SCOPE_BOUNDARY = /^(?:applet|caption|html|table|td|th|marquee|object|template|foreignobject|desc|title|mi|mo|mn|ms|mtext|annotation-xml)$/i;
// Elementos cuyo contenido el visitante no ve nunca en la página: el <head> (el <title> es el de la pestaña o el de un
// SVG), <template>, <textarea> (su texto es el valor del campo), <noscript> (solo sin JavaScript), los contenedores cuyo
// contenido un navegador no dibuja (<iframe>, <noembed>, <noframes>, <datalist>, <video>, <audio>, <canvas>) y <rp>,
// que solo se ve sin soporte de rubí.
const NEVER_SHOWN = /^(?:head|title|template|textarea|noscript|iframe|noembed|noframes|datalist|video|audio|canvas|rp)$/i;
// Dentro de un SVG tampoco se dibujan <desc> ni <metadata>.
const NEVER_SHOWN_IN_SVG = /^(?:desc|metadata|title)$/i;

/** Decodifica los escapes de CSS de un texto («\68 idden» es «hidden», «\:» es «:»). */
const unescapeCss = text => text.replace(/\\([0-9a-f]{1,6})[ \t\n\f\r]?|\\([^\n0-9a-f])/gi, (_escape, hex, character) => (hex ? codePoint(hex, 16) ?? '' : character));
/**
 * ¿Un atributo style esconde el contenido del elemento? display:none, visibility:hidden o collapse, content-visibility:hidden,
 * con o sin !important, en mayúsculas o minúsculas, con escapes de CSS, y leyendo cada declaración sin sus comentarios
 * (que separan como un espacio: «display:none» seguido de un comentario vacío sigue siendo «display:none»). No resuelve
 * variables de CSS («display:var(--x,none)») ni las entidades con nombre que `decodeEntities` no conoce («&semi;»).
 */
function hiddenByStyle(style) {
  const css = style.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, ' ');
  for (const declaration of css.split(';')) {
    const colon = declaration.indexOf(':');
    if (colon < 0) continue;
    const property = unescapeCss(declaration.slice(0, colon)).trim().toLowerCase();
    const value = unescapeCss(declaration.slice(colon + 1)).replace(/!\s*important\s*$/i, '').trim().toLowerCase();
    if (property === 'display' && value === 'none') return true;
    if (property === 'visibility' && (value === 'hidden' || value === 'collapse')) return true;
    if (property === 'content-visibility' && value === 'hidden') return true;
  }
  return false;
}

/** Lee los atributos de una etiqueta desde `index` como el analizador de HTML: [atributos, posición tras «>», «/>»]. */
function readAttributes(html, index) {
  const attributes = new Map();
  let position = index;
  const { length } = html;
  const skip = pattern => {
    while (position < length && pattern.test(html[position])) position += 1;
  };
  while (position < length) {
    skip(/[\s/]/);
    if (html[position] === '>') return [attributes, position + 1, html[position - 1] === '/'];
    if (position >= length) break;
    // El nombre: hasta un espacio, «/», «>» o «=» (un «=» al principio forma parte del nombre).
    const start = position;
    position += 1;
    while (position < length && !/[\s/>=]/.test(html[position])) position += 1;
    const name = html.slice(start, position).toLowerCase();
    skip(/\s/);
    let value = '';
    if (html[position] === '=') {
      position += 1;
      skip(/\s/);
      const quote = html[position];
      if (quote === '"' || quote === "'") {
        const end = html.indexOf(quote, position + 1);
        if (end < 0) break;
        value = html.slice(position + 1, end);
        position = end + 1;
      } else {
        const valueStart = position;
        while (position < length && !/[\s>]/.test(html[position])) position += 1;
        value = html.slice(valueStart, position);
      }
    }
    if (!attributes.has(name)) attributes.set(name, decodeEntities(value));
  }
  // Una etiqueta sin cerrar al final del documento no es una etiqueta (el navegador la descarta).
  return [attributes, length, false, true];
}

/**
 * Trocea un documento HTML: { type: 'text', text, raw? } (raw: el contenido de un elemento de RAW_TEXT_ELEMENT, con su
 * nombre en `name`), { type: 'start', name, attributes, selfClosing, foreign } y { type: 'end', name }. Los comentarios
 * no producen nada. `foreign` dice si la etiqueta está dentro de <svg> o <math>.
 * @param {string} html
 */
function* htmlTokens(html) {
  const { length } = html;
  let index = 0;
  let foreign = 0; // profundidad dentro de <svg> o <math>
  while (index < length) {
    const open = html.indexOf('<', index);
    if (open < 0) {
      yield { type: 'text', text: html.slice(index) };
      return;
    }
    if (open > index) yield { type: 'text', text: html.slice(index, open) };
    index = open;
    const next = html[index + 1] ?? '';
    if (html.startsWith('<!--', index)) {
      // Comentario: «<!-->» y «<!--->» también terminan.
      const short = html.slice(index + 4).match(/^-?>/);
      if (short) { index += 4 + short[0].length; continue; }
      const end = html.slice(index + 4).search(/--!?>/);
      index = end < 0 ? length : index + 4 + end + html.slice(index + 4 + end).match(/^--!?>/)[0].length;
      continue;
    }
    if (foreign && html.startsWith('<![CDATA[', index)) {
      // Dentro de un SVG o de MathML, una sección CDATA es texto.
      const end = html.indexOf(']]>', index + 9);
      yield { type: 'text', text: html.slice(index + 9, end < 0 ? length : end) };
      index = end < 0 ? length : end + 3;
      continue;
    }
    if (next === '!' || next === '?' || (next === '/' && index + 2 < length && !/[a-zA-Z>]/.test(html[index + 2]))) {
      // Comentario falso: hasta el primer «>».
      const end = html.indexOf('>', index + 2);
      index = end < 0 ? length : end + 1;
      continue;
    }
    if (next === '/' && html[index + 2] === '>') { index += 3; continue; } // «</>»: no es nada
    const closing = next === '/';
    const nameStart = index + (closing ? 2 : 1);
    if (!/[a-zA-Z]/.test(html[nameStart] ?? '')) {
      yield { type: 'text', text: '<' };
      index += 1;
      continue;
    }
    let nameEnd = nameStart;
    while (nameEnd < length && !/[\s/>]/.test(html[nameEnd])) nameEnd += 1;
    const name = html.slice(nameStart, nameEnd).toLowerCase();
    const [attributes, after, selfClosing, unfinished] = readAttributes(html, nameEnd);
    if (unfinished) return;
    index = after;
    if (closing) {
      if (foreign && /^(?:svg|math)$/.test(name)) foreign -= 1;
      yield { type: 'end', name };
      continue;
    }
    yield { type: 'start', name, attributes, selfClosing, foreign: foreign > 0 };
    if (/^(?:svg|math)$/.test(name) && !selfClosing) foreign += 1;
    const raw = foreign ? CODE_ELEMENT.test(name) && !selfClosing : RAW_TEXT_ELEMENT.test(name);
    if (raw) {
      // El contenido es texto hasta «</nombre» seguido de un espacio, «/» o «>» (<plaintext>: hasta el final).
      const end = name === 'plaintext' ? -1 : html.slice(index).search(new RegExp(`</${name}[\\s/>]`, 'i'));
      const stop = end < 0 ? length : index + end;
      yield { type: 'text', text: html.slice(index, stop), raw: true, name };
      if (end < 0) return;
      const close = html.indexOf('>', stop);
      index = close < 0 ? length : close + 1;
      yield { type: 'end', name };
    }
  }
}

/** ¿La etiqueta de inicio esconde su contenido a alguien? (`shownText`) */
function hidesContent({ name, attributes, foreign }) {
  if (foreign ? NEVER_SHOWN_IN_SVG.test(name) : NEVER_SHOWN.test(name)) return true;
  if (name === 'dialog' && !attributes.has('open')) return true;
  if (name === 'object' && (attributes.get('data') ?? '').trim() !== '') return true;
  return attributes.has('hidden') || attributes.has('popover') || attributes.get('aria-hidden')?.trim().toLowerCase() === 'true'
    || hiddenByStyle(attributes.get('style') ?? '');
}

/** Texto comparable de las piezas de una lectura: entidades decodificadas, forma comparable, una línea y minúsculas. */
const comparableText = pieces => oneLine(fold(decodeEntities(pieces.join('')))).toLowerCase();

/**
 * Todo el texto de los elementos de una página, oculto o no, para las revisiones que prohíben un aviso (R-PUB-03 con
 * --launch, R-RULE-12 en la vista previa): el aviso tiene que haberse quitado, no escondido. Un comentario (también uno
 * falso), un script, un estilo o un atributo no son texto de un elemento. Las etiquetas en línea no separan palabras.
 * El contenido de <noscript>, <textarea>, <title>, <iframe>, <noembed>, <noframes>, <xmp> y <plaintext> se lee dos
 * veces: tal cual, como el texto que es, y además como marcado, igual que el de cualquier otro elemento. Así el aviso
 * real envuelto en uno de ellos («<noscript><aside…><strong>Sitio en preparación</strong> · …») sigue en la página,
 * como lo encontraba el escáner antes de las dos lecturas, sin perder lo que la lectura tal cual encuentra.
 * Límite: de las entidades con nombre solo se decodifican las de NAMED_ENTITIES; un aviso cuyas propias palabras se
 * escriben con otras («Sitio&Tab;en preparación», «&NewLine;», «&centerdot;») no se reconoce.
 */
function allElementText(html) {
  return comparableText(elementTextPieces(html, []));
}
/** Las piezas de `allElementText`, añadidas a `pieces`. */
function elementTextPieces(html, pieces) {
  for (const token of htmlTokens(html)) {
    if (token.type !== 'text') pieces.push(INLINE_ELEMENT.test(token.name) ? '' : ' ');
    else if (!token.raw) pieces.push(token.text);
    else if (CODE_ELEMENT.test(token.name)) pieces.push(' ');
    else {
      pieces.push(token.text, ' ');
      elementTextPieces(token.text, pieces);
      pieces.push(' ');
    }
  }
  return pieces;
}

/**
 * Lo que una página muestra a todos como texto, para las revisiones que exigen un aviso (R-RULE-12 antes del
 * lanzamiento, R-RULE-03 en la vista previa). Además de lo que no cuenta en `allElementText`, no cuenta el contenido de
 * un elemento que no se ve: <head>, <template>, <textarea>, <noscript>, <iframe>, <noembed>, <noframes>, <datalist>,
 * <video>, <audio>, <canvas>, <rp>, un <object> con data, un <dialog> cerrado, un <details> cerrado (salvo su primer
 * <summary>), <title>, <desc> y <metadata> de un SVG, y todo elemento con hidden, popover, aria-hidden="true" (no se
 * muestra a quien usa un lector de pantalla) o con display:none, visibility:hidden o collapse o
 * content-visibility:hidden en su style. Un elemento sigue abierto hasta su propia etiqueta de cierre: una etiqueta de
 * cierre no sale de <template>, <object> o del <title> de un SVG, y «/>» no cierra un elemento de HTML. Una regla de
 * una hoja de estilo que esconda el aviso no se ve aquí (la revisa check-markup).
 * Límites: no es un analizador de HTML. Fuera de <title>, <desc>, <metadata> y de lo escondido como en HTML, cuenta
 * como mostrado todo el texto de un SVG o de MathML, aunque no se dibuje (texto suelto fuera de <text>, una sección
 * CDATA, <annotation> o un elemento con display="none" o visibility="hidden" como atributos de presentación); no
 * resuelve variables de CSS ni entidades con
 * nombre poco comunes en un style; y no repite las reparaciones del analizador del navegador (un elemento de formato
 * oculto que se vuelve a abrir después de cerrarse su bloque, una etiqueta de cierre que se ignora dentro de <select>,
 * el doble escape de <script>). En esos casos un aviso que no se muestra puede contar como mostrado.
 */
function shownText(html) {
  const pieces = [];
  /** @type {{ name: string, hidden: boolean, closedDetails: boolean, summary: boolean }[]} */
  const stack = [];
  const top = () => stack[stack.length - 1];
  for (const token of htmlTokens(html)) {
    if (token.type === 'text') {
      const parent = top();
      const hidden = (parent?.hidden ?? false) || (parent?.closedDetails ?? false);
      pieces.push(hidden || (token.raw && CODE_ELEMENT.test(token.name)) ? ' ' : token.text);
      continue;
    }
    pieces.push(INLINE_ELEMENT.test(token.name) ? '' : ' ');
    if (token.type === 'start') {
      if (token.foreign ? token.selfClosing : VOID_ELEMENT.test(token.name)) continue;
      const parent = top();
      // Hijo de un <details> cerrado: solo su primer <summary> se ve.
      const firstSummary = parent?.closedDetails && token.name === 'summary' && !parent.summary;
      if (firstSummary) parent.summary = true;
      const hidden = (parent?.hidden ?? false) || ((parent?.closedDetails ?? false) && !firstSummary) || hidesContent(token);
      stack.push({ name: token.name, hidden, closedDetails: token.name === 'details' && !token.attributes.has('open'), summary: false });
      continue;
    }
    // Etiqueta de cierre: cierra el elemento abierto más cercano con ese nombre, salvo que antes haya un límite de ámbito.
    for (let depth = stack.length - 1; depth >= 0; depth -= 1) {
      if (stack[depth].name === token.name) {
        stack.length = depth;
        break;
      }
      if (SCOPE_BOUNDARY.test(stack[depth].name)) break;
    }
  }
  return comparableText(pieces);
}
// Etiquetas dentro del texto de un script («t.innerHTML="Solicitud <b>enviada</b>"»). El nombre debe ir seguido de un
// espacio, «/» o «>», y la etiqueta no puede contener «<», para no confundirlas con comparaciones («i<a.length»).
const SCRIPT_INLINE_TAG = /<\/?(?:a|abbr|b|bdi|bdo|cite|code|data|del|dfn|em|font|i|ins|kbd|mark|q|s|samp|small|span|strong|sub|sup|time|u|var|wbr)(?=[\s/>])[^<>]*>/gi;
const SCRIPT_TAG = /<\/?[a-z][\w-]*(?=[\s/>])[^<>]*>/gi;
/** El marcado que escribe un script, leído como texto: las etiquetas en línea se retiran sin dejar espacio y las demás separan palabras. */
const withoutMarkup = text => text.replace(SCRIPT_INLINE_TAG, '').replace(SCRIPT_TAG, ' ');
const inlineScripts = html => [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]).join('\n');
const inlineStyles = html => [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(match => match[1]).join('\n');
/**
 * Lo que un script puede escribir en la página: decodifica los escapes de cadena (é, \x24) y une las piezas de
 * una cadena partida («"Solicitud "+"enviada"», `Solicitud ${x}enviada`). Las cadenas de reemplazo de
 * `.replace(…, "$1")` no son texto y se retiran.
 */
const unescapeScript = code => code
  .replace(/\\u\{([0-9a-f]{1,6})\}/gi, (escape, hex) => codePoint(hex, 16) ?? escape)
  .replace(/\\u([0-9a-f]{4})/gi, (escape, hex) => codePoint(hex, 16) ?? escape)
  .replace(/\\x([0-9a-f]{2})/gi, (escape, hex) => codePoint(hex, 16) ?? escape)
  .replace(/\\\//g, '/')
  .replace(/\\[nrtv]/g, ' ');
const scriptText = code => unescapeScript(code
  .replace(/(\.replace(?:All)?\(\s*(?:\/(?:\\.|[^/\\\n])+\/[a-z]*|[\w$.]+)\s*,\s*)(["'`])(?:\\.|(?!\2)[^\\\n])*\2/g, '$1$2$2'))
  .replace(/\$\{\s*(["'])((?:(?!\1)[^\\])*)\1\s*\}/g, '$2')
  .replace(/\$\{[^{}`]*\}/g, '')
  .replace(/(["'`])\s*\+\s*(["'`])/g, '');
// Lo que precede a la cadena de reemplazo de `.replace(…, "$1")`, que no es texto.
const REPLACEMENT_BEFORE = /\.replace(?:All)?\(\s*(?:\/(?:\\.|[^/\\\n])+\/[a-z]*|[\w$.]+)\s*,\s*$/;
// Antes de una «/» que abre una expresión regular hay un signo o una palabra clave; después de un nombre o de «)» es una división.
const REGEX_AFTER_SIGN = /^[(,=:[!&|?{};+\-*%<>~^]$/;
const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'yield', 'await', 'instanceof']);
/**
 * Cadenas de un script o de un JSON (entre comillas simples, dobles o invertidas, también las piezas de una plantilla
 * `…${x}…`), con sus escapes decodificados. Salta los comentarios y las expresiones regulares, y deja fuera la cadena
 * de reemplazo de `.replace(…, "$1")`. Lo que está dentro de una cadena es texto, no código: la excepción de R-RULE-01
 * para un «$» pegado a un identificador no le aplica.
 * @param {string} code
 * @returns {string[]}
 */
function stringLiterals(code) {
  const strings = [];
  const { length } = code;
  const unescape = text => unescapeScript(text).replace(/\\(?:\r?\n|([\s\S]))/g, (_escape, character) => character ?? '');
  const readQuoted = (start, quote) => {
    for (let index = start + 1; index < length; index += 1) {
      if (code[index] === '\\') index += 1;
      else if (code[index] === quote) return [code.slice(start + 1, index), index + 1];
      else if (code[index] === '\n') return [undefined, index];
    }
    return [undefined, length];
  };
  const skipRegex = start => {
    let inClass = false;
    for (let index = start + 1; index < length; index += 1) {
      const character = code[index];
      if (character === '\\') index += 1;
      else if (character === '[') inClass = true;
      else if (character === ']') inClass = false;
      else if (character === '/' && !inClass) return index + 1;
      else if (character === '\n') return index;
    }
    return length;
  };
  // Lee código desde `index`; con `untilBrace`, hasta la «}» que cierra un `${`. Devuelve la posición siguiente.
  const readCode = (start, untilBrace) => {
    let depth = 0;
    let previous = '';
    let index = start;
    while (index < length) {
      const character = code[index];
      if (/\s/.test(character)) {
        index += 1;
      } else if (character === '/' && code[index + 1] === '/') {
        const end = code.indexOf('\n', index);
        index = end < 0 ? length : end;
      } else if (character === '/' && code[index + 1] === '*') {
        const end = code.indexOf('*/', index + 2);
        index = end < 0 ? length : end + 2;
      } else if (character === '"' || character === "'") {
        const [text, end] = readQuoted(index, character);
        if (text !== undefined && !REPLACEMENT_BEFORE.test(code.slice(Math.max(0, index - 300), index))) strings.push(unescape(text));
        index = end;
        previous = 'x';
      } else if (character === '`') {
        let piece = '';
        index += 1;
        while (index < length && code[index] !== '`') {
          if (code[index] === '\\') {
            piece += code.slice(index, index + 2);
            index += 2;
          } else if (code[index] === '$' && code[index + 1] === '{') {
            strings.push(unescape(piece));
            piece = '';
            index = readCode(index + 2, true);
          } else {
            piece += code[index];
            index += 1;
          }
        }
        strings.push(unescape(piece));
        index += 1;
        previous = 'x';
      } else if (character === '/' && (previous === '' || REGEX_AFTER_SIGN.test(previous) || REGEX_AFTER_WORD.has(previous))) {
        index = skipRegex(index);
        previous = 'x';
      } else if (/[\w$]/.test(character)) {
        const word = code.slice(index).match(/^[\w$]+/)[0];
        index += word.length;
        previous = word;
      } else {
        if (character === '{') depth += 1;
        if (character === '}') {
          if (untilBrace && depth === 0) return index + 1;
          depth -= 1;
        }
        index += 1;
        previous = character;
      }
    }
    return length;
  };
  readCode(0, false);
  return strings.filter(text => text.trim());
}
/** Las cadenas de un script, separadas para que ningún patrón una dos cadenas en una frase. */
const scriptStrings = code => {
  const strings = stringLiterals(code);
  return [...strings, ...strings.filter(text => text.includes('<')).map(withoutMarkup)].join('\n|\n');
};
/**
 * Cadenas de `content:` de una hoja de estilo, con los escapes de CSS decodificados («\24 350» es «$350»). El valor se
 * lee hasta el primer «;» o «}» fuera de una cadena: dentro de "…" o '…' (con escapes «\») no terminan el valor
 * («content:"Desde MX$350; IVA incluido"»). Se leen todas las cadenas del valor («content:"Desde " "MX$350"»); una
 * cadena sin cerrar termina en el salto de línea.
 */
function cssContent(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const strings = [];
  for (const match of text.matchAll(/(?<![\w-])content\s*:/gi)) {
    let index = match.index + match[0].length;
    while (index < text.length && text[index] !== ';' && text[index] !== '}') {
      const quote = text[index];
      index += 1;
      if (quote !== '"' && quote !== "'") continue;
      let value = '';
      while (index < text.length && text[index] !== quote && text[index] !== '\n') {
        const length = text[index] === '\\' ? 2 : 1;
        value += text.slice(index, index + length);
        index += length;
      }
      strings.push(value);
      if (text[index] === quote) index += 1;
    }
  }
  return strings
    .map(value => value.replace(/\\([0-9a-f]{1,6})\s?/gi, (escape, hex) => codePoint(hex, 16) ?? escape).replace(/\\([\s\S])/g, '$1'))
    .join('\n');
}
const attribute = (tag, name) => {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i'));
  return match ? decodeEntities(match[1] ?? match[2] ?? match[3] ?? '') : undefined;
};

// Frases que proponen las propias fuentes del proyecto; se retiran del texto visible antes de aplicar las
// reglas para que no produzcan falsas alarmas (por ejemplo «¿Todo está en existencia?»).
const ALLOWED_SENTENCES = [
  '¿Por qué no aparecen precios?',
  '¿Todo está en existencia?',
  'La disponibilidad y el tiempo de entrega se confirman al cotizar.',
  'Disponibilidad y tiempo de entrega sujetos a confirmación al cotizar',
  '¿Hacen productos personalizados?',
  'Revisamos requerimientos especiales. La personalización física o fabricación se ofrece solo si se confirma ese servicio.',
  'La cotización se prepara según el producto, la cantidad y las condiciones del requerimiento.',
];
const FOLDED_ALLOWED_SENTENCES = ALLOWED_SENTENCES.map(sentence => oneLine(fold(sentence)));
/** Retira las frases permitidas de un texto ya en forma comparable (`fold`). */
const withoutAllowed = text => FOLDED_ALLOWED_SENTENCES.reduce((rest, sentence) => rest.split(sentence).join(' '), text);

// ---------------------------------------------------------------------------------------------------
// Reglas por patrón
// ---------------------------------------------------------------------------------------------------
// Ámbitos (`scope`). Salvo `raw`, todos están en forma comparable (`fold`: NFKC, sin caracteres invisibles y sin
// acentos), así que un patrón escrito sin acentos también encuentra el texto acentuado o descompuesto.
//   text    texto visible de cada página HTML, sin las frases permitidas
//   joined  texto visible de cada página HTML con las etiquetas en línea retiradas sin dejar espacio, sin las frases permitidas
//   words   lo que una persona podría llegar a leer: el texto visible, los demás atributos (data-*, enlaces con su
//           %XX decodificado; el marcado que guardan se lee también sin sus etiquetas), los <script> en línea, las
//           cadenas `content:` del CSS y el contenido de JS/JSON (un script puede escribir texto en la página; el
//           marcado que escribe se lee también sin sus etiquetas), sin las frases permitidas
//   prose   la parte de `words` que no es código: el texto visible, los valores de los atributos (también las direcciones), las cadenas
//           `content:` del CSS y el texto de un SVG o XML (sin las frases permitidas)
//   raw     contenido tal cual de cada archivo de texto
//   norm    contenido de cada archivo de texto con entidades y %XX decodificados
// `level` puede ser una función del modo: los ejemplos nunca deben llevar normas ni certificaciones.

const rule = (id, level, scope, pattern, title, doc) => ({ id, level, scope, pattern, title, doc });

const EXCLUDED_BRAND = /\bgisa\b|guantes?[\s._+-]*internacional(?:es)?/i;
const EXCLUDED_LETTERS = /\bg[\s._-]i[\s._-]s[\s._-]a\b/i;
// Dentro de un identificador de código: «gisaLogo», «logoGisa», «GISA_URL». Distingue mayúsculas a propósito.
const EXCLUDED_IN_IDENTIFIER = /(?<![A-Za-z0-9])(?:gisa|Gisa|GISA)(?=[A-Z0-9_$])|(?<=[a-z0-9_$])(?:Gisa|GISA)(?![a-z])/;
// Sobre texto sin acentos. Un «no», «nada» o «nunca» antes invierte el sentido: «tu mensaje no se ha enviado».
const CONFIRMATION_NOUN = '(?:solicitud|mensaje|cotizacion|lista|pedido|correo|requerimiento|formulario)(?:es|s)?';
const PARTICIPLE = '(?:enviad|recibid|registrad)[oa]s?';
const NEGATED = '(?<!\\b(?:no|nada|nadie|nunca)\\s+)';
// Antes del sustantivo, una negación o una condición: «Ningún mensaje queda registrado», «Sin correo registrado»,
// «Cuando tu solicitud queda enviada desde tu WhatsApp…» no afirman un envío.
const NOT_ASSERTED = '(?<!\\b(?:no|nada|nadie|nunca|ningun|ninguna|ninguno|sin|cuando|si)\\s+(?:(?:tu|su|tus|sus|el|la|los|las|un|una)\\s+)?)';
// Una palabra entre el sustantivo y el participio: letras o cifras, nunca un verbo ni una conjunción («para que sea enviado»).
const GAP_WORD = '(?!(?:que|se|sea|sean|ser|es|son|fue|fueron|sera|haya|hayan|esta|estan|no|y|e|o|u|ni|si|cuando|como|donde)\\b)[a-z0-9]+\\b';
// Entre el sustantivo y el participio puede haber una preposición y una o dos palabras o un nombre («Mensaje de
// WhatsApp enviado», «¡Tu solicitud a Sercom Active enviada!», «Solicitud por correo electrónico enviada») o
// «especial» («Solicitud especial enviada»); nunca un verbo.
const CONFIRMATION_GAP = `(?:\\s+(?:de|del|por|a|al|para|con|en)\\s+${GAP_WORD}(?:\\s+${GAP_WORD})?|\\s+especial(?:es)?)?`;
const AUXILIARY = '(?:ya|fue|fueron|ha|han|sido|se|quedo|quedaron|quedado|queda|quedan|esta|estan|sera|seran|correctamente|exitosamente)';
// «Lista de marcas registradas»: «marca registrada» es un nombre, no una confirmación.
const CONFIRMED = `(?<!\\bmarcas?\\s+)${PARTICIPLE}\\b`;
const DETERMINER = '(?:el|la|los|las|un|una|unos|unas|cada|este|esta|ese|esa|otro|otra)';
// Un verbo de recibir, responder, contestar, enviar, mandar, cotizar o contactar en primera persona del plural
// (presente o futuro) o dirigido al lector…
const RESPONSE_VERB = '\\b(?:recibiras|recibes|recibira|(?:te\\s+)?respondemos|(?:te\\s+)?contestamos|(?:te\\s+)?contestaremos|(?:te\\s+)?cotizamos|(?:te\\s+)?enviamos|(?:te\\s+)?mandamos|(?:te\\s+)?mandaremos|te\\s+contactamos|te\\s+llamamos|te\\s+atendemos)\\b';
// …o en primera persona del singular, la voz con la que el sitio habla por la persona de ventas («Te respondo», «Te
// escribo»): presente o futuro de responder, contestar, escribir, enviar y mandar. «Envío» y «mando» también son
// sustantivos, así que esos dos cuentan solo con «te», «le» o «les» delante. Solo es una promesa con un plazo después.
const SINGULAR_VERB = '\\b(?:(?:te|le|les)\\s+)?(?:respondo|contesto|escribo|respondere|contestare|escribire|enviare|mandare)\\b|\\b(?:te|le|les)\\s+(?:envio|mando)\\b';
// …y, a seis palabras como máximo, sin fin de frase y sin «que», «y», «para» ni una coma en medio (ahí empieza otra
// oración: «Recibes un extintor que se recarga en 1 hora»), un plazo con una cifra: «en 24 horas», «dentro de 48
// horas», «en menos de 2 horas», «en un día hábil». Una duración de uso no es un plazo: «en 8 horas de turno».
const RESPONSE_TIME = '\\b(?:en|dentro\\s+de)\\s+(?:(?:menos\\s+de|maximo|un\\s+maximo\\s+de)\\s+)?(?:\\d+|un|una)\\s+(?:minutos|min|horas?|hrs|h|dias?)(?:\\s+habil(?:es)?)?\\b(?!\\s+de\\s+(?:uso|turno|jornada|operacion|autonomia|duracion|exposicion)\\b)';
// …o un plazo sin cifra: «en breve», «pronto», «a la brevedad», «hoy mismo», «de inmediato».
const SOON = '\\b(?:en breve|(?:muy )?pronto|a la brevedad|hoy mismo|en (?:unos|pocos) minutos|en menos de|enseguida|en seguida|de inmediato|lo antes posible|lo mas pronto posible)\\b';
const FALSE_CONFIRMATION = new RegExp([
  // En primera persona: «Hemos enviado tu solicitud», «Ya enviamos tu mensaje», «Registramos tu pedido».
  new RegExp(`${NEGATED}\\b(?:recibimos|enviamos|registramos) (?:tu|su|tus|sus)\\b|\\bhemos (?:recibido|enviado|registrado)\\b|\\bya (?:recibimos|enviamos|registramos)\\b`),
  // El sustantivo con un auxiliar: «Tu solicitud fue enviada», «Tu lista se ha enviado», «Su solicitud ha quedado registrada».
  new RegExp(`${NOT_ASSERTED}\\b${CONFIRMATION_NOUN}${CONFIRMATION_GAP}\\s+(?:${AUXILIARY}\\s+){1,3}${PARTICIPLE}\\b`),
  // El sustantivo seguido del participio («Solicitud enviada», «Tu mensaje de WhatsApp enviado»), salvo después de un
  // artículo o una preposición: «al correo registrado», «la lista enviada por ti».
  new RegExp(`(?<!\\b(?:al|del|en|con|por|para|el|la|los|las|un|una|unos|unas|cada|este|esta|ese|esa|otro|otra)\\s+)${NOT_ASSERTED}\\b${CONFIRMATION_NOUN}${CONFIRMATION_GAP}\\s+${CONFIRMED}`),
  // Con un artículo, la frase que termina ahí también es una confirmación («La solicitud enviada.»), también con su
  // destino («La solicitud enviada a Sercom.»); la que sigue («Revisa la lista enviada por WhatsApp», «El correo
  // registrado del negocio») es un adjetivo. Después de una preposición («en la lista enviada») nunca lo es.
  new RegExp(`(?<!\\b(?:a|al|de|del|en|con|por|para)\\s+)\\b${DETERMINER}\\s+${CONFIRMATION_NOUN}${CONFIRMATION_GAP}\\s+${CONFIRMED}(?:\\s+(?:a|al)\\s+${GAP_WORD}(?:\\s+${GAP_WORD})?)?(?!\\s+(?-i:[a-z0-9]))`),
  new RegExp(`${NEGATED}\\b(?:se|fue|fueron|ha sido|han sido)\\s+(?:ha\\s+|han\\s+)?${PARTICIPLE}\\b|${NEGATED}\\b(?:ya\\s+)?se (?:envio|enviaron|recibio|recibieron|registro|registraron)\\b`),
  /\benviad[oa]s? (?:con exito|correctamente)\b|\benvio exitoso\b|\b(?:recibid|registrad)[oa]s? correctamente\b|\bmensaje enviado\b/,
  /¡\s*(?:listo|enviad[oa]|recibid[oa]|hecho)\s*!/,
  /gracias por (?:tu|su) (?:solicitud|mensaje|compra|cotizacion|pedido|lista|correo)/,
  /\bfolio\b|numero de seguimiento/,
  /\b(?:te|le) (?:responderemos|contestaremos|contactaremos|escribiremos|llamaremos|enviaremos|mandaremos|respondemos|contestamos|contactamos|escribimos|llamamos|mandamos|respondera|contactara|escribira|llamara|(?:daremos|damos) (?:una |tu |su )?respuesta)\b|\bnos (?:pondremos en contacto|comunicaremos)\b/,
  // «Ya tenemos tu solicitud»: una recepción afirmada.
  new RegExp(`${NEGATED}\\bya tenemos (?:tu|su|tus|sus) ${CONFIRMATION_NOUN}\\b`),
  // Un tercero que responde («Un asesor se comunicará contigo») o un plazo («Recibirás tu cotización en breve»).
  new RegExp(`${NEGATED}\\bse (?:comunicara|pondra en contacto)\\b`),
  /\brecibiras\b[^.!?<]{0,40}?\b(?:en breve|pronto|a la brevedad|hoy mismo|en (?:unos|pocos) minutos|en menos de)\b/,
  // Un plazo con una cifra o sin ella: «Recibirás tu cotización en 24 horas», «Te cotizamos en 24 hrs», «Respondemos
  // en 2 horas», «Contestamos a la brevedad», «Te respondo a la brevedad», «Te escribo en 24 horas».
  new RegExp(`${NEGATED}(?:${RESPONSE_VERB}|${SINGULAR_VERB})(?:\\s+(?!(?:que|y|para)\\b)[^\\s.!?;,<]+){0,6}?\\s+(?:${RESPONSE_TIME}|${SOON})`),
  // El plazo antes del verbo, con cifra o sin ella y con una coma o sin ella: «En breve recibirás tu cotización», «Pronto,
  // te contestamos», «A la brevedad te respondo», «En 24 horas recibirás tu cotización». «Envío» y «mando» cuentan solo
  // con «te», «le» o «les» delante, como en SINGULAR_VERB: «un pronto envío», «de inmediato mando a cero» no prometen nada.
  new RegExp(`(?:${SOON}|${RESPONSE_TIME})(?:\\s*,)?\\s+(?:(?:(?:te|le|les)\\s+)?(?:recibiras|recibes|recibira|respondemos|responderemos|contestamos|contestaremos|enviamos|enviaremos|mandamos|mandaremos|cotizamos|cotizaremos|escribimos|escribiremos|contactamos|contactaremos|llamamos|llamaremos|respondo|contesto|escribo|respondere|contestare|escribire|enviare|mandare)\\b|(?:te|le|les)\\s+(?:envio|mando)\\b)`),
].map(part => part.source).join('|'), 'i');
// Precios: símbolo o código de moneda junto a una cifra, la palabra de un precio seguida de una cifra y vocabulario
// de oferta. Un prefijo de moneda de una a tres mayúsculas antes de «$» («MX$350», «US$ 25») también es un precio.
const PRICE_WORD = '\\b(?:precio|costo|importe|monto|tarifa)s?';
// Una cantidad no es un precio: un número entero (sin decimales) seguido de una unidad en plural y sin otra cifra
// después en la misma frase («precio por volumen: 100 piezas o más»). «35 pza», «35.50 pieza», «3 pares por 250» o
// «12 piezas 1,500» siguen siendo precios. Se aplica justo después de la primera cifra.
const QUANTITY_UNIT = '(?:piezas|pzas|pzs|pares|cajas|unidades|paquetes|rollos|metros|mts|litros|lts|kilos|gramos|juegos|kits|bultos|docenas|galones|tramos|frascos|bolsas|sobres|cubetas)';
const NOT_QUANTITY = `(?!\\d*(?:,\\d{3})*\\s*${QUANTITY_UNIT}\\b(?![^.!?;\\d]*\\d))`;
// Palabras que hacen de la cifra que las sigue un dato del producto, no un importe.
const DATUM_NOUN = '(?:modelo|talla|tipo|clase|serie|nivel|numero|calibre|norma)';
// Entre «precio por|con|de|para» y una cifra: «Precio para talla 9».
const NOT_PRICE_NOUN = `(?!${DATUM_NOUN}\\b)`;
// Antes de una cifra con «con IVA», «sin IVA» o «IVA incluido»: esas palabras, la versión o el uso del CFDI («CFDI 4.0»,
// «Versión 4.0», «Talla No. 9») y las siglas de una norma en mayúsculas («Norma EN 388»). Una cifra justo después de
// ellas cuenta como dato aunque sea un importe: la regla no puede distinguirlos y gana la frase legítima.
const NOT_AFTER_DATUM = `(?<!\\b(?:${DATUM_NOUN}|version|cfdi|no\\.|num\\.)\\s+)(?<!\\b(?-i:EN|ISO|ANSI|NOM|NRR)\\s+)`;
// Las marcas de src/data/brands.json cuyo nombre empieza con una cifra, escritas como las escribe la marca. Después de
// «precio de» su nombre no es un importe: «El precio vigente de 3M», «Los precios de 3M se confirman al cotizar»,
// «Precio de marca 3M». Una prueba lee brands.json y falla si una marca así falta en esta lista.
export const FIGURE_BRANDS = ['3M'];
// Solo el nombre exacto (con sus mayúsculas), como palabra completa y sin una cifra después: «Precio de 3M 350» es un
// precio, y una cifra pegada a otras letras también («Precio de 2x1», «Precio de 350k», «Precio de 99c/u», «Costo de
// 3m»). Se aplica justo antes de la cifra.
const NOT_FIGURE_BRAND = `(?!(?-i:${FIGURE_BRANDS.map(escapeRegExp).join('|')})(?![A-Za-z0-9])(?![\\s-]*\\$?\\s?\\d))`;
/**
 * Patrón de R-RULE-01. En el código de un script (`code: true`) un «$» pegado a una letra, a otro «$», a «=» o a un
 * punto es código («$2», «a$1», «x=$1», «e.$2»), no un precio, y un prefijo en mayúsculas solo cuenta si no es parte
 * de un identificador («URL$1=…»). En el texto visible, en los atributos, en las cadenas `content:` del CSS y en las
 * cadenas de un script o de un JSON no hay excepción.
 */
const pricePattern = ({ code }) => new RegExp([
  new RegExp(`(?:${code ? '(?<![\\w$=.])\\$' : '\\$'}|€|£|\\bMXN|\\bUSD|\\bEUR|\\bM\\.N\\.)\\s?\\d[\\d.,]*(?:\\s?(?:pesos|MXN|USD|M\\.N\\.))?`),
  // «MX$350» en una cadena de un script: un prefijo en mayúsculas que no continúa como identificador, llamada o asignación.
  ...(code ? [/(?<![\w$])(?-i:[A-Z]{1,3})\$\s?\d[\d.,]*(?![\w$]|[.,][A-Za-z_$]|\s*=(?!=)|\s*\(|\s*[;)}\]?:])/] : []),
  /\d[\d.,]*\s?(?:(?:pesos|dolares|dolar|euros?|dlls?|MXN|USD|EUR)\b|M\.N\b\.?|[€£])/,
  // «350 MN» sin puntos, salvo en un modelo, una talla o un tipo («Modelo 3 MN»).
  /(?<!\b(?:modelo|talla|tipo|clase|serie|nivel|numero|calibre|no\.?)\s+)\b\d[\d.,]*\s?MN\b/,
  // «Precio: 350», «Precio por caja de 12: 350», «Costo: $350»; una clave de código («{monto:5}») también.
  new RegExp(`${PRICE_WORD}(?:\\s+[a-z0-9]+){0,4}\\s*:\\s*\\$?\\s?\\d${NOT_QUANTITY}`),
  // «Precio 350», «Precio unitario 350.00»; no «Precios y cotización 2026».
  new RegExp(`${PRICE_WORD}(?:\\s+(?!(?:y|e|o|u|ni|a|de|del|para|por|en|con|sin|segun|sujetos?)\\b)[a-z]+){0,2}\\s+\\$?\\s?\\d${NOT_QUANTITY}`),
  // «Precio por pieza 350.00», «Precio con IVA 350», «Precio de mayoreo 300»: «por», «con», «de» o «para» y una palabra
  // antes de la cifra; no un porcentaje («Precio con IVA 16%»), una talla, una serie o un modelo («Precio para talla 9»)
  // ni el nombre de una marca («Precio de marca 3M»).
  new RegExp(`${PRICE_WORD}\\s+(?:por|con|de|para)\\s+${NOT_PRICE_NOUN}[a-z]+\\s+\\$?\\s?${NOT_FIGURE_BRAND}\\d(?![\\d.,]*\\s*%)${NOT_QUANTITY}`),
  // «Precio de 350»; no un año («El precio de 2026 lo confirma Sercom»), una cantidad («el precio de 12 pares») ni el
  // nombre de una marca («Los precios de 3M»).
  new RegExp(`${PRICE_WORD}\\s+de\\s+\\$?\\s?(?!(?:19|20)\\d\\d\\b)${NOT_FIGURE_BRAND}\\d(?![\\d.,]*\\s*%)${NOT_QUANTITY}`),
  // «Precio unitario de 120»: una palabra entre la del precio y «de», con las mismas excepciones.
  new RegExp(`${PRICE_WORD}\\s+(?!(?:y|e|o|u|ni|a|de|del|para|por|en|con|sin|segun|sujetos?)\\b)${NOT_PRICE_NOUN}[a-z]+\\s+de\\s+\\$?\\s?(?!(?:19|20)\\d\\d\\b)${NOT_FIGURE_BRAND}\\d(?![\\d.,]*\\s*%)${NOT_QUANTITY}`),
  // Una cifra con el IVA: seguida de «+ IVA», «más IVA», «más el IVA», «con IVA», «sin IVA» o «IVA incluido», también
  // escrito «I.V.A.» («Casco 350 + IVA», «25.50 más I.V.A.», «Casco 350 con IVA», «350 IVA incluido»); no un porcentaje
  // («16% + IVA», «16% con IVA»). Con «con», «sin» e «incluido» la cifra es un dato, no un importe, cuando va pegada a
  // una letra o a un guion («CFDI G03 con IVA», el final de una norma: «NOM-017-STPS-2008 con IVA…») o sigue a una de
  // las palabras de NOT_AFTER_DATUM («Talla 9 con IVA», «Emitimos CFDI 4.0 con IVA trasladado»).
  new RegExp(`\\d[\\d.,]*\\s*(?:\\+|\\bmas\\b)\\s*(?:el\\s+)?I\\.?V\\.?A\\b|(?<![a-z\\d.,-])${NOT_AFTER_DATUM}\\d[\\d.,]*\\s*(?:\\b(?:con|sin)\\s+(?:el\\s+)?I\\.?V\\.?A\\b|I\\.?V\\.?A\\b\\.?\\s+incluid[oa]s?\\b)`),
  // «c/u» (cada uno) después de una cifra con dos decimales («25.50 c/u»). Con un entero no es un precio: puede ser una
  // cantidad («25 c/u», «12 pares c/u»).
  /\d[.,]\d{2}\s*c\/u\b/,
  /\bprecios? (?:desde|de lista|especial|mayoreo)|\bdescuentos?\b|\ben oferta\b|\bofertas? (?:especial(?:es)?|del mes|de la semana)\b|\bpromoci[oó]n(?:es)?\b|\brebajas?\b/,
].map(part => part.source).join('|'), 'i');
const PUBLIC_PRICE = pricePattern({ code: true });
const VISIBLE_PRICE = pricePattern({ code: false });
const strictInPreview = options => (options.preview ? 'FAIL' : 'WARN');

export const RULES = [
  rule('R-RULE-01', 'FAIL', 'words', PUBLIC_PRICE,
    'precio, importe o descuento público',
    'El catálogo no muestra precios, costos, descuentos ni importes: la acción es siempre cotizar. Busca símbolos y códigos de moneda junto a cifras («$350», «MX$350», «US$ 25», «350 M.N.», «350 dólares», «＄1,200»), «precio», «costo», «importe», «monto» o «tarifa» seguidos de una cifra (con dos puntos; sin ellos cuando entre la palabra y la cifra no hay una conjunción o preposición, o hay «de» («Precio de 350», salvo un año), o una palabra y «de» («Precio unitario de 120»), o «por», «con», «de» o «para» y una palabra: «Precio por pieza 350.00», salvo un porcentaje o una talla, una serie, un modelo o una norma: «Precio con IVA 16%», «Precio para talla 9»; en estas tres, el nombre de una marca de brands.json que empieza con una cifra, escrito como lo escribe la marca y como palabra completa (hoy solo «3M», con su mayúscula), no es una cifra: «El precio vigente de 3M», «Los precios de 3M se confirman al cotizar», «Precio de 3M: a cotizar» y «Precio de marca 3M» no fallan; cualquier otra cifra pegada a letras sí es un precio, y también la marca seguida de una cifra: «Precio de 2x1», «Precio de 350k», «Costo de 3m» y «Precio de 3M 350» sí fallan, igual que «Precio de 35pza»), una cifra con el IVA: seguida de «+ IVA», «más IVA», «más el IVA», «con IVA», «sin IVA» o «IVA incluido», también escrito «I.V.A.» («Casco 350 + IVA», «25.50 más I.V.A.», «Casco 350 con IVA», «350 IVA incluido»; no un porcentaje: «16% + IVA», «16% con IVA», «IVA 16%»; con «con IVA», «sin IVA» o «IVA incluido», no una cifra pegada a una letra ni la que sigue a un dato del producto o del documento: modelo, talla, tipo, clase, serie, nivel, número, «No.», calibre, norma, versión, CFDI o las siglas de una norma en mayúsculas (EN, ISO, ANSI, NOM, NRR): «Emitimos CFDI 4.0 con IVA trasladado», «Uso de CFDI G03 con IVA desglosado», «Guante calibre 15 con IVA desglosado», «Norma EN 388 con IVA», «Talla 9 con IVA», «Modelo 2200 con IVA» y el final de una norma, «NOM-017-STPS-2008 con IVA», no fallan; «Talla 9: 350 con IVA» y «Talla 9 a 350 con IVA» sí. Límite: una cifra justo después de esas palabras cuenta como dato aunque sea un importe, porque la regla no puede distinguirlos y gana la frase legítima; «+ IVA» y «más IVA» fallan después de cualquier cifra: «Modelo 2200 + IVA»), «c/u» después de una cifra con dos decimales («25.50 c/u»; con un entero no, porque puede ser una cantidad: «25 c/u», «12 pares c/u») y vocabulario de oferta, en el texto, en los atributos, en los scripts (también en el marcado que escriben), en JSON y en las cadenas `content:` del CSS. Una cantidad no es un precio: un número entero seguido de una unidad en plural y sin otra cifra en la misma frase («100 piezas o más», «12 pares»); «35 pza», «35.50 pieza» o «3 pares por 250» sí lo son. En el código de un script, fuera de las cadenas, un «$» pegado a un identificador («$2», «a$1», «e.$2», «URL$1=…») es código. Una clave de precio en el código público o en un JSON («var o={monto:5}», «{price:10}») falla siempre: el sitio no tiene campos de precio.'),
  rule('R-RULE-01', 'FAIL', 'prose', VISIBLE_PRICE,
    'precio en el texto, en un atributo o en el CSS',
    'El mismo patrón sin la excepción del código: en el texto visible, en los valores de los atributos (también las direcciones, con su %XX decodificado: el texto de un borrador de WhatsApp o de correo, «?text=Casco%20(MX%24350)»), en las cadenas `content:` del CSS (enteras, aunque lleven «;» o «}») y en las cadenas de un script o de un JSON, cualquier «$» seguido de una cifra es un precio, lo siga lo que lo siga («MX$350», «Desde MX$ 1,200», «Casco (MX$350)»). Solo la cadena de reemplazo de `.replace(…, "$1")` no es texto.'),
  rule('R-RULE-01', 'FAIL', 'joined', VISIBLE_PRICE,
    'precio o descuento partido por etiquetas en línea',
    'El mismo patrón en el texto visible con las etiquetas en línea retiradas: «Pro<b>moción</b>» se lee «Promoción».'),
  rule('R-RULE-01', 'FAIL', 'raw',
    /"(?:price|precio|lowPrice|highPrice|priceCurrency|costo?s?|importes?|montos?|tarifas?)"\s*:|[{,]\s*(?:price|precio|costo|importe|monto|tarifa)s?\s*:|\bdata-(?:price|precio|costo|importe|monto|tarifa)s?(?=\s*=)|itemprop=["']?price|schema\.org\/(?:Offer|AggregateOffer)/i,
    'precio en datos estructurados o en un campo de precio',
    'Tampoco se publican precios en datos para buscadores (JSON-LD, microdatos), ni campos de precio: una clave «price», «precio», «costo», «importe», «monto» o «tarifa» en un JSON o en el código público (`{"precio": 120}`, `var o={monto:5}`) o un atributo `data-precio` fallan siempre.'),
  rule('R-RULE-02', 'FAIL', 'words', /\bgratis\b|\bgratuit[oa]s?\b/i,
    'producto marcado como gratuito',
    'Omitir el precio no convierte un producto en gratuito.'),
  rule('R-RULE-02', 'FAIL', 'joined', /\bgratis\b|\bgratuit[oa]s?\b/i,
    'gratuito partido por etiquetas en línea',
    'También cuando una etiqueta en línea parte la palabra («gra<b>tis</b>»).'),
  rule('R-RULE-03', 'FAIL', 'norm', /\btest-(?:001|brand|category)\b|\bsintetic[oa] de prueba\b/i,
    'dato sintético de las pruebas automáticas',
    'Los datos de tests/ son sintéticos y nunca se usan en la web, en ningún modo.'),
  rule('R-RULE-04', strictInPreview, 'text',
    /\bANSI\b|\bASTM\b|\bOSHA\b|\bNIOSH\b|\bNRR\b|\bEN[\s-]?\d{3,5}\b|\bISO[\s-]?\d{3,5}\b/,
    'norma o valor técnico',
    'Una norma solo se muestra si consta en la fuente del producto. Producción: WARN para rastrear cada mención hasta su fuente. Vista previa: FAIL, porque un ejemplo nunca lleva normas. Las siglas se buscan en mayúsculas para no confundir «EN 388» con «en 2026».'),
  rule('R-RULE-04', strictInPreview, 'text', /\bNOM-\d|\bnivel(?:es)? de (?:corte|protecci[oó]n)\b|\bresistencia al corte\b/i,
    'norma mexicana o nivel de protección',
    'Igual que la anterior, para las NOM y los niveles de corte o de protección, sin distinguir mayúsculas.'),
  rule('R-RULE-05', 'FAIL', 'text',
    /\brese[ñn]as?\b|\btestimonios?\b|\bopiniones de (?:nuestros )?clientes\b|\bcasos de [eé]xito\b|\bclientes (?:satisfechos|que conf[ií]an)\b|\bnuestros clientes\b|★|⭐|\b\d(?:[.,]\d)?\s?estrellas\b/i,
    'reseña, testimonio o cliente',
    'No se publican reseñas, calificaciones, testimonios ni nombres de clientes sin evidencia real.'),
  rule('R-RULE-06', 'FAIL', 'text',
    /\ba[ñn]os de experiencia\b|\bm[aá]s de \d+ a[ñn]os\b|\bdesde (?:19|20)\d{2}\b|\bISO 9001\b|\bl[ií]der(?:es)?\b|\bgarantizad[oa]s?\b|\bel mejor precio\b|\bempresa 100\s?%/i,
    'experiencia o liderazgo sin evidencia',
    'Años de experiencia, liderazgo y garantías no se afirman sin evidencia del negocio.'),
  rule('R-RULE-06', strictInPreview, 'text', /\bcertificad[oa]s?\b|\bcertificaci[oó]n(?:es)?\b|\bdistintivos?\b|\b100\s?%/i,
    'certificación o distintivo',
    'Toda mención de certificación debe poder rastrearse a una evidencia. Producción: WARN. Vista previa: FAIL.'),
  rule('R-RULE-07', 'FAIL', 'words',
    /\boficial(?:es|mente)?\b|\bautorizad[oa]s?\b|\bdistribuidor(?:a|es|as)?\b|\bsucursal(?:es)?\b|\brepresentante(?:s)?\b/i,
    '«oficial», «autorizado», distribuidor, sucursal o representante',
    'La atención en Puebla no se presenta como oficial, autorizada, distribuidora, sucursal ni representante de una marca. La palabra «representante» (y «representantes») falla siempre, también en «Habla con un representante de ventas»: se escribe «la persona de ventas» o «escríbenos». El enlace de una marca se llama «Sitio del fabricante».'),
  rule('R-RULE-08', 'FAIL', 'norm', EXCLUDED_BRAND,
    'marca excluida',
    'La marca excluida no aparece en ningún archivo, con o sin espacios, guiones, acentos, mayúsculas, caracteres invisibles, ancho completo o codificación de URL.'),
  rule('R-RULE-08', 'FAIL', 'words', EXCLUDED_BRAND,
    'marca excluida en el texto o en un script',
    'También cuando una etiqueta separa las palabras («<strong>Guantes</strong> …») o un script une la marca a partir de piezas.'),
  rule('R-RULE-08', 'FAIL', 'joined', new RegExp(`${EXCLUDED_BRAND.source}|${EXCLUDED_LETTERS.source}`, 'i'),
    'marca excluida partida por etiquetas en línea',
    'Texto visible con las etiquetas en línea retiradas: «GI<span>SA</span>» se lee «GISA».'),
  rule('R-RULE-08', 'FAIL', 'norm', EXCLUDED_IN_IDENTIFIER,
    'marca excluida dentro de un identificador',
    'Nombres de variable, clase o archivo que llevan la marca pegada a otra palabra («gisaLogo», «GISA_URL»).'),
  rule('R-RULE-08', 'FAIL', 'text', EXCLUDED_LETTERS,
    'marca excluida escrita letra por letra',
    'Variante con puntos, guiones o espacios entre las letras; solo se busca en el texto visible.'),
  rule('R-RULE-09', 'FAIL', 'text',
    /\ben stock\b|\ben existencia\b|\bexistencias\b|\binventario\b|\bentrega (?:inmediata|el mismo d[ií]a|en \d+)|\bdisponibilidad inmediata\b|\bdisponibles? (?:hoy|ahora|de inmediato)\b|\benv[ií]os? (?:gratis|a todo|a toda)/i,
    'promesa de existencia, inventario o entrega',
    'La disponibilidad y el tiempo de entrega se confirman al cotizar; el sitio no los promete.'),
  rule('R-RULE-10', 'FAIL', 'words', FALSE_CONFIRMATION,
    'confirmación falsa de recepción o folio',
    'Abrir WhatsApp o el correo no es un envío: ninguna página ni script muestra confirmaciones («Solicitud enviada», «Hemos enviado tu solicitud», «Ya tenemos tu solicitud», también con mensaje, pedido o lista), folios o promesas de respuesta: «te» o «le» con responder, contestar, contactar, escribir, llamar, enviar o mandar en primera persona del plural («Te respondemos en breve», «Te contestamos», «Te mandaremos»), «te daremos respuesta», «te damos respuesta», «nos comunicaremos», «Un asesor se comunicará contigo»; un verbo de recibir, responder, contestar, enviar, mandar, cotizar o contactar dirigido al lector o en primera persona del plural, o responder, contestar, escribir, enviar o mandar en primera persona del singular, la voz del contacto de ventas («Te respondo», «Te escribiré»; «envío» y «mando» solo con «te», «le» o «les» delante, porque también son sustantivos), seguido, a seis palabras como máximo, sin fin de frase y sin «que», «y», «para» ni una coma en medio, de un plazo: «en» o «dentro de» con una cifra y una unidad de tiempo («Recibirás tu cotización en 24 horas», «Te cotizamos en 24 hrs», «Respondemos en menos de 2 horas», «Te escribo en 24 horas»; no «Recibes un extintor que se recarga en 1 hora» ni una duración de uso, como «en 8 horas de turno»; no «Precio en 24 horas» ni «Usa el respirador un máximo de 8 horas»), o un plazo sin cifra: «en breve», «pronto», «a la brevedad», «hoy mismo», «de inmediato», «lo antes posible» («Contestamos a la brevedad», «Te respondo a la brevedad»); y el plazo antes del verbo, con cifra o sin ella y con una coma o sin ella («En breve recibirás tu cotización», «A la brevedad, te respondo», «En 24 horas recibirás tu cotización»; ahí también «envío» y «mando» cuentan solo con «te», «le» o «les» delante: «un pronto envío» y «de inmediato mando a cero» no fallan). Sin plazo, la primera persona del singular no promete nada: «Te respondo dudas sobre tallas por WhatsApp», «Escríbeme por WhatsApp y te respondo» y «Mando la ficha técnica si el fabricante la publica» no fallan. El sustantivo y el participio pueden llevar entre ellos una preposición y una o dos palabras («Mensaje de WhatsApp enviado», «¡Tu solicitud a Sercom Active enviada!», «Solicitud por correo electrónico enviada»), nunca un verbo, o un auxiliar («Su solicitud ha quedado registrada»); con un artículo, la frase que termina ahí también falla, sola o con su destino («La solicitud enviada.», «La solicitud enviada a Sercom.»), y solo el participio que sigue como adjetivo («Revisa la lista enviada por WhatsApp», «al correo registrado») no cuenta. Una negación o una condición antes del sustantivo («Ningún mensaje queda registrado», «Sin correo registrado», «Cuando tu solicitud queda enviada…») tampoco. Busca en el texto, en los atributos (también en el marcado que guardan) y en las cadenas que escribe un script, también cuando escribe marcado («Solicitud <b>enviada</b>»).'),
  rule('R-RULE-10', 'FAIL', 'joined', FALSE_CONFIRMATION,
    'confirmación falsa partida por etiquetas en línea',
    'El mismo patrón en el texto visible con las etiquetas en línea retiradas: «Solicitud envi<span>ada</span>».'),
  rule('R-RULE-10', 'FAIL', 'norm', FALSE_CONFIRMATION,
    'confirmación falsa en el contenido de un archivo',
    'La misma revisión sobre el archivo completo (comentarios incluidos), con entidades y %XX decodificados.'),
  rule('R-RULE-13', 'FAIL', 'raw',
    /supplyConfirmed|usageConfirmed|checkedOn|sourceUrl|["']approval["']|\bapproval\s*:\s*\{|schemaVersion|whatsappTested|inPersonAttentionConfirmed|entity_id|entity_type|next_action|source_status|recommended_ingestion|unattended_api_or_feed_verified|monitoring_active|publication_policy|proposed_sync|excluded_entities|supplier_request_template|relationship_notes|Sercom_Active_Fuentes_Catalogos/,
    'metadatos internos o registro de investigación',
    'Los campos de aprobación, fuente y uso de imagen, los archivos de datos completos y el registro de investigación no llegan a la salida. Suele indicar que un <script> de navegador importó un módulo de datos.'),
  rule('R-RULE-16', 'WARN', 'text', /\bequivalentes?\b|\bsustitut[oa]s?\b|\bcompatibles?\b|\breemplaz[oa]\b/i,
    'equivalencia o compatibilidad afirmada',
    'Solo se afirma compatibilidad o equivalencia cuando el fabricante la documenta. Se lista para revisión.'),
  rule('R-RULE-18', 'FAIL', 'text',
    /\bfacturaci[oó]n\b|\bfacturamos\b|\bfactura\b|\bm[ií]nimos? de compra\b|\bcompra m[ií]nima\b|\bcobertura (?:nacional|en todo)\b|\b(?:formas?|m[eé]todos?) de pago\b|\bdevoluci(?:[oó]n|ones)\b|\bbordad[oa]s?\b|\bfabricamos\b|\bfabricaci[oó]n\b|\bpersonalizaci[oó]n\b|\bmeses sin intereses\b|\btarjeta de (?:cr[eé]dito|d[eé]bito)\b|\btransferencia (?:bancaria|electr[oó]nica)\b/i,
    'condición comercial o servicio no confirmado',
    'Facturación, mínimos, cobertura, pagos, devoluciones, fabricación y personalización no se anuncian hasta que el negocio los confirme.'),
  rule('R-RULE-19', 'FAIL', 'text', /\bactualizad[oa] (?:autom[aá]ticamente|en tiempo real|diariamente)\b|\btiempo real\b|\bsincronizad[oa]\b/i,
    'promesa de actualización automática',
    'No hay sincronización con proveedores: el sitio no promete datos en tiempo real.'),
  rule('R-RULE-22', 'FAIL', 'text',
    /\bcarrito\b|\bcheckout\b|\bpagar\b|\bpago en l[ií]nea\b|\bcomprar ahora\b|\biniciar sesi[oó]n\b|\breg[ií]strate\b|\bcrear (?:una )?cuenta\b|\bmi cuenta\b/i,
    'compra en línea, carrito o cuenta de cliente',
    'El sitio no vende en línea ni tiene cuentas de cliente.'),
  rule('R-RULE-26', 'WARN', 'text',
    /\b\d[\d.,]*\s?\+?\s?(?:clientes|empresas|productos en existencia|a[ñn]os)\b|\+\s?\d[\d.,]*\s?(?:clientes|empresas|productos)\b/i,
    'cifra o métrica comercial',
    'Las cifras comerciales deben ser reales y medidas. Se listan para revisión.'),
  rule('R-RULE-29', 'FAIL', 'raw',
    /(?:#|%23)(?:0e2a3d|00a6e5)(?:[0-9a-f]{2})?(?![0-9a-f])|rgba?\(\s*14[\s,]+42[\s,]+61\b|rgba?\(\s*0[\s,]+166[\s,]+229\b|prefers-color-scheme\s*:\s*dark|color-scheme:[^;}"']*\bdark\b|\blight-dark\(/i,
    'paleta anterior o tema oscuro',
    'La identidad sale del logotipo: tinta #19171A, azul #0067B0 y fondos blancos. El azul marino #0E2A3D y el celeste #00A6E5 del plan anterior no se usan, tampoco con transparencia (#0e2a3dcc, que es como la compilación escribe rgb(14 42 61 / 80%)), ni un tema oscuro (prefers-color-scheme, color-scheme, light-dark()).'),
];

// Reglas que solo aplican mientras la atención presencial no esté confirmada (sin --in-person).
const IN_PERSON_RULES = [
  rule('R-RULE-11', 'FAIL', 'raw', /vis[ií]tanos|ven a visitarnos|c[oó]mo llegar|google\.[a-z.]+\/maps|maps\.app\.goo\.gl|maps\.google|openstreetmap\.org|<iframe/i,
    '«Visítanos», mapa o visita anunciada',
    'Sin atención presencial confirmada no se anuncian visitas ni se inserta un mapa. Cualquier <iframe> falla mientras la atención presencial no esté confirmada, porque el escáner no distingue un mapa de otra inserción: un video del fabricante se da como enlace, no insertado.'),
  rule('R-RULE-11', 'FAIL', 'norm', /31-A\s*Nte|Villa San Alejandro|\b72090\b/i,
    'dirección publicada',
    'La dirección del negocio existe en los datos pero no se publica todavía. Si aparece en un archivo JS, un script importó business.json.'),
];

// Reglas que solo aplican a la compilación de producción (sin --preview).
const PRODUCTION_RULES = [
  rule('R-RULE-03', 'FAIL', 'norm', /\bEJ-\d|\bmarca de ejemplo\b|\bejemplo-[a-z0-9]|\bde\s+ejemplo\b/i,
    'marca de producto de ejemplo en producción',
    'Los productos de ejemplo solo existen en la vista previa. En producción no puede aparecer «EJ-», «Marca de ejemplo», «ejemplo-» ni «de ejemplo» en ningún archivo (tampoco como nombre de clase CSS).'),
  rule('R-RULE-03', 'FAIL', 'joined', /\bEJ-\d|\bmarca de ejemplo\b|\bde\s+ejemplo\b/i,
    'marca de producto de ejemplo partida por etiquetas',
    'Las mismas marcas en el texto visible, aunque una etiqueta las separe («de<br>ejemplo», «EJ-<span>1001</span>»).'),
];

// Las dos lecturas de los avisos de arriba, como las explica --rules (ver `shownText` y `allElementText`).
const SHOWN_TEXT_DOC = 'el texto de los elementos; no cuentan un comentario, también uno falso como «<?…>» o «</ …>», un script, un estilo, un atributo aunque su valor lleve «>», ni el contenido de un elemento que no se ve: <head>, <template>, <textarea>, <noscript>, <iframe>, <noembed>, <noframes>, <datalist>, <video>, <audio>, <canvas>, <rp>, un <object> con data, un <dialog> cerrado, un <details> cerrado salvo su primer <summary>, <title>, <desc> o <metadata> de un SVG, o un elemento con hidden, popover, aria-hidden="true" o display:none, visibility:hidden o collapse o content-visibility:hidden en su style, aunque lleve comentarios o escapes de CSS; un elemento oculto sigue abierto hasta su propia etiqueta de cierre, aunque dentro haya un «</div>» en un <textarea>, un <iframe>, un <template> o un <title> de SVG, y «/>» no cierra un elemento de HTML. El escáner no es un analizador de HTML y no modela: el texto de un SVG o de MathML que no se dibuja (fuera de <title>, <desc>, <metadata> y de lo escondido como en HTML, cuenta todo: también el texto suelto fuera de <text>, una sección CDATA, <annotation>, o un elemento escondido con display="none" o visibility="hidden" como atributos de presentación), una variable de CSS o una entidad con nombre poco común en el style («display:var(--x,none)», «display:none&semi;»), ni las reparaciones del analizador del navegador (un elemento de formato oculto que se vuelve a abrir después de cerrarse su bloque, una etiqueta de cierre que se ignora dentro de <select>, el doble escape de <script>); en esos casos un aviso que no se muestra puede contar como mostrado: esconderlo así es ocultarlo a propósito, y contra eso no protege un patrón. Una regla de una hoja de estilo que lo esconda no se ve aquí: la revisa check-markup';
const ALL_TEXT_DOC = 'en todo el texto de los elementos, oculto o no: también con hidden, aria-hidden="true", display:none, en <template> o en un <details> cerrado; el contenido de <noscript>, <textarea>, <title>, <iframe>, <noembed>, <noframes>, <xmp> y <plaintext> se lee tal cual y además como marcado, así que el aviso envuelto en uno de ellos con sus etiquetas también cuenta; fuera de esos elementos, un comentario, un script, un estilo o un atributo no cuentan. De las entidades con nombre solo se decodifican las comunes en español (&aacute;, &ntilde;, &middot;, &nbsp;…): un aviso cuyas propias palabras se escriben con otras («Sitio&Tab;en preparación», «&NewLine;», «&centerdot;») no se reconoce; escribirlo así es ocultarlo a propósito';

/** Comprobaciones que no son un patrón de texto. Sirven de documentación y se imprimen con --rules. */
export const CHECKS = [
  ['R-RULE-03', 'Producción: ningún archivo (ni binario, ni su nombre) contiene identificadores, códigos, nombres o textos del archivo de ejemplos, ni el aviso de vista previa. Los códigos también se buscan escritos con otro separador o sin él («EJ1001», «ej 1001»).'],
  ['R-RULE-03', `Vista previa: cada página muestra a todos el aviso de vista previa, y en cada página hay al menos tantas etiquetas «Ejemplo» como productos de ejemplo distintos se muestran. El aviso se busca en el texto que se muestra (${SHOWN_TEXT_DOC}).`],
  ['R-RULE-08', 'Ningún nombre de archivo contiene la marca excluida.'],
  ['R-RULE-12', `Antes del lanzamiento cada página lleva <meta name="robots" content="noindex…">, robots.txt bloquea todo el sitio a todos los buscadores (el grupo «User-agent: *» y cada grupo de un buscador nombrado tienen «Disallow: /» y ningún «Allow»; un grupo también empieza con «useragent» o «user agent», que los buscadores aceptan), no existe un sitemap y cada página de producción muestra a todos el aviso «${DEVELOPMENT_NOTICE}», buscado en el texto que se muestra (${SHOWN_TEXT_DOC}). La vista previa lleva solo su propio aviso: una página suya que lleva el de sitio en preparación falla, también oculto (${ALL_TEXT_DOC}).`],
  ['R-PUB-03', `Con --launch se exige lo contrario de R-RULE-12: ningún grupo de robots.txt bloquea el sitio entero, ninguna página lleva noindex y ninguna lleva el aviso «${DEVELOPMENT_NOTICE}», tampoco oculto: al lanzar el aviso se quita de la página, no se esconde (${ALL_TEXT_DOC}).`],
  ['R-RULE-13', 'Ningún enlace del registro de investigación aparece en la salida, salvo los «Sitio del fabricante» de brands.json. Tampoco sus notas internas, ni archivos de research/, docs/ o documentos sueltos (WARN).'],
  ['R-RULE-14', 'Las páginas generadas corresponden a los datos: /categorias/ solo categorías aprobadas (más las de borrador en la vista previa), /productos/ solo fichas aprobadas y productos retirados que fueron públicos (estado retired con aprobación comercial completa: conservan una página informativa), más los ejemplos en la vista previa (también el ejemplo retirado), /marcas/ solo las marcas públicas. Si existe alguna página de categoría o de producto, deben existir las de todos los registros visibles.'],
  ['R-RULE-24', 'Cada destino de WhatsApp (wa.me, api., web. o chat.whatsapp.com, wa.link, whatsapp://, intent://), de correo (mailto: y cualquier dirección escrita) y de teléfono (tel:, sms:) que aparece en la salida, en un enlace, en otro atributo, en un script o en un JSON, también escrito con \\/ o codificado con %XX dentro de otra dirección (aunque sea varias veces: se decodifica hasta que el texto deja de cambiar, ocho veces como máximo), es el de src/data/business.json. Un enlace de correo no lleva to, cc ni bcc, y uno de WhatsApp tiene la forma https://wa.me/<número>. En un atributo, un mailto: sin dirección o un tel: sin número, con letras o con un marcador sin sustituir («{correo}», «${tel}») falla: solo el código de un script puede llevar el principio de un enlace que completa. Los números con forma de teléfono del texto visible se listan (WARN).'],
  ['R-QUOTE-06', 'El texto de un enlace de WhatsApp va codificado en la URL.'],
  ['R-RULE-29', 'Ningún color está a 4 o menos por canal del azul marino o del celeste anteriores (hexadecimal, rgb() o hsl()) en una hoja de estilo, un atributo style o de color (fill, stroke, color, bgcolor, bordercolor, text, link…), los valores to, from, by y values de <animate> y <set> (salvo cuando animan un enlace), un <meta> de color, o en un script o un JSON: el valor de una propiedad, clave o constante cuyo nombre dice color (color, fill, background, bg, fondo, primary, accent, brand, marca, navy, azul, palette, paleta, theme, tema…; la palabra cuenta en cualquier lugar del nombre: «textcolor», «MAINCOLOR», «navbg», «darktheme»; salvo «tema», que cuenta solo al principio del nombre o de una de sus partes, después de «_», «-» o «$» o en camelCase: «temaOscuro», «tema_claro», «miTema»; no dentro de otra palabra, como «sistema», ni en «temas», que son asuntos, ni en «temática», «temático» o «temario», que son otras palabras; pegado a otra palabra sí cuenta: «temaoscuro»), cada valor de un objeto o una lista guardados bajo un nombre de color o de paleta («colores={fondo:…}», «palette=[…]») o el segundo argumento de setProperty, sea cual sea el primero. Ninguna página declara <meta name="color-scheme"> con dark.'],
  ['R-RULE-28', 'Ningún formulario envía datos a un servidor (method="post" o action con dirección absoluta).'],
  ['R-NAV-17', 'Cada página declara lang="es-MX" y lleva el enlace «Saltar al contenido» hacia un ancla de la misma página (que el ancla exista lo revisa check-links.mjs).'],
  ['R-PUB-04', 'La página 404 (404.html de la raíz) nunca declara <link rel="canonical">: el servidor la entrega en cualquier dirección desconocida y /404/ no es una página. Las demás páginas llevan su dirección canónica solo cuando se compila con SITE_URL.'],
  ['R-COPY-15', 'El <title> de la portada (index.html de la raíz) es la denominación provisional: el nombre de src/data/business.json, « · » y su titleLabel («Sercom Active · Atención en Puebla»). Las páginas interiores llevan «<Página> · Sercom Active» y la etiqueta «Atención comercial en Puebla» sigue en el encabezado, el pie y las descripciones.'],
  ['R-RULE-30', 'scripts/check-links.mjs revisa los enlaces: rotos, y los que no llevan a ninguna parte (vacíos, «#», javascript: o un <a> sin href). scripts/check-markup.mjs revisa solo los botones propios de la cabecera (Menú y Buscar con el panel que abren, y el botón de la búsqueda). Un botón que no hace nada no lo encuentra ninguna comprobación: solo la revisión de la página en el navegador.'],
  ['R-A11Y-06', 'Los enlaces y botones tienen texto o aria-label (WARN).'],
  ['R-A11Y-07', 'Cada imagen tiene atributo alt.'],
  ['BUILD', 'La carpeta no contiene restos de una compilación fallida (.prerender/).'],
];

// ---------------------------------------------------------------------------------------------------
// Datos del proyecto
// ---------------------------------------------------------------------------------------------------

/** Lee los datos que el escáner compara con la salida. */
export async function loadProjectData(root = ROOT) {
  const read = async path => JSON.parse(await readFile(join(root, path), 'utf8'));
  const [business, catalog, brands, examples, registry] = await Promise.all([
    read('src/data/business.json'), read('src/data/catalog.json'), read('src/data/brands.json'),
    read('src/data/preview/example-products.json'), read('research/Sercom_Active_Fuentes_Catalogos.json'),
  ]);
  return { business, catalog, brands, examples, registry };
}

/** Enlaces y notas del registro de investigación que nunca deben publicarse. */
function registryLeaks(registry, brands) {
  const allowed = new Set((brands ?? []).flatMap(brand => (brand.manufacturerLinks ?? []).map(link => link.url)));
  const urls = new Set();
  const notes = new Set();
  const note = (value, minimum = 20) => {
    if (typeof value === 'string' && value.trim().length >= minimum) notes.add(oneLine(value));
  };
  for (const source of registry?.sources ?? []) {
    for (const key of ['next_action', 'source_status', 'scope', 'recommended_ingestion', 'publication_policy']) note(source[key], 8);
    for (const resource of source.resources ?? []) {
      if (typeof resource.url === 'string' && !allowed.has(resource.url)) urls.add(resource.url);
      note(resource.verification);
      note(resource.label);
    }
  }
  for (const reference of registry?.technical_references ?? []) if (typeof reference.url === 'string') urls.add(reference.url);
  note(registry?.purpose);
  note(registry?.supplier_request_template);
  note(registry?.scope?.initial_product_scope);
  for (const value of registry?.scope?.relationship_notes ?? []) note(value);
  for (const value of Object.values(registry?.proposed_sync ?? {})) for (const item of Array.isArray(value) ? value : [value]) note(item);
  return { urls: [...urls], notes: [...notes] };
}

// ---------------------------------------------------------------------------------------------------
// Contacto, paleta y robots.txt
// ---------------------------------------------------------------------------------------------------

const shorten = (text, length = 90) => (text.length > length ? `${text.slice(0, length)}…` : text);
const URL_REST = `[^\\s"'<>\`)\\\\]*`;
const WHATSAPP_LINK = new RegExp(`(?<![\\w.-])(?:(?:https?:)?//)?(?:www\\.)?wa\\.me(?![\\w.-])(${URL_REST})`, 'gi');
// Otras formas de abrir WhatsApp: api., web. o chat.whatsapp.com, whatsapp.com, el acortador wa.link, whatsapp:// y un intent:// de Android.
const WHATSAPP_OTHER = new RegExp(`(?<![\\w.-])(?:(?:https?:)?//)?(?:[\\w-]+\\.)*(?:whatsapp\\.com|wa\\.link)(?![\\w.-])(${URL_REST})|\\bwhatsapp://(${URL_REST})|\\bwhatsapp:(send${URL_REST})|\\bintent://${URL_REST}(scheme=whatsapp${URL_REST})`, 'gi');
const MAILTO = new RegExp(`\\bmailto:(${URL_REST})`, 'gi');
// El número de un enlace de teléfono puede llevar espacios entre grupos de cifras («tel:+52 1 221 400 2219»).
const PHONE_LINK = new RegExp(`\\b(tel|sms):((?:[^\\s"'<>\`\\\\]|\\s(?=[\\d(+]))*)`, 'gi');
// Forma de correo. «logo@2x.png» o «paquete@5.2.8» tienen forma parecida, pero no son direcciones.
const EMAIL_SHAPE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}\b(?<!\.(?:png|jpe?g|webp|avif|gif|svg|ico|woff2?|ttf|otf|css|m?js|map|json))/gi;
// Comentario de licencia («/*! (c) autor <dev@example.org> */»): el correo de un autor no es un destino de contacto.
const LICENSE_COMMENT = /\/\*![\s\S]*?\*\//g;
/** Principio de una dirección que un script completa («`https://wa.me/${número}`», `a[href^="mailto:"]`): no es un destino. */
const isPrefix = rest => rest === '' || rest === '/' || /^\/?[$`{]/.test(rest);
// Un número de teléfono escrito en un enlace: cifras, «+», espacios, puntos, guiones y paréntesis.
const PHONE_SHAPE = /^\+?[\d\s().-]+$/;

/**
 * R-RULE-24: destinos de WhatsApp, correo y teléfono escritos en cualquier parte de un archivo (enlaces, otros
 * atributos, scripts, JSON) que no son los de business.json. También rechaza un correo con copia (to, cc, bcc).
 *
 * Fuera de los scripts (atributos, texto, JSON, CSS) un destino se lee tal cual: un `tel:` con letras o un marcador
 * sin sustituir («mailto:{correo}») fallan. Un «mailto:» o «tel:» sin nada detrás solo se acepta en el texto suelto,
 * donde puede ser una etiqueta («Tel: 221…») o un selector de CSS (`a[href^="mailto:"]`); en el valor de un atributo
 * (`attribute: true`) falla. Solo en el código de un script (`script: true`) un destino incompleto puede ser el
 * principio que el script completa.
 * @param {string} source Contenido con entidades y escapes de cadena decodificados.
 * @param {{ script?: boolean, attribute?: boolean, joinedPieces?: boolean, nestedOnly?: boolean }} [options]
 *   `joinedPieces`: el texto viene de `scriptText`, con las piezas de las cadenas unidas («"https://wa.me/"+"52155…"»);
 *   una dirección sin número o sin destinatario es entonces código.
 *   `nestedOnly`: el texto es el anterior con su %XX decodificado; solo se buscan destinos (no correos sueltos), para
 *   encontrar los que van dentro de otra dirección («https://l.example.com/?u=https%3A%2F%2Fwa.me%2F…»).
 */
function contactProblems(source, { digits, email, knownNumbers }, { script = false, attribute = false, joinedPieces = false, nestedOnly = false } = {}) {
  const problems = new Set();
  const incomplete = rest => (script ? isPrefix(rest) : !attribute && rest === '');
  for (const match of source.matchAll(WHATSAPP_LINK)) {
    const rest = match[1];
    if (incomplete(rest)) continue;
    const path = rest.split(/[?#]/)[0];
    // En el texto con las piezas unidas, «`https://wa.me/${número}?text=`» queda sin número: es código, no un destino.
    if (script && joinedPieces && (path === '' || path === '/')) continue;
    if (decodePercent(path) !== `/${digits}`) problems.add(`número de WhatsApp distinto del confirmado: ${shorten(match[0])}`);
  }
  for (const match of source.matchAll(WHATSAPP_OTHER)) {
    if (incomplete(match[1] ?? match[2] ?? match[3] ?? match[4] ?? '')) continue;
    problems.add(`enlace de WhatsApp que no tiene la forma confirmada (https://wa.me/${digits}): ${shorten(match[0])}`);
  }
  for (const match of source.matchAll(MAILTO)) {
    const value = match[1];
    if (incomplete(value)) continue;
    const queryStart = value.indexOf('?');
    if (script && joinedPieces && queryStart === 0) continue;
    const addresses = decodePercent(queryStart === -1 ? value : value.slice(0, queryStart)).split(',').map(address => address.trim().toLowerCase());
    if (addresses.some(address => address !== email)) problems.add(`correo distinto del confirmado o vacío: ${shorten(match[0])}`);
    const query = queryStart === -1 ? '' : value.slice(queryStart + 1);
    for (const key of query.split('&').map(param => decodePercent(param.split('=')[0]).trim().toLowerCase())) {
      if (['to', 'cc', 'bcc'].includes(key)) problems.add(`el borrador de correo también iría a otra dirección (${key}=): ${shorten(match[0])}`);
    }
  }
  for (const match of source.matchAll(PHONE_LINK)) {
    const value = match[2];
    if (incomplete(value)) continue;
    const written = decodePercent(value.split(/[?;]/)[0]).trim();
    const number = written.replace(/\D/g, '');
    if (!PHONE_SHAPE.test(written) || !knownNumbers.has(number)) problems.add(`teléfono distinto del confirmado, vacío o con letras: ${shorten(match[0])}`);
  }
  if (!nestedOnly) {
    for (const match of source.matchAll(EMAIL_SHAPE)) {
      if (match[0].toLowerCase() !== email) problems.add(`correo distinto del confirmado: ${match[0]}`);
    }
  }
  return [...problems];
}

// Veces que se decodifica %XX como máximo: un destino puede ir codificado varias veces dentro de otra dirección.
const PERCENT_PASSES = 8;
/**
 * Revisa un texto y, mientras cambia al decodificar su %XX (hasta `PERCENT_PASSES` veces), también los destinos que
 * lleva dentro: «https://l.example.com/?u=https%253A%252F%252Fwa.me%252F…» es un wa.me codificado dos veces.
 */
function contactProblemsDecoded(source, contact, options = {}) {
  let text = source.replace(/\p{Cf}/gu, '');
  const problems = contactProblems(text, contact, options);
  for (let pass = 0; pass < PERCENT_PASSES; pass += 1) {
    const decoded = decodePercent(text);
    if (decoded === text) break;
    problems.push(...contactProblems(decoded, contact, { ...options, nestedOnly: true }));
    text = decoded;
  }
  return problems;
}

// Un <script> con código: sin type, o de tipo módulo o JavaScript. Los de datos (JSON-LD, application/json) se leen como texto.
const isCodeScript = tag => /^(?:|module|(?:text|application)\/(?:java|ecma)script)$/i.test((attribute(tag, 'type') ?? '').trim());

/**
 * Partes de un archivo para R-RULE-24: lo que se lee tal cual (`plain`), el código de los scripts (`code`) y los
 * valores de los atributos que son un enlace de correo, de teléfono o de SMS (`links`).
 * @param {string} raw Contenido del archivo.
 * @param {string} extension
 */
function contactSources(raw, extension) {
  const decoded = decodeEntities(raw);
  if (extension === '.js' || extension === '.mjs') return { plain: '', code: decoded.replace(LICENSE_COMMENT, ' '), links: [] };
  const links = /^\.(?:html?|svg|xml)$/.test(extension)
    ? attributesOf(withoutScripts(raw)).map(([, value]) => value.trim()).filter(value => /^(?:mailto|tel|sms):/i.test(value))
    : [];
  if (!/^\.html?$/.test(extension)) return { plain: decoded.replace(LICENSE_COMMENT, ' '), code: '', links };
  const code = [];
  const plain = decoded.replace(/(<script\b[^>]*>)([\s\S]*?)<\/script>/gi, (whole, tag, content) => {
    if (!isCodeScript(tag)) return whole;
    code.push(content.replace(LICENSE_COMMENT, ' '));
    return `${tag}</script>`;
  });
  return { plain, code: code.join('\n'), links };
}

// Atributos que llevan un color: style, fill, stroke, los terminados en «color» (color, bgcolor, bordercolor,
// stop-color…) y los atributos de color antiguos sin guion (text, link, vlink, alink).
const COLOR_NAME = /^(?:style|fill|stroke|text|link|vlink|alink|[\w-]*colou?r)$/i;
// Las palabras de color cuentan en cualquier lugar del nombre («textcolor», «MAINCOLOR», «navbg», «darktheme»), salvo
// «tema», que va dentro de muchas palabras: cuenta solo donde empieza un nombre o una parte de él (al principio del
// identificador o de la clave, después de «_», «-» o «$», o en la mayúscula que abre una parte en camelCase:
// «temaOscuro», «miTema», «tema_claro»). Dentro de otra palabra no cuenta: «sistema» no lleva «tema».
const NAME_PART_START = '(?:(?<![A-Za-z0-9$])|(?<=[_$-])|(?<=(?-i:[a-z0-9]))(?=(?-i:[A-Z])))';
// «tema» en plural («temas», «TEMAS», «temasDelMes») son asuntos, no un tema de color, y «temática», «temático» y
// «temario» son otras palabras. Pegado a otra palabra sí cuenta («temaoscuro», «TEMAOSCURO»), igual que en camelCase.
const TEMA = `${NAME_PART_START}tema(?!(?-i:[sS](?![a-z])))(?!t[ií]c[ao]|rio)`;
// En un script o un JSON, un valor asignado a una propiedad, una clave o una constante cuyo nombre dice color
// («el.style.color="#…"», «{"fill":"#…"}», «const NAVY='#…'», «{primary:'#…'}»).
const COLOR_WORDS = `colou?r|background|fill|stroke|border|shadow|outline|bg|fondo|primary|secondary|accent|brand|marca|navy|cyan|cian|azul|palette|paleta|theme|${TEMA}`;
// El valor termina en una comilla, «;», «{» o «}»: en «tema={primary:'#…'}» también se lee la clave de dentro.
const SCRIPT_COLOR = new RegExp(`(?:${COLOR_WORDS})[\\w-]*["'\`]?\\s*[:=,]\\s*["'\`]?([^"'\`;{}]*)`, 'gi');
// Un objeto o una lista bajo un nombre que dice color o paleta («colores={fondo:'#…'}», «palette=['#…','#fff']»): se
// leen todos sus valores (con un nivel de anidación).
const SCRIPT_COLOR_GROUP = new RegExp(`(?:colou?r|palette|paleta|theme|${TEMA})[\\w-]*["'\`]?\\s*[:=]\\s*[{[](?:[^{}[\\]]|[{[][^{}[\\]]*[}\\]])*[}\\]]`, 'gi');
// El segundo argumento de `setProperty(…, '#…')`, cualquiera que sea el primero («'--marca'», «nombre»).
const SET_PROPERTY = /\bsetProperty\s*\(\s*[^,()]*,\s*["'`]?([^"'`)]*)/g;
/**
 * Lo que R-RULE-29 lee como color: una hoja de estilo entera; en HTML y SVG, los estilos, los atributos de color,
 * los valores `to`, `from`, `by` y `values` de <animate> y <set> (salvo los que animan un enlace), y el `content` de
 * un <meta> de color (theme-color); en un script o un JSON, los valores de las propiedades, claves y constantes de
 * color, todos los valores de un objeto o una lista de colores («colores={…}», «palette=[…]») y el segundo argumento
 * de `setProperty`. Un ancla («#00a6e9»), un identificador o un dato que se parece a un color no lo son. Los colores
 * exactos de la paleta anterior se buscan además en todo el archivo (regla R-RULE-29 de `raw`).
 * @param {string} raw
 * @param {string} extension
 */
function colorSources(raw, extension) {
  if (extension === '.css') return raw;
  const scriptColors = code => [...code.matchAll(SCRIPT_COLOR), ...code.matchAll(SCRIPT_COLOR_GROUP), ...code.matchAll(SET_PROPERTY)].map(match => match[0]).join('\n');
  if (!/^\.(?:html?|svg|xml)$/.test(extension)) return scriptColors(raw);
  const markup = withoutScripts(raw);
  const meta = [...markup.matchAll(/<meta\b[^>]*>/gi)].filter(match => /color/i.test(attribute(match[0], 'name') ?? '')).map(match => attribute(match[0], 'content') ?? '');
  // Una animación de un enlace («<set attributeName="href" to="#ancla">») no lleva un color.
  const animations = [...markup.matchAll(/<(?:animate|animateColor|set)\b[^>]*>/gi)]
    .filter(match => !/href$/i.test(attribute(match[0], 'attributeName') ?? ''))
    .flatMap(match => ['to', 'from', 'by', 'values'].map(name => attribute(match[0], name) ?? ''));
  const attributes = attributesOf(markup).filter(([name]) => COLOR_NAME.test(name)).map(([, value]) => value);
  return [inlineStyles(raw), scriptColors(inlineScripts(raw)), ...meta, ...animations, ...attributes].join('\n');
}

const OLD_PALETTE = [[0x0e, 0x2a, 0x3d], [0x00, 0xa6, 0xe5]];
const NEAR = 4;
/** HSL (grados y porcentajes) a RGB de 0 a 255. */
function hslToRgb(hue, saturation, lightness) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const sector = (((hue % 360) + 360) % 360) / 60;
  const second = chroma * (1 - Math.abs((sector % 2) - 1));
  const [r, g, b] = sector < 1 ? [chroma, second, 0] : sector < 2 ? [second, chroma, 0] : sector < 3 ? [0, chroma, second]
    : sector < 4 ? [0, second, chroma] : sector < 5 ? [second, 0, chroma] : [chroma, 0, second];
  const offset = lightness - chroma / 2;
  return [r, g, b].map(channel => Math.round((channel + offset) * 255));
}
/**
 * R-RULE-29: colores casi iguales a la paleta anterior (hasta 4 de diferencia por canal), como los que deja la
 * compilación al redondear un hsl() u oklch(), y los hsl() y rgb() de un atributo style, que la compilación no convierte.
 * @param {string} source
 */
function nearPaletteColors(source) {
  const found = [];
  const check = (text, rgb, exactIsCovered) => {
    const distance = Math.min(...OLD_PALETTE.map(color => Math.max(...color.map((channel, index) => Math.abs(channel - rgb[index])))));
    if (distance <= NEAR && !(distance === 0 && exactIsCovered)) found.push(text);
  };
  for (const match of source.matchAll(/(?:#|%23)([0-9a-f]{6})(?:[0-9a-f]{2})?(?![0-9a-f])/gi)) {
    check(match[0], [0, 2, 4].map(index => parseInt(match[1].slice(index, index + 2), 16)), true);
  }
  for (const match of source.matchAll(/rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)/gi)) {
    const channels = match.slice(1, 4).map(value => (value.endsWith('%') ? Math.round(parseFloat(value) * 2.55) : Number(value)));
    check(match[0], channels, !match[0].includes('%'));
  }
  for (const match of source.matchAll(/hsla?\(\s*(-?[\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/gi)) {
    check(match[0], hslToRgb(Number(match[1]), Number(match[2]) / 100, Number(match[3]) / 100), false);
  }
  return found;
}

/**
 * Reglas de robots.txt por buscador: cada agente nombrado y «*». Los grupos que nombran al mismo agente se combinan,
 * como hacen los buscadores; un buscador con su propio grupo solo obedece ese grupo, no el de «*». Un grupo empieza
 * con «User-agent», también escrito «useragent» o «user agent».
 * @returns {Map<string, [string, string][]>}
 */
function robotsAgents(text) {
  const groups = [];
  let current;
  let readingAgents = false;
  for (const line of text.replace(/^\ufeff/, '').split(/\r?\n/)) {
    const match = line.replace(/#.*/, '').trim().match(/^([a-z][a-z -]*?)\s*:\s*(.*)$/i);
    if (!match) continue;
    // Los buscadores aceptan «useragent» y «user agent» como «User-agent»: se comparan sin espacios ni guiones.
    const [field, value] = [match[1].toLowerCase().replace(/[\s-]/g, ''), match[2].trim()];
    if (field === 'useragent') {
      if (!current || !readingAgents) groups.push(current = { agents: [], rules: [] });
      current.agents.push(value.toLowerCase());
      readingAgents = true;
    } else {
      readingAgents = false;
      if (current && (field === 'allow' || field === 'disallow')) current.rules.push([field, value]);
    }
  }
  const agents = new Map();
  for (const group of groups) for (const agent of group.agents) agents.set(agent, [...(agents.get(agent) ?? []), ...group.rules]);
  return agents;
}

// ---------------------------------------------------------------------------------------------------
// Escaneo
// ---------------------------------------------------------------------------------------------------

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

// Separadores posibles dentro de un código: espacio, punto, guion bajo, diagonal y guiones de cualquier tipo.
const CODE_SEPARATOR = '[\\s._/\\-\u2010-\u2015\u2212]*';
const context = (text, index, length) => oneLine(text.slice(Math.max(0, index - 40), index + length + 40));
const globalPattern = pattern => new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);

/**
 * Revisa una carpeta compilada.
 * @param {string} directory
 * @param {{ preview?: boolean, launch?: boolean, inPerson?: boolean, data?: Awaited<ReturnType<typeof loadProjectData>> }} [options]
 * @returns {Promise<{ findings: { level: 'FAIL' | 'WARN', id: string, file: string, message: string }[], files: number, pages: number }>}
 */
export async function scanDist(directory, options = {}) {
  const { preview = false, launch = false, inPerson = false } = options;
  if (preview && launch) throw new Error('--preview y --launch se excluyen: los ejemplos nunca se lanzan.');
  const data = options.data ?? await loadProjectData();
  const business = data.business ?? {};
  const examples = data.examples ?? [];
  const files = (await walk(directory)).sort();
  const name = file => relative(directory, file).split('\\').join('/');
  const findings = [];
  const add = (level, id, file, message) => findings.push({ level, id, file: typeof file === 'string' ? name(file) || '.' : '.', message });

  const rules = [...RULES, ...(inPerson ? [] : IN_PERSON_RULES), ...(preview ? [] : PRODUCTION_RULES)];
  const leaks = registryLeaks(data.registry, data.brands);
  const exampleTokens = [...new Set(examples.flatMap(example => [example.id, example.code, example.name, example.summary, ...(example.characteristics ?? []), ...(example.variants ?? []).map(variant => variant.code)]))]
    .filter(token => typeof token === 'string' && token.length >= 6);
  // Códigos de los ejemplos con cualquier separador (o ninguno) entre sus partes.
  const exampleCodes = [...new Set(examples.flatMap(example => [example.code, ...(example.variants ?? []).map(variant => variant.code)]))]
    .filter(code => typeof code === 'string' && /[a-z]/i.test(code) && /\d/.test(code))
    .map(code => [code, new RegExp(`(?<![a-z0-9])${code.match(/[a-z]+|\d+/gi).map(escapeRegExp).join(CODE_SEPARATOR)}(?![0-9])`, 'i')]);
  const digits = String(business.whatsappDigits ?? '');
  const email = String(business.email ?? '').toLowerCase();
  const localNumber = digits.slice(-10);
  const knownNumbers = new Set([digits, `52${localNumber}`, localNumber, `1${localNumber}`]);
  const addressNeedle = oneLine(stripAccents(String(business.address ?? ''))).toLowerCase();
  const noticeNeedle = stripAccents(PREVIEW_NOTICE).toLowerCase();
  // Los avisos de arriba, como se buscan en el texto de los elementos (`shownText` y `allElementText`).
  const previewNotice = oneLine(fold(PREVIEW_NOTICE)).toLowerCase();
  const developmentNotice = oneLine(fold(DEVELOPMENT_NOTICE)).toLowerCase();
  const pages = files.filter(file => /\.html?$/i.test(file));

  for (const file of files) {
    const path = name(file);
    if (/\bgisa\b|guantes?[\s._+-]*internacional(?:es)?/i.test(normalizeContent(path))) add('FAIL', 'R-RULE-08', file, 'nombre de archivo con la marca excluida');
    if (path.split('/').includes('.prerender')) {
      add('FAIL', 'BUILD', file, 'restos de una compilación fallida (.prerender/): vuelve a compilar antes de revisar');
      continue;
    }
    if (!preview && /(?:^|[/._-])ejemplo-|example-products/i.test(path)) add('FAIL', 'R-RULE-03', file, 'nombre de archivo de un producto de ejemplo en producción');
    if (/(^|\/)(research|docs|private-imports)\//.test(path) || /\.(pdf|xlsx?|csv)$/i.test(path)) add('WARN', 'R-RULE-13', file, 'archivo que podría ser material interno o un documento sin revisar');
    if (!launch && /sitemap[^/]*\.xml$/i.test(path)) add('FAIL', 'R-RULE-12', file, 'sitemap generado antes del lanzamiento');

    const isText = TEXT_EXTENSIONS.has(extname(file).toLowerCase());
    const isHtml = /\.html?$/i.test(file);
    const raw = (await readFile(file)).toString('utf8');

    // R-RULE-03, producción: los textos del archivo de ejemplos no aparecen en ningún archivo, tampoco en binarios.
    if (!preview) {
      for (const token of exampleTokens) if (raw.includes(token)) add('FAIL', 'R-RULE-03', file, `contiene un dato del archivo de ejemplos: «${token.slice(0, 60)}»`);
    }
    if (!isText) continue;
    // R-RULE-03, producción: los códigos de los ejemplos escritos de otra forma («EJ1001», «ej 1001», «EJ–1001»).
    if (!preview) {
      const folded = fold(decodeEntities(raw));
      for (const [code, pattern] of exampleCodes) {
        // «ej.» en minúsculas seguido de un espacio es la abreviatura de «ejemplo» («Pedidos grandes, ej. 1001 piezas»).
        const found = [...folded.matchAll(globalPattern(pattern))].find(match => !/^ej\.\s/.test(match[0]));
        if (found && !raw.includes(code)) add('FAIL', 'R-RULE-03', file, `contiene un código del archivo de ejemplos escrito de otra forma: «${found[0]}» (${code})`);
      }
    }

    const extension = extname(file).toLowerCase();
    const norm = normalizeContent(raw);
    const shown = isHtml ? visibleText(raw) : '';
    const text = isHtml ? withoutAllowed(oneLine(fold(shown))) : '';
    const joined = isHtml ? withoutAllowed(joinedText(raw)) : '';
    // `words` junta lo que no es código (`visible`: texto, atributos, `content:` del CSS) y el código de los scripts.
    let readable;
    let visible;
    if (isHtml) {
      const markup = withoutScripts(raw);
      const otherAttributes = attributesOf(markup).filter(([name]) => !TEXT_ATTRIBUTES.test(name) && !NON_TEXT_ATTRIBUTES.test(name)).map(([, value]) => decodePercent(value));
      const styles = [inlineStyles(raw), ...attributesOf(markup).filter(([name]) => /^style$/i.test(name)).map(([, value]) => `x{${value}}`)].join('\n');
      const scripts = scriptText(inlineScripts(raw));
      // Un atributo que guarda marcado («data-msg="Solicitud &lt;b&gt;enviada&lt;/b&gt;"») se lee también sin sus etiquetas.
      const attributeMarkup = otherAttributes.filter(value => value.includes('<')).map(withoutMarkup);
      readable = [text, ...otherAttributes, ...attributeMarkup, scripts, withoutMarkup(scripts), cssContent(styles)].join('\n');
      // Los demás atributos, también las direcciones, son texto: el borrador de un enlace de WhatsApp o de correo
      // («?text=Casco%20(MX%24350)») es la única acción comercial del sitio, y ninguna dirección lleva «$» y una cifra.
      visible = [text, ...otherAttributes, ...attributeMarkup, cssContent(styles), scriptStrings(inlineScripts(raw))].join('\n');
    } else if (extension === '.css') {
      readable = `${raw}\n${cssContent(raw)}`;
      visible = cssContent(raw);
    } else {
      const scripts = scriptText(raw);
      readable = `${scripts}\n${withoutMarkup(scripts)}`;
      visible = extension === '.svg' || extension === '.xml' ? visibleText(raw) : '';
      if (visible) readable += `\n${visible}`;
      // Las cadenas de un script y los valores de un JSON son texto: se leen como `prose`.
      if (/^\.(?:m?js|json|webmanifest)$/.test(extension)) visible = scriptStrings(raw);
    }
    const comparable = value => (isHtml ? withoutAllowed(oneLine(fold(value))) : withoutAllowed(fold(value)));
    const words = comparable(readable);
    const prose = comparable(visible);
    const scopes = { text, joined, words, prose, norm, raw };

    // Un mismo hallazgo (regla y texto encontrado) se informa una sola vez aunque lo encuentren varios ámbitos.
    const seen = new Set();
    for (const { id, level, scope, pattern, title } of rules) {
      if ((scope === 'text' || scope === 'joined') && !isHtml) continue;
      const haystack = scopes[scope];
      for (const match of haystack.matchAll(globalPattern(pattern))) {
        const key = `${id}\u0000${oneLine(fold(match[0])).toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        add(typeof level === 'function' ? level(options) : level, id, file, `${title}: «${oneLine(match[0])}» … ${context(haystack, match.index, match[0].length)}`);
      }
    }

    // R-RULE-13: enlaces y notas del registro de investigación.
    const decoded = decodeEntities(raw);
    for (const url of leaks.urls) {
      const found = decoded.match(new RegExp(`${escapeRegExp(url)}(?![A-Za-z0-9/_%?#=&-])`));
      if (found) add('FAIL', 'R-RULE-13', file, `enlace del registro de investigación que no es un «Sitio del fabricante» publicado: ${url.slice(0, 90)}`);
    }
    for (const note of leaks.notes) if (oneLine(decoded).includes(note)) add('FAIL', 'R-RULE-13', file, `nota interna del registro de investigación: «${note.slice(0, 60)}»`);
    // R-RULE-11: la dirección exacta de business.json.
    if (!inPerson && addressNeedle && oneLine(norm).toLowerCase().includes(addressNeedle)) add('FAIL', 'R-RULE-11', file, 'dirección del negocio publicada sin atención presencial confirmada');
    // R-RULE-03, producción: el aviso de vista previa delata una compilación de vista previa.
    if (!preview && oneLine(norm).toLowerCase().includes(noticeNeedle)) add('FAIL', 'R-RULE-03', file, 'aviso de vista previa en una compilación de producción');
    // R-RULE-24: destinos de contacto en cualquier parte del archivo (atributos, scripts, JSON).
    const contact = { digits, email, knownNumbers };
    const { plain, code, links } = contactSources(raw, extension);
    for (const problem of new Set([
      ...links.flatMap(link => contactProblemsDecoded(unescapeScript(link), contact, { attribute: true })),
      ...contactProblemsDecoded(unescapeScript(plain), contact),
      ...contactProblemsDecoded(unescapeScript(code), contact, { script: true }),
      ...contactProblemsDecoded(scriptText(code), contact, { script: true, joinedPieces: true }),
    ])) add('FAIL', 'R-RULE-24', file, problem);
    // R-RULE-29: colores casi iguales a la paleta anterior.
    for (const color of new Set(nearPaletteColors(colorSources(raw, extension)))) add('FAIL', 'R-RULE-29', file, `color casi igual a la paleta anterior: «${color}»`);

    if (!isHtml) continue;
    const markup = withoutScripts(raw);

    // R-NAV-17 y R-RULE-12.
    if (!/<html\b[^>]*\slang=["']es-MX["']/i.test(raw)) add('FAIL', 'R-NAV-17', file, 'falta lang="es-MX"');
    const skipLink = [...markup.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].some(match => /^#[^\s#]+$/.test(attribute(match[0], 'href') ?? '') && oneLine(decodeEntities(match[1].replace(/<[^>]+>/g, ' '))) === SKIP_LINK_TEXT);
    if (!skipLink) add('FAIL', 'R-NAV-17', file, `falta el enlace «${SKIP_LINK_TEXT}» hacia el contenido principal`);
    const noindex = [...markup.matchAll(/<meta\b[^>]*>/gi)].some(match => /^robots$/i.test(attribute(match[0], 'name') ?? '') && /\bnoindex\b/i.test(attribute(match[0], 'content') ?? ''));
    if (!launch && !noindex) add('FAIL', 'R-RULE-12', file, 'falta <meta name="robots" content="noindex, nofollow"> antes del lanzamiento');
    if (launch && noindex) add('FAIL', 'R-PUB-03', file, 'noindex sigue presente en la versión de lanzamiento');
    // R-RULE-12 y R-PUB-03: el aviso de sitio en preparación. Se exige mostrado a todos (`shownText`) en cada página de
    // producción hasta el lanzamiento. Se prohíbe en la página, oculto o no (`allElementText`), con --launch y en la vista
    // previa, que lleva el suyo: al lanzar se quita, no se esconde.
    const pageText = shownText(raw);
    const elementsText = allElementText(raw);
    const hasDevelopmentNotice = elementsText.includes(developmentNotice);
    if (preview && hasDevelopmentNotice) add('FAIL', 'R-RULE-12', file, `la vista previa lleva el aviso «${DEVELOPMENT_NOTICE}» (oculto o no): lleva solo su propio aviso`);
    if (!preview && !launch && !pageText.includes(developmentNotice)) add('FAIL', 'R-RULE-12', file, `falta el aviso visible «${DEVELOPMENT_NOTICE}» antes del lanzamiento`);
    if (launch && hasDevelopmentNotice) add('FAIL', 'R-PUB-03', file, `el aviso «${DEVELOPMENT_NOTICE}» sigue en la versión de lanzamiento (oculto o no): debe quitarse`);

    // R-PUB-04: la página 404 no tiene dirección canónica (se entrega en cualquier dirección desconocida).
    if (path === '404.html') {
      for (const match of markup.matchAll(/<link\b[^>]*>/gi)) {
        if ((attribute(match[0], 'rel') ?? '').toLowerCase().split(/\s+/).includes('canonical')) add('FAIL', 'R-PUB-04', file, `la página 404 declara una dirección canónica: ${match[0].slice(0, 100)}`);
      }
    }

    // R-COPY-15: el título de la portada es la denominación provisional (nombre y titleLabel de business.json).
    if (path === 'index.html') {
      const head = markup.match(/<head\b[\s\S]*?<\/head>/i)?.[0] ?? markup;
      const found = head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
      const title = found ? oneLine(decodeEntities(found[1])) : undefined;
      const label = typeof business.titleLabel === 'string' ? business.titleLabel.trim() : '';
      const expected = `${business.name ?? ''} · ${label}`;
      if (!label) add('FAIL', 'R-COPY-15', file, 'src/data/business.json no tiene titleLabel: la portada no puede llevar su título');
      else if (title !== expected) add('FAIL', 'R-COPY-15', file, `el título de la portada es ${title === undefined ? 'inexistente' : `«${title}»`}; debe ser «${expected}»`);
    }

    // R-RULE-24 y R-QUOTE-06: un enlace de WhatsApp, en cualquier atributo (href, formaction, data-*…), tiene la forma
    // confirmada y su texto va codificado. Los números, correos y teléfonos de todo el archivo se revisan arriba.
    for (const [name, value] of attributesOf(markup)) {
      const href = value.trim();
      if (!/^(?:(?:https?:)?\/\/(?:www\.)?(?:wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)\b|whatsapp:)/i.test(href)) continue;
      if (!(href === `https://wa.me/${digits}` || href.startsWith(`https://wa.me/${digits}?text=`))) add('FAIL', 'R-RULE-24', file, `enlace de WhatsApp distinto del confirmado (${name}): ${shorten(href)}`);
      else if (/[^A-Za-z0-9%._~+*'()!-]/.test(href.split('?text=')[1] ?? '')) add('FAIL', 'R-QUOTE-06', file, `texto de WhatsApp sin codificar en la URL: ${shorten(href)}`);
    }
    // R-RULE-29: tema oscuro declarado con <meta name="color-scheme">.
    for (const match of markup.matchAll(/<meta\b[^>]*>/gi)) {
      if (/^color-scheme$/i.test(attribute(match[0], 'name') ?? '') && /\bdark\b/i.test(attribute(match[0], 'content') ?? '')) add('FAIL', 'R-RULE-29', file, `tema oscuro declarado: ${match[0].slice(0, 80)}`);
    }
    for (const match of shown.matchAll(/(?:\+?52[\s().-]*)?(?:1[\s().-]*)?\b\d{2,3}[\s().-]?\d{3,4}[\s().-]?\d{4}\b/g)) {
      const number = match[0].replace(/\D/g, '');
      if (number.length >= 10 && !knownNumbers.has(number)) add('WARN', 'R-RULE-24', file, `número con forma de teléfono distinto del confirmado: ${match[0].trim()}`);
    }

    // R-RULE-28, R-A11Y-06 y R-A11Y-07.
    for (const match of markup.matchAll(/<form\b[^>]*>/gi)) {
      if (/^post$/i.test(attribute(match[0], 'method') ?? '') || /^(?:https?:)?\/\//i.test(attribute(match[0], 'action') ?? '')) add('FAIL', 'R-RULE-28', file, `formulario con envío a un servidor: ${match[0].slice(0, 80)}`);
    }
    for (const match of markup.matchAll(/<(a|button)\b[^>]*>(?:\s|<[^>]+>)*<\/\1>/gi)) {
      if (!/\saria-label=["'][^"']+["']/i.test(match[0]) && !/\salt=["'][^"']+["']/i.test(match[0]) && !/<title>[^<]+<\/title>/i.test(match[0])) add('WARN', 'R-A11Y-06', file, `control sin texto: ${match[0].slice(0, 80)}`);
    }
    for (const match of markup.matchAll(/<img\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi)) if (attribute(match[0], 'alt') === undefined && !/\salt(?=[\s/>])/i.test(match[0])) add('FAIL', 'R-A11Y-07', file, `imagen sin alt: ${match[0].slice(0, 80)}`);

    // R-RULE-03, vista previa: aviso en cada página y etiqueta en cada ejemplo.
    if (preview) {
      const plain = stripAccents(shown).toLowerCase();
      // El aviso de vista previa se exige mostrado a todos (`shownText`).
      if (!pageText.includes(previewNotice)) add('FAIL', 'R-RULE-03', file, 'página de vista previa sin el aviso visible de vista previa');
      const shownExamples = new Set();
      for (const example of examples) {
        const byCode = typeof example.code === 'string' && new RegExp(`\\b${escapeRegExp(example.code)}\\b`).test(shown);
        const byName = typeof example.name === 'string' && plain.includes(stripAccents(example.name).toLowerCase());
        if (byCode || byName) shownExamples.add(example.code ?? example.name);
      }
      for (const match of shown.matchAll(/\bEJ-\d{3,4}\b/g)) shownExamples.add(match[0]);
      const tags = [...markup.matchAll(new RegExp(`>\\s*${escapeRegExp(EXAMPLE_TAG)}\\s*<`, 'g'))].length;
      if (shownExamples.size > tags) add('FAIL', 'R-RULE-03', file, `${shownExamples.size} producto(s) de ejemplo en la página y ${tags} etiqueta(s) «${EXAMPLE_TAG}»`);
    }
  }

  // R-RULE-12: robots.txt.
  // Bloquea todo el sitio cuando el grupo «User-agent: *» y cada grupo de un buscador nombrado tienen «Disallow: /» y
  // ningún «Allow» que lo abra. Un bloqueo que solo nombra a un buscador no cuenta, y un buscador con un grupo propio
  // que no bloquea (o sin reglas) puede recorrer todo el sitio aunque «*» esté bloqueado.
  const robots = files.find(file => name(file) === 'robots.txt');
  const agents = robotsAgents(robots ? await readFile(robots, 'utf8') : '');
  const blocks = rules => rules.some(([field, value]) => field === 'disallow' && value === '/') && !rules.some(([field, value]) => field === 'allow' && value !== '');
  if (!launch) {
    const open = [...agents].filter(([, rules]) => !blocks(rules)).map(([agent]) => agent);
    if (!agents.has('*')) add('FAIL', 'R-RULE-12', robots ?? join(directory, 'robots.txt'), 'robots.txt no bloquea todo el sitio a todos los buscadores (User-agent: * con Disallow: / y sin Allow) antes del lanzamiento');
    else if (open.length) add('FAIL', 'R-RULE-12', robots, `robots.txt no bloquea todo el sitio antes del lanzamiento: el grupo de ${open.map(agent => `«${agent}»`).join(', ')} no tiene Disallow: / o lleva un Allow`);
  }
  // Con --launch, ningún grupo puede seguir bloqueando el sitio entero.
  const stillBlocked = [...agents].filter(([, rules]) => rules.some(([field, value]) => field === 'disallow' && (value === '/' || value === '/*'))).map(([agent]) => agent);
  if (launch && stillBlocked.length) add('FAIL', 'R-PUB-03', robots, `robots.txt sigue bloqueando el sitio en la versión de lanzamiento (${stillBlocked.map(agent => `«${agent}»`).join(', ')})`);

  // R-RULE-14: las páginas generadas corresponden a registros que pueden mostrarse.
  const categories = data.catalog?.categories ?? [];
  const idsWhere = (list, test) => list.filter(test).map(item => item.id);
  // Carpeta, nombre para el informe, identificadores que pueden tener página y si deben tenerla todos.
  const sections = [
    ['categorias', 'categoría', [...idsWhere(categories, category => category.status === 'approved'), ...(preview ? idsWhere(categories, category => category.status === 'draft') : [])], true],
    // Un producto retirado que fue público conserva una página informativa en su dirección (R-STATE-04); el ejemplo
    // retirado está en el archivo de ejemplos, que solo cuenta en la vista previa.
    ['productos', 'producto', [...idsWhere(data.catalog?.products ?? [], product => product.status === 'approved' || isPublicRetired(product)), ...(preview ? examples.map(example => example.id) : [])], true],
    // Una marca puede no tener página propia (por ejemplo, si todavía no tiene productos): solo se exige que no sobren.
    ['marcas', 'marca', (data.brands ?? []).map(brand => brand.id), false],
  ];
  for (const [folder, label, expected, complete] of sections) {
    const built = new Set();
    for (const path of pages.map(name)) {
      const match = path.match(new RegExp(`^${folder}/([^/]+?)(?:/index\\.html?|\\.html?)$`));
      if (match && match[1] !== 'index') built.add(match[1]);
    }
    for (const id of built) if (!expected.includes(id)) add('FAIL', 'R-RULE-14', join(directory, folder, id), `página de ${label} sin un registro que pueda mostrarse en modo ${preview ? 'vista previa' : 'producción'}`);
    // Si el sitio ya genera páginas de este tipo, no puede faltar la de ningún registro visible.
    if (complete && built.size > 0) for (const id of expected) if (!built.has(id)) add('FAIL', 'R-RULE-14', join(directory, folder, id), `falta la página de ${label} «${id}»`);
  }

  const order = { FAIL: 0, WARN: 1 };
  findings.sort((a, b) => order[a.level] - order[b.level] || a.id.localeCompare(b.id) || a.file.localeCompare(b.file));
  return { findings, files: files.length, pages: pages.length };
}

// ---------------------------------------------------------------------------------------------------
// Línea de comandos
// ---------------------------------------------------------------------------------------------------

function printRules() {
  for (const { id, level, scope, title, doc } of [...RULES, ...IN_PERSON_RULES, ...PRODUCTION_RULES]) {
    console.log(`${id.padEnd(10)} ${(typeof level === 'function' ? 'WARN/FAIL' : level).padEnd(9)} ${scope.padEnd(5)} ${title}\n${' '.repeat(27)}${doc}`);
  }
  for (const [id, doc] of CHECKS) console.log(`${id.padEnd(10)} ${'·'.padEnd(9)} ${'·'.padEnd(5)} ${doc}`);
}

async function main(argv) {
  const flags = argv.filter(arg => arg.startsWith('--'));
  const unknown = flags.filter(flag => !['--preview', '--launch', '--in-person', '--strict', '--rules'].includes(flag));
  if (unknown.length) {
    console.error(`Opción no reconocida: ${unknown.join(', ')}\nUso: node scripts/scan-dist.mjs [carpeta] [--preview] [--launch] [--in-person] [--strict] [--rules]`);
    return 2;
  }
  if (flags.includes('--rules')) {
    printRules();
    return 0;
  }
  const options = { preview: flags.includes('--preview'), launch: flags.includes('--launch'), inPerson: flags.includes('--in-person') };
  const strict = flags.includes('--strict');
  if (options.preview && options.launch) {
    console.error('--preview y --launch se excluyen: los ejemplos nunca se lanzan.');
    return 2;
  }
  const target = argv.find(arg => !arg.startsWith('--')) ?? (options.preview ? 'dist-preview' : 'dist');
  const directory = resolve(target);
  let result;
  try {
    result = await scanDist(directory, options);
  } catch (error) {
    if (error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR') throw error;
    console.error(`No se puede leer ${target}: compila antes de revisar (npm run build o npm run build:preview).`);
    return 2;
  }
  if (result.pages === 0) {
    // Una carpeta vacía nunca cuenta como limpia.
    console.error(`No hay páginas HTML en ${target}: compila antes de revisar (npm run build o npm run build:preview).`);
    return 2;
  }
  for (const finding of result.findings) console.log(`${finding.level}  ${finding.id.padEnd(10)} ${finding.file}  ${finding.message}`);
  const fails = result.findings.filter(finding => finding.level === 'FAIL').length;
  const warnings = result.findings.length - fails;
  const mode = `${options.preview ? 'vista previa' : 'producción'}${options.launch ? ' + lanzamiento' : ''}${options.inPerson ? ' + atención presencial' : ''}${strict ? ' + estricto' : ''}`;
  console.log(`${result.findings.length ? '\n' : ''}Reglas · ${target} · modo ${mode}: ${result.files} archivos, ${result.pages} páginas HTML, ${fails} FAIL, ${warnings} WARN.`);
  if (strict && warnings) console.log('Con --strict los WARN también fallan: retira cada mención o, si tiene evidencia, documenta la decisión antes de relajar la opción.');
  console.log('Solo patrones de texto y datos del proyecto: no sustituye la revisión visual ni comprueba que una afirmación tenga evidencia.');
  return fails || (strict && warnings) ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
