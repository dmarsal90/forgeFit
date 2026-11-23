import { diffDays, weekStart, type DateKey } from './schedule';

// Periodización (V9-D): un ciclo es una lista de bloques que cubren semanas 1..N sin huecos, empezando un lunes.
// El modificador es orientativo (escala la carga sugerida); nunca toca el plan ni las sesiones ya programadas.
export type CycleBlock = { weekFrom: number; weekTo: number; goal: string; loadModifier: number };
export const MAX_CYCLE_WEEKS = 52;
export const LOAD_MODIFIER_RANGE = [0.4, 1.2] as const;

/** null si los bloques son válidos; si no, el motivo. */
export function blocksError(blocks: readonly CycleBlock[]): string | null {
  if (!blocks.length) return 'Añade al menos un bloque';
  let next = 1;
  for (const b of blocks) {
    if (!Number.isInteger(b.weekFrom) || !Number.isInteger(b.weekTo) || b.weekTo < b.weekFrom) return 'Semanas no válidas';
    if (b.weekFrom !== next) return 'Los bloques deben cubrir las semanas seguidas, sin huecos ni solapes';
    if (b.loadModifier < LOAD_MODIFIER_RANGE[0] || b.loadModifier > LOAD_MODIFIER_RANGE[1]) return 'Carga fuera de rango';
    next = b.weekTo + 1;
  }
  return next - 1 > MAX_CYCLE_WEEKS ? `Máximo ${MAX_CYCLE_WEEKS} semanas` : null;
}

export type CyclePosition =
  | { state: 'upcoming'; startsIn: number }
  | { state: 'running'; week: number; total: number; block: CycleBlock }
  | { state: 'finished'; total: number };

/** Dónde cae `today` dentro del ciclo (las semanas van de lunes a domingo; `start` se lleva a su lunes). Supone bloques válidos. */
export function cyclePosition(start: DateKey, blocks: readonly CycleBlock[], today: DateKey): CyclePosition {
  const total = blocks[blocks.length - 1].weekTo;
  const week = Math.floor(diffDays(weekStart(start), weekStart(today)) / 7) + 1;
  if (week < 1) return { state: 'upcoming', startsIn: 1 - week };
  const block = blocks.find((b) => week >= b.weekFrom && week <= b.weekTo);
  return block ? { state: 'running', week, total, block } : { state: 'finished', total };
}
