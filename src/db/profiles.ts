import type { Db } from './index';
import type { ProfileInput } from '../lib/profile';

export type Profile = { id: string; alias: string; anatomicalModel: 'male' | 'female' | null };

type Row = { id: string; alias: string; anatomical_model: 'male' | 'female' | null };
const toProfile = (r: Row): Profile => ({ id: r.id, alias: r.alias, anatomicalModel: r.anatomical_model });

const uuid = () => globalThis.crypto.randomUUID();

export async function createProfile(db: Db, input: ProfileInput): Promise<Profile> {
  const id = uuid();
  const now = new Date().toISOString();
  const birthYear = input.age ? new Date().getFullYear() - input.age : null;
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      'INSERT INTO profiles (id, alias, anatomical_model, birth_year, height_cm, created_at, updated_at) VALUES (?,?,?,?,?,?,?)',
      [id, input.alias, input.anatomicalModel ?? null, birthYear, input.heightCm ?? null, now, now],
    );
    await tx.runAsync("INSERT OR REPLACE INTO app_state (key, value) VALUES ('active_profile_id', ?)", [id]);
  });
  return { id, alias: input.alias, anatomicalModel: input.anatomicalModel ?? null };
}

export async function getActiveProfile(db: Db): Promise<Profile | null> {
  const r = await db.getFirstAsync<Row>(
    `SELECT p.id, p.alias, p.anatomical_model FROM profiles p
     JOIN app_state s ON s.key = 'active_profile_id' AND s.value = p.id
     WHERE p.archived_at IS NULL`,
  );
  return r ? toProfile(r) : null;
}

export async function countProfiles(db: Db): Promise<number> {
  const r = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM profiles WHERE archived_at IS NULL');
  return r?.n ?? 0;
}

export async function listProfiles(db: Db): Promise<Profile[]> {
  const rows = await db.getAllAsync<Row>(
    'SELECT id, alias, anatomical_model FROM profiles WHERE archived_at IS NULL ORDER BY rowid',
  );
  return rows.map(toProfile);
}

export async function setActiveProfile(db: Db, id: string): Promise<boolean> {
  const exists = await db.getFirstAsync('SELECT 1 FROM profiles WHERE id = ? AND archived_at IS NULL', [id]);
  if (!exists) return false;
  await db.runAsync("INSERT OR REPLACE INTO app_state (key, value) VALUES ('active_profile_id', ?)", [id]);
  return true;
}

const clearActiveIf = (db: Db, id: string) =>
  db.runAsync("DELETE FROM app_state WHERE key = 'active_profile_id' AND value = ?", [id]);

/** Archivar conserva los datos; deja de listarse y deja de ser el perfil activo. */
export async function archiveProfile(db: Db, id: string) {
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync('UPDATE profiles SET archived_at = ?, updated_at = ? WHERE id = ?', [new Date().toISOString(), new Date().toISOString(), id]);
    await clearActiveIf(tx, id);
  });
}

/** Borra el perfil y, por ON DELETE CASCADE, todo lo que cuelga de él. */
export async function deleteProfile(db: Db, id: string) {
  await db.withExclusiveTransactionAsync(async (tx) => {
    await clearActiveIf(tx, id);
    await tx.runAsync('DELETE FROM profiles WHERE id = ?', [id]);
  });
}
