import { applyOperation, OperationError, operationSchema, type Operation } from '../lib/planOps';
import { planSchema, sessionSchema, type Plan, type PlanSession } from '../lib/plan';
import { applySessionOps, SessionOpError, type SessionOp } from '../lib/sessionOps';
import { newIssues, validatePlan, type Issue } from '../lib/planValidator';
import { newId } from './id';
import type { Db } from './index';
import { loadContext } from './planContext';
import { ensureHorizon, regenerateFuture } from './schedule';
import { toDateKey, type DateKey } from '../lib/schedule';

type Row = { id: string; environment_id: string | null; plan_json: string; plan_version: number };
export type EditResult =
  | { status: 'applied'; plan: Plan; version: number; warnings: Issue[] }
  | { status: 'duplicate'; version: number } // este operation_id ya se aplicó: no se repite
  | { status: 'stale'; version: number } // el plan cambió desde que se leyó: hay que revisarlo
  | { status: 'rejected'; reason: string; issues: Issue[] }
  | { status: 'no_plan' };
export type Origin = 'user' | 'ai';

const sameIssue = (a: Issue, b: Issue) => a.code === b.code && a.message === b.message;

const activeRow = (db: Db, profileId: string) => db.getFirstAsync<Row>(
  "SELECT id, environment_id, plan_json, plan_version FROM training_plans WHERE profile_id = ? AND status = 'active'", [profileId]);

/** Escribe una revisión nueva (versión + 1) y registra la operación. Debe llamarse dentro de una transacción. */
async function commit(
  tx: Db, row: Row, plan: Plan,
  meta: { operationId: string; type: string; params: unknown; origin: Origin; baseVersion: number; author: 'user' | 'ai'; reason: string | null; today?: DateKey },
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
  // «Todas las semanas»: las instancias futuras sin cambios manuales siguen a la plantilla nueva.
  await regenerateFuture(tx, row.id, plan, version, meta.today ?? toDateKey());
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
  req: { operationId: string; op: Operation; baseVersion: number; origin?: Origin; reason?: string; today?: DateKey },
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
      author: origin, reason: req.reason ?? null, today: req.today,
    });
    result = { status: 'applied', plan: after, version, warnings };
  });
  return result;
}

/** Restaura una revisión anterior creando una revisión NUEVA (nunca borra historial). «Deshacer» es restaurar la anterior. */
export async function restoreRevision(
  db: Db, profileId: string, req: { operationId: string; revision: number; baseVersion: number; reason?: string; today?: DateKey },
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
      author: 'user', reason: req.reason ?? `Restaurada la versión ${req.revision}`, today: req.today,
    });
    result = { status: 'applied', plan: parsed.data, version, warnings: [] };
  });
  return result;
}

export const undoLast = (db: Db, profileId: string, req: { operationId: string; baseVersion: number; today?: DateKey }): Promise<EditResult> =>
  req.baseVersion <= 1
    ? Promise.resolve({ status: 'rejected', reason: 'No hay nada que deshacer', issues: [] })
    : restoreRevision(db, profileId, { operationId: req.operationId, revision: req.baseVersion - 1, baseVersion: req.baseVersion, reason: 'Deshacer el último cambio', today: req.today });

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

// ── V8-C: edición de una sesión (renombrar, reemplazar, añadir, quitar, prescripción, biseries…) ──────────────

export type SessionEditResult =
  | { status: 'applied'; session: PlanSession; version: number; warnings: Issue[] }
  | { status: 'duplicate' }
  | { status: 'stale'; version: number }
  | { status: 'rejected'; reason: string; issues: Issue[] }
  | { status: 'no_plan' };

const onlySession = (s: PlanSession): Plan => ({ schemaVersion: 1, mode: 'local', sessions: [{ ...s, day: s.day }] });

async function judge(tx: Db, profileId: string, environmentId: string | null, before: Plan, after: Plan) {
  const ctx = await loadContext(tx, profileId, environmentId);
  return ctx ? newIssues(before, after, ctx) : { errors: [] as Issue[], warnings: [] as Issue[] };
}

function applyOps(session: PlanSession, ops: SessionOp[]): { session: PlanSession } | { reason: string } {
  try { return { session: sessionSchema.parse(applySessionOps(session, ops)) }; } catch (e) {
    return { reason: e instanceof SessionOpError ? e.message : 'Los cambios no son válidos' };
  }
}

/**
 * Guarda los cambios de una sesión de forma atómica y con revisión nueva: «todas las semanas» edita la sesión de la plantilla
 * (versión nueva; las semanas futuras sin cambios manuales la siguen) y `date` edita solo esa fecha. Idempotente por `operationId`.
 */
export async function applySessionEdit(
  db: Db, profileId: string,
  req: { operationId: string; ops: SessionOp[]; target: { kind: 'template'; day: number; baseVersion: number } | { kind: 'date'; date: DateKey }; reason?: string; today?: DateKey },
): Promise<SessionEditResult> {
  if (!req.ops.length) return { status: 'rejected', reason: 'No hay cambios que guardar', issues: [] };
  const today = req.today ?? toDateKey();
  let result: SessionEditResult = { status: 'no_plan' };

  await db.withExclusiveTransactionAsync(async (tx) => {
    if ((await alreadyApplied(tx, req.operationId)) !== null) { result = { status: 'duplicate' }; return; }
    const row = await activeRow(tx, profileId);
    if (!row) return;
    const plan = planSchema.parse(JSON.parse(row.plan_json));

    if (req.target.kind === 'template') {
      if (row.plan_version !== req.target.baseVersion) { result = { status: 'stale', version: row.plan_version }; return; }
      const day = req.target.day;
      const current = plan.sessions.find((s) => s.day === day);
      if (!current) { result = { status: 'rejected', reason: 'Ese día no tiene sesión', issues: [] }; return; }
      const applied = applyOps(current, req.ops);
      if ('reason' in applied) { result = { status: 'rejected', reason: applied.reason, issues: [] }; return; }
      const after: Plan = { ...plan, sessions: plan.sessions.map((s) => (s.day === day ? { ...applied.session, day } : s)) };
      const { errors, warnings } = await judge(tx, profileId, row.environment_id, plan, after);
      if (errors.length) { result = { status: 'rejected', reason: errors[0].message, issues: errors }; return; }
      const version = await commit(tx, row, after, {
        operationId: req.operationId, type: 'session_edit', params: { day, ops: req.ops }, origin: 'user', baseVersion: req.target.baseVersion,
        author: 'user', reason: req.reason ?? `Sesión editada (${current.name})`, today: req.today,
      });
      result = { status: 'applied', session: after.sessions.find((s) => s.day === day) as PlanSession, version, warnings };
      return;
    }

    // «Solo esta fecha»: se edita la copia de la sesión de esa instancia (no cambia la plantilla ni crea revisión)
    const date = req.target.date;
    await ensureHorizon(tx, profileId, date, today);
    const inst = await tx.getFirstAsync<{ status: string; session_json: string | null }>('SELECT status, session_json FROM scheduled_sessions WHERE plan_id = ? AND date = ?', [row.id, date]);
    if (!inst || !inst.session_json) { result = { status: 'rejected', reason: 'Esa fecha no tiene sesión', issues: [] }; return; }
    if (date < today) { result = { status: 'rejected', reason: 'No se pueden cambiar fechas pasadas', issues: [] }; return; }
    if (inst.status !== 'scheduled') { result = { status: 'rejected', reason: 'Una sesión ya realizada no se puede editar', issues: [] }; return; }
    const current = sessionSchema.parse(JSON.parse(inst.session_json));
    const applied = applyOps(current, req.ops);
    if ('reason' in applied) { result = { status: 'rejected', reason: applied.reason, issues: [] }; return; }
    const { errors, warnings } = await judge(tx, profileId, row.environment_id, onlySession(current), onlySession(applied.session));
    if (errors.length) { result = { status: 'rejected', reason: errors[0].message, issues: errors }; return; }
    await tx.runAsync("UPDATE scheduled_sessions SET session_json = ?, origin = 'override' WHERE plan_id = ? AND date = ?", [JSON.stringify(applied.session), row.id, date]);
    await tx.runAsync(
      'INSERT INTO plan_operations (operation_id, plan_id, type, params_json, origin, base_version, applied_revision, created_at) VALUES (?,?,?,?,?,?,?,?)',
      [req.operationId, row.id, 'session_edit.date', JSON.stringify({ date, ops: req.ops, before: current, after: applied.session }), 'user', row.plan_version, row.plan_version, new Date().toISOString()],
    );
    result = { status: 'applied', session: applied.session, version: row.plan_version, warnings };
  });
  return result;
}

/** Deshace una edición «solo esta fecha» restaurando la sesión previa, si esa fecha sigue como la dejó la edición. */
export async function undoDateSessionEdit(db: Db, profileId: string, req: { operationId: string; undoOf: string }): Promise<SessionEditResult> {
  let result: SessionEditResult = { status: 'no_plan' };
  await db.withExclusiveTransactionAsync(async (tx) => {
    if ((await alreadyApplied(tx, req.operationId)) !== null) { result = { status: 'duplicate' }; return; }
    const row = await activeRow(tx, profileId);
    if (!row) return;
    const rec = await tx.getFirstAsync<{ params_json: string }>("SELECT params_json FROM plan_operations WHERE operation_id = ? AND plan_id = ? AND type = 'session_edit.date'", [req.undoOf, row.id]);
    if (!rec) { result = { status: 'rejected', reason: 'No hay nada que deshacer', issues: [] }; return; }
    if (await tx.getFirstAsync("SELECT 1 FROM plan_operations WHERE type = 'session_edit.undo' AND params_json LIKE ?", [`%"undoOf":"${req.undoOf}"%`])) {
      result = { status: 'rejected', reason: 'Ese cambio ya se deshizo', issues: [] }; return;
    }
    const p = JSON.parse(rec.params_json) as { date: string; before: PlanSession; after: PlanSession };
    const cur = await tx.getFirstAsync<{ status: string; session_json: string | null }>('SELECT status, session_json FROM scheduled_sessions WHERE plan_id = ? AND date = ?', [row.id, p.date]);
    if (!cur || cur.status !== 'scheduled' || cur.session_json !== JSON.stringify(p.after)) { result = { status: 'rejected', reason: 'Esa fecha cambió desde entonces', issues: [] }; return; }
    await tx.runAsync('UPDATE scheduled_sessions SET session_json = ? WHERE plan_id = ? AND date = ?', [JSON.stringify(p.before), row.id, p.date]);
    await tx.runAsync(
      'INSERT INTO plan_operations (operation_id, plan_id, type, params_json, origin, base_version, applied_revision, created_at) VALUES (?,?,?,?,?,?,?,?)',
      [req.operationId, row.id, 'session_edit.undo', JSON.stringify({ undoOf: req.undoOf, date: p.date }), 'user', row.plan_version, row.plan_version, new Date().toISOString()],
    );
    result = { status: 'applied', session: p.before, version: row.plan_version, warnings: [] };
  });
  return result;
}

/** Todo lo que necesita la pantalla de edición: el plan con su versión y el contexto de validación (equipo, molestias, nivel). */
export async function getEditorContext(db: Db, profileId: string) {
  const row = await activeRow(db, profileId);
  if (!row) return null;
  const plan = planSchema.parse(JSON.parse(row.plan_json));
  return { plan, version: row.plan_version, ctx: await loadContext(db, profileId, row.environment_id) };
}
