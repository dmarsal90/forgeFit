import { migrate } from '../src/db';
import { migrations } from '../src/db/migrations';
import { saveDraft } from '../src/db/onboarding';
import { applyPlanOperation, getActivePlanState, getRevisionPlan, listRevisions, restoreRevision, undoLast } from '../src/db/planEditing';
import { saveActivePlan } from '../src/db/plans';
import { createProfile, deleteProfile } from '../src/db/profiles';
import type { Plan } from '../src/lib/plan';
import { memoryDb } from '../test-utils/sqlite';

const item = (id: string) => ({ exerciseVariantId: id, sets: 3, repRange: [8, 12] as [number, number], restSeconds: 60 });
const sess = (day: number, name: string, ex = 'pushup.floor') => ({ day, name, blocks: [{ type: 'single' as const, items: [item(ex)] }] });
const plan = (sessions = [sess(0, 'A'), sess(2, 'B'), sess(4, 'C')]): Plan => ({ schemaVersion: 1, mode: 'local', sessions });
const view = (p: Plan) => p.sessions.map((s) => `${s.day}:${s.name}`);

async function setup(p: Plan = plan()) {
  const db = memoryDb();
  await migrate(db);
  const a = await createProfile(db, { alias: 'Ana' });
  const b = await createProfile(db, { alias: 'Beto' });
  await saveActivePlan(db, a.id, p, null);
  return { db, a, b };
}
const swap = (operationId: string, baseVersion: number, x = 0, y = 2) => ({ operationId, baseVersion, op: { type: 'swap_sessions' as const, a: x, b: y } });

it('guardar un plan crea la revisión 1 (generada por el motor) y versión 1', async () => {
  const { db, a } = await setup();
  expect((await getActivePlanState(db, a.id))?.version).toBe(1);
  const revs = await listRevisions(db, a.id);
  expect(revs).toHaveLength(1);
  expect(revs[0]).toMatchObject({ revision: 1, author: 'engine' });
});

it('aplicar una operación crea una revisión nueva, sube la versión y registra la operación', async () => {
  const { db, a } = await setup();
  const r = await applyPlanOperation(db, a.id, swap('op-1', 1));
  expect(r.status).toBe('applied');
  expect(r.status === 'applied' && view(r.plan)).toEqual(['0:B', '2:A', '4:C']);
  const state = await getActivePlanState(db, a.id);
  expect(state?.version).toBe(2);
  expect(view(state!.plan)).toEqual(['0:B', '2:A', '4:C']);
  expect((await listRevisions(db, a.id)).map((x) => [x.revision, x.author])).toEqual([[2, 'user'], [1, 'engine']]);
  expect(await db.getFirstAsync('SELECT 1 FROM plan_operations WHERE operation_id = ?', ['op-1'])).not.toBeNull();
});

it('es idempotente: repetir el mismo operation_id no vuelve a aplicar nada', async () => {
  const { db, a } = await setup();
  await applyPlanOperation(db, a.id, swap('op-1', 1));
  const again = await applyPlanOperation(db, a.id, swap('op-1', 1));
  expect(again).toEqual({ status: 'duplicate', version: 2 });
  expect((await getActivePlanState(db, a.id))?.version).toBe(2);
  expect(await listRevisions(db, a.id)).toHaveLength(2);
});

it('control de versión: con una versión caduca se rechaza y no cambia nada', async () => {
  const { db, a } = await setup();
  await applyPlanOperation(db, a.id, swap('op-1', 1));
  const stale = await applyPlanOperation(db, a.id, swap('op-2', 1, 0, 4));
  expect(stale).toEqual({ status: 'stale', version: 2 });
  expect(view((await getActivePlanState(db, a.id))!.plan)).toEqual(['0:B', '2:A', '4:C']);
});

it('rechaza operaciones no aplicables o mal formadas sin tocar el plan', async () => {
  const { db, a } = await setup();
  const occupied = await applyPlanOperation(db, a.id, { operationId: 'x1', baseVersion: 1, op: { type: 'move_session', from: 0, to: 2 } });
  expect(occupied).toMatchObject({ status: 'rejected' });
  const bad = await applyPlanOperation(db, a.id, { operationId: 'x2', baseVersion: 1, op: { type: 'borrar_todo' } as never });
  expect(bad).toMatchObject({ status: 'rejected' });
  expect((await getActivePlanState(db, a.id))?.version).toBe(1);
  expect(await listRevisions(db, a.id)).toHaveLength(1);
  expect(await db.getFirstAsync("SELECT 1 FROM plan_operations WHERE operation_id IN ('x1','x2')")).toBeNull();
});

it('sin plan activo no hay nada que editar', async () => {
  const { db, b } = await setup();
  expect(await applyPlanOperation(db, b.id, swap('op-1', 1))).toEqual({ status: 'no_plan' });
});

describe('validación al aplicar', () => {
  const drafts = { 2: { primaryGoal: 'muscle' }, 3: { level: 'intermediate' }, 4: { days: [0, 2, 4], minutes: 90 } };
  async function withContext(p: Plan) {
    const s = await setup(p);
    for (const [step, data] of Object.entries(drafts)) await saveDraft(s.db, s.a.id, Number(step), data);
    return s;
  }
  it('mover a un día que no marcaste como disponible se aplica, pero avisa', async () => {
    const { db, a } = await withContext(plan());
    const r = await applyPlanOperation(db, a.id, { operationId: 'o', baseVersion: 1, op: { type: 'move_session', from: 4, to: 5 } });
    expect(r.status).toBe('applied');
    expect(r.status === 'applied' && r.warnings.map((w) => [w.severity, w.code])).toContainEqual(['warning', 'day_unavailable']);
  });
  it('lo que ya estaba mal antes no bloquea el cambio de día', async () => {
    // la prensa necesita una máquina que no está confirmada: error previo, ajeno a la operación
    const { db, a } = await withContext(plan([sess(0, 'A', 'leg_press.machine'), sess(2, 'B'), sess(4, 'C')]));
    const r = await applyPlanOperation(db, a.id, swap('o', 1));
    expect(r.status).toBe('applied');
  });
  it('restaurar no se bloquea por problemas de disponibilidad que el plan ya tenía', async () => {
    const { db, a } = await withContext(plan([sess(0, 'A', 'leg_press.machine'), sess(2, 'B'), sess(4, 'C')]));
    await applyPlanOperation(db, a.id, swap('op-1', 1));
    const r = await restoreRevision(db, a.id, { operationId: 'rest-1', revision: 1, baseVersion: 2 });
    expect(r.status).toBe('applied');
    expect(r.status === 'applied' && r.warnings.every((w) => w.severity === 'warning')).toBe(true);
  });
  it('avisa si el cambio deja días seguidos con los mismos músculos principales', async () => {
    const push = (day: number, name: string) => ({ day, name, blocks: [{ type: 'single' as const, items: [{ ...item('incline_bench_press.db'), sets: 4 }] }] });
    const { db, a } = await withContext(plan([push(0, 'Empuje'), push(2, 'Pecho'), sess(4, 'Piernas', 'bodyweight_squat.floor')]));
    const r = await applyPlanOperation(db, a.id, { operationId: 'o', baseVersion: 1, op: { type: 'move_session', from: 2, to: 1 } });
    expect(r.status === 'applied' && r.warnings.map((w) => w.code)).toContain('recovery_overlap');
  });
});

describe('historial', () => {
  it('deshacer crea una revisión nueva con el estado anterior; no borra nada', async () => {
    const { db, a } = await setup();
    await applyPlanOperation(db, a.id, swap('op-1', 1));
    const u = await undoLast(db, a.id, { operationId: 'undo-1', baseVersion: 2 });
    expect(u.status === 'applied' && view(u.plan)).toEqual(['0:A', '2:B', '4:C']);
    expect((await getActivePlanState(db, a.id))?.version).toBe(3);
    expect((await listRevisions(db, a.id)).map((r) => r.revision)).toEqual([3, 2, 1]);
  });
  it('no hay nada que deshacer en la versión 1', async () => {
    const { db, a } = await setup();
    expect(await undoLast(db, a.id, { operationId: 'u', baseVersion: 1 })).toMatchObject({ status: 'rejected' });
  });
  it('restaurar una versión antigua crea una revisión nueva y conserva todas las demás', async () => {
    const { db, a } = await setup();
    await applyPlanOperation(db, a.id, swap('op-1', 1));
    await applyPlanOperation(db, a.id, swap('op-2', 2, 0, 4));
    const r = await restoreRevision(db, a.id, { operationId: 'rest-1', revision: 1, baseVersion: 3 });
    expect(r.status === 'applied' && view(r.plan)).toEqual(['0:A', '2:B', '4:C']);
    expect((await listRevisions(db, a.id)).map((x) => x.revision)).toEqual([4, 3, 2, 1]);
    expect(await restoreRevision(db, a.id, { operationId: 'rest-2', revision: 99, baseVersion: 4 })).toMatchObject({ status: 'rejected' });
  });
  it('restaurar es idempotente por operationId y getRevisionPlan devuelve la definición antigua', async () => {
    const { db, a } = await setup();
    await applyPlanOperation(db, a.id, swap('op-1', 1));
    expect(view((await getRevisionPlan(db, a.id, 1))!)).toEqual(['0:A', '2:B', '4:C']);
    expect(await getRevisionPlan(db, a.id, 99)).toBeNull();
    await restoreRevision(db, a.id, { operationId: 'rest-1', revision: 1, baseVersion: 2 });
    expect(await restoreRevision(db, a.id, { operationId: 'rest-1', revision: 1, baseVersion: 2 })).toMatchObject({ status: 'duplicate' });
    expect((await listRevisions(db, a.id)).map((x) => x.revision)).toEqual([3, 2, 1]);
  });
  it('las revisiones son inmutables', async () => {
    const { db, a } = await setup();
    await expect(db.runAsync("UPDATE plan_revisions SET definition_json = '{}' WHERE revision = 1")).rejects.toThrow();
    expect((await listRevisions(db, a.id))[0].revision).toBe(1);
  });
});

it('los perfiles no se mezclan y borrar un perfil elimina sus revisiones y operaciones', async () => {
  const { db, a, b } = await setup();
  await saveActivePlan(db, b.id, plan([sess(1, 'X')]), null);
  await applyPlanOperation(db, a.id, swap('op-a', 1));
  expect(view((await getActivePlanState(db, b.id))!.plan)).toEqual(['1:X']);
  await deleteProfile(db, a.id);
  expect(await db.getFirstAsync('SELECT 1 FROM plan_revisions')).not.toBeNull(); // quedan las de Beto
  expect(await db.getFirstAsync("SELECT 1 FROM plan_operations WHERE operation_id = 'op-a'")).toBeNull();
  expect((await listRevisions(db, b.id)).map((r) => r.revision)).toEqual([1]);
});

it('la migración 005 crea la revisión 1 de los planes que ya existían', async () => {
  const db = memoryDb();
  await migrate(db, migrations.slice(0, 4));
  // Perfil insertado a mano: createProfile ya escribe columnas de migraciones posteriores a la 4.
  await db.runAsync("INSERT INTO profiles (id, alias, created_at, updated_at) VALUES ('a1', 'Ana', 'now', 'now')");
  await db.runAsync("INSERT OR REPLACE INTO app_state (key, value) VALUES ('active_profile_id', 'a1')");
  const a = { id: 'a1' };
  await db.runAsync("INSERT INTO training_plans (id, profile_id, mode, status, plan_json, created_at) VALUES ('p1', ?, 'local', 'active', ?, 'now')", [a.id, JSON.stringify(plan())]);
  await migrate(db); // aplica la 005
  expect((await getActivePlanState(db, a.id))?.version).toBe(1);
  expect(await listRevisions(db, a.id)).toMatchObject([{ revision: 1, author: 'engine' }]);
});
