import { migrate } from '../src/db';
import { ensureEnvironment, setItemState } from '../src/db/inventory';
import { saveDraft } from '../src/db/onboarding';
import { applySessionEdit, getActivePlanState, listRevisions, undoDateSessionEdit, undoLast } from '../src/db/planEditing';
import { createProfile } from '../src/db/profiles';
import { getInstances } from '../src/db/schedule';
import type { Plan, PlanSession } from '../src/lib/plan';
import type { SessionOp } from '../src/lib/sessionOps';
import { memoryDb } from '../test-utils/sqlite';

const TODAY = '2026-11-17'; // martes
const item = (id: string, sets = 3, repRange: [number, number] = [8, 12], restSeconds = 60) => ({ exerciseVariantId: id, sets, repRange, restSeconds });
const empuje = (): PlanSession => ({ day: 1, name: 'Empuje', blocks: [{ type: 'single', items: [item('pushup.floor')] }, { type: 'single', items: [item('db_fly.flat')] }] });
const plan = (): Plan => ({ schemaVersion: 1, mode: 'local', sessions: [empuje(), { day: 3, name: 'Piernas', blocks: [{ type: 'single', items: [item('bodyweight_squat.floor')] }] }] });
const GYM = ['dumbbells_fixed_hex', 'bench_adjustable', 'cable_single_high', 'cable_att_rope'];

async function seed(opts: { level?: string; minutes?: number; joints?: string[]; have?: string[] } = {}) {
  const db = memoryDb();
  await migrate(db);
  const profile = await createProfile(db, { alias: 'Ana' });
  const env = await ensureEnvironment(db, profile.id, 'gym');
  for (const id of opts.have ?? GYM) await setItemState(db, env, id, 'available');
  await db.runAsync("INSERT INTO training_plans (id, profile_id, environment_id, mode, status, plan_json, created_at) VALUES ('p1', ?, ?, 'local', 'active', ?, '2026-11-16T12:00:00.000Z')", [profile.id, env, JSON.stringify(plan())]);
  await db.runAsync("INSERT INTO plan_revisions (id, plan_id, revision, author, definition_json, created_at) VALUES ('r1', 'p1', 1, 'engine', ?, 'now')", [JSON.stringify(plan())]);
  for (const [step, data] of Object.entries({
    2: { primaryGoal: 'muscle' }, 3: { level: opts.level ?? 'intermediate' }, 4: { days: [0, 1, 2, 3, 4], minutes: opts.minutes ?? 60 },
    7: { jointLimitations: opts.joints ?? [] },
  })) await saveDraft(db, profile.id, Number(step), data);
  return { db, profile };
}
const tpl = (operationId: string, ops: SessionOp[], baseVersion = 1, day = 1) => ({ operationId, ops, target: { kind: 'template' as const, day, baseVersion }, today: TODAY });
const onDate = (operationId: string, ops: SessionOp[], date: string) => ({ operationId, ops, target: { kind: 'date' as const, date }, today: TODAY });
const names = (p: Plan | PlanSession, day = 1) => ('sessions' in p ? p.sessions.find((s) => s.day === day)! : p).blocks.flatMap((b) => b.items.map((i) => i.exerciseVariantId));

describe('edición «todas las semanas» (plantilla)', () => {
  it('aplica los cambios, crea una revisión y las semanas futuras la siguen', async () => {
    const { db, profile } = await seed();
    const r = await applySessionEdit(db, profile.id, tpl('e1', [
      { type: 'replace_exercise', block: 1, item: 0, variantId: 'db_fly.incline' },
      { type: 'update_prescription', block: 0, item: 0, sets: 4, rir: 2 },
      { type: 'rename_session', name: 'Pecho' },
    ]));
    expect(r.status).toBe('applied');
    const state = await getActivePlanState(db, profile.id);
    expect(state?.version).toBe(2);
    const s = state!.plan.sessions.find((x) => x.day === 1)!;
    expect(s.name).toBe('Pecho');
    expect(names(s)).toEqual(['pushup.floor', 'db_fly.incline']);
    expect(s.blocks[0].items[0]).toMatchObject({ sets: 4, rir: 2 });
    expect((await listRevisions(db, profile.id)).map((x) => [x.revision, x.author])).toEqual([[2, 'user'], [1, 'engine']]);
    const next = (await getInstances(db, profile.id, '2026-11-24', '2026-11-24', TODAY))[0];
    expect(next.session?.name).toBe('Pecho'); // el martes de la semana siguiente sigue a la plantilla nueva
  });
  it('es idempotente y rechaza versiones caducas, días sin sesión y cambios inválidos sin tocar nada', async () => {
    const { db, profile } = await seed();
    expect((await applySessionEdit(db, profile.id, tpl('e1', [{ type: 'rename_session', name: 'A' }]))).status).toBe('applied');
    expect(await applySessionEdit(db, profile.id, tpl('e1', [{ type: 'rename_session', name: 'A' }]))).toEqual({ status: 'duplicate' });
    expect(await applySessionEdit(db, profile.id, tpl('e2', [{ type: 'rename_session', name: 'B' }], 1))).toEqual({ status: 'stale', version: 2 });
    expect(await applySessionEdit(db, profile.id, tpl('e3', [{ type: 'rename_session', name: 'B' }], 2, 6))).toMatchObject({ status: 'rejected' });
    expect(await applySessionEdit(db, profile.id, tpl('e4', [{ type: 'remove_exercise', block: 9, item: 0 }], 2))).toMatchObject({ status: 'rejected' });
    expect(await applySessionEdit(db, profile.id, tpl('e5', [], 2))).toMatchObject({ status: 'rejected' });
    expect(await applySessionEdit(db, profile.id, tpl('e6', [{ type: 'update_prescription', block: 0, item: 0, sets: 99 }], 2))).toMatchObject({ status: 'rejected' });
    expect((await getActivePlanState(db, profile.id))?.version).toBe(2);
  });
  it('deshacer restaura la sesión anterior con una revisión nueva', async () => {
    const { db, profile } = await seed();
    await applySessionEdit(db, profile.id, tpl('e1', [{ type: 'rename_session', name: 'Otro' }]));
    const u = await undoLast(db, profile.id, { operationId: 'u1', baseVersion: 2, today: TODAY });
    expect(u.status).toBe('applied');
    expect((await getActivePlanState(db, profile.id))!.plan.sessions.find((x) => x.day === 1)!.name).toBe('Empuje');
    expect((await listRevisions(db, profile.id)).map((x) => x.revision)).toEqual([3, 2, 1]);
  });
});

describe('validación antes de guardar', () => {
  it('rechaza un ejercicio cuyo equipo no está confirmado y explica el motivo', async () => {
    const { db, profile } = await seed();
    const r = await applySessionEdit(db, profile.id, tpl('e1', [{ type: 'replace_exercise', block: 1, item: 0, variantId: 'pec_deck.machine' }]));
    expect(r.status).toBe('rejected');
    expect(r.status === 'rejected' && r.issues.map((i) => i.code)).toContain('equipment_unavailable');
    expect((await getActivePlanState(db, profile.id))?.version).toBe(1);
  });
  it('lo que ya estaba mal antes no bloquea un cambio ajeno', async () => {
    const { db, profile } = await seed({ have: ['dumbbells_fixed_hex'] }); // sin banco: db_fly.flat ya no era viable
    expect((await applySessionEdit(db, profile.id, tpl('e1', [{ type: 'rename_session', name: 'Solo renombro' }]))).status).toBe('applied');
  });
  it('respeta las molestias declaradas', async () => {
    const { db, profile } = await seed({ joints: ['elbow'] });
    const r = await applySessionEdit(db, profile.id, tpl('e1', [{ type: 'add_exercise', variantId: 'triceps_pushdown.cable' }]));
    expect(r.status === 'rejected' && r.issues.map((i) => i.code)).toContain('injury_joint');
  });
  it('rechaza una sesión que ya no cabe en el tiempo disponible', async () => {
    const { db, profile } = await seed({ minutes: 30 });
    const ops: SessionOp[] = Array.from({ length: 8 }, () => ({ type: 'add_exercise', variantId: 'pushup.floor' }));
    const r = await applySessionEdit(db, profile.id, tpl('e1', ops));
    expect(r.status === 'rejected' && r.issues.map((i) => i.code)).toContain('session_too_long');
  });
  it('avisa (sin bloquear) cuando el ejercicio supera un poco el nivel', async () => {
    const { db, profile } = await seed({ level: 'beginner' });
    const r = await applySessionEdit(db, profile.id, tpl('e1', [{ type: 'add_exercise', variantId: 'incline_bench_press.db' }]));
    expect(r.status === 'applied' && r.warnings.map((w) => w.code)).toContain('level_stretch');
  });
});

describe('edición «solo esta fecha»', () => {
  it('cambia únicamente esa instancia (marcada como cambio manual) y la plantilla queda intacta', async () => {
    const { db, profile } = await seed();
    const r = await applySessionEdit(db, profile.id, onDate('d1', [{ type: 'add_exercise', variantId: 'diamond_pushup.floor' }, { type: 'rename_session', name: 'Empuje largo' }], '2026-11-24'));
    expect(r.status).toBe('applied');
    expect((await getActivePlanState(db, profile.id))?.version).toBe(1);
    const rows = await getInstances(db, profile.id, '2026-11-24', '2026-12-01', TODAY);
    expect(rows[0].session?.name).toBe('Empuje largo');
    expect(rows[0].origin).toBe('override');
    expect(rows[7].session?.name).toBe('Empuje'); // el martes siguiente no cambia
  });
  it('deshacer restaura la sesión previa una sola vez, y no si la fecha cambió después', async () => {
    const { db, profile } = await seed();
    await applySessionEdit(db, profile.id, onDate('d1', [{ type: 'rename_session', name: 'X' }], '2026-11-24'));
    expect((await undoDateSessionEdit(db, profile.id, { operationId: 'u1', undoOf: 'd1' })).status).toBe('applied');
    expect((await getInstances(db, profile.id, '2026-11-24', '2026-11-24', TODAY))[0].session?.name).toBe('Empuje');
    expect(await undoDateSessionEdit(db, profile.id, { operationId: 'u2', undoOf: 'd1' })).toMatchObject({ status: 'rejected' });
    await applySessionEdit(db, profile.id, onDate('d2', [{ type: 'rename_session', name: 'Y' }], '2026-11-24'));
    await applySessionEdit(db, profile.id, onDate('d3', [{ type: 'rename_session', name: 'Z' }], '2026-11-24'));
    expect(await undoDateSessionEdit(db, profile.id, { operationId: 'u3', undoOf: 'd2' })).toMatchObject({ status: 'rejected', reason: 'Esa fecha cambió desde entonces' });
  });
  it('no edita fechas pasadas, descansos ni sesiones realizadas, y es idempotente', async () => {
    const { db, profile } = await seed();
    const rename: SessionOp[] = [{ type: 'rename_session', name: 'Q' }];
    expect(await applySessionEdit(db, profile.id, onDate('a', rename, '2026-11-16'))).toMatchObject({ status: 'rejected' }); // pasado
    expect(await applySessionEdit(db, profile.id, onDate('b', rename, '2026-11-18'))).toMatchObject({ status: 'rejected' }); // descanso
    await db.runAsync("UPDATE scheduled_sessions SET status = 'completed' WHERE date = '2026-11-24'");
    expect(await applySessionEdit(db, profile.id, onDate('c', rename, '2026-11-24'))).toMatchObject({ status: 'rejected' });
    expect((await applySessionEdit(db, profile.id, onDate('ok', rename, '2026-12-01'))).status).toBe('applied');
    expect(await applySessionEdit(db, profile.id, onDate('ok', rename, '2026-12-01'))).toEqual({ status: 'duplicate' });
  });
});
