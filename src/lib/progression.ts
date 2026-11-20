import type { PlanSession } from './plan';
import type { Performed } from './workoutMachine';

export type SetLog = { weightKg?: number; reps?: number; rir?: number; skipped: boolean };
export type SessionLog = { at: number; sets: SetLog[] };
export type Target = { sets: number; repRange: readonly [number, number]; unit?: 'reps' | 'seconds' };
export type Suggestion = {
  kind: 'none' | 'hold' | 'increase' | 'reduce' | 'deload';
  weightKg?: number; // peso sugerido (kg) si la regla lo cambia o lo repite
  targetReps?: number; // repeticiones (o segundos) a buscar
  message: string;
  reason: string; // por qué, con los datos de la última sesión
};
export type Options = { stepKg?: number; fmt?: (kg: number) => string };

const DEFAULT_STEP_KG = 2.5;
const SECONDS_STEP = 5;
const r2 = (x: number) => Math.round(x * 100) / 100;
const kgText = (kg: number) => `${kg} kg`;
const same = (a: number | undefined, b: number | undefined) => a !== undefined && b !== undefined && Math.abs(a - b) < 0.01;

type Summary = { weight?: number; working: SetLog[]; complete: boolean; total: number };

function summarize(s: SessionLog, t: Target): Summary | null {
  const done = s.sets.filter((x) => !x.skipped && x.reps !== undefined);
  if (!done.length) return null;
  const weights = done.map((x) => x.weightKg ?? 0).filter((w) => w > 0);
  const weight = weights.length ? Math.max(...weights) : undefined; // sin pesos registrados = peso corporal
  const working = weight === undefined ? done : done.filter((x) => same(x.weightKg, weight));
  return { weight, working, complete: done.length >= t.sets && !s.sets.some((x) => x.skipped), total: working.reduce((n, x) => n + (x.reps ?? 0), 0) };
}

/**
 * Qué hacer la próxima vez con un ejercicio, a partir de sus sesiones anteriores (de la más antigua a la más reciente).
 * Reglas, de más a menos prioritaria: sin datos → nada; series saltadas o sin completar → repetir; fallar el mínimo del rango
 * (dos veces seguidas → bajar un escalón); estancamiento (3 sesiones sin mejorar) → descarga del 10 %; rango completo → subir
 * (salvo si alguna serie fue al fallo: repetir); si no, mantener el peso y buscar el tope del rango. Nunca aplica nada solo.
 */
export function suggestProgression(history: readonly SessionLog[], target: Target, opts: Options = {}): Suggestion {
  const step = opts.stepKg && opts.stepKg > 0 ? opts.stepKg : DEFAULT_STEP_KG;
  const fmt = opts.fmt ?? kgText;
  const [min, max] = target.repRange;
  const seconds = target.unit === 'seconds';
  const unitWord = seconds ? 's' : 'repeticiones';

  const sessions = history.map((s) => summarize(s, target)).filter((s): s is Summary => s !== null);
  const last = sessions[sessions.length - 1];
  if (!last) return { kind: 'none', message: 'Aún no hay base para sugerir.', reason: 'Elige una carga con la que te queden 2-3 repeticiones en reserva y regístrala.' };

  const w = last.weight;
  const at = w === undefined ? '' : ` con ${fmt(w)}`;
  const sets = last.working;
  const hold = (message: string, reason: string): Suggestion => ({ kind: 'hold', weightKg: w, targetReps: seconds ? max : min, message, reason });

  if (!last.complete) {
    return hold(w === undefined ? 'Repite el ejercicio completo.' : `Repite ${fmt(w)}.`, 'La última vez no completaste todas las series.');
  }

  if (!seconds && sets.some((x) => (x.reps ?? 0) < min)) {
    const prev = sessions[sessions.length - 2];
    const failedBefore = prev && same(prev.weight, w) && prev.working.some((x) => (x.reps ?? 0) < min);
    if (failedBefore && w !== undefined) {
      const down = r2(Math.max(0, w - step));
      return { kind: 'reduce', weightKg: down, targetReps: min, message: `Baja a ${fmt(down)}.`, reason: `No llegaste a ${min} repeticiones${at} dos sesiones seguidas.` };
    }
    return hold(w === undefined ? `Intenta llegar a ${min} repeticiones.` : `Repite ${fmt(w)} e intenta llegar a ${min} repeticiones.`, `En alguna serie hiciste menos de ${min} repeticiones${at}.`);
  }

  const allTop = sets.every((x) => (x.reps ?? 0) >= max);
  const grind = sets.some((x) => x.rir === 0);

  const trio = sessions.slice(-3);
  if (!allTop && trio.length === 3 && w !== undefined && trio.every((s) => same(s.weight, w)) && trio[2].total <= trio[0].total) {
    const raw = r2(Math.round((w * 0.9) / step) * step);
    const down = raw >= w ? r2(Math.max(0, w - step)) : raw;
    return { kind: 'deload', weightKg: down, targetReps: max, message: `Descarga: ${fmt(down)}.`, reason: `Tres sesiones${at} sin mejorar las repeticiones. Baja un 10 % y vuelve a subir.` };
  }

  if (allTop && !grind) {
    const topText = `${max} ${unitWord}`;
    if (seconds) return { kind: 'increase', targetReps: max + SECONDS_STEP, message: `Apunta a ${max + SECONDS_STEP} s.`, reason: `Hiciste ${topText} en todas las series.` };
    if (w === undefined) return { kind: 'increase', targetReps: min, message: 'Añade lastre o pasa a una variante más difícil.', reason: `Hiciste ${topText} en todas las series.` };
    const up = r2(w + step);
    return { kind: 'increase', weightKg: up, targetReps: min, message: `Sube a ${fmt(up)}.`, reason: `Hiciste ${topText}${at} en todas las series${sets.some((x) => x.rir !== undefined) ? ' y te sobraba reserva' : ''}.` };
  }
  if (allTop) return hold(w === undefined ? 'Repite el ejercicio.' : `Repite ${fmt(w)}.`, 'Completaste el rango pero alguna serie fue al fallo: consolida antes de subir.');

  const best = Math.max(...sets.map((x) => x.reps ?? 0));
  return hold(w === undefined ? `Intenta llegar a ${max} ${unitWord}.` : `Mantén ${fmt(w)} e intenta llegar a ${max} ${unitWord}.`, `Tu mejor serie${at} fue de ${best}; el objetivo es ${max} en todas.`);
}

export type WorkoutLog = { at: number; session: PlanSession; done: Readonly<Record<string, Performed>> };

/** Series anteriores de una variante de ejercicio (cada variante pesa distinto), de la más antigua a la más reciente. */
export function variantHistory(workouts: readonly WorkoutLog[], variantId: string): SessionLog[] {
  const out: SessionLog[] = [];
  for (const w of [...workouts].sort((a, b) => a.at - b.at)) {
    const sets: (SetLog & { r: number })[] = [];
    for (const [key, d] of Object.entries(w.done)) {
      const [b, i, r] = key.split('.').map(Number);
      if (w.session.blocks[b]?.items[i]?.exerciseVariantId === variantId) sets.push({ weightKg: d.weightKg, reps: d.reps, rir: d.rir, skipped: d.skipped, r });
    }
    if (sets.length) out.push({ at: w.at, sets: sets.sort((x, y) => x.r - y.r).map(({ r: _r, ...s }) => s) });
  }
  return out;
}
