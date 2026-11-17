import { z } from 'zod';
import type { Plan } from './plan';

// Operaciones sobre la plantilla semanal (V8). Mismo vocabulario para el editor manual y los parches de IA:
// nada se aplica sin pasar por `applyOperation` (puro) y por el validador. Un día sin sesión es un descanso.
const day = z.number().int().min(0).max(6);
export const operationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('move_session'), from: day, to: day }), // destino libre
  z.object({ type: z.literal('swap_sessions'), a: day, b: day }), // ambos días con sesión
  z.object({ type: z.literal('duplicate_session'), from: day, to: day }), // copia a un día libre
  z.object({ type: z.literal('change_rest_day'), rest: day, newRest: day }), // el descanso pasa a otro día; la sesión de ese día ocupa el antiguo
]);
export type Operation = z.infer<typeof operationSchema>;

export class OperationError extends Error {
  constructor(public code: 'no_session' | 'destination_occupied' | 'not_a_rest_day' | 'same_day', message: string) { super(message); }
}

const at = (plan: Plan, d: number) => plan.sessions.find((s) => s.day === d);
const sorted = (plan: Plan, sessions: Plan['sessions']): Plan => ({ ...plan, sessions: [...sessions].sort((x, y) => x.day - y.day) });

/** Devuelve un plan nuevo (no muta). Lanza `OperationError` si la operación no es aplicable. */
export function applyOperation(plan: Plan, input: Operation): Plan {
  const op = operationSchema.parse(input);
  switch (op.type) {
    case 'move_session': {
      if (op.from === op.to) throw new OperationError('same_day', 'El origen y el destino son el mismo día');
      if (!at(plan, op.from)) throw new OperationError('no_session', `No hay sesión el día ${op.from}`);
      if (at(plan, op.to)) throw new OperationError('destination_occupied', 'Ese día ya tiene una sesión: usa intercambiar');
      return sorted(plan, plan.sessions.map((s) => (s.day === op.from ? { ...s, day: op.to } : s)));
    }
    case 'swap_sessions': {
      if (op.a === op.b) throw new OperationError('same_day', 'Elige dos días distintos');
      if (!at(plan, op.a) || !at(plan, op.b)) throw new OperationError('no_session', 'Los dos días deben tener sesión para intercambiarlos');
      return sorted(plan, plan.sessions.map((s) => (s.day === op.a ? { ...s, day: op.b } : s.day === op.b ? { ...s, day: op.a } : s)));
    }
    case 'duplicate_session': {
      const src = at(plan, op.from);
      if (!src) throw new OperationError('no_session', `No hay sesión el día ${op.from}`);
      if (at(plan, op.to)) throw new OperationError('destination_occupied', 'Ese día ya tiene una sesión; no se pisa');
      return sorted(plan, [...plan.sessions, { ...structuredClone(src), day: op.to, name: `${src.name} (copia)`.slice(0, 60) }]);
    }
    case 'change_rest_day': {
      if (op.rest === op.newRest) throw new OperationError('same_day', 'Elige otro día para descansar');
      if (at(plan, op.rest)) throw new OperationError('not_a_rest_day', 'Ese día no es de descanso');
      if (!at(plan, op.newRest)) throw new OperationError('no_session', 'El nuevo día de descanso no tiene sesión que mover');
      return applyOperation(plan, { type: 'move_session', from: op.newRest, to: op.rest });
    }
  }
}
