import { applyOperation, OperationError, operationSchema, type Operation } from '../lib/planOps';
import { planSchema, type Plan } from '../lib/plan';
import { inputFromDrafts } from '../lib/planEngine';
import { validatePlan, type Issue, type PlanContext } from '../lib/planValidator';
import { newId } from './id';
import type { Db } from './index';
import { getInventory } from './inventory';
import { getDrafts } from './onboarding';

type Row = { id: string; environment_id: string | null; plan_json: string; plan_version: number };
export type EditResult =
  | { status: 'applied'; plan: Plan; version: number; warnings: Issue[] }
  | { status: 'duplicate'; version: number } // este operation_id ya se aplicó: no se repite
  | { status: 'stale'; version: number } // el plan cambió desde que se leyó: hay que revisarlo
  | { status: 'rejected'; reason: string; issues: Issue[] }
  | { status: 'no_plan' };
export type Origin = 'user' | 'ai';

const sameIssue = (a: Issue, b: Issue) => a.code === b.code && a.message === b.message;

/** Contexto de validación del perfil (equipo del entorno del plan, limitaciones, días…); null si el onboarding está incompleto. */
async function loadContext(db: Db, profileId: string, environmentId: string | null): Promise<PlanContext | null> {
  const drafts = await getDrafts(db, profileId);
  const inv = environmentId ? await getInventory(db, environmentId) : {};
  const have = new Set(Object.entries(inv).filter(([, s]) => s === 'available').map(([id]) => id));
  const r = inputFromDrafts(drafts, have);
  if (!('input' in r)) return null;
  const { limitations, days, minutesPerSession, level } = r.input;
  return { have, limitations, days, minutesPerSession, level };
}

const activeRow = (db: Db, profileId: string) => db.getFirstAsync<Row>(
  "SELECT id, environment_id, plan_json, plan_version FROM training_plans WHERE profile_id = ? AND status = 'active'", [profileId]);

/** Escribe una revisión nueva (versión + 1) y registra la operación. Debe llamarse dentro de una transacción. */
async function commit(
  tx: Db, row: Row, plan: Plan,
  meta: { operationId: string; type: string; params: unknown; origin: Origin; baseVersion: number; author: 'user' | 'ai'; reason: string | null },
) {
  const version = row.plan_version + 1;
  const json = JSON.stringify(plan);
  const now = new Date().toISOString();
  await tx.runAsync('UPDATE training_plans SET plan_json = ?, plan_version = ? WHERE id = ?', [json, version, row.id]);
  await tx.runAsync(
    'INSERT INTO plan_revisions (id, plan_id, revision, author, reason, definition_json, created_at) VALUES (?,?,?,?,?,?,?)',
    [await newId(tx), row.id, version, meta.author, meta.reason, json, now],
  );
  await tx.runAsync(
    'INSERT INTO plan_operations (operation_id, plan_id, type, params_json, origin, base_version, applied_revision, created_at) VALUES (?,?,?,?,?,?,?,?)',
    [meta.operationId, row.id, meta.type, JSON.stringify(meta.params), meta.origin, meta.baseVersion, version, now],
  );
  return version;
}

async function alreadyApplied(tx: Db, operationId: string): Promise<number | null> {
  const r = await tx.getFirstAsync<{ applied_revision: number }>('SELECT applied_revision FROM plan_operations WHERE operation_id = ?', [operationId]);
  return r ? r.applied_revision : null;
}

/**
 * Aplica una operación al plan activo: idempotente por `operationId`, con control de versión (`baseVersion`),
 * validada contra el validador (solo bloquean los errores NUEVOS) y registrada como revisión inmutable.
 */
export async function applyPlanOperation(
  db: Db, profileId: string,
  req: { operationId: string; op: Operation; baseVersion: number; origin?: Origin; reason?: string },
): Promise<EditResult> {
  const parsed = operationSchema.safeParse(req.op);
  if (!parsed.success) return { status: 'rejected', reason: 'Operación inválida', issues: [] };
  const origin = req.origin ?? 'user';
  let result: EditResult = { status: 'no_plan' };

  await db.withExclusiveTransactionAsync(async (tx) => {
    const dup = await alreadyApplied(tx, req.operationId);
    if (dup !== null) { result = { status: 'duplicate', version: dup }; return; }
    const row = await activeRow(tx, profileId);
    if (!row) return;
    if (row.plan_version !== req.baseVersion) { result = { status: 'stale', version: row.plan_version }; return; }

    const before = planSchema.parse(JSON.parse(row.plan_json));
    let after: Plan;
    try { after = applyOperation(before, parsed.data); } catch (e) {
      result = { status: 'rejected', reason: e instanceof OperationError ? e.message : 'No se pudo aplicar la operación', issues: [] };
      return;
    }

    // Validación: lo que ya estaba mal antes no bloquea; lo nuevo, sí. La disponibilidad solo avisa (decide la persona).
    const ctx = await loadContext(tx, profileId, row.environment_id);
    let warnings: Issue[] = [];
    if (ctx) {
      const prev = validatePlan(before, ctx).issues;
      const fresh = validatePlan(after, ctx).issues
        .filter((i) => !prev.some((p) => sameIssue(p, i)))
        .map((i): Issue => (i.code === 'day_unavailable' ? { ...i, severity: 'warning' } : i));
      const errors = fresh.filter((i) => i.severity === 'error');
      if (errors.length) { result = { status: 'rejected', reason: errors[0].message, issues: errors }; return; }
      warnings = fresh;
    }
    const version = await commit(tx, row, after, {
      operationId: req.operationId, type: parsed.data.type, params: parsed.data, origin, baseVersion: req.baseVersion,
      author: origin, reason: req.reason ?? null,
    });
    result = { status: 'applied', plan: after, version, warnings };
  });
  return result;
}

/** Restaura una revisión anterior creando una revisión NUEVA (nunca borra historial). «Deshacer» es restaurar la anterior. */
export async function restoreRevision(
  db: Db, profileId: string, req: { operationId: string; revision: number; baseVersion: number; reason?: string },
): Promise<EditResult> {
  let result: EditResult = { status: 'no_plan' };
  await db.withExclusiveTransactionAsync(async (tx) => {
    const dup = await alreadyApplied(tx, req.operationId);
    if (dup !== null) { result = { status: 'duplicate', version: dup }; return; }
    const row = await activeRow(tx, profileId);
    if (!row) return;
    if (row.plan_version !== req.baseVersion) { result = { status: 'stale', version: row.plan_version }; return; }
    const target = await tx.getFirstAsync<{ definition_json: string }>(
      'SELECT definition_json FROM plan_revisions WHERE plan_id = ? AND revision = ?', [row.id, req.revision]);
    const parsed = target ? planSchema.safeParse(JSON.parse(target.definition_json)) : null;
    if (!parsed || !parsed.success) { result = { status: 'rejected', reason: 'Esa versión no existe', issues: [] }; return; }
    const version = await commit(tx, row, parsed.data, {
      operationId: req.operationId, type: 'restore', params: { revision: req.revision }, origin: 'user', baseVersion: req.baseVersion,
      author: 'user', reason: req.reason ?? `Restaurada la versión ${req.revision}`,
    });
    result = { status: 'applied', plan: parsed.data, version, warnings: [] };
  });
  return result;
}

export const undoLast = (db: Db, profileId: string, req: { operationId: string; baseVersion: number }): Promise<EditResult> =>
  req.baseVersion <= 1
    ? Promise.resolve({ status: 'rejected', reason: 'No hay nada que deshacer', issues: [] })
    : restoreRevision(db, profileId, { operationId: req.operationId, revision: req.baseVersion - 1, baseVersion: req.baseVersion, reason: 'Deshacer el último cambio' });

/** Plan activo con su versión (ETag) para editar. */
export async function getActivePlanState(db: Db, profileId: string): Promise<{ plan: Plan; version: number } | null> {
  const row = await activeRow(db, profileId);
  if (!row) return null;
  const parsed = planSchema.safeParse(JSON.parse(row.plan_json));
  return parsed.success ? { plan: parsed.data, version: row.plan_version } : null;
}

export async function listRevisions(db: Db, profileId: string) {
  return db.getAllAsync<{ revision: number; author: 'engine' | 'user' | 'ai'; reason: string | null; created_at: string }>(
    `SELECT r.revision, r.author, r.reason, r.created_at FROM plan_revisions r
     JOIN training_plans p ON p.id = r.plan_id WHERE p.profile_id = ? AND p.status = 'active' ORDER BY r.revision DESC`,
    [profileId],
  );
}
