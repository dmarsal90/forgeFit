import { CATALOG } from '../src/data/equipment';
import { EXERCISES } from '../src/data/exercises';
import { generatePlan, inputFromDrafts, type EngineInput } from '../src/lib/planEngine';
import { variantModality } from '../src/lib/modality';
import { estimateMinutes, validatePlan } from '../src/lib/planValidator';

const FULL_GYM = new Set(CATALOG.filter((i) => !['free_space'].includes(i.id)).map((i) => i.id));
const base = (over: Partial<EngineInput> = {}): EngineInput => ({
  goal: 'muscle', level: 2, days: [0, 1, 2, 3, 4], minutesPerSession: 60, have: FULL_GYM, limitations: { joints: [], muscles: [] }, ...over,
});
const exOf = (variantId: string) => EXERCISES.find((e) => e.id === variantId.split('.')[0])!;
const items = (r: ReturnType<typeof generatePlan>) => (r.status === 'insufficient' ? [] : r.plan.sessions.flatMap((s) => s.blocks.flatMap((b) => b.items)));

it('gimnasio completo, 5 días: división de 5 sesiones, válida y dentro del tiempo', () => {
  const r = generatePlan(base());
  expect(r.status).toBe('ok');
  if (r.status === 'insufficient') return;
  expect(r.plan.sessions.map((s) => s.name)).toEqual(['Empuje', 'Tracción', 'Piernas', 'Tren superior', 'Tren inferior']);
  expect(r.plan.sessions.map((s) => s.day)).toEqual([0, 1, 2, 3, 4]);
  for (const s of r.plan.sessions) expect(estimateMinutes(s)).toBeLessThanOrEqual(60);
  expect(r.validation.ok).toBe(true);
  expect(r.plan.summary).toMatch(/5 sesiones/);
});

it('es determinista: misma entrada, mismo plan', () => {
  expect(generatePlan(base())).toEqual(generatePlan(base()));
});

it('todo lo propuesto pasa el validador independiente y no usa equipo no confirmado', () => {
  for (const input of [base(), base({ level: 1, days: [0, 2, 4] }), base({ level: 3, days: [0, 1, 2, 3, 4, 5], goal: 'strength' }), base({ goal: 'endurance', minutesPerSession: 30 })]) {
    const r = generatePlan(input);
    expect(r.status).toBe('ok');
    if (r.status !== 'insufficient') expect(validatePlan(r.plan, input).ok).toBe(true);
  }
});

it('casa sin equipo: solo ejercicios de peso corporal y avisa de lo que falta', () => {
  const input = base({ have: new Set(), level: 1, days: [0, 2, 4] });
  const r = generatePlan(input);
  expect(r.status).toBe('ok');
  if (r.status === 'insufficient') return;
  expect(items(r).length).toBeGreaterThan(3);
  for (const i of items(r)) expect(exOf(i.exerciseVariantId).variants.some((v) => v.id === i.exerciseVariantId && JSON.stringify(v.requires) === JSON.stringify({ all: [] }))).toBe(true);
  expect(r.plan.warnings?.join(' ')).toMatch(/Sin ejercicio disponible/);
});

it('lesión de codo y de isquiotibiales: ningún ejercicio las carga', () => {
  const r = generatePlan(base({ limitations: { joints: ['elbow'], muscles: ['hamstrings'] } }));
  expect(r.status).toBe('ok');
  for (const i of items(r)) {
    const ex = exOf(i.exerciseVariantId);
    expect(ex.stress).not.toContain('elbow');
    expect(ex.primary).not.toContain('hamstrings');
  }
  if (r.status !== 'insufficient') expect(r.plan.warnings?.join(' ')).toMatch(/molestias/);
});

it('principiante: sesiones cortas y nada de series máximas ni ejercicios avanzados', () => {
  const r = generatePlan(base({ level: 1, days: [0, 2, 4], minutesPerSession: 45 }));
  expect(r.status).toBe('ok');
  if (r.status === 'insufficient') return;
  expect(r.plan.sessions.map((s) => s.name)).toEqual(['Cuerpo completo', 'Cuerpo completo', 'Cuerpo completo']);
  for (const i of items(r)) {
    expect(i.repRange[0]).toBeGreaterThanOrEqual(5);
    expect(exOf(i.exerciseVariantId).level).toBe(1);
  }
});

it('el objetivo cambia la prescripción: fuerza usa menos repeticiones que resistencia', () => {
  const reps = (goal: EngineInput['goal']) => {
    const r = generatePlan(base({ goal }));
    const first = r.status === 'insufficient' ? null : r.plan.sessions[0].blocks[0].items[0];
    return first!.repRange;
  };
  expect(reps('strength')[1]).toBeLessThan(reps('endurance')[0] + 10);
  expect(reps('strength')[0]).toBeLessThan(reps('endurance')[0]);
});

it('con 7 días disponibles no programa más de 6 sesiones y deja descanso', () => {
  const r = generatePlan(base({ days: [0, 1, 2, 3, 4, 5, 6], level: 3 }));
  expect(r.status).toBe('ok');
  if (r.status === 'insufficient') return;
  expect(r.plan.sessions.length).toBeLessThanOrEqual(6);
  expect(r.plan.warnings?.join(' ')).toMatch(/descanso/);
});

it('menos días que sesiones de la división: reparte los días y respeta los disponibles', () => {
  const r = generatePlan(base({ days: [1, 5], level: 2 }));
  expect(r.status).toBe('ok');
  if (r.status === 'insufficient') return;
  expect(r.plan.sessions.map((s) => s.day)).toEqual([1, 5]);
});

it('información insuficiente: sin días, poco tiempo o ningún ejercicio posible', () => {
  expect(generatePlan(base({ days: [] })).status).toBe('insufficient');
  expect(generatePlan(base({ minutesPerSession: 10 })).status).toBe('insufficient');
  const all = EXERCISES.flatMap((e) => e.primary);
  const r = generatePlan(base({ have: new Set(), limitations: { joints: [], muscles: [...new Set(all)] } }));
  expect(r.status).toBe('insufficient');
});

describe('inputFromDrafts', () => {
  const drafts = {
    2: { primaryGoal: 'muscle', secondaryGoals: ['strength'] }, 3: { level: 'advanced' }, 4: { days: [0, 1, 2, 3, 4], minutes: 60 },
    7: { jointLimitations: ['elbow'] },
  };
  it('convierte los borradores en entrada del motor', () => {
    const r = inputFromDrafts(drafts, new Set(['dumbbells_fixed_hex']));
    expect('input' in r && r.input).toMatchObject({ goal: 'muscle', secondaryGoals: ['strength'], level: 3, days: [0, 1, 2, 3, 4], minutesPerSession: 60, limitations: { joints: ['elbow'], muscles: [] } });
  });
  it('dice qué falta si el onboarding está incompleto o inválido', () => {
    const r = inputFromDrafts({ 2: { primaryGoal: 'muscle' }, 4: { days: [], minutes: 60 } }, new Set());
    expect('reasons' in r && r.reasons.join(' ')).toMatch(/Falta completar: Tu experiencia/);
    expect('reasons' in r && r.reasons.join(' ')).toMatch(/Revisa: Tu disponibilidad/);
  });
});

it('con molestias de codo sigue habiendo tracción y press (con aviso), sin curls ni extensiones de tríceps', () => {
  const r = generatePlan(base({ limitations: { joints: ['elbow'], muscles: [] } }));
  expect(r.status).toBe('ok');
  if (r.status === 'insufficient') return;
  const ids = items(r).map((i) => exOf(i.exerciseVariantId).id);
  const patterns = ids.map((id) => EXERCISES.find((e) => e.id === id)!.pattern);
  expect(patterns.some((p) => p.startsWith('pull_'))).toBe(true);
  expect(patterns.some((p) => p.startsWith('push_'))).toBe(true);
  for (const id of ids) expect(['barbell_curl', 'db_curl', 'triceps_pushdown', 'skullcrusher', 'dips']).not.toContain(id);
  const w = (r.plan.warnings ?? []).join(' ');
  expect(w).toMatch(/implican una zona con molestias/);
  expect(w).not.toMatch(/elbow/);
});

describe('objetivos nuevos, secundarios y prioridades', () => {
  const planOf = (over: Partial<EngineInput>) => {
    const r = generatePlan(base(over));
    if (r.status === 'insufficient') throw new Error('insuficiente');
    return r.plan;
  };
  const all = (p: ReturnType<typeof planOf>) => p.sessions.flatMap((s) => s.blocks.flatMap((b) => b.items));
  const compounds = (p: ReturnType<typeof planOf>) => all(p).filter((i) => !['core', 'isolation'].includes(exOf(i.exerciseVariantId).pattern) && !['face_pull'].includes(exOf(i.exerciseVariantId).id));
  const accessories = (p: ReturnType<typeof planOf>) => all(p).filter((i) => exOf(i.exerciseVariantId).pattern === 'isolation');

  it('fuerza e hipertrofia: básicos de 5-8 repeticiones', () => {
    for (const i of compounds(planOf({ goal: 'strength_muscle' }))) expect(i.repRange[1]).toBeLessThanOrEqual(8);
  });

  it('potencia: series cortas y explosivas; a un principiante se le da fuerza con aviso', () => {
    const p = planOf({ goal: 'power', level: 2 });
    for (const i of compounds(p)) expect(i.repRange[1]).toBeLessThanOrEqual(5);
    expect(compounds(p)[0].effortGuidance).toMatch(/velocidad/);
    const novice = planOf({ goal: 'power', level: 1, days: [0, 2, 4] });
    expect(novice.warnings?.join(' ')).toMatch(/potencia requiere experiencia/);
    expect(novice.summary).toMatch(/fuerza/);
    for (const i of all(novice)) expect(i.repRange[0]).toBeGreaterThanOrEqual(5);
  });

  it('el objetivo secundario prescribe los accesorios y se refleja en el resumen', () => {
    const p = planOf({ goal: 'strength', secondaryGoals: ['endurance'] });
    expect(Math.max(...accessories(p).map((i) => i.repRange[1]))).toBeGreaterThanOrEqual(15);
    for (const i of compounds(p)) expect(i.repRange[1]).toBeLessThanOrEqual(8);
    expect(p.summary).toMatch(/también resistencia/);
    expect(Math.max(...accessories(planOf({ goal: 'strength' })).map((i) => i.repRange[1]))).toBeLessThan(15);
  });

  it('músculos prioritarios: más series semanales para ese músculo', () => {
    const sets = (p: ReturnType<typeof planOf>, m: string) => all(p).filter((i) => exOf(i.exerciseVariantId).primary.includes(m)).reduce((n, i) => n + i.sets, 0);
    const plain = planOf({ minutesPerSession: 90 });
    const prio = planOf({ minutesPerSession: 90, priorityMuscles: ['biceps'] });
    expect(sets(prio, 'biceps')).toBeGreaterThan(sets(plain, 'biceps'));
  });

  it('brazo completo y hombro como prioridad (4 músculos): el plan sigue siendo válido y dentro del tiempo', () => {
    const r = generatePlan(base({ minutesPerSession: 60, priorityMuscles: ['biceps', 'triceps', 'forearm', 'deltoid'] }));
    expect(r.status).toBe('ok');
    if (r.status === 'insufficient') return;
    for (const s of r.plan.sessions) expect(estimateMinutes(s)).toBeLessThanOrEqual(60);
  });
});

describe('disponibilidad: división, sueño y pausas', () => {
  const run = (over: Partial<EngineInput>) => {
    const r = generatePlan(base(over));
    if (r.status === 'insufficient') throw new Error('insuficiente');
    return r.plan;
  };
  const names = (p: ReturnType<typeof run>) => p.sessions.map((s) => s.name);

  it('respeta la división pedida cuando los días la admiten', () => {
    expect(names(run({ days: [0, 2, 4], split: 'ppl' }))).toEqual(['Empuje', 'Tracción', 'Piernas']);
    expect(names(run({ days: [0, 1, 3, 4], split: 'full' }))).toEqual(Array(4).fill('Cuerpo completo'));
    expect(names(run({ days: [0, 2, 4], split: 'upper_lower' }))).toEqual(['Tren superior', 'Tren inferior', 'Tren superior']);
  });

  it('si los días no admiten la división, usa la automática y avisa', () => {
    const p = run({ days: [0, 3], split: 'ppl' });
    expect(names(p)).toEqual(['Cuerpo completo', 'Cuerpo completo']);
    expect(p.warnings?.join(' ')).toMatch(/no cabe la división/);
  });

  it('dormir menos de 6 h: máximo 4 sesiones, menos volumen y aviso', () => {
    expect(run({ days: [0, 1, 2, 3, 4, 5], sleep: 'lt6' }).sessions.length).toBeLessThanOrEqual(4);
    const same = { days: [0, 1, 2, 3], split: 'upper_lower' as const, minutesPerSession: 90 };
    const normal = run(same), tired = run({ ...same, sleep: 'lt6' });
    expect(tired.warnings?.join(' ')).toMatch(/Duermes poco/);
    const sets = (p: typeof tired) => p.sessions.reduce((n, s) => n + s.blocks.reduce((m, b) => m + b.items[0].sets, 0), 0);
    expect(sets(tired)).toBeLessThan(sets(normal));
    expect(run({ sleep: '7plus' }).warnings?.join(' ') ?? '').not.toMatch(/Duermes poco/);
  });

  it('las pausas escalan el descanso entre series', () => {
    const rest = (pauses: EngineInput['pauses']) => run({ pauses, minutesPerSession: 90 }).sessions[0].blocks[0].items[0].restSeconds;
    expect(rest('short')).toBeLessThan(rest('normal'));
    expect(rest('long')).toBeGreaterThan(rest('normal'));
  });
});

describe('preferencias: excluidos, preferidos, modalidad, tempo y biseries', () => {
  const run = (over: Partial<EngineInput>) => {
    const r = generatePlan(base(over));
    if (r.status === 'insufficient') throw new Error('insuficiente');
    return r.plan;
  };
  const its = (p: ReturnType<typeof run>) => p.sessions.flatMap((s) => s.blocks.flatMap((b) => b.items));
  const ids = (p: ReturnType<typeof run>) => its(p).map((i) => exOf(i.exerciseVariantId).id);

  it('los ejercicios excluidos nunca aparecen', () => {
    const first = ids(run({}));
    const out = run({ excluded: first.slice(0, 8) });
    for (const id of first.slice(0, 8)) expect(ids(out)).not.toContain(id);
  });

  it('los preferidos se eligen frente a sus alternativas del mismo hueco', () => {
    const slotAlt = EXERCISES.find((e) => e.id === 'barbell_row')!;
    expect(ids(run({ preferred: [slotAlt.id], level: 3 }))).toContain('barbell_row');
    expect(ids(run({ preferred: ['seated_cable_row'], level: 3 }))).toContain('seated_cable_row');
  });

  it('la modalidad inclina la elección de variantes sin vaciar el plan', () => {
    const share = (m: 'free' | 'machines') => {
      const p = run({ modality: m });
      const v = its(p).map((i) => variantModality(exOf(i.exerciseVariantId).variants.find((x) => x.id === i.exerciseVariantId)!));
      return v.filter((x) => x === m).length / v.length;
    };
    expect(share('machines')).toBeGreaterThan(0.4);
    expect(share('free')).toBeGreaterThan(0.4);
  });

  it('el tempo se refleja en la indicación de esfuerzo', () => {
    expect(its(run({ tempo: 'controlled' })).some((i) => /Baja en 3 segundos/.test(i.effortGuidance ?? ''))).toBe(true);
    expect(its(run({ tempo: 'explosive' })).some((i) => /máxima velocidad/.test(i.effortGuidance ?? ''))).toBe(true);
    expect(its(run({})).some((i) => /Baja en 3/.test(i.effortGuidance ?? ''))).toBe(false);
  });

  it('con biseries pedidas junta aislamientos de músculos distintos, y el plan sigue válido', () => {
    const p = run({ supersets: 'yes', minutesPerSession: 90 });
    const sup = p.sessions.flatMap((s) => s.blocks).filter((b) => b.type === 'superset');
    expect(sup.length).toBeGreaterThan(0);
    for (const b of sup) {
      expect(b.items).toHaveLength(2);
      expect(b.items[0].sets).toBe(b.items[1].sets);
      expect(exOf(b.items[0].exerciseVariantId).pattern).toBe('isolation');
    }
    expect(run({}).sessions.flatMap((s) => s.blocks).some((b) => b.type === 'superset')).toBe(false);
    const r = generatePlan(base({ supersets: 'yes', minutesPerSession: 90 }));
    expect(r.status).toBe('ok');
  });

  it('inputFromDrafts lee la etapa de preferencias', () => {
    const r = inputFromDrafts({ 2: { primaryGoal: 'muscle' }, 3: { level: 'advanced' }, 4: { days: [0, 2], minutes: 60 }, 8: { modality: 'free', excluded: ['lunge'] } }, new Set());
    expect('input' in r && r.input).toMatchObject({ modality: 'free', excluded: ['lunge'], preferred: [] });
  });
});

