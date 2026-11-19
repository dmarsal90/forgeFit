import { migrate } from '../src/db';
import { saveActivePlan } from '../src/db/plans';
import { createProfile } from '../src/db/profiles';
import { ensureHorizon } from '../src/db/schedule';
import { getProgressStats } from '../src/db/stats';
import { finishWorkout, recordEvent, startWorkout } from '../src/db/workouts';
import { doneSets, muscleSets, plannedSets } from '../src/lib/muscleVolume';
import type { Plan, PlanSession } from '../src/lib/plan';
import { memoryDb } from '../test-utils/sqlite';

const it1 = (exerciseVariantId: string, sets: number) => ({ exerciseVariantId, sets, repRange: [8, 12] as [number, number], restSeconds: 60 });
const session = (day: number): PlanSession => ({
  day, name: `D${day}`,
  blocks: [{ type: 'single', items: [it1('bench_press.barbell', 4)] }, { type: 'single', items: [it1('nada.x', 3)] }],
});
const perf = (skipped = false) => ({ weightKg: 50, reps: 8, skipped, corrected: false });

it('planificado: suma las series de cada ejercicio a sus músculos primarios y ignora ejercicios desconocidos', () => {
  const planned = plannedSets({ schemaVersion: 1, mode: 'local', sessions: [session(0), session(2)] });
  expect(planned.get('pectoral')).toBe(8);
  expect([...planned.keys()].every((m) => m !== 'undefined')).toBe(true);
});

it('realizado: cuenta series hechas, no las saltadas ni las de pasos inexistentes', () => {
  const done = doneSets([{ session: session(0), done: { '0.0.0': perf(), '0.0.1': perf(), '0.0.2': perf(true), '9.0.0': perf(), '1.0.0': perf() } }]);
  expect(done.get('pectoral')).toBe(2);
});

it('muscleSets une ambos mapas, etiqueta y ordena por lo planificado; lo hecho sin plan aparece con 0 planificado', () => {
  const r = muscleSets(new Map([['pectoral', 8], ['deltoid', 4]]), new Map([['pectoral', 2], ['calves', 3]]));
  expect(r.map((x) => [x.muscle, x.label, x.done, x.planned])).toEqual([['pectoral', 'pectoral', 2, 8], ['deltoid', 'deltoides', 0, 4], ['calves', 'gemelos y sóleo', 3, 0]]);
});

it('getProgressStats incluye las series de la semana por músculo, sin mezclar perfiles', async () => {
  const db = memoryDb();
  await migrate(db);
  const a = await createProfile(db, { alias: 'Ana' });
  const b = await createProfile(db, { alias: 'Beto' });
  const plan: Plan = { schemaVersion: 1, mode: 'local', sessions: [session(0), session(2)] };
  for (const p of [a, b]) await saveActivePlan(db, p.id, plan, null);
  await db.runAsync("UPDATE training_plans SET created_at = '2026-11-16T08:00:00'");
  for (const p of [a, b]) await ensureHorizon(db, p.id, '2026-11-16', '2026-11-16');
  const id = await startWorkout(db, a.id, '2026-11-16', 1000);
  await recordEvent(db, id, { type: 'set_done', block: 0, item: 0, round: 0, weightKg: 60, reps: 8 }, { now: 1100 });
  await finishWorkout(db, id, 2000);
  const pectoral = (await getProgressStats(db, a.id, '2026-11-17')).muscles.find((m) => m.muscle === 'pectoral');
  expect(pectoral).toMatchObject({ done: 1, planned: 8 });
  expect((await getProgressStats(db, b.id, '2026-11-17')).muscles.find((m) => m.muscle === 'pectoral')).toMatchObject({ done: 0, planned: 8 });
});
