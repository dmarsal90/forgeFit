import type { Plan, PlanSession } from '../src/lib/plan';
import { diffPlans } from '../src/lib/planDiff';

const item = (id: string, sets = 3) => ({ exerciseVariantId: id, sets, repRange: [8, 12] as [number, number], restSeconds: 90 });
const sess = (day: number, name: string, ex = 'bench_press.barbell', sets = 3): PlanSession => ({ day, name, blocks: [{ type: 'single', items: [item(ex, sets)] }] });
const plan = (...sessions: PlanSession[]): Plan => ({ schemaVersion: 1, mode: 'local', sessions });

describe('diffPlans', () => {
  it('sin cambios no devuelve nada', () => {
    expect(diffPlans(plan(sess(0, 'A'), sess(2, 'B')), plan(sess(0, 'A'), sess(2, 'B')))).toEqual([]);
  });
  it('una sesión que cambia de día es «movida», no quitada y añadida', () => {
    expect(diffPlans(plan(sess(0, 'A'), sess(2, 'B')), plan(sess(0, 'A'), sess(3, 'B')))).toEqual(['B: Miércoles → Jueves']);
  });
  it('un intercambio de días muestra ambas sesiones movidas', () => {
    const lines = diffPlans(plan(sess(0, 'A'), sess(2, 'B')), plan(sess(0, 'B'), sess(2, 'A')));
    expect(lines).toEqual(['B: Miércoles → Lunes', 'A: Lunes → Miércoles']);
  });
  it('cambios de prescripción se prefijan con la sesión', () => {
    const lines = diffPlans(plan(sess(0, 'A', 'bench_press.barbell', 3)), plan(sess(0, 'A', 'bench_press.barbell', 4)));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^A: .*3×8-12.*→ 4×8-12/);
  });
  it('mismo día con otro nombre se muestra como cambios de esa sesión, no como quitada y añadida', () => {
    const lines = diffPlans(plan(sess(0, 'A')), plan(sess(0, 'Z')));
    expect(lines).toEqual(['Lunes (Z): Nombre: «A» → «Z»']);
  });
  it('sesión quitada y añadida', () => {
    expect(diffPlans(plan(sess(0, 'A'), sess(2, 'B')), plan(sess(0, 'A'), sess(4, 'C')))).toEqual(['Sesión quitada: B (Miércoles)', 'Sesión añadida: C (Viernes)']);
  });
  it('tolera ejercicios que ya no están en el catálogo', () => {
    expect(() => diffPlans(plan(sess(0, 'A', 'ya_no_existe.x')), plan(sess(0, 'A', 'bench_press.barbell')))).not.toThrow();
  });
});
