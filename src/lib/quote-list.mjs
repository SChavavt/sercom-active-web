// @ts-check
// La lista de «Mi cotización»: cantidades y unidades, la lista guardada, el índice público que imprime la página, la
// vista de la lista para esa página y las frases que se muestran. También las decisiones de las páginas que la usan, como
// funciones puras con pruebas: qué deja «Deshacer» (`undoLines`), qué renglones repiten a otro (`duplicateStates`), qué
// productos van en el mensaje (`listMessageItems`) y qué llevan los enlaces directos de la ficha (`directLinkValues`).
// Apto para el navegador y para node:test: solo importa `text.mjs`; no lee datos ni toca el almacenamiento (eso es de
// `quote-store.mjs`). `buildQuoteIndex` y `jsonForScript` se usan al compilar; lo demás, en el navegador.
//
// El modelo: la lista guardada es una lista simple de renglones, en el orden en que el visitante los agregó. Nada aquí la
// «repara»: `parseList` solo descarta lo que este código nunca pudo haber escrito, y `reconcileList` es una VISTA para
// una página y no cambia ningún renglón. Dos renglones iguales pueden existir; se vuelven uno solo cuando el visitante
// agrega lo mismo otra vez desde la página del producto (`addLine`) o pulsa «Unirlos» en la página de cotizar
// (`mergeLines`). Ninguna función cambia sus argumentos.
/**
 * @import { DirectLinkValues, QuoteDuplicate, QuoteIndex, QuoteIndexMaps, QuoteIndexProduct, QuoteIndexRetired, QuoteIndexVariant, QuoteLine, QuoteMessageItem, QuoteRow, QuoteRowOk, QuoteUndo, QuoteUndoResult, RemovedLine } from '../types/quote.ts'
 */
import { cleanQuery, normalizeText } from './text.mjs';

/**
 * Clave de `localStorage` de la lista: `{ v: 1, lines: [{ productId, variantId, quantity, unit }] }`.
 * La clave y el formato cambian JUNTOS. Una página de una compilación anterior puede seguir abierta en otra pestaña: lo
 * que no sabe leer (otra versión, un renglón con otra forma, una cantidad o un número de renglones por encima de su
 * máximo) lo cuenta como si no estuviera (`parseList`) y se pierde la siguiente vez que el visitante cambia su lista en
 * esa página. Por eso un cambio de lo que un renglón guardado puede llevar, o subir `MAX_LINES` o `MAX_QUANTITY`, usa
 * una clave nueva (`cotizacion:v2`) que lee la anterior para pasarla: la página vieja nunca toca datos que no entiende.
 * Por si alguna vez se rompe esa regla, hay una segunda defensa: `quoteStore.write` no escribe encima de una lista
 * guardada con una versión mayor que la suya (`isNewerList`).
 */
export const QUOTE_STORAGE_KEY = 'cotizacion:v1';
/** Clave de `sessionStorage` de lo que el visitante escribe en «Cotizar mi lista». */
export const QUOTE_DRAFT_KEY = 'cotizacion:borrador:v1';
/** Renglones que puede tener la lista. */
export const MAX_LINES = 200;
/** Cantidad máxima de un renglón. */
export const MAX_QUANTITY = 99999;
/** Unidades que se ofrecen siempre, además de la unidad de venta del producto. */
export const STANDARD_UNITS = Object.freeze(['pieza', 'par', 'caja', 'paquete']);
/** Largo máximo (en caracteres completos) de cada campo del borrador. */
export const DRAFT_LIMITS = Object.freeze({ note: 10000, delivery: 200, date: 200 });

const VERSION = 1;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_ID_LENGTH = 120;
const MAX_UNIT_LENGTH = 60;

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value);
/** Un campo propio del objeto (nunca uno heredado). @param {Record<string, unknown>} record @param {string} key */
const own = (record, key) => (Object.hasOwn(record, key) ? record[key] : undefined);
/** @param {unknown} value @returns {value is string} */
const isSlug = value => typeof value === 'string' && value.length <= MAX_ID_LENGTH && SLUG.test(value);
/** Texto de una línea, recortado a `limit` caracteres completos (puntos de código). */
const oneLine = (/** @type {unknown} */ value, limit = Infinity) => Array.from(cleanQuery(value)).slice(0, limit).join('').trim();
/** @param {unknown} value */
const text = value => (typeof value === 'string' ? value : '');

// ---- cantidades y unidades -------------------------------------------------------------------------------------

/**
 * Cantidad que escribió el visitante: un entero de 1 a `MAX_QUANTITY`, o `null`.
 * Un texto se acepta, con espacios alrededor, solo de dos formas: de 1 a 5 cifras («12», « 12 », «0012») o con una coma
 * de miles («1,200» → 1200, «99,999» → 99999): en México mil doscientos se escribe «1,200». Con la coma, la primera
 * cifra no puede ser 0 («0,500» se lee como medio en otros países). Se rechazan «», «0», «-1», «+5», «1.5», «1,5»,
 * «12,00», «1.200», «1,2000», «100,000», «100000», «12a», «1e3» y las cifras de ancho completo. Un número se acepta si
 * es un entero dentro del rango.
 * @param {unknown} value
 * @returns {number | null}
 */
export function parseQuantity(value) {
  /** @type {number} */
  let quantity;
  if (typeof value === 'number') quantity = value;
  else if (typeof value === 'string') {
    const written = value.trim();
    if (/^[0-9]{1,5}$/.test(written)) quantity = Number(written);
    else if (/^[1-9][0-9]?,[0-9]{3}$/.test(written)) quantity = Number(written.replace(',', ''));
    else return null;
  } else return null;
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_QUANTITY ? quantity : null;
}

/**
 * Cantidad escrita como en el resto del sitio: sin separador hasta 9999 y con coma de miles desde 10,000
 * («1200», «12,000», «99,999»).
 * @param {number} quantity
 * @returns {string}
 */
export function formatQuantity(quantity) {
  const number = Math.trunc(Number(quantity));
  if (!Number.isFinite(number)) return '';
  const digits = String(Math.abs(number));
  const written = Math.abs(number) >= 10000 ? digits.replace(/\B(?=(?:[0-9]{3})+$)/g, ',') : digits;
  return number < 0 ? `-${written}` : written;
}

/**
 * Unidad lista para mostrar y guardar: una línea (`cleanQuery`), hasta 60 caracteres; cadena vacía si no se ve nada.
 * @param {unknown} value
 * @returns {string}
 */
export function cleanUnit(value) {
  return oneLine(value, MAX_UNIT_LENGTH);
}

// Palabras de unidad conocidas: singular y plural, como se escriben. Se reconocen en las dos formas, sin acentos ni
// mayúsculas.
const UNIT_WORDS = [
  ['pieza', 'piezas'], ['par', 'pares'], ['caja', 'cajas'], ['paquete', 'paquetes'], ['bolsa', 'bolsas'], ['rollo', 'rollos'],
  ['juego', 'juegos'], ['kit', 'kits'], ['metro', 'metros'], ['litro', 'litros'], ['galón', 'galones'], ['cubeta', 'cubetas'],
  ['docena', 'docenas'], ['millar', 'millares'], ['unidad', 'unidades'],
];
/** @type {Map<string, [string, string]>} */
const UNIT_FORMS = new Map(UNIT_WORDS.flatMap(([singular, plural]) => [
  [normalizeText(singular), /** @type {[string, string]} */ ([singular, plural])],
  [normalizeText(plural), /** @type {[string, string]} */ ([singular, plural])],
]));

/**
 * Clave para comparar dos unidades: sin acentos ni mayúsculas y con la primera palabra en singular cuando es una unidad
 * conocida. «Par», «PARES» y «pares» dan «par»; «Cajas con 100 piezas» da «caja con 100 piezas»; «galones» da «galon».
 * Dos unidades con la misma clave son la misma unidad: con la misma cantidad se leen igual (`quantityLabel`), salvo por
 * las mayúsculas. Una unidad de una palabra y otra compuesta («caja» y «caja con 100 piezas») son distintas.
 * @param {unknown} unit
 * @returns {string}
 */
export function unitKey(unit) {
  const [first = '', ...rest] = normalizeText(cleanUnit(unit)).split(' ');
  const forms = UNIT_FORMS.get(first);
  return [forms ? normalizeText(forms[0]) : first, ...rest].join(' ');
}

/**
 * Unidades que se ofrecen para un producto: su unidad de venta (si tiene) y luego las de `STANDARD_UNITS` que no son
 * ella (comparadas con `unitKey`: con la unidad de venta «pares» no se ofrece además «par»).
 * @param {unknown} saleUnit
 * @returns {string[]}
 */
export function unitOptions(saleUnit) {
  const unit = cleanUnit(saleUnit);
  const key = unitKey(unit);
  return [...(unit ? [unit] : []), ...STANDARD_UNITS.filter(standard => unitKey(standard) !== key)];
}

/**
 * Escribe `form` con las mayúsculas de `written`: todo en mayúsculas («PAR» → «PARES»), con mayúscula inicial
 * («Caja» → «Cajas») o en minúsculas.
 * @param {string} form
 * @param {string} written
 */
function sameCase(form, written) {
  if (written.length > 1 && written === written.toUpperCase() && written !== written.toLowerCase()) return form.toUpperCase();
  const first = written.charAt(0);
  if (first !== first.toLowerCase()) return form.charAt(0).toUpperCase() + form.slice(1);
  return form;
}

/**
 * Cantidad con su unidad, en singular para 1 y en plural para lo demás: «1 par», «12 pares», «3 cajas», «1200 pares»,
 * «12,000 piezas». En una unidad de varias palabras solo cambia la primera, si es una conocida: «3 cajas con 100
 * piezas». Con una primera palabra desconocida la unidad se deja como está y el número se separa: «3 × tambo de 200 L»
 * (y «1 tambo de 200 L»). Sin unidad, solo el número.
 * @param {number} quantity
 * @param {unknown} unit
 * @returns {string}
 */
export function quantityLabel(quantity, unit) {
  const number = formatQuantity(quantity);
  const written = cleanUnit(unit);
  if (!written) return number;
  const [first, ...rest] = written.split(' ');
  const forms = UNIT_FORMS.get(normalizeText(first));
  if (!forms) return Number(quantity) === 1 ? `${number} ${written}` : `${number} × ${written}`;
  const word = sameCase(Number(quantity) === 1 ? forms[0] : forms[1], first);
  return [number, word, ...rest].join(' ');
}

// ---- la lista guardada -----------------------------------------------------------------------------------------

/**
 * Identidad de un renglón tal como se guarda: producto, variante y unidad comparada con `unitKey`
 * («Par» = «par» = «pares»).
 * @param {QuoteLine} line
 * @returns {string}
 */
export function lineKey(line) {
  return JSON.stringify([String(line?.productId ?? ''), String(line?.variantId ?? ''), unitKey(line?.unit)]);
}

/**
 * ¿Es un renglón como los que escribe este código, y nada más? `productId` con forma de id (hasta 120 caracteres);
 * `variantId` vacío o con forma de id; `quantity` un NÚMERO entero de 1 a `MAX_QUANTITY` (un texto no vale); `unit` un
 * texto no vacío igual a su propio `cleanUnit`. Solo cuentan los campos propios del objeto.
 * @param {unknown} line
 * @returns {line is QuoteLine}
 */
export function isValidLine(line) {
  if (!isRecord(line)) return false;
  const productId = own(line, 'productId');
  const variantId = own(line, 'variantId');
  const quantity = own(line, 'quantity');
  const unit = own(line, 'unit');
  return isSlug(productId)
    && (variantId === '' || isSlug(variantId))
    && typeof quantity === 'number' && Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_QUANTITY
    && typeof unit === 'string' && unit !== '' && cleanUnit(unit) === unit;
}

/**
 * Copia de un renglón válido con exactamente sus cuatro campos.
 * @param {QuoteLine} line
 * @returns {QuoteLine}
 */
const copyLine = line => ({ productId: line.productId, variantId: line.variantId, quantity: line.quantity, unit: line.unit });

/**
 * Los renglones válidos de una lista cualquiera, copiados, hasta `MAX_LINES` (los primeros).
 * @param {unknown} lines
 * @returns {QuoteLine[]}
 */
function validLines(lines) {
  /** @type {QuoteLine[]} */
  const result = [];
  if (!Array.isArray(lines)) return result;
  for (const line of lines) {
    if (result.length >= MAX_LINES) break;
    if (isValidLine(line)) result.push(copyLine(line));
  }
  return result;
}

/**
 * La lista leída del almacenamiento (el texto guardado, o `null`). Siempre devuelve una lista y nunca lanza: un JSON
 * inválido, otra forma u otra versión dan `[]`. Conserva los renglones válidos en su orden, cada uno con sus cuatro
 * campos, hasta `MAX_LINES` (los primeros). NO une renglones iguales ni cambia ningún valor.
 * Lo que no se puede leer cuenta como si no estuviera: la página no lo muestra y el siguiente cambio del visitante lo
 * reemplaza. Solo este código escribe la clave, siempre con renglones válidos; lo demás llega de fuera (una edición a
 * mano, una extensión del navegador) o de otro formato, que por regla usa otra clave (ver `QUOTE_STORAGE_KEY`).
 * @param {unknown} raw
 * @returns {QuoteLine[]}
 */
export function parseList(raw) {
  if (typeof raw !== 'string') return [];
  /** @type {unknown} */
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!isRecord(data) || own(data, 'v') !== VERSION) return [];
  return validLines(own(data, 'lines'));
}

/**
 * ¿El texto guardado es una lista de una versión MÁS NUEVA que la de este código (un objeto cuyo `v` propio es un número
 * mayor)? Por regla no debería existir bajo esta clave (ver `QUOTE_STORAGE_KEY`); si existe, la escribió una compilación
 * posterior y esta página, que no la entiende (`parseList` da `[]`), no debe reemplazarla: `quoteStore.write` se niega.
 * Cualquier otra cosa ilegible (JSON inválido, otra forma, una versión menor o que no es un número) no cuenta.
 * @param {unknown} raw
 * @returns {boolean}
 */
export function isNewerList(raw) {
  if (typeof raw !== 'string') return false;
  /** @type {unknown} */
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return false;
  }
  if (!isRecord(data)) return false;
  const version = own(data, 'v');
  return typeof version === 'number' && version > VERSION;
}

/**
 * El texto que se guarda: `{ v: 1, lines }` con los renglones válidos, cuatro campos cada uno, hasta `MAX_LINES`.
 * @param {unknown} lines
 * @returns {string}
 */
export function serializeList(lines) {
  return JSON.stringify({ v: VERSION, lines: validLines(lines) });
}

/** Copia de la lista que recibe una función (sin cambiar los objetos). @param {unknown} lines @returns {QuoteLine[]} */
const listOf = lines => (Array.isArray(lines) ? [...lines] : []);
/** @param {unknown} index @param {readonly unknown[]} list @returns {index is number} */
const inRange = (index, list) => Number.isInteger(index) && /** @type {number} */ (index) >= 0 && /** @type {number} */ (index) < list.length;

/**
 * El visitante agrega un producto desde su página. → `{ lines, status, index, quantity }`:
 *   - `'invalid'`: el renglón no es válido; nada cambia (`index` -1, `quantity` 0);
 *   - `'merged'`: el primer renglón con la misma identidad (`lineKey`) cuya cantidad más la nueva no pasa de
 *     `MAX_QUANTITY` toma la suma; `index` es su posición y `quantity` el nuevo total;
 *   - `'added'`: no hay tal renglón (ninguno igual, o la suma pasaría del máximo: entonces quedan dos renglones); el
 *     renglón va al final; `index` es su posición y `quantity` la suya;
 *   - `'full'`: sería un renglón nuevo y ya hay `MAX_LINES`; nada cambia (`index` -1, `quantity` 0).
 * @param {readonly QuoteLine[]} lines
 * @param {QuoteLine} line
 * @returns {{ lines: QuoteLine[], status: 'invalid' | 'merged' | 'added' | 'full', index: number, quantity: number }}
 */
export function addLine(lines, line) {
  const list = listOf(lines);
  if (!isValidLine(line)) return { lines: list, status: 'invalid', index: -1, quantity: 0 };
  const key = lineKey(line);
  const index = list.findIndex(current => isValidLine(current) && lineKey(current) === key && current.quantity + line.quantity <= MAX_QUANTITY);
  if (index !== -1) {
    const quantity = list[index].quantity + line.quantity;
    list[index] = { ...copyLine(list[index]), quantity };
    return { lines: list, status: 'merged', index, quantity };
  }
  if (list.length >= MAX_LINES) return { lines: list, status: 'full', index: -1, quantity: 0 };
  list.push(copyLine(line));
  return { lines: list, status: 'added', index: list.length - 1, quantity: line.quantity };
}

/**
 * Cambia un renglón: `patch` puede traer `variantId`, `quantity` y `unit`. → `{ lines, ok }`; `ok` es `false` (y nada
 * cambia) si el índice está fuera de rango o el resultado no es un renglón válido. NUNCA une: si el renglón queda igual
 * a otro, quedan los dos.
 * @param {readonly QuoteLine[]} lines
 * @param {number} index
 * @param {Partial<Pick<QuoteLine, 'variantId' | 'quantity' | 'unit'>>} patch
 * @returns {{ lines: QuoteLine[], ok: boolean }}
 */
export function updateLine(lines, index, patch) {
  const list = listOf(lines);
  if (!inRange(index, list) || !isRecord(list[index])) return { lines: list, ok: false };
  /** @type {Record<string, unknown>} */
  const next = { ...copyLine(list[index]) };
  if (isRecord(patch)) {
    for (const key of ['variantId', 'quantity', 'unit']) {
      const value = own(patch, key);
      if (value !== undefined) next[key] = value;
    }
  }
  if (!isValidLine(next)) return { lines: list, ok: false };
  list[index] = copyLine(next);
  return { lines: list, ok: true };
}

/**
 * Quita renglones. → `{ lines, removed }`; `removed` son `{ index, line }` en orden creciente del índice original (los
 * índices fuera de rango o repetidos se ignoran). Es lo que necesita deshacer (`restoreLines`).
 * @param {readonly QuoteLine[]} lines
 * @param {readonly number[]} indexes
 * @returns {{ lines: QuoteLine[], removed: RemovedLine[] }}
 */
export function removeLines(lines, indexes) {
  const list = listOf(lines);
  const drop = new Set((Array.isArray(indexes) ? indexes : []).filter(index => inRange(index, list)));
  const removed = [...drop].sort((a, b) => a - b).map(index => ({ index, line: list[index] }));
  return { lines: list.filter((_, index) => !drop.has(index)), removed };
}

/**
 * Devuelve a la lista cada entrada de `removed` en su índice original, en orden creciente (un índice más allá del final
 * va al final). Se omiten las entradas que no son válidas o que pasarían la lista de `MAX_LINES`.
 * Para cualquier lista x e índices i: `restoreLines(removeLines(x, i).lines, removeLines(x, i).removed)` es igual a x.
 * @param {readonly QuoteLine[]} lines
 * @param {readonly RemovedLine[]} removed
 * @returns {QuoteLine[]}
 */
export function restoreLines(lines, removed) {
  const list = listOf(lines);
  const entries = (Array.isArray(removed) ? removed : [])
    .filter(entry => isRecord(entry) && Number.isInteger(entry.index) && /** @type {number} */ (entry.index) >= 0 && isValidLine(entry.line))
    .sort((a, b) => a.index - b.index);
  for (const entry of entries) {
    if (list.length >= MAX_LINES) break;
    list.splice(Math.min(entry.index, list.length), 0, entry.line);
  }
  return list;
}

/**
 * El visitante pulsó «Unirlos»: el renglón `keep` toma la suma de las dos cantidades y el renglón `drop` se quita.
 * → `{ lines, ok, index, previous, removed }`: `index` es donde queda el renglón que se conserva, `previous` la cantidad
 * que tenía y `removed` como en `removeLines`. Deshacer es `updateLine(lines, index, { quantity: previous })` seguido de
 * `restoreLines(…, removed)`. `ok` es `false` (y nada cambia) si un índice está fuera de rango, son el mismo, alguno no
 * es válido o la suma pasaría de `MAX_QUANTITY`. No compara los renglones: quien llama sabe que son iguales
 * (`duplicateOf`).
 * @param {readonly QuoteLine[]} lines
 * @param {number} keep
 * @param {number} drop
 * @returns {{ lines: QuoteLine[], ok: boolean, index: number, previous: number, removed: RemovedLine[] }}
 */
export function mergeLines(lines, keep, drop) {
  const list = listOf(lines);
  const fail = { lines: list, ok: false, index: -1, previous: 0, removed: [] };
  if (!inRange(keep, list) || !inRange(drop, list) || keep === drop) return fail;
  const kept = list[keep];
  const dropped = list[drop];
  if (!isValidLine(kept) || !isValidLine(dropped) || kept.quantity + dropped.quantity > MAX_QUANTITY) return fail;
  list[keep] = { ...copyLine(kept), quantity: kept.quantity + dropped.quantity };
  const { lines: next, removed } = removeLines(list, [drop]);
  return { lines: next, ok: true, index: keep > drop ? keep - 1 : keep, previous: kept.quantity, removed };
}

/**
 * El visitante pulsó «Deshacer» en la página de cotizar. → `{ lines, focus, kept }`:
 *   - `'remove'`: el renglón quitado vuelve a su lugar (`restoreLines`); el foco va a ese renglón;
 *   - `'merge'`: el renglón que se conservó vuelve a su cantidad de antes (`undo.previous`, en `undo.index`) y el otro
 *     vuelve a su lugar; lo que el visitante cambió en otros renglones después de unir se queda. El foco va al renglón
 *     que volvió, y `kept` es el que se conservó, ya con su cantidad de antes (la página la escribe en su campo);
 *   - `'unknown'`: vuelven los renglones que la página no ubica; ningún renglón recibe el foco;
 *   - `'empty'`: la lista vuelve a ser la de antes de vaciarla (`undo.previous`); ningún renglón recibe el foco.
 * `focus` es una posición de `lines` (la del primer renglón que volvió, o la última si la lista quedó más corta) o -1;
 * `kept` es `null` salvo al deshacer una unión. Sin `undo`, la lista como está.
 * @param {readonly QuoteLine[]} lines
 * @param {QuoteUndo | null | undefined} undo
 * @returns {QuoteUndoResult}
 */
export function undoLines(lines, undo) {
  if (undo?.kind === 'empty') return { lines: listOf(undo.previous), focus: -1, kept: null };
  if (undo?.kind === 'merge') {
    const restored = updateLine(lines, undo.index, { quantity: undo.previous }).lines;
    const next = restoreLines(restored, undo.removed);
    return { lines: next, focus: focusAt(next, undo.removed), kept: restored[undo.index] ?? null };
  }
  if (undo?.kind === 'remove') {
    const next = restoreLines(lines, undo.removed);
    return { lines: next, focus: focusAt(next, undo.removed), kept: null };
  }
  if (undo?.kind === 'unknown') return { lines: restoreLines(lines, undo.removed), focus: -1, kept: null };
  return { lines: listOf(lines), focus: -1, kept: null };
}

/**
 * La posición original del primer renglón quitado, sin pasar del último de `lines`; -1 si no hay renglones quitados o la
 * lista quedó vacía.
 * @param {readonly QuoteLine[]} lines
 * @param {readonly RemovedLine[]} removed
 */
function focusAt(lines, removed) {
  const index = Array.isArray(removed) ? removed[0]?.index ?? -1 : -1;
  return index >= 0 && lines.length > 0 ? Math.min(index, lines.length - 1) : -1;
}

// ---- el índice público que imprime una página, y la vista de la lista para esa página ---------------------------

/**
 * AL COMPILAR: el índice público que una página imprime para su script, con exactamente estos campos y nada más del
 * producto (ni resumen, ni características, ni imagen, ni documentos, ni categorías).
 * @param {readonly { id: string, name: string, brandName: string, code: string, url: string, saleUnit: string, isExample: boolean, variants: readonly { id: string, label: string, code: string }[] }[]} products
 * @param {readonly { id: string, name: string, brandName: string, code: string, url: string, isExample: boolean }[]} [retiredProducts]
 * @returns {QuoteIndex}
 */
export function buildQuoteIndex(products, retiredProducts = []) {
  return {
    products: products.map(product => ({
      id: product.id,
      name: product.name,
      brandName: product.brandName,
      code: product.code,
      url: product.url,
      saleUnit: product.saleUnit,
      isExample: product.isExample === true,
      variants: product.variants.map(variant => ({ id: variant.id, label: variant.label, code: variant.code })),
    })),
    retired: retiredProducts.map(product => ({
      id: product.id, name: product.name, brandName: product.brandName, code: product.code, url: product.url, isExample: product.isExample === true,
    })),
  };
}

/**
 * `JSON.stringify` con «<», «>», «&», U+2028 y U+2029 escritos como \uXXXX: seguro dentro de
 * `<script type="application/json">` (ni «</script>» ni «<!--» pueden cerrar o cambiar el bloque).
 * @param {unknown} value
 * @returns {string}
 */
export function jsonForScript(value) {
  const json = JSON.stringify(value) ?? 'null';
  return json.replace(/[<>&\u2028\u2029]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

/** @param {unknown} value @returns {QuoteIndexVariant | null} */
const variantEntry = value => (isRecord(value) && typeof value.id === 'string'
  ? { id: value.id, label: text(value.label), code: text(value.code) }
  : null);

/** @param {unknown} value @returns {QuoteIndexProduct | null} */
const productEntry = value => (isRecord(value) && typeof value.id === 'string'
  ? {
    id: value.id, name: text(value.name), brandName: text(value.brandName), code: text(value.code), url: text(value.url),
    saleUnit: text(value.saleUnit), isExample: value.isExample === true,
    variants: (Array.isArray(value.variants) ? value.variants : []).map(variantEntry).filter(variant => variant !== null),
  }
  : null);

/** @param {unknown} value @returns {QuoteIndexRetired | null} */
const retiredEntry = value => (isRecord(value) && typeof value.id === 'string'
  ? { id: value.id, name: text(value.name), brandName: text(value.brandName), code: text(value.code), url: text(value.url), isExample: value.isExample === true }
  : null);

/**
 * El índice leído del texto de su bloque JSON (o `null`). Nunca lanza: un JSON inválido o con otra forma da
 * `{ products: [], retired: [] }`; las entradas sin un id de texto se descartan, una lista que falta queda vacía y cada
 * campo que no es texto queda como cadena vacía.
 * @param {unknown} source
 * @returns {QuoteIndex}
 */
export function parseQuoteIndex(source) {
  /** @type {unknown} */
  let data = null;
  try {
    data = typeof source === 'string' ? JSON.parse(source) : null;
  } catch {
    data = null;
  }
  if (!isRecord(data)) return { products: [], retired: [] };
  const products = Array.isArray(data.products) ? data.products.map(productEntry).filter(entry => entry !== null) : [];
  const retired = Array.isArray(data.retired) ? data.retired.map(retiredEntry).filter(entry => entry !== null) : [];
  return { products, retired };
}

/**
 * El índice listo para buscar por id. Tolera un índice que falta o mal formado (mapas vacíos); ante un id repetido
 * vale la primera entrada.
 * @param {unknown} index
 * @returns {QuoteIndexMaps}
 */
export function indexMaps(index) {
  /** @type {QuoteIndexMaps} */
  const maps = { products: new Map(), retired: new Map() };
  if (!isRecord(index)) return maps;
  for (const entry of Array.isArray(index.products) ? index.products : []) {
    if (isRecord(entry) && typeof entry.id === 'string' && !maps.products.has(entry.id)) {
      maps.products.set(entry.id, /** @type {QuoteIndexProduct} */ (productEntry(entry)));
    }
  }
  for (const entry of Array.isArray(index.retired) ? index.retired : []) {
    if (isRecord(entry) && typeof entry.id === 'string' && !maps.retired.has(entry.id)) {
      maps.retired.set(entry.id, /** @type {QuoteIndexRetired} */ (retiredEntry(entry)));
    }
  }
  return maps;
}

/**
 * Una VISTA de los renglones guardados para la página que tiene `maps` (`indexMaps`). No cambia ni descarta nada.
 * → `{ rows, unknown }` con `rows[i].line === lines[i]`:
 *   - el producto está en `maps.products` y la variante es `''` o una de las suyas → `{ line, status: 'ok', product,
 *     variant, units, unit }`. `variant` es la del renglón; con `''` y exactamente UNA variante, esa (es la única
 *     posible: se muestra y va en el mensaje; el renglón guardado queda como está); si no, `null`. `units` son
 *     `unitOptions` de su unidad de venta, más la unidad del renglón al final si no es ninguna de ellas (`unitKey`).
 *     `unit` es la opción de `units` que es la unidad del renglón: la que la lista muestra elegida (con el renglón en
 *     «Par» y la opción «par», es «par»; el renglón guardado queda como está);
 *   - el producto está en `maps.retired` → `{ line, status: 'retired', product }`;
 *   - cualquier otro caso (la página no conoce el producto, o el producto no tiene esa variante en esta página) →
 *     `{ line, status: 'unknown' }`.
 * `unknown` es el número de renglones desconocidos.
 * @param {readonly QuoteLine[]} lines
 * @param {QuoteIndexMaps | null | undefined} maps
 * @returns {{ rows: QuoteRow[], unknown: number }}
 */
export function reconcileList(lines, maps) {
  const products = maps?.products instanceof Map ? maps.products : new Map();
  const retired = maps?.retired instanceof Map ? maps.retired : new Map();
  /** @type {QuoteRow[]} */
  const rows = (Array.isArray(lines) ? lines : []).map(line => {
    const productId = isRecord(line) ? own(line, 'productId') : undefined;
    const variantId = isRecord(line) ? own(line, 'variantId') : undefined;
    const product = typeof productId === 'string' ? products.get(productId) : undefined;
    if (product) {
      const variants = product.variants;
      const variant = variantId === '' ? (variants.length === 1 ? variants[0] : null) : variants.find((/** @type {QuoteIndexVariant} */ candidate) => candidate.id === variantId);
      if (variant !== undefined) {
        const units = unitOptions(product.saleUnit);
        const written = cleanUnit(line.unit);
        const key = unitKey(written);
        let unit = units.find(option => unitKey(option) === key);
        if (unit === undefined) {
          unit = written;
          if (written) units.push(written);
        }
        return { line, status: 'ok', product, variant, units, unit };
      }
      return { line, status: 'unknown' };
    }
    const gone = typeof productId === 'string' ? retired.get(productId) : undefined;
    if (gone) return { line, status: 'retired', product: gone };
    return { line, status: 'unknown' };
  });
  return { rows, unknown: rows.filter(row => row.status === 'unknown').length };
}

/**
 * La posición de un renglón ANTERIOR, en estado 'ok', que pide lo mismo que `rows[i]`: el mismo producto, la misma
 * variante efectiva (`rows[i].variant?.id ?? ''`) y la misma unidad (`unitKey`: «par» = «Par» = «pares»). -1 si no hay
 * o si `rows[i]` no está en estado 'ok'.
 * @param {readonly QuoteRow[]} rows
 * @param {number} i
 * @returns {number}
 */
export function duplicateOf(rows, i) {
  const row = rows[i];
  if (!Number.isInteger(i) || row?.status !== 'ok') return -1;
  const identity = rowIdentity(row);
  for (let j = 0; j < i; j += 1) {
    const other = rows[j];
    if (other?.status === 'ok' && rowIdentity(other) === identity) return j;
  }
  return -1;
}

/**
 * Lo que pide un renglón 'ok' de la vista: el producto, la variante efectiva (`row.variant?.id ?? ''`) y la unidad
 * (`unitKey`). Dos renglones con la misma identidad son iguales: es la única regla de `duplicateOf` y de
 * `duplicateStates`.
 * @param {QuoteRowOk} row
 * @returns {string}
 */
const rowIdentity = row => JSON.stringify([row.product.id, row.variant?.id ?? '', unitKey(row.line.unit)]);

/**
 * ¿Se puede ofrecer «Unirlos» para `rows[i]`? Tiene un renglón anterior igual (`duplicateOf`) y las dos cantidades
 * juntas no pasan de `MAX_QUANTITY`.
 * @param {readonly QuoteRow[]} rows
 * @param {number} i
 * @returns {boolean}
 */
export function canMerge(rows, i) {
  const j = duplicateOf(rows, i);
  return j !== -1 && rows[j].line.quantity + rows[i].line.quantity <= MAX_QUANTITY;
}

/**
 * El estado de repetido de cada renglón, en una sola pasada (la página lo recalcula con cada tecla, con hasta
 * `MAX_LINES` renglones): `'none'` si no repite a un renglón anterior (y para todo renglón que no está en estado 'ok');
 * `'merge'` si lo repite y se puede unir; `'same'` si lo repite y la suma pasaría de `MAX_QUANTITY`. Para cada `i` es
 * lo mismo que `duplicateOf(rows, i) >= 0 ? (canMerge(rows, i) ? 'merge' : 'same') : 'none'`: el renglón anterior es
 * el PRIMERO con la misma identidad.
 * @param {readonly QuoteRow[]} rows
 * @returns {QuoteDuplicate[]}
 */
export function duplicateStates(rows) {
  /** La posición del primer renglón 'ok' de cada identidad. @type {Map<string, number>} */
  const first = new Map();
  const list = Array.isArray(rows) ? rows : [];
  return list.map((row, i) => {
    if (row?.status !== 'ok') return 'none';
    const identity = rowIdentity(row);
    const j = first.get(identity);
    if (j === undefined) {
      first.set(identity, i);
      return 'none';
    }
    return list[j].line.quantity + row.line.quantity <= MAX_QUANTITY ? 'merge' : 'same';
  });
}

// ---- frases ----------------------------------------------------------------------------------------------------

/** Lo que dice el mensaje de un producto con variantes cuando no se eligió ninguna. */
const VARIANT_PENDING = 'talla o color por definir';

/**
 * Para el mensaje: cadena vacía si el producto no tiene variantes; «talla o color por definir» si tiene y `variant` es
 * `null`; «{etiqueta} ({código})» si hay una (solo la etiqueta si no tiene código o el código es la etiqueta).
 * @param {{ variants: readonly unknown[] } | null | undefined} product
 * @param {{ label: string, code?: string } | null | undefined} variant
 * @returns {string}
 */
export function variantText(product, variant) {
  if (!Array.isArray(product?.variants) || product.variants.length === 0) return '';
  if (!variant) return VARIANT_PENDING;
  const label = oneLine(variant.label);
  const code = oneLine(variant.code);
  if (!label) return code || VARIANT_PENDING;
  return code && code !== label ? `${label} (${code})` : label;
}

/**
 * Para una línea de estado, desde un renglón 'ok': «12 pares, Talla 8», «3 cajas» (un producto sin variantes),
 * «2 pares, talla o color por definir». La cantidad con `quantityLabel`; la variante, solo por su etiqueta. Cadena
 * vacía para un renglón que no está en estado 'ok'.
 * @param {QuoteRow | null | undefined} row
 * @returns {string}
 */
export function lineSummary(row) {
  if (row?.status !== 'ok') return '';
  const quantity = quantityLabel(row.line.quantity, row.line.unit);
  if (row.product.variants.length === 0) return quantity;
  return `${quantity}, ${row.variant ? oneLine(row.variant.label) || VARIANT_PENDING : VARIANT_PENDING}`;
}

/**
 * Los productos del mensaje de la lista, en el orden de la lista: uno por cada renglón en estado 'ok', con marca, código
 * y nombre del índice, la cantidad con la unidad que muestra el renglón (`quantityLabel(row.line.quantity, row.unit)`:
 * «Par» guardado por otra versión se lee «pares», como en la lista) y la variante de `variantText`. Los renglones de
 * un producto retirado o que la página no ubica no van. La página pasa cada uno por `listItem` (contact-core.mjs).
 * @param {readonly QuoteRow[]} rows
 * @returns {QuoteMessageItem[]}
 */
export function listMessageItems(rows) {
  return (Array.isArray(rows) ? rows : []).flatMap(row => (row?.status === 'ok'
    ? [{
      brandName: row.product.brandName,
      code: row.product.code,
      name: row.product.name,
      quantity: quantityLabel(row.line.quantity, row.unit),
      variant: variantText(row.product, row.variant),
    }]
    : []));
}

/**
 * Las líneas de «Cotizar este producto» y «Cotizar por correo» en la página de un producto, según lo que el visitante
 * eligió en «Agregar a mi cotización». Cada línea se completa solo después de que el visitante tocó SU campo
 * (`touched`); la de un campo que no tocó no va (el enlace conserva la suya):
 *   - `variant` (al tocar la variante): `variantText(product, variant)`, o `''` si volvió a «Talla o color por definir»
 *     (`variant` nulo): el visitante no eligió nada;
 *   - `quantity` (al tocar la cantidad o la unidad): `quantityLabel` de la cantidad escrita (`parseQuantity`) con la
 *     unidad elegida, o `''` mientras la cantidad no es válida.
 * La página pone cada valor en su línea (`MESSAGE_LABELS` y `withFieldValues` de contact-core.mjs).
 * @param {{ product: { variants: readonly unknown[] } | null | undefined, touched: { variant?: boolean, quantity?: boolean }, variant: { label: string, code?: string } | null | undefined, quantity: unknown, unit: unknown }} state
 *   `variant`: la variante elegida (la única, si el producto tiene una), o `null`; `quantity`: lo escrito en el campo.
 * @returns {DirectLinkValues}
 */
export function directLinkValues({ product, touched, variant, quantity, unit }) {
  /** @type {DirectLinkValues} */
  const values = {};
  if (touched?.variant) values.variant = variant ? variantText(product, variant) : '';
  if (touched?.quantity) {
    const number = parseQuantity(quantity);
    values.quantity = number === null ? '' : quantityLabel(number, unit);
  }
  return values;
}

/**
 * «Agregado a tu cotización: 12 pares, Talla 8.»; con `total` (se sumó a un renglón que ya estaba; un texto de
 * `quantityLabel`): «Agregado a tu cotización: 12 pares, Talla 8. Con lo que ya tenías son 24 pares.»
 * @param {{ summary?: unknown, total?: unknown }} parts
 * @returns {string}
 */
export function addedMessage({ summary, total } = {}) {
  const what = oneLine(summary);
  const sum = oneLine(total);
  const head = what ? `Agregado a tu cotización: ${what}.` : 'Agregado a tu cotización.';
  return sum ? `${head} Con lo que ya tenías son ${sum}.` : head;
}

/** La lista llegó a `MAX_LINES` renglones. */
export const LIST_FULL_MESSAGE = `Tu cotización ya tiene ${MAX_LINES} productos, el máximo. Quita alguno para agregar más.`;
/** La cantidad escrita no es válida (`parseQuantity`). */
export const QUANTITY_ERROR = `Escribe una cantidad entera de 1 a ${formatQuantity(MAX_QUANTITY)}.`;

/**
 * «Quitaste Guante recubierto.» (el nombre en una línea); sin nombre, «Quitaste un producto.»
 * @param {unknown} name
 * @returns {string}
 */
export function removedMessage(name) {
  const written = oneLine(name);
  return written ? `Quitaste ${written}.` : 'Quitaste un producto.';
}

/**
 * «Unimos dos renglones iguales: ahora son 24 pares.» (`total`: un texto de `quantityLabel`).
 * @param {unknown} total
 * @returns {string}
 */
export function mergedMessage(total) {
  return `Unimos dos renglones iguales: ahora son ${oneLine(total)}.`;
}

/**
 * «La cantidad volvió a 12 pares.» (`label`: un texto de `quantityLabel`).
 * @param {unknown} label
 * @returns {string}
 */
export function restoredMessage(label) {
  return `La cantidad volvió a ${oneLine(label)}.`;
}

/**
 * Aviso de los renglones que la página no puede ubicar. La página puede ser más vieja que el catálogo: la frase no dice
 * que el producto ya no existe. Cadena vacía con 0.
 * @param {number} count
 * @returns {string}
 */
export function unknownLinesMessage(count) {
  const total = Math.max(0, Math.trunc(Number(count)) || 0);
  if (total === 0) return '';
  if (total === 1) return '1 producto de tu cotización no aparece en esta página y no se incluye en tu mensaje. Vuelve a cargar la página; si sigue igual, ya no está en el catálogo.';
  return `${formatQuantity(total)} productos de tu cotización no aparecen en esta página y no se incluyen en tu mensaje. Vuelve a cargar la página; si siguen igual, ya no están en el catálogo.`;
}

/**
 * «1 producto», «3 productos», «0 productos».
 * @param {number} count
 * @returns {string}
 */
export function listCountLabel(count) {
  const total = Math.max(0, Math.trunc(Number(count)) || 0);
  return `${formatQuantity(total)} ${total === 1 ? 'producto' : 'productos'}`;
}

/**
 * El número junto a «Cotizar mi lista»: cadena vacía con 0 y, si no, el número exacto («7», «120», «200»). La lista
 * tiene a lo más `MAX_LINES` renglones, así que son tres cifras como mucho; por si ese máximo cambia, desde 1,000 es
 * «999+». Es el mismo número que dice el nombre del enlace (`listCountLabel`: «Cotizar mi lista, 120 productos»): lo
 * que se ve forma parte de lo que se oye y de lo que hay que decir para activarlo con la voz.
 * @param {number} count
 * @returns {string}
 */
export function badgeText(count) {
  const total = Math.max(0, Math.trunc(Number(count)) || 0);
  if (total === 0) return '';
  return total > 999 ? '999+' : String(total);
}

/**
 * El nombre accesible de un control a partir de un patrón impreso en la página: cada «{nombre}» del patrón cambiado por
 * el nombre en una línea. `nameLabel('Cantidad de {nombre}', 'Guante recubierto')` → «Cantidad de Guante recubierto».
 * @param {unknown} pattern
 * @param {unknown} name
 * @returns {string}
 */
export function nameLabel(pattern, name) {
  return String(pattern ?? '').split('{nombre}').join(oneLine(name));
}
