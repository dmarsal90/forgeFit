import { eventSchema, reduce, stepKey, stepsOf, MAX_REST, variantOf, type Timed, type WorkoutEvent } from '../src/lib/workoutMachine';
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

describe('sustituir en sesión («máquina ocupada»)', () => {
  const sub = (block: number, item: number, variantId: string): WorkoutEvent => ({ type: 'substitute', block, item, variantId });
  it('aplica desde ese momento: las series hechas conservan su variante y las siguientes usan la nueva', () => {
    const s = reduce(session, [T(0, { type: 'start' }), T(1, done(0, 0, 0)), T(2, sub(0, 0, 'z')), T(3, done(0, 1, 0)), T(4, done(0, 0, 1)), T(5, { type: 'correct', block: 0, item: 0, round: 1, reps: 7 })], 6);
    expect(s.variants).toEqual({ '0.0': 'z' });
    expect(variantOf(session, s.done, '0.0.0')).toBe('a');
    expect(variantOf(session, s.done, '0.1.0')).toBe('b'); // otro ítem de la biserie: sin cambios
    expect(variantOf(session, s.done, '0.0.1')).toBe('z');
    expect(s.done['0.0.1'].reps).toBe(7); // corregir no pierde la variante
    expect(variantOf(session, s.done, '0.0.1')).toBe('z');
  });
  it('se ignora antes de empezar, en pausa o sobre un hueco que no existe', () => {
    expect(reduce(session, [T(0, sub(0, 0, 'z'))], 1).variants).toEqual({});
    expect(reduce(session, [T(0, { type: 'start' }), T(1, { type: 'pause' }), T(2, sub(0, 0, 'z'))], 3).variants).toEqual({});
    expect(reduce(session, [T(0, { type: 'start' }), T(1, sub(5, 0, 'z'))], 2).variants).toEqual({});
  });
  it('el esquema rechaza una variante vacía', () => {
    expect(eventSchema.safeParse(sub(0, 0, '')).success).toBe(false);
  });
});

describe('calentamiento', () => {
  const warm = (block: number, item: number, weightKg: number): WorkoutEvent => ({ type: 'warmup', block, item, weightKg, reps: 5 });
  it('se registra aparte: no completa series, no avanza ni activa el descanso', () => {
    const s = reduce(session, [T(0, { type: 'start' }), T(1, warm(0, 0, 30)), T(2, warm(0, 0, 40))], 3);
    expect(s.warmups.map((w) => w.weightKg)).toEqual([30, 40]);
    expect(s.done).toEqual({});
    expect(s.current).toEqual({ block: 0, item: 0, round: 0 });
    expect(s.rest).toBeNull();
  });
  it('se ignora antes de empezar, en pausa o en un hueco que no existe; recuerda la variante sustituida', () => {
    expect(reduce(session, [T(0, warm(0, 0, 30))], 1).warmups).toEqual([]);
    expect(reduce(session, [T(0, { type: 'start' }), T(1, { type: 'pause' }), T(2, warm(0, 0, 30))], 3).warmups).toEqual([]);
    expect(reduce(session, [T(0, { type: 'start' }), T(1, warm(9, 0, 30))], 2).warmups).toEqual([]);
    expect(reduce(session, [T(0, { type: 'start' }), T(1, { type: 'substitute', block: 0, item: 0, variantId: 'z' }), T(2, warm(0, 0, 30))], 3).warmups[0].variantId).toBe('z');
  });
});

describe('ajustar el descanso', () => {
  const adj = (seconds: number): WorkoutEvent => ({ type: 'rest_adjust', seconds });
  const base = [T(0, { type: 'start' }), T(10, done(0, 0, 0)), T(20, done(0, 1, 0))]; // descanso de 45 s tras A2
  it('suma o resta segundos al descanso en curso, entre 0 y el máximo', () => {
    expect(reduce(session, [...base, T(21, adj(15))], 22).rest?.seconds).toBe(60);
    expect(reduce(session, [...base, T(21, adj(-15)), T(22, adj(-15)), T(23, adj(-15))], 24).rest?.seconds).toBe(0);
    expect(reduce(session, [...base, T(21, adj(300)), T(22, adj(300)), T(23, adj(300))], 24).rest?.seconds).toBe(MAX_REST);
  });
  it('sin descanso en curso o en pausa no hace nada, y el esquema limita el salto', () => {
    expect(reduce(session, [T(0, { type: 'start' }), T(1, adj(15))], 2).rest).toBeNull();
    expect(reduce(session, [...base, T(21, { type: 'pause' }), T(22, adj(15))], 23).rest?.seconds).toBe(45);
    expect(eventSchema.safeParse(adj(301)).success).toBe(false);
    expect(eventSchema.safeParse(adj(1.5)).success).toBe(false);
  });
});
