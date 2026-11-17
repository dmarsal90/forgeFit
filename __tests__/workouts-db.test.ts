import { migrate } from '../src/db';
import { saveActivePlan } from '../src/db/plans';
import { createProfile } from '../src/db/profiles';
import { ensureHorizon } from '../src/db/schedule';
import { finishWorkout, getOpenWorkoutId, loadWorkout, recordEvent, startWorkout } from '../src/db/workouts';
import type { Plan } from '../src/lib/plan';
import { memoryDb } from '../test-utils/sqlite';

const item = (id: string, sets = 2) => ({ exerciseVariantId: id, sets, repRange: [8, 12] as [number, number], restSeconds: 60 });
const plan: Plan = { schemaVersion: 1, mode: 'local', sessions: Array.from({ length: 7 }, (_, day) => ({ day, name: `D${day}`, blocks: [{ type: 'superset' as const, items: [item('a'), item('b')] }] })) };

async function setup() {
  const db = memoryDb();
  await migrate(db);
  const p = await createProfile(db, { alias: 'Ana' });
  await saveActivePlan(db, p.id, plan, null);
  const today = '2026-11-17';
  await ensureHorizon(db, p.id, today, today);
  return { db, p, today };
}

it('empezar congela la sesión, es idempotente y se recupera abierta', async () => {
  const { db, p, today } = await setup();
  const id = await startWorkout(db, p.id, today, 1000);
  expect(await startWorkout(db, p.id, today, 2000)).toBe(id); // ya hay una abierta
  expect(await getOpenWorkoutId(db, p.id)).toBe(id);
  const w = await loadWorkout(db, id, 1500);
  expect(w?.state).toMatchObject({ status: 'active', activeMs: 500 });
  // Editar la plantilla después no cambia lo ya empezado
  await db.runAsync("UPDATE scheduled_sessions SET session_json = replace(session_json, 'D1', 'ZZ')");
  expect((await loadWorkout(db, id))?.session.name).toBe('D1');
});

it('registrar eventos es idempotente por eventId y se rechaza uno inválido o tras terminar', async () => {
  const { db, p, today } = await setup();
  const id = await startWorkout(db, p.id, today, 0);
  const ev = { type: 'set_done' as const, block: 0, item: 0, round: 0, reps: 10, weightKg: 30 };
  await recordEvent(db, id, ev, { eventId: 'e1', now: 5 });
  await recordEvent(db, id, ev, { eventId: 'e1', now: 6 });
  expect((await loadWorkout(db, id))?.events).toHaveLength(2);
  await expect(recordEvent(db, id, { ...ev, reps: -1 })).rejects.toThrow();
  await finishWorkout(db, id, 50);
  await expect(recordEvent(db, id, ev)).rejects.toThrow('terminó');
  expect(await getOpenWorkoutId(db, p.id)).toBeNull();
});

it('terminar marca la sesión programada como completada y los eventos no se pueden editar', async () => {
  const { db, p, today } = await setup();
  const id = await startWorkout(db, p.id, today, 0);
  await finishWorkout(db, id, 10);
  expect((await db.getFirstAsync<{ status: string }>('SELECT status FROM scheduled_sessions WHERE date = ?', [today]))?.status).toBe('completed');
  await expect(db.runAsync("UPDATE session_events SET at = 1")).rejects.toThrow('inmutable');
  await expect(startWorkout(db, p.id, today)).rejects.toThrow(); // ya completada
});
