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

/** Carga de la fase: `kg` por el modificador, llevada a una carga posible (barra + múltiplos del escalón) y nunca por debajo de la barra. */
export function phaseWeight(kg: number, modifier: number, stepKg: number, barKg = 0): number {
  const w = barKg + Math.round((kg * modifier - barKg) / stepKg) * stepKg;
  return Math.round(Math.max(w, barKg) * 100) / 100;
}

export const CYCLE_TEMPLATES: { key: string; name: string; blocks: CycleBlock[] }[] = [
  { key: 'hipertrofia', name: 'Hipertrofia (8 semanas)', blocks: [
    { weekFrom: 1, weekTo: 3, goal: 'Volumen progresivo', loadModifier: 1 }, { weekFrom: 4, weekTo: 6, goal: 'Mayor intensidad', loadModifier: 1.05 },
    { weekFrom: 7, weekTo: 7, goal: 'Pico de carga', loadModifier: 1.1 }, { weekFrom: 8, weekTo: 8, goal: 'Descarga', loadModifier: 0.6 }] },
  { key: 'fuerza', name: 'Fuerza (6 semanas)', blocks: [
    { weekFrom: 1, weekTo: 2, goal: 'Base', loadModifier: 1 }, { weekFrom: 3, weekTo: 4, goal: 'Mayor intensidad', loadModifier: 1.05 },
    { weekFrom: 5, weekTo: 5, goal: 'Pico de carga', loadModifier: 1.1 }, { weekFrom: 6, weekTo: 6, goal: 'Descarga', loadModifier: 0.6 }] },
];

/** «Carga −40 %», «Carga +5 %» o «Carga normal». */
export const loadLabel = (m: number): string => { const p = Math.round((m - 1) * 100); return p === 0 ? 'Carga normal' : `Carga ${p > 0 ? '+' : '−'}${Math.abs(p)} %`; };
