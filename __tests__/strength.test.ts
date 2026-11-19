import { migrate } from '../src/db';
import { saveActivePlan } from '../src/db/plans';
import { createProfile } from '../src/db/profiles';
import { ensureHorizon } from '../src/db/schedule';
import { getStrength } from '../src/db/stats';
import { finishWorkout, recordEvent, startWorkout } from '../src/db/workouts';
import type { Plan } from '../src/lib/plan';
import { e1rm, strengthHistory } from '../src/lib/strength';
import { memoryDb } from '../test-utils/sqlite';

const session = {
  day: 0, name: 'D',
  blocks: [{ type: 'single' as const, items: [{ exerciseVariantId: 'bench_press.barbell', sets: 3, repRange: [6, 10] as [number, number], restSeconds: 90 }] }],
};
const done = (weightKg?: number, reps?: number, skipped = false) => ({ weightKg, reps, skipped, corrected: false });

describe('e1rm (Epley)', () => {
  it('estima de 1 a 12 repeticiones y descarta datos inservibles', () => {
    expect(e1rm(100, 1)).toBeCloseTo(103.33, 2);
    expect(e1rm(60, 10)).toBeCloseTo(80, 5);
    for (const [kg, reps] of [[0, 5], [-5, 5], [50, 0], [50, 13], [50, 2.5], [NaN, 5]]) expect(e1rm(kg, reps)).toBeNull();
  });
});

describe('strengthHistory', () => {
  it('toma la mejor serie por ejercicio y sesión, en orden cronológico, ignorando saltadas y datos vacíos', () => {
    const r = strengthHistory([
      { at: 2000, session, done: { '0.0.0': done(70, 8) } },
      { at: 1000, session, done: { '0.0.0': done(60, 10), '0.0.1': done(60, 6), '0.0.2': done(200, 5, true), '0.0.3': done(undefined, 8) } },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ exerciseId: 'bench_press', name: 'Press de banca plano' });
    expect(r[0].points.map((p) => [p.at, p.kg, p.reps])).toEqual([[1000, 60, 10], [2000, 70, 8]]);
  });
  it('sin series válidas no devuelve nada, y una clave fuera de la sesión se ignora', () => {
    expect(strengthHistory([{ at: 1, session, done: { '5.0.0': done(50, 5), '0.0.0': done(50, 20) } }])).toEqual([]);
  });
});

describe('getStrength', () => {
  const plan: Plan = { schemaVersion: 1, mode: 'local', sessions: [session] };
  it('lee las sesiones terminadas del perfil y no mezcla perfiles ni cuenta las abiertas', async () => {
    const db = memoryDb();
    await migrate(db);
    const a = await createProfile(db, { alias: 'Ana' });
    const b = await createProfile(db, { alias: 'Beto' });
    for (const p of [a, b]) await saveActivePlan(db, p.id, plan, null);
    await db.runAsync("UPDATE training_plans SET created_at = '2026-11-16T08:00:00'");
    for (const p of [a, b]) await ensureHorizon(db, p.id, '2026-11-16', '2026-11-16');
    const id = await startWorkout(db, a.id, '2026-11-16', 1000);
    await recordEvent(db, id, { type: 'set_done', block: 0, item: 0, round: 0, weightKg: 80, reps: 5 }, { now: 1100 });
    await finishWorkout(db, id, 2000);
    const r = await getStrength(db, a.id);
    expect(r.map((x) => x.exerciseId)).toEqual(['bench_press']);
    expect(r[0].points[0]).toMatchObject({ kg: 80, reps: 5 });
    expect(await getStrength(db, b.id)).toEqual([]);
  });
});
