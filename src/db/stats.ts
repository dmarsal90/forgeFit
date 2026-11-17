import { currentStreak, type DayRow } from '../lib/streak';
import { addDays, toDateKey, weekStart, type DateKey } from '../lib/schedule';
import type { Db } from './index';
import { loadWorkout } from './workouts';

export type ProgressStats = {
  streakWeeks: number;
  week: { done: number; planned: number };
  completedTotal: number;
  volumeKg: number; // peso × repeticiones de las sesiones terminadas esta semana
  pendingOverdue: number; // sesiones vencidas sin realizar (se muestran como «pendientes», sin culpa)
};

export async function getProgressStats(db: Db, profileId: string, today: DateKey = toDateKey()): Promise<ProgressStats> {
  const start = weekStart(today), end = addDays(start, 6);
  const plan = await db.getFirstAsync<{ id: string; created_at: string }>("SELECT id, created_at FROM training_plans WHERE profile_id = ? AND status = 'active'", [profileId]);
  if (!plan) return { streakWeeks: 0, week: { done: 0, planned: 0 }, completedTotal: 0, volumeKg: 0, pendingOverdue: 0 };
  // Las instancias se generan desde el lunes de la semana de creación: lo anterior a crear el plan no cuenta como pendiente.
  const days = await db.getAllAsync<DayRow>(
    'SELECT date, kind, status FROM scheduled_sessions WHERE plan_id = ? AND date >= ? AND date <= ?', [plan.id, toDateKey(new Date(plan.created_at)), end]);
  const training = days.filter((d) => d.kind === 'training');
  const thisWeek = training.filter((d) => d.date >= start);
  const finished = await db.getAllAsync<{ id: string }>(
    `SELECT w.id FROM workout_sessions w JOIN scheduled_sessions s ON s.id = w.scheduled_session_id
     WHERE w.profile_id = ? AND w.status = 'finished' AND s.date >= ? AND s.date <= ?`, [profileId, start, end]);
  let volumeKg = 0;
  for (const f of finished) {
    const w = await loadWorkout(db, f.id);
    for (const d of Object.values(w?.state.done ?? {})) if (!d.skipped) volumeKg += (d.weightKg ?? 0) * (d.reps ?? 0);
  }
  return {
    streakWeeks: currentStreak(days, today),
    week: { done: thisWeek.filter((d) => d.status === 'completed').length, planned: thisWeek.length },
    completedTotal: training.filter((d) => d.status === 'completed').length,
    volumeKg: Math.round(volumeKg),
    pendingOverdue: training.filter((d) => d.date < today && d.status !== 'completed').length,
  };
}
