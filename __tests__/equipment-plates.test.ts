import { migrate } from '../src/db';
import { migrations } from '../src/db/migrations';
import { exportEquipment, importEquipment } from '../src/db/equipmentBackup';
import { getAttributes, setAttributes } from '../src/db/equipmentAttributes';
import { listEnvironmentPlates, listPlates, plateKg, plateLabel, setPlates, toStock } from '../src/db/equipmentPlates';
import { ensureEnvironment, setItemState } from '../src/db/inventory';
import { createProfile } from '../src/db/profiles';
import { loadModel } from '../src/lib/loadModel';
import { memoryDb } from '../test-utils/sqlite';

async function seed() {
  const db = memoryDb();
  await migrate(db);
  const a = await createProfile(db, { alias: 'Ana' });
  const b = await createProfile(db, { alias: 'Beto' });
  const gym = await ensureEnvironment(db, a.id, 'gym');
  const gymB = await ensureEnvironment(db, b.id, 'gym');
  return { db, a, b, gym, gymB };
}

describe('discos por entorno y tipo de disco', () => {
  it('guarda cada tamaño con su unidad y sus pares; un entorno puede tener kg y lb; ordenados', async () => {
    const { db, gym } = await seed();
    await setPlates(db, gym, 'plates_olympic_iron', [{ unit: 'lb', value: 45, pairs: 2 }, { unit: 'kg', value: 20, pairs: 1 }, { unit: 'kg', value: 25, pairs: 2 }, { unit: 'lb', value: 2.5, pairs: 4 }]);
    expect(await listPlates(db, gym, 'plates_olympic_iron')).toEqual([
      { unit: 'kg', value: 25, pairs: 2 }, { unit: 'kg', value: 20, pairs: 1 }, { unit: 'lb', value: 45, pairs: 2 }, { unit: 'lb', value: 2.5, pairs: 4 },
    ]);
  });
  it('sustituye lo anterior, valida todo (nada se guarda si algo es inválido) y no toca otros tipos de disco ni otros entornos', async () => {
    const { db, a, gym, gymB } = await seed();
    const home = await ensureEnvironment(db, a.id, 'home');
    await setPlates(db, gym, 'plates_olympic_iron', [{ unit: 'kg', value: 10, pairs: 2 }]);
    await setPlates(db, gym, 'plates_fractional', [{ unit: 'kg', value: 0.5, pairs: 2 }]);
    await setPlates(db, home, 'plates_olympic_iron', [{ unit: 'kg', value: 5, pairs: 2 }]);
    await setPlates(db, gym, 'plates_olympic_iron', [{ unit: 'lb', value: 25, pairs: 1 }]);
    expect(await listPlates(db, gym, 'plates_olympic_iron')).toEqual([{ unit: 'lb', value: 25, pairs: 1 }]);
    expect(await listPlates(db, gym, 'plates_fractional')).toHaveLength(1);
    expect(await listPlates(db, home, 'plates_olympic_iron')).toEqual([{ unit: 'kg', value: 5, pairs: 2 }]);
    expect(await listPlates(db, gymB, 'plates_olympic_iron')).toEqual([]);

    for (const bad of [
      [{ unit: 'kg', value: 0, pairs: 2 }], [{ unit: 'kg', value: -5, pairs: 2 }], [{ unit: 'kg', value: 501, pairs: 2 }], [{ unit: 'st', value: 5, pairs: 2 }],
      [{ unit: 'kg', value: 5, pairs: 0 }], [{ unit: 'kg', value: 5, pairs: 21 }], [{ unit: 'kg', value: 5, pairs: 1.5 }],
      [{ unit: 'kg', value: 5, pairs: 1 }, { unit: 'kg', value: 5, pairs: 2 }], // repetido
    ]) await expect(setPlates(db, gym, 'plates_olympic_iron', bad as never)).rejects.toThrow();
    await expect(setPlates(db, gym, 'no_existe', [{ unit: 'kg', value: 5, pairs: 1 }])).rejects.toThrow('desconocido');
    expect(await listPlates(db, gym, 'plates_olympic_iron')).toEqual([{ unit: 'lb', value: 25, pairs: 1 }]); // lo inválido no pisa lo guardado
    expect((await listEnvironmentPlates(db, gym)).map((p) => p.equipmentId).sort()).toEqual(['plates_fractional', 'plates_olympic_iron']);
  });
  it('convierte a kg exactos y nombra el disco en su unidad', () => {
    expect(plateKg({ unit: 'lb', value: 45 })).toBeCloseTo(20.411657, 6);
    expect(plateKg({ unit: 'kg', value: 1.25 })).toBe(1.25);
    expect(plateLabel({ unit: 'lb', value: 2.5 })).toBe('2.5 lb');
    expect(toStock([{ unit: 'lb', value: 45, pairs: 2 }])).toEqual([{ kg: plateKg({ unit: 'lb', value: 45 }), pairs: 2, label: '45 lb' }]);
  });
  it('con discos indicados el escalón sale del disco más pequeño que tiene, en kg o en lb', () => {
    expect(loadModel([], toStock([{ unit: 'kg', value: 1.25, pairs: 2 }, { unit: 'kg', value: 20, pairs: 2 }])).stepKg).toBe(2.5);
    expect(loadModel([], toStock([{ unit: 'lb', value: 2.5, pairs: 2 }, { unit: 'kg', value: 20, pairs: 2 }])).stepKg).toBeCloseTo(2.26796, 4); // 2 × 2,5 lb
    expect(loadModel([{ id: 'plates_olympic_iron', stepKg: 1, barKg: null }], []).stepKg).toBe(2); // sin discos indicados, el dato suelto
  });
  it('los discos se borran con el entorno y con migración v10 la base antigua sigue funcionando', async () => {
    const { db, a, gym } = await seed();
    await setPlates(db, gym, 'plates_olympic_iron', [{ unit: 'kg', value: 10, pairs: 2 }]);
    await db.runAsync('DELETE FROM profiles WHERE id = ?', [a.id]);
    expect(await db.getAllAsync('SELECT 1 FROM equipment_plates')).toEqual([]);

    const old = memoryDb();
    await migrate(old, migrations.slice(0, 9)); // hasta la unidad por perfil
    await old.runAsync("INSERT INTO profiles (id, alias, created_at, updated_at) VALUES ('p','Ana','x','x')");
    await old.runAsync("INSERT INTO training_environments (id, profile_id, kind, name, created_at) VALUES ('e','p','gym','Gimnasio','x')");
    await old.runAsync("INSERT INTO equipment_attributes (environment_id, equipment_id, step_kg, updated_at) VALUES ('e','dumbbells_fixed_hex',2,'x')");
    await migrate(old);
    expect(await getAttributes(old, 'e', 'dumbbells_fixed_hex')).toEqual({ minKg: null, maxKg: null, stepKg: 2, barKg: null, unit: null });
  });
});

describe('unidad por equipo y copia de seguridad', () => {
  it('la unidad de un equipo se guarda y solo la unidad no crea una fila', async () => {
    const { db, gym } = await seed();
    await setAttributes(db, gym, 'bench_flat_fixed', { minKg: null, maxKg: null, stepKg: 4.5359237, barKg: null, unit: 'lb' });
    expect((await getAttributes(db, gym, 'bench_flat_fixed')).unit).toBe('lb');
    await setAttributes(db, gym, 'dumbbells_fixed_hex', { minKg: null, maxKg: null, stepKg: null, barKg: null, unit: 'lb' });
    expect(await getAttributes(db, gym, 'dumbbells_fixed_hex')).toEqual({ minKg: null, maxKg: null, stepKg: null, barKg: null, unit: null });
    await expect(setAttributes(db, gym, 'bench_flat_fixed', { minKg: null, maxKg: null, stepKg: 2, barKg: null, unit: 'st' as never })).rejects.toThrow();
  });
  it('los discos y la unidad de cada equipo viajan en la copia y se restauran en otro perfil; una copia antigua sin ellos sigue valiendo', async () => {
    const { db, a, b, gym, gymB } = await seed();
    await setItemState(db, gym, 'plates_olympic_iron', 'available');
    await setPlates(db, gym, 'plates_olympic_iron', [{ unit: 'kg', value: 20, pairs: 2 }, { unit: 'lb', value: 45, pairs: 3 }]);
    await setAttributes(db, gym, 'bench_flat_fixed', { minKg: null, maxKg: null, stepKg: 4.5, barKg: null, unit: 'lb' });
    const backup = await exportEquipment(db, a.id);
    expect(backup.environments[0].plates).toEqual([{ equipmentId: 'plates_olympic_iron', unit: 'lb', value: 45, pairs: 3 }, { equipmentId: 'plates_olympic_iron', unit: 'kg', value: 20, pairs: 2 }].sort((x, y) => (x.unit === y.unit ? 0 : x.unit === 'kg' ? -1 : 1)) as never);
    const r = await importEquipment(db, b.id, JSON.stringify(backup));
    expect(r.ok).toBe(true);
    expect(await listPlates(db, gymB, 'plates_olympic_iron')).toEqual(await listPlates(db, gym, 'plates_olympic_iron'));
    expect((await getAttributes(db, gymB, 'bench_flat_fixed')).unit).toBe('lb');

    const legacy = { schemaVersion: 1, custom: [], favorites: [], environments: [{ kind: 'home', items: { bench_flat_fixed: 'available' }, attributes: { bench_flat_fixed: { minKg: 2, maxKg: 20, stepKg: 2, barKg: null } } }] };
    expect((await importEquipment(db, b.id, JSON.stringify(legacy))).ok).toBe(true);
    const home = await ensureEnvironment(db, b.id, 'home');
    expect(await getAttributes(db, home, 'bench_flat_fixed')).toMatchObject({ minKg: 2, unit: null });
    const bad = { ...legacy, environments: [{ ...legacy.environments[0], plates: [{ equipmentId: 'no_existe', unit: 'kg', value: 5, pairs: 1 }] }] };
    expect(await importEquipment(db, b.id, JSON.stringify(bad))).toMatchObject({ ok: false, error: expect.stringMatching(/desconocido/) });
  });
});
