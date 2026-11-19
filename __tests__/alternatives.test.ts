import { CATALOG } from '../src/data/equipment';
import { EXERCISES } from '../src/data/exercises';
import { alternatives, isEligible } from '../src/lib/alternatives';
import { availableVariants } from '../src/lib/exercises';

const FULL_GYM = new Set(CATALOG.filter((i) => i.id !== 'free_space').map((i) => i.id));
const ctx = (over = {}) => ({ level: 3 as const, have: FULL_GYM, limitations: { joints: [] as string[], muscles: [] as string[] }, ...over });
const byId = (id: string) => EXERCISES.find((e) => e.id === id)!;

it('los equivalentes comparten patrón y algún músculo primario, y nunca incluyen el original', () => {
  const orig = byId('back_squat');
  const alts = alternatives('back_squat', ctx());
  expect(alts.length).toBeGreaterThan(0);
  expect(alts.length).toBeLessThanOrEqual(5);
  for (const { exercise } of alts) {
    expect(exercise.id).not.toBe('back_squat');
    expect(exercise.pattern).toBe(orig.pattern);
    expect(exercise.primary.some((m) => orig.primary.includes(m))).toBe(true);
  }
});

it('respeta nivel, exclusiones, precauciones y equipo', () => {
  expect(alternatives('back_squat', ctx({ level: 1 })).every((a) => a.exercise.level === 1)).toBe(true);

  const first = alternatives('back_squat', ctx())[0].exercise.id;
  expect(alternatives('back_squat', ctx({ excluded: [first] })).some((a) => a.exercise.id === first)).toBe(false);

  const joint = byId(first).stress[0];
  if (joint) expect(alternatives('back_squat', ctx({ limitations: { joints: [joint], muscles: [] } })).some((a) => a.exercise.id === first)).toBe(false);

  const bodyweight = new Set(['free_space']);
  for (const { exercise, variant } of alternatives('back_squat', ctx({ have: bodyweight }))) {
    expect(availableVariants(exercise, bodyweight).map((v) => v.id)).toContain(variant.id);
  }
});

it('un ejercicio desconocido no devuelve nada y isEligible filtra por equipo', () => {
  expect(alternatives('no_existe', ctx())).toEqual([]);
  expect(isEligible(byId('back_squat'), ctx({ have: new Set<string>() }))).toBe(false);
});
