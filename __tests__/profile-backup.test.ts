import { exportProfile, exportProfileJson, profileBackupSchema } from '../src/db/profileBackup';
import { NOW, seed } from '../test-utils/profileSeed';

it('exporta el perfil entero y el resultado cumple su propio esquema', async () => {
  const { db, a } = await seed();
  const out = await exportProfile(db, a.id, NOW);
  expect(profileBackupSchema.safeParse(JSON.parse(JSON.stringify(out))).success).toBe(true);
  expect(out).toMatchObject({ schemaVersion: 1, kind: 'forgefit-profile', exportedAt: NOW.toISOString() });
  expect(out.profile).toMatchObject({ alias: 'Ana', anatomicalModel: 'female', heightCm: 168, weightUnit: 'lb' });
  expect(out.drafts).toEqual({ '2': { primaryGoal: 'muscle' } });
  expect(out.equipment.favorites).toEqual(['bench_flat_fixed']);
  expect(out.equipment.custom.map((c) => c.name)).toEqual(['Mi banco']);
  expect(out.equipment.environments[0]).toMatchObject({ kind: 'gym', items: { bench_flat_fixed: 'available' } });
  expect(out.plans).toHaveLength(1);
  expect(out.plans[0]).toMatchObject({ environmentKind: 'gym', status: 'active', mode: 'local' });
  expect(out.plans[0].revisions.length).toBeGreaterThan(0);
  expect(out.plans[0].scheduled.length).toBeGreaterThan(0);
  expect(out.plans[0].scheduled.some((s) => s.status === 'completed')).toBe(true);
});

it('solo las sesiones terminadas, con todos sus eventos, y nada de otros perfiles', async () => {
  const { db, a, b } = await seed();
  const out = await exportProfile(db, a.id, NOW);
  expect(out.workouts).toHaveLength(1);
  expect(out.workouts[0].startedAt).toBe(1000);
  expect(out.workouts[0].events.map((e) => e.event.type)).toEqual(['start', 'set_done', 'finish']);
  expect(out.workouts[0].events.map((e) => e.seq)).toEqual([1, 2, 3]);
  expect(JSON.stringify(out)).not.toContain('Beto');
  const outB = await exportProfile(db, b.id, NOW);
  expect(outB.workouts.map((w) => w.startedAt)).toEqual([3000]);
  expect(outB.equipment.custom).toEqual([]);
  expect(outB.plans[0].environmentKind).toBeNull();
});

it('un perfil inexistente o con datos guardados corruptos no genera un archivo', async () => {
  const { db, a } = await seed();
  await expect(exportProfile(db, 'nope')).rejects.toThrow('Perfil no encontrado');
  await db.runAsync("UPDATE training_plans SET plan_json = '{\"roto\":true}' WHERE profile_id = ?", [a.id]);
  await expect(exportProfile(db, a.id)).rejects.toThrow();
  await db.runAsync("UPDATE training_plans SET plan_json = 'no es json' WHERE profile_id = ?", [a.id]);
  await expect(exportProfile(db, a.id)).rejects.toThrow();
});

it('exportProfileJson devuelve texto JSON válido', async () => {
  const { db, a } = await seed();
  expect(profileBackupSchema.safeParse(JSON.parse(await exportProfileJson(db, a.id))).success).toBe(true);
});

describe('profileBackupSchema', () => {
  const valid = async () => JSON.parse(JSON.stringify(await exportProfile(...(await seed().then(({ db, a }) => [db, a.id, NOW] as const)))));

  it('rechaza versión o tipo desconocidos y un entreno sin definición', async () => {
    const ok = await valid();
    expect(profileBackupSchema.safeParse(ok).success).toBe(true);
    expect(profileBackupSchema.safeParse({ ...ok, schemaVersion: 2 }).success).toBe(false);
    expect(profileBackupSchema.safeParse({ ...ok, kind: 'otra-cosa' }).success).toBe(false);
    const broken = structuredClone(ok);
    broken.plans[0].scheduled.find((s: { kind: string }) => s.kind === 'training').session = null;
    expect(profileBackupSchema.safeParse(broken).success).toBe(false);
  });
  it('rechaza alias vacío, unidad desconocida y borradores fuera de las etapas 1 a 8', async () => {
    const ok = await valid();
    expect(profileBackupSchema.safeParse({ ...ok, profile: { ...ok.profile, alias: '  ' } }).success).toBe(false);
    expect(profileBackupSchema.safeParse({ ...ok, profile: { ...ok.profile, weightUnit: 'st' } }).success).toBe(false);
    expect(profileBackupSchema.safeParse({ ...ok, drafts: { '9': {} } }).success).toBe(false);
  });
});
