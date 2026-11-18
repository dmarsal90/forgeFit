import { migrate } from '../src/db';
import {
  setWeightUnit,
  archiveProfile, countProfiles, createProfile, deleteProfile, getActiveProfile, listProfiles, setActiveProfile,
} from '../src/db/profiles';
import { memoryDb } from '../test-utils/sqlite';

async function fresh() {
  const db = memoryDb();
  await migrate(db);
  return db;
}

it('instalación limpia: cero perfiles y ninguno activo', async () => {
  const db = await fresh();
  expect(await countProfiles(db)).toBe(0);
  expect(await getActiveProfile(db)).toBeNull();
});

it('guarda solo lo que el usuario dio; el resto queda nulo', async () => {
  const db = await fresh();
  await createProfile(db, { alias: 'Ana' });
  const row = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM profiles');
  expect(row).toMatchObject({ alias: 'Ana', anatomical_model: null, birth_year: null, height_cm: null });
});

it('varios perfiles: cambiar de activo no mezcla ni altera nada', async () => {
  const db = await fresh();
  const a = await createProfile(db, { alias: 'Ana' });
  const b = await createProfile(db, { alias: 'Beto', anatomicalModel: 'male' });
  expect((await getActiveProfile(db))?.id).toBe(b.id);
  expect(await setActiveProfile(db, a.id)).toBe(true);
  expect((await getActiveProfile(db))?.alias).toBe('Ana');
  expect((await listProfiles(db)).map((p) => p.alias)).toEqual(['Ana', 'Beto']);
});

it('no se puede activar un perfil inexistente o archivado', async () => {
  const db = await fresh();
  const a = await createProfile(db, { alias: 'Ana' });
  expect(await setActiveProfile(db, 'nope')).toBe(false);
  await archiveProfile(db, a.id);
  expect(await setActiveProfile(db, a.id)).toBe(false);
});

it('archivar oculta el perfil y quita el activo sin borrar datos', async () => {
  const db = await fresh();
  const a = await createProfile(db, { alias: 'Ana' });
  await archiveProfile(db, a.id);
  expect(await getActiveProfile(db)).toBeNull();
  expect(await listProfiles(db)).toHaveLength(0);
  expect(await db.getFirstAsync('SELECT 1 FROM profiles WHERE id = ?', [a.id])).not.toBeNull();
});

it('borrar elimina el perfil y limpia el activo; el otro perfil sigue intacto', async () => {
  const db = await fresh();
  const a = await createProfile(db, { alias: 'Ana' });
  const b = await createProfile(db, { alias: 'Beto' });
  await deleteProfile(db, b.id);
  expect(await getActiveProfile(db)).toBeNull();
  expect((await listProfiles(db)).map((p) => p.id)).toEqual([a.id]);
});

it('crea perfiles aunque no exista globalThis.crypto (Hermes) y con ids distintos', async () => {
  const db = await fresh();
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
  try {
    const a = await createProfile(db, { alias: 'Ana' });
    const b = await createProfile(db, { alias: 'Beto' });
    expect(a.id).toMatch(/^[0-9a-f]{32}$/);
    expect(a.id).not.toBe(b.id);
  } finally {
    if (saved) Object.defineProperty(globalThis, 'crypto', saved); else delete (globalThis as { crypto?: unknown }).crypto;
  }
});

it('la unidad de peso nace en kg, se elige al crear y se cambia solo en ese perfil', async () => {
  const db = await fresh();
  const a = await createProfile(db, { alias: 'Ana' });
  const b = await createProfile(db, { alias: 'Beto', weightUnit: 'lb' });
  expect([a.weightUnit, b.weightUnit]).toEqual(['kg', 'lb']);
  await setWeightUnit(db, a.id, 'lb');
  expect((await listProfiles(db)).map((p) => p.weightUnit)).toEqual(['lb', 'lb']);
  await setWeightUnit(db, b.id, 'kg');
  expect((await listProfiles(db)).map((p) => p.weightUnit)).toEqual(['lb', 'kg']);
  await expect(setWeightUnit(db, a.id, 'stone' as never)).rejects.toThrow();
});
