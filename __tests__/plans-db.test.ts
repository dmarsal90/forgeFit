import { migrate } from '../src/db';
import { getActivePlan, saveActivePlan } from '../src/db/plans';
import { createProfile, deleteProfile } from '../src/db/profiles';
import { moveSession, nextSession, type Plan } from '../src/lib/plan';
import { memoryDb } from '../test-utils/sqlite';

const plan = (name = 'Empuje', days = [0, 2, 4]): Plan => ({
  schemaVersion: 1, mode: 'local', summary: 's',
  sessions: days.map((day) => ({ day, name, blocks: [{ type: 'single', items: [{ exerciseVariantId: 'pushup.floor', sets: 3, repRange: [8, 12], restSeconds: 60 }] }] })),
});
async function setup() {
  const db = memoryDb();
  await migrate(db);
  const a = await createProfile(db, { alias: 'Ana' });
  const b = await createProfile(db, { alias: 'Beto' });
  return { db, a, b };
}

it('sin plan guardado devuelve null; guardar y leer devuelve el mismo plan', async () => {
  const { db, a } = await setup();
  expect(await getActivePlan(db, a.id)).toBeNull();
  await saveActivePlan(db, a.id, plan(), null);
  expect(await getActivePlan(db, a.id)).toEqual(plan());
});

it('aceptar un plan nuevo archiva el anterior: solo hay uno activo', async () => {
  const { db, a } = await setup();
  await saveActivePlan(db, a.id, plan('Viejo'), null);
  await saveActivePlan(db, a.id, plan('Nuevo'), null);
  expect((await getActivePlan(db, a.id))?.sessions[0].name).toBe('Nuevo');
  const rows = await db.getAllAsync<{ status: string }>('SELECT status FROM training_plans WHERE profile_id = ? ORDER BY rowid', [a.id]);
  expect(rows.map((r) => r.status)).toEqual(['archived', 'active']);
});

it('los planes no se filtran entre perfiles y se borran con el perfil', async () => {
  const { db, a, b } = await setup();
  await saveActivePlan(db, a.id, plan('De Ana'), null);
  expect(await getActivePlan(db, b.id)).toBeNull();
  await saveActivePlan(db, b.id, plan('De Beto'), null);
  await deleteProfile(db, a.id);
  expect(await db.getFirstAsync('SELECT 1 FROM training_plans WHERE profile_id = ?', [a.id])).toBeNull();
  expect((await getActivePlan(db, b.id))?.sessions[0].name).toBe('De Beto');
});

it('no guarda planes inválidos y trata un JSON corrupto como «sin plan»', async () => {
  const { db, a } = await setup();
  await expect(saveActivePlan(db, a.id, { ...plan(), sessions: [] } as Plan, null)).rejects.toThrow();
  await db.runAsync("INSERT INTO training_plans (id, profile_id, mode, status, plan_json, created_at) VALUES ('x', ?, 'local', 'active', '{no json', 'now')", [a.id]);
  expect(await getActivePlan(db, a.id)).toBeNull();
});

it('nextSession: hoy si toca, si no la siguiente y, pasado el último día, la primera de la semana', () => {
  const p = plan('X', [0, 2, 4]);
  expect(nextSession(p, 2)).toMatchObject({ isToday: true, session: { day: 2 } });
  expect(nextSession(p, 3)).toMatchObject({ isToday: false, session: { day: 4 } });
  expect(nextSession(p, 6)).toMatchObject({ isToday: false, session: { day: 0 } });
});

it('moveSession: mueve a un día libre, intercambia con uno ocupado y nunca duplica días', () => {
  const p = plan('X', [0, 2, 4]);
  p.sessions[0].name = 'A'; p.sessions[1].name = 'B'; p.sessions[2].name = 'C';
  const free = moveSession(p, 0, 1);
  expect(free.sessions.map((s) => [s.day, s.name])).toEqual([[1, 'A'], [2, 'B'], [4, 'C']]);
  const swap = moveSession(p, 0, 2);
  expect(swap.sessions.map((s) => [s.day, s.name])).toEqual([[0, 'B'], [2, 'A'], [4, 'C']]);
  expect(new Set(swap.sessions.map((s) => s.day)).size).toBe(3);
  expect(moveSession(p, 2, 2)).toBe(p);
  expect(() => moveSession(p, 1, 3)).toThrow(); // no hay sesión el martes
  expect(() => moveSession(p, 0, 9)).toThrow();
  expect(p.sessions.map((s) => s.day)).toEqual([0, 2, 4]); // no muta el original
});
