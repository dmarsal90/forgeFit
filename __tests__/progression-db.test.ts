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

async function setup(unit: 'kg' | 'lb' = 'kg', p: Plan = plan) {
  const db = memoryDb();
  await migrate(db);
  const a = await createProfile(db, { alias: 'Ana', weightUnit: unit });
  const b = await createProfile(db, { alias: 'Beto' });
  const gym = await ensureEnvironment(db, a.id, 'gym');
  await saveActivePlan(db, a.id, p, gym);
  await saveActivePlan(db, b.id, p, null);
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

it('con barra y discos: el escalón es el doble del disco más pequeño y la barra se tiene en cuenta; solo cuenta lo que tienes', async () => {
  const { db, a, gym } = await setup();
  await train(db, a.id, '2026-11-16', 1000, [10, 10, 10]);
  await setItemState(db, gym, 'barbell_olympic_20', 'available');
  await setItemState(db, gym, 'plates_olympic_iron', 'available');
  await setAttributes(db, gym, 'plates_olympic_iron', { minKg: null, maxKg: null, stepKg: 1.25, barKg: null }); // disco de 1,25 kg → 2,5 kg por par
  expect((await loadSuggestions(db, a.id, session, 'kg'))['bench_press.barbell']).toMatchObject({ kind: 'increase', weightKg: 62.5 });

  // con discos fraccionales de 0,5 kg el salto es de 1 kg
  await setItemState(db, gym, 'plates_fractional', 'available');
  await setAttributes(db, gym, 'plates_fractional', { minKg: null, maxKg: null, stepKg: 0.5, barKg: null });
  expect((await loadSuggestions(db, a.id, session, 'kg'))['bench_press.barbell']).toMatchObject({ kind: 'increase', weightKg: 61 });

  // unos discos que NO tiene (aunque tengan ficha) no cuentan
  await setItemState(db, gym, 'plates_fractional', 'unavailable');
  expect((await loadSuggestions(db, a.id, session, 'kg'))['bench_press.barbell']).toMatchObject({ weightKg: 62.5 });
});

it('el peso de la barra manda al bajar: con una barra de 15 kg las cargas posibles son 15 + múltiplos del escalón, y nunca por debajo de la barra', async () => {
  const { db, a, gym } = await setup();
  await setItemState(db, gym, 'barbell_olympic_15', 'available');
  await setItemState(db, gym, 'plates_olympic_iron', 'available');
  await setAttributes(db, gym, 'plates_olympic_iron', { minKg: null, maxKg: null, stepKg: 2.5, barKg: null }); // pares de 5 kg
  await train(db, a.id, '2026-11-16', 1000, [3, 2, 1], 62.5); // muy por debajo del rango
  const s = (await loadSuggestions(db, a.id, session, 'kg'))['bench_press.barbell'];
  expect(s.kind).toBe('reduce');
  expect(((s.weightKg as number) - 15) % 5).toBeCloseTo(0, 5); // 15 + n × 5
  expect(s.weightKg).toBeGreaterThanOrEqual(30);
  expect(s.weightKg).toBeLessThan(62.5);
});

it('una barra sin peso conocido o varias barras distintas no se suponen: sin ajuste a la barra', async () => {
  const { db, a, gym } = await setup();
  await train(db, a.id, '2026-11-16', 1000, [3, 2, 1], 61);
  await setItemState(db, gym, 'plates_olympic_iron', 'available');
  await setAttributes(db, gym, 'plates_olympic_iron', { minKg: null, maxKg: null, stepKg: 1.25, barKg: null });
  await setItemState(db, gym, 'barbell_olympic_20', 'available');
  await setItemState(db, gym, 'barbell_olympic_15', 'available'); // dos barras posibles con pesos distintos: ambiguo
  const ambiguous = (await loadSuggestions(db, a.id, session, 'kg'))['bench_press.barbell'];
  expect(ambiguous.kind).toBe('reduce'); // bajó, pero sin rejilla de barra: múltiplo del escalón desde 0
  expect(((ambiguous.weightKg as number) / 2.5) % 1).toBeCloseTo(0, 5);

  await setItemState(db, gym, 'barbell_olympic_15', null);
  await setAttributes(db, gym, 'barbell_olympic_20', { minKg: null, maxKg: null, stepKg: null, barKg: 22 }); // la persona aclara el peso de SU barra
  const clarified = (await loadSuggestions(db, a.id, session, 'kg'))['bench_press.barbell'];
  expect(((clarified.weightKg as number) - 22) % 2.5).toBeCloseTo(0, 5);
});

it('mancuernas y máquinas: el menor incremento de las fichas de lo que tiene', async () => {
  const dbSession: PlanSession = { day: 0, name: 'X', blocks: [{ type: 'single', items: [{ exerciseVariantId: 'db_fly.flat', sets: 3, repRange: [6, 10], restSeconds: 60 }] }] };
  const { db, a, gym } = await setup('kg', { schemaVersion: 1, mode: 'local', sessions: [dbSession] });
  await setItemState(db, gym, 'dumbbells_fixed_hex', 'available');
  await setAttributes(db, gym, 'dumbbells_fixed_hex', { minKg: null, maxKg: null, stepKg: 2, barKg: null });
  const id = await startWorkout(db, a.id, '2026-11-16', 1000);
  for (const [round, reps] of [10, 10, 10].entries()) await recordEvent(db, id, { type: 'set_done', block: 0, item: 0, round, weightKg: 20, reps }, { now: 1100 + round });
  await finishWorkout(db, id, 2000);
  expect((await loadSuggestions(db, a.id, dbSession, 'kg'))['db_fly.flat']).toMatchObject({ kind: 'increase', weightKg: 22 });
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
