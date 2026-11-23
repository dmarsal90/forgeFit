import { fireEvent, render, screen } from '@testing-library/react-native';
import DataScreen from '../src/app/more/data';
import { migrate } from '../src/db';
import { createProfile } from '../src/db/profiles';
import { loadFinishedWorkouts } from '../src/db/stats';
import { memoryDb } from '../test-utils/sqlite';

let mockApp: unknown;
let mockFile: { text: jest.Mock };
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn(() => mockFile) }));
const Picker = jest.requireMock('expo-document-picker') as { getDocumentAsync: jest.Mock };
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../src/features/AppContext', () => ({ useApp: () => mockApp }));

const HEADER = 'fecha,sesion,ejercicio,variante,serie,peso_kg,repeticiones,rir,molestia';
async function setup(csv: string, size = csv.length) {
  const db = memoryDb();
  await migrate(db);
  const profile = await createProfile(db, { alias: 'Ana' });
  mockApp = { db, profile };
  mockFile = { text: jest.fn().mockResolvedValue(csv) };
  Picker.getDocumentAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///x.csv', name: 'sesiones.csv', size }] });
  return { db, profile };
}

it('muestra la vista previa (nuevas, ignoradas, no reconocidas) y no guarda hasta confirmar; luego avisa', async () => {
  const csv = [HEADER, '2026-11-18,Empuje,Press de banca plano,Con barra,1,60,10,2,', '2026-11-18,Empuje,Press de banca plano,Con barra,2,62.5,8,,dolor', '2026-11-18,Empuje,Cosa rara,X,1,5,5,,'].join('\n');
  const { db, profile } = await setup(csv);
  await render(<DataScreen />);
  await fireEvent.press(screen.getByText('Elegir archivo CSV'));
  expect(await screen.findByText('1 sesión nueva con 2 series.')).toBeTruthy();
  expect(screen.getByText('1 fila se ignora.')).toBeTruthy();
  expect(screen.getByText('Ejercicios no reconocidos: Cosa rara / X.')).toBeTruthy();
  expect(await loadFinishedWorkouts(db, profile.id, 10)).toEqual([]);
  await fireEvent.press(screen.getByText('Importar 1 sesión'));
  expect(await screen.findByText('Importadas 1 sesión (2 series).')).toBeTruthy();
  expect(await loadFinishedWorkouts(db, profile.id, 10)).toHaveLength(1);
  await fireEvent.press(screen.getByText('Elegir archivo CSV'));
  expect(await screen.findByText('1 sesión ya existe y se omite.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'No hay nada nuevo que importar' }).props.accessibilityState?.disabled).toBe(true);
});

it('un archivo inválido o gigante se rechaza con un mensaje y no ofrece importar; cancelar el selector no hace nada', async () => {
  await setup('esto no es un csv');
  await render(<DataScreen />);
  await fireEvent.press(screen.getByText('Elegir archivo CSV'));
  expect(await screen.findByText(/No es un CSV de sesiones de ForgeFit/)).toBeTruthy();
  expect(screen.queryByText('Cancelar')).toBeNull();
  await setup('x', 100_000_000);
  await fireEvent.press(screen.getByText('Elegir archivo CSV'));
  expect(await screen.findByText('El archivo es demasiado grande.')).toBeTruthy();
  expect(mockFile.text).not.toHaveBeenCalled();
  Picker.getDocumentAsync.mockResolvedValue({ canceled: true });
  await fireEvent.press(screen.getByText('Elegir archivo CSV'));
  expect(screen.queryByText('Cancelar')).toBeNull();
});
