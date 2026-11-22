import { addSet, personalRecords } from '../src/lib/records';
import type { PlanSession } from '../src/lib/plan';

const session: PlanSession = { day: 0, name: 'X', blocks: [{ type: 'single', items: [{ exerciseVariantId: 'bench.bar', sets: 3, repRange: [5, 8], restSeconds: 90 }] }] };
const p = (weightKg: number | undefined, reps: number, extra = {}) => ({ weightKg, reps, skipped: false, corrected: false, ...extra });

describe('addSet', () => {
  it('la primera serie crea el récord pero no es «nuevo récord»', () => {
    const r = addSet(undefined, { kg: 60, reps: 8, at: 1 });
    expect(r.broken).toBe(false);
    expect(r.rec.weight).toMatchObject({ kg: 60, reps: 8 });
  });
  it('más peso, más repeticiones al mismo peso o más 1RM estimado rompen el récord; igualarlo no', () => {
    const base = addSet(undefined, { kg: 60, reps: 8, at: 1 }).rec;
    expect(addSet(base, { kg: 62.5, reps: 5, at: 2 }).broken).toBe(true); // más peso
    expect(addSet(base, { kg: 60, reps: 9, at: 2 }).broken).toBe(true);
    expect(addSet(base, { kg: 55, reps: 12, at: 2 }).broken).toBe(true); // menos peso pero más 1RM (77 > 76)
    expect(addSet(base, { kg: 60, reps: 8, at: 2 }).broken).toBe(false);
    expect(addSet(base, { kg: 50, reps: 5, at: 2 }).broken).toBe(false);
  });
  it('sin carga cuenta las repeticiones; sin repeticiones no cuenta', () => {
    const base = addSet(undefined, { reps: 10, at: 1 }).rec;
    expect(base.reps?.reps).toBe(10);
    expect(addSet(base, { kg: 0, reps: 12, at: 2 }).broken).toBe(true);
    expect(addSet(base, { kg: 80, at: 2 }).broken).toBe(false);
  });
});

describe('personalRecords', () => {
  it('ignora series saltadas y con dolor, y se queda con el mejor valor de cada variante', () => {
    const r = personalRecords([
      { at: 2, session, done: { '0.0.0': p(70, 5), '0.0.1': p(100, 5, { pain: 'pain' }), '0.0.2': { skipped: true, corrected: false } } },
      { at: 1, session, done: { '0.0.0': p(60, 8, { pain: 'discomfort' }) } },
    ]);
    expect(r['bench.bar'].weight).toMatchObject({ kg: 70, at: 2 });
    expect(r['bench.bar'].e1rm?.e1rm).toBeCloseTo(70 * (1 + 5 / 30));
  });
  it('usa la variante realmente hecha', () => {
    const r = personalRecords([{ at: 1, session, done: { '0.0.0': p(40, 10, { variantId: 'bench.db' }) } }]);
    expect(Object.keys(r)).toEqual(['bench.db']);
  });
});
