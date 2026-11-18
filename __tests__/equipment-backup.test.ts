import { migrate } from '../src/db';
import { addCustomItem, listCustomItems } from '../src/db/customEquipment';
import { exportEquipment, importEquipment, MAX_BACKUP_CHARS } from '../src/db/equipmentBackup';
import { getAttributes, setAttributes } from '../src/db/equipmentAttributes';
import { listFavorites, setFavorite } from '../src/db/favorites';
import { ensureEnvironment, getInventory, setItemState } from '../src/db/inventory';
import { createProfile } from '../src/db/profiles';
import { memoryDb } from '../test-utils/sqlite';

async function seed() {
  const db = memoryDb();
  await migrate(db);
  const a = await createProfile(db, { alias: 'Ana' });
  const b = await createProfile(db, { alias: 'Beto' });
  const home = await ensureEnvironment(db, a.id, 'home');
  const gym = await ensureEnvironment(db, a.id, 'gym');
  const rings = await addCustomItem(db, a.id, { name: 'Anillas', family: 'bodyweight' });
  await setItemState(db, home, 'bench_flat_fixed', 'available');
  await setItemState(db, home, rings.id, 'available');
  await setItemState(db, gym, 'bench_flat_fixed', 'unavailable');
  await setAttributes(db, home, 'bench_flat_fixed', { minKg: 2.5, maxKg: 40, stepKg: 2.5, barKg: null });
  await setFavorite(db, a.id, rings.id, true);
  await setFavorite(db, a.id, 'bench_flat_fixed', true);
  return { db, a, b, home, gym, rings };
}

const names = async (db: Parameters<typeof listCustomItems>[0], pid: string, ids: Iterable<string>) => {
  const all = new Map((await listCustomItems(db, pid)).map((i) => [i.id, i.es]));
  return [...ids].map((id) => all.get(id) ?? id).sort();
};

it('ida y vuelta a otro perfil: el equipo propio se reasigna y todo lo demás se conserva', async () => {
  const { db, a, b, home } = await seed();
  const text = JSON.stringify(await exportEquipment(db, a.id));
  const r = await importEquipment(db, b.id, text);
  expect(r).toEqual({ ok: true, custom: 1, items: 3, attributes: 1, favorites: 2 });

  const bHome = await ensureEnvironment(db, b.id, 'home');
  const bGym = await ensureEnvironment(db, b.id, 'gym');
  expect(await names(db, b.id, Object.keys(await getInventory(db, bHome)))).toEqual(['Anillas', 'bench_flat_fixed']);
  expect(await getInventory(db, bGym)).toEqual({ bench_flat_fixed: 'unavailable' });
  expect(await getAttributes(db, bHome, 'bench_flat_fixed')).toEqual({ minKg: 2.5, maxKg: 40, stepKg: 2.5, barKg: null });
  expect(await names(db, b.id, await listFavorites(db, b.id))).toEqual(['Anillas', 'bench_flat_fixed']);
  // el perfil de origen no cambia y los ids propios son distintos
  expect((await listCustomItems(db, a.id))[0].id).not.toBe((await listCustomItems(db, b.id))[0].id);
  expect(Object.keys(await getInventory(db, home)).length).toBe(2);
});

it('importar dos veces no duplica nada', async () => {
  const { db, a, b } = await seed();
  const text = JSON.stringify(await exportEquipment(db, a.id));
  await importEquipment(db, b.id, text);
  const before = JSON.stringify(await exportEquipment(db, b.id));
  expect(await importEquipment(db, b.id, text)).toMatchObject({ ok: true, custom: 0 });
  expect(JSON.stringify(await exportEquipment(db, b.id))).toBe(before);
});

it('importar en el mismo perfil reutiliza su equipo propio (por nombre) y no borra lo que ya había', async () => {
  const { db, a, home } = await seed();
  await setItemState(db, home, 'bench_decline', 'available');
  await importEquipment(db, a.id, JSON.stringify(await exportEquipment(db, a.id)));
  expect((await listCustomItems(db, a.id)).length).toBe(1);
  expect((await getInventory(db, home)).bench_decline).toBe('available');
});

it.each([
  ['no es JSON', '{nope'],
  ['versión distinta', JSON.stringify({ schemaVersion: 2, custom: [], favorites: [], environments: [] })],
  ['equipo desconocido', JSON.stringify({ schemaVersion: 1, custom: [], favorites: [], environments: [{ kind: 'home', items: { nope: 'available' }, attributes: {} }] })],
  ['estado inválido', JSON.stringify({ schemaVersion: 1, custom: [], favorites: [], environments: [{ kind: 'home', items: { bench_flat_fixed: 'maybe' }, attributes: {} }] })],
  ['atributos incoherentes', JSON.stringify({ schemaVersion: 1, custom: [], favorites: [], environments: [{ kind: 'home', items: {}, attributes: { bench_flat_fixed: { minKg: 9, maxKg: 1, stepKg: null, barKg: null } } }] })],
  ['entorno repetido', JSON.stringify({ schemaVersion: 1, custom: [], favorites: [], environments: [{ kind: 'home', items: {}, attributes: {} }, { kind: 'home', items: {}, attributes: {} }] })],
  ['equipo propio sin definir', JSON.stringify({ schemaVersion: 1, custom: [], favorites: ['user_' + 'a'.repeat(32)], environments: [] })],
  ['demasiado grande', 'x'.repeat(MAX_BACKUP_CHARS + 1)],
])('rechaza una copia inválida y no escribe nada: %s', async (_name, text) => {
  const { db, b } = await seed();
  const before = JSON.stringify(await exportEquipment(db, b.id));
  expect((await importEquipment(db, b.id, text)).ok).toBe(false);
  expect(JSON.stringify(await exportEquipment(db, b.id))).toBe(before);
});

it('un fallo real a mitad de la importación revierte todo lo ya escrito', async () => {
  const { db, a, b } = await seed();
  const text = JSON.stringify(await exportEquipment(db, a.id));
  await db.execAsync('DROP TABLE equipment_attributes'); // el equipo propio y el inventario se escriben antes de llegar aquí
  expect(await importEquipment(db, b.id, text)).toEqual({ ok: false, error: 'No se pudo importar. No se cambió nada.' });
  expect(await listCustomItems(db, b.id)).toEqual([]);
  expect(await db.getAllAsync('SELECT 1 FROM environment_inventory WHERE environment_id IN (SELECT id FROM training_environments WHERE profile_id = ?)', [b.id])).toEqual([]);
});
