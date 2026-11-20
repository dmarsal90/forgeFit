import { migrate } from '../src/db';
import { exportEquipment } from '../src/db/equipmentBackup';
import { exportProfile, exportProfileJson, importProfile, MAX_PROFILE_BACKUP_CHARS } from '../src/db/profileBackup';
import { listProfiles } from '../src/db/profiles';
import { exportSessionsCsv, getProgressStats, getStrength } from '../src/db/stats';
import { memoryDb } from '../test-utils/sqlite';
import { NOW, seed } from '../test-utils/profileSeed';

const TODAY = '2026-11-18';
const noIds = (x: unknown): unknown => JSON.parse(JSON.stringify(x, (k, v) => (k === 'id' || k === 'exportedAt' || k === 'scheduledSessionId' ? undefined : v)));

async function backupOfAna() {
  const { db, a } = await seed();
  return { db, a, json: await exportProfileJson(db, a.id) };
}
const mutate = async (fn: (b: any) => void) => {
  const { db, json } = await backupOfAna();
  const b = JSON.parse(json);
  fn(b);
  return { db, text: JSON.stringify(b) };
};

describe('restaurar en el mismo móvil', () => {
  it('crea un perfil nuevo con los mismos datos, progreso y fuerza, sin tocar el original', async () => {
    const { db, a, json } = await backupOfAna();
    const before = JSON.stringify(await exportProfile(db, a.id, NOW));
    const r = await importProfile(db, json);
    expect(r).toMatchObject({ ok: true, alias: 'Ana (restaurado)', plans: 1, workouts: 1, droppedDrafts: 0 });
    if (!r.ok) return;
    expect(r.profileId).not.toBe(a.id);

    expect(noIds(await exportProfile(db, r.profileId, NOW))).toEqual(noIds({ ...JSON.parse(json), profile: { ...JSON.parse(json).profile, alias: 'Ana (restaurado)' } }));
    expect(await exportSessionsCsv(db, r.profileId)).toBe(await exportSessionsCsv(db, a.id));
    expect(await getStrength(db, r.profileId)).toEqual(await getStrength(db, a.id));
    expect(await getProgressStats(db, r.profileId, TODAY)).toEqual(await getProgressStats(db, a.id, TODAY));
    expect(noIds(await exportEquipment(db, r.profileId))).toEqual(noIds(await exportEquipment(db, a.id))); // el id del equipo propio es global y se regenera

    expect(JSON.stringify(await exportProfile(db, a.id, NOW))).toBe(before); // el original, intacto
    expect((await listProfiles(db)).map((p) => p.alias).sort()).toEqual(['Ana', 'Ana (restaurado)', 'Beto']);
  });

  it('restaurar dos veces crea dos perfiles distintos, sin mezclar datos y con alias distintos', async () => {
    const { db, a, json } = await backupOfAna();
    const r1 = await importProfile(db, json);
    const r2 = await importProfile(db, json);
    if (!r1.ok || !r2.ok) throw new Error('debería restaurar');
    expect(new Set([a.id, r1.profileId, r2.profileId]).size).toBe(3);
    expect(r2.alias).toBe('Ana (restaurado 2)');
    expect((await getProgressStats(db, r1.profileId, TODAY)).completedTotal).toBe(1);
    expect((await getProgressStats(db, r2.profileId, TODAY)).completedTotal).toBe(1);
    const ids = await db.getAllAsync<{ n: number }>('SELECT COUNT(DISTINCT id) AS n FROM workout_sessions');
    expect(ids[0].n).toBe(5); // Ana (1 terminada + 1 abierta) + Beto + 2 restauradas
  });

  it('no cambia el perfil activo ni deja la sesión abierta de nadie', async () => {
    const { db, json } = await backupOfAna();
    const active = () => db.getFirstAsync<{ value: string }>("SELECT value FROM app_state WHERE key = 'active_profile_id'");
    const before = await active();
    await importProfile(db, json);
    expect(await active()).toEqual(before);
  });
});

describe('restaurar en un móvil vacío', () => {
  it('funciona sin ningún perfil previo y conserva el alias', async () => {
    const { json } = await backupOfAna();
    const fresh = memoryDb();
    await migrate(fresh);
    const r = await importProfile(fresh, json);
    expect(r).toMatchObject({ ok: true, alias: 'Ana', plans: 1, workouts: 1 });
    expect(await getProgressStats(fresh, (r as { profileId: string }).profileId, TODAY)).toMatchObject({ completedTotal: 1 });
  });
});

describe('rechaza sin escribir nada', () => {
  const countProfiles = async (db: Awaited<ReturnType<typeof seed>>['db']) => (await listProfiles(db)).length;

  it('JSON inválido, versión desconocida y demasiado grande', async () => {
    const { db, json } = await backupOfAna();
    const n = await countProfiles(db);
    expect(await importProfile(db, '{nope')).toEqual({ ok: false, error: 'El archivo no es un JSON válido.' });
    expect(await importProfile(db, JSON.stringify({ ...JSON.parse(json), schemaVersion: 2 }))).toMatchObject({ ok: false, error: expect.stringMatching(/Formato no válido en «schemaVersion»/) });
    expect(await importProfile(db, 'x'.repeat(MAX_PROFILE_BACKUP_CHARS + 1))).toEqual({ ok: false, error: 'El archivo es demasiado grande.' });
    expect(await countProfiles(db)).toBe(n);
  });

  it.each([
    ['dos planes activos', (b: any) => { b.plans.push({ ...structuredClone(b.plans[0]), id: 'otro', scheduled: [] }); }, /más de un plan activo/],
    ['fechas repetidas en un plan', (b: any) => { b.plans[0].scheduled.push({ ...b.plans[0].scheduled[0], id: 'dup' }); }, /repite revisiones o fechas/],
    ['identificadores repetidos', (b: any) => { b.workouts.push({ ...b.workouts[0] }); }, /repite identificadores/],
    ['eventos con el mismo seq', (b: any) => { b.workouts[0].events[1].seq = b.workouts[0].events[0].seq; }, /repite eventos/],
    ['ejercicio desconocido en el plan', (b: any) => { b.plans[0].plan.sessions[0].blocks[0].items[0].exerciseVariantId = 'fantasma.x'; }, /ejercicio desconocido: fantasma\.x/],
    ['equipo desconocido', (b: any) => { b.equipment.favorites.push('no_existe'); }, /equipo desconocido: no_existe/],
  ])('%s', async (_name, fn, msg) => {
    const { db, text } = await mutate(fn);
    const n = await countProfiles(db);
    const r = await importProfile(db, text);
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(msg) });
    expect(await countProfiles(db)).toBe(n);
  });
});

it('si algo falla a mitad de la restauración no queda ningún perfil a medias', async () => {
  const { db, json } = await backupOfAna();
  const failing = {
    ...db,
    withExclusiveTransactionAsync: (fn: (tx: unknown) => Promise<void>) => db.withExclusiveTransactionAsync(async (tx) => {
      const t = tx as unknown as { runAsync: (s: string, p?: unknown[]) => Promise<void> };
      await fn({ ...t, runAsync: (s: string, p?: unknown[]) => (s.includes('INTO session_events') ? Promise.reject(new Error('boom')) : t.runAsync(s, p)) });
    }),
  } as unknown as typeof db;
  const before = await db.getFirstAsync<{ n: number }>('SELECT (SELECT COUNT(*) FROM profiles) + (SELECT COUNT(*) FROM training_plans) + (SELECT COUNT(*) FROM workout_sessions) + (SELECT COUNT(*) FROM scheduled_sessions) AS n');
  expect(await importProfile(failing, json)).toEqual({ ok: false, error: 'No se pudo restaurar. No se creó ningún perfil.' });
  expect(await db.getFirstAsync('SELECT (SELECT COUNT(*) FROM profiles) + (SELECT COUNT(*) FROM training_plans) + (SELECT COUNT(*) FROM workout_sessions) + (SELECT COUNT(*) FROM scheduled_sessions) AS n')).toEqual(before);
});

it('descarta los borradores que ya no son válidos y lo cuenta', async () => {
  const { db, text } = await mutate((b) => { b.drafts['3'] = { years: 'muchos' }; });
  const r = await importProfile(db, text);
  expect(r).toMatchObject({ ok: true, droppedDrafts: 1 });
  const drafts = (await exportProfile(db, (r as { profileId: string }).profileId)).drafts;
  expect(Object.keys(drafts)).toEqual(['2']);
});
