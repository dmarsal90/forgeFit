import { migrate } from '../src/db';
import { getFeatures, setFeature, type Feature } from '../src/db/features';
import { createProfile } from '../src/db/profiles';
import { memoryDb } from '../test-utils/sqlite';

it('todo activado por defecto; desactivar y reactivar un módulo es por perfil y no borra nada', async () => {
  const db = memoryDb();
  await migrate(db);
  const a = await createProfile(db, { alias: 'Ana' });
  const b = await createProfile(db, { alias: 'Beto' });
  expect(await getFeatures(db, a.id)).toEqual({ progression: true, plates: true });
  await setFeature(db, a.id, 'plates', false);
  await setFeature(db, a.id, 'plates', false); // idempotente
  expect(await getFeatures(db, a.id)).toEqual({ progression: true, plates: false });
  expect(await getFeatures(db, b.id)).toEqual({ progression: true, plates: true });
  await setFeature(db, a.id, 'plates', true);
  expect(await getFeatures(db, a.id)).toEqual({ progression: true, plates: true });
});

it('rechaza un módulo desconocido y las filas se borran con el perfil', async () => {
  const db = memoryDb();
  await migrate(db);
  const a = await createProfile(db, { alias: 'Ana' });
  await expect(setFeature(db, a.id, 'ia' as Feature, false)).rejects.toThrow();
  await setFeature(db, a.id, 'progression', false);
  await db.runAsync('DELETE FROM profiles WHERE id = ?', [a.id]);
  expect((await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM feature_preferences'))?.n).toBe(0);
});
