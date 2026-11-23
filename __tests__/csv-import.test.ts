import { migrate } from '../src/db';
import { importSessionsCsv, previewSessionsCsv } from '../src/db/importSessions';
import { saveActivePlan } from '../src/db/plans';
import { createProfile } from '../src/db/profiles';
import { ensureHorizon } from '../src/db/schedule';
import { exportSessionsCsv, loadFinishedWorkouts } from '../src/db/stats';
import { finishWorkout, recordEvent, startWorkout } from '../src/db/workouts';
import { MAX_IMPORT_CHARS, parseCsv, parseSessionsCsv } from '../src/lib/csvImport';
import type { Plan, PlanSession } from '../src/lib/plan';
import { memoryDb } from '../test-utils/sqlite';

const HEADER = 'fecha,sesion,ejercicio,variante,serie,peso_kg,repeticiones,rir,molestia';
const session: PlanSession = { day: 0, name: '=Pecho, día', blocks: [
  { type: 'single', items: [{ exerciseVariantId: 'bench_press.barbell', sets: 3, repRange: [6, 10], restSeconds: 90 }] },
  { type: 'single', items: [{ exerciseVariantId: 'pushup.floor', sets: 2, repRange: [8, 12], restSeconds: 60 }] }] };

describe('parseCsv', () => {
  it('entiende comillas, comas y saltos de línea dentro de celdas, CRLF y BOM; falla con comillas sin cerrar', () => {
    expect(parseCsv('﻿a,"b,c","d ""x""\ne"\r\n1,2,3\r\n\r\n')).toEqual([['a', 'b,c', 'd "x"\ne'], ['1', '2', '3']]);
    expect(() => parseCsv('a,"b')).toThrow();
  });
});

describe('parseSessionsCsv', () => {
  const ok = (rows: string[], today = '2026-11-30') => parseSessionsCsv([HEADER, ...rows].join('\n'), today);
  it('rechaza lo que no es el CSV de ForgeFit', () => {
    expect(parseSessionsCsv('a,b\n1,2')).toMatchObject({ ok: false });
    expect(parseSessionsCsv('')).toMatchObject({ ok: false });
    expect(parseSessionsCsv('fecha,"x')).toMatchObject({ ok: false });
  });
  it('ignora y cuenta filas con datos no válidos, fechas futuras y ejercicios desconocidos, sin dejar de importar el resto', () => {
    const r = ok([
      '2026-11-18,Empuje,Press de banca plano,Con barra,1,60,10,2,molestia',
      '2026-11-18,Empuje,Press de banca plano,Con barra,2,abc,10,,',
      '2026-12-24,Empuje,Press de banca plano,Con barra,1,60,10,,',
      '2026-11-18,Empuje,Ejercicio inventado,Raro,1,60,10,,',
      '2026-11-18,Empuje,Press de banca plano,Con barra,3,60,10,,ay',
      '2026-11-18,Empuje,Press de banca plano',
    ]);
    if (!r.ok) throw new Error(r.error);
    expect(r.sessions).toHaveLength(1);
    expect(r.sessions[0].sets).toEqual([{ variantId: 'bench_press.barbell', serie: 1, weightKg: 60, reps: 10, rir: 2, pain: 'discomfort' }]);
    expect(r.ignoredRows).toBe(5);
    expect(r.unknown).toEqual(['Ejercicio inventado / Raro']);
    expect(r.issues.join('|')).toMatch(/Línea 3: peso no válido.*Línea 4: fecha no válida/);
  });
  it('quita el apóstrofo de neutralización y acepta mayúsculas o acentos distintos en los nombres', () => {
    const r = ok([`2026-11-18,"'=Pecho,día",PRESS DE BANCA PLANO,con barra,1,60,10,,`]);
    expect(r.ok && r.sessions[0].name).toBe('=Pecho,día');
  });
  it('una sesión con demasiadas series de un ejercicio se descarta entera', () => {
    const rows = Array.from({ length: 11 }, (_, i) => `2026-11-18,Larga,Press de banca plano,Con barra,${i + 1},60,10,,`);
    const r = ok(rows);
    expect(r.ok && r.sessions).toEqual([]);
    expect(r.ok && r.ignoredRows).toBe(11);
  });
});

describe('importar sesiones', () => {
  async function seed() {
    const db = memoryDb();
    await migrate(db);
    const a = await createProfile(db, { alias: 'Ana' });
    const b = await createProfile(db, { alias: 'Beto' });
    const plan: Plan = { schemaVersion: 1, mode: 'local', sessions: Array.from({ length: 7 }, (_, day) => ({ ...session, day })) };
    await saveActivePlan(db, a.id, plan, null);
    await ensureHorizon(db, a.id, '2026-11-18', '2026-11-18');
    const id = await startWorkout(db, a.id, '2026-11-18');
    await recordEvent(db, id, { type: 'set_done', block: 0, item: 0, round: 0, weightKg: 60, reps: 10 });
    await recordEvent(db, id, { type: 'set_done', block: 0, item: 0, round: 1, weightKg: 62.5, reps: 8, rir: 2, pain: 'pain' });
    await recordEvent(db, id, { type: 'set_done', block: 1, item: 0, round: 0, reps: 12 });
    await finishWorkout(db, id);
    return { db, a, b, csv: await exportSessionsCsv(db, a.id) };
  }
  const sets = async (db: Awaited<ReturnType<typeof seed>>['db'], pid: string) =>
    (await loadFinishedWorkouts(db, pid, 100)).map((w) => ({ name: w.session.name, done: Object.values(w.done).map((d) => ({ w: d.weightKg, r: d.reps, rir: d.rir, pain: d.pain })) }));

  it('ida y vuelta: lo exportado se importa en otro perfil con peso, repeticiones, RIR y molestia, y sin tocar su plan', async () => {
    const { db, a, b, csv } = await seed();
    expect(await previewSessionsCsv(db, b.id, csv)).toMatchObject({ ok: true, preview: { sessions: 1, sets: 3, duplicates: 0, ignoredRows: 0 } });
    expect(await sets(db, b.id)).toEqual([]); // la vista previa no escribe
    expect(await importSessionsCsv(db, b.id, csv)).toMatchObject({ ok: true, preview: { sessions: 1, sets: 3 } });
    expect(await sets(db, b.id)).toEqual(await sets(db, a.id));
    expect(await sets(db, b.id)).toEqual([{ name: '=Pecho, día', done: [
      { w: 60, r: 10, rir: undefined, pain: undefined }, { w: 62.5, r: 8, rir: 2, pain: 'pain' }, { w: undefined, r: 12, rir: undefined, pain: undefined }] }]);
    expect((await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM training_plans WHERE profile_id = ?', [b.id]))?.n).toBe(0);
    expect((await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM scheduled_sessions WHERE profile_id = ?', [b.id]))?.n).toBe(0);
    expect(await exportSessionsCsv(db, b.id)).toBe(csv); // y vuelve a exportarse igual
  });
  it('no duplica: importar dos veces, o en el perfil de origen, omite lo que ya existe', async () => {
    const { db, a, b, csv } = await seed();
    expect(await previewSessionsCsv(db, a.id, csv)).toMatchObject({ preview: { sessions: 0, duplicates: 1 } });
    await importSessionsCsv(db, b.id, csv);
    expect(await importSessionsCsv(db, b.id, csv)).toMatchObject({ ok: true, preview: { sessions: 0, duplicates: 1 } });
    expect(await sets(db, b.id)).toHaveLength(1);
  });
  it('rechaza archivos no válidos o demasiado grandes sin escribir nada, y un perfil inexistente', async () => {
    const { db, b, csv } = await seed();
    expect(await importSessionsCsv(db, b.id, 'hola')).toMatchObject({ ok: false });
    expect(await importSessionsCsv(db, b.id, ' '.repeat(MAX_IMPORT_CHARS + 1))).toMatchObject({ ok: false, error: expect.stringMatching(/grande/) });
    expect(await importSessionsCsv(db, 'nadie', csv)).toMatchObject({ ok: false });
    expect(await sets(db, b.id)).toEqual([]);
  });
  it('si falla a mitad no se guarda ninguna sesión', async () => {
    const { db, b, csv } = await seed();
    const two = `${csv}2026-11-17,Otra,Press de banca plano,Con barra,1,50,10,,\n`;
    await db.runAsync("CREATE TRIGGER fail_second BEFORE INSERT ON workout_sessions WHEN (SELECT COUNT(*) FROM workout_sessions WHERE profile_id = NEW.profile_id) >= 1 BEGIN SELECT RAISE(ABORT, 'boom'); END");
    expect(await importSessionsCsv(db, b.id, two)).toMatchObject({ ok: false, error: expect.stringMatching(/No se guardó/) });
    expect(await sets(db, b.id)).toEqual([]);
  });
});
