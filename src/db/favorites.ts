import { CATALOG } from '../data/equipment';
import type { Db } from './index';

const known = new Set(CATALOG.map((i) => i.id));

export async function listFavorites(db: Db, profileId: string): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ equipment_id: string }>('SELECT equipment_id FROM equipment_favorites WHERE profile_id = ?', [profileId]);
  return new Set(rows.map((r) => r.equipment_id));
}

/** Idempotente: marcar dos veces o desmarcar lo no marcado no cambia nada. */
export async function setFavorite(db: Db, profileId: string, equipmentId: string, on: boolean) {
  if (!on) {
    await db.runAsync('DELETE FROM equipment_favorites WHERE profile_id = ? AND equipment_id = ?', [profileId, equipmentId]);
    return;
  }
  if (!known.has(equipmentId) && !(await db.getFirstAsync('SELECT 1 FROM custom_equipment WHERE id = ? AND profile_id = ?', [equipmentId, profileId]))) {
    throw new Error(`Equipo desconocido: ${equipmentId}`);
  }
  await db.runAsync('INSERT OR IGNORE INTO equipment_favorites (profile_id, equipment_id, created_at) VALUES (?,?,?)', [profileId, equipmentId, new Date().toISOString()]);
}
