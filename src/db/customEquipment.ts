import { z } from 'zod';
import { FAMILIES, normalize, type CatalogItem } from '../data/equipment';
import { newId } from './id';
import type { Db } from './index';

export const CUSTOM_PREFIX = 'user_';

export const inputSchema = z.object({
  name: z.string().trim().min(1, 'Escribe un nombre').max(60, 'Máximo 60 caracteres'),
  family: z.enum(FAMILIES.map((f) => f.id) as [string, ...string[]]),
});

export async function addCustomItem(db: Db, profileId: string, input: { name: string; family: string }): Promise<CatalogItem> {
  const { name, family } = inputSchema.parse(input);
  const id = CUSTOM_PREFIX + (await newId(db));
  try {
    await db.runAsync('INSERT INTO custom_equipment (id, profile_id, family, name, name_key, created_at) VALUES (?,?,?,?,?,?)', [
      id, profileId, family, name, normalize(name), new Date().toISOString(),
    ]);
  } catch (e) {
    if (String(e).includes('UNIQUE')) throw new Error('Ya tienes un equipo con ese nombre');
    throw e;
  }
  return { id, family, es: name, en: '', aliases: [] };
}

export async function listCustomItems(db: Db, profileId: string): Promise<CatalogItem[]> {
  const rows = await db.getAllAsync<{ id: string; family: string; name: string }>(
    'SELECT id, family, name FROM custom_equipment WHERE profile_id = ? ORDER BY created_at, rowid',
    [profileId],
  );
  return rows.map((r) => ({ id: r.id, family: r.family, es: r.name, en: '', aliases: [] }));
}

/** Borra el equipo y su estado en todos los entornos del perfil. */
export async function deleteCustomItem(db: Db, profileId: string, id: string) {
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync('DELETE FROM custom_equipment WHERE id = ? AND profile_id = ?', [id, profileId]);
    await tx.runAsync('DELETE FROM equipment_favorites WHERE equipment_id = ? AND profile_id = ?', [id, profileId]);
    for (const table of ['environment_inventory', 'equipment_attributes']) {
      await tx.runAsync(
        `DELETE FROM ${table} WHERE equipment_id = ? AND environment_id IN (SELECT id FROM training_environments WHERE profile_id = ?)`,
        [id, profileId],
      );
    }
  });
}
