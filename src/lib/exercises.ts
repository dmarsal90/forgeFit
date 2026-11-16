import { EXERCISES, type Exercise, type Req, type Variant } from '../data/exercises';

/** `have` = ids confirmados como disponibles. Lo no indicado o ausente nunca cuenta como disponible. */
export function meets(req: Req, have: ReadonlySet<string>): boolean {
  if (typeof req === 'string') return have.has(req);
  if ('all' in req) return req.all.every((r) => meets(r, have));
  return req.any.some((r) => meets(r, have));
}

export const availableVariants = (ex: Exercise, have: ReadonlySet<string>): Variant[] =>
  ex.variants.filter((v) => meets(v.requires, have));

export const availableExercises = (have: ReadonlySet<string>): Exercise[] =>
  EXERCISES.filter((ex) => availableVariants(ex, have).length > 0);
