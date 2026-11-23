import { migrate } from '../src/db';
import { createCycle, endActiveCycle, getActiveCycle } from '../src/db/cycles';
import { createProfile } from '../src/db/profiles';
import { blocksError, cyclePosition, type CycleBlock } from '../src/lib/cycles';
import { memoryDb } from '../test-utils/sqlite';

const B = (weekFrom: number, weekTo: number, loadModifier = 1, goal = 'Volumen'): CycleBlock => ({ weekFrom, weekTo, goal, loadModifier });
const blocks = [B(1, 3), B(4, 6, 1.05, 'Intensidad'), B(7, 7, 1.1, 'Pico'), B(8, 8, 0.6, 'Descarga')];

describe('bloques y posición en el ciclo', () => {
  it('valida huecos, solapes, rango de carga y duración máxima', () => {
    expect(blocksError(blocks)).toBeNull();
    expect(blocksError([])).toMatch(/al menos/);
    expect(blocksError([B(2, 3)])).toMatch(/seguidas/);
    expect(blocksError([B(1, 3), B(3, 5)])).toMatch(/seguidas/);
    expect(blocksError([B(1, 3), B(5, 6)])).toMatch(/seguidas/);
    expect(blocksError([B(3, 2)])).toMatch(/no válidas/);
    expect(blocksError([B(1, 2, 0.3)])).toMatch(/Carga/);
    expect(blocksError([B(1, 2, 1.3)])).toMatch(/Carga/);
    expect(blocksError([B(1, 53)])).toMatch(/Máximo/);
  });
  it('semana N de M, límites entre bloques, antes de empezar y tras acabar (empezando en lunes)', () => {
    const at = (d: string) => cyclePosition('2026-11-02', blocks, d);
    expect(at('2026-11-08')).toMatchObject({ state: 'running', week: 1, total: 8, block: { goal: 'Volumen' } }); // domingo aún es la semana 1
    expect(at('2026-11-23')).toMatchObject({ state: 'running', week: 4, block: { goal: 'Intensidad' } });
    expect(at('2026-12-21')).toMatchObject({ state: 'running', week: 8, block: { loadModifier: 0.6 } });
    expect(at('2026-12-28')).toEqual({ state: 'finished', total: 8 });
    expect(at('2026-10-31')).toEqual({ state: 'upcoming', startsIn: 1 });
    expect(cyclePosition('2026-11-04', blocks, '2026-11-02')).toMatchObject({ state: 'running', week: 1 }); // el inicio se lleva a su lunes
  });
});

describe('ciclos guardados', () => {
  async function seed() {
    const db = memoryDb();
    await migrate(db);
    return { db, a: await createProfile(db, { alias: 'Ana' }), b: await createProfile(db, { alias: 'Beto' }) };
  }
  it('crea, lee con los bloques en orden y el inicio en lunes; un ciclo nuevo termina el anterior; por perfil', async () => {
    const { db, a, b } = await seed();
    await createCycle(db, a.id, { name: 'Hipertrofia', startDate: '2026-11-04', blocks });
    expect(await getActiveCycle(db, a.id)).toMatchObject({ name: 'Hipertrofia', startDate: '2026-11-02', blocks });
    expect(await getActiveCycle(db, b.id)).toBeNull();
    await createCycle(db, a.id, { name: 'Fuerza', startDate: '2026-12-07', blocks: [B(1, 4)] });
    expect((await getActiveCycle(db, a.id))?.name).toBe('Fuerza');
    expect((await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM training_cycles WHERE profile_id = ?', [a.id]))?.n).toBe(2);
  });
  it('rechaza datos no válidos sin escribir nada, y terminar es idempotente', async () => {
    const { db, a } = await seed();
    await createCycle(db, a.id, { name: 'Uno', startDate: '2026-11-02', blocks: [B(1, 2)] });
    await expect(createCycle(db, a.id, { name: 'Malo', startDate: '2026-11-02', blocks: [B(1, 2), B(4, 5)] })).rejects.toThrow();
    await expect(createCycle(db, a.id, { name: ' ', startDate: '2026-11-02', blocks })).rejects.toThrow();
    await expect(createCycle(db, a.id, { name: 'Fecha', startDate: '2026-13-40', blocks })).rejects.toThrow();
    expect((await getActiveCycle(db, a.id))?.name).toBe('Uno'); // el activo sigue intacto
    await endActiveCycle(db, a.id);
    await endActiveCycle(db, a.id);
    expect(await getActiveCycle(db, a.id)).toBeNull();
  });
  it('borrar el perfil borra sus ciclos y bloques', async () => {
    const { db, a } = await seed();
    await createCycle(db, a.id, { name: 'Uno', startDate: '2026-11-02', blocks });
    await db.runAsync('DELETE FROM profiles WHERE id = ?', [a.id]);
    expect((await db.getFirstAsync<{ n: number }>('SELECT (SELECT COUNT(*) FROM training_cycles) + (SELECT COUNT(*) FROM training_blocks) AS n'))?.n).toBe(0);
  });
});
