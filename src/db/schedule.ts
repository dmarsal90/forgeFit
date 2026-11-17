import { z } from 'zod';
import { planSchema, type Plan, type PlanSession } from '../lib/plan';
import { validatePlan, type Issue } from '../lib/planValidator';
import {
  addDays, applyScheduleOp, buildInstances, datesOfWeek, ScheduleError, toDateKey, weekStart, weekdayOf,
  type DateKey, type Instance, type ScheduleOp,
} from '../lib/schedule';
import { newId } from './id';
import type { Db } from './index';
import { loadContext } from './planContext';

const HORIZON_DAYS = 63; // 9 semanas por delante de hoy se generan siempre
const sessionSchema = planSchema.shape.sessions.element;

type PlanRow = { id: string; environment_id: string | null; plan_json: string; plan_version: number; created_at: string };
type Row = { date: string; kind: Instance['kind']; status: Instance['status']; origin: Instance['origin']; session_json: string | null; revision: number };

const planRow = (db: Db, profileId: string) => db.getFirstAsync<PlanRow>(
  "SELECT id, environment_id, plan_json, plan_version, created_at FROM training_plans WHERE profile_id = ? AND status = 'active'", [profileId]);

function toInstance(r: Row): Instance {
  let session: PlanSession | null = null;
  if (r.session_json) { const p = sessionSchema.safeParse(JSON.parse(r.session_json)); session = p.success ? p.data : null; }
  return { date: r.date, kind: session ? 'training' : 'rest', status: r.status, origin: r.origin, session, revision: r.revision };
}

async function insertRows(tx: Db, profileId: string, planId: string, rows: Instance[]) {
  for (const i of rows) {
    await tx.runAsync(
      'INSERT OR IGNORE INTO scheduled_sessions (id, profile_id, plan_id, date, kind, status, origin, session_json, revision) VALUES (?,?,?,?,?,?,?,?,?)',
      [await newId(tx), profileId, planId, i.date, i.kind, i.status, i.origin, i.session ? JSON.stringify(i.session) : null, i.revision],
    );
  }
}

/** Genera (si faltan) las instancias del plan activo hasta `upto` y, siempre, 9 semanas por delante de hoy. Idempotente. */
export async function ensureHorizon(tx: Db, profileId: string, upto: DateKey, today: DateKey = toDateKey()): Promise<void> {
  const row = await planRow(tx, profileId);
  if (!row) return;
  const plan = planSchema.parse(JSON.parse(row.plan_json));
  const last = await tx.getFirstAsync<{ d: string | null }>('SELECT MAX(date) AS d FROM scheduled_sessions WHERE plan_id = ?', [row.id]);
  const start = last?.d ? addDays(last.d, 1) : weekStart(toDateKey(new Date(row.created_at)));
  const end = datesOfWeek([upto, addDays(today, HORIZON_DAYS)].sort().pop() as DateKey)[6];
  if (start > end) return;
  await insertRows(tx, profileId, row.id, buildInstances(plan, start, end, row.plan_version));
}

/** Tras cambiar la plantilla («todas las semanas»): rehace las instancias futuras que no se tocaron a mano. Nunca toca el pasado ni lo realizado. */
export async function regenerateFuture(tx: Db, planId: string, plan: Plan, revision: number, from: DateKey) {
  const rows = await tx.getAllAsync<{ date: string }>(
    "SELECT date FROM scheduled_sessions WHERE plan_id = ? AND date >= ? AND status = 'scheduled' AND origin = 'template' ORDER BY date", [planId, from]);
  for (const i of buildInstances(plan, from, rows.length ? rows[rows.length - 1].date : from, revision)) {
    if (!rows.some((r) => r.date === i.date)) continue;
    await tx.runAsync(
      "UPDATE scheduled_sessions SET kind = ?, session_json = ?, revision = ? WHERE plan_id = ? AND date = ? AND status = 'scheduled' AND origin = 'template'",
      [i.kind, i.session ? JSON.stringify(i.session) : null, i.revision, planId, i.date],
    );
  }
}

/** Instancias del plan activo entre dos fechas (inclusive), generando las que falten. */
export async function getInstances(db: Db, profileId: string, from: DateKey, to: DateKey, today: DateKey = toDateKey()): Promise<Instance[]> {
  await db.withExclusiveTransactionAsync(async (tx) => { await ensureHorizon(tx, profileId, to, today); });
  const row = await planRow(db, profileId);
  if (!row) return [];
  const rows = await db.getAllAsync<Row>(
    'SELECT date, kind, status, origin, session_json, revision FROM scheduled_sessions WHERE plan_id = ? AND date >= ? AND date <= ? ORDER BY date', [row.id, from, to]);
  return rows.map(toInstance);
}

/** Próxima sesión de entrenamiento programada desde hoy (hoy incluido). */
export async function getNextInstance(db: Db, profileId: string, today: DateKey = toDateKey()): Promise<Instance | null> {
  await getInstances(db, profileId, today, addDays(today, 14), today);
  const row = await planRow(db, profileId);
  if (!row) return null;
  const r = await db.getFirstAsync<Row>(
    "SELECT date, kind, status, origin, session_json, revision FROM scheduled_sessions WHERE plan_id = ? AND date >= ? AND kind = 'training' AND status = 'scheduled' ORDER BY date LIMIT 1", [row.id, today]);
  return r ? toInstance(r) : null;
}

export type ScheduleResult =
  | { status: 'applied'; instances: [Instance, Instance]; warnings: Issue[] }
  | { status: 'duplicate' }
  | { status: 'rejected'; reason: string }
  | { status: 'no_plan' };

const weekAsPlan = (rows: Instance[]): Plan | null => {
  const sessions = rows.filter((i) => i.session).map((i) => ({ ...(i.session as PlanSession), day: weekdayOf(i.date) }));
  return sessions.length ? { schemaVersion: 1, mode: 'local', sessions } : null;
};

/** Avisos NUEVOS (recuperación, disponibilidad…) que el cambio introduce en las semanas afectadas. */
async function newWarnings(tx: Db, profileId: string, row: PlanRow, planId: string, dates: DateKey[], change: (before: Instance[]) => Instance[]): Promise<Issue[]> {
  const ctx = await loadContext(tx, profileId, row.environment_id);
  if (!ctx) return [];
  const out: Issue[] = [];
  for (const wk of [...new Set(dates.map(weekStart))]) {
    const before = (await tx.getAllAsync<Row>(
      'SELECT date, kind, status, origin, session_json, revision FROM scheduled_sessions WHERE plan_id = ? AND date >= ? AND date <= ? ORDER BY date', [planId, wk, addDays(wk, 6)])).map(toInstance);
    const [pb, pa] = [weekAsPlan(before), weekAsPlan(change(before))];
    if (!pa) continue;
    const prev = pb ? validatePlan(pb, ctx).issues : [];
    for (const i of validatePlan(pa, ctx).issues) {
      if (i.severity === 'warning' && !prev.some((p) => p.code === i.code && p.message === i.message)) out.push(i);
    }
  }
  return out;
}

async function write(tx: Db, profileId: string, planId: string, i: Instance) {
  await tx.runAsync(
    "UPDATE scheduled_sessions SET kind = ?, origin = ?, session_json = ? WHERE plan_id = ? AND date = ?",
    [i.kind, i.origin, i.session ? JSON.stringify(i.session) : null, planId, i.date],
  );
}

async function logReschedule(tx: Db, profileId: string, row: PlanRow, req: { operationId: string; kind: string; from: DateKey; to: DateKey; before: Instance[]; undoOf?: string }) {
  const now = new Date().toISOString();
  await tx.runAsync(
    'INSERT INTO session_reschedules (id, profile_id, plan_id, operation_id, kind, from_date, to_date, before_json, at) VALUES (?,?,?,?,?,?,?,?,?)',
    [await newId(tx), profileId, row.id, req.operationId, req.kind, req.from, req.to, JSON.stringify(req.before), now],
  );
  await tx.runAsync(
    'INSERT INTO plan_operations (operation_id, plan_id, type, params_json, origin, base_version, applied_revision, created_at) VALUES (?,?,?,?,?,?,?,?)',
    [req.operationId, row.id, `schedule.${req.kind}`, JSON.stringify({ from: req.from, to: req.to, ...(req.undoOf ? { undoOf: req.undoOf } : {}) }), 'user', row.plan_version, row.plan_version, now],
  );
}

const opSchema = z.object({ type: z.enum(['move', 'swap', 'duplicate']), from: z.string(), to: z.string() });

/**
 * Mueve, intercambia o duplica una sesión entre dos FECHAS concretas («solo esta fecha / esta semana»): no toca la plantilla.
 * Idempotente por `operationId`; solo fechas de hoy en adelante; lo realizado es inmutable.
 */
export async function applyScheduleOperation(
  db: Db, profileId: string, req: { operationId: string; op: ScheduleOp; today?: DateKey },
): Promise<ScheduleResult> {
  const op = opSchema.safeParse(req.op);
  const today = req.today ?? toDateKey();
  const valid = op.success && /^\d{4}-\d{2}-\d{2}$/.test(op.data.from) && /^\d{4}-\d{2}-\d{2}$/.test(op.data.to);
  if (!valid) return { status: 'rejected', reason: 'Operación inválida' };
  const o = op.data as ScheduleOp;
  let result: ScheduleResult = { status: 'no_plan' };

  await db.withExclusiveTransactionAsync(async (tx) => {
    if (await tx.getFirstAsync('SELECT 1 FROM plan_operations WHERE operation_id = ?', [req.operationId])) { result = { status: 'duplicate' }; return; }
    const row = await planRow(tx, profileId);
    if (!row) return;
    await ensureHorizon(tx, profileId, [o.from, o.to].sort().pop() as DateKey, today);
    if (o.from < today || o.to < today) { result = { status: 'rejected', reason: 'No se pueden cambiar fechas pasadas' }; return; }
    const get = async (d: DateKey) => {
      const r = await tx.getFirstAsync<Row>('SELECT date, kind, status, origin, session_json, revision FROM scheduled_sessions WHERE plan_id = ? AND date = ?', [row.id, d]);
      return r ? toInstance(r) : undefined;
    };
    const [a, b] = [await get(o.from), await get(o.to)];
    let next: [Instance, Instance];
    try { next = applyScheduleOp(a, b, o); } catch (e) {
      result = { status: 'rejected', reason: e instanceof ScheduleError ? e.message : 'No se pudo aplicar la operación' };
      return;
    }
    const warnings = await newWarnings(tx, profileId, row, row.id, [o.from, o.to], (week) => week.map((i) => next.find((n) => n.date === i.date) ?? i));
    await logReschedule(tx, profileId, row, { operationId: req.operationId, kind: o.type, from: o.from, to: o.to, before: [a as Instance, b as Instance] });
    for (const i of next) await write(tx, profileId, row.id, i);
    result = { status: 'applied', instances: next, warnings };
  });
  return result;
}

/** Deshace exactamente un cambio por fechas restaurando las dos instancias previas (si siguen programadas). */
export async function undoScheduleOperation(db: Db, profileId: string, req: { operationId: string; undoOf: string }): Promise<ScheduleResult> {
  let result: ScheduleResult = { status: 'no_plan' };
  await db.withExclusiveTransactionAsync(async (tx) => {
    if (await tx.getFirstAsync('SELECT 1 FROM plan_operations WHERE operation_id = ?', [req.operationId])) { result = { status: 'duplicate' }; return; }
    const row = await planRow(tx, profileId);
    if (!row) return;
    const rec = await tx.getFirstAsync<{ from_date: string; to_date: string; before_json: string }>(
      "SELECT from_date, to_date, before_json FROM session_reschedules WHERE operation_id = ? AND plan_id = ? AND kind != 'undo'", [req.undoOf, row.id]);
    if (!rec) { result = { status: 'rejected', reason: 'No hay nada que deshacer' }; return; }
    if (await tx.getFirstAsync("SELECT 1 FROM plan_operations WHERE type = 'schedule.undo' AND params_json LIKE ?", [`%"undoOf":"${req.undoOf}"%`])) {
      result = { status: 'rejected', reason: 'Ese cambio ya se deshizo' }; return;
    }
    const before = (JSON.parse(rec.before_json) as Instance[]);
    const now = await tx.getAllAsync<{ status: string }>('SELECT status FROM scheduled_sessions WHERE plan_id = ? AND date IN (?, ?)', [row.id, rec.from_date, rec.to_date]);
    if (now.some((r) => r.status !== 'scheduled')) { result = { status: 'rejected', reason: 'Una de las sesiones ya se realizó' }; return; }
    await logReschedule(tx, profileId, row, { operationId: req.operationId, kind: 'undo', from: rec.to_date, to: rec.from_date, before, undoOf: req.undoOf });
    for (const i of before) await write(tx, profileId, row.id, i);
    result = { status: 'applied', instances: [before[0], before[1]], warnings: [] };
  });
  return result;
}
