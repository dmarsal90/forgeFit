import type { Plan, PlanSession } from './plan';

// Calendario con fechas (V8-A2). Las fechas son días de calendario LOCALES en texto «AAAA-MM-DD»: no llevan hora ni zona,
// así que viajar o cambiar de zona horaria no corre ni duplica ningún día. La aritmética usa UTC solo para evitar saltos de horario de verano.
export type DateKey = string;
const pad = (n: number) => String(n).padStart(2, '0');

export const toDateKey = (d: Date = new Date()): DateKey => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const utc = (k: DateKey) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const fromUtc = (ms: number): DateKey => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };

export const isDateKey = (k: string): k is DateKey => /^\d{4}-\d{2}-\d{2}$/.test(k) && fromUtc(utc(k)) === k;
export const addDays = (k: DateKey, n: number): DateKey => fromUtc(utc(k) + n * 86_400_000);
/** Lunes = 0 … domingo = 6. */
export const weekdayOf = (k: DateKey): number => (new Date(utc(k)).getUTCDay() + 6) % 7;
export const weekStart = (k: DateKey): DateKey => addDays(k, -weekdayOf(k));
export const datesOfWeek = (k: DateKey): DateKey[] => Array.from({ length: 7 }, (_, i) => addDays(weekStart(k), i));
export const diffDays = (a: DateKey, b: DateKey): number => Math.round((utc(b) - utc(a)) / 86_400_000);
export const monthOf = (k: DateKey): DateKey => `${k.slice(0, 7)}-01`;
export const addMonths = (k: DateKey, n: number): DateKey => {
  const [y, m] = k.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}-01`;
};
/** Semanas completas (lunes–domingo) que cubren el mes de `k`. */
export function monthGrid(k: DateKey): DateKey[][] {
  const first = monthOf(k);
  const last = addDays(addMonths(first, 1), -1);
  const weeks: DateKey[][] = [];
  for (let s = weekStart(first); s <= last; s = addDays(s, 7)) weeks.push(datesOfWeek(s));
  return weeks;
}

export type Instance = {
  date: DateKey; kind: 'training' | 'rest'; status: 'scheduled' | 'completed' | 'skipped';
  origin: 'template' | 'override'; session: PlanSession | null; revision: number;
};

/** Instancias de la plantilla para un rango de fechas (entrenamiento donde hay sesión ese día de la semana, descanso en el resto). */
export function buildInstances(plan: Plan, from: DateKey, to: DateKey, revision: number): Instance[] {
  const out: Instance[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const s = plan.sessions.find((x) => x.day === weekdayOf(d)) ?? null;
    out.push({ date: d, kind: s ? 'training' : 'rest', status: 'scheduled', origin: 'template', session: s ? structuredClone(s) : null, revision });
  }
  return out;
}

export class ScheduleError extends Error {
  constructor(public code: 'no_session' | 'destination_occupied' | 'completed' | 'same_day' | 'unknown_date', message: string) { super(message); }
}
export type ScheduleOp = { type: 'move' | 'swap' | 'duplicate'; from: DateKey; to: DateKey };

const asOverride = (i: Instance, session: PlanSession | null): Instance => ({ ...i, kind: session ? 'training' : 'rest', session, origin: 'override' });

/**
 * Operación sobre dos fechas (puras: devuelven las dos instancias resultantes, sin mutar). Las sesiones completadas o saltadas
 * son registros: nunca se mueven ni se pisan. Mover/duplicar exigen destino libre; intercambiar, sesión en ambos.
 */
export function applyScheduleOp(a: Instance | undefined, b: Instance | undefined, op: ScheduleOp): [Instance, Instance] {
  if (!a || !b) throw new ScheduleError('unknown_date', 'Esa fecha no está en el calendario');
  if (op.from === op.to) throw new ScheduleError('same_day', 'El origen y el destino son el mismo día');
  if (a.status !== 'scheduled' || b.status !== 'scheduled') throw new ScheduleError('completed', 'Una sesión ya realizada no se puede mover');
  if (!a.session) throw new ScheduleError('no_session', 'No hay sesión en la fecha de origen');
  if (op.type === 'swap') {
    if (!b.session) throw new ScheduleError('no_session', 'Los dos días deben tener sesión para intercambiarlos');
    return [asOverride(a, b.session), asOverride(b, a.session)];
  }
  if (b.session) throw new ScheduleError('destination_occupied', op.type === 'move' ? 'Ese día ya tiene una sesión: usa intercambiar' : 'Ese día ya tiene una sesión; no se pisa');
  const copy = op.type === 'duplicate' ? { ...structuredClone(a.session), name: `${a.session.name} (copia)`.slice(0, 60) } : structuredClone(a.session);
  return [op.type === 'move' ? asOverride(a, null) : a, asOverride(b, copy)];
}
