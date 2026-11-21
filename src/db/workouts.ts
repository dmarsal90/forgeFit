import { findVariant } from '../lib/exercises';
import { planSchema, type PlanSession } from '../lib/plan';
import { suggestReplacements, type Candidate } from '../lib/replacements';
import { eventSchema, reduce, type Timed, type WorkoutEvent, type WorkoutState } from '../lib/workoutMachine';
import { newId } from './id';
import { loadContext } from './planContext';
import type { Db } from './index';

const sessionSchema = planSchema.shape.sessions.element;

export type Workout = { id: string; scheduledSessionId: string | null; status: 'active' | 'finished'; startedAt: number; endedAt: number | null; session: PlanSession; events: Timed[]; state: WorkoutState };
type Row = { id: string; scheduled_session_id: string | null; status: 'active' | 'finished'; started_at: number; ended_at: number | null; snapshot_json: string };

async function append(tx: Db, workoutId: string, event: WorkoutEvent, at: number, eventId?: string) {
  const ev = eventSchema.parse(event);
  if (ev.type === 'substitute' && !findVariant(ev.variantId)) throw new Error('Ejercicio desconocido');
  const id = eventId ?? await newId(tx);
  if (await tx.getFirstAsync('SELECT 1 FROM session_events WHERE id = ?', [id])) return; // reintento: ya registrado
  const w = await tx.getFirstAsync<{ status: string }>('SELECT status FROM workout_sessions WHERE id = ?', [workoutId]);
  if (!w) throw new Error('Sesión no encontrada');
  if (w.status === 'finished') throw new Error('La sesión ya terminó');
  const seq = await tx.getFirstAsync<{ n: number }>('SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM session_events WHERE session_id = ?', [workoutId]);
  await tx.runAsync('INSERT INTO session_events (id, session_id, seq, at, event_json) VALUES (?,?,?,?,?)', [id, workoutId, seq?.n ?? 1, at, JSON.stringify(ev)]);
}

/** Empieza (o reanuda, si ya hay una abierta) la sesión programada de esa fecha. Congela una copia de la sesión. */
export async function startWorkout(db: Db, profileId: string, date: string, now = Date.now()): Promise<string> {
  let id = '';
  await db.withExclusiveTransactionAsync(async (tx) => {
    const open = await tx.getFirstAsync<{ id: string }>("SELECT id FROM workout_sessions WHERE profile_id = ? AND status = 'active'", [profileId]);
    if (open) { id = open.id; return; }
    const s = await tx.getFirstAsync<{ id: string; session_json: string | null }>(
      "SELECT id, session_json FROM scheduled_sessions WHERE profile_id = ? AND date = ? AND kind = 'training' AND status = 'scheduled'", [profileId, date]);
    if (!s?.session_json) throw new Error('Sesión programada no encontrada');
    const snapshot = sessionSchema.parse(JSON.parse(s.session_json));
    id = await newId(tx);
    await tx.runAsync("INSERT INTO workout_sessions (id, profile_id, scheduled_session_id, status, started_at, snapshot_json) VALUES (?,?,?,'active',?,?)",
      [id, profileId, s.id, now, JSON.stringify(snapshot)]);
    await append(tx, id, { type: 'start' }, now);
  });
  return id;
}

export async function recordEvent(db: Db, workoutId: string, event: WorkoutEvent, opts: { eventId?: string; now?: number } = {}): Promise<void> {
  await db.withExclusiveTransactionAsync((tx) => append(tx, workoutId, event, opts.now ?? Date.now(), opts.eventId));
}

/** Cierra la sesión y marca la programada como completada. */
export async function finishWorkout(db: Db, workoutId: string, now = Date.now()): Promise<void> {
  await db.withExclusiveTransactionAsync(async (tx) => {
    await append(tx, workoutId, { type: 'finish' }, now);
    await tx.runAsync("UPDATE workout_sessions SET status = 'finished', ended_at = ? WHERE id = ?", [now, workoutId]);
    await tx.runAsync("UPDATE scheduled_sessions SET status = 'completed' WHERE id = (SELECT scheduled_session_id FROM workout_sessions WHERE id = ?)", [workoutId]);
  });
}

export async function loadWorkout(db: Db, workoutId: string, now = Date.now()): Promise<Workout | null> {
  const r = await db.getFirstAsync<Row>('SELECT id, scheduled_session_id, status, started_at, ended_at, snapshot_json FROM workout_sessions WHERE id = ?', [workoutId]);
  if (!r) return null;
  const session = sessionSchema.parse(JSON.parse(r.snapshot_json));
  const rows = await db.getAllAsync<{ at: number; event_json: string }>('SELECT at, event_json FROM session_events WHERE session_id = ? ORDER BY seq', [workoutId]);
  const events = rows.map((e) => ({ at: e.at, event: eventSchema.parse(JSON.parse(e.event_json)) }));
  return { id: r.id, scheduledSessionId: r.scheduled_session_id, status: r.status, startedAt: r.started_at, endedAt: r.ended_at, session, events, state: reduce(session, events, now) };
}

/** Sesión abierta del perfil (para ofrecer «Reanudar» tras un cierre accidental). */
export async function getOpenWorkoutId(db: Db, profileId: string): Promise<string | null> {
  const r = await db.getFirstAsync<{ id: string }>("SELECT id FROM workout_sessions WHERE profile_id = ? AND status = 'active'", [profileId]);
  return r?.id ?? null;
}

/** Ejercicios con los que sustituir uno en plena sesión: los equivalentes que el equipo del plan permite y que no están ya en la sesión. */
export async function loadReplacements(db: Db, profileId: string, variantId: string, sessionVariantIds: readonly string[]): Promise<Candidate[]> {
  const plan = await db.getFirstAsync<{ environment_id: string | null }>("SELECT environment_id FROM training_plans WHERE profile_id = ? AND status = 'active'", [profileId]);
  const ctx = await loadContext(db, profileId, plan?.environment_id ?? null);
  return ctx ? suggestReplacements(variantId, ctx, sessionVariantIds) : [];
}
