import type { PlanSession } from './plan';
import { variantOf, type Pain, type Performed } from './workoutMachine';

export type SetLog = { weightKg?: number; reps?: number; rir?: number; pain?: Pain; skipped: boolean };
export type SessionLog = { at: number; sets: SetLog[] };
export type Target = { sets: number; repRange: readonly [number, number]; unit?: 'reps' | 'seconds' };
export type Suggestion = {
  kind: 'none' | 'hold' | 'increase' | 'reduce' | 'deload' | 'substitute';
  weightKg?: number; // peso sugerido (kg) si la regla lo cambia o lo repite
  targetReps?: number; // repeticiones (o segundos) a buscar
  message: string;
  reason: string; // por qué, con los datos de la última sesión
};
export type Options = { stepKg?: number; barKg?: number; fmt?: (kg: number) => string }; // barKg: peso de la barra (las cargas posibles son barra + múltiplos del escalón)

const DEFAULT_STEP_KG = 2.5;
const SECONDS_STEP = 5;
const r2 = (x: number) => Math.round(x * 100) / 100;
const kgText = (kg: number) => `${kg} kg`;
/** Peso con el que, según su 1RM estimado (Epley), harías `reps` repeticiones, redondeado al escalón. */
const weightForReps = (w: number, reps: number, target: number, step: number) => r2(Math.round((w * (1 + reps / 30)) / (1 + target / 30) / step) * step);
const same = (a: number | undefined, b: number | undefined) => a !== undefined && b !== undefined && Math.abs(a - b) < 0.01;

type Summary = { weight?: number; working: SetLog[]; complete: boolean; total: number; pain?: Pain };

function summarize(s: SessionLog, t: Target): Summary | null {
  const done = s.sets.filter((x) => !x.skipped && x.reps !== undefined);
  if (!done.length) return null;
  const weights = done.map((x) => x.weightKg ?? 0).filter((w) => w > 0);
  const weight = weights.length ? Math.max(...weights) : undefined; // sin pesos registrados = peso corporal
  const working = weight === undefined ? done : done.filter((x) => same(x.weightKg, weight));
  const pain: Pain | undefined = done.some((x) => x.pain === 'pain') ? 'pain' : done.some((x) => x.pain === 'discomfort') ? 'discomfort' : undefined; // la peor de la sesión
  return { weight, working, complete: done.length >= t.sets && !s.sets.some((x) => x.skipped), total: working.reduce((n, x) => n + (x.reps ?? 0), 0), pain };
}

/**
 * Qué hacer la próxima vez con un ejercicio, a partir de sus sesiones anteriores (de la más antigua a la más reciente).
 * Reglas, de más a menos prioritaria: sin datos → nada; dolor o molestia (nunca se sube; dolor dos sesiones seguidas →
 * sustituir el ejercicio); series saltadas o sin completar → repetir; fallar el mínimo del rango
 * (dos veces seguidas → bajar un escalón); estancamiento (3 sesiones sin mejorar) → descarga del 10 %; rango completo → subir
 * (salvo si alguna serie fue al fallo: repetir); si no, mantener el peso y buscar el tope del rango. Nunca aplica nada solo.
 */
export function suggestProgression(history: readonly SessionLog[], target: Target, opts: Options = {}): Suggestion {
  const step = opts.stepKg && opts.stepKg > 0 ? opts.stepKg : DEFAULT_STEP_KG;
  const fmt = opts.fmt ?? kgText;
  const bar = opts.barKg !== undefined && opts.barKg >= 0 ? opts.barKg : undefined;
  const snap = (x: number) => r2((bar ?? 0) + Math.round((x - (bar ?? 0)) / step) * step); // a una carga posible: barra (o 0) + múltiplos del escalón
  /** Carga más baja que `w` cerca de `target`, posible con el equipo y nunca por debajo de la barra; null si no se puede bajar. */
  const lower = (w: number, target: number): number | null => {
    const floor = bar ?? 0;
    let x = snap(Math.max(w / 2, Math.min(target, w - step), floor));
    if (x < w / 2) x = r2((bar ?? 0) + Math.ceil((w / 2 - (bar ?? 0)) / step) * step); // el ajuste a la rejilla no baja de la mitad
    if (x >= w) x = r2(w - step);
    return x >= floor && x < w ? x : null;
  };
  const cannotLower = (w: number): Suggestion => ({ kind: 'hold', weightKg: w, targetReps: min, message: `Repite ${fmt(w)}.`, reason: 'No se puede bajar más con este equipo (ya estás con la carga mínima).' });
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

  const prev = sessions[sessions.length - 2];
  if (last.pain) {
    if (last.pain === 'pain' && prev?.pain === 'pain') {
      return { kind: 'substitute', message: 'Sustituye este ejercicio.', reason: 'Marcaste dolor en dos sesiones seguidas con este ejercicio. Prueba una alternativa que no cargue esa zona.' };
    }
    if (last.pain === 'pain' || prev?.pain) {
      const down = w === undefined ? undefined : lower(w, w - step);
      if (w !== undefined && down === null) return cannotLower(w);
      const why = last.pain === 'pain' ? 'Marcaste dolor' : 'Marcaste molestia dos sesiones seguidas';
      return { kind: 'reduce', weightKg: down ?? undefined, targetReps: min, message: down === undefined || down === null ? 'Reduce la dificultad o el rango de movimiento.' : `Baja a ${fmt(down)}.`, reason: `${why}${at}. Para si continúa y consulta a un profesional si persiste.` };
    }
    return hold(w === undefined ? 'Repite el ejercicio sin forzar.' : `Repite ${fmt(w)} sin subir.`, `Marcaste molestia${at}: no se sube la carga hasta que desaparezca.`);
  }

  if (!last.complete) {
    return hold(w === undefined ? 'Repite el ejercicio completo.' : `Repite ${fmt(w)}.`, 'La última vez no completaste todas las series.');
  }

  if (!seconds && sets.some((x) => (x.reps ?? 0) < min)) {
    const best = Math.max(...sets.map((x) => x.reps ?? 0));
    const failedBefore = prev && same(prev.weight, w) && prev.working.some((x) => (x.reps ?? 0) < min);
    const far = best < min - 2; // muy por debajo del rango: no hace falta esperar otra sesión
    if ((failedBefore || far) && w !== undefined) {
      // Baja al peso con el que alcanzarías el mínimo del rango (nunca menos de un escalón ni más de la mitad).
      const target = weightForReps(w, Math.max(best, 1), min + 1, step);
      const down = lower(w, target);
      if (down === null) return cannotLower(w);
      return { kind: 'reduce', weightKg: down, targetReps: min, message: `Baja a ${fmt(down)}.`, reason: `${far ? `Tu mejor serie${at} fue de ${best}, muy por debajo de ${min}` : `No llegaste a ${min} repeticiones${at} dos sesiones seguidas`}.` };
    }
    return hold(w === undefined ? `Intenta llegar a ${min} repeticiones.` : `Repite ${fmt(w)} e intenta llegar a ${min} repeticiones.`, `En alguna serie hiciste menos de ${min} repeticiones${at}.`);
  }

  // Con la fatiga la última serie rara vez iguala a la primera: con 3 o más series se tolera una repetición menos en la última.
  const allTop = sets.every((x, i) => (x.reps ?? 0) >= (i === sets.length - 1 && sets.length >= 3 ? max - 1 : max));
  const grind = sets.some((x) => x.rir === 0);

  const trio = sessions.slice(-3);
  if (!allTop && trio.length === 3 && w !== undefined && trio.every((s) => same(s.weight, w)) && trio[2].total <= trio[0].total) {
    const down = lower(w, w * 0.9);
    if (down === null) return cannotLower(w);
    return { kind: 'deload', weightKg: down, targetReps: max, message: `Descarga: ${fmt(down)}.`, reason: `Tres sesiones${at} sin mejorar las repeticiones. Baja un 10 % y vuelve a subir.` };
  }

  if (allTop && !grind) {
    const topText = `${max} ${unitWord}`;
    if (seconds) return { kind: 'increase', targetReps: max + SECONDS_STEP, message: `Apunta a ${max + SECONDS_STEP} s.`, reason: `Hiciste ${topText} en todas las series.` };
    if (w === undefined) return { kind: 'increase', targetReps: min, message: 'Añade lastre o pasa a una variante más difícil.', reason: `Hiciste ${topText} en todas las series.` };
    // Con barra conocida, la siguiente carga posible por encima de la actual; si no, la actual más un escalón.
    const up = bar !== undefined ? r2(bar + (Math.floor((w - bar) / step + 1e-9) + 1) * step) : r2(w + step);
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
      const r = Number(key.split('.')[2]);
      if (variantOf(w.session, w.done, key) === variantId) sets.push({ weightKg: d.weightKg, reps: d.reps, rir: d.rir, pain: d.pain, skipped: d.skipped, r });
    }
    if (sets.length) out.push({ at: w.at, sets: sets.sort((x, y) => x.r - y.r).map(({ r: _r, ...s }) => s) });
  }
  return out;
}
