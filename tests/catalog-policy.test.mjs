import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCatalog, getPublishedProducts } from '../src/lib/catalog-policy.mjs';

// Datos sintéticos exclusivamente de prueba; nunca se importan en el sitio.
const registry = { sources: [{ entity_id: 'test-brand', name: 'Marca sintética de prueba', entity_type: 'brand' }] };
function fixture(status = 'approved') {
  return { schemaVersion: 1, categories: [{ id: 'test-category', name: 'Prueba', status: 'approved' }], products: [{
    id: 'test-001', brandId: 'test-brand', model: 'TEST-001', name: 'Producto sintético de prueba',
    categoryIds: ['test-category'], status, description: 'No es un artículo comercial.', saleUnit: 'pieza',
    characteristics: ['Dato sintético A', 'Dato sintético B', 'Dato sintético C'],
    image: { url: 'https://example.invalid/test.png', alt: 'Imagen de prueba', sourceUrl: 'https://example.invalid/source', usageConfirmed: true },
    source: { url: 'https://example.invalid/test', checkedOn: '2026-11-18' },
    approval: { by: 'Revisor de prueba', on: '2026-11-18', supplyConfirmed: true },
  }] };
}

test('los borradores no salen al catálogo y la aprobación interna no se exporta', () => {
  assert.deepEqual(getPublishedProducts(fixture('draft'), registry), []);
  const products = getPublishedProducts(fixture(), registry);
  assert.equal(products.length, 1);
  assert.equal('approval' in products[0], false);
  assert.equal('usageConfirmed' in products[0].image, false);
});

test('bloquea publicación sin evidencia y costos anidados', () => {
  const missingApproval = fixture();
  missingApproval.products[0].approval.supplyConfirmed = false;
  assert.throws(() => getPublishedProducts(missingApproval, registry), /aprobación comercial/);
  const missingImage = fixture();
  missingImage.products[0].image.usageConfirmed = false;
  assert.throws(() => getPublishedProducts(missingImage, registry), /imagen verificable/);
  const privateCost = fixture();
  privateCost.products[0].variants = [{ id: 'v-1', label: 'Prueba', manufacturerCode: 'V-1', costo: 100 }];
  assert.throws(() => getPublishedProducts(privateCost, registry), /campo comercial/);
});

test('rechaza marcas excluidas, proveedores como marcas y modelos duplicados', () => {
  const excluded = fixture();
  excluded.products[0].name = 'Guantes Internacionales GISA';
  assert.throws(() => getPublishedProducts(excluded, registry), /marca excluida/);
  const supplierRegistry = { sources: [{ entity_id: 'test-brand', name: 'Proveedor de prueba', entity_type: 'supplier' }] };
  assert.ok(validateCatalog(fixture(), supplierRegistry).some(e => e.includes('proveedor')));
  const duplicates = fixture();
  duplicates.products.push({ ...duplicates.products[0], id: 'test-002' });
  assert.throws(() => getPublishedProducts(duplicates, registry), /modelo vacío o duplicado/);
});
