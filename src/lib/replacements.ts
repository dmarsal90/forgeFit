import { normalize } from '../data/equipment';
import { EXERCISES, type Exercise } from '../data/exercises';
import { availableVariants, findVariant } from './exercises';
import { LIMITATION_LABEL } from './onboarding';
import type { PlanContext } from './planValidator';

export type Candidate = { variantId: string; exercise: Exercise; variantLabel: string; reason: string };

/** Ejercicios que el perfil puede hacer: variante disponible con su equipo, sin cargar zonas con molestias y no por encima de su nivel. */
function eligible(ctx: PlanContext, exclude: ReadonlySet<string>): { ex: Exercise; variantId: string; label: string }[] {
  const out: { ex: Exercise; variantId: string; label: string }[] = [];
  for (const ex of EXERCISES) {
    if (exclude.has(ex.id) || ex.level > ctx.level) continue;
    if (ex.stress.some((j) => ctx.limitations.joints.includes(j)) || ex.primary.some((m) => ctx.limitations.muscles.includes(m))) continue;
    const v = availableVariants(ex, ctx.have)[0];
    if (v) out.push({ ex, variantId: v.id, label: v.es });
  }
  return out;
}
const label = (ms: string[]) => ms.map((m) => LIMITATION_LABEL[m] ?? m).join(', ');

/**
 * Reemplazos equivalentes de un ejercicio: mismo patrón de movimiento y/o músculos principales, hechos con el equipo
 * realmente disponible. `sessionIds` = ejercicios ya presentes en la sesión (no se proponen de nuevo).
 */
export function suggestReplacements(variantId: string, ctx: PlanContext, sessionIds: readonly string[] = [], limit = 8): Candidate[] {
  const cur = findVariant(variantId)?.ex;
  if (!cur) return [];
  const exclude = new Set([cur.id, ...sessionIds.map((v) => v.split('.')[0])]);
  const scored = eligible(ctx, exclude).flatMap(({ ex, variantId: vid, label: vl }) => {
    const samePattern = ex.pattern === cur.pattern;
    const shared = ex.primary.filter((m) => cur.primary.includes(m));
    if (!samePattern && shared.length === 0) return [];
    const score = (samePattern ? 3 : 0) + shared.length * 2 + ex.secondary.filter((m) => cur.secondary.includes(m)).length - Math.abs(ex.level - cur.level) * 0.5;
    const why = [samePattern ? 'mismo patrón de movimiento' : null, shared.length ? `trabaja ${label(shared)}` : null].filter(Boolean).join(' y ');
    return [{ score, order: EXERCISES.indexOf(ex), c: { variantId: vid, exercise: ex, variantLabel: vl, reason: why.charAt(0).toUpperCase() + why.slice(1) } }];
  });
  return scored.sort((a, b) => b.score - a.score || a.order - b.order).slice(0, limit).map((x) => x.c);
}

/** Ejercicios que se pueden añadir a una sesión, filtrables por texto y por músculo principal. */
export function addableExercises(ctx: PlanContext, opts: { query?: string; muscle?: string; sessionIds?: readonly string[] } = {}): Candidate[] {
  const exclude = new Set((opts.sessionIds ?? []).map((v) => v.split('.')[0]));
  const words = normalize(opts.query ?? '').split(/\s+/).filter(Boolean);
  return eligible(ctx, exclude)
    .filter(({ ex }) => (!opts.muscle || ex.primary.includes(opts.muscle)) && words.every((w) => normalize(`${ex.es} ${ex.en}`).includes(w)))
    .map(({ ex, variantId, label: variantLabel }) => ({ variantId, exercise: ex, variantLabel, reason: `Trabaja ${label(ex.primary)}` }));
}
