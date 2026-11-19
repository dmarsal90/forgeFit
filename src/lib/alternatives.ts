import { EXERCISES, type Exercise, type Variant } from '../data/exercises';
import { availableVariants } from './exercises';
import { variantModality } from './modality';
import type { PlanContext } from './planValidator';

export type EligibilityContext = Pick<PlanContext, 'level' | 'have' | 'limitations'> & { excluded?: readonly string[] };

/** Ejercicios que el usuario puede hacer: nivel, equipo, precauciones y exclusiones. */
export function isEligible(e: Exercise, c: EligibilityContext): boolean {
  return e.level <= c.level && !c.excluded?.includes(e.id) && availableVariants(e, c.have).length > 0 &&
    !e.stress.some((j) => c.limitations.joints.includes(j)) && !e.primary.some((m) => c.limitations.muscles.includes(m));
}

const order = new Map(EXERCISES.map((x, i) => [x.id, i]));

/** Equivalentes de un ejercicio: mismo patrón y algún músculo primario en común, ordenados por parecido. */
export function alternatives(exerciseId: string, c: EligibilityContext, limit = 5): { exercise: Exercise; variant: Variant }[] {
  const ex = EXERCISES.find((e) => e.id === exerciseId);
  if (!ex) return [];
  const mods = new Set(availableVariants(ex, c.have).map(variantModality));
  const shared = (e: Exercise) => e.primary.filter((m) => ex.primary.includes(m)).length;
  const sameMod = (vs: Variant[]) => (vs.some((v) => mods.has(variantModality(v))) ? 1 : 0);
  return EXERCISES
    .filter((e) => e.id !== ex.id && e.pattern === ex.pattern && shared(e) > 0 && isEligible(e, c))
    .map((e) => ({ e, vs: availableVariants(e, c.have) }))
    .sort((a, b) => sameMod(b.vs) - sameMod(a.vs) || shared(b.e) - shared(a.e)
      || Math.abs(a.e.level - ex.level) - Math.abs(b.e.level - ex.level) || order.get(a.e.id)! - order.get(b.e.id)!)
    .slice(0, limit)
    .map(({ e, vs }) => ({ exercise: e, variant: vs.find((v) => mods.has(variantModality(v))) ?? vs[0] }));
}
