import { findVariant } from './exercises';
import { LIMITATION_LABEL } from './onboarding';
import type { Plan, PlanSession } from './plan';
import { weekdayOf, type Instance } from './schedule';

/** Alto de cada fila del planificador (fila + separación): la posición del dedo decide el día de destino. */
export const ROW = 72;

/** Día sobre el que se suelta: la fila de origen desplazada por el arrastre vertical, acotada a lunes–domingo. */
export function dropDay(startDay: number, translationY: number, rowHeight = ROW): number {
  return Math.max(0, Math.min(6, startDay + Math.round(translationY / rowHeight)));
}

/** Foco muscular de una sesión: los 3 músculos principales con más series. */
export function focusOf(session: PlanSession): string[] {
  const sets = new Map<string, number>();
  for (const it of session.blocks.flatMap((b) => b.items)) {
    for (const m of findVariant(it.exerciseVariantId)?.ex.primary ?? []) sets.set(m, (sets.get(m) ?? 0) + it.sets);
  }
  return [...sets].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m]) => {
    const l = LIMITATION_LABEL[m] ?? m;
    return l.charAt(0).toUpperCase() + l.slice(1);
  });
}

export type ActionKind = 'move' | 'swap' | 'duplicate';

/** Días válidos como destino para cada acción: mover y duplicar a un día libre, intercambiar con otra sesión. */
export function targetsFor(plan: Plan, from: number, kind: ActionKind): number[] {
  const occupied = new Set(plan.sessions.map((s) => s.day));
  return [0, 1, 2, 3, 4, 5, 6].filter((d) => d !== from && (kind === 'swap' ? occupied.has(d) : !occupied.has(d)));
}

/** Qué ocurre al soltar la sesión de `from` sobre `to`: nada, mover (día libre) o intercambiar (día con sesión). */
export function dropAction(plan: Plan, from: number, to: number): 'none' | 'move' | 'swap' {
  if (from === to) return 'none';
  return plan.sessions.some((s) => s.day === to) ? 'swap' : 'move';
}

/** Las sesiones de una semana de instancias, expresadas por día de la semana (0 = lunes) para reutilizar la lógica del planificador. */
export function weekSessions(rows: Instance[]): Plan {
  return {
    schemaVersion: 1, mode: 'local',
    sessions: rows.filter((r) => r.session).map((r) => ({ ...(r.session as PlanSession), day: weekdayOf(r.date) })),
  };
}
