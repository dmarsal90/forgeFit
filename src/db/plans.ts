import { planSchema, type Plan } from '../lib/plan';
import type { Db } from './index';
import { newId } from './id';

/** Guarda el plan como activo y archiva el anterior del mismo perfil (solo hay uno activo). */
export async function saveActivePlan(db: Db, profileId: string, plan: Plan, environmentId: string | null) {
  const valid = planSchema.parse(plan); // límite de confianza: nada sin validar entra en la base
  const planId = await newId(db);
  const revisionId = await newId(db);
  const now = new Date().toISOString();
  const json = JSON.stringify(valid);
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync("UPDATE training_plans SET status = 'archived' WHERE profile_id = ? AND status = 'active'", [profileId]);
    await tx.runAsync(
      "INSERT INTO training_plans (id, profile_id, environment_id, mode, status, plan_json, created_at, plan_version) VALUES (?,?,?,?,'active',?,?,1)",
      [planId, profileId, environmentId, valid.mode, json, now],
    );
    // La generación inicial es la revisión 1 («Plan original, generado por ForgeFit»).
    await tx.runAsync(
      "INSERT INTO plan_revisions (id, plan_id, revision, author, reason, definition_json, created_at) VALUES (?,?,1,'engine',NULL,?,?)",
      [revisionId, planId, json, now],
    );
  });
}

/** Plan activo del perfil; un JSON corrupto o de un esquema desconocido se trata como «sin plan». */
export async function getActivePlan(db: Db, profileId: string): Promise<Plan | null> {
  const row = await db.getFirstAsync<{ plan_json: string }>(
    "SELECT plan_json FROM training_plans WHERE profile_id = ? AND status = 'active'", [profileId],
  );
  if (!row) return null;
  try {
    const parsed = planSchema.safeParse(JSON.parse(row.plan_json));
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}
