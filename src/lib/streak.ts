import { addDays, weekStart, type DateKey, type Instance } from './schedule';

// Racha semanal (docs/PROFILES_PLANS_STREAKS.md). Solo cuentan las sesiones de entrenamiento: los descansos son neutros.
// Mover una sesión la deja en su nueva fecha, así que «reprogramada válidamente» es simplemente estar en esa fecha.
export type DayRow = Pick<Instance, 'date' | 'kind' | 'status'>;
export type WeekStatus = 'done' | 'open' | 'missed' | 'empty';

/** done: todo realizado · open: semana en curso sin vencidas pendientes · missed: alguna vencida sin realizar · empty: sin sesiones (pausa). */
export function weekStatus(days: DayRow[], today: DateKey): WeekStatus {
  const training = days.filter((d) => d.kind === 'training');
  if (!training.length) return 'empty';
  if (training.some((d) => d.date < today && d.status !== 'completed')) return 'missed';
  return training.every((d) => d.status === 'completed') ? 'done' : 'open';
}

/** Semanas consecutivas cumplidas hasta hoy. Una semana vacía pausa (ni suma ni rompe); una abierta aún no cuenta; una fallida corta. */
export function currentStreak(days: DayRow[], today: DateKey): number {
  const byWeek = new Map<DateKey, DayRow[]>();
  for (const d of days) { const w = weekStart(d.date); byWeek.set(w, [...(byWeek.get(w) ?? []), d]); }
  const first = [...byWeek.keys()].sort()[0];
  if (!first) return 0;
  let streak = 0;
  for (let w = weekStart(today); w >= first; w = addDays(w, -7)) {
    const s = weekStatus(byWeek.get(w) ?? [], today);
    if (s === 'missed') break;
    if (s === 'done') streak++;
  }
  return streak;
}
