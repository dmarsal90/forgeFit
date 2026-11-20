import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import EquipmentSheet from '../src/app/equipment/[id]';
import { migrate } from '../src/db';
import { addCustomItem } from '../src/db/customEquipment';
import { getAttributes } from '../src/db/equipmentAttributes';
import { listPlates } from '../src/db/equipmentPlates';
import { listFavorites } from '../src/db/favorites';
import { ensureEnvironment, getInventory } from '../src/db/inventory';
import { createProfile } from '../src/db/profiles';
import { memoryDb } from '../test-utils/sqlite';

let mockApp: unknown;
let mockParams: { id: string; env: string };
jest.mock('expo-router', () => ({ router: { back: jest.fn() }, useLocalSearchParams: () => mockParams }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../src/features/AppContext', () => ({ useApp: () => mockApp }));

async function seed() {
  const db = memoryDb();
  await migrate(db);
  const profile = await createProfile(db, { alias: 'Ana' });
  const other = await createProfile(db, { alias: 'Beto' });
  const env = await ensureEnvironment(db, profile.id, 'gym');
  const otherEnv = await ensureEnvironment(db, other.id, 'gym');
  mockApp = { db, profile };
  return { db, profile, env, otherEnv };
}

it('guarda el estado y los datos con coma decimal, y rechaza un mínimo mayor que el máximo', async () => {
  const { db, env } = await seed();
  mockParams = { id: 'bench_flat_fixed', env };
  await render(<EquipmentSheet />);
  expect(await screen.findByText('Banco plano fijo')).toBeTruthy();

  await fireEvent.press(screen.getByText('Lo tengo'));
  await waitFor(async () => expect(await getInventory(db, env)).toEqual({ bench_flat_fixed: 'available' }));

  await fireEvent.changeText(screen.getByLabelText('Peso mínimo (kg)'), '50');
  await fireEvent.changeText(screen.getByLabelText('Peso máximo (kg)'), '40');
  await fireEvent.press(screen.getByText('Guardar datos'));
  expect(await screen.findByText('El mínimo no puede superar al máximo')).toBeTruthy();
  expect(await getAttributes(db, env, 'bench_flat_fixed')).toMatchObject({ minKg: null });

  await fireEvent.changeText(screen.getByLabelText('Peso mínimo (kg)'), '2,5');
  await fireEvent.press(screen.getByText('Guardar datos'));
  expect(await screen.findByText('Guardado.')).toBeTruthy();
  expect(await getAttributes(db, env, 'bench_flat_fixed')).toEqual({ minKg: 2.5, maxKg: 40, stepKg: null, barKg: null, unit: null });
});

it('no abre un entorno de otro perfil ni un equipo propio ajeno', async () => {
  const { db, profile, otherEnv } = await seed();
  mockParams = { id: 'bench_flat_fixed', env: otherEnv };
  const { unmount } = await render(<EquipmentSheet />);
  expect(await screen.findByText('No se encontró este equipo.')).toBeTruthy();
  unmount();

  const own = await addCustomItem(db, profile.id, { name: 'Anillas', family: 'bodyweight' });
  mockParams = { id: own.id, env: otherEnv };
  await render(<EquipmentSheet />);
  expect(await screen.findByText('No se encontró este equipo.')).toBeTruthy();
});

it('marca y desmarca el favorito', async () => {
  const { db, profile, env } = await seed();
  mockParams = { id: 'bench_flat_fixed', env };
  await render(<EquipmentSheet />);
  await fireEvent.press(await screen.findByText('Añadir a favoritos'));
  expect(await screen.findByText('Quitar de favoritos')).toBeTruthy();
  expect([...(await listFavorites(db, profile.id))]).toEqual(['bench_flat_fixed']);
  await fireEvent.press(screen.getByText('Quitar de favoritos'));
  expect(await screen.findByText('Añadir a favoritos')).toBeTruthy();
  expect((await listFavorites(db, profile.id)).size).toBe(0);
});

it('en libras muestra y recibe libras, pero guarda kilos', async () => {
  const { db, env } = await seed();
  mockApp = { db, profile: { ...(mockApp as { profile: object }).profile, weightUnit: 'lb' } };
  mockParams = { id: 'bench_flat_fixed', env };
  await render(<EquipmentSheet />);
  await fireEvent.changeText(await screen.findByLabelText('Peso mínimo (lb)'), '45');
  await fireEvent.press(screen.getByText('Guardar datos'));
  expect(await screen.findByText('Guardado.')).toBeTruthy();
  expect((await getAttributes(db, env, 'bench_flat_fixed')).minKg).toBeCloseTo(20.412, 2);
});

describe('barras y discos: datos que tienen sentido', () => {
  it('una barra solo pide su peso, con lo habitual de la olímpica, y permite aclarar el de la suya', async () => {
    const { db, env } = await seed();
    mockParams = { id: 'barbell_olympic_20', env };
    await render(<EquipmentSheet />);
    expect(await screen.findByText('Datos de la barra')).toBeTruthy();
    expect(screen.getByText(/Lo habitual en esta barra: 20 kg/)).toBeTruthy();
    expect(screen.queryByLabelText('Peso mínimo (kg)')).toBeNull();
    expect(screen.queryByLabelText('Incremento (kg)')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Peso de la barra (kg)'), '22,5');
    await fireEvent.press(screen.getByText('Guardar datos'));
    expect(await screen.findByText('Guardado.')).toBeTruthy();
    expect(await getAttributes(db, env, 'barbell_olympic_20')).toEqual({ minKg: null, maxKg: null, stepKg: null, barKg: 22.5, unit: null });
  });

  it('una barra de las que varían (EZ, hexagonal…) no supone ningún peso y pide indicarlo', async () => {
    const { env } = await seed();
    mockParams = { id: 'barbell_trap_hex', env };
    await render(<EquipmentSheet />);
    expect(await screen.findByText(/Varía según el fabricante/)).toBeTruthy();
  });

  it('los discos se indican uno a uno, cada uno en su unidad, con sus pares', async () => {
    const { db, env } = await seed();
    mockParams = { id: 'plates_olympic_iron', env };
    await render(<EquipmentSheet />);
    expect(await screen.findByText('Mis discos')).toBeTruthy();
    expect(screen.getByText('Aún no has indicado ningún disco.')).toBeTruthy();
    expect(screen.queryByText('Guardar datos')).toBeNull();

    await fireEvent.press(screen.getByText('Serie en kg'));
    expect(await screen.findByText('1.25 kg')).toBeTruthy();
    expect((await listPlates(db, env, 'plates_olympic_iron')).map((p) => [p.unit, p.value, p.pairs])).toEqual([['kg', 25, 2], ['kg', 20, 2], ['kg', 15, 2], ['kg', 10, 2], ['kg', 5, 2], ['kg', 2.5, 2], ['kg', 1.25, 2]]);

    await fireEvent.press(screen.getByText('Serie en lb')); // los dos juegos a la vez
    expect(await screen.findByText('45 lb')).toBeTruthy();
    expect((await listPlates(db, env, 'plates_olympic_iron')).filter((p) => p.unit === 'lb').map((p) => p.value)).toEqual([45, 35, 25, 10, 5, 2.5]);

    await fireEvent.press(screen.getByRole('button', { name: 'Un par más de 45 lb' }));
    expect((await listPlates(db, env, 'plates_olympic_iron')).find((p) => p.unit === 'lb' && p.value === 45)?.pairs).toBe(3);
    await fireEvent.press(await screen.findByRole('button', { name: 'Un par menos de 45 lb' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Un par menos de 45 lb' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Quitar el disco de 45 lb' })); // con un solo par, el botón quita el disco
    expect((await listPlates(db, env, 'plates_olympic_iron')).some((p) => p.unit === 'lb' && p.value === 45)).toBe(false); // sin pares, el disco se quita
  });

  it('añade un disco suelto en la unidad elegida y rechaza uno repetido o vacío', async () => {
    const { db, env } = await seed();
    mockParams = { id: 'plates_olympic_iron', env };
    await render(<EquipmentSheet />);
    await screen.findByText('Mis discos');
    await fireEvent.press(screen.getByText('Añadir disco'));
    expect(await screen.findByText('Escribe cuánto pesa el disco.')).toBeTruthy();
    await fireEvent.press(screen.getByText('lb'));
    await fireEvent.changeText(screen.getByLabelText('Otro disco (lb)'), '2,5');
    await fireEvent.press(screen.getByText('Añadir disco'));
    expect(await screen.findByText('2.5 lb')).toBeTruthy();
    expect(await listPlates(db, env, 'plates_olympic_iron')).toEqual([{ unit: 'lb', value: 2.5, pairs: 2 }]);
    await fireEvent.changeText(screen.getByLabelText('Otro disco (lb)'), '2.5');
    await fireEvent.press(screen.getByText('Añadir disco'));
    expect(await screen.findByText('Ese disco ya está en la lista.')).toBeTruthy();
  });

  it('cada equipo tiene su unidad: una máquina en lb se escribe en lb y se guarda en kg con su unidad', async () => {
    const { db, env } = await seed();
    mockParams = { id: 'bench_flat_fixed', env }; // perfil en kg
    await render(<EquipmentSheet />);
    await screen.findByText('Banco plano fijo');
    await fireEvent.press(screen.getByText('En lb'));
    await fireEvent.changeText(await screen.findByLabelText('Incremento (lb)'), '10');
    await fireEvent.press(screen.getByText('Guardar datos'));
    expect(await screen.findByText('Guardado.')).toBeTruthy();
    const a = await getAttributes(db, env, 'bench_flat_fixed');
    expect(a.stepKg).toBeCloseTo(4.5359, 3);
    expect(a.unit).toBe('lb');
  });

  it('al cambiar de unidad lo escrito se convierte', async () => {
    const { env } = await seed();
    mockParams = { id: 'bench_flat_fixed', env };
    await render(<EquipmentSheet />);
    await screen.findByText('Banco plano fijo');
    await fireEvent.changeText(screen.getByLabelText('Peso máximo (kg)'), '100');
    await fireEvent.press(screen.getByText('En lb'));
    expect(screen.getByLabelText('Peso máximo (lb)').props.value).toBe('220.5');
  });

  it('en libras el valor habitual de la barra sale en libras', async () => {
    const { db, profile, env } = await seed();
    await db.runAsync("UPDATE profiles SET weight_unit = 'lb' WHERE id = ?", [profile.id]);
    mockApp = { db, profile: { ...profile, weightUnit: 'lb' } };
    mockParams = { id: 'barbell_olympic_20', env };
    await render(<EquipmentSheet />);
    expect(await screen.findByText(/Lo habitual en esta barra: 44.1 lb/)).toBeTruthy();
  });
});
