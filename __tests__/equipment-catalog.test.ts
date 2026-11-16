import { CATALOG, FAMILIES, searchCatalog } from '../src/data/equipment';

it('ids únicos y estables (snake_case) y nombres ES/EN presentes', () => {
  const ids = CATALOG.map((i) => i.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const i of CATALOG) {
    expect(i.id).toMatch(/^[a-z0-9_]+$/);
    expect(i.es.length).toBeGreaterThan(2);
    expect(i.en.length).toBeGreaterThan(2);
  }
});

it('cada familia tiene ítems y cada ítem pertenece a una familia existente', () => {
  const fams = new Set(FAMILIES.map((f) => f.id));
  expect(new Set(CATALOG.map((i) => i.family))).toEqual(fams);
});

it('el catálogo es exhaustivo (cientos de ítems)', () => {
  expect(CATALOG.length).toBeGreaterThan(250);
});

it('los bancos son variantes separadas, no un «banco» genérico', () => {
  const benches = searchCatalog('banco').map((i) => i.id);
  for (const id of ['bench_flat_fixed', 'bench_adjustable', 'bench_incline_fixed', 'bench_decline', 'bench_prone', 'bench_flat_rack']) {
    expect(benches).toContain(id);
  }
  expect(CATALOG.find((i) => i.id === 'bench')).toBeUndefined();
});

it('pec deck y pec deck inverso son ítems distintos en familias distintas', () => {
  const fly = CATALOG.find((i) => i.id === 'pec_deck_fly');
  const rear = CATALOG.find((i) => i.id === 'rear_delt_fly');
  expect([fly?.family, rear?.family]).toEqual(['chest', 'shoulders']);
});

it('la búsqueda ignora acentos y mayúsculas, usa aliases ES/EN y filtra por familia', () => {
  expect(searchCatalog('PRENSA 45').some((i) => i.id === 'leg_press_45_plate')).toBe(true);
  expect(searchCatalog('lat pulldown').some((i) => i.family === 'back')).toBe(true);
  expect(searchCatalog('pesas rusas').some((i) => i.id === 'kettlebell_cast_iron')).toBe(true);
  expect(searchCatalog('banco', 'chest').every((i) => i.family === 'chest')).toBe(true);
  expect(searchCatalog('zzzz')).toEqual([]);
  expect(searchCatalog('')).toHaveLength(CATALOG.length);
});
