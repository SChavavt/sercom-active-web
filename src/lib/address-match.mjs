// Cuándo dos direcciones son la misma página, y dónde aparece una dirección dada dentro de un texto. Código solo de
// compilación y de los scripts: lo usan el escáner (scripts/scan-dist.mjs, R-RULE-13), la revisión del texto de las
// fichas (scripts/catalog-text.mjs, a través del escáner) y `photoSourceErrors` (catalog-policy.mjs). No lee el disco ni
// importa nada: recibe textos y devuelve textos. Lee cada dirección con el analizador de direcciones de la plataforma
// (`URL`, el mismo del navegador) y compara lo que él devuelve.
//
// Antes de leerla: «\/», «/», «\x2f» y cualquier otra «\» se leen como «/» (una dirección dentro de un script o de
// un JSON), y una dirección que empieza con «//» se lee como «https://…». Solo es una dirección lo que empieza con
// «http:», «https:» o «//» y el analizador acepta. Dos direcciones son la misma página cuando coinciden en todo esto:
//   1. el esquema: «http://», «https://» y «//» cuentan igual;
//   2. el servidor como lo deja el analizador, sin su punto final y sin «www.» al principio. El analizador lo pasa a
//      minúsculas, decodifica su %XX y lo lleva a la forma que usa el navegador: las letras que el navegador lee como
//      otras («𝐦», «𝔪», «ſ», «ᵐ», «ⓜ», las de ancho completo) quedan como esas otras, el punto ideográfico es un punto,
//      lo que no se ve (el guion suave, el espacio de ancho cero, U+034F, U+FE0F) desaparece, y un nombre con acentos
//      queda en su forma «xn--», así que las dos formas de escribirlo son el mismo servidor;
//   3. el puerto: el analizador quita el de su esquema y lee «:0443» y un puerto vacío como ese; 80 y 443 no cuentan con
//      ningún esquema; cualquier otro puerto es otro servidor;
//   4. el usuario y la contraseña antes del servidor no cuentan, lleven las «@» que lleven;
//   5. la ruta como la deja el analizador (ya sin sus segmentos «.» y «..», también escritos «%2e»), con su %XX
//      decodificado otra vez mientras cambie (ocho veces como máximo), sin los segmentos «.» y «..» que aparecen al
//      decodificar, con las diagonales repetidas como una (un servidor sirve «//producto/» como «/producto/»), sin
//      distinguir mayúsculas y sin las diagonales del final;
//   6. la consulta («?…») sí es parte de la página: se compara como un conjunto de pares nombre=valor decodificados
//      («+» y «%20» son un espacio, el orden no importa, «a» es «a=»), sin los pares que solo cuentan una visita
//      (`TRACKING_PARAMETERS` y cualquier nombre que empieza con «utm_»). Una consulta vacía («?») no es consulta.
//      Por qué la consulta cuenta: el registro de investigación tiene la plantilla casi vacía
//      https://www.goldeneagle.com.mx/producto/, que no se publica, y cada página de producto de Golden Eagle es esa
//      misma ruta con «?producto=24»: son páginas distintas, y las de producto se pueden enlazar;
//   7. el fragmento («#…») no cuenta.
//
// En un texto (el HTML de una página con sus entidades decodificadas, un script, un JSON, un atributo, un campo), cada
// dirección escrita se lee de la misma forma y se compara con las de la lista. Una dirección escrita empieza con un
// esquema («https:», con o sin diagonales), con «//» o con «www.» donde no la precede una letra, una cifra, «@» ni otro
// signo de una dirección: un servidor escrito sin «//» ni «www.» («más información en goldeneagle.com.mx») es una
// frase, y una dirección de correo («ventas@servidor.mx») nunca es una página. Termina donde termina la dirección
// escrita: en un espacio, unas comillas, «<» o «>», y sin los signos de puntuación del final («.», «,», «;», «:», «!»,
// «?», «)», «]»). Si lo que sigue a la ruta la continúa («…/guias-de-recursos/09-catalogo…», «…/producto.html»), es
// otra página. «&» en la ruta también la termina: es el final de una dirección que va como valor dentro de la consulta
// de otra. El texto se lee tal cual y con su %XX decodificado, otra vez mientras cambie (una dirección codificada entera
// dentro de otra), y el valor de un atributo entre comillas, además, sin sus tabuladores ni saltos de línea.
//
// Lo que no ve: una dirección que un script arma con pedazos o escribe con escapes de sus letras («\x6d», «m») o
// con un salto de línea escrito «\n»; un par de la consulta que el servidor no lee y que `TRACKING_PARAMETERS` no tiene
// («?lang=es», «?=»), «index.html» o «index.php» después de una carpeta, un parámetro de la ruta («;x=1») y otro puerto:
// cada uno hace otra página.

/**
 * Pares de una consulta que solo cuentan una visita: no cambian la página. Además, cualquier nombre que empieza con
 * «utm_». Es una lista: un par que el servidor no lee y que no está aquí hace otra página.
 */
export const TRACKING_PARAMETERS = Object.freeze([
  'fbclid', 'gclid', 'msclkid', 'mc_cid', 'mc_eid', 'igshid', 'srsltid', '_gl', '_ga', 'gclsrc', 'dclid', 'gbraid', 'wbraid',
  'gad_source', 'gad_campaignid', 'yclid', 'twclid', 'ttclid', 'li_fat_id', '_hsenc', '_hsmi', 'mkt_tok',
]);
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
/** Una ruta sin sus segmentos «.» y «..», como los resuelve el analizador. */
function withoutDotSegments(path) {
  const kept = [];
  const segments = path.split('/').slice(1);
  segments.forEach((segment, index) => {
    const last = index === segments.length - 1;
    if (segment === '.' || segment === '..') {
      if (segment === '..') kept.pop();
      if (last) kept.push('');
    } else kept.push(segment);
  });
  return `/${kept.join('/')}`;
}
/**
 * La ruta como se compara: la del analizador, decodificada, con las diagonales repetidas como una, sin los segmentos «.»
 * y «..» que aparecen al decodificar, en minúsculas y sin las diagonales del final.
 */
function pathKey(pathname) {
  let path = decodedRepeatedly(pathname).replace(/\/{2,}/g, '/');
  if (/\/\.\.?(?:\/|$)/.test(path)) path = withoutDotSegments(path);
  return path.toLowerCase().replace(/\/+$/, '');
}

/**
 * Las partes de una dirección escrita completa como se comparan: servidor (con su puerto, si cuenta), ruta y consulta;
 * `null` si no es una dirección (sin «http:», «https:» ni «//» al principio, o si el analizador no la acepta).
 * @param {unknown} value
 * @returns {{ host: string, path: string, query: string } | null}
 */
export function addressParts(value) {
  if (typeof value !== 'string') return null;
  let text = withSlashes(value.trim().replace(/[\t\n\r]/g, ''));
  if (text.startsWith('//')) text = `https:${text}`;
  else if (!/^https?:/i.test(text)) return null;
  let url;
  try { url = new URL(text); } catch { return null; }
  const host = url.hostname.replace(/\.$/, '').replace(/^www\./, '');
  if (!host) return null;
  const port = url.port && url.port !== '80' && url.port !== '443' ? `:${url.port}` : '';
  return { host: `${host}${port}`, path: pathKey(url.pathname), query: queryKey(url.search.slice(1)) };
}

/** Las partes de una dirección en un solo texto, para buscarlas en un `Map`; `null` si no es una dirección. */
const partsKey = value => {
  const parts = addressParts(value);
  return parts && `${parts.host}\u0000${parts.path}\u0000${parts.query}`;
};

/**
 * ¿Son la misma página? Ver los siete puntos al principio del archivo. Lo que no es una dirección no es ninguna página.
 * @param {unknown} a
 * @param {unknown} b
 */
export function samePage(a, b) {
  const first = partsKey(a);
  return first !== null && first === partsKey(b);
}

/** Direcciones leídas como máximo en la memoria de una búsqueda; al llenarse, empieza de nuevo. */
const REMEMBERED = 50000;
/**
 * Prepara la comparación de una dirección con las de una lista: devuelve una función que recibe una dirección escrita
 * completa y devuelve las de la lista (tal como están escritas en ella) que son la misma página, en el orden de la
 * lista. Las partes de la lista se preparan una vez, y las de cada dirección leída se recuerdan por su texto.
 * @param {readonly string[]} addresses
 * @returns {(value: unknown) => string[]}
 */
export function addressMatcher(addresses) {
  /** @type {Map<string, string[]>} partes → direcciones de la lista */
  const byParts = new Map();
  for (const address of addresses) {
    const key = partsKey(address);
    if (key === null) continue;
    if (!byParts.has(key)) byParts.set(key, []);
    byParts.get(key)?.push(address);
  }
  /** @type {Map<string, string | null>} */
  const remembered = new Map();
  return value => {
    if (typeof value !== 'string' || byParts.size === 0) return [];
    let key = remembered.get(value);
    if (key === undefined) {
      if (remembered.size >= REMEMBERED) remembered.clear();
      key = partsKey(value);
      remembered.set(value, key);
    }
    return key === null ? [] : byParts.get(key) ?? [];
  };
}

// Dónde empieza una dirección escrita en un texto: un esquema (con o sin diagonales), «//» o «www.».
const ADDRESS_START = /https?:\/*|\/\/|www\./gi;
// Lo que no puede ir antes de «www.» cuando no hay esquema ni «//»: una letra, una cifra, «@» (un correo) u otro signo
// de una dirección o de un nombre.
const NOT_BEFORE_WWW = /[\p{L}\p{N}@._%+/:-]/u;
// Lo que termina una dirección escrita en un texto, y los signos que no son parte de ella cuando van al final.
const ADDRESS_END = /[\s"'<>`{}|^«»“”‘’]/gu;
const TRAILING_SIGNS = /[.,;:!?)\]]+$/;
// Un tabulador o un salto de línea escrito con escape de JavaScript o de JSON, y una diagonal invertida escrita («\\»).
const ESCAPED_BREAK = /\\\\|\\(?:[tnr]|u000[9ad]|x0[9ad])/gi;
const ESCAPED_BREAK_TEST = /\\(?:[tnr]|u000[9ad]|x0[9ad])/i;

/**
 * Prepara la búsqueda de unas direcciones dentro de textos. Devuelve una función que recibe un texto y devuelve las
 * direcciones de la lista (tal como están escritas en ella) que aparecen en él, en el orden de la lista.
 * @param {readonly string[]} addresses
 * @returns {(text: string) => string[]}
 */
export function addressFinder(addresses) {
  const matcher = addressMatcher(addresses);
  if (!addresses.some(address => partsKey(address) !== null)) return () => [];
  const order = new Map(addresses.map((address, index) => [address, index]));

  /** Las direcciones de la lista escritas en una lectura del texto. */
  const scanOne = (/** @type {string} */ text, /** @type {Set<string>} */ found) => {
    for (const match of text.matchAll(ADDRESS_START)) {
      const start = match.index ?? 0;
      const token = match[0].toLowerCase();
      if (token === 'www.' && start > 0 && NOT_BEFORE_WWW.test(text[start - 1])) continue;
      ADDRESS_END.lastIndex = start + token.length;
      const ending = ADDRESS_END.exec(text);
      const whole = text.slice(start, ending ? ending.index : text.length);
      const written = whole.replace(TRAILING_SIGNS, '');
      const prefix = token === 'www.' ? 'https://' : '';
      // Sin los signos del final y, si los había, también con ellos: «…/x/..» al final de una dirección es un segmento.
      const readings = written === whole ? [written] : [written, whole];
      // «&» en la ruta termina la dirección: cada «&» antes de la consulta y del fragmento da otra lectura.
      const pathEnd = written.slice(token.length).search(/[?#]/);
      const path = pathEnd === -1 ? written : written.slice(0, token.length + pathEnd);
      for (let at = path.indexOf('&', token.length); at !== -1; at = path.indexOf('&', at + 1)) readings.push(written.slice(0, at).replace(TRAILING_SIGNS, ''));
      for (const reading of readings) for (const address of matcher(`${prefix}${reading}`)) found.add(address);
    }
  };

  return text => {
    if (typeof text !== 'string' || !text) return [];
    const found = new Set();
    /** Cada lectura de un texto: tal cual y con su %XX decodificado, otra vez mientras cambie. */
    const scanDecoded = (/** @type {string} */ value) => {
      let current = withSlashes(value);
      scanOne(current, found);
      for (let pass = 0; pass < DECODE_PASSES && current.includes('%'); pass += 1) {
        const next = withSlashes(decodeRuns(current));
        if (next === current) break;
        current = next;
        scanOne(current, found);
      }
    };
    scanDecoded(text);
    // Un tabulador o un salto de línea escrito con escape en un JSON o un script («\t», «\n», «\r», «\u0009», «\x0A»…):
    // el script recibe el carácter. Dos lecturas más: sin él, como lo quita el navegador de una dirección, y con un
    // espacio en su lugar, donde termina la dirección. «\\» es una diagonal invertida escrita, no un escape.
    if (ESCAPED_BREAK_TEST.test(text)) {
      for (const by of ['', ' ']) scanDecoded(text.replace(ESCAPED_BREAK, escape => (escape === '\\\\' ? escape : by)));
    }
    // El valor de un atributo entre comillas con tabuladores o saltos de línea: el navegador los quita de la dirección.
    if (/[\t\n\r]/.test(text)) {
      for (const quoted of text.matchAll(/"([^"<>]*[\t\n\r][^"<>]*)"|'([^'<>]*[\t\n\r][^'<>]*)'/g)) {
        scanDecoded((quoted[1] ?? quoted[2]).replace(/[\t\n\r]/g, ''));
      }
    }
    return [...found].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  };
}
