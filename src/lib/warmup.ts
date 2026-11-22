export type WarmupSet = { weightKg: number; reps: number };

/** Rampa de calentamiento hacia el peso de trabajo: ~50 % × 5 y ~70 % × 3, redondeada a una carga que se pueda montar. */
export function warmupSets(targetKg: number, opts: { barKg?: number; stepKg: number }): WarmupSet[] {
  const { barKg = 0, stepKg } = opts;
  if (!(targetKg > barKg) || !(stepKg > 0)) return []; // con solo la barra (o menos) no hay nada que calentar
  const snap = (kg: number) => Math.max(barKg, barKg + Math.round((kg - barKg) / stepKg) * stepKg);
  const out: WarmupSet[] = [];
  for (const [pct, reps] of [[0.5, 5], [0.7, 3]] as const) {
    const w = Number(snap(targetKg * pct).toFixed(4));
    if (w < targetKg && w !== out[out.length - 1]?.weightKg) out.push({ weightKg: w, reps });
  }
  return out;
}
