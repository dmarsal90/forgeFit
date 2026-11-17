import { z } from 'zod';
import { assertKnownItem } from './inventory';
import type { Db } from './index';

const kg = z.number().min(0).max(1000).nullable();
export const attributesSchema = z.object({
  minKg: kg, maxKg: kg, stepKg: z.number().gt(0).max(1000).nullable(), barKg: kg,
}).refine((a) => a.minKg === null || a.maxKg === null || a.minKg <= a.maxKg, { message: 'El mínimo no puede superar al máximo', path: ['minKg'] });

export type EquipmentAttributes = z.infer<typeof attributesSchema>;
export const NO_ATTRIBUTES: EquipmentAttributes = { minKg: null, maxKg: null, stepKg: null, barKg: null };

export async function getAttributes(db: Db, environmentId: string, equipmentId: string): Promise<EquipmentAttributes> {
  const r = await db.getFirstAsync<{ min_kg: number | null; max_kg: number | null; step_kg: number | null; bar_kg: number | null }>(
    'SELECT min_kg, max_kg, step_kg, bar_kg FROM equipment_attributes WHERE environment_id = ? AND equipment_id = ?',
    [environmentId, equipmentId],
  );
  return r ? { minKg: r.min_kg, maxKg: r.max_kg, stepKg: r.step_kg, barKg: r.bar_kg } : NO_ATTRIBUTES;
}

/** Todo `null` borra la fila: «sin atributos» es el estado por defecto. */
export async function setAttributes(db: Db, environmentId: string, equipmentId: string, input: EquipmentAttributes) {
  const a = attributesSchema.parse(input);
  await assertKnownItem(db, environmentId, equipmentId);
  if (Object.values(a).every((v) => v === null)) {
    await db.runAsync('DELETE FROM equipment_attributes WHERE environment_id = ? AND equipment_id = ?', [environmentId, equipmentId]);
    return;
  }
  await db.runAsync(
    'INSERT OR REPLACE INTO equipment_attributes (environment_id, equipment_id, min_kg, max_kg, step_kg, bar_kg, updated_at) VALUES (?,?,?,?,?,?,?)',
    [environmentId, equipmentId, a.minKg, a.maxKg, a.stepKg, a.barKg, new Date().toISOString()],
  );
}
