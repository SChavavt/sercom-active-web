// Código solo de compilación: lo usan el validador (`npm run validate:catalog`) y `site-data-core.mjs`. Importa los
// módulos para el navegador `text.mjs` y `quote-list.mjs` para comparar y limpiar el texto y las unidades como el sitio;
// ninguno de ellos puede importar este.
import { cleanQuery, normalizeText } from './text.mjs';
import { isUnitWord, MAX_UNIT_LENGTH, singularUnit, unitKey } from './quote-list.mjs';

const normalize = value => String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
const isText = value => typeof value === 'string' && value.trim().length > 0;
const isId = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
/**
 * Una dirección `https` escrita completa: empieza con «https://» seguido de un servidor, no tiene espacios, saltos de
 * línea ni diagonales invertidas, se puede leer como dirección y no lleva usuario ni contraseña. Un navegador lee
 * «https:/servidor/x» o «https:servidor/x» como una dirección dentro del propio sitio. No se exige que la dirección esté
 * escrita como la reescribe el navegador: una con acentos o sin la diagonal final es correcta.
 */
export const isHttpsAddress = value => {
  if (typeof value !== 'string' || !/^https:\/\/[^\s\\/?#]/.test(value) || /[\s\\]/.test(value)) return false;
  try { const url = new URL(value); return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password; }
  catch { return false; }
};
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
    if (!isHttps(image.url)) errors.push(`${path}.url: debe ser una dirección https completa, sin usuario ni contraseña.`);
    // La dirección se publica tal cual: las mismas dos revisiones que el nombre de un archivo.
    if (typeof image.url === 'string') {
      if (reservedFileName(image.url.toLowerCase())) errors.push(`${path}.url: la dirección lleva «ejemplo» o «ej-» con una cifra, que están reservados para los ejemplos de la vista previa; usa otra dirección.`);
      if (excluded(image.url.replace(/[-._/:?=&]/g, ' '))) errors.push(`${path}.url: la dirección lleva la marca excluida, que el sitio no publica; usa otra foto.`);
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
  if (!isHttps(image.sourceUrl)) errors.push(`${path}.sourceUrl: ${image.sourceUrl === undefined ? 'falta' : 'debe ser una dirección https'}; escribe la página de donde viene la foto.`);
  if (typeof image.usageConfirmed !== 'boolean') errors.push(`${path}.usageConfirmed: debe ser true o false; true solo con el uso de la foto confirmado.`);
}

/**
 * Revisa las normas de una ficha (`standards`), en cualquier estado: una lista de 1 a `MAX_STANDARDS` objetos con
 * `text` y `sourceUrl` y ninguna otra clave. `text` es texto limpio de una línea, de `MAX_STANDARD_LENGTH` caracteres
 * como máximo, y no se repite en la ficha (comparado con `normalizeText`); `sourceUrl` es una dirección `https`.
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
      const length = [...text].length;
      if (length > MAX_STANDARD_LENGTH) errors.push(`${entry}.text: tiene ${length} caracteres y el máximo es ${MAX_STANDARD_LENGTH}; escribe solo la designación de la norma.`);
      const key = normalizeText(text);
      if (seen.has(key)) errors.push(`${entry}.text: repite la norma de standards[${seen.get(key)}]; escribe cada norma una vez.`);
      else seen.set(key, i);
    }
    if (!isHttps(standard.sourceUrl)) errors.push(`${entry}.sourceUrl: ${standard.sourceUrl === undefined ? 'falta' : 'debe ser una dirección https'}; ${where}`);
  });
}

/** Valida el archivo editorial completo antes de producir una salida pública. */
export function validateCatalog(catalog, registry) {
  const errors = [];
  if (catalog?.schemaVersion !== 1 || !Array.isArray(catalog?.categories) || !Array.isArray(catalog?.products)) {
    return ['El catálogo debe tener schemaVersion 1, categories y products.'];
  }
  inspectFields(catalog, 'catalog', errors);
  const brands = new Map((registry?.sources ?? []).filter(s => s.entity_type === 'brand').map(s => [s.entity_id, s]));
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
    if (!brand) errors.push(`${path}: la marca no está en el alcance permitido; un proveedor no es una marca.`);
    if ([p.id, p.brandId, p.model, p.name, brand?.name].some(excluded)) errors.push(`${path}: marca excluida.`);
    if (reservedForExamples(p)) errors.push(`${path}: identificador, código o nombre reservado para los ejemplos de vista previa.`);
    const modelKey = `${normalize(p.brandId)}:${normalize(p.model)}`;
    if (!isText(p.model) || models.has(modelKey)) errors.push(`${path}: modelo vacío o duplicado en la misma marca.`);
    models.add(modelKey);
    if (!isText(p.name)) errors.push(`${path}: falta nombre.`);
    if (!['draft', 'in_review', 'approved', 'retired'].includes(p.status)) errors.push(`${path}: estado editorial inválido.`);
    if (!Array.isArray(p.categoryIds) || !p.categoryIds.length || p.categoryIds.some(id => !categories.has(id))) errors.push(`${path}: faltan categorías válidas.`);
    if (p.source && (!isHttps(p.source.url) || !validDate(p.source.checkedOn))) errors.push(`${path}: fuente o fecha inválida.`);
    unknownKeys(p.source, sourceKeys, `${path}.source`, errors);
    unknownKeys(p.approval, approvalKeys, `${path}.approval`, errors);
    if (p.documents && (!Array.isArray(p.documents) || p.documents.some(d => !d || !isText(d.label) || !isHttps(d.url)))) errors.push(`${path}: documento inválido.`);

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
        const hidden = HIDDEN_CHARACTER.exec(value);
        if (hidden) {
          const code = `U+${hidden[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
          const before = tailOf(value.slice(0, hidden.index));
          errors.push(`${path}.${field}: tiene un carácter invisible (${code}) ${before ? `después de «${before}»` : 'al principio'}; borra esa parte y escríbela de nuevo.`);
        }
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
    if (Array.isArray(p.documents)) p.documents.forEach((d, i) => {
      unknownKeys(d, documentKeys, `${path}.documents[${i}]`, errors);
      if (isRecord(d)) line(`documents[${i}].label`, d.label, true);
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

/** Lo público de una fotografía: `{ file, alt }` o `{ url, width, height, alt }`; nunca su fuente ni su uso. */
const publicImage = image => (Object.hasOwn(image, 'file')
  ? { file: image.file, alt: image.alt }
  : { url: image.url, width: image.width, height: image.height, alt: image.alt });

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
