import { migrate } from '../src/db';
import { saveDraft } from '../src/db/onboarding';
import { applyPlanOperation } from '../src/db/planEditing';
import { createProfile, deleteProfile } from '../src/db/profiles';
import { setRotating } from '../src/db/profiles';
import { applyScheduleOperation, ensureHorizon, getInstances, getNextInstance, undoScheduleOperation } from '../src/db/schedule';
import type { Plan, PlanSession } from '../src/lib/plan';
import { addDays } from '../src/lib/schedule';
import { memoryDb } from '../test-utils/sqlite';

const TODAY = '2026-11-17'; // martes
const sess = (day: number, name: string, ex = 'pushup.floor', sets = 3): PlanSession => ({
  day, name, blocks: [{ type: 'single', items: [{ exerciseVariantId: ex, sets, repRange: [8, 12], restSeconds: 60 }] }],
});
const basePlan = (sessions = [sess(0, 'A'), sess(2, 'B'), sess(4, 'C')]): Plan => ({ schemaVersion: 1, mode: 'local', sessions });

/** Plan activo creado el lunes 2026-11-16 (a mediodía UTC, mismo día local en casi todas las zonas). */
async function seed(plan: Plan = basePlan()) {
  const db = memoryDb();
  await migrate(db);
  const profile = await createProfile(db, { alias: 'Ana' });
  await db.runAsync("INSERT INTO training_plans (id, profile_id, mode, status, plan_json, created_at) VALUES ('p1', ?, 'local', 'active', ?, '2026-11-16T12:00:00.000Z')", [profile.id, JSON.stringify(plan)]);
  await db.runAsync("INSERT INTO plan_revisions (id, plan_id, revision, author, definition_json, created_at) VALUES ('r1', 'p1', 1, 'engine', ?, '2026-11-16T12:00:00.000Z')", [JSON.stringify(plan)]);
  return { db, profile };
}
const names = (rows: { date: string; session: PlanSession | null }[]) => rows.map((r) => `${r.date.slice(5)}:${r.session?.name ?? '-'}`);
const move = (id: string, from: string, to: string, type: 'move' | 'swap' | 'duplicate' = 'move') => ({ operationId: id, op: { type, from, to }, today: TODAY });

describe('generación de instancias', () => {
  it('crea las instancias de la semana desde la plantilla (entrenamiento o descanso) y es idempotente', async () => {
    const { db, profile } = await seed();
    const week = await getInstances(db, profile.id, '2026-11-16', '2026-11-22', TODAY);
    expect(names(week)).toEqual(['11-16:A', '11-17:-', '11-18:B', '11-19:-', '11-20:C', '11-21:-', '11-22:-']);
    await getInstances(db, profile.id, '2026-11-16', '2026-11-22', TODAY);
    await db.withExclusiveTransactionAsync(async (tx) => { await ensureHorizon(tx, profile.id, '2026-11-22', TODAY); });
    expect((await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM scheduled_sessions WHERE date BETWEEN ? AND ?', ['2026-11-16', '2026-11-22']))?.n).toBe(7);
  });
  it('mantiene siempre 9 semanas por delante y se extiende al mirar más lejos', async () => {
    const { db, profile } = await seed();
    await getInstances(db, profile.id, TODAY, TODAY, TODAY);
    const max = (await db.getFirstAsync<{ d: string }>('SELECT MAX(date) AS d FROM scheduled_sessions'))!.d;
    expect(max >= addDays(TODAY, 63)).toBe(true);
    const far = await getInstances(db, profile.id, '2027-06-01', '2027-06-07', TODAY);
    expect(far).toHaveLength(7);
  });
  it('sin plan no hay instancias; la tabla exige sesión en los días de entrenamiento', async () => {
    const db = memoryDb();
    await migrate(db);
    const p = await createProfile(db, { alias: 'Ana' });
    expect(await getInstances(db, p.id, TODAY, addDays(TODAY, 6), TODAY)).toEqual([]);
    const { db: db2, profile } = await seed();
    await expect(db2.runAsync("INSERT INTO scheduled_sessions (id, profile_id, plan_id, date, kind, status, origin, session_json, revision) VALUES ('x', ?, 'p1', '2026-12-01', 'training', 'scheduled', 'template', NULL, 1)", [profile.id])).rejects.toThrow();
  });
  it('getNextInstance da la sesión de hoy o la siguiente y salta lo ya realizado', async () => {
    const { db, profile } = await seed();
    expect((await getNextInstance(db, profile.id, '2026-11-18'))?.date).toBe('2026-11-18'); // hoy toca B
    expect((await getNextInstance(db, profile.id, TODAY))?.date).toBe('2026-11-18');
    await db.runAsync("UPDATE scheduled_sessions SET status = 'completed' WHERE date = '2026-11-18'");
    expect((await getNextInstance(db, profile.id, '2026-11-18'))?.date).toBe('2026-11-20');
  });
  it('en rutina rotativa ofrece la pendiente más antigua de las últimas 2 semanas, aunque esté vencida', async () => {
    const { db, profile } = await seed();
    expect((await getNextInstance(db, profile.id, '2026-11-19'))?.date).toBe('2026-11-20'); // normal: lo vencido se ignora
    await setRotating(db, profile.id, true);
    expect((await getNextInstance(db, profile.id, '2026-11-19'))?.date).toBe('2026-11-16'); // A sigue pendiente
    await db.runAsync("UPDATE scheduled_sessions SET status = 'completed' WHERE date = '2026-11-16'");
    expect((await getNextInstance(db, profile.id, '2026-11-19'))?.date).toBe('2026-11-18'); // luego B
    expect((await getNextInstance(db, profile.id, '2026-12-08'))?.date).toBe('2026-11-25'); // el 23-11 queda fuera de las 2 semanas
    await setRotating(db, profile.id, false);
    expect((await getNextInstance(db, profile.id, '2026-11-19'))?.date).toBe('2026-11-20');
  });
});

describe('cambios por fecha (solo esa semana o fecha)', () => {
  it('mover afecta únicamente a esas dos fechas, deja la plantilla intacta y queda registrado', async () => {
    const { db, profile } = await seed();
    const r = await applyScheduleOperation(db, profile.id, move('o1', '2026-11-23', '2026-11-24'));
    expect(r.status).toBe('applied');
    expect(names(await getInstances(db, profile.id, '2026-11-23', '2026-11-29', TODAY))).toEqual(['11-23:-', '11-24:A', '11-25:B', '11-26:-', '11-27:C', '11-28:-', '11-29:-']);
    expect(names(await getInstances(db, profile.id, '2026-11-30', '2026-12-06', TODAY))[0]).toBe('11-30:A'); // la semana siguiente no cambia
    expect(JSON.parse((await db.getFirstAsync<{ plan_json: string }>('SELECT plan_json FROM training_plans'))!.plan_json).sessions.map((s: PlanSession) => s.day)).toEqual([0, 2, 4]);
    expect(await db.getFirstAsync("SELECT 1 FROM session_reschedules WHERE operation_id = 'o1' AND kind = 'move'")).not.toBeNull();
  });
  it('intercambiar y duplicar funcionan; no se pisan sesiones', async () => {
    const { db, profile } = await seed();
    await applyScheduleOperation(db, profile.id, move('o1', '2026-11-18', '2026-11-20', 'swap'));
    await applyScheduleOperation(db, profile.id, move('o2', '2026-11-18', '2026-11-19', 'duplicate'));
    expect(names(await getInstances(db, profile.id, '2026-11-18', '2026-11-20', TODAY))).toEqual(['11-18:C', '11-19:C (copia)', '11-20:B']);
    expect(await applyScheduleOperation(db, profile.id, move('o3', '2026-11-18', '2026-11-20', 'move'))).toMatchObject({ status: 'rejected' });
  });
  it('rechaza fechas pasadas, sesiones realizadas, operaciones mal formadas y es idempotente', async () => {
    const { db, profile } = await seed();
    expect(await applyScheduleOperation(db, profile.id, move('p', '2026-11-16', '2026-11-17'))).toMatchObject({ status: 'rejected' }); // lunes pasado
    await db.runAsync("UPDATE scheduled_sessions SET status = 'completed' WHERE date = '2026-11-18'"); // miércoles realizado
    expect(await applyScheduleOperation(db, profile.id, move('c', '2026-11-18', '2026-11-19'))).toMatchObject({ status: 'rejected' });
    expect(await applyScheduleOperation(db, profile.id, { operationId: 'm', op: { type: 'move', from: 'hoy', to: 'mañana' } as never, today: TODAY })).toMatchObject({ status: 'rejected' });
    await applyScheduleOperation(db, profile.id, move('ok', '2026-11-20', '2026-11-21'));
    expect(await applyScheduleOperation(db, profile.id, move('ok', '2026-11-20', '2026-11-21'))).toEqual({ status: 'duplicate' });
    expect((await getInstances(db, profile.id, '2026-11-18', '2026-11-18', TODAY))[0].status).toBe('completed');
  });
  it('deshacer restaura exactamente las dos instancias, una sola vez', async () => {
    const { db, profile } = await seed();
    await applyScheduleOperation(db, profile.id, move('o1', '2026-11-23', '2026-11-24', 'move'));
    const u = await undoScheduleOperation(db, profile.id, { operationId: 'u1', undoOf: 'o1' });
    expect(u.status).toBe('applied');
    expect(names(await getInstances(db, profile.id, '2026-11-23', '2026-11-24', TODAY))).toEqual(['11-23:A', '11-24:-']);
    expect(await undoScheduleOperation(db, profile.id, { operationId: 'u2', undoOf: 'o1' })).toMatchObject({ status: 'rejected' });
    await applyScheduleOperation(db, profile.id, move('o2', '2026-11-25', '2026-11-26'));
    await db.runAsync("UPDATE scheduled_sessions SET status = 'completed' WHERE date = '2026-11-26'");
    expect(await undoScheduleOperation(db, profile.id, { operationId: 'u3', undoOf: 'o2' })).toMatchObject({ status: 'rejected' });
  });
  it('avisa si el cambio deja días seguidos con los mismos músculos principales', async () => {
    const push = (day: number, name: string) => sess(day, name, 'incline_bench_press.db', 4);
    const { db, profile } = await seed(basePlan([push(0, 'Empuje'), push(2, 'Pecho'), sess(4, 'Piernas', 'bodyweight_squat.floor')]));
    for (const [step, data] of Object.entries({ 2: { primaryGoal: 'muscle' }, 3: { level: 'intermediate' }, 4: { days: [0, 1, 2, 3, 4], minutes: 90 } })) await saveDraft(db, profile.id, Number(step), data);
    const r = await applyScheduleOperation(db, profile.id, move('o1', '2026-11-25', '2026-11-24'));
    expect(r.status === 'applied' && r.warnings.map((w) => w.code)).toContain('recovery_overlap');
  });
});

describe('cambios a todas las semanas (plantilla)', () => {
  it('las instancias futuras siguen a la plantilla, salvo las que cambiaste a mano, el pasado y lo realizado', async () => {
    const { db, profile } = await seed();
    await getInstances(db, profile.id, '2026-11-16', '2026-12-13', TODAY);
    await applyScheduleOperation(db, profile.id, move('o1', '2026-11-27', '2026-11-26')); // viernes 27 → jueves 26 (a mano)
    await db.runAsync("UPDATE scheduled_sessions SET status = 'completed' WHERE date = '2026-11-30'"); // lunes 30 realizado
    const r = await applyPlanOperation(db, profile.id, { operationId: 'tpl', baseVersion: 1, op: { type: 'swap_sessions', a: 0, b: 2 }, today: TODAY });
    expect(r.status).toBe('applied');
    const rows = await getInstances(db, profile.id, '2026-11-16', '2026-12-06', TODAY);
    const at = (d: string) => rows.find((x) => x.date === d)?.session?.name ?? '-';
    expect(at('2026-11-16')).toBe('A'); // pasado: intacto
    expect(at('2026-11-18')).toBe('A'); // miércoles futuro: ahora entrena A (plantilla nueva)
    expect(at('2026-11-23')).toBe('B'); // lunes futuro: B
    expect(at('2026-11-30')).toBe('A'); // realizado: no cambia
    expect(at('2026-11-26')).toBe('C'); // cambio manual: se respeta
    expect(at('2026-11-27')).toBe('-');
    expect(rows.filter((x) => x.date >= '2026-11-16' && x.date <= '2026-11-22')).toHaveLength(7); // sin duplicados
  });
});

it('borrar el perfil elimina sus instancias y registros de reprogramación', async () => {
  const { db, profile } = await seed();
  await applyScheduleOperation(db, profile.id, move('o1', '2026-11-23', '2026-11-24'));
  await deleteProfile(db, profile.id);
  expect(await db.getFirstAsync('SELECT 1 FROM scheduled_sessions')).toBeNull();
  expect(await db.getFirstAsync('SELECT 1 FROM session_reschedules')).toBeNull();
});
