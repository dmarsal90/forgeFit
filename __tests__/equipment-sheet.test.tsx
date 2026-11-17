import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import EquipmentSheet from '../src/app/equipment/[id]';
import { migrate } from '../src/db';
import { addCustomItem } from '../src/db/customEquipment';
import { getAttributes } from '../src/db/equipmentAttributes';
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
  expect(await getAttributes(db, env, 'bench_flat_fixed')).toEqual({ minKg: 2.5, maxKg: 40, stepKg: null, barKg: null });
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
