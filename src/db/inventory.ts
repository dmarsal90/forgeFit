import { CATALOG } from '../data/equipment';
import type { Db } from './index';

export type ItemState = 'available' | 'unavailable';
export type EnvKind = 'home' | 'gym' | 'outdoor' | 'travel';
export const ENV_LABELS: Record<EnvKind, string> = { home: 'Casa', gym: 'Gimnasio', outdoor: 'Aire libre', travel: 'Viajes' };

const known = new Set(CATALOG.map((i) => i.id));

/** Devuelve el entorno del perfil para ese tipo, creándolo si no existe. */
export async function ensureEnvironment(db: Db, profileId: string, kind: EnvKind): Promise<string> {
  const found = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM training_environments WHERE profile_id = ? AND kind = ?',
    [profileId, kind],
  );
  if (found) return found.id;
  const r = await db.getFirstAsync<{ id: string }>('SELECT lower(hex(randomblob(16))) AS id');
  if (!r) throw new Error('No se pudo generar el id');
  await db.runAsync(
    'INSERT INTO training_environments (id, profile_id, kind, name, created_at) VALUES (?,?,?,?,?)',
    [r.id, profileId, kind, ENV_LABELS[kind], new Date().toISOString()],
  );
  return r.id;
}

export async function getInventory(db: Db, environmentId: string): Promise<Record<string, ItemState>> {
  const rows = await db.getAllAsync<{ equipment_id: string; state: ItemState }>(
    'SELECT equipment_id, state FROM environment_inventory WHERE environment_id = ?',
    [environmentId],
  );
  return Object.fromEntries(rows.map((r) => [r.equipment_id, r.state]));
}

/** `null` vuelve a «sin indicar» (borra la fila). */
export async function setItemState(db: Db, environmentId: string, equipmentId: string, state: ItemState | null) {
  if (!known.has(equipmentId)) throw new Error(`Equipo desconocido: ${equipmentId}`);
  if (state === null) {
    await db.runAsync('DELETE FROM environment_inventory WHERE environment_id = ? AND equipment_id = ?', [environmentId, equipmentId]);
    return;
  }
  await db.runAsync(
    'INSERT OR REPLACE INTO environment_inventory (environment_id, equipment_id, state, updated_at) VALUES (?,?,?,?)',
    [environmentId, equipmentId, state, new Date().toISOString()],
  );
}

/** «No tengo equipamiento»: confirma como ausente todo el catálogo de ese entorno. */
export async function markNoEquipment(db: Db, environmentId: string) {
  const now = new Date().toISOString();
  await db.withExclusiveTransactionAsync(async (tx) => {
    for (const i of CATALOG) {
      await tx.runAsync(
        'INSERT OR REPLACE INTO environment_inventory (environment_id, equipment_id, state, updated_at) VALUES (?,?,?,?)',
        [environmentId, i.id, 'unavailable', now],
      );
    }
  });
}

export const clearInventory = (db: Db, environmentId: string) =>
  db.runAsync('DELETE FROM environment_inventory WHERE environment_id = ?', [environmentId]);
