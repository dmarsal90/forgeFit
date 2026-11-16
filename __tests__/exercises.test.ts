import { CATALOG } from '../src/data/equipment';
import { EXERCISES, type Req } from '../src/data/exercises';
import { availableExercises, availableVariants, meets } from '../src/lib/exercises';
import { JOINT_IDS, MUSCLE_IDS } from '../src/lib/onboarding';

const equipmentIds = new Set(CATALOG.map((i) => i.id));
const ex = (id: string) => EXERCISES.find((e) => e.id === id)!;
const ok = (id: string, have: string[]) => availableVariants(ex(id), new Set(have)).length > 0;
const ids = (have: string[]) => availableExercises(new Set(have)).map((e) => e.id);

function refs(r: Req): string[] {
  if (typeof r === 'string') return [r];
  return ('all' in r ? r.all : r.any).flatMap(refs);
}

describe('integridad del catálogo', () => {
  it('ids únicos, variantes con id único y al menos una por ejercicio', () => {
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(EXERCISES.length);
    const variantIds = EXERCISES.flatMap((e) => e.variants.map((v) => v.id));
    expect(new Set(variantIds).size).toBe(variantIds.length);
    for (const e of EXERCISES) expect(e.variants.length).toBeGreaterThan(0);
  });
  it('todo requisito apunta a un equipo real del catálogo', () => {
    const bad = EXERCISES.flatMap((e) => e.variants.flatMap((v) => refs(v.requires))).filter((id) => !equipmentIds.has(id));
    expect(bad).toEqual([]);
  });
  it('músculos y articulaciones usan el vocabulario de las precauciones', () => {
    const muscles = new Set<string>(MUSCLE_IDS);
    const joints = new Set<string>(JOINT_IDS);
    for (const e of EXERCISES) {
      for (const m of [...e.primary, ...e.secondary]) expect([e.id, muscles.has(m)]).toEqual([e.id, true]);
      for (const j of e.stress) expect([e.id, joints.has(j)]).toEqual([e.id, true]);
      expect(e.primary.length).toBeGreaterThan(0);
    }
  });
  it('catálogo amplio y todos los grupos musculares tienen ejercicios primarios', () => {
    expect(EXERCISES.length).toBeGreaterThan(100);
    const covered = new Set(EXERCISES.flatMap((e) => e.primary));
    for (const m of MUSCLE_IDS) expect([m, covered.has(m)]).toEqual([m, true]);
  });
});

describe('requisitos ALL/ANY (casos del prompt)', () => {
  it('meets: all exige todo, any exige uno, vacío siempre cumple', () => {
    const have = new Set(['a', 'b']);
    expect(meets({ all: ['a', 'b'] }, have)).toBe(true);
    expect(meets({ all: ['a', 'c'] }, have)).toBe(false);
    expect(meets({ any: ['c', 'b'] }, have)).toBe(true);
    expect(meets({ any: ['c', 'd'] }, have)).toBe(false);
    expect(meets({ all: [] }, have)).toBe(true);
  });

  it('casa sin equipo: solo ejercicios de peso corporal', () => {
    const list = ids([]);
    expect(list).toEqual(expect.arrayContaining(['pushup', 'bodyweight_squat', 'plank', 'glute_bridge']));
    expect(list).not.toContain('bench_press');
    expect(list).not.toContain('pullup');
    for (const id of list) expect(ex(id).variants.some((v) => meets(v.requires, new Set()))).toBe(true);
  });

  it('un banco sin rack no habilita el press con barra; con rack o soportes integrados sí', () => {
    const base = ['bench_flat_fixed', 'barbell_olympic_20', 'plates_olympic_iron'];
    expect(ok('bench_press', base)).toBe(false);
    expect(ok('bench_press', [...base, 'rack_power_cage_4post'])).toBe(true);
    expect(ok('bench_press', ['bench_flat_rack', 'barbell_olympic_20', 'plates_olympic_iron'])).toBe(true);
    expect(ok('bench_press', ['bench_flat_rack', 'barbell_olympic_20'])).toBe(false); // sin discos no hay carga
  });

  it('una sola polea no habilita el cruce de poleas; dos salidas sí', () => {
    expect(ok('cable_crossover', ['cable_single_high', 'cable_att_handle_single'])).toBe(false);
    expect(ok('cable_crossover', ['cable_crossover_dual_adjustable'])).toBe(false); // faltan los agarres
    expect(ok('cable_crossover', ['cable_crossover_dual_adjustable', 'cable_att_handle_single'])).toBe(true);
    expect(ok('triceps_pushdown', ['cable_single_high'])).toBe(false); // falta el accesorio
    expect(ok('triceps_pushdown', ['cable_single_high', 'cable_att_rope'])).toBe(true);
  });

  it('pec deck y pec deck inverso no son intercambiables', () => {
    expect(ok('pec_deck', ['rear_delt_fly'])).toBe(false);
    expect(ok('reverse_pec_deck', ['rear_delt_fly'])).toBe(true);
    expect(ok('reverse_pec_deck', ['pec_deck_fly'])).toBe(false);
  });

  it('fondos lastrados requieren paralelas y medio de lastre', () => {
    const v = (have: string[]) => availableVariants(ex('dips'), new Set(have)).map((x) => x.id.split('.')[1]);
    expect(v(['dip_parallel_fixed'])).toEqual(['bodyweight']);
    expect(v(['dip_belt', 'plates_olympic_iron'])).toEqual([]); // sin paralelas
    expect(v(['dip_parallel_fixed', 'dip_belt', 'plates_olympic_iron'])).toEqual(['bodyweight', 'weighted']);
  });

  it('gimnasio sin máquinas: no aparece ningún ejercicio de máquina', () => {
    const list = ids(['bench_adjustable', 'dumbbells_fixed_hex', 'barbell_olympic_20', 'plates_olympic_iron', 'rack_power_cage_4post']);
    for (const id of ['chest_press_machine', 'leg_press', 'hack_squat', 'leg_curl', 'machine_row', 'pec_deck']) expect(list).not.toContain(id);
    expect(list).toEqual(expect.arrayContaining(['bench_press', 'db_bench_press', 'back_squat', 'deadlift']));
  });

  it('mancuernas sin banco: sin press de banco con mancuernas, pero sí sentadilla goblet y remo de pie', () => {
    const have = ['dumbbells_fixed_hex'];
    expect(ok('db_bench_press', have)).toBe(false);
    expect(ok('goblet_squat', have)).toBe(true);
    expect(ok('db_row', have)).toBe(true);
  });

  it('lo no indicado o confirmado ausente no habilita nada (solo lo disponible cuenta)', () => {
    expect(ok('leg_press', [])).toBe(false);
    expect(ids(['leg_press_45_plate'])).toEqual(expect.arrayContaining(['leg_press']));
  });
});
