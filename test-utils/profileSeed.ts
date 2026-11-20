import { migrate } from '../src/db';
import { addCustomItem } from '../src/db/customEquipment';
import { setFavorite } from '../src/db/favorites';
import { ensureEnvironment, setItemState } from '../src/db/inventory';
import { saveDraft } from '../src/db/onboarding';
import { saveActivePlan } from '../src/db/plans';
import { createProfile, setWeightUnit } from '../src/db/profiles';
import { ensureHorizon } from '../src/db/schedule';
import { finishWorkout, recordEvent, startWorkout } from '../src/db/workouts';
import type { Plan } from '../src/lib/plan';
import { memoryDb } from './sqlite';

/** Dos perfiles con datos: «Ana» (todo) y «Beto» (plan y un entreno), y una sesión abierta de Ana que no se exporta. */
const bench = { exerciseVariantId: 'bench_press.barbell', sets: 3, repRange: [6, 10] as [number, number], restSeconds: 90 };
const plan: Plan = { schemaVersion: 1, mode: 'local', sessions: [0, 2, 4].map((day) => ({ day, name: `D${day}`, blocks: [{ type: 'single' as const, items: [bench] }] })) };
export const NOW = new Date('2026-11-20T12:00:00Z');

export async function seed() {
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

