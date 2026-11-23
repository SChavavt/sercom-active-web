// @ts-check
// El almacén de «Mi cotización» en el navegador: la lista en `localStorage` y el borrador de «Cotizar mi lista» en
// `sessionStorage`. Es el ÚNICO archivo de src/ que toca el almacenamiento del navegador (una prueba de las fuentes lo
// exige). Apto para el navegador y para node:test: solo importa `quote-list.mjs`.
//
// Qué se guarda (la página de privacidad lo explica):
//   - `localStorage`, clave `cotizacion:v1`: solo `{ v: 1, lines: [{ productId, variantId, quantity, unit }] }`;
//   - `sessionStorage`, clave `cotizacion:borrador:v1`: lo que el visitante escribe en «Cotizar mi lista» (lista
//     escrita, lugar de entrega y fecha). Pertenece a la pestaña.
// Nada más: ninguna clave de prueba, ninguna cookie. `available()` no escribe nada.
//
// Una página nunca reescribe la lista por su cuenta (al cargar, con un evento «storage» o con «pageshow»): solo escribe
// cuando el visitante hace algo en ella. Los avisos a quien escucha dicen de dónde viene el cambio (`source`): 'write'
// después de `write()` en esta pestaña, 'storage' después de un cambio en otra pestaña (o de un almacenamiento borrado)
// y 'pageshow' cuando el navegador restaura la página desde su caché de ida y vuelta.
//
// Sin efectos hasta que se llama un método: el almacenamiento y la ventana se buscan cuando hacen falta, dentro de
// try/catch (leer `window.localStorage` lanza cuando el navegador lo bloquea).
/** @import { QuoteDraft, QuoteLine, QuoteListener, QuoteStore, StorageLike } from '../types/quote.ts' */
import { DRAFT_LIMITS, parseList, QUOTE_DRAFT_KEY, QUOTE_STORAGE_KEY, serializeList } from './quote-list.mjs';

/** @typedef {Pick<EventTarget, 'addEventListener' | 'removeEventListener'>} ListenerTarget */

/** Recorta un texto a `limit` caracteres completos (puntos de código). @param {unknown} value @param {number} limit */
const cut = (value, limit) => (typeof value === 'string' ? Array.from(value).slice(0, limit).join('') : '');
/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Un error de quien escucha no interrumpe a los demás ni la escritura: se informa aparte (en la consola del navegador,
 * como cualquier error sin atrapar).
 * @param {unknown} error
 */
function report(error) {
  if (typeof globalThis.reportError === 'function') globalThis.reportError(error);
  else setTimeout(() => {
    throw error;
  });
}

/**
 * Crea un almacén. `local` y `session` son objetos con `getItem`, `setItem` y `removeItem` (por omisión, los del
 * navegador); `target` es donde se escuchan 'storage' y 'pageshow' (por omisión, la ventana).
 * @param {{ local?: StorageLike | null, session?: StorageLike | null, target?: ListenerTarget | null }} [options]
 * @returns {QuoteStore}
 */
export function createQuoteStore({ local, session, target } = {}) {
  /** @returns {StorageLike | null} */
  const localArea = () => {
    if (local !== undefined) return local;
    try {
      return globalThis.localStorage ?? null;
    } catch {
      return null;
    }
  };
  /** @returns {StorageLike | null} */
  const sessionArea = () => {
    if (session !== undefined) return session;
    try {
      return globalThis.sessionStorage ?? null;
    } catch {
      return null;
    }
  };
  /** @returns {ListenerTarget | null} */
  const eventTarget = () => {
    if (target !== undefined) return target;
    const view = /** @type {ListenerTarget | undefined} */ (globalThis.window);
    return view && typeof view.addEventListener === 'function' ? view : null;
  };

  /** @type {Set<QuoteListener>} */
  const listeners = new Set();
  /** @type {ListenerTarget | null} */
  let listening = null;

  /** @returns {QuoteLine[]} */
  const read = () => {
    try {
      return parseList(localArea()?.getItem(QUOTE_STORAGE_KEY) ?? null);
    } catch {
      return [];
    }
  };

  /** @param {QuoteLine[]} lines @param {'write' | 'storage' | 'pageshow'} source */
  const notify = (lines, source) => {
    for (const listener of [...listeners]) {
      try {
        listener(lines.map(line => ({ ...line })), { source });
      } catch (error) {
        report(error);
      }
    }
  };

  /** @param {Event} event */
  const onStorage = event => {
    const { key, storageArea } = /** @type {StorageEvent} */ (event);
    if (key !== null && key !== QUOTE_STORAGE_KEY) return;
    // Un cambio en otro almacenamiento (el de la sesión, por ejemplo) no es un cambio de la lista.
    const area = localArea();
    if (storageArea && area && storageArea !== area) return;
    notify(read(), 'storage');
  };
  /** @param {Event} event */
  const onPageShow = event => {
    if (/** @type {PageTransitionEvent} */ (event).persisted === true) notify(read(), 'pageshow');
  };

  return {
    available() {
      try {
        const area = localArea();
        if (!area) return false;
        area.getItem(QUOTE_STORAGE_KEY);
        return true;
      } catch {
        return false;
      }
    },
    read,
    write(lines) {
      const text = serializeList(lines);
      const stored = parseList(text);
      try {
        const area = localArea();
        if (!area) return false;
        if (stored.length === 0) area.removeItem(QUOTE_STORAGE_KEY);
        else area.setItem(QUOTE_STORAGE_KEY, text);
      } catch {
        return false;
      }
      notify(stored, 'write');
      return true;
    },
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      if (!listening) {
        const view = eventTarget();
        if (view) {
          view.addEventListener('storage', onStorage);
          view.addEventListener('pageshow', onPageShow);
          listening = view;
        }
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && listening) {
          listening.removeEventListener('storage', onStorage);
          listening.removeEventListener('pageshow', onPageShow);
          listening = null;
        }
      };
    },
    readDraft() {
      /** @type {QuoteDraft} */
      const draft = { note: '', delivery: '', date: '' };
      try {
        const raw = sessionArea()?.getItem(QUOTE_DRAFT_KEY);
        const data = typeof raw === 'string' ? JSON.parse(raw) : null;
        if (!isRecord(data)) return draft;
        return {
          note: cut(Object.hasOwn(data, 'note') ? data.note : '', DRAFT_LIMITS.note),
          delivery: cut(Object.hasOwn(data, 'delivery') ? data.delivery : '', DRAFT_LIMITS.delivery),
          date: cut(Object.hasOwn(data, 'date') ? data.date : '', DRAFT_LIMITS.date),
        };
      } catch {
        return draft;
      }
    },
    writeDraft(fields) {
      const draft = {
        note: cut(fields?.note, DRAFT_LIMITS.note),
        delivery: cut(fields?.delivery, DRAFT_LIMITS.delivery),
        date: cut(fields?.date, DRAFT_LIMITS.date),
      };
      try {
        const area = sessionArea();
        if (!area) return false;
        if (!draft.note && !draft.delivery && !draft.date) area.removeItem(QUOTE_DRAFT_KEY);
        else area.setItem(QUOTE_DRAFT_KEY, JSON.stringify(draft));
        return true;
      } catch {
        return false;
      }
    },
    clearDraft() {
      try {
        const area = sessionArea();
        if (!area) return false;
        area.removeItem(QUOTE_DRAFT_KEY);
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** El almacén del navegador. Crearlo no toca nada: el almacenamiento se lee cuando se llama un método. */
export const quoteStore = createQuoteStore();
