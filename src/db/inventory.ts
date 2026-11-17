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

// El equipo propio solo vale en entornos del perfil que lo creó.
const isOwnItem = async (db: Db, environmentId: string, equipmentId: string) =>
  !!(await db.getFirstAsync(
    'SELECT 1 FROM custom_equipment c JOIN training_environments e ON e.profile_id = c.profile_id WHERE c.id = ? AND e.id = ?',
    [equipmentId, environmentId],
  ));

export async function assertKnownItem(db: Db, environmentId: string, equipmentId: string) {
  if (!known.has(equipmentId) && !(await isOwnItem(db, environmentId, equipmentId))) throw new Error(`Equipo desconocido: ${equipmentId}`);
}

/** `null` vuelve a «sin indicar» (borra la fila). */
export async function setItemState(db: Db, environmentId: string, equipmentId: string, state: ItemState | null) {
  await assertKnownItem(db, environmentId, equipmentId);
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
    const own = await tx.getAllAsync<{ id: string }>(
      'SELECT c.id FROM custom_equipment c JOIN training_environments e ON e.profile_id = c.profile_id WHERE e.id = ?',
      [environmentId],
    );
    for (const id of [...CATALOG.map((i) => i.id), ...own.map((o) => o.id)]) {
      await tx.runAsync(
        'INSERT OR REPLACE INTO environment_inventory (environment_id, equipment_id, state, updated_at) VALUES (?,?,?,?)',
        [environmentId, id, 'unavailable', now],
      );
    }
  });
}

export const clearInventory = (db: Db, environmentId: string) =>
  db.runAsync('DELETE FROM environment_inventory WHERE environment_id = ?', [environmentId]);

/** Recuento por entorno del perfil, para la revisión. */
export async function inventorySummary(db: Db, profileId: string) {
  return db.getAllAsync<{ kind: EnvKind; available: number; unavailable: number }>(
    `SELECT e.kind AS kind,
            COALESCE(SUM(i.state = 'available'), 0) AS available,
            COALESCE(SUM(i.state = 'unavailable'), 0) AS unavailable
     FROM training_environments e LEFT JOIN environment_inventory i ON i.environment_id = e.id
     WHERE e.profile_id = ? GROUP BY e.id ORDER BY e.rowid`,
    [profileId],
  );
}

/** Entornos del perfil con cuántos equipos indicó (disponibles / no disponibles). */
export async function listEnvironments(db: Db, profileId: string) {
  return db.getAllAsync<{ id: string; kind: EnvKind; available: number; unavailable: number }>(
    `SELECT e.id AS id, e.kind AS kind,
            COALESCE(SUM(i.state = 'available'), 0) AS available,
            COALESCE(SUM(i.state = 'unavailable'), 0) AS unavailable
     FROM training_environments e LEFT JOIN environment_inventory i ON i.environment_id = e.id
     WHERE e.profile_id = ? GROUP BY e.id ORDER BY e.rowid`,
    [profileId],
  );
}
