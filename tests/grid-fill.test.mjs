import test from 'node:test';
import assert from 'node:assert/strict';
import { fillSpans, gridFill } from '../src/lib/grid-fill.mjs';

/** Columnas que ocupa cada fila con `count` celdas de `span`, los rellenos y la celda final, en orden de colocación. */
function rows(count, span, fills, tail = 0, columns = 12) {
  const widths = [...Array(count).fill(span), ...fills, ...(tail ? [tail] : [])];
  const result = [];
  let row = 0;
  for (const width of widths) {
    if (row + width > columns) {
      result.push(row);
      row = 0;
    }
    row += width;
  }
  if (row > 0) result.push(row);
  return result;
}

test('fillSpans sin celda final: lo que falta de la última fila, en una sola celda', () => {
  assert.deepEqual(fillSpans(1, 3), [9]);
  assert.deepEqual(fillSpans(3, 3), [3]);
  assert.deepEqual(fillSpans(4, 3), []);
  assert.deepEqual(fillSpans(5, 3), [9]);
  assert.deepEqual(fillSpans(7, 6), [6]);
  assert.deepEqual(fillSpans(8, 6), []);
  assert.deepEqual(fillSpans(0, 3), []);
  assert.deepEqual(fillSpans(3, 1, { columns: 2 }), [1]);
  assert.deepEqual(fillSpans(10, 1, { columns: 2 }), []);
});

test('fillSpans con celda final: la celda ancha cierra la última fila, apoyada a la derecha', () => {
  // Placa de la portada: diez mosaicos y la celda de solicitud especial no necesitan relleno en ningún ancho.
  assert.deepEqual(fillSpans(10, 2, { tail: 4 }), []);
  assert.deepEqual(fillSpans(10, 3, { tail: 6 }), []);
  assert.deepEqual(fillSpans(10, 6, { tail: 12 }), []);
  // Cabe junto a los últimos mosaicos: un relleno entre ellos y la celda final.
  assert.deepEqual(fillSpans(7, 2, { tail: 4 }), [6]);
  assert.deepEqual(fillSpans(6, 2, { tail: 4 }), [8]);
  // No cabe: el primer relleno termina la fila y el segundo empieza la siguiente.
  assert.deepEqual(fillSpans(5, 2, { tail: 4 }), [2, 8]);
  assert.deepEqual(fillSpans(3, 3, { tail: 6 }), [3, 6]);
  assert.deepEqual(fillSpans(1, 6, { tail: 12 }), [6]);
  assert.deepEqual(fillSpans(2, 6, { tail: 12 }), []);
});

test('fillSpans llena todas las filas con cualquier número de celdas', () => {
  for (const [span, tail] of [[2, 0], [3, 0], [6, 0], [2, 4], [3, 6], [6, 12], [4, 0], [12, 0]]) {
    for (let count = 1; count <= 30; count += 1) {
      const fills = fillSpans(count, span, { tail });
      assert.ok(fills.length <= 2, `${count}×${span}+${tail}: a lo más dos rellenos`);
      for (const width of fills) assert.ok(width > 0 && width < 12, `${count}×${span}+${tail}: relleno de ${width}`);
      for (const used of rows(count, span, fills, tail)) assert.equal(used, 12, `${count}×${span}+${tail}: fila de ${used} columnas`);
    }
  }
});

test('fillSpans rechaza datos que no forman una retícula', () => {
  assert.throws(() => fillSpans(-1, 3), /número de celdas/);
  assert.throws(() => fillSpans(2.5, 3), /número de celdas/);
  assert.throws(() => fillSpans(3, 0), /ancho de cada celda/);
  assert.throws(() => fillSpans(3, 13), /ancho de cada celda/);
  assert.throws(() => fillSpans(3, 5), /debe dividir las 12 columnas/);
  assert.throws(() => fillSpans(3, 3, { tail: 13 }), /celda final/);
  assert.throws(() => fillSpans(3, 3, { columns: 0 }), /columnas/);
});

test('gridFill reparte los rellenos por punto de corte; 0 donde una celda no hace falta', () => {
  const plate = { lg: { span: 2, tail: 4 }, md: { span: 3, tail: 6 }, sm: { span: 6, tail: 12 } };
  assert.deepEqual(gridFill(10, plate), []);
  assert.deepEqual(gridFill(5, plate), [{ lg: 2, md: 3, sm: 6 }, { lg: 8, md: 0, sm: 0 }]);
  assert.deepEqual(gridFill(4, plate), [{ lg: 0, md: 6, sm: 0 }]);
  assert.deepEqual(gridFill(6, plate), [{ lg: 8, md: 0, sm: 0 }]);
  const cards = { lg: { span: 3 }, md: { span: 6 }, sm: { span: 6 } };
  assert.deepEqual(gridFill(1, cards), [{ lg: 9, md: 6, sm: 6 }]);
  assert.deepEqual(gridFill(2, cards), [{ lg: 6, md: 0, sm: 0 }]);
  assert.deepEqual(gridFill(8, cards), []);
  assert.deepEqual(gridFill(3, { lg: { span: 1, columns: 2 }, sm: { span: 12 } }), [{ lg: 1, sm: 0 }]);
  assert.throws(() => gridFill(3, {}), /al menos un punto de corte/);
});
