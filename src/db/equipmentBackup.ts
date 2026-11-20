import { z } from 'zod';
import { CATALOG, normalize } from '../data/equipment';
import { attributesSchema, type EquipmentAttributes } from './equipmentAttributes';
import { CUSTOM_PREFIX, inputSchema as customFields } from './customEquipment';
import { newId } from './id';
import { ENV_LABELS, ensureEnvironment, type EnvKind } from './inventory';
import type { Db } from './index';

export const MAX_BACKUP_CHARS = 1_000_000;
const kinds = Object.keys(ENV_LABELS) as [EnvKind, ...EnvKind[]];
const known = new Set(CATALOG.map((i) => i.id));

export const equipmentBackupSchema = z.object({
  schemaVersion: z.literal(1),
  custom: z.array(customFields.extend({ id: z.string().regex(/^user_[0-9a-f]{32}$/) })).max(500),
  favorites: z.array(z.string()).max(3000),
  environments: z.array(z.object({
    kind: z.enum(kinds),
    items: z.record(z.string(), z.enum(['available', 'unavailable'])),
    attributes: z.record(z.string(), attributesSchema),
  })).max(kinds.length).refine((e) => new Set(e.map((x) => x.kind)).size === e.length, { message: 'Entornos repetidos' }),
});
export type EquipmentBackup = z.infer<typeof equipmentBackupSchema>;

export async function exportEquipment(db: Db, profileId: string): Promise<EquipmentBackup> {
  const [custom, favs, envs] = await Promise.all([
    db.getAllAsync<{ id: string; family: string; name: string }>('SELECT id, family, name FROM custom_equipment WHERE profile_id = ? ORDER BY created_at, rowid', [profileId]),
    db.getAllAsync<{ equipment_id: string }>('SELECT equipment_id FROM equipment_favorites WHERE profile_id = ? ORDER BY equipment_id', [profileId]),
    db.getAllAsync<{ id: string; kind: EnvKind }>('SELECT id, kind FROM training_environments WHERE profile_id = ? ORDER BY rowid', [profileId]),
  ]);
  const environments: EquipmentBackup['environments'] = [];
  for (const e of envs) {
    const items = await db.getAllAsync<{ equipment_id: string; state: 'available' | 'unavailable' }>('SELECT equipment_id, state FROM environment_inventory WHERE environment_id = ?', [e.id]);
    const attrs = await db.getAllAsync<{ equipment_id: string; min_kg: number | null; max_kg: number | null; step_kg: number | null; bar_kg: number | null }>(
      'SELECT equipment_id, min_kg, max_kg, step_kg, bar_kg FROM equipment_attributes WHERE environment_id = ?', [e.id]);
    environments.push({
      kind: e.kind,
      items: Object.fromEntries(items.map((r) => [r.equipment_id, r.state])),
      attributes: Object.fromEntries(attrs.map((r): [string, EquipmentAttributes] => [r.equipment_id, { minKg: r.min_kg, maxKg: r.max_kg, stepKg: r.step_kg, barKg: r.bar_kg }])),
    });
  }
  return { schemaVersion: 1, custom: custom.map((c) => ({ id: c.id, family: c.family, name: c.name })), favorites: favs.map((f) => f.equipment_id), environments };
}

type EquipmentCount = { custom: number; items: number; attributes: number; favorites: number };

/** Mensaje de error si la copia usa un equipo que ni está en el catálogo ni lo define ella; null si todo es conocido. */
export function unknownEquipment(b: EquipmentBackup): string | null {
  const own = new Set(b.custom.map((c) => c.id));
  const ids = [...b.favorites, ...b.environments.flatMap((e) => [...Object.keys(e.items), ...Object.keys(e.attributes)])];
  const unknown = ids.find((id) => !known.has(id) && !own.has(id));
  return unknown ? `La copia usa un equipo desconocido: ${unknown.startsWith(CUSTOM_PREFIX) ? 'equipo propio sin definir' : unknown}.` : null;
}

/** Escribe la copia (ya validada) en el perfil, fusionando. Debe llamarse dentro de una transacción. */
export async function applyEquipment(tx: Db, profileId: string, b: EquipmentBackup, now: string): Promise<EquipmentCount> {
  const count: EquipmentCount = { custom: 0, items: 0, attributes: 0, favorites: 0 };
  // El id del equipo propio es global: se reasigna; si el perfil ya tiene uno con ese nombre, se reutiliza.
  const map = new Map<string, string>();
  for (const c of b.custom) {
    const key = normalize(c.name);
    const found = await tx.getFirstAsync<{ id: string }>('SELECT id FROM custom_equipment WHERE profile_id = ? AND name_key = ?', [profileId, key]);
    if (found) { map.set(c.id, found.id); continue; }
    const id = CUSTOM_PREFIX + (await newId(tx));
    await tx.runAsync('INSERT INTO custom_equipment (id, profile_id, family, name, name_key, created_at) VALUES (?,?,?,?,?,?)', [id, profileId, c.family, c.name, key, now]);
    map.set(c.id, id);
    count.custom++;
  }
  const to = (id: string) => map.get(id) ?? id;
  for (const e of b.environments) {
    const envId = await ensureEnvironment(tx, profileId, e.kind);
    for (const [id, state] of Object.entries(e.items)) {
      await tx.runAsync('INSERT OR REPLACE INTO environment_inventory (environment_id, equipment_id, state, updated_at) VALUES (?,?,?,?)', [envId, to(id), state, now]);
      count.items++;
    }
    for (const [id, a] of Object.entries(e.attributes)) {
      await tx.runAsync('INSERT OR REPLACE INTO equipment_attributes (environment_id, equipment_id, min_kg, max_kg, step_kg, bar_kg, updated_at) VALUES (?,?,?,?,?,?,?)',
        [envId, to(id), a.minKg, a.maxKg, a.stepKg, a.barKg, now]);
      count.attributes++;
    }
  }
  for (const id of b.favorites) {
    await tx.runAsync('INSERT OR IGNORE INTO equipment_favorites (profile_id, equipment_id, created_at) VALUES (?,?,?)', [profileId, to(id), now]);
    count.favorites++;
  }
  return count;
}

export type ImportResult = { ok: true; custom: number; items: number; attributes: number; favorites: number } | { ok: false; error: string };

/** Valida todo antes de escribir y aplica en una sola transacción. Fusiona (no borra lo que ya hay) y es idempotente. */
export async function importEquipment(db: Db, profileId: string, text: string): Promise<ImportResult> {
  if (text.length > MAX_BACKUP_CHARS) return { ok: false, error: 'El texto es demasiado grande.' };
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: 'El texto no es un JSON válido.' }; }
  const parsed = equipmentBackupSchema.safeParse(raw);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { ok: false, error: `Formato no válido${i.path.length ? ` en «${i.path.join('.')}»` : ''}: se espera una copia de ForgeFit versión 1.` };
  }
  const b = parsed.data;
  const unknown = unknownEquipment(b);
  if (unknown) return { ok: false, error: unknown };

  const now = new Date().toISOString();
  let count!: EquipmentCount;
  try {
    await db.withExclusiveTransactionAsync(async (tx) => { count = await applyEquipment(tx, profileId, b, now); });
  } catch {
    return { ok: false, error: 'No se pudo importar. No se cambió nada.' };
  }
  return { ok: true, ...count };
}
