import test from 'node:test';
import assert from 'node:assert/strict';
import { crossCheckBrands, MANUFACTURER_LINK_LABELS, validateBrands } from '../src/lib/site-data-core.mjs';
import { normalizeText } from '../src/lib/text.mjs';
import { allKeys, allStrings, loadProjectData } from './helpers.mjs';

const { brands, registry } = await loadProjectData();

// «Marcas que manejamos», en el orden de la empresa.
const ORDER = ['ansell', '3m', 'duramil', 'alto', 'uvex', 'lakeland', 'mcr-safety', 'infra', 'espomega', 'moldex', 'msa', 'herhild', 'dry-pro', 'jyrsa', 'golden-eagle', 'hawk', 'derma-care', 'dupont', 'mr-seguridad'];
// Únicos enlaces aprobados para publicar, en su orden, con sus etiquetas: el catálogo del fabricante en PDF (con la
// edición y el tamaño que se conocen), su catálogo en línea y su sitio. Las demás marcas no llevan enlace.
const PDF = 'Catálogo del fabricante (PDF)';
const ONLINE = 'Catálogo en línea del fabricante';
const SITE = 'Sitio del fabricante';
const LINKS = {
  ansell: [{ label: PDF, url: 'https://www.ansell.com/-/media/projects/ansell/website/pdf/industrial/catalogo-general.ashx?hash=89416386AB73E1C18D8D4B0D69061569&rev=fe1daef904d74a5baabf722c6ac075e0', edition: '2023' }, { label: SITE, url: 'https://www.ansell.com/mx/es/industrial' }],
  '3m': [{ label: ONLINE, url: 'https://www.3m.com.mx/3M/es_MX/p/c/epp/i/seguridad/seguridad-personal/' }],
  duramil: [{ label: ONLINE, url: 'https://duramil.com.mx/catalogo/' }],
  alto: [{ label: SITE, url: 'https://ecommerce.alturasegura.com.mx/' }],
  uvex: [{ label: ONLINE, url: 'https://automation.honeywell.com/mx/es/products/personal-protective-equipment/eye-protection' }],
  lakeland: [{ label: ONLINE, url: 'https://www.lakeland.com/es-la/product-catalogs/' }],
  'mcr-safety': [{ label: PDF, url: 'https://www.mcrsafety.com.mx/content/Guides/Mexico/catalogo-de-productos-mcr.pdf' }, { label: SITE, url: 'https://www.mcrsafety.com.mx/' }],
  infra: [{ label: SITE, url: 'https://grupoinfra.com/librerias-y-descargas' }],
  moldex: [{ label: PDF, url: 'https://www.moldex.com/wp-content/uploads/Moldex-Catalog-ESP.pdf' }, { label: ONLINE, url: 'https://www.moldex.com/es/resources/marketing-sales-resources/literatura-downloads/' }],
  msa: [{ label: ONLINE, url: 'https://mx.msasafety.com/digital-catalogs?locale=es' }],
  herhild: [{ label: PDF, url: 'https://herhild.com/wp-content/uploads/2025/11/Catalogo-HH-Digital-2026v2.pdf' }, { label: ONLINE, url: 'https://herhild.com/productos/' }],
  jyrsa: [{ label: ONLINE, url: 'https://jyrsa.com/catalogo/' }],
  'golden-eagle': [{ label: PDF, url: 'https://www.goldeneagle.com.mx/folder/catalogoGE.pdf', megabytes: 50 }, { label: ONLINE, url: 'https://www.goldeneagle.com.mx/categorias/' }],
  'derma-care': [{ label: ONLINE, url: 'https://dermacare.mx/productos/' }],
  dupont: [{ label: ONLINE, url: 'https://www.safespec.dupont.mx/tyvek/featured-products.html' }, { label: SITE, url: 'https://www.dupont.mx/personal-protective-equipment.html' }],
  'mr-seguridad': [{ label: PDF, url: 'https://drive.google.com/file/d/1IeQneb8omgWD7EAb8G8WCf2MvJMB4EEp/view?usp=sharing', edition: '2026 v1.1' }, { label: SITE, url: 'https://mrseguridad.com/' }],
};
const WITHOUT_LINK = ['espomega', 'dry-pro', 'hawk'];
const LINK_URLS = Object.values(LINKS).flat().map(link => link.url);
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

test('los enlaces publicados son exactamente los aprobados, en su orden y con sus etiquetas', () => {
  const published = Object.fromEntries(brands.filter(brand => brand.manufacturerLinks.length > 0).map(brand => [brand.id, brand.manufacturerLinks]));
  assert.deepEqual(published, LINKS);
  assert.deepEqual(brands.filter(brand => brand.manufacturerLinks.length === 0).map(brand => brand.id), WITHOUT_LINK);
  assert.deepEqual(MANUFACTURER_LINK_LABELS, { pdf: PDF, online: ONLINE, site: SITE });
  // Las marcas cuya dirección de catálogo no se pudo abrir el 23 de noviembre de 2026 no publican ese catálogo.
  for (const id of ['infra', 'espomega', 'hawk']) assert.ok(!brands.find(brand => brand.id === id).manufacturerLinks.some(link => link.label !== SITE), id);
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

test('del registro no se copia nada más: solo id, nombre, tipo y los enlaces aprobados', () => {
  assert.deepEqual([...new Set(allKeys(brands))].sort(), ['edition', 'id', 'kind', 'label', 'manufacturerLinks', 'megabytes', 'name', 'url']);
  for (const brand of brands) assert.deepEqual(Object.keys(brand), ['id', 'name', 'kind', 'manufacturerLinks']);
  const allowed = new Set([...ORDER, ...registry.sources.map(source => source.name), 'brand', 'supplier', PDF, ONLINE, SITE, ...LINK_URLS, '2023', '2026 v1.1']);
  for (const text of allStrings(brands)) assert.ok(allowed.has(text), `texto inesperado en brands.json: ${text}`);
  // Ninguna nota, etiqueta, estado ni otro enlace del registro aparece en el archivo público.
  const file = JSON.stringify(brands);
  for (const source of registry.sources) {
    for (const key of ['scope', 'source_status', 'recommended_ingestion', 'publication_policy', 'next_action', 'checked_on']) {
      assert.ok(!file.includes(JSON.stringify(source[key])), `${source.entity_id}.${key}`);
    }
    for (const resource of source.resources) {
      if (!LINK_URLS.includes(resource.url)) assert.ok(!file.includes(JSON.stringify(resource.url)), `${source.entity_id}: ${resource.url}`);
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
  assert.match(crossCheckBrands(withBrand('hawk', brand => { brand.manufacturerLinks = link(LINKS.ansell[1].url); }), registry).join('\n'), /hawk: el enlace .* no es un recurso de esa entidad/);
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

test('el enlace de una marca es una dirección https escrita completa', () => {
  const invalid = url => validateBrands(withBrand('ansell', brand => { brand.manufacturerLinks[1].url = url; }));
  for (const url of ['https:/www.ansell.com/mx/', 'https:www.ansell.com/mx/', ' https://www.ansell.com/mx/', 'https://www.ansell.com/mx/\n', 'https://www.an\nsell.com/mx/', 'https://www.ansell.com/mx es/', 'https:\\\\www.ansell.com\\mx', 'https://www.ansell.com\\mx', 'https:///mx/']) {
    assert.match(invalid(url).join('\n'), /URL https/, JSON.stringify(url));
  }
  // Una dirección honesta pasa, también con acentos o sin diagonal final.
  for (const url of ['https://www.ansell.com/mx/es/industrial', 'https://www.ansell.com', 'https://ejemplo.invalid/catálogo/protección', 'https://www.ansell.com:443/mx/?q=guante#ficha']) {
    assert.deepEqual(invalid(url), [], url);
  }
});

test('validateBrands exige la estructura exacta: hasta tres enlaces, etiquetas conocidas en su orden y https', () => {
  const invalid = change => validateBrands(withBrand('ansell', change));
  assert.match(invalid(brand => { brand.manufacturerLinks[0].label = 'Catálogo'; }).join('\n'), /«Catálogo» no es una etiqueta de enlace; usa una de estas tres/);
  assert.match(invalid(brand => { delete brand.manufacturerLinks[0].label; }).join('\n'), /falta la etiqueta/);
  assert.match(invalid(brand => { brand.manufacturerLinks[0].url = 'http://www.ansell.com/mx/es/industrial'; }).join('\n'), /URL https/);
  assert.match(invalid(brand => { brand.manufacturerLinks[1].verification = 'accesible'; }).join('\n'), /manufacturerLinks\[1\]\.verification: campo no definido/);
  assert.match(invalid(brand => { brand.manufacturerLinks[0] = 'https://www.ansell.com/'; }).join('\n'), /manufacturerLinks\[0\]: debe ser un objeto con label y url/);
  assert.match(invalid(brand => { brand.next_action = 'nota interna'; }).join('\n'), /next_action: campo no definido/);
  assert.match(invalid(brand => { brand.kind = 'marca'; }).join('\n'), /kind debe ser/);
  assert.match(invalid(brand => { brand.id = 'Ansell'; }).join('\n'), /id inválido o duplicado/);
  assert.match(invalid(brand => { brand.id = '3m'; }).join('\n'), /id inválido o duplicado/);
  assert.match(invalid(brand => { brand.name = ' '; }).join('\n'), /falta nombre/);
  assert.match(invalid(brand => { delete brand.manufacturerLinks; }).join('\n'), /manufacturerLinks debe ser una lista/);
  assert.deepEqual(validateBrands({}), ['brands: debe ser una lista con al menos una marca.']);
  assert.deepEqual(validateBrands([]), ['brands: debe ser una lista con al menos una marca.']);
});

// Tres enlaces de prueba de una marca ficticia, uno por etiqueta y en su orden.
const three = () => [
  { label: PDF, url: 'https://fabricante.invalid/catalogo.pdf', edition: '2026 v2', megabytes: 49 },
  { label: ONLINE, url: 'https://fabricante.invalid/catalogos/' },
  { label: SITE, url: 'https://fabricante.invalid/' },
];
const withLinks = links => validateBrands(withBrand('ansell', brand => { brand.manufacturerLinks = links; }));

test('una marca lleva de cero a tres enlaces, uno por etiqueta y en el orden PDF, en línea y sitio', () => {
  assert.deepEqual(withLinks([]), []);
  assert.deepEqual(withLinks(three()), []);
  for (const i of [0, 1, 2]) assert.deepEqual(withLinks([three()[i]]), [], `solo el enlace ${i}`);
  assert.deepEqual(withLinks([three()[0], three()[2]]), []);
  // Cuatro enlaces: el mensaje dice cuántos admite y en qué orden.
  assert.deepEqual(withLinks([...three(), { label: SITE, url: 'https://fabricante.invalid/otro/' }]),
    [`brands[0] (ansell): manufacturerLinks admite como máximo tres enlaces, uno por etiqueta: «${PDF}», «${ONLINE}» y «${SITE}», en ese orden.`]);
  // Una etiqueta repetida.
  assert.match(withLinks([three()[1], { label: ONLINE, url: 'https://fabricante.invalid/otro/' }]).join('\n'),
    /manufacturerLinks\[1\]\.label: la etiqueta «Catálogo en línea del fabricante» ya está en otro enlace de la marca; cada etiqueta va una vez\./);
  // El orden equivocado.
  for (const links of [[three()[1], three()[0]], [three()[2], three()[1]], [three()[2], three()[0]]]) {
    assert.deepEqual(withLinks(links), [`brands[0] (ansell): los enlaces van en este orden: «${PDF}», «${ONLINE}» y «${SITE}»; ordénalos así.`]);
  }
  // La misma dirección dos veces, aunque con otra etiqueta.
  assert.match(withLinks([three()[1], { label: SITE, url: three()[1].url }]).join('\n'),
    /manufacturerLinks\[1\]\.url: la dirección https:\/\/fabricante\.invalid\/catalogos\/ ya está en otro enlace de la marca; cada dirección va una vez\./);
});

test('solo el PDF lleva la edición (de 1 a 24 caracteres, en una línea) y el tamaño (entero de 1 a 999 MB)', () => {
  const pdf = details => withLinks([{ label: PDF, url: 'https://fabricante.invalid/catalogo.pdf', ...details }]);
  const edition = /manufacturerLinks\[0\]\.edition: debe ser un texto de una línea, de 1 a 24 caracteres, como lo imprime el fabricante/;
  const megabytes = /manufacturerLinks\[0\]\.megabytes: debe ser un número entero de 1 a 999: lo que pesa el archivo en megabytes/;
  for (const value of ['2026', 'x'.repeat(24), 'Edición 2026 versión 2.1']) assert.deepEqual(pdf({ edition: value }), [], value);
  for (const value of ['', ' ', 'x'.repeat(25), '2026\nv2', '2026  v2', ' 2026', '2026\u200b', 2026, null]) assert.match(pdf({ edition: value }).join('\n'), edition, JSON.stringify(value));
  for (const value of [1, 49, 999]) assert.deepEqual(pdf({ megabytes: value }), [], String(value));
  for (const value of [0, 1000, 49.7, -3, '49', '49 MB', null]) assert.match(pdf({ megabytes: value }).join('\n'), megabytes, JSON.stringify(value));
  // En otro enlace, la edición y el tamaño no van.
  for (const [label, url] of [[ONLINE, 'https://fabricante.invalid/catalogos/'], [SITE, 'https://fabricante.invalid/']]) {
    assert.deepEqual(withLinks([{ label, url, edition: '2026' }]), [`brands[0] (ansell).manufacturerLinks[0].edition: solo el enlace «${PDF}» lleva la edición; quítalo de este.`]);
    assert.deepEqual(withLinks([{ label, url, megabytes: 3 }]), [`brands[0] (ansell).manufacturerLinks[0].megabytes: solo el enlace «${PDF}» lleva el tamaño en megabytes; quítalo de este.`]);
  }
});

test('crossCheckBrands acepta en cada etiqueta solo los tipos de recurso del registro que le corresponden', () => {
  const ADMITTED = { [PDF]: ['pdf', 'pdf_viewer'], [ONLINE]: ['web', 'landing', 'catalog_platform'] };
  let checked = 0;
  for (const source of registry.sources) {
    for (const resource of source.resources) {
      if (!resource.verification.startsWith('accesible') || BLOCKED_TYPES.includes(resource.type)) continue;
      for (const label of [PDF, ONLINE, SITE]) {
        const errors = crossCheckBrands(withBrand(source.entity_id, brand => { brand.manufacturerLinks = [{ label, url: resource.url }]; }), registry);
        const fits = label === SITE || ADMITTED[label].includes(resource.type);
        assert.equal(errors.length === 0, fits, `${source.entity_id}: ${label} → ${resource.type}`);
        if (!fits) {
          assert.match(errors.join('\n'), new RegExp(`^${source.entity_id}: el enlace .* lleva la etiqueta «${label.replace(/[()]/g, '\\$&')}», pero en el registro es de tipo «${resource.type}»; esa etiqueta es solo para `));
          checked += 1;
        }
      }
    }
  }
  assert.ok(checked >= 20, 'el registro debe tener recursos de varios tipos para que esta prueba tenga sentido');
  // El mensaje del brief, con el caso de una página de catálogo etiquetada como PDF.
  const landing = sourceOf('herhild').resources.find(resource => resource.type === 'landing');
  assert.deepEqual(crossCheckBrands(withBrand('herhild', brand => { brand.manufacturerLinks = [{ label: PDF, url: landing.url }]; }), registry), [
    `herhild: el enlace ${landing.url} lleva la etiqueta «${PDF}», pero en el registro es de tipo «landing»; esa etiqueta es solo para un PDF (tipo pdf o pdf_viewer). Cambia la etiqueta o enlaza otro recurso de la marca.`,
  ]);
  // La página de un solo producto no es un catálogo, aunque esté verificada como accesible; la política de uso de las
  // imágenes tampoco (y no se enlaza: no está verificada como accesible).
  const product = sourceOf('uvex').resources.find(resource => resource.type === 'product_page');
  assert.ok(product.verification.startsWith('accesible'));
  assert.match(crossCheckBrands(withBrand('uvex', brand => { brand.manufacturerLinks = [{ label: ONLINE, url: product.url }]; }), registry).join('\n'), /esa etiqueta es solo para la página donde se consulta o se descarga el catálogo/);
  const policy = sourceOf('mcr-safety').resources.find(resource => resource.type === 'usage_policy');
  for (const label of [PDF, ONLINE]) assert.notDeepEqual(crossCheckBrands(withBrand('mcr-safety', brand => { brand.manufacturerLinks = [{ label, url: policy.url }]; }), registry), []);
});

test('crossCheckBrands rechaza los catálogos que no se pudieron abrir y la lista de guías que nombra a la marca excluida', () => {
  // INFRA, Espomega y HAWK tienen en el registro una dirección de catálogo sin comprobar o detrás de un formulario.
  for (const [id, type] of [['infra', 'pdf'], ['espomega', 'pdf'], ['hawk', 'web'], ['hawk', 'gated_landing']]) {
    const resource = sourceOf(id).resources.find(candidate => candidate.type === type);
    const label = type === 'pdf' ? PDF : ONLINE;
    assert.match(crossCheckBrands(withBrand(id, brand => { brand.manufacturerLinks = [{ label, url: resource.url }]; }), registry).join('\n'), new RegExp(`${id}: el enlace .* no está verificado como accesible`), `${id} ${type}`);
  }
  // La lista de guías de MCR Safety nunca se enlaza.
  const guides = sourceOf('mcr-safety').resources.find(resource => /guias-de-recursos\/$/.test(resource.url));
  for (const label of [ONLINE, SITE]) {
    assert.match(crossCheckBrands(withBrand('mcr-safety', brand => { brand.manufacturerLinks = [{ label, url: guides.url }]; }), registry).join('\n'), /mcr-safety: el enlace .* no está verificado como accesible/);
  }
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
