import { e1rm } from './strength';
import { variantOf, type Performed } from './workoutMachine';
import type { PlanSession } from './plan';

export type VariantRecord = {
  weight?: { kg: number; reps: number; at: number }; // la serie más pesada (a igual peso, la de más repeticiones)
  e1rm?: { e1rm: number; kg: number; reps: number; at: number };
  reps?: { reps: number; at: number }; // solo para series sin carga (peso corporal)
};
export type SetResult = { kg?: number; reps?: number; at: number };

/** Suma una serie a los récords de una variante. `broken` = había récords previos y esta serie mejora alguno (la primera vez no es récord). */
export function addSet(prev: VariantRecord | undefined, s: SetResult): { rec: VariantRecord; broken: boolean } {
  const rec: VariantRecord = { ...prev };
  let better = false;
  if (s.reps === undefined || s.reps < 1) return { rec, broken: false };
  if (s.kg !== undefined && s.kg > 0) {
    const w = rec.weight;
    if (!w || s.kg > w.kg || (s.kg === w.kg && s.reps > w.reps)) { rec.weight = { kg: s.kg, reps: s.reps, at: s.at }; better = true; }
    const est = e1rm(s.kg, s.reps);
    if (est !== null && (!rec.e1rm || est > rec.e1rm.e1rm)) { rec.e1rm = { e1rm: est, kg: s.kg, reps: s.reps, at: s.at }; better = true; }
  } else if (!rec.reps || s.reps > rec.reps.reps) { rec.reps = { reps: s.reps, at: s.at }; better = true; }
  return { rec, broken: better && prev !== undefined };
}

/** Récords por variante a partir de sesiones terminadas. Cuentan las series hechas sin dolor; ni saltadas ni calentamientos (no están en `done`). */
export function personalRecords(workouts: readonly { at: number; session: PlanSession; done: Readonly<Record<string, Performed>> }[]): Record<string, VariantRecord> {
  const out: Record<string, VariantRecord> = {};
  for (const w of [...workouts].sort((a, b) => a.at - b.at)) {
    for (const [key, d] of Object.entries(w.done)) {
      const id = variantOf(w.session, w.done, key);
      if (!id || d.skipped || d.pain === 'pain') continue;
      out[id] = addSet(out[id], { kg: d.weightKg, reps: d.reps, at: w.at }).rec;
    }
  }
  return out;
}
