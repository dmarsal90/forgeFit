import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Share } from 'react-native';
import EquipmentData from '../src/app/equipment-data';
import { migrate } from '../src/db';
import { exportEquipment } from '../src/db/equipmentBackup';
import { ensureEnvironment, getInventory, setItemState } from '../src/db/inventory';
import { createProfile } from '../src/db/profiles';
import { memoryDb } from '../test-utils/sqlite';

let mockApp: unknown;
const mockFile = { create: jest.fn(), write: jest.fn(), text: jest.fn(), uri: 'file:///cache/copia.json' };
jest.mock('expo-file-system', () => ({ File: jest.fn(() => mockFile), Paths: { cache: 'file:///cache/' } }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn().mockResolvedValue(true), shareAsync: jest.fn().mockResolvedValue(undefined) }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
const Sharing = jest.requireMock('expo-sharing') as { isAvailableAsync: jest.Mock; shareAsync: jest.Mock };
const Picker = jest.requireMock('expo-document-picker') as { getDocumentAsync: jest.Mock };
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

describe('archivo .json', () => {
  beforeEach(() => { jest.clearAllMocks(); Sharing.isAvailableAsync.mockResolvedValue(true); });

  it('exporta escribiendo un archivo en caché y compartiéndolo', async () => {
    const { db, a } = await seed();
    mockApp = { db, profile: a };
    await render(<EquipmentData />);
    await fireEvent.press(screen.getByText('Exportar archivo .json'));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/copia.json', expect.objectContaining({ mimeType: 'application/json' })));
    expect(JSON.parse(mockFile.write.mock.calls[0][0])).toEqual(await exportEquipment(db, a.id));
  });

  it('si el dispositivo no puede compartir archivos lo dice y no escribe nada', async () => {
    const { db, a } = await seed();
    mockApp = { db, profile: a };
    Sharing.isAvailableAsync.mockResolvedValue(false);
    await render(<EquipmentData />);
    await fireEvent.press(screen.getByText('Exportar archivo .json'));
    expect(await screen.findByText(/no puede compartir archivos/)).toBeTruthy();
    expect(mockFile.write).not.toHaveBeenCalled();
  });

  it('importa el archivo elegido; cancelar no hace nada; un archivo gigante o inválido se rechaza', async () => {
    const { db, a, b } = await seed();
    mockApp = { db, profile: b };
    await render(<EquipmentData />);

    Picker.getDocumentAsync.mockResolvedValueOnce({ canceled: true, assets: null });
    await fireEvent.press(screen.getByText('Importar archivo .json'));
    expect(mockFile.text).not.toHaveBeenCalled();

    Picker.getDocumentAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///x.json', size: 50_000_000 }] });
    await fireEvent.press(screen.getByText('Importar archivo .json'));
    expect(await screen.findByText('El archivo es demasiado grande.')).toBeTruthy();
    expect(mockFile.text).not.toHaveBeenCalled();

    Picker.getDocumentAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///x.json', size: 5 }] });
    mockFile.text.mockResolvedValueOnce('{nope');
    await fireEvent.press(screen.getByText('Importar archivo .json'));
    expect(await screen.findByText('El texto no es un JSON válido.')).toBeTruthy();
    expect(await getInventory(db, await ensureEnvironment(db, b.id, 'home'))).toEqual({});

    Picker.getDocumentAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///x.json', size: 500 }] });
    mockFile.text.mockResolvedValueOnce(JSON.stringify(await exportEquipment(db, a.id)));
    await fireEvent.press(screen.getByText('Importar archivo .json'));
    expect(await screen.findByText(/Importado\. Marcas de equipo: 1 ·/)).toBeTruthy();
    expect(await getInventory(db, await ensureEnvironment(db, b.id, 'home'))).toEqual({ bench_flat_fixed: 'available' });
  });

  it('si no se puede leer el archivo avisa sin romper', async () => {
    const { db, b } = await seed();
    mockApp = { db, profile: b };
    await render(<EquipmentData />);
    Picker.getDocumentAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///x.json', size: 5 }] });
    mockFile.text.mockRejectedValueOnce(new Error('denegado'));
    await fireEvent.press(screen.getByText('Importar archivo .json'));
    expect(await screen.findByText('No se pudo leer el archivo.')).toBeTruthy();
  });
});
