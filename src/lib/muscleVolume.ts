import { EXERCISES } from '../data/exercises';
import { LIMITATION_LABEL } from './onboarding';
import type { Plan, PlanSession } from './plan';
import type { Performed } from './workoutMachine';

export type MuscleSets = { muscle: string; label: string; done: number; planned: number };

const primaryOf = (variantId: string) => EXERCISES.find((e) => e.id === variantId.split('.')[0])?.primary ?? [];
// Una serie cuenta entera para cada músculo primario del ejercicio (no se reparte).
const add = (acc: Map<string, number>, variantId: string, sets: number) => { for (const m of primaryOf(variantId)) acc.set(m, (acc.get(m) ?? 0) + sets); };

/** Series planificadas por músculo en una semana tipo del plan. */
export function plannedSets(plan: Plan): Map<string, number> {
  const acc = new Map<string, number>();
  for (const s of plan.sessions) for (const b of s.blocks) for (const i of b.items) add(acc, i.exerciseVariantId, i.sets);
  return acc;
}

/** Series realizadas por músculo en las sesiones dadas (las saltadas no cuentan). */
export function doneSets(workouts: readonly { session: PlanSession; done: Readonly<Record<string, Performed>> }[]): Map<string, number> {
  const acc = new Map<string, number>();
  for (const w of workouts) {
    for (const [key, d] of Object.entries(w.done)) {
      if (d.skipped) continue;
      const [b, i] = key.split('.').map(Number);
      const v = w.session.blocks[b]?.items[i]?.exerciseVariantId;
      if (v) add(acc, v, 1);
    }
  }
  return acc;
}

export function muscleSets(planned: Map<string, number>, done: Map<string, number>): MuscleSets[] {
  return [...new Set([...planned.keys(), ...done.keys()])]
    .map((muscle) => ({ muscle, label: LIMITATION_LABEL[muscle] ?? muscle, done: done.get(muscle) ?? 0, planned: planned.get(muscle) ?? 0 }))
    .sort((a, b) => b.planned - a.planned || b.done - a.done || a.label.localeCompare(b.label));
}
