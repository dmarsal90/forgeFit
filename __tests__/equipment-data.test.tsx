import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Share } from 'react-native';
import EquipmentData from '../src/app/equipment-data';
import { migrate } from '../src/db';
import { exportEquipment } from '../src/db/equipmentBackup';
import { ensureEnvironment, getInventory, setItemState } from '../src/db/inventory';
import { createProfile } from '../src/db/profiles';
import { memoryDb } from '../test-utils/sqlite';

let mockApp: unknown;
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../src/features/AppContext', () => ({ useApp: () => mockApp }));

async function seed() {
  const db = memoryDb();
  await migrate(db);
  const a = await createProfile(db, { alias: 'Ana' });
  const b = await createProfile(db, { alias: 'Beto' });
  await setItemState(db, await ensureEnvironment(db, a.id, 'home'), 'bench_flat_fixed', 'available');
  return { db, a, b };
}

it('exporta compartiendo el JSON de la copia', async () => {
  const { db, a } = await seed();
  mockApp = { db, profile: a };
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction', activityType: undefined });
  await render(<EquipmentData />);
  await fireEvent.press(screen.getByText('Exportar copia'));
  await waitFor(() => expect(share).toHaveBeenCalled());
  expect(JSON.parse(share.mock.calls[0][0].message as string)).toEqual(await exportEquipment(db, a.id));
});

it('importa una copia válida y muestra el resumen; una inválida muestra el error y no cambia nada', async () => {
  const { db, a, b } = await seed();
  mockApp = { db, profile: b };
  await render(<EquipmentData />);

  await fireEvent.changeText(screen.getByLabelText('Texto de la copia'), '{nope');
  await fireEvent.press(screen.getByText('Importar copia'));
  expect(await screen.findByText('El texto no es un JSON válido.')).toBeTruthy();
  expect(await getInventory(db, await ensureEnvironment(db, b.id, 'home'))).toEqual({});

  await fireEvent.changeText(screen.getByLabelText('Texto de la copia'), JSON.stringify(await exportEquipment(db, a.id)));
  await fireEvent.press(screen.getByText('Importar copia'));
  expect(await screen.findByText(/Importado\. Marcas de equipo: 1 ·/)).toBeTruthy();
  expect(await getInventory(db, await ensureEnvironment(db, b.id, 'home'))).toEqual({ bench_flat_fixed: 'available' });
});
