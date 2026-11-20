import { listFavorites, setFavorite } from '../src/db/favorites';
import { getAttributes, NO_ATTRIBUTES, setAttributes } from '../src/db/equipmentAttributes';
import { addCustomItem, deleteCustomItem, listCustomItems } from '../src/db/customEquipment';
import { migrate } from '../src/db';
import { clearInventory, ensureEnvironment, getInventory, inventorySummary, markNoEquipment, setItemState } from '../src/db/inventory';
import { createProfile, deleteProfile } from '../src/db/profiles';
import { CATALOG } from '../src/data/equipment';
import { memoryDb } from '../test-utils/sqlite';

async function setup() {
  const db = memoryDb();
  await migrate(db);
  const a = await createProfile(db, { alias: 'Ana' });
  const b = await createProfile(db, { alias: 'Beto' });
  return { db, a, b };
}

it('nada está disponible por defecto: inventario vacío = todo «sin indicar»', async () => {
  const { db, a } = await setup();
  const env = await ensureEnvironment(db, a.id, 'home');
  expect(await getInventory(db, env)).toEqual({});
});

it('ensureEnvironment es idempotente por perfil y tipo', async () => {
  const { db, a, b } = await setup();
  const h1 = await ensureEnvironment(db, a.id, 'home');
  expect(await ensureEnvironment(db, a.id, 'home')).toBe(h1);
  expect(await ensureEnvironment(db, b.id, 'home')).not.toBe(h1);
});

it('dos entornos del mismo perfil y dos perfiles no comparten inventario', async () => {
  const { db, a, b } = await setup();
  const home = await ensureEnvironment(db, a.id, 'home');
  const gym = await ensureEnvironment(db, a.id, 'gym');
  const bHome = await ensureEnvironment(db, b.id, 'home');
  await setItemState(db, home, 'bench_prone', 'available');
  await setItemState(db, gym, 'bench_prone', 'unavailable');
  expect(await getInventory(db, home)).toEqual({ bench_prone: 'available' });
  expect(await getInventory(db, gym)).toEqual({ bench_prone: 'unavailable' });
  expect(await getInventory(db, bHome)).toEqual({});
});

it('distingue «no seleccionado» de «confirmado ausente»; null vuelve a sin indicar', async () => {
  const { db, a } = await setup();
  const env = await ensureEnvironment(db, a.id, 'gym');
  await setItemState(db, env, 'pec_deck_fly', 'unavailable');
  expect((await getInventory(db, env)).pec_deck_fly).toBe('unavailable');
  await setItemState(db, env, 'pec_deck_fly', null);
  expect(await getInventory(db, env)).toEqual({});
});

it('rechaza ids que no están en el catálogo', async () => {
  const { db, a } = await setup();
  const env = await ensureEnvironment(db, a.id, 'home');
  await expect(setItemState(db, env, 'banco_inventado', 'available')).rejects.toThrow();
});

it('«no tengo equipamiento» confirma todo ausente y se puede deshacer', async () => {
  const { db, a } = await setup();
  const env = await ensureEnvironment(db, a.id, 'home');
  await markNoEquipment(db, env);
  const inv = await getInventory(db, env);
  expect(Object.keys(inv)).toHaveLength(CATALOG.length);
  expect(new Set(Object.values(inv))).toEqual(new Set(['unavailable']));
  await clearInventory(db, env);
  expect(await getInventory(db, env)).toEqual({});
});

it('borrar el perfil elimina sus entornos e inventario sin tocar el de otro perfil', async () => {
  const { db, a, b } = await setup();
  const ea = await ensureEnvironment(db, a.id, 'home');
  const eb = await ensureEnvironment(db, b.id, 'home');
  await setItemState(db, ea, 'bench_prone', 'available');
  await setItemState(db, eb, 'bench_prone', 'available');
  await deleteProfile(db, a.id);
  expect(await db.getFirstAsync('SELECT 1 FROM environment_inventory WHERE environment_id = ?', [ea])).toBeNull();
  expect(await getInventory(db, eb)).toEqual({ bench_prone: 'available' });
});

it('inventorySummary cuenta disponibles y no disponibles por entorno', async () => {
  const { db, a, b } = await setup();
  const home = await ensureEnvironment(db, a.id, 'home');
  await ensureEnvironment(db, a.id, 'gym');
  await ensureEnvironment(db, b.id, 'home');
  await setItemState(db, home, 'bench_prone', 'available');
  await setItemState(db, home, 'pec_deck_fly', 'unavailable');
  expect(await inventorySummary(db, a.id)).toEqual([
    { kind: 'home', available: 1, unavailable: 1 },
    { kind: 'gym', available: 0, unavailable: 0 },
  ]);
});

describe('equipo propio', () => {
  it('se valida, es único por nombre y perfil, y el inventario lo acepta solo en entornos del dueño', async () => {
    const { db, a, b } = await setup();
    const item = await addCustomItem(db, a.id, { name: '  Barra olímpica casera ', family: 'free_weights' });
    expect(item.es).toBe('Barra olímpica casera');
    await expect(addCustomItem(db, a.id, { name: 'barra OLÍMPICA casera', family: 'cables' })).rejects.toThrow('Ya tienes');
    await expect(addCustomItem(db, a.id, { name: '   ', family: 'cables' })).rejects.toThrow();
    await expect(addCustomItem(db, a.id, { name: 'X', family: 'nope' })).rejects.toThrow();
    await addCustomItem(db, b.id, { name: 'Barra olímpica casera', family: 'free_weights' }); // otro perfil: permitido

    const envA = await ensureEnvironment(db, a.id, 'home');
    const envB = await ensureEnvironment(db, b.id, 'home');
    await setItemState(db, envA, item.id, 'available');
    expect(await getInventory(db, envA)).toEqual({ [item.id]: 'available' });
    await expect(setItemState(db, envB, item.id, 'available')).rejects.toThrow('desconocido');
    expect(await listCustomItems(db, a.id)).toEqual([item]);
  });

  it('«no tengo equipamiento» incluye lo propio y borrar limpia su estado', async () => {
    const { db, a } = await setup();
    const item = await addCustomItem(db, a.id, { name: 'Anillas', family: 'bodyweight' });
    const env = await ensureEnvironment(db, a.id, 'home');
    await markNoEquipment(db, env);
    expect((await getInventory(db, env))[item.id]).toBe('unavailable');
    await deleteCustomItem(db, a.id, item.id);
    expect((await getInventory(db, env))[item.id]).toBeUndefined();
    expect(await listCustomItems(db, a.id)).toEqual([]);
  });

  it('eliminar el perfil borra su equipo propio', async () => {
    const { db, a } = await setup();
    await addCustomItem(db, a.id, { name: 'Anillas', family: 'bodyweight' });
    await deleteProfile(db, a.id);
    expect(await db.getAllAsync('SELECT 1 FROM custom_equipment')).toEqual([]);
  });
});

describe('atributos de equipo', () => {
  it('se guardan por entorno, se validan y todo vacío borra la fila', async () => {
    const { db, a } = await setup();
    const home = await ensureEnvironment(db, a.id, 'home');
    const gym = await ensureEnvironment(db, a.id, 'gym');
    expect(await getAttributes(db, home, 'bench_flat_fixed')).toEqual(NO_ATTRIBUTES);

    const attrs = { minKg: 2.5, maxKg: 40, stepKg: 2.5, barKg: null, unit: null as 'kg' | 'lb' | null };
    await setAttributes(db, home, 'bench_flat_fixed', attrs);
    expect(await getAttributes(db, home, 'bench_flat_fixed')).toEqual(attrs);
    expect(await getAttributes(db, gym, 'bench_flat_fixed')).toEqual(NO_ATTRIBUTES);

    await expect(setAttributes(db, home, 'bench_flat_fixed', { ...attrs, minKg: 50 })).rejects.toThrow();
    await expect(setAttributes(db, home, 'bench_flat_fixed', { ...attrs, stepKg: 0 })).rejects.toThrow();
    await expect(setAttributes(db, home, 'nope', attrs)).rejects.toThrow('desconocido');
    expect(await getAttributes(db, home, 'bench_flat_fixed')).toEqual(attrs); // lo inválido no pisa lo guardado

    await setAttributes(db, home, 'bench_flat_fixed', NO_ATTRIBUTES);
    expect(await getAttributes(db, home, 'bench_flat_fixed')).toEqual(NO_ATTRIBUTES);
  });

  it('borrar el equipo propio borra sus atributos', async () => {
    const { db, a } = await setup();
    const item = await addCustomItem(db, a.id, { name: 'Anillas', family: 'bodyweight' });
    const env = await ensureEnvironment(db, a.id, 'home');
    await setAttributes(db, env, item.id, { minKg: null, maxKg: 100, stepKg: null, barKg: null });
    await deleteCustomItem(db, a.id, item.id);
    expect(await db.getAllAsync('SELECT 1 FROM equipment_attributes')).toEqual([]);
  });
});

describe('favoritos', () => {
  it('son por perfil, idempotentes y solo de equipo conocido o propio', async () => {
    const { db, a, b } = await setup();
    await setFavorite(db, a.id, 'bench_flat_fixed', true);
    await setFavorite(db, a.id, 'bench_flat_fixed', true);
    expect([...(await listFavorites(db, a.id))]).toEqual(['bench_flat_fixed']);
    expect((await listFavorites(db, b.id)).size).toBe(0);

    await expect(setFavorite(db, a.id, 'nope', true)).rejects.toThrow('desconocido');
    const own = await addCustomItem(db, b.id, { name: 'Anillas', family: 'bodyweight' });
    await expect(setFavorite(db, a.id, own.id, true)).rejects.toThrow('desconocido'); // equipo propio ajeno

    await setFavorite(db, a.id, 'bench_flat_fixed', false);
    await setFavorite(db, a.id, 'bench_flat_fixed', false);
    expect((await listFavorites(db, a.id)).size).toBe(0);
  });

  it('borrar el equipo propio o el perfil quita sus favoritos', async () => {
    const { db, a, b } = await setup();
    const own = await addCustomItem(db, a.id, { name: 'Anillas', family: 'bodyweight' });
    await setFavorite(db, a.id, own.id, true);
    await setFavorite(db, b.id, 'bench_flat_fixed', true);
    await deleteCustomItem(db, a.id, own.id);
    expect((await listFavorites(db, a.id)).size).toBe(0);
    await deleteProfile(db, b.id);
    expect(await db.getAllAsync('SELECT 1 FROM equipment_favorites')).toEqual([]);
  });
});
