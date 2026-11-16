import type { Db } from './index';

export type Drafts = Record<number, unknown>;

export async function saveDraft(db: Db, profileId: string, step: number, data: unknown) {
  await db.runAsync(
    'INSERT OR REPLACE INTO onboarding_drafts (profile_id, step, data_json, updated_at) VALUES (?,?,?,?)',
    [profileId, step, JSON.stringify(data), new Date().toISOString()],
  );
}

/** Borradores de un perfil por etapa; una fila corrupta se ignora en vez de bloquear el onboarding. */
export async function getDrafts(db: Db, profileId: string): Promise<Drafts> {
  const rows = await db.getAllAsync<{ step: number; data_json: string }>(
    'SELECT step, data_json FROM onboarding_drafts WHERE profile_id = ?',
    [profileId],
  );
  const out: Drafts = {};
  for (const r of rows) {
    try { out[r.step] = JSON.parse(r.data_json); } catch { /* fila corrupta: la etapa vuelve a pedirse */ }
  }
  return out;
}

export const clearDrafts = (db: Db, profileId: string) =>
  db.runAsync('DELETE FROM onboarding_drafts WHERE profile_id = ?', [profileId]);

export async function grantConsent(db: Db, profileId: string, kind: string, version: number) {
  await db.runAsync(
    'INSERT OR REPLACE INTO user_consents (profile_id, kind, version, granted_at, revoked_at) VALUES (?,?,?,?,NULL)',
    [profileId, kind, version, new Date().toISOString()],
  );
}

export const revokeConsent = (db: Db, profileId: string, kind: string) =>
  db.runAsync(
    'UPDATE user_consents SET revoked_at = ? WHERE profile_id = ? AND kind = ? AND revoked_at IS NULL',
    [new Date().toISOString(), profileId, kind],
  );

export async function hasConsent(db: Db, profileId: string, kind: string): Promise<boolean> {
  const r = await db.getFirstAsync(
    'SELECT 1 FROM user_consents WHERE profile_id = ? AND kind = ? AND revoked_at IS NULL',
    [profileId, kind],
  );
  return r !== null;
}
