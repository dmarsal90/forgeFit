import { z } from 'zod';
import { blocksError, type CycleBlock } from '../lib/cycles';
import { isDateKey, weekStart, type DateKey } from '../lib/schedule';
import type { Db } from './index';
import { newId } from './id';

const blockSchema = z.object({
  weekFrom: z.number().int().min(1),
  weekTo: z.number().int().min(1),
  goal: z.string().trim().min(1, 'Pon un objetivo').max(40, 'Máximo 40 caracteres'),
  loadModifier: z.number(),
});
export const cycleInputSchema = z.object({
  name: z.string().trim().min(1, 'Pon un nombre').max(40, 'Máximo 40 caracteres'),
  startDate: z.string().refine(isDateKey, 'Fecha no válida'),
  blocks: z.array(blockSchema),
}).superRefine((c, ctx) => { const e = blocksError(c.blocks); if (e) ctx.addIssue({ code: 'custom', message: e, path: ['blocks'] }); });
export type CycleInput = z.infer<typeof cycleInputSchema>;
export type Cycle = { id: string; name: string; startDate: DateKey; blocks: CycleBlock[] };

/** Crea el ciclo (empieza el lunes de `startDate`) y termina el activo, si lo hay; todo o nada. */
export async function createCycle(db: Db, profileId: string, input: CycleInput): Promise<string> {
  const c = cycleInputSchema.parse(input);
  const id = await newId(db);
  const now = new Date().toISOString();
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync('UPDATE training_cycles SET ended_at = ? WHERE profile_id = ? AND ended_at IS NULL', [now, profileId]);
    await tx.runAsync('INSERT INTO training_cycles (id, profile_id, name, start_date, created_at) VALUES (?,?,?,?,?)', [id, profileId, c.name, weekStart(c.startDate), now]);
    for (const b of c.blocks) await tx.runAsync('INSERT INTO training_blocks (cycle_id, week_from, week_to, goal, load_modifier) VALUES (?,?,?,?,?)', [id, b.weekFrom, b.weekTo, b.goal, b.loadModifier]);
  });
  return id;
}

export async function getActiveCycle(db: Db, profileId: string): Promise<Cycle | null> {
  const c = await db.getFirstAsync<{ id: string; name: string; start_date: string }>('SELECT id, name, start_date FROM training_cycles WHERE profile_id = ? AND ended_at IS NULL', [profileId]);
  if (!c) return null;
  const rows = await db.getAllAsync<{ week_from: number; week_to: number; goal: string; load_modifier: number }>('SELECT week_from, week_to, goal, load_modifier FROM training_blocks WHERE cycle_id = ? ORDER BY week_from', [c.id]);
  return { id: c.id, name: c.name, startDate: c.start_date, blocks: rows.map((r) => ({ weekFrom: r.week_from, weekTo: r.week_to, goal: r.goal, loadModifier: r.load_modifier })) };
}

/** Idempotente. Las sesiones y el historial no se tocan. */
export async function endActiveCycle(db: Db, profileId: string) {
  await db.runAsync('UPDATE training_cycles SET ended_at = ? WHERE profile_id = ? AND ended_at IS NULL', [new Date().toISOString(), profileId]);
}
