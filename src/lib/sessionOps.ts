import { z } from 'zod';
import { findVariant } from './exercises';
import type { PlanBlock, PlanItem, PlanSession } from './plan';

// Operaciones sobre UNA sesión (V8-C). Las usan el editor manual y, más adelante, los parches del AI Coach.
// Direccionan por posición: `block` = índice de bloque y `item` = ejercicio dentro del bloque (0 o 1 en biseries).
const idx = z.number().int().min(0).max(30);
const reps = z.tuple([z.number().int().min(1).max(100), z.number().int().min(1).max(100)]);
export const sessionOpSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('rename_session'), name: z.string().trim().min(1).max(60) }),
  z.object({ type: z.literal('replace_exercise'), block: idx, item: idx, variantId: z.string().min(1) }),
  z.object({ type: z.literal('add_exercise'), variantId: z.string().min(1), at: idx.optional() }),
  z.object({ type: z.literal('remove_exercise'), block: idx, item: idx }),
  z.object({ type: z.literal('duplicate_exercise'), block: idx }),
  z.object({ type: z.literal('reorder_exercise'), from: idx, to: idx }),
  z.object({
    type: z.literal('update_prescription'), block: idx, item: idx,
    sets: z.number().int().min(1).max(10).optional(), repRange: reps.optional(), restSeconds: z.number().int().min(0).max(600).optional(),
    rir: z.number().int().min(0).max(5).nullable().optional(), notes: z.string().max(200).nullable().optional(),
  }),
  z.object({ type: z.literal('group_superset'), block: idx }),
  z.object({ type: z.literal('split_superset'), block: idx }),
]);
export type SessionOp = z.infer<typeof sessionOpSchema>;

export class SessionOpError extends Error {
  constructor(public code: 'bad_target' | 'unknown_exercise' | 'last_exercise' | 'not_single' | 'not_superset' | 'bad_range', message: string) { super(message); }
}

/** Prescripción por defecto de un ejercicio añadido a mano (conservadora; se ajusta después). */
export const DEFAULT_PRESCRIPTION = { sets: 3, repRange: [8, 12] as [number, number], restSeconds: 90 };
const clone = (s: PlanSession): PlanSession => structuredClone(s);
const target = (s: PlanSession, block: number, item: number) => {
  const it = s.blocks[block]?.items[item];
  if (!it) throw new SessionOpError('bad_target', 'Ese ejercicio no existe en la sesión');
  return it;
};

/** Devuelve una sesión nueva (no muta). Lanza `SessionOpError` si la operación no es aplicable. */
export function applySessionOp(session: PlanSession, input: SessionOp): PlanSession {
  const op = sessionOpSchema.parse(input);
  const out = clone(session);
  switch (op.type) {
    case 'rename_session':
      out.name = op.name;
      return out;
    case 'replace_exercise': {
      const it = target(out, op.block, op.item);
      if (!findVariant(op.variantId)) throw new SessionOpError('unknown_exercise', `Ejercicio inexistente: ${op.variantId}`);
      it.exerciseVariantId = op.variantId;
      return out;
    }
    case 'add_exercise': {
      if (!findVariant(op.variantId)) throw new SessionOpError('unknown_exercise', `Ejercicio inexistente: ${op.variantId}`);
      const at = Math.min(op.at ?? out.blocks.length, out.blocks.length);
      out.blocks.splice(at, 0, { type: 'single', items: [{ exerciseVariantId: op.variantId, ...structuredClone(DEFAULT_PRESCRIPTION) }] });
      return out;
    }
    case 'remove_exercise': {
      target(out, op.block, op.item);
      const total = out.blocks.reduce((n, b) => n + b.items.length, 0);
      if (total <= 1) throw new SessionOpError('last_exercise', 'Una sesión necesita al menos un ejercicio');
      const b = out.blocks[op.block];
      b.items.splice(op.item, 1);
      if (b.items.length === 0) out.blocks.splice(op.block, 1);
      else b.type = 'single'; // una biserie con un solo ejercicio vuelve a ser un bloque simple
      return out;
    }
    case 'duplicate_exercise': {
      const b = out.blocks[op.block];
      if (!b) throw new SessionOpError('bad_target', 'Ese bloque no existe');
      out.blocks.splice(op.block + 1, 0, structuredClone(b));
      return out;
    }
    case 'reorder_exercise': {
      if (!out.blocks[op.from] || op.to >= out.blocks.length) throw new SessionOpError('bad_target', 'Posición fuera de la sesión');
      const [moved] = out.blocks.splice(op.from, 1);
      out.blocks.splice(op.to, 0, moved);
      return out;
    }
    case 'update_prescription': {
      const it = target(out, op.block, op.item);
      if (op.repRange && op.repRange[0] > op.repRange[1]) throw new SessionOpError('bad_range', 'El mínimo de repeticiones no puede superar al máximo');
      if (op.sets !== undefined) it.sets = op.sets;
      if (op.repRange) it.repRange = op.repRange;
      if (op.restSeconds !== undefined) it.restSeconds = op.restSeconds;
      if (op.rir !== undefined) { if (op.rir === null) delete it.rir; else it.rir = op.rir; }
      if (op.notes !== undefined) { if (op.notes === null || op.notes.trim() === '') delete it.notes; else it.notes = op.notes; }
      return out;
    }
    case 'group_superset': {
      const [a, b] = [out.blocks[op.block], out.blocks[op.block + 1]];
      if (!a || !b) throw new SessionOpError('bad_target', 'No hay un ejercicio siguiente con el que agrupar');
      if (a.type !== 'single' || b.type !== 'single') throw new SessionOpError('not_single', 'Solo se pueden agrupar dos ejercicios sueltos');
      out.blocks.splice(op.block, 2, { type: 'superset', items: [a.items[0], b.items[0]] } as PlanBlock);
      return out;
    }
    case 'split_superset': {
      const b = out.blocks[op.block];
      if (!b || b.type !== 'superset') throw new SessionOpError('not_superset', 'Ese bloque no es una biserie');
      out.blocks.splice(op.block, 1, ...b.items.map((it): PlanBlock => ({ type: 'single', items: [it] })));
      return out;
    }
  }
}

/** Aplica varias operaciones en orden; si una falla, falla todo (nada a medias). */
export const applySessionOps = (session: PlanSession, ops: SessionOp[]): PlanSession => ops.reduce(applySessionOp, session);

const name = (it: PlanItem) => {
  const f = findVariant(it.exerciseVariantId);
  return f ? f.ex.es : it.exerciseVariantId;
};
const rx = (it: PlanItem) => `${it.sets}×${it.repRange[0]}-${it.repRange[1]}, descanso ${it.restSeconds} s${it.rir !== undefined ? `, RIR ${it.rir}` : ''}`;

/** Resumen legible de lo que cambia entre dos versiones de una sesión (para el paso «Revisar cambios»). */
export function diffSessions(before: PlanSession, after: PlanSession): string[] {
  const lines: string[] = [];
  if (before.name !== after.name) lines.push(`Nombre: «${before.name}» → «${after.name}»`);
  const flat = (s: PlanSession) => s.blocks.flatMap((b, bi) => b.items.map((it) => ({ it, ss: b.type === 'superset', bi })));
  const [fb, fa] = [flat(before), flat(after)];
  const idsA = fa.map((x) => x.it.exerciseVariantId);
  const idsB = fb.map((x) => x.it.exerciseVariantId);
  const left = [...idsA];
  const removed: typeof fb = [];
  for (const x of fb) { const i = left.indexOf(x.it.exerciseVariantId); if (i === -1) removed.push(x); else left.splice(i, 1); }
  const pool = [...idsB];
  const added: typeof fa = [];
  for (const x of fa) { const i = pool.indexOf(x.it.exerciseVariantId); if (i === -1) added.push(x); else pool.splice(i, 1); }
  if (removed.length === 1 && added.length === 1) lines.push(`Reemplazado: ${name(removed[0].it)} → ${name(added[0].it)}`);
  else { for (const x of removed) lines.push(`Quitado: ${name(x.it)}`); for (const x of added) lines.push(`Añadido: ${name(x.it)} (${rx(x.it)})`); }
  for (const x of fa) {
    const old = fb.find((y) => y.it.exerciseVariantId === x.it.exerciseVariantId);
    if (old && JSON.stringify([old.it.sets, old.it.repRange, old.it.restSeconds, old.it.rir, old.it.notes]) !== JSON.stringify([x.it.sets, x.it.repRange, x.it.restSeconds, x.it.rir, x.it.notes])) {
      lines.push(`${name(x.it)}: ${rx(old.it)} → ${rx(x.it)}${old.it.notes !== x.it.notes ? ' (notas)' : ''}`);
    }
  }
  const common = idsA.filter((id) => idsB.includes(id));
  if (JSON.stringify(common) !== JSON.stringify(idsB.filter((id) => idsA.includes(id)))) lines.push('Orden de los ejercicios modificado');
  const ssB = fb.filter((x) => x.ss).map((x) => x.it.exerciseVariantId).join('+');
  const ssA = fa.filter((x) => x.ss).map((x) => x.it.exerciseVariantId).join('+');
  if (ssB !== ssA) lines.push(ssA ? 'Biseries modificadas' : 'Biseries separadas');
  return lines;
}
