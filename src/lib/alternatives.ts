import { availableVariants } from './exercises';
import type { Exercise } from '../data/exercises';
import type { PlanContext } from './planValidator';

/** Ejercicios que el usuario puede hacer: nivel, equipo, precauciones y exclusiones. */
export function isEligible(e: Exercise, c: Pick<PlanContext, 'level' | 'have' | 'limitations' | 'excluded'>): boolean {
  return e.level <= c.level && !c.excluded?.includes(e.id) && availableVariants(e, c.have).length > 0 &&
    !e.stress.some((j) => c.limitations.joints.includes(j)) && !e.primary.some((m) => c.limitations.muscles.includes(m));
}
