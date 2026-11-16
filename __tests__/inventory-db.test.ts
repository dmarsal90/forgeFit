import { migrate } from '../src/db';
import { clearInventory, ensureEnvironment, getInventory, markNoEquipment, setItemState } from '../src/db/inventory';
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
