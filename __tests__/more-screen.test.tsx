import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import MoreScreen from '../src/app/(tabs)/more';
import { migrate } from '../src/db';
import { saveActivePlan } from '../src/db/plans';
import { createProfile } from '../src/db/profiles';
import { ensureHorizon } from '../src/db/schedule';
import { finishWorkout, recordEvent, startWorkout } from '../src/db/workouts';
import { toDateKey } from '../src/lib/schedule';
import { memoryDb } from '../test-utils/sqlite';

let mockApp: unknown;
const mockShare = jest.fn();
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../src/features/AppContext', () => ({ useApp: () => mockApp }));
jest.mock('../src/lib/shareFile', () => ({ shareTextFile: (...a: unknown[]) => mockShare(...a) }));

beforeEach(() => mockShare.mockReset());

async function setup(withWorkout: boolean) {
  const db = memoryDb();
  await migrate(db);
  const profile = await createProfile(db, { alias: 'Ana' });
  const bench = { exerciseVariantId: 'bench_press.barbell', sets: 1, repRange: [6, 10] as [number, number], restSeconds: 60 };
  await saveActivePlan(db, profile.id, { schemaVersion: 1, mode: 'local', sessions: Array.from({ length: 7 }, (_, day) => ({ day, name: `D${day}`, blocks: [{ type: 'single' as const, items: [bench] }] })) }, null);
  await ensureHorizon(db, profile.id, toDateKey());
  if (withWorkout) {
    const id = await startWorkout(db, profile.id, toDateKey());
    await recordEvent(db, id, { type: 'set_done', block: 0, item: 0, round: 0, weightKg: 60, reps: 10 });
    await finishWorkout(db, id);
  }
  mockApp = { db, profile };
}

it('exporta las sesiones terminadas como CSV compartido', async () => {
  await setup(true);
  mockShare.mockResolvedValue(true);
  await render(<MoreScreen />);
  await fireEvent.press(screen.getByText('Exportar sesiones (CSV)'));
  await waitFor(() => expect(mockShare).toHaveBeenCalled());
  const [name, csv, mime] = mockShare.mock.calls[0];
  expect(name).toBe(`forgefit-sesiones-${toDateKey()}.csv`);
  expect(mime).toBe('text/csv');
  expect(csv).toContain(`${toDateKey()},`);
  expect(csv).toContain('Press de banca plano,Con barra,1,60,10,');
});

it('sin sesiones terminadas avisa y no comparte', async () => {
  await setup(false);
  await render(<MoreScreen />);
  await fireEvent.press(screen.getByText('Exportar sesiones (CSV)'));
  expect(await screen.findByText('Aún no hay sesiones terminadas que exportar.')).toBeTruthy();
  expect(mockShare).not.toHaveBeenCalled();
});

it('si el dispositivo no puede compartir o falla la exportación, lo dice', async () => {
  await setup(true);
  mockShare.mockResolvedValueOnce(false);
  await render(<MoreScreen />);
  await fireEvent.press(screen.getByText('Exportar sesiones (CSV)'));
  expect(await screen.findByText('Este dispositivo no puede compartir archivos.')).toBeTruthy();

  mockShare.mockRejectedValueOnce(new Error('x'));
  await fireEvent.press(screen.getByText('Exportar sesiones (CSV)'));
  expect(await screen.findByText('No se pudieron exportar las sesiones.')).toBeTruthy();
});
