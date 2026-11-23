// El almacén de «Mi cotización», con almacenamientos falsos y un EventTarget en lugar de la ventana.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DRAFT_LIMITS, QUOTE_DRAFT_KEY, QUOTE_STORAGE_KEY } from '../src/lib/quote-list.mjs';
import { createQuoteStore, quoteStore } from '../src/lib/quote-store.mjs';

/** Almacenamiento falso que anota cada llamada. */
function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  const calls = [];
  return {
    data, calls,
    getItem(key) { calls.push(['getItem', key]); return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { calls.push(['setItem', key]); data.set(key, String(value)); },
    removeItem(key) { calls.push(['removeItem', key]); data.delete(key); },
  };
}
/** Almacenamiento bloqueado: cada llamada lanza. */
const blocked = () => ({
  getItem() { throw new Error('SecurityError'); },
  setItem() { throw new Error('SecurityError'); },
  removeItem() { throw new Error('SecurityError'); },
});
const line = (productId, quantity = 1, unit = 'par', variantId = '') => ({ productId, variantId, quantity, unit });
const storageEvent = (key, storageArea) => Object.assign(new Event('storage'), { key, storageArea });
const pageShow = persisted => Object.assign(new Event('pageshow'), { persisted });

test('lectura y escritura de ida y vuelta, y una lista vacía quita la clave', () => {
  const local = fakeStorage();
  const store = createQuoteStore({ local, session: fakeStorage(), target: new EventTarget() });
  const lines = [line('guante', 2, 'par', 'talla-8'), line('casco', 1, 'pieza'), line('guante', 2, 'par', 'talla-8')];
  assert.deepEqual(store.read(), []);
  assert.equal(store.write(lines), true);
  assert.equal(local.data.get(QUOTE_STORAGE_KEY), JSON.stringify({ v: 1, lines }));
  assert.deepEqual(store.read(), lines);
  assert.equal(store.write([]), true);
  assert.equal(local.data.has(QUOTE_STORAGE_KEY), false);
  assert.deepEqual(local.calls.at(-1), ['removeItem', QUOTE_STORAGE_KEY]);
  // Solo se guarda lo válido, con cuatro campos.
  store.write([{ ...lines[0], name: 'No se guarda' }, { productId: 'X' }]);
  assert.equal(local.data.get(QUOTE_STORAGE_KEY), JSON.stringify({ v: 1, lines: [lines[0]] }));
  // Basura en la clave: lista vacía.
  local.data.set(QUOTE_STORAGE_KEY, '{basura');
  assert.deepEqual(store.read(), []);
});

test('available() nunca escribe: no hay clave de prueba', () => {
  const local = fakeStorage();
  const store = createQuoteStore({ local, session: fakeStorage(), target: new EventTarget() });
  assert.equal(store.available(), true);
  assert.ok(local.calls.every(([method]) => method === 'getItem'), JSON.stringify(local.calls));
  assert.equal(local.data.size, 0);
  assert.equal(createQuoteStore({ local: null, session: null, target: null }).available(), false);
});

test('un almacenamiento bloqueado no rompe nada', () => {
  const store = createQuoteStore({ local: blocked(), session: blocked(), target: new EventTarget() });
  let calls = 0;
  store.subscribe(() => { calls += 1; });
  assert.equal(store.available(), false);
  assert.deepEqual(store.read(), []);
  assert.equal(store.write([line('guante')]), false);
  assert.equal(store.write([]), false);
  assert.equal(calls, 0);
  assert.deepEqual(store.readDraft(), { note: '', delivery: '', date: '' });
  assert.equal(store.writeDraft({ note: 'Guantes' }), false);
  assert.equal(store.clearDraft(), false);
});

test('un error de cuota al guardar: write() da false y no avisa', () => {
  const local = fakeStorage();
  local.setItem = () => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); };
  const store = createQuoteStore({ local, session: fakeStorage(), target: new EventTarget() });
  let calls = 0;
  store.subscribe(() => { calls += 1; });
  assert.equal(store.available(), true);
  assert.equal(store.write([line('guante')]), false);
  assert.equal(calls, 0);
});

test('por omisión busca el almacenamiento del navegador solo al usarlo, y sin él no falla', () => {
  // En Node no hay ventana ni localStorage utilizable sin bandera: el almacén del módulo existe sin efectos.
  assert.equal(typeof quoteStore.read, 'function');
  const store = createQuoteStore();
  assert.doesNotThrow(() => store.available());
  assert.deepEqual(Array.isArray(store.read()), true);
  assert.equal(typeof store.subscribe(() => {}), 'function');
  // Leer la propiedad lanza (almacenamiento bloqueado por el navegador): se trata como no disponible.
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
  try {
    const guarded = createQuoteStore({ session: fakeStorage(), target: new EventTarget() });
    assert.equal(guarded.available(), false);
    assert.deepEqual(guarded.read(), []);
    assert.equal(guarded.write([line('guante')]), false);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});

test('avisos: «write», «storage» de la clave o de un almacenamiento borrado y «pageshow» restaurado', () => {
  const local = fakeStorage();
  const target = new EventTarget();
  const store = createQuoteStore({ local, session: fakeStorage(), target });
  const seen = [];
  store.subscribe((lines, { source }) => seen.push([source, lines.length]));
  store.write([line('guante')]);
  assert.deepEqual(seen, [['write', 1]]);
  // Otra pestaña cambia la clave.
  local.data.set(QUOTE_STORAGE_KEY, JSON.stringify({ v: 1, lines: [line('guante'), line('casco')] }));
  target.dispatchEvent(storageEvent(QUOTE_STORAGE_KEY, local));
  // Otra pestaña borra el almacenamiento (key null).
  local.data.clear();
  target.dispatchEvent(storageEvent(null, local));
  // Restaurada desde la caché de ida y vuelta.
  target.dispatchEvent(pageShow(true));
  assert.deepEqual(seen, [['write', 1], ['storage', 2], ['storage', 0], ['pageshow', 0]]);
  // No avisa: otra clave, el borrador, otro almacenamiento, una carga normal.
  target.dispatchEvent(storageEvent('otra-clave', local));
  target.dispatchEvent(storageEvent(QUOTE_DRAFT_KEY, local));
  target.dispatchEvent(storageEvent(null, fakeStorage()));
  target.dispatchEvent(pageShow(false));
  target.dispatchEvent(new Event('pageshow'));
  assert.equal(seen.length, 4);
  // Lo que recibe quien escucha es una copia: cambiarla no cambia lo guardado.
  store.subscribe(lines => { lines.length = 0; });
  store.write([line('guante', 3)]);
  assert.deepEqual(store.read(), [line('guante', 3)]);
});

test('cancelar la suscripción; los escuchas de la ventana llegan con el primero y se van con el último', () => {
  const added = [];
  const removed = [];
  const target = new EventTarget();
  const add = target.addEventListener.bind(target);
  const remove = target.removeEventListener.bind(target);
  target.addEventListener = (type, ...rest) => { added.push(type); add(type, ...rest); };
  target.removeEventListener = (type, ...rest) => { removed.push(type); remove(type, ...rest); };
  const local = fakeStorage();
  const store = createQuoteStore({ local, session: fakeStorage(), target });
  assert.deepEqual(added, []);
  let first = 0;
  let second = 0;
  const stopFirst = store.subscribe(() => { first += 1; });
  const stopSecond = store.subscribe(() => { second += 1; });
  assert.deepEqual(added, ['storage', 'pageshow']);
  store.write([line('guante')]);
  stopFirst();
  store.write([line('casco')]);
  target.dispatchEvent(storageEvent(QUOTE_STORAGE_KEY, local));
  assert.deepEqual([first, second], [1, 3]);
  stopSecond();
  assert.deepEqual(removed, ['storage', 'pageshow']);
  store.write([line('guante')]);
  assert.deepEqual([first, second], [1, 3]);
});

test('un error de quien escucha no detiene a los demás ni la escritura', () => {
  const store = createQuoteStore({ local: fakeStorage(), session: fakeStorage(), target: new EventTarget() });
  let reached = false;
  store.subscribe(() => { throw new Error('falla del escucha'); });
  store.subscribe(() => { reached = true; });
  // El navegador tiene reportError: el error queda en la consola sin detener nada.
  const errors = [];
  const original = globalThis.reportError;
  globalThis.reportError = error => errors.push(error.message);
  try {
    assert.equal(store.write([line('guante')]), true);
    assert.equal(reached, true);
  } finally {
    if (original) globalThis.reportError = original;
    else delete globalThis.reportError;
  }
  assert.deepEqual(errors, ['falla del escucha']);
});

test('el borrador: ida y vuelta, límites y la clave se quita cuando queda vacío', () => {
  const session = fakeStorage();
  const local = fakeStorage();
  const store = createQuoteStore({ local, session, target: new EventTarget() });
  assert.deepEqual(store.readDraft(), { note: '', delivery: '', date: '' });
  const draft = { note: 'Guantes de carnaza\n\nTalla 9', delivery: 'Puebla, 72000', date: 'Antes del 15' };
  assert.equal(store.writeDraft(draft), true);
  assert.deepEqual(store.readDraft(), draft);
  // Va al almacenamiento de la sesión, nunca a la lista.
  assert.ok(session.data.has(QUOTE_DRAFT_KEY));
  assert.equal(local.data.size, 0);
  // Cada campo se recorta a su límite, en caracteres completos.
  const long = { note: '🧤'.repeat(DRAFT_LIMITS.note + 5), delivery: 'x'.repeat(500), date: 'y'.repeat(500) };
  store.writeDraft(long);
  const read = store.readDraft();
  assert.equal(Array.from(read.note).length, DRAFT_LIMITS.note);
  assert.ok(read.note.endsWith('🧤'));
  assert.equal(read.delivery.length, DRAFT_LIMITS.delivery);
  assert.equal(read.date.length, DRAFT_LIMITS.date);
  // Solo algunos campos: los demás vacíos.
  store.writeDraft({ delivery: 'Puebla' });
  assert.deepEqual(store.readDraft(), { note: '', delivery: 'Puebla', date: '' });
  // Tres campos vacíos quitan la clave.
  assert.equal(store.writeDraft({ note: '', delivery: '', date: '' }), true);
  assert.equal(session.data.has(QUOTE_DRAFT_KEY), false);
  store.writeDraft(draft);
  assert.equal(store.clearDraft(), true);
  assert.equal(session.data.has(QUOTE_DRAFT_KEY), false);
});

test('basura en la clave del borrador', () => {
  const session = fakeStorage();
  const store = createQuoteStore({ local: fakeStorage(), session, target: new EventTarget() });
  const empty = { note: '', delivery: '', date: '' };
  for (const raw of ['{basura', '[]', 'null', '42', '"texto"', '{"note":5,"delivery":["x"],"date":null}', '{"__proto__":{"note":"heredado"}}']) {
    session.data.set(QUOTE_DRAFT_KEY, raw);
    assert.deepEqual(store.readDraft(), empty, raw);
  }
  session.data.set(QUOTE_DRAFT_KEY, JSON.stringify({ note: 'Guantes', otra: 'x', delivery: 'x'.repeat(300) }));
  assert.deepEqual(store.readDraft(), { note: 'Guantes', delivery: 'x'.repeat(DRAFT_LIMITS.delivery), date: '' });
  // Valores que no son texto al escribir: quedan vacíos.
  assert.equal(store.writeDraft({ note: 5, delivery: null }), true);
  assert.equal(session.data.has(QUOTE_DRAFT_KEY), false);
  assert.equal(store.writeDraft(null), true);
});
