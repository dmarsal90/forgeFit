import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import Profiles from '../src/app/profiles';
import { migrate } from '../src/db';
import { profileBackupSchema } from '../src/db/profileBackup';
import { createProfile } from '../src/db/profiles';
import { toDateKey } from '../src/lib/schedule';
import { memoryDb } from '../test-utils/sqlite';

let mockApp: unknown;
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
