import { z } from 'zod';
import { KG_PER_LB, type PlateStock } from '../lib/plates';
import type { Db } from './index';
import { assertKnownItem } from './inventory';

/** Un tamaño de disco con sus pares, en la unidad en la que está marcado (los discos de un entorno pueden estar en kg, en lb o en ambas). */
export const plateRowSchema = z.object({
  unit: z.enum(['kg', 'lb']),
  value: z.number().gt(0, 'El disco debe pesar más de 0').max(500, 'Máximo 500'),
  pairs: z.number().int().min(1, 'Al menos un par').max(20, 'Máximo 20 pares'),
});
export type PlateRow = z.infer<typeof plateRowSchema>;
const rowsSchema = z.array(plateRowSchema).max(60).refine((r) => new Set(r.map((x) => `${x.unit}:${x.value}`)).size === r.length, { message: 'Hay un disco repetido' });

const trim = (n: number) => String(Math.round(n * 100) / 100);
export const plateLabel = (r: Pick<PlateRow, 'unit' | 'value'>) => `${trim(r.value)} ${r.unit}`;
export const plateKg = (r: Pick<PlateRow, 'unit' | 'value'>) => Math.round((r.unit === 'lb' ? r.value * KG_PER_LB : r.value) * 1e9) / 1e9;
export const toStock = (rows: readonly PlateRow[]): PlateStock[] => rows.map((r) => ({ kg: plateKg(r), pairs: r.pairs, label: plateLabel(r) }));

const order = (a: PlateRow, b: PlateRow) => (a.unit === b.unit ? b.value - a.value : a.unit === 'kg' ? -1 : 1);

export async function listPlates(db: Db, environmentId: string, equipmentId: string): Promise<PlateRow[]> {
  const rows = await db.getAllAsync<PlateRow>('SELECT unit, value, pairs FROM equipment_plates WHERE environment_id = ? AND equipment_id = ?', [environmentId, equipmentId]);
  return rows.sort(order);
}

/** Todos los discos de un entorno (de cualquier tipo de disco), para calcular montajes. */
export async function listEnvironmentPlates(db: Db, environmentId: string): Promise<(PlateRow & { equipmentId: string })[]> {
  const rows = await db.getAllAsync<PlateRow & { equipment_id: string }>('SELECT equipment_id, unit, value, pairs FROM equipment_plates WHERE environment_id = ?', [environmentId]);
  return rows.map(({ equipment_id, ...r }) => ({ ...r, equipmentId: equipment_id }));
}

/** Sustituye los discos de ese equipo por los dados (valida todo antes de escribir; todo o nada). */
export async function setPlates(db: Db, environmentId: string, equipmentId: string, input: PlateRow[]) {
  const rows = rowsSchema.parse(input);
  await assertKnownItem(db, environmentId, equipmentId);
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync('DELETE FROM equipment_plates WHERE environment_id = ? AND equipment_id = ?', [environmentId, equipmentId]);
    for (const r of rows) await tx.runAsync('INSERT INTO equipment_plates (environment_id, equipment_id, unit, value, pairs) VALUES (?,?,?,?,?)', [environmentId, equipmentId, r.unit, r.value, r.pairs]);
  });
}
