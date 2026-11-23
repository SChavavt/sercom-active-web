// La lista de «Mi cotización»: cantidades, unidades, la lista guardada, el índice público, la vista para una página y
// las frases. Los productos son sintéticos de prueba; nunca se importan en el sitio.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addedMessage, addLine, badgeText, buildQuoteIndex, canMerge, cleanUnit, directLinkValues, DRAFT_LIMITS, duplicateOf, duplicateStates,
  formatQuantity, indexMaps, isNewerList, isValidLine, jsonForScript, lineKey, lineSummary, LIST_FULL_MESSAGE, listCountLabel, listMessageItems,
  MAX_LINES, MAX_QUANTITY, mergedMessage, mergeLines, nameLabel, parseList, parseQuantity, parseQuoteIndex, QUANTITY_ERROR, quantityLabel,
  QUOTE_DRAFT_KEY, QUOTE_STORAGE_KEY, reconcileList, removedMessage, removeLines, restoredMessage, restoreLines, rowLabelName, serializeList,
  STANDARD_UNITS, storageNoteText, undoLines, unitKey, unitOptions, unknownLinesMessage, updateLine, variantText,
} from '../src/lib/quote-list.mjs';

const line = (productId, quantity = 1, unit = 'par', variantId = '') => ({ productId, variantId, quantity, unit });
const stored = lines => JSON.stringify({ v: 1, lines });
/** Congela a fondo, para comprobar que una función no cambia sus argumentos. */
const deepFreeze = value => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

// Índice sintético con la forma que imprime una página.
const publicProducts = [
  {
    id: 'guante-sintetico', url: '/productos/guante-sintetico/', name: 'Guante sintético de prueba', brandId: 'marca-alfa', brandName: 'Marca Alfa', code: 'SP-100',
    categoryIds: ['manos'], categoryNames: ['Protección de manos'], summary: 'Resumen sintético.', characteristics: ['Dato sintético A'], saleUnit: 'par',
    variants: [{ id: 'talla-8', label: 'Talla 8', code: 'SP-100-8' }, { id: 'talla-9', label: 'Talla 9', code: 'SP-100-9' }],
    image: { url: 'https://example.invalid/test.png', alt: 'Imagen de prueba' }, documents: [{ label: 'Ficha', url: 'https://example.invalid/ficha.pdf' }], isExample: false,
  },
  {
    id: 'casco-sintetico', url: '/productos/casco-sintetico/', name: 'Casco sintético de prueba', brandId: null, brandName: 'Marca Beta', code: 'SP-200',
    categoryIds: ['cabeza'], categoryNames: ['Protección de cabeza'], summary: 'Resumen sintético.', characteristics: [], saleUnit: 'pieza',
    variants: [{ id: 'unica', label: 'Única', code: 'SP-200-U' }], image: null, documents: [], isExample: true,
  },
  {
    id: 'respirador-sintetico', url: '/productos/respirador-sintetico/', name: 'Respirador sintético de prueba', brandId: null, brandName: 'Marca Beta', code: 'SP-300',
    categoryIds: ['respiratoria'], categoryNames: ['Protección respiratoria'], summary: 'Resumen sintético.', characteristics: [], saleUnit: 'caja con 100 piezas',
    variants: [], image: null, documents: [], isExample: false,
  },
];
const publicRetired = [
  { id: 'producto-retirado', url: '/productos/producto-retirado/', name: 'Producto retirado sintético', brandId: 'marca-alfa', brandName: 'Marca Alfa', code: 'SP-900', categoryIds: ['manos'], categoryNames: ['Protección de manos'], isExample: false },
];
const index = buildQuoteIndex(publicProducts, publicRetired);
const maps = indexMaps(index);

test('constantes de la lista', () => {
  // La clave y el formato cambian juntos (quote-list.mjs lo explica junto a la clave): una página de una compilación
  // anterior, abierta en otra pestaña, descarta al escribir lo que no sabe leer.
  const rule = 'si cambia lo que un renglón guardado puede llevar o sube un máximo, cambia también QUOTE_STORAGE_KEY';
  assert.equal(QUOTE_STORAGE_KEY, 'cotizacion:v1');
  assert.equal(QUOTE_DRAFT_KEY, 'cotizacion:borrador:v1');
  assert.equal(MAX_LINES, 200, rule);
  assert.equal(MAX_QUANTITY, 99999, rule);
  assert.deepEqual(STANDARD_UNITS, ['pieza', 'par', 'caja', 'paquete']);
  assert.deepEqual(DRAFT_LIMITS, { note: 10000, delivery: 200, date: 200 });
  assert.ok(Object.isFrozen(STANDARD_UNITS) && Object.isFrozen(DRAFT_LIMITS));
});

test('parseQuantity: las formas aceptadas', () => {
  const accepted = [
    ['1', 1], ['12', 12], [' 12 ', 12], ['0012', 12], ['99999', 99999], ['00001', 1], ['\t7\n', 7],
    ['1,200', 1200], ['99,999', 99999], ['12,000', 12000], [' 1,000 ', 1000], ['10,000', 10000],
    [1, 1], [12, 12], [99999, 99999], [12.0, 12],
  ];
  for (const [value, expected] of accepted) assert.equal(parseQuantity(value), expected, JSON.stringify(value));
});

test('parseQuantity: las formas rechazadas', () => {
  const rejected = [
    '', ' ', '0', '00', '00000', '-1', '+5', '1.5', '1,5', '12,00', '1.200', '1,2000', '100,000', '100000', '12a', '1e3', '１２', '٣',
    '1 200', '1,200,000', ',200', '1,', '0,500', '000,500', '1_000', '0x10', 'Infinity', 'NaN', 'doce',
    0, -1, 1.5, 100000, Number.NaN, Number.POSITIVE_INFINITY, null, undefined, true, [], {}, ['12'],
  ];
  for (const value of rejected) assert.equal(parseQuantity(value), null, JSON.stringify(value) ?? String(value));
});

test('formatQuantity: coma de miles desde 10,000', () => {
  assert.equal(formatQuantity(1), '1');
  assert.equal(formatQuantity(1200), '1200');
  assert.equal(formatQuantity(9999), '9999');
  assert.equal(formatQuantity(10000), '10,000');
  assert.equal(formatQuantity(12000), '12,000');
  assert.equal(formatQuantity(99999), '99,999');
  assert.equal(formatQuantity(1234567), '1,234,567');
});

test('unidades: limpieza y opciones', () => {
  assert.equal(cleanUnit('  caja   con 100\npiezas '), 'caja con 100 piezas');
  assert.equal(cleanUnit('\u200B'), '');
  assert.equal(cleanUnit(null), '');
  assert.equal(cleanUnit('x'.repeat(80)), 'x'.repeat(60));
  assert.deepEqual(unitOptions('par'), ['par', 'pieza', 'caja', 'paquete']);
  assert.deepEqual(unitOptions('Par'), ['Par', 'pieza', 'caja', 'paquete']);
  assert.deepEqual(unitOptions('caja con 100 piezas'), ['caja con 100 piezas', 'pieza', 'par', 'caja', 'paquete']);
  assert.deepEqual(unitOptions(''), ['pieza', 'par', 'caja', 'paquete']);
  assert.deepEqual(unitOptions(undefined), ['pieza', 'par', 'caja', 'paquete']);
});

test('unitKey: la misma unidad en singular o plural, con o sin acentos y mayúsculas', () => {
  for (const [written, key] of [
    ['par', 'par'], ['Par', 'par'], ['PARES', 'par'], ['pares', 'par'], ['  pares  ', 'par'], ['Piezas', 'pieza'], ['pieza', 'pieza'],
    ['galón', 'galon'], ['Galones', 'galon'], ['galon', 'galon'], ['kits', 'kit'], ['unidades', 'unidad'], ['millares', 'millar'],
    // En una unidad compuesta solo cuenta la primera palabra; lo demás se compara tal como está.
    ['Cajas con 100 piezas', 'caja con 100 piezas'], ['caja con 100 piezas', 'caja con 100 piezas'], ['caja  con\n100 Piezas', 'caja con 100 piezas'],
    // Una palabra que no es una unidad conocida no cambia, aunque termine en «s».
    ['tambo de 200 L', 'tambo de 200 l'], ['tambos', 'tambos'], ['mes', 'mes'], ['', ''], [null, ''], ['\u200B', ''],
  ]) assert.equal(unitKey(written), key, JSON.stringify(written));
  // Una unidad de una palabra y otra compuesta no son la misma.
  assert.notEqual(unitKey('caja'), unitKey('caja con 100 piezas'));
  assert.notEqual(unitKey('caja con 100 piezas'), unitKey('caja con 50 piezas'));
  // Dos unidades con la misma clave se leen igual con la misma cantidad (salvo por las mayúsculas).
  for (const [a, b] of [['par', 'pares'], ['galon', 'galones'], ['caja con 100 piezas', 'cajas con 100 piezas']]) {
    assert.equal(unitKey(a), unitKey(b));
    for (const quantity of [1, 2, 12000]) assert.equal(quantityLabel(quantity, a), quantityLabel(quantity, b), `${quantity} ${a}`);
  }
});

test('una unidad de venta escrita en plural no ofrece además su singular', () => {
  assert.deepEqual(unitOptions('pares'), ['pares', 'pieza', 'caja', 'paquete']);
  assert.deepEqual(unitOptions('Piezas'), ['Piezas', 'par', 'caja', 'paquete']);
  assert.deepEqual(unitOptions('PAQUETES'), ['PAQUETES', 'pieza', 'par', 'caja']);
  // Una compuesta sí deja la sencilla: son unidades distintas.
  assert.deepEqual(unitOptions('cajas con 100 piezas'), ['cajas con 100 piezas', 'pieza', 'par', 'caja', 'paquete']);
});

test('quantityLabel: singular, plural, compuestas, en plural, desconocidas, 1, 1200 y 12,000', () => {
  assert.equal(quantityLabel(1, 'par'), '1 par');
  assert.equal(quantityLabel(12, 'par'), '12 pares');
  assert.equal(quantityLabel(3, 'caja'), '3 cajas');
  assert.equal(quantityLabel(2, 'pieza'), '2 piezas');
  assert.equal(quantityLabel(5, 'paquete'), '5 paquetes');
  assert.equal(quantityLabel(1200, 'par'), '1200 pares');
  assert.equal(quantityLabel(12000, 'pieza'), '12,000 piezas');
  // Compuesta: solo cambia la primera palabra.
  assert.equal(quantityLabel(3, 'caja con 100 piezas'), '3 cajas con 100 piezas');
  assert.equal(quantityLabel(1, 'caja con 100 piezas'), '1 caja con 100 piezas');
  // Una unidad escrita en plural se reconoce.
  assert.equal(quantityLabel(1, 'pares'), '1 par');
  assert.equal(quantityLabel(4, 'piezas'), '4 piezas');
  assert.equal(quantityLabel(1, 'cajas con 50 piezas'), '1 caja con 50 piezas');
  // Sin acentos ni mayúsculas para reconocerla; se escribe con las mayúsculas de la unidad.
  assert.equal(quantityLabel(2, 'galon'), '2 galones');
  assert.equal(quantityLabel(1, 'GALONES'), '1 GALÓN');
  assert.equal(quantityLabel(3, 'Caja'), '3 Cajas');
  for (const [singular, plural] of [['bolsa', 'bolsas'], ['rollo', 'rollos'], ['juego', 'juegos'], ['kit', 'kits'], ['metro', 'metros'], ['litro', 'litros'], ['galón', 'galones'], ['cubeta', 'cubetas'], ['docena', 'docenas'], ['millar', 'millares'], ['unidad', 'unidades']]) {
    assert.equal(quantityLabel(1, singular), `1 ${singular}`, singular);
    assert.equal(quantityLabel(2, singular), `2 ${plural}`, singular);
    assert.equal(quantityLabel(1, plural), `1 ${singular}`, plural);
  }
  // Primera palabra desconocida: la unidad tal cual y el número aparte.
  assert.equal(quantityLabel(3, 'tambo de 200 L'), '3 × tambo de 200 L');
  assert.equal(quantityLabel(1, 'tambo de 200 L'), '1 tambo de 200 L');
  assert.equal(quantityLabel(12000, 'tambo'), '12,000 × tambo');
  // Sin unidad: solo el número.
  assert.equal(quantityLabel(7, ''), '7');
  assert.equal(quantityLabel(7, '   '), '7');
});

test('lineKey e isValidLine: lo que escribe este código y nada más', () => {
  assert.equal(lineKey(line('guante', 1, 'Par', 'talla-8')), lineKey(line('guante', 5, 'par', 'talla-8')));
  assert.equal(lineKey(line('guante', 1, 'pares', 'talla-8')), lineKey(line('guante', 5, 'par', 'talla-8')));
  assert.notEqual(lineKey(line('guante', 1, 'caja')), lineKey(line('guante', 1, 'caja con 100 piezas')));
  assert.notEqual(lineKey(line('guante', 1, 'par', 'talla-8')), lineKey(line('guante', 1, 'par', 'talla-9')));
  assert.notEqual(lineKey(line('guante', 1, 'par')), lineKey(line('guante', 1, 'pieza')));
  assert.ok(isValidLine(line('guante', 1, 'par')));
  assert.ok(isValidLine(line('guante-de-nitrilo', 99999, 'caja con 100 piezas', 'talla-8')));
  assert.ok(isValidLine(line('a'.repeat(120), 1, 'par')));
  for (const bad of [
    null, 'guante', [], {}, line('Guante', 1, 'par'), line('guante sintetico', 1), line('guante', 1, 'par', 'Talla 8'), line('a'.repeat(121), 1, 'par'),
    line('guante', 0, 'par'), line('guante', 100000, 'par'), line('guante', 1.5, 'par'), line('guante', '12', 'par'), line('guante', 1, ''),
    line('guante', 1, ' par'), line('guante', 1, 'par  doble'), line('guante', 1, 'x'.repeat(61)), line('<script>', 1, 'par'), line('guante', 1, 5),
    { productId: 'guante', quantity: 1, unit: 'par' }, Object.create({ productId: 'guante', variantId: '', quantity: 1, unit: 'par' }),
  ]) assert.equal(isValidLine(bad), false, JSON.stringify(bad));
});

test('parseList: con basura siempre devuelve una lista, sin lanzar', () => {
  const ok = line('guante', 2, 'par', 'talla-8');
  for (const raw of [null, undefined, 42, '', 'no es JSON', '{', '[]', 'null', '"texto"', '42', stored([ok]).replace('"v":1', '"v":2'), JSON.stringify({ lines: [ok] }),
    JSON.stringify({ v: '1', lines: [ok] }), JSON.stringify({ v: 1, lines: 'x' }), JSON.stringify({ v: 1 }), JSON.stringify([{ v: 1, lines: [ok] }])]) {
    assert.deepEqual(parseList(raw), [], String(raw));
  }
  // Claves especiales e ids con forma de script: se descartan o se ignoran, nada se hereda.
  const tricky = '{"v":1,"__proto__":{"polluted":true},"constructor":{"x":1},"lines":[{"productId":"guante","variantId":"","quantity":1,"unit":"par","__proto__":{"admin":true},"constructor":"x"},{"productId":"<img src=x onerror=alert(1)>","variantId":"","quantity":1,"unit":"par"},{"productId":"__proto__","variantId":"","quantity":1,"unit":"par"}]}';
  const parsed = parseList(tricky);
  assert.deepEqual(parsed, [line('guante', 1, 'par')]);
  assert.deepEqual(Object.keys(parsed[0]), ['productId', 'variantId', 'quantity', 'unit']);
  assert.equal(/** @type {any} */ ({}).polluted, undefined);
  // Cantidades como texto: renglón inválido.
  assert.deepEqual(parseList(stored([{ ...ok, quantity: '2' }, ok])), [ok]);
  // Campos de más: el renglón se copia con sus cuatro campos.
  assert.deepEqual(parseList(stored([{ ...ok, name: 'Guante', code: 'SP-100' }])), [ok]);
  // Una lista enorme: los primeros MAX_LINES renglones válidos.
  const many = Array.from({ length: 500 }, (_, i) => line(`producto-${i}`, 1, 'pieza'));
  const read = parseList(stored(many));
  assert.equal(read.length, MAX_LINES);
  assert.deepEqual(read.at(0), many[0]);
  assert.deepEqual(read.at(-1), many[MAX_LINES - 1]);
  const huge = parseList(stored([...Array.from({ length: 100000 }, () => 'basura'), ok]));
  assert.deepEqual(huge, [ok]);
});

test('isNewerList: solo una lista con una versión mayor que la de este código', () => {
  const ok = line('guante', 2, 'par', 'talla-8');
  // Una compilación posterior que no cambió la clave: esta página no la entiende y no debe reemplazarla.
  for (const raw of [stored([ok]).replace('"v":1', '"v":2'), '{"v":2}', '{"v":3,"lines":"otra forma"}', '{"v":1.5,"lines":[]}', '{"v":1e400}']) {
    assert.equal(isNewerList(raw), true, raw);
    assert.deepEqual(parseList(raw), [], raw);
  }
  // Lo de hoy y lo ilegible no son «más nuevos»: lo ilegible cuenta como si no estuviera y el siguiente cambio lo reemplaza.
  for (const raw of [null, undefined, 42, '', 'no es JSON', '{', '[]', 'null', '"texto"', '2', stored([ok]), stored([]), '{"v":0,"lines":[]}', '{"v":-3}',
    '{"v":"2","lines":[]}', '{"v":[2]}', '{"v":null}', '{"v":true}', '{"lines":[]}', '[{"v":2}]', '{"__proto__":{"v":2}}', '{"V":2}']) {
    assert.equal(isNewerList(raw), false, String(raw));
  }
});

test('parseList conserva dos renglones iguales, en su orden, sin unirlos ni cambiar valores', () => {
  const lines = [line('guante', 2, 'par', 'talla-8'), line('casco', 1, 'pieza'), line('guante', 3, 'Par', 'talla-8')];
  assert.deepEqual(parseList(stored(lines)), lines);
});

test('ida y vuelta: parseList(serializeList(x))', () => {
  const lines = [line('guante', 2, 'par', 'talla-8'), line('casco', 99999, 'caja con 100 piezas'), line('guante', 2, 'par', 'talla-8')];
  assert.deepEqual(parseList(serializeList(lines)), lines);
  assert.equal(serializeList(lines), JSON.stringify({ v: 1, lines }));
  // serializeList descarta lo inválido, copia cuatro campos y corta en MAX_LINES.
  assert.equal(serializeList([{ ...lines[0], name: 'x' }, { productId: 'X' }, null]), JSON.stringify({ v: 1, lines: [lines[0]] }));
  assert.equal(parseList(serializeList(Array.from({ length: 300 }, (_, i) => line(`p-${i}`)))).length, MAX_LINES);
  assert.equal(serializeList('nada'), '{"v":1,"lines":[]}');
});

test('addLine: agregado, sumado, segundo renglón al pasar el máximo, lleno e inválido, sin cambiar los argumentos', () => {
  const start = deepFreeze([line('guante', 2, 'par', 'talla-8'), line('casco', 1, 'pieza')]);
  // Agregado al final.
  assert.deepEqual(addLine(start, line('respirador', 3, 'caja')), { lines: [...start, line('respirador', 3, 'caja')], status: 'added', index: 2, quantity: 3 });
  // Sumado al primero igual (la unidad se compara sin mayúsculas).
  const merged = addLine(start, line('guante', 10, 'Par', 'talla-8'));
  assert.deepEqual(merged, { lines: [line('guante', 12, 'par', 'talla-8'), start[1]], status: 'merged', index: 0, quantity: 12 });
  // Otra variante u otra unidad: renglón nuevo.
  assert.equal(addLine(start, line('guante', 1, 'par', 'talla-9')).status, 'added');
  assert.equal(addLine(start, line('guante', 1, 'caja', 'talla-8')).status, 'added');
  // La suma pasaría del máximo: queda como un segundo renglón.
  const near = deepFreeze([line('guante', 99990, 'par', 'talla-8')]);
  assert.deepEqual(addLine(near, line('guante', 10, 'par', 'talla-8')), { lines: [near[0], line('guante', 10, 'par', 'talla-8')], status: 'added', index: 1, quantity: 10 });
  // Justo en el máximo sí se suma; con dos iguales, al primero en el que cabe.
  assert.equal(addLine(near, line('guante', 9, 'par', 'talla-8')).quantity, 99999);
  const two = deepFreeze([line('guante', 99990, 'par', 'talla-8'), line('guante', 5, 'par', 'talla-8')]);
  assert.deepEqual(addLine(two, line('guante', 20, 'par', 'talla-8')), { lines: [two[0], line('guante', 25, 'par', 'talla-8')], status: 'merged', index: 1, quantity: 25 });
  // Lleno: un renglón nuevo no entra; sumar a uno que ya está sí.
  const full = deepFreeze(Array.from({ length: MAX_LINES }, (_, i) => line(`p-${i}`, 1, 'pieza')));
  assert.deepEqual(addLine(full, line('nuevo', 1, 'pieza')), { lines: [...full], status: 'full', index: -1, quantity: 0 });
  assert.equal(addLine(full, line('p-3', 1, 'pieza')).status, 'merged');
  // Inválido: nada cambia.
  for (const bad of [line('Guante', 1), line('guante', 0), line('guante', '1'), null, {}]) {
    assert.deepEqual(addLine(start, bad), { lines: [...start], status: 'invalid', index: -1, quantity: 0 }, JSON.stringify(bad));
  }
  // El renglón agregado es una copia con cuatro campos.
  const extra = { ...line('nuevo', 1, 'pieza'), name: 'No se guarda' };
  assert.deepEqual(Object.keys(addLine(start, extra).lines.at(-1)), ['productId', 'variantId', 'quantity', 'unit']);
});

test('updateLine: cambia, rechaza fuera de rango o inválido, y nunca une', () => {
  const start = deepFreeze([line('guante', 2, 'par', 'talla-8'), line('guante', 3, 'par', 'talla-9')]);
  assert.deepEqual(updateLine(start, 0, { quantity: 5 }), { lines: [line('guante', 5, 'par', 'talla-8'), start[1]], ok: true });
  assert.deepEqual(updateLine(start, 1, { unit: 'caja', variantId: '' }).lines[1], line('guante', 3, 'caja', ''));
  for (const [where, patch] of [[2, { quantity: 1 }], [-1, { quantity: 1 }], [0.5, { quantity: 1 }], ['0', { quantity: 1 }], [0, { quantity: 0 }], [0, { quantity: '5' }], [0, { unit: '' }], [0, { variantId: 'Talla 8' }], [0, { unit: ' par' }]]) {
    assert.deepEqual(updateLine(start, where, patch), { lines: [...start], ok: false }, JSON.stringify([where, patch]));
  }
  // Un cambio que deja dos renglones iguales: quedan los dos.
  const same = updateLine(start, 1, { variantId: 'talla-8' });
  assert.equal(same.ok, true);
  assert.deepEqual(same.lines, [line('guante', 2, 'par', 'talla-8'), line('guante', 3, 'par', 'talla-8')]);
  // Un campo que no es del renglón se ignora.
  assert.deepEqual(Object.keys(updateLine(start, 0, { quantity: 4, productId: 'otro', name: 'x' }).lines[0]), ['productId', 'variantId', 'quantity', 'unit']);
  assert.equal(updateLine(start, 0, { quantity: 4, productId: 'otro' }).lines[0].productId, 'guante');
});

test('removeLines y restoreLines devuelven la lista: un índice, varios, el primero, el último y todos', () => {
  const list = deepFreeze(['a', 'b', 'c', 'd', 'e'].map((id, i) => line(`p-${id}`, i + 1, 'pieza')));
  for (const indexes of [[2], [0], [4], [1, 3], [3, 1, 1], [0, 1, 2, 3, 4], [4, 0], [9, -1, 2]]) {
    const { lines, removed } = removeLines(list, indexes);
    const expected = [...new Set(indexes)].filter(i => i >= 0 && i < list.length).sort((a, b) => a - b);
    assert.deepEqual(removed.map(entry => entry.index), expected, JSON.stringify(indexes));
    assert.deepEqual(removed.map(entry => entry.line), expected.map(i => list[i]));
    assert.equal(lines.length, list.length - expected.length);
    assert.deepEqual(restoreLines(lines, removed), [...list], JSON.stringify(indexes));
  }
  // Un índice más allá del final va al final; una entrada inválida se omite; nunca se pasa de MAX_LINES.
  assert.deepEqual(restoreLines([line('x')], [{ index: 9, line: line('y') }, { index: 0, line: { productId: 'X' } }]), [line('x'), line('y')]);
  const full = Array.from({ length: MAX_LINES }, (_, i) => line(`p-${i}`));
  assert.equal(restoreLines(full, [{ index: 0, line: line('otra') }]).length, MAX_LINES);
});

test('mergeLines y su deshacer', () => {
  const list = deepFreeze([line('casco', 1, 'pieza'), line('guante', 2, 'par', 'talla-8'), line('respirador', 1, 'caja'), line('guante', 3, 'Par', 'talla-8')]);
  const merged = mergeLines(list, 1, 3);
  assert.equal(merged.ok, true);
  assert.deepEqual(merged.lines, [line('casco', 1, 'pieza'), line('guante', 5, 'par', 'talla-8'), line('respirador', 1, 'caja')]);
  assert.equal(merged.index, 1);
  assert.equal(merged.previous, 2);
  assert.deepEqual(merged.removed, [{ index: 3, line: list[3] }]);
  // Deshacer: la cantidad anterior y el renglón de vuelta en su lugar.
  const undone = restoreLines(updateLine(merged.lines, merged.index, { quantity: merged.previous }).lines, merged.removed);
  assert.deepEqual(undone, [...list]);
  // Conservar el de abajo y quitar el de arriba: el índice se corre.
  const reverse = mergeLines(list, 3, 1);
  assert.equal(reverse.index, 2);
  assert.deepEqual(reverse.lines[2], line('guante', 5, 'Par', 'talla-8'));
  assert.deepEqual(restoreLines(updateLine(reverse.lines, reverse.index, { quantity: reverse.previous }).lines, reverse.removed), [...list]);
  // Rechazos: fuera de rango, el mismo, o la suma pasa del máximo.
  const fail = { lines: [...list], ok: false, index: -1, previous: 0, removed: [] };
  assert.deepEqual(mergeLines(list, 1, 1), fail);
  assert.deepEqual(mergeLines(list, 1, 9), fail);
  assert.deepEqual(mergeLines(list, -1, 1), fail);
  const big = deepFreeze([line('guante', 99990, 'par'), line('guante', 10, 'par')]);
  assert.deepEqual(mergeLines(big, 0, 1), { ...fail, lines: [...big] });
  assert.equal(mergeLines([line('guante', 99990, 'par'), line('guante', 9, 'par')], 0, 1).ok, true);
});

test('buildQuoteIndex no deja pasar ningún otro campo del producto', () => {
  assert.deepEqual(index.products.map(product => Object.keys(product).sort()), publicProducts.map(() => ['brandName', 'code', 'id', 'isExample', 'name', 'saleUnit', 'url', 'variants']));
  for (const product of index.products) for (const variant of product.variants) assert.deepEqual(Object.keys(variant).sort(), ['code', 'id', 'label']);
  assert.deepEqual(index.retired.map(product => Object.keys(product).sort()), [['brandName', 'code', 'id', 'isExample', 'name', 'url']]);
  const text = JSON.stringify(index);
  assert.doesNotMatch(text, /Resumen sintético|Dato sintético|example\.invalid|categoryIds|summary|characteristics|image|documents|brandId|manos/);
  assert.deepEqual(index.products[0], {
    id: 'guante-sintetico', name: 'Guante sintético de prueba', brandName: 'Marca Alfa', code: 'SP-100', url: '/productos/guante-sintetico/', saleUnit: 'par', isExample: false,
    variants: [{ id: 'talla-8', label: 'Talla 8', code: 'SP-100-8' }, { id: 'talla-9', label: 'Talla 9', code: 'SP-100-9' }],
  });
  assert.deepEqual(buildQuoteIndex([]), { products: [], retired: [] });
});

test('jsonForScript escapa lo que podría cerrar o cambiar un <script>', () => {
  const value = { name: '</script><script>alert(1)</script>', note: '<!-- x -->', amp: 'a & b', separators: 'a\u2028b\u2029c' };
  const json = jsonForScript(value);
  assert.doesNotMatch(json, /<|>|&|\u2028|\u2029/);
  assert.ok(!json.toLowerCase().includes('</script'));
  assert.ok(!json.includes('<!--'));
  assert.match(json, /\\u003c\/script\\u003e/);
  assert.deepEqual(JSON.parse(json), value);
  assert.equal(jsonForScript(undefined), 'null');
  assert.deepEqual(parseQuoteIndex(jsonForScript(index)), index);
});

test('parseQuoteIndex con basura nunca lanza', () => {
  const empty = { products: [], retired: [] };
  for (const text of [null, undefined, '', 'no es JSON', '[]', '42', '"x"', 'null', '{}', '{"products":"x","retired":5}']) assert.deepEqual(parseQuoteIndex(text), empty, String(text));
  assert.deepEqual(parseQuoteIndex('{"products":[{"id":1},{"name":"sin id"},null,"x",{"id":"bien","variants":[{"id":"v"},{"label":"sin id"},7]}]}'), {
    products: [{ id: 'bien', name: '', brandName: '', code: '', url: '', saleUnit: '', isExample: false, variants: [{ id: 'v', label: '', code: '' }] }],
    retired: [],
  });
  assert.deepEqual(parseQuoteIndex('{"retired":[{"id":"r","name":5,"isExample":"true"}]}'), { products: [], retired: [{ id: 'r', name: '', brandName: '', code: '', url: '', isExample: false }] });
});

test('indexMaps tolera un índice que falta o mal formado', () => {
  assert.equal(maps.products.get('guante-sintetico')?.name, 'Guante sintético de prueba');
  assert.equal(maps.retired.get('producto-retirado')?.code, 'SP-900');
  for (const bad of [null, undefined, 'x', [], {}, { products: 'x' }, { products: [null, { id: 3 }] }]) {
    const empty = indexMaps(bad);
    assert.equal(empty.products.size, 0, JSON.stringify(bad));
    assert.equal(empty.retired.size, 0, JSON.stringify(bad));
  }
  // Un id repetido: vale la primera entrada.
  assert.equal(indexMaps({ products: [{ id: 'a', name: 'Primero' }, { id: 'a', name: 'Segundo' }] }).products.get('a')?.name, 'Primero');
});

test('reconcileList: una vista que no cambia ni descarta nada', () => {
  const lines = deepFreeze([
    line('guante-sintetico', 12, 'par', 'talla-8'), // ok
    line('producto-retirado', 1, 'pieza'), // retirado
    line('no-existe', 3, 'pieza'), // desconocido
    line('guante-sintetico', 1, 'par', 'talla-12'), // una variante que el producto no tiene → desconocido
    line('casco-sintetico', 2, 'pieza'), // sin variante y una sola variante → esa variante
    line('respirador-sintetico', 4, 'tambo'), // unidad que no se ofrece → al final de units
    line('guante-sintetico', 2, 'par'), // con variantes y ninguna elegida → null
  ]);
  const { rows, unknown } = reconcileList(lines, maps);
  assert.equal(rows.length, lines.length);
  rows.forEach((row, i) => assert.equal(row.line, lines[i], `fila ${i}`));
  assert.deepEqual(rows.map(row => row.status), ['ok', 'retired', 'unknown', 'unknown', 'ok', 'ok', 'ok']);
  assert.equal(unknown, 2);
  assert.equal(rows[0].product, maps.products.get('guante-sintetico'));
  assert.deepEqual(rows[0].variant, { id: 'talla-8', label: 'Talla 8', code: 'SP-100-8' });
  assert.deepEqual(rows[0].units, ['par', 'pieza', 'caja', 'paquete']);
  assert.equal(rows[0].unit, 'par');
  assert.equal(rows[1].product.code, 'SP-900');
  assert.deepEqual(rows[2], { line: lines[2], status: 'unknown' });
  assert.deepEqual(rows[3], { line: lines[3], status: 'unknown' });
  assert.deepEqual(rows[4].variant, { id: 'unica', label: 'Única', code: 'SP-200-U' });
  assert.equal(rows[4].line.variantId, '');
  assert.deepEqual(rows[5].variant, null);
  assert.deepEqual(rows[5].units, ['caja con 100 piezas', 'pieza', 'par', 'caja', 'paquete', 'tambo']);
  assert.equal(rows[5].line.unit, 'tambo');
  assert.equal(rows[5].unit, 'tambo');
  assert.equal(rows[6].variant, null);
  // Una unidad con otras mayúsculas o en plural no se repite: `unit` es la opción que la lista muestra elegida, y el
  // renglón guardado queda como está.
  for (const written of ['PAR', 'Pares', 'pares']) {
    const stored = line('guante-sintetico', 1, written, 'talla-8');
    const [row] = reconcileList([stored], maps).rows;
    assert.deepEqual(row.units, ['par', 'pieza', 'caja', 'paquete'], written);
    assert.equal(row.unit, 'par', written);
    assert.equal(row.line.unit, written);
  }
  // Siempre: `unit` es una de `units` (lo que necesita el `<select>` para mostrar la unidad del renglón).
  for (const row of rows) if (row.status === 'ok') assert.ok(row.units.includes(row.unit), row.line.unit);
  // Un índice vacío o que falta: todo desconocido.
  for (const other of [indexMaps(null), indexMaps({}), null, undefined, {}]) {
    const view = reconcileList(lines, other);
    assert.deepEqual(view.rows.map(row => row.status), Array(lines.length).fill('unknown'));
    assert.equal(view.unknown, lines.length);
  }
  assert.deepEqual(reconcileList(null, maps), { rows: [], unknown: 0 });
});

test('duplicateOf y canMerge', () => {
  const lines = [
    line('guante-sintetico', 2, 'par', 'talla-8'), // 0
    line('guante-sintetico', 3, 'Par', 'talla-8'), // 1: igual a 0 (la unidad con otra mayúscula)
    line('casco-sintetico', 1, 'pieza'), // 2: variante implícita «unica»
    line('casco-sintetico', 4, 'pieza', 'unica'), // 3: igual a 2 por la única variante
    line('guante-sintetico', 2, 'par', 'talla-9'), // 4: otra variante
    line('guante-sintetico', 2, 'caja', 'talla-8'), // 5: otra unidad
    line('producto-retirado', 1, 'pieza'), // 6: retirado
    line('producto-retirado', 1, 'pieza'), // 7: retirado igual: nunca es duplicado
    line('no-existe', 1, 'pieza'), // 8
    line('no-existe', 1, 'pieza'), // 9
    line('guante-sintetico', 99997, 'par', 'talla-8'), // 10: igual a 0, la suma con 0 da 99999
    line('guante-sintetico', 2, 'par'), // 11: sin variante (el guante tiene dos): no es igual a 0
    line('guante-sintetico', 7, 'par'), // 12: igual a 11
  ];
  const { rows } = reconcileList(lines, maps);
  assert.deepEqual(rows.map((_, i) => duplicateOf(rows, i)), [-1, 0, -1, 2, -1, -1, -1, -1, -1, -1, 0, -1, 11]);
  assert.equal(canMerge(rows, 1), true);
  assert.equal(canMerge(rows, 3), true);
  assert.equal(canMerge(rows, 10), true); // 2 + 99997 = 99999, justo el máximo
  assert.equal(canMerge(rows, 0), false);
  assert.equal(canMerge(rows, 7), false);
  assert.equal(canMerge(rows, 9), false);
  const over = reconcileList([line('guante-sintetico', 3, 'par', 'talla-8'), line('guante-sintetico', 99997, 'par', 'talla-8')], maps).rows;
  assert.equal(duplicateOf(over, 1), 0);
  assert.equal(canMerge(over, 1), false); // 100000 pasa del máximo
  assert.equal(duplicateOf(rows, 99), -1);
  assert.equal(duplicateOf(rows, -1), -1);
});

test('la misma unidad en singular y en plural es un solo renglón: se suma al agregar y se ofrece unir', () => {
  // Un producto cuya unidad de venta está escrita en plural, como puede llegar de un proveedor.
  const plural = indexMaps(buildQuoteIndex([{ id: 'bota-sintetica', name: 'Bota sintética de prueba', brandName: 'Marca Alfa', code: 'SP-700', url: '/productos/bota-sintetica/', saleUnit: 'pares', isExample: false, variants: [] }]));
  const stored = [line('bota-sintetica', 1, 'pares'), line('bota-sintetica', 1, 'par'), line('bota-sintetica', 1, 'caja')];
  const { rows } = reconcileList(stored, plural);
  assert.deepEqual(rows.map(row => row.units), [['pares', 'pieza', 'caja', 'paquete'], ['pares', 'pieza', 'caja', 'paquete'], ['pares', 'pieza', 'caja', 'paquete']]);
  assert.deepEqual(rows.map(row => row.unit), ['pares', 'pares', 'caja']);
  assert.deepEqual(rows.map(row => lineSummary(row)), ['1 par', '1 par', '1 caja']);
  assert.deepEqual(rows.map((_, i) => duplicateOf(rows, i)), [-1, 0, -1]);
  assert.equal(canMerge(rows, 1), true);
  // Agregar lo mismo en la otra forma suma al renglón que ya estaba, que conserva su unidad tal como se guardó.
  const added = addLine([line('bota-sintetica', 2, 'pares')], line('bota-sintetica', 3, 'par'));
  assert.equal(added.status, 'merged');
  assert.deepEqual(added.lines, [line('bota-sintetica', 5, 'pares')]);
  assert.equal(addLine([line('bota-sintetica', 2, 'caja')], line('bota-sintetica', 3, 'par')).status, 'added');
});

test('frases del mensaje y de las líneas de estado', () => {
  const guante = maps.products.get('guante-sintetico');
  const respirador = maps.products.get('respirador-sintetico');
  assert.equal(variantText(respirador, null), '');
  assert.equal(variantText(guante, null), 'talla o color por definir');
  assert.equal(variantText(guante, guante.variants[0]), 'Talla 8 (SP-100-8)');
  assert.equal(variantText(guante, { id: 'x', label: 'Única', code: '' }), 'Única');
  assert.equal(variantText(guante, { id: 'x', label: 'M', code: 'M' }), 'M');
  const { rows } = reconcileList([line('guante-sintetico', 12, 'par', 'talla-8'), line('respirador-sintetico', 3, 'caja'), line('guante-sintetico', 2, 'par'), line('casco-sintetico', 1, 'pieza'), line('no-existe', 1, 'pieza')], maps);
  assert.equal(lineSummary(rows[0]), '12 pares, Talla 8');
  assert.equal(lineSummary(rows[1]), '3 cajas');
  assert.equal(lineSummary(rows[2]), '2 pares, talla o color por definir');
  assert.equal(lineSummary(rows[3]), '1 pieza, Única');
  assert.equal(lineSummary(rows[4]), '');
  assert.equal(addedMessage({ summary: '12 pares, Talla 8' }), 'Agregado a tu cotización: 12 pares, Talla 8.');
  assert.equal(addedMessage({ summary: '12 pares, Talla 8', total: '24 pares' }), 'Agregado a tu cotización: 12 pares, Talla 8. Con lo que ya tenías son 24 pares.');
  assert.equal(LIST_FULL_MESSAGE, 'Tu cotización ya tiene 200 productos, el máximo. Quita alguno para agregar más.');
  assert.equal(QUANTITY_ERROR, 'Escribe una cantidad entera de 1 a 99,999.');
  assert.equal(removedMessage('Guante recubierto'), 'Quitaste Guante recubierto.');
  assert.equal(removedMessage(' Guante\nrecubierto\u202E '), 'Quitaste Guante recubierto.');
  assert.equal(removedMessage(''), 'Quitaste un producto.');
  assert.equal(removedMessage(undefined), 'Quitaste un producto.');
  assert.equal(mergedMessage('24 pares'), 'Unimos dos renglones iguales: ahora son 24 pares.');
  assert.equal(restoredMessage('12 pares'), 'La cantidad volvió a 12 pares.');
  assert.equal(unknownLinesMessage(0), '');
  assert.equal(unknownLinesMessage(1), '1 producto de tu cotización no aparece en esta página y no se incluye en tu mensaje. Vuelve a cargar la página; si sigue igual, ya no está en el catálogo.');
  assert.equal(unknownLinesMessage(2), '2 productos de tu cotización no aparecen en esta página y no se incluyen en tu mensaje. Vuelve a cargar la página; si siguen igual, ya no están en el catálogo.');
  assert.equal(listCountLabel(0), '0 productos');
  assert.equal(listCountLabel(1), '1 producto');
  assert.equal(listCountLabel(3), '3 productos');
  assert.equal(badgeText(0), '');
  assert.equal(badgeText(-2), '');
  assert.equal(badgeText(7), '7');
  assert.equal(badgeText(99), '99');
  // El número exacto hasta el máximo de la lista: el nombre del enlace dice el mismo («…, 120 productos»).
  assert.equal(badgeText(100), '100');
  assert.equal(badgeText(MAX_LINES), '200');
  assert.equal(badgeText(999), '999');
  assert.equal(badgeText(1000), '999+');
  assert.equal(nameLabel('Cantidad de {nombre}', 'Guante recubierto'), 'Cantidad de Guante recubierto');
  assert.equal(nameLabel('Quitar {nombre} ({nombre})', 'Casco $& $1'), 'Quitar Casco $& $1 (Casco $& $1)');
  assert.equal(nameLabel('Cantidad de {nombre}', '  Guante\n rojo '), 'Cantidad de Guante rojo');
  assert.equal(nameLabel('Cantidad', 'Guante'), 'Cantidad');
});

// ---- decisiones de la página de cotizar ------------------------------------------------------------------------
// Una lista guardada «rara», como la que deja otra versión del sitio o una lista vieja: la reconcilia un índice propio
// con productos sintéticos de cada forma (con varias variantes, con una sola, sin variantes, retirado).
const rareIndex = indexMaps(buildQuoteIndex([
  { id: 'guante-recubierto', name: 'Guante recubierto sintético', brandName: 'Marca Alfa', code: 'SP-110', url: '/productos/guante-recubierto/', saleUnit: 'par', isExample: false,
    variants: [{ id: 'talla-8', label: 'Talla 8', code: 'SP-110-8' }, { id: 'talla-9', label: 'Talla 9', code: 'SP-110-9' }] },
  { id: 'bota-con-casquillo', name: 'Bota sintética con casquillo', brandName: 'Marca Beta', code: 'SP-120', url: '/productos/bota-con-casquillo/', saleUnit: 'par', isExample: false,
    variants: [{ id: 'talla-26', label: 'Talla 26', code: 'SP-120-26' }, { id: 'talla-27', label: 'Talla 27', code: 'SP-120-27' }] },
  { id: 'overol', name: 'Overol sintético', brandName: 'Marca Beta', code: 'SP-130', url: '/productos/overol/', saleUnit: 'pieza', isExample: false,
    variants: [{ id: 'g', label: 'G', code: 'SP-130-G' }, { id: 'xg', label: 'XG', code: 'SP-130-XG' }] },
  { id: 'cono', name: 'Cono sintético', brandName: 'Marca Gamma', code: 'SP-140', url: '/productos/cono/', saleUnit: 'pieza', isExample: false,
    variants: [{ id: 'unica', label: 'Única', code: 'SP-140-U' }] },
  { id: 'guante-de-nitrilo', name: 'Guante de nitrilo sintético', brandName: 'Marca Alfa', code: 'SP-150', url: '/productos/guante-de-nitrilo/', saleUnit: 'caja con 100 piezas', isExample: false,
    variants: [{ id: 'mediano', label: 'Mediano', code: 'SP-150-M' }, { id: 'grande', label: 'Grande', code: 'SP-150-G' }] },
  { id: 'respirador', name: 'Respirador sintético', brandName: 'Marca Gamma', code: 'SP-160', url: '/productos/respirador/', saleUnit: 'caja', isExample: false, variants: [] },
], [
  { id: 'producto-retirado', name: 'Producto retirado sintético', brandName: 'Marca Alfa', code: 'SP-900', url: '/productos/producto-retirado/', isExample: false },
]));
const rareLines = deepFreeze([
  line('guante-recubierto', 12, 'par', 'talla-8'), // 0
  line('guante-recubierto', 5, 'pares', 'talla-8'), // 1: igual a 0, la unidad en plural (otra versión)
  line('bota-con-casquillo', 2, 'par'), // 2: con variantes y ninguna elegida
  line('producto-que-ya-no-existe', 3, 'pieza', 'x'), // 3: producto desconocido
  line('producto-retirado', 1, 'pieza', 'unica'), // 4: retirado
  line('overol', 4, 'pieza', 'xxg'), // 5: una variante que el producto no tiene
  line('cono', MAX_QUANTITY, 'pieza', 'unica'), // 6: la cantidad máxima
  line('guante-de-nitrilo', 3, 'tambo de 200 L', 'mediano'), // 7: una unidad que no se ofrece
  line('respirador', 1, 'caja'), // 8: un producto sin variantes
  line('guante-recubierto', 99990, 'Par', 'talla-8'), // 9: igual a 0; la suma pasa de 99,999
]);
const rareRows = deepFreeze(reconcileList(rareLines, rareIndex).rows);
/** El estado de repetido como lo dicen duplicateOf y canMerge, renglón por renglón. */
const expectedDuplicate = (rows, i) => (rows[i].status === 'ok' && duplicateOf(rows, i) >= 0 ? (canMerge(rows, i) ? 'merge' : 'same') : 'none');

test('la lista «rara» se reconcilia como la ve la página', () => {
  assert.deepEqual(rareRows.map(row => row.status), ['ok', 'ok', 'ok', 'unknown', 'retired', 'unknown', 'ok', 'ok', 'ok', 'ok']);
});

test('listMessageItems: un producto por renglón \'ok\', con la unidad que muestra el renglón; retirados y desconocidos no van', () => {
  assert.deepEqual(listMessageItems(rareRows), [
    { brandName: 'Marca Alfa', code: 'SP-110', name: 'Guante recubierto sintético', quantity: '12 pares', variant: 'Talla 8 (SP-110-8)' },
    // «pares» guardado por otra versión: la opción de la lista es «par», y se lee igual.
    { brandName: 'Marca Alfa', code: 'SP-110', name: 'Guante recubierto sintético', quantity: '5 pares', variant: 'Talla 8 (SP-110-8)' },
    { brandName: 'Marca Beta', code: 'SP-120', name: 'Bota sintética con casquillo', quantity: '2 pares', variant: 'talla o color por definir' },
    { brandName: 'Marca Gamma', code: 'SP-140', name: 'Cono sintético', quantity: '99,999 piezas', variant: 'Única (SP-140-U)' },
    { brandName: 'Marca Alfa', code: 'SP-150', name: 'Guante de nitrilo sintético', quantity: '3 × tambo de 200 L', variant: 'Mediano (SP-150-M)' },
    { brandName: 'Marca Gamma', code: 'SP-160', name: 'Respirador sintético', quantity: '1 caja', variant: '' },
    // «Par» se escribe con la opción de la lista («par»), no con la mayúscula guardada.
    { brandName: 'Marca Alfa', code: 'SP-110', name: 'Guante recubierto sintético', quantity: '99,990 pares', variant: 'Talla 8 (SP-110-8)' },
  ]);
  // Una unidad de venta en plural y un renglón guardado en singular: el mensaje usa la opción de la lista.
  const plural = indexMaps(buildQuoteIndex([{ id: 'bota-sintetica', name: 'Bota sintética', brandName: 'Marca Alfa', code: 'SP-700', url: '/productos/bota-sintetica/', saleUnit: 'pares', isExample: false, variants: [] }]));
  assert.deepEqual(listMessageItems(reconcileList([line('bota-sintetica', 1, 'par'), line('bota-sintetica', 3, 'par')], plural).rows).map(item => item.quantity), ['1 par', '3 pares']);
  // Sin renglones, o sin ninguno 'ok': ningún producto.
  assert.deepEqual(listMessageItems([]), []);
  assert.deepEqual(listMessageItems(null), []);
  assert.deepEqual(listMessageItems(rareRows.filter(row => row.status !== 'ok')), []);
});

test('duplicateStates: el singular y el plural son el mismo renglón; con la suma por encima del máximo no se unen', () => {
  assert.deepEqual(duplicateStates(rareRows), ['none', 'merge', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'same']);
  assert.deepEqual(duplicateStates(rareRows), rareRows.map((_, i) => expectedDuplicate(rareRows, i)));
  // Dos renglones iguales que suman exactamente el máximo sí se unen; uno más, no.
  const at = reconcileList([line('respirador', 99998, 'caja'), line('respirador', 1, 'Cajas')], rareIndex).rows;
  assert.deepEqual(duplicateStates(at), ['none', 'merge']);
  const over = reconcileList([line('respirador', 99998, 'caja'), line('respirador', 2, 'caja')], rareIndex).rows;
  assert.deepEqual(duplicateStates(over), ['none', 'same']);
  // El renglón anterior es el PRIMERO igual, como en duplicateOf: el tercero se compara con el primero.
  const three = reconcileList([line('respirador', 99990, 'caja'), line('respirador', 1, 'caja'), line('respirador', 20, 'caja')], rareIndex).rows;
  assert.deepEqual(duplicateStates(three), ['none', 'merge', 'same']);
  assert.deepEqual(duplicateStates([]), []);
  assert.deepEqual(duplicateStates(null), []);
});

test('duplicateStates: una unidad que la lista no ofrece, guardada con otras mayúsculas, es el mismo renglón', () => {
  // «tambo de 200 L» no está entre las unidades del guante de nitrilo, así que cada renglón muestra la suya tal como
  // se guardó. Lo que decide si dos renglones son iguales es la unidad guardada comparada con unitKey, no la opción
  // que el renglón muestra elegida.
  const rows = reconcileList([line('guante-de-nitrilo', 3, 'tambo de 200 L', 'mediano'), line('guante-de-nitrilo', 2, 'Tambo de 200 L', 'mediano')], rareIndex).rows;
  assert.deepEqual(rows.map(row => row.unit), ['tambo de 200 L', 'Tambo de 200 L']);
  assert.deepEqual(duplicateStates(rows), ['none', 'merge']);
  assert.equal(duplicateOf(rows, 1), 0);
  assert.equal(canMerge(rows, 1), true);
  // Con otra medida ya es otra unidad, y con otra variante es otro renglón.
  const other = reconcileList([line('guante-de-nitrilo', 3, 'tambo de 200 L', 'mediano'), line('guante-de-nitrilo', 2, 'tambo de 100 L', 'mediano'), line('guante-de-nitrilo', 2, 'Tambo de 200 L', 'grande')], rareIndex).rows;
  assert.deepEqual(duplicateStates(other), ['none', 'none', 'none']);
});

test('duplicateStates da lo mismo que duplicateOf y canMerge en una lista de 200 renglones con muchos repetidos', () => {
  // Una lista generada siempre igual (un generador con semilla fija): pocos productos, variantes y unidades, así que se
  // repiten mucho; también renglones retirados y desconocidos, y cantidades cerca del máximo.
  let seed = 20261123;
  const next = limit => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % limit;
  };
  const choices = [
    ['guante-recubierto', ['talla-8', 'talla-9', '']], ['bota-con-casquillo', ['talla-26', '']], ['cono', ['unica', '']], ['respirador', ['']],
    ['producto-retirado', ['']], ['no-existe', ['']], ['overol', ['xxg', 'g']],
  ];
  const units = ['par', 'pares', 'Par', 'pieza', 'Piezas', 'caja', 'cajas', 'tambo de 200 L'];
  const quantities = [1, 2, 12, 5000, 50000, 99990, MAX_QUANTITY];
  const lines = Array.from({ length: MAX_LINES }, () => {
    const [productId, variants] = choices[next(choices.length)];
    return line(productId, quantities[next(quantities.length)], units[next(units.length)], variants[next(variants.length)]);
  });
  const rows = deepFreeze(reconcileList(deepFreeze(lines), rareIndex).rows);
  const states = duplicateStates(rows);
  assert.equal(states.length, MAX_LINES);
  assert.deepEqual(states, rows.map((_, i) => expectedDuplicate(rows, i)));
  // La lista sí pone a prueba los tres estados y los renglones que no son 'ok'.
  for (const state of ['none', 'same', 'merge']) assert.ok(states.filter(value => value === state).length >= 5, state);
  assert.ok(rows.some(row => row.status === 'retired') && rows.some(row => row.status === 'unknown'));
});

test('undoLines: deshacer quitar devuelve el renglón a su lugar y le da el foco', () => {
  const list = deepFreeze([line('cono', 1, 'pieza'), line('respirador', 2, 'caja'), line('overol', 3, 'pieza', 'g'), line('bota-con-casquillo', 4, 'par')]);
  for (const index of [0, 2, 3]) {
    const { lines, removed } = removeLines(list, [index]);
    const undo = deepFreeze({ kind: 'remove', removed });
    assert.deepEqual(undoLines(deepFreeze(lines), undo), { lines: [...list], focus: index, kept: null }, String(index));
  }
});

test('undoLines: deshacer unir, después de cambiar OTRO renglón, devuelve las dos cantidades y conserva el cambio', () => {
  const list = deepFreeze([line('guante-recubierto', 2, 'par', 'talla-8'), line('cono', 1, 'pieza'), line('guante-recubierto', 3, 'Par', 'talla-8'), line('respirador', 1, 'caja')]);
  // Se conserva el de arriba (0) y se quita el de abajo (2); luego el visitante cambia el cono.
  const merged = mergeLines(list, 0, 2);
  assert.equal(merged.ok, true);
  const edited = deepFreeze(updateLine(merged.lines, 1, { quantity: 7 }).lines);
  const undo = deepFreeze({ kind: 'merge', index: merged.index, previous: merged.previous, removed: merged.removed });
  assert.deepEqual(undoLines(edited, undo), {
    lines: [line('guante-recubierto', 2, 'par', 'talla-8'), line('cono', 7, 'pieza'), line('guante-recubierto', 3, 'Par', 'talla-8'), line('respirador', 1, 'caja')],
    focus: 2,
    kept: line('guante-recubierto', 2, 'par', 'talla-8'),
  });
  // Se conserva el de abajo (2) y se quita el de arriba (0): el que se conservó cambia de posición al volver el otro.
  const reverse = mergeLines(list, 2, 0);
  const editedReverse = deepFreeze(updateLine(reverse.lines, 2, { quantity: 9 }).lines);
  const result = undoLines(editedReverse, deepFreeze({ kind: 'merge', index: reverse.index, previous: reverse.previous, removed: reverse.removed }));
  assert.deepEqual(result.lines, [list[0], list[1], list[2], line('respirador', 9, 'caja')]);
  assert.equal(result.focus, 0);
  assert.deepEqual(result.kept, list[2]);
});

test('undoLines: deshacer quitar los desconocidos y vaciar no dan el foco a ningún renglón', () => {
  const rows = rareRows;
  const unknown = rows.flatMap((row, index) => (row.status === 'unknown' ? [index] : []));
  const { lines, removed } = removeLines(rareLines, unknown);
  assert.deepEqual(undoLines(deepFreeze(lines), deepFreeze({ kind: 'unknown', removed })), { lines: [...rareLines], focus: -1, kept: null });
  assert.deepEqual(undoLines([], deepFreeze({ kind: 'empty', previous: rareLines })), { lines: [...rareLines], focus: -1, kept: null });
  // Sin nada que deshacer, la lista como está.
  assert.deepEqual(undoLines(rareLines, null), { lines: [...rareLines], focus: -1, kept: null });
});

test('undoLines: el foco no pasa del último renglón y no cambia sus argumentos', () => {
  // Una lista llena no recibe el renglón de vuelta (restoreLines): el foco queda en el último que hay.
  const full = deepFreeze(Array.from({ length: MAX_LINES }, (_, i) => line(`p-${i}`, 1, 'pieza')));
  const removed = deepFreeze([{ index: MAX_LINES + 5, line: line('otro', 1, 'pieza') }]);
  assert.deepEqual(undoLines(full, deepFreeze({ kind: 'remove', removed })), { lines: [...full], focus: MAX_LINES - 1, kept: null });
  // Los argumentos congelados no lanzan, y lo devuelto es otra lista.
  const list = deepFreeze([line('cono', 1, 'pieza')]);
  const previous = deepFreeze([line('respirador', 1, 'caja')]);
  const emptied = undoLines(list, deepFreeze({ kind: 'empty', previous }));
  assert.notEqual(emptied.lines, previous);
  assert.deepEqual(previous, [line('respirador', 1, 'caja')]);
  assert.deepEqual(list, [line('cono', 1, 'pieza')]);
});

// ---- decisiones de la página de un producto --------------------------------------------------------------------

test('directLinkValues: solo los campos tocados, vacíos con «por definir» o una cantidad no válida', () => {
  const guante = rareIndex.products.get('guante-recubierto');
  const cono = rareIndex.products.get('cono');
  const respirador = rareIndex.products.get('respirador');
  const talla8 = guante.variants[0];
  const state = (touched, variant, quantity, unit = 'par', product = guante) => directLinkValues(deepFreeze({ product, touched, variant, quantity, unit }));
  // Nada tocado: ninguna línea, aunque los campos tengan valores.
  for (const touched of [{}, { variant: false, quantity: false }]) {
    assert.deepEqual(state(touched, talla8, '12'), {});
    assert.deepEqual(state(touched, null, 'doce'), {});
  }
  // Solo la variante: elegida, o de vuelta en «Talla o color por definir» (la línea queda vacía).
  assert.deepEqual(state({ variant: true }, talla8, '12'), { variant: 'Talla 8 (SP-110-8)' });
  assert.deepEqual(state({ variant: true, quantity: false }, null, '12'), { variant: '' });
  // La única variante de un producto cuenta como elegida.
  assert.deepEqual(state({ variant: true }, cono.variants[0], '1', 'pieza', cono), { variant: 'Única (SP-140-U)' });
  // Solo la cantidad (o la unidad): con la unidad elegida; vacía mientras la cantidad no es válida.
  assert.deepEqual(state({ quantity: true }, talla8, '12'), { quantity: '12 pares' });
  assert.deepEqual(state({ quantity: true }, talla8, '1', 'caja'), { quantity: '1 caja' });
  assert.deepEqual(state({ quantity: true }, null, '99,999', 'pieza'), { quantity: '99,999 piezas' });
  assert.deepEqual(state({ quantity: true }, null, ' 1,200 ', 'tambo de 200 L'), { quantity: '1200 × tambo de 200 L' });
  for (const invalid of ['', '0', 'doce', '1.5', '100000', '-3']) assert.deepEqual(state({ quantity: true }, talla8, invalid), { quantity: '' }, invalid);
  // Las dos: cada una con su regla.
  assert.deepEqual(state({ variant: true, quantity: true }, talla8, '3'), { variant: 'Talla 8 (SP-110-8)', quantity: '3 pares' });
  assert.deepEqual(state({ variant: true, quantity: true }, null, ''), { variant: '', quantity: '' });
  // Un producto sin variantes: la línea de la variante (si se tocara) queda vacía.
  assert.deepEqual(state({ variant: true, quantity: true }, null, '2', 'caja', respirador), { variant: '', quantity: '2 cajas' });
});

test('storageNoteText: la nota dice solo lo que el navegador guarda en ese momento', () => {
  // Una página con productos trae las cuatro frases; una sin productos, la impresa (que habla solo de los campos) y la
  // de cuando no se guarda nada.
  const full = { printed: 'la lista y los campos', sessionOnly: 'solo los campos', listOnly: 'solo la lista', blocked: 'nada' };
  const bare = { printed: 'los campos', sessionOnly: undefined, listOnly: undefined, blocked: 'nada' };
  const cases = [
    [{ listKept: true, draftKept: true }, 'la lista y los campos', 'los campos'],
    // El navegador rechazó el último cambio de la lista: la nota ya no dice que la lista se guarda.
    [{ listKept: false, draftKept: true }, 'solo los campos', 'los campos'],
    [{ listKept: true, draftKept: false }, 'solo la lista', 'nada'],
    [{ listKept: false, draftKept: false }, 'nada', 'nada'],
  ];
  for (const [kept, withProducts, withoutProducts] of cases) {
    assert.equal(storageNoteText(kept, full), withProducts, JSON.stringify(kept));
    assert.equal(storageNoteText(kept, bare), withoutProducts, JSON.stringify(kept));
  }
});

test('rowLabelName: el producto y, si tiene varias variantes, la del renglón', () => {
  // Los renglones de la lista «rara», en su orden.
  assert.deepEqual(rareRows.map(row => rowLabelName(row)), [
    'Guante recubierto sintético, Talla 8',
    'Guante recubierto sintético, Talla 8',
    // Con varias variantes y ninguna elegida, lo dice.
    'Bota sintética con casquillo, talla o color por definir',
    // Un renglón que la página no ubica no tiene nombre.
    '',
    // Un producto retirado: solo su nombre.
    'Producto retirado sintético',
    '',
    // Con una sola variante o sin variantes no hace falta decirla: todos sus renglones tienen la misma.
    'Cono sintético',
    'Guante de nitrilo sintético, Mediano',
    'Respirador sintético',
    'Guante recubierto sintético, Talla 8',
  ]);
  // El mismo producto en dos tallas: cada renglón se nombra distinto, y así se nombran sus controles.
  const sizes = reconcileList([line('guante-recubierto', 1, 'par', 'talla-8'), line('guante-recubierto', 1, 'par', 'talla-9')], rareIndex).rows;
  assert.deepEqual(sizes.map(row => nameLabel('Unirlos: {nombre}', rowLabelName(row))), [
    'Unirlos: Guante recubierto sintético, Talla 8', 'Unirlos: Guante recubierto sintético, Talla 9',
  ]);
  assert.equal(rowLabelName(null), '');
  assert.equal(rowLabelName(undefined), '');
});
