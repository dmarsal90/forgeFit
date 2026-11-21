import { z } from 'zod';
import type { PlanSession } from './plan';

// Máquina de la sesión activa (docs/AppFlow.md §5). El estado es una función pura de los eventos y de la sesión
// congelada al empezar: el tiempo sale de marcas y pausas, nunca de contadores, y se recupera al reabrir.

const stepRef = { block: z.number().int().min(0).max(11), item: z.number().int().min(0).max(1), round: z.number().int().min(0).max(9) };
const perf = { weightKg: z.number().min(0).max(1000).optional(), reps: z.number().int().min(0).max(200).optional(), rir: z.number().int().min(0).max(10).optional(), pain: z.enum(['discomfort', 'pain']).optional() };

export const eventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start') }),
  z.object({ type: z.literal('pause') }),
  z.object({ type: z.literal('resume') }),
  z.object({ type: z.literal('rest_end') }),
  z.object({ type: z.literal('finish') }),
  z.object({ type: z.literal('set_done'), ...stepRef, ...perf }),
  z.object({ type: z.literal('skip'), ...stepRef }),
  z.object({ type: z.literal('correct'), ...stepRef, ...perf }),
  z.object({ type: z.literal('warmup'), block: stepRef.block, item: stepRef.item, weightKg: perf.weightKg, reps: perf.reps }), // serie de calentamiento: no es una serie del plan ni cuenta en nada
  z.object({ type: z.literal('substitute'), block: stepRef.block, item: stepRef.item, variantId: z.string().min(1).max(80) }), // «máquina ocupada»: desde ahora este hueco del plan se hace con otra variante
]);
export type WorkoutEvent = z.infer<typeof eventSchema>;
export type Timed = { at: number; event: WorkoutEvent };
export type Step = { block: number; item: number; round: number };
export type Pain = 'discomfort' | 'pain'; // molestia | dolor en esa serie (sin valor = ninguna)
export type Performed = { weightKg?: number; reps?: number; rir?: number; pain?: Pain; variantId?: string; skipped: boolean; corrected: boolean };
export type Warmup = { block: number; item: number; weightKg?: number; reps?: number; variantId?: string };
export type WorkoutState = {
  status: 'pending' | 'active' | 'paused' | 'finished';
  done: Record<string, Performed>;
  current: Step | null; // null cuando ya no quedan series
  rest: { seconds: number; startedAt: number } | null;
  warmups: Warmup[]; // fuera de `done`: ni series completadas, ni volumen, ni progresión
  variants: Record<string, string>; // «bloque.ítem» → variante que sustituye a la del plan (el plan congelado no se toca)
  activeMs: number;
};

export const stepKey = (s: Step) => `${s.block}.${s.item}.${s.round}`;

/** Variante realmente hecha en una serie: la sustituida en sesión si la hubo, si no la del plan. */
export function variantOf(session: PlanSession, done: Readonly<Record<string, Performed>>, key: string): string | undefined {
  const [b, i] = key.split('.').map(Number);
  return done[key]?.variantId ?? session.blocks[b]?.items[i]?.exerciseVariantId;
}

/** Orden de ejecución: por bloque, ronda a ronda; en una biserie alterna A1, A2, A1, A2… */
export function stepsOf(session: PlanSession): Step[] {
  const out: Step[] = [];
  session.blocks.forEach((b, block) => {
    const rounds = Math.max(...b.items.map((i) => i.sets));
    for (let round = 0; round < rounds; round++) b.items.forEach((it, item) => { if (round < it.sets) out.push({ block, item, round }); });
  });
  return out;
}

export function reduce(session: PlanSession, events: Timed[], now: number): WorkoutState {
  const steps = stepsOf(session);
  const st: WorkoutState = { status: 'pending', done: {}, current: steps[0] ?? null, rest: null, warmups: [], variants: {}, activeMs: 0 };
  let since = 0; // inicio del tramo activo en curso
  let pausedAt = 0;
  const advance = () => { st.current = steps.find((s) => !st.done[stepKey(s)]) ?? null; };
  for (const { at, event: e } of events) {
    if (e.type === 'start' && st.status === 'pending') { st.status = 'active'; since = at; }
    else if (e.type === 'pause' && st.status === 'active') { st.activeMs += at - since; pausedAt = at; st.status = 'paused'; }
    else if (e.type === 'resume' && st.status === 'paused') {
      since = at; st.status = 'active';
      if (st.rest) st.rest = { ...st.rest, startedAt: st.rest.startedAt + (at - pausedAt) }; // la pausa no consume descanso
    } else if (e.type === 'rest_end') st.rest = null;
    else if (e.type === 'finish' && (st.status === 'active' || st.status === 'paused')) {
      if (st.status === 'active') st.activeMs += at - since;
      st.status = 'finished'; st.rest = null;
    } else if ((e.type === 'set_done' || e.type === 'skip') && st.status === 'active') {
      const idx = steps.findIndex((s) => stepKey(s) === stepKey(e));
      if (idx < 0 || st.done[stepKey(e)]) continue; // paso inexistente o repetido: se ignora (idempotente)
      st.done[stepKey(e)] = { weightKg: e.type === 'set_done' ? e.weightKg : undefined, reps: e.type === 'set_done' ? e.reps : undefined, rir: e.type === 'set_done' ? e.rir : undefined, pain: e.type === 'set_done' ? e.pain : undefined, variantId: e.type === 'set_done' ? st.variants[`${e.block}.${e.item}`] : undefined, skipped: e.type === 'skip', corrected: false };
      advance();
      const next = steps[idx + 1];
      const endsRound = !next || next.block !== e.block || next.round !== e.round;
      const secs = session.blocks[e.block].items[e.item].restSeconds;
      st.rest = e.type === 'set_done' && endsRound && next && secs > 0 ? { seconds: secs, startedAt: at } : null;
    } else if (e.type === 'correct' && st.done[stepKey(e)]) {
      st.done[stepKey(e)] = { weightKg: e.weightKg, reps: e.reps, rir: e.rir, pain: e.pain, variantId: st.done[stepKey(e)].variantId, skipped: false, corrected: true };
    } else if (e.type === 'warmup' && st.status === 'active' && session.blocks[e.block]?.items[e.item]) st.warmups.push({ block: e.block, item: e.item, weightKg: e.weightKg, reps: e.reps, variantId: st.variants[`${e.block}.${e.item}`] });
    else if (e.type === 'substitute' && st.status === 'active' && session.blocks[e.block]?.items[e.item]) st.variants[`${e.block}.${e.item}`] = e.variantId;
  }
  if (st.status === 'active') st.activeMs += now - since;
  return st;
}
