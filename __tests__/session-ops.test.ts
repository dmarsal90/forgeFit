import { EXERCISES } from '../src/data/exercises';
import type { PlanSession } from '../src/lib/plan';
import type { PlanContext } from '../src/lib/planValidator';
import { addableExercises, suggestReplacements } from '../src/lib/replacements';
import { applySessionOp, applySessionOps, diffSessions, SessionOpError, type SessionOp } from '../src/lib/sessionOps';

const item = (id: string, sets = 3, repRange: [number, number] = [8, 12], restSeconds = 90) => ({ exerciseVariantId: id, sets, repRange, restSeconds });
const session = (): PlanSession => ({
  day: 1, name: 'Empuje',
  blocks: [
    { type: 'single', items: [item('bench_press.barbell', 4, [6, 10], 120)] },
    { type: 'single', items: [item('db_fly.flat')] },
    { type: 'single', items: [item('triceps_pushdown.cable')] },
  ],
});
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return e instanceof SessionOpError ? e.code : 'other'; } return 'none'; };
const ids = (s: PlanSession) => s.blocks.flatMap((b) => b.items.map((x) => x.exerciseVariantId));

describe('applySessionOp', () => {
  it('rename_session cambia el nombre sin tocar lo demás ni mutar el original', () => {
    const s = session();
    const r = applySessionOp(s, { type: 'rename_session', name: '  Pecho y hombro ' });
    expect(r.name).toBe('Pecho y hombro');
    expect(r.blocks).toEqual(s.blocks);
    expect(s.name).toBe('Empuje');
  });
  it('replace_exercise conserva la prescripción y rechaza ejercicios inexistentes', () => {
    const r = applySessionOp(session(), { type: 'replace_exercise', block: 0, item: 0, variantId: 'incline_bench_press.barbell' });
    expect(r.blocks[0].items[0]).toMatchObject({ exerciseVariantId: 'incline_bench_press.barbell', sets: 4, restSeconds: 120 });
    expect(code(() => applySessionOp(session(), { type: 'replace_exercise', block: 0, item: 0, variantId: 'press_laser.x' }))).toBe('unknown_exercise');
    expect(code(() => applySessionOp(session(), { type: 'replace_exercise', block: 9, item: 0, variantId: 'pushup.floor' }))).toBe('bad_target');
  });
  it('add_exercise añade al final o en una posición, con prescripción por defecto', () => {
    const end = applySessionOp(session(), { type: 'add_exercise', variantId: 'pushup.floor' });
    expect(ids(end).at(-1)).toBe('pushup.floor');
    expect(end.blocks.at(-1)!.items[0]).toMatchObject({ sets: 3, repRange: [8, 12], restSeconds: 90 });
    expect(ids(applySessionOp(session(), { type: 'add_exercise', variantId: 'pushup.floor', at: 1 }))[1]).toBe('pushup.floor');
  });
  it('remove_exercise quita el ejercicio, convierte una biserie en bloque simple y no deja la sesión vacía', () => {
    expect(ids(applySessionOp(session(), { type: 'remove_exercise', block: 1, item: 0 }))).toEqual(['bench_press.barbell', 'triceps_pushdown.cable']);
    const ss = applySessionOps(session(), [{ type: 'group_superset', block: 1 }, { type: 'remove_exercise', block: 1, item: 0 }]);
    expect(ss.blocks[1]).toMatchObject({ type: 'single' });
    const one: PlanSession = { day: 1, name: 'x', blocks: [{ type: 'single', items: [item('pushup.floor')] }] };
    expect(code(() => applySessionOp(one, { type: 'remove_exercise', block: 0, item: 0 }))).toBe('last_exercise');
  });
  it('duplicate_exercise copia el bloque justo debajo sin compartir referencias', () => {
    const r = applySessionOp(session(), { type: 'duplicate_exercise', block: 0 });
    expect(ids(r).slice(0, 2)).toEqual(['bench_press.barbell', 'bench_press.barbell']);
    r.blocks[1].items[0].sets = 9;
    expect(r.blocks[0].items[0].sets).toBe(4);
  });
  it('reorder_exercise mueve un bloque y valida las posiciones', () => {
    expect(ids(applySessionOp(session(), { type: 'reorder_exercise', from: 2, to: 0 }))).toEqual(['triceps_pushdown.cable', 'bench_press.barbell', 'db_fly.flat']);
    expect(code(() => applySessionOp(session(), { type: 'reorder_exercise', from: 0, to: 7 }))).toBe('bad_target');
  });
  it('update_prescription cambia solo lo indicado; RIR y notas se pueden quitar', () => {
    const r = applySessionOp(session(), { type: 'update_prescription', block: 0, item: 0, sets: 5, rir: 2, notes: 'pausa en el pecho' });
    expect(r.blocks[0].items[0]).toMatchObject({ sets: 5, repRange: [6, 10], restSeconds: 120, rir: 2, notes: 'pausa en el pecho' });
    const back = applySessionOp(r, { type: 'update_prescription', block: 0, item: 0, rir: null, notes: null });
    expect(back.blocks[0].items[0]).not.toHaveProperty('rir');
    expect(back.blocks[0].items[0]).not.toHaveProperty('notes');
    expect(code(() => applySessionOp(session(), { type: 'update_prescription', block: 0, item: 0, repRange: [12, 8] }))).toBe('bad_range');
    expect(() => applySessionOp(session(), { type: 'update_prescription', block: 0, item: 0, sets: 99 })).toThrow();
  });
  it('group_superset agrupa dos bloques contiguos y split_superset los separa', () => {
    const g = applySessionOp(session(), { type: 'group_superset', block: 1 });
    expect(g.blocks.map((b) => b.type)).toEqual(['single', 'superset']);
    expect(g.blocks[1].items.map((x) => x.exerciseVariantId)).toEqual(['db_fly.flat', 'triceps_pushdown.cable']);
    expect(code(() => applySessionOp(g, { type: 'group_superset', block: 1 }))).toBe('bad_target');
    expect(code(() => applySessionOp(g, { type: 'group_superset', block: 0 }))).toBe('not_single');
    expect(applySessionOp(g, { type: 'split_superset', block: 1 }).blocks.map((b) => b.type)).toEqual(['single', 'single', 'single']);
    expect(code(() => applySessionOp(session(), { type: 'split_superset', block: 0 }))).toBe('not_superset');
  });
  it('rechaza operaciones mal formadas y applySessionOps no deja nada a medias', () => {
    expect(() => applySessionOp(session(), { type: 'borrar' } as never)).toThrow();
    const s = session();
    const ops: SessionOp[] = [{ type: 'rename_session', name: 'Nuevo' }, { type: 'remove_exercise', block: 9, item: 0 }];
    expect(() => applySessionOps(s, ops)).toThrow();
    expect(s.name).toBe('Empuje');
  });
});

describe('diffSessions', () => {
  const diff = (ops: SessionOp[]) => diffSessions(session(), applySessionOps(session(), ops));
  it('sin cambios no hay líneas', () => expect(diff([])).toEqual([]));
  it('describe renombrar, añadir, quitar, reemplazar y ajustar', () => {
    expect(diff([{ type: 'rename_session', name: 'Pecho' }])).toEqual(['Nombre: «Empuje» → «Pecho»']);
    expect(diff([{ type: 'add_exercise', variantId: 'pushup.floor' }])[0]).toMatch(/^Añadido: Flexiones/);
    expect(diff([{ type: 'remove_exercise', block: 1, item: 0 }])).toEqual(['Quitado: Aperturas con mancuernas']);
    expect(diff([{ type: 'replace_exercise', block: 1, item: 0, variantId: 'pec_deck.machine' }])).toEqual(['Reemplazado: Aperturas con mancuernas → Aperturas en pec deck']);
    expect(diff([{ type: 'update_prescription', block: 0, item: 0, sets: 5 }])[0]).toMatch(/Press de banca plano: 4×6-10, descanso 120 s → 5×6-10, descanso 120 s/);
  });
  it('describe cambios de orden y de biseries', () => {
    expect(diff([{ type: 'reorder_exercise', from: 2, to: 0 }])).toContain('Orden de los ejercicios modificado');
    expect(diff([{ type: 'group_superset', block: 1 }])).toEqual(['Biseries modificadas']);
  });
});

describe('reemplazos y ejercicios añadibles', () => {
  const ctx = (have: string[], limitations = { joints: [] as string[], muscles: [] as string[] }, level: 1 | 2 | 3 = 2): PlanContext => ({
    have: new Set(have), limitations, days: [0, 1, 2], minutesPerSession: 60, level,
  });
  const GYM = ['bench_adjustable', 'dumbbells_fixed_hex', 'pec_deck_fly', 'chest_press_machine_selectorized', 'cable_crossover_dual_adjustable', 'cable_att_handle_single', 'cable_att_rope'];
  it('propone equivalentes (mismo patrón o músculos) solo con el equipo disponible', () => {
    const r = suggestReplacements('pec_deck.machine', ctx(GYM));
    expect(r.length).toBeGreaterThan(0);
    for (const c of r) expect(c.exercise.primary.some((m) => ['pectoral'].includes(m)) || c.exercise.pattern === 'isolation').toBe(true);
    expect(r.map((c) => c.exercise.id)).toEqual(expect.arrayContaining(['cable_crossover', 'db_fly']));
    expect(r.map((c) => c.exercise.id)).not.toContain('pec_deck'); // no se propone a sí mismo
    expect(r.every((c) => c.reason.length > 0)).toBe(true);
  });
  it('sin el equipo no hay reemplazo: sustituir el pec deck sin poleas ni mancuernas no ofrece crossover', () => {
    const r = suggestReplacements('pec_deck.machine', ctx(['pec_deck_fly']));
    expect(r.map((c) => c.exercise.id)).not.toContain('cable_crossover');
    expect(r.map((c) => c.exercise.id)).not.toContain('db_fly');
  });
  it('respeta las molestias declaradas y el nivel, y no repite los de la sesión', () => {
    const shoulder = suggestReplacements('pec_deck.machine', ctx(GYM, { joints: ['shoulder'], muscles: [] }));
    expect(shoulder.every((c) => !c.exercise.stress.includes('shoulder'))).toBe(true);
    const beginner = suggestReplacements('pec_deck.machine', ctx(GYM, undefined, 1));
    expect(beginner.every((c) => c.exercise.level <= 1)).toBe(true);
    const notDup = suggestReplacements('pec_deck.machine', ctx(GYM), ['db_fly.flat']);
    expect(notDup.map((c) => c.exercise.id)).not.toContain('db_fly');
  });
  it('no propone ni deja añadir los ejercicios que la persona excluyó', () => {
    const c = { ...ctx(GYM), excluded: ['db_fly'] };
    expect(suggestReplacements('pec_deck.machine', c).map((x) => x.exercise.id)).not.toContain('db_fly');
    expect(addableExercises(c, { query: 'apertura' }).map((x) => x.exercise.id)).not.toContain('db_fly');
    expect(suggestReplacements('pec_deck.machine', ctx(GYM)).map((x) => x.exercise.id)).toContain('db_fly');
  });
  it('devuelve una lista vacía para un ejercicio desconocido', () => {
    expect(suggestReplacements('nada.x', ctx(GYM))).toEqual([]);
  });
  it('addableExercises filtra por texto sin acentos y por músculo, y solo ofrece lo posible', () => {
    const all = addableExercises(ctx(GYM));
    expect(all.length).toBeGreaterThan(3);
    expect(addableExercises(ctx(GYM), { query: 'APERTURAS' }).map((c) => c.exercise.id)).toEqual(expect.arrayContaining(['pec_deck', 'db_fly']));
    expect(addableExercises(ctx(GYM), { muscle: 'pectoral' }).every((c) => c.exercise.primary.includes('pectoral'))).toBe(true);
    expect(addableExercises(ctx(['pec_deck_fly']), { query: 'sentadilla' }).map((c) => c.exercise.id)).not.toContain('back_squat');
    const known = new Set(EXERCISES.map((e) => e.id));
    expect(all.every((c) => known.has(c.exercise.id))).toBe(true);
  });
});
