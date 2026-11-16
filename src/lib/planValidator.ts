import { EXERCISES, type Exercise, type Level, type Variant } from '../data/exercises';
import { meets } from './exercises';
import { planSchema, type Plan, type PlanSession } from './plan';

export type PlanContext = {
  have: ReadonlySet<string>; // ids confirmados como disponibles en el entorno activo
  limitations: { joints: readonly string[]; muscles: readonly string[] };
  days: readonly number[]; // 0 = lunes … 6 = domingo
  minutesPerSession: number;
  level: Level;
};
export type Issue = { severity: 'error' | 'warning'; code: string; path: string; message: string };
export type Validation = { ok: boolean; issues: Issue[] };

const byVariant = new Map<string, { ex: Exercise; variant: Variant }>(
  EXERCISES.flatMap((ex) => ex.variants.map((variant) => [variant.id, { ex, variant }] as const)),
);

const WARMUP_MIN = 5;
const WORK_SECONDS_PER_SET = 40;
// Series semanales efectivas por músculo (principal = 1, secundario = 0,5). Conservador a propósito.
const WEEKLY_SET_LIMIT: Record<Level, number> = { 1: 12, 2: 18, 3: 22 };
const MIN_REPS: Record<Level, number> = { 1: 5, 2: 3, 3: 1 }; // sin repeticiones máximas para quien empieza
const MAX_SETS_PER_EXERCISE = 6;

/** Duración estimada de una sesión en minutos (calentamiento incluido). */
export function estimateMinutes(s: PlanSession): number {
  let seconds = 0;
  for (const b of s.blocks) {
    const rounds = Math.max(...b.items.map((i) => i.sets));
    const rest = Math.max(...b.items.map((i) => i.restSeconds));
    seconds += rounds * (b.items.length * WORK_SECONDS_PER_SET + rest);
  }
  return Math.ceil(seconds / 60) + WARMUP_MIN;
}

/** Validador independiente del generador: acepta `unknown` y nunca lanza. */
export function validatePlan(input: unknown, ctx: PlanContext): Validation {
  const issues: Issue[] = [];
  const add = (severity: Issue['severity'], code: string, path: string, message: string) => issues.push({ severity, code, path, message });

  const parsed = planSchema.safeParse(input);
  if (!parsed.success) {
    for (const i of parsed.error.issues) add('error', 'schema', i.path.join('.') || 'plan', i.message);
    return { ok: false, issues };
  }
  const plan: Plan = parsed.data;

  const seenDays = new Set<number>();
  const weekly = new Map<string, number>();

  plan.sessions.forEach((s, si) => {
    const sp = `sessions.${si}`;
    if (!ctx.days.includes(s.day)) add('error', 'day_unavailable', `${sp}.day`, `El día ${s.day} no está entre tus días disponibles`);
    if (seenDays.has(s.day)) add('error', 'duplicate_day', `${sp}.day`, `Hay dos sesiones el mismo día (${s.day})`);
    seenDays.add(s.day);

    const minutes = estimateMinutes(s);
    if (minutes > ctx.minutesPerSession) add('error', 'session_too_long', sp, `Sesión de ~${minutes} min; tu límite es ${ctx.minutesPerSession}`);

    s.blocks.forEach((b, bi) => b.items.forEach((it, ii) => {
      const ip = `${sp}.blocks.${bi}.items.${ii}`;
      const found = byVariant.get(it.exerciseVariantId);
      if (!found) { add('error', 'unknown_variant', `${ip}.exerciseVariantId`, `Ejercicio inexistente: ${it.exerciseVariantId}`); return; }
      const { ex, variant } = found;

      if (!meets(variant.requires, ctx.have)) add('error', 'equipment_unavailable', ip, `${ex.es} (${variant.es}) necesita equipo que no has confirmado`);

      const jointHit = ex.stress.filter((j) => ctx.limitations.joints.includes(j));
      if (jointHit.length) add('error', 'injury_joint', ip, `${ex.es} carga una articulación con molestias (${jointHit.join(', ')})`);
      const primaryHit = ex.primary.filter((m) => ctx.limitations.muscles.includes(m));
      if (primaryHit.length) add('error', 'injury_muscle', ip, `${ex.es} trabaja un músculo con molestias (${primaryHit.join(', ')})`);
      const secondaryHit = ex.secondary.filter((m) => ctx.limitations.muscles.includes(m));
      if (secondaryHit.length) add('warning', 'injury_secondary', ip, `${ex.es} implica de forma secundaria un músculo con molestias (${secondaryHit.join(', ')})`);

      if (ex.level > ctx.level + 1) add('error', 'level_too_high', ip, `${ex.es} es demasiado avanzado para tu nivel`);
      else if (ex.level > ctx.level) add('warning', 'level_stretch', ip, `${ex.es} está por encima de tu nivel; empieza con poca carga`);

      if (it.sets > MAX_SETS_PER_EXERCISE) add('error', 'too_many_sets', ip, `Demasiadas series de ${ex.es} (${it.sets})`);
      if (it.repRange[0] < MIN_REPS[ctx.level]) add('error', 'reps_too_low', ip, `Rango de repeticiones demasiado bajo para tu nivel (${it.repRange[0]})`);

      for (const m of ex.primary) weekly.set(m, (weekly.get(m) ?? 0) + it.sets);
      for (const m of ex.secondary) weekly.set(m, (weekly.get(m) ?? 0) + it.sets * 0.5);
    }));
  });

  for (const [m, sets] of weekly) {
    if (sets > WEEKLY_SET_LIMIT[ctx.level]) add('error', 'excessive_volume', `volume.${m}`, `Volumen semanal excesivo en ${m} (${sets} series efectivas; máximo ${WEEKLY_SET_LIMIT[ctx.level]})`);
  }

  return { ok: !issues.some((i) => i.severity === 'error'), issues };
}
