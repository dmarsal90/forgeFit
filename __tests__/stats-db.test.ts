import { migrate } from '../src/db';
import { saveActivePlan } from '../src/db/plans';
import { createProfile } from '../src/db/profiles';
import { ensureHorizon } from '../src/db/schedule';
import { getProgressStats } from '../src/db/stats';
import { finishWorkout, recordEvent, startWorkout } from '../src/db/workouts';
import type { Plan } from '../src/lib/plan';
import { memoryDb } from '../test-utils/sqlite';

const item = { exerciseVariantId: 'a', sets: 1, repRange: [8, 12] as [number, number], restSeconds: 60 };
const plan: Plan = { schemaVersion: 1, mode: 'local', sessions: [0, 2, 4].map((day) => ({ day, name: `D${day}`, blocks: [{ type: 'single' as const, items: [item] }] })) };

async function setup() {
  const db = memoryDb();
  await migrate(db);
  const a = await createProfile(db, { alias: 'Ana' });
  const b = await createProfile(db, { alias: 'Beto' });
  await saveActivePlan(db, a.id, plan, null);
  await saveActivePlan(db, b.id, plan, null);
  const today = '2026-11-17'; // martes
  await db.runAsync("UPDATE training_plans SET created_at = '2026-11-17T08:00:00'");
  await ensureHorizon(db, a.id, today, today);
  await ensureHorizon(db, b.id, today, today);
  return { db, a, b, today };
}

it('sin sesiones realizadas no hay racha; lo anterior a crear el plan no cuenta como pendiente', async () => {
  const { db, a, today } = await setup();
  const s = await getProgressStats(db, a.id, today);
  expect(s).toMatchObject({ streakWeeks: 0, completedTotal: 0, pendingOverdue: 0, week: { done: 0, planned: 2 } }); // lunes 16 es anterior al plan
});

it('terminar una sesión suma a la semana y al volumen, y los perfiles no se mezclan', async () => {
  const { db, a, b, today } = await setup();
  const id = await startWorkout(db, a.id, '2026-11-18', 1000);
  await recordEvent(db, id, { type: 'set_done', block: 0, item: 0, round: 0, weightKg: 20, reps: 10 }, { now: 1100 });
  await finishWorkout(db, id, 2000);
  expect(await getProgressStats(db, a.id, today)).toMatchObject({ completedTotal: 1, volumeKg: 200, week: { done: 1, planned: 2 }, streakWeeks: 0 });
  expect(await getProgressStats(db, b.id, today)).toMatchObject({ completedTotal: 0, volumeKg: 0 });
});

it('una sesión vencida sin hacer se cuenta como pendiente y corta la racha', async () => {
  const { db, a } = await setup();
  const s = await getProgressStats(db, a.id, '2026-11-20'); // jueves: el miércoles quedó sin hacer
  expect(s).toMatchObject({ pendingOverdue: 1, streakWeeks: 0 });
});
