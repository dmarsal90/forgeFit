import { migrate } from '../src/db';
import { addCustomItem } from '../src/db/customEquipment';
import { setFavorite } from '../src/db/favorites';
import { ensureEnvironment, setItemState } from '../src/db/inventory';
import { saveDraft } from '../src/db/onboarding';
import { saveActivePlan } from '../src/db/plans';
import { exportProfile, exportProfileJson, profileBackupSchema } from '../src/db/profileBackup';
import { createProfile, setWeightUnit } from '../src/db/profiles';
import { ensureHorizon } from '../src/db/schedule';
import { finishWorkout, recordEvent, startWorkout } from '../src/db/workouts';
import type { Plan } from '../src/lib/plan';
import { memoryDb } from '../test-utils/sqlite';

const bench = { exerciseVariantId: 'bench_press.barbell', sets: 3, repRange: [6, 10] as [number, number], restSeconds: 90 };
const plan: Plan = { schemaVersion: 1, mode: 'local', sessions: [0, 2, 4].map((day) => ({ day, name: `D${day}`, blocks: [{ type: 'single' as const, items: [bench] }] })) };
const NOW = new Date('2026-11-20T12:00:00Z');

async function seed() {
  const db = memoryDb();
  await migrate(db);
  const a = await createProfile(db, { alias: 'Ana', anatomicalModel: 'female', age: 30, heightCm: 168, weightUnit: 'kg' });
  const b = await createProfile(db, { alias: 'Beto' });
  await setWeightUnit(db, a.id, 'lb');
  await saveDraft(db, a.id, 2, { primaryGoal: 'muscle' });
  const gym = await ensureEnvironment(db, a.id, 'gym');
  await setItemState(db, gym, 'bench_flat_fixed', 'available');
  await setFavorite(db, a.id, 'bench_flat_fixed', true);
  await addCustomItem(db, a.id, { name: 'Mi banco', family: 'chest' });
  for (const p of [a, b]) await saveActivePlan(db, p.id, plan, p.id === a.id ? gym : null);
  await db.runAsync("UPDATE training_plans SET created_at = '2026-11-16T08:00:00'");
  for (const p of [a, b]) await ensureHorizon(db, p.id, '2026-11-16', '2026-11-16');
  const id = await startWorkout(db, a.id, '2026-11-16', 1000);
  await recordEvent(db, id, { type: 'set_done', block: 0, item: 0, round: 0, weightKg: 60, reps: 10 }, { now: 1100 });
  await finishWorkout(db, id, 2000);
  await startWorkout(db, a.id, '2026-11-18', 5000); // abierta: no se exporta
  const idB = await startWorkout(db, b.id, '2026-11-16', 3000);
  await finishWorkout(db, idB, 3500);
  return { db, a, b };
}

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
