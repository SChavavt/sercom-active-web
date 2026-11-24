// Código solo de compilación: lo usan el validador (`npm run validate:catalog`) y `site-data-core.mjs`. Importa los
// módulos para el navegador `text.mjs` y `quote-list.mjs` para comparar y limpiar el texto y las unidades como el sitio;
// ninguno de ellos puede importar este.
import { cleanQuery, normalizeText } from './text.mjs';
import { isUnitWord, MAX_UNIT_LENGTH, singularUnit, unitKey } from './quote-list.mjs';
import { samePage } from './address-match.mjs';

const normalize = value => String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
const isText = value => typeof value === 'string' && value.trim().length > 0;
const isId = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
/** Una fecha real escrita como AAAA-MM-DD («2026-02-30» no lo es). */
export const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
/**
 * El único estado de la marca `portal` de una entidad del registro de investigación: la marca o el proveedor salió del
 * portal por decisión de quien dirige el proyecto, y vuelve solo por otra decisión. La entidad se queda en el registro
 * con la marca `portal: { status, on, reason }`; sin la clave está en el alcance del sitio. La forma de la marca la
 * revisa `registryPortalErrors` (site-data-core.mjs).
 */
export const WITHDRAWN_STATUS = 'retirada';
/** ¿La entidad del registro salió del portal? Solo con `portal.status` igual a «retirada». */
export const isWithdrawn = source => isRecord(source?.portal) && source.portal.status === WITHDRAWN_STATUS;
/** Largo máximo de una dirección, en caracteres. */
export const MAX_ADDRESS_LENGTH = 2000;
// Un servidor escrito como el nombre de un sitio: partes de letras (de cualquier escritura, con sus acentos), cifras y
// guiones, separadas por puntos.
const SITE_LABEL = /^[\p{L}\p{M}\p{N}-]+$/u;
const IP_ADDRESS = /^\d+\.\d+\.\d+\.\d+$/;
const SITE_HOSTNAME = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;
/**
 * Lo que tiene de malo una dirección `https` escrita completa, en una frase corta (`null` si nada): falta, no es un
 * texto, mide más de `MAX_ADDRESS_LENGTH` caracteres, no empieza con «https://», tiene un espacio o un salto de línea o
 * un carácter que no se ve (los mismos que no puede llevar el texto de una ficha, `invisibleAt`), lleva una diagonal
 * invertida, no se puede leer como dirección, lleva usuario o contraseña (también vacíos: «https://@sitio.mx»), lleva un
 * puerto, su servidor lleva un carácter que el navegador lee como otro («𝐦», «ſ», una letra de ancho completo:
 * `mappedCharacter`), su servidor no es el nombre de un sitio: al menos un punto, cada parte de letras, cifras y guiones
 * (un nombre con acentos se escribe con sus letras o en su forma xn--), sin punto al final y sin ser una dirección IP,
 * o su ruta lleva un segmento «.» o «..» (también escrito «%2e»), que el navegador resuelve y abre otra dirección. Un
 * navegador lee «https:/servidor/x» o «https:servidor/x» como una dirección dentro del propio sitio. No se exige que
 * la dirección esté escrita como la reescribe el navegador: una con acentos o sin la diagonal final es correcta. Las
 * frases que dicen algo de la dirección («tiene…», «lleva…», «no empieza…», «mide…») se leen después de «la dirección»
 * (`addressError`).
 * @param {unknown} value
 * @returns {string | null}
 */
export function addressProblem(value) {
  if (value === undefined || value === '') return 'falta';
  if (typeof value !== 'string') return 'no es un texto';
  if (value.length > MAX_ADDRESS_LENGTH) return `mide más de ${MAX_ADDRESS_LENGTH.toLocaleString('es-MX')} caracteres`;
  // Lo que no empieza con «https://» se dice así, salvo que empiece con algo que no se ve: eso es lo que hay que borrar.
  const space = /[^\S\uFEFF]/.exec(value);
  const hidden = invisibleAt(value);
  if (!value.startsWith('https://') && space?.index !== 0 && hidden?.index !== 0) return 'no empieza con «https://»';
  if (space) return `tiene un espacio o un salto de línea ${placeIn(value, space.index, addressTail)}`;
  if (hidden) return `tiene un carácter invisible (${hidden.code}) ${placeIn(value, hidden.index, addressTail)}`;
  if (value.includes('\\')) return 'lleva una diagonal invertida';
  const authority = value.slice('https://'.length).split(/[/?#]/, 1)[0];
  if (!authority) return 'no se puede leer como dirección';
  if (authority.includes('@')) return 'lleva usuario o contraseña antes del servidor';
  const bracket = authority.startsWith('[') ? authority.indexOf(']') : -1;
  const host = bracket === -1 ? authority.split(':', 1)[0] : authority.slice(0, bracket + 1);
  if (bracket === -1 && host !== authority) return `lleva un puerto («${authority.slice(host.length)}»)`;
  const mapped = mappedCharacter(host);
  if (mapped) return `el servidor «${host}» lleva «${mapped.character}» (${mapped.code}), que el navegador lee como «${mapped.read}»`;
  let url;
  try { url = new URL(value); } catch { return 'no se puede leer como dirección'; }
  if (bracket !== -1 || !host.split('.').every(label => SITE_LABEL.test(label)) || !host.includes('.')
    || !SITE_HOSTNAME.test(url.hostname) || IP_ADDRESS.test(url.hostname)) return `el servidor «${host}» no es el nombre de un sitio`;
  // Un segmento «.» o «..» de la ruta, también escrito con %2e: el navegador lo resuelve antes de abrir la dirección.
  const pathStart = 'https://'.length + authority.length;
  const path = value.slice(pathStart).split(/[?#]/, 1)[0];
  let slash = 0;
  for (const segment of path.split('/').slice(1)) {
    if (/^(?:\.|%2e){1,2}$/i.test(segment)) return `lleva el segmento «${segment}» en la ruta, ${placeIn(value, pathStart + slash, addressTail)}, y el navegador lo resuelve y abre otra dirección`;
    slash += segment.length + 1;
  }
  return null;
}
/**
 * El primer carácter de un servidor que el navegador lee como otro, salvo una mayúscula como su minúscula: el que su
 * forma de compatibilidad de Unicode (NFKC), leído solo, cambia («𝐦», «ſ», «ª», «¹», «ﬁ», una letra de ancho completo,
 * el signo de kelvin «K» o el de ángstrom «Å»). Las letras con acentos («ñ», «é», «ü», «ß», también escritas con el
 * acento aparte) no cambian. `null` si no hay ninguno.
 * @param {string} host
 */
function mappedCharacter(host) {
  if (PLAIN_TEXT.test(host)) return null;
  for (const character of host) {
    const read = character.normalize('NFKC');
    if (read !== character) return { character, code: `U+${(character.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`, read: read.toLowerCase() };
  }
  return null;
}
/** Una dirección `https` escrita completa: sin nada de lo que dice `addressProblem`. */
export const isHttpsAddress = value => addressProblem(value) === null;
/**
 * El mensaje de una dirección con un problema, con el campo y su posición y qué hacer; `null` si está bien.
 * @param {string} path el campo, como «products[3].documents[2].url»
 * @param {unknown} value la dirección
 * @param {string} todo qué hacer, una frase que termina en punto
 * @returns {string | null}
 */
export function addressError(path, value, todo) {
  const problem = addressProblem(value);
  if (problem === null) return null;
  return `${path}: ${/^(?:tiene|lleva|no empieza|mide)\b/.test(problem) ? `la dirección ${problem}` : problem}; ${todo}`;
}
const isHttps = isHttpsAddress;
/** Indica si un texto menciona la marca excluida del alcance. */
export const mentionsExcludedBrand = value => /\bgisa\b|guantes?\s+internacionales?/.test(normalize(value));
const excluded = mentionsExcludedBrand;
const forbidden = /^(price|prices|precio|precios|cost|costs|costo|costos|stock|inventory|inventario)$/;
const productKeys = new Set(['id', 'brandId', 'model', 'name', 'categoryIds', 'status', 'description', 'characteristics', 'saleUnit', 'variants', 'standards', 'image', 'source', 'approval', 'documents']);
const categoryKeys = new Set(['id', 'name', 'shortName', 'summary', 'status']);
// Claves de los objetos dentro de una ficha. Con `manufacturerCode` opcional, una clave mal escrita
// (`manufacturerCodes`) diría en silencio «sin código»: por eso cada objeto acepta solo las suyas. La imagen tiene dos
// formas, cada una con sus claves (abajo).
const variantKeys = new Set(['id', 'label', 'manufacturerCode']);
const standardKeys = new Set(['text', 'sourceUrl']);
// Normas de una ficha (`standards`): de 1 a 12, cada una con la designación tal como la imprime el fabricante (`text`)
// y la página o el documento del fabricante donde consta para ese producto (`sourceUrl`, que no se publica). Una norma
// se escribe solo ahí: en los demás campos la revisión de texto la rechaza (scripts/catalog-text.mjs).
/** Normas que puede llevar una ficha como máximo. */
export const MAX_STANDARDS = 12;
/** Largo máximo de la designación de una norma. */
export const MAX_STANDARD_LENGTH = 80;
const documentKeys = new Set(['label', 'url']);
const sourceKeys = new Set(['url', 'checkedOn']);
const approvalKeys = new Set(['by', 'on', 'supplyConfirmed']);
// Fotografía de una ficha: exactamente una de dos formas.
//   - `file`: un archivo de src/assets/productos/, la forma habitual. El sitio sirve su propia copia optimizada y el
//     ancho y el alto se leen del archivo, así que no se escriben. Que el archivo exista y su formato, medidas y peso
//     los revisa `scripts/product-photos.mjs`, porque este módulo no lee el disco.
//   - `url`: una dirección absoluta `https` que el sitio imprime tal cual (nunca la descarga al compilar), con el
//     ancho y el alto en píxeles, para una foto que sigue en un servidor que controla el negocio o cuyo dueño pide
//     enlazarla.
// El nombre del archivo es público: forma parte del nombre de los archivos que genera la compilación.
/** Nombre de archivo de una fotografía: sin carpeta, minúsculas, cifras y guiones, y una extensión de imagen. */
export const PHOTO_FILE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.(?:jpg|jpeg|png|webp)$/;
/** Largo máximo del texto alternativo de una fotografía. */
export const MAX_IMAGE_ALT = 160;
/** Ancho y alto máximos que se aceptan para una fotografía con `url`. */
const MAX_IMAGE_SIDE = 10000;
const fileImageKeys = new Set(['file', 'alt', 'sourceUrl', 'usageConfirmed']);
const urlImageKeys = new Set(['url', 'width', 'height', 'alt', 'sourceUrl', 'usageConfirmed']);
// Lo reservado a los ejemplos tampoco puede ir en el nombre de un archivo publicado (el escáner lo busca en producción).
const reservedFileName = value => /ejemplo|ej-\d/.test(value);
// En una dirección, «ej-» con una cifra es lo reservado solo donde empieza una palabra, como lo lee el escáner (\bEJ-\d):
// «ref-ej-2024» lo lleva; «reej-2» o «x2ej-5», no.
const reservedAddress = value => /ejemplo|(?<![\p{L}\p{N}_])ej-\d/u.test(value);
/** Veces que se decodifica el %XX de una dirección como máximo: las mismas que el escáner (PERCENT_PASSES). */
const ADDRESS_DECODE_PASSES = 8;
/**
 * Una dirección como la lee el escáner: con su %XX decodificado (cada tramo válido; uno mal formado queda como está),
 * otra vez mientras cambie, hasta `ADDRESS_DECODE_PASSES` veces. «%47» es una letra y «%20», un espacio.
 */
function decodedAddress(value) {
  let text = value;
  for (let pass = 0; pass < ADDRESS_DECODE_PASSES; pass += 1) {
    const next = text.replace(/(?:%[0-9a-f]{2})+/gi, run => { try { return decodeURIComponent(run); } catch { return run; } });
    if (next === text) break;
    text = next;
  }
  return text;
}
const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value);
const unknownKeys = (value, allowed, path, errors) => {
  if (isRecord(value)) for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`${path}.${key}: campo no definido.`);
};
// Los ejemplos de la vista previa viven en src/data/preview y nunca entran al catálogo: sus marcas quedan reservadas.
const exampleCode = value => /^ej-\d/i.test(String(value ?? '').trim());
const reservedForExamples = p => /^ejemplo(?:-|$)/.test(String(p.id ?? '')) || /\bde ejemplo\b/.test(normalize(p.name))
  || exampleCode(p.model) || (Array.isArray(p.variants) && p.variants.some(v => exampleCode(v?.manufacturerCode)));

// Lo que no se ve y `cleanQuery` conserva porque el texto de un visitante puede necesitarlo: U+200C y U+200D, los
// selectores de variante, los caracteres de etiqueta y los demás que Unicode marca para ignorar al dibujar (\p{DI}).
// En una ficha no hacen falta y sí estorban: una palabra pegada de un PDF con uno dentro («nitri<U+200C>lo») se ve
// bien, pero no se encuentra al buscarla ni se compara igual que la misma palabra limpia.
const HIDDEN_CHARACTER = /\p{DI}/u;
/** El final de un texto para citarlo en un mensaje: hasta 24 caracteres, desde el principio de una palabra. */
const TAIL_LENGTH = 24;
function tailOf(text) {
  const characters = [...text.trimEnd()];
  if (characters.length <= TAIL_LENGTH) return characters.join('');
  const cut = characters.slice(-TAIL_LENGTH).join('');
  const space = cut.indexOf(' ');
  const wholeWord = characters[characters.length - TAIL_LENGTH - 1] === ' ' || space === -1;
  return `…${wholeWord ? cut : cut.slice(space + 1)}`;
}
/**
 * El final de una dirección para citarlo en un mensaje: hasta 24 caracteres, desde el principio de una parte de la ruta
 * («…/productos/ficha»), o los últimos 24 si no hay una diagonal donde empezar.
 */
function addressTail(text) {
  const characters = [...text];
  if (characters.length <= TAIL_LENGTH) return text;
  const cut = characters.slice(-TAIL_LENGTH).join('');
  const slash = cut.search(/\/(?!\/)/);
  return `…${slash === -1 ? cut : cut.slice(slash)}`;
}
/**
 * Dónde está una posición de un texto, para un mensaje: «después de «…»» o «al principio».
 * @param {string} text
 * @param {number} index
 * @param {(text: string) => string} [tail]
 */
export function placeIn(text, index, tail = tailOf) {
  const before = tail(text.slice(0, index));
  return before ? `después de «${before}»` : 'al principio';
}
/**
 * Un carácter que no se ve, o que el texto de un visitante no conservaría: lo que `cleanQuery` quita o cambia por un
 * espacio (el guion suave, los de dirección, los de ancho cero, los controles, U+FFFD) y los demás que Unicode marca
 * para ignorar al dibujar (`HIDDEN_CHARACTER`). Es la única lista: la usan el texto de una ficha y sus direcciones.
 */
const isInvisible = character => HIDDEN_CHARACTER.test(character) || cleanQuery(`a${character}a`) !== `a${character}a`;
// Lo que no hay que revisar carácter por carácter: letras inglesas, cifras, signos y el espacio.
const PLAIN_TEXT = /^[\x20-\x7e]*$/;
/**
 * El primer carácter de un texto que no se ve (`isInvisible`), con su código («U+200B») y su posición; `null` si no hay.
 * @param {string} text
 * @returns {{ code: string, index: number } | null}
 */
export function invisibleAt(text) {
  if (PLAIN_TEXT.test(text)) return null;
  let index = 0;
  for (const character of text) {
    const point = character.codePointAt(0) ?? 0;
    if ((point < 0x20 || point > 0x7e) && isInvisible(character)) return { code: `U+${point.toString(16).toUpperCase().padStart(4, '0')}`, index };
    index += character.length;
  }
  return null;
}
// Los signos pegados al principio o al final de una palabra («pares,», «(caja)»): todo lo que no es letra ni cifra.
const EDGE_SIGNS = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

/** Aprobación comercial completa: quién aprobó, cuándo y con el suministro confirmado. */
const hasApproval = p => Boolean(p?.approval) && isText(p.approval.by) && validDate(p.approval.on) && p.approval.supplyConfirmed === true;

function inspectFields(value, path, errors) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.test(normalize(key))) errors.push(`${path}.${key}: campo comercial no permitido en este catálogo.`);
    inspectFields(child, `${path}.${key}`, errors);
  }
}

/**
 * Revisa la forma de la fotografía de una ficha, en cualquier estado: `file` o `url` (nunca los dos), con sus claves y
 * ninguna otra, el texto alternativo, la fuente y la marca de uso. Que la foto de una ficha aprobada tenga el uso
 * confirmado se revisa aparte, con los demás requisitos de `approved`; la foto es opcional.
 * @param {(field: string, value: unknown, covered: boolean, empty: string) => void} line revisa que un texto de la ficha esté limpio
 */
function inspectImage(image, productPath, errors, line) {
  const path = `${productPath}.image`;
  if (!isRecord(image)) {
    errors.push(`${path}: debe ser un objeto con file o url, alt, sourceUrl y usageConfirmed.`);
    return;
  }
  const hasFile = Object.hasOwn(image, 'file');
  const hasUrl = Object.hasOwn(image, 'url');
  if (hasFile && hasUrl) errors.push(`${path}: lleva file y url; usa solo uno: file para una foto guardada en src/assets/productos/ o url para una dirección.`);
  else if (!hasFile && !hasUrl) errors.push(`${path}: falta file o url; escribe el nombre del archivo de src/assets/productos/ (file) o la dirección de la foto (url).`);
  else if (hasFile) {
    for (const key of Object.keys(image)) {
      if (key === 'width' || key === 'height') errors.push(`${path}.${key}: no va con file; el ancho y el alto se leen del archivo. Quita la clave.`);
      else if (!fileImageKeys.has(key)) errors.push(`${path}.${key}: campo no definido.`);
    }
    const { file } = image;
    if (typeof file !== 'string' || !PHOTO_FILE.test(file)) {
      errors.push(`${path}.file: ${typeof file === 'string' ? `«${file}» no es un nombre válido` : 'debe ser un nombre de archivo'}; usa solo minúsculas, cifras y guiones, sin carpeta, con la extensión .jpg, .jpeg, .png o .webp, como «guante-nitrilo-37-175.jpg».`);
    } else {
      if (reservedFileName(file)) errors.push(`${path}.file: el nombre lleva «ejemplo» o «ej-» con una cifra, que están reservados para los ejemplos de la vista previa; usa otro nombre.`);
      if (excluded(file.replace(/[-.]/g, ' '))) errors.push(`${path}.file: marca excluida.`);
    }
  } else {
    for (const key of Object.keys(image)) if (!urlImageKeys.has(key)) errors.push(`${path}.${key}: campo no definido.`);
    const urlError = addressError(`${path}.url`, image.url, 'escribe la dirección https completa de la foto, sin usuario ni contraseña.');
    if (urlError) errors.push(urlError);
    // La dirección se publica tal cual: las mismas dos revisiones que el nombre de un archivo, sobre la dirección
    // decodificada, como la lee el escáner, y con «+» como separador.
    if (typeof image.url === 'string') {
      const decoded = decodedAddress(image.url);
      if (reservedAddress(decoded.toLowerCase())) errors.push(`${path}.url: la dirección lleva «ejemplo» o «ej-» con una cifra, que están reservados para los ejemplos de la vista previa; usa otra dirección.`);
      if (excluded(decoded.replace(/[-._/:?=&+]/g, ' '))) errors.push(`${path}.url: la dirección lleva la marca excluida, que el sitio no publica; usa otra foto.`);
    }
    for (const [key, side] of [['width', 'ancho'], ['height', 'alto']]) {
      const value = image[key];
      if (value === undefined) errors.push(`${path}.${key}: falta; con url se escribe el ${side} de la foto en píxeles.`);
      else if (!Number.isInteger(value) || value < 1 || value > MAX_IMAGE_SIDE) errors.push(`${path}.${key}: debe ser un número entero de 1 a ${MAX_IMAGE_SIDE}, el ${side} de la foto en píxeles.`);
    }
  }
  if (image.alt === undefined) errors.push(`${path}.alt: falta; describe la foto en una línea.`);
  else {
    line('image.alt', image.alt, false, 'está vacío; describe la foto en una línea.');
    if (typeof image.alt === 'string' && [...image.alt].length > MAX_IMAGE_ALT) errors.push(`${path}.alt: tiene ${[...image.alt].length} caracteres y el máximo es ${MAX_IMAGE_ALT}; describe la foto en una línea más corta.`);
  }
  const sourceError = addressError(`${path}.sourceUrl`, image.sourceUrl, 'escribe la página de donde viene la foto.');
  if (sourceError) errors.push(sourceError);
  if (typeof image.usageConfirmed !== 'boolean') errors.push(`${path}.usageConfirmed: debe ser true o false; true solo con el uso de la foto confirmado.`);
}

/**
 * Revisa las normas de una ficha (`standards`), en cualquier estado: una lista de 1 a `MAX_STANDARDS` objetos con
 * `text` y `sourceUrl` y ninguna otra clave. `text` es texto limpio de una línea, de `MAX_STANDARD_LENGTH` caracteres
 * como máximo (contados en NFC), con varias palabras o un número, y no se repite en la ficha (comparado con
 * `normalizeText`); `sourceUrl` es una dirección `https`.
 * @param {(field: string, value: unknown, covered: boolean, empty: string) => void} line revisa que un texto de la ficha esté limpio
 */
function inspectStandards(standards, productPath, errors, line) {
  const path = `${productPath}.standards`;
  if (!Array.isArray(standards)) {
    errors.push(`${path}: debe ser una lista de normas, cada una con text y sourceUrl.`);
    return;
  }
  if (standards.length === 0) errors.push(`${path}: está vacía; si el producto no tiene normas, quita la clave.`);
  if (standards.length > MAX_STANDARDS) errors.push(`${path}: tiene ${standards.length} normas y el máximo es ${MAX_STANDARDS}; deja las principales.`);
  // Norma ya vista (con `normalizeText`) → su posición.
  const seen = new Map();
  const where = 'escribe la página o el documento del fabricante donde consta esta norma para este producto.';
  standards.forEach((standard, i) => {
    const entry = `${path}[${i}]`;
    if (!isRecord(standard)) {
      errors.push(`${entry}: debe ser un objeto con text y sourceUrl.`);
      return;
    }
    unknownKeys(standard, standardKeys, entry, errors);
    const { text } = standard;
    if (text === undefined) errors.push(`${entry}.text: falta; escribe la norma como la imprime el fabricante.`);
    else line(`standards[${i}].text`, text, false, 'está vacío; escribe la norma como la imprime el fabricante.');
    if (isText(text)) {
      // Se cuenta como lo lee una persona: una letra acentuada es un carácter, escrita compuesta o descompuesta (NFC), y
      // también un carácter fuera del plano básico.
      const length = [...text.normalize('NFC')].length;
      if (length > MAX_STANDARD_LENGTH) errors.push(`${entry}.text: tiene ${length} caracteres y el máximo es ${MAX_STANDARD_LENGTH}; escribe solo la designación de la norma.`);
      // Una designación lleva número o varias palabras: una sigla sola («ANSI») no dice qué norma es, y en la página de la
      // ficha descontaría cualquier mención de esa sigla, también la de otra norma.
      if (!/\s/.test(text.trim()) && !/\p{N}/u.test(text)) errors.push(`${entry}.text: «${text.trim()}» es una sola palabra y no lleva número; escribe la designación completa de la norma como la imprime el fabricante, por ejemplo «EN 388:2016 4131A».`);
      const key = normalizeText(text);
      if (seen.has(key)) errors.push(`${entry}.text: repite la norma de standards[${seen.get(key)}]; escribe cada norma una vez.`);
      else seen.set(key, i);
    }
    const sourceError = addressError(`${entry}.sourceUrl`, standard.sourceUrl, where);
    if (sourceError) errors.push(sourceError);
  });
}

/** Valida el archivo editorial completo antes de producir una salida pública. */
export function validateCatalog(catalog, registry) {
  const errors = [];
  if (catalog?.schemaVersion !== 1 || !Array.isArray(catalog?.categories) || !Array.isArray(catalog?.products)) {
    return ['El catálogo debe tener schemaVersion 1, categories y products.'];
  }
  inspectFields(catalog, 'catalog', errors);
  // El alcance de marcas sale del registro: las marcas (no los proveedores) que no salieron del portal. Una ficha de una
  // marca retirada recibe su propio mensaje, en cualquier estado.
  const sources = registry?.sources ?? [];
  const brands = new Map(sources.filter(s => s.entity_type === 'brand' && !isWithdrawn(s)).map(s => [s.entity_id, s]));
  const withdrawn = new Set(sources.filter(isWithdrawn).map(s => s.entity_id));
  const categories = new Map();
  for (const c of catalog.categories) {
    if (!c || !isId(c.id) || !isText(c.name) || !['draft', 'approved'].includes(c.status)) errors.push('Categoría inválida.');
    if (c && typeof c === 'object') {
      for (const key of Object.keys(c)) if (!categoryKeys.has(key)) errors.push(`Categoría ${c.id}: campo no definido (${key}).`);
      for (const key of ['shortName', 'summary']) if (key in c && !isText(c[key])) errors.push(`Categoría ${c.id}: ${key} debe ser un texto no vacío.`);
    }
    if (categories.has(c?.id)) errors.push(`Categoría duplicada: ${c?.id}.`);
    categories.set(c?.id, c);
  }
  const ids = new Set();
  const models = new Set();
  // Nombre ya visto (con `normalizeText`) → la ficha que lo usa primero.
  const names = new Map();
  for (const [index, p] of catalog.products.entries()) {
    const path = `products[${index}]`;
    if (!p || typeof p !== 'object') { errors.push(`${path}: producto inválido.`); continue; }
    for (const key of Object.keys(p)) if (!productKeys.has(key)) errors.push(`${path}.${key}: campo no definido.`);
    if (!isId(p.id) || ids.has(p.id)) errors.push(`${path}: id inválido o duplicado.`);
    ids.add(p.id);
    const brand = brands.get(p.brandId);
    if (withdrawn.has(p.brandId)) errors.push(`${path}: la marca ${p.brandId} está retirada del portal; un producto suyo no se carga.`);
    else if (!brand) errors.push(`${path}: la marca no está en el alcance permitido; un proveedor no es una marca.`);
    if ([p.id, p.brandId, p.model, p.name, brand?.name].some(excluded)) errors.push(`${path}: marca excluida.`);
    if (reservedForExamples(p)) errors.push(`${path}: identificador, código o nombre reservado para los ejemplos de vista previa.`);
    const modelKey = `${normalize(p.brandId)}:${normalize(p.model)}`;
    if (!isText(p.model) || models.has(modelKey)) errors.push(`${path}: modelo vacío o duplicado en la misma marca.`);
    models.add(modelKey);
    if (!isText(p.name)) errors.push(`${path}: falta nombre.`);
    if (!['draft', 'in_review', 'approved', 'retired'].includes(p.status)) errors.push(`${path}: estado editorial inválido.`);
    if (!Array.isArray(p.categoryIds) || !p.categoryIds.length || p.categoryIds.some(id => !categories.has(id))) errors.push(`${path}: faltan categorías válidas.`);
    // La fuente: la página del fabricante donde se revisaron los datos y el día de esa revisión, cada una con su mensaje.
    if (p.source && !isRecord(p.source)) errors.push(`${path}.source: debe ser un objeto con url y checkedOn.`);
    else if (p.source) {
      const sourceError = addressError(`${path}.source.url`, p.source.url, 'escribe la página del fabricante donde revisaste los datos de la ficha.');
      if (sourceError) errors.push(sourceError);
      const { checkedOn } = p.source;
      if (!validDate(checkedOn)) errors.push(`${path}.source.checkedOn: ${checkedOn === undefined ? 'falta' : typeof checkedOn === 'string' ? `«${checkedOn}» no es una fecha` : 'no es un texto'}; escribe el día en que revisaste la fuente como AAAA-MM-DD, por ejemplo 2026-11-18.`);
    }
    unknownKeys(p.source, sourceKeys, `${path}.source`, errors);
    unknownKeys(p.approval, approvalKeys, `${path}.approval`, errors);
    if (p.documents && !Array.isArray(p.documents)) errors.push(`${path}.documents: debe ser una lista de documentos, cada uno con label y url.`);

    // La forma del texto se revisa en cualquier estado: un borrador ya debe estar bien escrito. `covered`: otra regla ya
    // dice que el campo falta o está vacío, y aquí solo se revisa que esté limpio: igual a como lo deja `cleanQuery` y,
    // además, sin ninguno de los caracteres que no se ven y que `cleanQuery` conserva (`HIDDEN_CHARACTER`). De esos se
    // dice el primero y después de qué texto está, porque quien corrige no puede verlo.
    const line = (field, value, covered, empty = 'está vacío; escríbelo o quítalo.') => {
      if (value === undefined) return;
      if (typeof value !== 'string' || !value.trim()) {
        if (!covered) errors.push(`${path}.${field}: ${typeof value === 'string' ? empty : 'debe ser un texto.'}`);
      } else if (cleanQuery(value) !== value) {
        errors.push(`${path}.${field}: tiene espacios de más, un salto de línea o un carácter invisible; escríbelo en una sola línea.`);
      } else {
        const hidden = invisibleAt(value);
        if (hidden) errors.push(`${path}.${field}: tiene un carácter invisible (${hidden.code}) ${placeIn(value, hidden.index)}; borra esa parte y escríbela de nuevo.`);
      }
    };
    const approved = p.status === 'approved';
    line('name', p.name, true);
    line('model', p.model, true);
    line('description', p.description, approved);
    line('saleUnit', p.saleUnit, approved);
    if (p.characteristics !== undefined && !Array.isArray(p.characteristics)) {
      if (!approved) errors.push(`${path}.characteristics: debe ser una lista de textos.`);
    } else (p.characteristics ?? []).forEach((value, i) => line(`characteristics[${i}]`, value, approved));
    // Cada documento, con su posición: su etiqueta y su dirección.
    if (Array.isArray(p.documents)) p.documents.forEach((d, i) => {
      const entry = `${path}.documents[${i}]`;
      if (!isRecord(d)) {
        errors.push(`${entry}: debe ser un objeto con label y url.`);
        return;
      }
      unknownKeys(d, documentKeys, entry, errors);
      if (!isText(d.label)) errors.push(`${entry}.label: ${d.label === undefined ? 'falta' : typeof d.label === 'string' ? 'está vacío' : 'debe ser un texto'}; escribe qué es el documento, como «Ficha técnica».`);
      line(`documents[${i}].label`, d.label, true);
      const urlError = addressError(`${entry}.url`, d.url, 'escribe la dirección completa de la página o del documento del fabricante.');
      if (urlError) errors.push(urlError);
    });
    if (p.image !== undefined) inspectImage(p.image, path, errors, line);
    if (p.standards !== undefined) inspectStandards(p.standards, path, errors, line);

    // Nombres únicos en todo el catálogo, también entre borradores: «Cotizar mi lista» nombra los controles de cada
    // renglón con el nombre del producto y la etiqueta de su variante (`rowControlNames` en quote-list.mjs), y dos
    // productos con el mismo nombre darían a dos renglones los mismos nombres accesibles. Se compara como compara el
    // sitio (`normalizeText`): «Guante Solvex» y «guante SOLVEX» son el mismo nombre.
    const nameKey = isText(p.name) ? normalizeText(p.name) : '';
    if (nameKey && names.has(nameKey)) errors.push(`${path}.name: repite el nombre de ${names.get(nameKey)}; cada producto necesita un nombre propio.`);
    else if (nameKey) names.set(nameKey, path);

    // Unidad de venta, en cualquier estado: corta, porque la lista de cotización la recorta a `MAX_UNIT_LENGTH`, y con
    // su primera palabra, cuando es una unidad conocida, sola y en singular: la lista la escribe en plural según la
    // cantidad («12 pares») y solo reconoce la palabra sola («3 × par, talla única» con un signo pegado). El mensaje
    // dice solo la palabra que cambia: lo que sigue a la unidad puede concordar con ella («piezas sueltas») y una
    // frase completa armada aquí saldría mal escrita. Con otra primera palabra («tambo, 200 L», «pza.») no hay regla:
    // la lista deja esa unidad como está.
    if (isText(p.saleUnit)) {
      const length = [...p.saleUnit].length;
      const [first] = p.saleUnit.split(' ');
      const bare = first.replace(EDGE_SIGNS, '');
      // Una unidad demasiado larga recibe solo ese mensaje: `unitKey` la recorta al máximo antes de compararla, y una
      // primera palabra más larga que el máximo parecería estar en plural.
      if (length > MAX_UNIT_LENGTH) errors.push(`${path}.saleUnit: tiene ${length} caracteres y el máximo es ${MAX_UNIT_LENGTH}; escribe una unidad corta, como «par» o «caja con 100 piezas».`);
      else if (bare !== first && isUnitWord(bare)) errors.push(`${path}.saleUnit: la primera palabra lleva un signo pegado («${first}»); escríbela sola y en singular, «${singularUnit(bare)}», para que la lista de cotización la escriba según la cantidad.`);
      else if (unitKey(first) !== normalizeText(first)) errors.push(`${path}.saleUnit: la primera palabra va en singular; cambia «${first}» por «${singularUnit(first)}».`);
    }

    if (p.variants) {
      const variantIds = new Set();
      // Etiqueta ya vista (con `normalizeText`) → su posición: por la misma razón que los nombres, dos variantes de un
      // producto no pueden llamarse igual.
      const labels = new Map();
      if (!Array.isArray(p.variants)) errors.push(`${path}: variants debe ser una lista.`);
      else for (const [i, v] of p.variants.entries()) {
        if (!v || !isId(v.id) || variantIds.has(v.id) || !isText(v.label)) errors.push(`${path}: variante incompleta o duplicada.`);
        variantIds.add(v?.id);
        if (!isRecord(v)) continue;
        unknownKeys(v, variantKeys, `${path}.variants[${i}]`, errors);
        line(`variants[${i}].label`, v.label, true);
        // El código de la variante es opcional (muchos fabricantes publican las tallas sin un código para cada una);
        // si la clave está, lleva un código: vacía no significa «sin código».
        if (Object.hasOwn(v, 'manufacturerCode')) line(`variants[${i}].manufacturerCode`, v.manufacturerCode, false,
          'está vacío; escribe el código o, si la variante no tiene código propio, quita la clave.');
        const labelKey = isText(v.label) ? normalizeText(v.label) : '';
        if (labelKey && labels.has(labelKey)) errors.push(`${path}.variants[${i}].label: repite la etiqueta de variants[${labels.get(labelKey)}]; cada variante necesita una etiqueta propia.`);
        else if (labelKey) labels.set(labelKey, i);
      }
    }
    if (p.status !== 'approved') continue;
    if (!isText(p.description) || !isText(p.saleUnit)) errors.push(`${path}: falta descripción o unidad de venta.`);
    if (!Array.isArray(p.characteristics) || p.characteristics.length < 3 || p.characteristics.length > 5 || p.characteristics.some(v => !isText(v))) errors.push(`${path}: requiere de 3 a 5 características verificadas.`);
    if (!p.source) errors.push(`${path}: falta fuente revisada.`);
    if (!hasApproval(p)) errors.push(`${path}: falta aprobación comercial.`);
    // La foto es opcional: sin `image`, la ficha se publica con el pictograma de su categoría. Su forma ya se revisó
    // arriba; aquí, que una foto que va no salga sin su uso confirmado. Nunca se quita en silencio: lo decide quien
    // mantiene el catálogo.
    if (isRecord(p.image) && p.image.usageConfirmed === false) errors.push(`${path}.image.usageConfirmed: el uso de la foto no está confirmado. Confírmalo y escribe true, o quita image de la ficha: un producto aprobado se publica sin foto, con el pictograma de su categoría.`);
    if (Array.isArray(p.categoryIds) && p.categoryIds.some(id => categories.get(id)?.status !== 'approved')) errors.push(`${path}: categoría pendiente de aprobación.`);
  }
  return errors;
}

/** Exportación explícita: no expone aprobador ni controles internos. */
export function getPublishedProducts(catalog, registry) {
  const errors = validateCatalog(catalog, registry);
  if (errors.length) throw new Error(errors.join('\n'));
  return catalog.products.filter(p => p.status === 'approved').map(p => ({
    id: p.id, brandId: p.brandId, model: p.model, name: p.name,
    categoryIds: [...p.categoryIds], description: p.description,
    characteristics: [...p.characteristics], saleUnit: p.saleUnit,
    variants: (p.variants ?? []).map(v => ({ id: v.id, label: v.label, ...(v.manufacturerCode !== undefined && { manufacturerCode: v.manufacturerCode }) })),
    // De cada norma, solo su texto: la fuente no se publica.
    standards: (p.standards ?? []).map(s => s.text),
    // Sin foto, `null`: la tarjeta y la ficha muestran el pictograma de la categoría.
    image: p.image === undefined ? null : publicImage(p.image),
    documents: (p.documents ?? []).map(d => ({ label: d.label, url: d.url })),
  }));
}

/**
 * Lo público de una fotografía: `{ file, alt, sourceUrl }` o `{ url, width, height, alt, sourceUrl }`. `sourceUrl`, la
 * página del fabricante de donde viene, es la dirección del crédito que la ficha muestra bajo la foto; su uso
 * (`usageConfirmed`) nunca se publica.
 */
const publicImage = image => (Object.hasOwn(image, 'file')
  ? { file: image.file, alt: image.alt, sourceUrl: image.sourceUrl }
  : { url: image.url, width: image.width, height: image.height, alt: image.alt, sourceUrl: image.sourceUrl });

/**
 * Producto retirado que fue público: estado `retired` con una aprobación comercial completa. Conserva una página
 * informativa en su dirección (R-STATE-04). Un retirado sin aprobación nunca fue público y sigue privado, como un
 * borrador. Lo que se muestra de él (id, marca, modelo, nombre y categorías) pasa en `validateCatalog` las mismas
 * reglas que una ficha aprobada; sus categorías no necesitan estar aprobadas: la página muestra solo las públicas.
 */
export const isPublicRetired = product => product?.status === 'retired' && hasApproval(product);

/** Exportación explícita de los retirados públicos: solo lo que identifica al producto, nada interno. */
export function getRetiredProducts(catalog, registry) {
  const errors = validateCatalog(catalog, registry);
  if (errors.length) throw new Error(errors.join('\n'));
  return catalog.products.filter(isPublicRetired).map(p => ({
    id: p.id, brandId: p.brandId, model: p.model, name: p.name, categoryIds: [...p.categoryIds],
  }));
}

/** Tipos de recurso del registro que nunca se publican como enlace ni respaldan la fuente de una foto. */
export const BLOCKED_RESOURCE_TYPES = Object.freeze(['deprecated', 'unverified_current', 'gated_landing']);
/**
 * Un recurso del registro que se puede publicar: su verificación empieza con «accesible» y su tipo no está bloqueado
 * (`BLOCKED_RESOURCE_TYPES`). La única prueba: la usan los enlaces de las marcas, la página de la foto y el escáner.
 * @param {unknown} resource
 */
export const isPublishableResource = resource => String(/** @type {any} */ (resource)?.verification ?? '').startsWith('accesible')
  && !BLOCKED_RESOURCE_TYPES.includes(/** @type {any} */ (resource)?.type);
/**
 * Tipos de recurso que viven en el sitio de otro: un visor de archivos (Google Drive) o una plataforma de catálogos
 * (Salsify) guardan el catálogo de la marca, pero su servidor no es el de la marca, así que no respaldan la fuente de
 * una foto: con ellos, cualquier archivo de ese servicio pasaría por una foto del fabricante.
 */
export const HOSTED_ELSEWHERE_TYPES = Object.freeze(['pdf_viewer', 'catalog_platform']);
/** Un texto cortado a 80 caracteres, con «…» si se cortó. */
const cutAt80 = text => ([...text].length > 80 ? `${[...text].slice(0, 80).join('')}…` : text);

/** El servidor de una dirección, en minúsculas y sin `www.` al principio; `null` si no es una dirección. */
const hostOf = value => {
  try { return new URL(String(value)).hostname.toLowerCase().replace(/^www\./, ''); } catch { return null; }
};

/**
 * La foto de una ficha aprobada viene del sitio de su fabricante: la ficha muestra bajo la foto un crédito que enlaza
 * `image.sourceUrl`. Esa página no puede ser, escrita como sea (`samePage`), una del registro de investigación que no se
 * publica (`isPublishableResource`). Su servidor (sin `www.`) debe ser el de algún recurso publicable de la entidad de
 * la marca en el registro que no viva en el sitio de otro (`HOSTED_ELSEWHERE_TYPES`). Un borrador, una ficha en revisión o un
 * retirado no publican foto y no se revisan. Se llama aparte de `validateCatalog` (desde `validateProject`, en
 * `scripts/validate-catalog.mjs`) porque la compilación valida el catálogo con las marcas, sin los recursos del registro.
 * @param {unknown} catalog
 * @param {unknown} registry
 * @returns {string[]} Errores; lista vacía si todo es correcto.
 */
export function photoSourceErrors(catalog, registry) {
  const products = Array.isArray(/** @type {any} */ (catalog)?.products) ? /** @type {any} */ (catalog).products : [];
  const sources = Array.isArray(/** @type {any} */ (registry)?.sources) ? /** @type {any} */ (registry).sources : [];
  const allResources = sources.flatMap(entry => (Array.isArray(entry?.resources) ? entry.resources : []));
  const errors = [];
  for (const [index, product] of products.entries()) {
    if (product?.status !== 'approved' || !isRecord(product.image)) continue;
    const found = hostOf(product.image.sourceUrl);
    if (!found || !isHttps(product.image.sourceUrl)) continue;
    // Si alguna entrada del registro con esa misma página dice que no se publica, no se publica.
    const hidden = allResources.find(resource => typeof resource?.url === 'string' && !isPublishableResource(resource) && samePage(resource.url, product.image.sourceUrl));
    if (hidden) {
      errors.push(`products[${index}] (${product.id}).image.sourceUrl: esa página está en el registro de investigación como «${hidden.type}: ${cutAt80(String(hidden.verification ?? ''))}» y no se publica, así que no puede ser la página de una foto: la ficha la enlazaría en el crédito. Escribe la página del producto en el sitio del fabricante de donde viene la foto.`);
      continue;
    }
    const source = sources.find(entry => entry?.entity_id === product.brandId);
    if (!source) continue;
    const hosts = [...new Set((Array.isArray(source.resources) ? source.resources : [])
      .filter(resource => isPublishableResource(resource) && !HOSTED_ELSEWHERE_TYPES.includes(resource?.type))
      .map(resource => hostOf(resource.url)).filter(Boolean))];
    if (hosts.includes(found)) continue;
    const known = hosts.length
      ? (hosts.length === 1 ? `el sitio de ${source.name} en el registro es ${hosts[0]}` : `los sitios de ${source.name} en el registro son ${hosts.slice(0, -1).join(', ')} y ${hosts.at(-1)}`)
      : `${source.name} no tiene en el registro ningún sitio verificado como accesible`;
    errors.push(`products[${index}] (${product.id}).image.sourceUrl: la foto viene de ${found}, pero ${known}. La ficha muestra bajo la foto un crédito que enlaza esa página: escribe la página del sitio del fabricante de donde viene la foto, o agrega ese sitio a la marca en el registro de investigación, con su verificación.`);
  }
  return errors;
}
