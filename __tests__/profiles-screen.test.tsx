import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import Profiles from '../src/app/profiles';
import { migrate } from '../src/db';
import { exportProfileJson, MAX_PROFILE_BACKUP_CHARS, profileBackupSchema } from '../src/db/profileBackup';
import { createProfile } from '../src/db/profiles';
import { toDateKey } from '../src/lib/schedule';
import { memoryDb } from '../test-utils/sqlite';
import { seed } from '../test-utils/profileSeed';

let mockApp: unknown;
const mockFile = { text: jest.fn() };
jest.mock('expo-file-system', () => ({ File: jest.fn(() => mockFile) }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
const Picker = jest.requireMock('expo-document-picker') as { getDocumentAsync: jest.Mock };
const mockShare = jest.fn();
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../src/features/AppContext', () => ({ useApp: () => mockApp }));
jest.mock('../src/lib/shareFile', () => ({ shareTextFile: (...a: unknown[]) => mockShare(...a) }));

async function setup() {
  const db = memoryDb();
  await migrate(db);
  const profile = await createProfile(db, { alias: 'Ana' });
  mockApp = { db, profile, refresh: jest.fn() };
}
const confirm = () => {
  const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)[2] as { text: string; onPress?: () => void }[];
  buttons.find((b) => b.text === 'Exportar')!.onPress!();
};

beforeEach(() => { mockShare.mockReset(); jest.spyOn(Alert, 'alert').mockImplementation(() => {}); });

it('avisa de que el archivo no va cifrado y, al confirmar, comparte la copia completa', async () => {
  await setup();
  mockShare.mockResolvedValue(true);
  await render(<Profiles />);
  await fireEvent.press(await screen.findByText('Exportar copia completa'));
  expect((Alert.alert as jest.Mock).mock.calls[0][1]).toMatch(/sin cifrar/);
  expect(mockShare).not.toHaveBeenCalled(); // nada se exporta antes de confirmar
  confirm();
  await waitFor(() => expect(mockShare).toHaveBeenCalled());
  const [name, content, mime] = mockShare.mock.calls[0];
  expect(name).toBe(`forgefit-perfil-${toDateKey()}.json`);
  expect(mime).toBe('application/json');
  expect(profileBackupSchema.safeParse(JSON.parse(content)).success).toBe(true);
});

it('si no se puede compartir o falla, lo dice', async () => {
  await setup();
  mockShare.mockResolvedValueOnce(false);
  await render(<Profiles />);
  await fireEvent.press(await screen.findByText('Exportar copia completa'));
  confirm();
  expect(await screen.findByText('Este dispositivo no puede compartir archivos.')).toBeTruthy();

  mockShare.mockRejectedValueOnce(new Error('x'));
  confirm();
  expect(await screen.findByText('No se pudo exportar la copia.')).toBeTruthy();
});

describe('restaurar copia completa', () => {
  beforeEach(() => { mockFile.text.mockReset(); Picker.getDocumentAsync.mockReset(); });

  it('restaura el archivo elegido como perfil nuevo y avisa; cancelar no hace nada', async () => {
    const { db, a } = await seed();
    mockApp = { db, profile: a, refresh: jest.fn() };
    await render(<Profiles />);

    Picker.getDocumentAsync.mockResolvedValueOnce({ canceled: true, assets: null });
    await fireEvent.press(await screen.findByText('Restaurar copia completa'));
    expect(mockFile.text).not.toHaveBeenCalled();

    Picker.getDocumentAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///x.json', size: 1000 }] });
    mockFile.text.mockResolvedValueOnce(await exportProfileJson(db, a.id));
    await fireEvent.press(screen.getByText('Restaurar copia completa'));
    expect(await screen.findByText(/Perfil «Ana \(restaurado\)» restaurado: 1 plan y 1 entreno\./)).toBeTruthy();
    expect(await screen.findByText('Ana (restaurado)')).toBeTruthy(); // aparece en la lista
  });

  it('un archivo gigante, ilegible o inválido se rechaza con un mensaje y no crea perfiles', async () => {
    const { db, a } = await seed();
    mockApp = { db, profile: a, refresh: jest.fn() };
    await render(<Profiles />);
    const count = async () => (await db.getAllAsync('SELECT id FROM profiles')).length;
    const before = await count();

    Picker.getDocumentAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///x.json', size: MAX_PROFILE_BACKUP_CHARS * 4 + 1 }] });
    await fireEvent.press(await screen.findByText('Restaurar copia completa'));
    expect(await screen.findByText('El archivo es demasiado grande.')).toBeTruthy();

    Picker.getDocumentAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///x.json', size: 5 }] });
    mockFile.text.mockRejectedValueOnce(new Error('denegado'));
    await fireEvent.press(screen.getByText('Restaurar copia completa'));
    expect(await screen.findByText('No se pudo leer el archivo.')).toBeTruthy();

    Picker.getDocumentAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///x.json', size: 5 }] });
    mockFile.text.mockResolvedValueOnce('{"hola":1}');
    await fireEvent.press(screen.getByText('Restaurar copia completa'));
    expect(await screen.findByText(/Formato no válido/)).toBeTruthy();
    expect(await count()).toBe(before);
  });
});
