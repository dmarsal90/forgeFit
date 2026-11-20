import { migrate } from '../src/db';
import { saveActivePlan } from '../src/db/plans';
import { createProfile } from '../src/db/profiles';
import { ensureHorizon } from '../src/db/schedule';
import { exportSessionsCsv } from '../src/db/stats';
import { finishWorkout, recordEvent, startWorkout } from '../src/db/workouts';
import { csvText, sessionsToCsv } from '../src/lib/csv';
import type { Plan, PlanSession } from '../src/lib/plan';
import { memoryDb } from '../test-utils/sqlite';

const session = (name = 'Empuje'): PlanSession => ({
  day: 0, name,
  blocks: [{ type: 'single', items: [{ exerciseVariantId: 'bench_press.barbell', sets: 3, repRange: [6, 10], restSeconds: 90 }] }],
});
const done = (weightKg: number | undefined, reps: number | undefined, extra = {}) => ({ weightKg, reps, skipped: false, corrected: false, ...extra });
const AT = new Date(2026, 10, 18, 10, 0).getTime(); // 2026-11-18 hora local

describe('csvText', () => {
  it('entrecomilla comas, comillas y saltos de línea', () => {
    expect(csvText('a,b')).toBe('"a,b"');
    expect(csvText('di "hola"')).toBe('"di ""hola"""');
    expect(csvText('a\nb')).toBe('"a\nb"');
    expect(csvText('normal')).toBe('normal');
  });
  it('neutraliza fórmulas de hoja de cálculo al inicio', () => {
    for (const s of ['=1+1', '+SUMA(A1)', '-2+3', '@cmd', '\tx', '\rx']) expect(csvText(s).replace(/^"/, '')).toMatch(/^'/);
    expect(csvText('=HYPERLINK("http://x","y")')).toBe(`"'=HYPERLINK(""http://x"",""y"")"`);
    expect(csvText('a=b')).toBe('a=b'); // solo importa el primer carácter
  });
});

describe('sessionsToCsv', () => {
  it('una fila por serie hecha, ordenada por fecha y por serie; las saltadas no salen; el peso va en kg', () => {
    const csv = sessionsToCsv([
      { at: AT + 86_400_000, session: session(), done: { '0.0.0': done(70, 8) } },
      { at: AT, session: session('=Pecho,día'), done: { '0.0.1': done(62.5, 8, { rir: 2, pain: 'pain' }), '0.0.0': done(60, 10), '0.0.2': { skipped: true, corrected: false } } },
    ]);
    expect(csv.split('\n')).toEqual([
      'fecha,sesion,ejercicio,variante,serie,peso_kg,repeticiones,rir,molestia',
      `2026-11-18,"'=Pecho,día",Press de banca plano,Con barra,1,60,10,,`,
      `2026-11-18,"'=Pecho,día",Press de banca plano,Con barra,2,62.5,8,2,dolor`,
      '2026-11-19,Empuje,Press de banca plano,Con barra,1,70,8,,',
      '',
    ]);
  });
  it('sin series solo devuelve la cabecera, y un paso o ejercicio desconocido no rompe', () => {
    expect(sessionsToCsv([])).toBe('fecha,sesion,ejercicio,variante,serie,peso_kg,repeticiones,rir,molestia\n');
    const csv = sessionsToCsv([{ at: AT, session: session(), done: { '9.0.0': done(50, 5), '0.0.0': done(undefined, undefined) } }]);
    expect(csv.trim().split('\n')).toHaveLength(2); // cabecera + la serie sin peso ni repeticiones, con celdas vacías
    expect(csv).toContain('Con barra,1,,,,');
  });
});

describe('exportSessionsCsv', () => {
  it('exporta solo las sesiones terminadas del perfil', async () => {
    const db = memoryDb();
    await migrate(db);
    const a = await createProfile(db, { alias: 'Ana' });
    const b = await createProfile(db, { alias: 'Beto' });
    const plan: Plan = { schemaVersion: 1, mode: 'local', sessions: [session()] };
    for (const p of [a, b]) await saveActivePlan(db, p.id, plan, null);
    await db.runAsync("UPDATE training_plans SET created_at = '2026-11-16T08:00:00'");
    for (const p of [a, b]) await ensureHorizon(db, p.id, '2026-11-16', '2026-11-16');
    const id = await startWorkout(db, a.id, '2026-11-16', AT);
    await recordEvent(db, id, { type: 'set_done', block: 0, item: 0, round: 0, weightKg: 80, reps: 5 }, { now: AT + 1000 });
    await finishWorkout(db, id, AT + 2000);
    expect((await exportSessionsCsv(db, a.id)).split('\n')[1]).toBe('2026-11-18,Empuje,Press de banca plano,Con barra,1,80,5,,');
    expect(await exportSessionsCsv(db, b.id)).toBe('fecha,sesion,ejercicio,variante,serie,peso_kg,repeticiones,rir,molestia\n');
  });
});
