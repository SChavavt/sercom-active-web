import test from 'node:test';
import assert from 'node:assert/strict';
import { crossCheckBrands, MANUFACTURER_LINK_LABEL, validateBrands } from '../src/lib/site-data-core.mjs';
import { normalizeText } from '../src/lib/text.mjs';
import { allKeys, allStrings, loadProjectData } from './helpers.mjs';

const { brands, registry } = await loadProjectData();

// «Marcas que manejamos», en el orden de la empresa.
const ORDER = ['ansell', '3m', 'duramil', 'alto', 'uvex', 'lakeland', 'mcr-safety', 'infra', 'espomega', 'moldex', 'msa', 'herhild', 'dry-pro', 'jyrsa', 'golden-eagle', 'hawk', 'derma-care', 'dupont', 'mr-seguridad'];
// Únicos enlaces aprobados para publicar. Las demás marcas no llevan enlace.
const LINKS = {
  ansell: 'https://www.ansell.com/mx/es/industrial',
  '3m': 'https://www.3m.com.mx/3M/es_MX/p/c/epp/i/seguridad/seguridad-personal/',
  duramil: 'https://duramil.com.mx/catalogo/',
  alto: 'https://ecommerce.alturasegura.com.mx/',
  lakeland: 'https://www.lakeland.com/es-la/product-catalogs/',
  'mcr-safety': 'https://www.mcrsafety.com.mx/',
  infra: 'https://grupoinfra.com/librerias-y-descargas',
  moldex: 'https://www.moldex.com/es/resources/marketing-sales-resources/literatura-downloads/',
  herhild: 'https://herhild.com/catalogo/',
  jyrsa: 'https://jyrsa.com/catalogo/',
  'golden-eagle': 'https://www.goldeneagle.com.mx/producto/',
  'derma-care': 'https://dermacare.mx/',
  dupont: 'https://www.dupont.mx/personal-protective-equipment.html',
  'mr-seguridad': 'https://mrseguridad.com/',
};
const WITHOUT_LINK = ['uvex', 'espomega', 'msa', 'dry-pro', 'hawk'];
const BLOCKED_TYPES = ['deprecated', 'unverified_current', 'gated_landing'];

const sourceOf = id => registry.sources.find(source => source.entity_id === id);
const copy = () => structuredClone(brands);
const withBrand = (id, change) => {
  const list = copy();
  change(list.find(brand => brand.id === id), list);
  return list;
};

test('brands.json lista las diecinueve marcas en el orden acordado', () => {
  assert.equal(brands.length, 19);
  assert.deepEqual(brands.map(brand => brand.id), ORDER);
});

test('cada marca coincide con el registro de investigación: mismo id, nombre y tipo', () => {
  assert.deepEqual(brands.map(brand => brand.id).sort(), registry.sources.map(source => source.entity_id).sort());
  for (const brand of brands) {
    const source = sourceOf(brand.id);
    assert.equal(brand.name, source.name, brand.id);
    assert.equal(brand.kind, source.entity_type, brand.id);
    assert.ok(['brand', 'supplier'].includes(brand.kind), brand.id);
  }
  // Espomega es un proveedor, no una marca.
  assert.deepEqual(brands.filter(brand => brand.kind === 'supplier').map(brand => brand.id), ['espomega']);
});

test('los enlaces publicados son exactamente los catorce aprobados, uno por marca y con la etiqueta única', () => {
  const published = Object.fromEntries(brands.filter(brand => brand.manufacturerLinks.length > 0).map(brand => [brand.id, brand.manufacturerLinks[0].url]));
  assert.deepEqual(published, LINKS);
  assert.deepEqual(brands.filter(brand => brand.manufacturerLinks.length === 0).map(brand => brand.id), WITHOUT_LINK);
  for (const brand of brands) {
    assert.ok(brand.manufacturerLinks.length <= 1, brand.id);
    for (const link of brand.manufacturerLinks) {
      assert.deepEqual(Object.keys(link).sort(), ['label', 'url'], brand.id);
      assert.equal(link.label, 'Sitio del fabricante', brand.id);
    }
  }
  assert.equal(MANUFACTURER_LINK_LABEL, 'Sitio del fabricante');
});

test('cada enlace es un recurso de esa marca en el registro, verificado como accesible y de un tipo publicable', () => {
  for (const brand of brands) {
    for (const link of brand.manufacturerLinks) {
      const resource = sourceOf(brand.id).resources.find(candidate => candidate.url === link.url);
      assert.ok(resource, `${brand.id}: ${link.url} no es un recurso del registro`);
      assert.ok(resource.verification.startsWith('accesible'), `${brand.id}: ${resource.verification}`);
      assert.ok(!BLOCKED_TYPES.includes(resource.type), `${brand.id}: tipo ${resource.type}`);
      assert.equal(new URL(link.url).protocol, 'https:', brand.id);
    }
  }
});

test('del registro no se copia nada más: solo id, nombre, tipo y el enlace aprobado', () => {
  assert.deepEqual([...new Set(allKeys(brands))].sort(), ['id', 'kind', 'label', 'manufacturerLinks', 'name', 'url']);
  for (const brand of brands) assert.deepEqual(Object.keys(brand), ['id', 'name', 'kind', 'manufacturerLinks']);
  const allowed = new Set([...ORDER, ...registry.sources.map(source => source.name), 'brand', 'supplier', 'Sitio del fabricante', ...Object.values(LINKS)]);
  for (const text of allStrings(brands)) assert.ok(allowed.has(text), `texto inesperado en brands.json: ${text}`);
  // Ninguna nota, etiqueta, estado ni otro enlace del registro aparece en el archivo público.
  const file = JSON.stringify(brands);
  for (const source of registry.sources) {
    for (const key of ['scope', 'source_status', 'recommended_ingestion', 'publication_policy', 'next_action', 'checked_on']) {
      assert.ok(!file.includes(JSON.stringify(source[key])), `${source.entity_id}.${key}`);
    }
    for (const resource of source.resources) {
      if (!Object.values(LINKS).includes(resource.url)) assert.ok(!file.includes(resource.url), `${source.entity_id}: ${resource.url}`);
      assert.ok(!file.includes(JSON.stringify(resource.label)), `${source.entity_id}: ${resource.label}`);
    }
  }
});

test('ninguna entidad excluida del alcance está en la lista pública', () => {
  const excluded = registry.scope.excluded_entities;
  assert.ok(Array.isArray(excluded) && excluded.length > 0);
  const text = normalizeText(allStrings(brands).join(' ').replaceAll('-', ' '));
  for (const entity of excluded) assert.ok(!new RegExp(`\\b${normalizeText(entity)}\\b`).test(text), 'entidad excluida en brands.json');
});

test('crossCheckBrands acepta el archivo real', () => {
  assert.deepEqual(validateBrands(brands), []);
  assert.deepEqual(crossCheckBrands(brands, registry), []);
});

test('crossCheckBrands detecta diferencias de id, nombre y tipo con el registro', () => {
  assert.match(crossCheckBrands(withBrand('ansell', brand => { brand.name = 'ANSELL'; }), registry).join('\n'), /ansell: el nombre «ANSELL» no coincide/);
  assert.match(crossCheckBrands(withBrand('espomega', brand => { brand.kind = 'brand'; }), registry).join('\n'), /espomega: kind «brand» no coincide/);
  assert.match(crossCheckBrands(copy().filter(brand => brand.id !== 'hawk'), registry).join('\n'), /registro: hawk falta en brands\.json/);
  const extra = [...copy(), { id: 'marca-nueva', name: 'Marca nueva', kind: 'brand', manufacturerLinks: [] }];
  assert.match(crossCheckBrands(extra, registry).join('\n'), /marca-nueva: no existe en el registro/);
  assert.deepEqual(crossCheckBrands(brands, { sources: [] }), ['registro: no contiene entidades.']);
});

test('crossCheckBrands rechaza enlaces que no son un recurso accesible y publicable del registro', () => {
  const link = url => [{ label: 'Sitio del fabricante', url }];
  // Un enlace que no está en el registro.
  assert.match(crossCheckBrands(withBrand('uvex', brand => { brand.manufacturerLinks = link('https://example.invalid/'); }), registry).join('\n'), /uvex: el enlace .* no es un recurso de esa entidad/);
  // El recurso de otra marca.
  assert.match(crossCheckBrands(withBrand('hawk', brand => { brand.manufacturerLinks = link(LINKS.ansell); }), registry).join('\n'), /hawk: el enlace .* no es un recurso de esa entidad/);
  // Recursos del registro que no están verificados como accesibles o cuyo tipo no se publica.
  let checked = 0;
  for (const source of registry.sources) {
    for (const resource of source.resources) {
      const publishable = resource.verification.startsWith('accesible') && !BLOCKED_TYPES.includes(resource.type);
      const errors = crossCheckBrands(withBrand(source.entity_id, brand => { brand.manufacturerLinks = link(resource.url); }), registry);
      assert.equal(errors.length === 0, publishable, `${source.entity_id}: ${resource.type} / ${resource.verification}`);
      if (!publishable) {
        assert.match(errors.join('\n'), /no está verificado como accesible/);
        checked += 1;
      }
    }
  }
  assert.ok(checked >= 10, 'el registro debe tener recursos no publicables para que esta prueba tenga sentido');
  // Al menos uno de los rechazados dice «accesible» pero su tipo está bloqueado.
  assert.ok(registry.sources.some(source => source.resources.some(resource => resource.verification.startsWith('accesible') && BLOCKED_TYPES.includes(resource.type))));
});

test('validateBrands exige la estructura exacta: un enlace como máximo, etiqueta única y https', () => {
  const invalid = change => validateBrands(withBrand('ansell', change));
  assert.match(invalid(brand => { brand.manufacturerLinks.push({ label: 'Sitio del fabricante', url: 'https://example.invalid/' }); }).join('\n'), /un enlace como máximo/);
  assert.match(invalid(brand => { brand.manufacturerLinks[0].label = 'Catálogo'; }).join('\n'), /etiqueta «Sitio del fabricante»/);
  assert.match(invalid(brand => { brand.manufacturerLinks[0].url = 'http://www.ansell.com/mx/es/industrial'; }).join('\n'), /URL https/);
  assert.match(invalid(brand => { brand.manufacturerLinks[0].verification = 'accesible'; }).join('\n'), /etiqueta «Sitio del fabricante»/);
  assert.match(invalid(brand => { brand.next_action = 'nota interna'; }).join('\n'), /next_action: campo no definido/);
  assert.match(invalid(brand => { brand.kind = 'marca'; }).join('\n'), /kind debe ser/);
  assert.match(invalid(brand => { brand.id = 'Ansell'; }).join('\n'), /id inválido o duplicado/);
  assert.match(invalid(brand => { brand.id = '3m'; }).join('\n'), /id inválido o duplicado/);
  assert.match(invalid(brand => { brand.name = ' '; }).join('\n'), /falta nombre/);
  assert.match(invalid(brand => { delete brand.manufacturerLinks; }).join('\n'), /manufacturerLinks debe ser una lista/);
  assert.deepEqual(validateBrands({}), ['brands: debe ser una lista con al menos una marca.']);
  assert.deepEqual(validateBrands([]), ['brands: debe ser una lista con al menos una marca.']);
});

test('una entidad excluida no puede entrar aunque alguien la agregue a los dos archivos', () => {
  for (const entity of registry.scope.excluded_entities) {
    const id = normalizeText(entity).replaceAll(' ', '-');
    const list = [...copy(), { id, name: entity, kind: 'brand', manufacturerLinks: [] }];
    const tampered = { ...registry, sources: [...registry.sources, { entity_id: id, name: entity, entity_type: 'brand', resources: [] }] };
    assert.match(validateBrands(list).join('\n'), /marca excluida/);
    assert.match(crossCheckBrands(list, tampered).join('\n'), /marca excluida/);
  }
});
