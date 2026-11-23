import { ISOMETRIC } from '../lib/planEngine';
import { findVariant } from '../lib/exercises';
import type { PlanSession } from '../lib/plan';
import { cyclePosition, loadLabel, phaseWeight } from '../lib/cycles';
import { toDateKey } from '../lib/schedule';
import { suggestProgression, variantHistory, type Suggestion } from '../lib/progression';
import { fmtWeight, unitToKg, type WeightUnit } from '../lib/units';
import { barSystem, equipmentIds, isBar, isPlates, loadModel, plateSystem, type OwnedItem } from '../lib/loadModel';
import type { PlateStock } from '../lib/plates';
import { getActiveCycle } from './cycles';
import { getAttributes } from './equipmentAttributes';
import { listEnvironmentPlates, toStock } from './equipmentPlates';
import { getInventory } from './inventory';
import type { Db } from './index';
import { loadFinishedWorkouts } from './stats';

const HISTORY_WORKOUTS = 200;
const DEFAULT_STEP = { kg: 2.5, lb: 5 }; // escalón por defecto en la unidad del perfil

/**
 * Equipo que la persona tiene disponible y puede usar en esa variante, y los discos que tiene que caben en su barra (la manga de 25 mm y
 * la olímpica no admiten los mismos). Si tiene barras de los dos sistemas no se sabe cuál usa: `mixedSystems`.
 */
async function ownedFor(db: Db, envId: string, variantId: string): Promise<{ owned: OwnedItem[]; stock: PlateStock[]; mixedSystems: boolean } | null> {
  const variant = findVariant(variantId)?.variant;
  if (!variant) return null;
  const inventory = await getInventory(db, envId);
  const ids = new Set(equipmentIds(variant.requires));
  // Cualquier disco que tenga sirve para cargar una barra, aunque el ejercicio no lo nombre (p. ej. los fraccionales).
  if ([...ids].some(isPlates)) for (const id of Object.keys(inventory)) if (isPlates(id)) ids.add(id);
  const have = [...ids].filter((id) => inventory[id] === 'available'); // solo cuenta lo que tiene, no las alternativas que el ejercicio también admitiría
  const systems = new Set(have.filter(isBar).map(barSystem));
  const mixedSystems = systems.size > 1;
  const fits = (plateId: string) => systems.size === 0 || (!mixedSystems && systems.has(plateSystem(plateId)));
  const owned: OwnedItem[] = [];
  for (const id of have) {
    if (isPlates(id) && !fits(id)) continue;
    const a = await getAttributes(db, envId, id);
    owned.push({ id, stepKg: a.stepKg, barKg: a.barKg });
  }
  const plates = (await listEnvironmentPlates(db, envId)).filter((r) => inventory[r.equipmentId] === 'available' && fits(r.equipmentId));
  return { owned, stock: toStock(plates), mixedSystems };
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
    if (ctx.mixedSystems) out[id] = { hint: 'Tienes barras con discos de distinto tamaño (estándar y olímpica). Deja marcada solo la que usas para ver qué discos poner.' };
    else if (barKg === undefined) out[id] = { hint: 'Para ver qué discos poner, deja marcada solo la barra que usas o indica cuánto pesa en su ficha.' };
    else if (!ctx.stock.length) out[id] = { hint: 'Indica tus discos en su ficha para ver qué poner en cada lado.' };
    else out[id] = { barKg, stock: ctx.stock };
  }
  return out;
}

/** Sugerencia de progresión para cada ejercicio de la sesión, a partir de las sesiones terminadas del perfil. */
export async function loadSuggestions(db: Db, profileId: string, session: PlanSession, unit: WeightUnit): Promise<Record<string, Suggestion>> {
  const workouts = await loadFinishedWorkouts(db, profileId, HISTORY_WORKOUTS);
  const plan = await db.getFirstAsync<{ environment_id: string | null }>("SELECT environment_id FROM training_plans WHERE profile_id = ? AND status = 'active'", [profileId]);
  const cycle = await getActiveCycle(db, profileId);
  const pos = cycle ? cyclePosition(cycle.startDate, cycle.blocks, toDateKey()) : null;
  const block = pos?.state === 'running' && pos.block.loadModifier !== 1 ? pos.block : null;
  const out: Record<string, Suggestion> = {};
  for (const item of session.blocks.flatMap((b) => b.items)) {
    const id = item.exerciseVariantId;
    if (out[id]) continue;
    const seconds = ISOMETRIC.has(id.split('.')[0]);
    const load = await loadFor(db, plan?.environment_id ?? null, id, unit);
    const s = suggestProgression(variantHistory(workouts, id), { sets: item.sets, repRange: item.repRange, unit: seconds ? 'seconds' : 'reps' }, { ...load, fmt: (kg) => fmtWeight(kg, unit) });
    // Solo al mantener o subir: bajar o descargar ya reducen la carga y no se apila otro recorte encima.
    if (block && s.weightKg !== undefined && (s.kind === 'hold' || s.kind === 'increase')) {
      const weightKg = phaseWeight(s.weightKg, block.loadModifier, load.stepKg, load.barKg);
      s.phase = { text: `${block.goal} · ${loadLabel(block.loadModifier)}: ${fmtWeight(weightKg, unit)}`, weightKg };
    }
    out[id] = s;
  }
  return out;
}
