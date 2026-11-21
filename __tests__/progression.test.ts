import type { PlanSession } from '../src/lib/plan';
import { suggestProgression, variantHistory, type SessionLog, type SetLog, type Target } from '../src/lib/progression';

const T: Target = { sets: 3, repRange: [6, 10] };
const sets = (w: number | undefined, reps: number[], extra: Partial<SetLog> = {}): SetLog[] => reps.map((r) => ({ weightKg: w, reps: r, skipped: false, ...extra }));
const log = (at: number, s: SetLog[]): SessionLog => ({ at, sets: s });

describe('sin base', () => {
  it('sin historial, o con solo series saltadas o vacías, no sugiere nada', () => {
    expect(suggestProgression([], T).kind).toBe('none');
    expect(suggestProgression([log(1, [{ skipped: true }, { skipped: true }])], T).kind).toBe('none');
    expect(suggestProgression([log(1, [{ weightKg: 50, skipped: false }])], T).kind).toBe('none'); // sin repeticiones
  });
});

describe('doble progresión', () => {
  it('rango completado con reserva: sube un escalón y vuelve al mínimo', () => {
    const s = suggestProgression([log(1, sets(60, [10, 10, 10], { rir: 2 }))], T);
    expect(s).toMatchObject({ kind: 'increase', weightKg: 62.5, targetReps: 6, message: 'Sube a 62.5 kg.' });
    expect(s.reason).toMatch(/10 repeticiones con 60 kg.*reserva/);
  });
  it('usa el escalón del equipo y la unidad del perfil', () => {
    const s = suggestProgression([log(1, sets(60, [10, 10, 10]))], T, { stepKg: 2, fmt: (kg) => `${Math.round(kg * 2.2046)} lb` });
    expect(s).toMatchObject({ kind: 'increase', weightKg: 62 });
    expect(s.message).toBe('Sube a 137 lb.');
  });
  it('si no llegó al tope en todas, mantiene el peso y busca el tope', () => {
    const s = suggestProgression([log(1, sets(60, [10, 9, 8]))], T);
    expect(s).toMatchObject({ kind: 'hold', weightKg: 60, targetReps: 6 });
    expect(s.message).toBe('Mantén 60 kg e intenta llegar a 10 repeticiones.');
    expect(s.reason).toMatch(/mejor serie con 60 kg fue de 10/);
  });
  it('usa el peso de trabajo (el mayor) de la última sesión', () => {
    const s = suggestProgression([log(1, [...sets(40, [12]), ...sets(60, [10, 10, 10])])], T);
    expect(s).toMatchObject({ kind: 'increase', weightKg: 62.5 });
  });
  it('con la fatiga de las series se tolera una repetición menos en la última (3 o más series)', () => {
    expect(suggestProgression([log(1, sets(60, [11, 10, 9]))], T)).toMatchObject({ kind: 'increase', weightKg: 62.5 });
    expect(suggestProgression([log(1, sets(60, [10, 9, 8]))], T).kind).toBe('hold');
    expect(suggestProgression([log(1, sets(60, [10, 9]))], { sets: 2, repRange: [6, 10] }).kind).toBe('hold'); // con 2 series no hay tolerancia
  });
  it('solo cuenta la última sesión con datos', () => {
    const s = suggestProgression([log(1, sets(50, [10, 10, 10])), log(2, [{ skipped: true }])], T);
    expect(s).toMatchObject({ kind: 'increase', weightKg: 52.5 });
  });
});

describe('seguridad', () => {
  it('con series saltadas o sin completar repite, aunque las hechas estén en el tope', () => {
    for (const hist of [
      [log(1, [...sets(60, [10, 10]), { weightKg: 60, skipped: true }])],
      [log(1, sets(60, [10, 10]))], // solo 2 de 3
    ]) {
      const s = suggestProgression(hist, T);
      expect(s).toMatchObject({ kind: 'hold', weightKg: 60 });
      expect(s.reason).toMatch(/no completaste todas/);
    }
  });
  it('si alguna serie fue al fallo (RIR 0) consolida en vez de subir', () => {
    const s = suggestProgression([log(1, [...sets(60, [10, 10]), { weightKg: 60, reps: 10, rir: 0, skipped: false }])], T);
    expect(s.kind).toBe('hold');
    expect(s.reason).toMatch(/fallo/);
  });
});

describe('no llegar al mínimo', () => {
  it('una vez: repite; dos veces seguidas con el mismo peso: baja un escalón; con peso distinto: repite', () => {
    const fail = (at: number, w: number) => log(at, sets(w, [6, 5, 4]));
    expect(suggestProgression([fail(1, 60)], T).kind).toBe('hold');
    expect(suggestProgression([fail(1, 60), fail(2, 60)], T)).toMatchObject({ kind: 'reduce', weightKg: 57.5, message: 'Baja a 57.5 kg.' });
    expect(suggestProgression([fail(1, 55), fail(2, 60)], T).kind).toBe('hold');
  });
  it('muy por debajo del rango baja ya, hasta el peso con el que llegarías al mínimo (sin esperar otra sesión)', () => {
    const s = suggestProgression([log(1, sets(70, [3, 2, 1]))], T);
    expect(s).toMatchObject({ kind: 'reduce', weightKg: 62.5 });
    expect(s.reason).toMatch(/muy por debajo de 6/);
  });
  it('nunca sugiere un peso negativo ni bajar a menos de la mitad', () => {
    const fail = (at: number) => log(at, sets(2, [5, 4, 3]));
    const tiny = suggestProgression([fail(1), fail(2)], T); // 2 kg con escalón de 2,5: no hay carga posible más baja
    expect(tiny).toMatchObject({ kind: 'hold', weightKg: 2 });
    expect(tiny.reason).toMatch(/No se puede bajar más/);
    expect(suggestProgression([log(1, sets(100, [1, 1, 1]))], T).weightKg).toBeGreaterThanOrEqual(50);
  });
});

describe('estancamiento', () => {
  it('tres sesiones con el mismo peso sin mejorar → descarga del 10 % redondeada al escalón', () => {
    const s = suggestProgression([log(1, sets(60, [8, 8, 8])), log(2, sets(60, [8, 8, 8])), log(3, sets(60, [8, 7, 7]))], T);
    expect(s).toMatchObject({ kind: 'deload', weightKg: 55 }); // 54 → 55 con escalón 2.5
    expect(s.reason).toMatch(/Tres sesiones/);
  });
  it('si mejora o cambia el peso no es estancamiento', () => {
    expect(suggestProgression([log(1, sets(60, [7, 7, 7])), log(2, sets(60, [8, 7, 7])), log(3, sets(60, [8, 8, 7]))], T).kind).toBe('hold');
    expect(suggestProgression([log(1, sets(55, [8, 8, 8])), log(2, sets(60, [8, 8, 8])), log(3, sets(60, [8, 8, 8]))], T).kind).toBe('hold');
  });
  it('la descarga siempre baja, aunque el 10 % caiga dentro del escalón', () => {
    const s = suggestProgression([log(1, sets(10, [8, 8, 8])), log(2, sets(10, [8, 8, 8])), log(3, sets(10, [8, 8, 8]))], T, { stepKg: 5 });
    expect(s.weightKg).toBeLessThan(10);
  });
});

describe('peso corporal y tiempo', () => {
  it('sin pesos registrados: sin peso sugerido; en el tope propone lastre o variante más difícil', () => {
    const top = suggestProgression([log(1, sets(undefined, [10, 10, 10]))], T);
    expect(top).toMatchObject({ kind: 'increase', targetReps: 6 });
    expect(top.weightKg).toBeUndefined();
    expect(top.message).toMatch(/lastre/);
    const mid = suggestProgression([log(1, sets(0, [8, 7, 7]))], T);
    expect(mid.kind).toBe('hold');
    expect(mid.weightKg).toBeUndefined();
  });
  it('en segundos: sube 5 s al completar el tope; si no, busca el tope', () => {
    const sec: Target = { sets: 3, repRange: [20, 40], unit: 'seconds' };
    expect(suggestProgression([log(1, sets(undefined, [40, 40, 40]))], sec)).toMatchObject({ kind: 'increase', targetReps: 45, message: 'Apunta a 45 s.' });
    expect(suggestProgression([log(1, sets(undefined, [30, 35, 40]))], sec).message).toBe('Intenta llegar a 40 s.');
  });
});

describe('variantHistory', () => {
  const session = (v1: string, v2: string): PlanSession => ({
    day: 0, name: 'D',
    blocks: [{ type: 'single', items: [{ exerciseVariantId: v1, sets: 3, repRange: [6, 10], restSeconds: 90 }] }, { type: 'single', items: [{ exerciseVariantId: v2, sets: 3, repRange: [6, 10], restSeconds: 90 }] }],
  });
  const p = (w: number, r: number, skipped = false) => ({ weightKg: w, reps: r, skipped, corrected: false });
  it('agrupa por variante exacta, en orden cronológico y de serie, y conserva las saltadas', () => {
    const h = variantHistory([
      { at: 200, session: session('bench_press.barbell', 'db_fly.flat'), done: { '0.0.1': p(62, 8), '0.0.0': p(60, 10), '1.0.0': p(20, 12), '0.0.2': { skipped: true, corrected: false } } },
      { at: 100, session: session('db_fly.flat', 'bench_press.barbell'), done: { '1.0.0': p(55, 10) } },
      { at: 300, session: session('squat.x', 'otro.y'), done: { '0.0.0': p(100, 5) } },
    ], 'bench_press.barbell');
    expect(h.map((s) => s.at)).toEqual([100, 200]);
    expect(h[1].sets.map((s) => [s.weightKg, s.reps, s.skipped])).toEqual([[60, 10, false], [62, 8, false], [undefined, undefined, true]]);
  });
  it('cuenta las series por la variante realmente hecha, no por la del plan', () => {
    const h = variantHistory([{ at: 1, session: session('squat.x', 'otro.y'), done: { '0.0.0': p(100, 5), '0.0.1': { ...p(60, 8), variantId: 'leg_press.x' } } }], 'leg_press.x');
    expect(h[0].sets.map((s) => s.weightKg)).toEqual([60]);
    expect(variantHistory([{ at: 1, session: session('squat.x', 'otro.y'), done: { '0.0.1': { ...p(60, 8), variantId: 'leg_press.x' } } }], 'squat.x')).toEqual([]);
  });
  it('sin sesiones de esa variante devuelve vacío y alimenta bien a suggestProgression', () => {
    expect(variantHistory([], 'x.y')).toEqual([]);
    const h = variantHistory([{ at: 1, session: session('bench_press.barbell', 'db_fly.flat'), done: { '0.0.0': p(60, 10), '0.0.1': p(60, 10), '0.0.2': p(60, 10) } }], 'bench_press.barbell');
    expect(suggestProgression(h, T)).toMatchObject({ kind: 'increase', weightKg: 62.5 });
  });
});

describe('dolor y molestia', () => {
  const w = (at: number, pain?: SetLog['pain'], reps = [10, 10, 10]) => log(at, [{ weightKg: 60, reps: reps[0], pain, skipped: false }, ...sets(60, reps.slice(1))]);

  it('una molestia: no sube aunque el rango esté completo; repite el peso', () => {
    const s = suggestProgression([w(1, 'discomfort')], T);
    expect(s).toMatchObject({ kind: 'hold', weightKg: 60 });
    expect(s.message).toBe('Repite 60 kg sin subir.');
    expect(s.reason).toMatch(/molestia/);
  });
  it('molestia dos sesiones seguidas: baja un escalón', () => {
    expect(suggestProgression([w(1, 'discomfort'), w(2, 'discomfort')], T)).toMatchObject({ kind: 'reduce', weightKg: 57.5 });
  });
  it('dolor: baja un escalón y avisa de parar y consultar', () => {
    const s = suggestProgression([w(1, 'pain')], T);
    expect(s).toMatchObject({ kind: 'reduce', weightKg: 57.5 });
    expect(s.reason).toMatch(/dolor.*profesional/);
  });
  it('dolor dos sesiones seguidas: sustituir el ejercicio, sin peso', () => {
    const s = suggestProgression([w(1, 'pain'), w(2, 'pain')], T);
    expect(s.kind).toBe('substitute');
    expect(s.weightKg).toBeUndefined();
    expect(s.message).toBe('Sustituye este ejercicio.');
  });
  it('dolor tras una molestia también sustituye solo si el anterior fue dolor; molestia previa + dolor baja', () => {
    expect(suggestProgression([w(1, 'discomfort'), w(2, 'pain')], T).kind).toBe('reduce');
  });
  it('lo que pasa es lo de la última sesión: tras una sesión sin dolor vuelve la progresión normal', () => {
    expect(suggestProgression([w(1, 'pain'), w(2)], T)).toMatchObject({ kind: 'increase', weightKg: 62.5 });
  });
  it('la peor marca de la sesión manda, y tiene prioridad sobre cualquier otra regla', () => {
    const mixed = log(1, [{ weightKg: 60, reps: 10, pain: 'discomfort', skipped: false }, { weightKg: 60, reps: 10, pain: 'pain', skipped: false }, { weightKg: 60, reps: 10, skipped: false }]);
    expect(suggestProgression([mixed], T).kind).toBe('reduce');
    const incomplete = log(1, [{ weightKg: 60, reps: 10, pain: 'discomfort', skipped: false }, { skipped: true }]);
    expect(suggestProgression([incomplete], T).reason).toMatch(/molestia/);
  });
  it('sin peso (peso corporal) no inventa un peso al reducir', () => {
    const s = suggestProgression([log(1, [{ reps: 10, pain: 'pain', skipped: false }, ...sets(undefined, [10, 10])])], T);
    expect(s).toMatchObject({ kind: 'reduce', message: 'Reduce la dificultad o el rango de movimiento.' });
    expect(s.weightKg).toBeUndefined();
  });
  it('variantHistory conserva la marca de cada serie', () => {
    const sess: PlanSession = { day: 0, name: 'D', blocks: [{ type: 'single', items: [{ exerciseVariantId: 'bench_press.barbell', sets: 2, repRange: [6, 10], restSeconds: 90 }] }] };
    const h = variantHistory([{ at: 1, session: sess, done: { '0.0.0': { weightKg: 60, reps: 8, pain: 'pain', skipped: false, corrected: false }, '0.0.1': { weightKg: 60, reps: 8, skipped: false, corrected: false } } }], 'bench_press.barbell');
    expect(h[0].sets.map((x) => x.pain)).toEqual(['pain', undefined]);
  });
});

describe('verificación con simulaciones (regresión de los límites)', () => {
  // Modelo: la capacidad (1RM) sube `gain` kg por sesión; con el peso w se hacen floor(30·(cap/w − 1)) repeticiones, menos 1 por serie (fatiga).
  const run = (gain: number, start: number, n = 24) => {
    const hist: SessionLog[] = [];
    let w = start;
    const kinds: string[] = [];
    const weights: number[] = [];
    for (let t = 0; t < n; t++) {
      const reps = (i: number) => Math.max(0, Math.min(15, Math.floor(30 * ((80 + gain * t) / w - 1)) - i));
      hist.push({ at: t, sets: [0, 1, 2].map((i) => ({ weightKg: w, reps: reps(i), skipped: false })) });
      const s = suggestProgression(hist, T);
      kinds.push(s.kind); weights.push(w);
      if (s.weightKg !== undefined) w = s.weightKg;
    }
    return { kinds, weights };
  };
  const count = (k: string[], kind: string) => k.filter((x) => x === kind).length;

  it('quien progresa sube la carga a lo largo de las sesiones, con pocas descargas y sin bajadas seguidas', () => {
    const { kinds, weights } = run(0.6, 60);
    expect(weights[weights.length - 1]).toBeGreaterThanOrEqual(65);
    expect(count(kinds, 'deload') + count(kinds, 'reduce')).toBeLessThanOrEqual(3);
    for (let i = 1; i < kinds.length; i++) expect(['reduce', 'deload'].includes(kinds[i]) && ['reduce', 'deload'].includes(kinds[i - 1])).toBe(false);
  });
  it('un principiante que progresa rápido sube casi cada sesión', () => {
    const { kinds, weights } = run(1.5, 40);
    expect(count(kinds, 'increase')).toBeGreaterThanOrEqual(12);
    expect(weights[weights.length - 1]).toBeGreaterThanOrEqual(80);
    expect(count(kinds, 'reduce') + count(kinds, 'deload')).toBe(0);
  });
  it('con un peso demasiado alto converge al rango en pocas sesiones y nunca sugiere pesos absurdos', () => {
    const { weights } = run(0, 70);
    expect(weights.slice(0, 6).some((x) => x <= 65)).toBe(true);
    for (const x of weights) { expect(x).toBeGreaterThan(40); expect(x).toBeLessThanOrEqual(70); }
  });
});
