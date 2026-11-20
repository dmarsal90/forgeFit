import { ISOMETRIC } from '../lib/planEngine';
import { findVariant } from '../lib/exercises';
import type { PlanSession } from '../lib/plan';
import { suggestProgression, variantHistory, type Suggestion } from '../lib/progression';
import { fmtWeight, unitToKg, type WeightUnit } from '../lib/units';
import { equipmentIds, isBar, isPlates, loadModel, type OwnedItem } from '../lib/loadModel';
import type { PlateStock } from '../lib/plates';
import { getAttributes } from './equipmentAttributes';
import { listEnvironmentPlates, toStock } from './equipmentPlates';
import { getInventory } from './inventory';
import type { Db } from './index';
import { loadFinishedWorkouts } from './stats';

const HISTORY_WORKOUTS = 200;
const DEFAULT_STEP = { kg: 2.5, lb: 5 }; // escalón por defecto en la unidad del perfil

/** Equipo que la persona tiene disponible y puede usar en esa variante, y los discos que tiene (de cualquier unidad). */
async function ownedFor(db: Db, envId: string, variantId: string): Promise<{ owned: OwnedItem[]; stock: PlateStock[] } | null> {
  const variant = findVariant(variantId)?.variant;
  if (!variant) return null;
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
  const plates = (await listEnvironmentPlates(db, envId)).filter((r) => inventory[r.equipmentId] === 'available');
  return { owned, stock: toStock(plates) };
}

/** Escalón y barra de una variante según el equipo que la persona tiene (ver `loadModel`). */
async function loadFor(db: Db, envId: string | null, variantId: string, unit: WeightUnit): Promise<{ stepKg: number; barKg?: number }> {
  const fallback = unitToKg(DEFAULT_STEP[unit], unit);
  const ctx = envId ? await ownedFor(db, envId, variantId) : null;
  if (!ctx) return { stepKg: fallback };
  const m = loadModel(ctx.owned, ctx.stock);
  return { stepKg: m.stepKg ?? fallback, barKg: m.barKg };
}

export type PlateInfo = { barKg: number; stock: PlateStock[] } | { hint: string };
/**
 * Por cada ejercicio de la sesión que se carga con barra: lo necesario para decir qué discos poner por lado o, si falta algún dato,
 * una frase que dice cuál (no se calla: sin ella no se sabría por qué no sale el cálculo).
 */
export async function loadPlateInfo(db: Db, profileId: string, session: PlanSession): Promise<Record<string, PlateInfo>> {
  const plan = await db.getFirstAsync<{ environment_id: string | null }>("SELECT environment_id FROM training_plans WHERE profile_id = ? AND status = 'active'", [profileId]);
  const out: Record<string, PlateInfo> = {};
  if (!plan?.environment_id) return out;
  for (const item of session.blocks.flatMap((b) => b.items)) {
    const id = item.exerciseVariantId;
    if (out[id]) continue;
    const ctx = await ownedFor(db, plan.environment_id, id);
    if (!ctx || !ctx.owned.some((i) => isBar(i.id))) continue; // sin barra marcada como disponible no hay montaje que explicar
    const barKg = loadModel(ctx.owned, ctx.stock).barKg;
    if (barKg === undefined) out[id] = { hint: 'Para ver qué discos poner, deja marcada solo la barra que usas o indica cuánto pesa en su ficha.' };
    else if (!ctx.stock.length) out[id] = { hint: 'Indica tus discos en su ficha para ver qué poner en cada lado.' };
    else out[id] = { barKg, stock: ctx.stock };
  }
  return out;
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
