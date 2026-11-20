import { eventSchema, reduce, stepKey, stepsOf, type Timed, type WorkoutEvent } from '../src/lib/workoutMachine';
import type { PlanSession } from '../src/lib/plan';

const it_ = (id: string, sets: number, restSeconds = 60) => ({ exerciseVariantId: id, sets, repRange: [8, 12] as [number, number], restSeconds });
// Bloque 0: biserie A1/A2 de 2 series; bloque 1: ejercicio suelto de 1 serie.
const session: PlanSession = { day: 0, name: 'X', blocks: [
  { type: 'superset', items: [it_('a', 2, 90), it_('b', 2, 45)] },
  { type: 'single', items: [it_('c', 1)] },
] };
const T = (at: number, event: WorkoutEvent): Timed => ({ at, event });
const done = (block: number, item: number, round: number, reps = 10): WorkoutEvent => ({ type: 'set_done', block, item, round, reps, weightKg: 20 });

it('una biserie alterna A1, A2 por ronda y luego pasa al siguiente bloque', () => {
  expect(stepsOf(session).map(stepKey)).toEqual(['0.0.0', '0.1.0', '0.0.1', '0.1.1', '1.0.0']);
});

it('antes de empezar está pendiente; descanso solo tras completar la ronda (A2), con el descanso de A2', () => {
  expect(reduce(session, [], 0).status).toBe('pending');
  const s1 = reduce(session, [T(0, { type: 'start' }), T(10, done(0, 0, 0))], 20);
  expect(s1.current).toEqual({ block: 0, item: 1, round: 0 });
  expect(s1.rest).toBeNull(); // entre A1 y A2 no se descansa
  const s2 = reduce(session, [T(0, { type: 'start' }), T(10, done(0, 0, 0)), T(20, done(0, 1, 0))], 30);
  expect(s2.rest).toEqual({ seconds: 45, startedAt: 20 });
  expect(s2.current).toEqual({ block: 0, item: 0, round: 1 });
});

it('la pausa no cuenta como tiempo activo ni consume el descanso; reanudar lo recupera', () => {
  const evs = [T(0, { type: 'start' }), T(10, done(0, 0, 0)), T(20, done(0, 1, 0)), T(30, { type: 'pause' }), T(130, { type: 'resume' })];
  const s = reduce(session, evs, 150);
  expect(s.status).toBe('active');
  expect(s.activeMs).toBe(30 + 20);
  expect(s.rest?.startedAt).toBe(120);
});

it('repetir una serie ya registrada se ignora y los eventos en pausa no avanzan', () => {
  const s = reduce(session, [T(0, { type: 'start' }), T(1, done(0, 0, 0, 10)), T(2, done(0, 0, 0, 99)), T(3, { type: 'pause' }), T(4, done(0, 1, 0))], 5);
  expect(s.done['0.0.0'].reps).toBe(10);
  expect(s.done['0.1.0']).toBeUndefined();
});

it('corregir cambia los valores con marca de corrección; saltar no genera descanso', () => {
  let s = reduce(session, [T(0, { type: 'start' }), T(1, done(0, 0, 0, 10)), T(2, { type: 'correct', block: 0, item: 0, round: 0, reps: 12 })], 3);
  expect(s.done['0.0.0']).toMatchObject({ reps: 12, corrected: true });
  s = reduce(session, [T(0, { type: 'start' }), T(1, done(0, 0, 0)), T(2, { type: 'skip', block: 0, item: 1, round: 0 })], 3);
  expect(s.done['0.1.0'].skipped).toBe(true);
  expect(s.rest).toBeNull();
});

it('la última serie no genera descanso y al terminar se congela el tiempo', () => {
  const all = stepsOf(session).map((st, i) => T(10 * (i + 1), done(st.block, st.item, st.round)));
  const s = reduce(session, [T(0, { type: 'start' }), ...all, T(100, { type: 'finish' })], 9999);
  expect(s.current).toBeNull();
  expect(s.rest).toBeNull();
  expect(s.status).toBe('finished');
  expect(s.activeMs).toBe(100);
});

it('la molestia o el dolor de una serie se guarda con ella, también al corregirla, y un valor inventado se rechaza', () => {
  const st = reduce(session, [
    T(0, { type: 'start' }),
    T(10, { type: 'set_done', block: 0, item: 0, round: 0, reps: 10, weightKg: 20, pain: 'discomfort' }),
    T(20, done(0, 1, 0)),
    T(30, { type: 'correct', block: 0, item: 0, round: 0, weightKg: 20, reps: 9, pain: 'pain' }),
  ], 40);
  expect(st.done['0.0.0']).toMatchObject({ reps: 9, pain: 'pain', corrected: true });
  expect(st.done['0.1.0'].pain).toBeUndefined();
  expect(eventSchema.safeParse({ type: 'set_done', block: 0, item: 0, round: 0, reps: 5, pain: 'fuerte' }).success).toBe(false);
  expect(eventSchema.safeParse({ type: 'set_done', block: 0, item: 0, round: 0, reps: 5 }).success).toBe(true); // datos antiguos sin el campo
});
