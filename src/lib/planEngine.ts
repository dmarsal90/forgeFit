import { EXERCISES, type Exercise, type Level } from '../data/exercises';
import { isEligible } from './alternatives';
import { availableVariants } from './exercises';
import { variantModality, type Modality } from './modality';
import { validateStep, STEPS } from './onboarding';
import type { Plan, PlanItem, PlanSession } from './plan';
import { estimateMinutes, MIN_REPS, validatePlan, type PlanContext, type Validation } from './planValidator';

export type Goal = 'strength' | 'muscle' | 'strength_muscle' | 'power' | 'endurance' | 'general' | 'mobility';
export type EngineInput = PlanContext & { goal: Goal; secondaryGoals?: Goal[]; priorityMuscles?: string[]; split?: SplitPref; sleep?: 'lt6' | '6to7' | '7plus'; pauses?: 'short' | 'normal' | 'long';
  years?: 'lt1' | '1to3' | '3to5' | '5plus'; rirFamiliarity?: 'none' | 'some' | 'good'; disciplines?: string[];
  modality?: 'mixed' | Modality; tempo?: 'normal' | 'controlled' | 'explosive'; supersets?: 'yes' | 'no'; excluded?: string[]; preferred?: string[] };
type SplitPref = 'auto' | 'full' | 'upper_lower' | 'ppl';
export type GenerateResult =
  | { status: 'ok'; plan: Plan; validation: Validation }
  | { status: 'invalid'; plan: Plan; validation: Validation }
  | { status: 'insufficient'; reasons: string[] };

type Slot = { id: string; label: string; match: (e: Exercise) => boolean };
const prim = (e: Exercise, m: string) => e.primary.includes(m);
const iso = (e: Exercise) => e.pattern === 'isolation';
const SLOTS: Record<string, Slot> = {
  squat: { id: 'squat', label: 'sentadilla o prensa', match: (e) => e.pattern === 'squat' && prim(e, 'quadriceps') },
  lunge: { id: 'lunge', label: 'zancada o unilateral', match: (e) => e.pattern === 'lunge' },
  hinge: { id: 'hinge', label: 'bisagra de cadera', match: (e) => e.pattern === 'hinge' && (prim(e, 'hamstrings') || prim(e, 'glutes')) },
  quad_iso: { id: 'quad_iso', label: 'cuádriceps', match: (e) => iso(e) && prim(e, 'quadriceps') },
  ham_iso: { id: 'ham_iso', label: 'isquiotibiales', match: (e) => iso(e) && prim(e, 'hamstrings') },
  glute: { id: 'glute', label: 'glúteos', match: (e) => prim(e, 'glutes') && e.pattern !== 'squat' && e.pattern !== 'lunge' },
  calves: { id: 'calves', label: 'gemelos', match: (e) => prim(e, 'calves') },
  push_h: { id: 'push_h', label: 'empuje horizontal', match: (e) => e.pattern === 'push_horizontal' && prim(e, 'pectoral') },
  push_v: { id: 'push_v', label: 'empuje vertical', match: (e) => e.pattern === 'push_vertical' && prim(e, 'deltoid') },
  pec_iso: { id: 'pec_iso', label: 'pecho (aislamiento)', match: (e) => iso(e) && prim(e, 'pectoral') },
  delt_iso: { id: 'delt_iso', label: 'hombro (aislamiento)', match: (e) => iso(e) && prim(e, 'deltoid') },
  pull_h: { id: 'pull_h', label: 'tracción horizontal', match: (e) => e.pattern === 'pull_horizontal' && prim(e, 'lats_upper_back') },
  pull_v: { id: 'pull_v', label: 'tracción vertical', match: (e) => e.pattern === 'pull_vertical' && prim(e, 'lats_upper_back') },
  rear_trap: { id: 'rear_trap', label: 'espalda alta y deltoides posterior', match: (e) => prim(e, 'trapezius') || (prim(e, 'deltoid') && e.pattern === 'pull_horizontal') },
  biceps: { id: 'biceps', label: 'bíceps', match: (e) => iso(e) && prim(e, 'biceps') },
  triceps: { id: 'triceps', label: 'tríceps', match: (e) => iso(e) && prim(e, 'triceps') },
  core: { id: 'core', label: 'core', match: (e) => e.pattern === 'core' },
};
// Orden = prioridad: si no cabe en el tiempo, se recorta desde el final.
const SESSIONS: Record<string, { name: string; slots: string[] }> = {
  full: { name: 'Cuerpo completo', slots: ['squat', 'push_h', 'pull_h', 'hinge', 'push_v', 'core'] },
  upper: { name: 'Tren superior', slots: ['push_h', 'pull_h', 'push_v', 'pull_v', 'delt_iso', 'biceps', 'triceps'] },
  lower: { name: 'Tren inferior', slots: ['squat', 'hinge', 'lunge', 'ham_iso', 'quad_iso', 'calves', 'core'] },
  push: { name: 'Empuje', slots: ['push_h', 'push_v', 'pec_iso', 'delt_iso', 'triceps', 'triceps'] },
  pull: { name: 'Tracción', slots: ['pull_v', 'pull_h', 'rear_trap', 'biceps', 'biceps', 'core'] },
  legs: { name: 'Piernas', slots: ['squat', 'hinge', 'lunge', 'ham_iso', 'calves', 'glute'] },
};
const SPLITS: Record<number, { beginner: string[]; other: string[] }> = {
  1: { beginner: ['full'], other: ['full'] },
  2: { beginner: ['full', 'full'], other: ['full', 'full'] },
  3: { beginner: ['full', 'full', 'full'], other: ['push', 'pull', 'legs'] },
  4: { beginner: ['upper', 'lower', 'upper', 'lower'], other: ['upper', 'lower', 'upper', 'lower'] },
  5: { beginner: ['upper', 'lower', 'upper', 'lower'], other: ['push', 'pull', 'legs', 'upper', 'lower'] },
  6: { beginner: ['upper', 'lower', 'upper', 'lower'], other: ['push', 'pull', 'legs', 'push', 'pull', 'legs'] },
};
/** Sesiones de la semana según la preferencia; si los días no la admiten, cae a la automática (`honored` = false). */
function pickSplit(k: number, level: Level, pref: SplitPref = 'auto'): { split: string[]; honored: boolean } {
  const auto = SPLITS[Math.min(k, 6)][level === 1 ? 'beginner' : 'other'];
  if (pref === 'auto') return { split: auto, honored: true };
  if (pref === 'full') return { split: Array(k).fill('full'), honored: true };
  if (pref === 'upper_lower') return k < 2 ? { split: auto, honored: false } : { split: Array.from({ length: k }, (_, i) => (i % 2 ? 'lower' : 'upper')), honored: true };
  return k < 3 ? { split: auto, honored: false } : { split: Array.from({ length: k }, (_, i) => ['push', 'pull', 'legs'][i % 3]), honored: true };
}
const REST_FACTOR = { short: 0.75, normal: 1, long: 1.25 };
const GOAL_LABEL: Record<Goal, string> = { strength: 'fuerza', muscle: 'ganar músculo', strength_muscle: 'fuerza e hipertrofia', power: 'potencia', endurance: 'resistencia muscular', general: 'estar en forma', mobility: 'movilidad y salud articular' };
const LEVEL_LABEL: Record<Level, string> = { 1: 'principiante', 2: 'intermedio', 3: 'avanzado' };
const COMPOUND = new Set(['push_horizontal', 'push_vertical', 'pull_horizontal', 'pull_vertical', 'squat', 'hinge', 'lunge']);
const ACCESSORY_PATTERN_OVERRIDE = new Set(['face_pull']); // patrón de tracción, pero carga ligera y repeticiones altas
export const ISOMETRIC = new Set(['plank', 'side_plank', 'wall_sit', 'dead_hang', 'copenhagen_plank']);

/** El objetivo principal manda en los básicos; los accesorios rotan entre los secundarios (si hay). */
function prescribe(ex: Exercise, main: Goal, level: Level, accessoryGoal: Goal = main): Omit<PlanItem, 'exerciseVariantId'> {
  const compound = COMPOUND.has(ex.pattern) && !ACCESSORY_PATTERN_OVERRIDE.has(ex.id);
  const goal = compound ? main : accessoryGoal;
  const L1 = level === 1;
  let sets: number, reps: [number, number], rest: number;
  if (ISOMETRIC.has(ex.id)) { sets = 3; reps = [20, 40]; rest = 45; }
  else if (ex.pattern === 'core') { sets = 3; reps = [10, 15]; rest = 60; }
  else if (goal === 'strength') [sets, reps, rest] = compound ? [L1 ? 3 : 4, L1 ? [5, 8] : [4, 6], 150] : [3, [6, 10], 90];
  else if (goal === 'strength_muscle') [sets, reps, rest] = compound ? [L1 ? 3 : 4, [5, 8], 135] : [3, [8, 12], 80];
  else if (goal === 'power') [sets, reps, rest] = compound ? [4, [3, 5], 150] : [3, [6, 10], 90];
  else if (goal === 'muscle') [sets, reps, rest] = compound ? [L1 ? 3 : 4, [6, 10], 120] : [3, [10, 15], 75];
  else if (goal === 'endurance') [sets, reps, rest] = compound ? [3, [12, 15], 60] : [3, [15, 20], 45];
  else [sets, reps, rest] = compound ? [3, [8, 12], 90] : [L1 ? 2 : 3, [10, 15], 60];
  const min = Math.max(reps[0], MIN_REPS[level]);
  return {
    sets, repRange: [min, Math.max(min, reps[1])], restSeconds: rest,
    effortGuidance: ISOMETRIC.has(ex.id) ? 'Segundos por serie; para antes de perder la técnica'
      : goal === 'power' && compound ? 'Mueve la carga con máxima intención de velocidad; para si la barra se frena, con 2-3 repeticiones en reserva'
      : L1 ? 'Termina cada serie con 3-4 repeticiones en reserva' : 'Deja 2-3 repeticiones en reserva',
  };
}

/** Biseries: junta ejercicios de aislamiento consecutivos que cargan músculos distintos (descansa uno mientras trabaja el otro). */
function pairAccessories(blocks: PlanSession['blocks']) {
  const isoBlock = (b: PlanSession['blocks'][number]) => b.type === 'single' && exOf(b.items[0].exerciseVariantId)?.pattern === 'isolation';
  for (let i = 0; i < blocks.length - 1; i++) {
    const [a, b] = [blocks[i], blocks[i + 1]];
    if (!isoBlock(a) || !isoBlock(b)) continue;
    const shared = exOf(a.items[0].exerciseVariantId)!.primary.some((m) => exOf(b.items[0].exerciseVariantId)!.primary.includes(m));
    if (shared) continue;
    const sets = Math.min(a.items[0].sets, b.items[0].sets);
    blocks.splice(i, 2, { type: 'superset', items: [{ ...a.items[0], sets }, { ...b.items[0], sets }] });
  }
}

/** Elige `k` días repartidos de forma uniforme entre los disponibles (descansos neutros entre medias). */
function spreadDays(days: readonly number[], k: number): number[] {
  const d = [...new Set(days)].sort((a, b) => a - b);
  if (k >= d.length) return d;
  return Array.from({ length: k }, (_, i) => d[Math.round((i * (d.length - 1)) / (k - 1 || 1))]);
}

const order = new Map(EXERCISES.map((e, i) => [e.id, i]));

export function generatePlan(raw: EngineInput): GenerateResult {
  // Con menos de un año de práctica no se programa nivel avanzado, diga lo que diga la autovaloración.
  const capped = raw.years === 'lt1' && raw.level === 3;
  const input: EngineInput = capped ? { ...raw, level: 2 } : raw;
  const reasons: string[] = [];
  if (!input.days.length) reasons.push('No has indicado días de entrenamiento.');
  if (input.minutesPerSession < 20) reasons.push('El tiempo por sesión es demasiado corto para un plan útil (mínimo 20 minutos).');
  if (reasons.length) return { status: 'insufficient', reasons };

  const { level, have, limitations } = input;
  const priority = input.priorityMuscles ?? [];
  const warnings: string[] = capped ? ['Con menos de un año entrenando se programó nivel intermedio, no avanzado.'] : [];
  // Potencia exige base técnica: a quien empieza se le da fuerza.
  const asked = (g: Goal): Goal => (g === 'power' && level === 1 ? 'strength' : g);
  const goal = asked(input.goal);
  if (goal !== input.goal) warnings.push('La potencia requiere experiencia previa; se programó fuerza hasta que subas de nivel.');
  const secondary = (input.secondaryGoals ?? []).map(asked).filter((g) => g !== goal);
  let accessories = 0;
  const excluded = new Set(input.excluded ?? []);
  const disc = input.disciplines ?? [];
  // Las disciplinas orientan, no mandan: la modalidad y los preferidos explícitos tienen prioridad.
  const preferred = new Set([...(input.preferred ?? []), ...(disc.includes('powerlifting') ? ['back_squat', 'bench_press', 'deadlift'] : [])]);
  const modality = input.modality ?? (disc.includes('calisthenics') ? 'calisthenics' : undefined);
  const wantsModality = modality && modality !== 'mixed' ? modality : null;
  const hasModality = (e: Exercise) => (wantsModality && availableVariants(e, have).some((v) => variantModality(v) === wantsModality) ? 1 : 0);
  const eligible = EXERCISES.filter((e) => isEligible(e, { ...input, excluded: [...excluded] }));
  if (eligible.length < 4) {
    return { status: 'insufficient', reasons: ['Con tu equipo confirmado y tus precauciones hay muy pocos ejercicios posibles. Marca más equipo o revisa las precauciones.'] };
  }

  const sleepy = input.sleep === 'lt6';
  const k = Math.min(input.days.length, level === 1 ? 4 : 6, sleepy ? 4 : 6);
  const { split, honored } = pickSplit(k, level, input.split);
  if (!honored) warnings.push('Con tus días disponibles no cabe la división que pediste; se usó la automática.');
  if (sleepy) warnings.push('Duermes poco: se limitó a 4 sesiones por semana y se redujo el volumen de accesorios. Dormir más mejora la recuperación y la ganancia muscular.');
  const days = spreadDays(input.days, split.length);
  const usedInWeek = new Map<string, number>();
  const hitsPriority = (e: Exercise) => e.primary.filter((m) => priority.includes(m)).length;
  const involvedCount = (e: Exercise) => (e.involves ?? []).filter((j) => limitations.joints.includes(j)).length;
  const missing = new Set<string>();
  const substituted = new Set<string>();

  const sessions: PlanSession[] = split.map((key, i) => {
    const tpl = SESSIONS[key];
    const usedHere = new Set<string>();
    const blocks: PlanSession['blocks'] = [];
    for (const slotId of tpl.slots) {
      const slot = SLOTS[slotId];
      // Sin ejercicio exacto para el hueco, se usa el equivalente más cercano (mismo patrón y músculo) antes que dejarlo vacío.
      const exact = eligible.filter((e) => slot.match(e) && !usedHere.has(e.id));
      const refs = exact.length ? [] : EXERCISES.filter(slot.match);
      const near = refs.length ? eligible.filter((e) => !usedHere.has(e.id) && refs.some((r) => r.pattern === e.pattern && r.primary.some((m) => e.primary.includes(m)))) : [];
      const pick = (exact.length ? exact : near)
        .sort((a, b) => involvedCount(a) - involvedCount(b) || Number(preferred.has(b.id)) - Number(preferred.has(a.id)) || hasModality(b) - hasModality(a) || hitsPriority(b) - hitsPriority(a) || (usedInWeek.get(a.id) ?? 0) - (usedInWeek.get(b.id) ?? 0)
          || Math.abs(a.level - level) - Math.abs(b.level - level) || order.get(a.id)! - order.get(b.id)!)[0];
      if (!pick) { missing.add(slot.label); continue; }
      if (!exact.length) substituted.add(slot.label);
      usedHere.add(pick.id);
      usedInWeek.set(pick.id, (usedInWeek.get(pick.id) ?? 0) + 1);
      const options = availableVariants(pick, have);
      const variant = options.find((v) => variantModality(v) === wantsModality) ?? options[0];
      const accessory = !COMPOUND.has(pick.pattern) || ACCESSORY_PATTERN_OVERRIDE.has(pick.id);
      const item = { exerciseVariantId: variant.id, ...prescribe(pick, goal, level, accessory && secondary.length ? secondary[accessories++ % secondary.length] : goal) };
      if (sleepy && accessory && item.sets > 2) item.sets -= 1;
      if (input.rirFamiliarity && input.rirFamiliarity !== 'none' && !ISOMETRIC.has(pick.id)) {
        item.rir = level === 1 ? 3 : 2;
        if (input.rirFamiliarity === 'good') item.effortGuidance = `RIR ${item.rir}: deja ${item.rir} repeticiones en reserva`;
      }
      if (input.tempo === 'controlled' && !ISOMETRIC.has(pick.id)) item.effortGuidance = `Baja en 3 segundos y sube con control. ${item.effortGuidance ?? ''}`.trim().slice(0, 200);
      if (input.tempo === 'explosive' && !ISOMETRIC.has(pick.id)) item.effortGuidance = `Sube con la máxima velocidad y baja controlado. ${item.effortGuidance ?? ''}`.trim().slice(0, 200);
      item.restSeconds = Math.min(600, Math.round((item.restSeconds * REST_FACTOR[input.pauses ?? 'normal']) / 5) * 5);
      if (hitsPriority(pick) && item.sets < 5) item.sets += 1; // el recorte de tiempo y de volumen semanal lo reajusta si no cabe
      blocks.push({ type: 'single', items: [item] });
    }
    return { day: days[i], name: tpl.name, blocks };
  });

  // Ajuste de tiempo: primero se quitan los ejercicios de menor prioridad, luego series (mínimo 2).
  for (const s of sessions) {
    while (estimateMinutes(s) > input.minutesPerSession && s.blocks.length > 3) s.blocks.pop();
    while (estimateMinutes(s) > input.minutesPerSession) {
      const last = [...s.blocks].reverse().find((b) => b.items[0].sets > 2);
      if (!last) break;
      last.items[0].sets -= 1;
    }
  }

  const build = (): Plan => ({
    schemaVersion: 1, mode: 'local', sessions,
    summary: `${sessions.length} sesiones por semana de hasta ${input.minutesPerSession} min. Objetivo: ${GOAL_LABEL[goal]}${secondary.length ? ` (también ${secondary.map((g) => GOAL_LABEL[g]).join(' y ')})` : ''}. Nivel: ${LEVEL_LABEL[level]}.`.slice(0, 500),
    rationale: sessions.map((s) => `${s.name}: ${s.blocks.map((b) => b.items.map((i) => exName(i.exerciseVariantId)).join(' + ')).join(', ')}.`).join(' ').slice(0, 1000),
  });

  // Recorte de volumen semanal si el validador lo marca (nunca por encima del límite).
  let validation = validatePlan(build(), input);
  for (let n = 0; n < 30 && !validation.ok; n++) {
    const hot = validation.issues.filter((x) => x.code === 'excessive_volume').map((x) => x.path.split('.')[1]);
    if (!hot.length) break;
    const hits = (b: PlanSession['blocks'][number]) => exOf(b.items[0].exerciseVariantId)?.primary.some((m) => hot.includes(m));
    let changed = false;
    for (const s of sessions) for (const b of s.blocks) if (hits(b) && b.items[0].sets > 2) { b.items[0].sets -= 1; changed = true; }
    if (!changed) {
      // Series ya al mínimo: se quita el ejercicio de menor prioridad que cargue ese músculo (mín. 3 por sesión).
      const s = [...sessions].filter((x) => x.blocks.some(hits) && x.blocks.length > 3).sort((a, b) => b.blocks.length - a.blocks.length)[0];
      if (!s) break;
      const idx = s.blocks.map(hits).lastIndexOf(true);
      s.blocks.splice(idx, 1);
    }
    validation = validatePlan(build(), input);
  }

  if (input.supersets === 'yes') {
    for (const s of sessions) pairAccessories(s.blocks);
    validation = validatePlan(build(), input);
  }

  if (substituted.size) warnings.push(`Sin ejercicio exacto para: ${[...substituted].join(', ')}. Se usó el equivalente más cercano con tu equipo.`);
  if (missing.size) warnings.push(`Sin ejercicio disponible para: ${[...missing].join(', ')}. Se omitió con tu equipo y precauciones actuales.`);
  if (limitations.joints.length || limitations.muscles.length) warnings.push('Se evitaron ejercicios que cargan las zonas con molestias que indicaste. Esto no sustituye el consejo de un profesional.');
  if (input.days.length > 6 || (level === 1 && input.days.length > 4)) warnings.push('Se dejó al menos un día de descanso; no hace falta entrenar todos los días disponibles.');
  const involved = [...new Set(sessions.flatMap((s) => s.blocks.flatMap((b) => b.items.map((i) => exOf(i.exerciseVariantId))))
    .filter((e): e is Exercise => !!e && involvedCount(e) > 0).map((e) => e.es))];
  if (involved.length) warnings.push(`Estos ejercicios implican una zona con molestias (${involved.join(', ')}). Empieza con poca carga y sustitúyelos si molestan.`);
  warnings.push(...validation.issues.filter((i) => i.severity === 'warning' && i.code !== 'injury_involved').map((i) => i.message));
  const plan: Plan = { ...build(), warnings: warnings.slice(0, 20).map((w) => w.slice(0, 300)) };
  const final = validatePlan(plan, input);
  return { status: final.ok ? 'ok' : 'invalid', plan, validation: final };
}

const exOf = (variantId: string) => EXERCISES.find((e) => e.id === variantId.split('.')[0]);
const exName = (variantId: string) => exOf(variantId)?.es ?? variantId;

const LEVELS: Record<string, Level> = { beginner: 1, intermediate: 2, advanced: 3 };

/** Convierte los borradores del onboarding en la entrada del motor; si falta algo, dice qué. */
export function inputFromDrafts(drafts: Record<number, unknown>, have: ReadonlySet<string>): { input: EngineInput } | { reasons: string[] } {
  const reasons: string[] = [];
  const get = (n: number) => {
    if (drafts[n] === undefined) { reasons.push(`Falta completar: ${STEPS[n].title}.`); return null; }
    const r = validateStep(n, drafts[n] as never);
    if (!r.data) { reasons.push(`Revisa: ${STEPS[n].title}.`); return null; }
    return r.data as Record<string, unknown>;
  };
  const goals = get(2), exp = get(3), avail = get(4);
  const pref = drafts[8] !== undefined ? validateStep(8, drafts[8] as never).data ?? {} : {};
  const lim = drafts[7] !== undefined ? validateStep(7, drafts[7] as never).data ?? {} : {};
  if (reasons.length || !goals || !exp || !avail) return { reasons };
  return {
    input: {
      goal: goals.primaryGoal as Goal, secondaryGoals: (goals.secondaryGoals as Goal[]) ?? [], priorityMuscles: (goals.priorityMuscles as string[]) ?? [],
      years: exp.years as EngineInput['years'], rirFamiliarity: exp.rirFamiliarity as EngineInput['rirFamiliarity'], disciplines: (exp.disciplines as string[]) ?? [],
      split: avail.split as SplitPref | undefined, sleep: avail.sleep as EngineInput['sleep'], pauses: avail.pauses as EngineInput['pauses'],
      modality: pref.modality as EngineInput['modality'], tempo: pref.tempo as EngineInput['tempo'], supersets: pref.supersets as EngineInput['supersets'],
      excluded: (pref.excluded as string[]) ?? [], preferred: (pref.preferred as string[]) ?? [],
      level: LEVELS[exp.level as string] ?? 1, days: avail.days as number[], minutesPerSession: avail.minutes as number,
      have, limitations: { joints: (lim.jointLimitations as string[]) ?? [], muscles: (lim.muscleLimitations as string[]) ?? [] },
    },
  };
}
