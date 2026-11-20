import { ISOMETRIC } from '../lib/planEngine';
import { findVariant } from '../lib/exercises';
import type { PlanSession } from '../lib/plan';
import { suggestProgression, variantHistory, type Suggestion } from '../lib/progression';
import { fmtWeight, unitToKg, type WeightUnit } from '../lib/units';
import { equipmentIds, isPlates, loadModel, type OwnedItem } from '../lib/loadModel';
import { getAttributes } from './equipmentAttributes';
import { getInventory } from './inventory';
import type { Db } from './index';
import { loadFinishedWorkouts } from './stats';

const HISTORY_WORKOUTS = 200;
const DEFAULT_STEP = { kg: 2.5, lb: 5 }; // escalón por defecto en la unidad del perfil

/** Escalón y barra de una variante según el equipo que la persona tiene disponible en el entorno del plan (ver `loadModel`). */
async function loadFor(db: Db, envId: string | null, variantId: string, unit: WeightUnit): Promise<{ stepKg: number; barKg?: number }> {
  const fallback = unitToKg(DEFAULT_STEP[unit], unit);
  const variant = findVariant(variantId)?.variant;
  if (!envId || !variant) return { stepKg: fallback };
  const inventory = await getInventory(db, envId);
  const owned: OwnedItem[] = [];
  const ids = new Set(equipmentIds(variant.requires));
  // Cualquier disco que tenga sirve para cargar una barra, aunque el ejercicio no lo nombre (p. ej. los fraccionales).
  if ([...ids].some(isPlates)) for (const id of Object.keys(inventory)) if (isPlates(id)) ids.add(id);
  for (const id of ids) {
    if (inventory[id] !== 'available') continue; // solo cuenta lo que tiene, no las alternativas que el ejercicio también admitiría
    const a = await getAttributes(db, envId, id);
    owned.push({ id, stepKg: a.stepKg, barKg: a.barKg });
  }
  const m = loadModel(owned);
  return { stepKg: m.stepKg ?? fallback, barKg: m.barKg };
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
      { ...(await loadFor(db, plan?.environment_id ?? null, id, unit)), fmt: (kg) => fmtWeight(kg, unit) });
  }
  return out;
}
