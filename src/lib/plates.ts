/** Un tamaño de disco con los pares que se tienen (un par = uno a cada lado de la barra). */
export type PlateStock = { kg: number; pairs: number };
export type Montage = { totalKg: number; perSide: { kg: number; count: number }[] }; // de mayor a menor disco
export type PlateResult =
  | ({ status: 'ok' } & Montage)
  | { status: 'impossible'; below: Montage | null; above: Montage | null } // el peso no se puede montar; los más cercanos que sí
  | { status: 'below_bar' } // por debajo del peso de la barra
  | { status: 'unsupported' }; // dato no válido o un total absurdo de discos

export type PlateUnit = 'kg' | 'lb';
/** 1 lb = 0.45359237 kg exactos (definición internacional): los discos en libras no acumulan error de redondeo. */
export const KG_PER_LB = 0.45359237;

// Serie habitual de cada unidad. El tamaño va siempre en kg (como el resto de la app), pero se define en su unidad.
const STANDARD: Record<PlateUnit, number[]> = { kg: [25, 20, 15, 10, 5, 2.5, 1.25], lb: [45, 35, 25, 10, 5, 2.5] };
export const standardPlates = (unit: PlateUnit, pairs = 2): PlateStock[] =>
  STANDARD[unit].map((v) => ({ kg: unit === 'lb' ? Math.round(v * KG_PER_LB * 1e9) / 1e9 : v, pairs }));

// El cálculo se hace en gramos enteros, así que los discos pueden venir en kg, en lb o mezclados (cada uno se convierte a kg una vez).
const GRAM = 1000; // gramos por kg
const TOLERANCE_KG = 0.01; // un objetivo cuenta como alcanzado si el montaje real queda a menos de 10 g
const MAX_GRAMS_PER_SIDE = 2_000_000; // tope de la tabla de cálculo (2 000 kg por lado); más allá se rechaza como no válido
const INF = 30000;

/**
 * Qué discos poner en cada lado de la barra para llegar a `targetKg`. Prefiere el montaje con menos discos y, a igualdad, los más
 * grandes. Si el peso no se puede montar con lo que se tiene, devuelve los dos montajes posibles más cercanos (por debajo y por encima).
 */
export function platesPerSide(targetKg: number, barKg: number, stock: readonly PlateStock[]): PlateResult {
  if (![targetKg, barKg].every((x) => Number.isFinite(x) && x >= 0)) return { status: 'unsupported' };
  const plates = stock.filter((p) => p.kg > 0 && Number.isFinite(p.kg) && Number.isInteger(p.pairs) && p.pairs > 0 && p.kg <= 1000)
    .map((p) => ({ g: Math.max(1, Math.round(p.kg * GRAM)), kg: p.kg, pairs: p.pairs })).sort((a, b) => b.g - a.g);
  if (targetKg + TOLERANCE_KG < barKg) return { status: 'below_bar' };

  const total = plates.reduce((n, p) => n + p.g * p.pairs, 0);
  if (total > MAX_GRAMS_PER_SIDE) return { status: 'unsupported' };
  const wantG = Math.max(0, Math.round(((targetKg - barKg) / 2) * GRAM));

  // dp[a] = menos discos para sumar `a` gramos por lado (cada disco, una pieza 0/1; hasta `pairs` piezas por tamaño).
  const dp = new Int16Array(total + 1).fill(INF);
  dp[0] = 0;
  for (const p of plates) for (let c = 0; c < p.pairs; c++) for (let a = total; a >= p.g; a--) if (dp[a - p.g] + 1 < dp[a]) dp[a] = dp[a - p.g] + 1;

  // Reconstrucción: con ese mínimo de discos, el montaje que usa los más grandes primero.
  const build = (amount: number): Montage => {
    const memo = new Map<string, boolean>();
    const use: number[] = plates.map(() => 0);
    const go = (i: number, rem: number, left: number): boolean => {
      if (rem === 0) return true;
      if (i === plates.length || left === 0) return false;
      const key = `${i}:${rem}:${left}`;
      if (memo.get(key) === false) return false;
      for (let k = Math.min(plates[i].pairs, Math.floor(rem / plates[i].g), left); k >= 0; k--) {
        use[i] = k;
        if (go(i + 1, rem - k * plates[i].g, left - k)) return true;
      }
      use[i] = 0;
      memo.set(key, false);
      return false;
    };
    go(0, amount, dp[amount]);
    const perSide = plates.map((p, i) => ({ kg: p.kg, count: use[i] })).filter((x) => x.count > 0);
    const sideKg = perSide.reduce((n, x) => n + x.kg * x.count, 0);
    return { totalKg: Math.round((barKg + 2 * sideKg) * 1e6) / 1e6, perSide };
  };

  // Montaje más cercano al objetivo (en una ventana de 5 g por lado, por el redondeo a gramos) cuyo peso real cumpla la tolerancia.
  let pick = -1;
  for (let d = 0; d <= 5 && pick < 0; d++) for (const a of d === 0 ? [wantG] : [wantG - d, wantG + d]) {
    if (a >= 0 && a <= total && dp[a] < INF && Math.abs(build(a).totalKg - targetKg) <= TOLERANCE_KG) { pick = a; break; }
  }
  if (pick >= 0) return { status: 'ok', ...build(pick) };

  let lo = Math.min(wantG, total);
  while (lo >= 0 && dp[lo] >= INF) lo--;
  let hi = wantG;
  while (hi <= total && dp[hi] >= INF) hi++;
  return { status: 'impossible', below: lo >= 0 ? build(lo) : null, above: hi <= total ? build(hi) : null };
}
