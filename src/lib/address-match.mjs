// Cuándo dos direcciones son la misma página, y dónde aparece una dirección dada dentro de un texto. Código solo de
// compilación y de los scripts: lo usan el escáner (scripts/scan-dist.mjs, R-RULE-13), la revisión del texto de las
// fichas (scripts/catalog-text.mjs, a través del escáner) y `photoSourceErrors` (catalog-policy.mjs). No lee el disco ni
// importa nada: recibe textos y devuelve textos.
//
// Dos direcciones son la misma página cuando coinciden en todo esto:
//   1. el esquema: «http://», «https://» y una dirección que empieza con «//» cuentan igual;
//   2. el servidor, sin distinguir mayúsculas, con o sin «www.» al principio (un punto final y el puerto 443 u 80 no
//      cuentan: el navegador los quita);
//   3. la ruta, con su %XX decodificado (otra vez mientras cambie, ocho veces como máximo), sin distinguir mayúsculas y
//      sin las diagonales del final; «\/» y «\» se leen como «/» (una dirección dentro de un script o de un JSON);
//   4. el fragmento («#…») no cuenta;
//   5. la consulta («?…») sí es parte de la página: se compara como un conjunto de pares nombre=valor decodificados
//      («+» y «%20» son un espacio, el orden no importa, «a» es «a=»), sin los pares que solo cuentan una visita
//      (`TRACKING_PARAMETERS` y cualquier nombre que empieza con «utm_»). Una consulta vacía («?») no es consulta.
//      Por qué la consulta cuenta: el registro de investigación tiene la plantilla casi vacía
//      https://www.goldeneagle.com.mx/producto/, que no se publica, y cada página de producto de Golden Eagle es esa
//      misma ruta con «?producto=24»: son páginas distintas, y las de producto se pueden enlazar.
//
// En un texto (el HTML de una página con sus entidades decodificadas, un script, un JSON, un atributo, un campo), una
// dirección se encuentra donde aparece escrita de cualquiera de esas formas, también con su %XX codificado entero
// dentro de otra dirección. Empieza con un esquema («https:», con o sin diagonales), con «//» (con usuario o sin él) o
// con «www.» donde no la precede una letra, una cifra ni «@»: un servidor escrito sin «//» ni «www.» («más información
// en goldeneagle.com.mx») es una frase, y una dirección de correo («ventas@servidor.mx») nunca es una página. Termina
// donde termina la dirección escrita: en un espacio, unas comillas, «<» o «>», y sin los signos de puntuación del final
// («.», «,», «;», «:», «!», «?», «)»). Si lo que sigue a la ruta la continúa («…/guias-de-recursos/09-catalogo…»,
// «…/producto.html»), es otra página. «&» justo después de la ruta la termina: es el final de una dirección que va
// como valor dentro de la consulta de otra.
//
// Lo que el navegador limpia antes de abrir una dirección y esta comparación también ve: las mayúsculas del esquema y del
// servidor, «\» como «/», el puerto 443 u 80, un usuario antes del servidor, el punto final del servidor, los
// tabuladores y saltos de línea dentro del valor de un atributo entre comillas, y un servidor escrito con letras de
// ancho completo («ｗｗｗ．») o con el punto ideográfico. Lo que no ve: los segmentos «./» y «../» de una ruta, un salto
// de línea dentro de una cadena de un script (un «\n» escrito así) y un servidor escrito en su forma «xn--».

/** Pares de una consulta que solo cuentan una visita: no cambian la página. Además, cualquier nombre que empieza con «utm_». */
export const TRACKING_PARAMETERS = Object.freeze(['fbclid', 'gclid', 'msclkid', 'mc_cid', 'mc_eid', 'igshid']);
/** Veces que se decodifica el %XX como máximo, como el escáner. */
const DECODE_PASSES = 8;

const decodeRuns = text => text.replace(/(?:%[0-9a-f]{2})+/gi, run => {
  try { return decodeURIComponent(run); } catch { return run; }
});
/** Un texto con su %XX decodificado, otra vez mientras cambie, hasta `DECODE_PASSES` veces. */
function decodedRepeatedly(text) {
  let current = text;
  for (let pass = 0; pass < DECODE_PASSES; pass += 1) {
    const next = decodeRuns(current);
    if (next === current) break;
    current = next;
  }
  return current;
}
// «\/», «/» y «\x2F» (una diagonal escapada en un script o un JSON) y cualquier otra «\» se leen como «/».
const withSlashes = text => (text.includes('\\') ? text.replace(/\\(?:\/|u002f|x2f)/gi, '/').replace(/\\/g, '/') : text);
// Un servidor escrito con letras de ancho completo o con el punto ideográfico: el navegador lo lleva a su forma común.
const WIDE_FORMS = /[。！-～｡]/;
const narrowed = text => text.normalize('NFKC').replace(/[。｡]/g, '.');

const isTracking = name => /^utm_/i.test(name) || TRACKING_PARAMETERS.includes(name.toLowerCase());
const decodeComponent = text => decodedRepeatedly(text.replace(/\+/g, ' '));
/** La consulta como conjunto: los pares nombre=valor decodificados, sin los que solo cuentan una visita, ordenados. */
function queryKey(query) {
  const pairs = new Set();
  for (const part of query.split('&')) {
    if (!part) continue;
    const equals = part.indexOf('=');
    const name = decodeComponent(equals === -1 ? part : part.slice(0, equals));
    if (!name && equals === -1) continue;
    if (isTracking(name)) continue;
    pairs.add(JSON.stringify([name, decodeComponent(equals === -1 ? '' : part.slice(equals + 1))]));
  }
  return [...pairs].sort().join('&');
}
/** El servidor como se compara: en minúsculas, sin «www.» al principio y sin el punto final. */
const hostKey = host => host.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
/** La ruta como se compara: decodificada, en minúsculas y sin las diagonales del final. */
const pathKey = path => decodedRepeatedly(path).toLowerCase().replace(/\/+$/, '');

const ADDRESS = /^(?:https?:\/*|\/\/)(?:[^/?#@]*@)?([^/?#:]*)(?::(\d*))?([^?#]*)(?:\?([^#]*))?(?:#.*)?$/i;
/**
 * Las partes de una dirección escrita completa como se comparan: servidor, ruta y consulta; `null` si no es una
 * dirección (sin «http:», «https:» ni «//» al principio, o sin servidor).
 * @param {unknown} value
 * @returns {{ host: string, path: string, query: string } | null}
 */
export function addressParts(value) {
  if (typeof value !== 'string') return null;
  let text = withSlashes(value.trim().replace(/[\t\n\r]/g, ''));
  if (WIDE_FORMS.test(text)) text = narrowed(text);
  const match = ADDRESS.exec(text);
  if (!match) return null;
  const host = hostKey(decodedRepeatedly(match[1]));
  if (!host) return null;
  const port = match[2] && !['', '80', '443'].includes(match[2]) ? `:${match[2]}` : '';
  return { host: `${host}${port}`, path: pathKey(match[3]), query: match[4] === undefined ? '' : queryKey(match[4]) };
}

/**
 * ¿Son la misma página? Ver las cinco reglas al principio del archivo. Lo que no es una dirección no es ninguna página.
 * @param {unknown} a
 * @param {unknown} b
 */
export function samePage(a, b) {
  const first = addressParts(a);
  const second = addressParts(b);
  return first !== null && second !== null && first.host === second.host && first.path === second.path && first.query === second.query;
}

// Lo que termina una dirección escrita en un texto, y los signos que no son parte de ella cuando van al final.
const ADDRESS_END = /[\s"'<>`{}|^«»“”‘’]/gu;
const TRAILING_SIGNS = /[.,;:!?)\]]+$/;
const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Lo que puede ir justo antes del servidor: un esquema (con o sin diagonales) o «//», con un usuario o sin él.
const BEFORE_HOST = /(?:https?:\/*|\/\/(?:[^\s/?#@"'<>]*@)?)$/i;
// Lo que no puede ir antes de «www.» cuando no hay esquema ni «//»: una letra, una cifra, «@» (un correo) u otro signo
// de una dirección o de un nombre.
const NOT_BEFORE_WWW = /[\p{L}\p{N}@._%+/:-]$/u;

/**
 * Prepara la búsqueda de unas direcciones dentro de textos. Devuelve una función que recibe un texto y devuelve las
 * direcciones de la lista (tal como están escritas en ella) que aparecen en él, en el orden de la lista.
 * @param {readonly string[]} addresses
 * @returns {(text: string) => string[]}
 */
export function addressFinder(addresses) {
  /** @type {Map<string, { address: string, path: string, query: string }[]>} servidor → direcciones */
  const byHost = new Map();
  for (const address of addresses) {
    const parts = addressParts(address);
    if (!parts || parts.host.includes(':')) continue;
    if (!byHost.has(parts.host)) byHost.set(parts.host, []);
    byHost.get(parts.host)?.push({ address, path: parts.path, query: parts.query });
  }
  if (byHost.size === 0) return () => [];
  const hosts = [...byHost.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|');
  const order = new Map(addresses.map((address, index) => [address, index]));
  const pattern = new RegExp(`(?:www\\.)?(?:${hosts})`, 'gi');

  /** Las direcciones que aparecen en una lectura del texto. */
  const scanOne = (/** @type {string} */ text, /** @type {Set<string>} */ found) => {
    for (const match of text.matchAll(pattern)) {
      const start = match.index ?? 0;
      const before = text.slice(Math.max(0, start - 256), start);
      const startsWithWww = /^www\./i.test(match[0]);
      if (!BEFORE_HOST.test(before) && !(startsWithWww && !NOT_BEFORE_WWW.test(before))) continue;
      const host = hostKey(match[0]);
      let at = start + match[0].length;
      // El servidor no sigue: ni otra letra, ni otra parte después de un punto («servidor.mx.otro.example»).
      if (text[at] === '.' && !/[\p{L}\p{N}-]/u.test(text[at + 1] ?? '')) at += 1;
      if (/[\p{L}\p{N}_-]/u.test(text[at] ?? '') || (text[at] === '.' && /[\p{L}\p{N}]/u.test(text[at + 1] ?? ''))) continue;
      const port = /^:(\d+)/.exec(text.slice(at, at + 8));
      if (port) {
        if (port[1] !== '443' && port[1] !== '80') continue;
        at += port[0].length;
      }
      // Hasta dónde llega la dirección escrita, sin los signos de puntuación del final.
      ADDRESS_END.lastIndex = at;
      const ending = ADDRESS_END.exec(text);
      const rest = text.slice(at, ending ? ending.index : text.length).replace(TRAILING_SIGNS, '');
      const lower = rest.toLowerCase();
      for (const entry of byHost.get(host) ?? []) {
        if (found.has(entry.address) || !lower.startsWith(entry.path)) continue;
        let tail = rest.slice(entry.path.length).replace(/^\/+/, '');
        // Lo que continúa la ruta la hace otra página; «&» la termina (el final de un valor dentro de otra consulta).
        if (tail && !/^[?#&]/.test(tail)) continue;
        if (tail.startsWith('&')) tail = '';
        const query = tail.startsWith('?') ? tail.slice(1).split('#', 1)[0] : '';
        if (queryKey(query) === entry.query) found.add(entry.address);
      }
    }
  };

  return text => {
    if (typeof text !== 'string' || !text) return [];
    const found = new Set();
    /** Cada lectura de un texto: tal cual y con su %XX decodificado, otra vez mientras cambie. */
    const scanDecoded = (/** @type {string} */ value) => {
      let current = withSlashes(value);
      scanOne(current, found);
      if (WIDE_FORMS.test(current)) scanOne(narrowed(current), found);
      for (let pass = 0; pass < DECODE_PASSES && current.includes('%'); pass += 1) {
        const next = withSlashes(decodeRuns(current));
        if (next === current) break;
        current = next;
        scanOne(current, found);
      }
    };
    scanDecoded(text);
    // El valor de un atributo entre comillas con tabuladores o saltos de línea: el navegador los quita de la dirección.
    if (/[\t\n\r]/.test(text)) {
      for (const quoted of text.matchAll(/"([^"<>]*[\t\n\r][^"<>]*)"|'([^'<>]*[\t\n\r][^'<>]*)'/g)) {
        scanDecoded((quoted[1] ?? quoted[2]).replace(/[\t\n\r]/g, ''));
      }
    }
    return [...found].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  };
}
