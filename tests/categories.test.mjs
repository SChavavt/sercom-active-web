import test from 'node:test';
import assert from 'node:assert/strict';
import { getPublishedProducts, getRetiredProducts, validateCatalog } from '../src/lib/catalog-policy.mjs';
import { loadProjectData, publicCatalog } from './helpers.mjs';

const { catalog, registry } = await loadProjectData();

// Textos acordados para las diez categorías, en el orden del catálogo: id, nombre, nombre corto y línea orientativa.
const EXPECTED = [
  ['manos', 'Protección de manos', 'Manos', 'Guantes recubiertos, de cuero, desechables, anticorte, para químicos y mangas'],
  ['ojos-y-cara', 'Protección de ojos y cara', 'Ojos y cara', 'Lentes, goggles y caretas'],
  ['cabeza', 'Protección de cabeza', 'Cabeza', 'Cascos, suspensiones y accesorios'],
  ['respiratoria', 'Protección respiratoria', 'Respiratoria', 'Respiradores, cartuchos y filtros'],
  ['auditiva', 'Protección auditiva', 'Auditiva', 'Tapones y orejeras'],
  ['alturas', 'Trabajo en alturas', 'Alturas', 'Arneses, eslingas, retráctiles, anclajes y líneas de vida'],
  ['ropa', 'Ropa y protección corporal', 'Ropa', 'Overoles, impermeables, alta visibilidad y prendas especializadas'],
  ['calzado', 'Calzado industrial', 'Calzado', 'Botas y calzado de seguridad'],
  ['vial-y-senalizacion', 'Vial y señalización', 'Vial y señalización', 'Conos, barreras, cintas y señales'],
  ['soldadura', 'Soldadura', 'Soldadura', 'Protección para soldar'],
];

// Catálogo mínimo válido para probar la validación de categorías sin tocar los datos reales.
const minimal = category => ({ schemaVersion: 1, categories: [{ id: 'prueba', name: 'Prueba', status: 'draft', ...category }], products: [] });
// Ficha sintética de prueba; nunca se importa en el sitio.
const syntheticProduct = overrides => ({
  schemaVersion: 1,
  categories: [{ id: 'test-category', name: 'Prueba', status: 'approved' }],
  products: [{ id: 'test-001', brandId: 'test-brand', model: 'TEST-001', name: 'Producto sintético de prueba', categoryIds: ['test-category'], status: 'draft', ...overrides }],
});
const syntheticRegistry = { sources: [{ entity_id: 'test-brand', name: 'Marca sintética de prueba', entity_type: 'brand' }] };

test('las diez categorías llevan nombre corto y línea orientativa, en el orden acordado', () => {
  assert.deepEqual(catalog.categories.map(category => [category.id, category.name, category.shortName, category.summary]), EXPECTED);
  for (const category of catalog.categories) assert.deepEqual(Object.keys(category).sort(), ['id', 'name', 'shortName', 'status', 'summary']);
});

test('cada categoría está en borrador o aprobada, y una ficha aprobada solo está en categorías aprobadas', () => {
  for (const category of catalog.categories) assert.ok(['draft', 'approved'].includes(category.status), category.id);
  const { approvedCategoryIds, approvedProducts } = publicCatalog(catalog);
  for (const product of approvedProducts) {
    for (const id of product.categoryIds) assert.ok(approvedCategoryIds.includes(id), `${product.id}: ${id}`);
  }
});

test('el catálogo real pasa la validación y publica exactamente sus fichas aprobadas', () => {
  assert.deepEqual(validateCatalog(catalog, registry), []);
  const { approvedProductIds, publicRetiredIds } = publicCatalog(catalog);
  // Nada sin aprobar se publica: ni un borrador, ni una ficha en revisión, ni un retirado.
  assert.deepEqual(getPublishedProducts(catalog, registry).map(product => product.id), approvedProductIds);
  // Un retirado solo conserva su página si fue público.
  assert.deepEqual(getRetiredProducts(catalog, registry).map(product => product.id), publicRetiredIds);
});

test('shortName y summary son opcionales, pero si existen deben ser texto no vacío', () => {
  assert.deepEqual(validateCatalog(minimal({}), registry), []);
  assert.deepEqual(validateCatalog(minimal({ shortName: 'Corto', summary: 'Línea orientativa' }), registry), []);
  for (const key of ['shortName', 'summary']) {
    for (const invalid of ['', '   ', 7, null, ['texto']]) {
      const errors = validateCatalog(minimal({ [key]: invalid }), registry);
      assert.equal(errors.length, 1, `${key}=${JSON.stringify(invalid)}`);
      assert.match(errors[0], new RegExp(`Categoría prueba: ${key} debe ser un texto no vacío`));
    }
  }
});

test('una categoría no admite campos fuera del esquema', () => {
  const errors = validateCatalog(minimal({ destacada: true }), registry);
  assert.deepEqual(errors, ['Categoría prueba: campo no definido (destacada).']);
});

test('el catálogo real no admite fichas con las marcas reservadas a los ejemplos de vista previa', () => {
  const reserved = /reservado para los ejemplos de vista previa/;
  const hasReserved = overrides => validateCatalog(syntheticProduct(overrides), syntheticRegistry).some(error => reserved.test(error));
  assert.equal(hasReserved({}), false);
  assert.equal(hasReserved({ id: 'ejemplo-guante' }), true);
  assert.equal(hasReserved({ model: 'EJ-1001' }), true);
  assert.equal(hasReserved({ model: 'ej-2001' }), true);
  assert.equal(hasReserved({ name: 'Guante de ejemplo recubierto' }), true);
  assert.equal(hasReserved({ variants: [{ id: 'talla-7', label: 'Talla 7', manufacturerCode: 'EJ-1001-7' }] }), true);
  // Palabras parecidas que no son una marca de ejemplo.
  assert.equal(hasReserved({ id: 'ejemplar-001', model: 'EJE-100', name: 'Guante ejemplar' }), false);
});
