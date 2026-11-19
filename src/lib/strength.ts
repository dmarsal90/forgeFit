import { EXERCISES } from '../data/exercises';
import type { PlanSession } from './plan';
import type { Performed } from './workoutMachine';

export type StrengthPoint = { at: number; kg: number; reps: number; e1rm: number };
export type ExerciseStrength = { exerciseId: string; name: string; points: StrengthPoint[] }; // puntos en orden cronológico

// shortcut: Epley solo es fiable hasta ~12 repeticiones; por encima no se estima. Revisar si se añade otra fórmula por rango.
/** 1RM estimado (Epley); null si el dato no sirve para estimarlo. */
export function e1rm(kg: number, reps: number): number | null {
  if (!(kg > 0) || !Number.isInteger(reps) || reps < 1 || reps > 12) return null;
  return kg * (1 + reps / 30);
}

export type FinishedWorkout = { at: number; session: PlanSession; done: Readonly<Record<string, Performed>> };

/** Mejor serie (por 1RM estimado) de cada ejercicio en cada sesión terminada. Las series saltadas o sin peso/repeticiones no cuentan. */
export function strengthHistory(workouts: readonly FinishedWorkout[]): ExerciseStrength[] {
  const byEx = new Map<string, StrengthPoint[]>();
  for (const w of [...workouts].sort((a, b) => a.at - b.at)) {
    const best = new Map<string, StrengthPoint>();
    for (const [key, d] of Object.entries(w.done)) {
      if (d.skipped || d.weightKg === undefined || d.reps === undefined) continue;
      const [b, i] = key.split('.').map(Number);
      const variantId = w.session.blocks[b]?.items[i]?.exerciseVariantId;
      const est = variantId ? e1rm(d.weightKg, d.reps) : null;
      if (!variantId || est === null) continue;
      const id = variantId.split('.')[0];
      if (!best.has(id) || est > best.get(id)!.e1rm) best.set(id, { at: w.at, kg: d.weightKg, reps: d.reps, e1rm: est });
    }
    for (const [id, p] of best) byEx.set(id, [...(byEx.get(id) ?? []), p]);
  }
  return [...byEx].map(([exerciseId, points]) => ({ exerciseId, name: EXERCISES.find((e) => e.id === exerciseId)?.es ?? exerciseId, points }))
    .sort((a, b) => b.points[b.points.length - 1].at - a.points[a.points.length - 1].at);
}
