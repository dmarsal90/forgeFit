import { findVariant } from './exercises';
import type { PlanSession } from './plan';
import { toDateKey } from './schedule';
import { variantOf, type Performed } from './workoutMachine';

/** Celda de texto: entrecomillada si hace falta y neutralizada contra fórmulas de hoja de cálculo (=, +, -, @, tab, CR al inicio). */
export function csvText(s: string): string {
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export type ExportableWorkout = { at: number; session: PlanSession; done: Readonly<Record<string, Performed>> };

const HEADER = 'fecha,sesion,ejercicio,variante,serie,peso_kg,repeticiones,rir,molestia';
const PAIN_LABEL = { discomfort: 'molestia', pain: 'dolor' } as const;

/** Una fila por serie realizada (las saltadas no se exportan). El peso va siempre en kg, sin importar la unidad del perfil. */
export function sessionsToCsv(workouts: readonly ExportableWorkout[]): string {
  const rows = [HEADER];
  for (const w of [...workouts].sort((a, b) => a.at - b.at)) {
    const date = toDateKey(new Date(w.at));
    const sets = Object.entries(w.done).filter(([, d]) => !d.skipped).map(([key, d]) => {
      const [b, i, r] = key.split('.').map(Number);
      return { b, i, r, d };
    }).sort((x, y) => x.b - y.b || x.i - y.i || x.r - y.r);
    for (const { b, i, r, d } of sets) {
      const id = variantOf(w.session, w.done, `${b}.${i}.${r}`);
      if (!id) continue;
      const found = findVariant(id);
      rows.push([date, csvText(w.session.name), csvText(found?.ex.es ?? id), csvText(found?.variant.es ?? id), r + 1, d.weightKg ?? '', d.reps ?? '', d.rir ?? '', d.pain ? PAIN_LABEL[d.pain] : ''].join(','));
    }
  }
  return rows.join('\n') + '\n';
}
