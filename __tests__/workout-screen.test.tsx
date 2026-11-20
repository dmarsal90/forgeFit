import { fireEvent, render, screen } from '@testing-library/react-native';
import WorkoutScreen from '../src/app/workout/[id]';
import { migrate } from '../src/db';
import { saveActivePlan } from '../src/db/plans';
import { createProfile } from '../src/db/profiles';
import { ensureHorizon } from '../src/db/schedule';
import { loadWorkout, startWorkout } from '../src/db/workouts';
import type { Plan } from '../src/lib/plan';
import { toDateKey } from '../src/lib/schedule';
import { memoryDb } from '../test-utils/sqlite';

let mockApp: unknown;
jest.mock('expo-router', () => ({ router: { replace: jest.fn() }, useLocalSearchParams: () => ({ id: mockId }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../src/features/AppContext', () => ({ useApp: () => mockApp }));
let mockId = '';

const item = (id: string, sets: number) => ({ exerciseVariantId: id, sets, repRange: [8, 12] as [number, number], restSeconds: 60 });
const plan: Plan = { schemaVersion: 1, mode: 'local', sessions: Array.from({ length: 7 }, (_, day) => ({ day, name: 'Pecho', blocks: [{ type: 'superset' as const, items: [item('pushup.floor', 2), item('pushup.floor', 2)] }] })) };

it('biserie: completa A1 y A2, descansa, corrige una serie y termina la sesión', async () => {
  const db = memoryDb();
  await migrate(db);
  const profile = await createProfile(db, { alias: 'Ana' });
  await saveActivePlan(db, profile.id, plan, null);
  await ensureHorizon(db, profile.id, toDateKey());
  mockApp = { db, profile };
  mockId = await startWorkout(db, profile.id, toDateKey());

  await render(<WorkoutScreen />);
  expect(await screen.findByText(/Biserie · A1 · ronda 1/)).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Peso (kg)'), '20');
  await fireEvent.changeText(screen.getByLabelText('Repeticiones'), '10');
  await fireEvent.press(screen.getByRole('button', { name: /Completar serie/ }));
  expect(await screen.findByText(/Biserie · A2 · ronda 1/)).toBeTruthy();
  expect(screen.queryByText(/Descanso/)).toBeNull(); // sin descanso entre A1 y A2
  await fireEvent.changeText(screen.getByLabelText('Repeticiones'), '9');
  await fireEvent.press(screen.getByRole('button', { name: /Completar serie/ }));
  expect(await screen.findByText(/Descanso/)).toBeTruthy(); // la ronda 1 terminó
  for (let i = 0; i < 2; i++) { // ronda 2: A1 y A2
    await fireEvent.changeText(screen.getByLabelText('Repeticiones'), '8');
    await fireEvent.press(screen.getByRole('button', { name: /Completar serie/ }));
  }
  expect(await screen.findByText('Completaste todas las series')).toBeTruthy();

  await fireEvent.press(screen.getAllByRole('button', { name: /Corregir/ })[0]);
  await fireEvent.changeText(screen.getByLabelText('Repeticiones'), '12');
  await fireEvent.press(screen.getByRole('button', { name: /Guardar corrección/ }));
  expect(await screen.findByText(/× 12 \(corregida\)/)).toBeTruthy();

  await fireEvent.press(screen.getByRole('button', { name: /Terminar sesión/ }));
  expect(await screen.findByText('Sesión terminada')).toBeTruthy();
  expect((await loadWorkout(db, mockId))?.status).toBe('finished');
});

it('pide repeticiones antes de completar una serie', async () => {
  const db = memoryDb();
  await migrate(db);
  const profile = await createProfile(db, { alias: 'Ana' });
  await saveActivePlan(db, profile.id, plan, null);
  await ensureHorizon(db, profile.id, toDateKey());
  mockApp = { db, profile };
  mockId = await startWorkout(db, profile.id, toDateKey());
  await render(<WorkoutScreen />);
  await fireEvent.press(await screen.findByRole('button', { name: /Completar serie/ }));
  expect(await screen.findByText('Indica las repeticiones (0–200).')).toBeTruthy();
});

it('con el perfil en libras pide y muestra libras, pero guarda kilos', async () => {
  const db = memoryDb();
  await migrate(db);
  const profile = await createProfile(db, { alias: 'Ana', weightUnit: 'lb' });
  await saveActivePlan(db, profile.id, plan, null);
  await ensureHorizon(db, profile.id, toDateKey());
  mockApp = { db, profile };
  mockId = await startWorkout(db, profile.id, toDateKey());

  await render(<WorkoutScreen />);
  await fireEvent.changeText(await screen.findByLabelText('Peso (lb)'), '135');
  await fireEvent.changeText(screen.getByLabelText('Repeticiones'), '10');
  await fireEvent.press(screen.getByRole('button', { name: /Completar serie/ }));
  expect(await screen.findByText(/135 lb × 10/)).toBeTruthy();
  const done = (await loadWorkout(db, mockId))!.events.map((e) => e.event).find((e) => e.type === 'set_done');
  expect(done && 'weightKg' in done && done.weightKg).toBeCloseTo(61.235, 2);
});

it('marcar molestia o dolor en una serie lo guarda solo para esa serie y se puede quitar', async () => {
  const db = memoryDb();
  await migrate(db);
  const profile = await createProfile(db, { alias: 'Ana' });
  await saveActivePlan(db, profile.id, plan, null);
  await ensureHorizon(db, profile.id, toDateKey());
  mockApp = { db, profile };
  mockId = await startWorkout(db, profile.id, toDateKey());
  await render(<WorkoutScreen />);

  await fireEvent.changeText(await screen.findByLabelText('Repeticiones'), '10');
  await fireEvent.press(screen.getByText('Dolor'));
  await fireEvent.press(screen.getByRole('button', { name: /Completar serie/ })); // A1: dolor
  await fireEvent.changeText(await screen.findByLabelText('Repeticiones'), '9');
  await fireEvent.press(screen.getByText('Molestia'));
  await fireEvent.press(screen.getByText('Molestia')); // pulsar otra vez la quita
  await fireEvent.press(screen.getByRole('button', { name: /Completar serie/ })); // A2: nada
  await fireEvent.changeText(await screen.findByLabelText('Repeticiones'), '8');
  await fireEvent.press(screen.getByRole('button', { name: /Completar serie/ })); // A1 ronda 2: la marca no se arrastra

  const done = (await loadWorkout(db, mockId))!.state.done;
  expect(done['0.0.0'].pain).toBe('pain');
  expect(done['0.1.0'].pain).toBeUndefined();
  expect(done['0.0.1'].pain).toBeUndefined();
});
