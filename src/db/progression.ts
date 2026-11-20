import { ISOMETRIC } from '../lib/planEngine';
import { findVariant } from '../lib/exercises';
import type { PlanSession } from '../lib/plan';
import { suggestProgression, variantHistory, type Suggestion } from '../lib/progression';
import { fmtWeight, unitToKg, type WeightUnit } from '../lib/units';
import type { Req } from '../data/exercises';
import { getAttributes } from './equipmentAttributes';
import type { Db } from './index';
import { loadFinishedWorkouts } from './stats';

const HISTORY_WORKOUTS = 200;
const DEFAULT_STEP = { kg: 2.5, lb: 5 }; // escalón por defecto en la unidad del perfil

const equipmentIds = (r: Req): string[] => (typeof r === 'string' ? [r] : 'all' in r ? r.all.flatMap(equipmentIds) : r.any.flatMap(equipmentIds));

/** Escalón de carga de una variante: el menor `stepKg` de las fichas del equipo que usa en el entorno del plan; si no hay, el de por defecto. */
async function stepKgFor(db: Db, envId: string | null, variantId: string, unit: WeightUnit): Promise<number> {
  const fallback = unitToKg(DEFAULT_STEP[unit], unit);
  const variant = findVariant(variantId)?.variant;
  if (!envId || !variant) return fallback;
  const steps: number[] = [];
  for (const id of new Set(equipmentIds(variant.requires))) {
    const a = await getAttributes(db, envId, id);
    if (a.stepKg !== null) steps.push(a.stepKg);
  }
  return steps.length ? Math.min(...steps) : fallback;
}

/** Sugerencia de progresión para cada ejercicio de la sesión, a partir de las sesiones terminadas del perfil. */
export async function loadSuggestions(db: Db, profileId: string, session: PlanSession, unit: WeightUnit): Promise<Record<string, Suggestion>> {
  const workouts = await loadFinishedWorkouts(db, profileId, HISTORY_WORKOUTS);
  const plan = await db.getFirstAsync<{ environment_id: string | null }>("SELECT environment_id FROM training_plans WHERE profile_id = ? AND status = 'active'", [profileId]);
  const out: Record<string, Suggestion> = {};
  for (const item of session.blocks.flatMap((b) => b.items)) {
    const id = item.exerciseVariantId;
    if (out[id]) continue;
    const seconds = ISOMETRIC.has(id.split('.')[0]);
    out[id] = suggestProgression(variantHistory(workouts, id), { sets: item.sets, repRange: item.repRange, unit: seconds ? 'seconds' : 'reps' },
      { stepKg: await stepKgFor(db, plan?.environment_id ?? null, id, unit), fmt: (kg) => fmtWeight(kg, unit) });
  }
  return out;
}
