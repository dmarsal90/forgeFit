import { estimateMinutes, validatePlan, type PlanContext } from '../src/lib/planValidator';
import type { Plan } from '../src/lib/plan';

const GYM = new Set([
  'bench_adjustable', 'dumbbells_fixed_hex', 'barbell_olympic_20', 'plates_olympic_iron', 'rack_power_cage_4post',
  'cable_single_high', 'cable_att_rope', 'leg_curl_seated', 'pullup_bar_multigrip',
]);
const ctx = (over: Partial<PlanContext> = {}): PlanContext => ({
  have: GYM, limitations: { joints: [], muscles: [] }, days: [0, 2, 4], minutesPerSession: 60, level: 2, ...over,
});
const item = (id: string, sets = 3, repRange: [number, number] = [8, 12], restSeconds = 90) => ({ exerciseVariantId: id, sets, repRange, restSeconds });
const plan = (blocks: Plan['sessions'][number]['blocks'], day = 0): Plan => ({
  schemaVersion: 1, mode: 'local', sessions: [{ day, name: 'Sesión', blocks }],
});
const single = (id: string, sets?: number, rr?: [number, number], rest?: number) => ({ type: 'single' as const, items: [item(id, sets, rr, rest)] });
const codes = (v: ReturnType<typeof validatePlan>) => v.issues.map((i) => `${i.severity}:${i.code}`);

it('un plan correcto pasa sin errores', () => {
  const v = validatePlan(plan([single('bench_press.barbell'), single('db_bench_press.db'), single('db_row.standing')]), ctx());
  expect(v).toEqual({ ok: true, issues: [] });
});

it('un id inventado (IA) se rechaza', () => {
  const v = validatePlan(plan([single('press_cuantico.laser')]), ctx());
  expect(codes(v)).toContain('error:unknown_variant');
  expect(v.ok).toBe(false);
});

it('equipo no confirmado: la prensa sin máquina y el press con barra sin rack se rechazan', () => {
  expect(codes(validatePlan(plan([single('leg_press.machine')]), ctx()))).toContain('error:equipment_unavailable');
  const noRack = new Set(['bench_flat_fixed', 'barbell_olympic_20', 'plates_olympic_iron']);
  expect(codes(validatePlan(plan([single('bench_press.barbell')]), ctx({ have: noRack })))).toContain('error:equipment_unavailable');
});

it('lesión de codo: rechaza lo que carga el codo; músculo con molestias en primario es error y en secundario aviso', () => {
  const elbow = ctx({ limitations: { joints: ['elbow'], muscles: [] } });
  expect(codes(validatePlan(plan([single('triceps_pushdown.cable')]), elbow))).toContain('error:injury_joint');

  const hamstring = ctx({ limitations: { joints: [], muscles: ['hamstrings'] } });
  expect(codes(validatePlan(plan([single('leg_curl.machine')]), hamstring))).toContain('error:injury_muscle');

  const triceps = ctx({ limitations: { joints: [], muscles: ['triceps'] } });
  const v = validatePlan(plan([single('db_bench_press.db')]), triceps); // tríceps es secundario del press
  expect(codes(v)).toContain('warning:injury_secondary');
  expect(v.ok).toBe(true);
});

it('día no disponible y día duplicado', () => {
  expect(codes(validatePlan(plan([single('pushup.floor')], 5), ctx()))).toContain('error:day_unavailable');
  const dup: Plan = { schemaVersion: 1, mode: 'local', sessions: [
    { day: 0, name: 'A', blocks: [single('pushup.floor')] }, { day: 0, name: 'B', blocks: [single('plank.floor')] },
  ] };
  expect(codes(validatePlan(dup, ctx()))).toContain('error:duplicate_day');
});

it('sesión demasiado larga para el tiempo disponible', () => {
  const long = plan(Array.from({ length: 8 }, () => single('db_bench_press.db', 5, [8, 12], 120)));
  expect(estimateMinutes(long.sessions[0])).toBeGreaterThan(60);
  expect(codes(validatePlan(long, ctx()))).toContain('error:session_too_long');
  expect(codes(validatePlan(long, ctx({ minutesPerSession: 180 })))).not.toContain('error:session_too_long');
});

it('una biserie cuenta el trabajo de ambos ejercicios en cada ronda', () => {
  const s = (t: 'single' | 'superset', n: number): Plan['sessions'][number] => ({
    day: 0, name: 'x', blocks: [{ type: t, items: Array.from({ length: n }, () => item('pushup.floor', 3, [8, 12], 60)) }],
  });
  expect(estimateMinutes(s('superset', 2))).toBeGreaterThan(estimateMinutes(s('single', 1)));
});

it('volumen semanal excesivo', () => {
  const heavy: Plan = { schemaVersion: 1, mode: 'local', sessions: [0, 2, 4].map((day) => ({
    day, name: `D${day}`, blocks: [single('db_bench_press.db', 6), single('chest_press_machine.machine', 6)],
  })) };
  const machine = new Set([...GYM, 'chest_press_machine_selectorized']);
  expect(codes(validatePlan(heavy, ctx({ have: machine })))).toContain('error:excessive_volume');
});

it('seguridad: sin series máximas para principiantes, límite de series y nivel del ejercicio', () => {
  const beginner = ctx({ level: 1 });
  expect(codes(validatePlan(plan([single('db_bench_press.db', 3, [1, 3])]), beginner))).toContain('error:reps_too_low');
  expect(codes(validatePlan(plan([single('db_bench_press.db', 8)]), ctx()))).toContain('error:too_many_sets');
  expect(codes(validatePlan(plan([single('back_squat.barbell')]), beginner))).toContain('error:level_too_high');
  expect(codes(validatePlan(plan([single('bench_press.barbell')]), beginner))).toContain('warning:level_stretch');
});

it('entradas malformadas no lanzan: se informan como errores de esquema', () => {
  for (const bad of [null, 'plan', {}, { schemaVersion: 2 }, { schemaVersion: 1, mode: 'local', sessions: [{ day: 9, name: 'x', blocks: [] }] }]) {
    const v = validatePlan(bad, ctx());
    expect(v.ok).toBe(false);
    expect(v.issues[0].code).toBe('schema');
  }
  const stringSets = plan([{ type: 'single', items: [{ ...item('pushup.floor'), sets: '3' as unknown as number }] }]);
  expect(codes(validatePlan(stringSets, ctx()))).toContain('error:schema');
  const inverted = plan([single('pushup.floor', 3, [12, 8])]);
  expect(codes(validatePlan(inverted, ctx()))).toContain('error:schema');
});
