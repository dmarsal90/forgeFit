import { applyOperation, OperationError } from '../src/lib/planOps';
import type { Plan } from '../src/lib/plan';
import { validatePlan, type PlanContext } from '../src/lib/planValidator';

const sess = (day: number, name: string, ex = 'pushup.floor', sets = 3) => ({
  day, name, blocks: [{ type: 'single' as const, items: [{ exerciseVariantId: ex, sets, repRange: [8, 12] as [number, number], restSeconds: 60 }] }],
});
const plan = (): Plan => ({ schemaVersion: 1, mode: 'local', sessions: [sess(0, 'A'), sess(2, 'B'), sess(4, 'C')] });
const view = (p: Plan) => p.sessions.map((s) => `${s.day}:${s.name}`);
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return e instanceof OperationError ? e.code : 'other'; } return 'none'; };

describe('applyOperation', () => {
  it('move_session mueve a un día libre sin tocar el resto y no muta el original', () => {
    const p = plan();
    expect(view(applyOperation(p, { type: 'move_session', from: 0, to: 1 }))).toEqual(['1:A', '2:B', '4:C']);
    expect(view(p)).toEqual(['0:A', '2:B', '4:C']);
  });
  it('move_session no pisa una sesión: pide intercambiar', () => {
    expect(code(() => applyOperation(plan(), { type: 'move_session', from: 0, to: 2 }))).toBe('destination_occupied');
  });
  it('swap_sessions permuta dos días con sesión (lunes↔miércoles) sin regenerar nada', () => {
    const r = applyOperation(plan(), { type: 'swap_sessions', a: 0, b: 2 });
    expect(view(r)).toEqual(['0:B', '2:A', '4:C']);
    expect(r.sessions[1].blocks).toEqual(plan().sessions[0].blocks);
  });
  it('swap_sessions exige sesión en ambos días y días distintos', () => {
    expect(code(() => applyOperation(plan(), { type: 'swap_sessions', a: 0, b: 1 }))).toBe('no_session');
    expect(code(() => applyOperation(plan(), { type: 'swap_sessions', a: 0, b: 0 }))).toBe('same_day');
  });
  it('duplicate_session copia a un día libre con otro nombre y sin compartir referencias', () => {
    const r = applyOperation(plan(), { type: 'duplicate_session', from: 0, to: 5 });
    expect(view(r)).toEqual(['0:A', '2:B', '4:C', '5:A (copia)']);
    r.sessions[3].blocks[0].items[0].sets = 9;
    expect(r.sessions[0].blocks[0].items[0].sets).toBe(3);
    expect(code(() => applyOperation(plan(), { type: 'duplicate_session', from: 0, to: 2 }))).toBe('destination_occupied');
  });
  it('change_rest_day mueve el descanso: la sesión de ese día ocupa el descanso antiguo', () => {
    expect(view(applyOperation(plan(), { type: 'change_rest_day', rest: 1, newRest: 2 }))).toEqual(['0:A', '1:B', '4:C']);
    expect(code(() => applyOperation(plan(), { type: 'change_rest_day', rest: 0, newRest: 2 }))).toBe('not_a_rest_day');
    expect(code(() => applyOperation(plan(), { type: 'change_rest_day', rest: 1, newRest: 3 }))).toBe('no_session');
  });
  it('rechaza operaciones mal formadas (días fuera de rango o tipo desconocido)', () => {
    expect(() => applyOperation(plan(), { type: 'move_session', from: 0, to: 9 })).toThrow();
    expect(() => applyOperation(plan(), { type: 'delete_everything' } as never)).toThrow();
  });
});

describe('aviso de recuperación del validador', () => {
  const ctx: PlanContext = {
    have: new Set(['dumbbells_fixed_hex', 'bench_adjustable']), limitations: { joints: [], muscles: [] },
    days: [0, 1, 2, 3, 4, 5, 6], minutesPerSession: 90, level: 2,
  };
  const push = (day: number, name: string) => sess(day, name, 'incline_bench_press.db', 4); // principales: pecho y hombro
  const codes = (p: Plan) => validatePlan(p, ctx).issues.map((i) => i.code);
  it('avisa si dos días seguidos cargan los mismos músculos principales', () => {
    const p: Plan = { schemaVersion: 1, mode: 'local', sessions: [push(0, 'Empuje'), push(1, 'Pecho')] };
    expect(codes(p)).toContain('recovery_overlap');
  });
  it('no avisa si hay un día de descanso entre medias o los músculos no se solapan', () => {
    const spaced: Plan = { schemaVersion: 1, mode: 'local', sessions: [push(0, 'Empuje'), push(2, 'Pecho')] };
    expect(codes(spaced)).not.toContain('recovery_overlap');
    const different: Plan = { schemaVersion: 1, mode: 'local', sessions: [push(0, 'Empuje'), sess(1, 'Piernas', 'goblet_squat.db', 4)] };
    expect(codes(different)).not.toContain('recovery_overlap');
  });
  it('es un aviso: el plan sigue siendo válido', () => {
    const p: Plan = { schemaVersion: 1, mode: 'local', sessions: [push(0, 'Empuje'), push(1, 'Pecho')] };
    expect(validatePlan(p, ctx).ok).toBe(true);
  });
});
