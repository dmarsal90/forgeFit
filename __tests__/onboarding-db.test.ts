import { migrate } from '../src/db';
import { clearDrafts, getDrafts, grantConsent, hasConsent, revokeConsent, saveDraft } from '../src/db/onboarding';
import { createProfile, deleteProfile } from '../src/db/profiles';
import { memoryDb } from '../test-utils/sqlite';

async function twoProfiles() {
  const db = memoryDb();
  await migrate(db);
  const a = await createProfile(db, { alias: 'Ana' });
  const b = await createProfile(db, { alias: 'Beto' });
  return { db, a, b };
}

it('perfiles aislados: borradores y consentimientos no se filtran entre perfiles', async () => {
  const { db, a, b } = await twoProfiles();
  await saveDraft(db, a.id, 2, { goal: 'fuerza' });
  await grantConsent(db, a.id, 'ai', 1);
  expect(await getDrafts(db, a.id)).toEqual({ 2: { goal: 'fuerza' } });
  expect(await getDrafts(db, b.id)).toEqual({});
  expect(await hasConsent(db, a.id, 'ai')).toBe(true);
  expect(await hasConsent(db, b.id, 'ai')).toBe(false);
});

it('guardar una etapa dos veces sobrescribe; limpiar solo afecta a ese perfil', async () => {
  const { db, a, b } = await twoProfiles();
  await saveDraft(db, a.id, 1, { v: 1 });
  await saveDraft(db, a.id, 1, { v: 2 });
  await saveDraft(db, b.id, 1, { v: 9 });
  expect(await getDrafts(db, a.id)).toEqual({ 1: { v: 2 } });
  await clearDrafts(db, a.id);
  expect(await getDrafts(db, a.id)).toEqual({});
  expect(await getDrafts(db, b.id)).toEqual({ 1: { v: 9 } });
});

it('revocar quita el consentimiento y volver a otorgarlo lo reactiva', async () => {
  const { db, a } = await twoProfiles();
  await grantConsent(db, a.id, 'health', 1);
  await revokeConsent(db, a.id, 'health');
  expect(await hasConsent(db, a.id, 'health')).toBe(false);
  await grantConsent(db, a.id, 'health', 2);
  expect(await hasConsent(db, a.id, 'health')).toBe(true);
});

it('borrar un perfil elimina sus borradores y consentimientos', async () => {
  const { db, a, b } = await twoProfiles();
  await saveDraft(db, a.id, 1, {});
  await grantConsent(db, a.id, 'ai', 1);
  await saveDraft(db, b.id, 1, { keep: true });
  await deleteProfile(db, a.id);
  expect(await db.getFirstAsync('SELECT 1 FROM onboarding_drafts WHERE profile_id = ?', [a.id])).toBeNull();
  expect(await db.getFirstAsync('SELECT 1 FROM user_consents WHERE profile_id = ?', [a.id])).toBeNull();
  expect(await getDrafts(db, b.id)).toEqual({ 1: { keep: true } });
});

it('una fila de borrador corrupta se ignora', async () => {
  const { db, a } = await twoProfiles();
  await db.runAsync("INSERT INTO onboarding_drafts VALUES (?,?,?,?)", [a.id, 3, '{no json', 'x']);
  expect(await getDrafts(db, a.id)).toEqual({});
});
