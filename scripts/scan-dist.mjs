#!/usr/bin/env node
// Escáner de reglas duras sobre un sitio ya compilado (HTML, JS, CSS y JSON de dist/).
//
// Uso:  node scripts/scan-dist.mjs [carpeta] [--preview] [--launch] [--in-person] [--strict] [--rules]
//   carpeta       carpeta compilada; por omisión `dist`, o `dist-preview` con --preview
//   --preview     la compilación es la vista previa de diseño: los ejemplos se permiten, pero cada página
//                 debe llevar el aviso de vista previa y cada ejemplo su etiqueta «Ejemplo»
//   --launch      la compilación es la versión pública aprobada: `noindex` y el bloqueo de robots.txt deben haberse retirado
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
import { EXAMPLE_TAG, PREVIEW_NOTICE } from '../src/lib/site-data-core.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKIP_LINK_TEXT = 'Saltar al contenido';
const TEXT_EXTENSIONS = new Set(['.html', '.htm', '.js', '.mjs', '.css', '.json', '.txt', '.xml', '.svg', '.webmanifest', '.map']);

// ---------------------------------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------------------------------

const stripAccents = text => text.normalize('NFD').replace(/\p{M}/gu, '');
const decodeEntities = text => text
  .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
  .replace(/&amp;/g, '&');
const decodePercent = text => text.replace(/(?:%[0-9a-f]{2})+/gi, run => {
  try { return decodeURIComponent(run); } catch { return run; }
});
/** Contenido comparable: entidades y %XX decodificados, sin acentos. Las reglas lo leen sin distinguir mayúsculas. */
const normalizeContent = text => stripAccents(decodePercent(decodeEntities(text)));
const oneLine = text => text.replace(/\s+/g, ' ').trim();
const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const withoutScripts = html => html.replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
/** Texto que lee un visitante o un buscador: contenido de los elementos y atributos descriptivos. */
function visibleText(html) {
  const body = withoutScripts(html);
  const attributes = [...body.matchAll(/\s(?:alt|title|aria-label|placeholder|content|value)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map(match => match[1] ?? match[2]);
  return oneLine(decodeEntities(`${body.replace(/<[^>]+>/g, ' ')} \n ${attributes.join(' \n ')}`));
}
const inlineScripts = html => [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]).join('\n');
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
const withoutAllowed = text => ALLOWED_SENTENCES.reduce((rest, sentence) => rest.split(sentence).join(' '), text);

// ---------------------------------------------------------------------------------------------------
// Reglas por patrón
// ---------------------------------------------------------------------------------------------------
// Ámbitos (`scope`):
//   text   texto visible de cada página HTML, sin las frases permitidas
//   words  lo que una persona podría llegar a leer: texto visible de HTML más el contenido de JS/JSON y de los
//          <script> en línea (un script puede escribir texto en la página)
//   raw    contenido tal cual de cada archivo de texto
//   norm   contenido de cada archivo de texto con entidades y %XX decodificados y sin acentos
// `level` puede ser una función del modo: los ejemplos nunca deben llevar normas ni certificaciones.

const rule = (id, level, scope, pattern, title, doc) => ({ id, level, scope, pattern, title, doc });
const strictInPreview = options => (options.preview ? 'FAIL' : 'WARN');

export const RULES = [
  rule('R-RULE-01', 'FAIL', 'text',
    /(?:\$|MXN|USD|M\.N\.)\s?\d[\d.,]*(?:\s?(?:pesos|MXN|USD|M\.N\.))?|\d[\d.,]*\s?(?:pesos|MXN|USD)\b|\bprecios? (?:desde|de lista|especial|mayoreo)|\bdescuentos?\b|\ben oferta\b|\bofertas? (?:especial(?:es)?|del mes|de la semana)\b|\bpromoci[oó]n(?:es)?\b|\brebajas?\b/i,
    'precio, importe o descuento público',
    'El catálogo no muestra precios, costos, descuentos ni importes: la acción es siempre cotizar. Busca símbolos y códigos de moneda junto a cifras, y vocabulario de oferta.'),
  rule('R-RULE-01', 'FAIL', 'raw',
    /"(?:price|precio|lowPrice|highPrice|priceCurrency|costo?s?)"\s*:|itemprop=["']?price|schema\.org\/(?:Offer|AggregateOffer)/i,
    'precio en datos estructurados',
    'Tampoco se publican precios en datos para buscadores (JSON-LD, microdatos) ni en archivos JSON.'),
  rule('R-RULE-02', 'FAIL', 'text', /\bgratis\b|\bgratuit[oa]s?\b/i,
    'producto marcado como gratuito',
    'Omitir el precio no convierte un producto en gratuito.'),
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
    '«oficial», «autorizado», distribuidor o sucursal',
    'La atención en Puebla no se presenta como oficial, autorizada, distribuidora ni sucursal. El enlace de una marca se llama «Sitio del fabricante».'),
  rule('R-RULE-08', 'FAIL', 'norm', /\bgisa\b|guantes?[\s._+-]*internacional(?:es)?/i,
    'marca excluida',
    'La marca excluida no aparece en ningún archivo, con o sin espacios, guiones, acentos, mayúsculas o codificación de URL.'),
  rule('R-RULE-08', 'FAIL', 'text', /\bg[\s._-]i[\s._-]s[\s._-]a\b/i,
    'marca excluida escrita letra por letra',
    'Variante con puntos, guiones o espacios entre las letras; solo se busca en el texto visible.'),
  rule('R-RULE-09', 'FAIL', 'text',
    /\ben stock\b|\ben existencia\b|\bexistencias\b|\binventario\b|\bentrega (?:inmediata|el mismo d[ií]a|en \d+)|\bdisponibilidad inmediata\b|\bdisponibles? (?:hoy|ahora|de inmediato)\b|\benv[ií]os? (?:gratis|a todo|a toda)/i,
    'promesa de existencia, inventario o entrega',
    'La disponibilidad y el tiempo de entrega se confirman al cotizar; el sitio no los promete.'),
  rule('R-RULE-10', 'FAIL', 'raw',
    /recibimos tu (?:solicitud|mensaje|cotizaci)|solicitud (?:enviada|recibida|registrada)|mensaje enviado|enviad[oa] con [eé]xito|gracias por (?:tu|su) (?:solicitud|mensaje|compra)|\bfolio\b|n[uú]mero de seguimiento|te contactaremos en \d/i,
    'confirmación falsa de recepción o folio',
    'Abrir WhatsApp o el correo no es un envío: ninguna página ni script muestra confirmaciones, folios o plazos de respuesta.'),
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
    /(?:#|%23)(?:0e2a3d|00a6e5)\b|rgba?\(\s*14[\s,]+42[\s,]+61\b|rgba?\(\s*0[\s,]+166[\s,]+229\b|prefers-color-scheme:\s*dark|color-scheme:[^;}"']*\bdark\b/i,
    'paleta anterior o tema oscuro',
    'La identidad sale del logotipo: tinta #19171A, azul #0067B0 y fondos blancos. El azul marino #0E2A3D y el celeste #00A6E5 del plan anterior no se usan, tampoco un tema oscuro.'),
];

// Reglas que solo aplican mientras la atención presencial no esté confirmada (sin --in-person).
const IN_PERSON_RULES = [
  rule('R-RULE-11', 'FAIL', 'raw', /vis[ií]tanos|ven a visitarnos|c[oó]mo llegar|google\.[a-z.]+\/maps|maps\.app\.goo\.gl|maps\.google|openstreetmap\.org|<iframe/i,
    '«Visítanos», mapa o visita anunciada',
    'Sin atención presencial confirmada no se anuncian visitas ni se inserta un mapa.'),
  rule('R-RULE-11', 'FAIL', 'norm', /31-A\s*Nte|Villa San Alejandro|\b72090\b/i,
    'dirección publicada',
    'La dirección del negocio existe en los datos pero no se publica todavía. Si aparece en un archivo JS, un script importó business.json.'),
];

// Reglas que solo aplican a la compilación de producción (sin --preview).
const PRODUCTION_RULES = [
  rule('R-RULE-03', 'FAIL', 'norm', /\bEJ-\d|\bmarca de ejemplo\b|\bejemplo-[a-z0-9]|\bde\s+ejemplo\b/i,
    'marca de producto de ejemplo en producción',
    'Los productos de ejemplo solo existen en la vista previa. En producción no puede aparecer «EJ-», «Marca de ejemplo», «ejemplo-» ni «de ejemplo» en ningún archivo (tampoco como nombre de clase CSS).'),
];

/** Comprobaciones que no son un patrón de texto. Sirven de documentación y se imprimen con --rules. */
export const CHECKS = [
  ['R-RULE-03', 'Producción: ningún archivo (ni binario, ni su nombre) contiene identificadores, códigos, nombres o textos del archivo de ejemplos, ni el aviso de vista previa.'],
  ['R-RULE-03', 'Vista previa: cada página lleva el aviso de vista previa, y en cada página hay al menos tantas etiquetas «Ejemplo» como productos de ejemplo distintos se muestran.'],
  ['R-RULE-08', 'Ningún nombre de archivo contiene la marca excluida.'],
  ['R-RULE-12', 'Antes del lanzamiento cada página lleva <meta name="robots" content="noindex…">, robots.txt bloquea todo el sitio y no existe un sitemap. Con --launch se exige lo contrario (R-PUB-03).'],
  ['R-RULE-13', 'Ningún enlace del registro de investigación aparece en la salida, salvo los «Sitio del fabricante» de brands.json. Tampoco sus notas internas, ni archivos de research/, docs/ o documentos sueltos (WARN).'],
  ['R-RULE-14', 'Las páginas generadas corresponden a los datos: /categorias/ solo categorías aprobadas (más las de borrador en la vista previa), /productos/ solo fichas aprobadas (más los ejemplos en la vista previa), /marcas/ solo las marcas públicas. Si existe alguna página de categoría o de producto, deben existir las de todos los registros visibles.'],
  ['R-RULE-24', 'Los enlaces de WhatsApp y de correo, y los correos y teléfonos visibles, son los de src/data/business.json.'],
  ['R-QUOTE-06', 'El texto de un enlace de WhatsApp va codificado en la URL.'],
  ['R-RULE-28', 'Ningún formulario envía datos a un servidor (method="post" o action con dirección absoluta).'],
  ['R-NAV-17', 'Cada página declara lang="es-MX" y lleva el enlace «Saltar al contenido» hacia un ancla de la misma página (que el ancla exista lo revisa check-links.mjs).'],
  ['R-RULE-30', 'Los enlaces rotos y los controles inertes los revisa scripts/check-links.mjs.'],
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
  const digits = String(business.whatsappDigits ?? '');
  const email = String(business.email ?? '').toLowerCase();
  const localNumber = digits.slice(-10);
  const knownNumbers = new Set([digits, `52${localNumber}`, localNumber, `1${localNumber}`]);
  const addressNeedle = oneLine(stripAccents(String(business.address ?? ''))).toLowerCase();
  const noticeNeedle = stripAccents(PREVIEW_NOTICE).toLowerCase();
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

    const norm = normalizeContent(raw);
    const shown = isHtml ? visibleText(raw) : '';
    const text = isHtml ? withoutAllowed(shown) : '';
    const words = isHtml ? `${text}\n${inlineScripts(raw)}` : raw;

    for (const { id, level, scope, pattern, title } of rules) {
      if (scope === 'text' && !isHtml) continue;
      const haystack = scope === 'text' ? text : scope === 'words' ? words : scope === 'norm' ? norm : raw;
      const seen = new Set();
      for (const match of haystack.matchAll(globalPattern(pattern))) {
        const key = match[0].toLowerCase();
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

    if (!isHtml) continue;
    const markup = withoutScripts(raw);

    // R-NAV-17 y R-RULE-12.
    if (!/<html\b[^>]*\slang=["']es-MX["']/i.test(raw)) add('FAIL', 'R-NAV-17', file, 'falta lang="es-MX"');
    const skipLink = [...markup.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].some(match => /^#[^\s#]+$/.test(attribute(match[0], 'href') ?? '') && oneLine(decodeEntities(match[1].replace(/<[^>]+>/g, ' '))) === SKIP_LINK_TEXT);
    if (!skipLink) add('FAIL', 'R-NAV-17', file, `falta el enlace «${SKIP_LINK_TEXT}» hacia el contenido principal`);
    const noindex = [...markup.matchAll(/<meta\b[^>]*>/gi)].some(match => /^robots$/i.test(attribute(match[0], 'name') ?? '') && /\bnoindex\b/i.test(attribute(match[0], 'content') ?? ''));
    if (!launch && !noindex) add('FAIL', 'R-RULE-12', file, 'falta <meta name="robots" content="noindex, nofollow"> antes del lanzamiento');
    if (launch && noindex) add('FAIL', 'R-PUB-03', file, 'noindex sigue presente en la versión de lanzamiento');

    // R-RULE-24 y R-QUOTE-06: contacto.
    for (const match of markup.matchAll(/<a\b[^>]*>/gi)) {
      const href = attribute(match[0], 'href') ?? '';
      if (/wa\.me|api\.whatsapp\.com|^whatsapp:/i.test(href)) {
        if (!(href === `https://wa.me/${digits}` || href.startsWith(`https://wa.me/${digits}?text=`))) add('FAIL', 'R-RULE-24', file, `enlace de WhatsApp distinto del confirmado: ${href.slice(0, 90)}`);
        else if (/[^A-Za-z0-9%._~+*'()!-]/.test(href.split('?text=')[1] ?? '')) add('FAIL', 'R-QUOTE-06', file, `texto de WhatsApp sin codificar en la URL: ${href.slice(0, 90)}`);
      }
      if (/^mailto:/i.test(href) && href.slice(7).split('?')[0].toLowerCase() !== email) add('FAIL', 'R-RULE-24', file, `correo distinto del confirmado: ${href.slice(0, 90)}`);
      if (/^tel:/i.test(href) && !knownNumbers.has(href.replace(/\D/g, ''))) add('FAIL', 'R-RULE-24', file, `teléfono distinto del confirmado: ${href}`);
    }
    // «logo@2x.png» tiene forma de correo pero es un nombre de archivo.
    for (const match of shown.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+(?<!\.(?:png|jpe?g|webp|avif|gif|svg))/gi)) {
      if (match[0].toLowerCase() !== email) add('FAIL', 'R-RULE-24', file, `correo visible distinto del confirmado: ${match[0]}`);
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
    for (const match of markup.matchAll(/<img\b[^>]*>/gi)) if (attribute(match[0], 'alt') === undefined && !/\salt(?=[\s/>])/i.test(match[0])) add('FAIL', 'R-A11Y-07', file, `imagen sin alt: ${match[0].slice(0, 80)}`);

    // R-RULE-03, vista previa: aviso en cada página y etiqueta en cada ejemplo.
    if (preview) {
      const plain = stripAccents(shown).toLowerCase();
      if (!plain.includes(noticeNeedle)) add('FAIL', 'R-RULE-03', file, 'página de vista previa sin el aviso visible de vista previa');
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
  const robots = files.find(file => name(file) === 'robots.txt');
  const blocksAll = /^Disallow:\s*\/\s*$/m.test(robots ? await readFile(robots, 'utf8') : '');
  if (!launch && !blocksAll) add('FAIL', 'R-RULE-12', robots ?? join(directory, 'robots.txt'), 'robots.txt no bloquea el sitio antes del lanzamiento');
  if (launch && blocksAll) add('FAIL', 'R-PUB-03', robots, 'robots.txt sigue bloqueando el sitio en la versión de lanzamiento');

  // R-RULE-14: las páginas generadas corresponden a registros que pueden mostrarse.
  const categories = data.catalog?.categories ?? [];
  const idsWhere = (list, test) => list.filter(test).map(item => item.id);
  // Carpeta, nombre para el informe, identificadores que pueden tener página y si deben tenerla todos.
  const sections = [
    ['categorias', 'categoría', [...idsWhere(categories, category => category.status === 'approved'), ...(preview ? idsWhere(categories, category => category.status === 'draft') : [])], true],
    ['productos', 'producto', [...idsWhere(data.catalog?.products ?? [], product => product.status === 'approved'), ...(preview ? examples.map(example => example.id) : [])], true],
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
