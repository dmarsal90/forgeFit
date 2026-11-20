import { migrate } from '../src/db';
import { setAttributes } from '../src/db/equipmentAttributes';
import { ensureEnvironment, setItemState } from '../src/db/inventory';
import { saveActivePlan } from '../src/db/plans';
import { loadSuggestions } from '../src/db/progression';
import { createProfile } from '../src/db/profiles';
import { ensureHorizon } from '../src/db/schedule';
import { finishWorkout, recordEvent, startWorkout } from '../src/db/workouts';
import type { Plan, PlanSession } from '../src/lib/plan';
import { memoryDb } from '../test-utils/sqlite';

const session: PlanSession = {
  day: 0, name: 'Empuje',
  blocks: [{ type: 'single', items: [{ exerciseVariantId: 'bench_press.barbell', sets: 3, repRange: [6, 10], restSeconds: 90 }] }],
};
const plan: Plan = { schemaVersion: 1, mode: 'local', sessions: [session] };

async function setup(unit: 'kg' | 'lb' = 'kg') {
  const db = memoryDb();
  await migrate(db);
  const a = await createProfile(db, { alias: 'Ana', weightUnit: unit });
  const b = await createProfile(db, { alias: 'Beto' });
  const gym = await ensureEnvironment(db, a.id, 'gym');
  await saveActivePlan(db, a.id, plan, gym);
  await saveActivePlan(db, b.id, plan, null);
  await db.runAsync("UPDATE training_plans SET created_at = '2026-11-16T08:00:00'");
  for (const p of [a, b]) await ensureHorizon(db, p.id, '2026-11-16', '2026-11-16');
  return { db, a, b, gym };
}
async function train(db: Awaited<ReturnType<typeof setup>>['db'], profileId: string, date: string, at: number, reps: number[], kg = 60) {
  const id = await startWorkout(db, profileId, date, at);
  for (const [round, r] of reps.entries()) await recordEvent(db, id, { type: 'set_done', block: 0, item: 0, round, weightKg: kg, reps: r }, { now: at + 100 * (round + 1) });
  await finishWorkout(db, id, at + 1000);
}

it('sin historial no hay base; con la sesión anterior completa sugiere subir un escalón', async () => {
  const { db, a } = await setup();
  expect((await loadSuggestions(db, a.id, session, 'kg'))['bench_press.barbell'].kind).toBe('none');
  await train(db, a.id, '2026-11-16', 1000, [10, 10, 10]);
  expect((await loadSuggestions(db, a.id, session, 'kg'))['bench_press.barbell']).toMatchObject({ kind: 'increase', weightKg: 62.5, message: 'Sube a 62.5 kg.' });
});

it('usa el escalón de la ficha del equipo del entorno del plan, el menor de los que usa el ejercicio', async () => {
  const { db, a, gym } = await setup();
  await train(db, a.id, '2026-11-16', 1000, [10, 10, 10]);
  await setItemState(db, gym, 'barbell_olympic_20', 'available');
  await setItemState(db, gym, 'plates_olympic_iron', 'available');
  await setAttributes(db, gym, 'barbell_olympic_20', { minKg: null, maxKg: null, stepKg: 2, barKg: 20 });
  await setAttributes(db, gym, 'plates_olympic_iron', { minKg: null, maxKg: null, stepKg: 1.25, barKg: null });
  expect((await loadSuggestions(db, a.id, session, 'kg'))['bench_press.barbell']).toMatchObject({ kind: 'increase', weightKg: 61.25 });
});

it('en libras el escalón por defecto es de 5 lb y el texto sale en libras', async () => {
  const { db, a } = await setup('lb');
  await train(db, a.id, '2026-11-16', 1000, [10, 10, 10]);
  const s = (await loadSuggestions(db, a.id, session, 'lb'))['bench_press.barbell'];
  expect(s.message).toBe('Sube a 137.3 lb.'); // 60 kg = 132.3 lb + 5 lb
  expect(s.weightKg).toBeCloseTo(62.268, 2);
});

it('no usa las sesiones de otro perfil ni las que siguen abiertas', async () => {
  const { db, a, b } = await setup();
  await train(db, a.id, '2026-11-16', 1000, [10, 10, 10]);
  expect((await loadSuggestions(db, b.id, session, 'kg'))['bench_press.barbell'].kind).toBe('none');
  const open = await startWorkout(db, b.id, '2026-11-16', 5000);
  await recordEvent(db, open, { type: 'set_done', block: 0, item: 0, round: 0, weightKg: 100, reps: 10 }, { now: 5100 });
  expect((await loadSuggestions(db, b.id, session, 'kg'))['bench_press.barbell'].kind).toBe('none');
});
